"""Fixed production launch material, bound to its real execution journal.

The small local pointer is only a locator. Definitions and their identities are
read back from the journal's verified launch artifact before any cold dispatch.
No credential, SDK object or live resource lookup is retained here.
"""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import os
from pathlib import Path
from typing import Any

from unchain.journal import AttemptRef, JournalAppendRequest, ResourceRef, build_operation_ref
from unchain.journal.models import _thaw_json
from unchain.skeleton import prepare_agent_graph, prepare_workflow
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.execution import _validate_all

from durable_interaction_host import DurableInteractionHostError, _write_json_atomically
from skeleton_chat_selection import FrozenSkeletonChatSelection, _check_preflight
from skeleton_workflow_snapshot import (FrozenSkeletonWorkflowDependencies,
    _selection_references, _workflow_references)
from skeleton_runtime_capability import require_skeleton_runtime, validate_skeleton_runtime_manifest


_SCHEMA = "pupu.skeleton-launch.v1"
_EVENT = "pupu.skeleton.launch"
_FIELDS = frozenset({"schema", "session_id", "owner_chat_id", "root_run_id", "graph_id",
    "selection", "workflows", "binding", "workspace_root", "inputs", "attachments",
    "runtime_manifest", "capabilities"})
_POINTER_FIELDS = frozenset({"schema", "session_id", "root_run_id", "launch_sha256"})


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
        allow_nan=False).encode("utf-8", "surrogatepass")


def _fail(code="skeleton_launch_invalid"):
    raise DurableInteractionHostError(code, "Skeleton execution material is unavailable or invalid.",
        status_code=409, retryable=False)


def _strict_json(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                _fail()
            value[key] = item
        return value
    try:
        return json.loads(raw, object_pairs_hook=pairs,
            parse_constant=lambda _value: _fail())
    except DurableInteractionHostError:
        raise
    except (ValueError, TypeError, UnicodeError):
        _fail()


def _text(value):
    if type(value) is not str or not value or value != value.strip() or "\0" in value:
        _fail()
    return value


def _directory():
    raw = os.environ.get("UNCHAIN_DATA_DIR", "")
    if not raw:
        _fail("skeleton_launch_storage_unavailable")
    return Path(raw).expanduser().resolve() / "skeleton_executions"


def _path(session_id, root_run_id=None):
    directory = _directory() / sha256(_text(session_id).encode()).hexdigest()
    return directory / ("active.json" if root_run_id is None else
        sha256(_text(root_run_id).encode()).hexdigest() + ".json")


def _restore_workflows(selection, value):
    if type(value) is not dict or set(value) != {"schema", "workflows"} or value["schema"] != "pupu.skeleton_workflow_snapshot.v1":
        _fail()
    if type(value["workflows"]) is not list or len(value["workflows"]) > 256:
        _fail()
    selected = selection.to_dict()
    metadata = {(row["workflow_id"], row["revision_id"]): row["definition_digest"]
        for row in selected["dependencies"]}
    records = {}
    for row in value["workflows"]:
        if type(row) is not dict or set(row) != {"workflow_id", "revision_id", "definition_digest", "document"}:
            _fail()
        key = (_text(row["workflow_id"]), _text(row["revision_id"]))
        if key in records or metadata.get(key) != row["definition_digest"]:
            _fail()
        plan = prepare_workflow(row["document"])
        _validate_all(plan.snapshot())
        if plan.document_id != key[0] or execution_definition_digest(plan) != row["definition_digest"]:
            _fail()
        records[key] = row
    if set(records) != set(metadata):
        _fail()
    visited = set()
    heights = {}
    descendants = {}
    def visit(key, depth, ancestors):
        if depth > 32 or key not in records or key[0] in ancestors:
            _fail()
        visited.add(key)
        if key in heights:
            if depth + heights[key] - 1 > 32 or set(ancestors).intersection(pair[0] for pair in descendants[key]):
                _fail()
            return
        height = 1
        all_children = set()
        for child in _workflow_references(records[key]["document"]):
            visit(child, depth + 1, ancestors + (key[0],))
            height = max(height, 1 + heights[child])
            all_children.add(child)
            all_children.update(descendants[child])
        heights[key] = height
        descendants[key] = all_children
    for key, placements in _selection_references(selected).items():
        for depth, ancestors in placements:
            visit(key, depth, ancestors)
    if visited != set(records):
        _fail()
    return FrozenSkeletonWorkflowDependencies(canonical(value))


def validate_launch_descriptor(value, *, session_id, root_run_id, expected_owner_chat_id=None):
    """Closed consumer for host-owned bytes; no file or provider side effects."""
    if type(value) is not dict or set(value) != _FIELDS or value["schema"] != _SCHEMA:
        _fail()
    if value["session_id"] != _text(session_id) or value["root_run_id"] != _text(root_run_id):
        _fail("skeleton_launch_identity_mismatch")
    _text(value["owner_chat_id"]); _text(value["graph_id"])
    if expected_owner_chat_id is not None and value["owner_chat_id"] != expected_owner_chat_id:
        _fail("skeleton_launch_owner_mismatch")
    if value["workspace_root"] is not None and (type(value["workspace_root"]) is not str or not Path(value["workspace_root"]).is_absolute()):
        _fail()
    selected = value["selection"]
    if type(selected) is not dict or type(selected.get("id")) is not str:
        _fail()
    _check_preflight(selected, selected["id"])
    selection = FrozenSkeletonChatSelection(canonical(selected))
    workflows = _restore_workflows(selection, value["workflows"])
    binding = value["binding"]
    from memory_v2_unchain_runtime_context import runtime_context_from_memory_binding_snapshot
    context = runtime_context_from_memory_binding_snapshot(binding)
    if (set(binding) != {"schema", "owner_chat_id", "session_id", "generation_id", "head_revision", "identity", "grant", "current_input_draft"}
            or binding["owner_chat_id"] != value["owner_chat_id"] or binding["session_id"] != session_id
            or context.identity.execution_id != session_id or context.identity.run_id != root_run_id
            or context.identity.attempt_id != root_run_id or context.identity.parent_run_id is not None
            or context.identity.root_run_id != root_run_id):
        _fail("skeleton_launch_binding_mismatch")
    validate_skeleton_runtime_manifest(value["runtime_manifest"])
    require_skeleton_runtime()
    if type(value["inputs"]) is not dict or set(value["inputs"]) != {"message", "images", "files"}:
        _fail()
    if (type(value["inputs"]["message"]) is not str or type(value["inputs"]["images"]) is not list
            or type(value["inputs"]["files"]) is not list or type(value["attachments"]) is not list):
        _fail()
    from unchain.context import HostResolvedAttachment
    from unchain.context.attachments import normalize_host_resolved_attachments
    resolved = normalize_host_resolved_attachments(tuple(HostResolvedAttachment.from_dict(row) for row in value["attachments"]))
    if (value["inputs"]["images"] != [row.to_dict() for row in resolved if row.kind == "image"]
            or value["inputs"]["files"] != [row.to_dict() for row in resolved if row.kind != "image"]):
        _fail("skeleton_launch_input_mismatch")
    draft = binding["current_input_draft"]
    if (type(draft) is not dict or draft.get("kind") != "text" or draft.get("content") != value["inputs"]["message"]
            or draft.get("attachments", []) != value["attachments"]):
        _fail("skeleton_launch_input_mismatch")
    capabilities = value["capabilities"]
    if (type(capabilities) is not dict or set(capabilities) != {"toolkits", "include_user_dirs", "workspace_roots"}
            or type(capabilities["toolkits"]) is not list or type(capabilities["include_user_dirs"]) is not bool
            or type(capabilities["workspace_roots"]) is not list):
        _fail()
    for toolkit_id in capabilities["toolkits"]: _text(toolkit_id)
    if len(set(capabilities["toolkits"])) != len(capabilities["toolkits"]): _fail()
    for root in capabilities["workspace_roots"]:
        if type(root) is not str or not Path(root).is_absolute(): _fail()
    if ((capabilities["workspace_roots"][0] if capabilities["workspace_roots"] else None) != value["workspace_root"]
            or len(set(capabilities["workspace_roots"])) != len(capabilities["workspace_roots"])): _fail()
    canonical(value)
    return selection, workflows, prepare_agent_graph(selected["document"])


@dataclass(frozen=True)
class SkeletonLaunch:
    descriptor: dict
    journal: Any
    selection: FrozenSkeletonChatSelection
    workflows: FrozenSkeletonWorkflowDependencies
    plan: Any
    store: WorkflowExecutionStore


def assert_launch_current(launch, snapshot=None):
    """Prove root binding/generation, also inside a journal write precondition."""
    from unchain.persistence.sqlite_generation_lifecycle_v2 import read_existing_host_generation_binding
    value = launch.descriptor
    scope = {"owner_chat_id": value["owner_chat_id"], "execution_id": value["session_id"],
        "session_id": value["session_id"]}
    head, binding = read_existing_host_generation_binding(**scope, attempt_id=value["root_run_id"],
        database_path=Path(os.environ["UNCHAIN_DATA_DIR"]).expanduser().resolve() / "memory_v2" / "context_v2.sqlite3")
    if (head is None or binding is None or head.current_generation_id != value["binding"]["generation_id"]
            or binding.generation_id != head.current_generation_id):
        _fail("skeleton_launch_generation_mismatch")
    if snapshot is not None:
        events = [event for event in snapshot.events if event.event_type == _EVENT
            and event.attempt == launch.store.attempt]
        if len(events) != 1 or events[0].payload.get("launch_sha256") != sha256(canonical(value)).hexdigest():
            _fail("skeleton_launch_identity_mismatch")


def save_launch(*, bridge, store, selection, workflows, workspace_root, inputs, attachments, capabilities):
    """Persist fixed bytes before first dispatch; pointer written after receipt."""
    binding = bridge.preparation.binding.canonical_value()
    value = {"schema": _SCHEMA, "session_id": bridge.execution_id,
        "owner_chat_id": binding["owner_chat_id"], "root_run_id": binding["identity"]["root_run_id"],
        "graph_id": store.graph_id, "selection": selection.to_dict(), "workflows": workflows.to_dict(),
        "binding": binding, "workspace_root": str(Path(workspace_root).resolve()) if workspace_root is not None else None,
        "inputs": inputs, "attachments": attachments, "runtime_manifest": require_skeleton_runtime(),
        "capabilities": capabilities}
    validate_launch_descriptor(value, session_id=value["session_id"], root_run_id=value["root_run_id"])
    ref, artifact = store.prepare_json(value, key="production.launch")
    digest = sha256(canonical(value)).hexdigest()
    payload = {"schema": _SCHEMA, "graph_id": store.graph_id, "launch_sha256": digest, "launch_ref": ref}
    operation_id = "skeleton.launch." + sha256(value["root_run_id"].encode()).hexdigest()
    request = JournalAppendRequest(event_id="event." + operation_id, event_type=_EVENT,
        attempt=store.attempt, operation=build_operation_ref(operation_id, domain=_EVENT, payload=payload),
        payload=payload, resource_refs=(ResourceRef.from_dict(ref["ref"]),))
    store.journal.append_with_artifacts(request=request, artifacts=(artifact,))
    pointer = {"schema": _SCHEMA, "session_id": value["session_id"], "root_run_id": value["root_run_id"],
        "launch_sha256": digest}
    path = _path(value["session_id"], value["root_run_id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    _write_json_atomically(path, pointer)
    _write_json_atomically(_path(value["session_id"]), pointer)
    return SkeletonLaunch(value, store.journal, selection, workflows, store.plan, store)


def load_launch(session_id, root_run_id, *, expected_owner_chat_id=None, allow_terminal_stale=False):
    path = _path(session_id, root_run_id)
    if not path.is_file():
        _fail("skeleton_launch_missing")
    pointer = _strict_json(path.read_bytes())
    if (type(pointer) is not dict or set(pointer) != _POINTER_FIELDS or pointer["schema"] != _SCHEMA
            or pointer["session_id"] != session_id or pointer["root_run_id"] != root_run_id):
        _fail()
    from memory_v2_unchain_active_bridge import _open_existing_cold_context_journal
    journal = _open_existing_cold_context_journal(session_id)
    if journal is None:
        _fail("skeleton_launch_missing")
    from unchain.persistence.sqlite_v2 import open_existing_execution_journal_readonly
    context_root = Path(os.environ["UNCHAIN_DATA_DIR"]).expanduser().resolve() / "memory_v2"
    journal = open_existing_execution_journal_readonly(database_path=context_root / "context_v2.sqlite3",
        object_directory=context_root / "objects", execution_id=session_id)
    events = [e for e in journal.capture_snapshot().events if e.event_type == _EVENT
        and e.attempt.attempt_id == root_run_id]
    if len(events) != 1:
        _fail()
    event = events[0]
    payload = _thaw_json(event.payload)
    if (set(payload) != {"schema", "graph_id", "launch_sha256", "launch_ref"}
            or payload["schema"] != _SCHEMA or payload["launch_sha256"] != pointer["launch_sha256"]):
        _fail()
    if event.operation != build_operation_ref(event.operation.operation_id, domain=_EVENT, payload=payload):
        _fail()
    from unchain.journal import ArtifactRef
    artifact = ArtifactRef.from_dict(payload["launch_ref"])
    if event.resource_refs != (artifact.ref,):
        _fail()
    raw = journal.read_full_verified(artifact=artifact)
    if sha256(raw).hexdigest() != pointer["launch_sha256"]:
        _fail()
    value = _strict_json(raw)
    if type(value) is not dict or raw != canonical(value) or value.get("graph_id") != payload["graph_id"]:
        _fail()
    selection, workflows, plan = validate_launch_descriptor(value, session_id=session_id,
        root_run_id=root_run_id, expected_owner_chat_id=expected_owner_chat_id)
    from unchain.journal import GenerationRef
    generation = event.attempt.generation
    if generation.execution_id != session_id or generation.generation_id != value["binding"]["generation_id"]:
        _fail("skeleton_launch_binding_mismatch")
    from memory_v2_unchain_active_bridge import PupuUnchainActiveBridgeError
    from skeleton_existing_admission import existing_skeleton_active_admission
    try:
        admitted = existing_skeleton_active_admission(owner_chat_id=value["owner_chat_id"],
            session_id=session_id, execution_id=session_id)
    except PupuUnchainActiveBridgeError:
        _fail("skeleton_launch_admission_missing")
    if not admitted:
        _fail("skeleton_launch_admission_missing")
    store = WorkflowExecutionStore(journal, plan, graph_id=value["graph_id"], attempt=event.attempt)
    # Verify actual graph receipts, including its pinned definition, before any consumer can resume it.
    record = store.load()
    if record is not None and record.state["inputs_ref"]:
        if store.read_json(record.state["inputs_ref"]) != value["inputs"]:
            _fail("skeleton_launch_input_mismatch")
    launch = SkeletonLaunch(value, journal, selection, workflows, plan, store)
    if allow_terminal_stale is True and record is not None and record.state["status"] in {"completed", "failed", "cancelled", "outcome_unknown"}:
        from unchain.persistence.sqlite_generation_lifecycle_v2 import read_existing_host_generation_binding
        head, binding = read_existing_host_generation_binding(
            database_path=context_root / "context_v2.sqlite3", owner_chat_id=value["owner_chat_id"],
            execution_id=session_id, session_id=session_id, attempt_id=root_run_id)
        if head is None or binding is None or binding.generation_id != value["binding"]["generation_id"]:
            _fail("skeleton_launch_generation_mismatch")
    else:
        assert_launch_current(launch)
    return launch


def load_active_launch(session_id, *, expected_owner_chat_id=None, allow_terminal_stale=False):
    if not session_id or not os.environ.get("UNCHAIN_DATA_DIR"):
        return None
    path = _path(session_id)
    if not path.is_file():
        return None
    pointer = _strict_json(path.read_bytes())
    if (type(pointer) is not dict or set(pointer) != _POINTER_FIELDS or pointer["schema"] != _SCHEMA
            or pointer["session_id"] != session_id):
        _fail()
    launch = load_launch(session_id, pointer["root_run_id"], expected_owner_chat_id=expected_owner_chat_id,
        allow_terminal_stale=allow_terminal_stale)
    if sha256(canonical(launch.descriptor)).hexdigest() != pointer["launch_sha256"]:
        _fail()
    return launch


__all__ = ["SkeletonLaunch", "save_launch", "load_launch", "load_active_launch", "validate_launch_descriptor", "assert_launch_current"]
