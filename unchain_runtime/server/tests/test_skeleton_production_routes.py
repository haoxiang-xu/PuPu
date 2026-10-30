"""Authenticated Flask boundaries over actual persisted Skeleton chat executions."""
from copy import deepcopy
import json
from types import SimpleNamespace

import pytest

import app
from skeleton_production_state import load_launch
from skeleton_production_interactions import resolve_pending_skeleton_interaction
from skeleton_resource_store import SkeletonResourceStore
from test_chat_stream_v4 import _parse_sse_blocks
from test_skeleton_production_chat import production, _approval_fixture
from test_skeleton_resource_store import agent


@pytest.fixture
def authenticated_client(monkeypatch):
    monkeypatch.setenv("UNCHAIN_AUTH_TOKEN", "skeleton-route-auth")
    return app.create_app().test_client(), {"x-unchain-auth": "skeleton-route-auth"}


def _body(options, session, attempt, **extra):
    return {"message": "public Skeleton input", "threadId": session, "attempt_id": attempt,
        "options": deepcopy(options), "memory_v2_requested": True,
        "owner_chat_id": "production-chat", "trace_level": "full", **extra}


def _stream(client, headers, body):
    response = client.post("/chat/stream/v4", headers=headers, json=body)
    assert response.status_code == 200, response.get_data(as_text=True)
    wire = response.get_data(as_text=True)
    frames = _parse_sse_blocks(wire)
    assert not [data for kind, data in frames if kind == "error"], frames
    assert frames[-1][0] == "done", frames
    assert "production-test-secret" not in wire
    events = [data for kind, data in frames if kind == "runtime_event"]
    failures = [event for event in events if event["type"] == "run.failed"]
    assert not failures, json.dumps(failures)
    return events


def _finals(events):
    return [event["payload"]["final_text"] for event in events
        if event["type"] == "step.completed" and "final_text" in event["payload"]]


def _pending(client, headers, session):
    response = client.get("/chat/interactions/pending", query_string={"session_id": session}, headers=headers)
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def _confirm(client, headers, session, interaction, approved=True):
    return client.post("/chat/tool/confirmation", headers=headers,
        json={"session_id": session, "confirmation_id": interaction, "approved": approved})


def _assert_native_wire(calls):
    for call in calls:
        assert set(call["wire"]) in ({"input", "model", "stream", "tools", "max_output_tokens"},
                                    {"input", "model", "stream", "max_output_tokens"})
        assert call["client"]["api_key"] == "production-test-secret"
        assert call["client"]["base_url"] == "https://example.test/v1"
        assert call["client"]["max_retries"] == 0


def test_authenticated_v4_end_is_the_only_committed_root_reply(production, authenticated_client):
    _store, options, calls = production
    client, headers = authenticated_client
    body = _body(options, "route-end-session", "route-end-root")
    assert client.post("/chat/stream/v4", json=body).status_code == 401
    assert calls == []
    events = _stream(client, headers, body)
    assert _finals(events) == ["End production reply"]
    assert len(calls) == 1
    launch = load_launch("route-end-session", "route-end-root", expected_owner_chat_id="production-chat")
    assert launch.store.load().state["status"] == "completed"
    assert launch.store.load().state["root_committed"] is True
    assert "production-test-secret" not in json.dumps(launch.descriptor)
    _assert_native_wire(calls)


def test_authenticated_two_approvals_preserve_identity_and_cold_resume(production, authenticated_client, monkeypatch, tmp_path):
    options, effects, calls = _approval_fixture(production, monkeypatch)
    client, headers = authenticated_client
    session, source = "route-approval-session", "route-approval-root"
    events = _stream(client, headers, _body(options, session, source))
    assert _finals(events) == []
    assert effects == [] and len(calls) == 1
    monkeypatch.setattr(SkeletonResourceStore, "get_resource",
        lambda *_args, **_kwargs: pytest.fail("cold public resume read a mutable resource"))
    original_ids = []
    for index in range(2):
        pending = _pending(client, headers, session)
        actual = resolve_pending_skeleton_interaction(session)
        requested = [event for event in events if event["type"] == "interaction.requested"]
        assert len(requested) == 1
        assert requested[0]["payload"]["request"] == actual.request.to_dict()
        assert requested[0]["links"]["interaction_id"] == actual.request.interaction_id
        assert pending["interaction_id"] == actual.request.interaction_id
        assert pending["source_run_id"] == source
        assert pending["interaction_source_run_id"] == actual.request.source_run_id
        assert pending["interaction_session_id"] == actual.request.session_id
        assert pending["presentation"]["trace_frame"]["run_id"] == actual.request.source_run_id
        original_ids.append(pending["interaction_id"])
        (tmp_path / f"public-pending-{index}.json").write_text(json.dumps(pending, indent=2) + "\n")
        assert client.get("/chat/interactions/pending", query_string={"session_id": session}).status_code == 401
        assert _confirm(client, {}, session, pending["interaction_id"]).status_code == 401
        receipt = _confirm(client, headers, session, pending["interaction_id"])
        assert receipt.status_code == 200, receipt.get_json()
        assert receipt.get_json()["durable"] is True
        assert receipt.get_json()["disposition"] == "receipt_recorded"
        repeat = _confirm(client, headers, session, pending["interaction_id"])
        assert repeat.status_code == 200 and repeat.get_json()["receipt_id"] == receipt.get_json()["receipt_id"]
        conflict = _confirm(client, headers, session, pending["interaction_id"], False)
        assert conflict.status_code == 409, conflict.get_json()
        assert effects == [f"effect-{i}" for i in range(index)]
        launch = load_launch(session, source)
        assert launch.store.load().state["root_committed"] is False
        events = _stream(client, headers, _body(options, session, f"route-resume-{index}",
            mode="resume_interaction", interaction_id=pending["interaction_id"], source_attempt_id=source))
        assert effects == [f"effect-{i}" for i in range(index + 1)], events
        assert len(calls) == index + 2
        assert _finals(events) == ([] if index == 0 else ["Approved End"])
    assert len(set(original_ids)) == 2
    assert _pending(client, headers, session) == {"status": "none", "session_id": session}
    assert load_launch(session, source).store.load().state["root_committed"] is True
    _assert_native_wire(calls)


def test_authenticated_cancel_prevents_late_approval_and_releases_guard(production, authenticated_client, monkeypatch):
    from session_execution_guard import snapshot_session_guard
    options, effects, calls = _approval_fixture(production, monkeypatch, count=1)
    client, headers = authenticated_client
    session, source = "route-cancel-session", "route-cancel-root"
    events = _stream(client, headers, _body(options, session, source))
    assert _finals(events) == []
    pending = _pending(client, headers, session)
    body = {"execution_id": session, "attempt_id": source, "source_attempt_id": source,
        "interaction_id": pending["interaction_id"], "owner_chat_id": "production-chat"}
    assert client.post("/chat/executions/cancel", json=body).status_code == 401
    foreign = client.post("/chat/executions/cancel", headers=headers, json={**body, "owner_chat_id": "foreign-chat"})
    assert foreign.status_code == 409, foreign.get_json()
    cancelled = client.post("/chat/executions/cancel", headers=headers, json=body)
    assert cancelled.status_code == 200, cancelled.get_json()
    assert cancelled.get_json()["state"] == "cancelled"
    assert effects == [] and len(calls) == 1
    _assert_native_wire(calls)
    assert snapshot_session_guard(session_id=session) is None
    assert load_launch(session, source).store.load().state["status"] == "cancelled"
    late = _confirm(client, headers, session, pending["interaction_id"])
    assert late.status_code == 409, late.get_json()
    assert effects == [] and len(calls) == 1


def test_public_child_request_keeps_original_session_and_source(production, authenticated_client, monkeypatch, tmp_path):
    from test_skeleton_production_bindings import _pool
    from test_skeleton_agent_runtime import _OpenAIStream, _handoff_response, _approval_tool_response, _final_response
    from unchain.tools import Toolkit
    import openai
    import unchain_adapter as adapter

    store, options, calls = production
    child = _pool(agent("production-child"))
    document = agent("production-agent", child_source={"kind": "embedded", "document": child})
    previous = store.get_resource("production-agent")
    store.save_draft(document, expected_edit_token=previous["edit_token"])
    effects = []
    toolkit = Toolkit()
    @toolkit.tool(name="dangerous_tool", requires_confirmation=True)
    def dangerous_tool(value: str) -> str:
        effects.append(value)
        return value
    adapter._set_runtime_toolkit_metadata(toolkit, toolkit_id="core", toolkit_name="Core")
    monkeypatch.setattr(adapter, "_build_selected_toolkits", lambda *_args, **_kwargs: [toolkit])
    responses = [_handoff_response(), _approval_tool_response(), _final_response("Child approved End")]
    def factory(**kwargs):
        def create(**wire):
            assert set(wire) in ({"input", "model", "stream", "tools", "max_output_tokens"},
                                {"input", "model", "stream", "max_output_tokens"})
            calls.append({"client": deepcopy(kwargs), "wire": deepcopy(wire)})
            assert responses, "unexpected model replay"
            return _OpenAIStream(responses.pop(0))
        return SimpleNamespace(responses=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, "OpenAI", factory)
    client, headers = authenticated_client
    session, source = "route-child-session", "route-child-root"
    events = _stream(client, headers, _body(options, session, source))
    assert _finals(events) == []
    actual = resolve_pending_skeleton_interaction(session)
    assert actual is not None
    assert len(actual.chain) == 2
    assert actual.request.session_id != session
    assert actual.request.source_run_id != source
    requested = [event for event in events if event["type"] == "interaction.requested"]
    assert len(requested) == 1
    assert requested[0]["payload"]["request"] == actual.request.to_dict()
    pending = _pending(client, headers, session)
    assert pending["source_run_id"] == source
    assert pending["interaction_source_run_id"] == actual.request.source_run_id
    assert pending["interaction_session_id"] == actual.request.session_id
    assert pending["presentation"]["trace_frame"]["run_id"] == actual.request.source_run_id
    (tmp_path / "public-child-pending.json").write_text(json.dumps(pending, indent=2) + "\n")
    assert effects == [] and len(calls) == 2
    receipt = _confirm(client, headers, session, pending["interaction_id"])
    assert receipt.status_code == 200, receipt.get_json()
    recorded = _pending(client, headers, session)
    assert recorded["status"] == "receipt_recorded"
    assert recorded["interaction_source_run_id"] == actual.request.source_run_id
    assert recorded["interaction_session_id"] == actual.request.session_id
    (tmp_path / "public-child-receipt-pending.json").write_text(json.dumps(recorded, indent=2) + "\n")
    assert effects == [] and len(calls) == 2
    monkeypatch.setattr(SkeletonResourceStore, "get_resource",
        lambda *_args, **_kwargs: pytest.fail("cold child resume read a mutable resource"))
    resumed = _stream(client, headers, _body(options, session, "route-child-resume",
        mode="resume_interaction", interaction_id=pending["interaction_id"], source_attempt_id=source))
    assert effects == ["approved child value"]
    assert len(calls) == 3
    assert len(_finals(resumed)) == 1
    assert json.loads(_finals(resumed)[0]) == {"answer": "Child approved End"}
    assert load_launch(session, source).store.load().state["root_committed"] is True
    assert _pending(client, headers, session) == {"status": "none", "session_id": session}
    _assert_native_wire(calls)
