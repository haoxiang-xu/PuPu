"""Independent admission of the actually imported Skeleton runtime protocol."""
from __future__ import annotations

import importlib
from typing import Any

from context_memory_v2_capability import _normalized_runtime_protocol_manifest


_REQUIRED_FEATURES = frozenset({
    "code_python_v1", "draft_diagnostics_v1", "durable_exclusive_dag_v2",
    "end_only_root_completion_v1", "explicit_bindings_v1", "hook_phase_receipts_v1",
    "kernel_profiles_v1", "legacy_conversion_v1", "non_llm_workflow_v1",
    "pinned_workflow_calls_v1", "production_host_bindings_v1", "skill_read_v1", "structured_output_v1",
    "subagent_graphs_v1", "tool_call_v1",
})


class SkeletonRuntimeCompatibilityError(ValueError):
    """A safe, typed failure at the host/runtime compatibility boundary."""

    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def validate_skeleton_runtime_manifest(manifest: object) -> dict[str, Any]:
    """Check the complete v1 baseline using PuPu's independent strict parser."""
    try:
        normalized = _normalized_runtime_protocol_manifest(manifest)
    except (TypeError, ValueError):
        raise SkeletonRuntimeCompatibilityError(
            "runtime_protocol_manifest_invalid", "runtime protocol manifest is invalid",
        ) from None
    protocol = next((item for item in normalized["protocols"]
                     if item["id"] == "skeleton_execution"), None)
    if (protocol is None or protocol["major"] != 1 or protocol["minor"] < 0
            or not _REQUIRED_FEATURES.issubset(protocol["features"])):
        raise SkeletonRuntimeCompatibilityError(
            "skeleton_runtime_incompatible", "runtime does not support the required Skeleton protocol",
        )
    return normalized


def require_skeleton_runtime() -> dict[str, Any]:
    """Read the loaded producer every time; no source, Git or mode bypass."""
    try:
        module = importlib.import_module("unchain.runtime.runtime_protocol")
        producer = getattr(module, "runtime_protocol_manifest", None)
        manifest = producer() if callable(producer) else None
    except Exception:
        # Do not stringify or return producer exceptions, which may contain secrets.
        manifest = None
    if manifest is None:
        raise SkeletonRuntimeCompatibilityError(
            "runtime_protocol_manifest_missing", "runtime protocol manifest is unavailable",
        ) from None
    return validate_skeleton_runtime_manifest(manifest)


__all__ = (
    "SkeletonRuntimeCompatibilityError",
    "require_skeleton_runtime",
    "validate_skeleton_runtime_manifest",
)
