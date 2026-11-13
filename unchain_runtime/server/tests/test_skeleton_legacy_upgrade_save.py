"""Real Store/installed-Core contract tests; no SDK, HTTP or provider execution."""
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
import json
import sqlite3

import pytest

from recipe_seeds import DEFAULT_RECIPE, EXPLORE_RECIPE
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_legacy_upgrade import kernel_config


def choices():
    return {"schema": "pupu.skeleton-legacy-upgrade.choices.v1", "kernels": [],
            "toolkits": [], "references": [], "acknowledged": []}


def kernel(path, *, model="test-model", model_policy="preserve", prompt_policy="preserve"):
    config = kernel_config()
    config["profile"]["model"] = model
    return {"path": path, "kernel": config, "model_policy": model_policy,
            "prompt_policy": prompt_policy, "accept_projection": True}


def recipe(name="Old", **kwargs):
    return {"name": name, "description": "source description", "model": None,
            "agent": {"prompt_format": "soul", "prompt": "Read {{#start.text#}}"},
            "toolkits": [], "subagent_pool": [], "merge_with_user_selected": False,
            **kwargs}


def migrate(store, source, *, scope="user:agent_recipes", identity=None, kind="recipe"):
    raw = json.dumps(source, ensure_ascii=False)
    status = store.migrate_legacy(source_identity=identity or source["name"] + ".recipe",
        source_scope=scope, source_kind=kind, source=raw)
    resource = store.get_resource(status["target_id"])
    request = choices()
    request["kernels"] = [kernel(["nodes", i]) for i, node in enumerate(resource["document"]["nodes"])
                          if node["type"] == "agent" and "kernel" not in node["config"]]
    return resource, request


def tables(store):
    with sqlite3.connect(store.database_path) as conn:
        names = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
        return {name: conn.execute('SELECT * FROM "' + name + '" ORDER BY rowid').fetchall()
                for name in names}


def apply(store, resource, request):
    preview = store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=request)
    return store.apply_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"],
        expected_projection_digest=preview["projection_digest"], choices=request), preview


@pytest.fixture
def store(tmp_path):
    return SkeletonResourceStore(tmp_path / "resources")


@pytest.mark.parametrize("merge", [True, False])
def test_flat_recipe_preview_is_read_only_and_apply_keeps_identity_policy_and_native_input(store, merge):
    resource, request = migrate(store, recipe(merge_with_user_selected=merge,
        toolkits=[{"id": "core", "enabled_tools": []}]))
    before = tables(store)
    preview = store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=request)
    assert tables(store) == before
    assert preview["schema"] == "pupu.skeleton-legacy-upgrade.preview.v1"
    assert preview["runtime_manifest"]["manifest_digest"] == "sha256:8bb1c7d474eed7bd82f906ac6cd88a6b7e073a23f46319cf500ebbd6b50ff17b"
    saved, again = apply(store, resource, request)
    assert again == preview
    assert saved["id"] == resource["id"] and saved["source_identity"] == resource["source_identity"]
    assert saved["document"] == preview["document"]
    assert saved["document"]["description"] == "source description"
    assert saved["edit_token"] != resource["edit_token"]
    pool = next(n for n in saved["document"]["nodes"] if n["type"] == "toolkit_pool")
    assert pool["config"] == {"toolkits": [{"id": "core", "enabled_tools": []}], "merge_with_user_selected": merge}
    assert next(n for n in saved["document"]["nodes"] if n["type"] == "start")["config"]["execution"]["outputs"][0] == {
        "name": "text", "source": {"kind": "result", "path": ["message"]}}
    assert not any(k.startswith("legacy_") for n in saved["document"]["nodes"] for k in n["config"])
    after = tables(store)
    for name in before:
        if name not in {"resources", "store_meta"}:
            assert after[name] == before[name]
    assert store.resolve(legacy_name="Old", source_scope="user:agent_recipes")["id"] == resource["id"]
    reopened = SkeletonResourceStore(store.root)
    assert reopened.get_resource(resource["id"]) == saved
    assert reopened.preflight(resource["id"])["document"] == saved["document"]


def test_implicit_flat_merge_and_null_allowlist_are_not_empty_list(store):
    src = recipe(toolkits=[{"id": "core", "enabled_tools": None}])
    del src["merge_with_user_selected"]
    resource, request = migrate(store, src)
    saved, _ = apply(store, resource, request)
    pool = next(n for n in saved["document"]["nodes"] if n["type"] == "toolkit_pool")
    assert pool["config"]["merge_with_user_selected"] is True
    assert pool["config"]["toolkits"][0]["enabled_tools"] is None


def test_missing_allowlist_and_nonempty_toolkit_config_require_explicit_choice(store):
    resource, request = migrate(store, recipe(toolkits=[{"id": "core", "config": {"privileged": True}}]))
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=request)
    assert exc.value.code == "toolkit_choice_required"
    assert tables(store) == before
    path = ["nodes", 1, "config", "legacy_recipe", "toolkits", 0]
    request["toolkits"] = [{"path": path, "toolkit_id": "core", "enabled_tools": ["read"], "discard_unsupported": False}]
    with pytest.raises(SkeletonResourceError, match="discard"):
        apply(store, resource, request)
    request["toolkits"][0]["discard_unsupported"] = True
    saved, _ = apply(store, resource, request)
    assert next(n for n in saved["document"]["nodes"] if n["type"] == "toolkit_pool")["config"]["toolkits"] == [
        {"id": "core", "enabled_tools": ["read"]}]


def test_missing_kernel_unconsumed_choice_and_unknown_source_are_zero_write(store):
    resource, request = migrate(store, recipe())
    before = tables(store)
    for bad, code in [(choices(), "kernel_choice_required"),
                      ({**request, "references": [{"path": ["nodes", 99], "source_scope": "x", "agent_id": "x"}]}, "unused_choice")]:
        with pytest.raises(SkeletonResourceError) as exc:
            apply(store, resource, bad)
        assert exc.value.code == code
        assert tables(store) == before


def test_recipe_reference_keeps_delegate_only_policy_and_requires_upgraded_target(store):
    child, child_choices = migrate(store, recipe("Child"))
    parent, parent_choices = migrate(store, recipe("Parent", subagent_pool=[
        {"kind": "recipe_ref", "recipe_name": "Child", "disabled_tools": ["write"]}]))
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        apply(store, parent, parent_choices)
    assert exc.value.code == "legacy_dependency_upgrade_required"
    assert tables(store) == before
    apply(store, child, child_choices)
    saved, _ = apply(store, parent, parent_choices)
    entry = next(n for n in saved["document"]["nodes"] if n["type"] == "subagent_pool")["config"]["subagents"][0]
    assert entry["source"] == {"kind": "agent_ref", "agent_id": child["id"]}
    assert entry["allowed_modes"] == ["delegate"] and entry["parallel_safe"] is False
    assert entry["disabled_tools"] == ["write"]


def test_dependency_edit_between_preview_and_apply_requires_new_preview(store):
    child, cc = migrate(store, recipe("Child"))
    child, _ = apply(store, child, cc)
    parent, pc = migrate(store, recipe("Parent", subagent_pool=[{"kind": "recipe_ref", "recipe_name": "Child"}]))
    preview = store.preview_legacy_upgrade(parent["id"], expected_edit_token=parent["edit_token"], choices=pc)
    changed = deepcopy(child["document"]); changed["name"] = "Child edited"
    store.save_draft(changed, expected_edit_token=child["edit_token"])
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        store.apply_legacy_upgrade(parent["id"], expected_edit_token=parent["edit_token"], choices=pc,
                                   expected_projection_digest=preview["projection_digest"])
    assert exc.value.code == "upgrade_preview_stale"
    assert tables(store) == before


def test_scoped_reference_never_chooses_other_scope(store):
    one, oc = migrate(store, recipe("Same"), identity="one", scope="user:agent_recipes")
    two, tc = migrate(store, recipe("Same"), identity="two", scope="user:subagents")
    apply(store, one, oc); apply(store, two, tc)
    parent, pc = migrate(store, recipe("P", subagent_pool=[{"kind": "recipe_ref", "recipe_name": "Same"}]))
    saved, _ = apply(store, parent, pc)
    entry = next(n for n in saved["document"]["nodes"] if n["type"] == "subagent_pool")["config"]["subagents"][0]
    assert entry["source"]["agent_id"] == one["id"]


def test_inline_template_requires_own_kernel_and_keeps_template_policy(store):
    resource, request = migrate(store, recipe(subagent_pool=[{"kind": "inline", "name": "Inline", "prompt_format": "soul",
        "template": {"prompt": "child instructions"}, "disabled_tools": []}]))
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        apply(store, resource, request)
    assert exc.value.code == "kernel_choice_required" and tables(store) == before
    request["kernels"].append(kernel(["nodes", 1, "config", "legacy_recipe", "subagent_pool", 0], model="child-model"))
    saved, _ = apply(store, resource, request)
    entry = next(n for n in saved["document"]["nodes"] if n["type"] == "subagent_pool")["config"]["subagents"][0]
    assert entry["allowed_modes"] == ["delegate", "worker"] and entry["parallel_safe"] is True
    child_agent = next(n for n in entry["source"]["document"]["nodes"] if n["type"] == "agent")
    assert child_agent["config"]["kernel"]["profile"]["model"] == "child-model"
    assert child_agent["config"]["kernel"]["prompt"] == "child instructions"


def test_trigger_failure_rolls_back_resource_archive_and_receipt(store):
    resource, request = migrate(store, recipe())
    preview = store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=request)
    with store._connect() as connection:
        connection.execute("CREATE TRIGGER fail_upgrade_receipt BEFORE INSERT ON store_meta WHEN NEW.key LIKE 'pupu.legacy_upgrade.receipt.v1:%' BEGIN SELECT RAISE(ABORT,'injected failure'); END")
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        store.apply_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=request,
                                  expected_projection_digest=preview["projection_digest"])
    assert exc.value.code == "upgrade_store_error"
    assert isinstance(exc.value.__cause__, sqlite3.Error)
    assert tables(store) == before


def test_two_concurrent_applies_commit_once_and_repeat_is_zero_write(store):
    resource, request = migrate(store, recipe())
    preview = store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=request)
    def perform():
        try:
            return store.apply_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=request,
                expected_projection_digest=preview["projection_digest"])
        except SkeletonResourceError as exc:
            return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: perform(), range(2)))
    assert sum(type(r) is dict for r in results) == 1
    assert "edit_conflict" in results
    saved = next(r for r in results if type(r) is dict)
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        store.apply_legacy_upgrade(resource["id"], expected_edit_token=saved["edit_token"], choices=request,
                                   expected_projection_digest=preview["projection_digest"])
    assert exc.value.code == "legacy_upgrade_already_applied"
    assert tables(store) == before


def test_stale_root_token_rejects_without_modifying_new_author_edits(store):
    resource, request = migrate(store, recipe())
    preview = store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=request)
    changed = deepcopy(resource["document"]); changed["name"] = "My edit"
    store.save_draft(changed, expected_edit_token=resource["edit_token"])
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        store.apply_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=request,
                                  expected_projection_digest=preview["projection_digest"])
    assert exc.value.code == "edit_conflict" and tables(store) == before


def test_real_seeds_upgrade_without_invalid_toolkit_keys_or_policy_widening(store):
    explore, ec = migrate(store, EXPLORE_RECIPE)
    explore, _ = apply(store, explore, ec)
    default, dc = migrate(store, DEFAULT_RECIPE)
    pool_index = next(i for i, n in enumerate(default["document"]["nodes"]) if n["type"] == "toolkit_pool")
    dc["toolkits"] = [{"path": ["nodes", pool_index, "config", "legacy_fields", "toolkits", 0],
                       "toolkit_id": "core", "enabled_tools": None, "discard_unsupported": True}]
    saved, preview = apply(store, default, dc)
    agent = next(n for n in saved["document"]["nodes"] if n["type"] == "agent")
    assert len(agent["config"]["kernel"]["prompt"]) > 100
    assert "{{USE_BUILTIN_DEVELOPER_PROMPT}}" not in agent["config"]["kernel"]["prompt"]
    entry = next(n for n in saved["document"]["nodes"] if n["type"] == "subagent_pool")["config"]["subagents"][0]
    assert entry["source"]["agent_id"] == explore["id"]
    assert entry["allowed_modes"] == ["delegate", "worker"] and entry["parallel_safe"] is True
    assert preview["definition_digest"] == store.preflight(saved["id"])["definition_digest"]
    for r in (explore, saved):
        tp = next(n for n in r["document"]["nodes"] if n["type"] == "toolkit_pool")
        assert all(set(ref) == {"id", "enabled_tools"} for ref in tp["config"]["toolkits"])


def test_native_authored_kernel_execution_and_pool_override_stale_legacy_values(store):
    resource, request = migrate(store, recipe(toolkits=[{"id": "old", "config": False}]))
    doc = deepcopy(resource["document"])
    agent = doc["nodes"][1]
    agent["config"]["kernel"] = kernel_config()
    agent["config"]["kernel"]["prompt"] = "native {{#input.text#}}"
    doc["nodes"].append({"id": "native-tools", "type": "toolkit_pool", "config": {
        "toolkits": [], "merge_with_user_selected": False, "legacy_fields": None}})
    doc["edges"].append({"id": "native-attach", "kind": "attach", "source_node_id": agent["id"],
        "source_port_id": "attach_top", "target_node_id": "native-tools", "target_port_id": "attach_bot"})
    resource = store.save_draft(doc, expected_edit_token=resource["edit_token"])
    request["kernels"] = []
    saved, _ = apply(store, resource, request)
    native = saved["document"]["nodes"][1]["config"]["kernel"]
    assert native == agent["config"]["kernel"]
    pool = next(n for n in saved["document"]["nodes"] if n["id"] == "native-tools")
    assert pool["config"] == {"toolkits": [], "merge_with_user_selected": False}


def test_invalid_native_toolkit_does_not_restore_legacy_configuration(store):
    resource, request = migrate(store, recipe())
    doc = deepcopy(resource["document"])
    doc["nodes"].append({"id": "bad", "type": "toolkit_pool", "config": {"toolkits": [], "merge_with_user_selected": "false"}})
    doc["edges"].append({"id": "attach", "kind": "attach", "source_node_id": "agent", "source_port_id": "attach_top",
        "target_node_id": "bad", "target_port_id": "attach_bot"})
    resource = store.save_draft(doc, expected_edit_token=resource["edit_token"])
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        apply(store, resource, request)
    assert exc.value.code == "invalid_shape" and tables(store) == before


def test_unknown_legacy_prompt_reference_is_never_silently_erased(store):
    resource, request = migrate(store, recipe(agent={"prompt_format": "soul", "prompt": "Missing {{#unknown.text#}}"}))
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        apply(store, resource, request)
    assert exc.value.code == "legacy_prompt_reference_invalid" and tables(store) == before
    request["kernels"][0]["prompt_policy"] = "replace"
    request["kernels"][0]["kernel"]["prompt"] = "native {{#input.text#}}"
    saved, _ = apply(store, resource, request)
    assert saved["document"]["nodes"][1]["config"]["kernel"]["prompt"] == "native {{#input.text#}}"


def test_explicit_model_replacement_is_required_for_different_legacy_model(store):
    resource, request = migrate(store, recipe(model="old-model"))
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        apply(store, resource, request)
    assert exc.value.code == "identity_mismatch" and tables(store) == before
    request["kernels"][0]["model_policy"] = "replace"
    saved, _ = apply(store, resource, request)
    assert saved["document"]["nodes"][1]["config"]["kernel"]["profile"]["model"] == "test-model"


def test_new_native_plan_reads_message_preserves_unicode_and_does_not_touch_old_journal(store, tmp_path):
    from unchain.skeleton import WorkflowNodeCompleted, prepare_agent_graph, materialize_legacy_agent
    from unchain.skeleton.durable_execution import DurableWorkflowRunner
    from unchain.skeleton.durable_store import WorkflowExecutionStore
    from unchain.persistence import SQLiteContextV2Store
    from unchain.journal import GenerationRef, AttemptRef
    resource, request = migrate(store, recipe())
    old_plan = prepare_agent_graph(materialize_legacy_agent(resource["document"], kernel_config()))
    db = SQLiteContextV2Store(database_path=tmp_path / "old.sqlite", object_directory=tmp_path / "objects")
    old = WorkflowExecutionStore(db.bind_execution("old"), old_plan, graph_id="old-graph",
                               attempt=AttemptRef(GenerationRef("old", "generation"), "root"))
    DurableWorkflowRunner(old, {}).create({"text": "old immutable launch"})
    def old_bytes():
        return {str(p): p.read_bytes() for p in tmp_path.rglob("*") if p.is_file() and "resources" not in p.parts}
    before = old_bytes()
    saved, _ = apply(store, resource, request)
    assert old_bytes() == before
    plan = prepare_agent_graph(saved["document"])
    new_db = SQLiteContextV2Store(database_path=tmp_path / "new.sqlite", object_directory=tmp_path / "new-objects")
    new = WorkflowExecutionStore(new_db.bind_execution("new"), plan, graph_id="new-graph",
                                attempt=AttemptRef(GenerationRef("new", "generation"), "root"))
    calls = []
    def node(context, resolved):
        calls.append(dict(resolved))
        return WorkflowNodeCompleted({"message": "answer", "context": {}})
    runner = DurableWorkflowRunner(new, {"agent": node})
    runner.create({"message": "  caller é  ", "images": [], "files": []})
    assert runner.run().status == "completed"
    assert calls[0]["text"] == calls[0]["__legacy_prompt_0"] == "  caller é  "


def test_native_subagent_reference_cannot_borrow_parent_kernel_for_unupgraded_child(store):
    child, _ = migrate(store, recipe("Child"))
    parent, pc = migrate(store, recipe("Parent"))
    doc = deepcopy(parent["document"])
    doc["nodes"].append({"id": "native-subagents", "type": "subagent_pool", "config": {"subagents": [{
        "id": "child", "name": "Child", "description": "", "source": {"kind": "agent_ref", "agent_id": child["id"]},
        "allowed_modes": ["delegate"], "output_mode": "summary", "memory_policy": "ephemeral",
        "parallel_safe": False, "allowed_tools": None, "disabled_tools": []}]}})
    doc["edges"].append({"id": "attach", "kind": "attach", "source_node_id": "agent", "source_port_id": "attach_top",
        "target_node_id": "native-subagents", "target_port_id": "attach_bot"})
    parent = store.save_draft(doc, expected_edit_token=parent["edit_token"])
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        apply(store, parent, pc)
    assert exc.value.code == "legacy_dependency_upgrade_required" and tables(store) == before


def test_unknown_structured_prompt_settings_need_exact_review_acknowledgement(store):
    resource, request = migrate(store, recipe(agent={"prompt_format": "skeleton", "prompt": json.dumps({"instructions": "Read", "extra": 123})}))
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        apply(store, resource, request)
    assert exc.value.code == "legacy_prompt_review_required" and tables(store) == before
    request["acknowledged"] = [{"code": "legacy_prompt_review_required", "path": ["nodes", 1, "config", "legacy_recipe", "agent", "prompt"]}]
    saved, _ = apply(store, resource, request)
    assert saved["document"]["nodes"][1]["config"]["kernel"]["prompt"] == "Read"


def test_authored_kernel_does_not_depend_on_obsolete_malformed_override(store):
    resource, request = migrate(store, recipe())
    doc = deepcopy(resource["document"])
    doc["nodes"][1]["label"] = "Keep this label"
    doc["nodes"][1]["config"].update(kernel=kernel_config(), legacy_fields=None)
    resource = store.save_draft(doc, expected_edit_token=resource["edit_token"])
    request["kernels"] = []
    saved, _ = apply(store, resource, request)
    assert saved["document"]["nodes"][1]["label"] == "Keep this label"
    assert saved["document"]["nodes"][1]["config"]["kernel"] == doc["nodes"][1]["config"]["kernel"]


def test_builtin_snapshot_changed_after_preview_is_rejected(store, monkeypatch):
    import unchain_adapter
    explore, ec = migrate(store, EXPLORE_RECIPE); apply(store, explore, ec)
    resource, request = migrate(store, DEFAULT_RECIPE)
    index = next(i for i, n in enumerate(resource["document"]["nodes"]) if n["type"] == "toolkit_pool")
    request["toolkits"] = [{"path": ["nodes", index, "config", "legacy_fields", "toolkits", 0],
                            "toolkit_id": "core", "enabled_tools": None, "discard_unsupported": True}]
    preview = store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=request)
    before = tables(store)
    monkeypatch.setattr(unchain_adapter, "_resolve_recipe_prompt", lambda _: "changed builtin prompt")
    with pytest.raises(SkeletonResourceError) as exc:
        store.apply_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=request,
                                  expected_projection_digest=preview["projection_digest"])
    assert exc.value.code == "upgrade_preview_stale" and tables(store) == before


@pytest.mark.parametrize("bad_kind", [[], {}, False])
def test_malformed_subagent_kind_is_a_typed_zero_write_refusal(store, bad_kind):
    resource, request = migrate(store, recipe(subagent_pool=[{"kind": bad_kind}]))
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        apply(store, resource, request)
    assert exc.value.code == "invalid_shape" and tables(store) == before


def test_each_legacy_node_uses_its_own_model_and_prompt_binding(store):
    src = deepcopy(EXPLORE_RECIPE)
    src["name"] = "Two models"; src["toolkits"] = []; src["subagent_pool"] = []
    src["nodes"] = src["nodes"][:3]
    src["edges"] = src["edges"][:2]
    src["nodes"][1]["override"] = {"model": "model-a", "prompt_format": "soul", "prompt": "Alpha {{#start.text#}}"}
    src["nodes"].insert(2, {"id": "second", "type": "agent", "override": {
        "model": "model-b", "prompt_format": "soul", "prompt": "Beta {{#agent_main.output#}}"}})
    src["edges"][1]["target_node_id"] = "second"
    src["edges"].append({"id": "second-end", "kind": "flow", "source_node_id": "second", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"})
    resource, request = migrate(store, src)
    request["kernels"] = [kernel(["nodes", 1], model="model-a"), kernel(["nodes", 2], model="model-b")]
    saved, _ = apply(store, resource, request)
    for index, name, model, ref_node, ref_path in [(1, "Alpha", "model-a", "start", ["text"]), (2, "Beta", "model-b", "agent_main", ["message"])]:
        config = saved["document"]["nodes"][index]["config"]
        assert config["kernel"]["profile"]["model"] == model
        assert config["kernel"]["prompt"] == name + " {{#input.__legacy_prompt_0#}}"
        assert next(b["value"] for b in config["execution"]["inputs"] if b["name"] == "__legacy_prompt_0") == {
            "kind": "ref", "node_id": ref_node, "path": ref_path}


def test_unsupported_mixed_graph_and_missing_scoped_alias_never_save(store):
    resource, request = migrate(store, recipe())
    document = deepcopy(resource["document"])
    document["nodes"].append({"id": "code", "type": "code", "config": {}})
    resource = store.save_draft(document, expected_edit_token=resource["edit_token"])
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        apply(store, resource, request)
    assert exc.value.code == "legacy_graph_unsupported" and tables(store) == before
    parent, pc = migrate(store, recipe("Missing", subagent_pool=[{"kind": "recipe_ref", "recipe_name": "Absent"}]))
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        apply(store, parent, pc)
    assert exc.value.code == "resource_missing" and tables(store) == before


@pytest.mark.parametrize("change", [
    lambda c: c.update(prompt={"kind": []}),
    lambda c: c.update(legacy_recipe={"name": "Old", "nodes": False}),
    lambda c: c["legacy_recipe"].update(subagent_pool=False),
    lambda c: c.update(legacy_recipe=None, legacy_template={}),
    lambda c: c["legacy_recipe"].update(subagent_pool=[{"kind": "inline", "name": "Bad", "prompt_format": [], "template": {}}]),
])
def test_malformed_stored_legacy_shapes_never_escape_as_untyped_errors_or_save(store, change):
    resource, request = migrate(store, recipe())
    doc = deepcopy(resource["document"])
    change(doc["nodes"][1]["config"])
    resource = store.save_draft(doc, expected_edit_token=resource["edit_token"])
    before = tables(store)
    with pytest.raises(SkeletonResourceError):
        apply(store, resource, request)
    assert tables(store) == before


def test_soul_reference_keeps_its_own_template_defaults(store):
    source = "---\nname: SoulChild\ndescription: Soul description\n---\nSoul instructions"
    migration = store.migrate_legacy(source_identity="soul-child.soul", source_scope="user:subagents",
        source_kind="soul", source=source)
    child = store.get_resource(migration["target_id"])
    cc = choices(); cc["kernels"] = [kernel(["nodes", 1])]
    apply(store, child, cc)
    parent, pc = migrate(store, recipe("SoulParent", subagent_pool=[{"kind": "ref", "template_name": "SoulChild"}]))
    saved, _ = apply(store, parent, pc)
    entry = next(n for n in saved["document"]["nodes"] if n["type"] == "subagent_pool")["config"]["subagents"][0]
    assert entry["source"] == {"kind": "agent_ref", "agent_id": child["id"]}
    assert entry["allowed_modes"] == ["delegate", "worker"] and entry["parallel_safe"] is True


def test_upgrade_never_bypasses_managed_source_storage_boundary(store):
    from tests.test_skeleton_code_sources import edit
    request = edit("def main(input, context):\n    return {}\n")
    request["document"]["kind"] = "agent"
    saved = store.save_managed_draft(request)["resource"]
    before = tables(store)
    with pytest.raises(SkeletonResourceError) as exc:
        store.preview_legacy_upgrade(saved["id"], expected_edit_token=saved["edit_token"], choices=choices())
    assert exc.value.code == "source_api_required" and tables(store) == before
