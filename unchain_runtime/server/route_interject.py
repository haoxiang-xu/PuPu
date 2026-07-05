"""POST /chat/interject — mid-run interject endpoint (fyi/btw/auto routing).

Routes a client-side interject into one of:
- fyi: queued into the run's FyiChannel, drained at the next before_model
  boundary.
- btw: answered immediately by a tiny side-agent call, and the Q/A pair is
  posted back into the FyiChannel as a system-origin note so the main run
  stays consistent with what the user was told.
- steer / clarify: server does nothing; execution is entirely client-side.
- new_run: no active interject channel is registered for this thread_id
  (no run in flight, or it already finished) — caller should start a new run.
"""
from __future__ import annotations

import importlib
from typing import Any

from flask import Response, jsonify, request

from route_blueprint import api_blueprint
from interaction_channels import get_interject_channels
from interject_router import classify_interject

_VALID_CHANNELS = {"auto", "btw", "fyi", "steer"}


def _root():
    return importlib.import_module("routes")


def _run_side_answer(messages: list[dict[str, Any]], options: dict[str, Any]) -> str:
    import unchain_adapter as adapter
    from unchain import Agent
    from unchain.kernel.lifecycle_events import last_assistant_text

    config = adapter._resolve_general_runtime_config(options)
    provider = config.get("provider") or "openai"
    api_key = adapter._resolve_agent_api_key(options or {}, provider)
    agent = Agent(
        name="interject_side",
        provider=provider,
        model=config.get("model") or "",
        instructions="",
        api_key=api_key or None,
    )
    result = agent.run(messages, max_iterations=1)
    return last_assistant_text(result.messages)


@api_blueprint.post("/chat/interject")
def chat_interject() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    thread_id = str(payload.get("thread_id") or "").strip()
    text = str(payload.get("text") or "").strip()
    channel = str(payload.get("channel") or "auto").strip().lower()
    if not thread_id or not text:
        return root._json_error("invalid_request", "thread_id and text are required", 400)
    if channel not in _VALID_CHANNELS:
        return root._json_error("invalid_request", f"channel must be one of {sorted(_VALID_CHANNELS)}", 400)

    channels = get_interject_channels(thread_id)
    if channels is None:
        return jsonify({"resolved_channel": "new_run"})

    options = payload.get("options") if isinstance(payload.get("options"), dict) else {}
    if channel == "auto":
        channel = classify_interject(text, channels.digest.summary(), options)
        if channel in ("steer", "clarify"):
            return jsonify({"resolved_channel": channel})

    if channel == "fyi":
        message_id = channels.fyi.post(text)
        return jsonify({"resolved_channel": "fyi", "message_id": message_id})

    if channel == "btw":
        from unchain.interaction import build_btw_prompt

        messages = build_btw_prompt(channels.original_task, channels.digest.summary(), text)
        try:
            answer = _run_side_answer(messages, options)
        except Exception as error:  # noqa: BLE001
            return root._json_error("btw_failed", str(error), 502)
        channels.fyi.post(
            f"Q: {text}\nA: {answer}", origin="system"
        )
        return jsonify({"resolved_channel": "btw", "answer": answer})

    # explicit steer: server does nothing, execution is client-side
    return jsonify({"resolved_channel": "steer"})
