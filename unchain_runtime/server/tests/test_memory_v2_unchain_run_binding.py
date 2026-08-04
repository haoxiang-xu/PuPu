from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

import pytest

from memory_v2_unchain_atomic_bootstrap import (
    prepare_pupu_unchain_atomic_bootstrap,
)
from memory_v2_unchain_admission_adapter import PupuUnchainAdmissionAuthority
from memory_v2_unchain_run_binding import (
    PupuMemoryV2InteractionInputDraft,
    PupuMemoryV2RunBindingError,
    PupuMemoryV2TextInputDraft,
    _sanitize_event_payload,
    build_active_host_factory,
    build_shadow_host_factory,
)
from unchain.agent.modules import ContextModule
from unchain.agent.modules.memory_v2 import MemoryV2AgentModule
from memory_v2_unchain_shadow_input import persist_shadow_input_attachments
from unchain.context import (
    HostResolvedAttachment,
    HostResolvedCurrentInput,
    HostResolvedInteractionInput,
)
from unchain.journal import AttemptRef, GenerationRef
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.persistence.sqlite_generation_lifecycle_v2 import (
    HostGenerationTransition,
    HostGenerationTransitionKind,
    HostGenerationTransitionRequest,
    SQLiteHostGenerationLifecycleV2,
    build_host_generation_transition_operation,
)
from unchain.persistence.sqlite_generation_rebase_v2 import (
    GenerationRebaseIntent,
    GenerationRebaseKind,
    GenerationRebasePreflight,
    GenerationRebaseRequest,
    GenerationSnapshotMessage,
    SQLiteGenerationRebaseV2Service,
    build_generation_rebase_operation,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from unchain.run_identity import MemoryV2RunRole


def _context(*, execution_id: str, run_id: str) -> HarnessContext:
    state = RunState()
    state.session_state.session_id = execution_id
    return HarnessContext(
        state=state,
        phase="bootstrap",
        event={"run_id": run_id},
    )


class _NeverRunOfficialMemoryAgent:
    def run(self, request, *, toolkit, binding):
        del request, toolkit, binding
        raise AssertionError("Memory Agent worker is outside this binding test")


def _build(
    root: Path,
    *,
    current_input_draft=PupuMemoryV2TextInputDraft(content="hello"),
):
    return build_shadow_host_factory(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        session_id="session-a",
        attempt_id="root-run-a",
        run_id="root-run-a",
        root_run_id="root-run-a",
        role=MemoryV2RunRole.ROOT,
        source_attempt_id="",
        current_input_draft=current_input_draft,
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )


def _atomic_bootstrap(
    root: Path,
    *,
    owner_chat_id: str,
    session_id: str,
    execution_id: str,
):
    return prepare_pupu_unchain_atomic_bootstrap(
        root_dir=root,
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        execution_id=execution_id,
        history=(),
        no_unfinished_durable_checkpoint=True,
        no_pending_interaction=True,
    )


def _generation_row(database_path: Path) -> tuple[str, int]:
    connection = sqlite3.connect(database_path)
    try:
        row = connection.execute(
            "SELECT current_generation_id, revision "
            "FROM host_generation_heads WHERE owner_chat_id = 'chat-a'"
        ).fetchone()
        assert row is not None
        return str(row[0]), int(row[1])
    finally:
        connection.close()


def test_first_chat_gets_deterministic_generation_and_exact_attempt_binding(
    tmp_path: Path,
) -> None:
    prepared = _build(tmp_path)

    assert prepared.host_factory.owner_chat_id == "chat-a"
    assert prepared.host_factory.root_run_id == "root-run-a"
    assert prepared.binding.role is MemoryV2RunRole.ROOT
    assert prepared.binding.run_id == prepared.binding.attempt_id == "root-run-a"
    assert prepared.binding.generation_id.startswith("generation-")
    assert _generation_row(prepared.host_factory.database_path) == (
        prepared.binding.generation_id,
        1,
    )

    connection = sqlite3.connect(prepared.host_factory.database_path)
    try:
        attempt = connection.execute(
            "SELECT generation_id, head_revision, operation_id "
            "FROM host_generation_attempt_bindings "
            "WHERE execution_id = ? AND attempt_id = ?",
            ("execution-a", "root-run-a"),
        ).fetchone()
    finally:
        connection.close()
    assert attempt is not None
    assert attempt[0:2] == (prepared.binding.generation_id, 1)
    assert str(attempt[2]).startswith("bind-current-attempt-")


def test_active_host_requires_explicit_builder_and_mounts_canonical_owner(
    tmp_path: Path,
) -> None:
    atomic_bootstrap = _atomic_bootstrap(
        tmp_path,
        owner_chat_id="chat-active",
        session_id="session-active",
        execution_id="execution-active",
    )
    prepared = build_active_host_factory(
        atomic_bootstrap=atomic_bootstrap,
        owner_chat_id="chat-active",
        execution_id="execution-active",
        session_id="session-active",
        attempt_id="root-active",
        run_id="root-active",
        root_run_id="root-active",
        role=MemoryV2RunRole.ROOT,
        source_attempt_id="",
        current_input_draft=PupuMemoryV2TextInputDraft(content="hello"),
        database_path=tmp_path / "context_v2.sqlite3",
        object_directory=tmp_path / "objects",
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )

    assert prepared.host_factory.production_enabled is True
    assert prepared.host_factory.modules_for_active() == (
        prepared.host_factory.context_module,
        prepared.host_factory.task_state_bootstrap_module,
    )
    assert type(prepared.host_factory.context_module) is ContextModule


def test_active_builder_rejects_missing_atomic_receipt_before_split_lifecycle(
    tmp_path: Path,
) -> None:
    with pytest.raises(TypeError, match="PupuUnchainAtomicBootstrap"):
        build_active_host_factory(
            atomic_bootstrap=None,
            owner_chat_id="chat-active",
            execution_id="execution-active",
            session_id="session-active",
            attempt_id="root-active",
            run_id="root-active",
            root_run_id="root-active",
            role=MemoryV2RunRole.ROOT,
            source_attempt_id="",
            current_input_draft=PupuMemoryV2TextInputDraft(content="hello"),
            database_path=tmp_path / "context_v2.sqlite3",
            object_directory=tmp_path / "objects",
            model_window_fallback=lambda provider, model: 16_384,
            partial_attempt_sink=lambda value, error: None,
        )

    assert not (tmp_path / "context_v2.sqlite3").exists()


def test_active_binding_uses_latest_head_not_initial_bootstrap_receipt(
    tmp_path: Path,
) -> None:
    atomic_bootstrap = _atomic_bootstrap(
        tmp_path,
        owner_chat_id="chat-active",
        session_id="session-active",
        execution_id="execution-active",
    )
    authority = PupuUnchainAdmissionAuthority(
        owner_chat_id="chat-active",
        database_path=atomic_bootstrap.database_path,
        object_directory=atomic_bootstrap.object_directory,
    )
    admission = authority.resolve_chat_admission(
        owner_chat_id="chat-active",
        session_id="session-active",
        requested_rollout_mode="all",
        effective_rollout_mode="all",
        cohort="all_active",
        target_mode="active",
        decision_reason="binding_current_head_test",
        canary_selected=False,
        canary_percent=100,
        canary_bucket=0,
        hash_strategy="test",
        provenance={"source": "binding_current_head_test"},
        operation_id="admit-binding-current-head-test",
    )
    authority.mark_chat_bootstrap(
        owner_chat_id="chat-active",
        admission_id=admission["admission_id"],
        expected_revision=admission["revision"],
        succeeded=True,
        provenance=atomic_bootstrap.provenance(
            runtime_attempt_id="runtime-before-edit"
        ),
        error_code="",
        operation_id="mark-binding-current-head-test",
    )
    service = SQLiteGenerationRebaseV2Service(
        SQLiteContextV2Store(
            database_path=atomic_bootstrap.database_path,
            object_directory=atomic_bootstrap.object_directory,
        )
    )
    edit_intent = GenerationRebaseIntent(
        owner_chat_id="chat-active",
        session_id="session-active",
        execution_id="execution-active",
        generation_id="generation-after-edit",
        attempt_id="edit-attempt",
        kind=GenerationRebaseKind.EDIT,
        previous_generation_id=(
            atomic_bootstrap.current_head.current_generation_id
        ),
        expected_head_revision=atomic_bootstrap.current_head.revision,
        source_revision="source-after-edit",
        messages=(
            GenerationSnapshotMessage(
                "message-after-edit",
                "user",
                "edited objective",
            ),
        ),
        preflight=GenerationRebasePreflight("edit-preflight", True),
    )
    edited = service.rebase(
        GenerationRebaseRequest(
            intent=edit_intent,
            operation=build_generation_rebase_operation(
                operation_id="edit-binding-current-head-test",
                intent=edit_intent,
            ),
        )
    )
    reopened = _atomic_bootstrap(
        tmp_path,
        owner_chat_id="chat-active",
        session_id="session-active",
        execution_id="execution-active",
    )

    prepared = build_active_host_factory(
        atomic_bootstrap=reopened,
        owner_chat_id="chat-active",
        execution_id="execution-active",
        session_id="session-active",
        attempt_id="runtime-after-edit",
        run_id="runtime-after-edit",
        root_run_id="runtime-after-edit",
        role=MemoryV2RunRole.ROOT,
        source_attempt_id="",
        current_input_draft=PupuMemoryV2TextInputDraft(content="continue"),
        database_path=tmp_path / "context_v2.sqlite3",
        object_directory=tmp_path / "objects",
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )

    assert reopened.bootstrap_receipt.generation_id != edited.generation_id
    assert prepared.binding.generation_id == edited.generation_id
    assert prepared.binding.head_revision == edited.head_revision


def test_active_builder_explicitly_propagates_official_memory_agent_gate(
    tmp_path: Path,
) -> None:
    invoker = _NeverRunOfficialMemoryAgent()
    atomic_bootstrap = _atomic_bootstrap(
        tmp_path,
        owner_chat_id="chat-active-memory",
        session_id="session-active-memory",
        execution_id="execution-active-memory",
    )
    prepared = build_active_host_factory(
        atomic_bootstrap=atomic_bootstrap,
        owner_chat_id="chat-active-memory",
        execution_id="execution-active-memory",
        session_id="session-active-memory",
        attempt_id="root-active-memory",
        run_id="root-active-memory",
        root_run_id="root-active-memory",
        role=MemoryV2RunRole.ROOT,
        source_attempt_id="",
        current_input_draft=PupuMemoryV2TextInputDraft(content="hello"),
        database_path=tmp_path / "context_v2.sqlite3",
        object_directory=tmp_path / "objects",
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
        memory_agent_enabled=True,
        memory_agent_model_invoker=invoker,
    )

    assert prepared.host_factory.memory_agent_enabled is True
    assert prepared.host_factory.modules_for_active() == (
        prepared.host_factory.context_module,
        prepared.host_factory.task_state_bootstrap_module,
        prepared.host_factory.memory_module,
        prepared.host_factory.memory_worker_module,
    )
    assert type(prepared.host_factory.memory_module) is MemoryV2AgentModule


def test_active_builder_memory_agent_gate_fails_closed_without_invoker(
    tmp_path: Path,
) -> None:
    atomic_bootstrap = _atomic_bootstrap(
        tmp_path,
        owner_chat_id="chat-active-memory",
        session_id="session-active-memory",
        execution_id="execution-active-memory",
    )
    with pytest.raises(PupuMemoryV2RunBindingError, match="model_invoker"):
        build_active_host_factory(
            atomic_bootstrap=atomic_bootstrap,
            owner_chat_id="chat-active-memory",
            execution_id="execution-active-memory",
            session_id="session-active-memory",
            attempt_id="root-active-memory",
            run_id="root-active-memory",
            root_run_id="root-active-memory",
            role=MemoryV2RunRole.ROOT,
            source_attempt_id="",
            current_input_draft=PupuMemoryV2TextInputDraft(content="hello"),
            database_path=tmp_path / "context_v2.sqlite3",
            object_directory=tmp_path / "objects",
            model_window_fallback=lambda provider, model: 16_384,
            partial_attempt_sink=lambda value, error: None,
            memory_agent_enabled=True,
        )


def test_same_registration_is_idempotent_in_process_and_after_cold_restart(
    tmp_path: Path,
) -> None:
    first = _build(tmp_path)
    same = first.registry.register_attempt(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        session_id="session-a",
        attempt_id="root-run-a",
        run_id="root-run-a",
        root_run_id="root-run-a",
        role=MemoryV2RunRole.ROOT,
        source_attempt_id="",
        current_input_draft=PupuMemoryV2TextInputDraft(content="hello"),
    )
    reopened = _build(tmp_path)

    assert same == first.binding
    assert reopened.binding == first.binding
    connection = sqlite3.connect(first.host_factory.database_path)
    try:
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM host_generation_records"
            ).fetchone()[0]
            == 1
        )
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM host_generation_attempt_bindings"
            ).fetchone()[0]
            == 1
        )
    finally:
        connection.close()


def test_same_attempt_rejects_identity_drift_across_restart(
    tmp_path: Path,
) -> None:
    _build(tmp_path)

    with pytest.raises(PupuMemoryV2RunBindingError, match="identity drift"):
        build_shadow_host_factory(
            owner_chat_id="chat-a",
            execution_id="execution-a",
            session_id="session-a",
            attempt_id="root-run-a",
            run_id="root-run-a",
            root_run_id="root-run-a",
            role=MemoryV2RunRole.ROOT,
            source_attempt_id="",
            current_input_draft=PupuMemoryV2TextInputDraft(content="changed"),
            database_path=tmp_path / "context_v2.sqlite3",
            object_directory=tmp_path / "objects",
            model_window_fallback=lambda provider, model: 16_384,
            partial_attempt_sink=lambda value, error: None,
        )


def test_attachment_only_input_is_preserved_by_binding_and_resolver(
    tmp_path: Path,
) -> None:
    attachments = persist_shadow_input_attachments(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        attachment_blocks=(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": "iVBORw0KGgoAAAANSUhEUg==",
                },
            },
        ),
        database_path=tmp_path / "context_v2.sqlite3",
        object_directory=tmp_path / "objects",
    )
    prepared = _build(
        tmp_path,
        current_input_draft=PupuMemoryV2TextInputDraft(
            content="",
            attachments=attachments,
        ),
    )
    context = _context(execution_id="execution-a", run_id="root-run-a")
    attempt = AttemptRef(
        GenerationRef("execution-a", prepared.binding.generation_id),
        "root-run-a",
    )

    resolved = prepared.registry.current_input_resolver(context, attempt)

    assert isinstance(resolved, HostResolvedCurrentInput)
    assert resolved.content == ""
    assert resolved.attachments == attachments
    assert prepared.binding.current_input_draft.canonical_value()["attachments"] == [
        attachment.to_dict() for attachment in attachments
    ]


def test_attachment_ref_identity_drift_fails_closed_after_restart(
    tmp_path: Path,
) -> None:
    first_attachments = persist_shadow_input_attachments(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        attachment_blocks=(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": "iVBORw0KGgoAAAANSUhEUg==",
                },
            },
        ),
        database_path=tmp_path / "context_v2.sqlite3",
        object_directory=tmp_path / "objects",
    )
    _build(
        tmp_path,
        current_input_draft=PupuMemoryV2TextInputDraft(
            content="",
            attachments=first_attachments,
        ),
    )
    changed_attachments = persist_shadow_input_attachments(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        attachment_blocks=(
            {
                "type": "pdf",
                "source": {
                    "type": "file_id",
                    "file_id": "provider-file-a",
                },
            },
        ),
        database_path=tmp_path / "context_v2.sqlite3",
        object_directory=tmp_path / "objects",
    )

    assert all(
        isinstance(attachment, HostResolvedAttachment)
        for attachment in changed_attachments
    )
    with pytest.raises(PupuMemoryV2RunBindingError, match="identity drift"):
        _build(
            tmp_path,
            current_input_draft=PupuMemoryV2TextInputDraft(
                content="",
                attachments=changed_attachments,
            ),
        )


def test_generation_resolver_binds_root_child_and_graph_to_one_current_head(
    tmp_path: Path,
) -> None:
    prepared = _build(tmp_path)
    child = prepared.registry.register_attempt(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        session_id="session-a",
        attempt_id="child-run-a",
        run_id="child-run-a",
        root_run_id="root-run-a",
        role=MemoryV2RunRole.SUBAGENT,
        source_attempt_id="root-run-a",
        current_input_draft=None,
    )
    step = prepared.registry.register_attempt(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        session_id="session-a",
        attempt_id="graph-step-a",
        run_id="graph-step-a",
        root_run_id="root-run-a",
        role=MemoryV2RunRole.GRAPH_STEP,
        source_attempt_id="root-run-a",
        current_input_draft=None,
    )

    for binding in (prepared.binding, child, step):
        context = _context(execution_id="execution-a", run_id=binding.run_id)
        assert (
            prepared.registry.generation_resolver(context, "execution-a")
            == prepared.binding.generation_id
        )
        attempt = AttemptRef(
            GenerationRef("execution-a", prepared.binding.generation_id),
            binding.attempt_id,
        )
        resolved = prepared.registry.current_input_resolver(context, attempt)
        if binding.role is MemoryV2RunRole.ROOT:
            assert isinstance(resolved, HostResolvedCurrentInput)
            assert resolved.content == "hello"
        else:
            assert resolved is None


def test_interaction_input_is_only_resolved_for_the_exact_registered_root(
    tmp_path: Path,
) -> None:
    prepared = _build(
        tmp_path,
        current_input_draft=PupuMemoryV2InteractionInputDraft(
            interaction_id="interaction-a",
            response={"choice": "approved"},
            submitted_by="user",
        ),
    )
    context = _context(execution_id="execution-a", run_id="root-run-a")
    attempt = AttemptRef(
        GenerationRef("execution-a", prepared.binding.generation_id),
        "root-run-a",
    )

    resolved = prepared.registry.current_input_resolver(context, attempt)

    assert isinstance(resolved, HostResolvedInteractionInput)
    assert resolved.interaction_id == "interaction-a"
    assert dict(resolved.response) == {"choice": "approved"}
    unknown = AttemptRef(
        GenerationRef("execution-a", prepared.binding.generation_id),
        "unknown-run",
    )
    assert prepared.registry.current_input_resolver(context, unknown) is None


def test_existing_attempt_fails_closed_after_current_head_advances(
    tmp_path: Path,
) -> None:
    prepared = _build(tmp_path)
    lifecycle = SQLiteHostGenerationLifecycleV2(prepared.host_factory.context_store)
    transition = HostGenerationTransition(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        session_id="session-a",
        generation_id="generation-next",
        kind=HostGenerationTransitionKind.REGENERATE,
        previous_generation_id=prepared.binding.generation_id,
        expected_revision=prepared.binding.head_revision,
    )
    lifecycle.advance(
        HostGenerationTransitionRequest(
            transition=transition,
            operation=build_host_generation_transition_operation(
                operation_id="advance-generation-a",
                transition=transition,
            ),
        )
    )

    with pytest.raises(PupuMemoryV2RunBindingError, match="current generation"):
        prepared.registry.generation_resolver(
            _context(execution_id="execution-a", run_id="root-run-a"),
            "execution-a",
        )


def test_shadow_factory_uses_production_storage_sanitizer(tmp_path: Path) -> None:
    raw_secret = "sk-proj-abcdefghijklmnopqrstuvwxyz"
    prepared = _build(
        tmp_path,
        current_input_draft=PupuMemoryV2TextInputDraft(content=f"token={raw_secret}"),
    )

    prepared.host_factory.context_module.runtime.bind_context(
        _context(execution_id="execution-a", run_id="root-run-a")
    )

    stored = b"\n".join(
        path.read_bytes()
        for path in prepared.host_factory.object_directory.iterdir()
        if path.is_file()
    )
    assert raw_secret.encode("utf-8") not in stored
    assert b"[REDACTED]" in stored


def test_user_message_preserves_canonical_handle_without_weakening_redaction(
    tmp_path: Path,
) -> None:
    handle = "pvh1_" + ("a" * 64)
    raw_handle = "pvh1_" + ("b" * 64)
    marker = f'<secret-handle label="API key" handle="{handle}"/>'
    raw_secret = "sk-proj-abcdefghijklmnopqrstuvwxyz"
    prepared = _build(
        tmp_path,
        current_input_draft=PupuMemoryV2TextInputDraft(
            content=(
                f"Use {marker}; raw handle {raw_handle}; "
                f"token={raw_secret}"
            )
        ),
    )

    sanitized_input = prepared.binding.current_input_draft
    assert isinstance(sanitized_input, PupuMemoryV2TextInputDraft)
    assert marker in sanitized_input.content
    assert raw_handle not in sanitized_input.content
    assert raw_secret not in sanitized_input.content
    assert "[VAULT_HANDLE]" in sanitized_input.content
    assert "[REDACTED]" in sanitized_input.content

    prepared.host_factory.context_module.runtime.bind_context(
        _context(execution_id="execution-a", run_id="root-run-a")
    )
    events = prepared.host_factory.attempt(
        execution_id="execution-a",
        attempt_id="root-run-a",
    ).bundle.journal.capture_snapshot().events
    user_event = next(event for event in events if event.event_type == "message.user")
    assert marker in user_event.payload["message"]["content"]
    assert raw_handle not in str(user_event.to_dict())
    assert raw_secret not in str(user_event.to_dict())

    stored = b"\n".join(
        path.read_bytes()
        for path in prepared.host_factory.object_directory.iterdir()
        if path.is_file()
    )
    assert handle.encode("utf-8") in stored
    assert raw_handle.encode("utf-8") not in stored
    assert raw_secret.encode("utf-8") not in stored

    user_payload = _sanitize_event_payload(
        "message.user",
        {
            "message": {
                "role": "user",
                "content": f"{marker} {raw_handle} {raw_secret}",
            }
        },
    )
    assert marker in user_payload["message"]["content"]
    assert raw_handle not in str(user_payload)
    assert raw_secret not in str(user_payload)

    for event_type in ("run_failed", "tool_result"):
        ordinary_payload = _sanitize_event_payload(
            event_type,
            {"content": f"{marker} {raw_handle} {raw_secret}"},
        )
        assert handle not in str(ordinary_payload)
        assert raw_handle not in str(ordinary_payload)
        assert raw_secret not in str(ordinary_payload)
        assert "[VAULT_HANDLE]" in str(ordinary_payload)
        assert "[REDACTED]" in str(ordinary_payload)


def _install_tombstone(database_path: Path, owner_chat_id: str) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.executescript(
        """
        CREATE TABLE chat_deletion_tombstones (
            owner_chat_id TEXT PRIMARY KEY,
            revision INTEGER NOT NULL,
            first_operation_id TEXT NOT NULL,
            scope_json BLOB NOT NULL,
            scope_sha256 TEXT NOT NULL,
            result_json BLOB NOT NULL,
            result_sha256 TEXT NOT NULL,
            deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE chat_deletion_execution_scopes (
            owner_chat_id TEXT NOT NULL,
            execution_id TEXT NOT NULL UNIQUE,
            PRIMARY KEY(owner_chat_id, execution_id)
        );
        CREATE TABLE chat_deletion_space_scopes (
            owner_chat_id TEXT NOT NULL,
            space_id TEXT NOT NULL UNIQUE,
            PRIMARY KEY(owner_chat_id, space_id)
        );
        CREATE TABLE chat_deletion_binding_scopes (
            owner_chat_id TEXT NOT NULL,
            binding_id TEXT NOT NULL UNIQUE,
            PRIMARY KEY(owner_chat_id, binding_id)
        );
        CREATE TABLE chat_deletion_operations (
            owner_chat_id TEXT NOT NULL,
            operation_id TEXT NOT NULL,
            payload_sha256 TEXT NOT NULL,
            result_sha256 TEXT NOT NULL,
            PRIMARY KEY(owner_chat_id, operation_id)
        );
        """
    )
    scope = {
        "schema": "unchain.chat_deletion_scope.v1",
        "owner_chat_id": owner_chat_id,
        "execution_ids": [],
        "space_ids": [],
        "binding_ids": [],
    }
    receipt = {
        "schema": "unchain.chat_deletion_receipt.v1",
        "owner_chat_id": owner_chat_id,
        "tombstone_revision": 1,
        "deleted_rows": {},
        "pending_unreferenced_scan": True,
    }
    scope_bytes = json.dumps(
        scope, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    receipt_bytes = json.dumps(
        receipt, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    scope_sha256 = hashlib.sha256(scope_bytes).hexdigest()
    receipt_sha256 = hashlib.sha256(receipt_bytes).hexdigest()
    connection.execute(
        "INSERT INTO chat_deletion_tombstones("
        "owner_chat_id, revision, first_operation_id, scope_json, scope_sha256, "
        "result_json, result_sha256) VALUES (?, 1, ?, ?, ?, ?, ?)",
        (
            owner_chat_id,
            "delete-chat-a",
            scope_bytes,
            scope_sha256,
            receipt_bytes,
            receipt_sha256,
        ),
    )
    connection.execute(
        "INSERT INTO chat_deletion_operations("
        "owner_chat_id, operation_id, payload_sha256, result_sha256) "
        "VALUES (?, ?, ?, ?)",
        (owner_chat_id, "delete-chat-a", scope_sha256, receipt_sha256),
    )
    connection.commit()
    connection.close()


def test_tombstoned_chat_fails_before_generation_schema_or_binding_write(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "context_v2.sqlite3"
    _install_tombstone(database_path, "chat-a")

    with pytest.raises(PupuMemoryV2RunBindingError, match="deleted"):
        _build(tmp_path)

    connection = sqlite3.connect(database_path)
    try:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    finally:
        connection.close()
    assert "host_generation_records" not in tables
    assert "host_generation_attempt_bindings" not in tables


def test_unknown_subagent_bootstrap_gets_generation_only_binding_and_no_input(
    tmp_path: Path,
) -> None:
    prepared = _build(tmp_path)

    with pytest.raises((TypeError, ValueError)):
        prepared.registry.register_attempt(
            owner_chat_id="chat-a",
            execution_id="execution-a",
            session_id="session-a",
            attempt_id="child-run-a",
            run_id="child-run-a",
            root_run_id="root-run-a",
            role="subagent",
            source_attempt_id="root-run-a",
            current_input_draft=None,
        )
    unknown_context = _context(
        execution_id="execution-a",
        run_id="dynamic-child-run",
    )
    generation_id = prepared.registry.generation_resolver(
        unknown_context,
        "execution-a",
    )
    unknown_attempt = AttemptRef(
        GenerationRef("execution-a", generation_id),
        "dynamic-child-run",
    )

    assert generation_id == prepared.binding.generation_id
    assert (
        prepared.registry.current_input_resolver(unknown_context, unknown_attempt)
        is None
    )
    connection = sqlite3.connect(prepared.host_factory.database_path)
    try:
        row = connection.execute(
            "SELECT generation_id, head_revision FROM "
            "host_generation_attempt_bindings "
            "WHERE execution_id = ? AND attempt_id = ?",
            ("execution-a", "dynamic-child-run"),
        ).fetchone()
    finally:
        connection.close()
    assert row == (prepared.binding.generation_id, prepared.binding.head_revision)

    with pytest.raises(PupuMemoryV2RunBindingError, match="execution"):
        prepared.registry.generation_resolver(unknown_context, "foreign-execution")
