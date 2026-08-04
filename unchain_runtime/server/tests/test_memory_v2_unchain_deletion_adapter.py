from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_deletion_adapter import (
    PupuUnchainChatDeletionError,
    delete_pupu_unchain_chat,
    read_pupu_unchain_chat_deletion,
)
from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2Lifecycle,
    _initialize_lifecycle_schema,
    _persist_lifecycle,
    list_pupu_unchain_ownership_lifecycles,
)
from unchain.memory.workspace import MemorySpace
from unchain.persistence.sqlite_curator_v2 import SQLiteCuratorV2Store
from unchain.persistence.sqlite_context_compiler_v2 import SQLiteContextCompilerV2Store
from unchain.persistence.sqlite_legacy_bootstrap_v2 import SQLiteLegacyBootstrapService
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_promotion_v2 import SQLitePromotionV2Store
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


def _seed(tmp_path: Path, *, owner_chat_id: str = "chat-a"):
    admission = admit_context_v2_store_owner(
        root_dir=tmp_path,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    database_path = admission.database_path
    object_directory = tmp_path / "objects"
    context = SQLiteContextV2Store(
        database_path=database_path,
        object_directory=object_directory,
    )
    SQLiteContextCompilerV2Store(context_store=context)
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
    lifecycle = PupuUnchainMemoryV2Lifecycle(
        owner_chat_id=owner_chat_id,
        execution_id="execution-a",
        generation_id="generation-a",
        attempt_id="attempt-a",
        root_run_id="run-a",
        binding_id="binding-a",
        chat_space_id="space-a",
    )
    context.bind_execution(lifecycle.execution_id)
    memory.bind_workspace(
        space=MemorySpace(
            lifecycle.chat_space_id,
            "chat",
            "Chat memory",
            "PuPu chat Memory V2 workspace",
            1,
        ),
        owner_chat_id=owner_chat_id,
    )
    curator.bind_curation(
        binding_id=lifecycle.binding_id,
        owner_chat_id=owner_chat_id,
        target_space_id=lifecycle.chat_space_id,
    )
    _initialize_lifecycle_schema(database_path)
    _persist_lifecycle(
        database_path=database_path,
        lifecycle=lifecycle,
        operation_id="bind-a",
        expected_revision=0,
    )
    return database_path, lifecycle


def test_host_deletion_resolves_exact_lifecycle_and_replays_after_restart(
    tmp_path: Path,
) -> None:
    database_path, lifecycle = _seed(tmp_path)

    first = delete_pupu_unchain_chat(
        database_path=database_path,
        owner_chat_id=lifecycle.owner_chat_id,
        operation_id="delete-a",
    )
    replay = delete_pupu_unchain_chat(
        database_path=database_path,
        owner_chat_id=lifecycle.owner_chat_id,
        operation_id="delete-a",
    )
    cold = read_pupu_unchain_chat_deletion(
        database_path=database_path,
        owner_chat_id=lifecycle.owner_chat_id,
    )

    assert first == {
        "schema": "pupu.unchain_chat_deletion.v1",
        "deleted": True,
        "owner_chat_id": "chat-a",
        "tombstone_revision": 1,
        "replayed": False,
        "deleted_rows": first["deleted_rows"],
        "gc_status": "pending_unreferenced_scan",
    }
    assert first["deleted_rows"]["executions"] == 1
    assert first["deleted_rows"]["spaces"] == 1
    assert first["deleted_rows"]["curation_scopes"] == 1
    assert replay["replayed"] is True
    assert cold == replay

    # The immutable lifecycle remains as deletion provenance and allows exact
    # retry reconstruction; it is not an active attachment after tombstoning.
    assert list_pupu_unchain_ownership_lifecycles(
        database_path=database_path,
        owner_chat_id="chat-a",
    ) == (lifecycle,)


def test_host_deletion_refuses_an_owner_without_durable_lifecycle(
    tmp_path: Path,
) -> None:
    database_path, _ = _seed(tmp_path, owner_chat_id="chat-a")

    with pytest.raises(PupuUnchainChatDeletionError, match="lifecycle"):
        delete_pupu_unchain_chat(
            database_path=database_path,
            owner_chat_id="chat-missing",
            operation_id="delete-missing",
        )

    assert (
        read_pupu_unchain_chat_deletion(
            database_path=database_path,
            owner_chat_id="chat-missing",
        )
        is None
    )


def test_host_deletion_fails_closed_when_lifecycle_scope_drifted(
    tmp_path: Path,
) -> None:
    database_path, lifecycle = _seed(tmp_path)
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            "UPDATE curation_scopes SET owner_chat_id = 'chat-other' "
            "WHERE binding_id = ?",
            (lifecycle.binding_id,),
        )

    with pytest.raises(PupuUnchainChatDeletionError, match="scope|owner"):
        delete_pupu_unchain_chat(
            database_path=database_path,
            owner_chat_id=lifecycle.owner_chat_id,
            operation_id="delete-drifted",
        )
