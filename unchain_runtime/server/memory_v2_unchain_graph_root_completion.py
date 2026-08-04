"""Complete one active ROOT graph through Unchain's canonical Memory V2 seams.

The graph checkpoint core owns graph durability.  This PuPu host adapter only
bridges the already-complete graph coordinator into the ordinary ROOT terminal
attachment lifecycle.  It deliberately has no provider execution path and it
never accepts shadow, subagent, or graph-step coordinators.
"""

from __future__ import annotations

from dataclasses import dataclass

from memory_v2_unchain_active_bridge import PupuUnchainActiveBridge
from memory_v2_unchain_graph_checkpoint import (
    PupuUnchainGraphCheckpointHost,
)
from memory_v2_unchain_worker import (
    PupuMemoryAgentWorkerError,
    PupuMemoryAgentWorkerReceipt,
    PupuUnchainMemoryAgentWorker,
)
from unchain.agent.modules.memory_v2 import (
    MemoryV2AgentAttachment,
    MemoryV2AgentAttachmentRequest,
)
from unchain.context.projector import SemanticEventProjectionMode
from unchain.journal import EventCursor, JournalAppendResult, ResourceRef
from unchain.journal.models import _required_text, _sha256
from unchain.kernel.types import KernelRunResult
from unchain.memory.curator import (
    EnqueueDisposition,
    ProcessDisposition,
    RootRunCompletion,
    RunCaptureStatus,
    SourceRunStatus,
)
from unchain.memory.curator.host import (
    MemoryAgentEnqueueReceipt,
    MemoryAgentHostAdapter,
    MemoryAgentHostError,
    MemoryAgentWorkerDisposition,
)
from unchain.run_identity import MemoryV2RunRole


class PupuUnchainGraphRootCompletionError(RuntimeError):
    """A graph ROOT terminal could not cross the canonical host boundary."""

    def __init__(self, code: str) -> None:
        self.code = str(code or "graph_root_completion_failed")
        super().__init__(self.code)


@dataclass(frozen=True, slots=True)
class PupuUnchainGraphRootMemoryReceipt:
    """Content-free Memory Agent outcome for one graph ROOT completion."""

    enqueue_enabled: bool
    enqueue_reason: str
    enqueue_disposition: EnqueueDisposition | None = None
    job_id: str = ""
    job_revision: int = 0
    candidate_count: int = 0
    worker_receipt: PupuMemoryAgentWorkerReceipt | None = None
    worker_failure_code: str = ""

    def __post_init__(self) -> None:
        if type(self.enqueue_enabled) is not bool:
            raise TypeError("enqueue_enabled must be an exact boolean")
        object.__setattr__(
            self,
            "enqueue_reason",
            _required_text(
                self.enqueue_reason,
                "enqueue_reason",
                maximum=128,
                identifier=True,
            ),
        )
        disposition = self.enqueue_disposition
        if disposition is not None and not isinstance(
            disposition,
            EnqueueDisposition,
        ):
            try:
                disposition = EnqueueDisposition(disposition)
            except (TypeError, ValueError) as error:
                raise TypeError(
                    "enqueue_disposition must be an EnqueueDisposition"
                ) from error
            object.__setattr__(self, "enqueue_disposition", disposition)
        for field_name in ("job_revision", "candidate_count"):
            value = getattr(self, field_name)
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise ValueError(f"{field_name} must be a non-negative integer")
        if self.job_id:
            object.__setattr__(
                self,
                "job_id",
                _required_text(
                    self.job_id,
                    "job_id",
                    maximum=512,
                    identifier=True,
                ),
            )
        if self.worker_receipt is not None and type(
            self.worker_receipt
        ) is not PupuMemoryAgentWorkerReceipt:
            raise TypeError(
                "worker_receipt must be a PupuMemoryAgentWorkerReceipt"
            )
        if self.worker_failure_code:
            object.__setattr__(
                self,
                "worker_failure_code",
                _required_text(
                    self.worker_failure_code,
                    "worker_failure_code",
                    maximum=128,
                    identifier=True,
                ),
            )
        if not self.enqueue_enabled:
            if any(
                (
                    disposition is not None,
                    self.job_id,
                    self.job_revision,
                    self.candidate_count,
                )
            ):
                raise ValueError(
                    "disabled enqueue cannot contain a durable job projection"
                )
        elif disposition is None:
            raise ValueError("enabled enqueue requires an official disposition")
        if bool(self.job_id) != bool(self.job_revision):
            raise ValueError("job identity and revision must be projected together")
        if self.candidate_count and not self.job_id:
            raise ValueError("candidate count requires a durable job identity")


@dataclass(frozen=True, slots=True)
class PupuUnchainGraphRootCompletionReceipt:
    """Identifiers, refs, and statuses only; no graph or candidate content."""

    graph_plan_id: str
    graph_scope_id: str
    execution_id: str
    coordinator_attempt_id: str
    root_run_id: str
    output_ref: ResourceRef
    output_bytes: int
    output_sha256: str
    final_cursor: EventCursor
    terminal_cursor: EventCursor
    journal_replayed: bool
    completion_trigger_key: str
    memory: PupuUnchainGraphRootMemoryReceipt

    def __post_init__(self) -> None:
        for field_name in (
            "graph_plan_id",
            "graph_scope_id",
            "execution_id",
            "coordinator_attempt_id",
            "root_run_id",
            "completion_trigger_key",
        ):
            object.__setattr__(
                self,
                field_name,
                _required_text(
                    getattr(self, field_name),
                    field_name,
                    maximum=512,
                    identifier=True,
                ),
            )
        if not isinstance(self.output_ref, ResourceRef):
            object.__setattr__(
                self,
                "output_ref",
                ResourceRef.from_dict(self.output_ref),
            )
        if (
            isinstance(self.output_bytes, bool)
            or not isinstance(self.output_bytes, int)
            or self.output_bytes < 0
        ):
            raise ValueError("output_bytes must be a non-negative integer")
        object.__setattr__(
            self,
            "output_sha256",
            _sha256(self.output_sha256, "output_sha256"),
        )
        for field_name in ("final_cursor", "terminal_cursor"):
            value = getattr(self, field_name)
            if not isinstance(value, EventCursor):
                object.__setattr__(
                    self,
                    field_name,
                    EventCursor.from_dict(value),
                )
        if self.final_cursor.store_seq >= self.terminal_cursor.store_seq:
            raise ValueError("coordinator final message must precede its terminal")
        if type(self.journal_replayed) is not bool:
            raise TypeError("journal_replayed must be an exact boolean")
        if not isinstance(self.memory, PupuUnchainGraphRootMemoryReceipt):
            raise TypeError("memory must be a graph root memory receipt")


def _fail(code: str, cause: BaseException | None = None):
    error = PupuUnchainGraphRootCompletionError(code)
    if cause is None:
        raise error
    raise error from cause


def _validate_host(
    graph_host: PupuUnchainGraphCheckpointHost,
) -> tuple[PupuUnchainActiveBridge, object, object]:
    if type(graph_host) is not PupuUnchainGraphCheckpointHost:
        raise TypeError(
            "graph_host must be an exact PupuUnchainGraphCheckpointHost"
        )
    bridge = graph_host.bridge
    if type(bridge) is not PupuUnchainActiveBridge:
        _fail("graph_root_completion_requires_active_bridge")
    if graph_host.active_bridge is not bridge:
        _fail("graph_root_completion_bridge_identity_changed")
    preparation = bridge.preparation
    binding = preparation.binding
    factory = preparation.host_factory
    plan = graph_host.plan
    coordinator = graph_host.coordinator
    attempt = coordinator.bundle.attempt
    if binding.role is not MemoryV2RunRole.ROOT:
        _fail("graph_root_completion_requires_root_coordinator")
    if not factory.production_enabled or (
        factory.projection_mode is not SemanticEventProjectionMode.CANONICAL
    ):
        _fail("graph_root_completion_requires_canonical_production_host")
    if any(
        (
            binding.execution_id != bridge.execution_id,
            binding.session_id != binding.execution_id,
            binding.attempt_id != binding.run_id,
            binding.run_id != binding.root_run_id,
            factory.owner_chat_id != binding.owner_chat_id,
            factory.root_run_id != binding.root_run_id,
            plan.execution_id != binding.execution_id,
            plan.orchestration_attempt != attempt,
            attempt.generation.generation_id != binding.generation_id,
            attempt.attempt_id != binding.attempt_id,
            coordinator.bundle.durable_event_sink.attempt != attempt,
        )
    ):
        _fail("graph_root_completion_identity_changed")
    if factory.normal_attachment_factory.binding_id != factory.binding_id:
        _fail("graph_root_completion_attachment_binding_changed")
    memory_host = factory.memory_host
    memory_worker = factory.memory_worker
    if type(memory_host) is not MemoryAgentHostAdapter:
        _fail("graph_root_completion_memory_host_invalid")
    if type(memory_worker) is not PupuUnchainMemoryAgentWorker:
        _fail("graph_root_completion_memory_worker_invalid")
    if (
        memory_host.binding_id != factory.binding_id
        or memory_worker.host is not memory_host
        or memory_worker.host_binding_id != factory.binding_id
    ):
        _fail("graph_root_completion_memory_binding_changed")
    return bridge, binding, factory


def _append_root_terminal(
    graph_host: PupuUnchainGraphCheckpointHost,
    *,
    content: str,
) -> tuple[JournalAppendResult, JournalAppendResult]:
    attempt = graph_host.plan.orchestration_attempt
    sink = graph_host.coordinator.bundle.durable_event_sink
    iteration = len(graph_host.plan.steps)
    final = sink(
        {
            "type": "final_message",
            "run_id": attempt.attempt_id,
            "iteration": iteration,
            "content": content,
        }
    )
    terminal = sink(
        {
            "type": "run_completed",
            "run_id": attempt.attempt_id,
            "iteration": iteration,
            "status": "completed",
        }
    )
    if type(final) is not JournalAppendResult or type(
        terminal
    ) is not JournalAppendResult:
        _fail("graph_root_completion_journal_receipt_invalid")
    if any(
        (
            final.event.attempt != attempt,
            final.event.event_type != "final_message",
            final.event.payload.get("run_id") != attempt.attempt_id,
            final.event.payload.get("content") != content,
            terminal.event.attempt != attempt,
            terminal.event.event_type != "run_completed",
            terminal.event.payload.get("run_id") != attempt.attempt_id,
            terminal.event.payload.get("status") != "completed",
            final.cursor.store_seq >= terminal.cursor.store_seq,
        )
    ):
        _fail("graph_root_completion_journal_receipt_changed")
    return final, terminal


def _completion_from_attachment(
    *,
    factory: object,
    request: MemoryV2AgentAttachmentRequest,
    final_text: str,
) -> RootRunCompletion:
    attachment = factory.normal_attachment_factory.attach(request)
    if type(attachment) is not MemoryV2AgentAttachment:
        _fail("graph_root_completion_attachment_invalid")
    binding = attachment.binding
    if any(
        getattr(binding, field_name) != getattr(request, field_name)
        for field_name in ("session_id", "attempt_id", "run_id")
    ):
        _fail("graph_root_completion_attachment_identity_changed")
    completion_factory = attachment.completion_factory
    if completion_factory is None or not callable(
        getattr(completion_factory, "build", None)
    ):
        _fail("graph_root_completion_factory_unavailable")
    completion = completion_factory.build(
        result=KernelRunResult(
            messages=[{"role": "assistant", "content": final_text}],
            status="completed",
        )
    )
    if type(completion) is not RootRunCompletion:
        _fail("graph_root_completion_capture_invalid")
    if any(
        (
            completion.session_id != request.session_id,
            completion.attempt_id != request.attempt_id,
            completion.run_id != request.run_id,
            not completion.is_root_run,
            completion.run_status is not SourceRunStatus.COMPLETED,
            completion.capture_status is not RunCaptureStatus.COMPLETE,
        )
    ):
        _fail("graph_root_completion_capture_incomplete")
    return completion


def _worker_failure_code(error: Exception) -> str:
    if isinstance(error, PupuMemoryAgentWorkerError):
        return error.code
    if isinstance(error, MemoryAgentHostError):
        return "memory_agent_host_failed"
    return "memory_agent_worker_hook_failed"


def _receipt_failure_code(
    receipt: PupuMemoryAgentWorkerReceipt,
) -> str:
    if receipt.disposition is MemoryAgentWorkerDisposition.RECURSION_BLOCKED:
        return "memory_agent_worker_recursion_blocked"
    if receipt.process_disposition is ProcessDisposition.FAILED:
        return "memory_agent_process_failed"
    if receipt.process_disposition is ProcessDisposition.RETRY_SCHEDULED:
        return "memory_agent_process_pending_retry"
    if receipt.process_disposition is ProcessDisposition.LEASE_LOST:
        return "memory_agent_process_lease_lost"
    return ""


def _run_memory_completion(
    *,
    factory: object,
    owner_chat_id: str,
    root_run_id: str,
    completion: RootRunCompletion,
) -> PupuUnchainGraphRootMemoryReceipt:
    enqueue = factory.memory_host.enqueue_root_completion(completion)
    if type(enqueue) is not MemoryAgentEnqueueReceipt:
        _fail("graph_root_completion_enqueue_receipt_invalid")
    result = enqueue.result
    if enqueue.enabled:
        if result is None:
            _fail("graph_root_completion_enqueue_result_missing")
        disposition = result.disposition
        job = result.job
        if job is not None and job.trigger != completion:
            _fail("graph_root_completion_enqueue_identity_changed")
        if disposition in {
            EnqueueDisposition.ENQUEUED,
            EnqueueDisposition.REPLAYED,
        } and job is None:
            _fail("graph_root_completion_enqueue_job_missing")
        job_id = "" if job is None else job.job_id
        job_revision = 0 if job is None else job.revision
        candidate_count = 0 if job is None else len(job.candidates)
    else:
        if result is not None:
            _fail("graph_root_completion_disabled_enqueue_changed")
        disposition = None
        job_id = ""
        job_revision = 0
        candidate_count = 0

    worker_receipt = None
    worker_failure_code = ""
    try:
        worker_receipt = factory.memory_worker.process_next(
            owner_chat_id=owner_chat_id,
            root_run_id=root_run_id,
            job_trigger_key=completion.trigger_key,
        )
        if type(worker_receipt) is not PupuMemoryAgentWorkerReceipt:
            raise PupuMemoryAgentWorkerError(
                "memory_agent_worker_receipt_invalid"
            )
        if (
            worker_receipt.trigger.owner_chat_id != owner_chat_id
            or worker_receipt.trigger.root_run_id != root_run_id
            or worker_receipt.trigger.job_trigger_key != completion.trigger_key
        ):
            raise PupuMemoryAgentWorkerError(
                "memory_agent_worker_receipt_invalid"
            )
        worker_failure_code = _receipt_failure_code(worker_receipt)
    except Exception as error:
        worker_receipt = None
        worker_failure_code = _worker_failure_code(error)

    return PupuUnchainGraphRootMemoryReceipt(
        enqueue_enabled=enqueue.enabled,
        enqueue_reason=enqueue.reason,
        enqueue_disposition=disposition,
        job_id=job_id,
        job_revision=job_revision,
        candidate_count=candidate_count,
        worker_receipt=worker_receipt,
        worker_failure_code=worker_failure_code,
    )


def complete_pupu_unchain_graph_root(
    graph_host: PupuUnchainGraphCheckpointHost,
    *,
    agent_name: str,
    mode: str = "graph",
) -> PupuUnchainGraphRootCompletionReceipt:
    """Finalize an active graph and run the exact ROOT completion hooks once."""

    _, binding, factory = _validate_host(graph_host)
    agent_name = _required_text(agent_name, "agent_name", maximum=512)
    mode = _required_text(mode, "mode", maximum=128, identifier=True)

    try:
        recovery = graph_host.finalize()
        if recovery.plan != graph_host.plan or not recovery.is_complete:
            _fail("graph_root_completion_finalize_incomplete")
        final_completion = recovery.completed_steps[-1]
        if final_completion.step != graph_host.plan.steps[-1]:
            _fail("graph_root_completion_last_step_changed")
        canonical = graph_host.read_completed_output(
            len(graph_host.plan.steps) - 1
        )
    except PupuUnchainGraphRootCompletionError:
        raise
    except Exception as error:
        _fail("graph_root_completion_finalize_failed", error)

    if (
        not isinstance(canonical, dict)
        or set(canonical) != {"schema", "status", "output"}
        or canonical.get("schema") != "unchain.graph_step_output.v1"
        or canonical.get("status") != "completed"
        or not isinstance(canonical.get("output"), str)
    ):
        _fail("graph_root_completion_output_invalid")
    final_text = canonical["output"]
    try:
        final_append, terminal_append = _append_root_terminal(
            graph_host,
            content=final_text,
        )
    except PupuUnchainGraphRootCompletionError:
        raise
    except Exception as error:
        _fail("graph_root_completion_journal_failed", error)

    request = MemoryV2AgentAttachmentRequest(
        agent_name=agent_name,
        mode=mode,
        session_id=binding.session_id,
        attempt_id=binding.attempt_id,
        run_id=binding.run_id,
        role=MemoryV2RunRole.ROOT,
        root_run_id=binding.root_run_id,
    )
    try:
        completion = _completion_from_attachment(
            factory=factory,
            request=request,
            final_text=final_text,
        )
    except PupuUnchainGraphRootCompletionError:
        raise
    except Exception as error:
        _fail("graph_root_completion_capture_failed", error)

    memory = _run_memory_completion(
        factory=factory,
        owner_chat_id=binding.owner_chat_id,
        root_run_id=binding.root_run_id,
        completion=completion,
    )
    output_artifact = final_completion.output_artifact
    return PupuUnchainGraphRootCompletionReceipt(
        graph_plan_id=graph_host.plan.plan_id,
        graph_scope_id=graph_host.plan.scope_id,
        execution_id=binding.execution_id,
        coordinator_attempt_id=binding.attempt_id,
        root_run_id=binding.root_run_id,
        output_ref=output_artifact.ref,
        output_bytes=output_artifact.byte_length,
        output_sha256=output_artifact.sha256,
        final_cursor=final_append.cursor,
        terminal_cursor=terminal_append.cursor,
        journal_replayed=(final_append.duplicate and terminal_append.duplicate),
        completion_trigger_key=completion.trigger_key,
        memory=memory,
    )


__all__ = [
    "PupuUnchainGraphRootCompletionError",
    "PupuUnchainGraphRootCompletionReceipt",
    "PupuUnchainGraphRootMemoryReceipt",
    "complete_pupu_unchain_graph_root",
]
