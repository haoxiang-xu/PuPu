from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import pytest

import unchain_adapter as adapter
from memory_v2_unchain_agent_factory import (
    PupuOfficialMemoryAgentFactoryError,
    PupuRawIsolatedMemoryAgent,
    build_pupu_official_memory_agent_factory,
    build_pupu_official_memory_agent_invoker,
)
from memory_v2_unchain_model_invoker import (
    PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT,
    PupuOfficialMemoryAgentModelInvoker,
)
from unchain.journal import ResourceRef
from unchain.memory.toolkit import ReferencePurpose
from unchain.tools import Tool, Toolkit


class _Codec:
    binding_id = "binding-a"

    def encode(self, ref: ResourceRef) -> str:
        return f"ref:{ref.kind}:{ref.resource_id}:{ref.revision}:{ref.fragment or '-'}"

    def decode(self, value: str, *, purpose: ReferencePurpose) -> ResourceRef:
        del purpose
        _, kind, resource_id, revision, fragment = value.split(":", 4)
        return ResourceRef(
            kind,
            resource_id,
            int(revision),
            "" if fragment == "-" else fragment,
        )


def _toolkit() -> Toolkit:
    toolkit = Toolkit()
    for name in (
        "memory_candidate_read",
        "memory_candidate_source_read",
        "memory_candidate_apply_new",
        "memory_candidate_propose_review",
    ):
        toolkit.register(
            Tool.from_callable(
                lambda **_kwargs: {},
                name=name,
            )
        )
    return toolkit


class _ToolsModule:
    def __init__(self, *, tools):
        self.tools = tools


class _PoliciesModule:
    def __init__(self, *, max_iterations):
        self.max_iterations = max_iterations


class _RawAgent:
    constructor_calls = []
    run_calls = []

    def __init__(self, **kwargs):
        self.constructor_calls.append(kwargs)
        self.provider = kwargs["provider"]
        self.model = kwargs["model"]

    def run(self, *, messages, payload, callback):
        self.run_calls.append(
            {"messages": messages, "payload": payload, "callback": callback}
        )
        return SimpleNamespace(status="completed")


@pytest.fixture(autouse=True)
def _clear_calls():
    _RawAgent.constructor_calls.clear()
    _RawAgent.run_calls.clear()


def test_builtin_factory_creates_raw_isolated_agent_with_bound_payload():
    toolkit = _toolkit()
    resolved_keys = []
    payload_calls = []

    def resolve_key(options, provider, cfg=None):
        resolved_keys.append((options, provider, cfg))
        return "ephemeral-key"

    def build_payload(provider, options):
        payload_calls.append((provider, options))
        return {"temperature": options["temperature"], "max_output_tokens": 400}

    with (
        mock.patch.object(adapter, "_UnchainAgent", _RawAgent),
        mock.patch.object(adapter, "_ToolsModule", _ToolsModule),
        mock.patch.object(adapter, "_PoliciesModule", _PoliciesModule),
        mock.patch.object(adapter, "parse_custom_provider", return_value=None),
        mock.patch.object(adapter, "_resolve_agent_api_key", side_effect=resolve_key),
        mock.patch.object(adapter, "_build_payload", side_effect=build_payload),
    ):
        factory = build_pupu_official_memory_agent_factory(
            {
                "temperature": 0.2,
                "maxTokens": 400,
                "unrelated": "must-not-become-provider-payload",
            }
        )
        agent = factory(
            provider="openai",
            model_id="curator-model",
            system_prompt=PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT,
            toolkit=toolkit,
            display_name="Memory Gardener",
        )
        callback = lambda _event: None
        result = agent.run(
            messages=[{"role": "user", "content": "job"}],
            payload={},
            callback=callback,
        )

    assert type(agent) is PupuRawIsolatedMemoryAgent
    assert result.status == "completed"
    assert resolved_keys[0][1:] == ("openai", None)
    assert payload_calls == [
        ("openai", {"temperature": 0.2, "maxTokens": 400})
    ]
    constructor = _RawAgent.constructor_calls[0]
    assert constructor["name"] == "pupu_memory_agent"
    assert constructor["instructions"] == PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT
    assert constructor["provider"] == "openai"
    assert constructor["model"] == "curator-model"
    assert constructor["api_key"] == "ephemeral-key"
    assert constructor["allowed_tools"] == tuple(toolkit.tools)
    assert constructor["missing_tool_policy"] == "raise"
    assert len(constructor["modules"]) == 2
    assert constructor["modules"][0].tools == (toolkit,)
    assert constructor["modules"][1].max_iterations == 32
    assert _RawAgent.run_calls[0]["payload"] == {
        "temperature": 0.2,
        "max_output_tokens": 400,
    }
    assert _RawAgent.run_calls[0]["callback"] is callback
    assert not isinstance(agent, adapter._MemoryV2CuratorAgentAdapter)


def test_custom_provider_reuses_exact_custom_model_factory_and_full_payload():
    toolkit = _toolkit()
    custom = SimpleNamespace(
        twin="openai",
        has_model=lambda model: model == "custom-model",
    )
    custom_model_io = object()
    options = {
        "temperature": 0.1,
        "maxTokens": 700,
        "custom_provider_config": {"private": "request-local"},
    }

    with (
        mock.patch.object(adapter, "_UnchainAgent", _RawAgent),
        mock.patch.object(adapter, "_ToolsModule", _ToolsModule),
        mock.patch.object(adapter, "_PoliciesModule", _PoliciesModule),
        mock.patch.object(adapter, "parse_custom_provider", return_value=custom),
        mock.patch.object(
            adapter,
            "_resolve_agent_api_key",
            return_value="custom-ephemeral-key",
        ) as resolve_key,
        mock.patch.object(
            adapter,
            "make_custom_model_io_factory",
            return_value=custom_model_io,
        ) as make_io,
        mock.patch.object(
            adapter,
            "_build_payload",
            return_value={"max_output_tokens": 700},
        ) as build_payload,
    ):
        agent = build_pupu_official_memory_agent_factory(options)(
            provider="openai",
            model_id="custom-model",
            system_prompt=PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT,
            toolkit=toolkit,
            display_name="Memory Agent",
        )

    assert agent.provider == "openai"
    assert agent.model_id == "custom-model"
    assert resolve_key.call_args.kwargs["cfg"] is custom
    make_io.assert_called_once_with(custom, "custom-ephemeral-key")
    build_payload.assert_called_once_with("openai", options)
    assert _RawAgent.constructor_calls[0]["model_io_factory"] is custom_model_io


def test_factory_rejects_prompt_toolkit_or_payload_override():
    toolkit = _toolkit()
    with (
        mock.patch.object(adapter, "_UnchainAgent", _RawAgent),
        mock.patch.object(adapter, "_ToolsModule", _ToolsModule),
        mock.patch.object(adapter, "_PoliciesModule", _PoliciesModule),
        mock.patch.object(adapter, "parse_custom_provider", return_value=None),
        mock.patch.object(adapter, "_resolve_agent_api_key", return_value="key"),
        mock.patch.object(adapter, "_build_payload", return_value={}),
    ):
        factory = build_pupu_official_memory_agent_factory({})
        with pytest.raises(PupuOfficialMemoryAgentFactoryError) as prompt_error:
            factory(
                provider="openai",
                model_id="model",
                system_prompt="caller override",
                toolkit=toolkit,
                display_name="Memory Agent",
            )
        toolkit.tools["memory_promote"] = toolkit.tools[
            "memory_candidate_read"
        ]
        with pytest.raises(PupuOfficialMemoryAgentFactoryError) as toolkit_error:
            factory(
                provider="openai",
                model_id="model",
                system_prompt=PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT,
                toolkit=toolkit,
                display_name="Memory Agent",
            )
        toolkit.tools.pop("memory_promote")
        agent = factory(
            provider="openai",
            model_id="model",
            system_prompt=PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT,
            toolkit=toolkit,
            display_name="Memory Agent",
        )
        with pytest.raises(PupuOfficialMemoryAgentFactoryError) as payload_error:
            agent.run(messages="job", payload={"temperature": 1}, callback=None)

    assert prompt_error.value.code == "memory_agent_system_prompt_mismatch"
    assert toolkit_error.value.code == "memory_agent_toolkit_scope_invalid"
    assert payload_error.value.code == "memory_agent_payload_override_forbidden"


def test_builder_returns_official_typed_invoker_for_active_factory():
    codec = _Codec()

    invoker = build_pupu_official_memory_agent_invoker(
        options={"temperature": 0},
        provider="ollama",
        model_id="local-curator",
        reference_codec=codec,
    )

    assert type(invoker) is PupuOfficialMemoryAgentModelInvoker
    assert invoker.provider == "ollama"
    assert invoker.model_id == "local-curator"
    assert invoker.reference_codec is codec
