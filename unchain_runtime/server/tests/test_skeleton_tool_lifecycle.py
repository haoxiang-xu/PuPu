"""Typed deterministic-step failures, deadline settlement, and no-repeat recovery.

Real production host/store/runner and real Core tools in pytest's temporary
workspace. Only the provider SDK factory is offline. No test drives the desktop.
"""
from copy import deepcopy
from pathlib import Path

import pytest
import socket

import durable_interaction_host as interactions
import unchain_adapter as adapter
from skeleton_production_state import load_launch
from test_skeleton_production_chat import production  # noqa: F401
from test_skeleton_resource_store import agent


@pytest.fixture(autouse=True)
def offline_sockets(monkeypatch):
    def deny(*_args, **_kwargs):
        raise AssertionError("No network in offline lifecycle tests")
    monkeypatch.setattr(socket.socket, "connect", deny)
    monkeypatch.setattr(socket.socket, "connect_ex", deny)
    monkeypatch.setattr(socket, "create_connection", deny)


def _step(production, tmp_path, *, name="read", on_error="stop", timeout=60000, skill=None):
    store, options, calls = production
    d = agent("production-agent")
    if skill is None:
        arguments = {"path": str(tmp_path / ("written-once.txt" if name == "write" else "not-here.txt"))}
        if name == "write":
            arguments["content"] = "one offline effect"
        step = {"id": "step", "type": "tool_call", "config": {
            "tool": {"name": name, "on_error": on_error, "approval_timeout_ms": timeout},
            "execution": {"inputs": [{"name": key, "value": {"kind": "literal", "value": value}, "missing": "error"}
                                     for key, value in arguments.items()], "outputs": []}}}
    else:
        step = {"id": "step", "type": "skill_read", "config": {
            "skill": skill, "execution": {"inputs": [], "outputs": []}}}
    target = d["nodes"][1]["id"]
    d["nodes"].insert(1, step)
    d["edges"][0]["target_node_id"] = "step"
    d["edges"].append({"id": "after-step", "kind": "flow", "source_node_id": "step", "source_port_id": "out",
                        "target_node_id": target, "target_port_id": "in"})
    current = store.get_resource(d["id"])
    store.save_draft(d, expected_edit_token=current["edit_token"])
    options = deepcopy(options)
    options["toolkits"] = ["CoreToolkit"]
    return options, calls


def _start(options, *, session="step-session", attempt="step-root"):
    return list(adapter.stream_chat_events(message="offline deterministic step", history=[], options=options,
                                           session_id=session, attempt_id=attempt))


def test_tool_failure_exposes_its_persisted_code_and_path(production, tmp_path):
    options, calls = _step(production, tmp_path)
    with pytest.raises(interactions.DurableInteractionHostError) as caught:
        _start(options)
    state = load_launch("step-session", "step-root").store.load().state
    assert state["status"] == "failed" and state["error"]["code"] == "tool_failed"
    assert caught.value.code == state["error"]["code"]
    assert list(caught.value.path) == state["error"]["path"]
    assert calls == []


def test_skill_failure_exposes_its_persisted_code(production, tmp_path):
    options, calls = _step(production, tmp_path, skill={
        "source": "user-agents", "source_id": str(tmp_path / "missing/SKILL.md"), "name": "missing"})
    with pytest.raises(interactions.DurableInteractionHostError) as caught:
        _start(options)
    state = load_launch("step-session", "step-root").store.load().state
    assert state["status"] == "failed" and state["error"]["code"] == "identity_mismatch"
    assert caught.value.code == state["error"]["code"]
    assert list(caught.value.path) == state["error"]["path"]
    assert calls == []


def test_deterministic_approval_names_the_resolved_toolkit_and_tool(production, tmp_path):
    options, calls = _step(production, tmp_path, name="write")
    _start(options)
    pending = interactions.get_pending_interaction("step-session")
    assert pending["status"] == "awaiting_response" and calls == []
    from skeleton_production_interactions import resolve_pending_skeleton_interaction
    raw = pending["presentation"]["tool_call"]
    assert raw["toolkit_id"] == "core"
    assert raw["toolkit_name"] == "Core"
    assert raw["tool_display_name"] == "Write"
    assert not (tmp_path / "written-once.txt").exists()


def test_expired_approval_is_refused_and_persistently_settles_without_effect(production, monkeypatch, tmp_path):
    options, calls = _step(production, tmp_path, name="write", timeout=1000)
    _start(options)
    from skeleton_production_interactions import resolve_pending_skeleton_interaction
    pending = resolve_pending_skeleton_interaction("step-session")
    expires = pending.chain[-1].request_payload["expires_at_ms"]
    monkeypatch.setattr("time.time_ns", lambda: (expires + 1) * 1_000_000)
    monkeypatch.setattr("time.time", lambda: (expires + 1) / 1000)
    with pytest.raises(interactions.DurableInteractionHostError) as caught:
        interactions.record_interaction_receipt(session_id="step-session", interaction_id=pending.request.interaction_id, approved=True)
    assert caught.value.code == "interaction_expired"
    state = load_launch("step-session", "step-root").store.load().state
    assert state["status"] == "failed" and state["error"]["code"] == "interaction_expired"
    assert interactions.get_pending_interaction("step-session")["status"] == "none"
    from session_execution_guard import snapshot_session_guard
    assert snapshot_session_guard(session_id="step-session") is None
    assert not (tmp_path / "written-once.txt").exists() and calls == []


def _freeze_after_deadline(monkeypatch, pending, *, offset=1):
    expires = pending.chain[-1].request_payload["expires_at_ms"]
    monkeypatch.setattr("time.time_ns", lambda: (expires + offset) * 1_000_000)
    monkeypatch.setattr("time.time", lambda: (expires + offset) / 1000)


@pytest.mark.parametrize("approved", [True, False])
def test_exact_deadline_still_accepts_and_resume_executes_only_if_approved(production, monkeypatch, tmp_path, approved):
    options, calls = _step(production, tmp_path, name="write", timeout=1000)
    _start(options)
    from skeleton_production_interactions import resolve_pending_skeleton_interaction
    pending = resolve_pending_skeleton_interaction("step-session")
    _freeze_after_deadline(monkeypatch, pending, offset=0)
    receipt = interactions.record_interaction_receipt(session_id="step-session", interaction_id=pending.request.interaction_id,
        approved=approved)
    assert receipt["disposition"] == "receipt_recorded"
    if approved:
        events = list(adapter.resume_chat_interaction_events(session_id="step-session", interaction_id=pending.request.interaction_id,
            options=options, attempt_id="step-resume", source_attempt_id="step-root"))
        assert len([event for event in events if event.get("type") == "final_message"]) == 1
        assert (tmp_path / "written-once.txt").read_text() == "one offline effect"
        assert len(calls) == 1
    else:
        with pytest.raises(interactions.DurableInteractionHostError) as denied:
            list(adapter.resume_chat_interaction_events(session_id="step-session", interaction_id=pending.request.interaction_id,
                options=options, attempt_id="step-resume", source_attempt_id="step-root"))
        assert denied.value.code == "tool_failed"
        assert not (tmp_path / "written-once.txt").exists() and calls == []


def test_late_resume_preserves_earlier_decision_but_never_executes(production, monkeypatch, tmp_path):
    options, calls = _step(production, tmp_path, name="write")
    _start(options)
    from skeleton_production_interactions import resolve_pending_skeleton_interaction, _accepted
    pending = resolve_pending_skeleton_interaction("step-session")
    interactions.record_interaction_receipt(session_id="step-session", interaction_id=pending.request.interaction_id, approved=True)
    _freeze_after_deadline(monkeypatch, pending)
    with pytest.raises(interactions.DurableInteractionHostError) as expired:
        list(adapter.resume_chat_interaction_events(session_id="step-session", interaction_id=pending.request.interaction_id,
            options=options, attempt_id="step-resume", source_attempt_id="step-root"))
    # Generic resume first polls pending; that read terminally expires it, so
    # its existing no-pending branch refuses the old id as not found.
    assert expired.value.code == "interaction_not_found"
    from skeleton_production_chat import resume_skeleton_chat_events
    with pytest.raises(interactions.DurableInteractionHostError) as native:
        list(resume_skeleton_chat_events(session_id="step-session", interaction_id=pending.request.interaction_id,
            options=options, attempt_id="step-native-resume", source_attempt_id="step-root"))
    assert native.value.code == "interaction_expired"
    assert _accepted(pending, normalize=False).response["approved"] is True
    assert len([event for event in pending.launch.journal.capture_snapshot().events
        if event.event_type == "interaction.resolved"]) == 1
    assert interactions.get_pending_interaction("step-session")["status"] == "none"
    assert calls == [] and not (tmp_path / "written-once.txt").exists()


def test_wrong_id_cannot_settle_an_expired_wait_and_reads_finish_it_once(production, monkeypatch, tmp_path):
    options, calls = _step(production, tmp_path, name="write", timeout=1000)
    _start(options)
    from skeleton_production_interactions import resolve_pending_skeleton_interaction
    pending = resolve_pending_skeleton_interaction("step-session")
    _freeze_after_deadline(monkeypatch, pending)
    with pytest.raises(interactions.DurableInteractionHostError) as wrong:
        interactions.record_interaction_receipt(session_id="step-session", interaction_id="foreign", approved=True)
    assert wrong.value.code == "interaction_not_found"
    assert pending.launch.store.load().state["status"] == "waiting"
    assert interactions.get_pending_interaction("step-session")["status"] == "none"
    final = pending.launch.store.load()
    event_count = len(pending.launch.journal.capture_snapshot().events)
    assert final.state["status"] == "failed"
    for _ in range(2):
        assert interactions.get_pending_interaction("step-session")["status"] == "none"
        with pytest.raises(interactions.DurableInteractionHostError) as expired:
            interactions.record_interaction_receipt(session_id="step-session", interaction_id=pending.request.interaction_id, approved=True)
        assert expired.value.code == "interaction_expired"
    assert pending.launch.store.load().revision == final.revision
    assert len(pending.launch.journal.capture_snapshot().events) == event_count
    assert calls == []


def test_terminal_expiry_retries_failed_semantic_write_then_allows_new_root(production, monkeypatch, tmp_path):
    options, calls = _step(production, tmp_path, name="write", timeout=1000)
    _start(options)
    import skeleton_production_interactions as api
    pending = api.resolve_pending_skeleton_interaction("step-session")
    _freeze_after_deadline(monkeypatch, pending)
    original = api.ContextInputIngress.persist
    def fail_write(*args, **kwargs):
        raise OSError("disposable semantic write fault")
    monkeypatch.setattr(api.ContextInputIngress, "persist", fail_write)
    with pytest.raises(interactions.DurableInteractionHostError):
        interactions.record_interaction_receipt(session_id="step-session", interaction_id=pending.request.interaction_id, approved=True)
    assert pending.launch.store.load().state["status"] == "failed"
    from session_execution_guard import snapshot_session_guard
    assert snapshot_session_guard(session_id="step-session").state == "parked"
    monkeypatch.setattr(api.ContextInputIngress, "persist", original)
    assert interactions.get_pending_interaction("step-session")["status"] == "none"
    assert api._accepted(pending, normalize=False).response == {"expired": True, "reason": "interaction_expired"}
    assert snapshot_session_guard(session_id="step-session") is None
    # No stale session hold or spurious Default run; a fresh explicit root
    # reaches its own new approval, not the expired interaction.
    _start(options, attempt="next-root")
    assert interactions.get_pending_interaction("step-session")["interaction_id"] != pending.request.interaction_id
    assert calls == [] and not (tmp_path / "written-once.txt").exists()


def test_tool_presentation_uses_immutable_snapshot_after_catalog_changes(production, monkeypatch, tmp_path):
    options, calls = _step(production, tmp_path, name="write")
    _start(options)
    import skeleton_production_interactions as api
    pending = api.resolve_pending_skeleton_interaction("step-session")
    original = interactions.get_pending_interaction("step-session")["presentation"]
    monkeypatch.setattr(adapter, "get_toolkit_catalog_v2", lambda: pytest.fail("mutable catalog read during cold presentation"))
    api.publish_skeleton_tool_presentation(pending, {"tool_name": "write", "tool_display_name": "Changed label",
        "toolkit_id": "core", "toolkit_name": "Changed owner"})
    current = interactions.get_pending_interaction("step-session")["presentation"]
    # Trace frame time is generated at read, while its facts are immutable.
    assert current["tool_call"] == original["tool_call"]
    assert current["trace_frame"]["payload"] == original["trace_frame"]["payload"]
    snapshots = [event for event in pending.launch.journal.capture_snapshot().events
        if event.event_type == "pupu.skeleton.tool_presentation"]
    assert len(snapshots) == 1 and calls == []


def test_real_failed_tool_reaches_v4_error_terminal_with_typed_identity(production, monkeypatch, tmp_path):
    options, calls = _step(production, tmp_path)
    import app
    import routes
    from test_skeleton_takeover_terminal import _frames
    def native_source(**request):
        request["options"] = options
        return adapter.stream_chat_events(**request)
    monkeypatch.setattr(routes, "stream_chat_events", native_source)
    response = app.create_app().test_client().post("/chat/stream/v4", json={
        "message": "offline failed tool", "threadId": "step-session", "attempt_id": "step-root"})
    assert response.status_code == 200
    frames = _frames(response.get_data(as_text=True))
    done = frames[-1][1]
    assert frames[-1][0] == "done" and done["error"]["code"] == "tool_failed"
    assert done["cancelled"] is False and calls == []
    assert "not-here.txt" not in done["error"]["message"]
    assert not [value for event, value in frames if event == "runtime_event" and value["type"] in {"final_message", "run.completed"}]


def test_deadline_crossed_during_receipt_commit_aborts_and_settles(production, monkeypatch, tmp_path):
    options, calls = _step(production, tmp_path, name="write", timeout=1000)
    _start(options)
    import skeleton_production_interactions as api
    pending = api.resolve_pending_skeleton_interaction("step-session")
    original = api.ContextInputIngress.persist
    fired = []
    def cross_deadline(ingress, item, *, precondition=None):
        if not fired:
            fired.append(True)
            _freeze_after_deadline(monkeypatch, pending)
        return original(ingress, item, precondition=precondition)
    monkeypatch.setattr(api.ContextInputIngress, "persist", cross_deadline)
    with pytest.raises(interactions.DurableInteractionHostError) as expired:
        interactions.record_interaction_receipt(session_id="step-session", interaction_id=pending.request.interaction_id, approved=True)
    assert expired.value.code == "interaction_expired"
    assert pending.launch.store.load().state["status"] == "failed"
    assert api._accepted(pending, normalize=False).response == {"expired": True, "reason": "interaction_expired"}
    assert interactions.get_pending_interaction("step-session")["status"] == "none"
    assert calls == [] and not (tmp_path / "written-once.txt").exists()


def test_presentation_snapshot_rejects_consistent_but_foreign_operation(production, tmp_path):
    options, _calls = _step(production, tmp_path, name="write")
    _start(options)
    import skeleton_production_interactions as api
    from dataclasses import replace
    from types import SimpleNamespace
    from unchain.journal import build_operation_ref
    from unchain.journal.models import _thaw_json
    pending = api.resolve_pending_skeleton_interaction("step-session")
    snapshot = pending.launch.journal.capture_snapshot()
    event = next(event for event in snapshot.events if event.event_type == "pupu.skeleton.tool_presentation")
    # A self-consistent operation hash alone does not bind this display record
    # to its own producer. Keep the payload/request/attempt otherwise exact.
    bad = replace(event, operation=build_operation_ref("foreign-presentation", domain="other.host.v1", payload=_thaw_json(event.payload)))
    journal = SimpleNamespace(capture_snapshot=lambda: SimpleNamespace(events=(bad,)))
    with pytest.raises(interactions.DurableInteractionHostError) as invalid:
        api._tool_presentation_metadata(pending, journal)
    assert invalid.value.code == "skeleton_tool_presentation_invalid"


def test_expiry_after_canonical_acceptance_cannot_break_guard_binding(production, monkeypatch, tmp_path):
    options, calls = _step(production, tmp_path, name="write")
    _start(options)
    import skeleton_production_interactions as api
    pending = api.resolve_pending_skeleton_interaction("step-session")
    original = api.ContextInputIngress.persist
    def expire_after_commit(ingress, item, *, precondition=None):
        result = original(ingress, item, precondition=precondition)
        _freeze_after_deadline(monkeypatch, pending)
        return result
    monkeypatch.setattr(api.ContextInputIngress, "persist", expire_after_commit)
    accepted = interactions.record_interaction_receipt(session_id="step-session", interaction_id=pending.request.interaction_id, approved=True)
    assert accepted["disposition"] == "receipt_recorded"
    from session_execution_guard import snapshot_session_guard
    assert snapshot_session_guard(session_id="step-session").receipt_id == accepted["receipt_id"]
    assert interactions.get_pending_interaction("step-session")["status"] == "none"
    assert api._accepted(pending, normalize=False).response["approved"] is True
    assert pending.launch.store.load().state["error"]["code"] == "interaction_expired"
    assert calls == [] and not (tmp_path / "written-once.txt").exists()


def test_expired_kernel_cleanup_requires_its_exact_applied_checkpoint(production, monkeypatch, tmp_path):
    options, _calls = _step(production, tmp_path, name="write")
    _start(options)
    import skeleton_production_interactions as api
    from dataclasses import replace
    from types import SimpleNamespace
    from unchain.interaction import InteractionNotPendingError
    pending = replace(api.resolve_pending_skeleton_interaction("step-session"), leaf_node_type="agent")
    class AlreadyClosed:
        def cancel_pending(self, *args, **kwargs):
            raise InteractionNotPendingError("no active checkpoint")
        def load(self, *args, **kwargs):
            return SimpleNamespace(request=pending.request, checkpoint_id="expected-checkpoint",
                application={"applied_checkpoint_id": "cancelled:some-other-checkpoint"}, receipt=None)
    monkeypatch.setattr(api, "_interaction_runtime", AlreadyClosed)
    with pytest.raises(interactions.DurableInteractionHostError) as invalid:
        api._close_expired_kernel_checkpoint(pending)
    assert invalid.value.code == "skeleton_interaction_lineage_mismatch"
