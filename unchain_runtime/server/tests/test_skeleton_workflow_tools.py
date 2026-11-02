"""#356: explicit fixed Workflows exposed through the real Tool boundary.

These are adapter/contract tests. Public chat/HTTP/App qualification is separate;
an injected child runner here is never reported as that integration evidence.
"""
from copy import deepcopy
import json
from types import SimpleNamespace

import pytest

from unchain.journal import AttemptRef, GenerationRef
from unchain.kernel.types import ToolCall
from unchain.persistence import SQLiteContextV2Store
from unchain.skeleton import prepare_workflow
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.workflow_runtime import PublishedWorkflow
from unchain.tools import Toolkit, Tool

from skeleton_resource_store import SkeletonResourceError
from skeleton_workflow_tools import (
    attached_workflow_tools,
    build_workflow_tool,
    resolve_workflow_tool,
    workflow_tool_entries,
)


def workflow():
    return {
        "schema_version": 1, "kind": "workflow", "id": "echo", "name": "Echo",
        "nodes": [
            {"id": "start", "type": "start", "config": {"execution": {"outputs": [
                {"name": "value", "source": {"kind": "result", "path": ["value"]}},
            ]}}},
            {"id": "end", "type": "end", "config": {"execution": {
                "inputs": [{"name": "value", "value": {"kind": "ref", "node_id": "start", "path": ["value"]}, "missing": "error"}],
                "outputs": [{"name": "value", "source": {"kind": "input", "path": ["value"]}}],
            }}},
        ],
        "edges": [{"id": "s-e", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"}],
    }


def entry():
    return {"id": "echo", "workflow": {"workflow_id": "echo", "revision_id": "rev-1"}}


def document():
    # Scope extraction consumes already admitted graph structure; this fixture
    # deliberately supplies only the fields used by that pure extraction.
    return {"id": "parent", "nodes": [
        {"id": "a", "type": "agent", "config": {}},
        {"id": "b", "type": "agent", "config": {}},
        {"id": "pool", "type": "toolkit_pool", "config": {
            "toolkits": [], "merge_with_user_selected": False, "workflow_tools": [entry()],
        }},
    ], "edges": [{"kind": "attach", "source_node_id": "a", "target_node_id": "pool"}]}


def binding(body=None, resolver=None):
    return resolve_workflow_tool("pool", entry(), resolver or (
        lambda wid, rev: PublishedWorkflow(wid, rev, body or workflow())))


def test_scope_is_explicit_and_does_not_alias_document():
    doc = document()
    result = attached_workflow_tools(doc)
    assert set(result) == {"a"}
    assert result["a"] == [("pool", entry())]
    result["a"][0][1]["id"] = "changed"
    assert doc == document()
    assert list(workflow_tool_entries(doc)) == [(2, 0, entry())]


@pytest.mark.parametrize("value,code", [
    (None, "invalid_type"), ({}, "invalid_type"),
    ([None], "invalid_shape"), ([{**entry(), "latest": True}], "invalid_shape"),
    ([{**entry(), "id": ""}], "invalid_value"),
    ([{**entry(), "id": "bad.name"}], "invalid_value"),
    ([{**entry(), "id": "é"}], "invalid_value"),
    ([{**entry(), "id": "a" * 49}], "invalid_value"),
    ([{**entry(), "workflow": {"workflow_id": "echo", "revision_id": ""}}], "invalid_value"),
    ([{**entry(), "workflow": {**entry()["workflow"], "latest": True}}], "invalid_shape"),
    ([entry(), entry()], "duplicate_identity"),
])
def test_bad_entries_fail_at_their_saved_path(value, code):
    doc = document()
    doc["nodes"][2]["config"]["workflow_tools"] = value
    with pytest.raises(SkeletonResourceError) as caught:
        list(workflow_tool_entries(doc))
    assert caught.value.code == code
    assert caught.value.path[:5] == ("document", "nodes", 2, "config", "workflow_tools")


def test_absence_is_not_an_implicit_selection_and_duplicate_scope_is_refused():
    doc = document()
    del doc["nodes"][2]["config"]["workflow_tools"]
    assert list(workflow_tool_entries(doc)) == []
    assert attached_workflow_tools(doc) == {}
    doc = document()
    other = deepcopy(doc["nodes"][2]); other["id"] = "other"
    doc["nodes"].append(other)
    doc["edges"].append({"kind": "attach", "source_node_id": "a", "target_node_id": "other"})
    with pytest.raises(SkeletonResourceError, match="same tool name"):
        attached_workflow_tools(doc)
    doc["edges"][-1]["source_node_id"] = "b"
    assert set(attached_workflow_tools(doc)) == {"a", "b"}


@pytest.mark.parametrize("wrong", ["workflow_id", "revision_id", "kind", "document_id", "type"])
def test_fixed_resolver_identity_is_checked_before_exposure(wrong):
    def resolve(wid, rev):
        body = workflow()
        if wrong == "kind": body["kind"] = "agent"
        if wrong == "document_id": body["id"] = "other"
        return ({} if wrong == "type" else PublishedWorkflow(
            "other" if wrong == "workflow_id" else wid,
            "rev-2" if wrong == "revision_id" else rev, body))
    with pytest.raises(SkeletonResourceError):
        binding(resolver=resolve)


def test_real_tool_schema_and_real_durable_workflow_end(tmp_path):
    selected = binding()
    calls = []
    def run_child(fixed, inputs, call, execution_context):
        calls.append((fixed, deepcopy(inputs), call, execution_context))
        journal = SQLiteContextV2Store(database_path=tmp_path / "runtime.sqlite3",
            object_directory=tmp_path / "objects").bind_execution("tool-session")
        child = WorkflowExecutionStore(journal, fixed.plan, graph_id="child",
            attempt=AttemptRef(GenerationRef("tool-session", "generation"), "child-attempt"))
        runner = DurableWorkflowRunner(child, {})
        runner.create(inputs)
        result = runner.run()
        assert result.status == "completed"
        return result.outputs
    module = build_workflow_tool(selected, run_child, session_id="tool-session", node_attempt_id="node")
    tool = module.tool
    assert type(tool) is Tool
    assert tool.to_json()["name"] == "workflow_echo"
    assert tool.to_json()["parameters"]["required"] == ["inputs"]
    assert tool.to_json()["parameters"]["properties"]["inputs"]["type"] == "object"
    start_schema = json.loads(tool.to_json()["parameters"]["properties"]["inputs"]["description"].partition("Start reads: ")[2])
    assert start_schema == {
        "type": "object", "properties": {"value": {}}, "required": ["value"], "additionalProperties": False,
    }
    assert "rev-1" in tool.description and "value" in tool.description
    context = SimpleNamespace(session_id="tool-session", run_id="node", provider="openai", model="model",
        iteration=0, toolkit=Toolkit({tool.name: tool}))
    outcome = module.execute(tool_call=ToolCall("call", tool.name, {"inputs": {"value": {"nested": [1, False]}}}),
        context=context)
    assert outcome.tool_result == {"value": {"nested": [1, False]}}
    assert len(calls) == 1
    assert calls[0][0].workflow_id == "echo" and calls[0][0].revision_id == "rev-1"


def test_whole_input_start_keeps_additional_keys_and_binding_is_a_snapshot():
    body = workflow()
    body["nodes"][0]["config"]["execution"]["outputs"].append(
        {"name": "all", "source": {"kind": "result", "path": []}})
    fixed = binding(body)
    body["nodes"][0]["config"]["execution"]["outputs"] = []
    tool = build_workflow_tool(fixed, lambda *_: {}, session_id="s", node_attempt_id="n").tool
    start_schema = json.loads(tool.to_json()["parameters"]["properties"]["inputs"]["description"].partition("Start reads: ")[2])
    assert start_schema["additionalProperties"] is True
    assert start_schema["required"] == ["value"]


@pytest.mark.parametrize("change", ["session", "run", "call", "tool", "arguments", "extra"])
def test_wrong_invocation_is_refused_before_child_dispatch(change):
    calls = []
    module = build_workflow_tool(binding(), lambda *args: calls.append(args), session_id="s", node_attempt_id="n")
    tool = module.tool
    call = {"call_id": "" if change == "call" else "call",
        "name": "other" if change == "tool" else tool.name, "arguments": {"inputs": {"value": 1}}}
    context = SimpleNamespace(session_id="other" if change == "session" else "s",
        run_id="other" if change == "run" else "n", provider="openai", model="m", iteration=0,
        toolkit=Toolkit({tool.name: tool}))
    if change == "arguments": call["arguments"] = []
    if change == "extra": call["arguments"]["extra"] = True
    with pytest.raises(SkeletonResourceError):
        module.execute(tool_call=ToolCall(**call), context=context)
    assert calls == []
