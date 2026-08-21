from __future__ import annotations

import copy

import pytest

from run_bundle_adapter import (
    ExpectedRunBundleIdentity,
    RunBundleProjectionError,
    merge_run_bundles,
    project_kernel_result_bundle,
    project_run_bundle,
)
from unchain.kernel.types import KernelRunResult
from unchain.run_bundle import (
    ProviderCallIdentity,
    ProviderCallReceipt,
    ProviderCallTiming,
    ProviderCallUsage,
    RunBundleReducer,
    RunDescriptor,
    RunIdentity,
    RunLifecycle,
)
from unchain.run_bundle_v2 import CompactRunBundle
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


def _producer_bundle() -> dict:
    identity = RunIdentity(
        execution_id="chat-1",
        attempt_id="attempt-1",
        root_run_id="run-root",
        run_id="run-root",
        parent_run_id=None,
        relation="root",
    )
    receipt = ProviderCallReceipt(
        identity=ProviderCallIdentity(
            execution_id="chat-1",
            attempt_id="attempt-1",
            root_run_id="run-root",
            owner_run_id="run-root",
            parent_run_id=None,
            iteration=0,
            retry_ordinal=0,
            purpose="agent.turn",
            request_sha256="a" * 64,
            route="responses.create",
        ),
        provider="openai",
        model="gpt-5.6-luna",
        status="completed",
        timing=ProviderCallTiming(
            started_at="2026-08-14T00:00:00.000000000Z",
            completed_at="2026-08-14T00:00:01.000000000Z",
        ),
        usage=ProviderCallUsage(
            input_uncached_tokens=80,
            input_cache_read_tokens=20,
            input_cache_write_tokens=0,
            input_total_tokens=100,
            output_visible_tokens=7,
            output_reasoning_tokens=3,
            output_total_tokens=10,
            total_tokens=110,
            source="provider_observed",
        ),
    )
    return RunBundleReducer.reduce(
        identity=identity,
        lifecycle=RunLifecycle(
            status="completed",
            started_at="2026-08-14T00:00:00.000000000Z",
            completed_at="2026-08-14T00:00:01.000000000Z",
        ),
        receipts=(receipt,),
    ).to_dict()


def test_projects_real_locked_core_bundle_without_recomputing_usage() -> None:
    raw = _producer_bundle()
    assert project_run_bundle(
        raw,
        expected=ExpectedRunBundleIdentity(
            execution_id="chat-1",
            attempt_id="attempt-1",
            root_run_id="run-root",
            run_id="run-root",
        ),
    ) == raw


def test_present_invalid_v1_never_falls_back_to_legacy() -> None:
    raw = _producer_bundle()
    raw["attachments"] = []
    with pytest.raises(RunBundleProjectionError) as captured:
        project_run_bundle(raw)
    assert captured.value.code == "run_bundle_projection_invalid"
    assert captured.value.reason == "schema_invalid"


def test_rejects_wrong_identity_and_sensitive_extension_payload() -> None:
    raw = _producer_bundle()
    with pytest.raises(RunBundleProjectionError, match="run_bundle_projection_invalid"):
        project_run_bundle(
            raw,
            expected=ExpectedRunBundleIdentity(execution_id="chat-other"),
        )

    poisoned = copy.deepcopy(raw)
    poisoned["extensions"] = {"pupu.example/data": {"provider_request": {}}}
    poisoned["bundle_digest"] = "0" * 64
    with pytest.raises(RunBundleProjectionError):
        project_run_bundle(poisoned)


def test_kernel_result_absence_is_the_only_legacy_fallback() -> None:
    legacy = KernelRunResult(messages=[], status="completed")
    assert project_kernel_result_bundle(legacy) is None

    canonical = KernelRunResult(
        messages=[],
        status="completed",
        run_bundle=_producer_bundle(),
    )
    assert project_kernel_result_bundle(canonical) == canonical.run_bundle

    malformed = KernelRunResult(
        messages=[],
        status="completed",
        run_bundle={"schema": "unchain.run_bundle.v1"},
    )
    with pytest.raises(RunBundleProjectionError):
        project_kernel_result_bundle(malformed)


def test_projects_compact_v2_without_v1_fallback() -> None:
    identity = RunIdentity(
        execution_id="chat-1",
        attempt_id="attempt-v2",
        root_run_id="run-v2",
        run_id="run-v2",
        parent_run_id=None,
        relation="root",
    )
    bundle, _details = CompactRunBundle.from_facts(
        identity=identity,
        lifecycle=RunLifecycle(
            status="completed",
            started_at="2026-08-14T00:00:00.000000000Z",
            completed_at="2026-08-14T00:00:01.000000000Z",
        ),
        descriptor=RunBundleReducer.reduce(
            identity=identity,
            lifecycle=RunLifecycle(
                status="completed",
                started_at="2026-08-14T00:00:00.000000000Z",
                completed_at="2026-08-14T00:00:01.000000000Z",
            ),
            receipts=(),
        ).descriptor,
        revision=1,
        receipts=(),
        metric_events=(),
        children=(),
    )
    raw = bundle.to_dict()
    assert project_run_bundle(raw) == raw


def test_graph_merge_hydrates_compact_v2_child_from_official_ledger(
    tmp_path,
) -> None:
    root_run_id = "graph-root"
    child_identity = RunIdentity(
        execution_id="chat-graph",
        attempt_id="attempt-child",
        root_run_id=root_run_id,
        run_id="graph-child",
        parent_run_id=root_run_id,
        relation="graph_node",
    )
    receipt = ProviderCallReceipt(
        identity=ProviderCallIdentity(
            execution_id="chat-graph",
            attempt_id="attempt-child",
            root_run_id=root_run_id,
            owner_run_id="graph-child",
            parent_run_id=root_run_id,
            iteration=0,
            retry_ordinal=0,
            purpose="agent.turn",
            request_sha256="b" * 64,
            route="responses.create",
        ),
        provider="openai",
        model="gpt-5.6-luna",
        status="completed",
        timing=ProviderCallTiming(
            started_at="2026-08-14T00:00:00.000000000Z",
            completed_at="2026-08-14T00:00:01.000000000Z",
        ),
        usage=ProviderCallUsage(
            input_uncached_tokens=10,
            input_total_tokens=10,
            output_visible_tokens=5,
            output_total_tokens=5,
            total_tokens=15,
            source="provider_observed",
        ),
    )
    descriptor = RunDescriptor(model="gpt-test", display_model="gpt-test")
    child, details = CompactRunBundle.from_facts(
        identity=child_identity,
        lifecycle=RunLifecycle(
            status="completed",
            started_at="2026-08-14T00:00:00.000000000Z",
            completed_at="2026-08-14T00:00:01.000000000Z",
        ),
        descriptor=descriptor,
        revision=1,
        receipts=(receipt,),
        metric_events=(),
        children=(),
    )
    bound = SQLiteContextV2Store(
        database_path=tmp_path / "context.sqlite3",
        object_directory=tmp_path / "objects",
    ).bind_execution("chat-graph")
    bound.persist_compact_bundle_with_details(bundle=child, details=details)

    merged_value = merge_run_bundles(
        [child.to_dict(), child.to_dict()],
        execution_id="chat-graph",
        attempt_id="attempt-root",
        root_run_id=root_run_id,
        run_id=root_run_id,
        status="completed",
        started_at="2026-08-14T00:00:00.000000000Z",
        completed_at="2026-08-14T00:00:02.000000000Z",
        descriptor=descriptor,
        details_ledger=bound,
    )
    merged = CompactRunBundle.from_dict(merged_value)
    assert merged.provider_call_count == 1
    receipts, events, children = bound.load_compact_bundle_details(bundle=merged)
    assert receipts == (receipt,)
    assert events == ()
    assert {item.run_id for item in children} == {child_identity.run_id}
