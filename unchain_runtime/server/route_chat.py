import json
import threading
import time
from typing import Any, Dict, Iterable, List

from flask import Response, jsonify, request, stream_with_context

from route_blueprint import api_blueprint

try:
    from unchain.events import RuntimeEventBridge
except ImportError:  # pragma: no cover - runtime source path should be configured by unchain_adapter
    RuntimeEventBridge = None  # type: ignore

_ATTACHMENT_MODALITY_ALIAS_MAP = {
    "file": "pdf",
}
_PLAN_STEP_MARKERS = {
    "pending": "[ ]",
    "in_progress": "[~]",
    "completed": "[x]",
}
_PLAN_STATUSES = {"draft", "finalized"}


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
    code = "stream_failed"
    if isinstance(message, str):
        normalized = message.strip()
        if normalized.startswith("memory_unavailable"):
            code = "memory_unavailable"
            if ":" in normalized:
                tail = normalized.split(":", 1)[1].strip()
                if tail:
                    message = tail
        elif _is_invalid_api_key_error(stream_error):
            code = "invalid_api_key"
            message = "API key is invalid or has been revoked. Please update your API key in Settings."
    return code, message


def _coerce_plan_text(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _coerce_plan_text_list(value: object) -> list[str]:
    if isinstance(value, str):
        stripped = value.strip()
        return [stripped] if stripped else []
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            result.append(item.strip())
    return result


def _coerce_plan_steps(value: object) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    result: list[dict[str, str]] = []
    for item in value:
        if isinstance(item, str):
            step = item.strip()
            status = "pending"
        elif isinstance(item, dict):
            step = str(item.get("step") or item.get("title") or "").strip()
            status = str(item.get("status") or "pending").strip()
        else:
            continue
        if not step:
            continue
        if status not in _PLAN_STEP_MARKERS:
            status = "pending"
        result.append({"step": step, "status": status})
    return result


def _sanitize_plan_state(raw: object, *, fallback_plan_id: str = "") -> dict[str, object] | None:
    if not isinstance(raw, dict):
        return None
    plan_id = _coerce_plan_text(raw.get("plan_id")) or fallback_plan_id.strip()
    title = _coerce_plan_text(raw.get("title"))
    goal = _coerce_plan_text(raw.get("goal"))
    if not plan_id or not title or not goal:
        return None
    status = _coerce_plan_text(raw.get("status")) or "draft"
    if status not in _PLAN_STATUSES:
        status = "draft"
    try:
        revision = max(1, int(raw.get("revision") or 1))
    except Exception:
        revision = 1
    return {
        "plan_id": plan_id,
        "title": title,
        "goal": goal,
        "constraints": _coerce_plan_text_list(raw.get("constraints")),
        "summary": _coerce_plan_text(raw.get("summary")),
        "steps": _coerce_plan_steps(raw.get("steps")),
        "key_changes": _coerce_plan_text_list(raw.get("key_changes")),
        "public_interfaces": _coerce_plan_text_list(raw.get("public_interfaces")),
        "test_cases": _coerce_plan_text_list(raw.get("test_cases")),
        "assumptions": _coerce_plan_text_list(raw.get("assumptions")),
        "references": _coerce_plan_text_list(raw.get("references")),
        "open_questions": _coerce_plan_text_list(raw.get("open_questions")),
        "status": status,
        "revision": revision,
        "created_at": _coerce_plan_text(raw.get("created_at")),
        "updated_at": _coerce_plan_text(raw.get("updated_at")),
    }


def _append_plan_list_section(lines: list[str], title: str, values: list[str]) -> None:
    if not values:
        return
    lines.extend(["", f"## {title}"])
    lines.extend(f"- {item}" for item in values)


def _render_plan_markdown(plan: dict[str, object]) -> str:
    lines = [
        f"# {plan['title']}",
        "",
        "## Summary",
        str(plan.get("summary") or plan.get("goal") or ""),
        "",
        "## Goal",
        str(plan.get("goal") or ""),
    ]
    _append_plan_list_section(lines, "Constraints", plan["constraints"])  # type: ignore[arg-type]
    steps = plan.get("steps")
    if isinstance(steps, list) and steps:
        lines.extend(["", "## Steps"])
        for step in steps:
            if not isinstance(step, dict):
                continue
            status = str(step.get("status") or "pending")
            marker = _PLAN_STEP_MARKERS.get(status, "[ ]")
            lines.append(f"- {marker} {step.get('step')}")
    _append_plan_list_section(lines, "Key Changes", plan["key_changes"])  # type: ignore[arg-type]
    _append_plan_list_section(lines, "Public Interfaces", plan["public_interfaces"])  # type: ignore[arg-type]
    _append_plan_list_section(lines, "Test Cases", plan["test_cases"])  # type: ignore[arg-type]
    _append_plan_list_section(lines, "Assumptions", plan["assumptions"])  # type: ignore[arg-type]
    _append_plan_list_section(lines, "References", plan["references"])  # type: ignore[arg-type]
    _append_plan_list_section(lines, "Open Questions", plan["open_questions"])  # type: ignore[arg-type]
    return "\n".join(lines).rstrip()


def _plan_artifact(plan: dict[str, object]) -> dict[str, object]:
    return {
        "type": "plan_doc",
        "plan_id": plan["plan_id"],
        "revision": plan["revision"],
        "status": plan["status"],
        "title": plan["title"],
    }


def _plan_doc(plan: dict[str, object]) -> dict[str, object]:
    artifact = _plan_artifact(plan)
    return {
        "plan_id": plan["plan_id"],
        "status": plan["status"],
        "revision": plan["revision"],
        "plan": plan,
        "markdown": _render_plan_markdown(plan),
        "artifact": artifact,
        "artifacts": [artifact],
    }


def _load_session_plan_docs(thread_id: str) -> tuple[str, list[dict[str, object]]]:
    import memory_factory

    data_dir = memory_factory._normalize_data_dir(memory_factory._data_dir())
    if not data_dir:
        return "", []
    state = memory_factory._load_session_state(data_dir, thread_id)
    plans_state = state.get("plans")
    if not isinstance(plans_state, dict):
        return "", []
    items = plans_state.get("items")
    if not isinstance(items, dict):
        return "", []
    docs: list[dict[str, object]] = []
    for raw_plan_id, raw_plan in items.items():
        plan = _sanitize_plan_state(
            raw_plan,
            fallback_plan_id=str(raw_plan_id or ""),
        )
        if plan is not None:
            docs.append(_plan_doc(plan))
    active_plan_id = _coerce_plan_text(plans_state.get("active_plan_id"))
    if active_plan_id not in {str(doc.get("plan_id") or "") for doc in docs}:
        active_plan_id = ""
    return active_plan_id, docs


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


@api_blueprint.get("/chat/plans")
def list_chat_plans() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    thread_id = str(
        request.args.get("threadId") or request.args.get("thread_id") or ""
    ).strip()
    if not thread_id:
        return root._json_error("invalid_request", "threadId is required", 400)

    active_plan_id, docs = _load_session_plan_docs(thread_id)
    return jsonify(
        {
            "thread_id": thread_id,
            "active_plan_id": active_plan_id,
            "plans": docs,
            "count": len(docs),
        }
    )


@api_blueprint.get("/chat/plans/<plan_id>")
def read_chat_plan(plan_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    thread_id = str(
        request.args.get("threadId") or request.args.get("thread_id") or ""
    ).strip()
    clean_plan_id = str(plan_id or "").strip()
    if not thread_id:
        return root._json_error("invalid_request", "threadId is required", 400)
    if not clean_plan_id:
        return root._json_error("invalid_request", "plan_id is required", 400)

    active_plan_id, docs = _load_session_plan_docs(thread_id)
    for doc in docs:
        if doc.get("plan_id") == clean_plan_id:
            return jsonify(
                {
                    "thread_id": thread_id,
                    "active_plan_id": active_plan_id,
                    **doc,
                }
            )
    return root._json_error("not_found", f"unknown plan_id: {clean_plan_id}", 404)


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


@api_blueprint.post("/chat/stream/v3")
def chat_stream_v3() -> Response:
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
        started_at = int(time.time() * 1000)
        confirmation_cancel_event = threading.Event()
        bridge = RuntimeEventBridge(
            session_id=thread_id,
            root_agent_id="developer",
            trace_level=trace_level,
        )

        def cancel_pending_confirmations() -> None:
            confirmation_cancel_event.set()
            root.cancel_tool_confirmations(confirmation_cancel_event)

        try:
            session_event = bridge.emit_session_started(
                {
                    "model": root.get_model_name(options),
                    "started_at": started_at,
                    "trace_level": trace_level,
                    "thread_id": thread_id,
                }
            )
            yield _sse_event("runtime_event", session_event.to_dict())

            for raw_event in root.stream_chat_events(
                message=message,
                history=history,
                attachments=attachments,
                options=options,
                session_id=thread_id,
                cancel_event=confirmation_cancel_event,
            ):
                if not isinstance(raw_event, dict):
                    continue
                if raw_event.get("type") == "stream_summary":
                    continue
                for runtime_event in bridge.normalize(raw_event):
                    yield _sse_event("runtime_event", runtime_event.to_dict())

            yield _sse_event(
                "done",
                {
                    "finished_at": int(time.time() * 1000),
                    "diagnostics": bridge.diagnostics(),
                },
            )
        except GeneratorExit:  # pragma: no cover
            cancel_pending_confirmations()
            return
        except Exception as stream_error:
            cancel_pending_confirmations()
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
