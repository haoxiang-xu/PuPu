from __future__ import annotations

import json
import multiprocessing
import os
import stat
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import execution_control as control  # noqa: E402


def _terminal_worker(
    data_dir: str,
    action: str,
    gate,
    results,
) -> None:
    registry = control.ExecutionControlRegistry(data_dir)
    gate.wait(timeout=5)
    if action == "complete":
        result = registry.mark_completed("chat-race", "attempt-race")
    else:
        result = registry.request_cancel(
            "chat-race",
            "attempt-race",
            reason="stop",
        )
    results.put((result.disposition, result.status, result.snapshot.revision))


class ExecutionControlRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.registry = control.ExecutionControlRegistry(self.temp_dir.name)

    def test_lifecycle_is_idempotent_and_terminal_state_is_monotonic(self) -> None:
        registered = self.registry.register("chat-1", "attempt-1")
        duplicate_register = self.registry.register("chat-1", "attempt-1")
        running = self.registry.mark_running("chat-1", "attempt-1")
        duplicate_running = self.registry.mark_running("chat-1", "attempt-1")
        completed = self.registry.mark_completed("chat-1", "attempt-1")
        duplicate_completed = self.registry.mark_completed("chat-1", "attempt-1")
        late_failure = self.registry.mark_failed(
            "chat-1",
            "attempt-1",
            reason="late failure",
        )
        late_cancel = self.registry.request_cancel(
            "chat-1",
            "attempt-1",
            reason="late stop",
        )

        self.assertEqual((registered.disposition, registered.status), ("applied", "registered"))
        self.assertEqual(duplicate_register.disposition, "unchanged")
        self.assertEqual((running.disposition, running.status), ("applied", "running"))
        self.assertEqual(duplicate_running.disposition, "unchanged")
        self.assertEqual((completed.disposition, completed.status), ("applied", "completed"))
        self.assertEqual(duplicate_completed.disposition, "unchanged")
        self.assertEqual(late_failure.disposition, "already_terminal")
        self.assertEqual(late_cancel.disposition, "already_terminal")
        self.assertEqual(late_cancel.status, "completed")
        self.assertEqual(late_cancel.snapshot.revision, 3)
        self.assertFalse(self.registry.cancellation_event("chat-1", "attempt-1").is_set())

    def test_cancel_before_register_persists_a_tombstone_and_never_revives(self) -> None:
        cancelled = self.registry.request_cancel(
            "chat-before-register",
            "attempt-before-register",
            reason="user pressed stop",
        )

        self.assertEqual(cancelled.disposition, "cancelled_before_register")
        self.assertEqual(cancelled.status, "cancelled")
        self.assertIsNone(cancelled.snapshot.registered_at_ms)
        self.assertEqual(cancelled.snapshot.reason, "user pressed stop")

        restarted = control.ExecutionControlRegistry(self.temp_dir.name)
        token = restarted.cancellation_token(
            "chat-before-register",
            "attempt-before-register",
        )
        self.assertTrue(token.is_cancelled())
        self.assertTrue(token.event.is_set())
        self.assertEqual(token.reason, "user pressed stop")

        register = restarted.register(
            "chat-before-register",
            "attempt-before-register",
        )
        running = restarted.mark_running(
            "chat-before-register",
            "attempt-before-register",
        )
        completed = restarted.mark_completed(
            "chat-before-register",
            "attempt-before-register",
        )
        self.assertEqual(register.disposition, "cancelled_before_register")
        self.assertEqual(running.disposition, "already_terminal")
        self.assertEqual(completed.disposition, "already_terminal")
        self.assertEqual(completed.status, "cancelled")
        self.assertEqual(completed.snapshot.revision, 1)

    def test_cancel_of_running_attempt_sets_only_its_exact_event(self) -> None:
        first = self.registry.cancellation_token("chat-shared", "owner-a")
        second = self.registry.cancellation_token("chat-shared", "owner-b")
        self.registry.mark_running("chat-shared", "owner-a")
        self.registry.mark_running("chat-shared", "owner-b")

        cancelled = self.registry.request_cancel(
            "chat-shared",
            "owner-a",
            reason="stop owner a",
        )
        completed = self.registry.mark_completed("chat-shared", "owner-b")

        self.assertEqual(cancelled.disposition, "applied")
        self.assertTrue(first.is_cancelled())
        self.assertFalse(second.is_cancelled())
        self.assertEqual(completed.status, "completed")
        with self.assertRaises(control.ExecutionAttemptCancelled) as raised:
            first.raise_if_cancelled()
        self.assertEqual(raised.exception.reason, "stop owner a")

    def test_failed_attempt_is_terminal_and_first_failure_reason_wins(self) -> None:
        failed = self.registry.mark_failed(
            "chat-failed",
            "attempt-failed",
            reason="provider failed",
        )
        repeated = self.registry.mark_failed(
            "chat-failed",
            "attempt-failed",
            reason="different retry text",
        )
        completed = self.registry.mark_completed("chat-failed", "attempt-failed")

        self.assertEqual(failed.disposition, "applied")
        self.assertEqual(repeated.disposition, "unchanged")
        self.assertEqual(repeated.snapshot.reason, "provider failed")
        self.assertEqual(completed.disposition, "already_terminal")
        self.assertEqual(completed.status, "failed")

    def test_token_wait_observes_cancel_written_by_an_independent_registry(self) -> None:
        observer = control.ExecutionControlRegistry(self.temp_dir.name)
        writer = control.ExecutionControlRegistry(self.temp_dir.name)
        token = observer.cancellation_token("chat-wait", "attempt-wait")

        thread = threading.Thread(
            target=lambda: (
                time.sleep(0.05),
                writer.request_cancel("chat-wait", "attempt-wait", reason="remote stop"),
            ),
        )
        thread.start()
        try:
            self.assertTrue(token.wait(2.0))
        finally:
            thread.join(timeout=2.0)
        self.assertFalse(thread.is_alive())
        self.assertEqual(token.reason, "remote stop")

    def test_token_throttles_cross_process_disk_refresh_on_hot_paths(self) -> None:
        class CountingRegistry:
            def __init__(self) -> None:
                self.calls = 0

            def snapshot(self, _session_id, _attempt_id):
                self.calls += 1
                return None

        registry = CountingRegistry()
        token = control.ExecutionCancellationToken(
            registry=registry,
            session_id="chat-hot",
            attempt_id="attempt-hot",
            event=threading.Event(),
        )

        for _ in range(500):
            self.assertFalse(token.is_cancelled())
        self.assertEqual(registry.calls, 1)

        time.sleep(0.06)
        self.assertFalse(token.is_cancelled())
        self.assertEqual(registry.calls, 2)

    def test_completion_and_cancel_share_one_cross_process_cas(self) -> None:
        self.registry.register("chat-race", "attempt-race")
        self.registry.mark_running("chat-race", "attempt-race")
        context = multiprocessing.get_context("spawn")
        gate = context.Event()
        results = context.Queue()
        processes = [
            context.Process(
                target=_terminal_worker,
                args=(self.temp_dir.name, action, gate, results),
            )
            for action in ("complete", "cancel")
        ]
        for process in processes:
            process.start()
        gate.set()
        outcomes = [results.get(timeout=8) for _ in processes]
        for process in processes:
            process.join(timeout=8)
            self.assertFalse(process.is_alive())
            self.assertEqual(process.exitcode, 0)

        self.assertEqual(
            sorted(disposition for disposition, _status, _revision in outcomes),
            ["already_terminal", "applied"],
        )
        winner = self.registry.snapshot("chat-race", "attempt-race")
        self.assertIsNotNone(winner)
        self.assertIn(winner.status, {"completed", "cancelled"})
        self.assertEqual(winner.revision, 3)
        for _disposition, status, revision in outcomes:
            self.assertEqual(status, winner.status)
            self.assertEqual(revision, 3)

    def test_missing_mark_running_and_completion_are_safe_upserts(self) -> None:
        running = self.registry.mark_running("chat-upsert", "attempt-running")
        completed = self.registry.mark_completed("chat-upsert", "attempt-completed")

        self.assertEqual(running.status, "running")
        self.assertIsNotNone(running.snapshot.registered_at_ms)
        self.assertEqual(completed.status, "completed")
        self.assertTrue(completed.snapshot.terminal)
        self.assertEqual(
            self.registry.request_cancel(
                "chat-upsert",
                "attempt-completed",
                reason="late",
            ).disposition,
            "already_terminal",
        )

    def test_records_live_under_unchain_data_dir_executions_with_private_modes(self) -> None:
        self.registry.register("../../chat/path", "../attempt/path")
        root = Path(self.temp_dir.name) / "executions"
        records = list(root.glob("*/*.json"))

        self.assertEqual(len(records), 1)
        self.assertNotIn("chat", str(records[0].relative_to(root)))
        raw = json.loads(records[0].read_text(encoding="utf-8"))
        self.assertEqual(raw["session_id"], "../../chat/path")
        self.assertEqual(raw["attempt_id"], "../attempt/path")
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(root.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE(records[0].stat().st_mode), 0o600)

    def test_corrupt_record_fails_closed_instead_of_being_overwritten(self) -> None:
        self.registry.register("chat-corrupt", "attempt-corrupt")
        record = next((Path(self.temp_dir.name) / "executions").glob("*/*.json"))
        record.write_text("{not-json", encoding="utf-8")

        with self.assertRaises(control.ExecutionControlError) as raised:
            self.registry.request_cancel(
                "chat-corrupt",
                "attempt-corrupt",
                reason="stop",
            )
        self.assertEqual(raised.exception.code, "execution_control_corrupt")
        self.assertEqual(record.read_text(encoding="utf-8"), "{not-json")

    def test_structurally_invalid_record_is_reported_as_corrupt(self) -> None:
        self.registry.register("chat-invalid", "attempt-invalid")
        record = next((Path(self.temp_dir.name) / "executions").glob("*/*.json"))
        payload = json.loads(record.read_text(encoding="utf-8"))
        payload["session_id"] = ""
        record.write_text(json.dumps(payload), encoding="utf-8")

        with self.assertRaises(control.ExecutionControlError) as raised:
            self.registry.snapshot("chat-invalid", "attempt-invalid")
        self.assertEqual(raised.exception.code, "execution_control_corrupt")

    def test_invalid_identifiers_and_missing_data_directory_fail_cleanly(self) -> None:
        with self.assertRaises(control.ExecutionControlError) as invalid:
            self.registry.register("", "attempt")
        self.assertEqual(invalid.exception.code, "invalid_session_id")
        self.assertEqual(invalid.exception.status_code, 400)

        registry = control.ExecutionControlRegistry()
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(control.ExecutionControlError) as unavailable:
                registry.snapshot("chat", "attempt")
        self.assertEqual(unavailable.exception.code, "execution_control_unavailable")
        self.assertEqual(unavailable.exception.status_code, 503)

    def test_module_level_wrappers_follow_the_current_unchain_data_dir(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": self.temp_dir.name},
            clear=False,
        ):
            result = control.register("chat-module", "attempt-module")
            token = control.cancellation_token("chat-module", "attempt-module")
            cancelled = control.request_cancel(
                "chat-module",
                "attempt-module",
                reason="module stop",
            )

        self.assertEqual(result.disposition, "applied")
        self.assertEqual(cancelled.status, "cancelled")
        self.assertTrue(token.event.is_set())
        self.assertEqual(control.get_registry(), control.get_execution_control_registry())


if __name__ == "__main__":
    unittest.main()
