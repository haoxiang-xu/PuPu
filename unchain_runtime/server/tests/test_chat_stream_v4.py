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
            },
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertEqual(payload["error"]["code"], "invalid_request")

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
        ):
            response = self.client.post(
                "/chat/stream/v4",
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
