"""Content-free PuPu worker entry for the official Unchain Memory Agent host.

The official host owns durable job claiming, leases, toolkit construction, and
model execution.  This adapter adds only the product-host wake identity: it
derives a stable claim operation ID from the owner/root-run trigger and
projects the official receipt into identifiers and statuses.  No candidate,
workspace, model, or tool payload crosses this boundary.
"""

from __future__ import annotations

import hashlib
import threading
from dataclasses import dataclass, replace

from unchain.agent.modules.memory_v2 import MemoryV2AgentModule
from unchain.journal.models import ModelValidationError, _required_text
from unchain.kernel.types import KernelRunResult
from unchain.memory.curator.host import (
    MemoryAgentHostAdapter,
    MemoryAgentHostError,
    MemoryAgentWorkerDisposition,
    MemoryAgentWorkerReceipt,
)
from unchain.memory.curator.models import (
    ProcessDisposition,
    RootRunCompletion,
    RunCaptureStatus,
    SourceRunStatus,
)
from unchain.run_identity import MemoryV2RunRole


_ROOT_TRIGGER_PREFIX = "completed_root_run:"
_NORMAL_MEMORY_TOOLS = frozenset(
    {"memory_list", "memory_search", "memory_read", "memory_propose"}
)
_MODULE_MARKER = "_pupu_memory_agent_worker_module_binding"


class PupuMemoryAgentWorkerError(RuntimeError):
    """Stable failure at the PuPu-to-official-host worker boundary."""

    def __init__(self, code: str) -> None:
        self.code = str(code or "memory_agent_worker_failed")
        super().__init__(self.code)


def _identifier(value: object, field_name: str, *, maximum: int = 512) -> str:
    return _required_text(
        value,
        field_name,
        maximum=maximum,
        identifier=True,
    )


def _positive_revision(value: object, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ModelValidationError(f"{field_name} must be a positive integer")
    return value


@dataclass(frozen=True, slots=True)
class PupuMemoryAgentWorkerTrigger:
    """One root-run wake identity supplied by the PuPu host lifecycle."""

    owner_chat_id: str
    root_run_id: str
    job_trigger_key: str

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "owner_chat_id",
            _identifier(self.owner_chat_id, "owner_chat_id"),
        )
        object.__setattr__(
            self,
            "root_run_id",
            _identifier(self.root_run_id, "root_run_id"),
        )
        trigger_key = _identifier(
            self.job_trigger_key,
            "job_trigger_key",
        )
        digest = trigger_key.removeprefix(_ROOT_TRIGGER_PREFIX)
        if (
            not trigger_key.startswith(_ROOT_TRIGGER_PREFIX)
            or len(digest) != 64
            or any(character not in "0123456789abcdef" for character in digest)
        ):
            raise ModelValidationError(
                "job_trigger_key must be an official root completion trigger"
            )
        object.__setattr__(self, "job_trigger_key", trigger_key)


@dataclass(frozen=True, slots=True)
class PupuMemoryAgentWorkerReceipt:
    """Typed worker outcome containing identifiers and status only."""

    trigger: PupuMemoryAgentWorkerTrigger
    host_binding_id: str
    operation_id: str
    disposition: MemoryAgentWorkerDisposition
    reason: str
    claimed_job_id: str = ""
    claimed_job_revision: int = 0
    result_job_revision: int = 0
    claimed_root_run_id: str = ""
    claimed_trigger_key: str = ""
    process_disposition: ProcessDisposition | None = None
    process_reason: str = ""
    replayed: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.trigger, PupuMemoryAgentWorkerTrigger):
            raise TypeError("trigger must be a PupuMemoryAgentWorkerTrigger")
        object.__setattr__(
            self,
            "host_binding_id",
            _identifier(self.host_binding_id, "host_binding_id"),
        )
        object.__setattr__(
            self,
            "operation_id",
            _identifier(self.operation_id, "operation_id", maximum=256),
        )
        try:
            disposition = MemoryAgentWorkerDisposition(self.disposition)
        except (TypeError, ValueError) as error:
            raise ModelValidationError("invalid worker disposition") from error
        object.__setattr__(self, "disposition", disposition)
        object.__setattr__(
            self,
            "reason",
            _identifier(self.reason, "reason", maximum=128),
        )
        if not isinstance(self.replayed, bool):
            raise TypeError("replayed must be a boolean")

        if disposition is MemoryAgentWorkerDisposition.PROCESSED:
            for field_name in (
                "claimed_job_id",
                "claimed_root_run_id",
                "claimed_trigger_key",
                "process_reason",
            ):
                object.__setattr__(
                    self,
                    field_name,
                    _identifier(
                        getattr(self, field_name),
                        field_name,
                        maximum=512,
                    ),
                )
            object.__setattr__(
                self,
                "claimed_job_revision",
                _positive_revision(
                    self.claimed_job_revision,
                    "claimed_job_revision",
                ),
            )
            object.__setattr__(
                self,
                "result_job_revision",
                _positive_revision(
                    self.result_job_revision,
                    "result_job_revision",
                ),
            )
            try:
                process_disposition = ProcessDisposition(
                    self.process_disposition
                )
            except (TypeError, ValueError) as error:
                raise ModelValidationError(
                    "invalid process disposition"
                ) from error
            object.__setattr__(
                self,
                "process_disposition",
                process_disposition,
            )
            return

        if any(
            (
                self.claimed_job_id,
                self.claimed_job_revision,
                self.result_job_revision,
                self.claimed_root_run_id,
                self.claimed_trigger_key,
                self.process_disposition is not None,
                self.process_reason,
            )
        ):
            raise ModelValidationError(
                "non-processed worker receipt cannot contain job state"
            )


def _worker_operation_id(
    *,
    host_binding_id: str,
    trigger: PupuMemoryAgentWorkerTrigger,
) -> str:
    identity = "\0".join(
        (
            "pupu.memory_v2.memory_agent_worker.v1",
            host_binding_id,
            trigger.owner_chat_id,
            trigger.root_run_id,
            trigger.job_trigger_key,
        )
    )
    return "pupu-memory-agent-worker-" + hashlib.sha256(
        identity.encode("utf-8")
    ).hexdigest()


def _project_official_receipt(
    *,
    trigger: PupuMemoryAgentWorkerTrigger,
    host_binding_id: str,
    operation_id: str,
    receipt: MemoryAgentWorkerReceipt,
) -> PupuMemoryAgentWorkerReceipt:
    if not isinstance(receipt, MemoryAgentWorkerReceipt):
        raise PupuMemoryAgentWorkerError(
            "memory_agent_worker_receipt_invalid"
        )
    disposition = receipt.disposition
    if disposition is not MemoryAgentWorkerDisposition.PROCESSED:
        if receipt.claimed_job is not None or receipt.result is not None:
            raise PupuMemoryAgentWorkerError(
                "memory_agent_worker_receipt_invalid"
            )
        return PupuMemoryAgentWorkerReceipt(
            trigger=trigger,
            host_binding_id=host_binding_id,
            operation_id=operation_id,
            disposition=disposition,
            reason=receipt.reason,
        )

    claimed = receipt.claimed_job
    result = receipt.result
    if claimed is None or result is None:
        raise PupuMemoryAgentWorkerError(
            "memory_agent_worker_receipt_invalid"
        )
    result_job = getattr(result, "job", None)
    claimed_job_id = getattr(claimed, "job_id", None)
    if (
        result_job is None
        or getattr(result_job, "job_id", None) != claimed_job_id
    ):
        raise PupuMemoryAgentWorkerError(
            "memory_agent_worker_receipt_invalid"
        )
    claimed_trigger = getattr(claimed, "trigger", None)
    try:
        return PupuMemoryAgentWorkerReceipt(
            trigger=trigger,
            host_binding_id=host_binding_id,
            operation_id=operation_id,
            disposition=disposition,
            reason=receipt.reason,
            claimed_job_id=claimed_job_id,
            claimed_job_revision=getattr(claimed, "revision", None),
            result_job_revision=getattr(result_job, "revision", None),
            claimed_root_run_id=getattr(claimed_trigger, "run_id", None),
            claimed_trigger_key=getattr(
                claimed_trigger,
                "trigger_key",
                None,
            ),
            process_disposition=getattr(result, "disposition", None),
            process_reason=getattr(result, "reason", None),
        )
    except (ModelValidationError, TypeError, ValueError) as error:
        raise PupuMemoryAgentWorkerError(
            "memory_agent_worker_receipt_invalid"
        ) from error


class PupuUnchainMemoryAgentWorker:
    """Serialize and deduplicate root-run wakes for one official host."""

    def __init__(self, host: MemoryAgentHostAdapter) -> None:
        if not isinstance(host, MemoryAgentHostAdapter):
            raise TypeError("host must be a MemoryAgentHostAdapter")
        self._host = host
        self._host_binding_id = _identifier(
            host.binding_id,
            "host_binding_id",
        )
        self._lock = threading.RLock()
        self._receipts: dict[str, PupuMemoryAgentWorkerReceipt] = {}

    @property
    def host_binding_id(self) -> str:
        return self._host_binding_id

    @property
    def host(self) -> MemoryAgentHostAdapter:
        return self._host

    def process_next(
        self,
        *,
        owner_chat_id: str,
        root_run_id: str,
        job_trigger_key: str,
    ) -> PupuMemoryAgentWorkerReceipt:
        """Process at most one official job for one stable root-run wake."""

        trigger = PupuMemoryAgentWorkerTrigger(
            owner_chat_id=owner_chat_id,
            root_run_id=root_run_id,
            job_trigger_key=job_trigger_key,
        )
        operation_id = _worker_operation_id(
            host_binding_id=self.host_binding_id,
            trigger=trigger,
        )
        with self._lock:
            cached = self._receipts.get(operation_id)
            if cached is not None:
                return replace(cached, replayed=True)
            if self._host.binding_id != self.host_binding_id:
                raise PupuMemoryAgentWorkerError(
                    "memory_agent_worker_host_binding_changed"
                )
            official = self._host.process_next(operation_id=operation_id)
            projected = _project_official_receipt(
                trigger=trigger,
                host_binding_id=self.host_binding_id,
                operation_id=operation_id,
                receipt=official,
            )
            self._receipts[operation_id] = projected
            return projected


class PupuMemoryAgentWorkerModule:
    """Second root-run hook mounted after the official Memory V2 module."""

    name = "pupu_memory_agent_worker"

    def __init__(
        self,
        *,
        memory_module: MemoryV2AgentModule,
        worker: PupuUnchainMemoryAgentWorker,
        owner_chat_id: str,
    ) -> None:
        if not isinstance(memory_module, MemoryV2AgentModule):
            raise TypeError("memory_module must be a MemoryV2AgentModule")
        if not isinstance(worker, PupuUnchainMemoryAgentWorker):
            raise TypeError("worker must be a PupuUnchainMemoryAgentWorker")
        if memory_module.host is not worker.host:
            raise PupuMemoryAgentWorkerError(
                "memory_agent_worker_host_binding_mismatch"
            )
        if memory_module.host is None or (
            memory_module.host.binding_id != worker.host_binding_id
        ):
            raise PupuMemoryAgentWorkerError(
                "memory_agent_worker_host_binding_mismatch"
            )
        self._memory_module = memory_module
        self._worker = worker
        self._owner_chat_id = _identifier(
            owner_chat_id,
            "owner_chat_id",
        )
        self._state_lock = threading.RLock()
        self._last_receipt: PupuMemoryAgentWorkerReceipt | None = None
        self._last_failure_code = ""

    @property
    def last_receipt(self) -> PupuMemoryAgentWorkerReceipt | None:
        with self._state_lock:
            return self._last_receipt

    @property
    def last_failure_code(self) -> str:
        with self._state_lock:
            return self._last_failure_code

    def _record_receipt(self, receipt: PupuMemoryAgentWorkerReceipt) -> None:
        failure_code = ""
        if (
            receipt.disposition
            is MemoryAgentWorkerDisposition.RECURSION_BLOCKED
        ):
            failure_code = "memory_agent_worker_recursion_blocked"
        elif receipt.process_disposition is ProcessDisposition.FAILED:
            failure_code = "memory_agent_process_failed"
        elif receipt.process_disposition is ProcessDisposition.RETRY_SCHEDULED:
            failure_code = "memory_agent_process_pending_retry"
        elif receipt.process_disposition is ProcessDisposition.LEASE_LOST:
            failure_code = "memory_agent_process_lease_lost"
        with self._state_lock:
            self._last_receipt = receipt
            self._last_failure_code = failure_code

    def _record_failure(self, error: Exception) -> None:
        if isinstance(error, PupuMemoryAgentWorkerError):
            code = error.code
        elif isinstance(error, MemoryAgentHostError):
            code = "memory_agent_host_failed"
        else:
            code = "memory_agent_worker_hook_failed"
        with self._state_lock:
            self._last_receipt = None
            self._last_failure_code = code

    def configure(self, builder) -> None:
        existing_binding = getattr(builder, _MODULE_MARKER, "")
        if existing_binding:
            code = (
                "memory_agent_worker_module_duplicate"
                if existing_binding == self._worker.host_binding_id
                else "memory_agent_worker_host_binding_mismatch"
            )
            raise PupuMemoryAgentWorkerError(code)
        setattr(builder, _MODULE_MARKER, self._worker.host_binding_id)

        call_context = getattr(builder, "call_context", None)
        if (
            getattr(call_context, "memory_v2_run_role", None)
            is not MemoryV2RunRole.ROOT
        ):
            return
        configured_tools = getattr(
            getattr(builder, "toolkit", None),
            "tools",
            {},
        )
        if (
            not _NORMAL_MEMORY_TOOLS.issubset(configured_tools)
            or not getattr(builder, "run_hooks", None)
        ):
            raise PupuMemoryAgentWorkerError(
                "memory_agent_worker_module_order_invalid"
            )

        session_id = _identifier(call_context.session_id, "session_id")
        attempt_id = _identifier(
            call_context.execution_owner_id,
            "execution_owner_id",
        )
        run_id = _identifier(call_context.run_id, "run_id")
        root_run_id = _identifier(call_context.root_run_id, "root_run_id")
        if run_id != root_run_id:
            raise PupuMemoryAgentWorkerError(
                "memory_agent_worker_root_identity_mismatch"
            )
        trigger_key = RootRunCompletion(
            session_id=session_id,
            attempt_id=attempt_id,
            run_id=run_id,
            is_root_run=True,
            run_status=SourceRunStatus.COMPLETED,
            capture_status=RunCaptureStatus.COMPLETE,
        ).trigger_key

        def process_after_enqueue(result: KernelRunResult) -> None:
            if not isinstance(result, KernelRunResult):
                self._record_failure(
                    PupuMemoryAgentWorkerError(
                        "memory_agent_worker_kernel_result_invalid"
                    )
                )
                return None
            if str(result.status or "").strip().casefold() != "completed":
                return None
            try:
                receipt = self._worker.process_next(
                    owner_chat_id=self._owner_chat_id,
                    root_run_id=root_run_id,
                    job_trigger_key=trigger_key,
                )
            except Exception as error:
                self._record_failure(error)
                return None
            self._record_receipt(receipt)
            return None

        setattr(
            process_after_enqueue,
            _MODULE_MARKER,
            self._worker.host_binding_id,
        )
        builder.add_run_hook(process_after_enqueue)


def build_pupu_unchain_memory_agent_worker(
    host: MemoryAgentHostAdapter,
) -> PupuUnchainMemoryAgentWorker:
    """Create the root-run background worker owned by a host lifecycle."""

    return PupuUnchainMemoryAgentWorker(host)


def build_pupu_unchain_memory_agent_worker_module(
    *,
    memory_module: MemoryV2AgentModule,
    worker: PupuUnchainMemoryAgentWorker,
    owner_chat_id: str,
) -> PupuMemoryAgentWorkerModule:
    """Build the module placed immediately after ``MemoryV2AgentModule``."""

    return PupuMemoryAgentWorkerModule(
        memory_module=memory_module,
        worker=worker,
        owner_chat_id=owner_chat_id,
    )


__all__ = [
    "PupuMemoryAgentWorkerError",
    "PupuMemoryAgentWorkerReceipt",
    "PupuMemoryAgentWorkerModule",
    "PupuMemoryAgentWorkerTrigger",
    "PupuUnchainMemoryAgentWorker",
    "build_pupu_unchain_memory_agent_worker",
    "build_pupu_unchain_memory_agent_worker_module",
]
