"""Automatic first-launch conversion, using real seeds, Store and installed Core."""
from copy import deepcopy
import json
from pathlib import Path

import pytest

from recipe_seeds import ensure_recipe_seeds_written, DEFAULT_RECIPE, EXPLORE_RECIPE
from subagent_seeds import ensure_seeds_written
from skeleton_resource_store import SkeletonResourceStore, migrate_known_legacy_sources
from skeleton_legacy_chat import legacy_chat_catalog
from test_skeleton_legacy_upgrade_save import recipe, migrate, tables


@pytest.fixture
def seeded(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    ensure_seeds_written(tmp_path / ".pupu" / "subagents")
    ensure_recipe_seeds_written(tmp_path / ".pupu" / "agent_recipes")
    return SkeletonResourceStore(tmp_path / "resources"), tmp_path


def native(document):
    assert not any(key.startswith("legacy_") for node in document["nodes"] for key in node["config"]), "startup left a legacy upgrade confirmation candidate"
    assert all("execution" in node["config"] for node in document["nodes"] if node["type"] in {"start", "agent", "end"})


def test_first_launch_opens_default_and_explore_as_native_editable_graphs(seeded):
    store, home = seeded
    originals = {str(p): p.read_bytes() for p in (home / ".pupu").rglob("*") if p.is_file()}
    results = migrate_known_legacy_sources(store)
    assert all(item["stage"] == "active" for item in results), results
    resources = {r["name"]: store.get_resource(r["id"]) for r in store.list_resources()}
    assert set(resources) == {"Default", "Explore"}
    for resource in resources.values():
        native(resource["document"])
        agent = next(n for n in resource["document"]["nodes"] if n["type"] == "agent")
        assert "kernel" not in agent["config"], "migration invented a model"
        assert agent["config"]["kernel_draft"]["prompt"]
        assert agent["config"]["kernel_draft"]["model"] is None
    default = resources["Default"]["document"]
    pool = next(n for n in default["nodes"] if n["type"] == "toolkit_pool")
    assert pool["config"] == {"toolkits": [{"id": "core", "enabled_tools": None}], "merge_with_user_selected": True}
    child = next(n for n in default["nodes"] if n["type"] == "subagent_pool")["config"]["subagents"][0]
    assert child["source"] == {"kind": "agent_ref", "agent_id": resources["Explore"]["id"]}
    assert child["allowed_modes"] == ["delegate", "worker"] and child["parallel_safe"] is True
    catalog = legacy_chat_catalog(store)
    assert all(r["upgraded"] for r in catalog["resources"])
    assert {str(p): p.read_bytes() for p in (home / ".pupu").rglob("*") if p.is_file()} == originals


def test_second_startup_and_cold_store_do_not_rewrite_native_edits(seeded):
    store, _ = seeded
    migrate_known_legacy_sources(store)
    resource = store.resolve(legacy_name="Explore", source_scope="user:agent_recipes")
    native(resource["document"])
    doc = deepcopy(resource["document"]); doc["description"] = "my native edit"
    saved = store.save_draft(doc, expected_edit_token=resource["edit_token"])
    before = tables(store)
    migrate_known_legacy_sources(SkeletonResourceStore(store.root))
    assert tables(store) == before
    assert SkeletonResourceStore(store.root).get_resource(saved["id"]) == saved


@pytest.mark.parametrize("managed", [False, True])
def test_preexisting_first_hop_drafts_upgrade_without_a_user_request(tmp_path, monkeypatch, managed):
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    store = SkeletonResourceStore(tmp_path / "resources")
    old, _ = migrate(store, recipe(model="openai:prior-model", max_iterations=17))
    if managed:
        frame = store.save_managed_draft({"schema": "pupu.skeleton-edit.v2", "document": old["document"], "expected_edit_token": old["edit_token"], "managed_sources": []})
        old = frame["resource"]
    # No source file is necessary for an already staged migration.
    migrate_known_legacy_sources(store)
    current = store.get_managed_resource(old["id"])["resource"] if managed else store.get_resource(old["id"])
    native(current["document"])
    agent = next(n for n in current["document"]["nodes"] if n["type"] == "agent")
    pending = agent["config"]["kernel_draft"]
    assert pending["model"] == "openai:prior-model" and pending["max_iterations"] == 17
    assert "{{#input.__legacy_prompt_0#}}" in pending["prompt"]
    binding = next(b for b in agent["config"]["execution"]["inputs"] if b["name"] == "__legacy_prompt_0")
    assert binding["value"] == {"kind": "ref", "node_id": "start", "path": ["text"]}
    assert current["id"] == old["id"] and current["edit_token"] != old["edit_token"]
    if managed:
        cold = SkeletonResourceStore(store.root).get_managed_resource(old["id"])
        assert cold["sources_manifest"] == frame["sources_manifest"] and cold["contents"] == []


def test_authored_kernel_is_preserved_and_automatic_receipt_is_atomic(tmp_path, monkeypatch):
    from test_skeleton_legacy_upgrade_managed import managed_legacy
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    store = SkeletonResourceStore(tmp_path / "resources")
    old, frame = managed_legacy(store)
    kernel = next(n for n in old["document"]["nodes"] if n["type"] == "agent")["config"]["kernel"]
    before = tables(store)
    with store._connect() as conn:
        conn.execute("CREATE TRIGGER refuse_auto_receipt BEFORE INSERT ON store_meta WHEN NEW.key LIKE 'pupu.legacy_upgrade.receipt.v1:%' BEGIN SELECT RAISE(ABORT,'test rollback'); END")
    migrate_known_legacy_sources(store)
    assert tables(store) == before
    with store._connect() as conn:conn.execute("DROP TRIGGER refuse_auto_receipt")
    migrate_known_legacy_sources(store)
    saved = store.get_managed_resource(old["id"])["resource"]
    native(saved["document"])
    assert next(n for n in saved["document"]["nodes"] if n["type"] == "agent")["config"]["kernel"] == kernel
    assert store.get_managed_resource(old["id"])["sources_manifest"] == frame["sources_manifest"]


def test_changed_original_is_not_cut_over_to_a_stale_staged_copy(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    store = SkeletonResourceStore(tmp_path / "resources")
    source = recipe(name="Changed")
    path = tmp_path / ".pupu/agent_recipes/Changed.recipe"
    path.parent.mkdir(parents=True); path.write_text(json.dumps(source))
    staged, _ = migrate(store, source, identity=str(path.resolve()))
    source["agent"]["prompt"] = "newer old source"; path.write_text(json.dumps(source))
    before = tables(store)
    failures = migrate_known_legacy_sources(store)
    assert any(r.get("error", {}).get("code") == "migration_source_changed" for r in failures)
    assert tables(store) == before
    assert store.get_resource(staged["id"]) == staged


def test_auto_projection_keeps_authored_inputs_and_avoids_generated_binding_collisions(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    store = SkeletonResourceStore(tmp_path / "resources")
    old, _ = migrate(store, recipe())
    document = deepcopy(old["document"])
    agent = next(n for n in document["nodes"] if n["type"] == "agent")
    retained = {"name": "__legacy_prompt_0", "value": {"kind": "literal", "value": "authored"}, "missing": "error"}
    agent["config"]["execution"] = {"inputs": [retained], "outputs": [{"name": "message", "source": {"kind": "result", "path": ["message"]}}]}
    saved = store.save_draft(document, expected_edit_token=old["edit_token"])
    migrate_known_legacy_sources(store)
    agent = next(n for n in store.get_resource(saved["id"])["document"]["nodes"] if n["type"] == "agent")
    inputs = agent["config"]["execution"]["inputs"]
    assert inputs[0] == retained and len(inputs) == 2
    assert inputs[1]["name"] == "__legacy_prompt_1"
    assert "{{#input.__legacy_prompt_1#}}" in agent["config"]["kernel_draft"]["prompt"]


def test_unsupported_settings_are_not_silently_discarded(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    store = SkeletonResourceStore(tmp_path / "resources")
    old, _ = migrate(store, recipe(toolkits=[{"id": "core", "config": {"private_setting": "retain"}}]))
    before = tables(store)
    result = migrate_known_legacy_sources(store)
    assert any(item.get("stage") == "failed" for item in result)
    assert tables(store) == before and store.get_resource(old["id"]) == old


def test_subagent_cycle_rolls_back_without_a_false_upgrade_receipt(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    store = SkeletonResourceStore(tmp_path / "resources")
    migrate(store, recipe("A", subagent_pool=[{"kind": "recipe_ref", "recipe_name": "B", "disabled_tools": []}]))
    migrate(store, recipe("B", subagent_pool=[{"kind": "recipe_ref", "recipe_name": "A", "disabled_tools": []}]))
    before = tables(store)
    result = migrate_known_legacy_sources(store)
    assert len(result) == 2 and all(item["error"]["code"] == "recursive_reference" for item in result)
    assert tables(store) == before
