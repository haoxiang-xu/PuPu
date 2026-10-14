"""Journal-only repair of abandoned graph runs under the session rebase guard.

No model, tool, or interaction is resumed here. Execution records authorize the
repair; graph identity and missing facts come only from the durable journal.
"""
from __future__ import annotations

from execution_control import ExecutionControlRegistry, _process_is_alive
from memory_v2_unchain_host_event_boundary import (
    HOST_EVENT_ORIGIN_COLD_TERMINAL, PupuUnchainHostEventAuthority,
    PupuUnchainHostEventBoundary, validate_pupu_unchain_bound_host_event,
)
from memory_v2_unchain_run_binding import _sanitize_artifact, _sanitize_event_payload
from unchain.context import ArtifactService
from unchain.context.graph_checkpoint import (
    GraphCheckpointService, JournalGraphCheckpointRepository,
    locate_graph_execution_plan,
)
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.journal import DurableEventSink, JournalAppendResult
from unchain.journal.graph_attempt_quiescence import CANONICAL_ATTEMPT_TERMINALS


class ColdTerminalRepairError(RuntimeError):
    pass


class _ColdTerminalSink:
    def __init__(self, journal, attempt):
        self.execution_id = attempt.generation.execution_id
        self.attempt = attempt
        self.sink = DurableEventSink(
            journal, attempt,
            CanonicalSemanticEventProjector(
                attempt=attempt,
                artifacts=ArtifactService(journal, sanitizer=_sanitize_artifact),
                payload_sanitizer=_sanitize_event_payload,
            ),
        )

    def persist_bound_host_event(self, bound):
        validate_pupu_unchain_bound_host_event(bound)
        if (bound.authority.execution_id != self.execution_id
                or bound.authority.attempt_id != self.attempt.attempt_id
                or bound.authority.origin != HOST_EVENT_ORIGIN_COLD_TERMINAL):
            raise ColdTerminalRepairError('cold terminal authority changed')
        result = self.sink(bound.event)
        if (type(result) is not JournalAppendResult or result.event.attempt != self.attempt
                or result.event.event_type != bound.event['type']):
            raise ColdTerminalRepairError('cold terminal receipt changed')


def _append_terminal(journal, attempt, *, cancelled):
    if any(e.attempt == attempt and e.event_type in CANONICAL_ATTEMPT_TERMINALS
           for e in journal.capture_snapshot().events):
        return False
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=_ColdTerminalSink(journal, attempt),
        execution_id=attempt.generation.execution_id, attempt_id=attempt.attempt_id,
        enqueue=lambda _event: None,
    )
    authority = PupuUnchainHostEventAuthority(
        execution_id=attempt.generation.execution_id, attempt_id=attempt.attempt_id,
        origin=HOST_EVENT_ORIGIN_COLD_TERMINAL,
    )
    bound = boundary.bind_semantic({
        'type': 'run_cancelled' if cancelled else 'run_failed',
        'run_id': attempt.attempt_id, 'iteration': 0,
        'status': 'cancelled' if cancelled else 'failed',
        'code': 'cold_terminal_repair',
        'message': 'Run cancelled' if cancelled else 'Run failed',
        'recoverable': False,
    }, authority=authority)
    boundary.deliver(bound)
    return True


def repair_cold_graph_terminals(*, service, request, data_dir):
    """Called only inside session_rebase_guard; return whether any fact changed.

    A cancel record alone is not worker quiescence. The enclosing session guard
    is what excludes an old worker still unwinding and any newly starting run.
    Missing records, live owners and completed records never authorize repair.
    """
    intent = request.intent
    journal = service._store.bind_execution(intent.execution_id)
    snapshot = journal.capture_snapshot()
    controls = ExecutionControlRegistry(data_dir=data_dir)
    plans = []
    for event in snapshot.events:
        if (event.attempt.generation.generation_id != intent.previous_generation_id
                or event.event_type != 'graph.execution.admitted'):
            continue
        plan = locate_graph_execution_plan(
            journal, generation_id=intent.previous_generation_id,
            orchestration_attempt_id=event.attempt.attempt_id, snapshot=snapshot,
        )
        record = controls.snapshot(intent.session_id, plan.orchestration_attempt.attempt_id)
        if record is None or record.status == 'completed':
            continue
        if record.status not in {'failed', 'cancelled'} and (
            record.owner_pid is None or _process_is_alive(record.owner_pid)
        ):
            continue
        plans.append((plan, record.status == 'cancelled'))
    if not plans:
        return False
    from session_execution_guard import SessionExecutionGuardRegistry

    guards = SessionExecutionGuardRegistry(data_dir=data_dir)
    guard = guards.snapshot(intent.session_id)
    if (guard is None or guard.state != "active" or guard.operation != "rebase"
            or guard.attempt_id != request.operation.operation_id
            or guard.execution_id != intent.execution_id
            or guards._owner_state(guard) != "owned"):
        raise ColdTerminalRepairError("cold repair requires the exact owned rebase guard")
    changed = False
    checkpoints = GraphCheckpointService(
        repository=JournalGraphCheckpointRepository(journal),
        artifacts=ArtifactService(journal, sanitizer=_sanitize_artifact),
        derived_ingress_resolver=lambda *_args: None,
    )
    for plan, cancelled in plans:
        before = len(journal.capture_snapshot().events)
        recovery = checkpoints.recover(plan)
        # An unresolved approval must be retired by the exact cancellation path;
        # never forge an interaction receipt or release a parked owner here.
        if recovery.suspended_step_index is not None:
            continue
        pending = next((index for index in (
            recovery.uncertain_step_index, recovery.resume_ready_step_index,
            recovery.resuming_step_index,
        ) if index is not None), None)
        if pending is not None:
            _append_terminal(journal, plan.steps[pending].attempt, cancelled=cancelled)
            checkpoints.recover(plan)
        _append_terminal(journal, plan.orchestration_attempt, cancelled=cancelled)
        changed = changed or len(journal.capture_snapshot().events) != before
    return changed
