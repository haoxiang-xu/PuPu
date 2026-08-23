from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_curator_query import (
    PupuUnchainCuratorQueryApi,
    PupuUnchainCuratorQueryError,
    open_pupu_unchain_curator_query_api,
)
from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2Lifecycle,
    _initialize_lifecycle_schema,
    _persist_lifecycle,
)
from unchain.journal import ResourceRef
from unchain.memory.curator import (
    ConsolidationJobStatus,
    CuratorCoordinator,
    RootRunCompletion,
    RunCaptureStatus,
    SourceRunStatus,
)
from unchain.memory.toolkit import CandidateProposalRequest, MemoryToolkitRunBinding
from unchain.memory.workspace import MemorySpace
from unchain.persistence.sqlite_curator_v2 import SQLiteCuratorV2Store
from unchain.persistence.sqlite_curator_query_v2 import (
    MemoryReviewStatus,
    PendingMemoryReviewProposal,
)
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


OWNER = "chat-curator-query"
SPACE_ID = "space-curator-query"
BINDING_ID = "binding-curator-query"
EXECUTION_ID = "execution-curator-query"


class _Clock:
    def __init__(self, now_ms: int = 1_000) -> None:
        self.now_ms = now_ms

    def __call__(self) -> int:
        return self.now_ms


def _binding(
    *,
    session_id: str,
    attempt_id: str,
    run_id: str,
) -> MemoryToolkitRunBinding:
    return MemoryToolkitRunBinding(
        binding_id=BINDING_ID,
        session_id=session_id,
        attempt_id=attempt_id,
        run_id=run_id,
    )


def _proposal(
    *,
    source_event_id: str,
    operation_id: str,
    path: str,
) -> CandidateProposalRequest:
    return CandidateProposalRequest(
        path=path,
        description="A durable decision proposed for chat memory",
        kind="markdown",
        content=b"durable decision\n",
        media_type="text/markdown",
        url="",
        source_refs=(ResourceRef("context_event", source_event_id, 1),),
        rationale="Preserve a confirmed decision",
        confidence=0.95,
        sensitivity="normal",
        operation_id=operation_id,
    )


def _completion(binding: MemoryToolkitRunBinding) -> RootRunCompletion:
    return RootRunCompletion(
        session_id=binding.session_id,
        attempt_id=binding.attempt_id,
        run_id=binding.run_id,
        is_root_run=True,
        run_status=SourceRunStatus.COMPLETED,
        capture_status=RunCaptureStatus.COMPLETE,
    )


def _seed(root: Path):
    admission = admit_context_v2_store_owner(
        root_dir=root,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    objects = admission.root_dir / "objects"
    context = SQLiteContextV2Store(
        database_path=admission.database_path,
        object_directory=objects,
    )
    context.bind_execution(EXECUTION_ID)
    memory = SQLiteMemoryV2Store(
        database_path=admission.database_path,
        object_directory=objects,
    )
    memory.bind_workspace(
        space=MemorySpace(
            SPACE_ID,
            "chat",
            "Curator query chat memory",
            "Workspace for the official Curator query host adapter",
            1,
        ),
        owner_chat_id=OWNER,
    )
    clock = _Clock()
    curator = SQLiteCuratorV2Store(
        database_path=admission.database_path,
        object_directory=objects,
        clock_ms=clock,
    )
    repository = curator.bind_curation(
        binding_id=BINDING_ID,
        owner_chat_id=OWNER,
        target_space_id=SPACE_ID,
    )
    _initialize_lifecycle_schema(admission.database_path)
    _persist_lifecycle(
        database_path=admission.database_path,
        lifecycle=PupuUnchainMemoryV2Lifecycle(
            owner_chat_id=OWNER,
            execution_id=EXECUTION_ID,
            generation_id="generation-curator-query",
            attempt_id="attempt-curator-query",
            root_run_id="root-run-curator-query",
            binding_id=BINDING_ID,
            chat_space_id=SPACE_ID,
        ),
        operation_id="persist-curator-query-lifecycle",
        expected_revision=0,
    )
    first = _binding(
        session_id="session-curator-a",
        attempt_id="attempt-curator-a",
        run_id="run-curator-a",
    )
    queued = repository.bind_candidate_proposals(binding=first).propose(
        request=_proposal(
            source_event_id="event-curator-a",
            operation_id="candidate-curator-a",
            path="/decisions/a.md",
        )
    )
    coordinator = CuratorCoordinator(repository, clock_ms=clock)
    coordinator.enqueue(_completion(first))
    leased = coordinator.claim_next(
        worker_id="worker-curator-query",
        lease_ms=1_000,
        operation_id="claim-curator-query",
    )
    assert leased is not None
    second = _binding(
        session_id="session-curator-b",
        attempt_id="attempt-curator-b",
        run_id="run-curator-b",
    )
    pending = repository.bind_candidate_proposals(binding=second).propose(
        request=_proposal(
            source_event_id="event-curator-b",
            operation_id="candidate-curator-b",
            path="/decisions/b.md",
        )
    )
    return admission, pending, queued, leased


def test_cold_open_lists_scope_bound_candidates_and_jobs(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    _, pending, queued, leased = _seed(root)

    api = open_pupu_unchain_curator_query_api(
        root_dir=root,
        owner_chat_id=OWNER,
    )
    pending_page = api.list_candidates(
        owner_chat_id=OWNER,
        status="pending",
        limit=10,
    )
    assert [item["candidate_id"] for item in pending_page["candidates"]] == [
        pending.candidate_ref.resource_id
    ]
    assert pending_page["candidates"][0]["revision"] == 1
    assert pending_page["candidates"][0]["source_event_ids"] == [
        "event-curator-b"
    ]

    processing_page = api.list_candidates(
        owner_chat_id=OWNER,
        status="processing",
        limit=10,
    )
    assert [item["candidate_id"] for item in processing_page["candidates"]] == [
        queued.candidate_ref.resource_id
    ]
    job_page = api.list_consolidation_jobs(
        owner_chat_id=OWNER,
        status="leased",
        limit=10,
    )
    assert len(job_page["jobs"]) == 1
    assert job_page["jobs"][0]["job_id"] == leased.job_id
    assert job_page["jobs"][0]["status"] == ConsolidationJobStatus.LEASED.value
    assert job_page["jobs"][0]["lease_owner"] == "worker-curator-query"

    reopened = open_pupu_unchain_curator_query_api(
        root_dir=root,
        owner_chat_id=OWNER,
    )
    assert reopened.list_consolidation_jobs(
        owner_chat_id=OWNER,
        status="leased",
        limit=10,
    ) == job_page


def test_query_api_rejects_owner_and_status_mismatch(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    _seed(root)
    api = open_pupu_unchain_curator_query_api(
        root_dir=root,
        owner_chat_id=OWNER,
    )

    with pytest.raises(PupuUnchainCuratorQueryError) as scope:
        api.list_candidates(owner_chat_id="chat-foreign", limit=10)
    assert scope.value.code == "context_v2_scope_mismatch"
    assert scope.value.status_code == 403

    with pytest.raises(PupuUnchainCuratorQueryError) as invalid:
        api.list_consolidation_jobs(
            owner_chat_id=OWNER,
            status="not-a-job-status",
            limit=10,
        )
    assert invalid.value.code == "context_v2_invalid_request"
    assert invalid.value.status_code == 400


def test_open_fails_closed_without_exact_lifecycle(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    _seed(root)

    with pytest.raises(PupuUnchainCuratorQueryError) as unavailable:
        open_pupu_unchain_curator_query_api(
            root_dir=root,
            owner_chat_id="chat-without-lifecycle",
        )
    assert unavailable.value.code == "context_v2_curator_lifecycle_unavailable"
    assert unavailable.value.status_code == 409


def test_open_rejects_ambiguous_binding(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    admission, _, _, _ = _seed(root)
    second_binding = "binding-curator-query-second"
    SQLiteCuratorV2Store(
        database_path=admission.database_path,
        object_directory=admission.root_dir / "objects",
    ).bind_curation(
        binding_id=second_binding,
        owner_chat_id=OWNER,
        target_space_id=SPACE_ID,
    )
    _persist_lifecycle(
        database_path=admission.database_path,
        lifecycle=PupuUnchainMemoryV2Lifecycle(
            owner_chat_id=OWNER,
            execution_id="execution-curator-query-second",
            generation_id="generation-curator-query-second",
            attempt_id="attempt-curator-query-second",
            root_run_id="root-run-curator-query-second",
            binding_id=second_binding,
            chat_space_id=SPACE_ID,
        ),
        operation_id="persist-curator-query-lifecycle-second",
        expected_revision=0,
    )

    with pytest.raises(PupuUnchainCuratorQueryError) as ambiguous:
        open_pupu_unchain_curator_query_api(
            root_dir=root,
            owner_chat_id=OWNER,
        )
    assert ambiguous.value.code == "context_v2_curator_lifecycle_ambiguous"
    assert ambiguous.value.status_code == 409


def test_candidate_payload_hash_is_the_official_snapshot_hash(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    _, pending, _, _ = _seed(root)
    page = open_pupu_unchain_curator_query_api(
        root_dir=root,
        owner_chat_id=OWNER,
    ).list_candidates(owner_chat_id=OWNER, status="pending", limit=10)

    expected = hashlib.sha256(
        pending.to_dict()["payload_sha256"].encode("ascii")
    ).hexdigest()
    assert page["candidates"][0]["payload_sha256"] == pending.payload_sha256
    assert expected != pending.payload_sha256


class _ReviewQuery:
    def __init__(self, review: PendingMemoryReviewProposal) -> None:
        self.review = review
        self.status = None

    def list_pending_reviews(self, *, status, limit):
        self.status = status
        assert limit == 10
        return (self.review,)

    def get_pending_review(self, *, review_id):
        assert review_id == self.review.review_ref.resource_id
        return self.review


def test_review_projection_preserves_current_binding_fence_and_ui_fields() -> None:
    candidate_ref = ResourceRef("memory_candidate", "candidate-review", 1)
    review = PendingMemoryReviewProposal(
        review_ref=ResourceRef(
            "memory_review", "review-projection", 1, SPACE_ID
        ),
        binding_id=BINDING_ID,
        job_id="job-review-projection",
        candidate_ref=candidate_ref,
        binding_revision=3,
        target_entry_ref=ResourceRef("memory", "entry-review", 4, SPACE_ID),
        mode="overwrite",
        semantic={
            "binding_id": BINDING_ID,
            "job_id": "job-review-projection",
            "candidate": {
                "candidate_ref": candidate_ref.to_dict(),
                "source_refs": [
                    ResourceRef("context_event", "event-review", 1).to_dict()
                ],
                "content_sha256": "a" * 64,
                "byte_length": 25,
                "media_type": "text/markdown",
            },
            "target": {
                "space_id": SPACE_ID,
                "entry_id": "entry-review",
                "revision": 4,
                "path": "/decisions/review.md",
            },
            "mode": "overwrite",
        },
        review_diff={
            "schema": "unchain.memory_review_diff.v1",
            "mode": "overwrite",
            "candidate": {
                "path": "/decisions/review.md",
                "name": "review.md",
                "description": "Replace the stale decision",
                "kind": "markdown",
                "media_type": "text/markdown",
                "content_sha256": "a" * 64,
                "byte_length": 25,
            },
            "target": {
                "path": "/decisions/review.md",
                "content_sha256": "b" * 64,
            },
            "changes": ["description", "content_sha256"],
            "requires_user_confirmation": True,
        },
        first_operation_id="propose-review-projection",
        created_at_ms=2_000,
    )
    query = _ReviewQuery(review)
    api = PupuUnchainCuratorQueryApi(owner_chat_id=OWNER, _query=query)

    page = api.list_candidate_reviews(
        owner_chat_id=OWNER,
        status="pending",
        limit=10,
    )
    assert query.status is MemoryReviewStatus.PENDING
    assert len(page["reviews"]) == 1
    projected = page["reviews"][0]
    assert projected["review_id"] == "review-projection"
    assert projected["candidate_ref"].endswith("candidate-review@1")
    assert projected["candidate_revision"] == 3
    assert projected["candidate_content_revision"] == 1
    assert projected["candidate_binding_revision"] == 3
    assert projected["target"] == {
        "space_id": SPACE_ID,
        "path": "/decisions/review.md",
        "entry_id": "entry-review",
        "expected_revision": 4,
    }
    assert projected["proposed"]["mode"] == "overwrite"
    assert projected["proposed"]["source_event_ids"] == ["event-review"]
    assert projected["proposed"]["content"] == {
        "ref": "pupu://memory/review/review-projection@1/proposed",
        "media_type": "text/markdown",
        "bytes": 25,
        "sha256": "a" * 64,
    }
    assert projected["diff_ref"] == (
        "pupu://memory/review/review-projection@1/diff"
    )
    assert "requires_user_confirmation" in projected["diff_preview"]
    assert api.get_candidate_review(
        owner_chat_id=OWNER,
        review_id="review-projection",
    ) == projected
