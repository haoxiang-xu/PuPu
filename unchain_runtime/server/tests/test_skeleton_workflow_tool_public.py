"""Actual Store → public chat → pending/receipt/resume/cancel, offline SDK."""
from copy import deepcopy
import json
from types import SimpleNamespace

import pytest

import unchain_adapter as adapter
import durable_interaction_host as interactions
from skeleton_production_state import load_launch
from test_skeleton_production_chat import production  # real isolated host fixture
from test_skeleton_agent_runtime import _OpenAIStream
from test_skeleton_workflow_tools import entry, workflow
from test_skeleton_resource_store import agent, binding, output
from unchain.tools import Toolkit


def _public_fixture(production, monkeypatch):
    store, options, calls = production
    body = workflow()
    body["nodes"].insert(1, {"id": "write", "type": "tool_call", "config": {
        "execution": {"inputs": [binding("value", "start", ["value"])],
            "outputs": [output("value", "result", ["result"])]},
        "tool": {"name": "dangerous_tool", "on_error": "continue", "approval_timeout_ms": 60000},
    }})
    body["nodes"][-1]["config"]["execution"]["inputs"][0]["value"]["node_id"] = "write"
    body["edges"] = [
        {"id": "s-w", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "write", "target_port_id": "in"},
        {"id": "w-e", "kind": "flow", "source_node_id": "write", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"},
    ]
    body["nodes"][-1]["config"]["execution"]["inputs"].append({
        "name": "receipt", "value": {"kind": "literal", "value": "public-workflow-End-output"}, "missing": "error"})
    body["nodes"][-1]["config"]["execution"]["outputs"].append(
        output("receipt", "input", ["receipt"]))
    saved = store.save_draft(body)
    version = store.publish_workflow("echo", expected_edit_token=saved["edit_token"])
    row = entry(); row["workflow"]["revision_id"] = version["revision_id"]
    parent = agent("production-agent")
    parent["nodes"].append({"id": "pool", "type": "toolkit_pool", "config": {
        "toolkits": [{"id": "CoreToolkit", "enabled_tools": ["dangerous_tool"]}],
        "merge_with_user_selected": False, "workflow_tools": [row],
    }})
    parent["edges"].append({"id": "a-p", "kind": "attach", "source_node_id": "kernel",
        "source_port_id": "attach_bot", "target_node_id": "pool", "target_port_id": "attach_top"})
    original = store.get_resource("production-agent")
    store.save_draft(parent, expected_edit_token=original["edit_token"])
    effects = []
    toolkit = Toolkit()
    @toolkit.tool(name="dangerous_tool", requires_confirmation=True)
    def dangerous_tool(value: str):
        effects.append(value)
        return {"value": value}
    adapter._set_runtime_toolkit_metadata(toolkit, toolkit_id="core", toolkit_name="Core")
    monkeypatch.setattr(adapter, "_build_selected_toolkits", lambda *args, **kwargs: [toolkit])
    replies = [SimpleNamespace(id="wf-call", output=[{"type": "function_call", "call_id": "wf-call",
        "name": "workflow_echo", "arguments": '{"inputs":{"value":"only-once"}}'}],
        usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7}),
        SimpleNamespace(id="wf-final", output=[{"type": "message", "role": "assistant",
            "content": [{"type": "output_text", "text": "Workflow tool parent End"}]}],
            usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7})]
    import openai
    def factory(**kwargs):
        def create(**wire):
            calls.append({"client": deepcopy(kwargs), "wire": deepcopy(wire)})
            assert replies, "provider work must not repeat"
            return _OpenAIStream(replies.pop(0))
        return SimpleNamespace(responses=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, "OpenAI", factory)
    return store, options, calls, effects, version


@pytest.mark.parametrize("finish", ["approve", "deny", "cancel"])
def test_real_public_workflow_tool_wait_is_locatable_and_settled_once(production, monkeypatch, finish):
    store, options, calls, effects, version = _public_fixture(production, monkeypatch)
    events = list(adapter.stream_chat_events(message="invoke the selected Workflow", history=[], options=options,
        session_id="workflow-tool-public", attempt_id="workflow-tool-root"))
    assert len(calls) == 1
    assert "workflow_echo" in [tool["name"] for tool in calls[0]["wire"]["tools"]]
    assert not any(event.get("type") == "final_message" for event in events)
    assert effects == []
    pending = interactions.get_pending_interaction("workflow-tool-public")
    assert pending["status"] == "awaiting_response"
    assert pending["source_run_id"] == "workflow-tool-root"
    launch = load_launch("workflow-tool-public", "workflow-tool-root")
    assert launch.selection.to_dict()["dependencies"][0]["revision_id"] == version["revision_id"]
    assert len(launch.workflows.to_dict()["workflows"]) == 1
    # Resume is reconstructed from launch snapshots, not mutable Store rows.
    monkeypatch.setattr(type(store), "get_resource", lambda *_args, **_kwargs: pytest.fail("live lookup during recovery"))
    if finish == "cancel":
        cancelled = interactions.cancel_chat_execution(session_id="workflow-tool-public",
            attempt_id="workflow-tool-root", expected_interaction_id=pending["interaction_id"],
            owner_chat_id="production-chat", reason="user_stop")
        assert cancelled["state"] == "cancelled"
        assert effects == [] and len(calls) == 1
        assert interactions.get_pending_interaction("workflow-tool-public")["status"] == "none"
        return
    first = interactions.record_interaction_receipt(session_id="workflow-tool-public",
        interaction_id=pending["interaction_id"], approved=finish == "approve")
    again = interactions.record_interaction_receipt(session_id="workflow-tool-public",
        interaction_id=pending["interaction_id"], approved=finish == "approve")
    assert first["receipt_id"] == again["receipt_id"]
    result = list(adapter.resume_chat_interaction_events(session_id="workflow-tool-public",
        interaction_id=pending["interaction_id"], options=options,
        attempt_id="workflow-tool-resume", source_attempt_id="workflow-tool-root"))
    roots = [event for event in result if event.get("type") == "final_message"]
    assert len(roots) == 1 and roots[0]["content"] == "Workflow tool parent End"
    assert effects == (["only-once"] if finish == "approve" else [])
    assert len(calls) == 2
    assert interactions.get_pending_interaction("workflow-tool-public")["status"] == "none"
    assert ("denied" in json.dumps(calls[-1]["wire"])) == (finish == "deny")
    assert "public-workflow-End-output" not in json.dumps(calls[0]["wire"])
    assert "public-workflow-End-output" in json.dumps(calls[-1]["wire"])
