from __future__ import annotations

import json

import pytest

from completion_diagnostics import (
    COMPLETION_DIAGNOSTICS_EXTENSION_KEY,
    COMPLETION_DIAGNOSTICS_SCHEMA,
    CompletionDiagnosticsError,
    build_completion_diagnostics,
    project_completion_diagnostics,
    reproject_run_bundle_with_completion_diagnostics,
)


def test_builds_closed_bounded_memory_v2_diagnostics() -> None:
    projected = build_completion_diagnostics(
        {
            "schema_version": "memory_v2.context.v1",
            "mode": "active",
            "trace_status": "partial",
            "available_input_tokens": 91_000,
            "checkpoint_refs": [
                {"uri": "pupu://context/checkpoint/checkpoint-1"}
            ],
            "provider_request": {"api_key": "must-not-cross"},
            "unknown_host_field": "drop-me",
        }
    )

    assert projected == {
        "schema": COMPLETION_DIAGNOSTICS_SCHEMA,
        "diagnostics_digest": (
            "14153fb472fefffe6a0e6642535cb0d1"
            "a86ea25f07f9af3631f98c8fbbc8d0fa"
        ),
        "memory_v2": {
            "available_input_tokens": 91_000,
            "checkpoint_refs": [
                {"uri": "pupu://context/checkpoint/checkpoint-1"}
            ],
            "mode": "active",
            "schema_version": "memory_v2.context.v1",
            "trace_status": "partial",
        },
    }
    assert "must-not-cross" not in str(projected)
    assert project_completion_diagnostics(projected) == projected


def test_digest_survives_json_round_trip_for_cross_language_numbers() -> None:
    projected = build_completion_diagnostics(
        {
            "canary_percent": 25.0,
            "available_input_tokens": (1 << 53) + 9,
            "context_build": {
                "ratio": 0.1,
                "ascii_key": "kept",
                "非ascii": "dropped",
            },
        }
    )

    assert projected is not None
    assert projected["memory_v2"]["canary_percent"] == "25"
    assert projected["memory_v2"]["available_input_tokens"] == str(
        (1 << 53) + 9
    )
    assert projected["memory_v2"]["context_build"] == {
        "ratio": "0.10000000000000001",
        "ascii_key": "kept",
    }
    wire_value = json.loads(
        json.dumps(projected, ensure_ascii=False, separators=(",", ":"))
    )
    assert project_completion_diagnostics(wire_value) == projected


@pytest.mark.parametrize(
    "value",
    [
        {"schema": "pupu.completion_diagnostics.v999", "memory_v2": {}},
        {
            "schema": COMPLETION_DIAGNOSTICS_SCHEMA,
            "memory_v2": {"mode": "active"},
            "extra": True,
        },
        {"schema": COMPLETION_DIAGNOSTICS_SCHEMA, "memory_v2": {}},
        {
            "schema": COMPLETION_DIAGNOSTICS_SCHEMA,
            "diagnostics_digest": "0" * 64,
            "memory_v2": {"mode": "active"},
        },
    ],
)
def test_projection_rejects_unknown_or_empty_envelopes(value) -> None:
    with pytest.raises(CompletionDiagnosticsError):
        project_completion_diagnostics(value)


def test_diagnostics_reference_uses_official_immutable_bundle_reprojection() -> None:
    from unchain.run_bundle import (
        RunBundleReducer,
        RunDescriptor,
        RunIdentity,
        RunLifecycle,
    )

    bundle = RunBundleReducer.reduce(
        identity=RunIdentity(
            execution_id="exec-diagnostics",
            attempt_id="attempt-diagnostics",
            root_run_id="run-diagnostics",
            run_id="run-diagnostics",
            parent_run_id=None,
            relation="root",
        ),
        lifecycle=RunLifecycle(
            status="completed",
            started_at="2026-08-14T00:00:00.000000000Z",
            completed_at="2026-08-14T00:00:01.000000000Z",
            continued_from_run_id=None,
        ),
        descriptor=RunDescriptor(
            model="openai:gpt-test",
            display_model="GPT Test",
            active_agent="developer",
            agent_orchestration="default",
            iteration=0,
        ),
        receipts=(),
    )
    diagnostics = build_completion_diagnostics(
        {"status": "active", "available_input_tokens": 1234}
    )
    assert diagnostics is not None

    projected = reproject_run_bundle_with_completion_diagnostics(
        bundle.to_dict(), diagnostics
    )
    assert projected["bundle_id"] == bundle.bundle_id
    assert projected["revision"] == bundle.revision + 1
    assert projected["bundle_digest"] != bundle.bundle_digest
    assert projected["extensions"][COMPLETION_DIAGNOSTICS_EXTENSION_KEY] == {
        "schema": "pupu.completion_diagnostics_ref.v1",
        "diagnostics_schema": "pupu.completion_diagnostics.v1",
        "diagnostics_sha256": diagnostics["diagnostics_digest"],
    }
    assert (
        reproject_run_bundle_with_completion_diagnostics(
            projected, diagnostics
        )
        == projected
    )
