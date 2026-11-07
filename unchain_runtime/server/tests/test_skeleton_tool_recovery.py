"""Cold host observation of an actual killed Tool Call; no replay authority."""
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


def test_killed_tool_effect_becomes_unknown_without_redispatch(production, tmp_path):
    options, calls = _step(production, tmp_path, name="write")
    _start(options)
    pending = interactions.get_pending_interaction("step-session")
    interactions.record_interaction_receipt(session_id="step-session", interaction_id=pending["interaction_id"], approved=True)
    options_path = tmp_path / "resume-options.json"
    options_path.write_text(json.dumps(options))
    marker = tmp_path / "effect-before-seal.json"
    child = subprocess.run([sys.executable, "-I", "-B", str(Path(__file__).with_name("skeleton_tool_kill_child.py")),
        str(options_path), pending["interaction_id"], str(marker)], env=os.environ.copy(),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=30)
    assert child.returncode == -signal.SIGKILL, child.stdout
    assert json.loads(marker.read_text())["effect"] == "one offline effect"
    launch = load_launch("step-session", "step-root")
    before = launch.store.load()
    assert before.state["status"] == "running"
    from session_execution_guard import snapshot_session_guard
    guard = snapshot_session_guard(session_id="step-session")
    assert guard.state == "active" and guard.attempt_id == "step-resume"
    assert guard.owner_pid != os.getpid()
    # Same data, different process owner; no live fixture/toolkit binding is
    # supplied to this cold observer. Its only authority is the stopped owner.
    effect_stat = (tmp_path / "written-once.txt").stat()
    observed = subprocess.run([sys.executable, "-I", "-B", str(Path(__file__).with_name("skeleton_tool_recover_child.py"))],
        env=os.environ.copy(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
    assert observed.returncode == 0, observed.stderr
    observation = json.loads(observed.stdout.splitlines()[-1])
    assert observation["pid"] != os.getpid() and observation["pending"] == "none"
    assert observation["status"] == "outcome_unknown"
    after = load_launch("step-session", "step-root").store.load()
    assert after.state["status"] == "outcome_unknown"
    assert after.state["error"]["code"] == "outcome_unknown"
    assert after.revision == before.revision + 1
    count = len(launch.journal.capture_snapshot().events)
    assert interactions.get_pending_interaction("step-session")["status"] == "none"
    assert len(launch.journal.capture_snapshot().events) == count
    assert snapshot_session_guard(session_id="step-session") is None
    assert (tmp_path / "written-once.txt").read_text() == "one offline effect" and calls == []
    current_stat = (tmp_path / "written-once.txt").stat()
    assert (current_stat.st_ino, current_stat.st_mtime_ns, current_stat.st_size) == (
        effect_stat.st_ino, effect_stat.st_mtime_ns, effect_stat.st_size)
    # The interrupted graph is not retrospectively reported as cancelled.
    with pytest.raises(interactions.DurableInteractionHostError) as cancelled:
        interactions.cancel_chat_execution(session_id="step-session", attempt_id="step-resume",
            source_attempt_id="step-root", owner_chat_id="production-chat")
    assert cancelled.value.code == "outcome_unknown"
    assert load_launch("step-session", "step-root").store.load().state == after.state
