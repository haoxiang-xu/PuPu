"""Regression from the packaged App: native v2 Save before explicit upgrade."""
from copy import deepcopy
import sys

import pytest

from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_legacy_upgrade_save import (
    apply, choices, kernel, migrate, recipe, tables,
)
from test_skeleton_legacy_upgrade_http import request_body, post, payload


@pytest.fixture
def store(tmp_path):
    return SkeletonResourceStore(tmp_path / "resources")


def managed_legacy(store, name="Managed legacy"):
    original, _ = migrate(store, recipe(name))
    document = deepcopy(original["document"])
    agent = next(node for node in document["nodes"] if node["type"] == "agent")
    agent["config"]["kernel"] = kernel([])["kernel"]
    saved = store.save_managed_draft({
        "schema": "pupu.skeleton-edit.v2", "document": document,
        "expected_edit_token": original["edit_token"], "managed_sources": [],
    })
    return saved["resource"], saved


@pytest.mark.parametrize("operation", ["inventory", "preview", "apply"])
def test_auth_upgrade_after_actual_v2_save_keeps_kernel_and_reopens(store, monkeypatch, operation):
    from app import create_app
    app = create_app()
    monkeypatch.setattr(sys.modules["route_skeleton_code_sources"], "SkeletonResourceStore", lambda: store)
    monkeypatch.setattr(sys.modules["route_skeleton_legacy_upgrade"], "SkeletonResourceStore", lambda: store)
    app.config["UNCHAIN_AUTH_TOKEN"] = "offline-test-only"
    client = app.test_client()
    raw, _ = migrate(store, recipe())
    document = deepcopy(raw["document"])
    agent = next(n for n in document["nodes"] if n["type"] == "agent")
    authored = kernel([], model="authored-model")["kernel"]
    agent["config"]["kernel"] = authored
    save = client.post("/skeleton_resources/v2", headers={"x-unchain-auth": "offline-test-only"}, json={
        "schema": "pupu.skeleton-edit.v2", "document": document,
        "expected_edit_token": raw["edit_token"], "managed_sources": [],
    })
    assert save.status_code == 200, save.get_json()
    resource = save.get_json()["resource"]
    before = tables(store)
    body = request_body(resource, choices(), operation)
    if operation == "apply":
        preview = store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=choices())
        body["expected_projection_digest"] = preview["projection_digest"]
    result, _ = payload(post(client, resource, operation, body), operation, resource)
    if operation != "apply":
        assert tables(store) == before
        return
    reopened = SkeletonResourceStore(store.root).get_managed_resource(resource["id"])
    assert reopened["resource"] == result
    assert reopened["sources_manifest"] == save.get_json()["sources_manifest"]
    assert reopened["contents"] == []
    with store._connect() as connection:
        row = connection.execute("SELECT * FROM resources WHERE resource_id=?", (resource["id"],)).fetchone()
    old_revision = int(resource["edit_token"].split("-")[1])
    assert row["edit_revision"] == old_revision + 1
    assert result["edit_token"] == store._token(row["edit_revision"], reopened["content_digest"])
    assert next(n for n in result["document"]["nodes"] if n["type"] == "agent")["config"]["kernel"] == authored
    assert result["source_identity"] == resource["source_identity"]
    for name in before:
        if name not in {"resources", "store_meta"}:
            assert tables(store)[name] == before[name]
    assert len(tables(store)["store_meta"]) == len(before["store_meta"]) + 2
    with pytest.raises(SkeletonResourceError) as refused:
        store.get_resource(resource["id"])
    assert refused.value.code == "source_api_required"


def test_managed_apply_stale_and_repeated_requests_do_not_write(store):
    resource, _ = managed_legacy(store)
    preview = store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=choices())
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as stale:
        store.apply_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"],
            expected_projection_digest="0" * 64, choices=choices())
    assert stale.value.code == "upgrade_preview_stale"
    assert tables(store) == before
    saved = store.apply_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"],
        expected_projection_digest=preview["projection_digest"], choices=choices())
    after = tables(store)
    for token, code in [(resource["edit_token"], "edit_conflict"), (saved["edit_token"], "legacy_upgrade_already_applied")]:
        with pytest.raises(SkeletonResourceError) as again:
            store.apply_legacy_upgrade(resource["id"], expected_edit_token=token,
                expected_projection_digest=preview["projection_digest"], choices=choices())
        assert again.value.code == code
        assert tables(store) == after


def test_managed_apply_response_refusal_rolls_back_resource_archive_and_receipt(store):
    resource, frame = managed_legacy(store)
    preview = store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=choices())
    before = tables(store)

    def refuse(result):
        assert result["document"] == preview["document"]
        raise SkeletonResourceError("limit_bytes", ("payload",), "response is too large", status=413)

    with pytest.raises(SkeletonResourceError) as refused:
        store.apply_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"],
            expected_projection_digest=preview["projection_digest"], choices=choices(), result_check=refuse)
    assert refused.value.code == "limit_bytes"
    assert tables(store) == before
    assert store.get_managed_resource(resource["id"]) == frame


@pytest.mark.parametrize("operation", ["inventory", "preview", "apply"])
def test_corrupt_managed_metadata_is_not_bypassed_by_upgrade(store, operation):
    from route_skeleton_legacy_upgrade import _inventory
    resource, _ = managed_legacy(store)
    with store._connect() as connection:
        connection.create_function("pupu_managed_write", 0, lambda: 1)
        connection.execute("UPDATE resources SET code_content_digest=? WHERE resource_id=?", ("0" * 64, resource["id"]))
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as refused:
        if operation == "inventory":
            _inventory(store, resource["id"], resource["edit_token"])
        elif operation == "preview":
            store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=choices())
        else:
            store.apply_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"],
                expected_projection_digest="0" * 64, choices=choices())
    assert refused.value.code == "managed_source_corrupt"
    assert tables(store) == before


def test_upgrade_parent_resolves_v2_saved_upgraded_child_with_retained_code(store):
    from test_skeleton_code_admission import code_agent, SOURCE, request, select
    from skeleton_code_admission import prepare_code_execution_material
    from skeleton_code_closure import FrozenSkeletonCodeClosure, FrozenCodeRuntimeSnapshot

    child, child_choices = migrate(store, recipe("Child"))
    upgraded, _ = apply(store, child, child_choices)
    native = code_agent(child["id"])
    native["name"] = upgraded["name"]
    saved = store.save_managed_draft(request(native, [{"node_path": ["nodes", 3], "text": SOURCE}], upgraded["edit_token"]))
    selected, workflows = prepare_code_execution_material(select(child["id"]), store=store)
    old_snapshot = FrozenCodeRuntimeSnapshot.prepare(FrozenSkeletonCodeClosure.restore(selected.code_sources, selected, workflows), workspace_root=None)
    source_path = saved["resource"]["document"]["nodes"][3]["config"]["code"]["source"]["path"]
    parent, parent_choices = migrate(store, recipe("Parent", subagent_pool=[{"kind": "recipe_ref", "recipe_name": "Child"}]))
    before = tables(store)
    result, preview = apply(store, parent, parent_choices)
    assert preview["subagents"][0]["document"] == saved["resource"]["document"]
    assert store.get_managed_resource(child["id"]) == saved
    assert tables(store)["code_source_blobs"] == before["code_source_blobs"]
    assert old_snapshot.resolver(source_path).content == SOURCE.encode()
    assert result["document"] == preview["document"]
    # The parent's graph-only public preflight must still reject a managed child.
    with pytest.raises(SkeletonResourceError) as legacy_reader:
        store.preflight(parent["id"])
    assert legacy_reader.value.code == "source_api_required"


def test_unsupported_managed_mixed_graph_refusal_retains_all_source_bytes(store):
    from test_skeleton_code_admission import code_agent, SOURCE, request
    resource, _ = managed_legacy(store)
    document = deepcopy(resource["document"])
    document["nodes"].append(deepcopy(code_agent()["nodes"][3]))
    saved = store.save_managed_draft(request(document, [{"node_path": ["nodes", 3], "text": SOURCE}], resource["edit_token"]))
    before = tables(store)
    with pytest.raises(SkeletonResourceError):
        store.preview_legacy_upgrade(resource["id"], expected_edit_token=saved["resource"]["edit_token"], choices=choices())
    assert tables(store) == before
    assert store.get_managed_resource(resource["id"]) == saved

