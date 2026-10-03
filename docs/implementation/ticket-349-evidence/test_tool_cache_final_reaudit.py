"""Independent durable-boundary regressions from the final #349 re-audit.

Only pytest temporary databases are modified. The assertions express required
behavior; they intentionally remain red until the production defects are fixed.
"""

import sqlite3

import pytest

from memory_v2_unchain_read_adapter import read_pupu_unchain_memory_v2_store_status
from test_tool_cache_acceptance import append_event, make_journal
from unchain.context.journal_view_cache import RunLocalJournalViewCache
from unchain.journal import AttemptRef, GenerationRef, SemanticEventDraft
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_v2 import (
    SQLiteContextV2Store,
    SQLiteContextV2StoreIntegrityError,
)


@pytest.mark.parametrize("table", ["events", "operations"])
def test_update_or_replace_invalidates_destination_execution(tmp_path, table):
    store, journal = make_journal(tmp_path)
    for index in range(1, 9):
        append_event(journal, index)
    other = store.bind_execution("other")
    other.append(request=SemanticEventDraft(
        event_id="other-event",
        event_type="run_started",
        attempt=AttemptRef(GenerationRef("other", "generation"), "run"),
        operation_id="operation-1",
        payload={"run_id": "run", "status": "started"},
    ).to_append_request())
    cache = RunLocalJournalViewCache(journal)
    cache.capture_snapshot()
    with sqlite3.connect(store.database_path) as connection:
        assert connection.execute("PRAGMA recursive_triggers").fetchone()[0] == 0
        connection.execute(
            f"UPDATE OR REPLACE {table} SET execution_id='audit' "
            "WHERE execution_id='other' AND operation_id='operation-1'"
        )
    with pytest.raises(SQLiteContextV2StoreIntegrityError):
        journal.capture_snapshot()
    with pytest.raises(SQLiteContextV2StoreIntegrityError):
        cache.capture_snapshot()


def test_existing_v2_store_is_available_at_startup_status(tmp_path):
    database = tmp_path / "context_v2.sqlite3"
    objects = tmp_path / "objects"
    store = SQLiteContextV2Store(database_path=database, object_directory=objects)
    SQLiteMemoryV2Store(database_path=database, object_directory=objects)
    journal = store.bind_execution("audit")
    append_event(journal, 1)
    assert read_pupu_unchain_memory_v2_store_status(root_dir=tmp_path)["available"]
    # Restore the deployed v2 schema without touching its real event or memory.
    with sqlite3.connect(database) as connection:
        names = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='trigger' "
            "AND name LIKE 'context_v2_%integrity_%'"
        )]
        for name in names:
            connection.execute(f'DROP TRIGGER "{name}"')
        connection.execute("ALTER TABLE executions DROP COLUMN integrity_revision")
        connection.execute("DELETE FROM context_v2_schema WHERE version=3")
    assert journal.capture_snapshot().event_count == 1
    assert read_pupu_unchain_memory_v2_store_status(root_dir=tmp_path)["available"]
