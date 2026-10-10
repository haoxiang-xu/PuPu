"""BC-020 / SEQ-023: real resource admission, frozen material and chat refusal.

These source tests cover the bounded admission slice, not durable execution,
provider credentials, installed artifacts or sidecar recovery.
"""
from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import importlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from unittest.mock import Mock

import pytest

import app as pupu_app
import recipe_loader
import routes
import unchain_adapter as adapter
from durable_interaction_host import DurableInteractionHostError
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_resource_store import agent, binding, kernel_config, output, workflow
from unchain.runtime import runtime_protocol
from unchain.skeleton import prepare_agent_graph
from unchain.skeleton.agent_preparation import execution_definition_digest


SELECTION_SCHEMA = "pupu.skeleton_chat_selection.v1"
PREFLIGHT_KEYS = {"ok", "id", "kind", "definition_digest", "edit_token", "document",
                  "diagnostics", "dependencies", "subagents"}
STORE_TABLES = {"store_meta", "resources", "workflow_versions", "workflow_dependencies",
                "legacy_migrations", "legacy_aliases", "python_profiles"}
PRIVATE_SENTINEL = "private-chat-selection-exception-SENTINEL"


@pytest.fixture(autouse=True)
def _isolated_runtime_directory(tmp_path, monkeypatch):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path / "unchain-data"))


def _api():
    # Absent product API must fail individual tests, never pytest collection.
    return importlib.import_module("skeleton_chat_selection")


def _resource(resource_id):
    return {"schema": SELECTION_SCHEMA, "kind": "resource", "resource_id": resource_id}


def _default():
    return {"schema": SELECTION_SCHEMA, "kind": "default"}


def _legacy(name="Legacy", scope="user:agent_recipes"):
    return {"schema": SELECTION_SCHEMA, "kind": "legacy", "legacy_name": name,
            "source_scope": scope}


def _options(selection):
    return {"skeleton_selection": selection}


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False).encode("utf-8", "surrogatepass")


def _rows(store):
    with sqlite3.connect(store.database_path) as connection:
        tables = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        assert tables == STORE_TABLES
        return {table: sorted(connection.execute(f"SELECT * FROM {table}").fetchall())
                for table in sorted(STORE_TABLES)}


def _legacy_recipe(name="Legacy", prompt="legacy prompt"):
    return {"name": name, "description": "legacy", "model": None,
            "max_iterations": None, "agent": {"prompt_format": "soul", "prompt": prompt},
            "toolkits": [], "subagent_pool": []}


def _migrate(store, *, name="Legacy", identity="legacy.recipe", scope="user:agent_recipes",
             prompt="legacy prompt"):
    return store.migrate_legacy(source_identity=identity, source_scope=scope,
                                source_kind="recipe",
                                source=json.dumps(_legacy_recipe(name, prompt)))


def _effect_guards(monkeypatch, *, legacy=True, registry=True):
    guards = {}
    names = ["_create_agent", "_stream_recipe_graph_events", "register_interject_channels",
             "_UnchainAgent", "make_custom_model_io_factory"]
    if legacy:
        names.append("_load_recipe_from_options")
    if registry:
        names.append("_execution_control_call")
    for name in names:
        guards[name] = Mock(side_effect=AssertionError(f"forbidden effect: {name}"))
        monkeypatch.setattr(adapter, name, guards[name])
    return guards


def _assert_no_effects(guards):
    for name, guard in guards.items():
        assert guard.call_count == 0, f"unexpected effect: {name}"


@pytest.mark.parametrize("options", [{}, {"recipe_name": "Default"},
                                      {"characterId": "ordinary-character"}])
def test_absent_selector_is_the_only_none_path_and_does_not_create_store(monkeypatch, options):
    api = _api()
    constructor = Mock(side_effect=AssertionError("store must remain unopened"))
    monkeypatch.setattr(SkeletonResourceStore, "__init__", constructor)
    assert api.prepare_skeleton_chat_selection(options) is None
    constructor.assert_not_called()


BAD_SELECTORS = [
    None, False, "agent", [], {},
    {"schema": "pupu.skeleton_chat_selection.v2", "kind": "default"},
    {"schema": SELECTION_SCHEMA, "kind": "unknown"},
    {"schema": SELECTION_SCHEMA, "kind": "resource"},
    {"schema": SELECTION_SCHEMA, "kind": "legacy", "legacy_name": "Legacy"},
    {**_default(), "resource_id": "agent"},
    {**_resource("agent"), "revision_id": "revision"},
    {**_resource("agent"), "legacy_kernel": kernel_config()},
    {**_legacy(), "credential_ref": "private.key"},
    *[_resource(value) for value in (None, True, 7, "", " ", " agent", "agent ",
                                    "../agent", "agent/child")],
    {**_legacy(), "legacy_name": ""},
    {**_legacy(), "source_scope": "user:agent_recipes "},
    {**_legacy(), "source_scope": False},
]


@pytest.mark.parametrize("selection", BAD_SELECTORS)
def test_selector_rejects_before_store_or_legacy_effects(monkeypatch, selection):
    api = _api()
    constructor = Mock(side_effect=AssertionError("invalid selector opened store"))
    loader = Mock(side_effect=AssertionError("invalid selector loaded Recipe"))
    monkeypatch.setattr(SkeletonResourceStore, "__init__", constructor)
    monkeypatch.setattr(recipe_loader, "load_recipe", loader)
    with pytest.raises(SkeletonResourceError) as rejected:
        api.prepare_skeleton_chat_selection(_options(selection))
    assert rejected.value.status == 400
    assert rejected.value.code and rejected.value.path
    constructor.assert_not_called()
    loader.assert_not_called()


@pytest.mark.parametrize("recipe_name", ["Default", "Legacy", True, {"id": "old"}])
def test_selector_conflict_is_rejected_before_resolution(monkeypatch, recipe_name):
    api = _api()
    constructor = Mock(side_effect=AssertionError("conflict opened store"))
    monkeypatch.setattr(SkeletonResourceStore, "__init__", constructor)
    with pytest.raises(SkeletonResourceError) as rejected:
        api.prepare_skeleton_chat_selection({**_options(_resource("agent")),
                                             "recipe_name": recipe_name})
    assert rejected.value.status == 400
    constructor.assert_not_called()


@pytest.mark.parametrize("selector_kind", ["resource", "default", "legacy"])
def test_real_resolve_and_one_preflight_produce_exact_agent_snapshot(tmp_path, monkeypatch,
                                                                   selector_kind):
    api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    trusted_kernel = None
    if selector_kind == "legacy":
        migrated = _migrate(store)
        resource_id, selector = migrated["target_id"], _legacy()
        trusted_kernel = kernel_config()
    else:
        saved = store.save_draft(agent("selected", "Default"))
        resource_id = saved["id"]
        selector = _resource(resource_id) if selector_kind == "resource" else _default()
    expected = store.preflight(resource_id, legacy_kernel=trusted_kernel)
    resolve, preflight = Mock(wraps=store.resolve), Mock(wraps=store.preflight)
    monkeypatch.setattr(store, "resolve", resolve)
    monkeypatch.setattr(store, "preflight", preflight)
    frozen = api.prepare_skeleton_chat_selection(_options(selector), store=store,
                                                  legacy_kernel=trusted_kernel)
    assert isinstance(frozen, api.FrozenSkeletonChatSelection)
    actual = frozen.to_dict()
    assert set(actual) == PREFLIGHT_KEYS
    assert actual == expected and actual["ok"] is True and actual["kind"] == "agent"
    resolve.assert_called_once()
    preflight.assert_called_once()
    assert preflight.call_args.args == (resource_id,)
    assert preflight.call_args.kwargs.get("legacy_kernel") == trusted_kernel
    assert frozen.resource_id == resource_id
    assert frozen.edit_token == expected["edit_token"]
    assert frozen.definition_digest == expected["definition_digest"]
    assert frozen.snapshot_digest == sha256(_canonical(expected)).hexdigest()
    assert execution_definition_digest(prepare_agent_graph(actual["document"])) == (
        frozen.definition_digest)


@pytest.mark.parametrize("name", [" Legacy ", "Legacy ", " Legacy", "旧别名", " "])
def test_actual_migrated_alias_preserves_exact_name_through_resolution_and_preflight(
        tmp_path, monkeypatch, name):
    api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    scope = "user:agent_recipes"
    # This uses the real source converter and alias store. The Unicode case
    # makes no claim about historical Recipe filename validation or loading.
    migrated = _migrate(store, name=name, identity="exact-alias.recipe", scope=scope)
    assert migrated["stage"] == "active"
    real_resource = store.resolve(legacy_name=name, source_scope=scope)
    assert real_resource["id"] == migrated["target_id"]
    assert real_resource["name"] == name
    trusted_kernel = kernel_config()
    expected = store.preflight(real_resource["id"], legacy_kernel=trusted_kernel)
    assert expected["document"]["name"] == name
    if name != name.strip():
        with pytest.raises(SkeletonResourceError) as trimmed:
            store.resolve(legacy_name=name.strip(), source_scope=scope)
        assert (trimmed.value.code, trimmed.value.status) == ("resource_missing", 404)
        with pytest.raises(SkeletonResourceError) as selector_trimmed:
            api.prepare_skeleton_chat_selection(_options(_legacy(name.strip(), scope)),
                                                 store=store, legacy_kernel=trusted_kernel)
        if name.strip():
            assert (selector_trimmed.value.code, selector_trimmed.value.path,
                    selector_trimmed.value.status) == (
                        trimmed.value.code, trimmed.value.path, trimmed.value.status)
        else:
            # Empty text is invalid at selector admission, even though the raw
            # alias lookup independently reports that the empty alias is missing.
            assert (selector_trimmed.value.code, selector_trimmed.value.status) == ("invalid_value", 400)
    before = _rows(store)
    resolve, preflight = Mock(wraps=store.resolve), Mock(wraps=store.preflight)
    monkeypatch.setattr(store, "resolve", resolve)
    monkeypatch.setattr(store, "preflight", preflight)
    frozen = api.prepare_skeleton_chat_selection(_options(_legacy(name, scope)), store=store,
                                                  legacy_kernel=trusted_kernel)
    resolve.assert_called_once()
    assert resolve.call_args.kwargs["legacy_name"] == name
    assert resolve.call_args.kwargs["source_scope"] == scope
    preflight.assert_called_once()
    assert preflight.call_args.args == (real_resource["id"],)
    assert preflight.call_args.kwargs["legacy_kernel"] == trusted_kernel
    assert set(frozen.to_dict()) == PREFLIGHT_KEYS and frozen.to_dict() == expected
    assert frozen.resource_id == real_resource["id"]
    assert frozen.edit_token == expected["edit_token"]
    assert frozen.definition_digest == execution_definition_digest(
        prepare_agent_graph(frozen.to_dict()["document"]))
    assert frozen.snapshot_digest == sha256(_canonical(expected)).hexdigest()
    assert _rows(store) == before


def test_legacy_alias_requires_trusted_profile_and_request_cannot_supply_it(tmp_path):
    api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    _migrate(store)
    with pytest.raises(SkeletonResourceError) as missing:
        api.prepare_skeleton_chat_selection(_options(_legacy()), store=store)
    assert (missing.value.code, missing.value.status) == ("legacy_profile_required", 400)
    # options is OPEN; unrelated request fields never become trusted host arguments.
    with pytest.raises(SkeletonResourceError) as untrusted:
        api.prepare_skeleton_chat_selection({**_options(_legacy()),
                                             "legacy_kernel": kernel_config()}, store=store)
    assert untrusted.value.code == "legacy_profile_required"


@pytest.mark.parametrize("case,code,status", [
    ("missing", "resource_missing", 404),
    ("archived", "resource_archived", 409),
    ("workflow", "wrong_kind", 400),
    ("incomplete", "invalid_shape", 400),
    ("runtime", "runtime_protocol_manifest_missing", 409),
])
def test_explicit_bad_resource_preserves_actual_error_and_all_seven_tables(
        tmp_path, monkeypatch, case, code, status):
    api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    store.save_draft(agent("ordinary-default", "Default"))
    target = "absent"
    if case in {"archived", "runtime"}:
        saved = store.save_draft(agent("selected"))
        target = saved["id"]
        if case == "archived":
            store.archive(target, expected_edit_token=saved["edit_token"])
    elif case == "workflow":
        target = store.save_draft(workflow("selected"))["id"]
    elif case == "incomplete":
        document = agent("selected")
        document["nodes"][1]["config"].pop("kernel")
        target = store.save_draft(document)["id"]
    if case == "runtime":
        monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: None)
    before = _rows(store)
    # Independently capture the real store failure, excluding the new Agent-only gate.
    if case != "workflow":
        with pytest.raises(SkeletonResourceError) as real_error:
            store.preflight(target)
        expected = (real_error.value.code, real_error.value.path, real_error.value.status)
    with pytest.raises(SkeletonResourceError) as rejected:
        api.prepare_skeleton_chat_selection(_options(_resource(target)), store=store)
    assert rejected.value.status == status
    if case == "incomplete":
        # Preserve the consumer's actual validator code rather than inventing a new one.
        assert rejected.value.code == expected[0]
    else:
        assert rejected.value.code == code
    if case != "workflow":
        assert (rejected.value.code, rejected.value.path, rejected.value.status) == expected
    assert _rows(store) == before


@pytest.mark.parametrize("default_count", [0, 2])
def test_explicit_default_is_missing_or_ambiguous_without_fallback(tmp_path, default_count):
    api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    for index in range(default_count):
        store.save_draft(agent(f"default-{index}", "Default"))
    before = _rows(store)
    with pytest.raises(SkeletonResourceError) as rejected:
        api.prepare_skeleton_chat_selection(_options(_default()), store=store)
    assert (rejected.value.code, rejected.value.status) == ("default_unavailable", 404)
    assert _rows(store) == before


def test_ambiguous_migrated_alias_does_not_fall_back_to_existing_default(tmp_path):
    api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    store.save_draft(agent("ordinary-default", "Default"))
    _migrate(store, identity="first.recipe", prompt="first")
    with pytest.raises(SkeletonResourceError) as collision:
        _migrate(store, identity="second.recipe", prompt="second")
    assert collision.value.code == "legacy_name_ambiguous"
    before = _rows(store)
    with pytest.raises(SkeletonResourceError) as rejected:
        api.prepare_skeleton_chat_selection(_options(_legacy()), store=store,
                                             legacy_kernel=kernel_config())
    assert (rejected.value.code, rejected.value.status) == ("legacy_name_ambiguous", 409)
    assert _rows(store) == before


def test_root_and_recursive_children_remain_frozen_after_cas_reopen_and_caller_mutation(
        tmp_path, monkeypatch):
    api = _api()
    for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    store = SkeletonResourceStore(tmp_path / "resources")
    leaf = store.save_draft(agent("leaf", "Leaf before"))
    child = store.save_draft(agent("child", "Child before", child_source={
        "kind": "agent_ref", "agent_id": "leaf"}))
    root = store.save_draft(agent("root", "Root before", child_source={
        "kind": "agent_ref", "agent_id": "child"}))
    selected = api.prepare_skeleton_chat_selection(_options(_resource("root")), store=store)
    before, snapshot_digest = selected.to_dict(), selected.snapshot_digest
    assert before["subagents"][0]["subagents"][0]["document"]["name"] == "Leaf before"
    for saved in (root, child, leaf):
        changed = deepcopy(saved["document"])
        changed["name"] = changed["name"].replace("before", "after")
        changed["nodes"][1]["config"]["kernel"]["prompt"] = changed["name"]
        store.save_draft(changed, expected_edit_token=saved["edit_token"])
    cold = SkeletonResourceStore(store.root)
    second = api.prepare_skeleton_chat_selection(_options(_resource("root")), store=cold)
    assert second.edit_token != selected.edit_token
    assert second.definition_digest != selected.definition_digest
    assert second.to_dict()["subagents"][0]["document"]["name"] == "Child after"
    assert second.to_dict()["subagents"][0]["subagents"][0]["edit_token"] != leaf["edit_token"]
    detached = selected.to_dict()
    detached["document"]["nodes"][1]["config"]["kernel"]["prompt"] = "caller corruption"
    detached["subagents"][0]["document"]["name"] = "caller corruption"
    detached["subagents"][0]["subagents"].clear()
    assert selected.to_dict() == before and selected.snapshot_digest == snapshot_digest
    with pytest.raises((AttributeError, TypeError)):
        selected.resource_id = "caller corruption"


def test_published_workflow_metadata_is_fixed_without_claiming_workflow_bodies(tmp_path):
    api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    saved = store.save_draft(workflow("workflow-child", "Workflow v1"))
    revision = store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    document = agent("root")
    call = {"id": "call", "type": "workflow_call", "config": {
        "workflow": {"workflow_id": saved["id"], "revision_id": revision["revision_id"]},
        "execution": {"inputs": [binding("value", "kernel", ["message"])],
                      "outputs": [output("value", "result", ["value"])]}}}
    document["nodes"].insert(2, call)
    document["edges"][1]["target_node_id"] = "call"
    document["edges"].append({"id": "c", "kind": "flow", "source_node_id": "call",
                               "source_port_id": "out", "target_node_id": "end",
                               "target_port_id": "in"})
    document["nodes"][-1]["config"]["execution"]["inputs"] = [binding("message", "call", ["value"])]
    store.save_draft(document)
    selected = api.prepare_skeleton_chat_selection(_options(_resource("root")), store=store)
    expected = [{"workflow_id": saved["id"], "revision_id": revision["revision_id"],
                 "definition_digest": revision["definition_digest"]}]
    assert selected.to_dict()["dependencies"] == expected
    changed = workflow(saved["id"], "Workflow v2")
    changed["description"] = "new draft"
    second = store.save_draft(changed, expected_edit_token=saved["edit_token"])
    store.publish_workflow(saved["id"], expected_edit_token=second["edit_token"])
    detached = selected.to_dict()
    detached["dependencies"][0]["revision_id"] = "caller corruption"
    assert selected.to_dict()["dependencies"] == expected
    assert api.prepare_skeleton_chat_selection(_options(_resource("root")),
                                                store=SkeletonResourceStore(store.root)).to_dict()["dependencies"] == expected


def test_second_admission_reads_actual_imported_runtime_manifest_again(tmp_path, monkeypatch):
    api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    store.save_draft(agent("root"))
    selected = api.prepare_skeleton_chat_selection(_options(_resource("root")), store=store)
    before = selected.to_dict(), _rows(store)
    monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: None)
    with pytest.raises(SkeletonResourceError) as rejected:
        api.prepare_skeleton_chat_selection(_options(_resource("root")), store=store)
    assert (rejected.value.code, rejected.value.status) == ("runtime_protocol_manifest_missing", 409)
    assert selected.to_dict() == before[0] and _rows(store) == before[1]


def test_cold_source_process_reopens_real_store_without_api_keys(tmp_path):
    api = _api()
    store = SkeletonResourceStore(tmp_path / "resources")
    store.save_draft(agent("cold-root"))
    expected = api.prepare_skeleton_chat_selection(_options(_resource("cold-root")), store=store)
    code = """
import json, socket, sys
from pathlib import Path
def deny_network(*args, **kwargs):
    raise AssertionError('cold admission attempted network')
socket.socket.connect = deny_network
from skeleton_chat_selection import prepare_skeleton_chat_selection
from skeleton_resource_store import SkeletonResourceStore
from unchain.skeleton import prepare_agent_graph
from unchain.skeleton.agent_preparation import execution_definition_digest
selected = prepare_skeleton_chat_selection(json.loads(sys.argv[2]), store=SkeletonResourceStore(Path(sys.argv[1])))
snapshot = selected.to_dict()
assert execution_definition_digest(prepare_agent_graph(snapshot['document'])) == selected.definition_digest
print(json.dumps({'snapshot': snapshot, 'snapshot_digest': selected.snapshot_digest}, sort_keys=True))
"""
    env = dict(os.environ)
    for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        env.pop(name, None)
    result = subprocess.run([sys.executable, "-c", code, str(store.root),
                             json.dumps(_options(_resource("cold-root")))],
                            env=env, text=True, capture_output=True, timeout=30)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"snapshot": expected.to_dict(),
                                        "snapshot_digest": expected.snapshot_digest}


@pytest.mark.parametrize("entry", ["stream_chat", "stream_chat_events"])
@pytest.mark.parametrize("selected_id,code,status", [
    ("valid", "skeleton_active_context_required", 422),
    ("absent", "resource_missing", 404),
    ("archived", "resource_archived", 409),
    ("workflow", "wrong_kind", 400),
])
def test_actual_adapter_rejects_new_selection_before_legacy_model_or_registry(
        tmp_path, monkeypatch, entry, selected_id, code, status):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    store = SkeletonResourceStore()
    store.save_draft(agent("default", "Default"))
    store.save_draft(agent("valid"))
    archived = store.save_draft(agent("archived"))
    store.archive("archived", expected_edit_token=archived["edit_token"])
    store.save_draft(workflow("workflow"))
    before = _rows(store)
    guards = _effect_guards(monkeypatch)
    arguments = {"message": "hello", "history": [], "options": _options(_resource(selected_id)),
                 "session_id": "chat-selection-session"}
    if entry == "stream_chat_events":
        arguments["attempt_id"] = "chat-selection-attempt"
    with pytest.raises(DurableInteractionHostError) as rejected:
        list(getattr(adapter, entry)(**arguments))
    assert (rejected.value.code, rejected.value.status_code) == (code, status)
    _assert_no_effects(guards)
    assert _rows(store) == before


@pytest.mark.parametrize("entry", ["stream_chat", "stream_chat_events"])
def test_actual_adapter_sanitizes_unexpected_store_failure(tmp_path, monkeypatch, entry):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    store = SkeletonResourceStore()
    store.save_draft(agent("valid"))
    def fail_preflight(*args, **kwargs):
        raise RuntimeError(PRIVATE_SENTINEL)
    monkeypatch.setattr(SkeletonResourceStore, "preflight", fail_preflight)
    guards = _effect_guards(monkeypatch)
    arguments = {"message": "hello", "history": [], "options": _options(_resource("valid")),
                 "session_id": "chat-selection-session"}
    if entry == "stream_chat_events":
        arguments["attempt_id"] = "chat-selection-attempt"
    with pytest.raises(DurableInteractionHostError) as rejected:
        list(getattr(adapter, entry)(**arguments))
    assert (rejected.value.code, rejected.value.status_code) == ("skeleton_chat_admission_failed", 503)
    assert PRIVATE_SENTINEL not in str(rejected.value)
    _assert_no_effects(guards)


def _sse_frames(body):
    result = []
    for block in body.split("\n\n"):
        lines = block.splitlines()
        event = next((line[6:].strip() for line in lines if line.startswith("event:")), "")
        data = next((line[5:].strip() for line in lines if line.startswith("data:")), "")
        if event and data:
            result.append((event, json.loads(data)))
    return result


@pytest.mark.parametrize("path", ["/chat/stream/v2", "/chat/stream/v4"])
@pytest.mark.parametrize("case,code", [
    ("valid", "skeleton_active_context_required"),
    ("missing", "resource_missing"),
    ("archived", "resource_archived"),
    ("workflow", "wrong_kind"),
    ("incomplete", None),
    ("runtime", "runtime_protocol_manifest_missing"),
    ("private-exception", "skeleton_chat_admission_failed"),
])
def test_authenticated_http_uses_actual_adapter_and_emits_only_safe_failure(
        tmp_path, monkeypatch, path, case, code):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    store = SkeletonResourceStore()
    store.save_draft(agent("default", "Default"))
    target = "absent" if case == "missing" else "selected"
    document = workflow(target) if case == "workflow" else agent(target)
    if case == "incomplete":
        document["nodes"][1]["config"].pop("kernel")
    if case != "missing":
        saved = store.save_draft(document)
        if case == "archived":
            store.archive(target, expected_edit_token=saved["edit_token"])
    if case == "incomplete":
        with pytest.raises(SkeletonResourceError) as actual:
            store.preflight(target)
        code = actual.value.code
    if case == "runtime":
        # Preserve the real chat route protocol gate; only Skeleton admission is incompatible.
        actual_producer = runtime_protocol.runtime_protocol_manifest
        manifest = deepcopy(actual_producer())
        manifest["protocols"] = [item for item in manifest["protocols"]
                                 if item["id"] != "skeleton_execution"]
        body = {name: manifest[name] for name in ("protocols", "runtime", "schema")}
        manifest["manifest_digest"] = "sha256:" + sha256(
            b"unchain.runtime_protocol_manifest.v1\\u0000" + _canonical(body)).hexdigest()
        monkeypatch.setattr(runtime_protocol, "runtime_protocol_manifest", lambda: deepcopy(manifest))
        code = "skeleton_runtime_incompatible"
    elif case == "private-exception":
        def private_failure(*args, **kwargs):
            raise RuntimeError(PRIVATE_SENTINEL)
        monkeypatch.setattr(SkeletonResourceStore, "preflight", private_failure)
    before = _rows(store)
    guards = _effect_guards(monkeypatch)
    monkeypatch.setattr(routes, "stream_chat_events", adapter.stream_chat_events)
    flask = pupu_app.create_app()
    flask.config["UNCHAIN_AUTH_TOKEN"] = "chat-selection-test-token"
    client = flask.test_client()
    response = client.post(path, headers={"x-unchain-auth": "chat-selection-test-token"},
                           json={"message": "hello", "threadId": "chat-selection-http",
                                 "attempt_id": "chat-selection-http-attempt",
                                 "memory_v2_requested": False,
                                 "options": _options(_resource(target))})
    wire = response.get_data(as_text=True)
    frames = _sse_frames(wire)
    assert response.status_code == 200, wire
    assert PRIVATE_SENTINEL not in wire
    if path.endswith("v2"):
        assert [name for name, _ in frames] == ["frame", "frame"]
        assert [frame["type"] for _, frame in frames] == ["stream_started", "error"]
        error = frames[-1][1]["payload"]
    else:
        assert [name for name, _ in frames] == ["runtime_event", "runtime_event", "done"]
        assert [frame["type"] for _, frame in frames[:2]] == ["session.started", "run.failed"]
        failure, done = frames[1][1], frames[2][1]
        assert failure["payload"]["status"] == "failed"
        assert failure["payload"]["recoverable"] is False
        error = failure["payload"]["error"]
        assert done["error"] == error and done["cancelled"] is False
        assert "bundle" not in done
    assert set(error) == {"code", "message"}
    assert error["code"] == code and isinstance(error["message"], str) and error["message"]
    assert all(frame.get("type") not in {"final_message", "token_delta", "run.completed"}
               for _, frame in frames)
    _assert_no_effects(guards)
    assert _rows(store) == before


@pytest.mark.parametrize("entry", ["stream_chat", "stream_chat_events"])
def test_actual_adapter_uses_real_loader_for_missing_explicit_old_recipe(tmp_path, monkeypatch, entry):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    recipe_loader.save_recipe(_legacy_recipe("Default"))
    guards = _effect_guards(monkeypatch, legacy=False)
    arguments = {"message": "hello", "history": [], "options": {"recipe_name": "Missing"},
                 "session_id": "missing-old-recipe-session"}
    if entry == "stream_chat_events":
        arguments["attempt_id"] = "missing-old-recipe-attempt"
    with pytest.raises(DurableInteractionHostError) as rejected:
        list(getattr(adapter, entry)(**arguments))
    assert (rejected.value.code, rejected.value.status_code) == ("recipe_not_found", 404)
    _assert_no_effects(guards)


@pytest.mark.parametrize("entry", ["stream_chat", "stream_chat_events"])
def test_actual_adapter_keeps_explicit_valid_old_recipe_path(tmp_path, monkeypatch, entry):
    from test_unchain_adapter_recipe_graph_runtime import _recipe_dict
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    recipe_loader.save_recipe(_recipe_dict())
    create_agent = Mock(side_effect=AssertionError("graph control must stay in legacy graph path"))
    monkeypatch.setattr(adapter, "_create_agent", create_agent)
    event = {"type": "final_message", "run_id": "legacy-control-run", "iteration": 0,
             "content": "legacy control"}
    graph_stream = Mock(return_value=iter([event]))
    monkeypatch.setattr(adapter, "_stream_recipe_graph_events", graph_stream)
    values = list(getattr(adapter, entry)(message="hello", history=[],
                                          options={"recipe_name": "Graph"}))
    assert values == (["legacy control"] if entry == "stream_chat" else [event])
    graph_stream.assert_called_once()
    assert graph_stream.call_args.kwargs["recipe"] == recipe_loader.load_recipe("Graph")
    create_agent.assert_not_called()


@pytest.mark.parametrize("path", ["/chat/stream/v2", "/chat/stream/v4"])
def test_actual_authenticated_http_rejects_unknown_old_recipe_before_registration(
        tmp_path, monkeypatch, path):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    recipe_loader.save_recipe(_legacy_recipe("Default"))
    guards = _effect_guards(monkeypatch, legacy=False)
    monkeypatch.setattr(routes, "stream_chat_events", adapter.stream_chat_events)
    flask = pupu_app.create_app()
    flask.config["UNCHAIN_AUTH_TOKEN"] = "chat-selection-test-token"
    response = flask.test_client().post(
        path, headers={"x-unchain-auth": "chat-selection-test-token"},
        json={"message": "hello", "threadId": "missing-old-recipe-http",
              "attempt_id": "missing-old-recipe-http-attempt", "memory_v2_requested": False,
              "options": {"recipe_name": "Missing"}})
    wire = response.get_data(as_text=True)
    frames = _sse_frames(wire)
    assert response.status_code == 200
    errors = [frame["payload"] for _, frame in frames if frame.get("type") == "error"]
    errors += [frame["payload"]["error"] for _, frame in frames
               if frame.get("type") == "run.failed"]
    assert len(errors) == 1 and errors[0]["code"] == "recipe_not_found"
    assert set(errors[0]) == {"code", "message"}
    assert all("bundle" not in frame for _, frame in frames)
    _assert_no_effects(guards)


def test_common_legacy_loader_chokepoint_cannot_fall_back_for_opted_in_skeleton(
        tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    store = SkeletonResourceStore()
    store.save_draft(agent("valid"))
    recipe_loader.save_recipe(_legacy_recipe("Default"))
    loader = Mock(wraps=recipe_loader.load_recipe)
    monkeypatch.setattr(recipe_loader, "load_recipe", loader)
    with pytest.raises(DurableInteractionHostError) as rejected:
        adapter._load_recipe_from_options(_options(_resource("valid")))
    assert (rejected.value.code, rejected.value.status_code) == ("skeleton_chat_execution_unavailable", 503)
    loader.assert_not_called()


@pytest.mark.parametrize("name", ["Missing", "Default"])
def test_real_explicit_recipe_missing_is_typed_and_never_falls_back(tmp_path, monkeypatch, name):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    if name != "Default":
        recipe_loader.save_recipe(_legacy_recipe("Default"))
    with pytest.raises(DurableInteractionHostError) as rejected:
        adapter._load_recipe_from_options({"recipe_name": name})
    assert (rejected.value.code, rejected.value.status_code) == ("recipe_not_found", 404)


@pytest.mark.parametrize("value", [True, 7, {}, [], " \t", "../Default"])
def test_malformed_explicit_recipe_is_rejected_before_real_loader(monkeypatch, value):
    loader = Mock(side_effect=AssertionError("invalid name entered loader"))
    monkeypatch.setattr(recipe_loader, "load_recipe", loader)
    with pytest.raises(DurableInteractionHostError) as rejected:
        adapter._load_recipe_from_options({"recipe_name": value})
    assert (rejected.value.code, rejected.value.status_code) == ("invalid_recipe_selection", 400)
    loader.assert_not_called()


@pytest.mark.parametrize("name", [" Legacy ", " "])
def test_real_old_recipe_name_is_preserved_exactly_without_default_fallback(
        tmp_path, monkeypatch, name):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    recipe_loader.save_recipe(_legacy_recipe("Default", "default must remain distinct"))
    recipe_loader.save_recipe(_legacy_recipe(name, "exact old selection"))
    real_recipe = recipe_loader.load_recipe(name)
    assert real_recipe.name == name and real_recipe.agent.prompt == "exact old selection"
    loader = Mock(wraps=recipe_loader.load_recipe)
    monkeypatch.setattr(recipe_loader, "load_recipe", loader)
    selected = adapter._load_recipe_from_options({"recipe_name": name})
    assert selected == real_recipe
    loader.assert_called_once_with(name)


def test_real_corrupt_recipe_is_missing_but_unexpected_loader_exception_is_safe(
        tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    recipe_loader.save_recipe(_legacy_recipe("Default"))
    path = recipe_loader.recipes_dir() / "Broken.recipe"
    path.write_text("{corrupt", encoding="utf-8")
    with pytest.raises(DurableInteractionHostError) as corrupt:
        adapter._load_recipe_from_options({"recipe_name": "Broken"})
    assert (corrupt.value.code, corrupt.value.status_code) == ("recipe_not_found", 404)
    original_read = Path.read_text
    def private_failure(path, *args, **kwargs):
        if path.name == "Default.recipe":
            raise RuntimeError(PRIVATE_SENTINEL)
        return original_read(path, *args, **kwargs)
    monkeypatch.setattr(Path, "read_text", private_failure)
    with pytest.raises(DurableInteractionHostError) as unexpected:
        adapter._load_recipe_from_options({"recipe_name": "Default"})
    assert (unexpected.value.code, unexpected.value.status_code) == ("recipe_load_failed", 503)
    assert PRIVATE_SENTINEL not in str(unexpected.value)
    assert adapter._load_recipe_from_options({}) is None


@pytest.mark.parametrize("options", [None, {}, {"recipe_name": None}, {"recipe_name": ""},
                                      {"character_id": "Character", "context_memory_v2_mode": "off"},
                                      {"context_memory_v2_mode": "shadow"}])
def test_no_selector_default_recipe_loading_retains_legacy_behavior(tmp_path, monkeypatch, options):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    assert adapter._load_recipe_from_options(options) is None
    recipe_loader.save_recipe(_legacy_recipe("Default", "ordinary default"))
    selected = adapter._load_recipe_from_options(options)
    assert selected.name == "Default" and selected.agent.prompt == "ordinary default"
    recipe_loader.save_recipe(_legacy_recipe("Chosen", "explicit chosen"))
    chosen = adapter._load_recipe_from_options({"recipe_name": "Chosen"})
    assert chosen.name == "Chosen" and chosen.agent.prompt == "explicit chosen"


def _seed_real_legacy_resume_receipt(session_id):
    import durable_interaction_host as host
    import session_execution_guard as guard
    from unchain.interaction.durable import (
        INTERACTION_JOURNAL_KEY, build_interaction_request, new_interaction_journal,
        register_interaction_request,
    )
    from unchain.interaction.runtime import response_contract_for_kind

    # Real JsonFile session persistence, response contract, parked guard and
    # submitted receipt, matching the independent legacy-resume review probe.
    request = build_interaction_request(
        session_id=session_id, kind="tool_approval", source_run_id="run-live",
        occurrence="tool_approval:1", payload={
            "type": "tool_confirmation_request", "tool_name": "write",
            "call_id": "call-live", "arguments": {"path": "notes.txt"},
            "description": "Write notes.txt",
        }, response_contract=response_contract_for_kind("tool_approval"),
        created_revision=0, subject={"provider": "openai", "model": "gpt-5"},
    )
    journal = register_interaction_request(new_interaction_journal(), request,
                                           checkpoint_id="checkpoint-live")
    host._session_store().save(session_id, {INTERACTION_JOURNAL_KEY: journal})
    host.save_resume_context(
        session_id=session_id, run_id="run-live", options={
            "modelId": "openai:gpt-5", "memory_enabled": True, "recipe_name": "Named",
        }, provider="openai", model="gpt-5",
    )
    guard.initialize_session_guard_protocol()
    assert guard.acquire_run_guard(session_id, "run-live") == "acquired"
    guard.park_session_guard(session_id=session_id, interaction_id=request.interaction_id,
                             source_attempt_id="run-live", owner_attempt_id="run-live")
    receipt = host.record_interaction_receipt(
        session_id=session_id, interaction_id=request.interaction_id, approved=True)
    pending = host.get_pending_interaction(session_id)
    assert pending["status"] == "receipt_recorded" and pending["resume_available"] is True
    assert pending["resume_options"]["recipe_name"] == "Named"
    assert pending["receipt_id"] == receipt["receipt_id"]
    return request, pending


def _pending_semantics(pending):
    value = deepcopy(pending)
    # _presentation_for_request generates this one timestamp at read time;
    # every other projected field and the persisted record remain asserted.
    timestamp = value["presentation"]["trace_frame"].pop("ts")
    assert type(timestamp) is int and timestamp >= 0
    return value


@pytest.mark.parametrize("case,code,status", [
    ("missing", "recipe_not_found", 404),
    ("private-read-exception", "recipe_load_failed", 503),
])
def test_real_legacy_resume_recipe_failure_settles_owned_attempt_and_preserves_old_receipt(
        tmp_path, monkeypatch, case, code, status):
    import durable_interaction_host as host
    import execution_control
    import session_execution_guard as guard

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    recipe_loader.save_recipe(_legacy_recipe("Default", "default must never replace Named"))
    recipe_loader.save_recipe(_legacy_recipe("Named", "saved named legacy Recipe"))
    assert recipe_loader.load_recipe("Named").agent.prompt == "saved named legacy Recipe"
    session_id, attempt_id = f"legacy-recipe-resume-{case}", f"resume-{case}"
    request, pending_before = _seed_real_legacy_resume_receipt(session_id)
    persisted_paths = (Path(host._session_store()._path(session_id)),
                       host._context_path(session_id, "run-live"))
    assert all(path.is_file() and path.is_relative_to(tmp_path) for path in persisted_paths)
    persisted_before = {path: path.read_bytes() for path in persisted_paths}
    assert execution_control.snapshot(session_id, attempt_id) is None
    assert host.load_execution_attempt_binding(session_id, attempt_id) is None
    parked = guard.snapshot_session_guard(session_id=session_id)
    assert parked.state == "parked" and parked.attempt_id == "run-live"
    path = recipe_loader.recipes_dir() / "Named.recipe"
    if case == "missing":
        path.unlink()
        assert recipe_loader.load_recipe("Named") is None
    else:
        original_read = Path.read_text
        def private_failure(candidate, *args, **kwargs):
            if candidate == path:
                raise RuntimeError(PRIVATE_SENTINEL)
            return original_read(candidate, *args, **kwargs)
        monkeypatch.setattr(Path, "read_text", private_failure)
    loader = Mock(wraps=recipe_loader.load_recipe)
    monkeypatch.setattr(recipe_loader, "load_recipe", loader)
    guards = _effect_guards(monkeypatch, legacy=False, registry=False)
    arguments = {"session_id": session_id, "interaction_id": request.interaction_id,
                 "options": {}, "attempt_id": attempt_id, "source_attempt_id": "run-live"}
    with pytest.raises(DurableInteractionHostError) as rejected:
        list(adapter.resume_chat_interaction_events(**arguments))
    assert (rejected.value.code, rejected.value.status_code) == (code, status)
    assert PRIVATE_SENTINEL not in str(rejected.value)
    loader.assert_called_once_with("Named")
    _assert_no_effects(guards)
    execution = execution_control.snapshot(session_id, attempt_id)
    assert execution is not None and execution.status == "failed" and execution.terminal
    assert execution.running_at_ms is not None and execution.terminal_at_ms is not None
    assert host.load_execution_attempt_binding(session_id, attempt_id) is None
    assert guard.snapshot_session_guard(session_id=session_id) is None
    pending_after = host.get_pending_interaction(session_id)
    assert {path: path.read_bytes() for path in persisted_paths} == persisted_before
    assert _pending_semantics(pending_after) == _pending_semantics(pending_before)
    assert pending_after["status"] == "receipt_recorded"
    assert pending_after["receipt_id"] == pending_before["receipt_id"]
    assert pending_after["source_run_id"] == "run-live" and pending_after["active_attempt_id"] == "run-live"
    assert pending_after["resume_available"] is True
    # The pending reader intentionally reconstructs the still-pending source
    # guard from the preserved receipt; this is distinct from the failed new
    # attempt's guard, which was already proved absent before the read.
    restored = guard.snapshot_session_guard(session_id=session_id)
    assert restored.state == "parked" and restored.operation == "run"
    assert restored.attempt_id == "run-live" and restored.execution_id == session_id
    assert restored.interaction_id == request.interaction_id
    assert restored.interaction_source_attempt_id == "run-live"
    assert restored.receipt_id == pending_before["receipt_id"]
    restored_snapshot = restored.to_dict()
    # The failed attempt is terminal; repeating it must stop before recipe,
    # model, graph or receipt processing and must not resurrect its binding.
    settled = execution.to_dict()
    assert list(adapter.resume_chat_interaction_events(**arguments)) == []
    loader.assert_called_once_with("Named")
    _assert_no_effects(guards)
    assert execution_control.snapshot(session_id, attempt_id).to_dict() == settled
    assert host.load_execution_attempt_binding(session_id, attempt_id) is None
    assert guard.snapshot_session_guard(session_id=session_id).to_dict() == restored_snapshot
    assert _pending_semantics(host.get_pending_interaction(session_id)) == _pending_semantics(pending_before)
    assert guard.snapshot_session_guard(session_id=session_id).to_dict() == restored_snapshot
    assert {path: path.read_bytes() for path in persisted_paths} == persisted_before
