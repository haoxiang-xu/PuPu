from __future__ import annotations

import base64
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import pytest

from context_memory_v2_repository import (
    PupuContextMemoryV2Repository,
    PupuExecutionScope,
    PupuRefCodec,
)
from memory_v2_runtime import MemoryV2Runtime
from memory_v2_store import MemoryV2Error, MemoryV2Store, SCHEMA_VERSION
from unchain.context import (
    ArtifactService,
    ContextBudget,
    ContextBuildEnvelope,
    ContextBuildStatus,
)
from unchain.context.ports import ContextRepositoryError, ContextScopeError
from unchain.journal import (
    ArtifactRef,
    AttemptRef,
    EventCursor,
    EventRange,
    GenerationRef,
    JournalAppendRequest,
    OperationRef,
    ResourceRef,
)
from unchain.journal.ports import (
    JournalConflictError,
    JournalRepositoryError,
    JournalScopeError,
)
from unchain.journal.runtime import DurableEventSink
from unchain.memory.workspace import MemoryEntry, MemoryEntryKind
from unchain.memory.workspace.ports import (
    RepositoryConflictError,
    RepositoryNotFoundError,
    WorkspaceRepositoryError,
)


SHA_A = "a" * 64
SHA_B = "b" * 64


def _operation(identifier: str, digest: str = SHA_A) -> OperationRef:
    return OperationRef(identifier, digest)


def _schema_snapshot(db_path) -> tuple[int, tuple[tuple[str, str, str, str], ...]]:
    with sqlite3.connect(db_path) as connection:
        version = int(connection.execute("PRAGMA user_version").fetchone()[0])
        rows = connection.execute(
            "SELECT type, name, tbl_name, COALESCE(sql, '') FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        ).fetchall()
    normalized = tuple(
        (kind, name, table, " ".join(sql.split())) for kind, name, table, sql in rows
    )
    return version, normalized


def _row_counts(db_path, *tables: str) -> dict[str, int]:
    with sqlite3.connect(db_path) as connection:
        return {
            table: int(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
            for table in tables
        }


def _durable_record_hash(db_path) -> str:
    queries = {
        "events": (
            "SELECT event_id, generation_id, attempt_id, store_seq, payload_hash "
            "FROM events ORDER BY store_seq"
        ),
        "artifacts": (
            "SELECT artifact_id, revision, generation_id, object_id, mime_type "
            "FROM artifacts ORDER BY artifact_id"
        ),
        "objects": (
            "SELECT object_id, byte_size, state, detected_mime, media_class "
            "FROM objects ORDER BY object_id"
        ),
        "operations": (
            "SELECT operation_id, operation_kind, payload_hash, response_json "
            "FROM operations ORDER BY operation_id"
        ),
    }
    with sqlite3.connect(db_path) as connection:
        payload = {
            table: [list(row) for row in connection.execute(query).fetchall()]
            for table, query in queries.items()
        }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _frozen_fixture_durable_hash(db_path) -> str:
    queries = {
        "events": (
            "SELECT event_id, generation_id, attempt_id, store_seq, payload_hash "
            "FROM events ORDER BY store_seq"
        ),
        "artifacts": (
            "SELECT artifact_id, revision, generation_id, object_id, mime_type "
            "FROM artifacts ORDER BY artifact_id"
        ),
        "entries": (
            "SELECT entry_id, revision, space_id, virtual_path, kind, object_id, "
            "source_event_id FROM entries ORDER BY entry_id"
        ),
        "entry_revisions": (
            "SELECT entry_id, revision, space_id, virtual_path, kind, object_id, "
            "source_event_id FROM entry_revisions ORDER BY entry_id, revision"
        ),
        "links": (
            "SELECT link_id, space_id, entry_id, entry_revision, url "
            "FROM links ORDER BY link_id"
        ),
        "candidates": (
            "SELECT candidate_id, owner_chat_id, source_event_ids_json, target_space_id, "
            "target_path, kind, object_id, status, revision FROM candidates "
            "ORDER BY candidate_id"
        ),
        "promotions": (
            "SELECT promotion_id, owner_chat_id, source_space_id, source_entry_id, "
            "source_entry_revision, target_namespace, target_path, status, revision "
            "FROM promotions ORDER BY promotion_id"
        ),
        "operations": (
            "SELECT operation_id, operation_kind, payload_hash, response_json "
            "FROM operations ORDER BY operation_id"
        ),
    }
    with sqlite3.connect(db_path) as connection:
        payload = {
            table: [list(row) for row in connection.execute(query).fetchall()]
            for table, query in queries.items()
        }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(128 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@pytest.fixture()
def bound_repository(tmp_path):
    store = MemoryV2Store(tmp_path / "memory_v2")
    seed = store.append_semantic_event(
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-a",
        event={
            "event_id": "event-seed",
            "type": "message.user",
            "seq": 1,
            "data": {"content": "Initial objective"},
        },
        operation_id="seed-event",
    )
    scope = PupuExecutionScope(
        owner_chat_id="chat-a",
        session_id="session-a",
        generation_id=seed["generation_id"],
        attempt_id="attempt-a",
    )
    host = PupuContextMemoryV2Repository(store)
    capabilities = host.bind_execution(scope)
    try:
        yield store, host, scope, capabilities
    finally:
        store.close()


@pytest.mark.parametrize(
    "ref,uri",
    [
        (ResourceRef("artifact", "artifact-1", 2), "pupu://artifact/artifact-1@2"),
        (
            ResourceRef("memory", "entry-1", 3, "space-1"),
            "pupu://memory/space-1/entry-1@3",
        ),
        (ResourceRef("context_event", "event-1", 1), "pupu://context/event/event-1"),
        (
            ResourceRef("context_event", "event-1", 1, "content"),
            "pupu://context/event/event-1/content",
        ),
        (
            ResourceRef("checkpoint", "checkpoint-1", 1),
            "pupu://context/checkpoint/checkpoint-1",
        ),
        (
            ResourceRef("checkpoint", "checkpoint-1", 1, "event/3"),
            "pupu://context/checkpoint/checkpoint-1/event/3",
        ),
        (
            ResourceRef("memory_candidate", "candidate-1", 4),
            "pupu://memory/candidate/candidate-1@4",
        ),
        (
            ResourceRef("memory_review", "review-1", 2, "diff"),
            "pupu://memory/review/review-1@2/diff",
        ),
    ],
)
def test_pupu_ref_codec_preserves_public_uri_bytes(ref, uri):
    assert PupuRefCodec.encode(ref) == uri
    assert PupuRefCodec.decode(uri) == ref


@pytest.mark.parametrize(
    "uri",
    [
        "pupu://artifact/a@0",
        "pupu://artifact/a@01",
        "pupu://memory/space/entry",
        "pupu://memory/space/%2e%2e@1",
        "pupu://context/checkpoint/a/event/0",
        "pupu://memory/review/a@1/raw",
        " pupu://artifact/a@1",
        "file:///tmp/context_v2.sqlite3",
    ],
)
def test_pupu_ref_codec_rejects_noncanonical_or_unknown_refs(uri):
    with pytest.raises(ValueError):
        PupuRefCodec.decode(uri)


def test_bound_journal_is_durable_idempotent_and_generation_scoped(bound_repository):
    store, host, scope, capabilities = bound_repository
    legacy_seed = capabilities.journal.read(limit=1).events[0]
    assert legacy_seed.event_id == "event-seed"
    assert legacy_seed.operation.operation_id == "seed-event"
    request = JournalAppendRequest(
        event_id="event-port",
        event_type="message.user",
        attempt=AttemptRef(
            GenerationRef(scope.session_id, scope.generation_id),
            scope.attempt_id,
        ),
        operation=_operation("append-port"),
        payload={"data": {"content": "Durable through the port"}},
    )

    first = capabilities.journal.append(request=request)
    replay = capabilities.journal.append(request=request)
    aliased_replay = capabilities.journal.append(
        request=replace(
            request,
            operation=_operation("append-port-alias"),
        )
    )
    assert first.duplicate is False
    assert replay.duplicate is True
    assert aliased_replay.duplicate is True
    assert replay.cursor == first.cursor
    assert aliased_replay.cursor == first.cursor
    assert first.event.operation == request.operation
    assert replay.event.operation == request.operation
    assert aliased_replay.event.operation == request.operation
    assert first.event.payload == request.payload
    assert first.event.resource_refs == ()

    page = capabilities.journal.read(after=EventCursor(1, "event-seed"), limit=1)
    assert page.events == (first.event,)
    assert page.events[0].payload["data"]["content"] == "Durable through the port"
    assert page.next_cursor == first.cursor

    with pytest.raises(JournalConflictError):
        capabilities.journal.append(
            request=replace(
                request,
                payload={"data": {"content": "Changed"}},
                operation=_operation("append-port", SHA_B),
            )
        )
    with pytest.raises(JournalConflictError):
        capabilities.journal.append(
            request=replace(
                request,
                operation=_operation("append-port", SHA_B),
            )
        )
    with pytest.raises(JournalScopeError):
        capabilities.journal.append(
            request=replace(
                request,
                operation=_operation("append-foreign"),
                attempt=AttemptRef(
                    GenerationRef("session-foreign", scope.generation_id),
                    scope.attempt_id,
                ),
            )
        )
    with pytest.raises(JournalScopeError):
        capabilities.journal.read(after=EventCursor(1, "event-forged"))

    root = store.root_dir
    store.close()
    reopened = MemoryV2Store(root)
    try:
        rebound = PupuContextMemoryV2Repository(reopened).bind_execution(scope)
        restored = rebound.journal.read(after=EventCursor(1, "event-seed"), limit=10)
        assert restored.events[0].event_id == "event-port"
        assert restored.events[0].operation == request.operation
        assert restored.events[0].payload["data"]["content"] == "Durable through the port"
    finally:
        reopened.close()


@pytest.mark.parametrize(
    "raw_declaration",
    (
        "pupu://artifact/not-an-array@1",
        [123],
        ["not-a-canonical-reference"],
    ),
)
def test_unbound_journal_read_fails_closed_on_malformed_stored_ref_declaration(
    bound_repository,
    raw_declaration,
) -> None:
    store, _host, scope, capabilities = bound_repository
    store.append_semantic_event(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        attempt_id=scope.attempt_id,
        operation_id=f"poison-stored-ref-{type(raw_declaration).__name__}",
        expected_generation_id=scope.generation_id,
        event={
            "schema_version": "unchain.journal_event.v1",
            "event_id": f"event-poison-stored-ref-{type(raw_declaration).__name__}",
            "type": "business.event",
            "session_id": scope.session_id,
            "run_id": scope.attempt_id,
            "payload": {"note": "poisoned raw declaration"},
            "links": {"resource_refs": raw_declaration},
        },
    )

    with pytest.raises(
        JournalRepositoryError,
        match="stored resource reference declaration",
    ):
        capabilities.journal.read(limit=10)


def test_bound_journal_append_does_not_rescan_all_operation_receipts(
    bound_repository,
    monkeypatch,
):
    store, _host, scope, capabilities = bound_repository
    original_loader = store.load_event_operation_receipts
    original_event_loader = store.load_events
    receipt_scans = 0
    event_reads = 0

    def counted_loader(**kwargs):
        nonlocal receipt_scans
        receipt_scans += 1
        return original_loader(**kwargs)

    def counted_event_loader(**kwargs):
        nonlocal event_reads
        event_reads += 1
        return original_event_loader(**kwargs)

    monkeypatch.setattr(store, "load_event_operation_receipts", counted_loader)
    monkeypatch.setattr(store, "load_events", counted_event_loader)

    appended = []
    for index in range(32):
        request = JournalAppendRequest(
            event_id=f"event-hot-append-{index}",
            event_type="message.user",
            attempt=AttemptRef(
                GenerationRef(scope.session_id, scope.generation_id),
                scope.attempt_id,
            ),
            operation=_operation(f"operation-hot-append-{index}"),
            payload={"index": index},
        )
        appended.append(capabilities.journal.append(request=request).event)

    assert receipt_scans == 0
    assert [event.operation.operation_id for event in appended] == [
        f"operation-hot-append-{index}" for index in range(32)
    ]

    restored = capabilities.journal.read(limit=64)
    assert receipt_scans == 1
    assert len(restored.events) == 33

    tail_request = JournalAppendRequest(
        event_id="event-hot-append-tail",
        event_type="message.user",
        attempt=AttemptRef(
            GenerationRef(scope.session_id, scope.generation_id),
            scope.attempt_id,
        ),
        operation=_operation("operation-hot-append-tail"),
        payload={"index": 32},
    )
    tail = capabilities.journal.append(request=tail_request)
    assert tail.event.operation == tail_request.operation
    reads_before_page = event_reads
    page = capabilities.journal.read(
        after=EventCursor(appended[-1].store_seq, appended[-1].event_id),
        limit=1,
    )
    assert page.events == (tail.event,)
    assert event_reads == reads_before_page + 1
    assert receipt_scans == 1


def test_bound_journal_cold_recovery_rejects_only_scoped_corrupt_receipts(
    bound_repository,
):
    store, host, scope, _capabilities = bound_repository
    with sqlite3.connect(store.db_path) as connection:
        connection.execute(
            "INSERT INTO operations(operation_id, operation_kind, payload_hash, "
            "response_json, created_at_ms) VALUES(?, ?, ?, ?, ?)",
            (
                "foreign-corrupt-receipt",
                "append_semantic_event",
                SHA_A,
                '{"operation_payload_hash":"' + SHA_A + '","generation_id":"foreign',
                1,
            ),
        )
    rebound = host.bind_execution(scope)
    assert rebound.journal.read(limit=10).events[0].event_id == "event-seed"

    with sqlite3.connect(store.db_path) as connection:
        connection.execute(
            "INSERT INTO operations(operation_id, operation_kind, payload_hash, "
            "response_json, created_at_ms) VALUES(?, ?, ?, ?, ?)",
            (
                "scoped-corrupt-receipt",
                "append_semantic_event",
                SHA_A,
                '{"operation_payload_hash":"'
                + SHA_A
                + f'","generation_id":"{scope.generation_id}"',
                2,
            ),
        )
    rebound = host.bind_execution(scope)
    with pytest.raises(JournalRepositoryError):
        rebound.journal.read(limit=10)


def test_stale_execution_binding_cannot_write_after_rebase(bound_repository):
    store, host, scope, _capabilities = bound_repository
    stale_scope = replace(scope, attempt_id="attempt-unused-before-rebase")
    stale_capabilities = host.bind_execution(stale_scope)
    store.seal_task(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        attempt_id=scope.attempt_id,
        outcome="completed",
        operation_id="seal-before-rebase",
    )
    head = store.get_session_head(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
    )
    store.rebase_session(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        replacement_history=[{"role": "user", "content": "Replacement objective"}],
        source_generation_id=scope.generation_id,
        expected_session_revision=head["session_revision"],
        operation_id="rebase-before-stale-append",
        reason="edit",
    )
    request = JournalAppendRequest(
        event_id="event-stale-capability",
        event_type="message.user",
        attempt=AttemptRef(
            GenerationRef(stale_scope.session_id, stale_scope.generation_id),
            stale_scope.attempt_id,
        ),
        operation=_operation("append-after-rebase"),
        payload={"data": {"content": "must not be persisted"}},
    )
    guarded_tables = (
        "events",
        "artifacts",
        "checkpoints",
        "context_builds",
        "object_staging",
        "operations",
    )
    before = _row_counts(store.db_path, *guarded_tables)
    before_tmp = sorted(path.name for path in store.tmp_dir.iterdir())
    before_objects = sorted(path.name for path in store.objects_dir.iterdir())

    with pytest.raises(JournalScopeError):
        stale_capabilities.journal.append(request=request)
    with pytest.raises(ContextScopeError):
        stale_capabilities.artifacts.put(
            content=b"must not be published",
            media_type="text/plain",
            operation=_operation("artifact-after-rebase"),
        )
    stale_envelope = ContextBuildEnvelope(
        build_id="build-after-rebase",
        execution_id=stale_scope.session_id,
        generation_id=stale_scope.generation_id,
        attempt_id=stale_scope.attempt_id,
        provider="synthetic",
        model="synthetic",
        budget=ContextBudget(16_000, 2_048, 512, 13_440, 12_096),
        estimated_input_tokens=256,
        status=ContextBuildStatus.COMPLETE,
    )
    with pytest.raises(ContextScopeError):
        stale_capabilities.context_builds.record(
            envelope=stale_envelope,
            operation=_operation("context-build-after-rebase"),
        )
    with pytest.raises(ContextScopeError):
        stale_capabilities.checkpoints.write(
            source_range=EventRange(
                EventCursor(1, "event-seed"),
                EventCursor(1, "event-seed"),
            ),
            summary="must not be persisted",
            refs=(),
            operation=_operation("checkpoint-after-rebase"),
        )

    current = store.load_events(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        include_payload=True,
    )
    assert all(
        event["event_id"] != "event-stale-capability"
        for event in current["events"]
    )
    assert _row_counts(store.db_path, *guarded_tables) == before
    assert sorted(path.name for path in store.tmp_dir.iterdir()) == before_tmp
    assert sorted(path.name for path in store.objects_dir.iterdir()) == before_objects


def test_generation_race_discards_unpublished_artifact_staging(
    bound_repository,
    monkeypatch,
):
    store, _host, _scope, capabilities = bound_repository
    original_assertion = store._assert_current_generation
    calls = 0

    def race_generation_fence(**kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return original_assertion(**kwargs)
        raise MemoryV2Error(
            "context_v2_generation_conflict",
            "generation changed between preflight and commit",
            status_code=409,
            retryable=True,
        )

    monkeypatch.setattr(store, "_assert_current_generation", race_generation_fence)
    before = _row_counts(store.db_path, "object_staging", "objects", "events", "artifacts")
    before_tmp = sorted(path.name for path in store.tmp_dir.iterdir())
    before_objects = sorted(path.name for path in store.objects_dir.iterdir())

    with pytest.raises(ContextScopeError):
        capabilities.artifacts.put(
            content=b"discard this race payload",
            media_type="text/plain",
            operation=_operation("artifact-generation-race"),
        )

    assert calls == 2
    assert _row_counts(
        store.db_path,
        "object_staging",
        "objects",
        "events",
        "artifacts",
    ) == before
    assert sorted(path.name for path in store.tmp_dir.iterdir()) == before_tmp
    assert sorted(path.name for path in store.objects_dir.iterdir()) == before_objects


def test_artifact_checkpoint_and_context_build_round_trip(bound_repository):
    store, host, scope, capabilities = bound_repository
    artifact = capabilities.artifacts.put(
        content=b"complete tool result",
        media_type="text/plain",
        preview="complete tool result",
        operation=_operation("put-artifact"),
    )
    assert PupuRefCodec.encode(artifact.ref).startswith("pupu://artifact/")
    assert capabilities.artifacts.read_verified(
        artifact=artifact,
        offset=9,
        limit=4,
    ) == b"tool"
    with pytest.raises(ContextRepositoryError, match="sha256"):
        capabilities.artifacts.read_verified(
            artifact=replace(artifact, sha256="0" * 64),
            offset=0,
            limit=1,
        )

    assert capabilities.artifacts.read_full_verified(artifact=artifact) == (
        b"complete tool result"
    )

    checkpoint_ref = capabilities.checkpoints.write(
        source_range=EventRange(
            EventCursor(1, "event-seed"),
            EventCursor(1, "event-seed"),
        ),
        summary="Deterministic checkpoint",
        refs=(artifact.ref,),
        operation=_operation("write-checkpoint"),
    )
    assert capabilities.checkpoints.read(ref=checkpoint_ref) == b"Deterministic checkpoint"

    envelope = ContextBuildEnvelope(
        build_id="build-1",
        execution_id=scope.session_id,
        generation_id=scope.generation_id,
        attempt_id=scope.attempt_id,
        provider="synthetic",
        model="synthetic",
        budget=ContextBudget(16_000, 2_048, 512, 13_440, 12_096),
        source_range=EventRange(
            EventCursor(1, "event-seed"),
            EventCursor(1, "event-seed"),
        ),
        checkpoint_refs=(checkpoint_ref,),
        artifact_refs=(artifact.ref,),
        estimated_input_tokens=512,
        status=ContextBuildStatus.COMPLETE,
    )
    assert capabilities.context_builds.record(
        envelope=envelope,
        operation=_operation("record-build"),
    ) == envelope
    assert capabilities.context_builds.latest(generation_id=scope.generation_id) == envelope
    assert any(
        event.event_type == "context.build"
        for event in capabilities.journal.read(limit=20).events
    )
    store.append_semantic_event(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        attempt_id=scope.attempt_id,
        event={
            "event_id": "event-unprojected-context-build",
            "type": "context.build",
            "payload": replace(envelope, build_id="forged-build").to_dict(),
        },
        operation_id="append-unprojected-context-build",
    )
    assert capabilities.context_builds.latest(generation_id=scope.generation_id) == envelope

    foreign_seed = store.append_semantic_event(
        owner_chat_id="chat-a",
        session_id="session-b",
        attempt_id="attempt-b",
        event={"event_id": "event-foreign", "type": "message.user", "seq": 1},
        operation_id="seed-foreign",
    )
    foreign = host.bind_execution(
        PupuExecutionScope(
            owner_chat_id="chat-a",
            session_id="session-b",
            generation_id=foreign_seed["generation_id"],
            attempt_id="attempt-b",
        )
    )
    with pytest.raises(ContextScopeError):
        foreign.artifacts.read_verified(artifact=artifact)

    store.seal_task(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        attempt_id=scope.attempt_id,
        outcome="completed",
        operation_id="seal-before-artifact-audit-rebase",
    )
    head = store.get_session_head(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
    )
    store.rebase_session(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        replacement_history=[{"role": "user", "content": "Replacement"}],
        source_generation_id=scope.generation_id,
        expected_session_revision=head["session_revision"],
        operation_id="rebase-before-artifact-audit",
        reason="edit",
    )
    with pytest.raises(ContextScopeError):
        capabilities.artifacts.read_verified(artifact=artifact)
    audit_page = store.read_audit_content(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        ref=PupuRefCodec.encode(artifact.ref),
    )
    assert base64.b64decode(audit_page["data"], validate=True) == b"complete tool result"

    store.append_semantic_event(
        owner_chat_id="chat-a",
        session_id="session-b",
        attempt_id="attempt-b",
        event={
            "event_id": "event-forged-artifact-reference",
            "type": "message.user",
            "seq": 2,
            "data": {"content": PupuRefCodec.encode(artifact.ref)},
        },
        operation_id="inject-artifact-reference",
    )
    forged_event = next(
        event
        for event in foreign.journal.read(limit=10).events
        if event.event_id == "event-forged-artifact-reference"
    )
    assert forged_event.resource_refs == ()
    with pytest.raises(ContextScopeError):
        foreign.artifacts.read_verified(artifact=artifact)


def test_artifact_full_read_uses_one_scoped_read_for_large_and_empty_objects(
    bound_repository,
    monkeypatch,
):
    store, _host, _scope, capabilities = bound_repository
    original = store.read_scoped_content
    calls = []

    def observed_read(**kwargs):
        calls.append(kwargs)
        return original(**kwargs)

    monkeypatch.setattr(store, "read_scoped_content", observed_read)
    large_content = b"x" * (128 * 1024 + 17)
    large = capabilities.artifacts.put(
        content=large_content,
        media_type="application/octet-stream",
        operation=_operation("put-large-artifact"),
    )
    empty = capabilities.artifacts.put(
        content=b"",
        media_type="application/octet-stream",
        operation=_operation("put-empty-artifact"),
    )
    service = ArtifactService(
        capabilities.artifacts,
        sanitizer=lambda content, media_type: content,
    )

    assert service.read_full(
        large,
        remaining_budget_bytes=len(large_content),
    ) == large_content
    assert service.read_full(empty, remaining_budget_bytes=0) == b""
    assert len(calls) == 2


@pytest.mark.parametrize(
    ("field", "bad_value", "message"),
    [
        ("ref", "pupu://artifact/foreign@1", "ref"),
        ("mime_type", "application/json", "media_type"),
        ("offset", 1, "offset"),
        ("offset", False, "offset"),
        ("total_bytes", 999, "byte_length"),
        ("sha256", "0" * 64, "sha256"),
        ("encoding", "hex", "encoding"),
        ("data", "%%%", "base64"),
        ("next_offset", 999, "range"),
        ("truncated", False, "range"),
    ],
)
def test_artifact_read_translates_malformed_store_responses(
    bound_repository,
    monkeypatch,
    field,
    bad_value,
    message,
):
    store, _host, _scope, capabilities = bound_repository
    artifact = capabilities.artifacts.put(
        content=b"complete tool result",
        media_type="text/plain",
        operation=_operation(f"put-malformed-{field}"),
    )
    original = store.read_scoped_content

    def malformed_read(**kwargs):
        page = dict(original(**kwargs))
        page[field] = bad_value
        return page

    monkeypatch.setattr(store, "read_scoped_content", malformed_read)

    with pytest.raises(ContextRepositoryError, match=message):
        capabilities.artifacts.read_verified(
            artifact=artifact,
            offset=0,
            limit=4,
        )


def test_durable_replay_accepts_schema_v4_artifact_operation_receipts(
    bound_repository,
):
    _store, _host, scope, capabilities = bound_repository
    ArtifactService(
        capabilities.artifacts,
        sanitizer=lambda content, media_type: content,
    ).persist(
        b"complete tool result",
        media_type="text/plain",
        operation_id="artifact-service-operation",
    )
    sink = DurableEventSink(
        capabilities.journal,
        AttemptRef(
            GenerationRef(scope.session_id, scope.generation_id),
            scope.attempt_id,
        ),
        lambda event: None,
    )

    replayed = sink.replay(page_size=1)

    assert any(event.event_type == "artifact.recorded" for event in replayed)


def test_store_issued_artifact_events_declare_only_their_exact_durable_ref(
    bound_repository,
):
    store, _host, scope, capabilities = bound_repository
    artifact = capabilities.artifacts.put(
        content=b"complete tool result",
        media_type="text/plain",
        operation=_operation("declared-artifact-ref"),
    )
    handoff = store.record_handoff(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        attempt_id=scope.attempt_id,
        expected_generation_id=scope.generation_id,
        operation_id="declared-handoff-ref",
        handoff={"summary": "child completed"},
        content=b'{"status":"complete"}',
    )
    store.record_context_build(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        attempt_id=scope.attempt_id,
        expected_generation_id=scope.generation_id,
        operation_id="context-build-without-artifact-ref",
        context={"build_id": "context-build-without-artifact-ref"},
    )

    events = capabilities.journal.read(limit=100).events
    artifact_event = next(
        event for event in events if event.event_type == "artifact.recorded"
    )
    handoff_event = next(
        event for event in events if event.event_type == "handoff.recorded"
    )
    context_build_event = next(
        event
        for event in events
        if event.event_type == "context.build"
        and event.payload.get("build_id") == "context-build-without-artifact-ref"
    )

    assert artifact_event.resource_refs == (artifact.ref,)
    assert handoff_event.resource_refs == (
        PupuRefCodec.decode(handoff["artifact_ref"]["uri"]),
    )
    assert context_build_event.resource_refs == ()


def test_store_issued_declared_ref_is_idempotent_and_payload_uris_are_not_promoted(
    bound_repository,
):
    store, _host, scope, capabilities = bound_repository
    request = {
        "owner_chat_id": scope.owner_chat_id,
        "session_id": scope.session_id,
        "attempt_id": scope.attempt_id,
        "expected_generation_id": scope.generation_id,
        "operation_id": "idempotent-declared-artifact-ref",
        "artifact": {
            "description": "pupu://artifact/caller-controlled@1",
        },
        "content": b"durable bytes",
        "mime_type": "application/octet-stream",
    }

    first = store.record_artifact(**request)
    second = store.record_artifact(**request)

    assert second["replayed"] is True
    assert second["event_id"] == first["event_id"]
    persisted = next(
        event
        for event in capabilities.journal.read(limit=100).events
        if event.event_id == first["event_id"]
    )
    assert persisted.resource_refs == (
        PupuRefCodec.decode(first["artifact_ref"]["uri"]),
    )
    assert ResourceRef("artifact", "caller-controlled", 1) not in (
        persisted.resource_refs
    )


def test_workspace_port_preserves_ids_cas_links_pagination_and_soft_delete(
    bound_repository,
):
    store, host, scope, capabilities = bound_repository
    artifact = capabilities.artifacts.put(
        content=b"workspace body",
        media_type="text/markdown",
        operation=_operation("workspace-content"),
    )
    workspace = host.ensure_chat_workspace(
        owner_chat_id="chat-a",
        name="Chat Memory",
        description="Bound workspace",
        operation=_operation("ensure-workspace"),
    )
    folder = workspace.compare_and_swap(
        entry=MemoryEntry(
            entry_id="entry-folder",
            space_id=workspace.space.space_id,
            path="/notes",
            name="notes",
            description="",
            kind=MemoryEntryKind.FOLDER,
            revision=1,
        ),
        expected_revision=None,
        operation=_operation("create-folder"),
    )
    assert folder.entry_id == "entry-folder"
    with pytest.raises(RepositoryConflictError):
        workspace.compare_and_swap(
            entry=replace(folder),
            expected_revision=None,
            operation=_operation("create-folder", SHA_B),
        )

    note = workspace.compare_and_swap(
        entry=MemoryEntry(
            entry_id="entry-note",
            space_id=workspace.space.space_id,
            path="/notes/a.md",
            name="a.md",
            description="A durable note",
            kind=MemoryEntryKind.MARKDOWN,
            revision=1,
            content_ref=artifact.ref,
            source_refs=(ResourceRef("context_event", "event-seed", 1),),
            media_type="text/markdown",
        ),
        expected_revision=None,
        operation=_operation("create-note"),
    )
    assert note.entry_id == "entry-note"
    assert workspace.read_entry(ref=ResourceRef("memory", "entry-note", 1)) == note
    with pytest.raises(RepositoryConflictError):
        workspace.compare_and_swap(
            entry=replace(
                note,
                entry_id="entry-note-casefold",
                path="/NOTES/A.MD",
                name="A.MD",
            ),
            expected_revision=None,
            operation=_operation("create-note-casefold"),
        )
    with pytest.raises(WorkspaceRepositoryError, match="tags"):
        workspace.compare_and_swap(
            entry=replace(
                note,
                entry_id="entry-tagged",
                path="/notes/tagged.md",
                name="tagged.md",
                tags=("tagged",),
            ),
            expected_revision=None,
            operation=_operation("create-tagged"),
        )

    store.append_semantic_event(
        owner_chat_id="chat-b",
        session_id="session-b",
        attempt_id="attempt-b",
        event={
            "event_id": "event-owned-by-another-chat",
            "type": "message.user",
        },
        operation_id="seed-foreign-workspace-source",
    )
    for source_id, operation_id in (
        ("event-does-not-exist", "create-missing-source"),
        ("event-owned-by-another-chat", "create-foreign-source"),
    ):
        with pytest.raises(RepositoryConflictError):
            workspace.compare_and_swap(
                entry=replace(
                    note,
                    entry_id=f"entry-{operation_id}",
                    path=f"/notes/{operation_id}.md",
                    name=f"{operation_id}.md",
                    source_refs=(ResourceRef("context_event", source_id, 1),),
                ),
                expected_revision=None,
                operation=_operation(operation_id),
            )

    for session_id, attempt_id in (
        ("session-duplicate-source-a", "attempt-duplicate-source-a"),
        ("session-duplicate-source-b", "attempt-duplicate-source-b"),
    ):
        store.append_semantic_event(
            owner_chat_id=scope.owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            event={
                "event_id": "event-ambiguous-workspace-source",
                "type": "message.user",
                "session": session_id,
            },
            operation_id=f"seed-{session_id}",
        )
    with pytest.raises(RepositoryConflictError):
        workspace.compare_and_swap(
            entry=replace(
                note,
                entry_id="entry-ambiguous-source",
                path="/notes/ambiguous-source.md",
                name="ambiguous-source.md",
                source_refs=(
                    ResourceRef(
                        "context_event",
                        "event-ambiguous-workspace-source",
                        1,
                    ),
                ),
            ),
            expected_revision=None,
            operation=_operation("create-ambiguous-source"),
        )
    ambiguous_ref = "pupu://context/event/event-ambiguous-workspace-source"
    with pytest.raises(MemoryV2Error) as ambiguous_read:
        store.read_scoped_content(
            owner_chat_id=scope.owner_chat_id,
            ref=ambiguous_ref,
        )
    assert ambiguous_read.value.code == "context_v2_content_not_found"
    scoped_read = store.read_scoped_content(
        owner_chat_id=scope.owner_chat_id,
        session_id="session-duplicate-source-a",
        ref=ambiguous_ref,
    )
    assert (
        json.loads(base64.b64decode(scoped_read["data"], validate=True))["session"]
        == "session-duplicate-source-a"
    )

    link = workspace.compare_and_swap(
        entry=MemoryEntry(
            entry_id="entry-link",
            space_id=workspace.space.space_id,
            path="/project",
            name="project",
            description="Project URL",
            kind=MemoryEntryKind.LINK,
            revision=1,
            link_url="https://example.test/project",
        ),
        expected_revision=None,
        operation=_operation("create-link"),
    )
    assert link.link_url == "https://example.test/project"

    first_page = workspace.list_entries(limit=2)
    second_page = workspace.list_entries(limit=2, cursor=first_page.next_cursor)
    assert first_page.has_more is True
    assert [entry.path for entry in (*first_page.entries, *second_page.entries)] == [
        "/notes",
        "/notes/a.md",
        "/project",
    ]
    assert [entry.entry_id for entry in workspace.search(query="durable")] == ["entry-note"]
    for unsafe_parent in ("/notes/../secret", "/etc", "/notes/%2e%2e"):
        with pytest.raises(ValueError):
            workspace.list_entries(parent_path=unsafe_parent)

    updated = workspace.compare_and_swap(
        entry=replace(note, revision=2, description="Updated durable note"),
        expected_revision=1,
        operation=_operation("update-note"),
    )
    replay = workspace.compare_and_swap(
        entry=replace(note, revision=2, description="Updated durable note"),
        expected_revision=1,
        operation=_operation("update-note"),
    )
    assert replay == updated
    with pytest.raises(RepositoryConflictError):
        workspace.compare_and_swap(
            entry=replace(note, revision=2, description="Conflicting update"),
            expected_revision=1,
            operation=_operation("update-note", SHA_B),
        )

    tombstone = workspace.compare_and_swap(
        entry=replace(updated, revision=3, deleted=True),
        expected_revision=2,
        operation=_operation("delete-note"),
    )
    assert tombstone.deleted is True
    assert workspace.read_entry(ref=ResourceRef("memory", "entry-note", 3)).deleted is True
    assert "entry-note" not in {
        entry.entry_id for entry in workspace.list_entries().entries
    }
    assert "entry-note" in {
        entry.entry_id
        for entry in workspace.list_entries(include_deleted=True).entries
    }
    with pytest.raises(RepositoryNotFoundError):
        workspace.read_entry(ref=ResourceRef("memory", "entry-note", 4))


def test_adapter_keeps_schema_v4_and_cas_layout_across_reopen(bound_repository):
    store, host, scope, capabilities = bound_repository
    before = _schema_snapshot(store.db_path)
    manifest = json.loads(
        (Path(__file__).with_name("fixtures") / "context_v2_schema_v4_manifest.json")
        .read_text(encoding="utf-8")
    )
    schema_records = [
        {"type": kind, "name": name, "table": table, "sql": sql}
        for kind, name, table, sql in before[1]
    ]
    schema_bytes = json.dumps(
        schema_records,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    assert hashlib.sha256(schema_bytes).hexdigest() == manifest["schema_sha256"]
    assert len(schema_records) == manifest["object_count"]
    assert [f"{item['type']}:{item['name']}" for item in schema_records] == manifest[
        "inventory"
    ]
    artifact = capabilities.artifacts.put(
        content=b"schema-preservation",
        media_type="application/octet-stream",
        operation=_operation("schema-artifact"),
    )
    after = _schema_snapshot(store.db_path)
    assert before == after
    assert after[0] == SCHEMA_VERSION == 4
    assert store.db_path.name == "context_v2.sqlite3"
    object_path = store.objects_dir / artifact.sha256
    assert object_path.read_bytes() == b"schema-preservation"
    assert hashlib.sha256(object_path.read_bytes()).hexdigest() == artifact.sha256
    durable_hash = _durable_record_hash(store.db_path)

    root = store.root_dir
    concurrent = MemoryV2Store(root)
    try:
        concurrent_capabilities = PupuContextMemoryV2Repository(
            concurrent
        ).bind_execution(scope)
        assert concurrent_capabilities.artifacts.read_verified(
            artifact=artifact
        ) == b"schema-preservation"
        assert _durable_record_hash(concurrent.db_path) == durable_hash
    finally:
        concurrent.close()
    store.close()
    reopened = MemoryV2Store(root)
    try:
        assert _schema_snapshot(reopened.db_path) == after
        with sqlite3.connect(reopened.db_path) as connection:
            assert connection.execute("PRAGMA quick_check").fetchone()[0] == "ok"
            assert connection.execute("PRAGMA journal_mode").fetchone()[0].casefold() == "wal"
        assert _durable_record_hash(reopened.db_path) == durable_hash
    finally:
        reopened.close()


def test_adapter_opens_frozen_schema_v4_sqlite_cas_fixture_without_rewrite(
    tmp_path,
):
    fixture_root = (
        Path(__file__).with_name("fixtures") / "context_v2_schema_v4_frozen"
    )
    manifest = json.loads((fixture_root / "manifest.json").read_text("utf-8"))
    assert manifest["sanitized_synthetic_data"] is True
    assert manifest["user_version"] == SCHEMA_VERSION == 4
    assert _file_sha256(fixture_root / "context_v2.sqlite3") == manifest[
        "database"
    ]["sha256"]
    assert [
        {
            "name": path.name,
            "bytes": path.stat().st_size,
            "sha256": _file_sha256(path),
        }
        for path in sorted((fixture_root / "objects").iterdir())
        if path.is_file()
    ] == manifest["objects"]

    copied_root = tmp_path / "frozen-schema-v4"
    shutil.copytree(fixture_root, copied_root)
    copied_manifest = copied_root / "manifest.json"
    copied_manifest.unlink()
    before_schema = _schema_snapshot(copied_root / "context_v2.sqlite3")
    schema_records = [
        {"type": kind, "name": name, "table": table, "sql": sql}
        for kind, name, table, sql in before_schema[1]
    ]
    assert hashlib.sha256(
        json.dumps(
            schema_records,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest() == manifest["schema_sha256"]
    before_rows = _frozen_fixture_durable_hash(
        copied_root / "context_v2.sqlite3"
    )
    assert before_rows == manifest["durable_rows_sha256"]
    with sqlite3.connect(copied_root / "context_v2.sqlite3") as connection:
        assert connection.execute("SELECT COUNT(*) FROM links").fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM candidates").fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM promotions").fetchone()[0] == 1
        assert connection.execute(
            "SELECT status FROM promotions WHERE promotion_id=?",
            (manifest["scope"]["promotion_id"],),
        ).fetchone()[0] == "pending"

    scope_data = manifest["scope"]
    store = MemoryV2Store(copied_root)
    try:
        capabilities = PupuContextMemoryV2Repository(store).bind_execution(
            PupuExecutionScope(
                owner_chat_id=scope_data["owner_chat_id"],
                session_id=scope_data["session_id"],
                generation_id=scope_data["generation_id"],
                attempt_id=scope_data["attempt_id"],
            )
        )
        events = capabilities.journal.read(limit=100).events
        assert events[0].event_id == "fixture-event-user"
        assert events[0].operation.operation_id == "fixture-event-operation"
        artifact_content = b"synthetic frozen artifact\n"
        artifact_ref = ArtifactRef(
            PupuRefCodec.decode(scope_data["artifact_ref"]),
            "text/plain",
            len(artifact_content),
            hashlib.sha256(artifact_content).hexdigest(),
        )
        assert capabilities.artifacts.read_verified(artifact=artifact_ref) == artifact_content
        entry_page = store.read_scoped_content(
            owner_chat_id=scope_data["owner_chat_id"],
            ref=scope_data["entry_ref"],
        )
        assert base64.b64decode(entry_page["data"], validate=True) == (
            b"# Synthetic state\n\nNo user data.\n"
        )
    finally:
        store.close()

    assert _schema_snapshot(copied_root / "context_v2.sqlite3") == before_schema
    assert _frozen_fixture_durable_hash(
        copied_root / "context_v2.sqlite3"
    ) == before_rows
    for record in manifest["objects"]:
        path = copied_root / "objects" / record["name"]
        assert path.stat().st_size == record["bytes"]
        assert _file_sha256(path) == record["sha256"]


def test_frozen_schema_v4_fixture_recovers_committed_artifact_after_process_exit(
    tmp_path,
):
    fixture_root = (
        Path(__file__).with_name("fixtures") / "context_v2_schema_v4_frozen"
    )
    manifest = json.loads((fixture_root / "manifest.json").read_text("utf-8"))
    copied_root = tmp_path / "crash-schema-v4"
    shutil.copytree(fixture_root, copied_root)
    (copied_root / "manifest.json").unlink()
    scope_data = manifest["scope"]
    server_root = Path(__file__).resolve().parents[1]
    child_source = """
import os
import sys
from pathlib import Path
from memory_v2_store import MemoryV2Store

store = MemoryV2Store(Path(sys.argv[1]))
store.record_artifact(
    owner_chat_id=sys.argv[2],
    session_id=sys.argv[3],
    attempt_id=sys.argv[4],
    expected_generation_id=sys.argv[5],
    operation_id='fixture-crash-artifact-operation',
    artifact={'kind': 'tool.result', 'preview': 'Committed before exit'},
    content=b'committed before abrupt process exit\\n',
    mime_type='text/plain',
    source_event_ids=('fixture-event-user',),
)
os._exit(91)
"""
    environment = dict(os.environ)
    existing_pythonpath = environment.get("PYTHONPATH", "")
    environment["PYTHONPATH"] = os.pathsep.join(
        part for part in (str(server_root), existing_pythonpath) if part
    )
    completed = subprocess.run(
        [
            sys.executable,
            "-c",
            child_source,
            str(copied_root),
            scope_data["owner_chat_id"],
            scope_data["session_id"],
            scope_data["attempt_id"],
            scope_data["generation_id"],
        ],
        cwd=server_root,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert completed.returncode == 91, completed.stderr

    reopened = MemoryV2Store(copied_root)
    try:
        with sqlite3.connect(reopened.db_path) as connection:
            assert connection.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        page = reopened.load_events(
            owner_chat_id=scope_data["owner_chat_id"],
            session_id=scope_data["session_id"],
            limit=100,
            include_payload=True,
        )
        artifact_events = [
            event
            for event in page["events"]
            if event["type"] == "artifact.recorded"
        ]
        assert len(artifact_events) == 2
        object_ids = {
            path.name for path in reopened.objects_dir.iterdir() if path.is_file()
        }
        with sqlite3.connect(reopened.db_path) as connection:
            assert connection.execute(
                "SELECT COUNT(*) FROM operations WHERE operation_id=?",
                ("fixture-crash-artifact-operation",),
            ).fetchone()[0] == 1
            expected_objects = {
                str(row[0])
                for row in connection.execute(
                    "SELECT object_id FROM objects WHERE state='ready'"
                ).fetchall()
            }
        assert object_ids == expected_objects
        assert all(
            _file_sha256(reopened.objects_dir / object_id) == object_id
            for object_id in object_ids
        )
    finally:
        reopened.close()


def test_runtime_exposes_a_lazy_bound_repository_factory(bound_repository):
    store, _host, scope, _capabilities = bound_repository
    runtime = MemoryV2Runtime(
        data_dir=store.root_dir.parent,
        root_dir=store.root_dir,
        store=store,
    )

    capabilities = runtime.bind_context_repositories(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        generation_id=scope.generation_id,
        attempt_id=scope.attempt_id,
    )

    assert capabilities.journal.execution_id == scope.session_id
