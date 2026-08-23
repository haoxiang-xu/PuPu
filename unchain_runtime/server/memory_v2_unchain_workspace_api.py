"""Owner-bound HTTP presentation for Unchain's official chat workspace.

This additive adapter cold-opens one durable PuPu ownership lifecycle and then
delegates workspace semantics to ``SQLiteMemoryV2Store`` and
``MemoryWorkspaceService``.  Route-shaped owner and space arguments are
checked against the durable lifecycle; callers cannot select a different
scope through an individual operation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    ContextV2StoreBoundaryError,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2Lifecycle,
    PupuUnchainMemoryV2OwnershipError,
    list_pupu_unchain_ownership_lifecycles,
)
from unchain.journal import ResourceRef
from unchain.memory.workspace import (
    MemoryEntry,
    MemoryEntryKind,
    MemoryWorkspaceService,
)
from unchain.memory.workspace.ports import (
    BoundMemoryWorkspaceRepository,
    BoundWorkspaceReferenceAuthorizer,
    RepositoryNotFoundError,
    RepositoryScopeError,
    WorkspaceRepositoryError,
)
from unchain.persistence.sqlite_chat_deletion_v2 import (
    ChatDeletionError,
    is_chat_deleted,
)
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_read_v2 import (
    BoundSQLiteContextV2ReadService,
    ContextV2ReadScope,
    SQLiteContextV2ReadError,
    SQLiteContextV2ReadService,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


_MAX_LIFECYCLES = 10_000
_LIST_PAGE_SIZE = 200
_MAX_LIST_ENTRIES = 10_000
_CONTENT_PAGE_BYTES = 32 * 1024
_MAX_CONTENT_BYTES = 256 * 1024


class PupuUnchainWorkspaceAPIError(WorkspaceRepositoryError):
    """Stable host capability/opening failure for this additive slice."""

    def __init__(self, code: str) -> None:
        self.code = str(code or "unchain_workspace_api_failed")
        super().__init__(self.code)


class _LifecycleWorkspaceReferences(BoundWorkspaceReferenceAuthorizer):
    """Authorize provenance inside one durable chat lineage only."""

    def __init__(
        self,
        *,
        binding_id: str,
        repository: Any,
        space_id: str,
        context_reader: BoundSQLiteContextV2ReadService,
    ) -> None:
        super().__init__(binding_id)
        self._repository = repository
        self._space_id = space_id
        self._context_reader = context_reader

    def authorize(self, *, ref: ResourceRef) -> ResourceRef:
        if not isinstance(ref, ResourceRef):
            raise TypeError("ref must be a ResourceRef")
        if ref.kind == "memory":
            if ref.fragment != self._space_id:
                raise RepositoryScopeError(
                    "memory provenance is outside the bound chat workspace"
                )
            entry = self._repository.read_entry(ref=ref)
            if entry.entry_id != ref.resource_id or entry.revision != ref.revision:
                raise RepositoryScopeError(
                    "memory provenance resolved to a different revision"
                )
            return ref
        if ref.kind != "context_event" or ref.revision != 1 or ref.fragment:
            raise RepositoryScopeError(
                "workspace route provenance must be a canonical context event"
            )
        try:
            authorized = self._context_reader.authorize_context_ref(ref=ref)
        except (SQLiteContextV2ReadError, TypeError, ValueError) as error:
            raise RepositoryScopeError(
                "context event provenance is outside the bound chat lineage"
            ) from error
        if authorized != ref:
            raise RepositoryScopeError(
                "context event provenance resolved divergently"
            )
        return ref


@dataclass(frozen=True, slots=True)
class PupuUnchainWorkspaceAPI:
    """Route-compatible API over one lifecycle-bound official workspace."""

    owner_chat_id: str
    space_id: str
    binding_id: str
    _memory_store: SQLiteMemoryV2Store = field(repr=False)
    _workspace: MemoryWorkspaceService = field(repr=False)
    _reference_authorizer: BoundWorkspaceReferenceAuthorizer = field(repr=False)
    _context_reader: BoundSQLiteContextV2ReadService = field(repr=False)
    _lifecycles: tuple[PupuUnchainMemoryV2Lifecycle, ...] = field(repr=False)

    def __post_init__(self) -> None:
        if not isinstance(self._memory_store, SQLiteMemoryV2Store):
            raise TypeError("memory_store must be a SQLiteMemoryV2Store")
        if not isinstance(self._workspace, MemoryWorkspaceService):
            raise TypeError("workspace must be a MemoryWorkspaceService")
        if not isinstance(
            self._reference_authorizer,
            BoundWorkspaceReferenceAuthorizer,
        ):
            raise TypeError(
                "reference_authorizer must be a BoundWorkspaceReferenceAuthorizer"
            )
        if not isinstance(self._context_reader, BoundSQLiteContextV2ReadService):
            raise TypeError(
                "context_reader must be a BoundSQLiteContextV2ReadService"
            )
        if not self._lifecycles or any(
            not isinstance(item, PupuUnchainMemoryV2Lifecycle)
            for item in self._lifecycles
        ):
            raise TypeError("lifecycles must contain durable lifecycle records")
        if any(
            item.owner_chat_id != self.owner_chat_id
            or item.chat_space_id != self.space_id
            or item.binding_id != self.binding_id
            for item in self._lifecycles
        ):
            raise RepositoryScopeError("durable lifecycle scope changed")
        if (
            self._workspace.binding_id != self.binding_id
            or self._reference_authorizer.binding_id != self.binding_id
            or self._workspace.space.space_id != self.space_id
            or self._context_reader.scope.owner_chat_id != self.owner_chat_id
            or self._context_reader.scope.space_id != self.space_id
        ):
            raise RepositoryScopeError("official workspace binding changed")

    @property
    def source_repository(self) -> BoundMemoryWorkspaceRepository:
        """Return the exact official repository selected by this lifecycle."""

        return self._workspace.repository

    @property
    def reference_authorizer(self) -> BoundWorkspaceReferenceAuthorizer:
        """Return the exact scope-bound authorizer used by workspace writes."""

        return self._reference_authorizer

    def _require_owner(self, owner_chat_id: str) -> None:
        if owner_chat_id != self.owner_chat_id:
            raise RepositoryScopeError(
                "owner is outside the durable workspace lifecycle"
            )

    def _require_space(self, space_id: str) -> None:
        if space_id != self.space_id:
            raise RepositoryScopeError(
                "space is outside the durable workspace lifecycle"
            )

    def _entries(
        self,
        *,
        parent_path: str,
        recursive: bool,
        include_deleted: bool = False,
    ) -> tuple[MemoryEntry, ...]:
        entries: list[MemoryEntry] = []
        cursor = None
        while len(entries) < _MAX_LIST_ENTRIES:
            page = self._workspace.list(
                parent_path=parent_path or "/",
                include_deleted=include_deleted,
                recursive=recursive,
                limit=_LIST_PAGE_SIZE,
                cursor=cursor,
            )
            entries.extend(page.entries)
            if not page.has_more:
                return tuple(entries)
            if page.next_cursor is None or page.next_cursor == cursor:
                raise PupuUnchainWorkspaceAPIError(
                    "workspace_pagination_did_not_advance"
                )
            cursor = page.next_cursor
        raise PupuUnchainWorkspaceAPIError("workspace_listing_limit_exceeded")

    def _entry(
        self,
        *,
        entry_id: str,
        revision: int | None,
    ) -> MemoryEntry:
        entry = self._context_reader.get_workspace_entry(
            ref=(
                ResourceRef("memory", entry_id, revision, self.space_id)
                if revision is not None
                else None
            ),
            entry_id=entry_id if revision is None else None,
        )
        if revision is None and entry.deleted:
            raise RepositoryNotFoundError("entry was not found")
        return entry

    def _source_event_refs(self, source_event_id: str) -> tuple[ResourceRef, ...]:
        if not isinstance(source_event_id, str) or not source_event_id.strip():
            raise PupuUnchainWorkspaceAPIError(
                "workspace_source_event_required"
            )
        return (ResourceRef("context_event", source_event_id.strip(), 1),)

    def _read_full_content(self, ref: ResourceRef) -> bytes:
        chunks: list[bytes] = []
        offset = 0
        total_bytes = None
        while offset < _MAX_CONTENT_BYTES:
            page = self._workspace.read(
                ref,
                offset=offset,
                limit=_CONTENT_PAGE_BYTES,
            )
            if total_bytes is None:
                total_bytes = page.total_bytes
                if total_bytes > _MAX_CONTENT_BYTES:
                    raise PupuUnchainWorkspaceAPIError(
                        "workspace_content_limit_exceeded"
                    )
            elif page.total_bytes != total_bytes:
                raise PupuUnchainWorkspaceAPIError(
                    "workspace_content_changed_during_read"
                )
            chunks.append(page.data)
            if not page.has_more:
                return b"".join(chunks)
            if page.next_offset <= offset:
                raise PupuUnchainWorkspaceAPIError(
                    "workspace_content_pagination_did_not_advance"
                )
            offset = page.next_offset
        raise PupuUnchainWorkspaceAPIError("workspace_content_limit_exceeded")

    def list_spaces(self, *, owner_chat_id: str) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        return {
            "owner_chat_id": self.owner_chat_id,
            "spaces": [_route_space(self._workspace.space, self.owner_chat_id)],
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
        entries = self._entries(
            parent_path=parent_path or "/",
            recursive=include_descendants,
        )
        return {
            "owner_chat_id": self.owner_chat_id,
            "space_id": self.space_id,
            "space_revision": self._workspace.space.revision,
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
        nodes = {
            item["path"]: {**item, "children": []}
            for item in listing["entries"]
        }
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
        return _route_entry(self._entry(entry_id=entry_id, revision=revision))

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
        result = self._workspace.search(query, limit=min(limit, 100))
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

    def create_entry(
        self,
        *,
        owner_chat_id: str,
        space_id: str,
        path: str,
        kind: str,
        expected_space_revision: int,
        operation_id: str,
        description: str = "",
        mime_type: str = "application/octet-stream",
        content: bytes | None = None,
        link_url: str = "",
        source_event_id: str = "",
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        self._require_space(space_id)
        entry_kind = _route_kind(kind, mime_type=mime_type)
        sources = self._source_event_refs(source_event_id)
        if entry_kind is MemoryEntryKind.FOLDER:
            if content is not None or link_url:
                raise PupuUnchainWorkspaceAPIError(
                    "workspace_folder_payload_invalid"
                )
            entry = self._workspace.create_folder(
                path=path,
                description=description,
                expected_space_revision=expected_space_revision,
                source_refs=sources,
                operation_id=operation_id,
            )
        elif entry_kind is MemoryEntryKind.MARKDOWN:
            if link_url or mime_type.casefold() not in {
                "application/octet-stream",
                "text/markdown",
                "text/plain",
            }:
                raise PupuUnchainWorkspaceAPIError(
                    "workspace_markdown_payload_invalid"
                )
            entry = self._workspace.write_markdown(
                path=path,
                description=description,
                content=content,
                expected_space_revision=expected_space_revision,
                source_refs=sources,
                operation_id=operation_id,
            )
        elif entry_kind is MemoryEntryKind.IMAGE:
            if link_url:
                raise PupuUnchainWorkspaceAPIError(
                    "workspace_image_payload_invalid"
                )
            entry = self._workspace.write_image(
                path=path,
                description=description,
                content=content,
                media_type=mime_type,
                expected_space_revision=expected_space_revision,
                source_refs=sources,
                operation_id=operation_id,
            )
        else:
            if content is not None:
                raise PupuUnchainWorkspaceAPIError(
                    "workspace_link_payload_invalid"
                )
            entry = self._workspace.create_link(
                path=path,
                description=description,
                url=link_url,
                expected_space_revision=expected_space_revision,
                source_refs=sources,
                operation_id=operation_id,
            )
        return _route_entry(entry)

    def update_entry(
        self,
        *,
        owner_chat_id: str,
        space_id: str,
        entry_id: str,
        expected_revision: int,
        expected_space_revision: int,
        operation_id: str,
        path: str | None = None,
        description: str | None = None,
        mime_type: str | None = None,
        content: bytes | None = None,
        link_url: str | None = None,
        source_event_id: str | None = None,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        self._require_space(space_id)
        ref = ResourceRef(
            "memory",
            entry_id,
            expected_revision,
            self.space_id,
        )
        base = self._entry(entry_id=entry_id, revision=expected_revision)
        sources = (
            self._source_event_refs(source_event_id)
            if source_event_id
            else base.source_refs
        )
        next_path = path if path is not None else base.path
        next_description = (
            description if description is not None else base.description
        )

        if base.kind is MemoryEntryKind.FOLDER:
            if (
                next_description != base.description
                or next_path == base.path
                or content is not None
                or link_url not in (None, "")
                or mime_type not in (None, "")
            ):
                raise PupuUnchainWorkspaceAPIError(
                    "workspace_folder_metadata_update_unsupported"
                )
            entry = self._workspace.move(
                ref=ref,
                new_path=next_path,
                expected_space_revision=expected_space_revision,
                source_refs=sources,
                operation_id=operation_id,
            )
        elif base.kind is MemoryEntryKind.MARKDOWN:
            if link_url not in (None, "") or (
                mime_type is not None
                and mime_type.casefold() not in {"text/markdown", "text/plain"}
            ):
                raise PupuUnchainWorkspaceAPIError(
                    "workspace_markdown_payload_invalid"
                )
            entry = self._workspace.write_markdown(
                path=next_path,
                description=next_description,
                content=(content if content is not None else self._read_full_content(ref)),
                expected_space_revision=expected_space_revision,
                source_refs=sources,
                operation_id=operation_id,
                entry_ref=ref,
            )
        elif base.kind is MemoryEntryKind.IMAGE:
            if link_url not in (None, ""):
                raise PupuUnchainWorkspaceAPIError(
                    "workspace_image_payload_invalid"
                )
            entry = self._workspace.write_image(
                path=next_path,
                description=next_description,
                content=(content if content is not None else self._read_full_content(ref)),
                media_type=mime_type if mime_type is not None else base.media_type,
                expected_space_revision=expected_space_revision,
                source_refs=sources,
                operation_id=operation_id,
                entry_ref=ref,
            )
        else:
            if content is not None or mime_type not in (None, ""):
                raise PupuUnchainWorkspaceAPIError(
                    "workspace_link_payload_invalid"
                )
            entry = self._workspace.create_link(
                path=next_path,
                description=next_description,
                url=link_url if link_url is not None else base.link_url,
                expected_space_revision=expected_space_revision,
                source_refs=sources,
                operation_id=operation_id,
                entry_ref=ref,
            )
        return _route_entry(entry)

    def delete_entry(
        self,
        *,
        owner_chat_id: str,
        space_id: str,
        entry_id: str,
        expected_revision: int,
        expected_space_revision: int,
        operation_id: str,
        recursive: bool = False,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        self._require_space(space_id)
        ref = ResourceRef(
            "memory",
            entry_id,
            expected_revision,
            self.space_id,
        )
        base = self._entry(entry_id=entry_id, revision=expected_revision)
        entry = self._workspace.archive(
            ref=ref,
            expected_space_revision=expected_space_revision,
            source_refs=(ref,),
            operation_id=operation_id,
            recursive=recursive,
        )
        deleted_ids = []
        if recursive and base.kind is MemoryEntryKind.FOLDER:
            descendants = self._entries(
                parent_path=base.path,
                recursive=True,
                include_deleted=True,
            )
            deleted_ids.extend(
                item.entry_id
                for item in sorted(
                    (
                        item
                        for item in descendants
                        if item.deleted and item.updated_seq == entry.updated_seq
                    ),
                    key=lambda item: (-len(item.path), item.path.casefold()),
                )
            )
        deleted_ids.append(entry.entry_id)
        return {
            "space_id": self.space_id,
            "entry_id": entry.entry_id,
            "deleted_entry_ids": deleted_ids,
            "space_revision": entry.updated_seq,
            "deleted": True,
            "replayed": False,
        }


def _route_kind(value: str, *, mime_type: str) -> MemoryEntryKind:
    if not isinstance(value, str):
        raise TypeError("kind must be text")
    normalized = value.strip().casefold()
    if normalized == "file":
        normalized_mime = str(mime_type or "").strip().casefold()
        if normalized_mime in {"text/markdown", "text/plain"}:
            return MemoryEntryKind.MARKDOWN
        if normalized_mime.startswith("image/"):
            return MemoryEntryKind.IMAGE
        raise PupuUnchainWorkspaceAPIError("workspace_file_kind_unsupported")
    try:
        return MemoryEntryKind(normalized)
    except ValueError as error:
        raise PupuUnchainWorkspaceAPIError("workspace_entry_kind_invalid") from error


def _route_resource_uri(ref: ResourceRef) -> str:
    if ref.kind == "memory" and ref.fragment:
        return f"pupu://memory/{ref.fragment}/{ref.resource_id}@{ref.revision}"
    if ref.kind == "context_event" and not ref.fragment:
        return f"pupu://context/event/{ref.resource_id}"
    if ref.kind == "artifact" and not ref.fragment:
        return f"pupu://artifact/{ref.resource_id}@{ref.revision}"
    if ref.kind == "checkpoint" and ref.revision == 1 and not ref.fragment:
        return f"pupu://context/checkpoint/{ref.resource_id}"
    return ""


def _route_space(space: Any, owner_chat_id: str) -> dict[str, Any]:
    return {
        "space_id": space.space_id,
        "scope_kind": "chat",
        "scope_key": owner_chat_id,
        "owner_chat_id": owner_chat_id,
        "namespace": space.namespace,
        "name": space.name,
        "description": space.description,
        "revision": space.revision,
        "replayed": False,
    }


def _route_entry(entry: MemoryEntry) -> dict[str, Any]:
    ref = f"pupu://memory/{entry.space_id}/{entry.entry_id}@{entry.revision}"
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
        "parent_path": entry.path.rsplit("/", 1)[0] or "/",
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
    if entry.kind in {MemoryEntryKind.MARKDOWN, MemoryEntryKind.IMAGE}:
        response["content_ref"] = ref
    elif entry.kind is MemoryEntryKind.LINK:
        response["link_url"] = entry.link_url
    return response


def open_pupu_unchain_workspace_api(
    *,
    root_dir: str | Path,
    owner_chat_id: str,
) -> PupuUnchainWorkspaceAPI:
    """Cold-open the unique active workspace recorded for one chat owner."""

    try:
        admission = admit_context_v2_store_owner(
            root_dir=root_dir,
            requested_owner=STORE_OWNER_UNCHAIN,
        )
        if (
            admission.owner != STORE_OWNER_UNCHAIN
            or admission.database_state != STORE_OWNER_UNCHAIN
        ):
            raise PupuUnchainWorkspaceAPIError(
                "unchain_workspace_store_unavailable"
            )
        if is_chat_deleted(
            database_path=admission.database_path,
            owner_chat_id=owner_chat_id,
        ):
            raise PupuUnchainWorkspaceAPIError(
                "unchain_workspace_chat_deleted"
            )
        lifecycles = list_pupu_unchain_ownership_lifecycles(
            database_path=admission.database_path,
            owner_chat_id=owner_chat_id,
            limit=_MAX_LIFECYCLES,
        )
        if not lifecycles:
            raise PupuUnchainWorkspaceAPIError(
                "unchain_workspace_lifecycle_unavailable"
            )
        if len(lifecycles) >= _MAX_LIFECYCLES:
            raise PupuUnchainWorkspaceAPIError(
                "unchain_workspace_lifecycle_limit_exceeded"
            )
        space_ids = {item.chat_space_id for item in lifecycles}
        binding_ids = {item.binding_id for item in lifecycles}
        if len(space_ids) != 1 or len(binding_ids) != 1:
            raise PupuUnchainWorkspaceAPIError(
                "unchain_workspace_lifecycle_ambiguous"
            )
        execution_ids = tuple(sorted({item.execution_id for item in lifecycles}))
        space_id = next(iter(space_ids))
        binding_id = next(iter(binding_ids))
        object_directory = admission.root_dir / "objects"
        memory_store = SQLiteMemoryV2Store(
            database_path=admission.database_path,
            object_directory=object_directory,
        )
        context_store = SQLiteContextV2Store(
            database_path=admission.database_path,
            object_directory=object_directory,
        )
        context_reader = SQLiteContextV2ReadService(
            context_store=context_store,
            memory_store=memory_store,
        ).bind(
            ContextV2ReadScope(
                owner_chat_id=owner_chat_id,
                execution_ids=execution_ids,
                space_id=space_id,
            )
        )
        repository = memory_store.bind_workspace(
            space=context_reader.workspace_space,
            owner_chat_id=owner_chat_id,
        )
        references = _LifecycleWorkspaceReferences(
            binding_id=binding_id,
            repository=repository,
            space_id=space_id,
            context_reader=context_reader,
        )
        workspace = MemoryWorkspaceService(
            repository=repository,
            mutations=repository,
            content=repository,
            history=repository,
            links=repository,
            references=references,
        )
        return PupuUnchainWorkspaceAPI(
            owner_chat_id=owner_chat_id,
            space_id=space_id,
            binding_id=binding_id,
            _memory_store=memory_store,
            _workspace=workspace,
            _reference_authorizer=references,
            _context_reader=context_reader,
            _lifecycles=lifecycles,
        )
    except PupuUnchainWorkspaceAPIError:
        raise
    except (
        ChatDeletionError,
        ContextV2StoreBoundaryError,
        PupuUnchainMemoryV2OwnershipError,
        SQLiteContextV2ReadError,
        WorkspaceRepositoryError,
        TypeError,
        ValueError,
    ) as error:
        raise PupuUnchainWorkspaceAPIError(
            "unchain_workspace_open_failed"
        ) from error


__all__ = [
    "PupuUnchainWorkspaceAPI",
    "PupuUnchainWorkspaceAPIError",
    "open_pupu_unchain_workspace_api",
]
