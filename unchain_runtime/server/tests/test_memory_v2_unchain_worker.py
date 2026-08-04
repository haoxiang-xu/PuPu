from __future__ import annotations

from dataclasses import fields
from types import SimpleNamespace

import pytest

from memory_v2_unchain_worker import (
    PupuMemoryAgentWorkerError,
    build_pupu_unchain_memory_agent_worker,
    build_pupu_unchain_memory_agent_worker_module,
)
from unchain.agent.modules.memory_v2 import (
    MemoryV2AgentAttachment,
    MemoryV2AgentModule,
)
from unchain.journal import ResourceRef
from unchain.kernel.types import KernelRunResult
from unchain.memory.curator.host import (
    MemoryAgentHostAdapter,
    MemoryAgentWorkerDisposition,
    MemoryAgentWorkerReceipt,
)
from unchain.memory.curator.models import (
    ProcessDisposition,
    RootRunCompletion,
    RunCaptureStatus,
    SourceRunStatus,
)
from unchain.memory.toolkit import (
    MemoryToolkitRunBinding,
    NormalMemoryToolkitCapabilities,
)
from unchain.run_identity import MemoryV2RunRole
from unchain.tools import Tool, Toolkit


_TRIGGER_A = "completed_root_run:" + ("a" * 64)
_TRIGGER_B = "completed_root_run:" + ("b" * 64)


class _OfficialHostDouble(MemoryAgentHostAdapter):
    def __init__(self, receipts, *, binding_id="binding-a", events=None):
        self._test_binding_id = binding_id
        self.receipts = list(receipts)
        self.operation_ids = []
        self.events = events if events is not None else []
        self.completions = []

    @property
    def binding_id(self):
        return self._test_binding_id

    @property
    def enabled(self):
        return True

    def build_normal_toolkit(self, binding, capabilities):
        del binding, capabilities
        toolkit = Toolkit()
        for name in (
            "memory_list",
            "memory_search",
            "memory_read",
            "memory_propose",
        ):
            toolkit.register(Tool.from_callable(lambda **_kwargs: {}, name=name))
        return toolkit

    def enqueue_root_completion(self, completion):
        self.events.append("enqueue")
        self.completions.append(completion)
        return SimpleNamespace(enabled=True, reason="completed_root_run")

    def process_next(self, *, operation_id):
        self.events.append("worker")
        self.operation_ids.append(operation_id)
        outcome = self.receipts.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def _idle_receipt():
    return MemoryAgentWorkerReceipt(
        disposition=MemoryAgentWorkerDisposition.IDLE,
        reason="no_pending_job",
    )


def _processed_receipt(
    disposition=ProcessDisposition.COMPLETED,
    *,
    reason="curation_complete",
):
    claimed_trigger = SimpleNamespace(
        run_id="claimed-root",
        trigger_key=_TRIGGER_B,
    )
    claimed = SimpleNamespace(
        job_id="job-a",
        revision=2,
        trigger=claimed_trigger,
        candidates=(object(),),
    )
    result_job = SimpleNamespace(
        job_id="job-a",
        revision=3,
        model_output="must-not-cross-worker-receipt",
    )
    result = SimpleNamespace(
        disposition=disposition,
        reason=reason,
        job=result_job,
    )
    return MemoryAgentWorkerReceipt(
        disposition=MemoryAgentWorkerDisposition.PROCESSED,
        reason=reason,
        claimed_job=claimed,
        result=result,
    )


def test_idle_is_content_free_and_same_trigger_never_calls_host_twice():
    host = _OfficialHostDouble([_idle_receipt()])
    worker = build_pupu_unchain_memory_agent_worker(host)

    first = worker.process_next(
        owner_chat_id="chat-a",
        root_run_id="root-a",
        job_trigger_key=_TRIGGER_A,
    )
    replay = worker.process_next(
        owner_chat_id="chat-a",
        root_run_id="root-a",
        job_trigger_key=_TRIGGER_A,
    )

    assert first.disposition is MemoryAgentWorkerDisposition.IDLE
    assert first.reason == "no_pending_job"
    assert first.replayed is False
    assert replay.operation_id == first.operation_id
    assert replay.replayed is True
    assert host.operation_ids == [first.operation_id]
    assert first.claimed_job_id == ""
    assert first.process_disposition is None


def test_operation_id_is_stable_and_domain_separated_by_all_identity_parts():
    first_host = _OfficialHostDouble([_idle_receipt()], binding_id="binding-a")
    second_host = _OfficialHostDouble([_idle_receipt()], binding_id="binding-a")
    first = build_pupu_unchain_memory_agent_worker(first_host).process_next(
        owner_chat_id="chat-a",
        root_run_id="root-a",
        job_trigger_key=_TRIGGER_A,
    )
    second = build_pupu_unchain_memory_agent_worker(second_host).process_next(
        owner_chat_id="chat-a",
        root_run_id="root-a",
        job_trigger_key=_TRIGGER_A,
    )

    assert first.operation_id == second.operation_id

    variants = []
    for binding_id, owner_chat_id, root_run_id, trigger_key in (
        ("binding-b", "chat-a", "root-a", _TRIGGER_A),
        ("binding-a", "chat-b", "root-a", _TRIGGER_A),
        ("binding-a", "chat-a", "root-b", _TRIGGER_A),
        ("binding-a", "chat-a", "root-a", _TRIGGER_B),
    ):
        host = _OfficialHostDouble([_idle_receipt()], binding_id=binding_id)
        receipt = build_pupu_unchain_memory_agent_worker(host).process_next(
            owner_chat_id=owner_chat_id,
            root_run_id=root_run_id,
            job_trigger_key=trigger_key,
        )
        variants.append(receipt.operation_id)

    assert len(set(variants + [first.operation_id])) == 5


def test_processed_projection_exposes_only_status_and_identity_metadata():
    host = _OfficialHostDouble([_processed_receipt()])
    receipt = build_pupu_unchain_memory_agent_worker(host).process_next(
        owner_chat_id="chat-a",
        root_run_id="wake-root",
        job_trigger_key=_TRIGGER_A,
    )

    assert receipt.disposition is MemoryAgentWorkerDisposition.PROCESSED
    assert receipt.claimed_job_id == "job-a"
    assert receipt.claimed_job_revision == 2
    assert receipt.result_job_revision == 3
    assert receipt.claimed_root_run_id == "claimed-root"
    assert receipt.claimed_trigger_key == _TRIGGER_B
    assert receipt.process_disposition is ProcessDisposition.COMPLETED
    assert receipt.process_reason == "curation_complete"
    field_names = {item.name for item in fields(receipt)}
    assert not field_names.intersection(
        {
            "candidates",
            "claimed_job",
            "content",
            "messages",
            "model_output",
            "result",
            "tool_output",
        }
    )


def test_only_official_host_type_and_official_root_trigger_are_accepted():
    class DuckTypedLegacyCurator:
        binding_id = "binding-a"

        def process_next(self, *, operation_id):
            raise AssertionError(operation_id)

    with pytest.raises(TypeError, match="MemoryAgentHostAdapter"):
        build_pupu_unchain_memory_agent_worker(DuckTypedLegacyCurator())

    host = _OfficialHostDouble([_idle_receipt()])
    worker = build_pupu_unchain_memory_agent_worker(host)
    with pytest.raises(ValueError, match="official root completion trigger"):
        worker.process_next(
            owner_chat_id="chat-a",
            root_run_id="root-a",
            job_trigger_key="legacy-trigger",
        )
    assert host.operation_ids == []


def test_invalid_official_receipt_is_not_cached_for_a_retry():
    host = _OfficialHostDouble(
        [
            object(),
            _idle_receipt(),
        ]
    )
    worker = build_pupu_unchain_memory_agent_worker(host)

    with pytest.raises(PupuMemoryAgentWorkerError) as error:
        worker.process_next(
            owner_chat_id="chat-a",
            root_run_id="root-a",
            job_trigger_key=_TRIGGER_A,
        )
    receipt = worker.process_next(
        owner_chat_id="chat-a",
        root_run_id="root-a",
        job_trigger_key=_TRIGGER_A,
    )

    assert error.value.code == "memory_agent_worker_receipt_invalid"
    assert receipt.disposition is MemoryAgentWorkerDisposition.IDLE
    assert len(host.operation_ids) == 2
    assert host.operation_ids[0] == host.operation_ids[1]


class _Capability:
    binding_id = "binding-a"
    space_id = "space-a"

    def encode(self, ref):
        return f"ref:{ref.kind}:{ref.resource_id}:{ref.revision}"

    def decode(self, value, *, purpose):
        del value, purpose
        return ResourceRef("artifact", "artifact-a", 1)

    def authorize(self, *, ref, purpose):
        del purpose
        return ref

    def __getattr__(self, _name):
        return lambda **_kwargs: {}


class _AttachmentFactory:
    binding_id = "binding-a"

    def __init__(self, completion):
        self.completion = completion

    def attach(self, request):
        capability = _Capability()
        capabilities = NormalMemoryToolkitCapabilities(
            references=capability,
            context=capability,
            chat=capability,
            candidates=capability,
        )
        return MemoryV2AgentAttachment(
            binding=MemoryToolkitRunBinding(
                binding_id=self.binding_id,
                session_id=request.session_id,
                attempt_id=request.attempt_id,
                run_id=request.run_id,
            ),
            capabilities=capabilities,
            completion_factory=self,
        )

    def build(self, *, result):
        del result
        return self.completion


class _Builder:
    def __init__(self):
        self.spec = SimpleNamespace(name="root-agent")
        self.call_context = SimpleNamespace(
            mode="default",
            session_id="session-a",
            execution_owner_id="attempt-a",
            run_id="root-a",
            root_run_id="root-a",
            memory_v2_run_role=MemoryV2RunRole.ROOT,
        )
        self.toolkit = Toolkit()
        self.run_hooks = []

    def add_tool(self, toolkit):
        for tool in toolkit.tools.values():
            self.toolkit.register(tool)

    def add_run_hook(self, hook):
        self.run_hooks.append(hook)


def _mounted_worker_module(host):
    completion = RootRunCompletion(
        session_id="session-a",
        attempt_id="attempt-a",
        run_id="root-a",
        is_root_run=True,
        run_status=SourceRunStatus.COMPLETED,
        capture_status=RunCaptureStatus.COMPLETE,
    )
    memory_module = MemoryV2AgentModule(
        host=host,
        attachment_factory=_AttachmentFactory(completion),
    )
    worker = build_pupu_unchain_memory_agent_worker(host)
    worker_module = build_pupu_unchain_memory_agent_worker_module(
        memory_module=memory_module,
        worker=worker,
        owner_chat_id="chat-a",
    )
    return memory_module, worker_module, completion


def test_agent_module_runs_enqueue_then_worker_without_replacing_main_result():
    events = []
    host = _OfficialHostDouble([_idle_receipt()], events=events)
    memory_module, worker_module, completion = _mounted_worker_module(host)
    builder = _Builder()

    memory_module.configure(builder)
    worker_module.configure(builder)

    assert len(builder.run_hooks) == 2
    result = KernelRunResult(
        messages=[{"role": "assistant", "content": "main answer"}],
        status="completed",
    )
    current = result
    for hook in builder.run_hooks:
        replacement = hook(current)
        if isinstance(replacement, KernelRunResult):
            current = replacement

    assert events == ["enqueue", "worker"]
    assert current is result
    assert current.messages[-1]["content"] == "main answer"
    assert worker_module.last_failure_code == ""
    assert worker_module.last_receipt is not None
    assert worker_module.last_receipt.disposition is MemoryAgentWorkerDisposition.IDLE
    assert worker_module.last_receipt.trigger.job_trigger_key == completion.trigger_key


def test_agent_module_contains_worker_failures_and_rejects_bad_mounts():
    host = _OfficialHostDouble([RuntimeError("provider payload must stay hidden")])
    memory_module, worker_module, _ = _mounted_worker_module(host)
    builder = _Builder()
    memory_module.configure(builder)
    worker_module.configure(builder)
    result = KernelRunResult(messages=[], status="completed")

    assert builder.run_hooks[-1](result) is None
    assert worker_module.last_receipt is None
    assert worker_module.last_failure_code == "memory_agent_worker_hook_failed"
    assert "hidden" not in worker_module.last_failure_code

    with pytest.raises(PupuMemoryAgentWorkerError) as duplicate:
        worker_module.configure(builder)
    assert duplicate.value.code == "memory_agent_worker_module_duplicate"

    other_host = _OfficialHostDouble([_idle_receipt()], binding_id="binding-b")
    other_worker = build_pupu_unchain_memory_agent_worker(other_host)
    with pytest.raises(PupuMemoryAgentWorkerError) as mismatch:
        build_pupu_unchain_memory_agent_worker_module(
            memory_module=memory_module,
            worker=other_worker,
            owner_chat_id="chat-a",
        )
    assert mismatch.value.code == "memory_agent_worker_host_binding_mismatch"


@pytest.mark.parametrize(
    ("disposition", "reason", "failure_code"),
    (
        (
            ProcessDisposition.RETRY_SCHEDULED,
            "retry_scheduled",
            "memory_agent_process_pending_retry",
        ),
        (
            ProcessDisposition.FAILED,
            "curation_failed",
            "memory_agent_process_failed",
        ),
    ),
)
def test_agent_module_records_official_pending_or_failed_without_throwing(
    disposition,
    reason,
    failure_code,
):
    host = _OfficialHostDouble(
        [_processed_receipt(disposition, reason=reason)]
    )
    memory_module, worker_module, _ = _mounted_worker_module(host)
    builder = _Builder()
    memory_module.configure(builder)
    worker_module.configure(builder)
    result = KernelRunResult(messages=[], status="completed")

    assert builder.run_hooks[-1](result) is None
    assert worker_module.last_receipt is not None
    assert worker_module.last_receipt.process_disposition is disposition
    assert worker_module.last_failure_code == failure_code
