from __future__ import annotations

import hashlib
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

import pytest

from context_memory_v2_repository import (
    PupuContextMemoryV2Repository,
    PupuExecutionScope,
)
from memory_v2_store import MemoryV2Store
from unchain.context import (
    CheckpointWriteStatus,
    ContextBudget,
    ContextBuildEnvelope,
    ContextBuildReceipt,
    ContextBuildStatus,
    PreparedCheckpoint,
)
from unchain.context.ports import ContextConflictError, ContextScopeError
from unchain.journal import (
    EventCursor,
    EventRange,
    JournalSnapshot,
    OperationRef,
)
from unchain.journal.ports import JournalRepositoryError


def _operation(identifier: str, payload: str | None = None) -> OperationRef:
    body = payload if payload is not None else identifier
    return OperationRef(
        identifier,
        hashlib.sha256(body.encode("utf-8")).hexdigest(),
    )


def _seed_execution(
    store: MemoryV2Store,
    *,
    owner_chat_id: str = "chat-a",
    session_id: str = "session-a",
    attempt_id: str = "attempt-a",
) -> tuple[PupuExecutionScope, object]:
    seeded = store.append_semantic_event(
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        attempt_id=attempt_id,
        event={
            "event_id": f"event-{session_id}-seed",
            "type": "message.user",
            "payload": {"content": "Initial objective"},
        },
        operation_id=f"operation-{session_id}-seed",
        operation_payload_hash=_operation(
            f"operation-{session_id}-seed"
        ).payload_sha256,
    )
    scope = PupuExecutionScope(
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        generation_id=seeded["generation_id"],
        attempt_id=attempt_id,
    )
    repository = PupuContextMemoryV2Repository(store)
    return scope, repository.bind_execution(scope)


def _envelope(
    scope: PupuExecutionScope,
    *,
    build_id: str,
    source_range: EventRange,
) -> ContextBuildEnvelope:
    return ContextBuildEnvelope(
        build_id=build_id,
        execution_id=scope.session_id,
        generation_id=scope.generation_id,
        attempt_id=scope.attempt_id,
        provider="synthetic",
        model="synthetic",
        budget=ContextBudget(16_000, 2_048, 512, 13_440, 12_096),
        source_range=source_range,
        included_ranges=(source_range,),
        estimated_input_tokens=512,
        status=ContextBuildStatus.COMPLETE,
    )


def test_execution_journal_captures_one_atomic_bounded_logical_snapshot(tmp_path):
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        scope, capabilities = _seed_execution(store)
        _seed_execution(
            store,
            owner_chat_id="chat-b",
            session_id="session-b",
            attempt_id="attempt-b",
        )
        store.append_semantic_event(
            owner_chat_id=scope.owner_chat_id,
            session_id=scope.session_id,
            attempt_id=scope.attempt_id,
            expected_generation_id=scope.generation_id,
            event={
                "event_id": "event-session-a-second",
                "type": "message.user",
                "payload": {"content": "Second request"},
            },
            operation_id="operation-session-a-second",
            operation_payload_hash=_operation(
                "operation-session-a-second"
            ).payload_sha256,
        )

        snapshot = capabilities.journal.capture_snapshot()

        assert isinstance(snapshot, JournalSnapshot)
        assert snapshot.execution_id == scope.session_id
        assert [event.event_id for event in snapshot.events] == [
            "event-session-a-seed",
            "event-session-a-second",
        ]
        assert [event.store_seq for event in snapshot.events] == [1, 2]
        assert snapshot.high_water == EventCursor(2, "event-session-a-second")
        assert JournalSnapshot.from_dict(snapshot.to_dict()) == snapshot

        with pytest.raises(JournalRepositoryError):
            capabilities.journal.capture_snapshot(max_events=1)
        with pytest.raises(JournalRepositoryError):
            capabilities.journal.capture_snapshot(max_bytes=1)
    finally:
        store.close()


def test_execution_snapshot_is_reproducible_after_store_restart(tmp_path):
    root = tmp_path / "memory_v2"
    store = MemoryV2Store(root)
    scope, capabilities = _seed_execution(store)
    before = capabilities.journal.capture_snapshot()
    store.close()

    reopened = MemoryV2Store(root)
    try:
        rebound = PupuContextMemoryV2Repository(reopened).bind_execution(scope)
        assert rebound.journal.capture_snapshot() == before
    finally:
        reopened.close()


def test_checkpoint_prepare_is_hidden_until_idempotent_commit(tmp_path):
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        _scope, capabilities = _seed_execution(store)
        snapshot = capabilities.journal.capture_snapshot()
        source_range = EventRange(snapshot.high_water, snapshot.high_water)
        operation = _operation("prepare-checkpoint")

        prepared = capabilities.checkpoints.prepare(
            source_range=source_range,
            summary="Durable checkpoint",
            refs=(),
            operation=operation,
        )
        replayed = capabilities.checkpoints.prepare(
            source_range=source_range,
            summary="Durable checkpoint",
            refs=(),
            operation=operation,
        )

        assert isinstance(prepared, PreparedCheckpoint)
        assert prepared.status is CheckpointWriteStatus.PREPARED
        assert prepared.duplicate is False
        assert replace(replayed, duplicate=False) == prepared
        assert replayed.duplicate is True
        assert capabilities.checkpoints.get_by_operation(
            operation=operation
        ) == prepared
        with pytest.raises(ContextScopeError):
            capabilities.checkpoints.read(ref=prepared.checkpoint_ref)

        committed = capabilities.checkpoints.commit(prepared=prepared)
        committed_replay = capabilities.checkpoints.commit(prepared=prepared)

        assert committed.status is CheckpointWriteStatus.COMMITTED
        assert committed.duplicate is False
        assert replace(committed_replay, duplicate=False) == committed
        assert committed_replay.duplicate is True
        assert capabilities.checkpoints.read(
            ref=committed.checkpoint_ref
        ) == b"Durable checkpoint"
        assert capabilities.checkpoints.get_by_operation(
            operation=operation
        ) == committed
    finally:
        store.close()


def test_checkpoint_preparation_recovers_and_commits_after_restart(tmp_path):
    root = tmp_path / "memory_v2"
    store = MemoryV2Store(root)
    scope, capabilities = _seed_execution(store)
    snapshot = capabilities.journal.capture_snapshot()
    operation = _operation("restart-checkpoint")
    prepared = capabilities.checkpoints.prepare(
        source_range=EventRange(snapshot.high_water, snapshot.high_water),
        summary="Recover me",
        refs=(),
        operation=operation,
    )
    store.close()

    reopened = MemoryV2Store(root)
    try:
        rebound = PupuContextMemoryV2Repository(reopened).bind_execution(scope)
        restored = rebound.checkpoints.get_by_operation(operation=operation)
        assert restored == prepared
        committed = rebound.checkpoints.commit(prepared=restored)
        assert committed.status is CheckpointWriteStatus.COMMITTED
        assert rebound.checkpoints.read(
            ref=committed.checkpoint_ref
        ) == b"Recover me"
    finally:
        reopened.close()


def test_checkpoint_operation_identity_fails_closed_on_payload_alias(tmp_path):
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        _scope, capabilities = _seed_execution(store)
        snapshot = capabilities.journal.capture_snapshot()
        source_range = EventRange(snapshot.high_water, snapshot.high_water)
        capabilities.checkpoints.prepare(
            source_range=source_range,
            summary="Original",
            refs=(),
            operation=_operation("checkpoint-operation", "original"),
        )

        with pytest.raises(ContextConflictError):
            capabilities.checkpoints.get_by_operation(
                operation=_operation("checkpoint-operation", "changed")
            )
        with pytest.raises(ContextConflictError):
            capabilities.checkpoints.prepare(
                source_range=source_range,
                summary="Changed",
                refs=(),
                operation=_operation("checkpoint-operation", "changed"),
            )
    finally:
        store.close()


def test_context_build_receipt_claims_trigger_and_replays_after_restart(tmp_path):
    root = tmp_path / "memory_v2"
    store = MemoryV2Store(root)
    scope, capabilities = _seed_execution(store)
    snapshot = capabilities.journal.capture_snapshot()
    source_range = EventRange(snapshot.high_water, snapshot.high_water)
    envelope = _envelope(scope, build_id="build-1", source_range=source_range)
    operation = _operation("record-build-1")

    first = capabilities.context_builds.record(
        envelope=envelope,
        operation=operation,
        trigger_cursor=snapshot.high_water,
    )
    replay = capabilities.context_builds.record(
        envelope=envelope,
        operation=operation,
        trigger_cursor=snapshot.high_water,
    )

    assert isinstance(first, ContextBuildReceipt)
    assert first.envelope == envelope
    assert first.operation == operation
    assert first.trigger_cursor == snapshot.high_water
    assert first.duplicate is False
    assert replace(replay, duplicate=False) == first
    assert replay.duplicate is True
    assert capabilities.context_builds.get_by_operation(
        operation=operation
    ) == first
    assert capabilities.context_builds.get_by_trigger(
        trigger_cursor=snapshot.high_water
    ) == first
    assert capabilities.context_builds.latest(
        generation_id=scope.generation_id
    ) == envelope
    assert sum(
        event.event_type == "context.build"
        for event in capabilities.journal.read(limit=100).events
    ) == 1
    store.close()

    reopened = MemoryV2Store(root)
    try:
        rebound = PupuContextMemoryV2Repository(reopened).bind_execution(scope)
        assert rebound.context_builds.get_by_operation(
            operation=operation
        ) == first
        assert rebound.context_builds.get_by_trigger(
            trigger_cursor=snapshot.high_water
        ) == first
    finally:
        reopened.close()


def test_context_build_trigger_claim_is_atomic_across_distinct_operations(tmp_path):
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        scope, capabilities = _seed_execution(store)
        snapshot = capabilities.journal.capture_snapshot()
        source_range = EventRange(snapshot.high_water, snapshot.high_water)
        envelopes = (
            _envelope(scope, build_id="build-race-a", source_range=source_range),
            _envelope(scope, build_id="build-race-b", source_range=source_range),
        )

        def record(index: int):
            return capabilities.context_builds.record(
                envelope=envelopes[index],
                operation=_operation(f"record-build-race-{index}"),
                trigger_cursor=snapshot.high_water,
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(record, index) for index in range(2)]
            outcomes = []
            for future in futures:
                try:
                    outcomes.append(future.result())
                except ContextConflictError as exc:
                    outcomes.append(exc)

        receipts = [item for item in outcomes if isinstance(item, ContextBuildReceipt)]
        conflicts = [item for item in outcomes if isinstance(item, ContextConflictError)]
        assert len(receipts) == 1
        assert len(conflicts) == 1
        assert capabilities.context_builds.get_by_trigger(
            trigger_cursor=snapshot.high_water
        ).envelope == receipts[0].envelope
        assert sum(
            event.event_type == "context.build"
            for event in capabilities.journal.read(limit=100).events
        ) == 1
    finally:
        store.close()


def test_context_build_operation_cannot_alias_a_different_trigger(tmp_path):
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        scope, capabilities = _seed_execution(store)
        first_snapshot = capabilities.journal.capture_snapshot()
        first_range = EventRange(first_snapshot.high_water, first_snapshot.high_water)
        operation = _operation("same-build-operation")
        capabilities.context_builds.record(
            envelope=_envelope(
                scope,
                build_id="build-first-trigger",
                source_range=first_range,
            ),
            operation=operation,
            trigger_cursor=first_snapshot.high_water,
        )
        store.append_semantic_event(
            owner_chat_id=scope.owner_chat_id,
            session_id=scope.session_id,
            attempt_id=scope.attempt_id,
            expected_generation_id=scope.generation_id,
            event={
                "event_id": "event-next-trigger",
                "type": "message.user",
                "payload": {"content": "Next input"},
            },
            operation_id="operation-next-trigger",
            operation_payload_hash=_operation(
                "operation-next-trigger"
            ).payload_sha256,
        )
        second_snapshot = capabilities.journal.capture_snapshot()
        second_range = EventRange(second_snapshot.high_water, second_snapshot.high_water)

        with pytest.raises(ContextConflictError):
            capabilities.context_builds.record(
                envelope=_envelope(
                    scope,
                    build_id="build-second-trigger",
                    source_range=second_range,
                ),
                operation=operation,
                trigger_cursor=second_snapshot.high_water,
            )
    finally:
        store.close()
