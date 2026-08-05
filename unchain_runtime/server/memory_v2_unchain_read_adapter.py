"""Thin host binding for Unchain-owned Context/Memory V2 reads.

PuPu resolves its immutable lifecycle rows once, then delegates every read to
Unchain's scope-bound SQLite facade.  No route, renderer, or model may choose a
different owner, workspace, or host filesystem path through this adapter.
"""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    ContextV2StoreBoundaryError,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2OwnershipError,
    list_pupu_unchain_ownership_lifecycles,
)
from unchain.journal import ArtifactRef, EventCursor, ResourceRef
from unchain.persistence.sqlite_chat_deletion_v2 import (
    ChatDeletionError,
    is_chat_deleted,
)
from unchain.persistence.sqlite_context_compiler_v2 import (
    SQLiteContextCompilerV2Store,
)
from unchain.persistence.sqlite_curator_query_v2 import (
    SQLiteCuratorQueryV2Error,
    SQLiteCuratorQueryV2IntegrityError,
    SQLiteCuratorQueryV2Store,
)
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_read_v2 import (
    ContextV2ReadScope,
    SQLiteContextV2ReadError,
    SQLiteContextV2ReadService,
    read_sqlite_context_v2_store_status,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


_MAX_LIFECYCLES = 10_000
_ARTIFACT_URI = re.compile(
    r"^pupu://artifact/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})@([1-9][0-9]*)$"
)
_MEMORY_URI = re.compile(
    r"^pupu://memory/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})/"
    r"([A-Za-z0-9][A-Za-z0-9._:-]{0,511})@([1-9][0-9]*)$"
)
_CHECKPOINT_URI = re.compile(
    r"^pupu://context/checkpoint/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})$"
)
_REVIEW_CONTENT_URI = re.compile(
    r"^pupu://memory/review/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})"
    r"@([1-9][0-9]*)/(diff|proposed)$"
)


class PupuUnchainMemoryV2ReadError(RuntimeError):
    """PuPu could not prove an active, Unchain-owned exact read scope."""


@dataclass(frozen=True, slots=True)
class PupuUnchainMemoryV2Reader:
    """Host presentation over one already-bound Unchain read capability."""

    _reader: Any = field(repr=False)
    _lifecycles: tuple[PupuUnchainMemoryV2Lifecycle, ...] = field(repr=False)
    _curator_query: Any = field(repr=False)

    @property
    def owner_chat_id(self) -> str:
        return self._reader.scope.owner_chat_id

    @property
    def space_id(self) -> str:
        return self._reader.scope.space_id

    def _require_owner(self, owner_chat_id: str) -> None:
        if owner_chat_id != self.owner_chat_id:
            raise PupuUnchainMemoryV2ReadError(
                "owner is outside the bound Context V2 read scope"
            )

    def _require_space(self, space_id: str) -> None:
        if space_id != self.space_id:
            raise PupuUnchainMemoryV2ReadError(
                "workspace is outside the bound Context V2 read scope"
            )

    def _route_execution(
        self,
        *,
        session_id: str,
        attempt_id: str,
    ) -> str:
        candidates = tuple(
            lifecycle
            for lifecycle in self._lifecycles
            if (not session_id or lifecycle.session_id == session_id)
            and (not attempt_id or lifecycle.attempt_id == attempt_id)
        )
        executions = {lifecycle.execution_id for lifecycle in candidates}
        if not executions:
            raise PupuUnchainMemoryV2ReadError(
                "session or attempt is outside the bound Context V2 read scope"
            )
        if len(executions) != 1:
            raise PupuUnchainMemoryV2ReadError(
                "session is required for an unambiguous Context V2 event scope"
            )
        return next(iter(executions))

    def status(self) -> dict[str, Any]:
        status = self._reader.status().to_dict()
        return {
            "schema": "pupu.unchain_memory_v2_read_status.v1",
            "storeOwner": STORE_OWNER_UNCHAIN,
            **{key: value for key, value in status.items() if key != "schema"},
            "execution_ids": list(self._reader.scope.execution_ids),
        }

    def load_events(
        self,
        *,
        owner_chat_id: str,
        after: int = 0,
        limit: int = 100,
        session_id: str = "",
        attempt_id: str = "",
        include_payload: bool = True,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        execution_id = self._route_execution(
            session_id=session_id,
            attempt_id=attempt_id,
        )
        page = self._reader.read_events_after_store_seq(
            execution_id=execution_id,
            after_store_seq=after,
            limit=limit,
            attempt_id=attempt_id or None,
        )
        events = []
        for event in page.events:
            payload = _route_json_value(event.payload)
            item = {
                "event_id": event.event_id,
                "ref": f"pupu://context/event/{event.event_id}",
                "cursor": event.store_seq,
                "store_seq": event.store_seq,
                "journal_seq": event.store_seq,
                "source_seq": None,
                "session_id": event.attempt.generation.execution_id,
                "attempt_id": event.attempt.attempt_id,
                "generation_id": event.attempt.generation.generation_id,
                "type": event.event_type,
                "run_id": str(payload.get("run_id") or event.attempt.attempt_id),
                "agent_id": str(payload.get("agent_id") or ""),
                "turn_id": str(payload.get("turn_id") or ""),
                "parent_run_id": str(payload.get("parent_run_id") or ""),
                "tool_call_id": str(
                    payload.get("tool_call_id") or payload.get("call_id") or ""
                ),
                "visibility": str(payload.get("visibility") or "trace"),
                "payload_hash": event.operation.payload_sha256,
                "occurred_at": str(payload.get("occurred_at") or ""),
            }
            if include_payload:
                item["event"] = {"type": event.event_type, **payload}
            events.append(item)
        next_after = events[-1]["store_seq"] if events else after
        return {
            "owner_chat_id": self.owner_chat_id,
            "events": events,
            "after": after,
            "next_after": next_after,
            "has_more": page.has_more,
        }

    def read_events(
        self,
        *,
        execution_id: str,
        after: EventCursor | None = None,
        limit: int = 100,
    ):
        return self._reader.read_events(
            execution_id=execution_id,
            after=after,
            limit=limit,
        )

    def read_content(
        self,
        *,
        execution_id: str,
        artifact: ArtifactRef,
        offset: int = 0,
        limit: int = 65_536,
    ):
        if not isinstance(artifact, ArtifactRef):
            raise TypeError("artifact must be a verified ArtifactRef")
        return self._reader.read_artifact_page(
            execution_id=execution_id,
            artifact=artifact,
            offset=offset,
            limit=limit,
        )

    def read_scoped_content(
        self,
        *,
        ref: str,
        offset: int = 0,
        limit: int = 32 * 1024,
        owner_chat_id: str | None = None,
    ) -> dict[str, Any]:
        """Resolve one stable PuPu ref inside the immutable chat lineage."""

        if owner_chat_id is not None:
            self._require_owner(owner_chat_id)

        if (
            not isinstance(ref, str)
            or ref != ref.strip()
            or not ref
            or len(ref) > 1024
            or "%" in ref
        ):
            raise PupuUnchainMemoryV2ReadError("content reference is invalid")
        artifact_match = _ARTIFACT_URI.fullmatch(ref)
        memory_match = _MEMORY_URI.fullmatch(ref)
        checkpoint_match = _CHECKPOINT_URI.fullmatch(ref)
        review_match = _REVIEW_CONTENT_URI.fullmatch(ref)
        try:
            if artifact_match is not None:
                page = self._reader.read_unique_artifact(
                    ref=ResourceRef(
                        "artifact",
                        artifact_match.group(1),
                        int(artifact_match.group(2)),
                    ),
                    offset=offset,
                    limit=limit,
                )
            elif memory_match is not None:
                page = self._reader.read_workspace_content(
                    ref=ResourceRef(
                        "memory",
                        memory_match.group(2),
                        int(memory_match.group(3)),
                        memory_match.group(1),
                    ),
                    offset=offset,
                    limit=limit,
                )
            elif checkpoint_match is not None:
                page = self._reader.read_unique_checkpoint(
                    ref=ResourceRef(
                        "checkpoint",
                        checkpoint_match.group(1),
                        1,
                    ),
                    offset=offset,
                    limit=limit,
                )
            elif review_match is not None:
                page = self._curator_query.read_review_content(
                    ref=ResourceRef(
                        "memory_review_content",
                        review_match.group(1),
                        int(review_match.group(2)),
                        review_match.group(3),
                    ),
                    offset=offset,
                    limit=limit,
                )
            else:
                raise PupuUnchainMemoryV2ReadError(
                    "content reference is invalid or unsupported"
                )
        except SQLiteCuratorQueryV2IntegrityError as error:
            raise PupuUnchainMemoryV2ReadError(
                "review content failed durable verification"
            ) from error
        except SQLiteCuratorQueryV2Error as error:
            raise PupuUnchainMemoryV2ReadError(
                "review content is unavailable"
            ) from error
        page_truncated = (
            page.has_more
            if hasattr(page, "has_more")
            else page.truncated
        )
        return {
            "ref": ref,
            "owner_chat_id": self._reader.scope.owner_chat_id,
            "mime_type": page.media_type,
            "sha256": page.sha256,
            "offset": page.offset,
            "limit": limit,
            "total_bytes": page.total_bytes,
            "next_offset": page.next_offset if page_truncated else None,
            "truncated": page_truncated,
            "encoding": "base64",
            "data": base64.b64encode(page.data).decode("ascii"),
        }

    def memory_list(
        self,
        *,
        parent_path: str = "/",
        include_deleted: bool = False,
        limit: int = 100,
        cursor: str | None = None,
    ):
        return self._reader.list_workspace(
            parent_path=parent_path,
            include_deleted=include_deleted,
            limit=limit,
            cursor=cursor,
        )

    def memory_tree(
        self,
        *,
        parent_path: str = "/",
        include_deleted: bool = False,
        limit: int = 100,
        cursor: str | None = None,
    ):
        return self._reader.workspace_tree(
            parent_path=parent_path,
            include_deleted=include_deleted,
            limit=limit,
            cursor=cursor,
        )

    def memory_get(
        self,
        *,
        entry_id: str | None = None,
        ref: ResourceRef | None = None,
    ):
        return self._reader.get_workspace_entry(entry_id=entry_id, ref=ref)

    def memory_search(self, query: str, *, limit: int = 20):
        return self._reader.search_workspace(query, limit=limit)

    def _workspace_entries(
        self,
        *,
        parent_path: str,
        recursive: bool,
    ) -> tuple[Any, ...]:
        entries = []
        cursor = None
        while len(entries) < _MAX_LIFECYCLES:
            page = (
                self.memory_tree(
                    parent_path=parent_path,
                    limit=200,
                    cursor=cursor,
                )
                if recursive
                else self.memory_list(
                    parent_path=parent_path,
                    limit=200,
                    cursor=cursor,
                )
            )
            entries.extend(page.entries)
            if not page.has_more:
                return tuple(entries)
            if page.next_cursor is None or page.next_cursor == cursor:
                raise PupuUnchainMemoryV2ReadError(
                    "workspace pagination did not advance"
                )
            cursor = page.next_cursor
        raise PupuUnchainMemoryV2ReadError(
            "workspace listing exceeds the P0 route limit"
        )

    def list_spaces(self, *, owner_chat_id: str) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        space = self._reader.workspace_space
        return {
            "owner_chat_id": self.owner_chat_id,
            "spaces": [
                {
                    "space_id": space.space_id,
                    "scope_kind": "chat",
                    "scope_key": self.owner_chat_id,
                    "owner_chat_id": self.owner_chat_id,
                    "namespace": space.namespace,
                    "name": space.name,
                    "description": space.description,
                    "revision": space.revision,
                    "replayed": False,
                }
            ],
        }

    def list_entries(
        self,
        *,
        owner_chat_id: str,
        space_id: str,
        parent_path: str = "",
        include_descendants: bool = True,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        self._require_space(space_id)
        entries = self._workspace_entries(
            parent_path=parent_path or "/",
            recursive=include_descendants,
        )
        return {
            "owner_chat_id": self.owner_chat_id,
            "space_id": self.space_id,
            "space_revision": self._reader.workspace_space.revision,
            "entries": [_route_entry(entry) for entry in entries],
        }

    def get_tree(
        self,
        *,
        owner_chat_id: str,
        space_id: str,
    ) -> dict[str, Any]:
        listing = self.list_entries(
            owner_chat_id=owner_chat_id,
            space_id=space_id,
            include_descendants=True,
        )
        nodes = {item["path"]: {**item, "children": []} for item in listing["entries"]}
        roots = []
        for item in listing["entries"]:
            node = nodes[item["path"]]
            parent = nodes.get(item["parent_path"])
            if parent is None:
                roots.append(node)
            else:
                parent["children"].append(node)
        return {**listing, "tree": roots}

    def get_entry(
        self,
        *,
        owner_chat_id: str,
        space_id: str,
        entry_id: str,
        revision: int | None = None,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        self._require_space(space_id)
        entry = (
            self.memory_get(
                ref=ResourceRef("memory", entry_id, revision, self.space_id)
            )
            if revision is not None
            else self.memory_get(entry_id=entry_id)
        )
        return _route_entry(entry)

    def search_entries(
        self,
        *,
        owner_chat_id: str,
        query: str,
        space_id: str = "",
        limit: int = 100,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        if space_id:
            self._require_space(space_id)
        result = self.memory_search(query, limit=min(limit, 100))
        return {
            "owner_chat_id": self.owner_chat_id,
            "query": query,
            "backend": "degraded" if result.lexical_fallback else "fts5",
            "vector_status": "degraded",
            "results": [
                {
                    **_route_entry(hit.entry),
                    "score": hit.score,
                    "matched_by": list(hit.matched_by),
                    "source_refs": [
                        _route_resource_uri(ref) or ref.to_dict()
                        for ref in hit.source_refs
                    ],
                }
                for hit in result.hits
            ],
        }


def _route_resource_uri(ref: ResourceRef) -> str:
    if ref.kind == "artifact" and not ref.fragment:
        return f"pupu://artifact/{ref.resource_id}@{ref.revision}"
    if ref.kind == "memory" and ref.fragment:
        return f"pupu://memory/{ref.fragment}/{ref.resource_id}@{ref.revision}"
    if ref.kind == "checkpoint" and ref.revision == 1 and not ref.fragment:
        return f"pupu://context/checkpoint/{ref.resource_id}"
    if ref.kind == "context_event" and not ref.fragment:
        return f"pupu://context/event/{ref.resource_id}"
    return ""


def _route_json_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        if value.get("schema") == ResourceRef.SCHEMA:
            try:
                ref = ResourceRef.from_dict(value)
            except (TypeError, ValueError):
                pass
            else:
                return _route_resource_uri(ref) or ref.to_dict()
        return {str(key): _route_json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_route_json_value(item) for item in value]
    return value


def _route_entry(entry: Any) -> dict[str, Any]:
    ref = f"pupu://memory/{entry.space_id}/{entry.entry_id}@{entry.revision}"
    parent_path = entry.path.rsplit("/", 1)[0] or "/"
    source_event_id = next(
        (
            source.resource_id
            for source in entry.source_refs
            if source.kind == "context_event"
        ),
        "",
    )
    response = {
        "entry_id": entry.entry_id,
        "space_id": entry.space_id,
        "path": entry.path,
        "parent_path": parent_path,
        "name": entry.name,
        "kind": entry.kind.value,
        "description": entry.description,
        "mime_type": entry.media_type,
        "revision": entry.revision,
        "space_revision": entry.updated_seq,
        "source_event_id": source_event_id,
        "source_refs": [
            _route_resource_uri(source) or source.to_dict()
            for source in entry.source_refs
        ],
        "tags": list(entry.tags),
        "ref": ref,
        "replayed": False,
    }
    if entry.kind.value in {"markdown", "image"}:
        response["content_ref"] = ref
    elif entry.kind.value == "link":
        response["link_url"] = entry.link_url
    return response


def open_pupu_unchain_memory_v2_reader(
    *,
    root_dir: str | Path,
    owner_chat_id: str,
) -> PupuUnchainMemoryV2Reader:
    """Cold-open one exact active chat scope under the Unchain store owner."""

    try:
        admission = admit_context_v2_store_owner(
            root_dir=root_dir,
            requested_owner=STORE_OWNER_UNCHAIN,
        )
        if admission.owner != STORE_OWNER_UNCHAIN:
            raise PupuUnchainMemoryV2ReadError("Context V2 store owner is not Unchain")
        if admission.database_state != STORE_OWNER_UNCHAIN:
            raise PupuUnchainMemoryV2ReadError(
                "Unchain Context V2 database is unavailable"
            )
        if is_chat_deleted(
            database_path=admission.database_path,
            owner_chat_id=owner_chat_id,
        ):
            raise PupuUnchainMemoryV2ReadError(
                "durably deleted chat cannot expose Context V2 reads"
            )
        lifecycles = list_pupu_unchain_ownership_lifecycles(
            database_path=admission.database_path,
            owner_chat_id=owner_chat_id,
            limit=_MAX_LIFECYCLES,
        )
        if not lifecycles:
            raise PupuUnchainMemoryV2ReadError(
                "durable Unchain ownership lifecycle is unavailable"
            )
        if len(lifecycles) >= _MAX_LIFECYCLES:
            raise PupuUnchainMemoryV2ReadError(
                "durable Unchain ownership lifecycle exceeds the P0 limit"
            )
        space_ids = {lifecycle.chat_space_id for lifecycle in lifecycles}
        binding_ids = {lifecycle.binding_id for lifecycle in lifecycles}
        if len(space_ids) != 1:
            raise PupuUnchainMemoryV2ReadError(
                "durable Unchain workspace scope is ambiguous"
            )
        if len(binding_ids) != 1:
            raise PupuUnchainMemoryV2ReadError(
                "durable Unchain Curator scope is ambiguous"
            )
        execution_ids = tuple(
            sorted({lifecycle.execution_id for lifecycle in lifecycles})
        )
        object_directory = admission.root_dir / "objects"
        context_store = SQLiteContextV2Store(
            database_path=admission.database_path,
            object_directory=object_directory,
        )
        memory_store = SQLiteMemoryV2Store(
            database_path=admission.database_path,
            object_directory=object_directory,
        )
        compiler_store = SQLiteContextCompilerV2Store(
            context_store=context_store,
        )
        reader = SQLiteContextV2ReadService(
            context_store=context_store,
            memory_store=memory_store,
            compiler_store=compiler_store,
        ).bind(
            ContextV2ReadScope(
                owner_chat_id=owner_chat_id,
                execution_ids=execution_ids,
                space_id=next(iter(space_ids)),
            )
        )
        curator_query = SQLiteCuratorQueryV2Store(
            database_path=admission.database_path,
            object_directory=object_directory,
        ).bind(
            binding_id=next(iter(binding_ids)),
            owner_chat_id=owner_chat_id,
            target_space_id=next(iter(space_ids)),
        )
        return PupuUnchainMemoryV2Reader(reader, lifecycles, curator_query)
    except PupuUnchainMemoryV2ReadError:
        raise
    except (
        ChatDeletionError,
        ContextV2StoreBoundaryError,
        PupuUnchainMemoryV2OwnershipError,
        SQLiteContextV2ReadError,
        SQLiteCuratorQueryV2Error,
        TypeError,
        ValueError,
    ) as error:
        raise PupuUnchainMemoryV2ReadError(
            f"Unchain Context V2 read scope is unavailable: {error}"
        ) from error


def read_pupu_unchain_memory_v2_store_status(
    *,
    root_dir: str | Path,
) -> dict[str, Any]:
    """Initialize and read health without fabricating an owner/chat capability."""

    try:
        admission = admit_context_v2_store_owner(
            root_dir=root_dir,
            requested_owner=STORE_OWNER_UNCHAIN,
        )
        if (
            admission.owner == STORE_OWNER_UNCHAIN
            and admission.database_state in {"absent", "blank"}
        ):
            object_directory = admission.root_dir / "objects"
            SQLiteContextV2Store(
                database_path=admission.database_path,
                object_directory=object_directory,
            )
            SQLiteMemoryV2Store(
                database_path=admission.database_path,
                object_directory=object_directory,
            )
            admission = admit_context_v2_store_owner(
                root_dir=root_dir,
                requested_owner=STORE_OWNER_UNCHAIN,
            )
        if (
            admission.owner != STORE_OWNER_UNCHAIN
            or admission.database_state != STORE_OWNER_UNCHAIN
        ):
            raise PupuUnchainMemoryV2ReadError(
                "Unchain Context V2 database is unavailable"
            )
        status = read_sqlite_context_v2_store_status(admission.database_path).to_dict()
        status.pop("schema", None)
        return {**status, "storeOwner": STORE_OWNER_UNCHAIN}
    except PupuUnchainMemoryV2ReadError:
        raise
    except (
        ContextV2StoreBoundaryError,
        SQLiteContextV2ReadError,
        TypeError,
        ValueError,
    ) as error:
        raise PupuUnchainMemoryV2ReadError(
            f"Unchain Context V2 store status is unavailable: {error}"
        ) from error


__all__ = [
    "PupuUnchainMemoryV2ReadError",
    "PupuUnchainMemoryV2Reader",
    "open_pupu_unchain_memory_v2_reader",
    "read_pupu_unchain_memory_v2_store_status",
]
