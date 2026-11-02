"""Display settlements for a proved, already-cancelled subagent graph chain.

No runner, handler, provider or current-input ingress is constructed here. The
cancelled child record is the authority; the root's cancellation is not evidence
of an arbitrary child's outcome. All writes recheck the same cancelled records.
"""
from hashlib import sha256

from unchain.context import ArtifactService, HandoffEnvelope, HandoffStatus
from unchain.context.compiler import _subagent_tool_settlement
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.events.subagent_settlement import build_subagent_settlement_projection
from unchain.journal import ArtifactRef, AttemptRef, EventCursor, EventRange, SemanticEventDraft
from unchain.journal.models import _thaw_json
from unchain.skeleton.durable_protocol import canonical_bytes


def _prove_cancelled_edge(pending, parent, child, snapshot):
    from skeleton_production_interactions import _prove_current, _prove_child, _AGENT_FIELDS

    _prove_current(pending, snapshot, status="cancelled")
    root = pending.chain[0]
    if (root.store.graph_id != pending.launch.store.graph_id
            or root.store.attempt != pending.launch.store.attempt
            or parent.store.attempt.generation != root.store.attempt.generation
            or child.store.attempt.generation != root.store.attempt.generation):
        raise ValueError("cancelled subagent chain escaped its launch")
    _prove_child(parent, child)
    active = parent.record.state["active"]
    request = parent.store.read_json(active["wait"]["request_ref"])
    if (request != parent.request_payload or set(request) != _AGENT_FIELDS | {"parent_tool_call"}
            or request["schema"] != "pupu.skeleton_subagent_wait.v2"
            or request["parent_graph_id"] != parent.store.graph_id
            or request["parent_node_invocation_id"] != active["node_invocation_id"]
            or request["parent_kernel_node_id"] != active["node_id"]
            or request["child_graph_id"] != child.store.graph_id
            or request["child_attempt_id"] != child.store.attempt.attempt_id):
        raise ValueError("cancelled subagent wait identity changed")
    call = request["parent_tool_call"]
    if (type(call) is not dict or set(call) != {"call_id", "tool_name"}
            or any(type(value) is not str or not value or value.strip() != value for value in call.values())):
        raise ValueError("cancelled subagent call identity is invalid")
    consumer = AttemptRef(parent.store.attempt.generation, active["node_attempt_id"])
    calls = [event for event in snapshot.events if event.attempt == consumer
        and event.event_type == "tool_call" and event.payload.get("call_id") == call["call_id"]]
    spawns = [event for event in snapshot.events if event.attempt == consumer
        and event.event_type == "subagent_spawned"
        and event.payload.get("child_run_id") == child.store.attempt.attempt_id]
    if (len(calls) != 1 or calls[0].payload.get("tool_name") != call["tool_name"]
            or len(spawns) != 1 or spawns[0].store_seq <= calls[0].store_seq):
        raise ValueError("cancelled subagent has no unique original call and spawn")
    records = child.store._snapshot(snapshot, plan=child.store.plan)
    terminal = records[-1].event
    if (terminal.event_id != child.record.event_id or terminal.attempt != child.store.attempt
            or records[-1].state["status"] != "cancelled"):
        raise ValueError("cancelled subagent has no exact child terminal record")
    return consumer, call, terminal


def _settle_edge(pending, parent, child):
    from skeleton_production_interactions import _mutable_journal
    from memory_v2_unchain_run_binding import _sanitize_artifact

    journal = _mutable_journal(pending.launch)
    consumer, call, terminal = _prove_cancelled_edge(pending, parent, child, journal.capture_snapshot())
    identity = {"schema": "unchain.skeleton_subagent_tool_settlement.v2",
        "consumer_attempt": consumer.to_dict(), "source_attempt": child.store.attempt.to_dict(),
        "call_id": call["call_id"]}
    operation = "skeleton.subagent-tool-settlement." + sha256(canonical_bytes(identity)).hexdigest()
    error = child.record.state["error"]
    body = {"schema": "unchain.skeleton_child_completion.v1", "status": "cancelled",
        "outputs": None, "error": "" if error is None else str(error),
        "summary": str(error) if error else "Subagent cancelled"}
    snapshot = journal.capture_snapshot()
    existing = [event for event in snapshot.events if event.event_id == "event." + operation]
    if existing:
        if len(existing) != 1:
            raise ValueError("cancelled subagent settlement is ambiguous")
        event = existing[0]
        payload = _thaw_json(event.payload)
        _subagent_tool_settlement(payload)
        handoff_cursor = EventCursor.from_dict(payload["handoff_cursor"])
        handoffs = [entry for entry in snapshot.events
            if entry.event_type == "handoff.recorded" and entry.event_id == handoff_cursor.event_id
            and entry.store_seq == handoff_cursor.store_seq]
        if len(handoffs) != 1:
            raise ValueError("cancelled subagent has no exact persisted handoff")
        handoff = handoffs[0]
        artifact = ArtifactRef.from_dict(_thaw_json(handoff.payload["full_output_artifact"]))
        envelope = HandoffEnvelope.from_dict(_thaw_json(handoff.payload["handoff_envelope"]))
        source_cursor = EventCursor(terminal.store_seq, terminal.event_id)
        if (event.attempt != consumer or event.event_type != "skeleton.subagent_tool_settlement"
                or any(payload[key] != value for key, value in identity.items())
                or payload["tool_name"] != call["tool_name"] or payload["status"] != "cancelled"
                or event.resource_refs != (artifact.ref,) or handoff.attempt != consumer
                or handoff.store_seq >= event.store_seq or handoff.resource_refs != (artifact.ref,)
                or envelope.child_attempt != child.store.attempt or envelope.status != HandoffStatus.FAILED
                or envelope.source_event_range != EventRange(source_cursor, source_cursor)
                or envelope.full_output_ref != artifact.ref or artifact.ref.to_dict() != payload["full_output_ref"]
                or envelope.byte_length != artifact.byte_length or envelope.sha256 != artifact.sha256
                or artifact.byte_length != payload["result_bytes"] or artifact.sha256 != payload["result_sha256"]
                or journal.read_full_verified(artifact=artifact) != canonical_bytes(body)):
            raise ValueError("cancelled subagent settlement contradicts its child")
        return build_subagent_settlement_projection(event, full_output=body)

    artifacts = ArtifactService(journal, sanitizer=_sanitize_artifact)
    prepared = artifacts.prepare_json_value(body, operation_id="cancelled-child.output." + sha256(
        canonical_bytes(identity)).hexdigest(), operation_binding={"source_event": terminal.event_id,
            "consumer_attempt": consumer.to_dict(), "call_id": call["call_id"]})
    if prepared.sanitized != canonical_bytes(body):
        raise ValueError("cancelled subagent output changed during sanitization")
    cursor = EventCursor(terminal.store_seq, terminal.event_id)
    envelope = HandoffEnvelope(child_run_id=child.store.attempt.attempt_id,
        child_attempt=child.store.attempt, status=HandoffStatus.FAILED,
        summary=body["summary"], full_output_ref=prepared.artifact.ref, artifact_refs=(),
        source_event_range=EventRange(cursor, cursor), byte_length=prepared.artifact.byte_length,
        sha256=prepared.artifact.sha256)
    projector = CanonicalSemanticEventProjector(attempt=consumer, artifacts=artifacts,
        payload_sanitizer=lambda _kind, value: value)
    draft = projector.project_handoff_envelope(envelope)
    payload = {**_thaw_json(draft.payload), "full_output_artifact": prepared.artifact.to_dict()}
    handoff = SemanticEventDraft(event_id=draft.event_id, event_type=draft.event_type,
        attempt=consumer, operation_id=draft.operation_id, payload=payload, resource_refs=draft.resource_refs)
    appended = journal.append_with_artifacts(request=handoff.to_append_request(), artifacts=(prepared.pending,),
        precondition=lambda current: _prove_cancelled_edge(pending, parent, child, current))
    payload = {**identity, "tool_name": call["tool_name"], "status": "cancelled", "outputs": None,
        "error": body["error"], "summary": body["summary"],
        "full_output_ref": prepared.artifact.ref.to_dict(), "result_bytes": prepared.artifact.byte_length,
        "result_sha256": prepared.artifact.sha256, "handoff_cursor": appended.cursor.to_dict()}
    _subagent_tool_settlement(payload)
    settlement = SemanticEventDraft(event_id="event." + operation,
        event_type="skeleton.subagent_tool_settlement", attempt=consumer, operation_id=operation,
        payload=payload, resource_refs=(prepared.artifact.ref,))
    request = settlement.to_append_request()
    event = journal.append_with_artifacts(request=request, artifacts=(),
        precondition=lambda current: _prove_cancelled_edge(pending, parent, child, current)).event
    if (event.event_id != request.event_id or event.attempt != request.attempt
            or event.event_type != request.event_type or event.operation != request.operation
            or event.payload != request.payload or event.resource_refs != request.resource_refs):
        raise ValueError("cancelled subagent append returned another receipt")
    return build_subagent_settlement_projection(event, full_output=body)


def settle_cancelled_subagents(pending):
    """Return only call-bound own-child receipts, innermost before parent."""
    projections = []
    for parent, child in reversed(list(zip(pending.chain, pending.chain[1:]))):
        if parent.request_payload.get("schema") == "pupu.skeleton_subagent_wait.v2":
            projections.append(_settle_edge(pending, parent, child))
    return projections
