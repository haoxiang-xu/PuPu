"""Explicit fixed Workflow bindings for one Kernel's ordinary Tool boundary.

Resolution is host-owned; this module never reads a live resource or builds an
Agent/model. The child callback must use the fixed plan and durable call identity.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from hashlib import sha256
import json
import re

from unchain.agent.modules.base import BaseAgentModule
from unchain.skeleton import prepare_workflow
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.errors import SkeletonValidationError
from unchain.skeleton.execution import _validate_all
from unchain.skeleton.io import _validate_json
from unchain.skeleton.workflow_runtime import PublishedWorkflow
from unchain.tools import Tool
from unchain.tools.models import ToolExecutionContext, ToolParameter
from unchain.tools.runtime import ToolRuntimeOutcome

from skeleton_resource_store import SkeletonResourceError
from skeleton_runtime_capability import require_skeleton_runtime


WORKFLOW_TOOL_CONTRACT = "pupu.skeleton_workflow_tool.v1"
_ENTRY_ID = re.compile(r"[A-Za-z0-9_-]{1,48}\Z", re.ASCII)


def workflow_tool_capabilities():
    """Host-owned adapter contract over the loaded v1.6 fixed-profile runtime."""
    from skeleton_runtime_capability import SkeletonRuntimeCompatibilityError
    try:
        manifest = require_skeleton_runtime()
    except SkeletonRuntimeCompatibilityError as error:
        raise SkeletonResourceError(error.code, ("runtime_protocol_manifest",), str(error), status=409) from error
    execution = next(item for item in manifest["protocols"] if item["id"] == "skeleton_execution")
    if type(execution["minor"]) is not int or execution["minor"] < 6:
        raise SkeletonResourceError("workflow_tool_runtime_incompatible", ("runtime_protocol_manifest",),
            "Workflow Tools require the v1.6 fixed-profile and child settlement contracts.", status=409)
    return {"schema": "pupu.skeleton_workflow_tools_capabilities.v1",
        "runtime_manifest_digest": manifest["manifest_digest"], "workflow_tool": {
            "schema": WORKFLOW_TOOL_CONTRACT, "field": "workflow_tools",
            "entry_fields": ["id", "workflow"], "workflow_fields": ["revision_id", "workflow_id"],
            "id_pattern": "[A-Za-z0-9_-]{1,48}", "function_prefix": "workflow_",
            "arguments_field": "inputs", "returns": "end_exports", "scope": "attached_kernel",
            "document_kind": "workflow", "version_policy": "published_exact", "minimum_runtime_minor": 6}}


def _fail(code, path, message):
    raise SkeletonResourceError(code, tuple(path), message)


def _exact_text(value):
    return type(value) is str and bool(value) and value == value.strip() and "\0" not in value


def _entry(value, path):
    if type(value) is not dict or set(value) != {"id", "workflow"}:
        _fail("invalid_shape", path, "Workflow Tool requires id and workflow only.")
    if type(value["id"]) is not str or _ENTRY_ID.fullmatch(value["id"]) is None:
        _fail("invalid_value", path + ("id",), "Workflow Tool id must use1–48 ASCII letters, digits, underscores or hyphens.")
    ref = value["workflow"]
    if type(ref) is not dict or set(ref) != {"workflow_id", "revision_id"}:
        _fail("invalid_shape", path + ("workflow",), "Workflow Tool needs an exact published Workflow reference.")
    for key in ("workflow_id", "revision_id"):
        if not _exact_text(ref[key]):
            _fail("invalid_value", path + ("workflow", key), "Published Workflow identity must be exact non-empty text.")
    return deepcopy(value)


def workflow_tool_entries(document):
    """Yield detached (pool index, entry index, entry), with precise save paths."""
    for node_index, node in enumerate(document["nodes"]):
        if node["type"] != "toolkit_pool":
            continue
        config = node["config"]
        # Legacy input is interpreted only by its existing converter, never as
        # a shadow native Workflow binding.
        if "legacy_fields" in config or "workflow_tools" not in config:
            continue
        path = ("document", "nodes", node_index, "config", "workflow_tools")
        entries = config["workflow_tools"]
        if type(entries) is not list:
            _fail("invalid_type", path, "Workflow Tools must be a list.")
        seen = set()
        for index, raw in enumerate(entries):
            value = _entry(raw, path + (index,))
            if value["id"] in seen:
                _fail("duplicate_identity", path + (index, "id"), "Workflow Tool id is duplicated in this pool.")
            seen.add(value["id"])
            yield node_index, index, value


def attached_workflow_tools(document):
    """Only a Kernel's explicitly attached pools contribute callable Workflows."""
    pools = {}
    for pool_index, _index, value in workflow_tool_entries(document):
        pool_id = document["nodes"][pool_index]["id"]
        pools.setdefault(pool_id, []).append(value)
    result = {}
    for node in document["nodes"]:
        if node["type"] != "agent":
            continue
        attached = set()
        for edge in document["edges"]:
            if edge["kind"] == "attach":
                endpoints = {edge["source_node_id"], edge["target_node_id"]}
                if node["id"] in endpoints:
                    attached.update(endpoints.intersection(pools))
        rows = [(pool, deepcopy(value)) for pool in pools if pool in attached for value in pools[pool]]
        names = [value["id"] for _pool, value in rows]
        if len(names) != len(set(names)):
            _fail("duplicate_identity", ("document", "nodes", node["id"]),
                "Attached Workflow Tools generate the same tool name.")
        if rows:
            result[node["id"]] = rows
    return result


@dataclass(frozen=True)
class WorkflowToolBinding:
    pool_id: str
    local_id: str
    workflow_id: str
    revision_id: str
    plan: object

    @property
    def entry_id(self):
        identity = json.dumps([self.pool_id, self.local_id], separators=(",", ":"), ensure_ascii=False)
        return "workflow-tool." + sha256(identity.encode("utf-8")).hexdigest()

    @property
    def name(self):
        return "workflow_" + self.local_id

    @property
    def definition_digest(self):
        return execution_definition_digest(self.plan)


def resolve_workflow_tool(pool_id, value, resolver):
    """Resolve exact revision and non-LLM kind before offering a Tool schema."""
    raw = _entry(value, ("workflow_tool",))
    if not _exact_text(pool_id) or not callable(resolver):
        _fail("invalid_value", ("workflow_tool",), "Workflow Tool needs a pool and fixed resolver.")
    ref = raw["workflow"]
    published = resolver(ref["workflow_id"], ref["revision_id"])
    if (type(published) is not PublishedWorkflow or published.workflow_id != ref["workflow_id"]
            or published.revision_id != ref["revision_id"]):
        _fail("identity_conflict", ("workflow_tool", "workflow"), "Resolved Workflow identity differs from the selected revision.")
    try:
        plan = prepare_workflow(published.document)
        _validate_all(plan.snapshot())
    except SkeletonValidationError as error:
        raise SkeletonResourceError(error.code, ("workflow_tool", "workflow") + error.path,
            str(error)) from error
    if plan.document_id != published.workflow_id:
        _fail("identity_conflict", ("workflow_tool", "workflow"), "Published Workflow document identity differs.")
    return WorkflowToolBinding(pool_id, raw["id"], published.workflow_id, published.revision_id, plan)


def _input_schema(plan):
    document = plan.snapshot()
    if "input_schema" in document:
        from skeleton_workflow_parameters import require_workflow_parameters
        require_workflow_parameters(document)
        from unchain.skeleton.workflow_inputs import workflow_input_schema
        return workflow_input_schema(document)
    start = next(node for node in document["nodes"] if node["type"] == "start")
    names = []
    whole = False
    for output in start["config"]["execution"]["outputs"]:
        path = output["source"]["path"]
        if not path:
            whole = True
        elif type(path[0]) is str and path[0] not in names:
            names.append(path[0])
    # IO mappings declare reads, not invented scalar types. Preserve arbitrary
    # JSON values for those keys and a whole-object Start's additional fields.
    return {"type": "object", "properties": {name: {} for name in names},
            "required": names, "additionalProperties": whole}


class _WorkflowToolModule(BaseAgentModule):
    @property
    def name(self):
        return "skeleton-workflow-tool." + self._binding.entry_id

    def __init__(self, binding, run_child, session_id, node_attempt_id):
        self._binding = binding
        self._run_child = run_child
        self._session_id = session_id
        self._node_attempt_id = node_attempt_id
        document = binding.plan.snapshot()
        end = next(node for node in document["nodes"] if node["type"] == "end")
        names = [row["name"] for row in end["config"]["execution"]["outputs"]]
        description = (f"Run {document['name']} at fixed revision {binding.revision_id}. "
            f"Returns the Workflow End object with exports: {', '.join(names) or '(none)'}. "
            "Tool steps retain their existing permission and approval requirements.")
        self.tool = Tool(name=binding.name, description=description, func=self._unrouted,
            parameters=[ToolParameter(name="inputs", type_="object", required=True,
                description="Workflow input object. Start reads: " +
                    json.dumps(_input_schema(binding.plan), ensure_ascii=False, separators=(",", ":")))])

    def _unrouted(self, inputs):
        # The native descriptor needs a callable. Losing the declared terminal
        # plugin route must never execute a child through a fallback handler.
        return {"error": {"code": "workflow_tool_runtime_required"}}

    def configure(self, builder):
        # The imported runtime deliberately requires exact native Tool objects.
        # Execution uses its existing durable plugin route, never a subclass or
        # an override of the runtime's Tool/Context authority.
        builder.add_tool(self.tool)
        builder.add_tool_runtime_plugin(self)

    def can_handle(self, *, tool_call, context):
        return (tool_call.name == self.tool.name and context.toolkit.get(tool_call.name) is not None)

    def durable_runtime_manifest(self, *, tool_call, context):
        if not self.can_handle(tool_call=tool_call, context=context):
            _fail("identity_conflict", ("workflow_tool", "call"), "Workflow Tool route is not selected.")
        return {"schema": "pupu.skeleton_workflow_tool_runtime.v1", "handler": "skeleton_workflow_tool",
            "tool_name": self.tool.name, "entry_id": self._binding.entry_id,
            "workflow_id": self._binding.workflow_id, "revision_id": self._binding.revision_id,
            "definition_digest": self._binding.definition_digest, "terminal_handler": True,
            # This is the existing child-wait state transition, also used by
            # full-graph delegates. It grants no Agent/model to the child.
            "completion_contract": {"schema": "unchain.tool_completion_contract.v1",
                "state_transition": "subagent_terminal_handoff.v1",
                "allowed_state_keys": ["subagent_state", "transcript", "run_status",
                    "pending_tool_calls", "tool_batch_state", "last_continuation", "next_model_input"]}}

    def execute(self, *, tool_call, context):
        if (not self.can_handle(tool_call=tool_call, context=context)
                or not _exact_text(tool_call.call_id)
                or context.session_id != self._session_id or context.run_id != self._node_attempt_id):
            _fail("identity_conflict", ("workflow_tool", "call"), "Workflow Tool call escaped its fixed Kernel scope.")
        try:
            arguments = self.tool._parse_arguments(deepcopy(tool_call.arguments))
        except (TypeError, ValueError):
            _fail("invalid_shape", ("workflow_tool", "arguments"), "Workflow Tool arguments are not a JSON object.")
        if type(arguments) is not dict or set(arguments) != {"inputs"} or type(arguments["inputs"]) is not dict:
            _fail("invalid_shape", ("workflow_tool", "arguments"), "Workflow Tool requires only its inputs object.")
        _validate_json(arguments["inputs"], ("workflow_tool", "arguments", "inputs"))
        execution = ToolExecutionContext(session_id=context.session_id, run_id=context.run_id,
            provider=context.provider, model=context.model, iteration=context.iteration,
            tool_name=self.tool.name, call_id=tool_call.call_id)
        result = self._run_child(self._binding, deepcopy(arguments["inputs"]),
            {"call_id": tool_call.call_id, "tool_name": self.tool.name}, execution)
        if type(result) is not dict:
            _fail("invalid_type", ("workflow_tool", "result"), "Workflow End must return an object.")
        _validate_json(result, ("workflow_tool", "result"))
        return ToolRuntimeOutcome(handled=True, tool_result=deepcopy(result))


def build_workflow_tool(binding, run_child, *, session_id, node_attempt_id):
    if (type(binding) is not WorkflowToolBinding or not callable(run_child)
            or not _exact_text(session_id) or not _exact_text(node_attempt_id)):
        _fail("invalid_type", ("workflow_tool",), "A Workflow Tool requires its fixed binding, child runner and Kernel identity.")
    return _WorkflowToolModule(binding, run_child, session_id, node_attempt_id)
