"""Production host dispatch for the real durable Skeleton wait types."""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
from types import SimpleNamespace

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from test_skeleton_agent_runtime import (
    _StrictOpenAIClient, _binding, _bridge, _final_response, _handoff_response,
    _host_execution, _parent_with_pool,
)
from test_memory_v2_skeleton_root_completion import _agent_document
from test_skeleton_resource_store import binding, output
from unchain.execution import ExecutionRuntime
from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
from unchain.skeleton import SkeletonToolRuntime, WorkflowNodeCompleted, prepare_workflow
from unchain.skeleton.agent_preparation import prepare_agent_graph
from unchain.skeleton.subagent_runtime import SkeletonSubagentRuntime
from skeleton_agent_runtime import PupuSkeletonAgentExecution
from unchain.skeleton.workflow_runtime import PublishedWorkflow, SkeletonWorkflowCallRuntime
from unchain.tools.toolkit import Toolkit


def _tool_workflow():
    return {
        "schema_version": 1, "kind": "workflow", "id": "approved-leaf",
        "name": "Approved leaf", "nodes": [
            {"id": "start", "type": "start", "config": {"execution": {
                "outputs": [output("value", "result", ["value"]) ]}}},
            {"id": "tool", "type": "tool_call", "config": {
                "execution": {"inputs": [binding("text", "start", ["value"])],
                              "outputs": [output("value", "result", [])]},
                "tool": {"name": "confirm_value", "on_error": "stop",
                         "approval_timeout_ms": 30000}}},
            {"id": "end", "type": "end", "config": {"execution": {
                "inputs": [binding("value", "tool", [])],
                "outputs": [output("value", "input", ["value"]) ]}}},
        ], "edges": [
            {"id": "a", "kind": "flow", "source_node_id": "start", "source_port_id": "out",
             "target_node_id": "tool", "target_port_id": "in"},
            {"id": "b", "kind": "flow", "source_node_id": "tool", "source_port_id": "out",
             "target_node_id": "end", "target_port_id": "in"},
        ],
    }


def _root_with_workflow_call():
    document = deepcopy(_agent_document())
    model = next(node for node in document["nodes"] if node["id"] == "model")
    call = {"id": "call", "type": "workflow_call", "config": {
        "workflow": {"workflow_id": "approved-leaf", "revision_id": "rev-1"},
        "execution": {"inputs": [binding("value", "model", ["answer"])],
                      "outputs": [output("answer", "result", ["value"])]}}}
    document["nodes"].insert(2, call)
    post = next(node for node in document["nodes"] if node["id"] == "postprocess")
    post["config"]["execution"]["inputs"][0]["value"]["node_id"] = "call"
    document["edges"][1]["target_node_id"] = "call"
    document["edges"].insert(2, {"id": "call-post", "kind": "flow",
        "source_node_id": "call", "source_port_id": "out",
        "target_node_id": "postprocess", "target_port_id": "in"})
    return document


def _root_with_tool_call():
    document = deepcopy(_agent_document())
    tool = {"id": "tool", "type": "tool_call", "config": {
        "execution": {"inputs": [binding("text", "model", ["answer"])],
                      "outputs": [output("value", "result", [])]},
        "tool": {"name": "confirm_value", "on_error": "stop", "approval_timeout_ms": 30000}}}
    document["nodes"].insert(2, tool)
    post = next(node for node in document["nodes"] if node["id"] == "postprocess")
    post["config"]["execution"]["inputs"][0]["value"]["node_id"] = "tool"
    post["config"]["execution"]["inputs"][0]["value"]["path"] = ["value"]
    document["edges"][1]["target_node_id"] = "tool"
    document["edges"].insert(2, {"id": "tool-post", "kind": "flow",
        "source_node_id": "tool", "source_port_id": "out",
        "target_node_id": "postprocess", "target_port_id": "in"})
    return document


def test_general_resume_dispatches_actual_workflow_call_leaf_wait(tmp_path, monkeypatch):
    execution_id = "production-general-resume-workflow-call"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    parent_plan = prepare_agent_graph(_root_with_workflow_call())
    workflow = _tool_workflow()
    workflow_plan = prepare_workflow(workflow)
    toolkit = Toolkit()
    calls = []

    @toolkit.tool(name="confirm_value", requires_confirmation=True)
    def confirm_value(text: str):
        calls.append(text)
        return {"echo": "approved " + text}

    memory_store = JsonFileSessionStore(tmp_path / "sessions")
    client = _StrictOpenAIClient([_final_response("needs approval")])

    def handler_factory(store, plan):
        tool_runtime = SkeletonToolRuntime(
            workflow_plan, toolkit, session_id=execution_id, clock_ms=lambda: 100,
        )
        return {"tool_call": tool_runtime, "workflow_call": SkeletonWorkflowCallRuntime(
            store, lambda _workflow_id, _revision_id: PublishedWorkflow(
                "approved-leaf", "rev-1", deepcopy(workflow)),
            handlers={"tool_call": tool_runtime},
        )}

    def root_handlers(store, plan):
        tool_runtime = SkeletonToolRuntime(
            workflow_plan, toolkit, session_id=execution_id, clock_ms=lambda: 100,
        )
        return {"workflow_call": SkeletonWorkflowCallRuntime(
            store, lambda _workflow_id, _revision_id: PublishedWorkflow(
                "approved-leaf", "rev-1", deepcopy(workflow)),
            handlers={"tool_call": tool_runtime},
        ), "code": lambda _context, _inputs: WorkflowNodeCompleted({
            "message": "postprocessed", "evidence": "approval",
        })}

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        memory = KernelMemoryRuntime.from_config(store=memory_store)
        execution = PupuSkeletonAgentExecution(
            parent_plan, bridge, graph_id="pupu-skeleton-host",
            durability_runtime=memory, execution_guard=guard,
            bind_profile=lambda config: _binding(config, client, []),
            child_handlers_factory=handler_factory, root_handlers_factory=root_handlers,
        )
        assert execution.runner.handlers["workflow_call"].store is execution.store
        execution.create({})
        waiting, receipt = execution.run(original_task="approve workflow call")
        assert waiting.status == "waiting" and receipt is None, waiting.error
        assert calls == []
        active = execution.store.load().state["active"]
        assert active["wait"]["kind"] == "child"
        request = execution.store.read_json(active["wait"]["request_ref"])
        assert request["schema"] == "unchain.skeleton_workflow_call_wait.v1"
        leaf = execution.runner.handlers["workflow_call"].tool_interaction_wait(
            execution.runner, node_invocation_id=active["node_invocation_id"],
        )

        resumed, receipt = execution.resume_current_interaction(
            leaf["wait_id"], True, node_invocation_id=active["node_invocation_id"],
            original_task="approve workflow call")

    assert resumed.status == "completed" and receipt is not None, resumed.error
    assert calls == ["needs approval"]
    assert resumed.outputs["message"] == "postprocessed"


def test_general_resume_dispatches_direct_agent_tool_wait(tmp_path, monkeypatch):
    execution_id = "production-general-resume-direct-tool"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan = prepare_agent_graph(_root_with_tool_call())
    toolkit = Toolkit()
    calls = []

    @toolkit.tool(name="confirm_value", requires_confirmation=True)
    def confirm_value(text: str):
        calls.append(text)
        return {"echo": "approved " + text}

    memory_store = JsonFileSessionStore(tmp_path / "sessions")
    client = _StrictOpenAIClient([_final_response("needs approval")])

    def root_handlers(store, _plan):
        return {
            "tool_call": SkeletonToolRuntime(
                plan, toolkit, session_id=execution_id, clock_ms=lambda: 100,
            ),
            "code": lambda _context, _inputs: WorkflowNodeCompleted({
                "message": "postprocessed", "evidence": "approval",
            }),
        }

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        memory = KernelMemoryRuntime.from_config(store=memory_store)
        execution = PupuSkeletonAgentExecution(
            plan, bridge, graph_id="pupu-skeleton-host-direct-tool",
            durability_runtime=memory, execution_guard=guard,
            bind_profile=lambda config: _binding(config, client, []),
            root_handlers_factory=root_handlers,
        )
        execution.create({})
        waiting, receipt = execution.run(original_task="approve direct tool")
        assert waiting.status == "waiting" and receipt is None
        active = execution.store.load().state["active"]
        assert execution.runner.nodes[active["node_id"]]["type"] == "tool_call"
        assert active["wait"]["kind"] == "interaction"
        resumed, receipt = execution.resume_current_interaction(
            active["wait"]["id"], True,
            node_invocation_id=active["node_invocation_id"],
            original_task="approve direct tool",
        )

    assert resumed.status == "completed" and receipt is not None, resumed.error
    assert calls == ["needs approval"]


def test_host_modules_append_without_replacing_subagent_modules(tmp_path, monkeypatch):
    execution_id = "production-host-module-composition"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    memory_store = JsonFileSessionStore(tmp_path / "sessions")
    host_module = object()
    client = _StrictOpenAIClient([_final_response("done")])
    policies = []

    def host_modules(_context, **policy):
        policies.append(policy)
        return (host_module,)

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        memory = KernelMemoryRuntime.from_config(store=memory_store)
        execution = PupuSkeletonAgentExecution(
            plan, bridge, graph_id="production-host-module-composition",
            durability_runtime=memory, execution_guard=guard,
            bind_profile=lambda config: _binding(config, client, []),
            subagent_manifests=manifests,
            host_modules_for_node=host_modules,
        )
    modules = execution._kernel_handler_arguments(plan)["modules_for_node"](
        SimpleNamespace(node_id="model"))
    assert len(modules) == 2
    assert type(modules[0]).__name__ == "SubagentModule"
    assert modules[1] is host_module
    adapter = execution._subagent_runtime.agent_for_attachment("model", "reviewer")
    child_modules = execution._modules_for_node(
        SkeletonSubagentRuntime((), run_child=lambda *_args, **_kwargs: None), adapter,
    )(
        SimpleNamespace(node_id="model"))
    assert child_modules == (host_module,)
    assert policies == [{}, {"allowed_tools": None, "disabled_tools": ()}]


def test_child_handler_factory_rejects_disabled_deterministic_tool_before_dispatch(tmp_path):
    # Exercise the real production binding boundary: a nested fixed Workflow
    # cannot dispatch a deterministic Tool omitted by its attachment policy.
    from skeleton_resource_store import SkeletonResourceError
    from test_skeleton_production_bindings import _host, _execution

    document = _tool_workflow()
    document["nodes"][1]["config"]["tool"]["name"] = "get_file_info"
    document["nodes"][1]["config"]["execution"]["inputs"] = [{
        "name": "path", "value": {"kind": "literal", "value": str(tmp_path)},
        "missing": "error",
    }]
    host, _store, _selection = _host(tmp_path)
    plan = prepare_workflow(document)
    execution = _execution(tmp_path, plan, suffix="disabled-tool")

    try:
        host.child_handlers_factory(
            execution, plan, allowed_tools=None, disabled_tools=("get_file_info",),
        )
    except SkeletonResourceError as exc:
        assert exc.code == "tool_forbidden"
    else:
        raise AssertionError("disabled deterministic Tool was admitted")
