"""Native takeover refusal must use V4's ordinary terminal failure contract.

The guard decision is controlled; its public error factory, Skeleton emitter,
bindings cleanup, execution control, route and installed bridge are real. Cold
process identity/history was qualified separately in frozen H5 evidence.
"""
import json

import pytest

import app
import execution_control
import routes
import skeleton_production_chat as skeleton_chat
import unchain_adapter as host
from durable_interaction_host import DurableInteractionHostError
from test_skeleton_production_chat import production  # noqa: F401


RECOVERY_CODE = "memory_v2_takeover_recovery_required"


def _refused_takeover(production, monkeypatch, inspection_status):
    _store, options, sdk_calls = production
    closed = []
    original_close = skeleton_chat.SkeletonProductionBindings.close

    def close(bindings):
        closed.append(bindings)
        return original_close(bindings)

    def refuse(**identity):
        # Reproduce the shared guard's existing terminal decision using its
        # actual error producer; do not fake the route or normalization result.
        host._execution_control_call("mark_failed", identity["session_id"],
            identity["attempt_id"], reason=RECOVERY_CODE)
        return host._memory_v2_takeover_recovery_event(
            attempt_id=identity["attempt_id"], inspection_status=inspection_status)

    def must_not_execute(*args, **kwargs):
        pytest.fail("a refused takeover reached execution preparation")

    monkeypatch.setattr(skeleton_chat.SkeletonProductionBindings, "close", close)
    monkeypatch.setattr(host, "_memory_v2_guard_reclaimed_execution", refuse)
    monkeypatch.setattr(skeleton_chat, "_bridge", must_not_execute)
    return options, sdk_calls, closed


def _assert_settled_without_execution(session_id, attempt_id, sdk_calls, closed):
    assert sdk_calls == []
    assert len(closed) == 1
    snapshot = execution_control.snapshot(session_id, attempt_id)
    assert snapshot.status == "failed"
    assert snapshot.reason == RECOVERY_CODE


@pytest.mark.parametrize("inspection_status", ["history_present", "unavailable"])
def test_takeover_raises_typed_failure_instead_of_yielding_dropped_error(
        production, monkeypatch, inspection_status):
    options, sdk_calls, closed = _refused_takeover(production, monkeypatch, inspection_status)
    session_id, attempt_id = "takeover-host-chat", "takeover-host-attempt"
    with pytest.raises(DurableInteractionHostError) as refused:
        list(skeleton_chat.stream_skeleton_chat_events(
            message="do not replay", history=[], attachments=[], options=options,
            session_id=session_id, attempt_id=attempt_id))
    assert refused.value.code == RECOVERY_CODE
    message = str(refused.value).lower()
    assert "cancel" in message and "before starting a new attempt" in message
    _assert_settled_without_execution(session_id, attempt_id, sdk_calls, closed)


def _frames(text):
    frames = []
    for block in text.split("\n\n"):
        event, data = "", ""
        for line in block.splitlines():
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                data = line[5:].strip()
        if event and data:
            frames.append((event, json.loads(data)))
    return frames


@pytest.mark.parametrize("inspection_status", ["history_present", "unavailable"])
def test_real_native_refusal_reaches_v4_failure_and_error_done(
        production, monkeypatch, inspection_status):
    options, sdk_calls, closed = _refused_takeover(production, monkeypatch, inspection_status)
    session_id, attempt_id = "takeover-v4-chat", "takeover-v4-attempt"

    def native_source(**request):
        # Supply the fixture's admitted execution context. Payload admission is
        # not this test's claim; the native producer and wire consumer are real.
        request["options"] = options
        return skeleton_chat.stream_skeleton_chat_events(**request)

    monkeypatch.setattr(routes, "stream_chat_events", native_source)
    response = app.create_app().test_client().post("/chat/stream/v4", json={
        "message": "do not replay", "threadId": session_id, "attempt_id": attempt_id})
    assert response.status_code == 200
    frames = _frames(response.get_data(as_text=True))
    assert [event for event, _ in frames] == ["runtime_event", "runtime_event", "done"]
    runtime = [value for event, value in frames if event == "runtime_event"]
    assert [value["type"] for value in runtime] == ["session.started", "run.failed"]
    failure, done = runtime[1], frames[-1][1]
    assert failure["session_id"] == session_id and failure["run_id"] == attempt_id
    assert done["execution_id"] == session_id and done["attempt_id"] == attempt_id
    assert set(done["error"]) == {"code", "message"}
    assert done["error"]["code"] == RECOVERY_CODE
    assert done["error"] == failure["payload"]["error"]
    assert "cancel" in done["error"]["message"].lower()
    assert done["cancelled"] is False
    assert done["diagnostics"].get("dropped_event_count", 0) == 0
    _assert_settled_without_execution(session_id, attempt_id, sdk_calls, closed)
