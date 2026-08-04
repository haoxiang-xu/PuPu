from __future__ import annotations

from pathlib import Path

import pytest

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_admission_adapter import PupuUnchainAdmissionAuthority
from memory_v2_unchain_atomic_bootstrap import (
    ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA,
    PupuUnchainAtomicBootstrapError,
    prepare_pupu_unchain_atomic_bootstrap,
    pupu_unchain_sticky_active_required,
    verify_pupu_unchain_atomic_bootstrap,
)
from memory_v2_unchain_run_binding import PupuMemoryV2RunBindingRegistry
from unchain.journal import (
    AttemptRef,
    GenerationRef,
    SemanticEventDraft,
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


OWNER = "chat-atomic-bootstrap"
SESSION = "session-atomic-bootstrap"
EXECUTION = "execution-atomic-bootstrap"


def _prepare(
    root: Path,
    history=(),
    *,
    checkpoint_clear: bool = True,
    interaction_clear: bool = True,
):
    return prepare_pupu_unchain_atomic_bootstrap(
        root_dir=root,
        owner_chat_id=OWNER,
        session_id=SESSION,
        execution_id=EXECUTION,
        history=history,
        no_unfinished_durable_checkpoint=checkpoint_clear,
        no_pending_interaction=interaction_clear,
    )


def _store(bootstrap) -> SQLiteContextV2Store:
    return SQLiteContextV2Store(
        database_path=bootstrap.database_path,
        object_directory=bootstrap.object_directory,
    )


def _mark_sticky(bootstrap):
    authority = PupuUnchainAdmissionAuthority(
        owner_chat_id=OWNER,
        database_path=bootstrap.database_path,
        object_directory=bootstrap.object_directory,
    )
    admission = authority.resolve_chat_admission(
        owner_chat_id=OWNER,
        session_id=SESSION,
        requested_rollout_mode="all",
        effective_rollout_mode="all",
        cohort="all_active",
        target_mode="active",
        decision_reason="atomic_bootstrap_test",
        canary_selected=False,
        canary_percent=100,
        canary_bucket=0,
        hash_strategy="test",
        provenance={"source": "atomic_bootstrap_test"},
        operation_id="admit-atomic-bootstrap-test",
    )
    marked = authority.mark_chat_bootstrap(
        owner_chat_id=OWNER,
        admission_id=admission["admission_id"],
        expected_revision=admission["revision"],
        succeeded=True,
        provenance=bootstrap.provenance(runtime_attempt_id="runtime-attempt-a"),
        error_code="",
        operation_id="mark-atomic-bootstrap-test",
    )
    return authority, marked


def test_nonempty_create_is_atomic_restart_safe_and_uses_synthetic_attempt(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory_v2"
    history = (
        {"role": "user", "content": "Remember alpha"},
        {"role": "assistant", "content": "Alpha is retained"},
    )

    first = _prepare(root, history)
    replay = _prepare(root, history)
    snapshot = _store(first).bind_execution(EXECUTION).capture_snapshot()

    assert first.bootstrap_receipt.duplicate is False
    assert replay.bootstrap_receipt.duplicate is True
    assert first.generation_id == replay.generation_id
    assert first.bootstrap_attempt_id == replay.bootstrap_attempt_id
    assert first.bootstrap_attempt_id.startswith("pupu-bootstrap-attempt-")
    assert first.bootstrap_attempt_id != "runtime-attempt-a"
    assert first.message_count == 2
    assert first.history_state == "imported"
    assert [event.payload["message"]["content"] for event in snapshot.events] == [
        "Remember alpha",
        "Alpha is retained",
    ]
    assert all(
        event.attempt.attempt_id == first.bootstrap_attempt_id
        for event in snapshot.events
    )
    assert verify_pupu_unchain_atomic_bootstrap(
        bootstrap=replay,
        database_path=replay.database_path,
        object_directory=replay.object_directory,
        owner_chat_id=OWNER,
        session_id=SESSION,
        execution_id=EXECUTION,
    ) == replay.current_head


def test_empty_history_writes_explicit_marker_and_typed_provenance(
    tmp_path: Path,
) -> None:
    bootstrap = _prepare(tmp_path / "memory_v2")
    events = _store(bootstrap).bind_execution(EXECUTION).capture_snapshot().events
    provenance = bootstrap.provenance(runtime_attempt_id="runtime-attempt-empty")

    assert bootstrap.history_state == "empty"
    assert bootstrap.capture_status == "empty_history"
    assert bootstrap.message_count == 0
    assert len(events) == 1
    assert events[0].event_type == "generation.rebased"
    assert provenance["schema"] == ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA
    assert provenance["bootstrap_attempt_id"] == bootstrap.bootstrap_attempt_id
    assert provenance["runtime_attempt_id"] == "runtime-attempt-empty"
    assert provenance["atomic_bootstrap"]["manifest_sha256"] == (
        bootstrap.bootstrap_receipt.manifest_sha256
    )


def test_sticky_chat_ignores_growing_renderer_history_and_binds_latest_head(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory_v2"
    bootstrap = _prepare(
        root,
        ({"role": "user", "content": "Initial task"},),
    )
    _mark_sticky(bootstrap)
    service = SQLiteGenerationRebaseV2Service(_store(bootstrap))
    next_intent = GenerationRebaseIntent(
        owner_chat_id=OWNER,
        session_id=SESSION,
        execution_id=EXECUTION,
        generation_id="generation-after-edit",
        attempt_id="edit-bootstrap-attempt",
        kind=GenerationRebaseKind.EDIT,
        previous_generation_id=bootstrap.current_head.current_generation_id,
        expected_head_revision=bootstrap.current_head.revision,
        source_revision="source-after-edit",
        messages=(
            GenerationSnapshotMessage(
                "message-after-edit",
                "user",
                "Edited task",
            ),
        ),
        preflight=GenerationRebasePreflight(
            "preflight-after-edit",
            True,
        ),
    )
    edited = service.rebase(
        GenerationRebaseRequest(
            intent=next_intent,
            operation=build_generation_rebase_operation(
                operation_id="operation-after-edit",
                intent=next_intent,
            ),
        )
    )

    reopened = _prepare(
        root,
        (
            {"role": "user", "content": "Initial task"},
            {"role": "assistant", "content": "A later answer"},
        ),
    )

    assert reopened.generation_id == bootstrap.generation_id
    assert reopened.bootstrap_attempt_id == bootstrap.bootstrap_attempt_id
    assert reopened.current_head.current_generation_id == edited.generation_id
    assert reopened.current_head.revision == 2
    assert pupu_unchain_sticky_active_required(
        root_dir=root,
        owner_chat_id=OWNER,
    ) is True


def test_pending_admission_replays_create_after_marking_failure(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory_v2"
    first = _prepare(
        root,
        ({"role": "user", "content": "Durable before admission CAS"},),
    )
    authority = PupuUnchainAdmissionAuthority(
        owner_chat_id=OWNER,
        database_path=first.database_path,
        object_directory=first.object_directory,
    )
    pending = authority.resolve_chat_admission(
        owner_chat_id=OWNER,
        session_id=SESSION,
        requested_rollout_mode="all",
        effective_rollout_mode="all",
        cohort="all_active",
        target_mode="active",
        decision_reason="pending_test",
        canary_selected=False,
        canary_percent=100,
        canary_bucket=0,
        hash_strategy="test",
        provenance={"source": "pending_test"},
        operation_id="admit-pending-atomic-bootstrap-test",
    )

    replay = _prepare(
        root,
        ({"role": "user", "content": "Durable before admission CAS"},),
    )

    assert pending["v2_bootstrapped"] is False
    assert replay.bootstrap_receipt.duplicate is True
    assert replay.generation_id == first.generation_id
    assert len(_store(first).bind_execution(EXECUTION).capture_snapshot().events) == 1


@pytest.mark.parametrize(
    ("checkpoint_clear", "interaction_clear"),
    ((False, True), (True, False)),
)
def test_legacy_unfinished_state_blocks_first_create_only(
    tmp_path: Path,
    checkpoint_clear: bool,
    interaction_clear: bool,
) -> None:
    root = tmp_path / "memory_v2"
    with pytest.raises(PupuUnchainAtomicBootstrapError) as caught:
        _prepare(
            root,
            ({"role": "user", "content": "Must not import"},),
            checkpoint_clear=checkpoint_clear,
            interaction_clear=interaction_clear,
        )
    assert caught.value.code == "context_v2_atomic_bootstrap_preflight_blocked"

    admitted = admit_context_v2_store_owner(
        root_dir=root,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    store = SQLiteContextV2Store(
        database_path=admitted.database_path,
        object_directory=root / "objects",
    )
    service = SQLiteGenerationRebaseV2Service(store)
    assert service.current(
        owner_chat_id=OWNER,
        execution_id=EXECUTION,
        session_id=SESSION,
    ) is None
    assert store.bind_execution(EXECUTION).capture_snapshot().events == ()


def test_create_fails_closed_when_execution_already_contains_semantic_state(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory_v2"
    admitted = admit_context_v2_store_owner(
        root_dir=root,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    store = SQLiteContextV2Store(
        database_path=admitted.database_path,
        object_directory=root / "objects",
    )
    store.bind_execution(EXECUTION).append(
        request=SemanticEventDraft(
            event_id="event-before-create",
            event_type="interaction.requested",
            attempt=AttemptRef(
                GenerationRef(EXECUTION, "generation-before-create"),
                "attempt-before-create",
            ),
            operation_id="operation-before-create",
            payload={
                "run_id": "attempt-before-create",
                "interaction_id": "interaction-before-create",
            },
        ).to_append_request(),
    )
    with pytest.raises(PupuUnchainAtomicBootstrapError) as caught:
        _prepare(root)
    assert caught.value.code == "context_v2_atomic_bootstrap_conflict"


def test_legacy_split_head_is_not_adopted(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    bootstrap = _prepare(root)
    split_root = tmp_path / "split-memory-v2"
    split_store = SQLiteContextV2Store(
        database_path=split_root / "context_v2.sqlite3",
        object_directory=split_root / "objects",
    )
    PupuMemoryV2RunBindingRegistry(
        store=split_store,
        owner_chat_id=OWNER,
        execution_id=EXECUTION,
        session_id=SESSION,
        root_run_id="root-split",
    )

    assert bootstrap.generation_id
    with pytest.raises(PupuUnchainAtomicBootstrapError) as caught:
        _prepare(split_root)
    assert caught.value.code in {
        "context_v2_atomic_bootstrap_conflict",
        "context_v2_atomic_bootstrap_unavailable",
    }
