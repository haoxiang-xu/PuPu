from __future__ import annotations

import pytest

from memory_v2_unchain_root_completion import (
    PupuMemoryV2JournalCapture,
    PupuMemoryV2RootCompletionFactory,
    build_pupu_memory_v2_root_completion_resolver,
)
from unchain.agent.modules.memory_v2 import (
    MemoryV2AgentAttachmentRequest,
    MemoryV2RunRole,
)
from unchain.journal import (
    AttemptRef,
    GenerationRef,
    JournalEvent,
    OperationRef,
    capture_journal_snapshot,
)
from unchain.kernel.types import KernelRunResult
from unchain.memory.curator import RunCaptureStatus, SourceRunStatus


SHA = "a" * 64


def _request(
    role: MemoryV2RunRole = MemoryV2RunRole.ROOT,
) -> MemoryV2AgentAttachmentRequest:
    run_id = "root-run" if role is MemoryV2RunRole.ROOT else f"{role.value}-run"
    return MemoryV2AgentAttachmentRequest(
        agent_name="test-agent",
        mode="run",
        session_id="session-a",
        attempt_id=run_id,
        run_id=run_id,
        role=role,
        root_run_id="root-run",
    )


def _event(
    event_type: str,
    store_seq: int,
    *,
    request: MemoryV2AgentAttachmentRequest | None = None,
    **payload,
) -> JournalEvent:
    bound = request or _request()
    return JournalEvent(
        event_id=f"event-{store_seq}",
        event_type=event_type,
        attempt=AttemptRef(
            GenerationRef("execution-a", "generation-a"),
            bound.attempt_id,
        ),
        operation=OperationRef(f"operation-{store_seq}", SHA),
        store_seq=store_seq,
        payload={"run_id": bound.run_id, **payload},
    )


def _snapshot(*events: JournalEvent):
    return capture_journal_snapshot(
        execution_id="execution-a",
        events=events,
    )


def _result(status: str, content: str = "final answer") -> KernelRunResult:
    return KernelRunResult(
        messages=[{"role": "assistant", "content": content}],
        status=status,
    )


def test_resolver_grants_only_root_and_defers_capture_until_build() -> None:
    captures = []

    def capture(request):
        captures.append(request)
        return None

    resolver = build_pupu_memory_v2_root_completion_resolver(
        capture_journal=capture,
    )
    root = resolver.resolve(_request())

    assert isinstance(root, PupuMemoryV2RootCompletionFactory)
    assert resolver.resolve(_request(MemoryV2RunRole.SUBAGENT)) is None
    assert resolver.resolve(_request(MemoryV2RunRole.GRAPH_STEP)) is None
    assert captures == []


def test_completed_result_requires_exact_canonical_final_and_terminal() -> None:
    request = _request()
    snapshot = _snapshot(
        _event("run_started", 1, request=request),
        _event("final_message", 2, request=request, content="final answer"),
        _event("run_completed", 3, request=request, status="completed"),
    )
    factory = build_pupu_memory_v2_root_completion_resolver(
        capture_journal=lambda bound: snapshot,
    ).resolve(request)

    completion = factory.build(result=_result("completed"))

    assert completion.session_id == request.session_id
    assert completion.attempt_id == request.attempt_id
    assert completion.run_id == request.run_id
    assert completion.is_root_run is True
    assert completion.run_status is SourceRunStatus.COMPLETED
    assert completion.capture_status is RunCaptureStatus.COMPLETE


@pytest.mark.parametrize(
    "events",
    [
        (
            _event("run_started", 1),
            _event("run_completed", 2, status="completed"),
        ),
        (
            _event("final_message", 1, content="stale answer"),
            _event("run_completed", 2, status="completed"),
        ),
        (
            _event("final_message", 1, content="final answer"),
            _event("run_failed", 2, status="failed"),
        ),
    ],
)
def test_missing_or_divergent_final_never_manufactures_complete(events) -> None:
    snapshot = _snapshot(*events)
    factory = build_pupu_memory_v2_root_completion_resolver(
        capture_journal=lambda _request: snapshot,
    ).resolve(_request())

    completion = factory.build(result=_result("completed"))

    assert completion.run_status is SourceRunStatus.COMPLETED
    assert completion.capture_status is RunCaptureStatus.UNAVAILABLE


def test_explicit_partial_capture_stays_partial_even_with_a_valid_prefix() -> None:
    snapshot = _snapshot(
        _event("final_message", 1, content="final answer"),
        _event("run_completed", 2, status="completed"),
    )
    factory = build_pupu_memory_v2_root_completion_resolver(
        capture_journal=lambda _request: PupuMemoryV2JournalCapture.partial(
            snapshot
        ),
    ).resolve(_request())

    completion = factory.build(result=_result("completed"))

    assert completion.run_status is SourceRunStatus.COMPLETED
    assert completion.capture_status is RunCaptureStatus.PARTIAL


@pytest.mark.parametrize("status", ["cancelled", "canceled", "aborted"])
def test_cancelled_status_maps_exactly_with_canonical_terminal(status: str) -> None:
    terminal = "run_aborted" if status == "aborted" else f"run_{status}"
    snapshot = _snapshot(_event(terminal, 1, status=status))
    factory = build_pupu_memory_v2_root_completion_resolver(
        capture_journal=lambda _request: snapshot,
    ).resolve(_request())

    completion = factory.build(result=_result(status))

    assert completion.run_status is SourceRunStatus.CANCELLED
    assert completion.capture_status is RunCaptureStatus.COMPLETE


@pytest.mark.parametrize(
    ("status", "terminal"),
    [("failed", "run_failed"), ("error", "run_failed"), ("max_iterations", "run_max_iterations")],
)
def test_failed_status_maps_exactly_with_canonical_terminal(
    status: str,
    terminal: str,
) -> None:
    snapshot = _snapshot(_event(terminal, 1, status=status))
    factory = build_pupu_memory_v2_root_completion_resolver(
        capture_journal=lambda _request: snapshot,
    ).resolve(_request())

    completion = factory.build(result=_result(status))

    assert completion.run_status is SourceRunStatus.FAILED
    assert completion.capture_status is RunCaptureStatus.COMPLETE


@pytest.mark.parametrize(
    "status",
    ["awaiting_human_input", "awaiting_interaction", "running", "unknown"],
)
def test_nonterminal_result_does_not_enqueue_a_root_completion(status: str) -> None:
    calls = []
    factory = build_pupu_memory_v2_root_completion_resolver(
        capture_journal=lambda request: calls.append(request),
    ).resolve(_request())

    assert factory.build(result=_result(status)) is None
    assert calls == []


def test_capture_failure_maps_to_unavailable_without_changing_run_identity() -> None:
    def unavailable(_request):
        raise RuntimeError("journal temporarily unavailable")

    request = _request()
    factory = build_pupu_memory_v2_root_completion_resolver(
        capture_journal=unavailable,
    ).resolve(request)

    completion = factory.build(result=_result("completed"))

    assert completion.session_id == request.session_id
    assert completion.attempt_id == request.attempt_id
    assert completion.run_id == request.run_id
    assert completion.run_status is SourceRunStatus.COMPLETED
    assert completion.capture_status is RunCaptureStatus.UNAVAILABLE


def test_complete_capture_record_requires_a_snapshot() -> None:
    with pytest.raises(ValueError, match="canonical snapshot"):
        PupuMemoryV2JournalCapture(RunCaptureStatus.COMPLETE)
