import base64
import hashlib
import json
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from memory_v2_sanitizer import StorageTrust, sanitize_for_storage
from memory_v2_store import (
    DATABASE_FILENAME,
    MAX_REBASE_HISTORY_BYTES,
    MAX_REBASE_HISTORY_MESSAGES,
    MemoryV2Error,
    MemoryV2Store,
)


class MemoryV2StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name) / "memory_v2"
        self.store = MemoryV2Store(self.root)

    def tearDown(self):
        self.store.close()
        self.temp_dir.cleanup()

    def test_schema_uses_frozen_layers_and_flat_cas(self):
        expected = {
            "sessions",
            "chat_admissions",
            "generations",
            "attempts",
            "events",
            "operations",
            "objects",
            "artifacts",
            "context_builds",
            "checkpoints",
            "task_state",
            "spaces",
            "entries",
            "entry_revisions",
            "links",
            "candidates",
            "consolidation_jobs",
            "consolidation_job_candidates",
            "candidate_reviews",
            "promotions",
            "index_state",
            "deletion_outbox",
        }
        self.assertEqual(self.store.db_path.name, DATABASE_FILENAME)
        with sqlite3.connect(self.store.db_path) as connection:
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type IN ('table', 'view')"
                )
            }
            index_sql = connection.execute(
                "SELECT sql FROM sqlite_master WHERE name='idx_events_scope_store'"
            ).fetchone()[0]
        self.assertTrue(expected.issubset(tables))
        self.assertIn("session_key, generation_id, attempt_key, store_seq", index_sql)
        record = self.store.put_object(
            sanitize_for_storage(
                b"flat",
                declared_mime="text/plain",
                trust=StorageTrust.SYSTEM,
            )
        )
        self.assertTrue((self.root / "objects" / record["object_id"]).is_file())
        self.assertFalse((self.root / "objects" / record["object_id"][:2]).exists())

    def test_schema_v3_migrates_to_v4_with_conservative_cursor_and_no_stale_backup(self):
        with tempfile.TemporaryDirectory() as root:
            memory_root = Path(root) / "memory_v2"
            memory_root.mkdir()
            db_path = memory_root / DATABASE_FILENAME
            with sqlite3.connect(db_path) as connection:
                connection.executescript(
                    "CREATE TABLE pinned_task_state("
                    "pinned_state_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, "
                    "owner_chat_id TEXT NOT NULL, session_key TEXT NOT NULL, "
                    "generation_id TEXT NOT NULL, attempt_key TEXT NOT NULL, "
                    "state_json TEXT NOT NULL, source_event_ids_json TEXT NOT NULL, "
                    "revision INTEGER NOT NULL DEFAULT 1, created_at_ms INTEGER NOT NULL, "
                    "updated_at_ms INTEGER NOT NULL);"
                    "INSERT INTO pinned_task_state VALUES("
                    "'ctx_pinned_legacy','ctx_task_legacy','chat_legacy','session_key_legacy',"
                    "'generation_legacy','attempt_key_legacy','{\"objective\":\"legacy\"}',"
                    "'[\"event_legacy\"]',3,1,2);"
                    "PRAGMA user_version=3;"
                )
            migrated = MemoryV2Store(memory_root)
            try:
                status = migrated.status()
                self.assertEqual(status["schema_version"], 4)
                self.assertIn("consolidation_job_candidates", status["counts"])
                self.assertIn("candidate_reviews", status["counts"])
                with sqlite3.connect(db_path) as connection:
                    row = connection.execute(
                        "SELECT state_json, revision, covered_through_store_seq "
                        "FROM pinned_task_state WHERE pinned_state_id='ctx_pinned_legacy'"
                    ).fetchone()
                self.assertEqual(row, ('{"objective":"legacy"}', 3, 0))
                self.assertFalse(
                    (memory_root / "context_v2.pre_v4.sqlite3").exists()
                )
            finally:
                migrated.close()

    def test_schema_v4_migration_failure_rolls_back_and_keeps_recovery_backup(self):
        with tempfile.TemporaryDirectory() as root:
            memory_root = Path(root) / "memory_v2"
            memory_root.mkdir()
            db_path = memory_root / DATABASE_FILENAME
            with sqlite3.connect(db_path) as connection:
                connection.executescript(
                    "CREATE TABLE candidate_reviews(foo TEXT);"
                    "CREATE TABLE migration_probe(value TEXT);"
                    "INSERT INTO migration_probe VALUES('preserved');"
                    "PRAGMA user_version=3;"
                )
            with self.assertRaises(sqlite3.OperationalError):
                MemoryV2Store(memory_root)
            backup_path = memory_root / "context_v2.pre_v4.sqlite3"
            self.assertTrue(backup_path.is_file())
            with sqlite3.connect(db_path) as connection:
                self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 3)
                self.assertEqual(
                    connection.execute("SELECT value FROM migration_probe").fetchone()[0],
                    "preserved",
                )
            with sqlite3.connect(backup_path) as connection:
                self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 3)
                self.assertEqual(connection.execute("PRAGMA quick_check").fetchone()[0], "ok")

    def test_specific_job_claim_is_exact_cas_idempotent_and_keeps_queue_claim(self):
        first = self.store.enqueue_consolidation_job(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            job_type="memory_curator",
            payload={"slot": "first"},
            operation_id="enqueue_specific_first",
        )
        second = self.store.enqueue_consolidation_job(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            job_type="memory_curator",
            payload={"slot": "second"},
            operation_id="enqueue_specific_second",
        )

        claimed = self.store.claim_specific_consolidation_job(
            owner_chat_id="chat_a",
            job_id=second["job_id"],
            expected_revision=second["revision"],
            worker_id="inline_worker",
            operation_id="claim_specific_second",
            lease_ms=60_000,
        )
        replay = self.store.claim_specific_consolidation_job(
            owner_chat_id="chat_a",
            job_id=second["job_id"],
            expected_revision=second["revision"],
            worker_id="inline_worker",
            operation_id="claim_specific_second",
            lease_ms=60_000,
        )
        self.assertEqual(claimed["job"]["job_id"], second["job_id"])
        self.assertEqual(claimed["job"]["status"], "leased")
        self.assertEqual(
            replay["job"]["lease_token"],
            claimed["job"]["lease_token"],
        )
        self.assertTrue(replay["replayed"])

        queue_claim = self.store.claim_consolidation_job(
            owner_chat_id="chat_a",
            worker_id="queue_worker",
            operation_id="claim_queue_first",
        )
        self.assertEqual(queue_claim["job"]["job_id"], first["job_id"])
        with self.assertRaises(MemoryV2Error) as raised:
            self.store.claim_specific_consolidation_job(
                owner_chat_id="chat_a",
                job_id=second["job_id"],
                expected_revision=second["revision"],
                worker_id="competing_worker",
                operation_id="claim_specific_stale",
            )
        self.assertEqual(raised.exception.code, "context_v2_revision_conflict")

    def test_scoped_content_page_reports_full_content_hash(self):
        self.store.bootstrap_current_request(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            message={"content": "Read a durable result"},
            operation_id="current_hash_1",
        )
        content = b"0123456789abcdef"
        artifact = self.store.record_artifact(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            operation_id="artifact_hash_1",
            artifact={"kind": "tool_result_full_output"},
            content=content,
            mime_type="application/octet-stream",
        )
        page = self.store.read_scoped_content(
            owner_chat_id="chat_a",
            ref=artifact["content_ref"],
            offset=4,
            limit=5,
        )
        self.assertEqual(page["sha256"], hashlib.sha256(content).hexdigest())
        self.assertEqual(base64.b64decode(page["data"]), content[4:9])

    def _admit(
        self,
        *,
        owner="chat_a",
        session="session_a",
        target_mode="active",
        rollout="all",
        operation_id="admission_1",
    ):
        selected = target_mode == "active"
        return self.store.resolve_chat_admission(
            owner_chat_id=owner,
            session_id=session,
            requested_rollout_mode=rollout,
            effective_rollout_mode=rollout,
            cohort=f"{rollout}_{target_mode}",
            target_mode=target_mode,
            decision_reason="",
            canary_selected=selected,
            canary_percent=5,
            canary_bucket=123,
            hash_strategy="sha256_owner_v1",
            provenance={"source": "test", "bootstrap_hash": "abc"},
            operation_id=operation_id,
        )

    def test_chat_admission_is_atomic_idempotent_and_bootstrap_uses_cas(self):
        def admit_once(_index):
            return self._admit(operation_id="admission_concurrent")

        with ThreadPoolExecutor(max_workers=8) as pool:
            admissions = list(pool.map(admit_once, range(16)))
        self.assertEqual(len({item["admission_id"] for item in admissions}), 1)
        with sqlite3.connect(self.store.db_path) as connection:
            live_count = connection.execute(
                "SELECT COUNT(*) FROM chat_admissions WHERE owner_chat_id='chat_a' "
                "AND deleted_at_ms IS NULL"
            ).fetchone()[0]
        self.assertEqual(live_count, 1)

        admission = admissions[0]
        completed = self.store.mark_chat_bootstrap(
            owner_chat_id="chat_a",
            admission_id=admission["admission_id"],
            expected_revision=1,
            succeeded=True,
            provenance={"history": {"migration_cursor": 2}},
            error_code="",
            operation_id="bootstrap_complete_1",
        )
        replay = self.store.mark_chat_bootstrap(
            owner_chat_id="chat_a",
            admission_id=admission["admission_id"],
            expected_revision=1,
            succeeded=True,
            provenance={"history": {"migration_cursor": 2}},
            error_code="",
            operation_id="bootstrap_complete_1",
        )
        self.assertTrue(completed["v2_bootstrapped"])
        self.assertEqual(completed["effective_mode"], "active")
        self.assertTrue(replay["replayed"])
        self.assertEqual(
            completed["bootstrap_provenance"]["history"]["migration_cursor"],
            2,
        )
        with self.assertRaises(MemoryV2Error) as raised:
            self.store.mark_chat_bootstrap(
                owner_chat_id="chat_a",
                admission_id=admission["admission_id"],
                expected_revision=1,
                succeeded=False,
                provenance={"stage": "late"},
                error_code="late_failure",
                operation_id="bootstrap_conflict_1",
            )
        self.assertEqual(raised.exception.code, "context_v2_revision_conflict")

    def test_failed_bootstrap_stays_inactive_rebase_preserves_and_delete_restarts_epoch(self):
        failed = self._admit(owner="chat_failed", operation_id="admission_failed")
        failed_state = self.store.mark_chat_bootstrap(
            owner_chat_id="chat_failed",
            admission_id=failed["admission_id"],
            expected_revision=failed["revision"],
            succeeded=False,
            provenance={"stage": "legacy_history"},
            error_code="context_v2_bootstrap_failed",
            operation_id="bootstrap_failed_1",
        )
        self.assertFalse(failed_state["v2_bootstrapped"])
        self.assertEqual(failed_state["effective_mode"], "shadow")

        admitted = self._admit(owner="chat_rebase", operation_id="admission_rebase")
        self.store.bootstrap_current_request(
            owner_chat_id="chat_rebase",
            session_id="session_a",
            attempt_id="attempt_a",
            message={"content": "start"},
            operation_id="current_rebase_1",
        )
        completed = self.store.mark_chat_bootstrap(
            owner_chat_id="chat_rebase",
            admission_id=admitted["admission_id"],
            expected_revision=admitted["revision"],
            succeeded=True,
            provenance={"current": True},
            error_code="",
            operation_id="bootstrap_rebase_1",
        )
        self.store.append_semantic_event(
            owner_chat_id="chat_rebase",
            session_id="session_a",
            attempt_id="attempt_a",
            event={"event_id": "rebase_evt", "type": "message.assistant", "payload": {}},
            operation_id="rebase_evt_op",
        )
        self.store.seal_task(
            owner_chat_id="chat_rebase",
            session_id="session_a",
            attempt_id="attempt_a",
            outcome="completed",
            operation_id="seal_rebase_attempt",
        )
        head = self.store.get_session_head(
            owner_chat_id="chat_rebase",
            session_id="session_a",
        )
        self.store.rebase_session(
            owner_chat_id="chat_rebase",
            session_id="session_a",
            replacement_history=[{"role": "user", "content": "replacement"}],
            source_generation_id=head["current_generation_id"],
            expected_session_revision=head["session_revision"],
            operation_id="rebase_admission_1",
            reason="delete",
        )
        after_rebase = self.store.get_chat_admission(owner_chat_id="chat_rebase")
        self.assertEqual(after_rebase["admission_id"], completed["admission_id"])
        self.assertTrue(after_rebase["v2_bootstrapped"])

        self.store.delete_chat(
            owner_chat_id="chat_rebase",
            operation_id="delete_admitted_chat_1",
        )
        self.assertIsNone(self.store.get_chat_admission(owner_chat_id="chat_rebase"))
        replacement = self._admit(
            owner="chat_rebase",
            session="session_new",
            operation_id="admission_recreated",
        )
        self.assertNotEqual(replacement["admission_id"], completed["admission_id"])
        self.assertFalse(replacement["v2_bootstrapped"])

    def test_event_dual_dedup_and_default_redaction(self):
        event = {
            "event_id": "evt_1",
            "type": "tool.result",
            "seq": 1,
            "call_id": "call_1",
            "parent_run_id": "run_parent",
            "payload": {"password": "secret", "text": "Bearer abcdefghijk"},
        }
        first = self.store.append_semantic_event(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            event=event,
            operation_id="event_op_1",
        )
        replay = self.store.append_semantic_event(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            event=event,
            operation_id="event_op_1",
        )
        self.assertFalse(first["replayed"])
        self.assertTrue(replay["replayed"])
        loaded = self.store.load_events(owner_chat_id="chat_a")
        self.assertEqual(loaded["events"][0]["tool_call_id"], "call_1")
        self.assertEqual(loaded["events"][0]["parent_run_id"], "run_parent")
        self.assertEqual(loaded["events"][0]["event"]["payload"]["password"], "[REDACTED]")
        self.assertIn("Bearer [REDACTED]", loaded["events"][0]["event"]["payload"]["text"])
        with self.assertRaises(MemoryV2Error) as raised:
            self.store.append_semantic_event(
                owner_chat_id="chat_a",
                session_id="session_a",
                attempt_id="attempt_a",
                event={**event, "event_id": "evt_2", "payload": {"different": True}},
            )
        self.assertEqual(raised.exception.code, "context_v2_event_sequence_conflict")

    def test_bootstrap_pinned_state_update_and_rebase(self):
        history = [
            {"role": "system", "content": "not imported"},
            {"role": "user", "content": "Build the thing"},
            {"role": "assistant", "content": "Working"},
            {"role": "tool", "content": "not fabricated"},
        ]
        first = self.store.bootstrap_history(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            history=history,
            operation_id="bootstrap_1",
        )
        self.assertEqual(len(first["imported_event_ids"]), 2)
        current = self.store.bootstrap_current_request(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            message={
                "content": "Current request",
                "attachments": [{"name": "x", "base64": "SEVMTE8="}],
            },
            operation_id="current_1",
        )
        state = self.store.get_task_state(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
        )
        self.assertEqual(state["objective"], "Build the thing")
        source_id = current["event"]["event_id"]
        updated = self.store.update_task_state(
            owner_chat_id="chat_a",
            session_id="session_a",
            expected_revision=state["revision"],
            patch={"constraints": ["stay scoped"]},
            source_event_ids=[source_id],
            operation_id="state_1",
        )
        self.assertEqual(updated["constraints"], ["stay scoped"])
        self.store.append_semantic_event(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_b",
            event={"event_id": "attempt_b_event", "type": "message.assistant", "payload": {}},
            operation_id="attempt_b_event_op",
        )
        for attempt_id in ("attempt_a", "attempt_b"):
            self.store.seal_task(
                owner_chat_id="chat_a",
                session_id="session_a",
                attempt_id=attempt_id,
                outcome="completed",
                operation_id=f"seal_{attempt_id}",
            )
        head = self.store.get_session_head(
            owner_chat_id="chat_a",
            session_id="session_a",
        )
        rebased = self.store.rebase_session(
            owner_chat_id="chat_a",
            session_id="session_a",
            replacement_history=[
                {"role": "user", "content": "Replacement objective"},
                {"role": "assistant", "content": "Replacement answer"},
            ],
            source_generation_id=head["current_generation_id"],
            expected_session_revision=head["session_revision"],
            operation_id="rebase_1",
            reason="edit",
        )
        self.assertEqual(rebased["generation_no"], 2)
        rebased_state = self.store.get_task_state(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id=rebased["attempt_id"],
        )
        self.assertEqual(rebased_state["objective"], "Replacement objective")
        self.assertEqual(rebased_state["constraints"], [])

    def test_task_state_receipt_preserves_portable_operation_and_current_sources(self):
        current = self.store.bootstrap_current_request(
            owner_chat_id="chat_task_receipt",
            session_id="session_task_receipt",
            attempt_id="attempt_task_receipt",
            message={"content": "Initial objective"},
            operation_id="task_receipt_bootstrap",
        )
        state = self.store.get_task_state(
            owner_chat_id="chat_task_receipt",
            session_id="session_task_receipt",
            attempt_id="attempt_task_receipt",
        )
        source = self.store.append_semantic_event(
            owner_chat_id="chat_task_receipt",
            session_id="session_task_receipt",
            attempt_id="attempt_task_receipt",
            event={
                "event_id": "task_receipt_source",
                "type": "message.user",
                "payload": {"message": {"content": "Block on review"}},
            },
            operation_id="task_receipt_source_op",
        )
        payload_hash = "a" * 64
        arguments = {
            "owner_chat_id": "chat_task_receipt",
            "session_id": "session_task_receipt",
            "expected_revision": state["revision"],
            "patch": {"status": "blocked"},
            "source_event_ids": [source["event_id"]],
            "operation_id": "task_receipt_update",
            "operation_payload_hash": payload_hash,
        }

        updated = self.store.update_task_state(**arguments)
        replayed = self.store.update_task_state(**arguments)

        self.assertEqual(updated["status"], "blocked")
        self.assertEqual(updated["operation_payload_hash"], payload_hash)
        self.assertEqual(
            updated["operation_source_event_refs"],
            ["pupu://context/event/task_receipt_source"],
        )
        self.assertEqual(updated["owner_chat_id"], "chat_task_receipt")
        self.assertEqual(updated["session_id"], "session_task_receipt")
        self.assertEqual(updated["generation_id"], current["generation_id"])
        current_state = self.store.get_task_state(
            owner_chat_id="chat_task_receipt",
            session_id="session_task_receipt",
            attempt_id="attempt_task_receipt",
        )
        self.assertEqual(
            current_state["source_event_refs"],
            ["pupu://context/event/task_receipt_source"],
        )
        self.assertTrue(replayed["replayed"])
        self.assertEqual(replayed["revision"], updated["revision"])
        with self.assertRaises(MemoryV2Error) as conflict:
            self.store.update_task_state(
                **{**arguments, "operation_payload_hash": "b" * 64}
            )
        self.assertEqual(conflict.exception.code, "context_v2_operation_conflict")

    def test_pinned_cursor_rejects_source_gaps_and_pending_inputs_remain_readable(self):
        bootstrapped = self.store.bootstrap_current_request(
            owner_chat_id="chat_cursor",
            session_id="session_cursor",
            attempt_id="attempt_cursor",
            message={"content": "Initial objective"},
            operation_id="cursor_bootstrap",
        )
        initial_state = self.store.get_task_state(
            owner_chat_id="chat_cursor",
            session_id="session_cursor",
            attempt_id="attempt_cursor",
        )
        self.assertEqual(
            initial_state["covered_through_store_seq"],
            bootstrapped["event"]["store_seq"],
        )

        first = self.store.append_semantic_event(
            owner_chat_id="chat_cursor",
            session_id="session_cursor",
            attempt_id="attempt_cursor",
            event={
                "event_id": "cursor_user_first",
                "type": "message.user",
                "payload": {"message": {"content": "First follow-up"}},
            },
            operation_id="cursor_user_first_op",
        )
        second = self.store.append_semantic_event(
            owner_chat_id="chat_cursor",
            session_id="session_cursor",
            attempt_id="attempt_cursor",
            event={
                "event_id": "cursor_user_second",
                "type": "message.user",
                "payload": {"message": {"content": "Second follow-up"}},
            },
            operation_id="cursor_user_second_op",
        )
        pending = self.store.list_pending_task_inputs(
            owner_chat_id="chat_cursor",
            session_id="session_cursor",
            attempt_id="attempt_cursor",
        )
        self.assertEqual(
            [item["event_id"] for item in pending["pending_task_inputs"]],
            ["cursor_user_first", "cursor_user_second"],
        )
        self.assertEqual(
            pending["pending_task_inputs"][0]["preview"],
            "First follow-up",
        )
        content = self.store.read_scoped_content(
            owner_chat_id="chat_cursor",
            ref=pending["pending_task_inputs"][0]["content_ref"],
        )
        decoded = base64.b64decode(content["data"]).decode("utf-8")
        self.assertIn("First follow-up", decoded)

        with self.assertRaises(MemoryV2Error) as gap:
            self.store.update_task_state(
                owner_chat_id="chat_cursor",
                session_id="session_cursor",
                expected_revision=initial_state["revision"],
                patch={"constraints": ["latest only"]},
                source_event_ids=[second["event_id"]],
                operation_id="cursor_gap",
            )
        self.assertEqual(gap.exception.code, "context_v2_task_state_source_gap")
        unchanged = self.store.get_task_state(
            owner_chat_id="chat_cursor",
            session_id="session_cursor",
            attempt_id="attempt_cursor",
        )
        self.assertEqual(unchanged["revision"], initial_state["revision"])

        updated = self.store.update_task_state(
            owner_chat_id="chat_cursor",
            session_id="session_cursor",
            expected_revision=initial_state["revision"],
            patch={"constraints": ["both follow-ups absorbed"]},
            source_event_ids=[first["event_id"], second["event_id"]],
            operation_id="cursor_complete_interval",
        )
        self.assertEqual(updated["covered_through_store_seq"], second["store_seq"])
        self.assertEqual(
            self.store.list_pending_task_inputs(
                owner_chat_id="chat_cursor",
                session_id="session_cursor",
                attempt_id="attempt_cursor",
            )["pending_task_inputs"],
            [],
        )

    def test_rebase_waits_for_open_capture_without_creating_objects_or_receipt(self):
        self.store.bootstrap_current_request(
            owner_chat_id="chat_fenced",
            session_id="session_fenced",
            attempt_id="attempt_open",
            message={"content": "Work is still running"},
            operation_id="fenced_bootstrap",
        )
        head = self.store.get_session_head(
            owner_chat_id="chat_fenced",
            session_id="session_fenced",
        )
        operation_id = "fenced_rebase"
        replacement = [{"role": "user", "content": "x" * 80_000}]

        def durable_counts():
            with sqlite3.connect(self.store.db_path) as connection:
                return {
                    "generations": connection.execute(
                        "SELECT COUNT(*) FROM generations"
                    ).fetchone()[0],
                    "objects": connection.execute(
                        "SELECT COUNT(*) FROM objects"
                    ).fetchone()[0],
                    "receipt": connection.execute(
                        "SELECT COUNT(*) FROM operations WHERE operation_id=?",
                        (operation_id,),
                    ).fetchone()[0],
                    "files": len(
                        [path for path in self.store.objects_dir.iterdir() if path.is_file()]
                    ),
                }

        before = durable_counts()
        with self.assertRaises(MemoryV2Error) as blocked:
            self.store.rebase_session(
                owner_chat_id="chat_fenced",
                session_id="session_fenced",
                replacement_history=replacement,
                source_generation_id=head["current_generation_id"],
                expected_session_revision=head["session_revision"],
                operation_id=operation_id,
                reason="edit",
            )
        self.assertEqual(blocked.exception.code, "context_v2_rebase_in_progress")
        self.assertEqual(blocked.exception.status_code, 409)
        self.assertTrue(blocked.exception.retryable)
        self.assertEqual(durable_counts(), before)

        self.store.seal_task(
            owner_chat_id="chat_fenced",
            session_id="session_fenced",
            attempt_id="attempt_open",
            outcome="completed",
            operation_id="fenced_seal",
        )
        rebased = self.store.rebase_session(
            owner_chat_id="chat_fenced",
            session_id="session_fenced",
            replacement_history=replacement,
            source_generation_id=head["current_generation_id"],
            expected_session_revision=head["session_revision"],
            operation_id=operation_id,
            reason="edit",
        )
        after = durable_counts()
        self.assertEqual(rebased["generation_no"], 2)
        self.assertEqual(after["generations"], before["generations"] + 1)
        self.assertEqual(after["objects"], before["objects"] + 1)
        self.assertEqual(after["files"], before["files"] + 1)
        self.assertEqual(after["receipt"], 1)
        loaded = self.store.load_events(
            owner_chat_id="chat_fenced",
            session_id="session_fenced",
        )
        replacement_event = next(
            event
            for event in loaded["events"]
            if event["type"] == "message.user"
        )
        self.assertEqual(
            len(replacement_event["event"]["payload"]["message"]["content"]),
            80_000,
        )

    def test_attempt_id_cannot_be_reused_across_generations(self):
        self.store.bootstrap_current_request(
            owner_chat_id="chat_attempt_fence",
            session_id="session_attempt_fence",
            attempt_id="shared_attempt",
            message={"content": "Original generation"},
            operation_id="attempt_fence_bootstrap",
        )
        same_generation = self.store.append_semantic_event(
            owner_chat_id="chat_attempt_fence",
            session_id="session_attempt_fence",
            attempt_id="shared_attempt",
            event={
                "event_id": "attempt_fence_same_generation",
                "type": "message.assistant",
                "payload": {"content": "same generation is valid"},
            },
            operation_id="attempt_fence_same_generation_op",
        )
        self.assertEqual(same_generation["journal_seq"], 2)
        self.store.seal_task(
            owner_chat_id="chat_attempt_fence",
            session_id="session_attempt_fence",
            attempt_id="shared_attempt",
            outcome="completed",
            operation_id="attempt_fence_seal",
        )
        head = self.store.get_session_head(
            owner_chat_id="chat_attempt_fence",
            session_id="session_attempt_fence",
        )
        self.store.rebase_session(
            owner_chat_id="chat_attempt_fence",
            session_id="session_attempt_fence",
            replacement_history=[{"role": "user", "content": "New generation"}],
            source_generation_id=head["current_generation_id"],
            expected_session_revision=head["session_revision"],
            operation_id="attempt_fence_rebase",
            reason="edit",
        )
        with sqlite3.connect(self.store.db_path) as connection:
            counts_before = connection.execute(
                "SELECT (SELECT COUNT(*) FROM attempts), (SELECT COUNT(*) FROM events)"
            ).fetchone()
        with self.assertRaises(MemoryV2Error) as conflict:
            self.store.append_semantic_event(
                owner_chat_id="chat_attempt_fence",
                session_id="session_attempt_fence",
                attempt_id="shared_attempt",
                event={
                    "event_id": "attempt_fence_reused",
                    "type": "message.user",
                    "payload": {"content": "must not append"},
                },
                operation_id="attempt_fence_reused_op",
            )
        self.assertEqual(
            conflict.exception.code,
            "context_v2_attempt_generation_conflict",
        )
        self.assertEqual(conflict.exception.status_code, 409)
        with sqlite3.connect(self.store.db_path) as connection:
            self.assertEqual(
                connection.execute(
                    "SELECT (SELECT COUNT(*) FROM attempts), (SELECT COUNT(*) FROM events)"
                ).fetchone(),
                counts_before,
            )
            self.assertEqual(
                connection.execute(
                    "SELECT COUNT(*) FROM operations WHERE operation_id=?",
                    ("attempt_fence_reused_op",),
                ).fetchone()[0],
                0,
            )

    def test_rebase_rejects_a_preexisting_deterministic_attempt_id(self):
        owner = "chat_rebase_attempt"
        session = "session_rebase_attempt"
        operation_id = "rebase_attempt_collision"
        deterministic_attempt = "ctx_rebase_" + hashlib.sha256(
            f"{owner}:{session}:{operation_id}".encode("utf-8")
        ).hexdigest()[:40]
        self.store.bootstrap_current_request(
            owner_chat_id=owner,
            session_id=session,
            attempt_id="seed_attempt",
            message={"content": "Seed"},
            operation_id="rebase_attempt_seed",
        )
        self.store.append_semantic_event(
            owner_chat_id=owner,
            session_id=session,
            attempt_id=deterministic_attempt,
            event={
                "event_id": "rebase_attempt_collision_event",
                "type": "message.assistant",
                "payload": {},
            },
            operation_id="rebase_attempt_collision_event_op",
        )
        for attempt_id in ("seed_attempt", deterministic_attempt):
            self.store.seal_task(
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt_id,
                outcome="completed",
                operation_id=f"seal_{attempt_id}",
            )
        head = self.store.get_session_head(
            owner_chat_id=owner,
            session_id=session,
        )
        with sqlite3.connect(self.store.db_path) as connection:
            generations_before = connection.execute(
                "SELECT COUNT(*) FROM generations"
            ).fetchone()[0]
        with self.assertRaises(MemoryV2Error) as conflict:
            self.store.rebase_session(
                owner_chat_id=owner,
                session_id=session,
                replacement_history=[{"role": "user", "content": "Replacement"}],
                source_generation_id=head["current_generation_id"],
                expected_session_revision=head["session_revision"],
                operation_id=operation_id,
                reason="edit",
            )
        self.assertEqual(
            conflict.exception.code,
            "context_v2_attempt_generation_conflict",
        )
        with sqlite3.connect(self.store.db_path) as connection:
            self.assertEqual(
                connection.execute("SELECT COUNT(*) FROM generations").fetchone()[0],
                generations_before,
            )
            self.assertEqual(
                connection.execute(
                    "SELECT COUNT(*) FROM operations WHERE operation_id=?",
                    (operation_id,),
                ).fetchone()[0],
                0,
            )

    def test_concurrent_large_rebases_have_one_winner_and_no_loser_object(self):
        owner = "chat_concurrent_rebase"
        session = "session_concurrent_rebase"
        self.store.bootstrap_current_request(
            owner_chat_id=owner,
            session_id=session,
            attempt_id="concurrent_source",
            message={"content": "Source"},
            operation_id="concurrent_rebase_bootstrap",
        )
        self.store.seal_task(
            owner_chat_id=owner,
            session_id=session,
            attempt_id="concurrent_source",
            outcome="completed",
            operation_id="concurrent_rebase_seal",
        )
        head = self.store.get_session_head(owner_chat_id=owner, session_id=session)
        with sqlite3.connect(self.store.db_path) as connection:
            generations_before = connection.execute(
                "SELECT COUNT(*) FROM generations"
            ).fetchone()[0]
            objects_before = connection.execute(
                "SELECT COUNT(*) FROM objects"
            ).fetchone()[0]
        files_before = len(
            [path for path in self.store.objects_dir.iterdir() if path.is_file()]
        )
        barrier = threading.Barrier(2)

        def rebase(index):
            barrier.wait(timeout=5)
            try:
                result = self.store.rebase_session(
                    owner_chat_id=owner,
                    session_id=session,
                    replacement_history=[
                        {"role": "user", "content": str(index) * 80_000}
                    ],
                    source_generation_id=head["current_generation_id"],
                    expected_session_revision=head["session_revision"],
                    operation_id=f"concurrent_rebase_{index}",
                    reason="edit",
                )
                return ("winner", result)
            except MemoryV2Error as exc:
                return ("loser", exc)

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(rebase, (1, 2)))
        winners = [value for status, value in outcomes if status == "winner"]
        losers = [value for status, value in outcomes if status == "loser"]
        self.assertEqual(len(winners), 1)
        self.assertEqual(len(losers), 1)
        self.assertEqual(losers[0].code, "context_v2_revision_conflict")
        self.assertEqual(losers[0].status_code, 409)
        self.assertTrue(losers[0].retryable)

        with sqlite3.connect(self.store.db_path) as connection:
            self.assertEqual(
                connection.execute("SELECT COUNT(*) FROM generations").fetchone()[0],
                generations_before + 1,
            )
            self.assertEqual(
                connection.execute("SELECT COUNT(*) FROM objects").fetchone()[0],
                objects_before + 1,
            )
            self.assertEqual(
                connection.execute(
                    "SELECT COUNT(*) FROM operations WHERE operation_id IN (?, ?)",
                    ("concurrent_rebase_1", "concurrent_rebase_2"),
                ).fetchone()[0],
                1,
            )
        self.assertEqual(
            len([path for path in self.store.objects_dir.iterdir() if path.is_file()]),
            files_before + 1,
        )

    def test_session_head_exposes_sticky_bootstrap_failure_without_content(self):
        admission = self._admit(owner="chat_head", operation_id="admit_head")
        self.store.bootstrap_current_request(
            owner_chat_id="chat_head",
            session_id="session_head",
            attempt_id="attempt_head",
            message={"content": "private objective"},
            operation_id="head_request",
        )

        pending = self.store.get_session_head(
            owner_chat_id="chat_head",
            session_id="session_head",
        )
        self.assertEqual(pending["admission_mode"], "shadow")
        self.assertEqual(pending["target_mode"], "active")
        self.assertEqual(pending["bootstrap_status"], "pending")
        self.assertFalse(pending["mutation_ready"])
        self.assertTrue(pending["session_exists"])
        self.assertGreaterEqual(pending["session_revision"], 1)
        self.assertEqual(pending["current_generation_no"], 1)
        self.assertNotIn("objective", pending)
        self.assertNotIn("events", pending)
        self.assertNotIn("provenance", pending)

        self.store.mark_chat_bootstrap(
            owner_chat_id="chat_head",
            admission_id=admission["admission_id"],
            expected_revision=admission["revision"],
            succeeded=False,
            provenance={"stage": "history"},
            error_code="context_v2_bootstrap_failed",
            operation_id="head_bootstrap_failed",
        )
        failed = self.store.get_session_head(
            owner_chat_id="chat_head",
            session_id="session_head",
        )
        self.assertEqual(failed["target_mode"], "active")
        self.assertEqual(failed["admission_mode"], "shadow")
        self.assertEqual(failed["bootstrap_status"], "failed")
        self.assertEqual(
            failed["bootstrap_error_code"],
            "context_v2_bootstrap_failed",
        )
        self.assertFalse(failed["mutation_ready"])

        with self.assertRaises(MemoryV2Error) as wrong_owner:
            self.store.get_session_head(
                owner_chat_id="chat_other",
                session_id="session_head",
            )
        self.assertEqual(wrong_owner.exception.code, "context_v2_not_found")

    def test_rebase_is_append_only_redacted_idempotent_and_resets_pinned_state(self):
        first = self.store.bootstrap_current_request(
            owner_chat_id="chat_replace",
            session_id="session_replace",
            attempt_id="attempt_original",
            message={"content": "Original objective"},
            operation_id="replace_original_request",
        )
        original_state = self.store.get_task_state(
            owner_chat_id="chat_replace",
            session_id="session_replace",
            attempt_id="attempt_original",
        )
        self.store.update_task_state(
            owner_chat_id="chat_replace",
            session_id="session_replace",
            expected_revision=original_state["revision"],
            patch={
                "constraints": ["old constraint"],
                "confirmed_decisions": ["old decision"],
                "artifact_memory_refs": ["pupu://artifact/old@1"],
            },
            source_event_ids=[first["event"]["event_id"]],
            operation_id="replace_original_state",
        )
        self.store.append_semantic_event(
            owner_chat_id="chat_replace",
            session_id="session_replace",
            attempt_id="attempt_original",
            event={
                "event_id": "replace_tool_started",
                "type": "tool.started",
                "call_id": "call_old",
                "payload": {"tool": "old"},
            },
            operation_id="replace_tool_started_op",
        )
        self.store.append_semantic_event(
            owner_chat_id="chat_replace",
            session_id="session_replace",
            attempt_id="attempt_original",
            event={
                "event_id": "replace_tool_result",
                "type": "tool.result",
                "call_id": "call_old",
                "payload": {"result": "old"},
            },
            operation_id="replace_tool_result_op",
        )
        self.store.seal_task(
            owner_chat_id="chat_replace",
            session_id="session_replace",
            attempt_id="attempt_original",
            outcome="completed",
            operation_id="replace_original_seal",
        )
        head = self.store.get_session_head(
            owner_chat_id="chat_replace",
            session_id="session_replace",
        )
        source_generation = head["current_generation_id"]
        with sqlite3.connect(self.store.db_path) as connection:
            old_events_before = connection.execute(
                "SELECT event_id, event_type, payload_hash, inline_event_json, "
                "event_object_id FROM events WHERE generation_id=? ORDER BY store_seq",
                (source_generation,),
            ).fetchall()
            old_pinned_before = connection.execute(
                "SELECT state_json, source_event_ids_json, revision FROM pinned_task_state "
                "WHERE generation_id=?",
                (source_generation,),
            ).fetchall()

        replacement_history = [
            {
                "role": "user",
                "content": "New objective password=hunter2",
            },
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Bearer abcdefghijk"},
                    {"type": "image", "data": "plaintext-image-data"},
                ],
            },
        ]
        rebased = self.store.rebase_session(
            owner_chat_id="chat_replace",
            session_id="session_replace",
            replacement_history=replacement_history,
            source_generation_id=source_generation,
            expected_session_revision=head["session_revision"],
            operation_id="replace_generation_1",
            reason="edit",
        )
        replay = self.store.rebase_session(
            owner_chat_id="chat_replace",
            session_id="session_replace",
            replacement_history=replacement_history,
            source_generation_id=source_generation,
            expected_session_revision=head["session_revision"],
            operation_id="replace_generation_1",
            reason="edit",
        )

        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["generation_id"], rebased["generation_id"])
        self.assertEqual(replay["event_refs"], rebased["event_refs"])
        self.assertEqual(rebased["source_generation_id"], source_generation)
        self.assertEqual(rebased["capture_quality"], "partial")
        self.assertEqual(rebased["message_event_count"], 2)
        self.assertEqual(rebased["event_count"], 3)
        self.assertEqual(
            rebased["session_revision"],
            head["session_revision"] + 1,
        )

        loaded = self.store.load_events(
            owner_chat_id="chat_replace",
            session_id="session_replace",
        )
        self.assertEqual(
            [event["type"] for event in loaded["events"]],
            ["turn_mutation", "message.user", "message.assistant"],
        )
        self.assertTrue(all(event["source_seq"] is None for event in loaded["events"]))
        self.assertFalse(
            any(event["type"].startswith("tool.") for event in loaded["events"])
        )
        serialized = json.dumps(loaded, ensure_ascii=False)
        self.assertNotIn("hunter2", serialized)
        self.assertNotIn("abcdefghijk", serialized)
        self.assertNotIn("plaintext-image-data", serialized)
        self.assertIn("password=[REDACTED]", serialized)
        self.assertIn("Bearer [REDACTED]", serialized)
        self.assertIn("[ATTACHMENT_DATA_OMITTED]", serialized)
        audit = loaded["events"][0]["event"]
        self.assertEqual(audit["payload"]["capture_quality"], "partial")
        self.assertEqual(
            audit["payload"]["provenance"]["source_generation_id"],
            source_generation,
        )

        rebased_state = self.store.get_task_state(
            owner_chat_id="chat_replace",
            session_id="session_replace",
            attempt_id=rebased["attempt_id"],
        )
        self.assertEqual(
            rebased_state["objective"],
            "New objective password=[REDACTED]",
        )
        self.assertEqual(
            rebased_state["source_event_refs"],
            [rebased["event_refs"][1]],
        )
        for field in (
            "success_criteria",
            "constraints",
            "confirmed_decisions",
            "open_questions",
            "active_plan",
            "artifact_memory_refs",
        ):
            self.assertEqual(rebased_state[field], [])
        capture = self.store.get_capture_task_state(
            owner_chat_id="chat_replace",
            session_id="session_replace",
            attempt_id=rebased["attempt_id"],
        )
        self.assertEqual(capture["capture_quality"], "partial")
        self.assertEqual(capture["capture_status"], "sealed")

        with sqlite3.connect(self.store.db_path) as connection:
            old_events_after = connection.execute(
                "SELECT event_id, event_type, payload_hash, inline_event_json, "
                "event_object_id FROM events WHERE generation_id=? ORDER BY store_seq",
                (source_generation,),
            ).fetchall()
            old_pinned_after = connection.execute(
                "SELECT state_json, source_event_ids_json, revision FROM pinned_task_state "
                "WHERE generation_id=?",
                (source_generation,),
            ).fetchall()
            new_generation = connection.execute(
                "SELECT parent_generation_id, reason FROM generations "
                "WHERE generation_id=?",
                (rebased["generation_id"],),
            ).fetchone()
        self.assertEqual(old_events_after, old_events_before)
        self.assertEqual(old_pinned_after, old_pinned_before)
        self.assertIn("old constraint", old_pinned_after[0][0])
        self.assertEqual(new_generation[0], source_generation)
        self.assertEqual(new_generation[1], "turn_mutation:edit")

        with self.assertRaises(MemoryV2Error) as operation_conflict:
            self.store.rebase_session(
                owner_chat_id="chat_replace",
                session_id="session_replace",
                replacement_history=[],
                source_generation_id=source_generation,
                expected_session_revision=head["session_revision"],
                operation_id="replace_generation_1",
                reason="edit",
            )
        self.assertEqual(
            operation_conflict.exception.code,
            "context_v2_operation_conflict",
        )

        with self.assertRaises(MemoryV2Error) as stale_revision:
            self.store.rebase_session(
                owner_chat_id="chat_replace",
                session_id="session_replace",
                replacement_history=[],
                source_generation_id=source_generation,
                expected_session_revision=head["session_revision"],
                operation_id="replace_generation_stale_revision",
                reason="delete",
            )
        self.assertEqual(stale_revision.exception.code, "context_v2_revision_conflict")
        self.assertEqual(
            stale_revision.exception.actual_revision,
            rebased["session_revision"],
        )

        current_head = self.store.get_session_head(
            owner_chat_id="chat_replace",
            session_id="session_replace",
        )
        with self.assertRaises(MemoryV2Error) as stale_generation:
            self.store.rebase_session(
                owner_chat_id="chat_replace",
                session_id="session_replace",
                replacement_history=[],
                source_generation_id=source_generation,
                expected_session_revision=current_head["session_revision"],
                operation_id="replace_generation_stale_source",
                reason="delete",
            )
        self.assertEqual(
            stale_generation.exception.code,
            "context_v2_generation_conflict",
        )

    def test_rebase_empty_history_and_strict_input_bounds(self):
        self.store.bootstrap_current_request(
            owner_chat_id="chat_empty",
            session_id="session_empty",
            attempt_id="attempt_empty",
            message={"content": "Will be removed"},
            operation_id="empty_request",
        )
        head = self.store.get_session_head(
            owner_chat_id="chat_empty",
            session_id="session_empty",
        )
        self.store.seal_task(
            owner_chat_id="chat_empty",
            session_id="session_empty",
            attempt_id="attempt_empty",
            outcome="completed",
            operation_id="empty_attempt_seal",
        )
        rebased = self.store.rebase_session(
            owner_chat_id="chat_empty",
            session_id="session_empty",
            replacement_history=[],
            source_generation_id=head["current_generation_id"],
            expected_session_revision=head["session_revision"],
            operation_id="empty_rebase",
            reason="delete",
        )
        self.assertEqual(rebased["message_event_count"], 0)
        self.assertEqual(rebased["event_count"], 1)
        loaded = self.store.load_events(owner_chat_id="chat_empty")
        self.assertEqual([event["type"] for event in loaded["events"]], ["turn_mutation"])
        state = self.store.get_task_state(
            owner_chat_id="chat_empty",
            session_id="session_empty",
            attempt_id=rebased["attempt_id"],
        )
        self.assertEqual(state["objective"], "")
        self.assertEqual(state["source_event_refs"], [])

        bounded_head = self.store.get_session_head(
            owner_chat_id="chat_empty",
            session_id="session_empty",
        )
        bounded = self.store.rebase_session(
            owner_chat_id="chat_empty",
            session_id="session_empty",
            replacement_history=[{"role": "user", "content": "z" * 20_000}],
            source_generation_id=bounded_head["current_generation_id"],
            expected_session_revision=bounded_head["session_revision"],
            operation_id="bounded_objective_rebase",
            reason="edit",
        )
        bounded_state = self.store.get_task_state(
            owner_chat_id="chat_empty",
            session_id="session_empty",
            attempt_id=bounded["attempt_id"],
        )
        self.assertEqual(len(bounded_state["objective"]), 16_384)

        current = self.store.get_session_head(
            owner_chat_id="chat_empty",
            session_id="session_empty",
        )
        invalid_histories = (
            "not-an-array",
            ["not-an-object"],
            [{"role": "system", "content": "not visible"}],
            [{"role": "user"}],
            [{"role": "user", "content": "ok", "file_path": "/tmp/x"}],
            [{"role": "user", "content": {"path": "/tmp/x"}}],
            [{"role": "user", "content": {"url": "file:///tmp/x"}}],
        )
        for index, invalid_history in enumerate(invalid_histories):
            with self.subTest(invalid_history=invalid_history):
                with self.assertRaises(MemoryV2Error) as invalid:
                    self.store.rebase_session(
                        owner_chat_id="chat_empty",
                        session_id="session_empty",
                        replacement_history=invalid_history,
                        source_generation_id=current["current_generation_id"],
                        expected_session_revision=current["session_revision"],
                        operation_id=f"invalid_rebase_{index}",
                        reason="edit",
                    )
                self.assertIn(
                    invalid.exception.code,
                    {"context_v2_invalid_history", "context_v2_invalid_request"},
                )

        with self.assertRaises(MemoryV2Error) as too_many:
            self.store.rebase_session(
                owner_chat_id="chat_empty",
                session_id="session_empty",
                replacement_history=[
                    {"role": "user", "content": "x"}
                    for _ in range(MAX_REBASE_HISTORY_MESSAGES + 1)
                ],
                source_generation_id=current["current_generation_id"],
                expected_session_revision=current["session_revision"],
                operation_id="too_many_rebase",
                reason="edit",
            )
        self.assertEqual(too_many.exception.code, "context_v2_history_too_large")

        with self.assertRaises(MemoryV2Error) as too_large:
            self.store.rebase_session(
                owner_chat_id="chat_empty",
                session_id="session_empty",
                replacement_history=[
                    {
                        "role": "user",
                        "content": "x" * (MAX_REBASE_HISTORY_BYTES + 1),
                    }
                ],
                source_generation_id=current["current_generation_id"],
                expected_session_revision=current["session_revision"],
                operation_id="too_large_rebase",
                reason="edit",
            )
        self.assertEqual(too_large.exception.code, "context_v2_history_too_large")

    def test_workspace_refs_revision_search_and_soft_delete(self):
        space = self.store.ensure_space(
            scope_kind="chat",
            scope_key="chat_a",
            owner_chat_id="chat_a",
            name="Chat memory",
            operation_id="space_1",
        )
        entry = self.store.create_entry(
            owner_chat_id="chat_a",
            space_id=space["space_id"],
            path="/Résumé.md",
            kind="file",
            description="Project notes",
            mime_type="text/markdown",
            content=b"alpha needle omega",
            expected_space_revision=1,
            operation_id="entry_1",
        )
        self.assertTrue(entry["ref"].startswith("pupu://memory/"))
        decoded = base64.b64decode(
            self.store.read_scoped_content(
                owner_chat_id="chat_a", ref=entry["ref"]
            )["data"]
        )
        self.assertEqual(decoded, b"alpha needle omega")
        self.assertEqual(
            self.store.search_entries(owner_chat_id="chat_a", query="needle")["results"][0][
                "entry_id"
            ],
            entry["entry_id"],
        )
        with self.assertRaises(MemoryV2Error):
            self.store.create_entry(
                owner_chat_id="chat_a",
                space_id=space["space_id"],
                path="/RÉSUMÉ.md",
                kind="file",
                content=b"collision",
                expected_space_revision=2,
                operation_id="entry_2",
            )
        deleted = self.store.delete_entry(
            owner_chat_id="chat_a",
            space_id=space["space_id"],
            entry_id=entry["entry_id"],
            expected_revision=1,
            expected_space_revision=2,
            operation_id="delete_1",
        )
        self.assertTrue(deleted["deleted"])
        self.assertEqual(self.store.status()["counts"]["deletion_outbox"], 1)

    def test_workspace_link_create_and_update_reject_credential_bearing_urls(self):
        unsafe_urls = (
            "https://user:password@example.test/project",
            "https://user@example.test/project",
            "https://example.test/project?password=not-safe",
            "https://example.test/project?api%255Fkey=not-safe",
            "https://example.test/project?api%2Fkey=not-safe",
            "https://example.test/project?ｃｌｉｅｎｔ－ｓｅｃｒｅｔ=not-safe",
            "https://example.test/project#refresh%5Ftoken=not-safe",
            "https://storage.example.test/blob?sv=2024&sp=r&sig=abcDEF0123456789%2Fqwerty",
            "https://example.test/project?signature=abcDEF0123456789",
            "https://example.test/project?auth=abcDEF0123456789",
            "https://example.test/project?jwt=abc.DEF.0123456789",
            "https://hooks.slack.com/services/T000/B000/abcDEF0123456789",
            "https://discord.com/api/webhooks/123456789/abcDEF0123456789",
            "https://maker.ifttt.com/trigger/build/with/key/abcDEF0123456789",
            "https://api.telegram.org/bot123456:abcDEF0123456789/getUpdates",
        )
        for index, link_url in enumerate(unsafe_urls):
            with self.subTest(action="create", link_url=link_url):
                space = self.store.ensure_space(
                    scope_kind="chat",
                    scope_key=f"chat_link_create_{index}",
                    owner_chat_id=f"chat_link_create_{index}",
                    name="Link validation",
                    operation_id=f"link_create_space_{index}",
                )
                with self.assertRaises(MemoryV2Error) as invalid_create:
                    self.store.create_entry(
                        owner_chat_id=f"chat_link_create_{index}",
                        space_id=space["space_id"],
                        path="/unsafe-link",
                        kind="link",
                        link_url=link_url,
                        expected_space_revision=space["revision"],
                        operation_id=f"link_create_{index}",
                    )
                self.assertIn(
                    invalid_create.exception.code,
                    {"context_v2_invalid_link", "context_v2_sensitive_metadata"},
                )

            with self.subTest(action="update", link_url=link_url):
                owner = f"chat_link_update_{index}"
                space = self.store.ensure_space(
                    scope_kind="chat",
                    scope_key=owner,
                    owner_chat_id=owner,
                    name="Link validation",
                    operation_id=f"link_update_space_{index}",
                )
                entry = self.store.create_entry(
                    owner_chat_id=owner,
                    space_id=space["space_id"],
                    path="/safe-link",
                    kind="link",
                    link_url="https://example.test/project?q=memory#overview",
                    expected_space_revision=space["revision"],
                    operation_id=f"link_update_seed_{index}",
                )
                with self.assertRaises(MemoryV2Error) as invalid_update:
                    self.store.update_entry(
                        owner_chat_id=owner,
                        space_id=space["space_id"],
                        entry_id=entry["entry_id"],
                        expected_revision=entry["revision"],
                        expected_space_revision=entry["space_revision"],
                        operation_id=f"link_update_{index}",
                        link_url=link_url,
                    )
                self.assertIn(
                    invalid_update.exception.code,
                    {"context_v2_invalid_link", "context_v2_sensitive_metadata"},
                )

    def test_checkpoint_pages_exact_cross_attempt_coverage_and_rebase_revokes_refs(self):
        self.store.bootstrap_current_request(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
            attempt_id="attempt_a",
            message={"content": "Start the long task"},
            operation_id="checkpoint_bootstrap",
        )
        first = self.store.append_semantic_event(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
            attempt_id="attempt_a",
            event={
                "event_id": "checkpoint_source_1",
                "type": "message.user",
                "payload": {"message": {"role": "user", "content": "one"}},
            },
            operation_id="checkpoint_source_1_op",
        )
        self.store.record_context_build(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
            attempt_id="attempt_a",
            operation_id="checkpoint_domain_gap",
            context={"phase": "gap_not_in_checkpoint"},
        )
        second = self.store.append_semantic_event(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
            attempt_id="attempt_b",
            event={
                "event_id": "checkpoint_source_2",
                "type": "message.assistant",
                "payload": {"message": {"role": "assistant", "content": "two"}},
            },
            operation_id="checkpoint_source_2_op",
        )
        third = self.store.append_semantic_event(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
            attempt_id="attempt_b",
            event={
                "event_id": "checkpoint_source_3",
                "type": "tool_call",
                "call_id": "checkpoint_call",
                "payload": {"tool": "search"},
            },
            operation_id="checkpoint_source_3_op",
        )
        large = self.store.append_semantic_event(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
            attempt_id="attempt_b",
            event={
                "event_id": "checkpoint_source_4",
                "type": "tool_result",
                "call_id": "checkpoint_call",
                "payload": {"result": "z" * 20_000},
            },
            operation_id="checkpoint_source_4_op",
        )
        source_records = (first, second, third, large)
        checkpoint = self.store.record_checkpoint(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
            attempt_id="attempt_b",
            manifest={"source_event_range": {"event_count": 4}},
            content=b'{"checkpoint":"manifest-only"}',
            source_event_ids=[record["event_id"] for record in source_records],
            source_event_store_seqs=[record["store_seq"] for record in source_records],
            operation_id="checkpoint_exact_coverage",
        )

        with sqlite3.connect(self.store.db_path) as connection:
            ranges = connection.execute(
                "SELECT first_event_position, start_store_seq, end_store_seq, event_count "
                "FROM checkpoint_event_ranges WHERE checkpoint_id=? "
                "ORDER BY range_ordinal",
                (checkpoint["checkpoint_id"],),
            ).fetchall()
        self.assertEqual(
            ranges,
            [
                (1, first["store_seq"], first["store_seq"], 1),
                (2, second["store_seq"], large["store_seq"], 3),
            ],
        )

        first_page = self.store.read_checkpoint_events(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
            checkpoint_ref=checkpoint["checkpoint_ref"],
            limit=2,
        )
        self.assertEqual(first_page["trust"], "UNTRUSTED_DATA")
        self.assertEqual(first_page["coverage"]["event_count"], 4)
        self.assertEqual(
            [event["event_id"] for event in first_page["events"]],
            ["checkpoint_source_1", "checkpoint_source_2"],
        )
        self.assertEqual(first_page["next_after_position"], 2)

        second_page = self.store.read_checkpoint_events(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
            checkpoint_ref=checkpoint["checkpoint_ref"],
            after_position=first_page["next_after_position"],
            limit=2,
        )
        self.assertEqual(
            [event["position"] for event in second_page["events"]],
            [3, 4],
        )
        self.assertNotIn("event", second_page["events"][-1])
        derived_ref = second_page["events"][-1]["payload_ref"]
        chunks = []
        offset = 0
        while True:
            content_page = self.store.read_scoped_content(
                owner_chat_id="chat_checkpoint",
                session_id="session_checkpoint",
                ref=derived_ref,
                offset=offset,
                limit=1024,
            )
            decoded = base64.b64decode(content_page["data"])
            self.assertLessEqual(len(decoded), 1024)
            chunks.append(decoded)
            if content_page["next_offset"] is None:
                break
            offset = content_page["next_offset"]
        self.assertEqual(json.loads(b"".join(chunks))["event_id"], "checkpoint_source_4")

        self.store.append_semantic_event(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
            attempt_id="attempt_c",
            event={
                "event_id": "checkpoint_late_event",
                "type": "message.user",
                "payload": {"message": {"role": "user", "content": "late"}},
            },
            operation_id="checkpoint_late_event_op",
        )
        exhausted = self.store.read_checkpoint_events(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
            checkpoint_ref=checkpoint["checkpoint_ref"],
            after_position=4,
        )
        self.assertEqual(exhausted["events"], [])
        self.assertEqual(exhausted["coverage"]["ceiling_position"], 4)

        for attempt_id in ("attempt_a", "attempt_b", "attempt_c"):
            self.store.seal_task(
                owner_chat_id="chat_checkpoint",
                session_id="session_checkpoint",
                attempt_id=attempt_id,
                outcome="completed",
                operation_id=f"checkpoint_seal_{attempt_id}",
            )

        not_found_codes = []
        for arguments in (
            {
                "owner_chat_id": "chat_other",
                "session_id": "session_checkpoint",
                "checkpoint_ref": checkpoint["checkpoint_ref"],
            },
            {
                "owner_chat_id": "chat_checkpoint",
                "session_id": "session_other",
                "checkpoint_ref": checkpoint["checkpoint_ref"],
            },
        ):
            with self.assertRaises(MemoryV2Error) as raised:
                self.store.read_checkpoint_events(**arguments)
            not_found_codes.append(raised.exception.code)
        with self.assertRaises(MemoryV2Error) as fabricated:
            self.store.read_scoped_content(
                owner_chat_id="chat_checkpoint",
                session_id="session_checkpoint",
                ref=(
                    f"pupu://context/checkpoint/{checkpoint['checkpoint_id']}"
                    "/event/999"
                ),
            )
        not_found_codes.append(fabricated.exception.code)
        self.assertEqual(set(not_found_codes), {"context_v2_content_not_found"})

        head = self.store.get_session_head(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
        )
        self.store.rebase_session(
            owner_chat_id="chat_checkpoint",
            session_id="session_checkpoint",
            replacement_history=[{"role": "user", "content": "Replacement"}],
            source_generation_id=head["current_generation_id"],
            expected_session_revision=head["session_revision"],
            operation_id="checkpoint_rebase",
            reason="edit",
        )
        stale_reads = (
            lambda: self.store.read_checkpoint_events(
                owner_chat_id="chat_checkpoint",
                session_id="session_checkpoint",
                checkpoint_ref=checkpoint["checkpoint_ref"],
                after_position=2,
            ),
            lambda: self.store.read_scoped_content(
                owner_chat_id="chat_checkpoint",
                session_id="session_checkpoint",
                ref=checkpoint["checkpoint_ref"],
            ),
            lambda: self.store.read_scoped_content(
                owner_chat_id="chat_checkpoint",
                session_id="session_checkpoint",
                ref=derived_ref,
            ),
        )
        for stale_read in stale_reads:
            with self.assertRaises(MemoryV2Error) as stale:
                stale_read()
            self.assertEqual(stale.exception.code, "context_v2_content_not_found")

    def test_artifact_checkpoint_promotion_and_chat_delete(self):
        request_record = self.store.bootstrap_current_request(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            message={"content": "Do work"},
            operation_id="current_1",
        )
        artifact = self.store.record_artifact(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            operation_id="artifact_1",
            artifact={"result": "x" * 100000},
        )
        self.assertTrue(artifact["artifact_ref"]["uri"].startswith("pupu://artifact/"))
        self.assertEqual(artifact["artifact_ref"]["revision"], 1)
        checkpoint = self.store.record_checkpoint(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            manifest={"budget": 100},
            content=b'{"messages":[]}',
            source_event_ids=[request_record["event"]["event_id"]],
            operation_id="checkpoint_1",
        )
        self.assertEqual(
            base64.b64decode(
                self.store.read_scoped_content(
                    owner_chat_id="chat_a", ref=checkpoint["checkpoint_ref"]
                )["data"]
            ),
            b'{"messages":[]}',
        )
        space = self.store.ensure_space(
            scope_kind="chat",
            scope_key="chat_a",
            owner_chat_id="chat_a",
            name="Chat memory",
            operation_id="space_1",
        )
        entry = self.store.create_entry(
            owner_chat_id="chat_a",
            space_id=space["space_id"],
            path="/fact.md",
            kind="file",
            content=b"durable fact",
            mime_type="text/markdown",
            expected_space_revision=1,
            operation_id="entry_1",
        )
        promotion = self.store.propose_promotion(
            owner_chat_id="chat_a",
            source_space_id=space["space_id"],
            source_entry_id=entry["entry_id"],
            source_entry_revision=1,
            target_namespace="user:local",
            target_path="/fact.md",
            operation_id="promotion_1",
        )
        self.store.decide_promotion(
            owner_chat_id="chat_a",
            promotion_id=promotion["promotion_id"],
            decision="apply",
            expected_revision=1,
            operation_id="promotion_2",
        )
        results = self.store.search_long_term(namespace="user:local", query="durable")
        self.assertEqual(len(results["results"]), 1)
        deleted = self.store.delete_chat(owner_chat_id="chat_a", operation_id="chat_delete_1")
        self.assertTrue(deleted["deleted"])
        self.assertGreaterEqual(deleted["soft_deleted_counts"]["events"], 1)

    def _candidate_space(self, *, owner="chat_candidates"):
        return self.store.ensure_space(
            scope_kind="chat",
            scope_key=owner,
            owner_chat_id=owner,
            name="Candidate workspace",
            operation_id=f"candidate_space:{owner}",
        )

    def _file_candidate(
        self,
        *,
        owner="chat_candidates",
        session="session_candidates",
        attempt="attempt_candidates",
        space_id,
        path="/candidate.md",
        content=b"candidate bytes",
        operation="candidate_create",
    ):
        return self.store.create_candidate(
            owner_chat_id=owner,
            session_id=session,
            attempt_id=attempt,
            target_space_id=space_id,
            target_path=path,
            kind="file",
            description="Frozen candidate",
            mime_type="text/markdown",
            content=content,
            source_event_ids=["event_candidate_source"],
            operation_id=operation,
        )

    def _enqueue_candidate_job(
        self,
        candidate,
        *,
        owner="chat_candidates",
        session="session_candidates",
        attempt="attempt_candidates",
        operation="candidate_job_enqueue",
    ):
        return self.store.enqueue_curator_job_with_candidates(
            owner_chat_id=owner,
            session_id=session,
            attempt_id=attempt,
            job_type="memory_curator",
            payload={"trigger": {"kind": "completed_root_run", "run_id": "run_1"}},
            candidate_refs=[
                {
                    "candidate_id": candidate["candidate_id"],
                    "revision": candidate["revision"],
                }
            ],
            operation_id=operation,
        )

    def _claim_candidate_job(self, job, *, operation="candidate_job_claim"):
        return self.store.claim_specific_consolidation_job(
            owner_chat_id=job["owner_chat_id"],
            job_id=job["job_id"],
            expected_revision=job["revision"],
            worker_id="candidate_worker",
            operation_id=operation,
            lease_ms=60_000,
        )["job"]

    def _prepare_candidate_review(self, *, owner):
        session = f"session_{owner}"
        attempt = f"attempt_{owner}"
        space = self._candidate_space(owner=owner)
        target = self.store.create_entry(
            owner_chat_id=owner,
            space_id=space["space_id"],
            path="/fact.md",
            kind="file",
            content=b"old fact\n",
            mime_type="text/markdown",
            expected_space_revision=space["revision"],
            operation_id=f"review_target:{owner}",
        )
        candidate = self._file_candidate(
            owner=owner,
            session=session,
            attempt=attempt,
            space_id=space["space_id"],
            path="/fact.md",
            content=b"new fact\n",
            operation=f"review_candidate:{owner}",
        )
        job = self._enqueue_candidate_job(
            candidate,
            owner=owner,
            session=session,
            attempt=attempt,
            operation=f"review_enqueue:{owner}",
        )
        claimed = self._claim_candidate_job(job, operation=f"review_claim:{owner}")
        binding = self.store.list_job_candidates(
            owner_chat_id=owner,
            job_id=job["job_id"],
        )["candidates"][0]
        review = self.store.propose_job_candidate_review(
            owner_chat_id=owner,
            job_id=job["job_id"],
            candidate_ref=candidate["candidate_ref"],
            expected_binding_revision=binding["revision"],
            target_entry_id=target["entry_id"],
            expected_target_revision=target["revision"],
            operation_id=f"review_propose:{owner}",
        )
        return space, target, candidate, job, claimed, review

    def test_candidate_response_has_stable_ref_metadata_and_no_raw_object_id(self):
        space = self._candidate_space()
        content = b"0123456789abcdef"
        candidate = self._file_candidate(space_id=space["space_id"], content=content)

        self.assertEqual(
            candidate["candidate_ref"],
            f"pupu://memory/candidate/{candidate['candidate_id']}@1",
        )
        self.assertEqual(candidate["content"]["ref"], candidate["candidate_ref"])
        self.assertEqual(candidate["content"]["bytes"], len(content))
        self.assertEqual(candidate["content"]["sha256"], hashlib.sha256(content).hexdigest())
        self.assertEqual(candidate["content"]["media_type"], "text/markdown")
        self.assertNotIn("object_id", json.dumps(candidate, sort_keys=True))

    def test_atomic_candidate_job_enqueue_is_idempotent_and_rolls_back_stale_refs(self):
        space = self._candidate_space()
        candidate = self._file_candidate(space_id=space["space_id"])

        with self.assertRaises(MemoryV2Error) as stale:
            self.store.enqueue_curator_job_with_candidates(
                owner_chat_id="chat_candidates",
                session_id="session_candidates",
                attempt_id="attempt_candidates",
                job_type="memory_curator",
                payload={"trigger": {"run_id": "run_stale"}},
                candidate_refs=[
                    {"candidate_id": candidate["candidate_id"], "revision": 999}
                ],
                operation_id="candidate_job_stale",
            )
        self.assertEqual(stale.exception.code, "context_v2_revision_conflict")
        self.assertEqual(
            self.store.list_candidates(
                owner_chat_id="chat_candidates", status="pending"
            )["candidates"][0]["candidate_id"],
            candidate["candidate_id"],
        )
        self.assertEqual(
            self.store.list_consolidation_jobs(owner_chat_id="chat_candidates")["jobs"],
            [],
        )

        job = self._enqueue_candidate_job(candidate)
        replay = self._enqueue_candidate_job(candidate)
        self.assertEqual(replay["job_id"], job["job_id"])
        self.assertTrue(replay["replayed"])
        self.assertEqual(job["candidate_count"], 1)
        self.assertEqual(job["candidates"][0]["candidate_ref"], candidate["candidate_ref"])
        self.assertNotIn("object_id", json.dumps(job, sort_keys=True))
        queued = self.store.list_candidates(
            owner_chat_id="chat_candidates", status="queued"
        )["candidates"]
        self.assertEqual(len(queued), 1)
        self.assertEqual(queued[0]["revision"], 2)

    def test_claim_and_paged_read_use_the_frozen_job_binding(self):
        space = self._candidate_space()
        original = b"frozen-candidate-content"
        candidate = self._file_candidate(space_id=space["space_id"], content=original)
        job = self._enqueue_candidate_job(candidate)
        claimed = self._claim_candidate_job(job)

        bindings = self.store.list_job_candidates(
            owner_chat_id="chat_candidates", job_id=job["job_id"]
        )["candidates"]
        self.assertEqual(bindings[0]["outcome"], "processing")
        self.assertEqual(bindings[0]["binding_revision"], 2)
        processing = self.store.list_candidates(
            owner_chat_id="chat_candidates", status="processing"
        )["candidates"]
        self.assertEqual(processing[0]["candidate_id"], candidate["candidate_id"])

        replacement = self.store.put_object(
            sanitize_for_storage(
                b"replacement-live-row",
                declared_mime="text/markdown",
                trust=StorageTrust.SYSTEM,
            )
        )
        with sqlite3.connect(self.store.db_path) as connection:
            connection.execute(
                "UPDATE candidates SET object_id=?, payload_hash='tampered-live-row' "
                "WHERE candidate_id=?",
                (replacement["object_id"], candidate["candidate_id"]),
            )
        first = self.store.read_job_candidate_content(
            owner_chat_id="chat_candidates",
            job_id=job["job_id"],
            candidate_ref=candidate["candidate_ref"],
            offset=0,
            limit=7,
        )
        second = self.store.read_job_candidate_content(
            owner_chat_id="chat_candidates",
            job_id=job["job_id"],
            candidate_ref=candidate["candidate_ref"],
            offset=first["next_offset"],
            limit=128,
        )
        self.assertEqual(
            base64.b64decode(first["data"]) + base64.b64decode(second["data"]),
            original,
        )
        self.assertEqual(first["sha256"], hashlib.sha256(original).hexdigest())
        self.assertNotIn("object_id", json.dumps(first, sort_keys=True))
        self.assertEqual(claimed["status"], "leased")

    def test_candidate_bound_apply_new_uses_frozen_bytes_and_space_cas(self):
        space = self._candidate_space()
        content = b"apply frozen bytes"
        candidate = self._file_candidate(space_id=space["space_id"], content=content)
        job = self._enqueue_candidate_job(candidate)
        claimed = self._claim_candidate_job(job)
        binding = self.store.list_job_candidates(
            owner_chat_id="chat_candidates", job_id=job["job_id"]
        )["candidates"][0]

        applied = self.store.apply_job_candidate_new(
            owner_chat_id="chat_candidates",
            job_id=job["job_id"],
            candidate_ref=candidate["candidate_ref"],
            expected_binding_revision=binding["binding_revision"],
            expected_space_revision=space["revision"],
            operation_id="candidate_apply_new",
        )
        replay = self.store.apply_job_candidate_new(
            owner_chat_id="chat_candidates",
            job_id=job["job_id"],
            candidate_ref=candidate["candidate_ref"],
            expected_binding_revision=binding["binding_revision"],
            expected_space_revision=space["revision"],
            operation_id="candidate_apply_new",
        )
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["entry"]["entry_id"], applied["entry"]["entry_id"])
        read = self.store.read_scoped_content(
            owner_chat_id="chat_candidates",
            ref=applied["entry"]["ref"],
        )
        self.assertEqual(base64.b64decode(read["data"]), content)
        completed = self.store.complete_consolidation_job(
            owner_chat_id="chat_candidates",
            job_id=job["job_id"],
            worker_id="candidate_worker",
            lease_token=claimed["lease_token"],
            expected_revision=claimed["revision"],
            operation_id="candidate_job_complete",
        )
        self.assertEqual(completed["status"], "completed")

    def test_candidate_review_accept_reject_and_triple_cas(self):
        owner = "chat_review"
        session = "session_review"
        attempt = "attempt_review"
        space = self._candidate_space(owner=owner)
        target = self.store.create_entry(
            owner_chat_id=owner,
            space_id=space["space_id"],
            path="/fact.md",
            kind="file",
            content=b"old fact\n",
            mime_type="text/markdown",
            expected_space_revision=space["revision"],
            operation_id="review_target_create",
        )
        candidate = self._file_candidate(
            owner=owner,
            session=session,
            attempt=attempt,
            space_id=space["space_id"],
            path="/fact.md",
            content=b"new fact\n",
            operation="review_candidate_create",
        )
        job = self._enqueue_candidate_job(
            candidate,
            owner=owner,
            session=session,
            attempt=attempt,
            operation="review_job_enqueue",
        )
        claimed = self._claim_candidate_job(job, operation="review_job_claim")
        binding = self.store.list_job_candidates(
            owner_chat_id=owner, job_id=job["job_id"]
        )["candidates"][0]
        with self.assertRaises(MemoryV2Error) as unsupported_merge:
            self.store.propose_job_candidate_review(
                owner_chat_id=owner,
                job_id=job["job_id"],
                candidate_ref=candidate["candidate_ref"],
                expected_binding_revision=binding["binding_revision"],
                target_entry_id=target["entry_id"],
                expected_target_revision=target["revision"],
                operation_id="review_merge_unsupported",
                mode="merge",
            )
        self.assertEqual(unsupported_merge.exception.code, "context_v2_invalid_request")
        review = self.store.propose_job_candidate_review(
            owner_chat_id=owner,
            job_id=job["job_id"],
            candidate_ref=candidate["candidate_ref"],
            expected_binding_revision=binding["binding_revision"],
            target_entry_id=target["entry_id"],
            expected_target_revision=target["revision"],
            operation_id="review_propose",
        )
        review_replay = self.store.propose_job_candidate_review(
            owner_chat_id=owner,
            job_id=job["job_id"],
            candidate_ref=candidate["candidate_ref"],
            expected_binding_revision=binding["binding_revision"],
            target_entry_id=target["entry_id"],
            expected_target_revision=target["revision"],
            operation_id="review_propose",
        )
        self.assertEqual(review["status"], "pending")
        self.assertEqual(review_replay["review_id"], review["review_id"])
        self.assertTrue(review_replay["replayed"])
        self.assertIn("-old fact", review["diff_preview"])
        self.assertIn("+new fact", review["diff_preview"])
        self.assertNotIn("object_id", json.dumps(review, sort_keys=True))
        self.assertEqual(
            self.store.get_candidate_review(
                owner_chat_id=owner, review_id=review["review_id"]
            )["review_id"],
            review["review_id"],
        )

        with self.assertRaises(MemoryV2Error) as stale_candidate:
            self.store.decide_candidate_review(
                owner_chat_id=owner,
                review_id=review["review_id"],
                decision="accept",
                expected_review_revision=review["revision"],
                expected_candidate_revision=candidate["revision"] + 1,
                expected_target_revision=target["revision"],
                expected_space_revision=target["space_revision"],
                operation_id="review_accept_stale_candidate",
            )
        self.assertEqual(stale_candidate.exception.code, "context_v2_revision_conflict")

        accepted = self.store.decide_candidate_review(
            owner_chat_id=owner,
            review_id=review["review_id"],
            decision="accept",
            expected_review_revision=review["revision"],
            expected_candidate_revision=candidate["revision"],
            expected_target_revision=target["revision"],
            expected_space_revision=target["space_revision"],
            operation_id="review_accept",
        )
        self.assertEqual(accepted["review"]["status"], "applied")
        self.assertEqual(accepted["entry"]["revision"], 2)
        read = self.store.read_scoped_content(
            owner_chat_id=owner,
            ref=accepted["entry"]["ref"],
        )
        self.assertEqual(base64.b64decode(read["data"]), b"new fact\n")
        with self.assertRaises(MemoryV2Error) as stale_review:
            self.store.decide_candidate_review(
                owner_chat_id=owner,
                review_id=review["review_id"],
                decision="accept",
                expected_review_revision=review["revision"],
                expected_candidate_revision=candidate["revision"],
                expected_target_revision=target["revision"],
                expected_space_revision=target["space_revision"],
                operation_id="review_accept_again",
            )
        self.assertEqual(stale_review.exception.code, "context_v2_revision_conflict")
        self.assertEqual(claimed["status"], "leased")

    def test_job_completion_guard_terminal_isolation_and_source_isolation(self):
        space = self._candidate_space()
        candidate = self._file_candidate(space_id=space["space_id"])
        job = self._enqueue_candidate_job(candidate)
        claimed = self._claim_candidate_job(job)

        with self.assertRaises(MemoryV2Error) as incomplete:
            self.store.complete_consolidation_job(
                owner_chat_id="chat_candidates",
                job_id=job["job_id"],
                worker_id="candidate_worker",
                lease_token=claimed["lease_token"],
                expected_revision=claimed["revision"],
                operation_id="candidate_complete_too_early",
            )
        self.assertEqual(incomplete.exception.code, "context_v2_job_candidates_incomplete")
        failed = self.store.fail_consolidation_job(
            owner_chat_id="chat_candidates",
            job_id=job["job_id"],
            worker_id="candidate_worker",
            lease_token=claimed["lease_token"],
            expected_revision=claimed["revision"],
            operation_id="candidate_job_fail",
            error_code="source_partial",
        )
        self.assertEqual(failed["status"], "failed")
        isolated = self.store.list_job_candidates(
            owner_chat_id="chat_candidates", job_id=job["job_id"]
        )["candidates"][0]
        self.assertEqual(isolated["outcome"], "isolated")
        self.assertEqual(
            self.store.list_candidates(
                owner_chat_id="chat_candidates", status="isolated"
            )["candidates"][0]["candidate_id"],
            candidate["candidate_id"],
        )

        pending = self._file_candidate(
            space_id=space["space_id"],
            path="/pending.md",
            operation="candidate_pending_for_isolation",
        )
        source_isolated = self.store.isolate_candidates_for_attempt(
            owner_chat_id="chat_candidates",
            session_id="session_candidates",
            attempt_id="attempt_candidates",
            reason="capture_partial",
            operation_id="candidate_source_isolation",
        )
        replay = self.store.isolate_candidates_for_attempt(
            owner_chat_id="chat_candidates",
            session_id="session_candidates",
            attempt_id="attempt_candidates",
            reason="capture_partial",
            operation_id="candidate_source_isolation",
        )
        self.assertEqual(source_isolated["candidate_ids"], [pending["candidate_id"]])
        self.assertEqual(replay["candidate_ids"], source_isolated["candidate_ids"])
        self.assertTrue(replay["replayed"])

    def test_review_content_refs_are_stable_owner_bound_and_revision_checked(self):
        owner = "chat_review_refs"
        space, target, candidate, job, claimed, review = self._prepare_candidate_review(
            owner=owner
        )
        self.assertRegex(
            review["diff_ref"],
            r"^pupu://memory/review/[A-Za-z0-9._:-]+@1/diff$",
        )
        proposed_ref = review["proposed"]["content"]["ref"]
        self.assertRegex(
            proposed_ref,
            r"^pupu://memory/review/[A-Za-z0-9._:-]+@1/proposed$",
        )
        diff_page = self.store.read_scoped_content(
            owner_chat_id=owner,
            ref=review["diff_ref"],
            limit=5,
        )
        proposed_page = self.store.read_scoped_content(
            owner_chat_id=owner,
            ref=proposed_ref,
        )
        self.assertTrue(diff_page["truncated"])
        self.assertEqual(base64.b64decode(proposed_page["data"]), b"new fact\n")
        with self.assertRaises(MemoryV2Error) as wrong_owner:
            self.store.read_scoped_content(
                owner_chat_id="chat_other",
                ref=review["diff_ref"],
            )
        self.assertEqual(wrong_owner.exception.code, "context_v2_content_not_found")
        with self.assertRaises(MemoryV2Error) as wrong_revision:
            self.store.read_scoped_content(
                owner_chat_id=owner,
                ref=review["diff_ref"].replace("@1/diff", "@2/diff"),
            )
        self.assertEqual(wrong_revision.exception.code, "context_v2_content_not_found")

        accepted = self.store.decide_candidate_review(
            owner_chat_id=owner,
            review_id=review["review_id"],
            decision="accept",
            expected_review_revision=review["revision"],
            expected_candidate_revision=candidate["revision"],
            expected_target_revision=target["revision"],
            expected_space_revision=target["space_revision"],
            operation_id="review_refs_accept",
        )
        self.assertEqual(accepted["review"]["diff_ref"], review["diff_ref"])
        self.assertEqual(
            base64.b64decode(
                self.store.read_scoped_content(
                    owner_chat_id=owner,
                    ref=review["proposed"]["content"]["ref"],
                )["data"]
            ),
            b"new fact\n",
        )
        self.assertEqual(claimed["status"], "leased")
        self.assertEqual(space["space_id"], target["space_id"])
        self.assertEqual(job["owner_chat_id"], owner)

    def test_review_reject_keeps_target_and_stale_target_blocks_accept(self):
        owner = "chat_review_reject"
        space, target, candidate, job, claimed, review = self._prepare_candidate_review(
            owner=owner
        )
        rejected = self.store.decide_candidate_review(
            owner_chat_id=owner,
            review_id=review["review_id"],
            decision="reject",
            expected_review_revision=review["revision"],
            expected_candidate_revision=candidate["revision"],
            expected_target_revision=target["revision"],
            expected_space_revision=target["space_revision"],
            operation_id="review_reject",
            decision_reason="not durable",
        )
        self.assertEqual(rejected["review"]["status"], "rejected")
        unchanged = self.store.get_entry(
            owner_chat_id=owner,
            space_id=space["space_id"],
            entry_id=target["entry_id"],
        )
        self.assertEqual(unchanged["revision"], 1)
        self.assertEqual(
            base64.b64decode(
                self.store.read_scoped_content(
                    owner_chat_id=owner,
                    ref=unchanged["ref"],
                )["data"]
            ),
            b"old fact\n",
        )
        completed = self.store.complete_consolidation_job(
            owner_chat_id=owner,
            job_id=job["job_id"],
            worker_id="candidate_worker",
            lease_token=claimed["lease_token"],
            expected_revision=claimed["revision"],
            operation_id="review_reject_complete",
        )
        self.assertEqual(completed["status"], "completed")

        stale_owner = "chat_review_stale_target"
        (
            stale_space,
            stale_target,
            stale_candidate,
            stale_job,
            stale_claimed,
            stale_review,
        ) = self._prepare_candidate_review(owner=stale_owner)
        self.store.update_entry(
            owner_chat_id=stale_owner,
            space_id=stale_space["space_id"],
            entry_id=stale_target["entry_id"],
            expected_revision=stale_target["revision"],
            expected_space_revision=stale_target["space_revision"],
            operation_id="review_stale_target_update",
            content=b"third-party edit\n",
            mime_type="text/markdown",
        )
        with self.assertRaises(MemoryV2Error) as stale:
            self.store.decide_candidate_review(
                owner_chat_id=stale_owner,
                review_id=stale_review["review_id"],
                decision="accept",
                expected_review_revision=stale_review["revision"],
                expected_candidate_revision=stale_candidate["revision"],
                expected_target_revision=stale_target["revision"],
                expected_space_revision=stale_target["space_revision"],
                operation_id="review_stale_target_accept",
            )
        self.assertEqual(stale.exception.code, "context_v2_revision_conflict")
        self.assertEqual(
            self.store.get_candidate_review(
                owner_chat_id=stale_owner,
                review_id=stale_review["review_id"],
            )["status"],
            "pending",
        )
        self.assertEqual(stale_job["owner_chat_id"], stale_owner)
        self.assertEqual(stale_claimed["status"], "leased")

    def test_review_decision_rejects_tampered_server_frozen_proposal(self):
        owner = "chat_review_tamper"
        space, target, candidate, job, claimed, review = self._prepare_candidate_review(
            owner=owner
        )
        with sqlite3.connect(self.store.db_path) as connection:
            row = connection.execute(
                "SELECT proposed_snapshot_json FROM candidate_reviews WHERE review_id=?",
                (review["review_id"],),
            ).fetchone()
            snapshot = json.loads(row[0])
            snapshot["description"] = "tampered proposal"
            connection.execute(
                "UPDATE candidate_reviews SET proposed_snapshot_json=? WHERE review_id=?",
                (json.dumps(snapshot, sort_keys=True), review["review_id"]),
            )
        with self.assertRaises(MemoryV2Error) as tampered:
            self.store.decide_candidate_review(
                owner_chat_id=owner,
                review_id=review["review_id"],
                decision="accept",
                expected_review_revision=review["revision"],
                expected_candidate_revision=candidate["revision"],
                expected_target_revision=target["revision"],
                expected_space_revision=target["space_revision"],
                operation_id="review_tamper_accept",
            )
        self.assertEqual(tampered.exception.code, "context_v2_candidate_changed")
        self.assertEqual(job["owner_chat_id"], owner)
        self.assertEqual(claimed["status"], "leased")
        self.assertEqual(space["space_id"], target["space_id"])

    def test_apply_rejects_tampered_frozen_candidate_snapshot(self):
        space = self._candidate_space(owner="chat_candidate_tamper")
        candidate = self._file_candidate(
            owner="chat_candidate_tamper",
            session="session_candidate_tamper",
            attempt="attempt_candidate_tamper",
            space_id=space["space_id"],
            operation="candidate_tamper_create",
        )
        job = self._enqueue_candidate_job(
            candidate,
            owner="chat_candidate_tamper",
            session="session_candidate_tamper",
            attempt="attempt_candidate_tamper",
            operation="candidate_tamper_enqueue",
        )
        self._claim_candidate_job(job, operation="candidate_tamper_claim")
        binding = self.store.list_job_candidates(
            owner_chat_id="chat_candidate_tamper",
            job_id=job["job_id"],
        )["candidates"][0]
        with sqlite3.connect(self.store.db_path) as connection:
            row = connection.execute(
                "SELECT snapshot_json FROM consolidation_job_candidates "
                "WHERE job_id=? AND candidate_id=?",
                (job["job_id"], candidate["candidate_id"]),
            ).fetchone()
            snapshot = json.loads(row[0])
            snapshot["description"] = "tampered frozen candidate"
            connection.execute(
                "UPDATE consolidation_job_candidates SET snapshot_json=? "
                "WHERE job_id=? AND candidate_id=?",
                (
                    json.dumps(snapshot, sort_keys=True),
                    job["job_id"],
                    candidate["candidate_id"],
                ),
            )
        with self.assertRaises(MemoryV2Error) as tampered:
            self.store.apply_job_candidate_new(
                owner_chat_id="chat_candidate_tamper",
                job_id=job["job_id"],
                candidate_ref=candidate["candidate_ref"],
                expected_binding_revision=binding["revision"],
                expected_space_revision=space["revision"],
                operation_id="candidate_tamper_apply",
            )
        self.assertEqual(tampered.exception.code, "context_v2_candidate_changed")

    def test_repository_entry_id_and_tombstone_reader_are_schema_v4_compatible(self):
        space = self.store.ensure_space(
            scope_kind="chat",
            scope_key="chat_repository",
            owner_chat_id="chat_repository",
            name="Repository",
            operation_id="repository_space",
        )
        created = self.store.create_entry(
            owner_chat_id="chat_repository",
            space_id=space["space_id"],
            entry_id="entry_portable",
            path="/portable",
            kind="folder",
            expected_space_revision=space["revision"],
            operation_id="repository_create",
        )
        self.assertEqual(created["entry_id"], "entry_portable")
        deleted = self.store.delete_entry(
            owner_chat_id="chat_repository",
            space_id=space["space_id"],
            entry_id=created["entry_id"],
            expected_revision=created["revision"],
            expected_space_revision=created["space_revision"],
            operation_id="repository_delete",
        )
        listing = self.store.list_repository_entries(
            owner_chat_id="chat_repository",
            space_id=space["space_id"],
            include_deleted=True,
        )
        self.assertEqual(deleted["space_revision"], listing["space_revision"])
        self.assertEqual(
            listing["entries"],
            [
                {
                    **self.store.get_entry(
                        owner_chat_id="chat_repository",
                        space_id=space["space_id"],
                        entry_id="entry_portable",
                        revision=2,
                    ),
                    "deleted": True,
                }
            ],
        )
        with sqlite3.connect(self.store.db_path) as connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 4)


if __name__ == "__main__":
    unittest.main()
