"""Read-only Builder projection over one verified, frozen execution prefix.

Core owns decoding, state transitions and artifact verification. Its private
reader seam is isolated below; no runner, provider, recovery or guard is opened.
"""
from __future__ import annotations

from copy import deepcopy
import json
import re
from types import SimpleNamespace

from unchain.interaction import InteractionRequest
from unchain.journal import BoundExecutionJournal
from unchain.skeleton import prepare_agent_graph, prepare_workflow
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.durable_store import WorkflowExecutionStore

from durable_interaction_host import DurableInteractionHostError
from skeleton_embedded_hooks import embedded_hook_bodies
from skeleton_production_state import load_active_launch, load_launch
from skeleton_resource_store import SkeletonResourceError
from skeleton_runtime_capability import require_skeleton_runtime


SCHEMA = "pupu.skeleton-run-observation.v1"
MAX_VIEW_BYTES = 8 * 1024 * 1024
_IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,199}\Z")
_POOLS = {"toolkit_pool", "subagent_pool", "hooks_pool"}
_GRAPH_EVENT = "skeleton.workflow_execution.saved"


def _refuse(code="skeleton_run_observation_invalid", message="Recorded run state could not be verified.", status=409):
    raise SkeletonResourceError(code, ("run",), message, status=status)


class _PrefixJournal(BoundExecutionJournal):
    """Narrow read capability for existing pure Host lineage validators.

    Descendant Stores inherit this capability from their parent. Live paging,
    writes and transparent attribute forwarding are deliberately unavailable.
    """
    def __init__(self, journal, snapshot):
        super().__init__(journal.execution_id)
        if snapshot.execution_id != self.execution_id:
            _refuse(message="The captured run prefix has a different execution.")
        self._source = journal
        self._prefix = snapshot
        self._bytes = len(json.dumps(snapshot.to_dict(), ensure_ascii=False, sort_keys=True,
                                    separators=(",", ":"), allow_nan=False).encode("utf-8"))

    def capture_snapshot(self, *, max_events=10000, max_bytes=32 * 1024 * 1024):
        if (type(max_events) is not int or max_events < 1 or type(max_bytes) is not int or max_bytes < 1
                or self._prefix.event_count > max_events or self._bytes > max_bytes):
            _refuse("skeleton_run_reader_unavailable", "The captured prefix exceeds the requested read bounds.", 503)
        return self._prefix

    def artifact_id_for(self, *, logical_kind, logical_key):
        return self._source.artifact_id_for(logical_kind=logical_kind, logical_key=logical_key)

    def read_full_verified(self, *, artifact):
        return self._source.read_full_verified(artifact=artifact)

    def read(self, *, after=None, limit=100):
        _refuse("skeleton_run_reader_unavailable", "Live paging is unavailable in a captured run view.", 503)

    def append(self, *, request):
        _refuse("skeleton_run_reader_unavailable", "A run view cannot append execution state.", 503)

    def append_with_artifacts(self, *, request, artifacts, precondition=None):
        _refuse("skeleton_run_reader_unavailable", "A run view cannot append execution state.", 503)


def _identifier(value, name):
    if type(value) is not str or _IDENTIFIER.fullmatch(value) is None:
        raise SkeletonResourceError("invalid_value", (name,), "An exact run identifier is required.")
    return value


def _frozen_plans(launch):
    """Only launch-owned documents; never a lookup of today's resource draft."""
    selection = launch.selection.to_dict()
    entries, documents = [selection], []
    while entries:
        entry = entries.pop()
        documents.append(entry["document"])
        entries.extend(entry["subagents"])
        if len(documents) + len(entries) > 512:
            _refuse("skeleton_run_view_limit", "The frozen run has too many diagrams.")
    documents.extend(row["document"] for row in launch.workflows.to_dict()["workflows"])
    # Embedded Hook bodies are admitted Workflow documents, not resources.
    documents.extend(body for document in tuple(documents)
                     for _address, body in embedded_hook_bodies(document))
    result = {}
    for document in documents:
        plan = prepare_agent_graph(document) if document["kind"] == "agent" else prepare_workflow(document)
        key = (plan.document_id, execution_definition_digest(plan))
        if key in result and result[key].snapshot() != plan.snapshot():
            _refuse(message="The frozen definition is ambiguous.")
        result[key] = plan
    return result


def _read_verified_execution_graphs(launch):
    """The sole private-Core seam, also used by Core's rebase classifier.

    _decode_event discovers opaque graph IDs; _snapshot verifies complete chains
    and contents against a frozen plan. Every read uses the SAME prefix. No
    manual base64/Journal decoder, mutable plan or graph-ID reconstruction.
    """
    if not all(callable(getattr(WorkflowExecutionStore, name, None))
               for name in ("_decode_event", "_snapshot")):
        _refuse("skeleton_run_reader_unavailable", "The installed run reader is unavailable.", 503)
    snapshot = launch.journal.capture_snapshot()
    if len(snapshot.events) > 20000:
        _refuse("skeleton_run_view_limit", "The run is too large for this view.")
    plans = _frozen_plans(launch)
    generation = launch.store.attempt.generation
    root_id = launch.store.graph_id
    decoded = []
    for index, event in enumerate(snapshot.events):
        if event.event_type == _GRAPH_EVENT and event.attempt.generation == generation:
            item = launch.store._decode_event(event, index)
            first = item.state["call_stack"][0]
            if (first["graph_invocation_id"] == root_id
                    and first["attempt_id"] == launch.store.attempt.attempt_id):
                decoded.append(item)
    graphs = {}
    owners = set()
    for item in decoded:
        graph_id = item.state["graph_id"]
        if graph_id in graphs:
            continue
        if len(graphs) >= 64 or item.event.attempt.attempt_id in owners:
            _refuse(message="Recorded graph ownership is ambiguous or exceeds the view limit.")
        final = item.state["call_stack"][-1]
        plan = plans.get((final["definition_id"], item.state["definition_digest"]))
        if plan is None:
            _refuse(message="A recorded graph has no matching frozen definition.")
        store = WorkflowExecutionStore(launch.journal, plan, graph_id=graph_id, attempt=item.event.attempt)
        chain = store._snapshot(snapshot, plan=plan, verify_contents=True)
        if not chain:
            _refuse()
        graphs[graph_id] = (store, chain)
        owners.add(item.event.attempt.attempt_id)
    if root_id not in graphs:
        _refuse("skeleton_run_not_recorded", "The run has not recorded its first graph state yet.")
    _prove_graph_lineage(graphs)
    return snapshot, graphs


def _prove_graph_lineage(graphs):
    """Join actual preceding caller invocations; latest-state similarity is insufficient."""
    for _graph_id, (store, chain) in graphs.items():
        state = chain[-1].state
        for index, frame in enumerate(state["call_stack"][:-1]):
            parent = graphs.get(frame["graph_invocation_id"])
            if parent is None:
                _refuse(message="Recorded child lineage has no parent.")
            parent_store, parent_chain = parent
            clean = {key: value for key, value in frame.items() if key != "caller_node_invocation_id"}
            if (parent_chain[-1].state["call_stack"] != state["call_stack"][:index] + [clean]
                    or store.attempt.generation != parent_store.attempt.generation):
                _refuse(message="Recorded child lineage disagrees with its parent.")
            preceding = [row for row in parent_chain if row.event.store_seq < chain[0].event.store_seq]
            at_admission = preceding[-1].state if preceding else None
            caller = frame["caller_node_invocation_id"]
            if (at_admission is None or at_admission["status"] not in {"running", "waiting"}
                    or at_admission["active"] is None
                    or at_admission["active"]["node_invocation_id"] != caller):
                _refuse(message="Recorded child does not belong to the preceding caller invocation.")
            if state["status"] == "completed":
                completed_at = next(row.event.store_seq for row in chain if row.state["status"] == "completed")
                closed = [row for row in parent_chain if any(
                    node["node_invocation_id"] == caller for node in row.state["completed"])
                    or (row.state["active"] is not None
                        and row.state["active"]["node_invocation_id"] == caller
                        and row.state["active"]["result_ref"] is not None)]
                if closed and completed_at >= closed[0].event.store_seq:
                    _refuse(message="Child completion is not before its caller's recorded result.")


def _approval_phase(store, record, snapshot):
    active = record.state["active"]
    wait = active["wait"]
    if wait["kind"] == "child":
        return "waiting", "waiting_for_child", None
    raw = store.read_json(wait["request_ref"])
    node = next(node for node in store.plan.snapshot()["nodes"] if node["id"] == active["node_id"])
    if node["type"] == "tool_call":
        # Existing pure lineage validator; not the pending getter/recovery path.
        from skeleton_production_interactions import SkeletonGraphWait, _tool_request
        request = _tool_request(SkeletonGraphWait(store, record, raw), raw)
    else:
        request = InteractionRequest.from_dict(raw)
        if request.source_run_id != active["node_attempt_id"]:
            _refuse(message="The recorded interaction has a different node attempt.")
    if request.interaction_id != wait["id"]:
        _refuse(message="The recorded interaction identity disagrees with the wait.")
    # A click is committed to canonical Context before the graph resumes. Its
    # wait.receipt_ref can therefore still be null. Reuse the existing pure
    # receipt reader against THIS prefix, never the mutating pending getter.
    from skeleton_production_interactions import _accepted
    pending = SimpleNamespace(request=request, launch=SimpleNamespace(journal=store.journal, store=store))
    accepted = _accepted(pending, snapshot)
    if wait["receipt_ref"] is not None or accepted is not None:
        return "waiting", "receipt_recorded", request.interaction_id
    if request.kind == "tool_approval":
        return "waiting_approval", "awaiting_approval", request.interaction_id
    return "waiting", "awaiting_input", request.interaction_id


def _failed_node(state, document):
    path = (state["error"] or {}).get("path", [])
    if (len(path) >= 3 and path[0] in {"document", "execution"} and path[1] == "nodes"
            and type(path[2]) is int and 0 <= path[2] < len(document["nodes"])):
        return document["nodes"][path[2]]["id"]
    return None


def _hook_wait_overrides(launch, graphs, snapshot):
    """One nested approval is not two separate obligations to the user."""
    from skeleton_production_interactions import SkeletonGraphWait, _accepted, _hook_chain
    overrides = {}
    prefix = _PrefixJournal(launch.journal, snapshot)
    for store, chain in graphs.values():
        record = chain[-1]
        active = record.state["active"]
        if (record.state["status"] != "waiting" or active is None or active["wait"] is None
                or active["wait"]["kind"] != "interaction"):
            continue
        node = next(node for node in store.plan.snapshot()["nodes"] if node["id"] == active["node_id"])
        if node["type"] != "agent":
            continue
        payload = store.read_json(active["wait"]["request_ref"])
        request = InteractionRequest.from_dict(payload)
        raw = request.subject.get("hook_child_wait") if type(request.subject) is dict else None
        if raw is None:
            continue
        if (request.kind != "tool_approval" or request.source_run_id != active["node_attempt_id"]
                or request.interaction_id != active["wait"]["id"]):
            _refuse(message="The nested approval has a different parent interaction.")
        parent_store = WorkflowExecutionStore(prefix, store.plan, graph_id=store.graph_id, attempt=store.attempt)
        parent = SkeletonGraphWait(parent_store, record, payload)
        try:
            # Reuse the production validator for exact attach/enabled Hook,
            # embedded/pinned version/digest AND original tool-call identity.
            # Its child Store.load reads inherit the fixed prefix capability.
            expanded = _hook_chain(parent, launch, request, raw, (parent,))
        except DurableInteractionHostError as exc:
            raise SkeletonResourceError("skeleton_run_observation_invalid", ("run",),
                                        "The recorded Hook binding is invalid.", status=409) from exc
        leaf = expanded[-1]
        known = graphs.get(leaf.store.graph_id)
        if (known is None or leaf.record.event_id != known[1][-1].event.event_id
                or leaf.record.state != known[1][-1].state):
            _refuse(message="The nested approval is outside the verified prefix.")
        child_active = leaf.record.state["active"]
        pending = SimpleNamespace(request=request, launch=SimpleNamespace(journal=prefix, store=parent_store))
        accepted = _accepted(pending, snapshot)
        overrides[(store.graph_id, active["node_id"])] = (
            "waiting", "receipt_recorded" if accepted is not None else "waiting_for_child", request.interaction_id)
        if accepted is not None:
            overrides[(leaf.store.graph_id, child_active["node_id"])] = (
                "waiting", "receipt_recorded_upstream", child_active["wait"]["id"])
    return overrides


def _node_states(store, record, snapshot, wait_overrides):
    state = record.state
    document = store.plan.snapshot()
    completed = {node["node_id"]: node for node in state["completed"]}
    active = state["active"]
    failed_node = _failed_node(state, document) if state["status"] == "failed" else None
    result = []
    for node in document["nodes"]:
        if node["type"] in _POOLS:
            continue
        row = {"node_id": node["id"], "state": "pending", "phase": "pending",
               "node_invocation_id": None, "node_attempt_id": None,
               "interaction_id": None, "reason": None}
        receipt = completed.get(node["id"])
        if receipt is not None:
            row.update(state="succeeded", phase="completed",
                       node_invocation_id=receipt["node_invocation_id"], node_attempt_id=receipt["node_attempt_id"])
        elif active is not None and active["node_id"] == node["id"]:
            row.update(node_invocation_id=active["node_invocation_id"], node_attempt_id=active["node_attempt_id"],
                       phase=state["status"])
            if state["status"] in {"failed", "cancelled", "outcome_unknown"}:
                row["state"] = state["status"]
            elif state["paused"]:
                row.update(state="suspended", phase="paused")
            elif state["status"] == "waiting":
                override = wait_overrides.get((store.graph_id, node["id"]))
                row["state"], row["phase"], row["interaction_id"] = (
                    override if override is not None else _approval_phase(store, record, snapshot))
            else:
                row["state"] = "running"
        elif failed_node == node["id"]:
            row.update(state="failed", phase="failed")
        if row["state"] in {"failed", "outcome_unknown"}:
            row["reason"] = (state["error"] or {}).get("code")
        result.append(row)
    return result


def _skipped_edges(store, record):
    document = store.plan.snapshot()
    branches = {node["id"] for node in document["nodes"] if node["type"] in {"if_else", "switch_case"}}
    result = []
    for row in record.state["completed"]:
        if row["node_id"] not in branches:
            continue
        receipt = store.read_json(row["result_ref"])
        if receipt == {}:  # supported old branch receipt contains no skip proof
            continue
        if (type(receipt) is not dict or set(receipt) != {"schema", "node_id", "selected_edge_id", "skipped_edges"}
                or receipt["schema"] != "unchain.skeleton.branch_selection.v1"
                or receipt["node_id"] != row["node_id"] or receipt["selected_edge_id"] != row["edge_id"]):
            _refuse(message="The recorded branch receipt is invalid.")
        siblings = {edge["id"] for edge in document["edges"] if edge["kind"] == "flow"
                    and edge["source_node_id"] == row["node_id"] and edge["id"] != row["edge_id"]}
        skipped = receipt["skipped_edges"]
        if (type(skipped) is not list or any(type(edge) is not dict or set(edge) != {"edge_id", "status"}
                or edge["status"] != "skipped" for edge in skipped)
                or len(skipped) != len(siblings) or {edge["edge_id"] for edge in skipped} != siblings):
            _refuse(message="The recorded skipped edges are invalid.")
        result.extend(edge["edge_id"] for edge in skipped)
    return result


def project_launch(launch):
    """Project an already admitted launch; does not run/recover/expire anything."""
    current_manifest = require_skeleton_runtime()
    snapshot, graphs = _read_verified_execution_graphs(launch)
    wait_overrides = _hook_wait_overrides(launch, graphs, snapshot)
    ordered = sorted(graphs.values(), key=lambda item: (
        len(item[1][-1].state["call_stack"]), item[1][0].event.store_seq, item[0].graph_id))
    projected = []
    diagram_bytes = 0
    for store, chain in ordered:
        record = chain[-1]
        state = record.state
        document = store.plan.snapshot()
        # Bound repeated same-definition diagrams before materializing the full
        # response. ASCII JSON also accounts for Flask's escaped Unicode wire.
        diagram_bytes += len(json.dumps(document, ensure_ascii=True, allow_nan=False))
        if diagram_bytes > MAX_VIEW_BYTES:
            _refuse("skeleton_run_view_limit", "The run is too large for this view.")
        parent_id, caller_id = None, None
        if len(state["call_stack"]) > 1:
            frame = state["call_stack"][-2]
            parent_id = frame["graph_invocation_id"]
            parent_chain = graphs[parent_id][1]
            caller_id = next(node["node_id"] for item in parent_chain
                             for node in item.state["completed"] + ([item.state["active"]] if item.state["active"] else [])
                             if node["node_invocation_id"] == frame["caller_node_invocation_id"])
        projected.append({
            "graph_id": store.graph_id, "attempt_id": store.attempt.attempt_id,
            "parent_graph_id": parent_id, "caller_node_id": caller_id,
            "call_stack": deepcopy(state["call_stack"]), "definition_digest": state["definition_digest"],
            "document": document, "revision": record.revision,
            "event_id": record.event.event_id, "store_seq": record.event.store_seq,
            "status": state["status"], "paused": state["paused"], "root_committed": state["root_committed"],
            "owner_liveness": "unknown", "nodes": _node_states(store, record, snapshot, wait_overrides),
            "skipped_edges": _skipped_edges(store, record), "error": deepcopy(state["error"]),
        })
    descriptor = launch.descriptor
    result = {
        "owner_chat_id": descriptor["owner_chat_id"], "execution_id": descriptor["session_id"],
        "generation_id": launch.store.attempt.generation.generation_id,
        "root_run_id": descriptor["root_run_id"], "resource_id": launch.plan.document_id,
        "definition_digest": execution_definition_digest(launch.plan),
        "runtime_manifest_digest": current_manifest["manifest_digest"],
        "launch_manifest_digest": descriptor["runtime_manifest"]["manifest_digest"],
        "high_watermark": max((event.store_seq for event in snapshot.events), default=0), "graphs": projected,
    }
    if len(json.dumps({"schema": SCHEMA, "run": result}, ensure_ascii=True, allow_nan=False)) > MAX_VIEW_BYTES:
        _refuse("skeleton_run_view_limit", "The run is too large for this view.")
    return result


def read_skeleton_run(*, owner_chat_id, execution_id, resource_id, root_run_id=None):
    owner = _identifier(owner_chat_id, "owner_chat_id")
    execution = _identifier(execution_id, "execution_id")
    resource = _identifier(resource_id, "resource_id")
    if root_run_id is not None:
        _identifier(root_run_id, "root_run_id")
    try:
        launch = (load_launch(execution, root_run_id, expected_owner_chat_id=owner, allow_terminal_stale=True)
                  if root_run_id is not None else
                  load_active_launch(execution, expected_owner_chat_id=owner, allow_terminal_stale=True))
        if launch is None or launch.plan.document_id != resource:
            return {"schema": SCHEMA, "run": None}
        return {"schema": SCHEMA, "run": project_launch(launch)}
    except SkeletonResourceError:
        raise
    except DurableInteractionHostError as exc:
        raise SkeletonResourceError(exc.code, ("run",), "The selected run cannot be read.",
                                    status=exc.status_code) from exc
    except Exception as exc:
        raise SkeletonResourceError("skeleton_run_observation_invalid", ("run",),
                                    "Recorded run state could not be verified.", status=409) from exc


__all__ = ["read_skeleton_run"]
