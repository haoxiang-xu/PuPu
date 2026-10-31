"""Graph-owned production approvals, using the canonical Context ingress.

HTTP identities belong to the root transport. The request and its descendant
session/source identities remain exactly those persisted by the actual runner.
Cold lookup never constructs a provider or consults the live resource store.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from hashlib import sha256
import json
import time
from types import SimpleNamespace
from typing import Any

from unchain.context import ArtifactService, ContextInputIngress, HostResolvedInteractionInput
from unchain.context.interaction_acceptance import assert_interaction_unresolved
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.interaction import InteractionRequest, build_interaction_receipt
from unchain.interaction.durable import strict_json_digest
from unchain.interaction.runtime import normalize_interaction_response
from unchain.journal import (ArtifactRef, AttemptRef, DurableEventSink, PreparedSemanticEvent,
    ResourceRef, JournalAppendRequest, build_operation_ref)
from unchain.journal.models import _thaw_json
from unchain.skeleton import prepare_agent_graph, prepare_workflow
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.hooks_runtime import HOOK_CHILD_WAIT_SCHEMA, validate_hook_child_wait
from unchain.skeleton.workflow_runtime import SkeletonWorkflowCallRuntime

from durable_interaction_host import (DurableInteractionHostError, DurableInteractionReceiptHandoff,
    DurableInteractionReceiptResult, _durable_response, _interaction_commit_lock,
    _interaction_runtime, _presentation_for_request, load_execution_attempt_binding)
from skeleton_production_state import load_active_launch, assert_launch_current


_TOOL_WAIT = "unchain.skeleton_tool_approval_wait.v1"
_WORKFLOW_WAIT = "unchain.skeleton_workflow_call_wait.v1"
_AGENT_WAITS = {"pupu.skeleton_subagent_wait.v1", "pupu.skeleton_subagent_wait.v2"}
_AGENT_FIELDS = frozenset({"schema", "parent_graph_id", "parent_node_invocation_id", "parent_kernel_node_id",
    "child_graph_id", "child_attempt_id", "entry_id", "definition_digest", "child_guard_session_id",
    "child_node_invocation_id", "child_wait_kind", "child_wait_id", "interaction_request", "mode"})
_TERMINAL = {"completed", "failed", "cancelled", "outcome_unknown"}
_TOOL_PRESENTATION = "pupu.skeleton.tool-presentation.v1"
_TOOL_PRESENTATION_EVENT = "pupu.skeleton.tool_presentation"
_PRESENTATION_KEYS = {"tool_name", "tool_display_name", "toolkit_id", "toolkit_name"}
_RECLAIMED_RECOVERY_GUARDS = set()


def _fail(code="skeleton_interaction_not_pending", message="Skeleton approval no longer belongs to the current graph."):
    raise DurableInteractionHostError(code, message, status_code=409, retryable=False)


@dataclass(frozen=True)
class SkeletonGraphWait:
    store: WorkflowExecutionStore
    record: Any
    request_payload: dict


@dataclass(frozen=True)
class SkeletonPendingInteraction:
    launch: Any
    request: InteractionRequest
    chain: tuple[SkeletonGraphWait, ...]
    root_node_invocation_id: str
    root_wait_id: str
    root_wait_kind: str
    leaf_store: WorkflowExecutionStore
    leaf_node_invocation_id: str
    leaf_wait_id: str
    leaf_node_type: str
    leaf_session_id: str
    leaf_source_run_id: str


def _node(store, active):
    nodes = [node for node in store.plan.snapshot()["nodes"] if node["id"] == active["node_id"]]
    if len(nodes) != 1:
        _fail()
    return nodes[0]


def _wait_status_allowed(record, *, allow_cancelled=False, allow_expired=False):
    if record is None:
        return False
    status = record.state["status"]
    return (status == "waiting" or allow_cancelled and status == "cancelled"
        or allow_expired and status == "failed" and (record.state["error"] or {}).get("code") == "interaction_expired")


def _waiting(store, *, allow_cancelled=False, allow_expired=False):
    record = store.load()
    if not _wait_status_allowed(record, allow_cancelled=allow_cancelled, allow_expired=allow_expired) or record.state["active"] is None:
        _fail()
    active = record.state["active"]
    if active["wait"] is None:
        _fail()
    raw = store.read_json(active["wait"]["request_ref"])
    if type(raw) is not dict:
        _fail()
    return SkeletonGraphWait(store, record, raw)


def _child_store(parent, plan, graph_id, attempt_id):
    return WorkflowExecutionStore(parent.store.journal, plan, graph_id=graph_id,
        attempt=AttemptRef(parent.store.attempt.generation, attempt_id))


def _prove_child(parent, child):
    parent_frames = deepcopy(parent.record.state["call_stack"])
    parent_frames[-1]["caller_node_invocation_id"] = parent.record.state["active"]["node_invocation_id"]
    expected = parent_frames + [{"execution_id": child.store.attempt.generation.execution_id,
        "graph_invocation_id": child.store.graph_id, "attempt_id": child.store.attempt.attempt_id,
        "definition_id": child.store.plan.document_id,
        "definition_digest": execution_definition_digest(child.store.plan)}]
    if child.record.state["call_stack"] != expected:
        _fail("skeleton_interaction_lineage_mismatch")


def _workflow_child(anchor, launch, *, allow_cancelled=False, allow_expired=False):
    active = anchor.record.state["active"]
    request = anchor.request_payload
    fields = {"schema", "parent_graph_id", "child_graph_id", "child_attempt_id", "workflow_id", "revision_id", "definition_digest"}
    if set(request) != fields or request.get("schema") != _WORKFLOW_WAIT or _node(anchor.store, active)["type"] != "workflow_call":
        _fail()
    runtime = SkeletonWorkflowCallRuntime(anchor.store, launch.workflows.resolve)
    published, plan = runtime._resolve(active["node_id"])
    graph_id, attempt_id, digest = runtime._identity(SimpleNamespace(graph_id=anchor.store.graph_id,
        node_invocation_id=active["node_invocation_id"]), published, plan)
    if request != {"schema": _WORKFLOW_WAIT, "parent_graph_id": anchor.store.graph_id,
            "child_graph_id": graph_id, "child_attempt_id": attempt_id, "workflow_id": published.workflow_id,
            "revision_id": published.revision_id, "definition_digest": digest}:
        _fail("skeleton_interaction_lineage_mismatch")
    if active["wait"]["id"] != graph_id:
        _fail("skeleton_interaction_lineage_mismatch")
    child = _waiting(_child_store(anchor, plan, graph_id, attempt_id), allow_cancelled=allow_cancelled, allow_expired=allow_expired)
    _prove_child(anchor, child)
    return child


def _agent_child(anchor, manifests, *, allow_cancelled=False, allow_expired=False):
    active = anchor.record.state["active"]
    request = anchor.request_payload
    fields = _AGENT_FIELDS | ({"parent_tool_call"} if request.get("schema") == "pupu.skeleton_subagent_wait.v2" else set())
    if (set(request) != fields or request.get("schema") not in _AGENT_WAITS
            or _node(anchor.store, active)["type"] != "agent"
            or request["parent_graph_id"] != anchor.store.graph_id
            or request["parent_node_invocation_id"] != active["node_invocation_id"]
            or request["parent_kernel_node_id"] != active["node_id"]):
        _fail()
    children = [child for child in manifests if child["kernel_node_id"] == active["node_id"]
        and child["entry_id"] == request["entry_id"]]
    if len(children) != 1:
        _fail()
    manifest = children[0]
    if request["mode"] not in manifest["allowed_modes"]:
        _fail("skeleton_interaction_lineage_mismatch")
    if "parent_tool_call" in request:
        call = request["parent_tool_call"]
        if (type(call) is not dict or set(call) != {"call_id", "tool_name"}
                or any(type(value) is not str or not value.strip() for value in call.values())):
            _fail("skeleton_interaction_lineage_mismatch")
    plan = prepare_agent_graph(manifest["document"])
    basis = "\0".join((anchor.store.graph_id, request["child_attempt_id"], request["entry_id"]))
    graph_id = anchor.store.graph_id + ".subagent." + sha256(basis.encode("utf-8", "surrogatepass")).hexdigest()
    if graph_id != request["child_graph_id"] or execution_definition_digest(plan) != request["definition_digest"]:
        _fail("skeleton_interaction_lineage_mismatch")
    wait_identity = "\0".join((graph_id, request["child_wait_id"]))
    if active["wait"]["id"] != "subagent." + sha256(wait_identity.encode("utf-8", "surrogatepass")).hexdigest():
        _fail("skeleton_interaction_lineage_mismatch")
    child = _waiting(_child_store(anchor, plan, graph_id, request["child_attempt_id"]), allow_cancelled=allow_cancelled, allow_expired=allow_expired)
    _prove_child(anchor, child)
    child_active = child.record.state["active"]
    if (child_active["node_invocation_id"] != request["child_node_invocation_id"]
            or child_active["wait"]["kind"] != request["child_wait_kind"]
            or child_active["wait"]["id"] != request["child_wait_id"]):
        _fail()
    session = request["child_guard_session_id"]
    root_session = anchor.store.attempt.generation.execution_id
    if type(session) is not str or not session.startswith(root_session + ":"):
        _fail("skeleton_interaction_session_mismatch")
    return child, manifest.get("subagents", []), session


def _tool_request(anchor, raw):
    active = anchor.record.state["active"]
    if (set(raw) != {"schema", "interaction", "expires_at_ms"} or raw.get("schema") != _TOOL_WAIT
            or type(raw["expires_at_ms"]) is not int or raw["expires_at_ms"] < 0):
        _fail()
    request = InteractionRequest.from_dict(raw["interaction"])
    subject = request.subject
    node = _node(anchor.store, active)
    fields = {"schema", "document_id", "graph_id", "node_id", "node_invocation_id", "node_attempt_id",
        "tool_name", "arguments_sha256", "tool_schema_sha256"}
    if (request.kind != "tool_approval" or request.source_run_id != anchor.store.graph_id
            or request.occurrence != "tool:" + active["node_invocation_id"]
            or type(subject) is not dict or set(subject) != fields or subject.get("schema") != _TOOL_WAIT
            or subject.get("graph_id") != anchor.store.graph_id
            or subject.get("document_id") != anchor.store.plan.document_id
            or subject.get("node_id") != active["node_id"]
            or subject.get("node_invocation_id") != active["node_invocation_id"]
            or subject.get("node_attempt_id") != active["node_attempt_id"]):
        _fail("skeleton_interaction_lineage_mismatch")
    payload = request.payload
    if (type(payload) is not dict or payload.get("tool_name") != node["config"]["tool"]["name"]
            or subject["tool_name"] != payload.get("tool_name")
            or payload.get("call_id") != active["node_invocation_id"]
            or subject["arguments_sha256"] != strict_json_digest(payload.get("arguments"))):
        _fail("skeleton_interaction_lineage_mismatch")
    return request


def _descend(anchor, launch, manifests, session, chain, *, allow_cancelled=False, allow_expired=False):
    if len(chain) >= 32 or any(item.store.graph_id == anchor.store.graph_id for item in chain):
        _fail("skeleton_interaction_lineage_mismatch")
    chain = chain + (anchor,)
    active = anchor.record.state["active"]
    wait = active["wait"]
    if wait["kind"] == "child":
        if anchor.request_payload.get("schema") == _WORKFLOW_WAIT:
            return _descend(_workflow_child(anchor, launch, allow_cancelled=allow_cancelled, allow_expired=allow_expired), launch, [], session, chain,
                allow_cancelled=allow_cancelled, allow_expired=allow_expired)
        if anchor.request_payload.get("schema") in _AGENT_WAITS:
            child, nested, child_session = _agent_child(anchor, manifests, allow_cancelled=allow_cancelled, allow_expired=allow_expired)
            result = _descend(child, launch, nested, child_session, chain, allow_cancelled=allow_cancelled, allow_expired=allow_expired)
            # The wrapper is an immutable assertion of the actual child wait.
            actual = child.request_payload
            if child.record.state["active"]["wait"]["kind"] == "child" and actual.get("schema") in _AGENT_WAITS:
                actual = actual["interaction_request"]
            if anchor.request_payload["interaction_request"] != actual:
                _fail("skeleton_interaction_lineage_mismatch")
            return result
        _fail()
    if wait["kind"] != "interaction":
        _fail()
    node_type = _node(anchor.store, active)["type"]
    if node_type == "tool_call":
        request = _tool_request(anchor, anchor.request_payload)
        if request.session_id not in {session, launch.descriptor["session_id"]}:
            _fail("skeleton_interaction_session_mismatch")
    elif node_type == "agent":
        request = InteractionRequest.from_dict(anchor.request_payload)
        if request.source_run_id != active["node_attempt_id"] or request.session_id != session:
            _fail("skeleton_interaction_session_mismatch")
        hook_wait = request.subject.get("hook_child_wait") if type(request.subject) is dict else None
        if hook_wait is not None:
            chain = _hook_chain(anchor, launch, request, hook_wait, chain, allow_cancelled=allow_cancelled, allow_expired=allow_expired)
    else:
        _fail()
    if request.interaction_id != wait["id"]:
        _fail()
    return request, anchor, chain


def _hook_chain(parent, launch, request, raw, chain, *, allow_cancelled=False, allow_expired=False):
    active = parent.record.state["active"]
    if (type(raw) is not dict or raw.get("schema") != HOOK_CHILD_WAIT_SCHEMA
            or raw.get("parent_graph_id") != parent.store.graph_id
            or raw.get("parent_node_invocation_id") != active["node_invocation_id"]):
        _fail()
    call = raw.get("parent_tool_call") or {}
    child_request = validate_hook_child_wait(raw, parent_call_id=call.get("call_id"), parent_tool_name=call.get("tool_name"))
    if request.payload != child_request.payload or request.response_contract != child_request.response_contract:
        _fail()
    snapshot = parent.store.plan.snapshot()
    pool_ids = {edge["target_node_id"] for edge in snapshot["edges"] if edge["kind"] == "attach"
        and edge["source_node_id"] == active["node_id"]}
    hooks = [hook for node in snapshot["nodes"] if node["id"] in pool_ids and node["type"] == "hooks_pool"
        for hook in node["config"]["hooks"] if hook["id"] == raw["hook_id"]]
    if len(hooks) != 1 or hooks[0]["workflow"] != {"workflow_id": raw["workflow_id"], "revision_id": raw["revision_id"]}:
        _fail()
    published = launch.workflows.resolve(raw["workflow_id"], raw["revision_id"])
    plan = prepare_workflow(published.document)
    if execution_definition_digest(plan) != raw["definition_digest"]:
        _fail()
    basis = "\0".join((parent.store.graph_id, active["node_invocation_id"], call["call_id"],
        raw["hook_id"], raw["workflow_id"], raw["revision_id"]))
    suffix = sha256(basis.encode("utf-8", "surrogatepass")).hexdigest()
    child = _waiting(_child_store(parent, plan, parent.store.graph_id + ".hook." + suffix, "hook." + suffix),
        allow_cancelled=allow_cancelled, allow_expired=allow_expired)
    _prove_child(parent, child)
    actual, leaf, expanded = _descend(child, launch, [], request.session_id, chain, allow_cancelled=allow_cancelled, allow_expired=allow_expired)
    leaf_active = leaf.record.state["active"]
    if (actual.to_dict() != child_request.to_dict() or raw["child_graph_id"] != leaf.store.graph_id
            or raw["child_attempt_id"] != leaf.store.attempt.attempt_id
            or raw["child_node_invocation_id"] != leaf_active["node_invocation_id"]
            or raw["child_wait_id"] != leaf_active["wait"]["id"]):
        _fail("skeleton_interaction_lineage_mismatch")
    return expanded


def resolve_pending_skeleton_interaction(session_id, *, expected_owner_chat_id=None):
    launch = load_active_launch(session_id, expected_owner_chat_id=expected_owner_chat_id)
    if launch is None:
        return None
    with _interaction_commit_lock(session_id):
        _recover_stopped_skeleton_owner(launch)
        pending = _pending_for_launch(launch, allow_expired=True)
        if pending is not None and _expire_tool_wait(pending):
            _fail("interaction_expired", "This Tool Call approval has expired; the tool was not executed.")
        return pending


def _prove_recovery_source(launch, attempt_id):
    root = launch.descriptor["root_run_id"]
    binding = load_execution_attempt_binding(launch.descriptor["session_id"], attempt_id) if attempt_id != root else None
    if attempt_id != root and (binding is None or binding.get("source_attempt_id") != root):
        _fail("skeleton_recovery_source_mismatch", "Stopped execution does not belong to this Skeleton root.")


def _recover_running_launch(launch, attempt_id):
    _prove_recovery_source(launch, attempt_id)
    assert_launch_current(launch)
    journal = _mutable_journal(launch)
    store = WorkflowExecutionStore(journal, launch.store.plan, graph_id=launch.store.graph_id, attempt=launch.store.attempt)
    record = store.load()
    if record.state["status"] == "running":
        # Official conservative recovery; no handler can dispatch a tool or
        # turn a possibly performed effect into a fresh invocation.
        result = DurableWorkflowRunner(store, {}).recover()
        if result.status != "outcome_unknown":
            _fail("skeleton_recovery_incomplete")
    if store.load().state["status"] == "outcome_unknown":
        from durable_interaction_host import _execution_runtime
        # Revoke only the dead transport's independent core lease. This
        # administrative fence cannot cancel a successor or relabel the
        # graph's possibly performed effect as an unexecuted cancellation.
        _execution_runtime().request_cancel(launch.descriptor["session_id"], attempt_id, reason="outcome_unknown")
    return store.load()


def _recover_stopped_skeleton_owner(launch):
    record = launch.store.load()
    if record is None or record.state["status"] not in {"running", "outcome_unknown"}:
        return
    from session_execution_guard import (snapshot_session_guard, acquire_run_guard,
        release_run_guard, SessionExecutionInProgress)
    session = launch.descriptor["session_id"]
    guard = snapshot_session_guard(session_id=session)
    if guard is None or guard.state != "active":
        return  # Missing ownership evidence is not proof of a dead worker.
    _prove_recovery_source(launch, guard.attempt_id)
    before = strict_json_digest(guard.to_dict())
    try:
        disposition = acquire_run_guard(session, guard.attempt_id)
    except SessionExecutionInProgress:
        return  # A live foreign process retains its exclusive authority.
    if disposition == "acquired":
        release_run_guard(session, guard.attempt_id)
        return  # The guard disappeared between reads; absence proves nothing.
    if disposition != "reclaimed" and before not in _RECLAIMED_RECOVERY_GUARDS:
        return  # Ordinary same-process reentrancy is not takeover authority.
    owned = snapshot_session_guard(session_id=session)
    proof = strict_json_digest(owned.to_dict())
    _RECLAIMED_RECOVERY_GUARDS.add(proof)
    _recover_running_launch(launch, guard.attempt_id)
    import execution_control
    execution_control.mark_failed(session, guard.attempt_id, reason="outcome_unknown")
    release_run_guard(session, guard.attempt_id)
    _RECLAIMED_RECOVERY_GUARDS.discard(proof)


def recover_skeleton_transport_takeover(*, session_id, attempt_id, owner_chat_id, registration, running):
    """Settle a graph at the existing transport's proved dead-owner fence."""
    import unchain_adapter as host
    if not host._execution_reclaimed_stopped_owner(registration, running):
        return
    with _interaction_commit_lock(session_id):
        launch = load_active_launch(session_id, expected_owner_chat_id=owner_chat_id)
        if launch is not None:
            _recover_running_launch(launch, attempt_id)


def recover_skeleton_before_start(*, session_id, attempt_id, owner_chat_id):
    if type(owner_chat_id) is not str or not owner_chat_id or owner_chat_id != owner_chat_id.strip():
        raise DurableInteractionHostError("skeleton_active_context_required",
            "Skeleton chat requires a validated chat owner.", status_code=422, retryable=False)
    with _interaction_commit_lock(session_id):
        launch = load_active_launch(session_id, expected_owner_chat_id=owner_chat_id, allow_terminal_stale=True)
        if launch is None:
            return
        _recover_stopped_skeleton_owner(launch)
        if launch.store.load().state["status"] != "outcome_unknown":
            return
        root = launch.descriptor["root_run_id"]
        binding = load_execution_attempt_binding(session_id, attempt_id) if attempt_id != root else None
        if attempt_id == root or binding is not None and binding.get("source_attempt_id") == root:
            _fail("outcome_unknown", "This interrupted attempt cannot be replayed safely. Review its unknown outcome before starting a new attempt.")


def _pending_for_launch(launch, *, allow_cancelled=False, allow_expired=False):
    try:
        record = launch.store.load()
        if not _wait_status_allowed(record, allow_cancelled=allow_cancelled, allow_expired=allow_expired) or record.state["active"] is None:
            return None
        if record.state["active"]["wait"] is None:
            return None
        assert_launch_current(launch)
        anchor = _waiting(launch.store, allow_cancelled=allow_cancelled, allow_expired=allow_expired)
        request, leaf, chain = _descend(anchor, launch, launch.selection.to_dict()["subagents"],
            launch.descriptor["session_id"], (), allow_cancelled=allow_cancelled, allow_expired=allow_expired)
        root_active = anchor.record.state["active"]
        leaf_active = leaf.record.state["active"]
        return SkeletonPendingInteraction(launch, request, chain, root_active["node_invocation_id"],
            root_active["wait"]["id"], root_active["wait"]["kind"], leaf.store,
            leaf_active["node_invocation_id"], leaf_active["wait"]["id"], _node(leaf.store, leaf_active)["type"],
            request.session_id, request.source_run_id)
    except DurableInteractionHostError:
        raise
    except Exception as exc:
        raise DurableInteractionHostError("skeleton_interaction_invalid", "Skeleton approval lineage is invalid.", status_code=409) from exc


def _mutable_journal(launch):
    from memory_v2_unchain_active_bridge import _cold_context_store
    return _cold_context_store().bind_execution(launch.descriptor["session_id"])


def _attempt(pending):
    return AttemptRef(pending.launch.store.attempt.generation, pending.request.source_run_id)


def _prove_current(pending, snapshot, *, status="waiting"):
    assert_launch_current(pending.launch, snapshot)
    for anchor in pending.chain:
        chain = anchor.store._snapshot(snapshot, plan=anchor.store.plan)
        if (not chain or chain[-1].event.event_id != anchor.record.event_id
                or chain[-1].state != anchor.record.state or chain[-1].state["status"] != status
                or chain[-1].state["paused"]):
            _fail()


def _requested(pending, snapshot):
    attempt = _attempt(pending)
    events = [event for event in snapshot.events if event.attempt == attempt and event.event_type == "interaction.requested"
        and event.payload.get("interaction_id") == pending.request.interaction_id]
    if len(events) != 1 or _thaw_json(events[0].payload).get("interaction_request") != pending.request.to_dict():
        _fail("skeleton_interaction_request_mismatch")


def _accepted(pending, snapshot=None, *, normalize=True):
    journal = pending.launch.journal
    snapshot = snapshot or journal.capture_snapshot()
    events = [event for event in snapshot.events if event.attempt == _attempt(pending)
        and event.event_type == "interaction.resolved" and event.payload.get("interaction_id") == pending.request.interaction_id]
    if not events:
        return None
    if len(events) != 1:
        _fail("skeleton_interaction_receipt_conflict")
    _requested(pending, snapshot)
    payload = events[0].payload
    artifact = ArtifactRef(ResourceRef.from_dict(payload["content_ref"]), "application/json",
        payload["content_bytes"], payload["content_sha256"], payload.get("preview", ""))
    raw = journal.read_full_verified(artifact=artifact)
    value = json.loads(raw)
    if (type(value) is not dict or set(value) != {"interaction_id", "response", "submitted_by"}
            or value["interaction_id"] != pending.request.interaction_id or value["submitted_by"] != "user"):
        _fail("skeleton_interaction_receipt_conflict")
    response = normalize_interaction_response(pending.request, value["response"]) if normalize else value["response"]
    return build_interaction_receipt(pending.request, response,
        submitted_by="user", submitted_at_ms=0)


def _canonical_components(pending):
    journal = _mutable_journal(pending.launch)
    from memory_v2_unchain_run_binding import _sanitize_artifact, _sanitize_event_payload
    def sanitize(event_type, payload):
        result = _sanitize_event_payload(event_type, payload)
        # Match build_skeleton_node_bundle exactly. Kernel node events belong
        # to the original root even when the checkpoint is in a child session.
        if pending.leaf_node_type == "agent":
            root = pending.launch.descriptor["root_run_id"]
            if result.get("parent_run_id", root) != root:
                _fail("skeleton_interaction_lineage_mismatch")
            result["parent_run_id"] = root
        return result
    projector = CanonicalSemanticEventProjector(attempt=_attempt(pending),
        artifacts=ArtifactService(journal, sanitizer=_sanitize_artifact), payload_sanitizer=sanitize)
    return journal, projector, DurableEventSink(journal, _attempt(pending), projector)


def _publish_request_if_needed(pending, journal, projector, sink, *, status="waiting"):
    snapshot = journal.capture_snapshot()
    _prove_current(pending, snapshot, status=status)
    requests = [event for event in snapshot.events if event.attempt == _attempt(pending)
        and event.event_type == "interaction.requested" and event.payload.get("interaction_id") == pending.request.interaction_id]
    if not requests:
        if pending.leaf_node_type != "tool_call":
            _fail("skeleton_interaction_request_missing")
        draft = projector({"type": "interaction_requested", "run_id": _attempt(pending).attempt_id,
            "interaction_id": pending.request.interaction_id, "interaction_request": pending.request.to_dict()})
        if _thaw_json(draft.payload).get("interaction_request") != pending.request.to_dict():
            _fail("skeleton_interaction_request_mismatch")
        sink.append_prepared(PreparedSemanticEvent(draft=draft, artifacts=()),
            precondition=lambda current: _prove_current(pending, current, status=status))
    _requested(pending, journal.capture_snapshot())


def _tool_wait_expired(pending):
    leaf = pending.chain[-1]
    return (_node(leaf.store, leaf.record.state["active"])["type"] == "tool_call"
        and leaf.request_payload.get("schema") == _TOOL_WAIT
        and time.time_ns() // 1_000_000 > leaf.request_payload["expires_at_ms"])


def _close_expired_kernel_checkpoint(pending):
    if pending.leaf_node_type != "agent":
        return None
    from unchain.interaction import InteractionNotPendingError
    runtime = _interaction_runtime()
    try:
        closed = runtime.cancel_pending(pending.request.session_id, source_run_id=pending.request.source_run_id,
            expected_interaction_id=pending.request.interaction_id, reason="interaction_expired")
    except InteractionNotPendingError:
        closed = runtime.load(pending.request.session_id, interaction_id=pending.request.interaction_id, require_active=False)
    if (closed is None or closed.request.to_dict() != pending.request.to_dict()
            or (closed.application or {}).get("applied_checkpoint_id") != "cancelled:" + closed.checkpoint_id):
        _fail("skeleton_interaction_lineage_mismatch")
    return closed.receipt


def _expire_tool_wait(pending):
    """Finish an expired, verified graph lineage without executing its tool.

    Failed-expiry anchors retain their immutable wait refs. They are admitted
    only for completing this transition after a crash; ordinary failures are
    never interpreted as pending interactions.
    """
    leaf = pending.chain[-1]
    if _node(leaf.store, leaf.record.state["active"])["type"] != "tool_call":
        return False
    now_ms = time.time_ns() // 1_000_000
    if (leaf.request_payload.get("schema") != _TOOL_WAIT
            or now_ms <= leaf.request_payload["expires_at_ms"]
            and all(anchor.record.state["status"] == "waiting" for anchor in pending.chain)):
        return False
    from unchain.skeleton.errors import SkeletonValidationError
    from unchain.skeleton.tool_runtime import SkeletonToolRuntime
    from unchain.tools import Toolkit
    journal = _mutable_journal(pending.launch)
    for anchor in reversed(pending.chain):
        assert_launch_current(pending.launch)
        store = WorkflowExecutionStore(journal, anchor.store.plan, graph_id=anchor.store.graph_id, attempt=anchor.store.attempt)
        current = store.load()
        if current.event_id != anchor.record.event_id or current.state != anchor.record.state:
            _fail()
        if current.state["status"] == "failed":
            continue
        if anchor is leaf:
            # Exact official type required by the installed lifecycle method.
            # Its empty Toolkit cannot dispatch any tool, nor is run() called.
            lifecycle = SkeletonToolRuntime(store.plan, Toolkit(), pending.request.session_id, lambda: now_ms)
            runner = DurableWorkflowRunner(store, {"tool_call": lifecycle})
            runner.expire_tool_interaction(current.state["active"]["wait"]["id"],
                node_invocation_id=current.state["active"]["node_invocation_id"], now_ms=now_ms)
        else:
            runner = DurableWorkflowRunner(store, {})
            runner._failed(current, SkeletonValidationError("interaction_expired",
                runner._runtime_path(current.state["active"]["node_id"]), "Descendant Tool approval expired"))
    terminal = _pending_for_launch(pending.launch, allow_expired=True)
    if terminal is None or terminal.request.to_dict() != pending.request.to_dict():
        _fail("skeleton_interaction_lineage_mismatch")
    abandoned = _close_expired_kernel_checkpoint(terminal)
    journal, projector, sink = _canonical_components(terminal)
    _publish_request_if_needed(terminal, journal, projector, sink, status="failed")
    if _accepted(terminal, normalize=False) is None:
        response = abandoned.response if abandoned is not None else {"expired": True, "reason": "interaction_expired"}
        def accept_expiry(snapshot):
            _prove_current(terminal, snapshot, status="failed")
            _requested(terminal, snapshot)
            already = _accepted(terminal, snapshot, normalize=False)
            if already is not None and already.response != response:
                _fail("interaction_receipt_conflict")
            if already is None:
                assert_interaction_unresolved(snapshot, attempt=_attempt(terminal), interaction_id=terminal.request.interaction_id)
        ContextInputIngress(attempt=_attempt(terminal), projector=projector, sink=sink).persist(
            HostResolvedInteractionInput(_attempt(terminal), terminal.request.interaction_id, response, "user"),
            precondition=accept_expiry)
    from session_execution_guard import snapshot_session_guard, consume_parked_session_guard
    guard = snapshot_session_guard(session_id=pending.launch.descriptor["session_id"])
    if (guard is not None and guard.state == "parked"
            and guard.interaction_id == pending.request.interaction_id
            and guard.interaction_source_attempt_id == pending.launch.descriptor["root_run_id"]):
        import execution_control
        execution_control.mark_failed(guard.session_id, guard.attempt_id, reason="interaction_expired")
        consume_parked_session_guard(session_id=guard.session_id, interaction_id=guard.interaction_id,
            source_attempt_id=guard.interaction_source_attempt_id)
    return True


def get_pending_skeleton_interaction(session_id):
    try:
        return _pending_presentation(session_id)
    except DurableInteractionHostError:
        raise
    except Exception as exc:
        raise DurableInteractionHostError("skeleton_interaction_invalid", "Skeleton approval is unavailable or invalid.",
            status_code=409) from exc


def _tool_presentation_metadata(pending, journal=None):
    journal = journal or pending.launch.journal
    matches = [event for event in journal.capture_snapshot().events
        if event.event_type == _TOOL_PRESENTATION_EVENT and event.attempt == _attempt(pending)
        and event.payload.get("interaction_id") == pending.request.interaction_id]
    if not matches:
        return None  # Older launches have no host presentation snapshot.
    if len(matches) != 1:
        _fail("skeleton_tool_presentation_invalid")
    payload = _thaw_json(matches[0].payload)
    metadata = payload.get("metadata")
    operation = "tool-presentation." + sha256(pending.request.interaction_id.encode()).hexdigest()
    if (set(payload) != {"schema", "interaction_id", "request_sha256", "metadata"}
            or matches[0].event_id != "event." + operation
            or matches[0].operation != build_operation_ref(operation, domain=_TOOL_PRESENTATION, payload=payload)
            or payload["schema"] != _TOOL_PRESENTATION
            or payload["request_sha256"] != strict_json_digest(pending.request.to_dict())
            or type(metadata) is not dict or set(metadata) != _PRESENTATION_KEYS
            or any(type(value) is not str or not value for value in metadata.values())
            or metadata["tool_name"] != pending.request.payload["tool_name"]):
        _fail("skeleton_tool_presentation_invalid")
    return metadata


def publish_skeleton_tool_presentation(pending, metadata):
    """Retain display-only host facts under the same exact approval identity."""
    if pending.leaf_node_type != "tool_call":
        return
    if (type(metadata) is not dict or set(metadata) != _PRESENTATION_KEYS
            or any(type(value) is not str or not value for value in metadata.values())
            or metadata["tool_name"] != pending.request.payload["tool_name"]):
        _fail("skeleton_tool_presentation_invalid")
    with _interaction_commit_lock(pending.launch.descriptor["session_id"]):
        journal, projector, sink = _canonical_components(pending)
        _publish_request_if_needed(pending, journal, projector, sink)
        if _tool_presentation_metadata(pending, journal) is not None:
            return
        payload = {"schema": _TOOL_PRESENTATION, "interaction_id": pending.request.interaction_id,
            "request_sha256": strict_json_digest(pending.request.to_dict()), "metadata": deepcopy(metadata)}
        operation = "tool-presentation." + sha256(pending.request.interaction_id.encode()).hexdigest()
        request = JournalAppendRequest(event_id="event." + operation, event_type=_TOOL_PRESENTATION_EVENT,
            attempt=_attempt(pending), operation=build_operation_ref(operation, domain=_TOOL_PRESENTATION, payload=payload),
            payload=payload)
        journal.append_with_artifacts(request=request, artifacts=(),
            precondition=lambda snapshot: _prove_current(pending, snapshot))


def _pending_presentation(session_id):
    try:
        pending = resolve_pending_skeleton_interaction(session_id)
    except DurableInteractionHostError as error:
        if error.code != "interaction_expired":
            raise
        return None
    if pending is None:
        return None
    receipt = _accepted(pending)
    subject = pending.request.subject if type(pending.request.subject) is dict else {}
    presentation = _presentation_for_request(pending.request)
    if pending.leaf_node_type == "tool_call":
        metadata = _tool_presentation_metadata(pending)
        if metadata is not None:
            presentation["tool_call"].update(metadata)
            presentation["trace_frame"]["payload"].update(metadata)
    result = {"status": "receipt_recorded" if receipt else "awaiting_response", "session_id": session_id,
        "interaction_id": pending.request.interaction_id, "source_run_id": pending.launch.descriptor["root_run_id"],
        "active_attempt_id": pending.launch.descriptor["root_run_id"], "kind": pending.request.kind,
        "provider": subject.get("provider", ""), "model": subject.get("model", ""),
        "presentation": presentation, "resume_available": True,
        "resume_kind": "skeleton", "resume_options": {},
        "interaction_source_run_id": pending.request.source_run_id,
        "interaction_session_id": pending.request.session_id}
    if receipt:
        approved = receipt.response.get("approved") if type(receipt.response) is dict else None
        result.update(receipt_id=receipt.receipt_id, resolution={"outcome": "approved" if approved is True else
            "denied" if approved is False else "submitted", "response": deepcopy(receipt.response)})
    return result


def record_skeleton_interaction_receipt(*, session_id, interaction_id, approved, reason="", modified_arguments=None, submitted_by="ui:pupu"):
    launch = load_active_launch(session_id)
    if launch is None:
        return None
    try:
        with _interaction_commit_lock(session_id):
            pending = _pending_for_launch(launch, allow_expired=True)
            if pending is None:
                record = launch.store.load()
                if record is not None and record.state["status"] == "cancelled":
                    _fail("execution_cancelled")
                return None
            if interaction_id != pending.request.interaction_id:
                _fail("interaction_not_found")
            if _expire_tool_wait(pending):
                _fail("interaction_expired", "This Tool Call approval has expired; the tool was not executed.")
            response = normalize_interaction_response(pending.request, _durable_response(request=pending.request,
                approved=approved, reason=reason, modified_arguments=modified_arguments))
            attempt = _attempt(pending)
            journal, projector, sink = _canonical_components(pending)
            _publish_request_if_needed(pending, journal, projector, sink)
            def accept(current):
                _prove_current(pending, current)
                if _tool_wait_expired(pending):
                    _fail("interaction_expired", "This Tool Call approval has expired; the tool was not executed.")
                _requested(pending, current)
                accepted = _accepted(pending, current)
                if accepted is not None:
                    if accepted.response != response:
                        _fail("interaction_receipt_conflict")
                else:
                    assert_interaction_unresolved(current, attempt=attempt, interaction_id=interaction_id)
            ContextInputIngress(attempt=attempt, projector=projector, sink=sink).persist(
                HostResolvedInteractionInput(attempt, interaction_id, response, "user"), precondition=accept)
            receipt = _accepted(pending)
            if receipt is None:
                _fail("interaction_receipt_missing")
            from durable_interaction_host import _session_execution_guard_call
            _session_execution_guard_call("bind_session_guard_receipt", session_id=session_id,
                interaction_id=interaction_id, source_attempt_id=pending.launch.descriptor["root_run_id"], receipt_id=receipt.receipt_id)
            return DurableInteractionReceiptResult({"status": "ok", "disposition": "receipt_recorded",
                "session_id": session_id, "interaction_id": interaction_id, "receipt_id": receipt.receipt_id},
                handoff=DurableInteractionReceiptHandoff.from_persisted_receipt(session_id=session_id, receipt=receipt))
    except DurableInteractionHostError as error:
        if error.code == "interaction_expired":
            with _interaction_commit_lock(session_id):
                current = _pending_for_launch(launch, allow_expired=True)
                if current is not None and current.request.interaction_id == interaction_id:
                    _expire_tool_wait(current)
        raise
    except Exception as exc:
        raise DurableInteractionHostError("interaction_canonical_conflict", "Skeleton approval was not accepted.", status_code=409) from exc


def cancel_skeleton_execution(*, session_id, attempt_id, source_attempt_id="", owner_chat_id="", expected_interaction_id="", reason="user_stop"):
    try:
        return _cancel_execution(session_id=session_id, attempt_id=attempt_id, source_attempt_id=source_attempt_id,
            owner_chat_id=owner_chat_id, expected_interaction_id=expected_interaction_id, reason=reason)
    except DurableInteractionHostError:
        raise
    except Exception as exc:
        raise DurableInteractionHostError("skeleton_cancel_incomplete", "Skeleton cancellation could not finish; retry this exact cancellation.",
            status_code=409, retryable=True) from exc


def _cancel_execution(*, session_id, attempt_id, source_attempt_id, owner_chat_id, expected_interaction_id, reason):
    launch = load_active_launch(session_id, expected_owner_chat_id=owner_chat_id or None)
    if launch is None:
        return None
    root_run = launch.descriptor["root_run_id"]
    binding = load_execution_attempt_binding(session_id, attempt_id) if attempt_id != root_run else None
    if (source_attempt_id and source_attempt_id != root_run or attempt_id != root_run
            and (binding is None or binding.get("source_attempt_id") != root_run)):
        _fail("skeleton_cancel_source_mismatch")
    with _interaction_commit_lock(session_id):
        _recover_stopped_skeleton_owner(launch)
        record = launch.store.load()
        if record is not None and record.state["status"] == "outcome_unknown":
            _fail("outcome_unknown", "This interrupted execution has an unknown outcome. Cancellation cannot undo effects that may already have occurred.")
        if record is None or record.state["status"] in _TERMINAL - {"cancelled"}:
            return None
        pending = _pending_for_launch(launch, allow_cancelled=True)
        if expected_interaction_id and (pending is None or pending.request.interaction_id != expected_interaction_id):
            _fail("interaction_cancel_target_not_pending")
        if pending is not None and not expected_interaction_id:
            _fail("interaction_cancel_target_required")
        journal = _mutable_journal(launch)
        assert_launch_current(launch)
        if pending is None:
            # A live worker must be fenced before its SDK response reaches
            # End. A parked approval instead closes its exact checkpoint CAS
            # first; that CAS intentionally rejects already-revoked roots.
            from durable_interaction_host import _execution_runtime, _execution_control_cancel
            _execution_runtime().request_cancel(session_id, attempt_id, reason=reason)
            _execution_control_cancel(session_id, attempt_id, reason=reason)
        # Cancel graph authority first; no late answer can pass its atomic wait proof.
        stores = [anchor.store for anchor in pending.chain] if pending else [launch.store]
        for store in stores:
            writable = WorkflowExecutionStore(journal, store.plan, graph_id=store.graph_id, attempt=store.attempt)
            DurableWorkflowRunner(writable, {}).cancel()
        kernel_cancelled = False
        cancelled_receipt = None
        if pending is not None and pending.leaf_node_type == "agent":
            runtime = _interaction_runtime()
            from unchain.interaction import InteractionNotPendingError
            try:
                cancelled = runtime.cancel_pending(pending.request.session_id,
                    source_run_id=pending.request.source_run_id, expected_interaction_id=pending.request.interaction_id, reason=reason)
            except InteractionNotPendingError:
                cancelled = runtime.load(pending.request.session_id, interaction_id=pending.request.interaction_id, require_active=False)
                application = cancelled.application or {}
                if (cancelled.request.to_dict() != pending.request.to_dict()
                        or not str(application.get("applied_checkpoint_id", "")).startswith("cancelled:")):
                    _fail("interaction_cancel_target_not_pending")
            kernel_cancelled = cancelled is not None
            cancelled_receipt = cancelled.receipt
        context_reconciled = False
        if pending is not None:
            # Reload the committed canceled graph chain. Acceptance proves these
            # exact states inside the same transaction as its semantic receipt.
            canceled_pending = _pending_for_launch(launch, allow_cancelled=True)
            if canceled_pending is None or canceled_pending.request.to_dict() != pending.request.to_dict():
                _fail("skeleton_interaction_lineage_mismatch")
            journal, projector, sink = _canonical_components(canceled_pending)
            _publish_request_if_needed(canceled_pending, journal, projector, sink, status="cancelled")
            accepted = _accepted(canceled_pending, normalize=False)
            if accepted is None:
                response = cancelled_receipt.response if cancelled_receipt is not None else {
                    "cancelled": True, "reason": reason or "execution_cancelled"}
                def accept_cancellation(snapshot):
                    _prove_current(canceled_pending, snapshot, status="cancelled")
                    _requested(canceled_pending, snapshot)
                    already = _accepted(canceled_pending, snapshot, normalize=False)
                    if already is not None and already.response != response:
                        _fail("interaction_receipt_conflict")
                    if already is None:
                        assert_interaction_unresolved(snapshot, attempt=_attempt(canceled_pending),
                            interaction_id=canceled_pending.request.interaction_id)
                ContextInputIngress(attempt=_attempt(canceled_pending), projector=projector, sink=sink).persist(
                    HostResolvedInteractionInput(_attempt(canceled_pending), canceled_pending.request.interaction_id,
                        response, "user"), precondition=accept_cancellation)
            context_reconciled = True
        return {"status": "ok", "execution_id": session_id, "attempt_id": attempt_id, "source_attempt_id": root_run,
            "disposition": "cancelled", "state": "cancelled", "execution": None,
            "cancellation": {"requested_at_ms": int(time.time() * 1000), "fencing_token": None, "reason": reason},
            "durable_interaction_cancelled": bool(pending) or kernel_cancelled, "context_interaction_reconciled": context_reconciled}


__all__ = ["SkeletonPendingInteraction", "SkeletonGraphWait", "resolve_pending_skeleton_interaction",
    "get_pending_skeleton_interaction", "record_skeleton_interaction_receipt", "cancel_skeleton_execution"]
