"""Thin PuPu host adapter for Unchain-owned atomic review decisions.

The adapter owns no decision, candidate, job, or workspace tables. It binds one
durable chat lifecycle to Unchain's single-transaction decision capability and
only translates the resulting immutable receipt to the existing route shape.
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
    PupuUnchainMemoryV2OwnershipError,
    list_pupu_unchain_ownership_lifecycles,
)
from unchain.journal import ResourceRef
from unchain.persistence.sqlite_chat_deletion_v2 import (
    ChatDeletionError,
    is_chat_deleted,
)


_MAX_LIFECYCLES = 10_000


class PupuUnchainReviewDecisionError(RuntimeError):
    """The host could not bind or present an atomic review decision."""

    def __init__(self, code: str, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _resource(value: Any, field_name: str) -> ResourceRef:
    try:
        return value if isinstance(value, ResourceRef) else ResourceRef.from_dict(value)
    except (TypeError, ValueError) as error:
        raise PupuUnchainReviewDecisionError(
            "context_v2_review_decision_integrity_unavailable",
            f"Atomic review decision {field_name} is invalid",
            status_code=503,
        ) from error


def _optional_resource(value: Any, field_name: str) -> ResourceRef | None:
    if value is None:
        return None
    return _resource(value, field_name)


def _memory_uri(ref: ResourceRef) -> str:
    return f"pupu://memory/{ref.fragment}/{ref.resource_id}@{ref.revision}"


@dataclass(frozen=True, slots=True)
class PupuUnchainReviewDecisionApi:
    """One exact owner-chat capability over the official atomic service."""

    owner_chat_id: str
    binding_id: str
    target_space_id: str
    _decisions: Any = field(repr=False)

    def _require_owner(self, owner_chat_id: str) -> None:
        if owner_chat_id != self.owner_chat_id:
            raise PupuUnchainReviewDecisionError(
                "context_v2_scope_mismatch",
                "Review decision is outside the bound chat",
                status_code=403,
            )

    def _present(self, receipt: Any) -> dict[str, Any]:
        try:
            payload = receipt.to_dict()
        except (AttributeError, TypeError, ValueError) as error:
            raise PupuUnchainReviewDecisionError(
                "context_v2_review_decision_integrity_unavailable",
                "Atomic review decision receipt is invalid",
                status_code=503,
            ) from error
        if (
            payload.get("binding_id") != self.binding_id
            or payload.get("owner_chat_id") != self.owner_chat_id
            or payload.get("target_space_id") != self.target_space_id
        ):
            raise PupuUnchainReviewDecisionError(
                "context_v2_review_decision_integrity_unavailable",
                "Atomic review decision receipt escaped its bound scope",
                status_code=503,
            )
        review_ref = _resource(payload.get("review_ref"), "review_ref")
        proposal_ref = _resource(payload.get("proposal_ref"), "proposal_ref")
        candidate_ref = _resource(payload.get("candidate_ref"), "candidate_ref")
        target_ref = _resource(payload.get("target_entry_ref"), "target_entry_ref")
        applied_ref = _optional_resource(
            payload.get("applied_entry_ref"),
            "applied_entry_ref",
        )
        if (
            review_ref.kind != "memory_review"
            or proposal_ref.kind != "memory_review"
            or review_ref.resource_id != proposal_ref.resource_id
            or proposal_ref.revision != 1
            or candidate_ref.kind != "memory_candidate"
            or target_ref.kind != "memory"
            or target_ref.fragment != self.target_space_id
            or (
                applied_ref is not None
                and (
                    applied_ref.kind != "memory"
                    or applied_ref.fragment != self.target_space_id
                )
            )
        ):
            raise PupuUnchainReviewDecisionError(
                "context_v2_review_decision_integrity_unavailable",
                "Atomic review decision receipt references are invalid",
                status_code=503,
            )
        review_content_base = (
            f"pupu://memory/review/{proposal_ref.resource_id}"
            f"@{proposal_ref.revision}"
        )
        return {
            "review_id": review_ref.resource_id,
            "review_ref": (
                f"pupu://memory/review/{review_ref.resource_id}"
                f"@{review_ref.revision}"
            ),
            "owner_chat_id": self.owner_chat_id,
            "job_id": str(payload.get("job_id") or ""),
            "candidate_id": candidate_ref.resource_id,
            "candidate_ref": (
                f"pupu://memory/candidate/{candidate_ref.resource_id}"
                f"@{candidate_ref.revision}"
            ),
            "candidate_revision": payload.get(
                "candidate_binding_revision_after"
            ),
            "candidate_content_revision": candidate_ref.revision,
            "candidate_binding_revision": payload.get(
                "candidate_binding_revision_after"
            ),
            "target": {
                "space_id": self.target_space_id,
                "path": "",
                "entry_id": target_ref.resource_id,
                "expected_revision": target_ref.revision,
            },
            "proposed": {},
            "status": str(payload.get("status") or ""),
            "revision": review_ref.revision,
            "decision": str(payload.get("decision") or ""),
            "decision_reason": str(payload.get("decision_reason") or ""),
            "diff_ref": f"{review_content_base}/diff",
            "diff_preview": "",
            "created_at_ms": payload.get("decided_at_ms"),
            "updated_at_ms": payload.get("decided_at_ms"),
            "decided_at_ms": payload.get("decided_at_ms"),
            "applied_entry_ref": (
                _memory_uri(applied_ref) if applied_ref is not None else None
            ),
            "space_revision_before": payload.get("space_revision_before"),
            "space_revision_after": payload.get("space_revision_after"),
            "operation_id": str(payload.get("operation_id") or ""),
            "payload_sha256": str(payload.get("payload_sha256") or ""),
            "replayed": payload.get("replayed") is True,
        }

    def decide_candidate_review(
        self,
        *,
        owner_chat_id: str,
        review_id: str,
        decision: str,
        expected_review_revision: int,
        expected_candidate_revision: int,
        expected_target_revision: int,
        expected_space_revision: int,
        decision_reason: str,
        operation_id: str,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        receipt = self._decisions.decide(
            review_id=review_id,
            decision=decision,
            expected_review_revision=expected_review_revision,
            expected_candidate_revision=expected_candidate_revision,
            expected_target_revision=expected_target_revision,
            expected_space_revision=expected_space_revision,
            decision_reason=decision_reason,
            operation_id=operation_id,
        )
        return self._present(receipt)


def open_pupu_unchain_review_decision_api(
    *,
    root_dir: str | Path,
    owner_chat_id: str,
) -> PupuUnchainReviewDecisionApi:
    """Cold-open one exact Unchain-owned review-decision scope."""

    try:
        admission = admit_context_v2_store_owner(
            root_dir=root_dir,
            requested_owner=STORE_OWNER_UNCHAIN,
        )
        if (
            admission.owner != STORE_OWNER_UNCHAIN
            or admission.database_state != STORE_OWNER_UNCHAIN
        ):
            raise PupuUnchainReviewDecisionError(
                "context_v2_review_decision_unavailable",
                "Unchain review-decision storage is unavailable",
                status_code=503,
            )
        if is_chat_deleted(
            database_path=admission.database_path,
            owner_chat_id=owner_chat_id,
        ):
            raise PupuUnchainReviewDecisionError(
                "context_v2_review_decision_chat_deleted",
                "A durably deleted chat cannot decide memory reviews",
                status_code=410,
            )
        lifecycles = list_pupu_unchain_ownership_lifecycles(
            database_path=admission.database_path,
            owner_chat_id=owner_chat_id,
            limit=_MAX_LIFECYCLES,
        )
        if not lifecycles:
            raise PupuUnchainReviewDecisionError(
                "context_v2_review_decision_lifecycle_unavailable",
                "The durable Unchain chat lifecycle is unavailable",
                status_code=409,
            )
        if len(lifecycles) >= _MAX_LIFECYCLES:
            raise PupuUnchainReviewDecisionError(
                "context_v2_review_decision_lifecycle_limit_exceeded",
                "The durable Unchain chat lifecycle exceeds the P0 limit",
                status_code=409,
            )
        binding_ids = {item.binding_id for item in lifecycles}
        space_ids = {item.chat_space_id for item in lifecycles}
        if len(binding_ids) != 1 or len(space_ids) != 1:
            raise PupuUnchainReviewDecisionError(
                "context_v2_review_decision_lifecycle_ambiguous",
                "The durable Unchain review-decision scope is ambiguous",
                status_code=409,
            )
        from unchain.persistence.sqlite_curator_review_decision_v2 import (
            SQLiteCuratorReviewDecisionV2Store,
        )

        binding_id = next(iter(binding_ids))
        target_space_id = next(iter(space_ids))
        decisions = SQLiteCuratorReviewDecisionV2Store(
            database_path=admission.database_path,
            object_directory=admission.root_dir / "objects",
        ).bind(
            binding_id=binding_id,
            owner_chat_id=owner_chat_id,
            target_space_id=target_space_id,
        )
        return PupuUnchainReviewDecisionApi(
            owner_chat_id=owner_chat_id,
            binding_id=binding_id,
            target_space_id=target_space_id,
            _decisions=decisions,
        )
    except PupuUnchainReviewDecisionError:
        raise
    except (
        ChatDeletionError,
        ContextV2StoreBoundaryError,
        PupuUnchainMemoryV2OwnershipError,
        ImportError,
        OSError,
        TypeError,
        ValueError,
    ) as error:
        raise PupuUnchainReviewDecisionError(
            "context_v2_review_decision_unavailable",
            f"Unchain review-decision scope is unavailable: {error}",
            status_code=503,
        ) from error


__all__ = [
    "PupuUnchainReviewDecisionApi",
    "PupuUnchainReviewDecisionError",
    "open_pupu_unchain_review_decision_api",
]
