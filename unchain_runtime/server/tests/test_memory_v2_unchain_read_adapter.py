from __future__ import annotations

import base64
import sqlite3
from dataclasses import replace
from pathlib import Path

import pytest

from memory_v2_store_boundary import (
    STORE_OWNER_PUPU_LEGACY,
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_deletion_adapter import delete_pupu_unchain_chat
from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2Lifecycle,
    _initialize_lifecycle_schema,
    _persist_lifecycle,
)
from memory_v2_unchain_read_adapter import (
    PupuUnchainMemoryV2ReadError,
    open_pupu_unchain_memory_v2_reader,
    read_pupu_unchain_memory_v2_store_status,
)
from unchain.context import ArtifactService
from unchain.journal import (
    AttemptRef,
    EventCursor,
    EventRange,
    GenerationRef,
    JournalAppendRequest,
    OperationRef,
    ResourceRef,
)
from unchain.journal.runtime import build_operation_ref
from unchain.memory.workspace import MemorySpace, MemoryWorkspaceService
from unchain.memory.workspace.ports import BoundWorkspaceReferenceAuthorizer
from unchain.memory.toolkit import MemoryToolContentPage
from unchain.persistence.sqlite_context_compiler_v2 import (
    SQLiteContextCompilerV2Store,
)
from unchain.persistence.sqlite_curator_v2 import SQLiteCuratorV2Store
from unchain.persistence.sqlite_legacy_bootstrap_v2 import SQLiteLegacyBootstrapService
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_promotion_v2 import SQLitePromotionV2Store
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


class _References(BoundWorkspaceReferenceAuthorizer):
    def authorize(self, *, ref: ResourceRef) -> ResourceRef:
        return ref


def _seed_owner(
    *,
    context: SQLiteContextV2Store,
    memory: SQLiteMemoryV2Store,
    curator: SQLiteCuratorV2Store,
    database_path: Path,
    owner_chat_id: str,
    suffix: str,
):
    execution_id = f"execution-{suffix}"
    repository = context.bind_execution(execution_id)
    appended = []
    for index in (1, 2):
        appended.append(
            repository.append(
                request=JournalAppendRequest(
                    event_id=f"event-{suffix}-{index}",
                    event_type="message.user",
                    attempt=AttemptRef(
                        GenerationRef(execution_id, f"generation-{suffix}"),
                        f"attempt-{suffix}",
                    ),
                    operation=OperationRef(
                        f"operation-{suffix}-{index}",
                        f"{index:x}" * 64,
                    ),
                    payload={"content": f"message-{suffix}-{index}"},
                )
            )
        )
    space_id = f"space-{suffix}"
    binding_id = f"binding-{suffix}"
    workspace_repository = memory.bind_workspace(
        space=MemorySpace(
            space_id,
            "chat",
            f"Chat {suffix}",
            f"Workspace owned by {owner_chat_id}",
            1,
        ),
        owner_chat_id=owner_chat_id,
    )
    workspace = MemoryWorkspaceService(
        repository=workspace_repository,
        mutations=workspace_repository,
        content=workspace_repository,
        history=workspace_repository,
        links=workspace_repository,
        references=_References(binding_id),
    )
    event_ref = ResourceRef("context_event", appended[0].event.event_id, 1)
    entry = workspace.write_markdown(
        path=f"/notes/Architecture-{suffix}.md",
        description=f"Needle owned by {owner_chat_id}",
        content=f"private workspace bytes {suffix}",
        expected_space_revision=1,
        source_refs=(event_ref,),
        operation_id=f"memory-{suffix}",
    )
    curator.bind_curation(
        binding_id=binding_id,
        owner_chat_id=owner_chat_id,
        target_space_id=space_id,
    )
    lifecycle = PupuUnchainMemoryV2Lifecycle(
        owner_chat_id=owner_chat_id,
        execution_id=execution_id,
        generation_id=f"generation-{suffix}",
        attempt_id=f"attempt-{suffix}",
        root_run_id=f"run-{suffix}",
        binding_id=binding_id,
        chat_space_id=space_id,
    )
    _persist_lifecycle(
        database_path=database_path,
        lifecycle=lifecycle,
        operation_id=f"lifecycle-{suffix}",
        expected_revision=0,
    )
    return lifecycle, entry, repository


def _seed(root: Path):
    admission = admit_context_v2_store_owner(
        root_dir=root,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    database_path = admission.database_path
    object_directory = root / "objects"
    context = SQLiteContextV2Store(
        database_path=database_path,
        object_directory=object_directory,
    )
    compiler = SQLiteContextCompilerV2Store(context_store=context)
    memory = SQLiteMemoryV2Store(
        database_path=database_path,
        object_directory=object_directory,
    )
    curator = SQLiteCuratorV2Store(
        database_path=database_path,
        object_directory=object_directory,
    )
    SQLitePromotionV2Store(
        database_path=database_path,
        object_directory=object_directory,
    )
    SQLiteLegacyBootstrapService(context)
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS memory_host_v2_schema (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            INSERT OR IGNORE INTO memory_host_v2_schema(version) VALUES (1);
            CREATE TABLE IF NOT EXISTS memory_review_proposals (
                review_id TEXT PRIMARY KEY,
                binding_id TEXT NOT NULL
            );
            """
        )
    _initialize_lifecycle_schema(database_path)
    owner_a = _seed_owner(
        context=context,
        memory=memory,
        curator=curator,
        database_path=database_path,
        owner_chat_id="chat-a",
        suffix="a",
    )
    owner_b = _seed_owner(
        context=context,
        memory=memory,
        curator=curator,
        database_path=database_path,
        owner_chat_id="chat-b",
        suffix="b",
    )
    artifact = ArtifactService(
        owner_a[2],
        sanitizer=lambda content, media_type: content,
    ).persist(
        b"artifact-owned-by-a",
        media_type="text/plain",
        operation_id="artifact-a",
    )
    first_event = owner_a[2].read(limit=1).events[0]
    cursor = EventCursor(first_event.store_seq, first_event.event_id)
    source_range = EventRange(cursor, cursor)
    checkpoint_port = compiler.bind_execution(
        "execution-a",
        artifacts=ArtifactService(
            owner_a[2],
            sanitizer=lambda content, media_type: content,
        ),
    ).checkpoints
    prepared = checkpoint_port.prepare(
        source_range=source_range,
        summary="checkpoint owned by chat a",
        refs=(),
        operation=build_operation_ref(
            "checkpoint-a",
            domain="test.pupu_unchain_read_adapter",
            payload={"source_range": source_range.to_dict()},
        ),
    )
    checkpoint = checkpoint_port.commit(prepared=prepared)
    return database_path, owner_a, owner_b, artifact, checkpoint.checkpoint_ref


def test_host_reader_resolves_lifecycle_and_preserves_owner_isolation(
    tmp_path: Path,
) -> None:
    _, owner_a, owner_b, _, _ = _seed(tmp_path)

    reader = open_pupu_unchain_memory_v2_reader(
        root_dir=tmp_path,
        owner_chat_id="chat-a",
    )
    first = reader.read_events(execution_id="execution-a", limit=1)

    assert [event.event_id for event in first.events] == ["event-a-1"]
    assert first.has_more is True
    assert reader.memory_tree().entries == (owner_a[1],)
    assert reader.memory_get(entry_id=owner_a[1].entry_id) == owner_a[1]
    assert [hit.entry for hit in reader.memory_search("Needle").hits] == [owner_a[1]]
    with pytest.raises(Exception, match="execution|scope"):
        reader.read_events(execution_id=owner_b[0].execution_id)
    with pytest.raises(Exception, match="workspace|scope"):
        reader.memory_get(
            ref=ResourceRef(
                "memory",
                owner_b[1].entry_id,
                owner_b[1].revision,
                owner_b[0].chat_space_id,
            )
        )


def test_host_reader_presents_route_compatible_events_and_workspace_json(
    tmp_path: Path,
) -> None:
    _, owner_a, _, _, _ = _seed(tmp_path)
    lifecycle, entry, _ = owner_a
    reader = open_pupu_unchain_memory_v2_reader(
        root_dir=tmp_path,
        owner_chat_id="chat-a",
    )

    first_page = reader.load_events(
        owner_chat_id="chat-a",
        after=0,
        limit=1,
        session_id=lifecycle.session_id,
        attempt_id=lifecycle.attempt_id,
        include_payload=False,
    )
    second_page = reader.load_events(
        owner_chat_id="chat-a",
        after=first_page["next_after"],
        limit=10,
        session_id=lifecycle.session_id,
        attempt_id=lifecycle.attempt_id,
        include_payload=True,
    )
    spaces = reader.list_spaces(owner_chat_id="chat-a")
    listing = reader.list_entries(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        parent_path="/notes",
        include_descendants=True,
    )
    tree = reader.get_tree(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
    )
    detail = reader.get_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        entry_id=entry.entry_id,
        revision=entry.revision,
    )
    search = reader.search_entries(
        owner_chat_id="chat-a",
        query="Needle",
        space_id=lifecycle.chat_space_id,
        limit=5,
    )

    assert first_page["owner_chat_id"] == "chat-a"
    assert first_page["after"] == 0
    assert first_page["next_after"] == 1
    assert first_page["has_more"] is True
    assert first_page["events"][0]["store_seq"] == 1
    assert first_page["events"][0]["session_id"] == lifecycle.session_id
    assert first_page["events"][0]["attempt_id"] == lifecycle.attempt_id
    assert "event" not in first_page["events"][0]
    assert second_page["next_after"] == 2
    assert second_page["has_more"] is False
    assert second_page["events"][0]["event"]["type"] == "message.user"
    assert spaces["owner_chat_id"] == "chat-a"
    assert spaces["spaces"][0]["space_id"] == lifecycle.chat_space_id
    assert spaces["spaces"][0]["scope_kind"] == "chat"
    assert listing["space_revision"] == entry.updated_seq
    assert listing["entries"][0]["ref"] == (
        f"pupu://memory/{entry.space_id}/{entry.entry_id}@{entry.revision}"
    )
    assert tree["tree"][0]["entry_id"] == entry.entry_id
    assert detail["entry_id"] == entry.entry_id
    assert search["results"][0]["entry_id"] == entry.entry_id
    assert search["vector_status"] == "degraded"
    with pytest.raises(PupuUnchainMemoryV2ReadError, match="attempt|scope"):
        reader.load_events(
            owner_chat_id="chat-a",
            session_id=lifecycle.session_id,
            attempt_id="attempt-foreign",
        )
    with pytest.raises(PupuUnchainMemoryV2ReadError, match="workspace|scope"):
        reader.list_entries(
            owner_chat_id="chat-a",
            space_id="space-foreign",
        )


def test_host_reader_paginates_verified_content_and_survives_restart(
    tmp_path: Path,
) -> None:
    _, _, _, artifact, _ = _seed(tmp_path)
    first_reader = open_pupu_unchain_memory_v2_reader(
        root_dir=tmp_path,
        owner_chat_id="chat-a",
    )
    first = first_reader.read_content(
        execution_id="execution-a",
        artifact=artifact,
        offset=0,
        limit=8,
    )
    cold_reader = open_pupu_unchain_memory_v2_reader(
        root_dir=tmp_path,
        owner_chat_id="chat-a",
    )
    second = cold_reader.read_content(
        execution_id="execution-a",
        artifact=artifact,
        offset=first.next_offset,
        limit=64,
    )

    assert first.data == b"artifact"
    assert second.data == b"-owned-by-a"
    assert second.has_more is False
    with pytest.raises((TypeError, ValueError), match="ArtifactRef|schema|mapping"):
        cold_reader.read_content(
            execution_id="execution-a",
            artifact="/tmp/host-secret.txt",
        )


def test_host_reader_status_reports_unchain_owner_without_host_paths(
    tmp_path: Path,
) -> None:
    _seed(tmp_path)

    status = open_pupu_unchain_memory_v2_reader(
        root_dir=tmp_path,
        owner_chat_id="chat-a",
    ).status()

    assert status["schema"] == "pupu.unchain_memory_v2_read_status.v1"
    assert status["storeOwner"] == "unchain"
    assert status["available"] is True
    assert status["owner_chat_id"] == "chat-a"
    assert status["execution_ids"] == ["execution-a"]
    assert status["space_id"] == "space-a"
    assert str(tmp_path) not in repr(status)


def test_host_store_status_is_database_scoped_without_fabricated_chat_scope(
    tmp_path: Path,
) -> None:
    _seed(tmp_path)

    status = read_pupu_unchain_memory_v2_store_status(root_dir=tmp_path)

    assert status == {
        "available": True,
        "schema_version": 2,
        "journal_mode": "wal",
        "lexical_backend": "fts5",
        "vector_status": "disabled",
        "storeOwner": "unchain",
    }
    assert "owner_chat_id" not in status
    assert "execution_ids" not in status


def test_host_store_status_initializes_fresh_unchain_store_idempotently(
    tmp_path: Path,
) -> None:
    first = read_pupu_unchain_memory_v2_store_status(root_dir=tmp_path)
    second = read_pupu_unchain_memory_v2_store_status(root_dir=tmp_path)
    admission = admit_context_v2_store_owner(
        root_dir=tmp_path,
        requested_owner=STORE_OWNER_UNCHAIN,
    )

    assert first == second
    assert first == {
        "available": True,
        "schema_version": 2,
        "journal_mode": "wal",
        "lexical_backend": "fts5",
        "vector_status": "disabled",
        "storeOwner": "unchain",
    }
    assert admission.database_state == STORE_OWNER_UNCHAIN

    first_delete = delete_pupu_unchain_chat(
        database_path=tmp_path / "context_v2.sqlite3",
        owner_chat_id="fresh-status-chat",
        operation_id="delete-after-status",
    )
    replay_delete = delete_pupu_unchain_chat(
        database_path=tmp_path / "context_v2.sqlite3",
        owner_chat_id="fresh-status-chat",
        operation_id="delete-after-status",
    )
    assert first_delete["deleted"] is True
    assert first_delete["owner_chat_id"] == "fresh-status-chat"
    assert first_delete["replayed"] is False
    assert replay_delete["replayed"] is True


def test_host_store_status_preserves_existing_blank_database(tmp_path: Path) -> None:
    database_path = tmp_path / "context_v2.sqlite3"
    with sqlite3.connect(database_path) as connection:
        connection.execute("VACUUM")
    before = database_path.read_bytes()

    with pytest.raises(PupuUnchainMemoryV2ReadError, match="database is unavailable"):
        read_pupu_unchain_memory_v2_store_status(root_dir=tmp_path)

    assert database_path.read_bytes() == before
    assert not (tmp_path / "objects").exists()


def test_host_store_status_fails_closed_for_existing_legacy_owner(
    tmp_path: Path,
) -> None:
    admit_context_v2_store_owner(
        root_dir=tmp_path,
        requested_owner=STORE_OWNER_PUPU_LEGACY,
    )

    with pytest.raises(PupuUnchainMemoryV2ReadError, match="owner|Unchain"):
        read_pupu_unchain_memory_v2_store_status(root_dir=tmp_path)


def test_route_compatible_content_resolves_artifact_memory_and_checkpoint_refs(
    tmp_path: Path,
) -> None:
    _, owner_a, _, artifact, checkpoint_ref = _seed(tmp_path)
    reader = open_pupu_unchain_memory_v2_reader(
        root_dir=tmp_path,
        owner_chat_id="chat-a",
    )
    artifact_uri = f"pupu://artifact/{artifact.ref.resource_id}@{artifact.ref.revision}"
    memory_uri = (
        f"pupu://memory/{owner_a[0].chat_space_id}/"
        f"{owner_a[1].entry_id}@{owner_a[1].revision}"
    )
    checkpoint_uri = f"pupu://context/checkpoint/{checkpoint_ref.resource_id}"

    artifact_page = reader.read_scoped_content(
        ref=artifact_uri,
        offset=0,
        limit=8,
    )
    memory_page = reader.read_scoped_content(
        ref=memory_uri,
        offset=8,
        limit=9,
    )
    checkpoint_page = reader.read_scoped_content(
        ref=checkpoint_uri,
        offset=11,
        limit=5,
    )

    assert base64.b64decode(artifact_page["data"]) == b"artifact"
    assert artifact_page["ref"] == artifact_uri
    assert artifact_page["next_offset"] == 8
    assert artifact_page["truncated"] is True
    assert base64.b64decode(memory_page["data"]) == b"workspace"
    assert memory_page["owner_chat_id"] == "chat-a"
    assert base64.b64decode(checkpoint_page["data"]) == b"owned"
    assert checkpoint_page["mime_type"] == "application/json"
    assert checkpoint_page["sha256"]


def test_route_compatible_content_delegates_review_refs_to_unchain_curator(
    tmp_path: Path,
) -> None:
    _seed(tmp_path)

    class _ReviewContentQuery:
        def __init__(self) -> None:
            self.calls = []

        def read_review_content(self, *, ref, offset, limit):
            self.calls.append((ref, offset, limit))
            return MemoryToolContentPage(
                ref=ref,
                media_type="application/json",
                data=b'"diff"'[offset : offset + limit],
                offset=offset,
                total_bytes=6,
                sha256="d" * 64,
            )

    query = _ReviewContentQuery()
    reader = replace(
        open_pupu_unchain_memory_v2_reader(
            root_dir=tmp_path,
            owner_chat_id="chat-a",
        ),
        _curator_query=query,
    )
    uri = "pupu://memory/review/review-a@1/diff"

    page = reader.read_scoped_content(ref=uri, offset=1, limit=3)

    assert base64.b64decode(page["data"]) == b"dif"
    assert page["ref"] == uri
    assert page["next_offset"] == 4
    assert query.calls == [
        (
            ResourceRef("memory_review_content", "review-a", 1, "diff"),
            1,
            3,
        )
    ]


def test_route_compatible_content_rejects_foreign_and_host_path_refs(
    tmp_path: Path,
) -> None:
    _, _, owner_b, _, _ = _seed(tmp_path)
    reader = open_pupu_unchain_memory_v2_reader(
        root_dir=tmp_path,
        owner_chat_id="chat-a",
    )
    foreign_memory = (
        f"pupu://memory/{owner_b[0].chat_space_id}/"
        f"{owner_b[1].entry_id}@{owner_b[1].revision}"
    )

    with pytest.raises(Exception, match="workspace|scope"):
        reader.read_scoped_content(ref=foreign_memory)
    with pytest.raises(PupuUnchainMemoryV2ReadError, match="invalid|reference"):
        reader.read_scoped_content(ref="/tmp/host-secret.txt")
    with pytest.raises(PupuUnchainMemoryV2ReadError, match="invalid|unsupported"):
        reader.read_scoped_content(
            ref="pupu://memory/review/review-a@1/diff/extra"
        )


def test_host_reader_fails_closed_for_deleted_chat(tmp_path: Path) -> None:
    database_path, owner_a, _, _, _ = _seed(tmp_path)
    delete_pupu_unchain_chat(
        database_path=database_path,
        owner_chat_id="chat-a",
        operation_id="delete-chat-a",
    )

    with pytest.raises(PupuUnchainMemoryV2ReadError, match="deleted"):
        open_pupu_unchain_memory_v2_reader(
            root_dir=tmp_path,
            owner_chat_id=owner_a[0].owner_chat_id,
        )


def test_host_reader_requires_the_unchain_single_store_owner(tmp_path: Path) -> None:
    admit_context_v2_store_owner(
        root_dir=tmp_path,
        requested_owner=STORE_OWNER_PUPU_LEGACY,
    )

    with pytest.raises(PupuUnchainMemoryV2ReadError, match="owner|Unchain"):
        open_pupu_unchain_memory_v2_reader(
            root_dir=tmp_path,
            owner_chat_id="chat-a",
        )
