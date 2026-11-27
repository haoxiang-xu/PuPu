"""Strict parser for the closed legacy Agent upgrade choice request."""

from __future__ import annotations

import math
import re
from typing import Any

from unchain.skeleton.errors import SkeletonValidationError
from unchain.skeleton.kernel_config import validate_kernel_config

from skeleton_resource_store import SkeletonResourceError


_SCHEMA = "pupu.skeleton-legacy-upgrade.choices.v1"
_RESOURCE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$")
_POLICIES = {"preserve", "replace"}
_ACKNOWLEDGEMENTS = {
    "legacy_setting_ignored", "legacy_prompt_review_required",
}


def _fail(code: str, path: tuple[str | int, ...], message: str) -> None:
    raise SkeletonResourceError(code, path, message)


def _json_value(value: Any, path: tuple[str | int, ...]) -> Any:
    """Validate JSON data without invoking coercion hooks and detach it."""
    if value is None or type(value) in (bool, int, str):
        return value
    if type(value) is float:
        if not math.isfinite(value):
            _fail("invalid_json", path, "choice values must be finite JSON numbers")
        return value
    if type(value) is list:
        return [_json_value(item, path + (index,)) for index, item in enumerate(value)]
    if type(value) is dict:
        result = {}
        for key, item in value.items():
            if type(key) is not str:
                _fail("invalid_json", path, "choice object keys must be strings")
            result[key] = _json_value(item, path + (key,))
        return result
    _fail("invalid_json", path, "choice values must use JSON types")


def _object(value: Any, path: tuple[str | int, ...], keys: set[str]) -> dict[str, Any]:
    if type(value) is not dict:
        _fail("invalid_type", path, "choice entry must be an object")
    unknown = next((key for key in value if key not in keys), None)
    if unknown is not None:
        _fail("unknown_field", path + (unknown,), "choice entry contains an unknown field")
    missing = next((key for key in sorted(keys) if key not in value), None)
    if missing is not None:
        _fail("missing_field", path + (missing,), "choice entry is missing a required field")
    return value


def _canonical_text(value: Any, path: tuple[str | int, ...], label: str) -> str:
    if type(value) is not str:
        _fail("invalid_type", path, f"{label} must be a string")
    if not value or value != value.strip():
        _fail("invalid_value", path, f"{label} must be non-empty without outer whitespace")
    return value


def _path(value: Any, path: tuple[str | int, ...]) -> tuple[str | int, ...]:
    if type(value) is not list:
        _fail("invalid_type", path, "path must be an array")
    if not 1 <= len(value) <= 64:
        _fail("invalid_value", path, "path must contain between 1 and 64 segments")
    segments = []
    for index, segment in enumerate(value):
        segment_path = path + (index,)
        if type(segment) is str and segment:
            segments.append(segment)
        elif type(segment) is int and segment >= 0:
            segments.append(segment)
        else:
            _fail("invalid_value", segment_path,
                  "path segments must be non-empty strings or non-negative integers")
    return tuple(segments)


def _entries(value: Any, key: str, path: tuple[str | int, ...]) -> list[Any]:
    category = value[key]
    if type(category) is not list:
        _fail("invalid_type", path + (key,), "choice category must be an array")
    return category


def parse_upgrade_choices(value: Any) -> dict[str, Any]:
    """Return a detached, validated copy of a closed upgrade choice request."""
    try:
        copied = _json_value(value, ("choices",))
    except RecursionError as exc:
        raise SkeletonResourceError("invalid_json", ("choices",),
                                    "choice values must be finite JSON data") from exc

    root = _object(copied, ("choices",),
                   {"schema", "kernels", "toolkits", "references", "acknowledged"})
    if root["schema"] != _SCHEMA or type(root["schema"]) is not str:
        _fail("invalid_value", ("choices", "schema"), "choice schema is unsupported")

    parsed: dict[str, Any] = {"schema": _SCHEMA}
    seen_paths: dict[str, set[tuple[str | int, ...]]] = {}

    def entry_path(category: str, index: int, entry: dict[str, Any]) -> tuple[str | int, ...]:
        item_path = ("choices", category, index)
        address = _path(entry["path"], item_path + ("path",))
        if address in seen_paths.setdefault(category, set()):
            _fail("duplicate_path", item_path + ("path",),
                  "choice paths must be unique within their category")
        seen_paths[category].add(address)
        return item_path

    kernels = []
    for index, item in enumerate(_entries(root, "kernels", ("choices",))):
        item_path = ("choices", "kernels", index)
        entry = _object(item, item_path,
                        {"path", "kernel", "model_policy", "prompt_policy", "accept_projection"})
        entry_path("kernels", index, entry)
        if type(entry["model_policy"]) is not str or entry["model_policy"] not in _POLICIES:
            _fail("invalid_value", item_path + ("model_policy",), "model policy must be preserve or replace")
        if type(entry["prompt_policy"]) is not str or entry["prompt_policy"] not in _POLICIES:
            _fail("invalid_value", item_path + ("prompt_policy",), "prompt policy must be preserve or replace")
        if entry["accept_projection"] is not True:
            _fail("invalid_value", item_path + ("accept_projection",), "projection acceptance must be literal true")
        kernel_path = item_path + ("kernel",)
        try:
            entry["kernel"] = validate_kernel_config(entry["kernel"], kernel_path)
        except SkeletonValidationError as exc:
            raise SkeletonResourceError(exc.code, tuple(exc.path), str(exc)) from exc
        kernels.append(entry)
    parsed["kernels"] = kernels

    toolkits = []
    for index, item in enumerate(_entries(root, "toolkits", ("choices",))):
        item_path = ("choices", "toolkits", index)
        entry = _object(item, item_path,
                        {"path", "toolkit_id", "enabled_tools", "discard_unsupported"})
        entry_path("toolkits", index, entry)
        _canonical_text(entry["toolkit_id"], item_path + ("toolkit_id",), "toolkit_id")
        enabled = entry["enabled_tools"]
        if enabled is not None:
            if type(enabled) is not list:
                _fail("invalid_type", item_path + ("enabled_tools",), "enabled_tools must be null or an array")
            names = set()
            for tool_index, name in enumerate(enabled):
                name_path = item_path + ("enabled_tools", tool_index)
                name = _canonical_text(name, name_path, "tool name")
                if name in names:
                    _fail("duplicate_value", name_path, "enabled tool names must be unique")
                names.add(name)
        if type(entry["discard_unsupported"]) is not bool:
            _fail("invalid_type", item_path + ("discard_unsupported",), "discard_unsupported must be a boolean")
        toolkits.append(entry)
    parsed["toolkits"] = toolkits

    references = []
    for index, item in enumerate(_entries(root, "references", ("choices",))):
        item_path = ("choices", "references", index)
        entry = _object(item, item_path, {"path", "source_scope", "agent_id"})
        entry_path("references", index, entry)
        _canonical_text(entry["source_scope"], item_path + ("source_scope",), "source_scope")
        agent_id = _canonical_text(entry["agent_id"], item_path + ("agent_id",), "agent_id")
        if _RESOURCE_ID_PATTERN.fullmatch(agent_id) is None:
            _fail("invalid_value", item_path + ("agent_id",), "agent_id must use URL-safe identifier characters")
        references.append(entry)
    parsed["references"] = references

    acknowledged = []
    seen_acknowledgements = set()
    for index, item in enumerate(_entries(root, "acknowledged", ("choices",))):
        item_path = ("choices", "acknowledged", index)
        entry = _object(item, item_path, {"path", "code"})
        address = _path(entry["path"], item_path + ("path",))
        if type(entry["code"]) is not str or entry["code"] not in _ACKNOWLEDGEMENTS:
            _fail("invalid_value", item_path + ("code",), "acknowledgement code is unsupported")
        identity = (entry["code"], address)
        if identity in seen_acknowledgements:
            _fail("duplicate_path", item_path + ("path",),
                  "acknowledgement code and path pairs must be unique")
        seen_acknowledgements.add(identity)
        acknowledged.append(entry)
    parsed["acknowledged"] = acknowledged
    return parsed


__all__ = ["parse_upgrade_choices"]
