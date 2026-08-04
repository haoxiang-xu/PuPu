from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

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
    MemoryV2UnchainGenerationAPIError,
    open_pupu_unchain_generation_api,
)
from unchain.context import ArtifactService
from unchain.journal import (
    AttemptRef,
    EventRange,
    GenerationRef,
    OperationRef,
    SemanticEventDraft,
)
from unchain.persistence.sqlite_context_compiler_v2 import (
    SQLiteContextCompilerV2Store,
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
