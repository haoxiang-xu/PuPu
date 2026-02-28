import sys
import unittest
import json
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import app as miso_app  # noqa: E402
import routes as miso_routes  # noqa: E402


class ModelsCatalogRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = miso_app.create_app().test_client()

    def test_models_catalog_includes_model_capabilities(self) -> None:
        with (
            mock.patch.object(
                miso_routes,
                "get_runtime_config",
                return_value={"provider": "openai", "model": "gpt-5"},
            ),
            mock.patch.object(
                miso_routes,
                "get_capability_catalog",
                return_value={
                    "openai": ["gpt-5"],
                    "anthropic": [],
                    "ollama": [],
                },
            ),
            mock.patch.object(
                miso_routes,
                "get_model_capability_catalog",
                return_value={
                    "openai:gpt-5": {
                        "input_modalities": ["text", "image"],
                        "input_source_types": {"image": ["url"]},
                    }
                },
            ),
        ):
            response = self.client.get("/models/catalog")

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["active"]["model_id"], "openai:gpt-5")
        self.assertEqual(
            payload["active"]["capabilities"],
            {
                "input_modalities": ["text", "image"],
                "input_source_types": {"image": ["url"]},
            },
        )
        self.assertIn("model_capabilities", payload)
        self.assertIn("openai:gpt-5", payload["model_capabilities"])

    def test_models_catalog_falls_back_to_text_only_for_unknown_active_model(self) -> None:
        with (
            mock.patch.object(
                miso_routes,
                "get_runtime_config",
                return_value={"provider": "openai", "model": "unknown-model"},
            ),
            mock.patch.object(
                miso_routes,
                "get_capability_catalog",
                return_value={
                    "openai": ["gpt-5"],
                    "anthropic": [],
                    "ollama": [],
                },
            ),
            mock.patch.object(
                miso_routes,
                "get_model_capability_catalog",
                return_value={
                    "openai:gpt-5": {
                        "input_modalities": ["text", "image", "pdf"],
                        "input_source_types": {"image": ["url", "base64"]},
                    }
                },
            ),
        ):
            response = self.client.get("/models/catalog")

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["active"]["model_id"], "openai:unknown-model")
        self.assertEqual(
            payload["active"]["capabilities"],
            {
                "input_modalities": ["text"],
                "input_source_types": {},
            },
        )

    def test_chat_stream_allows_attachments_without_message(self) -> None:
        with mock.patch.object(
            miso_routes,
            "stream_chat",
            return_value=iter(["hello"]),
        ) as stream_chat_mock:
            response = self.client.post(
                "/chat/stream",
                json={
                    "message": "",
                    "history": [
                        {
                            "role": "user",
                            "content": "Previous question",
                        }
                    ],
                    "attachments": [
                        {
                            "type": "pdf",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": "abc",
                                "filename": "demo.pdf",
                            },
                        }
                    ],
                    "options": {
                        "modelId": "openai:gpt-5",
                    },
                },
            )
            payload_text = response.get_data(as_text=True)

        self.assertEqual(response.status_code, 200)
        self.assertIn("event: token", payload_text)
        stream_chat_mock.assert_called_once()
        self.assertEqual(stream_chat_mock.call_args.kwargs["message"], "")
        self.assertEqual(
            stream_chat_mock.call_args.kwargs["attachments"],
            [
                {
                    "type": "pdf",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": "abc",
                        "filename": "demo.pdf",
                    },
                }
            ],
        )

    def test_chat_stream_requires_message_or_attachments(self) -> None:
        response = self.client.post(
            "/chat/stream",
            json={
                "message": "  ",
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

    def test_chat_stream_v2_emits_trace_frames(self) -> None:
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
                    "type": "tool_call",
                    "run_id": "run-1",
                    "iteration": 0,
                    "timestamp": 1700000000.1,
                    "tool_name": "read_file",
                    "call_id": "call-1",
                    "arguments": {"path": "/tmp/demo.txt"},
                },
                {
                    "type": "tool_result",
                    "run_id": "run-1",
                    "iteration": 0,
                    "timestamp": 1700000000.2,
                    "tool_name": "read_file",
                    "call_id": "call-1",
                    "result": {"content": "demo"},
                },
                {
                    "type": "token_delta",
                    "run_id": "run-1",
                    "iteration": 1,
                    "timestamp": 1700000000.3,
                    "delta": "hello",
                },
                {
                    "type": "final_message",
                    "run_id": "run-1",
                    "iteration": 1,
                    "timestamp": 1700000000.4,
                    "content": "hello",
                },
            ]
        )

        with mock.patch.object(
            miso_routes,
            "stream_chat_events",
            return_value=mocked_events,
        ):
            response = self.client.post(
                "/chat/stream/v2",
                json={
                    "message": "hello",
                    "history": [],
                    "options": {"modelId": "openai:gpt-5"},
                    "trace_level": "minimal",
                },
            )
            payload_text = response.get_data(as_text=True)

        self.assertEqual(response.status_code, 200)
        self.assertIn("event: frame", payload_text)

        frames = []
        for block in payload_text.split("\n\n"):
            lines = [line for line in block.splitlines() if line.strip()]
            event_name = ""
            data_text = ""
            for line in lines:
                if line.startswith("event:"):
                    event_name = line.split(":", 1)[1].strip()
                if line.startswith("data:"):
                    data_text = line.split(":", 1)[1].strip()
            if event_name == "frame" and data_text:
                frames.append(json.loads(data_text))

        self.assertGreaterEqual(len(frames), 2)
        event_types = [frame.get("type") for frame in frames]
        self.assertIn("stream_started", event_types)
        self.assertIn("run_started", event_types)
        self.assertIn("tool_call", event_types)
        self.assertIn("tool_result", event_types)
        self.assertIn("token_delta", event_types)
        self.assertIn("final_message", event_types)
        self.assertIn("done", event_types)

    def test_chat_stream_v2_requires_message_or_attachments(self) -> None:
        response = self.client.post(
            "/chat/stream/v2",
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


if __name__ == "__main__":
    unittest.main()
