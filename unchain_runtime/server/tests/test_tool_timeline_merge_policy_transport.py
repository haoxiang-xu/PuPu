from __future__ import annotations

import unchain_adapter
import memory_v2_unchain_active_bridge as cold_bridge
from unchain.tools import Tool
from unchain.tools.toolkit import Toolkit


def test_tool_metadata_transport_preserves_declared_timeline_policy():
    tool_obj = Tool(name="lookup", timeline_merge_policy="always")
    toolkit = Toolkit({"lookup": tool_obj})
    unchain_adapter._set_runtime_toolkit_metadata(
        toolkit, toolkit_id="builtin.core", toolkit_name="Core"
    )
    index = unchain_adapter._build_toolkit_tool_index([toolkit])
    assert index["lookup"]["timeline_merge_policy"] == "always"

    declared = {
        "type": "tool_call",
        "tool_name": "lookup",
        "call_id": "old-call",
        "timeline_merge_policy": "never",
    }
    enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(
        declared, index
    )
    assert enriched["timeline_merge_policy"] == "never"

    live_legacy = {
        "type": "tool_call",
        "tool_name": "lookup",
        "call_id": "new-call",
    }
    enriched_live = unchain_adapter._enrich_tool_event_with_toolkit_metadata(
        live_legacy, index
    )
    assert "timeline_merge_policy" not in enriched_live


def test_cold_policy_lookup_requires_exact_journal_cursor_and_tool_identity(monkeypatch):
    event = type(
        "Event",
        (),
        {
            "event_type": "tool_call",
            "event_id": "evt-7",
            "store_seq": 7,
            "attempt": type(
                "Attempt",
                (),
                {
                    "generation": type("Generation", (), {"execution_id": "session"})(),
                    "attempt_id": "attempt",
                },
            )(),
            "payload": {
                "call_id": "call",
                "tool_name": "lookup",
                "timeline_merge_policy": "never",
            },
        },
    )()
    journal = type(
        "Journal",
        (),
        {"capture_snapshot": lambda self: type("Snapshot", (), {"events": (event,)})()},
    )()
    monkeypatch.setattr(
        cold_bridge,
        "pupu_unchain_cold_active_admission",
        lambda **kwargs: kwargs
        == {
            "owner_chat_id": "owner",
            "session_id": "session",
            "execution_id": "session",
        },
    )
    monkeypatch.setattr(
        cold_bridge, "_open_existing_cold_context_journal", lambda _session: journal
    )
    lookup = cold_bridge.pupu_unchain_cold_tool_call_timeline_policy
    request = {
        "owner_chat_id": "owner",
        "session_id": "session",
        "source_attempt_id": "attempt",
        "call_id": "call",
        "tool_name": "lookup",
        "intent_cursor": {
            "schema": "unchain.event_cursor.v1",
            "store_seq": 7,
            "event_id": "evt-7",
        },
    }
    assert lookup(**request) == "never"
    assert lookup(
        **{**request, "intent_cursor": {**request["intent_cursor"], "store_seq": 8}}
    ) is None
    assert lookup(**{**request, "call_id": "other"}) is None
    assert lookup(**{**request, "source_attempt_id": "other-attempt"}) is None
    event.payload["timeline_merge_policy"] = ["always"]
    assert lookup(**request) == "never"
    event.payload.pop("timeline_merge_policy")
    assert lookup(**request) is None
