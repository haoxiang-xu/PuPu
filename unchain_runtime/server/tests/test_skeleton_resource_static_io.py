"""BC-016/SEQ-019: strict admission of statically impossible required IO."""
from pathlib import Path

import pytest

import app as pupu_app
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_resource_store import agent, binding, output, workflow
from unchain.skeleton import WorkflowNodeCompleted, prepare_workflow, run_workflow


INVALID_REFERENCES = [
    pytest.param("missing", ["value"], ["node_id"], id="unknown-node"),
    pytest.param("code", ["value"], ["node_id"], id="self-reference"),
    pytest.param("end", ["value"], ["node_id"], id="downstream-node"),
    pytest.param("start", ["absent"], ["path", 0], id="undeclared-export"),
]


def invalid_workflow(node_id, path, resource_id):
    document = workflow(resource_id)
    document["nodes"][1]["config"]["execution"]["inputs"] = [
        binding("value", node_id, path)]
    return document


def io_path(suffix):
    return ["document", "nodes", 1, "config", "execution", "inputs", 0,
            "value", *suffix]


@pytest.mark.parametrize("node_id,path,suffix", INVALID_REFERENCES)
@pytest.mark.parametrize("operation", ["preflight", "publish"])
def test_required_impossible_ref_is_saved_but_never_admitted(
        tmp_path, node_id, path, suffix, operation):
    root = tmp_path / "resources"
    store = SkeletonResourceStore(root)
    document = invalid_workflow(node_id, path, "required-ref")
    saved = store.save_draft(document)
    expected_path = io_path(suffix)
    assert any(item["code"] == "missing_value" and item["path"] == expected_path
               for item in saved["diagnostics"])
    assert store.diagnose(document) == saved["diagnostics"]
    assert SkeletonResourceStore(root).get_resource(saved["id"])["diagnostics"] == saved["diagnostics"]
    assert store.list_resources()[0]["published_revisions"] == 0

    with pytest.raises(SkeletonResourceError) as rejected:
        if operation == "preflight":
            store.preflight(saved["id"])
        else:
            store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    assert rejected.value.code == "missing_value"
    assert list(rejected.value.path) == io_path([])
    assert SkeletonResourceStore(root).list_resources()[0]["published_revisions"] == 0
    assert store.get_resource(saved["id"])["edit_token"] == saved["edit_token"]


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    client = pupu_app.create_app().test_client()
    client.application.config["UNCHAIN_AUTH_TOKEN"] = "static-io-test-token"
    return client


@pytest.mark.parametrize("node_id,path,suffix", INVALID_REFERENCES)
@pytest.mark.parametrize("operation", ["preflight", "publish"])
def test_http_rejects_required_impossible_ref_without_publishing(
        client, node_id, path, suffix, operation):
    headers = {"x-unchain-auth": "static-io-test-token"}
    document = invalid_workflow(node_id, path, "http-required-ref")
    diagnosed = client.post("/skeleton_resources/diagnose", headers=headers,
                            json={"document": document})
    assert diagnosed.status_code == 200
    assert set(diagnosed.get_json()) == {"diagnostics"}
    diagnostics = diagnosed.get_json()["diagnostics"]
    assert any(item["code"] == "missing_value" and item["path"] == io_path(suffix)
               for item in diagnostics)
    saved = client.post("/skeleton_resources", headers=headers,
                        json={"document": document})
    assert saved.status_code == 200
    assert saved.get_json()["diagnostics"] == diagnostics
    loaded = client.get("/skeleton_resources/http-required-ref", headers=headers)
    assert loaded.status_code == 200
    assert loaded.get_json()["diagnostics"] == diagnostics

    response = client.post(f"/skeleton_resources/http-required-ref/{operation}",
                           headers=headers,
                           json={} if operation == "preflight" else {
                               "expected_edit_token": saved.get_json()["edit_token"]})
    assert response.status_code == 400
    assert set(response.get_json()["error"]) == {"code", "path", "message"}
    assert response.get_json()["error"]["code"] == "missing_value"
    assert response.get_json()["error"]["path"] == io_path([])
    summaries = client.get("/skeleton_resources", headers=headers).get_json()
    assert summaries["resources"][0]["published_revisions"] == 0


@pytest.mark.parametrize("kernel", [None, {}])
def test_incomplete_kernel_precedes_static_ref_execution_error(tmp_path, kernel):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = agent("unfinished-kernel")
    config = document["nodes"][1]["config"]
    config.pop("kernel")
    if kernel is not None:
        config["kernel"] = kernel
    config["execution"]["inputs"] = [binding("message", "missing", ["message"])]
    saved = store.save_draft(document)
    assert any(item["code"] == "missing_value" and item["path"] == io_path(["node_id"])
               for item in saved["diagnostics"])
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight(saved["id"])
    assert rejected.value.path[:4] == ("document", "nodes", 1, "config")
    assert "execution" not in rejected.value.path


def conditional_workflow():
    document = workflow("conditional-ref")
    document["nodes"] = [
        {"id": "start", "type": "start", "config": {
            "execution": {"outputs": [output("flag", "result", ["flag"])]}}},
        {"id": "if", "type": "if_else", "config": {"execution": {
            "inputs": [binding("flag", "start", ["flag"])],
            "condition": {"kind": "compare", "operator": "eq",
                          "left": {"kind": "input", "path": ["flag"]},
                          "right": {"kind": "literal", "value": True}}}}},
        *[{"id": node_id, "type": "code", "config": {"execution": {
            "inputs": [], "outputs": [output("value", "result", ["value"])]}}}
          for node_id in ("left", "right")],
        {"id": "end", "type": "end", "config": {"execution": {
            "inputs": [{"name": "value", "missing": "error", "value": {
                "kind": "first_present", "values": [
                    {"kind": "ref", "node_id": node_id, "path": ["value"]}
                    for node_id in ("left", "right")]}}],
            "outputs": [output("value", "input", ["value"])]}}},
    ]
    document["edges"] = [
        {"id": edge_id, "kind": "flow", "source_node_id": source,
         "source_port_id": port, "target_node_id": target, "target_port_id": "in"}
        for edge_id, source, port, target in (
            ("a", "start", "out", "if"), ("b", "if", "true", "left"),
            ("c", "if", "false", "right"), ("d", "left", "out", "end"),
            ("e", "right", "out", "end"))]
    return document


@pytest.mark.parametrize("flag,expected", [(True, "left"), (False, "right")])
def test_conditional_first_present_publishes_and_runs_each_selected_branch(tmp_path, flag, expected):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = conditional_workflow()
    saved = store.save_draft(document)
    assert saved["diagnostics"] == []
    assert store.preflight(saved["id"])["diagnostics"] == []
    published = store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    stored = store.get_workflow_version(saved["id"], published["revision_id"])
    assert stored["document"] == document
    calls = []

    def code(context, inputs):
        calls.append(context.node_id)
        return WorkflowNodeCompleted({"value": context.node_id})

    result = run_workflow(prepare_workflow(stored["document"]), {"flag": flag}, {"code": code})
    assert result.outputs == {"value": expected}
    assert calls == [expected]
    assert store.list_resources()[0]["published_revisions"] == 1


@pytest.mark.parametrize("missing,extra,expected", [
    ("null", {}, None), ("default", {"default": "fallback"}, "fallback"),
])
def test_dynamic_optional_leaf_publishes_and_keeps_missing_policy(tmp_path, missing, extra, expected):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = workflow("optional-leaf")
    document["nodes"][1]["config"]["execution"]["inputs"] = [{
        "name": "value", "value": {"kind": "ref", "node_id": "start", "path": ["value", "absent"]},
        "missing": missing, **extra}]
    saved = store.save_draft(document)
    assert saved["diagnostics"] == []
    assert store.preflight(saved["id"])["diagnostics"] == []
    published = store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    stored = store.get_workflow_version(saved["id"], published["revision_id"])
    result = run_workflow(prepare_workflow(stored["document"]), {"value": {}}, {
        "code": lambda context, inputs: WorkflowNodeCompleted({"value": inputs["value"]})})
    assert result.outputs == {"value": expected}
    assert store.list_resources()[0]["published_revisions"] == 1


@pytest.mark.parametrize("missing,extra,expected", [
    ("null", {}, None), ("default", {"default": "fallback"}, "fallback"),
])
def test_optional_unknown_ref_keeps_explicit_fallback_at_publish_and_run(tmp_path, missing, extra, expected):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = workflow("optional-unknown")
    document["nodes"][1]["config"]["execution"]["inputs"] = [{
        "name": "value", "value": {"kind": "ref", "node_id": "missing", "path": ["value"]},
        "missing": missing, **extra}]
    saved = store.save_draft(document)
    assert any(item["code"] == "missing_value" and item["path"] == io_path(["node_id"])
               for item in saved["diagnostics"])
    assert store.preflight(saved["id"])["diagnostics"] == []
    published = store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    stored = store.get_workflow_version(saved["id"], published["revision_id"])
    result = run_workflow(prepare_workflow(stored["document"]), {"value": 1}, {
        "code": lambda context, inputs: WorkflowNodeCompleted({"value": inputs["value"]})})
    assert result.outputs == {"value": expected}
    assert store.list_resources()[0]["published_revisions"] == 1
