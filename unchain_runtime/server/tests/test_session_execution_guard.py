from __future__ import annotations

import json
import multiprocessing
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import session_execution_guard as guard  # noqa: E402


def _active_guard_worker(data_dir: str, ready, release, results) -> None:
    registry = guard.SessionExecutionGuardRegistry(data_dir)
    disposition = registry.acquire(
        "session-two-process",
        "attempt-worker",
        operation="run",
        execution_id="session-two-process",
    )
    snapshot = registry.snapshot("session-two-process")
    results.put((disposition, snapshot.owner_pid))
    ready.set()
    release.wait(timeout=20)


def _parked_guard_worker(data_dir: str, results) -> None:
    registry = guard.SessionExecutionGuardRegistry(data_dir)
    registry.acquire(
        "session-parked-crash",
        "attempt-parked",
        operation="run",
        execution_id="session-parked-crash",
    )
    registry.park(
        session_id="session-parked-crash",
        interaction_id="interaction-parked",
        source_attempt_id="attempt-parked",
    )
    results.put(registry.snapshot("session-parked-crash").state)


def _record_lock_worker(lock_path: str, ready, release) -> None:
    import fcntl

    descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        ready.set()
        release.wait(timeout=20)
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


class SessionExecutionGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.registry = guard.SessionExecutionGuardRegistry(self.temp_dir.name)
        self.registry.initialize_protocol()

    def test_two_processes_serialize_one_session_and_dead_owner_reclaims(self) -> None:
        context = multiprocessing.get_context("spawn")
        ready = context.Event()
        release = context.Event()
        results = context.Queue()
        process = context.Process(
            target=_active_guard_worker,
            args=(self.temp_dir.name, ready, release, results),
        )
        process.start()
        self.assertTrue(ready.wait(timeout=8))
        disposition, owner_pid = results.get(timeout=8)
        self.assertEqual(disposition, "acquired")
        self.assertEqual(owner_pid, process.pid)

        record_path = self.registry._record_path("session-two-process")
        before = record_path.read_bytes()
        started = time.monotonic()
        with self.assertRaises(guard.SessionExecutionInProgress):
            self.registry.acquire(
                "session-two-process",
                "operation-rebase",
                operation="rebase",
                execution_id="execution-two-process",
            )
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertEqual(record_path.read_bytes(), before)

        process.terminate()
        process.join(timeout=8)
        self.assertFalse(process.is_alive())
        reclaimed = self.registry.acquire(
            "session-two-process",
            "operation-rebase",
            operation="rebase",
            execution_id="execution-two-process",
        )
        self.assertEqual(reclaimed, "reclaimed")
        self.assertEqual(
            self.registry.snapshot("session-two-process").attempt_id,
            "operation-rebase",
        )

    def test_dead_parked_owner_is_never_pid_reclaimed(self) -> None:
        context = multiprocessing.get_context("spawn")
        results = context.Queue()
        process = context.Process(
            target=_parked_guard_worker,
            args=(self.temp_dir.name, results),
        )
        process.start()
        self.assertEqual(results.get(timeout=8), "parked")
        process.join(timeout=8)
        self.assertEqual(process.exitcode, 0)

        with self.assertRaises(guard.SessionExecutionInProgress) as blocked:
            self.registry.acquire(
                "session-parked-crash",
                "operation-rebase",
                operation="rebase",
                execution_id="execution-parked-crash",
            )
        self.assertEqual(blocked.exception.state, "parked")

    @unittest.skipIf(os.name == "nt", "POSIX flock holder fixture")
    def test_lock_contention_is_bounded_and_does_not_change_record(self) -> None:
        self.registry.acquire(
            "session-lock-holder",
            "attempt-lock-holder",
            operation="run",
            execution_id="session-lock-holder",
        )
        record_path = self.registry._record_path("session-lock-holder")
        before = record_path.read_bytes()
        lock_path = self.registry._lock_path(record_path)
        context = multiprocessing.get_context("spawn")
        ready = context.Event()
        release = context.Event()
        process = context.Process(
            target=_record_lock_worker,
            args=(str(lock_path), ready, release),
        )
        process.start()
        self.assertTrue(ready.wait(timeout=8))
        started = time.monotonic()
        try:
            with self.assertRaises(guard.SessionExecutionGuardBusy) as busy:
                self.registry.snapshot("session-lock-holder")
            self.assertEqual(busy.exception.status_code, 409)
            self.assertLess(time.monotonic() - started, 1.0)
            self.assertEqual(record_path.read_bytes(), before)
        finally:
            release.set()
            process.join(timeout=8)
        self.assertEqual(process.exitcode, 0)

    def test_windows_lock_opens_backing_file_in_binary_mode(self) -> None:
        lock_path = Path(self.temp_dir.name) / "windows.lock"
        descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
        observed_open_flags: list[int] = []
        observed_lock_calls: list[tuple[int, int, int]] = []

        class FakeMsvcrt:
            LK_NBLCK = 1
            LK_UNLCK = 2

            @staticmethod
            def locking(file_descriptor: int, mode: int, length: int) -> None:
                observed_lock_calls.append((file_descriptor, mode, length))

        def open_lock_file(_path: Path, flags: int, _mode: int) -> int:
            observed_open_flags.append(flags)
            return descriptor

        with (
            mock.patch.object(guard.os, "name", "nt"),
            mock.patch.object(guard, "_WINDOWS_BINARY_FLAG", 0x8000),
            mock.patch.object(guard.os, "open", side_effect=open_lock_file),
            mock.patch.dict(sys.modules, {"msvcrt": FakeMsvcrt}),
        ):
            with guard._exclusive_file_lock(lock_path):
                pass

        self.assertEqual(observed_open_flags, [os.O_RDWR | os.O_CREAT | 0x8000])
        self.assertEqual(
            observed_lock_calls,
            [
                (descriptor, FakeMsvcrt.LK_NBLCK, 1),
                (descriptor, FakeMsvcrt.LK_UNLCK, 1),
            ],
        )

    def test_parked_receipt_resume_and_cancel_require_exact_lineage(self) -> None:
        self.registry.acquire(
            "session-lineage",
            "attempt-original",
            operation="run",
            execution_id="session-lineage",
        )
        self.registry.park(
            session_id="session-lineage",
            interaction_id="interaction-lineage",
            source_attempt_id="attempt-original",
        )
        self.registry.bind_receipt(
            session_id="session-lineage",
            interaction_id="interaction-lineage",
            source_attempt_id="attempt-original",
            receipt_id="receipt-lineage",
        )
        restarted = guard.SessionExecutionGuardRegistry(
            self.temp_dir.name,
            process_owner_id="restart-owner",
            process_pid=os.getpid(),
            process_incarnation=self.registry._process_incarnation,
        )
        with self.assertRaises(guard.SessionExecutionGuardError):
            restarted.transfer_parked(
                session_id="session-lineage",
                interaction_id="interaction-lineage",
                source_attempt_id="attempt-original",
                receipt_id="receipt-wrong",
                attempt_id="attempt-resumed",
            )
        restarted.transfer_parked(
            session_id="session-lineage",
            interaction_id="interaction-lineage",
            source_attempt_id="attempt-original",
            receipt_id="receipt-lineage",
            attempt_id="attempt-resumed",
        )
        resumed = restarted.snapshot("session-lineage")
        self.assertEqual((resumed.state, resumed.attempt_id), ("active", "attempt-resumed"))
        restarted.release_run("session-lineage", "attempt-resumed")

        self.assertEqual(
            restarted.park_from_durable_interaction(
                session_id="session-old-pending",
                interaction_id="interaction-old-pending",
                source_attempt_id="attempt-old-pending",
                owner_attempt_id="attempt-old-pending",
            ),
            "parked_from_durable_interaction",
        )
        restarted.consume_parked(
            session_id="session-old-pending",
            interaction_id="interaction-old-pending",
            source_attempt_id="attempt-old-pending",
        )
        self.assertIsNone(restarted.snapshot("session-old-pending"))

    def test_durable_park_rejects_a_different_active_attempt(self) -> None:
        self.registry.acquire(
            "session-stale-interaction",
            "attempt-current",
            operation="run",
            execution_id="session-stale-interaction",
        )
        record_path = self.registry._record_path("session-stale-interaction")
        before = record_path.read_bytes()

        with self.assertRaises(guard.SessionExecutionGuardError) as mismatch:
            self.registry.park_from_durable_interaction(
                session_id="session-stale-interaction",
                interaction_id="interaction-stale",
                source_attempt_id="attempt-stale",
                owner_attempt_id="attempt-stale",
            )

        self.assertEqual(
            mismatch.exception.code,
            "session_guard_interaction_attempt_mismatch",
        )
        self.assertFalse(mismatch.exception.retryable)
        self.assertEqual(record_path.read_bytes(), before)
        current = self.registry.snapshot("session-stale-interaction")
        self.assertEqual(current.state, "active")
        self.assertEqual(current.attempt_id, "attempt-current")

    def test_graph_park_preserves_distinct_owner_and_step_source(self) -> None:
        self.registry.acquire(
            "session-graph",
            "attempt-coordinator",
            operation="run",
            execution_id="session-graph",
        )
        record_path = self.registry._record_path("session-graph")
        before = record_path.read_bytes()

        with self.assertRaises(guard.SessionExecutionGuardError) as foreign:
            self.registry.park(
                session_id="session-graph",
                interaction_id="interaction-graph",
                source_attempt_id="attempt-step",
                owner_attempt_id="attempt-foreign-coordinator",
            )
        self.assertEqual(
            foreign.exception.code,
            "session_guard_interaction_attempt_mismatch",
        )
        self.assertEqual(record_path.read_bytes(), before)

        self.registry.park(
            session_id="session-graph",
            interaction_id="interaction-graph",
            source_attempt_id="attempt-step",
            owner_attempt_id="attempt-coordinator",
        )
        parked = self.registry.snapshot("session-graph")
        self.assertEqual(parked.state, "parked")
        self.assertEqual(parked.attempt_id, "attempt-coordinator")
        self.assertEqual(
            parked.interaction_source_attempt_id,
            "attempt-step",
        )

        parked_bytes = record_path.read_bytes()
        with self.assertRaises(guard.SessionExecutionGuardError):
            self.registry.park_from_durable_interaction(
                session_id="session-graph",
                interaction_id="interaction-graph",
                source_attempt_id="attempt-step",
                owner_attempt_id="attempt-foreign-coordinator",
            )
        self.assertEqual(record_path.read_bytes(), parked_bytes)

    def test_protocol_migration_requires_explicit_stop_the_world(self) -> None:
        migration_dir = Path(self.temp_dir.name) / "migration"
        legacy = migration_dir / "executions" / "legacy"
        legacy.mkdir(parents=True)
        (legacy / "attempt.json").write_text("{}", encoding="utf-8")
        registry = guard.SessionExecutionGuardRegistry(migration_dir)

        with self.assertRaises(guard.SessionExecutionGuardError) as required:
            registry.initialize_protocol()
        self.assertEqual(
            required.exception.code,
            "session_guard_stop_the_world_required",
        )
        registry.initialize_protocol(stop_the_world=True)
        marker = migration_dir / "session_execution_guards" / "protocol.json"
        self.assertEqual(
            json.loads(marker.read_text(encoding="utf-8")),
            {
                "schema": "pupu.session-execution-guard.protocol.v1",
                "protocol_version": 1,
                "compatibility": "exact",
            },
        )


if __name__ == "__main__":
    unittest.main()
