"""Regression from the packaged App: native v2 Save before explicit upgrade."""
from copy import deepcopy

import pytest

from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_legacy_upgrade_save import (
    apply, choices, kernel, migrate, recipe, tables,
)


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


@pytest.mark.parametrize("operation", ["preview", "apply"])
def test_corrupt_managed_metadata_is_not_bypassed_by_upgrade(store, operation):
    resource, _ = managed_legacy(store)
    with store._connect() as connection:
        connection.create_function("pupu_managed_write", 0, lambda: 1)
        connection.execute("UPDATE resources SET code_content_digest=? WHERE resource_id=?", ("0" * 64, resource["id"]))
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as refused:
        if operation == "preview":
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
