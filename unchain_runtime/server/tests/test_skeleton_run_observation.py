"""#210: read-only views from real Core execution receipts, never UI guesses."""
from copy import deepcopy
import importlib
import json
from types import SimpleNamespace

import pytest

from unchain.skeleton import prepare_agent_graph, prepare_workflow, WorkflowNodeCompleted
from unchain.journal import AttemptRef, GenerationRef
from unchain.persistence import SQLiteContextV2Store
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.workflow_runtime import PublishedWorkflow, SkeletonWorkflowCallRuntime
from skeleton_resource_store import SkeletonResourceError
from skeleton_runtime_capability import require_skeleton_runtime
from test_skeleton_production_chat import production, _approval_fixture
from test_skeleton_production_routes import authenticated_client, _body, _stream, _confirm
from test_skeleton_production_interactions import _setup, _tool_document
from test_skeleton_resource_store import workflow, output


def _reader():
    return importlib.import_module("skeleton_run_observation")


def _projection_launch(launch, published=()):
    # These semantic tests use a real Core runner/Journal, not a real launch
    # ingress. HTTP tests below separately use the actual persisted launch.
    launch.descriptor["runtime_manifest"] = require_skeleton_runtime()
    launch.workflows = SimpleNamespace(to_dict=lambda: {
        "schema": "pupu.skeleton_workflow_snapshot.v1", "workflows": [
            {"workflow_id": item.workflow_id, "revision_id": item.revision_id,
             "document": item.document} for item in published
        ],
    })
    return launch


def _nodes(graph):
    return {node["node_id"]: node for node in graph["nodes"]}


def _bare_launch(tmp_path, document, handlers, inputs=None):
    database = SQLiteContextV2Store(database_path=tmp_path / "projection.sqlite",
                                   object_directory=tmp_path / "projection-objects")
    journal = database.bind_execution("projection-session")
    plan = prepare_agent_graph(document) if document["kind"] == "agent" else prepare_workflow(document)
    store = WorkflowExecutionStore(journal, plan, graph_id="projection-root",
        attempt=AttemptRef(GenerationRef("projection-session", "projection-generation"), "projection-root"))
    launch = SimpleNamespace(journal=journal, plan=plan, store=store,
        descriptor={"owner_chat_id": "projection-owner", "session_id": "projection-session",
                    "root_run_id": "projection-root"},
        selection=SimpleNamespace(to_dict=lambda: {"document": deepcopy(document), "subagents": []}))
    _projection_launch(launch)
    runner = DurableWorkflowRunner(store, handlers)
    runner.create({"value": "input"} if inputs is None else inputs)
    return launch, runner


def test_real_route_observes_completed_launch_without_effects(production, authenticated_client, tmp_path):
    _, options, calls = production
    client, headers = authenticated_client
    _stream(client, headers, _body(options, "view-session", "view-root"))
    query = {"owner_chat_id": "production-chat", "execution_id": "view-session",
             "resource_id": "production-agent"}
    assert client.get("/skeleton_runs/observation", query_string=query).status_code == 401
    response = client.get("/skeleton_runs/observation", query_string=query, headers=headers)
    assert response.status_code == 200, response.get_json()
    value = response.get_json()
    (tmp_path / "producer-observation-completed.json").write_bytes(response.data)
    assert set(value) == {"schema", "run"}
    assert value["schema"] == "pupu.skeleton-run-observation.v1"
    run = value["run"]
    assert run["owner_chat_id"] == "production-chat"
    assert run["execution_id"] == "view-session" and run["root_run_id"] == "view-root"
    assert len(run["graphs"]) == 1
    graph = run["graphs"][0]
    assert graph["status"] == "completed" and graph["root_committed"] is True
    assert graph["owner_liveness"] == "unknown"
    assert all(row["state"] == "succeeded" for row in graph["nodes"])
    assert graph["document"]["id"] == "production-agent"
    from skeleton_production_state import load_launch
    launch = load_launch("view-session", "view-root", expected_owner_chat_id="production-chat")
    before = launch.journal.capture_snapshot()
    query["root_run_id"] = "view-root"
    again = client.get("/skeleton_runs/observation", query_string=query, headers=headers)
    assert again.get_json() == value
    assert launch.journal.capture_snapshot() == before
    assert len(calls) == 1
    wire = json.dumps(value)
    for secret in ("production-test-secret", "End production reply", "public Skeleton input",
                   "owner_token", "encoded_state", "input_ref", "result_ref"):
        assert secret not in wire


@pytest.mark.parametrize("patch", [
    {"owner_chat_id": "another-chat"}, {"resource_id": "another-resource"},
    {"root_run_id": "another-root"}, {"unknown": "value"},
    {"root_run_id": ""}, {"execution_id": " view-session"},
])
def test_route_fences_identity_and_unknown_fields(production, authenticated_client, patch):
    _, options, calls = production
    client, headers = authenticated_client
    _stream(client, headers, _body(options, "view-session", "view-root"))
    query = {"owner_chat_id": "production-chat", "execution_id": "view-session",
             "resource_id": "production-agent", **patch}
    result = client.get("/skeleton_runs/observation", query_string=query, headers=headers)
    if "resource_id" in patch:
        assert result.status_code == 200 and result.get_json()["run"] is None
    else:
        assert result.status_code in (400, 409), result.get_json()
    assert len(calls) == 1


def test_route_rejects_duplicate_query_and_has_no_write_method(authenticated_client):
    client, headers = authenticated_client
    query = [("owner_chat_id", "a"), ("owner_chat_id", "b"),
             ("execution_id", "session"), ("resource_id", "agent")]
    assert client.get("/skeleton_runs/observation", query_string=query, headers=headers).status_code == 400
    assert client.post("/skeleton_runs/observation", json={}, headers=headers).status_code == 405


def test_observation_pins_old_root_after_same_chat_runs_new_draft(production, authenticated_client, tmp_path):
    store, options, calls = production
    client, headers = authenticated_client
    query = {"owner_chat_id": "production-chat", "execution_id": "two-view-session",
             "resource_id": "production-agent"}
    _stream(client, headers, _body(options, "two-view-session", "view-A-root"))
    first = client.get("/skeleton_runs/observation", headers=headers, query_string=query).get_json()["run"]
    assert first["root_run_id"] == "view-A-root" and first["graphs"][0]["root_committed"]
    saved = store.get_resource("production-agent")
    next_draft = deepcopy(saved["document"])
    next_draft["nodes"][0]["label"] = "Saved B"
    store.save_draft(next_draft, expected_edit_token=saved["edit_token"])
    _stream(client, headers, _body(options, "two-view-session", "view-B-root"))
    second = client.get("/skeleton_runs/observation", headers=headers, query_string=query).get_json()["run"]
    pinned_response = client.get("/skeleton_runs/observation", headers=headers,
        query_string={**query, "root_run_id": "view-A-root"})
    assert pinned_response.status_code == 200, pinned_response.get_json()
    pinned = pinned_response.get_json()["run"]
    assert second["root_run_id"] == "view-B-root"
    assert second["graphs"][0]["document"] == next_draft
    assert pinned["root_run_id"] == first["root_run_id"]
    assert pinned["definition_digest"] == first["definition_digest"] != second["definition_digest"]
    assert pinned["graphs"][0] == first["graphs"][0]
    assert pinned["high_watermark"] == second["high_watermark"] > first["high_watermark"]
    assert len(calls) == 2  # Observation itself never invokes a model.
    (tmp_path / "producer-two-roots.json").write_text(json.dumps({
        "first": first, "second": second, "pinned_first_after_second": pinned}) + "\n")


def test_wait_pause_cancel_keep_prior_completion_and_do_not_expire(tmp_path, monkeypatch):
    _, launch, runner, effects = _setup(tmp_path, monkeypatch)
    _projection_launch(launch)
    before = launch.journal.capture_snapshot()
    view = _reader().project_launch(launch)
    root = view["graphs"][0]
    assert _nodes(root)["start"]["state"] == "succeeded"
    assert _nodes(root)["code"]["state"] == "waiting_approval"
    assert _nodes(root)["end"]["state"] == "pending"
    assert effects == [] and launch.journal.capture_snapshot() == before
    runner.pause()
    paused = _reader().project_launch(launch)["graphs"][0]
    assert paused["paused"] is True
    assert _nodes(paused)["code"]["state"] == "suspended"
    runner.cancel()
    cancelled = _reader().project_launch(launch)["graphs"][0]
    assert _nodes(cancelled)["code"]["state"] == "cancelled"
    assert _nodes(cancelled)["start"]["state"] == "succeeded"
    assert _nodes(cancelled)["end"]["state"] == "pending"
    assert cancelled["root_committed"] is False and effects == []


def test_nested_wait_uses_frozen_workflow_and_exact_parent_invocation(tmp_path, monkeypatch):
    published = PublishedWorkflow("child", "revision-1", _tool_document("child"))
    _, launch, _, effects = _setup(tmp_path, monkeypatch,
        workflow("root", call=("child", "revision-1")), [published])
    _projection_launch(launch, [published])
    before = launch.journal.capture_snapshot()
    view = _reader().project_launch(launch)
    assert len(view["graphs"]) == 2
    root, child = view["graphs"]
    assert root["parent_graph_id"] is None
    assert child["parent_graph_id"] == root["graph_id"]
    assert child["caller_node_id"] == "code"
    assert child["document"] == published.document
    assert _nodes(root)["code"]["state"] == "waiting"
    assert _nodes(child)["code"]["state"] == "waiting_approval"
    assert child["attempt_id"] != root["attempt_id"]
    assert effects == [] and launch.journal.capture_snapshot() == before
    (tmp_path / "producer-projection-nested-wait.json").write_text(json.dumps({
        "schema": "pupu.skeleton-run-observation.v1", "run": view}, ensure_ascii=False) + "\n")


def test_unregistered_child_definition_is_not_guessed_from_current_resource(tmp_path, monkeypatch):
    published = PublishedWorkflow("child", "revision-1", _tool_document("child"))
    _, launch, _, _ = _setup(tmp_path, monkeypatch,
        workflow("root", call=("child", "revision-1")), [published])
    _projection_launch(launch)  # fixed version deliberately absent
    with pytest.raises(SkeletonResourceError, match="frozen"):
        _reader().project_launch(launch)


def test_missing_private_adapter_fails_view_closed_without_execution(tmp_path, monkeypatch):
    _, launch, _, effects = _setup(tmp_path, monkeypatch)
    _projection_launch(launch)
    monkeypatch.setattr(type(launch.store), "_decode_event", None)
    with pytest.raises(SkeletonResourceError) as error:
        _reader().project_launch(launch)
    assert error.value.code == "skeleton_run_reader_unavailable"
    assert effects == []


def test_observation_accepts_nested_opaque_identifiers(tmp_path, monkeypatch):
    """Core-produced Unicode definitions and graph IDs longer than ingress IDs."""
    ids = ["中间一", "中间二", "叶子💠"]
    published = [PublishedWorkflow(ids[-1], "revision-1", _tool_document(ids[-1]))]
    for index in range(len(ids) - 2, -1, -1):
        published.append(PublishedWorkflow(ids[index], "revision-1",
            workflow(ids[index], call=(ids[index + 1], "revision-1"))))
    _, launch, _, effects = _setup(tmp_path, monkeypatch,
        workflow("root", call=(ids[0], "revision-1")), published)
    _projection_launch(launch, published)
    before = launch.journal.capture_snapshot()
    view = _reader().project_launch(launch)
    assert len(view["graphs"]) == 4
    assert view["graphs"][-1]["document"]["id"] == ids[-1]
    assert len(view["graphs"][-1]["graph_id"]) > 200
    assert effects == [] and launch.journal.capture_snapshot() == before
    (tmp_path / "producer-projection-opaque-identities.json").write_text(json.dumps({
        "schema": "pupu.skeleton-run-observation.v1", "run": view}, ensure_ascii=False) + "\n")


def test_real_route_receipt_recorded_is_not_still_awaiting_approval(production, authenticated_client, monkeypatch, tmp_path):
    options, effects, calls = _approval_fixture(production, monkeypatch)
    client, headers = authenticated_client
    _stream(client, headers, _body(options, "view-wait-session", "view-wait-root"))
    query = {"owner_chat_id": "production-chat", "execution_id": "view-wait-session",
             "resource_id": "production-agent", "root_run_id": "view-wait-root"}
    from skeleton_production_state import load_launch
    launch = load_launch("view-wait-session", "view-wait-root")
    for index in range(2):
        before = launch.journal.capture_snapshot()
        response = client.get("/skeleton_runs/observation", query_string=query, headers=headers)
        assert response.status_code == 200, response.get_json()
        root = response.get_json()["run"]["graphs"][0]
        waiting = [row for row in root["nodes"] if row["state"] == "waiting_approval"]
        assert len(waiting) == 1
        assert launch.journal.capture_snapshot() == before
        (tmp_path / f"producer-observation-approval-{index}.json").write_bytes(response.data)
        interaction = waiting[0]["interaction_id"]
        receipt = _confirm(client, headers, "view-wait-session", interaction)
        assert receipt.status_code == 200
        after_receipt = launch.journal.capture_snapshot()
        response = client.get("/skeleton_runs/observation", query_string=query, headers=headers)
        assert response.status_code == 200, response.get_json()
        nodes = _nodes(response.get_json()["run"]["graphs"][0])
        assert nodes[waiting[0]["node_id"]]["state"] == "waiting"
        assert nodes[waiting[0]["node_id"]]["phase"] == "receipt_recorded"
        assert launch.journal.capture_snapshot() == after_receipt
        assert effects == [f"effect-{i}" for i in range(index)]
        (tmp_path / f"producer-observation-receipt-{index}.json").write_bytes(response.data)
        _stream(client, headers, _body(options, "view-wait-session", f"view-wait-resume-{index}",
            mode="resume_interaction", interaction_id=interaction, source_attempt_id="view-wait-root"))
    final = client.get("/skeleton_runs/observation", query_string=query, headers=headers)
    assert final.status_code == 200 and final.get_json()["run"]["graphs"][0]["root_committed"] is True
    assert effects == ["effect-0", "effect-1"] and len(calls) == 3


@pytest.mark.parametrize("fault", ["caller", "ancestor_definition", "missing_parent"])
def test_real_core_child_with_bad_ancestry_is_rejected(tmp_path, monkeypatch, fault):
    _, launch, _, effects = _setup(tmp_path, monkeypatch)
    child = PublishedWorkflow("child", "revision-1", _tool_document("child"))
    _projection_launch(launch, [child])
    parent = launch.store.load().state
    stack = deepcopy(parent["call_stack"])
    stack[-1]["caller_node_invocation_id"] = parent["active"]["node_invocation_id"]
    if fault == "caller":
        stack[-1]["caller_node_invocation_id"] = "node.not-the-caller"
    if fault == "ancestor_definition":
        stack[-1]["definition_digest"] = "0" * 64
    if fault == "missing_parent":
        stack.append({"execution_id": "session", "graph_invocation_id": "missing-parent",
                      "attempt_id": "missing-parent-attempt", "definition_id": "missing",
                      "definition_digest": "0" * 64, "caller_node_invocation_id": "node.missing"})
    plan = prepare_workflow(child.document)
    attempt = AttemptRef(launch.store.attempt.generation, "extra-child")
    store = WorkflowExecutionStore(launch.journal, plan, graph_id="extra-child", attempt=attempt)
    stack.append({"execution_id": "session", "graph_invocation_id": "extra-child",
                  "attempt_id": attempt.attempt_id, "definition_id": "child",
                  "definition_digest": execution_definition_digest(plan)})
    DurableWorkflowRunner(store, {}).create({"value": "input"}, call_stack=stack)
    before = launch.journal.capture_snapshot()
    with pytest.raises(SkeletonResourceError) as error:
        _reader().project_launch(launch)
    assert error.value.code == "skeleton_run_observation_invalid"
    expected = {"caller": "Recorded child does not belong to the preceding caller invocation.",
                "ancestor_definition": "Recorded child lineage disagrees with its parent.",
                "missing_parent": "Recorded child lineage has no parent."}
    assert str(error.value) == expected[fault]
    assert launch.journal.capture_snapshot() == before and effects == []


def test_running_and_sealed_result_are_not_completed_or_verified_live(tmp_path, monkeypatch):
    observed = []
    def handler(_context, inputs):
        observed.append(_reader().project_launch(launch))
        return WorkflowNodeCompleted(inputs)
    launch, runner = _bare_launch(tmp_path, workflow(), {"code": handler})
    original = launch.store.save
    def observe_seal(*args, **kwargs):
        result = original(*args, **kwargs)
        if result.state["status"] == "result_received":
            observed.append(_reader().project_launch(launch))
        return result
    monkeypatch.setattr(launch.store, "save", observe_seal)
    assert runner.run().status == "completed"
    phases = [_nodes(view["graphs"][0])["code"] for view in observed]
    assert any(row["state"] == "running" and row["phase"] == "running" for row in phases)
    assert any(row["state"] == "running" and row["phase"] == "result_received" for row in phases)
    assert all(view["graphs"][0]["owner_liveness"] == "unknown" for view in observed)
    for index, view in enumerate(observed):
        (tmp_path / f"producer-projection-inflight-{index}.json").write_text(json.dumps({
            "schema": "pupu.skeleton-run-observation.v1", "run": view}) + "\n")
    final = _reader().project_launch(launch)["graphs"][0]
    assert _nodes(final)["code"]["state"] == "succeeded"
    assert final["root_committed"] is False  # graph output is not a chat reply commit


def test_unknown_handler_effect_is_not_relabelled_as_failure_or_cancel(tmp_path):
    effects = []
    def handler(_context, _inputs):
        effects.append("effect-before-unknown")
        raise RuntimeError("no result receipt")
    launch, runner = _bare_launch(tmp_path, workflow(), {"code": handler})
    assert runner.run().status == "outcome_unknown"
    before = launch.journal.capture_snapshot()
    graph = _reader().project_launch(launch)["graphs"][0]
    assert _nodes(graph)["start"]["state"] == "succeeded"
    assert _nodes(graph)["code"]["state"] == "outcome_unknown"
    assert _nodes(graph)["end"]["state"] == "pending"
    assert graph["root_committed"] is False and effects == ["effect-before-unknown"]
    assert launch.journal.capture_snapshot() == before
    (tmp_path / "producer-projection-unknown.json").write_text(json.dumps({
        "schema": "pupu.skeleton-run-observation.v1", "run": _reader().project_launch(launch)}) + "\n")


def test_failed_end_keeps_completed_node_output_and_unseen_nodes_honest(tmp_path):
    document = workflow()
    document["nodes"][-1]["config"]["execution"]["outputs"] = [output("value", "input", ["value", "missing"])]
    launch, runner = _bare_launch(tmp_path, document,
        {"code": lambda _context, inputs: WorkflowNodeCompleted(inputs)})
    assert runner.run().status == "failed"
    graph = _reader().project_launch(launch)["graphs"][0]
    assert _nodes(graph)["start"]["state"] == "succeeded"
    assert _nodes(graph)["code"]["state"] == "succeeded"
    assert _nodes(graph)["end"]["state"] == "failed"
    assert graph["root_committed"] is False
    (tmp_path / "producer-projection-failed-end.json").write_text(json.dumps({
        "schema": "pupu.skeleton-run-observation.v1", "run": _reader().project_launch(launch)}) + "\n")


def test_projection_captures_one_prefix_and_never_saves(tmp_path, monkeypatch):
    _, launch, _, effects = _setup(tmp_path, monkeypatch)
    _projection_launch(launch)
    original = type(launch.journal).capture_snapshot
    captures = []
    def capture(journal):
        captures.append(journal)
        return original(journal)
    monkeypatch.setattr(type(launch.journal), "capture_snapshot", capture)
    monkeypatch.setattr(WorkflowExecutionStore, "save", lambda *_args, **_kwargs: pytest.fail("observation wrote graph state"))
    _reader().project_launch(launch)
    assert captures == [launch.journal] and effects == []


@pytest.mark.parametrize("kind,outlet", [("if", "true"), ("switch", "case-1")])
def test_real_branch_receipt_skips_edges_not_shared_downstream_nodes(production, authenticated_client, kind, outlet):
    from test_skeleton_branch_delivery import DOCUMENTS
    _, options, calls = production
    document = deepcopy(DOCUMENTS[kind])
    from skeleton_resource_store import SkeletonResourceStore
    SkeletonResourceStore().save_draft(document)
    options["skeleton_selection"]["resource_id"] = document["id"]
    options["skeleton_credentials"] = {"openai": {"provider": "openai", "endpoint": "https://api.openai.com/v1",
                                                  "api_key": "production-test-secret"}}
    client, headers = authenticated_client
    _stream(client, headers, _body(options, f"view-branch-{kind}", f"view-branch-root-{kind}"))
    result = client.get("/skeleton_runs/observation", headers=headers, query_string={
        "owner_chat_id": "production-chat", "execution_id": f"view-branch-{kind}", "resource_id": document["id"]})
    assert result.status_code == 200, result.get_json()
    graph = result.get_json()["run"]["graphs"][0]
    branch = next(node for node in document["nodes"] if node["type"] in {"if_else", "switch_case"})
    unselected = next(edge for edge in document["edges"] if edge["source_node_id"] == branch["id"]
                      and edge["source_port_id"] == outlet)
    assert unselected["id"] in graph["skipped_edges"]
    end = next(node for node in document["nodes"] if node["type"] == "end")
    assert _nodes(graph)[end["id"]]["state"] == "succeeded"
    assert not any(node["state"] == "skipped" for node in graph["nodes"])
    assert len(calls) == 1


def test_completed_fast_children_with_same_definition_keep_distinct_invocations(tmp_path):
    child = PublishedWorkflow("child", "revision-1", workflow("child"))
    document = workflow("parent", call=("child", "revision-1"))
    again = deepcopy(document["nodes"][1])
    again["id"] = "again"
    again["config"]["execution"]["inputs"][0]["value"]["node_id"] = "code"
    document["nodes"].insert(2, again)
    document["nodes"][-1]["config"]["execution"]["inputs"][0]["value"]["node_id"] = "again"
    document["edges"][1]["target_node_id"] = "again"
    document["edges"].append({"id": "c", "kind": "flow", "source_node_id": "again", "source_port_id": "out",
                              "target_node_id": "end", "target_port_id": "in"})
    launch, runner = _bare_launch(tmp_path, document, {})
    _projection_launch(launch, [child])
    runner.handlers["workflow_call"] = SkeletonWorkflowCallRuntime(launch.store, lambda _wid, _rev: child,
        handlers={"code": lambda _context, inputs: WorkflowNodeCompleted(inputs)})
    assert runner.run().status == "completed"
    graphs = _reader().project_launch(launch)["graphs"]
    assert len(graphs) == 3 and all(graph["status"] == "completed" for graph in graphs)
    assert graphs[1]["document"] == graphs[2]["document"] == child.document
    assert graphs[1]["graph_id"] != graphs[2]["graph_id"]
    assert graphs[1]["attempt_id"] != graphs[2]["attempt_id"]
    assert {graph["caller_node_id"] for graph in graphs[1:]} == {"code", "again"}


def _native_waiting_launch(tmp_path, monkeypatch, kind):
    from test_skeleton_agent_runtime import (
        _bridge, _parent_with_pool, _host_execution, _StrictOpenAIClient, _handoff_response,
        _approval_tool_response, _agent_document, _document_with_hook_pool, _before_hook_execution_workflow,
    )
    from test_skeleton_production_interactions import _api, _install_actual_launch
    from unchain.execution import ExecutionRuntime
    from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
    from unchain.tools import Tool, Toolkit
    from unchain.skeleton import prepare_agent_graph
    from unchain.skeleton.tool_runtime import SkeletonToolRuntime
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path / "host-data"))
    bridge = _bridge(tmp_path, monkeypatch, execution_id="native-observation")
    effects, manifests = [], []
    if kind == "subagent":
        plan, manifests = _parent_with_pool()
        responses = [_handoff_response(), _approval_tool_response()]
    else:
        document = _document_with_hook_pool(_agent_document())
        body = _before_hook_execution_workflow("owned-policy")
        body["nodes"][1].update(type="tool_call", config={
            "tool": {"name": "hook_decision", "on_error": "stop", "approval_timeout_ms": 30000},
            "execution": {"inputs": [{"name": "value", "value": {"kind": "ref", "node_id": "start",
                "path": ["arguments", "value"]}, "missing": "error"}],
                "outputs": [output(name, "result", ["result", name]) for name in ("decision", "require_approval", "arguments")]}})
        pool = next(node for node in document["nodes"] if node["type"] == "hooks_pool")
        pool["config"]["hooks"][0]["workflow"] = {"kind": "embedded", "document": body}
        plan = prepare_agent_graph(document)
        responses = [_approval_tool_response()]
    client = _StrictOpenAIClient(responses)
    toolkit = Toolkit()
    @toolkit.tool(name="hook_decision", requires_confirmation=True)
    def hook_decision(value: str):
        effects.append(value)
        return {"decision": "continue", "require_approval": False, "arguments": {"value": value}}
    tool = Tool.from_callable(lambda value: effects.append(value) or value,
                             name="dangerous_tool", requires_confirmation=kind == "subagent")
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store), tools_for_node=lambda _context: (tool,),
            subagent_manifests=manifests,
            hook_workflow_resolver=lambda *_args: pytest.fail("An owned Hook must not read an external Workflow"),
            child_handlers_factory=lambda _store, child_plan: {"tool_call": SkeletonToolRuntime(
                child_plan, toolkit, bridge.execution_id, lambda: 100)})
        execution.create({})
        result, _ = execution.run(original_task="observe native waiting")
    assert result.status == "waiting", result.error
    launch = _install_actual_launch(_api(), monkeypatch, execution, bridge, manifests=manifests)
    _projection_launch(launch)
    return launch, effects, client, len(responses)


@pytest.mark.parametrize("kind", ["subagent", "embedded_hook"])
def test_real_native_subagent_and_embedded_hook_are_discovered(tmp_path, monkeypatch, kind):
    launch, effects, client, expected_calls = _native_waiting_launch(tmp_path, monkeypatch, kind)
    before = launch.journal.capture_snapshot()
    view = _reader().project_launch(launch)
    assert len(view["graphs"]) == 2
    root, child = view["graphs"]
    assert child["parent_graph_id"] == root["graph_id"]
    assert child["call_stack"][0]["caller_node_invocation_id"] == launch.store.load().state["active"]["node_invocation_id"]
    assert any(node["state"] == "waiting_approval" for node in child["nodes"])
    assert any(node["state"] == "waiting" for node in root["nodes"])
    assert effects == [] and len(client.requests) == expected_calls
    assert launch.journal.capture_snapshot() == before
    (tmp_path / f"producer-projection-{kind}.json").write_text(json.dumps({
        "schema": "pupu.skeleton-run-observation.v1", "run": view}) + "\n")
    if kind == "embedded_hook":
        # The parent owns the canonical reply; the Hook leaf has its own
        # request ID. An answer must not become a second human obligation.
        import skeleton_production_interactions as api
        monkeypatch.setattr(api.time, "time_ns", lambda: 1000 * 1_000_000)
        pending = api.resolve_pending_skeleton_interaction(launch.descriptor["session_id"])
        answer = api.record_skeleton_interaction_receipt(session_id=launch.descriptor["session_id"],
            interaction_id=pending.request.interaction_id, approved=True)
        assert answer["disposition"] == "receipt_recorded"
        answered = _reader().project_launch(launch)
        assert not any(node["state"] == "waiting_approval" for graph in answered["graphs"] for node in graph["nodes"])
        assert any(node["phase"] == "receipt_recorded_upstream" for node in answered["graphs"][1]["nodes"])
        assert effects == [] and len(client.requests) == expected_calls
        (tmp_path / "producer-projection-hook-upstream-receipt.json").write_text(json.dumps({
            "schema": "pupu.skeleton-run-observation.v1", "run": answered}) + "\n")


def test_receipt_appended_after_prefix_only_appears_on_next_read(tmp_path, monkeypatch):
    # The imported helper does not bring its module's autouse guard fixture.
    # Receipt admission uses the real registry, scoped to this test's directory.
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path / "host-data"))
    api, launch, _, effects = _setup(tmp_path, monkeypatch)
    _projection_launch(launch)
    monkeypatch.setattr(api.time, "time_ns", lambda: 1000 * 1_000_000)
    interaction = launch.store.load().state["active"]["wait"]["id"]
    original = type(launch.journal).capture_snapshot
    fired = []
    def capture(journal):
        prefix = original(journal)
        if not fired:
            fired.append(True)
            reply = api.record_skeleton_interaction_receipt(session_id="session", interaction_id=interaction, approved=True)
            assert reply["disposition"] == "receipt_recorded"
        return prefix
    monkeypatch.setattr(type(launch.journal), "capture_snapshot", capture)
    first = _reader().project_launch(launch)
    second = _reader().project_launch(launch)
    assert _nodes(first["graphs"][0])["code"]["state"] == "waiting_approval"
    assert _nodes(second["graphs"][0])["code"]["phase"] == "receipt_recorded"
    assert first["graphs"][0]["revision"] == second["graphs"][0]["revision"]
    assert first["high_watermark"] < second["high_watermark"]
    assert effects == []


def test_foreign_attempt_resolution_cannot_answer_this_wait(tmp_path, monkeypatch):
    from unchain.context import ArtifactService
    from unchain.context.projector import CanonicalSemanticEventProjector
    from unchain.journal import DurableEventSink
    from memory_v2_unchain_run_binding import _sanitize_artifact, _sanitize_event_payload
    _, launch, _, effects = _setup(tmp_path, monkeypatch)
    _projection_launch(launch)
    interaction = launch.store.load().state["active"]["wait"]["id"]
    foreign = AttemptRef(launch.store.attempt.generation, "foreign-attempt")
    projector = CanonicalSemanticEventProjector(attempt=foreign,
        artifacts=ArtifactService(launch.journal, sanitizer=_sanitize_artifact), payload_sanitizer=_sanitize_event_payload)
    # Genuine Core-produced resolution bytes, deliberately a different source.
    prepared = projector.prepare_interaction_resolution(interaction_id=interaction,
        response={"approved": True}, submitted_by="user")
    DurableEventSink(launch.journal, foreign, projector).append_prepared(prepared)
    graph = _reader().project_launch(launch)["graphs"][0]
    assert _nodes(graph)["code"]["state"] == "waiting_approval" and effects == []


def test_child_completing_after_callers_result_is_rejected(tmp_path):
    child = PublishedWorkflow("child", "revision-1", workflow("child"))
    document = workflow("parent", call=("child", "revision-1"))
    child_runners = []
    def early_parent_result(context, inputs):
        parent = launch.store.load().state
        plan = prepare_workflow(child.document)
        attempt = AttemptRef(launch.store.attempt.generation, "late-child")
        store = WorkflowExecutionStore(launch.journal, plan, graph_id="late-child", attempt=attempt)
        stack = deepcopy(parent["call_stack"])
        stack[-1]["caller_node_invocation_id"] = context.node_invocation_id
        stack.append({"execution_id": attempt.generation.execution_id, "graph_invocation_id": store.graph_id,
                      "attempt_id": attempt.attempt_id, "definition_id": plan.document_id,
                      "definition_digest": execution_definition_digest(plan)})
        runner = DurableWorkflowRunner(store, {"code": lambda _context, child_inputs: WorkflowNodeCompleted(child_inputs)})
        runner.create(inputs, call_stack=stack)
        child_runners.append(runner)
        return WorkflowNodeCompleted(inputs)
    launch, runner = _bare_launch(tmp_path, document, {"workflow_call": early_parent_result})
    _projection_launch(launch, [child])
    assert runner.run().status == "completed"
    assert child_runners[0].run().status == "completed"
    with pytest.raises(SkeletonResourceError, match="Child completion is not before its caller"):
        _reader().project_launch(launch)


@pytest.mark.parametrize("foreign", ["root", "generation"])
def test_foreign_root_or_generation_does_not_paint_selected_run(tmp_path, monkeypatch, foreign):
    _, launch, _, _ = _setup(tmp_path, monkeypatch)
    _projection_launch(launch)
    generation = launch.store.attempt.generation if foreign == "root" else GenerationRef("session", "foreign-generation")
    store = WorkflowExecutionStore(launch.journal, launch.plan, graph_id="another-root",
        attempt=AttemptRef(generation, "another-attempt"))
    DurableWorkflowRunner(store, {}).create({"value": "other input"})
    view = _reader().project_launch(launch)
    assert [graph["graph_id"] for graph in view["graphs"]] == [launch.store.graph_id]


@pytest.mark.parametrize("mode", ["old_empty", "contradictory"])
def test_branch_receipt_compatibility_and_contradiction(tmp_path, mode):
    from test_skeleton_branch_delivery import DOCUMENTS
    document = deepcopy(DOCUMENTS["if"])
    launch, _ = _bare_launch(tmp_path, document, {}, inputs={"message": "route this"})
    class BranchReceiptProducer(DurableWorkflowRunner):
        # A bounded producer variant to create old/hostile content with REAL
        # Core artifact/Journal validation, not a stub of the observer.
        def _commit_node(self, record, node_id, resolved, result, port, *refs):
            if self.nodes[node_id]["type"] == "if_else":
                result = {} if mode == "old_empty" else {
                    **result, "skipped_edges": [{"edge_id": result["selected_edge_id"], "status": "skipped"}]}
            return super()._commit_node(record, node_id, resolved, result, port, *refs)
    runner = BranchReceiptProducer(launch.store, {"agent": lambda _context, _inputs:
        WorkflowNodeCompleted({"message": "no thanks", "context": {}})})
    assert runner.run().status == "completed"
    if mode == "old_empty":
        view = _reader().project_launch(launch)
        assert view["graphs"][0]["skipped_edges"] == []
    else:
        with pytest.raises(SkeletonResourceError, match="recorded skipped edges are invalid"):
            _reader().project_launch(launch)


def test_oversized_view_is_refused_without_partial_graphs_or_effects(tmp_path, monkeypatch):
    _, launch, _, effects = _setup(tmp_path, monkeypatch)
    _projection_launch(launch)
    monkeypatch.setattr(_reader(), "MAX_VIEW_BYTES", 1, raising=False)
    before = launch.journal.capture_snapshot()
    with pytest.raises(SkeletonResourceError) as error:
        _reader().project_launch(launch)
    assert error.value.code == "skeleton_run_view_limit"
    assert launch.journal.capture_snapshot() == before and effects == []


@pytest.mark.parametrize("field", ["hook_id", "workflow_id", "revision_id", "definition_digest", "call_id"])
def test_hook_metadata_must_match_frozen_binding(tmp_path, monkeypatch, field):
    from dataclasses import replace
    from unchain.interaction import build_interaction_request
    launch, effects, client, expected_calls = _native_waiting_launch(tmp_path, monkeypatch, "embedded_hook")
    reader = _reader()
    snapshot, graphs = reader._read_verified_execution_graphs(launch)
    store, chain = graphs[launch.store.graph_id]
    changed_state = deepcopy(chain[-1].state)
    target = changed_state["active"]["wait"]["request_ref"]
    value = store.read_json(target)
    raw = value["subject"]["hook_child_wait"]
    if field == "call_id":
        raw["parent_tool_call"]["call_id"] = "not-the-captured-tool-call"
    else:
        raw[field] = "0" * 64 if field == "definition_digest" else "not-the-frozen-binding"
    value = build_interaction_request(**{key: value[key] for key in (
        "session_id", "kind", "source_run_id", "occurrence", "payload", "response_contract", "created_revision", "subject")}).to_dict()
    changed_state["active"]["wait"]["id"] = value["interaction_id"]
    # Challenge the BUSINESS boundary after the separately tested Core
    # integrity adapter: request hash/ID and active wait are consistent. No
    # physical-Journal forgery or valid public-ingress claim is made here.
    changed_chain = (*chain[:-1], replace(chain[-1], state=changed_state))
    modified_graphs = {**graphs, store.graph_id: (store, changed_chain)}
    original = store.read_json
    monkeypatch.setattr(store, "read_json", lambda ref: deepcopy(value) if ref == target else original(ref))
    monkeypatch.setattr(reader, "_read_verified_execution_graphs", lambda _launch: (snapshot, modified_graphs))
    before = launch.journal.capture_snapshot()
    with pytest.raises(SkeletonResourceError) as error:
        _reader().project_launch(launch)
    assert error.value.code == "skeleton_run_observation_invalid"
    assert effects == [] and len(client.requests) == expected_calls
    assert launch.journal.capture_snapshot() == before


def test_hook_validation_cannot_read_new_prefix_or_write(tmp_path, monkeypatch):
    launch, effects, client, expected_calls = _native_waiting_launch(tmp_path, monkeypatch, "embedded_hook")
    original = type(launch.journal).capture_snapshot
    captures = []
    def capture(journal):
        captures.append(journal)
        assert len(captures) == 1, "Hook validation acquired a newer live prefix"
        return original(journal)
    monkeypatch.setattr(type(launch.journal), "capture_snapshot", capture)
    for name in ("read", "append", "append_with_artifacts"):
        monkeypatch.setattr(type(launch.journal), name,
            lambda *_args, **_kwargs: pytest.fail("Hook view reached a write or live paged read"))
    view = _reader().project_launch(launch)
    assert len(view["graphs"]) == 2 and captures == [launch.journal]
    assert effects == [] and len(client.requests) == expected_calls


def test_prefix_capability_enforces_bounds_and_rejects_mutations(tmp_path, monkeypatch):
    _, launch, _, effects = _setup(tmp_path, monkeypatch)
    snapshot = launch.journal.capture_snapshot()
    prefix = _reader()._PrefixJournal(launch.journal, snapshot)
    assert prefix.capture_snapshot() is snapshot
    for operation in (lambda: prefix.capture_snapshot(max_events=1),
                      lambda: prefix.capture_snapshot(max_bytes=1),
                      lambda: prefix.capture_snapshot(max_events=True),
                      lambda: prefix.read(), lambda: prefix.append(request=None),
                      lambda: prefix.append_with_artifacts(request=None, artifacts=())):
        with pytest.raises(SkeletonResourceError) as error:
            operation()
        assert error.value.code == "skeleton_run_reader_unavailable"
    assert effects == [] and launch.journal.capture_snapshot() == snapshot
