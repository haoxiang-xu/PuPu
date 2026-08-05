from __future__ import annotations

import os
from contextlib import ExitStack
from types import SimpleNamespace
from unittest import mock

from unchain.tools.tool import Tool
from unchain.tools.toolkit import Toolkit

import unchain_adapter as ua
from memory_v2_unchain_runtime_context import (
    build_pupu_memory_v2_root_runtime_context,
)
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from unchain.memory import MEMORY_V2_MODULE_KEY
from vault_sink_runtime import (
    VaultGuardedSubagentModule,
    VaultSinkAgentModule,
    VaultSinkRuntimePlugin,
)


class _Client:
    pass


class _ToolsModule:
    def __init__(self, *, tools):
        self.tools = tuple(tools)


class _MemoryModule:
    def __init__(self, *, memory):
        self.memory = memory


class _PoliciesModule:
    def __init__(self, *, max_iterations):
        self.max_iterations = max_iterations


class _SubagentModule:
    def __init__(self, *, templates, policy):
        self.templates = templates
        self.policy = policy


class _SubagentPolicy:
    def __init__(self, **values):
        self.__dict__.update(values)


class _SubagentTemplate:
    pass


class _Agent:
    def __init__(self, **values):
        self.__dict__.update(values)


class _JobsModule:
    name = "jobs"


def _admission(*, active=True):
    return SimpleNamespace(
        is_active=active,
        mode="active" if active else "shadow",
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-a",
        source_attempt_id="",
        provider="ollama",
        model="test",
        real_context_window_tokens=100_000,
        runtime=object(),
    )


def _shell_toolkit():
    def shell(action: str, command: str = ""):
        return {"action": action, "command": command}

    toolkit = Toolkit()
    toolkit.register(
        Tool.from_callable(
            shell,
            name="shell",
            requires_confirmation=True,
            confirmation_resolver=lambda _args, _ctx: {
                "requires_confirmation": True
            },
        )
    )
    return toolkit


def _build_agent(*, toolkit, admission, vault_runtime=None, templates=()):
    with mock.patch.object(
        ua,
        "_memory_v2_admission_from_options",
        return_value=admission,
    ), mock.patch.object(
        ua,
        "_append_memory_v2_normal_toolkit",
        side_effect=lambda toolkits, *_args, **_kwargs: toolkits,
    ), mock.patch.object(
        ua,
        "_build_memory_v2_optimizer_module",
        return_value=None,
    ), mock.patch(
        "subagent_loader.load_templates",
        return_value=templates,
    ):
        return ua._build_developer_agent(
            UnchainAgent=_Agent,
            ToolsModule=_ToolsModule,
            MemoryModule=_MemoryModule,
            PoliciesModule=_PoliciesModule,
            SubagentModule=_SubagentModule,
            SubagentTemplate=_SubagentTemplate,
            SubagentPolicy=_SubagentPolicy,
            provider="ollama",
            model="test",
            api_key="",
            max_iterations=3,
            toolkits=[toolkit],
            memory_manager=object(),
            jobs_module=_JobsModule(),
            options={},
            vault_runtime=vault_runtime,
        )


def test_active_root_gets_independent_vault_surface_and_children_keep_baseline():
    baseline = _shell_toolkit()
    baseline_shell = baseline.get("shell")
    baseline_schema = baseline_shell.to_provider_json("openai")
    plugin = VaultSinkRuntimePlugin(
        client=_Client(),
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-a",
    )
    template = SimpleNamespace(
        name="Explore",
        description="Scout",
        allowed_modes=("delegate",),
    )
    captured = {}

    def load_templates(**kwargs):
        captured.update(kwargs)
        return (template,)

    with mock.patch.object(
        ua,
        "_memory_v2_admission_from_options",
        return_value=_admission(),
    ), mock.patch.object(
        ua,
        "_append_memory_v2_normal_toolkit",
        side_effect=lambda toolkits, *_args, **_kwargs: toolkits,
    ), mock.patch.object(
        ua,
        "_build_memory_v2_optimizer_module",
        return_value=None,
    ), mock.patch(
        "subagent_loader.load_templates",
        side_effect=load_templates,
    ):
        agent = ua._build_developer_agent(
            UnchainAgent=_Agent,
            ToolsModule=_ToolsModule,
            MemoryModule=_MemoryModule,
            PoliciesModule=_PoliciesModule,
            SubagentModule=_SubagentModule,
            SubagentTemplate=_SubagentTemplate,
            SubagentPolicy=_SubagentPolicy,
            provider="ollama",
            model="test",
            api_key="",
            max_iterations=3,
            toolkits=[baseline],
            memory_manager=object(),
            jobs_module=_JobsModule(),
            options={},
            vault_runtime=plugin,
        )

    root_toolkit = agent._memory_v2_effective_toolkits[0]
    root_shell = root_toolkit.get("shell")
    assert root_toolkit is not baseline
    assert root_shell is not baseline_shell
    assert root_shell.parameters is not baseline_shell.parameters
    assert captured["toolkits"] == (baseline,)
    assert baseline_shell.to_provider_json("openai") == baseline_schema
    assert "secret_env" not in {
        parameter.name for parameter in baseline_shell.parameters
    }
    assert "secret_env" in {parameter.name for parameter in root_shell.parameters}

    assert isinstance(agent.modules[0], _ToolsModule)
    assert isinstance(agent.modules[1], VaultSinkAgentModule)
    assert isinstance(agent.modules[2], _JobsModule)
    assert isinstance(agent.modules[3], _MemoryModule)
    assert isinstance(agent.modules[4], _PoliciesModule)
    assert isinstance(agent.modules[-1], VaultGuardedSubagentModule)
    assert agent.modules[-1].inner_module.templates == (template,)


def test_inactive_or_client_unavailable_is_structurally_identical():
    first_toolkit = _shell_toolkit()
    second_toolkit = _shell_toolkit()
    baseline = _build_agent(
        toolkit=first_toolkit,
        admission=_admission(active=False),
    )
    unavailable = _build_agent(
        toolkit=second_toolkit,
        admission=_admission(active=False),
        vault_runtime=None,
    )

    def snapshot(agent):
        tools_module = next(
            module for module in agent.modules if isinstance(module, _ToolsModule)
        )
        return {
            "instructions": agent.instructions,
            "modules": [type(module).__name__ for module in agent.modules],
            "schemas": [
                tool.to_provider_json("openai")
                for toolkit in tools_module.tools
                for tool in toolkit.tools.values()
            ],
        }

    assert snapshot(unavailable) == snapshot(baseline)
    assert unavailable.modules[0].tools[0] is second_toolkit
    assert "secret_env" not in {
        parameter.name for parameter in second_toolkit.get("shell").parameters
    }


def _create_agent_with_captured_build(*, admission, client):
    captured = {}
    is_active = bool(admission.is_active)
    runtime_context = (
        build_pupu_memory_v2_root_runtime_context(
            owner_chat_id=admission.owner_chat_id,
            execution_id="session-a",
            attempt_id="attempt-a",
            run_id="attempt-a",
        )
        if is_active
        else None
    )
    run = (
        PupuUnchainShadowRunDraft(
            session_id="session-a",
            identity=runtime_context.identity,
            grant=runtime_context.grant_for(MEMORY_V2_MODULE_KEY),
        )
        if is_active
        else None
    )
    active_bridge = SimpleNamespace(
        modules=(),
        preparation=SimpleNamespace(host_factory=object()),
    )
    active_preflight = object()

    def fake_build(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace()

    patches = (
        mock.patch.object(ua, "_UnchainAgent", object),
        mock.patch.object(ua, "parse_custom_provider", return_value=None),
        mock.patch.object(ua, "_load_recipe_from_options", return_value=None),
        mock.patch.object(
            ua,
            "get_runtime_config",
            return_value={"provider": "ollama", "model": "test"},
        ),
        mock.patch.object(ua, "_resolve_agent_api_key", return_value=""),
        mock.patch.object(
            ua,
            "_resolve_memory_runtime",
            return_value=(
                {"requested": False, "available": False, "reason": ""},
                None,
            ),
        ),
        mock.patch.object(ua, "_build_requested_toolkits", return_value=[]),
        mock.patch.object(ua, "get_durable_jobs_runtime", return_value=None),
        mock.patch.object(ua, "_extract_user_prompt_modules", return_value={}),
        mock.patch.object(
            ua, "get_max_context_window_tokens", return_value=100_000
        ),
        mock.patch.object(
            ua, "_resolve_memory_v2_admission", return_value=admission
        ),
        mock.patch.object(
            ua,
            "_inspect_memory_v2_rollout_intent",
            return_value={"target_mode": "active"},
        ),
        mock.patch.object(ua, "_memory_v2_bind_recalled_refs"),
        mock.patch.object(ua, "_import_memory_v2_history"),
        mock.patch.object(ua, "_bootstrap_memory_v2_current_request"),
        mock.patch.object(ua, "_prepare_memory_v2_first_message_recall"),
        mock.patch.object(
            ua,
            "_options_with_memory_v2_admission",
            return_value={"_bound": admission},
        ),
        mock.patch.object(ua, "_build_developer_agent", side_effect=fake_build),
        mock.patch(
            "memory_v2_store_boundary.configured_context_v2_store_owner",
            return_value="unchain",
        ),
        mock.patch(
            "memory_v2_unchain_atomic_bootstrap.pupu_unchain_sticky_active_required",
            return_value=False,
        ),
        mock.patch(
            "memory_v2_unchain_active_bridge.preflight_pupu_unchain_active_host",
            return_value=active_preflight,
        ),
        mock.patch(
            "memory_v2_unchain_active_bridge.bind_pupu_unchain_active_bridge",
            return_value=active_bridge,
        ),
        mock.patch(
            "memory_v2_unchain_lazy_bootstrap.bootstrap_pupu_unchain_active_chat",
            return_value={
                "status": "completed",
                "admission": {"admission_id": "admission-a"},
            },
        ),
        mock.patch.object(ua, "_memory_v2_apply_chat_admission_record"),
        mock.patch.object(
            ua,
            "get_pending_interaction",
            return_value={"status": "none", "session_id": "session-a"},
        ),
    )
    with ExitStack() as stack:
        for patcher in patches:
            stack.enter_context(patcher)
        get_client = stack.enter_context(
            mock.patch(
                "vault_sink_client.get_process_vault_sink_client",
                return_value=client,
            )
        )
        stack.enter_context(
            mock.patch.dict(
                os.environ,
                {"UNCHAIN_DATA_DIR": "/tmp/pupu-vault-sink-adapter-test"},
            )
        )
        agent = ua._create_agent(
            {
                "_memory_v2_attempt_id": "attempt-a",
                "_memory_v2_owner_chat_id": "chat-a",
                "_memory_v2_requested": is_active,
            },
            session_id="session-a",
            memory_v2_shadow_run=run,
        )
    return agent, captured, get_client


def test_create_agent_gates_vault_to_active_root_for_normal_and_resume_factory():
    client = _Client()
    for _lifecycle in ("normal", "resume"):
        agent, captured, get_client = _create_agent_with_captured_build(
            admission=_admission(active=True),
            client=client,
        )
        assert isinstance(captured["vault_runtime"], VaultSinkRuntimePlugin)
        assert captured["vault_runtime"].client is client
        assert captured["vault_runtime"].owner_chat_id == "chat-a"
        assert captured["vault_runtime"].session_id == "session-a"
        assert captured["vault_runtime"].attempt_id == "attempt-a"
        assert agent._memory_v2_admission.is_active is True
        get_client.assert_called_once_with()


def test_create_agent_does_not_even_query_vault_client_when_v2_is_inactive():
    _agent, captured, get_client = _create_agent_with_captured_build(
        admission=_admission(active=False),
        client=_Client(),
    )
    assert captured["vault_runtime"] is None
    get_client.assert_not_called()


def test_create_agent_client_unavailable_keeps_vault_structurally_absent():
    _agent, captured, get_client = _create_agent_with_captured_build(
        admission=_admission(active=True),
        client=None,
    )
    assert captured["vault_runtime"] is None
    get_client.assert_called_once_with()
