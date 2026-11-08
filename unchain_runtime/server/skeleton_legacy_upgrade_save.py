"""Explicit legacy configuration projection and single-resource CAS upgrade.

No startup hook, file lookup, model client or tool factory runs here. Preview
and apply share the same projection; only apply can persist its result.
"""
from __future__ import annotations

from contextlib import closing
from copy import deepcopy
import json
import re
import sqlite3
import time
from types import SimpleNamespace

from unchain.skeleton import convert_legacy_definition, materialize_legacy_agent, validate_subagent_pool_config
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.errors import SkeletonValidationError

from skeleton_legacy_upgrade import _LEGACY_NODE_FIELDS, _LEGACY_RECIPE_FIELDS
from skeleton_legacy_upgrade_choices import parse_upgrade_choices
from skeleton_resource_store import (
    SkeletonResourceError, _digest, _fail, _json_text, _resource_id,
)
from skeleton_runtime_capability import require_skeleton_runtime, SkeletonRuntimeCompatibilityError


_RECEIPT = "pupu.legacy_upgrade.receipt.v1:"
_ARCHIVE = "pupu.legacy_upgrade.source.v1:"
_VARIABLE = re.compile(r"\{\{#([^.}]+)\.([^#}]+)#\}\}")
_CONFIG_KEYS = {"kernel", "execution", "prompt", "legacy_recipe", "legacy_template", "legacy_fields", "legacy_source"}


def _text(value, path):
    if type(value) is not str or not value or value != value.strip():
        _fail("invalid_value", path, "Expected non-empty text without outer whitespace")
    return value


def _names(value, path, *, nullable=False):
    if value is None and nullable:
        return None
    if type(value) is not list:
        _fail("invalid_type", path, "Expected a list of unique names")
    result = [_text(item, path + (i,)) for i, item in enumerate(value)]
    if len(result) != len(set(result)):
        _fail("duplicate_name", path, "Names must be unique")
    return result


def _policy(document):
    """Use the actual source-kind parser, not native converter defaults."""
    for node in document["nodes"]:
        config = node["config"]
        if type(config.get("legacy_recipe")) is dict:
            from recipe import _parse_subagent_profile
            try:
                profile = _parse_subagent_profile(config["legacy_recipe"].get("subagent_profile"))
            except ValueError as exc:
                raise SkeletonResourceError("legacy_policy_invalid", ("source", "subagent_profile"),
                                            "Legacy recipe policy requires repair") from exc
            return {"allowed_modes": list(profile.allowed_modes), "output_mode": profile.output_mode,
                    "memory_policy": profile.memory_policy, "parallel_safe": profile.parallel_safe,
                    "allowed_tools": None}
        if type(config.get("legacy_template")) is dict:
            source = config["legacy_template"]
            keys = {"allowed_modes", "output_mode", "memory_policy", "parallel_safe", "allowed_tools"}
            if not keys <= set(source):
                _fail("legacy_policy_invalid", ("source", "legacy_template"), "Template policy provenance is incomplete")
            policy = {key: deepcopy(source[key]) for key in keys}
            # Validate enum types before Core's enum set checks can see an
            # unhashable value in an edited compatibility draft.
            _names(policy["allowed_modes"], ("source", "allowed_modes"))
            _names(policy["allowed_tools"], ("source", "allowed_tools"), nullable=True)
            for key in ("output_mode", "memory_policy"):
                _text(policy[key], ("source", key))
            try:
                validate_subagent_pool_config({"subagents": [{"id": "policy", "name": "Policy",
                    "description": "", "source": {"kind": "agent_ref", "agent_id": "policy"},
                    **policy, "disabled_tools": []}]}, ("policy",),
                    validate_embedded=lambda _body, path: _fail("invalid_shape", path,
                        "Policy validation must not contain an embedded definition"))
            except SkeletonValidationError as exc:
                raise SkeletonResourceError(exc.code, ("source", "legacy_template") + exc.path,
                                            "Template policy is invalid") from exc
            return policy
    _fail("legacy_source_missing", ("document",), "Legacy policy provenance was not found")


def _receipt_policy(connection, row):
    found = connection.execute("SELECT value FROM store_meta WHERE key=?", (_RECEIPT + row["resource_id"],)).fetchone()
    archive_row = connection.execute("SELECT value FROM store_meta WHERE key=?", (_ARCHIVE + row["resource_id"],)).fetchone()
    if found is None:
        _fail("legacy_dependency_upgrade_required", ("agent_id",),
              "Upgrade the referenced legacy Agent explicitly first", status=409)
    try:
        receipt = json.loads(found["value"])
        archive = json.loads(archive_row["value"]) if archive_row else None
        expected = {"schema", "resource_id", "source_identity", "source_sha256", "archive_digest",
                    "prior_edit_token", "edit_token", "draft_digest", "projection_digest", "runtime_manifest", "source_policy"}
        if (type(receipt) is not dict or set(receipt) != expected
                or receipt["schema"] != "pupu.skeleton-legacy-upgrade.receipt.v1"
                or receipt["resource_id"] != row["resource_id"]
                or receipt["source_identity"] != row["source_identity"]
                or type(archive) is not dict or set(archive) != {"schema", "document", "source_identity", "source_sha256"}
                or archive["schema"] != "pupu.skeleton-legacy-upgrade.source.v1"
                or archive["source_identity"] != receipt["source_identity"]
                or archive["source_sha256"] != receipt["source_sha256"]
                or _digest(archive) != receipt["archive_digest"]
                or _policy(archive["document"]) != receipt["source_policy"]):
            raise ValueError("Invalid upgrade receipt")
        return deepcopy(receipt["source_policy"])
    except (ValueError, TypeError, KeyError) as exc:
        raise SkeletonResourceError("legacy_upgrade_receipt_invalid", ("agent_id",),
                                    "Referenced upgrade provenance cannot be verified", status=409) from exc


class _Projection:
    def __init__(self, store, connection, choices):
        self.store, self.connection = store, connection
        self.entries = {key: {tuple(item["path"]): item for item in choices[key]}
                        for key in ("kernels", "toolkits", "references")}
        self.acks = {(item["code"], tuple(item["path"])) for item in choices["acknowledged"]}
        self.used = {key: set() for key in self.entries}
        self.used_acks = set()

    def choice(self, category, path):
        item = self.entries[category].get(path)
        if item is not None:
            self.used[category].add(path)
        return item

    def acknowledge(self, code, path):
        identity = (code, path)
        if identity not in self.acks:
            _fail(code, path, "Explicit review of this legacy setting is required")
        self.used_acks.add(identity)

    def finish(self):
        for category, entries in self.entries.items():
            remaining = set(entries) - self.used[category]
            if remaining:
                _fail("unused_choice", ("choices", category), "A choice does not address an upgrade requirement")
        if self.acks != self.used_acks:
            _fail("unused_choice", ("choices", "acknowledged"), "An acknowledgement was not applicable")

    def review(self, document, prefix):
        for i, node in enumerate(document["nodes"]):
            path = prefix + ("nodes", i, "config")
            config = node["config"]
            if node["type"] not in _LEGACY_NODE_FIELDS:
                _fail("legacy_graph_unsupported", path, "Upgrade this mixed execution graph in a later conversion slice")
            allowed = _CONFIG_KEYS if node["type"] in {"start", "agent", "end"} else {
                "legacy_fields", "toolkits", "merge_with_user_selected", "workflow_tools", "subagents"}
            if set(config) - allowed:
                _fail("legacy_graph_unsupported", path, "Unknown authored configuration must not be discarded")
            native = (node["type"] == "toolkit_pool" and "toolkits" in config
                      or node["type"] == "subagent_pool" and "subagents" in config
                      or node["type"] == "agent" and "kernel" in config)
            fields = config.get("legacy_fields", {})
            if not native:
                if type(fields) is not dict:
                    _fail("invalid_shape", path + ("legacy_fields",), "Legacy fields must be an object")
                for key in fields:
                    if key not in _LEGACY_NODE_FIELDS[node["type"]]:
                        self.acknowledge("legacy_setting_ignored", path + ("legacy_fields", key))
                if node["type"] == "agent" and "override" in fields:
                    if type(fields["override"]) is not dict:
                        _fail("invalid_shape", path + ("legacy_fields", "override"), "Legacy override must be an object")
                    if "kernel" not in config:
                        for key in fields["override"]:
                            if key not in {"model", "prompt", "prompt_format"}:
                                self.acknowledge("legacy_setting_ignored", path + ("legacy_fields", "override", key))
            source = config.get("legacy_recipe")
            if "legacy_recipe" in config and type(source) is not dict:
                _fail("invalid_shape", path + ("legacy_recipe",), "Recipe provenance must be an object")
            if type(source) is dict:
                if "nodes" in source and type(source["nodes"]) is not list:
                    _fail("invalid_shape", path + ("legacy_recipe", "nodes"), "Legacy graph nodes must be a list")
                for field in ("toolkits", "subagent_pool"):
                    if field in source and type(source[field]) is not list:
                        _fail("invalid_shape", path + ("legacy_recipe", field), "Legacy capabilities must be lists")
                for key in source:
                    if key not in _LEGACY_RECIPE_FIELDS:
                        self.acknowledge("legacy_setting_ignored", path + ("legacy_recipe", key))
            if node["type"] == "agent" and "kernel" not in config:
                prompt = config.get("prompt")
                if (type(prompt) is not dict or type(prompt.get("kind")) is not str
                        or prompt["kind"] not in {"text", "builtin_developer_prompt"}
                        or prompt["kind"] == "text" and type(prompt.get("text")) is not str):
                    _fail("invalid_shape", path + ("prompt",), "Legacy prompt must have a supported typed shape")
                address = prefix + ("nodes", i)
                selected = self.entries["kernels"].get(address)
                if selected is None or selected["prompt_policy"] == "preserve":
                    prompt_source = None
                    prompt_path = None
                    if type(fields) is dict and type(fields.get("override")) is dict:
                        prompt_source = fields["override"]
                        prompt_path = path + ("legacy_fields", "override", "prompt")
                    elif type(source) is dict and not source.get("nodes"):
                        prompt_source = source.get("agent")
                        prompt_path = path + ("legacy_recipe", "agent", "prompt")
                    if (type(prompt_source) is dict and prompt_source.get("prompt_format") == "skeleton"
                            and prompt["kind"] != "builtin_developer_prompt"):
                        try:
                            raw = json.loads(prompt_source.get("prompt", ""))
                        except (ValueError, TypeError) as exc:
                            raise SkeletonResourceError("legacy_prompt_review_required", prompt_path,
                                                        "Structured prompt cannot be decoded") from exc
                        if type(raw) is not dict or set(raw) != {"instructions"}:
                            self.acknowledge("legacy_prompt_review_required", prompt_path)

    def toolkit_rows(self, raw, path):
        if type(raw) is not list:
            _fail("invalid_shape", path, "Legacy Toolkit references must be a list")
        result = []
        for i, old in enumerate(raw):
            here = path + (i,)
            if type(old) is not dict:
                _fail("invalid_shape", here, "Toolkit reference must be an object")
            selected = self.choice("toolkits", here)
            valid_allowlist = "enabled_tools" in old
            if valid_allowlist:
                try:
                    _names(old["enabled_tools"], here + ("enabled_tools",), nullable=True)
                except SkeletonResourceError:
                    valid_allowlist = False
            unsupported = bool(set(old) - {"id", "enabled_tools", "config"}) or ("config" in old and old["config"] != {})
            if selected is None and (not valid_allowlist or unsupported):
                _fail("toolkit_choice_required", here, "Choose the enabled tools and review unsupported Toolkit settings")
            if selected is not None:
                if unsupported and not selected["discard_unsupported"]:
                    _fail("toolkit_config_review_required", here, "Explicitly accept discard of unsupported Toolkit settings")
                result.append({"id": selected["toolkit_id"], "enabled_tools": deepcopy(selected["enabled_tools"])})
            else:
                result.append({"id": _text(old.get("id"), here + ("id",)), "enabled_tools": deepcopy(old["enabled_tools"])})
        ids = [item["id"] for item in result]
        if len(ids) != len(set(ids)):
            _fail("duplicate_name", path, "Toolkit identities must be unique")
        return result

    def native_tools(self, config, path):
        result = {key: deepcopy(value) for key, value in config.items() if key != "legacy_fields"}
        if (not {"toolkits", "merge_with_user_selected"} <= set(result)
                or set(result) - {"toolkits", "merge_with_user_selected", "workflow_tools"}
                or type(result["toolkits"]) is not list or type(result["merge_with_user_selected"]) is not bool):
            _fail("invalid_shape", path, "Authored native Toolkit Pool configuration is invalid")
        ids = []
        for i, ref in enumerate(result["toolkits"]):
            here = path + ("toolkits", i)
            if type(ref) is not dict or set(ref) != {"id", "enabled_tools"}:
                _fail("invalid_shape", here, "Native Toolkit identity requires id and enabled_tools")
            ids.append(_text(ref["id"], here + ("id",)))
            _names(ref["enabled_tools"], here + ("enabled_tools",), nullable=True)
        if len(ids) != len(set(ids)):
            _fail("duplicate_name", path, "Native Toolkit identities must be unique")
        return result

    def reference(self, old, path):
        kind = old["kind"]
        field = "recipe_name" if kind == "recipe_ref" else "template_name"
        name = _text(old.get(field), path + (field,))
        selected = self.choice("references", path)
        scope = selected["source_scope"] if selected else ("user:agent_recipes" if kind == "recipe_ref" else "user:subagents")
        rows = self.connection.execute("""SELECT DISTINCT r.* FROM legacy_aliases a JOIN resources r
            ON r.resource_id=a.target_id WHERE a.source_scope=? AND a.legacy_name=?""", (scope, name)).fetchall()
        if selected:
            rows = [row for row in rows if row["resource_id"] == selected["agent_id"]]
        if not rows:
            _fail("resource_missing", path, "Exact scoped legacy subagent alias was not found", status=404)
        if len(rows) != 1:
            _fail("ambiguous_reference", path, "Choose the exact scoped subagent target", status=409)
        row = rows[0]
        if row["kind"] != "agent":
            _fail("wrong_kind", path, "Legacy subagent reference must target an Agent")
        if row["archived"]:
            _fail("resource_archived", path, "Referenced Agent is archived", status=409)
        child = self.store._document(row)
        policy = _receipt_policy(self.connection, row)
        return name, {"kind": "agent_ref", "agent_id": row["resource_id"]}, policy, child.get("description", "")

    def subagents(self, raw, path, parent_id):
        if type(raw) is not list:
            _fail("invalid_shape", path, "Legacy subagents must be a list")
        result = []
        for i, old in enumerate(raw):
            here = path + (i,)
            if (type(old) is not dict or type(old.get("kind")) is not str
                    or old["kind"] not in {"recipe_ref", "ref", "inline"}):
                _fail("invalid_shape", here, "Legacy subagent entry is invalid")
            kind = old["kind"]
            allowed = {"kind", "disabled_tools", *( {"recipe_name"} if kind == "recipe_ref" else {"template_name"} if kind == "ref" else {"name", "prompt_format", "template"})}
            for key in set(old) - allowed:
                self.acknowledge("legacy_setting_ignored", here + (key,))
            disabled = _names(old.get("disabled_tools", []), here + ("disabled_tools",))
            if kind != "inline":
                name, source, policy, description = self.reference(old, here)
            else:
                name = _text(old.get("name"), here + ("name",))
                template = deepcopy(old.get("template"))
                if (type(template) is not dict or type(old.get("prompt_format")) is not str
                        or old["prompt_format"] not in {"soul", "skeleton"}):
                    _fail("invalid_shape", here, "Inline template requires explicit supported prompt format")
                template.setdefault("description", name)
                template["name"] = name
                if old["prompt_format"] == "soul":
                    template["instructions"] = template.get("prompt")
                elif "instructions" not in template and type(template.get("prompt")) is str:
                    template["instructions"] = template["prompt"]
                child_id = "embedded-" + _digest([parent_id, list(here), name])[:32]
                child = convert_legacy_definition("skeleton_template", template, resource_id=child_id)
                policy = _policy(child)
                description = child.get("description", "")
                child = self.convert(child, prefix=here + ("document",), kernel_address=here)
                source = {"kind": "embedded", "document": child}
            result.append({"id": "legacy-" + _digest([parent_id, list(here)])[:24], "name": name,
                "description": description, "source": source, **policy, "disabled_tools": disabled})
        return result

    def materialize(self, original, prefix, kernel_address):
        kernels = {}
        for i, node in enumerate(original["nodes"]):
            if node["type"] != "agent" or "kernel" in node["config"]:
                continue
            path = kernel_address if kernel_address is not None else prefix + ("nodes", i)
            item = self.choice("kernels", path)
            if item is None:
                _fail("kernel_choice_required", path, "Choose a Kernel for this legacy Agent")
            kernels[node["id"]] = item
        result = deepcopy(original)
        first = None
        for i, target in enumerate(original["nodes"]):
            if target["type"] != "agent" or target["id"] not in kernels:
                continue
            selected = kernels[target["id"]]
            one = deepcopy(original)
            for node in one["nodes"]:
                if node["type"] == "agent" and node["id"] != target["id"] and node["id"] in kernels:
                    node["config"]["kernel"] = deepcopy(kernels[node["id"]]["kernel"])
            config = one["nodes"][i]["config"]
            base = deepcopy(selected["kernel"])
            if selected["model_policy"] == "replace":
                config.setdefault("legacy_fields", {}).setdefault("override", {})["model"] = base["profile"]["provider"] + ":" + base["profile"]["model"]
            prompt = config.get("prompt")
            if selected["prompt_policy"] == "replace":
                config["prompt"] = {"kind": "builtin_developer_prompt"}
            elif type(prompt) is dict and prompt.get("kind") == "builtin_developer_prompt":
                from unchain_adapter import _resolve_recipe_prompt
                base["prompt"] = _resolve_recipe_prompt(SimpleNamespace(agent=SimpleNamespace(
                    prompt="{{USE_BUILTIN_DEVELOPER_PROMPT}}", prompt_format="soul")))
            elif type(prompt) is dict and prompt.get("kind") == "text":
                by_id = {n["id"]: n for n in one["nodes"]}
                for match in _VARIABLE.finditer(prompt["text"]):
                    source = by_id.get(match.group(1))
                    name = match.group(2)
                    outputs = source["config"].get("execution", {}).get("outputs") if source else None
                    allowed = ([output["name"] for output in outputs] if type(outputs) is list else
                               [output["name"] for output in source["config"].get("legacy_fields", {}).get("outputs", [])]
                               if source and source["type"] == "start" and type(source["config"].get("legacy_fields")) is dict and "outputs" in source["config"]["legacy_fields"] else
                               ["text", "images", "files"] if source and source["type"] == "start" else ["message", "context"])
                    resolved_name = "message" if source and source["type"] == "agent" and name == "output" else name
                    if source is None or source["type"] not in {"start", "agent"} or resolved_name not in allowed:
                        _fail("legacy_prompt_reference_invalid", prefix + ("nodes", i, "config", "prompt"),
                              "Legacy prompt reference cannot be preserved; explicitly replace the prompt")
            projected = materialize_legacy_agent(one, base)
            first = first or projected
            result["nodes"][i]["config"] = projected["nodes"][i]["config"]
        if first:
            for i, node in enumerate(result["nodes"]):
                if node["type"] in {"start", "end"}:
                    node["config"] = first["nodes"][i]["config"]
        result = materialize_legacy_agent(result, None)
        for i, node in enumerate(result["nodes"]):
            if node["type"] == "start" and "execution" not in original["nodes"][i]["config"]:
                for output in node["config"]["execution"]["outputs"]:
                    if output["source"] == {"kind": "result", "path": ["text"]}:
                        output["source"]["path"] = ["message"]
        return result

    def convert(self, document, *, prefix=(), kernel_address=None):
        original = deepcopy(document)
        self.review(original, prefix)
        result = self.materialize(original, prefix, kernel_address)
        for i, node in enumerate(result["nodes"]):
            config = original["nodes"][i]["config"]
            path = prefix + ("nodes", i, "config")
            if node["type"] == "toolkit_pool":
                if "toolkits" in config:
                    node["config"] = self.native_tools(config, path)
                else:
                    fields = config.get("legacy_fields", {})
                    merge = fields.get("merge_with_user_selected", False)
                    if type(merge) is not bool:
                        _fail("invalid_type", path + ("legacy_fields", "merge_with_user_selected"), "Legacy merge policy must be a boolean")
                    node["config"] = {"toolkits": self.toolkit_rows(fields.get("toolkits", []), path + ("legacy_fields", "toolkits")), "merge_with_user_selected": merge}
            elif node["type"] == "subagent_pool":
                if "subagents" in config:
                    node["config"] = {k: deepcopy(v) for k, v in config.items() if k != "legacy_fields"}
                else:
                    node["config"] = {"subagents": self.subagents(config.get("legacy_fields", {}).get("subagents", []), path + ("legacy_fields", "subagents"), document["id"])}
        for i, node in enumerate(original["nodes"]):
            source = node["config"].get("legacy_recipe")
            if type(source) is not dict:
                continue
            if "description" not in result and "description" in source:
                result["description"] = source["description"]
            if source.get("nodes"):
                continue
            pool_ids = {edge["target_node_id"] if edge["source_node_id"] == node["id"] else edge["source_node_id"]
                        for edge in result["edges"] if edge["kind"] == "attach" and node["id"] in {edge["source_node_id"], edge["target_node_id"]}}
            attached = {n["type"] for n in result["nodes"] if n["id"] in pool_ids}
            path = prefix + ("nodes", i, "config", "legacy_recipe")
            for kind, field in (("toolkit_pool", "toolkits"), ("subagent_pool", "subagent_pool")):
                if kind in attached or kind == "subagent_pool" and not source.get(field):
                    continue
                pool_id = "upgrade-" + _digest([document["id"], node["id"], kind])[:32]
                if any(n["id"] == pool_id for n in result["nodes"]):
                    _fail("duplicate_name", path, "Generated pool identity conflicts with authored content")
                if kind == "toolkit_pool":
                    merge = source.get("merge_with_user_selected", True)
                    if type(merge) is not bool:
                        _fail("invalid_type", path + ("merge_with_user_selected",), "Legacy merge policy must be a boolean")
                    config = {"toolkits": self.toolkit_rows(source.get(field, []), path + (field,)), "merge_with_user_selected": merge}
                else:
                    config = {"subagents": self.subagents(source[field], path + (field,), document["id"])}
                result["nodes"].append({"id": pool_id, "type": kind, "config": config})
                result["edges"].append({"id": "attach-" + _digest([document["id"], pool_id])[:32], "kind": "attach",
                    "source_node_id": node["id"], "source_port_id": "attach_top", "target_node_id": pool_id, "target_port_id": "attach_bot"})
        return result


def _resource(store, connection, resource_id, token):
    _text(resource_id, ("resource_id",))
    resource_id = _resource_id(resource_id, ("resource_id",))
    _text(token, ("expected_edit_token",))
    row = connection.execute("SELECT * FROM resources WHERE resource_id=?", (resource_id,)).fetchone()
    if row is None:
        _fail("resource_missing", ("resource_id",), "Resource was not found", status=404)
    if row["edit_token"] != token:
        _fail("edit_conflict", ("expected_edit_token",), "Draft changed since it was read", status=409)
    if row["kind"] != "agent" or row["archived"]:
        _fail("wrong_kind" if row["kind"] != "agent" else "resource_archived", ("resource_id",), "Only active legacy Agents can be upgraded", status=409)
    document = store._document(row)
    if connection.execute("SELECT 1 FROM store_meta WHERE key=?", (_RECEIPT + resource_id,)).fetchone():
        _fail("legacy_upgrade_already_applied", ("resource_id",), "This Agent was already explicitly upgraded", status=409)
    migration = connection.execute("SELECT * FROM legacy_migrations WHERE source_identity=? AND target_id=?", (row["source_identity"], resource_id)).fetchone()
    if migration is None or migration["stage"] != "active":
        _fail("legacy_source_missing", ("resource_id",), "An active first-hop migration is required", status=409)
    return row, document, migration


def _check_native_children(store, connection, document, *, stack, depth=0):
    """Prevent the old runtime-only materializer from selecting child Kernels."""
    if depth > 6:
        _fail("limit_depth", ("document",), "Subagent depth exceeds 6")
    for i, node in enumerate(document["nodes"]):
        if node["type"] != "subagent_pool":
            continue
        for j, entry in enumerate(node["config"]["subagents"]):
            source = entry["source"]
            path = ("document", "nodes", i, "config", "subagents", j, "source")
            child_stack = stack
            if source["kind"] == "agent_ref":
                agent_id = source["agent_id"]
                if agent_id in stack:
                    _fail("recursive_reference", path, "Agent subagent cycle is forbidden")
                row = connection.execute("SELECT * FROM resources WHERE resource_id=?", (agent_id,)).fetchone()
                if row is None:
                    _fail("resource_missing", path, "Referenced Agent was not found", status=404)
                if row["source_identity"] is not None:
                    _receipt_policy(connection, row)
                child = store._document(row)
                child_stack = stack + (agent_id,)
            else:
                child = source["document"]
            if any(any(key.startswith("legacy_") for key in n["config"]) for n in child["nodes"]):
                _fail("legacy_dependency_upgrade_required", path, "Child graph must be explicitly upgraded first", status=409)
            _check_native_children(store, connection, child, stack=child_stack, depth=depth + 1)


def _project(store, connection, row, original, migration, choices):
    projection = _Projection(store, connection, choices)
    try:
        document = projection.convert(original)
        plan = store._validate_execution(document)
        _check_native_children(store, connection, document, stack=(row["resource_id"],))
        store._validate_local_profiles(document)
        subagents = store._resolve_subagent_closure(connection, document, owner_id=row["resource_id"],
            stack=(row["resource_id"],), depth=0, legacy_kernel=None,
            source_document=document, prepared_identities={document["id"]: execution_definition_digest(plan)})
        dependencies = store._resolve_closure(connection, document, row["resource_id"], subagents=subagents)
        projection.finish()
        manifest = require_skeleton_runtime()
    except SkeletonValidationError as exc:
        raise SkeletonResourceError(exc.code, exc.path, str(exc)) from exc
    except SkeletonRuntimeCompatibilityError as exc:
        raise SkeletonResourceError(exc.code, ("runtime_manifest",), str(exc), status=409) from exc
    preview = {"schema": "pupu.skeleton-legacy-upgrade.preview.v1", "resource_id": row["resource_id"],
        "edit_token": row["edit_token"], "source_identity": row["source_identity"], "source_sha256": migration["source_sha256"],
        "runtime_manifest": manifest, "document": document, "definition_digest": execution_definition_digest(plan),
        "subagents": subagents, "dependencies": [{"workflow_id": d[0], "revision_id": d[1], "definition_digest": d[2]} for d in dependencies],
        "source_policy": _policy(original)}
    preview["projection_digest"] = _digest(preview)
    return preview


def preview_legacy_upgrade(store, resource_id, *, expected_edit_token, choices):
    choices = parse_upgrade_choices(choices)
    try:
        with closing(store._connect()) as connection:
            connection.execute("BEGIN")
            try:
                row, document, migration = _resource(store, connection, resource_id, expected_edit_token)
                return _project(store, connection, row, document, migration, choices)
            finally:
                connection.rollback()
    except sqlite3.Error as exc:
        raise SkeletonResourceError("upgrade_store_error", ("resource_id",), "Upgrade preview could not read the Store", status=409) from exc


def apply_legacy_upgrade(store, resource_id, *, expected_edit_token, expected_projection_digest, choices,
                         result_check=None):
    choices = parse_upgrade_choices(choices)
    if type(expected_projection_digest) is not str or re.fullmatch(r"[0-9a-f]{64}", expected_projection_digest) is None:
        _fail("invalid_value", ("expected_projection_digest",), "Expected the exact preview digest")
    try:
        with closing(store._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                row, original, migration = _resource(store, connection, resource_id, expected_edit_token)
                preview = _project(store, connection, row, original, migration, choices)
                if preview["projection_digest"] != expected_projection_digest:
                    _fail("upgrade_preview_stale", ("expected_projection_digest",), "Configuration or dependencies changed; preview again", status=409)
                document = preview["document"]
                digest = _digest(document)
                revision = row["edit_revision"] + 1
                token = f"edit-{revision}-{digest[:16]}"
                now = int(time.time() * 1000)
                archive = {"schema": "pupu.skeleton-legacy-upgrade.source.v1", "document": original,
                           "source_identity": row["source_identity"], "source_sha256": migration["source_sha256"]}
                receipt = {"schema": "pupu.skeleton-legacy-upgrade.receipt.v1", "resource_id": row["resource_id"],
                    "source_identity": row["source_identity"], "source_sha256": migration["source_sha256"], "archive_digest": _digest(archive),
                    "prior_edit_token": row["edit_token"], "edit_token": token, "draft_digest": digest,
                    "projection_digest": expected_projection_digest, "runtime_manifest": preview["runtime_manifest"],
                    "source_policy": preview["source_policy"]}
                connection.execute("""UPDATE resources SET name=?,description=?,draft_json=?,draft_digest=?,
                    edit_revision=?,edit_token=?,updated_at_ms=? WHERE resource_id=? AND edit_token=?""",
                    (document["name"], document.get("description", ""), _json_text(document), digest, revision,
                     token, now, row["resource_id"], expected_edit_token))
                connection.execute("INSERT INTO store_meta(key,value) VALUES(?,?)", (_ARCHIVE + row["resource_id"], _json_text(archive)))
                connection.execute("INSERT INTO store_meta(key,value) VALUES(?,?)", (_RECEIPT + row["resource_id"], _json_text(receipt)))
                saved_row = connection.execute("SELECT * FROM resources WHERE resource_id=?", (row["resource_id"],)).fetchone()
                result = {**store._summary(saved_row), "document": deepcopy(document), "diagnostics": store.diagnose(document)}
                # Trusted Host-only seam: prepare/validate transport bytes while
                # all three writes can still roll back. No wire callback and no
                # replacement/mutation of the Store's captured return value.
                if result_check is not None:
                    result_check(deepcopy(result))
                connection.commit()
                return result
            except BaseException:
                connection.rollback()
                raise
    except sqlite3.Error as exc:
        raise SkeletonResourceError("upgrade_store_error", ("resource_id",), "Upgrade transaction was rolled back", status=409) from exc
