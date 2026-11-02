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
