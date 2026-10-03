from __future__ import annotations

from types import SimpleNamespace

import pupu_tool_call_ref
import pytest


def _tool_intent(
    *,
    execution_id: str = "execution-a",
    attempt_id: str = "attempt-a",
    event_id: str = "event-a",
    store_seq: int = 7,
    call_id: str = "call-a",
    tool_name: str = "lookup",
    include_iteration: bool = True,
    payload: dict | None = None,
):
    intent_payload = {
        "call_id": call_id,
        "tool_name": tool_name,
        "timeline_merge_policy": "always",
    }
    if include_iteration:
        intent_payload["iteration"] = 2
    if payload is not None:
        intent_payload.update(payload)
    generation = SimpleNamespace(execution_id=execution_id)
    attempt = SimpleNamespace(
        generation=generation,
        attempt_id=attempt_id,
    )
    return SimpleNamespace(
        event_type="tool_call",
        event_id=event_id,
        store_seq=store_seq,
        attempt=attempt,
        payload=intent_payload,
    )


def test_resolver_builds_closed_descriptor_from_exact_original_intent():
    descriptor = pupu_tool_call_ref.resolve_tool_call_ref(
        _tool_intent(payload={"toolkit_id": "builtin.core"}),
        expected_execution_id="execution-a",
        expected_original_attempt_id="attempt-a",
        expected_call_id="call-a",
        expected_tool_name="lookup",
    )

    assert descriptor == {
        "schema": "pupu.tool_call_ref.v1",
        "execution_id": "execution-a",
        "original_attempt_id": "attempt-a",
        "call_id": "call-a",
        "tool_name": "lookup",
        "intent_cursor": {
            "schema": "unchain.event_cursor.v1",
            "store_seq": 7,
            "event_id": "event-a",
        },
        "iteration": 2,
        "toolkit_id": "builtin.core",
    }
    assert "timeline_merge_policy" not in descriptor


def test_resolver_omits_unproven_optional_metadata():
    descriptor = pupu_tool_call_ref.resolve_tool_call_ref(
        _tool_intent(include_iteration=False),
        expected_execution_id="execution-a",
        expected_original_attempt_id="attempt-a",
        expected_call_id="call-a",
        expected_tool_name="lookup",
    )

    assert descriptor is not None
    assert "iteration" not in descriptor
    assert "toolkit_id" not in descriptor
    assert pupu_tool_call_ref.resolve_tool_call_ref(
        _tool_intent(payload={"iteration": None}),
        expected_execution_id="execution-a",
        expected_original_attempt_id="attempt-a",
        expected_call_id="call-a",
        expected_tool_name="lookup",
    ) is None


def test_resolver_rejects_conflicting_or_unknown_scope():
    common = {
        "expected_execution_id": "execution-a",
        "expected_original_attempt_id": "attempt-a",
        "expected_call_id": "call-a",
        "expected_tool_name": "lookup",
    }
    assert pupu_tool_call_ref.resolve_tool_call_ref(
        _tool_intent(execution_id="execution-b"), **common
    ) is None
    assert pupu_tool_call_ref.resolve_tool_call_ref(
        _tool_intent(attempt_id="attempt-b"), **common
    ) is None
    assert pupu_tool_call_ref.resolve_tool_call_ref(
        _tool_intent(payload={"tool_name": "other"}), **common
    ) is None
    assert pupu_tool_call_ref.resolve_tool_call_ref(
        _tool_intent(event_id=""), **common
    ) is None
    assert pupu_tool_call_ref.resolve_tool_call_ref(
        _tool_intent(),
        **{**common, "expected_call_id": "other-call"},
    ) is None
    assert pupu_tool_call_ref.resolve_tool_call_ref(
        _tool_intent(),
        **{**common, "expected_execution_id": ""},
    ) is None
    assert pupu_tool_call_ref.resolve_tool_call_ref(
        SimpleNamespace(event_type="tool_result"), **common
    ) is None


def test_descriptor_validator_enforces_exact_keys_types_and_nested_cursor():
    descriptor = {
        "schema": "pupu.tool_call_ref.v1",
        "execution_id": "execution-a",
        "original_attempt_id": "attempt-a",
        "call_id": "call-a",
        "tool_name": "lookup",
        "intent_cursor": {
            "schema": "unchain.event_cursor.v1",
            "store_seq": 7,
            "event_id": "event-a",
        },
        "iteration": 2,
    }

    assert pupu_tool_call_ref.validate_tool_call_ref(descriptor) == descriptor
    assert pupu_tool_call_ref.validate_tool_call_ref(
        {**descriptor, "unexpected": "ignored"}
    ) is None
    assert pupu_tool_call_ref.validate_tool_call_ref(
        {**descriptor, "iteration": True}
    ) is None
    assert pupu_tool_call_ref.validate_tool_call_ref(
        {
            **descriptor,
            "intent_cursor": {
                **descriptor["intent_cursor"],
                "store_seq": True,
            },
        }
    ) is None
    assert pupu_tool_call_ref.validate_tool_call_ref(
        {
            **descriptor,
            "intent_cursor": {
                **descriptor["intent_cursor"],
                "unexpected": "ignored",
            },
        }
    ) is None


@pytest.mark.parametrize("store_seq", [0, -1, 1.0, True, 9_007_199_254_740_992])
def test_descriptor_validator_rejects_invalid_cursor_sequence(store_seq):
    descriptor = {
        "schema": "pupu.tool_call_ref.v1",
        "execution_id": "execution-a",
        "original_attempt_id": "attempt-a",
        "call_id": "call-a",
        "tool_name": "lookup",
        "intent_cursor": {
            "schema": "unchain.event_cursor.v1",
            "store_seq": store_seq,
            "event_id": "event-a",
        },
    }

    assert pupu_tool_call_ref.validate_tool_call_ref(descriptor) is None


@pytest.mark.parametrize("iteration", [-1, 1.0, True, 9_007_199_254_740_992])
def test_descriptor_validator_rejects_invalid_optional_iteration(iteration):
    descriptor = {
        "schema": "pupu.tool_call_ref.v1",
        "execution_id": "execution-a",
        "original_attempt_id": "attempt-a",
        "call_id": "call-a",
        "tool_name": "lookup",
        "intent_cursor": {
            "schema": "unchain.event_cursor.v1",
            "store_seq": 7,
            "event_id": "event-a",
        },
        "iteration": iteration,
    }

    assert pupu_tool_call_ref.validate_tool_call_ref(descriptor) is None


def test_descriptor_validator_rejects_null_optional_identity_evidence():
    descriptor = {
        "schema": "pupu.tool_call_ref.v1",
        "execution_id": "execution-a",
        "original_attempt_id": "attempt-a",
        "call_id": "call-a",
        "tool_name": "lookup",
        "intent_cursor": {
            "schema": "unchain.event_cursor.v1",
            "store_seq": 7,
            "event_id": "event-a",
        },
        "toolkit_id": None,
    }

    assert pupu_tool_call_ref.validate_tool_call_ref(descriptor) is None


def test_descriptor_validator_returns_independent_plain_data():
    source = {
        "schema": "pupu.tool_call_ref.v1",
        "execution_id": "execution-a",
        "original_attempt_id": "attempt-a",
        "call_id": "call-a",
        "tool_name": "lookup",
        "intent_cursor": {
            "schema": "unchain.event_cursor.v1",
            "store_seq": 7,
            "event_id": "event-a",
        },
    }

    validated = pupu_tool_call_ref.validate_tool_call_ref(source)
    source["execution_id"] = "foreign"
    source["intent_cursor"]["event_id"] = "foreign-event"

    assert validated["execution_id"] == "execution-a"
    assert validated["intent_cursor"]["event_id"] == "event-a"


def test_descriptor_validator_rejects_missing_null_blank_and_unknown_versions():
    descriptor = {
        "schema": "pupu.tool_call_ref.v1",
        "execution_id": "execution-a",
        "original_attempt_id": "attempt-a",
        "call_id": "call-a",
        "tool_name": "lookup",
        "intent_cursor": {
            "schema": "unchain.event_cursor.v1",
            "store_seq": 7,
            "event_id": "event-a",
        },
    }

    assert pupu_tool_call_ref.validate_tool_call_ref(
        {key: value for key, value in descriptor.items() if key != "call_id"}
    ) is None
    assert pupu_tool_call_ref.validate_tool_call_ref(
        {**descriptor, "call_id": None}
    ) is None
    assert pupu_tool_call_ref.validate_tool_call_ref(
        {**descriptor, "schema": "pupu.tool_call_ref.v2"}
    ) is None
    assert pupu_tool_call_ref.validate_tool_call_ref(
        {
            **descriptor,
            "intent_cursor": {
                **descriptor["intent_cursor"],
                "schema": "unchain.event_cursor.v2",
            },
        }
    ) is None
