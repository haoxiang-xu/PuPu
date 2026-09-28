"""#349 schema upgrade, replacement and interleaved-writer acceptance probes.

All database mutations are confined to pytest temporary directories.
"""

import sqlite3

import pytest

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    open_context_v2_owned_store,
)
from test_tool_cache_acceptance import append_event, make_journal
from unchain.context.journal_view_cache import RunLocalJournalViewCache
from unchain.journal import BoundExecutionJournal
from unchain.persistence.sqlite_v2 import (
    SQLiteContextV2Store,
    SQLiteContextV2StoreIntegrityError,
)


def test_existing_v2_database_reaches_migration_through_host_admission(tmp_path):
    database = tmp_path / "context_v2.sqlite3"
    objects = tmp_path / "objects"
    store = SQLiteContextV2Store(database_path=database, object_directory=objects)
    journal = store.bind_execution("audit")
    append_event(journal, 1)
    # Restore the prior deployed schema, retaining a real durable event.
    with sqlite3.connect(database) as connection:
        for name in (
            "context_v2_event_integrity_replace",
            "context_v2_event_integrity_update",
            "context_v2_event_integrity_delete",
            "context_v2_operation_integrity_replace",
            "context_v2_operation_integrity_update",
            "context_v2_operation_integrity_delete",
        ):
            connection.execute(f'DROP TRIGGER "{name}"')
        connection.execute("ALTER TABLE executions DROP COLUMN integrity_revision")
        connection.execute("DELETE FROM context_v2_schema WHERE version=3")
    assert journal.capture_snapshot().event_count == 1
    upgraded = open_context_v2_owned_store(
        root_dir=tmp_path,
        requested_owner=STORE_OWNER_UNCHAIN,
        opener=lambda admission: SQLiteContextV2Store(
            database_path=admission.database_path, object_directory=objects
        ),
    )
    assert upgraded.bind_execution("audit").capture_snapshot().event_count == 1
    with sqlite3.connect(database) as connection:
        assert {row[0] for row in connection.execute(
            "SELECT version FROM context_v2_schema"
        )} == {1, 2, 3}


@pytest.mark.parametrize(
    "statement",
    [
        "INSERT OR REPLACE INTO events SELECT execution_id,store_seq,event_id,"
        "generation_id,attempt_id,event_type,operation_id,CAST('{}' AS BLOB),"
        "event_sha256 FROM events WHERE store_seq=1",
        "INSERT OR REPLACE INTO operations SELECT execution_id,operation_id,"
        "payload_sha256,target_kind,'other-event' FROM operations "
        "WHERE operation_id='operation-1'",
    ],
    ids=["event-replacement", "operation-replacement"],
)
def test_replacement_invalidates_cached_prefix(tmp_path, statement):
    store, journal = make_journal(tmp_path)
    for index in range(1, 9):
        append_event(journal, index)
    cache = RunLocalJournalViewCache(journal)
    cache.capture_snapshot()
    with sqlite3.connect(store.database_path) as connection:
        assert connection.execute("PRAGMA recursive_triggers").fetchone()[0] == 0
        connection.execute(statement)
    with pytest.raises(SQLiteContextV2StoreIntegrityError):
        journal.capture_snapshot()
    with pytest.raises(SQLiteContextV2StoreIntegrityError):
        cache.capture_snapshot()


class _InterleavedWriterJournal(BoundExecutionJournal):
    """Commit immediately after an atomic snapshot/revision pair is returned."""

    def __init__(self, journal, database):
        super().__init__(journal.execution_id)
        self.wrapped = journal
        self.database = database
        self.captures = 0

    def append(self, **kwargs):
        return self.wrapped.append(**kwargs)

    def read(self, **kwargs):
        return self.wrapped.read(**kwargs)

    def snapshot_integrity_revision(self):
        return self.wrapped.snapshot_integrity_revision()

    def snapshot_prefix_is_current(self, **kwargs):
        return self.wrapped.snapshot_prefix_is_current(**kwargs)

    def capture_snapshot(self, **kwargs):
        return self.wrapped.capture_snapshot(**kwargs)

    def capture_snapshot_with_integrity_revision(self, **kwargs):
        captured = self.wrapped.capture_snapshot_with_integrity_revision(**kwargs)
        self.captures += 1
        with sqlite3.connect(self.database) as connection:
            if self.captures == 1:
                connection.execute(
                    "UPDATE events SET event_json=CAST('{}' AS BLOB) WHERE store_seq=1"
                )
        return captured


def test_atomic_capture_does_not_bind_new_revision_to_old_snapshot(tmp_path):
    store, journal = make_journal(tmp_path)
    for index in range(1, 9):
        append_event(journal, index)
    scheduled = _InterleavedWriterJournal(journal, store.database_path)
    cache = RunLocalJournalViewCache(scheduled)
    # The returned pair was valid when read, then an external commit happened
    # before the cache stored it. The next use must compare the old revision.
    cache.capture_snapshot()
    with pytest.raises(SQLiteContextV2StoreIntegrityError):
        journal.capture_snapshot()
    with pytest.raises(SQLiteContextV2StoreIntegrityError):
        cache.capture_snapshot()
