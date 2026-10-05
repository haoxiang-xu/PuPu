from __future__ import annotations

import copy
import json
from pathlib import Path
from types import MappingProxyType
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


@pytest.mark.parametrize("store_seq", [0, -1, True, 9_007_199_254_740_992])
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


@pytest.mark.parametrize("iteration", [-1, True, 9_007_199_254_740_992])
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


def _merge_overrides(target, overrides):
    for key, value in overrides.items():
        if key == "intent_cursor" and isinstance(value, dict):
            target.setdefault("intent_cursor", {}).update(value)
        else:
            target[key] = value
    return target


def test_descriptor_validator_matches_shared_contract_vectors_without_mutating_input():
    fixture = Path(__file__).parents[3] / "src/SERVICEs/runtime_events/fixtures/tool_call_ref_v1_contract.json"
    vectors = json.loads(fixture.read_text(encoding="utf-8"))

    failures = []
    for vector in vectors["descriptor_vectors"]:
        descriptor = _merge_overrides(
            copy.deepcopy(vectors["base"]), copy.deepcopy(vector["overrides"])
        )
        original = copy.deepcopy(descriptor)
        validated = pupu_tool_call_ref.validate_tool_call_ref(descriptor)

        if (validated is not None) is not vector["valid"]:
            failures.append(vector["name"])
        assert descriptor == original, vector["name"]
        if validated is not None:
            for path in (("intent_cursor", "store_seq"), ("iteration",)):
                if path == ("iteration",) and "iteration" not in descriptor:
                    continue
                value = validated
                source = descriptor
                for key in path:
                    value = value[key]
                    source = source[key]
                if isinstance(source, float) and type(value) is not int:
                    failures.append(f"{vector['name']}:not_canonicalized")

    assert failures == []


@pytest.mark.parametrize(
    ("store_seq", "payload"),
    [(7.0, {}), (7, {"iteration": 2.0})],
)
def test_resolver_keeps_canonical_journal_integer_fields_strict(store_seq, payload):
    assert pupu_tool_call_ref.resolve_tool_call_ref(
        _tool_intent(store_seq=store_seq, payload=payload),
        expected_execution_id="execution-a",
        expected_original_attempt_id="attempt-a",
        expected_call_id="call-a",
        expected_tool_name="lookup",
    ) is None


def test_display_metadata_joins_only_one_exact_intent_and_keeps_policy_separate():
    event = _tool_intent(payload={"toolkit_id": "core", "arguments": {}})
    metadata = pupu_tool_call_ref.resolve_tool_call_display_metadata(
        [event],
        expected_execution_id="execution-a",
        expected_original_attempt_id="attempt-a",
        expected_call_id="call-a",
        expected_tool_name="lookup",
        expected_iteration=2,
        expected_arguments={},
    )

    assert metadata == {
        "call_ref": {
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
            "toolkit_id": "core",
        },
        "timeline_merge_policy_declared": True,
        "timeline_merge_policy": "always",
        "original_arguments_declared": True,
        "original_arguments": {},
    }
    assert "timeline_merge_policy" not in metadata["call_ref"]


def test_display_metadata_thaws_immutable_journal_json_without_mutating_source():
    intent = _tool_intent(
        payload={
            "arguments": MappingProxyType(
                {"query": "x", "filters": (MappingProxyType({"tag": "a"}),)}
            ),
            "timeline_merge_policy": "always",
        }
    )
    expected_arguments = {"query": "x", "filters": [{"tag": "a"}]}

    metadata = pupu_tool_call_ref.resolve_tool_call_display_metadata(
        [intent],
        expected_execution_id="execution-a",
        expected_original_attempt_id="attempt-a",
        expected_call_id="call-a",
        expected_tool_name="lookup",
        expected_arguments=expected_arguments,
    )

    assert metadata is not None
    assert metadata["original_arguments"] == expected_arguments
    assert isinstance(intent.payload["arguments"], MappingProxyType)
    assert isinstance(intent.payload["arguments"]["filters"], tuple)


def test_display_metadata_rejects_ambiguous_or_conflicting_explicit_evidence():
    event = _tool_intent()
    duplicate = _tool_intent(event_id="event-b", store_seq=8)
    expected = {
        "expected_execution_id": "execution-a",
        "expected_original_attempt_id": "attempt-a",
        "expected_call_id": "call-a",
        "expected_tool_name": "lookup",
    }

    assert pupu_tool_call_ref.resolve_tool_call_display_metadata(
        [event, duplicate], **expected
    ) is None
    assert pupu_tool_call_ref.resolve_tool_call_display_metadata(
        [event], explicit_intent_cursor=None, **expected
    ) is None
    assert pupu_tool_call_ref.resolve_tool_call_display_metadata(
        [event],
        explicit_intent_cursor={
            "schema": "unchain.event_cursor.v1",
            "store_seq": 8,
            "event_id": "foreign",
        },
        **expected,
    ) is None
    assert pupu_tool_call_ref.resolve_tool_call_display_metadata(
        [event],
        explicit_call_ref={"schema": "pupu.tool_call_ref.v2"},
        **expected,
    ) is None


def test_display_tracker_requires_exact_durable_interaction_cursor():
    event = _tool_intent(payload={"arguments": {}})
    metadata = pupu_tool_call_ref.resolve_tool_call_display_metadata(
        [event],
        expected_execution_id="execution-a",
        expected_original_attempt_id="attempt-a",
        expected_call_id="call-a",
        expected_tool_name="lookup",
        expected_arguments={},
    )
    tracker = pupu_tool_call_ref.ToolCallDisplayMetadataTracker()
    tracker.remember(metadata)
    request = {
        "interaction_request": {
            "interaction_id": "interaction-a",
            "kind": "tool_approval",
            "session_id": "execution-a",
            "source_run_id": "attempt-a",
            "payload": {"call_id": "call-a", "tool_name": "lookup"},
            "subject": {
                "extra": {
                    "context_v2_tool_authority": {
                        "intent_cursor": metadata["call_ref"]["intent_cursor"]
                    }
                }
            },
        }
    }
    tracker.observe_interaction_request(request)

    sidecar = tracker.resolve_for_interaction(
        execution_id="execution-a",
        original_attempt_id="attempt-a",
        interaction_id="interaction-a",
        call_id="call-a",
        tool_name="lookup",
    )
    assert isinstance(sidecar, pupu_tool_call_ref.ToolCallDisplayMetadataSidecar)
    assert sidecar.to_dict() == metadata
    assert tracker.resolve_for_interaction(
        execution_id="execution-a",
        original_attempt_id="other-attempt",
        interaction_id="interaction-a",
        call_id="call-a",
        tool_name="lookup",
    ) is None
    contradictory = copy.deepcopy(request)
    contradictory["interaction_request"]["subject"]["extra"][
        "context_v2_tool_authority"
    ]["intent_cursor"]["store_seq"] = 8
    tracker.observe_interaction_request(contradictory)
    assert tracker.resolve_for_interaction(
        execution_id="execution-a",
        original_attempt_id="attempt-a",
        interaction_id="interaction-a",
        call_id="call-a",
        tool_name="lookup",
    ) is None


def test_runtime_interaction_join_rejects_outer_owner_and_proof_contradictions():
    intent = _tool_intent(payload={"arguments": {"query": "x"}})
    metadata = pupu_tool_call_ref.resolve_tool_call_display_metadata(
        [intent],
        expected_execution_id="execution-a",
        expected_original_attempt_id="attempt-a",
        expected_call_id="call-a",
        expected_tool_name="lookup",
    )
    tracker = pupu_tool_call_ref.ToolCallDisplayMetadataTracker()
    tracker.remember(metadata)
    interaction_request = {
        "interaction_id": "interaction-a",
        "kind": "tool_approval",
        "session_id": "execution-a",
        "source_run_id": "attempt-a",
        "payload": {"call_id": "call-a", "tool_name": "lookup"},
        "subject": {
            "extra": {
                "context_v2_tool_authority": {
                    "intent_cursor": metadata["call_ref"]["intent_cursor"]
                }
            }
        },
    }
    event = {
        "type": "interaction_requested",
        "run_id": "attempt-a",
        "session_id": "execution-a",
        "execution_id": "execution-a",
        "iteration": 2,
        "interaction_request": interaction_request,
    }
    tracker.observe_interaction_request(event)
    bridge = SimpleNamespace(execution_id="execution-a")

    assert pupu_tool_call_ref.resolve_tool_call_display_metadata_for_runtime_event(
        bridge, event, tracker
    ) == metadata

    contradictory_events = []
    for field, value in (
        ("session_id", "foreign-execution"),
        ("execution_id", "foreign-execution"),
        ("run_id", "foreign-attempt"),
        ("iteration", 3),
    ):
        contradictory = copy.deepcopy(event)
        contradictory[field] = value
        contradictory_events.append(contradictory)
    contradictory_ref = copy.deepcopy(event)
    contradictory_ref["call_ref"] = {
        **metadata["call_ref"],
        "original_attempt_id": "foreign-attempt",
    }
    contradictory_events.append(contradictory_ref)
    contradictory_cursor = copy.deepcopy(event)
    contradictory_cursor["intent_cursor"] = {
        **metadata["call_ref"]["intent_cursor"],
        "store_seq": 8,
    }
    contradictory_events.append(contradictory_cursor)

    for contradictory in contradictory_events:
        assert pupu_tool_call_ref.resolve_tool_call_display_metadata_for_runtime_event(
            bridge, contradictory, tracker
        ) is None

def test_call_ref_metadata_is_closed_and_bound_to_the_exact_cursor():
    call_ref = {
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
    metadata = {
        "schema": "pupu.tool_call_ref_metadata.v1",
        "intent_cursor": copy.deepcopy(call_ref["intent_cursor"]),
        "timeline_merge_policy_declared": False,
        "original_arguments_declared": True,
        "original_arguments": {"query": "x"},
    }

    assert pupu_tool_call_ref.validate_tool_call_ref_metadata(
        metadata, call_ref=call_ref
    ) == metadata
    assert pupu_tool_call_ref.validate_tool_call_ref_metadata(
        {**metadata, "extra": 1}, call_ref=call_ref
    ) is None
    assert pupu_tool_call_ref.validate_tool_call_ref_metadata(
        {**metadata, "timeline_merge_policy": "always"}, call_ref=call_ref
    ) is None
    assert pupu_tool_call_ref.validate_tool_call_ref_metadata(
        {**metadata, "intent_cursor": {**metadata["intent_cursor"], "store_seq": 8}},
        call_ref=call_ref,
    ) is None
    assert pupu_tool_call_ref.validate_tool_call_ref_metadata(
        {**metadata, "original_arguments_declared": False}, call_ref=call_ref
    ) is None
