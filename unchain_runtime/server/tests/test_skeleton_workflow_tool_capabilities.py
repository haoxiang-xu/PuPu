"""Real read-only host capability, strict version and fixed query admission."""
from copy import deepcopy
import importlib
import json
import os
from pathlib import Path

import pytest

from skeleton_resource_store import SkeletonResourceError


EXPECTED = {"schema": "pupu.skeleton_workflow_tool.v1", "field": "workflow_tools",
    "entry_fields": ["id", "workflow"], "workflow_fields": ["revision_id", "workflow_id"],
    "id_pattern": "[A-Za-z0-9_-]{1,48}", "function_prefix": "workflow_",
    "arguments_field": "inputs", "returns": "end_exports", "scope": "attached_kernel",
    "document_kind": "workflow", "version_policy": "published_exact", "minimum_runtime_minor": 4}


def capability():
    method = getattr(importlib.import_module("skeleton_workflow_tools"), "workflow_tool_capabilities", None)
    assert callable(method), "the new host capability producer is required"
    return method()


@pytest.fixture
def client():
    from flask import Flask
    import routes  # finish real Blueprint/auth registration before mounting it
    from route_skeleton_resources import api_blueprint
    app = Flask(__name__)
    app.config["UNCHAIN_AUTH_TOKEN"] = "sentinel-token"
    app.register_blueprint(api_blueprint)
    return app.test_client()


def test_actual_read_only_route_produces_the_closed_contract(client):
    path = "/skeleton_workflow_tools/capabilities?contract=workflow_tool_v1"
    assert client.get(path).status_code == 401
    response = client.get(path, headers={"x-unchain-auth": "sentinel-token"})
    if os.environ.get("QA_OUT"):
        (Path(os.environ["QA_OUT"]) / "capability-response.json").write_text(json.dumps({
            "status": response.status_code, "content_type": response.content_type,
            "body": response.get_json()}, indent=2) + "\n")
    assert response.status_code == 200
    payload = response.get_json()
    assert set(payload) == {"schema", "runtime_manifest_digest", "workflow_tool"}
    assert payload["schema"] == "pupu.skeleton_workflow_tools_capabilities.v1"
    assert payload["workflow_tool"] == EXPECTED
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest
    assert payload["runtime_manifest_digest"] == runtime_protocol_manifest()["manifest_digest"]
    assert payload == capability()


@pytest.mark.parametrize("query,code", [
    ("", "missing_field"), ("contract=future", "unknown_variant"),
    ("contract=workflow_tool_v1&contract=workflow_tool_v1", "invalid_shape"),
    ("contract=workflow_tool_v1&resource_id=secret", "unknown_field"),
])
def test_capability_query_has_one_fixed_selector(client, query, code):
    response = client.get("/skeleton_workflow_tools/capabilities?" + query,
        headers={"x-unchain-auth": "sentinel-token"})
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == code


@pytest.mark.parametrize("minor", [0, 3, True])
def test_older_child_runtime_contract_fails_before_exposure(monkeypatch, minor):
    module = importlib.import_module("skeleton_workflow_tools")
    assert callable(getattr(module, "workflow_tool_capabilities", None))
    from skeleton_runtime_capability import require_skeleton_runtime
    manifest = deepcopy(require_skeleton_runtime())
    next(item for item in manifest["protocols"] if item["id"] == "skeleton_execution")["minor"] = minor
    monkeypatch.setattr(module, "require_skeleton_runtime", lambda: manifest)
    with pytest.raises(SkeletonResourceError) as caught:
        capability()
    assert (caught.value.code, caught.value.status) == ("workflow_tool_runtime_incompatible", 409)
