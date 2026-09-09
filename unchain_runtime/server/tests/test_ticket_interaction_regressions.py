"""Real Context ingress regressions for #261 (HTTP acceptance → live replay)."""
import copy

import pytest

from test_memory_v2_unchain_active_host_event_boundary import (
    EXECUTION_ID, ROOT_ATTEMPT_ID, _prepare_bridge, _bind_attempt,
    _receipt_handoff, _seed_interaction_request, _snapshot,
)
from memory_v2_unchain_host_event_boundary import PupuUnchainHostEventBoundary
from unchain.context.ingress import HostResolvedInteractionInput


@pytest.mark.parametrize("kind,response", [
    ("tool_approval", {"approved": True, "reason": "", "modified_arguments": None}),
    ("human_input", {"request_id": "ask", "selected_values": ["yes"], "other_text": None}),
    ("max_budget", {"approved": True}),
])
def test_live_resolution_replays_canonical_acceptance_with_ui_receipt(tmp_path, monkeypatch, kind, response):
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    queued = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge, execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID, enqueue=queued.append,
    )
    attempt = bridge.attempt_for_run(ROOT_ATTEMPT_ID).bundle
    for occurrence in ("first", "second"):
        interaction_id, handoff = _receipt_handoff(
            kind=kind, occurrence=occurrence, response=response,
        )
        _seed_interaction_request(bridge, attempt_id=ROOT_ATTEMPT_ID,
                                  interaction_id=interaction_id, kind=kind, call_id=occurrence)
        # record_interaction_receipt writes this exact canonical input before
        # waking the live callback, while retaining the UI actor in its receipt.
        accepted = attempt.ingress.persist(HostResolvedInteractionInput(
            attempt=attempt.attempt, interaction_id=interaction_id,
            response=copy.deepcopy(response), submitted_by="user",
        ))
        assert handoff.submitted_by == "ui:test"
        from unchain_adapter import _make_interaction_resolution_writer
        writer = _make_interaction_resolution_writer(
            queued.append, interaction_id=interaction_id, kind=kind,
            session_id=EXECUTION_ID, source_run_id=ROOT_ATTEMPT_ID,
            require_durable_receipt=True, active_host_event_boundary=boundary,
        )
        writer(outcome="approved", durable_receipt=handoff)
        writer(outcome="approved", durable_receipt=handoff)
        resolutions = [event for event in _snapshot(bridge, ROOT_ATTEMPT_ID).events
                       if event.event_type == "interaction.resolved"
                       and event.payload["interaction_id"] == interaction_id]
        assert resolutions == [accepted.event]
        assert handoff.submitted_by == "ui:test"
    assert len(queued) == 2


@pytest.mark.parametrize("level", ["none", "minimal", "max"])
def test_codex_stale_effort_is_mapped_before_provider_wire(level):
    import unchain_adapter as adapter
    payload = adapter._build_payload("openai", {
        "modelId": "openai:gpt-5.3-codex", "reasoningEffort": level,
    })
    assert payload == {"reasoning": {"effort": "medium"}}


def test_codex_catalog_matches_documented_provider_ladder():
    import unchain_adapter as adapter
    caps = adapter._load_raw_capability_catalog()["gpt-5.3-codex"]
    assert caps["reasoning_efforts"] == ["low", "medium", "high", "xhigh"]


def test_provider_effort_error_is_actionable():
    from route_chat import _normalize_stream_error
    error = RuntimeError("HTTP 400 unsupported_value parameter=reasoning.effort")
    code, message = _normalize_stream_error(error)
    assert code == "unsupported_reasoning_effort"
    assert "effort" in message.lower() and "default" in message.lower()


def test_every_offered_codex_effort_passes_a_strict_provider_consumer():
    import unchain_adapter as adapter

    def strict_provider(payload):
        assert set(payload) == {"reasoning"}
        assert set(payload["reasoning"]) == {"effort"}
        assert payload["reasoning"]["effort"] in ("low", "medium", "high", "xhigh")

    catalog = adapter.get_model_capability_catalog()
    for effort in catalog["openai:gpt-5.3-codex"]["reasoning_efforts"]:
        strict_provider(adapter._build_payload("openai", {
            "modelId": "openai:gpt-5.3-codex", "reasoningEffort": effort,
            "untrusted_provider_field": True,
        }))


def test_graph_step_model_wins_over_the_parent_effort_ladder():
    import unchain_adapter as adapter
    payload = adapter._build_payload("openai", {
        "modelId": "openai:gpt-5", "reasoningEffort": "minimal",
    }, model="gpt-5.3-codex")
    assert payload == {"reasoning": {"effort": "medium"}}
