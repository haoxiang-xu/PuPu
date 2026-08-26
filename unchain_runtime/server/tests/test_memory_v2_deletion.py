import sqlite3
import tempfile
import unittest
from pathlib import Path

from memory_v2_deletion import MemoryV2DeletionProcessor
from memory_v2_store import MemoryV2Store


class MutableClock:
    def __init__(self, value=1_000_000):
        self.value = value

    def __call__(self):
        return self.value

    def advance(self, milliseconds):
        self.value += milliseconds


class FailOnceStore:
    def __init__(self, store):
        self.store = store
        self.failures_left = 1

    def __getattr__(self, name):
        return getattr(self.store, name)

    def delete_chat(self, **kwargs):
        if self.failures_left:
            self.failures_left -= 1
            raise RuntimeError("sensitive internal failure")
        return self.store.delete_chat(**kwargs)


class InvalidClaimStore:
    def __init__(self, deletion):
        self.deletion = deletion
        self.delete_chat_calls = []
        self.complete_calls = []

    def claim_deletion(self, **_kwargs):
        return {"deletion": dict(self.deletion), "replayed": False}

    def delete_chat(self, **kwargs):
        self.delete_chat_calls.append(kwargs)
        raise AssertionError("invalid claim must not reach logical deletion")

    def complete_deletion(self, **kwargs):
        self.complete_calls.append(kwargs)
        raise AssertionError("invalid claim must not be completed")


class MemoryV2DeletionProcessorTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name) / "memory_v2"
        self.clock = MutableClock()
        self.store = MemoryV2Store(self.root, clock=self.clock)

    def tearDown(self):
        self.store.close()
        self.temp_dir.cleanup()

    def _bootstrap_chat(self, owner_chat_id, suffix):
        self.store.bootstrap_current_request(
            owner_chat_id=owner_chat_id,
            session_id=f"session_{suffix}",
            attempt_id=f"attempt_{suffix}",
            message={"content": f"request {suffix}"},
            operation_id=f"bootstrap_{suffix}",
        )

    def _outbox_row(self, owner_chat_id):
        with sqlite3.connect(self.store.db_path) as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute(
                "SELECT * FROM deletion_outbox WHERE owner_chat_id=? AND entity_type='chat'",
                (owner_chat_id,),
            ).fetchone()
        return dict(row)

    def test_crash_after_claim_is_recovered_by_new_lease(self):
        self._bootstrap_chat("chat_a", "a")
        deleted = self.store.delete_chat(
            owner_chat_id="chat_a",
            operation_id="delete_chat_a",
        )
        first_worker = MemoryV2DeletionProcessor(
            self.store,
            worker_id="worker_a",
            lease_ms=1_000,
        )
        claimed = first_worker.claim_once(cycle_id="cycle_before_crash")
        self.assertEqual(claimed["deletion"]["deletion_id"], deleted["deletion_id"])
        self.assertEqual(self._outbox_row("chat_a")["status"], "leased")

        self.clock.advance(1_001)
        recovered = MemoryV2DeletionProcessor(
            self.store,
            worker_id="worker_b",
            lease_ms=1_000,
        ).process_once(cycle_id="cycle_after_restart")

        self.assertEqual(recovered.status, "completed")
        self.assertEqual(recovered.owner_chat_id, "chat_a")
        row = self._outbox_row("chat_a")
        self.assertEqual(row["status"], "completed")
        self.assertEqual(row["attempt_count"], 2)

    def test_same_cycle_replays_without_duplicate_claim_or_side_effect(self):
        self._bootstrap_chat("chat_a", "a")
        self.store.delete_chat(owner_chat_id="chat_a", operation_id="delete_chat_a")
        processor = MemoryV2DeletionProcessor(self.store, worker_id="worker_a")

        first = processor.process_once(cycle_id="stable_cycle")
        replay = processor.process_once(cycle_id="stable_cycle")

        self.assertEqual(first.status, "completed")
        self.assertEqual(replay.status, "completed")
        self.assertTrue(replay.replayed)
        row = self._outbox_row("chat_a")
        self.assertEqual(row["attempt_count"], 1)
        self.assertEqual(row["revision"], 3)

    def test_transient_failure_retries_under_the_same_lease(self):
        self._bootstrap_chat("chat_a", "a")
        self.store.delete_chat(owner_chat_id="chat_a", operation_id="delete_chat_a")
        wrapper = FailOnceStore(self.store)
        processor = MemoryV2DeletionProcessor(wrapper, worker_id="worker_a")

        failed = processor.process_once(cycle_id="retry_cycle")
        completed = processor.process_once(cycle_id="retry_cycle")

        self.assertEqual(failed.status, "retryable_failure")
        self.assertEqual(failed.error_code, "context_v2_deletion_worker_failed")
        self.assertNotIn("sensitive", failed.error_message)
        self.assertEqual(completed.status, "completed")
        self.assertEqual(self._outbox_row("chat_a")["attempt_count"], 1)

    def test_processing_one_owner_does_not_touch_another_owner(self):
        self._bootstrap_chat("chat_a", "a")
        self.clock.advance(1)
        self._bootstrap_chat("chat_b", "b")
        self.store.delete_chat(owner_chat_id="chat_a", operation_id="delete_chat_a")

        result = MemoryV2DeletionProcessor(
            self.store,
            worker_id="worker_a",
        ).process_once(cycle_id="owner_isolation")

        self.assertEqual(result.owner_chat_id, "chat_a")
        chat_b_events = self.store.load_events(owner_chat_id="chat_b")
        self.assertEqual(len(chat_b_events["events"]), 1)
        with sqlite3.connect(self.store.db_path) as connection:
            session = connection.execute(
                "SELECT deleted_at_ms FROM sessions WHERE owner_chat_id='chat_b'"
            ).fetchone()
        self.assertIsNone(session[0])

    def test_invalid_or_path_like_claim_never_reaches_a_broad_target(self):
        store = InvalidClaimStore(
            {
                "deletion_id": "delete_1",
                "owner_chat_id": "chat_a",
                "entity_type": "chat",
                "entity_id": "../chat_a",
                "revision": 2,
                "lease_token": "lease_1",
                "lease_expires_at_ms": 2_000_000,
            }
        )
        result = MemoryV2DeletionProcessor(
            store,
            worker_id="worker_a",
        ).process_once(cycle_id="invalid_scope")

        self.assertEqual(result.status, "retryable_failure")
        self.assertEqual(result.error_code, "context_v2_invalid_deletion_claim")
        self.assertEqual(store.delete_chat_calls, [])
        self.assertEqual(store.complete_calls, [])

    def test_cas_object_is_retained_until_store_can_prove_it_unreferenced(self):
        self._bootstrap_chat("chat_a", "a")
        artifact = self.store.record_artifact(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            operation_id="artifact_a",
            artifact={"kind": "tool_result"},
            content=b"shared-content-must-survive",
        )
        object_path = self.root / "objects" / artifact["artifact_ref"]["sha256"]
        self.assertTrue(object_path.is_file())
        self.store.delete_chat(owner_chat_id="chat_a", operation_id="delete_chat_a")

        result = MemoryV2DeletionProcessor(
            self.store,
            worker_id="worker_a",
        ).process_once(cycle_id="retain_cas")

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.gc_status, "pending_unreferenced_scan")
        self.assertTrue(object_path.is_file())


if __name__ == "__main__":
    unittest.main()
