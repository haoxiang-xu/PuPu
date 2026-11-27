"""Convert unpublished legacy Agents into editable native drafts at startup.

Missing model information stays draft data, never a fabricated runnable Kernel.
The source archive and receipt use the existing cutover contract so aliases and
retained runs keep their established identities.
"""
from contextlib import closing
from copy import deepcopy
import re
import sqlite3
import time
from types import SimpleNamespace

from skeleton_code_source_store import _frame
from skeleton_code_sources import _content_digest
from skeleton_legacy_upgrade_save import (
    _ARCHIVE, _RECEIPT, _Projection, _policy, _receipt_policy, _resource,
)
from skeleton_resource_store import SkeletonResourceError, _digest, _fail, _json_text
from skeleton_runtime_capability import require_skeleton_runtime


_VARIABLE = re.compile(r"\{\{#([^.}]+)\.([^#}]+)#\}\}")
_START_PREFIX = re.compile(r"^\s*\{\{#start\.text#\}\}\s*\{\{#start\.images#\}\}\s*\{\{#start\.files#\}\}\s*")


def _outputs(node):
    config = node["config"]
    execution = config.get("execution", {})
    if type(execution) is not dict:
        _fail("invalid_type", ("document", "nodes", node["id"], "config", "execution"), "Execution settings must be an object")
    values = execution.get("outputs")
    if values is None and node["type"] == "start":
        values = config.get("legacy_fields", {}).get("outputs")
    if values is not None:
        if type(values) is not list or any(type(v) is not dict or type(v.get("name")) is not str for v in values):
            _fail("invalid_shape", ("document", "nodes", node["id"]), "Output names cannot be migrated")
        names = [v["name"] for v in values]
        if not names or len(names) != len(set(names)):
            _fail("invalid_shape", ("document", "nodes", node["id"]), "Output names must be unique")
        return names
    return ["text", "images", "files"] if node["type"] == "start" else ["message", "context"]


def _export(names, kind):
    return [{"name": name, "source": {"kind": kind, "path": [name]}} for name in names]


class _AutomaticProjection(_Projection):
    def __init__(self, store, connection, ensure, stack):
        super().__init__(store, connection, {"kernels": [], "toolkits": [], "references": [], "acknowledged": []})
        self.ensure, self.stack = ensure, stack

    def acknowledge(self, code, path):
        # Automatic migration is not permission to throw unknown settings away.
        _fail(code, path, "Unsupported legacy settings could not be migrated automatically")

    def toolkit_rows(self, raw, path):
        rows = deepcopy(raw)
        if type(rows) is list:
            for row in rows:
                if type(row) is dict:
                    # The old recipe reader defines absence as all tools.
                    row.setdefault("enabled_tools", None)
        return super().toolkit_rows(rows, path)

    def reference(self, old, path):
        scope = "user:agent_recipes" if old["kind"] == "recipe_ref" else "user:subagents"
        name = old.get("recipe_name" if old["kind"] == "recipe_ref" else "template_name")
        rows = self.connection.execute("SELECT DISTINCT target_id FROM legacy_aliases WHERE source_scope=? AND legacy_name=?", (scope, name)).fetchall()
        if len(rows) == 1:
            self.ensure(rows[0]["target_id"], self.stack)
        return super().reference(old, path)

    def materialize(self, original, prefix, kernel_address):
        result = deepcopy(original)
        by_id = {n["id"]: n for n in original["nodes"]}
        incoming = {}
        for edge in original["edges"]:
            if edge["kind"] != "flow":
                continue
            target = edge["target_node_id"]
            if target in incoming:
                _fail("invalid_shape", prefix + ("edges",), "Legacy nodes require one flow predecessor")
            incoming[target] = edge["source_node_id"]
        recipe = next((n["config"]["legacy_recipe"] for n in original["nodes"]
                       if type(n["config"].get("legacy_recipe")) is dict), {})
        for index, node in enumerate(result["nodes"]):
            config = node["config"]
            if node["type"] not in {"start", "agent", "end"}:
                continue
            if node["type"] == "start":
                execution = deepcopy(config.get("execution", {"outputs": _export(_outputs(node), "result")}))
                if "execution" not in config:
                    for item in execution["outputs"]:
                        if item["source"]["path"] == ["text"]:
                            item["source"]["path"] = ["message"]
                node["config"] = {"execution": execution}
                continue
            predecessor = by_id.get(incoming.get(node["id"]))
            if predecessor is None:
                _fail("missing_value", prefix + ("nodes", index), "Legacy flow predecessor is missing")
            names = _outputs(predecessor)
            inputs = [{"name": name, "value": {"kind": "ref", "node_id": predecessor["id"], "path": [name]},
                       "missing": "error" if name in {"text", "message"} else "null"} for name in names]
            if node["type"] == "end":
                node["config"] = {"execution": deepcopy(config.get("execution", {"inputs": inputs, "outputs": _export(names, "input")}))}
                continue
            if "kernel" in config:
                node["config"] = {"execution": deepcopy(config.get("execution", {"inputs": inputs, "outputs": _export(["message", "context"], "result")})),
                                  "kernel": deepcopy(config["kernel"])}
                continue
            if "execution" in config:
                authored = config["execution"]
                if type(authored) is not dict or type(authored.get("inputs")) is not list:
                    _fail("invalid_shape", prefix + ("nodes", index, "config", "execution"), "Authored inputs must remain a list")
                inputs = deepcopy(authored["inputs"])
            prompt = config["prompt"]
            if prompt["kind"] == "builtin_developer_prompt":
                from unchain_adapter import _resolve_recipe_prompt
                text = _resolve_recipe_prompt(SimpleNamespace(agent=SimpleNamespace(
                    prompt="{{USE_BUILTIN_DEVELOPER_PROMPT}}", prompt_format="soul")))
            else:
                text = _START_PREFIX.sub("", prompt["text"]).strip()

            def bind(match):
                source = by_id.get(match.group(1))
                name = "message" if source and source["type"] == "agent" and match.group(2) == "output" else match.group(2)
                if source is None or source["type"] not in {"start", "agent"} or name not in _outputs(source):
                    _fail("legacy_prompt_reference_invalid", prefix + ("nodes", index, "config", "prompt"), "Legacy prompt reference is unavailable")
                count = 0
                used = {item.get("name") for item in inputs if type(item) is dict and type(item.get("name")) is str}
                while "__legacy_prompt_" + str(count) in used:
                    count += 1
                binding_name = "__legacy_prompt_" + str(count)
                inputs.append({"name": binding_name, "value": {"kind": "ref", "node_id": source["id"], "path": [name]}, "missing": "error"})
                return "{{#input." + binding_name + "#}}"

            text = _VARIABLE.sub(bind, text)
            legacy = recipe or config.get("legacy_template", {})
            override = config.get("legacy_fields", {}).get("override", {})
            model = override.get("model") or legacy.get("model")
            maximum = legacy.get("max_iterations")
            if model is not None and (type(model) is not str or not model.strip()):
                _fail("invalid_type", prefix + ("nodes", index, "config", "model"), "Stored model identity is invalid")
            if maximum is not None and (type(maximum) is not int or maximum < 1):
                _fail("invalid_type", prefix + ("nodes", index, "config", "max_iterations"), "Stored iteration limit is invalid")
            execution = deepcopy(config.get("execution", {"outputs": _export(["message", "context"], "result")}))
            execution["inputs"] = inputs
            node["config"] = {"execution": execution,
                              "kernel_draft": {"prompt": text, "model": model, "max_iterations": maximum}}
        return result


def auto_upgrade_known_resources(store, *, blocked_sources=()):
    """Upgrade each pending dependency closure atomically; already-native rows stay put."""
    failures = []
    with closing(store._connect()) as connection:
        connection.execute("BEGIN IMMEDIATE")

        def ensure(resource_id, stack=()):
            row = connection.execute("SELECT * FROM resources WHERE resource_id=?", (resource_id,)).fetchone()
            if row is None:
                _fail("resource_missing", ("resource_id",), "Migration target is missing")
            if row["archived"]:
                return
            if row["source_identity"] in blocked_sources:
                _fail("migration_source_changed", ("source_identity",), "The current legacy source could not be verified")
            if connection.execute("SELECT 1 FROM store_meta WHERE key=?", (_RECEIPT + resource_id,)).fetchone():
                _receipt_policy(connection, row)
                return
            if resource_id in stack or len(stack) >= 6:
                _fail("recursive_reference", ("resource_id",), "Legacy subagent cycle or depth limit")
            row, original, migration = _resource(store, connection, resource_id, row["edit_token"])
            projection = _AutomaticProjection(store, connection, ensure, stack + (resource_id,))
            document = store._validate_draft(projection.convert(original))
            digest = _digest(document)
            revision = row["edit_revision"] + 1
            token = store._token(revision, digest)
            frame = _frame(connection, row)
            managed = "code_sources_manifest" in row.keys() and row["code_sources_manifest"] is not None
            if managed:
                content_digest = _content_digest(document, frame["sources_manifest"])
                token = store._token(revision, content_digest)
            archive = {"schema": "pupu.skeleton-legacy-upgrade.source.v1", "document": original,
                       "source_identity": row["source_identity"], "source_sha256": migration["source_sha256"]}
            manifest = require_skeleton_runtime()
            receipt = {"schema": "pupu.skeleton-legacy-upgrade.receipt.v1", "resource_id": resource_id,
                       "source_identity": row["source_identity"], "source_sha256": migration["source_sha256"], "archive_digest": _digest(archive),
                       "prior_edit_token": row["edit_token"], "edit_token": token, "draft_digest": digest,
                       "projection_digest": _digest({"document": document, "runtime_manifest": manifest}),
                       "runtime_manifest": manifest, "source_policy": _policy(original)}
            fields = (document["name"], document.get("description", ""), _json_text(document), digest,
                      revision, token, int(time.time() * 1000))
            if managed:
                connection.create_function("pupu_managed_write", 0, lambda: 1)
                connection.execute("UPDATE resources SET name=?,description=?,draft_json=?,draft_digest=?,edit_revision=?,edit_token=?,updated_at_ms=?,code_content_digest=? WHERE resource_id=? AND edit_token=?",
                                   (*fields, content_digest, resource_id, row["edit_token"]))
            else:
                connection.execute("UPDATE resources SET name=?,description=?,draft_json=?,draft_digest=?,edit_revision=?,edit_token=?,updated_at_ms=? WHERE resource_id=? AND edit_token=?",
                                   (*fields, resource_id, row["edit_token"]))
            connection.execute("INSERT INTO store_meta(key,value) VALUES(?,?)", (_ARCHIVE + resource_id, _json_text(archive)))
            connection.execute("INSERT INTO store_meta(key,value) VALUES(?,?)", (_RECEIPT + resource_id, _json_text(receipt)))
            saved = connection.execute("SELECT * FROM resources WHERE resource_id=?", (resource_id,)).fetchone()
            _frame(connection, saved)

        rows = connection.execute("SELECT resource_id,source_identity FROM resources WHERE kind='agent' AND archived=0 AND source_identity IS NOT NULL ORDER BY resource_id").fetchall()
        for row in rows:
            connection.execute("SAVEPOINT auto_upgrade")
            try:
                ensure(row["resource_id"])
            except (SkeletonResourceError, sqlite3.Error) as exc:
                connection.execute("ROLLBACK TO auto_upgrade")
                failures.append({"source_identity": row["source_identity"], "stage": "failed", "error": {
                    "code": exc.code if isinstance(exc, SkeletonResourceError) else "upgrade_store_error",
                    "path": list(exc.path) if isinstance(exc, SkeletonResourceError) else ["resource_id"],
                    "message": str(exc) if isinstance(exc, SkeletonResourceError) else "Automatic upgrade rolled back"}})
            connection.execute("RELEASE auto_upgrade")
        connection.commit()
    return failures
