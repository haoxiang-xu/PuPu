import copy
import os
import sys
import tempfile
import threading
import time
import types
import unittest
import uuid
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import memory_factory  # noqa: E402


class MemoryFactoryTests(unittest.TestCase):
    def setUp(self) -> None:
        memory_factory._qdrant_clients.clear()

    def tearDown(self) -> None:
        memory_factory._qdrant_clients.clear()

    def test_get_or_create_qdrant_client_is_thread_safe_singleton(self) -> None:
        class FakeQdrantClient:
            init_count = 0

            def __init__(self, path: str) -> None:
                type(self).init_count += 1
                # Make creation slow enough to expose races.
                time.sleep(0.05)
                self.path = path

        fake_module = types.SimpleNamespace(QdrantClient=FakeQdrantClient)
        worker_count = 6
        start_barrier = threading.Barrier(worker_count)
        results = []
        errors = []

        with tempfile.TemporaryDirectory() as data_dir:
            with mock.patch.dict(sys.modules, {"qdrant_client": fake_module}):
                def worker() -> None:
                    try:
                        start_barrier.wait(timeout=3)
                        client = memory_factory._get_or_create_qdrant_client(data_dir)
                        results.append(client)
                    except Exception as worker_error:  # pragma: no cover - asserted below
                        errors.append(worker_error)

                threads = [
                    threading.Thread(target=worker, name=f"memory-factory-test-{idx}")
                    for idx in range(worker_count)
                ]
                for thread in threads:
                    thread.start()
                for thread in threads:
                    thread.join(timeout=5)

        self.assertEqual(errors, [])
        self.assertEqual(len(results), worker_count)
        self.assertEqual(FakeQdrantClient.init_count, 1)
        self.assertTrue(all(client is results[0] for client in results))

    def test_get_or_create_qdrant_client_normalizes_data_dir_key(self) -> None:
        class FakeQdrantClient:
            init_count = 0

            def __init__(self, path: str) -> None:
                type(self).init_count += 1
                self.path = path

        fake_module = types.SimpleNamespace(QdrantClient=FakeQdrantClient)

        with tempfile.TemporaryDirectory() as data_dir:
            canonical_path = os.path.realpath(data_dir)
            alternate_path = os.path.join(data_dir, ".")

            with mock.patch.dict(sys.modules, {"qdrant_client": fake_module}):
                client_a = memory_factory._get_or_create_qdrant_client(data_dir)
                client_b = memory_factory._get_or_create_qdrant_client(alternate_path)

            self.assertIs(client_a, client_b)
            self.assertEqual(FakeQdrantClient.init_count, 1)
            self.assertIn(canonical_path, memory_factory._qdrant_clients)
            self.assertNotIn(alternate_path, memory_factory._qdrant_clients)

    def test_resolve_embedding_config_auto_openai_uses_selected_model(self) -> None:
        config = memory_factory.resolve_embedding_config(
            {
                "modelId": "openai:gpt-5",
                "openaiApiKey": "openai-key-123",
                "memory_embedding_model": "text-embedding-3-large",
            }
        )

        self.assertEqual(
            config,
            {
                "provider": "openai",
                "model": "text-embedding-3-large",
                "api_key": "openai-key-123",
            },
        )

    def test_resolve_embedding_config_fallback_openai_uses_selected_model(self) -> None:
        config = memory_factory.resolve_embedding_config(
            {
                "modelId": "anthropic:claude-sonnet-4-6",
                "openai_api_key": "openai-key-123",
                "memory_embedding_model": "text-embedding-3-large",
            }
        )

        self.assertEqual(
            config,
            {
                "provider": "openai",
                "model": "text-embedding-3-large",
                "api_key": "openai-key-123",
            },
        )

    def _install_fake_miso_modules_for_manager(
        self,
        *,
        build_openai_embed_fn,
        initial_state_by_session: dict[str, dict[str, object]] | None = None,
    ) -> tuple[dict[str, object], type, object, dict[str, list[str]]]:
        delete_calls: dict[str, list[str]] = {"collections": []}

        class FakeMemoryConfig:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)

        class FakeMemoryManager:
            def __init__(self, config, store):
                self.config = config
                self.store = store

        class FakeJsonFileSessionStore:
            _state_by_session = copy.deepcopy(initial_state_by_session or {})

            def __init__(self, base_dir):
                self.base_dir = base_dir

            def load(self, session_id):
                return copy.deepcopy(self._state_by_session.get(session_id, {}))

            def save(self, session_id, state):
                self._state_by_session[session_id] = copy.deepcopy(state)

        class FakeQdrantVectorAdapter:
            def __init__(
                self,
                *,
                client,
                embed_fn,
                vector_size,
                collection_prefix="chat",
            ):
                self._client = client
                self._embed_fn = embed_fn
                self._vector_size = vector_size
                self._collection_prefix = collection_prefix
                self._ensured = set()

        fake_pkg = types.ModuleType("miso")
        fake_pkg.__path__ = []  # type: ignore[attr-defined]

        fake_memory_module = types.ModuleType("miso.memory")
        fake_memory_module.MemoryConfig = FakeMemoryConfig
        fake_memory_module.MemoryManager = FakeMemoryManager

        fake_memory_qdrant_module = types.ModuleType("miso.memory_qdrant")
        fake_memory_qdrant_module.JsonFileSessionStore = FakeJsonFileSessionStore
        fake_memory_qdrant_module.QdrantVectorAdapter = FakeQdrantVectorAdapter
        fake_memory_qdrant_module.build_openai_embed_fn = build_openai_embed_fn

        fake_pkg.memory = fake_memory_module  # type: ignore[attr-defined]
        fake_pkg.memory_qdrant = fake_memory_qdrant_module  # type: ignore[attr-defined]

        fake_client = types.SimpleNamespace(
            delete_collection=lambda **kwargs: delete_calls["collections"].append(
                kwargs.get("collection_name", "")
            )
        )

        modules = {
            "miso": fake_pkg,
            "miso.memory": fake_memory_module,
            "miso.memory_qdrant": fake_memory_qdrant_module,
        }

        return modules, FakeJsonFileSessionStore, fake_client, delete_calls

    def test_create_memory_manager_uses_dynamic_openai_vector_size(self) -> None:
        openai_embed_calls: dict[str, str] = {}

        def fake_build_openai_embed_fn(*, model, broth_instance=None, payload=None):
            del payload
            openai_embed_calls["model"] = model
            openai_embed_calls["api_key"] = getattr(broth_instance, "api_key", "")
            return (lambda texts: [[0.0] * 3072 for _ in texts], 3072)

        modules, fake_store_cls, fake_client, _delete_calls = (
            self._install_fake_miso_modules_for_manager(
                build_openai_embed_fn=fake_build_openai_embed_fn,
            )
        )

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"MISO_DATA_DIR": data_dir}, clear=False), \
            mock.patch.dict(sys.modules, modules), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", True), \
            mock.patch.object(
                memory_factory,
                "_get_or_create_qdrant_client",
                return_value=fake_client,
            ), \
            mock.patch.object(
                memory_factory.uuid,
                "uuid4",
                return_value=uuid.UUID("11111111-1111-1111-1111-111111111111"),
            ):
            manager, reason = memory_factory.create_memory_manager_with_diagnostics(
                {
                    "memory_enabled": True,
                    "memory_embedding_provider": "openai",
                    "memory_embedding_model": "text-embedding-3-large",
                    "openaiApiKey": "openai-key-123",
                },
                session_id="chat-1",
            )

        self.assertEqual(reason, "")
        self.assertIsNotNone(manager)
        self.assertEqual(
            openai_embed_calls,
            {
                "model": "text-embedding-3-large",
                "api_key": "openai-key-123",
            },
        )
        self.assertEqual(manager.config.vector_adapter._vector_size, 3072)
        self.assertEqual(
            manager.config.vector_adapter._collection_prefix,
            "chat_111111111111",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_embedding_signature"],
            "openai:text-embedding-3-large:3072",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_collection_tag"],
            "111111111111",
        )

    def test_create_memory_manager_rotates_collection_tag_on_signature_change(self) -> None:
        old_state = {
            "chat-1": {
                "messages": [
                    {"role": "user", "content": "u1"},
                    {"role": "assistant", "content": "a1"},
                    {"role": "user", "content": "u2"},
                    {"role": "assistant", "content": "a2"},
                    {"role": "user", "content": "u3"},
                ],
                "vector_indexed_until": 2,
                "vector_embedding_signature": "openai:text-embedding-3-small:1536",
                "vector_collection_tag": "legacytag",
            }
        }

        def fake_build_openai_embed_fn(*, model, broth_instance=None, payload=None):
            del model, broth_instance, payload
            return (lambda texts: [[0.0] * 3072 for _ in texts], 3072)

        modules, fake_store_cls, fake_client, delete_calls = (
            self._install_fake_miso_modules_for_manager(
                build_openai_embed_fn=fake_build_openai_embed_fn,
                initial_state_by_session=old_state,
            )
        )

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"MISO_DATA_DIR": data_dir}, clear=False), \
            mock.patch.dict(sys.modules, modules), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", True), \
            mock.patch.object(
                memory_factory,
                "_get_or_create_qdrant_client",
                return_value=fake_client,
            ), \
            mock.patch.object(
                memory_factory.uuid,
                "uuid4",
                return_value=uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            ):
            manager, reason = memory_factory.create_memory_manager_with_diagnostics(
                {
                    "memory_enabled": True,
                    "memory_embedding_provider": "openai",
                    "memory_embedding_model": "text-embedding-3-large",
                    "openai_api_key": "openai-key-123",
                },
                session_id="chat-1",
            )

        self.assertEqual(reason, "")
        self.assertIsNotNone(manager)
        self.assertEqual(
            manager.config.vector_adapter._collection_prefix,
            "chat_aaaaaaaaaaaa",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_embedding_signature"],
            "openai:text-embedding-3-large:3072",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_collection_tag"],
            "aaaaaaaaaaaa",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_indexed_until"],
            5,
        )
        self.assertEqual(
            delete_calls["collections"],
            ["chat_legacytag_chat_1"],
        )

    def test_create_memory_manager_reuses_collection_tag_when_signature_matches(self) -> None:
        previous_state = {
            "chat-1": {
                "messages": [{"role": "user", "content": "u1"}],
                "vector_indexed_until": 1,
                "vector_embedding_signature": "openai:text-embedding-3-large:3072",
                "vector_collection_tag": "persistedtag",
            }
        }

        def fake_build_openai_embed_fn(*, model, broth_instance=None, payload=None):
            del model, broth_instance, payload
            return (lambda texts: [[0.0] * 3072 for _ in texts], 3072)

        modules, fake_store_cls, fake_client, delete_calls = (
            self._install_fake_miso_modules_for_manager(
                build_openai_embed_fn=fake_build_openai_embed_fn,
                initial_state_by_session=previous_state,
            )
        )

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"MISO_DATA_DIR": data_dir}, clear=False), \
            mock.patch.dict(sys.modules, modules), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", True), \
            mock.patch.object(
                memory_factory,
                "_get_or_create_qdrant_client",
                return_value=fake_client,
            ), \
            mock.patch.object(
                memory_factory.uuid,
                "uuid4",
                return_value=uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
            ):
            manager, reason = memory_factory.create_memory_manager_with_diagnostics(
                {
                    "memory_enabled": True,
                    "memory_embedding_provider": "openai",
                    "memory_embedding_model": "text-embedding-3-large",
                    "openaiApiKey": "openai-key-123",
                },
                session_id="chat-1",
            )

        self.assertEqual(reason, "")
        self.assertIsNotNone(manager)
        self.assertEqual(
            manager.config.vector_adapter._collection_prefix,
            "chat_persistedtag",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_collection_tag"],
            "persistedtag",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_indexed_until"],
            1,
        )
        self.assertEqual(delete_calls["collections"], [])

    def test_merge_messages_with_overlap_appends_only_new_tail(self) -> None:
        existing_messages = [
            {"role": "system", "content": "rules-v1"},
            {"role": "user", "content": "u1"},
            {"role": "assistant", "content": "a1"},
            {"role": "user", "content": "u2"},
            {"role": "assistant", "content": "a2"},
        ]
        latest_messages = [
            {"role": "system", "content": "rules-v2"},
            {"role": "user", "content": "u2"},
            {"role": "assistant", "content": "a2"},
            {"role": "user", "content": "u3"},
            {"role": "assistant", "content": "a3"},
        ]

        merged = memory_factory._merge_messages_with_overlap(
            existing_messages,
            latest_messages,
        )

        self.assertEqual(
            merged,
            [
                {"role": "system", "content": "rules-v2"},
                {"role": "user", "content": "u1"},
                {"role": "assistant", "content": "a1"},
                {"role": "user", "content": "u2"},
                {"role": "assistant", "content": "a2"},
                {"role": "user", "content": "u3"},
                {"role": "assistant", "content": "a3"},
            ],
        )

    def test_patch_memory_commit_with_overlap_sanitizes_tool_traffic(self) -> None:
        existing_messages = [
            {"role": "system", "content": "rules-v1"},
            {"role": "user", "content": "u1"},
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "a1"},
                    {"type": "tool_use", "id": "toolu_1", "name": "exec", "input": {}},
                ],
            },
            {"role": "tool", "content": "transient"},
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": "toolu_1",
                        "content": '{"ok": true}',
                    }
                ],
            },
            {"type": "function_call_output", "call_id": "call-1", "output": '{"ok": true}'},
        ]
        latest_messages = [
            {"role": "system", "content": "rules-v2"},
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": "toolu_1",
                        "content": '{"ok": true}',
                    },
                    {"type": "text", "text": "a1"},
                ],
            },
            {"type": "function_call_output", "call_id": "call-2", "output": '{"ok": true}'},
            {"role": "user", "content": "u2"},
            {"role": "assistant", "content": "a2"},
        ]

        class FakeStore:
            def __init__(self, state):
                self._state = copy.deepcopy(state)

            def load(self, _session_id: str):
                return copy.deepcopy(self._state)

        class FakeManager:
            def __init__(self):
                self.store = FakeStore({"messages": existing_messages})
                self.committed_payload = None

            def commit_messages(self, *, session_id: str, full_conversation):
                self.committed_payload = {
                    "session_id": session_id,
                    "full_conversation": full_conversation,
                }

        manager = FakeManager()
        memory_factory._patch_memory_commit_with_overlap(manager)

        manager.commit_messages(
            session_id="chat-test",
            full_conversation=latest_messages,
        )

        self.assertEqual(
            manager.committed_payload,
            {
                "session_id": "chat-test",
                "full_conversation": [
                    {"role": "system", "content": "rules-v2"},
                    {"role": "user", "content": "u1"},
                    {"role": "assistant", "content": [{"type": "text", "text": "a1"}]},
                    {"role": "user", "content": "u2"},
                    {"role": "assistant", "content": "a2"},
                ],
            },
        )

    def test_patch_memory_commit_with_overlap_wraps_original_commit(self) -> None:
        existing_messages = [
            {"role": "system", "content": "rules-v1"},
            {"role": "user", "content": "u1"},
            {"role": "assistant", "content": "a1"},
            {"role": "user", "content": "u2"},
            {"role": "assistant", "content": "a2"},
        ]
        latest_messages = [
            {"role": "system", "content": "rules-v2"},
            {"role": "user", "content": "u2"},
            {"role": "assistant", "content": "a2"},
            {"role": "user", "content": "u3"},
            {"role": "assistant", "content": "a3"},
        ]

        class FakeStore:
            def __init__(self, state):
                self._state = state

            def load(self, _session_id: str):
                return self._state

        class FakeManager:
            def __init__(self):
                self.store = FakeStore({"messages": existing_messages})
                self.committed_payload = None

            def commit_messages(self, *, session_id: str, full_conversation):
                self.committed_payload = {
                    "session_id": session_id,
                    "full_conversation": full_conversation,
                }

        manager = FakeManager()
        memory_factory._patch_memory_commit_with_overlap(manager)
        # Ensure patching twice remains idempotent.
        memory_factory._patch_memory_commit_with_overlap(manager)

        manager.commit_messages(
            session_id="chat-test",
            full_conversation=latest_messages,
        )

        self.assertTrue(getattr(manager, "_pupu_commit_overlap_patch", False))
        self.assertEqual(
            manager.committed_payload,
            {
                "session_id": "chat-test",
                "full_conversation": [
                    {"role": "system", "content": "rules-v2"},
                    {"role": "user", "content": "u1"},
                    {"role": "assistant", "content": "a1"},
                    {"role": "user", "content": "u2"},
                    {"role": "assistant", "content": "a2"},
                    {"role": "user", "content": "u3"},
                    {"role": "assistant", "content": "a3"},
                ],
            },
        )

    def test_patch_memory_prepare_with_diagnostics_sets_no_match_status(self) -> None:
        class FakeManager:
            def __init__(self):
                self.config = types.SimpleNamespace(vector_top_k=10, vector_adapter=object())
                self._last_prepare_info = {"before_estimated_tokens": 12}

            def prepare_messages(
                self,
                session_id: str,
                incoming,
                *,
                max_context_window_tokens: int,
                model: str,
                summary_generator=None,
            ):
                del session_id, incoming, max_context_window_tokens, model, summary_generator
                return [{"role": "user", "content": "hello"}]

        manager = FakeManager()
        memory_factory._patch_memory_prepare_with_diagnostics(manager)
        prepared = manager.prepare_messages(
            session_id="chat-test",
            incoming=[],
            max_context_window_tokens=1024,
            model="openai:gpt-4.1",
        )

        self.assertEqual(prepared, [{"role": "user", "content": "hello"}])
        self.assertEqual(manager._last_prepare_info["vector_top_k"], 10)
        self.assertEqual(manager._last_prepare_info["vector_adapter_enabled"], True)
        self.assertEqual(manager._last_prepare_info["vector_recall_count"], 0)
        self.assertEqual(manager._last_prepare_info["vector_recall_status"], "no_match")

    def test_patch_memory_prepare_with_diagnostics_sets_search_failed_status(self) -> None:
        class FakeManager:
            def __init__(self):
                self.config = types.SimpleNamespace(vector_top_k=10, vector_adapter=object())
                self._last_prepare_info = {
                    "vector_fallback_reason": "vector_search_failed: boom",
                }

            def prepare_messages(
                self,
                session_id: str,
                incoming,
                *,
                max_context_window_tokens: int,
                model: str,
                summary_generator=None,
            ):
                del session_id, incoming, max_context_window_tokens, model, summary_generator
                return [{"role": "assistant", "content": "ok"}]

        manager = FakeManager()
        memory_factory._patch_memory_prepare_with_diagnostics(manager)
        prepared = manager.prepare_messages(
            session_id="chat-test",
            incoming=[],
            max_context_window_tokens=1024,
            model="openai:gpt-4.1",
        )

        self.assertEqual(prepared, [{"role": "assistant", "content": "ok"}])
        self.assertEqual(manager._last_prepare_info["vector_recall_status"], "search_failed")

    def test_patch_memory_prepare_with_diagnostics_sanitizes_and_cleans_store(self) -> None:
        class FakeStore:
            def __init__(self, state):
                self.state = copy.deepcopy(state)
                self.saved_states = []

            def load(self, _session_id: str):
                return copy.deepcopy(self.state)

            def save(self, _session_id: str, state):
                next_state = copy.deepcopy(state)
                self.saved_states.append(next_state)
                self.state = next_state

        class FakeManager:
            def __init__(self):
                self.config = types.SimpleNamespace(vector_top_k=0, vector_adapter=None)
                self._last_prepare_info = {}
                self.store = FakeStore(
                    {
                        "messages": [
                            {"role": "user", "content": "old"},
                            {"role": "tool", "content": "noise"},
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "tool_result",
                                        "tool_use_id": "toolu_1",
                                        "content": '{"ok": true}',
                                    }
                                ],
                            },
                            {
                                "type": "function_call_output",
                                "call_id": "call-legacy",
                                "output": '{"ok": true}',
                            },
                        ],
                        "session_meta": "keep",
                    }
                )
                self.received_incoming = None

            def prepare_messages(
                self,
                session_id: str,
                incoming,
                *,
                max_context_window_tokens: int,
                model: str,
                summary_generator=None,
            ):
                del session_id, max_context_window_tokens, model, summary_generator
                self.received_incoming = copy.deepcopy(incoming)
                return [
                    {"role": "system", "content": "sys"},
                    {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "tool_use",
                                "id": "toolu_2",
                                "name": "search",
                                "input": {},
                            },
                            {"type": "text", "text": "reply"},
                        ],
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": "toolu_2",
                                "content": '{"ok": true}',
                            }
                        ],
                    },
                    {"type": "function_call_output", "call_id": "call-2", "output": '{"ok": true}'},
                ]

        manager = FakeManager()
        memory_factory._patch_memory_prepare_with_diagnostics(manager)

        prepared = manager.prepare_messages(
            session_id="chat-test",
            incoming=[
                {"role": "user", "content": "hello"},
                {"type": "function_call_output", "call_id": "call-now", "output": '{"ok": true}'},
                {
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": "prior"},
                        {"type": "tool_use", "id": "toolu_3", "name": "exec", "input": {}},
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "toolu_3",
                            "content": '{"ok": true}',
                        }
                    ],
                },
                {"role": "tool", "content": "runtime-noise"},
            ],
            max_context_window_tokens=2048,
            model="openai:gpt-4.1",
        )

        self.assertEqual(
            manager.received_incoming,
            [
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": [{"type": "text", "text": "prior"}]},
            ],
        )
        self.assertEqual(
            prepared,
            [
                {"role": "system", "content": "sys"},
                {"role": "assistant", "content": [{"type": "text", "text": "reply"}]},
            ],
        )
        self.assertGreaterEqual(len(manager.store.saved_states), 1)
        self.assertEqual(
            manager.store.state,
            {
                "messages": [{"role": "user", "content": "old"}],
                "session_meta": "keep",
            },
        )

    def test_sanitize_dialog_messages_keeps_text_and_attachments(self) -> None:
        sanitized = memory_factory._sanitize_dialog_messages(
            [
                {"role": "System", "content": "rules"},
                {"role": "system", "content": "[Recall messages]\n[]"},
                {"role": "assistant", "content": "first assistant"},
                {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "id": "toolu_1", "name": "exec", "input": {}},
                        {"type": "text", "text": "final answer"},
                        {
                            "type": "input_image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": "abc123",
                            },
                        },
                        {
                            "type": "tool_result",
                            "tool_use_id": "toolu_1",
                            "content": '{"ok": true}',
                        },
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "toolu_99",
                            "content": '{"ok": false}',
                        }
                    ],
                },
            ]
        )

        self.assertEqual(
            sanitized,
            [
                {
                    "role": "system",
                    "content": "rules\n\n[Recall messages]\n[]",
                },
                {
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": "final answer"},
                        {
                            "type": "input_image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": "abc123",
                            },
                        },
                    ],
                }
            ],
        )

    def test_patch_qdrant_similarity_search_compat_uses_query_points(self) -> None:
        class FakeClient:
            def __init__(self) -> None:
                self.calls = []

            def query_points(self, **kwargs):
                self.calls.append(kwargs)
                return types.SimpleNamespace(
                    points=[
                        types.SimpleNamespace(payload={"text": "alpha"}),
                        types.SimpleNamespace(payload={"text": "beta"}),
                    ]
                )

        class FakeVectorAdapter:
            def __init__(self) -> None:
                self._client = FakeClient()
                self._embed_fn = lambda texts: [[0.12, 0.34] for _ in texts]
                self._ensured = []

            def _collection_name(self, session_id: str) -> str:
                return f"chat_{session_id}"

            def _ensure_collection(self, name: str) -> None:
                self._ensured.append(name)

            def similarity_search(self, *, session_id: str, query: str, k: int):
                del session_id, query, k
                raise AssertionError("Expected compatibility patch to replace this method")

        adapter = FakeVectorAdapter()
        memory_factory._patch_qdrant_similarity_search_compat(adapter)

        recalled = adapter.similarity_search(
            session_id="chat-123",
            query="why not 18.00",
            k=3,
        )

        self.assertEqual(recalled, ["alpha", "beta"])
        self.assertEqual(adapter._ensured, ["chat_chat-123"])
        self.assertEqual(len(adapter._client.calls), 1)
        self.assertEqual(adapter._client.calls[0]["collection_name"], "chat_chat-123")
        self.assertEqual(adapter._client.calls[0]["limit"], 3)
        self.assertIn("query", adapter._client.calls[0])


if __name__ == "__main__":
    unittest.main()
