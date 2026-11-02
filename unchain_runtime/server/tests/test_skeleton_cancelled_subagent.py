"""BC-DC-001: cancelled child evidence comes from its own committed graph."""
from copy import deepcopy
from dataclasses import replace
import json
import os
from pathlib import Path

import pytest

from test_skeleton_production_interactions import _api, _install_actual_launch
from test_skeleton_agent_runtime import (
    _bridge, _parent_with_pool, _host_execution, _StrictOpenAIClient,
    _subagent_tool_response, _handoff_response, _approval_tool_response,
)
from unchain.execution import ExecutionRuntime
from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
from unchain.tools import Tool
from unchain.interaction.runtime import DurableInteractionRuntime
from unchain.events.subagent_settlement import validate_subagent_settlement_projection


@pytest.mark.parametrize("mode", ["delegate", "handoff"])
@pytest.mark.parametrize("approved", [False, True])
def test_cancelled_delegate_has_own_durable_settlement(tmp_path, monkeypatch, mode, approved):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path / "host-data"))
    api = _api()
    bridge = _bridge(tmp_path, monkeypatch, execution_id="cancelled-child")
    plan, manifests = _parent_with_pool()
    call = (_subagent_tool_response("delegate_to_subagent",
        '{"target":"Reviewer","task":"review"}', "delegate")
        if mode == "delegate" else _handoff_response())
    client = _StrictOpenAIClient([call, _approval_tool_response()])
    effects = []
    tool = Tool.from_callable(lambda value: effects.append(value) or value,
        name="dangerous_tool", requires_confirmation=True)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    memory = KernelMemoryRuntime.from_config(store=memory_store)
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(plan, bridge, client=client, guard=guard,
            memory=memory, tools_for_node=lambda _context: (tool,), subagent_manifests=manifests)
        execution.create({})
        waiting, _receipt = execution.run(original_task="cancel exact child")
    assert waiting.status == "waiting"
    launch = _install_actual_launch(api, monkeypatch, execution, bridge, manifests=manifests)
    pending = api.resolve_pending_skeleton_interaction(bridge.execution_id)
    assert len(pending.chain) == 2
    original_request = pending.request.to_dict()
    if approved:
        api.record_skeleton_interaction_receipt(session_id=bridge.execution_id,
            interaction_id=pending.request.interaction_id, approved=True)
    monkeypatch.setattr(api, "_interaction_runtime", lambda: DurableInteractionRuntime(memory))
    response = api.cancel_skeleton_execution(session_id=bridge.execution_id,
        attempt_id=launch.descriptor["root_run_id"], expected_interaction_id=pending.request.interaction_id)
    assert response["state"] == "cancelled"
    assert all(anchor.store.load().state["status"] == "cancelled" for anchor in pending.chain)
    projections = response["subagent_settlements"]
    assert len(projections) == 1
    projection = validate_subagent_settlement_projection(projections[0], execution_id=bridge.execution_id)
    parent, child = pending.chain
    assert projection["source_attempt"] == child.store.attempt.to_dict()
    assert projection["consumer_attempt"]["attempt_id"] == parent.record.state["active"]["node_attempt_id"]
    assert projection["call_id"] == call.output[0]["call_id"]
    assert projection["tool_name"] == call.output[0]["name"]
    assert projection["status"] == "cancelled"
    body = json.loads(projection["result"]["preview"])
    assert body["status"] == "cancelled" and body["outputs"] is None
    events = launch.journal.capture_snapshot().events
    receipts = [event for event in events if event.event_type == "skeleton.subagent_tool_settlement"]
    assert len(receipts) == 1
    assert projection["cursor"] == {"schema": "unchain.event_cursor.v1",
        "event_id": receipts[0].event_id, "store_seq": receipts[0].store_seq}
    assert not any(event.event_type == "message.user" for event in events
        if event.store_seq > child.store.load().store_seq)
    assert pending.request.to_dict() == original_request
    assert effects == [] and len(client.requests) == 2
    count = len(events)
    # Reconstruct the pending chain from the same durable cancelled graphs.
    # Repeat and cold lookup must replay the same receipt, never resume work.
    replay = api.cancel_skeleton_execution(session_id=bridge.execution_id,
        attempt_id=launch.descriptor["root_run_id"], expected_interaction_id=pending.request.interaction_id)
    assert replay["subagent_settlements"] == projections
    assert len(launch.journal.capture_snapshot().events) == count
    assert effects == [] and len(client.requests) == 2
    assert api.get_pending_skeleton_interaction(bridge.execution_id) is None
    from skeleton_cancelled_subagents import settle_cancelled_subagents
    frozen = api._pending_for_launch(launch, allow_cancelled=True)
    parent, child = frozen.chain
    # These are caller-supplied assertions, not authority. The immutable wait
    # artifact and exact cancelled records must still prove every field.
    for key in ("call_id", "tool_name", "child_attempt_id", "child_graph_id",
                "parent_graph_id", "parent_node_invocation_id", "entry_id", "definition_digest"):
        request = deepcopy(parent.request_payload)
        target = request["parent_tool_call"] if key in ("call_id", "tool_name") else request
        target[key] = "foreign"
        changed = replace(parent, request_payload=request)
        with pytest.raises(ValueError):
            settle_cancelled_subagents(replace(frozen, chain=(changed, child)))
        assert len(launch.journal.capture_snapshot().events) == count
    assert settle_cancelled_subagents(replace(frozen, chain=(parent,))) == []
    assert effects == [] and len(client.requests) == 2
    capture = os.environ.get("CANCELLED_SUBAGENT_CAPTURE")
    if capture:
        with Path(capture).open("a") as stream:
            stream.write(json.dumps({"mode": mode, "approved": approved, "response": response,
                "source_graph": child.store.graph_id, "source_event_id": child.record.event_id,
                "source_revision": child.record.revision,
                "parent_wait": parent.request_payload,
                "consumer_node_attempt": parent.record.state["active"]["node_attempt_id"],
                "model_calls": len(client.requests), "tool_effects": effects}, sort_keys=True) + "\n")
