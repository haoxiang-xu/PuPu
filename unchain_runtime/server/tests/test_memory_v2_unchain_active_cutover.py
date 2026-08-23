from __future__ import annotations

from contextlib import ExitStack
import os
from types import SimpleNamespace
from unittest import mock

import unchain_adapter as adapter
from context_memory_v2_capability import ContextMemoryV2CapabilityVerdict
from memory_v2_unchain_run_binding import PupuMemoryV2TextInputDraft
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from unchain.agent.modules import ContextModule
from unchain.agent.modules.task_state_bootstrap import (
    PinnedTaskStateBootstrapModule,
)
from unchain.memory import (
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_CAPABILITIES,
    MEMORY_V2_MODULE_KEY,
    MemoryV2Module,
)
from unchain.runtime import ExecutionIdentity, ModuleGrant


def _ready_capability() -> ContextMemoryV2CapabilityVerdict:
    return ContextMemoryV2CapabilityVerdict(
        ready=True,
        reason="unchain_context_memory_ready",
        verification="exact_sha",
        immutable=True,
        unchain_revision="a" * 40,
    )


def test_create_agent_constructs_host_before_admission_without_legacy_runtime(
    tmp_path,
) -> None:
    built = {}
    forbidden = AssertionError("legacy PuPu Context V2 data plane was invoked")

    def fake_build(**kwargs):
        built.update(kwargs)
        return SimpleNamespace()

    run = PupuUnchainShadowRunDraft(
        session_id="session-active",
        identity=ExecutionIdentity(
            execution_id="session-active",
            attempt_id="attempt-active",
            run_id="attempt-active",
            run_lineage=("attempt-active",),
        ),
        grant=ModuleGrant(
            module_key=MEMORY_V2_MODULE_KEY,
            capabilities=MEMORY_V2_CAPABILITIES,
            delegable_capabilities=MEMORY_V2_CAPABILITIES.difference(
                {MEMORY_EXECUTION_COMPLETE}
            ),
            authority="memory-completion:session-active",
        ),
        current_input_draft=PupuMemoryV2TextInputDraft(content="full task"),
    )
    environment = {
        "UNCHAIN_DATA_DIR": str(tmp_path),
        "PUPU_CONTEXT_V2_STORE_OWNER": "unchain",
        "PUPU_FEATURE_MEMORY_V2": "all",
        "PUPU_MEMORY_V2_MODE": "all",
        "PUPU_MEMORY_V2_CANARY_PERCENT": "100",
    }

    with mock.patch.dict(os.environ, environment, clear=False), ExitStack() as stack:
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
                "get_max_context_window_tokens",
                return_value=16_384,
            )
        )
        stack.enter_context(
            mock.patch(
                "memory_v2_context.resolve_context_memory_v2_capability",
                return_value=_ready_capability(),
            )
        )
        stack.enter_context(
            mock.patch("memory_v2_context._load_runtime", return_value=None)
        )
        stack.enter_context(
            mock.patch("memory_v2_context._core_suppression_available", return_value=True)
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
        for symbol in (
            "_memory_v2_bind_recalled_refs",
            "_import_memory_v2_history",
            "_bootstrap_memory_v2_current_request",
            "_prepare_memory_v2_first_message_recall",
        ):
            stack.enter_context(
                mock.patch.object(adapter, symbol, side_effect=forbidden)
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
                "vault_sink_client.get_process_vault_sink_client",
                return_value=None,
            )
        )
        agent = adapter._create_agent(
            {
                "_memory_v2_requested": True,
                "_memory_v2_owner_chat_id": "chat-active",
                "_memory_v2_attempt_id": "attempt-active",
                "_memory_v2_unchain_active_preflight": "renderer-forgery",
                "_memory_v2_bootstrap_history": [
                    {"role": "user", "content": "legacy objective"},
                    {"role": "assistant", "content": "legacy decision"},
                ],
            },
            session_id="session-active",
            memory_v2_shadow_run=run,
        )

    admission = agent._memory_v2_admission
    assert admission.is_active
    assert admission.runtime is None
    assert admission.admission_authority is not None
    assert admission.admission_sticky is True
    assert admission.v2_bootstrapped is True
    assert admission.bootstrap_status == "complete"
    assert agent._memory_v2_unchain_bootstrap_receipt["status"] == "completed"
    assert agent._memory_v2_unchain_bootstrap_receipt["message_count"] == 2
    assert built["official_context_v2_active"] is True
    assert len(built["context_memory_v2_modules"]) == 4
    assert type(built["context_memory_v2_modules"][0]) is ContextModule
    assert (
        type(built["context_memory_v2_modules"][1])
        is PinnedTaskStateBootstrapModule
    )
    assert type(built["context_memory_v2_modules"][2]) is MemoryV2Module
    assert agent._memory_v2_memory_agent_selection.is_ready is True
    assert agent._memory_v2_unchain_active_bridge.preparation is (
        agent._memory_v2_unchain_active_preparation
    )
