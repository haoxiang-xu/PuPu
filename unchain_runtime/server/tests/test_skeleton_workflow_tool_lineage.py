"""Production wait producer consumed by the independent pending-lineage reader."""
from copy import deepcopy
from types import SimpleNamespace

import pytest

from durable_interaction_host import DurableInteractionHostError
from skeleton_production_interactions import SkeletonGraphWait, _workflow_tool_child
from test_skeleton_workflow_tool_execution import _fixture
from unchain.execution import ExecutionRuntime
from unchain.skeleton.workflow_runtime import PublishedWorkflow


def test_actual_wait_crosses_strict_lineage_reader_and_forged_identities_do_not(tmp_path, monkeypatch):
    bridge, client, sessions, effects, build = _fixture(tmp_path, monkeypatch, approval=True)
    with ExecutionRuntime(sessions).scope(bridge.execution_id) as guard:
        execution = build(guard)
        execution.create({})
        result, _receipt = execution.run()
    assert result.status == "waiting", result.error
    record = execution.store.load()
    active = record.state["active"]
    raw = execution.store.read_json(active["wait"]["request_ref"])
    fixed = execution._workflow_tools_for_node(SimpleNamespace(node_id="model"))[0]
    def resolve(wid, rev):
        assert (wid, rev) == (fixed.workflow_id, fixed.revision_id)
        return PublishedWorkflow(wid, rev, fixed.plan.snapshot())
    launch = SimpleNamespace(workflows=SimpleNamespace(resolve=resolve))
    anchor = SkeletonGraphWait(execution.store, record, raw)
    child, children, session = _workflow_tool_child(anchor, launch)
    assert children == [] and session == raw["child_guard_session_id"]
    assert child.store.plan == fixed.plan and child.record.state["status"] == "waiting"
    child_before = deepcopy(child.record.state)
    parent_before = deepcopy(record.state)
    alterations = {
        "unknown_field": lambda value: value.update(extra=True),
        "wrong_mode": lambda value: value.update(mode="delegate"),
        "wrong_version": lambda value: value.update(schema="pupu.skeleton_subagent_wait.v1"),
        "wrong_entry": lambda value: value.update(entry_id="other"),
        "wrong_call": lambda value: value["parent_tool_call"].update(call_id="another-call"),
        "wrong_tool": lambda value: value["parent_tool_call"].update(tool_name="dangerous_tool"),
        "wrong_attempt": lambda value: value.update(child_attempt_id="other"),
        "wrong_graph": lambda value: value.update(child_graph_id="other"),
        "wrong_session": lambda value: value.update(child_guard_session_id="other"),
        "wrong_digest": lambda value: value.update(definition_digest="0" * 64),
        "wrong_parent": lambda value: value.update(parent_graph_id="other"),
        "wrong_kernel": lambda value: value.update(parent_kernel_node_id="other"),
        "wrong_invocation": lambda value: value.update(child_node_invocation_id="other"),
        "wrong_wait": lambda value: value.update(child_wait_id="other"),
    }
    for label, mutate in alterations.items():
        forged = deepcopy(raw); mutate(forged)
        with pytest.raises(DurableInteractionHostError) as caught:
            _workflow_tool_child(SkeletonGraphWait(execution.store, record, forged), launch)
        assert caught.value.code == "skeleton_interaction_lineage_mismatch", label
        assert execution.store.load().state == parent_before, label
        assert child.store.load().state == child_before, label
    assert effects == [] and len(client.requests) == 1


def test_workflow_tool_cancel_uses_its_own_call_bound_receipt_without_executing_child(tmp_path, monkeypatch):
    import time
    from test_skeleton_production_interactions import _api, _install_actual_launch
    from skeleton_cancelled_subagents import settle_cancelled_subagents
    from unchain.events.subagent_settlement import validate_subagent_settlement_projection
    api = _api()
    bridge, client, sessions, effects, build = _fixture(tmp_path, monkeypatch, approval=True,
        clock=lambda: int(time.time() * 1000))
    with ExecutionRuntime(sessions).scope(bridge.execution_id) as guard:
        execution = build(guard)
        execution.create({})
        waiting, _receipt = execution.run()
    assert waiting.status == "waiting" and effects == []
    fixed = execution._workflow_tools_for_node(SimpleNamespace(node_id="model"))[0]
    def resolve(wid, rev):
        assert (wid, rev) == (fixed.workflow_id, fixed.revision_id)
        return PublishedWorkflow(wid, rev, fixed.plan.snapshot())
    launch = _install_actual_launch(api, monkeypatch, execution, bridge, resolver=resolve)
    pending = api.resolve_pending_skeleton_interaction(bridge.execution_id)
    response = api.cancel_skeleton_execution(session_id=bridge.execution_id,
        attempt_id=launch.descriptor["root_run_id"], expected_interaction_id=pending.request.interaction_id)
    assert response["state"] == "cancelled"
    assert len(response["subagent_settlements"]) == 1
    projection = validate_subagent_settlement_projection(response["subagent_settlements"][0], execution_id=bridge.execution_id)
    assert projection["tool_name"] == "workflow_echo" and projection["call_id"] == "workflow-call-1"
    assert projection["status"] == "cancelled"
    assert projection["source_attempt"] == pending.chain[1].store.attempt.to_dict()
    assert effects == [] and len(client.requests) == 1
    frozen = api._pending_for_launch(launch, allow_cancelled=True)
    count = len(launch.journal.capture_snapshot().events)
    assert settle_cancelled_subagents(frozen) == response["subagent_settlements"]
    assert len(launch.journal.capture_snapshot().events) == count
    assert effects == [] and len(client.requests) == 1


def test_cancelled_workflow_graph_has_call_receipt_without_invented_agent_spawn(tmp_path, monkeypatch):
    """Graph-layer producer test, not a public cancel/session-lease test.

    These are the same official graph cancellations used by the public Host.
    No process-identity guard is mocked or relaxed; the public cell is separate.
    """
    from test_skeleton_production_interactions import _api, _install_actual_launch
    from skeleton_cancelled_subagents import settle_cancelled_subagents
    from unchain.skeleton import DurableWorkflowRunner
    api = _api()
    bridge, client, sessions, effects, build = _fixture(tmp_path, monkeypatch, approval=True)
    with ExecutionRuntime(sessions).scope(bridge.execution_id) as guard:
        execution = build(guard)
        execution.create({})
        result, _receipt = execution.run()
    assert result.status == "waiting" and effects == []
    fixed = execution._workflow_tools_for_node(SimpleNamespace(node_id="model"))[0]
    launch = _install_actual_launch(api, monkeypatch, execution, bridge,
        resolver=lambda wid, rev: PublishedWorkflow(wid, rev, fixed.plan.snapshot()))
    pending = api._pending_for_launch(launch, allow_expired=True)
    for anchor in pending.chain:
        DurableWorkflowRunner(anchor.store, {}).cancel()
    frozen = api._pending_for_launch(launch, allow_cancelled=True, allow_expired=True)
    before = launch.journal.capture_snapshot().events
    assert not any(event.event_type == "subagent_spawned" for event in before)
    projections = settle_cancelled_subagents(frozen)
    assert len(projections) == 1
    assert projections[0]["status"] == "cancelled"
    assert projections[0]["call_id"] == "workflow-call-1" and projections[0]["tool_name"] == "workflow_echo"
    assert projections[0]["source_attempt"] == frozen.chain[1].store.attempt.to_dict()
    count = len(launch.journal.capture_snapshot().events)
    assert settle_cancelled_subagents(frozen) == projections
    assert len(launch.journal.capture_snapshot().events) == count
    assert effects == [] and len(client.requests) == 1
    from dataclasses import replace
    for field in ("mode", "entry_id", "definition_digest", "child_attempt_id", "child_graph_id"):
        parent, child = frozen.chain
        forged = deepcopy(parent.request_payload)
        forged[field] = "foreign"
        with pytest.raises(ValueError):
            settle_cancelled_subagents(replace(frozen, chain=(replace(parent, request_payload=forged), child)))
        assert len(launch.journal.capture_snapshot().events) == count
    assert effects == [] and len(client.requests) == 1
