from __future__ import annotations

import os
from types import SimpleNamespace
from unittest import mock

import pytest

from context_memory_v2_capability import ContextMemoryV2CapabilityVerdict
import memory_v2_context


def _blocked_verdict() -> ContextMemoryV2CapabilityVerdict:
    return ContextMemoryV2CapabilityVerdict(
        ready=False,
        reason="unchain_runtime_protocol_manifest_missing",
        verification="failed",
        immutable=False,
        unchain_revision="diagnostic-only",
    )


def _active_environment() -> dict[str, str]:
    return {
        "PUPU_FEATURE_MEMORY_V2": "all",
        "PUPU_MEMORY_V2_MODE": "all",
        "PUPU_MEMORY_V2_CANARY_PERCENT": "100",
    }


def test_preflight_never_targets_shadow_or_active_without_core_readiness() -> None:
    with (
        mock.patch.dict(os.environ, _active_environment(), clear=False),
        mock.patch.object(
            memory_v2_context,
            "resolve_context_memory_v2_capability",
            return_value=_blocked_verdict(),
        ) as capability_probe,
    ):
        intent = memory_v2_context.inspect_memory_v2_rollout_intent(
            {"_memory_v2_requested": True},
            owner_chat_id="chat_capability_blocked",
        )

    assert intent["target_mode"] == "off"
    assert intent["runtime_protocol_ready"] is False
    assert (
        intent["runtime_protocol_reason"]
        == "unchain_runtime_protocol_manifest_missing"
    )
    capability_probe.assert_called_once_with(requested_mode="all")


def test_admission_rejects_v2_before_runtime_or_sticky_state_can_activate() -> None:
    runtime = SimpleNamespace()
    with (
        mock.patch.dict(os.environ, _active_environment(), clear=False),
        mock.patch.object(
            memory_v2_context,
            "resolve_context_memory_v2_capability",
            return_value=_blocked_verdict(),
        ) as capability_probe,
        pytest.raises(
            memory_v2_context.MemoryV2ContextError,
            match="unchain_runtime_protocol_manifest_missing",
        ),
    ):
        memory_v2_context.resolve_memory_v2_admission(
            {
                "_memory_v2_requested": True,
                "_memory_v2_owner_chat_id": "chat_capability_blocked",
                "_memory_v2_attempt_id": "attempt_capability_blocked",
                "_memory_v2_runtime": runtime,
            },
            provider="openai",
            model="gpt-test",
            real_context_window_tokens=200_000,
            session_id="session_capability_blocked",
        )

    capability_probe.assert_called_once_with(requested_mode="all")
