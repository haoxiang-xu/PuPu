"""#473 minimal reproductions on the fixed pair (Host dev 7475b39f + Core wheel c1213803).

Two read-only facts about today's legacy -> Skeleton conversion. Nothing here
changes product code; a failing assertion here is the finding, not a defect of
the test. Each test records the exact input, the result and the error position.
"""
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from skeleton_resource_store import SkeletonResourceStore, SkeletonResourceError, migrate_known_legacy_sources
from skeleton_chat_selection import prepare_skeleton_chat_selection
from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies
from test_skeleton_resource_store import kernel_config
from test_skeleton_production_bindings import _offline_sdk_clients  # noqa: F401  (autouse: no SDK clients)
import recipe_loader
from recipe_seeds import ensure_recipe_seeds_written
from subagent_seeds import ensure_seeds_written

RECORD = Path(__file__).with_name("repro_473_record.json")


def _record(name, payload):
    data = json.loads(RECORD.read_text()) if RECORD.exists() else {}
    data[name] = payload
    RECORD.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str))


def _bindings(store, resource_id, tmp_path):
    from skeleton_production_bindings import SkeletonProductionBindings
    selected = prepare_skeleton_chat_selection({"skeleton_selection": {
        "schema": "pupu.skeleton_chat_selection.v1", "kind": "resource", "resource_id": resource_id}},
        store=store, legacy_kernel=kernel_config())
    frozen = freeze_skeleton_workflow_dependencies(selected, store=store)
    return SkeletonProductionBindings(selected, frozen, {}, session_id="repro-473",
                                      workspace_root=str(tmp_path), resource_store=store)


def test_repro_1_migrated_seed_toolkit_pool_shape_is_refused_at_bind(tmp_path):
    """The real Default seed, migrated by the real startup scan, keeps its toolkit
    reference as stored ({id, config, enabled_tools}); the bind step accepts only
    {id, enabled_tools}."""
    home = tmp_path / "home"
    ensure_seeds_written(home / ".pupu" / "subagents")
    ensure_recipe_seeds_written(home / ".pupu" / "agent_recipes")
    store = SkeletonResourceStore(tmp_path / "resources")
    with patch("pathlib.Path.home", return_value=home):
        migrated = migrate_known_legacy_sources(store)
    default_id = store.resolve(legacy_name="Default", source_scope="user:agent_recipes")["id"]
    document = store.get_resource(default_id)["document"]
    pool = next(node for node in document["nodes"] if node["type"] == "toolkit_pool")
    stored_refs = pool["config"]["legacy_fields"]["toolkits"]
    assert stored_refs[0]["id"] == "core"
    assert "config" in stored_refs[0]  # the stored legacy shape carries `config`

    where = "host_construction"
    with pytest.raises(SkeletonResourceError) as caught:
        host = _bindings(store, default_id, tmp_path)
        where = "tools_for_node"
        host.tools_for_node(SimpleNamespace(document_id=default_id, node_id="agent_main"))
    _record("repro_1_default", {
        "stored_toolkit_ref_keys": sorted(stored_refs[0]), "refused_at": where,
        "migration": [{k: row[k] for k in ("source_identity", "stage", "target_id") if k in row} for row in migrated],
        "resource_id": default_id, "pool_node": pool["id"], "stored_toolkit_refs": stored_refs,
        "error": {"code": caught.value.code, "path": list(caught.value.path), "message": str(caught.value)},
    })
    assert caught.value.code == "invalid_shape"
    assert list(caught.value.path) == ["document", "nodes", pool["id"], "config", "toolkits", "core"]


def test_repro_1b_explore_seed_toolkit_pool_shape_is_refused_at_bind(tmp_path):
    """Explore stores {id, config} with no enabled_tools at all."""
    home = tmp_path / "home"
    ensure_seeds_written(home / ".pupu" / "subagents")
    ensure_recipe_seeds_written(home / ".pupu" / "agent_recipes")
    store = SkeletonResourceStore(tmp_path / "resources")
    with patch("pathlib.Path.home", return_value=home):
        migrate_known_legacy_sources(store)
    explore_id = store.resolve(legacy_name="Explore", source_scope="user:agent_recipes")["id"]
    document = store.get_resource(explore_id)["document"]
    pool = next(node for node in document["nodes"] if node["type"] == "toolkit_pool")
    stored_refs = pool["config"]["legacy_fields"]["toolkits"]
    outcome = {"resource_id": explore_id, "pool_node": pool["id"], "stored_toolkit_refs": stored_refs,
               "stored_toolkit_ref_keys": sorted(stored_refs[0])}
    where = "host_construction"
    with pytest.raises(SkeletonResourceError) as caught:
        host = _bindings(store, explore_id, tmp_path)
        where = "tools_for_node"
        host.tools_for_node(SimpleNamespace(document_id=explore_id, node_id="agent_main"))
    outcome["refused_at"] = where
    outcome["error"] = {"code": caught.value.code, "path": list(caught.value.path), "message": str(caught.value)}
    _record("repro_1b_explore", outcome)
    assert caught.value.code == "invalid_shape"
    assert list(caught.value.path) == ["document", "nodes", pool["id"], "config", "toolkits", "core"]


def test_repro_2_graph_less_recipe_loses_root_toolkits_and_subagents(tmp_path):
    """A graph-less recipe that the legacy reader sees with one toolkit and one
    subagent reference becomes a Skeleton Agent with neither node."""
    home = tmp_path / "home"
    recipes = home / ".pupu" / "agent_recipes"
    recipes.mkdir(parents=True)
    raw = {"name": "Flat", "description": "graph-less", "model": None, "max_iterations": None,
           "agent": {"prompt_format": "soul", "prompt": "You are flat."},
           "toolkits": [{"id": "core", "enabled_tools": ["read"]}],
           "subagent_pool": [{"kind": "recipe_ref", "recipe_name": "Explore", "disabled_tools": []}],
           "merge_with_user_selected": False}
    source = recipes / "Flat.recipe"
    source.write_text(json.dumps(raw), encoding="utf-8")

    legacy = recipe_loader._read_recipe_file(source)  # the production legacy reader
    assert [ref.id for ref in legacy.toolkits] == ["core"]
    assert len(legacy.subagent_pool) == 1
    assert legacy.merge_with_user_selected is False

    store = SkeletonResourceStore(tmp_path / "resources")
    with patch("pathlib.Path.home", return_value=home):
        migrated = migrate_known_legacy_sources(store)
    flat_id = store.resolve(legacy_name="Flat", source_scope="user:agent_recipes")["id"]
    document = store.get_resource(flat_id)["document"]
    node_types = sorted(node["type"] for node in document["nodes"])
    agent_node = next(node for node in document["nodes"] if node["type"] == "agent")
    kept_in_provenance = agent_node["config"].get("legacy_recipe", {})

    host = _bindings(store, flat_id, tmp_path)
    tools = host.tools_for_node(SimpleNamespace(document_id=flat_id, node_id=agent_node["id"]))
    _record("repro_2_flat", {
        "input_recipe": raw, "legacy_reader": {"toolkits": [ref.id for ref in legacy.toolkits],
            "subagent_pool_kinds": [type(entry).__name__ for entry in legacy.subagent_pool],
            "merge_with_user_selected": legacy.merge_with_user_selected},
        "migration": [{k: row[k] for k in ("source_identity", "stage", "target_id") if k in row} for row in migrated],
        "resource_id": flat_id, "skeleton_node_types": node_types,
        "provenance_keeps": {k: kept_in_provenance.get(k) for k in ("toolkits", "subagent_pool", "merge_with_user_selected")},
        "bound_tools_for_agent": [tool.name for tool in tools],
        "source_unchanged": source.read_text(encoding="utf-8") == json.dumps(raw),
    })
    assert node_types == ["agent", "end", "start"]
    assert kept_in_provenance.get("toolkits") == raw["toolkits"]
    assert kept_in_provenance.get("subagent_pool") == raw["subagent_pool"]
    assert list(tools) == []
