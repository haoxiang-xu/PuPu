import sqlite3
import tempfile
import time
import unittest
from pathlib import Path

from memory_v2_deletion import MemoryV2DeletionProcessor
from memory_v2_deletion_runner import MemoryV2DeletionRunner
from memory_v2_store import MemoryV2Store


class MutableClock:
    def __init__(self, value=1_000_000):
        self.value = value

    def __call__(self):
        return self.value

    def advance(self, milliseconds):
        self.value += milliseconds


class Runtime:
    def __init__(self, store):
        self.store = store


class FailCompletionOnceStore:
    def __init__(self, store):
        self.store = store
        self.failures_left = 1

    def __getattr__(self, name):
        return getattr(self.store, name)

    def complete_deletion(self, **kwargs):
        if self.failures_left:
            self.failures_left -= 1
            raise RuntimeError("simulated crash before completion receipt")
        return self.store.complete_deletion(**kwargs)


class MemoryV2DeletionRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name) / "memory_v2"
        self.clock = MutableClock()
        self.store = MemoryV2Store(self.root, clock=self.clock)

    def tearDown(self):
        self.store.close()
        self.temp_dir.cleanup()

    def _bootstrap_and_delete(self, owner_chat_id="chat_a"):
        self.store.bootstrap_current_request(
            owner_chat_id=owner_chat_id,
            session_id=f"session_{owner_chat_id}",
            attempt_id=f"attempt_{owner_chat_id}",
            message={"content": "request"},
            operation_id=f"bootstrap_{owner_chat_id}",
        )
        return self.store.delete_chat(
            owner_chat_id=owner_chat_id,
            operation_id=f"delete_{owner_chat_id}",
        )

    def _outbox_row(self, deletion_id):
        with sqlite3.connect(self.store.db_path) as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute(
                "SELECT * FROM deletion_outbox WHERE deletion_id=?", (deletion_id,)
            ).fetchone()
        return dict(row)

    def test_startup_drain_recovers_an_expired_crash_lease(self):
        deleted = self._bootstrap_and_delete()
        MemoryV2DeletionProcessor(
            self.store,
            worker_id="crashed_worker",
            lease_ms=1_000,
        ).claim_once(cycle_id="crashed_cycle")
        self.clock.advance(1_001)

        runner = MemoryV2DeletionRunner(
            lambda: Runtime(self.store),
            worker_id="restart_worker",
            lease_ms=1_000,
        )
        results = runner.drain_once()

        self.assertEqual([result.status for result in results], ["completed", "idle"])
        row = self._outbox_row(deleted["deletion_id"])
        self.assertEqual(row["status"], "completed")
        self.assertEqual(row["attempt_count"], 2)

    def test_crash_after_logical_cleanup_resumes_idempotently_after_lease_expiry(self):
        deleted = self._bootstrap_and_delete()
        failing_store = FailCompletionOnceStore(self.store)
        failed = MemoryV2DeletionProcessor(
            failing_store,
            worker_id="crashed_worker",
            lease_ms=1_000,
        ).process_once(cycle_id="crashed_cycle")
        self.assertEqual(failed.status, "retryable_failure")
        self.clock.advance(1_001)

        resumed = MemoryV2DeletionRunner(
            lambda: Runtime(self.store),
            worker_id="restart_worker",
            lease_ms=1_000,
        ).drain_once()
        replay = MemoryV2DeletionRunner(
            lambda: Runtime(self.store),
            worker_id="restart_worker",
        ).drain_once()

        self.assertEqual(resumed[0].status, "completed")
        self.assertEqual(replay[0].status, "idle")
        row = self._outbox_row(deleted["deletion_id"])
        self.assertEqual(row["status"], "completed")
        self.assertEqual(row["attempt_count"], 2)

    def test_background_worker_processes_newly_enqueued_deletion_promptly(self):
        runner = MemoryV2DeletionRunner(
            lambda: Runtime(self.store),
            worker_id="live_worker",
            poll_interval_ms=5,
        )
        runner.start()
        try:
            deleted = self._bootstrap_and_delete()
            deadline = time.monotonic() + 1.0
            row = self._outbox_row(deleted["deletion_id"])
            while row["status"] != "completed" and time.monotonic() < deadline:
                time.sleep(0.01)
                row = self._outbox_row(deleted["deletion_id"])
        finally:
            runner.stop()

        self.assertEqual(row["status"], "completed")


if __name__ == "__main__":
    unittest.main()
