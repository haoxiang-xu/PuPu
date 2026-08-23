import sys
from pathlib import Path
from unittest import mock

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

# Ensure unchain source is on sys.path by importing unchain_adapter first
# (its module-level _ensure_unchain_on_path() call does this; there is no
# conftest.py in this tests dir to do it for us).
import unchain_adapter as adapter  # noqa: E402

from interaction_channels import get_interject_channels  # noqa: E402


class FakeResult:
    messages = [{"role": "assistant", "content": "ok"}]
    status = "completed"
    consumed_tokens = 0
    input_tokens = 0
    output_tokens = 0
    iteration = 0
    previous_response_id = None


def _no_recipe_patch():
    # Hermeticity: _load_recipe_from_options() defaults to reading the
    # developer's local ~/.pupu/agent_recipes/Default.recipe. If that
    # happens to be a *graph* recipe on this machine, stream_chat_events
    # would divert into _stream_recipe_graph_events and never reach the
    # _create_agent()/interject-registration path this suite exercises.
    return mock.patch.object(adapter, "_load_recipe_from_options", return_value=None)


def test_stream_chat_events_registers_channels_and_releases(monkeypatch):
    seen = {}

    class FakeAgent:
        provider = "openai"

        def run(self, **kwargs):
            ch = get_interject_channels("thread-adapter-test")
            seen["registered_during_run"] = ch is not None
            if ch:
                ch.fyi.post("mid-run note")
                seen["fyi_pending"] = ch.fyi.pending_count()
            kwargs["callback"]({"type": "iteration_started", "iteration": 0})
            return FakeResult()

    monkeypatch.setattr(adapter, "_create_agent", lambda *a, **k: FakeAgent())

    with _no_recipe_patch():
        events = list(adapter.stream_chat_events(
            message="hello", history=[], options={}, session_id="thread-adapter-test",
        ))

    assert seen["registered_during_run"] is True
    assert seen["fyi_pending"] == 1
    ch_after = get_interject_channels("thread-adapter-test")
    assert ch_after is None  # finally 已释放
    assert any(e.get("type") == "iteration_started" for e in events if isinstance(e, dict))


def test_digest_receives_events(monkeypatch):
    seen = {}

    class FakeAgent:
        provider = "openai"

        def run(self, **kwargs):
            callback = kwargs["callback"]
            callback({"type": "iteration_started", "iteration": 0})
            callback({"type": "iteration_started", "iteration": 1})
            callback({"type": "iteration_started", "iteration": 2})
            ch = get_interject_channels("thread-digest-test")
            seen["summary"] = ch.digest.summary() if ch is not None else ""
            return FakeResult()

    monkeypatch.setattr(adapter, "_create_agent", lambda *a, **k: FakeAgent())

    with _no_recipe_patch():
        events = list(adapter.stream_chat_events(
            message="hello", history=[], options={}, session_id="thread-digest-test",
        ))

    assert "iterations: 3" in seen["summary"]
    assert sum(1 for e in events if isinstance(e, dict) and e.get("type") == "iteration_started") == 3


def test_interaction_module_appended(monkeypatch):
    captured = {}
    real_create_agent = adapter._create_agent

    class FakeUnchainAgent:
        def __init__(self, **kwargs):
            captured["modules"] = kwargs.get("modules")
            # _create_agent constructs the agent synchronously (in the main
            # generator, before the worker thread starts), which is *after*
            # stream_chat_events has already registered the channels for
            # this session — so the registry entry is guaranteed live here.
            ch = get_interject_channels("thread-module-test")
            captured["registry_fyi"] = ch.fyi if ch is not None else None
            self.provider = kwargs.get("provider", "openai")
            self.model = kwargs.get("model", "gpt-5")

        def run(self, **kwargs):
            kwargs["callback"]({"type": "iteration_started", "iteration": 0})
            return FakeResult()

    with _no_recipe_patch(), mock.patch.object(adapter, "_UnchainAgent", FakeUnchainAgent):
        # Use the REAL _create_agent so the fyi_channel plumbing through
        # _build_developer_agent is actually exercised end-to-end.
        monkeypatch.setattr(adapter, "_create_agent", real_create_agent)
        events = list(adapter.stream_chat_events(
            message="hello", history=[], options={}, session_id="thread-module-test",
        ))

    assert any(e.get("type") == "iteration_started" for e in events if isinstance(e, dict))
    modules = captured.get("modules") or ()
    interaction_modules = [
        m for m in modules if type(m).__name__ == "InteractionModule"
    ]
    assert len(interaction_modules) == 1
    assert captured.get("registry_fyi") is not None
    assert interaction_modules[0].fyi_channel is captured["registry_fyi"]


def test_stream_chat_events_snapshots_options_into_channels(monkeypatch):
    seen = {}

    class FakeAgent:
        provider = "openai"

        def run(self, **kwargs):
            ch = get_interject_channels("thread-options-snapshot-test")
            seen["options"] = ch.options if ch else None
            kwargs["callback"]({"type": "iteration_started", "iteration": 0})
            return FakeResult()

    monkeypatch.setattr(adapter, "_create_agent", lambda *a, **k: FakeAgent())

    run_options = {"provider": "anthropic", "modelId": "claude-x"}
    with _no_recipe_patch():
        list(adapter.stream_chat_events(
            message="hello",
            history=[],
            options=run_options,
            session_id="thread-options-snapshot-test",
        ))

    assert seen["options"] == run_options


def test_resume_chat_interaction_filters_private_memory_v2_options(monkeypatch):
    seen = {}

    class FakeResumeAgent:
        provider = "openai"
        model = "gpt-5"
        _memory_runtime = {
            "requested": True,
            "available": True,
            "reason": "",
        }
        _toolkits = []

        def resume_interaction(self, **kwargs):
            ch = get_interject_channels("thread-resume-options-test")
            seen["options"] = ch.options if ch else None
            kwargs["callback"]({"type": "iteration_started", "iteration": 0})
            return FakeResult()

    pending = {
        "status": "receipt_recorded",
        "session_id": "thread-resume-options-test",
        "interaction_id": "interaction-options-test",
        "source_run_id": "source-run-options-test",
        "provider": "openai",
        "model": "gpt-5",
        "resume_available": True,
    }
    resolved = {
        "provider": "openai",
        "modelId": "gpt-5",
        "memory_enabled": True,
        "_memory_v2_existing_private": "must-not-leak",
    }
    monkeypatch.setattr(adapter, "get_pending_interaction", lambda _session: pending)
    monkeypatch.setattr(adapter, "resolve_resume_options", lambda **_kwargs: resolved)
    monkeypatch.setattr(adapter, "_create_agent", lambda *a, **k: FakeResumeAgent())
    monkeypatch.setattr(adapter, "save_resume_context", lambda **_kwargs: None)
    monkeypatch.setattr(
        adapter,
        "_cleanup_durable_resume_contexts",
        lambda *_args, **_kwargs: None,
    )

    with _no_recipe_patch():
        list(
            adapter.resume_chat_interaction_events(
                session_id="thread-resume-options-test",
                interaction_id="interaction-options-test",
                options={
                    "_memory_v2_requested": True,
                    "_memory_v2_owner_chat_id": "owner-options-test",
                    "_memory_v2_memory_agent_config": {"model": "gpt-5"},
                },
            )
        )

    assert seen["options"]["provider"] == "openai"
    assert seen["options"]["modelId"] == "gpt-5"
    assert seen["options"]["memory_enabled"] is True
    assert not any(str(key).startswith("_") for key in seen["options"])


def test_setup_failure_before_worker_start_releases_registry(monkeypatch):
    # Regression test: if anything in the setup span between
    # register_interject_channels() and worker.start() raises (agent
    # creation, payload building, toolkit indexing, etc.), the registry
    # entry must not leak — no zombie InterjectChannels, no permanently
    # leaked anonymous fallback key. Simulate the failure at _create_agent,
    # the earliest step in that span.
    monkeypatch.setattr(
        adapter,
        "_create_agent",
        mock.Mock(side_effect=RuntimeError("boom during agent creation")),
    )

    with _no_recipe_patch():
        with pytest.raises(RuntimeError, match="boom during agent creation"):
            list(adapter.stream_chat_events(
                message="hello",
                history=[],
                options={},
                session_id="thread-setup-failure-test",
            ))

    assert get_interject_channels("thread-setup-failure-test") is None
