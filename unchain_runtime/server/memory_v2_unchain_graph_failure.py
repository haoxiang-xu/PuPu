"""Close a graph that ended without completing, from what the journal holds.

When the sidecar's graph runner is left by an exception (a provider failure, a
Stop at one of its cancel checks, an error after the graph finalized), the
journal must end with exactly one canonical terminal per attempt, so that the
rebase preflight finds the run quiescent and the chat can be edited or resent.
This host adapter decides what is missing from the journal itself rather than
from the kind of failure:

* a step whose run already left a terminal is sealed by the existing recovery
  (completed stays completed, a failed or cancelled run stays so; a Stop that
  lands between a step's ``run_completed`` and its seal never turns that step
  into a cancelled one);
* a step that was started and was running when the run was left, but left no
  terminal, gets one, then is sealed;
* a step that is parked on a durable interaction (waiting for an answer, or
  answered and waiting to be resumed) is left alone: a failed or rejected resume
  attempt must not kill it, so the root is not terminated either while such a
  step remains; an exact canonical cancellation, or a preserved accepted answer
  with an exact cancelled host application and cancelled owner, closes the step;
* otherwise the orchestration (root) attempt gets ``run_failed`` / ``run_cancelled``
  unless it already has any canonical terminal;
* nothing is written for a step that never started.

Events go to the journal only, through the attempts' own durable sinks. They are
never emitted to the stream, so the renderer sees no second root failure. The
caller must not call this when ownership of the execution was lost: another
owner may be running the attempt and a second terminal would corrupt it.
"""

from __future__ import annotations

from dataclasses import dataclass

from memory_v2_unchain_graph_checkpoint import PupuUnchainGraphCheckpointHost
from unchain.context.graph_checkpoint import GraphTerminalStatus
from unchain.journal import JournalAppendResult
from unchain.journal.graph_attempt_quiescence import CANONICAL_ATTEMPT_TERMINALS
from unchain.kernel.lifecycle_events import build_run_failure_payload

_CANCELLED_CODE = "execution_cancelled"
_FAILED_CODE = "graph_run_failed"


class PupuUnchainGraphFailureError(RuntimeError):
    """The failure terminal could not cross the canonical host boundary."""

    def __init__(self, code: str) -> None:
        self.code = str(code or "graph_failure_settle_failed")
        super().__init__(self.code)


@dataclass(frozen=True, slots=True)
class PupuUnchainGraphSettleReceipt:
    """Identifiers and statuses only; what this call wrote."""

    step_index: int | None
    step_terminal_written: bool
    step_seal: GraphTerminalStatus | None
    root_terminal_written: bool


def _running_step_index(recovery) -> int | None:
    """The step this run was executing: started (or resumed) with no terminal."""

    for index in (recovery.uncertain_step_index, recovery.resuming_step_index):
        if index is not None:
            return index
    return None


def _parked_step_index(recovery) -> int | None:
    """A step waiting for, or ready to resume from, a durable interaction."""

    for index in (recovery.suspended_step_index, recovery.resume_ready_step_index):
        if index is not None:
            return index
    return None


def _cancelled_parked_step_index(graph_host, recovery) -> int | None:
    """Prove the exact parked interaction has been retired by Stop."""
    index = recovery.resume_ready_step_index
    if index is None:
        return None
    step = graph_host.plan.steps[index]
    events = graph_host.service.repository.journal.capture_snapshot().events
    resolutions = [
        event for event in events
        if event.attempt == step.attempt and event.event_type == "interaction.resolved"
    ]
    if not resolutions:
        return None
    event = resolutions[-1]
    interaction_id = str(event.payload.get("interaction_id") or "")
    evidence = graph_host.service.resolved_interaction_for_step(
        graph_host.plan, index, interaction_id=interaction_id,
    )
    from memory_v2_unchain_active_bridge import (
        pupu_unchain_cold_accepted_interaction_resolution,
    )

    accepted = pupu_unchain_cold_accepted_interaction_resolution(
        owner_chat_id=graph_host.bridge.preparation.binding.owner_chat_id,
        session_id=graph_host.plan.execution_id,
        source_attempt_id=step.attempt.attempt_id,
        interaction_id=interaction_id,
    )
    if accepted is None or accepted.resolution_cursor != evidence.resolution_cursor:
        return None
    if isinstance(accepted.response, dict) and accepted.response.get("cancelled") is True:
        return index

    # An answer accepted just before Stop remains an accepted fact. Only an
    # exact host cancellation application and a cancelled owner prove that the
    # answered checkpoint can no longer resume; an unrelated failed resume has
    # neither authority and must leave the parked step alone.
    from durable_interaction_host import (
        _cancelled_owner_for_interaction_source,
        _interaction_runtime,
    )

    cancelled_owner = _cancelled_owner_for_interaction_source(
        graph_host.plan.execution_id, step.attempt.attempt_id,
        revoke_bound_resumes=False,
    )
    if not cancelled_owner:
        return None
    snapshot = _interaction_runtime().load(
        graph_host.plan.execution_id,
        interaction_id=interaction_id,
        require_active=False,
    )
    if (
        snapshot.request.source_run_id == step.attempt.attempt_id
        and snapshot.receipt is not None
        and snapshot.receipt.response == accepted.response
        and isinstance(snapshot.application, dict)
        and snapshot.application.get("applied_checkpoint_id")
        == f"cancelled:{snapshot.checkpoint_id}"
    ):
        return index
    return None


def _root_has_terminal(graph_host: PupuUnchainGraphCheckpointHost) -> bool:
    root = graph_host.plan.orchestration_attempt
    snapshot = graph_host.service.repository.journal.capture_snapshot()
    return any(
        event.attempt == root and event.event_type in CANONICAL_ATTEMPT_TERMINALS
        for event in snapshot.events
    )


def _append(sink, event: dict) -> None:
    result = sink(event)
    if type(result) is not JournalAppendResult or (
        result.event.event_type != event["type"]
        or result.event.payload.get("run_id") != event["run_id"]
    ):
        raise PupuUnchainGraphFailureError("graph_failure_journal_receipt_invalid")


def settle_pupu_unchain_graph_failure(
    graph_host: PupuUnchainGraphCheckpointHost,
    *,
    cancelled: bool,
    iteration: int = 0,
) -> PupuUnchainGraphSettleReceipt:
    """Write what the journal still lacks after a graph run was left."""

    if type(graph_host) is not PupuUnchainGraphCheckpointHost:
        raise TypeError("graph_host must be a PupuUnchainGraphCheckpointHost")
    cancelled = bool(cancelled)
    terminal_type = "run_cancelled" if cancelled else "run_failed"
    code = _CANCELLED_CODE if cancelled else _FAILED_CODE
    plan = graph_host.plan

    # Seals every step whose terminal is already in the journal, whatever it
    # is: this is the only place a completed step is sealed after a Stop.
    recovery = graph_host.recover()

    step_index = _running_step_index(recovery)
    if step_index is None and cancelled:
        step_index = _cancelled_parked_step_index(graph_host, recovery)
    step_terminal_written = False
    step_seal = None
    if step_index is not None:
        step_attempt_id = plan.steps[step_index].attempt.attempt_id
        _append(
            graph_host.step_event_sink(step_index),
            {
                "type": terminal_type,
                "run_id": step_attempt_id,
                **build_run_failure_payload(
                    iteration=iteration,
                    error_code=code,
                    cancelled=cancelled,
                ),
            },
        )
        step_terminal_written = True
        step_seal = (
            GraphTerminalStatus.CANCELLED if cancelled else GraphTerminalStatus.FAILED
        )
        recovery = graph_host.fail_step(step_index, status=step_seal)

    root_terminal_written = False
    if _parked_step_index(recovery) is None and not _root_has_terminal(graph_host):
        _append(
            graph_host.coordinator.bundle.durable_event_sink,
            {
                "type": terminal_type,
                "run_id": plan.orchestration_attempt.attempt_id,
                **build_run_failure_payload(
                    iteration=len(plan.steps),
                    error_code=code,
                    cancelled=cancelled,
                ),
            },
        )
        root_terminal_written = True

    return PupuUnchainGraphSettleReceipt(
        step_index=step_index,
        step_terminal_written=step_terminal_written,
        step_seal=step_seal,
        root_terminal_written=root_terminal_written,
    )


__all__ = [
    "PupuUnchainGraphFailureError",
    "PupuUnchainGraphSettleReceipt",
    "settle_pupu_unchain_graph_failure",
]


def settle_cancelled_parked_graph_interaction(*, session_id, source_attempt_id, interaction_id, record):
    """Seal an exact cancelled parked graph while its session guard is held.

    The cancellation host serializes this call and only invokes it for the
    matching parked guard. A live worker retains its active guard and performs
    the same settlement through its existing graph host instead.
    """
    from durable_interaction_host import _interaction_runtime
    from memory_v2_cold_terminal_repair import _append_terminal
    from memory_v2_unchain_active_bridge import (
        _cold_context_store, pupu_unchain_cold_accepted_interaction_resolution,
    )
    from memory_v2_unchain_run_binding import _sanitize_artifact
    from unchain.context import ArtifactService
    from unchain.context.graph_checkpoint import (
        GraphCheckpointService, JournalGraphCheckpointRepository, locate_graph_execution_plan,
    )

    journal = _cold_context_store().bind_execution(session_id)
    plan = locate_graph_execution_plan(
        journal, generation_id=record["coordinator_binding_snapshot"]["generation_id"],
        orchestration_attempt_id=record["coordinator_attempt_id"],
    )
    index = record["step_index"]
    if (plan.execution_id != session_id or plan.plan_id != record["graph_plan_id"]
            or plan.scope_id != record["graph_scope_id"]
            or plan.topology_sha256 != record["topology_sha256"]
            or not 0 <= index < len(plan.steps)
            or plan.steps[index].attempt.attempt_id != source_attempt_id
            or plan.steps[index].node_id != record["node_id"]
            or plan.steps[index].provider != record["provider"]
            or plan.steps[index].model != record["model"]
            or plan.steps[index].configuration_sha256 != record["configuration_sha256"]):
        raise PupuUnchainGraphFailureError("cancelled_parked_graph_identity_changed")
    host = _interaction_runtime().load(session_id, interaction_id=interaction_id, require_active=False)
    if (host.request.source_run_id != source_attempt_id or host.receipt is None
            or not isinstance(host.application, dict)
            or host.application.get("applied_checkpoint_id") != f"cancelled:{host.checkpoint_id}"):
        raise PupuUnchainGraphFailureError("cancelled_parked_graph_receipt_missing")
    from durable_interaction_host import _reconcile_cancelled_interaction_to_context

    _reconcile_cancelled_interaction_to_context(
        owner_chat_id=record["owner_chat_id"], session_id=session_id,
        source_attempt_id=source_attempt_id, expected_interaction_id=interaction_id,
        cancellation_applied=True, cancellation_snapshot=host,
    )
    accepted = pupu_unchain_cold_accepted_interaction_resolution(
        owner_chat_id=record["owner_chat_id"], session_id=session_id,
        source_attempt_id=source_attempt_id, interaction_id=interaction_id,
    )
    if accepted is None or accepted.response != host.receipt.response:
        raise PupuUnchainGraphFailureError("cancelled_parked_graph_resolution_missing")
    checkpoints = GraphCheckpointService(
        repository=JournalGraphCheckpointRepository(journal),
        artifacts=ArtifactService(journal, sanitizer=_sanitize_artifact),
        derived_ingress_resolver=lambda *_args: None,
    )
    recovery = checkpoints.recover(plan)
    if recovery.terminal_status is None:
        if recovery.resume_ready_step_index != index:
            raise PupuUnchainGraphFailureError("cancelled_parked_graph_step_changed")
        evidence = checkpoints.resolved_interaction_for_step(plan, index, interaction_id=interaction_id)
        if evidence.resolution_cursor != accepted.resolution_cursor:
            raise PupuUnchainGraphFailureError("cancelled_parked_graph_resolution_changed")
        _append_terminal(journal, plan.steps[index].attempt, cancelled=True)
        checkpoints.recover(plan)
    _append_terminal(journal, plan.orchestration_attempt, cancelled=True)
