#!/usr/bin/env python3
"""Read-only baseline for ticket #349's first investigation checkpoint.

Fixture construction is excluded from context timings. The same SQLite journal,
request factory and compile coordinator used by Context V2 are measured. A
second, controlled experiment uses the actual PuPu run hooks with a fake Memory
Agent host to isolate the time spent waiting after root completion.

Run with the Unchain 3.12 environment and both source trees on PYTHONPATH.
"""

from __future__ import annotations

import argparse
import gc
import json
import math
import platform
import statistics
import sys
import tempfile
import time
from pathlib import Path


PUPU = Path(__file__).resolve().parents[3]
UNCHAIN = Path("/Users/red/Desktop/GITRepo/unchain")
sys.path[:0] = [
    str(PUPU / "unchain_runtime" / "server"),
    str(PUPU / "unchain_runtime" / "server" / "tests"),
    str(UNCHAIN / "src"),
]

from unchain.context import (  # noqa: E402
    ArtifactService,
    ContextInputIngress,
    DurableToolApprovalState,
    DurableToolExecutionSubject,
    DurableToolRouteKind,
    HostResolvedCurrentInput,
    JournalContextRequestFactory,
)
from unchain.context.coordinator import ContextCompileCoordinator  # noqa: E402
from unchain.context.journal_view_cache import RunLocalJournalViewCache  # noqa: E402
from unchain.context.projector import CanonicalSemanticEventProjector  # noqa: E402
from unchain.execution import ExecutionFence  # noqa: E402
from unchain.journal import (  # noqa: E402
    AttemptRef,
    BoundExecutionJournal,
    DurableEventSink,
    GenerationRef,
    JournalSnapshot,
    SemanticEventDraft,
)
from unchain.kernel.harness import HarnessContext  # noqa: E402
from unchain.kernel.state import RunState  # noqa: E402
from unchain.kernel.types import KernelRunResult  # noqa: E402
from unchain.persistence.sqlite_context_compiler_v2 import (  # noqa: E402
    SQLiteContextCompilerV2Store,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store  # noqa: E402
from test_memory_v2_unchain_worker import (  # noqa: E402
    _Builder,
    _OfficialHostDouble,
    _idle_receipt,
    _mounted_worker_module,
)


EXECUTION = "benchmark-execution"
GENERATION = "benchmark-generation"
WINDOW = 131_072


class MeasuredJournal(BoundExecutionJournal):
    def __init__(self, wrapped):
        super().__init__(wrapped.execution_id)
        self.wrapped = wrapped
        self.snapshots = 0
        self.snapshot_ms = 0.0
        self.snapshot_events = 0
        self.reads = 0
        self.read_ms = 0.0
        self.read_events = 0
        self.prefix_checks = 0
        self.prefix_check_ms = 0.0

    def append(self, *, request):
        return self.wrapped.append(request=request)

    def read(self, *, after=None, limit=100):
        start = time.perf_counter_ns()
        page = self.wrapped.read(after=after, limit=limit)
        self.read_ms += (time.perf_counter_ns() - start) / 1_000_000
        self.reads += 1
        self.read_events += len(page.events)
        return page

    def capture_snapshot(self, *, max_events=10_000, max_bytes=32 * 1024 * 1024):
        start = time.perf_counter_ns()
        snapshot = self.wrapped.capture_snapshot(
            max_events=max_events,
            max_bytes=max_bytes,
        )
        self.snapshot_ms += (time.perf_counter_ns() - start) / 1_000_000
        self.snapshots += 1
        self.snapshot_events += len(snapshot.events)
        return snapshot

    def capture_snapshot_with_integrity_revision(
        self,
        *,
        max_events=10_000,
        max_bytes=32 * 1024 * 1024,
    ):
        start = time.perf_counter_ns()
        snapshot, revision = self.wrapped.capture_snapshot_with_integrity_revision(
            max_events=max_events,
            max_bytes=max_bytes,
        )
        self.snapshot_ms += (time.perf_counter_ns() - start) / 1_000_000
        self.snapshots += 1
        self.snapshot_events += len(snapshot.events)
        return snapshot, revision

    def snapshot_integrity_revision(self):
        return self.wrapped.snapshot_integrity_revision()

    def snapshot_prefix_is_current(self, *, snapshot, integrity_revision=None):
        start = time.perf_counter_ns()
        current = self.wrapped.snapshot_prefix_is_current(
            snapshot=snapshot,
            integrity_revision=integrity_revision,
        )
        self.prefix_check_ms += (time.perf_counter_ns() - start) / 1_000_000
        self.prefix_checks += 1
        return current


class OriginalFactorySnapshotSource:
    """The exact pre-cache request-factory snapshot behavior."""

    def __init__(self, journal):
        self.journal = journal

    def capture_snapshot(self):
        return JournalSnapshot.from_dict(self.journal.capture_snapshot().to_dict())


class OriginalCoordinatorSnapshotSource:
    """The exact pre-cache coordinator snapshot behavior."""

    def __init__(self, journal):
        self.journal = journal

    def capture_snapshot(self):
        return self.journal.capture_snapshot()


class EmptyToolkit:
    def to_provider_json(self, _provider):
        return []


def make_attempt(number):
    return AttemptRef(
        GenerationRef(EXECUTION, GENERATION),
        f"attempt-{number}",
    )


def fixture(root, turns, *, after_tool=False, cache_enabled=True):
    store = SQLiteContextV2Store(
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
    )
    journal = MeasuredJournal(store.bind_execution(EXECUTION))
    artifacts = ArtifactService(
        journal.wrapped,
        sanitizer=lambda content, media_type: content,
    )
    for number in range(1, turns + 1):
        attempt = make_attempt(number)
        projector = CanonicalSemanticEventProjector(
            attempt=attempt,
            artifacts=artifacts,
            payload_sanitizer=lambda event_type, payload: payload,
        )
        sink = DurableEventSink(journal.wrapped, attempt, projector)
        ingress = ContextInputIngress(
            attempt=attempt,
            projector=projector,
            sink=sink,
        )
        ingress.persist(
            HostResolvedCurrentInput(
                attempt=attempt,
                content=f"User message {number}: how is the task progressing?",
            )
        )
        if number != turns:
            draft = SemanticEventDraft(
                event_id=f"assistant-{number}",
                event_type="message.assistant",
                attempt=attempt,
                operation_id=f"assistant-operation-{number}",
                payload={
                    "run_id": attempt.attempt_id,
                    "message": {
                        "role": "assistant",
                        "content": f"Assistant answer {number}: the task is continuing.",
                    },
                },
            )
            journal.append(request=draft.to_append_request())

    state = RunState()
    state.seed_messages(
        [
            {"role": "system", "content": "Benchmark instruction."},
            {"role": "user", "content": "Stale renderer message."},
        ]
    )
    state.session_state.session_id = EXECUTION
    state.provider_state.provider = "openai"
    state.provider_state.model = "synthetic"
    state.provider_state.max_context_window_tokens = WINDOW
    context = HarnessContext(
        state=state,
        phase="before_model",
        event={"run_id": attempt.attempt_id, "toolkit": EmptyToolkit()},
    )
    capabilities = SQLiteContextCompilerV2Store(
        context_store=store,
    ).bind_execution(EXECUTION, artifacts=artifacts)
    if cache_enabled:
        factory_snapshot_source = RunLocalJournalViewCache(journal)
        coordinator_snapshot_source = factory_snapshot_source
    else:
        factory_snapshot_source = OriginalFactorySnapshotSource(journal)
        coordinator_snapshot_source = OriginalCoordinatorSnapshotSource(journal)
    factory = JournalContextRequestFactory(
        attempt=attempt,
        journal=journal,
        artifacts=artifacts,
        model_window_fallback=lambda _provider, _model: WINDOW,
        journal_snapshot_source=factory_snapshot_source,
    )
    coordinator = ContextCompileCoordinator(
        journal=journal,
        checkpoint_repository=capabilities.checkpoints,
        build_repository=capabilities.context_builds,
        partial_attempt_sink=lambda _request, error: (_ for _ in ()).throw(error),
        artifacts=artifacts,
        journal_snapshot_source=coordinator_snapshot_source,
    )

    if after_tool:
        # Prime the exact pre-tool durable prefix outside the measurement. The
        # measured build below then consumes an already committed tool pair.
        coordinator.compile(factory(context))
        intent = sink(
            {
                "type": "tool_call",
                "run_id": attempt.attempt_id,
                "iteration": 0,
                "tool_name": "lookup",
                "call_id": "call-current",
                "arguments": {"query": "current task"},
            }
        )
        subject = DurableToolExecutionSubject(
            intent_cursor=intent.cursor,
            original_arguments_sha256="1" * 64,
            effective_arguments_sha256="2" * 64,
            approval_state=DurableToolApprovalState.NOT_REQUIRED,
            approval_request_sha256="",
            approval_receipt_sha256="",
            route_kind=DurableToolRouteKind.NORMAL,
            route_manifest_sha256="3" * 64,
            terminal_handler_manifest_sha256="4" * 64,
            execution_fence=ExecutionFence(EXECUTION, "owner-benchmark", 1),
        )
        sink(
            {
                "type": "tool_result",
                "run_id": attempt.attempt_id,
                "iteration": 0,
                "tool_name": "lookup",
                "call_id": "call-current",
                "execution_subject": subject.to_dict(),
                "execution_subject_sha256": subject.sha256,
                "result": {"answer": "durable tool output"},
            }
        )

    return journal, factory, coordinator, context


def context_sample(journal, factory, coordinator, context):
    before_snapshots = journal.snapshots
    before_events = journal.snapshot_events
    before_snapshot_ms = journal.snapshot_ms
    before_reads = journal.reads
    before_read_ms = journal.read_ms
    before_read_events = journal.read_events
    before_prefix_checks = journal.prefix_checks
    before_prefix_check_ms = journal.prefix_check_ms
    start = time.perf_counter_ns()
    request = factory(context)
    factory_ms = (time.perf_counter_ns() - start) / 1_000_000
    start = time.perf_counter_ns()
    result = coordinator.compile(request)
    compile_ms = (time.perf_counter_ns() - start) / 1_000_000
    assert result.envelope is not None
    assert result.messages
    return {
        "factory_ms": factory_ms,
        "compile_ms": compile_ms,
        "total_ms": factory_ms + compile_ms,
        "snapshot_ms": journal.snapshot_ms - before_snapshot_ms,
        "snapshot_count": journal.snapshots - before_snapshots,
        "snapshot_events": journal.snapshot_events - before_events,
        "tail_read_ms": journal.read_ms - before_read_ms,
        "tail_read_count": journal.reads - before_reads,
        "tail_read_events": journal.read_events - before_read_events,
        "prefix_check_ms": journal.prefix_check_ms - before_prefix_check_ms,
        "prefix_check_count": journal.prefix_checks - before_prefix_checks,
        "provider_calls": 0,
    }


class DelayedHost(_OfficialHostDouble):
    def __init__(self, delay_seconds):
        super().__init__([_idle_receipt()])
        self.delay_seconds = delay_seconds

    def process_next(self, *, operation_id):
        time.sleep(self.delay_seconds)
        return super().process_next(operation_id=operation_id)


def completion_sample(delay_seconds):
    host = DelayedHost(delay_seconds)
    memory_module, worker_module, _completion = _mounted_worker_module(host)
    builder = _Builder()
    memory_module.configure(builder)
    worker_module.configure(builder)
    result = KernelRunResult(
        messages=[{"role": "assistant", "content": "main answer"}],
        status="completed",
    )
    start = time.perf_counter_ns()
    builder.run_hooks[0](result)
    enqueue_ms = (time.perf_counter_ns() - start) / 1_000_000
    start = time.perf_counter_ns()
    builder.run_hooks[1](result)
    worker_ms = (time.perf_counter_ns() - start) / 1_000_000
    assert host.events == ["enqueue", "worker"]
    assert worker_module.last_receipt is not None
    return {"enqueue_ms": enqueue_ms, "worker_ms": worker_ms}


def stats(values):
    ordered = sorted(values)
    return {
        "median": round(statistics.median(values), 3),
        "p95": round(ordered[math.ceil(0.95 * len(values)) - 1], 3),
        "min": round(ordered[0], 3),
        "max": round(ordered[-1], 3),
    }


def summarize(samples):
    return {
        key: (stats([sample[key] for sample in samples]) if key.endswith("_ms") else sorted(set(sample[key] for sample in samples)))
        for key in samples[0]
    }


def summarized_samples(samples):
    return {
        "summary": summarize(samples),
        "raw_samples": samples,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=int, default=30)
    parser.add_argument("--warmups", type=int, default=3)
    parser.add_argument("--turns", type=int, nargs="+", default=[1, 25, 100])
    parser.add_argument("--worker-delay-ms", type=int, default=250)
    args = parser.parse_args()
    assert args.samples > 0 and args.warmups >= 0
    assert args.turns and all(turn > 0 for turn in args.turns)
    report = {
        "benchmark": "ticket-349-tool-cache-first-slice",
        "environment": {
            "platform": platform.platform(),
            "python": platform.python_version(),
        },
        "samples": args.samples,
        "warmups": args.warmups,
        "context": {},
        "completion_hook": {},
        "scope": {
            "included": "real Unchain SQLite journal/request factory/compile coordinator; actual PuPu memory run hooks with controlled fake worker delay",
            "excluded": "Electron/IPC, provider network and tokens, real Memory Agent model, cold sidecar startup",
        },
    }
    for turns in args.turns:
        key = f"{turns}-turns"
        report["context"][key] = {}
        for cache_enabled in (False, True):
            mode = "cache_on" if cache_enabled else "cache_off"
            with tempfile.TemporaryDirectory(prefix="pupu-349-context-") as name:
                journal, factory, coordinator, context = fixture(
                    Path(name), turns, cache_enabled=cache_enabled
                )
                for _ in range(args.warmups):
                    context_sample(journal, factory, coordinator, context)
                stable_samples = []
                for _ in range(args.samples):
                    gc.collect()
                    stable_samples.append(context_sample(journal, factory, coordinator, context))
            tool_continuation_samples = []
            for sample_index in range(args.warmups + args.samples):
                with tempfile.TemporaryDirectory(prefix="pupu-349-tool-") as name:
                    journal, factory, coordinator, context = fixture(
                        Path(name),
                        turns,
                        after_tool=True,
                        cache_enabled=cache_enabled,
                    )
                    sample = context_sample(journal, factory, coordinator, context)
                    if sample_index >= args.warmups:
                        tool_continuation_samples.append(sample)
            report["context"][key][mode] = {
                "stable_history": summarized_samples(stable_samples),
                "new_tool_result": summarized_samples(tool_continuation_samples),
            }

    for delay_ms in (0, args.worker_delay_ms):
        for _ in range(args.warmups):
            completion_sample(delay_ms / 1000)
        samples = []
        for _ in range(args.samples):
            gc.collect()
            samples.append(completion_sample(delay_ms / 1000))
        report["completion_hook"][str(delay_ms)] = summarize(samples)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
