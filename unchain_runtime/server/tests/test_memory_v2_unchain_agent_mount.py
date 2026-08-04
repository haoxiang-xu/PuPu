from __future__ import annotations

from contextlib import ExitStack
from types import SimpleNamespace
from unittest import mock

import pytest

import unchain_adapter as adapter
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from unchain.run_identity import MemoryV2RunRole


class _Module:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _Agent:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.provider = kwargs["provider"]
        self.model = kwargs["model"]


def _build(*, context_memory_v2_modules=()):
    return adapter._build_developer_agent(
        UnchainAgent=_Agent,
        ToolsModule=_Module,
        MemoryModule=_Module,
        PoliciesModule=_Module,
        provider="anthropic",
        model="claude-test",
        api_key="",
        max_iterations=4,
        toolkits=[],
        memory_manager=None,
        options={},
        enable_subagents=False,
        context_memory_v2_modules=context_memory_v2_modules,
    )


def test_host_context_modules_mount_by_identity_before_agent_construction() -> None:
    shadow = SimpleNamespace(name="context_shadow")
    agent = _build(context_memory_v2_modules=(shadow,))

    modules = agent.kwargs["modules"]
    assert shadow in modules
    assert modules.count(shadow) == 1


def test_default_host_context_module_seam_is_byte_for_byte_empty() -> None:
    baseline = _build().kwargs
    explicit_empty = _build(context_memory_v2_modules=()).kwargs

    assert explicit_empty["instructions"] == baseline["instructions"]
    assert explicit_empty["provider"] == baseline["provider"]
    assert explicit_empty["model"] == baseline["model"]
    assert tuple(type(module) for module in explicit_empty["modules"]) == tuple(
        type(module) for module in baseline["modules"]
    )
    assert len(explicit_empty["modules"]) == len(baseline["modules"])


def test_durability_only_runtime_mounts_official_module_not_legacy_memory() -> None:
    runtime = object()
    agent = adapter._build_developer_agent(
        UnchainAgent=_Agent,
        ToolsModule=_Module,
        MemoryModule=_Module,
        DurabilityModule=_Module,
        PoliciesModule=_Module,
        provider="anthropic",
        model="claude-test",
        api_key="",
        max_iterations=4,
        toolkits=[],
        memory_manager=runtime,
        memory_durability_only=True,
        options={},
        enable_subagents=False,
    )

    modules = agent.kwargs["modules"]
    assert any(module.kwargs == {"runtime": runtime} for module in modules)
    assert not any(
        getattr(module, "kwargs", None) == {"memory": runtime}
        for module in modules
    )


def test_official_active_context_owns_toolkit_and_compiler_mounts() -> None:
    admission = SimpleNamespace(
        is_active=True,
        provider="anthropic",
        model="claude-test",
        real_context_window_tokens=16_384,
    )
    canonical = SimpleNamespace(name="context_v2")

    with mock.patch.object(
        adapter,
        "_memory_v2_admission_from_options",
        return_value=admission,
    ), mock.patch.object(
        adapter,
        "_append_memory_v2_normal_toolkit",
        side_effect=AssertionError("legacy PuPu toolkit must be bypassed"),
    ), mock.patch.object(
        adapter,
        "_build_memory_v2_optimizer_module",
        side_effect=AssertionError("legacy PuPu compiler must be bypassed"),
    ):
        agent = adapter._build_developer_agent(
            UnchainAgent=_Agent,
            ToolsModule=_Module,
            MemoryModule=_Module,
            PoliciesModule=_Module,
            provider="anthropic",
            model="claude-test",
            api_key="",
            max_iterations=4,
            toolkits=[],
            memory_manager=None,
            options={},
            enable_subagents=False,
            context_memory_v2_modules=(canonical,),
            official_context_v2_active=True,
        )

    assert canonical in agent.kwargs["modules"]
    assert agent.kwargs["modules"].count(canonical) == 1


def test_create_agent_mounts_prepared_official_shadow_modules() -> None:
    admission = SimpleNamespace(
        is_active=False,
        is_shadow=True,
        mode="shadow",
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="root-run-a",
        source_attempt_id="",
        provider="ollama",
        model="test",
        real_context_window_tokens=16_384,
        runtime=None,
    )
    run = PupuUnchainShadowRunDraft(
        execution_id="session-a",
        session_id="session-a",
        attempt_id="root-run-a",
        run_id="root-run-a",
        root_run_id="root-run-a",
        role=MemoryV2RunRole.ROOT,
    )
    shadow_module = SimpleNamespace(name="context_shadow")
    bridge = SimpleNamespace(
        modules=(shadow_module,),
        preparation=SimpleNamespace(host_factory=object()),
    )
    built = {}

    def fake_build(**kwargs):
        built.update(kwargs)
        return SimpleNamespace()

    with mock.patch.object(adapter, "_UnchainAgent", object), mock.patch.object(
        adapter, "parse_custom_provider", return_value=None
    ), mock.patch.object(
        adapter, "_load_recipe_from_options", return_value=None
    ), mock.patch.object(
        adapter,
        "get_runtime_config",
        return_value={"provider": "ollama", "model": "test"},
    ), mock.patch.object(
        adapter, "_resolve_agent_api_key", return_value=""
    ), mock.patch.object(
        adapter,
        "_resolve_memory_runtime",
        return_value=({"requested": False, "available": False, "reason": ""}, None),
    ), mock.patch.object(
        adapter, "_build_requested_toolkits", return_value=[]
    ), mock.patch.object(
        adapter, "get_durable_jobs_runtime", return_value=None
    ), mock.patch.object(
        adapter, "_extract_user_prompt_modules", return_value={}
    ), mock.patch.object(
        adapter, "get_max_context_window_tokens", return_value=16_384
    ), mock.patch.object(
        adapter, "_resolve_memory_v2_admission", return_value=admission
    ), mock.patch.object(
        adapter, "_import_memory_v2_history"
    ), mock.patch.object(
        adapter, "_bootstrap_memory_v2_current_request"
    ), mock.patch.object(
        adapter, "_options_with_memory_v2_admission", return_value={}
    ), mock.patch.object(
        adapter, "_build_developer_agent", side_effect=fake_build
    ), mock.patch(
        "memory_v2_unchain_shadow_bridge.prepare_pupu_unchain_shadow_bridge",
        return_value=bridge,
    ) as prepare:
        agent = adapter._create_agent(
            {"_memory_v2_attempt_id": "root-run-a"},
            session_id="session-a",
            memory_v2_shadow_run=run,
        )

    assert prepare.call_args.kwargs["admission"] is admission
    assert prepare.call_args.kwargs["run"] is run
    assert built["context_memory_v2_modules"] == (shadow_module,)
    assert built["official_context_v2_active"] is False
    assert agent._memory_v2_unchain_shadow_bridge is bridge


def test_create_agent_mounts_active_context_and_bypasses_legacy_data_plane(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    admission = SimpleNamespace(
        is_active=True,
        is_shadow=False,
        mode="active",
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="root-run-a",
        source_attempt_id="",
        provider="ollama",
        model="test",
        real_context_window_tokens=16_384,
        runtime=None,
    )
    run = PupuUnchainShadowRunDraft(
        execution_id="session-a",
        session_id="session-a",
        attempt_id="root-run-a",
        run_id="root-run-a",
        root_run_id="root-run-a",
        role=MemoryV2RunRole.ROOT,
    )
    context_module = SimpleNamespace(name="context_v2")
    bridge = SimpleNamespace(
        modules=(context_module,),
        preparation=SimpleNamespace(host_factory=object()),
    )
    preflight = object()
    built = {}

    def fake_build(**kwargs):
        built.update(kwargs)
        return SimpleNamespace()

    forbidden = AssertionError("legacy PuPu data plane must be bypassed")
    with ExitStack() as stack:
        stack.enter_context(mock.patch.object(adapter, "_UnchainAgent", object))
        stack.enter_context(
            mock.patch.object(adapter, "parse_custom_provider", return_value=None)
        )
        stack.enter_context(
            mock.patch.object(adapter, "_load_recipe_from_options", return_value=None)
        )
        stack.enter_context(
            mock.patch.object(
                adapter,
                "get_runtime_config",
                return_value={"provider": "ollama", "model": "test"},
            )
        )
        stack.enter_context(
            mock.patch.object(adapter, "_resolve_agent_api_key", return_value="")
        )
        stack.enter_context(
            mock.patch.object(
                adapter,
                "_resolve_memory_runtime",
                return_value=(
                    {"requested": False, "available": False, "reason": ""},
                    None,
                ),
            )
        )
        stack.enter_context(
            mock.patch.object(adapter, "_build_requested_toolkits", return_value=[])
        )
        stack.enter_context(
            mock.patch.object(adapter, "get_durable_jobs_runtime", return_value=None)
        )
        stack.enter_context(
            mock.patch.object(adapter, "_extract_user_prompt_modules", return_value={})
        )
        stack.enter_context(
            mock.patch.object(
                adapter,
                "get_max_context_window_tokens",
                return_value=16_384,
            )
        )
        resolve = stack.enter_context(
            mock.patch.object(
                adapter,
                "_resolve_memory_v2_admission",
                return_value=admission,
            )
        )
        stack.enter_context(
            mock.patch.object(
                adapter,
                "_inspect_memory_v2_rollout_intent",
                return_value={"target_mode": "active"},
            )
        )
        for symbol in (
            "_memory_v2_bind_recalled_refs",
            "_import_memory_v2_history",
            "_bootstrap_memory_v2_current_request",
            "_prepare_memory_v2_first_message_recall",
        ):
            stack.enter_context(
                mock.patch.object(adapter, symbol, side_effect=forbidden)
            )
        options_with = stack.enter_context(
            mock.patch.object(
                adapter,
                "_options_with_memory_v2_admission",
                return_value={},
            )
        )
        stack.enter_context(
            mock.patch.object(
                adapter,
                "_build_developer_agent",
                side_effect=fake_build,
            )
        )
        stack.enter_context(
            mock.patch(
                "memory_v2_store_boundary.configured_context_v2_store_owner",
                return_value="unchain",
            )
        )
        prepare = stack.enter_context(
            mock.patch(
                "memory_v2_unchain_active_bridge.preflight_pupu_unchain_active_host",
                return_value=preflight,
            )
        )
        bind = stack.enter_context(
            mock.patch(
                "memory_v2_unchain_active_bridge.bind_pupu_unchain_active_bridge",
                return_value=bridge,
            )
        )
        stack.enter_context(
            mock.patch.object(
                adapter,
                "get_pending_interaction",
                return_value={"status": "none", "session_id": "session-a"},
            )
        )
        bootstrap = stack.enter_context(
            mock.patch(
                "memory_v2_unchain_lazy_bootstrap.bootstrap_pupu_unchain_active_chat",
                return_value={
                    "status": "completed",
                    "admission": {"admission_id": "admission-a"},
                },
            )
        )
        stack.enter_context(
            mock.patch.object(
                adapter,
                "_memory_v2_apply_chat_admission_record",
            )
        )
        stack.enter_context(
            mock.patch(
                "vault_sink_client.get_process_vault_sink_client",
                return_value=None,
            )
        )
        agent = adapter._create_agent(
            {
                "_memory_v2_requested": True,
                "_memory_v2_owner_chat_id": "chat-a",
                "_memory_v2_attempt_id": "root-run-a",
                "_memory_v2_unchain_active_preflight": "renderer-forgery",
            },
            session_id="session-a",
            memory_v2_shadow_run=run,
        )

    assert prepare.call_args.kwargs["run"] is run
    assert prepare.call_args.kwargs["owner_chat_id"] == "chat-a"
    assert prepare.call_args.kwargs["bootstrap_history"] == ()
    assert prepare.call_args.kwargs["no_unfinished_durable_checkpoint"] is True
    assert prepare.call_args.kwargs["no_pending_interaction"] is True
    assert bind.call_args.kwargs == {
        "admission": admission,
        "preflight": preflight,
    }
    assert bootstrap.call_args.kwargs == {
        "preflight": preflight,
        "admission": admission,
    }
    assert resolve.call_args.args[0]["_memory_v2_unchain_active_preflight"] is True
    assert "_memory_v2_unchain_active_preflight" not in options_with.call_args.args[0]
    assert built["context_memory_v2_modules"] == (context_module,)
    assert built["official_context_v2_active"] is True
    assert agent._memory_v2_unchain_active_bridge is bridge
    assert not hasattr(agent, "_memory_v2_unchain_shadow_bridge")


def test_create_agent_fails_closed_when_active_run_has_no_official_preflight() -> None:
    admission = SimpleNamespace(is_active=True, is_shadow=False, mode="active")
    with (
        mock.patch.object(adapter, "_UnchainAgent", object),
        mock.patch.object(adapter, "parse_custom_provider", return_value=None),
        mock.patch.object(adapter, "_load_recipe_from_options", return_value=None),
        mock.patch.object(
            adapter,
            "get_runtime_config",
            return_value={"provider": "ollama", "model": "test"},
        ),
        mock.patch.object(adapter, "_resolve_agent_api_key", return_value=""),
        mock.patch.object(
            adapter,
            "get_max_context_window_tokens",
            return_value=16_384,
        ),
        mock.patch.object(
            adapter,
            "_resolve_memory_v2_admission",
            return_value=admission,
        ),
        mock.patch.object(
            adapter,
            "_resolve_memory_runtime",
            side_effect=AssertionError("legacy runtime must not open"),
        ),
    ):
        with pytest.raises(RuntimeError, match="official Unchain run preflight"):
            adapter._create_agent({}, session_id="session-active-no-preflight")
