"""Real Store/Flask and Tool consumers of the declared Workflow signature."""
import json
import os
from pathlib import Path

import pytest
import app
from unchain.skeleton import prepare_workflow, run_workflow
from skeleton_workflow_tools import _input_schema
from skeleton_resource_store import SkeletonResourceStore, SkeletonResourceError
from skeleton_runtime_capability import require_skeleton_runtime


def workflow():
    return {"schema_version": 1, "kind": "workflow", "id": "parameters", "name": "Parameters",
        "input_schema": {"type": "object", "properties": {
            "city": {"type": "string"}, "days": {"type": "integer", "default": 1}},
            "required": ["city"], "additionalProperties": False},
        "nodes": [{"id": "start", "type": "start", "config": {"execution": {"outputs": [
            {"name": "args", "source": {"kind": "result", "path": []}}]}}},
            {"id": "end", "type": "end", "config": {"execution": {"inputs": [
                {"name": "args", "value": {"kind": "ref", "node_id": "start", "path": ["args"]}, "missing": "error"}],
                "outputs": [{"name": "args", "source": {"kind": "input", "path": ["args"]}}]}}}],
        "edges": [{"id": "s-e", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"}]}


def test_workflow_tool_uses_the_declared_schema_and_retains_legacy_projection():
    doc = workflow()
    assert _input_schema(prepare_workflow(doc)) == doc["input_schema"]
    del doc["input_schema"]
    assert _input_schema(prepare_workflow(doc)) == {"type": "object", "properties": {}, "required": [], "additionalProperties": True}


@pytest.mark.parametrize("feature,minor", [(False, 11), (True, 10)])
def test_store_refuses_unadvertised_signature_before_writing(monkeypatch, tmp_path, feature, minor):
    import skeleton_runtime_capability
    manifest = require_skeleton_runtime()
    protocol = next(row for row in manifest["protocols"] if row["id"] == "skeleton_execution")
    protocol["minor"] = minor
    if not feature:
        protocol["features"].remove("workflow_parameters_v1")
    # Independent feature gate receives an already validated baseline manifest.
    monkeypatch.setattr(skeleton_runtime_capability, "require_skeleton_runtime", lambda: manifest)
    store = SkeletonResourceStore(tmp_path / "resources.sqlite3")
    with pytest.raises(SkeletonResourceError) as error:
        store.save_draft(workflow())
    assert error.value.code == "workflow_parameters_runtime_incompatible"
    assert store.list_resources() == []


def test_real_v2_producer_save_reopen_publish_and_argument_admission(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("UNCHAIN_AUTH_TOKEN", "workflow-parameters-test")
    client = app.create_app().test_client()
    headers = {"x-unchain-auth": "workflow-parameters-test"}
    doc = workflow()
    body = {"schema": "pupu.skeleton-edit.v2", "document": doc, "expected_edit_token": None, "managed_sources": []}
    caps = client.get("/skeleton_resources/v2/capabilities", headers=headers)
    saved = client.post("/skeleton_resources/v2", headers=headers, json=body)
    assert saved.status_code == 200, saved.json
    resource = saved.json["resource"]
    assert resource["document"] == doc
    assert client.get("/skeleton_resources/v2/parameters", headers=headers).json == saved.json
    checked = client.post("/skeleton_resources/v2/parameters/preflight", headers=headers, json={})
    assert checked.status_code == 200 and checked.json["preflight"]["ok"] is True, checked.json
    published = client.post("/skeleton_resources/v2/parameters/publish", headers=headers,
        json={"schema": "pupu.skeleton-publish.v2", "expected_edit_token": resource["edit_token"]})
    assert published.status_code == 200, published.json
    stale = client.post("/skeleton_resources/v2", headers=headers, json=body)
    assert stale.status_code == 409 and stale.json["error"]["code"] == "edit_conflict"
    assert client.get("/skeleton_resources/v2/parameters", headers=headers).json == saved.json
    result = run_workflow(prepare_workflow(resource["document"]), {"city": "Vancouver"}, {})
    assert result.outputs == {"args": {"city": "Vancouver", "days": 1}}
    if os.environ.get("WORKFLOW_PARAMETERS_CAPTURE"):
        Path(os.environ["WORKFLOW_PARAMETERS_CAPTURE"]).write_text(json.dumps({"capabilities": caps.json,
            "edit": body, "resource": saved.json, "preflight": checked.json, "publication": published.json}, indent=2) + "\n")


def test_bad_signature_is_a_repairable_draft_but_not_publishable(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    store = SkeletonResourceStore(tmp_path / "resources.sqlite3")
    doc = workflow(); doc["input_schema"]["properties"]["days"]["default"] = "wrong"
    saved = store.save_draft(doc)
    assert saved["document"] == doc
    assert any(row["path"] == ["document", "input_schema", "properties", "days", "default"] for row in saved["diagnostics"])
    with pytest.raises(SkeletonResourceError) as error:
        store.publish_workflow("parameters", expected_edit_token=saved["edit_token"])
    assert error.value.code == "invalid_type"
