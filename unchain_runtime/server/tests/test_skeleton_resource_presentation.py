"""BC-AP-002/003/004: display-only ``document.presentation`` through the real store.

Real producer (SkeletonResourceStore over a temp SQLite root, validated by the
imported unchain) against strict consumers written here: exact key sets, exact
values, nothing stored on refusal. No provider, no network, never the user's
real store.
"""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

import pytest

import app as pupu_app
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from tests.test_skeleton_code_sources import edit as managed_edit
from unchain.runtime.runtime_protocol import runtime_protocol_manifest
from unchain.skeleton import prepare_agent_graph
from unchain.skeleton.agent_preparation import execution_definition_digest

LIST_KEYS = {"id", "kind", "name", "description", "archived", "edit_token", "draft_digest",
             "source_identity", "presentation"}
GET_KEYS = (LIST_KEYS - {"presentation"}) | {"document", "diagnostics"}
MANAGED_RESOURCE_KEYS = {"id", "kind", "name", "description", "archived", "edit_token",
                         "draft_digest", "source_identity", "document", "diagnostics"}
DOCUMENT_KEYS = {"schema_version", "kind", "id", "name", "nodes", "edges"}

PRESENTATION = {"icon": "robot", "color": "#1a2b3c"}
NEXT_PRESENTATION = {"icon": "owl", "color": "#ffffff"}


def agent(resource_id="agent-a", name="Agent A", presentation=None):
    document = {"schema_version": 1, "kind": "agent", "id": resource_id, "name": name,
                "description": "", "nodes": [], "edges": []}
    if presentation is not None:
        document["presentation"] = deepcopy(presentation)
    return document


@pytest.fixture
def store(tmp_path):
    return SkeletonResourceStore(tmp_path / "skeletons")


def listed(store, resource_id):
    rows = [row for row in store.list_resources() if row["id"] == resource_id]
    assert len(rows) == 1
    return rows[0]


def strict_get(value):
    assert set(value) == GET_KEYS
    assert set(value["document"]) <= DOCUMENT_KEYS | {"description", "presentation"}
    return value


def test_first_save_list_get_resolve_return_presentation_exactly(store):
    saved = strict_get(store.save_draft(agent(presentation=PRESENTATION)))
    assert saved["document"]["presentation"] == PRESENTATION

    row = listed(store, "agent-a")
    assert set(row) == LIST_KEYS
    assert row["presentation"] == PRESENTATION

    got = strict_get(store.get_resource("agent-a"))
    assert got["document"]["presentation"] == PRESENTATION
    assert set(got["document"]["presentation"]) == {"icon", "color"}

    resolved = strict_get(store.resolve(resource_id="agent-a"))
    assert resolved["document"]["presentation"] == PRESENTATION
    assert resolved == got
    # list rows are detached from each other
    row["presentation"]["icon"] = "changed"
    assert listed(store, "agent-a")["presentation"] == PRESENTATION


def test_second_save_changes_and_then_removes_it(store):
    first = store.save_draft(agent(presentation=PRESENTATION))
    second = strict_get(store.save_draft(agent(presentation=NEXT_PRESENTATION),
                                         expected_edit_token=first["edit_token"]))
    assert second["document"]["presentation"] == NEXT_PRESENTATION
    assert second["edit_token"] != first["edit_token"]
    assert second["draft_digest"] != first["draft_digest"]
    assert listed(store, "agent-a")["presentation"] == NEXT_PRESENTATION
    assert store.resolve(resource_id="agent-a")["document"]["presentation"] == NEXT_PRESENTATION

    third = strict_get(store.save_draft(agent(), expected_edit_token=second["edit_token"]))
    assert "presentation" not in third["document"]
    assert listed(store, "agent-a")["presentation"] is None


def test_document_without_presentation_reads_null_everywhere(store):
    store.save_draft(agent())
    assert listed(store, "agent-a")["presentation"] is None
    got = strict_get(store.get_resource("agent-a"))
    assert "presentation" not in got["document"]
    assert "presentation" not in store.resolve(resource_id="agent-a")["document"]


@pytest.mark.parametrize("presentation, code, path", [
    ({"icon": "robot", "label": "x"}, "unknown_field", ["document", "presentation", "label"]),
    ("robot", "invalid_type", ["document", "presentation"]),
    (None, "invalid_type", ["document", "presentation"]),
    ({"icon": "Robot"}, "invalid_value", ["document", "presentation", "icon"]),
    ({"color": "#ABCDEF"}, "invalid_value", ["document", "presentation", "color"]),
    ({"color": "#fff"}, "invalid_value", ["document", "presentation", "color"]),
    ({"icon": 3}, "invalid_type", ["document", "presentation", "icon"]),
])
def test_invalid_presentation_is_refused_with_the_unchain_code_and_nothing_is_stored(
        store, presentation, code, path):
    document = agent()
    document["presentation"] = presentation
    with pytest.raises(SkeletonResourceError) as error:
        store.save_draft(document)
    assert error.value.code == code
    assert list(error.value.path) == path
    assert store.list_resources() == []


def test_invalid_presentation_on_update_keeps_the_previous_row(store):
    first = store.save_draft(agent(presentation=PRESENTATION))
    bad = agent(presentation={"color": "#ABCDEF"})
    with pytest.raises(SkeletonResourceError):
        store.save_draft(bad, expected_edit_token=first["edit_token"])
    row = listed(store, "agent-a")
    assert row["edit_token"] == first["edit_token"]
    assert row["presentation"] == PRESENTATION


def test_import_preserves_presentation_and_is_idempotent(store):
    imported = strict_get(store.import_resource(agent("imported", "Imported", PRESENTATION)))
    again = store.import_resource(agent("imported", "Imported", PRESENTATION))
    assert imported["document"]["presentation"] == PRESENTATION
    assert listed(store, "imported")["presentation"] == PRESENTATION
    assert again["edit_token"] == imported["edit_token"]


def test_managed_aggregate_keeps_its_closed_resource_shape_and_carries_presentation_in_document(store):
    request = managed_edit()
    request["document"]["presentation"] = deepcopy(PRESENTATION)
    saved = store.save_managed_draft(request)
    assert set(saved["resource"]) == MANAGED_RESOURCE_KEYS
    assert saved["resource"]["document"]["presentation"] == PRESENTATION
    got = store.get_managed_resource("managed-code")
    assert set(got["resource"]) == MANAGED_RESOURCE_KEYS
    assert got["resource"]["document"]["presentation"] == PRESENTATION
    # The list reads managed rows from draft_json too.
    assert listed(store, "managed-code")["presentation"] == PRESENTATION
    # Parked, unchanged behaviour: the graph-only v1 get refuses managed rows,
    # with or without a presentation.
    with pytest.raises(SkeletonResourceError) as error:
        store.get_resource("managed-code")
    assert error.value.code == "source_api_required"

    second = deepcopy(request)
    second["document"] = deepcopy(saved["resource"]["document"])
    second["document"]["presentation"] = deepcopy(NEXT_PRESENTATION)
    second["expected_edit_token"] = saved["resource"]["edit_token"]
    resaved = store.save_managed_draft(second)
    assert resaved["resource"]["document"]["presentation"] == NEXT_PRESENTATION
    assert resaved["contents"] == saved["contents"]
    assert listed(store, "managed-code")["presentation"] == NEXT_PRESENTATION


def test_legacy_row_without_the_key_lists_as_null(store):
    store.save_draft(agent("legacy-a", "Legacy"))
    with store._connect() as connection:
        connection.execute("UPDATE resources SET source_identity=? WHERE resource_id=?",
                           ("/tmp/legacy.recipe", "legacy-a"))
    row = listed(store, "legacy-a")
    assert row["presentation"] is None
    assert row["source_identity"] == "/tmp/legacy.recipe"


def test_embedded_subagent_documents_carry_it(store):
    child = {"schema_version": 1, "kind": "agent", "id": "child", "name": "Child",
             "presentation": {"icon": "owl"}, "nodes": [], "edges": []}
    parent = agent("parent", "Parent", PRESENTATION)
    parent["nodes"] = [{"id": "pool", "type": "subagent_pool", "config": {"subagents": [{
        "id": "c", "name": "Child", "description": "", "source": {"kind": "embedded", "document": child},
        "allowed_modes": ["delegate"], "output_mode": "summary", "memory_policy": "ephemeral",
        "parallel_safe": True, "allowed_tools": None, "disabled_tools": []}]}}]
    saved = store.save_draft(parent)
    stored_child = saved["document"]["nodes"][0]["config"]["subagents"][0]["source"]["document"]
    assert stored_child["presentation"] == {"icon": "owl"}
    bad = deepcopy(parent)
    bad["id"] = "parent-bad"
    bad["nodes"][0]["config"]["subagents"][0]["source"]["document"]["presentation"] = {"icon": "Owl"}
    # Draft save validates the envelope only; the embedded document is
    # checked by preparation (draft diagnostics) at its nested path.
    saved_bad = store.save_draft(bad)
    paths = [tuple(item["path"]) for item in saved_bad["diagnostics"]]
    assert any(path[-2:] == ("presentation", "icon") for path in paths), saved_bad["diagnostics"]


def test_presentation_never_changes_the_prepared_plan_or_definition_digest():
    from tests.test_skeleton_resource_store import kernel_config
    base = {"schema_version": 1, "kind": "agent", "id": "run", "name": "Run",
            "nodes": [
                {"id": "s", "type": "start", "config": {"execution": {"outputs": [
                    {"name": "message", "source": {"kind": "result", "path": ["message"]}}]}}},
                {"id": "k", "type": "agent", "config": {"execution": {
                    "inputs": [{"name": "message", "value": {"kind": "ref", "node_id": "s", "path": ["message"]}, "missing": "error"}],
                    "outputs": [{"name": "text", "source": {"kind": "result", "path": ["text"]}}]},
                    "kernel": kernel_config()}},
                {"id": "e", "type": "end", "config": {"execution": {
                    "inputs": [{"name": "text", "value": {"kind": "ref", "node_id": "k", "path": ["text"]}, "missing": "error"}],
                    "outputs": [{"name": "text", "source": {"kind": "input", "path": ["text"]}}]}}}],
            "edges": [
                {"id": "a", "kind": "flow", "source_node_id": "s", "source_port_id": "out", "target_node_id": "k", "target_port_id": "in"},
                {"id": "b", "kind": "flow", "source_node_id": "k", "source_port_id": "out", "target_node_id": "e", "target_port_id": "in"}]}
    decorated = deepcopy(base)
    decorated["presentation"] = deepcopy(PRESENTATION)
    plain_plan = prepare_agent_graph(base)
    plan = prepare_agent_graph(decorated)
    assert plan == plain_plan
    assert "presentation" not in json.dumps(plan.snapshot())
    assert execution_definition_digest(plan) == execution_definition_digest(plain_plan)


def test_imported_runtime_advertises_the_presentation_feature():
    protocol = next(item for item in runtime_protocol_manifest()["protocols"]
                    if item["id"] == "skeleton_execution")
    assert protocol["major"] == 1 and protocol["minor"] >= 9
    assert "document_presentation_v1" in protocol["features"]


def test_real_http_save_list_get_resolve():
    with tempfile.TemporaryDirectory() as tmp, patch("pathlib.Path.home", return_value=Path(tmp)):
        client = pupu_app.create_app().test_client()
        created = client.post("/skeleton_resources", json={"document": agent(presentation=PRESENTATION)})
        assert created.status_code == 200, created.get_json()
        assert set(created.get_json()) == GET_KEYS
        rows = client.get("/skeleton_resources").get_json()["resources"]
        assert [set(row) for row in rows] == [LIST_KEYS]
        assert rows[0]["presentation"] == PRESENTATION
        got = client.get("/skeleton_resources/agent-a").get_json()
        assert set(got) == GET_KEYS and got["document"]["presentation"] == PRESENTATION
        resolved = client.post("/skeleton_resources/resolve", json={"resource_id": "agent-a"}).get_json()
        assert set(resolved) == GET_KEYS and resolved["document"]["presentation"] == PRESENTATION
        refused = client.post("/skeleton_resources", json={
            "document": agent("bad", "Bad", {"color": "#ABCDEF"})})
        assert refused.status_code == 400
        assert refused.get_json()["error"]["code"] == "invalid_value"
        assert refused.get_json()["error"]["path"] == ["document", "presentation", "color"]
        assert [row["id"] for row in client.get("/skeleton_resources").get_json()["resources"]] == ["agent-a"]
