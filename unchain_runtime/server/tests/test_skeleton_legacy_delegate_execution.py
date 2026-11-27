"""Execute a genuinely upgraded parent/child through the public delegate tool."""
from copy import deepcopy

from skeleton_chat_selection import prepare_skeleton_chat_selection
from skeleton_resource_store import SkeletonResourceStore
from test_skeleton_agent_runtime import (
    _bridge, _host_execution, _StrictOpenAIClient, _subagent_tool_response,
    _final_response,
)
from test_skeleton_legacy_upgrade_save import migrate, recipe, apply
from unchain.execution import ExecutionRuntime
from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
from unchain.skeleton.agent_preparation import prepare_agent_graph


def test_upgraded_child_receives_task_and_completes_before_parent(tmp_path, monkeypatch):
    resources = SkeletonResourceStore(tmp_path / "resources")
    child, choices = migrate(resources, recipe("Child"))
    child_saved, _ = apply(resources, child, choices)
    parent, choices = migrate(resources, recipe("Parent", subagent_pool=[
        {"kind": "recipe_ref", "recipe_name": "Child"},
    ]))
    parent_saved, _ = apply(resources, parent, choices)
    selected = prepare_skeleton_chat_selection({"skeleton_selection": {
        "schema": "pupu.skeleton_chat_selection.v1", "kind": "resource", "resource_id": parent["id"],
    }}, store=resources)
    selection = selected.to_dict()
    assert selection["document"] == parent_saved["document"]
    assert selection["subagents"][0]["document"] == child_saved["document"]
    frozen = deepcopy(selection)
    bridge = _bridge(tmp_path, monkeypatch, execution_id="upgraded-real-delegate", task="parent request")
    client = _StrictOpenAIClient([
        _subagent_tool_response("delegate_to_subagent", '{"target":"Child","task":"APP02_EXACT_TASK"}', "migration"),
        _final_response("CHILD_COMPLETED"), _final_response("PARENT_COMPLETED"),
    ])
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    children = []

    def remember_child(store, plan):
        children.append(store)
        return {}

    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(prepare_agent_graph(selection["document"]), bridge,
            client=client, guard=guard, memory=KernelMemoryRuntime.from_config(store=memory_store),
            subagent_manifests=selection["subagents"], child_handlers_factory=remember_child,
            other_handlers={})
        execution.create({"message": "parent request", "images": [], "files": []})
        result, receipt = execution.run(original_task="parent request")

    assert result.status == "completed" and receipt is not None
    assert len(client.requests) == 3, client.requests
    assert len(children) == 1 and children[0].load().state["status"] == "completed"
    assert "APP02_EXACT_TASK" in repr(client.requests[1]["input"])
    assert "CHILD_COMPLETED" in repr(client.requests[2]["input"])
    assert "PARENT_COMPLETED" in result.outputs["message"]
    assert selected.to_dict() == frozen
    assert resources.get_resource(child["id"])["document"] == child_saved["document"]
