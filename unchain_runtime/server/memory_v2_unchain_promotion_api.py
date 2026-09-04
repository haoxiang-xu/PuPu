"""Route-compatible PuPu presentation over Unchain-owned promotions.

This adapter owns no promotion tables and performs no SQLite reads.  It binds
the existing PuPu route arguments to Unchain's scope-bound workspace,
promotion, confirmation, and CAS services.  The target namespace is fixed to
``user:local``.  Optional route-level decision reasons are rejected until the
official decision record has durable provenance support.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    ContextV2StoreBoundaryError,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2OwnershipError,
    list_pupu_unchain_ownership_lifecycles,
)
from unchain.journal import ResourceRef
from unchain.memory.workspace import (
    PromotionConfirmationGrant,
    PromotionConfirmationService,
    PromotionProposal,
    PromotionService,
    PromotionStatus,
    UserConfirmationReceipt,
)
from unchain.memory.workspace.ports import (
    BoundMemoryWorkspaceRepository,
    BoundPromotionConfirmationAuthorizer,
    BoundPromotionDecisionRepository,
    BoundWorkspaceReferenceAuthorizer,
    RepositoryNotFoundError,
    RepositoryScopeError,
    WorkspaceRepositoryError,
)
from unchain.persistence.sqlite_chat_deletion_v2 import (
    ChatDeletionError,
    is_chat_deleted,
)
from unchain.persistence.sqlite_context_compiler_v2 import (
    SQLiteContextCompilerV2Store,
)
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_promotion_v2 import SQLitePromotionV2Store
from unchain.persistence.sqlite_read_v2 import (
    BoundSQLiteContextV2ReadService,
    ContextV2ReadScope,
    SQLiteContextV2ReadError,
    SQLiteContextV2ReadService,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


PUPU_LONG_TERM_NAMESPACE = "user:local"
_PROMOTION_REASON = "Promote curated chat memory for reuse"
_MAX_LIFECYCLES = 10_000


class PupuUnchainPromotionApiError(RuntimeError):
    """A route argument could not be represented by the official API."""

    def __init__(self, code: str, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _confirmation_id(
    *,
    owner_chat_id: str,
    proposal_ref: ResourceRef,
    approved: bool,
    operation_id: str,
) -> str:
    digest = hashlib.sha256(
        "\0".join(
            (
                owner_chat_id,
                proposal_ref.resource_id,
                str(proposal_ref.revision),
                str(approved),
                operation_id,
            )
        ).encode("utf-8")
    ).hexdigest()
    return f"pupu-user-promotion-confirmation-{digest}"


class _ExactUserConfirmationAuthorizer(BoundPromotionConfirmationAuthorizer):
    """One-use capability minted by the explicit user-decision route call."""

    def __init__(
        self,
        *,
        proposal_ref: ResourceRef,
        approved: bool,
        confirmation_id: str,
    ) -> None:
        super().__init__(PUPU_LONG_TERM_NAMESPACE)
        self._proposal_ref = proposal_ref
        self._approved = approved
        self._confirmation_id = confirmation_id
        self._consumed = False

    def consume(
        self,
        *,
        confirmation_id: str,
        proposal_ref: ResourceRef,
        approved: bool,
    ) -> PromotionConfirmationGrant:
        if self._consumed:
            raise PermissionError("promotion confirmation was already consumed")
        if (
            confirmation_id != self._confirmation_id
            or proposal_ref != self._proposal_ref
            or approved is not self._approved
        ):
            raise PermissionError("promotion confirmation binding changed")
        self._consumed = True
        return PromotionConfirmationGrant(
            confirmation_id=confirmation_id,
            proposal_ref=proposal_ref,
            target_namespace=self.target_namespace,
            approved=approved,
        )


class _LifecyclePromotionReferences(BoundWorkspaceReferenceAuthorizer):
    """Authorize promotion provenance within one durable chat lifecycle."""

    def __init__(
        self,
        *,
        binding_id: str,
        repository: BoundMemoryWorkspaceRepository,
        context_reader: BoundSQLiteContextV2ReadService,
    ) -> None:
        super().__init__(binding_id)
        if not isinstance(repository, BoundMemoryWorkspaceRepository):
            raise TypeError("repository must be an official bound repository")
        if not isinstance(context_reader, BoundSQLiteContextV2ReadService):
            raise TypeError("context_reader must be an official bound reader")
        self._repository = repository
        self._context_reader = context_reader

    def authorize(self, *, ref: ResourceRef) -> ResourceRef:
        if not isinstance(ref, ResourceRef):
            raise TypeError("ref must be a ResourceRef")
        if ref.kind == "memory":
            if ref.fragment != self._repository.space.space_id:
                raise RepositoryScopeError(
                    "memory provenance is outside the bound chat workspace"
                )
            entry = self._repository.read_entry(ref=ref)
            if (
                entry.space_id != self._repository.space.space_id
                or entry.entry_id != ref.resource_id
                or entry.revision != ref.revision
            ):
                raise RepositoryScopeError(
                    "memory provenance resolved to a different revision"
                )
            return ref
        if ref.kind not in {"artifact", "checkpoint", "context_event"}:
            raise RepositoryScopeError(
                "promotion provenance is outside the durable chat lineage"
            )
        try:
            authorized = self._context_reader.authorize_context_ref(ref=ref)
        except (SQLiteContextV2ReadError, TypeError, ValueError) as error:
            raise RepositoryNotFoundError(
                "durable promotion provenance is unavailable"
            ) from error
        if authorized != ref:
            raise RepositoryScopeError(
                "durable promotion provenance resolved divergently"
            )
        return ref


@dataclass(frozen=True, slots=True)
class PupuUnchainPromotionApi:
    """One owner-chat promotion capability with route-compatible methods."""

    owner_chat_id: str
    source_repository: BoundMemoryWorkspaceRepository = field(repr=False)
    references: BoundWorkspaceReferenceAuthorizer = field(repr=False)
    repository: BoundPromotionDecisionRepository = field(repr=False)
    _proposals: PromotionService = field(init=False, repr=False)

    def __post_init__(self) -> None:
        if not isinstance(self.owner_chat_id, str) or not self.owner_chat_id.strip():
            raise TypeError("owner_chat_id must be non-empty text")
        if not isinstance(self.source_repository, BoundMemoryWorkspaceRepository):
            raise TypeError("source_repository must be an official bound repository")
        if not isinstance(self.references, BoundWorkspaceReferenceAuthorizer):
            raise TypeError("references must be an official bound authorizer")
        if not isinstance(self.repository, BoundPromotionDecisionRepository):
            raise TypeError("repository must be an official promotion repository")
        if self.source_repository.space.namespace != "chat":
            raise RepositoryScopeError("promotion source must be a chat workspace")
        if self.repository.source_space.space_id != self.source_repository.space.space_id:
            raise RepositoryScopeError("promotion repository binds another chat workspace")
        if self.repository.target_namespace != PUPU_LONG_TERM_NAMESPACE:
            raise RepositoryScopeError(
                "promotion repository must bind the user:local namespace"
            )
        object.__setattr__(
            self,
            "_proposals",
            PromotionService(
                source_repository=self.source_repository,
                proposals=self.repository,
                references=self.references,
            ),
        )

    def _require_owner(self, owner_chat_id: str) -> None:
        if owner_chat_id != self.owner_chat_id:
            raise RepositoryScopeError("promotion owner is outside the bound chat")

    def _present(self, proposal: PromotionProposal) -> dict[str, Any]:
        if not isinstance(proposal, PromotionProposal):
            raise WorkspaceRepositoryError(
                "official promotion service returned an invalid record"
            )
        if (
            proposal.source_entry_ref.fragment
            != self.source_repository.space.space_id
            or proposal.target_namespace != PUPU_LONG_TERM_NAMESPACE
        ):
            raise RepositoryScopeError("promotion record escaped its bound scope")
        source = self.source_repository.read_entry(ref=proposal.source_entry_ref)
        if (
            source.space_id != self.source_repository.space.space_id
            or source.entry_id != proposal.source_entry_ref.resource_id
            or source.revision != proposal.source_entry_ref.revision
        ):
            raise RepositoryScopeError("promotion source record changed scope")
        target = proposal.target_entry_ref
        applied = proposal.applied_entry_ref
        serialized = proposal.to_dict()
        return {
            "promotion_id": proposal.proposal_id,
            "owner_chat_id": self.owner_chat_id,
            "source": {
                "space_id": source.space_id,
                "entry_id": source.entry_id,
                "revision": source.revision,
                "path": source.path,
            },
            "target_namespace": proposal.target_namespace,
            "target_path": proposal.target_path,
            "target_entry_id": target.resource_id if target is not None else "",
            "expected_target_revision": (
                target.revision if target is not None else None
            ),
            "status": proposal.status.value,
            "revision": proposal.revision,
            "applied_entry_id": (
                applied.resource_id if applied is not None else None
            ),
            "applied_entry_revision": (
                applied.revision if applied is not None else None
            ),
            "reason": proposal.reason,
            "diff": serialized["diff"],
            "source_refs": serialized["source_refs"],
            "decision_reason": "",
            "decision_reason_supported": False,
            "decision_reason_persistence": "unsupported",
            "requires_user_confirmation": proposal.status is PromotionStatus.PENDING,
        }

    def list_promotions(
        self,
        *,
        owner_chat_id: str,
        status: str = "",
        limit: int = 100,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        normalized_status = str(status or "").strip().casefold()
        status_filter = None
        if normalized_status:
            try:
                status_filter = PromotionStatus(normalized_status)
            except ValueError as error:
                raise PupuUnchainPromotionApiError(
                    "context_v2_invalid_request",
                    "promotion status is invalid",
                ) from error
        proposals = self.repository.list_current(
            status=status_filter,
            limit=limit,
        )
        return {
            "owner_chat_id": self.owner_chat_id,
            "promotions": [self._present(proposal) for proposal in proposals],
        }

    def propose_promotion(
        self,
        *,
        owner_chat_id: str,
        source_space_id: str,
        source_entry_id: str,
        source_entry_revision: int,
        target_namespace: str,
        target_path: str,
        operation_id: str,
        target_entry_id: str = "",
        expected_target_revision: int | None = None,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        if source_space_id != self.source_repository.space.space_id:
            raise RepositoryScopeError("promotion source space is outside the bound chat")
        if target_namespace != PUPU_LONG_TERM_NAMESPACE:
            raise RepositoryScopeError("promotion target namespace is fixed to user:local")
        has_target_id = bool(target_entry_id)
        has_target_revision = expected_target_revision is not None
        if has_target_id is not has_target_revision:
            raise PupuUnchainPromotionApiError(
                "context_v2_invalid_request",
                "target entry ID and revision must be supplied together",
            )
        target_ref = None
        if has_target_id:
            target_ref = ResourceRef(
                "memory",
                target_entry_id,
                expected_target_revision,
                self.repository.target_space_id,
            )
        proposal = self._proposals.propose(
            source_ref=ResourceRef(
                "memory",
                source_entry_id,
                source_entry_revision,
                self.source_repository.space.space_id,
            ),
            target_path=target_path,
            target_entry_ref=target_ref,
            reason=_PROMOTION_REASON,
            source_refs=(),
            operation_id=operation_id,
        )
        return self._present(proposal)

    def decide_promotion(
        self,
        *,
        owner_chat_id: str,
        promotion_id: str,
        decision: str,
        expected_revision: int,
        operation_id: str,
        decision_reason: str = "",
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        if str(decision_reason or "").strip():
            raise PupuUnchainPromotionApiError(
                "context_v2_promotion_decision_reason_unsupported",
                "decision_reason is not durably supported by the official promotion record",
            )
        normalized_decision = str(decision or "").strip().casefold()
        if normalized_decision not in {"apply", "reject"}:
            raise PupuUnchainPromotionApiError(
                "context_v2_invalid_request",
                "promotion decision is invalid",
            )
        approved = normalized_decision == "apply"
        proposal_ref = ResourceRef(
            "promotion",
            promotion_id,
            expected_revision,
            PUPU_LONG_TERM_NAMESPACE,
        )
        confirmation_id = _confirmation_id(
            owner_chat_id=self.owner_chat_id,
            proposal_ref=proposal_ref,
            approved=approved,
            operation_id=operation_id,
        )
        confirmations = _ExactUserConfirmationAuthorizer(
            proposal_ref=proposal_ref,
            approved=approved,
            confirmation_id=confirmation_id,
        )
        decided = PromotionConfirmationService(
            self.repository,
            confirmations=confirmations,
        ).decide(
            ref=proposal_ref,
            expected_revision=expected_revision,
            confirmation=UserConfirmationReceipt(
                confirmation_id=confirmation_id,
                approved=approved,
            ),
            operation_id=operation_id,
        )
        return self._present(decided)


def open_pupu_unchain_promotion_api(
    *,
    root_dir: str | Path,
    owner_chat_id: str,
) -> PupuUnchainPromotionApi:
    """Cold-open the official promotion capability for one durable chat."""

    try:
        admission = admit_context_v2_store_owner(
            root_dir=root_dir,
            requested_owner=STORE_OWNER_UNCHAIN,
        )
        if (
            admission.owner != STORE_OWNER_UNCHAIN
            or admission.database_state != STORE_OWNER_UNCHAIN
        ):
            raise PupuUnchainPromotionApiError(
                "context_v2_promotion_store_unavailable",
                "Unchain Context V2 promotion storage is unavailable",
                status_code=503,
            )
        if is_chat_deleted(
            database_path=admission.database_path,
            owner_chat_id=owner_chat_id,
        ):
            raise PupuUnchainPromotionApiError(
                "context_v2_promotion_chat_deleted",
                "A durably deleted chat cannot expose promotions",
                status_code=410,
            )
        lifecycles = list_pupu_unchain_ownership_lifecycles(
            database_path=admission.database_path,
            owner_chat_id=owner_chat_id,
            limit=_MAX_LIFECYCLES,
        )
        if not lifecycles:
            raise PupuUnchainPromotionApiError(
                "context_v2_promotion_lifecycle_unavailable",
                "The durable Unchain chat lifecycle is unavailable",
                status_code=409,
            )
        if len(lifecycles) >= _MAX_LIFECYCLES:
            raise PupuUnchainPromotionApiError(
                "context_v2_promotion_lifecycle_limit_exceeded",
                "The durable Unchain chat lifecycle exceeds the P0 limit",
                status_code=409,
            )
        space_ids = {item.chat_space_id for item in lifecycles}
        binding_ids = {item.binding_id for item in lifecycles}
        if len(space_ids) != 1 or len(binding_ids) != 1:
            raise PupuUnchainPromotionApiError(
                "context_v2_promotion_lifecycle_ambiguous",
                "The durable Unchain promotion scope is ambiguous",
                status_code=409,
            )
        execution_ids = tuple(sorted({item.execution_id for item in lifecycles}))
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
        context_reader = SQLiteContextV2ReadService(
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
        source_repository = memory_store.bind_workspace(
            space=context_reader.workspace_space,
            owner_chat_id=owner_chat_id,
        )
        references = _LifecyclePromotionReferences(
            binding_id=next(iter(binding_ids)),
            repository=source_repository,
            context_reader=context_reader,
        )
        repository = SQLitePromotionV2Store(
            database_path=admission.database_path,
            object_directory=object_directory,
        ).bind(
            source_space=source_repository.space,
            source_owner_chat_id=owner_chat_id,
            target_namespace=PUPU_LONG_TERM_NAMESPACE,
        )
        return PupuUnchainPromotionApi(
            owner_chat_id=owner_chat_id,
            source_repository=source_repository,
            references=references,
            repository=repository,
        )
    except PupuUnchainPromotionApiError:
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
        raise PupuUnchainPromotionApiError(
            "context_v2_promotion_open_failed",
            "The durable Unchain promotion capability is unavailable",
            status_code=503,
        ) from error


__all__ = [
    "PUPU_LONG_TERM_NAMESPACE",
    "PupuUnchainPromotionApi",
    "PupuUnchainPromotionApiError",
    "open_pupu_unchain_promotion_api",
]
