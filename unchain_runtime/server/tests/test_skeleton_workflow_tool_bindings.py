"""Real Store selection/closure and production bindings for Workflow Tools."""
from copy import deepcopy

import pytest

from skeleton_chat_selection import prepare_skeleton_chat_selection
from skeleton_production_bindings import SkeletonProductionBindings
from skeleton_resource_store import SkeletonResourceStore, SkeletonResourceError
from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies
from test_skeleton_resource_store import agent
from test_skeleton_workflow_tools import document, entry, workflow
from types import SimpleNamespace


def selected(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    saved = store.save_draft(workflow())
    version = store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    parent = agent("parent")
    pool = deepcopy(document()["nodes"][2])
    pool["config"]["workflow_tools"][0]["workflow"]["revision_id"] = version["revision_id"]
    parent["nodes"].append(pool)
    parent["edges"].append({"id": "attach-workflow", "kind": "attach", "source_node_id": "kernel",
        "source_port_id": "attach_bot", "target_node_id": "pool", "target_port_id": "attach_top"})
    saved_parent = store.save_draft(parent)
    selection = prepare_skeleton_chat_selection({"skeleton_selection": {
        "schema": "pupu.skeleton_chat_selection.v1", "kind": "resource", "resource_id": "parent"}}, store=store)
    return store, version, saved_parent, selection


def test_real_store_freezes_exact_version_and_binding_uses_that_closure(tmp_path):
    store, version, _saved, selection = selected(tmp_path)
    assert selection.to_dict()["dependencies"] == [{
        "workflow_id": "echo", "revision_id": version["revision_id"],
        "definition_digest": version["definition_digest"],
    }]
    fixed = freeze_skeleton_workflow_dependencies(selection, store=store)
    host = SkeletonProductionBindings(selection, fixed, {}, session_id="binding-session",
        workspace_root=str(tmp_path), resource_store=store)
    context = SimpleNamespace(document_id="parent", node_id="kernel")
    bindings = host.workflow_tools_for_node(context)
    assert len(bindings) == 1
    assert bindings[0].workflow_id == "echo"
    assert bindings[0].revision_id == version["revision_id"]
    assert bindings[0].definition_digest == version["definition_digest"]
    assert bindings[0].plan.snapshot() == version["document"]
    assert host.tools_for_node(context) == ()
    # Once admitted, changing the live Workflow draft cannot change this run.
    live = store.get_resource("echo")
    changed = deepcopy(live["document"]); changed["name"] = "A later draft"
    store.save_draft(changed, expected_edit_token=live["edit_token"])
    assert host.workflow_tools_for_node(context)[0].plan.snapshot() == version["document"]


def test_malformed_saved_binding_is_refused_by_real_preflight(tmp_path):
    store, _version, saved, _selection = selected(tmp_path)
    parent = deepcopy(saved["document"])
    parent["nodes"][-1]["config"]["workflow_tools"][0]["workflow"]["latest"] = True
    store.save_draft(parent, expected_edit_token=saved["edit_token"])
    with pytest.raises(SkeletonResourceError) as caught:
        store.preflight("parent")
    assert caught.value.code == "invalid_shape"
    assert caught.value.path[-1] == "workflow"
