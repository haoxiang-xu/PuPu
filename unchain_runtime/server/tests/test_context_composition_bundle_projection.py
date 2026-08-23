from __future__ import annotations

import copy
import json
import sys
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import app as miso_app  # noqa: E402
import context_composition_capability as capability  # noqa: E402
import routes as miso_routes  # noqa: E402
from context_composition_bundle_projection import (  # noqa: E402
    project_context_composition_availability,
)
from run_bundle_adapter import project_run_bundle  # noqa: E402
from unchain.run_bundle import (  # noqa: E402
    ProviderCallIdentity,
    ProviderCallReceipt,
    ProviderCallTiming,
    ProviderCallUsage,
    RunBundleReducer,
    RunIdentity,
    RunLifecycle,
)


EXTENSION_KEY = "unchain.context/context_composition_v1"


class _BootstrapModule:
    @classmethod
    def from_private_hint(cls, private_hint):
        return (cls, private_hint)


def _ready() -> capability.ContextCompositionCapabilityVerdict:
    return capability.ContextCompositionCapabilityVerdict(
        ready=True,
        reason="available",
        bootstrap_module=_BootstrapModule,
    )


def _valid_extension() -> dict:
    return {
        "schema": "unchain.context/context_composition_v1",
        "method": "utf8_heuristic_v1",
        "quality": "reconciled_estimate",
        "context_window_tokens": 1_000,
        "wire": {
            "envelope_sha256": f"sha256:{'b' * 64}",
            "route_name": "primary",
            "route_sha256": f"sha256:{'c' * 64}",
            "context_mode": "semantic",
        },
        "categories": [
            {
                "id": "skills",
                "tokens": 3,
                "source_count": 1,
                "subtypes": [
                    {
                        "id": "expanded_invocation",
                        "tokens": 3,
                        "source_count": 1,
                    }
                ],
            }
        ],
        "attributed_tokens": 3,
        "residual_tokens": 97,
        "coverage": {
            "status": "complete",
            "manifest_items": 1,
            "matched_items": 1,
            "wire_surfaces": 1,
            "matched_surfaces": 1,
        },
    }


def _producer_bundle(extension: object = ...) -> dict:
    receipt_extensions = (
        {} if extension is ... else {EXTENSION_KEY: copy.deepcopy(extension)}
    )
    identity = RunIdentity(
        execution_id="chat-composition-bundle",
        attempt_id="attempt-composition-bundle",
        root_run_id="run-composition-bundle",
        run_id="run-composition-bundle",
        parent_run_id=None,
        relation="root",
    )
    receipt = ProviderCallReceipt(
        identity=ProviderCallIdentity(
            execution_id="chat-composition-bundle",
            attempt_id="attempt-composition-bundle",
            root_run_id="run-composition-bundle",
            owner_run_id="run-composition-bundle",
            parent_run_id=None,
            iteration=0,
            retry_ordinal=0,
            purpose="agent.turn",
            request_sha256="a" * 64,
            route="responses.create",
        ),
        provider="openai",
        model="gpt-5",
        status="completed",
        timing=ProviderCallTiming(
            started_at="2026-08-15T00:00:00.000000000Z",
            completed_at="2026-08-15T00:00:01.000000000Z",
        ),
        usage=ProviderCallUsage(
            input_uncached_tokens=100,
            input_cache_read_tokens=0,
            input_cache_write_tokens=0,
            input_total_tokens=100,
            output_visible_tokens=4,
            output_reasoning_tokens=1,
            output_total_tokens=5,
            total_tokens=105,
            source="provider_observed",
        ),
        extensions=receipt_extensions,
    )
    return RunBundleReducer.reduce(
        identity=identity,
        lifecycle=RunLifecycle(
            status="completed",
            started_at="2026-08-15T00:00:00.000000000Z",
            completed_at="2026-08-15T00:00:01.000000000Z",
        ),
        receipts=(receipt,),
    ).to_dict()


def _events(bundle: dict):
    return iter(
        [
            {"type": "stream_summary", "bundle": copy.deepcopy(bundle)},
            {
                "type": "final_message",
                "run_id": "run-composition-bundle",
                "iteration": 0,
                "content": "done",
            },
        ]
    )


def _done_payload(payload_text: str) -> dict:
    for block in payload_text.split("\n\n"):
        lines = block.splitlines()
        if lines and lines[0] == "event: done":
            data = next(line[6:] for line in lines if line.startswith("data: "))
            return json.loads(data)
    raise AssertionError("done event was not emitted")


def test_strict_projection_is_content_free_and_does_not_mutate_bundle() -> None:
    valid = _producer_bundle(_valid_extension())
    valid_before = copy.deepcopy(valid)
    assert project_context_composition_availability(valid) is None
    assert valid == valid_before

    missing = _producer_bundle()
    missing_before = copy.deepcopy(missing)
    missing_reason = project_context_composition_availability(missing)
    assert missing_reason == {
        "schema": "pupu.context_composition_availability.v2",
        "code": "extension_missing",
    }
    assert missing == missing_before

    malformed_extension = _valid_extension()
    malformed_extension["raw"] = "must-not-project"
    malformed = _producer_bundle(malformed_extension)
    malformed_before = copy.deepcopy(malformed)
    invalid_reason = project_context_composition_availability(malformed)
    assert invalid_reason == {
        "schema": "pupu.context_composition_availability.v2",
        "code": "extension_invalid",
    }
    assert malformed == malformed_before
    assert "raw" in malformed["provider_calls"][0]["extensions"][EXTENSION_KEY]


def test_existing_fresh_or_resume_availability_has_priority_over_extension() -> None:
    malformed_extension = _valid_extension()
    malformed_extension["residual_tokens"] = 98
    bundle = _producer_bundle(malformed_extension)
    preferred = {
        "schema": "pupu.context_composition_availability.v2",
        "code": "resume_hint_mismatch",
    }

    assert (
        project_context_composition_availability(
            bundle,
            preferred=preferred,
        )
        == preferred
    )


def test_projection_accepts_both_method_generations_but_nothing_else() -> None:
    """v1 receipts are permanently persisted history and v2 is what the
    runtime emits since the 2026-08-21 method bump (calibrated divisor +
    scale-onto-billed-total) — both must project as valid, or this
    diagnostic misreports every bundle from the other generation as
    extension_invalid. Anything unrecognised must still fail closed."""
    v2_extension = _valid_extension()
    v2_extension["method"] = "utf8_heuristic_v2"
    assert (
        project_context_composition_availability(_producer_bundle(v2_extension))
        is None
    )

    unknown_extension = _valid_extension()
    unknown_extension["method"] = "utf8_heuristic_v3"
    assert project_context_composition_availability(
        _producer_bundle(unknown_extension)
    ) == {
        "schema": "pupu.context_composition_availability.v2",
        "code": "extension_invalid",
    }


def test_strict_projection_rejects_counter_surface_and_type_mutants() -> None:
    counter_mutant = _valid_extension()
    counter_mutant["coverage"].update({"manifest_items": 999, "matched_items": 999})
    surface_mutant = _valid_extension()
    surface_mutant["coverage"].update({"wire_surfaces": 5, "matched_surfaces": 5})
    type_mutant = _valid_extension()
    type_mutant["quality"] = []

    for extension in (counter_mutant, surface_mutant, type_mutant):
        assert project_context_composition_availability(
            _producer_bundle(extension)
        ) == {
            "schema": "pupu.context_composition_availability.v2",
            "code": "extension_invalid",
        }


def test_projection_is_identical_after_json_replay() -> None:
    bundle = _producer_bundle()
    live = project_context_composition_availability(bundle)
    replayed = project_context_composition_availability(
        json.loads(json.dumps(bundle, ensure_ascii=False))
    )
    assert (
        replayed
        == live
        == {
            "schema": "pupu.context_composition_availability.v2",
            "code": "extension_missing",
        }
    )


def test_v4_done_projects_missing_invalid_valid_and_existing_priority() -> None:
    malformed_extension = _valid_extension()
    malformed_extension["coverage"]["matched_items"] = 2
    cases = (
        (_producer_bundle(), {}, "extension_missing"),
        (_producer_bundle(malformed_extension), {}, "extension_invalid"),
        (_producer_bundle(_valid_extension()), {}, None),
        (
            _producer_bundle(malformed_extension),
            {"context_composition_hint": None},
            "fresh_hint_invalid",
        ),
    )
    client = miso_app.create_app().test_client()
    for index, (bundle, extra_payload, expected_code) in enumerate(cases):
        bundle_before = copy.deepcopy(bundle)
        with mock.patch(
            "context_composition_host.resolve_context_composition_capability",
            return_value=_ready(),
        ), mock.patch.object(
            miso_routes,
            "stream_chat_events",
            return_value=_events(bundle),
        ):
            response = client.post(
                "/chat/stream/v4",
                json={
                    "message": "hello",
                    "attempt_id": f"attempt-composition-diagnostic-{index}",
                    **extra_payload,
                },
            )
            done = _done_payload(response.get_data(as_text=True))

        assert response.status_code == 200
        assert done["bundle"] == project_run_bundle(bundle)
        assert bundle == bundle_before
        if expected_code is None:
            assert "context_composition_availability" not in done
        else:
            assert done["context_composition_availability"] == {
                "schema": "pupu.context_composition_availability.v2",
                "code": expected_code,
            }


def test_v4_resume_priority_survives_the_same_done_carriage() -> None:
    malformed_extension = _valid_extension()
    malformed_extension["quality"] = "exact"
    bundle = _producer_bundle(malformed_extension)
    client = miso_app.create_app().test_client()
    with mock.patch(
        "context_composition_host.resolve_context_composition_capability",
        return_value=_ready(),
    ), mock.patch.object(
        miso_routes,
        "resume_chat_interaction_events",
        return_value=_events(bundle),
    ):
        response = client.post(
            "/chat/stream/v4",
            json={
                "mode": "resume_interaction",
                "threadId": "chat-composition-bundle",
                "attempt_id": "attempt-resume-composition-diagnostic",
                "source_attempt_id": "attempt-source-composition-diagnostic",
                "interaction_id": "interaction-composition-diagnostic",
                "context_composition_hint": None,
            },
        )
        done = _done_payload(response.get_data(as_text=True))

    assert response.status_code == 200
    assert done["bundle"] == project_run_bundle(bundle)
    assert done["context_composition_availability"] == {
        "schema": "pupu.context_composition_availability.v2",
        "code": "resume_hint_invalid",
    }


def test_v4_done_uses_late_closed_resume_authority_from_stream_summary() -> None:
    bundle = _producer_bundle()
    client = miso_app.create_app().test_client()
    for index, code in enumerate(
        (
            "resume_hint_invalid",
            "resume_hint_mismatch",
            "resume_hint_no_baseline",
        )
    ):
        summary_event = {
            "type": "stream_summary",
            "context_composition_availability": {
                "schema": "pupu.context_composition_availability.v2",
                "code": code,
            },
        }
        if code != "resume_hint_no_baseline":
            summary_event["bundle"] = copy.deepcopy(bundle)
        events = iter(
            [
                summary_event,
                {
                    "type": "final_message",
                    "run_id": "run-composition-bundle",
                    "iteration": 0,
                    "content": "resumed",
                },
            ]
        )
        with mock.patch(
            "context_composition_host.resolve_context_composition_capability",
            return_value=_ready(),
        ), mock.patch.object(
            miso_routes,
            "resume_chat_interaction_events",
            return_value=events,
        ):
            response = client.post(
                "/chat/stream/v4",
                json={
                    "mode": "resume_interaction",
                    "threadId": "chat-late-resume-composition",
                    "attempt_id": f"attempt-late-resume-{index}",
                    "source_attempt_id": "attempt-source-composition",
                    "interaction_id": "interaction-composition",
                },
            )
            done = _done_payload(response.get_data(as_text=True))

        assert response.status_code == 200
        assert done["context_composition_availability"] == {
            "schema": "pupu.context_composition_availability.v2",
            "code": code,
        }
        if code == "resume_hint_no_baseline":
            assert "bundle" not in done
        else:
            assert done["bundle"] == bundle
