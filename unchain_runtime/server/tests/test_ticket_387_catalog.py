"""#387: installed-wheel catalog, host payload and legacy-tool admission."""
from __future__ import annotations

import json
import os
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import pytest

import app as host_app
import routes
import unchain_adapter as adapter
from computer_use_capabilities import resolve_computer_use_capability
from unchain.providers import AnthropicModelIO, ModelTurnRequest, OpenAIModelIO

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "src/SERVICEs/__fixtures__/ticket_387_catalog.json"
MODELS = {
    "gpt-6.1-sol": ("openai", ["low", "medium", "high", "xhigh", "max"], "medium"),
    "gpt-6.1-terra": ("openai", ["none", "low", "medium", "high", "xhigh", "max"], "medium"),
    "claude-sonnet-5-5": ("anthropic", ["low", "medium", "high", "xhigh", "max"], "high"),
    "claude-haiku-5-5": ("anthropic", ["low", "medium", "high", "xhigh", "max"], "medium"),
    "claude-fable-5-2": ("anthropic", ["low", "medium", "high", "xhigh", "max"], "high"),
}


@pytest.mark.parametrize("model", list(MODELS)[2:])
@pytest.mark.parametrize("suffix", ["", "-20261109", "@20261109"])
def test_new_claude_never_inherits_legacy_computer_protocol(model, suffix):
    assert resolve_computer_use_capability("anthropic", model + suffix) == {
        "supported": False, "mode": "unsupported", "protocol": "",
        "stability": "stable", "reason": "unsupported_model",
    }
    with (
        mock.patch.object(adapter, "_computer_use_enabled", return_value=True),
        mock.patch("computer_control.toolkit.ComputerToolkit", side_effect=AssertionError("legacy toolkit must not be built")),
    ):
        assert adapter._build_selected_toolkits({
            "provider": "anthropic", "model": model + suffix, "toolkits": ["builtin.computer"],
        }) == []


@pytest.mark.parametrize("model", ["claude-sonnet-5", "claude-sonnet-5-20260901", "claude-opus-4-8"])
def test_existing_computer_routes_remain_supported(model):
    result = resolve_computer_use_capability("anthropic", model)
    assert result["supported"] is True
    assert result["protocol"] == "anthropic.computer_20251124"


def _host_catalog(model, provider):
    with (
        mock.patch.object(adapter, "_fetch_ollama_models", return_value=[]),
        mock.patch.object(routes, "get_runtime_config", return_value={"provider": provider, "model": model}),
    ):
        response = host_app.create_app().test_client().get("/models/catalog")
    assert response.status_code == 200
    catalog = response.get_json()
    assert set(catalog) == {"active", "providers", "embedding_providers", "model_capabilities"}
    model_id = f"{provider}:{model}"
    assert model in catalog["providers"][provider]
    assert catalog["active"]["model_id"] == model_id
    return {
        "active": catalog["active"], "providers": {provider: [model]},
        "embedding_providers": {},
        "model_capabilities": {model_id: catalog["model_capabilities"][model_id]},
    }


def test_real_host_catalog_and_efforts_match_renderer_fixture():
    actual = {}
    for model, (provider, efforts, default) in MODELS.items():
        catalog = _host_catalog(model, provider)
        model_id = f"{provider}:{model}"
        cap = catalog["model_capabilities"][model_id]
        assert cap["reasoning_efforts"] == efforts
        assert cap["default_reasoning_effort"] == default
        assert cap["max_context_window_tokens"] == (1_050_000 if provider == "openai" else 1_000_000)
        assert cap["input_modalities"] == (["text", "image"] if provider == "openai" else ["text", "image", "pdf"])
        assert cap["computer_use"]["supported"] is False
        assert adapter._parse_model_overrides({"model": model_id}) == {"provider": provider, "model": model}
        key = "reasoning" if provider == "openai" else "output_config"
        payloads = {}
        for effort in [*efforts, "minimal", "invalid"]:
            payload = adapter._build_payload(provider, {"modelId": model_id, "reasoningEffort": effort}, model=model)
            assert payload == {key: {"effort": effort if effort in efforts else default}}
            payloads[effort] = payload
        actual[model_id] = {"catalog": catalog, "payloads": payloads}
    if os.environ.get("TICKET387_EXPORT_FIXTURE") == "1":
        FIXTURE.write_text(json.dumps(actual, indent=2, sort_keys=True) + "\n")
    assert actual == json.loads(FIXTURE.read_text())


def test_recipe_offers_new_models_without_removing_existing_defaults():
    source = (ROOT / "src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js").read_text()
    for model, (provider, _, _) in MODELS.items():
        model_id = f"{provider}:{model}"
        assert f'{{ value: "{model_id}", label: "{model_id}" }}' in source
    assert adapter._provider_default_model("openai") == "gpt-5"
    assert adapter._provider_default_model("anthropic") == "claude-sonnet-4"


@pytest.mark.parametrize("model,effort", [
    (model, effort) for model, (_, efforts, _) in MODELS.items() for effort in efforts
])
def test_real_host_effort_producer_reaches_strict_sdk_transport(model, effort):
    provider = MODELS[model][0]
    model_id = f"{provider}:{model}"
    payload = adapter._build_payload(provider, {
        "modelId": model_id, "reasoningEffort": effort, "temperature": 0.2, "maxTokens": 64,
    }, model=model)
    # Persisted old settings and unrecognized root extensions are projected out.
    payload.update({"top_p": 0.3, "top_k": 4, "thinking": {"type": "disabled"}, "extension": True})
    if provider == "anthropic":
        payload["tool_choice"] = {"type": "any"}
    sent, events = [], []

    @contextmanager
    def send(**wire):
        if provider == "openai":
            assert set(wire) == {"model", "input", "stream", "instructions", "max_output_tokens",
                                 "truncation", "store", "include", "reasoning"}
            assert wire["reasoning"] == {"effort": effort}
            assert wire["max_output_tokens"] == 64
            assert wire["include"] == ["reasoning.encrypted_content"]
            output = [SimpleNamespace(type="response.completed", response=SimpleNamespace(
                id="resp-contract", usage={"input_tokens": 1, "output_tokens": 1},
                output=[{"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "ok"}]}],
            ))]
        else:
            assert set(wire) == {"model", "messages", "max_tokens", "output_config"}
            assert wire["output_config"] == {"effort": effort}
            assert wire["max_tokens"] == 64
            output = [SimpleNamespace(type="content_block_delta", index=0,
                                      delta=SimpleNamespace(type="text_delta", text="ok")),
                      SimpleNamespace(type="content_block_stop", index=0)]
        assert wire["model"] == model
        sent.append(wire)
        yield iter(output)

    def factory(**_settings):
        return SimpleNamespace(responses=SimpleNamespace(create=send), messages=SimpleNamespace(stream=send))

    io_type = OpenAIModelIO if provider == "openai" else AnthropicModelIO
    result = io_type(model=model, api_key="fixture", client_factory=factory).fetch_turn(ModelTurnRequest(
        messages=[{"role": "user", "content": "hello"}], payload=payload,
        emit_stream=True, callback=events.append,
    ))
    assert result.final_text == "ok"
    assert len(sent) == 1
