"""Strict PuPu admission for Unchain RunBundle v1 and compact v2 values.

The sibling Unchain package is the sole owner of accounting semantics.  PuPu
never re-sums token counters or rebuilds provider receipts; it parses the
closed producer contract and returns the producer's canonical renderer-safe
projection.  A present but invalid v1 bundle is always an error and must never
fall back to legacy totals.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Mapping

from unchain.run_bundle import (
    ProviderCallReceipt,
    RunBundle,
    RunChild,
    RunBundleProtocolError,
    RunBundleReducer,
    RunDescriptor,
    RunIdentity,
    RunLifecycle,
    RunMetricEvent,
)
from unchain.run_bundle_v2 import (
    COMPACT_RUN_BUNDLE_SCHEMA,
    CompactRunBundle,
    CompactRunBundleProtocolError,
    run_bundle_from_dict,
)


RUN_BUNDLE_SCHEMA = "unchain.run_bundle.v1"
RUN_BUNDLE_V2_SCHEMA = COMPACT_RUN_BUNDLE_SCHEMA


class RunBundleProjectionError(RuntimeError):
    """A canonical RunBundle failed the locked PuPu host boundary."""

    code = "run_bundle_projection_invalid"

    def __init__(self, reason: str) -> None:
        self.reason = str(reason or "schema_invalid")
        super().__init__(self.code)


@dataclass(frozen=True, slots=True)
class ExpectedRunBundleIdentity:
    execution_id: str | None = None
    attempt_id: str | None = None
    root_run_id: str | None = None
    run_id: str | None = None

    def check(self, bundle: object) -> None:
        identity = getattr(bundle, "identity", None)
        if identity is None:
            raise RunBundleProjectionError("expected_identity_invalid")
        for field_name in (
            "execution_id",
            "attempt_id",
            "root_run_id",
            "run_id",
        ):
            expected = getattr(self, field_name)
            if expected is None:
                continue
            if not isinstance(expected, str) or not expected:
                raise RunBundleProjectionError("expected_identity_invalid")
            if getattr(identity, field_name) != expected:
                raise RunBundleProjectionError(f"{field_name}_mismatch")


def project_run_bundle(
    value: Mapping[str, Any],
    *,
    expected: ExpectedRunBundleIdentity | None = None,
) -> dict[str, Any]:
    """Parse and re-emit one exact canonical renderer-safe RunBundle."""

    if type(value) is not dict:
        raise RunBundleProjectionError("shape_invalid")
    schema = value.get("schema")
    if schema == RUN_BUNDLE_V2_SCHEMA:
        return project_compact_run_bundle(value, expected=expected)
    if schema != RUN_BUNDLE_SCHEMA:
        raise RunBundleProjectionError("schema_unsupported")
    try:
        bundle = RunBundle.from_dict(copy.deepcopy(value))
    except (RunBundleProtocolError, TypeError, ValueError) as error:
        raise RunBundleProjectionError("schema_invalid") from error
    if expected is not None:
        if type(expected) is not ExpectedRunBundleIdentity:
            raise TypeError("expected must be an ExpectedRunBundleIdentity")
        expected.check(bundle)
    return bundle.to_dict()


def project_compact_run_bundle(
    value: Mapping[str, Any],
    *,
    expected: ExpectedRunBundleIdentity | None = None,
) -> dict[str, Any]:
    """Admit one strict content-free v2 envelope without v1 fallback."""

    try:
        bundle = CompactRunBundle.from_dict(copy.deepcopy(value))
    except (CompactRunBundleProtocolError, TypeError, ValueError) as error:
        raise RunBundleProjectionError("schema_invalid") from error
    if expected is not None:
        if type(expected) is not ExpectedRunBundleIdentity:
            raise TypeError("expected must be an ExpectedRunBundleIdentity")
        expected.check(bundle)
    return bundle.to_dict()


def project_kernel_result_bundle(
    result: object,
    *,
    expected: ExpectedRunBundleIdentity | None = None,
) -> dict[str, Any] | None:
    """Project a KernelRunResult bundle; absence is a legacy-only result."""

    value = getattr(result, "run_bundle", None)
    if value is None:
        return None
    if type(value) is not dict:
        raise RunBundleProjectionError("result_bundle_shape_invalid")
    return project_run_bundle(value, expected=expected)


def merge_run_bundles(
    values: list[dict[str, Any]],
    *,
    execution_id: str,
    attempt_id: str,
    root_run_id: str,
    run_id: str,
    parent_run_id: str | None = None,
    relation: str = "root",
    status: str,
    started_at: str,
    completed_at: str | None = None,
    continued_from_run_id: str | None = None,
    descriptor: RunDescriptor | None = None,
    revision: int = 1,
    extensions: Mapping[str, Any] | None = None,
    details_ledger: object | None = None,
) -> dict[str, Any]:
    """Use Unchain's official unique-call-set reducer for one graph root."""

    try:
        bundles = tuple(
            run_bundle_from_dict(copy.deepcopy(value)) for value in values
        )
        root = RunIdentity(
            execution_id=execution_id,
            attempt_id=attempt_id,
            root_run_id=root_run_id,
            run_id=run_id,
            parent_run_id=parent_run_id,
            relation=relation,
        )
        lifecycle = RunLifecycle(
            status=status,
            started_at=started_at,
            completed_at=completed_at,
            continued_from_run_id=continued_from_run_id,
        )
        if all(type(bundle) is RunBundle for bundle in bundles):
            try:
                merged = RunBundleReducer.reduce_bundles(
                    identity=root,
                    lifecycle=lifecycle,
                    bundles=bundles,
                    descriptor=descriptor,
                    revision=revision,
                    extensions=extensions,
                )
                return merged.to_dict()
            except RunBundleProtocolError as error:
                if str(error) not in {
                    "run bundle exceeds the canonical byte limit",
                    "run bundle exceeds the JSON node limit",
                }:
                    raise

        from unchain.run_bundle_ledger import (
            RunBundleCompactDetailsLedger,
            RunBundleProjectionDetailsLedger,
        )

        if not isinstance(details_ledger, RunBundleCompactDetailsLedger):
            raise RunBundleProtocolError(
                "compact graph bundle requires durable details persistence"
            )
        receipt_by_id: dict[str, ProviderCallReceipt] = {}
        event_by_id: dict[str, RunMetricEvent] = {}
        child_by_id: dict[str, RunChild] = {}

        for bundle in bundles:
            if (
                bundle.identity.execution_id != root.execution_id
                or bundle.identity.root_run_id != root.root_run_id
            ):
                raise RunBundleProtocolError(
                    "graph child bundle crosses the root boundary"
                )
            if type(bundle) is CompactRunBundle:
                receipts, events, children = (
                    details_ledger.load_compact_bundle_details(bundle=bundle)
                )
            else:
                receipts = tuple(bundle.provider_calls)
                children = tuple(bundle.children)
                compact_extension = bundle.extensions.get(
                    "unchain.runtime/compact_projection"
                )
                if isinstance(compact_extension, dict):
                    if not isinstance(
                        details_ledger,
                        RunBundleProjectionDetailsLedger,
                    ):
                        raise RunBundleProtocolError(
                            "compact v1 graph bundle requires durable projection details"
                        )
                    events = details_ledger.load_projection_details(
                        bundle_id=bundle.bundle_id,
                        revision=bundle.revision,
                        projection_hash=compact_extension["projection_hash"],
                        metric_events_sha256=compact_extension[
                            "metric_events_sha256"
                        ],
                    )
                else:
                    events = tuple(bundle.metrics.events)
            for receipt in receipts:
                prior = receipt_by_id.get(receipt.provider_call_id)
                if prior is not None and prior.receipt_sha256 != receipt.receipt_sha256:
                    raise RunBundleProtocolError(
                        "one provider_call_id has conflicting immutable receipts"
                    )
                receipt_by_id[receipt.provider_call_id] = receipt
            for event in events:
                prior = event_by_id.get(event.metric_event_id)
                if prior is not None and prior != event:
                    raise RunBundleProtocolError(
                        "one metric_event_id has conflicting immutable events"
                    )
                event_by_id[event.metric_event_id] = event
            for child in children:
                prior = child_by_id.get(child.run_id)
                if prior is not None and prior != child:
                    raise RunBundleProtocolError(
                        "one child run id has conflicting topology"
                    )
                child_by_id[child.run_id] = child
            if bundle.identity.run_id != root.run_id:
                if bundle.identity.parent_run_id is None:
                    raise RunBundleProtocolError(
                        "graph child bundle requires a parent run"
                    )
                child = RunChild(
                    run_id=bundle.identity.run_id,
                    attempt_id=bundle.identity.attempt_id,
                    parent_run_id=bundle.identity.parent_run_id,
                    relation=bundle.identity.relation,
                    bundle_id=bundle.bundle_id,
                    status=bundle.lifecycle.status,
                )
                prior = child_by_id.get(child.run_id)
                if prior is not None and prior != child:
                    raise RunBundleProtocolError(
                        "one child run id has conflicting topology"
                    )
                child_by_id[child.run_id] = child
        compact, details = CompactRunBundle.from_facts(
            identity=root,
            lifecycle=lifecycle,
            descriptor=descriptor or RunDescriptor(),
            revision=revision,
            receipts=tuple(receipt_by_id.values()),
            metric_events=tuple(event_by_id.values()),
            children=tuple(child_by_id.values()),
            extensions=extensions,
        )
        durable = details_ledger.persist_compact_bundle_with_details(
            bundle=compact,
            details=details,
        )
        if durable != compact:
            raise RunBundleProtocolError(
                "durable compact graph projection changed"
            )
        return compact.to_dict()
    except (RunBundleProtocolError, TypeError, ValueError) as error:
        raise RunBundleProjectionError("graph_bundle_merge_invalid") from error


__all__ = [
    "ExpectedRunBundleIdentity",
    "RUN_BUNDLE_SCHEMA",
    "RunBundleProjectionError",
    "project_kernel_result_bundle",
    "merge_run_bundles",
    "project_run_bundle",
    "project_compact_run_bundle",
    "RUN_BUNDLE_V2_SCHEMA",
]
