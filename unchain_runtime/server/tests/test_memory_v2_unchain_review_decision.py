from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import pytest

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_review_decision import (
    PupuUnchainReviewDecisionApi,
    PupuUnchainReviewDecisionError,
    open_pupu_unchain_review_decision_api,
)
from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2Lifecycle,
    _initialize_lifecycle_schema,
    _persist_lifecycle,
)
from unchain.journal import OperationRef, ResourceRef
from unchain.memory.curator import (
    CandidateOutcome,
    CandidateResolution,
    CuratorCoordinator,
    RootRunCompletion,
    RunCaptureStatus,
    SourceRunStatus,
)
from unchain.memory.toolkit import CandidateProposalRequest, MemoryToolkitRunBinding
from unchain.memory.workspace import MemorySpace, MemoryWorkspaceService
from unchain.memory.workspace.ports import BoundWorkspaceReferenceAuthorizer
from unchain.persistence.sqlite_curator_v2 import SQLiteCuratorV2Store
from unchain.persistence.sqlite_memory_host_v2 import (
    SQLiteConsolidationCapabilityFactory,
)
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


OWNER = "chat-review-decision"
BINDING = "binding-review-decision"
SPACE = "space-review-decision"
EXECUTION = "execution-review-decision"


@dataclass(frozen=True)
class _Receipt:
    overrides: dict | None = None

    def to_dict(self):
        payload = {
            "schema": "unchain.memory_review_decision_receipt.v1",
            "binding_id": BINDING,
            "owner_chat_id": OWNER,
            "target_space_id": SPACE,
            "review_ref": ResourceRef(
                "memory_review", "review-a", 2, SPACE
            ).to_dict(),
            "proposal_ref": ResourceRef(
                "memory_review", "review-a", 1, SPACE
            ).to_dict(),
            "decision": "apply",
            "status": "applied",
            "candidate_ref": ResourceRef(
                "memory_candidate", "candidate-a", 1
            ).to_dict(),
            "candidate_binding_revision_before": 3,
            "candidate_binding_revision_after": 4,
            "job_id": "job-a",
            "job_revision_before": 5,
            "job_revision_after": 6,
            "target_entry_ref": ResourceRef(
                "memory", "entry-a", 7, SPACE
            ).to_dict(),
            "applied_entry_ref": ResourceRef(
                "memory", "entry-a", 8, SPACE
            ).to_dict(),
            "space_revision_before": 9,
            "space_revision_after": 10,
            "decision_reason": "user accepted the replacement",
            "operation_id": "review-decision-operation-a",
            "payload_sha256": "a" * 64,
            "decided_at_ms": 12_000,
            "replayed": False,
        }
        payload.update(self.overrides or {})
        return payload


class _Decisions:
    def __init__(self, receipt: _Receipt) -> None:
        self.receipt = receipt
        self.calls = []

    def decide(self, **kwargs):
        self.calls.append(kwargs)
        return self.receipt


class _Clock:
    def __init__(self, now_ms=1_000):
        self.now_ms = now_ms

    def __call__(self):
        return self.now_ms


class _References(BoundWorkspaceReferenceAuthorizer):
    def __init__(self, binding_id, allowed):
        super().__init__(binding_id)
        self.allowed = frozenset(allowed)

    def authorize(self, *, ref):
        if ref not in self.allowed:
            raise ValueError("foreign source ref")
        return ref


def _api(receipt: _Receipt | None = None):
    decisions = _Decisions(receipt or _Receipt())
    return (
        PupuUnchainReviewDecisionApi(
            owner_chat_id=OWNER,
            binding_id=BINDING,
            target_space_id=SPACE,
            _decisions=decisions,
        ),
        decisions,
    )


def _seed_published_review(root: Path):
    admission = admit_context_v2_store_owner(
        root_dir=root,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    objects = admission.root_dir / "objects"
    SQLiteContextV2Store(
        database_path=admission.database_path,
        object_directory=objects,
    ).bind_execution(EXECUTION)
    memory = SQLiteMemoryV2Store(
        database_path=admission.database_path,
        object_directory=objects,
    )
    repository = memory.bind_workspace(
        space=MemorySpace(
            SPACE,
            "chat",
            "Review decision workspace",
            "Official PuPu-to-Unchain decision integration",
            1,
        ),
        owner_chat_id=OWNER,
    )
    source_ref = ResourceRef("context_event", "event-review-decision", 1)
    workspace = MemoryWorkspaceService(
        repository=repository,
        mutations=repository,
        content=repository,
        history=repository,
        links=repository,
        references=_References(BINDING, {source_ref}),
    )
    target = workspace.write_markdown(
        path="/decisions/context-policy.md",
        description="Existing context policy",
        content="old policy",
        expected_space_revision=1,
        source_refs=(source_ref,),
        operation_id="seed-review-decision-target",
    )
    clock = _Clock()
    curator_store = SQLiteCuratorV2Store(
        database_path=admission.database_path,
        object_directory=objects,
        clock_ms=clock,
    )
    curator = curator_store.bind_curation(
        binding_id=BINDING,
        owner_chat_id=OWNER,
        target_space_id=SPACE,
    )
    binding = MemoryToolkitRunBinding(
        binding_id=BINDING,
        session_id="session-review-decision",
        attempt_id="attempt-review-decision-source",
        run_id="run-review-decision-source",
    )
    candidate = curator.bind_candidate_proposals(binding=binding).propose(
        request=CandidateProposalRequest(
            path=target.path,
            description="Accepted replacement context policy",
            kind="markdown",
            content=b"new policy",
            media_type="text/markdown",
            url="",
            source_refs=(source_ref,),
            rationale="Keep the confirmed context policy",
            confidence=0.99,
            sensitivity="normal",
            operation_id="propose-review-decision-candidate",
        )
    )
    completion = RootRunCompletion(
        session_id=binding.session_id,
        attempt_id=binding.attempt_id,
        run_id=binding.run_id,
        is_root_run=True,
        run_status=SourceRunStatus.COMPLETED,
        capture_status=RunCaptureStatus.COMPLETE,
    )
    coordinator = CuratorCoordinator(curator, clock_ms=clock)
    coordinator.enqueue(completion)
    claimed = coordinator.claim_next(
        worker_id="worker-review-decision",
        lease_ms=1_000,
        operation_id="claim-review-decision-job",
    )
    assert claimed is not None
    digest = hashlib.sha256(
        f"{claimed.job_id}:{claimed.revision}".encode("utf-8")
    ).hexdigest()
    curator_binding = MemoryToolkitRunBinding(
        binding_id=BINDING,
        session_id=claimed.trigger.session_id,
        attempt_id=f"memory-curator-attempt-{digest}",
        run_id=f"memory-curator-run-{digest}",
    )
    guard = curator.bind_mutation_guard(job=claimed)
    capabilities = SQLiteConsolidationCapabilityFactory(
        binding_id=BINDING,
        database_path=admission.database_path,
        repository=curator,
        workspace=workspace,
        references=SimpleNamespace(binding_id=BINDING),
        context=SimpleNamespace(binding_id=BINDING),
        clock_ms=clock,
    ).build(
        binding=curator_binding,
        job=claimed,
        mutation_guard=guard,
    )
    review = capabilities.consolidation.propose_review(
        job_id=claimed.job_id,
        candidate_ref=candidate.candidate_ref,
        expected_binding_revision=claimed.candidates[0].binding_revision,
        target_entry_id=target.entry_id,
        expected_target_revision=target.revision,
        mode="overwrite",
        mutation_guard=guard,
        operation_id="publish-review-decision-proposal",
    )
    completed = curator.reconcile_and_complete(
        job=claimed,
        resolutions=(
            CandidateResolution(
                candidate_ref=candidate.candidate_ref,
                target_space_id=SPACE,
                outcome=CandidateOutcome.AWAITING_USER,
                result_ref=review["result_ref"],
                review_diff=review["review_diff"],
            ),
        ),
        mutation_guard=guard,
        operation=OperationRef(
            "complete-review-decision-job",
            hashlib.sha256(b"complete-review-decision-job").hexdigest(),
        ),
        now_ms=clock(),
    )
    _initialize_lifecycle_schema(admission.database_path)
    _persist_lifecycle(
        database_path=admission.database_path,
        lifecycle=PupuUnchainMemoryV2Lifecycle(
            owner_chat_id=OWNER,
            execution_id=EXECUTION,
            generation_id="generation-review-decision",
            attempt_id="attempt-review-decision",
            root_run_id="root-run-review-decision",
            binding_id=BINDING,
            chat_space_id=SPACE,
        ),
        operation_id="persist-review-decision-lifecycle",
        expected_revision=0,
    )
    return review["result_ref"], target, completed


def test_decision_adapter_forwards_only_atomic_fences_and_presents_receipt() -> None:
    api, decisions = _api()

    result = api.decide_candidate_review(
        owner_chat_id=OWNER,
        review_id="review-a",
        decision="apply",
        expected_review_revision=1,
        expected_candidate_revision=3,
        expected_target_revision=7,
        expected_space_revision=9,
        decision_reason="user accepted the replacement",
        operation_id="review-decision-operation-a",
    )

    assert decisions.calls == [
        {
            "review_id": "review-a",
            "decision": "apply",
            "expected_review_revision": 1,
            "expected_candidate_revision": 3,
            "expected_target_revision": 7,
            "expected_space_revision": 9,
            "decision_reason": "user accepted the replacement",
            "operation_id": "review-decision-operation-a",
        }
    ]
    assert result["review_id"] == "review-a"
    assert result["review_ref"] == "pupu://memory/review/review-a@2"
    assert result["candidate_ref"] == (
        "pupu://memory/candidate/candidate-a@1"
    )
    assert result["candidate_revision"] == 4
    assert result["status"] == "applied"
    assert result["revision"] == 2
    assert result["diff_ref"] == "pupu://memory/review/review-a@1/diff"
    assert result["target"] == {
        "space_id": SPACE,
        "path": "",
        "entry_id": "entry-a",
        "expected_revision": 7,
    }
    assert result["applied_entry_ref"] == (
        f"pupu://memory/{SPACE}/entry-a@8"
    )
    assert result["space_revision_after"] == 10
    assert result["replayed"] is False


def test_decision_adapter_rejects_owner_or_receipt_scope_mismatch() -> None:
    api, decisions = _api()
    with pytest.raises(PupuUnchainReviewDecisionError) as owner:
        api.decide_candidate_review(
            owner_chat_id="chat-foreign",
            review_id="review-a",
            decision="reject",
            expected_review_revision=1,
            expected_candidate_revision=3,
            expected_target_revision=7,
            expected_space_revision=9,
            decision_reason="",
            operation_id="review-decision-operation-b",
        )
    assert owner.value.code == "context_v2_scope_mismatch"
    assert decisions.calls == []

    escaped, _ = _api(_Receipt({"owner_chat_id": "chat-foreign"}))
    with pytest.raises(PupuUnchainReviewDecisionError) as receipt:
        escaped.decide_candidate_review(
            owner_chat_id=OWNER,
            review_id="review-a",
            decision="apply",
            expected_review_revision=1,
            expected_candidate_revision=3,
            expected_target_revision=7,
            expected_space_revision=9,
            decision_reason="",
            operation_id="review-decision-operation-c",
        )
    assert receipt.value.status_code == 503


def test_cold_open_applies_published_review_through_official_unchain_store(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory_v2"
    review_ref, target, completed = _seed_published_review(root)
    published = completed.candidates[0]
    api = open_pupu_unchain_review_decision_api(
        root_dir=root,
        owner_chat_id=OWNER,
    )

    result = api.decide_candidate_review(
        owner_chat_id=OWNER,
        review_id=review_ref.resource_id,
        decision="apply",
        expected_review_revision=review_ref.revision,
        expected_candidate_revision=published.binding_revision,
        expected_target_revision=target.revision,
        expected_space_revision=2,
        decision_reason="accepted in the trace review",
        operation_id="apply-review-decision-integration",
    )

    assert result["review_ref"] == (
        f"pupu://memory/review/{review_ref.resource_id}@2"
    )
    assert result["status"] == "applied"
    assert result["revision"] == 2
    assert result["candidate_revision"] == published.binding_revision + 1
    assert result["target"]["entry_id"] == target.entry_id
    assert result["target"]["expected_revision"] == target.revision
    assert result["applied_entry_ref"] == (
        f"pupu://memory/{SPACE}/{target.entry_id}@{target.revision + 1}"
    )
    assert result["space_revision_before"] == 2
    assert result["space_revision_after"] == 3
    assert result["replayed"] is False

    replay = open_pupu_unchain_review_decision_api(
        root_dir=root,
        owner_chat_id=OWNER,
    ).decide_candidate_review(
        owner_chat_id=OWNER,
        review_id=review_ref.resource_id,
        decision="apply",
        expected_review_revision=review_ref.revision,
        expected_candidate_revision=published.binding_revision,
        expected_target_revision=target.revision,
        expected_space_revision=2,
        decision_reason="accepted in the trace review",
        operation_id="apply-review-decision-integration",
    )
    assert replay["replayed"] is True
    assert replay["applied_entry_ref"] == result["applied_entry_ref"]
