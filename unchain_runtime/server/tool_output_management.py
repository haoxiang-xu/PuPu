from __future__ import annotations

import copy
import json
from typing import Any

SUPPORTED_TOOL_OUTPUT_POLICIES = frozenset({"default", "head_tail", "artifact_only"})
"""Supported tool output projection policies for V2 Durable Journal writes."""


def normalize_tool_output_policy(value: Any) -> str:
    """Return a supported policy name, or ``default`` for unknown input."""
    if not isinstance(value, str):
        return "default"
    normalized = value.strip().lower()
    return normalized if normalized in SUPPORTED_TOOL_OUTPUT_POLICIES else "default"


def canonical_content_bytes(value: Any) -> bytes:
    """Serialize a value exactly as context projection metadata currently does."""
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")


def build_tool_result_projection(
    result_bytes: bytes,
    *,
    policy: str,
    full_output_ref: Any,
    digest: str,
    content_bytes: int,
    preview_chars: int,
    inline_chars: int,
    projection_version: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    policy = normalize_tool_output_policy(policy)
    result_text = result_bytes.decode("utf-8", errors="replace")
    if not result_text:
        projected = {
            "projection": "empty",
            "full_output_ref": copy.deepcopy(full_output_ref),
            "content_bytes": int(content_bytes),
            "content_sha256": digest,
        }
    elif policy == "artifact_only":
        projected = {
            "projection": "artifact_only",
            "full_output_ref": copy.deepcopy(full_output_ref),
            "content_bytes": int(content_bytes),
            "content_sha256": digest,
            "note": "Full tool output is available in durable artifact",
        }
    elif policy == "head_tail":
        tail = result_text[-preview_chars:]
        projected = {
            "projection": "head_tail",
            "full_output_ref": copy.deepcopy(full_output_ref),
            "preview": result_text[:preview_chars],
            "tail_preview": tail,
            "content_bytes": int(content_bytes),
            "content_sha256": digest,
            "content_chars": len(result_text),
            "policy": policy,
        }
    else:
        projected = {
            "projection": "default",
            "full_output_ref": copy.deepcopy(full_output_ref),
            "content_bytes": int(content_bytes),
            "content_sha256": digest,
        }
        if content_bytes > inline_chars:
            projected["preview"] = result_text[:preview_chars]
            projected["inline"] = False
        else:
            projected["inline"] = True
            projected["preview"] = result_text

    metadata = {
        "projection_policy": policy,
        "projection_version": projection_version,
        "inline": bool(projected.get("inline", False)),
        "projection_bytes": len(canonical_content_bytes(projected)),
    }
    return projected, metadata
