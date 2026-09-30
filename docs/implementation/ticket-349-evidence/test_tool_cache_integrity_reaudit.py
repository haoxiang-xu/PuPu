"""Durable-boundary regression probes for #349; temporary SQLite databases only."""

import sqlite3

import pytest

from benchmark_step1 import fixture
from test_tool_cache_acceptance import append_event, make_journal
from unchain.context.journal_view_cache import RunLocalJournalViewCache
from unchain.persistence.sqlite_v2 import SQLiteContextV2StoreIntegrityError


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE events SET event_json=CAST('{}' AS BLOB) WHERE store_seq=1",
        "UPDATE events SET generation_id='other-generation' WHERE store_seq=1",
        "UPDATE operations SET target_key='other-event' WHERE operation_id='operation-1'",
    ],
    ids=["payload", "indexed-identity", "operation-target"],
)
def test_warm_cache_preserves_durable_integrity_rejection(tmp_path, statement):
    store, journal = make_journal(tmp_path)
    for index in range(1, 9):
        append_event(journal, index)
    cache = RunLocalJournalViewCache(journal)
    cache.capture_snapshot()
    # A separate database connection modifies durable bytes, not cached Python objects.
    with sqlite3.connect(store.database_path) as connection:
        connection.execute(statement)
    with pytest.raises(SQLiteContextV2StoreIntegrityError):
        journal.capture_snapshot()
    with pytest.raises(SQLiteContextV2StoreIntegrityError):
        cache.capture_snapshot()


def test_context_build_rejects_corrupt_history_in_both_modes(tmp_path):
    for cache_enabled in (False, True):
        root = tmp_path / ("on" if cache_enabled else "off")
        root.mkdir()
        journal, factory, coordinator, context = fixture(
            root, 3, after_tool=True, cache_enabled=cache_enabled
        )
        with sqlite3.connect(root / "context_v2.sqlite3") as connection:
            connection.execute(
                "UPDATE events SET event_json=CAST('{}' AS BLOB) WHERE store_seq=1"
            )
        with pytest.raises(SQLiteContextV2StoreIntegrityError):
            coordinator.compile(factory(context))
