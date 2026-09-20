"""Every built-in Ollama request carries the window the compiler budgets with (#227).

#265 gave *uncatalogued* local models a finite window on both sides. A model
with a catalog entry (deepseek-r1:14b declares 128k) still inherited the
daemon default, so the compiler admitted ~128k of context while Ollama
silently dropped everything past its own default. These tests pin the rule:
PuPu requests one documented window from Ollama, the compiler budgets to the
same number, and the catalog can only lower it, never raise it.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import unchain_adapter as adapter
from unchain.context import ContextCompiler, ContextCompileRequest
from unchain.context.budget import resolve_context_budget
from unchain.providers import OllamaModelIO
from unchain.providers.base import ModelTurnRequest
from unchain.providers.prepared_request_factory import (
    resolve_prepared_provider_request_payload,
)
from unchain.runtime.payloads import load_default_payloads, load_model_capabilities
from unchain.tools import Tool, Toolkit

PUPU_WINDOW = adapter._OLLAMA_DEFAULT_CONTEXT_WINDOW_TOKENS


def _catalog(monkeypatch, declared):
    entries = {}
    if declared is not None:
        entries["local-model"] = {
            "provider": "ollama",
            "max_context_window_tokens": declared,
        }
    monkeypatch.setattr(adapter, "_load_raw_capability_catalog", lambda: entries)


@pytest.mark.parametrize("declared", [65_536, 128_000, 131_072, 1_000_000])
def test_catalogued_window_above_pupu_window_is_capped(monkeypatch, declared):
    _catalog(monkeypatch, declared)
    assert adapter.get_max_context_window_tokens("ollama", "local-model") == PUPU_WINDOW


@pytest.mark.parametrize(
    ("declared", "expected_window"),
    [(None, PUPU_WINDOW), (16_384, 16_384), (128_000, PUPU_WINDOW)],
)
@pytest.mark.parametrize("max_tokens", [None, 512])
def test_builtin_request_carries_the_compiler_window(
    monkeypatch, declared, expected_window, max_tokens
):
    _catalog(monkeypatch, declared)
    options = {"modelId": "ollama:local-model"}
    if max_tokens is not None:
        options["maxTokens"] = max_tokens
    payload = adapter._build_payload("ollama", options, model="local-model")
    expected = {"num_ctx": expected_window}
    if max_tokens is not None:
        expected["num_predict"] = max_tokens
    assert payload == expected
    assert payload["num_ctx"] == adapter.get_max_context_window_tokens("ollama", "local-model")


def test_custom_ollama_protocol_provider_keeps_its_own_contract(monkeypatch):
    _catalog(monkeypatch, 128_000)
    options = {
        "modelId": "custom.remote-ollama:local-model",
        "custom_provider": {
            "id": "remote-ollama",
            "display_name": "Remote Ollama",
            "protocol": "ollama",
            "base_url": "http://gpu-box:11434",
            "auth": {"mode": "none"},
            "models": [{"id": "local-model"}],
        },
        "maxTokens": 100,
    }
    cfg = adapter.parse_custom_provider(options)
    assert cfg is not None, "fixture must resolve to a custom provider"
    payload = adapter._build_payload("ollama", options)
    assert "num_ctx" not in payload
    assert payload == {"num_predict": 100}


def test_other_providers_never_receive_num_ctx(monkeypatch):
    _catalog(monkeypatch, None)
    for provider in ("openai", "anthropic", "gemini"):
        payload = adapter._build_payload(provider, {"modelId": f"{provider}:any"}, model="any")
        assert "num_ctx" not in payload


def _real_catalogued_model():
    """The one catalogued Ollama model shipped in unchain's resources."""
    capabilities = load_model_capabilities()
    candidates = [
        name
        for name, caps in capabilities.items()
        if str(caps.get("provider", "")).lower() == "ollama"
        and int(caps.get("max_context_window_tokens") or 0) > PUPU_WINDOW
    ]
    if not candidates:
        pytest.skip("unchain catalog no longer ships an Ollama model declared above PuPu's window")
    return sorted(candidates)[0], capabilities


def _allowed_defaults(model, capabilities):
    defaults = dict(load_default_payloads().get(model, {}))
    allowed = set(capabilities[model].get("allowed_payload_keys") or [])
    return {key: value for key, value in defaults.items() if key in allowed}


@pytest.mark.parametrize("with_tools", [False, True])
def test_real_catalogued_model_wire_carries_window_with_catalog_defaults(with_tools):
    model, capabilities = _real_catalogued_model()
    declared = adapter._catalog_model_context_window("ollama", model)
    assert declared > PUPU_WINDOW, "precondition: the catalog declares more than PuPu requests"
    window = adapter.get_max_context_window_tokens("ollama", model)
    assert window == PUPU_WINDOW
    payload = adapter._build_payload("ollama", {"modelId": "ollama:" + model}, model=model)
    assert payload == {"num_ctx": window}

    expected_options = {**_allowed_defaults(model, capabilities), "num_ctx": window}
    # The real catalog decides whether tool schemas reach the wire for this
    # model; the window must be present either way.
    tools_on_wire = with_tools and bool(capabilities[model].get("supports_tools", True))
    calls = []
    toolkit = Toolkit()
    if with_tools:
        toolkit.register(Tool.from_callable(lambda: "ready", name="probe_status"))

    class Response:
        status_code = 200

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            pass

        def raise_for_status(self):
            pass

        def iter_lines(self):
            yield json.dumps({"message": {"role": "assistant", "content": "OK"}, "done": True})

    def strict_consumer(method, url, *, json, timeout):
        assert method == "POST" and url.endswith("/api/chat")
        expected_keys = {"model", "messages", "stream", "options"}
        if tools_on_wire:
            expected_keys |= {"tools", "tool_choice"}
            assert json["tools"] == toolkit.to_provider_json("ollama")
            assert json["tool_choice"] == "auto"
        assert set(json) == expected_keys
        assert json["model"] == model
        assert json["options"] == expected_options
        calls.append(json)
        return Response()

    # Constructed the way unchain's production factory does it: only model and
    # transport, so the real packaged catalog supplies defaults and allowlist.
    model_io = OllamaModelIO(model=model, stream_factory=strict_consumer)
    messages = [{"role": "user", "content": "Hello"}]
    for _ in range(2):
        compiled = ContextCompiler().compile(
            ContextCompileRequest(
                case="catalogued-local-message",
                source_messages=tuple(messages),
                provider="ollama",
                model=model,
                budget=resolve_context_budget(context_window_tokens=window),
            )
        )
        result = model_io.fetch_turn(
            ModelTurnRequest(
                messages=compiled.to_dict()["messages"],
                payload=payload,
                toolkit=toolkit,
            )
        )
        assert result.final_text == "OK"
        messages.extend(
            [
                {"role": "assistant", "content": result.final_text},
                {"role": "user", "content": "Again"},
            ]
        )
    assert len(calls) == 2


def test_durable_prepared_payload_keeps_window_and_drops_unknown_options():
    model, capabilities = _real_catalogued_model()
    payload = adapter._build_payload("ollama", {"modelId": "ollama:" + model}, model=model)
    model_io = OllamaModelIO(model=model)
    request = ModelTurnRequest(
        messages=[{"role": "user", "content": "Hello"}],
        payload={**payload, "unknown_option": True},
    )
    prepared = resolve_prepared_provider_request_payload(model_io=model_io, request=request)
    assert prepared["effective_payload"] == {
        **_allowed_defaults(model, capabilities),
        "num_ctx": PUPU_WINDOW,
    }


# ── User-chosen window (attach-panel picker, #227) ─────────────────────────


def _catalog_file(tmp_path, entries):
    path = tmp_path / "model_capabilities.json"
    path.write_text(json.dumps(entries))
    return path


def test_capability_catalog_declares_a_default_window_for_builtin_ollama_only(monkeypatch, tmp_path):
    path = _catalog_file(tmp_path, {
        "known-local": {"provider": "ollama", "max_context_window_tokens": 128_000},
        "gpt-x": {"provider": "openai", "max_context_window_tokens": 400_000},
    })
    monkeypatch.setattr(adapter, "_capability_file_candidates", lambda: [path])
    monkeypatch.setattr(adapter, "get_capability_catalog", lambda: {
        "ollama": ["known-local", "live-local:latest"], "openai": ["gpt-x"], "anthropic": [], "gemini": [],
    })
    catalog = adapter.get_model_capability_catalog()
    assert catalog["ollama:known-local"]["default_context_window_tokens"] == PUPU_WINDOW
    assert catalog["ollama:known-local"]["max_context_window_tokens"] == 128_000
    assert catalog["ollama:live-local:latest"]["default_context_window_tokens"] == PUPU_WINDOW
    assert "max_context_window_tokens" not in catalog["ollama:live-local:latest"]
    assert "default_context_window_tokens" not in catalog["openai:gpt-x"]


@pytest.mark.parametrize(
    ("declared", "requested", "expected"),
    [(None, 65_536, 65_536), (None, 4_096, 4_096), (128_000, 131_072, 128_000), (40_000, 65_536, 40_000), (128_000, 16_384, 16_384)],
)
def test_requested_window_reaches_wire_and_budget_together(monkeypatch, declared, requested, expected):
    _catalog(monkeypatch, declared)
    options = {"modelId": "ollama:local-model", "contextWindow": requested}
    payload = adapter._build_payload("ollama", options, model="local-model")
    assert payload == {"num_ctx": expected}
    assert adapter.get_max_context_window_tokens("ollama", "local-model", options=options) == expected


def test_requested_window_applies_only_to_the_selected_model(monkeypatch):
    _catalog(monkeypatch, None)
    options = {"modelId": "ollama:local-model", "contextWindow": 65_536}
    assert adapter.get_max_context_window_tokens("ollama", "local-model", options=options) == 65_536
    # A graph step or subagent on another local model keeps PuPu's default.
    assert adapter.get_max_context_window_tokens("ollama", "other-local", options=options) == PUPU_WINDOW
    # Other providers never see it.
    assert adapter.get_max_context_window_tokens("openai", "gpt-x", options=options) == 0
    payload = adapter._build_payload("openai", {**options, "modelId": "openai:gpt-x"}, model="gpt-x")
    assert "num_ctx" not in payload


def test_absent_request_keeps_pupu_default(monkeypatch):
    _catalog(monkeypatch, None)
    options = {"modelId": "ollama:local-model"}
    assert adapter._build_payload("ollama", options, model="local-model") == {"num_ctx": PUPU_WINDOW}
    assert adapter.get_max_context_window_tokens("ollama", "local-model", options=options) == PUPU_WINDOW


@pytest.mark.parametrize("requested", [True, "65536", 65536.0, 1_024, 2_000_000, 0, -1, [65536]])
def test_invalid_requested_window_fails_closed(monkeypatch, requested):
    _catalog(monkeypatch, None)
    options = {"modelId": "ollama:local-model", "contextWindow": requested}
    with pytest.raises(adapter.InvalidContextWindowError) as caught:
        adapter._build_payload("ollama", options, model="local-model")
    assert caught.value.code == "invalid_context_window"
    with pytest.raises(adapter.InvalidContextWindowError):
        adapter.get_max_context_window_tokens("ollama", "local-model", options=options)


def test_invalid_requested_window_is_reported_with_its_code():
    from route_chat import _normalize_stream_error
    code, message = _normalize_stream_error(adapter.InvalidContextWindowError("contextWindow must be an integer between 2048 and 1048576 tokens, got 'x'"))
    assert code == "invalid_context_window"
    assert "2048" in message and "1048576" in message


def test_real_catalogued_model_wire_carries_the_requested_window():
    model, capabilities = _real_catalogued_model()
    options = {"modelId": "ollama:" + model, "contextWindow": 65_536}
    payload = adapter._build_payload("ollama", options, model=model)
    assert payload == {"num_ctx": 65_536}
    assert adapter.get_max_context_window_tokens("ollama", model, options=options) == 65_536
    model_io = OllamaModelIO(model=model)
    request = ModelTurnRequest(messages=[{"role": "user", "content": "Hello"}], payload=payload)
    prepared = resolve_prepared_provider_request_payload(model_io=model_io, request=request)
    assert prepared["effective_payload"] == {**_allowed_defaults(model, capabilities), "num_ctx": 65_536}
