import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import memory_v2_sanitizer as sanitizer_module
from memory_v2_sanitizer import (
    SANITIZER_VERSION,
    SanitizedPayload,
    SanitizerError,
    StorageTrust,
    sanitize_for_storage,
    sanitize_text,
    sanitize_value,
)
from memory_v2_store import EventProjection, MemoryV2Error, MemoryV2Store
from secret_redaction import _secret_encodings
from secret_scrub_registry import get_secret_scrub_registry, register_secret_values


class MemoryV2SanitizerTests(unittest.TestCase):
    def setUp(self):
        get_secret_scrub_registry().reset_for_tests()

    def tearDown(self):
        get_secret_scrub_registry().reset_for_tests()

    def _mutation_snapshot(self, store):
        with sqlite3.connect(store.db_path) as connection:
            tables = [
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name NOT LIKE 'sqlite_%' ORDER BY name"
                )
            ]
            counts = {
                table: connection.execute(
                    f'SELECT COUNT(*) FROM "{table}"'
                ).fetchone()[0]
                for table in tables
            }
        durable_files = {}
        for directory in (store.objects_dir, store.tmp_dir):
            for path in directory.rglob("*"):
                if path.is_file():
                    durable_files[str(path.relative_to(store.root_dir))] = path.read_bytes()
        return counts, durable_files

    def _assert_no_secret_trace(self, store, secret):
        encoded_variants = {
            encoded
            for variant in {secret, secret.lower(), secret.casefold()}
            for encoded in _secret_encodings(variant)
        }
        for path in store.root_dir.rglob("*"):
            if not path.is_file():
                continue
            raw = path.read_bytes()
            for encoded in encoded_variants:
                with self.subTest(path=path.name, encoded=encoded[:16]):
                    self.assertFalse(
                        encoded.encode("utf-8") in raw,
                        f"secret trace found in {path.name}",
                    )
        with sqlite3.connect(store.db_path) as connection:
            self.assertEqual(
                connection.execute(
                    "SELECT COUNT(*) FROM operations WHERE "
                    "instr(response_json, ?) > 0 OR instr(operation_id, ?) > 0",
                    (secret, secret),
                ).fetchone()[0],
                0,
            )
            self.assertEqual(
                connection.execute(
                    "SELECT COUNT(*) FROM entry_search_documents WHERE "
                    "instr(path, ?) > 0 OR instr(name, ?) > 0 OR "
                    "instr(description, ?) > 0 OR instr(content_preview, ?) > 0",
                    (secret, secret, secret, secret),
                ).fetchone()[0],
                0,
            )

    def _assert_sensitive_identifier_rejected(self, store, secret, callback):
        before = self._mutation_snapshot(store)
        hold = sqlite3.connect(store.db_path)
        try:
            hold.execute("BEGIN")
            hold.execute("SELECT COUNT(*) FROM meta").fetchone()
            with self.assertRaises(MemoryV2Error) as error:
                callback()
            self.assertEqual(error.exception.code, "context_v2_sensitive_metadata")
            self.assertNotIn(secret, str(error.exception))
            self.assertEqual(self._mutation_snapshot(store), before)
            self._assert_no_secret_trace(store, secret)
            self.assertTrue(Path(str(store.db_path) + "-wal").exists())
            self.assertTrue(Path(str(store.db_path) + "-shm").exists())
        finally:
            hold.rollback()
            hold.close()

    def _sensitive_identifier_mutation(self, store, scenario, secret):
        def chat_space(owner="chat_identifier_audit"):
            return store.ensure_space(
                scope_kind="chat",
                scope_key=owner,
                owner_chat_id=owner,
                name="Identifier audit",
                operation_id="identifier_space",
            )

        def valid_entry(owner="chat_identifier_audit", *, kind="file"):
            space = chat_space(owner)
            kwargs = {
                "owner_chat_id": owner,
                "space_id": space["space_id"],
                "path": "/source.md" if kind == "file" else "/source-link",
                "kind": kind,
                "expected_space_revision": 1,
                "operation_id": "identifier_source_entry",
                "description": "ordinary source",
            }
            if kind == "file":
                kwargs.update(mime_type="text/plain", content=b"ordinary source")
            else:
                kwargs["link_url"] = "https://example.test/source"
            return space, store.create_entry(**kwargs)

        if scenario in {"admission_cohort", "admission_hash_strategy"}:
            kwargs = {
                "owner_chat_id": "chat_identifier_admission",
                "session_id": "session_identifier_admission",
                "requested_rollout_mode": "all",
                "effective_rollout_mode": "all",
                "cohort": "all_active",
                "target_mode": "active",
                "decision_reason": "ordinary decision",
                "canary_selected": False,
                "canary_percent": 0,
                "canary_bucket": 0,
                "hash_strategy": "sha256_owner_v1",
                "provenance": {"source": "identifier-audit"},
                "operation_id": "identifier_admission",
            }
            kwargs[
                "cohort" if scenario == "admission_cohort" else "hash_strategy"
            ] = secret
            return lambda: store.resolve_chat_admission(**kwargs)
        if scenario == "bootstrap_hash":
            return lambda: store.bootstrap_history(
                owner_chat_id="chat_identifier_bootstrap",
                session_id="session_identifier_bootstrap",
                attempt_id="attempt_identifier_bootstrap",
                history=[{"role": "user", "content": "x" * 70000}],
                operation_id="identifier_bootstrap",
                bootstrap_hash=secret,
            )
        if scenario == "bootstrap_role":
            return lambda: store.bootstrap_history(
                owner_chat_id="chat_identifier_bootstrap_role",
                session_id="session_identifier_bootstrap_role",
                attempt_id="attempt_identifier_bootstrap_role",
                history=[{"role": secret, "content": "ordinary"}],
                operation_id="identifier_bootstrap_role",
                bootstrap_hash="0" * 64,
            )
        if scenario == "event_mime":
            return lambda: store.append_semantic_event(
                owner_chat_id="chat_identifier_event",
                session_id="session_identifier_event",
                attempt_id="attempt_identifier_event",
                operation_id="identifier_event",
                content_mime_type="application/" + secret,
                event={
                    "schema_version": "context.v2",
                    "event_id": "ctx_evt_identifier_event",
                    "type": "message.user",
                    "run_id": "run_identifier_event",
                    "agent_id": "agent_identifier_event",
                    "visibility": "internal",
                    "payload": {"text": "ordinary"},
                },
            )
        if scenario == "checkpoint_mime":
            return lambda: store.record_checkpoint(
                owner_chat_id="chat_identifier_checkpoint",
                session_id="session_identifier_checkpoint",
                attempt_id="attempt_identifier_checkpoint",
                manifest={"kind": "identifier-audit"},
                content=b"ordinary checkpoint",
                operation_id="identifier_checkpoint",
                mime_type="application/" + secret,
            )
        if scenario == "artifact_mime":
            return lambda: store.record_artifact(
                owner_chat_id="chat_identifier_artifact",
                session_id="session_identifier_artifact",
                attempt_id="attempt_identifier_artifact",
                artifact={"kind": "identifier-audit"},
                content=b"ordinary artifact",
                operation_id="identifier_artifact",
                mime_type="application/" + secret,
            )
        if scenario == "handoff_mime":
            return lambda: store.record_handoff(
                owner_chat_id="chat_identifier_handoff",
                session_id="session_identifier_handoff",
                attempt_id="attempt_identifier_handoff",
                handoff={"kind": "identifier-audit"},
                content=b"ordinary handoff",
                operation_id="identifier_handoff",
                mime_type="application/" + secret,
            )
        if scenario == "space_namespace":
            return lambda: store.ensure_space(
                scope_kind="long_term",
                scope_key="user_identifier_audit",
                namespace=secret,
                name="Long term identifier audit",
                operation_id="identifier_long_term_space",
            )
        if scenario == "space_scope_key":
            return lambda: store.ensure_space(
                scope_kind="long_term",
                scope_key=secret,
                namespace="user_identifier_audit",
                name="Long term identifier audit",
                operation_id="identifier_long_term_scope_key",
            )
        if scenario.startswith("entry_create_"):
            space = chat_space()
            kwargs = {
                "owner_chat_id": "chat_identifier_audit",
                "space_id": space["space_id"],
                "path": "/created.md",
                "kind": "file",
                "description": "ordinary entry",
                "mime_type": "text/plain",
                "content": b"ordinary entry",
                "expected_space_revision": 1,
                "operation_id": "identifier_create_entry",
                "created_by": "ordinary-agent",
            }
            field = scenario.removeprefix("entry_create_")
            if field == "path":
                kwargs["path"] = "/created-" + secret + ".md"
            elif field == "mime":
                kwargs["mime_type"] = "application/" + secret
            elif field == "link":
                kwargs.update(
                    path="/created-link",
                    kind="link",
                    content=None,
                    link_url="https://example.test/?value=" + secret,
                )
            elif field == "created_by":
                kwargs["created_by"] = secret
            elif field == "source":
                kwargs["source_event_id"] = secret
            return lambda: store.create_entry(**kwargs)
        if scenario.startswith("entry_update_"):
            field = scenario.removeprefix("entry_update_")
            kind = "link" if field == "link" else "file"
            space, entry = valid_entry(kind=kind)
            kwargs = {
                "owner_chat_id": "chat_identifier_audit",
                "space_id": space["space_id"],
                "entry_id": entry["entry_id"],
                "expected_revision": 1,
                "expected_space_revision": 2,
                "operation_id": "identifier_update_entry",
            }
            if field == "path":
                kwargs["path"] = "/updated-" + secret + ".md"
            elif field == "mime":
                kwargs["mime_type"] = "application/" + secret
            elif field == "link":
                kwargs["link_url"] = "https://example.test/?value=" + secret
            elif field == "created_by":
                kwargs["created_by"] = secret
            elif field == "source":
                kwargs["source_event_id"] = secret
            return lambda: store.update_entry(**kwargs)
        if scenario.startswith("candidate_"):
            space = chat_space()
            kwargs = {
                "owner_chat_id": "chat_identifier_audit",
                "session_id": "session_identifier_candidate",
                "attempt_id": "attempt_identifier_candidate",
                "source_agent_run_id": "ordinary-agent-run",
                "source_tool_call_id": "ordinary-tool-call",
                "target_space_id": space["space_id"],
                "target_path": "/candidate.md",
                "kind": "file",
                "description": "ordinary candidate",
                "mime_type": "text/plain",
                "content": b"ordinary candidate",
                "rationale": "ordinary rationale",
                "sensitivity": "normal",
                "operation_id": "identifier_candidate",
            }
            field = scenario.removeprefix("candidate_")
            if field == "agent":
                kwargs["source_agent_run_id"] = secret
            elif field == "tool":
                kwargs["source_tool_call_id"] = secret
            elif field == "path":
                kwargs["target_path"] = "/candidate-" + secret + ".md"
            elif field == "mime":
                kwargs["mime_type"] = "application/" + secret
            elif field == "link":
                kwargs.update(
                    target_path="/candidate-link",
                    kind="link",
                    content=None,
                    link_url="https://example.test/?value=" + secret,
                )
            elif field == "sensitivity":
                kwargs["sensitivity"] = secret
            elif field == "source":
                kwargs["source_event_ids"] = (secret,)
            return lambda: store.create_candidate(**kwargs)
        if scenario == "job_type":
            return lambda: store.enqueue_consolidation_job(
                owner_chat_id="chat_identifier_job_type",
                job_type=secret,
                payload={"safe": "ordinary"},
                operation_id="identifier_job_type",
            )
        if scenario.startswith("promotion_"):
            space, entry = valid_entry()
            kwargs = {
                "owner_chat_id": "chat_identifier_audit",
                "source_space_id": space["space_id"],
                "source_entry_id": entry["entry_id"],
                "source_entry_revision": 1,
                "target_namespace": "user_identifier_audit",
                "target_path": "/promoted.md",
                "operation_id": "identifier_promotion",
            }
            if scenario == "promotion_namespace":
                kwargs["target_namespace"] = secret
            elif scenario == "promotion_path":
                kwargs["target_path"] = "/promoted-" + secret + ".md"
            else:
                kwargs["target_entry_id"] = secret
            return lambda: store.propose_promotion(**kwargs)
        if scenario.startswith("vector_"):
            space, entry = valid_entry()
            kwargs = {
                "backend": "local-vector",
                "space_id": space["space_id"],
                "entry_id": entry["entry_id"],
                "expected_entry_revision": 1,
                "content_hash": "0" * 64,
                "chunks": [
                    {
                        "chunk_id": "ordinary-vector-chunk",
                        "ordinal": 0,
                        "text_hash": "1" * 64,
                        "external_id": "ordinary-vector-external",
                    }
                ],
            }
            if scenario == "vector_backend":
                kwargs["backend"] = secret
            elif scenario == "vector_chunk":
                kwargs["chunks"][0]["chunk_id"] = secret
            else:
                kwargs["chunks"][0]["external_id"] = secret
            return lambda: store.vector_commit_entry_index(**kwargs)
        if scenario in {"job_claim_worker", "job_specific_worker"}:
            job = store.enqueue_consolidation_job(
                owner_chat_id="chat_identifier_job",
                job_type="identifier-audit",
                payload={"safe": "ordinary"},
                operation_id="identifier_job_enqueue",
            )
            if scenario == "job_claim_worker":
                return lambda: store.claim_consolidation_job(
                    owner_chat_id="chat_identifier_job",
                    worker_id=secret,
                    operation_id="identifier_job_claim",
                )
            return lambda: store.claim_specific_consolidation_job(
                owner_chat_id="chat_identifier_job",
                job_id=job["job_id"],
                expected_revision=1,
                worker_id=secret,
                operation_id="identifier_job_specific_claim",
            )
        if scenario in {"job_transition_worker", "job_transition_token"}:
            job = store.enqueue_consolidation_job(
                owner_chat_id="chat_identifier_transition",
                job_type="identifier-audit",
                payload={"safe": "ordinary"},
                operation_id="identifier_transition_enqueue",
            )
            claim = store.claim_specific_consolidation_job(
                owner_chat_id="chat_identifier_transition",
                job_id=job["job_id"],
                expected_revision=1,
                worker_id="ordinary-worker",
                operation_id="identifier_transition_claim",
            )["job"]
            return lambda: store.heartbeat_consolidation_job(
                owner_chat_id="chat_identifier_transition",
                job_id=job["job_id"],
                worker_id=(secret if scenario == "job_transition_worker" else "ordinary-worker"),
                lease_token=(secret if scenario == "job_transition_token" else claim["lease_token"]),
                expected_revision=claim["revision"],
                operation_id="identifier_transition_heartbeat",
            )
        if scenario in {
            "deletion_claim_worker",
            "deletion_complete_worker",
            "deletion_complete_token",
        }:
            store.delete_chat(
                owner_chat_id="chat_identifier_deletion",
                operation_id="identifier_delete_chat",
            )
            if scenario == "deletion_claim_worker":
                return lambda: store.claim_deletion(
                    worker_id=secret,
                    operation_id="identifier_deletion_claim",
                )
            claim = store.claim_deletion(
                worker_id="ordinary-worker",
                operation_id="identifier_deletion_safe_claim",
            )["deletion"]
            return lambda: store.complete_deletion(
                deletion_id=claim["deletion_id"],
                worker_id=(
                    secret
                    if scenario == "deletion_complete_worker"
                    else "ordinary-worker"
                ),
                lease_token=(
                    secret
                    if scenario == "deletion_complete_token"
                    else claim["lease_token"]
                ),
                expected_revision=claim["revision"],
                operation_id="identifier_deletion_complete",
            )
        raise AssertionError(f"unsupported sensitive identifier scenario: {scenario}")

    def test_jwt_and_multiline_pem_are_scrubbed_under_benign_keys(self):
        value = {
            "stdout": (
                "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0."
                "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c\n"
                "-----BEGIN RSA PRIVATE KEY-----\nsecret-body\n"
                "-----END RSA PRIVATE KEY-----"
            )
        }
        scrubbed = sanitize_value(value)["stdout"]
        self.assertNotIn("eyJhbGci", scrubbed)
        self.assertNotIn("secret-body", scrubbed)
        self.assertGreaterEqual(scrubbed.count("[REDACTED]"), 2)

    def test_vendor_tokens_and_vault_handles_are_masked(self):
        samples = (
            "github_pat_abcdefghijklmnopqrstuvwxyz123456",
            "sk-ant-abcdefghijk",
            "sk-proj-abcdefghijk",
            "ghp_abcdefghijklmnopqrstuvwxyz",
            "AKIAABCDEFGHIJKLMNOP",
            "xoxb-1234567890-abcdefgh",
            "glpat-abcdefghijklmnop",
            "AIza" + "a" * 35,
            "ya29.abcdefghijklmnop",
            "npm_abcdefghijklmnop",
            "hf_abcdefghijklmnop",
            "sk_live_abcdefghijklmnop",
            "SG.abcdefghij.klmnopqrst",
            "dop_v1_abcdefghijklmnop",
            "Basic YWxhZGRpbjpvcGVuc2VzYW1l",
        )
        for sample in samples:
            with self.subTest(sample=sample[:12]):
                self.assertNotIn(sample, sanitize_text(f"before {sample} after"))
        handle = "pvh1_" + "a" * 64
        self.assertEqual(sanitize_text(handle), "[VAULT_HANDLE]")

    def test_sensitive_key_and_secret_shaped_dict_key_are_scrubbed(self):
        value = {
            "password": "plain-password",
            "ghp_abcdefghijklmnopqrstuvwxyz": "ordinary-value",
        }
        scrubbed = sanitize_value(value)
        self.assertEqual(scrubbed["password"], "[REDACTED]")
        self.assertNotIn("ghp_abcdefghijklmnopqrstuvwxyz", scrubbed)

    def test_registered_secret_all_encodings_are_scrubbed(self):
        secret = "Sup3r Secret+/Value_2026"
        self.assertTrue(register_secret_values((secret,), source="provider"))
        for encoded in _secret_encodings(secret):
            with self.subTest(encoded=encoded[:18]):
                self.assertNotIn(encoded, sanitize_text(f"left {encoded} right"))

    def test_registered_secret_is_scrubbed_inside_png_data_uri(self):
        secret = "AlphaNumericSecret2026XYZ"
        self.assertTrue(register_secret_values((secret,), source="provider"))
        value = f"data:image/png;base64,{secret}"
        self.assertNotIn(secret, sanitize_text(value))

    def test_registered_secret_in_binary_payload_fails_closed(self):
        secret = "AlphaNumericSecret2026XYZ"
        self.assertTrue(register_secret_values((secret,), source="mcp"))
        samples = {
            "png": b"\x89PNG\r\n\x1a\n" + secret.encode("ascii"),
            "pdf": b"%PDF-1.7\n" + secret.encode("ascii"),
            "nul": b"prefix\x00" + secret.encode("ascii"),
        }
        for label, raw in samples.items():
            with self.subTest(label=label):
                with self.assertRaises(SanitizerError) as error:
                    sanitize_for_storage(
                        raw,
                        declared_mime="application/octet-stream",
                        trust=StorageTrust.JOURNAL,
                    )
                self.assertEqual(error.exception.code, "context_v2_sanitizer_failed")
                self.assertNotIn(secret, str(error.exception))

    def test_registered_secret_binary_encodings_all_fail_closed(self):
        secret = "AlphaNumericSecret2026XYZ"
        self.assertTrue(register_secret_values((secret,), source="provider"))
        for encoded in _secret_encodings(secret):
            with self.subTest(encoded=encoded[:18]):
                with self.assertRaises(SanitizerError) as error:
                    sanitize_for_storage(
                        b"prefix\x00" + encoded.encode("utf-8"),
                        declared_mime="application/octet-stream",
                        trust=StorageTrust.JOURNAL,
                    )
                self.assertEqual(error.exception.code, "context_v2_sanitizer_failed")

    def test_secret_shapes_in_binary_payload_fail_closed(self):
        samples = {
            "jwt": (
                "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJiaW5hcnkifQ."
                "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
            ),
            "pem": (
                "-----BEGIN PRIVATE KEY-----\nsecret-body\n"
                "-----END PRIVATE KEY-----"
            ),
            "vendor": "github_pat_abcdefghijklmnopqrstuvwxyz123456",
            "bearer": "Bearer abcdefghijklmnopqrstuvwxyz",
            "assignment": "password=binary-secret-value",
            "vault_handle": "pvh1_" + "d" * 64,
        }
        for label, secret_shape in samples.items():
            with self.subTest(label=label):
                raw = b"%PDF-1.7\n" + secret_shape.encode("utf-8")
                with self.assertRaises(SanitizerError) as error:
                    sanitize_for_storage(
                        raw,
                        declared_mime="application/pdf",
                        trust=StorageTrust.VAULT_TAINTED,
                    )
                self.assertEqual(error.exception.code, "context_v2_sanitizer_failed")
                self.assertNotIn(secret_shape, str(error.exception))

    def test_rejected_binary_secret_leaves_no_store_trace(self):
        secret = "BinaryProviderSecret2026XYZ"
        self.assertTrue(register_secret_values((secret,), source="provider"))
        with tempfile.TemporaryDirectory() as root:
            store = MemoryV2Store(Path(root) / "memory_v2")
            try:
                with self.assertRaises(MemoryV2Error) as error:
                    store.record_artifact(
                        owner_chat_id="chat_binary_secret",
                        session_id="session_binary_secret",
                        attempt_id="attempt_binary_secret",
                        operation_id="binary_secret_artifact",
                        artifact={"kind": "binary_tool_result"},
                        content=b"\x89PNG\r\n\x1a\n" + secret.encode("ascii"),
                        mime_type="image/png",
                    )
                self.assertEqual(error.exception.code, "context_v2_sanitizer_failed")
                self.assertNotIn(secret, str(error.exception))
                self.assertEqual(list(store.objects_dir.iterdir()), [])
                self.assertEqual(list(store.tmp_dir.iterdir()), [])
                with sqlite3.connect(store.db_path) as connection:
                    for table in ("objects", "object_staging", "events", "artifacts", "operations"):
                        with self.subTest(table=table):
                            self.assertEqual(
                                connection.execute(
                                    f"SELECT COUNT(*) FROM {table}"
                                ).fetchone()[0],
                                0,
                            )
            finally:
                store.close()

    def test_registry_unavailable_fails_closed_for_text_and_binary(self):
        with mock.patch.object(
            sanitizer_module,
            "redact_registered_text",
            side_effect=RuntimeError("registry unavailable"),
        ):
            with self.assertRaises(SanitizerError) as text_error:
                sanitize_text("ordinary text")
        self.assertEqual(text_error.exception.code, "context_v2_sanitizer_failed")

        with mock.patch.object(
            sanitizer_module,
            "redact_registered_bytes",
            side_effect=RuntimeError("registry unavailable"),
        ):
            with self.assertRaises(SanitizerError) as binary_error:
                sanitize_for_storage(
                    b"\x89PNG\r\n\x1a\nordinary",
                    declared_mime="image/png",
                    trust=StorageTrust.JOURNAL,
                )
        self.assertEqual(binary_error.exception.code, "context_v2_sanitizer_failed")

    def test_short_numeric_and_common_registry_values_are_ignored(self):
        self.assertFalse(register_secret_values(("short",), source="provider"))
        self.assertFalse(register_secret_values(("123456789012",), source="provider"))
        self.assertFalse(
            register_secret_values(("examplepassword",), source="provider")
        )
        self.assertEqual(sanitize_text("short 123456789012"), "short 123456789012")

    def test_declared_text_cannot_override_png_magic(self):
        raw = b"\x89PNG\r\n\x1a\n" + b"binary-payload"
        payload = sanitize_for_storage(
            raw,
            declared_mime="text/plain",
            trust=StorageTrust.JOURNAL,
        )
        self.assertEqual(payload.data, raw)
        self.assertEqual(payload.media_class, "binary")
        self.assertEqual(payload.detected_mime, "image/png")
        self.assertTrue(payload.media_mismatch)
        self.assertFalse(payload.indexable)

    def test_octet_stream_declaration_cannot_suppress_json_scrub(self):
        jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature_payload"
        payload = sanitize_for_storage(
            json.dumps({"stdout": jwt}).encode("utf-8"),
            declared_mime="application/octet-stream",
            trust=StorageTrust.JOURNAL,
        )
        self.assertEqual(payload.media_class, "json")
        self.assertTrue(payload.media_mismatch)
        self.assertNotIn(jwt.encode("utf-8"), payload.data)

    def test_nul_marks_utf8_content_binary(self):
        raw = b"ordinary\x00text"
        payload = sanitize_for_storage(
            raw,
            declared_mime="text/plain",
            trust=StorageTrust.JOURNAL,
        )
        self.assertEqual(payload.media_class, "binary")
        self.assertEqual(payload.data, raw)

    def test_text_scrub_is_idempotent(self):
        source = (
            "password=my-secret-value Bearer abcdefghijklmnop "
            + "pvh1_"
            + "b" * 64
        )
        once = sanitize_text(source)
        self.assertEqual(sanitize_text(once), once)

    def test_vault_tainted_content_is_never_indexable_and_preview_is_bounded(self):
        payload = sanitize_for_storage(
            ("x" * 1024).encode("utf-8"),
            declared_mime="text/plain",
            trust=StorageTrust.VAULT_TAINTED,
        )
        self.assertFalse(payload.indexable)
        self.assertLessEqual(len(payload.preview), 256)
        self.assertEqual(payload.sanitizer_version, SANITIZER_VERSION)

    def test_raw_put_object_and_forged_payload_fail_closed(self):
        with tempfile.TemporaryDirectory() as root:
            store = MemoryV2Store(Path(root) / "memory_v2")
            try:
                with self.assertRaises(MemoryV2Error) as raw_error:
                    store.put_object(b"raw")
                self.assertEqual(raw_error.exception.code, "context_v2_unsanitized_content")
                with self.assertRaises(SanitizerError):
                    SanitizedPayload(
                        data=b"forged",
                        media_class="text",
                        detected_mime="text/plain",
                        declared_mime="text/plain",
                        media_mismatch=False,
                        indexable=True,
                        preview="forged",
                        trust=StorageTrust.SYSTEM,
                        sanitizer_version=SANITIZER_VERSION,
                    )
            finally:
                store.close()

    def test_sha_uuid_and_png_data_uri_are_not_over_redacted(self):
        sha = "0123456789abcdef" * 4
        uuid = "123e4567-e89b-12d3-a456-426614174000"
        png_uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
        source = f"{sha} {uuid} {png_uri}"
        self.assertEqual(sanitize_text(source), source)

    def test_workspace_cas_preview_and_fts_share_the_same_scrubbed_bytes(self):
        jwt = (
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmdHMtc2VjcmV0In0."
            "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        )
        with tempfile.TemporaryDirectory() as root:
            store = MemoryV2Store(Path(root) / "memory_v2")
            try:
                space = store.ensure_space(
                    scope_kind="chat",
                    scope_key="chat_fts_secret",
                    owner_chat_id="chat_fts_secret",
                    name="Chat memory",
                    operation_id="fts_space",
                )
                entry = store.create_entry(
                    owner_chat_id="chat_fts_secret",
                    space_id=space["space_id"],
                    path="/secret.md",
                    kind="file",
                    description="ordinary output",
                    mime_type="application/octet-stream",
                    content=json.dumps({"stdout": jwt}).encode("utf-8"),
                    expected_space_revision=1,
                    operation_id="fts_entry",
                )
                with sqlite3.connect(store.db_path) as connection:
                    document = connection.execute(
                        "SELECT content_preview FROM entry_search_documents "
                        "WHERE entry_id=?",
                        (entry["entry_id"],),
                    ).fetchone()[0]
                    lexical_backend = connection.execute(
                        "SELECT value FROM meta WHERE key='lexical_backend'"
                    ).fetchone()[0]
                    object_id = connection.execute(
                        "SELECT object_id FROM entries WHERE entry_id=?",
                        (entry["entry_id"],),
                    ).fetchone()[0]
                    if lexical_backend == "fts5":
                        self.assertEqual(
                            connection.execute(
                                "SELECT COUNT(*) FROM entry_fts WHERE entry_fts MATCH ?",
                                ("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",),
                            ).fetchone()[0],
                            0,
                        )
                self.assertNotIn(jwt, document)
                self.assertNotIn(jwt.encode("utf-8"), (store.objects_dir / object_id).read_bytes())
                self.assertEqual(
                    store.search_entries(
                        owner_chat_id="chat_fts_secret",
                        query="SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
                    )["results"],
                    [],
                )
            finally:
                store.close()

    def test_registered_secret_never_persists_in_workspace_metadata_or_fts(self):
        secret = "MetadataAuditSecret2026XYZ"
        self.assertTrue(register_secret_values((secret,), source="provider"))
        encoded_variants = tuple(_secret_encodings(secret))
        with tempfile.TemporaryDirectory() as root:
            store = MemoryV2Store(Path(root) / "memory_v2")
            try:
                space = store.ensure_space(
                    scope_kind="chat",
                    scope_key="chat_metadata_secret",
                    owner_chat_id="chat_metadata_secret",
                    name="Workspace " + secret,
                    description="Space " + secret,
                    operation_id="metadata_space",
                )
                entry = store.create_entry(
                    owner_chat_id="chat_metadata_secret",
                    space_id=space["space_id"],
                    path="/entry.md",
                    kind="file",
                    description="Entry " + secret,
                    mime_type="text/plain",
                    content=("body " + secret).encode("utf-8"),
                    expected_space_revision=1,
                    operation_id="metadata_entry",
                    created_by="creator",
                )
                updated = store.update_entry(
                    owner_chat_id="chat_metadata_secret",
                    space_id=space["space_id"],
                    entry_id=entry["entry_id"],
                    expected_revision=1,
                    expected_space_revision=2,
                    operation_id="metadata_update",
                    path="/updated.md",
                    description="Updated " + secret,
                    mime_type="text/markdown",
                    created_by="updater",
                )
                store.create_entry(
                    owner_chat_id="chat_metadata_secret",
                    space_id=space["space_id"],
                    path="/link",
                    kind="link",
                    description="Link " + secret,
                    link_url="https://example.test/resource",
                    expected_space_revision=updated["space_revision"],
                    operation_id="metadata_link",
                    created_by="linker",
                )
                candidate = store.create_candidate(
                    owner_chat_id="chat_metadata_secret",
                    session_id="session_metadata_secret",
                    attempt_id="attempt_metadata_secret",
                    source_agent_run_id="agent-run",
                    source_tool_call_id="tool-call",
                    target_space_id=space["space_id"],
                    target_path="/candidate",
                    kind="link",
                    description="Candidate " + secret,
                    mime_type="text/plain",
                    link_url="https://example.test/candidate",
                    rationale="Rationale " + secret,
                    sensitivity="normal",
                    operation_id="metadata_candidate",
                )
                store.decide_candidate(
                    owner_chat_id="chat_metadata_secret",
                    candidate_id=candidate["candidate_id"],
                    decision="reject",
                    expected_revision=1,
                    operation_id="metadata_candidate_decision",
                    decision_reason="Candidate decision " + secret,
                )
                store.enqueue_consolidation_job(
                    owner_chat_id="chat_metadata_secret",
                    session_id="session_metadata_secret",
                    attempt_id="attempt_metadata_secret",
                    job_type="memory-consolidation",
                    payload={"note": "Job payload " + secret},
                    operation_id="metadata_job",
                )
                promotion = store.propose_promotion(
                    owner_chat_id="chat_metadata_secret",
                    source_space_id=space["space_id"],
                    source_entry_id=entry["entry_id"],
                    source_entry_revision=2,
                    target_namespace="user-metadata",
                    target_path="/promotion.md",
                    operation_id="metadata_promotion",
                )
                store.decide_promotion(
                    owner_chat_id="chat_metadata_secret",
                    promotion_id=promotion["promotion_id"],
                    decision="reject",
                    expected_revision=1,
                    operation_id="metadata_promotion_decision",
                    decision_reason="Promotion decision " + secret,
                )

                with sqlite3.connect(store.db_path) as connection:
                    lexical_backend = connection.execute(
                        "SELECT value FROM meta WHERE key='lexical_backend'"
                    ).fetchone()[0]
                    if lexical_backend == "fts5":
                        self.assertEqual(
                            connection.execute(
                                "SELECT COUNT(*) FROM entry_fts WHERE entry_fts MATCH ?",
                                (secret,),
                            ).fetchone()[0],
                            0,
                        )
                for path in (Path(root) / "memory_v2").rglob("*"):
                    if not path.is_file():
                        continue
                    raw = path.read_bytes()
                    for encoded in encoded_variants:
                        with self.subTest(path=path.name, encoded=encoded[:16]):
                            self.assertNotIn(encoded.encode("utf-8"), raw)
            finally:
                store.close()

    def test_sensitive_public_mutation_identifiers_fail_closed_without_side_effects(self):
        exact_secret = "ExactProtocolSecret2026XYZ"
        heuristic_secret = "github_pat_abcdefghijklmnopqrstuvwxyz123456"
        self.assertTrue(register_secret_values((exact_secret,), source="provider"))
        scenarios = (
            "admission_cohort",
            "admission_hash_strategy",
            "bootstrap_hash",
            "bootstrap_role",
            "event_mime",
            "checkpoint_mime",
            "artifact_mime",
            "handoff_mime",
            "space_namespace",
            "space_scope_key",
            "entry_create_path",
            "entry_create_mime",
            "entry_create_link",
            "entry_create_created_by",
            "entry_create_source",
            "entry_update_path",
            "entry_update_mime",
            "entry_update_link",
            "entry_update_created_by",
            "entry_update_source",
            "candidate_agent",
            "candidate_tool",
            "candidate_path",
            "candidate_mime",
            "candidate_link",
            "candidate_sensitivity",
            "candidate_source",
            "job_type",
            "promotion_namespace",
            "promotion_path",
            "promotion_target_entry",
            "vector_backend",
            "vector_chunk",
            "vector_external",
            "job_claim_worker",
            "job_specific_worker",
            "job_transition_worker",
            "job_transition_token",
            "deletion_claim_worker",
            "deletion_complete_worker",
            "deletion_complete_token",
        )
        for secret_kind, secret in (
            ("exact", exact_secret),
            ("heuristic", heuristic_secret),
        ):
            for scenario in scenarios:
                with self.subTest(secret_kind=secret_kind, scenario=scenario):
                    with tempfile.TemporaryDirectory() as root:
                        store = MemoryV2Store(Path(root) / "memory_v2")
                        try:
                            callback = self._sensitive_identifier_mutation(
                                store,
                                scenario,
                                secret,
                            )
                            self._assert_sensitive_identifier_rejected(
                                store,
                                secret,
                                callback,
                            )
                        finally:
                            store.close()

    def test_sensitive_display_and_error_metadata_is_scrubbed_before_receipts(self):
        exact_secret = "DisplayMetadataSecret2026XYZ"
        heuristic_secret = "github_pat_zyxwvutsrqponmlkjihgfedcba654321"
        self.assertTrue(register_secret_values((exact_secret,), source="provider"))
        with tempfile.TemporaryDirectory() as root:
            store = MemoryV2Store(Path(root) / "memory_v2")
            hold = sqlite3.connect(store.db_path)
            try:
                hold.execute("BEGIN")
                hold.execute("SELECT COUNT(*) FROM meta").fetchone()
                admission = store.resolve_chat_admission(
                    owner_chat_id="chat_display_metadata",
                    session_id="session_display_metadata",
                    requested_rollout_mode="all",
                    effective_rollout_mode="all",
                    cohort="all_active",
                    target_mode="active",
                    decision_reason=f"decision {exact_secret} {heuristic_secret}",
                    canary_selected=False,
                    canary_percent=0,
                    canary_bucket=0,
                    hash_strategy="sha256_owner_v1",
                    provenance={"source": "display-metadata-audit"},
                    operation_id="display_metadata_admission",
                )
                store.mark_chat_bootstrap(
                    owner_chat_id="chat_display_metadata",
                    admission_id=admission["admission_id"],
                    expected_revision=admission["revision"],
                    succeeded=False,
                    provenance={"source": "display-metadata-audit"},
                    error_code=f"bootstrap {exact_secret} {heuristic_secret}",
                    operation_id="display_metadata_bootstrap",
                )
                job = store.enqueue_consolidation_job(
                    owner_chat_id="chat_display_metadata",
                    job_type="display-metadata-audit",
                    payload={"safe": "ordinary"},
                    operation_id="display_metadata_job",
                )
                claim = store.claim_specific_consolidation_job(
                    owner_chat_id="chat_display_metadata",
                    job_id=job["job_id"],
                    expected_revision=1,
                    worker_id="display-metadata-worker",
                    operation_id="display_metadata_claim",
                )["job"]
                store.fail_consolidation_job(
                    owner_chat_id="chat_display_metadata",
                    job_id=job["job_id"],
                    worker_id="display-metadata-worker",
                    lease_token=claim["lease_token"],
                    expected_revision=claim["revision"],
                    operation_id="display_metadata_fail",
                    error_code=f"failure {exact_secret} {heuristic_secret}",
                )
                for secret in (exact_secret, heuristic_secret):
                    self._assert_no_secret_trace(store, secret)
            finally:
                hold.rollback()
                hold.close()
                store.close()

    def test_registry_unavailable_fails_closed_for_store_metadata(self):
        with tempfile.TemporaryDirectory() as root:
            store = MemoryV2Store(Path(root) / "memory_v2")
            try:
                before = self._mutation_snapshot(store)
                with mock.patch.object(
                    sanitizer_module,
                    "redact_registered_text",
                    side_effect=RuntimeError("registry unavailable"),
                ):
                    with self.assertRaises(MemoryV2Error) as identifier_error:
                        store.resolve_chat_admission(
                            owner_chat_id="chat_registry_identifier",
                            session_id="session_registry_identifier",
                            requested_rollout_mode="all",
                            effective_rollout_mode="all",
                            cohort="all_active",
                            target_mode="active",
                            decision_reason="ordinary decision",
                            canary_selected=False,
                            canary_percent=0,
                            canary_bucket=0,
                            hash_strategy="sha256_owner_v1",
                            provenance={"source": "registry-audit"},
                            operation_id="registry_identifier",
                        )
                self.assertEqual(
                    identifier_error.exception.code,
                    "context_v2_sanitizer_failed",
                )
                self.assertEqual(self._mutation_snapshot(store), before)

                space = store.ensure_space(
                    scope_kind="chat",
                    scope_key="chat_registry_display",
                    owner_chat_id="chat_registry_display",
                    name="Registry display audit",
                    operation_id="registry_display_space",
                )
                candidate = store.create_candidate(
                    owner_chat_id="chat_registry_display",
                    target_space_id=space["space_id"],
                    target_path="/candidate.md",
                    kind="file",
                    description="ordinary candidate",
                    mime_type="text/plain",
                    content=b"ordinary candidate",
                    operation_id="registry_display_candidate",
                )
                before = self._mutation_snapshot(store)
                with mock.patch.object(
                    sanitizer_module,
                    "redact_registered_text",
                    side_effect=RuntimeError("registry unavailable"),
                ):
                    with self.assertRaises(MemoryV2Error) as display_error:
                        store.decide_candidate(
                            owner_chat_id="chat_registry_display",
                            candidate_id=candidate["candidate_id"],
                            decision="reject",
                            expected_revision=1,
                            operation_id="registry_display_decision",
                            decision_reason="ordinary reason",
                        )
                self.assertEqual(
                    display_error.exception.code,
                    "context_v2_sanitizer_failed",
                )
                self.assertEqual(self._mutation_snapshot(store), before)
            finally:
                store.close()

    def test_direct_event_projections_are_sanitized_before_atomic_write(self):
        context_secret = "ContextProjectionSecret2026XYZ"
        artifact_secret = "ArtifactProjectionSecret2026XYZ"
        self.assertTrue(
            register_secret_values(
                (context_secret, artifact_secret),
                source="provider",
            )
        )
        with tempfile.TemporaryDirectory() as root:
            store = MemoryV2Store(Path(root) / "memory_v2")
            hold = sqlite3.connect(store.db_path)
            try:
                hold.execute("BEGIN")
                hold.execute("SELECT COUNT(*) FROM meta").fetchone()
                context_receipt = store.append_semantic_event(
                    owner_chat_id="chat_projection_context",
                    session_id="session_projection_context",
                    attempt_id="attempt_projection_context",
                    operation_id="projection_context",
                    event={
                        "schema_version": "context.v2",
                        "event_id": "ctx_evt_projection_context",
                        "type": "context.build",
                        "payload": {"safe": "ordinary"},
                    },
                    projection=EventProjection(
                        kind="context_build",
                        context_json=json.dumps(
                            {"note": "context " + context_secret}
                        ),
                    ),
                )
                self.assertNotIn(context_secret, json.dumps(context_receipt))

                metadata_payload = sanitize_for_storage(
                    json.dumps({"safe": "ordinary"}).encode("utf-8"),
                    declared_mime="application/json",
                    trust=StorageTrust.SYSTEM,
                )
                content_payload = sanitize_for_storage(
                    b"ordinary artifact body",
                    declared_mime="text/plain",
                    trust=StorageTrust.JOURNAL,
                )
                metadata_staged = store.stage_object(metadata_payload)
                content_staged = store.stage_object(content_payload)
                artifact_receipt = store.append_semantic_event(
                    owner_chat_id="chat_projection_artifact",
                    session_id="session_projection_artifact",
                    attempt_id="attempt_projection_artifact",
                    operation_id="projection_artifact",
                    content_object_id=content_staged.object_id,
                    content_mime_type="text/plain",
                    staged_objects={
                        "metadata": metadata_staged,
                        "content": content_staged,
                    },
                    event={
                        "schema_version": "context.v2",
                        "event_id": "ctx_evt_projection_artifact",
                        "type": "artifact.recorded",
                        "payload": {"safe": "ordinary"},
                    },
                    projection=EventProjection(
                        kind="artifact",
                        artifact_id="ctx_artifact_projection",
                        metadata_json=json.dumps(
                            {"note": "artifact " + artifact_secret}
                        ),
                        metadata_object_id=metadata_staged.object_id,
                        object_id=content_staged.object_id,
                        mime_type="text/plain",
                        preview="preview " + artifact_secret,
                    ),
                )
                self.assertEqual(
                    artifact_receipt["artifact_ref"]["bytes"],
                    len(b"ordinary artifact body"),
                )
                self.assertEqual(
                    artifact_receipt["artifact_ref"]["media_type"],
                    "text/plain",
                )
                self.assertNotIn(artifact_secret, json.dumps(artifact_receipt))
                for secret in (context_secret, artifact_secret):
                    self._assert_no_secret_trace(store, secret)
            finally:
                hold.rollback()
                hold.close()
                store.close()

    def test_invalid_or_sensitive_direct_projection_fails_before_event_write(self):
        secret = "ProjectionIdentifierSecret2026XYZ"
        self.assertTrue(register_secret_values((secret,), source="provider"))
        with tempfile.TemporaryDirectory() as root:
            store = MemoryV2Store(Path(root) / "memory_v2")
            try:
                self._assert_sensitive_identifier_rejected(
                    store,
                    secret,
                    lambda: store.append_semantic_event(
                        owner_chat_id="chat_projection_identifier",
                        session_id="session_projection_identifier",
                        attempt_id="attempt_projection_identifier",
                        operation_id="projection_identifier",
                        event={
                            "schema_version": "context.v2",
                            "event_id": "ctx_evt_projection_identifier",
                            "type": "context.build",
                            "payload": {"safe": "ordinary"},
                        },
                        projection=EventProjection(
                            kind="context_build",
                            source_event_ids=(secret,),
                            context_json=json.dumps({"safe": "ordinary"}),
                        ),
                    ),
                )
                before = self._mutation_snapshot(store)
                with self.assertRaises(MemoryV2Error) as shape_error:
                    store.append_semantic_event(
                        owner_chat_id="chat_projection_shape",
                        session_id="session_projection_shape",
                        attempt_id="attempt_projection_shape",
                        operation_id="projection_shape",
                        event={
                            "schema_version": "context.v2",
                            "event_id": "ctx_evt_projection_shape",
                            "type": "context.build",
                            "payload": {"safe": "ordinary"},
                        },
                        projection=EventProjection(
                            kind="context_build",
                            context_json=json.dumps(["not", "an", "object"]),
                        ),
                    )
                self.assertEqual(
                    shape_error.exception.code,
                    "context_v2_sanitizer_invariant",
                )
                self.assertEqual(self._mutation_snapshot(store), before)

                metadata_staged = store.stage_object(
                    sanitize_for_storage(
                        json.dumps({"safe": "ordinary"}).encode("utf-8"),
                        declared_mime="application/json",
                        trust=StorageTrust.SYSTEM,
                    )
                )
                content_staged = store.stage_object(
                    sanitize_for_storage(
                        b"ordinary artifact",
                        declared_mime="text/plain",
                        trust=StorageTrust.JOURNAL,
                    )
                )

                def artifact_projection(metadata_json, mime_type, operation_id):
                    return store.append_semantic_event(
                        owner_chat_id="chat_projection_artifact_reject",
                        session_id="session_projection_artifact_reject",
                        attempt_id="attempt_projection_artifact_reject",
                        operation_id=operation_id,
                        content_object_id=content_staged.object_id,
                        content_mime_type="text/plain",
                        staged_objects={
                            "metadata": metadata_staged,
                            "content": content_staged,
                        },
                        event={
                            "schema_version": "context.v2",
                            "event_id": "ctx_evt_" + operation_id,
                            "type": "artifact.recorded",
                            "payload": {"safe": "ordinary"},
                        },
                        projection=EventProjection(
                            kind="artifact",
                            artifact_id="ctx_artifact_projection_reject",
                            metadata_json=metadata_json,
                            metadata_object_id=metadata_staged.object_id,
                            object_id=content_staged.object_id,
                            mime_type=mime_type,
                            preview="ordinary preview",
                        ),
                    )

                self._assert_sensitive_identifier_rejected(
                    store,
                    secret,
                    lambda: artifact_projection(
                        json.dumps({"safe": "ordinary"}),
                        "application/" + secret,
                        "projection_artifact_mime",
                    ),
                )
                before = self._mutation_snapshot(store)
                with self.assertRaises(MemoryV2Error) as artifact_shape_error:
                    artifact_projection(
                        json.dumps(["not", "an", "object"]),
                        "text/plain",
                        "projection_artifact_shape",
                    )
                self.assertEqual(
                    artifact_shape_error.exception.code,
                    "context_v2_sanitizer_invariant",
                )
                self.assertEqual(self._mutation_snapshot(store), before)
            finally:
                store.close()

    def test_sensitive_operation_id_is_known_block_pending_high_risk_review(self):
        secret = "OperationIdentifierSecret2026XYZ"
        self.assertTrue(register_secret_values((secret,), source="provider"))
        with tempfile.TemporaryDirectory() as root:
            store = MemoryV2Store(Path(root) / "memory_v2")
            try:
                self._assert_sensitive_identifier_rejected(
                    store,
                    secret,
                    lambda: store.ensure_space(
                        scope_kind="chat",
                        scope_key="chat_operation_identifier",
                        owner_chat_id="chat_operation_identifier",
                        name="Operation identifier audit",
                        operation_id=secret,
                    ),
                )
                vault_handle = "pvh1_" + "b" * 64
                self._assert_sensitive_identifier_rejected(
                    store,
                    vault_handle,
                    lambda: store.ensure_space(
                        scope_kind="chat",
                        scope_key="chat_operation_handle",
                        owner_chat_id="chat_operation_handle",
                        name="Operation handle audit",
                        operation_id=vault_handle,
                    ),
                )
            finally:
                store.close()

    def test_production_operation_id_shapes_remain_compatible_with_secret_gate(self):
        digest = "a" * 64
        operation_ids = (
            f"ctxdel_{digest}",
            f"vaultdel_{digest}",
            f"memory_v2_deletion:claim:{digest}",
            f"memory_v2_deletion:complete:{digest}",
            f"memory_v2_deletion:logical-cascade:{digest}",
            f"admission:{digest}",
        )
        with tempfile.TemporaryDirectory() as root:
            store = MemoryV2Store(Path(root) / "memory_v2")
            try:
                self.assertEqual(
                    [store._operation_id(value) for value in operation_ids],
                    list(operation_ids),
                )
            finally:
                store.close()

    def test_vault_tainted_artifact_persists_nonindexable_and_masks_handle(self):
        handle = "pvh1_" + "c" * 64
        with tempfile.TemporaryDirectory() as root:
            store = MemoryV2Store(Path(root) / "memory_v2")
            try:
                receipt = store.record_artifact(
                    owner_chat_id="chat_vault_taint",
                    session_id="session_vault_taint",
                    attempt_id="attempt_vault_taint",
                    operation_id="vault_tainted_artifact",
                    artifact={"kind": "tool_result", "handle": handle},
                    content=json.dumps({"stdout": handle, "body": "x" * 512}).encode(),
                    mime_type="application/json",
                    storage_trust=StorageTrust.VAULT_TAINTED,
                )
                with sqlite3.connect(store.db_path) as connection:
                    row = connection.execute(
                        "SELECT objects.indexable, objects.trust FROM artifacts "
                        "JOIN objects ON objects.object_id=artifacts.object_id "
                        "WHERE artifacts.artifact_id=?",
                        (receipt["artifact_id"],),
                    ).fetchone()
                self.assertEqual(row, (0, "vault_tainted"))
                self.assertLessEqual(len(receipt["artifact_ref"]["preview"]), 256)
                page = store.load_events(owner_chat_id="chat_vault_taint")
                self.assertNotIn(handle, json.dumps(page, sort_keys=True))
            finally:
                store.close()



if __name__ == "__main__":
    unittest.main()
