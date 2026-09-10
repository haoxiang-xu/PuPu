"""An uncatalogued local model needs the same finite budget on both sides."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import unchain_adapter as adapter
from unchain.context import ContextCompiler, ContextCompileRequest
from unchain.context.budget import resolve_context_budget
from unchain.context.compiler import ContextBudgetExceededError
from unchain.providers import OllamaModelIO
from unchain.providers.base import ModelTurnRequest
from unchain.tools import Tool, Toolkit


@pytest.mark.parametrize("model", ["qwen3:14b", "deepseek-r1:8b", "gemma4:e2b", "future-local:latest"])
@pytest.mark.parametrize("with_tools", [False, True])
def test_uncatalogued_ollama_window_is_finite_and_sent_to_provider(monkeypatch, model, with_tools):
    monkeypatch.setattr(adapter, "_load_raw_capability_catalog", lambda: {})
    window = adapter.get_max_context_window_tokens("ollama", model)
    assert window == 32_768
    payload = adapter._build_payload("ollama", {"modelId": "ollama:" + model}, model=model)
    assert payload == {"num_ctx": window}
    calls = []
    toolkit = Toolkit()
    if with_tools:
        toolkit.register(Tool.from_callable(lambda: "ready", name="probe_status"))

    class Response:
        status_code = 200
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def raise_for_status(self): pass
        def iter_lines(self):
            yield json.dumps({"message": {"role": "assistant", "content": "OK"}, "done": True})

    def strict_consumer(method, url, *, json, timeout):
        assert method == "POST" and url.endswith("/api/chat")
        expected_keys = {"model", "messages", "stream", "options"}
        if with_tools:
            expected_keys |= {"tools", "tool_choice"}
            assert json["tools"] == toolkit.to_provider_json("ollama")
            assert json["tool_choice"] == "auto"
        assert set(json) == expected_keys
        assert json["model"] == model
        assert json["options"] == {"num_ctx": window}
        calls.append(json)
        return Response()

    model_io = OllamaModelIO(model=model, stream_factory=strict_consumer, model_capabilities={}, default_payloads={})
    messages = [{"role": "user", "content": "Hello"}]
    for _ in range(2):
        compiled = ContextCompiler().compile(ContextCompileRequest(
            case="unknown-local-message", source_messages=tuple(messages), provider="ollama", model=model,
            budget=resolve_context_budget(context_window_tokens=window),
        ))
        result = model_io.fetch_turn(ModelTurnRequest(messages=compiled.to_dict()["messages"], payload=payload, toolkit=toolkit))
        assert result.final_text == "OK"
        messages.extend([{"role": "assistant", "content": result.final_text}, {"role": "user", "content": "Again"}])
    assert len(calls) == 2


def test_known_and_other_provider_windows_retain_their_contract(monkeypatch):
    monkeypatch.setattr(adapter, "_load_raw_capability_catalog", lambda: {
        "known-local": {"provider": "ollama", "max_context_window_tokens": 16_384},
    })
    assert adapter.get_max_context_window_tokens("ollama", "known-local") == 16_384
    assert adapter.get_max_context_window_tokens("openai", "unknown") == 0


@pytest.mark.parametrize("window", [0, -1, True, "32768", 3.5])
def test_invalid_ollama_wire_window_is_rejected(window):
    model_io = OllamaModelIO(model="unknown", model_capabilities={}, default_payloads={})
    with pytest.raises(ValueError, match="num_ctx"):
        model_io._merged_payload({"num_ctx": window})


def test_exhausted_budget_names_actual_model_and_window():
    from route_chat import _normalize_stream_error
    request = ContextCompileRequest(
        case="unknown-local-budget", source_messages=({"role": "user", "content": "Hello"},),
        provider="ollama", model="tiny-local:latest", budget=resolve_context_budget(context_window_tokens=4096),
        fixed_overhead_tokens=5000,
    )
    with pytest.raises(ContextBudgetExceededError) as caught:
        ContextCompiler().compile(request)
    code, message = _normalize_stream_error(caught.value)
    assert code == "context_budget_exceeded"
    assert "tiny-local:latest" in message and "4096" in message
    assert "tool" in message.lower() and "larger" in message.lower()
