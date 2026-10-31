"""B-AC8-01/02: authored child diagnostics keep their complete address."""
from copy import deepcopy
import importlib
from pathlib import Path

import pytest

import app as pupu_app
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_resource_store import agent


CHILD_PATH = ["nodes", 3, "config", "subagents", 0, "source", "document"]
IO_PATH = ["nodes", 1, "config", "execution", "inputs", 0, "default"]


def _io_fault(document):
    document["nodes"][1]["config"]["execution"]["inputs"][0]["default"] = "not allowed"
    return document


def _without_end(document):
    document["nodes"] = [node for node in document["nodes"] if node["id"] != "end"]
    document["edges"] = [edge for edge in document["edges"]
                         if edge["target_node_id"] != "end"]
    return document


def _wrapped(document, depth):
    for level in range(depth):
        document = agent(f"parent-{level}", child_source={
            "kind": "embedded", "document": document,
        })
    return document


def _path(depth, suffix):
    return ["document", *CHILD_PATH * depth, *suffix]


def _unchanged(store, saved, original):
    after = store.get_resource(saved["id"])
    assert after["document"] == original
    assert after["edit_token"] == saved["edit_token"]
    assert after["draft_digest"] == saved["draft_digest"]


def _assert_rows(rows):
    assert isinstance(rows, list)
    for row in rows:
        assert set(row) == {"code", "path", "message"}
        assert isinstance(row["code"], str)
        assert isinstance(row["path"], list)
        assert isinstance(row["message"], str)


@pytest.mark.parametrize("depth", [0, 1, 2])
def test_preflight_io_error_keeps_root_or_full_embedded_address(tmp_path, depth):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = _wrapped(_io_fault(agent("faulty-child")), depth)
    original = deepcopy(document)
    saved = store.save_draft(document)
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight(saved["id"])
    assert rejected.value.code == "unknown_field"
    assert rejected.value.status == 400
    assert str(rejected.value) == "default is only allowed for default policy"
    assert list(rejected.value.path) == _path(depth, IO_PATH)
    _unchanged(store, saved, original)
    assert document == original


@pytest.mark.parametrize("embedded_parent", [False, True])
def test_referenced_child_io_uses_the_existing_resolved_document_namespace(
        tmp_path, embedded_parent):
    store = SkeletonResourceStore(tmp_path / "resources")
    child = store.save_draft(_io_fault(agent("referenced-child")))
    document = agent("reference-parent", child_source={
        "kind": "agent_ref", "agent_id": child["id"],
    })
    if embedded_parent:
        document = _wrapped(document, 1)
    saved = store.save_draft(document)
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight(saved["id"])
    assert rejected.value.code == "unknown_field"
    assert rejected.value.status == 400
    assert list(rejected.value.path) == _path(2 if embedded_parent else 1, IO_PATH)
    _unchanged(store, saved, document)
    _unchanged(store, child, child["document"])


@pytest.mark.parametrize("fault,suffix", [
    ("missing-end", ["nodes"]),
    ("kernel-endpoint", ["nodes", 1, "config", "kernel", "profile", "endpoint"]),
])
def test_existing_embedded_structure_and_kernel_errors_are_not_prefixed_twice(
        tmp_path, fault, suffix):
    store = SkeletonResourceStore(tmp_path / "resources")
    child = agent("structural-child")
    if fault == "missing-end":
        _without_end(child)
    else:
        del child["nodes"][1]["config"]["kernel"]["profile"]["endpoint"]
    saved = store.save_draft(_wrapped(child, 1))
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight(saved["id"])
    assert rejected.value.status == 400
    assert list(rejected.value.path) == _path(1, suffix)
    _unchanged(store, saved, saved["document"])


def test_manifest_failure_at_child_admission_stays_global(tmp_path, monkeypatch):
    store = SkeletonResourceStore(tmp_path / "resources")
    saved = store.save_draft(_wrapped(agent("valid-child"), 1))
    protocol = importlib.import_module("unchain.runtime.runtime_protocol")
    good_manifest = protocol.runtime_protocol_manifest()
    calls = []

    def manifest():
        calls.append(None)
        return deepcopy(good_manifest) if len(calls) == 1 else {}

    # Only the external runtime producer changes; the host's strict manifest
    # parser and all actual graph validation still execute.
    monkeypatch.setattr(protocol, "runtime_protocol_manifest", manifest)
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight(saved["id"])
    assert len(calls) == 2
    assert rejected.value.code == "runtime_protocol_manifest_invalid"
    assert rejected.value.status == 409
    assert list(rejected.value.path) == ["runtime_protocol_manifest"]
    _unchanged(store, saved, saved["document"])


@pytest.mark.parametrize("source_kind", ["embedded", "agent_ref"])
def test_valid_child_admission_keeps_document_token_and_descriptor(tmp_path, source_kind):
    store = SkeletonResourceStore(tmp_path / "resources")
    child = agent("valid-child")
    if source_kind == "agent_ref":
        store.save_draft(child)
        source = {"kind": source_kind, "agent_id": child["id"]}
    else:
        source = {"kind": source_kind, "document": child}
    document = agent("valid-parent", child_source=source)
    saved = store.save_draft(document)
    assert saved["diagnostics"] == []
    admitted = store.preflight(saved["id"])
    assert admitted["document"] == document
    assert admitted["subagents"][0]["document"] == child
    assert admitted["subagents"][0]["source_kind"] == source_kind
    assert admitted["edit_token"] == saved["edit_token"]
    _unchanged(store, saved, document)


@pytest.mark.parametrize("depth", [1, 2])
@pytest.mark.parametrize("fault,code,suffix", [
    ("missing-end", "end_count", ["nodes"]),
    ("io", "unknown_field", IO_PATH),
    ("nodes-envelope", "invalid_type", ["nodes"]),
    ("unconfigured-io", "unknown_field", IO_PATH),
])
def test_incomplete_embedded_drafts_save_with_full_diagnostics_and_original_json(
        tmp_path, depth, fault, code, suffix):
    root = tmp_path / "resources"
    store = SkeletonResourceStore(root)
    child = agent("draft-child")
    if fault == "missing-end":
        _without_end(child)
    elif fault == "nodes-envelope":
        child["nodes"] = {"toString": None}
    else:
        _io_fault(child)
        if fault == "unconfigured-io":
            del child["nodes"][1]["config"]["kernel"]
    document = _wrapped(child, depth)
    original = deepcopy(document)
    saved = store.save_draft(document)
    diagnostics = saved["diagnostics"]
    _assert_rows(diagnostics)
    assert any(row["code"] == code and row["path"] == _path(depth, suffix)
               for row in diagnostics)
    assert store.diagnose(document) == diagnostics
    assert store.get_resource(saved["id"])["diagnostics"] == diagnostics
    assert SkeletonResourceStore(root).get_resource(saved["id"])["diagnostics"] == diagnostics
    assert saved["document"] == original == document
    with pytest.raises(SkeletonResourceError) as rejected:
        store.preflight(saved["id"])
    assert rejected.value.status == 400
    assert list(rejected.value.path)[:len(_path(depth, []))] == _path(depth, [])
    _unchanged(store, saved, original)


@pytest.mark.parametrize("unconfigured_root", [False, True])
def test_sibling_structure_failure_and_unconfigured_kernel_do_not_hide_child_io(
        tmp_path, unconfigured_root):
    store = SkeletonResourceStore(tmp_path / "resources")
    first = _without_end(agent("first-child"))
    document = agent("sibling-parent", child_source={"kind": "embedded", "document": first})
    pool = document["nodes"][3]
    second = deepcopy(pool["config"]["subagents"][0])
    second.update(id="second", name="Second")
    second["source"]["document"] = _io_fault(agent("second-child"))
    pool["config"]["subagents"].append(second)
    if unconfigured_root:
        del document["nodes"][1]["config"]["kernel"]
    original = deepcopy(document)
    saved = store.save_draft(document)
    diagnostics = saved["diagnostics"]
    _assert_rows(diagnostics)
    first_path = _path(1, ["nodes"])
    second_path = ["document", "nodes", 3, "config", "subagents", 1,
                   "source", "document", *IO_PATH]
    assert any(row["code"] == "end_count" and row["path"] == first_path
               for row in diagnostics)
    assert any(row["code"] == "unknown_field" and row["path"] == second_path
               for row in diagnostics)
    assert store.diagnose(document) == diagnostics
    assert store.get_resource(saved["id"])["diagnostics"] == diagnostics
    assert saved["document"] == original == document
    with pytest.raises(SkeletonResourceError):
        store.preflight(saved["id"])
    _unchanged(store, saved, original)


def test_draft_diagnostics_do_not_follow_referenced_resources(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    child = store.save_draft(_io_fault(agent("invalid-reference")))
    document = agent("reference-parent", child_source={
        "kind": "agent_ref", "agent_id": child["id"],
    })
    saved = store.save_draft(document)
    assert saved["diagnostics"] == []
    assert store.diagnose(document) == []
    with pytest.raises(SkeletonResourceError):
        store.preflight(saved["id"])
    _unchanged(store, saved, document)
    _unchanged(store, child, child["document"])


def test_http_returns_full_child_diagnostic_and_preflight_path_without_writing(
        tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    client = pupu_app.create_app().test_client()
    client.application.config["UNCHAIN_AUTH_TOKEN"] = "embedded-diagnostic-test"
    headers = {"x-unchain-auth": "embedded-diagnostic-test"}
    document = _wrapped(_io_fault(agent("http-child")), 1)
    diagnosed = client.post("/skeleton_resources/diagnose", headers=headers,
                            json={"document": document})
    assert diagnosed.status_code == 200
    assert set(diagnosed.get_json()) == {"diagnostics"}
    rows = diagnosed.get_json()["diagnostics"]
    _assert_rows(rows)
    assert any(row["code"] == "unknown_field" and row["path"] == _path(1, IO_PATH)
               for row in rows)
    saved = client.post("/skeleton_resources", headers=headers,
                        json={"document": document})
    assert saved.status_code == 200
    before = saved.get_json()
    assert before["document"] == document
    assert before["diagnostics"] == rows
    rejected = client.post(f"/skeleton_resources/{before['id']}/preflight",
                           headers=headers, json={})
    assert rejected.status_code == 400
    error = rejected.get_json()["error"]
    assert set(error) == {"code", "path", "message"}
    assert error["code"] == "unknown_field"
    assert error["path"] == _path(1, IO_PATH)
    after = client.get(f"/skeleton_resources/{before['id']}", headers=headers)
    assert after.status_code == 200
    assert after.get_json() == before
