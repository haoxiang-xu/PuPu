"""The public v4 message, not only a private exception path, names the step."""
from types import SimpleNamespace

import pytest

from durable_interaction_host import DurableInteractionHostError
from skeleton_production_chat import _raise_execution_failure
from test_skeleton_resource_store import workflow
from unchain.skeleton import prepare_workflow


def test_checked_node_identity_and_code_are_public_without_tool_contents():
    document = workflow("public-failure")
    document["nodes"][1].update(type="tool_call", config={
        "tool": {"name": "write", "on_error": "stop", "approval_timeout_ms": 1000},
        "execution": {"inputs": [], "outputs": []}})
    plan = prepare_workflow(document)
    path = ["execution", "nodes", 1]
    result = SimpleNamespace(status="failed", error={"code": "tool_failed", "path": path,
                                                    "message": "PRIVATE TOOL CONTENT /private/path"})
    with pytest.raises(DurableInteractionHostError) as caught:
        _raise_execution_failure(result, plan)
    assert str(caught.value) == "Tool Call node 'code' did not complete safely (tool_failed)."
    assert caught.value.code == "tool_failed" and caught.value.path == tuple(path)
    assert "PRIVATE" not in str(caught.value) and "/private/path" not in str(caught.value)


def test_unscoped_unknown_outcome_is_not_falsely_assigned_to_a_node():
    plan = prepare_workflow(workflow("unscoped-failure"))
    result = SimpleNamespace(status="outcome_unknown", error=None)
    with pytest.raises(DurableInteractionHostError) as caught:
        _raise_execution_failure(result, plan)
    assert str(caught.value) == "Skeleton execution did not complete safely (skeleton_execution_outcome_unknown)."
    assert "node '" not in str(caught.value)
