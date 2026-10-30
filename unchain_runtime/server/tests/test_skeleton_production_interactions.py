"""BC-024 exact graph-owned approval acceptance, without provider calls."""
from copy import deepcopy
import importlib
from types import SimpleNamespace

import pytest

import unchain_adapter  # noqa: F401
from unchain.journal import AttemptRef, GenerationRef
from unchain.persistence import SQLiteContextV2Store
from unchain.skeleton import prepare_agent_graph, prepare_workflow, WorkflowNodeCompleted
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.tool_runtime import SkeletonToolRuntime
from unchain.skeleton.workflow_runtime import SkeletonWorkflowCallRuntime, PublishedWorkflow
from unchain.tools import Tool, Toolkit

from durable_interaction_host import DurableInteractionHostError, interaction_receipt_handoff
from test_skeleton_resource_store import agent, workflow, output, binding


def _api():
    return importlib.import_module("skeleton_production_interactions")


def _tool_document(resource_id="tool-child"):
    document = workflow(resource_id)
    middle = document["nodes"][1]
    middle.update(type="tool_call", config={
        "tool": {"name": "probe", "on_error": "stop", "approval_timeout_ms": 60000},
        "execution": {"inputs": [], "outputs": [output("value", "result", ["result"])]},
    })
    return document


def _setup(tmp_path, monkeypatch, document=None, published=()):
    api = _api()
    database = SQLiteContextV2Store(database_path=tmp_path / "context.sqlite", object_directory=tmp_path / "objects")
    journal = database.bind_execution("session")
    generation = GenerationRef("session", "generation")
    document = document or _tool_document("root")
    plan = prepare_agent_graph(document) if document["kind"] == "agent" else prepare_workflow(document)
    store = WorkflowExecutionStore(journal, plan, graph_id="root-graph", attempt=AttemptRef(generation, "root-run"))
    revisions = {(row.workflow_id, row.revision_id): row for row in published}
    launch = SimpleNamespace(descriptor={"session_id": "session", "owner_chat_id": "owner", "root_run_id": "root-run",
        "graph_id": "root-graph", "binding": {"generation_id": "generation"}}, journal=journal, plan=plan, store=store,
        selection=SimpleNamespace(to_dict=lambda: {"document": deepcopy(document), "subagents": []}),
        workflows=SimpleNamespace(resolve=lambda workflow_id, revision_id: revisions[(workflow_id, revision_id)]))
    def load(session_id, *, expected_owner_chat_id=None):
        if session_id != "session":
            return None
        if expected_owner_chat_id not in (None, "owner"):
            raise DurableInteractionHostError("skeleton_launch_owner_mismatch", "wrong owner", status_code=409)
        return launch
    monkeypatch.setattr(api, "load_active_launch", load)
    monkeypatch.setattr(api, "assert_launch_current", lambda _launch, snapshot=None: None)
    monkeypatch.setattr(api, "_mutable_journal", lambda _launch: journal)
    monkeypatch.setattr(api, "_interaction_commit_lock", lambda _session: __import__("contextlib").nullcontext())
    calls = []
    toolkit = Toolkit()
    @toolkit.tool(name="probe", requires_confirmation=True)
    def probe():
        calls.append("executed")
        return "done"
    handlers = {"tool_call": SkeletonToolRuntime(plan, toolkit, "session", lambda: 1000)}
    if published:
        handlers["workflow_call"] = SkeletonWorkflowCallRuntime(store, launch.workflows.resolve, handlers=handlers)
    runner = DurableWorkflowRunner(store, handlers)
    runner.create({"value": "input"})
    result = runner.run()
    assert result.status == "waiting"
    return api, launch, runner, calls


def test_direct_tool_pending_preserves_original_request_and_root_transport(tmp_path, monkeypatch):
    api, launch, runner, calls = _setup(tmp_path, monkeypatch)
    locator = api.resolve_pending_skeleton_interaction("session")
    pending = api.get_pending_skeleton_interaction("session")
    assert locator.request.source_run_id == "root-graph"
    assert locator.request.session_id == "session"
    assert locator.leaf_node_type == "tool_call"
    assert locator.root_node_invocation_id == runner.store.load().state["active"]["node_invocation_id"]
    assert pending["source_run_id"] == "root-run"
    assert pending["resume_kind"] == "skeleton"
    assert pending["interaction_id"] == locator.request.interaction_id
    assert pending["status"] == "awaiting_response"
    assert calls == []


def test_receipt_publishes_original_request_and_exact_canonical_response_once(tmp_path, monkeypatch):
    api, launch, runner, calls = _setup(tmp_path, monkeypatch)
    before = api.resolve_pending_skeleton_interaction("session").request.to_dict()
    first = api.record_skeleton_interaction_receipt(session_id="session", interaction_id=before["interaction_id"], approved=True)
    second = api.record_skeleton_interaction_receipt(session_id="session", interaction_id=before["interaction_id"], approved=True)
    assert first == second
    handoff = interaction_receipt_handoff(first)
    assert handoff.session_id == "session"
    assert handoff.interaction_id == before["interaction_id"]
    assert handoff.submitted_by == "user"
    events = launch.journal.capture_snapshot().events
    requests = [event for event in events if event.event_type == "interaction.requested"]
    resolved = [event for event in events if event.event_type == "interaction.resolved"]
    assert len(requests) == len(resolved) == 1
    assert requests[0].attempt.attempt_id == before["source_run_id"]
    assert __import__("unchain.journal.models", fromlist=["_thaw_json"])._thaw_json(requests[0].payload)["interaction_request"] == before
    assert api.get_pending_skeleton_interaction("session")["status"] == "receipt_recorded"
    assert calls == []


def test_conflicting_answer_wrong_id_and_foreign_owner_do_not_write(tmp_path, monkeypatch):
    api, launch, _runner, _calls = _setup(tmp_path, monkeypatch)
    request = api.resolve_pending_skeleton_interaction("session").request
    api.record_skeleton_interaction_receipt(session_id="session", interaction_id=request.interaction_id, approved=False)
    count = len(launch.journal.capture_snapshot().events)
    for kwargs in ({"interaction_id": request.interaction_id, "approved": True},
                   {"interaction_id": "foreign", "approved": True}):
        with pytest.raises(DurableInteractionHostError):
            api.record_skeleton_interaction_receipt(session_id="session", **kwargs)
    with pytest.raises(DurableInteractionHostError):
        api.resolve_pending_skeleton_interaction("session", expected_owner_chat_id="foreign")
    assert len(launch.journal.capture_snapshot().events) == count


def test_nested_workflow_call_locates_real_leaf_and_does_not_execute_it(tmp_path, monkeypatch):
    child = _tool_document("child")
    root = workflow("root", call=("child", "revision-1"))
    api, launch, runner, calls = _setup(tmp_path, monkeypatch, root, [PublishedWorkflow("child", "revision-1", child)])
    locator = api.resolve_pending_skeleton_interaction("session")
    assert len(locator.chain) == 2
    assert locator.root_wait_kind == "child"
    assert locator.leaf_store.plan.document_id == "child"
    assert locator.request.source_run_id == locator.leaf_store.graph_id
    assert locator.request.source_run_id != launch.store.graph_id
    receipt = api.record_skeleton_interaction_receipt(session_id="session", interaction_id=locator.request.interaction_id, approved=False)
    assert receipt["interaction_id"] == locator.request.interaction_id
    assert api.get_pending_skeleton_interaction("session")["source_run_id"] == "root-run"
    assert calls == []


def test_atomic_acceptance_rechecks_leaf_and_root_wait_after_preflight(tmp_path, monkeypatch):
    api, launch, runner, calls = _setup(tmp_path, monkeypatch)
    request = api.resolve_pending_skeleton_interaction("session").request
    original = api.ContextInputIngress.persist
    def cancelled_between_preflight_and_commit(ingress, current_input, *, precondition=None):
        runner.cancel()
        return original(ingress, current_input, precondition=precondition)
    monkeypatch.setattr(api.ContextInputIngress, "persist", cancelled_between_preflight_and_commit)
    with pytest.raises(DurableInteractionHostError):
        api.record_skeleton_interaction_receipt(session_id="session", interaction_id=request.interaction_id, approved=True)
    assert not [event for event in launch.journal.capture_snapshot().events if event.event_type == "interaction.resolved"]
    assert calls == []


def test_no_launch_returns_none_and_cancel_rejects_stale_target(tmp_path, monkeypatch):
    api, launch, runner, calls = _setup(tmp_path, monkeypatch)
    assert api.get_pending_skeleton_interaction("missing") is None
    assert api.record_skeleton_interaction_receipt(session_id="missing", interaction_id="missing", approved=True) is None
    request = api.resolve_pending_skeleton_interaction("session").request
    with pytest.raises(DurableInteractionHostError):
        api.cancel_skeleton_execution(session_id="session", attempt_id="root-run", expected_interaction_id="foreign")
    assert runner.store.load().state["status"] == "waiting"
    result = api.cancel_skeleton_execution(session_id="session", attempt_id="root-run", expected_interaction_id=request.interaction_id)
    assert result["state"] == "cancelled"
    assert result["context_interaction_reconciled"] is True
    events = launch.journal.capture_snapshot().events
    assert len([event for event in events if event.event_type == "interaction.requested"]) == 1
    assert len([event for event in events if event.event_type == "interaction.resolved"]) == 1
    assert runner.store.load().state["status"] == "cancelled"
    with pytest.raises(DurableInteractionHostError):
        api.record_skeleton_interaction_receipt(session_id="session", interaction_id=request.interaction_id, approved=True)
    assert calls == []


def _install_actual_launch(api, monkeypatch, execution, bridge, *, manifests=(), resolver=None):
    session = bridge.execution_id
    descriptor = {"session_id": session, "owner_chat_id": "skeleton-host-chat", "root_run_id": execution.store.attempt.attempt_id,
        "graph_id": execution.store.graph_id, "binding": bridge.preparation.binding.canonical_value()}
    launch = SimpleNamespace(descriptor=descriptor, journal=execution.store.journal, store=execution.store, plan=execution.plan,
        selection=SimpleNamespace(to_dict=lambda: {"document": execution.plan.snapshot(), "subagents": deepcopy(list(manifests))}),
        workflows=SimpleNamespace(resolve=resolver))
    monkeypatch.setattr(api, "load_active_launch", lambda session_id, **_kwargs: launch if session_id == session else None)
    monkeypatch.setattr(api, "assert_launch_current", lambda _launch, snapshot=None: None)
    monkeypatch.setattr(api, "_mutable_journal", lambda _launch: execution.store.journal)
    return launch


@pytest.mark.parametrize("subagent", [False, True])
def test_actual_kernel_and_subagent_request_uses_original_canonical_node_source(tmp_path, monkeypatch, subagent):
    from test_skeleton_agent_runtime import (_bridge, _single_plan, _parent_with_pool, _host_execution,
        _StrictOpenAIClient, _approval_tool_response, _handoff_response)
    from unchain.execution import ExecutionRuntime
    from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime

    api = _api()
    bridge = _bridge(tmp_path, monkeypatch, execution_id="kernel-production-approval")
    plan, manifests = _parent_with_pool() if subagent else (_single_plan(), [])
    client = _StrictOpenAIClient(([_handoff_response()] if subagent else []) + [_approval_tool_response()])
    calls = []
    tool = Tool.from_callable(lambda value: calls.append(value) or value, name="dangerous_tool", requires_confirmation=True)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store), tools_for_node=lambda _context: (tool,),
            subagent_manifests=manifests)
        execution.create({})
        result, _receipt = execution.run(original_task="approve")
    assert result.status == "waiting", result.error
    launch = _install_actual_launch(api, monkeypatch, execution, bridge, manifests=manifests)
    pending = api.resolve_pending_skeleton_interaction(bridge.execution_id)
    assert pending.leaf_node_type == "agent"
    assert pending.request.source_run_id != launch.descriptor["root_run_id"]
    assert pending.request.source_run_id == pending.leaf_store.load().state["active"]["node_attempt_id"]
    assert (pending.request.session_id != bridge.execution_id) is subagent
    assert len(pending.chain) == (2 if subagent else 1)
    requests_before = len(client.requests)
    result = api.record_skeleton_interaction_receipt(session_id=bridge.execution_id,
        interaction_id=pending.request.interaction_id, approved=True)
    assert result["interaction_id"] == pending.request.interaction_id
    assert api.get_pending_skeleton_interaction(bridge.execution_id)["status"] == "receipt_recorded"
    assert len(client.requests) == requests_before
    assert calls == []
    from unchain.interaction.runtime import DurableInteractionRuntime
    monkeypatch.setattr(api, "_interaction_runtime", lambda: DurableInteractionRuntime(KernelMemoryRuntime.from_config(store=memory_store)))
    cancelled = api.cancel_skeleton_execution(session_id=bridge.execution_id,
        attempt_id=launch.descriptor["root_run_id"], expected_interaction_id=pending.request.interaction_id)
    assert cancelled["context_interaction_reconciled"] is True
    assert all(anchor.store.load().state["status"] == "cancelled" for anchor in pending.chain)
    assert api._accepted(pending, normalize=False).response["approved"] is True
    assert len([event for event in launch.journal.capture_snapshot().events if event.event_type == "interaction.resolved"
        and event.payload.get("interaction_id") == pending.request.interaction_id]) == 1
    assert len(client.requests) == requests_before
    assert calls == []


@pytest.mark.parametrize("nested", [False, True])
def test_actual_hook_parent_request_proves_current_original_child_chain(tmp_path, monkeypatch, nested):
    from test_skeleton_agent_runtime import (_bridge, _agent_document, _document_with_hook_pool,
        _before_hook_execution_workflow, _host_execution, _StrictOpenAIClient, _approval_tool_response)
    from unchain.execution import ExecutionRuntime
    from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime

    api = _api()
    bridge = _bridge(tmp_path, monkeypatch, execution_id="hook-production-approval")
    plan = prepare_agent_graph(_document_with_hook_pool(_agent_document()))
    workflow_body = _before_hook_execution_workflow("policy-workflow")
    leaf_body = deepcopy(workflow_body)
    leaf_body["id"] = "nested-policy" if nested else "policy-workflow"
    leaf_body["nodes"][1].update(type="tool_call", config={
        "execution": {"inputs": [{"name": "value", "value": {"kind": "ref", "node_id": "start", "path": ["arguments", "value"]}, "missing": "error"}],
            "outputs": [output(name, "result", ["result", name]) for name in ("decision", "require_approval", "arguments")]},
        "tool": {"name": "hook_decision", "on_error": "stop", "approval_timeout_ms": 30000}})
    if nested:
        workflow_body["nodes"][1].update(type="workflow_call", config={
            "workflow": {"workflow_id": "nested-policy", "revision_id": "nested-revision"},
            "execution": deepcopy(workflow_body["nodes"][1]["config"]["execution"])})
    else:
        workflow_body = leaf_body
    def resolve(workflow_id, revision_id):
        return PublishedWorkflow(workflow_id, revision_id, deepcopy(leaf_body if workflow_id == "nested-policy" else workflow_body))
    calls = []
    toolkit = Toolkit()
    @toolkit.tool(name="hook_decision", requires_confirmation=True)
    def hook_decision(value: str):
        calls.append(value)
        return {"decision": "continue", "require_approval": False, "arguments": {"value": value}}
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    client = _StrictOpenAIClient([_approval_tool_response()])
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (Tool.from_callable(lambda value: calls.append(value) or value,
                name="dangerous_tool", requires_confirmation=False),),
            child_handlers_factory=lambda _store, child_plan: {"tool_call": SkeletonToolRuntime(child_plan, toolkit, bridge.execution_id, lambda: 100)},
            hook_workflow_resolver=resolve)
        execution.create({})
        result, _receipt = execution.run(original_task="approve Hook")
    assert result.status == "waiting", result.error
    launch = _install_actual_launch(api, monkeypatch, execution, bridge, resolver=resolve)
    pending = api.resolve_pending_skeleton_interaction(bridge.execution_id)
    assert pending.leaf_node_type == "agent"
    assert len(pending.chain) == (3 if nested else 2)
    assert pending.request.subject["hook_child_wait"]["interaction_request"]["interaction_id"] != pending.request.interaction_id
    result = api.record_skeleton_interaction_receipt(session_id=bridge.execution_id,
        interaction_id=pending.request.interaction_id, approved=False)
    assert result["interaction_id"] == pending.request.interaction_id
    assert len(client.requests) == 1
    assert calls == []
    from unchain.interaction.runtime import DurableInteractionRuntime
    monkeypatch.setattr(api, "_interaction_runtime", lambda: DurableInteractionRuntime(KernelMemoryRuntime.from_config(store=memory_store)))
    cancelled = api.cancel_skeleton_execution(session_id=bridge.execution_id,
        attempt_id=launch.descriptor["root_run_id"], expected_interaction_id=pending.request.interaction_id)
    assert cancelled["context_interaction_reconciled"] is True
    assert all(anchor.store.load().state["status"] == "cancelled" for anchor in pending.chain)
    assert api._accepted(pending, normalize=False).response["approved"] is False
    assert len(client.requests) == 1
    assert calls == []


def test_kernel_cancel_retries_after_graph_commit_before_checkpoint_cancel(tmp_path, monkeypatch):
    from test_skeleton_agent_runtime import (_bridge, _single_plan, _host_execution,
        _StrictOpenAIClient, _approval_tool_response)
    from unchain.execution import ExecutionRuntime
    from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
    from unchain.interaction.runtime import DurableInteractionRuntime

    api = _api()
    bridge = _bridge(tmp_path, monkeypatch, execution_id="cancel-production-approval")
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    memory = KernelMemoryRuntime.from_config(store=memory_store)
    calls = []
    tool = Tool.from_callable(lambda value: calls.append(value), name="dangerous_tool", requires_confirmation=True)
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(_single_plan(), bridge, client=_StrictOpenAIClient([_approval_tool_response()]),
            guard=guard, memory=memory, tools_for_node=lambda _context: (tool,))
        execution.create({})
        result, _receipt = execution.run(original_task="cancel")
    assert result.status == "waiting"
    _install_actual_launch(api, monkeypatch, execution, bridge)
    pending = api.resolve_pending_skeleton_interaction(bridge.execution_id)
    actual = DurableInteractionRuntime(memory)
    class InterruptOnce:
        failed = False
        def cancel_pending(self, *args, **kwargs):
            if not self.failed:
                self.failed = True
                raise OSError("simulated interrupted checkpoint cancel")
            return actual.cancel_pending(*args, **kwargs)
        def load(self, *args, **kwargs):
            return actual.load(*args, **kwargs)
    runtime = InterruptOnce()
    monkeypatch.setattr(api, "_interaction_runtime", lambda: runtime)
    args = {"session_id": bridge.execution_id, "attempt_id": execution.store.attempt.attempt_id,
        "expected_interaction_id": pending.request.interaction_id}
    with pytest.raises(DurableInteractionHostError) as interrupted:
        api.cancel_skeleton_execution(**args)
    assert interrupted.value.code == "skeleton_cancel_incomplete"
    assert execution.store.load().state["status"] == "cancelled"
    result = api.cancel_skeleton_execution(**args)
    assert result["state"] == "cancelled"
    assert result["context_interaction_reconciled"] is True
    terminal = actual.load(pending.request.session_id, interaction_id=pending.request.interaction_id, require_active=False)
    assert terminal.application["applied_checkpoint_id"].startswith("cancelled:")
    assert api.cancel_skeleton_execution(**args)["state"] == "cancelled"
    resolutions = [event for event in execution.store.journal.capture_snapshot().events if event.event_type == "interaction.resolved"]
    assert len(resolutions) == 1
    assert api._accepted(pending, normalize=False).response == terminal.receipt.response
    assert api.get_pending_skeleton_interaction(bridge.execution_id) is None
    assert calls == []
