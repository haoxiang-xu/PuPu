import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

from memory_v2_sanitizer import StorageTrust, sanitize_for_storage
from memory_v2_store import MemoryV2Error, MemoryV2Store


class MemoryV2CasStateTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name) / "memory_v2"
        self.store = MemoryV2Store(self.root)

    def tearDown(self):
        self.store.close()
        self.temp_dir.cleanup()

    @staticmethod
    def _payload(value=b"durable-content"):
        return sanitize_for_storage(
            value,
            declared_mime="text/plain",
            trust=StorageTrust.JOURNAL,
        )

    def test_staged_and_orphan_hashes_are_indistinguishable_from_absent(self):
        staged = self.store.stage_object(self._payload())
        self.assertFalse((self.store.objects_dir / staged.object_id).exists())
        with self.assertRaises(MemoryV2Error) as staged_error:
            self.store._read_object_bytes(staged.object_id)
        self.assertEqual(staged_error.exception.code, "context_v2_content_not_found")

        orphan_id = hashlib.sha256(b"orphan").hexdigest()
        (self.store.objects_dir / orphan_id).write_bytes(b"orphan")
        with self.assertRaises(MemoryV2Error) as orphan_error:
            self.store._read_object_bytes(orphan_id)
        self.assertEqual(orphan_error.exception.code, "context_v2_content_not_found")

    def test_publish_rollback_removes_file_and_ready_row(self):
        staged = self.store.stage_object(self._payload())
        with self.assertRaises(RuntimeError):
            with self.store._write() as connection:
                self.store.publish_staged(connection, staged)
                raise RuntimeError("force rollback")
        self.assertFalse((self.store.objects_dir / staged.object_id).exists())
        with sqlite3.connect(self.store.db_path) as connection:
            self.assertIsNone(
                connection.execute(
                    "SELECT 1 FROM objects WHERE object_id=?", (staged.object_id,)
                ).fetchone()
            )

    def test_dedup_stage_has_no_temp_and_publish_skips_replace(self):
        first = self.store.put_object(self._payload())
        staged = self.store.stage_object(self._payload())
        self.assertTrue(staged.deduplicated)
        self.assertFalse((self.store.tmp_dir / staged.staging_id).exists())
        with self.store._write() as connection:
            published = self.store.publish_staged(connection, staged)
        self.assertEqual(published, first)
        self.assertEqual(
            (self.store.objects_dir / first["object_id"]).read_bytes(),
            b"durable-content",
        )

    def test_recovery_cleans_expired_staging_and_legacy_orphans_only(self):
        expired = self.store.stage_object(self._payload(b"expired"))
        live = self.store.stage_object(self._payload(b"live"))
        with sqlite3.connect(self.store.db_path) as connection:
            connection.execute(
                "UPDATE object_staging SET expires_at_ms=0 WHERE staging_id=?",
                (expired.staging_id,),
            )
            connection.commit()
        orphan_id = hashlib.sha256(b"flat-orphan").hexdigest()
        orphan_path = self.store.objects_dir / orphan_id
        orphan_path.write_bytes(b"flat-orphan")
        legacy_temp = self.store.objects_dir / f".{orphan_id}.old.tmp"
        legacy_temp.write_bytes(b"temp")

        self.assertIsNone(self.store.recover_startup())
        self.assertFalse((self.store.tmp_dir / expired.staging_id).exists())
        self.assertTrue((self.store.tmp_dir / live.staging_id).exists())
        self.assertFalse(orphan_path.exists())
        self.assertFalse(legacy_temp.exists())

    def test_recovery_fk_gate_fails_closed_without_deleting(self):
        orphan_id = hashlib.sha256(b"guarded-orphan").hexdigest()
        orphan_path = self.store.objects_dir / orphan_id
        orphan_path.write_bytes(b"guarded-orphan")
        original_connect = self.store._connect

        def foreign_keys_off_connect(*, query_only=False):
            connection = sqlite3.connect(
                str(self.store.db_path),
                timeout=5.0,
                isolation_level=None,
            )
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys=OFF")
            if query_only:
                connection.execute("PRAGMA query_only=ON")
            return connection

        self.store._connect = foreign_keys_off_connect
        try:
            self.assertIsNone(self.store.recover_startup())
        finally:
            self.store._connect = original_connect
        self.assertTrue(orphan_path.exists())
        with sqlite3.connect(self.store.db_path) as connection:
            status = connection.execute(
                "SELECT value FROM meta WHERE key='cas_recovery'"
            ).fetchone()[0]
        self.assertEqual(status, "degraded")


if __name__ == "__main__":
    unittest.main()
