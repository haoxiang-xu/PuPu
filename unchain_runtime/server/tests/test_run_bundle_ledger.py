from __future__ import annotations

import json
import sqlite3

import pytest

from run_bundle_ledger import RunBundleLedger, RunBundleLedgerError
from unchain.run_bundle import (
    ProviderCallIdentity,
    ProviderCallReceipt,
    ProviderCallTiming,
    ProviderCallUsage,
    RunBundle,
    RunBundleReducer,
    RunIdentity,
    RunLifecycle,
)
from unchain.run_bundle_v2 import CompactRunBundle


def _bundle(*, revision: int = 1, marker: str = "one") -> dict:
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
            input_uncached_tokens=10,
            input_cache_read_tokens=0,
            input_cache_write_tokens=0,
            input_total_tokens=10,
            output_visible_tokens=3,
            output_reasoning_tokens=2,
            output_total_tokens=5,
            total_tokens=15,
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
        revision=revision,
        extensions={"pupu.test/marker": marker},
    ).to_dict()


def _compact_bundle(*, revision: int) -> dict:
    source = RunBundle.from_dict(_bundle())
    bundle, _details = CompactRunBundle.from_facts(
        identity=source.identity,
        lifecycle=source.lifecycle,
        descriptor=source.descriptor,
        revision=revision,
        receipts=(),
        metric_events=(),
        children=(),
    )
    return bundle.to_dict()


def test_reopen_recovers_exact_canonical_bundle(tmp_path) -> None:
    path = tmp_path / "run_bundles.sqlite3"
    first = RunBundleLedger(path)
    raw = _bundle()
    assert first.upsert(raw)["status"] == "stored"
    assert first.upsert(raw)["status"] == "already_current"

    reopened = RunBundleLedger(path)
    assert reopened.load_run(
        execution_id="chat-1",
        attempt_id="attempt-1",
        run_id="run-root",
    ) == raw
    assert reopened.list_root(
        execution_id="chat-1",
        root_run_id="run-root",
    ) == (raw,)


def test_revision_is_monotonic_and_same_revision_digest_is_unique(tmp_path) -> None:
    ledger = RunBundleLedger(tmp_path / "run_bundles.sqlite3")
    first = _bundle(revision=1, marker="first")
    second = _bundle(revision=2, marker="second")
    ledger.upsert(first)
    assert ledger.upsert(second)["status"] == "stored"
    with pytest.raises(RunBundleLedgerError, match="run_bundle_revision_stale"):
        ledger.upsert(first)

    conflicting = _bundle(revision=2, marker="attacker")
    with pytest.raises(RunBundleLedgerError, match="run_bundle_revision_conflict"):
        ledger.upsert(conflicting)


def test_reopen_recovers_compact_v2_without_v1_table_collision(tmp_path) -> None:
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
    ledger = RunBundleLedger(tmp_path / "run_bundles.sqlite3")
    assert ledger.upsert(raw)["status"] == "stored"
    reopened = RunBundleLedger(tmp_path / "run_bundles.sqlite3")
    assert reopened.load_run(
        execution_id="chat-1",
        attempt_id="attempt-v2",
        run_id="run-v2",
    ) == raw


def test_schema_transition_is_one_way_and_v2_must_advance_v1(tmp_path) -> None:
    ledger = RunBundleLedger(tmp_path / "run_bundles.sqlite3")
    ledger.upsert(_bundle(revision=1))

    with pytest.raises(
        RunBundleLedgerError,
        match="run_bundle_revision_conflict",
    ):
        ledger.upsert(_compact_bundle(revision=1))

    compact = _compact_bundle(revision=2)
    assert ledger.upsert(compact)["status"] == "stored"
    assert ledger.load_run(
        execution_id="chat-1",
        attempt_id="attempt-1",
        run_id="run-root",
    ) == compact
    assert ledger.list_root(
        execution_id="chat-1",
        root_run_id="run-root",
    ) == (compact,)

    with pytest.raises(
        RunBundleLedgerError,
        match="run_bundle_schema_regression",
    ):
        ledger.upsert(_bundle(revision=3))


def test_reads_fail_closed_on_same_revision_dual_schema_collision(tmp_path) -> None:
    path = tmp_path / "run_bundles.sqlite3"
    ledger = RunBundleLedger(path)
    ledger.upsert(_bundle(revision=1))
    compact = _compact_bundle(revision=1)
    identity = compact["identity"]
    encoded = json.dumps(
        compact,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    with sqlite3.connect(path) as connection:
        connection.execute(
            """
            INSERT INTO run_bundle_v2 (
                bundle_id, revision, bundle_digest, execution_id, attempt_id,
                root_run_id, run_id, lifecycle_status, bundle_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                compact["bundle_id"],
                compact["revision"],
                compact["bundle_digest"],
                identity["execution_id"],
                identity["attempt_id"],
                identity["root_run_id"],
                identity["run_id"],
                compact["lifecycle"]["status"],
                encoded,
            ),
        )

    with pytest.raises(
        RunBundleLedgerError,
        match="run_bundle_schema_revision_ambiguous",
    ):
        ledger.load_run(
            execution_id="chat-1",
            attempt_id="attempt-1",
            run_id="run-root",
        )
    with pytest.raises(
        RunBundleLedgerError,
        match="run_bundle_schema_revision_ambiguous",
    ):
        ledger.list_root(
            execution_id="chat-1",
            root_run_id="run-root",
        )
