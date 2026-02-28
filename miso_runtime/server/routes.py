import json
import time
from typing import Any, Dict, Iterable, List

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

from miso_adapter import (
    get_capability_catalog,
    get_default_model_capabilities,
    get_model_capability_catalog,
    get_model_name,
    get_runtime_config,
    get_toolkit_catalog,
    stream_chat,
    stream_chat_events,
)

api_blueprint = Blueprint("miso_api", __name__)
_ATTACHMENT_MODALITY_ALIAS_MAP = {
    "file": "pdf",
}


def _sse_event(event_name: str, payload: Dict) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"


_TRACE_STAGE_BY_EVENT_TYPE = {
    "run_started": "agent",
    "iteration_started": "agent",
    "iteration_completed": "agent",
    "run_completed": "agent",
    "run_max_iterations": "agent",
    "reasoning": "agent",
    "observation": "agent",
    "token_delta": "model",
    "final_message": "model",
    "tool_call": "tool",
    "tool_result": "tool",
    "error": "stream",
    "done": "stream",
}


def _sanitize_trace_level(raw_trace_level: object) -> str:
    if not isinstance(raw_trace_level, str):
        return "minimal"
    normalized = raw_trace_level.strip().lower()
    return "full" if normalized == "full" else "minimal"


def _trace_stage(event_type: str) -> str:
    return _TRACE_STAGE_BY_EVENT_TYPE.get(event_type, "agent")


def _sanitize_trace_value(value: object, trace_level: str, depth: int = 0):
    if trace_level == "full":
        return value

    if depth >= 5:
        return "[truncated]"

    if isinstance(value, str):
        return value if len(value) <= 800 else f"{value[:800]}... [truncated]"

    if isinstance(value, list):
        limited_items = value[:20]
        sanitized = [
            _sanitize_trace_value(item, trace_level, depth + 1)
            for item in limited_items
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


def _build_trace_frame(
    *,
    seq: int,
    thread_id: str,
    event_type: str,
    payload: Dict[str, object],
    run_id: str = "",
    iteration: int = 0,
    timestamp_ms: int | None = None,
) -> Dict[str, object]:
    return {
        "seq": seq,
        "ts": timestamp_ms if isinstance(timestamp_ms, int) else int(time.time() * 1000),
        "thread_id": thread_id,
        "run_id": run_id,
        "iteration": iteration,
        "stage": _trace_stage(event_type),
        "type": event_type,
        "payload": payload,
    }


def _is_authorized() -> bool:
    expected_token = current_app.config.get("MISO_AUTH_TOKEN", "")
    if not expected_token:
        return True
    provided_token = request.headers.get("x-miso-auth", "")
    return provided_token == expected_token


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
                normalized_blocks.append(
                    {
                        "type": "text",
                        "text": text,
                    }
                )
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


def _sanitize_attachments(payload_attachments: object) -> List[Dict[str, object]]:
    if not isinstance(payload_attachments, list):
        return []

    attachments: List[Dict[str, object]] = []
    for item in payload_attachments:
        sanitized = _sanitize_attachment_block(item)
        if sanitized:
            attachments.append(sanitized)
    return attachments


@api_blueprint.get("/health")
def health() -> Response:
    return jsonify(
        {
            "status": "ok",
            "version": current_app.config.get("MISO_VERSION", "0.1.0-dev"),
            "model": get_model_name(),
            "threaded": True,
        }
    )


@api_blueprint.get("/models/catalog")
def models_catalog() -> Response:
    if not _is_authorized():
        return jsonify(
            {
                "error": {
                    "code": "unauthorized",
                    "message": "Invalid auth token",
                }
            }
        ), 401

    runtime = get_runtime_config()
    provider_catalog = get_capability_catalog()
    model_capabilities = get_model_capability_catalog()
    active_provider = str(runtime.get("provider", "ollama")).strip().lower() or "ollama"
    active_model = str(runtime.get("model", "")).strip()
    active_model_id = f"{active_provider}:{active_model}"
    active_capabilities = model_capabilities.get(active_model_id) or get_default_model_capabilities()

    return jsonify(
        {
            "active": {
                "provider": active_provider,
                "model": active_model,
                "model_id": active_model_id,
                "capabilities": active_capabilities,
            },
            "providers": {
                "openai": provider_catalog.get("openai", []),
                "anthropic": provider_catalog.get("anthropic", []),
                "ollama": provider_catalog.get("ollama", []),
            },
            "model_capabilities": model_capabilities,
        }
    )


@api_blueprint.get("/toolkits/catalog")
def toolkits_catalog() -> Response:
    if not _is_authorized():
        return jsonify(
            {
                "error": {
                    "code": "unauthorized",
                    "message": "Invalid auth token",
                }
            }
        ), 401

    return jsonify(get_toolkit_catalog())


@api_blueprint.post("/chat/stream")
def chat_stream() -> Response:
    if not _is_authorized():
        return jsonify(
            {
                "error": {
                    "code": "unauthorized",
                    "message": "Invalid auth token",
                }
            }
        ), 401

    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "")).strip()
    attachments = _sanitize_attachments(payload.get("attachments"))
    if not message and not attachments:
        return jsonify(
            {
                "error": {
                    "code": "invalid_request",
                    "message": "message or attachments is required",
                }
            }
        ), 400

    incoming_thread_id = payload.get("threadId") or payload.get("thread_id")
    thread_id = str(incoming_thread_id).strip() if incoming_thread_id else ""
    if not thread_id:
        thread_id = f"thread-{int(time.time() * 1000)}"

    history = _sanitize_history(payload.get("history"))
    options = payload.get("options", {}) if isinstance(payload.get("options"), dict) else {}

    def stream_events() -> Iterable[str]:
        completion_tokens = 0
        completion_chars = 0
        started_at = int(time.time() * 1000)

        try:
            yield _sse_event(
                "meta",
                {
                    "thread_id": thread_id,
                    "model": get_model_name(options),
                    "started_at": started_at,
                },
            )

            for delta in stream_chat(
                message=message,
                history=history,
                attachments=attachments,
                options=options,
            ):
                normalized_delta = str(delta)
                completion_chars += len(normalized_delta)
                completion_tokens += max(1, len(normalized_delta.strip().split()))
                yield _sse_event("token", {"delta": normalized_delta})

            yield _sse_event(
                "done",
                {
                    "thread_id": thread_id,
                    "finished_at": int(time.time() * 1000),
                    "usage": {
                        "prompt_tokens": max(1, len(message.split())),
                        "completion_tokens": completion_tokens,
                        "completion_chars": completion_chars,
                    },
                },
            )
        except GeneratorExit:  # pragma: no cover
            return
        except Exception as stream_error:
            yield _sse_event(
                "error",
                {
                    "code": "stream_failed",
                    "message": str(stream_error),
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
    if not _is_authorized():
        return jsonify(
            {
                "error": {
                    "code": "unauthorized",
                    "message": "Invalid auth token",
                }
            }
        ), 401

    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "")).strip()
    attachments = _sanitize_attachments(payload.get("attachments"))
    if not message and not attachments:
        return jsonify(
            {
                "error": {
                    "code": "invalid_request",
                    "message": "message or attachments is required",
                }
            }
        ), 400

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
        completion_tokens = 0
        completion_chars = 0
        started_at = int(time.time() * 1000)

        try:
            seq += 1
            yield _sse_event(
                "frame",
                _build_trace_frame(
                    seq=seq,
                    thread_id=thread_id,
                    event_type="stream_started",
                    payload={
                        "model": get_model_name(options),
                        "started_at": started_at,
                        "trace_level": trace_level,
                    },
                    iteration=0,
                    timestamp_ms=started_at,
                ),
            )

            for raw_event in stream_chat_events(
                message=message,
                history=history,
                attachments=attachments,
                options=options,
            ):
                event_type = str(raw_event.get("type", "event")).strip() or "event"

                payload_data = {
                    key: value
                    for key, value in raw_event.items()
                    if key not in {"type", "run_id", "iteration", "timestamp"}
                }
                sanitized_payload = _sanitize_trace_value(payload_data, trace_level)

                delta = raw_event.get("delta")
                if event_type == "token_delta" and isinstance(delta, str):
                    completion_chars += len(delta)
                    completion_tokens += max(1, len(delta.strip().split()))

                run_id = raw_event.get("run_id")
                normalized_run_id = run_id if isinstance(run_id, str) else ""
                iteration = raw_event.get("iteration")
                normalized_iteration = iteration if isinstance(iteration, int) else 0
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
                        thread_id=thread_id,
                        event_type=event_type,
                        payload=sanitized_payload,
                        run_id=normalized_run_id,
                        iteration=normalized_iteration,
                        timestamp_ms=event_ts_ms,
                    ),
                )

            seq += 1
            finished_at = int(time.time() * 1000)
            yield _sse_event(
                "frame",
                _build_trace_frame(
                    seq=seq,
                    thread_id=thread_id,
                    event_type="done",
                    payload={
                        "finished_at": finished_at,
                        "usage": {
                            "prompt_tokens": max(1, len(message.split())),
                            "completion_tokens": completion_tokens,
                            "completion_chars": completion_chars,
                        },
                    },
                    iteration=0,
                    timestamp_ms=finished_at,
                ),
            )
        except GeneratorExit:  # pragma: no cover
            return
        except Exception as stream_error:
            seq += 1
            error_ts = int(time.time() * 1000)
            yield _sse_event(
                "frame",
                _build_trace_frame(
                    seq=seq,
                    thread_id=thread_id,
                    event_type="error",
                    payload={
                        "code": "stream_failed",
                        "message": str(stream_error),
                    },
                    iteration=0,
                    timestamp_ms=error_ts,
                ),
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
