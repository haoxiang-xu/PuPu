"""Published Hook approval sequences through the real Agent host and Tool executor."""

from copy import deepcopy

import pytest

import test_skeleton_agent_runtime as base
from skeleton_resource_store import SkeletonResourceStore
from unchain.execution import ExecutionRuntime
from unchain.journal import AttemptRef, JournalConflictError
from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
from unchain.skeleton import SkeletonToolRuntime, prepare_workflow
from unchain.skeleton.agent_preparation import prepare_agent_graph
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.tools import Tool
from unchain.tools.toolkit import Toolkit


OUTPUTS = ("decision", "require_approval", "arguments")


def _binding(name, node, path):
    return {"name": name, "value": {"kind": "ref", "node_id": node, "path": path},
            "missing": "error"}


def _output(name, kind, path):
    return {"name": name, "source": {"kind": kind, "path": path}}


def _edge(source, target):
    return {"id": source + "-" + target, "kind": "flow", "source_node_id": source,
            "source_port_id": "out", "target_node_id": target, "target_port_id": "in"}


def _leaf(resource_id, tool_count):
    nodes = [{"id": "start", "type": "start", "config": {"execution": {
        "outputs": [_output("arguments", "result", ["arguments"])]}}}]
    edges = []
    previous = "start"
    for index in range(tool_count):
        node_id = f"check-{index}"
        nodes.append({"id": node_id, "type": "tool_call", "config": {
            "tool": {"name": "hook_check", "on_error": "stop", "approval_timeout_ms": 30000},
            "execution": {
                "inputs": [_binding("value", previous, ["arguments", "value"])],
                "outputs": [_output(name, "result", ["result", name]) for name in OUTPUTS],
            }}})
        edges.append(_edge(previous, node_id))
        previous = node_id
    nodes.append({"id": "end", "type": "end", "config": {"execution": {
        "inputs": [_binding(name, previous, [name]) for name in OUTPUTS],
        "outputs": [_output(name, "input", [name]) for name in OUTPUTS],
    }}})
    edges.append(_edge(previous, "end"))
    return {"schema_version": 1, "kind": "workflow", "id": resource_id,
            "name": resource_id, "nodes": nodes, "edges": edges}


def _wrapper(resource_id, child_id, revision):
    return {"schema_version": 1, "kind": "workflow", "id": resource_id,
        "name": resource_id, "nodes": [
            {"id": "start", "type": "start", "config": {"execution": {
                "outputs": [_output("arguments", "result", ["arguments"])]}}},
            {"id": "call", "type": "workflow_call", "config": {
                "workflow": {"workflow_id": child_id, "revision_id": revision},
                "execution": {"inputs": [_binding("arguments", "start", ["arguments"])],
                    "outputs": [_output(name, "result", [name]) for name in OUTPUTS]}}},
            {"id": "end", "type": "end", "config": {"execution": {
                "inputs": [_binding(name, "call", [name]) for name in OUTPUTS],
                "outputs": [_output(name, "input", [name]) for name in OUTPUTS]}}},
        ], "edges": [_edge("start", "call"), _edge("call", "end")]}


class _Scenario:
    def __init__(self, tmp_path, monkeypatch, *, depth=0, tool_count=1, hook_count=1):
        self.root = tmp_path
        self.bridge = base._bridge(tmp_path, monkeypatch, execution_id="hook-approval-regression")
        self.resources = SkeletonResourceStore(tmp_path / "resources")
        self.revisions = {}
        self.effects = []
        self.parent_effects = []
        self.clock = 100
        self.clock_reads = []
        hooks = []
        for hook_index in range(hook_count):
            child_id = f"leaf-{hook_index}"
            revision = self._publish(_leaf(child_id, tool_count))
            for level in range(depth):
                parent_id = f"wrapper-{hook_index}-{level}"
                revision = self._publish(_wrapper(parent_id, child_id, revision))
                child_id = parent_id
            hooks.append((child_id, revision))
        document = base._document_with_hook_pool(base._agent_document(),
            workflow_id=hooks[0][0], revision_id=hooks[0][1])
        kernel = next(node for node in document["nodes"] if node["type"] == "agent")
        kernel["config"]["kernel"]["max_iterations"] = 3
        pool = next(node for node in document["nodes"] if node["type"] == "hooks_pool")
        original = pool["config"]["hooks"][0]
        pool["config"]["hooks"] = [
            {**deepcopy(original), "id": f"hook-{index}", "order": index,
             "workflow": {"workflow_id": workflow_id, "revision_id": revision}}
            for index, (workflow_id, revision) in enumerate(hooks)
        ]
        self.plan = prepare_agent_graph(document)
        self.toolkit = Toolkit()

        @self.toolkit.tool(name="hook_check", requires_confirmation=True)
        def hook_check(value: str):
            self.effects.append(value)
            return {"decision": "continue", "require_approval": True,
                    "arguments": {"value": value + "|checked"}}

        self.client = base._StrictOpenAIClient([
            base._approval_tool_response(), base._final_response("finished"),
            base._final_response("finished"),
        ])

    def _publish(self, document):
        saved = self.resources.save_draft(document)
        published = self.resources.publish_workflow(document["id"],
            expected_edit_token=saved["edit_token"])
        self.revisions[document["id"]] = published["revision_id"]
        return published["revision_id"]

    def _memory(self):
        return JsonFileSessionStore(self.root / "kernel-sessions")

    def _now(self):
        return self.clock_reads.pop(0) if self.clock_reads else self.clock

    def _host(self, guard, memory):
        return base._host_execution(self.plan, self.bridge, client=self.client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory),
            tools_for_node=lambda _context: (Tool.from_callable(
                lambda value: self.parent_effects.append(value) or {"value": value},
                name="dangerous_tool", requires_confirmation=False),),
            child_handlers_factory=lambda _store, plan: {"tool_call": SkeletonToolRuntime(
                plan, self.toolkit, session_id=self.bridge.execution_id,
                clock_ms=self._now)},
            hook_workflow_resolver=self.resources.resolve_published_workflow)

    def start(self):
        memory = self._memory()
        with ExecutionRuntime(memory).scope(self.bridge.execution_id) as guard:
            host = self._host(guard, memory)
            host.create({})
            result, receipt = host.run(original_task="published Hook approval")
            assert result.status == "waiting" and receipt is None
            return deepcopy(host.store.load().state["active"])

    def resume(self, active, *, fault=None):
        memory = self._memory()
        with ExecutionRuntime(memory).scope(self.bridge.execution_id) as guard:
            host = self._host(guard, memory)
            if fault is not None:
                fault(host, guard)
            result, receipt = host.resume_interaction(active["wait"]["id"], True,
                node_invocation_id=active["node_invocation_id"],
                original_task="published Hook approval")
            return result, receipt, deepcopy(host.store.load().state["active"])

    def request(self, active):
        memory = self._memory()
        with ExecutionRuntime(memory).scope(self.bridge.execution_id) as guard:
            host = self._host(guard, memory)
            return host.store.read_json(active["wait"]["request_ref"])

    def leaf_state(self, request):
        wait = request["subject"]["hook_child_wait"]
        leaf_id = "leaf-0"
        revision = self.revisions[leaf_id]
        plan = prepare_workflow(self.resources.resolve_published_workflow(
            leaf_id, revision).document)
        memory = self._memory()
        with ExecutionRuntime(memory).scope(self.bridge.execution_id) as guard:
            host = self._host(guard, memory)
            store = WorkflowExecutionStore(host.store.journal, plan,
                graph_id=wait["child_graph_id"],
                attempt=AttemptRef(host.store.attempt.generation, wait["child_attempt_id"]))
            return store.load().state

    def hook_state(self, request):
        wait = request["subject"]["hook_child_wait"]
        graph_id = wait["child_graph_id"].split(".child.", 1)[0]
        suffix = graph_id.rsplit(".hook.", 1)[1]
        published = self.resources.resolve_published_workflow(
            wait["workflow_id"], wait["revision_id"])
        memory = self._memory()
        with ExecutionRuntime(memory).scope(self.bridge.execution_id) as guard:
            host = self._host(guard, memory)
            store = WorkflowExecutionStore(host.store.journal,
                prepare_workflow(published.document), graph_id=graph_id,
                attempt=AttemptRef(host.store.attempt.generation, "hook." + suffix))
            return store.load().state


@pytest.mark.parametrize("depth", (0, 1, 2))
def test_published_hook_child_and_parent_approvals_complete_once(tmp_path, monkeypatch, depth):
    case = _Scenario(tmp_path, monkeypatch, depth=depth)
    first = case.start()
    child_request = case.request(first)
    result, receipt, parent = case.resume(first)
    assert result.status == "waiting" and receipt is None
    parent_request = case.request(parent)
    assert child_request["interaction_id"] != parent_request["interaction_id"]
    assert parent_request["payload"]["tool_name"] == "dangerous_tool"
    result, receipt, _active = case.resume(parent)
    assert result.status == "completed" and receipt is not None
    assert case.effects == ["approved child value"]
    assert case.parent_effects == ["approved child value|checked"]


@pytest.mark.parametrize("depth,tool_count,hook_count", ((0, 2, 1), (1, 2, 1), (0, 1, 2)))
def test_published_hook_projects_each_distinct_child_approval(tmp_path, monkeypatch,
                                                              depth, tool_count, hook_count):
    case = _Scenario(tmp_path, monkeypatch, depth=depth,
                     tool_count=tool_count, hook_count=hook_count)
    first = case.start()
    first_request = case.request(first)
    result, receipt, second = case.resume(first)
    assert result.status == "waiting" and receipt is None
    second_request = case.request(second)
    assert second_request["interaction_id"] != first_request["interaction_id"]
    assert second_request["subject"]["hook_child_wait"]["child_wait_id"] != (
        first_request["subject"]["hook_child_wait"]["child_wait_id"])
    assert len(case.client.requests) == 1 and len(case.effects) == 1
    result, receipt, parent = case.resume(second)
    assert result.status == "waiting" and receipt is None
    result, receipt, _active = case.resume(parent)
    assert result.status == "completed" and receipt is not None
    assert case.effects == ["approved child value", "approved child value|checked"]
    assert case.parent_effects == ["approved child value|checked|checked"]


@pytest.mark.parametrize("depth", (0, 1))
def test_expired_hook_child_approval_terminalizes_without_reply(tmp_path, monkeypatch, depth):
    case = _Scenario(tmp_path, monkeypatch, depth=depth)
    active = case.start()
    request = case.request(active)
    case.clock = 40000
    result, receipt, _active = case.resume(active)
    assert result.status in {"failed", "outcome_unknown"} and receipt is None
    assert case.leaf_state(request)["status"] == "failed"
    assert case.hook_state(request)["status"] == "failed"
    assert case.effects == case.parent_effects == []
    assert len(case.client.requests) == 1


def test_expired_hook_child_cannot_become_a_policy_block_if_clock_moves_back(
    tmp_path, monkeypatch,
):
    case = _Scenario(tmp_path, monkeypatch)
    active = case.start()
    request = case.request(active)
    case.clock_reads = [40000, 100]
    result, receipt, _active = case.resume(active)
    assert result.status in {"failed", "outcome_unknown"} and receipt is None
    assert case.effects == case.parent_effects == []
    assert len(case.client.requests) == 1
    assert case.leaf_state(request)["status"] in {"waiting", "failed"}


@pytest.mark.parametrize("depth", (1, 2))
def test_nested_hook_child_tool_checks_root_lease_before_effect(tmp_path, monkeypatch, depth):
    import unchain.skeleton.tool_runtime as tool_runtime
    case = _Scenario(tmp_path, monkeypatch, depth=depth)
    active = case.start()
    original = tool_runtime.execute_confirmable_tool_call
    def fault(_host, guard):
        def after_authority_loss(*args, **kwargs):
            guard.release()
            return original(*args, **kwargs)
        monkeypatch.setattr(tool_runtime, "execute_confirmable_tool_call", after_authority_loss)
    result, receipt, _active = case.resume(active, fault=fault)
    assert result.status == "outcome_unknown" and receipt is None
    assert case.effects == case.parent_effects == []
    assert len(case.client.requests) == 1


@pytest.mark.parametrize("depth", (1, 2))
def test_rebuilt_parent_cancellation_stops_nested_hook_child_tool(tmp_path, monkeypatch, depth):
    import unchain.skeleton.tool_runtime as tool_runtime
    case = _Scenario(tmp_path, monkeypatch, depth=depth)
    active = case.start()
    original = tool_runtime.execute_confirmable_tool_call
    cancelled = []
    def fault(_host, guard):
        def after_cancel(*args, **kwargs):
            rebuilt = case._host(guard, guard._runtime.store)
            cancelled.append(rebuilt.runner.cancel().status)
            return original(*args, **kwargs)
        monkeypatch.setattr(tool_runtime, "execute_confirmable_tool_call", after_cancel)
    try:
        case.resume(active, fault=fault)
    except JournalConflictError:
        pass
    assert cancelled == ["cancelled"]
    assert case.effects == case.parent_effects == []
    assert len(case.client.requests) == 1
