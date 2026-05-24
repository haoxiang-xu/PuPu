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


class ChatStreamV3RouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = miso_app.create_app().test_client()

    def test_chat_stream_v3_requires_message_or_attachments(self) -> None:
        response = self.client.post(
            "/chat/stream/v3",
            json={
                "message": " ",
                "attachments": [],
            },
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertEqual(payload["error"]["code"], "invalid_request")
        self.assertEqual(
            payload["error"]["message"],
            "message or attachments is required",
        )

    def test_chat_stream_v3_emits_runtime_events_and_done(self) -> None:
        mocked_events = iter(
            [
                {
                    "type": "run_started",
                    "run_id": "run-1",
                    "iteration": 0,
                    "timestamp": 1700000000.0,
                    "provider": "openai",
                    "model": "gpt-5",
                },
                {
                    "type": "iteration_started",
                    "run_id": "run-1",
                    "iteration": 0,
                    "timestamp": 1700000000.1,
                },
                {
                    "type": "token_delta",
                    "run_id": "run-1",
                    "iteration": 0,
                    "timestamp": 1700000000.2,
                    "provider": "openai",
                    "delta": "hi",
                    "accumulated_text": "hi",
                },
                {
                    "type": "tool_call",
                    "run_id": "run-1",
                    "iteration": 0,
                    "timestamp": 1700000000.3,
                    "tool_name": "read_file",
                    "call_id": "call-1",
                    "arguments": {"path": "README.md"},
                },
                {
                    "type": "tool_result",
                    "run_id": "run-1",
                    "iteration": 0,
                    "timestamp": 1700000000.4,
                    "tool_name": "read_file",
                    "call_id": "call-1",
                    "result": {"content": "hello"},
                },
                {
                    "type": "final_message",
                    "run_id": "run-1",
                    "iteration": 0,
                    "timestamp": 1700000000.5,
                    "content": "done",
                },
                {
                    "type": "run_completed",
                    "run_id": "run-1",
                    "iteration": 0,
                    "timestamp": 1700000000.6,
                    "status": "completed",
                },
            ]
        )

        with mock.patch.object(
            miso_routes,
            "stream_chat_events",
            return_value=mocked_events,
        ):
            response = self.client.post(
                "/chat/stream/v3",
                json={
                    "message": "hello",
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
        self.assertGreaterEqual(len(runtime_events), 8)
        self.assertTrue(
            all(event.get("schema_version") == "v3" for event in runtime_events)
        )
        self.assertEqual(runtime_events[0]["type"], "session.started")

        event_types = [event["type"] for event in runtime_events]
        self.assertIn("run.started", event_types)
        self.assertIn("turn.started", event_types)
        self.assertIn("model.delta", event_types)
        self.assertIn("tool.started", event_types)
        self.assertIn("tool.completed", event_types)
        self.assertIn("model.completed", event_types)
        self.assertIn("run.completed", event_types)

        tool_started = next(event for event in runtime_events if event["type"] == "tool.started")
        self.assertEqual(tool_started["links"]["tool_call_id"], "call-1")
        self.assertEqual(tool_started["payload"]["arguments"], {"path": "README.md"})

    def test_chat_stream_v3_emits_run_failed_for_stream_exception(self) -> None:
        def failing_stream_chat_events(**_kwargs):
            yield {
                "type": "run_started",
                "run_id": "run-1",
                "iteration": 0,
                "timestamp": 1700000000.0,
            }
            raise RuntimeError("boom")

        with mock.patch.object(
            miso_routes,
            "stream_chat_events",
            side_effect=failing_stream_chat_events,
        ):
            response = self.client.post(
                "/chat/stream/v3",
                json={
                    "message": "hello",
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
        self.assertEqual(failed["payload"]["error"]["message"], "boom")
        self.assertEqual(failed["payload"]["error"]["code"], "stream_failed")
