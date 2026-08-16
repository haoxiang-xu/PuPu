"""Strict, read-only Context Composition diagnostics for canonical RunBundles."""

from __future__ import annotations

import re
from typing import Any

from context_composition_host import (
    context_composition_availability,
    normalize_context_composition_availability,
)


CONTEXT_COMPOSITION_EXTENSION_KEY = "unchain.context/context_composition_v1"

_EXTENSION_SCHEMA = "unchain.context/context_composition_v1"
_METHOD = "utf8_heuristic_v1"
_MAX_SAFE_INTEGER = (1 << 53) - 1
_SHA256 = re.compile(r"^sha256:[a-f0-9]{64}$")
_ROUTES = frozenset({"primary", "openai_previous_response_fallback"})
_CONTEXT_MODES = frozenset({"semantic", "local_replay", "remote_continuation"})
_QUALITIES = frozenset({"reconciled_estimate", "estimated", "partial"})
_CATEGORY_ORDER = (
    "instructions",
    "skills",
    "tool_definitions",
    "conversation",
    "tool_activity",
    "memory",
    "task_state",
    "files_media",
    "agent_coordination",
    "output_contract",
)
_TAXONOMY = {
    "instructions": (
        "core_system",
        "agent_instructions",
        "user_rules",
        "runtime_safety",
        "recipe_workflow",
    ),
    "skills": (
        "catalog_metadata",
        "loaded_body",
        "expanded_invocation",
    ),
    "tool_definitions": (
        "provider_schema",
        "prompt_guidance",
        "dynamic_tool",
    ),
    "conversation": (
        "current_input",
        "user_history",
        "assistant_history",
        "summary",
    ),
    "tool_activity": (
        "arguments",
        "results",
        "errors_observations",
    ),
    "memory": (
        "short_term_recall",
        "long_term_recall",
        "pending_memory",
    ),
    "task_state": (
        "pinned_state",
        "pending_interaction",
        "plan_state",
    ),
    "files_media": (
        "file_excerpt",
        "artifact",
        "image_media",
        "web_pdf",
    ),
    "agent_coordination": (
        "inherited_context",
        "handoff_summary",
        "child_instructions",
        "subagent_report_roster",
    ),
    "output_contract": (
        "response_schema",
        "format_instruction",
    ),
}
_EXTENSION_KEYS = frozenset(
    {
        "schema",
        "method",
        "quality",
        "context_window_tokens",
        "wire",
        "categories",
        "attributed_tokens",
        "residual_tokens",
        "coverage",
    }
)


class ContextCompositionExtensionProjectionError(ValueError):
    """One namespaced extension failed the closed consumer contract."""


def _fail() -> None:
    raise ContextCompositionExtensionProjectionError(
        "context composition extension is invalid"
    )


def _exact_dict(value: object, keys: frozenset[str]) -> dict[str, Any]:
    if type(value) is not dict or set(value) != keys:
        _fail()
    return value


def _integer(
    value: object,
    *,
    positive: bool = False,
    nullable: bool = False,
) -> int | None:
    if value is None and nullable:
        return None
    if (
        type(value) is not int
        or value < (1 if positive else 0)
        or value > _MAX_SAFE_INTEGER
    ):
        _fail()
    return value


def _checked_add(left: int, right: int) -> int:
    total = left + right
    if total > _MAX_SAFE_INTEGER:
        _fail()
    return total


def _canonical_ids(
    values: list[object],
    order: tuple[str, ...],
) -> None:
    previous = -1
    for value in values:
        try:
            current = order.index(value)
        except (TypeError, ValueError):
            _fail()
        if current <= previous:
            _fail()
        previous = current


def _validate_context_composition_extension(
    value: object,
    *,
    receipt: dict[str, Any],
) -> None:
    extension = _exact_dict(value, _EXTENSION_KEYS)
    if (
        extension.get("schema") != _EXTENSION_SCHEMA
        or extension.get("method") != _METHOD
        or extension.get("quality") not in _QUALITIES
    ):
        _fail()
    _integer(
        extension.get("context_window_tokens"),
        positive=True,
        nullable=True,
    )

    wire = _exact_dict(
        extension.get("wire"),
        frozenset(
            {
                "envelope_sha256",
                "route_name",
                "route_sha256",
                "context_mode",
            }
        ),
    )
    if (
        not isinstance(wire.get("envelope_sha256"), str)
        or _SHA256.fullmatch(wire["envelope_sha256"]) is None
        or not isinstance(wire.get("route_sha256"), str)
        or _SHA256.fullmatch(wire["route_sha256"]) is None
        or wire.get("route_name") not in _ROUTES
        or wire.get("context_mode") not in _CONTEXT_MODES
    ):
        _fail()

    categories = extension.get("categories")
    if type(categories) is not list or len(categories) > len(_CATEGORY_ORDER):
        _fail()
    _canonical_ids(
        [
            category.get("id") if type(category) is dict else None
            for category in categories
        ],
        _CATEGORY_ORDER,
    )
    category_token_total = 0
    category_source_total = 0
    for category in categories:
        normalized_category = _exact_dict(
            category,
            frozenset({"id", "tokens", "source_count", "subtypes"}),
        )
        category_id = normalized_category.get("id")
        allowed_subtypes = _TAXONOMY.get(category_id)
        if allowed_subtypes is None:
            _fail()
        category_tokens = _integer(
            normalized_category.get("tokens"),
            positive=True,
        )
        category_sources = _integer(
            normalized_category.get("source_count"),
            positive=True,
        )
        subtypes = normalized_category.get("subtypes")
        if (
            type(subtypes) is not list
            or not subtypes
            or len(subtypes) > len(allowed_subtypes)
        ):
            _fail()
        _canonical_ids(
            [
                subtype.get("id") if type(subtype) is dict else None
                for subtype in subtypes
            ],
            allowed_subtypes,
        )
        subtype_token_total = 0
        subtype_source_total = 0
        for subtype in subtypes:
            normalized_subtype = _exact_dict(
                subtype,
                frozenset({"id", "tokens", "source_count"}),
            )
            subtype_tokens = _integer(
                normalized_subtype.get("tokens"),
                positive=True,
            )
            subtype_sources = _integer(
                normalized_subtype.get("source_count"),
                positive=True,
            )
            subtype_token_total = _checked_add(
                subtype_token_total,
                subtype_tokens,
            )
            subtype_source_total = _checked_add(
                subtype_source_total,
                subtype_sources,
            )
        if (
            category_tokens != subtype_token_total
            or category_sources != subtype_source_total
        ):
            _fail()
        category_token_total = _checked_add(
            category_token_total,
            category_tokens,
        )
        category_source_total = _checked_add(
            category_source_total,
            category_sources,
        )

    attributed_tokens = _integer(extension.get("attributed_tokens"))
    residual_tokens = _integer(
        extension.get("residual_tokens"),
        nullable=True,
    )
    if attributed_tokens != category_token_total:
        _fail()

    coverage = _exact_dict(
        extension.get("coverage"),
        frozenset(
            {
                "status",
                "manifest_items",
                "matched_items",
                "wire_surfaces",
                "matched_surfaces",
            }
        ),
    )
    if coverage.get("status") not in {"complete", "partial"}:
        _fail()
    manifest_items = _integer(coverage.get("manifest_items"))
    matched_items = _integer(coverage.get("matched_items"))
    wire_surfaces = _integer(coverage.get("wire_surfaces"))
    matched_surfaces = _integer(coverage.get("matched_surfaces"))
    if (
        matched_items != category_source_total
        or matched_items > manifest_items
        or wire_surfaces > 4
        or matched_surfaces > wire_surfaces
    ):
        _fail()
    coverage_complete = (
        matched_items == manifest_items and matched_surfaces == wire_surfaces
    )
    if (coverage.get("status") == "complete") != coverage_complete:
        _fail()

    quality = extension["quality"]
    if quality == "reconciled_estimate":
        if not coverage_complete or residual_tokens is None:
            _fail()
        usage = receipt.get("usage")
        usage_input = usage.get("input") if type(usage) is dict else None
        provider_input_tokens = (
            usage_input.get("total_tokens") if type(usage_input) is dict else None
        )
        provider_input_tokens = _integer(provider_input_tokens)
        if (
            attributed_tokens > provider_input_tokens
            or residual_tokens != provider_input_tokens - attributed_tokens
        ):
            _fail()
    elif quality == "estimated":
        if not coverage_complete or residual_tokens is not None:
            _fail()
    elif coverage_complete or residual_tokens is not None:
        _fail()


def project_context_composition_availability(
    bundle: object,
    *,
    preferred: object = None,
) -> dict[str, str] | None:
    """Derive one closed diagnostic without changing receipt or bundle bytes."""

    preferred_availability = normalize_context_composition_availability(preferred)
    if preferred_availability is not None:
        return preferred_availability
    if type(bundle) is not dict or bundle.get("schema") != "unchain.run_bundle.v1":
        return context_composition_availability("extension_missing")
    provider_calls = bundle.get("provider_calls")
    if type(provider_calls) is not list or not provider_calls:
        return context_composition_availability("extension_missing")
    extension_missing = False
    for receipt in provider_calls:
        if type(receipt) is not dict or type(receipt.get("extensions")) is not dict:
            return context_composition_availability("extension_invalid")
        extensions = receipt["extensions"]
        if CONTEXT_COMPOSITION_EXTENSION_KEY not in extensions:
            extension_missing = True
            continue
        try:
            _validate_context_composition_extension(
                extensions[CONTEXT_COMPOSITION_EXTENSION_KEY],
                receipt=receipt,
            )
        except (TypeError, ValueError, OverflowError):
            return context_composition_availability("extension_invalid")
    if extension_missing:
        return context_composition_availability("extension_missing")
    return None


__all__ = (
    "CONTEXT_COMPOSITION_EXTENSION_KEY",
    "ContextCompositionExtensionProjectionError",
    "project_context_composition_availability",
)
