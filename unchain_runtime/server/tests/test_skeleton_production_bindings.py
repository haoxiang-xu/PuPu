"""BC-023 real local capability binding and credential isolation."""
from copy import deepcopy
import importlib
import os
from types import SimpleNamespace

import pytest

import unchain_adapter as adapter
from skeleton_resource_store import SkeletonResourceStore, SkeletonResourceError
from skeleton_chat_selection import prepare_skeleton_chat_selection
from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies
from test_skeleton_resource_store import agent, workflow, code_workflow, binding, output
from unchain.journal import AttemptRef, GenerationRef
from unchain.persistence import SQLiteContextV2Store
from unchain.skeleton import prepare_workflow, prepare_agent_graph, WorkflowNodeCompleted
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from unchain.skills import SkillRegistry
from unchain.tools import Toolkit, Tool
from unchain.agent.modules.skills import SkillsModule
from skills_inventory import build_skills_config


def _api():
    return importlib.import_module("skeleton_production_bindings").SkeletonProductionBindings


def _select(store, document):
    saved = store.save_draft(document)
    return prepare_skeleton_chat_selection({"skeleton_selection": {
        "schema": "pupu.skeleton_chat_selection.v1", "kind": "resource", "resource_id": saved["id"]}}, store=store)


def _host(tmp_path, document=None, options=None):
    store = SkeletonResourceStore(tmp_path / "resources")
    selected = _select(store, document or agent("root"))
    frozen = freeze_skeleton_workflow_dependencies(selected, store=store)
    host = _api()(selected, frozen, options or {}, session_id="binding-session",
                  workspace_root=str(tmp_path), resource_store=store)
    return host, store, selected


def _pool(document, toolkit_id="CoreToolkit", *, enabled=None, legacy=False):
    values = {"toolkits": [{"id": toolkit_id, "enabled_tools": enabled}], "merge_with_user_selected": False}
    document["nodes"].append({"id": "tools", "type": "toolkit_pool", "config": {
        "legacy_fields": values} if legacy else values})
    document["edges"].append({"id": "attach-tools", "kind": "attach", "source_node_id": "kernel",
        "source_port_id": "attach_bot", "target_node_id": "tools", "target_port_id": "attach_top"})
    return document


def _context(document_id="root", node_id="kernel"):
    return SimpleNamespace(document_id=document_id, node_id=node_id)


@pytest.fixture(autouse=True)
def _offline_sdk_clients(monkeypatch):
    import openai
    import anthropic
    from google import genai
    monkeypatch.setattr(openai, "OpenAI", lambda **kwargs: SimpleNamespace(options=kwargs))
    monkeypatch.setattr(anthropic, "Anthropic", lambda **kwargs: SimpleNamespace(options=kwargs))
    monkeypatch.setattr(genai, "Client", lambda **kwargs: SimpleNamespace(options=kwargs))


@pytest.mark.parametrize("provider,protocol,endpoint,option,key", [
    ("openai", "openai-responses", "https://api.openai.com/v1", "openaiApiKey", "openai-secret"),
    ("anthropic", "anthropic", "https://api.anthropic.com", "anthropicApiKey", "anthropic-secret"),
    ("gemini", "gemini", "https://generativelanguage.googleapis.com", "geminiApiKey", "gemini-secret"),
])
def test_native_official_binding_uses_only_its_dedicated_provider_key(tmp_path, provider, protocol, endpoint, option, key):
    document = agent("root")
    config = document["nodes"][1]["config"]["kernel"]
    config["profile"].update(provider=provider, protocol=protocol, endpoint=endpoint)
    host, _store, _selected = _host(tmp_path, document, {
        "api_key": "generic-secret", "openaiApiKey": "other-openai", "anthropicApiKey": "other-anthropic",
        "geminiApiKey": "other-gemini", option: key})
    bound = host.bind_profile(config)
    assert bound.model_io.api_key == key
    assert key not in repr(bound)
    assert bound.payload_copy()["max_tokens" if provider == "anthropic" else "max_output_tokens"] == config["output_tokens"]
    assert host.bind_profile(config).model_io is not bound.model_io


@pytest.mark.parametrize("mutation", ["provider", "endpoint", "unknown_field"])
def test_explicit_credential_binding_rejects_wrong_target_or_extra_fields(tmp_path, mutation):
    document = agent("root")
    profile = document["nodes"][1]["config"]["kernel"]["profile"]
    credential = {"provider": profile["provider"], "endpoint": profile["endpoint"], "api_key": "custom-secret"}
    credential[mutation] = "wrong-target" if mutation != "unknown_field" else True
    with pytest.raises(SkeletonResourceError):
        host, _store, _selected = _host(tmp_path, document, {"skeleton_credentials": {profile["credential_ref"]: credential}})
        host.bind_profile(document["nodes"][1]["config"]["kernel"])


def test_custom_endpoint_never_receives_generic_or_native_fallback_key(tmp_path, monkeypatch):
    monkeypatch.setenv("UNCHAIN_API_KEY", "generic-env-secret")
    monkeypatch.setenv("OPENAI_API_KEY", "official-env-secret")
    document = agent("root")
    with pytest.raises(SkeletonResourceError):
        host, _store, _selected = _host(tmp_path, document, {"api_key": "generic-option", "openaiApiKey": "official-option"})
        host.bind_profile(document["nodes"][1]["config"]["kernel"])


def test_explicit_endpoint_credential_is_bound_to_pinned_sdk_without_serialization(tmp_path):
    document = agent("root")
    config = document["nodes"][1]["config"]["kernel"]
    host, _store, selected = _host(tmp_path, document, {"skeleton_credentials": {"test.key": {
        "provider": "openai", "endpoint": "https://example.test/v1", "api_key": "explicit-secret"}}})
    bound = host.bind_profile(config)
    assert bound.model_io.api_key == "explicit-secret"
    assert "explicit-secret" not in repr(bound)
    assert "explicit-secret" not in repr(selected.to_dict())


def test_conflicting_profile_identity_in_fixed_child_is_rejected(tmp_path):
    child = agent("child")
    child["nodes"][1]["config"]["kernel"]["profile"]["endpoint"] = "https://other.example/v1"
    parent = agent("root", child_source={"kind": "embedded", "document": child})
    with pytest.raises(SkeletonResourceError):
        _host(tmp_path, parent)


@pytest.mark.parametrize("legacy", [False, True])
def test_real_toolkit_pool_resolves_filtered_actual_tools(tmp_path, legacy):
    host, _store, _selection = _host(tmp_path, _pool(agent("root"), enabled=["read"], legacy=legacy))
    tools = host.tools_for_node(_context())
    assert [tool.name for tool in tools] == ["read"]
    assert all(isinstance(tool, Tool) for tool in tools)
    with pytest.raises(SkeletonResourceError):
        host.tools_for_node(_context(document_id="unknown"))


def test_same_kernel_node_id_in_child_uses_its_own_pool(tmp_path):
    child = _pool(agent("child"), enabled=["glob"])
    parent = _pool(agent("root", child_source={"kind": "embedded", "document": child}), enabled=["read"])
    host, _store, _selection = _host(tmp_path, parent)
    assert [tool.name for tool in host.tools_for_node(_context("root"))] == ["read"]
    assert [tool.name for tool in host.tools_for_node(_context("child"))] == ["glob"]


def test_modules_preserve_pool_metadata_and_apply_each_attachment_skill_policy(tmp_path, monkeypatch):
    from unchain.tools.models import SkillDescriptor
    toolkit = Toolkit(prompt_sections=("Pool safety instructions",), skills=(
        SkillDescriptor("pool-skill", "pool skill", "Exact embedded instructions", (), None),))
    adapter._set_runtime_toolkit_metadata(toolkit, toolkit_id="core", toolkit_name="Core")
    monkeypatch.setattr(adapter, "_build_selected_toolkits", lambda *args, **kwargs: [toolkit])
    host, _store, _selection = _host(tmp_path, _pool(agent("root")))
    allowed = host.modules_for_node(_context(), allowed_tools=["skill"], disabled_tools=[])
    assert any(isinstance(module, SkillsModule) for module in allowed)
    metadata = []
    builder = SimpleNamespace(add_tool=metadata.append)
    for module in allowed:
        if not isinstance(module, SkillsModule):
            module.configure(builder)
    assert metadata[0].prompt_sections == ("Pool safety instructions",)
    assert metadata[0].skills[0].name == "pool-skill"
    blocked = host.modules_for_node(_context(), allowed_tools=[], disabled_tools=[])
    assert not any(isinstance(module, SkillsModule) for module in blocked)
    metadata.clear()
    for module in blocked:
        module.configure(builder)
    assert metadata[0].prompt_sections == ("Pool safety instructions",)
    assert metadata[0].skills == ()
    assert not any(isinstance(module, SkillsModule) for module in
                   host.modules_for_node(_context(), allowed_tools=None, disabled_tools=["skill"]))


@pytest.mark.parametrize("bad", ["missing-toolkit", "missing-tool", "duplicate-toolkit"])
def test_pool_never_silently_skips_missing_or_duplicate_identity(tmp_path, bad):
    document = _pool(agent("root"), "does-not-exist" if bad == "missing-toolkit" else "CoreToolkit",
                     enabled=["does-not-exist"] if bad == "missing-tool" else None)
    if bad == "duplicate-toolkit":
        document["nodes"][-1]["config"]["toolkits"].append(deepcopy(document["nodes"][-1]["config"]["toolkits"][0]))
    with pytest.raises(SkeletonResourceError):
        _host(tmp_path, document)


def _execution(tmp_path, plan, suffix="root"):
    journal = SQLiteContextV2Store(database_path=tmp_path / (suffix + ".sqlite3"),
        object_directory=tmp_path / (suffix + "-objects")).bind_execution("execution")
    return WorkflowExecutionStore(journal, plan, graph_id=suffix,
        attempt=AttemptRef(GenerationRef("execution", "generation"), "attempt"))


def test_real_code_handler_snapshots_workspace_source_and_runs_saved_python(tmp_path):
    (tmp_path / "main.py").write_text('def main(inputs,context):\n    return {"value": inputs["value"] + "-python"}\n')
    host, _store, _selected = _host(tmp_path)
    plan = prepare_workflow(code_workflow("local-code"))
    execution = _execution(tmp_path, plan)
    runner = DurableWorkflowRunner(execution, host.handlers_for_store(execution, plan))
    runner.create({"value": "input"})
    (tmp_path / "main.py").write_text('def main(inputs,context):\n    raise RuntimeError("edited source must not run")\n')
    result = runner.run()
    assert result.status == "completed" and result.outputs == {"value": "input-python"}


def test_real_skill_registry_and_deterministic_handler_read_exact_workspace_skill(tmp_path):
    skill_dir = tmp_path / ".agents" / "skills" / "acceptance"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text('---\nname: acceptance\ndescription: test skill\n---\nExact workspace instructions\n')
    registry = SkillRegistry(build_skills_config(workspace_root=str(tmp_path), include_user_dirs=False))
    loaded = registry.get("acceptance")
    identity = {"source": loaded.summary.identity.source, "source_id": loaded.summary.identity.source_id, "name": loaded.summary.name}
    host, _store, _selected = _host(tmp_path, options={"skills": {"include_user_dirs": False}})
    document = workflow("local-skill")
    document["nodes"][1]["type"] = "skill_read"
    document["nodes"][1]["config"] = {"execution": {"inputs": [],
        "outputs": [output("value", "result", ["content"])]}, "skill": identity}
    plan = prepare_workflow(document)
    execution = _execution(tmp_path, plan)
    runner = DurableWorkflowRunner(execution, host.handlers_for_store(execution, plan))
    runner.create({"value": "unused"})
    result = runner.run()
    assert result.status == "completed"
    assert result.outputs == {"value": loaded.body}


def test_real_deterministic_tool_uses_selected_toolkit_and_known_failure_contract(tmp_path):
    (tmp_path / "example.txt").write_text("exact local file")
    host, _store, _selected = _host(tmp_path, options={"toolkits": ["CoreToolkit"]})
    document = workflow("local-tool")
    document["nodes"][1]["type"] = "tool_call"
    document["nodes"][1]["config"] = {"execution": {"inputs": [{"name": "path", "value": {
        "kind": "literal", "value": str(tmp_path / "example.txt")}, "missing": "error"}],
        "outputs": [output("value", "result", ["ok"])]},
        "tool": {"name": "read", "on_error": "stop", "approval_timeout_ms": 1000}}
    plan = prepare_workflow(document)
    execution = _execution(tmp_path, plan)
    runner = DurableWorkflowRunner(execution, host.child_handlers_factory(execution, plan))
    runner.create({"value": "unused"})
    result = runner.run()
    assert result.status == "completed" and result.outputs == {"value": True}


def test_call_prepares_real_handlers_for_reachable_child_node_kinds(tmp_path):
    (tmp_path / "main.py").write_text('def main(inputs,context):\n    return {"value": inputs["value"] + "-nested"}\n')
    store = SkeletonResourceStore(tmp_path / "resources")
    saved = store.save_draft(code_workflow("published-code"))
    version = store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    ref = (version["workflow_id"], version["revision_id"])
    root = agent("root")
    root["nodes"].insert(1, {"id": "invoke", "type": "workflow_call", "config": {
        "workflow": {"workflow_id": ref[0], "revision_id": ref[1]}, "execution": {
            "inputs": [{"name": "value", "value": {"kind": "literal", "value": "fixed"}, "missing": "error"}],
            "outputs": [output("value", "result", ["value"])]}}})
    root["edges"][0]["target_node_id"] = "invoke"
    root["edges"].append({"id": "call-kernel", "kind": "flow", "source_node_id": "invoke",
        "source_port_id": "out", "target_node_id": "kernel", "target_port_id": "in"})
    selected = _select(store, root)
    frozen = freeze_skeleton_workflow_dependencies(selected, store=store)
    host = _api()(selected, frozen, {}, session_id="session", workspace_root=str(tmp_path), resource_store=store)
    plan = prepare_workflow(workflow("caller", call=ref))
    execution = _execution(tmp_path, plan)
    handlers = host.handlers_for_store(store=execution, plan=plan)
    assert handlers["workflow_call"].store is execution
    runner = DurableWorkflowRunner(execution, handlers)
    runner.create({"value": "input"})
    result = runner.run()
    assert result.status == "completed" and result.outputs == {"value": "input-nested"}


def test_cleanup_disconnects_each_factory_handle_once_and_closes_callbacks(tmp_path, monkeypatch):
    calls = []
    toolkit = Toolkit()
    toolkit.disconnect = lambda: calls.append("disconnect")
    adapter._set_runtime_toolkit_metadata(toolkit, toolkit_id="core", toolkit_name="Core")
    monkeypatch.setattr(adapter, "_build_selected_toolkits", lambda *args, **kwargs: [toolkit])
    host, _store, _selected = _host(tmp_path, _pool(agent("root")), {"toolkits": ["CoreToolkit"]})
    host.close()
    host.close()
    assert calls == ["disconnect"]
    with pytest.raises(SkeletonResourceError):
        host.tools_for_node(_context())


def test_no_pool_does_not_grant_selected_tools_to_kernel(tmp_path):
    host, _store, _selected = _host(tmp_path, options={"toolkits": ["CoreToolkit"]})
    assert host.tools_for_node(_context()) == ()


@pytest.mark.parametrize("allowed,disabled", [(["glob"], []), (None, ["read"])])
def test_each_child_attachment_rejects_excluded_deterministic_tool(tmp_path, allowed, disabled):
    host, _store, _selected = _host(tmp_path, options={"toolkits": ["CoreToolkit"]})
    document = workflow("local-tool")
    document["nodes"][1]["type"] = "tool_call"
    document["nodes"][1]["config"] = {"execution": {"inputs": [], "outputs": []},
        "tool": {"name": "read", "on_error": "stop", "approval_timeout_ms": 1000}}
    plan = prepare_workflow(document)
    store = _execution(tmp_path, plan)
    admitted = host.child_handlers_factory(store, plan, allowed_tools=["read"], disabled_tools=[])
    assert admitted["tool_call"].for_plan(plan).toolkit.tools.keys() == {"read"}
    with pytest.raises(SkeletonResourceError) as caught:
        host.child_handlers_factory(store, plan, allowed_tools=allowed, disabled_tools=disabled)
    assert caught.value.code == "tool_forbidden"


@pytest.mark.parametrize("allowed,disabled", [([], []), (None, ["skill"])])
def test_each_child_attachment_applies_skill_tool_policy_to_explicit_skill_read(tmp_path, allowed, disabled):
    host, _store, _selected = _host(tmp_path)
    document = workflow("local-skill")
    document["nodes"][1]["type"] = "skill_read"
    document["nodes"][1]["config"] = {"execution": {"inputs": [], "outputs": []},
        "skill": {"source": "skillpack", "source_id": "pack", "name": "review"}}
    plan = prepare_workflow(document)
    with pytest.raises(SkeletonResourceError) as caught:
        host.child_handlers_factory(_execution(tmp_path, plan), plan,
                                    allowed_tools=allowed, disabled_tools=disabled)
    assert caught.value.code == "tool_forbidden"


def test_child_policy_admits_attached_hook_and_its_nested_tool_before_model(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    leaf = workflow("hook-tool")
    leaf["nodes"][1]["type"] = "tool_call"
    leaf["nodes"][1]["config"] = {"execution": {"inputs": [], "outputs": [output("value", "result", ["ok"])]},
        "tool": {"name": "read", "on_error": "stop", "approval_timeout_ms": 1000}}
    saved = store.save_draft(leaf)
    version = store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    middle = store.save_draft(workflow("hook-parent", call=(version["workflow_id"], version["revision_id"])))
    hook = store.publish_workflow(middle["id"], expected_edit_token=middle["edit_token"])
    root = agent("root")
    root["nodes"].append({"id": "hooks", "type": "hooks_pool", "config": {"hooks": [{
        "id": "before", "order": 1, "event": "before_tool_call", "tool_name": None,
        "force_approval": False, "workflow": {"workflow_id": hook["workflow_id"], "revision_id": hook["revision_id"]}}]}})
    root["edges"].append({"id": "attach-hooks", "kind": "attach", "source_node_id": "kernel",
        "source_port_id": "attach_bot", "target_node_id": "hooks", "target_port_id": "attach_top"})
    selected = _select(store, root)
    host = _api()(selected, freeze_skeleton_workflow_dependencies(selected, store=store),
                  {"toolkits": ["CoreToolkit"]}, session_id="session", workspace_root=str(tmp_path), resource_store=store)
    plan = prepare_agent_graph(root)
    with pytest.raises(SkeletonResourceError) as caught:
        host.child_handlers_factory(_execution(tmp_path, plan), plan, allowed_tools=["skill"], disabled_tools=[])
    assert caught.value.code == "tool_forbidden"


def test_official_profiles_reject_other_provider_and_generic_environment_keys(tmp_path, monkeypatch):
    for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "unrelated-anthropic")
    monkeypatch.setenv("UNCHAIN_API_KEY", "generic-env")
    document = agent("root")
    config = document["nodes"][1]["config"]["kernel"]
    config["profile"]["endpoint"] = "https://api.openai.com/v1"
    host, _store, _selected = _host(tmp_path, document, {"apiKey": "generic", "anthropicApiKey": "wrong-provider"})
    with pytest.raises(SkeletonResourceError):
        host.bind_profile(config)


def test_official_sdk_address_retries_and_output_limit_are_pinned(tmp_path):
    document = agent("root")
    config = document["nodes"][1]["config"]["kernel"]
    config["profile"]["endpoint"] = "https://api.openai.com/v1"
    host, _store, _selected = _host(tmp_path, document, {"openaiApiKey": "dedicated"})
    bound = host.bind_profile(config)
    client = bound.model_io._client_factory(api_key=bound.model_io.api_key)
    assert client.options == {"api_key": "dedicated", "base_url": "https://api.openai.com/v1", "max_retries": 0}
    assert bound.payload_copy()["max_output_tokens"] == config["output_tokens"]


def test_unused_node_kinds_do_not_create_local_source_or_skill_hosts(tmp_path, monkeypatch):
    module = importlib.import_module("skeleton_production_bindings")
    host, _store, _selected = _host(tmp_path)
    monkeypatch.setattr(module, "FileCodeSourceResolver", lambda *_: pytest.fail("unused Code initialized"))
    monkeypatch.setattr(module, "SkillRegistry", lambda *_args, **_kwargs: pytest.fail("unused Skill initialized"))
    plan = prepare_agent_graph(agent("root"))
    assert host.handlers_for_store(_execution(tmp_path, plan), plan) == {}


def test_real_core_factory_retains_every_authorized_workspace_root(tmp_path):
    first = tmp_path / "first"
    second = tmp_path / "second"
    first.mkdir(); second.mkdir()
    (second / "allowed.txt").write_text("authorized second workspace")
    store = SkeletonResourceStore(tmp_path / "resources")
    selected = _select(store, _pool(agent("root"), enabled=["read"]))
    host = _api()(selected, freeze_skeleton_workflow_dependencies(selected, store=store), {},
        session_id="session", workspace_root=str(first), workspace_roots=[str(first), str(second)], resource_store=store)
    document = workflow("read-secondary")
    document["nodes"][1]["type"] = "tool_call"
    document["nodes"][1]["config"] = {"execution": {"inputs": [{"name": "path", "value": {
        "kind": "literal", "value": str(second / "allowed.txt")}, "missing": "error"}],
        "outputs": [output("value", "result", ["ok"])]},
        "tool": {"name": "read", "on_error": "stop", "approval_timeout_ms": 1000}}
    plan = prepare_workflow(document)
    execution = _execution(tmp_path, plan)
    runner = DurableWorkflowRunner(execution, host.handlers_for_store(execution, plan))
    runner.create({"value": "unused"})
    result = runner.run()
    assert result.status == "completed" and result.outputs == {"value": True}
    assert host.workspace_roots == (str(first), str(second))


def test_no_authorized_workspace_rejects_real_filesystem_toolkit_without_cwd_fallback(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    selected = _select(store, agent("root"))
    with pytest.raises(SkeletonResourceError) as caught:
        _api()(selected, freeze_skeleton_workflow_dependencies(selected, store=store),
            {"toolkits": ["CoreToolkit"], "workspaceRoot": str(tmp_path)},
            session_id="session", workspace_root=None, workspace_roots=[], resource_store=store)
    assert caught.value.code == "workspace_unavailable"
