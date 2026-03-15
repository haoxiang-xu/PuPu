import sys
import unittest
import json
import tempfile
import types
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
                "get_embedding_provider_catalog",
                return_value={
                    "openai": ["text-embedding-3-small"],
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
        self.assertEqual(payload["providers"]["openai"], ["gpt-5"])
        self.assertEqual(
            payload["embedding_providers"]["openai"],
            ["text-embedding-3-small"],
        )

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
                "get_embedding_provider_catalog",
                return_value={
                    "openai": ["text-embedding-3-large", "text-embedding-3-small"],
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
        self.assertEqual(
            payload["embedding_providers"]["openai"],
            ["text-embedding-3-large", "text-embedding-3-small"],
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

    def test_chat_tool_confirmation_accepts_pending_confirmation(self) -> None:
        with mock.patch.object(
            miso_routes,
            "submit_tool_confirmation",
            return_value=True,
        ) as submit_mock:
            response = self.client.post(
                "/chat/tool/confirmation",
                json={
                    "confirmation_id": "confirm-1",
                    "approved": True,
                    "reason": "looks good",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})
        submit_mock.assert_called_once_with(
            confirmation_id="confirm-1",
            approved=True,
            reason="looks good",
            modified_arguments=None,
        )

    def test_chat_tool_confirmation_returns_not_found_when_missing(self) -> None:
        with mock.patch.object(
            miso_routes,
            "submit_tool_confirmation",
            return_value=False,
        ):
            response = self.client.post(
                "/chat/tool/confirmation",
                json={
                    "confirmation_id": "missing-id",
                    "approved": False,
                },
            )

        self.assertEqual(response.status_code, 404)
        payload = response.get_json()
        self.assertEqual(payload["error"]["code"], "not_found")

    def test_chat_tool_confirmation_validates_payload(self) -> None:
        missing_id_response = self.client.post(
            "/chat/tool/confirmation",
            json={
                "approved": True,
            },
        )
        self.assertEqual(missing_id_response.status_code, 400)
        self.assertEqual(
            missing_id_response.get_json()["error"]["message"],
            "confirmation_id is required",
        )

        invalid_modified_arguments_response = self.client.post(
            "/chat/tool/confirmation",
            json={
                "confirmation_id": "confirm-2",
                "approved": True,
                "modified_arguments": "not-a-dict",
            },
        )
        self.assertEqual(invalid_modified_arguments_response.status_code, 400)
        self.assertEqual(
            invalid_modified_arguments_response.get_json()["error"]["message"],
            "modified_arguments must be an object when provided",
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
                {
                    "type": "stream_summary",
                    "run_id": "run-1",
                    "iteration": 1,
                    "timestamp": 1700000000.5,
                    "bundle": {
                        "consumed_tokens": 21,
                        "max_context_window_tokens": 128000,
                        "context_window_used_pct": 3.5,
                    },
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
        self.assertNotIn("stream_summary", event_types)
        done_frame = next(frame for frame in frames if frame.get("type") == "done")
        self.assertNotIn("usage", done_frame.get("payload", {}))
        self.assertEqual(
            done_frame.get("payload", {}).get("bundle", {}).get("consumed_tokens"),
            21,
        )

    def test_chat_stream_v2_sets_confirmation_cancel_event_on_generator_exit(self) -> None:
        captured_cancel_event = {"value": None}

        def fake_stream_chat_events(**kwargs):
            captured_cancel_event["value"] = kwargs.get("cancel_event")
            raise GeneratorExit()
            yield  # pragma: no cover

        with mock.patch.object(
            miso_routes,
            "stream_chat_events",
            side_effect=fake_stream_chat_events,
        ):
            response = self.client.post(
                "/chat/stream/v2",
                json={
                    "message": "hello",
                    "history": [],
                    "options": {"modelId": "openai:gpt-5"},
                },
            )
            _payload_text = response.get_data(as_text=True)

        self.assertEqual(response.status_code, 200)
        cancel_event = captured_cancel_event["value"]
        self.assertIsNotNone(cancel_event)
        self.assertTrue(hasattr(cancel_event, "is_set"))
        self.assertTrue(cancel_event.is_set())

    def test_chat_stream_v2_preserves_memory_unavailable_error_code(self) -> None:
        with mock.patch.object(
            miso_routes,
            "stream_chat_events",
            return_value=iter(
                [
                    {
                        "type": "error",
                        "run_id": "",
                        "iteration": 0,
                        "timestamp": 1700000000.0,
                        "code": "memory_unavailable",
                        "message": "Memory is enabled but unavailable for this request",
                    }
                ]
            ),
        ):
            response = self.client.post(
                "/chat/stream/v2",
                json={
                    "message": "hello",
                    "history": [],
                    "options": {"modelId": "openai:gpt-5"},
                },
            )
            payload_text = response.get_data(as_text=True)

        self.assertEqual(response.status_code, 200)
        self.assertIn('"code": "memory_unavailable"', payload_text)

    def test_memory_projection_paginates_scroll_results(self) -> None:
        point_one = types.SimpleNamespace(
            id="p1",
            vector=[1.0, 0.0, 0.0],
            payload={
                "text": [
                    {"role": "user", "content": "hello"},
                    {"role": "assistant", "content": "hi"},
                ],
                "turn_start_index": 0,
                "turn_end_index": 1,
            },
        )
        point_two = types.SimpleNamespace(
            id="p2",
            vector=[0.0, 1.0, 0.0],
            payload={
                "conversation": [
                    {"role": "user", "content": [{"type": "text", "text": "next"}]},
                ],
                "turn_start_index": 2,
                "turn_end_index": 3,
            },
        )

        class FakeClient:
            def __init__(self) -> None:
                self.calls = []

            def scroll(self, **kwargs):
                self.calls.append(kwargs)
                if len(self.calls) == 1:
                    return [point_one], "offset-1"
                if len(self.calls) == 2:
                    return [point_two], None
                return [], None

        fake_client = FakeClient()
        fake_memory_factory = types.SimpleNamespace(
            _data_dir=lambda: "/tmp/memory",
            _normalize_data_dir=lambda value: value,
            _get_or_create_qdrant_client=lambda _data_dir: fake_client,
        )

        with mock.patch.dict(sys.modules, {"memory_factory": fake_memory_factory}):
            response = self.client.get("/memory/projection?session_id=chat-1")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(len(payload["points"]), 2)
        self.assertEqual(fake_client.calls[1].get("offset"), "offset-1")
        point_texts = [point["text"] for point in payload["points"]]
        self.assertTrue(any("user: hello" in text for text in point_texts))
        self.assertTrue(any("user: next" in text for text in point_texts))

    def test_memory_projection_skips_non_finite_vectors(self) -> None:
        bad_point = types.SimpleNamespace(
            id="bad-1",
            vector=[float("nan"), 1.0, 2.0],
            payload={"text": "user: broken"},
        )

        class FakeClient:
            def scroll(self, **_kwargs):
                return [bad_point], None

        fake_client = FakeClient()
        fake_memory_factory = types.SimpleNamespace(
            _data_dir=lambda: "/tmp/memory",
            _normalize_data_dir=lambda value: value,
            _get_or_create_qdrant_client=lambda _data_dir: fake_client,
        )

        with mock.patch.dict(sys.modules, {"memory_factory": fake_memory_factory}):
            response = self.client.get("/memory/projection?session_id=chat-1")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["points"], [])
        self.assertEqual(payload["variance"], [0.0, 0.0])

    def test_long_term_memory_projection_includes_profile_documents_without_vectors(self) -> None:
        with tempfile.TemporaryDirectory() as data_dir:
            profiles_dir = Path(data_dir) / "memory" / "long_term_profiles"
            profiles_dir.mkdir(parents=True, exist_ok=True)
            profile_path = profiles_dir / "pupu_default.json"
            profile_document = {
                "preferences": {
                    "tone": "concise",
                    "language": "zh-CN",
                }
            }
            profile_path.write_text(
                json.dumps(profile_document, ensure_ascii=False),
                encoding="utf-8",
            )

            fake_client = types.SimpleNamespace(
                get_collections=lambda: types.SimpleNamespace(collections=[]),
            )
            fake_memory_factory = types.SimpleNamespace(
                _data_dir=lambda: data_dir,
                _normalize_data_dir=lambda value: value,
                _get_or_create_qdrant_client=lambda _data_dir: fake_client,
            )

            with mock.patch.dict(sys.modules, {"memory_factory": fake_memory_factory}):
                response = self.client.get("/memory/long-term/projection")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["points"], [])
        self.assertEqual(payload["profile_count"], 1)
        self.assertGreater(payload["profile_total_bytes"], 0)
        self.assertEqual(payload["profiles"][0]["storage_key"], "pupu_default")
        self.assertEqual(payload["profiles"][0]["document"], profile_document)

    def test_long_term_memory_projection_tolerates_empty_cluster_labels(self) -> None:
        with tempfile.TemporaryDirectory() as data_dir:
            point_one = types.SimpleNamespace(
                id="lt-1",
                vector=[1.0, 0.0, 0.0],
                payload={"text": "first memory"},
            )
            point_two = types.SimpleNamespace(
                id="lt-2",
                vector=[0.0, 1.0, 0.0],
                payload={"text": "second memory"},
            )

            class FakeClient:
                def get_collections(self):
                    return types.SimpleNamespace(
                        collections=[types.SimpleNamespace(name="long_term_legacy")]
                    )

                def scroll(self, **_kwargs):
                    return [point_one, point_two], None

            fake_client = FakeClient()
            fake_memory_factory = types.SimpleNamespace(
                _data_dir=lambda: data_dir,
                _normalize_data_dir=lambda value: value,
                _get_or_create_qdrant_client=lambda _data_dir: fake_client,
            )

            with (
                mock.patch.dict(sys.modules, {"memory_factory": fake_memory_factory}),
                mock.patch.object(miso_routes, "_kmeans_2d_numpy", return_value=[]),
            ):
                response = self.client.get("/memory/long-term/projection")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(len(payload["points"]), 2)
        self.assertEqual(
            [point["group"] for point in payload["points"]],
            ["Cluster 1", "Cluster 1"],
        )

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

    def test_chat_stream_v2_accepts_system_prompt_v2_options(self) -> None:
        with mock.patch.object(
            miso_routes,
            "stream_chat_events",
            return_value=iter(
                [
                    {
                        "type": "final_message",
                        "run_id": "run-1",
                        "iteration": 0,
                        "timestamp": 1700000000.0,
                        "content": "hello",
                    }
                ]
            ),
        ) as stream_mock:
            response = self.client.post(
                "/chat/stream/v2",
                json={
                    "message": "hello",
                    "options": {
                        "modelId": "openai:gpt-5",
                        "system_prompt_v2": {
                            "enabled": True,
                            "defaults": {
                                "personality": "Helpful",
                                "rules": "No hallucinations",
                            },
                            "overrides": {
                                "personally": "Direct",
                            },
                        },
                    },
                },
            )
            payload_text = response.get_data(as_text=True)

        self.assertEqual(response.status_code, 200)
        self.assertIn("event: frame", payload_text)
        stream_mock.assert_called_once()
        options = stream_mock.call_args.kwargs.get("options", {})
        self.assertIn("system_prompt_v2", options)

    def test_replace_memory_session_returns_memory_factory_payload(self) -> None:
        expected_payload = {
            "applied": True,
            "session_id": "chat-1",
            "stored_message_count": 2,
            "vector_applied": True,
            "vector_indexed_count": 1,
            "vector_indexed_until": 2,
            "vector_fallback_reason": "",
        }

        fake_memory_factory = types.SimpleNamespace(
            replace_short_term_session_memory=mock.Mock(return_value=expected_payload)
        )

        with mock.patch.dict(sys.modules, {"memory_factory": fake_memory_factory}):
            response = self.client.post(
                "/memory/session/replace",
                json={
                    "session_id": "chat-1",
                    "messages": [
                        {"role": "user", "content": "u1"},
                        {"role": "assistant", "content": "a1"},
                    ],
                    "options": {"modelId": "openai:gpt-5"},
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), expected_payload)
        fake_memory_factory.replace_short_term_session_memory.assert_called_once_with(
            session_id="chat-1",
            messages=[
                {"role": "user", "content": "u1"},
                {"role": "assistant", "content": "a1"},
            ],
            options={"modelId": "openai:gpt-5"},
        )

    def test_replace_memory_session_requires_messages_array(self) -> None:
        response = self.client.post(
            "/memory/session/replace",
            json={
                "session_id": "chat-1",
                "messages": "invalid",
            },
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertEqual(payload["error"]["code"], "invalid_request")
        self.assertEqual(payload["error"]["message"], "messages must be an array")


if __name__ == "__main__":
    unittest.main()
