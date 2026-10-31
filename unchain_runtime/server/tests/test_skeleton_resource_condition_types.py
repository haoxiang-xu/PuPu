"""BC-018: runtime type termination must not expose unreachable draft inputs."""

from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

import app as pupu_app
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_resource_conditions import (
    _branch_document, _closed_diagnostics, _condition_compare,
    _condition_input, _condition_literal,
)
from test_skeleton_resource_store import binding, output
from unchain.skeleton import (
    SkeletonValidationError, WorkflowNodeCompleted, prepare_workflow, run_workflow,
)


TYPE_ERRORS = (
    pytest.param("gt", "left", "not-number", 1, "left", id="ordering-left-string"),
    pytest.param("lte", "right", True, 1, "right", id="ordering-right-bool"),
    pytest.param("contains", "left", 42, 1, "left", id="contains-left-number"),
)


def _type_document(resource_id, group, operator, literal_side, literal):
    left, right = (_condition_literal(literal), _condition_input("value"))
    if literal_side == "right":
        left, right = right, left
    condition = {"kind": group, "conditions": [
        _condition_compare(left, right, operator),
        _condition_compare(_condition_input("absent"), _condition_literal(True)),
    ]}
    document = _branch_document(resource_id, condition)
    # Exercise a real effect-bearing node before the branch and ensure no later
    # branch handler runs after the existing evaluator's first comparison error.
    before = {"id": "before", "type": "code", "config": {"execution": {
        "inputs": [binding("value", "start", ["value"])],
        "outputs": [output("value", "result", ["value"])],
    }}}
    document["nodes"].insert(1, before)
    document["nodes"][2]["config"]["execution"]["inputs"] = [binding("value", "before", ["value"])]
    document["edges"][0]["target_node_id"] = "before"
    document["edges"].insert(1, {
        "id": "before-to-branch", "kind": "flow", "source_node_id": "before",
        "source_port_id": "out", "target_node_id": "branch", "target_port_id": "in",
    })
    return document


def _type_path(index, side, leaf):
    return ["document", "nodes", 2, "config", "execution", "condition",
            "conditions", index, side, leaf]


def _run_first_error(document, value, expected_code, path):
    calls = []

    def code(context, inputs):
        calls.append(context.node_id)
        return WorkflowNodeCompleted({"value": inputs.get("value")})

    with pytest.raises(SkeletonValidationError) as failed:
        run_workflow(prepare_workflow(document), {"value": value}, {"code": code})
    assert failed.value.code == expected_code
    assert list(failed.value.path) == path
    assert calls == ["before"]


@pytest.mark.parametrize("group", ["all", "any"])
@pytest.mark.parametrize("operator,literal_side,literal,value,error_side", TYPE_ERRORS)
def test_type_termination_is_not_false_diagnostic_or_new_publish_gate(
        tmp_path, group, operator, literal_side, literal, value, error_side):
    root = tmp_path / "resources"
    store = SkeletonResourceStore(root)
    document = _type_document("type-error", group, operator, literal_side, literal)
    original = deepcopy(document)
    saved = store.save_draft(document)
    assert saved["document"] == original == document
    token = saved["edit_token"]
    assert store.preflight(saved["id"])["document"] == original
    assert store.get_resource(saved["id"])["edit_token"] == token
    published = store.publish_workflow(saved["id"], expected_edit_token=token)
    stored = store.get_workflow_version(saved["id"], published["revision_id"])
    assert stored["document"] == original
    assert store.list_resources()[0]["published_revisions"] == 1
    assert store.get_resource(saved["id"])["edit_token"] == token
    _run_first_error(stored["document"], value, "invalid_type", _type_path(0, error_side, "value"))

    # Preserve the real CAS/revision behavior even though execution itself fails.
    renamed = deepcopy(original)
    renamed["name"] = "Renamed"
    updated = store.save_draft(renamed, expected_edit_token=token)
    assert updated["edit_token"] != token
    with pytest.raises(SkeletonResourceError) as stale:
        store.publish_workflow(saved["id"], expected_edit_token=token)
    assert stale.value.code == "edit_conflict"
    assert store.get_workflow_version(saved["id"], published["revision_id"])["document"] == original
    assert store.get_resource(saved["id"])["document"] == renamed
    assert store.list_resources()[0]["published_revisions"] == 1
    diagnostics = [saved["diagnostics"], store.diagnose(original),
                   SkeletonResourceStore(root).get_resource(saved["id"])["diagnostics"]]
    for items in diagnostics:
        _closed_diagnostics(items)
        assert items == []


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    client = pupu_app.create_app().test_client()
    client.application.config["UNCHAIN_AUTH_TOKEN"] = "condition-type-test"
    return client


def test_actual_flask_type_termination_diagnose_save_get_preflight_publish(client):
    headers = {"x-unchain-auth": "condition-type-test"}
    document = _type_document("http-type", "any", "lte", "right", True)
    diagnosed = client.post("/skeleton_resources/diagnose", headers=headers, json={"document": document})
    assert diagnosed.status_code == 200
    assert set(diagnosed.get_json()) == {"diagnostics"}
    saved = client.post("/skeleton_resources", headers=headers, json={"document": document})
    assert saved.status_code == 200
    assert saved.get_json()["document"] == document
    token = saved.get_json()["edit_token"]
    preflight = client.post("/skeleton_resources/http-type/preflight", headers=headers, json={})
    assert preflight.status_code == 200
    assert preflight.get_json()["document"] == document
    published = client.post("/skeleton_resources/http-type/publish", headers=headers,
                            json={"expected_edit_token": token})
    assert published.status_code == 200
    revision = published.get_json()["revision_id"]
    version = client.get(f"/skeleton_resources/http-type/versions/{revision}", headers=headers)
    assert version.get_json()["document"] == document
    loaded = client.get("/skeleton_resources/http-type", headers=headers)
    assert loaded.get_json()["edit_token"] == token
    assert client.get("/skeleton_resources", headers=headers).get_json()["resources"][0]["published_revisions"] == 1
    _run_first_error(version.get_json()["document"], 1, "invalid_type", _type_path(0, "right", "value"))
    for response in (diagnosed, saved, loaded):
        _closed_diagnostics(response.get_json()["diagnostics"])
        assert response.get_json()["diagnostics"] == []


def test_cold_process_recomputes_type_termination_without_false_missing(tmp_path):
    root = tmp_path / "resources"
    store = SkeletonResourceStore(root)
    saved = [store.save_draft(_type_document(name, "all", operator, side, literal))
             for name, operator, side, literal in (
                 ("a", "gt", "left", "bad"), ("b", "lte", "right", True),
                 ("c", "contains", "left", 42))]
    script = """
import json, sys
from skeleton_resource_store import SkeletonResourceStore
import unchain.skeleton.branch_admission as branch
store = SkeletonResourceStore(sys.argv[1])
print(json.dumps({'resources': [store.get_resource(name) for name in ('a', 'b', 'c', 'a')],
                  'module': branch.__file__}))
"""
    process = subprocess.run([sys.executable, "-c", script, str(root)], check=True,
        env={**os.environ, "PYTHONHASHSEED": "61"}, capture_output=True, text=True)
    value = json.loads(process.stdout)
    assert Path(value["module"]).resolve().is_relative_to(Path(os.environ["UNCHAIN_SOURCE_PATH"]).resolve())
    for loaded, original in zip(value["resources"], [*saved, saved[0]]):
        assert loaded["document"] == original["document"]
        assert loaded["edit_token"] == original["edit_token"]
        _closed_diagnostics(loaded["diagnostics"])
        assert loaded["diagnostics"] == []


@pytest.mark.parametrize("group,operator,literal,value", [
    ("all", "lt", 1, 2), ("any", "contains", "abc", "z"),
])
def test_valid_dynamic_compare_keeps_reachable_missing_visible_and_admitted(
        tmp_path, group, operator, literal, value):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = _type_document("valid-dynamic", group, operator, "left", literal)
    saved = store.save_draft(document)
    _closed_diagnostics(saved["diagnostics"])
    path = _type_path(1, "left", "path")
    assert len(saved["diagnostics"]) == 1
    assert (saved["diagnostics"][0]["code"], saved["diagnostics"][0]["path"]) == ("missing_value", path)
    assert store.preflight(saved["id"])["document"] == document
    published = store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    assert store.get_workflow_version(saved["id"], published["revision_id"])["document"] == document
    _run_first_error(document, value, "missing_value", path)


def test_known_missing_still_precedes_constant_type_error_at_publish(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = _type_document("missing-first", "all", "gt", "left", "bad")
    document["nodes"][2]["config"]["execution"]["condition"]["conditions"][0]["right"]["path"] = ["absent"]
    saved = store.save_draft(document)
    _closed_diagnostics(saved["diagnostics"])
    path = _type_path(0, "right", "path")
    assert len(saved["diagnostics"]) == 1
    assert (saved["diagnostics"][0]["code"], saved["diagnostics"][0]["path"]) == ("missing_value", path)
    with pytest.raises(SkeletonResourceError) as rejected:
        store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    assert (rejected.value.code, list(rejected.value.path)) == ("missing_value", path)
    assert store.get_resource(saved["id"])["edit_token"] == saved["edit_token"]
    assert store.list_resources()[0]["published_revisions"] == 0


def test_type_diagnostic_boundary_stays_authenticated_closed_and_versioned(client):
    headers = {"x-unchain-auth": "condition-type-test"}
    document = _type_document("closed-type", "all", "gt", "left", "bad")
    assert client.post("/skeleton_resources/diagnose", json={"document": document}).status_code == 401
    for patch, code in (({"schema_version": 2}, "invalid_value"), ({"unknown": True}, "unknown_field")):
        rejected = client.post("/skeleton_resources/diagnose", headers=headers,
                               json={"document": {**document, **patch}})
        assert rejected.status_code == 400
        assert set(rejected.get_json()["error"]) == {"code", "path", "message"}
        assert rejected.get_json()["error"]["code"] == code
    rejected = client.post("/skeleton_resources/diagnose", headers=headers,
                           json={"document": document, "extra": 1})
    assert rejected.status_code == 400
    assert set(rejected.get_json()["error"]) == {"code", "path", "message"}
    assert rejected.get_json()["error"]["path"] == ["body", "extra"]
