from __future__ import annotations

from types import SimpleNamespace

import pytest

from memory_v2_unchain_active_bridge import (
    PupuUnchainActiveBridge,
    prepare_pupu_unchain_active_bridge,
)
from memory_v2_unchain_graph_checkpoint import (
    PupuUnchainGraphStepDescriptor,
    prepare_pupu_unchain_graph_checkpoint_host,
)
from memory_v2_unchain_graph_root_completion import (
    PupuUnchainGraphRootCompletionError,
    complete_pupu_unchain_graph_root,
)
from memory_v2_unchain_run_binding import PupuMemoryV2TextInputDraft
from memory_v2_unchain_shadow_bridge import (
    PupuUnchainShadowRunDraft,
    prepare_pupu_unchain_shadow_bridge,
)
from memory_v2_unchain_worker import PupuUnchainMemoryAgentWorker
from unchain.context.graph_harness import (
    GraphStepBootstrapBinding,
    GraphStepBootstrapHarness,
)
from unchain.journal import EventCursor, ResourceRef
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.memory.curator import (
    CandidateOutcome,
    CandidateResolution,
    CuratorRunResult,
    EnqueueDisposition,
    ProcessDisposition,
)
from unchain.memory.curator.host import MemoryAgentWorkerDisposition
from unchain.memory import (
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_CAPABILITIES,
    MEMORY_V2_MODULE_KEY,
    MemoryAttachmentRequest,
)
from unchain.memory.toolkit import CandidateProposalRequest, ReferencePurpose
from unchain.runtime import ExecutionIdentity, ModuleGrant


class _NeverRunMemoryAgent:
    def __init__(self) -> None:
        self.calls = []

    def run(self, request, *, toolkit, binding):
        self.calls.append((request, toolkit, binding))
        raise AssertionError("a candidate-free completion cannot invoke a model")


class _ApplyMemoryAgent:
    def __init__(self, codec) -> None:
        self.codec = codec
        self.calls = []

    def run(self, request, *, toolkit, binding):
        self.calls.append((request, toolkit, binding))
        resolutions = []
        for candidate in request.job.candidates:
            result = toolkit.tools["memory_candidate_apply_new"].func(
                candidate_ref=self.codec.encode(candidate.candidate_ref),
                expected_binding_revision=candidate.binding_revision,
            )
            resolutions.append(
                CandidateResolution(
                    candidate_ref=candidate.candidate_ref,
                    target_space_id=candidate.target_space_id,
                    outcome=CandidateOutcome.APPLIED,
                    result_ref=self.codec.decode(
                        result["result_ref"],
                        purpose=ReferencePurpose.MEMORY,
                    ),
                )
            )
        return CuratorRunResult(tuple(resolutions))


class _FailMemoryAgent:
    def __init__(self) -> None:
        self.calls = []

    def run(self, request, *, toolkit, binding):
        self.calls.append((request, toolkit, binding))
        raise RuntimeError("model unavailable")


def _memory_grant(*, completion_authority: bool) -> ModuleGrant:
    delegable = MEMORY_V2_CAPABILITIES.difference({MEMORY_EXECUTION_COMPLETE})
    return ModuleGrant(
        module_key=MEMORY_V2_MODULE_KEY,
        capabilities=(
            MEMORY_V2_CAPABILITIES if completion_authority else delegable
        ),
        delegable_capabilities=delegable,
        authority="graph-completion-authority" if completion_authority else None,
    )


def _run(
    *,
    execution_id: str,
    attempt_id: str,
    content: str,
) -> PupuUnchainShadowRunDraft:
    return PupuUnchainShadowRunDraft(
        session_id=execution_id,
        identity=ExecutionIdentity(
            execution_id=execution_id,
            attempt_id=attempt_id,
            run_id=attempt_id,
            run_lineage=(attempt_id,),
        ),
        grant=_memory_grant(completion_authority=True),
        current_input_draft=PupuMemoryV2TextInputDraft(content=content),
    )


def _active_bridge(
    tmp_path,
    monkeypatch,
    *,
    run: PupuUnchainShadowRunDraft,
    owner_chat_id: str,
    invoker_factory,
) -> PupuUnchainActiveBridge:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    bridge = prepare_pupu_unchain_active_bridge(
        admission=SimpleNamespace(
            is_active=True,
            owner_chat_id=owner_chat_id,
            session_id=run.session_id,
            attempt_id=run.attempt_id,
        ),
        run=run,
        bootstrap_history=(),
        no_unfinished_durable_checkpoint=True,
        no_pending_interaction=True,
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
        memory_agent_enabled=True,
        memory_agent_model_invoker_factory=invoker_factory,
    )
    assert type(bridge) is PupuUnchainActiveBridge
    return bridge


def _descriptors():
    return (
        PupuUnchainGraphStepDescriptor(
            index=0,
            node_id="collect",
            attempt_id="graph-step-collect",
            provider="openai",
            model="gpt-test",
            prompt="collect evidence",
            configuration={"temperature": 0},
        ),
        PupuUnchainGraphStepDescriptor(
            index=1,
            node_id="write",
            attempt_id="graph-step-write",
            provider="anthropic",
            model="claude-test",
            prompt="write report",
            configuration={"temperature": 0},
        ),
    )


def _context(*, execution_id: str, run_id: str) -> HarnessContext:
    state = RunState()
    state.session_state.session_id = execution_id
    return HarnessContext(
        state=state,
        phase="bootstrap",
        event={"run_id": run_id},
    )


def _finish_graph(host, outputs=("collected", "final report")) -> None:
    runtime = host.bridge.preparation.host_factory.context_module.runtime
    for index, output in enumerate(outputs):
        step = host.plan.steps[index]
        host.register_step(index)
        context = _context(
            execution_id=host.plan.execution_id,
            run_id=step.attempt.attempt_id,
        )
        runtime.bind_context(context)
        GraphStepBootstrapHarness(
            runtime=runtime,
            binding_resolver=lambda supplied, _index=index: (
                GraphStepBootstrapBinding(
                    service=host.service,
                    plan=host.plan,
                    step_index=_index,
                )
            ),
        ).build_delta(context)
        prepared = host.bridge.attempt_for_run(step.attempt.attempt_id)
        prepared.bundle.durable_event_sink(
            {
                "type": "final_message",
                "run_id": step.attempt.attempt_id,
                "iteration": 1,
                "content": output,
            }
        )
        prepared.bundle.durable_event_sink(
            {
                "type": "run_completed",
                "run_id": step.attempt.attempt_id,
                "iteration": 1,
                "status": "completed",
            }
        )
        host.complete_step(index, full_output=output)


def _propose_from_step(host, index: int = 0):
    step = host.plan.steps[index]
    factory = host.bridge.preparation.host_factory
    attachment = factory.normal_attachment_factory.attach(
        MemoryAttachmentRequest(
            agent_name="graph-step",
            mode="graph",
            identity=ExecutionIdentity(
                execution_id=host.plan.execution_id,
                attempt_id=step.attempt.attempt_id,
                run_id=step.attempt.attempt_id,
                run_lineage=(
                    host.plan.orchestration_attempt.attempt_id,
                    step.attempt.attempt_id,
                ),
            ),
            grant=_memory_grant(completion_authority=False),
        )
    )
    final = next(
        event
        for event in factory.attempt(
            execution_id=host.plan.execution_id,
            attempt_id=step.attempt.attempt_id,
        ).bundle.journal.capture_snapshot().events
        if event.attempt == step.attempt and event.event_type == "final_message"
    )
    return attachment.capabilities.candidates.propose(
        request=CandidateProposalRequest(
            path="/graph/decision.md",
            description="Decision proposed by a canonical graph step",
            kind="markdown",
            content=b"Keep the canonical graph result.",
            media_type="text/markdown",
            url="",
            source_refs=(ResourceRef("context_event", final.event_id, 1),),
            rationale="Preserve a confirmed graph decision",
            confidence=0.9,
            sensitivity="normal",
            operation_id="graph-step-candidate",
        )
    )


def test_candidate_free_root_completion_is_model_free_and_restart_idempotent(
    tmp_path,
    monkeypatch,
) -> None:
    run = _run(
        execution_id="execution-graph-root-empty",
        attempt_id="graph-root-empty",
        content="build a report",
    )
    first_invoker = _NeverRunMemoryAgent()
    first_bridge = _active_bridge(
        tmp_path,
        monkeypatch,
        run=run,
        owner_chat_id="chat-graph-root-empty",
        invoker_factory=lambda codec: first_invoker,
    )
    first_host = prepare_pupu_unchain_graph_checkpoint_host(
        active_bridge=first_bridge,
        steps=_descriptors(),
    )
    _finish_graph(first_host)

    first = complete_pupu_unchain_graph_root(
        first_host,
        agent_name="Root graph",
    )
    replay = complete_pupu_unchain_graph_root(
        first_host,
        agent_name="Root graph",
    )

    assert first.memory.enqueue_disposition is EnqueueDisposition.NO_OP
    assert first.memory.candidate_count == 0
    assert (
        first.memory.worker_receipt.disposition
        is MemoryAgentWorkerDisposition.IDLE
    )
    assert first_invoker.calls == []
    assert replay.journal_replayed is True
    assert replay.final_cursor == first.final_cursor
    assert replay.terminal_cursor == first.terminal_cursor
    assert replay.memory.worker_receipt.replayed is True

    restarted_invoker = _NeverRunMemoryAgent()
    restarted_bridge = _active_bridge(
        tmp_path,
        monkeypatch,
        run=run,
        owner_chat_id="chat-graph-root-empty",
        invoker_factory=lambda codec: restarted_invoker,
    )
    restarted_host = prepare_pupu_unchain_graph_checkpoint_host(
        active_bridge=restarted_bridge,
        steps=_descriptors(),
    )
    restarted = complete_pupu_unchain_graph_root(
        restarted_host,
        agent_name="Root graph",
    )

    assert restarted.journal_replayed is True
    assert restarted.output_ref == first.output_ref
    assert restarted_invoker.calls == []
    root_events = tuple(
        event
        for event in restarted_host.coordinator.bundle.journal.capture_snapshot().events
        if event.attempt == restarted_host.plan.orchestration_attempt
    )
    assert sum(event.event_type == "final_message" for event in root_events) == 1
    assert sum(event.event_type == "run_completed" for event in root_events) == 1


def test_graph_step_candidate_is_aggregated_by_root_job_and_processed(
    tmp_path,
    monkeypatch,
) -> None:
    invokers = []

    def invoker_factory(codec):
        invoker = _ApplyMemoryAgent(codec)
        invokers.append(invoker)
        return invoker

    bridge = _active_bridge(
        tmp_path,
        monkeypatch,
        run=_run(
            execution_id="execution-graph-root-candidate",
            attempt_id="graph-root-candidate",
            content="keep the graph decision",
        ),
        owner_chat_id="chat-graph-root-candidate",
        invoker_factory=invoker_factory,
    )
    host = prepare_pupu_unchain_graph_checkpoint_host(
        active_bridge=bridge,
        steps=_descriptors(),
    )
    _finish_graph(host)
    candidate = _propose_from_step(host)

    receipt = complete_pupu_unchain_graph_root(
        host,
        agent_name="Root graph",
    )

    assert receipt.memory.enqueue_disposition is EnqueueDisposition.ENQUEUED
    assert receipt.memory.candidate_count == 1
    assert (
        receipt.memory.worker_receipt.disposition
        is MemoryAgentWorkerDisposition.PROCESSED
    )
    assert (
        receipt.memory.worker_receipt.process_disposition
        is ProcessDisposition.COMPLETED
    )
    assert receipt.memory.worker_failure_code == ""
    assert len(invokers) == 1 and len(invokers[0].calls) == 1
    request = invokers[0].calls[0][0]
    assert [item.candidate_ref for item in request.job.candidates] == [
        candidate.candidate_ref
    ]
    assert request.job.candidates[0].source_agent_run_id == (
        host.plan.steps[0].attempt.attempt_id
    )
    listing = bridge.preparation.host_factory.workspace.list(
        parent_path="/graph",
        recursive=True,
        limit=20,
    )
    assert [entry.path for entry in listing.entries] == [
        "/graph/decision.md"
    ]


def test_memory_model_failure_is_isolated_after_graph_and_root_journal_complete(
    tmp_path,
    monkeypatch,
) -> None:
    failing = _FailMemoryAgent()
    bridge = _active_bridge(
        tmp_path,
        monkeypatch,
        run=_run(
            execution_id="execution-graph-root-model-failure",
            attempt_id="graph-root-model-failure",
            content="finish even when curation fails",
        ),
        owner_chat_id="chat-graph-root-model-failure",
        invoker_factory=lambda codec: failing,
    )
    host = prepare_pupu_unchain_graph_checkpoint_host(
        active_bridge=bridge,
        steps=_descriptors(),
    )
    _finish_graph(host)
    _propose_from_step(host)

    receipt = complete_pupu_unchain_graph_root(
        host,
        agent_name="Root graph",
    )

    assert host.recover().is_complete is True
    assert receipt.memory.worker_failure_code == "memory_agent_process_failed"
    assert (
        receipt.memory.worker_receipt.process_disposition
        is ProcessDisposition.FAILED
    )
    assert len(failing.calls) == 1
    root_events = tuple(
        event
        for event in host.coordinator.bundle.journal.capture_snapshot().events
        if event.attempt == host.plan.orchestration_attempt
    )
    assert [
        event.event_type
        for event in root_events
        if event.event_type in {"final_message", "run_completed"}
    ] == ["final_message", "run_completed"]


def test_worker_hook_failure_is_content_free_and_does_not_undo_graph(
    tmp_path,
    monkeypatch,
) -> None:
    never = _NeverRunMemoryAgent()
    bridge = _active_bridge(
        tmp_path,
        monkeypatch,
        run=_run(
            execution_id="execution-graph-root-worker-failure",
            attempt_id="graph-root-worker-failure",
            content="finish before the worker wake",
        ),
        owner_chat_id="chat-graph-root-worker-failure",
        invoker_factory=lambda codec: never,
    )
    host = prepare_pupu_unchain_graph_checkpoint_host(
        active_bridge=bridge,
        steps=_descriptors(),
    )
    _finish_graph(host)

    def fail_worker(self, **kwargs):
        del self, kwargs
        raise RuntimeError("worker unavailable")

    monkeypatch.setattr(
        PupuUnchainMemoryAgentWorker,
        "process_next",
        fail_worker,
    )
    receipt = complete_pupu_unchain_graph_root(
        host,
        agent_name="Root graph",
    )

    assert host.recover().is_complete is True
    assert receipt.memory.worker_receipt is None
    assert (
        receipt.memory.worker_failure_code
        == "memory_agent_worker_hook_failed"
    )
    assert never.calls == []


def test_shadow_graph_is_rejected_before_root_terminal_or_memory_trigger(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    run = _run(
        execution_id="execution-shadow-graph-root",
        attempt_id="shadow-graph-root",
        content="shadow graph",
    )
    shadow = prepare_pupu_unchain_shadow_bridge(
        admission=SimpleNamespace(
            is_shadow=True,
            owner_chat_id="chat-shadow-graph-root",
        ),
        run=run,
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )
    host = prepare_pupu_unchain_graph_checkpoint_host(
        active_bridge=shadow,
        steps=_descriptors(),
    )

    with pytest.raises(
        PupuUnchainGraphRootCompletionError,
        match="requires_active_bridge",
    ):
        complete_pupu_unchain_graph_root(host, agent_name="Shadow graph")

    root_events = tuple(
        event
        for event in host.coordinator.bundle.journal.capture_snapshot().events
        if event.attempt == host.plan.orchestration_attempt
    )
    assert not any(
        event.event_type in {"final_message", "run_completed"}
        for event in root_events
    )
