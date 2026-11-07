"""Offline acceptance through the persisted public Skeleton chat entry."""
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace

import pytest

import unchain_adapter as adapter
from skeleton_resource_store import SkeletonResourceError
from test_skeleton_production_chat import production
from test_skeleton_resource_store import agent, binding, output, workflow


def _code_node(node_id, source, inputs, outputs):
    return {"id": node_id, "type": "code", "config": {
        "execution": {"inputs": inputs, "outputs": outputs},
        "code": {"source": {"kind": "file", "path": source},
                 "environment_profile_id": "builtin", "timeout_ms": 5000,
                 "max_result_bytes": 1048576, "max_log_bytes": 65536,
                 "result_schema": {"type": "object"}},
    }}


def _insert_between(document, node, previous, following):
    document["nodes"].insert(next(i for i, item in enumerate(document["nodes"])
                                  if item["id"] == following), node)
    edge = next(item for item in document["edges"]
                if item["source_node_id"] == previous and item["target_node_id"] == following)
    edge["target_node_id"] = node["id"]
    document["edges"].append({"id": f"{node['id']}-{following}", "kind": "flow",
        "source_node_id": node["id"], "source_port_id": "out",
        "target_node_id": following, "target_port_id": "in"})


def test_public_persisted_agent_runs_code_in_real_subprocess(production):
    store, options, _calls = production
    resource = store.get_resource("production-agent")
    document = agent("production-agent")
    (Path(options["workspace_root"]) / "main.py").write_text(
        'def main(inputs, context):\n'
        '    return {"message": inputs["message"] + " | code subprocess"}\n')
    code = _code_node("code", "main.py", [binding("message", "kernel", ["message"])],
                      [output("message", "result", ["message"])])
    _insert_between(document, code, "kernel", "end")
    end = next(node for node in document["nodes"] if node["id"] == "end")
    end["config"]["execution"]["inputs"][0] = binding("message", "code", ["message"])
    store.save_draft(document, expected_edit_token=resource["edit_token"])

    events = list(adapter.stream_chat_events(message="persisted input", history=[], options=options,
        session_id="public-code-session", attempt_id="public-code-root"))
    final = [event for event in events if event.get("type") == "final_message" and event.get("scope") == "root"]
    assert len(final) == 1 and final[0]["content"] == "End production reply | code subprocess"
    from skeleton_production_state import load_launch
    launch = load_launch("public-code-session", "public-code-root", expected_owner_chat_id="production-chat")
    assert launch.store.load().state["status"] == "completed"
    assert launch.store.load().state["root_committed"] is True


class _AnthropicStream:
    def __enter__(self):
        return self
    def __exit__(self, *_args):
        return False
    def __iter__(self):
        yield SimpleNamespace(type="message_start", message={"usage": {"input_tokens": 9}})
        yield SimpleNamespace(type="content_block_start", index=0,
            content_block={"type": "text", "text": "Anthropic isolated output"})
        yield SimpleNamespace(type="content_block_stop", index=0)
        yield SimpleNamespace(type="message_delta", usage={"output_tokens": 4})


@pytest.mark.parametrize("provider,expected_endpoint", [
    ("openai", "https://example.test/v1"),
    ("anthropic", "https://api.anthropic.com"),
])
def test_public_provider_binding_keeps_sdk_wire_and_outputs_separate(
        production, monkeypatch, provider, expected_endpoint):
    store, options, calls = production
    resource = store.get_resource("production-agent")
    document = agent("production-agent")
    profile = document["nodes"][1]["config"]["kernel"]["profile"]
    profile["provider"] = provider
    profile["protocol"] = "openai-responses" if provider == "openai" else "anthropic"
    profile["endpoint"] = expected_endpoint
    options["skeleton_credentials"] = {"test.key": {
        "provider": provider, "endpoint": expected_endpoint,
        "api_key": f"{provider}-production-secret"}}
    store.save_draft(document, expected_edit_token=resource["edit_token"])

    if provider == "openai":
        import openai
        from test_skeleton_agent_runtime import _OpenAIStream
        def openai_factory(**kwargs):
            def create(**wire):
                calls.append({"sdk": "openai", "client": deepcopy(kwargs), "wire": deepcopy(wire)})
                return _OpenAIStream(SimpleNamespace(id="openai-id", output=[{"type": "message",
                    "role": "assistant", "content": [{"type": "output_text",
                    "text": "OpenAI isolated output"}]}], usage={"input_tokens": 2,
                    "output_tokens": 1, "total_tokens": 3}))
            return SimpleNamespace(responses=SimpleNamespace(create=create))
        monkeypatch.setattr(openai, "OpenAI", openai_factory)
    else:
        import anthropic
        def anthropic_factory(**kwargs):
            calls.append({"sdk": "anthropic", "client": deepcopy(kwargs)})
            return SimpleNamespace(messages=SimpleNamespace(stream=lambda **wire: (
                calls.append({"sdk": "anthropic-wire", "wire": deepcopy(wire)}) or _AnthropicStream())))
        monkeypatch.setattr(anthropic, "Anthropic", anthropic_factory)

    events = list(adapter.stream_chat_events(message=f"input for {provider}", history=[], options=options,
        session_id=f"public-{provider}-session", attempt_id=f"public-{provider}-root"))
    roots = [event for event in events if event.get("type") == "final_message" and event.get("scope") == "root"]
    assert len(roots) == 1
    expected_text = "OpenAI isolated output" if provider == "openai" else "Anthropic isolated output"
    assert roots[0]["content"] == expected_text
    sdk_calls = [call for call in calls if call.get("sdk") == provider]
    assert len(sdk_calls) == 1
    assert sdk_calls[0]["client"]["api_key"] == f"{provider}-production-secret"
    if provider == "openai":
        assert sdk_calls[0]["client"]["base_url"] == expected_endpoint
        assert "Anthropic isolated output" not in str(sdk_calls[0])
    else:
        wire = next(call["wire"] for call in calls if call.get("sdk") == "anthropic-wire")
        assert wire["model"] == profile["model"]
        assert "OpenAI isolated output" not in str(wire)


def test_one_public_agent_mixes_native_providers_without_credential_or_budget_leaks(production, monkeypatch):
    store, options, calls = production
    resource = store.get_resource("production-agent")
    document = agent("production-agent")
    second = deepcopy(document["nodes"][1])
    second["id"] = "anthropic-kernel"
    second["config"]["execution"]["inputs"] = [binding("message", "kernel", ["message"])]
    kernel = second["config"]["kernel"]
    kernel["profile"].update(id="anthropic-profile", provider="anthropic", protocol="anthropic",
        endpoint="https://api.anthropic.com", credential_ref="anthropic.key", context_window=4096)
    kernel["output_tokens"] = 256
    _insert_between(document, second, "kernel", "end")
    document["nodes"][-1]["config"]["execution"]["inputs"][0] = binding("message", second["id"], ["message"])
    options["skeleton_credentials"]["anthropic.key"] = {
        "provider": "anthropic", "endpoint": "https://api.anthropic.com", "api_key": "anthropic-separate-secret"}
    store.save_draft(document, expected_edit_token=resource["edit_token"])
    import anthropic
    def anthropic_factory(**kwargs):
        def stream(**wire):
            calls.append({"sdk": "anthropic", "client": deepcopy(kwargs), "wire": deepcopy(wire)})
            return _AnthropicStream()
        return SimpleNamespace(messages=SimpleNamespace(stream=stream))
    monkeypatch.setattr(anthropic, "Anthropic", anthropic_factory)
    events = list(adapter.stream_chat_events(message="mix providers in one Agent", history=[], options=options,
        session_id="mixed-public-session", attempt_id="mixed-public-root"))
    assert len(calls) == 2
    first, second_call = calls
    assert first["client"]["api_key"] == "production-test-secret"
    assert first["client"]["base_url"] == "https://example.test/v1"
    assert first["wire"]["max_output_tokens"] == 512
    assert "max_tokens" not in first["wire"]
    assert second_call["client"]["api_key"] == "anthropic-separate-secret"
    assert second_call["client"]["base_url"] == "https://api.anthropic.com"
    assert second_call["wire"]["max_tokens"] == 256
    assert "input" not in second_call["wire"] and "max_output_tokens" not in second_call["wire"]
    assert "End production reply" in str(second_call["wire"]["messages"])
    assert "anthropic-separate-secret" not in str(first)
    assert "production-test-secret" not in str(second_call)
    final = [e for e in events if e.get("type") == "final_message" and e.get("scope") == "root"]
    assert len(final) == 1 and final[0]["content"] == "Anthropic isolated output"


def test_public_selection_rejects_unavailable_resource_without_fallback(production):
    from durable_interaction_host import DurableInteractionHostError
    _store, options, _calls = production
    options["skeleton_selection"] = {"schema": "pupu.skeleton_chat_selection.v1",
        "kind": "resource", "resource_id": "missing-production-resource"}
    with pytest.raises(DurableInteractionHostError) as captured:
        list(adapter.stream_chat_events(message="must fail", history=[], options=options,
            session_id="missing-resource-session", attempt_id="missing-resource-root"))
    assert captured.value.code == "resource_missing"


def test_public_kernel_cannot_dispatch_tool_absent_from_attached_capabilities(production, monkeypatch):
    import json
    from durable_interaction_host import DurableInteractionHostError
    from test_skeleton_agent_runtime import _OpenAIStream
    import openai

    _store, options, calls = production
    def client_factory(**kwargs):
        def create(**wire):
            calls.append({"client": deepcopy(kwargs), "wire": deepcopy(wire)})
            return _OpenAIStream(SimpleNamespace(id="forbidden-tool", output=[{
                "type": "function_call", "call_id": "forbidden-call",
                "name": "not_attached_tool", "arguments": json.dumps({"value": "must not run"}),
            }], usage={"input_tokens": 1, "output_tokens": 1, "total_tokens": 2}))
        return SimpleNamespace(responses=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, "OpenAI", client_factory)

    with pytest.raises(DurableInteractionHostError):
        list(adapter.stream_chat_events(message="attempt unavailable capability", history=[], options=options,
            session_id="forbidden-capability-session", attempt_id="forbidden-capability-root"))
    assert len(calls) == 1


def test_public_agent_executes_published_workflow_skill_and_tool_binding(production, tmp_path):
    from test_skeleton_production_bindings import _pool
    from unchain.skills import SkillRegistry
    from skills_inventory import build_skills_config

    store, options, calls = production
    skill_dir = tmp_path / ".agents" / "skills" / "public-acceptance"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: public-acceptance\ndescription: public test\n---\n"
        "Published workflow read this exact skill.\n")
    registry = SkillRegistry(build_skills_config(workspace_root=str(tmp_path), include_user_dirs=False))
    skill = registry.get("public-acceptance")
    identity = {"source": skill.summary.identity.source,
                "source_id": skill.summary.identity.source_id, "name": skill.summary.name}
    read_path = tmp_path / "tool-input.txt"
    read_path.write_text("tool capability ran")

    child = {"schema_version": 1, "kind": "workflow", "id": "public-child",
        "name": "Public child", "nodes": [
            {"id": "start", "type": "start", "config": {"execution": {
                "outputs": [output("value", "result", ["value"])]}}},
            {"id": "skill", "type": "skill_read", "config": {
                "skill": identity, "execution": {"inputs": [],
                    "outputs": [output("content", "result", ["content"])]}}},
            {"id": "tool", "type": "tool_call", "config": {
                "tool": {"name": "read", "on_error": "stop", "approval_timeout_ms": 1000},
                "execution": {"inputs": [{"name": "path", "value": {
                    "kind": "literal", "value": str(read_path)}, "missing": "error"}],
                    "outputs": [output("ok", "result", ["ok"])]}}},
            {"id": "end", "type": "end", "config": {"execution": {
                "inputs": [binding("content", "skill", ["content"]),
                           binding("ok", "tool", ["ok"])],
                "outputs": [output("content", "input", ["content"]),
                            output("ok", "input", ["ok"]) ]}}},
        ], "edges": [
            {"id": "a", "kind": "flow", "source_node_id": "start", "source_port_id": "out",
             "target_node_id": "skill", "target_port_id": "in"},
            {"id": "b", "kind": "flow", "source_node_id": "skill", "source_port_id": "out",
             "target_node_id": "tool", "target_port_id": "in"},
            {"id": "c", "kind": "flow", "source_node_id": "tool", "source_port_id": "out",
             "target_node_id": "end", "target_port_id": "in"},
        ]}
    saved = store.save_draft(child)
    version = store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])
    resource = store.get_resource("production-agent")
    document = _pool(agent("production-agent"))
    call = {"id": "published-call", "type": "workflow_call", "config": {
        "workflow": {"workflow_id": version["workflow_id"], "revision_id": version["revision_id"]},
        "execution": {"inputs": [binding("value", "start", ["message"])],
            "outputs": [output("content", "result", ["content"]),
                        output("ok", "result", ["ok"]) ]}}}
    document["nodes"].insert(1, call)
    document["edges"][0]["target_node_id"] = "published-call"
    document["edges"].append({"id": "published-call-kernel", "kind": "flow",
        "source_node_id": "published-call", "source_port_id": "out",
        "target_node_id": "kernel", "target_port_id": "in"})
    kernel = next(node for node in document["nodes"] if node["id"] == "kernel")
    kernel["config"]["execution"]["inputs"] = [binding("message", "published-call", ["content"])]
    store.save_draft(document, expected_edit_token=resource["edit_token"])
    options["skills"] = {"include_user_dirs": False}

    events = list(adapter.stream_chat_events(message="public child call", history=[], options=options,
        session_id="public-child-session", attempt_id="public-child-root"))
    final = [event for event in events if event.get("type") == "final_message" and event.get("scope") == "root"]
    assert len(final) == 1 and final[0]["content"] == "End production reply"
    assert "Published workflow read this exact skill." in str(calls[0]["wire"])
    from skeleton_production_state import load_launch
    launch = load_launch("public-child-session", "public-child-root", expected_owner_chat_id="production-chat")
    assert launch.store.load().state["status"] == "completed"


def test_public_kernel_executes_published_hook_workflow_before_real_tool(production, monkeypatch, tmp_path):
    import json
    import traceback
    from test_skeleton_agent_runtime import _OpenAIStream
    from test_skeleton_production_bindings import _pool
    from unchain.tools import Toolkit

    store, options, calls = production
    hook_code = tmp_path / "hook.py"
    hook_code.write_text(
        'def main(inputs, context):\n'
        '    return {"decision": "continue", "require_approval": False, "arguments": inputs["arguments"]}\n')
    hook = workflow("public-hook")
    hook["nodes"][1] = _code_node("code", "hook.py",
        [binding("arguments", "start", ["arguments"])],
        [output("decision", "result", ["decision"]),
         output("require_approval", "result", ["require_approval"]),
         output("arguments", "result", ["arguments"])])
    hook["nodes"][0]["config"]["execution"]["outputs"] = [output("arguments", "result", ["arguments"])]
    hook["nodes"][2]["config"]["execution"]["inputs"] = [
        binding("decision", "code", ["decision"]), binding("arguments", "code", ["arguments"])]
    hook["nodes"][2]["config"]["execution"]["inputs"].insert(1,
        binding("require_approval", "code", ["require_approval"]))
    hook["nodes"][2]["config"]["execution"]["outputs"] = [
        output("decision", "input", ["decision"]),
        output("require_approval", "input", ["require_approval"]),
        output("arguments", "input", ["arguments"])]
    saved = store.save_draft(hook)
    version = store.publish_workflow(saved["id"], expected_edit_token=saved["edit_token"])

    resource = store.get_resource("production-agent")
    from test_skeleton_agent_runtime import _document_with_hook_pool
    document = _pool(_document_with_hook_pool(agent("production-agent"),
        workflow_id=version["workflow_id"], revision_id=version["revision_id"]))
    store.save_draft(document, expected_edit_token=resource["edit_token"])
    toolkit = Toolkit()
    effects = []
    @toolkit.tool(name="dangerous_tool", requires_confirmation=False)
    def dangerous_tool(value: str):
        effects.append(value)
        return {"result": value + "|executed"}
    adapter._set_runtime_toolkit_metadata(toolkit, toolkit_id="core", toolkit_name="Core")
    monkeypatch.setattr(adapter, "_build_selected_toolkits", lambda *args, **kwargs: [toolkit])

    responses = [
        SimpleNamespace(id="hook-tool", output=[{"type": "function_call",
            "call_id": "hook-call", "name": "dangerous_tool",
            "arguments": json.dumps({"value": "hooked"})}],
            usage={"input_tokens": 4, "output_tokens": 2, "total_tokens": 6}),
        SimpleNamespace(id="hook-done", output=[{"type": "message", "role": "assistant",
            "content": [{"type": "output_text", "text": "Hook End"}]}],
            usage={"input_tokens": 4, "output_tokens": 2, "total_tokens": 6}),
    ]
    import openai
    from skeleton_agent_runtime import PupuSkeletonAgentExecution
    from unchain.skeleton.kernel_runtime import SkeletonKernelHandler
    from unchain.skeleton.hooks_runtime import SkeletonBeforeToolHookDispatcher
    hook_errors = []
    dispatcher_calls = []
    dispatcher_results = []
    original_hook_runner = PupuSkeletonAgentExecution._run_hook_workflow
    def observe_hook_runner(self, **kwargs):
        try:
            return original_hook_runner(self, **kwargs)
        except BaseException as error:
            hook_errors.append(traceback.format_exc())
            raise
    monkeypatch.setattr(PupuSkeletonAgentExecution, "_run_hook_workflow", observe_hook_runner)
    original_dispatch = SkeletonBeforeToolHookDispatcher.__call__
    def observe_dispatch(self, **kwargs):
        dispatcher_calls.append(kwargs["tool_call"].name)
        dispatcher_results.append({"runner": callable(getattr(self, "_run_hook_workflow", None))})
        try:
            result = original_dispatch(self, **kwargs)
            dispatcher_results[-1]["result"] = repr(result)
            return result
        except BaseException:
            hook_errors.append(traceback.format_exc())
            raise
    monkeypatch.setattr(SkeletonBeforeToolHookDispatcher, "__call__", observe_dispatch)
    original_execute = SkeletonKernelHandler._execute
    kernel_errors = []
    def observe_kernel_execute(self, *args, **kwargs):
        try:
            return original_execute(self, *args, **kwargs)
        except BaseException as error:
            kernel_errors.append(traceback.format_exc())
            raise
    monkeypatch.setattr(SkeletonKernelHandler, "_execute", observe_kernel_execute)
    def client_factory(**kwargs):
        def create(**wire):
            calls.append({"client": deepcopy(kwargs), "wire": deepcopy(wire)})
            assert responses, "public Hook continuation should not replay the model call"
            return _OpenAIStream(responses.pop(0))
        return SimpleNamespace(responses=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, "OpenAI", client_factory)

    try:
        events = list(adapter.stream_chat_events(message="invoke Hook", history=[], options=options,
            session_id="public-hook-session", attempt_id="public-hook-root"))
    except Exception as error:
        if hook_errors:
            pytest.fail(f"public Hook execution failed: {error}; underlying Hook error: {hook_errors[-1]}")
        if kernel_errors:
            pytest.fail(f"public Kernel execution failed: {error}; dispatches={dispatcher_calls}; "
                        f"dispatcher={dispatcher_results}; "
                        f"underlying Kernel error: {kernel_errors[-1]}")
        raise
    final = [event for event in events if event.get("type") == "final_message" and event.get("scope") == "root"]
    assert len(final) == 1 and final[0]["content"] == "Hook End"
    assert effects == ["hooked"] and len(calls) == 2
    assert version["revision_id"] in str(store.get_workflow_version(version["workflow_id"], version["revision_id"]))
