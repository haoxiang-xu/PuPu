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
import threading
from concurrent.futures import TimeoutError as FutureTimeoutError
from typing import Any, Callable, TypeVar

from flask import Response, jsonify, request

from route_blueprint import api_blueprint
from interaction_channels import get_interject_channels
from interject_router import classify_interject

_VALID_CHANNELS = {"auto", "btw", "fyi", "steer"}

# Side-call budgets. Module-level so tests can monkeypatch them down.
BTW_TIMEOUT_S = 30.0
CLASSIFY_TIMEOUT_S = 10.0

_T = TypeVar("_T")


def _call_with_timeout(fn: Callable[[], _T], seconds: float) -> _T:
    """Run fn() with a wall-clock timeout, raising TimeoutError on expiry.

    NOTE: on timeout the worker thread is NOT cancelled — it keeps running to
    completion in the background. This is acceptable here because fn is a
    one-shot side-call (btw answer / auto-classify) with no caller-visible
    state to clean up beyond the return value we're discarding.

    Runs on a DAEMON thread (not a ThreadPoolExecutor): executor workers are
    non-daemon and are joined at interpreter exit, so a provider call hung
    past its timeout would block the whole sidecar from shutting down.
    """
    result: list[Any] = []
    error: list[BaseException] = []
    done = threading.Event()

    def _worker() -> None:
        try:
            result.append(fn())
        except BaseException as exc:  # noqa: BLE001 — relayed to caller below
            error.append(exc)
        finally:
            done.set()

    thread = threading.Thread(
        target=_worker, name="interject-side-call", daemon=True
    )
    thread.start()
    if not done.wait(seconds):
        raise FutureTimeoutError()
    if error:
        raise error[0]
    return result[0]


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

    request_options = payload.get("options") if isinstance(payload.get("options"), dict) else {}
    # Request-payload options override the run's snapshot (taken at run
    # start); the snapshot keeps side-calls on the run's actual
    # provider/model instead of falling back to server env defaults.
    options = {**channels.options, **request_options}

    if channel == "auto":
        try:
            channel = _call_with_timeout(
                lambda: classify_interject(text, channels.digest.summary(), options),
                CLASSIFY_TIMEOUT_S,
            )
        except FutureTimeoutError:
            channel = "clarify"
        if channel in ("steer", "clarify"):
            return jsonify({"resolved_channel": channel})

    if channel == "fyi":
        message_id = channels.fyi.post(text)
        if get_interject_channels(thread_id) is not channels:
            # The run released (and possibly re-registered) this entry
            # between our lookup and the post above — the queued message
            # will never be drained by anything. Tell the caller to retry.
            return jsonify({"resolved_channel": "new_run"})
        return jsonify({"resolved_channel": "fyi", "message_id": message_id})

    if channel == "btw":
        from unchain.interaction import build_btw_prompt

        messages = build_btw_prompt(channels.original_task, channels.digest.summary(), text)
        try:
            answer = _call_with_timeout(
                lambda: _run_side_answer(messages, options), BTW_TIMEOUT_S
            )
        except FutureTimeoutError:
            return root._json_error("btw_timeout", "Side answer timed out", 504)
        except Exception as error:  # noqa: BLE001
            return root._json_error("btw_failed", str(error), 502)
        if get_interject_channels(thread_id) is channels:
            channels.fyi.post(f"Q: {text}\nA: {answer}", origin="system")
        # else: the run already ended/released; skip the now-orphaned
        # system note, but the answer itself is still valid to show.
        return jsonify({"resolved_channel": "btw", "answer": answer})

    # explicit steer: server does nothing, execution is client-side
    return jsonify({"resolved_channel": "steer"})
