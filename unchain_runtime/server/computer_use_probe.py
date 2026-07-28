"""Fail-closed Ollama capability and structured-action probe.

The probe is explicit and bounded; normal model-catalog reads never contact the
model.  Successful and failed results are cached for 24 hours by host, model,
and model digest.
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, Optional

from computer_control.click3_adapter import (
    LOCAL_PLANNER_PROMPT,
    local_computer_tool_schema,
)
from computer_control.protocol import normalize_batch, validate_batch

PROBE_TTL_SECONDS = 24 * 60 * 60
PROBE_TIMEOUT_SECONDS = 45.0

_cache: Dict[tuple[str, str, str], Dict[str, Any]] = {}
_cache_lock = threading.Lock()


def _host(value: Optional[str] = None) -> str:
    return str(value or os.environ.get("OLLAMA_HOST") or "http://localhost:11434").rstrip("/")


def _request_json(
    method: str,
    url: str,
    payload: Optional[Dict[str, Any]],
    timeout: float,
) -> Dict[str, Any]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=max(0.1, timeout)) as response:
        decoded = json.loads(response.read().decode("utf-8"))
    if not isinstance(decoded, dict):
        raise ValueError("Ollama returned a non-object response")
    return decoded


def _model_digest(tags: Dict[str, Any], model: str) -> str:
    normalized = model.strip().lower()
    for row in tags.get("models") or []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or row.get("model") or "").strip().lower()
        if name == normalized:
            return str(row.get("digest") or "").strip()
    return ""


def _result(
    *,
    supported: bool,
    host: str,
    model: str,
    digest: str,
    reason: str,
    now: float,
) -> Dict[str, Any]:
    return {
        "supported": supported,
        "host": host,
        "model": model,
        "digest": digest,
        "reason": reason,
        "checked_at": now,
        "expires_at": now + PROBE_TTL_SECONDS,
    }


def get_cached_probe(model: str, host: Optional[str] = None) -> Optional[Dict[str, Any]]:
    normalized_host = _host(host)
    normalized_model = str(model or "").strip().lower()
    now = time.time()
    with _cache_lock:
        matches = [
            value
            for (cached_host, cached_model, _digest), value in _cache.items()
            if cached_host == normalized_host
            and cached_model == normalized_model
            and float(value.get("expires_at") or 0) > now
        ]
    if not matches:
        return None
    return dict(max(matches, key=lambda value: float(value.get("checked_at") or 0)))


def probe_local_model(
    model: str,
    *,
    host: Optional[str] = None,
    force: bool = False,
    requester: Callable[[str, str, Optional[Dict[str, Any]], float], Dict[str, Any]] = _request_json,
) -> Dict[str, Any]:
    """Probe vision/tools plus one real structured screenshot action."""
    normalized_host = _host(host)
    normalized_model = str(model or "").strip().lower()
    started = time.monotonic()
    now = time.time()

    if not normalized_model:
        return _result(
            supported=False,
            host=normalized_host,
            model="",
            digest="",
            reason="missing_model",
            now=now,
        )
    if not force:
        cached = get_cached_probe(normalized_model, normalized_host)
        if cached is not None:
            return cached

    def remaining() -> float:
        return max(0.1, PROBE_TIMEOUT_SECONDS - (time.monotonic() - started))

    digest = ""
    reason = "probe_failed"
    supported = False
    try:
        tags = requester("GET", f"{normalized_host}/api/tags", None, min(5.0, remaining()))
        digest = _model_digest(tags, normalized_model)
        if not digest:
            reason = "model_not_installed"
        else:
            cache_key = (normalized_host, normalized_model, digest)
            if not force:
                with _cache_lock:
                    cached = _cache.get(cache_key)
                if cached and float(cached.get("expires_at") or 0) > now:
                    return dict(cached)

            shown = requester(
                "POST",
                f"{normalized_host}/api/show",
                {"model": normalized_model},
                min(8.0, remaining()),
            )
            capabilities = {
                str(item).strip().lower()
                for item in shown.get("capabilities") or []
                if str(item).strip()
            }
            if not {"vision", "tools"}.issubset(capabilities):
                reason = "missing_vision_or_tools"
            else:
                response = requester(
                    "POST",
                    f"{normalized_host}/api/chat",
                    {
                        "model": normalized_model,
                        "stream": False,
                        "messages": [
                            {"role": "system", "content": LOCAL_PLANNER_PROMPT},
                            {
                                "role": "user",
                                "content": (
                                    "Capability check only. Call the computer tool "
                                    "with exactly one screenshot action."
                                ),
                            },
                        ],
                        "tools": [local_computer_tool_schema()],
                        "options": {"temperature": 0},
                    },
                    remaining(),
                )
                tool_calls = ((response.get("message") or {}).get("tool_calls") or [])
                first = tool_calls[0] if tool_calls else {}
                function = first.get("function") if isinstance(first, dict) else {}
                if not isinstance(function, dict) or function.get("name") != "computer":
                    reason = "structured_action_missing"
                else:
                    arguments = function.get("arguments")
                    if isinstance(arguments, str):
                        arguments = json.loads(arguments)
                    batch = normalize_batch(
                        {
                            **(arguments if isinstance(arguments, dict) else {}),
                            "provider": "ollama",
                            "protocol": "pupu.local.click3.v1",
                        }
                    )
                    validate_batch(batch, width=1, height=1, has_screenshot=False)
                    actions = batch.get("actions") or []
                    if len(actions) != 1 or actions[0].get("type") != "screenshot":
                        reason = "unexpected_probe_action"
                    else:
                        supported = True
                        reason = ""
    except (TimeoutError, urllib.error.URLError):
        reason = "probe_timeout_or_unreachable"
    except Exception:
        reason = "invalid_probe_response"

    result = _result(
        supported=supported,
        host=normalized_host,
        model=normalized_model,
        digest=digest,
        reason=reason,
        now=now,
    )
    with _cache_lock:
        _cache[(normalized_host, normalized_model, digest)] = result
    return dict(result)


def _reset_probe_cache() -> None:
    with _cache_lock:
        _cache.clear()

