from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import execution_lineage as lineage  # noqa: E402


class ExecutionLineageRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.registry = lineage.ExecutionLineageRegistry(self.temp_dir.name)

    def test_stop_a_does_not_cancel_b_in_the_same_session(self) -> None:
        self.registry.register_attempt("chat-shared", "logical-a", "attempt-a1")
        self.registry.mark_running("chat-shared", "logical-a", "attempt-a1")
        self.registry.register_attempt("chat-shared", "logical-b", "attempt-b1")
        self.registry.mark_running("chat-shared", "logical-b", "attempt-b1")

        cancelled = self.registry.request_cancel(
            "chat-shared",
            "logical-a",
            attempt_id="attempt-a1",
            reason="user stop",
        )
        completed_b = self.registry.mark_completed(
            "chat-shared",
            "logical-b",
            "attempt-b1",
        )

        self.assertEqual(cancelled.status, "cancelled")
        self.assertEqual(completed_b.status, "completed")
        self.assertFalse(self.registry.is_cancelled("chat-shared", "logical-b"))

    def test_cold_restart_preserves_tombstone_and_blocks_future_resume(self) -> None:
        self.registry.register_attempt("chat-restart", "logical-a", "attempt-a1")
        self.registry.request_cancel(
            "chat-restart",
            "logical-a",
            attempt_id="attempt-a1",
            reason="stop before restart",
        )

        restarted = lineage.ExecutionLineageRegistry(self.temp_dir.name)
        resume = restarted.register_attempt(
            "chat-restart",
            "logical-a",
            "attempt-a2",
        )

        self.assertEqual(resume.disposition, "cancelled")
        self.assertEqual(resume.status, "cancelled")
        self.assertEqual(resume.snapshot.current_attempt_id, "attempt-a1")
        self.assertEqual(resume.snapshot.reason, "stop before restart")

    def test_stale_attempt_stop_cancels_its_lineage_not_another_turn(self) -> None:
        self.registry.register_attempt("chat-stale", "logical-a", "attempt-a1")
        self.registry.mark_waiting_interaction(
            "chat-stale",
            "logical-a",
            "attempt-a1",
        )
        self.registry.register_attempt("chat-stale", "logical-a", "attempt-a2")
        self.registry.mark_running("chat-stale", "logical-a", "attempt-a2")
        self.registry.register_attempt("chat-stale", "logical-b", "attempt-b1")

        cancelled = self.registry.request_cancel(
            "chat-stale",
            "logical-a",
            attempt_id="attempt-a1",
        )

        self.assertEqual(cancelled.status, "cancelled")
        self.assertEqual(cancelled.snapshot.current_attempt_id, "attempt-a2")
        self.assertEqual(
            self.registry.snapshot("chat-stale", "logical-b").status,
            "registered",
        )

    def test_waiting_boundary_allows_one_successor_but_active_race_does_not(self) -> None:
        self.registry.register_attempt("chat-race", "logical-a", "attempt-a1")
        self.registry.mark_waiting_job("chat-race", "logical-a", "attempt-a1")

        winner = self.registry.register_attempt(
            "chat-race",
            "logical-a",
            "attempt-a2",
        )
        loser = self.registry.register_attempt(
            "chat-race",
            "logical-a",
            "attempt-a3",
        )

        self.assertEqual(winner.disposition, "applied")
        self.assertEqual(loser.disposition, "active_attempt_conflict")
        self.assertEqual(loser.snapshot.current_attempt_id, "attempt-a2")

    def test_abandoned_admission_allows_a_successor(self) -> None:
        self.registry.register_attempt(
            "chat-abandoned",
            "logical-a",
            "attempt-a1",
        )
        abandoned = self.registry.mark_abandoned(
            "chat-abandoned",
            "logical-a",
            "attempt-a1",
            reason="bind failed",
        )
        successor = self.registry.register_attempt(
            "chat-abandoned",
            "logical-a",
            "attempt-a2",
        )

        self.assertEqual(abandoned.status, "abandoned")
        self.assertEqual(abandoned.snapshot.reason, "bind failed")
        self.assertEqual(successor.disposition, "applied")

    def test_source_match_cannot_steal_same_boot_active_owner(self) -> None:
        self.registry.register_attempt("chat-handoff", "logical-a", "attempt-a1")

        active_conflict = self.registry.register_attempt(
            "chat-handoff",
            "logical-a",
            "attempt-a2",
            source_attempt_id="attempt-a1",
        )
        self.assertEqual(active_conflict.disposition, "active_attempt_conflict")
        self.assertEqual(
            active_conflict.snapshot.current_attempt_id,
            "attempt-a1",
        )

        self.registry.mark_waiting_interaction(
            "chat-handoff",
            "logical-a",
            "attempt-a1",
        )
        winner = self.registry.register_attempt(
            "chat-handoff",
            "logical-a",
            "attempt-a2",
            source_attempt_id="attempt-a1",
        )
        loser = self.registry.register_attempt(
            "chat-handoff",
            "logical-a",
            "attempt-a3",
            source_attempt_id="attempt-a1",
        )

        self.assertEqual(winner.disposition, "applied")
        self.assertEqual(loser.disposition, "active_attempt_conflict")
        self.assertEqual(loser.snapshot.current_attempt_id, "attempt-a2")

    def test_writer_never_opens_parent_directory_on_windows(self) -> None:
        record_path = Path(self.temp_dir.name) / "lineage.json"
        snapshot = lineage.ExecutionLineageRegistry._new_snapshot(
            "chat-windows",
            "logical-windows",
            attempt_id="attempt-windows",
            status="registered",
            now_ms=1,
            owner_instance_id="boot-windows",
        )
        real_open = lineage.os.open
        opened_paths = []

        def tracked_open(path, flags, *args, **kwargs):
            opened_paths.append(os.fspath(path))
            return real_open(path, flags, *args, **kwargs)

        from unittest import mock

        with mock.patch.object(lineage.os, "name", "nt"), mock.patch.object(
            lineage.os,
            "open",
            side_effect=tracked_open,
        ):
            lineage.ExecutionLineageRegistry._write_record(
                record_path,
                snapshot,
            )

        self.assertTrue(record_path.exists())
        self.assertNotIn(os.fspath(record_path.parent), opened_paths)

    def test_new_sidecar_can_take_over_active_resume_from_valid_checkpoint(self) -> None:
        first_boot = lineage.ExecutionLineageRegistry(
            self.temp_dir.name,
            instance_id="boot-1",
        )
        first_boot.register_attempt("chat-restart", "logical-a", "attempt-a")
        first_boot.mark_waiting_interaction(
            "chat-restart",
            "logical-a",
            "attempt-a",
        )
        first_boot.register_attempt(
            "chat-restart",
            "logical-a",
            "attempt-b",
            source_attempt_id="attempt-a",
        )
        first_boot.mark_running("chat-restart", "logical-a", "attempt-b")

        restarted = lineage.ExecutionLineageRegistry(
            self.temp_dir.name,
            instance_id="boot-2",
        )
        recovered = restarted.register_attempt(
            "chat-restart",
            "logical-a",
            "attempt-c",
            source_attempt_id="attempt-a",
        )
        duplicate = restarted.register_attempt(
            "chat-restart",
            "logical-a",
            "attempt-d",
            source_attempt_id="attempt-a",
        )

        self.assertEqual(recovered.disposition, "applied")
        self.assertEqual(recovered.snapshot.current_attempt_id, "attempt-c")
        self.assertEqual(recovered.snapshot.owner_instance_id, "boot-2")
        self.assertEqual(duplicate.disposition, "active_attempt_conflict")
        self.assertEqual(duplicate.snapshot.current_attempt_id, "attempt-c")

    def test_terminal_lineages_never_accept_a_later_attempt(self) -> None:
        self.registry.register_attempt("chat-done", "logical-a", "attempt-a1")
        self.registry.mark_completed("chat-done", "logical-a", "attempt-a1")
        completed_retry = self.registry.register_attempt(
            "chat-done",
            "logical-a",
            "attempt-a2",
        )

        self.registry.register_attempt("chat-stop", "logical-b", "attempt-b1")
        self.registry.request_cancel("chat-stop", "logical-b")
        cancelled_retry = self.registry.register_attempt(
            "chat-stop",
            "logical-b",
            "attempt-b2",
        )

        self.assertEqual(completed_retry.disposition, "already_terminal")
        self.assertEqual(completed_retry.snapshot.current_attempt_id, "attempt-a1")
        self.assertEqual(cancelled_retry.disposition, "cancelled")
        self.assertEqual(cancelled_retry.snapshot.current_attempt_id, "attempt-b1")

    def test_completed_lineage_wins_over_late_stop(self) -> None:
        self.registry.register_attempt("chat-terminal", "logical-a", "attempt-a")
        completed = self.registry.mark_completed(
            "chat-terminal",
            "logical-a",
            "attempt-a",
        )
        late_stop = self.registry.request_cancel(
            "chat-terminal",
            "logical-a",
            attempt_id="attempt-a",
        )

        self.assertEqual(completed.status, "completed")
        self.assertEqual(late_stop.disposition, "already_terminal")
        self.assertEqual(late_stop.status, "completed")

    def test_record_contains_hashed_path_and_revisioned_identity(self) -> None:
        self.registry.register_attempt("../../chat", "../logical", "attempt-1")
        self.registry.mark_running("../../chat", "../logical", "attempt-1")

        records = list(
            (Path(self.temp_dir.name) / "execution_lineages").glob("*/*.json")
        )
        self.assertEqual(len(records), 1)
        payload = json.loads(records[0].read_text(encoding="utf-8"))
        self.assertEqual(payload["session_id"], "../../chat")
        self.assertEqual(payload["logical_execution_id"], "../logical")
        self.assertEqual(payload["current_attempt_id"], "attempt-1")
        self.assertEqual(payload["revision"], 2)


if __name__ == "__main__":
    unittest.main()
