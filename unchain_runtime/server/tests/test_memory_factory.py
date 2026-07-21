import copy
import inspect
import json
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

    def test_session_store_sanitization_follows_computer_use_flag(self) -> None:
        enabled_store = object()
        disabled_store = object()

        with tempfile.TemporaryDirectory() as data_dir, mock.patch(
            "session_transcript_media.build_sanitizing_session_store",
            side_effect=[enabled_store, disabled_store],
        ) as build_store:
            with mock.patch.dict(
                os.environ,
                {
                    "PUPU_FEATURE_COMPUTER_USE": "true",
                    "PUPU_COMPUTER_USE": "true",
                },
                clear=False,
            ):
                self.assertIs(memory_factory._build_session_store(data_dir), enabled_store)
            with mock.patch.dict(
                os.environ, {"PUPU_COMPUTER_USE": "0"}, clear=False
            ):
                self.assertIs(memory_factory._build_session_store(data_dir), disabled_store)

        sessions_dir = str(Path(data_dir) / "memory" / "sessions")
        self.assertEqual(
            build_store.call_args_list,
            [
                mock.call(sessions_dir, sanitize_enabled=True),
                mock.call(sessions_dir, sanitize_enabled=False),
            ],
        )

    def _build_fake_qdrant_modules(
        self,
        *,
        client_cls,
        allowed_fields: dict[str, object] | None = None,
    ) -> dict[str, object]:
        fake_qdrant_module = types.ModuleType("qdrant_client")
        fake_qdrant_module.QdrantClient = client_cls

        modules: dict[str, object] = {"qdrant_client": fake_qdrant_module}
        if allowed_fields is None:
            return modules

        class FakeCreateCollection:
            model_fields = allowed_fields

        fake_http_module = types.ModuleType("qdrant_client.http")
        fake_http_models_module = types.ModuleType("qdrant_client.http.models")
        fake_http_models_module.CreateCollection = FakeCreateCollection
        fake_http_module.models = fake_http_models_module
        fake_qdrant_module.http = fake_http_module

        modules["qdrant_client.http"] = fake_http_module
        modules["qdrant_client.http.models"] = fake_http_models_module
        return modules

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

    def test_get_or_create_qdrant_client_removes_unsupported_meta_fields(self) -> None:
        class FakeQdrantClient:
            init_paths: list[str] = []

            def __init__(self, path: str) -> None:
                type(self).init_paths.append(path)
                self.path = path

        with tempfile.TemporaryDirectory() as data_dir:
            qdrant_dir = Path(data_dir) / "memory" / "qdrant"
            qdrant_dir.mkdir(parents=True, exist_ok=True)
            meta_path = qdrant_dir / "meta.json"
            meta_path.write_text(
                json.dumps(
                    {
                        "collections": {
                            "chat_1": {
                                "vectors": {"size": 768, "distance": "Cosine"},
                                "strict_mode_config": None,
                                "metadata": None,
                            }
                        },
                        "aliases": {},
                    }
                ),
                encoding="utf-8",
            )

            with mock.patch.dict(
                sys.modules,
                self._build_fake_qdrant_modules(
                    client_cls=FakeQdrantClient,
                    allowed_fields={
                        "vectors": object(),
                        "strict_mode_config": object(),
                    },
                ),
            ):
                client = memory_factory._get_or_create_qdrant_client(data_dir)

            expected_qdrant_dir = os.path.realpath(str(qdrant_dir))
            self.assertEqual(client.path, expected_qdrant_dir)
            self.assertEqual(FakeQdrantClient.init_paths, [expected_qdrant_dir])
            repaired_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertEqual(
                repaired_meta["collections"]["chat_1"],
                {
                    "vectors": {"size": 768, "distance": "Cosine"},
                    "strict_mode_config": None,
                },
            )

    def test_get_or_create_qdrant_client_keeps_compatible_meta_unchanged(self) -> None:
        class FakeQdrantClient:
            def __init__(self, path: str) -> None:
                self.path = path

        with tempfile.TemporaryDirectory() as data_dir:
            qdrant_dir = Path(data_dir) / "memory" / "qdrant"
            qdrant_dir.mkdir(parents=True, exist_ok=True)
            meta_path = qdrant_dir / "meta.json"
            original_meta = json.dumps(
                {
                    "collections": {
                        "chat_1": {
                            "vectors": {"size": 768, "distance": "Cosine"},
                            "strict_mode_config": None,
                        }
                    },
                    "aliases": {},
                },
                separators=(",", ":"),
            )
            meta_path.write_text(original_meta, encoding="utf-8")

            with mock.patch.dict(
                sys.modules,
                self._build_fake_qdrant_modules(
                    client_cls=FakeQdrantClient,
                    allowed_fields={
                        "vectors": object(),
                        "strict_mode_config": object(),
                    },
                ),
            ):
                memory_factory._get_or_create_qdrant_client(data_dir)

            self.assertEqual(meta_path.read_text(encoding="utf-8"), original_meta)

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

    def _install_fake_unchain_memory_modules_for_manager(
        self,
        *,
        build_openai_embed_fn,
        initial_state_by_session: dict[str, dict[str, object]] | None = None,
    ) -> tuple[dict[str, object], type, object, dict[str, list[object]]]:
        delete_calls: dict[str, list[object]] = {"collections": [], "add_texts": []}

        class FakeMemoryConfig:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)

        class FakeLongTermMemoryConfig:
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

            def add_texts(self, *, session_id, texts, metadatas):
                delete_calls["add_texts"].append(
                    {
                        "session_id": session_id,
                        "texts": copy.deepcopy(texts),
                        "metadatas": copy.deepcopy(metadatas),
                        "collection_prefix": self._collection_prefix,
                    }
                )

        def fake_collect_complete_turns_for_vector_index(messages, *, start_index):
            texts = []
            metadatas = []
            next_indexed_until = max(0, int(start_index))
            i = next_indexed_until

            while i < len(messages):
                while i < len(messages) and messages[i].get("role") != "user":
                    i += 1
                next_indexed_until = i
                if i >= len(messages):
                    break

                turn_start = i
                i += 1
                while i < len(messages) and messages[i].get("role") != "user":
                    i += 1
                turn_end = i - 1
                turn_messages = messages[turn_start : turn_end + 1]
                if not any(item.get("role") == "assistant" for item in turn_messages):
                    next_indexed_until = turn_start
                    break

                normalized_turn_messages = [
                    {
                        "role": item.get("role"),
                        "content": item.get("content"),
                    }
                    for item in turn_messages
                ]
                texts.append(
                    "\n".join(
                        f"{item['role']}: {item['content']}"
                        for item in normalized_turn_messages
                    )
                )
                metadatas.append(
                    {
                        "messages": normalized_turn_messages,
                        "turn_start_index": turn_start,
                        "turn_end_index": turn_end,
                    }
                )
                next_indexed_until = turn_end + 1

            return texts, metadatas, next_indexed_until, len(texts)

        fake_memory_module = types.ModuleType("unchain.memory")
        fake_memory_module.MemoryConfig = FakeMemoryConfig
        fake_memory_module.LongTermMemoryConfig = FakeLongTermMemoryConfig
        fake_memory_module.MemoryManager = FakeMemoryManager
        fake_memory_module.collect_complete_turns_for_vector_index = (
            fake_collect_complete_turns_for_vector_index
        )
        fake_memory_module.JsonFileLongTermProfileStore = type(
            "JsonFileLongTermProfileStore", (), {"__init__": lambda self, **kw: None}
        )
        fake_memory_module.JsonFileSessionStore = FakeJsonFileSessionStore
        fake_memory_module.QdrantVectorAdapter = FakeQdrantVectorAdapter
        fake_memory_module.QdrantLongTermVectorAdapter = FakeQdrantVectorAdapter
        fake_memory_module.build_openai_embed_fn = build_openai_embed_fn
        fake_memory_manager_module = types.ModuleType("unchain.memory.manager")
        fake_memory_manager_module._collect_complete_turns_for_vector_index = (
            fake_collect_complete_turns_for_vector_index
        )
        fake_memory_manager_module.JsonFileLongTermProfileStore = type(
            "JsonFileLongTermProfileStore", (), {"__init__": lambda self, **kw: None}
        )

        fake_memory_qdrant_module = types.ModuleType("unchain.memory.qdrant")
        fake_memory_qdrant_module.JsonFileSessionStore = FakeJsonFileSessionStore
        fake_memory_qdrant_module.QdrantVectorAdapter = FakeQdrantVectorAdapter
        fake_memory_qdrant_module.QdrantLongTermVectorAdapter = FakeQdrantVectorAdapter
        fake_memory_qdrant_module.build_openai_embed_fn = build_openai_embed_fn

        fake_memory_module.qdrant = fake_memory_qdrant_module  # type: ignore[attr-defined]

        fake_unchain_pkg = types.ModuleType("unchain")
        fake_unchain_pkg.__path__ = []  # type: ignore[attr-defined]
        fake_unchain_pkg.memory = fake_memory_module  # type: ignore[attr-defined]

        fake_client = types.SimpleNamespace(
            delete_collection=lambda **kwargs: delete_calls["collections"].append(
                kwargs.get("collection_name", "")
            )
        )

        modules = {
            "unchain": fake_unchain_pkg,
            "unchain.memory": fake_memory_module,
            "unchain.memory.manager": fake_memory_manager_module,
            "unchain.memory.qdrant": fake_memory_qdrant_module,
        }

        return modules, FakeJsonFileSessionStore, fake_client, delete_calls

    def test_create_memory_manager_uses_dynamic_openai_vector_size(self) -> None:
        openai_embed_calls: dict[str, str] = {}

        def fake_build_openai_embed_fn(*, model, api_key_source=None, payload=None):
            del payload
            openai_embed_calls["model"] = model
            openai_embed_calls["api_key"] = getattr(api_key_source, "api_key", "")
            return (lambda texts: [[0.0] * 3072 for _ in texts], 3072)

        modules, fake_store_cls, fake_client, _delete_calls = (
            self._install_fake_unchain_memory_modules_for_manager(
                build_openai_embed_fn=fake_build_openai_embed_fn,
            )
        )

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
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

    def test_create_memory_manager_can_enable_long_term_memory(self) -> None:
        patched_vector_adapters = []

        def fake_build_openai_embed_fn(*, model, api_key_source=None, payload=None):
            del model, api_key_source, payload
            return (lambda texts: [[0.0] * 1536 for _ in texts], 1536)

        def track_vector_compat_patch(adapter):
            patched_vector_adapters.append(adapter)
            return adapter

        modules, _fake_store_cls, fake_client, _delete_calls = (
            self._install_fake_unchain_memory_modules_for_manager(
                build_openai_embed_fn=fake_build_openai_embed_fn,
            )
        )

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.dict(sys.modules, modules), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", True), \
            mock.patch.object(
                memory_factory,
                "_patch_qdrant_similarity_search_compat",
                side_effect=track_vector_compat_patch,
            ), \
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
                    "memory_long_term_enabled": True,
                    "memory_long_term_extract_every_n_turns": 7,
                    "memory_vector_min_score": 0.41,
                    "memory_long_term_vector_top_k": 5,
                    "memory_long_term_vector_min_score": 0.62,
                    "memory_long_term_episode_top_k": 4,
                    "memory_long_term_episode_min_score": 0.71,
                    "memory_long_term_playbook_top_k": 3,
                    "memory_long_term_playbook_min_score": 0.83,
                    "memory_embedding_provider": "openai",
                    "memory_embedding_model": "text-embedding-3-small",
                    "openaiApiKey": "openai-key-123",
                },
                session_id="chat-1",
            )

        self.assertEqual(reason, "")
        self.assertIsNotNone(manager)
        self.assertEqual(manager.config.vector_min_score, 0.41)
        self.assertIsNotNone(manager.config.long_term)
        self.assertEqual(manager.config.long_term.extract_every_n_turns, 7)
        self.assertEqual(manager.config.long_term.vector_top_k, 5)
        self.assertEqual(manager.config.long_term.vector_min_score, 0.62)
        self.assertEqual(manager.config.long_term.episode_top_k, 4)
        self.assertEqual(manager.config.long_term.episode_min_score, 0.71)
        self.assertEqual(manager.config.long_term.playbook_top_k, 3)
        self.assertEqual(manager.config.long_term.playbook_min_score, 0.83)
        self.assertEqual(
            manager.config.long_term.profile_base_dir,
            os.path.realpath(os.path.join(data_dir, "memory", "long_term_profiles")),
        )
        self.assertEqual(
            manager.config.long_term.vector_adapter._collection_prefix,
            memory_factory._long_term_collection_prefix(
                "openai:text-embedding-3-small:1536"
            ),
        )
        self.assertEqual(len(patched_vector_adapters), 2)
        self.assertIs(patched_vector_adapters[0], manager.config.vector_adapter)
        self.assertIs(
            patched_vector_adapters[1],
            manager.config.long_term.vector_adapter,
        )

    def test_long_term_collection_prefix_changes_with_embedding_signature(self) -> None:
        self.assertEqual(
            memory_factory._long_term_collection_prefix(
                "openai:text-embedding-3-small:1536"
            ),
            memory_factory._long_term_collection_prefix(
                "openai:text-embedding-3-small:1536"
            ),
        )
        self.assertNotEqual(
            memory_factory._long_term_collection_prefix(
                "openai:text-embedding-3-small:1536"
            ),
            memory_factory._long_term_collection_prefix(
                "ollama:nomic-embed-text:768"
            ),
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

        def fake_build_openai_embed_fn(*, model, api_key_source=None, payload=None):
            del model, api_key_source, payload
            return (lambda texts: [[0.0] * 3072 for _ in texts], 3072)

        modules, fake_store_cls, fake_client, delete_calls = (
            self._install_fake_unchain_memory_modules_for_manager(
                build_openai_embed_fn=fake_build_openai_embed_fn,
                initial_state_by_session=old_state,
            )
        )

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
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

        def fake_build_openai_embed_fn(*, model, api_key_source=None, payload=None):
            del model, api_key_source, payload
            return (lambda texts: [[0.0] * 3072 for _ in texts], 3072)

        modules, fake_store_cls, fake_client, delete_calls = (
            self._install_fake_unchain_memory_modules_for_manager(
                build_openai_embed_fn=fake_build_openai_embed_fn,
                initial_state_by_session=previous_state,
            )
        )

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
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

    def test_prepare_vector_collection_tag_adopts_matching_cas_winner(self) -> None:
        class RevisionConflict(RuntimeError):
            code = "session_revision_conflict"

        initial_snapshot = types.SimpleNamespace(
            state={
                "messages": [{"role": "user", "content": "hello"}],
                "vector_embedding_signature": "old:model:10",
                "vector_collection_tag": "oldtag",
            },
            revision=4,
        )
        winner_snapshot = types.SimpleNamespace(
            state={
                "messages": [{"role": "user", "content": "hello"}],
                "vector_embedding_signature": "new:model:20",
                "vector_collection_tag": "winnertag",
            },
            revision=5,
        )

        with mock.patch.object(
            memory_factory,
            "_load_session_snapshot_compat",
            side_effect=[initial_snapshot, winner_snapshot],
        ) as load_snapshot, mock.patch.object(
            memory_factory,
            "_save_session_snapshot_compat",
            side_effect=RevisionConflict("lost CAS race"),
        ), mock.patch.object(
            memory_factory,
            "_delete_collection_best_effort",
        ) as delete_collection:
            tag = memory_factory._prepare_vector_collection_tag(
                store=object(),
                client=object(),
                session_id="chat-1",
                embedding_signature="new:model:20",
            )

        self.assertEqual(tag, "winnertag")
        self.assertEqual(load_snapshot.call_count, 2)
        delete_collection.assert_not_called()

    def test_prepare_vector_collection_tag_rejects_different_cas_winner(self) -> None:
        class RevisionConflict(RuntimeError):
            code = "session_revision_conflict"

        initial_snapshot = types.SimpleNamespace(
            state={
                "vector_embedding_signature": "old:model:10",
                "vector_collection_tag": "oldtag",
            },
            revision=4,
        )
        winner_snapshot = types.SimpleNamespace(
            state={
                "vector_embedding_signature": "other:model:30",
                "vector_collection_tag": "othertag",
            },
            revision=5,
        )

        with mock.patch.object(
            memory_factory,
            "_load_session_snapshot_compat",
            side_effect=[initial_snapshot, winner_snapshot],
        ), mock.patch.object(
            memory_factory,
            "_save_session_snapshot_compat",
            side_effect=RevisionConflict("lost CAS race"),
        ), mock.patch.object(
            memory_factory,
            "_delete_collection_best_effort",
        ) as delete_collection:
            with self.assertRaisesRegex(RevisionConflict, "lost CAS race"):
                memory_factory._prepare_vector_collection_tag(
                    store=object(),
                    client=object(),
                    session_id="chat-1",
                    embedding_signature="new:model:20",
                )

        delete_collection.assert_not_called()

    def test_replace_short_term_session_memory_rebuilds_vectors(self) -> None:
        previous_state = {
            "chat-1": {
                "messages": [
                    {"role": "user", "content": "old-user"},
                    {"role": "assistant", "content": "old-assistant"},
                ],
                "summary": "old summary",
                "vector_indexed_until": 2,
                "vector_embedding_signature": "openai:text-embedding-3-small:1536",
                "vector_collection_tag": "legacytag",
                "long_term_indexed_until": 9,
            }
        }

        def fake_build_openai_embed_fn(*, model, api_key_source=None, payload=None):
            del model, api_key_source, payload
            return (lambda texts: [[0.0] * 3072 for _ in texts], 3072)

        modules, fake_store_cls, fake_client, delete_calls = (
            self._install_fake_unchain_memory_modules_for_manager(
                build_openai_embed_fn=fake_build_openai_embed_fn,
                initial_state_by_session=previous_state,
            )
        )

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
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
                return_value=uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
            ):
            result = memory_factory.replace_short_term_session_memory(
                session_id="chat-1",
                messages=[
                    {"role": "user", "content": "u1"},
                    {"role": "assistant", "content": "a1"},
                    {"role": "user", "content": "u2"},
                    {"role": "assistant", "content": "a2"},
                ],
                options={
                    "memory_embedding_provider": "openai",
                    "memory_embedding_model": "text-embedding-3-large",
                    "openaiApiKey": "openai-key-123",
                },
            )

        self.assertEqual(
            result,
            {
                "applied": True,
                "session_id": "chat-1",
                "stored_message_count": 4,
                "vector_applied": True,
                "vector_indexed_count": 2,
                "vector_indexed_until": 4,
                "vector_fallback_reason": "",
            },
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["messages"],
            [
                {"role": "user", "content": "u1"},
                {"role": "assistant", "content": "a1"},
                {"role": "user", "content": "u2"},
                {"role": "assistant", "content": "a2"},
            ],
        )
        self.assertNotIn("summary", fake_store_cls._state_by_session["chat-1"])
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_collection_tag"],
            "cccccccccccc",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_embedding_signature"],
            "openai:text-embedding-3-large:3072",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_indexed_until"],
            4,
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["long_term_indexed_until"],
            9,
        )
        self.assertEqual(delete_calls["collections"], ["chat_legacytag_chat_1"])
        self.assertEqual(len(delete_calls["add_texts"]), 1)
        self.assertEqual(
            delete_calls["add_texts"][0]["collection_prefix"],
            "chat_cccccccccccc",
        )
        self.assertEqual(
            delete_calls["add_texts"][0]["metadatas"],
            [
                {
                    "messages": [
                        {"role": "user", "content": "u1"},
                        {"role": "assistant", "content": "a1"},
                    ],
                    "turn_start_index": 0,
                    "turn_end_index": 1,
                },
                {
                    "messages": [
                        {"role": "user", "content": "u2"},
                        {"role": "assistant", "content": "a2"},
                    ],
                    "turn_start_index": 2,
                    "turn_end_index": 3,
                },
            ],
        )

    def test_replace_short_term_session_memory_clears_vectors_for_empty_messages(self) -> None:
        previous_state = {
            "chat-1": {
                "messages": [{"role": "user", "content": "u1"}],
                "vector_indexed_until": 1,
                "vector_embedding_signature": "openai:text-embedding-3-small:1536",
                "vector_collection_tag": "legacytag",
            }
        }

        def fake_build_openai_embed_fn(*, model, api_key_source=None, payload=None):
            del model, api_key_source, payload
            return (lambda texts: [[0.0] * 3072 for _ in texts], 3072)

        modules, fake_store_cls, fake_client, delete_calls = (
            self._install_fake_unchain_memory_modules_for_manager(
                build_openai_embed_fn=fake_build_openai_embed_fn,
                initial_state_by_session=previous_state,
            )
        )

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
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
                return_value=uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
            ):
            result = memory_factory.replace_short_term_session_memory(
                session_id="chat-1",
                messages=[],
                options={},
            )

        self.assertEqual(
            result,
            {
                "applied": True,
                "session_id": "chat-1",
                "stored_message_count": 0,
                "vector_applied": True,
                "vector_indexed_count": 0,
                "vector_indexed_until": 0,
                "vector_fallback_reason": "",
            },
        )
        self.assertEqual(fake_store_cls._state_by_session["chat-1"]["messages"], [])
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_collection_tag"],
            "dddddddddddd",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_embedding_signature"],
            "",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_indexed_until"],
            0,
        )
        self.assertEqual(delete_calls["collections"], ["chat_legacytag_chat_1"])
        self.assertEqual(delete_calls["add_texts"], [])

    def test_replace_short_term_session_memory_rewrites_state_when_vector_unavailable(self) -> None:
        previous_state = {
            "chat-1": {
                "messages": [{"role": "user", "content": "old"}],
                "vector_collection_tag": "legacytag",
                "vector_embedding_signature": "openai:text-embedding-3-small:1536",
                "long_term_indexed_until": 4,
            }
        }

        def fake_build_openai_embed_fn(*, model, api_key_source=None, payload=None):
            del model, api_key_source, payload
            return (lambda texts: [[0.0] * 3072 for _ in texts], 3072)

        modules, fake_store_cls, _fake_client, delete_calls = (
            self._install_fake_unchain_memory_modules_for_manager(
                build_openai_embed_fn=fake_build_openai_embed_fn,
                initial_state_by_session=previous_state,
            )
        )

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.dict(sys.modules, modules), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False), \
            mock.patch.object(
                memory_factory.uuid,
                "uuid4",
                return_value=uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"),
            ):
            result = memory_factory.replace_short_term_session_memory(
                session_id="chat-1",
                messages=[
                    {"role": "user", "content": "u1"},
                    {"role": "assistant", "content": "a1"},
                ],
                options={},
            )

        self.assertEqual(
            result,
            {
                "applied": True,
                "session_id": "chat-1",
                "stored_message_count": 2,
                "vector_applied": False,
                "vector_indexed_count": 0,
                "vector_indexed_until": 0,
                "vector_fallback_reason": "qdrant_client_unavailable",
            },
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["messages"],
            [
                {"role": "user", "content": "u1"},
                {"role": "assistant", "content": "a1"},
            ],
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_collection_tag"],
            "eeeeeeeeeeee",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["vector_embedding_signature"],
            "",
        )
        self.assertEqual(
            fake_store_cls._state_by_session["chat-1"]["long_term_indexed_until"],
            4,
        )
        self.assertEqual(delete_calls["collections"], [])

    def test_replace_short_term_session_memory_clears_checkpoint_with_cas(self) -> None:
        from unchain.execution import ExecutionRuntime
        from unchain.interaction.durable import (
            INTERACTION_KIND_HUMAN_INPUT,
            build_interaction_request,
        )
        from unchain.interaction.runtime import response_contract_for_kind
        from unchain.kernel import RunState
        from unchain.memory import KernelMemoryRuntime
        from unchain.memory.checkpoint_state import build_execution_checkpoint

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False):
            store = memory_factory._build_session_store(data_dir)
            memory_runtime = KernelMemoryRuntime.from_config(store=store)
            execution_runtime = ExecutionRuntime(store)
            run_state = RunState()
            run_state.seed_messages([{"role": "user", "content": "old"}])
            run_state.session_state.session_id = "chat-1"
            run_state.provider_state.provider = "openai"
            run_state.provider_state.model = "gpt-5"
            run_state.memory_state["session_revision"] = 0
            run_state.iteration = 1
            run_state.last_continuation = {
                "type": "durable_interaction",
                "occurrence": "ask-before-replace",
            }
            request = build_interaction_request(
                session_id="chat-1",
                kind=INTERACTION_KIND_HUMAN_INPUT,
                source_run_id="run-replace",
                occurrence="ask-before-replace",
                payload={
                    "request_id": "ask-before-replace",
                    "question": "Continue?",
                    "selection_mode": "single",
                    "options": [
                        {"label": "Yes", "value": "yes"},
                        {"label": "No", "value": "no"},
                    ],
                },
                response_contract=response_contract_for_kind(
                    INTERACTION_KIND_HUMAN_INPUT
                ),
                created_revision=0,
                subject={"provider": "openai", "model": "gpt-5"},
            )
            run_state.suspend_state.payload = {
                "interaction_request": request.to_dict()
            }
            checkpoint = build_execution_checkpoint(
                run_state,
                status="awaiting_interaction",
                run_id="run-replace",
            )
            guard = execution_runtime.acquire("chat-1", "run-replace")
            memory_runtime.save_execution_checkpoint_snapshot(
                "chat-1",
                checkpoint,
                interaction_request=request.to_dict(),
                expected_revision=0,
                execution_fence=guard.fence,
            )
            guard.release()

            result = memory_factory.replace_short_term_session_memory(
                session_id="chat-1",
                messages=[{"role": "user", "content": "replacement"}],
                options={},
            )
            persisted = store.load_with_revision("chat-1")

        self.assertTrue(result["execution_checkpoint_cleared"])
        self.assertEqual(result["session_revision"], 3)
        self.assertEqual(persisted.revision, 3)
        self.assertNotIn("execution_checkpoint", persisted.state)
        self.assertNotIn("execution_checkpoint_domain", persisted.state)
        journal = persisted.state["interaction_journal"]
        self.assertIsNone(journal["active_id"])
        entry = journal["entries"][request.interaction_id]
        self.assertIsNotNone(entry["receipt"])
        self.assertIsNotNone(entry["application"])
        self.assertEqual(
            persisted.state["messages"],
            [{"role": "user", "content": "replacement"}],
        )

    def test_idempotent_memory_replace_commits_terminal_receipt_and_replays(self) -> None:
        messages = [{"role": "user", "content": "replacement"}]

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False), \
            mock.patch(
                "durable_interaction_host.prepare_session_memory_replacement",
                return_value={
                    "execution_checkpoint_cleared": False,
                    "orphaned_interaction_repaired": False,
                },
            ) as prepare:
            first = memory_factory.replace_short_term_session_memory(
                session_id="chat-operation",
                messages=messages,
                options={},
                operation_id="replace-1",
                expected_session_revision=0,
            )
            persisted = memory_factory._build_session_store(data_dir).load_with_revision(
                "chat-operation"
            )
            replay = memory_factory.replace_short_term_session_memory(
                session_id="chat-operation",
                messages=messages,
                options={},
                operation_id="replace-1",
                expected_session_revision=0,
            )

            with self.assertRaises(memory_factory.MemorySessionReplaceError) as raised:
                memory_factory.replace_short_term_session_memory(
                    session_id="chat-operation",
                    messages=[{"role": "user", "content": "different"}],
                    options={},
                    operation_id="replace-1",
                    expected_session_revision=persisted.revision,
                )
            with self.assertRaises(memory_factory.MemorySessionReplaceError) as option_raised:
                memory_factory.replace_short_term_session_memory(
                    session_id="chat-operation",
                    messages=messages,
                    options={"memory_namespace": "different"},
                    operation_id="replace-1",
                    expected_session_revision=persisted.revision,
                )

        self.assertFalse(first["replayed"])
        self.assertEqual(first["operation_id"], "replace-1")
        self.assertEqual(first["session_revision"], 2)
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["session_revision"], 2)
        self.assertEqual(persisted.state["messages"], messages)
        receipt = persisted.state["memory_replace_receipts"]["entries"]["replace-1"]
        self.assertEqual(receipt["status"], "terminal")
        self.assertNotIn("session_revision", receipt["response"])
        self.assertEqual(raised.exception.code, "memory_replace_operation_conflict")
        self.assertEqual(
            option_raised.exception.code,
            "memory_replace_operation_conflict",
        )
        prepare.assert_called_once_with(
            "chat-operation",
            expected_cancel_attempt_id="",
        )

    def test_idempotent_memory_replace_stale_revision_has_zero_side_effects(self) -> None:
        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False), \
            mock.patch(
                "durable_interaction_host.prepare_session_memory_replacement"
            ) as prepare, \
            mock.patch.object(memory_factory, "_fresh_vector_collection_tag") as fresh_tag:
            store = memory_factory._build_session_store(data_dir)
            store.save("chat-stale", {"messages": [{"role": "user", "content": "new"}]})

            with self.assertRaises(memory_factory.MemorySessionReplaceError) as raised:
                memory_factory.replace_short_term_session_memory(
                    session_id="chat-stale",
                    messages=[{"role": "user", "content": "old"}],
                    options={},
                    operation_id="replace-stale",
                    expected_session_revision=0,
                )
            persisted = store.load_with_revision("chat-stale")

        self.assertEqual(raised.exception.code, "session_revision_conflict")
        self.assertEqual(raised.exception.expected_revision, 0)
        self.assertEqual(raised.exception.actual_revision, 1)
        self.assertEqual(persisted.revision, 1)
        self.assertNotIn("memory_replace_receipts", persisted.state)
        prepare.assert_not_called()
        fresh_tag.assert_not_called()

    def test_idempotent_memory_replace_does_not_cancel_unmatched_checkpoint(self) -> None:
        checkpoint = {
            "session_id": "chat-active",
            "source_run_id": "run-newer",
        }
        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False), \
            mock.patch(
                "durable_interaction_host.prepare_session_memory_replacement"
            ) as prepare, \
            mock.patch("durable_interaction_host._execution_control_cancel") as cancel:
            store = memory_factory._build_session_store(data_dir)
            store.save(
                "chat-active",
                {
                    "messages": [{"role": "user", "content": "newer"}],
                    "execution_checkpoint": checkpoint,
                },
            )

            with self.assertRaises(memory_factory.MemorySessionReplaceError) as raised:
                memory_factory.replace_short_term_session_memory(
                    session_id="chat-active",
                    messages=[{"role": "user", "content": "stale"}],
                    options={},
                    operation_id="replace-active",
                    expected_session_revision=1,
                    expected_cancel_attempt_id="",
                )
            persisted = store.load_with_revision("chat-active")

        self.assertEqual(raised.exception.code, "session_memory_replace_conflict")
        self.assertEqual(persisted.revision, 1)
        self.assertEqual(persisted.state["execution_checkpoint"], checkpoint)
        self.assertNotIn("memory_replace_receipts", persisted.state)
        prepare.assert_not_called()
        cancel.assert_not_called()

    def test_idempotent_memory_replace_does_not_cancel_unmatched_orphan(self) -> None:
        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False), \
            mock.patch(
                "durable_interaction_host.prepare_session_memory_replacement"
            ) as prepare, \
            mock.patch("durable_interaction_host._execution_control_cancel") as cancel:
            store = memory_factory._build_session_store(data_dir)
            store.save(
                "chat-orphan",
                {
                    "messages": [{"role": "user", "content": "newer"}],
                    "execution_checkpoint_domain": {
                        "schema_version": 1,
                        "execution_id": "chat-orphan",
                        "owner_id": "run-orphan",
                        "checkpoint_id": "checkpoint-orphan",
                        "fencing_token": 1,
                    },
                    "interaction_journal": {
                        "active_id": "interaction-orphan",
                        "entries": {
                            "interaction-orphan": {
                                "request": {"source_run_id": "run-orphan"},
                            }
                        },
                    },
                },
            )

            with self.assertRaises(memory_factory.MemorySessionReplaceError) as raised:
                memory_factory.replace_short_term_session_memory(
                    session_id="chat-orphan",
                    messages=[],
                    options={},
                    operation_id="replace-orphan",
                    expected_session_revision=1,
                    expected_cancel_attempt_id="",
                )
            persisted = store.load_with_revision("chat-orphan")

        self.assertEqual(raised.exception.code, "session_memory_replace_conflict")
        self.assertEqual(persisted.revision, 1)
        self.assertIn("execution_checkpoint_domain", persisted.state)
        prepare.assert_not_called()
        cancel.assert_not_called()

    def test_idempotent_memory_replace_forwards_exact_cancel_attempt(self) -> None:
        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False):
            store = memory_factory._build_session_store(data_dir)
            store.save(
                "chat-exact",
                {
                    "messages": [{"role": "user", "content": "old"}],
                    "execution_checkpoint": {
                        "session_id": "chat-exact",
                        "source_run_id": "run-exact",
                    },
                },
            )

            def clear_expected_checkpoint(session_id, *, expected_cancel_attempt_id):
                self.assertEqual(session_id, "chat-exact")
                self.assertEqual(expected_cancel_attempt_id, "run-exact")
                snapshot = store.load_with_revision(session_id)
                state = snapshot.state
                state.pop("execution_checkpoint", None)
                store.save_if_revision(session_id, state, snapshot.revision)
                return {
                    "execution_checkpoint_cleared": True,
                    "orphaned_interaction_repaired": False,
                }

            with mock.patch(
                "durable_interaction_host.prepare_session_memory_replacement",
                side_effect=clear_expected_checkpoint,
            ) as prepare:
                result = memory_factory.replace_short_term_session_memory(
                    session_id="chat-exact",
                    messages=[{"role": "user", "content": "replacement"}],
                    options={},
                    operation_id="replace-exact",
                    expected_session_revision=1,
                    expected_cancel_attempt_id="run-exact",
                )
            persisted = store.load_with_revision("chat-exact")

        self.assertTrue(result["execution_checkpoint_cleared"])
        self.assertEqual(result["session_revision"], 4)
        self.assertEqual(persisted.state["messages"], [
            {"role": "user", "content": "replacement"}
        ])
        prepare.assert_called_once()

    def test_idempotent_memory_replace_rejects_run_completion_after_claim(self) -> None:
        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False), \
            mock.patch.object(memory_factory, "_fresh_vector_collection_tag") as fresh_tag:
            store = memory_factory._build_session_store(data_dir)
            store.save(
                "chat-completes-after-claim",
                {"messages": [{"role": "user", "content": "baseline"}]},
            )

            def complete_new_run(session_id, *, expected_cancel_attempt_id):
                self.assertEqual(expected_cancel_attempt_id, "")
                snapshot = store.load_with_revision(session_id)
                state = snapshot.state
                state["messages"] = [
                    {"role": "user", "content": "new-run-user"},
                    {"role": "assistant", "content": "new-run-answer"},
                ]
                store.save_if_revision(session_id, state, snapshot.revision)
                return {
                    "execution_checkpoint_cleared": False,
                    "orphaned_interaction_repaired": False,
                }

            with mock.patch(
                "durable_interaction_host.prepare_session_memory_replacement",
                side_effect=complete_new_run,
            ), self.assertRaises(memory_factory.MemorySessionReplaceError) as raised:
                memory_factory.replace_short_term_session_memory(
                    session_id="chat-completes-after-claim",
                    messages=[{"role": "user", "content": "stale replacement"}],
                    options={},
                    operation_id="replace-race",
                    expected_session_revision=1,
                )
            persisted = store.load_with_revision("chat-completes-after-claim")

        self.assertEqual(raised.exception.code, "session_revision_conflict")
        self.assertEqual(
            persisted.state["messages"],
            [
                {"role": "user", "content": "new-run-user"},
                {"role": "assistant", "content": "new-run-answer"},
            ],
        )
        self.assertEqual(persisted.revision, 4)
        self.assertNotIn("memory_replace_receipts", persisted.state)
        fresh_tag.assert_not_called()

    def test_failed_idempotent_memory_replace_can_retry_owned_pending_claim(self) -> None:
        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False), \
            mock.patch(
                "durable_interaction_host.prepare_session_memory_replacement",
                side_effect=[
                    RuntimeError("prepare failed"),
                    {
                        "execution_checkpoint_cleared": False,
                        "orphaned_interaction_repaired": False,
                    },
                ],
            ) as prepare:
            with self.assertRaisesRegex(RuntimeError, "prepare failed"):
                memory_factory.replace_short_term_session_memory(
                    session_id="chat-failed",
                    messages=[],
                    options={},
                    operation_id="replace-failed",
                    expected_session_revision=0,
                )
            after_failure = memory_factory._build_session_store(
                data_dir
            ).load_with_revision("chat-failed")
            retry = memory_factory.replace_short_term_session_memory(
                session_id="chat-failed",
                messages=[],
                options={},
                operation_id="replace-failed",
                expected_session_revision=0,
            )
            persisted = memory_factory._build_session_store(data_dir).load_with_revision(
                "chat-failed"
            )

        self.assertEqual(after_failure.revision, 1)
        self.assertEqual(
            after_failure.state["memory_replace_receipts"]["entries"][
                "replace-failed"
            ]["status"],
            "pending",
        )
        self.assertFalse(retry["replayed"])
        self.assertEqual(persisted.revision, 3)
        self.assertEqual(
            persisted.state["memory_replace_receipts"]["entries"][
                "replace-failed"
            ]["status"],
            "terminal",
        )
        self.assertEqual(prepare.call_count, 2)

    def test_concurrent_duplicate_memory_replace_executes_once(self) -> None:
        entered_prepare = threading.Event()
        release_prepare = threading.Event()
        results: list[dict[str, object]] = []
        errors: list[Exception] = []

        def prepare(_session_id, *, expected_cancel_attempt_id):
            self.assertEqual(expected_cancel_attempt_id, "")
            entered_prepare.set()
            release_prepare.wait(timeout=5)
            return {
                "execution_checkpoint_cleared": False,
                "orphaned_interaction_repaired": False,
            }

        def invoke() -> None:
            try:
                results.append(
                    memory_factory.replace_short_term_session_memory(
                        session_id="chat-concurrent-same",
                        messages=[{"role": "user", "content": "replacement"}],
                        options={},
                        operation_id="replace-same",
                        expected_session_revision=0,
                    )
                )
            except Exception as exc:  # pragma: no cover - asserted below
                errors.append(exc)

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False), \
            mock.patch(
                "durable_interaction_host.prepare_session_memory_replacement",
                side_effect=prepare,
            ) as prepare_mock:
            first_thread = threading.Thread(target=invoke)
            second_thread = threading.Thread(target=invoke)
            first_thread.start()
            self.assertTrue(entered_prepare.wait(timeout=5))
            second_thread.start()
            time.sleep(0.05)
            release_prepare.set()
            first_thread.join(timeout=5)
            second_thread.join(timeout=5)

        self.assertEqual(errors, [])
        self.assertEqual(len(results), 2)
        self.assertEqual(sorted(item["replayed"] for item in results), [False, True])
        prepare_mock.assert_called_once()

    def test_concurrent_different_memory_replace_with_same_revision_commits_one(self) -> None:
        entered_prepare = threading.Event()
        release_prepare = threading.Event()
        results: list[dict[str, object]] = []
        errors: list[Exception] = []

        def prepare(_session_id, *, expected_cancel_attempt_id):
            del expected_cancel_attempt_id
            entered_prepare.set()
            release_prepare.wait(timeout=5)
            return {
                "execution_checkpoint_cleared": False,
                "orphaned_interaction_repaired": False,
            }

        def invoke(operation_id: str) -> None:
            try:
                results.append(
                    memory_factory.replace_short_term_session_memory(
                        session_id="chat-concurrent-different",
                        messages=[{"role": "user", "content": operation_id}],
                        options={},
                        operation_id=operation_id,
                    )
                )
            except Exception as exc:
                errors.append(exc)

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False), \
            mock.patch(
                "durable_interaction_host.prepare_session_memory_replacement",
                side_effect=prepare,
            ) as prepare_mock:
            first_thread = threading.Thread(target=invoke, args=("replace-a",))
            second_thread = threading.Thread(target=invoke, args=("replace-b",))
            first_thread.start()
            self.assertTrue(entered_prepare.wait(timeout=5))
            second_thread.start()
            time.sleep(0.05)
            release_prepare.set()
            first_thread.join(timeout=5)
            second_thread.join(timeout=5)

        self.assertEqual(len(results), 1)
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            getattr(errors[0], "code", ""),
            "session_revision_conflict",
        )
        prepare_mock.assert_called_once()

    def test_memory_replace_takes_over_dead_pending_owner_but_not_live_pid_reuse(self) -> None:
        messages = [{"role": "user", "content": "replacement"}]
        payload_hash = memory_factory._memory_replace_payload_hash(
            session_id="chat-takeover",
            messages=messages,
            options={},
            expected_cancel_attempt_id="",
        )
        now_ms = int(time.time() * 1000)

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False), \
            mock.patch(
                "durable_interaction_host.prepare_session_memory_replacement",
                return_value={
                    "execution_checkpoint_cleared": False,
                    "orphaned_interaction_repaired": False,
                },
            ) as prepare:
            store = memory_factory._build_session_store(data_dir)
            dead_pending = {
                "schema_version": 1,
                "order": ["replace-takeover"],
                "entries": {
                    "replace-takeover": {
                        "payload_hash": payload_hash,
                        "status": "pending",
                        "owner_id": "dead-process",
                        "owner_pid": 987654321,
                        "attempt_id": "dead-attempt",
                        "expected_session_revision": 0,
                        "claim_base_revision": 0,
                        "baseline_messages_hash": (
                            memory_factory._memory_replace_messages_hash([])
                        ),
                        "claimed_at_ms": now_ms,
                        "lease_expires_at_ms": now_ms + 60_000,
                    }
                },
            }
            store.save("chat-takeover", {"memory_replace_receipts": dead_pending})
            with mock.patch.object(os, "kill", side_effect=ProcessLookupError):
                result = memory_factory.replace_short_term_session_memory(
                    session_id="chat-takeover",
                    messages=messages,
                    options={},
                    operation_id="replace-takeover",
                    expected_session_revision=0,
                )

            changed_pending = copy.deepcopy(dead_pending)
            changed_pending["entries"]["replace-takeover"]["payload_hash"] = (
                memory_factory._memory_replace_payload_hash(
                    session_id="chat-takeover-changed",
                    messages=messages,
                    options={},
                    expected_cancel_attempt_id="",
                )
            )
            store.save(
                "chat-takeover-changed",
                {
                    "messages": [{"role": "user", "content": "new-run"}],
                    "memory_replace_receipts": changed_pending,
                },
            )
            with mock.patch.object(os, "kill", side_effect=ProcessLookupError), \
                self.assertRaises(memory_factory.MemorySessionReplaceError) as changed:
                memory_factory.replace_short_term_session_memory(
                    session_id="chat-takeover-changed",
                    messages=messages,
                    options={},
                    operation_id="replace-takeover",
                    expected_session_revision=0,
                )

            live_pending = copy.deepcopy(dead_pending)
            live_pending["entries"]["replace-takeover"]["payload_hash"] = (
                memory_factory._memory_replace_payload_hash(
                    session_id="chat-pid-reuse",
                    messages=messages,
                    options={},
                    expected_cancel_attempt_id="",
                )
            )
            live_pending["entries"]["replace-takeover"]["owner_id"] = "reused-pid"
            live_pending["entries"]["replace-takeover"]["owner_pid"] = os.getpid()
            store.save("chat-pid-reuse", {"memory_replace_receipts": live_pending})
            with self.assertRaises(memory_factory.MemorySessionReplaceError) as raised:
                memory_factory.replace_short_term_session_memory(
                    session_id="chat-pid-reuse",
                    messages=messages,
                    options={},
                    operation_id="replace-takeover",
                    expected_session_revision=0,
                )

        self.assertFalse(result["replayed"])
        self.assertEqual(raised.exception.code, "memory_replace_in_progress")
        self.assertEqual(changed.exception.code, "session_revision_conflict")
        prepare.assert_called_once()

    def test_memory_replace_receipt_ledger_remains_bounded(self) -> None:
        entries = {
            f"old-{index}": {
                "payload_hash": f"hash-{index}",
                "status": "terminal",
                "response": {"applied": True},
            }
            for index in range(64)
        }
        ledger = {
            "schema_version": 1,
            "order": list(entries),
            "entries": entries,
        }

        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False), \
            mock.patch(
                "durable_interaction_host.prepare_session_memory_replacement",
                return_value={
                    "execution_checkpoint_cleared": False,
                    "orphaned_interaction_repaired": False,
                },
            ):
            store = memory_factory._build_session_store(data_dir)
            store.save("chat-bounded", {"memory_replace_receipts": ledger})
            memory_factory.replace_short_term_session_memory(
                session_id="chat-bounded",
                messages=[],
                options={},
                operation_id="replace-new",
                expected_session_revision=1,
            )
            persisted = store.load_with_revision("chat-bounded")

        persisted_ledger = persisted.state["memory_replace_receipts"]
        self.assertEqual(len(persisted_ledger["order"]), 64)
        self.assertNotIn("old-0", persisted_ledger["entries"])
        self.assertEqual(
            persisted_ledger["entries"]["replace-new"]["status"],
            "terminal",
        )

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

    def test_patch_memory_commit_forwards_session_revision_and_summary(self) -> None:
        from unchain.memory import InMemorySessionStore

        class FakeManager:
            def __init__(self):
                self.store = InMemorySessionStore()
                self.store.save(
                    "chat-test",
                    {"messages": [{"role": "user", "content": "old"}]},
                )
                self.committed_payload = None

            def commit_messages(
                self,
                *,
                session_id: str,
                full_conversation,
                expected_revision=None,
                summary_text=None,
                clear_execution_checkpoint_id=None,
            ):
                self.committed_payload = {
                    "session_id": session_id,
                    "full_conversation": full_conversation,
                    "expected_revision": expected_revision,
                    "summary_text": summary_text,
                    "clear_execution_checkpoint_id": clear_execution_checkpoint_id,
                }
                return "committed"

        manager = FakeManager()
        memory_factory._patch_memory_commit_with_overlap(manager)

        result = manager.commit_messages(
            session_id="chat-test",
            full_conversation=[{"role": "assistant", "content": "new"}],
            summary_text="summary",
            clear_execution_checkpoint_id="checkpoint-1",
        )

        self.assertEqual(result, "committed")
        self.assertEqual(manager.committed_payload["expected_revision"], 1)
        self.assertEqual(manager.committed_payload["summary_text"], "summary")
        self.assertEqual(
            manager.committed_payload["clear_execution_checkpoint_id"],
            "checkpoint-1",
        )
        self.assertEqual(
            manager.committed_payload["full_conversation"],
            [
                {"role": "user", "content": "old"},
                {"role": "assistant", "content": "new"},
            ],
        )

    def test_patch_memory_commit_forwards_execution_fence_by_identity(self) -> None:
        from unchain.memory import InMemorySessionStore

        class FakeManager:
            def __init__(self):
                self.store = InMemorySessionStore()
                self.received_execution_fence = None

            def commit_messages(
                self,
                *,
                session_id: str,
                full_conversation,
                execution_fence=None,
            ):
                del session_id, full_conversation
                self.received_execution_fence = execution_fence
                return "committed"

        manager = FakeManager()
        memory_factory._patch_memory_commit_with_overlap(manager)
        execution_fence = object()

        result = manager.commit_messages(
            session_id="chat-test",
            full_conversation=[{"role": "user", "content": "new"}],
            execution_fence=execution_fence,
        )

        self.assertEqual(result, "committed")
        self.assertIs(manager.received_execution_fence, execution_fence)

    def test_patch_memory_commit_forwards_future_keyword_and_preserves_signature(
        self,
    ) -> None:
        from unchain.memory import InMemorySessionStore

        class FakeManager:
            def __init__(self):
                self.store = InMemorySessionStore()
                self.received_future_token = None

            def commit_messages(
                self,
                *,
                session_id: str,
                full_conversation,
                future_safety_token=None,
            ):
                del session_id, full_conversation
                self.received_future_token = future_safety_token
                return "committed"

        manager = FakeManager()
        original_signature = inspect.signature(manager.commit_messages)
        memory_factory._patch_memory_commit_with_overlap(manager)
        future_token = object()

        result = manager.commit_messages(
            session_id="chat-test",
            full_conversation=[{"role": "user", "content": "new"}],
            future_safety_token=future_token,
        )

        self.assertEqual(result, "committed")
        self.assertIs(manager.received_future_token, future_token)
        self.assertEqual(inspect.signature(manager.commit_messages), original_signature)

    def test_patch_memory_commit_forwards_durable_receipt_ledger_by_identity(
        self,
    ) -> None:
        from unchain.memory import InMemorySessionStore

        class FakeManager:
            def __init__(self):
                self.store = InMemorySessionStore()
                self.received_ledger = None

            def commit_messages(
                self,
                *,
                session_id: str,
                full_conversation,
                durable_receipt_ledger=None,
            ):
                del session_id, full_conversation
                self.received_ledger = durable_receipt_ledger
                return "committed"

        manager = FakeManager()
        memory_factory._patch_memory_commit_with_overlap(manager)
        ledger = {"pending": {"receipt-1": {"receipt_id": "receipt-1"}}}

        result = manager.commit_messages(
            session_id="chat-test",
            full_conversation=[{"role": "user", "content": "new"}],
            durable_receipt_ledger=ledger,
        )

        self.assertEqual(result, "committed")
        self.assertIs(manager.received_ledger, ledger)

    def test_patch_memory_commit_updates_semantic_args_inside_var_keyword(
        self,
    ) -> None:
        from unchain.memory import InMemorySessionStore

        class GenericManager:
            def __init__(self):
                self.store = InMemorySessionStore()
                self.received_kwargs = None

            def commit_messages(self, **kwargs):
                self.received_kwargs = kwargs
                return "committed"

        manager = GenericManager()
        manager.store.save(
            "chat-test",
            {"messages": [{"role": "user", "content": "existing"}]},
        )
        original_signature = inspect.signature(manager.commit_messages)
        memory_factory._patch_memory_commit_with_overlap(manager)

        result = manager.commit_messages(
            session_id="chat-test",
            full_conversation=[{"role": "assistant", "content": "new"}],
        )

        self.assertEqual(result, "committed")
        self.assertEqual(
            manager.received_kwargs["full_conversation"],
            [
                {"role": "user", "content": "existing"},
                {"role": "assistant", "content": "new"},
            ],
        )
        self.assertIn("expected_revision", manager.received_kwargs)
        self.assertEqual(inspect.signature(manager.commit_messages), original_signature)

    def test_patch_memory_commit_accepts_real_fenced_runtime_commit(self) -> None:
        from unchain.execution import ExecutionRuntime
        from unchain.memory import (
            JsonFileSessionStore,
            KernelMemoryRuntime,
            MemoryConfig,
            MemoryManager,
        )

        with tempfile.TemporaryDirectory() as data_dir:
            store = JsonFileSessionStore(base_dir=data_dir)
            manager = MemoryManager(config=MemoryConfig(), store=store)
            memory_factory._patch_memory_commit_with_overlap(manager)
            runtime = KernelMemoryRuntime.from_memory_manager(manager)

            with ExecutionRuntime(store).scope("chat-test") as guard:
                commit_info, stored_state = runtime.commit_transcript(
                    session_id="chat-test",
                    transcript=[{"role": "user", "content": "hello"}],
                    memory_namespace=None,
                    model="test-model",
                    summary_text=None,
                    execution_fence=guard.fence,
                )

        self.assertTrue(commit_info["applied"])
        self.assertEqual(
            stored_state["messages"],
            [{"role": "user", "content": "hello"}],
        )

    def test_patch_memory_commit_persists_real_durable_receipt_with_fence(self) -> None:
        try:
            from unchain.tools.receipts import (
                DURABLE_TOOL_RECEIPT_LEDGER_KEY,
                TOOL_RECEIPT_JOURNAL_KEY,
                build_durable_tool_receipt,
                durable_tool_receipt_state_update,
            )
        except ImportError:
            self.skipTest("installed Unchain predates durable tool receipts")

        from unchain.execution import ExecutionRuntime
        from unchain.memory import (
            JsonFileSessionStore,
            KernelMemoryRuntime,
            MemoryConfig,
            MemoryManager,
        )

        receipt = build_durable_tool_receipt(
            source="tests.pupu_memory_contract",
            receipt_id="receipt:pupu-memory-contract",
            execution_id="chat-test",
            logical_execution_id="logical:chat-test",
            created_by_attempt_id="attempt:pupu-memory-contract",
            tool_call_id="call:pupu-memory-contract",
            request_digest="a" * 64,
            result_digest="b" * 64,
            payload={"job_id": "job:pupu-memory-contract"},
        )
        ledger = durable_tool_receipt_state_update(None, receipt)[
            DURABLE_TOOL_RECEIPT_LEDGER_KEY
        ]

        with tempfile.TemporaryDirectory() as data_dir:
            store = JsonFileSessionStore(base_dir=data_dir)
            manager = MemoryManager(config=MemoryConfig(), store=store)
            memory_factory._patch_memory_commit_with_overlap(manager)
            runtime = KernelMemoryRuntime.from_memory_manager(manager)

            with ExecutionRuntime(store).scope("chat-test") as guard:
                commit_info, stored_state = runtime.commit_transcript(
                    session_id="chat-test",
                    transcript=[{"role": "user", "content": "hello"}],
                    memory_namespace=None,
                    model="test-model",
                    summary_text=None,
                    durable_receipt_ledger=ledger,
                    execution_fence=guard.fence,
                )

        self.assertEqual(commit_info["durable_tool_receipt_applied_count"], 1)
        self.assertEqual(len(stored_state[TOOL_RECEIPT_JOURNAL_KEY]["applications"]), 1)

    def test_patch_memory_commit_isolates_concurrent_chat_execution_leases(self) -> None:
        from unchain.execution import ExecutionRuntime
        from unchain.memory import (
            JsonFileSessionStore,
            KernelMemoryRuntime,
            MemoryConfig,
            MemoryManager,
        )

        with tempfile.TemporaryDirectory() as data_dir:
            store = JsonFileSessionStore(base_dir=data_dir)
            manager = MemoryManager(config=MemoryConfig(), store=store)
            memory_factory._patch_memory_commit_with_overlap(manager)
            memory_runtime = KernelMemoryRuntime.from_memory_manager(manager)
            execution_runtime = ExecutionRuntime(store)
            start_barrier = threading.Barrier(2)
            results = {}
            errors = []

            def commit_chat(session_id: str, content: str) -> None:
                try:
                    with execution_runtime.scope(session_id) as guard:
                        start_barrier.wait(timeout=3)
                        _commit_info, stored_state = memory_runtime.commit_transcript(
                            session_id=session_id,
                            transcript=[{"role": "user", "content": content}],
                            memory_namespace=None,
                            model="test-model",
                            summary_text=None,
                            execution_fence=guard.fence,
                        )
                        results[session_id] = stored_state
                except Exception as error:  # pragma: no cover - asserted below
                    errors.append(error)

            threads = [
                threading.Thread(
                    target=commit_chat,
                    args=("chat-a", "message-a"),
                    name="memory-commit-chat-a",
                ),
                threading.Thread(
                    target=commit_chat,
                    args=("chat-b", "message-b"),
                    name="memory-commit-chat-b",
                ),
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=5)

            self.assertTrue(all(not thread.is_alive() for thread in threads))
            self.assertEqual(errors, [])
            self.assertEqual(
                results["chat-a"]["messages"],
                [{"role": "user", "content": "message-a"}],
            )
            self.assertEqual(
                results["chat-b"]["messages"],
                [{"role": "user", "content": "message-b"}],
            )
            self.assertEqual(
                store.load("chat-a")["messages"],
                results["chat-a"]["messages"],
            )
            self.assertEqual(
                store.load("chat-b")["messages"],
                results["chat-b"]["messages"],
            )

    def test_patch_memory_commit_rejects_unforwardable_execution_fence(self) -> None:
        from unchain.memory import InMemorySessionStore

        class LegacyManager:
            def __init__(self):
                self.store = InMemorySessionStore()
                self.commit_called = False

            def commit_messages(self, *, session_id: str, full_conversation):
                del session_id, full_conversation
                self.commit_called = True

        manager = LegacyManager()
        memory_factory._patch_memory_commit_with_overlap(manager)

        with self.assertRaisesRegex(
            RuntimeError,
            "memory commit execution fencing is unsupported",
        ):
            manager.commit_messages(
                session_id="chat-test",
                full_conversation=[{"role": "user", "content": "new"}],
                execution_fence=object(),
            )

        self.assertFalse(manager.commit_called)

    def test_patch_memory_commit_rejects_unforwardable_durable_receipt(self) -> None:
        from unchain.memory import InMemorySessionStore

        class LegacyManager:
            def __init__(self):
                self.store = InMemorySessionStore()
                self.commit_called = False

            def commit_messages(self, *, session_id: str, full_conversation):
                del session_id, full_conversation
                self.commit_called = True

        manager = LegacyManager()
        memory_factory._patch_memory_commit_with_overlap(manager)

        with self.assertRaisesRegex(
            RuntimeError,
            "memory commit durable receipt ledger is unsupported",
        ):
            manager.commit_messages(
                session_id="chat-test",
                full_conversation=[{"role": "user", "content": "new"}],
                durable_receipt_ledger={"pending": {"receipt-1": {}}},
            )

        self.assertFalse(manager.commit_called)

    def test_patch_memory_commit_keeps_legacy_no_fence_call_compatible(self) -> None:
        from unchain.memory import InMemorySessionStore

        class LegacyManager:
            def __init__(self):
                self.store = InMemorySessionStore()
                self.committed_payload = None

            def commit_messages(self, *, session_id: str, full_conversation):
                self.committed_payload = {
                    "session_id": session_id,
                    "full_conversation": full_conversation,
                }
                return "legacy-committed"

        manager = LegacyManager()
        memory_factory._patch_memory_commit_with_overlap(manager)

        result = manager.commit_messages(
            session_id="chat-test",
            full_conversation=[{"role": "user", "content": "new"}],
            execution_fence=None,
        )

        self.assertEqual(result, "legacy-committed")
        self.assertEqual(
            manager.committed_payload,
            {
                "session_id": "chat-test",
                "full_conversation": [{"role": "user", "content": "new"}],
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

    def test_patch_memory_prepare_forwards_future_keyword_and_preserves_signature(
        self,
    ) -> None:
        class FakeManager:
            def __init__(self):
                self.config = types.SimpleNamespace(vector_top_k=0, vector_adapter=None)
                self._last_prepare_info = {}
                self.received_future_token = None

            def prepare_messages(
                self,
                session_id: str,
                incoming,
                *,
                max_context_window_tokens: int,
                model: str,
                future_prepare_token=None,
            ):
                del session_id, max_context_window_tokens, model
                self.received_future_token = future_prepare_token
                return incoming

        manager = FakeManager()
        original_signature = inspect.signature(manager.prepare_messages)
        memory_factory._patch_memory_prepare_with_diagnostics(manager)
        future_token = object()

        prepared = manager.prepare_messages(
            session_id="chat-test",
            incoming=[{"role": "user", "content": "hello"}],
            max_context_window_tokens=1024,
            model="test-model",
            future_prepare_token=future_token,
        )

        self.assertEqual(prepared, [{"role": "user", "content": "hello"}])
        self.assertIs(manager.received_future_token, future_token)
        self.assertEqual(inspect.signature(manager.prepare_messages), original_signature)

    def test_patch_memory_prepare_updates_incoming_inside_var_keyword(self) -> None:
        class GenericManager:
            def __init__(self):
                self.config = types.SimpleNamespace(vector_top_k=0, vector_adapter=None)
                self._last_prepare_info = {}
                self.received_kwargs = None

            def prepare_messages(self, **kwargs):
                self.received_kwargs = copy.deepcopy(kwargs)
                return kwargs["incoming"]

        manager = GenericManager()
        original_signature = inspect.signature(manager.prepare_messages)
        memory_factory._patch_memory_prepare_with_diagnostics(manager)

        prepared = manager.prepare_messages(
            session_id="chat-test",
            incoming=[
                {"role": "User", "content": "kept"},
                {"role": "tool", "content": "removed"},
            ],
            max_context_window_tokens=1024,
            model="test-model",
        )

        expected = [{"role": "user", "content": "kept"}]
        self.assertEqual(prepared, expected)
        self.assertEqual(manager.received_kwargs["incoming"], expected)
        self.assertEqual(inspect.signature(manager.prepare_messages), original_signature)

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

    def test_patch_memory_prepare_with_diagnostics_sanitizes_without_prewrite(self) -> None:
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
                        "execution_checkpoint": {
                            "checkpoint_id": "checkpoint-1",
                            "replay_frame": {
                                "format": "openai.responses.v1",
                                "complete": True,
                                "items": [
                                    {
                                        "type": "reasoning",
                                        "encrypted_content": "opaque",
                                    }
                                ],
                            },
                        },
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
        self.assertEqual(manager.store.saved_states, [])
        self.assertEqual(manager.store.state["session_meta"], "keep")
        self.assertTrue(
            any(
                message.get("role") == "tool"
                for message in manager.store.state["messages"]
                if isinstance(message, dict)
            )
        )
        self.assertEqual(
            manager.store.state["execution_checkpoint"]["replay_frame"]["items"][0][
                "encrypted_content"
            ],
            "opaque",
        )

    def test_patch_memory_prepare_with_diagnostics_ignores_log_encoding_failures(self) -> None:
        class FakeManager:
            def __init__(self):
                self.config = types.SimpleNamespace(vector_top_k=2, vector_adapter=object())
                self._last_prepare_info = {
                    "vector_recall_count": 1,
                }
                self.store = None

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
                return [
                    {
                        "role": "system",
                        "content": "[MEMORY RECALL]\n- 中文记忆\n- emoji 😀",
                    },
                    {"role": "assistant", "content": "ok"},
                ]

        manager = FakeManager()
        memory_factory._patch_memory_prepare_with_diagnostics(manager)

        with mock.patch.object(
            memory_factory,
            "_safe_console_print",
            side_effect=UnicodeEncodeError("charmap", "中文😀", 0, 3, "boom"),
        ):
            prepared = manager.prepare_messages(
                session_id="chat-test",
                incoming=[{"role": "user", "content": "请记住这段中文 😀"}],
                max_context_window_tokens=1024,
                model="openai:gpt-4.1",
            )

        self.assertEqual(
            prepared,
            [
                {
                    "role": "system",
                    "content": "[MEMORY RECALL]\n- 中文记忆\n- emoji 😀",
                },
                {"role": "assistant", "content": "ok"},
            ],
        )
        self.assertEqual(manager._last_prepare_info["vector_recall_status"], "recalled")

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
                        types.SimpleNamespace(payload={"text": "alpha"}, score=0.31),
                        types.SimpleNamespace(payload={"text": "beta"}, score=0.82),
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

            def similarity_search(
                self,
                *,
                session_id: str,
                query: str,
                k: int,
                min_score: float | None = None,
                future_search_token=None,
            ):
                self.future_search_token = future_search_token
                collection = self._collection_name(session_id)
                self._ensure_collection(collection)
                query_vector = self._embed_fn([query])[0]
                results = self._client.search(
                    collection_name=collection,
                    query_vector=query_vector,
                    limit=k,
                )
                return [
                    {"text": result.payload["text"], "score": result.score}
                    for result in results
                    if min_score is None or result.score >= min_score
                ]

        adapter = FakeVectorAdapter()
        original_method = adapter.similarity_search.__func__
        memory_factory._patch_qdrant_similarity_search_compat(adapter)
        future_token = object()

        recalled = adapter.similarity_search(
            session_id="chat-123",
            query="why not 18.00",
            k=3,
            min_score=0.5,
            future_search_token=future_token,
        )

        self.assertEqual(recalled, [{"text": "beta", "score": 0.82}])
        self.assertIs(adapter.future_search_token, future_token)
        self.assertIs(adapter.similarity_search.__func__, original_method)
        self.assertEqual(adapter._ensured, ["chat_chat-123"])
        self.assertEqual(len(adapter._client.calls), 1)
        self.assertEqual(adapter._client.calls[0]["collection_name"], "chat_chat-123")
        self.assertEqual(adapter._client.calls[0]["limit"], 3)
        self.assertIn("query", adapter._client.calls[0])

    def test_patch_qdrant_similarity_search_compat_covers_long_term_adapter(
        self,
    ) -> None:
        class FakeClient:
            def __init__(self) -> None:
                self.calls = []

            def query_points(self, **kwargs):
                self.calls.append(kwargs)
                return types.SimpleNamespace(
                    points=[
                        types.SimpleNamespace(
                            payload={"text": "remembered"},
                            score=0.91,
                        )
                    ]
                )

        class FakeLongTermVectorAdapter:
            def __init__(self) -> None:
                self._client = FakeClient()
                self.future_search_token = None

            def similarity_search(
                self,
                *,
                namespace: str,
                query: str,
                k: int,
                filters=None,
                min_score: float | None = None,
                future_search_token=None,
            ):
                del namespace, query, min_score
                self.future_search_token = future_search_token
                results = self._client.search(
                    collection_name="long_term_test",
                    query_vector=[0.12, 0.34],
                    query_filter=filters,
                    limit=k,
                )
                return [
                    {"text": result.payload["text"], "score": result.score}
                    for result in results
                ]

        adapter = FakeLongTermVectorAdapter()
        original_method = adapter.similarity_search.__func__
        memory_factory._patch_qdrant_similarity_search_compat(adapter)
        future_token = object()

        recalled = adapter.similarity_search(
            namespace="user:test",
            query="remember this",
            k=2,
            filters={"kind": "fact"},
            min_score=0.5,
            future_search_token=future_token,
        )

        self.assertEqual(recalled, [{"text": "remembered", "score": 0.91}])
        self.assertIs(adapter.future_search_token, future_token)
        self.assertIs(adapter.similarity_search.__func__, original_method)
        self.assertEqual(adapter._client.calls[0]["query_filter"], {"kind": "fact"})
        self.assertIn("query", adapter._client.calls[0])

    def test_patch_qdrant_similarity_search_rejects_text_only_query_client(
        self,
    ) -> None:
        class TextQueryOnlyClient:
            def query(self, collection_name: str, query_text: str, **kwargs):
                del collection_name, query_text, kwargs
                return []

        adapter = types.SimpleNamespace(
            _client=TextQueryOnlyClient(),
            similarity_search=lambda **_kwargs: [],
        )

        with self.assertRaisesRegex(
            RuntimeError,
            "query.*text-oriented",
        ):
            memory_factory._patch_qdrant_similarity_search_compat(adapter)


if __name__ == "__main__":
    unittest.main()
