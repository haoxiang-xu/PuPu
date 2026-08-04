import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import execution_control  # noqa: E402
import memory_v2_runtime as memory_v2_runtime_module  # noqa: E402
from context_memory_v2_capability import (  # noqa: E402
    ContextMemoryV2CapabilityVerdict,
)
from memory_v2_runtime import MemoryV2Runtime  # noqa: E402
from memory_v2_store import MemoryV2Store  # noqa: E402
import unchain_adapter as ua  # noqa: E402


_CAPABILITY_PATCHER = None


def setUpModule() -> None:
    global _CAPABILITY_PATCHER
    _CAPABILITY_PATCHER = mock.patch(
        "memory_v2_context.resolve_context_memory_v2_capability",
        return_value=ContextMemoryV2CapabilityVerdict(
            ready=True,
            reason="unchain_context_memory_ready",
            verification="exact_sha",
            immutable=True,
            unchain_revision="a" * 40,
        ),
    )
    _CAPABILITY_PATCHER.start()


def tearDownModule() -> None:
    if _CAPABILITY_PATCHER is not None:
        _CAPABILITY_PATCHER.stop()


class _FakeAgent:
    provider = "openai"
    model = "gpt-test"
    _memory_runtime = {"requested": False, "available": False, "reason": ""}
    _memory_v2_admission = None
    _toolkits = []
    _max_iterations = 3
    _max_context_window_tokens = 8_192
    _display_model = "openai:gpt-test"

    def __init__(self) -> None:
        self.run_calls = 0

    def run(self, **kwargs):
        self.run_calls += 1
        kwargs["callback"](
            {
                "type": "final_message",
                "run_id": kwargs["run_id"],
                "iteration": 1,
                "timestamp": time.time(),
                "content": "done",
            }
        )
        return SimpleNamespace(
            messages=[{"role": "assistant", "content": "done"}],
            status="completed",
        )


class MemoryV2TakeoverGuardTests(unittest.TestCase):
    def _runtime(self, data_dir: str) -> MemoryV2Runtime:
        root = Path(data_dir) / "memory_v2"
        return MemoryV2Runtime(
            data_dir=Path(data_dir),
            root_dir=root,
            store=MemoryV2Store(root),
        )

    def _admit_active(
        self,
        runtime: MemoryV2Runtime,
        *,
        owner_chat_id: str,
        session_id: str,
    ) -> None:
        runtime.resolve_chat_admission(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            requested_rollout_mode="all",
            effective_rollout_mode="all",
            cohort="all_active",
            target_mode="active",
            decision_reason="",
            canary_selected=True,
            canary_percent=100,
            canary_bucket=0,
            hash_strategy="sha256_owner_v1",
            provenance={"source": "takeover_guard_test"},
            operation_id=f"admit:{owner_chat_id}:{session_id}",
        )

    def _record_tool_call(
        self,
        runtime: MemoryV2Runtime,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
    ) -> None:
        runtime.append_semantic_event(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            event={
                "type": "tool_call",
                "event_id": f"evt_{attempt_id}_tool",
                "run_id": attempt_id,
                "call_id": "call-1",
                "tool_name": "test_tool",
                "arguments": {},
            },
            operation_id=f"tool:{owner_chat_id}:{attempt_id}",
        )

    def _registries(self, data_dir: str, session_id: str, attempt_id: str):
        predecessor = execution_control.ExecutionControlRegistry(
            data_dir,
            process_owner_id="stopped-worker",
            process_pid=707,
            process_is_alive=lambda _pid: False,
        )
        predecessor.mark_running(session_id, attempt_id)
        successor = execution_control.ExecutionControlRegistry(
            data_dir,
            process_owner_id="replacement-worker",
            process_pid=808,
            process_is_alive=lambda _pid: False,
        )
        return predecessor, successor

    @staticmethod
    def _active_options(runtime: MemoryV2Runtime, owner_chat_id: str) -> dict:
        return {
            "_memory_v2_requested": True,
            "_memory_v2_owner_chat_id": owner_chat_id,
            "_memory_v2_runtime": runtime,
        }

    def test_dead_owner_with_prior_v2_tool_event_never_recreates_agent(self) -> None:
        owner_chat_id = "chat-takeover"
        session_id = "session-takeover"
        attempt_id = "attempt-takeover"
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": data_dir},
            clear=False,
        ):
            runtime = self._runtime(data_dir)
            self._admit_active(
                runtime,
                owner_chat_id=owner_chat_id,
                session_id=session_id,
            )
            self._record_tool_call(
                runtime,
                owner_chat_id=owner_chat_id,
                session_id=session_id,
                attempt_id=attempt_id,
            )
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ), mock.patch.object(
                ua,
                "_load_recipe_from_options",
                return_value=None,
            ), mock.patch.object(ua, "_create_agent") as create_agent:
                events = list(
                    ua.stream_chat_events(
                        message="continue",
                        history=[],
                        attachments=[],
                        options=self._active_options(runtime, owner_chat_id),
                        session_id=session_id,
                        attempt_id=attempt_id,
                    )
                )

            create_agent.assert_not_called()
            self.assertEqual(len(events), 1)
            self.assertEqual(
                events[0]["code"],
                ua._MEMORY_V2_TAKEOVER_RECOVERY_CODE,
            )
            self.assertTrue(events[0]["recovery_required"])
            snapshot = successor.snapshot(session_id, attempt_id)
            self.assertEqual(snapshot.status, "failed")
            self.assertEqual(snapshot.reason, ua._MEMORY_V2_TAKEOVER_RECOVERY_CODE)

            journal = runtime.load_events(
                owner_chat_id=owner_chat_id,
                session_id=session_id,
                attempt_id=attempt_id,
                include_payload=True,
            )
            recovery = [
                item["event"]
                for item in journal["events"]
                if item["type"] == "run_failed"
            ]
            self.assertEqual(len(recovery), 1)
            self.assertTrue(recovery[0]["prior_tool_history_present"])
            task = runtime.get_capture_task_state(
                owner_chat_id=owner_chat_id,
                session_id=session_id,
                attempt_id=attempt_id,
            )
            self.assertEqual(task["capture_status"], "sealed")
            self.assertEqual(task["capture_quality"], "partial")
            self.assertEqual(task["run_outcome"], "failed")

    def test_dead_owner_active_v2_without_prior_events_may_start(self) -> None:
        owner_chat_id = "chat-empty"
        session_id = "session-empty"
        attempt_id = "attempt-empty"
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": data_dir},
            clear=False,
        ):
            runtime = self._runtime(data_dir)
            self._admit_active(
                runtime,
                owner_chat_id=owner_chat_id,
                session_id=session_id,
            )
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            agent = _FakeAgent()
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ), mock.patch.object(
                ua,
                "_load_recipe_from_options",
                return_value=None,
            ), mock.patch.object(
                ua,
                "_create_agent",
                return_value=agent,
            ), mock.patch.object(
                ua,
                "_build_bundle_from_result",
                return_value=None,
            ):
                events = list(
                    ua.stream_chat_events(
                        message="safe to begin",
                        history=[],
                        attachments=[],
                        options=self._active_options(runtime, owner_chat_id),
                        session_id=session_id,
                        attempt_id=attempt_id,
                    )
                )

            self.assertEqual(agent.run_calls, 1)
            self.assertTrue(any(item.get("type") == "final_message" for item in events))
            self.assertEqual(successor.snapshot(session_id, attempt_id).status, "completed")

    def test_recovery_journal_writes_are_idempotent(self) -> None:
        owner_chat_id = "chat-idempotent"
        session_id = "session-idempotent"
        attempt_id = "attempt-idempotent"
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": data_dir},
            clear=False,
        ):
            runtime = self._runtime(data_dir)
            self._admit_active(
                runtime,
                owner_chat_id=owner_chat_id,
                session_id=session_id,
            )
            self._record_tool_call(
                runtime,
                owner_chat_id=owner_chat_id,
                session_id=session_id,
                attempt_id=attempt_id,
            )
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ):
                registration = successor.register(session_id, attempt_id)
                running = successor.mark_running(session_id, attempt_id)
                kwargs = {
                    "options": self._active_options(runtime, owner_chat_id),
                    "session_id": session_id,
                    "attempt_id": attempt_id,
                    "registration": registration,
                    "running": running,
                }
                first = ua._memory_v2_guard_reclaimed_execution(**kwargs)
                second = ua._memory_v2_guard_reclaimed_execution(**kwargs)

            self.assertEqual(first["code"], ua._MEMORY_V2_TAKEOVER_RECOVERY_CODE)
            self.assertEqual(second["code"], ua._MEMORY_V2_TAKEOVER_RECOVERY_CODE)
            journal = runtime.load_events(
                owner_chat_id=owner_chat_id,
                session_id=session_id,
                attempt_id=attempt_id,
                include_payload=False,
            )
            self.assertEqual(
                [item["type"] for item in journal["events"]].count("run_failed"),
                1,
            )

    def test_sticky_unchain_takeover_reads_events_from_official_reader(self) -> None:
        owner_chat_id = "chat-official-takeover"
        session_id = "session-official-takeover"
        attempt_id = "attempt-official-takeover"
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": data_dir},
            clear=False,
        ):
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            legacy_load = mock.Mock(
                return_value={"events": [{"type": "legacy_tool_call"}]}
            )
            official_load = mock.Mock(
                return_value={"events": [{"type": "tool_call"}]}
            )
            official_reader = SimpleNamespace(load_events=official_load)
            options = {
                "_memory_v2_requested": True,
                "_memory_v2_owner_chat_id": owner_chat_id,
                "_memory_v2_runtime": SimpleNamespace(load_events=legacy_load),
            }
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ), mock.patch.object(
                ua,
                "_inspect_memory_v2_rollout_intent",
                return_value={"target_mode": "active"},
            ), mock.patch(
                "memory_v2_store_boundary.configured_context_v2_store_owner",
                return_value="unchain",
            ), mock.patch(
                "memory_v2_unchain_atomic_bootstrap."
                "pupu_unchain_sticky_active_required",
                return_value=True,
            ) as sticky_active, mock.patch(
                "memory_v2_unchain_read_adapter."
                "open_pupu_unchain_memory_v2_reader",
                return_value=official_reader,
            ) as open_reader, mock.patch.object(
                memory_v2_runtime_module,
                "get_memory_v2_runtime",
            ) as get_legacy_runtime:
                registration = successor.register(session_id, attempt_id)
                running = successor.mark_running(session_id, attempt_id)
                recovery = ua._memory_v2_guard_reclaimed_execution(
                    options=options,
                    session_id=session_id,
                    attempt_id=attempt_id,
                    registration=registration,
                    running=running,
                )

            self.assertEqual(recovery["journal_inspection"], "history_present")
            sticky_active.assert_called_once_with(
                root_dir=Path(data_dir).expanduser().resolve() / "memory_v2",
                owner_chat_id=owner_chat_id,
            )
            open_reader.assert_called_once_with(
                root_dir=Path(data_dir).expanduser().resolve() / "memory_v2",
                owner_chat_id=owner_chat_id,
            )
            official_load.assert_called_once_with(
                owner_chat_id=owner_chat_id,
                after=0,
                limit=32,
                session_id=session_id,
                attempt_id=attempt_id,
                include_payload=False,
            )
            legacy_load.assert_not_called()
            get_legacy_runtime.assert_not_called()
            self.assertEqual(
                successor.snapshot(session_id, attempt_id).status,
                "failed",
            )

    def test_sticky_unchain_takeover_missing_reader_fails_without_legacy_fallback(
        self,
    ) -> None:
        owner_chat_id = "chat-official-missing-reader"
        session_id = "session-official-missing-reader"
        attempt_id = "attempt-official-missing-reader"
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": data_dir},
            clear=False,
        ):
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            legacy_load = mock.Mock(
                return_value={"events": [{"type": "tool_call"}]}
            )
            options = {
                "_memory_v2_requested": True,
                "_memory_v2_owner_chat_id": owner_chat_id,
                "_memory_v2_runtime": SimpleNamespace(load_events=legacy_load),
            }
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ), mock.patch.object(
                ua,
                "_inspect_memory_v2_rollout_intent",
                return_value={"target_mode": "active"},
            ), mock.patch(
                "memory_v2_store_boundary.configured_context_v2_store_owner",
                return_value="unchain",
            ), mock.patch(
                "memory_v2_unchain_atomic_bootstrap."
                "pupu_unchain_sticky_active_required",
                return_value=True,
            ), mock.patch(
                "memory_v2_unchain_read_adapter."
                "open_pupu_unchain_memory_v2_reader",
                side_effect=RuntimeError("official lifecycle missing"),
            ), mock.patch.object(
                memory_v2_runtime_module,
                "get_memory_v2_runtime",
            ) as get_legacy_runtime:
                registration = successor.register(session_id, attempt_id)
                running = successor.mark_running(session_id, attempt_id)
                recovery = ua._memory_v2_guard_reclaimed_execution(
                    options=options,
                    session_id=session_id,
                    attempt_id=attempt_id,
                    registration=registration,
                    running=running,
                )

            self.assertEqual(recovery["journal_inspection"], "unavailable")
            legacy_load.assert_not_called()
            get_legacy_runtime.assert_not_called()
            self.assertEqual(
                successor.snapshot(session_id, attempt_id).status,
                "failed",
            )

    def test_corrupt_unchain_sticky_state_fails_without_legacy_fallback(
        self,
    ) -> None:
        owner_chat_id = "chat-official-corrupt-sticky"
        session_id = "session-official-corrupt-sticky"
        attempt_id = "attempt-official-corrupt-sticky"
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": data_dir},
            clear=False,
        ):
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            legacy_load = mock.Mock(
                return_value={"events": [{"type": "tool_call"}]}
            )
            options = {
                "_memory_v2_requested": True,
                "_memory_v2_owner_chat_id": owner_chat_id,
                "_memory_v2_runtime": SimpleNamespace(load_events=legacy_load),
            }
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ), mock.patch.object(
                ua,
                "_inspect_memory_v2_rollout_intent",
                return_value={"target_mode": "active"},
            ), mock.patch(
                "memory_v2_store_boundary.configured_context_v2_store_owner",
                return_value="unchain",
            ), mock.patch(
                "memory_v2_unchain_atomic_bootstrap."
                "pupu_unchain_sticky_active_required",
                side_effect=RuntimeError("corrupt sticky admission"),
            ), mock.patch(
                "memory_v2_unchain_read_adapter."
                "open_pupu_unchain_memory_v2_reader",
            ) as open_reader, mock.patch.object(
                memory_v2_runtime_module,
                "get_memory_v2_runtime",
            ) as get_legacy_runtime:
                registration = successor.register(session_id, attempt_id)
                running = successor.mark_running(session_id, attempt_id)
                recovery = ua._memory_v2_guard_reclaimed_execution(
                    options=options,
                    session_id=session_id,
                    attempt_id=attempt_id,
                    registration=registration,
                    running=running,
                )

            self.assertEqual(recovery["journal_inspection"], "unavailable")
            open_reader.assert_not_called()
            legacy_load.assert_not_called()
            get_legacy_runtime.assert_not_called()
            self.assertEqual(
                successor.snapshot(session_id, attempt_id).status,
                "failed",
            )

    def test_rollout_active_without_sticky_unchain_state_fails_closed(self) -> None:
        owner_chat_id = "chat-official-not-sticky"
        session_id = "session-official-not-sticky"
        attempt_id = "attempt-official-not-sticky"
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": data_dir},
            clear=False,
        ):
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            legacy_load = mock.Mock(
                return_value={"events": [{"type": "tool_call"}]}
            )
            options = {
                "_memory_v2_requested": True,
                "_memory_v2_owner_chat_id": owner_chat_id,
                "_memory_v2_runtime": SimpleNamespace(load_events=legacy_load),
            }
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ), mock.patch.object(
                ua,
                "_inspect_memory_v2_rollout_intent",
                return_value={"target_mode": "active"},
            ), mock.patch(
                "memory_v2_store_boundary.configured_context_v2_store_owner",
                return_value="unchain",
            ), mock.patch(
                "memory_v2_unchain_atomic_bootstrap."
                "pupu_unchain_sticky_active_required",
                return_value=False,
            ), mock.patch(
                "memory_v2_unchain_read_adapter."
                "open_pupu_unchain_memory_v2_reader",
            ) as open_reader, mock.patch.object(
                memory_v2_runtime_module,
                "get_memory_v2_runtime",
            ) as get_legacy_runtime:
                registration = successor.register(session_id, attempt_id)
                running = successor.mark_running(session_id, attempt_id)
                recovery = ua._memory_v2_guard_reclaimed_execution(
                    options=options,
                    session_id=session_id,
                    attempt_id=attempt_id,
                    registration=registration,
                    running=running,
                )

            self.assertEqual(recovery["journal_inspection"], "unavailable")
            open_reader.assert_not_called()
            legacy_load.assert_not_called()
            get_legacy_runtime.assert_not_called()
            self.assertEqual(
                successor.snapshot(session_id, attempt_id).status,
                "failed",
            )

    def test_dead_owner_legacy_attempt_keeps_existing_restart_behavior(self) -> None:
        session_id = "session-legacy"
        attempt_id = "attempt-legacy"
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": data_dir},
            clear=False,
        ):
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            agent = _FakeAgent()
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ), mock.patch.object(
                ua,
                "_load_recipe_from_options",
                return_value=None,
            ), mock.patch.object(
                ua,
                "_create_agent",
                return_value=agent,
            ), mock.patch.object(
                ua,
                "_build_bundle_from_result",
                return_value=None,
            ):
                events = list(
                    ua.stream_chat_events(
                        message="legacy restart",
                        history=[],
                        attachments=[],
                        options={},
                        session_id=session_id,
                        attempt_id=attempt_id,
                    )
                )

            self.assertEqual(agent.run_calls, 1)
            self.assertTrue(any(item.get("type") == "final_message" for item in events))

    def test_graph_takeover_uses_the_same_v2_guard(self) -> None:
        owner_chat_id = "chat-graph"
        session_id = "session-graph"
        attempt_id = "attempt-graph"
        graph_recipe = SimpleNamespace(nodes=({"id": "agent"},))
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": data_dir},
            clear=False,
        ):
            runtime = self._runtime(data_dir)
            self._admit_active(
                runtime,
                owner_chat_id=owner_chat_id,
                session_id=session_id,
            )
            self._record_tool_call(
                runtime,
                owner_chat_id=owner_chat_id,
                session_id=session_id,
                attempt_id=attempt_id,
            )
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ), mock.patch.object(
                ua,
                "_load_recipe_from_options",
                return_value=graph_recipe,
            ), mock.patch.object(ua, "_stream_recipe_graph_events") as graph_stream:
                events = list(
                    ua.stream_chat_events(
                        message="continue graph",
                        history=[],
                        attachments=[],
                        options=self._active_options(runtime, owner_chat_id),
                        session_id=session_id,
                        attempt_id=attempt_id,
                    )
                )

            graph_stream.assert_not_called()
            self.assertEqual(events[0]["code"], ua._MEMORY_V2_TAKEOVER_RECOVERY_CODE)

    def test_resume_takeover_uses_the_same_v2_guard(self) -> None:
        owner_chat_id = "chat-resume"
        session_id = "session-resume"
        attempt_id = "attempt-resume"
        source_attempt_id = "source-attempt"
        pending = {
            "status": "receipt_recorded",
            "interaction_id": "interaction-1",
            "source_run_id": source_attempt_id,
            "provider": "openai",
            "model": "gpt-test",
            "resume_available": True,
        }
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": data_dir},
            clear=False,
        ):
            runtime = self._runtime(data_dir)
            self._admit_active(
                runtime,
                owner_chat_id=owner_chat_id,
                session_id=session_id,
            )
            self._record_tool_call(
                runtime,
                owner_chat_id=owner_chat_id,
                session_id=session_id,
                attempt_id=attempt_id,
            )
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            resolved_options = self._active_options(runtime, owner_chat_id)
            resolved_options["memory_enabled"] = True
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ), mock.patch.object(
                ua,
                "get_pending_interaction",
                return_value=pending,
            ), mock.patch.object(
                ua,
                "resolve_resume_options",
                return_value=resolved_options,
            ), mock.patch.object(
                ua,
                "bind_execution_attempt",
            ), mock.patch.object(
                ua,
                "clear_execution_attempt_binding",
            ) as clear_binding, mock.patch.object(
                ua,
                "_load_recipe_from_options",
                return_value=None,
            ), mock.patch.object(ua, "_create_agent") as create_agent:
                events = list(
                    ua.resume_chat_interaction_events(
                        session_id=session_id,
                        interaction_id="interaction-1",
                        options=self._active_options(runtime, owner_chat_id),
                        attempt_id=attempt_id,
                        source_attempt_id=source_attempt_id,
                    )
                )

            create_agent.assert_not_called()
            clear_binding.assert_called_once_with(session_id, attempt_id)
            self.assertEqual(events[0]["code"], ua._MEMORY_V2_TAKEOVER_RECOVERY_CODE)

    def test_active_takeover_fails_closed_when_runtime_lookup_is_unavailable(self) -> None:
        session_id = "session-no-runtime"
        attempt_id = "attempt-no-runtime"
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {
                "UNCHAIN_DATA_DIR": data_dir,
                "PUPU_MEMORY_V2_MODE": "all",
                "PUPU_FEATURE_MEMORY_V2": "all",
            },
            clear=False,
        ):
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ), mock.patch.object(
                memory_v2_runtime_module,
                "get_memory_v2_runtime",
                return_value=None,
            ), mock.patch.object(
                ua,
                "_load_recipe_from_options",
                return_value=None,
            ), mock.patch.object(ua, "_create_agent") as create_agent:
                events = list(
                    ua.stream_chat_events(
                        message="unsafe retry",
                        history=[],
                        attachments=[],
                        options={
                            "_memory_v2_requested": True,
                            "_memory_v2_owner_chat_id": "chat-no-runtime",
                        },
                        session_id=session_id,
                        attempt_id=attempt_id,
                    )
                )

            create_agent.assert_not_called()
            self.assertEqual(events[0]["journal_inspection"], "unavailable")
            self.assertEqual(successor.snapshot(session_id, attempt_id).status, "failed")

    def test_active_takeover_fails_closed_when_sticky_lookup_raises(self) -> None:
        session_id = "session-sticky-error"
        attempt_id = "attempt-sticky-error"

        class BrokenRuntime:
            @staticmethod
            def get_chat_admission(**_kwargs):
                raise RuntimeError("storage unavailable")

        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {
                "UNCHAIN_DATA_DIR": data_dir,
                "PUPU_MEMORY_V2_MODE": "all",
                "PUPU_FEATURE_MEMORY_V2": "all",
            },
            clear=False,
        ):
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ), mock.patch.object(
                ua,
                "_load_recipe_from_options",
                return_value=None,
            ), mock.patch.object(ua, "_create_agent") as create_agent:
                events = list(
                    ua.stream_chat_events(
                        message="unsafe retry",
                        history=[],
                        attachments=[],
                        options={
                            "_memory_v2_requested": True,
                            "_memory_v2_owner_chat_id": "chat-sticky-error",
                            "_memory_v2_runtime": BrokenRuntime(),
                        },
                        session_id=session_id,
                        attempt_id=attempt_id,
                    )
                )

            create_agent.assert_not_called()
            self.assertEqual(events[0]["journal_inspection"], "unavailable")
            self.assertEqual(successor.snapshot(session_id, attempt_id).status, "failed")

    def test_explicit_shadow_takeover_keeps_existing_restart_behavior(self) -> None:
        session_id = "session-shadow"
        attempt_id = "attempt-shadow"
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {
                "UNCHAIN_DATA_DIR": data_dir,
                "PUPU_MEMORY_V2_MODE": "shadow",
                "PUPU_FEATURE_MEMORY_V2": "all",
            },
            clear=False,
        ):
            _predecessor, successor = self._registries(
                data_dir,
                session_id,
                attempt_id,
            )
            agent = _FakeAgent()
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                successor,
            ), mock.patch.object(
                memory_v2_runtime_module,
                "get_memory_v2_runtime",
                return_value=None,
            ), mock.patch.object(
                ua,
                "_load_recipe_from_options",
                return_value=None,
            ), mock.patch.object(
                ua,
                "_create_agent",
                return_value=agent,
            ), mock.patch.object(
                ua,
                "_build_bundle_from_result",
                return_value=None,
            ):
                events = list(
                    ua.stream_chat_events(
                        message="shadow retry",
                        history=[],
                        attachments=[],
                        options={
                            "_memory_v2_requested": True,
                            "_memory_v2_owner_chat_id": "chat-shadow",
                        },
                        session_id=session_id,
                        attempt_id=attempt_id,
                    )
                )

            self.assertEqual(agent.run_calls, 1)
            self.assertTrue(any(item.get("type") == "final_message" for item in events))

    def test_live_and_terminal_attempts_do_not_enter_takeover_guard(self) -> None:
        with tempfile.TemporaryDirectory() as data_dir, mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": data_dir},
            clear=False,
        ):
            live_owner = execution_control.ExecutionControlRegistry(
                data_dir,
                process_owner_id="live-worker",
                process_pid=707,
                process_is_alive=lambda _pid: True,
            )
            live_owner.mark_running("session-live", "attempt-live")
            contender = execution_control.ExecutionControlRegistry(
                data_dir,
                process_owner_id="contender",
                process_pid=808,
                process_is_alive=lambda _pid: True,
            )
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                contender,
            ), mock.patch.object(
                ua,
                "_load_recipe_from_options",
                return_value=None,
            ), mock.patch.object(ua, "_create_agent") as create_agent:
                self.assertEqual(
                    list(
                        ua.stream_chat_events(
                            message="duplicate",
                            history=[],
                            attachments=[],
                            options={},
                            session_id="session-live",
                            attempt_id="attempt-live",
                        )
                    ),
                    [],
                )
                create_agent.assert_not_called()

            terminal = execution_control.ExecutionControlRegistry(
                data_dir,
                process_owner_id="terminal-worker",
                process_pid=909,
                process_is_alive=lambda _pid: True,
            )
            terminal.mark_running("session-terminal", "attempt-terminal")
            terminal.mark_completed("session-terminal", "attempt-terminal")
            with mock.patch.object(
                execution_control,
                "_DEFAULT_REGISTRY",
                terminal,
            ), mock.patch.object(ua, "_create_agent") as create_agent:
                self.assertEqual(
                    list(
                        ua.stream_chat_events(
                            message="terminal duplicate",
                            history=[],
                            attachments=[],
                            options={},
                            session_id="session-terminal",
                            attempt_id="attempt-terminal",
                        )
                    ),
                    [],
                )
                create_agent.assert_not_called()


if __name__ == "__main__":
    unittest.main()
