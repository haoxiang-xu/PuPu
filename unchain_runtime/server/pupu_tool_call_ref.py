"""Closed display reference resolved from one exact canonical tool intent."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


_TOOL_CALL_REF_SCHEMA = "pupu.tool_call_ref.v1"
_EVENT_CURSOR_SCHEMA = "unchain.event_cursor.v1"
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_REQUIRED_REF_KEYS = frozenset(
    {
        "schema",
        "execution_id",
        "original_attempt_id",
        "call_id",
        "tool_name",
        "intent_cursor",
    }
)
_OPTIONAL_REF_KEYS = frozenset({"iteration", "toolkit_id"})
_CURSOR_KEYS = frozenset({"schema", "store_seq", "event_id"})


def _valid_text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _valid_safe_integer(value: object, *, minimum: int) -> bool:
    return type(value) is int and minimum <= value <= _MAX_SAFE_INTEGER


def validate_tool_call_ref(value: object) -> dict[str, Any] | None:
    """Return a plain closed descriptor, or None for invalid evidence."""

    if not isinstance(value, Mapping):
        return None
    keys = frozenset(value.keys())
    if not _REQUIRED_REF_KEYS.issubset(keys):
        return None
    if keys - _REQUIRED_REF_KEYS - _OPTIONAL_REF_KEYS:
        return None
    if value.get("schema") != _TOOL_CALL_REF_SCHEMA:
        return None
    for key in (
        "execution_id",
        "original_attempt_id",
        "call_id",
        "tool_name",
    ):
        if not _valid_text(value.get(key)):
            return None

    cursor = value.get("intent_cursor")
    if not isinstance(cursor, Mapping) or frozenset(cursor.keys()) != _CURSOR_KEYS:
        return None
    if cursor.get("schema") != _EVENT_CURSOR_SCHEMA:
        return None
    if not _valid_safe_integer(cursor.get("store_seq"), minimum=1):
        return None
    if not _valid_text(cursor.get("event_id")):
        return None

    descriptor: dict[str, Any] = {
        "schema": _TOOL_CALL_REF_SCHEMA,
        "execution_id": value["execution_id"],
        "original_attempt_id": value["original_attempt_id"],
        "call_id": value["call_id"],
        "tool_name": value["tool_name"],
        "intent_cursor": {
            "schema": _EVENT_CURSOR_SCHEMA,
            "store_seq": cursor["store_seq"],
            "event_id": cursor["event_id"],
        },
    }
    if "iteration" in value:
        if not _valid_safe_integer(value["iteration"], minimum=0):
            return None
        descriptor["iteration"] = value["iteration"]
    if "toolkit_id" in value:
        if not _valid_text(value["toolkit_id"]):
            return None
        descriptor["toolkit_id"] = value["toolkit_id"]
    return descriptor


def resolve_tool_call_ref(
    event: object,
    *,
    expected_execution_id: str,
    expected_original_attempt_id: str,
    expected_call_id: str,
    expected_tool_name: str,
) -> dict[str, Any] | None:
    """Resolve metadata from an already matched canonical intent event.

    The caller remains responsible for exact journal-cursor lookup and current
    host/request admission. This function only checks the event against the
    supplied original-intent owner and builds the closed display descriptor.
    """

    expected = (
        expected_execution_id,
        expected_original_attempt_id,
        expected_call_id,
        expected_tool_name,
    )
    if not all(_valid_text(value) for value in expected):
        return None
    if getattr(event, "event_type", None) != "tool_call":
        return None

    attempt = getattr(event, "attempt", None)
    generation = getattr(attempt, "generation", None)
    payload = getattr(event, "payload", None)
    if not isinstance(payload, Mapping):
        return None

    execution_id = getattr(generation, "execution_id", None)
    original_attempt_id = getattr(attempt, "attempt_id", None)
    call_id = payload.get("call_id")
    tool_name = payload.get("tool_name")
    event_id = getattr(event, "event_id", None)
    store_seq = getattr(event, "store_seq", None)
    if (
        execution_id != expected_execution_id
        or original_attempt_id != expected_original_attempt_id
        or call_id != expected_call_id
        or tool_name != expected_tool_name
        or not _valid_text(event_id)
        or not _valid_safe_integer(store_seq, minimum=1)
    ):
        return None

    descriptor: dict[str, Any] = {
        "schema": _TOOL_CALL_REF_SCHEMA,
        "execution_id": execution_id,
        "original_attempt_id": original_attempt_id,
        "call_id": call_id,
        "tool_name": tool_name,
        "intent_cursor": {
            "schema": _EVENT_CURSOR_SCHEMA,
            "store_seq": store_seq,
            "event_id": event_id,
        },
    }
    if "iteration" in payload:
        iteration = payload["iteration"]
        if not _valid_safe_integer(iteration, minimum=0):
            return None
        descriptor["iteration"] = iteration
    if "toolkit_id" in payload:
        toolkit_id = payload["toolkit_id"]
        if not _valid_text(toolkit_id):
            return None
        descriptor["toolkit_id"] = toolkit_id
    return validate_tool_call_ref(descriptor)
