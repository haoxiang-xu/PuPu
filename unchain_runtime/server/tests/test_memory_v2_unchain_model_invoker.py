from __future__ import annotations

from types import SimpleNamespace

import pytest

from memory_v2_unchain_model_invoker import (
    PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT,
    PupuOfficialMemoryAgentInvokerError,
    PupuOfficialMemoryAgentModelInvoker,
)
from unchain.journal import ResourceRef
from unchain.memory.curator import (
    CandidateOrigin,
    CandidateOutcome,
    CandidateStatus,
    ConsolidationJob,
    CuratorLeaseFence,
    CuratorPolicy,
    CuratorRunRequest,
    FrozenCandidateSnapshot,
    Lease,
    RootRunCompletion,
    RunCaptureStatus,
    SourceRunStatus,
)
from unchain.memory.toolkit import MemoryToolkitRunBinding, ReferencePurpose
from unchain.tools import Tool, Toolkit


class _Codec:
    binding_id = "binding-a"

    def encode(self, ref: ResourceRef) -> str:
        fragment = ref.fragment or "-"
        return f"ref:{ref.kind}:{ref.resource_id}:{ref.revision}:{fragment}"

    def decode(self, value: str, *, purpose: ReferencePurpose) -> ResourceRef:
        del purpose
        prefix, kind, resource_id, revision, fragment = value.split(":", 4)
        if prefix != "ref":
            raise ValueError("invalid reference")
        return ResourceRef(
            kind,
            resource_id,
            int(revision),
            "" if fragment == "-" else fragment,
        )


def _candidate(value: str = "candidate-a") -> FrozenCandidateSnapshot:
    candidate_ref = ResourceRef("memory_candidate", value, 1)
    return FrozenCandidateSnapshot(
        candidate_ref=candidate_ref,
        target_space_id="space-chat-a",
        binding_revision=1,
        outcome=CandidateStatus.QUEUED,
        origin=CandidateOrigin.AGENT_PROPOSAL,
        target_path=f"/notes/{value}.md",
        name=f"{value}.md",
        description="A durable project decision",
        kind="file",
        media_type="text/markdown",
        content_ref=candidate_ref,
        source_refs=(ResourceRef("context_event", f"event-{value}", 1),),
        payload_sha256="a" * 64,
        content_sha256="b" * 64,
        byte_length=25,
    )


def _request(*candidates: FrozenCandidateSnapshot) -> CuratorRunRequest:
    completion = RootRunCompletion(
        session_id="session-a",
        attempt_id="attempt-a",
        run_id="run-a",
        is_root_run=True,
        run_status=SourceRunStatus.COMPLETED,
        capture_status=RunCaptureStatus.COMPLETE,
    )
    pending = ConsolidationJob.pending(
        job_id="job-a",
        trigger=completion,
        candidates=tuple(candidates) or (_candidate(),),
        operation_id="enqueue-a",
        now_ms=1,
    )
    leased = pending.with_lease(
        Lease(owner="worker-a", token="lease-a", expires_at_ms=10_000),
        revision=2,
        now_ms=2,
    )
    return CuratorRunRequest(
        job=leased,
        policy=CuratorPolicy.p0(),
        lease_fence=CuratorLeaseFence.from_job("binding-a", leased),
    )


def _binding() -> MemoryToolkitRunBinding:
    return MemoryToolkitRunBinding(
        binding_id="binding-a",
        session_id="session-a",
        attempt_id="memory-agent-attempt-a",
        run_id="memory-agent-run-a",
    )


def _toolkit(request: CuratorRunRequest, codec: _Codec) -> Toolkit:
    candidate_ref = codec.encode(request.job.candidates[0].candidate_ref)
    space_id = request.job.candidates[0].target_space_id

    def memory_candidate_read(candidate_ref: str, offset: int = 0, limit: int = 1):
        del candidate_ref, offset, limit
        return {"text": "candidate data"}

    def memory_candidate_source_read(source_ref: str, offset: int = 0, limit: int = 1):
        del source_ref, offset, limit
        return {"text": "source data"}

    def memory_candidate_apply_new(**_kwargs):
        return {
            "outcome": "applied",
            "candidate_ref": candidate_ref,
            "target_space_id": space_id,
            "result_ref": codec.encode(
                ResourceRef("memory", "entry-a", 1, space_id)
            ),
        }

    def memory_candidate_propose_review(**_kwargs):
        return {
            "outcome": "awaiting_user",
            "candidate_ref": candidate_ref,
            "target_space_id": space_id,
            "result_ref": codec.encode(
                ResourceRef("memory_review", "review-a", 1, space_id)
            ),
            "review_diff": {"mode": "overwrite", "changes": ["content"]},
        }

    toolkit = Toolkit()
    for name, function in (
        ("memory_candidate_read", memory_candidate_read),
        ("memory_candidate_source_read", memory_candidate_source_read),
        ("memory_candidate_apply_new", memory_candidate_apply_new),
        ("memory_candidate_propose_review", memory_candidate_propose_review),
    ):
        toolkit.register(Tool.from_callable(function, name=name))
    toolkit.binding_id = "binding-a"
    toolkit.job_id = request.job.job_id
    toolkit.candidate_refs = tuple(
        item.candidate_ref for item in request.job.candidates
    )
    toolkit.lease_fence = request.lease_fence
    return toolkit


class _Agent:
    provider = "openai"
    model = "curator-model"

    def __init__(self, toolkit: Toolkit, action):
        self.toolkit = toolkit
        self.action = action
        self.calls = []

    def run(self, *, messages, payload, callback):
        self.calls.append((messages, payload, callback))
        self.action(self.toolkit)
        callback({"type": "reasoning_delta", "content": "must be ignored"})
        return SimpleNamespace(status="completed", hidden_reasoning="not returned")


def _invoker(action, factory_calls):
    codec = _Codec()

    def factory(**kwargs):
        factory_calls.append(kwargs)
        return _Agent(kwargs["toolkit"], action)

    return (
        PupuOfficialMemoryAgentModelInvoker(
            agent_factory=factory,
            provider="openai",
            model_id="curator-model",
            reference_codec=codec,
        ),
        codec,
    )


def test_applied_effect_becomes_typed_resolution_from_locked_agent():
    request = _request(_candidate())
    factory_calls = []
    invoker, codec = _invoker(
        lambda toolkit: toolkit.tools["memory_candidate_apply_new"].func(
            candidate_ref=codec.encode(request.job.candidates[0].candidate_ref),
            expected_binding_revision=1,
            expected_space_revision=1,
        ),
        factory_calls,
    )

    result = invoker.run(request, toolkit=_toolkit(request, codec), binding=_binding())

    assert len(result.resolutions) == 1
    assert result.resolutions[0].outcome is CandidateOutcome.APPLIED
    assert result.resolutions[0].result_ref.kind == "memory"
    assert factory_calls[0]["provider"] == "openai"
    assert factory_calls[0]["model_id"] == "curator-model"
    assert factory_calls[0]["system_prompt"] == PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT
    assert "memory_promote" not in factory_calls[0]["toolkit"].tools


def test_conflict_is_non_terminal_until_server_review_effect():
    request = _request(_candidate())
    factory_calls = []

    def action(toolkit):
        toolkit.tools["memory_candidate_apply_new"].func(
            candidate_ref=codec.encode(request.job.candidates[0].candidate_ref),
            expected_binding_revision=1,
            expected_space_revision=2,
        )
        toolkit.tools["memory_candidate_propose_review"].func(
            candidate_ref=codec.encode(request.job.candidates[0].candidate_ref),
            expected_binding_revision=1,
            target_entry_id="entry-existing",
            expected_target_revision=2,
        )

    invoker, codec = _invoker(action, factory_calls)
    toolkit = _toolkit(request, codec)

    def conflict(**_kwargs):
        candidate = request.job.candidates[0]
        return {
            "outcome": "conflict",
            "candidate_ref": codec.encode(candidate.candidate_ref),
            "target_space_id": candidate.target_space_id,
            "target_entry_ref": codec.encode(
                ResourceRef("memory", "entry-existing", 2, candidate.target_space_id)
            ),
            "server_review_required": True,
        }

    toolkit.tools["memory_candidate_apply_new"].func = conflict
    result = invoker.run(request, toolkit=toolkit, binding=_binding())

    assert result.resolutions[0].outcome is CandidateOutcome.AWAITING_USER
    assert result.resolutions[0].result_ref.kind == "memory_review"
    assert result.resolutions[0].review_diff["mode"] == "overwrite"


@pytest.mark.parametrize(
    ("action", "error_code"),
    [
        (lambda _toolkit: None, "memory_agent_missing_resolution"),
        (
            lambda toolkit: (
                toolkit.tools["memory_candidate_apply_new"].func(),
                toolkit.tools["memory_candidate_apply_new"].func(),
            ),
            "memory_agent_duplicate_resolution",
        ),
    ],
)
def test_missing_or_duplicate_terminal_effect_fails_closed(action, error_code):
    request = _request(_candidate())
    invoker, codec = _invoker(action, [])

    with pytest.raises(PupuOfficialMemoryAgentInvokerError) as caught:
        invoker.run(request, toolkit=_toolkit(request, codec), binding=_binding())

    assert caught.value.code == error_code


@pytest.mark.parametrize("failure_mode", ["illegal_outcome", "tool_failure"])
def test_illegal_outcome_or_tool_failure_fails_closed(failure_mode):
    request = _request(_candidate())

    def action(toolkit):
        toolkit.tools["memory_candidate_apply_new"].func()

    invoker, codec = _invoker(action, [])
    toolkit = _toolkit(request, codec)
    if failure_mode == "illegal_outcome":
        toolkit.tools["memory_candidate_apply_new"].func = lambda: {
            "outcome": "superseded",
            "candidate_ref": codec.encode(request.job.candidates[0].candidate_ref),
            "target_space_id": request.job.candidates[0].target_space_id,
        }
        expected = "memory_agent_tool_outcome_invalid"
    else:
        toolkit.tools["memory_candidate_apply_new"].func = lambda: (_ for _ in ()).throw(
            RuntimeError("provider-safe failure")
        )
        expected = "memory_agent_tool_failed"

    with pytest.raises(PupuOfficialMemoryAgentInvokerError) as caught:
        invoker.run(request, toolkit=toolkit, binding=_binding())

    assert caught.value.code == expected
