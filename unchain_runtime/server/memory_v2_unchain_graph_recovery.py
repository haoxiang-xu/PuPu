from __future__ import annotations

import sqlite3
import threading
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any


_RECOVERY_RESULT_SCHEMA = "unchain.generation_rebase_recovery.v1"
_RECOVERY_REASONS = frozenset(
    {"graph_step_seal_missing", "graph_execution_seal_missing"}
)
_RECOVERY_ACTIONS = frozenset(
    {"step_recovered", "execution_finalized", "unchanged"}
)
_MAX_TRACKED_FAILURES = 256
_MAX_FAILURES_PER_DURABLE_FACT = 2
_failure_counts: "OrderedDict[tuple[str, str, str], int]" = OrderedDict()
_failure_counts_lock = threading.Lock()


class GenerationRebaseRecoveryHostError(RuntimeError):
    """Closed host-side classification for one recovery orchestration failure."""

    def __init__(self, classification: str) -> None:
        if classification not in {"journal_incompatible", "unavailable"}:
            raise ValueError("recovery host classification is invalid")
        super().__init__(classification)
        self.classification = classification


@dataclass(frozen=True, slots=True)
class GenerationRebaseRecoveryObservation:
    schema: str
    action: str
    reason: str
    execution_id: str
    generation_id: str
    appended_event_count: int
    artifact_count: int


def recover_generation_rebase_once(
    *,
    service: Any,
    request: Any,
    failure: BaseException,
) -> GenerationRebaseRecoveryObservation:
    """Invoke the installed Unchain recovery seam exactly once.

    Missing or shape-incompatible seams are deterministic deployment/state
    incompatibilities, not infrastructure retries. SQLite and OS failures stay
    distinct so only genuine infrastructure trouble maps to 503.
    """

    try:
        from unchain.persistence import sqlite_generation_rebase_v2 as rebase_module
        from memory_v2_unchain_run_binding import _sanitize_artifact
    except ImportError as exc:
        raise GenerationRebaseRecoveryHostError("journal_incompatible") from exc

    recover = getattr(rebase_module, "recover_generation_rebase_attempt", None)
    recovery_failure_type = getattr(
        rebase_module,
        "GenerationRebaseRecoveryRequired",
        None,
    )
    if not callable(recover) or not isinstance(recovery_failure_type, type):
        raise GenerationRebaseRecoveryHostError("journal_incompatible")
    if not isinstance(failure, recovery_failure_type):
        raise GenerationRebaseRecoveryHostError("journal_incompatible")
    failure_reason = str(getattr(failure, "reason", "") or "").strip()
    if failure_reason not in _RECOVERY_REASONS:
        raise GenerationRebaseRecoveryHostError("journal_incompatible")

    try:
        result = recover(
            service=service,
            request=request,
            failure=failure,
            artifact_sanitizer=_sanitize_artifact,
        )
    except (OSError, sqlite3.Error) as exc:
        raise GenerationRebaseRecoveryHostError("unavailable") from exc
    except Exception as exc:
        graph_error_type = _graph_checkpoint_error_type()
        if graph_error_type is not None and isinstance(exc, graph_error_type):
            raise GenerationRebaseRecoveryHostError("journal_incompatible") from exc
        raise GenerationRebaseRecoveryHostError("journal_incompatible") from exc

    observation = GenerationRebaseRecoveryObservation(
        schema=str(getattr(result, "schema", "") or ""),
        action=str(getattr(result, "action", "") or ""),
        reason=str(getattr(result, "reason", "") or ""),
        execution_id=str(getattr(result, "execution_id", "") or ""),
        generation_id=str(getattr(result, "generation_id", "") or ""),
        appended_event_count=getattr(result, "appended_event_count", -1),
        artifact_count=getattr(result, "artifact_count", -1),
    )
    if (
        observation.schema != _RECOVERY_RESULT_SCHEMA
        or observation.action not in _RECOVERY_ACTIONS
        or observation.reason not in _RECOVERY_REASONS
        or observation.reason != failure_reason
        or not observation.execution_id
        or not observation.generation_id
        or isinstance(observation.appended_event_count, bool)
        or observation.appended_event_count not in {0, 1}
        or isinstance(observation.artifact_count, bool)
        or observation.artifact_count not in {0, 1}
    ):
        raise GenerationRebaseRecoveryHostError("journal_incompatible")
    expected_action = (
        "step_recovered"
        if failure_reason == "graph_step_seal_missing"
        else "execution_finalized"
    )
    if observation.action == "unchanged":
        if observation.appended_event_count != 0:
            raise GenerationRebaseRecoveryHostError("journal_incompatible")
    elif (
        observation.action != expected_action
        or observation.appended_event_count != 1
    ):
        raise GenerationRebaseRecoveryHostError("journal_incompatible")
    return observation


def note_generation_rebase_recovery_failure(
    *,
    execution_id: str,
    generation_id: str,
    reason: str,
) -> bool:
    """Return true once one durable recovery fact hit the server-side cap."""

    key = (
        str(execution_id or "").strip(),
        str(generation_id or "").strip(),
        str(reason or "").strip(),
    )
    if not all(key) or key[2] not in _RECOVERY_REASONS:
        return True
    with _failure_counts_lock:
        count = _failure_counts.pop(key, 0) + 1
        _failure_counts[key] = count
        while len(_failure_counts) > _MAX_TRACKED_FAILURES:
            _failure_counts.popitem(last=False)
    return count >= _MAX_FAILURES_PER_DURABLE_FACT


def generation_rebase_recovery_is_exhausted(
    *,
    execution_id: str,
    generation_id: str,
    reason: str,
) -> bool:
    """Fail closed after the same durable recovery fact reached its cap."""

    key = (
        str(execution_id or "").strip(),
        str(generation_id or "").strip(),
        str(reason or "").strip(),
    )
    if not all(key) or key[2] not in _RECOVERY_REASONS:
        return True
    with _failure_counts_lock:
        count = _failure_counts.get(key, 0)
        if key in _failure_counts:
            _failure_counts.move_to_end(key)
    return count >= _MAX_FAILURES_PER_DURABLE_FACT


def reset_generation_rebase_recovery_attempts() -> None:
    """Test-only process-local reset; production has no reset side channel."""

    with _failure_counts_lock:
        _failure_counts.clear()


def _graph_checkpoint_error_type() -> type[BaseException] | None:
    try:
        from unchain.context.graph_checkpoint import GraphCheckpointError
    except ImportError:
        return None
    return GraphCheckpointError if isinstance(GraphCheckpointError, type) else None


__all__ = [
    "GenerationRebaseRecoveryHostError",
    "GenerationRebaseRecoveryObservation",
    "generation_rebase_recovery_is_exhausted",
    "note_generation_rebase_recovery_failure",
    "recover_generation_rebase_once",
    "reset_generation_rebase_recovery_attempts",
]
