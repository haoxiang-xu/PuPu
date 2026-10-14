"""A second live approval cannot make the still-running kernel quiescent."""
from collections import Counter
import json
import queue
import threading
from unittest import mock
import pytest

import durable_interaction_host as host
import execution_control as control
import session_execution_guard as guards
import unchain_adapter as adapter
from recipe_loader import save_recipe
from unchain.kernel import ModelTurnResult
from unchain.kernel.types import ToolCall
from unchain.tools import Toolkit
from test_memory_v2_unchain_active_graph_interaction_resume import (
    _production_patches, _recipe_payload, _plan_from_store, EXECUTION_ID,
    COORDINATOR_ATTEMPT_ID, OWNER_CHAT_ID, RECIPE_NAME,
)


@pytest.mark.parametrize("first_stop", ["transport", "http"])
def test_second_live_tool_stop_keeps_writer_guard_until_kernel_returns(tmp_path, monkeypatch, first_stop):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    calls = []
    toolkit = Toolkit()
    toolkit.register(lambda: calls.append("executed") or {"ok": True},
                     name="approval_probe", parameters=[], requires_confirmation=True)
    def tool_turn(ordinal):
        call_id = f"approval-{ordinal}"
        return ModelTurnResult(
            assistant_messages=[{"type": "function_call", "call_id": call_id,
                                 "name": "approval_probe", "arguments": json.dumps({})}],
            tool_calls=[ToolCall(call_id=call_id, name="approval_probe", arguments={})],
            response_id=f"response-{ordinal}",
        )
    presented = queue.Queue()
    transport = threading.Event()
    retired = threading.Event()
    release_kernel = threading.Event()
    result = {}
    options = {"modelId": "openai:graph-base", "recipe_name": RECIPE_NAME,
        "memory_enabled": True, "durable_interactions_required": True,
        "_memory_v2_requested": True, "_memory_v2_owner_chat_id": OWNER_CHAT_ID,
        "_memory_v2_session_id": EXECUTION_ID, "_memory_v2_attempt_id": COORDINATOR_ATTEMPT_ID}
    real_retire = adapter.retire_cancelled_callback_interaction
    def retire(**kwargs):
        real_retire(**kwargs)
        if first_stop == "crash":
            import os
            (tmp_path / "crashed-interaction.json").write_text(json.dumps(kwargs))
            os._exit(0)
        retired.set()
        assert release_kernel.wait(10)
    def read():
        try:
            for event in adapter.stream_chat_events(message="Use the tool twice", history=[],
                    options=options, session_id=EXECUTION_ID,
                    attempt_id=COORDINATOR_ATTEMPT_ID, cancel_event=transport):
                if event.get("type") == "tool_call" and event.get("requires_confirmation"):
                    presented.put(event["confirmation_id"])
        except BaseException as error:
            result["error"] = error
    with _production_patches(tmp_path=tmp_path, provider_calls=Counter(),
            provider_requests={}, agent_calls=[], interaction_count=2), mock.patch(
            "test_memory_v2_unchain_active_graph_interaction_resume._ask_turn", side_effect=tool_turn), mock.patch.object(
            adapter, "_resolve_graph_agent_toolkits", return_value=[toolkit]), mock.patch.object(
            adapter, "retire_cancelled_callback_interaction", side_effect=retire):
        build = adapter._build_developer_agent
        with mock.patch.object(adapter, "_build_developer_agent", side_effect=lambda **kw: build(**kw)._inner):
            save_recipe(_recipe_payload())
            reader = threading.Thread(target=read, daemon=True)
            reader.start()
            try:
                first = presented.get(timeout=10)
                first_pending = host.get_pending_interaction(EXECUTION_ID)
                receipt = host.record_interaction_receipt(session_id=EXECUTION_ID,
                    interaction_id=first, approved=True)
                assert adapter.submit_tool_confirmation(first, True, durable_receipt=receipt.handoff)
                second = presented.get(timeout=10)
                assert second != first and calls == ["executed"]
                second_pending = host.get_pending_interaction(EXECUTION_ID)
                import os
                capture_path = os.environ.get("PUPU_PENDING_REPRO_OUTPUT")
                if capture_path:
                    from pathlib import Path
                    Path(capture_path).write_text(json.dumps(
                        [first_pending, second_pending], ensure_ascii=False, indent=2,
                    ))
                if first_stop == "http":
                    host.cancel_chat_execution(session_id=EXECUTION_ID,
                        attempt_id=COORDINATOR_ATTEMPT_ID, expected_interaction_id=second)
                transport.set()
                adapter.cancel_tool_confirmations()
                assert retired.wait(10), result
                store, _ = _plan_from_store(tmp_path)
                events = store.bind_execution(EXECUTION_ID).capture_snapshot().events
                assert not any(e.event_type in {"run_cancelled", "run_failed"} for e in events)
                assert guards.snapshot_session_guard(session_id=EXECUTION_ID) is not None
                control.register(EXECUTION_ID, "next-attempt")
                admitted = threading.Event()
                successor = threading.Thread(target=lambda: (control.mark_running(EXECUTION_ID, "next-attempt"), admitted.set()), daemon=True)
                successor.start()
                assert not admitted.wait(.2)
            finally:
                release_kernel.set()
                transport.set()
                adapter.cancel_tool_confirmations()
                reader.join(10)
            assert not reader.is_alive() and "error" not in result, result
            assert admitted.wait(5)
            successor.join(5)
            events = store.bind_execution(EXECUTION_ID).capture_snapshot().events
            terminals = [e for e in events if e.event_type == "run_cancelled"]
            assert len(terminals) == 2
            assert len({e.attempt.attempt_id for e in terminals}) == 2
            assert calls == ["executed"]
            control.mark_completed(EXECUTION_ID, "next-attempt")


def test_dead_callback_owner_can_be_recovered_by_another_process(tmp_path, monkeypatch):
    import os
    import subprocess
    import sys

    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    code = (
        "from pathlib import Path; from pytest import MonkeyPatch; "
        "from test_stop_live_tool_writer import test_second_live_tool_stop_keeps_writer_guard_until_kernel_returns as run; "
        f"run(Path({str(tmp_path)!r}), MonkeyPatch(), 'crash')"
    )
    child = subprocess.run([sys.executable, "-c", code], timeout=30,
        capture_output=True, text=True,
        env={**os.environ, "PYTHONPATH": os.pathsep.join(sys.path)})
    assert child.returncode == 0, child.stderr
    stopped = json.loads((tmp_path / "crashed-interaction.json").read_text())
    store, _ = _plan_from_store(tmp_path)
    assert not any(e.event_type in {"run_cancelled", "run_failed"}
        for e in store.bind_execution(EXECUTION_ID).capture_snapshot().events)
    assert guards.snapshot_session_guard(session_id=EXECUTION_ID) is not None
    with _production_patches(tmp_path=tmp_path, provider_calls=Counter(),
            provider_requests={}, agent_calls=[]):
        host.cancel_chat_execution(session_id=EXECUTION_ID,
            attempt_id=COORDINATOR_ATTEMPT_ID,
            expected_interaction_id=stopped["interaction_id"])
    assert guards.snapshot_session_guard(session_id=EXECUTION_ID) is None
    terminals = [e for e in store.bind_execution(EXECUTION_ID).capture_snapshot().events
                 if e.event_type == "run_cancelled"]
    assert len(terminals) == 2 and len({e.attempt.attempt_id for e in terminals}) == 2
