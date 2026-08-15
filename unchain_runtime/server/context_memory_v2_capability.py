"""Runtime-relative protocol admission for Context/Memory V2.

Compatibility is decided only from the protocol manifest exported by the
actually imported Unchain runtime.  Git revision, checkout state, environment
bypasses, and the historical SHA lock are not admission inputs.
"""

from __future__ import annotations

import hashlib
import importlib
import json
import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any


_MANIFEST_SCHEMA = "unchain.runtime_protocol_manifest.v1"
_DIGEST_DOMAIN = b"unchain.runtime_protocol_manifest.v1\\u0000"
_MANIFEST_KEYS = frozenset({"manifest_digest", "protocols", "runtime", "schema"})
_PROTOCOL_KEYS = frozenset({"features", "id", "major", "minor"})
_DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_V2_MODES = frozenset({"shadow", "canary", "all", "active"})
_MAX_SAFE_INTEGER = (1 << 53) - 1


@dataclass(frozen=True, slots=True)
class _RuntimeProtocolRequirement:
    id: str
    major: int
    minimum_minor: int
    features: frozenset[str]


_REQUIRED_PROTOCOLS = (
    _RuntimeProtocolRequirement(
        id="context_memory",
        major=1,
        minimum_minor=0,
        features=frozenset(
            {
                "artifact_handoff",
                "canonical_journal",
                "chat_deletion_sqlite_scope_closure",
                "context_compiler",
                "interaction_resolution_compat",
                "long_term_promotion",
                "memory_curator",
                "memory_toolkit",
                "memory_workspace",
            }
        ),
    ),
    _RuntimeProtocolRequirement(
        id="durable_interaction",
        major=1,
        minimum_minor=0,
        features=frozenset(
            {
                "cancel_pending",
                "expected_interaction_id_cas",
                "fresh_run_lineage",
                "host_controlled_resume",
            }
        ),
    ),
    _RuntimeProtocolRequirement(
        id="provider_turn_ownership",
        major=1,
        minimum_minor=0,
        features=frozenset(
            {
                "atomic_receipt_cas",
                "auxiliary_calls",
                "enforce_mode",
                "graph_runs",
                "memory_off",
                "subagent_runs",
            }
        ),
    ),
    _RuntimeProtocolRequirement(
        id="run_bundle",
        major=1,
        minimum_minor=0,
        features=frozenset(
            {
                "canonical_metrics",
                "completion_diagnostics_ref",
                "continuation_claim",
                "immutable_pricing_snapshot",
                "provider_call_set_union",
                "provider_call_usage_v1",
                "run_bundle_v1",
            }
        ),
    ),
)


class _RuntimeProtocolManifestInvalid(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ContextMemoryV2CapabilityVerdict:
    ready: bool
    reason: str
    verification: str
    immutable: bool
    unchain_revision: str = ""
    unchain_runtime_source: str = ""
    _runtime_protocol_manifest_json: str = field(default="", repr=False)

    @property
    def runtime_protocol_manifest(self) -> dict[str, Any] | None:
        if not self._runtime_protocol_manifest_json:
            return None
        value = json.loads(self._runtime_protocol_manifest_json)
        return value if isinstance(value, dict) else None


def _nfc_text(value: object, *, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise _RuntimeProtocolManifestInvalid(
            f"{label} must be a non-empty string"
        )
    try:
        value.encode("utf-8", errors="strict")
    except UnicodeEncodeError as exc:
        raise _RuntimeProtocolManifestInvalid(
            f"{label} must be a strict UTF-8 Unicode scalar sequence"
        ) from exc
    if unicodedata.normalize("NFC", value) != value:
        raise _RuntimeProtocolManifestInvalid(f"{label} must use NFC")
    return value


def _version(value: object, *, label: str) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value < 0
        or value > _MAX_SAFE_INTEGER
    ):
        raise _RuntimeProtocolManifestInvalid(
            f"{label} must be a non-negative safe integer"
        )
    return value


def _canonical_string_array(value: object, *, label: str) -> list[str]:
    if not isinstance(value, list):
        raise _RuntimeProtocolManifestInvalid(f"{label} must be an array")
    items = [_nfc_text(item, label=f"{label} item") for item in value]
    if len(set(items)) != len(items):
        raise _RuntimeProtocolManifestInvalid(f"{label} must be unique")
    if items != sorted(items, key=lambda item: item.encode("utf-8")):
        raise _RuntimeProtocolManifestInvalid(
            f"{label} must use canonical order"
        )
    return items


def _normalized_runtime_protocol_manifest(
    value: object,
) -> dict[str, Any]:
    if not isinstance(value, Mapping) or set(value) != _MANIFEST_KEYS:
        raise _RuntimeProtocolManifestInvalid("manifest fields are invalid")
    schema = _nfc_text(value.get("schema"), label="manifest schema")
    runtime = _nfc_text(value.get("runtime"), label="runtime")
    if schema != _MANIFEST_SCHEMA or runtime != "unchain":
        raise _RuntimeProtocolManifestInvalid("manifest identity is invalid")
    raw_protocols = value.get("protocols")
    if not isinstance(raw_protocols, list):
        raise _RuntimeProtocolManifestInvalid("protocols must be an array")
    protocols: list[dict[str, Any]] = []
    for raw_protocol in raw_protocols:
        if not isinstance(raw_protocol, Mapping) or set(raw_protocol) != _PROTOCOL_KEYS:
            raise _RuntimeProtocolManifestInvalid(
                "protocol item fields are invalid"
            )
        protocols.append(
            {
                "features": _canonical_string_array(
                    raw_protocol.get("features"),
                    label="features",
                ),
                "id": _nfc_text(raw_protocol.get("id"), label="protocol id"),
                "major": _version(raw_protocol.get("major"), label="major"),
                "minor": _version(raw_protocol.get("minor"), label="minor"),
            }
        )
    protocol_ids = [item["id"] for item in protocols]
    if len(set(protocol_ids)) != len(protocol_ids):
        raise _RuntimeProtocolManifestInvalid("protocol ids must be unique")
    if protocol_ids != sorted(protocol_ids, key=lambda item: item.encode("utf-8")):
        raise _RuntimeProtocolManifestInvalid(
            "protocols must use canonical order"
        )
    digest = value.get("manifest_digest")
    if not isinstance(digest, str) or _DIGEST_RE.fullmatch(digest) is None:
        raise _RuntimeProtocolManifestInvalid("manifest digest is invalid")
    body = {
        "protocols": protocols,
        "runtime": runtime,
        "schema": schema,
    }
    try:
        canonical = json.dumps(
            body,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:  # pragma: no cover - typed above
        raise _RuntimeProtocolManifestInvalid(
            "manifest body is not canonical JSON"
        ) from exc
    expected_digest = "sha256:" + hashlib.sha256(
        _DIGEST_DOMAIN + canonical
    ).hexdigest()
    if digest != expected_digest:
        raise _RuntimeProtocolManifestInvalid("manifest digest does not match")
    return {
        "manifest_digest": digest,
        "protocols": protocols,
        "runtime": runtime,
        "schema": schema,
    }


def _manifest_json(value: dict[str, Any]) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _incompatible_verdict(
    *,
    reason: str,
    manifest: dict[str, Any] | None,
    unchain_revision: str,
    unchain_runtime_source: str,
) -> ContextMemoryV2CapabilityVerdict:
    return ContextMemoryV2CapabilityVerdict(
        ready=False,
        reason=reason,
        verification="failed",
        immutable=False,
        unchain_revision=unchain_revision,
        unchain_runtime_source=unchain_runtime_source,
        _runtime_protocol_manifest_json=(
            _manifest_json(manifest) if manifest is not None else ""
        ),
    )


def verify_context_memory_v2_capability(
    *,
    manifest: object,
    requested_mode: str,
    unchain_revision: str = "",
    unchain_runtime_source: str = "",
) -> ContextMemoryV2CapabilityVerdict:
    """Independently validate the runtime manifest and required protocol matrix."""

    revision_telemetry = (
        unchain_revision if isinstance(unchain_revision, str) else ""
    )
    source_telemetry = (
        unchain_runtime_source if isinstance(unchain_runtime_source, str) else ""
    )
    if requested_mode == "off":
        return ContextMemoryV2CapabilityVerdict(
            ready=True,
            reason="protocol_not_required",
            verification="not_required",
            immutable=False,
            unchain_revision=revision_telemetry,
            unchain_runtime_source=source_telemetry,
        )
    if requested_mode not in _V2_MODES:
        raise ValueError("requested_mode is invalid")
    if manifest is None:
        return _incompatible_verdict(
            reason="unchain_runtime_protocol_manifest_missing",
            manifest=None,
            unchain_revision=revision_telemetry,
            unchain_runtime_source=source_telemetry,
        )
    try:
        normalized = _normalized_runtime_protocol_manifest(manifest)
    except _RuntimeProtocolManifestInvalid:
        return _incompatible_verdict(
            reason="unchain_runtime_protocol_manifest_invalid",
            manifest=None,
            unchain_revision=revision_telemetry,
            unchain_runtime_source=source_telemetry,
        )
    by_id = {item["id"]: item for item in normalized["protocols"]}
    for requirement in _REQUIRED_PROTOCOLS:
        protocol = by_id.get(requirement.id)
        if protocol is None:
            return _incompatible_verdict(
                reason="unchain_runtime_protocol_required_protocol_missing",
                manifest=normalized,
                unchain_revision=revision_telemetry,
                unchain_runtime_source=source_telemetry,
            )
        if protocol["major"] != requirement.major:
            return _incompatible_verdict(
                reason="unchain_runtime_protocol_major_mismatch",
                manifest=normalized,
                unchain_revision=revision_telemetry,
                unchain_runtime_source=source_telemetry,
            )
        if protocol["minor"] < requirement.minimum_minor:
            return _incompatible_verdict(
                reason="unchain_runtime_protocol_minor_too_low",
                manifest=normalized,
                unchain_revision=revision_telemetry,
                unchain_runtime_source=source_telemetry,
            )
        if not requirement.features.issubset(protocol["features"]):
            return _incompatible_verdict(
                reason="unchain_runtime_protocol_required_feature_missing",
                manifest=normalized,
                unchain_revision=revision_telemetry,
                unchain_runtime_source=source_telemetry,
            )
    return ContextMemoryV2CapabilityVerdict(
        ready=True,
        reason="unchain_runtime_protocol_compatible",
        verification="runtime_protocol",
        immutable=True,
        unchain_revision=revision_telemetry,
        unchain_runtime_source=source_telemetry,
        _runtime_protocol_manifest_json=_manifest_json(normalized),
    )


def _load_imported_runtime_protocol() -> tuple[object | None, str, str]:
    """Load only the protocol exported by the actual imported runtime module."""

    try:
        module = importlib.import_module("unchain.runtime.runtime_protocol")
        producer = getattr(module, "runtime_protocol_manifest", None)
        if not callable(producer):
            return None, "", str(getattr(module, "__file__", "") or "")
        manifest = producer()
        unchain_module = importlib.import_module("unchain")
    except Exception:
        return None, "", ""
    revision = getattr(unchain_module, "__revision__", "")
    return (
        manifest,
        revision if isinstance(revision, str) else "",
        str(getattr(module, "__file__", "") or ""),
    )


def resolve_context_memory_v2_capability(
    *,
    requested_mode: str,
) -> ContextMemoryV2CapabilityVerdict:
    """Resolve the V2 gate from the actual loaded runtime protocol."""

    if requested_mode == "off":
        return verify_context_memory_v2_capability(
            manifest=None,
            requested_mode="off",
        )
    if requested_mode not in _V2_MODES:
        raise ValueError("requested_mode is invalid")
    manifest, revision, source = _load_imported_runtime_protocol()
    return verify_context_memory_v2_capability(
        manifest=manifest,
        requested_mode=requested_mode,
        unchain_revision=revision,
        unchain_runtime_source=source,
    )


def context_memory_v2_capability_status(
    verdict: ContextMemoryV2CapabilityVerdict,
) -> dict[str, Any]:
    return {
        "runtime_protocol_ready": verdict.ready,
        "runtime_protocol_reason": verdict.reason,
        "runtime_protocol_verification": verdict.verification,
        "runtime_protocol_immutable": verdict.immutable,
        "runtime_protocol_manifest": verdict.runtime_protocol_manifest,
        "unchain_revision": verdict.unchain_revision,
        "unchain_runtime_source": verdict.unchain_runtime_source,
    }


__all__ = (
    "ContextMemoryV2CapabilityVerdict",
    "context_memory_v2_capability_status",
    "resolve_context_memory_v2_capability",
    "verify_context_memory_v2_capability",
)
