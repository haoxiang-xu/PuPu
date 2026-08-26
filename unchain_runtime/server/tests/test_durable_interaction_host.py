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

    def _seed_cancellable_request(
        self,
        *,
        session_id: str = "chat-cancel",
        attempt_id: str = "attempt-cancel",
        execution_fence=None,
    ):
        from unchain.interaction.durable import (
            INTERACTION_KIND_TOOL_APPROVAL,
            build_interaction_request,
        )
        from unchain.interaction.runtime import response_contract_for_kind
        from unchain.kernel import RunState
        from unchain.memory import KernelMemoryRuntime
        from unchain.memory.checkpoint_state import build_execution_checkpoint

        memory = KernelMemoryRuntime.from_config(store=host._session_store())
        state = RunState()
        state.seed_messages([{"role": "user", "content": "cancel me"}])
        state.session_state.session_id = session_id
        state.provider_state.provider = "openai"
        state.provider_state.model = "gpt-5"
        state.memory_state["session_revision"] = 0
        state.iteration = 1
        state.last_continuation = {
            "type": "durable_interaction",
            "occurrence": "cancel-call",
        }
        request = build_interaction_request(
            session_id=session_id,
            kind=INTERACTION_KIND_TOOL_APPROVAL,
            source_run_id=attempt_id,
            occurrence="cancel-call",
            payload={"tool_name": "write_file", "call_id": "cancel-call"},
            response_contract=response_contract_for_kind(
                INTERACTION_KIND_TOOL_APPROVAL
            ),
            created_revision=0,
            subject={"provider": "openai", "model": "gpt-5"},
        )
        state.suspend_state.payload = {"interaction_request": request.to_dict()}
        checkpoint = build_execution_checkpoint(
            state,
            status="awaiting_interaction",
            run_id=attempt_id,
        )
        memory.save_execution_checkpoint_snapshot(
            session_id,
            checkpoint,
            interaction_request=request.to_dict(),
            expected_revision=0,
            execution_fence=execution_fence,
        )
        host.save_resume_context(
            session_id=session_id,
            run_id=attempt_id,
            options={"modelId": "openai:gpt-5", "memory_enabled": True},
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
        self.assertEqual(result["active_attempt_id"], "run-1")
        self.assertEqual(
            result["presentation"]["tool_call"]["confirmation_id"],
            request.interaction_id,
        )
        self.assertEqual(result["resume_options"]["maxTokens"], 512)
        self.assertNotIn("openai_api_key", result["resume_options"])

    def test_production_computer_request_recovers_canonical_toolkit_identity(self) -> None:
        from unchain.tools.models import ToolConfirmationRequest

        request = self._seed_request(
            payload=ToolConfirmationRequest(
                tool_name="computer",
                call_id="call-computer",
                arguments={"action": "left_click", "coordinate": [12, 34]},
                description="Click at (12, 34)",
            ).to_dict()
        )

        result = host.get_pending_interaction("chat-1")

        self.assertEqual(result["interaction_id"], request.interaction_id)
        self.assertEqual(
            result["presentation"]["tool_call"]["toolkit_id"],
            "builtin.computer",
        )
        self.assertEqual(
            result["presentation"]["tool_call"]["toolkit_name"],
            "Computer",
        )

    def test_session_store_rehydrates_sanitized_checkpoint_before_validation(self) -> None:
        from unchain.kernel import RunState
        from unchain.memory.checkpoint_state import (
            build_execution_checkpoint,
            validate_execution_checkpoint,
        )

        session_id = "chat-computer-checkpoint"
        screenshot_b64 = "UE5HREFUQQ=="
        state = RunState()
        state.seed_messages(
            [
                {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": "toolu-screenshot",
                            "name": "computer",
                            "input": {"action": "screenshot"},
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "toolu-screenshot",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/png",
                                        "data": screenshot_b64,
                                    },
                                }
                            ],
                        }
                    ],
                },
            ]
        )
        state.session_state.session_id = session_id
        state.provider_state.provider = "anthropic"
        state.provider_state.model = "claude-opus-4-7"
        state.iteration = 1
        checkpoint = build_execution_checkpoint(
            state,
            status="max_iterations",
            run_id="run-computer-checkpoint",
        )

        with mock.patch.dict(
            os.environ,
            {
                "PUPU_FEATURE_COMPUTER_USE": "1",
                "PUPU_COMPUTER_USE": "1",
            },
        ):
            store = host._session_store()
        store.save(session_id, {"execution_checkpoint": checkpoint})

        persisted = Path(store._path(session_id)).read_text(encoding="utf-8")
        self.assertNotIn(screenshot_b64, persisted)
        self.assertIn("data_omitted", persisted)

        loaded = store.load(session_id)
        validate_execution_checkpoint(loaded["execution_checkpoint"])
        self.assertIn(screenshot_b64, str(loaded["execution_checkpoint"]))

    def test_session_store_maps_unchain_import_failure_to_503(self) -> None:
        with mock.patch(
            "memory_factory._build_session_store",
            side_effect=ImportError("JsonFileSessionStore unavailable"),
        ), self.assertRaises(host.DurableInteractionHostError) as raised:
            host._session_store()

        self.assertEqual(raised.exception.code, "durable_runtime_unavailable")
        self.assertEqual(raised.exception.status_code, 503)

    def test_pending_lookup_repairs_cancelled_orphaned_interaction(self) -> None:
        session_id = "chat-orphan-repair"
        attempt_id = "run-orphan-repair"
        request = self._seed_cancellable_request(
            session_id=session_id,
            attempt_id=attempt_id,
        )
        store = host._session_store()
        guard = host._execution_runtime().acquire(session_id, attempt_id)
        snapshot = store.load_with_revision(session_id)
        state = snapshot.state
        checkpoint = state.pop("execution_checkpoint")
        state["execution_checkpoint_domain"] = {
            "schema_version": 1,
            "checkpoint_id": checkpoint["checkpoint_id"],
            "execution_id": session_id,
            "owner_id": attempt_id,
            "fencing_token": guard.fence.fencing_token,
        }
        store.save_if_revision_and_fence(
            session_id,
            state,
            snapshot.revision,
            execution_id=session_id,
            owner_id=attempt_id,
            fencing_token=guard.fence.fencing_token,
        )
        cancellation = host._ensure_execution_tombstone(
            session_id,
            attempt_id,
            reason="user_stop",
        )
        self.assertEqual(cancellation.fencing_token, guard.fence.fencing_token)

        result = host.get_pending_interaction(session_id)
        persisted = store.load_with_revision(session_id)

        self.assertEqual(result, {"status": "none", "session_id": session_id})
        self.assertNotIn("execution_checkpoint_domain", persisted.state)
        journal = persisted.state["interaction_journal"]
        self.assertIsNone(journal["active_id"])
        entry = journal["entries"][request.interaction_id]
        self.assertTrue(entry["receipt"]["response"]["cancelled"])
        self.assertIsNotNone(entry["application"])

    def test_memory_replacement_prepare_rejects_unmatched_attempt_without_cancel(self) -> None:
        session_id = "chat-replace-mismatch"
        attempt_id = "run-current"
        self._seed_cancellable_request(
            session_id=session_id,
            attempt_id=attempt_id,
        )
        store = host._session_store()
        before = store.load_with_revision(session_id)

        with mock.patch.object(host, "_execution_control_cancel") as cancel, \
            mock.patch.object(host, "_ensure_execution_tombstone") as tombstone, \
            self.assertRaises(host.DurableInteractionHostError) as raised:
            host.prepare_session_memory_replacement(
                session_id,
                expected_cancel_attempt_id="run-stale",
            )
        after = store.load_with_revision(session_id)

        self.assertEqual(raised.exception.code, "session_memory_replace_conflict")
        self.assertEqual(after.revision, before.revision)
        self.assertEqual(after.state, before.state)
        cancel.assert_not_called()
        tombstone.assert_not_called()

    def test_memory_replacement_prepare_requires_explicit_attempt_for_active_run(self) -> None:
        session_id = "chat-replace-no-attempt"
        self._seed_cancellable_request(
            session_id=session_id,
            attempt_id="run-current",
        )

        with mock.patch.object(host, "_execution_control_cancel") as cancel, \
            mock.patch.object(host, "_ensure_execution_tombstone") as tombstone, \
            self.assertRaises(host.DurableInteractionHostError) as raised:
            host.prepare_session_memory_replacement(
                session_id,
                expected_cancel_attempt_id="",
            )

        self.assertEqual(raised.exception.code, "session_memory_replace_conflict")
        cancel.assert_not_called()
        tombstone.assert_not_called()

    def test_memory_replacement_prepare_cancels_only_exact_attempt(self) -> None:
        session_id = "chat-replace-exact"
        attempt_id = "run-exact"
        self._seed_cancellable_request(
            session_id=session_id,
            attempt_id=attempt_id,
        )

        result = host.prepare_session_memory_replacement(
            session_id,
            expected_cancel_attempt_id=attempt_id,
        )
        persisted = host._session_store().load_with_revision(session_id)

        self.assertTrue(result["execution_checkpoint_cleared"])
        self.assertNotIn("execution_checkpoint", persisted.state)
        self.assertNotIn("execution_checkpoint_domain", persisted.state)
        self.assertIsNone(persisted.state["interaction_journal"]["active_id"])
        self.assertIsNotNone(
            host._execution_runtime().load_cancellation(session_id, attempt_id)
        )

    def test_pending_lookup_does_not_repair_uncancelled_orphan(self) -> None:
        session_id = "chat-orphan-active"
        attempt_id = "run-orphan-active"
        request = self._seed_cancellable_request(
            session_id=session_id,
            attempt_id=attempt_id,
        )
        store = host._session_store()
        snapshot = store.load_with_revision(session_id)
        state = snapshot.state
        checkpoint = state.pop("execution_checkpoint")
        state["execution_checkpoint_domain"] = {
            "schema_version": 1,
            "checkpoint_id": checkpoint["checkpoint_id"],
            "execution_id": session_id,
            "owner_id": attempt_id,
            "fencing_token": 1,
        }
        store.save_if_revision(session_id, state, snapshot.revision)

        with self.assertRaises(host.DurableInteractionHostError) as raised:
            host.get_pending_interaction(session_id)

        self.assertEqual(
            raised.exception.code,
            "orphaned_interaction_recovery_required",
        )
        persisted = store.load(session_id)
        self.assertEqual(
            persisted["interaction_journal"]["active_id"],
            request.interaction_id,
        )
        self.assertIn("execution_checkpoint_domain", persisted)

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

    def test_receipt_guard_failure_is_reconciled_from_durable_state(self) -> None:
        import session_execution_guard

        request = self._seed_request(session_id="chat-receipt-reconcile")
        original_guard_call = host._session_execution_guard_call
        bind_failed = False

        def fail_first_bind(name: str, **kwargs):
            nonlocal bind_failed
            if name == "bind_session_guard_receipt" and not bind_failed:
                bind_failed = True
                raise host.DurableInteractionHostError(
                    "injected_post_receipt_guard_failure",
                    "receipt committed before the injected guard failure",
                    status_code=503,
                    retryable=True,
                )
            return original_guard_call(name, **kwargs)

        with mock.patch.object(
            host,
            "_session_execution_guard_call",
            side_effect=fail_first_bind,
        ), self.assertRaises(host.DurableInteractionHostError) as raised:
            host.record_interaction_receipt(
                session_id="chat-receipt-reconcile",
                interaction_id=request.interaction_id,
                approved=True,
                reason="approved",
            )

        self.assertEqual(
            raised.exception.code,
            "injected_post_receipt_guard_failure",
        )
        persisted = host._interaction_runtime().load(
            "chat-receipt-reconcile",
            interaction_id=request.interaction_id,
            require_active=False,
        )
        self.assertIsNotNone(persisted.receipt)
        restarted_registry = session_execution_guard.SessionExecutionGuardRegistry(
            data_dir=self.temp_dir.name,
            process_owner_id="restarted-process-owner",
        )

        with mock.patch.object(
            session_execution_guard,
            "_DEFAULT_REGISTRY",
            restarted_registry,
        ):
            pending = host.get_pending_interaction("chat-receipt-reconcile")
            guard = restarted_registry.snapshot("chat-receipt-reconcile")

        self.assertEqual(pending["status"], "receipt_recorded")
        self.assertEqual(
            pending["receipt_id"],
            persisted.receipt.receipt_id,
        )
        self.assertIsNotNone(guard)
        self.assertEqual(guard.state, "parked")
        self.assertEqual(guard.interaction_id, request.interaction_id)
        self.assertEqual(guard.interaction_source_attempt_id, "run-1")
        self.assertEqual(guard.receipt_id, persisted.receipt.receipt_id)

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

    def test_tracker_preserves_child_interaction_ownership(self) -> None:
        tracker = host.DurableInteractionIdTracker()
        tracker.observe(
            {
                "type": "interaction_requested",
                "run_id": "child-run-1",
                "interaction_request": {
                    "interaction_id": "interaction-child-1",
                    "session_id": "chat-1:developer.worker.1",
                    "source_run_id": "child-run-1",
                    "kind": "tool_approval",
                    "payload": {"call_id": "shared-call"},
                },
            }
        )

        self.assertEqual(
            tracker.resolve_owner("tool_approval", "shared-call"),
            {
                "interaction_id": "interaction-child-1",
                "session_id": "chat-1:developer.worker.1",
                "source_run_id": "child-run-1",
                "event_run_id": "child-run-1",
            },
        )

    def test_tracker_preserves_latest_interaction_without_call_id(self) -> None:
        tracker = host.DurableInteractionIdTracker()
        tracker.observe(
            {
                "type": "interaction_requested",
                "run_id": "root-run",
                "interaction_request": {
                    "interaction_id": "interaction-max-budget",
                    "session_id": "chat-root",
                    "source_run_id": "root-run",
                    "kind": "max_budget",
                    "payload": {
                        "effective_max": 6,
                        "suggested_extra_iterations": 6,
                    },
                },
            }
        )

        self.assertEqual(
            tracker.resolve("max_budget", allow_latest=True),
            "interaction-max-budget",
        )
        self.assertEqual(
            tracker.resolve_owner("max_budget", allow_latest=True),
            {
                "interaction_id": "interaction-max-budget",
                "session_id": "chat-root",
                "source_run_id": "root-run",
                "event_run_id": "root-run",
            },
        )

    def test_tracker_isolates_same_call_id_by_observer_thread(self) -> None:
        tracker = host.DurableInteractionIdTracker()
        barrier = threading.Barrier(3)
        resolved: dict[int, dict[str, str]] = {}

        def observe_and_resolve(worker_index: int) -> None:
            tracker.observe(
                {
                    "type": "interaction_requested",
                    "run_id": f"child-run-{worker_index}",
                    "interaction_request": {
                        "interaction_id": f"interaction-{worker_index}",
                        "session_id": f"chat-1:worker-{worker_index}",
                        "source_run_id": f"child-run-{worker_index}",
                        "kind": "tool_approval",
                        "payload": {"call_id": "shared-call"},
                    },
                }
            )
            barrier.wait(timeout=2)
            resolved[worker_index] = tracker.resolve_owner(
                "tool_approval",
                "shared-call",
            )

        workers = [
            threading.Thread(
                target=observe_and_resolve,
                args=(worker_index,),
                daemon=True,
            )
            for worker_index in range(3)
        ]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=2)
            self.assertFalse(worker.is_alive())

        self.assertEqual(
            {
                worker_index: owner.get("interaction_id")
                for worker_index, owner in resolved.items()
            },
            {
                0: "interaction-0",
                1: "interaction-1",
                2: "interaction-2",
            },
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

        result = host.record_interaction_receipt(
            session_id="chat-1",
            interaction_id=request.interaction_id,
            approved=True,
            modified_arguments={"user_response": {"value": "a"}},
        )

        self.assertNotIn("response", result)
        self.assertNotIn("submitted_by", result)
        handoff = host.interaction_receipt_handoff(result)
        self.assertIsInstance(
            handoff,
            host.DurableInteractionReceiptHandoff,
        )
        self.assertEqual(handoff.interaction_id, request.interaction_id)
        self.assertEqual(
            handoff.response,
            {
                "request_id": "ask-1",
                "selected_values": ["a"],
                "other_text": None,
            },
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

    def test_cancel_pending_accepts_forward_compatible_var_keyword_runtime(self) -> None:
        calls = []

        class ForwardCompatibleRuntime:
            def cancel_pending(self, session_id: str, **kwargs):
                calls.append((session_id, kwargs))
                return object()

        with mock.patch.object(
            host,
            "_interaction_runtime",
            return_value=ForwardCompatibleRuntime(),
        ):
            cancelled = host._cancel_pending_source_attempt(
                "chat-cancel",
                "attempt-cancel",
                reason="user_stop",
            )

        self.assertTrue(cancelled)
        self.assertEqual(
            calls,
            [
                (
                    "chat-cancel",
                    {
                        "source_run_id": "attempt-cancel",
                        "reason": "user_stop",
                    },
                )
            ],
        )

    def test_cancel_pending_prefers_explicit_legacy_attempt_over_var_keyword(
        self,
    ) -> None:
        calls = []

        class LegacyRuntime:
            def cancel_pending(self, session_id: str, attempt_id: str, **kwargs):
                calls.append((session_id, attempt_id, kwargs))
                return object()

        with mock.patch.object(
            host,
            "_interaction_runtime",
            return_value=LegacyRuntime(),
        ):
            cancelled = host._cancel_pending_source_attempt(
                "chat-cancel",
                "attempt-cancel",
                reason="user_stop",
            )

        self.assertTrue(cancelled)
        self.assertEqual(
            calls,
            [
                (
                    "chat-cancel",
                    "attempt-cancel",
                    {"reason": "user_stop"},
                )
            ],
        )

    def test_cancel_execution_is_idempotent_and_terminalizes_pending(self) -> None:
        request = self._seed_cancellable_request()

        first = host.cancel_chat_execution(
            session_id="chat-cancel",
            attempt_id="attempt-cancel",
            expected_interaction_id=request.interaction_id,
            reason="user_stop",
        )
        retry = host.cancel_chat_execution(
            session_id="chat-cancel",
            attempt_id="attempt-cancel",
            expected_interaction_id=request.interaction_id,
            reason="user_stop",
        )

        self.assertEqual(first["status"], "ok")
        self.assertEqual(first["state"], "cancelled")
        self.assertTrue(first["durable_interaction_cancelled"])
        self.assertEqual(retry["state"], "cancelled")
        self.assertEqual(retry["disposition"], "unchanged")
        self.assertTrue(retry["durable_interaction_cancelled"])
        self.assertEqual(
            host.get_pending_interaction("chat-cancel"),
            {"status": "none", "session_id": "chat-cancel"},
        )

        with self.assertRaises(host.DurableInteractionHostError) as raised:
            host.record_interaction_receipt(
                session_id="chat-cancel",
                interaction_id=request.interaction_id,
                approved=True,
            )
        self.assertEqual(raised.exception.code, "execution_cancelled")

    def test_cancelled_terminal_guard_is_reconciled_after_process_restart(
        self,
    ) -> None:
        import session_execution_guard

        request = self._seed_cancellable_request(
            session_id="chat-cancel-guard-restart",
            attempt_id="attempt-cancel-guard-restart",
        )
        pending = host.get_pending_interaction("chat-cancel-guard-restart")
        self.assertEqual(pending["interaction_id"], request.interaction_id)

        with mock.patch.object(
            host,
            "_consume_cancelled_session_guard",
            side_effect=host.DurableInteractionHostError(
                "injected_cancel_guard_crash",
                "process stopped after durable cancellation",
                status_code=503,
                retryable=True,
            ),
        ), self.assertRaises(host.DurableInteractionHostError) as raised:
            host.cancel_chat_execution(
                session_id="chat-cancel-guard-restart",
                attempt_id="attempt-cancel-guard-restart",
                expected_interaction_id=request.interaction_id,
                reason="user_stop",
            )
        self.assertEqual(raised.exception.code, "injected_cancel_guard_crash")

        restarted_registry = session_execution_guard.SessionExecutionGuardRegistry(
            data_dir=self.temp_dir.name,
            process_owner_id="cancel-restart-owner",
        )
        self.assertEqual(
            restarted_registry.snapshot("chat-cancel-guard-restart").state,
            "parked",
        )
        with mock.patch.object(
            session_execution_guard,
            "_DEFAULT_REGISTRY",
            restarted_registry,
        ):
            result = host.get_pending_interaction(
                "chat-cancel-guard-restart"
            )
            guard_snapshot = restarted_registry.snapshot(
                "chat-cancel-guard-restart"
            )

        self.assertEqual(
            result,
            {"status": "none", "session_id": "chat-cancel-guard-restart"},
        )
        self.assertIsNone(guard_snapshot)

    def test_cancel_old_attempt_does_not_consume_newer_pending_interaction(self) -> None:
        request = self._seed_cancellable_request(
            session_id="chat-newer",
            attempt_id="attempt-new",
        )

        with self.assertRaises(host.DurableInteractionHostError) as raised:
            host.cancel_chat_execution(
                session_id="chat-newer",
                attempt_id="attempt-old",
                reason="late_stop",
            )

        self.assertEqual(
            raised.exception.code,
            "interaction_cancel_target_required",
        )
        pending = host.get_pending_interaction("chat-newer")
        self.assertEqual(pending["status"], "awaiting_response")
        self.assertEqual(pending["interaction_id"], request.interaction_id)

    def test_completed_execution_wins_and_does_not_create_cancel_tombstone(self) -> None:
        import execution_control

        execution_control.register("chat-completed", "attempt-completed")
        execution_control.mark_running("chat-completed", "attempt-completed")
        execution_control.mark_completed("chat-completed", "attempt-completed")

        result = host.cancel_chat_execution(
            session_id="chat-completed",
            attempt_id="attempt-completed",
        )

        self.assertEqual(result["state"], "completed")
        self.assertEqual(result["disposition"], "already_terminal")
        self.assertIsNone(result["cancellation"])
        self.assertIsNone(
            host._execution_runtime().load_cancellation(
                "chat-completed",
                "attempt-completed",
            )
        )

    def test_unchain_owned_off_cancel_does_not_initialize_context_store(self) -> None:
        import execution_control

        execution_control.register("chat-off-cancel", "attempt-off-cancel")
        execution_control.mark_running(
            "chat-off-cancel",
            "attempt-off-cancel",
        )
        execution_control.mark_completed(
            "chat-off-cancel",
            "attempt-off-cancel",
        )
        context_root = Path(self.temp_dir.name) / "memory_v2"
        with mock.patch.dict(
            os.environ,
            {"PUPU_CONTEXT_V2_STORE_OWNER": "unchain"},
            clear=False,
        ):
            result = host.cancel_chat_execution(
                session_id="chat-off-cancel",
                attempt_id="attempt-off-cancel",
                owner_chat_id="owner-off-cancel",
            )

        self.assertEqual(result["state"], "completed")
        self.assertFalse((context_root / "context_v2.sqlite3").exists())
        self.assertFalse((context_root / "objects").exists())

    def test_terminal_off_exact_cancel_closes_durable_interaction_without_context(self) -> None:
        import execution_control

        context_root = Path(self.temp_dir.name) / "memory_v2"
        for terminal_state in ("completed", "failed"):
            with self.subTest(terminal_state=terminal_state):
                session_id = f"chat-off-{terminal_state}-pending"
                attempt_id = f"attempt-off-{terminal_state}-pending"
                request = self._seed_cancellable_request(
                    session_id=session_id,
                    attempt_id=attempt_id,
                )
                execution_control.register(session_id, attempt_id)
                execution_control.mark_running(session_id, attempt_id)
                if terminal_state == "completed":
                    execution_control.mark_completed(session_id, attempt_id)
                else:
                    execution_control.mark_failed(
                        session_id,
                        attempt_id,
                        reason="provider_failed_after_wait",
                    )

                result = host.cancel_chat_execution(
                    session_id=session_id,
                    attempt_id=attempt_id,
                    owner_chat_id=f"owner-{terminal_state}-pending",
                    expected_interaction_id=request.interaction_id,
                )

                self.assertEqual(result["state"], terminal_state)
                self.assertTrue(result["durable_interaction_cancelled"])
                self.assertEqual(
                    host.get_pending_interaction(session_id),
                    {"status": "none", "session_id": session_id},
                )
                self.assertIsNone(
                    host.load_resume_context(session_id, attempt_id)
                )
                self.assertIsNone(
                    host._execution_runtime().load_cancellation(
                        session_id,
                        attempt_id,
                    )
                )
                self.assertFalse((context_root / "context_v2.sqlite3").exists())
                self.assertFalse((context_root / "objects").exists())

    def test_resume_attempt_cancel_precisely_terminalizes_parent_checkpoint(self) -> None:
        import execution_control

        request = self._seed_cancellable_request(
            session_id="chat-resume-cancel",
            attempt_id="attempt-a",
        )
        host.bind_execution_attempt(
            session_id="chat-resume-cancel",
            attempt_id="attempt-b",
            source_attempt_id="attempt-a",
        )
        execution_control.mark_running("chat-resume-cancel", "attempt-b")

        result = host.cancel_chat_execution(
            session_id="chat-resume-cancel",
            attempt_id="attempt-b",
            source_attempt_id="attempt-a",
            expected_interaction_id=request.interaction_id,
        )

        self.assertEqual(result["source_attempt_id"], "attempt-a")
        self.assertTrue(result["durable_interaction_cancelled"])
        self.assertEqual(
            host.get_pending_interaction("chat-resume-cancel"),
            {"status": "none", "session_id": "chat-resume-cancel"},
        )
        self.assertIsNotNone(
            host._execution_runtime().load_cancellation(
                "chat-resume-cancel",
                "attempt-b",
            )
        )

    def test_cancel_before_resume_binding_reconciles_after_binding(self) -> None:
        request = self._seed_cancellable_request(
            session_id="chat-cancel-before-bind",
            attempt_id="attempt-a",
        )

        host.cancel_chat_execution(
            session_id="chat-cancel-before-bind",
            attempt_id="attempt-b",
            expected_interaction_id=request.interaction_id,
        )
        self.assertEqual(
            host.get_pending_interaction("chat-cancel-before-bind"),
            {"status": "none", "session_id": "chat-cancel-before-bind"},
        )

        host.bind_execution_attempt(
            session_id="chat-cancel-before-bind",
            attempt_id="attempt-b",
            source_attempt_id="attempt-a",
        )

        self.assertEqual(
            host.get_pending_interaction("chat-cancel-before-bind"),
            {"status": "none", "session_id": "chat-cancel-before-bind"},
        )

    def test_cancel_and_resume_binding_concurrency_always_terminalizes_parent(self) -> None:
        for index in range(8):
            session_id = f"chat-bind-race-{index}"
            request = self._seed_cancellable_request(
                session_id=session_id,
                attempt_id="attempt-a",
            )
            gate = threading.Barrier(2)
            errors = []

            def bind() -> None:
                try:
                    gate.wait(timeout=2)
                    host.bind_execution_attempt(
                        session_id=session_id,
                        attempt_id="attempt-b",
                        source_attempt_id="attempt-a",
                    )
                except Exception as exc:  # noqa: BLE001 - asserted below
                    errors.append(exc)

            def cancel() -> None:
                try:
                    gate.wait(timeout=2)
                    host.cancel_chat_execution(
                        session_id=session_id,
                        attempt_id="attempt-b",
                        expected_interaction_id=request.interaction_id,
                    )
                except Exception as exc:  # noqa: BLE001 - asserted below
                    errors.append(exc)

            workers = [threading.Thread(target=bind), threading.Thread(target=cancel)]
            for worker in workers:
                worker.start()
            for worker in workers:
                worker.join(timeout=3)

            self.assertEqual(errors, [])
            self.assertTrue(all(not worker.is_alive() for worker in workers))
            self.assertEqual(
                host.get_pending_interaction(session_id),
                {"status": "none", "session_id": session_id},
            )

    def test_registry_only_cancel_is_reconciled_to_unchain_after_restart(self) -> None:
        import execution_control

        self._seed_cancellable_request(
            session_id="chat-split-store",
            attempt_id="attempt-a",
        )
        host.bind_execution_attempt(
            session_id="chat-split-store",
            attempt_id="attempt-b",
            source_attempt_id="attempt-a",
        )
        execution_control.request_cancel(
            "chat-split-store",
            "attempt-b",
            reason="crash between stores",
        )
        self.assertIsNone(
            host._execution_runtime().load_cancellation(
                "chat-split-store",
                "attempt-b",
            )
        )

        # New runtime objects read both durable stores, as a restarted sidecar does.
        self.assertEqual(
            host.get_pending_interaction("chat-split-store"),
            {"status": "none", "session_id": "chat-split-store"},
        )
        self.assertIsNotNone(
            host._execution_runtime().load_cancellation(
                "chat-split-store",
                "attempt-b",
            )
        )

    def test_completed_resume_attempt_terminalizes_parent_checkpoint(self) -> None:
        import execution_control

        request = self._seed_cancellable_request(
            session_id="chat-resume-completed",
            attempt_id="attempt-a",
        )
        host.bind_execution_attempt(
            session_id="chat-resume-completed",
            attempt_id="attempt-b",
            source_attempt_id="attempt-a",
        )
        execution_control.mark_running("chat-resume-completed", "attempt-b")
        execution_control.mark_completed("chat-resume-completed", "attempt-b")

        result = host.cancel_chat_execution(
            session_id="chat-resume-completed",
            attempt_id="attempt-b",
            source_attempt_id="attempt-a",
            expected_interaction_id=request.interaction_id,
        )

        self.assertEqual(result["state"], "completed")
        self.assertTrue(result["durable_interaction_cancelled"])
        self.assertEqual(
            host.get_pending_interaction("chat-resume-completed"),
            {"status": "none", "session_id": "chat-resume-completed"},
        )
        self.assertIsNone(
            host.load_resume_context("chat-resume-completed", "attempt-a")
        )
        self.assertIsNone(
            host._execution_runtime().load_cancellation(
                "chat-resume-completed",
                "attempt-b",
            )
        )

    def test_parent_cancel_revokes_bound_resume_lease_before_clearing_checkpoint(self) -> None:
        import execution_control

        guard = host._execution_runtime().acquire(
            "chat-parent-race",
            owner_id="attempt-b",
        )
        request = self._seed_cancellable_request(
            session_id="chat-parent-race",
            attempt_id="attempt-a",
            execution_fence=guard.fence,
        )
        host.bind_execution_attempt(
            session_id="chat-parent-race",
            attempt_id="attempt-b",
            source_attempt_id="attempt-a",
        )
        execution_control.mark_running("chat-parent-race", "attempt-b")
        result = host.cancel_chat_execution(
            session_id="chat-parent-race",
            attempt_id="attempt-a",
            expected_interaction_id=request.interaction_id,
        )

        self.assertTrue(result["durable_interaction_cancelled"])
        self.assertEqual(
            execution_control.snapshot(
                "chat-parent-race",
                "attempt-b",
            ).status,
            "cancelled",
        )
        self.assertIsNotNone(
            host._execution_runtime().load_cancellation(
                "chat-parent-race",
                "attempt-b",
            )
        )
        from unchain.execution import ExecutionCancelledError

        with self.assertRaises(ExecutionCancelledError):
            guard.assert_active()

    def test_receipt_rejects_registry_only_cancel_of_bound_resume_attempt(self) -> None:
        import execution_control

        request = self._seed_cancellable_request(
            session_id="chat-receipt-bound-cancel",
            attempt_id="attempt-a",
        )
        host.bind_execution_attempt(
            session_id="chat-receipt-bound-cancel",
            attempt_id="attempt-b",
            source_attempt_id="attempt-a",
        )
        execution_control.request_cancel(
            "chat-receipt-bound-cancel",
            "attempt-b",
            reason="stop",
        )

        with self.assertRaises(host.DurableInteractionHostError) as raised:
            host.record_interaction_receipt(
                session_id="chat-receipt-bound-cancel",
                interaction_id=request.interaction_id,
                approved=True,
            )
        self.assertEqual(raised.exception.code, "execution_cancelled")


if __name__ == "__main__":
    unittest.main()
