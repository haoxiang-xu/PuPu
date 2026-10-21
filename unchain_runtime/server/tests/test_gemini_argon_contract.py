"""#411 host contracts; pair qualification points UNCHAIN_SOURCE_PATH at site-packages."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import pytest
from google.genai import types

import app as host_app
import routes
import unchain_adapter as adapter
from unchain.providers import GeminiModelIO, ModelTurnRequest
from unchain.tools import Toolkit

MODEL = "gemini-4-argon"
MODEL_ID = f"gemini:{MODEL}"
ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "src/SERVICEs/__fixtures__/gemini_argon_catalog.json"


def _catalog_response():
    with (
        mock.patch.object(adapter, "_fetch_ollama_models", return_value=[]),
        mock.patch.object(routes, "get_runtime_config", return_value={"provider": "gemini", "model": MODEL}),
    ):
        response = host_app.create_app().test_client().get("/models/catalog")
    assert response.status_code == 200
    result = response.get_json()
    assert set(result) == {"active", "providers", "embedding_providers", "model_capabilities"}
    assert MODEL in result["providers"]["gemini"]
    # A slice of the real route output keeps unrelated catalog additions out of
    # this fixture, while retaining the exact Argon capability producer record.
    return {
        "active": result["active"],
        "providers": {"gemini": [MODEL]},
        "embedding_providers": {},
        "model_capabilities": {MODEL_ID: result["model_capabilities"][MODEL_ID]},
    }


def test_argon_real_route_and_host_payloads_match_renderer_fixture():
    catalog = _catalog_response()
    assert catalog["active"]["model_id"] == MODEL_ID
    cap = catalog["model_capabilities"][MODEL_ID]
    assert cap["reasoning_efforts"] == ["low", "medium", "high"]
    assert cap["default_reasoning_effort"] == "medium"
    assert cap["max_context_window_tokens"] == 1_048_576
    assert cap["input_modalities"] == ["text", "image", "pdf"]
    assert adapter._parse_model_overrides({"model": MODEL_ID}) == {"provider": "gemini", "model": MODEL}
    assert adapter._provider_default_model("gemini") == "gemini-3.6-flash"
    payloads = {
        effort: adapter._build_payload("gemini", {"modelId": MODEL_ID, "reasoningEffort": effort}, model=MODEL)
        for effort in ["low", "medium", "high", "minimal", "max", "invalid"]
    }
    for effort, payload in payloads.items():
        assert payload == {"thinking_config": {
            "thinking_level": effort if effort in {"low", "medium", "high"} else "medium",
            "include_thoughts": True,
        }}
    actual = {"catalog": catalog, "payloads": payloads}
    if os.environ.get("TICKET411_EXPORT_FIXTURE") == "1":
        FIXTURE.write_text(json.dumps(actual, indent=2, sort_keys=True) + "\n")
    assert actual == json.loads(FIXTURE.read_text())


@pytest.mark.parametrize("effort", ["low", "medium", "high"])
def test_argon_real_host_producer_to_pinned_sdk_strict_stream_consumer(effort):
    sent, events = [], []
    payload = adapter._build_payload("gemini", {
        "modelId": MODEL_ID, "reasoningEffort": effort, "maxTokens": 65_536, "temperature": 0.2,
    }, model=MODEL)
    # Prove settings from an older chat cannot escape model-specific projection.
    payload.update({"top_p": 0.2, "top_k": 3, "cached_content": "caches/no", "background": True, "unknown": True})

    def factory(**settings):
        assert settings == {"api_key": "test-key", "http_options": {
            "timeout": 900_000, "retry_options": {"attempts": 1},
        }}

        def send(**wire):
            assert set(wire) == {"model", "contents", "config"}
            assert wire["model"] == MODEL
            config = wire["config"].model_dump(mode="json", exclude_unset=True, exclude_none=True)
            assert set(config) == {"max_output_tokens", "thinking_config", "automatic_function_calling", "tools"}
            assert config["max_output_tokens"] == 65_536
            assert config["thinking_config"] == {"thinking_level": effort.upper(), "include_thoughts": True}
            assert config["automatic_function_calling"] == {"disable": True}
            assert config["tools"][0]["function_declarations"][0]["name"] == "lookup"
            assert wire["contents"][-1].parts[-1].inline_data.mime_type == "image/png"
            sent.append(copy.deepcopy(wire))
            return iter([types.GenerateContentResponse.model_validate({"candidates": [{
                "content": {"role": "model", "parts": [
                    {"text": "ok"},
                    {"thought_signature": "c2ln", "function_call": {"id": "call-1", "name": "lookup", "args": {"query": "x"}}},
                ]}, "finish_reason": "STOP",
            }]})])

        return SimpleNamespace(models=SimpleNamespace(generate_content_stream=send), close=lambda: None)

    toolkit = Toolkit()

    def lookup(query: str):
        return query

    toolkit.register(lookup, name="lookup")
    result = GeminiModelIO(model=MODEL, api_key="test-key", client_factory=factory).fetch_turn(ModelTurnRequest(
        messages=[{"role": "user", "content": [
            {"type": "text", "text": "describe"},
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "aW1n"}},
        ]}], payload=payload, toolkit=toolkit, emit_stream=True, callback=events.append,
    ))
    assert result.final_text == "ok"
    assert result.tool_calls[0].name == "lookup"
    assert result.tool_calls[0].call_id == "call-1"
    assert len(sent) == 1
    assert [item["delta"] for item in events if item["type"] == "token_delta"] == ["ok"]


@pytest.mark.parametrize("limit", [65_537, 1_048_576, 0, -1])
def test_argon_host_output_request_above_synchronous_contract_never_sends(limit):
    payload = adapter._build_payload("gemini", {"modelId": MODEL_ID, "maxTokens": limit}, model=MODEL)
    io = GeminiModelIO(model=MODEL, api_key="test-key", client_factory=lambda **_: pytest.fail("must not create client"))
    with pytest.raises(ValueError, match="Argon"):
        io.fetch_turn(ModelTurnRequest(messages=[{"role": "user", "content": "hello"}], payload=payload))


def test_argon_recipe_can_select_exact_catalog_model():
    source = (ROOT / "src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js").read_text()
    assert f'{{ value: "{MODEL_ID}", label: "{MODEL_ID}" }}' in source
    with mock.patch.object(adapter, "_fetch_ollama_models", return_value=[]):
        assert MODEL in adapter.get_capability_catalog()["gemini"]
