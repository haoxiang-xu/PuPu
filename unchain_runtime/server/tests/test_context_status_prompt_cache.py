"""PuPu's actual optimizer stack must keep dynamic telemetry out of the prefix."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import unchain_adapter as adapter


@pytest.mark.parametrize("provider", ["openai", "anthropic", "hyperspace", "ollama", "gemini"])
@pytest.mark.parametrize("preset", ["balanced", "aggressive"])
def test_host_optimizer_stack_projects_status_only_at_request_tail(provider, preset):
    from unchain.kernel import KernelLoop
    from unchain.providers.model_turn_runtime import build_model_turn_request
    from unchain.optimizers.common import latest_user_query

    module = adapter._build_context_optimizer_module({"preset": preset})
    assert module is not None
    assert any(h.name == "context_usage" for h in module.harnesses)
    loop = KernelLoop(harnesses=list(module.harnesses))
    messages = [
        {"role": "system", "content": "Fixed project instructions"},
        {"role": "user", "content": "Explain the project"},
    ]
    state = loop.seed_state(messages)
    state.provider_state.provider = provider
    state.provider_state.max_context_window_tokens = 100000
    loop.dispatch_phase(state, phase="before_model")
    request = build_model_turn_request(state)
    assert request.messages[:-1] == messages
    assert set(request.messages[-1]) == {"role", "content"}
    assert request.messages[-1]["content"].startswith("Runtime context information")
    assert "[Context Status]" in request.messages[-1]["content"]
    assert state.latest_messages() == messages
    assert latest_user_query(state.latest_messages()) == "Explain the project"
