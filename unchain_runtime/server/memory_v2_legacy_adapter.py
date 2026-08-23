"""Read-only Legacy V1 long-term profile compatibility for Memory V2.

P0 deliberately does not migrate, rewrite, or re-embed V1 data.  This module
loads the JSON profile for one *server-bound* namespace with Unchain's
``JsonFileLongTermProfileStore``, exposes reference-only lexical search, and
allows bounded reads of those references.  No host path is accepted by a
search or read call.

The caller supplies the canonical Memory V2 long-term ``space_id`` for the
bound namespace.  Legacy references therefore pass the existing Memory V2
toolkit's space check without broadening its authority.  Entry ids use the
reserved ``legacy_v1_`` prefix so a composite runtime can route reads without
probing or weakening normal V2 reference validation.
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence
from urllib.parse import quote


SCHEMA_VERSION = "memory_v2_legacy_v1_adapter_v1"
PROFILE_DOCUMENT_SCHEMA_VERSION = "legacy_v1_profile_document_v1"
LEGACY_ENTRY_PREFIX = "legacy_v1_"
DEFAULT_CONTENT_READ_BYTES = 32 * 1024
MAX_CONTENT_READ_BYTES = 128 * 1024
MAX_PROFILE_BYTES = 8 * 1024 * 1024
MAX_PROFILE_DOCUMENTS = 4096
MAX_SEARCH_RESULTS = 100

_NAMESPACE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$")
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9._:-]{1,255}$")
_LEGACY_REF_RE = re.compile(
    r"^pupu://memory/([A-Za-z0-9._:-]+)/"
    r"(legacy_v1_[a-f0-9]{40})@([1-9][0-9]*)$"
)
_MEMORY_REF_RE = re.compile(
    r"^pupu://memory/([A-Za-z0-9._:-]+)/"
    r"([A-Za-z0-9._:-]+)@([1-9][0-9]*)$"
)
_WORD_RE = re.compile(r"\w+", flags=re.UNICODE)


class LegacyV1LongTermAdapterError(ValueError):
    """Validation or scope failure in the read-only compatibility adapter."""


@dataclass(frozen=True)
class _LegacyDocument:
    ref: str
    entry_id: str
    revision: int
    name: str
    virtual_path: str
    search_text: str
    content: bytes


def _required_text(value: Any, field_name: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise LegacyV1LongTermAdapterError(f"{field_name} must be text")
    normalized = unicodedata.normalize("NFC", value.strip())
    if not normalized or len(normalized) > maximum or "\x00" in normalized:
        raise LegacyV1LongTermAdapterError(f"{field_name} is invalid")
    return normalized


def _bounded_int(
    value: Any,
    field_name: str,
    *,
    minimum: int,
    maximum: int,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise LegacyV1LongTermAdapterError(f"{field_name} must be an integer")
    if value < minimum or value > maximum:
        raise LegacyV1LongTermAdapterError(
            f"{field_name} must be between {minimum} and {maximum}"
        )
    return value


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _is_within(candidate: Path, parent: Path) -> bool:
    try:
        candidate.relative_to(parent)
    except ValueError:
        return False
    return True


def _virtual_segment(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value.strip()) or "unnamed"
    encoded = quote(normalized, safe="-_.~")
    if encoded in {".", ".."}:
        encoded = encoded.replace(".", "%2E")
    if len(encoded) <= 180:
        return encoded
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]
    return f"{encoded[:160]}~{digest}"


def _display_name(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value.strip()) or "Legacy profile"
    if len(normalized) <= 255:
        return normalized
    return normalized[:238].rstrip() + "…" + hashlib.sha256(
        normalized.encode("utf-8")
    ).hexdigest()[:12]


def _revision_for(value: Any) -> int:
    # V1 has no revision counter.  A deterministic content revision makes a
    # reference change whenever its source document changes, avoiding stale
    # reads while keeping unchanged references stable across restarts.
    digest = hashlib.sha256(_canonical_json_bytes(value)).hexdigest()
    return int(digest[:15], 16) + 1


def _entry_id(namespace: str, key: str) -> str:
    digest = hashlib.sha256(
        _canonical_json_bytes({"namespace": namespace, "profile_key": key})
    ).hexdigest()[:40]
    return LEGACY_ENTRY_PREFIX + digest


def is_legacy_v1_memory_ref(ref: Any) -> bool:
    return isinstance(ref, str) and _LEGACY_REF_RE.fullmatch(ref.strip()) is not None


def _load_official_profile(profiles_dir: Path, namespace: str) -> dict[str, Any]:
    """Load one profile through Unchain while enforcing containment first."""

    if not profiles_dir.exists():
        # Avoid even creating a V1 directory on a V2 read path.
        return {}
    resolved_profiles = profiles_dir.resolve()
    from unchain.memory import JsonFileLongTermProfileStore

    store = JsonFileLongTermProfileStore(base_dir=resolved_profiles)
    path_getter = getattr(store, "_path", None)
    if not callable(path_getter):
        raise LegacyV1LongTermAdapterError(
            "Legacy V1 profile store path validation is unavailable"
        )
    profile_path = Path(path_getter(namespace)).resolve()
    if not _is_within(profile_path, resolved_profiles):
        raise LegacyV1LongTermAdapterError(
            "Legacy V1 profile resolved outside the configured data directory"
        )
    if profile_path.exists() and profile_path.stat().st_size > MAX_PROFILE_BYTES:
        raise LegacyV1LongTermAdapterError("Legacy V1 profile exceeds the read limit")
    profile = store.load(namespace)
    return profile if isinstance(profile, dict) else {}


class LegacyV1LongTermAdapter:
    """Namespace-bound, read-only view of one Legacy V1 profile."""

    def __init__(
        self,
        *,
        data_dir: str | Path,
        namespace: str,
        space_id: str,
        _profile_loader: Callable[[Path, str], dict[str, Any]] | None = None,
    ) -> None:
        raw_data_dir = str(data_dir).strip() if isinstance(data_dir, (str, Path)) else ""
        if not raw_data_dir or "\x00" in raw_data_dir:
            raise LegacyV1LongTermAdapterError("data_dir is invalid")
        bound_namespace = _required_text(namespace, "namespace", 255)
        if _NAMESPACE_RE.fullmatch(bound_namespace) is None:
            raise LegacyV1LongTermAdapterError("namespace is invalid")
        bound_space = _required_text(space_id, "space_id", 255)
        if _IDENTIFIER_RE.fullmatch(bound_space) is None:
            raise LegacyV1LongTermAdapterError("space_id is invalid")

        root = Path(raw_data_dir).expanduser().resolve()
        profiles_dir = (root / "memory" / "long_term_profiles").resolve()
        if not _is_within(profiles_dir, root):
            raise LegacyV1LongTermAdapterError(
                "Legacy V1 profiles directory escapes the configured data directory"
            )
        self._data_dir = root
        self._profiles_dir = profiles_dir
        self._namespace = bound_namespace
        self._space_id = bound_space
        self._profile_loader = _profile_loader or _load_official_profile

    @property
    def namespace(self) -> str:
        return self._namespace

    @property
    def space_id(self) -> str:
        return self._space_id

    def _load_profile(self) -> tuple[dict[str, Any], str]:
        try:
            profile = self._profile_loader(self._profiles_dir, self._namespace)
        except LegacyV1LongTermAdapterError:
            raise
        except Exception as exc:
            raise LegacyV1LongTermAdapterError(
                "Legacy V1 profile could not be loaded"
            ) from exc
        if not isinstance(profile, dict):
            return {}, ""
        try:
            canonical = _canonical_json_bytes(profile)
        except (TypeError, ValueError) as exc:
            raise LegacyV1LongTermAdapterError(
                "Legacy V1 profile is not valid JSON data"
            ) from exc
        if len(canonical) > MAX_PROFILE_BYTES:
            raise LegacyV1LongTermAdapterError("Legacy V1 profile exceeds the read limit")
        return profile, hashlib.sha256(canonical).hexdigest()

    def _documents(self) -> tuple[list[_LegacyDocument], str]:
        profile, profile_sha256 = self._load_profile()
        documents: list[_LegacyDocument] = []
        for raw_key in sorted(profile, key=lambda item: unicodedata.normalize("NFC", str(item)).casefold())[
            :MAX_PROFILE_DOCUMENTS
        ]:
            if not isinstance(raw_key, str):
                continue
            key = unicodedata.normalize("NFC", raw_key)
            value = profile[raw_key]
            entry_id = _entry_id(self._namespace, key)
            revision = _revision_for(value)
            virtual_path = "/legacy_v1/profile/" + _virtual_segment(key)
            provenance = {
                "source": "legacy_v1",
                "legacy_v1": True,
                "read_only": True,
                "source_kind": "profile_document",
                "profile_sha256": profile_sha256,
            }
            content = _canonical_json_bytes(
                {
                    "schema_version": PROFILE_DOCUMENT_SCHEMA_VERSION,
                    "trust": "UNTRUSTED_DATA",
                    "name": _display_name(key),
                    "path": virtual_path,
                    "provenance": provenance,
                    "value": value,
                }
            )
            ref = f"pupu://memory/{self._space_id}/{entry_id}@{revision}"
            documents.append(
                _LegacyDocument(
                    ref=ref,
                    entry_id=entry_id,
                    revision=revision,
                    name=_display_name(key),
                    virtual_path=virtual_path,
                    search_text=unicodedata.normalize(
                        "NFC", f"{key}\n{_canonical_json_bytes(value).decode('utf-8')}"
                    ).casefold(),
                    content=content,
                )
            )
        return documents, profile_sha256

    @staticmethod
    def _score(document: _LegacyDocument, query: str) -> float:
        folded = unicodedata.normalize("NFC", query).casefold()
        name = document.name.casefold()
        path = document.virtual_path.casefold()
        if folded in {name, path}:
            return 1.0
        if folded in name or folded in path:
            return 0.96
        if folded in document.search_text:
            return 0.9
        query_tokens = {token for token in _WORD_RE.findall(folded) if len(token) > 1}
        if not query_tokens:
            return 0.0
        document_tokens = set(_WORD_RE.findall(document.search_text))
        overlap = len(query_tokens & document_tokens) / len(query_tokens)
        if overlap >= 0.75:
            return min(0.89, 0.8 + (0.1 * overlap))
        if overlap >= 0.5:
            return 0.7 + (0.1 * overlap)
        return 0.0

    def search(
        self,
        *,
        query: str,
        limit: int = 20,
        min_score: float | None = None,
    ) -> dict[str, Any]:
        normalized_query = _required_text(query, "query", 1024)
        page_size = _bounded_int(
            limit,
            "limit",
            minimum=1,
            maximum=MAX_SEARCH_RESULTS,
        )
        threshold = 0.0
        if min_score is not None:
            if isinstance(min_score, bool) or not isinstance(min_score, (int, float)):
                raise LegacyV1LongTermAdapterError("min_score must be a number")
            threshold = float(min_score)
            if not math.isfinite(threshold) or threshold < 0 or threshold > 1:
                raise LegacyV1LongTermAdapterError(
                    "min_score must be between 0 and 1"
                )
        try:
            documents, profile_sha256 = self._documents()
        except LegacyV1LongTermAdapterError:
            return {
                "namespace": self._namespace,
                "query": normalized_query,
                "backend": "legacy_v1_lexical_unavailable",
                "vector_status": "degraded",
                "fallback_reason": "profile_load_failed",
                "results": [],
            }
        ranked = []
        for document in documents:
            score = self._score(document, normalized_query)
            if score < threshold or score <= 0:
                continue
            ranked.append((score, document))
        ranked.sort(
            key=lambda item: (
                -item[0],
                item[1].virtual_path.casefold(),
                item[1].ref,
            )
        )
        results = [
            {
                "ref": document.ref,
                "name": document.name,
                "path": document.virtual_path,
                "kind": "legacy_profile_document",
                "description": (
                    f"Read-only Legacy V1 profile document “{document.name}”; "
                    "content is available only through this bound reference."
                ),
                "score": round(score, 6),
                "provenance": {
                    "source": "legacy_v1",
                    "legacy_v1": True,
                    "read_only": True,
                    "source_kind": "profile_document",
                    "profile_sha256": profile_sha256,
                },
            }
            for score, document in ranked[:page_size]
        ]
        return {
            "namespace": self._namespace,
            "query": normalized_query,
            "backend": "legacy_v1_lexical",
            "vector_status": "degraded",
            "results": results,
        }

    def read(
        self,
        *,
        ref: str,
        offset: int = 0,
        limit: int = DEFAULT_CONTENT_READ_BYTES,
    ) -> dict[str, Any]:
        normalized_ref = _required_text(ref, "ref", 1024)
        match = _LEGACY_REF_RE.fullmatch(normalized_ref)
        if match is None:
            raise LegacyV1LongTermAdapterError("Legacy V1 memory ref is invalid")
        ref_space_id, entry_id, revision_raw = match.groups()
        if ref_space_id != self._space_id:
            raise LegacyV1LongTermAdapterError(
                "Legacy V1 memory ref is outside the bound namespace"
            )
        byte_offset = _bounded_int(
            offset,
            "offset",
            minimum=0,
            maximum=32 * 1024 * 1024,
        )
        byte_limit = _bounded_int(
            limit,
            "limit",
            minimum=1,
            maximum=MAX_CONTENT_READ_BYTES,
        )
        documents, _profile_sha256 = self._documents()
        document = next(
            (
                item
                for item in documents
                if item.entry_id == entry_id and item.revision == int(revision_raw)
            ),
            None,
        )
        if document is None:
            raise LegacyV1LongTermAdapterError(
                "Legacy V1 memory content was not found at this revision"
            )
        total = len(document.content)
        chunk = document.content[byte_offset : byte_offset + byte_limit]
        next_offset = byte_offset + len(chunk)
        return {
            "ref": normalized_ref,
            "namespace": self._namespace,
            "mime_type": "application/json",
            "offset": byte_offset,
            "limit": byte_limit,
            "total_bytes": total,
            "next_offset": next_offset if next_offset < total else None,
            "truncated": next_offset < total,
            "encoding": "base64",
            "data": base64.b64encode(chunk).decode("ascii"),
            "provenance": {
                "source": "legacy_v1",
                "legacy_v1": True,
                "read_only": True,
            },
        }


def merge_long_term_search_results(
    primary: Mapping[str, Any] | None,
    legacy_v1: Mapping[str, Any] | None,
    *,
    limit: int,
) -> dict[str, Any]:
    """Deterministically merge V2 and reference-only Legacy V1 search rows."""

    page_size = _bounded_int(
        limit,
        "limit",
        minimum=1,
        maximum=MAX_SEARCH_RESULTS,
    )
    primary_map = primary if isinstance(primary, Mapping) else {}
    legacy_map = legacy_v1 if isinstance(legacy_v1, Mapping) else {}
    candidates: list[tuple[int, dict[str, Any]]] = []
    for source_priority, response in enumerate((primary_map, legacy_map)):
        raw_results = response.get("results")
        if not isinstance(raw_results, Sequence) or isinstance(raw_results, (str, bytes)):
            continue
        for raw in raw_results:
            if not isinstance(raw, Mapping):
                continue
            ref = raw.get("ref")
            score = raw.get("score")
            if not isinstance(ref, str) or not ref.startswith("pupu://memory/"):
                continue
            if isinstance(score, bool) or not isinstance(score, (int, float)):
                continue
            numeric_score = float(score)
            if not math.isfinite(numeric_score) or numeric_score < 0 or numeric_score > 1:
                continue
            candidates.append((source_priority, dict(raw)))
    by_ref: dict[str, tuple[int, dict[str, Any]]] = {}
    for candidate in candidates:
        priority, result = candidate
        current = by_ref.get(str(result["ref"]))
        if current is None or float(result["score"]) > float(current[1]["score"]):
            by_ref[str(result["ref"])] = (priority, result)
    ordered = sorted(
        by_ref.values(),
        key=lambda item: (
            -float(item[1]["score"]),
            item[0],
            str(item[1].get("path") or "").casefold(),
            str(item[1]["ref"]),
        ),
    )
    namespace = str(primary_map.get("namespace") or legacy_map.get("namespace") or "")
    query = str(primary_map.get("query") or legacy_map.get("query") or "")
    return {
        "namespace": namespace,
        "query": query,
        "backend": "memory_v2_with_legacy_v1_lexical",
        "vector_status": str(primary_map.get("vector_status") or "degraded"),
        "sources": {
            "memory_v2": str(primary_map.get("backend") or "unavailable"),
            "legacy_v1": str(legacy_map.get("backend") or "unavailable"),
        },
        "results": [result for _priority, result in ordered[:page_size]],
    }


class LegacyV1CompositeRuntime:
    """Namespace-bound V2 runtime view with read-only Legacy V1 recall.

    The primary runtime remains authoritative for every operation.  Only its
    two long-term read methods are composed with the read-only adapter; every
    other attribute is delegated unchanged.  The wrapper never accepts a V1
    path, never writes V1 data, and validates every returned reference against
    the server-bound namespace's canonical V2 long-term space.

    Constructing the wrapper around an already wrapped runtime is idempotent
    when the binding is identical.  A different namespace or space is rejected
    instead of creating an authority-widening wrapper chain.
    """

    def __new__(
        cls,
        *,
        runtime: Any,
        namespace: str,
        space_id: str,
        _profile_loader: Callable[[Path, str], dict[str, Any]] | None = None,
    ) -> "LegacyV1CompositeRuntime":
        bound_namespace = _required_text(namespace, "namespace", 255)
        if _NAMESPACE_RE.fullmatch(bound_namespace) is None:
            raise LegacyV1LongTermAdapterError("namespace is invalid")
        bound_space = _required_text(space_id, "space_id", 255)
        if _IDENTIFIER_RE.fullmatch(bound_space) is None:
            raise LegacyV1LongTermAdapterError("space_id is invalid")
        if isinstance(runtime, cls):
            if (
                runtime.namespace == bound_namespace
                and runtime.space_id == bound_space
            ):
                return runtime
            raise LegacyV1LongTermAdapterError(
                "Legacy V1 runtime is already bound to a different scope"
            )
        return super().__new__(cls)

    def __init__(
        self,
        *,
        runtime: Any,
        namespace: str,
        space_id: str,
        _profile_loader: Callable[[Path, str], dict[str, Any]] | None = None,
    ) -> None:
        if "_primary_runtime" in self.__dict__:
            return
        bound_namespace = _required_text(namespace, "namespace", 255)
        if _NAMESPACE_RE.fullmatch(bound_namespace) is None:
            raise LegacyV1LongTermAdapterError("namespace is invalid")
        bound_space = _required_text(space_id, "space_id", 255)
        if _IDENTIFIER_RE.fullmatch(bound_space) is None:
            raise LegacyV1LongTermAdapterError("space_id is invalid")
        if runtime is None or runtime is self:
            raise LegacyV1LongTermAdapterError("Memory V2 runtime is invalid")
        for method_name in ("search_long_term", "read_long_term_content"):
            if not callable(getattr(runtime, method_name, None)):
                raise LegacyV1LongTermAdapterError(
                    f"Memory V2 runtime does not provide {method_name}"
                )
        try:
            runtime_data_dir = getattr(runtime, "data_dir")
        except Exception as exc:
            raise LegacyV1LongTermAdapterError(
                "Memory V2 runtime data directory is unavailable"
            ) from exc
        self._primary_runtime = runtime
        self._namespace = bound_namespace
        self._space_id = bound_space
        self._legacy_adapter = LegacyV1LongTermAdapter(
            data_dir=runtime_data_dir,
            namespace=bound_namespace,
            space_id=bound_space,
            _profile_loader=_profile_loader,
        )

    @property
    def namespace(self) -> str:
        return self._namespace

    @property
    def space_id(self) -> str:
        return self._space_id

    @property
    def primary_runtime(self) -> Any:
        return self._primary_runtime

    def _require_bound_namespace(self, namespace: Any) -> str:
        normalized = _required_text(namespace, "namespace", 255)
        if normalized != self._namespace:
            raise LegacyV1LongTermAdapterError(
                "Long-term memory request is outside the bound namespace"
            )
        return normalized

    def _validate_search_response(
        self,
        response: Any,
        *,
        legacy: bool,
    ) -> dict[str, Any]:
        if not isinstance(response, Mapping):
            raise LegacyV1LongTermAdapterError(
                "Long-term memory search returned an invalid response"
            )
        if response.get("namespace") != self._namespace:
            raise LegacyV1LongTermAdapterError(
                "Long-term memory search returned a different namespace"
            )
        raw_results = response.get("results")
        if not isinstance(raw_results, Sequence) or isinstance(
            raw_results, (str, bytes, bytearray)
        ):
            raise LegacyV1LongTermAdapterError(
                "Long-term memory search returned invalid results"
            )
        for result in raw_results:
            if not isinstance(result, Mapping):
                raise LegacyV1LongTermAdapterError(
                    "Long-term memory search returned an invalid result"
                )
            ref = result.get("ref")
            match = _MEMORY_REF_RE.fullmatch(ref.strip()) if isinstance(ref, str) else None
            if match is None:
                raise LegacyV1LongTermAdapterError(
                    "Long-term memory search returned an invalid reference"
                )
            ref_space, entry_id, _revision = match.groups()
            if ref_space != self._space_id:
                raise LegacyV1LongTermAdapterError(
                    "Long-term memory search returned a reference outside the bound space"
                )
            is_reserved_legacy = entry_id.startswith(LEGACY_ENTRY_PREFIX)
            if legacy != is_reserved_legacy:
                raise LegacyV1LongTermAdapterError(
                    "Long-term memory search returned a reference from the wrong source"
                )
            if legacy:
                if not is_legacy_v1_memory_ref(ref):
                    raise LegacyV1LongTermAdapterError(
                        "Legacy V1 search returned an invalid reserved reference"
                    )
                provenance = result.get("provenance")
                if not isinstance(provenance, Mapping) or not (
                    provenance.get("source") == "legacy_v1"
                    and provenance.get("legacy_v1") is True
                    and provenance.get("read_only") is True
                ):
                    raise LegacyV1LongTermAdapterError(
                        "Legacy V1 search returned invalid provenance"
                    )
                if any(
                    field in result
                    for field in ("content", "data", "preview", "text", "value")
                ):
                    raise LegacyV1LongTermAdapterError(
                        "Legacy V1 search must return references only"
                    )
        return dict(response)

    def search_long_term(
        self,
        *,
        namespace: str,
        query: str,
        limit: int = 20,
        min_score: float | None = None,
    ) -> dict[str, Any]:
        bound_namespace = self._require_bound_namespace(namespace)
        normalized_query = _required_text(query, "query", 1024)
        page_size = _bounded_int(
            limit,
            "limit",
            minimum=1,
            maximum=MAX_SEARCH_RESULTS,
        )
        if min_score is not None:
            if isinstance(min_score, bool) or not isinstance(min_score, (int, float)):
                raise LegacyV1LongTermAdapterError("min_score must be a number")
            normalized_min_score = float(min_score)
            if (
                not math.isfinite(normalized_min_score)
                or normalized_min_score < 0
                or normalized_min_score > 1
            ):
                raise LegacyV1LongTermAdapterError(
                    "min_score must be between 0 and 1"
                )
        else:
            normalized_min_score = None
        primary = self._validate_search_response(
            self._primary_runtime.search_long_term(
                namespace=bound_namespace,
                query=normalized_query,
                limit=page_size,
                min_score=normalized_min_score,
            ),
            legacy=False,
        )
        legacy = self._validate_search_response(
            self._legacy_adapter.search(
                query=normalized_query,
                limit=page_size,
                min_score=normalized_min_score,
            ),
            legacy=True,
        )
        return merge_long_term_search_results(primary, legacy, limit=page_size)

    def read_long_term_content(
        self,
        *,
        namespace: str,
        ref: str,
        offset: int = 0,
        limit: int = DEFAULT_CONTENT_READ_BYTES,
    ) -> dict[str, Any]:
        bound_namespace = self._require_bound_namespace(namespace)
        normalized_ref = _required_text(ref, "ref", 1024)
        byte_offset = _bounded_int(
            offset,
            "offset",
            minimum=0,
            maximum=32 * 1024 * 1024,
        )
        byte_limit = _bounded_int(
            limit,
            "limit",
            minimum=1,
            maximum=MAX_CONTENT_READ_BYTES,
        )
        if is_legacy_v1_memory_ref(normalized_ref):
            return self._legacy_adapter.read(
                ref=normalized_ref,
                offset=byte_offset,
                limit=byte_limit,
            )
        match = _MEMORY_REF_RE.fullmatch(normalized_ref)
        if match is None:
            raise LegacyV1LongTermAdapterError(
                "Long-term memory content reference is invalid"
            )
        ref_space, entry_id, _revision = match.groups()
        if ref_space != self._space_id:
            raise LegacyV1LongTermAdapterError(
                "Long-term memory content reference is outside the bound space"
            )
        if entry_id.startswith(LEGACY_ENTRY_PREFIX):
            raise LegacyV1LongTermAdapterError(
                "Legacy V1 memory content reference is invalid"
            )
        return self._primary_runtime.read_long_term_content(
            namespace=bound_namespace,
            ref=normalized_ref,
            offset=byte_offset,
            limit=byte_limit,
        )

    def __getattr__(self, name: str) -> Any:
        return getattr(self._primary_runtime, name)


__all__ = [
    "LEGACY_ENTRY_PREFIX",
    "LegacyV1CompositeRuntime",
    "LegacyV1LongTermAdapter",
    "LegacyV1LongTermAdapterError",
    "is_legacy_v1_memory_ref",
    "merge_long_term_search_results",
]
