"""Strict PuPu host-event boundary for active Context V2 interactions.

Runtime-origin semantic events are already persisted by Unchain's ContextModule.
This boundary is only for PuPu-owned interaction presentation and the small
closed set of PuPu-owned semantic events that need an exact attempt binding.
"""

from __future__ import annotations

import copy
import json
import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from unchain.journal.models import _required_text


HOST_EVENT_LANE_PRESENTATION = "presentation"
HOST_EVENT_LANE_SEMANTIC = "semantic"

HOST_EVENT_ORIGIN_TOOL_APPROVAL = "tool_approval"
HOST_EVENT_ORIGIN_HUMAN_INPUT = "human_input"
HOST_EVENT_ORIGIN_MAX_BUDGET = "max_budget"
HOST_EVENT_ORIGIN_INTERACTION_RESOLUTION = "interaction_resolution"
HOST_EVENT_ORIGIN_FALLBACK_FINAL = "fallback_final"

_PRESENTATION_ORIGINS = frozenset(
    {
        HOST_EVENT_ORIGIN_TOOL_APPROVAL,
        HOST_EVENT_ORIGIN_HUMAN_INPUT,
        HOST_EVENT_ORIGIN_MAX_BUDGET,
    }
)
_SEMANTIC_ORIGINS = frozenset(
    {
        HOST_EVENT_ORIGIN_FALLBACK_FINAL,
    }
)
_RESOLUTION_ORIGINS = frozenset({HOST_EVENT_ORIGIN_INTERACTION_RESOLUTION})
_ALL_ORIGINS = _PRESENTATION_ORIGINS | _SEMANTIC_ORIGINS | _RESOLUTION_ORIGINS
_INTERACTION_ORIGINS = _PRESENTATION_ORIGINS | {
    HOST_EVENT_ORIGIN_INTERACTION_RESOLUTION,
}
_LIVE_INTERACTION_ORIGINS = frozenset(_INTERACTION_ORIGINS)
_INTERACTION_KINDS = frozenset({"tool_approval", "human_input", "max_budget"})
_PRESENTATION_KIND_BY_ORIGIN = {
    HOST_EVENT_ORIGIN_TOOL_APPROVAL: "tool_approval",
    HOST_EVENT_ORIGIN_HUMAN_INPUT: "human_input",
    HOST_EVENT_ORIGIN_MAX_BUDGET: "max_budget",
}
_RESOLUTION_OUTCOMES_BY_KIND = {
    "tool_approval": frozenset({"approved", "denied"}),
    "human_input": frozenset({"submitted", "denied"}),
    "max_budget": frozenset({"approved", "denied"}),
}


class PupuUnchainHostEventBoundaryError(RuntimeError):
    """A PuPu host event did not match its authoritative active-run scope."""


def _optional_text(value: Any, field_name: str) -> str:
    if value is None or value == "":
        return ""
    if not isinstance(value, str):
        raise PupuUnchainHostEventBoundaryError(
            f"host event {field_name} must be text"
        )
    normalized = value.strip()
    if not normalized:
        raise PupuUnchainHostEventBoundaryError(
            f"host event {field_name} must not be blank"
        )
    return normalized


@dataclass(frozen=True, slots=True)
class PupuUnchainHostEventAuthority:
    """Authoritative execution/attempt owner resolved outside the UI payload."""

    execution_id: str
    attempt_id: str
    interaction_id: str = ""
    origin: str = ""
    source_attempt_id: str = ""
    interaction_kind: str = ""

    def __post_init__(self) -> None:
        execution_id = _required_text(
            self.execution_id,
            "execution_id",
            identifier=True,
        )
        attempt_id = _required_text(
            self.attempt_id,
            "attempt_id",
            identifier=True,
        )
        origin = _required_text(self.origin, "origin", identifier=True)
        if origin not in _ALL_ORIGINS:
            raise PupuUnchainHostEventBoundaryError(
                f"unsupported host event origin: {origin}"
            )
        interaction_id = _optional_text(
            self.interaction_id,
            "interaction_id",
        )
        source_attempt_id = _optional_text(
            self.source_attempt_id,
            "source_attempt_id",
        )
        interaction_kind = _optional_text(
            self.interaction_kind,
            "interaction_kind",
        )
        if origin in _INTERACTION_ORIGINS and not interaction_id:
            raise PupuUnchainHostEventBoundaryError(
                "interaction host event authority requires interaction_id"
            )
        if origin in _INTERACTION_ORIGINS and not source_attempt_id:
            raise PupuUnchainHostEventBoundaryError(
                "interaction host event authority requires source_attempt_id"
            )
        if origin in _INTERACTION_ORIGINS and interaction_kind not in _INTERACTION_KINDS:
            raise PupuUnchainHostEventBoundaryError(
                "interaction host event authority requires a supported kind"
            )
        expected_kind = _PRESENTATION_KIND_BY_ORIGIN.get(origin)
        if expected_kind is not None and interaction_kind != expected_kind:
            raise PupuUnchainHostEventBoundaryError(
                "presentation origin does not match interaction kind"
            )
        if (
            origin in _LIVE_INTERACTION_ORIGINS
            and source_attempt_id != attempt_id
        ):
            raise PupuUnchainHostEventBoundaryError(
                "live interaction source must match the current attempt"
            )
        if origin == HOST_EVENT_ORIGIN_FALLBACK_FINAL and (
            interaction_id or source_attempt_id or interaction_kind
        ):
            raise PupuUnchainHostEventBoundaryError(
                "fallback final authority must not carry interaction identity"
            )
        object.__setattr__(self, "execution_id", execution_id)
        object.__setattr__(self, "attempt_id", attempt_id)
        object.__setattr__(self, "interaction_id", interaction_id)
        object.__setattr__(self, "origin", origin)
        object.__setattr__(self, "source_attempt_id", source_attempt_id)
        object.__setattr__(self, "interaction_kind", interaction_kind)


@dataclass(frozen=True, slots=True)
class PupuUnchainBoundHostEvent:
    """A host event admitted to one lane under an exact authority."""

    lane: str
    authority: PupuUnchainHostEventAuthority
    event: dict[str, Any]

    def __post_init__(self) -> None:
        if self.lane not in {
            HOST_EVENT_LANE_PRESENTATION,
            HOST_EVENT_LANE_SEMANTIC,
        }:
            raise PupuUnchainHostEventBoundaryError(
                f"unsupported host event lane: {self.lane}"
            )
        if not isinstance(self.authority, PupuUnchainHostEventAuthority):
            raise TypeError("authority must be a PuPu host event authority")
        if not isinstance(self.event, dict):
            raise TypeError("event must be a dict")
        object.__setattr__(self, "event", copy.deepcopy(self.event))


@dataclass(frozen=True, slots=True)
class PupuUnchainBoundInteractionResolution:
    """One receipt-backed live resolution admitted under exact authority."""

    authority: PupuUnchainHostEventAuthority
    event: dict[str, Any]
    receipt_id: str
    submitted_by: str
    response_json: str

    def __post_init__(self) -> None:
        if not isinstance(self.authority, PupuUnchainHostEventAuthority):
            raise TypeError("authority must be a PuPu host event authority")
        if not isinstance(self.event, dict):
            raise TypeError("event must be a dict")
        receipt_id = _required_text(
            self.receipt_id,
            "receipt_id",
            identifier=True,
        )
        submitted_by = _required_text(
            self.submitted_by,
            "submitted_by",
            identifier=True,
        )
        if not isinstance(self.response_json, str) or not self.response_json:
            raise TypeError("response_json must be non-empty text")
        try:
            json.loads(self.response_json)
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise PupuUnchainHostEventBoundaryError(
                "interaction response handoff must contain canonical JSON"
            ) from exc
        object.__setattr__(self, "event", copy.deepcopy(self.event))
        object.__setattr__(self, "receipt_id", receipt_id)
        object.__setattr__(self, "submitted_by", submitted_by)

    @property
    def response(self) -> Any:
        return json.loads(self.response_json)


def _assert_identity_match(
    event: Mapping[str, Any],
    *,
    authority: PupuUnchainHostEventAuthority,
) -> None:
    for field_name in ("execution_id", "session_id"):
        supplied = _optional_text(event.get(field_name), field_name)
        if supplied and supplied != authority.execution_id:
            raise PupuUnchainHostEventBoundaryError(
                f"host event {field_name} does not match execution authority"
            )
    for field_name in ("attempt_id", "run_id"):
        supplied = _optional_text(event.get(field_name), field_name)
        if supplied and supplied != authority.attempt_id:
            raise PupuUnchainHostEventBoundaryError(
                f"host event {field_name} does not match attempt authority"
            )
    supplied_source_run_id = _optional_text(
        event.get("source_run_id"),
        "source_run_id",
    )
    if (
        supplied_source_run_id
        and supplied_source_run_id != authority.source_attempt_id
    ):
        raise PupuUnchainHostEventBoundaryError(
            "host event source_run_id does not match source attempt authority"
        )
    supplied_interaction_id = _optional_text(
        event.get("interaction_id"),
        "interaction_id",
    )
    if (
        supplied_interaction_id
        and supplied_interaction_id != authority.interaction_id
    ):
        raise PupuUnchainHostEventBoundaryError(
            "host event interaction_id does not match interaction authority"
        )
    supplied_confirmation_id = _optional_text(
        event.get("confirmation_id"),
        "confirmation_id",
    )
    if (
        supplied_confirmation_id
        and supplied_confirmation_id != authority.interaction_id
    ):
        raise PupuUnchainHostEventBoundaryError(
            "host event confirmation_id does not match interaction authority"
        )
    source_refs = event.get("source_refs")
    if source_refs is not None:
        if not isinstance(source_refs, Mapping):
            raise PupuUnchainHostEventBoundaryError(
                "host event source_refs must be a mapping"
            )
        source_session_id = _optional_text(
            source_refs.get("session_id"),
            "source_refs.session_id",
        )
        if source_session_id and source_session_id != authority.execution_id:
            raise PupuUnchainHostEventBoundaryError(
                "host event source session does not match execution authority"
            )
        source_run_id = _optional_text(
            source_refs.get("source_run_id"),
            "source_refs.source_run_id",
        )
        if (
            source_run_id
            and source_run_id != authority.source_attempt_id
        ):
            raise PupuUnchainHostEventBoundaryError(
                "host event source run does not match source attempt authority"
            )


def _assert_canonical_identity_shape(
    event: Mapping[str, Any],
    *,
    lane: str,
    authority: PupuUnchainHostEventAuthority,
) -> None:
    """Require the identity fields consumed after the typed boundary."""

    if authority.origin not in _INTERACTION_ORIGINS:
        return
    if lane == HOST_EVENT_LANE_PRESENTATION:
        if (
            _optional_text(event.get("confirmation_id"), "confirmation_id")
            != authority.interaction_id
        ):
            raise PupuUnchainHostEventBoundaryError(
                "presentation host event requires exact confirmation identity"
            )
        tool_name = _optional_text(event.get("tool_name"), "tool_name")
        if not tool_name:
            raise PupuUnchainHostEventBoundaryError(
                "presentation host event requires tool_name"
            )
        if authority.interaction_kind == "human_input" and tool_name != "ask_user_question":
            raise PupuUnchainHostEventBoundaryError(
                "human-input presentation requires ask_user_question"
            )
        if authority.interaction_kind == "max_budget" and tool_name != "__continuation__":
            raise PupuUnchainHostEventBoundaryError(
                "max-budget presentation requires __continuation__"
            )
        if authority.interaction_kind == "tool_approval" and tool_name in {
            "ask_user_question",
            "__continuation__",
        }:
            raise PupuUnchainHostEventBoundaryError(
                "tool-approval presentation cannot use a reserved interaction tool"
            )
        if event.get("requires_confirmation") is not True:
            raise PupuUnchainHostEventBoundaryError(
                "presentation host event requires confirmation"
            )
        if not _optional_text(event.get("call_id"), "call_id"):
            raise PupuUnchainHostEventBoundaryError(
                "presentation host event requires call_id"
            )
        return
    if (
        _optional_text(event.get("interaction_id"), "interaction_id")
        != authority.interaction_id
    ):
        raise PupuUnchainHostEventBoundaryError(
            "semantic host event requires exact interaction identity"
        )
    source_refs = event.get("source_refs")
    if not isinstance(source_refs, Mapping):
        raise PupuUnchainHostEventBoundaryError(
            "semantic interaction event requires source_refs"
        )
    if set(source_refs) != {"session_id", "source_run_id"}:
        raise PupuUnchainHostEventBoundaryError(
            "semantic interaction source_refs has an invalid key set"
        )
    if (
        _optional_text(source_refs.get("session_id"), "source_refs.session_id")
        != authority.execution_id
        or _optional_text(
            source_refs.get("source_run_id"),
            "source_refs.source_run_id",
        )
        != authority.source_attempt_id
    ):
        raise PupuUnchainHostEventBoundaryError(
            "semantic interaction source_refs does not match authority"
        )
    if _optional_text(event.get("kind"), "kind") != authority.interaction_kind:
        raise PupuUnchainHostEventBoundaryError(
            "semantic interaction kind does not match authority"
        )
    outcome = _optional_text(event.get("outcome"), "outcome")
    if outcome not in _RESOLUTION_OUTCOMES_BY_KIND[authority.interaction_kind]:
        raise PupuUnchainHostEventBoundaryError(
            "semantic interaction outcome does not match interaction kind"
        )
    if not _optional_text(event.get("receipt_id"), "receipt_id"):
        raise PupuUnchainHostEventBoundaryError(
            "semantic interaction event requires durable receipt identity"
        )
    if not _optional_text(event.get("event_id"), "event_id"):
        raise PupuUnchainHostEventBoundaryError(
            "semantic interaction event requires event identity"
        )


def validate_pupu_unchain_bound_host_event(
    bound_event: PupuUnchainBoundHostEvent,
) -> None:
    """Revalidate at delivery so a mutable payload cannot escape its binding."""

    if not isinstance(bound_event, PupuUnchainBoundHostEvent):
        raise TypeError("bound_event must be a PuPu bound host event")
    authority = bound_event.authority
    event = bound_event.event
    event_type = _required_text(event.get("type"), "event.type")
    if bound_event.lane == HOST_EVENT_LANE_PRESENTATION:
        if authority.origin not in _PRESENTATION_ORIGINS:
            raise PupuUnchainHostEventBoundaryError(
                "semantic host event origin cannot enter presentation lane"
            )
        expected_type = "tool_call"
    elif bound_event.lane == HOST_EVENT_LANE_SEMANTIC:
        if authority.origin not in _SEMANTIC_ORIGINS:
            raise PupuUnchainHostEventBoundaryError(
                "presentation host event origin cannot enter semantic lane"
            )
        expected_type = "final_message"
    else:
        raise PupuUnchainHostEventBoundaryError(
            f"unsupported host event lane: {bound_event.lane}"
        )
    if event_type != expected_type:
        raise PupuUnchainHostEventBoundaryError(
            f"bound host event origin requires {expected_type}"
        )
    _assert_identity_match(event, authority=authority)
    _assert_canonical_identity_shape(
        event,
        lane=bound_event.lane,
        authority=authority,
    )
    if _optional_text(event.get("run_id"), "run_id") != authority.attempt_id:
        raise PupuUnchainHostEventBoundaryError(
            "bound host event lost its exact attempt identity"
        )


def validate_pupu_unchain_bound_interaction_resolution(
    resolution: PupuUnchainBoundInteractionResolution,
) -> None:
    """Revalidate the receipt-backed resolution immediately before ingress."""

    if not isinstance(resolution, PupuUnchainBoundInteractionResolution):
        raise TypeError("resolution must be a bound interaction resolution")
    authority = resolution.authority
    event = resolution.event
    if authority.origin != HOST_EVENT_ORIGIN_INTERACTION_RESOLUTION:
        raise PupuUnchainHostEventBoundaryError(
            "bound interaction resolution has the wrong origin"
        )
    if _required_text(event.get("type"), "event.type") != "interaction_resolved":
        raise PupuUnchainHostEventBoundaryError(
            "bound interaction resolution requires interaction_resolved"
        )
    _assert_identity_match(event, authority=authority)
    _assert_canonical_identity_shape(
        event,
        lane=HOST_EVENT_LANE_SEMANTIC,
        authority=authority,
    )
    if _optional_text(event.get("run_id"), "run_id") != authority.attempt_id:
        raise PupuUnchainHostEventBoundaryError(
            "bound interaction resolution lost its exact attempt identity"
        )
    if _optional_text(event.get("receipt_id"), "receipt_id") != resolution.receipt_id:
        raise PupuUnchainHostEventBoundaryError(
            "bound interaction resolution changed its durable receipt identity"
        )
    if not _optional_text(resolution.submitted_by, "submitted_by"):
        raise PupuUnchainHostEventBoundaryError(
            "bound interaction resolution requires submitted_by"
        )
    try:
        response = json.loads(resolution.response_json)
        canonical = json.dumps(
            response,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise PupuUnchainHostEventBoundaryError(
            "bound interaction response is not canonical JSON"
        ) from exc
    if canonical != resolution.response_json:
        raise PupuUnchainHostEventBoundaryError(
            "bound interaction response changed after receipt admission"
        )


class PupuUnchainHostEventBoundary:
    """Bind and deliver PuPu-owned host events without a raw durable escape hatch."""

    def __init__(
        self,
        *,
        active_bridge: Any,
        execution_id: str,
        attempt_id: str,
        enqueue: Callable[[dict[str, Any]], None],
    ) -> None:
        if active_bridge is None:
            raise TypeError("active_bridge is required")
        if not callable(enqueue):
            raise TypeError("enqueue must be callable")
        self._active_bridge = active_bridge
        self._execution_id = _required_text(
            execution_id,
            "execution_id",
            identifier=True,
        )
        self._attempt_id = _required_text(
            attempt_id,
            "attempt_id",
            identifier=True,
        )
        self._enqueue = enqueue
        self._interaction_delivery_lock = threading.Lock()
        self._delivered_interaction_receipts: set[tuple[str, str]] = set()
        bridge_execution_id = _required_text(
            getattr(active_bridge, "execution_id", None),
            "active_bridge.execution_id",
            identifier=True,
        )
        if bridge_execution_id != self._execution_id:
            raise PupuUnchainHostEventBoundaryError(
                "host event boundary execution does not match active bridge"
            )

    @property
    def execution_id(self) -> str:
        return self._execution_id

    @property
    def attempt_id(self) -> str:
        return self._attempt_id

    def _bind(
        self,
        event: dict[str, Any],
        *,
        authority: PupuUnchainHostEventAuthority,
        lane: str,
    ) -> PupuUnchainBoundHostEvent:
        if not isinstance(event, dict):
            raise TypeError("event must be a dict")
        if not isinstance(authority, PupuUnchainHostEventAuthority):
            raise TypeError("authority must be a PuPu host event authority")
        if (
            authority.execution_id != self._execution_id
            or authority.attempt_id != self._attempt_id
        ):
            raise PupuUnchainHostEventBoundaryError(
                "host event authority does not match boundary scope"
            )
        event_type = _required_text(event.get("type"), "event.type")
        if lane == HOST_EVENT_LANE_PRESENTATION:
            if authority.origin not in _PRESENTATION_ORIGINS:
                raise PupuUnchainHostEventBoundaryError(
                    "semantic host event origin cannot enter presentation lane"
                )
            if event_type != "tool_call":
                raise PupuUnchainHostEventBoundaryError(
                    "presentation host event must be a tool_call"
                )
        elif lane == HOST_EVENT_LANE_SEMANTIC:
            if authority.origin not in _SEMANTIC_ORIGINS:
                raise PupuUnchainHostEventBoundaryError(
                    "presentation host event origin cannot enter semantic lane"
                )
            expected_type = "final_message"
            if event_type != expected_type:
                raise PupuUnchainHostEventBoundaryError(
                    f"semantic host event origin requires {expected_type}"
                )
        else:
            raise PupuUnchainHostEventBoundaryError(
                f"unsupported host event lane: {lane}"
            )
        _assert_identity_match(event, authority=authority)
        bound_event = copy.deepcopy(event)
        bound_event["run_id"] = authority.attempt_id
        result = PupuUnchainBoundHostEvent(
            lane=lane,
            authority=authority,
            event=bound_event,
        )
        validate_pupu_unchain_bound_host_event(result)
        return result

    def bind_presentation(
        self,
        event: dict[str, Any],
        *,
        authority: PupuUnchainHostEventAuthority,
    ) -> PupuUnchainBoundHostEvent:
        return self._bind(
            event,
            authority=authority,
            lane=HOST_EVENT_LANE_PRESENTATION,
        )

    def bind_semantic(
        self,
        event: dict[str, Any],
        *,
        authority: PupuUnchainHostEventAuthority,
    ) -> PupuUnchainBoundHostEvent:
        return self._bind(
            event,
            authority=authority,
            lane=HOST_EVENT_LANE_SEMANTIC,
        )

    def bind_interaction_resolution(
        self,
        event: dict[str, Any],
        *,
        authority: PupuUnchainHostEventAuthority,
        durable_receipt: Any,
    ) -> PupuUnchainBoundInteractionResolution:
        from durable_interaction_host import DurableInteractionReceiptHandoff

        if not isinstance(durable_receipt, DurableInteractionReceiptHandoff):
            raise PupuUnchainHostEventBoundaryError(
                "active interaction resolution requires a persisted receipt handoff"
            )
        if not isinstance(authority, PupuUnchainHostEventAuthority):
            raise TypeError("authority must be a PuPu host event authority")
        if (
            authority.execution_id != self._execution_id
            or authority.attempt_id != self._attempt_id
        ):
            raise PupuUnchainHostEventBoundaryError(
                "interaction resolution authority does not match boundary scope"
            )
        if authority.origin != HOST_EVENT_ORIGIN_INTERACTION_RESOLUTION:
            raise PupuUnchainHostEventBoundaryError(
                "interaction resolution requires the dedicated origin"
            )
        if (
            durable_receipt.session_id != authority.execution_id
            or durable_receipt.interaction_id != authority.interaction_id
        ):
            raise PupuUnchainHostEventBoundaryError(
                "persisted receipt does not match interaction authority"
            )
        if not isinstance(event, dict):
            raise TypeError("event must be a dict")
        _assert_identity_match(event, authority=authority)
        bound_event = copy.deepcopy(event)
        bound_event["run_id"] = authority.attempt_id
        response_json = json.dumps(
            durable_receipt.response,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        result = PupuUnchainBoundInteractionResolution(
            authority=authority,
            event=bound_event,
            receipt_id=durable_receipt.receipt_id,
            submitted_by=durable_receipt.submitted_by,
            response_json=response_json,
        )
        validate_pupu_unchain_bound_interaction_resolution(result)
        return result

    def deliver_interaction_resolution(
        self,
        resolution: PupuUnchainBoundInteractionResolution,
    ) -> None:
        if not isinstance(resolution, PupuUnchainBoundInteractionResolution):
            raise TypeError("resolution must be a bound interaction resolution")
        authority = resolution.authority
        if (
            authority.execution_id != self._execution_id
            or authority.attempt_id != self._attempt_id
        ):
            raise PupuUnchainHostEventBoundaryError(
                "bound interaction resolution does not match boundary scope"
            )
        validate_pupu_unchain_bound_interaction_resolution(resolution)
        self._active_bridge.persist_bound_interaction_resolution(resolution)
        delivery_key = (
            resolution.authority.interaction_id,
            resolution.receipt_id,
        )
        with self._interaction_delivery_lock:
            if delivery_key in self._delivered_interaction_receipts:
                return
            self._enqueue(copy.deepcopy(resolution.event))
            self._delivered_interaction_receipts.add(delivery_key)

    def deliver(self, bound_event: PupuUnchainBoundHostEvent) -> None:
        if not isinstance(bound_event, PupuUnchainBoundHostEvent):
            raise TypeError("bound_event must be a PuPu bound host event")
        authority = bound_event.authority
        if (
            authority.execution_id != self._execution_id
            or authority.attempt_id != self._attempt_id
        ):
            raise PupuUnchainHostEventBoundaryError(
                "bound host event does not match boundary scope"
            )
        validate_pupu_unchain_bound_host_event(bound_event)
        if bound_event.lane == HOST_EVENT_LANE_SEMANTIC:
            self._active_bridge.persist_bound_host_event(bound_event)
        elif bound_event.lane != HOST_EVENT_LANE_PRESENTATION:
            raise PupuUnchainHostEventBoundaryError(
                f"unsupported host event lane: {bound_event.lane}"
            )
        self._enqueue(copy.deepcopy(bound_event.event))
