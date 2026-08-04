from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2Lifecycle,
    _initialize_lifecycle_schema,
    _persist_lifecycle,
)
from memory_v2_unchain_workspace_api import (
    PupuUnchainWorkspaceAPIError,
    open_pupu_unchain_workspace_api,
)
from unchain.context import ArtifactService
from unchain.journal import (
    AttemptRef,
    GenerationRef,
    JournalAppendRequest,
    OperationRef,
    ResourceRef,
)
from unchain.memory.workspace import MemorySpace
from unchain.memory.workspace.ports import (
    RepositoryConflictError,
    RepositoryScopeError,
)
from unchain.persistence.sqlite_context_compiler_v2 import (
    SQLiteContextCompilerV2Store,
)
from unchain.persistence.sqlite_curator_v2 import SQLiteCuratorV2Store
from unchain.persistence.sqlite_legacy_bootstrap_v2 import (
    SQLiteLegacyBootstrapService,
)
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_promotion_v2 import SQLitePromotionV2Store
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


def _initialize_complete_data_plane(root: Path):
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
    memory = SQLiteMemoryV2Store(
        database_path=database_path,
        object_directory=object_directory,
    )
    SQLiteContextCompilerV2Store(context_store=context)
    SQLiteCuratorV2Store(
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
    return database_path, context, memory


def _seed_owner(
    *,
    database_path: Path,
    context: SQLiteContextV2Store,
    memory: SQLiteMemoryV2Store,
    owner_chat_id: str,
    suffix: str,
):
    execution_id = f"execution-{suffix}"
    generation_id = f"generation-{suffix}"
    attempt_id = f"attempt-{suffix}"
    event_id = f"event-{suffix}"
    journal = context.bind_execution(execution_id)
    journal.append(
        request=JournalAppendRequest(
            event_id=event_id,
            event_type="message.user",
            attempt=AttemptRef(
                GenerationRef(execution_id, generation_id),
                attempt_id,
            ),
            operation=OperationRef(
                f"event-operation-{suffix}",
                ("a" if suffix == "a" else "b") * 64,
            ),
            payload={"content": f"source event for {owner_chat_id}"},
        )
    )
    space_id = f"space-{suffix}"
    binding_id = f"binding-{suffix}"
    memory.bind_workspace(
        space=MemorySpace(
            space_id,
            "chat",
            f"Chat {suffix}",
            f"Workspace owned by {owner_chat_id}",
            1,
        ),
        owner_chat_id=owner_chat_id,
    )
    lifecycle = PupuUnchainMemoryV2Lifecycle(
        owner_chat_id=owner_chat_id,
        execution_id=execution_id,
        generation_id=generation_id,
        attempt_id=attempt_id,
        root_run_id=f"root-run-{suffix}",
        binding_id=binding_id,
        chat_space_id=space_id,
    )
    _persist_lifecycle(
        database_path=database_path,
        lifecycle=lifecycle,
        operation_id=f"lifecycle-operation-{suffix}",
        expected_revision=0,
    )
    return lifecycle, event_id


@pytest.fixture
def seeded(tmp_path):
    root = tmp_path / "memory_v2"
    database_path, context, memory = _initialize_complete_data_plane(root)
    owner_a = _seed_owner(
        database_path=database_path,
        context=context,
        memory=memory,
        owner_chat_id="chat-a",
        suffix="a",
    )
    owner_b = _seed_owner(
        database_path=database_path,
        context=context,
        memory=memory,
        owner_chat_id="chat-b",
        suffix="b",
    )
    return {
        "root": root,
        "database_path": database_path,
        "a": owner_a,
        "b": owner_b,
    }


def _open(seeded, owner="chat-a"):
    return open_pupu_unchain_workspace_api(
        root_dir=seeded["root"],
        owner_chat_id=owner,
    )


def test_crud_shapes_cas_and_operation_receipts_survive_restart(seeded):
    lifecycle, event_id = seeded["a"]
    api = _open(seeded)

    spaces = api.list_spaces(owner_chat_id="chat-a")
    assert spaces == {
        "owner_chat_id": "chat-a",
        "spaces": [
            {
                "space_id": lifecycle.chat_space_id,
                "scope_kind": "chat",
                "scope_key": "chat-a",
                "owner_chat_id": "chat-a",
                "namespace": "chat",
                "name": "Chat a",
                "description": "Workspace owned by chat-a",
                "revision": 1,
                "replayed": False,
            }
        ],
    }
    folder = api.create_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        path="/notes",
        kind="folder",
        description="Notes grouped by topic and useful during this chat.",
        expected_space_revision=1,
        operation_id="workspace-folder-create",
        source_event_id=event_id,
    )
    note = api.create_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        path="/notes/architecture.md",
        kind="file",
        description="Architecture decisions needed for the Memory V2 cutover.",
        mime_type="text/markdown",
        content=b"original architecture body",
        expected_space_revision=2,
        operation_id="workspace-note-create",
        source_event_id=event_id,
    )

    assert folder["kind"] == "folder"
    assert folder["space_revision"] == 2
    assert note["kind"] == "markdown"
    assert note["space_revision"] == 3
    assert note["content_ref"] == note["ref"]
    assert note["source_event_id"] == event_id

    reopened = _open(seeded)
    assert reopened.get_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        entry_id=note["entry_id"],
    ) == note
    listing = reopened.list_entries(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        parent_path="/notes",
        include_descendants=False,
    )
    assert [item["entry_id"] for item in listing["entries"]] == [
        note["entry_id"]
    ]
    tree = reopened.get_tree(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
    )
    assert tree["tree"][0]["entry_id"] == folder["entry_id"]
    assert tree["tree"][0]["children"][0]["entry_id"] == note["entry_id"]
    search = reopened.search_entries(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        query="Architecture",
        limit=10,
    )
    assert search["results"][0]["entry_id"] == note["entry_id"]

    updated = reopened.update_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        entry_id=note["entry_id"],
        expected_revision=1,
        expected_space_revision=3,
        operation_id="workspace-note-update",
        description="Architecture decisions retained across application restarts.",
    )
    replayed = _open(seeded).update_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        entry_id=note["entry_id"],
        expected_revision=1,
        expected_space_revision=3,
        operation_id="workspace-note-update",
        description="Architecture decisions retained across application restarts.",
    )
    assert replayed == updated
    assert updated["revision"] == 2
    assert updated["space_revision"] == 4

    with pytest.raises(RepositoryConflictError):
        reopened.create_entry(
            owner_chat_id="chat-a",
            space_id=lifecycle.chat_space_id,
            path="/stale.md",
            kind="markdown",
            description="A stale write that must not pass workspace CAS.",
            content=b"stale",
            expected_space_revision=3,
            operation_id="workspace-stale-create",
            source_event_id=event_id,
        )

    with sqlite3.connect(seeded["database_path"]) as connection:
        operation_ids = {
            row[0]
            for row in connection.execute(
                "SELECT operation_id FROM memory_operation_receipts "
                "WHERE scope_kind='workspace' AND scope_id=?",
                (lifecycle.chat_space_id,),
            )
        }
    assert {
        "workspace-folder-create",
        "workspace-note-create",
        "workspace-note-update",
    } <= operation_ids


def test_owner_space_and_source_event_are_lifecycle_bound(seeded):
    lifecycle_a, _event_a = seeded["a"]
    lifecycle_b, event_b = seeded["b"]
    api = _open(seeded)

    with pytest.raises(RepositoryScopeError):
        api.list_entries(
            owner_chat_id="chat-b",
            space_id=lifecycle_a.chat_space_id,
        )
    with pytest.raises(RepositoryScopeError):
        api.list_entries(
            owner_chat_id="chat-a",
            space_id=lifecycle_b.chat_space_id,
        )
    with pytest.raises(RepositoryScopeError):
        api.create_entry(
            owner_chat_id="chat-a",
            space_id=lifecycle_a.chat_space_id,
            path="/foreign-source.md",
            kind="markdown",
            description="This must not cite another chat's event lineage.",
            content=b"forbidden",
            expected_space_revision=1,
            operation_id="workspace-foreign-source",
            source_event_id=event_b,
        )

    assert api.list_entries(
        owner_chat_id="chat-a",
        space_id=lifecycle_a.chat_space_id,
    )["entries"] == []
    assert _open(seeded, owner="chat-b").list_entries(
        owner_chat_id="chat-b",
        space_id=lifecycle_b.chat_space_id,
    )["entries"] == []


def test_public_composition_properties_keep_exact_bound_identity(seeded):
    lifecycle, event_id = seeded["a"]
    api = _open(seeded)

    repository = api.source_repository
    authorizer = api.reference_authorizer

    assert api.source_repository is repository
    assert api.reference_authorizer is authorizer
    assert repository.space.space_id == lifecycle.chat_space_id
    assert authorizer.binding_id == lifecycle.binding_id
    event_ref = ResourceRef("context_event", event_id, 1)
    assert authorizer.authorize(ref=event_ref) is event_ref


def test_recursive_delete_replays_and_records_current_memory_revision_source(seeded):
    lifecycle, event_id = seeded["a"]
    api = _open(seeded)
    folder = api.create_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        path="/archive",
        kind="folder",
        description="Entries intentionally archived together for this test.",
        expected_space_revision=1,
        operation_id="workspace-archive-folder",
        source_event_id=event_id,
    )
    child = api.create_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        path="/archive/child.md",
        kind="markdown",
        description="A child entry used to verify recursive archive replay.",
        content=b"child",
        expected_space_revision=2,
        operation_id="workspace-archive-child",
        source_event_id=event_id,
    )

    deleted = api.delete_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        entry_id=folder["entry_id"],
        expected_revision=1,
        expected_space_revision=3,
        operation_id="workspace-recursive-delete",
        recursive=True,
    )
    replayed = _open(seeded).delete_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        entry_id=folder["entry_id"],
        expected_revision=1,
        expected_space_revision=3,
        operation_id="workspace-recursive-delete",
        recursive=True,
    )

    assert replayed == deleted
    assert deleted["deleted_entry_ids"] == [
        child["entry_id"],
        folder["entry_id"],
    ]
    assert deleted["space_revision"] == 4
    assert _open(seeded).list_entries(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
    )["entries"] == []
    archived = _open(seeded).get_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        entry_id=folder["entry_id"],
        revision=2,
    )
    assert archived["source_refs"] == [folder["ref"]]


def test_folder_move_is_supported_but_folder_description_update_fails_closed(seeded):
    lifecycle, event_id = seeded["a"]
    api = _open(seeded)
    folder = api.create_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        path="/drafts",
        kind="folder",
        description="Draft memory entries that may be reorganized later.",
        expected_space_revision=1,
        operation_id="workspace-drafts-create",
        source_event_id=event_id,
    )

    with pytest.raises(PupuUnchainWorkspaceAPIError) as unsupported:
        api.update_entry(
            owner_chat_id="chat-a",
            space_id=lifecycle.chat_space_id,
            entry_id=folder["entry_id"],
            expected_revision=1,
            expected_space_revision=2,
            operation_id="workspace-folder-description",
            description="A changed folder description cannot bypass official APIs.",
        )
    assert (
        unsupported.value.code
        == "workspace_folder_metadata_update_unsupported"
    )

    moved = api.update_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        entry_id=folder["entry_id"],
        expected_revision=1,
        expected_space_revision=2,
        operation_id="workspace-folder-move",
        path="/organized",
    )
    assert moved["path"] == "/organized"
    assert moved["revision"] == 2
    assert moved["space_revision"] == 3


def test_link_and_image_use_official_entry_kinds_and_route_shape(seeded):
    lifecycle, event_id = seeded["a"]
    api = _open(seeded)
    image = api.create_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        path="/diagram.png",
        kind="file",
        description="A diagram used when reviewing the workspace architecture.",
        mime_type="image/png",
        content=b"\x89PNG\r\n\x1a\nsynthetic",
        expected_space_revision=1,
        operation_id="workspace-image-create",
        source_event_id=event_id,
    )
    link = api.create_entry(
        owner_chat_id="chat-a",
        space_id=lifecycle.chat_space_id,
        path="/reference.link",
        kind="link",
        description="An external reference useful for the workspace review.",
        link_url="https://example.com/reference",
        expected_space_revision=2,
        operation_id="workspace-link-create",
        source_event_id=event_id,
    )

    assert image["kind"] == "image"
    assert image["mime_type"] == "image/png"
    assert image["content_ref"] == image["ref"]
    assert link["kind"] == "link"
    assert link["link_url"] == "https://example.com/reference"
    assert "content_ref" not in link
