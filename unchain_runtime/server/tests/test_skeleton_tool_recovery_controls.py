"""Independent control-entry and ownership tests around a real stopped writer."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys

import pytest
import durable_interaction_host as interactions
from skeleton_production_state import load_launch
from test_skeleton_production_chat import production  # noqa: F401
from test_skeleton_tool_lifecycle import _start, _step, offline_sockets  # noqa: F401


def _killed_writer(production, tmp_path):
    options, calls = _step(production, tmp_path, name="write")
    _start(options)
    pending = interactions.get_pending_interaction("step-session")
    interactions.record_interaction_receipt(session_id="step-session", interaction_id=pending["interaction_id"], approved=True)
    options_file = tmp_path / "options.json"
    options_file.write_text(json.dumps(options))
    child = subprocess.run([sys.executable, "-I", "-B", str(Path(__file__).with_name("skeleton_tool_kill_child.py")),
        str(options_file), pending["interaction_id"], str(tmp_path / "killed-marker.json")],
        env=os.environ.copy(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=30)
    assert child.returncode == -signal.SIGKILL, child.stdout
    assert load_launch("step-session", "step-root").store.load().state["status"] == "running"
    return options, calls


def test_cancel_as_first_cold_operation_preserves_unknown_effect(production, tmp_path):
    _options, calls = _killed_writer(production, tmp_path)
    with pytest.raises(interactions.DurableInteractionHostError) as refused:
        interactions.cancel_chat_execution(session_id="step-session", attempt_id="step-resume",
            source_attempt_id="step-root", owner_chat_id="production-chat")
    assert refused.value.code == "outcome_unknown"
    assert load_launch("step-session", "step-root").store.load().state["status"] == "outcome_unknown"
    assert (tmp_path / "written-once.txt").read_text() == "one offline effect" and calls == []


def test_new_send_as_first_cold_operation_settles_old_then_creates_new_root(production, tmp_path):
    options, calls = _killed_writer(production, tmp_path)
    events = _start(options, attempt="next-root")
    assert any(event.get("type") == "interaction_requested" for event in events)
    assert load_launch("step-session", "step-root", allow_terminal_stale=True).store.load().state["status"] == "outcome_unknown"
    assert load_launch("step-session", "next-root").store.load().state["status"] == "waiting"
    assert calls == [] and (tmp_path / "written-once.txt").read_text() == "one offline effect"


def test_missing_guard_is_not_evidence_of_a_stopped_owner(production, monkeypatch, tmp_path):
    _options, calls = _killed_writer(production, tmp_path)
    import session_execution_guard as guards
    original = guards.snapshot_session_guard
    before = load_launch("step-session", "step-root").store.load()
    monkeypatch.setattr(guards, "snapshot_session_guard", lambda **_kwargs: None)
    assert interactions.get_pending_interaction("step-session")["status"] == "none"
    assert load_launch("step-session", "step-root").store.load().state == before.state
    monkeypatch.setattr(guards, "snapshot_session_guard", original)
    assert interactions.get_pending_interaction("step-session")["status"] == "none"
    assert load_launch("step-session", "step-root").store.load().state["status"] == "outcome_unknown"
    assert calls == []


def test_write_fault_retains_reclaimed_authority_for_one_safe_retry(production, monkeypatch, tmp_path):
    _options, calls = _killed_writer(production, tmp_path)
    import skeleton_production_interactions as api
    from session_execution_guard import snapshot_session_guard
    original = api._mutable_journal
    def fault(_launch):
        raise OSError("disposable recovery write fault")
    monkeypatch.setattr(api, "_mutable_journal", fault)
    with pytest.raises(interactions.DurableInteractionHostError):
        interactions.get_pending_interaction("step-session")
    assert snapshot_session_guard(session_id="step-session").owner_pid == os.getpid()
    assert load_launch("step-session", "step-root").store.load().state["status"] == "running"
    monkeypatch.setattr(api, "_mutable_journal", original)
    assert interactions.get_pending_interaction("step-session")["status"] == "none"
    state = load_launch("step-session", "step-root").store.load()
    assert state.state["status"] == "outcome_unknown"
    assert snapshot_session_guard(session_id="step-session") is None
    assert interactions.get_pending_interaction("step-session")["status"] == "none"
    assert load_launch("step-session", "step-root").store.load().revision == state.revision
    assert calls == []


def test_live_foreign_owner_is_never_recovered_or_released(production, tmp_path):
    import time
    from session_execution_guard import snapshot_session_guard
    options, calls = _step(production, tmp_path, name="write")
    _start(options)
    pending = interactions.get_pending_interaction("step-session")
    interactions.record_interaction_receipt(session_id="step-session", interaction_id=pending["interaction_id"], approved=True)
    options_file = tmp_path / "options.json"
    options_file.write_text(json.dumps(options))
    marker, release = tmp_path / "live-marker", tmp_path / "release"
    child = subprocess.Popen([sys.executable, "-I", "-B", str(Path(__file__).with_name("skeleton_tool_hold_child.py")),
        str(options_file), pending["interaction_id"], str(marker), str(release)], env=os.environ.copy(),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        until = time.monotonic() + 12
        while not marker.exists() and child.poll() is None and time.monotonic() < until:
            time.sleep(.02)
        assert marker.exists(), "child did not reach the real effect"
        before = load_launch("step-session", "step-root").store.load()
        guard = snapshot_session_guard(session_id="step-session")
        assert guard.owner_pid == child.pid and before.state["status"] == "running"
        assert interactions.get_pending_interaction("step-session")["status"] == "none"
        assert load_launch("step-session", "step-root").store.load().state == before.state
        assert snapshot_session_guard(session_id="step-session") == guard
        release.touch()
        output = child.communicate(timeout=20)[0]
        assert child.returncode == 0, output
        final = load_launch("step-session", "step-root").store.load().state
        assert final["status"] == "completed" and final["root_committed"] is True
        assert (tmp_path / "written-once.txt").read_text() == "one offline effect" and calls == []
    finally:
        if child.poll() is None:
            child.kill()
            child.communicate(timeout=5)


def test_missing_resume_binding_cannot_recover_an_unrelated_guard(production, monkeypatch, tmp_path):
    _options, calls = _killed_writer(production, tmp_path)
    import skeleton_production_interactions as api
    from session_execution_guard import snapshot_session_guard
    original = api.load_execution_attempt_binding
    before = load_launch("step-session", "step-root").store.load()
    guard = snapshot_session_guard(session_id="step-session")
    monkeypatch.setattr(api, "load_execution_attempt_binding", lambda *_args: None)
    with pytest.raises(interactions.DurableInteractionHostError) as refused:
        interactions.get_pending_interaction("step-session")
    assert refused.value.code == "skeleton_recovery_source_mismatch"
    assert snapshot_session_guard(session_id="step-session") == guard
    assert load_launch("step-session", "step-root").store.load().state == before.state
    monkeypatch.setattr(api, "load_execution_attempt_binding", original)
    assert interactions.get_pending_interaction("step-session")["status"] == "none" and calls == []


def test_lease_fence_fault_retries_after_graph_is_already_unknown(production, monkeypatch, tmp_path):
    _options, calls = _killed_writer(production, tmp_path)
    from session_execution_guard import snapshot_session_guard
    original = interactions._execution_runtime
    class BrokenLease:
        def request_cancel(self, *_args, **_kwargs):
            raise OSError("disposable core lease write fault")
    monkeypatch.setattr(interactions, "_execution_runtime", BrokenLease)
    with pytest.raises(interactions.DurableInteractionHostError):
        interactions.get_pending_interaction("step-session")
    unknown = load_launch("step-session", "step-root").store.load()
    assert unknown.state["status"] == "outcome_unknown"
    assert snapshot_session_guard(session_id="step-session").owner_pid == os.getpid()
    monkeypatch.setattr(interactions, "_execution_runtime", original)
    assert interactions.get_pending_interaction("step-session")["status"] == "none"
    assert snapshot_session_guard(session_id="step-session") is None
    assert load_launch("step-session", "step-root").store.load().revision == unknown.revision
    assert calls == []


def test_missing_owner_cannot_settle_a_stopped_predecessor(production, tmp_path):
    options, calls = _killed_writer(production, tmp_path)
    from session_execution_guard import snapshot_session_guard
    before = load_launch("step-session", "step-root").store.load()
    guard = snapshot_session_guard(session_id="step-session")
    options.pop("_memory_v2_owner_chat_id")
    with pytest.raises(Exception):
        _start(options, attempt="invalid-owner-attempt")
    assert load_launch("step-session", "step-root").store.load().state == before.state
    assert snapshot_session_guard(session_id="step-session") == guard
    assert calls == []
