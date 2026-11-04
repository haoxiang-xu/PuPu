"""Private, in-memory attribution for live native Skeleton child observations.

The carrier is attached only after the real child Journal callback and the
native observation gate have both accepted an event. It is stripped before
RuntimeEventBridge normalization and is never a durable event field.
"""
from __future__ import annotations

from dataclasses import dataclass


_KEY = "_pupu_skeleton_child_attribution"


@dataclass(frozen=True)
class ChildNodeAttribution:
    root_run_id: str
    parent_run_id: str
    child_run_id: str
    graph_id: str
    node_run_id: str
    source_type: str


@dataclass(frozen=True)
class ChildEndAttribution:
    root_run_id: str
    parent_run_id: str
    child_run_id: str
    graph_id: str


def attach_node_attribution(event, attribution):
    if type(event) is not dict or type(attribution) is not ChildNodeAttribution:
        raise TypeError("native child node attribution must be exact")
    if event.get("run_id") != attribution.node_run_id:
        raise ValueError("native child node attribution does not own this event")
    if _KEY in event:
        raise ValueError("native child event already has private attribution")
    return {**event, _KEY: attribution}


def attach_end_attribution(event, attribution):
    if type(event) is not dict or type(attribution) is not ChildEndAttribution:
        raise TypeError("native child End attribution must be exact")
    if event.get("run_id") != attribution.child_run_id or event.get("type") != "final_message":
        raise ValueError("native child End attribution does not own this event")
    if _KEY in event:
        raise ValueError("native child End already has private attribution")
    return {**event, _KEY: attribution}


def strip_attribution(event):
    if type(event) is not dict:
        return event, None
    value = event.get(_KEY)
    if type(value) not in {ChildNodeAttribution, ChildEndAttribution}:
        # A plain mapping cannot create trusted attribution.
        return {key: item for key, item in event.items() if key != _KEY}, None
    clean = {key: item for key, item in event.items() if key != _KEY}
    if type(value) is ChildNodeAttribution and clean.get("run_id") != value.node_run_id:
        raise ValueError("native child node attribution changed before projection")
    if type(value) is ChildEndAttribution and (
        clean.get("run_id") != value.child_run_id or clean.get("type") != "final_message"
    ):
        raise ValueError("native child End attribution changed before projection")
    return clean, value


def project_attribution(payload, attribution, *, root_run_id):
    if type(payload) is not dict:
        return payload
    if type(attribution) is ChildNodeAttribution:
        if attribution.root_run_id != root_run_id:
            raise ValueError("native child event belongs to another root attempt")
        if payload.get("run_id") == attribution.node_run_id:
            links = payload.get("links")
            links = dict(links) if type(links) is dict else {}
            if not links.get("parent_run_id"):
                links["parent_run_id"] = attribution.child_run_id
            payload["links"] = links
            return payload
        # These Core branches deliberately normalize a source-N event to the
        # nested child's C2 identity. Their official parent link must remain N.
        official_nested_types = {
            "subagent_started", "agent_thread_spawned",
            "subagent_return_handoff_started", "subagent_completed",
            "agent_thread_completed", "subagent_return_handoff_completed",
            "subagent_failed", "agent_thread_failed", "subagent_tool_settled",
            "subagent_handoff",
        }
        links = payload.get("links")
        if (attribution.source_type not in official_nested_types
                or type(links) is not dict
                or links.get("parent_run_id") != attribution.node_run_id):
            raise ValueError("Core nested child identity has no verified parent link")
        # Preserve the exact Core child identity and parent edge.
        return payload
    if type(attribution) is ChildEndAttribution:
        if attribution.root_run_id != root_run_id or payload.get("run_id") != attribution.child_run_id:
            raise ValueError("native child End belongs to another run")
        links = payload.get("links")
        links = dict(links) if type(links) is dict else {}
        if not links.get("parent_run_id"):
            links["parent_run_id"] = attribution.parent_run_id
        payload["links"] = links
    return payload
