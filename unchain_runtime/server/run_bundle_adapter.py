"""Strict PuPu admission for Unchain ``unchain.run_bundle.v1`` values.

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
    RunBundle,
    RunBundleProtocolError,
    RunBundleReducer,
    RunDescriptor,
    RunIdentity,
    RunLifecycle,
)


RUN_BUNDLE_SCHEMA = "unchain.run_bundle.v1"


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

    def check(self, bundle: RunBundle) -> None:
        identity = bundle.identity
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
    if value.get("schema") != RUN_BUNDLE_SCHEMA:
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
) -> dict[str, Any]:
    """Use Unchain's official unique-call-set reducer for one graph root."""

    try:
        bundles = tuple(
            RunBundle.from_dict(copy.deepcopy(value)) for value in values
        )
        root = RunIdentity(
            execution_id=execution_id,
            attempt_id=attempt_id,
            root_run_id=root_run_id,
            run_id=run_id,
            parent_run_id=parent_run_id,
            relation=relation,
        )
        merged = RunBundleReducer.reduce_bundles(
            identity=root,
            lifecycle=RunLifecycle(
                status=status,
                started_at=started_at,
                completed_at=completed_at,
                continued_from_run_id=continued_from_run_id,
            ),
            bundles=bundles,
            descriptor=descriptor,
            revision=revision,
            extensions=extensions,
        )
    except (RunBundleProtocolError, TypeError, ValueError) as error:
        raise RunBundleProjectionError("graph_bundle_merge_invalid") from error
    return merged.to_dict()


__all__ = [
    "ExpectedRunBundleIdentity",
    "RUN_BUNDLE_SCHEMA",
    "RunBundleProjectionError",
    "project_kernel_result_bundle",
    "merge_run_bundles",
    "project_run_bundle",
]
