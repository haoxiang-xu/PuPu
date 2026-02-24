import json
import time
from typing import Dict, Iterable, List

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

from miso_adapter import (
    get_capability_catalog,
    get_default_model_capabilities,
    get_model_capability_catalog,
    get_model_name,
    get_runtime_config,
    stream_chat,
)

api_blueprint = Blueprint("miso_api", __name__)


def _sse_event(event_name: str, payload: Dict) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _is_authorized() -> bool:
    expected_token = current_app.config.get("MISO_AUTH_TOKEN", "")
    if not expected_token:
        return True
    provided_token = request.headers.get("x-miso-auth", "")
    return provided_token == expected_token


def _sanitize_history(payload_history: object) -> List[Dict[str, str]]:
    if not isinstance(payload_history, list):
        return []

    history: List[Dict[str, str]] = []
    for item in payload_history:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "")).strip()
        content = str(item.get("content", ""))
        if role in {"user", "assistant", "system"}:
            history.append({"role": role, "content": content})
    return history


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
    if not message:
        return jsonify(
            {
                "error": {
                    "code": "invalid_request",
                    "message": "message is required",
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

            for delta in stream_chat(message=message, history=history, options=options):
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
