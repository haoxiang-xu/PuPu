"""The builder's read of a toolkit's tool schemas (#352, BC-352-1).

A Tool Call node's arguments are the node's inputs, and the panel renders one
row per property of the chosen tool's own JSON schema. The only schemas that
matter are the ones the runtime will execute against, so the reference here is
the runtime's own UI-host read, `SkeletonToolRuntime.tool_schemas()`, taken
from a real production host — not a second listing that merely looks alike.
"""
from pathlib import Path
from unittest.mock import patch

import pytest

import app as pupu_app
import unchain_adapter as adapter
from unchain.skeleton import prepare_workflow
from test_skeleton_production_bindings import _execution, _host, _offline_sdk_clients  # noqa: F401
from test_skeleton_resource_store import output, workflow

SCHEMA = "pupu.skeleton_tool_schemas.v1"


@pytest.fixture()
def client(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    with patch("pathlib.Path.home", return_value=home):
        app = pupu_app.create_app()
        app.config["UNCHAIN_AUTH_TOKEN"] = ""
        yield app.test_client()


def _runtime_ui_schemas(tmp_path):
    """The deterministic Tool host the production bindings build for a run
    whose chat selected Core, and what it hands a UI host."""
    host, _store, _selected = _host(tmp_path, options={"toolkits": ["CoreToolkit"]})
    document = workflow("schema-reference")
    document["nodes"][1]["type"] = "tool_call"
    document["nodes"][1]["config"] = {"execution": {"inputs": [], "outputs": [output("value", "result", ["ok"])]},
                                      "tool": {"name": "read", "on_error": "stop", "approval_timeout_ms": 1000}}
    plan = prepare_workflow(document)
    handlers = host.child_handlers_factory(_execution(tmp_path, plan), plan)
    return {entry["name"]: entry for entry in handlers["tool_call"].tool_schemas()}


def test_core_schemas_are_exactly_the_runtime_ui_host_schemas(client, tmp_path):
    response = client.get("/skeleton_tools/schemas?toolkit=core")
    assert response.status_code == 200
    body = response.get_json()
    assert set(body) == {"schema", "toolkit_id", "tools"}
    assert body["schema"] == SCHEMA and body["toolkit_id"] == "core"
    assert all(set(tool) == {"name", "description", "parameters"} for tool in body["tools"])
    reference = _runtime_ui_schemas(tmp_path)
    assert [tool["name"] for tool in body["tools"]] == sorted(reference)
    for tool in body["tools"]:
        expected = reference[tool["name"]]
        assert tool == {"name": expected["name"], "description": expected["description"],
                        "parameters": expected["parameters"]}
    read = next(tool for tool in body["tools"] if tool["name"] == "read")
    assert read["parameters"]["required"] == ["path"]


@pytest.mark.parametrize("query,code,status", [
    ("toolkit=no-such-toolkit", "toolkit_missing", 404),
    ("", "invalid_value", 400),
    ("toolkit=", "invalid_value", 400),
    ("toolkit=../core", "invalid_value", 400),
])
def test_unknown_or_malformed_toolkit_is_refused_with_a_structured_error(client, query, code, status):
    response = client.get("/skeleton_tools/schemas?" + query)
    assert response.status_code == status
    error = response.get_json()["error"]
    assert set(error) == {"code", "path", "message"} and error["code"] == code
    assert error["path"] == ["toolkit"]


def test_a_toolkit_that_is_not_builtin_is_not_built_for_a_schema_read(client, monkeypatch):
    """Building an MCP toolkit starts its server; a schema read must not."""
    catalog = {"toolkits": [{"toolkitId": "remote", "source": "mcp", "tools": []}]}
    monkeypatch.setattr(adapter, "get_toolkit_catalog_v2", lambda: catalog)

    def must_not_build(*args, **kwargs):
        raise AssertionError("a non-builtin toolkit was built")

    monkeypatch.setattr(adapter, "_build_selected_toolkits", must_not_build)
    response = client.get("/skeleton_tools/schemas?toolkit=remote")
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "toolkit_unsupported"


def test_the_read_needs_the_sidecar_token(client):
    client.application.config["UNCHAIN_AUTH_TOKEN"] = "schema-secret"
    assert client.get("/skeleton_tools/schemas?toolkit=core").status_code == 401
    allowed = client.get("/skeleton_tools/schemas?toolkit=core", headers={"x-unchain-auth": "schema-secret"})
    assert allowed.status_code == 200


def test_a_schema_read_writes_nothing(client, tmp_path):
    before = sorted(str(path) for path in Path(tmp_path).rglob("*"))
    assert client.get("/skeleton_tools/schemas?toolkit=core").status_code == 200
    assert sorted(str(path) for path in Path(tmp_path).rglob("*")) == before
