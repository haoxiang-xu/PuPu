"""Provider payload contracts through the actual background option projection."""
import json
import sqlite3
import threading

import pytest

import memory_v2_background_worker as background
import unchain_adapter as adapter
from memory_v2_unchain_agent_selection import select_pupu_memory_agent_invoker
from memory_v2_unchain_model_invoker import PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT
from test_memory_v2_unchain_agent_factory import _Codec, _RawAgent, _toolkit


@pytest.mark.parametrize("protocol,provider,wire_key", [
    ("openai-responses", "openai", "reasoning"),
    ("anthropic", "hyperspace", "output_config"),
    ("ollama", "ollama", None),
])
@pytest.mark.parametrize("effort,normalized", [
    ("low", "low"), ("high", "high"), (" LOW ", "low"),
    ("minimal", "minimal"), ("invalid", None), (None, None),
    ({"callback": "must-not-retain"}, None),
])
def test_effort_survives_selection_registry_and_resolution(
        tmp_path, monkeypatch, protocol, provider, wire_key, effort, normalized):
    monkeypatch.setattr(adapter, "_UnchainAgent", _RawAgent)
    path = tmp_path / "context_v2.sqlite3"
    sqlite3.connect(path).close()
    registry = background.MemoryBackgroundRegistry(path)
    options = {
        "custom_provider": {"id": "effortgateway", "protocol": protocol,
            "base_url": "https://gateway.invalid/v1", "auth": {"mode": "none"},
            "models": [{"id": "test-model"}]},
        "reasoningEffort": effort, "messages": ["private-prompt"],
        "callback": lambda: None, "cancel_event": threading.Event(),
    }
    selection = select_pupu_memory_agent_invoker(options=options,
        chat_provider=provider, chat_model_id="test-model",
        provider_default_resolver=lambda provider: None)
    config, retained = background.configuration_from_factory(selection.require_invoker_factory())
    registry.register("chat-effort", "unchain", config, retained)
    row = registry.page()[0]
    cached = registry.options(row)
    assert set(json.loads(row["config_json"])) == {
        "schema", "status", "reason", "provider", "model_id", "custom"}

    def payload(current_registry):
        factory = background.resolve_invoker_factory(config, current_registry.options(row))
        if protocol == "anthropic":
            # The current official raw factory does not admit the hyperspace
            # twin. Check its real payload consumer, without faking admission.
            return adapter._build_payload(provider, factory._options)
        invoker = factory(_Codec())
        agent = invoker._agent_factory(provider=provider, model_id="test-model",
            system_prompt=PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT,
            toolkit=_toolkit(), display_name="Memory Agent")
        return agent._payload

    expected = ({wire_key: {"effort": normalized}}
                if wire_key and normalized and not (
                    protocol == "anthropic" and normalized == "minimal") else {})
    assert payload(registry) == expected
    assert set(cached) == ({"custom_provider", "reasoningEffort"}
                           if isinstance(effort, str) else {"custom_provider"})
    # Repeat registration/retry preserves the projection, without retaining request state.
    registry.register("chat-effort", "unchain", config, retained)
    assert payload(registry) == expected
    # Custom configuration is transient: a cold registry must wait for refresh.
    cold = background.MemoryBackgroundRegistry(path)
    unavailable = background.resolve_invoker_factory(config, cold.options(row))
    assert unavailable.reason == "memory_background_provider_configuration_unavailable"
    cold.register("chat-effort", "unchain", config, retained)
    assert payload(cold) == expected
    assert b"private-prompt" not in path.read_bytes()
    assert b"reasoningEffort" not in path.read_bytes()
