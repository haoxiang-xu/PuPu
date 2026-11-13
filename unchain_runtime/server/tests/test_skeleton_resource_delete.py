"""Delete real resource aggregates with CAS and cold-reopen checks."""
from copy import deepcopy

import pytest

from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore, migrate_known_legacy_sources
from skeleton_code_sources import ManagedCodeSourceResolver
from tests.test_skeleton_code_sources import edit
from tests.test_skeleton_code_source_store import logical_state, response_snapshot
from tests.test_skeleton_code_publish import message_workflow, publish, SOURCE_A
from tests.test_skeleton_code_admission import request
from tests.test_skeleton_legacy_auto_upgrade import seeded
from tests.test_skeleton_code_routes import authenticated_client


@pytest.fixture
def store(tmp_path):
    return SkeletonResourceStore(tmp_path / "store")


def test_delete_source_aggregate_and_cold_reopen_preserve_detached_snapshot(store):
    saved = store.save_managed_draft(edit())
    snapshot = response_snapshot(saved)
    path = snapshot["document"]["nodes"][1]["config"]["code"]["source"]["path"]
    resource = saved["resource"]
    store.delete_managed_resource(resource["id"], expected_edit_token=resource["edit_token"])
    cold = SkeletonResourceStore(store.root)
    assert cold.list_resources() == []
    with pytest.raises(SkeletonResourceError) as caught:
        cold.get_managed_resource(resource["id"])
    assert (caught.value.code, caught.value.status) == ("resource_missing", 404)
    assert ManagedCodeSourceResolver(snapshot)(path).content == saved["contents"][0]["text"].encode()
    with pytest.raises(SkeletonResourceError) as repeated:
        cold.delete_managed_resource(resource["id"], expected_edit_token=resource["edit_token"])
    assert repeated.value.code == "resource_missing"


def test_delete_stale_token_leaves_all_tables_unchanged(store):
    saved = store.save_managed_draft(edit())["resource"]
    before = logical_state(store)
    with pytest.raises(SkeletonResourceError) as caught:
        store.delete_managed_resource(saved["id"], expected_edit_token="old-token")
    assert caught.value.code == "edit_conflict"
    assert logical_state(store) == before


def test_delete_published_managed_workflow_removes_its_versions(store):
    saved = store.save_managed_draft(request(message_workflow(), [{"node_path": ["nodes", 1], "text": SOURCE_A}]))
    version = publish(store, saved)
    store.delete_managed_resource(saved["resource"]["id"], expected_edit_token=saved["resource"]["edit_token"])
    with store._connect() as connection:
        assert connection.execute("SELECT count(*) FROM workflow_versions").fetchone()[0] == 0
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    with pytest.raises(SkeletonResourceError):
        SkeletonResourceStore(store.root).get_managed_workflow_version(version["version"]["workflow_id"], version["version"]["revision_id"])


def test_delete_referenced_resource_names_caller_and_is_atomic(store):
    saved = store.save_managed_draft(edit())["resource"]
    parent = deepcopy(saved["document"])
    parent.update(id="parent", name="Caller", kind="agent")
    parent["nodes"].append({"id": "subagents", "type": "subagent_pool", "config": {
        "subagents": [{"id": "child", "name": "Child", "source": {"kind": "agent_ref", "agent_id": saved["id"]},
                      "allowed_modes": ["delegate"], "parallel_safe": False, "tags": [], "description": ""}]}})
    store.save_draft(parent)
    before = logical_state(store)
    with pytest.raises(SkeletonResourceError) as caught:
        store.delete_managed_resource(saved["id"], expected_edit_token=saved["edit_token"])
    assert caught.value.code == "resource_referenced"
    assert "Caller" in str(caught.value)
    assert logical_state(store) == before


def test_delete_migrated_default_does_not_return_on_startup(seeded):
    store, _ = seeded
    migrate_known_legacy_sources(store)
    saved = store.resolve(legacy_name="Default", source_scope="user:agent_recipes")
    store.delete_managed_resource(saved["id"], expected_edit_token=saved["edit_token"])
    cold = SkeletonResourceStore(store.root)
    migrate_known_legacy_sources(cold)
    assert saved["id"] not in {item["id"] for item in cold.list_resources()}
    from skeleton_legacy_chat import resolve_legacy_chat_options
    with pytest.raises(SkeletonResourceError) as caught:
        resolve_legacy_chat_options({"recipe_name": "Default"}, store=cold)
    assert caught.value.code == "resource_missing"


def test_delete_route_is_authenticated_closed_and_uses_real_store(authenticated_client):
    client, headers = authenticated_client
    saved = client.post("/skeleton_resources/v2", headers=headers, json=edit()).json["resource"]
    path = "/skeleton_resources/v2/" + saved["id"]
    body = {"expected_edit_token": saved["edit_token"]}
    assert client.delete(path, json=body).status_code == 401
    refused = client.delete(path, headers=headers, json={**body, "force": True})
    assert refused.status_code == 400
    assert refused.json["error"]["code"] == "unknown_field"
    assert client.get(path, headers=headers).status_code == 200
    deleted = client.delete(path, headers=headers, json=body)
    assert (deleted.status_code, deleted.json) == (200, {"ok": True})
    assert client.get(path, headers=headers).status_code == 404


def test_delete_upgrades_a_real_v3_store_and_preserves_ordinary_sql_guards(store):
    saved = store.save_managed_draft(request(message_workflow(), [{"node_path": ["nodes", 1], "text": SOURCE_A}]))
    publish(store, saved)
    with store._connect() as connection:
        connection.execute("UPDATE store_meta SET value='pupu.skeleton_resource_store.v3' WHERE key='schema'")
        connection.execute("DROP TRIGGER managed_version_delete")
        connection.execute("""CREATE TRIGGER managed_version_delete BEFORE DELETE ON workflow_versions
            WHEN OLD.code_sources_manifest IS NOT NULL
            BEGIN SELECT RAISE(ABORT, 'retained source version'); END""")
    cold = SkeletonResourceStore(store.root)
    cold.delete_managed_resource(saved["resource"]["id"], expected_edit_token=saved["resource"]["edit_token"])
    with cold._connect() as connection:
        assert connection.execute("SELECT value FROM store_meta WHERE key='schema'").fetchone()[0] == "pupu.skeleton_resource_store.v4"
    another = cold.save_managed_draft(edit())
    import sqlite3
    with cold._connect() as connection, pytest.raises(sqlite3.Error):
        connection.execute("DELETE FROM resources WHERE resource_id=?", (another["resource"]["id"],))
    assert cold.get_managed_resource(another["resource"]["id"]) == another


def test_reference_looking_literal_data_does_not_prevent_deletion(store):
    saved = store.save_managed_draft(edit())["resource"]
    other = deepcopy(saved["document"])
    other.update(id="literal-holder", name="Literal")
    other["nodes"][1]["config"]["execution"]["inputs"][0]["value"] = {
        "kind": "literal", "value": {"workflow_id": saved["id"], "revision_id": "data"}}
    store.save_draft(other)
    store.delete_managed_resource(saved["id"], expected_edit_token=saved["edit_token"])
    assert {row["id"] for row in store.list_resources()} == {"literal-holder"}


def test_deleted_migrated_agent_is_also_absent_from_the_old_recipe_listing(authenticated_client):
    from pathlib import Path
    from recipe_seeds import ensure_recipe_seeds_written
    from subagent_seeds import ensure_seeds_written
    client, headers = authenticated_client
    ensure_recipe_seeds_written(Path.home() / ".pupu" / "agent_recipes")
    ensure_seeds_written(Path.home() / ".pupu" / "subagents")
    store = SkeletonResourceStore()
    migrate_known_legacy_sources(store)
    saved = store.resolve(legacy_name="Default", source_scope="user:agent_recipes")
    assert "Default" in {row["name"] for row in client.get("/agent_recipes", headers=headers).json["recipes"]}
    response = client.delete("/skeleton_resources/v2/" + saved["id"], headers=headers,
                             json={"expected_edit_token": saved["edit_token"]})
    assert response.status_code == 200, response.json
    migrate_known_legacy_sources(SkeletonResourceStore())
    assert "Default" not in {row["name"] for row in client.get("/agent_recipes", headers=headers).json["recipes"]}
