"""BC-018/SEQ-021: actual draft, admission and persistence condition boundaries."""

from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

import app as pupu_app
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_resource_store import agent, binding, output
from unchain.skeleton import WorkflowNodeCompleted, prepare_workflow, run_workflow


def _condition_literal(value):
    return {"kind": "literal", "value": value}


def _condition_input(*parts):
    return {"kind": "input", "path": list(parts)}


def _condition_compare(left, right=None, operator="eq"):
    result = {"kind": "compare", "operator": operator, "left": left}
    if operator not in {"is_null", "is_not_null"}:
        result["right"] = right
    return result


def _condition_truth(value):
    return _condition_compare(_condition_literal(value), _condition_literal(True))


def _branch_document(resource_id="condition", condition=None, switch=False):
    execution = {"inputs": [binding("value", "start", ["value"])]}
    if switch:
        execution.update(value=_condition_input("absent"), cases=[{"id": "chosen", "value": 1}])
        ports = ("chosen", "default")
    else:
        execution["condition"] = condition or _condition_compare(
            _condition_input("absent"), _condition_literal(True))
        ports = ("true", "false")
    return {
        "schema_version": 1, "kind": "workflow", "id": resource_id, "name": "Conditions",
        "nodes": [
            {"id": "start", "type": "start", "config": {"execution": {
                "outputs": [output("value", "result", ["value"])]}}},
            {"id": "branch", "type": "switch_case" if switch else "if_else",
             "config": {"execution": execution}},
            *[{"id": name, "type": "code", "config": {"execution": {
                "inputs": [], "outputs": [output("value", "result", ["value"])]}}}
              for name in ("left", "right")],
            {"id": "end", "type": "end", "config": {"execution": {
                "inputs": [{"name": "value", "missing": "error", "value": {
                    "kind": "first_present", "values": [
                        {"kind": "ref", "node_id": name, "path": ["value"]}
                        for name in ("left", "right")]}}],
                "outputs": [output("value", "input", ["value"])]}}},
        ],
        "edges": [
            {"id": edge, "kind": "flow", "source_node_id": source,
             "source_port_id": port, "target_node_id": target, "target_port_id": "in"}
            for edge, source, port, target in (
                ("a", "start", "out", "branch"), ("b", "branch", ports[0], "left"),
                ("c", "branch", ports[1], "right"), ("d", "left", "out", "end"),
                ("e", "right", "out", "end"))],
    }


def _condition_path(*suffix):
    return ["document", "nodes", 1, "config", "execution", *suffix]


def _closed_diagnostics(diagnostics):
    for item in diagnostics:
        assert set(item) == {"code", "path", "message"}
        assert isinstance(item["code"], str) and isinstance(item["message"], str)
        assert item["message"]
        assert type(item["path"]) is list
        assert all(type(part) is str or type(part) is int and part >= 0 for part in item["path"])


def _assert_missing(diagnostics, path):
    _closed_diagnostics(diagnostics)
    assert any(item["code"] == "missing_value" and item["path"] == path for item in diagnostics)


def _missing_document(case, resource_id):
    if case == "left":
        return _branch_document(resource_id), _condition_path("condition", "left", "path")
    if case == "right":
        condition = _condition_compare(_condition_literal(True), _condition_input("absent"))
        return _branch_document(resource_id, condition), _condition_path("condition", "right", "path")
    if case == "nested":
        condition = {"kind": "any", "conditions": [
            _condition_truth(False), {"kind": "all", "conditions": [
                _condition_truth(True), _condition_compare(_condition_input("absent"), _condition_literal(True))]}]}
        return _branch_document(resource_id, condition), _condition_path(
            "condition", "conditions", 1, "conditions", 1, "left", "path")
    document = _branch_document(resource_id, switch=True)
    document["nodes"][1]["config"]["execution"]["value"] = _condition_input(0)
    return document, _condition_path("value", "path")


@pytest.mark.parametrize("case", ["left", "right", "nested", "switch-index-root"])
def test_saved_missing_operands_are_diagnosed_and_never_admitted(tmp_path, case):
    root = tmp_path / "resources"
    store = SkeletonResourceStore(root)
    document, path = _missing_document(case, "missing")
    original = deepcopy(document)
    saved = store.save_draft(document)
    _assert_missing(saved["diagnostics"], path)
    assert saved["document"] == original == document
    assert store.diagnose(document) == saved["diagnostics"]
    assert SkeletonResourceStore(root).get_resource(saved["id"])["diagnostics"] == saved["diagnostics"]
    for operation in ("preflight", "publish"):
        with pytest.raises(SkeletonResourceError) as rejected:
            if operation == "preflight":
                store.preflight(saved["id"])
            else:
                store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
        assert rejected.value.code == "missing_value"
        assert list(rejected.value.path) == path
        assert store.get_resource(saved["id"])["edit_token"] == saved["edit_token"]
        assert store.list_resources()[0]["published_revisions"] == 0


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    client = pupu_app.create_app().test_client()
    client.application.config["UNCHAIN_AUTH_TOKEN"] = "condition-test-token"
    return client


@pytest.mark.parametrize("switch", [False, True])
def test_flask_diagnose_save_read_preflight_and_publish_use_real_conditions(client, switch):
    headers = {"x-unchain-auth": "condition-test-token"}
    document = _branch_document("http-condition", switch=switch)
    path = _condition_path("value", "path") if switch else _condition_path("condition", "left", "path")
    diagnosed = client.post("/skeleton_resources/diagnose", json={"document": document}, headers=headers)
    assert diagnosed.status_code == 200
    assert set(diagnosed.get_json()) == {"diagnostics"}
    diagnostics = diagnosed.get_json()["diagnostics"]
    _assert_missing(diagnostics, path)
    saved = client.post("/skeleton_resources", json={"document": document}, headers=headers)
    assert saved.status_code == 200
    assert saved.get_json()["document"] == document
    assert saved.get_json()["diagnostics"] == diagnostics
    loaded = client.get("/skeleton_resources/http-condition", headers=headers)
    assert loaded.get_json()["diagnostics"] == diagnostics
    token = saved.get_json()["edit_token"]
    for operation in ("preflight", "publish"):
        rejected = client.post(f"/skeleton_resources/http-condition/{operation}", headers=headers,
            json={} if operation == "preflight" else {"expected_edit_token": token})
        assert rejected.status_code == 400
        error = rejected.get_json()["error"]
        assert set(error) == {"code", "path", "message"}
        assert (error["code"], error["path"]) == ("missing_value", path)
    assert client.get("/skeleton_resources/http-condition", headers=headers).get_json()["edit_token"] == token
    assert client.get("/skeleton_resources", headers=headers).get_json()["resources"][0]["published_revisions"] == 0


@pytest.mark.parametrize("condition,suffix,code", [
    ({"kind": "all", "conditions": []}, ["condition", "conditions"], "invalid_value"),
    ({"kind": "any", "conditions": [_condition_truth(True), {
        "kind": "compare", "operator": "eq", "left": _condition_literal(True),
        "right": _condition_literal(True), "extra": 1}]},
     ["condition", "conditions", 1, "extra"], "unknown_field"),
])
def test_malformed_ast_is_retained_and_shortcircuit_never_hides_grammar(tmp_path, condition, suffix, code):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = _branch_document("malformed", condition)
    saved = store.save_draft(document)
    assert saved["document"] == document
    path = _condition_path(*suffix)
    _closed_diagnostics(saved["diagnostics"])
    assert any(item["code"] == code and item["path"] == path for item in saved["diagnostics"])
    assert store.get_resource("malformed")["diagnostics"] == saved["diagnostics"]
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight("malformed")
    assert (rejected.value.code, list(rejected.value.path)) == (code, path)


@pytest.mark.parametrize("case,condition,value,expected,has_diagnostic", [
    ("all-shortcircuit", {"kind": "all", "conditions": [_condition_truth(False),
        _condition_compare(_condition_input("absent"), _condition_literal(True))]}, True, "right", False),
    ("any-shortcircuit", {"kind": "any", "conditions": [_condition_truth(True),
        _condition_compare(_condition_input("absent"), _condition_literal(True))]}, True, "left", False),
    ("dynamic-shortcircuit", {"kind": "all", "conditions": [
        _condition_compare(_condition_input("value"), _condition_literal(True)),
        _condition_compare(_condition_input("absent"), _condition_literal(True))]}, False, "right", True),
    ("deep-json", _condition_compare(_condition_input("value", "deep", "leaf"), operator="is_null"),
     {"deep": {"leaf": None}}, "left", False),
    ("whole-input", _condition_compare(_condition_input(), operator="is_not_null"), None, "left", False),
    ("null-unary", _condition_compare(_condition_input("value"), operator="is_null"), None, "left", False),
])
def test_valid_or_possibly_successful_conditions_publish_and_run(
        tmp_path, case, condition, value, expected, has_diagnostic):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = _branch_document(case, condition)
    saved = store.save_draft(document)
    if has_diagnostic:
        _assert_missing(saved["diagnostics"], _condition_path("condition", "conditions", 1, "left", "path"))
    else:
        assert saved["diagnostics"] == []
    assert store.preflight(case)["document"] == document
    published = store.publish_workflow(case, expected_edit_token=saved["edit_token"])
    stored = store.get_workflow_version(case, published["revision_id"])
    calls = []

    def code(context, inputs):
        calls.append(context.node_id)
        return WorkflowNodeCompleted({"value": context.node_id})

    result = run_workflow(prepare_workflow(stored["document"]), {"value": value}, {"code": code})
    assert result.outputs == {"value": expected}
    assert calls == [expected]


def test_literal_runtime_error_remains_runtime_error_without_new_publish_rejection(tmp_path):
    condition = {"kind": "any", "conditions": [
        _condition_compare(_condition_literal(None), _condition_literal(True)),
        _condition_compare(_condition_input("absent"), _condition_literal(True))]}
    store = SkeletonResourceStore(tmp_path / "resources")
    document = _branch_document("runtime-null", condition)
    saved = store.save_draft(document)
    assert saved["diagnostics"] == []  # Missing child cannot be evaluated after a literal error.
    store.preflight(saved["id"])
    store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    from unchain.skeleton import SkeletonValidationError
    with pytest.raises(SkeletonValidationError) as failed:
        run_workflow(prepare_workflow(document), {"value": True}, {})
    assert failed.value.code == "invalid_value"
    assert list(failed.value.path) == _condition_path("condition", "conditions", 0, "left", "value")


def test_cas_correction_is_real_and_old_token_never_publishes(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = _branch_document("corrected")
    saved = store.save_draft(document)
    with pytest.raises(SkeletonResourceError) as rejected:
        store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    assert rejected.value.code == "missing_value"
    assert store.list_resources()[0]["published_revisions"] == 0
    corrected = deepcopy(document)
    corrected["nodes"][1]["config"]["execution"]["condition"]["left"]["path"] = ["value"]
    updated = store.save_draft(corrected, expected_edit_token=saved["edit_token"])
    assert updated["edit_token"] != saved["edit_token"]
    assert updated["diagnostics"] == []
    assert store.preflight(updated["id"])["document"] == corrected
    for operation in ("save", "publish"):
        with pytest.raises(SkeletonResourceError) as stale:
            if operation == "save":
                store.save_draft(document, expected_edit_token=saved["edit_token"])
            else:
                store.publish_workflow(updated["id"], expected_edit_token=saved["edit_token"])
        assert stale.value.code == "edit_conflict"
    published = store.publish_workflow(updated["id"], expected_edit_token=updated["edit_token"])
    assert store.get_workflow_version(updated["id"], published["revision_id"])["document"] == corrected
    assert store.list_resources()[0]["published_revisions"] == 1


def test_new_process_reopens_and_recomputes_same_closed_diagnostics(tmp_path):
    root = tmp_path / "resources"
    store = SkeletonResourceStore(root)
    documents = [_branch_document("one"), _branch_document("two", switch=True)]
    saved = [store.save_draft(document) for document in documents]
    script = """
import json, sys
from skeleton_resource_store import SkeletonResourceStore
import unchain.skeleton
store = SkeletonResourceStore(sys.argv[1])
loaded = [store.get_resource(name) for name in ('one', 'two', 'one')]
print(json.dumps({'loaded': loaded, 'module': unchain.skeleton.__file__}))
"""
    results = []
    for seed in ("17", "71"):
        process = subprocess.run([sys.executable, "-c", script, str(root)],
            env={**os.environ, "PYTHONHASHSEED": seed}, capture_output=True, text=True, check=True)
        value = json.loads(process.stdout)
        assert Path(value["module"]).resolve().is_relative_to(
            Path(os.environ["UNCHAIN_SOURCE_PATH"]).resolve())
        for loaded, original in zip(value["loaded"], [*saved, saved[0]]):
            assert loaded["document"] == original["document"]
            assert loaded["edit_token"] == original["edit_token"]
            assert loaded["diagnostics"] == original["diagnostics"]
            _closed_diagnostics(loaded["diagnostics"])
        results.append(value["loaded"])
    assert results[0] == results[1]
    _assert_missing(results[0][0]["diagnostics"], _condition_path("condition", "left", "path"))
    _assert_missing(results[0][1]["diagnostics"], _condition_path("value", "path"))


def test_unfinished_kernel_keeps_precedence_and_never_hides_condition_diagnosis(tmp_path):
    document = agent("unfinished-agent")
    document["nodes"][1]["config"].pop("kernel")
    # Insert a complete branch between the unfinished Kernel and End.
    branch = _branch_document()["nodes"][1]
    branch["config"]["execution"]["inputs"] = [binding("value", "kernel", ["message"])]
    document["nodes"].insert(2, branch)
    document["edges"] = [document["edges"][0],
        {"id": "b", "kind": "flow", "source_node_id": "kernel", "source_port_id": "out",
         "target_node_id": "branch", "target_port_id": "in"},
        *[{"id": name, "kind": "flow", "source_node_id": "branch", "source_port_id": port,
           "target_node_id": "end", "target_port_id": "in"}
          for name, port in (("c", "true"), ("d", "false"))]]
    store = SkeletonResourceStore(tmp_path / "resources")
    saved = store.save_draft(document)
    path = ["document", "nodes", 2, "config", "execution", "condition", "left", "path"]
    _assert_missing(saved["diagnostics"], path)
    assert store.get_resource(saved["id"])["diagnostics"] == saved["diagnostics"]
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight(saved["id"])
    assert rejected.value.path[:4] == ("document", "nodes", 1, "config")
    assert "condition" not in rejected.value.path


def test_draft_undeclared_inputs_stay_unknown_while_missing_section_is_visible(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = _branch_document("undeclared-inputs")
    document["nodes"][1]["config"]["execution"].pop("inputs")
    saved = store.save_draft(document)
    assert saved["document"] == document
    assert any(item["code"] == "missing_field" and item["path"] == _condition_path("inputs")
               for item in saved["diagnostics"])
    assert not any(item["code"] == "missing_value" and "condition" in item["path"]
                   for item in saved["diagnostics"])


def test_new_condition_diagnose_keeps_auth_schema_version_and_closed_envelope(client):
    headers = {"x-unchain-auth": "condition-test-token"}
    document = _branch_document("closed")
    assert client.post("/skeleton_resources/diagnose", json={"document": document}).status_code == 401
    for changes, expected_code in (({"schema_version": 2}, "invalid_value"),
                                   ({"unknown": 1}, "unknown_field")):
        rejected = client.post("/skeleton_resources/diagnose", headers=headers,
            json={"document": {**document, **changes}})
        assert rejected.status_code == 400
        assert set(rejected.get_json()["error"]) == {"code", "path", "message"}
        assert rejected.get_json()["error"]["code"] == expected_code
    rejected = client.post("/skeleton_resources/diagnose", headers=headers,
        json={"document": document, "extra": 1})
    assert rejected.status_code == 400
    assert rejected.get_json()["error"]["path"] == ["body", "extra"]
