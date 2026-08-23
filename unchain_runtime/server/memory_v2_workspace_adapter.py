"""Additive PuPu host adapters for Unchain's Memory V2 workspace ports.

The provider-neutral workspace behavior lives in Unchain.  This module only
binds that behavior to one PuPu schema-v4 chat workspace and one host run.  It
does not participate in agent/chat assembly yet.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from context_memory_v2_repository import (
    PupuExecutionCapabilities,
    PupuMemoryWorkspaceRepository,
)
from memory_v2_sanitizer import StorageTrust, sanitize_for_storage, sanitize_text
from unchain.context.ports import ContextRepositoryError, ContextScopeError
from unchain.journal import ResourceRef
from unchain.journal.ports import JournalRepositoryError, JournalScopeError
from unchain.memory.workspace import (
    MemoryEntry,
    MemoryEntryKind,
    MemoryLink,
    MemorySpace,
    MemoryWorkspaceService,
    WorkspaceWriteDraft,
)
from unchain.memory.workspace.ports import (
    BoundWorkspaceContentRepository,
    BoundWorkspaceHistoryRepository,
    BoundWorkspaceLinkRepository,
    BoundWorkspaceMutationRepository,
    BoundWorkspaceReferenceAuthorizer,
    RepositoryConflictError,
    RepositoryNotFoundError,
    RepositoryScopeError,
    WorkspaceContentPage,
    WorkspaceLinkRequest,
    WorkspaceMutationRequest,
    WorkspaceRepositoryError,
)


SCHEMA_V4_MAX_ENTRY_SOURCE_REFS = 1
_CREATED_BY = "unchain_workspace_v2_adapter"


class SchemaV4WorkspaceCapabilityError(WorkspaceRepositoryError):
    """A requested Unchain operation cannot be represented losslessly in v4."""


def _redact_workspace_write(draft: WorkspaceWriteDraft) -> WorkspaceWriteDraft:
    """Apply PuPu's storage sanitizer before Unchain creates the operation."""

    if not isinstance(draft, WorkspaceWriteDraft):
        raise TypeError("draft must be a WorkspaceWriteDraft")
    content = None
    if draft.content is not None:
        content = sanitize_for_storage(
            draft.content,
            declared_mime=draft.media_type,
            trust=StorageTrust.JOURNAL,
        ).data
    return replace(
        draft,
        path=sanitize_text(draft.path),
        description=sanitize_text(draft.description),
        content=content,
        media_type=sanitize_text(draft.media_type),
        link_url=sanitize_text(draft.link_url),
        tags=tuple(sanitize_text(tag) for tag in draft.tags),
    )


def _require_chat_repository(repository: PupuMemoryWorkspaceRepository) -> None:
    if not isinstance(repository, PupuMemoryWorkspaceRepository):
        raise TypeError("repository must be a PupuMemoryWorkspaceRepository")
    if not repository.is_chat_workspace:
        raise RepositoryScopeError("this adapter slice only supports chat workspaces")


def _require_entry_ref(ref: ResourceRef, *, space_id: str) -> None:
    if not isinstance(ref, ResourceRef):
        raise TypeError("ref must be a ResourceRef")
    if ref.kind != "memory" or ref.fragment != space_id:
        raise RepositoryScopeError("reference does not belong to the bound workspace")


def _schema_v4_source_event_id(
    entry: MemoryEntry,
    *,
    references: BoundWorkspaceReferenceAuthorizer,
) -> str:
    if len(entry.source_refs) != SCHEMA_V4_MAX_ENTRY_SOURCE_REFS:
        raise SchemaV4WorkspaceCapabilityError(
            "schema-v4 requires exactly one canonical context event source "
            "per entry revision"
        )
    source = entry.source_refs[0]
    if source.kind != "context_event" or source.revision != 1 or source.fragment:
        raise SchemaV4WorkspaceCapabilityError(
            "schema-v4 requires exactly one canonical context event source "
            "per entry revision"
        )
    if references.authorize(ref=source) != source:
        raise RepositoryScopeError("reference authorizer changed source provenance")
    return source.resource_id


class PupuWorkspaceReferenceAuthorizer(BoundWorkspaceReferenceAuthorizer):
    """Authorize refs inside one exact PuPu chat execution binding."""

    def __init__(
        self,
        repository: PupuMemoryWorkspaceRepository,
        *,
        binding_id: str,
        execution: PupuExecutionCapabilities,
    ) -> None:
        _require_chat_repository(repository)
        if not isinstance(execution, PupuExecutionCapabilities):
            raise TypeError("execution must be PupuExecutionCapabilities")
        if not repository.is_bound_to_execution(execution):
            raise RepositoryScopeError(
                "execution and workspace have different host bindings"
            )
        super().__init__(binding_id)
        self._repository = repository
        self._execution = execution

    def is_bound_to(self, repository: PupuMemoryWorkspaceRepository) -> bool:
        return (
            isinstance(repository, PupuMemoryWorkspaceRepository)
            and self._repository.is_same_binding(repository)
            and repository.is_bound_to_execution(self._execution)
        )

    def is_bound_to_execution(self, execution: PupuExecutionCapabilities) -> bool:
        """Match the complete immutable execution, not only its chat owner."""

        return (
            isinstance(execution, PupuExecutionCapabilities)
            and self._repository.is_bound_to_execution(execution)
            and self._execution.scope == execution.scope
        )

    def authorize(self, *, ref: ResourceRef) -> ResourceRef:
        if not isinstance(ref, ResourceRef):
            raise TypeError("ref must be a ResourceRef")
        if ref.kind == "memory":
            _require_entry_ref(ref, space_id=self._repository.space.space_id)
            entry = self._repository.read_entry(ref=ref)
            if entry.entry_id != ref.resource_id or entry.revision != ref.revision:
                raise RepositoryScopeError("memory reference resolved divergently")
            return ref
        if ref.kind == "context_event" and (
            ref.revision != 1 or bool(ref.fragment)
        ):
            raise RepositoryScopeError(
                "event provenance must be a bare canonical context event reference"
            )
        if ref.kind not in {"artifact", "checkpoint", "context_event"}:
            raise RepositoryScopeError(
                "reference kind is unavailable in the bound PuPu workspace"
            )
        try:
            self._execution.require_current_attempt()
            if ref.kind == "context_event":
                return self._execution.authorize_event_ref(ref)
            if ref.kind == "artifact":
                self._execution.artifacts.authorize_ref(ref)
            else:
                self._execution.checkpoints.read(ref=ref, offset=0, limit=1)
        except (ContextScopeError, JournalScopeError) as exc:
            message = (
                "event does not belong to the bound attempt"
                if ref.kind == "context_event"
                else "reference does not belong to the bound execution"
            )
            raise RepositoryNotFoundError(message) from exc
        except (ContextRepositoryError, JournalRepositoryError) as exc:
            raise WorkspaceRepositoryError(
                "bound execution reference lookup failed"
            ) from exc
        return ref


class PupuWorkspaceMutationRepository(BoundWorkspaceMutationRepository):
    """Atomic schema-v4 entry/content writes for one bound chat workspace."""

    def __init__(
        self,
        repository: PupuMemoryWorkspaceRepository,
        *,
        references: PupuWorkspaceReferenceAuthorizer,
        execution: PupuExecutionCapabilities,
    ) -> None:
        _require_chat_repository(repository)
        if type(references) is not PupuWorkspaceReferenceAuthorizer:
            raise TypeError(
                "references must be an exact PupuWorkspaceReferenceAuthorizer"
            )
        if type(execution) is not PupuExecutionCapabilities:
            raise TypeError("execution must be an exact PupuExecutionCapabilities")
        if not references.is_bound_to(repository):
            raise RepositoryScopeError(
                "reference authorizer belongs to a different workspace"
            )
        if references._execution is not execution:
            raise RepositoryScopeError(
                "reference authorizer does not hold the exact execution capability"
            )
        if not repository.is_bound_to_execution(execution):
            raise RepositoryScopeError(
                "execution and workspace have different host bindings"
            )
        if not references.is_bound_to_execution(execution):
            raise RepositoryScopeError(
                "reference authorizer belongs to a different execution"
            )
        super().__init__(repository.space)
        self._repository = repository
        self._references = references
        self._execution = execution

    @property
    def space(self) -> MemorySpace:
        return self._repository.space

    def apply(self, *, request: WorkspaceMutationRequest) -> MemoryEntry:
        if not isinstance(request, WorkspaceMutationRequest):
            raise TypeError("request must be a WorkspaceMutationRequest")
        entry = request.entry
        if entry.space_id != self.space.space_id:
            raise RepositoryScopeError("entry belongs to another workspace")
        # Permanent host defense-in-depth mirrors Unchain's domain invariant
        # before this adapter is allowed to cross the storage boundary.
        if entry.updated_seq != request.expected_space_revision + 1:
            raise WorkspaceRepositoryError(
                "entry updated sequence must advance with the workspace revision"
            )
        expected_entry_revision = (
            1 if request.expected_revision is None else request.expected_revision + 1
        )
        if entry.revision != expected_entry_revision:
            raise RepositoryConflictError("entry revision must advance exactly once")
        if entry.tags:
            raise SchemaV4WorkspaceCapabilityError(
                "schema-v4 cannot persist portable workspace tags"
            )
        source_event_id = _schema_v4_source_event_id(
            entry,
            references=self._references,
        )
        if entry.deleted:
            raise SchemaV4WorkspaceCapabilityError(
                "schema-v4 cannot persist fresh archive provenance atomically"
            )

        if entry.kind in {MemoryEntryKind.MARKDOWN, MemoryEntryKind.IMAGE}:
            if request.content is None:
                if request.expected_revision is None:
                    raise SchemaV4WorkspaceCapabilityError(
                        "schema-v4 file creation requires inline content"
                    )
                raise SchemaV4WorkspaceCapabilityError(
                    "schema-v4 cannot preserve the prior content reference for a "
                    "content-free file revision"
                )
        elif request.content is not None:
            raise SchemaV4WorkspaceCapabilityError(
                "schema-v4 folders cannot persist inline content"
            )
        if entry.kind is MemoryEntryKind.LINK and request.content is not None:
            raise SchemaV4WorkspaceCapabilityError(
                "schema-v4 URL entries cannot persist inline content"
            )

        persisted = self._repository.persist_schema_v4_mutation(
            execution=self._execution,
            request=request,
            source_event_id=source_event_id,
            created_by=_CREATED_BY,
        )
        # Permanent post-write defense verifies the schema-v4 projection did
        # not diverge from the domain-owned workspace sequence transition.
        if persisted.updated_seq != request.expected_space_revision + 1:
            raise WorkspaceRepositoryError(
                "schema-v4 returned a divergent workspace revision"
            )
        expected = replace(entry, content_ref=persisted.content_ref)
        if persisted != expected:
            raise WorkspaceRepositoryError(
                "schema-v4 returned a divergent workspace entry revision"
            )
        return persisted


class PupuWorkspaceContentRepository(BoundWorkspaceContentRepository):
    def __init__(self, repository: PupuMemoryWorkspaceRepository) -> None:
        _require_chat_repository(repository)
        super().__init__(repository.space)
        self._repository = repository

    @property
    def space(self) -> MemorySpace:
        return self._repository.space

    def read_content(
        self,
        *,
        ref: ResourceRef,
        offset: int = 0,
        limit: int = 32 * 1024,
    ) -> WorkspaceContentPage:
        _require_entry_ref(ref, space_id=self.space.space_id)
        return self._repository.read_content_page(
            ref=ref,
            offset=offset,
            limit=limit,
        )


class PupuWorkspaceHistoryRepository(BoundWorkspaceHistoryRepository):
    def __init__(self, repository: PupuMemoryWorkspaceRepository) -> None:
        _require_chat_repository(repository)
        super().__init__(repository.space)
        self._repository = repository

    @property
    def space(self) -> MemorySpace:
        return self._repository.space

    def list_revisions(
        self,
        *,
        ref: ResourceRef,
        before_revision: int | None = None,
        limit: int = 20,
    ) -> tuple[MemoryEntry, ...]:
        _require_entry_ref(ref, space_id=self.space.space_id)
        self._repository.read_entry(ref=ref)
        ceiling = before_revision if before_revision is not None else ref.revision + 1
        highest = min(ref.revision, ceiling - 1)
        revisions = []
        for revision in range(highest, 0, -1):
            revisions.append(
                self._repository.read_entry(
                    ref=ResourceRef(
                        "memory",
                        ref.resource_id,
                        revision,
                        self.space.space_id,
                    )
                )
            )
            if len(revisions) == limit:
                break
        return tuple(revisions)


class PupuUnavailableWorkspaceLinkRepository(BoundWorkspaceLinkRepository):
    """A visible fail-closed placeholder until relation links are migrated."""

    def __init__(self, repository: PupuMemoryWorkspaceRepository) -> None:
        _require_chat_repository(repository)
        super().__init__(repository.space)
        self._repository = repository

    @property
    def space(self) -> MemorySpace:
        return self._repository.space

    @staticmethod
    def _unavailable() -> None:
        raise SchemaV4WorkspaceCapabilityError(
            "schema-v4 relation links are outside this adapter slice"
        )

    def create_link(self, *, request: WorkspaceLinkRequest) -> MemoryLink:
        self._unavailable()

    def list_links(
        self,
        *,
        source_entry_ref: ResourceRef,
        limit: int = 100,
    ) -> tuple[MemoryLink, ...]:
        self._unavailable()

    def list_backlinks(
        self,
        *,
        target_entry_ref: ResourceRef,
        limit: int = 100,
    ) -> tuple[MemoryLink, ...]:
        self._unavailable()


@dataclass(frozen=True)
class PupuMemoryWorkspaceServiceBinding:
    repository: PupuMemoryWorkspaceRepository
    mutations: PupuWorkspaceMutationRepository
    content: PupuWorkspaceContentRepository
    history: PupuWorkspaceHistoryRepository
    references: PupuWorkspaceReferenceAuthorizer
    links: PupuUnavailableWorkspaceLinkRepository
    service: MemoryWorkspaceService
    relation_links_available: bool = False


def bind_pupu_memory_workspace_service(
    repository: PupuMemoryWorkspaceRepository,
    *,
    binding_id: str,
    execution: PupuExecutionCapabilities,
) -> PupuMemoryWorkspaceServiceBinding:
    """Bind Unchain workspace behavior to one existing PuPu chat space/run."""

    _require_chat_repository(repository)
    if not isinstance(execution, PupuExecutionCapabilities):
        raise TypeError("execution must be PupuExecutionCapabilities")
    if not repository.is_bound_to_execution(execution):
        raise RepositoryScopeError(
            "execution and workspace have different host bindings"
        )
    try:
        execution.require_current_attempt()
    except JournalScopeError as exc:
        raise RepositoryScopeError(str(exc)) from exc
    except JournalRepositoryError as exc:
        raise WorkspaceRepositoryError(
            "bound execution validation failed"
        ) from exc

    references = PupuWorkspaceReferenceAuthorizer(
        repository,
        binding_id=binding_id,
        execution=execution,
    )
    mutations = PupuWorkspaceMutationRepository(
        repository,
        references=references,
        execution=execution,
    )
    content = PupuWorkspaceContentRepository(repository)
    history = PupuWorkspaceHistoryRepository(repository)
    links = PupuUnavailableWorkspaceLinkRepository(repository)
    service = MemoryWorkspaceService(
        repository=repository,
        mutations=mutations,
        content=content,
        history=history,
        links=links,
        references=references,
        content_redactor=_redact_workspace_write,
    )
    return PupuMemoryWorkspaceServiceBinding(
        repository=repository,
        mutations=mutations,
        content=content,
        history=history,
        references=references,
        links=links,
        service=service,
    )


__all__ = [
    "PupuMemoryWorkspaceServiceBinding",
    "PupuUnavailableWorkspaceLinkRepository",
    "PupuWorkspaceContentRepository",
    "PupuWorkspaceHistoryRepository",
    "PupuWorkspaceMutationRepository",
    "PupuWorkspaceReferenceAuthorizer",
    "SCHEMA_V4_MAX_ENTRY_SOURCE_REFS",
    "SchemaV4WorkspaceCapabilityError",
    "bind_pupu_memory_workspace_service",
]
