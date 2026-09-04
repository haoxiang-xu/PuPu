"""Thin PuPu host bindings for Unchain's promotion state machine.

The provider-neutral proposal and confirmation semantics live in Unchain.  The
classes in this module only adapt those bound ports to PuPu's schema-v4 store;
they are not mounted into the production toolkit or routes by this slice.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Mapping

from context_memory_v2_repository import PupuMemoryWorkspaceRepository
from memory_v2_store import MemoryV2Error, MemoryV2Store
from unchain.journal import OperationRef, ResourceRef
from unchain.memory.workspace import (
    MemoryEntry,
    MemorySpace,
    PromotionProposal,
    PromotionStatus,
)
from unchain.memory.workspace.ports import (
    BoundPromotionConfirmationAuthorizer,
    BoundPromotionDecisionRepository,
    BoundPromotionRepository,
    PromotionConfirmationGrant,
    RepositoryConflictError,
    RepositoryNotFoundError,
    RepositoryScopeError,
    WorkspaceRepositoryError,
)
from unchain.memory.workspace.promotions import UserConfirmationReceipt


_COMPATIBILITY_SCHEMA = "pupu.promotion_compatibility.v1"
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$")
_OWNER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")


def _repository_failure(exc: MemoryV2Error) -> None:
    if exc.status_code == 409:
        raise RepositoryConflictError(str(exc)) from exc
    if exc.status_code in {403, 404, 410}:
        raise RepositoryNotFoundError(str(exc)) from exc
    raise WorkspaceRepositoryError(str(exc)) from exc


def _proposal_id(
    source_space_id: str,
    target_namespace: str,
    operation: OperationRef,
) -> str:
    digest = hashlib.sha256(
        f"{source_space_id}\0{target_namespace}\0{operation.operation_id}".encode(
            "utf-8"
        )
    ).hexdigest()
    return f"promotion-{digest[:32]}"


class PupuPromotionRepository(BoundPromotionRepository):
    """Curator-safe schema-v4 proposal repository."""

    def __init__(
        self,
        store: MemoryV2Store,
        *,
        owner_chat_id: str,
        source_space: MemorySpace,
        target_space: MemorySpace,
    ) -> None:
        if not isinstance(store, MemoryV2Store):
            raise TypeError("store must be a MemoryV2Store")
        if not isinstance(source_space, MemorySpace):
            raise TypeError("source_space must be a MemorySpace")
        if not isinstance(target_space, MemorySpace):
            raise TypeError("target_space must be a MemorySpace")
        if (
            not isinstance(owner_chat_id, str)
            or _OWNER_RE.fullmatch(owner_chat_id) is None
        ):
            raise ValueError("owner_chat_id is invalid")
        if source_space.namespace != "chat":
            raise RepositoryScopeError("promotion source must be a chat workspace")
        if target_space.namespace == "chat":
            raise RepositoryScopeError("promotion target must be long-term memory")
        try:
            store.list_entries(
                owner_chat_id=owner_chat_id,
                space_id=source_space.space_id,
            )
            store.list_entries(
                owner_chat_id=owner_chat_id,
                space_id=target_space.space_id,
                allow_long_term=True,
                namespace=target_space.namespace,
            )
        except MemoryV2Error as exc:
            _repository_failure(exc)
        super().__init__(
            source_space,
            target_space.namespace,
            target_space.space_id,
        )
        self._store = store
        self._owner_chat_id = owner_chat_id
        self._target_repository = PupuMemoryWorkspaceRepository(
            store,
            owner_chat_id=owner_chat_id,
            space=target_space,
            allow_long_term=True,
            namespace=target_space.namespace,
        )

    @staticmethod
    def _compatibility_payload(
        *,
        proposal: PromotionProposal,
        operation: OperationRef,
        kind: str,
    ) -> dict[str, Any]:
        return {
            "schema": _COMPATIBILITY_SCHEMA,
            "kind": kind,
            "operation": operation.to_dict(),
            "proposal": proposal.to_dict(),
        }

    def _records(self, promotion_id: str) -> tuple[dict[str, Any], ...]:
        try:
            response = self._store.list_promotions(
                owner_chat_id=self._owner_chat_id,
                promotion_id=promotion_id,
                include_compatibility=True,
                limit=2,
            )
        except MemoryV2Error as exc:
            _repository_failure(exc)
        rows = tuple(response.get("promotions") or ())
        if len(rows) > 1:
            raise WorkspaceRepositoryError(
                "schema-v4 returned ambiguous promotion records"
            )
        return rows

    def _receipt_proposal(
        self,
        record: Mapping[str, Any],
        *,
        operation: OperationRef | None = None,
        operation_kind: str = "",
        revision: int | None = None,
    ) -> PromotionProposal | None:
        receipts = record.get("compatibility_receipts") or ()
        if not isinstance(receipts, (list, tuple)):
            raise WorkspaceRepositoryError(
                "schema-v4 returned invalid promotion compatibility receipts"
            )
        for receipt in receipts:
            if not isinstance(receipt, Mapping):
                raise WorkspaceRepositoryError(
                    "schema-v4 returned an invalid promotion compatibility receipt"
                )
            payload = receipt.get("compatibility_payload")
            if not isinstance(payload, Mapping):
                continue
            if payload.get("schema") != _COMPATIBILITY_SCHEMA:
                continue
            if operation_kind and payload.get("kind") != operation_kind:
                continue
            try:
                stored_operation = OperationRef.from_dict(payload.get("operation"))
                proposal = PromotionProposal.from_dict(payload.get("proposal"))
            except (TypeError, ValueError) as exc:
                raise WorkspaceRepositoryError(
                    "schema-v4 promotion compatibility receipt is invalid"
                ) from exc
            if operation is not None and stored_operation != operation:
                if stored_operation.operation_id == operation.operation_id:
                    raise RepositoryConflictError("operation payload changed")
                continue
            if revision is not None and proposal.revision != revision:
                continue
            if (
                proposal.proposal_id != record.get("promotion_id")
                or proposal.target_namespace != self.target_namespace
                or receipt.get("target_space_id") != self.target_space_id
                or receipt.get("operation_payload_hash")
                != stored_operation.payload_sha256
            ):
                raise RepositoryScopeError(
                    "promotion compatibility receipt escaped its bound scope"
                )
            return proposal
        return None

    def _legacy_proposal(
        self,
        record: Mapping[str, Any],
        *,
        revision: int,
    ) -> PromotionProposal | None:
        if int(record.get("revision") or 0) != revision:
            return None
        status_by_host = {
            "pending": PromotionStatus.PENDING,
            "applied": PromotionStatus.APPLIED,
            "rejected": PromotionStatus.REJECTED,
            "stale": PromotionStatus.SUPERSEDED,
        }
        status = status_by_host.get(str(record.get("status") or ""))
        if status is None:
            raise WorkspaceRepositoryError(
                "legacy schema-v4 promotion has an unsupported status"
            )
        source_row = record.get("source")
        if not isinstance(source_row, Mapping):
            raise WorkspaceRepositoryError(
                "legacy schema-v4 promotion source is invalid"
            )
        source_ref = ResourceRef(
            "memory",
            str(source_row.get("entry_id") or ""),
            int(source_row.get("revision") or 0),
            str(source_row.get("space_id") or ""),
        )
        target_entry_id = str(record.get("target_entry_id") or "")
        expected_target_revision = record.get("expected_target_revision")
        target_ref = (
            ResourceRef(
                "memory",
                target_entry_id,
                int(expected_target_revision),
                self.target_space_id,
            )
            if target_entry_id and expected_target_revision is not None
            else None
        )
        applied_entry_id = str(record.get("applied_entry_id") or "")
        applied_entry_revision = record.get("applied_entry_revision")
        applied_ref = (
            ResourceRef(
                "memory",
                applied_entry_id,
                int(applied_entry_revision),
                self.target_space_id,
            )
            if applied_entry_id and applied_entry_revision is not None
            else None
        )
        target_path = str(record.get("target_path") or "")
        diff: dict[str, Any] = {
            "op": "replace" if target_ref is not None else "derive",
            "source_entry_ref": source_ref.to_dict(),
            "target_path": target_path,
        }
        if target_ref is not None:
            diff["target_entry_ref"] = target_ref.to_dict()
        return PromotionProposal(
            proposal_id=str(record.get("promotion_id") or ""),
            source_entry_ref=source_ref,
            target_namespace=self.target_namespace,
            target_path=target_path,
            target_entry_ref=target_ref,
            diff=diff,
            reason="Legacy schema-v4 promotion",
            status=status,
            revision=revision,
            source_refs=(
                source_ref,
                ResourceRef(
                    "legacy_v1",
                    str(record.get("promotion_id") or ""),
                    revision,
                    "schema_v4",
                ),
            ),
            applied_entry_ref=applied_ref,
        )

    def create(
        self,
        *,
        proposal: PromotionProposal,
        operation: OperationRef,
    ) -> PromotionProposal:
        if not isinstance(proposal, PromotionProposal):
            raise TypeError("proposal must be a PromotionProposal")
        if not isinstance(operation, OperationRef):
            operation = OperationRef.from_dict(operation)
        if (
            proposal.proposal_id
            != _proposal_id(self.source_space.space_id, self.target_namespace, operation)
            or proposal.source_entry_ref.fragment != self.source_space.space_id
            or proposal.target_namespace != self.target_namespace
            or proposal.revision != 1
        ):
            raise RepositoryScopeError("proposal does not match its bound repository")
        baseline = proposal.target_entry_ref
        try:
            response = self._store.propose_promotion(
                owner_chat_id=self._owner_chat_id,
                source_space_id=self.source_space.space_id,
                source_entry_id=proposal.source_entry_ref.resource_id,
                source_entry_revision=proposal.source_entry_ref.revision,
                target_namespace=self.target_namespace,
                target_path=proposal.target_path,
                target_entry_id=baseline.resource_id if baseline is not None else "",
                expected_target_revision=(
                    baseline.revision if baseline is not None else None
                ),
                promotion_id=proposal.proposal_id,
                target_space_id=self.target_space_id,
                operation_id=f"promotion-propose:{proposal.proposal_id}",
                operation_payload_hash=operation.payload_sha256,
                compatibility_payload=self._compatibility_payload(
                    proposal=proposal,
                    operation=operation,
                    kind="proposal",
                ),
                strict_target_binding=True,
            )
        except MemoryV2Error as exc:
            _repository_failure(exc)
        payload = response.get("compatibility_payload")
        if not isinstance(payload, Mapping):
            raise WorkspaceRepositoryError(
                "schema-v4 omitted the promotion compatibility receipt"
            )
        persisted = PromotionProposal.from_dict(payload.get("proposal"))
        if persisted != proposal:
            raise WorkspaceRepositoryError(
                "schema-v4 returned a divergent promotion proposal"
            )
        return persisted

    def replay(self, *, operation: OperationRef) -> PromotionProposal | None:
        if not isinstance(operation, OperationRef):
            operation = OperationRef.from_dict(operation)
        proposal_id = _proposal_id(
            self.source_space.space_id,
            self.target_namespace,
            operation,
        )
        records = self._records(proposal_id)
        if not records:
            return None
        return self._receipt_proposal(
            records[0],
            operation=operation,
            operation_kind="proposal",
        )

    def read(self, *, ref: ResourceRef) -> PromotionProposal:
        if not isinstance(ref, ResourceRef):
            raise TypeError("ref must be a ResourceRef")
        if ref.kind != "promotion" or ref.fragment != self.target_namespace:
            raise RepositoryScopeError("proposal reference belongs to another scope")
        records = self._records(ref.resource_id)
        if not records:
            raise RepositoryNotFoundError("promotion proposal was not found")
        proposal = self._receipt_proposal(records[0], revision=ref.revision)
        if proposal is None:
            proposal = self._legacy_proposal(records[0], revision=ref.revision)
        if proposal is None:
            raise RepositoryNotFoundError("promotion proposal revision was not found")
        return proposal

    def validate_target_baseline(
        self,
        *,
        target_path: str,
        target_entry_ref: ResourceRef | None,
    ) -> MemoryEntry | None:
        if target_entry_ref is not None:
            if (
                not isinstance(target_entry_ref, ResourceRef)
                or target_entry_ref.kind != "memory"
                or target_entry_ref.fragment != self.target_space_id
            ):
                raise RepositoryScopeError(
                    "target baseline belongs to another long-term space"
                )
            target = self._target_repository.read_current_entry(
                entry_id=target_entry_ref.resource_id
            )
            if (
                target.revision != target_entry_ref.revision
                or target.path != target_path
                or target.deleted
            ):
                raise RepositoryConflictError("target baseline changed")
            return target
        page = self._target_repository.list_entries(limit=500)
        for target in page.entries:
            if target.path.casefold() == target_path.casefold() and not target.deleted:
                return target
        return None

    def read_target(self, *, ref: ResourceRef) -> MemoryEntry:
        if (
            not isinstance(ref, ResourceRef)
            or ref.kind != "memory"
            or ref.fragment != self.target_space_id
        ):
            raise RepositoryScopeError("target reference belongs to another scope")
        return self._target_repository.read_entry(ref=ref)


class PupuPromotionDecisionRepository(
    PupuPromotionRepository,
    BoundPromotionDecisionRepository,
):
    """Host-only schema-v4 proposal decision repository."""

    def replay_decision(
        self,
        *,
        operation: OperationRef,
    ) -> PromotionProposal | None:
        if not isinstance(operation, OperationRef):
            operation = OperationRef.from_dict(operation)
        try:
            response = self._store.list_promotions(
                owner_chat_id=self._owner_chat_id,
                include_compatibility=True,
                compatibility_operation_id=operation.operation_id,
                compatibility_operation_payload_hash=operation.payload_sha256,
                compatibility_kind="decision",
                limit=2,
            )
        except MemoryV2Error as exc:
            _repository_failure(exc)
        rows = tuple(response.get("promotions") or ())
        if not rows:
            return None
        if len(rows) != 1:
            raise WorkspaceRepositoryError(
                "schema-v4 returned an ambiguous promotion decision replay"
            )
        return self._receipt_proposal(
            rows[0],
            operation=operation,
            operation_kind="decision",
        )

    def decide(
        self,
        *,
        ref: ResourceRef,
        expected_revision: int,
        approved: bool,
        confirmation_id: str,
        operation: OperationRef,
    ) -> PromotionProposal:
        if not isinstance(operation, OperationRef):
            operation = OperationRef.from_dict(operation)
        if not isinstance(approved, bool):
            raise TypeError("approved must be a boolean")
        proposal = self.read(ref=ref)
        if proposal.revision != expected_revision:
            raise RepositoryConflictError("promotion revision changed")
        try:
            response = self._store.decide_promotion(
                owner_chat_id=self._owner_chat_id,
                promotion_id=proposal.proposal_id,
                decision="apply" if approved else "reject",
                expected_revision=expected_revision,
                operation_id=f"promotion-decide:{operation.operation_id}",
                target_space_id=self.target_space_id,
                confirmation_id=confirmation_id,
                operation_payload_hash=operation.payload_sha256,
                compatibility_payload=self._compatibility_payload(
                    proposal=proposal,
                    operation=operation,
                    kind="decision",
                ),
                strict_target_binding=True,
            )
        except MemoryV2Error as exc:
            _repository_failure(exc)
        payload = response.get("compatibility_payload")
        if not isinstance(payload, Mapping):
            raise WorkspaceRepositoryError(
                "schema-v4 omitted the promotion decision compatibility receipt"
            )
        try:
            decided = PromotionProposal.from_dict(payload.get("proposal"))
        except (TypeError, ValueError) as exc:
            raise WorkspaceRepositoryError(
                "schema-v4 returned an invalid promotion decision"
            ) from exc
        return decided


class PupuPromotionConfirmationAuthorizer(BoundPromotionConfirmationAuthorizer):
    """Ephemeral, one-use confirmation grants owned by the PuPu host."""

    def __init__(self, target_namespace: str, *, owner_chat_id: str) -> None:
        super().__init__(target_namespace)
        if (
            not isinstance(owner_chat_id, str)
            or _OWNER_RE.fullmatch(owner_chat_id) is None
        ):
            raise ValueError("owner_chat_id is invalid")
        self._owner_chat_id = owner_chat_id
        self._grants: dict[str, tuple[ResourceRef, bool, bool]] = {}
        self._consume_count = 0

    @property
    def consume_count(self) -> int:
        return self._consume_count

    def issue(
        self,
        *,
        proposal_ref: ResourceRef,
        approved: bool,
        decision_reason: str,
        operation_id: str,
    ) -> UserConfirmationReceipt:
        if (
            not isinstance(proposal_ref, ResourceRef)
            or proposal_ref.kind != "promotion"
            or proposal_ref.fragment != self.target_namespace
        ):
            raise RepositoryScopeError(
                "confirmation proposal belongs to another namespace"
            )
        if not isinstance(approved, bool):
            raise TypeError("approved must be a boolean")
        if not isinstance(decision_reason, str) or len(decision_reason) > 4096:
            raise ValueError("decision_reason is invalid")
        if (
            not isinstance(operation_id, str)
            or _IDENTIFIER_RE.fullmatch(operation_id) is None
        ):
            raise ValueError("operation_id is invalid")
        digest = hashlib.sha256(
            (
                f"{self._owner_chat_id}\0{self.target_namespace}\0"
                f"{proposal_ref.resource_id}\0{proposal_ref.revision}\0"
                f"{int(approved)}\0{decision_reason}\0{operation_id}"
            ).encode("utf-8")
        ).hexdigest()
        confirmation_id = f"confirmation-{digest[:32]}"
        expected = (proposal_ref, approved, False)
        prior = self._grants.get(confirmation_id)
        if prior is not None and prior != expected:
            raise PermissionError("confirmation identifier binding changed")
        if prior is None:
            self._grants[confirmation_id] = expected
        return UserConfirmationReceipt(confirmation_id, approved)

    def consume(
        self,
        *,
        confirmation_id: str,
        proposal_ref: ResourceRef,
        approved: bool,
    ) -> PromotionConfirmationGrant:
        record = self._grants.get(confirmation_id)
        if record is None:
            raise PermissionError("confirmation receipt is unknown")
        expected_ref, expected_approved, consumed = record
        if consumed:
            raise PermissionError("confirmation receipt was already consumed")
        if expected_ref != proposal_ref or expected_approved is not approved:
            raise PermissionError("confirmation receipt binding does not match")
        self._grants[confirmation_id] = (
            expected_ref,
            expected_approved,
            True,
        )
        self._consume_count += 1
        return PromotionConfirmationGrant(
            confirmation_id=confirmation_id,
            proposal_ref=proposal_ref,
            target_namespace=self.target_namespace,
            approved=approved,
        )


__all__ = [
    "PupuPromotionConfirmationAuthorizer",
    "PupuPromotionDecisionRepository",
    "PupuPromotionRepository",
]
