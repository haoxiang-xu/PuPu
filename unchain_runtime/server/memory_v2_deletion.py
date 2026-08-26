"""Crash-recoverable processor for Memory V2 deletion outbox items.

The processor intentionally stays above ``MemoryV2Store``.  It never opens the
database or the content-addressed object directory itself: claiming, logical
chat deletion and completion all pass through idempotent store operations.

P0 does not have a store API that can atomically prove a CAS object is
unreferenced.  Completed results therefore keep ``gc_status`` at
``pending_unreferenced_scan`` and this module never unlinks object files.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from typing import Any, Mapping

from memory_v2_store import MemoryV2Error, MemoryV2Store


_SUPPORTED_ENTITY_TYPES = frozenset({"chat", "entry"})


@dataclass(frozen=True)
class DeletionProcessingResult:
    """Stable, non-sensitive outcome for one worker polling cycle."""

    status: str
    deletion_id: str = ""
    owner_chat_id: str = ""
    entity_type: str = ""
    entity_id: str = ""
    revision: int = 0
    replayed: bool = False
    logical_cleanup: str = ""
    gc_status: str = "not_applicable"
    retry_after_ms: int | None = None
    error_code: str = ""
    error_message: str = ""

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class MemoryV2DeletionProcessor:
    """Claim and finish one exact deletion request under a bounded lease."""

    def __init__(
        self,
        store: MemoryV2Store,
        *,
        worker_id: str,
        lease_ms: int = 30_000,
    ) -> None:
        if not isinstance(worker_id, str) or not worker_id.strip():
            raise ValueError("worker_id is required")
        if isinstance(lease_ms, bool) or not isinstance(lease_ms, int) or lease_ms <= 0:
            raise ValueError("lease_ms must be a positive integer")
        self._store = store
        self._worker_id = worker_id.strip()
        self._lease_ms = lease_ms

    def claim_once(self, *, cycle_id: str) -> dict[str, Any]:
        """Claim one item; replaying ``cycle_id`` replays the same claim."""

        normalized_cycle_id = _required_cycle_id(cycle_id)
        return self._store.claim_deletion(
            worker_id=self._worker_id,
            operation_id=_derive_deletion_operation_id(
                "claim",
                self._worker_id,
                normalized_cycle_id,
            ),
            lease_ms=self._lease_ms,
        )

    def process_once(self, *, cycle_id: str) -> DeletionProcessingResult:
        """Process at most one item without performing unsafe physical GC.

        A caller must use a fresh cycle id after a lease expires.  Reusing the
        same id before expiry safely resumes the claimed item; reusing it after
        completion safely replays the completed operation.
        """

        normalized_cycle_id = _required_cycle_id(cycle_id)
        claim = self.claim_once(cycle_id=normalized_cycle_id)
        deletion = claim.get("deletion")
        if deletion is None:
            return DeletionProcessingResult(
                status="idle",
                replayed=bool(claim.get("replayed")),
            )

        try:
            exact = _validate_claimed_deletion(deletion)
            logical_cleanup = self._ensure_logical_cleanup(exact)
            completion = self._store.complete_deletion(
                deletion_id=exact["deletion_id"],
                worker_id=self._worker_id,
                lease_token=exact["lease_token"],
                expected_revision=exact["revision"],
                operation_id=_derive_deletion_operation_id(
                    "complete",
                    exact["deletion_id"],
                    exact["revision"],
                    exact["lease_token"],
                ),
            )
            return DeletionProcessingResult(
                status="completed",
                deletion_id=exact["deletion_id"],
                owner_chat_id=exact["owner_chat_id"],
                entity_type=exact["entity_type"],
                entity_id=exact["entity_id"],
                revision=int(completion.get("revision") or exact["revision"] + 1),
                replayed=bool(claim.get("replayed") or completion.get("replayed")),
                logical_cleanup=logical_cleanup,
                gc_status="pending_unreferenced_scan",
            )
        except Exception as exc:
            return _retryable_failure(deletion, claim=claim, error=exc)

    def _ensure_logical_cleanup(self, deletion: Mapping[str, Any]) -> str:
        if deletion["entity_type"] == "entry":
            # Entry requests are created in the same transaction that performs
            # the entry's revisioned soft delete.  There is no safe public API
            # for physical entry cleanup in P0.
            return "soft_delete_precondition"

        result = self._store.delete_chat(
            owner_chat_id=deletion["owner_chat_id"],
            operation_id=_derive_deletion_operation_id(
                "logical-cascade",
                deletion["deletion_id"],
                deletion["owner_chat_id"],
                deletion["entity_id"],
            ),
        )
        if (
            result.get("owner_chat_id") != deletion["owner_chat_id"]
            or result.get("deletion_id") != deletion["deletion_id"]
            or not result.get("deleted")
        ):
            raise MemoryV2Error(
                "context_v2_deletion_scope_mismatch",
                "logical deletion did not confirm the claimed chat scope",
                status_code=409,
                retryable=True,
            )
        return "soft_delete_confirmed"


def _required_cycle_id(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("cycle_id must be a string")
    normalized = value.strip()
    if not normalized or len(normalized) > 1024 or any(ord(char) < 32 for char in normalized):
        raise ValueError("cycle_id is invalid")
    return normalized


def _derive_deletion_operation_id(stage: str, *parts: Any) -> str:
    payload = json.dumps(
        [stage, *parts],
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest()
    return f"memory_v2_deletion:{stage}:{digest}"


def _validate_claimed_deletion(value: Any) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise MemoryV2Error(
            "context_v2_invalid_deletion_claim",
            "deletion claim is invalid",
            status_code=500,
            retryable=True,
        )
    exact: dict[str, Any] = {}
    for field in (
        "deletion_id",
        "owner_chat_id",
        "entity_type",
        "entity_id",
        "lease_token",
    ):
        item = value.get(field)
        if not isinstance(item, str) or not item or "/" in item or "\\" in item:
            raise MemoryV2Error(
                "context_v2_invalid_deletion_claim",
                "deletion claim contains an invalid identifier",
                status_code=500,
                retryable=True,
            )
        exact[field] = item
    revision = value.get("revision")
    expires_at = value.get("lease_expires_at_ms")
    if (
        isinstance(revision, bool)
        or not isinstance(revision, int)
        or revision <= 0
        or isinstance(expires_at, bool)
        or not isinstance(expires_at, int)
        or expires_at <= 0
    ):
        raise MemoryV2Error(
            "context_v2_invalid_deletion_claim",
            "deletion claim contains invalid lease metadata",
            status_code=500,
            retryable=True,
        )
    exact["revision"] = revision
    exact["lease_expires_at_ms"] = expires_at
    if exact["entity_type"] not in _SUPPORTED_ENTITY_TYPES:
        raise MemoryV2Error(
            "context_v2_unsupported_deletion",
            "deletion claim has an unsupported entity type",
            status_code=409,
            retryable=True,
        )
    if exact["entity_type"] == "chat" and exact["entity_id"] != exact["owner_chat_id"]:
        raise MemoryV2Error(
            "context_v2_deletion_scope_mismatch",
            "claimed chat does not match its bound owner",
            status_code=409,
            retryable=True,
        )
    return exact


def _retryable_failure(
    deletion: Any,
    *,
    claim: Mapping[str, Any],
    error: Exception,
) -> DeletionProcessingResult:
    safe = deletion if isinstance(deletion, Mapping) else {}
    if isinstance(error, MemoryV2Error):
        error_code = error.code
        error_message = str(error)
    else:
        error_code = "context_v2_deletion_worker_failed"
        error_message = "deletion cleanup failed and can be retried"
    revision = safe.get("revision")
    expires_at = safe.get("lease_expires_at_ms")
    return DeletionProcessingResult(
        status="retryable_failure",
        deletion_id=str(safe.get("deletion_id") or ""),
        owner_chat_id=str(safe.get("owner_chat_id") or ""),
        entity_type=str(safe.get("entity_type") or ""),
        entity_id=str(safe.get("entity_id") or ""),
        revision=revision if isinstance(revision, int) and not isinstance(revision, bool) else 0,
        replayed=bool(claim.get("replayed")),
        gc_status="pending_unreferenced_scan",
        retry_after_ms=(
            expires_at
            if isinstance(expires_at, int) and not isinstance(expires_at, bool)
            else None
        ),
        error_code=error_code,
        error_message=error_message,
    )


__all__ = [
    "DeletionProcessingResult",
    "MemoryV2DeletionProcessor",
]
