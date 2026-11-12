"""BC-NL-001/003: display-only ``document.layout`` through the real store.

Real producer (SkeletonResourceStore over a temp SQLite root, validated by the
imported unchain) against strict consumers written here: exact values,
nothing stored on refusal, the same layout after a cold reopen of the store,
and an execution digest that no move can change. Never the user's real store.
"""
from copy import deepcopy

import pytest

from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from unchain.runtime.runtime_protocol import runtime_protocol_manifest
from unchain.skeleton import prepare_workflow
from unchain.skeleton.recovery import workflow_definition_digest

LAYOUT = {"nodes": {"s": {"x": 80, "y": 80}, "k": {"x": 340, "y": 80}, "e": {"x": 600, "y": 80}}}
MOVED = {"nodes": {"s": {"x": 80, "y": 80}, "k": {"x": 340, "y": 400}, "e": {"x": 600, "y": 80}}}


def agent(layout=None):
    document = {
        "schema_version": 1, "kind": "agent", "id": "agent-a", "name": "Agent A", "description": "",
        "nodes": [{"id": "s", "type": "start", "config": {"execution": {"outputs": []}}},
                  {"id": "k", "type": "agent", "config": {"execution": {"inputs": [], "outputs": []}}},
                  {"id": "e", "type": "end", "config": {"execution": {"inputs": [], "outputs": []}}}],
        "edges": [{"id": "f1", "kind": "flow", "source_node_id": "s", "source_port_id": "out", "target_node_id": "k", "target_port_id": "in"},
                  {"id": "f2", "kind": "flow", "source_node_id": "k", "source_port_id": "out", "target_node_id": "e", "target_port_id": "in"}],
    }
    if layout is not None:
        document["layout"] = deepcopy(layout)
    return document


@pytest.fixture
def root(tmp_path):
    return tmp_path / "skeletons"


def test_layout_is_stored_and_read_back_exactly_including_after_a_cold_reopen(root):
    store = SkeletonResourceStore(root)
    saved = store.save_draft(agent(LAYOUT))
    assert saved["document"]["layout"] == LAYOUT
    assert store.get_resource("agent-a")["document"]["layout"] == LAYOUT
    reopened = SkeletonResourceStore(root)
    assert reopened.get_resource("agent-a")["document"]["layout"] == LAYOUT
    assert reopened.resolve(resource_id="agent-a")["document"]["layout"] == LAYOUT


def test_second_save_moves_a_node_and_a_third_removes_the_layout(root):
    store = SkeletonResourceStore(root)
    first = store.save_draft(agent(LAYOUT))
    second = store.save_draft(agent(MOVED), expected_edit_token=first["edit_token"])
    assert store.get_resource("agent-a")["document"]["layout"] == MOVED
    store.save_draft(agent(), expected_edit_token=second["edit_token"])
    assert "layout" not in store.get_resource("agent-a")["document"]


@pytest.mark.parametrize("layout,code", [
    ({"nodes": {"ghost": {"x": 0, "y": 0}}}, "missing_value"),
    ({"nodes": {"s": {"x": "1", "y": 0}}}, "invalid_type"),
    ({"nodes": {}, "viewport": {}}, "unknown_field"),
    ({"nodes": {"s": {"x": 2_000_000, "y": 0}}}, "invalid_value"),
])
def test_a_refused_layout_stores_nothing(root, layout, code):
    store = SkeletonResourceStore(root)
    with pytest.raises(SkeletonResourceError) as error:
        store.save_draft(agent(layout))
    assert error.value.code == code
    assert error.value.path[:2] == ("document", "layout")
    assert [row for row in store.list_resources() if row["id"] == "agent-a"] == []


def workflow(layout=None):
    document = {
        "schema_version": 1, "kind": "workflow", "id": "wf-a", "name": "Workflow A", "description": "",
        "nodes": [{"id": "s", "type": "start", "config": {"execution": {"outputs": []}}},
                  {"id": "e", "type": "end", "config": {"execution": {"inputs": [], "outputs": []}}}],
        "edges": [{"id": "f1", "kind": "flow", "source_node_id": "s", "source_port_id": "out", "target_node_id": "e", "target_port_id": "in"}],
    }
    if layout is not None:
        document["layout"] = deepcopy(layout)
    return document


def test_a_move_never_changes_the_execution_digest(root):
    store = SkeletonResourceStore(root)
    plain = store.save_draft(workflow())
    moved = store.save_draft(workflow({"nodes": {"s": {"x": 1, "y": 2}, "e": {"x": 900, "y": -4}}}),
                             expected_edit_token=plain["edit_token"])
    assert moved["document"]["layout"]["nodes"]["e"] == {"x": 900, "y": -4}
    assert workflow_definition_digest(prepare_workflow(moved["document"])) == \
        workflow_definition_digest(prepare_workflow(plain["document"]))


def test_the_imported_runtime_advertises_layout():
    protocol = next(p for p in runtime_protocol_manifest()["protocols"] if p["id"] == "skeleton_execution")
    assert protocol["major"] == 1 and protocol["minor"] >= 10
    assert "document_layout_v1" in protocol["features"]
