"""Credential discovery uses admitted definitions, never a composer model/key."""
from copy import deepcopy
from hashlib import sha256
import importlib
import json
from types import SimpleNamespace

import pytest

from skeleton_chat_selection import prepare_skeleton_chat_selection
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies


QUERY_SCHEMA = "pupu.skeleton_credential_query.v1"
RESULT_SCHEMA = "pupu.skeleton_credential_requirements.v1"
SCOPE_SCHEMA = "pupu.skeleton_credential_scope.v1"
SCOPE_KEYS = {"schema", "mode", "session_id", "owner_chat_id", "interaction_id",
              "source_attempt_id", "selection_digest", "workflows_digest",
              "launch_digest", "memory_provider"}
PROFILE_KEYS = {"id", "credential_ref", "provider", "model", "protocol", "endpoint"}


def _api():
    # Missing implementation is an individual RED, not collection failure.
    return importlib.import_module("skeleton_credential_requirements")


def _output(name, kind, path):
    return {"name": name, "source": {"kind": kind, "path": path}}


def _input(name, node_id, path):
    return {"name": name, "value": {"kind": "ref", "node_id": node_id, "path": path},
            "missing": "error"}


def _agent(identity, *, provider="openai", child=None):
    protocol, endpoint = {
        "openai": ("openai-responses", "https://api.openai.com/v1"),
        "anthropic": ("anthropic", "https://api.anthropic.com"),
        "ollama": ("ollama", "http://localhost:11434"),
    }[provider]
    kernel = {"schema_version": 1, "profile": {
        "id": "profile." + identity, "provider": provider, "model": "model." + identity,
        "protocol": protocol, "endpoint": endpoint, "credential_ref": "key." + identity,
        "context_window": 8192, "output_limit": 2048,
        "capabilities": {"json_schema": True, "images": True, "files": True},
    }, "prompt": "literal prompt", "max_iterations": 8, "output_tokens": 512,
        "history": "root", "overflow": "error", "json_schema": None}
    document = {"schema_version": 1, "kind": "agent", "id": identity, "name": identity,
        "nodes": [
            {"id": "start", "type": "start", "config": {"execution": {
                "outputs": [_output("message", "result", ["message"])]}}},
            {"id": "kernel", "type": "agent", "config": {"kernel": kernel,
                "execution": {"inputs": [_input("message", "start", ["message"])],
                    "outputs": [_output("message", "result", ["message"])]}}},
            {"id": "end", "type": "end", "config": {"execution": {
                "inputs": [_input("message", "kernel", ["message"])],
                "outputs": [_output("message", "input", ["message"])]}}}],
        "edges": [{"id": "first", "kind": "flow", "source_node_id": "start",
            "source_port_id": "out", "target_node_id": "kernel", "target_port_id": "in"},
            {"id": "last", "kind": "flow", "source_node_id": "kernel",
            "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"}]}
    if child is not None:
        document["nodes"].append({"id": "pool", "type": "subagent_pool", "config": {
            "subagents": [{"id": "child", "name": "Child", "description": "Literal child",
                "source": {"kind": "embedded", "document": child},
                "allowed_modes": ["delegate"], "output_mode": "summary",
                "memory_policy": "ephemeral", "parallel_safe": False,
                "allowed_tools": None, "disabled_tools": []}]}})
        document["edges"].append({"id": "attach", "kind": "attach",
            "source_node_id": "kernel", "source_port_id": "attach_bot",
            "target_node_id": "pool", "target_port_id": "attach_top"})
    return document


def _profile(document):
    return document["nodes"][1]["config"]["kernel"]["profile"]


def _query(identity="root", *, mode="start", **changes):
    value = {"schema": QUERY_SCHEMA, "mode": mode, "session_id": "session",
        "owner_chat_id": "owner", "interaction_id": "interaction" if mode == "resume" else "",
        "source_attempt_id": "", "selection": {"schema": "pupu.skeleton_chat_selection.v1",
            "kind": "resource", "resource_id": identity}, "recipe_name": "",
        "memory_agent_config": None}
    value.update(changes)
    return value


def _frozen(tmp_path, document=None):
    store = SkeletonResourceStore(tmp_path / "resources")
    document = _agent("root") if document is None else document
    store.save_draft(document)
    selection = prepare_skeleton_chat_selection(
        {"skeleton_selection": _query(document["id"])["selection"]}, store=store)
    workflows = freeze_skeleton_workflow_dependencies(selection, store=store)
    return store, selection, workflows


def _launch(selection, workflows):
    # A real CLOSED launch consumer validates this injected resolver witness;
    # no journal, provider, adapter or default resource store is constructed.
    from memory_v2_unchain_runtime_context import build_pupu_memory_v2_root_runtime_context
    from memory_v2_unchain_run_binding import PupuMemoryV2RunBinding, PupuMemoryV2TextInputDraft
    from skeleton_production_state import validate_launch_descriptor
    from skeleton_runtime_capability import require_skeleton_runtime
    from unchain.memory import MEMORY_V2_MODULE_KEY

    context = build_pupu_memory_v2_root_runtime_context(owner_chat_id="owner",
        execution_id="session", attempt_id="root-run", run_id="root-run")
    binding = PupuMemoryV2RunBinding(owner_chat_id="owner", session_id="session",
        generation_id="generation", head_revision=1, identity=context.identity,
        grant=context.grant_for(MEMORY_V2_MODULE_KEY),
        current_input_draft=PupuMemoryV2TextInputDraft(content="original input")).canonical_value()
    descriptor = {"schema": "pupu.skeleton-launch.v1", "session_id": "session",
        "owner_chat_id": "owner", "root_run_id": "root-run", "graph_id": "graph",
        "selection": selection.to_dict(), "workflows": workflows.to_dict(), "binding": binding,
        "workspace_root": None, "inputs": {"message": "original input", "images": [], "files": []},
        "attachments": [], "runtime_manifest": require_skeleton_runtime(),
        "capabilities": {"toolkits": [], "include_user_dirs": False, "workspace_roots": []}}
    validate_launch_descriptor(descriptor, session_id="session", root_run_id="root-run",
        expected_owner_chat_id="owner")
    return SimpleNamespace(descriptor=descriptor, selection=selection, workflows=workflows)


def _pending(selection, workflows):
    return SimpleNamespace(launch=_launch(selection, workflows), request=SimpleNamespace(
        interaction_id="interaction", session_id="descendant-session", source_run_id="descendant-run"))


def _scope(selection, workflows, **changes):
    arguments = {"mode": "start", "session_id": "session", "owner_chat_id": "owner"}
    arguments.update(changes)
    return _api().requirements_from_frozen(selection, workflows, **arguments)["scope"]


def test_start_real_store_enumerates_recursive_mixed_profiles_without_writes(tmp_path):
    document = _agent("root", provider="anthropic", child=_agent("child", child=_agent("local", provider="ollama")))
    original = deepcopy(document)
    store, selection, workflows = _frozen(tmp_path, document)
    database = store.database_path.read_bytes()
    result = _api().requirements_for_start(_query(), memory_provider="", store=store)
    assert set(result) == {"schema", "kind", "scope", "profiles"}
    assert result["schema"] == RESULT_SCHEMA and result["kind"] == "skeleton"
    assert set(result["scope"]) == SCOPE_KEYS
    assert result["scope"] == {"schema": SCOPE_SCHEMA, "mode": "start", "session_id": "session",
        "owner_chat_id": "owner", "interaction_id": "", "source_attempt_id": "",
        "selection_digest": selection.snapshot_digest, "workflows_digest": workflows.snapshot_digest,
        "launch_digest": "", "memory_provider": "anthropic"}
    expected = [_profile(original), _profile(original["nodes"][3]["config"]["subagents"][0]["source"]["document"]),
        _profile(original["nodes"][3]["config"]["subagents"][0]["source"]["document"]["nodes"][3]["config"]["subagents"][0]["source"]["document"])]
    assert result["profiles"] == [{key: row[key] for key in PROFILE_KEYS} for row in sorted(expected, key=lambda row: row["id"])]
    assert all(set(row) == PROFILE_KEYS for row in result["profiles"])
    assert store.database_path.read_bytes() == database
    assert store.get_resource("root")["document"] == original == document


def test_memory_provider_is_independent_of_kernel_and_result_copies_do_not_mutate_frozen(tmp_path):
    store, selection, workflows = _frozen(tmp_path)
    original = selection.to_dict()
    result = _api().requirements_for_start(_query(), memory_provider="gemini", store=store)
    assert result["scope"]["memory_provider"] == "gemini"
    assert result["profiles"][0]["provider"] == "openai"
    result["profiles"][0]["provider"] = "caller-change"
    result["scope"]["selection_digest"] = "caller-change"
    assert selection.to_dict() == original
    assert _scope(selection, workflows)["memory_provider"] == "openai"


def test_identical_profile_ids_deduplicate_but_different_profiles_refuse(tmp_path):
    child = _agent("child")
    parent = _agent("root", child=child)
    child["nodes"][1]["config"]["kernel"]["profile"] = deepcopy(_profile(parent))
    _store, selection, workflows = _frozen(tmp_path, parent)
    assert len(_api().requirements_from_frozen(selection, workflows,
        mode="start", session_id="session", owner_chat_id="owner")["profiles"]) == 1
    changed = selection.to_dict()
    child_row = changed["subagents"][0]
    _profile(child_row["document"])["model"] = "changed-model"
    from unchain.skeleton import prepare_agent_graph
    from unchain.skeleton.agent_preparation import execution_definition_digest
    child_row["definition_digest"] = execution_definition_digest(prepare_agent_graph(child_row["document"]))
    mutated = type(selection)(json.dumps(changed, sort_keys=True, separators=(",", ":")).encode())
    with pytest.raises(SkeletonResourceError) as rejected:
        _scope(mutated, workflows)
    assert rejected.value.code == "profile_conflict"


def test_shared_ref_for_distinct_provider_or_endpoint_refuses(tmp_path):
    child = _agent("child", provider="anthropic")
    parent = _agent("root", child=child)
    _profile(child)["credential_ref"] = _profile(parent)["credential_ref"]
    _store, selection, workflows = _frozen(tmp_path, parent)
    with pytest.raises(SkeletonResourceError) as rejected:
        _scope(selection, workflows)
    assert rejected.value.code == "credential_conflict"


@pytest.mark.parametrize("mutation", [
    {"schema": "future.v2"}, {"extra": "private-input"}, {"mode": "resume"},
    {"session_id": ""}, {"owner_chat_id": " owner"}, {"interaction_id": "unexpected"},
])
def test_start_query_rejects_malformed_wire_before_opening_store(monkeypatch, mutation):
    def forbidden(*args, **kwargs):
        pytest.fail("invalid query must not construct a Store")
    monkeypatch.setattr(SkeletonResourceStore, "__init__", forbidden)
    with pytest.raises(SkeletonResourceError) as rejected:
        _api().requirements_for_start(_query(**mutation), memory_provider="")
    assert rejected.value.status == 400
    assert "private-input" not in str(rejected.value)


def test_absent_scope_retains_direct_caller_compatibility(tmp_path):
    _store, selection, workflows = _frozen(tmp_path)
    assert _api().assert_credential_scope({}, selection, workflows,
        mode="start", session_id="session", owner_chat_id="owner") is None


def test_exact_scope_passes_and_changed_root_is_stale_without_writes(tmp_path):
    store, selection, workflows = _frozen(tmp_path)
    options = {"skeleton_credential_scope": _scope(selection, workflows)}
    _api().assert_credential_scope(options, selection, workflows,
        mode="start", session_id="session", owner_chat_id="owner")
    resource = store.get_resource("root")
    resource["document"]["description"] = "an unrelated author saved"
    store.save_draft(resource["document"], expected_edit_token=resource["edit_token"])
    changed = prepare_skeleton_chat_selection({"skeleton_selection": _query()["selection"]}, store=store)
    database = store.database_path.read_bytes()
    with pytest.raises(SkeletonResourceError) as rejected:
        _api().assert_credential_scope(options, changed, workflows,
            mode="start", session_id="session", owner_chat_id="owner")
    assert (rejected.value.code, rejected.value.status) == ("skeleton_credential_scope_stale", 409)
    assert store.database_path.read_bytes() == database


def test_actual_memory_provider_must_match_issued_scope(tmp_path):
    _store, selection, workflows = _frozen(tmp_path)
    options = {"skeleton_credential_scope": _scope(selection, workflows, memory_provider="anthropic"),
        "_memory_v2_memory_agent_config": {"provider": "anthropic", "model_id": "separate-model"}}
    _api().assert_credential_scope(options, selection, workflows,
        mode="start", session_id="session", owner_chat_id="owner")
    options["_memory_v2_memory_agent_config"]["provider"] = "gemini"
    with pytest.raises(SkeletonResourceError) as rejected:
        _api().assert_credential_scope(options, selection, workflows,
            mode="start", session_id="session", owner_chat_id="owner")
    assert (rejected.value.code, rejected.value.status) == ("skeleton_credential_scope_stale", 409)


@pytest.mark.parametrize("field,value", [
    ("schema", "future.v2"), ("extra", "private-sentinel"),
    ("selection_digest", "not-a-digest"), ("workflows_digest", 7),
    ("launch_digest", "0" * 64), ("owner_chat_id", ""), ("memory_provider", None),
])
def test_malformed_scope_is_typed_400(tmp_path, field, value):
    _store, selection, workflows = _frozen(tmp_path)
    issued = _scope(selection, workflows)
    issued[field] = value
    with pytest.raises(SkeletonResourceError) as rejected:
        _api().assert_credential_scope({"skeleton_credential_scope": issued}, selection, workflows,
            mode="start", session_id="session", owner_chat_id="owner")
    assert (rejected.value.code, rejected.value.status) == ("skeleton_credential_scope_invalid", 400)
    assert "private-sentinel" not in str(rejected.value)


@pytest.mark.parametrize("field,value", [("selection_digest", "0" * 64),
    ("workflows_digest", "0" * 64), ("session_id", "other-session"), ("owner_chat_id", "other-owner")])
def test_valid_shape_wrong_scope_is_typed_409(tmp_path, field, value):
    _store, selection, workflows = _frozen(tmp_path)
    issued = _scope(selection, workflows)
    issued[field] = value
    with pytest.raises(SkeletonResourceError) as rejected:
        _api().assert_credential_scope({"skeleton_credential_scope": issued}, selection, workflows,
            mode="start", session_id="session", owner_chat_id="owner")
    assert (rejected.value.code, rejected.value.status) == ("skeleton_credential_scope_stale", 409)


def test_resume_none_is_closed_not_skeleton_without_store(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("resume discovery must not construct a resource Store")
    monkeypatch.setattr(SkeletonResourceStore, "__init__", forbidden)
    assert _api().requirements_for_resume(_query(mode="resume"), memory_provider="",
        pending_resolver=lambda *args, **kwargs: None) == {"schema": RESULT_SCHEMA, "kind": "not_skeleton"}


def test_resume_uses_verified_original_launch_not_latest_resource_or_composer(tmp_path, monkeypatch):
    store, selection, workflows = _frozen(tmp_path)
    pending = _pending(selection, workflows)
    resource = store.get_resource("root")
    _profile(resource["document"])["endpoint"] = "https://edited.example/v1"
    store.save_draft(resource["document"], expected_edit_token=resource["edit_token"])
    def forbidden(*args, **kwargs):
        pytest.fail("resume must not read mutable resources")
    monkeypatch.setattr(SkeletonResourceStore, "__init__", forbidden)
    query = _query(mode="resume", selection={"arbitrary": "ignored"}, recipe_name="Current composer")
    result = _api().requirements_for_resume(query, memory_provider="", pending_resolver=lambda *args, **kwargs: pending)
    assert result["profiles"][0]["endpoint"] == "https://api.openai.com/v1"
    assert result["scope"]["source_attempt_id"] == "root-run"
    assert result["scope"]["launch_digest"] == sha256(json.dumps(pending.launch.descriptor,
        sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()).hexdigest()
    _api().assert_credential_scope({"skeleton_credential_scope": result["scope"]}, selection, workflows,
        mode="resume", session_id="session", owner_chat_id="owner", interaction_id="interaction",
        source_attempt_id="root-run", launch=pending.launch)


@pytest.mark.parametrize("field,value", [("interaction_id", "other-interaction"),
    ("source_attempt_id", "other-root"), ("owner_chat_id", "other-owner")])
def test_resume_wrong_identity_is_stale_not_retargeted(tmp_path, field, value):
    _store, selection, workflows = _frozen(tmp_path)
    pending = _pending(selection, workflows)
    with pytest.raises(SkeletonResourceError) as rejected:
        _api().requirements_for_resume(_query(mode="resume", **{field: value}), memory_provider="",
            pending_resolver=lambda *args, **kwargs: pending)
    assert (rejected.value.code, rejected.value.status) == ("skeleton_credential_scope_stale", 409)


def test_resume_launch_closed_validation_refuses_tampered_descriptor_without_echo(tmp_path):
    _store, selection, workflows = _frozen(tmp_path)
    pending = _pending(selection, workflows)
    pending.launch.descriptor["private-sentinel"] = "must-not-echo"
    with pytest.raises(SkeletonResourceError) as rejected:
        _api().requirements_for_resume(_query(mode="resume"), memory_provider="",
            pending_resolver=lambda *args, **kwargs: pending)
    assert rejected.value.status in (400, 409)
    assert "private-sentinel" not in str(rejected.value) and "must-not-echo" not in str(rejected.value)


def test_unexpected_resolver_error_is_not_exposed_in_exception_rendering():
    import traceback
    def broken_resolver(*args, **kwargs):
        raise ValueError("PRIVATE_UNDERLYING_SENTINEL")
    with pytest.raises(SkeletonResourceError) as rejected:
        _api().requirements_for_resume(_query(mode="resume"), memory_provider="",
            pending_resolver=broken_resolver)
    assert rejected.value.status == 400
    assert "PRIVATE_UNDERLYING_SENTINEL" not in "".join(traceback.format_exception(rejected.value))
