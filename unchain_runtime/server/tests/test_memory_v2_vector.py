import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from memory_v2_store import MemoryV2Store
from memory_v2_runtime import MemoryV2Runtime
from memory_v2_vector import (
    MemoryV2VectorCoordinator,
    NullVectorBackend,
    OllamaQdrantBackend,
    VectorConfig,
    VectorHit,
    _reset_memory_v2_vector_for_tests,
    deterministic_chunks,
    get_memory_v2_vector_coordinator,
    weighted_rrf,
)


VECTOR_ENV_KEYS = {
    "PUPU_MEMORY_V2_VECTOR_PROVIDER",
    "PUPU_MEMORY_V2_VECTOR_MODEL",
    "PUPU_MEMORY_V2_VECTOR_OLLAMA_BASE_URL",
    "PUPU_MEMORY_V2_VECTOR_TIMEOUT_MS",
}


class FakeVectorBackend:
    provider_identity = "vector:ollama:fake"

    def __init__(self, *, fail=False):
        self.fail = fail
        self.index_calls = 0
        self.query_calls = 0
        self.delete_calls = []
        self.chunks = []

    def status(self):
        return "warming"

    def index_chunks(self, chunks):
        self.index_calls += 1
        if self.fail:
            raise TimeoutError("synthetic timeout")
        self.chunks.extend(chunks)
        return [f"external-{chunk.chunk_id}" for chunk in chunks]

    def query(self, _text, *, limit):
        self.query_calls += 1
        if self.fail:
            raise TimeoutError("synthetic timeout")
        return [
            VectorHit(
                chunk_id=chunk.chunk_id,
                text_hash=chunk.text_hash,
                score=0.9 - (index * 0.001),
            )
            for index, chunk in enumerate(self.chunks[:limit])
        ]

    def delete(self, external_ids):
        self.delete_calls.append(list(external_ids))

    def close(self):
        return None


class MemoryV2VectorTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name) / "memory_v2"
        self.store = MemoryV2Store(self.root)

    def tearDown(self):
        _reset_memory_v2_vector_for_tests()
        self.store.close()
        self.temp_dir.cleanup()

    def _chat_entry(self, *, content=b"planet mars", description="notes"):
        space = self.store.ensure_space(
            scope_kind="chat",
            scope_key="chat_a",
            owner_chat_id="chat_a",
            name="Chat memory",
            operation_id="space_chat_a",
        )
        entry = self.store.create_entry(
            owner_chat_id="chat_a",
            space_id=space["space_id"],
            path="/fact.md",
            kind="file",
            description=description,
            mime_type="text/markdown",
            content=content,
            expected_space_revision=space["revision"],
            operation_id="entry_chat_a",
        )
        return space, entry

    def test_default_null_backend_has_no_optional_import_directory_or_thread(self):
        environ = {key: value for key, value in os.environ.items() if key not in VECTOR_ENV_KEYS}
        imported_before = set(sys.modules)
        threads_before = {(thread.ident, thread.name) for thread in threading.enumerate()}
        coordinator = get_memory_v2_vector_coordinator(
            root_dir=self.root,
            store=self.store,
            environ=environ,
        )
        self.assertIsInstance(coordinator._backend, NullVectorBackend)
        self.assertEqual(coordinator.status()["status"], "disabled")
        self.assertFalse((self.root / "vector").exists())
        self.assertFalse(
            any(
                name.startswith("qdrant_client")
                for name in set(sys.modules) - imported_before
            )
        )
        self.assertEqual(
            {(thread.ident, thread.name) for thread in threading.enumerate()},
            threads_before,
        )

    def test_only_explicit_complete_ollama_configuration_enables_backend(self):
        disabled = VectorConfig.from_environ({})
        missing_model = VectorConfig.from_environ(
            {"PUPU_MEMORY_V2_VECTOR_PROVIDER": "ollama"}
        )
        explicit = VectorConfig.from_environ(
            {
                "PUPU_MEMORY_V2_VECTOR_PROVIDER": "ollama",
                "PUPU_MEMORY_V2_VECTOR_MODEL": "nomic-embed-text",
            }
        )
        self.assertFalse(disabled.enabled)
        self.assertEqual(missing_model.configuration_error, "model_required")
        self.assertTrue(explicit.enabled)
        imported_before = set(sys.modules)
        backend = OllamaQdrantBackend(root_dir=self.root, config=explicit)
        self.assertEqual(backend.status(), "warming")
        self.assertEqual(backend._qdrant_path, self.root / "vector" / "qdrant")
        self.assertFalse((self.root / "vector").exists())
        self.assertFalse(
            any(
                name.startswith("qdrant_client")
                for name in set(sys.modules) - imported_before
            )
        )

    def test_qdrant_payload_contains_only_opaque_chunk_id_and_hash(self):
        config = VectorConfig.from_environ(
            {
                "PUPU_MEMORY_V2_VECTOR_PROVIDER": "ollama",
                "PUPU_MEMORY_V2_VECTOR_MODEL": "embed-test",
            }
        )
        backend = OllamaQdrantBackend(root_dir=self.root, config=config)
        chunks = deterministic_chunks(
            entry_id="entry_a",
            entry_revision=1,
            text="private body that must not enter payload",
        )

        class PointStruct:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)

        class Models:
            pass

        Models.PointStruct = PointStruct

        class Client:
            def __init__(self):
                self.points = []

            def upsert(self, *, collection_name, points, wait):
                self.points = points

        client = Client()
        backend._models = Models
        backend._embed = lambda texts: [[0.1, 0.2] for _ in texts]
        backend._ensure_client = lambda vector_size: client
        backend.index_chunks(chunks)
        self.assertEqual(
            set(client.points[0].payload),
            {"chunk_id", "text_hash"},
        )
        self.assertNotIn("private body", repr(client.points[0].payload))

    def test_scan_redacts_before_embedding_and_caps_source(self):
        space, entry = self._chat_entry(
            content=(b"password=super-secret " * 20000),
            description="token=description-secret",
        )
        batch = self.store.vector_scan_candidates(
            backend="vector:ollama:test",
            scope_kind="chat",
            owner_chat_id="chat_a",
            space_id=space["space_id"],
            limit=1,
        )
        text = batch["candidates"][0]["text"]
        self.assertNotIn("super-secret", text)
        self.assertNotIn("description-secret", text)
        self.assertLessEqual(len(text.encode("utf-8")), 256 * 1024)
        self.assertEqual(batch["candidates"][0]["entry_id"], entry["entry_id"])

    def test_index_commit_cas_rejects_stale_revision(self):
        space, entry = self._chat_entry()
        batch = self.store.vector_scan_candidates(
            backend="vector:ollama:race",
            scope_kind="chat",
            owner_chat_id="chat_a",
            space_id=space["space_id"],
            limit=1,
        )
        candidate = batch["candidates"][0]
        chunks = deterministic_chunks(
            entry_id=entry["entry_id"],
            entry_revision=entry["revision"],
            text=candidate["text"],
        )
        self.store.update_entry(
            owner_chat_id="chat_a",
            space_id=space["space_id"],
            entry_id=entry["entry_id"],
            expected_revision=entry["revision"],
            expected_space_revision=entry["space_revision"],
            operation_id="entry_update_race",
            description="new revision",
        )
        result = self.store.vector_commit_entry_index(
            backend="vector:ollama:race",
            space_id=space["space_id"],
            entry_id=entry["entry_id"],
            expected_entry_revision=entry["revision"],
            content_hash=candidate["content_hash"],
            chunks=[
                {
                    "chunk_id": chunk.chunk_id,
                    "ordinal": chunk.ordinal,
                    "text_hash": chunk.text_hash,
                    "external_id": f"external-{chunk.ordinal}",
                }
                for chunk in chunks
            ],
        )
        self.assertFalse(result["committed"])
        self.assertEqual(
            self.store.vector_authorize_hits(
                backend="vector:ollama:race",
                chunk_ids=[chunk.chunk_id for chunk in chunks],
                scope_kind="chat",
                owner_chat_id="chat_a",
                space_id=space["space_id"],
            ),
            [],
        )

    def test_hits_are_reauthorized_for_owner_namespace_and_current_revision(self):
        space, entry = self._chat_entry()
        candidate = self.store.vector_scan_candidates(
            backend="vector:ollama:auth",
            scope_kind="chat",
            owner_chat_id="chat_a",
            limit=1,
        )["candidates"][0]
        chunk = deterministic_chunks(
            entry_id=entry["entry_id"],
            entry_revision=entry["revision"],
            text=candidate["text"],
        )[0]
        self.store.vector_commit_entry_index(
            backend="vector:ollama:auth",
            space_id=space["space_id"],
            entry_id=entry["entry_id"],
            expected_entry_revision=entry["revision"],
            content_hash=candidate["content_hash"],
            chunks=[
                {
                    "chunk_id": chunk.chunk_id,
                    "ordinal": chunk.ordinal,
                    "text_hash": chunk.text_hash,
                    "external_id": "external-chat",
                }
            ],
        )
        self.assertEqual(
            len(
                self.store.vector_authorize_hits(
                    backend="vector:ollama:auth",
                    chunk_ids=[chunk.chunk_id],
                    scope_kind="chat",
                    owner_chat_id="chat_a",
                )
            ),
            1,
        )
        self.assertEqual(
            self.store.vector_authorize_hits(
                backend="vector:ollama:auth",
                chunk_ids=[chunk.chunk_id],
                scope_kind="chat",
                owner_chat_id="chat_b",
            ),
            [],
        )
        self.store.update_entry(
            owner_chat_id="chat_a",
            space_id=space["space_id"],
            entry_id=entry["entry_id"],
            expected_revision=entry["revision"],
            expected_space_revision=entry["space_revision"],
            operation_id="entry_update_auth",
            description="revision two",
        )
        self.assertEqual(
            self.store.vector_authorize_hits(
                backend="vector:ollama:auth",
                chunk_ids=[chunk.chunk_id],
                scope_kind="chat",
                owner_chat_id="chat_a",
            ),
            [],
        )

        long_space = self.store.ensure_space(
            scope_kind="long_term",
            scope_key="user:local",
            namespace="user:local",
            name="Long term",
            operation_id="space_long_term",
        )
        long_entry = self.store.create_entry(
            owner_chat_id="chat_a",
            space_id=long_space["space_id"],
            path="/long.md",
            kind="file",
            mime_type="text/markdown",
            content=b"long memory",
            expected_space_revision=long_space["revision"],
            operation_id="entry_long_term",
            allow_long_term=True,
            namespace="user:local",
        )
        long_candidate = self.store.vector_scan_candidates(
            backend="vector:ollama:auth",
            scope_kind="long_term",
            namespace="user:local",
            limit=1,
        )["candidates"][0]
        long_chunk = deterministic_chunks(
            entry_id=long_entry["entry_id"],
            entry_revision=long_entry["revision"],
            text=long_candidate["text"],
        )[0]
        self.store.vector_commit_entry_index(
            backend="vector:ollama:auth",
            space_id=long_space["space_id"],
            entry_id=long_entry["entry_id"],
            expected_entry_revision=long_entry["revision"],
            content_hash=long_candidate["content_hash"],
            chunks=[
                {
                    "chunk_id": long_chunk.chunk_id,
                    "ordinal": long_chunk.ordinal,
                    "text_hash": long_chunk.text_hash,
                    "external_id": "external-long",
                }
            ],
        )
        self.assertEqual(
            len(
                self.store.vector_authorize_hits(
                    backend="vector:ollama:auth",
                    chunk_ids=[long_chunk.chunk_id],
                    scope_kind="long_term",
                    namespace="user:local",
                )
            ),
            1,
        )
        self.assertEqual(
            self.store.vector_authorize_hits(
                backend="vector:ollama:auth",
                chunk_ids=[long_chunk.chunk_id],
                scope_kind="long_term",
                namespace="agent:other",
            ),
            [],
        )

    def test_successful_coordinator_adds_semantic_hit(self):
        space, entry = self._chat_entry(content=b"semantic planet")
        backend = FakeVectorBackend()
        config = VectorConfig.from_environ(
            {
                "PUPU_MEMORY_V2_VECTOR_PROVIDER": "ollama",
                "PUPU_MEMORY_V2_VECTOR_MODEL": "fake",
            }
        )
        coordinator = MemoryV2VectorCoordinator(
            store=self.store,
            config=config,
            backend=backend,
        )
        lexical = self.store.search_entries(
            owner_chat_id="chat_a",
            query="unrelated query",
            space_id=space["space_id"],
            limit=10,
        )
        self.assertEqual(lexical["results"], [])
        result = coordinator.hybrid_chat_search(
            lexical=lexical,
            owner_chat_id="chat_a",
            query="unrelated query",
            space_id=space["space_id"],
            limit=10,
        )
        self.assertEqual(result["vector_status"], "ready")
        self.assertEqual(result["results"][0]["entry_id"], entry["entry_id"])

    def test_runtime_status_chat_and_long_term_search_use_vector_coordinator(self):
        runtime = MemoryV2Runtime(
            data_dir=self.root.parent,
            root_dir=self.root,
            store=self.store,
        )
        space, chat_entry = self._chat_entry(content=b"semantic chat")
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(runtime.status()["vector_status"], "disabled")
            self.assertEqual(
                runtime.search_entries(
                    owner_chat_id="chat_a",
                    query="semantic",
                    space_id=space["space_id"],
                )["vector_status"],
                "disabled",
            )

        long_space = self.store.ensure_space(
            scope_kind="long_term",
            scope_key="user:runtime",
            namespace="user:runtime",
            name="Runtime long term",
            operation_id="space_runtime_long",
        )
        long_entry = self.store.create_entry(
            owner_chat_id="chat_a",
            space_id=long_space["space_id"],
            path="/runtime.md",
            kind="file",
            mime_type="text/markdown",
            content=b"semantic durable",
            expected_space_revision=long_space["revision"],
            operation_id="entry_runtime_long",
            allow_long_term=True,
            namespace="user:runtime",
        )
        backend = FakeVectorBackend()
        explicit = {
            "PUPU_MEMORY_V2_VECTOR_PROVIDER": "ollama",
            "PUPU_MEMORY_V2_VECTOR_MODEL": "fake",
        }
        with mock.patch.dict(os.environ, explicit, clear=True), mock.patch(
            "memory_v2_vector._build_backend",
            return_value=backend,
        ):
            chat_result = runtime.search_entries(
                owner_chat_id="chat_a",
                query="not lexical chat",
                space_id=space["space_id"],
                limit=10,
            )
            self.assertEqual(chat_result["results"][0]["entry_id"], chat_entry["entry_id"])
            long_result = runtime.search_long_term(
                namespace="user:runtime",
                query="not lexical durable",
                limit=10,
            )
            self.assertEqual(long_result["results"][0]["ref"], long_entry["ref"])
            self.assertIn(long_result["vector_status"], {"warming", "ready"})

    def test_vector_failure_degrades_and_circuit_keeps_lexical_results(self):
        space, entry = self._chat_entry(content=b"lexical needle")
        backend = FakeVectorBackend(fail=True)
        config = VectorConfig.from_environ(
            {
                "PUPU_MEMORY_V2_VECTOR_PROVIDER": "ollama",
                "PUPU_MEMORY_V2_VECTOR_MODEL": "fake",
            }
        )
        coordinator = MemoryV2VectorCoordinator(
            store=self.store,
            config=config,
            backend=backend,
            clock=lambda: 1000,
            failure_threshold=3,
        )
        lexical = self.store.search_entries(
            owner_chat_id="chat_a",
            query="needle",
            space_id=space["space_id"],
            limit=10,
        )
        for _ in range(4):
            result = coordinator.hybrid_chat_search(
                lexical=lexical,
                owner_chat_id="chat_a",
                query="needle",
                space_id=space["space_id"],
                limit=10,
            )
            self.assertEqual(result["results"][0]["entry_id"], entry["entry_id"])
        self.assertEqual(result["vector_status"], "degraded")
        self.assertEqual(backend.index_calls, 3)
        self.assertEqual(coordinator.status()["failure_count"], 3)

    def test_weighted_rrf_is_stable_and_exact_lexical_match_stays_first(self):
        lexical = [
            {"entry_id": "b", "path": "/other.md", "name": "other.md"},
            {"entry_id": "a", "path": "/target.md", "name": "target.md"},
        ]
        vector = [
            {"entry_id": "c", "path": "/semantic.md", "name": "semantic.md"},
            {"entry_id": "b", "path": "/other.md", "name": "other.md"},
        ]
        first = weighted_rrf(
            query="/target.md",
            lexical_results=lexical,
            vector_results=vector,
            limit=10,
        )
        second = weighted_rrf(
            query="/target.md",
            lexical_results=lexical,
            vector_results=vector,
            limit=10,
        )
        self.assertEqual(first, second)
        self.assertEqual(first[0]["entry_id"], "a")
        self.assertEqual([item["entry_id"] for item in first], ["a", "b", "c"])


if __name__ == "__main__":
    unittest.main()
