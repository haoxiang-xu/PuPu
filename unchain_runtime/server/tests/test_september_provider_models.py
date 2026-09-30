"""Catalog and renderer-to-provider contracts for PuPu #354.

Run with UNCHAIN_SOURCE_PATH pointing at the site-packages containing the
candidate wheel. The JSON fixture is checked against the real JS producer by
september_provider_models.test.js.
"""
import copy
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_ROOT))
import unchain_adapter as adapter
import custom_provider as cp
from unchain.providers import ModelTurnRequest
from unchain.runtime.payloads import load_model_capabilities
from unchain.tools import Toolkit

MODELS = [
    ("openai", "gpt-6-sol", "medium"),
    ("openai", "gpt-6-luna", "medium"),
    ("anthropic", "claude-opus-5-5", "medium"),
    ("anthropic", "claude-sonnet-5", "high"),
    ("gemini", "gemini-3.7-flash", "medium"),
    ("gemini", "gemini-3.8-flash", "medium"),
    ("gemini", "gemini-3.5-flash-lite", "minimal"),
]


@pytest.mark.parametrize("provider,model,default", MODELS)
def test_installed_native_catalog_reaches_picker_and_effort_payload(provider, model, default):
    with mock.patch.object(adapter, "_fetch_ollama_models", return_value=[]):
        entry = adapter.get_model_capability_catalog()[f"{provider}:{model}"]
    caps = load_model_capabilities()[model]
    assert entry["default_reasoning_effort"] == default
    assert entry["max_context_window_tokens"] == caps["max_context_window_tokens"]
    assert entry["input_modalities"] == caps["input_modalities"]
    for selected in [*caps["reasoning_efforts"], "not-a-level"]:
        effort = selected if selected in caps["reasoning_efforts"] else default
        payload = adapter._build_payload(provider, {"reasoningEffort": selected}, model=model)
        if provider == "openai":
            assert payload == {"reasoning": {"effort": effort}}
        elif provider == "anthropic":
            assert payload == {"output_config": {"effort": effort}}
        else:
            assert payload == {"thinking_config": {"thinking_level": effort, "include_thoughts": True}}


def _deepseek_config():
    fixture = SERVER_ROOT.parents[1] / "src/SERVICEs/__fixtures__/deepseek_flash_injection.json"
    return cp.parse_custom_provider({"custom_provider": json.loads(fixture.read_text())})


class _Stream:
    def __enter__(self):
        return iter([
            SimpleNamespace(type="content_block_delta", index=0,
                            delta=SimpleNamespace(type="text_delta", text="ok")),
            SimpleNamespace(type="content_block_stop", index=0),
        ])

    def __exit__(self, *args):
        return False


def test_deepseek_producer_fixture_reaches_real_runtime_text_image_and_tool_wire():
    cfg = _deepseek_config()
    assert cfg.base_url == "https://api.deepseek.com/anthropic"
    assert cfg.default_model_id() == "deepseek-v4-flash"
    assert cfg.models["deepseek-flash"]["capabilities"]["supports_vision"] is True
    assert cfg.models["deepseek-flash"]["capabilities"]["max_tokens"] == 384000
    requests = []

    def consume(**wire):
        assert set(wire) == {"model", "messages", "max_tokens", "thinking", "tools"}
        assert wire["model"] == "deepseek-flash"
        assert wire["thinking"] == {"type": "disabled"}
        assert wire["max_tokens"] == 32768
        assert wire["tools"][0]["name"] == "lookup"
        requests.append(copy.deepcopy(wire))
        return _Stream()

    client = SimpleNamespace(messages=SimpleNamespace(stream=consume))
    with mock.patch("anthropic.Anthropic", return_value=client) as constructor:
        io = cp.make_custom_model_io_factory(cfg, "fixture-key")(
            SimpleNamespace(provider=cfg.twin, model="deepseek-flash", api_key=None), None,
        )
        toolkit = Toolkit()

        def lookup(query: str):
            return query

        toolkit.register(lookup, name="lookup")
        messages = [{"role": "user", "content": "hello"}]
        io.fetch_turn(ModelTurnRequest(messages=messages, toolkit=toolkit))
        messages += [
            {"role": "assistant", "content": "ok"},
            {"role": "user", "content": [
                {"type": "text", "text": "Describe this"},
                {"type": "image", "source": {"type": "url", "url": "https://example.com/image.png"}},
            ]},
        ]
        io.fetch_turn(ModelTurnRequest(messages=messages, toolkit=toolkit))
        assert constructor.call_args.kwargs["base_url"] == cfg.base_url
    assert len(requests) == 2
    assert requests[1]["messages"][-1]["content"][1]["type"] == "image"
    with pytest.raises(cp.CustomProviderError, match="not declared"):
        cp.make_custom_model_io_factory(cfg, "fixture-key")(
            SimpleNamespace(provider=cfg.twin, model="unverified-model", api_key=None), None,
        )
