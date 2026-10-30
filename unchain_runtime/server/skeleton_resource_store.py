"""Transactional PuPu store for Agent drafts and published Workflow revisions."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
from typing import Any

from unchain.skeleton import (
    convert_legacy_definition,
    diagnose_skeleton_draft,
    materialize_legacy_agent,
    prepare_agent_graph,
    prepare_workflow,
    validate_skeleton_document,
    validate_skeleton_for_execution,
)
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.errors import SkeletonValidationError
from unchain.skeleton.execution import _validate_all
from unchain.skeleton.kernel_config import validate_kernel_config
from skeleton_runtime_capability import SkeletonRuntimeCompatibilityError, require_skeleton_runtime


_SCHEMA = "pupu.skeleton_resource_store.v1"
_MIGRATION_STAGES = ("discovered", "written", "validated", "active")
_RESOURCE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$")


class SkeletonResourceError(ValueError):
    def __init__(self, code: str, path: tuple[str | int, ...], message: str,
                 *, status: int = 400):
        self.code = code
        self.path = path
        self.status = status
        super().__init__(message)


def _fail(code: str, path: tuple[str | int, ...], message: str,
          *, status: int = 400) -> None:
    raise SkeletonResourceError(code, path, message, status=status)


def _text(value: Any, path: tuple[str | int, ...], label: str) -> str:
    if type(value) is not str:
        _fail("invalid_type", path, f"{label} must be a string")
    value = value.strip()
    if not value:
        _fail("invalid_value", path, f"{label} must be non-empty")
    return value


def _resource_id(value: Any, path: tuple[str | int, ...]) -> str:
    value = _text(value, path, "resource id")
    if _RESOURCE_ID_PATTERN.fullmatch(value) is None:
        _fail("invalid_value", path, "resource id must use URL-safe identifier characters")
    return value


def _json_bytes(value: Any) -> bytes:
    try:
        return json.dumps(value, sort_keys=True, separators=(",", ":"),
                          ensure_ascii=False, allow_nan=False).encode("utf-8", "surrogatepass")
    except (TypeError, ValueError, UnicodeError) as exc:
        raise SkeletonResourceError("invalid_json", ("document",),
                                    "value is not canonical JSON") from exc


def _json_text(value: Any) -> str:
    return _json_bytes(value).decode("utf-8", "surrogatepass")


def _digest(value: Any) -> str:
    return sha256(_json_bytes(value)).hexdigest()


def _strict_json(raw: str) -> Any:
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                _fail("duplicate_name", ("source", key), "legacy JSON contains duplicate keys")
            result[key] = value
        return result
    try:
        return json.loads(raw, object_pairs_hook=pairs,
                          parse_constant=lambda value: _fail(
                              "invalid_json", ("source",), f"invalid JSON number {value}"))
    except SkeletonResourceError:
        raise
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise SkeletonResourceError("invalid_json", ("source",),
                                    "legacy source is not valid JSON") from exc


class SkeletonResourceStore:
    def __init__(self, root: Path | None = None):
        self.root = Path(root) if root is not None else Path.home() / ".pupu" / "skeletons"
        self.root.mkdir(parents=True, exist_ok=True)
        self.database_path = self.root / "resources.sqlite3"
        self._initialize()

    def _connect(self):
        connection = sqlite3.connect(self.database_path, timeout=15, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=15000")
        connection.execute("PRAGMA journal_mode=WAL")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS store_meta(
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                INSERT OR IGNORE INTO store_meta(key,value) VALUES('schema','pupu.skeleton_resource_store.v1');
                CREATE TABLE IF NOT EXISTS resources(
                    resource_id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL CHECK(kind IN ('agent','workflow')),
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    archived INTEGER NOT NULL CHECK(archived IN (0,1)),
                    draft_json TEXT NOT NULL,
                    draft_digest TEXT NOT NULL,
                    edit_revision INTEGER NOT NULL,
                    edit_token TEXT NOT NULL UNIQUE,
                    source_identity TEXT,
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS resources_name ON resources(name);
                CREATE TABLE IF NOT EXISTS workflow_versions(
                    workflow_id TEXT NOT NULL,
                    revision_id TEXT NOT NULL,
                    ordinal INTEGER NOT NULL,
                    definition_json TEXT NOT NULL,
                    definition_digest TEXT NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    PRIMARY KEY(workflow_id,revision_id),
                    UNIQUE(workflow_id,ordinal),
                    FOREIGN KEY(workflow_id) REFERENCES resources(resource_id)
                );
                CREATE TABLE IF NOT EXISTS workflow_dependencies(
                    workflow_id TEXT NOT NULL,
                    revision_id TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    target_workflow_id TEXT NOT NULL,
                    target_revision_id TEXT NOT NULL,
                    target_digest TEXT NOT NULL,
                    PRIMARY KEY(workflow_id,revision_id,target_workflow_id,target_revision_id),
                    FOREIGN KEY(workflow_id,revision_id)
                        REFERENCES workflow_versions(workflow_id,revision_id)
                );
                CREATE TABLE IF NOT EXISTS legacy_migrations(
                    source_identity TEXT PRIMARY KEY,
                    source_kind TEXT NOT NULL,
                    source_sha256 TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    target_sha256 TEXT,
                    stage TEXT NOT NULL,
                    updated_at_ms INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS legacy_aliases(
                    source_scope TEXT NOT NULL,
                    legacy_name TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    source_identity TEXT NOT NULL,
                    PRIMARY KEY(source_scope,legacy_name,source_identity)
                );
                CREATE TABLE IF NOT EXISTS python_profiles(
                    profile_id TEXT PRIMARY KEY,
                    executable TEXT NOT NULL,
                    executable_fingerprint TEXT NOT NULL,
                    edit_revision INTEGER NOT NULL,
                    edit_token TEXT NOT NULL UNIQUE,
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL
                );
            """)
            schema = connection.execute(
                "SELECT value FROM store_meta WHERE key='schema'"
            ).fetchone()["value"]
            if schema != _SCHEMA:
                _fail("unknown_version", ("store", "schema"), "resource store schema is unsupported")

    @staticmethod
    def _token(revision: int, digest: str) -> str:
        return f"edit-{revision}-{digest[:24]}"

    @staticmethod
    def _document(row: sqlite3.Row) -> dict[str, Any]:
        return json.loads(row["draft_json"])

    @staticmethod
    def _summary(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["resource_id"], "kind": row["kind"], "name": row["name"],
            "description": row["description"], "archived": bool(row["archived"]),
            "edit_token": row["edit_token"], "draft_digest": row["draft_digest"],
            "source_identity": row["source_identity"],
        }

    def list_resources(self, *, include_archived: bool = True) -> list[dict[str, Any]]:
        clause = "" if include_archived else " WHERE archived=0"
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM resources" + clause + " ORDER BY lower(name),resource_id"
            ).fetchall()
            result = []
            for row in rows:
                summary = self._summary(row)
                if row["kind"] == "workflow":
                    summary["published_revisions"] = connection.execute(
                        "SELECT count(*) AS count FROM workflow_versions WHERE workflow_id=?",
                        (row["resource_id"],),
                    ).fetchone()["count"]
                result.append(summary)
            return result

    def get_resource(self, resource_id: str) -> dict[str, Any]:
        resource_id = _resource_id(resource_id, ("resource_id",))
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM resources WHERE resource_id=?", (resource_id,),
            ).fetchone()
        if row is None:
            _fail("resource_missing", ("resource_id",), "Skeleton resource was not found", status=404)
        result = self._summary(row)
        result["document"] = self._document(row)
        result["diagnostics"] = self.diagnose(result["document"])
        return result

    def diagnose(self, document: Any) -> list[dict[str, Any]]:
        try:
            checked = validate_skeleton_document(document)
            return [asdict(item) | {"path": list(item.path)}
                    for item in diagnose_skeleton_draft(checked)]
        except SkeletonValidationError as exc:
            raise SkeletonResourceError(exc.code, exc.path, str(exc)) from exc

    def _validate_draft(self, document: Any) -> dict[str, Any]:
        try:
            return validate_skeleton_document(document)
        except SkeletonValidationError as exc:
            raise SkeletonResourceError(exc.code, exc.path, str(exc)) from exc

    def _validate_execution(self, document: Any):
        try:
            checked = validate_skeleton_for_execution(document)
            plan = prepare_workflow(checked) if checked["kind"] == "workflow" else prepare_agent_graph(checked)
            _validate_all(plan.snapshot(), agent_graph=checked["kind"] == "agent")
        except SkeletonValidationError as exc:
            raise SkeletonResourceError(exc.code, exc.path, str(exc)) from exc
        try:
            require_skeleton_runtime()
        except SkeletonRuntimeCompatibilityError as exc:
            raise SkeletonResourceError(
                exc.code, ("runtime_protocol_manifest",), str(exc), status=409,
            ) from exc
        return plan

    @staticmethod
    def _legacy_agent_metadata(document: dict[str, Any]) -> dict[str, Any] | None:
        for node in document.get("nodes", []):
            if node.get("type") != "agent" or type(node.get("config")) is not dict:
                continue
            source = node["config"].get("legacy_recipe")
            if type(source) is dict:
                profile = source.get("subagent_profile")
                return profile if type(profile) is dict else {}
            source = node["config"].get("legacy_template")
            if type(source) is dict:
                return source
        return None

    @staticmethod
    def _subagent_entry(*, entry_id: str, name: str, source: dict[str, Any],
                        metadata: dict[str, Any] | None,
                        disabled_tools: list[str]) -> dict[str, Any]:
        profile = metadata or {}
        return {
            "id": entry_id,
            "name": name,
            "description": deepcopy(profile.get("description", "")),
            "source": source,
            "allowed_modes": deepcopy(profile.get("allowed_modes", ["delegate", "worker"])),
            "output_mode": deepcopy(profile.get("output_mode", "summary")),
            "memory_policy": deepcopy(profile.get("memory_policy", "ephemeral")),
            "parallel_safe": deepcopy(profile.get("parallel_safe", True)),
            "allowed_tools": deepcopy(profile.get("allowed_tools")),
            "disabled_tools": list(disabled_tools),
        }

    def _legacy_alias_agent(self, connection, name: str,
                            path: tuple[str | int, ...]) -> tuple[str, dict[str, Any]]:
        rows = connection.execute("""
            SELECT DISTINCT a.target_id,r.kind,r.archived,r.draft_json
            FROM legacy_aliases a JOIN resources r ON r.resource_id=a.target_id
            WHERE a.legacy_name=?
        """, (name,)).fetchall()
        agent_rows = [row for row in rows if row["kind"] == "agent"]
        if not agent_rows:
            if rows:
                _fail("wrong_kind", path, "legacy subagent target is not an Agent")
            _fail("resource_missing", path, "legacy subagent target was not found", status=404)
        ids = {row["target_id"] for row in agent_rows}
        if len(ids) != 1:
            _fail("ambiguous_reference", path, "legacy subagent name is ambiguous", status=409)
        row = agent_rows[0]
        if row["archived"]:
            _fail("resource_archived", path, "legacy subagent target is archived", status=409)
        return row["target_id"], json.loads(row["draft_json"])

    @staticmethod
    def _pool_owner_nodes(document: dict[str, Any], pool_id: str):
        agents = {node["id"] for node in document["nodes"] if node["type"] == "agent"}
        owners = set()
        for edge in document["edges"]:
            if edge["kind"] != "attach":
                continue
            source, target = edge["source_node_id"], edge["target_node_id"]
            if source == pool_id and target in agents:
                owners.add(target)
            elif target == pool_id and source in agents:
                owners.add(source)
        return [(index, node) for index, node in enumerate(document["nodes"])
                if node["id"] in owners]

    def _legacy_child_kernel(self, document: dict[str, Any], pool_id: str,
                             legacy_kernel: dict[str, Any] | None, *,
                             path: tuple[str | int, ...],
                             document_path: tuple[str | int, ...]):
        owners = self._pool_owner_nodes(document, pool_id)
        pool_index = next(index for index, node in enumerate(document["nodes"])
                          if node["id"] == pool_id)
        pool_path = document_path + ("nodes", pool_index, "config")
        if not owners:
            _fail("legacy_owner_required", pool_path,
                  "legacy Subagent Pool must attach to an Agent")
        chosen = None
        for node_index, owner in owners:
            config = owner["config"]
            if "kernel" in config:
                raw = config["kernel"]
                kernel_path = document_path + ("nodes", node_index, "config", "kernel")
            else:
                if legacy_kernel is None:
                    _fail("legacy_profile_required", path,
                          "legacy subagent requires its owner's Kernel or an explicit fallback")
                raw, kernel_path = legacy_kernel, ("legacy_kernel",)
            try:
                selected = validate_kernel_config(raw, kernel_path)
            except SkeletonValidationError as exc:
                error_path = (kernel_path + ("json_schema",) + exc.path[1:]
                              if exc.path and exc.path[0] == "schema" else exc.path)
                raise SkeletonResourceError(exc.code, error_path, str(exc)) from exc
            # The parent's response contract and prompt do not describe a new
            # child. Validate first so this projection cannot hide bad config.
            selected.update(prompt="", json_schema=None)
            if chosen is None:
                chosen = selected
            elif chosen != selected:
                _fail("legacy_kernel_ambiguous", pool_path,
                      "shared legacy Subagent Pool owners require different child Kernels")
        return chosen

    def _prepare_legacy_child(self, connection, document: dict[str, Any], *,
                              owner_document: dict[str, Any], pool_id: str,
                              legacy_kernel: dict[str, Any] | None,
                              path: tuple[str | int, ...],
                              owner_document_path: tuple[str | int, ...]):
        metadata = self._legacy_agent_metadata(document)
        fallback = None
        if metadata is not None and any(
            node["type"] == "agent" and "kernel" not in node.get("config", {})
            for node in document["nodes"]
        ):
            fallback = self._legacy_child_kernel(
                owner_document, pool_id, legacy_kernel,
                path=path, document_path=owner_document_path,
            )
        # Resolve against stored owner configuration, before materialization
        # can add a fallback Kernel or replace legacy prompt/iteration fields.
        child_context = fallback if fallback is not None else legacy_kernel
        prepared = self._expand_legacy_subagent_pools(
            connection, document, child_context, path_prefix=path + ("document",),
        )
        if metadata is not None:
            try:
                prepared = materialize_legacy_agent(prepared, fallback)
            except SkeletonValidationError as exc:
                raise SkeletonResourceError(
                    exc.code, path + ("document",) + exc.path[1:], str(exc),
                ) from exc
        return prepared, child_context

    def _expand_legacy_subagent_pools(self, connection, document: dict[str, Any],
                                      legacy_kernel: dict[str, Any] | None, *,
                                      path_prefix: tuple[str | int, ...] = ("document",)) -> dict[str, Any]:
        expanded = deepcopy(document)
        for node_index, node in enumerate(expanded["nodes"]):
            if node["type"] != "subagent_pool" or "subagents" in node.get("config", {}):
                continue
            fields = node.get("config", {}).get("legacy_fields")
            entries = fields.get("subagents") if type(fields) is dict else None
            path = path_prefix + ("nodes", node_index, "config")
            if type(entries) is not list or not entries:
                _fail("missing_value", path + ("subagents",),
                      "legacy Subagent Pool has no entries")
            converted = []
            for entry_index, raw in enumerate(entries):
                entry_path = path + ("legacy_fields", "subagents", entry_index)
                if type(raw) is not dict or type(raw.get("kind")) is not str:
                    _fail("invalid_shape", entry_path, "legacy subagent entry is invalid")
                disabled = raw.get("disabled_tools", [])
                if type(disabled) is not list or any(type(item) is not str for item in disabled):
                    _fail("invalid_type", entry_path + ("disabled_tools",),
                          "disabled_tools must be an array of strings")
                kind = raw["kind"]
                if kind in {"recipe_ref", "ref"}:
                    key = "recipe_name" if kind == "recipe_ref" else "template_name"
                    name = _text(raw.get(key), entry_path + (key,), "legacy subagent name")
                    agent_id, target_document = self._legacy_alias_agent(
                        connection, name, entry_path + (key,),
                    )
                    metadata = self._legacy_agent_metadata(target_document)
                    source = {"kind": "agent_ref", "agent_id": agent_id}
                elif kind == "inline":
                    name = _text(raw.get("name"), entry_path + ("name",),
                                 "inline subagent name")
                    prompt_format = raw.get("prompt_format")
                    template = raw.get("template")
                    # The runtime answers with a code and the exact field —
                    # `missing_field` at `legacy_kernel.profile.endpoint`, and
                    # so on. Its error type is not this store's, so without
                    # this every one of them left as a 500 with no path: a
                    # model configuration refused for a reason nobody could
                    # read. A fault in the Kernel the caller supplied keeps the
                    # runtime's own path, because that is what the author has
                    # to go and fix; anything else is about this entry and is
                    # reported there.
                    try:
                        if prompt_format == "skeleton" and type(template) is dict:
                            legacy_source = deepcopy(template)
                            legacy_source.setdefault("name", name)
                            legacy_source.setdefault("description", name)
                            if "instructions" not in legacy_source and type(legacy_source.get("prompt")) is str:
                                legacy_source["instructions"] = legacy_source["prompt"]
                            converted_document = convert_legacy_definition(
                                "skeleton_template", legacy_source,
                                resource_id=f"embedded-{node['id']}-{entry_index}",
                            )
                        elif prompt_format == "soul" and type(template) is dict and type(template.get("prompt")) is str:
                            # Inline entries already carry structured policy.
                            # Serializing it through Soul frontmatter loses
                            # declared policy and can interpret a literal name
                            # as more header fields. Use the existing template
                            # IR, keeping Soul's own prompt authoritative.
                            legacy_source = deepcopy(template)
                            legacy_source.setdefault("description", name)
                            legacy_source.update(
                                name=name,
                                instructions=template["prompt"],
                            )
                            converted_document = convert_legacy_definition(
                                "skeleton_template", legacy_source,
                                resource_id=f"embedded-{node['id']}-{entry_index}",
                            )
                        else:
                            _fail("invalid_shape", entry_path, "legacy inline subagent is invalid")
                        metadata = self._legacy_agent_metadata(converted_document)
                    except SkeletonValidationError as exc:
                        raise SkeletonResourceError(
                            exc.code,
                            tuple(exc.path) if exc.path and exc.path[0] == "legacy_kernel"
                            else entry_path + tuple(exc.path[1:]),
                            str(exc),
                        ) from exc
                    embedded, _ = self._prepare_legacy_child(
                        connection, converted_document, owner_document=document,
                        pool_id=node["id"], legacy_kernel=legacy_kernel,
                        path=entry_path, owner_document_path=path_prefix,
                    )
                    source = {"kind": "embedded", "document": embedded}
                else:
                    _fail("unknown_variant", entry_path + ("kind",),
                          "legacy subagent kind is unsupported")
                converted.append(self._subagent_entry(
                    entry_id=f"legacy-{node['id']}-{entry_index}", name=name,
                    source=source, metadata=metadata, disabled_tools=disabled,
                ))
            node["config"] = {"subagents": converted}
        return expanded

    def convert_legacy_pools(self, resource_id: str, *, expected_edit_token: str,
                             legacy_kernel: dict[str, Any] | None = None) -> dict[str, Any]:
        """Persist the Subagent Pool conversion that only ever existed at run time.

        `_expand_legacy_subagent_pools` has always produced the real entries —
        references resolved by declared kind, inline templates materialised into
        complete Agent graphs, and every carried setting read from the target's
        own legacy record. It did it for each run and threw it away, so the
        stored draft kept `legacy_fields` and nothing an author pressed made it
        permanent. This writes that same result once, under the ordinary
        compare-and-set, and changes nothing else about the document.

        A resource with no legacy pool is refused rather than rewritten: a
        conversion that quietly did nothing would be indistinguishable from one
        that worked, and converting twice has to be answerable.
        """
        resource_id = _resource_id(resource_id, ("resource_id",))
        if type(expected_edit_token) is not str or not expected_edit_token:
            _fail("invalid_type", ("expected_edit_token",),
                  "an edit token is required to convert a stored resource")
        # One read snapshot: the alias lookups inside the expansion resolve
        # against the same connection, and `save_draft` takes its own.
        with self._connect() as connection:
            connection.execute("BEGIN")
            resource = connection.execute(
                "SELECT * FROM resources WHERE resource_id=?", (resource_id,),
            ).fetchone()
            if resource is None:
                _fail("resource_missing", ("resource_id",),
                      "Skeleton resource was not found", status=404)
            if resource["archived"]:
                _fail("resource_archived", ("resource_id",),
                      "archived resource cannot be converted", status=409)
            document = self._document(resource)
            if not any(node["type"] == "subagent_pool"
                       and "subagents" not in node.get("config", {})
                       for node in document["nodes"]):
                _fail("legacy_pool_absent", ("document", "nodes"),
                      "no Subagent Pool in this resource carries legacy entries")
            expanded = self._expand_legacy_subagent_pools(
                connection, document, legacy_kernel,
            )
        return self.save_draft(expanded, expected_edit_token=expected_edit_token)

    def save_draft(self, document: Any, *, expected_edit_token: str | None = None,
                   source_identity: str | None = None) -> dict[str, Any]:
        checked = self._validate_draft(document)
        resource_id = _resource_id(checked["id"], ("document", "id"))
        content = _json_text(checked)
        digest = _digest(checked)
        now = int(time.time() * 1000)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            current = connection.execute(
                "SELECT * FROM resources WHERE resource_id=?", (resource_id,),
            ).fetchone()
            if current is None:
                if expected_edit_token is not None:
                    connection.rollback()
                    _fail("edit_conflict", ("expected_edit_token",),
                          "resource does not exist at the requested edit token", status=409)
                revision = 1
                token = self._token(revision, digest)
                connection.execute("""
                    INSERT INTO resources(resource_id,kind,name,description,archived,draft_json,
                        draft_digest,edit_revision,edit_token,source_identity,created_at_ms,updated_at_ms)
                    VALUES(?,?,?,?,0,?,?,?,?,?,?,?)
                """, (resource_id, checked["kind"], checked["name"], checked.get("description", ""),
                       content, digest, revision, token, source_identity, now, now))
            else:
                if expected_edit_token != current["edit_token"]:
                    connection.rollback()
                    _fail("edit_conflict", ("expected_edit_token",),
                          "resource changed in another editor", status=409)
                if current["kind"] != checked["kind"]:
                    connection.rollback()
                    _fail("kind_changed", ("document", "kind"), "resource kind cannot change", status=409)
                revision = current["edit_revision"] + 1
                token = self._token(revision, digest)
                connection.execute("""
                    UPDATE resources SET name=?,description=?,draft_json=?,draft_digest=?,
                        edit_revision=?,edit_token=?,updated_at_ms=? WHERE resource_id=?
                """, (checked["name"], checked.get("description", ""), content, digest,
                       revision, token, now, resource_id))
            connection.commit()
        return self.get_resource(resource_id)

    def import_resource(self, document: Any) -> dict[str, Any]:
        """Create one stable identity, or accept an exact idempotent re-import."""
        checked = self._validate_draft(document)
        resource_id = _resource_id(checked["id"], ("document", "id"))
        content = _json_text(checked)
        digest = _digest(checked)
        now = int(time.time() * 1000)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            current = connection.execute(
                "SELECT * FROM resources WHERE resource_id=?", (resource_id,),
            ).fetchone()
            if current is not None:
                if current["draft_digest"] != digest:
                    connection.rollback(); _fail(
                        "import_conflict", ("document", "id"),
                        "resource id already exists with different content", status=409,
                    )
                connection.commit()
                return self.get_resource(resource_id)
            token = self._token(1, digest)
            connection.execute("""
                INSERT INTO resources(resource_id,kind,name,description,archived,draft_json,
                    draft_digest,edit_revision,edit_token,source_identity,created_at_ms,updated_at_ms)
                VALUES(?,?,?,?,0,?,?,?,?,NULL,?,?)
            """, (resource_id, checked["kind"], checked["name"],
                  checked.get("description", ""), content, digest, 1, token, now, now))
            connection.commit()
        return self.get_resource(resource_id)

    def preflight(self, resource_id: str, *, legacy_kernel: dict[str, Any] | None = None) -> dict[str, Any]:
        resource_id = _resource_id(resource_id, ("resource_id",))
        # Keep all definition rows in one WAL read snapshot. A concurrent editor
        # may commit, but repeated child references in this admission stay fixed.
        with self._connect() as connection:
            connection.execute("BEGIN")
            resource = connection.execute(
                "SELECT * FROM resources WHERE resource_id=?", (resource_id,),
            ).fetchone()
            if resource is None:
                _fail("resource_missing", ("resource_id",),
                      "Skeleton resource was not found", status=404)
            if resource["archived"]:
                _fail("resource_archived", ("resource_id",),
                      "archived resource cannot start a new execution", status=409)
            source_document = self._document(resource)
            document = self._expand_legacy_subagent_pools(
                connection, source_document, legacy_kernel,
            )
            if document["kind"] == "agent" and any(
                node["type"] == "agent" and "legacy_recipe" in node.get("config", {})
                or node["type"] == "agent" and "legacy_template" in node.get("config", {})
                for node in document["nodes"]
            ):
                if legacy_kernel is None and any(
                    node["type"] == "agent" and "kernel" not in node.get("config", {})
                    for node in document["nodes"]
                ):
                    _fail("legacy_profile_required", ("legacy_kernel",),
                          "migrated Agent requires an explicit Kernel configuration")
                try:
                    document = materialize_legacy_agent(document, legacy_kernel)
                except SkeletonValidationError as exc:
                    raise SkeletonResourceError(exc.code, exc.path, str(exc)) from exc
            plan = self._validate_execution(document)
            self._validate_local_profiles(document)
            subagents = self._resolve_subagent_closure(
                connection, document, owner_id=resource_id, stack=(resource_id,), depth=0,
                legacy_kernel=legacy_kernel,
                source_document=source_document,
                prepared_identities={document["id"]: execution_definition_digest(plan)},
            )
            dependencies = self._resolve_closure(
                connection, document, resource_id, subagents=subagents,
            )
        return {"ok": True, "id": resource_id, "kind": resource["kind"],
                "definition_digest": execution_definition_digest(plan),
                "edit_token": resource["edit_token"],
                "document": document, "diagnostics": [],
                "dependencies": [
                    {"workflow_id": item[0], "revision_id": item[1],
                     "definition_digest": item[2]} for item in dependencies
                ], "subagents": subagents}

    def _resolve_subagent_closure(self, connection, document: dict[str, Any], *,
                                  owner_id: str, stack: tuple[str, ...],
                                  depth: int,
                                  legacy_kernel: dict[str, Any] | None,
                                  source_document: dict[str, Any] | None = None,
                                  prepared_identities: dict[str, str] | None = None,
                                  path_prefix: tuple[str | int, ...] = ("document",)) -> list[dict[str, Any]]:
        if depth > 6:
            _fail("limit_depth", path_prefix, "Subagent depth exceeds 6")
        resolved: list[dict[str, Any]] = []
        source_document = document if source_document is None else source_document
        prepared_identities = {} if prepared_identities is None else prepared_identities
        for node_index, node in enumerate(document["nodes"]):
            if node["type"] != "subagent_pool":
                continue
            entries = node.get("config", {}).get("subagents")
            if type(entries) is not list:
                _fail("invalid_shape", path_prefix + ("nodes", node_index, "config"),
                      "Subagent Pool config is invalid")
            owners = self._pool_owner_nodes(source_document, node["id"])
            if not owners:
                _fail("legacy_owner_required", path_prefix + ("nodes", node_index, "config"),
                      "Subagent Pool must attach to an Agent")
            for entry_index, entry in enumerate(entries):
                path = path_prefix + ("nodes", node_index, "config", "subagents", entry_index, "source")
                source = entry.get("source") if type(entry) is dict else None
                if type(source) is not dict:
                    _fail("invalid_shape", path, "Subagent source is invalid")
                source_kind = source.get("kind")
                agent_id = None
                edit_token = None
                if source_kind == "agent_ref":
                    agent_id = _resource_id(source.get("agent_id"), path + ("agent_id",))
                    if agent_id in stack:
                        _fail("recursive_reference", path, "Agent subagent cycle is forbidden")
                    row = connection.execute(
                        "SELECT * FROM resources WHERE resource_id=?", (agent_id,),
                    ).fetchone()
                    if row is None:
                        _fail("resource_missing", path, "referenced Agent was not found", status=404)
                    if row["kind"] != "agent":
                        _fail("wrong_kind", path, "Subagent Pool target is not an Agent")
                    if row["archived"]:
                        _fail("resource_archived", path,
                              "archived Agent cannot start a new subagent run", status=409)
                    child_document = self._document(row)
                    edit_token = row["edit_token"]
                    child_stack = stack + (agent_id,)
                elif source_kind == "embedded":
                    child_document = deepcopy(source.get("document"))
                    child_stack = stack
                else:
                    _fail("unknown_variant", path + ("kind",),
                          "Subagent source must be agent_ref or embedded")
                child_source_document = child_document
                child_document, child_context = self._prepare_legacy_child(
                    connection, child_source_document, owner_document=source_document,
                    pool_id=node["id"], legacy_kernel=legacy_kernel,
                    path=path, owner_document_path=path_prefix,
                )
                try:
                    child_plan = self._validate_execution(child_document)
                except SkeletonResourceError as exc:
                    # Execution IO is validated after Agent preparation. Its
                    # document-rooted paths belong to this child occurrence,
                    # while compatibility failures still describe the runtime.
                    if exc.path[:1] != ("document",):
                        raise
                    raise SkeletonResourceError(
                        exc.code, path + ("document",) + exc.path[1:],
                        str(exc), status=exc.status,
                    ) from exc
                if child_document["kind"] != "agent":
                    _fail("wrong_kind", path, "Subagent Pool target is not an Agent")
                self._validate_local_profiles(child_document, path_prefix=path + ("document",))
                child_digest = execution_definition_digest(child_plan)
                prior_digest = prepared_identities.get(child_document["id"])
                if prior_digest is not None and prior_digest != child_digest:
                    _fail("dependency_conflict", path,
                          "one Agent identity cannot resolve to different prepared definitions")
                prepared_identities[child_document["id"]] = child_digest
                children = self._resolve_subagent_closure(
                    connection, child_document,
                    owner_id=agent_id or owner_id,
                    stack=child_stack,
                    depth=depth + 1,
                    legacy_kernel=child_context,
                    source_document=child_source_document,
                    prepared_identities=prepared_identities,
                    path_prefix=path + ("document",),
                )
                for _, owner in owners:
                    resolved.append({
                        "pool_node_id": node["id"],
                        "kernel_node_id": owner["id"],
                        "entry_id": entry["id"],
                        "name": entry["name"],
                        "description": entry["description"],
                        "allowed_modes": deepcopy(entry["allowed_modes"]),
                        "output_mode": entry["output_mode"],
                        "memory_policy": entry["memory_policy"],
                        "parallel_safe": entry["parallel_safe"],
                        "allowed_tools": deepcopy(entry["allowed_tools"]),
                        "disabled_tools": deepcopy(entry["disabled_tools"]),
                        "source_kind": source_kind,
                        "agent_id": agent_id,
                        "edit_token": edit_token,
                        "definition_digest": child_digest,
                        "document": child_document,
                        "subagents": children,
                    })
        return resolved

    def _published_row(self, connection, workflow_id: str, revision_id: str):
        return connection.execute("""
            SELECT v.*,r.archived,r.kind FROM workflow_versions v
            JOIN resources r ON r.resource_id=v.workflow_id
            WHERE v.workflow_id=? AND v.revision_id=?
        """, (workflow_id, revision_id)).fetchone()

    def _resolve_closure(self, connection, document: dict[str, Any], root_id: str, *,
                         subagents=()):
        closure: dict[tuple[str, str], str] = {}
        heights: dict[tuple[str, str], int] = {}
        descendants: dict[tuple[str, str], set[str]] = {}

        def references(body, prefix):
            for index, node in enumerate(body["nodes"]):
                config_path = prefix + ("nodes", index, "config")
                if node["type"] == "workflow_call":
                    yield node["config"]["workflow"], config_path + ("workflow",)
                elif node["type"] == "hooks_pool":
                    for hook_index, hook in enumerate(node["config"]["hooks"]):
                        yield hook["workflow"], config_path + ("hooks", hook_index, "workflow")

        def visit(target_id: str, revision_id: str, *, depth: int,
                  stack: tuple[str, ...], owner_id: str,
                  path: tuple[str | int, ...]) -> None:
            if depth > 32:
                _fail("limit_depth", path, "Workflow dependency depth exceeds 32")
            if target_id == owner_id or target_id in stack:
                _fail("recursive_reference", path, "Workflow dependency cycle is forbidden")
            key = (target_id, revision_id)
            if key in heights:
                # Cached subtrees still count at their deepest placement and
                # cannot hide an id cycle through a different revision.
                if descendants[key].intersection(stack + (owner_id,)):
                    _fail("recursive_reference", path, "Workflow dependency cycle is forbidden")
                if depth + heights[key] - 1 > 32:
                    _fail("limit_depth", path, "Workflow dependency depth exceeds 32")
                return
            row = self._published_row(connection, target_id, revision_id)
            if row is None:
                _fail("resource_missing", path,
                      "published Workflow revision was not found", status=404)
            if row["kind"] != "workflow":
                _fail("wrong_kind", path, "Workflow reference target is not a Workflow")
            if row["archived"]:
                _fail("resource_archived", path,
                      "archived Workflow cannot receive a new reference", status=409)
            body_path = path + ("resolved_document",)
            try:
                nested_document = _strict_json(row["definition_json"])
                nested_plan = self._validate_execution(nested_document)
            except SkeletonResourceError as exc:
                raise SkeletonResourceError(
                    exc.code, body_path + exc.path[1:], str(exc), status=exc.status,
                ) from exc
            if nested_document["kind"] != "workflow":
                _fail("wrong_kind", body_path + ("kind",),
                      "published definition is not a Workflow")
            if nested_plan.document_id != target_id:
                _fail("dependency_conflict", body_path + ("id",),
                      "published Workflow definition changed identity", status=409)
            if execution_definition_digest(nested_plan) != row["definition_digest"]:
                _fail("dependency_conflict", body_path,
                      "published Workflow definition differs from its digest", status=409)
            self._validate_local_profiles(nested_document, path_prefix=body_path)
            closure[key] = row["definition_digest"]
            if len(closure) > 256:
                _fail("limit_dependencies", path,
                      "Workflow dependency closure is too large")
            ids = set()
            height = 1
            for nested, nested_path in references(nested_document, body_path):
                nested_key = (nested["workflow_id"], nested["revision_id"])
                visit(*nested_key, depth=depth + 1, stack=stack + (target_id,),
                      owner_id=owner_id, path=nested_path)
                ids.add(nested_key[0])
                ids.update(descendants[nested_key])
                height = max(height, heights[nested_key] + 1)
            descendants[key] = ids
            heights[key] = height

        def collect(body, children, prefix, owner_id, *, execution_frames=1,
                    ancestors=()):
            for workflow, path in references(body, prefix):
                target_path = path + ("workflow_id",)
                revision_path = path + ("revision_id",)
                target_value = workflow["workflow_id"]
                revision_value = workflow["revision_id"]
                target_id = _text(target_value, target_path, "workflow id")
                revision_id = _text(revision_value, revision_path, "revision id")
                if target_value != target_id:
                    _fail("invalid_value", target_path,
                          "workflow id must not contain surrounding whitespace")
                if revision_value != revision_id:
                    _fail("invalid_value", revision_path,
                          "revision id must not contain surrounding whitespace")
                visit(target_id, revision_id, depth=execution_frames + 1,
                      stack=ancestors, owner_id=owner_id, path=path)
            pools = {node["id"]: (index, node) for index, node in enumerate(body["nodes"])
                     if node["type"] == "subagent_pool"}
            for child in children:
                pool_index, pool = pools[child["pool_node_id"]]
                entry_index = next(index for index, entry in enumerate(pool["config"]["subagents"])
                                   if entry["id"] == child["entry_id"])
                child_path = prefix + ("nodes", pool_index, "config", "subagents",
                                       entry_index, "source", "document")
                collect(child["document"], child["subagents"], child_path,
                        child["document"]["id"],
                        execution_frames=execution_frames + 1,
                        ancestors=ancestors + (owner_id,))

        collect(document, subagents, ("document",), root_id)
        return [(key[0], key[1], closure[key]) for key in sorted(closure)]

    def publish_workflow(self, workflow_id: str, *, expected_edit_token: str) -> dict[str, Any]:
        workflow_id = _resource_id(workflow_id, ("workflow_id",))
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            resource = connection.execute(
                "SELECT * FROM resources WHERE resource_id=?", (workflow_id,),
            ).fetchone()
            if resource is None:
                connection.rollback()
                _fail("resource_missing", ("workflow_id",), "Workflow was not found", status=404)
            if resource["kind"] != "workflow":
                connection.rollback(); _fail("wrong_kind", ("workflow_id",), "only Workflow can publish")
            if resource["archived"]:
                connection.rollback(); _fail("resource_archived", ("workflow_id",), "archived Workflow cannot publish", status=409)
            if resource["edit_token"] != expected_edit_token:
                connection.rollback(); _fail("edit_conflict", ("expected_edit_token",),
                                             "Workflow changed before publish", status=409)
            document = self._document(resource)
            plan = self._validate_execution(document)
            self._validate_local_profiles(document)
            digest = execution_definition_digest(plan)
            existing = connection.execute(
                "SELECT * FROM workflow_versions WHERE workflow_id=? AND definition_digest=?",
                (workflow_id, digest),
            ).fetchone()
            if existing is not None:
                dependencies = connection.execute("""
                    SELECT target_workflow_id,target_revision_id,target_digest
                    FROM workflow_dependencies WHERE workflow_id=? AND revision_id=? ORDER BY position
                """, (workflow_id, existing["revision_id"])).fetchall()
                connection.commit()
                return self._version_payload(existing, dependencies)
            dependencies = self._resolve_closure(connection, document, workflow_id)
            ordinal = connection.execute(
                "SELECT coalesce(max(ordinal),0)+1 AS ordinal FROM workflow_versions WHERE workflow_id=?",
                (workflow_id,),
            ).fetchone()["ordinal"]
            revision_id = f"rev-{ordinal}-{digest[:16]}"
            now = int(time.time() * 1000)
            connection.execute("""
                INSERT INTO workflow_versions(workflow_id,revision_id,ordinal,definition_json,
                    definition_digest,created_at_ms) VALUES(?,?,?,?,?,?)
            """, (workflow_id, revision_id, ordinal, _json_text(document), digest, now))
            for position, (target_id, target_revision, target_digest) in enumerate(dependencies):
                connection.execute("""
                    INSERT INTO workflow_dependencies(workflow_id,revision_id,position,
                        target_workflow_id,target_revision_id,target_digest) VALUES(?,?,?,?,?,?)
                """, (workflow_id, revision_id, position, target_id, target_revision, target_digest))
            row = connection.execute(
                "SELECT * FROM workflow_versions WHERE workflow_id=? AND revision_id=?",
                (workflow_id, revision_id),
            ).fetchone()
            connection.commit()
        return self._version_payload(row, dependencies)

    @staticmethod
    def _profile_error(exc: SkeletonValidationError) -> SkeletonResourceError:
        return SkeletonResourceError(exc.code, exc.path, str(exc), status=409)

    @staticmethod
    def _runtime_profile(profile_id: str, executable: str, *, bundled: bool = False):
        from unchain.skeleton.code_runtime import PythonEnvironmentProfile
        try:
            profile = (
                PythonEnvironmentProfile.bundled(profile_id, (executable,))
                if bundled else PythonEnvironmentProfile.venv(profile_id, executable)
            )
            return profile.admitted()
        except SkeletonValidationError as exc:
            raise SkeletonResourceStore._profile_error(exc) from exc

    def _builtin_python_profile(self):
        candidates: list[Path] = []
        runtime_root = os.environ.get("PUPU_MCP_RUNTIME_DIR", "").strip()
        if runtime_root and Path(runtime_root).is_absolute():
            root = Path(runtime_root)
            candidates.extend([
                root / "python" / "bin" / "python3.12",
                root / "python" / "bin" / "python3",
                root / "python" / "python.exe",
            ])
        if not getattr(sys, "frozen", False):
            candidates.append(Path(sys.executable))
        for candidate in candidates:
            try:
                return self._runtime_profile("builtin", str(candidate), bundled=True)
            except SkeletonResourceError:
                continue
        return None

    @staticmethod
    def _probe_runtime_profile(profile) -> dict[str, Any]:
        script = (
            "import json,sys;"
            "print(json.dumps({'version':list(sys.version_info[:3]),"
            "'implementation':sys.implementation.name},separators=(',',':')))"
        )
        try:
            result = subprocess.run(
                [profile.command[0], "-I", "-c", script],
                stdin=subprocess.DEVNULL, capture_output=True, check=False,
                timeout=5,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise SkeletonResourceError(
                "profile_probe_failed", ("executable",),
                "Python environment probe failed", status=409,
            ) from exc
        if result.returncode != 0 or len(result.stdout) > 4096 or len(result.stderr) > 4096:
            _fail("profile_probe_failed", ("executable",),
                  "Python environment probe failed", status=409)
        try:
            payload = json.loads(result.stdout)
        except (UnicodeError, ValueError) as exc:
            raise SkeletonResourceError(
                "profile_probe_failed", ("executable",),
                "Python environment probe returned an invalid result", status=409,
            ) from exc
        if (type(payload) is not dict or set(payload) != {"version", "implementation"}
                or type(payload["version"]) is not list or len(payload["version"]) != 3
                or any(type(item) is not int for item in payload["version"])
                or payload["implementation"] != "cpython"
                or tuple(payload["version"][:2]) < (3, 10)):
            _fail("profile_incompatible", ("executable",),
                  "Python environment must use CPython 3.10 or newer", status=409)
        return {"ok": True, "version": ".".join(str(item) for item in payload["version"]),
                "implementation": payload["implementation"]}

    @staticmethod
    def _profile_payload(row: sqlite3.Row, *, available: bool,
                         current_fingerprint: str | None = None) -> dict[str, Any]:
        return {
            "id": row["profile_id"], "kind": "venv", "executable": row["executable"],
            "fingerprint": row["executable_fingerprint"],
            "available": available,
            "changed": bool(current_fingerprint is not None
                            and current_fingerprint != row["executable_fingerprint"]),
            "edit_token": row["edit_token"],
        }

    def list_python_profiles(self) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        builtin = self._builtin_python_profile()
        if builtin is not None:
            try:
                builtin_fingerprint = builtin.fingerprint()
            except OSError:
                builtin = None
        if builtin is not None:
            result.append({
                "id": "builtin", "kind": "bundled", "executable": builtin.command[0],
                "fingerprint": builtin_fingerprint, "available": True,
                "changed": False, "edit_token": None,
            })
        else:
            result.append({
                "id": "builtin", "kind": "bundled", "executable": None,
                "fingerprint": None, "available": False,
                "changed": False, "edit_token": None,
            })
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM python_profiles ORDER BY lower(profile_id),profile_id"
            ).fetchall()
        for row in rows:
            try:
                profile = self._runtime_profile(row["profile_id"], row["executable"])
                current = profile.fingerprint()
                available = current == row["executable_fingerprint"]
            except (SkeletonResourceError, OSError):
                current = None
                available = False
            result.append(self._profile_payload(
                row, available=available, current_fingerprint=current,
            ))
        return result

    def save_python_profile(self, profile_id: str, executable: str, *,
                            expected_edit_token: str | None = None) -> dict[str, Any]:
        profile_id = _resource_id(profile_id, ("profile_id",))
        if profile_id == "builtin":
            _fail("profile_immutable", ("profile_id",),
                  "built-in Python profile is read-only", status=409)
        executable = _text(executable, ("executable",), "Python executable")
        executable_path = Path(executable)
        if not executable_path.is_absolute():
            _fail("invalid_path", ("executable",),
                  "Python executable must be an absolute path")
        invocation_path = os.path.normpath(str(executable_path))
        profile = self._runtime_profile(profile_id, invocation_path)
        probe = self._probe_runtime_profile(profile)
        try:
            fingerprint = profile.fingerprint()
        except OSError as exc:
            raise SkeletonResourceError(
                "profile_probe_failed", ("executable",),
                "Python environment changed during validation", status=409,
            ) from exc
        now = int(time.time() * 1000)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            current = connection.execute(
                "SELECT * FROM python_profiles WHERE profile_id=?", (profile_id,),
            ).fetchone()
            if current is None:
                if expected_edit_token is not None:
                    connection.rollback(); _fail(
                        "edit_conflict", ("expected_edit_token",),
                        "Python profile does not exist at the requested edit token", status=409,
                    )
                revision = 1
                token = self._token(revision, sha256(
                    (profile_id + "\0" + fingerprint).encode("utf-8", "surrogatepass")
                ).hexdigest())
                connection.execute("""
                    INSERT INTO python_profiles(profile_id,executable,executable_fingerprint,
                        edit_revision,edit_token,created_at_ms,updated_at_ms)
                    VALUES(?,?,?,?,?,?,?)
                """, (profile_id, invocation_path, fingerprint, revision, token, now, now))
            else:
                if current["edit_token"] != expected_edit_token:
                    connection.rollback(); _fail(
                        "edit_conflict", ("expected_edit_token",),
                        "Python profile changed in another editor", status=409,
                    )
                revision = current["edit_revision"] + 1
                token = self._token(revision, sha256(
                    (profile_id + "\0" + fingerprint).encode("utf-8", "surrogatepass")
                ).hexdigest())
                connection.execute("""
                    UPDATE python_profiles SET executable=?,executable_fingerprint=?,
                        edit_revision=?,edit_token=?,updated_at_ms=? WHERE profile_id=?
                """, (invocation_path, fingerprint, revision, token, now, profile_id))
            row = connection.execute(
                "SELECT * FROM python_profiles WHERE profile_id=?", (profile_id,),
            ).fetchone()
            connection.commit()
        return self._profile_payload(row, available=True, current_fingerprint=fingerprint) | {
            "probe": probe,
        }

    @staticmethod
    def _document_uses_profile(document: dict[str, Any], profile_id: str) -> bool:
        return any(
            node.get("type") == "code"
            and type(node.get("config")) is dict
            and type(node["config"].get("code")) is dict
            and node["config"]["code"].get("environment_profile_id") == profile_id
            for node in document.get("nodes", [])
        )

    def delete_python_profile(self, profile_id: str, *, expected_edit_token: str) -> None:
        profile_id = _resource_id(profile_id, ("profile_id",))
        if profile_id == "builtin":
            _fail("profile_immutable", ("profile_id",),
                  "built-in Python profile is read-only", status=409)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM python_profiles WHERE profile_id=?", (profile_id,),
            ).fetchone()
            if row is None:
                connection.rollback(); _fail(
                    "profile_missing", ("profile_id",), "Python profile was not found", status=404,
                )
            if row["edit_token"] != expected_edit_token:
                connection.rollback(); _fail(
                    "edit_conflict", ("expected_edit_token",),
                    "Python profile changed in another editor", status=409,
                )
            documents = [json.loads(item["draft_json"]) for item in connection.execute(
                "SELECT draft_json FROM resources"
            ).fetchall()]
            documents.extend(json.loads(item["definition_json"]) for item in connection.execute(
                "SELECT definition_json FROM workflow_versions"
            ).fetchall())
            if any(self._document_uses_profile(document, profile_id) for document in documents):
                connection.rollback(); _fail(
                    "profile_referenced", ("profile_id",),
                    "Python profile is referenced by a Skeleton resource", status=409,
                )
            connection.execute("DELETE FROM python_profiles WHERE profile_id=?", (profile_id,))
            connection.commit()

    def resolve_python_profile(self, profile_id: str):
        profile_id = _resource_id(profile_id, ("profile_id",))
        if profile_id == "builtin":
            profile = self._builtin_python_profile()
            if profile is None:
                _fail("profile_unavailable", ("profile_id",),
                      "built-in Python profile is unavailable", status=409)
            return profile
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM python_profiles WHERE profile_id=?", (profile_id,),
            ).fetchone()
        if row is None:
            _fail("profile_missing", ("profile_id",),
                  "Python profile was not found", status=404)
        profile = self._runtime_profile(profile_id, row["executable"])
        try:
            fingerprint = profile.fingerprint()
        except OSError as exc:
            raise SkeletonResourceError(
                "profile_unavailable", ("profile_id",),
                "Python profile is unavailable", status=409,
            ) from exc
        if fingerprint != row["executable_fingerprint"]:
            _fail("environment_changed", ("profile_id",),
                  "Python profile changed after it was saved", status=409)
        return profile

    def probe_python_profile(self, profile_id: str) -> dict[str, Any]:
        profile = self.resolve_python_profile(profile_id)
        try:
            fingerprint = profile.fingerprint()
        except OSError as exc:
            raise SkeletonResourceError(
                "profile_unavailable", ("profile_id",),
                "Python profile is unavailable", status=409,
            ) from exc
        return self._probe_runtime_profile(profile) | {
            "id": profile_id, "kind": profile.kind,
            "fingerprint": fingerprint,
        }

    def _validate_local_profiles(self, document: dict[str, Any], *,
                                 path_prefix: tuple[str | int, ...] = ("document",)) -> None:
        for index, node in enumerate(document["nodes"]):
            if node["type"] != "code" or "code" not in node["config"]:
                continue
            profile_id = node["config"]["code"]["environment_profile_id"]
            try:
                self.resolve_python_profile(profile_id)
            except SkeletonResourceError as exc:
                raise SkeletonResourceError(
                    exc.code,
                    path_prefix + ("nodes", index, "config", "code",
                     "environment_profile_id"),
                    str(exc), status=exc.status,
                ) from exc

    @staticmethod
    def _version_payload(row, dependencies) -> dict[str, Any]:
        normalized = [
            {"workflow_id": item[0], "revision_id": item[1], "definition_digest": item[2]}
            if not isinstance(item, sqlite3.Row) else
            {"workflow_id": item["target_workflow_id"], "revision_id": item["target_revision_id"],
             "definition_digest": item["target_digest"]}
            for item in dependencies
        ]
        return {"workflow_id": row["workflow_id"], "revision_id": row["revision_id"],
                "ordinal": row["ordinal"], "definition_digest": row["definition_digest"],
                "document": _strict_json(row["definition_json"]), "dependencies": normalized}

    def get_workflow_version(self, workflow_id: str, revision_id: str) -> dict[str, Any]:
        workflow_id = _resource_id(workflow_id, ("workflow_id",))
        revision_id = _text(revision_id, ("revision_id",), "revision id")
        with self._connect() as connection:
            row = self._published_row(connection, workflow_id, revision_id)
            if row is None:
                _fail("resource_missing", ("revision_id",), "Workflow revision was not found", status=404)
            dependencies = connection.execute("""
                SELECT target_workflow_id,target_revision_id,target_digest
                FROM workflow_dependencies WHERE workflow_id=? AND revision_id=? ORDER BY position
            """, (workflow_id, revision_id)).fetchall()
        return self._version_payload(row, dependencies)

    def resolve_published_workflow(self, workflow_id: str, revision_id: str):
        """Return the exact Unchain value consumed by Workflow Call runtime."""
        from unchain.skeleton.workflow_runtime import PublishedWorkflow
        version = self.get_workflow_version(workflow_id, revision_id)
        return PublishedWorkflow(workflow_id, revision_id, version["document"])

    def rename(self, resource_id: str, name: str, *, expected_edit_token: str):
        current = self.get_resource(resource_id)
        document = deepcopy(current["document"]); document["name"] = _text(name, ("name",), "name")
        return self.save_draft(document, expected_edit_token=expected_edit_token)

    def duplicate(self, resource_id: str, *, new_id: str, name: str):
        current = self.get_resource(resource_id)
        document = deepcopy(current["document"])
        document["id"] = _text(new_id, ("new_id",), "new id")
        document["name"] = _text(name, ("name",), "name")
        return self.save_draft(document)

    def _set_archived(self, resource_id: str, archived: bool, *, expected_edit_token: str):
        resource_id = _resource_id(resource_id, ("resource_id",))
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute("SELECT * FROM resources WHERE resource_id=?", (resource_id,)).fetchone()
            if row is None:
                connection.rollback(); _fail("resource_missing", ("resource_id",), "resource was not found", status=404)
            if row["edit_token"] != expected_edit_token:
                connection.rollback(); _fail("edit_conflict", ("expected_edit_token",), "resource changed", status=409)
            revision = row["edit_revision"] + 1
            digest = row["draft_digest"]
            token = self._token(revision, digest)
            connection.execute("UPDATE resources SET archived=?,edit_revision=?,edit_token=?,updated_at_ms=? WHERE resource_id=?",
                (1 if archived else 0, revision, token, int(time.time() * 1000), resource_id))
            connection.commit()
        return self.get_resource(resource_id)

    def archive(self, resource_id: str, *, expected_edit_token: str):
        return self._set_archived(resource_id, True, expected_edit_token=expected_edit_token)

    def restore(self, resource_id: str, *, expected_edit_token: str):
        return self._set_archived(resource_id, False, expected_edit_token=expected_edit_token)

    def delete(self, resource_id: str, *, expected_edit_token: str) -> None:
        resource_id = _resource_id(resource_id, ("resource_id",))
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute("SELECT * FROM resources WHERE resource_id=?", (resource_id,)).fetchone()
            if row is None:
                connection.rollback(); _fail("resource_missing", ("resource_id",), "resource was not found", status=404)
            if row["edit_token"] != expected_edit_token:
                connection.rollback(); _fail("edit_conflict", ("expected_edit_token",), "resource changed", status=409)
            version_count = connection.execute(
                "SELECT count(*) AS count FROM workflow_versions WHERE workflow_id=?", (resource_id,),
            ).fetchone()["count"]
            incoming = connection.execute(
                "SELECT count(*) AS count FROM workflow_dependencies WHERE target_workflow_id=?", (resource_id,),
            ).fetchone()["count"]
            aliases = connection.execute(
                "SELECT count(*) AS count FROM legacy_aliases WHERE target_id=?", (resource_id,),
            ).fetchone()["count"]
            if version_count or incoming or aliases:
                connection.rollback(); _fail("resource_referenced", ("resource_id",),
                    "resource has retained revisions or references and cannot be deleted", status=409)
            connection.execute("DELETE FROM resources WHERE resource_id=?", (resource_id,))
            connection.commit()

    def migrate_legacy(self, *, source_identity: str, source_scope: str,
                       source_kind: str, source: str,
                       stop_after_stage: str | None = None) -> dict[str, Any]:
        source_identity = _text(source_identity, ("source_identity",), "source identity")
        source_scope = _text(source_scope, ("source_scope",), "source scope")
        if type(source_kind) is not str:
            _fail("invalid_type", ("source_kind",), "legacy source kind must be a string")
        if source_kind not in {"recipe", "skeleton_template", "soul"}:
            _fail("unknown_variant", ("source_kind",), "unknown legacy source kind")
        if type(source) is not str:
            _fail("invalid_type", ("source",), "legacy source must be text")
        if stop_after_stage is not None and type(stop_after_stage) is not str:
            _fail("invalid_type", ("stop_after_stage",), "migration stage must be a string")
        if stop_after_stage is not None and stop_after_stage not in _MIGRATION_STAGES:
            _fail("unknown_variant", ("stop_after_stage",), "unknown migration stage")
        source_hash = sha256(source.encode("utf-8", "surrogatepass")).hexdigest()
        target_id = "legacy-" + sha256(source_identity.encode("utf-8", "surrogatepass")).hexdigest()[:24]
        now = int(time.time() * 1000)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM legacy_migrations WHERE source_identity=?", (source_identity,),
            ).fetchone()
            if row is not None and (row["source_kind"] != source_kind or row["source_sha256"] != source_hash):
                connection.rollback(); _fail("migration_source_changed", ("source_identity",),
                                             "legacy source changed during migration", status=409)
            if row is None:
                connection.execute("""
                    INSERT INTO legacy_migrations(source_identity,source_kind,source_sha256,target_id,
                        target_sha256,stage,updated_at_ms) VALUES(?,?,?,?,NULL,'discovered',?)
                """, (source_identity, source_kind, source_hash, target_id, now))
                stage = "discovered"
            else:
                target_id, stage = row["target_id"], row["stage"]
            connection.commit()
        if stage == "active":
            return self.migration_status(source_identity)
        if stop_after_stage == "discovered":
            return self.migration_status(source_identity)

        parsed = source if source_kind == "soul" else _strict_json(source)
        try:
            converted = convert_legacy_definition(source_kind, parsed, resource_id=target_id)
        except SkeletonValidationError as exc:
            raise SkeletonResourceError(exc.code, exc.path, str(exc)) from exc
        target_hash = _digest(converted)
        if stage == "discovered":
            try:
                saved = self.save_draft(converted, source_identity=source_identity)
            except SkeletonResourceError as exc:
                if exc.code != "edit_conflict":
                    raise
                existing = self.get_resource(target_id)
                if existing["draft_digest"] != target_hash or existing["source_identity"] != source_identity:
                    raise
                saved = existing
            with self._connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                connection.execute("UPDATE legacy_migrations SET target_sha256=?,stage='written',updated_at_ms=? WHERE source_identity=? AND stage='discovered'",
                    (target_hash, int(time.time() * 1000), source_identity))
                connection.commit()
            stage = "written"
        else:
            saved = self.get_resource(target_id)
            if saved["draft_digest"] != target_hash:
                _fail("migration_target_changed", ("target_id",), "migration target changed", status=409)
        if stop_after_stage == "written":
            return self.migration_status(source_identity)

        if stage == "written":
            self._validate_draft(saved["document"])
            with self._connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                connection.execute("UPDATE legacy_migrations SET stage='validated',updated_at_ms=? WHERE source_identity=? AND stage='written'",
                    (int(time.time() * 1000), source_identity))
                connection.commit()
            stage = "validated"
        if stop_after_stage == "validated":
            return self.migration_status(source_identity)

        if stage == "validated":
            legacy_name = saved["name"]
            with self._connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                connection.execute("""
                    INSERT OR IGNORE INTO legacy_aliases(source_scope,legacy_name,target_id,source_identity)
                    VALUES(?,?,?,?)
                """, (source_scope, legacy_name, target_id, source_identity))
                aliases = connection.execute("""
                    SELECT DISTINCT target_id FROM legacy_aliases
                    WHERE source_scope=? AND legacy_name=?
                """, (source_scope, legacy_name)).fetchall()
                if len(aliases) != 1:
                    # Retain every exact source mapping so future legacy-name
                    # resolution also fails closed instead of silently choosing
                    # whichever colliding source became active first.
                    connection.commit()
                    _fail("legacy_name_ambiguous", ("legacy_name",),
                          "legacy name resolves to multiple resources", status=409)
                connection.execute("UPDATE legacy_migrations SET stage='active',updated_at_ms=? WHERE source_identity=? AND stage='validated'",
                    (int(time.time() * 1000), source_identity))
                connection.commit()
        return self.migration_status(source_identity)

    def link_equivalent_legacy_source(self, *, source_identity: str,
                                      source_scope: str, source_kind: str,
                                      source: str, legacy_name: str,
                                      target_id: str) -> dict[str, Any]:
        """Point a byte-exact equivalent legacy source at an existing resource."""
        source_identity = _text(source_identity, ("source_identity",), "source identity")
        source_scope = _text(source_scope, ("source_scope",), "source scope")
        legacy_name = _text(legacy_name, ("legacy_name",), "legacy name")
        target_id = _resource_id(target_id, ("target_id",))
        if type(source_kind) is not str:
            _fail("invalid_type", ("source_kind",), "legacy source kind must be a string")
        if source_kind not in {"recipe", "skeleton_template", "soul"}:
            _fail("unknown_variant", ("source_kind",), "unknown legacy source kind")
        if type(source) is not str:
            _fail("invalid_type", ("source",), "legacy source must be text")
        source_hash = sha256(source.encode("utf-8", "surrogatepass")).hexdigest()
        now = int(time.time() * 1000)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            target = connection.execute(
                "SELECT * FROM resources WHERE resource_id=?", (target_id,),
            ).fetchone()
            if target is None:
                connection.rollback()
                _fail("resource_missing", ("target_id",), "equivalent target was not found", status=404)
            row = connection.execute(
                "SELECT * FROM legacy_migrations WHERE source_identity=?", (source_identity,),
            ).fetchone()
            if row is not None and (
                row["source_kind"] != source_kind or row["source_sha256"] != source_hash
            ):
                connection.rollback()
                _fail("migration_source_changed", ("source_identity",),
                      "legacy source changed during migration", status=409)
            if row is not None and row["target_id"] != target_id:
                connection.rollback()
                _fail("migration_target_changed", ("target_id",),
                      "legacy source was already mapped to a different resource", status=409)
            if row is not None and row["stage"] == "active":
                alias = connection.execute("""
                    SELECT target_id FROM legacy_aliases
                    WHERE source_scope=? AND legacy_name=? AND source_identity=?
                """, (source_scope, legacy_name, source_identity)).fetchone()
                if alias is None or alias["target_id"] != target_id:
                    connection.rollback()
                    _fail("migration_target_changed", ("target_id",),
                          "active legacy alias changed", status=409)
                connection.commit()
                return self.migration_status(source_identity)
            if target["kind"] != "agent" or target["name"] != legacy_name:
                connection.rollback()
                _fail("invalid_reference", ("target_id",),
                      "equivalent legacy source target does not match", status=409)
            if row is None:
                connection.execute("""
                    INSERT INTO legacy_migrations(source_identity,source_kind,source_sha256,target_id,
                        target_sha256,stage,updated_at_ms) VALUES(?,?,?,?,?,'active',?)
                """, (source_identity, source_kind, source_hash, target_id,
                      target["draft_digest"], now))
            else:
                connection.execute("""
                    UPDATE legacy_migrations SET target_sha256=?,stage='active',updated_at_ms=?
                    WHERE source_identity=?
                """, (target["draft_digest"], now, source_identity))
            connection.execute("""
                INSERT OR IGNORE INTO legacy_aliases(source_scope,legacy_name,target_id,source_identity)
                VALUES(?,?,?,?)
            """, (source_scope, legacy_name, target_id, source_identity))
            aliases = connection.execute("""
                SELECT DISTINCT target_id FROM legacy_aliases
                WHERE source_scope=? AND legacy_name=?
            """, (source_scope, legacy_name)).fetchall()
            if len(aliases) != 1:
                connection.commit()
                _fail("legacy_name_ambiguous", ("legacy_name",),
                      "legacy name resolves to multiple resources", status=409)
            connection.commit()
        return self.migration_status(source_identity)

    def migration_status(self, source_identity: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM legacy_migrations WHERE source_identity=?", (source_identity,),
            ).fetchone()
        if row is None:
            _fail("migration_missing", ("source_identity",), "migration was not found", status=404)
        return dict(row)

    def resolve(self, *, resource_id: str | None = None, revision_id: str | None = None,
                legacy_name: str | None = None, source_scope: str | None = None,
                default_if_unselected: bool = False) -> dict[str, Any]:
        selected = sum(value is not None for value in (resource_id, legacy_name))
        if selected > 1:
            _fail("invalid_shape", ("selection",), "select resource id or legacy name, not both")
        if revision_id is not None and resource_id is None:
            _fail("invalid_shape", ("revision_id",),
                  "revision id requires an exact Workflow resource id")
        if resource_id is not None:
            if revision_id is not None:
                return self.get_workflow_version(resource_id, revision_id)
            return self.get_resource(resource_id)
        if legacy_name is not None:
            scope = _text(source_scope, ("source_scope",), "source scope")
            with self._connect() as connection:
                rows = connection.execute("""
                    SELECT DISTINCT target_id FROM legacy_aliases
                    WHERE source_scope=? AND legacy_name=?
                """, (scope, legacy_name)).fetchall()
            if not rows:
                _fail("resource_missing", ("legacy_name",), "selected legacy resource was not found", status=404)
            if len(rows) != 1:
                _fail("legacy_name_ambiguous", ("legacy_name",), "selected legacy name is ambiguous", status=409)
            return self.get_resource(rows[0]["target_id"])
        if not default_if_unselected:
            _fail("selection_required", ("selection",), "resource selection is required")
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT resource_id FROM resources WHERE kind='agent' AND name='Default' AND archived=0"
            ).fetchall()
        if len(rows) != 1:
            _fail("default_unavailable", ("selection",), "Default Agent is unavailable or ambiguous", status=404)
        return self.get_resource(rows[0]["resource_id"])


def migrate_known_legacy_sources(store: SkeletonResourceStore | None = None) -> list[dict[str, Any]]:
    """Idempotently stage PuPu's user-owned legacy definitions without deleting them."""
    store = SkeletonResourceStore() if store is None else store
    home = Path.home()
    candidates: list[tuple[Path, str, str]] = []
    recipe_root = home / ".pupu" / "agent_recipes"
    if recipe_root.is_dir():
        candidates.extend((path, "recipe", "user:agent_recipes")
                          for path in sorted(recipe_root.glob("*.recipe")) if path.is_file())
    subagent_root = home / ".pupu" / "subagents"
    if subagent_root.is_dir():
        candidates.extend((path, "soul" if path.suffix == ".soul" else "skeleton_template",
                           "user:subagents")
                          for path in sorted(subagent_root.iterdir())
                          if path.is_file() and path.suffix in {".soul", ".skeleton"})
    results = []
    built_in_explore_target = None
    for path, source_kind, scope in candidates:
        source_identity = str(path.resolve())
        try:
            raw = path.read_text(encoding="utf-8")
            parsed = None
            if source_kind != "soul":
                parsed = _strict_json(raw)
            if source_kind == "skeleton_template":
                if type(parsed) is dict and "schema_version" in parsed:
                    continue
            if path.name == "Explore.skeleton":
                from subagent_seeds import EXPLORE_SKELETON
                if parsed == EXPLORE_SKELETON and built_in_explore_target is not None:
                    results.append(store.link_equivalent_legacy_source(
                        source_identity=source_identity, source_scope=scope,
                        source_kind=source_kind, source=raw, legacy_name="Explore",
                        target_id=built_in_explore_target,
                    ))
                    continue
            migrated = store.migrate_legacy(
                source_identity=source_identity, source_scope=scope,
                source_kind=source_kind, source=raw,
            )
            results.append(migrated)
            if path.name == "Explore.recipe" and source_kind == "recipe":
                from recipe_seeds import EXPLORE_RECIPE
                if parsed == EXPLORE_RECIPE:
                    built_in_explore_target = migrated["target_id"]
        except SkeletonResourceError as exc:
            results.append({
                "source_identity": source_identity,
                "stage": "failed",
                "error": {
                    "code": exc.code, "path": list(exc.path), "message": str(exc),
                },
            })
        except (OSError, UnicodeError):
            results.append({
                "source_identity": source_identity,
                "stage": "failed",
                "error": {
                    "code": "source_read_failed", "path": ["source_identity"],
                    "message": "legacy source could not be read",
                },
            })
    return results


__all__ = ["SkeletonResourceError", "SkeletonResourceStore", "migrate_known_legacy_sources"]
