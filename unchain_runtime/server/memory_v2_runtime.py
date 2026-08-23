"""Lazy process binding for the Context/Memory V2 data plane."""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

from memory_v2_sanitizer import StorageTrust
from memory_v2_store import MemoryV2Error, MemoryV2Store
from memory_v2_store_boundary import (
    STORE_OWNER_OFF,
    STORE_OWNER_PUPU_LEGACY,
    STORE_OWNER_UNCHAIN,
    ContextV2StoreBoundaryError,
    configured_context_v2_store_owner,
    open_context_v2_owned_store,
)


@dataclass(frozen=True)
class MemoryV2Runtime:
    data_dir: Path
    root_dir: Path
    store: MemoryV2Store

    def recover_startup(self) -> None:
        self.store.recover_startup()
        return None

    def bind_context_repositories(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        generation_id: str,
        attempt_id: str,
    ) -> Any:
        """Construct PuPu-authorized Unchain capabilities without eager imports."""

        from context_memory_v2_repository import (
            PupuContextMemoryV2Repository,
            PupuExecutionScope,
        )

        return PupuContextMemoryV2Repository(self.store).bind_execution(
            PupuExecutionScope(
                owner_chat_id=owner_chat_id,
                session_id=session_id,
                generation_id=generation_id,
                attempt_id=attempt_id,
            )
        )

    def get_chat_admission(self, *, owner_chat_id: str) -> dict[str, Any] | None:
        return self.store.get_chat_admission(owner_chat_id=owner_chat_id)

    def get_session_head(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
    ) -> dict[str, Any]:
        return self.store.get_session_head(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
        )

    def resolve_chat_admission(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        requested_rollout_mode: str,
        effective_rollout_mode: str,
        cohort: str,
        target_mode: str,
        decision_reason: str,
        canary_selected: bool,
        canary_percent: int,
        canary_bucket: int,
        hash_strategy: str,
        provenance: Mapping[str, Any],
        operation_id: str,
        allow_create: bool = True,
    ) -> dict[str, Any] | None:
        return self.store.resolve_chat_admission(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            requested_rollout_mode=requested_rollout_mode,
            effective_rollout_mode=effective_rollout_mode,
            cohort=cohort,
            target_mode=target_mode,
            decision_reason=decision_reason,
            canary_selected=canary_selected,
            canary_percent=canary_percent,
            canary_bucket=canary_bucket,
            hash_strategy=hash_strategy,
            provenance=provenance,
            operation_id=operation_id,
            allow_create=allow_create,
        )

    def mark_chat_bootstrap(
        self,
        *,
        owner_chat_id: str,
        admission_id: str,
        expected_revision: int,
        succeeded: bool,
        provenance: Mapping[str, Any],
        error_code: str,
        operation_id: str,
    ) -> dict[str, Any]:
        return self.store.mark_chat_bootstrap(
            owner_chat_id=owner_chat_id,
            admission_id=admission_id,
            expected_revision=expected_revision,
            succeeded=succeeded,
            provenance=provenance,
            error_code=error_code,
            operation_id=operation_id,
        )

    def append_semantic_event(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        event: Mapping[str, Any],
        operation_id: str = "",
    ) -> dict[str, Any]:
        return self.store.append_semantic_event(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            event=event,
            operation_id=operation_id,
        )

    def bootstrap_history(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        history: Sequence[Mapping[str, Any]],
        operation_id: str = "",
        bootstrap_hash: str = "",
    ) -> dict[str, Any]:
        return self.store.bootstrap_history(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            history=history,
            operation_id=operation_id,
            bootstrap_hash=bootstrap_hash,
        )

    def bootstrap_current_request(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        message: Mapping[str, Any],
        operation_id: str,
    ) -> dict[str, Any]:
        return self.store.bootstrap_current_request(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            message=message,
            operation_id=operation_id,
        )

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
        return self.store.load_events(
            owner_chat_id=owner_chat_id,
            after=after,
            limit=limit,
            session_id=session_id,
            attempt_id=attempt_id,
            include_payload=include_payload,
        )

    def get_task_state(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
    ) -> dict[str, Any] | None:
        return self.store.get_task_state(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
        )

    def list_pending_task_inputs(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
    ) -> dict[str, Any]:
        return self.store.list_pending_task_inputs(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
        )

    def get_capture_task_state(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
    ) -> dict[str, Any] | None:
        return self.store.get_capture_task_state(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
        )

    def update_task_state(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        expected_revision: int,
        patch: Mapping[str, Any],
        source_event_ids: Sequence[str],
        operation_id: str,
    ) -> dict[str, Any]:
        return self.store.update_task_state(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            expected_revision=expected_revision,
            patch=patch,
            source_event_ids=source_event_ids,
            operation_id=operation_id,
        )

    def mark_attempt_outcome(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        outcome: str,
        operation_id: str,
    ) -> dict[str, Any]:
        return self.store.mark_attempt_outcome(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            outcome=outcome,
            operation_id=operation_id,
        )

    def rebase_session(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        replacement_history: Sequence[Mapping[str, Any]],
        source_generation_id: str,
        expected_session_revision: int,
        operation_id: str,
        reason: str,
    ) -> dict[str, Any]:
        return self.store.rebase_session(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            replacement_history=replacement_history,
            source_generation_id=source_generation_id,
            expected_session_revision=expected_session_revision,
            operation_id=operation_id,
            reason=reason,
        )

    def record_context_build(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        operation_id: str,
        context: Mapping[str, Any],
        source_event_ids: Sequence[str] = (),
    ) -> dict[str, Any]:
        return self.store.record_context_build(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            operation_id=operation_id,
            context=context,
            source_event_ids=source_event_ids,
        )

    def record_checkpoint(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        manifest: Mapping[str, Any],
        content: bytes,
        source_event_ids: Sequence[str] = (),
        source_event_store_seqs: Sequence[int] = (),
        operation_id: str,
        mime_type: str = "application/json",
    ) -> dict[str, Any]:
        return self.store.record_checkpoint(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            manifest=manifest,
            content=content,
            source_event_ids=source_event_ids,
            source_event_store_seqs=source_event_store_seqs,
            operation_id=operation_id,
            mime_type=mime_type,
        )

    def read_checkpoint_events(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        checkpoint_ref: str,
        after_position: int = 0,
        limit: int = 20,
    ) -> dict[str, Any]:
        return self.store.read_checkpoint_events(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            checkpoint_ref=checkpoint_ref,
            after_position=after_position,
            limit=limit,
        )

    def record_artifact(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        operation_id: str,
        artifact: Mapping[str, Any],
        content: bytes | None = None,
        mime_type: str = "application/octet-stream",
        source_event_ids: Sequence[str] = (),
        storage_trust: StorageTrust = StorageTrust.JOURNAL,
    ) -> dict[str, Any]:
        return self.store.record_artifact(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            operation_id=operation_id,
            artifact=artifact,
            content=content,
            mime_type=mime_type,
            source_event_ids=source_event_ids,
            storage_trust=storage_trust,
        )

    def record_handoff(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        operation_id: str,
        handoff: Mapping[str, Any],
        content: bytes | None = None,
        mime_type: str = "application/json",
        source_event_ids: Sequence[str] = (),
        storage_trust: StorageTrust = StorageTrust.JOURNAL,
    ) -> dict[str, Any]:
        return self.store.record_handoff(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            operation_id=operation_id,
            handoff=handoff,
            content=content,
            mime_type=mime_type,
            source_event_ids=source_event_ids,
            storage_trust=storage_trust,
        )

    def status(self) -> dict[str, Any]:
        from memory_v2_vector import get_memory_v2_vector_coordinator

        response = dict(self.store.status())
        vector = get_memory_v2_vector_coordinator(
            root_dir=self.root_dir,
            store=self.store,
        ).status()
        response["vector_status"] = vector["status"]
        response["vector"] = vector
        return response

    def search_entries(
        self,
        *,
        owner_chat_id: str,
        query: str,
        space_id: str = "",
        limit: int = 100,
    ) -> dict[str, Any]:
        from memory_v2_vector import get_memory_v2_vector_coordinator

        lexical = self.store.search_entries(
            owner_chat_id=owner_chat_id,
            query=query,
            space_id=space_id,
            limit=limit,
        )
        return get_memory_v2_vector_coordinator(
            root_dir=self.root_dir,
            store=self.store,
        ).hybrid_chat_search(
            lexical=lexical,
            owner_chat_id=owner_chat_id,
            query=query,
            space_id=space_id,
            limit=limit,
        )

    def search_long_term(
        self,
        *,
        namespace: str,
        query: str,
        limit: int = 20,
        min_score: float | None = None,
    ) -> dict[str, Any]:
        from memory_v2_vector import get_memory_v2_vector_coordinator

        lexical = self.store.search_long_term(
            namespace=namespace,
            query=query,
            limit=limit,
            min_score=min_score,
        )
        return get_memory_v2_vector_coordinator(
            root_dir=self.root_dir,
            store=self.store,
        ).hybrid_long_term_search(
            lexical=lexical,
            namespace=namespace,
            query=query,
            limit=limit,
            min_score=min_score,
        )

    def read_long_term_content(
        self,
        *,
        namespace: str,
        ref: str,
        offset: int = 0,
        limit: int = 32 * 1024,
    ) -> dict[str, Any]:
        return self.store.read_long_term_content(
            namespace=namespace,
            ref=ref,
            offset=offset,
            limit=limit,
        )

    def enqueue_curator_job_with_candidates(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        job_type: str,
        payload: Mapping[str, Any],
        candidate_refs: Sequence[Mapping[str, Any]],
        operation_id: str,
        next_attempt_at_ms: int = 0,
    ) -> dict[str, Any]:
        return self.store.enqueue_curator_job_with_candidates(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            job_type=job_type,
            payload=payload,
            candidate_refs=candidate_refs,
            operation_id=operation_id,
            next_attempt_at_ms=next_attempt_at_ms,
        )

    def list_job_candidates(
        self,
        *,
        owner_chat_id: str,
        job_id: str,
        outcome: str = "",
        limit: int = 100,
    ) -> dict[str, Any]:
        return self.store.list_job_candidates(
            owner_chat_id=owner_chat_id,
            job_id=job_id,
            outcome=outcome,
            limit=limit,
        )

    def read_job_candidate_content(
        self,
        *,
        owner_chat_id: str,
        job_id: str,
        candidate_ref: str,
        offset: int = 0,
        limit: int = 32 * 1024,
    ) -> dict[str, Any]:
        return self.store.read_job_candidate_content(
            owner_chat_id=owner_chat_id,
            job_id=job_id,
            candidate_ref=candidate_ref,
            offset=offset,
            limit=limit,
        )

    def apply_job_candidate_new(
        self,
        *,
        owner_chat_id: str,
        job_id: str,
        candidate_ref: str,
        expected_binding_revision: int,
        expected_space_revision: int,
        operation_id: str,
    ) -> dict[str, Any]:
        return self.store.apply_job_candidate_new(
            owner_chat_id=owner_chat_id,
            job_id=job_id,
            candidate_ref=candidate_ref,
            expected_binding_revision=expected_binding_revision,
            expected_space_revision=expected_space_revision,
            operation_id=operation_id,
        )

    def propose_job_candidate_review(
        self,
        *,
        owner_chat_id: str,
        job_id: str,
        candidate_ref: str,
        expected_binding_revision: int,
        target_entry_id: str,
        expected_target_revision: int,
        operation_id: str,
        mode: str = "overwrite",
    ) -> dict[str, Any]:
        return self.store.propose_job_candidate_review(
            owner_chat_id=owner_chat_id,
            job_id=job_id,
            candidate_ref=candidate_ref,
            expected_binding_revision=expected_binding_revision,
            target_entry_id=target_entry_id,
            expected_target_revision=expected_target_revision,
            operation_id=operation_id,
            mode=mode,
        )

    def list_candidate_reviews(
        self,
        *,
        owner_chat_id: str,
        status: str = "",
        limit: int = 100,
    ) -> dict[str, Any]:
        return self.store.list_candidate_reviews(
            owner_chat_id=owner_chat_id,
            status=status,
            limit=limit,
        )

    def get_candidate_review(
        self,
        *,
        owner_chat_id: str,
        review_id: str,
    ) -> dict[str, Any]:
        return self.store.get_candidate_review(
            owner_chat_id=owner_chat_id,
            review_id=review_id,
        )

    def read_candidate_review_content(
        self,
        *,
        owner_chat_id: str,
        review_id: str,
        content_kind: str,
        offset: int = 0,
        limit: int = 32 * 1024,
    ) -> dict[str, Any]:
        return self.store.read_candidate_review_content(
            owner_chat_id=owner_chat_id,
            review_id=review_id,
            content_kind=content_kind,
            offset=offset,
            limit=limit,
        )

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
        operation_id: str,
        decision_reason: str = "",
    ) -> dict[str, Any]:
        return self.store.decide_candidate_review(
            owner_chat_id=owner_chat_id,
            review_id=review_id,
            decision=decision,
            expected_review_revision=expected_review_revision,
            expected_candidate_revision=expected_candidate_revision,
            expected_target_revision=expected_target_revision,
            expected_space_revision=expected_space_revision,
            operation_id=operation_id,
            decision_reason=decision_reason,
        )

    def isolate_candidates_for_attempt(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        reason: str,
        operation_id: str,
    ) -> dict[str, Any]:
        return self.store.isolate_candidates_for_attempt(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            reason=reason,
            operation_id=operation_id,
        )

    def claim_specific_consolidation_job(
        self,
        *,
        owner_chat_id: str,
        job_id: str,
        expected_revision: int,
        worker_id: str,
        operation_id: str,
        lease_ms: int = 30000,
    ) -> dict[str, Any]:
        return self.store.claim_specific_consolidation_job(
            owner_chat_id=owner_chat_id,
            job_id=job_id,
            expected_revision=expected_revision,
            worker_id=worker_id,
            operation_id=operation_id,
            lease_ms=lease_ms,
        )

    def __getattr__(self, name: str) -> Any:
        return getattr(self.store, name)


_runtime_lock = threading.RLock()
_runtime: MemoryV2Runtime | None = None


def get_memory_v2_runtime(*, required: bool = False) -> MemoryV2Runtime | None:
    """Return the lazy singleton rooted at ``UNCHAIN_DATA_DIR/memory_v2``."""

    global _runtime
    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        if required:
            raise MemoryV2Error(
                "context_v2_unavailable",
                "Context V2 storage is not configured",
                status_code=503,
                retryable=True,
            )
        return None
    data_dir = Path(raw_data_dir).expanduser().resolve()
    root_dir = data_dir / "memory_v2"
    try:
        configured_owner = configured_context_v2_store_owner()
    except ContextV2StoreBoundaryError as exc:
        raise MemoryV2Error(
            exc.code,
            str(exc),
            status_code=503,
        ) from exc
    if configured_owner in {STORE_OWNER_OFF, STORE_OWNER_UNCHAIN}:
        with _runtime_lock:
            previous = _runtime
            _runtime = None
        if previous is not None:
            previous.store.close()
        if required:
            code = (
                "context_v2_store_disabled"
                if configured_owner == STORE_OWNER_OFF
                else "context_v2_owned_by_unchain"
            )
            raise MemoryV2Error(
                code,
                "PuPu legacy Context V2 storage is not the selected data owner",
                status_code=503,
            )
        return None
    with _runtime_lock:
        if _runtime is not None and _runtime.root_dir == root_dir:
            return _runtime
        try:
            replacement = open_context_v2_owned_store(
                root_dir=root_dir,
                requested_owner=STORE_OWNER_PUPU_LEGACY,
                opener=lambda _admission: MemoryV2Runtime(
                    data_dir=data_dir,
                    root_dir=root_dir,
                    store=MemoryV2Store(root_dir),
                ),
            )
        except ContextV2StoreBoundaryError as exc:
            raise MemoryV2Error(
                exc.code,
                str(exc),
                status_code=503,
            ) from exc
        previous = _runtime
        _runtime = replacement
        if previous is not None:
            previous.store.close()
        return replacement


def _reset_memory_v2_runtime_for_tests() -> None:
    global _runtime
    with _runtime_lock:
        previous = _runtime
        _runtime = None
    if previous is not None:
        from memory_v2_vector import close_memory_v2_vector_coordinator

        close_memory_v2_vector_coordinator(root_dir=previous.root_dir)
        previous.store.close()


__all__ = [
    "MemoryV2Runtime",
    "get_memory_v2_runtime",
]
