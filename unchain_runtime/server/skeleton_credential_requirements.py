"""Secret-free requirements and optimistic handoff for fixed Skeleton graphs.

Discovery only admits definitions. It never binds an SDK, opens a credential
store, registers an execution or retains a key in the frozen launch material.
"""
from __future__ import annotations

from functools import wraps
from hashlib import sha256
import re

from unchain.skeleton.kernel_config import validate_kernel_config

from skeleton_chat_selection import (FrozenSkeletonChatSelection, _check_preflight,
    prepare_skeleton_chat_selection)
from skeleton_resource_store import SkeletonResourceError
from skeleton_workflow_snapshot import (FrozenSkeletonWorkflowDependencies,
    freeze_skeleton_workflow_dependencies)


_QUERY_SCHEMA = "pupu.skeleton_credential_query.v1"
_RESULT_SCHEMA = "pupu.skeleton_credential_requirements.v1"
_SCOPE_SCHEMA = "pupu.skeleton_credential_scope.v1"
_QUERY_FIELDS = frozenset({"schema", "mode", "session_id", "owner_chat_id",
    "interaction_id", "source_attempt_id", "selection", "recipe_name", "memory_agent_config"})
_SCOPE_FIELDS = frozenset({"schema", "mode", "session_id", "owner_chat_id",
    "interaction_id", "source_attempt_id", "selection_digest", "workflows_digest",
    "launch_digest", "memory_provider"})
_PROFILE_FIELDS = ("id", "credential_ref", "provider", "model", "protocol", "endpoint")
_DIGEST = re.compile(r"^[0-9a-f]{64}$")
_MESSAGE = "Skeleton credential requirements could not be admitted."


def _fail(code="skeleton_credential_requirements_invalid", path=("credentials",), *, status=400):
    raise SkeletonResourceError(code, tuple(path), _MESSAGE, status=status) from None


def _stale():
    _fail("skeleton_credential_scope_stale", ("options", "skeleton_credential_scope"), status=409)


def _safe_boundary(function):
    @wraps(function)
    def invoke(*args, **kwargs):
        try:
            return function(*args, **kwargs)
        except SkeletonResourceError as error:
            # A producer's detailed message may contain author-supplied data.
            raise SkeletonResourceError(error.code, error.path, _MESSAGE, status=error.status) from None
        except Exception:
            _fail()
    return invoke


def _text(value, path, *, empty=False, scope=False):
    if (type(value) is not str or value != value.strip() or "\0" in value
            or not empty and not value):
        code = "skeleton_credential_scope_invalid" if scope else "skeleton_credential_requirements_invalid"
        _fail(code, path)
    try:
        value.encode("utf-8")
    except UnicodeError:
        code = "skeleton_credential_scope_invalid" if scope else "skeleton_credential_requirements_invalid"
        _fail(code, path)
    return value


def _query(value, mode):
    if (type(value) is not dict or set(value) != _QUERY_FIELDS
            or value.get("schema") != _QUERY_SCHEMA or value.get("mode") != mode):
        _fail(path=("query",))
    for field in ("session_id", "owner_chat_id"):
        _text(value[field], ("query", field))
    for field in ("interaction_id", "source_attempt_id"):
        _text(value[field], ("query", field), empty=mode == "start" or field == "source_attempt_id")
    if mode == "start" and (value["interaction_id"] or value["source_attempt_id"]):
        _fail(path=("query",))
    if (value["selection"] is not None and type(value["selection"]) is not dict
            or type(value["recipe_name"]) is not str
            or value["memory_agent_config"] is not None and type(value["memory_agent_config"]) is not dict):
        _fail(path=("query",))
    return value


def _fixed(selection, workflows):
    if type(selection) is not FrozenSkeletonChatSelection or type(workflows) is not FrozenSkeletonWorkflowDependencies:
        _fail(path=("selection",))
    selected = selection.to_dict()
    _check_preflight(selected, selection.resource_id)
    # Independently check retained bodies against the selected transitive
    # metadata, without consulting the mutable resource store.
    from skeleton_production_state import _restore_workflows
    restored = _restore_workflows(selection, workflows.to_dict())
    if restored.snapshot_digest != workflows.snapshot_digest:
        _fail(path=("workflows",))
    return selected


def _profiles(selected):
    documents = {}
    profiles = {}
    targets = {}

    def visit(value):
        document = value["document"]
        previous = documents.get(document["id"])
        if previous is not None and previous != document:
            _fail("identity_conflict", ("document", "id"))
        documents[document["id"]] = document
        for node in document["nodes"]:
            if node["type"] != "agent":
                continue
            profile = validate_kernel_config(node["config"]["kernel"])["profile"]
            previous = profiles.get(profile["id"])
            if previous is not None and previous != profile:
                _fail("profile_conflict", ("profile", "id"))
            profiles[profile["id"]] = profile
            target = (profile["provider"], profile["endpoint"])
            ref = profile["credential_ref"]
            if ref in targets and targets[ref] != target:
                _fail("credential_conflict", ("profile", "credential_ref"))
            targets[ref] = target
        for child in value["subagents"]:
            visit(child)

    visit(selected)
    return [{key: profiles[identity][key] for key in _PROFILE_FIELDS}
            for identity in sorted(profiles)]


def _launch_scope(launch, selection, workflows, *, session_id, owner_chat_id, source_attempt_id):
    from skeleton_production_state import canonical, validate_launch_descriptor
    try:
        descriptor = launch.descriptor
        root_run_id = _text(descriptor["root_run_id"], ("launch", "root_run_id"))
        restored_selection, restored_workflows, _plan = validate_launch_descriptor(descriptor,
            session_id=session_id, root_run_id=root_run_id, expected_owner_chat_id=owner_chat_id)
        if (source_attempt_id and source_attempt_id != root_run_id
                or restored_selection.snapshot_digest != selection.snapshot_digest
                or restored_workflows.snapshot_digest != workflows.snapshot_digest
                or launch.selection.snapshot_digest != selection.snapshot_digest
                or launch.workflows.snapshot_digest != workflows.snapshot_digest):
            _stale()
        return root_run_id, sha256(canonical(descriptor)).hexdigest()
    except Exception:
        _stale()


@_safe_boundary
def requirements_from_frozen(selection, workflows, *, mode, session_id, owner_chat_id,
                             interaction_id="", source_attempt_id="", memory_provider="", launch=None):
    """Enumerate the exact admitted recursive closure without local capabilities."""
    if mode not in ("start", "resume"):
        _fail(path=("mode",))
    _text(session_id, ("session_id",)); _text(owner_chat_id, ("owner_chat_id",))
    _text(interaction_id, ("interaction_id",), empty=mode == "start")
    _text(source_attempt_id, ("source_attempt_id",), empty=True)
    _text(memory_provider, ("memory_provider",), empty=True)
    if mode == "start" and (interaction_id or source_attempt_id or launch is not None):
        _fail(path=("mode",))
    selected = _fixed(selection, workflows)
    profiles = _profiles(selected)
    if not memory_provider:
        memory_provider = next(node["config"]["kernel"]["profile"]["provider"]
            for node in selected["document"]["nodes"] if node["type"] == "agent")
    launch_digest = ""
    if mode == "resume":
        source_attempt_id, launch_digest = _launch_scope(launch, selection, workflows,
            session_id=session_id, owner_chat_id=owner_chat_id, source_attempt_id=source_attempt_id)
    scope = {"schema": _SCOPE_SCHEMA, "mode": mode, "session_id": session_id,
        "owner_chat_id": owner_chat_id, "interaction_id": interaction_id,
        "source_attempt_id": source_attempt_id, "selection_digest": selection.snapshot_digest,
        "workflows_digest": workflows.snapshot_digest, "launch_digest": launch_digest,
        "memory_provider": memory_provider}
    return {"schema": _RESULT_SCHEMA, "kind": "skeleton", "scope": scope, "profiles": profiles}


@_safe_boundary
def requirements_for_start(query, *, memory_provider, store=None):
    query = _query(query, "start")
    selection = prepare_skeleton_chat_selection({"skeleton_selection": query["selection"],
        "recipe_name": query["recipe_name"]}, store=store)
    workflows = freeze_skeleton_workflow_dependencies(selection, store=store)
    return requirements_from_frozen(selection, workflows, mode="start", session_id=query["session_id"],
        owner_chat_id=query["owner_chat_id"], memory_provider=memory_provider)


@_safe_boundary
def requirements_for_resume(query, *, memory_provider, pending_resolver=None):
    query = _query(query, "resume")
    if pending_resolver is None:
        from skeleton_production_interactions import resolve_pending_skeleton_interaction
        pending_resolver = resolve_pending_skeleton_interaction
    from durable_interaction_host import DurableInteractionHostError
    try:
        pending = pending_resolver(query["session_id"], expected_owner_chat_id=query["owner_chat_id"])
    except DurableInteractionHostError:
        _stale()
    if pending is None:
        return {"schema": _RESULT_SCHEMA, "kind": "not_skeleton"}
    if pending.request.interaction_id != query["interaction_id"]:
        _stale()
    return requirements_from_frozen(pending.launch.selection, pending.launch.workflows,
        mode="resume", session_id=query["session_id"], owner_chat_id=query["owner_chat_id"],
        interaction_id=query["interaction_id"], source_attempt_id=query["source_attempt_id"],
        memory_provider=memory_provider, launch=pending.launch)


def _checked_scope(value):
    path = ("options", "skeleton_credential_scope")
    if type(value) is not dict or set(value) != _SCOPE_FIELDS or value.get("schema") != _SCOPE_SCHEMA:
        _fail("skeleton_credential_scope_invalid", path)
    if value["mode"] not in ("start", "resume"):
        _fail("skeleton_credential_scope_invalid", path)
    for field in ("session_id", "owner_chat_id", "memory_provider"):
        _text(value[field], path + (field,), scope=True)
    for field in ("interaction_id", "source_attempt_id"):
        _text(value[field], path + (field,), empty=value["mode"] == "start", scope=True)
    for field in ("selection_digest", "workflows_digest"):
        if type(value[field]) is not str or _DIGEST.fullmatch(value[field]) is None:
            _fail("skeleton_credential_scope_invalid", path + (field,))
    if (value["mode"] == "start" and (value["launch_digest"] != "" or value["interaction_id"] or value["source_attempt_id"])
            or value["mode"] == "resume" and (type(value["launch_digest"]) is not str
                or _DIGEST.fullmatch(value["launch_digest"]) is None)):
        _fail("skeleton_credential_scope_invalid", path)
    return value


@_safe_boundary
def assert_credential_scope(options, selection, workflows, *, mode, session_id, owner_chat_id,
                            interaction_id="", source_attempt_id="", launch=None):
    """Optional for direct callers; a supplied scope must match exactly."""
    if type(options) is not dict:
        _fail("skeleton_credential_scope_invalid", ("options",))
    if "skeleton_credential_scope" not in options:
        return
    issued = _checked_scope(options["skeleton_credential_scope"])
    memory_config = options.get("_memory_v2_memory_agent_config")
    if memory_config is not None and type(memory_config) is not dict:
        _fail("skeleton_credential_scope_invalid", ("options", "_memory_v2_memory_agent_config"))
    memory_provider = memory_config.get("provider", "") if memory_config is not None else ""
    expected = requirements_from_frozen(selection, workflows, mode=mode, session_id=session_id,
        owner_chat_id=owner_chat_id, interaction_id=interaction_id, source_attempt_id=source_attempt_id,
        memory_provider=memory_provider, launch=launch)["scope"]
    if issued != expected:
        _stale()


__all__ = ["requirements_for_start", "requirements_for_resume", "requirements_from_frozen",
           "assert_credential_scope"]
