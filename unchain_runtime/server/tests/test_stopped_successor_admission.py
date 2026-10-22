"""Acceptance is durable before init; cancelling a waiter cannot touch its predecessor."""
import json
import queue
import threading
from unittest import mock

import pytest
import app
import routes
import durable_interaction_host as host
import execution_control as control
import session_execution_guard as guards
import test_durable_interaction_host as host_tests


def test_fresh_v4_init_acknowledges_registered_attempt_before_execution(tmp_path, monkeypatch):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    client = app.create_app().test_client()
    with mock.patch.object(routes, "stream_chat_events", return_value=iter(())) as run:
        response = client.post("/chat/stream/v4", json={
            "message": "saved new message", "threadId": "chat-wait-admission", "attempt_id": "next",
        }, buffered=False)
        try:
            first = next(iter(response.response)).decode()
            assert '"session.started"' in first
            registered = control.snapshot("chat-wait-admission", "next")
            assert registered is not None and registered.status == "registered"
            run.assert_not_called()
        finally:
            response.close()


@pytest.mark.parametrize("registered", [False, True])
def test_waiting_successor_stop_never_requires_predecessor_approval(tmp_path, monkeypatch, registered):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    request = host_tests.DurableInteractionHostTests()._seed_cancellable_request(
        session_id="chat-wait-stop", attempt_id="old",
    )
    control.register("chat-wait-stop", "old")
    control.mark_running("chat-wait-stop", "old")
    guards.park_session_guard(session_id="chat-wait-stop", interaction_id=request.interaction_id,
        source_attempt_id="old", owner_attempt_id="old")
    if registered:
        control.register("chat-wait-stop", "next")
    before = guards.snapshot_session_guard(session_id="chat-wait-stop")
    response = app.create_app().test_client().post("/chat/executions/cancel", json={
        "execution_id": "chat-wait-stop", "owner_chat_id": "chat-wait-stop", "attempt_id": "next",
    })
    assert response.status_code == 200, response.get_json()
    assert control.snapshot("chat-wait-stop", "next").cancelled
    assert control.snapshot("chat-wait-stop", "old").status == "running"
    assert guards.snapshot_session_guard(session_id="chat-wait-stop") == before
    assert host._interaction_runtime().load_active("chat-wait-stop").request.interaction_id == request.interaction_id
    control.register("chat-wait-stop", "next")
    assert control.mark_running("chat-wait-stop", "next").snapshot.cancelled


@pytest.mark.parametrize("stops", [None, {}, ["old"], [{"attempt_id": "next"}],
    [{"attempt_id": "old", "extra": True}], [{"attempt_id": "old"}] * 65])
def test_stop_metadata_is_closed_and_bounded(tmp_path, monkeypatch, stops):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    with mock.patch.object(routes, "stream_chat_events", return_value=iter(())) as run:
        response = app.create_app().test_client().post("/chat/stream/v4", json={
            "message": "new", "threadId": "chat-wait-validation", "attempt_id": "next",
            "stopped_attempts": stops,
        })
        response.close()
        assert response.status_code == 400
        run.assert_not_called()


@pytest.mark.parametrize("stop_successor", [False, True])
def test_explicit_send_is_acknowledged_before_old_writer_settles(tmp_path, monkeypatch, stop_successor):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    session = "chat-ack-before-settlement"
    request = host_tests.DurableInteractionHostTests()._seed_cancellable_request(
        session_id=session, attempt_id="old",
    )
    control.register(session, "old")
    control.mark_running(session, "old")
    acknowledged = threading.Event()
    admission_entered = threading.Event()
    executed = threading.Event()
    output = queue.Queue()
    def stream(**kwargs):
        admission_entered.set()
        running = control.mark_running(session, kwargs["attempt_id"])
        if running.snapshot.cancelled:
            return
        executed.set()
        yield {"type": "run_started", "run_id": kwargs["attempt_id"], "iteration": 0}
        control.mark_completed(session, kwargs["attempt_id"])
    def send():
        try:
            client = app.create_app().test_client()
            response = client.post("/chat/stream/v4", json={
                "message": "saved while the old writer is still busy", "threadId": session,
                "owner_chat_id": session, "attempt_id": "next",
                "stopped_attempts": [{"attempt_id": "old"}],
            }, buffered=False)
            for chunk in response.response:
                text = chunk.decode()
                output.put(text)
                if '"session.started"' in text:
                    assert control.snapshot(session, "next").status == "registered"
                    acknowledged.set()
            response.close()
        except BaseException as error:
            output.put(error)
    with mock.patch.object(routes, "stream_chat_events", side_effect=stream):
        worker = threading.Thread(target=send, daemon=True)
        worker.start()
        try:
            assert acknowledged.wait(3)
            assert admission_entered.wait(3)
            assert control.snapshot(session, "old").cancelled
            assert guards.snapshot_session_guard(session_id=session).attempt_id == "old"
            assert not executed.wait(.1)
            if stop_successor:
                response = app.create_app().test_client().post("/chat/executions/cancel", json={
                    "execution_id": session, "owner_chat_id": session, "attempt_id": "next",
                })
                assert response.status_code == 200, response.get_json()
                worker.join(3)
                assert not worker.is_alive()
                assert not executed.is_set()
                assert guards.snapshot_session_guard(session_id=session).attempt_id == "old"
        finally:
            control.finish_cancelled_run(session, "old")
            worker.join(3)
        assert not worker.is_alive()
        assert executed.is_set() is not stop_successor
        frames = list(output.queue)
        assert not any(isinstance(frame, BaseException) for frame in frames), frames
        assert not any('"transport.failed"' in frame for frame in frames)
        if stop_successor:
            assert control.snapshot(session, "next").cancelled
            assert control.mark_running(session, "next").snapshot.cancelled


def test_waiting_stop_rejects_foreign_memory_owner_before_registry_mutation(tmp_path, monkeypatch):
    from test_memory_v2_acceptance_crash_matrix import first_pending
    import test_memory_v2_unchain_active_graph_interaction_resume as fixture
    with first_pending(tmp_path, monkeypatch) as pending:
        control.register(fixture.EXECUTION_ID, "next")
        before = guards.snapshot_session_guard(session_id=fixture.EXECUTION_ID)
        response = app.create_app().test_client().post("/chat/executions/cancel", json={
            "execution_id": fixture.EXECUTION_ID, "owner_chat_id": "foreign-owner",
            "attempt_id": "next",
        })
        assert response.status_code != 200
        assert control.snapshot(fixture.EXECUTION_ID, "next").status == "registered"
        assert guards.snapshot_session_guard(session_id=fixture.EXECUTION_ID) == before
        assert host._active_interaction_id(fixture.EXECUTION_ID) == pending["interaction_id"]


@pytest.mark.parametrize("mismatch", ["interaction", "source", "session"])
def test_stop_metadata_cannot_cancel_foreign_lineage(tmp_path, monkeypatch, mismatch):
    from execution_admission import reconcile_stopped_attempts
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    session = "chat-lineage"
    request = host_tests.DurableInteractionHostTests()._seed_cancellable_request(
        session_id=session, attempt_id="foreign")
    control.register(session, "foreign")
    control.mark_running(session, "foreign")
    control.register(session, "next")
    before = guards.snapshot_session_guard(session_id=session)
    entry = {"attempt_id": "stopped"}
    if mismatch == "interaction":
        entry["interaction_id"] = request.interaction_id
    elif mismatch == "source":
        entry["source_attempt_id"] = "foreign"
    else:
        entry = {"attempt_id": "foreign", "interaction_id": request.interaction_id}
        session = "other-session"
    if mismatch == "session":
        reconcile_stopped_attempts(session_id=session, owner_chat_id=session,
            attempt_id="next", stopped_attempts=[entry])
    else:
        with pytest.raises(host.DurableInteractionHostError):
            reconcile_stopped_attempts(session_id=session, owner_chat_id=session,
                attempt_id="next", stopped_attempts=[entry])
    assert control.snapshot("chat-lineage", "foreign").status == "running"
    assert guards.snapshot_session_guard(session_id="chat-lineage") == before
    assert host._active_interaction_id("chat-lineage") == request.interaction_id


def test_registered_cancel_cas_cannot_cancel_worker_that_won_admission(tmp_path, monkeypatch):
    import execution_admission as admission
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    session = "chat-cancel-admit-race"
    host_tests.DurableInteractionHostTests()._seed_cancellable_request(session_id=session, attempt_id="old")
    control.register(session, "old")
    control.mark_running(session, "old")
    control.register(session, "next")
    checked = threading.Event()
    proceed = threading.Event()
    real_owns = admission._attempt_owns_interaction
    result = {}
    def pause_before_cas(*args):
        owned = real_owns(*args)
        checked.set()
        assert proceed.wait(5)
        return owned
    def cancel():
        result["value"] = admission.cancel_unstarted_attempt_with_foreign_interaction(
            session_id=session, attempt_id="next", reason="user_stop")
    with mock.patch.object(admission, "_attempt_owns_interaction", side_effect=pause_before_cas):
        worker = threading.Thread(target=cancel, daemon=True)
        worker.start()
        try:
            assert checked.wait(5)
            control.mark_completed(session, "old")
            assert control.mark_running(session, "next").snapshot.status == "running"
        finally:
            proceed.set()
            worker.join(5)
    assert not worker.is_alive()
    assert result["value"] is None
    assert control.snapshot(session, "next").status == "running"
    assert not control.cancellation_event(session, "next").is_set()


def test_stop_metadata_rejects_foreign_owner_for_noninteractive_running_attempt(tmp_path, monkeypatch):
    from execution_admission import reconcile_stopped_attempts
    from test_memory_v2_acceptance_crash_matrix import first_pending
    import test_memory_v2_unchain_active_graph_interaction_resume as fixture
    with first_pending(tmp_path, monkeypatch) as pending:
        host.cancel_chat_execution(session_id=fixture.EXECUTION_ID,
            attempt_id=fixture.COORDINATOR_ATTEMPT_ID, owner_chat_id=fixture.OWNER_CHAT_ID,
            expected_interaction_id=pending["interaction_id"])
        assert not host._active_interaction_id(fixture.EXECUTION_ID)
        control.register(fixture.EXECUTION_ID, "noninteractive")
        control.mark_running(fixture.EXECUTION_ID, "noninteractive")
        control.register(fixture.EXECUTION_ID, "next")
        before = guards.snapshot_session_guard(session_id=fixture.EXECUTION_ID)
        with pytest.raises(Exception, match="different chat owner"):
            reconcile_stopped_attempts(session_id=fixture.EXECUTION_ID, owner_chat_id="foreign-owner",
                attempt_id="next", stopped_attempts=[{"attempt_id": "noninteractive"}])
        assert control.snapshot(fixture.EXECUTION_ID, "noninteractive").status == "running"
        assert guards.snapshot_session_guard(session_id=fixture.EXECUTION_ID) == before


@pytest.mark.parametrize("stop_successor", [False, True])
def test_fresh_route_reconciles_second_live_approval_before_successor_admission(tmp_path, monkeypatch, stop_successor):
    """Installed kernel: approved first call, live second call, stale Stop target."""
    from collections import Counter
    from recipe_loader import save_recipe
    from unchain.kernel import ModelTurnResult
    from unchain.kernel.types import ToolCall
    from unchain.tools import Toolkit
    import unchain_adapter as adapter
    import test_memory_v2_unchain_active_graph_interaction_resume as fixture
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    session, old = fixture.EXECUTION_ID, fixture.COORDINATOR_ATTEMPT_ID
    options = {"modelId": "openai:graph-base", "recipe_name": fixture.RECIPE_NAME,
        "memory_enabled": True, "durable_interactions_required": True,
        "_memory_v2_requested": True, "_memory_v2_owner_chat_id": fixture.OWNER_CHAT_ID,
        "_memory_v2_session_id": session, "_memory_v2_attempt_id": old}
    calls, result = [], {}
    presented = queue.Queue()
    transport, retired, release_kernel = threading.Event(), threading.Event(), threading.Event()
    acknowledged, entered, executed = threading.Event(), threading.Event(), threading.Event()
    toolkit = Toolkit()
    toolkit.register(lambda: calls.append("executed") or {"ok": True},
        name="approval_probe", parameters=[], requires_confirmation=True)
    def tool_turn(ordinal):
        call_id = f"approval-{ordinal}"
        return ModelTurnResult(assistant_messages=[{"type": "function_call", "call_id": call_id,
            "name": "approval_probe", "arguments": "{}"}],
            tool_calls=[ToolCall(call_id=call_id, name="approval_probe", arguments={})],
            response_id=f"response-{ordinal}")
    real_retire = adapter.retire_cancelled_callback_interaction
    def retire(**kwargs):
        real_retire(**kwargs)
        retired.set()
        assert release_kernel.wait(10)
    def read_old():
        try:
            for event in adapter.stream_chat_events(message="Use the tool twice", history=[],
                options=options, session_id=session, attempt_id=old, cancel_event=transport):
                if event.get("type") == "tool_call" and event.get("requires_confirmation"):
                    presented.put(event["confirmation_id"])
        except BaseException as error:
            result["old_error"] = error
    def new_execution(**kwargs):
        entered.set()
        status = control.mark_running(session, kwargs["attempt_id"])
        if status.snapshot.cancelled:
            return
        executed.set()
        yield {"type": "run_started", "run_id": "next", "iteration": 0}
        control.mark_completed(session, "next")
    def send(first, source):
        try:
            response = app.create_app().test_client().post("/chat/stream/v4", json={
                "message": "Continue explicitly", "threadId": session,
                "owner_chat_id": fixture.OWNER_CHAT_ID, "attempt_id": "next",
                "stopped_attempts": [{"attempt_id": old, "interaction_id": first,
                                      "source_attempt_id": source}],
            }, buffered=False)
            result["frames"] = []
            for chunk in response.response:
                frame = chunk.decode()
                result["frames"].append(frame)
                if '"session.started"' in frame:
                    assert control.snapshot(session, "next").status == "registered"
                    acknowledged.set()
            response.close()
        except BaseException as error:
            result["new_error"] = error
    with fixture._production_patches(tmp_path=tmp_path, provider_calls=Counter(),
        provider_requests={}, agent_calls=[], interaction_count=2), mock.patch(
        "test_memory_v2_unchain_active_graph_interaction_resume._ask_turn", side_effect=tool_turn), mock.patch.object(
        adapter, "_resolve_graph_agent_toolkits", return_value=[toolkit]), mock.patch.object(
        adapter, "retire_cancelled_callback_interaction", side_effect=retire), mock.patch.object(
        routes, "stream_chat_events", side_effect=new_execution):
        build = adapter._build_developer_agent
        with mock.patch.object(adapter, "_build_developer_agent", side_effect=lambda **kw: build(**kw)._inner):
            save_recipe(fixture._recipe_payload())
            old_worker = threading.Thread(target=read_old, daemon=True)
            old_worker.start()
            new_worker = None
            try:
                first = presented.get(timeout=10)
                source = host.get_pending_interaction(session)["source_run_id"]
                receipt = host.record_interaction_receipt(session_id=session, interaction_id=first, approved=True)
                assert adapter.submit_tool_confirmation(first, True, durable_receipt=receipt.handoff)
                second = presented.get(timeout=10)
                assert first != second and calls == ["executed"]
                new_worker = threading.Thread(target=send, args=(first, source), daemon=True)
                new_worker.start()
                assert acknowledged.wait(5), result
                assert retired.wait(5), result
                assert entered.wait(5), result
                assert not executed.is_set()
                assert guards.snapshot_session_guard(session_id=session).attempt_id == old
                store, _ = fixture._plan_from_store(tmp_path)
                assert not any(e.event_type == "run_cancelled" for e in
                    store.bind_execution(session).capture_snapshot().events)
                if stop_successor:
                    response = app.create_app().test_client().post("/chat/executions/cancel", json={
                        "execution_id": session, "owner_chat_id": fixture.OWNER_CHAT_ID, "attempt_id": "next"})
                    assert response.status_code == 200, response.get_json()
                    new_worker.join(5)
                    assert not new_worker.is_alive()
                    assert not executed.is_set()
            finally:
                release_kernel.set()
                transport.set()
                adapter.cancel_tool_confirmations()
                old_worker.join(10)
                if new_worker:
                    new_worker.join(10)
            assert "old_error" not in result and "new_error" not in result, result
            assert not old_worker.is_alive() and not new_worker.is_alive()
            assert calls == ["executed"]
            assert executed.is_set() is not stop_successor
            assert guards.snapshot_session_guard(session_id=session) is None
            events = store.bind_execution(session).capture_snapshot().events
            terminals = [e for e in events if e.event_type == "run_cancelled"]
            assert len(terminals) == 2 and len({e.attempt.attempt_id for e in terminals}) == 2
            assert not any('"run.failed"' in frame for frame in result["frames"])


def test_stop_metadata_rejects_stale_captured_source_without_coordinator_authority(tmp_path, monkeypatch):
    from execution_admission import reconcile_stopped_attempts
    from test_memory_v2_acceptance_crash_matrix import second_pending
    import test_memory_v2_unchain_active_graph_interaction_resume as fixture
    with second_pending(tmp_path, monkeypatch) as current:
        journal = host._interaction_runtime().memory_runtime.load_session_snapshot(
            fixture.EXECUTION_ID).state["interaction_journal"]
        first_id = journal["order"][0]
        first = host._interaction_cancel_target(fixture.EXECUTION_ID, first_id)
        assert first.request.source_run_id != current["source_run_id"]
        control.register(fixture.EXECUTION_ID, "next")
        kwargs = dict(session_id=fixture.EXECUTION_ID, owner_chat_id=fixture.OWNER_CHAT_ID,
            attempt_id="next", stopped_attempts=[{"attempt_id": fixture.COORDINATOR_ATTEMPT_ID,
                "interaction_id": first_id, "source_attempt_id": first.request.source_run_id}])
        before = guards.snapshot_session_guard(session_id=fixture.EXECUTION_ID)
        with pytest.raises(host.DurableInteractionHostError, match="no authoritative coordinator"):
            reconcile_stopped_attempts(**kwargs)
        assert host._active_interaction_id(fixture.EXECUTION_ID) == current["interaction_id"]
        assert guards.snapshot_session_guard(session_id=fixture.EXECUTION_ID) == before
        assert control.snapshot(fixture.EXECUTION_ID, "next").status == "registered"
