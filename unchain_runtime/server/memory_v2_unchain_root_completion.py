"""PuPu host projection from a kernel terminal result to Memory V2 curation.

The official Unchain Memory V2 module deliberately leaves product-specific
terminal capture policy to its host.  This adapter binds that policy to one
``MemoryV2AgentAttachmentRequest`` and proves capture completeness from an
integrity-checked canonical journal snapshot before it ever reports
``RunCaptureStatus.COMPLETE``.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from unchain.agent.modules.memory_v2 import (
    MemoryV2AgentAttachmentRequest,
    MemoryV2RootCompletionFactory,
    MemoryV2RunRole,
)
from unchain.journal import JournalSnapshot
from unchain.kernel.types import KernelRunResult
from unchain.memory.curator import (
    RootRunCompletion,
    RunCaptureStatus,
    SourceRunStatus,
)


class PupuMemoryV2RootCompletionError(RuntimeError):
    """The host supplied an invalid root-completion binding."""


@dataclass(frozen=True, slots=True)
class PupuMemoryV2JournalCapture:
    """Result of one bounded canonical-journal capture attempt.

    A raw ``JournalSnapshot`` returned by the callback is shorthand for this
    record with ``status=COMPLETE``.  ``PARTIAL`` and ``UNAVAILABLE`` are
    explicit so the host can preserve a known durability failure without
    manufacturing a complete capture from an incomplete prefix.
    """

    status: RunCaptureStatus
    snapshot: JournalSnapshot | None = None

    def __post_init__(self) -> None:
        status = self.status
        if not isinstance(status, RunCaptureStatus):
            try:
                status = RunCaptureStatus(status)
            except (TypeError, ValueError) as error:
                raise TypeError("status must be a RunCaptureStatus") from error
            object.__setattr__(self, "status", status)
        if self.snapshot is not None and not isinstance(
            self.snapshot,
            JournalSnapshot,
        ):
            raise TypeError("snapshot must be a JournalSnapshot")
        if status is RunCaptureStatus.COMPLETE and self.snapshot is None:
            raise ValueError("complete capture requires a canonical snapshot")

    @classmethod
    def complete(
        cls,
        snapshot: JournalSnapshot,
    ) -> "PupuMemoryV2JournalCapture":
        return cls(RunCaptureStatus.COMPLETE, snapshot)

    @classmethod
    def partial(
        cls,
        snapshot: JournalSnapshot | None = None,
    ) -> "PupuMemoryV2JournalCapture":
        return cls(RunCaptureStatus.PARTIAL, snapshot)

    @classmethod
    def unavailable(cls) -> "PupuMemoryV2JournalCapture":
        return cls(RunCaptureStatus.UNAVAILABLE)


PupuMemoryV2JournalCaptureResult = (
    JournalSnapshot | PupuMemoryV2JournalCapture | None
)
PupuMemoryV2JournalCaptureCallback = Callable[
    [MemoryV2AgentAttachmentRequest],
    PupuMemoryV2JournalCaptureResult,
]


_SUSPENDED_STATUSES = frozenset(
    {
        "awaiting_human_input",
        "awaiting_interaction",
        "paused",
        "running",
        "suspended",
    }
)
_CANCELLED_STATUSES = frozenset(
    {"aborted", "canceled", "cancelled"}
)
_FAILED_STATUSES = frozenset(
    {
        "error",
        "errored",
        "failed",
        "max_iterations",
        "partial",
    }
)
_TERMINAL_EVENT_TYPES = frozenset(
    {
        "run_completed",
        "run.completed",
        "run_failed",
        "run.failed",
        "run_cancelled",
        "run.cancelled",
        "run_canceled",
        "run.canceled",
        "run_aborted",
        "run.aborted",
        "run_max_iterations",
        "run.max_iterations",
    }
)
_COMPLETED_TERMINALS = frozenset({"run_completed", "run.completed"})
_FAILED_TERMINALS = frozenset(
    {
        "run_failed",
        "run.failed",
        "run_max_iterations",
        "run.max_iterations",
    }
)
_CANCELLED_TERMINALS = frozenset(
    {
        "run_cancelled",
        "run.cancelled",
        "run_canceled",
        "run.canceled",
        "run_aborted",
        "run.aborted",
    }
)


def _source_run_status(status: object) -> SourceRunStatus | None:
    normalized = str(status or "").strip().casefold()
    if normalized == "completed":
        return SourceRunStatus.COMPLETED
    if normalized in _CANCELLED_STATUSES:
        return SourceRunStatus.CANCELLED
    if normalized in _FAILED_STATUSES:
        return SourceRunStatus.FAILED
    if normalized in _SUSPENDED_STATUSES or not normalized:
        return None
    return None


def _last_assistant_text(result: KernelRunResult) -> str:
    for message in reversed(result.messages or []):
        if not isinstance(message, dict) or message.get("role") != "assistant":
            continue
        content = message.get("content")
        if isinstance(content, str):
            return content
    return ""


def _events_for_request(
    snapshot: JournalSnapshot,
    request: MemoryV2AgentAttachmentRequest,
):
    return tuple(
        event
        for event in snapshot.events
        if event.attempt.attempt_id == request.attempt_id
        and str(event.payload.get("run_id") or "").strip() == request.run_id
    )


def _capture_has_terminal_proof(
    *,
    snapshot: JournalSnapshot,
    request: MemoryV2AgentAttachmentRequest,
    result: KernelRunResult,
    run_status: SourceRunStatus,
) -> bool:
    events = _events_for_request(snapshot, request)
    terminals = tuple(
        event for event in events if event.event_type in _TERMINAL_EVENT_TYPES
    )
    if not terminals:
        return False
    terminal = terminals[-1]

    if run_status is SourceRunStatus.COMPLETED:
        if terminal.event_type not in _COMPLETED_TERMINALS:
            return False
        if str(terminal.payload.get("status") or "").strip().casefold() != "completed":
            return False
        prior_terminal_seq = max(
            (
                event.store_seq
                for event in terminals[:-1]
            ),
            default=0,
        )
        expected_content = _last_assistant_text(result)
        return any(
            event.event_type == "final_message"
            and prior_terminal_seq < event.store_seq < terminal.store_seq
            and isinstance(event.payload.get("content"), str)
            and event.payload.get("content") == expected_content
            for event in events
        )

    if run_status is SourceRunStatus.CANCELLED:
        return terminal.event_type in _CANCELLED_TERMINALS

    if run_status is SourceRunStatus.FAILED:
        return terminal.event_type in _FAILED_TERMINALS

    return False


def _capture_status(
    *,
    capture: PupuMemoryV2JournalCaptureResult,
    request: MemoryV2AgentAttachmentRequest,
    result: KernelRunResult,
    run_status: SourceRunStatus,
) -> RunCaptureStatus:
    if isinstance(capture, JournalSnapshot):
        evidence = PupuMemoryV2JournalCapture.complete(capture)
    elif isinstance(capture, PupuMemoryV2JournalCapture):
        evidence = capture
    else:
        return RunCaptureStatus.UNAVAILABLE

    if evidence.status is not RunCaptureStatus.COMPLETE:
        return evidence.status
    snapshot = evidence.snapshot
    if snapshot is None or not _capture_has_terminal_proof(
        snapshot=snapshot,
        request=request,
        result=result,
        run_status=run_status,
    ):
        return RunCaptureStatus.UNAVAILABLE
    return RunCaptureStatus.COMPLETE


@dataclass(frozen=True, slots=True)
class PupuMemoryV2RootCompletionFactory(MemoryV2RootCompletionFactory):
    """Build terminal curation evidence for one immutable root attachment."""

    request: MemoryV2AgentAttachmentRequest
    capture_journal: PupuMemoryV2JournalCaptureCallback = field(repr=False)

    def __post_init__(self) -> None:
        if not isinstance(self.request, MemoryV2AgentAttachmentRequest):
            raise TypeError("request must be a MemoryV2AgentAttachmentRequest")
        if self.request.role is not MemoryV2RunRole.ROOT:
            raise ValueError("root completion factory requires a root request")
        if not callable(self.capture_journal):
            raise TypeError("capture_journal must be callable")

    def build(self, *, result: KernelRunResult) -> RootRunCompletion | None:
        if not isinstance(result, KernelRunResult):
            raise TypeError("result must be a KernelRunResult")
        run_status = _source_run_status(result.status)
        if run_status is None:
            return None
        try:
            capture = self.capture_journal(self.request)
        except Exception:
            capture = None
        return RootRunCompletion(
            session_id=self.request.session_id,
            attempt_id=self.request.attempt_id,
            run_id=self.request.run_id,
            is_root_run=True,
            run_status=run_status,
            capture_status=_capture_status(
                capture=capture,
                request=self.request,
                result=result,
                run_status=run_status,
            ),
        )


@dataclass(frozen=True, slots=True)
class PupuMemoryV2RootCompletionFactoryResolver:
    """Resolver API that runtime factories can inject into the SQLite host."""

    capture_journal: PupuMemoryV2JournalCaptureCallback = field(repr=False)

    def __post_init__(self) -> None:
        if not callable(self.capture_journal):
            raise TypeError("capture_journal must be callable")

    def resolve(
        self,
        request: MemoryV2AgentAttachmentRequest,
    ) -> MemoryV2RootCompletionFactory | None:
        if not isinstance(request, MemoryV2AgentAttachmentRequest):
            raise TypeError("request must be a MemoryV2AgentAttachmentRequest")
        if request.role is not MemoryV2RunRole.ROOT:
            return None
        return PupuMemoryV2RootCompletionFactory(
            request=request,
            capture_journal=self.capture_journal,
        )


def build_pupu_memory_v2_root_completion_resolver(
    *,
    capture_journal: PupuMemoryV2JournalCaptureCallback,
) -> PupuMemoryV2RootCompletionFactoryResolver:
    """Create the host-owned resolver accepted by the official attachment factory."""

    return PupuMemoryV2RootCompletionFactoryResolver(
        capture_journal=capture_journal,
    )


__all__ = [
    "PupuMemoryV2JournalCapture",
    "PupuMemoryV2JournalCaptureCallback",
    "PupuMemoryV2JournalCaptureResult",
    "PupuMemoryV2RootCompletionError",
    "PupuMemoryV2RootCompletionFactory",
    "PupuMemoryV2RootCompletionFactoryResolver",
    "build_pupu_memory_v2_root_completion_resolver",
]
