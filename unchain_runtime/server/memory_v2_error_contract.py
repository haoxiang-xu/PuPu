from __future__ import annotations

from typing import Any


_SAFE_CONTEXT_V2_REASONS = {
    "context_v2_journal_message_projection_invalid": frozenset(
        {
            "event_cursor_conflict",
            "event_cursor_invalid",
            "event_payload_conflict",
            "event_scope_conflict",
            "message_lifecycle_invalid",
            "message_payload_invalid",
            "message_scope_invalid",
            "source_cursor_conflict",
            "source_cursor_order_invalid",
            "source_cursor_unbound",
            "source_message_mismatch",
            "terminal_outcome_conflict",
            "terminal_scope_conflict",
        }
    ),
    "context_v2_model_projection_invalid": frozenset(
        {
            "attachment_artifact_unavailable",
            "attachment_content_invalid",
            "attachment_envelope_invalid",
            "attachment_kind_unsupported",
            "attachment_materializer_unavailable",
            "attachment_media_type_mismatch",
            "attachment_role_invalid",
            "message_shape_invalid",
            "provider_attachment_unsupported",
            "provider_multimodal_unsupported",
            "remote_attachment_decoder_unavailable",
            "remote_attachment_descriptor_invalid",
            "remote_source_fields_invalid",
            "remote_source_file_id_invalid",
            "remote_source_media_type_invalid",
            "remote_source_type_unsupported",
            "remote_source_url_invalid",
        }
    ),
}


def safe_context_v2_error(error: Any) -> tuple[str, str | None]:
    """Return only stable, explicitly public Context V2 error identifiers."""

    code = str(getattr(error, "code", "") or "").strip()
    allowed = _SAFE_CONTEXT_V2_REASONS.get(code)
    if allowed is None:
        return (
            ("context_v2_failed", None)
            if code.startswith("context_v2_")
            else ("", None)
        )
    raw_reason = getattr(error, "reason", None)
    reason = str(raw_reason or "").strip()
    return code, reason if reason in allowed else None


def safe_context_v2_message(error: Any) -> str | None:
    code, reason = safe_context_v2_error(error)
    if not code:
        return None
    return f"{code}: {reason}" if reason is not None else code


__all__ = ["safe_context_v2_error", "safe_context_v2_message"]
