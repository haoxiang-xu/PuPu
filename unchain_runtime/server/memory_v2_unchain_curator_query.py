"""Thin PuPu presentation over Unchain-owned Curator read capabilities.

The durable candidate, consolidation-job, and review state remains owned and
validated by Unchain.  This module only binds an immutable PuPu chat lifecycle
to that official read service and translates its records to the existing HTTP
response vocabulary.  It deliberately exposes no mutation capability.
"""

from __future__ import annotations

import json
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
from unchain.journal import ResourceRef
from unchain.memory.curator import CandidateStatus, ConsolidationJobStatus
from unchain.persistence.sqlite_chat_deletion_v2 import (
    ChatDeletionError,
    is_chat_deleted,
)
from unchain.persistence.sqlite_curator_query_v2 import (
    MemoryReviewStatus,
    PendingMemoryReviewProposal,
    SQLiteCuratorQueryV2Error,
    SQLiteCuratorQueryV2Store,
)


_MAX_LIFECYCLES = 10_000
_MAX_DIFF_PREVIEW_BYTES = 4_096


class PupuUnchainCuratorQueryError(RuntimeError):
    """A PuPu route could not open or use the official Curator read scope."""

    def __init__(self, code: str, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _candidate_uri(ref: ResourceRef) -> str:
    return f"pupu://memory/candidate/{ref.resource_id}@{ref.revision}"


def _resource_value(ref: ResourceRef | None) -> dict[str, Any] | None:
    return ref.to_dict() if ref is not None else None


def _status_filter(value: str, enum_type, field_name: str):
    normalized = str(value or "").strip().casefold()
    if not normalized:
        return None
    try:
        return enum_type(normalized)
    except ValueError as error:
        raise PupuUnchainCuratorQueryError(
            "context_v2_invalid_request",
            f"{field_name} status is invalid",
            status_code=400,
        ) from error


@dataclass(frozen=True, slots=True)
class PupuUnchainCuratorQueryApi:
    """Read-only route presentation for one exact chat Curator binding."""

    owner_chat_id: str
    _query: Any = field(repr=False)

    def _require_owner(self, owner_chat_id: str) -> None:
        if owner_chat_id != self.owner_chat_id:
            raise PupuUnchainCuratorQueryError(
                "context_v2_scope_mismatch",
                "Curator state is outside the bound chat",
                status_code=403,
            )

    def _candidate(self, candidate) -> dict[str, Any]:
        result_ref = candidate.result_ref
        source_event_ids = [
            ref.resource_id for ref in candidate.source_refs if ref.kind == "context_event"
        ]
        response = {
            "candidate_id": candidate.candidate_ref.resource_id,
            "candidate_ref": _candidate_uri(candidate.candidate_ref),
            "owner_chat_id": self.owner_chat_id,
            "session_id": "",
            "attempt_id": "",
            "source_agent_run_id": candidate.source_agent_run_id,
            "source_tool_call_id": candidate.source_tool_call_id,
            "source_event_ids": source_event_ids,
            "target_space_id": candidate.target_space_id,
            "target_path": candidate.target_path,
            "name": candidate.name,
            "kind": candidate.kind,
            "description": candidate.description,
            "mime_type": candidate.media_type,
            "rationale": candidate.rationale,
            "confidence": candidate.confidence,
            "sensitivity": candidate.sensitivity,
            "status": candidate.outcome.value,
            "revision": candidate.candidate_ref.revision,
            "binding_revision": candidate.binding_revision,
            "payload_sha256": candidate.payload_sha256,
            "content_sha256": candidate.content_sha256,
            "content_bytes": candidate.byte_length,
            "result_ref": _resource_value(result_ref),
            "applied_entry_id": (
                result_ref.resource_id
                if result_ref is not None and result_ref.kind == "memory"
                else None
            ),
            "applied_entry_revision": (
                result_ref.revision
                if result_ref is not None and result_ref.kind == "memory"
                else None
            ),
            "error_code": candidate.error_code,
            "replayed": False,
        }
        if candidate.link_url:
            response["link_url"] = candidate.link_url
        return response

    def list_candidates(
        self,
        *,
        owner_chat_id: str,
        status: str = "",
        limit: int = 100,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        items = self._query.list_candidates(
            status=_status_filter(status, CandidateStatus, "candidate"),
            limit=limit,
        )
        return {
            "owner_chat_id": self.owner_chat_id,
            "candidates": [self._candidate(item) for item in items],
        }

    def _job(self, job) -> dict[str, Any]:
        lease = job.lease
        terminal = job.status in {
            ConsolidationJobStatus.COMPLETED,
            ConsolidationJobStatus.FAILED,
            ConsolidationJobStatus.CANCELLED,
        }
        return {
            "job_id": job.job_id,
            "owner_chat_id": self.owner_chat_id,
            "session_id": job.trigger.session_id,
            "attempt_id": job.trigger.attempt_id,
            "run_id": job.trigger.run_id,
            "job_type": "memory_consolidation",
            "payload": {
                "trigger_key": job.trigger.trigger_key,
                "candidate_count": len(job.candidates),
            },
            "status": job.status.value,
            "revision": job.revision,
            "lease_owner": lease.owner if lease is not None else None,
            "lease_expires_at_ms": (
                lease.expires_at_ms if lease is not None else None
            ),
            "attempt_count": job.attempt_count,
            "next_attempt_at_ms": job.next_attempt_at_ms,
            "last_error_code": job.last_error_code,
            "created_at_ms": job.created_at_ms,
            "updated_at_ms": job.updated_at_ms,
            "completed_at_ms": job.updated_at_ms if terminal else None,
            "candidate_refs": [
                _candidate_uri(candidate.candidate_ref)
                for candidate in job.candidates
            ],
            "replayed": False,
        }

    def list_consolidation_jobs(
        self,
        *,
        owner_chat_id: str,
        status: str = "",
        limit: int = 100,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        items = self._query.list_jobs(
            status=_status_filter(status, ConsolidationJobStatus, "job"),
            limit=limit,
        )
        return {
            "owner_chat_id": self.owner_chat_id,
            "jobs": [self._job(item) for item in items],
        }

    def _review(self, review: PendingMemoryReviewProposal) -> dict[str, Any]:
        semantic = dict(review.semantic)
        candidate = dict(semantic["candidate"])
        target = dict(semantic["target"])
        review_diff = review.to_dict()["review_diff"]
        review_content_base = (
            f"pupu://memory/review/{review.review_ref.resource_id}"
            f"@{review.review_ref.revision}"
        )
        proposed = dict(review_diff["candidate"])
        proposed.update(
            {
                "mode": review.mode,
                "source_event_ids": [
                    item["id"]
                    for item in candidate["source_refs"]
                    if item.get("kind") == "context_event"
                ],
            }
        )
        if candidate.get("content_sha256"):
            proposed["content"] = {
                "ref": f"{review_content_base}/proposed",
                "media_type": candidate.get("media_type")
                or "application/octet-stream",
                "bytes": candidate.get("byte_length", 0),
                "sha256": candidate["content_sha256"],
            }
        preview = json.dumps(
            review_diff,
            ensure_ascii=False,
            sort_keys=True,
            indent=2,
        ).encode("utf-8")[:_MAX_DIFF_PREVIEW_BYTES].decode(
            "utf-8", errors="replace"
        )
        return {
            "review_id": review.review_ref.resource_id,
            "review_ref": (
                f"pupu://memory/review/{review.review_ref.resource_id}"
                f"@{review.review_ref.revision}"
            ),
            "owner_chat_id": self.owner_chat_id,
            "job_id": review.job_id,
            "candidate_id": review.candidate_ref.resource_id,
            "candidate_ref": _candidate_uri(review.candidate_ref),
            "candidate_revision": review.binding_revision,
            "candidate_content_revision": review.candidate_ref.revision,
            "candidate_binding_revision": review.binding_revision,
            "target": {
                "space_id": review.target_entry_ref.fragment,
                "path": target["path"],
                "entry_id": review.target_entry_ref.resource_id,
                "expected_revision": review.target_entry_ref.revision,
            },
            "proposed": proposed,
            "status": review.status.value,
            "revision": review.review_ref.revision,
            "decision_reason": "",
            "diff_ref": f"{review_content_base}/diff",
            "diff_preview": preview,
            "created_at_ms": review.created_at_ms,
            "updated_at_ms": review.created_at_ms,
            "decided_at_ms": None,
            "replayed": False,
        }

    def list_candidate_reviews(
        self,
        *,
        owner_chat_id: str,
        status: str = "",
        limit: int = 100,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        items = self._query.list_pending_reviews(
            status=_status_filter(status, MemoryReviewStatus, "review"),
            limit=limit,
        )
        return {
            "owner_chat_id": self.owner_chat_id,
            "reviews": [self._review(item) for item in items],
        }

    def get_candidate_review(
        self,
        *,
        owner_chat_id: str,
        review_id: str,
    ) -> dict[str, Any]:
        self._require_owner(owner_chat_id)
        return self._review(
            self._query.get_pending_review(review_id=review_id)
        )


def open_pupu_unchain_curator_query_api(
    *,
    root_dir: str | Path,
    owner_chat_id: str,
) -> PupuUnchainCuratorQueryApi:
    """Cold-open one exact official candidate/job/review read scope."""

    try:
        admission = admit_context_v2_store_owner(
            root_dir=root_dir,
            requested_owner=STORE_OWNER_UNCHAIN,
        )
        if (
            admission.owner != STORE_OWNER_UNCHAIN
            or admission.database_state != STORE_OWNER_UNCHAIN
        ):
            raise PupuUnchainCuratorQueryError(
                "context_v2_curator_store_unavailable",
                "Unchain Curator storage is unavailable",
                status_code=503,
            )
        if is_chat_deleted(
            database_path=admission.database_path,
            owner_chat_id=owner_chat_id,
        ):
            raise PupuUnchainCuratorQueryError(
                "context_v2_curator_chat_deleted",
                "A durably deleted chat cannot expose Curator state",
                status_code=410,
            )
        lifecycles = list_pupu_unchain_ownership_lifecycles(
            database_path=admission.database_path,
            owner_chat_id=owner_chat_id,
            limit=_MAX_LIFECYCLES,
        )
        if not lifecycles:
            raise PupuUnchainCuratorQueryError(
                "context_v2_curator_lifecycle_unavailable",
                "The durable Unchain chat lifecycle is unavailable",
                status_code=409,
            )
        if len(lifecycles) >= _MAX_LIFECYCLES:
            raise PupuUnchainCuratorQueryError(
                "context_v2_curator_lifecycle_limit_exceeded",
                "The durable Unchain chat lifecycle exceeds the P0 limit",
                status_code=409,
            )
        binding_ids = {item.binding_id for item in lifecycles}
        space_ids = {item.chat_space_id for item in lifecycles}
        if len(binding_ids) != 1 or len(space_ids) != 1:
            raise PupuUnchainCuratorQueryError(
                "context_v2_curator_lifecycle_ambiguous",
                "The durable Unchain Curator scope is ambiguous",
                status_code=409,
            )
        query = SQLiteCuratorQueryV2Store(
            database_path=admission.database_path,
            object_directory=admission.root_dir / "objects",
        ).bind(
            binding_id=next(iter(binding_ids)),
            owner_chat_id=owner_chat_id,
            target_space_id=next(iter(space_ids)),
        )
        return PupuUnchainCuratorQueryApi(
            owner_chat_id=owner_chat_id,
            _query=query,
        )
    except PupuUnchainCuratorQueryError:
        raise
    except (
        ChatDeletionError,
        ContextV2StoreBoundaryError,
        PupuUnchainMemoryV2OwnershipError,
        SQLiteCuratorQueryV2Error,
        TypeError,
        ValueError,
    ) as error:
        raise PupuUnchainCuratorQueryError(
            "context_v2_curator_open_failed",
            "The durable Unchain Curator read capability is unavailable",
            status_code=503,
        ) from error


__all__ = [
    "PupuUnchainCuratorQueryApi",
    "PupuUnchainCuratorQueryError",
    "open_pupu_unchain_curator_query_api",
]
