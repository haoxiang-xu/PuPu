"""Explicit, fail-open-to-lexical vector retrieval for Memory V2.

This module deliberately has no optional-provider imports or filesystem side
effects at import time.  The default backend is a no-op.  Ollama embeddings and
the local Qdrant client are initialized only after an explicit provider/model
configuration and only when a search first needs vector work.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence, TYPE_CHECKING
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from net_tls import get_outbound_ssl_context

if TYPE_CHECKING:
    from memory_v2_store import MemoryV2Store


VECTOR_PROVIDER_ENV = "PUPU_MEMORY_V2_VECTOR_PROVIDER"
VECTOR_MODEL_ENV = "PUPU_MEMORY_V2_VECTOR_MODEL"
OLLAMA_BASE_URL_ENV = "PUPU_MEMORY_V2_VECTOR_OLLAMA_BASE_URL"
VECTOR_TIMEOUT_MS_ENV = "PUPU_MEMORY_V2_VECTOR_TIMEOUT_MS"

DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_TIMEOUT_MS = 2500
MIN_TIMEOUT_MS = 250
MAX_TIMEOUT_MS = 15000
MAX_EMBED_RESPONSE_BYTES = 16 * 1024 * 1024
MAX_VECTOR_DIMENSIONS = 65536
MAX_INDEX_ENTRIES_PER_CALL = 2
MAX_VECTOR_QUERY_HITS = 500
RRF_K = 60
LEXICAL_RRF_WEIGHT = 2.0
VECTOR_RRF_WEIGHT = 1.0


def _bounded_int(raw: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(str(raw).strip())
    except (TypeError, ValueError):
        return default
    return min(maximum, max(minimum, parsed))


@dataclass(frozen=True)
class VectorConfig:
    provider: str = ""
    model: str = ""
    ollama_base_url: str = DEFAULT_OLLAMA_BASE_URL
    timeout_ms: int = DEFAULT_TIMEOUT_MS
    configuration_error: str = ""

    @classmethod
    def from_environ(cls, environ: Mapping[str, str] | None = None) -> "VectorConfig":
        source = os.environ if environ is None else environ
        provider = str(source.get(VECTOR_PROVIDER_ENV, "") or "").strip().lower()
        model = str(source.get(VECTOR_MODEL_ENV, "") or "").strip()
        base_url = str(
            source.get(OLLAMA_BASE_URL_ENV, DEFAULT_OLLAMA_BASE_URL)
            or DEFAULT_OLLAMA_BASE_URL
        ).strip().rstrip("/")
        timeout_ms = _bounded_int(
            source.get(VECTOR_TIMEOUT_MS_ENV),
            default=DEFAULT_TIMEOUT_MS,
            minimum=MIN_TIMEOUT_MS,
            maximum=MAX_TIMEOUT_MS,
        )
        if not provider:
            return cls(timeout_ms=timeout_ms)
        if provider != "ollama":
            return cls(
                provider=provider,
                model=model,
                ollama_base_url=base_url,
                timeout_ms=timeout_ms,
                configuration_error="unsupported_provider",
            )
        if not model:
            return cls(
                provider=provider,
                ollama_base_url=base_url,
                timeout_ms=timeout_ms,
                configuration_error="model_required",
            )
        parsed = urlparse(base_url)
        if (
            parsed.scheme.lower() not in {"http", "https"}
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
        ):
            return cls(
                provider=provider,
                model=model,
                ollama_base_url=base_url,
                timeout_ms=timeout_ms,
                configuration_error="invalid_base_url",
            )
        return cls(
            provider=provider,
            model=model,
            ollama_base_url=base_url,
            timeout_ms=timeout_ms,
        )

    @property
    def enabled(self) -> bool:
        return bool(self.provider and not self.configuration_error)

    @property
    def identity(self) -> str:
        if not self.enabled:
            return ""
        digest = hashlib.sha256(
            f"{self.provider}\0{self.model}\0{self.ollama_base_url}".encode("utf-8")
        ).hexdigest()[:20]
        return f"vector:{self.provider}:{digest}"

    @property
    def cache_key(self) -> tuple[str, str, str, int, str]:
        return (
            self.provider,
            self.model,
            self.ollama_base_url,
            self.timeout_ms,
            self.configuration_error,
        )


@dataclass(frozen=True)
class VectorChunk:
    chunk_id: str
    entry_id: str
    entry_revision: int
    ordinal: int
    text: str
    text_hash: str


@dataclass(frozen=True)
class VectorHit:
    chunk_id: str
    text_hash: str
    score: float


def deterministic_chunks(
    *,
    entry_id: str,
    entry_revision: int,
    text: str,
    chunk_chars: int = 2000,
    overlap_chars: int = 200,
) -> list[VectorChunk]:
    """Split already-redacted text into stable, overlapping chunks."""

    if chunk_chars < 256 or overlap_chars < 0 or overlap_chars >= chunk_chars:
        raise ValueError("invalid vector chunk configuration")
    normalized = str(text or "")
    if not normalized:
        return []
    chunks: list[VectorChunk] = []
    start = 0
    ordinal = 0
    step = chunk_chars - overlap_chars
    while start < len(normalized):
        chunk_text = normalized[start : start + chunk_chars]
        text_hash = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()
        chunk_digest = hashlib.sha256(
            f"{entry_id}\0{entry_revision}\0{ordinal}\0{text_hash}".encode("utf-8")
        ).hexdigest()
        chunks.append(
            VectorChunk(
                chunk_id=f"mem_v2_chunk_{chunk_digest}",
                entry_id=entry_id,
                entry_revision=int(entry_revision),
                ordinal=ordinal,
                text=chunk_text,
                text_hash=text_hash,
            )
        )
        ordinal += 1
        start += step
    return chunks


class NullVectorBackend:
    """The default backend.  It performs no imports, I/O, or thread creation."""

    provider_identity = ""

    def status(self) -> str:
        return "disabled"

    def index_chunks(self, chunks: Sequence[VectorChunk]) -> list[str]:
        return []

    def query(self, text: str, *, limit: int) -> list[VectorHit]:
        return []

    def delete(self, external_ids: Sequence[str]) -> None:
        return None

    def close(self) -> None:
        return None


class MisconfiguredVectorBackend(NullVectorBackend):
    def __init__(self, *, error_code: str) -> None:
        self.error_code = str(error_code or "invalid_configuration")

    def status(self) -> str:
        return "degraded"


class OllamaQdrantBackend:
    """Explicit Ollama embeddings backed by a lazy local Qdrant collection."""

    def __init__(self, *, root_dir: Path, config: VectorConfig) -> None:
        if not config.enabled or config.provider != "ollama":
            raise ValueError("an explicit Ollama vector configuration is required")
        self.provider_identity = config.identity
        self._config = config
        self._qdrant_path = Path(root_dir) / "vector" / "qdrant"
        self._collection_name = (
            "pupu_memory_v2_"
            + hashlib.sha256(config.identity.encode("utf-8")).hexdigest()[:20]
        )
        self._client: Any | None = None
        self._models: Any | None = None
        self._vector_size: int | None = None
        self._lock = threading.RLock()

    def status(self) -> str:
        return "warming" if self._client is None else "ready"

    def _embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        request = Request(
            self._config.ollama_base_url + "/api/embed",
            data=json.dumps(
                {"model": self._config.model, "input": list(texts)},
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        response = urlopen(
            request,
            timeout=self._config.timeout_ms / 1000.0,
            context=get_outbound_ssl_context(),
        )
        try:
            raw = response.read(MAX_EMBED_RESPONSE_BYTES + 1)
        finally:
            close = getattr(response, "close", None)
            if callable(close):
                close()
        if len(raw) > MAX_EMBED_RESPONSE_BYTES:
            raise RuntimeError("embedding_response_too_large")
        parsed = json.loads(raw.decode("utf-8"))
        raw_vectors = parsed.get("embeddings") if isinstance(parsed, Mapping) else None
        if not isinstance(raw_vectors, list) or len(raw_vectors) != len(texts):
            raise RuntimeError("embedding_response_invalid")
        vectors: list[list[float]] = []
        expected_size: int | None = None
        for raw_vector in raw_vectors:
            if not isinstance(raw_vector, list) or not raw_vector:
                raise RuntimeError("embedding_vector_invalid")
            if len(raw_vector) > MAX_VECTOR_DIMENSIONS:
                raise RuntimeError("embedding_vector_too_large")
            vector: list[float] = []
            for raw_value in raw_vector:
                if isinstance(raw_value, bool) or not isinstance(raw_value, (int, float)):
                    raise RuntimeError("embedding_vector_invalid")
                value = float(raw_value)
                if not math.isfinite(value):
                    raise RuntimeError("embedding_vector_invalid")
                vector.append(value)
            if expected_size is None:
                expected_size = len(vector)
            elif len(vector) != expected_size:
                raise RuntimeError("embedding_dimension_mismatch")
            vectors.append(vector)
        return vectors

    def _ensure_client(self, *, vector_size: int) -> Any:
        with self._lock:
            if self._client is None:
                # Optional imports and Qdrant's directory creation happen only
                # on this explicit, first-use path.
                from qdrant_client import QdrantClient
                from qdrant_client.http import models

                self._client = QdrantClient(path=str(self._qdrant_path))
                self._models = models
            if self._vector_size is not None and self._vector_size != vector_size:
                raise RuntimeError("embedding_dimension_changed")
            client = self._client
            models = self._models
            exists = False
            collection_exists = getattr(client, "collection_exists", None)
            if callable(collection_exists):
                exists = bool(collection_exists(self._collection_name))
            else:
                try:
                    client.get_collection(self._collection_name)
                    exists = True
                except Exception:
                    exists = False
            if not exists:
                client.create_collection(
                    collection_name=self._collection_name,
                    vectors_config=models.VectorParams(
                        size=vector_size,
                        distance=models.Distance.COSINE,
                    ),
                )
            self._vector_size = vector_size
            return client

    def index_chunks(self, chunks: Sequence[VectorChunk]) -> list[str]:
        if not chunks:
            return []
        vectors = self._embed([chunk.text for chunk in chunks])
        client = self._ensure_client(vector_size=len(vectors[0]))
        models = self._models
        external_ids = [
            str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"pupu-memory-v2:{self.provider_identity}:{chunk.chunk_id}:{chunk.text_hash}",
                )
            )
            for chunk in chunks
        ]
        points = [
            models.PointStruct(
                id=external_id,
                vector=vector,
                payload={
                    "chunk_id": chunk.chunk_id,
                    "text_hash": chunk.text_hash,
                },
            )
            for chunk, vector, external_id in zip(chunks, vectors, external_ids)
        ]
        client.upsert(
            collection_name=self._collection_name,
            points=points,
            wait=True,
        )
        return external_ids

    def query(self, text: str, *, limit: int) -> list[VectorHit]:
        vectors = self._embed([text])
        client = self._ensure_client(vector_size=len(vectors[0]))
        query_points = getattr(client, "query_points", None)
        if callable(query_points):
            response = query_points(
                collection_name=self._collection_name,
                query=vectors[0],
                limit=int(limit),
                with_payload=True,
            )
            raw_points = getattr(response, "points", response)
        else:
            raw_points = client.search(
                collection_name=self._collection_name,
                query_vector=vectors[0],
                limit=int(limit),
                with_payload=True,
            )
        hits: list[VectorHit] = []
        for point in list(raw_points or []):
            payload = getattr(point, "payload", None)
            if not isinstance(payload, Mapping):
                continue
            chunk_id = payload.get("chunk_id")
            text_hash = payload.get("text_hash")
            if not isinstance(chunk_id, str) or not isinstance(text_hash, str):
                continue
            raw_score = getattr(point, "score", 0.0)
            if isinstance(raw_score, bool) or not isinstance(raw_score, (int, float)):
                continue
            score = float(raw_score)
            if not math.isfinite(score):
                continue
            hits.append(VectorHit(chunk_id=chunk_id, text_hash=text_hash, score=score))
        return hits

    def delete(self, external_ids: Sequence[str]) -> None:
        if not external_ids or self._client is None:
            return
        try:
            self._client.delete(
                collection_name=self._collection_name,
                points_selector=self._models.PointIdsList(points=list(external_ids)),
                wait=True,
            )
        except Exception:
            # Orphan vector points contain only opaque IDs/hashes and are always
            # reauthorized in SQLite, so cleanup is best-effort.
            return

    def close(self) -> None:
        with self._lock:
            client = self._client
            self._client = None
            self._models = None
            self._vector_size = None
        close = getattr(client, "close", None)
        if callable(close):
            close()


def _result_id(result: Mapping[str, Any]) -> str:
    ref = result.get("ref")
    if isinstance(ref, str) and ref:
        return ref
    entry_id = result.get("entry_id")
    return str(entry_id or "")


def weighted_rrf(
    *,
    query: str,
    lexical_results: Sequence[Mapping[str, Any]],
    vector_results: Sequence[Mapping[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    """Merge lexical/vector ranks with lexical and exact-match priority."""

    normalized_query = str(query or "").casefold()
    records: dict[str, dict[str, Any]] = {}
    scores: dict[str, float] = {}
    lexical_rank: dict[str, int] = {}
    vector_rank: dict[str, int] = {}
    exact_ids: set[str] = set()
    for rank, raw in enumerate(lexical_results, start=1):
        item = dict(raw)
        entry_id = _result_id(item)
        if not entry_id:
            continue
        records.setdefault(entry_id, item)
        lexical_rank.setdefault(entry_id, rank)
        scores[entry_id] = scores.get(entry_id, 0.0) + LEXICAL_RRF_WEIGHT / (
            RRF_K + rank
        )
        if normalized_query in {
            str(item.get("path") or item.get("virtual_path") or "").casefold(),
            str(item.get("name") or "").casefold(),
        }:
            exact_ids.add(entry_id)
    for rank, raw in enumerate(vector_results, start=1):
        item = dict(raw)
        entry_id = _result_id(item)
        if not entry_id:
            continue
        records.setdefault(entry_id, item)
        vector_rank.setdefault(entry_id, rank)
        scores[entry_id] = scores.get(entry_id, 0.0) + VECTOR_RRF_WEIGHT / (
            RRF_K + rank
        )
    ordered_ids = sorted(
        records,
        key=lambda entry_id: (
            0 if entry_id in exact_ids else 1,
            -scores.get(entry_id, 0.0),
            lexical_rank.get(entry_id, 1_000_000),
            vector_rank.get(entry_id, 1_000_000),
            entry_id,
        ),
    )
    maximum_score = max((scores.get(entry_id, 0.0) for entry_id in ordered_ids), default=0.0)
    merged: list[dict[str, Any]] = []
    for entry_id in ordered_ids[: max(0, int(limit))]:
        item = dict(records[entry_id])
        item["score"] = round(
            scores.get(entry_id, 0.0) / maximum_score if maximum_score else 0.0,
            6,
        )
        merged.append(item)
    return merged


class MemoryV2VectorCoordinator:
    """Bounded, synchronous lazy indexing plus fail-open hybrid retrieval."""

    def __init__(
        self,
        *,
        store: "MemoryV2Store",
        config: VectorConfig,
        backend: Any,
        clock: Any | None = None,
        failure_threshold: int = 3,
        cooldown_ms: int = 30000,
    ) -> None:
        self._store = store
        self._config = config
        self._backend = backend
        self._clock = clock or (lambda: int(time.time() * 1000))
        self._failure_threshold = max(1, int(failure_threshold))
        self._cooldown_ms = max(1000, int(cooldown_ms))
        self._state = backend.status()
        self._failures = 0
        self._opened_until_ms = 0
        self._last_error_code = getattr(backend, "error_code", "")
        self._state_lock = threading.RLock()
        self._operation_lock = threading.Lock()

    @property
    def provider_identity(self) -> str:
        return str(getattr(self._backend, "provider_identity", "") or "")

    def status(self) -> dict[str, Any]:
        with self._state_lock:
            return {
                "status": self._state,
                "provider": self._config.provider,
                "model": self._config.model,
                "failure_count": self._failures,
                "last_error_code": self._last_error_code,
            }

    def _can_attempt(self) -> bool:
        if not self._config.enabled:
            return False
        now_ms = int(self._clock())
        with self._state_lock:
            if self._opened_until_ms and now_ms < self._opened_until_ms:
                return False
            if self._opened_until_ms:
                self._opened_until_ms = 0
                self._state = "warming"
            return True

    def _record_success(self, *, warming: bool) -> None:
        with self._state_lock:
            self._failures = 0
            self._opened_until_ms = 0
            self._last_error_code = ""
            self._state = "warming" if warming else "ready"

    def _record_failure(self, exc: BaseException) -> None:
        code = type(exc).__name__ or "vector_failed"
        with self._state_lock:
            self._failures += 1
            self._last_error_code = code[:128]
            self._state = "degraded"
            if self._failures >= self._failure_threshold:
                self._opened_until_ms = int(self._clock()) + self._cooldown_ms

    def _index_pending(
        self,
        *,
        scope_kind: str,
        owner_chat_id: str = "",
        namespace: str = "",
        space_id: str = "",
    ) -> bool:
        batch = self._store.vector_scan_candidates(
            backend=self.provider_identity,
            scope_kind=scope_kind,
            owner_chat_id=owner_chat_id,
            namespace=namespace,
            space_id=space_id,
            limit=MAX_INDEX_ENTRIES_PER_CALL,
        )
        for candidate in batch.get("candidates") or []:
            chunks = deterministic_chunks(
                entry_id=str(candidate["entry_id"]),
                entry_revision=int(candidate["entry_revision"]),
                text=str(candidate["text"]),
            )
            external_ids = self._backend.index_chunks(chunks)
            if len(external_ids) != len(chunks):
                raise RuntimeError("vector_index_receipt_mismatch")
            commit = self._store.vector_commit_entry_index(
                backend=self.provider_identity,
                space_id=str(candidate["space_id"]),
                entry_id=str(candidate["entry_id"]),
                expected_entry_revision=int(candidate["entry_revision"]),
                content_hash=str(candidate["content_hash"]),
                chunks=[
                    {
                        "chunk_id": chunk.chunk_id,
                        "ordinal": chunk.ordinal,
                        "text_hash": chunk.text_hash,
                        "external_id": external_id,
                    }
                    for chunk, external_id in zip(chunks, external_ids)
                ],
            )
            if not commit.get("committed"):
                self._backend.delete(external_ids)
        return bool(batch.get("has_more"))

    def _vector_results(
        self,
        *,
        query: str,
        limit: int,
        scope_kind: str,
        owner_chat_id: str = "",
        namespace: str = "",
        space_id: str = "",
    ) -> tuple[list[dict[str, Any]], bool]:
        safe_query = self._store.vector_redact_text(query)
        has_more = self._index_pending(
            scope_kind=scope_kind,
            owner_chat_id=owner_chat_id,
            namespace=namespace,
            space_id=space_id,
        )
        hit_limit = min(MAX_VECTOR_QUERY_HITS, max(int(limit) * 10, 20))
        hits = self._backend.query(safe_query, limit=hit_limit)
        authorized = self._store.vector_authorize_hits(
            backend=self.provider_identity,
            chunk_ids=[hit.chunk_id for hit in hits],
            scope_kind=scope_kind,
            owner_chat_id=owner_chat_id,
            namespace=namespace,
            space_id=space_id,
        )
        authorized_by_chunk = {
            str(item["chunk_id"]): item for item in authorized
        }
        best_by_entry: dict[str, tuple[float, dict[str, Any]]] = {}
        for hit in hits:
            item = authorized_by_chunk.get(hit.chunk_id)
            if item is None or str(item.get("text_hash") or "") != hit.text_hash:
                continue
            entry = dict(item["entry"])
            entry_id = str(item["entry_id"])
            current = best_by_entry.get(entry_id)
            if current is None or hit.score > current[0]:
                best_by_entry[entry_id] = (hit.score, entry)
        ordered = sorted(
            best_by_entry.items(),
            key=lambda pair: (-pair[1][0], pair[0]),
        )
        return [entry for _, (_, entry) in ordered], has_more

    def hybrid_chat_search(
        self,
        *,
        lexical: Mapping[str, Any],
        owner_chat_id: str,
        query: str,
        space_id: str,
        limit: int,
    ) -> dict[str, Any]:
        response = dict(lexical)
        response["vector_status"] = self.status()["status"]
        if not self._can_attempt():
            return response
        if not self._operation_lock.acquire(blocking=False):
            response["vector_status"] = "warming"
            return response
        try:
            vector_results, has_more = self._vector_results(
                query=query,
                limit=limit,
                scope_kind="chat",
                owner_chat_id=owner_chat_id,
                space_id=space_id,
            )
            self._record_success(warming=has_more)
            if vector_results:
                response["results"] = weighted_rrf(
                    query=query,
                    lexical_results=list(lexical.get("results") or []),
                    vector_results=vector_results,
                    limit=limit,
                )
            response["vector_status"] = self.status()["status"]
            return response
        except Exception as exc:
            self._record_failure(exc)
            response["vector_status"] = "degraded"
            return response
        finally:
            self._operation_lock.release()

    def hybrid_long_term_search(
        self,
        *,
        lexical: Mapping[str, Any],
        namespace: str,
        query: str,
        limit: int,
        min_score: float | None,
    ) -> dict[str, Any]:
        response = dict(lexical)
        response["vector_status"] = self.status()["status"]
        if not self._can_attempt():
            return response
        if not self._operation_lock.acquire(blocking=False):
            response["vector_status"] = "warming"
            return response
        try:
            raw_vector_results, has_more = self._vector_results(
                query=query,
                limit=limit,
                scope_kind="long_term",
                namespace=namespace,
            )
            vector_results = []
            for entry in raw_vector_results:
                vector_results.append(
                    {
                        "entry_id": entry.get("entry_id"),
                        "ref": entry.get("ref"),
                        "name": entry.get("name"),
                        "path": entry.get("path") or entry.get("virtual_path"),
                        "kind": entry.get("kind"),
                        "description": entry.get("description"),
                        "provenance": {
                            "source_event_id": entry.get("source_event_id", ""),
                            "created_by": entry.get("created_by", ""),
                        },
                    }
                )
            self._record_success(warming=has_more)
            if vector_results:
                merged = weighted_rrf(
                    query=query,
                    lexical_results=list(lexical.get("results") or []),
                    vector_results=vector_results,
                    limit=limit,
                )
                threshold = 0.0 if min_score is None else float(min_score)
                response["results"] = [
                    item for item in merged if float(item.get("score") or 0.0) >= threshold
                ]
            response["vector_status"] = self.status()["status"]
            return response
        except Exception as exc:
            self._record_failure(exc)
            response["vector_status"] = "degraded"
            return response
        finally:
            self._operation_lock.release()

    def close(self) -> None:
        self._backend.close()


_coordinators_lock = threading.RLock()
_coordinators: dict[
    tuple[str, tuple[str, str, str, int, str]], MemoryV2VectorCoordinator
] = {}


def _build_backend(*, root_dir: Path, config: VectorConfig) -> Any:
    if not config.provider:
        return NullVectorBackend()
    if config.configuration_error:
        return MisconfiguredVectorBackend(error_code=config.configuration_error)
    if config.provider == "ollama":
        return OllamaQdrantBackend(root_dir=root_dir, config=config)
    return MisconfiguredVectorBackend(error_code="unsupported_provider")


def get_memory_v2_vector_coordinator(
    *,
    root_dir: Path,
    store: "MemoryV2Store",
    environ: Mapping[str, str] | None = None,
) -> MemoryV2VectorCoordinator:
    config = VectorConfig.from_environ(environ)
    root_key = str(Path(root_dir).expanduser().resolve())
    key = (root_key, config.cache_key)
    with _coordinators_lock:
        coordinator = _coordinators.get(key)
        if coordinator is not None:
            return coordinator
        for stale_key in [item for item in _coordinators if item[0] == root_key and item != key]:
            _coordinators.pop(stale_key).close()
        coordinator = MemoryV2VectorCoordinator(
            store=store,
            config=config,
            backend=_build_backend(root_dir=Path(root_key), config=config),
        )
        _coordinators[key] = coordinator
        return coordinator


def close_memory_v2_vector_coordinator(*, root_dir: Path) -> None:
    root_key = str(Path(root_dir).expanduser().resolve())
    with _coordinators_lock:
        targets = [key for key in _coordinators if key[0] == root_key]
        coordinators = [_coordinators.pop(key) for key in targets]
    for coordinator in coordinators:
        coordinator.close()


def _reset_memory_v2_vector_for_tests() -> None:
    with _coordinators_lock:
        coordinators = list(_coordinators.values())
        _coordinators.clear()
    for coordinator in coordinators:
        coordinator.close()


__all__ = [
    "MemoryV2VectorCoordinator",
    "NullVectorBackend",
    "OllamaQdrantBackend",
    "VectorChunk",
    "VectorConfig",
    "VectorHit",
    "close_memory_v2_vector_coordinator",
    "deterministic_chunks",
    "get_memory_v2_vector_coordinator",
    "weighted_rrf",
]
