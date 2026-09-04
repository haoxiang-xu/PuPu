from __future__ import annotations

import hashlib
import json
import subprocess
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path
from unittest import mock

import pytest

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_admission_adapter import PupuUnchainAdmissionAuthority
from memory_v2_unchain_atomic_bootstrap import (
    ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA,
)
from memory_v2_unchain_generation_api import (
    CONTEXT_V2_REBASE_CODE_PROJECTIONS,
    CONTEXT_V2_REBASE_ERROR_CODES,
    CONTEXT_V2_REBASE_MAPPING_CODES,
    MemoryV2UnchainGenerationAPIError,
    open_pupu_unchain_generation_api,
)
from memory_v2_unchain_graph_recovery import (
    GenerationRebaseRecoveryObservation,
    reset_generation_rebase_recovery_attempts,
)
from unchain.context import ArtifactService
from unchain.context.derived_handoff import DerivedHandoffInputIngress
from unchain.context.graph_checkpoint import (
    GraphCheckpointService,
    GraphExecutionPlan,
    GraphStepBinding,
    GraphTerminalStatus,
    JournalGraphCheckpointRepository,
)
from unchain.context.handoff import DurableHandoffRecorder, HandoffService
from unchain.context.ingress import ContextInputIngress, HostResolvedCurrentInput
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.journal import (
    AttemptRef,
    DurableEventSink,
    EventRange,
    GenerationRef,
    OperationRef,
    SemanticEventDraft,
)
from unchain.persistence.sqlite_context_compiler_v2 import (
    SQLiteContextCompilerV2Store,
)
from unchain.persistence.sqlite_generation_rebase_v2 import (
    GenerationRebaseConflict,
    GenerationRebaseFailureReason,
    GenerationRebaseIntent,
    GenerationRebaseJournalIncompatible,
    GenerationRebaseKind,
    GenerationRebasePreflight,
    GenerationRebasePreflightBlocked,
    GenerationRebaseRecoveryRequired,
    GenerationRebaseRequest,
    GenerationRebaseUnavailable,
    GenerationSnapshotMessage,
    SQLiteGenerationRebaseV2Service,
    build_generation_rebase_operation,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


@dataclass(frozen=True)
class _GenerationSetup:
    root_dir: Path
    store: SQLiteContextV2Store
    service: SQLiteGenerationRebaseV2Service
    receipt: object
    owner_chat_id: str
    session_id: str
    execution_id: str


def _setup_generation_api(
    root_dir: Path,
    *,
    owner_chat_id: str = "chat-generation-api",
    session_id: str = "session-generation-api",
    execution_id: str = "execution-generation-api",
    effective_mode: str = "active",
) -> _GenerationSetup:
    store_admission = admit_context_v2_store_owner(
        root_dir=root_dir,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    store = SQLiteContextV2Store(
        database_path=store_admission.database_path,
        object_directory=root_dir / "objects",
    )
    service = SQLiteGenerationRebaseV2Service(store)
    generation_id = f"generation-initial-{owner_chat_id}"
    attempt_id = f"attempt-initial-{owner_chat_id}"
    source_revision = f"source-initial-{owner_chat_id}"
    intent = GenerationRebaseIntent(
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        execution_id=execution_id,
        generation_id=generation_id,
        attempt_id=attempt_id,
        kind=GenerationRebaseKind.CREATE,
        previous_generation_id="",
        expected_head_revision=0,
        source_revision=source_revision,
        messages=(
            GenerationSnapshotMessage(
                message_id=f"message-initial-{owner_chat_id}",
                role="user",
                content="initial prompt",
            ),
        ),
        preflight=GenerationRebasePreflight(
            proof_id=f"preflight-initial-{owner_chat_id}",
            host_snapshot_sanitized=True,
        ),
    )
    receipt = service.rebase(
        GenerationRebaseRequest(
            intent=intent,
            operation=build_generation_rebase_operation(
                operation_id=f"operation-initial-{owner_chat_id}",
                intent=intent,
            ),
        )
    )
    authority = PupuUnchainAdmissionAuthority(
        owner_chat_id=owner_chat_id,
        database_path=store.database_path,
        object_directory=store.object_directory,
    )
    admission = authority.resolve_chat_admission(
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        requested_rollout_mode="all",
        effective_rollout_mode="all",
        cohort="all",
        target_mode="active",
        decision_reason="generation-api-test",
        canary_selected=False,
        canary_percent=100,
        canary_bucket=0,
        hash_strategy="test",
        provenance={"schema": "pupu.test-admission.v1"},
        operation_id=f"admission-operation-{owner_chat_id}",
    )
    provenance = {
        "schema": ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA,
        "owner_chat_id": owner_chat_id,
        "session_id": session_id,
        "execution_id": execution_id,
        "generation_id": generation_id,
        "bootstrap_attempt_id": attempt_id,
        "runtime_attempt_id": f"runtime-initial-{owner_chat_id}",
        "source_revision": source_revision,
        "history_state": "imported",
        "message_count": receipt.message_count,
        "capture_status": "legacy_partial",
        "preflight": {"host_snapshot_sanitized": True},
        "atomic_bootstrap": {
            "manifest_sha256": receipt.manifest_sha256,
            "message_count": receipt.message_count,
            "operation_id": receipt.operation.operation_id,
            "payload_sha256": receipt.operation.payload_sha256,
            "first_cursor": receipt.first_cursor.to_dict(),
            "last_cursor": receipt.last_cursor.to_dict(),
        },
    }
    authority.mark_chat_bootstrap(
        owner_chat_id=owner_chat_id,
        admission_id=admission["admission_id"],
        expected_revision=admission["revision"],
        succeeded=True,
        provenance=provenance,
        error_code="",
        operation_id=f"bootstrap-operation-{owner_chat_id}",
    )
    if effective_mode == "shadow":
        with sqlite3.connect(store.database_path) as connection:
            connection.execute(
                "UPDATE pupu_context_v2_admissions SET effective_mode='shadow' "
                "WHERE owner_chat_id=?",
                (owner_chat_id,),
            )
            connection.commit()
    elif effective_mode != "active":
        raise ValueError("effective_mode must be active or shadow")
    return _GenerationSetup(
        root_dir=root_dir,
        store=store,
        service=service,
        receipt=receipt,
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        execution_id=execution_id,
    )


def _counts(store: SQLiteContextV2Store) -> dict[str, int]:
    with sqlite3.connect(store.database_path) as connection:
        return {
            table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in (
                "events",
                "operations",
                "legacy_bootstrap_manifests",
                "host_generation_records",
                "host_generation_attempt_bindings",
            )
        }


def _rebase(api, setup: _GenerationSetup, **overrides):
    values = {
        "owner_chat_id": setup.owner_chat_id,
        "session_id": setup.session_id,
        "replacement_history": (
            {"role": "user", "content": "edited prompt"},
            {"role": "assistant", "content": "edited answer"},
        ),
        "source_generation_id": setup.receipt.generation_id,
        "expected_session_revision": setup.receipt.head_revision,
        "operation_id": "operation-generation-edit",
        "reason": "edit",
    }
    values.update(overrides)
    return api.rebase_session(**values)


def _recovery_request(
    setup: _GenerationSetup,
    *,
    suffix: str,
) -> GenerationRebaseRequest:
    intent = GenerationRebaseIntent(
        owner_chat_id=setup.owner_chat_id,
        session_id=setup.session_id,
        execution_id=setup.execution_id,
        generation_id=f"generation-recovery-{suffix}",
        attempt_id=f"attempt-recovery-{suffix}",
        kind=GenerationRebaseKind.EDIT,
        previous_generation_id=setup.receipt.generation_id,
        expected_head_revision=setup.receipt.head_revision,
        source_revision=f"source-recovery-{suffix}",
        messages=(
            GenerationSnapshotMessage(
                message_id=f"message-recovery-{suffix}",
                role="user",
                content="edited prompt",
            ),
        ),
        preflight=GenerationRebasePreflight(
            proof_id=f"preflight-recovery-{suffix}",
            host_snapshot_sanitized=True,
        ),
    )
    return GenerationRebaseRequest(
        intent=intent,
        operation=build_generation_rebase_operation(
            operation_id=f"operation-recovery-{suffix}",
            intent=intent,
        ),
    )


def test_cold_open_head_is_owner_bound_and_survives_restart(tmp_path: Path) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")

    first = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    head = first.get_session_head(
        owner_chat_id=setup.owner_chat_id,
        session_id=setup.session_id,
    )
    reopened = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )

    assert head == reopened.get_session_head(
        owner_chat_id=setup.owner_chat_id,
        session_id=setup.session_id,
    )
    assert head["mutation_ready"] is True
    assert head["current_generation_id"] == setup.receipt.generation_id
    assert head["session_revision"] == 1
    with pytest.raises(MemoryV2UnchainGenerationAPIError) as wrong_owner:
        first.get_session_head(
            owner_chat_id="chat-outside-scope",
            session_id=setup.session_id,
        )
    assert wrong_owner.value.code == "context_v2_owner_mismatch"
    with pytest.raises(MemoryV2UnchainGenerationAPIError) as wrong_session:
        first.get_session_head(
            owner_chat_id=setup.owner_chat_id,
            session_id="session-outside-scope",
        )
    assert wrong_session.value.code == "context_v2_session_mismatch"


def test_rebase_is_restart_safe_idempotent_and_supports_empty_history(
    tmp_path: Path,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )

    edited = _rebase(api, setup)
    reopened = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    replay = _rebase(reopened, setup)
    emptied = _rebase(
        reopened,
        setup,
        replacement_history=(),
        source_generation_id=edited["generation_id"],
        expected_session_revision=edited["session_revision"],
        operation_id="operation-generation-delete",
        reason="delete",
    )

    assert edited["session_revision"] == 2
    assert edited["message_event_count"] == 2
    assert edited["event_count"] == 2
    assert edited["reason"] == "edit"
    assert edited["replayed"] is False
    assert replay == {**edited, "replayed": True}
    assert emptied["session_revision"] == 3
    assert emptied["message_event_count"] == 0
    assert emptied["event_count"] == 1
    assert emptied["reason"] == "delete"
    assert emptied["turn_mutation_event_ref"]
    final = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    ).get_session_head(
        owner_chat_id=setup.owner_chat_id,
        session_id=setup.session_id,
    )
    assert final["current_generation_id"] == emptied["generation_id"]
    assert final["session_revision"] == 3


def test_bootstrapped_shadow_head_is_not_ready_but_rebase_is_durable(
    tmp_path: Path,
) -> None:
    setup = _setup_generation_api(
        tmp_path / "memory_v2",
        effective_mode="shadow",
    )
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )

    head = api.get_session_head(
        owner_chat_id=setup.owner_chat_id,
        session_id=setup.session_id,
    )
    edited = _rebase(api, setup)

    assert head["target_mode"] == "active"
    assert head["admission_mode"] == "shadow"
    assert head["v2_bootstrapped"] is True
    assert head["mutation_ready"] is False
    assert edited["session_revision"] == 2
    assert open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    ).get_session_head(
        owner_chat_id=setup.owner_chat_id,
        session_id=setup.session_id,
    )["current_generation_id"] == edited["generation_id"]


def test_resend_maps_to_retry_while_response_preserves_host_reason(
    tmp_path: Path,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )

    response = _rebase(
        api,
        setup,
        operation_id="operation-generation-resend",
        reason="RESEND",
    )
    receipt = setup.service.receipt_for_generation(
        owner_chat_id=setup.owner_chat_id,
        execution_id=setup.execution_id,
        session_id=setup.session_id,
        generation_id=response["generation_id"],
    )

    assert response["reason"] == "resend"
    assert receipt.kind is GenerationRebaseKind.RETRY


def test_cold_open_requires_a_complete_atomic_generation_receipt(
    tmp_path: Path,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    with sqlite3.connect(setup.store.database_path) as connection:
        connection.execute(
            "DELETE FROM host_generation_attempt_bindings WHERE execution_id=?",
            (setup.execution_id,),
        )
        connection.commit()

    with pytest.raises(MemoryV2UnchainGenerationAPIError) as unavailable:
        open_pupu_unchain_generation_api(
            root_dir=setup.root_dir,
            owner_chat_id=setup.owner_chat_id,
        )

    assert unavailable.value.code == (
        "context_v2_atomic_generation_bootstrap_required"
    )
    assert unavailable.value.status_code == 503


@pytest.mark.parametrize(
    ("mutation", "value"),
    (
        ("schema", "pupu.unchain-active-lazy-bootstrap.v1"),
        ("bootstrap_attempt_id", "attempt-outside-atomic-receipt"),
        ("manifest_sha256", "f" * 64),
    ),
)
def test_cold_open_rejects_legacy_or_tampered_bootstrap_provenance(
    tmp_path: Path,
    mutation: str,
    value: str,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    with sqlite3.connect(setup.store.database_path) as connection:
        raw = connection.execute(
            "SELECT bootstrap_provenance_json "
            "FROM pupu_context_v2_admissions WHERE owner_chat_id=?",
            (setup.owner_chat_id,),
        ).fetchone()[0]
        provenance = json.loads(raw)
        if mutation == "manifest_sha256":
            provenance["atomic_bootstrap"][mutation] = value
        else:
            provenance[mutation] = value
        connection.execute(
            "UPDATE pupu_context_v2_admissions "
            "SET bootstrap_provenance_json=? WHERE owner_chat_id=?",
            (
                json.dumps(provenance, sort_keys=True, separators=(",", ":")),
                setup.owner_chat_id,
            ),
        )
        connection.commit()

    with pytest.raises(MemoryV2UnchainGenerationAPIError) as caught:
        open_pupu_unchain_generation_api(
            root_dir=setup.root_dir,
            owner_chat_id=setup.owner_chat_id,
        )

    assert caught.value.code == "context_v2_bootstrap_provenance_invalid"


def test_stale_cas_generation_and_operation_drift_fail_closed(
    tmp_path: Path,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    edited = _rebase(api, setup)

    with pytest.raises(MemoryV2UnchainGenerationAPIError) as stale:
        _rebase(
            api,
            setup,
            operation_id="operation-stale-cas",
        )
    assert stale.value.code in {
        "context_v2_revision_conflict",
        "context_v2_generation_conflict",
    }
    assert stale.value.retryable is True
    with pytest.raises(MemoryV2UnchainGenerationAPIError) as drift:
        _rebase(
            api,
            setup,
            replacement_history=(),
            operation_id="operation-generation-edit",
            reason="delete",
        )
    assert drift.value.code == "context_v2_operation_conflict"
    assert api.get_session_head(
        owner_chat_id=setup.owner_chat_id,
        session_id=setup.session_id,
    )["current_generation_id"] == edited["generation_id"]


def test_pending_interaction_blocks_without_generation_writes(
    tmp_path: Path,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    attempt = AttemptRef(
        GenerationRef(setup.execution_id, setup.receipt.generation_id),
        setup.receipt.attempt_id,
    )
    setup.store.bind_execution(setup.execution_id).append(
        request=SemanticEventDraft(
            event_id="pending-interaction-request",
            event_type="interaction.requested",
            attempt=attempt,
            operation_id="pending-interaction-operation",
            payload={
                "run_id": setup.receipt.attempt_id,
                "interaction_id": "pending-interaction",
            },
        ).to_append_request()
    )
    before = _counts(setup.store)

    with pytest.raises(MemoryV2UnchainGenerationAPIError) as blocked:
        _rebase(api, setup)

    assert blocked.value.code == "context_v2_rebase_in_progress"
    assert blocked.value.retryable is True
    assert _counts(setup.store) == before


def test_open_tool_blocks_without_generation_writes(tmp_path: Path) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    attempt = AttemptRef(
        GenerationRef(setup.execution_id, setup.receipt.generation_id),
        "attempt-live-tool",
    )
    for event_id, event_type in (
        ("live-tool-call", "tool_call"),
        ("live-tool-started", "tool.started"),
    ):
        setup.store.bind_execution(setup.execution_id).append(
            request=SemanticEventDraft(
                event_id=event_id,
                event_type=event_type,
                attempt=attempt,
                operation_id=f"operation-{event_id}",
                payload={
                    "run_id": attempt.attempt_id,
                    "call_id": "call-live-tool",
                    "tool_name": "lookup",
                },
            ).to_append_request()
        )
    before = _counts(setup.store)

    with pytest.raises(MemoryV2UnchainGenerationAPIError) as blocked:
        _rebase(api, setup)

    assert blocked.value.code == "context_v2_rebase_in_progress"
    assert blocked.value.retryable is True
    assert _counts(setup.store) == before


def test_prepared_checkpoint_blocks_without_generation_writes(
    tmp_path: Path,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    journal = setup.store.bind_execution(setup.execution_id)
    artifacts = ArtifactService(
        journal,
        sanitizer=lambda content, media_type: content,
    )
    checkpoints = SQLiteContextCompilerV2Store(
        context_store=setup.store,
    ).bind_execution(
        setup.execution_id,
        artifacts=artifacts,
    ).checkpoints
    checkpoints.prepare(
        source_range=EventRange(
            setup.receipt.first_cursor,
            setup.receipt.last_cursor,
        ),
        summary="checkpoint preparation in progress",
        refs=(),
        operation=OperationRef("prepared-checkpoint-operation", "a" * 64),
    )
    before = _counts(setup.store)

    with pytest.raises(MemoryV2UnchainGenerationAPIError) as blocked:
        _rebase(api, setup)

    assert blocked.value.code == "context_v2_rebase_in_progress"
    assert _counts(setup.store) == before


def test_secret_is_sanitized_before_any_durable_generation_record(
    tmp_path: Path,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    secret = "supersecret123"

    result = _rebase(
        api,
        setup,
        replacement_history=(
            {"role": "user", "content": f"password={secret}"},
        ),
    )

    snapshot = setup.store.bind_execution(setup.execution_id).capture_snapshot()
    current = tuple(
        event
        for event in snapshot.events
        if event.attempt.generation.generation_id == result["generation_id"]
    )
    assert current[0].payload["message"]["content"] == "password=[REDACTED]"
    secret_bytes = secret.encode("utf-8")
    assert all(
        secret_bytes not in path.read_bytes()
        for path in setup.root_dir.rglob("*")
        if path.is_file()
    )


def test_plain_absolute_path_text_remains_valid_chat_content(tmp_path: Path) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )

    result = _rebase(
        api,
        setup,
        replacement_history=(
            {
                "role": "user",
                "content": "debug /Users/red/project and /tmp/result.txt",
            },
        ),
    )

    current = tuple(
        event
        for event in setup.store.bind_execution(
            setup.execution_id
        ).capture_snapshot().events
        if event.attempt.generation.generation_id == result["generation_id"]
    )
    assert current[0].payload["message"]["content"] == (
        "debug /Users/red/project and /tmp/result.txt"
    )


@pytest.mark.parametrize(
    ("override", "expected_code"),
    (
        (
            {
                "replacement_history": (
                    {"role": "assistant", "content": [{"type": "text"}]},
                )
            },
            "context_v2_invalid_history",
        ),
        (
            {
                "replacement_history": (
                    {"role": "user", "content": "file:///Users/red/secret"},
                )
            },
            "context_v2_invalid_history",
        ),
        ({"reason": "archive"}, "context_v2_invalid_reason"),
    ),
)
def test_invalid_host_history_and_reason_are_rejected_before_write(
    tmp_path: Path,
    override: dict,
    expected_code: str,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    before = _counts(setup.store)

    with pytest.raises(MemoryV2UnchainGenerationAPIError) as caught:
        _rebase(api, setup, **override)

    assert caught.value.code == expected_code
    assert _counts(setup.store) == before


def test_exact_rebase_reason_mapping_contract(tmp_path: Path) -> None:
    expected_reasons = {
        "context_v2_rebase_in_progress": {
            "checkpoint_prepared",
            "pending_interaction",
            "attempt_open",
            "tool_open",
        },
        "context_v2_rebase_recovery_required": {
            "graph_step_seal_missing",
            "graph_execution_seal_missing",
        },
        "context_v2_rebase_journal_incompatible": {
            "journal_authority_invalid",
            "current_receipt_unavailable",
            "host_snapshot_unsanitized",
            "interaction_resolution_duplicated",
            "interaction_request_duplicated",
            "interaction_lifecycle_not_paired",
            "tool_call_identity_unstable",
            "tool_lifecycle_not_paired",
            "tool_start_precedes_intent",
            "tool_seal_precedes_start",
            "tool_result_precedes_start",
            "tool_result_precedes_seal",
            "tool_identity_changed",
            "attempt_duplicate_terminal",
            "attempt_continued_after_terminal",
            "graph_attempt_kind_ambiguous",
            "graph_plan_descriptor_invalid",
            "graph_step_terminal_ambiguous",
            "graph_step_seal_duplicated",
            "graph_step_seal_not_last",
            "graph_step_seal_not_adjacent",
            "graph_step_seal_mismatched_terminal",
            "graph_step_seal_foreign",
            "graph_step_sequence_invalid",
            "graph_execution_seal_duplicated",
            "graph_execution_seal_mismatched",
        },
        "context_v2_operation_conflict": {"operation_identity_conflict"},
        "context_v2_revision_conflict": {"head_revision_conflict"},
        "context_v2_generation_conflict": {
            "source_generation_conflict",
            "chat_binding_conflict",
        },
        "context_v2_rebase_unavailable": {
            "infrastructure_unavailable",
        },
    }
    expected_projection = {
        "context_v2_rebase_in_progress": (409, True),
        "context_v2_rebase_recovery_required": (409, True),
        "context_v2_rebase_journal_incompatible": (409, False),
        "context_v2_operation_conflict": (409, False),
        "context_v2_revision_conflict": (409, True),
        "context_v2_generation_conflict": (409, True),
        "context_v2_rebase_unavailable": (503, True),
    }
    exception_types = {
        "context_v2_rebase_in_progress": GenerationRebasePreflightBlocked,
        "context_v2_rebase_recovery_required": GenerationRebaseRecoveryRequired,
        "context_v2_rebase_journal_incompatible": (
            GenerationRebaseJournalIncompatible
        ),
        "context_v2_operation_conflict": GenerationRebaseConflict,
        "context_v2_revision_conflict": GenerationRebaseConflict,
        "context_v2_generation_conflict": GenerationRebaseConflict,
        "context_v2_rebase_unavailable": GenerationRebaseUnavailable,
    }
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    observed = {code: set() for code in expected_reasons}

    for code, reasons in expected_reasons.items():
        for reason in reasons:
            producer_error = exception_types[code](
                "adversarial revision conflict unavailable recovery words",
                reason=GenerationRebaseFailureReason(reason),
                subject={
                    "execution_id": setup.execution_id,
                    "generation_id": setup.receipt.generation_id,
                },
            )
            translated = api._translate_rebase_error(
                producer_error,
                expected_revision=setup.receipt.head_revision,
            )

            observed[translated.code].add(reason)
            assert (translated.status_code, translated.retryable) == (
                expected_projection[code]
            )
            assert str(translated) == "Unchain-owned generation request failed"
            if code in {
                "context_v2_revision_conflict",
                "context_v2_generation_conflict",
            }:
                assert translated.expected_revision == setup.receipt.head_revision
                assert translated.actual_revision == setup.receipt.head_revision
            else:
                assert translated.expected_revision is None
                assert translated.actual_revision is None

    installed_reasons = {reason.value for reason in GenerationRebaseFailureReason}
    assert observed == expected_reasons
    assert installed_reasons == set().union(*expected_reasons.values())
    assert CONTEXT_V2_REBASE_MAPPING_CODES == frozenset(expected_reasons)
    assert CONTEXT_V2_REBASE_CODE_PROJECTIONS == expected_projection
    assert CONTEXT_V2_REBASE_ERROR_CODES == (
        CONTEXT_V2_REBASE_MAPPING_CODES
        | {
            "context_v2_rebase_receipt_mismatch",
            "context_v2_not_found",
            "context_v2_invalid_request",
            "context_v2_invalid_history",
        }
    )
    assert len(CONTEXT_V2_REBASE_MAPPING_CODES) == 7
    assert len(CONTEXT_V2_REBASE_ERROR_CODES) == 11


def test_rebase_translation_ignores_exception_text_and_malformed_detail(
    tmp_path: Path,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    producer_error = GenerationRebaseConflict(
        "head_revision_conflict recovery_required operation_identity_conflict"
    )
    producer_error.detail = {
        "schema": "unchain.generation_rebase_failure.v1",
        "reason": "head_revision_conflict",
        "subject": {"forbidden_private_field": "must-not-cross-boundary"},
    }

    translated = api._translate_rebase_error(
        producer_error,
        expected_revision=setup.receipt.head_revision,
    )

    assert translated.code == "context_v2_rebase_unavailable"
    assert translated.status_code == 503
    assert translated.retryable is True
    assert translated.expected_revision is None
    assert translated.actual_revision is None
    assert str(translated) == "Unchain-owned generation request failed"


def test_current_head_maps_authority_corruption_to_terminal_journal_error(
    tmp_path: Path,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    producer_error = GenerationRebaseJournalIncompatible(
        "durable head authority is incompatible",
        reason=GenerationRebaseFailureReason.JOURNAL_AUTHORITY_INVALID,
        subject={"execution_id": setup.execution_id},
    )

    with mock.patch.object(
        SQLiteGenerationRebaseV2Service,
        "current",
        autospec=True,
        side_effect=producer_error,
    ), pytest.raises(MemoryV2UnchainGenerationAPIError) as caught:
        api.get_session_head(
            owner_chat_id=setup.owner_chat_id,
            session_id=setup.session_id,
        )

    assert caught.value.code == "context_v2_rebase_journal_incompatible"
    assert caught.value.status_code == 409
    assert caught.value.retryable is False


def test_rebase_guard_corruption_is_terminal_and_write_free(
    tmp_path: Path,
) -> None:
    from session_execution_guard import SessionExecutionGuardRegistry

    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    registry = SessionExecutionGuardRegistry(data_dir=api._guard_data_dir)
    registry.initialize_protocol()
    record_path = registry._record_path(setup.session_id)
    record_path.write_text(
        '{"schema_version":1,"private":"corrupt"}',
        encoding="utf-8",
    )
    before = _counts(setup.store)

    with pytest.raises(MemoryV2UnchainGenerationAPIError) as caught:
        _rebase(api, setup)

    assert caught.value.code == "context_v2_rebase_journal_incompatible"
    assert caught.value.status_code == 409
    assert caught.value.retryable is False
    assert _counts(setup.store) == before


def test_active_session_guard_blocks_rebase_without_any_generation_write(
    tmp_path: Path,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    worker_source = "\n".join(
        (
            "import sys",
            "sys.path.insert(0, sys.argv[1])",
            "from session_execution_guard import SessionExecutionGuardRegistry",
            "registry = SessionExecutionGuardRegistry(data_dir=sys.argv[2])",
            "registry.acquire(sys.argv[3], 'attempt-live-run', "
            "operation='run', execution_id=sys.argv[3])",
            "print('ready', flush=True)",
            "sys.stdin.readline()",
            "registry.release_run(sys.argv[3], 'attempt-live-run')",
        )
    )
    worker = subprocess.Popen(
        [
            sys.executable,
            "-c",
            worker_source,
            str(Path(__file__).resolve().parents[1]),
            str(api._guard_data_dir),
            setup.session_id,
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        assert worker.stdout is not None
        assert worker.stdout.readline().strip() == "ready"
        before = _counts(setup.store)
        with pytest.raises(MemoryV2UnchainGenerationAPIError) as blocked:
            _rebase(api, setup)
    finally:
        assert worker.stdin is not None
        worker.stdin.write("stop\n")
        worker.stdin.flush()
        worker.wait(timeout=5)

    assert worker.returncode == 0
    assert blocked.value.code == "context_v2_rebase_in_progress"
    assert blocked.value.status_code == 409
    assert blocked.value.retryable is True
    assert _counts(setup.store) == before


@pytest.mark.parametrize(
    "reason",
    (
        GenerationRebaseFailureReason.GRAPH_STEP_SEAL_MISSING,
        GenerationRebaseFailureReason.GRAPH_EXECUTION_SEAL_MISSING,
    ),
)
def test_inline_recovery_is_bounded_to_one_call_and_one_replay(
    tmp_path: Path,
    reason: GenerationRebaseFailureReason,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    request = _recovery_request(setup, suffix=reason.value)
    failure = GenerationRebaseRecoveryRequired(
        "one graph seal is missing",
        reason=reason,
        subject={
            "execution_id": setup.execution_id,
            "generation_id": request.intent.previous_generation_id,
        },
    )
    recovered = GenerationRebaseRecoveryObservation(
        schema="unchain.generation_rebase_recovery.v1",
        action=(
            "step_recovered"
            if reason is GenerationRebaseFailureReason.GRAPH_STEP_SEAL_MISSING
            else "execution_finalized"
        ),
        reason=reason.value,
        execution_id=setup.execution_id,
        generation_id=request.intent.previous_generation_id,
        appended_event_count=1,
        artifact_count=(
            1
            if reason is GenerationRebaseFailureReason.GRAPH_STEP_SEAL_MISSING
            else 0
        ),
    )
    replay_receipt = object()

    with (
        mock.patch.object(
            SQLiteGenerationRebaseV2Service,
            "rebase",
            autospec=True,
            side_effect=(failure, replay_receipt),
        ) as service_rebase,
        mock.patch(
            "memory_v2_unchain_graph_recovery.recover_generation_rebase_once",
            return_value=recovered,
        ) as recover_once,
    ):
        result = api._rebase_with_recovery(
            request,
            expected_revision=request.intent.expected_head_revision,
        )

    assert result is replay_receipt
    assert service_rebase.call_count == 2
    assert all(call.args == (api._service, request) for call in service_rebase.mock_calls)
    recover_once.assert_called_once_with(
        service=api._service,
        request=request,
        failure=failure,
    )


def test_inline_recovery_replay_failure_is_bounded_and_escalates(
    tmp_path: Path,
) -> None:
    setup = _setup_generation_api(tmp_path / "memory_v2")
    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    request = _recovery_request(setup, suffix="bounded-replay")
    reason = GenerationRebaseFailureReason.GRAPH_STEP_SEAL_MISSING
    failure = GenerationRebaseRecoveryRequired(
        "recovery replay still sees the same missing seal",
        reason=reason,
        subject={
            "execution_id": setup.execution_id,
            "generation_id": request.intent.previous_generation_id,
        },
    )
    recovered = GenerationRebaseRecoveryObservation(
        schema="unchain.generation_rebase_recovery.v1",
        action="unchanged",
        reason=reason.value,
        execution_id=setup.execution_id,
        generation_id=request.intent.previous_generation_id,
        appended_event_count=0,
        artifact_count=0,
    )
    reset_generation_rebase_recovery_attempts()
    try:
        observed_codes = []
        for attempt_index in range(3):
            with (
                mock.patch.object(
                    SQLiteGenerationRebaseV2Service,
                    "rebase",
                    autospec=True,
                    side_effect=(failure, failure),
                ) as service_rebase,
                mock.patch(
                    "memory_v2_unchain_graph_recovery."
                    "recover_generation_rebase_once",
                    return_value=recovered,
                ) as recover_once,
                pytest.raises(MemoryV2UnchainGenerationAPIError) as caught,
            ):
                api._rebase_with_recovery(
                    request,
                    expected_revision=request.intent.expected_head_revision,
                )
            observed_codes.append(caught.value.code)
            if attempt_index < 2:
                assert service_rebase.call_count == 2
                recover_once.assert_called_once_with(
                    service=api._service,
                    request=request,
                    failure=failure,
                )
            else:
                assert service_rebase.call_count == 1
                recover_once.assert_not_called()
    finally:
        reset_generation_rebase_recovery_attempts()

    assert observed_codes == [
        "context_v2_rebase_recovery_required",
        "context_v2_rebase_journal_incompatible",
        "context_v2_rebase_journal_incompatible",
    ]


def _single_step_graph_runtime(setup: _GenerationSetup):
    """Admit one real single-step graph plan inside the initial generation.

    Mirrors unchain's ``_graph_checkpoint_runtime`` test helper with one step
    and a plain message root input, so the sidecar rebase path sees the same
    canonical producer output the incident journal carried.
    """
    generation = GenerationRef(setup.execution_id, setup.receipt.generation_id)
    orchestration = AttemptRef(generation, "graph-orchestration")
    step_attempt = AttemptRef(generation, "graph-step-0")
    journal = setup.store.bind_execution(setup.execution_id)
    artifacts = ArtifactService(
        journal,
        sanitizer=lambda content, _media_type: content,
    )
    attempts = (orchestration, step_attempt)
    projectors = {
        attempt: CanonicalSemanticEventProjector(
            attempt=attempt,
            artifacts=artifacts,
            payload_sanitizer=lambda _event_type, payload: payload,
        )
        for attempt in attempts
    }
    sinks = {
        attempt: DurableEventSink(journal, attempt, projectors[attempt])
        for attempt in attempts
    }

    def derived_ingress(consumer_attempt, source_attempt):
        return DerivedHandoffInputIngress(
            consumer_attempt=consumer_attempt,
            source_attempt=source_attempt,
            handoff_recorder=DurableHandoffRecorder(
                attempt=consumer_attempt,
                handoffs=HandoffService(artifacts),
                projector=projectors[consumer_attempt],
                sink=sinks[consumer_attempt],
            ),
            input_ingress=ContextInputIngress(
                attempt=consumer_attempt,
                projector=projectors[consumer_attempt],
                sink=sinks[consumer_attempt],
            ),
        )

    service = GraphCheckpointService(
        repository=JournalGraphCheckpointRepository(journal),
        artifacts=artifacts,
        derived_ingress_resolver=derived_ingress,
    )
    root_input = ContextInputIngress(
        attempt=orchestration,
        projector=projectors[orchestration],
        sink=sinks[orchestration],
    ).persist(
        HostResolvedCurrentInput(
            attempt=orchestration,
            content="run the graph",
            message_index=0,
            attachments=(),
        )
    )
    step = GraphStepBinding(
        index=0,
        node_id="node-0",
        attempt=step_attempt,
        source_attempt=orchestration,
        provider="openai",
        model="gpt-test",
        configuration_sha256=hashlib.sha256(
            b"node-0-configuration"
        ).hexdigest(),
    )
    plan = GraphExecutionPlan(
        orchestration_attempt=orchestration,
        topology_sha256=hashlib.sha256(b"graph-topology").hexdigest(),
        initial_input_cursor=root_input.cursor,
        steps=(step,),
    )
    service.admit(plan)
    service.start_step(plan, 0)
    return (
        plan,
        step,
        sinks[step_attempt],
        JournalGraphCheckpointRepository(journal),
    )


def _append_live_interaction_event(
    setup: _GenerationSetup,
    attempt: AttemptRef,
    *,
    event_id: str,
    event_type: str,
    interaction_id: str,
):
    """Append a raw live-cycle event exactly as the incident journal stored it."""
    return setup.store.bind_execution(setup.execution_id).append(
        request=SemanticEventDraft(
            event_id=event_id,
            event_type=event_type,
            attempt=attempt,
            operation_id=f"operation-{event_id}",
            payload={
                "run_id": attempt.attempt_id,
                "interaction_id": interaction_id,
            },
        ).to_append_request()
    ).event


def _append_projected_step_event(sink, attempt, event_type, sequence, **payload):
    return sink.append_projected(
        SemanticEventDraft(
            event_id=f"event-{attempt.attempt_id}-{sequence}-{event_type}",
            event_type=event_type,
            attempt=attempt,
            operation_id=(
                f"operation-{attempt.attempt_id}-{sequence}-{event_type}"
            ),
            payload={"run_id": attempt.attempt_id, **payload},
        )
    )


def test_live_tool_cycles_rebase_to_v2_ack_and_cold_replay_is_idempotent(
    tmp_path: Path,
) -> None:
    """SEQ-001 through the sidecar: live request/outcome, runtime activity,
    another live request/outcome, terminal, then a historical resend.

    No ``graph.step.resume.admitted`` exists for either cycle.  Before the
    repair the rebase reported ``graph_step_seal_foreign`` and PuPu mapped it
    to the terminal ``context_v2_rebase_journal_incompatible`` code, which
    deleted the user's outbox entry.
    """
    setup = _setup_generation_api(tmp_path / "memory_v2")
    plan, step, step_sink, repository = _single_step_graph_runtime(setup)
    for ordinal, outcome in ((1, "tool_confirmed"), (2, "tool_denied")):
        interaction_id = f"live-tool-{ordinal}"
        _append_live_interaction_event(
            setup,
            step.attempt,
            event_id=f"live-tool-{ordinal}-request",
            event_type="tool_confirmation_requested",
            interaction_id=interaction_id,
        )
        _append_live_interaction_event(
            setup,
            step.attempt,
            event_id=f"live-tool-{ordinal}-outcome",
            event_type=outcome,
            interaction_id=interaction_id,
        )
        if ordinal == 1:
            # Runtime activity between the cycles proves the attempt kept
            # running in-process instead of pausing for a durable admission.
            _append_projected_step_event(
                step_sink,
                step.attempt,
                "iteration_started",
                17,
                iteration=2,
            )
    terminal = _append_projected_step_event(
        step_sink,
        step.attempt,
        "run_failed",
        99,
        status="failed",
    )
    repository.terminal(
        plan,
        step,
        status=GraphTerminalStatus.FAILED,
        terminal_cursor=terminal.cursor,
    )

    api = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    acknowledged = _rebase(api, setup)

    assert acknowledged["session_revision"] == 2
    assert acknowledged["reason"] == "edit"
    assert acknowledged["replayed"] is False
    assert acknowledged["turn_mutation_event_ref"]
    assert acknowledged["generation_id"] != setup.receipt.generation_id

    reopened = open_pupu_unchain_generation_api(
        root_dir=setup.root_dir,
        owner_chat_id=setup.owner_chat_id,
    )
    replay = _rebase(reopened, setup)

    assert replay == {**acknowledged, "replayed": True}
