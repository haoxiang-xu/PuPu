"""Real Store/source ownership and independently checked embedded Hook capability."""
from copy import deepcopy
from contextlib import closing
from hashlib import sha256
import importlib
import json
import pytest

from skeleton_resource_store import SkeletonResourceStore, SkeletonResourceError
from skeleton_runtime_capability import SkeletonRuntimeCompatibilityError
from skeleton_code_closure import FrozenCodeRuntimeSnapshot
from test_skeleton_hook_enabled import hooked, edit, select
from test_skeleton_hook_tool_sets import publish_policy

EXPECTED = {"schema": "unchain.skeleton_hook_workflow.v1", "field": "workflow",
    "reference_fields": ["revision_id", "workflow_id"], "embedded_fields": ["document", "kind"],
    "embedded_kind": "embedded", "document_kind": "workflow", "identity": "embedded-sha256"}


def flow(*, code=False, reference=None):
    names = ["decision", "require_approval"]
    start = {"id": "start", "type": "start", "config": {"execution": {"outputs": []}}}
    inputs = [{"name": "decision", "value": {"kind": "literal", "value": "continue"}, "missing": "error"},
              {"name": "require_approval", "value": {"kind": "literal", "value": False}, "missing": "error"}]
    nodes = [start]
    if code or reference:
        kind = "code" if code else "workflow_call"
        config = {"execution": {"inputs": [], "outputs": [
            {"name": name, "source": {"kind": "result", "path": [name]}} for name in names]}}
        if code:
            config["code"] = {"source": {"kind": "file", "path": "owned.py"},
                "environment_profile_id": "builtin", "timeout_ms": 5000,
                "max_result_bytes": 4096, "max_log_bytes": 4096,
                "result_schema": {"type": "object", "properties": {"decision": {"type": "string"},
                    "require_approval": {"type": "boolean"}}, "required": names, "additionalProperties": False}}
        else: config["workflow"] = reference
        nodes.append({"id": "step", "type": kind, "config": config})
        inputs = [{"name": name, "value": {"kind": "ref", "node_id": "step", "path": [name]}, "missing": "error"} for name in names]
    nodes.append({"id": "end", "type": "end", "config": {"execution": {"inputs": inputs,
        "outputs": [{"name": name, "source": {"kind": "input", "path": [name]}} for name in names]}}})
    edges = [{"id": "edge-"+str(i), "kind": "flow", "source_node_id": nodes[i]["id"],
        "source_port_id": "out", "target_node_id": nodes[i+1]["id"], "target_port_id": "in"} for i in range(len(nodes)-1)]
    return {"schema_version": 1, "kind": "workflow", "id": "owned-hook", "name": "Owned Hook", "nodes": nodes, "edges": edges}


def document(*, code=False, reference=None, enabled=True):
    doc = hooked(enabled)
    doc["nodes"][-1]["config"]["hooks"][0]["workflow"] = {"kind": "embedded", "document": flow(code=code, reference=reference)}
    return doc


def source_edit(doc, text, token=None):
    value = edit(doc, token)
    value["managed_sources"] = [{"node_path": ["nodes", len(doc["nodes"])-1, "config", "hooks", 0,
        "workflow", "document", "nodes", 1], "text": text}]
    return value


def capabilities():
    getter = getattr(importlib.import_module("skeleton_hook_capability"), "hook_workflow_capabilities", None)
    assert callable(getter), "the host needs an independent closed workflow-source reader"
    return getter()


def test_actual_producer_capability_is_closed_and_old_envelopes_are_unchanged():
    answer = capabilities()
    assert set(answer) == {"schema", "runtime_manifest_digest", "workflow_source"}
    assert answer["schema"] == "pupu.skeleton_hook_workflow_capabilities.v1"
    assert answer["workflow_source"] == EXPECTED
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest
    assert answer["runtime_manifest_digest"] == runtime_protocol_manifest()["manifest_digest"]
    old = importlib.import_module("skeleton_hook_capability")
    assert set(old.hook_enable_capabilities()) == {"schema", "runtime_manifest_digest", "hook_entry"}
    assert set(old.hook_tool_set_capabilities()) == {"schema", "runtime_manifest_digest", "tool_matcher"}


@pytest.mark.parametrize("mutation", ["extra", "schema", "identity", "kind", "fields", "absent", "throw"])
def test_malformed_real_getter_is_rejected_without_leaking_exceptions(monkeypatch, mutation):
    import unchain.skeleton.hooks_config as producer
    raw = deepcopy(EXPECTED)
    if mutation == "extra": raw["extra"] = True
    if mutation == "schema": raw["schema"] = "future"
    if mutation == "identity": raw["identity"] = "latest"
    if mutation == "kind": raw["document_kind"] = "agent"
    if mutation == "fields": raw["embedded_fields"] = ["kind", "document"]
    if mutation == "throw":
        def bad(): raise RuntimeError("do-not-expose-this-sentinel")
        monkeypatch.setattr(producer, "hook_workflow_contract", bad, raising=False)
    else:
        monkeypatch.setattr(producer, "hook_workflow_contract", None if mutation == "absent" else lambda: deepcopy(raw), raising=False)
    with pytest.raises(SkeletonRuntimeCompatibilityError) as error: capabilities()
    assert error.value.code == "skeleton_hook_workflow_unavailable"
    assert "do-not-expose" not in str(error.value)


def test_embedded_policy_needs_no_published_resource_and_survives_store_cold_read(tmp_path):
    store = SkeletonResourceStore(tmp_path/"resources"); doc = document()
    saved = store.save_managed_draft(edit(doc)); selected, dependencies = select(store)
    assert selected.to_dict()["document"] == doc
    assert dependencies.dependencies == []
    assert SkeletonResourceStore(store.root).get_managed_resource(doc["id"]) == saved
    from skeleton_production_state import _restore_workflows
    assert _restore_workflows(selected, dependencies.to_dict()).snapshot_digest == dependencies.snapshot_digest
    with closing(store._connect()) as c:
        assert c.execute("SELECT count(*) FROM resources").fetchone()[0] == 1
        assert c.execute("SELECT count(*) FROM workflow_versions").fetchone()[0] == 0


def test_nested_published_dependency_is_in_the_exact_retained_closure(tmp_path):
    store = SkeletonResourceStore(tmp_path/"resources"); version = publish_policy(store)
    doc = document(reference={"workflow_id": version["workflow_id"], "revision_id": version["revision_id"]})
    store.save_managed_draft(edit(doc)); selected, dependencies = select(store)
    assert dependencies.dependencies == [{"workflow_id": version["workflow_id"], "revision_id": version["revision_id"],
        "definition_digest": version["definition_digest"]}]
    from skeleton_production_state import _restore_workflows
    assert _restore_workflows(selected, dependencies.to_dict()).snapshot_digest == dependencies.snapshot_digest


def test_source_owner_is_parent_and_old_runtime_bytes_survive_a_later_save(tmp_path):
    store = SkeletonResourceStore(tmp_path/"resources"); doc = document(code=True)
    a = 'def main(input, context):\n    return {"decision":"continue","require_approval":False}\n'
    b = a.replace('False', 'True')
    first = store.save_managed_draft(source_edit(doc, a)); old, deps = select(store)
    from skeleton_code_closure import FrozenSkeletonCodeClosure
    closure = FrozenSkeletonCodeClosure.restore(old.code_sources, old, deps)
    runtime = FrozenCodeRuntimeSnapshot.prepare(closure, workspace_root=None)
    body = first["resource"]["document"]["nodes"][-1]["config"]["hooks"][0]["workflow"]["document"]
    path = body["nodes"][1]["config"]["code"]["source"]["path"]
    assert runtime.resolver(path).content == a.encode()
    assert [(x["kind"], x["id"]) for x in old.code_sources["owners"]] == [("resource", doc["id"])]
    assert old.code_sources["bindings"][0]["document_path"] == ["nodes",len(doc["nodes"])-1,"config","hooks",0,"workflow","document"]
    second = store.save_managed_draft(source_edit(first["resource"]["document"], b, first["resource"]["edit_token"]))
    newer, newer_deps = select(store)
    restored = FrozenCodeRuntimeSnapshot.restore(runtime.to_dict(), old, deps)
    assert restored.resolver(path).content == a.encode()
    assert old.to_dict() != newer.to_dict()
    assert SkeletonResourceStore(store.root).get_managed_resource(doc["id"]) == second
    with pytest.raises(SkeletonResourceError) as rejected:
        store.save_managed_draft(source_edit(doc, 'stale body', first["resource"]["edit_token"]))
    assert rejected.value.code == "edit_conflict"
    with closing(store._connect()) as c:
        assert c.execute("SELECT count(*) FROM code_source_blobs WHERE sha256=?", (sha256(b'stale body').hexdigest(),)).fetchone()[0] == 0


def test_embedded_code_profile_error_names_the_inner_address(tmp_path):
    store = SkeletonResourceStore(tmp_path/"resources"); doc = document(code=True)
    doc["nodes"][-1]["config"]["hooks"][0]["workflow"]["document"]["nodes"][1]["config"]["code"]["environment_profile_id"] = "missing-profile"
    store.save_managed_draft(edit(doc))
    with pytest.raises(SkeletonResourceError) as error: select(store)
    assert error.value.code == "profile_missing"
    assert error.value.path == ("document","nodes",len(doc["nodes"])-1,"config","hooks",0,"workflow","document","nodes",1,"config","code","environment_profile_id")


def test_disabled_owned_body_retains_sources_but_does_not_acquire_a_runtime_dependency(tmp_path):
    store = SkeletonResourceStore(tmp_path/"resources"); doc = document(code=True, enabled=False)
    body = doc["nodes"][-1]["config"]["hooks"][0]["workflow"]["document"]
    body["nodes"][1]["config"]["code"]["environment_profile_id"] = "not-installed"
    store.save_managed_draft(edit(doc)); selected, deps = select(store)
    from skeleton_code_closure import FrozenSkeletonCodeClosure
    closure = FrozenSkeletonCodeClosure.restore(selected.code_sources, selected, deps)
    assert closure.paths() == ({}, set())
    FrozenCodeRuntimeSnapshot.prepare(closure, workspace_root=None)


def test_new_capability_query_is_auth_required_and_does_not_replace_old_selectors():
    from flask import Flask
    from route_skeleton_resources import api_blueprint
    app=Flask(__name__); app.config["UNCHAIN_AUTH_TOKEN"]="test-only-token";app.register_blueprint(api_blueprint)
    client=app.test_client();url="/skeleton_hooks/capabilities?contract=embedded_workflow_v1";headers={"x-unchain-auth":"test-only-token"}
    assert client.get(url).status_code == 401
    response = client.get(url,headers=headers)
    assert response.status_code == 200 and response.get_json() == capabilities()
    for query in ["contract=embedded_workflow_v1&contract=embedded_workflow_v1", "contract=embedded_workflow_v1&extra=true"]:
        assert client.get("/skeleton_hooks/capabilities?"+query,headers=headers).status_code == 400


@pytest.mark.parametrize("mode", ["missing-feature", "old-minor"])
def test_new_wire_requires_its_real_runtime_feature_even_when_off(tmp_path, monkeypatch, mode):
    from unchain.runtime import runtime_protocol
    from test_skeleton_runtime_capability import _signed
    manifest = deepcopy(runtime_protocol.runtime_protocol_manifest())
    protocol = next(p for p in manifest["protocols"] if p["id"] == "skeleton_execution")
    if mode == "missing-feature": protocol["features"].remove("hook_embedded_workflow_v1")
    else: protocol["minor"] = 3
    manifest = _signed(manifest)
    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: deepcopy(manifest))
    store = SkeletonResourceStore(tmp_path/"resources"); doc = document(enabled=False)
    saved = store.save_managed_draft(edit(doc))
    with pytest.raises(SkeletonResourceError) as error: select(store)
    assert error.value.code == "skeleton_hook_workflow_unavailable"
    assert error.value.status == 409
    assert store.get_managed_resource(doc["id"]) == saved
    # The old representation does not acquire the new optional capability.
    legacy = hooked(False)
    store.save_managed_draft(edit(legacy, saved["resource"]["edit_token"]))
    assert select(store)[1].dependencies == []


@pytest.mark.parametrize("at,value", [(1,False),(4,"0"),(3,[]),(5,{}),(6,None),(8,-1)])
def test_unreadable_source_addresses_fail_typed_before_any_store_write(at, value, tmp_path):
    store = SkeletonResourceStore(tmp_path/"resources"); doc = document(code=True)
    request = source_edit(doc, "def main(input, context): return {}")
    request["managed_sources"][0]["node_path"][at] = value
    with pytest.raises(SkeletonResourceError) as error: store.save_managed_draft(request)
    assert error.value.code == "invalid_target"
    assert store.list_resources() == []


def test_disabled_managed_body_keeps_bytes_without_requiring_its_profile(tmp_path):
    store = SkeletonResourceStore(tmp_path/"resources"); doc = document(code=True, enabled=False)
    doc["nodes"][-1]["config"]["hooks"][0]["workflow"]["document"]["nodes"][1]["config"]["code"]["environment_profile_id"] = "not-installed"
    text = 'def main(input, context):\n    return {"decision":"continue","require_approval":False}\n'
    saved = store.save_managed_draft(source_edit(doc, text)); selected, dependencies = select(store)
    assert selected.code_sources["contents"][0]["text"] == text
    from skeleton_code_closure import FrozenSkeletonCodeClosure
    closure = FrozenSkeletonCodeClosure.restore(selected.code_sources, selected, dependencies)
    assert closure.paths() == ({},set())
    FrozenCodeRuntimeSnapshot.prepare(closure, workspace_root=None)
    assert store.get_managed_resource(doc["id"]) == saved


def test_embedded_identity_cannot_repeat_its_parent_definition(tmp_path):
    store = SkeletonResourceStore(tmp_path/"resources"); doc = document()
    doc["nodes"][-1]["config"]["hooks"][0]["workflow"]["document"]["id"] = doc["id"]
    store.save_managed_draft(edit(doc))
    with pytest.raises(SkeletonResourceError) as error: select(store)
    assert error.value.code == "recursive_reference"
