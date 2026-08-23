from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


import memory_factory  # noqa: E402
import unchain_adapter as ua  # noqa: E402


def _shadow_admission() -> SimpleNamespace:
    return SimpleNamespace(is_active=False, is_shadow=True, mode="shadow")


def _durability_only_status(*, available: bool = True) -> dict[str, object]:
    return {
        "kind": "legacy_context",
        "requested": False,
        "required": True,
        # The deprecated aggregate fields retain Legacy-context semantics.
        # Durable gates must use the explicit availability below.
        "available": False,
        "reason": "",
        "durability_available": available,
        "durability_reason": "" if available else "durable_runtime_unavailable",
        "legacy_context_available": False,
        "legacy_context_reason": "",
    }


def _active_status() -> dict[str, object]:
    return {
        "kind": "v2_durability",
        "requested": True,
        "required": True,
        "available": True,
        "reason": "",
        "durability_available": True,
        "durability_reason": "",
        "legacy_context_available": False,
        "legacy_context_reason": "",
    }


def _unavailable_active_status() -> dict[str, object]:
    status = _active_status()
    status.update(
        {
            "available": False,
            "reason": "durable_runtime_unavailable",
            "durability_available": False,
            "durability_reason": "durable_runtime_unavailable",
        }
    )
    return status


class MemoryV2DurabilityAvailabilityTests(unittest.TestCase):
    def test_shadow_durable_interactions_use_kernel_without_legacy_context(self):
        durable_runtime = object()
        options = {
            "memory_enabled": False,
            "durable_interactions_required": True,
        }

        with mock.patch.object(
            memory_factory,
            "create_memory_manager_with_diagnostics",
            side_effect=AssertionError("disabled Legacy memory must not initialize"),
        ) as legacy_factory, mock.patch.object(
            memory_factory,
            "create_durable_kernel_runtime_with_diagnostics",
            return_value=(durable_runtime, ""),
        ) as durable_factory:
            status, runtime = ua._resolve_memory_runtime(
                options,
                session_id="session-shadow",
                memory_v2_admission=_shadow_admission(),
            )

        self.assertIs(runtime, durable_runtime)
        self.assertTrue(status["durability_available"])
        self.assertFalse(status["legacy_context_available"])
        self.assertEqual(status["durability_reason"], "")
        legacy_factory.assert_not_called()
        durable_factory.assert_called_once_with(
            {
                "memory_enabled": True,
                "durable_interactions_required": True,
            },
            session_id="session-shadow",
        )

    def test_full_legacy_manager_satisfies_both_availability_contracts(self):
        legacy_manager = object()
        options = {
            "memory_enabled": True,
            "durable_interactions_required": True,
        }

        with mock.patch.object(
            memory_factory,
            "create_memory_manager_with_diagnostics",
            return_value=(legacy_manager, ""),
        ) as legacy_factory, mock.patch.object(
            memory_factory,
            "create_durable_kernel_runtime_with_diagnostics",
            side_effect=AssertionError("full manager already provides durability"),
        ) as durable_factory:
            status, runtime = ua._resolve_memory_runtime(
                options,
                session_id="session-legacy",
                memory_v2_admission=_shadow_admission(),
            )

        self.assertIs(runtime, legacy_manager)
        self.assertTrue(status["durability_available"])
        self.assertTrue(status["legacy_context_available"])
        legacy_factory.assert_called_once_with(
            options,
            session_id="session-legacy",
        )
        durable_factory.assert_not_called()

    def test_normal_durable_gate_uses_durability_availability(self):
        class FakeAgent:
            provider = "openai"
            model = "gpt-5"
            _toolkits = []
            _memory_runtime = _durability_only_status()

            def __init__(self):
                self.run_called = False

            def run(self, **_kwargs):
                self.run_called = True
                return SimpleNamespace(
                    messages=[{"role": "assistant", "content": "done"}],
                    consumed_tokens=0,
                    input_tokens=0,
                    output_tokens=0,
                    status="completed",
                    iteration=0,
                    previous_response_id=None,
                )

        agent = FakeAgent()
        with mock.patch.object(ua, "_create_agent", return_value=agent), \
            mock.patch.object(ua, "save_resume_context") as save_context, \
            mock.patch.object(
                ua,
                "get_pending_interaction",
                return_value={"status": "none"},
            ):
            events = list(
                ua.stream_chat_events(
                    message="hello",
                    history=[],
                    attachments=[],
                    options={"durable_interactions_required": True},
                    session_id="session-shadow",
                )
            )

        self.assertTrue(agent.run_called)
        save_context.assert_called_once()
        self.assertTrue(
            any(event.get("type") == "final_message" for event in events)
        )

    def test_active_durability_does_not_request_legacy_context(self):
        class FakeAgent:
            provider = "openai"
            model = "gpt-5"
            _toolkits = []
            _memory_runtime = _active_status()
            _memory_v2_admission = SimpleNamespace(is_active=True)

            def __init__(self):
                self.run_called = False

            def run(self, **_kwargs):
                self.run_called = True
                return SimpleNamespace(
                    messages=[{"role": "assistant", "content": "done"}],
                    consumed_tokens=0,
                    input_tokens=0,
                    output_tokens=0,
                    status="completed",
                    iteration=0,
                    previous_response_id=None,
                )

        agent = FakeAgent()
        with mock.patch.object(
            ua,
            "_load_recipe_from_options",
            return_value=None,
        ), mock.patch.object(
            ua,
            "_create_agent",
            return_value=agent,
        ), mock.patch.object(
            ua,
            "_build_memory_v2_tool_runtime_config",
            return_value={},
        ), mock.patch.object(
            ua,
            "_persist_memory_v2_run_started",
        ), mock.patch.object(
            ua,
            "_persist_memory_v2_semantic_event",
        ), mock.patch.object(
            ua,
            "_finalize_memory_v2_curator",
        ), mock.patch.object(
            ua,
            "_build_bundle_from_result",
            return_value={},
        ):
            events = list(
                ua.stream_chat_events(
                    message="hello",
                    history=[],
                    attachments=[],
                    options={},
                    session_id="session-active",
                )
            )

        self.assertTrue(agent.run_called)
        self.assertFalse(any(event.get("type") == "error" for event in events))

    def test_active_durability_fails_closed_even_without_renderer_flag(self):
        class FakeAgent:
            provider = "openai"
            model = "gpt-5"
            _toolkits = []
            _memory_runtime = _unavailable_active_status()
            _memory_v2_admission = SimpleNamespace(is_active=True)

            def run(self, **_kwargs):
                raise AssertionError("provider must not run without durability")

        with mock.patch.object(
            ua,
            "_load_recipe_from_options",
            return_value=None,
        ), mock.patch.object(ua, "_create_agent", return_value=FakeAgent()):
            with self.assertRaisesRegex(
                ua.DurableInteractionHostError,
                "durable_runtime_unavailable",
            ):
                list(
                    ua.stream_chat_events(
                        message="hello",
                        history=[{"role": "user", "content": "old"}],
                        attachments=[],
                        options={},
                        session_id="session-active",
                    )
                )

    def test_resume_gate_uses_durability_availability(self):
        class FakeAgent:
            provider = "openai"
            model = "gpt-5"
            _display_model = "openai:gpt-5"
            _orchestration_role = "developer"
            _orchestration_next_mode = "default"
            _toolkits = []
            _memory_runtime = _durability_only_status()

            def __init__(self):
                self.resume_called = False

            def resume_interaction(self, **_kwargs):
                self.resume_called = True
                return SimpleNamespace(
                    messages=[{"role": "assistant", "content": "resumed"}],
                    consumed_tokens=0,
                    input_tokens=0,
                    output_tokens=0,
                    status="completed",
                    iteration=0,
                    previous_response_id=None,
                )

        pending = {
            "status": "receipt_recorded",
            "session_id": "session-shadow",
            "interaction_id": "interaction-1",
            "source_run_id": "run-original",
            "provider": "openai",
            "model": "gpt-5",
            "resume_available": True,
        }
        agent = FakeAgent()
        with mock.patch.object(
            ua,
            "get_pending_interaction",
            side_effect=[pending, {"status": "none"}],
        ), mock.patch.object(
            ua,
            "resolve_resume_options",
            return_value={
                "modelId": "openai:gpt-5",
                "memory_enabled": False,
                "durable_interactions_required": True,
            },
        ), mock.patch.object(
            ua,
            "_create_agent",
            return_value=agent,
        ), mock.patch.object(
            ua,
            "save_resume_context",
        ), mock.patch.object(
            ua,
            "clear_resume_context",
        ):
            events = list(
                ua.resume_chat_interaction_events(
                    session_id="session-shadow",
                    interaction_id="interaction-1",
                )
            )

        self.assertTrue(agent.resume_called)
        self.assertTrue(
            any(event.get("type") == "final_message" for event in events)
        )


if __name__ == "__main__":
    unittest.main()
