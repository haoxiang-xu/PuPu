from __future__ import annotations

import json
import sqlite3

import pytest

import memory_v2_task_state_adapter as task_state_adapter
from context_memory_v2_repository import (
    PupuContextMemoryV2Repository,
    PupuExecutionScope,
    PupuPinnedTaskStateRepository,
    PupuRefCodec,
)
from memory_v2_store import MemoryV2Store
from memory_v2_workspace_adapter import bind_pupu_memory_workspace_service
from unchain.journal import OperationRef, ResourceRef
from unchain.memory.workspace.ports import (
    RepositoryConflictError,
    RepositoryNotFoundError,
    RepositoryScopeError,
    WorkspaceRepositoryError,
)


SHA_A = "a" * 64


def _operation(identifier: str) -> OperationRef:
    return OperationRef(identifier, SHA_A)


def _append_user(
    store: MemoryV2Store,
    *,
    owner_chat_id: str,
    session_id: str,
    attempt_id: str,
    event_id: str,
):
    return store.append_semantic_event(
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        attempt_id=attempt_id,
        event={
            "event_id": event_id,
            "type": "message.user",
            "payload": {"message": {"content": event_id}},
        },
        operation_id=f"{event_id}-operation",
    )


def _bind(store: MemoryV2Store, *, generation_id: str, attempt_id: str):
    host = PupuContextMemoryV2Repository(store)
    execution = host.bind_execution(
        PupuExecutionScope(
            owner_chat_id="chat-task",
            session_id="session-task",
            generation_id=generation_id,
            attempt_id=attempt_id,
        )
    )
    workspace_repository = host.ensure_chat_workspace(
        owner_chat_id="chat-task",
        name="Chat Memory",
        description="Task-state reference scope",
        operation=_operation("ensure-task-workspace"),
    )
    workspace = bind_pupu_memory_workspace_service(
        workspace_repository,
        binding_id="task-binding",
        execution=execution,
    )
    return task_state_adapter.bind_pupu_task_state_service(
        workspace,
        execution=execution,
    )


@pytest.fixture()
def task_state_stack(tmp_path):
    root = tmp_path / "memory_v2"
    store = MemoryV2Store(root)
    bootstrapped = store.bootstrap_current_request(
        owner_chat_id="chat-task",
        session_id="session-task",
        attempt_id="attempt-task",
        message={"content": "Build the task-state adapter"},
        operation_id="task-bootstrap",
    )
    binding = _bind(
        store,
        generation_id=bootstrapped["generation_id"],
        attempt_id="attempt-task",
    )
    try:
        yield root, store, bootstrapped, binding
    finally:
        store.close()


def test_binding_reads_bootstrapped_state_and_redacts_before_cas(task_state_stack):
    _root, store, _bootstrapped, binding = task_state_stack
    initial = binding.service.get()
    source = _append_user(
        store,
        owner_chat_id="chat-task",
        session_id="session-task",
        attempt_id="attempt-task",
        event_id="task-state-source",
    )

    updated = binding.service.update(
        expected_revision=initial.revision,
        patch={
            "objective": "Never persist password=sk-secret",
            "constraints": ("Bearer sk-secret",),
            "status": "blocked",
        },
        source_event_refs=(
            ResourceRef("context_event", source["event_id"], 1),
        ),
        operation_id="task-state-update",
    )

    assert initial.objective == "Build the task-state adapter"
    assert updated.objective == "Never persist password=[REDACTED]"
    assert updated.constraints == ("Bearer [REDACTED]",)
    assert updated.status == "blocked"
    assert updated.source_event_refs == (
        ResourceRef("context_event", "task-state-source", 1),
    )
    with sqlite3.connect(store.db_path) as connection:
        durable = connection.execute(
            "SELECT state_json FROM pinned_task_state WHERE owner_chat_id='chat-task'"
        ).fetchone()[0]
    assert "sk-secret" not in durable


def test_task_state_replay_survives_later_revision_and_store_restart(
    task_state_stack,
):
    root, store, bootstrapped, binding = task_state_stack
    first_source = _append_user(
        store,
        owner_chat_id="chat-task",
        session_id="session-task",
        attempt_id="attempt-task",
        event_id="task-state-first",
    )
    first_arguments = {
        "expected_revision": 1,
        "patch": {"constraints": ("First revision",)},
        "source_event_refs": (
            ResourceRef("context_event", first_source["event_id"], 1),
        ),
        "operation_id": "task-state-first-update",
    }
    first = binding.service.update(**first_arguments)
    second_source = _append_user(
        store,
        owner_chat_id="chat-task",
        session_id="session-task",
        attempt_id="attempt-task",
        event_id="task-state-second",
    )
    binding.service.update(
        expected_revision=2,
        patch={"active_plan": ("Second revision",)},
        source_event_refs=(
            ResourceRef("context_event", second_source["event_id"], 1),
        ),
        operation_id="task-state-second-update",
    )

    assert binding.service.update(**first_arguments) == first
    with pytest.raises(RepositoryConflictError):
        binding.service.update(
            **{
                **first_arguments,
                "patch": {"constraints": ("Changed operation payload",)},
            }
        )

    store.close()
    reopened = MemoryV2Store(root)
    try:
        rebound = _bind(
            reopened,
            generation_id=bootstrapped["generation_id"],
            attempt_id="attempt-task",
        )
        assert rebound.service.update(**first_arguments) == first
    finally:
        reopened.close()


def test_task_state_rejects_sibling_attempt_provenance_without_writing(
    task_state_stack,
):
    _root, store, _bootstrapped, binding = task_state_stack
    sibling = _append_user(
        store,
        owner_chat_id="chat-task",
        session_id="session-task",
        attempt_id="attempt-sibling",
        event_id="task-state-sibling-source",
    )
    before = binding.service.get()

    with pytest.raises(RepositoryNotFoundError):
        binding.service.update(
            expected_revision=before.revision,
            patch={"constraints": ("Must not persist",)},
            source_event_refs=(
                ResourceRef("context_event", sibling["event_id"], 1),
            ),
            operation_id="task-state-sibling-update",
        )

    assert binding.service.get() == before


def test_task_state_generation_binding_is_rechecked_inside_store_transaction(
    task_state_stack,
    monkeypatch,
):
    _root, store, bootstrapped, binding = task_state_stack
    source = _append_user(
        store,
        owner_chat_id="chat-task",
        session_id="session-task",
        attempt_id="attempt-task",
        event_id="task-state-race-source",
    )
    before = binding.service.get()
    original_update = store.update_task_state

    def rebase_before_update(**arguments):
        store.seal_task(
            owner_chat_id="chat-task",
            session_id="session-task",
            attempt_id="attempt-task",
            outcome="completed",
            operation_id="task-state-race-seal",
        )
        head = store.get_session_head(
            owner_chat_id="chat-task",
            session_id="session-task",
        )
        store.rebase_session(
            owner_chat_id="chat-task",
            session_id="session-task",
            replacement_history=[
                {"role": "user", "content": "Replacement objective"},
            ],
            source_generation_id=bootstrapped["generation_id"],
            expected_session_revision=head["session_revision"],
            operation_id="task-state-race-rebase",
            reason="edit",
        )
        return original_update(**arguments)

    monkeypatch.setattr(store, "update_task_state", rebase_before_update)
    with pytest.raises(RepositoryConflictError):
        binding.service.update(
            expected_revision=before.revision,
            patch={"constraints": ("Must not cross generations",)},
            source_event_refs=(
                ResourceRef("context_event", source["event_id"], 1),
            ),
            operation_id="task-state-race-update",
        )

    with sqlite3.connect(store.db_path) as connection:
        receipt_count = connection.execute(
            "SELECT COUNT(*) FROM operations WHERE operation_id=?",
            ("task-state-race-update",),
        ).fetchone()[0]
        old_revision = connection.execute(
            "SELECT revision FROM pinned_task_state WHERE generation_id=?",
            (bootstrapped["generation_id"],),
        ).fetchone()[0]
    assert receipt_count == 0
    assert old_revision == before.revision


def test_task_state_store_replay_rechecks_scope_before_returning_receipt(
    task_state_stack,
    monkeypatch,
):
    _root, store, bootstrapped, binding = task_state_stack
    source = _append_user(
        store,
        owner_chat_id="chat-task",
        session_id="session-task",
        attempt_id="attempt-task",
        event_id="task-state-concurrent-receipt-source",
    )
    original_update = store.update_task_state
    interleaved = False

    def concurrent_receipt_then_rebase(**arguments):
        nonlocal interleaved
        if interleaved:
            return original_update(**arguments)
        interleaved = True
        original_update(**arguments)
        store.seal_task(
            owner_chat_id="chat-task",
            session_id="session-task",
            attempt_id="attempt-task",
            outcome="completed",
            operation_id="task-state-concurrent-receipt-seal",
        )
        head = store.get_session_head(
            owner_chat_id="chat-task",
            session_id="session-task",
        )
        store.rebase_session(
            owner_chat_id="chat-task",
            session_id="session-task",
            replacement_history=[
                {"role": "user", "content": "Replacement after receipt"},
            ],
            source_generation_id=bootstrapped["generation_id"],
            expected_session_revision=head["session_revision"],
            operation_id="task-state-concurrent-receipt-rebase",
            reason="edit",
        )
        return original_update(**arguments)

    monkeypatch.setattr(
        store,
        "update_task_state",
        concurrent_receipt_then_rebase,
    )
    with pytest.raises((RepositoryConflictError, RepositoryScopeError)):
        binding.service.update(
            expected_revision=1,
            patch={"constraints": ("Concurrent receipt",)},
            source_event_refs=(
                ResourceRef("context_event", source["event_id"], 1),
            ),
            operation_id="task-state-concurrent-receipt-update",
        )

    head = store.get_session_head(
        owner_chat_id="chat-task",
        session_id="session-task",
    )
    assert head["current_generation_id"] != bootstrapped["generation_id"]


def test_task_state_current_provenance_stays_bounded_across_many_revisions(
    task_state_stack,
):
    _root, store, _bootstrapped, binding = task_state_stack
    source = _append_user(
        store,
        owner_chat_id="chat-task",
        session_id="session-task",
        attempt_id="attempt-task",
        event_id="task-state-bounded-source",
    )
    source_ref = ResourceRef("context_event", source["event_id"], 1)
    current = binding.service.get()

    for index in range(270):
        current = binding.service.update(
            expected_revision=current.revision,
            patch={"constraints": (f"Revision {index}",)},
            source_event_refs=(source_ref,),
            operation_id=f"task-state-bounded-{index}",
        )

    assert current.revision == 271
    assert current.source_event_refs == (source_ref,)
    assert binding.service.get() == current


def test_task_state_binding_rejects_a_different_attempt_in_the_same_generation(
    task_state_stack,
):
    _root, store, bootstrapped, binding = task_state_stack
    _append_user(
        store,
        owner_chat_id="chat-task",
        session_id="session-task",
        attempt_id="attempt-other",
        event_id="task-state-other-attempt",
    )
    host = PupuContextMemoryV2Repository(store)
    other_execution = host.bind_execution(
        PupuExecutionScope(
            owner_chat_id="chat-task",
            session_id="session-task",
            generation_id=bootstrapped["generation_id"],
            attempt_id="attempt-other",
        )
    )

    with pytest.raises(RepositoryScopeError):
        task_state_adapter.bind_pupu_task_state_service(
            binding.workspace,
            execution=other_execution,
        )


def test_task_state_replay_rechecks_scope_atomically_with_receipt_read(
    task_state_stack,
    monkeypatch,
):
    _root, store, bootstrapped, binding = task_state_stack
    source = _append_user(
        store,
        owner_chat_id="chat-task",
        session_id="session-task",
        attempt_id="attempt-task",
        event_id="task-state-replay-race-source",
    )
    arguments = {
        "expected_revision": 1,
        "patch": {"constraints": ("Original generation",)},
        "source_event_refs": (
            ResourceRef("context_event", source["event_id"], 1),
        ),
        "operation_id": "task-state-replay-race-update",
    }
    binding.service.update(**arguments)
    original_require = PupuPinnedTaskStateRepository._require_scope
    target_repository = binding.repository
    rebased = False

    def rebase_after_scope_check(self):
        nonlocal rebased
        scope = original_require(self)
        if self is not target_repository or rebased:
            return scope
        rebased = True
        store.seal_task(
            owner_chat_id="chat-task",
            session_id="session-task",
            attempt_id="attempt-task",
            outcome="completed",
            operation_id="task-state-replay-race-seal",
        )
        head = store.get_session_head(
            owner_chat_id="chat-task",
            session_id="session-task",
        )
        store.rebase_session(
            owner_chat_id="chat-task",
            session_id="session-task",
            replacement_history=[
                {"role": "user", "content": "Replacement generation"},
            ],
            source_generation_id=bootstrapped["generation_id"],
            expected_session_revision=head["session_revision"],
            operation_id="task-state-replay-race-rebase",
            reason="edit",
        )
        return scope

    monkeypatch.setattr(
        PupuPinnedTaskStateRepository,
        "_require_scope",
        rebase_after_scope_check,
    )
    with pytest.raises(RepositoryScopeError):
        binding.service.update(**arguments)


def test_task_state_uses_the_store_redactor_before_operation_identity(tmp_path):
    def stricter_redactor(value):
        encoded = json.dumps(value, ensure_ascii=False)
        return json.loads(encoded.replace("classified", "[STRICT]"))

    root = tmp_path / "memory_v2"
    store = MemoryV2Store(root, redactor=stricter_redactor)
    try:
        bootstrapped = store.bootstrap_current_request(
            owner_chat_id="chat-task",
            session_id="session-task",
            attempt_id="attempt-task",
            message={"content": "classified objective"},
            operation_id="task-strict-bootstrap",
        )
        binding = _bind(
            store,
            generation_id=bootstrapped["generation_id"],
            attempt_id="attempt-task",
        )
        source = _append_user(
            store,
            owner_chat_id="chat-task",
            session_id="session-task",
            attempt_id="attempt-task",
            event_id="task-strict-source",
        )

        updated = binding.service.update(
            expected_revision=1,
            patch={"constraints": ("New constraint",)},
            source_event_refs=(
                ResourceRef("context_event", source["event_id"], 1),
            ),
            operation_id="task-strict-update",
        )

        assert updated.objective == "[STRICT] objective"
        assert updated.constraints == ("New constraint",)
        assert binding.service.get() == updated
    finally:
        store.close()


def test_task_state_non_idempotent_store_redactor_fails_before_write(tmp_path):
    def non_idempotent_redactor(value):
        redacted = dict(value)
        if isinstance(redacted.get("objective"), str):
            redacted["objective"] = redacted["objective"] + "!"
        if isinstance(redacted.get("constraints"), (list, tuple)):
            redacted["constraints"] = [
                f"{item}!" if isinstance(item, str) else item
                for item in redacted["constraints"]
            ]
        return redacted

    root = tmp_path / "memory_v2"
    store = MemoryV2Store(root, redactor=non_idempotent_redactor)
    try:
        bootstrapped = store.bootstrap_current_request(
            owner_chat_id="chat-task",
            session_id="session-task",
            attempt_id="attempt-task",
            message={"content": "Initial objective"},
            operation_id="task-non-idempotent-bootstrap",
        )
        binding = _bind(
            store,
            generation_id=bootstrapped["generation_id"],
            attempt_id="attempt-task",
        )
        source = _append_user(
            store,
            owner_chat_id="chat-task",
            session_id="session-task",
            attempt_id="attempt-task",
            event_id="task-non-idempotent-source",
        )

        with pytest.raises(WorkspaceRepositoryError, match="redaction failed"):
            binding.service.update(
                expected_revision=1,
                patch={"constraints": ("New constraint",)},
                source_event_refs=(
                    ResourceRef("context_event", source["event_id"], 1),
                ),
                operation_id="task-non-idempotent-update",
            )

        with sqlite3.connect(store.db_path) as connection:
            revision = connection.execute(
                "SELECT revision FROM pinned_task_state "
                "WHERE owner_chat_id='chat-task'"
            ).fetchone()[0]
            receipt_count = connection.execute(
                "SELECT COUNT(*) FROM operations WHERE operation_id=?",
                ("task-non-idempotent-update",),
            ).fetchone()[0]
        assert revision == 1
        assert receipt_count == 0
    finally:
        store.close()


def test_task_state_carried_status_redaction_fails_before_write(tmp_path):
    def status_redactor(value):
        redacted = dict(value)
        if "status" in redacted:
            redacted["status"] = "complete"
        return redacted

    root = tmp_path / "memory_v2"
    store = MemoryV2Store(root, redactor=status_redactor)
    try:
        bootstrapped = store.bootstrap_current_request(
            owner_chat_id="chat-task",
            session_id="session-task",
            attempt_id="attempt-task",
            message={"content": "Initial objective"},
            operation_id="task-status-redaction-bootstrap",
        )
        binding = _bind(
            store,
            generation_id=bootstrapped["generation_id"],
            attempt_id="attempt-task",
        )
        source = _append_user(
            store,
            owner_chat_id="chat-task",
            session_id="session-task",
            attempt_id="attempt-task",
            event_id="task-status-redaction-source",
        )

        with pytest.raises(WorkspaceRepositoryError, match="redaction failed"):
            binding.service.update(
                expected_revision=1,
                patch={"constraints": ("Keep status stable",)},
                source_event_refs=(
                    ResourceRef("context_event", source["event_id"], 1),
                ),
                operation_id="task-status-redaction-update",
            )

        with sqlite3.connect(store.db_path) as connection:
            row = connection.execute(
                "SELECT revision, state_json FROM pinned_task_state "
                "WHERE owner_chat_id='chat-task'"
            ).fetchone()
            receipt_count = connection.execute(
                "SELECT COUNT(*) FROM operations WHERE operation_id=?",
                ("task-status-redaction-update",),
            ).fetchone()[0]
        assert row[0] == 1
        assert json.loads(row[1]).get("status", "in_progress") == "in_progress"
        assert receipt_count == 0
    finally:
        store.close()


def test_task_state_storage_redactor_receives_the_physical_patch_shape(tmp_path):
    observed = []

    def observing_redactor(value):
        observed.append(value)
        return value

    root = tmp_path / "memory_v2"
    store = MemoryV2Store(root, redactor=observing_redactor)
    try:
        bootstrapped = store.bootstrap_current_request(
            owner_chat_id="chat-task",
            session_id="session-task",
            attempt_id="attempt-task",
            message={"content": "Initial objective"},
            operation_id="task-physical-redaction-bootstrap",
        )
        binding = _bind(
            store,
            generation_id=bootstrapped["generation_id"],
            attempt_id="attempt-task",
        )
        artifact = ResourceRef("artifact", "artifact-physical", 1)
        memory = ResourceRef("memory", "memory-physical", 2, "space-chat")
        observed.clear()

        redacted = binding.repository.redact_patch_for_storage(
            {
                "success_criteria": ("Preserve exact shape",),
                "artifact_refs": (artifact,),
                "memory_refs": (memory,),
                "status": "in_progress",
            }
        )

        assert observed == [
            {
                "success_criteria": ["Preserve exact shape"],
                "artifact_memory_refs": [
                    PupuRefCodec.encode(artifact),
                    PupuRefCodec.encode(memory),
                ],
                "status": "in_progress",
            }
        ]
        assert redacted == {
            "success_criteria": ("Preserve exact shape",),
            "artifact_refs": (artifact,),
            "memory_refs": (memory,),
            "status": "in_progress",
        }
    finally:
        store.close()


def test_task_state_durable_and_receipt_provenance_stay_bounded(
    task_state_stack,
):
    _root, store, _bootstrapped, binding = task_state_stack
    current = binding.service.get()
    latest_ref = None
    for index in range(300):
        source = _append_user(
            store,
            owner_chat_id="chat-task",
            session_id="session-task",
            attempt_id="attempt-task",
            event_id=f"task-state-distinct-{index}",
        )
        latest_ref = ResourceRef("context_event", source["event_id"], 1)
        current = binding.service.update(
            expected_revision=current.revision,
            patch={"constraints": (f"Revision {index}",)},
            source_event_refs=(latest_ref,),
            operation_id=f"task-state-distinct-update-{index}",
        )

    with sqlite3.connect(store.db_path) as connection:
        durable_ids = json.loads(
            connection.execute(
                "SELECT source_event_ids_json FROM pinned_task_state "
                "WHERE owner_chat_id='chat-task'"
            ).fetchone()[0]
        )
        receipt = json.loads(
            connection.execute(
                "SELECT response_json FROM operations WHERE operation_id=?",
                ("task-state-distinct-update-299",),
            ).fetchone()[0]
        )

    assert current.source_event_refs == (latest_ref,)
    assert durable_ids == [latest_ref.resource_id]
    assert receipt["source_event_refs"] == [
        f"pupu://context/event/{latest_ref.resource_id}"
    ]


def test_task_state_old_cumulative_provenance_is_read_with_a_safe_bound(
    task_state_stack,
):
    _root, store, _bootstrapped, binding = task_state_stack
    legacy_sources = [f"legacy-source-{index}" for index in range(261)]
    with sqlite3.connect(store.db_path) as connection:
        row = connection.execute(
            "SELECT pinned_state_id, state_json FROM pinned_task_state "
            "WHERE owner_chat_id='chat-task'"
        ).fetchone()
        legacy_state = json.loads(row[1])
        legacy_state.pop("_unchain_current_source_event_ids_v1", None)
        legacy_state["constraints"] = ["Preserved legacy constraint"]
        connection.execute(
            "UPDATE pinned_task_state SET state_json=?, source_event_ids_json=? "
            "WHERE pinned_state_id=?",
            (
                json.dumps(legacy_state, sort_keys=True, separators=(",", ":")),
                json.dumps(legacy_sources, separators=(",", ":")),
                row[0],
            ),
        )

    state = binding.service.get()

    assert state.constraints == ("Preserved legacy constraint",)
    assert len(state.source_event_refs) == 255
    assert state.source_event_refs[0].resource_id == "legacy-source-6"
    assert state.source_event_refs[-1].resource_id == "legacy-source-260"
