"""Request-local PuPu factory for the official Unchain Memory Agent invoker.

This is a provider-construction adapter only.  It reuses PuPu's existing API
key, custom-provider, payload, Agent, and module builders while returning an
isolated raw-run contract for the official typed model invoker.  It never
passes through the legacy dict-based Curator adapter.
"""

from __future__ import annotations

import copy
import importlib
from collections.abc import Mapping
from typing import Any

from memory_v2_unchain_model_invoker import (
    PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT,
    PupuOfficialMemoryAgentModelInvoker,
)
from unchain.journal.models import _required_text
from unchain.memory.toolkit.capabilities import BoundExternalReferenceCodec
from unchain.tools import Toolkit


_OFFICIAL_CONSOLIDATION_TOOLS = frozenset(
    {
        "memory_candidate_read",
        "memory_candidate_source_read",
        "memory_candidate_apply_new",
        "memory_candidate_propose_review",
    }
)


class PupuOfficialMemoryAgentFactoryError(RuntimeError):
    """The selected provider could not create an isolated Memory Agent."""

    def __init__(self, code: str) -> None:
        self.code = str(code or "memory_agent_factory_failed")
        super().__init__(self.code)


class PupuRawIsolatedMemoryAgent:
    """Raw Agent run shape with request-local provider payload pre-bound."""

    def __init__(
        self,
        raw_agent: Any,
        *,
        provider: str,
        model_id: str,
        payload: Mapping[str, Any],
        display_name: str,
    ) -> None:
        if not callable(getattr(raw_agent, "run", None)):
            raise PupuOfficialMemoryAgentFactoryError(
                "memory_agent_runtime_invalid"
            )
        self._raw_agent = raw_agent
        self.provider = _required_text(
            provider,
            "provider",
            maximum=256,
            identifier=True,
        )
        self.model_id = _required_text(
            model_id,
            "model_id",
            maximum=512,
            identifier=True,
        )
        self.model = self.model_id
        self.display_name = _required_text(
            display_name,
            "display_name",
            maximum=256,
        )
        if (
            str(getattr(raw_agent, "provider", "") or "").strip()
            != self.provider
            or str(getattr(raw_agent, "model", "") or "").strip()
            != self.model_id
        ):
            raise PupuOfficialMemoryAgentFactoryError(
                "memory_agent_model_binding_mismatch"
            )
        if getattr(raw_agent, "_memory_v2_admission", None) is not None:
            raise PupuOfficialMemoryAgentFactoryError(
                "memory_agent_recursion_boundary_violation"
            )
        if not isinstance(payload, Mapping):
            raise TypeError("payload must be an object")
        try:
            self._payload = copy.deepcopy(dict(payload))
        except Exception as error:
            raise PupuOfficialMemoryAgentFactoryError(
                "memory_agent_payload_invalid"
            ) from error

    def run(
        self,
        *,
        messages: str | list[dict[str, Any]],
        payload: dict[str, Any] | None,
        callback,
    ):
        if payload not in (None, {}):
            raise PupuOfficialMemoryAgentFactoryError(
                "memory_agent_payload_override_forbidden"
            )
        if callback is not None and not callable(callback):
            raise TypeError("callback must be callable or None")
        return self._raw_agent.run(
            messages=copy.deepcopy(messages),
            payload=copy.deepcopy(self._payload),
            callback=callback,
        )


class PupuOfficialMemoryAgentRawFactory:
    """Callable factory accepted by ``PupuOfficialMemoryAgentModelInvoker``."""

    def __init__(self, options: Mapping[str, Any]) -> None:
        if not isinstance(options, Mapping):
            raise TypeError("options must be an object")
        self._options = dict(options)

    def __call__(
        self,
        *,
        provider: str,
        model_id: str,
        system_prompt: str,
        toolkit: Toolkit,
        display_name: str,
    ) -> PupuRawIsolatedMemoryAgent:
        normalized_provider = _required_text(
            provider,
            "provider",
            maximum=256,
            identifier=True,
        )
        normalized_model = _required_text(
            model_id,
            "model_id",
            maximum=512,
            identifier=True,
        )
        if system_prompt != PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT:
            raise PupuOfficialMemoryAgentFactoryError(
                "memory_agent_system_prompt_mismatch"
            )
        if (
            not isinstance(toolkit, Toolkit)
            or frozenset(toolkit.tools) != _OFFICIAL_CONSOLIDATION_TOOLS
            or "memory_promote" in toolkit.tools
        ):
            raise PupuOfficialMemoryAgentFactoryError(
                "memory_agent_toolkit_scope_invalid"
            )

        adapter = importlib.import_module("unchain_adapter")
        supported = getattr(adapter, "_SUPPORTED_PROVIDERS", frozenset())
        agent_type = getattr(adapter, "_UnchainAgent", None)
        tools_module = getattr(adapter, "_ToolsModule", None)
        policies_module = getattr(adapter, "_PoliciesModule", None)
        if normalized_provider not in supported or not all(
            value is not None
            for value in (agent_type, tools_module, policies_module)
        ):
            raise PupuOfficialMemoryAgentFactoryError(
                "memory_agent_provider_configuration_unavailable"
            )

        try:
            custom_config = adapter.parse_custom_provider(self._options)
            selected_custom = (
                custom_config
                if custom_config is not None
                and custom_config.twin == normalized_provider
                and custom_config.has_model(normalized_model)
                else None
            )
            model_io_factory = None
            if selected_custom is not None:
                api_key = adapter._resolve_agent_api_key(
                    self._options,
                    normalized_provider,
                    cfg=selected_custom,
                )
                model_io_factory = adapter.make_custom_model_io_factory(
                    selected_custom,
                    api_key,
                )
                resolved_payload = adapter._build_payload(
                    normalized_provider,
                    self._options,
                )
            else:
                api_key = adapter._resolve_agent_api_key(
                    self._options,
                    normalized_provider,
                )
                payload_options = {
                    key: self._options.get(key)
                    for key in ("temperature", "maxTokens")
                    if isinstance(self._options.get(key), (int, float))
                    and not isinstance(self._options.get(key), bool)
                }
                resolved_payload = adapter._build_payload(
                    normalized_provider,
                    payload_options,
                )
            modules = (
                tools_module(tools=(toolkit,)),
                policies_module(max_iterations=32),
            )
            agent_kwargs = {
                "name": "pupu_memory_agent",
                "instructions": PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT,
                "provider": normalized_provider,
                "model": normalized_model,
                "api_key": api_key or None,
                "modules": modules,
                "allowed_tools": tuple(toolkit.tools),
                "missing_tool_policy": "raise",
            }
            if model_io_factory is not None:
                agent_kwargs["model_io_factory"] = model_io_factory
            raw_agent = agent_type(**agent_kwargs)
        except PupuOfficialMemoryAgentFactoryError:
            raise
        except Exception as error:
            raise PupuOfficialMemoryAgentFactoryError(
                "memory_agent_provider_construction_failed"
            ) from error
        return PupuRawIsolatedMemoryAgent(
            raw_agent,
            provider=normalized_provider,
            model_id=normalized_model,
            payload=resolved_payload,
            display_name=display_name,
        )


def build_pupu_official_memory_agent_factory(
    options: Mapping[str, Any],
) -> PupuOfficialMemoryAgentRawFactory:
    """Bind ephemeral request-local provider configuration to a raw factory."""

    return PupuOfficialMemoryAgentRawFactory(options)


def build_pupu_official_memory_agent_invoker(
    *,
    options: Mapping[str, Any],
    provider: str,
    model_id: str,
    reference_codec: BoundExternalReferenceCodec,
) -> PupuOfficialMemoryAgentModelInvoker:
    """Build the typed official invoker ready for the active Unchain factory."""

    return PupuOfficialMemoryAgentModelInvoker(
        agent_factory=build_pupu_official_memory_agent_factory(options),
        provider=provider,
        model_id=model_id,
        reference_codec=reference_codec,
    )


__all__ = [
    "PupuOfficialMemoryAgentFactoryError",
    "PupuOfficialMemoryAgentRawFactory",
    "PupuRawIsolatedMemoryAgent",
    "build_pupu_official_memory_agent_factory",
    "build_pupu_official_memory_agent_invoker",
]
