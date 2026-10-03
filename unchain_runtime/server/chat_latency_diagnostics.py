"""Content-free timing logs for one chat request.

This module never logs messages, tool arguments, provider payloads, or raw chat
identifiers. Timing records are observational and must not affect the stream.
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from typing import Any


_EVENT_STAGES = frozenset(
    {
        "run_started",
        "request_messages",
        "token_delta",
        "tool_call",
        "tool_result",
        "response_received",
        "final_message",
        "stream_summary",
    }
)
_PHASES = frozenset(
    {
        "graph_compile",
        "graph_active_preflight",
        "graph_active_bootstrap",
        "graph_user_toolkits",
        "graph_setup",
        "graph_worker_to_first_run",
        "normal_agent_setup",
    }
)
_MAX_MODEL_TURNS = 32


def _fingerprint(value: str) -> str:
    if not isinstance(value, str) or not value:
        return ""
    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()[:12]


def _write(record: dict[str, Any]) -> None:
    try:
        print(
            "[chat-latency] "
            + json.dumps(record, sort_keys=True, separators=(",", ":")),
            file=sys.stderr,
            flush=True,
        )
    except Exception:
        # Diagnostics must never change chat delivery or completion.
        pass


def emit_latency_phase(
    phase: str,
    *,
    started_ns: int,
    session_id: str,
    attempt_id: str,
) -> None:
    try:
        if phase not in _PHASES:
            return
        elapsed_ms = max(0, (time.perf_counter_ns() - started_ns) // 1_000_000)
        _write(
            {
                "schema": "pupu.chat_latency.v1",
                "kind": "phase",
                "phase": phase,
                "elapsed_ms": elapsed_ms,
                "logged_at_ms": time.time_ns() // 1_000_000,
                "session_key": _fingerprint(session_id),
                "attempt_key": _fingerprint(attempt_id),
            }
        )
    except Exception:
        return


class ChatLatencyTrace:
    """Record bounded event timing without copying event payloads."""

    def __init__(self, *, session_id: str, attempt_id: str, route: str) -> None:
        self._started_ns = time.perf_counter_ns()
        self._started_at_ms = time.time_ns() // 1_000_000
        self._session_key = _fingerprint(session_id)
        self._attempt_key = _fingerprint(attempt_id)
        self._route = route
        self._stages: dict[str, int] = {}
        self._turns: dict[int, dict[str, int]] = {}
        self._request_count = 0
        self._finished = False

    def _elapsed_ms(self) -> int:
        return max(0, (time.perf_counter_ns() - self._started_ns) // 1_000_000)

    def observe(self, event: dict[str, Any]) -> None:
        try:
            event_type = event.get("type")
            if type(event_type) is not str or event_type not in _EVENT_STAGES:
                return
            now_ms = self._elapsed_ms()
            self._stages.setdefault(event_type, now_ms)
            iteration = event.get("iteration")
            if type(iteration) is not int or iteration < 0:
                return
            if event_type == "request_messages":
                self._request_count += 1
            if iteration not in self._turns:
                if len(self._turns) >= _MAX_MODEL_TURNS:
                    return
                self._turns[iteration] = {}
            turn = self._turns[iteration]
            if event_type == "request_messages":
                turn.setdefault("request_ready_ms", now_ms)
            elif event_type == "token_delta":
                turn.setdefault("first_token_ms", now_ms)
            elif event_type == "tool_call":
                turn.setdefault("first_tool_call_ms", now_ms)
            elif event_type == "tool_result":
                turn.setdefault("tool_result_ms", now_ms)
            elif event_type == "response_received":
                turn.setdefault("response_received_ms", now_ms)
            elif event_type == "final_message":
                turn.setdefault("final_message_ms", now_ms)
        except Exception:
            return

    def finish(self, outcome: str) -> None:
        if self._finished:
            return
        self._finished = True
        try:
            if outcome not in {"completed", "cancelled", "failed"}:
                outcome = "failed"
            _write(
                {
                    "schema": "pupu.chat_latency.v1",
                    "kind": "request",
                    "route": self._route,
                    "outcome": outcome,
                    "session_key": self._session_key,
                    "attempt_key": self._attempt_key,
                    "started_at_ms": self._started_at_ms,
                    "elapsed_ms": self._elapsed_ms(),
                    "stages_ms": self._stages,
                    "provider_request_count": self._request_count,
                    "model_turns": [
                        {"iteration": iteration, **turn}
                        for iteration, turn in sorted(self._turns.items())
                    ],
                }
            )
        except Exception:
            return
