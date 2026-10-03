"""Acceptance probes for #349. Run with the candidate Unchain on PYTHONPATH.

Only temporary databases are modified; no live application state is used.
"""

import gc
import weakref

import pytest

from unchain.context.journal_view_cache import RunLocalJournalViewCache
from unchain.journal import AttemptRef, GenerationRef, SemanticEventDraft
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


def make_journal(tmp_path):
    store = SQLiteContextV2Store(
        database_path=tmp_path / "journal.sqlite3",
        object_directory=tmp_path / "objects",
    )
    return store, store.bind_execution("audit")


def append_event(journal, index):
    journal.append(
        request=SemanticEventDraft(
            event_id=f"event-{index}",
            event_type="run_started",
            attempt=AttemptRef(GenerationRef("audit", "generation"), "run"),
            operation_id=f"operation-{index}",
            payload={"run_id": "run", "status": "started"},
        ).to_append_request()
    )


def test_completed_run_cache_can_be_collected(tmp_path):
    store, journal = make_journal(tmp_path)
    append_event(journal, 1)
    cache = RunLocalJournalViewCache.for_journal(journal)
    cache.capture_snapshot()
    journal_ref, cache_ref = weakref.ref(journal), weakref.ref(cache)
    del cache, journal, store
    gc.collect()
    assert cache_ref() is None, "global registry retains completed run cache"
    assert journal_ref() is None, "global registry retains completed run journal"


def test_cached_prefix_deletion_fails_closed(tmp_path):
    store, journal = make_journal(tmp_path)
    for index in range(1, 9):
        append_event(journal, index)
    cache = RunLocalJournalViewCache(journal)
    cache.capture_snapshot()
    # Fault injection at the durable boundary, not in-process object tampering.
    # Leave the high-water row intact so the tail cursor remains valid.
    with store._transaction(immediate=True) as connection:
        connection.execute(
            "DELETE FROM events WHERE execution_id = ? AND store_seq = ?",
            ("audit", 1),
        )
    with pytest.raises(ValueError, match="complete contiguous prefix"):
        journal.capture_snapshot()
    with pytest.raises(Exception):
        cache.capture_snapshot()


def test_committed_tail_matches_full_durable_snapshot(tmp_path):
    _store, journal = make_journal(tmp_path)
    for index in range(1, 9):
        append_event(journal, index)
    cache = RunLocalJournalViewCache(journal)
    cache.capture_snapshot()
    append_event(journal, 9)
    assert cache.capture_snapshot() == journal.capture_snapshot()
    assert cache.metrics().full_snapshot_reads == 1
    assert cache.metrics().tail_reads == 1
