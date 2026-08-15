from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

import memory_v2_unchain_deletion_adapter as deletion_adapter
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
    PupuUnchainMemoryV2OwnershipError,
    PupuUnchainMemoryV2Lifecycle,
    _initialize_lifecycle_schema,
    _persist_lifecycle,
    list_pupu_unchain_ownership_lifecycles,
)
from unchain.memory.workspace import MemorySpace
from unchain.persistence.sqlite_chat_deletion_v2 import read_chat_deletion_tombstone
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


def _ensure_admission_schema(database_path: Path) -> None:
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS pupu_context_v2_admissions (
              admission_id TEXT PRIMARY KEY,
              owner_chat_id TEXT NOT NULL UNIQUE,
              scope_sha256 TEXT NOT NULL,
              first_session_id TEXT NOT NULL,
              requested_rollout_mode TEXT NOT NULL,
              effective_rollout_mode TEXT NOT NULL,
              cohort TEXT NOT NULL,
              target_mode TEXT NOT NULL CHECK(target_mode='active'),
              effective_mode TEXT NOT NULL,
              decision_reason TEXT NOT NULL,
              canary_selected INTEGER NOT NULL,
              canary_percent INTEGER NOT NULL,
              canary_bucket INTEGER NOT NULL,
              hash_strategy TEXT NOT NULL,
              bootstrap_status TEXT NOT NULL,
              v2_bootstrapped INTEGER NOT NULL,
              bootstrap_error_code TEXT NOT NULL,
              admission_provenance_json TEXT NOT NULL,
              bootstrap_provenance_json TEXT NOT NULL,
              revision INTEGER NOT NULL,
              admitted_at_ms INTEGER NOT NULL,
              bootstrapped_at_ms INTEGER,
              updated_at_ms INTEGER NOT NULL,
              schema_version INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pupu_context_v2_admission_operations (
              operation_id TEXT PRIMARY KEY,
              owner_chat_id TEXT NOT NULL,
              operation_kind TEXT NOT NULL,
              payload_sha256 TEXT NOT NULL,
              receipt_json TEXT NOT NULL,
              created_at_ms INTEGER NOT NULL
            );
            """
        )


def _insert_admission_metadata(database_path: Path, owner_chat_id: str) -> None:
    _ensure_admission_schema(database_path)
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            INSERT INTO pupu_context_v2_admissions(
                admission_id, owner_chat_id, scope_sha256, first_session_id,
                requested_rollout_mode, effective_rollout_mode, cohort,
                target_mode, effective_mode, decision_reason, canary_selected,
                canary_percent, canary_bucket, hash_strategy, bootstrap_status,
                v2_bootstrapped, bootstrap_error_code,
                admission_provenance_json, bootstrap_provenance_json, revision,
                admitted_at_ms, bootstrapped_at_ms, updated_at_ms, schema_version
            ) VALUES (?, ?, ?, 'session-a', 'all', 'all', 'all', 'active',
                      'active', 'test', 1, 100, 0, 'sha256', 'complete', 1,
                      '', '{}', '{}', 1, 1, 1, 1, 1)
            """,
            (f"admission-{owner_chat_id}", owner_chat_id, "a" * 64),
        )
        connection.execute(
            """
            INSERT INTO pupu_context_v2_admission_operations(
                operation_id, owner_chat_id, operation_kind, payload_sha256,
                receipt_json, created_at_ms
            ) VALUES (?, ?, 'resolve', ?, '{}', 1)
            """,
            (f"admission-operation-{owner_chat_id}", owner_chat_id, "b" * 64),
        )


def _insert_unknown_owner_evidence(
    database_path: Path,
    owner_chat_id: str,
) -> None:
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE pupu_context_v2_unknown_metadata (
              metadata_id TEXT PRIMARY KEY,
              owner_chat_id TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "INSERT INTO pupu_context_v2_unknown_metadata(metadata_id, owner_chat_id) "
            "VALUES (?, ?)",
            (f"unknown-{owner_chat_id}", owner_chat_id),
        )


def _row_count(database_path: Path, table_name: str, owner_chat_id: str) -> int:
    with sqlite3.connect(database_path) as connection:
        return int(
            connection.execute(
                f"SELECT COUNT(*) FROM {table_name} WHERE owner_chat_id = ?",
                (owner_chat_id,),
            ).fetchone()[0]
        )


def test_host_deletion_resolves_exact_lifecycle_and_replays_after_restart(
    tmp_path: Path,
) -> None:
    database_path, lifecycle = _seed(tmp_path)
    _insert_admission_metadata(database_path, lifecycle.owner_chat_id)

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
    assert first["deleted_rows"]["pupu_context_v2_admission_operations"] == 1
    assert first["deleted_rows"]["pupu_context_v2_admissions"] == 1
    assert _row_count(
        database_path,
        "pupu_context_v2_admission_operations",
        lifecycle.owner_chat_id,
    ) == 0
    assert _row_count(
        database_path,
        "pupu_context_v2_admissions",
        lifecycle.owner_chat_id,
    ) == 0
    assert replay["replayed"] is True
    assert cold == replay

    # The immutable lifecycle remains as deletion provenance and allows exact
    # retry reconstruction; it is not an active attachment after tombstoning.
    assert list_pupu_unchain_ownership_lifecycles(
        database_path=database_path,
        owner_chat_id="chat-a",
    ) == (lifecycle,)


def test_host_deletion_accepts_a_proven_empty_scope_and_cold_replays(
    tmp_path: Path,
) -> None:
    database_path, _ = _seed(tmp_path, owner_chat_id="chat-a")

    first = delete_pupu_unchain_chat(
        database_path=database_path,
        owner_chat_id="chat-missing",
        operation_id="delete-missing",
    )
    replay = delete_pupu_unchain_chat(
        database_path=database_path,
        owner_chat_id="chat-missing",
        operation_id="delete-missing-replay",
    )
    cold = read_pupu_unchain_chat_deletion(
        database_path=database_path,
        owner_chat_id="chat-missing",
    )

    assert first["deleted"] is True
    assert first["owner_chat_id"] == "chat-missing"
    assert first["replayed"] is False
    assert not any(first["deleted_rows"].values())
    assert replay["replayed"] is True
    assert cold == replay


@pytest.mark.parametrize("evidence_kind", ("admission", "unknown"))
def test_host_deletion_without_lifecycle_fails_closed_on_any_owner_evidence(
    tmp_path: Path,
    evidence_kind: str,
) -> None:
    database_path, _ = _seed(tmp_path, owner_chat_id="chat-a")
    if evidence_kind == "admission":
        _insert_admission_metadata(database_path, "chat-missing")
    else:
        _insert_unknown_owner_evidence(database_path, "chat-missing")

    with pytest.raises(
        PupuUnchainChatDeletionError,
        match="lifecycle.*evidence",
    ):
        delete_pupu_unchain_chat(
            database_path=database_path,
            owner_chat_id="chat-missing",
            operation_id=f"delete-{evidence_kind}",
        )

    assert read_chat_deletion_tombstone(
        database_path=database_path,
        owner_chat_id="chat-missing",
    ) is None


def test_host_deletion_fails_closed_on_partial_admission_schema(
    tmp_path: Path,
) -> None:
    database_path, _ = _seed(tmp_path, owner_chat_id="chat-a")
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE pupu_context_v2_admissions (
              admission_id TEXT PRIMARY KEY,
              owner_chat_id TEXT NOT NULL UNIQUE
            )
            """
        )

    with pytest.raises(PupuUnchainChatDeletionError, match="schema is incomplete"):
        delete_pupu_unchain_chat(
            database_path=database_path,
            owner_chat_id="chat-missing",
            operation_id="delete-partial-admission",
        )

    assert read_chat_deletion_tombstone(
        database_path=database_path,
        owner_chat_id="chat-missing",
    ) is None


def test_empty_scope_rechecks_admission_evidence_inside_delete_transaction(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path, _ = _seed(tmp_path, owner_chat_id="chat-a")
    _ensure_admission_schema(database_path)
    from unchain.persistence import sqlite_chat_deletion_v2 as deletion_core

    real_service = deletion_core.SQLiteChatDeletionV2Service

    class RacingService:
        def __init__(self, **kwargs):
            _insert_admission_metadata(database_path, "chat-missing")
            self._delegate = real_service(**kwargs)

        def delete_chat(self, **kwargs):
            return self._delegate.delete_chat(**kwargs)

    monkeypatch.setattr(
        deletion_core,
        "SQLiteChatDeletionV2Service",
        RacingService,
    )

    with pytest.raises(PupuUnchainChatDeletionError, match="scope|evidence"):
        delete_pupu_unchain_chat(
            database_path=database_path,
            owner_chat_id="chat-missing",
            operation_id="delete-racing-admission",
        )

    assert _row_count(
        database_path,
        "pupu_context_v2_admission_operations",
        "chat-missing",
    ) == 1
    assert _row_count(
        database_path,
        "pupu_context_v2_admissions",
        "chat-missing",
    ) == 1
    assert read_chat_deletion_tombstone(
        database_path=database_path,
        owner_chat_id="chat-missing",
    ) is None


def test_host_deletion_recreates_retained_ownership_guard_on_replay(
    tmp_path: Path,
) -> None:
    database_path, lifecycle = _seed(tmp_path)
    delete_pupu_unchain_chat(
        database_path=database_path,
        owner_chat_id=lifecycle.owner_chat_id,
        operation_id="delete-a",
    )
    with sqlite3.connect(database_path) as connection:
        guard = connection.execute(
            """
            SELECT name FROM sqlite_master
            WHERE type = 'trigger'
              AND sql LIKE '%BEFORE INSERT ON "pupu_unchain_ownership_bindings"%'
            """
        ).fetchone()
        assert guard is not None
        connection.execute(f'DROP TRIGGER "{guard[0]}"')

    replay = delete_pupu_unchain_chat(
        database_path=database_path,
        owner_chat_id=lifecycle.owner_chat_id,
        operation_id="delete-a-replay",
    )

    assert replay["replayed"] is True
    with sqlite3.connect(database_path) as connection:
        recreated = connection.execute(
            """
            SELECT 1 FROM sqlite_master
            WHERE type = 'trigger'
              AND sql LIKE '%BEFORE INSERT ON "pupu_unchain_ownership_bindings"%'
            """
        ).fetchone()
        assert recreated == (1,)
    with pytest.raises(PupuUnchainMemoryV2OwnershipError, match="conflicted"):
        _persist_lifecycle(
            database_path=database_path,
            lifecycle=PupuUnchainMemoryV2Lifecycle(
                owner_chat_id="chat-a",
                execution_id="execution-new",
                generation_id="generation-new",
                attempt_id="attempt-new",
                root_run_id="run-new",
                binding_id="binding-new",
                chat_space_id="space-new",
            ),
            operation_id="bind-after-delete",
            expected_revision=0,
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
