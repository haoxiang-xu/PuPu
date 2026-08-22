import json
import os
import sqlite3
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

from flask import Flask, jsonify, request

import route_memory_v2  # noqa: F401
from context_memory_v2_capability import ContextMemoryV2CapabilityVerdict
from context_memory_v2_capability import verify_context_memory_v2_capability
from memory_v2_runtime import (
    _reset_memory_v2_runtime_for_tests,
    get_memory_v2_runtime,
)
from memory_v2_store import MemoryV2Store
from memory_v2_store_boundary import CONTEXT_V2_STORE_OWNER_ENV
from route_blueprint import api_blueprint


class MemoryV2RouteTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env = mock.patch.dict(
            os.environ,
            {"UNCHAIN_DATA_DIR": self.temp_dir.name},
            clear=False,
        )
        self.env.start()
        _reset_memory_v2_runtime_for_tests()
        fake_routes = types.ModuleType("routes")
        fake_routes._is_authorized = (
            lambda: request.headers.get("x-unchain-auth") == "token"
        )
        fake_routes._json_error = lambda code, message, status: (
            jsonify({"error": {"code": code, "message": message}}),
            status,
        )
        self.routes_patch = mock.patch.dict(sys.modules, {"routes": fake_routes})
        self.routes_patch.start()
        app = Flask(__name__)
        app.register_blueprint(api_blueprint)
        self.client = app.test_client()
        self.headers = {"x-unchain-auth": "token"}

    def tearDown(self):
        _reset_memory_v2_runtime_for_tests()
        self.routes_patch.stop()
        self.env.stop()
        self.temp_dir.cleanup()

    def test_status_auth_events_and_no_append_route(self):
        self.assertEqual(self.client.get("/context/v2/status").status_code, 401)
        status = self.client.get("/context/v2/status", headers=self.headers)
        self.assertEqual(status.status_code, 200)
        self.assertNotIn("counts", status.get_json())
        self.assertEqual(status.get_json()["vector_status"], "disabled")
        runtime = get_memory_v2_runtime(required=True)
        runtime.append_semantic_event(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            event={"event_id": "evt_1", "type": "message.user", "payload": {}},
            operation_id="event_1",
        )
        events = self.client.get(
            "/context/v2/events?owner_chat_id=chat_a",
            headers=self.headers,
        )
        self.assertEqual(events.status_code, 200)
        self.assertEqual(events.get_json()["events"][0]["event_id"], "evt_1")
        self.assertEqual(
            self.client.post(
                "/context/v2/events",
                headers=self.headers,
                json={"owner_chat_id": "chat_a"},
            ).status_code,
            405,
        )

    def test_status_allowlists_vector_state_without_exposing_backend_details(self):
        base_status = {
            "available": True,
            "schema_version": 2,
            "journal_mode": "wal",
            "lexical_backend": "fts5",
            "vector": {
                "provider": "ollama",
                "model": "private-model-name",
                "last_error_code": "private-error",
            },
        }

        for raw_status, expected in (
            ("disabled", "disabled"),
            ("warming", "warming"),
            ("ready", "ready"),
            ("degraded", "degraded"),
            ("unexpected", "degraded"),
            (None, "disabled"),
        ):
            projected = dict(base_status)
            if raw_status is not None:
                projected["vector_status"] = raw_status
            fake_runtime = types.SimpleNamespace(status=lambda: projected)
            with mock.patch.object(
                route_memory_v2, "_runtime", return_value=fake_runtime
            ):
                response = self.client.get(
                    "/context/v2/status",
                    headers=self.headers,
                )
            self.assertEqual(response.status_code, 200)
            payload = response.get_json()
            self.assertEqual(payload["vector_status"], expected)
            self.assertNotIn("vector", payload)
            self.assertNotIn("provider", payload)
            self.assertNotIn("model", payload)
            self.assertNotIn("last_error_code", payload)

    def test_status_exposes_the_configured_unchain_store_owner(self):
        status = {
            "available": True,
            "schema_version": 2,
            "journal_mode": "wal",
            "lexical_backend": "fts5",
            "vector_status": "disabled",
        }
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_status_for_store_owner",
                return_value=status,
            ),
        ):
            response = self.client.get(
                "/context/v2/status",
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["store_owner"], "unchain")

    def test_status_exposes_the_same_normalized_rollout_used_by_admission(self):
        environment = {
            "PUPU_FEATURE_MEMORY_V2": "all",
            "PUPU_MEMORY_V2_MODE": "canary",
            "PUPU_MEMORY_V2_CANARY_PERCENT": "25",
            "PUPU_MEMORY_V2_READ_ONLY_DEGRADED": "0",
        }
        with mock.patch.dict(os.environ, environment, clear=False):
            response = self.client.get(
                "/context/v2/status",
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["feature_ceiling"], "all")
        self.assertEqual(payload["configured_mode"], "canary")
        self.assertEqual(payload["rollout_mode"], "canary")
        self.assertEqual(payload["canary_percent"], 25)
        self.assertTrue(payload["rollout_config_valid"])
        self.assertEqual(payload["rollout_config_error_code"], "")
        self.assertRegex(payload["rollout_fingerprint"], r"^[0-9a-f]{64}$")

    def test_status_exposes_the_exact_unchain_capability_readiness(self):
        from unchain.runtime.runtime_protocol import runtime_protocol_manifest

        manifest = runtime_protocol_manifest()
        verdict = verify_context_memory_v2_capability(
            manifest=manifest,
            requested_mode="all",
            unchain_revision="diagnostic-only",
            unchain_runtime_source="/loaded/unchain/runtime_protocol.py",
        )
        with (
            mock.patch.dict(
                os.environ,
                {
                    "PUPU_FEATURE_MEMORY_V2": "all",
                    "PUPU_MEMORY_V2_MODE": "all",
                },
                clear=False,
            ),
            mock.patch.object(
                route_memory_v2,
                "resolve_context_memory_v2_capability",
                return_value=verdict,
            ) as capability_probe,
        ):
            response = self.client.get(
                "/context/v2/status",
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {
                key: response.get_json()[key]
                for key in (
                    "runtime_protocol_ready",
                    "runtime_protocol_reason",
                    "runtime_protocol_verification",
                    "runtime_protocol_immutable",
                    "runtime_protocol_manifest",
                    "unchain_revision",
                    "unchain_runtime_source",
                )
            },
            {
                "runtime_protocol_ready": True,
                "runtime_protocol_reason": ("unchain_runtime_protocol_compatible"),
                "runtime_protocol_verification": "runtime_protocol",
                "runtime_protocol_immutable": True,
                "runtime_protocol_manifest": manifest,
                "unchain_revision": "diagnostic-only",
                "unchain_runtime_source": "/loaded/unchain/runtime_protocol.py",
            },
        )
        capability_probe.assert_called_once_with(requested_mode="all")

    def test_workspace_content_owner_scope_and_revision_error(self):
        space_response = self.client.post(
            "/context/v2/memory/spaces",
            headers=self.headers,
            json={
                "owner_chat_id": "chat_a",
                "name": "Chat memory",
                "operation_id": "space_1",
            },
        )
        self.assertEqual(space_response.status_code, 200)
        space = space_response.get_json()
        entry_response = self.client.post(
            f"/context/v2/memory/spaces/{space['space_id']}/entries",
            headers=self.headers,
            json={
                "owner_chat_id": "chat_a",
                "path": "/note.md",
                "kind": "file",
                "content": "hello",
                "mime_type": "text/markdown",
                "expected_space_revision": 1,
                "operation_id": "entry_1",
            },
        )
        self.assertEqual(entry_response.status_code, 200)
        entry = entry_response.get_json()
        content = self.client.get(
            "/context/v2/content/" + entry["ref"],
            headers=self.headers,
            query_string={"owner_chat_id": "chat_a"},
        )
        self.assertEqual(content.status_code, 200)
        denied = self.client.get(
            "/context/v2/content/" + entry["ref"],
            headers=self.headers,
            query_string={"owner_chat_id": "chat_b"},
        )
        self.assertEqual(denied.status_code, 404)
        conflict = self.client.patch(
            f"/context/v2/memory/spaces/{space['space_id']}/entries/{entry['entry_id']}",
            headers=self.headers,
            json={
                "owner_chat_id": "chat_a",
                "description": "changed",
                "expected_revision": 99,
                "expected_space_revision": 2,
                "operation_id": "entry_update_1",
            },
        )
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(
            conflict.get_json()["error"]["code"],
            "context_v2_revision_conflict",
        )

    def test_session_head_and_rebase_use_owner_bound_generation_cas(self):
        runtime = get_memory_v2_runtime(required=True)
        admission = runtime.resolve_chat_admission(
            owner_chat_id="chat_rebase",
            session_id="session_rebase",
            requested_rollout_mode="all",
            effective_rollout_mode="all",
            cohort="all_active",
            target_mode="active",
            decision_reason="",
            canary_selected=True,
            canary_percent=5,
            canary_bucket=1,
            hash_strategy="sha256_owner_v1",
            provenance={"source": "route_test"},
            operation_id="route_admission",
        )
        runtime.bootstrap_current_request(
            owner_chat_id="chat_rebase",
            session_id="session_rebase",
            attempt_id="attempt_rebase",
            message={"content": "Original"},
            operation_id="route_request",
        )

        self.assertEqual(
            self.client.get(
                "/context/v2/session/head",
                query_string={
                    "owner_chat_id": "chat_rebase",
                    "session_id": "session_rebase",
                },
            ).status_code,
            401,
        )
        pending_response = self.client.get(
            "/context/v2/session/head",
            headers=self.headers,
            query_string={
                "owner_chat_id": "chat_rebase",
                "session_id": "session_rebase",
            },
        )
        self.assertEqual(pending_response.status_code, 200)
        pending = pending_response.get_json()
        self.assertEqual(pending["target_mode"], "active")
        self.assertEqual(pending["admission_mode"], "shadow")
        self.assertEqual(pending["bootstrap_status"], "pending")
        self.assertFalse(pending["mutation_ready"])
        self.assertNotIn("events", pending)
        self.assertNotIn("objective", pending)

        runtime.mark_chat_bootstrap(
            owner_chat_id="chat_rebase",
            admission_id=admission["admission_id"],
            expected_revision=admission["revision"],
            succeeded=True,
            provenance={"stage": "complete"},
            error_code="",
            operation_id="route_bootstrap",
        )
        ready = self.client.get(
            "/context/v2/session/head",
            headers=self.headers,
            query_string={
                "owner_chat_id": "chat_rebase",
                "session_id": "session_rebase",
            },
        ).get_json()
        self.assertTrue(ready["mutation_ready"])
        self.assertEqual(ready["admission_mode"], "active")

        rebase_payload = {
            "owner_chat_id": "chat_rebase",
            "session_id": "session_rebase",
            "replacement_history": [
                {"role": "user", "content": "Replacement"},
                {"role": "assistant", "content": "Done"},
            ],
            "source_generation_id": ready["current_generation_id"],
            "expected_session_revision": ready["session_revision"],
            "operation_id": "route_rebase",
            "reason": "edit",
        }
        open_attempt = self.client.post(
            "/context/v2/session/rebase",
            headers=self.headers,
            json=rebase_payload,
        )
        self.assertEqual(open_attempt.status_code, 409)
        self.assertEqual(
            open_attempt.get_json()["error"]["code"],
            "context_v2_rebase_in_progress",
        )
        self.assertTrue(open_attempt.get_json()["error"]["retryable"])

        runtime.seal_task(
            owner_chat_id="chat_rebase",
            session_id="session_rebase",
            attempt_id="attempt_rebase",
            outcome="completed",
            operation_id="route_attempt_complete",
        )
        response = self.client.post(
            "/context/v2/session/rebase",
            headers=self.headers,
            json=rebase_payload,
        )
        self.assertEqual(response.status_code, 200)
        rebased = response.get_json()
        self.assertEqual(
            rebased["source_generation_id"], ready["current_generation_id"]
        )
        self.assertEqual(rebased["message_event_count"], 2)
        self.assertEqual(rebased["capture_quality"], "partial")
        self.assertEqual(rebased["session_revision"], ready["session_revision"] + 1)

        after = self.client.get(
            "/context/v2/session/head",
            headers=self.headers,
            query_string={
                "owner_chat_id": "chat_rebase",
                "session_id": "session_rebase",
            },
        ).get_json()
        self.assertEqual(after["current_generation_id"], rebased["generation_id"])
        self.assertEqual(after["session_revision"], rebased["session_revision"])

        wrong_owner = self.client.get(
            "/context/v2/session/head",
            headers=self.headers,
            query_string={
                "owner_chat_id": "chat_other",
                "session_id": "session_rebase",
            },
        )
        self.assertEqual(wrong_owner.status_code, 404)
        self.assertEqual(
            wrong_owner.get_json()["error"]["code"],
            "context_v2_not_found",
        )

        invalid = self.client.post(
            "/context/v2/session/rebase",
            headers=self.headers,
            json={
                "owner_chat_id": "chat_rebase",
                "session_id": "session_rebase",
                "replacement_history": [
                    {"role": "tool", "content": "must not fabricate"}
                ],
                "source_generation_id": after["current_generation_id"],
                "expected_session_revision": after["session_revision"],
                "operation_id": "route_rebase_invalid",
                "reason": "edit",
            },
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(
            invalid.get_json()["error"]["code"],
            "context_v2_invalid_history",
        )

    def test_generation_routes_dispatch_to_unchain_owner_without_legacy_runtime(self):
        calls = []
        head = {
            "owner_chat_id": "chat_unchain",
            "session_id": "session_unchain",
            "admission_mode": "active",
            "target_mode": "active",
            "bootstrap_status": "complete",
            "bootstrap_error_code": "",
            "v2_bootstrapped": True,
            "sticky": True,
            "session_exists": True,
            "mutation_ready": True,
            "current_generation_id": "generation_unchain",
            "current_generation_no": 2,
            "session_revision": 2,
        }
        rebase = {
            "owner_chat_id": "chat_unchain",
            "session_id": "session_unchain",
            "source_generation_id": "generation_unchain",
            "generation_id": "generation_rebased",
            "session_revision": 3,
        }

        class GenerationAPI:
            def get_session_head(self, **kwargs):
                calls.append(("head", kwargs))
                return head

            def rebase_session(self, **kwargs):
                calls.append(("rebase", kwargs))
                return rebase

        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_generation_api."
                "open_pupu_unchain_generation_api",
                return_value=GenerationAPI(),
            ) as open_generation,
        ):
            head_response = self.client.get(
                "/context/v2/session/head",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_unchain",
                    "session_id": "session_unchain",
                },
            )
            rebase_response = self.client.post(
                "/context/v2/session/rebase",
                headers=self.headers,
                json={
                    "owner_chat_id": "chat_unchain",
                    "session_id": "session_unchain",
                    "replacement_history": [
                        {"role": "user", "content": "Replacement"}
                    ],
                    "source_generation_id": "generation_unchain",
                    "expected_session_revision": 2,
                    "operation_id": "operation_unchain",
                    "reason": "edit",
                },
            )

        self.assertEqual(head_response.status_code, 200)
        self.assertEqual(head_response.get_json(), head)
        self.assertEqual(rebase_response.status_code, 200)
        self.assertEqual(rebase_response.get_json(), rebase)
        self.assertEqual(
            calls,
            [
                (
                    "head",
                    {
                        "owner_chat_id": "chat_unchain",
                        "session_id": "session_unchain",
                    },
                ),
                (
                    "rebase",
                    {
                        "owner_chat_id": "chat_unchain",
                        "session_id": "session_unchain",
                        "replacement_history": [
                            {"role": "user", "content": "Replacement"}
                        ],
                        "source_generation_id": "generation_unchain",
                        "expected_session_revision": 2,
                        "operation_id": "operation_unchain",
                        "reason": "edit",
                    },
                ),
            ],
        )
        self.assertEqual(open_generation.call_count, 2)
        for call in open_generation.call_args_list:
            self.assertEqual(
                call.kwargs,
                {
                    "root_dir": (
                        Path(self.temp_dir.name) / "memory_v2"
                    ).resolve(),
                    "owner_chat_id": "chat_unchain",
                },
            )

    def test_unchain_generation_route_preserves_stable_error_contract(self):
        from memory_v2_unchain_generation_api import (
            MemoryV2UnchainGenerationAPIError,
        )

        generation_api = types.SimpleNamespace(
            get_session_head=mock.Mock(
                side_effect=MemoryV2UnchainGenerationAPIError(
                    "context_v2_revision_conflict",
                    "private durable detail",
                    status_code=409,
                    retryable=True,
                    expected_revision=2,
                    actual_revision=3,
                )
            )
        )
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_generation_api."
                "open_pupu_unchain_generation_api",
                return_value=generation_api,
            ),
        ):
            response = self.client.get(
                "/context/v2/session/head",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_unchain",
                    "session_id": "session_unchain",
                },
            )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.get_json(),
            {
                "error": {
                    "code": "context_v2_revision_conflict",
                    "message": "Unchain-owned generation request failed",
                    "retryable": True,
                    "expected_revision": 2,
                    "actual_revision": 3,
                }
            },
        )

    def test_rebase_error_envelope_is_closed_for_exact_seven_codes(self):
        from memory_v2_unchain_generation_api import (
            CONTEXT_V2_REBASE_CODE_PROJECTIONS,
            CONTEXT_V2_REBASE_ERROR_CODES,
            CONTEXT_V2_REBASE_MAPPING_CODES,
            MemoryV2UnchainGenerationAPIError,
        )

        expected = {
            "context_v2_rebase_in_progress": (409, True),
            "context_v2_rebase_recovery_required": (409, True),
            "context_v2_rebase_journal_incompatible": (409, False),
            "context_v2_operation_conflict": (409, False),
            "context_v2_revision_conflict": (409, True),
            "context_v2_generation_conflict": (409, True),
            "context_v2_rebase_unavailable": (503, True),
        }
        self.assertEqual(CONTEXT_V2_REBASE_CODE_PROJECTIONS, expected)
        self.assertEqual(CONTEXT_V2_REBASE_MAPPING_CODES, frozenset(expected))
        self.assertEqual(
            CONTEXT_V2_REBASE_ERROR_CODES,
            frozenset(expected)
            | {
                "context_v2_rebase_receipt_mismatch",
                "context_v2_not_found",
                "context_v2_invalid_request",
                "context_v2_invalid_history",
            },
        )
        self.assertEqual(len(CONTEXT_V2_REBASE_MAPPING_CODES), 7)
        self.assertEqual(len(CONTEXT_V2_REBASE_ERROR_CODES), 11)
        request_payload = {
            "owner_chat_id": "chat_unchain",
            "session_id": "session_unchain",
            "replacement_history": [
                {"role": "user", "content": "Replacement"}
            ],
            "source_generation_id": "generation_unchain",
            "expected_session_revision": 2,
            "operation_id": "operation_unchain",
            "reason": "edit",
        }

        for code, (expected_status, expected_retryable) in expected.items():
            generation_api = types.SimpleNamespace(
                rebase_session=mock.Mock(
                    side_effect=MemoryV2UnchainGenerationAPIError(
                        code,
                        f"private producer detail for {code}",
                        status_code=418,
                        retryable=not expected_retryable,
                        expected_revision=2,
                        actual_revision=3,
                    )
                )
            )
            with (
                mock.patch.dict(
                    os.environ,
                    {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
                ),
                mock.patch.object(
                    route_memory_v2,
                    "_runtime",
                    side_effect=AssertionError("legacy runtime must not open"),
                ),
                mock.patch(
                    "memory_v2_unchain_generation_api."
                    "open_pupu_unchain_generation_api",
                    return_value=generation_api,
                ),
            ):
                response = self.client.post(
                    "/context/v2/session/rebase",
                    headers=self.headers,
                    json=request_payload,
                )

            expected_error = {
                "code": code,
                "message": "Unchain-owned generation request failed",
                "retryable": expected_retryable,
            }
            if code in {
                "context_v2_revision_conflict",
                "context_v2_generation_conflict",
            }:
                expected_error.update(
                    {"expected_revision": 2, "actual_revision": 3}
                )
            self.assertEqual(response.status_code, expected_status)
            self.assertEqual(response.get_json(), {"error": expected_error})
            self.assertNotIn("private producer detail", response.get_data(as_text=True))

    def test_rebase_error_envelope_quarantines_non_allowlisted_code(self):
        from memory_v2_unchain_generation_api import (
            MemoryV2UnchainGenerationAPIError,
        )

        generation_api = types.SimpleNamespace(
            rebase_session=mock.Mock(
                side_effect=MemoryV2UnchainGenerationAPIError(
                    "context_v2_private_internal_code",
                    "private journal path and payload must not escape",
                    status_code=409,
                    retryable=False,
                    expected_revision=111,
                    actual_revision=222,
                )
            )
        )
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_generation_api."
                "open_pupu_unchain_generation_api",
                return_value=generation_api,
            ),
        ):
            response = self.client.post(
                "/context/v2/session/rebase",
                headers=self.headers,
                json={
                    "owner_chat_id": "chat_unchain",
                    "session_id": "session_unchain",
                    "replacement_history": [
                        {"role": "user", "content": "Replacement"}
                    ],
                    "source_generation_id": "generation_unchain",
                    "expected_session_revision": 2,
                    "operation_id": "operation_unchain",
                    "reason": "edit",
                },
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.get_json(),
            {
                "error": {
                    "code": "context_v2_rebase_unavailable",
                    "message": "Unchain-owned generation request failed",
                    "retryable": True,
                }
            },
        )
        raw = response.get_data(as_text=True)
        self.assertNotIn("context_v2_private_internal_code", raw)
        self.assertNotIn("private journal path", raw)
        self.assertNotIn("111", raw)
        self.assertNotIn("222", raw)

    def test_unchain_unadmitted_head_normalizes_to_definitive_not_found(self):
        from memory_v2_unchain_generation_api import (
            MemoryV2UnchainGenerationAPIError,
        )

        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_generation_api."
                "open_pupu_unchain_generation_api",
                side_effect=MemoryV2UnchainGenerationAPIError(
                    "context_v2_admission_missing",
                    "private admission detail",
                    status_code=404,
                ),
            ),
        ):
            response = self.client.get(
                "/context/v2/session/head",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_unadmitted",
                    "session_id": "session_unadmitted",
                },
            )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.get_json()["error"],
            {
                "code": "context_v2_not_found",
                "message": "Unchain-owned generation request failed",
                "retryable": False,
            },
        )

    def test_unchain_partial_binding_without_admission_fails_closed(self):
        import sqlite3

        from memory_v2_store_boundary import (
            STORE_OWNER_UNCHAIN,
            admit_context_v2_store_owner,
        )
        from memory_v2_unchain_generation_api import (
            MemoryV2UnchainGenerationAPIError,
        )
        from unchain.persistence.sqlite_v2 import SQLiteContextV2Store

        root_dir = Path(self.temp_dir.name) / "memory_v2"
        admission = admit_context_v2_store_owner(
            root_dir=root_dir,
            requested_owner=STORE_OWNER_UNCHAIN,
        )
        SQLiteContextV2Store(
            database_path=admission.database_path,
            object_directory=root_dir / "objects",
        )
        with sqlite3.connect(admission.database_path) as connection:
            connection.execute(
                "CREATE TABLE host_generation_chat_bindings ("
                "owner_chat_id TEXT PRIMARY KEY, execution_id TEXT NOT NULL, "
                "session_id TEXT NOT NULL)"
            )
            connection.execute(
                "INSERT INTO host_generation_chat_bindings("
                "owner_chat_id, execution_id, session_id) VALUES(?, ?, ?)",
                ("chat_partial", "execution_partial", "session_partial"),
            )

        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_generation_api."
                "open_pupu_unchain_generation_api",
                side_effect=MemoryV2UnchainGenerationAPIError(
                    "context_v2_admission_missing",
                    "admission write did not complete",
                    status_code=404,
                ),
            ),
        ):
            response = self.client.get(
                "/context/v2/session/head",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_partial",
                    "session_id": "different_session",
                },
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.get_json()["error"],
            {
                "code": "context_v2_mutation_not_ready",
                "message": "Unchain-owned generation request failed",
                "retryable": True,
            },
        )

    def test_disabled_generation_routes_distinguish_absent_from_durable_state(self):
        rebase_payload = {
            "owner_chat_id": "chat_disabled",
            "session_id": "session_disabled",
            "replacement_history": [],
            "source_generation_id": "generation_disabled",
            "expected_session_revision": 1,
            "operation_id": "operation_disabled",
            "reason": "delete",
        }

        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "off"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
        ):
            absent_head = self.client.get(
                "/context/v2/session/head",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_disabled",
                    "session_id": "session_disabled",
                },
            )
            absent_rebase = self.client.post(
                "/context/v2/session/rebase",
                headers=self.headers,
                json=rebase_payload,
            )

        self.assertEqual(absent_head.status_code, 404)
        self.assertEqual(absent_rebase.status_code, 404)
        self.assertEqual(
            absent_head.get_json()["error"]["code"],
            "context_v2_not_found",
        )
        self.assertEqual(
            absent_rebase.get_json()["error"]["code"],
            "context_v2_not_found",
        )

        with mock.patch.dict(
            os.environ,
            {CONTEXT_V2_STORE_OWNER_ENV: "pupu_legacy"},
        ):
            get_memory_v2_runtime(required=True)
        _reset_memory_v2_runtime_for_tests()

        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "off"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
        ):
            empty_legacy_head = self.client.get(
                "/context/v2/session/head",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_disabled",
                    "session_id": "session_disabled",
                },
            )
            empty_legacy_rebase = self.client.post(
                "/context/v2/session/rebase",
                headers=self.headers,
                json=rebase_payload,
            )

        self.assertEqual(empty_legacy_head.status_code, 404)
        self.assertEqual(empty_legacy_rebase.status_code, 404)
        self.assertEqual(
            empty_legacy_head.get_json()["error"]["code"],
            "context_v2_not_found",
        )
        self.assertEqual(
            empty_legacy_rebase.get_json()["error"]["code"],
            "context_v2_not_found",
        )

        with mock.patch.dict(
            os.environ,
            {CONTEXT_V2_STORE_OWNER_ENV: "pupu_legacy"},
        ):
            runtime = get_memory_v2_runtime(required=True)
            runtime.resolve_chat_admission(
                owner_chat_id="chat_disabled",
                session_id="session_disabled",
                requested_rollout_mode="all",
                effective_rollout_mode="all",
                cohort="all_active",
                target_mode="active",
                decision_reason="",
                canary_selected=True,
                canary_percent=100,
                canary_bucket=1,
                hash_strategy="sha256_owner_v1",
                provenance={"source": "route_test"},
                operation_id="disabled_scope_admission",
            )
        _reset_memory_v2_runtime_for_tests()

        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "off"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
        ):
            durable_head = self.client.get(
                "/context/v2/session/head",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_disabled",
                    "session_id": "different_session",
                },
            )
            durable_rebase = self.client.post(
                "/context/v2/session/rebase",
                headers=self.headers,
                json=rebase_payload,
            )

        self.assertEqual(durable_head.status_code, 503)
        self.assertEqual(durable_rebase.status_code, 503)
        self.assertEqual(
            durable_head.get_json()["error"]["code"],
            "context_v2_store_disabled",
        )
        self.assertEqual(
            durable_rebase.get_json()["error"]["code"],
            "context_v2_store_disabled",
        )

    def test_read_only_degraded_allows_reads_and_privacy_delete_only(self):
        with mock.patch.dict(
            os.environ,
            {"PUPU_MEMORY_V2_READ_ONLY_DEGRADED": "1"},
        ):
            status = self.client.get("/context/v2/status", headers=self.headers)
            self.assertEqual(status.status_code, 200)
            self.assertTrue(status.get_json()["read_only_degraded"])
            spaces = self.client.get(
                "/context/v2/memory/spaces?owner_chat_id=chat_a",
                headers=self.headers,
            )
            self.assertEqual(spaces.status_code, 200)
            rejected = self.client.post(
                "/context/v2/memory/spaces",
                headers=self.headers,
                json={
                    "owner_chat_id": "chat_a",
                    "name": "blocked",
                    "operation_id": "space_blocked_1",
                },
            )
            self.assertEqual(rejected.status_code, 503)
            self.assertEqual(
                rejected.get_json()["error"]["code"],
                "context_v2_read_only_degraded",
            )
            rebase_rejected = self.client.post(
                "/context/v2/session/rebase",
                headers=self.headers,
                json={
                    "owner_chat_id": "chat_a",
                    "session_id": "session_a",
                    "replacement_history": [],
                    "source_generation_id": "ctx_generation_a",
                    "expected_session_revision": 1,
                    "operation_id": "rebase_blocked_1",
                    "reason": "delete",
                },
            )
            self.assertEqual(rebase_rejected.status_code, 503)
            self.assertEqual(
                rebase_rejected.get_json()["error"]["code"],
                "context_v2_read_only_degraded",
            )
            entry_delete = self.client.delete(
                "/context/v2/memory/spaces/space_a/entries/entry_a",
                headers=self.headers,
                json={"operation_id": "entry_delete_blocked_1"},
            )
            self.assertEqual(entry_delete.status_code, 503)
            privacy_delete = self.client.delete(
                "/context/v2/chat/chat_a",
                headers=self.headers,
                json={"operation_id": "chat_delete_allowed_1"},
            )
            self.assertEqual(privacy_delete.status_code, 200)
            self.assertTrue(privacy_delete.get_json()["deleted"])

    def test_chat_delete_dispatches_to_unchain_owner_without_legacy_runtime(self):
        expected = {
            "schema": "pupu.unchain_chat_deletion.v1",
            "deleted": True,
            "owner_chat_id": "chat_a",
            "tombstone_revision": 1,
            "replayed": False,
            "deleted_rows": {"executions": 1},
            "gc_status": "pending_unreferenced_scan",
        }
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_deletion_adapter.delete_pupu_unchain_chat",
                return_value=expected,
            ) as delete_chat,
        ):
            response = self.client.delete(
                "/context/v2/chat/chat_a",
                headers=self.headers,
                json={"operation_id": "delete_unchain_chat_a"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), expected)
        delete_chat.assert_called_once_with(
            database_path=(
                Path(self.temp_dir.name) / "memory_v2" / "context_v2.sqlite3"
            ).resolve(),
            owner_chat_id="chat_a",
            operation_id="delete_unchain_chat_a",
        )

    def test_chat_delete_with_off_and_absent_store_returns_no_store_without_writes(self):
        expected = {
            "schema": "pupu.context_v2_no_store_chat_deletion.v1",
            "deleted": True,
            "owner_chat_id": "chat_a",
            "outcome": "not_present",
        }
        root = Path(self.temp_dir.name) / "memory_v2"
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "off"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
        ):
            response = self.client.delete(
                "/context/v2/chat/chat_a",
                headers=self.headers,
                json={"operation_id": "delete_off_no_store"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), expected)
        self.assertFalse(root.exists())

    def test_chat_delete_with_unchain_and_empty_root_never_opens_lifecycle_schema(self):
        expected = {
            "schema": "pupu.context_v2_no_store_chat_deletion.v1",
            "deleted": True,
            "owner_chat_id": "chat_a",
            "outcome": "not_present",
        }
        root = Path(self.temp_dir.name) / "memory_v2"
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_deletion_adapter.list_pupu_unchain_ownership_lifecycles",
                side_effect=AssertionError("lifecycle schema must not open"),
            ),
        ):
            response = self.client.delete(
                "/context/v2/chat/chat_a",
                headers=self.headers,
                json={"operation_id": "delete_unchain_no_store"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), expected)
        self.assertFalse(root.exists())

    def test_chat_delete_with_off_routes_to_the_persisted_legacy_owner(self):
        root = Path(self.temp_dir.name) / "memory_v2"
        legacy = MemoryV2Store(root)
        legacy.close()
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "off"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime singleton must not open"),
            ),
        ):
            response = self.client.delete(
                "/context/v2/chat/chat_a",
                headers=self.headers,
                json={"operation_id": "delete_off_legacy"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["deleted"])
        self.assertEqual(response.get_json()["owner_chat_id"], "chat_a")

    def test_chat_delete_with_off_routes_to_the_persisted_unchain_owner(self):
        root = Path(self.temp_dir.name) / "memory_v2"
        root.mkdir()
        database_path = root / "context_v2.sqlite3"
        with sqlite3.connect(database_path) as connection:
            connection.executescript(
                """
                CREATE TABLE context_v2_schema(version INTEGER PRIMARY KEY);
                INSERT INTO context_v2_schema(version) VALUES (1), (2);
                CREATE TABLE executions(execution_id TEXT PRIMARY KEY);
                CREATE TABLE events(event_id TEXT PRIMARY KEY);
                CREATE TABLE operations(operation_id TEXT PRIMARY KEY);
                CREATE TABLE objects(sha256 TEXT PRIMARY KEY);
                CREATE TABLE artifacts(artifact_id TEXT PRIMARY KEY);
                """
            )
        expected = {
            "schema": "pupu.unchain_chat_deletion.v1",
            "deleted": True,
            "owner_chat_id": "chat_a",
            "tombstone_revision": 1,
            "replayed": False,
            "deleted_rows": {},
            "gc_status": "pending_unreferenced_scan",
        }
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "off"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_deletion_adapter.delete_pupu_unchain_chat",
                return_value=expected,
            ) as delete_chat,
        ):
            response = self.client.delete(
                "/context/v2/chat/chat_a",
                headers=self.headers,
                json={"operation_id": "delete_off_unchain"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), expected)
        delete_chat.assert_called_once_with(
            database_path=database_path.resolve(),
            owner_chat_id="chat_a",
            operation_id="delete_off_unchain",
        )

    def test_chat_delete_reports_partial_unchain_schema_as_a_typed_non_retryable_error(self):
        root = Path(self.temp_dir.name) / "memory_v2"
        root.mkdir()
        marker = root / "context_v2.owner.json"
        marker.write_text(
            json.dumps(
                {
                    "database": "context_v2.sqlite3",
                    "owner": "unchain",
                    "schema": "pupu.context-v2-store-owner.v1",
                }
            ),
            encoding="utf-8",
        )
        with sqlite3.connect(root / "context_v2.sqlite3") as connection:
            connection.executescript(
                """
                CREATE TABLE pupu_unchain_ownership_schema(version INTEGER PRIMARY KEY);
                CREATE TABLE pupu_unchain_ownership_bindings(binding_id TEXT PRIMARY KEY);
                CREATE TABLE pupu_unchain_ownership_operations(operation_id TEXT PRIMARY KEY);
                """
            )
        with mock.patch.dict(
            os.environ,
            {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
        ):
            response = self.client.delete(
                "/context/v2/chat/chat_a",
                headers=self.headers,
                json={"operation_id": "delete_partial_unchain"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.get_json()["error"],
            {
                "code": "context_v2_store_schema_incompatible",
                "message": "Context V2 storage scope cannot be determined safely",
                "retryable": False,
            },
        )

    def test_owner_scoped_get_routes_use_unchain_reader_without_legacy_runtime(self):
        reader = types.SimpleNamespace(
            load_events=mock.Mock(
                return_value={
                    "owner_chat_id": "chat_a",
                    "events": [],
                    "after": 7,
                    "next_after": 7,
                    "has_more": False,
                }
            ),
            read_scoped_content=mock.Mock(
                return_value={
                    "ref": "pupu://artifact/artifact_a@1",
                    "owner_chat_id": "chat_a",
                    "encoding": "base64",
                    "data": "eA==",
                }
            ),
            list_spaces=mock.Mock(
                return_value={"owner_chat_id": "chat_a", "spaces": []}
            ),
            get_tree=mock.Mock(
                return_value={
                    "owner_chat_id": "chat_a",
                    "space_id": "space_a",
                    "tree": [],
                }
            ),
            list_entries=mock.Mock(
                return_value={
                    "owner_chat_id": "chat_a",
                    "space_id": "space_a",
                    "entries": [],
                }
            ),
            get_entry=mock.Mock(return_value={"entry_id": "entry_a", "revision": 2}),
            search_entries=mock.Mock(
                return_value={
                    "owner_chat_id": "chat_a",
                    "query": "needle",
                    "results": [],
                }
            ),
        )
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_read_adapter.open_pupu_unchain_memory_v2_reader",
                return_value=reader,
            ) as open_reader,
            mock.patch(
                "memory_v2_unchain_read_adapter.read_pupu_unchain_memory_v2_store_status",
                return_value={
                    "available": True,
                    "schema_version": 2,
                    "journal_mode": "wal",
                    "lexical_backend": "fts5",
                    "vector_status": "disabled",
                    "storeOwner": "unchain",
                },
            ) as store_status,
            mock.patch.object(
                route_memory_v2,
                "resolve_context_memory_v2_capability",
                return_value=ContextMemoryV2CapabilityVerdict(
                    ready=False,
                    reason="unchain_lock_unverified",
                    verification="failed",
                    immutable=False,
                ),
            ),
        ):
            status = self.client.get(
                "/context/v2/status",
                headers=self.headers,
            )
            events = self.client.get(
                "/context/v2/events",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_a",
                    "after": 7,
                    "limit": 9,
                    "session_id": "session_a",
                    "attempt_id": "attempt_a",
                    "include_payload": "false",
                },
            )
            content = self.client.get(
                "/context/v2/content/pupu://artifact/artifact_a@1",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_a",
                    "offset": 3,
                    "limit": 5,
                },
            )
            spaces = self.client.get(
                "/context/v2/memory/spaces",
                headers=self.headers,
                query_string={"owner_chat_id": "chat_a"},
            )
            tree = self.client.get(
                "/context/v2/memory/spaces/space_a/tree",
                headers=self.headers,
                query_string={"owner_chat_id": "chat_a"},
            )
            entries = self.client.get(
                "/context/v2/memory/spaces/space_a/entries",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_a",
                    "parent_path": "/notes",
                    "include_descendants": "false",
                },
            )
            entry = self.client.get(
                "/context/v2/memory/spaces/space_a/entries/entry_a",
                headers=self.headers,
                query_string={"owner_chat_id": "chat_a", "revision": 2},
            )
            search = self.client.get(
                "/context/v2/memory/search",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_a",
                    "space_id": "space_a",
                    "q": "needle",
                    "limit": 6,
                },
            )

        for response in (
            status,
            events,
            content,
            spaces,
            tree,
            entries,
            entry,
            search,
        ):
            self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(status.get_json()["journal_mode"], "wal")
        self.assertEqual(events.get_json()["after"], 7)
        self.assertEqual(content.get_json()["data"], "eA==")
        self.assertEqual(entry.get_json()["revision"], 2)
        self.assertEqual(open_reader.call_count, 7)
        store_status.assert_called_once_with(
            root_dir=(Path(self.temp_dir.name) / "memory_v2").resolve()
        )
        self.assertTrue(
            all(
                call.kwargs
                == {
                    "root_dir": (Path(self.temp_dir.name) / "memory_v2").resolve(),
                    "owner_chat_id": "chat_a",
                }
                for call in open_reader.call_args_list
            )
        )
        reader.load_events.assert_called_once_with(
            owner_chat_id="chat_a",
            after=7,
            limit=9,
            session_id="session_a",
            attempt_id="attempt_a",
            include_payload=False,
        )
        reader.read_scoped_content.assert_called_once_with(
            owner_chat_id="chat_a",
            ref="pupu://artifact/artifact_a@1",
            offset=3,
            limit=5,
        )
        reader.list_spaces.assert_called_once_with(owner_chat_id="chat_a")
        reader.get_tree.assert_called_once_with(
            owner_chat_id="chat_a",
            space_id="space_a",
        )
        reader.list_entries.assert_called_once_with(
            owner_chat_id="chat_a",
            space_id="space_a",
            parent_path="/notes",
            include_descendants=False,
        )
        reader.get_entry.assert_called_once_with(
            owner_chat_id="chat_a",
            space_id="space_a",
            entry_id="entry_a",
            revision=2,
        )
        reader.search_entries.assert_called_once_with(
            owner_chat_id="chat_a",
            query="needle",
            space_id="space_a",
            limit=6,
        )

    def test_owner_scoped_workspace_writes_use_unchain_without_legacy_runtime(self):
        workspace = types.SimpleNamespace(
            list_spaces=mock.Mock(
                return_value={
                    "owner_chat_id": "chat_a",
                    "spaces": [
                        {
                            "space_id": "space_a",
                            "owner_chat_id": "chat_a",
                            "revision": 1,
                        }
                    ],
                }
            ),
            create_entry=mock.Mock(
                return_value={"entry_id": "entry_a", "revision": 1}
            ),
            update_entry=mock.Mock(
                return_value={"entry_id": "entry_a", "revision": 2}
            ),
            delete_entry=mock.Mock(
                return_value={"entry_id": "entry_a", "deleted": True}
            ),
        )
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_workspace_api.open_pupu_unchain_workspace_api",
                return_value=workspace,
            ) as open_workspace,
        ):
            space = self.client.post(
                "/context/v2/memory/spaces",
                headers=self.headers,
                json={
                    "owner_chat_id": "chat_a",
                    "name": "Chat memory",
                    "operation_id": "space_a",
                },
            )
            created = self.client.post(
                "/context/v2/memory/spaces/space_a/entries",
                headers=self.headers,
                json={
                    "owner_chat_id": "chat_a",
                    "path": "/notes/a.md",
                    "kind": "file",
                    "description": "A durable note",
                    "mime_type": "text/markdown",
                    "content": "hello",
                    "source_event_id": "event_a",
                    "expected_space_revision": 1,
                    "operation_id": "entry_create_a",
                },
            )
            updated = self.client.patch(
                "/context/v2/memory/spaces/space_a/entries/entry_a",
                headers=self.headers,
                json={
                    "owner_chat_id": "chat_a",
                    "description": "Updated note",
                    "expected_revision": 1,
                    "expected_space_revision": 2,
                    "operation_id": "entry_update_a",
                },
            )
            deleted = self.client.delete(
                "/context/v2/memory/spaces/space_a/entries/entry_a",
                headers=self.headers,
                json={
                    "owner_chat_id": "chat_a",
                    "expected_revision": 2,
                    "expected_space_revision": 3,
                    "operation_id": "entry_delete_a",
                    "recursive": False,
                },
            )

        for response in (space, created, updated, deleted):
            self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(space.get_json()["space_id"], "space_a")
        self.assertEqual(open_workspace.call_count, 4)
        self.assertTrue(
            all(
                call.kwargs
                == {
                    "root_dir": (
                        Path(self.temp_dir.name) / "memory_v2"
                    ).resolve(),
                    "owner_chat_id": "chat_a",
                }
                for call in open_workspace.call_args_list
            )
        )
        workspace.list_spaces.assert_called_once_with(owner_chat_id="chat_a")
        workspace.create_entry.assert_called_once_with(
            owner_chat_id="chat_a",
            space_id="space_a",
            path="/notes/a.md",
            kind="file",
            expected_space_revision=1,
            operation_id="entry_create_a",
            description="A durable note",
            mime_type="text/markdown",
            content=b"hello",
            link_url="",
            source_event_id="event_a",
        )
        workspace.update_entry.assert_called_once_with(
            owner_chat_id="chat_a",
            space_id="space_a",
            entry_id="entry_a",
            expected_revision=1,
            expected_space_revision=2,
            operation_id="entry_update_a",
            path=None,
            description="Updated note",
            mime_type=None,
            content=None,
            link_url=None,
            source_event_id=None,
        )
        workspace.delete_entry.assert_called_once_with(
            owner_chat_id="chat_a",
            space_id="space_a",
            entry_id="entry_a",
            expected_revision=2,
            expected_space_revision=3,
            operation_id="entry_delete_a",
            recursive=False,
        )

    def test_owner_scoped_promotions_use_unchain_without_legacy_runtime(self):
        promotions = types.SimpleNamespace(
            list_promotions=mock.Mock(return_value={"promotions": []}),
            propose_promotion=mock.Mock(
                return_value={"promotion_id": "promotion_a", "status": "pending"}
            ),
            decide_promotion=mock.Mock(
                return_value={"promotion_id": "promotion_a", "status": "applied"}
            ),
        )
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_promotion_api.open_pupu_unchain_promotion_api",
                return_value=promotions,
            ) as open_promotions,
        ):
            listing = self.client.get(
                "/context/v2/memory/promotions",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_a",
                    "status": "pending",
                    "limit": 7,
                },
            )
            created = self.client.post(
                "/context/v2/memory/promotions",
                headers=self.headers,
                json={
                    "owner_chat_id": "chat_a",
                    "source_space_id": "space_a",
                    "source_entry_id": "entry_a",
                    "source_entry_revision": 2,
                    "target_path": "/facts/a.md",
                    "target_entry_id": "",
                    "expected_target_revision": None,
                    "operation_id": "promotion_create_a",
                },
            )
            decided = self.client.post(
                "/context/v2/memory/promotions/promotion_a/decision",
                headers=self.headers,
                json={
                    "owner_chat_id": "chat_a",
                    "decision": "apply",
                    "expected_revision": 1,
                    "operation_id": "promotion_apply_a",
                    "decision_reason": "confirmed by user",
                },
            )

        for response in (listing, created, decided):
            self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(open_promotions.call_count, 3)
        self.assertTrue(
            all(
                call.kwargs
                == {
                    "root_dir": (
                        Path(self.temp_dir.name) / "memory_v2"
                    ).resolve(),
                    "owner_chat_id": "chat_a",
                }
                for call in open_promotions.call_args_list
            )
        )
        promotions.list_promotions.assert_called_once_with(
            owner_chat_id="chat_a",
            status="pending",
            limit=7,
        )
        promotions.propose_promotion.assert_called_once_with(
            owner_chat_id="chat_a",
            source_space_id="space_a",
            source_entry_id="entry_a",
            source_entry_revision=2,
            target_namespace="user:local",
            target_path="/facts/a.md",
            target_entry_id="",
            expected_target_revision=None,
            operation_id="promotion_create_a",
        )
        promotions.decide_promotion.assert_called_once_with(
            owner_chat_id="chat_a",
            promotion_id="promotion_a",
            decision="apply",
            expected_revision=1,
            operation_id="promotion_apply_a",
            decision_reason="confirmed by user",
        )

    def test_owner_scoped_curator_gets_use_unchain_without_legacy_runtime(self):
        curator = types.SimpleNamespace(
            list_candidates=mock.Mock(
                return_value={"owner_chat_id": "chat_a", "candidates": []}
            ),
            list_candidate_reviews=mock.Mock(
                return_value={"owner_chat_id": "chat_a", "reviews": []}
            ),
            get_candidate_review=mock.Mock(
                return_value={"review_id": "review_a", "status": "pending"}
            ),
            list_consolidation_jobs=mock.Mock(
                return_value={"owner_chat_id": "chat_a", "jobs": []}
            ),
        )
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_curator_query."
                "open_pupu_unchain_curator_query_api",
                return_value=curator,
            ) as open_curator,
        ):
            candidates = self.client.get(
                "/context/v2/memory/candidates",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_a",
                    "status": "pending",
                    "limit": 7,
                },
            )
            reviews = self.client.get(
                "/context/v2/memory/reviews",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_a",
                    "status": "pending",
                    "limit": 8,
                },
            )
            review = self.client.get(
                "/context/v2/memory/reviews/review_a",
                headers=self.headers,
                query_string={"owner_chat_id": "chat_a"},
            )
            jobs = self.client.get(
                "/context/v2/memory/jobs",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_a",
                    "status": "leased",
                    "limit": 9,
                },
            )
            missing_owner = self.client.get(
                "/context/v2/memory/candidates",
                headers=self.headers,
            )

        for response in (candidates, reviews, review, jobs):
            self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(missing_owner.status_code, 400)
        self.assertEqual(
            missing_owner.get_json()["error"]["code"],
            "context_v2_invalid_request",
        )
        self.assertEqual(open_curator.call_count, 4)
        self.assertTrue(
            all(
                call.kwargs
                == {
                    "root_dir": (
                        Path(self.temp_dir.name) / "memory_v2"
                    ).resolve(),
                    "owner_chat_id": "chat_a",
                }
                for call in open_curator.call_args_list
            )
        )
        curator.list_candidates.assert_called_once_with(
            owner_chat_id="chat_a",
            status="pending",
            limit=7,
        )
        curator.list_candidate_reviews.assert_called_once_with(
            owner_chat_id="chat_a",
            status="pending",
            limit=8,
        )
        curator.get_candidate_review.assert_called_once_with(
            owner_chat_id="chat_a",
            review_id="review_a",
        )
        curator.list_consolidation_jobs.assert_called_once_with(
            owner_chat_id="chat_a",
            status="leased",
            limit=9,
        )

    def test_unchain_owner_review_decision_uses_only_atomic_host_adapter(self):
        decision_api = types.SimpleNamespace(
            decide_candidate_review=mock.Mock(
                return_value={
                    "review_id": "review_a",
                    "status": "applied",
                    "revision": 2,
                }
            )
        )
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_review_decision."
                "open_pupu_unchain_review_decision_api",
                return_value=decision_api,
            ) as open_decisions,
        ):
            response = self.client.post(
                "/context/v2/memory/reviews/review_a/decision",
                headers=self.headers,
                json={
                    "owner_chat_id": "chat_a",
                    "decision": "apply",
                    "expected_review_revision": 1,
                    "expected_candidate_revision": 3,
                    "expected_target_revision": 4,
                    "expected_space_revision": 5,
                    "decision_reason": "confirmed by user",
                    "operation_id": "review_decision_atomic_a",
                },
            )

        self.assertEqual(response.status_code, 200, response.get_json())
        open_decisions.assert_called_once_with(
            root_dir=(Path(self.temp_dir.name) / "memory_v2").resolve(),
            owner_chat_id="chat_a",
        )
        decision_api.decide_candidate_review.assert_called_once_with(
            owner_chat_id="chat_a",
            review_id="review_a",
            decision="apply",
            expected_review_revision=1,
            expected_candidate_revision=3,
            expected_target_revision=4,
            expected_space_revision=5,
            decision_reason="confirmed by user",
            operation_id="review_decision_atomic_a",
        )

    def test_unchain_owner_curator_mutations_fail_closed_before_legacy_open(self):
        requests = (
            self.client.post,
            self.client.post,
            self.client.post,
            self.client.post,
            self.client.post,
            self.client.post,
            self.client.post,
            self.client.post,
        )
        paths = (
            "/context/v2/memory/candidates",
            "/context/v2/memory/candidates/candidate_a/decision",
            "/context/v2/memory/reviews/review_a/decision",
            "/context/v2/memory/jobs",
            "/context/v2/memory/jobs/claim",
            "/context/v2/memory/jobs/job_a/heartbeat",
            "/context/v2/memory/jobs/job_a/complete",
            "/context/v2/memory/jobs/job_a/fail",
        )
        payloads = (
            {"owner_chat_id": "chat_a"},
            {"owner_chat_id": "chat_a", "decision": "reject"},
            {"owner_chat_id": "chat_a", "decision": "reject"},
            {"owner_chat_id": "chat_a"},
            {"owner_chat_id": "chat_a"},
            {"owner_chat_id": "chat_a"},
            {"owner_chat_id": "chat_a"},
            {"owner_chat_id": "chat_a"},
        )
        with (
            mock.patch.dict(
                os.environ,
                {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
            ),
            mock.patch.object(
                route_memory_v2,
                "_runtime",
                side_effect=AssertionError("legacy runtime must not open"),
            ),
            mock.patch(
                "memory_v2_unchain_curator_query."
                "open_pupu_unchain_curator_query_api",
                side_effect=AssertionError("mutation must fail before query open"),
            ),
        ):
            responses = [
                method(path, headers=self.headers, json=payload)
                for method, path, payload in zip(requests, paths, payloads)
            ]

        for index, response in enumerate(responses):
            expected_status = 503 if index == 2 else 409
            expected_code = (
                "context_v2_review_decision_unavailable"
                if index == 2
                else "context_v2_curator_internal_only"
            )
            self.assertEqual(response.status_code, expected_status)
            self.assertEqual(response.get_json()["error"]["code"], expected_code)

    def test_unchain_curator_query_errors_preserve_http_semantics(self):
        from memory_v2_unchain_curator_query import (
            PupuUnchainCuratorQueryError,
        )
        from unchain.persistence.sqlite_curator_query_v2 import (
            SQLiteCuratorQueryV2Error,
            SQLiteCuratorQueryV2IntegrityError,
        )

        scenarios = (
            (
                SQLiteCuratorQueryV2IntegrityError("digest_changed"),
                503,
                "context_v2_curator_integrity_unavailable",
                False,
            ),
            (
                SQLiteCuratorQueryV2Error("memory_review_scope_mismatch"),
                404,
                "context_v2_not_found",
                False,
            ),
            (
                PupuUnchainCuratorQueryError(
                    "context_v2_invalid_request",
                    "invalid status",
                    status_code=400,
                ),
                400,
                "context_v2_invalid_request",
                False,
            ),
        )
        for error, status, code, retryable in scenarios:
            curator = types.SimpleNamespace(
                get_candidate_review=mock.Mock(side_effect=error)
            )
            with (
                self.subTest(code=code),
                mock.patch.dict(
                    os.environ,
                    {CONTEXT_V2_STORE_OWNER_ENV: "unchain"},
                ),
                mock.patch.object(
                    route_memory_v2,
                    "_runtime",
                    side_effect=AssertionError("legacy runtime must not open"),
                ),
                mock.patch(
                    "memory_v2_unchain_curator_query."
                    "open_pupu_unchain_curator_query_api",
                    return_value=curator,
                ),
            ):
                response = self.client.get(
                    "/context/v2/memory/reviews/review_a",
                    headers=self.headers,
                    query_string={"owner_chat_id": "chat_a"},
                )
            self.assertEqual(response.status_code, status)
            self.assertEqual(response.get_json()["error"]["code"], code)
            self.assertEqual(
                response.get_json()["error"]["retryable"],
                retryable,
            )

    def test_candidate_review_routes_are_owner_bound_and_forward_only_cas_fields(self):
        calls = []

        class ReviewRuntime:
            def list_candidate_reviews(self, **kwargs):
                calls.append(("list", kwargs))
                return {"reviews": []}

            def get_candidate_review(self, **kwargs):
                calls.append(("get", kwargs))
                return {"review_id": kwargs["review_id"], "status": "pending"}

            def decide_candidate_review(self, **kwargs):
                calls.append(("decision", kwargs))
                return {"review_id": kwargs["review_id"], "status": "rejected"}

        runtime = ReviewRuntime()
        with mock.patch.object(route_memory_v2, "_runtime", return_value=runtime):
            listing = self.client.get(
                "/context/v2/memory/reviews",
                headers=self.headers,
                query_string={
                    "owner_chat_id": "chat_a",
                    "status": "pending",
                    "limit": 7,
                },
            )
            detail = self.client.get(
                "/context/v2/memory/reviews/review_a",
                headers=self.headers,
                query_string={"owner_chat_id": "chat_a"},
            )
            decision = self.client.post(
                "/context/v2/memory/reviews/review_a/decision",
                headers=self.headers,
                json={
                    "owner_chat_id": "chat_a",
                    "decision": "reject",
                    "expected_review_revision": 2,
                    "expected_candidate_revision": 3,
                    "expected_target_revision": 4,
                    "expected_space_revision": 5,
                    "decision_reason": "keep current",
                    "operation_id": "review_decision_a",
                    "target_namespace": "must_not_forward",
                    "content": "must_not_forward",
                },
            )

        self.assertEqual(listing.status_code, 200)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(decision.status_code, 200)
        self.assertEqual(
            calls,
            [
                (
                    "list",
                    {
                        "owner_chat_id": "chat_a",
                        "status": "pending",
                        "limit": 7,
                    },
                ),
                (
                    "get",
                    {"owner_chat_id": "chat_a", "review_id": "review_a"},
                ),
                (
                    "decision",
                    {
                        "owner_chat_id": "chat_a",
                        "review_id": "review_a",
                        "decision": "reject",
                        "expected_review_revision": 2,
                        "expected_candidate_revision": 3,
                        "expected_target_revision": 4,
                        "expected_space_revision": 5,
                        "decision_reason": "keep current",
                        "operation_id": "review_decision_a",
                    },
                ),
            ],
        )
        self.assertEqual(
            self.client.get("/context/v2/memory/reviews").status_code,
            401,
        )


if __name__ == "__main__":
    unittest.main()
