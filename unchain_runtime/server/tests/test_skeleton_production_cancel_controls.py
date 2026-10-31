"""Independent real production cancellation controls, with native SDK blocked."""
from threading import Event, Thread
from time import monotonic, sleep
from types import SimpleNamespace

import pytest
import unchain_adapter as adapter
import skeleton_production_chat as production
import durable_interaction_host as interactions
from skeleton_production_state import load_launch
from session_execution_guard import snapshot_session_guard
from test_skeleton_production_chat import production as production_fixture, Stream
from test_skeleton_production_bindings import _pool
from test_skeleton_resource_store import agent
from unchain.tools import Toolkit


@pytest.mark.parametrize("mode", ["event", "public", "public_race"])
def test_inflight_cancel_fences_end_and_keeps_worker_guard_until_sdk_stops(production_fixture, monkeypatch, mode):
    store, options, _calls = production_fixture
    saved = store.get_resource("production-agent")
    store.save_draft(_pool(agent("production-agent")), expected_edit_token=saved["edit_token"])
    closed = []
    toolkit = Toolkit()
    toolkit.disconnect = lambda: closed.append("closed")
    adapter._set_runtime_toolkit_metadata(toolkit, toolkit_id="core", toolkit_name="Core")
    monkeypatch.setattr(adapter, "_build_selected_toolkits", lambda *args, **kwargs: [toolkit])
    release = Event()
    cancelled = Event()
    worker_stopped = Event()
    cancel_event = Event()
    errors = []
    transport_errors = []
    observed = {}
    holder = {}
    actual_execution = production.PupuSkeletonAgentExecution
    def capture_execution(*args, **kwargs):
        value = actual_execution(*args, **kwargs)
        holder["execution"] = value
        holder["emit"] = kwargs["callback"]
        return value
    monkeypatch.setattr(production, "PupuSkeletonAgentExecution", capture_execution)
    actual_clear = production.clear_execution_attempt_binding
    def cleared(*args, **kwargs):
        try: return actual_clear(*args, **kwargs)
        finally: worker_stopped.set()
    monkeypatch.setattr(production, "clear_execution_attempt_binding", cleared)
    def create(**wire):
        holder["emit"]({"type": "probe_sdk_entered"})
        assert release.wait(5), "SDK control never released"
        return Stream("cancelled response must not reach End")
    import openai
    monkeypatch.setattr(openai, "OpenAI", lambda **kwargs: SimpleNamespace(responses=SimpleNamespace(create=create)))
    session_id, attempt_id = "cancel-control-" + mode, "cancel-root-" + mode
    stream = adapter.stream_chat_events(message="cancel while SDK blocked", history=[], options=options,
        session_id=session_id, attempt_id=attempt_id, cancel_event=cancel_event)
    events = []
    watcher = None
    try:
        for event in stream:
            events.append(event)
            if event.get("type") == "probe_sdk_entered": break
        else: pytest.fail("SDK entry progress was not forwarded")
        memory_guard = holder["execution"]._kernel_arguments["execution_guard"]
        assert snapshot_session_guard(session_id=session_id).state == "active"
        assert closed == []
        if mode in {"public", "public_race"}:
            with pytest.raises(interactions.DurableInteractionHostError) as wrong_owner:
                interactions.cancel_chat_execution(session_id=session_id, attempt_id=attempt_id,
                    source_attempt_id=attempt_id, owner_chat_id="another-chat")
            assert wrong_owner.value.code == "skeleton_launch_owner_mismatch"
            assert memory_guard._runtime.load_cancellation(session_id, attempt_id) is None
            assert load_launch(session_id, attempt_id).store.load().state["status"] == "running"
            if mode == "public_race":
                import skeleton_production_interactions as graph_interactions
                actual_graph_cancel = graph_interactions.cancel_skeleton_execution
                def release_after_public_graph_cancellation(**kwargs):
                    value = actual_graph_cancel(**kwargs)
                    # Identity checks and actual graph cancellation already ran.
                    # A native response may finish before the outer public
                    # wrapper continues to its legacy token write.
                    assert holder["execution"].store.load().state["status"] == "cancelled"
                    release.set()
                    assert worker_stopped.wait(5), "actual worker did not stop after public graph closure"
                    return value
                monkeypatch.setattr(graph_interactions, "cancel_skeleton_execution", release_after_public_graph_cancellation)
            result = interactions.cancel_chat_execution(session_id=session_id, attempt_id=attempt_id,
                source_attempt_id=attempt_id, owner_chat_id="production-chat")
            assert result["state"] == "cancelled"
            assert memory_guard._runtime.load_cancellation(session_id, attempt_id) is not None
            if mode == "public":
                assert snapshot_session_guard(session_id=session_id).state == "active"
                assert closed == []
            release.set()
        else:
            actual_cancel = production.cancel_skeleton_execution
            def release_after_real_cancellation(**kwargs):
                result = actual_cancel(**kwargs)
                # A scheduler may pause the consumer after the actual graph
                # cancellation, before its following legacy token write.
                # Hold precisely that valid window while the real SDK reply
                # returns; no production guard/runner/state write is replaced.
                state = holder["execution"].store.load().state
                assert state["status"] == "cancelled"
                observed["memory_cancelled"] = memory_guard._runtime.load_cancellation(session_id, attempt_id) is not None
                observed["guard"] = snapshot_session_guard(session_id=session_id).state
                observed["closed"] = list(closed)
                cancelled.set()
                release.set()
                assert worker_stopped.wait(5), "actual worker did not stop after fenced SDK response"
                return result
            monkeypatch.setattr(production, "cancel_skeleton_execution", release_after_real_cancellation)
            cancel_event.set()
        try:
            events.extend(stream)
        except Exception as error:
            transport_errors.append((getattr(error, "code", type(error).__name__), str(error)))
    finally:
        release.set()
        stream.close()
        if watcher is not None: watcher.join(timeout=5)
    assert not errors, errors
    if mode == "event":
        assert cancelled.is_set()
        assert observed == {"memory_cancelled": True, "guard": "active", "closed": []}
    assert worker_stopped.wait(5)
    state = load_launch(session_id, attempt_id).store.load().state
    assert (state["status"], state["root_committed"]) == ("cancelled", False)
    assert not [e for e in events if e.get("type") == "final_message"]
    assert snapshot_session_guard(session_id=session_id) is None
    assert closed == ["closed"]
    assert not transport_errors, {"transport_errors": transport_errors, "state": (state["status"], state["root_committed"]), "session_guard": snapshot_session_guard(session_id=session_id), "toolkit_close": closed}
