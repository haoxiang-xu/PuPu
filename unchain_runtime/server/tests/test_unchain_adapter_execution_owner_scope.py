from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import execution_control
import durable_interaction_host
import session_execution_guard
import unchain_adapter


class UnchainAdapterExecutionOwnerScopeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.data_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.data_dir.cleanup)
        environment = mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": self.data_dir.name},
            clear=False,
        )
        environment.start()
        self.addCleanup(environment.stop)

    def _assert_failed_and_rebase_available(
        self,
        *,
        session_id: str,
        attempt_id: str,
    ) -> None:
        snapshot = execution_control.snapshot(session_id, attempt_id)
        self.assertIsNotNone(snapshot)
        self.assertEqual(snapshot.status, "failed")
        self.assertIsNone(
            session_execution_guard.snapshot_session_guard(session_id=session_id)
        )
        self.assertEqual(
            session_execution_guard.acquire_rebase_guard(
                session_id,
                f"rebase-{attempt_id}",
                execution_id=session_id,
            ),
            "acquired",
        )
        session_execution_guard.release_rebase_guard(
            session_id,
            f"rebase-{attempt_id}",
        )

    def _assert_cancelled_and_rebase_available(
        self,
        *,
        session_id: str,
        attempt_id: str,
    ) -> None:
        snapshot = execution_control.snapshot(session_id, attempt_id)
        self.assertIsNotNone(snapshot)
        self.assertEqual(snapshot.status, "cancelled")
        self.assertIsNone(
            session_execution_guard.snapshot_session_guard(session_id=session_id)
        )
        self.assertEqual(
            session_execution_guard.acquire_rebase_guard(
                session_id,
                f"rebase-{attempt_id}",
                execution_id=session_id,
            ),
            "acquired",
        )
        session_execution_guard.release_rebase_guard(
            session_id,
            f"rebase-{attempt_id}",
        )

    def _cancel_after_mark_running(self, session_id: str, attempt_id: str):
        checks = 0

        def is_cancelled(_token) -> bool:
            nonlocal checks
            checks += 1
            if checks == 1:
                return False
            if checks == 2:
                execution_control.request_cancel(
                    session_id,
                    attempt_id,
                    reason="cancelled after mark_running",
                )
            return True

        return is_cancelled

    def _parked_resume(
        self,
        *,
        session_id: str,
        interaction_id: str,
        owner_attempt_id: str,
        source_attempt_id: str,
        receipt_id: str,
    ) -> None:
        session_execution_guard.initialize_session_guard_protocol()
        self.assertEqual(
            session_execution_guard.acquire_run_guard(
                session_id,
                owner_attempt_id,
            ),
            "acquired",
        )
        session_execution_guard.park_session_guard(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=source_attempt_id,
            owner_attempt_id=owner_attempt_id,
        )
        session_execution_guard.bind_session_guard_receipt(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=source_attempt_id,
            receipt_id=receipt_id,
        )

    def _seed_durable_request(self, *, session_id: str):
        from unchain.interaction.durable import (
            INTERACTION_JOURNAL_KEY,
            build_interaction_request,
            new_interaction_journal,
            register_interaction_request,
        )
        from unchain.interaction.runtime import response_contract_for_kind

        request = build_interaction_request(
            session_id=session_id,
            kind="tool_approval",
            source_run_id="run-live",
            occurrence="tool_approval:1",
            payload={
                "type": "tool_confirmation_request",
                "tool_name": "write",
                "call_id": "call-live",
                "arguments": {"path": "notes.txt"},
                "description": "Write notes.txt",
            },
            response_contract=response_contract_for_kind("tool_approval"),
            created_revision=0,
            subject={"provider": "openai", "model": "gpt-5"},
        )
        journal = register_interaction_request(
            new_interaction_journal(),
            request,
            checkpoint_id="checkpoint-live",
        )
        durable_interaction_host._session_store().save(
            session_id,
            {INTERACTION_JOURNAL_KEY: journal},
        )
        durable_interaction_host.save_resume_context(
            session_id=session_id,
            run_id="run-live",
            options={"modelId": "openai:gpt-5", "memory_enabled": True},
            provider="openai",
            model="gpt-5",
        )
        return request

    @staticmethod
    def _pending(
        *,
        session_id: str,
        interaction_id: str,
        source_attempt_id: str,
        receipt_id: str,
        graph: bool = False,
    ) -> dict[str, object]:
        return {
            "status": "receipt_recorded",
            "session_id": session_id,
            "interaction_id": interaction_id,
            "source_run_id": source_attempt_id,
            "receipt_id": receipt_id,
            "provider": "openai",
            "model": "gpt-5",
            "resume_available": True,
            "resume_kind": "graph_step" if graph else "flat",
            "resolution": {"response": "continue", "outcome": "submitted"},
        }

    def test_initial_graph_and_flat_cancel_after_mark_release_owned_guard(self) -> None:
        for graph in (False, True):
            with self.subTest(graph=graph):
                session_id = f"session-initial-cancel-{graph}"
                attempt_id = f"attempt-initial-cancel-{graph}"
                recipe = object() if graph else None
                with mock.patch.object(
                    unchain_adapter,
                    "_load_recipe_from_options",
                    return_value=recipe,
                ), mock.patch.object(
                    unchain_adapter,
                    "_recipe_has_graph",
                    return_value=graph,
                ), mock.patch.object(
                    unchain_adapter,
                    "_execution_is_cancelled",
                    side_effect=self._cancel_after_mark_running(
                        session_id,
                        attempt_id,
                    ),
                ):
                    self.assertEqual(
                        list(
                            unchain_adapter.stream_chat_events(
                                message="hello",
                                history=[],
                                options={},
                                session_id=session_id,
                                attempt_id=attempt_id,
                            )
                        ),
                        [],
                    )

                self._assert_cancelled_and_rebase_available(
                    session_id=session_id,
                    attempt_id=attempt_id,
                )

    def test_initial_graph_and_flat_context_failure_release_owned_guard(self) -> None:
        for graph in (False, True):
            with self.subTest(graph=graph):
                session_id = f"session-initial-context-{graph}"
                attempt_id = f"attempt-initial-context-{graph}"
                recipe = object() if graph else None
                context_failure = RuntimeError(f"context failure {graph}")
                with mock.patch.object(
                    unchain_adapter,
                    "_load_recipe_from_options",
                    return_value=recipe,
                ), mock.patch.object(
                    unchain_adapter,
                    "_recipe_has_graph",
                    return_value=graph,
                ), mock.patch.object(
                    unchain_adapter,
                    "_memory_v2_root_runtime_context",
                    side_effect=context_failure,
                ):
                    with self.assertRaisesRegex(RuntimeError, "context failure"):
                        list(
                            unchain_adapter.stream_chat_events(
                                message="hello",
                                history=[],
                                options={"_memory_v2_requested": True},
                                session_id=session_id,
                                attempt_id=attempt_id,
                            )
                        )

                self._assert_failed_and_rebase_available(
                    session_id=session_id,
                    attempt_id=attempt_id,
                )

    def test_initial_flat_setup_failure_releases_owned_guard(self) -> None:
        session_id = "session-initial-setup"
        attempt_id = "attempt-initial-setup"
        with mock.patch.object(
            unchain_adapter,
            "_load_recipe_from_options",
            return_value=None,
        ), mock.patch.object(
            unchain_adapter,
            "_recipe_has_graph",
            return_value=False,
        ), mock.patch.object(
            unchain_adapter,
            "_create_agent",
            side_effect=RuntimeError("agent setup failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "agent setup failed"):
                list(
                    unchain_adapter.stream_chat_events(
                        message="hello",
                        history=[],
                        options={},
                        session_id=session_id,
                        attempt_id=attempt_id,
                    )
                )

        self._assert_failed_and_rebase_available(
            session_id=session_id,
            attempt_id=attempt_id,
        )

    def test_initial_unchanged_duplicate_does_not_release_live_guard(self) -> None:
        session_id = "session-initial-duplicate"
        attempt_id = "attempt-initial-duplicate"
        execution_control.register(session_id, attempt_id)
        execution_control.mark_running(session_id, attempt_id)

        with mock.patch.object(
            unchain_adapter,
            "_load_recipe_from_options",
            return_value=None,
        ), mock.patch.object(
            unchain_adapter,
            "_recipe_has_graph",
            return_value=False,
        ):
            self.assertEqual(
                list(
                    unchain_adapter.stream_chat_events(
                        message="duplicate",
                        history=[],
                        options={},
                        session_id=session_id,
                        attempt_id=attempt_id,
                    )
                ),
                [],
            )

        guard_snapshot = session_execution_guard.snapshot_session_guard(
            session_id=session_id
        )
        self.assertIsNotNone(guard_snapshot)
        self.assertEqual(guard_snapshot.attempt_id, attempt_id)
        with self.assertRaises(session_execution_guard.SessionExecutionInProgress):
            session_execution_guard.acquire_rebase_guard(
                session_id,
                "rebase-duplicate",
                execution_id=session_id,
            )
        execution_control.mark_failed(
            session_id,
            attempt_id,
            reason="test cleanup",
        )

    def test_cold_resume_cancel_after_mark_releases_transferred_guard(self) -> None:
        session_id = "session-resume-cancel"
        interaction_id = "interaction-resume-cancel"
        attempt_id = "attempt-resume-cancel"
        receipt_id = "receipt-resume-cancel"
        self._parked_resume(
            session_id=session_id,
            interaction_id=interaction_id,
            owner_attempt_id=attempt_id,
            source_attempt_id=attempt_id,
            receipt_id=receipt_id,
        )
        pending = self._pending(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=attempt_id,
            receipt_id=receipt_id,
        )
        with mock.patch.object(
            unchain_adapter,
            "get_pending_interaction",
            return_value=pending,
        ), mock.patch.object(
            unchain_adapter,
            "resolve_resume_options",
            return_value={},
        ), mock.patch.object(
            unchain_adapter,
            "_load_recipe_from_options",
            return_value=None,
        ), mock.patch.object(
            unchain_adapter,
            "_recipe_has_graph",
            return_value=False,
        ), mock.patch.object(
            unchain_adapter,
            "bind_execution_attempt",
        ), mock.patch.object(
            unchain_adapter,
            "clear_execution_attempt_binding",
        ) as clear_binding, mock.patch.object(
            unchain_adapter,
            "_execution_is_cancelled",
            side_effect=self._cancel_after_mark_running(session_id, attempt_id),
        ):
            self.assertEqual(
                list(
                    unchain_adapter.resume_chat_interaction_events(
                        session_id=session_id,
                        interaction_id=interaction_id,
                        options={},
                        attempt_id=attempt_id,
                        source_attempt_id=attempt_id,
                    )
                ),
                [],
            )

        clear_binding.assert_called_with(session_id, attempt_id)
        self._assert_cancelled_and_rebase_available(
            session_id=session_id,
            attempt_id=attempt_id,
        )

    def test_cold_graph_binding_failure_releases_coordinator_guard(self) -> None:
        session_id = "session-resume-graph-binding"
        interaction_id = "interaction-resume-graph-binding"
        owner_attempt_id = "coordinator-resume-graph-binding"
        source_attempt_id = "step-resume-graph-binding"
        receipt_id = "receipt-resume-graph-binding"
        self._parked_resume(
            session_id=session_id,
            interaction_id=interaction_id,
            owner_attempt_id=owner_attempt_id,
            source_attempt_id=source_attempt_id,
            receipt_id=receipt_id,
        )
        pending = self._pending(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=source_attempt_id,
            receipt_id=receipt_id,
            graph=True,
        )
        with mock.patch.object(
            unchain_adapter,
            "get_pending_interaction",
            return_value=pending,
        ), mock.patch.object(
            unchain_adapter,
            "load_graph_step_resume_context",
            return_value={"coordinator_binding_snapshot": None},
        ), mock.patch.object(
            unchain_adapter,
            "resolve_graph_step_resume_options",
            return_value={},
        ), mock.patch.object(
            unchain_adapter,
            "_load_recipe_from_options",
            return_value=object(),
        ), mock.patch.object(
            unchain_adapter,
            "_recipe_has_graph",
            return_value=True,
        ), mock.patch.object(
            unchain_adapter,
            "bind_execution_attempt",
        ), mock.patch.object(
            unchain_adapter,
            "clear_execution_attempt_binding",
        ) as clear_binding:
            with self.assertRaisesRegex(
                unchain_adapter.DurableInteractionHostError,
                "canonical coordinator binding",
            ):
                list(
                    unchain_adapter.resume_chat_interaction_events(
                        session_id=session_id,
                        interaction_id=interaction_id,
                        options={"_memory_v2_owner_chat_id": "owner-chat"},
                        attempt_id=owner_attempt_id,
                        source_attempt_id=source_attempt_id,
                    )
                )

        clear_binding.assert_called_with(session_id, owner_attempt_id)
        self._assert_failed_and_rebase_available(
            session_id=session_id,
            attempt_id=owner_attempt_id,
        )

    def test_cold_flat_context_failure_releases_transferred_guard(self) -> None:
        session_id = "session-resume-context"
        interaction_id = "interaction-resume-context"
        attempt_id = "attempt-resume-context"
        receipt_id = "receipt-resume-context"
        self._parked_resume(
            session_id=session_id,
            interaction_id=interaction_id,
            owner_attempt_id=attempt_id,
            source_attempt_id=attempt_id,
            receipt_id=receipt_id,
        )
        pending = self._pending(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=attempt_id,
            receipt_id=receipt_id,
        )
        with mock.patch.object(
            unchain_adapter,
            "get_pending_interaction",
            return_value=pending,
        ), mock.patch.object(
            unchain_adapter,
            "resolve_resume_options",
            return_value={},
        ), mock.patch.object(
            unchain_adapter,
            "_load_recipe_from_options",
            return_value=None,
        ), mock.patch.object(
            unchain_adapter,
            "_recipe_has_graph",
            return_value=False,
        ), mock.patch.object(
            unchain_adapter,
            "bind_execution_attempt",
        ), mock.patch.object(
            unchain_adapter,
            "clear_execution_attempt_binding",
        ) as clear_binding, mock.patch.object(
            unchain_adapter,
            "_memory_v2_root_runtime_context",
            side_effect=RuntimeError("resume context failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "resume context failed"):
                list(
                    unchain_adapter.resume_chat_interaction_events(
                        session_id=session_id,
                        interaction_id=interaction_id,
                        options={"_memory_v2_requested": True},
                        attempt_id=attempt_id,
                        source_attempt_id=attempt_id,
                    )
                )

        clear_binding.assert_called_with(session_id, attempt_id)
        self._assert_failed_and_rebase_available(
            session_id=session_id,
            attempt_id=attempt_id,
        )

    def test_cold_flat_setup_failure_releases_transferred_guard(self) -> None:
        session_id = "session-resume-setup"
        interaction_id = "interaction-resume-setup"
        attempt_id = "attempt-resume-setup"
        receipt_id = "receipt-resume-setup"
        self._parked_resume(
            session_id=session_id,
            interaction_id=interaction_id,
            owner_attempt_id=attempt_id,
            source_attempt_id=attempt_id,
            receipt_id=receipt_id,
        )
        pending = self._pending(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=attempt_id,
            receipt_id=receipt_id,
        )
        with mock.patch.object(
            unchain_adapter,
            "get_pending_interaction",
            return_value=pending,
        ), mock.patch.object(
            unchain_adapter,
            "resolve_resume_options",
            return_value={},
        ), mock.patch.object(
            unchain_adapter,
            "_load_recipe_from_options",
            return_value=None,
        ), mock.patch.object(
            unchain_adapter,
            "_recipe_has_graph",
            return_value=False,
        ), mock.patch.object(
            unchain_adapter,
            "bind_execution_attempt",
        ), mock.patch.object(
            unchain_adapter,
            "clear_execution_attempt_binding",
        ) as clear_binding, mock.patch.object(
            unchain_adapter,
            "_create_agent",
            side_effect=RuntimeError("resume setup failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "resume setup failed"):
                list(
                    unchain_adapter.resume_chat_interaction_events(
                        session_id=session_id,
                        interaction_id=interaction_id,
                        options={},
                        attempt_id=attempt_id,
                        source_attempt_id=attempt_id,
                    )
                )

        clear_binding.assert_called_with(session_id, attempt_id)
        self._assert_failed_and_rebase_available(
            session_id=session_id,
            attempt_id=attempt_id,
        )

    def test_cold_mark_running_failure_rolls_back_exact_parked_guard(self) -> None:
        session_id = "session-resume-mark-failure"
        interaction_id = "interaction-resume-mark-failure"
        attempt_id = "attempt-resume-mark-failure"
        receipt_id = "receipt-resume-mark-failure"
        self._parked_resume(
            session_id=session_id,
            interaction_id=interaction_id,
            owner_attempt_id=attempt_id,
            source_attempt_id=attempt_id,
            receipt_id=receipt_id,
        )
        pending = self._pending(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=attempt_id,
            receipt_id=receipt_id,
        )
        original_control_call = unchain_adapter._execution_control_call

        def fail_mark_running(name: str, *args, **kwargs):
            if name == "mark_running":
                raise OSError("injected execution-control persistence failure")
            return original_control_call(name, *args, **kwargs)

        with mock.patch.object(
            unchain_adapter,
            "get_pending_interaction",
            return_value=pending,
        ), mock.patch.object(
            unchain_adapter,
            "resolve_resume_options",
            return_value={},
        ), mock.patch.object(
            unchain_adapter,
            "_load_recipe_from_options",
            return_value=None,
        ), mock.patch.object(
            unchain_adapter,
            "_recipe_has_graph",
            return_value=False,
        ), mock.patch.object(
            unchain_adapter,
            "bind_execution_attempt",
        ), mock.patch.object(
            unchain_adapter,
            "_execution_control_call",
            side_effect=fail_mark_running,
        ):
            with self.assertRaisesRegex(OSError, "persistence failure"):
                list(
                    unchain_adapter.resume_chat_interaction_events(
                        session_id=session_id,
                        interaction_id=interaction_id,
                        options={},
                        attempt_id=attempt_id,
                        source_attempt_id=attempt_id,
                    )
                )

        restored = session_execution_guard.snapshot_session_guard(
            session_id=session_id
        )
        self.assertIsNotNone(restored)
        self.assertEqual(restored.state, "parked")
        self.assertEqual(restored.attempt_id, attempt_id)
        self.assertEqual(restored.interaction_id, interaction_id)
        self.assertEqual(restored.interaction_source_attempt_id, attempt_id)
        self.assertEqual(restored.receipt_id, receipt_id)
        with self.assertRaises(session_execution_guard.SessionExecutionInProgress):
            session_execution_guard.acquire_rebase_guard(
                session_id,
                "rebase-mark-failure",
                execution_id=session_id,
            )

        recovery = session_execution_guard.prepare_parked_session_guard_transfer(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=attempt_id,
            receipt_id=receipt_id,
            attempt_id="attempt-resume-retry",
        )
        self.assertEqual(recovery.previous.state, "parked")
        session_execution_guard.release_run_guard(
            session_id,
            "attempt-resume-retry",
        )

    def test_cold_post_commit_mark_error_continues_and_retry_has_no_zombie(self) -> None:
        session_id = "session-resume-post-commit"
        interaction_id = "interaction-resume-post-commit"
        source_attempt_id = "source-resume-post-commit"
        first_attempt_id = "attempt-resume-post-commit"
        receipt_id = "receipt-resume-post-commit"
        self._parked_resume(
            session_id=session_id,
            interaction_id=interaction_id,
            owner_attempt_id=source_attempt_id,
            source_attempt_id=source_attempt_id,
            receipt_id=receipt_id,
        )
        pending = self._pending(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=source_attempt_id,
            receipt_id=receipt_id,
        )
        original_control_call = unchain_adapter._execution_control_call
        committed = False

        def raise_after_mark_commit(name: str, *args, **kwargs):
            nonlocal committed
            if name == "mark_running" and not committed:
                committed = True
                original_control_call(name, *args, **kwargs)
                raise OSError("injected post-commit mark_running failure")
            return original_control_call(name, *args, **kwargs)

        common_patches = (
            mock.patch.object(
                unchain_adapter,
                "get_pending_interaction",
                return_value=pending,
            ),
            mock.patch.object(
                unchain_adapter,
                "resolve_resume_options",
                return_value={},
            ),
            mock.patch.object(
                unchain_adapter,
                "_load_recipe_from_options",
                return_value=None,
            ),
            mock.patch.object(
                unchain_adapter,
                "_recipe_has_graph",
                return_value=False,
            ),
            mock.patch.object(unchain_adapter, "bind_execution_attempt"),
            mock.patch.object(
                unchain_adapter,
                "clear_execution_attempt_binding",
            ),
        )
        for patcher in common_patches:
            patcher.start()
            self.addCleanup(patcher.stop)

        with mock.patch.object(
            unchain_adapter,
            "_execution_control_call",
            side_effect=raise_after_mark_commit,
        ), mock.patch.object(
            unchain_adapter,
            "_create_agent",
            side_effect=RuntimeError("continued into setup after commit"),
        ) as create_agent:
            with self.assertRaisesRegex(RuntimeError, "continued into setup"):
                list(
                    unchain_adapter.resume_chat_interaction_events(
                        session_id=session_id,
                        interaction_id=interaction_id,
                        options={},
                        attempt_id=first_attempt_id,
                        source_attempt_id=source_attempt_id,
                    )
                )

        self.assertTrue(committed)
        create_agent.assert_called_once()
        first_snapshot = execution_control.snapshot(session_id, first_attempt_id)
        self.assertEqual(first_snapshot.status, "failed")
        self.assertIsNone(
            session_execution_guard.snapshot_session_guard(session_id=session_id)
        )

        session_execution_guard.park_session_guard_from_durable_interaction(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=source_attempt_id,
            owner_attempt_id=source_attempt_id,
        )
        session_execution_guard.bind_session_guard_receipt(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=source_attempt_id,
            receipt_id=receipt_id,
        )
        second_attempt_id = "attempt-resume-post-commit-retry"
        with mock.patch.object(
            unchain_adapter,
            "_create_agent",
            side_effect=RuntimeError("second retry reached setup"),
        ) as second_agent:
            with self.assertRaisesRegex(RuntimeError, "second retry reached setup"):
                list(
                    unchain_adapter.resume_chat_interaction_events(
                        session_id=session_id,
                        interaction_id=interaction_id,
                        options={},
                        attempt_id=second_attempt_id,
                        source_attempt_id=source_attempt_id,
                    )
                )

        second_agent.assert_called_once()
        self.assertEqual(
            execution_control.snapshot(session_id, second_attempt_id).status,
            "failed",
        )
        self.assertIsNone(
            session_execution_guard.snapshot_session_guard(session_id=session_id)
        )

    def test_cold_transferred_unchanged_current_owner_continues_setup(self) -> None:
        session_id = "session-resume-unchanged"
        interaction_id = "interaction-resume-unchanged"
        source_attempt_id = "source-resume-unchanged"
        attempt_id = "attempt-resume-unchanged"
        receipt_id = "receipt-resume-unchanged"
        execution_control.register(session_id, attempt_id)
        execution_control.mark_running(session_id, attempt_id)
        session_execution_guard.park_session_guard(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=source_attempt_id,
            owner_attempt_id=attempt_id,
        )
        session_execution_guard.bind_session_guard_receipt(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=source_attempt_id,
            receipt_id=receipt_id,
        )
        pending = self._pending(
            session_id=session_id,
            interaction_id=interaction_id,
            source_attempt_id=source_attempt_id,
            receipt_id=receipt_id,
        )

        with mock.patch.object(
            unchain_adapter,
            "get_pending_interaction",
            return_value=pending,
        ), mock.patch.object(
            unchain_adapter,
            "resolve_resume_options",
            return_value={},
        ), mock.patch.object(
            unchain_adapter,
            "_load_recipe_from_options",
            return_value=None,
        ), mock.patch.object(
            unchain_adapter,
            "_recipe_has_graph",
            return_value=False,
        ), mock.patch.object(
            unchain_adapter,
            "bind_execution_attempt",
        ), mock.patch.object(
            unchain_adapter,
            "clear_execution_attempt_binding",
        ), mock.patch.object(
            unchain_adapter,
            "_create_agent",
            side_effect=RuntimeError("unchanged owner continued into setup"),
        ) as create_agent:
            with self.assertRaisesRegex(RuntimeError, "continued into setup"):
                list(
                    unchain_adapter.resume_chat_interaction_events(
                        session_id=session_id,
                        interaction_id=interaction_id,
                        options={},
                        attempt_id=attempt_id,
                        source_attempt_id=source_attempt_id,
                    )
                )

        create_agent.assert_called_once()
        self.assertEqual(
            execution_control.snapshot(session_id, attempt_id).status,
            "failed",
        )
        self.assertIsNone(
            session_execution_guard.snapshot_session_guard(session_id=session_id)
        )

    def test_live_resume_get_pending_race_never_reparks_active_owner(self) -> None:
        session_id = "session-live-get-pending-race"
        request = self._seed_durable_request(session_id=session_id)
        session_execution_guard.initialize_session_guard_protocol()
        session_execution_guard.acquire_run_guard(session_id, "run-live")
        session_execution_guard.park_session_guard(
            session_id=session_id,
            interaction_id=request.interaction_id,
            source_attempt_id="run-live",
            owner_attempt_id="run-live",
        )
        receipt = durable_interaction_host.record_interaction_receipt(
            session_id=session_id,
            interaction_id=request.interaction_id,
            approved=True,
        )
        original_guard_call = durable_interaction_host._session_execution_guard_call
        resumed = False

        def resume_between_snapshot_and_reconcile(name: str, **kwargs):
            nonlocal resumed
            if name == "park_session_guard_from_durable_interaction" and not resumed:
                resumed = True
                session_execution_guard.resume_live_session_guard(
                    session_id=session_id,
                    interaction_id=request.interaction_id,
                    source_attempt_id="run-live",
                    receipt_id=receipt["receipt_id"],
                )
            return original_guard_call(name, **kwargs)

        with mock.patch.object(
            durable_interaction_host,
            "_session_execution_guard_call",
            side_effect=resume_between_snapshot_and_reconcile,
        ):
            pending = durable_interaction_host.get_pending_interaction(session_id)

        self.assertTrue(resumed)
        self.assertEqual(pending["status"], "receipt_recorded")
        active = session_execution_guard.snapshot_session_guard(
            session_id=session_id
        )
        self.assertIsNotNone(active)
        self.assertEqual((active.state, active.attempt_id), ("active", "run-live"))

        pending_again = durable_interaction_host.get_pending_interaction(session_id)
        self.assertEqual(pending_again["status"], "receipt_recorded")
        self.assertEqual(
            session_execution_guard.snapshot_session_guard(
                session_id=session_id
            ).state,
            "active",
        )
        with self.assertRaises(session_execution_guard.SessionExecutionGuardError) as blocked:
            session_execution_guard.transfer_parked_session_guard(
                session_id=session_id,
                interaction_id=request.interaction_id,
                source_attempt_id="run-live",
                receipt_id=receipt["receipt_id"],
                attempt_id="cold-resume-must-not-transfer",
            )
        self.assertEqual(blocked.exception.code, "session_guard_not_parked")
        session_execution_guard.release_run_guard(session_id, "run-live")

    def test_dead_active_owner_can_rebuild_parked_and_transfer(self) -> None:
        original = session_execution_guard.SessionExecutionGuardRegistry(
            self.data_dir.name,
            process_owner_id="dead-owner",
            process_pid=987654,
            process_incarnation="dead-incarnation",
        )
        original.initialize_protocol()
        original.acquire(
            "session-dead-reconcile",
            "attempt-dead-owner",
            operation="run",
            execution_id="session-dead-reconcile",
        )
        restarted = session_execution_guard.SessionExecutionGuardRegistry(
            self.data_dir.name,
            process_owner_id="restart-owner",
            process_pid=os.getpid(),
            process_incarnation="restart-incarnation",
            process_identity=lambda _pid: ("dead", ""),
        )

        disposition = restarted.park_from_durable_interaction(
            session_id="session-dead-reconcile",
            interaction_id="interaction-dead-reconcile",
            source_attempt_id="attempt-dead-owner",
            owner_attempt_id="attempt-dead-owner",
        )
        self.assertEqual(disposition, "parked")
        restarted.bind_receipt(
            session_id="session-dead-reconcile",
            interaction_id="interaction-dead-reconcile",
            source_attempt_id="attempt-dead-owner",
            receipt_id="receipt-dead-reconcile",
        )
        restarted.transfer_parked(
            session_id="session-dead-reconcile",
            interaction_id="interaction-dead-reconcile",
            source_attempt_id="attempt-dead-owner",
            receipt_id="receipt-dead-reconcile",
            attempt_id="attempt-cold-recovery",
        )
        recovered = restarted.snapshot("session-dead-reconcile")
        self.assertEqual(
            (recovered.state, recovered.attempt_id),
            ("active", "attempt-cold-recovery"),
        )
        restarted.release_run(
            "session-dead-reconcile",
            "attempt-cold-recovery",
        )


if __name__ == "__main__":
    unittest.main()
