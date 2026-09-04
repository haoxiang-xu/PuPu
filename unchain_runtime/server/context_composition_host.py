"""PuPu host boundary for privacy-safe Context Composition hints."""

from __future__ import annotations

import copy
import json
from collections.abc import Mapping
from typing import Any

from context_composition_capability import (
    resolve_context_composition_capability,
)


PUBLIC_HINT_FIELD = "context_composition_hint"
PUBLIC_HINT_SCHEMA = "pupu.context_composition_hint.v2"
PRIVATE_HINT_OPTION = "_context_composition_hint_v1"
AVAILABILITY_OPTION = "_context_composition_availability_v2"
AVAILABILITY_SCHEMA = "pupu.context_composition_availability.v2"

_MAX_SAFE_INTEGER = (1 << 53) - 1
_MAX_PUBLIC_HINT_BYTES = 1024
_PUBLIC_KEYS = frozenset({"schema", "contributions"})
_PUBLIC_CONTRIBUTION_KEYS = frozenset(
    {
        "category",
        "subtype",
        "surface",
        "prefix_utf16_units",
        "utf8_bytes",
        "source_count",
    }
)
_PRIVATE_KEYS = frozenset(
    {"category", "subtype", "surface", "utf8_bytes", "source_count"}
)
_AVAILABILITY_CODES = frozenset(
    {
        "capability_unavailable",
        "extension_missing",
        "extension_invalid",
        "fresh_hint_invalid",
        "resume_hint_invalid",
        "resume_hint_mismatch",
        "resume_hint_no_baseline",
    }
)


class ContextCompositionHintError(ValueError):
    def __init__(self, code: str) -> None:
        normalized = str(code or "fresh_hint_invalid")
        if normalized not in _AVAILABILITY_CODES:
            normalized = "fresh_hint_invalid"
        super().__init__(normalized)
        self.code = normalized


def context_composition_availability(code: str) -> dict[str, str]:
    if not isinstance(code, str) or code not in _AVAILABILITY_CODES:
        raise ValueError("context composition availability code is invalid")
    return {"schema": AVAILABILITY_SCHEMA, "code": code}


def normalize_context_composition_availability(
    value: object,
) -> dict[str, str] | None:
    code = value.get("code") if isinstance(value, Mapping) else None
    if (
        not isinstance(value, Mapping)
        or set(value) != {"schema", "code"}
        or value.get("schema") != AVAILABILITY_SCHEMA
        or not isinstance(code, str)
        or code not in _AVAILABILITY_CODES
    ):
        return None
    return context_composition_availability(code)


def _positive_safe_integer(value: object) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value <= 0
        or value > _MAX_SAFE_INTEGER
    ):
        raise ContextCompositionHintError("fresh_hint_invalid")
    return value


def _canonical_json_bytes(value: object) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8", errors="strict")
    except (TypeError, ValueError, UnicodeError) as exc:
        raise ContextCompositionHintError("fresh_hint_invalid") from exc


def _authoritative_prefix(
    message: object,
    *,
    utf16_units: int,
) -> str:
    if not isinstance(message, str):
        raise ContextCompositionHintError("fresh_hint_invalid")
    try:
        encoded = message.encode("utf-16-le", errors="surrogatepass")
    except UnicodeError as exc:  # pragma: no cover - surrogatepass is total
        raise ContextCompositionHintError("fresh_hint_invalid") from exc
    boundary = utf16_units * 2
    if boundary > len(encoded):
        raise ContextCompositionHintError("fresh_hint_invalid")
    try:
        return encoded[:boundary].decode("utf-16-le", errors="strict")
    except UnicodeError as exc:
        # Covers a boundary inside a valid pair and every unpaired surrogate in
        # the selected prefix.  Replacement encoding is never permitted.
        raise ContextCompositionHintError("fresh_hint_invalid") from exc


def normalize_private_context_composition_hint(
    value: object,
    *,
    error_code: str = "resume_hint_invalid",
) -> dict[str, Any]:
    try:
        if not isinstance(value, Mapping) or set(value) != _PRIVATE_KEYS:
            raise ContextCompositionHintError(error_code)
        if (
            value.get("category") != "skills"
            or value.get("subtype") != "expanded_invocation"
            or value.get("surface") != "messages"
            or not isinstance(value.get("source_count"), int)
            or value.get("source_count") != 1
            or isinstance(value.get("source_count"), bool)
        ):
            raise ContextCompositionHintError(error_code)
        utf8_bytes = _positive_safe_integer(value.get("utf8_bytes"))
    except ContextCompositionHintError as exc:
        if exc.code == error_code:
            raise
        raise ContextCompositionHintError(error_code) from exc
    return {
        "category": "skills",
        "subtype": "expanded_invocation",
        "surface": "messages",
        "utf8_bytes": utf8_bytes,
        "source_count": 1,
    }


def canonical_private_context_composition_hint_bytes(value: object) -> bytes:
    normalized = normalize_private_context_composition_hint(value)
    return _canonical_json_bytes(normalized)


def admit_fresh_context_composition_hint(
    value: object,
    *,
    authoritative_message: object,
) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise ContextCompositionHintError("fresh_hint_invalid")
    if len(_canonical_json_bytes(value)) > _MAX_PUBLIC_HINT_BYTES:
        raise ContextCompositionHintError("fresh_hint_invalid")
    if set(value) != _PUBLIC_KEYS or value.get("schema") != PUBLIC_HINT_SCHEMA:
        raise ContextCompositionHintError("fresh_hint_invalid")
    contributions = value.get("contributions")
    if not isinstance(contributions, list) or len(contributions) != 1:
        raise ContextCompositionHintError("fresh_hint_invalid")
    contribution = contributions[0]
    if (
        not isinstance(contribution, Mapping)
        or set(contribution) != _PUBLIC_CONTRIBUTION_KEYS
        or contribution.get("category") != "skills"
        or contribution.get("subtype") != "expanded_invocation"
        or contribution.get("surface") != "messages"
        or not isinstance(contribution.get("source_count"), int)
        or contribution.get("source_count") != 1
        or isinstance(contribution.get("source_count"), bool)
    ):
        raise ContextCompositionHintError("fresh_hint_invalid")
    prefix_utf16_units = _positive_safe_integer(contribution.get("prefix_utf16_units"))
    claimed_utf8_bytes = _positive_safe_integer(contribution.get("utf8_bytes"))
    prefix = _authoritative_prefix(
        authoritative_message,
        utf16_units=prefix_utf16_units,
    )
    try:
        computed_utf8_bytes = len(prefix.encode("utf-8", errors="strict"))
    except UnicodeError as exc:  # pragma: no cover - strict UTF-16 above
        raise ContextCompositionHintError("fresh_hint_invalid") from exc
    if computed_utf8_bytes <= 0 or computed_utf8_bytes != claimed_utf8_bytes:
        raise ContextCompositionHintError("fresh_hint_invalid")
    return {
        "category": "skills",
        "subtype": "expanded_invocation",
        "surface": "messages",
        "utf8_bytes": computed_utf8_bytes,
        "source_count": 1,
    }


def prepare_context_composition_options(
    options: object,
    *,
    public_hint: object,
    public_hint_present: bool,
    private_resume_declaration: object = None,
    private_resume_declaration_present: bool = False,
    authoritative_message: object,
    resume_interaction: bool,
) -> dict[str, Any]:
    """Scrub renderer authority and mint only an admitted private value."""

    safe = {
        str(key): copy.deepcopy(inner)
        for key, inner in (options.items() if isinstance(options, dict) else ())
        if not str(key).startswith("_context_composition_")
    }
    verdict = resolve_context_composition_capability()
    if not verdict.ready:
        safe[AVAILABILITY_OPTION] = context_composition_availability(
            "capability_unavailable"
        )
        return safe
    if resume_interaction and public_hint_present:
        safe[AVAILABILITY_OPTION] = context_composition_availability(
            "resume_hint_invalid"
        )
        return safe
    if resume_interaction and private_resume_declaration_present:
        safe[PRIVATE_HINT_OPTION] = copy.deepcopy(private_resume_declaration)
        return safe
    if not public_hint_present:
        return safe
    try:
        safe[PRIVATE_HINT_OPTION] = admit_fresh_context_composition_hint(
            public_hint,
            authoritative_message=authoritative_message,
        )
    except ContextCompositionHintError:
        safe[AVAILABILITY_OPTION] = context_composition_availability(
            "fresh_hint_invalid"
        )
    return safe


def build_context_composition_bootstrap_module(
    private_hint: object,
) -> Any | None:
    """Build the official module, degrading only this optional feature."""

    try:
        normalized = normalize_private_context_composition_hint(private_hint)
        verdict = resolve_context_composition_capability()
        if not verdict.ready:
            return None
        return verdict.bootstrap_module.from_private_hint(normalized)
    except Exception:
        return None


__all__ = (
    "AVAILABILITY_OPTION",
    "AVAILABILITY_SCHEMA",
    "ContextCompositionHintError",
    "PRIVATE_HINT_OPTION",
    "PUBLIC_HINT_FIELD",
    "PUBLIC_HINT_SCHEMA",
    "admit_fresh_context_composition_hint",
    "build_context_composition_bootstrap_module",
    "canonical_private_context_composition_hint_bytes",
    "context_composition_availability",
    "normalize_context_composition_availability",
    "normalize_private_context_composition_hint",
    "prepare_context_composition_options",
)
