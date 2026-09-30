from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import pytest

import unchain_adapter as adapter


PREVIEW_ID = "a" * 32


def test_host_stream_forwards_ollama_preview_and_reset_without_semantic_persistence():
    persisted = []

    class Agent:
        provider = "ollama"
        model = "qwen3"
        _display_model = "ollama:qwen3"
        _memory_runtime = {
            "requested": False, "required": False,
            "available": False, "reason": "",
        }
        _memory_v2_admission = None
        _memory_v2_unchain_active_bridge = None
        _memory_v2_unchain_shadow_bridge = None
        _toolkits = []
        _max_iterations = 3
        _max_context_window_tokens = 16_384

        def run(self, **kwargs):
            callback = kwargs["callback"]
            run_id = kwargs["run_id"]
            failed = {
                "type": "reasoning", "run_id": run_id, "iteration": 1,
                "provider": "ollama", "delta": "draft",
            }
            callback.emit_provisional_reasoning(failed, PREVIEW_ID)
            callback.discard_provisional_reasoning(
                preview_id=PREVIEW_ID, run_id=run_id, iteration=1,
            )
            accepted = {**failed, "delta": "accepted"}
            callback.emit_provisional_reasoning(accepted, "b" * 32)
            callback.commit_provisional_reasoning(accepted)
            callback({
                "type": "final_message", "run_id": run_id,
                "iteration": 1, "content": "ok",
            })
            return SimpleNamespace(
                status="completed",
                messages=[{"role": "assistant", "content": "ok"}],
            )

    with mock.patch.object(adapter, "_create_agent", return_value=Agent()), \
         mock.patch.object(adapter, "_load_recipe_from_options", return_value=None), \
         mock.patch.object(adapter, "_persist_memory_v2_semantic_event", side_effect=lambda _admission, event: persisted.append(event)), \
         mock.patch.object(adapter, "_build_bundle_from_result", return_value=None), \
         mock.patch.object(adapter, "_finalize_memory_v2_curator"), \
         mock.patch.object(adapter, "register_interject_channels") as register, \
         mock.patch.object(adapter, "release_interject_channels"):
        register.return_value = SimpleNamespace(fyi=object(), digest=lambda _event: None)
        events = list(adapter.stream_chat_events(
            message="hello", history=[], attachments=[],
            options={"modelId": "ollama:qwen3"},
        ))

    assert [event["type"] for event in events] == [
        "reasoning", "reasoning_preview_discarded", "reasoning", "final_message",
    ]
    assert [event["type"] for event in persisted] == ["final_message"]


@pytest.mark.parametrize("invalid", [
    {"type": "reasoning", "run_id": "run", "iteration": 1,
     "provider": "openai", "delta": "draft",
     "provisional_reasoning_id": PREVIEW_ID},
    {"type": "reasoning", "run_id": "run", "iteration": 1,
     "provider": "ollama", "delta": "draft",
     "provisional_reasoning_id": "invalid"},
    {"type": "reasoning_preview_discarded", "run_id": "run", "iteration": 1,
     "provider": "ollama", "provisional_reasoning_id": PREVIEW_ID,
     "unexpected": True},
    {"type": "reasoning_preview_discarded", "run_id": "run", "iteration": 1,
     "provider": "ollama"},
    {"type": "reasoning", "run_id": "run", "iteration": 1,
     "provider": "ollama", "delta": "draft",
     "provisional_reasoning_id": None},
])
def test_host_rejects_malformed_provisional_event(invalid):
    with pytest.raises(ValueError, match="invalid Ollama provisional reasoning event"):
        adapter._is_ollama_reasoning_preview_event(invalid)
