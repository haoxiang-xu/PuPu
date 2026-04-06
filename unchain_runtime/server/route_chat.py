import json
import threading
import time
from typing import Any, Dict, Iterable, List

from flask import Response, jsonify, request, stream_with_context

from route_blueprint import api_blueprint

_ATTACHMENT_MODALITY_ALIAS_MAP = {
    "file": "pdf",
}


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


def _normalize_stream_error(stream_error: Exception) -> tuple[str, str]:
    message = str(stream_error)
    code = "stream_failed"
    if isinstance(message, str):
        normalized = message.strip()
        if normalized.startswith("memory_unavailable"):
            code = "memory_unavailable"
            if ":" in normalized:
                tail = normalized.split(":", 1)[1].strip()
                if tail:
                    message = tail
    return code, message


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

    approved = bool(payload.get("approved", False))
    reason_raw = payload.get("reason", "")
    reason = reason_raw if isinstance(reason_raw, str) else str(reason_raw or "")

    modified_arguments = payload.get("modified_arguments")
    if modified_arguments is not None and not isinstance(modified_arguments, dict):
        return root._json_error(
            "invalid_request",
            "modified_arguments must be an object when provided",
            400,
        )

    found = root.submit_tool_confirmation(
        confirmation_id=confirmation_id,
        approved=approved,
        reason=reason,
        modified_arguments=modified_arguments,
    )
    if not found:
        return root._json_error(
            "not_found",
            "No pending confirmation found for this ID",
            404,
        )

    return jsonify({"status": "ok"})


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
                    "model": root.get_model_name(options),
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
                        "model": root.get_model_name(options),
                        "started_at": started_at,
                        "trace_level": trace_level,
                        "thread_id": thread_id,
                    },
                    iteration=0,
                    timestamp_ms=started_at,
                ),
            )

            # ── tool timeout tracking (diagnostic) ──
            _TOOL_TIMEOUT_S = 60
            _pending_tools: Dict[str, tuple] = {}  # call_id → (start_time, tool_name)

            for raw_event in root.stream_chat_events(
                message=message,
                history=history,
                attachments=attachments,
                options=options,
                session_id=thread_id,
                cancel_event=confirmation_cancel_event,
            ):
                event_type = str(raw_event.get("type", "event")).strip() or "event"

                # track tool execution time
                if event_type == "tool_call":
                    _cid = raw_event.get("call_id", "")
                    _tname = raw_event.get("tool_name", "")
                    if _cid:
                        _pending_tools[_cid] = (time.time(), _tname)
                elif event_type == "tool_result":
                    _cid = raw_event.get("call_id", "")
                    if _cid and _cid in _pending_tools:
                        _start, _tname = _pending_tools.pop(_cid)
                        _elapsed = time.time() - _start
                        if _elapsed > _TOOL_TIMEOUT_S:
                            import sys
                            print(
                                f"[TOOL TIMEOUT] {_tname} (call_id={_cid}) "
                                f"took {_elapsed:.1f}s (threshold={_TOOL_TIMEOUT_S}s)",
                                file=sys.stderr,
                                flush=True,
                            )
                        elif _elapsed > 10:
                            import sys
                            print(
                                f"[SLOW TOOL] {_tname} (call_id={_cid}) took {_elapsed:.1f}s",
                                file=sys.stderr,
                                flush=True,
                            )

                if event_type == "stream_summary":
                    bundle = raw_event.get("bundle")
                    if isinstance(bundle, dict) and bundle:
                        final_bundle = bundle
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

            # log any tools that never returned a result
            if _pending_tools:
                import sys
                for _cid, (_start, _tname) in _pending_tools.items():
                    _elapsed = time.time() - _start
                    print(
                        f"[TOOL NEVER RESOLVED] {_tname} (call_id={_cid}) "
                        f"pending for {_elapsed:.1f}s when stream ended",
                        file=sys.stderr,
                        flush=True,
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
