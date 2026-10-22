"""Closed display reference resolved from one exact canonical tool intent."""

from __future__ import annotations

import copy
import json
import math
from collections.abc import Iterable, Mapping
from typing import Any


_TOOL_CALL_REF_SCHEMA = "pupu.tool_call_ref.v1"
_EVENT_CURSOR_SCHEMA = "unchain.event_cursor.v1"
_TOOL_CALL_REF_METADATA_SCHEMA = "pupu.tool_call_ref_metadata.v1"
TOOL_CALL_DISPLAY_METADATA_SCHEMA = _TOOL_CALL_REF_METADATA_SCHEMA
TOOL_CALL_DISPLAY_METADATA_SIDECAR_KEY = "_pupu_tool_call_display_metadata"
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


_BLANK_CODEPOINTS = frozenset(
    [*range(0x0009, 0x000E), *range(0x001C, 0x0020)]
    + [0x0020, 0x0085, 0x00A0, 0x1680]
    + list(range(0x2000, 0x200B))
    + [0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF]
)


def _valid_text(value: object) -> bool:
    return isinstance(value, str) and any(
        ord(character) not in _BLANK_CODEPOINTS for character in value
    )


def _valid_safe_integer(value: object, *, minimum: int) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    if isinstance(value, float) and (not value.is_integer() or value in (float("inf"), float("-inf"))):
        return False
    return minimum <= value <= _MAX_SAFE_INTEGER


def _canonical_safe_integer(value: int | float) -> int:
    return int(value)


def _valid_journal_integer(value: object, *, minimum: int) -> bool:
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
            "store_seq": _canonical_safe_integer(cursor["store_seq"]),
            "event_id": cursor["event_id"],
        },
    }
    if "iteration" in value:
        if not _valid_safe_integer(value["iteration"], minimum=0):
            return None
        descriptor["iteration"] = _canonical_safe_integer(value["iteration"])
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
        or not _valid_journal_integer(store_seq, minimum=1)
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
            "store_seq": _canonical_safe_integer(store_seq),
            "event_id": event_id,
        },
    }
    if "iteration" in payload:
        iteration = payload["iteration"]
        if not _valid_journal_integer(iteration, minimum=0):
            return None
        descriptor["iteration"] = _canonical_safe_integer(iteration)
    if "toolkit_id" in payload:
        toolkit_id = payload["toolkit_id"]
        if not _valid_text(toolkit_id):
            return None
        descriptor["toolkit_id"] = toolkit_id
    return validate_tool_call_ref(descriptor)


_MISSING = object()


def _valid_journal_cursor(value: object) -> bool:
    return (
        isinstance(value, Mapping)
        and frozenset(value.keys()) == _CURSOR_KEYS
        and value.get("schema") == _EVENT_CURSOR_SCHEMA
        and _valid_journal_integer(value.get("store_seq"), minimum=1)
        and _valid_text(value.get("event_id"))
    )


def _canonical_json(value: object) -> str | None:
    def plain(item: object, active: set[int]) -> object:
        if item is None or isinstance(item, (str, bool)):
            return item
        if isinstance(item, int) and not isinstance(item, bool):
            return item
        if isinstance(item, float):
            if not math.isfinite(item):
                raise ValueError("non-finite JSON number")
            return item
        if isinstance(item, Mapping):
            identity = id(item)
            if identity in active or any(not isinstance(key, str) for key in item):
                raise ValueError("invalid JSON object")
            active.add(identity)
            try:
                return {key: plain(child, active) for key, child in item.items()}
            finally:
                active.remove(identity)
        if isinstance(item, (list, tuple)):
            identity = id(item)
            if identity in active:
                raise ValueError("cyclic JSON array")
            active.add(identity)
            try:
                return [plain(child, active) for child in item]
            finally:
                active.remove(identity)
        raise TypeError("value is not JSON data")

    try:
        return json.dumps(
            plain(value, set()),
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    except (TypeError, ValueError, RecursionError):
        return None


def _json_copy(value: object) -> object:
    serialized = _canonical_json(value)
    if serialized is None:
        raise ValueError("value is not JSON data")
    return json.loads(serialized)


def resolve_tool_call_display_metadata(
    events: Iterable[object],
    *,
    expected_execution_id: str,
    expected_original_attempt_id: str,
    expected_call_id: str,
    expected_tool_name: str,
    expected_iteration: object = _MISSING,
    expected_arguments: object = _MISSING,
    explicit_intent_cursor: object = _MISSING,
    explicit_call_ref: object = _MISSING,
) -> dict[str, Any] | None:
    """Resolve display metadata from exactly one canonical original intent.

    Callers must obtain ``events`` from the already admitted execution journal.
    The function has no admission or execution effects; ambiguity, malformed
    explicit evidence, or contradiction returns ``None`` without fallback.
    """

    expected = (
        expected_execution_id,
        expected_original_attempt_id,
        expected_call_id,
        expected_tool_name,
    )
    if not all(_valid_text(value) for value in expected):
        return None
    if not isinstance(events, Iterable) or isinstance(events, (str, bytes, Mapping)):
        return None

    cursor_constraint = None
    if explicit_intent_cursor is not _MISSING:
        if not _valid_journal_cursor(explicit_intent_cursor):
            return None
        cursor_constraint = {
            "schema": _EVENT_CURSOR_SCHEMA,
            "store_seq": explicit_intent_cursor["store_seq"],
            "event_id": explicit_intent_cursor["event_id"],
        }

    reference_constraint = None
    if explicit_call_ref is not _MISSING:
        reference_constraint = validate_tool_call_ref(explicit_call_ref)
        if reference_constraint is None:
            return None
        if any(
            reference_constraint[field_name] != expected_value
            for field_name, expected_value in zip(
                ("execution_id", "original_attempt_id", "call_id", "tool_name"),
                expected,
            )
        ):
            return None
        reference_cursor = reference_constraint["intent_cursor"]
        if cursor_constraint is not None and cursor_constraint != reference_cursor:
            return None
        cursor_constraint = reference_cursor

    if expected_iteration is not _MISSING and not _valid_journal_integer(
        expected_iteration, minimum=0
    ):
        return None
    expected_arguments_json = None
    if expected_arguments is not _MISSING:
        expected_arguments_json = _canonical_json(expected_arguments)
        if expected_arguments_json is None:
            return None

    matches = []
    try:
        candidates = tuple(events)
    except Exception:
        return None
    for event in candidates:
        if getattr(event, "event_type", None) != "tool_call":
            continue
        attempt = getattr(event, "attempt", None)
        generation = getattr(attempt, "generation", None)
        payload = getattr(event, "payload", None)
        if not isinstance(payload, Mapping):
            continue
        if (
            getattr(generation, "execution_id", None) != expected_execution_id
            or getattr(attempt, "attempt_id", None) != expected_original_attempt_id
            or payload.get("call_id") != expected_call_id
            or payload.get("tool_name") != expected_tool_name
            or not _valid_journal_integer(getattr(event, "store_seq", None), minimum=1)
            or not _valid_text(getattr(event, "event_id", None))
        ):
            continue
        if cursor_constraint is not None and (
            event.store_seq != cursor_constraint["store_seq"]
            or event.event_id != cursor_constraint["event_id"]
        ):
            continue
        if expected_iteration is not _MISSING:
            if (
                "iteration" not in payload
                or not _valid_journal_integer(payload["iteration"], minimum=0)
                or payload["iteration"] != expected_iteration
            ):
                continue
        if expected_arguments_json is not None:
            candidate_arguments_json = _canonical_json(payload.get("arguments", _MISSING))
            if (
                candidate_arguments_json is None
                or candidate_arguments_json != expected_arguments_json
            ):
                continue
        descriptor = resolve_tool_call_ref(
            event,
            expected_execution_id=expected_execution_id,
            expected_original_attempt_id=expected_original_attempt_id,
            expected_call_id=expected_call_id,
            expected_tool_name=expected_tool_name,
        )
        if descriptor is None:
            continue
        if reference_constraint is not None and any(
            reference_constraint.get(key) != descriptor.get(key)
            for key in ("iteration", "toolkit_id")
            if key in reference_constraint
        ):
            continue
        matches.append((event, descriptor))

    if len(matches) != 1:
        return None
    event, descriptor = matches[0]
    intent_payload = event.payload
    metadata: dict[str, Any] = {
        "call_ref": descriptor,
        "timeline_merge_policy_declared": (
            "timeline_merge_policy" in intent_payload
        ),
    }
    metadata["original_arguments_declared"] = "arguments" in intent_payload
    if "arguments" in intent_payload:
        metadata["original_arguments"] = _json_copy(intent_payload["arguments"])
    if "timeline_merge_policy" in intent_payload:
        metadata["timeline_merge_policy"] = _json_copy(
            intent_payload["timeline_merge_policy"]
        )
    return metadata


def validate_tool_call_ref_metadata(
    value: object,
    *,
    call_ref: object,
) -> dict[str, Any] | None:
    """Validate the closed, versioned source facts beside a display descriptor."""

    descriptor = validate_tool_call_ref(call_ref)
    if descriptor is None or not isinstance(value, Mapping):
        return None
    required = {
        "schema",
        "intent_cursor",
        "timeline_merge_policy_declared",
        "original_arguments_declared",
    }
    optional = {"timeline_merge_policy", "original_arguments"}
    keys = frozenset(value.keys())
    if not required.issubset(keys) or keys - required - optional:
        return None
    if value.get("schema") != _TOOL_CALL_REF_METADATA_SCHEMA:
        return None
    cursor = value.get("intent_cursor")
    if not _valid_journal_cursor(cursor):
        return None
    normalized_cursor = {
        "schema": _EVENT_CURSOR_SCHEMA,
        "store_seq": cursor["store_seq"],
        "event_id": cursor["event_id"],
    }
    if normalized_cursor != descriptor["intent_cursor"]:
        return None
    policy_declared = value.get("timeline_merge_policy_declared")
    arguments_declared = value.get("original_arguments_declared")
    if (
        type(policy_declared) is not bool
        or type(arguments_declared) is not bool
        or policy_declared != ("timeline_merge_policy" in value)
        or arguments_declared != ("original_arguments" in value)
    ):
        return None
    result: dict[str, Any] = {
        "schema": _TOOL_CALL_REF_METADATA_SCHEMA,
        "intent_cursor": normalized_cursor,
        "timeline_merge_policy_declared": policy_declared,
        "original_arguments_declared": arguments_declared,
    }
    if policy_declared:
        if _canonical_json(value["timeline_merge_policy"]) is None:
            return None
        result["timeline_merge_policy"] = _json_copy(
            value["timeline_merge_policy"]
        )
    if arguments_declared:
        if _canonical_json(value["original_arguments"]) is None:
            return None
        result["original_arguments"] = _json_copy(value["original_arguments"])
    return result


class ToolCallDisplayMetadataSidecar:
    """Typed in-process metadata that must be stripped before normalization."""

    __slots__ = ("_metadata_json",)

    def __init__(self, metadata: object) -> None:
        if not isinstance(metadata, Mapping):
            raise TypeError("tool-call display metadata must be a mapping")
        allowed = {
            "call_ref",
            "timeline_merge_policy_declared",
            "timeline_merge_policy",
            "original_arguments_declared",
            "original_arguments",
        }
        required = {
            "call_ref",
            "timeline_merge_policy_declared",
            "original_arguments_declared",
        }
        if set(metadata) - allowed or not required.issubset(metadata):
            raise ValueError("tool-call display metadata has an invalid shape")
        call_ref = validate_tool_call_ref(metadata.get("call_ref"))
        policy_declared = metadata.get("timeline_merge_policy_declared")
        arguments_declared = metadata.get("original_arguments_declared")
        if (
            call_ref is None
            or type(policy_declared) is not bool
            or type(arguments_declared) is not bool
        ):
            raise ValueError("tool-call display metadata is invalid")
        if policy_declared != ("timeline_merge_policy" in metadata):
            raise ValueError("tool-call policy declaration presence is inconsistent")
        if arguments_declared != ("original_arguments" in metadata):
            raise ValueError("tool-call arguments declaration presence is inconsistent")
        canonical: dict[str, Any] = {
            "call_ref": call_ref,
            "timeline_merge_policy_declared": policy_declared,
            "original_arguments_declared": arguments_declared,
        }
        if policy_declared:
            canonical["timeline_merge_policy"] = copy.deepcopy(
                metadata["timeline_merge_policy"]
            )
        if arguments_declared:
            canonical["original_arguments"] = copy.deepcopy(
                metadata["original_arguments"]
            )
        serialized = _canonical_json(canonical)
        if serialized is None:
            raise ValueError("tool-call display metadata is not JSON safe")
        self._metadata_json = serialized

    def to_dict(self) -> dict[str, Any]:
        return json.loads(self._metadata_json)

    def __deepcopy__(self, _memo):
        return self


class ToolCallDisplayMetadataTracker:
    """Retain exact display evidence for one request's callbacks."""

    def __init__(self) -> None:
        import threading

        self._lock = threading.Lock()
        self._by_owner: dict[tuple[str, str, str, str], list[ToolCallDisplayMetadataSidecar]] = {}
        self._cursor_by_interaction: dict[
            tuple[str, str, str, str, str], list[dict[str, Any] | None]
        ] = {}

    def remember(self, metadata: object) -> ToolCallDisplayMetadataSidecar | None:
        try:
            sidecar = ToolCallDisplayMetadataSidecar(metadata)
        except (TypeError, ValueError):
            return None
        descriptor = sidecar.to_dict()["call_ref"]
        key = (
            descriptor["execution_id"],
            descriptor["original_attempt_id"],
            descriptor["call_id"],
            descriptor["tool_name"],
        )
        with self._lock:
            entries = self._by_owner.setdefault(key, [])
            if not any(entry.to_dict() == sidecar.to_dict() for entry in entries):
                entries.append(sidecar)
        return sidecar

    def observe_interaction_request(self, event: object) -> None:
        if not isinstance(event, Mapping):
            return
        request = event.get("interaction_request")
        if not isinstance(request, Mapping):
            return
        subject = request.get("subject")
        extra = subject.get("extra") if isinstance(subject, Mapping) else None
        authority = (
            extra.get("context_v2_tool_authority")
            if isinstance(extra, Mapping)
            else None
        )
        if not isinstance(authority, Mapping) or "intent_cursor" not in authority:
            return
        payload = request.get("payload")
        if not isinstance(payload, Mapping):
            return
        interaction_id = request.get("interaction_id")
        execution_id = request.get("session_id")
        original_attempt_id = request.get("source_run_id")
        call_id = payload.get("call_id")
        tool_name = payload.get("tool_name")
        values = (
            execution_id,
            original_attempt_id,
            interaction_id,
            call_id,
            tool_name,
        )
        if not all(_valid_text(value) for value in values):
            return
        raw_cursor = authority.get("intent_cursor")
        cursor = (
            {
                "schema": _EVENT_CURSOR_SCHEMA,
                "store_seq": raw_cursor["store_seq"],
                "event_id": raw_cursor["event_id"],
            }
            if _valid_journal_cursor(raw_cursor)
            else None
        )
        key = tuple(values)
        with self._lock:
            cursors = self._cursor_by_interaction.setdefault(key, [])
            if cursor not in cursors:
                cursors.append(cursor)

    def resolve_for_interaction(
        self,
        *,
        execution_id: object,
        original_attempt_id: object,
        interaction_id: object,
        call_id: object,
        tool_name: object,
        expected_iteration: object = _MISSING,
        explicit_intent_cursor: object = _MISSING,
        explicit_call_ref: object = _MISSING,
    ) -> ToolCallDisplayMetadataSidecar | None:
        values = (
            execution_id,
            original_attempt_id,
            interaction_id,
            call_id,
            tool_name,
        )
        if not all(_valid_text(value) for value in values):
            return None
        with self._lock:
            cursors = self._cursor_by_interaction.get(tuple(values), ())
            if len(cursors) != 1 or cursors[0] is None:
                return None
            cursor = cursors[0]
            entries = self._by_owner.get(
                (execution_id, original_attempt_id, call_id, tool_name), ()
            )
            matching = [
                entry
                for entry in entries
                if entry.to_dict()["call_ref"]["intent_cursor"] == cursor
            ]
        if len(matching) != 1:
            return None
        sidecar = matching[0]
        descriptor = sidecar.to_dict()["call_ref"]
        if expected_iteration is not _MISSING and (
            not _valid_journal_integer(expected_iteration, minimum=0)
            or descriptor.get("iteration") != expected_iteration
        ):
            return None
        if explicit_intent_cursor is not _MISSING and (
            not _valid_journal_cursor(explicit_intent_cursor)
            or descriptor["intent_cursor"] != dict(explicit_intent_cursor)
        ):
            return None
        if explicit_call_ref is not _MISSING:
            explicit = validate_tool_call_ref(explicit_call_ref)
            if explicit is None or any(
                explicit.get(field_name) != descriptor.get(field_name)
                for field_name in (
                    "execution_id",
                    "original_attempt_id",
                    "call_id",
                    "tool_name",
                    "intent_cursor",
                    "iteration",
                    "toolkit_id",
                )
                if field_name in explicit
            ):
                return None
        return sidecar

    def resolve_for_owner(
        self,
        *,
        execution_id: object,
        original_attempt_id: object,
        call_id: object,
        tool_name: object,
        expected_iteration: object = _MISSING,
        explicit_intent_cursor: object = _MISSING,
        explicit_call_ref: object = _MISSING,
    ) -> ToolCallDisplayMetadataSidecar | None:
        values = (execution_id, original_attempt_id, call_id, tool_name)
        if not all(_valid_text(value) for value in values):
            return None
        key = tuple(values)
        with self._lock:
            entries = self._by_owner.get(key, ())
            if len(entries) != 1:
                return None
            sidecar = entries[0]
        metadata = sidecar.to_dict()
        descriptor = metadata["call_ref"]
        if expected_iteration is not _MISSING and (
            not _valid_safe_integer(expected_iteration, minimum=0)
            or descriptor.get("iteration") != _canonical_safe_integer(
                expected_iteration
            )
        ):
            return None
        if explicit_intent_cursor is not _MISSING:
            if (
                not _valid_journal_cursor(explicit_intent_cursor)
                or descriptor["intent_cursor"] != dict(explicit_intent_cursor)
            ):
                return None
        if explicit_call_ref is not _MISSING:
            explicit = validate_tool_call_ref(explicit_call_ref)
            if explicit is None or any(
                explicit.get(field_name) != descriptor.get(field_name)
                for field_name in (
                    "execution_id",
                    "original_attempt_id",
                    "call_id",
                    "tool_name",
                    "intent_cursor",
                    "iteration",
                    "toolkit_id",
                )
                if field_name in explicit
            ):
                return None
        return sidecar


def resolve_tool_call_display_metadata_for_runtime_event(
    active_bridge: object,
    event: object,
    tracker: ToolCallDisplayMetadataTracker | None = None,
) -> dict[str, Any] | None:
    """Join live observations to their unique original journal intent."""

    if not isinstance(event, dict):
        return None
    if event.get("type") == "interaction_requested" and tracker is not None:
        request = event.get("interaction_request")
        if not isinstance(request, Mapping):
            return None
        payload = request.get("payload")
        if not isinstance(payload, Mapping):
            return None
        request_execution_id = request.get("session_id")
        request_attempt_id = request.get("source_run_id")
        request_call_id = payload.get("call_id")
        request_tool_name = payload.get("tool_name")
        if (
            request_execution_id != getattr(active_bridge, "execution_id", None)
            or not _valid_text(request_attempt_id)
            or any(
                event.get(key) is not None
                and event.get(key) != expected
                for key, expected in (
                    ("session_id", request_execution_id),
                    ("execution_id", request_execution_id),
                    ("run_id", request_attempt_id),
                    ("call_id", request_call_id),
                    ("tool_name", request_tool_name),
                )
            )
        ):
            return None
        subject = request.get("subject")
        extra = subject.get("extra") if isinstance(subject, Mapping) else None
        authority = (
            extra.get("context_v2_tool_authority")
            if isinstance(extra, Mapping)
            else None
        )
        explicit_cursor = (
            authority["intent_cursor"]
            if isinstance(authority, Mapping) and "intent_cursor" in authority
            else _MISSING
        )
        if explicit_cursor is _MISSING or not _valid_journal_cursor(
            explicit_cursor
        ):
            return None
        if "intent_cursor" in event and (
            not _valid_journal_cursor(event["intent_cursor"])
            or dict(event["intent_cursor"]) != dict(explicit_cursor)
        ):
            return None
        sidecar = tracker.resolve_for_interaction(
            execution_id=request_execution_id,
            original_attempt_id=request_attempt_id,
            interaction_id=request.get("interaction_id"),
            call_id=request_call_id,
            tool_name=request_tool_name,
            expected_iteration=(
                event["iteration"] if "iteration" in event else _MISSING
            ),
            explicit_intent_cursor=explicit_cursor,
            explicit_call_ref=(
                event["call_ref"] if "call_ref" in event else _MISSING
            ),
        )
        return sidecar.to_dict() if sidecar is not None else None
    if event.get("type") == "tool_result" and tracker is not None:
        original_attempt_id = event.get("run_id")
        call_id = event.get("call_id")
        tool_name = event.get("tool_name")
        if not all(
            _valid_text(value)
            for value in (original_attempt_id, call_id, tool_name)
        ):
            return None
        try:
            attempt_runtime = active_bridge.attempt_for_run(original_attempt_id)
            attempt = attempt_runtime.bundle.attempt
            execution_id = attempt.generation.execution_id
            if (
                execution_id != getattr(active_bridge, "execution_id", None)
                or attempt.attempt_id != original_attempt_id
                or any(
                    event.get(key) is not None and event.get(key) != execution_id
                    for key in ("session_id", "execution_id")
                )
            ):
                return None
        except Exception:
            return None
        sidecar = tracker.resolve_for_owner(
            execution_id=execution_id,
            original_attempt_id=original_attempt_id,
            call_id=call_id,
            tool_name=tool_name,
            expected_iteration=(
                event["iteration"] if "iteration" in event else _MISSING
            ),
            explicit_intent_cursor=(
                event["intent_cursor"] if "intent_cursor" in event else _MISSING
            ),
            explicit_call_ref=(
                event["call_ref"] if "call_ref" in event else _MISSING
            ),
        )
        return sidecar.to_dict() if sidecar is not None else None
    if event.get("type") != "tool_call":
        return None
    original_attempt_id = event.get("run_id")
    call_id = event.get("call_id")
    tool_name = event.get("tool_name")
    if not all(_valid_text(value) for value in (original_attempt_id, call_id, tool_name)):
        return None
    try:
        attempt_runtime = active_bridge.attempt_for_run(original_attempt_id)
        bundle = attempt_runtime.bundle
        attempt = bundle.attempt
        execution_id = attempt.generation.execution_id
        if (
            execution_id != getattr(active_bridge, "execution_id", None)
            or attempt.attempt_id != original_attempt_id
            or any(
                event.get(key) is not None and event.get(key) != execution_id
                for key in ("session_id", "execution_id")
            )
        ):
            return None
        events = bundle.journal.capture_snapshot().events
    except Exception:
        return None

    arguments = event["arguments"] if "arguments" in event else _MISSING
    iteration = event["iteration"] if "iteration" in event else _MISSING
    intent_cursor = event["intent_cursor"] if "intent_cursor" in event else _MISSING
    call_ref = event["call_ref"] if "call_ref" in event else _MISSING
    return resolve_tool_call_display_metadata(
        events,
        expected_execution_id=execution_id,
        expected_original_attempt_id=original_attempt_id,
        expected_call_id=call_id,
        expected_tool_name=tool_name,
        expected_iteration=iteration,
        expected_arguments=arguments,
        explicit_intent_cursor=intent_cursor,
        explicit_call_ref=call_ref,
    )
