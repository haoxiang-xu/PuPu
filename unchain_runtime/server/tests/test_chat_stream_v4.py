import json
import sys
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import app as miso_app  # noqa: E402
import routes as miso_routes  # noqa: E402


def _parse_sse_blocks(payload_text: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for block in payload_text.split("\n\n"):
        lines = [line for line in block.splitlines() if line.strip()]
        event_name = ""
        data_text = ""
        for line in lines:
            if line.startswith("event:"):
                event_name = line.split(":", 1)[1].strip()
            if line.startswith("data:"):
                data_text = line.split(":", 1)[1].strip()
        if event_name and data_text:
            events.append((event_name, json.loads(data_text)))
    return events


class ChatStreamV4RouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = miso_app.create_app().test_client()

    def test_chat_stream_v4_requires_message_or_attachments(self) -> None:
        response = self.client.post(
            "/chat/stream/v4",
            json={
                "message": " ",
                "attachments": [],
                "attempt_id": "attempt-empty-message",
            },
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertEqual(payload["error"]["code"], "invalid_request")

    def test_chat_stream_v4_requires_attempt_id_fail_closed(self) -> None:
        response = self.client.post(
            "/chat/stream/v4",
            json={"message": "hello", "threadId": "chat-1"},
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertEqual(payload["error"]["code"], "invalid_request")
        self.assertIn("attempt_id", payload["error"]["message"])

    def test_pending_interaction_lookup_returns_normal_none_response(self) -> None:
        with mock.patch.object(
            miso_routes,
            "get_pending_interaction",
            return_value={"status": "none", "session_id": "chat-1"},
        ) as lookup:
            response = self.client.get(
                "/chat/interactions/pending?session_id=chat-1"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"status": "none", "session_id": "chat-1"},
        )
        lookup.assert_called_once_with("chat-1")

    def test_execution_cancel_route_forwards_exact_attempt_and_is_idempotent(self) -> None:
        result = {
            "status": "ok",
            "execution_id": "chat-1",
            "attempt_id": "attempt-1",
            "disposition": "unchanged",
            "state": "cancelled",
            "cancellation": {"reason": "user_stop"},
        }
        with mock.patch.object(
            miso_routes,
            "cancel_chat_execution",
            return_value=result,
        ) as cancel:
            response = self.client.post(
                "/chat/executions/cancel",
                json={
                    "execution_id": "chat-1",
                    "attempt_id": "attempt-1",
                    "reason": "user_stop",
                    "idempotency_key": "stop:chat-1:attempt-1",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), result)
        cancel.assert_called_once_with(
            session_id="chat-1",
            attempt_id="attempt-1",
            source_attempt_id="",
            reason="user_stop",
        )

    def test_execution_cancel_route_requires_both_identifiers(self) -> None:
        with mock.patch.object(miso_routes, "cancel_chat_execution") as cancel:
            response = self.client.post(
                "/chat/executions/cancel",
                json={"execution_id": "chat-1"},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("attempt_id", response.get_json()["error"]["message"])
        cancel.assert_not_called()

    def test_confirmation_persists_receipt_before_waking_live_waiter(self) -> None:
        call_order = []
        with mock.patch.object(
            miso_routes,
            "submit_tool_confirmation",
            side_effect=lambda **_kwargs: call_order.append("live") or True,
        ) as live_submit, mock.patch.object(
            miso_routes,
            "record_interaction_receipt",
            side_effect=lambda **_kwargs: call_order.append("durable")
            or {
                "status": "ok",
                "disposition": "receipt_recorded",
                "session_id": "chat-1",
                "interaction_id": "interaction-1",
                "receipt_id": "receipt-1",
            },
        ) as durable_submit:
            response = self.client.post(
                "/chat/tool/confirmation",
                json={
                    "confirmation_id": "interaction-1",
                    "session_id": "chat-1",
                    "approved": True,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["disposition"], "live_continues")
        self.assertTrue(response.get_json()["durable"])
        self.assertEqual(call_order, ["durable", "live"])
        live_submit.assert_called_once()
        durable_submit.assert_called_once()

    def test_confirmation_requires_a_json_boolean_decision(self) -> None:
        with mock.patch.object(
            miso_routes,
            "record_interaction_receipt",
        ) as durable_submit, mock.patch.object(
            miso_routes,
            "submit_tool_confirmation",
        ) as live_submit:
            response = self.client.post(
                "/chat/tool/confirmation",
                json={
                    "confirmation_id": "interaction-1",
                    "session_id": "chat-1",
                    "approved": "false",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "invalid_request")
        self.assertIn("boolean", response.get_json()["error"]["message"])
        durable_submit.assert_not_called()
        live_submit.assert_not_called()

    def test_confirmation_labels_non_durable_live_fallback_explicitly(self) -> None:
        not_found = miso_routes.DurableInteractionHostError(
            "interaction_not_found",
            "missing",
            status_code=404,
        )
        with mock.patch.object(
            miso_routes,
            "record_interaction_receipt",
            side_effect=not_found,
        ), mock.patch.object(
            miso_routes,
            "submit_tool_confirmation",
            return_value=True,
        ):
            response = self.client.post(
                "/chat/tool/confirmation",
                json={
                    "confirmation_id": "legacy-live-1",
                    "session_id": "chat-1",
                    "approved": True,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["disposition"], "live_only")
        self.assertFalse(response.get_json()["durable"])

    def test_confirmation_exposes_retryable_durable_store_conflict(self) -> None:
        busy = miso_routes.DurableInteractionHostError(
            "active_execution_lease",
            "busy",
            status_code=409,
            retryable=True,
        )
        with mock.patch.object(
            miso_routes,
            "record_interaction_receipt",
            side_effect=busy,
        ), mock.patch.object(
            miso_routes,
            "submit_tool_confirmation",
        ) as live_submit:
            response = self.client.post(
                "/chat/tool/confirmation",
                json={
                    "confirmation_id": "interaction-1",
                    "session_id": "chat-1",
                    "approved": True,
                },
            )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["error"]["code"], "active_execution_lease")
        self.assertTrue(response.get_json()["error"]["retryable"])
        live_submit.assert_not_called()

    def test_confirmation_records_durable_receipt_when_live_waiter_is_gone(self) -> None:
        with mock.patch.object(
            miso_routes,
            "submit_tool_confirmation",
            return_value=False,
        ), mock.patch.object(
            miso_routes,
            "record_interaction_receipt",
            return_value={
                "status": "ok",
                "disposition": "receipt_recorded",
                "session_id": "chat-1",
                "interaction_id": "interaction-1",
                "receipt_id": "receipt-1",
            },
        ) as durable_submit:
            response = self.client.post(
                "/chat/tool/confirmation",
                json={
                    "confirmation_id": "interaction-1",
                    "session_id": "chat-1",
                    "approved": False,
                    "reason": "no",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["disposition"], "receipt_recorded")
        durable_submit.assert_called_once_with(
            session_id="chat-1",
            interaction_id="interaction-1",
            approved=False,
            reason="no",
            modified_arguments=None,
        )

    def test_chat_stream_v3_route_is_not_registered(self) -> None:
        response = self.client.post(
            "/chat/stream/v3",
            json={"message": "hello"},
        )

        self.assertEqual(response.status_code, 404)

    def test_chat_stream_v4_emits_v4_runtime_events_and_done(self) -> None:
        mocked_events = iter(
            [
                {
                    "type": "run_started",
                    "run_id": "run-1",
                    "iteration": 0,
                    "provider": "openai",
                    "model": "gpt-5",
                },
                {
                    "type": "tool_call",
                    "run_id": "run-1",
                    "iteration": 0,
                    "tool_name": "read",
                    "call_id": "call-1",
                    "arguments": {"path": "README.md"},
                },
                {
                    "type": "tool_result",
                    "run_id": "run-1",
                    "iteration": 0,
                    "tool_name": "read",
                    "call_id": "call-1",
                    "result": {"content": "hello"},
                },
                {
                    "type": "artifact_created",
                    "run_id": "run-1",
                    "iteration": 0,
                    "artifact": {
                        "schema_version": "unchain.artifact.v1",
                        "artifact_id": "workspace_change_set:run-1",
                        "kind": "workspace_change_set",
                        "title": "Workspace changes",
                        "snapshot": {"change_set_id": "wcs_run-1"},
                        "presentation": {"surface": "run_summary", "group": "files"},
                    },
                },
                {
                    "type": "final_message",
                    "run_id": "run-1",
                    "iteration": 0,
                    "content": "done",
                },
                {
                    "type": "run_completed",
                    "run_id": "run-1",
                    "iteration": 0,
                    "status": "completed",
                },
            ]
        )

        with mock.patch.object(
            miso_routes,
            "stream_chat_events",
            return_value=mocked_events,
        ) as stream_events:
            response = self.client.post(
                "/chat/stream/v4",
                json={
                    "message": "hello",
                    "attempt_id": "attempt-v4-events",
                    "history": [],
                    "options": {"modelId": "openai:gpt-5"},
                    "trace_level": "minimal",
                },
            )
            payload_text = response.get_data(as_text=True)

        self.assertEqual(response.status_code, 200)
        sse_events = _parse_sse_blocks(payload_text)
        runtime_events = [
            payload for event_name, payload in sse_events if event_name == "runtime_event"
        ]
        transport_events = [event_name for event_name, _payload in sse_events]

        self.assertIn("done", transport_events)
        self.assertEqual(runtime_events[0]["run_id"], "attempt-v4-events")
        self.assertEqual(
            stream_events.call_args.kwargs["attempt_id"],
            "attempt-v4-events",
        )
        self.assertTrue(
            all(event.get("schema_version") == "v4" for event in runtime_events)
        )
        self.assertEqual(runtime_events[0]["type"], "session.started")
        self.assertEqual([event["seq"] for event in runtime_events], list(range(1, len(runtime_events) + 1)))

        event_types = [event["type"] for event in runtime_events]
        self.assertIn("step.started", event_types)
        self.assertIn("step.completed", event_types)
        self.assertIn("artifact.created", event_types)
        self.assertIn("run.completed", event_types)

        run_artifact = next(event for event in runtime_events if event["type"] == "artifact.created")
        self.assertEqual(run_artifact["surface"]["slot"], "run_summary")
        self.assertEqual(run_artifact["surface"]["scope"], "run")
        self.assertEqual(run_artifact["links"]["workspace_change_set_id"], "wcs_run-1")

    def test_chat_stream_v4_resume_mode_allows_empty_message(self) -> None:
        mocked_events = iter(
            [
                {
                    "type": "final_message",
                    "run_id": "run-resumed",
                    "iteration": 2,
                    "content": "resumed",
                },
                {
                    "type": "run_completed",
                    "run_id": "run-resumed",
                    "iteration": 2,
                    "status": "completed",
                },
            ]
        )
        with mock.patch.object(
            miso_routes,
            "resume_chat_interaction_events",
            return_value=mocked_events,
        ) as resume_events, mock.patch.object(
            miso_routes,
            "stream_chat_events",
        ) as fresh_events:
            response = self.client.post(
                "/chat/stream/v4",
                json={
                    "mode": "resume_interaction",
                    "attempt_id": "attempt-v4-resume",
                    "source_attempt_id": "attempt-v4-source",
                    "threadId": "chat-1",
                    "interaction_id": "interaction-1",
                    "options": {"modelId": "openai:gpt-5"},
                },
            )
            payload_text = response.get_data(as_text=True)

        self.assertEqual(response.status_code, 200)
        resume_events.assert_called_once()
        self.assertEqual(
            resume_events.call_args.kwargs["session_id"],
            "chat-1",
        )
        self.assertEqual(
            resume_events.call_args.kwargs["interaction_id"],
            "interaction-1",
        )
        self.assertEqual(
            resume_events.call_args.kwargs["attempt_id"],
            "attempt-v4-resume",
        )
        self.assertEqual(
            resume_events.call_args.kwargs["source_attempt_id"],
            "attempt-v4-source",
        )
        fresh_events.assert_not_called()
        event_types = [
            payload.get("type")
            for event_name, payload in _parse_sse_blocks(payload_text)
            if event_name == "runtime_event"
        ]
        self.assertIn("run.completed", event_types)
        self.assertIn("done", [name for name, _ in _parse_sse_blocks(payload_text)])

    def test_chat_stream_v4_resume_mode_requires_existing_thread_id(self) -> None:
        with mock.patch.object(
            miso_routes,
            "resume_chat_interaction_events",
        ) as resume_events:
            response = self.client.post(
                "/chat/stream/v4",
                json={
                    "mode": "resume_interaction",
                    "attempt_id": "attempt-v4-missing-thread",
                    "interaction_id": "interaction-1",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "invalid_request")
        resume_events.assert_not_called()

    def test_chat_stream_v4_emits_run_failed_for_stream_exception(self) -> None:
        def failing_stream_chat_events(**_kwargs):
            yield {
                "type": "run_started",
                "run_id": "run-1",
                "iteration": 0,
            }
            raise RuntimeError("boom")

        with mock.patch.object(
            miso_routes,
            "stream_chat_events",
            side_effect=failing_stream_chat_events,
        ):
            response = self.client.post(
                "/chat/stream/v4",
                json={
                    "message": "hello",
                    "attempt_id": "attempt-v4-error",
                    "history": [],
                    "options": {"modelId": "openai:gpt-5"},
                },
            )
            payload_text = response.get_data(as_text=True)

        self.assertEqual(response.status_code, 200)
        runtime_events = [
            payload
            for event_name, payload in _parse_sse_blocks(payload_text)
            if event_name == "runtime_event"
        ]

        failed = next(event for event in runtime_events if event["type"] == "run.failed")
        self.assertEqual(failed["schema_version"], "v4")
        self.assertEqual(failed["payload"]["error"]["message"], "boom")
        self.assertEqual(failed["payload"]["error"]["code"], "stream_failed")


if __name__ == "__main__":
    unittest.main()
