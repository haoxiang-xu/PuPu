"""Closed, bounded renderer diagnostics emitted beside canonical RunBundle v1.

RunBundle is content-addressed and owned by Unchain.  Host-only completion
diagnostics therefore travel in a separate envelope instead of mutating the
canonical bundle after its digest has been computed.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from typing import Any, Mapping


COMPLETION_DIAGNOSTICS_SCHEMA = "pupu.completion_diagnostics.v1"
COMPLETION_DIAGNOSTICS_REF_SCHEMA = (
    "pupu.completion_diagnostics_ref.v1"
)
COMPLETION_DIAGNOSTICS_EXTENSION_KEY = (
    "pupu.run/completion_diagnostics_ref_v1"
)
MAX_COMPLETION_DIAGNOSTICS_BYTES = 128 * 1024

_MAX_DEPTH = 6
_MAX_ARRAY_ITEMS = 64
_MAX_OBJECT_KEYS = 96
_MAX_STRING_LENGTH = 8_192
_MAX_SAFE_INTEGER = (1 << 53) - 1
_DIAGNOSTIC_KEY_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
_BLOCKED_KEY_RE = re.compile(
    r"(?:reasoning|chain[_-]?of[_-]?thought|hidden[_-]?thought|password|passwd|"
    r"secret|credential|api[_-]?key|access[_-]?token|refresh[_-]?token)",
    re.IGNORECASE,
)
_MEMORY_V2_TOP_LEVEL_KEYS = frozenset(
    {
        "schema_version",
        "requested_mode",
        "requested_rollout_mode",
        "effective_rollout_mode",
        "mode",
        "status",
        "trace_status",
        "journal_status",
        "reason",
        "real_context_window_tokens",
        "output_reserve_tokens",
        "transport_margin_tokens",
        "available_input_tokens",
        "compression_threshold_tokens",
        "message_budget_tokens",
        "predicted_total_tokens",
        "before_estimated_tokens",
        "after_estimated_tokens",
        "fixed_overhead_tokens",
        "source_message_count",
        "journal_event_count",
        "source_event_range",
        "compacted",
        "dropped_turn_count",
        "compacted_tool_result_count",
        "native_tool_pair_count",
        "journal_bootstrap_message_count",
        "neutral_envelope_injected",
        "checkpoint_created",
        "checkpoint_consolidation_candidate_created",
        "active_applied",
        "shadow_only",
        "persistence_degraded",
        "persistence_error_code",
        "error_code",
        "iteration",
        "canary_selected",
        "canary_percent",
        "canary_hash_strategy",
        "legacy",
        "legacy_v1",
        "checkpoint_ref",
        "checkpoint_refs",
        "artifact_ref",
        "artifact_refs",
        "handoff_ref",
        "handoff_refs",
        "content_ref",
        "references",
        "context_build",
        "latest_context_build",
        "memory_agent",
        "memory_agent_run",
        "memory_agent_runs",
        "curator",
        "curator_run",
        "curator_runs",
        "consolidation_job",
        "consolidation_jobs",
    }
)


class CompletionDiagnosticsError(ValueError):
    """A completion diagnostics envelope violated the renderer contract."""

    code = "completion_diagnostics_invalid"


def _redact(value: object) -> object:
    try:
        from custom_provider import redact_secrets, redact_text
    except ImportError:  # pragma: no cover - packaged server ships the redactor
        return value
    keyed = redact_secrets(value)
    if isinstance(keyed, str):
        return redact_text(keyed)
    if isinstance(keyed, list):
        return [_redact(item) for item in keyed]
    if isinstance(keyed, dict):
        return {str(key): _redact(inner) for key, inner in keyed.items()}
    return keyed


def _bounded_node(value: object, *, depth: int = 0) -> object:
    if value is None or type(value) is bool:
        return value
    if type(value) is int:
        if abs(value) <= _MAX_SAFE_INTEGER:
            return value
        return str(value)
    if type(value) is float:
        if not math.isfinite(value):
            return None
        # JSON numbers do not round-trip byte-identically through JavaScript
        # (`1.0` becomes `1`).  Diagnostics floats are therefore normalized
        # into bounded decimal text before hashing and crossing SSE.
        return format(value, ".17g")
    if isinstance(value, str):
        return value[:_MAX_STRING_LENGTH]
    if depth >= _MAX_DEPTH:
        return None
    if isinstance(value, list):
        return [
            _bounded_node(item, depth=depth + 1)
            for item in value[:_MAX_ARRAY_ITEMS]
        ]
    if isinstance(value, Mapping):
        output: dict[str, object] = {}
        for raw_key, raw_value in list(value.items())[:_MAX_OBJECT_KEYS]:
            key = str(raw_key)[:128]
            if (
                not _DIAGNOSTIC_KEY_RE.fullmatch(key)
                or _BLOCKED_KEY_RE.search(key)
            ):
                continue
            output[key] = _bounded_node(raw_value, depth=depth + 1)
        return output
    return None


def _canonical_size(value: Mapping[str, Any]) -> int:
    return len(
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    )


def _diagnostics_digest(value: Mapping[str, Any]) -> str:
    canonical = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def build_completion_diagnostics(memory_v2: object) -> dict[str, Any] | None:
    """Build one exact envelope from trusted host diagnostics.

    The producer still applies the same closed allowlist used by the renderer;
    arbitrary model/tool payloads can never become completion metadata.
    """

    if not isinstance(memory_v2, Mapping):
        return None
    safe_source = copy.deepcopy(dict(memory_v2))
    safe_memory = {
        # These keys are an explicit telemetry allowlist.  Redact each value
        # rather than the containing mapping so harmless numeric fields such
        # as ``available_input_tokens`` are not mistaken for credentials by a
        # generic key-name scrubber.
        key: _bounded_node(_redact(safe_source[key]))
        for key in sorted(_MEMORY_V2_TOP_LEVEL_KEYS)
        if key in safe_source
    }
    if not safe_memory:
        return None
    body = {
        "schema": COMPLETION_DIAGNOSTICS_SCHEMA,
        "memory_v2": safe_memory,
    }
    envelope = {
        **body,
        "diagnostics_digest": _diagnostics_digest(body),
    }
    if _canonical_size(envelope) > MAX_COMPLETION_DIAGNOSTICS_BYTES:
        raise CompletionDiagnosticsError("completion diagnostics exceeds byte limit")
    return envelope


def project_completion_diagnostics(value: object) -> dict[str, Any] | None:
    """Strictly admit an already-built envelope at the SSE boundary."""

    if value is None:
        return None
    if type(value) is not dict or set(value) != {
        "schema",
        "diagnostics_digest",
        "memory_v2",
    }:
        raise CompletionDiagnosticsError("completion diagnostics shape is invalid")
    if value.get("schema") != COMPLETION_DIAGNOSTICS_SCHEMA:
        raise CompletionDiagnosticsError("completion diagnostics schema is unsupported")
    projected = build_completion_diagnostics(value.get("memory_v2"))
    if projected is None:
        raise CompletionDiagnosticsError("completion diagnostics payload is empty")
    if value.get("diagnostics_digest") != projected["diagnostics_digest"]:
        raise CompletionDiagnosticsError("completion diagnostics digest is invalid")
    return projected


def reproject_run_bundle_with_completion_diagnostics(
    raw_bundle: object,
    diagnostics: object,
) -> dict[str, Any]:
    """Bind separate diagnostics to an immutable canonical RunBundle.

    The full bounded diagnostics stay outside the Unchain-owned core.  Only
    their deterministic digest crosses through the one versioned namespaced
    extension point, using Unchain's official reprojection helper.
    """

    if type(raw_bundle) is not dict:
        raise CompletionDiagnosticsError("RunBundle must be an exact object")
    if raw_bundle.get("schema") != "unchain.run_bundle.v1":
        return copy.deepcopy(raw_bundle)
    projected_diagnostics = project_completion_diagnostics(diagnostics)
    if projected_diagnostics is None:
        return copy.deepcopy(raw_bundle)

    from unchain.run_bundle import (
        RunBundle,
        RunBundleProtocolError,
        reproject_run_bundle_extensions,
    )

    bundle = RunBundle.from_dict(raw_bundle)
    reference = {
        "schema": COMPLETION_DIAGNOSTICS_REF_SCHEMA,
        "diagnostics_schema": COMPLETION_DIAGNOSTICS_SCHEMA,
        "diagnostics_sha256": projected_diagnostics["diagnostics_digest"],
    }
    current = dict(bundle.extensions).get(
        COMPLETION_DIAGNOSTICS_EXTENSION_KEY
    )
    if current is not None:
        if current != reference:
            raise CompletionDiagnosticsError(
                "RunBundle diagnostics reference conflicts with its digest"
            )
        return bundle.to_dict()
    try:
        projected_bundle = reproject_run_bundle_extensions(
            bundle,
            extensions={COMPLETION_DIAGNOSTICS_EXTENSION_KEY: reference},
            next_revision=bundle.revision + 1,
        )
    except (RunBundleProtocolError, TypeError, ValueError) as error:
        raise CompletionDiagnosticsError(
            "RunBundle diagnostics reprojection failed"
        ) from error
    return projected_bundle.to_dict()


__all__ = [
    "COMPLETION_DIAGNOSTICS_EXTENSION_KEY",
    "COMPLETION_DIAGNOSTICS_REF_SCHEMA",
    "COMPLETION_DIAGNOSTICS_SCHEMA",
    "CompletionDiagnosticsError",
    "MAX_COMPLETION_DIAGNOSTICS_BYTES",
    "build_completion_diagnostics",
    "project_completion_diagnostics",
    "reproject_run_bundle_with_completion_diagnostics",
]
