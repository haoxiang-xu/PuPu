"""What the builder needs to configure the deterministic steps (#352).

A Tool Call node's arguments are the node's own inputs — the runtime hands
every resolved input to the tool as an argument (`tool_runtime._tool_call`) —
and the panel renders one row per property of the chosen tool's JSON schema.
The toolkit catalog the renderer already reads (`/toolkits/catalog/v2`) names
the tools but carries no schema, so the editor had nothing to render from.

The schemas served here are the runtime's own: the same toolkit the production
bindings build for a run (`_build_selected_toolkits`), read with the same call
`SkeletonToolRuntime.tool_schemas()` documents as the UI host's read
(`Toolkit.to_json()`). Nothing is copied, renamed or completed: a property the
runtime does not declare is not offered, and one it declares is not dropped.

Only builtin toolkits are built for a read. Building an MCP toolkit starts its
server, and a schema read is not a reason to start one; such a toolkit is
refused with `toolkit_unsupported` rather than answered with an empty list.

A Skill Read node's content is read by the runtime when the run reaches it.
The panel's preview is that same read — `SkeletonSkillRuntime`'s exact-identity
read over a registry built the way the production bindings build one — so a
preview that answers is the body a run would get, and an identity a run would
refuse is refused here with the run's own code. The builder has no chat
workspace, so only the roots it can know are searched: the user directories
(when on) and the installed skill packs.
"""
from __future__ import annotations

import re
from typing import Any

from skeleton_resource_store import SkeletonResourceError

TOOL_SCHEMAS_SCHEMA = "pupu.skeleton_tool_schemas.v1"
_TOOLKIT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")


def _fail(code: str, path: tuple, message: str, status: int) -> None:
    raise SkeletonResourceError(code, path, message, status=status)


def _toolkit_id(raw: Any) -> str:
    if type(raw) is not str or not _TOOLKIT_ID.match(raw) or ".." in raw:
        _fail("invalid_value", ("toolkit",), "toolkit must be a catalog toolkit id", 400)
    return raw


def tool_schemas(raw_toolkit_id: Any) -> dict[str, Any]:
    """The runtime's own argument schemas for every tool of one builtin toolkit."""
    import unchain_adapter as adapter

    toolkit_id = _toolkit_id(raw_toolkit_id)
    catalog = adapter.get_toolkit_catalog_v2()
    entries = catalog.get("toolkits") if isinstance(catalog, dict) else None
    entry = next((item for item in (entries or [])
                  if isinstance(item, dict) and item.get("toolkitId") == toolkit_id), None)
    if entry is None:
        _fail("toolkit_missing", ("toolkit",), "this toolkit is not in the catalog", 404)
    if entry.get("source") != "builtin":
        _fail("toolkit_unsupported", ("toolkit",),
              "only builtin toolkits can be read for tool schemas", 409)

    toolkits = adapter._build_selected_toolkits({"toolkits": [toolkit_id]},
                                                 session_id="skeleton-tool-schemas")
    try:
        raw_tools = [item for toolkit in toolkits for item in toolkit.to_json()]
    finally:
        for toolkit in toolkits:
            disconnect = getattr(toolkit, "disconnect", None)
            if callable(disconnect):
                disconnect()
    if not toolkits:
        _fail("toolkit_missing", ("toolkit",), "this toolkit could not be built", 404)

    tools: dict[str, dict[str, Any]] = {}
    for item in raw_tools:
        name = item.get("name") if isinstance(item, dict) else None
        description = item.get("description") if isinstance(item, dict) else None
        parameters = item.get("parameters") if isinstance(item, dict) else None
        if type(name) is not str or not name or type(description) is not str or type(parameters) is not dict:
            _fail("invalid_shape", ("tools",), "the runtime returned a tool schema of an unknown shape", 500)
        if name in tools:
            _fail("duplicate_identity", ("tools", name), "the runtime returned one tool name twice", 500)
        tools[name] = {"name": name, "description": description, "parameters": parameters}
    return {"schema": TOOL_SCHEMAS_SCHEMA, "toolkit_id": toolkit_id,
            "tools": [tools[name] for name in sorted(tools)]}


SKILL_PREVIEW_SCHEMA = "pupu.skeleton_skill_preview.v1"
_SKILL_KEYS = ("source", "source_id", "name")


def _skill_identity(raw: Any) -> dict[str, str]:
    if type(raw) is not dict:
        _fail("invalid_type", ("skill",), "skill must be an object", 400)
    unknown = sorted(set(raw).difference(_SKILL_KEYS))
    if unknown:
        _fail("unknown_field", ("skill", unknown[0]), "skill contains an unknown field", 400)
    for key in _SKILL_KEYS:
        if key not in raw:
            _fail("missing_field", ("skill", key), "required field is missing", 400)
        if type(raw[key]) is not str or not raw[key]:
            _fail("invalid_value", ("skill", key), "skill identity field must be non-empty text", 400)
    return {key: raw[key] for key in _SKILL_KEYS}


def _reader_plan(identity: dict[str, str]):
    """The smallest workflow whose one Skill Read node names `identity`: the
    runtime's reader is bound to a checked plan, and this is the plan's whole
    content — nothing in it runs."""
    from unchain.skeleton import prepare_workflow

    result = lambda name, root: {"name": name, "source": {"kind": "result", "path": [root]}}
    return prepare_workflow({
        "schema_version": 1, "kind": "workflow", "id": "skill-preview", "name": "Skill preview",
        "nodes": [
            {"id": "start", "type": "start", "config": {"execution": {"outputs": [result("value", "value")]}}},
            {"id": "skill", "type": "skill_read", "config": {"skill": dict(identity),
                "execution": {"inputs": [], "outputs": [result("content", "content")]}}},
            {"id": "end", "type": "end", "config": {"execution": {
                "inputs": [{"name": "content", "value": {"kind": "ref", "node_id": "skill", "path": ["content"]}, "missing": "error"}],
                "outputs": [{"name": "content", "source": {"kind": "input", "path": ["content"]}}]}}},
        ],
        "edges": [
            {"id": "a", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "skill", "target_port_id": "in"},
            {"id": "b", "kind": "flow", "source_node_id": "skill", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"},
        ],
    })


def skill_preview(payload: dict[str, Any]) -> dict[str, Any]:
    """The body a Skill Read node naming this identity would read, or the
    code its run would fail with."""
    from unchain.skeleton import SkeletonValidationError
    from unchain.skeleton.tool_runtime import SkeletonSkillRuntime
    from unchain.skills import SkillRegistry
    from unchain.tools import Toolkit
    from skills_inventory import build_skills_config, installed_pack_skill_descriptors

    if "skill" not in payload:
        _fail("missing_field", ("skill",), "required field is missing", 400)
    identity = _skill_identity(payload["skill"])
    if "include_user_dirs" not in payload:
        _fail("missing_field", ("include_user_dirs",), "required field is missing", 400)
    if type(payload["include_user_dirs"]) is not bool:
        _fail("invalid_type", ("include_user_dirs",), "include_user_dirs must be true or false", 400)

    config = build_skills_config(workspace_root=None, include_user_dirs=payload["include_user_dirs"],
                                 extra_skills=tuple(installed_pack_skill_descriptors()))
    reader = SkeletonSkillRuntime(_reader_plan(identity), SkillRegistry(config, runtime_toolkit=Toolkit()))
    try:
        loaded = reader._read(identity)
    except SkeletonValidationError as error:
        _fail(error.code, ("skill",), "this skill is not available as identified", 404)
    except Exception:
        # The run maps any other read failure to skill_unavailable; so does this.
        _fail("skill_unavailable", ("skill",), "this skill could not be read", 404)
    body = loaded.body
    return {"schema": SKILL_PREVIEW_SCHEMA, "identity": identity, "body": body,
            "revision": loaded.revision, "bytes": len(body.encode("utf-8"))}


__all__ = ["SKILL_PREVIEW_SCHEMA", "TOOL_SCHEMAS_SCHEMA", "skill_preview", "tool_schemas"]
