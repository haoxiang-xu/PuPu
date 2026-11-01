"""Select and freeze admitted Agent resources before ordinary chat execution.

This is resource admission only. It creates no execution, model or credential;
the chat adapter rejects launch until the production Skeleton path is wired.
"""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import re
from typing import Any

from unchain.skeleton import prepare_agent_graph
from unchain.skeleton.agent_preparation import execution_definition_digest

from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore


_SELECTION_SCHEMA = "pupu.skeleton_chat_selection.v1"
_SELECTION_PATH = ("options", "skeleton_selection")
_SELECTION_FIELDS = {
    "resource": frozenset({"schema", "kind", "resource_id"}),
    "default": frozenset({"schema", "kind"}),
    "legacy": frozenset({"schema", "kind", "legacy_name", "source_scope"}),
}
_PREFLIGHT_FIELDS = frozenset({
    "ok", "id", "kind", "definition_digest", "edit_token", "document",
    "diagnostics", "dependencies", "subagents",
})
_DEPENDENCY_FIELDS = frozenset({"workflow_id", "revision_id", "definition_digest"})
_SUBAGENT_FIELDS = frozenset({
    "pool_node_id", "kernel_node_id", "entry_id", "name", "description",
    "allowed_modes", "output_mode", "memory_policy", "parallel_safe",
    "allowed_tools", "disabled_tools", "source_kind", "agent_id", "edit_token",
    "definition_digest", "document", "subagents",
})
_DIGEST = re.compile(r"^[0-9a-f]{64}$")


def _selection_error(code: str, path: tuple, message: str) -> None:
    raise SkeletonResourceError(code, path, message)


def _selection_text(value: Any, field: str) -> str:
    path = _SELECTION_PATH + (field,)
    if type(value) is not str:
        _selection_error("invalid_type", path, "selection identity must be a string")
    # Legacy names are exact existing aliases, including surrounding spaces.
    # Only newly canonical resource/scope identifiers require trimmed spelling.
    if not value or field != "legacy_name" and value != value.strip():
        _selection_error("invalid_value", path, "selection identity must be non-empty and canonical")
    try:
        value.encode("utf-8")
    except UnicodeError:
        _selection_error("invalid_value", path, "selection identity must be valid Unicode")
    return value


def _parse_selection(options: dict) -> dict:
    value = options["skeleton_selection"]
    if type(value) is not dict:
        _selection_error("invalid_type", _SELECTION_PATH, "Skeleton selection must be an object")
    if value.get("schema") != _SELECTION_SCHEMA:
        _selection_error("unsupported_version", _SELECTION_PATH + ("schema",),
                         "unsupported Skeleton chat selection schema")
    kind = value.get("kind")
    if type(kind) is not str or kind not in _SELECTION_FIELDS:
        _selection_error("invalid_value", _SELECTION_PATH + ("kind",),
                         "unsupported Skeleton chat selection kind")
    fields = _SELECTION_FIELDS[kind]
    if set(value) - fields:
        _selection_error("unknown_field", _SELECTION_PATH, "Skeleton selection contains an unknown field")
    if set(value) != fields:
        _selection_error("invalid_shape", _SELECTION_PATH, "Skeleton selection is missing required fields")
    legacy_name = options.get("recipe_name")
    if legacy_name is not None and legacy_name != "":
        _selection_error("invalid_shape", _SELECTION_PATH,
                         "select a Skeleton or a legacy Recipe, not both")
    selection = {"schema": _SELECTION_SCHEMA, "kind": kind}
    for field in fields - {"schema", "kind"}:
        selection[field] = _selection_text(value[field], field)
    if kind == "resource" and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,199}", selection["resource_id"]) is None:
        _selection_error("invalid_value", _SELECTION_PATH + ("resource_id",),
                         "resource id must use URL-safe identifier characters")
    return selection


def _admission_failed(path: tuple = ("preflight",)) -> None:
    raise SkeletonResourceError("skeleton_chat_admission_failed", path,
                                "Skeleton chat resource admission failed.", status=503)


def _check_document(document: Any, digest: Any, path: tuple) -> None:
    if type(digest) is not str or _DIGEST.fullmatch(digest) is None:
        _admission_failed(path + ("definition_digest",))
    if execution_definition_digest(prepare_agent_graph(document)) != digest:
        _admission_failed(path + ("definition_digest",))


def _check_subagents(value: Any, path: tuple, depth: int = 0) -> None:
    if type(value) is not list or depth > 6:
        _admission_failed(path)
    for index, child in enumerate(value):
        child_path = path + (index,)
        if type(child) is not dict or set(child) != _SUBAGENT_FIELDS:
            _admission_failed(child_path)
        _check_document(child["document"], child["definition_digest"], child_path)
        _check_subagents(child["subagents"], child_path + ("subagents",), depth + 1)


def _check_preflight(value: Any, resource_id: str) -> None:
    if type(value) is not dict or set(value) != _PREFLIGHT_FIELDS:
        _admission_failed()
    if value["ok"] is not True or value["id"] != resource_id or value["kind"] != "agent":
        _admission_failed()
    if type(value["edit_token"]) is not str or not value["edit_token"]:
        _admission_failed(("preflight", "edit_token"))
    if type(value["diagnostics"]) is not list or value["diagnostics"]:
        _admission_failed(("preflight", "diagnostics"))
    _check_document(value["document"], value["definition_digest"], ("preflight",))
    if value["document"]["id"] != resource_id:
        _admission_failed(("preflight", "document", "id"))
    if type(value["dependencies"]) is not list:
        _admission_failed(("preflight", "dependencies"))
    seen = set()
    for index, dependency in enumerate(value["dependencies"]):
        path = ("preflight", "dependencies", index)
        if type(dependency) is not dict or set(dependency) != _DEPENDENCY_FIELDS:
            _admission_failed(path)
        if any(type(dependency[field]) is not str or not dependency[field]
               for field in _DEPENDENCY_FIELDS):
            _admission_failed(path)
        if _DIGEST.fullmatch(dependency["definition_digest"]) is None:
            _admission_failed(path + ("definition_digest",))
        identity = (dependency["workflow_id"], dependency["revision_id"])
        if identity in seen:
            _admission_failed(path)
        seen.add(identity)
    _check_subagents(value["subagents"], ("preflight", "subagents"))


@dataclass(frozen=True)
class FrozenSkeletonChatSelection:
    """Immutable admitted resource material, not a durable execution locator."""

    _canonical_json: bytes
    _code_sources_json: bytes | None = None
    _workflows_json: bytes | None = None

    def to_dict(self) -> dict[str, Any]:
        return json.loads(self._canonical_json)

    @property
    def resource_id(self) -> str:
        return self.to_dict()["id"]

    @property
    def edit_token(self) -> str:
        return self.to_dict()["edit_token"]

    @property
    def definition_digest(self) -> str:
        return self.to_dict()["definition_digest"]

    @property
    def snapshot_digest(self) -> str:
        if self._code_sources_json is not None:
            value = {'schema': 'pupu.skeleton-admission.v2', 'preflight': self.to_dict(),
                     'code_sources': self.code_sources}
            return sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                ensure_ascii=False, allow_nan=False).encode('utf-8', 'surrogatepass')).hexdigest()
        return sha256(self._canonical_json).hexdigest()

    @property
    def code_sources(self):
        return None if self._code_sources_json is None else json.loads(self._code_sources_json)


def prepare_skeleton_chat_selection(options, *, store=None, legacy_kernel=None):
    """Resolve an explicit selection without silently choosing a different Agent.

    legacy_kernel is a trusted host argument. HTTP options never supply it.
    Published dependencies are pinned metadata; child Agent documents are fixed.
    """
    if not isinstance(options, dict) or "skeleton_selection" not in options:
        return None
    selection = _parse_selection(options)
    if store is None or type(store) is SkeletonResourceStore:
        from skeleton_code_admission import prepare_code_execution_material
        return prepare_code_execution_material(options, store=store, legacy_kernel=legacy_kernel, freeze_legacy=False)[0]
    return _prepare_selected_agent(selection, store=store, legacy_kernel=legacy_kernel)


def _prepare_selected_agent(selection, *, store, legacy_kernel=None):
    """The original resolver/preflight seam, also used by graph-only stores."""
    try:
        store = SkeletonResourceStore() if store is None else store
        kind = selection["kind"]
        if kind == "resource":
            resource = store.resolve(resource_id=selection["resource_id"])
        elif kind == "legacy":
            resource = store.resolve(legacy_name=selection["legacy_name"],
                                     source_scope=selection["source_scope"])
        else:
            resource = store.resolve(default_if_unselected=True)
        if resource["kind"] != "agent":
            raise SkeletonResourceError("wrong_kind", ("resource_id",),
                                        "ordinary chat requires an Agent resource")
        admitted = store.preflight(resource["id"], legacy_kernel=legacy_kernel)
        _check_preflight(admitted, resource["id"])
        canonical = json.dumps(admitted, sort_keys=True, separators=(",", ":"),
                               ensure_ascii=False, allow_nan=False).encode("utf-8", "surrogatepass")
        return FrozenSkeletonChatSelection(canonical)
    except SkeletonResourceError:
        raise
    except Exception:
        _admission_failed()
