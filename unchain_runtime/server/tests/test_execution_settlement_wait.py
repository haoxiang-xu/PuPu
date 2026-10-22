"""A successor may wait for a stopped writer; it may never steal its guard."""
import sys
import threading
import time
from pathlib import Path
from unittest import mock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import execution_control as control
import session_execution_guard as guard


@pytest.fixture
def session(tmp_path, monkeypatch):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    control.register("chat", "old")
    control.mark_running("chat", "old")
    control.register("chat", "new")
    yield
    control.finish_cancelled_run("chat", "old")
    control.finish_cancelled_run("chat", "new")


def test_successor_waits_until_stopped_writer_releases_guard(session):
    control.request_cancel("chat", "old")
    finished = threading.Event()
    result = []
    def admit():
        result.append(control.mark_running("chat", "new"))
        finished.set()
    worker = threading.Thread(target=admit)
    worker.start()
    try:
        assert not finished.wait(0.15)
        assert guard.snapshot_session_guard(session_id="chat").attempt_id == "old"
        control.finish_cancelled_run("chat", "old")
        assert finished.wait(2)
        assert result[0].status == "running"
        assert guard.snapshot_session_guard(session_id="chat").attempt_id == "new"
    finally:
        worker.join(2)


def test_stop_of_waiting_successor_exits_without_releasing_predecessor(session):
    control.request_cancel("chat", "old")
    result = []
    worker = threading.Thread(target=lambda: result.append(control.mark_running("chat", "new")))
    worker.start()
    time.sleep(0.1)
    control.request_cancel("chat", "new")
    worker.join(2)
    assert not worker.is_alive()
    assert result[0].status == "cancelled"
    assert guard.snapshot_session_guard(session_id="chat").attempt_id == "old"


def test_settlement_timeout_preserves_both_guard_and_registered_successor(session):
    control.request_cancel("chat", "old")
    with mock.patch.object(control, "_SETTLEMENT_WAIT_SECONDS", 0.05, create=True):
        with pytest.raises(control.ExecutionControlError) as failure:
            control.mark_running("chat", "new")
    assert failure.value.code == "execution_settlement_timeout"
    assert not failure.value.retryable
    assert control.snapshot("chat", "new").status == "registered"
    assert guard.snapshot_session_guard(session_id="chat").attempt_id == "old"


def test_live_predecessor_does_not_enable_waiting(session):
    with pytest.raises(guard.SessionExecutionInProgress):
        control.mark_running("chat", "new")


@pytest.mark.parametrize("state,operation,status", [
    ("parked", "run", "running"),
    ("active", "rebase", "cancelled"),
    ("active", "run", "failed"),
    ("active", "run", "completed"),
    ("active", "run", None),
])
def test_only_exact_cancelled_run_may_wait(session, state, operation, status):
    from dataclasses import replace
    current_guard = guard.snapshot_session_guard(session_id="chat")
    original_snapshot = control._DEFAULT_REGISTRY.snapshot
    def snapshot(session_id, attempt_id):
        result = original_snapshot(session_id, attempt_id)
        if attempt_id == "old":
            return replace(result, status=status) if status else None
        return result
    with mock.patch.object(guard, "snapshot_session_guard", return_value=replace(current_guard, state=state, operation=operation)), mock.patch.object(control._DEFAULT_REGISTRY, "snapshot", side_effect=snapshot):
        with pytest.raises(guard.SessionExecutionInProgress):
            control.mark_running("chat", "new")
    assert original_snapshot("chat", "new").status == "registered"
    assert guard.snapshot_session_guard(session_id="chat").attempt_id == "old"


def test_cancelled_parked_predecessor_waits_for_retirement(session):
    guard.park_session_guard(session_id="chat", interaction_id="interaction", source_attempt_id="old", owner_attempt_id="old")
    control.request_cancel("chat", "old")
    finished = threading.Event()
    result = []
    def admit():
        result.append(control.mark_running("chat", "new"))
        finished.set()
    worker = threading.Thread(target=admit)
    worker.start()
    try:
        assert not finished.wait(0.15)
        assert guard.snapshot_session_guard(session_id="chat").state == "parked"
        guard.consume_parked_session_guard(session_id="chat", interaction_id="interaction", source_attempt_id="old")
        assert finished.wait(2)
        assert result[0].status == "running"
        assert guard.snapshot_session_guard(session_id="chat").attempt_id == "new"
    finally:
        worker.join(2)
