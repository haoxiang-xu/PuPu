import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import durable_interaction_host as host  # noqa: E402


class DurableInteractionHostTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        env_patcher = mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": self.temp_dir.name},
            clear=False,
        )
        env_patcher.start()
        self.addCleanup(env_patcher.stop)

    def _seed_request(
        self,
        *,
        session_id: str = "chat-1",
        kind: str = "tool_approval",
        payload: dict | None = None,
    ):
        from unchain.interaction.durable import (
            INTERACTION_JOURNAL_KEY,
            build_interaction_request,
            new_interaction_journal,
            register_interaction_request,
        )
        from unchain.interaction.runtime import response_contract_for_kind

        request_payload = payload or {
            "type": "tool_confirmation_request",
            "tool_name": "write",
            "call_id": "call-1",
            "arguments": {"path": "notes.txt"},
            "description": "Write notes.txt",
        }
        request = build_interaction_request(
            session_id=session_id,
            kind=kind,
            source_run_id="run-1",
            occurrence=f"{kind}:1",
            payload=request_payload,
            response_contract=response_contract_for_kind(kind),
            created_revision=0,
            subject={"provider": "openai", "model": "gpt-5"},
        )
        journal = register_interaction_request(
            new_interaction_journal(),
            request,
            checkpoint_id="checkpoint-1",
        )
        store = host._session_store()
        store.save(session_id, {INTERACTION_JOURNAL_KEY: journal})
        host.save_resume_context(
            session_id=session_id,
            run_id="run-1",
            options={
                "modelId": "openai:gpt-5",
                "memory_enabled": True,
                "openai_api_key": "must-not-persist",
                "maxTokens": 512,
            },
            provider="openai",
            model="gpt-5",
        )
        return request

    def test_pending_lookup_returns_real_interaction_id_without_secrets(self) -> None:
        request = self._seed_request()

        result = host.get_pending_interaction("chat-1")

        self.assertEqual(result["status"], "awaiting_response")
        self.assertEqual(result["interaction_id"], request.interaction_id)
        self.assertEqual(result["source_run_id"], "run-1")
        self.assertEqual(
            result["presentation"]["tool_call"]["confirmation_id"],
            request.interaction_id,
        )
        self.assertEqual(result["resume_options"]["maxTokens"], 512)
        self.assertNotIn("openai_api_key", result["resume_options"])

    def test_pending_context_is_bound_to_request_source_run_id(self) -> None:
        self._seed_request()
        host.save_resume_context(
            session_id="chat-1",
            run_id="run-2",
            options={
                "modelId": "anthropic:claude-sonnet-4",
                "toolkits": ["wrong-toolkit"],
            },
            provider="anthropic",
            model="claude-sonnet-4",
        )

        pending = host.get_pending_interaction("chat-1")

        self.assertEqual(pending["source_run_id"], "run-1")
        self.assertEqual(pending["resume_options"]["modelId"], "openai:gpt-5")
        self.assertNotIn("wrong-toolkit", pending["resume_options"].get("toolkits", []))

    def test_resume_context_uses_stable_allowlist_and_exact_secret_overlay(self) -> None:
        host.save_resume_context(
            session_id="chat-1",
            run_id="run-secret-test",
            options={
                "modelId": "openai:gpt-5",
                "toolkits": ["core"],
                "github_token": "must-not-persist",
                "aws_secret_access_key": "must-not-persist",
                "database_url": "postgres://user:password@example/db",
                "headers": {"Cookie": "session=must-not-persist"},
                "openai_api_key": "must-not-persist",
            },
            provider="openai",
            model="gpt-5",
        )

        persisted = host.load_resume_context("chat-1", "run-secret-test")
        self.assertEqual(
            persisted["options"],
            {"modelId": "openai:gpt-5", "toolkits": ["core"]},
        )

        resolved = host.resolve_resume_options(
            session_id="chat-1",
            run_id="run-secret-test",
            fresh_options={
                "openai_api_key": "fresh-openai-key",
                "github_token": "must-not-overlay",
                "modelId": "anthropic:must-not-override",
            },
            expected_provider="openai",
            expected_model="gpt-5",
        )
        self.assertEqual(resolved["openai_api_key"], "fresh-openai-key")
        self.assertEqual(resolved["modelId"], "openai:gpt-5")
        self.assertNotIn("github_token", resolved)

    def test_corrupt_context_keeps_pending_request_discoverable(self) -> None:
        self._seed_request()
        context_path = host._context_path("chat-1", "run-1")
        context_path.write_text("{not-json", encoding="utf-8")

        pending = host.get_pending_interaction("chat-1")

        self.assertEqual(pending["status"], "awaiting_response")
        self.assertFalse(pending["resume_available"])
        self.assertEqual(
            pending["resume_unavailable_reason"],
            "durable_resume_context_corrupt",
        )

    def test_context_cleanup_is_best_effort(self) -> None:
        self._seed_request()
        with mock.patch.object(Path, "unlink", side_effect=PermissionError("denied")):
            cleared = host.clear_resume_context("chat-1", "run-1")
        self.assertFalse(cleared)

    def test_temp_cleanup_does_not_mask_context_write_failure(self) -> None:
        with mock.patch.object(
            host.os,
            "open",
            side_effect=PermissionError("write denied"),
        ), mock.patch.object(
            Path,
            "unlink",
            side_effect=PermissionError("cleanup denied"),
        ):
            with self.assertRaisesRegex(PermissionError, "write denied"):
                host.save_resume_context(
                    session_id="chat-1",
                    run_id="run-write-failure",
                    options={"modelId": "openai:gpt-5"},
                    provider="openai",
                    model="gpt-5",
                )

    def test_receipt_submission_is_idempotent_and_conflicts_fail_closed(self) -> None:
        request = self._seed_request()

        first = host.record_interaction_receipt(
            session_id="chat-1",
            interaction_id=request.interaction_id,
            approved=True,
            reason="approved",
        )
        retry = host.record_interaction_receipt(
            session_id="chat-1",
            interaction_id=request.interaction_id,
            approved=True,
            reason="approved",
        )

        self.assertEqual(first["receipt_id"], retry["receipt_id"])
        pending = host.get_pending_interaction("chat-1")
        self.assertEqual(pending["status"], "receipt_recorded")
        self.assertEqual(pending["resolution"]["outcome"], "approved")

        with self.assertRaises(host.DurableInteractionHostError) as raised:
            host.record_interaction_receipt(
                session_id="chat-1",
                interaction_id=request.interaction_id,
                approved=False,
                reason="changed",
            )
        self.assertEqual(raised.exception.code, "interaction_receipt_conflict")
        self.assertEqual(raised.exception.status_code, 409)

    def test_concurrent_conflicting_receipts_are_both_json_safe_conflicts(self) -> None:
        request = self._seed_request()
        barrier = threading.Barrier(2)
        outcomes: list[object] = []

        def submit(approved: bool) -> None:
            barrier.wait()
            try:
                outcomes.append(
                    host.record_interaction_receipt(
                        session_id="chat-1",
                        interaction_id=request.interaction_id,
                        approved=approved,
                    )
                )
            except Exception as exc:  # noqa: BLE001 - asserted below
                outcomes.append(exc)

        workers = [
            threading.Thread(target=submit, args=(approved,))
            for approved in (True, False)
        ]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=2)

        errors = [item for item in outcomes if isinstance(item, Exception)]
        successes = [item for item in outcomes if isinstance(item, dict)]
        self.assertEqual(len(successes), 1)
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], host.DurableInteractionHostError)
        self.assertEqual(errors[0].code, "interaction_receipt_conflict")
        self.assertEqual(errors[0].status_code, 409)

    def test_active_execution_lease_is_exposed_as_retryable_host_error(self) -> None:
        request = self._seed_request()
        store = host._session_store()
        lease = store.acquire_lease("chat-1", "worker-1", 60_000)
        self.addCleanup(
            store.release_lease,
            lease.execution_id,
            lease.owner_id,
            lease.fencing_token,
        )

        with self.assertRaises(host.DurableInteractionHostError) as raised:
            host.record_interaction_receipt(
                session_id="chat-1",
                interaction_id=request.interaction_id,
                approved=True,
            )

        self.assertEqual(raised.exception.code, "active_execution_lease")
        self.assertEqual(raised.exception.status_code, 409)
        self.assertTrue(raised.exception.retryable)

    def test_tracker_requires_exact_ids_for_tool_and_human_interactions(self) -> None:
        tracker = host.DurableInteractionIdTracker()
        tracker.observe(
            {
                "interaction_request": {
                    "interaction_id": "interaction-1",
                    "kind": "tool_approval",
                    "payload": {"call_id": "call-1"},
                }
            }
        )

        self.assertEqual(
            tracker.resolve("tool_approval", "call-1"),
            "interaction-1",
        )
        self.assertEqual(tracker.resolve("tool_approval", "call-2"), "")
        self.assertEqual(tracker.resolve("tool_approval"), "")
        self.assertEqual(
            tracker.resolve("tool_approval", allow_latest=True),
            "interaction-1",
        )

    def test_human_input_legacy_payload_is_normalized_for_durable_receipt(self) -> None:
        request = self._seed_request(
            kind="human_input",
            payload={
                "request_id": "ask-1",
                "kind": "selector",
                "title": "Choose",
                "question": "Which option?",
                "selection_mode": "single",
                "options": [
                    {"label": "A", "value": "a", "description": ""},
                ],
                "allow_other": False,
                "other_label": "Other",
                "other_placeholder": "",
                "min_selected": 1,
                "max_selected": 1,
            },
        )

        host.record_interaction_receipt(
            session_id="chat-1",
            interaction_id=request.interaction_id,
            approved=True,
            modified_arguments={"user_response": {"value": "a"}},
        )

        pending = host.get_pending_interaction("chat-1")
        self.assertEqual(
            pending["resolution"]["response"],
            {
                "request_id": "ask-1",
                "selected_values": ["a"],
                "other_text": None,
            },
        )

    def test_no_active_interaction_is_a_normal_none_response(self) -> None:
        result = host.get_pending_interaction("empty-chat")
        self.assertEqual(
            result,
            {"status": "none", "session_id": "empty-chat"},
        )


if __name__ == "__main__":
    unittest.main()
