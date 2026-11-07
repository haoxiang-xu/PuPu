"""BC-016/SEQ-019: real draft diagnostics across SQLite and the Flask boundary."""
from copy import deepcopy
from pathlib import Path

import pytest

import app as pupu_app
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_resource_store import agent, workflow


@pytest.mark.parametrize("value,missing,extra,code,suffix", [
    ({"kind": "first_present", "values": "bad"}, "error", {}, "invalid_value", ["value", "values"]),
    ({"kind": "literal", "value": 1}, "null", {"default": 2}, "unknown_field", ["default"]),
])
def test_save_get_reopen_and_correction_use_document_io(tmp_path, value, missing, extra, code, suffix):
    root = tmp_path / "resources"
    store = SkeletonResourceStore(root)
    document = workflow("draft-io")
    document["nodes"][1]["config"]["execution"]["inputs"] = [
        {"name": "value", "value": value, "missing": missing, **extra}]
    saved = store.save_draft(document)
    expected_path = ["document", "nodes", 1, "config", "execution", "inputs", 0, *suffix]
    assert any(item["code"] == code and item["path"] == expected_path for item in saved["diagnostics"])
    assert store.get_resource("draft-io")["diagnostics"] == saved["diagnostics"]
    assert SkeletonResourceStore(root).get_resource("draft-io")["diagnostics"] == saved["diagnostics"]
    assert store.diagnose(document) == saved["diagnostics"]
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight("draft-io")
    assert rejected.value.code == code
    assert list(rejected.value.path) == expected_path
    with pytest.raises(SkeletonResourceError):
        store.publish_workflow("draft-io", expected_edit_token=saved["edit_token"])
    corrected = store.save_draft(workflow("draft-io"), expected_edit_token=saved["edit_token"])
    assert corrected["diagnostics"] == []
    assert corrected["edit_token"] != saved["edit_token"]
    assert SkeletonResourceStore(root).get_resource("draft-io")["diagnostics"] == []
    assert store.preflight("draft-io")["document"] == workflow("draft-io")
    with pytest.raises(SkeletonResourceError) as stale:
        store.save_draft(document, expected_edit_token=saved["edit_token"])
    assert stale.value.code == "edit_conflict"
    assert store.get_resource("draft-io")["diagnostics"] == []


@pytest.mark.parametrize("kernel", [None, {}])
def test_unfinished_kernel_does_not_hide_saved_agent_io(tmp_path, kernel):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = agent("unfinished")
    config = document["nodes"][1]["config"]
    config.pop("kernel")
    if kernel is not None:
        config["kernel"] = kernel
    config["execution"]["inputs"][0].update(missing="null", default=1)
    saved = store.save_draft(document)
    expected_path = ["document", "nodes", 1, "config", "execution", "inputs", 0, "default"]
    assert any(item["path"] == expected_path for item in saved["diagnostics"])
    assert store.get_resource("unfinished")["diagnostics"] == saved["diagnostics"]
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight("unfinished")
    assert rejected.value.path[:4] == ("document", "nodes", 1, "config")
    assert "execution" not in rejected.value.path


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    client = pupu_app.create_app().test_client()
    client.application.config["UNCHAIN_AUTH_TOKEN"] = "draft-test-token"
    return client


def test_actual_flask_diagnose_save_get_and_publish_contract(client):
    headers = {"x-unchain-auth": "draft-test-token"}
    document = workflow("http-draft")
    execution = document["nodes"][1]["config"]["execution"]
    execution["inputs"].append(deepcopy(execution["inputs"][0]))
    diagnosed = client.post("/skeleton_resources/diagnose", json={"document": document}, headers=headers)
    assert diagnosed.status_code == 200
    assert set(diagnosed.get_json()) == {"diagnostics"}
    diagnostics = diagnosed.get_json()["diagnostics"]
    assert diagnostics == [{"code": "duplicate_name", "path": [
        "document", "nodes", 1, "config", "execution", "inputs", 1, "name"],
        "message": "binding name is duplicated"}]
    saved = client.post("/skeleton_resources", json={"document": document}, headers=headers)
    assert saved.status_code == 200
    assert saved.get_json()["diagnostics"] == diagnostics
    loaded = client.get("/skeleton_resources/http-draft", headers=headers)
    assert loaded.status_code == 200
    assert loaded.get_json()["diagnostics"] == diagnostics
    preflight = client.post("/skeleton_resources/http-draft/preflight", json={}, headers=headers)
    assert preflight.status_code == 400
    assert preflight.get_json()["error"]["code"] == "duplicate_name"
    publish = client.post("/skeleton_resources/http-draft/publish", headers=headers,
        json={"expected_edit_token": saved.get_json()["edit_token"]})
    assert publish.status_code == 400
    assert publish.get_json()["error"]["path"] == diagnostics[0]["path"]


@pytest.mark.parametrize("patch", [{"schema_version": 2}, {"unknown": 1}])
def test_diagnose_http_keeps_outer_schema_rejection(client, patch):
    document = workflow()
    document.update(patch)
    response = client.post("/skeleton_resources/diagnose", json={"document": document},
                           headers={"x-unchain-auth": "draft-test-token"})
    assert response.status_code == 400
    assert set(response.get_json()["error"]) == {"code", "path", "message"}


def test_diagnose_http_keeps_authentication_and_closed_request(client):
    assert client.post("/skeleton_resources/diagnose", json={"document": workflow()}).status_code == 401
    response = client.post("/skeleton_resources/diagnose", json={"document": workflow(), "extra": 1},
                           headers={"x-unchain-auth": "draft-test-token"})
    assert response.status_code == 400
    assert response.get_json()["error"]["path"] == ["body", "extra"]
