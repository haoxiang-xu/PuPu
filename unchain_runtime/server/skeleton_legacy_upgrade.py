"""Read-only, closed inventory of legacy Agent draft upgrade requirements.

The inventory is deliberately not a converter or an execution preflight. It
reports decisions an author still needs to make while retaining the stored
legacy fields unchanged.
"""

from __future__ import annotations

import json
from typing import Any

from unchain.skeleton import validate_skeleton_document
from unchain.skeleton.errors import SkeletonValidationError
from unchain.skeleton.kernel_config import validate_kernel_config

from skeleton_resource_store import SkeletonResourceError


_SCHEMA = "pupu.skeleton-legacy-upgrade.inventory.v1"
_LEGACY_NODE_FIELDS = {
    "start": {"kind", "deletable", "outputs", "x", "y"},
    "end": {"kind", "deletable", "outputs_schema", "x", "y"},
    "agent": {"kind", "deletable", "override", "outputs", "x", "y"},
    "toolkit_pool": {"kind", "deletable", "toolkits", "merge_with_user_selected", "x", "y"},
    "subagent_pool": {"kind", "deletable", "subagents", "x", "y"},
}
_LEGACY_RECIPE_FIELDS = {
    "name", "description", "model", "max_iterations", "merge_with_user_selected",
    "subagent_profile", "agent", "toolkits", "subagent_pool", "nodes", "edges",
}
_TOOLKIT_FIELDS = {"id", "enabled_tools", "config"}
_TOOLKIT_IDENTITY_FIELDS = {"id", "enabled_tools"}


def _fail(code: str, path: tuple[str | int, ...], message: str) -> None:
    raise SkeletonResourceError(code, path, message)


def _identity(value: Any, field: str) -> str:
    path = (field,)
    if type(value) is not str:
        _fail("invalid_type", path, f"{field} must be a non-empty string")
    if not value.strip():
        _fail("invalid_value", path, f"{field} must be a non-empty string")
    return value


def _as_path(path: tuple[str | int, ...]) -> list[str | int]:
    if path and path[0] == "document":
        path = path[1:]
    return list(path)


def inspect_legacy_upgrade(document: Any, *, edit_token: Any,
                           source_identity: Any) -> dict[str, Any]:
    """Return a detached, non-mutating inventory for one stored Agent draft."""
    edit_token = _identity(edit_token, "edit_token")
    source_identity = _identity(source_identity, "source_identity")
    try:
        checked = validate_skeleton_document(document)
    except SkeletonValidationError as exc:
        raise SkeletonResourceError(exc.code, exc.path, str(exc)) from exc
    if checked["kind"] != "agent":
        _fail("wrong_kind", ("document", "kind"), "legacy upgrade inventory requires an Agent")

    requirements: list[dict[str, Any]] = []
    seen: set[tuple[str, tuple[str | int, ...]]] = set()

    def require(code: str, path: tuple[str | int, ...], message: str) -> None:
        key = (code, path)
        if key in seen:
            return
        seen.add(key)
        requirements.append({"code": code, "path": _as_path(path), "message": message})

    def legacy_value(path: tuple[str | int, ...], message: str) -> None:
        require("legacy_value_review_required", path, message)

    def inspect_toolkit_rows(raw: Any, path: tuple[str | int, ...]) -> None:
        if type(raw) is not list:
            legacy_value(path, "Legacy toolkit references are not a list and need review.")
            return
        for row_index, row in enumerate(raw):
            row_path = path + (row_index,)
            if type(row) is not dict:
                legacy_value(row_path, "Legacy toolkit reference is not an object and needs review.")
                continue
            if type(row.get("id")) is not str or not row["id"].strip():
                legacy_value(row_path + ("id",), "Legacy toolkit reference has no valid identity.")
            if "enabled_tools" not in row:
                require("tool_selection_required", row_path + ("enabled_tools",),
                        "Choose which tools this reference enables.")
            else:
                enabled = row["enabled_tools"]
                if enabled is not None and (type(enabled) is not list
                        or any(type(item) is not str or not item.strip() for item in enabled)
                        or len(enabled) != len(set(enabled))):
                    legacy_value(row_path + ("enabled_tools",),
                                 "Legacy enabled-tool selection is malformed and needs review.")
            if "config" in row:
                config = row["config"]
                if type(config) is not dict:
                    require("toolkit_config_review_required", row_path + ("config",),
                            "Legacy toolkit configuration needs an explicit review.")
                    legacy_value(row_path + ("config",),
                                 "Legacy toolkit configuration is malformed and needs review.")
                elif config:
                    require("toolkit_config_review_required", row_path + ("config",),
                            "Legacy toolkit configuration is not projected into native settings.")
            for field in row:
                if field not in _TOOLKIT_FIELDS:
                    require("toolkit_config_review_required", row_path + (field,),
                            "Unknown legacy toolkit reference settings need review.")

    def inspect_prompt_source(raw: Any, path: tuple[str | int, ...], prompt_format: Any) -> None:
        if type(raw) is not str:
            require("legacy_prompt_review_required", path,
                    "Legacy prompt metadata needs review.")
            return
        if prompt_format == "skeleton":
            try:
                parsed = json.loads(raw)
            except (TypeError, ValueError, json.JSONDecodeError):
                require("legacy_prompt_review_required", path,
                        "Legacy structured prompt metadata needs review.")
                return
            if (type(parsed) is not dict or type(parsed.get("instructions")) is not str
                    or set(parsed) != {"instructions"}):
                require("legacy_prompt_review_required", path,
                        "Legacy structured prompt contains settings that need explicit review.")

    def inspect_subagent_rows(raw: Any, path: tuple[str | int, ...]) -> None:
        if type(raw) is not list:
            legacy_value(path, "Legacy subagent references are not a list and need review.")
            return
        for row_index, row in enumerate(raw):
            row_path = path + (row_index,)
            if type(row) is not dict:
                legacy_value(row_path, "Legacy subagent reference is not an object and needs review.")
                continue
            kind = row.get("kind")
            if type(kind) is not str or kind not in {"recipe_ref", "ref", "inline"}:
                legacy_value(row_path + ("kind",), "Legacy subagent reference kind needs review.")
            elif kind in {"recipe_ref", "ref"}:
                name_field = "recipe_name" if kind == "recipe_ref" else "template_name"
                if type(row.get(name_field)) is not str or not row[name_field].strip():
                    legacy_value(row_path + (name_field,), "Legacy subagent target identity needs review.")
            elif kind == "inline":
                if type(row.get("name")) is not str or not row["name"].strip():
                    legacy_value(row_path + ("name",), "Inline legacy subagent name needs review.")
                prompt_format = row.get("prompt_format")
                if type(prompt_format) is not str or prompt_format not in {"soul", "skeleton"}:
                    legacy_value(row_path + ("prompt_format",), "Inline legacy prompt format needs review.")
                if type(row.get("template")) is not dict:
                    legacy_value(row_path + ("template",), "Inline legacy template needs review.")
            disabled = row.get("disabled_tools", [])
            if type(disabled) is not list or any(type(item) is not str for item in disabled):
                legacy_value(row_path + ("disabled_tools",), "Legacy disabled-tool list needs review.")

    def inspect_recipe(raw: Any, path: tuple[str | int, ...], *, node_index: int) -> None:
        if type(raw) is not dict:
            legacy_value(path, "Legacy recipe metadata is not an object and needs review.")
            return
        for field in raw:
            if field not in _LEGACY_RECIPE_FIELDS:
                legacy_value(path + (field,), "Unknown legacy recipe settings need review.")
        if type(raw.get("name")) is not str or not raw["name"].strip():
            legacy_value(path + ("name",), "Legacy recipe name needs review.")
        if "nodes" in raw and (type(raw["nodes"]) is not list):
            legacy_value(path + ("nodes",), "Legacy recipe graph metadata needs review.")
            return
        graphless = "nodes" not in raw or not raw["nodes"]
        owner_id = checked["nodes"][node_index]["id"]
        attached_types: set[str] = set()
        for edge in checked["edges"]:
            if edge["kind"] != "attach":
                continue
            if edge["source_node_id"] == owner_id:
                pool_id = edge["target_node_id"]
            elif edge["target_node_id"] == owner_id:
                pool_id = edge["source_node_id"]
            else:
                continue
            pool = next(node for node in checked["nodes"] if node["id"] == pool_id)
            config = pool["config"]
            if pool["type"] == "toolkit_pool" and "toolkits" in config:
                attached_types.add("toolkit_pool")
            elif pool["type"] == "subagent_pool" and "subagents" in config:
                attached_types.add("subagent_pool")
        if "toolkit_pool" not in attached_types and "toolkits" in raw:
            if type(raw["toolkits"]) is not list:
                legacy_value(path + ("toolkits",), "Legacy recipe toolkit references need review.")
            else:
                inspect_toolkit_rows(raw["toolkits"], path + ("toolkits",))
        if "subagent_pool" not in attached_types and "subagent_pool" in raw:
            if type(raw["subagent_pool"]) is not list:
                legacy_value(path + ("subagent_pool",), "Legacy recipe subagent references need review.")
            else:
                inspect_subagent_rows(raw["subagent_pool"], path + ("subagent_pool",))
        if graphless and "toolkit_pool" not in attached_types:
            require("root_toolkit_pool_required", path + ("toolkits",),
                    "The legacy recipe has root toolkit policy that needs an attached native Toolkit Pool.")
        if graphless and type(raw.get("subagent_pool")) is list and raw["subagent_pool"] \
                and "subagent_pool" not in attached_types:
            require("root_subagent_pool_required", path + ("subagent_pool",),
                    "The legacy recipe has root subagents that need an attached native Subagent Pool.")
        agent_source = raw.get("agent")
        if agent_source is not None and type(agent_source) is not dict and "kernel" not in checked["nodes"][node_index]["config"]:
            require("legacy_prompt_review_required", path + ("agent",),
                    "Legacy root prompt metadata needs review.")
        elif "kernel" not in checked["nodes"][node_index]["config"] and type(agent_source) is dict and (
                type(agent_source.get("prompt_format")) is not str
                or agent_source.get("prompt_format") not in {"soul", "skeleton"}
                or type(agent_source.get("prompt", "")) is not str):
            require("legacy_prompt_review_required", path + ("agent",),
                    "Legacy root prompt metadata needs review.")
        elif "kernel" not in checked["nodes"][node_index]["config"] and type(agent_source) is dict:
            inspect_prompt_source(agent_source.get("prompt", ""), path + ("agent", "prompt"),
                                  agent_source.get("prompt_format"))

    def inspect_native_toolkits(config: dict[str, Any], path: tuple[str | int, ...]) -> None:
        raw = config["toolkits"]
        if type(raw) is not list:
            legacy_value(path + ("toolkits",), "Authored native Toolkit settings must be a list.")
            return
        if type(config.get("merge_with_user_selected")) is not bool:
            legacy_value(path + ("merge_with_user_selected",),
                         "Authored native Toolkit merge policy needs review.")
        for index, row in enumerate(raw):
            row_path = path + ("toolkits", index)
            if type(row) is not dict:
                legacy_value(row_path, "Authored native Toolkit reference must be an object.")
                continue
            if set(row) != _TOOLKIT_IDENTITY_FIELDS:
                legacy_value(row_path, "Authored native Toolkit reference has an invalid shape.")
            if type(row.get("id")) is not str or not row["id"].strip():
                legacy_value(row_path + ("id",), "Authored native Toolkit identity needs review.")
            if "enabled_tools" not in row:
                legacy_value(row_path + ("enabled_tools",),
                             "Authored native Toolkit selection needs review.")
            else:
                enabled = row["enabled_tools"]
                if enabled is not None and (type(enabled) is not list
                        or any(type(item) is not str or not item.strip() for item in enabled)
                        or len(enabled) != len(set(enabled))):
                    legacy_value(row_path + ("enabled_tools",),
                                 "Authored native Toolkit selection needs review.")

    def inspect_native_subagents(config: dict[str, Any], path: tuple[str | int, ...]) -> None:
        raw = config["subagents"]
        if type(raw) is not list:
            legacy_value(path + ("subagents",), "Authored native Subagent settings must be a list.")
            return
        for index, row in enumerate(raw):
            row_path = path + ("subagents", index)
            if type(row) is not dict:
                legacy_value(row_path, "Authored native Subagent setting must be an object.")
                continue
            if (type(row.get("id")) is not str or not row["id"].strip()
                    or type(row.get("name")) is not str or not row["name"].strip()
                    or type(row.get("source")) is not dict):
                legacy_value(row_path, "Authored native Subagent identity or source needs review.")

    for node_index, node in enumerate(checked["nodes"]):
        node_type = node["type"]
        config = node["config"]
        node_path = ("document", "nodes", node_index)
        config_path = node_path + ("config",)
        if node_type == "agent":
            recipe = config.get("legacy_recipe")
            if "legacy_recipe" in config:
                inspect_recipe(recipe, config_path + ("legacy_recipe",), node_index=node_index)
            template = config.get("legacy_template")
            if "legacy_template" in config:
                if type(template) is not dict:
                    legacy_value(config_path + ("legacy_template",),
                                 "Legacy template metadata needs review.")
                else:
                    checks = {
                        "description": lambda value: type(value) is str,
                        "allowed_modes": lambda value: type(value) is list and all(type(item) is str for item in value),
                        "output_mode": lambda value: type(value) is str,
                        "memory_policy": lambda value: type(value) is str,
                        "parallel_safe": lambda value: type(value) is bool,
                        "allowed_tools": lambda value: value is None or (type(value) is list and all(type(item) is str for item in value)),
                        "model": lambda value: value is None or type(value) is str,
                    }
                    for field, accepts in checks.items():
                        if field not in template or not accepts(template[field]):
                            legacy_value(config_path + ("legacy_template", field),
                                         "Legacy template settings need review.")
            legacy_fields = config.get("legacy_fields")
            if "toolkits" not in config and legacy_fields is not None and type(legacy_fields) is not dict:
                legacy_value(config_path + ("legacy_fields",),
                             "Legacy Agent settings need review.")
            elif type(legacy_fields) is dict:
                for field in legacy_fields:
                    if field not in _LEGACY_NODE_FIELDS["agent"]:
                        legacy_value(config_path + ("legacy_fields", field),
                                     "Unknown legacy Agent settings need review.")
                if "override" in legacy_fields and "kernel" not in config:
                    override = legacy_fields["override"]
                    prompt_path = config_path + ("legacy_fields", "override")
                    if type(override) is not dict:
                        require("legacy_prompt_review_required", prompt_path,
                                "Legacy Agent prompt metadata needs review.")
                    else:
                        if "prompt" in override:
                            inspect_prompt_source(override["prompt"], prompt_path + ("prompt",),
                                                  override.get("prompt_format"))
                        if ("prompt_format" in override
                                and (type(override["prompt_format"]) is not str
                                     or override["prompt_format"] not in {"soul", "skeleton"})):
                            require("legacy_prompt_review_required", prompt_path + ("prompt_format",),
                                    "Legacy Agent prompt format needs review.")
                        for field in override:
                            if field not in {"model", "prompt_format", "prompt"}:
                                require("legacy_prompt_review_required", prompt_path + (field,),
                                        "Unknown legacy prompt settings need review.")
            if "kernel" not in config:
                require("kernel_required", config_path + ("kernel",),
                        "Choose and configure a Kernel for this Agent.")
                prompt = config.get("prompt")
                if type(prompt) is dict and prompt.get("kind") == "builtin_developer_prompt":
                    require("builtin_prompt_review_required", config_path + ("prompt",),
                            "The built-in prompt requires an explicit upgrade review.")
            else:
                try:
                    validate_kernel_config(config["kernel"],
                                           config_path + ("kernel",))
                except SkeletonValidationError as exc:
                    require("kernel_invalid", exc.path,
                            "The authored Kernel is invalid and must be corrected.")
        elif node_type == "toolkit_pool":
            if "toolkits" not in config:
                require("toolkit_pool_conversion_required", config_path + ("toolkits",),
                        "Convert the preserved toolkit references into native Toolkit settings.")
            else:
                inspect_native_toolkits(config, config_path)
            legacy_fields = config.get("legacy_fields")
            legacy_path = config_path + ("legacy_fields",)
            if ("toolkits" not in config and "legacy_fields" in config
                    and type(legacy_fields) is not dict):
                legacy_value(legacy_path, "Legacy Toolkit Pool settings need review.")
            elif type(legacy_fields) is dict and "toolkits" not in config:
                for field in legacy_fields:
                    if field not in _LEGACY_NODE_FIELDS["toolkit_pool"]:
                        legacy_value(legacy_path + (field,), "Unknown legacy Toolkit Pool settings need review.")
                if "toolkits" not in legacy_fields:
                    legacy_value(legacy_path + ("toolkits",), "Legacy Toolkit Pool references are missing.")
                else:
                    inspect_toolkit_rows(legacy_fields["toolkits"], legacy_path + ("toolkits",))
        elif node_type == "subagent_pool":
            if "subagents" not in config:
                require("subagent_pool_conversion_required", config_path + ("subagents",),
                        "Convert the preserved subagent references into native Subagent settings.")
            else:
                inspect_native_subagents(config, config_path)
            legacy_fields = config.get("legacy_fields")
            legacy_path = config_path + ("legacy_fields",)
            if ("subagents" not in config and "legacy_fields" in config
                    and type(legacy_fields) is not dict):
                legacy_value(legacy_path, "Legacy Subagent Pool settings need review.")
            elif type(legacy_fields) is dict and "subagents" not in config:
                for field in legacy_fields:
                    if field not in _LEGACY_NODE_FIELDS["subagent_pool"]:
                        legacy_value(legacy_path + (field,), "Unknown legacy Subagent Pool settings need review.")
                if "subagents" not in legacy_fields:
                    legacy_value(legacy_path + ("subagents",), "Legacy Subagent Pool references are missing.")
                else:
                    inspect_subagent_rows(legacy_fields["subagents"], legacy_path + ("subagents",))
        elif "legacy_fields" in config:
            legacy_fields = config["legacy_fields"]
            legacy_path = config_path + ("legacy_fields",)
            if type(legacy_fields) is not dict:
                legacy_value(legacy_path, "Legacy node settings need review.")
            else:
                for field in legacy_fields:
                    if field not in _LEGACY_NODE_FIELDS.get(node_type, set()):
                        legacy_value(legacy_path + (field,), "Unknown legacy node settings need review.")

    return {
        "schema": _SCHEMA,
        "resource_id": checked["id"],
        "edit_token": edit_token,
        "source_identity": source_identity,
        "state": "needs_upgrade" if requirements else "native_draft",
        "requirements": requirements,
    }
