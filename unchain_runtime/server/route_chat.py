import json
import re
import threading
import time
from typing import Any, Dict, Iterable, List

from flask import Response, jsonify, request, stream_with_context

from route_blueprint import api_blueprint
from memory_v2_error_contract import safe_context_v2_error

try:
    from unchain.events import RuntimeEventBridge
except ImportError:  # pragma: no cover - runtime source path should be configured by unchain_adapter
    RuntimeEventBridge = None  # type: ignore

_ATTACHMENT_MODALITY_ALIAS_MAP = {
    "file": "pdf",
}
_MEMORY_V2_OWNER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")
_MEMORY_AGENT_PROVIDER_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
_MEMORY_AGENT_CONFIG_FIELDS = frozenset(
    {"displayName", "additionalInstructions", "provider", "modelId"}
)
_UNTRUSTED_MEMORY_V2_OPTION_KEYS = frozenset(
    {
        "enable_memory_v2",
        "memory_v2",
        "memory_v2_mode",
        "memoryV2Mode",
        "owner_chat_id",
    }
)


def _root():
    import routes as routes_module

    return routes_module


def _sse_event(event_name: str, payload: Dict) -> str:
    return (
        f"event: {event_name}\n"
        f"data: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"
    )


def _sanitize_trace_level(raw_trace_level: object) -> str:
    if not isinstance(raw_trace_level, str):
        return "minimal"
    normalized = raw_trace_level.strip().lower()
    return "full" if normalized == "full" else "minimal"


def _sanitize_v4_completion_bundle(raw_bundle: object) -> Dict[str, Any] | None:
    """Keep only renderer-owned completion metadata; never forward raw model state."""

    if not isinstance(raw_bundle, dict):
        return None
    allowed = {
        "model",
        "display_model",
        "active_agent",
        "agent_orchestration",
        "consumed_tokens",
        "input_tokens",
        "output_tokens",
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
        "status",
        "iteration",
        "previous_response_id",
        "memory_v2",
    }
    return {
        key: _redact_memory_v2_value(value)
        for key, value in raw_bundle.items()
        if key in allowed
    }



def _sanitize_trace_value(value: object, trace_level: str, depth: int = 0):
    if trace_level == "full":
        return value

    if depth >= 5:
        return "[truncated]"

    if isinstance(value, str):
        return value if len(value) <= 800 else f"{value[:800]}... [truncated]"

    if isinstance(value, list):
        sanitized = [
            _sanitize_trace_value(item, trace_level, depth + 1)
            for item in value[:20]
        ]
        if len(value) > 20:
            sanitized.append("[truncated]")
        return sanitized

    if isinstance(value, dict):
        sanitized: Dict[str, object] = {}
        for idx, (key, inner_value) in enumerate(value.items()):
            if idx >= 30:
                sanitized["__truncated__"] = True
                break
            sanitized[str(key)] = _sanitize_trace_value(
                inner_value,
                trace_level,
                depth + 1,
            )
        return sanitized

    return value


def _is_invalid_api_key_error(exc: Exception) -> bool:
    if "Authentication" in type(exc).__name__:
        return True
    lower = str(exc).lower()
    return any(
        p in lower
        for p in (
            "invalid api key",
            "incorrect api key",
            "invalid_api_key",
            "incorrect_api_key",
            "authentication_error",
            "invalid x-api-key",
        )
    )


def _normalize_stream_error(stream_error: Exception) -> tuple[str, str]:
    message = str(stream_error)
    explicit_code = getattr(stream_error, "code", "")
    code = (
        explicit_code.strip()
        if isinstance(explicit_code, str) and explicit_code.strip()
        else "stream_failed"
    )
    if isinstance(message, str):
        normalized = message.strip()
        context_v2_code, context_v2_reason = safe_context_v2_error(stream_error)
        if context_v2_code:
            code = context_v2_code
            message = (
                f"{context_v2_code}: {context_v2_reason}"
                if context_v2_reason is not None
                else context_v2_code
            )
        elif normalized.startswith("memory_unavailable"):
            code = "memory_unavailable"
            if ":" in normalized:
                tail = normalized.split(":", 1)[1].strip()
                if tail:
                    message = tail
        elif _is_invalid_api_key_error(stream_error):
            code = "invalid_api_key"
            message = "API key is invalid or has been revoked. Please update your API key in Settings."
    return code, message


def _execution_attempt_cancelled(session_id: str, attempt_id: str) -> bool:
    try:
        import execution_control
    except ImportError:
        return False
    snapshot = getattr(execution_control, "snapshot", None)
    if not callable(snapshot):
        return False
    try:
        value = snapshot(session_id, attempt_id)
    except Exception:
        return False
    return str(getattr(value, "status", "") or "").strip() == "cancelled"


def _is_execution_cancelled_error(error: BaseException) -> bool:
    return bool(
        str(getattr(error, "code", "") or "").strip()
        == "execution_cancelled"
        or type(error).__name__ in {
            "ExecutionCancelledError",
            "ExecutionAttemptCancelled",
        }
    )


def _durable_host_error_response(exc: Exception):
    code = str(getattr(exc, "code", "durable_interaction_failed") or "")
    status_code = int(getattr(exc, "status_code", 409) or 409)
    return (
        jsonify(
            {
                "error": {
                    "code": code,
                    "message": str(exc),
                    "retryable": bool(getattr(exc, "retryable", False)),
                }
            }
        ),
        status_code,
    )


def _build_trace_frame(
    *,
    seq: int,
    event_type: str,
    payload: Dict[str, object],
    run_id: str = "",
    iteration: int = 0,
    timestamp_ms: int | None = None,
) -> Dict[str, object]:
    return {
        "seq": seq,
        "ts": timestamp_ms if isinstance(timestamp_ms, int) else int(time.time() * 1000),
        "run_id": run_id,
        "iteration": iteration,
        "type": event_type,
        "payload": payload,
    }


def _normalize_attachment_modality(raw_modality: object) -> str:
    if not isinstance(raw_modality, str):
        return ""
    modality = raw_modality.strip().lower()
    modality = _ATTACHMENT_MODALITY_ALIAS_MAP.get(modality, modality)
    return modality if modality in {"image", "pdf"} else ""


def _sanitize_attachment_block(raw_block: object) -> Dict[str, object] | None:
    if not isinstance(raw_block, dict):
        return None

    modality = _normalize_attachment_modality(raw_block.get("type"))
    if not modality:
        return None

    source = raw_block.get("source")
    if not isinstance(source, dict):
        return None

    source_type = str(source.get("type", "")).strip().lower()
    if source_type == "url":
        url = str(source.get("url", "")).strip()
        if not url:
            return None
        normalized_source: Dict[str, object] = {"type": "url", "url": url}
        media_type = source.get("media_type")
        if isinstance(media_type, str) and media_type.strip():
            normalized_source["media_type"] = media_type.strip()
        return {"type": modality, "source": normalized_source}

    if source_type == "base64":
        data = str(source.get("data", "")).strip()
        if not data:
            return None

        media_type = str(source.get("media_type", "")).strip().lower()
        if modality == "image":
            if not media_type.startswith("image/"):
                return None
        else:
            if not media_type:
                media_type = "application/pdf"
            if media_type != "application/pdf":
                return None

        normalized_source = {
            "type": "base64",
            "media_type": media_type,
            "data": data,
        }
        if modality == "pdf":
            filename = source.get("filename")
            if isinstance(filename, str) and filename.strip():
                normalized_source["filename"] = filename.strip()
        return {"type": modality, "source": normalized_source}

    if modality == "pdf" and source_type == "file_id":
        file_id = str(source.get("file_id", "")).strip()
        if not file_id:
            return None
        return {
            "type": "pdf",
            "source": {
                "type": "file_id",
                "file_id": file_id,
            },
        }

    return None


def _sanitize_history_content(content: object) -> str | List[Dict[str, object]] | None:
    if isinstance(content, str):
        trimmed = content.strip()
        return trimmed if trimmed else None

    if not isinstance(content, list):
        return None

    normalized_blocks: List[Dict[str, object]] = []
    for block in content:
        if not isinstance(block, dict):
            continue

        block_type = str(block.get("type", "")).strip().lower()
        if block_type in {"text", "input_text"}:
            text = block.get("text")
            if isinstance(text, str) and text.strip():
                normalized_blocks.append({"type": "text", "text": text})
            continue

        attachment_block = _sanitize_attachment_block(block)
        if attachment_block:
            normalized_blocks.append(attachment_block)

    if not normalized_blocks:
        return None
    return normalized_blocks


def _sanitize_history(payload_history: object) -> List[Dict[str, Any]]:
    if not isinstance(payload_history, list):
        return []

    history: List[Dict[str, Any]] = []
    for item in payload_history:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "")).strip()
        content = _sanitize_history_content(item.get("content"))
        if role in {"user", "assistant", "system"} and content is not None:
            history.append({"role": role, "content": content})
    return history


def _redact_memory_v2_value(value: object):
    try:
        from custom_provider import redact_secrets, redact_text
    except ImportError:  # pragma: no cover - server always ships the host redactor
        return value
    keyed = redact_secrets(value)
    if isinstance(keyed, str):
        return redact_text(keyed)
    if isinstance(keyed, list):
        return [_redact_memory_v2_value(item) for item in keyed]
    if isinstance(keyed, dict):
        return {
            str(key): _redact_memory_v2_value(inner)
            for key, inner in keyed.items()
        }
    return keyed


def _sanitize_memory_v2_attachment_metadata(
    payload_attachments: object,
) -> List[Dict[str, object]]:
    metadata: List[Dict[str, object]] = []
    for attachment in _sanitize_attachments(payload_attachments):
        source = attachment.get("source")
        if not isinstance(source, dict):
            continue
        source_type = str(source.get("type") or "")
        safe_source: Dict[str, object] = {"type": source_type}
        for key in ("media_type", "filename", "file_id"):
            value = source.get(key)
            if isinstance(value, str) and value.strip():
                safe_source[key] = _redact_memory_v2_value(value.strip())
        if source_type == "url":
            url = str(source.get("url") or "")
            if url:
                import hashlib

                safe_source["url_sha256"] = hashlib.sha256(
                    url.encode("utf-8")
                ).hexdigest()
        elif source_type == "base64":
            data = str(source.get("data") or "")
            if data:
                import hashlib

                safe_source["content_sha256"] = hashlib.sha256(
                    data.encode("utf-8")
                ).hexdigest()
                safe_source["encoded_chars"] = len(data)
        metadata.append(
            {
                "type": str(attachment.get("type") or ""),
                "source": safe_source,
            }
        )
    return metadata


def _sanitize_context_v2_history(payload_history: object) -> List[Dict[str, Any]]:
    if not isinstance(payload_history, list):
        return []
    history: List[Dict[str, Any]] = []
    for item in payload_history:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip()
        if role not in {"user", "assistant"}:
            continue
        content = _sanitize_history_content(item.get("content"))
        attachments = _sanitize_memory_v2_attachment_metadata(
            item.get("attachments")
        )
        if content is None and not attachments:
            continue
        message: Dict[str, Any] = {
            "role": role,
            "content": _redact_memory_v2_value(content if content is not None else ""),
        }
        if attachments:
            message["attachments"] = attachments
        history.append(message)
    return history


def _sanitize_memory_agent_config(raw_config: object) -> Dict[str, str]:
    """Allowlist the user-tunable Memory Agent surface at the trust boundary."""

    if raw_config is None:
        return {
            "displayName": "Memory Agent",
            "additionalInstructions": "",
            "provider": "",
            "modelId": "",
        }
    if not isinstance(raw_config, dict) or any(
        key not in _MEMORY_AGENT_CONFIG_FIELDS for key in raw_config
    ):
        raise ValueError("memory_agent_config must contain only supported fields")

    def clean(name: str, maximum: int, *, strip: bool = True) -> str:
        value = raw_config.get(name, "")
        if not isinstance(value, str):
            raise ValueError(f"memory_agent_config.{name} must be a string")
        normalized = value.strip() if strip else value
        if len(normalized) > maximum or any(ord(char) < 32 and char not in "\n\t" for char in normalized):
            raise ValueError(f"memory_agent_config.{name} is invalid")
        return normalized

    display_name = clean("displayName", 120) or "Memory Agent"
    additional_instructions = clean("additionalInstructions", 8_192, strip=False)
    provider = clean("provider", 64).lower()
    model_id = clean("modelId", 255)
    if provider and not _MEMORY_AGENT_PROVIDER_RE.fullmatch(provider):
        raise ValueError("memory_agent_config.provider is invalid")
    if bool(provider) != bool(model_id):
        raise ValueError(
            "memory_agent_config.provider and modelId must be selected together"
        )
    return {
        "displayName": display_name,
        "additionalInstructions": additional_instructions,
        "provider": provider,
        "modelId": model_id,
    }


def _sanitize_attachments(payload_attachments: object) -> List[Dict[str, object]]:
    if not isinstance(payload_attachments, list):
        return []

    attachments: List[Dict[str, object]] = []
    for item in payload_attachments:
        sanitized = _sanitize_attachment_block(item)
        if sanitized:
            attachments.append(sanitized)
    return attachments


@api_blueprint.post("/chat/tool/confirmation")
def chat_tool_confirmation() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    confirmation_id_raw = payload.get("confirmation_id")
    confirmation_id = (
        confirmation_id_raw.strip()
        if isinstance(confirmation_id_raw, str)
        else ""
    )
    if not confirmation_id:
        return root._json_error("invalid_request", "confirmation_id is required", 400)

    approved_raw = payload.get("approved")
    if not isinstance(approved_raw, bool):
        return root._json_error(
            "invalid_request",
            "approved must be a boolean",
            400,
        )
    approved = approved_raw
    reason_raw = payload.get("reason", "")
    reason = reason_raw if isinstance(reason_raw, str) else str(reason_raw or "")

    modified_arguments = payload.get("modified_arguments")
    if modified_arguments is not None and not isinstance(modified_arguments, dict):
        return root._json_error(
            "invalid_request",
            "modified_arguments must be an object when provided",
            400,
        )

    session_id_raw = payload.get("session_id") or payload.get("sessionId")
    session_id = (
        session_id_raw.strip()
        if isinstance(session_id_raw, str)
        else ""
    )
    durable_result = None
    durable_not_found = None
    if session_id:
        try:
            durable_result = root.record_interaction_receipt(
                session_id=session_id,
                interaction_id=confirmation_id,
                approved=approved,
                reason=reason,
                modified_arguments=modified_arguments,
            )
        except root.DurableInteractionHostError as exc:
            if exc.code == "interaction_not_found":
                durable_not_found = exc
            else:
                return _durable_host_error_response(exc)

    try:
        found = root.submit_tool_confirmation(
            confirmation_id=confirmation_id,
            approved=approved,
            reason=reason,
            modified_arguments=modified_arguments,
            durable_receipt=durable_result,
        )
    except root.DurableInteractionHostError as exc:
        return _durable_host_error_response(exc)
    except Exception:
        return root._json_error(
            "interaction_resolution_persistence_failed",
            "Interaction resolution could not be durably recorded",
            500,
        )
    if durable_result is not None:
        result = dict(durable_result)
        result["durable"] = True
        result["disposition"] = (
            "live_continues" if found else "receipt_recorded"
        )
        return jsonify(result)
    if found:
        return jsonify(
            {
                "status": "ok",
                "disposition": "live_only",
                "durable": False,
                "interaction_id": confirmation_id,
            }
        )
    if durable_not_found is not None:
        return _durable_host_error_response(durable_not_found)
    return root._json_error(
        "not_found",
        "No live confirmation found and session_id was not provided",
        404,
    )


@api_blueprint.get("/chat/interactions/pending")
def chat_pending_interaction() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    session_id = str(request.args.get("session_id") or "").strip()
    if not session_id:
        return root._json_error(
            "invalid_request",
            "session_id is required",
            400,
        )
    try:
        return jsonify(root.get_pending_interaction(session_id))
    except root.DurableInteractionHostError as exc:
        return _durable_host_error_response(exc)
    except Exception as exc:
        return root._json_error(
            "durable_interaction_lookup_failed",
            str(exc),
            500,
        )


@api_blueprint.post("/chat/executions/cancel")
def chat_execution_cancel() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    execution_id = str(
        payload.get("execution_id")
        or payload.get("session_id")
        or payload.get("threadId")
        or ""
    ).strip()
    attempt_id = str(payload.get("attempt_id") or "").strip()
    source_attempt_id = str(payload.get("source_attempt_id") or "").strip()
    if not execution_id:
        return root._json_error(
            "invalid_request",
            "execution_id is required",
            400,
        )
    if not attempt_id:
        return root._json_error(
            "invalid_request",
            "attempt_id is required",
            400,
        )

    reason_raw = payload.get("reason", "user_stop")
    if not isinstance(reason_raw, str):
        return root._json_error(
            "invalid_request",
            "reason must be a string",
            400,
        )
    reason = reason_raw.strip() or "user_stop"

    idempotency_key = payload.get("idempotency_key")
    if idempotency_key is not None and not isinstance(idempotency_key, str):
        return root._json_error(
            "invalid_request",
            "idempotency_key must be a string when provided",
            400,
        )

    try:
        return jsonify(
            root.cancel_chat_execution(
                session_id=execution_id,
                attempt_id=attempt_id,
                source_attempt_id=source_attempt_id,
                reason=reason,
            )
        )
    except root.DurableInteractionHostError as exc:
        return _durable_host_error_response(exc)
    except Exception as exc:
        return root._json_error(
            str(getattr(exc, "code", "execution_cancel_failed") or ""),
            str(exc),
            int(getattr(exc, "status_code", 500) or 500),
        )


@api_blueprint.post("/chat/stream")
def chat_stream() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "")).strip()
    attachments = _sanitize_attachments(payload.get("attachments"))
    if not message and not attachments:
        return root._json_error(
            "invalid_request",
            "message or attachments is required",
            400,
        )

    incoming_thread_id = payload.get("threadId") or payload.get("thread_id")
    thread_id = str(incoming_thread_id).strip() if incoming_thread_id else ""
    if not thread_id:
        thread_id = f"thread-{int(time.time() * 1000)}"

    history = _sanitize_history(payload.get("history"))
    options = payload.get("options", {}) if isinstance(payload.get("options"), dict) else {}

    def stream_events() -> Iterable[str]:
        started_at = int(time.time() * 1000)

        try:
            yield _sse_event(
                "meta",
                {
                    "thread_id": thread_id,
                    "model": root.get_display_model_id(options),
                    "started_at": started_at,
                },
            )

            for delta in root.stream_chat(
                message=message,
                history=history,
                attachments=attachments,
                options=options,
                session_id=thread_id,
            ):
                yield _sse_event("token", {"delta": str(delta)})

            yield _sse_event(
                "done",
                {
                    "thread_id": thread_id,
                    "finished_at": int(time.time() * 1000),
                },
            )
        except GeneratorExit:  # pragma: no cover
            return
        except Exception as stream_error:
            code, normalized_message = _normalize_stream_error(stream_error)
            yield _sse_event(
                "error",
                {
                    "code": code,
                    "message": normalized_message,
                },
            )

    return Response(
        stream_with_context(stream_events()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@api_blueprint.post("/chat/stream/v2")
def chat_stream_v2() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "")).strip()
    attachments = _sanitize_attachments(payload.get("attachments"))
    if not message and not attachments:
        return root._json_error(
            "invalid_request",
            "message or attachments is required",
            400,
        )

    incoming_thread_id = payload.get("threadId") or payload.get("thread_id")
    thread_id = str(incoming_thread_id).strip() if incoming_thread_id else ""
    if not thread_id:
        thread_id = f"thread-{int(time.time() * 1000)}"

    history = _sanitize_history(payload.get("history"))
    options = payload.get("options", {}) if isinstance(payload.get("options"), dict) else {}
    trace_level = _sanitize_trace_level(
        payload.get("trace_level")
        or options.get("trace_level")
        or "minimal"
    )

    def stream_events() -> Iterable[str]:
        seq = 0
        started_at = int(time.time() * 1000)
        last_iteration = 0
        final_bundle: Dict[str, object] | None = None
        confirmation_cancel_event = threading.Event()

        def cancel_pending_confirmations() -> None:
            confirmation_cancel_event.set()
            root.cancel_tool_confirmations(confirmation_cancel_event)

        try:
            seq += 1
            yield _sse_event(
                "frame",
                _build_trace_frame(
                    seq=seq,
                    event_type="stream_started",
                    payload={
                        "model": root.get_display_model_id(options),
                        "started_at": started_at,
                        "trace_level": trace_level,
                        "thread_id": thread_id,
                    },
                    iteration=0,
                    timestamp_ms=started_at,
                ),
            )

            for raw_event in root.stream_chat_events(
                message=message,
                history=history,
                attachments=attachments,
                options=options,
                session_id=thread_id,
                cancel_event=confirmation_cancel_event,
            ):
                event_type = str(raw_event.get("type", "event")).strip() or "event"

                if event_type == "stream_summary":
                    final_bundle = _sanitize_v4_completion_bundle(
                        raw_event.get("bundle")
                    )
                    continue

                payload_data = {
                    key: value
                    for key, value in raw_event.items()
                    if key not in {"type", "run_id", "iteration", "timestamp"}
                }
                # Skip sanitization for frames that carry structured data needed by the UI:
                # - tool_call: interact_config.options for selections, confirmation metadata
                # - tool_result: subagent agent_name/status for branch matching
                # - subagent_*: lifecycle metadata (child_run_id, status, subagent_id)
                # - continuation_request: confirmation_id for the continue/stop flow
                _UNSANITIZED_EVENT_TYPES = (
                    "final_message", "token_delta", "request_messages",
                    "tool_call", "tool_result", "continuation_request",
                    "workflow_step_final", "workflow_step_delta",
                    "subagent_spawned", "subagent_started", "subagent_completed",
                    "subagent_failed", "subagent_handoff", "subagent_batch_started",
                    "subagent_batch_joined", "subagent_clarification_requested",
                )
                if event_type in _UNSANITIZED_EVENT_TYPES:
                    sanitized_payload = payload_data
                else:
                    sanitized_payload = _sanitize_trace_value(payload_data, trace_level)

                run_id = raw_event.get("run_id")
                normalized_run_id = run_id if isinstance(run_id, str) else ""
                iteration = raw_event.get("iteration")
                normalized_iteration = (
                    iteration if isinstance(iteration, int) else last_iteration
                )
                last_iteration = normalized_iteration
                raw_ts = raw_event.get("timestamp")
                if isinstance(raw_ts, (int, float)):
                    event_ts_ms = int(float(raw_ts) * 1000)
                else:
                    event_ts_ms = int(time.time() * 1000)

                seq += 1
                yield _sse_event(
                    "frame",
                    _build_trace_frame(
                        seq=seq,
                        event_type=event_type,
                        payload=sanitized_payload,
                        run_id=normalized_run_id,
                        iteration=normalized_iteration,
                        timestamp_ms=event_ts_ms,
                    ),
                )

            seq += 1
            finished_at = int(time.time() * 1000)
            done_payload: Dict[str, object] = {"finished_at": finished_at}
            if isinstance(final_bundle, dict) and final_bundle:
                done_payload["bundle"] = final_bundle
            yield _sse_event(
                "frame",
                _build_trace_frame(
                    seq=seq,
                    event_type="done",
                    payload=done_payload,
                    iteration=last_iteration,
                    timestamp_ms=finished_at,
                ),
            )
        except GeneratorExit:  # pragma: no cover
            cancel_pending_confirmations()
            return
        except Exception as stream_error:
            cancel_pending_confirmations()
            code, normalized_message = _normalize_stream_error(stream_error)
            seq += 1
            error_ts = int(time.time() * 1000)
            yield _sse_event(
                "frame",
                _build_trace_frame(
                    seq=seq,
                    event_type="error",
                    payload={
                        "code": code,
                        "message": normalized_message,
                    },
                    iteration=last_iteration,
                    timestamp_ms=error_ts,
                ),
            )
        finally:
            cancel_pending_confirmations()

    return Response(
        stream_with_context(stream_events()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@api_blueprint.post("/chat/stream/v4")
def chat_stream_v4() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)
    if RuntimeEventBridge is None:
        return root._json_error(
            "runtime_events_unavailable",
            "RuntimeEventBridge is unavailable",
            500,
        )

    payload = request.get_json(silent=True) or {}
    attempt_id = str(payload.get("attempt_id") or "").strip()
    if not attempt_id:
        return root._json_error(
            "invalid_request",
            "attempt_id is required for /chat/stream/v4",
            400,
        )
    mode = str(payload.get("mode") or "").strip().lower()
    resume_interaction = mode == "resume_interaction"
    message = str(payload.get("message", "")).strip()
    attachments = _sanitize_attachments(payload.get("attachments"))
    if not resume_interaction and not message and not attachments:
        return root._json_error(
            "invalid_request",
            "message or attachments is required",
            400,
        )

    incoming_thread_id = payload.get("threadId") or payload.get("thread_id")
    thread_id = str(incoming_thread_id).strip() if incoming_thread_id else ""
    if resume_interaction and not thread_id:
        return root._json_error(
            "invalid_request",
            "threadId is required for resume_interaction mode",
            400,
        )
    if not thread_id:
        thread_id = f"thread-{int(time.time() * 1000)}"

    interaction_id = str(payload.get("interaction_id") or "").strip()
    if resume_interaction and not interaction_id:
        return root._json_error(
            "invalid_request",
            "interaction_id is required for resume_interaction mode",
            400,
        )
    source_attempt_id = str(payload.get("source_attempt_id") or "").strip()
    if resume_interaction and not source_attempt_id:
        return root._json_error(
            "invalid_request",
            "source_attempt_id is required for resume_interaction mode",
            400,
        )

    history = _sanitize_history(payload.get("history"))
    options = (
        dict(payload.get("options", {}))
        if isinstance(payload.get("options"), dict)
        else {}
    )
    for key in list(options):
        if key.startswith("_memory_v2_") or key in _UNTRUSTED_MEMORY_V2_OPTION_KEYS:
            options.pop(key, None)

    memory_v2_requested_raw = payload.get("memory_v2_requested", False)
    if not isinstance(memory_v2_requested_raw, bool):
        return root._json_error(
            "invalid_request",
            "memory_v2_requested must be a boolean",
            400,
        )
    memory_v2_requested = memory_v2_requested_raw is True
    options["_memory_v2_requested"] = memory_v2_requested
    if memory_v2_requested:
        owner_chat_id_raw = payload.get("owner_chat_id")
        owner_chat_id = (
            owner_chat_id_raw.strip()
            if isinstance(owner_chat_id_raw, str)
            else ""
        )
        if not _MEMORY_V2_OWNER_RE.fullmatch(owner_chat_id):
            return root._json_error(
                "context_v2_invalid_owner_chat_id",
                "owner_chat_id is required and must be a valid chat identifier",
                400,
            )
        try:
            memory_agent_config = _sanitize_memory_agent_config(
                payload.get("memory_agent_config")
            )
        except ValueError as exc:
            return root._json_error(
                "context_v2_invalid_memory_agent_config",
                str(exc),
                400,
            )
        options["_memory_v2_owner_chat_id"] = owner_chat_id
        options["_memory_v2_attempt_id"] = attempt_id
        options["_memory_v2_memory_agent_config"] = memory_agent_config
        if source_attempt_id:
            options["_memory_v2_source_attempt_id"] = source_attempt_id
        context_v2_history = _sanitize_context_v2_history(
            payload.get("context_v2_history")
        )
        if context_v2_history:
            options["_memory_v2_bootstrap_history"] = context_v2_history
        current_user_message: Dict[str, Any] = {
            "role": "user",
            "content": _redact_memory_v2_value(message),
        }
        current_attachments = _sanitize_memory_v2_attachment_metadata(attachments)
        if current_attachments:
            current_user_message["attachments"] = current_attachments
        if message or current_attachments:
            options["_memory_v2_current_user_message"] = current_user_message
    trace_level = _sanitize_trace_level(
        payload.get("trace_level")
        or options.get("trace_level")
        or "minimal"
    )

    def stream_events() -> Iterable[str]:
        started_at = int(time.time() * 1000)
        final_bundle: Dict[str, object] | None = None
        confirmation_cancel_event = threading.Event()
        bridge = RuntimeEventBridge(
            session_id=thread_id,
            root_run_id=attempt_id,
            root_agent_id="developer",
            trace_level=trace_level,
        )

        def cancel_pending_confirmations() -> None:
            confirmation_cancel_event.set()
            root.cancel_tool_confirmations(confirmation_cancel_event)

        try:
            session_event = bridge.emit_session_started(
                {
                    "model": root.get_display_model_id(options),
                    "started_at": started_at,
                    "trace_level": trace_level,
                    "thread_id": thread_id,
                    "execution_id": thread_id,
                    "attempt_id": attempt_id,
                    "resume_interaction": resume_interaction,
                }
            )
            yield _sse_event("runtime_event", session_event.to_dict())

            event_source = (
                root.resume_chat_interaction_events(
                    session_id=thread_id,
                    interaction_id=interaction_id,
                    options=options,
                    cancel_event=confirmation_cancel_event,
                    attempt_id=attempt_id,
                    source_attempt_id=source_attempt_id,
                )
                if resume_interaction
                else root.stream_chat_events(
                    message=message,
                    history=history,
                    attachments=attachments,
                    options=options,
                    session_id=thread_id,
                    cancel_event=confirmation_cancel_event,
                    attempt_id=attempt_id,
                )
            )
            for raw_event in event_source:
                if not isinstance(raw_event, dict):
                    continue
                if raw_event.get("type") == "stream_summary":
                    final_bundle = _sanitize_v4_completion_bundle(
                        raw_event.get("bundle")
                    )
                    continue
                for runtime_event in bridge.normalize(raw_event):
                    yield _sse_event("runtime_event", runtime_event.to_dict())

            cancelled = _execution_attempt_cancelled(thread_id, attempt_id)
            done_payload: Dict[str, object] = {
                "finished_at": int(time.time() * 1000),
                "execution_id": thread_id,
                "attempt_id": attempt_id,
                "cancelled": cancelled,
                "diagnostics": bridge.diagnostics(),
            }
            if isinstance(final_bundle, dict) and final_bundle:
                done_payload["bundle"] = final_bundle
            yield _sse_event(
                "done",
                done_payload,
            )
        except GeneratorExit:  # pragma: no cover
            cancel_pending_confirmations()
            return
        except Exception as stream_error:
            cancel_pending_confirmations()
            if _is_execution_cancelled_error(
                stream_error
            ) or _execution_attempt_cancelled(thread_id, attempt_id):
                yield _sse_event(
                    "done",
                    {
                        "finished_at": int(time.time() * 1000),
                        "execution_id": thread_id,
                        "attempt_id": attempt_id,
                        "cancelled": True,
                        "diagnostics": bridge.diagnostics(),
                    },
                )
                return
            code, normalized_message = _normalize_stream_error(stream_error)
            failure_event = bridge.emit_transport_failure(
                normalized_message,
                code=code,
            )
            yield _sse_event("runtime_event", failure_event.to_dict())
            yield _sse_event(
                "done",
                {
                    "finished_at": int(time.time() * 1000),
                    "execution_id": thread_id,
                    "attempt_id": attempt_id,
                    "cancelled": False,
                    "error": {
                        "code": code,
                        "message": normalized_message,
                    },
                    "diagnostics": bridge.diagnostics(),
                },
            )
        finally:
            cancel_pending_confirmations()

    return Response(
        stream_with_context(stream_events()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
