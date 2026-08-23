import base64
import sqlite3
import tempfile
import unittest
from pathlib import Path

from memory_v2_store import MemoryV2Error, MemoryV2Store


class MemoryV2ProjectionAtomicityTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name) / "memory_v2"
        self.store = MemoryV2Store(self.root)

    def tearDown(self):
        self.store.close()
        self.temp_dir.cleanup()

    def _record_artifact(self, operation_id="artifact-op"):
        return self.store.record_artifact(
            owner_chat_id="chat_projection",
            session_id="session_projection",
            attempt_id="attempt_projection",
            operation_id=operation_id,
            artifact={"kind": "tool_result", "description": "full output"},
            content=b'{"stdout":"durable output"}',
            mime_type="application/json",
        )

    def test_projection_failure_rolls_back_event_object_and_receipt_then_retries(self):
        original = self.store._apply_event_projection

        def fail_projection(connection, event_row, projection):
            raise MemoryV2Error(
                "context_v2_projection_missing",
                "event projection is unavailable",
                status_code=500,
            )

        self.store._apply_event_projection = fail_projection
        with self.assertRaises(MemoryV2Error):
            self._record_artifact()
        with sqlite3.connect(self.store.db_path) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM events").fetchone()[0], 0)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM objects").fetchone()[0], 0)
            self.assertEqual(
                connection.execute("SELECT COUNT(*) FROM operations").fetchone()[0],
                0,
            )
        self.assertFalse(any(self.store.objects_dir.iterdir()))

        self.store._apply_event_projection = original
        receipt = self._record_artifact()
        self.assertIn("artifact_ref", receipt)
        self.assertIn("content_ref", receipt)

    def test_missing_projection_hides_content_and_receipt_replay_fails_closed(self):
        receipt = self._record_artifact()
        event_ref = f"pupu://context/event/{receipt['event_id']}/content"
        with sqlite3.connect(self.store.db_path) as connection:
            connection.execute(
                "UPDATE artifacts SET deleted_at_ms=1 WHERE artifact_id=?",
                (receipt["artifact_id"],),
            )
            connection.commit()

        page = self.store.load_events(owner_chat_id="chat_projection")
        event = next(item for item in page["events"] if item["event_id"] == receipt["event_id"])
        self.assertNotIn("content_ref", event)
        with self.assertRaises(MemoryV2Error) as read_error:
            self.store.read_scoped_content(
                owner_chat_id="chat_projection",
                ref=event_ref,
            )
        self.assertEqual(read_error.exception.code, "context_v2_content_not_found")
        with self.assertRaises(MemoryV2Error) as replay_error:
            self._record_artifact()
        self.assertEqual(replay_error.exception.code, "context_v2_projection_missing")

    def test_event_id_dedup_path_self_heals_missing_projection(self):
        first = self._record_artifact()
        with sqlite3.connect(self.store.db_path) as connection:
            connection.execute("DELETE FROM operations WHERE operation_id=?", ("artifact-op",))
            connection.execute("DELETE FROM artifacts WHERE artifact_id=?", (first["artifact_id"],))
            connection.commit()
        healed = self._record_artifact()
        self.assertTrue(healed["replayed"])
        content = self.store.read_scoped_content(
            owner_chat_id="chat_projection",
            ref=healed["artifact_ref"]["uri"],
        )
        self.assertEqual(base64.b64decode(content["data"]), b'{"stdout":"durable output"}')

    def test_checkpoint_manifest_and_content_are_sanitized(self):
        self.store.append_semantic_event(
            owner_chat_id="chat_projection",
            session_id="session_projection",
            attempt_id="attempt_projection",
            event={
                "event_id": "ctx_evt_checkpoint_source",
                "type": "message.user",
                "payload": {"message": "safe"},
            },
            operation_id="checkpoint-source-op",
        )
        source = self.store.load_events(owner_chat_id="chat_projection")["events"][0]
        receipt = self.store.record_checkpoint(
            owner_chat_id="chat_projection",
            session_id="session_projection",
            attempt_id="attempt_projection",
            manifest={"password": "manifest-secret", "source_event_range": {"event_count": 1}},
            content=b"password=content-secret-value",
            source_event_ids=(source["event_id"],),
            source_event_store_seqs=(source["store_seq"],),
            operation_id="checkpoint-op",
            mime_type="text/plain",
        )
        raw = base64.b64decode(
            self.store.read_scoped_content(
                owner_chat_id="chat_projection",
                ref=receipt["checkpoint_ref"],
            )["data"]
        )
        self.assertNotIn(b"content-secret-value", raw)
        with sqlite3.connect(self.store.db_path) as connection:
            manifest_json = connection.execute(
                "SELECT manifest_json FROM checkpoints WHERE checkpoint_id=?",
                (receipt["checkpoint_id"],),
            ).fetchone()[0]
        self.assertNotIn("manifest-secret", manifest_json)


if __name__ == "__main__":
    unittest.main()
