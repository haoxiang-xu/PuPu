"""Real Kernel → ordinary Tool → durable provider-free Workflow → parent End.

SDK networking alone is substituted. These process-local tests do not stand in
for the later fixed-binary HTTP and packaged App acceptance cells.
"""
from copy import deepcopy
from types import SimpleNamespace

import pytest

from skeleton_agent_runtime import PupuSkeletonAgentExecution
from skeleton_workflow_tools import resolve_workflow_tool
from test_skeleton_agent_runtime import (_bridge, _binding, _single_plan,
    _StrictOpenAIClient, _final_response)
from test_skeleton_workflow_tools import entry, workflow
from unchain.execution import ExecutionRuntime
from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
from unchain.skeleton.agent_preparation import prepare_agent_graph
from unchain.skeleton.tool_runtime import SkeletonToolRuntime
from unchain.skeleton.workflow_runtime import PublishedWorkflow
from unchain.tools import Toolkit, Tool


def _tool_turn():
    return SimpleNamespace(id="workflow-tool-turn", output=[{
        "type": "function_call", "call_id": "workflow-call-1", "name": "workflow_echo",
        "arguments": '{"inputs":{"value":"child-only-input"}}',
    }], usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7})


def _plan():
    document = _single_plan().snapshot()
    document["nodes"].append({"id": "pool", "type": "toolkit_pool", "config": {
        "toolkits": [], "merge_with_user_selected": False, "workflow_tools": [entry()],
    }})
    document["edges"].append({"id": "wf-attach", "kind": "attach", "source_node_id": "model",
        "source_port_id": "attach_bot", "target_node_id": "pool", "target_port_id": "attach_top"})
    return prepare_agent_graph(document)


def _fixture(tmp_path, monkeypatch, *, approval=False):
    bridge = _bridge(tmp_path, monkeypatch)
    body = workflow()
    writes = []
    toolkit = Toolkit({"write_probe": Tool.from_callable(
        lambda value: writes.append(value) or {"value": value}, name="write_probe",
        requires_confirmation=True)})
    if approval:
        body["nodes"].insert(1, {"id": "tool", "type": "tool_call", "config": {
            "tool": {"name": "write_probe", "on_error": "stop", "approval_timeout_ms": 30000},
            "execution": {"inputs": [{"name": "value", "value": {"kind": "ref", "node_id": "start", "path": ["value"]}, "missing": "error"}],
                "outputs": [{"name": "value", "source": {"kind": "result", "path": ["result", "value"]}}]},
        }})
        body["nodes"][-1]["config"]["execution"]["inputs"][0]["value"]["node_id"] = "tool"
        body["edges"] = [
            {"id": "s-t", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "tool", "target_port_id": "in"},
            {"id": "t-e", "kind": "flow", "source_node_id": "tool", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"},
        ]
    body["nodes"][-1]["config"]["execution"]["inputs"].append({
        "name": "receipt", "value": {"kind": "literal", "value": "committed-workflow-End-output"}, "missing": "error"})
    body["nodes"][-1]["config"]["execution"]["outputs"].append({
        "name": "receipt", "source": {"kind": "input", "path": ["receipt"]}})
    resolve = lambda wid, rev: PublishedWorkflow(wid, rev, deepcopy(body))
    selected = resolve_workflow_tool("pool", entry(), resolve)
    client = _StrictOpenAIClient([_tool_turn(), _final_response("parent finished")])
    sessions = JsonFileSessionStore(tmp_path / "sessions")
    memory = KernelMemoryRuntime.from_config(store=sessions)
    def execution(guard):
        return PupuSkeletonAgentExecution(_plan(), bridge, graph_id="workflow-parent",
            bind_profile=lambda config: _binding(config, client, []),
            durability_runtime=memory, execution_guard=guard,
            workflow_tools_for_node=lambda context: (selected,) if context.node_id == "model" else (),
            root_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, inputs: __import__("unchain.skeleton", fromlist=["WorkflowNodeCompleted"]).WorkflowNodeCompleted({
                    "message": "parent End", "evidence": inputs["model_answer"]})},
            child_handlers_factory=lambda _store, plan: {"tool_call": SkeletonToolRuntime(
                plan, toolkit, bridge.execution_id, lambda: 100)},
            hook_workflow_resolver=resolve)
    return bridge, client, sessions, writes, execution


def test_model_calls_fixed_workflow_and_parent_alone_commits_root(tmp_path, monkeypatch):
    bridge, client, sessions, writes, build = _fixture(tmp_path, monkeypatch)
    with ExecutionRuntime(sessions).scope(bridge.execution_id) as guard:
        execution = build(guard)
        execution.create({})
        result, receipt = execution.run(original_task="invoke an explicit Workflow")
    assert result.status == "completed", result.error
    assert result.root_committed is True and receipt is not None
    assert result.outputs["message"] == "parent End"
    assert len(client.requests) == 2 and writes == []
    assert any(tool["name"] == "workflow_echo" for tool in client.requests[0]["tools"])
    import json
    assert "child-only-input" in json.dumps(client.requests[1]["input"])
    assert "committed-workflow-End-output" not in json.dumps(client.requests[0])
    assert "committed-workflow-End-output" in json.dumps(client.requests[1]["input"])
    assert sum(event.event_type == "final_message" and event.attempt == execution.store.attempt
        for event in execution.store.journal.capture_snapshot().events) == 1


def test_approval_wait_survives_execution_reconstruction_without_child_redispatch(tmp_path, monkeypatch):
    bridge, client, sessions, writes, build = _fixture(tmp_path, monkeypatch, approval=True)
    with ExecutionRuntime(sessions).scope(bridge.execution_id) as guard:
        execution = build(guard)
        execution.create({})
        result, receipt = execution.run(original_task="run the Workflow with approval")
    assert result.status == "waiting", result.error
    assert receipt is None and writes == [] and len(client.requests) == 1
    active = execution.store.load().state["active"]
    wait = active["wait"]
    request = execution.store.read_json(wait["request_ref"])
    assert request["mode"] == "workflow_tool"
    assert request["parent_tool_call"] == {"call_id": "workflow-call-1", "tool_name": "workflow_echo"}
    with ExecutionRuntime(sessions).scope(bridge.execution_id) as guard:
        restored = build(guard)
        result, _receipt = restored.resume_subagent_interaction(wait["id"], True,
            node_invocation_id=active["node_invocation_id"], original_task="approve fixed child")
    assert result.status == "completed", result.error
    assert result.root_committed is True
    assert writes == ["child-only-input"] and len(client.requests) == 2
    import json
    assert "committed-workflow-End-output" not in json.dumps(client.requests[0])
    assert "committed-workflow-End-output" in json.dumps(client.requests[1]["input"])


def test_workflow_tool_module_respects_borrowed_subagent_tool_policy(tmp_path, monkeypatch):
    from unchain.agent.modules.base import BaseAgentModule
    bridge, _client, sessions, _writes, build = _fixture(tmp_path, monkeypatch)
    context = SimpleNamespace(document_id=_plan().document_id, node_id="model", node_attempt_id="node")
    sentinel = BaseAgentModule(name="existing-child-module")
    with ExecutionRuntime(sessions).scope(bridge.execution_id) as guard:
        execution = build(guard)
        for allowed, disabled, expected in [
            (None, (), 2), ((), (), 1), (("workflow_echo",), (), 2),
            (("other",), (), 1), (None, ("workflow_echo",), 1),
        ]:
            arguments = execution._kernel_handler_arguments(_plan(),
                modules_for_node=lambda _context: (sentinel,),
                workflow_policy=SimpleNamespace(allowed_tools=allowed, disabled_tools=disabled))
            modules = arguments["modules_for_node"](context)
            assert modules[0] is sentinel and len(modules) == expected
