"""Windows acceptance for the K4 commit lock across independent processes."""

import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

import durable_interaction_host as host
import test_memory_v2_unchain_active_graph_interaction_resume as fixture
from memory_v2_unchain_active_bridge import (
    pupu_unchain_cold_accepted_interaction_resolution,
)
from test_memory_v2_acceptance_crash_matrix import second_pending


pytestmark = pytest.mark.skipif(os.name != "nt", reason="Windows process acceptance")

_CHILD = r"""
import json, sys
sys.path.insert(0, sys.argv[1])
import durable_interaction_host as host
args = json.loads(sys.argv[2])
print('ready', flush=True)
assert sys.stdin.readline().strip() == 'go'
try:
    if args['action'] == 'lock':
        with host._interaction_commit_lock(args['session']):
            with host._interaction_commit_lock(args['session']):
                print('locked', flush=True)
                assert sys.stdin.readline().strip() == 'release'
        result = {'status': 'released'}
    elif args['action'] == 'submit':
        result = host.record_interaction_receipt(
            session_id=args['session'], interaction_id=args['interaction'],
            approved=True,
            modified_arguments={'user_response': {'selected_values': [args['answer']]}},
        )
    else:
        result = host.cancel_chat_execution(
            session_id=args['session'], attempt_id=args['source'],
            owner_chat_id=args['owner'],
            expected_interaction_id=args['interaction'], reason='user_stop',
        )
except host.DurableInteractionHostError as exc:
    result = {'status': 'error', 'code': exc.code}
print(json.dumps(result), flush=True)
"""


def _spawn(arguments):
    process = subprocess.Popen(
        [sys.executable, "-c", _CHILD, str(Path(host.__file__).parent),
         json.dumps(arguments)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True,
    )
    assert process.stdout.readline().strip() == "ready"
    return process


def _send(process, message):
    process.stdin.write(message + "\n")
    process.stdin.flush()


def _finish(process):
    stdout, stderr = process.communicate(timeout=30)
    assert process.returncode == 0, stderr
    return json.loads(stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("abrupt_exit", [False, True])
def test_windows_commit_lock_excludes_processes_and_releases_on_exit(
    tmp_path, monkeypatch, abrupt_exit,
):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    args = {"session": "process-lock-review", "action": "lock"}
    holder = _spawn(args)
    contender = _spawn(args)
    try:
        _send(holder, "go")
        assert holder.stdout.readline().strip() == "locked"
        _send(contender, "go")
        _send(contender, "release")
        with pytest.raises(subprocess.TimeoutExpired):
            contender.wait(timeout=0.5)
        if abrupt_exit:
            holder.kill()
            holder.communicate(timeout=10)
        else:
            _send(holder, "release")
            assert _finish(holder)["status"] == "released"
        assert _finish(contender)["status"] == "released"
    finally:
        for process in (holder, contender):
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=10)


@pytest.mark.parametrize("scenario", ["same_answer", "different_answers", "cancel"])
def test_process_competitors_leave_one_consistent_resolution(tmp_path, monkeypatch, scenario):
    with second_pending(tmp_path, monkeypatch) as pending:
        common = {
            "session": fixture.EXECUTION_ID,
            "interaction": pending["interaction_id"],
            "source": pending["source_run_id"],
            "owner": fixture.OWNER_CHAT_ID,
        }
        first = _spawn({**common, "action": "submit", "answer": "vue"})
        second = _spawn({
            **common, "action": "cancel" if scenario == "cancel" else "submit",
            "answer": "react" if scenario == "different_answers" else "vue",
        })
        try:
            _send(first, "go")
            _send(second, "go")
            results = [_finish(first), _finish(second)]
        finally:
            for process in (first, second):
                if process.poll() is None:
                    process.kill()
                    process.communicate(timeout=10)
        if scenario == "same_answer":
            assert all(result["status"] == "ok" for result in results), results
            assert results[0]["receipt_id"] == results[1]["receipt_id"]
        elif scenario == "different_answers":
            assert sum(result["status"] == "ok" for result in results) == 1, results
            rejected = next(result for result in results if result["status"] != "ok")
            assert rejected["code"] == "interaction_canonical_conflict"
        else:
            assert results[1]["status"] == "ok", results
            if results[0]["status"] != "ok":
                assert results[0]["code"] == "execution_cancelled", results
            assert host.get_pending_interaction(fixture.EXECUTION_ID)["status"] == "none"
        canonical = pupu_unchain_cold_accepted_interaction_resolution(
            owner_chat_id=fixture.OWNER_CHAT_ID,
            session_id=fixture.EXECUTION_ID,
            source_attempt_id=pending["source_run_id"],
            interaction_id=pending["interaction_id"],
        )
        snapshot = host._interaction_runtime().load(
            fixture.EXECUTION_ID, interaction_id=pending["interaction_id"],
            require_active=False,
        )
        assert canonical is not None and snapshot.receipt is not None
        assert canonical.response == snapshot.receipt.response
        store, _ = fixture._plan_from_store(tmp_path)
        events = store.bind_execution(fixture.EXECUTION_ID).capture_snapshot().events
        assert sum(
            event.event_type == "interaction.resolved"
            and event.payload.get("interaction_id") == pending["interaction_id"]
            for event in events
        ) == 1
