from __future__ import annotations

import sys
from pathlib import Path
from unittest import mock

import pytest


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from memory_v2_unchain_graph_recovery import (  # noqa: E402
    GenerationRebaseRecoveryHostError,
    recover_generation_rebase_once,
)
from unchain.persistence import sqlite_generation_rebase_v2 as rebase_module  # noqa: E402
from unchain.persistence.sqlite_generation_rebase_v2 import (  # noqa: E402
    GenerationRebaseFailureReason,
    GenerationRebaseRecoveryRequired,
    GenerationRebaseRecoveryResult,
)


@pytest.mark.parametrize(
    ("reason", "action", "artifact_count"),
    (
        (
            GenerationRebaseFailureReason.GRAPH_STEP_SEAL_MISSING,
            "step_recovered",
            1,
        ),
        (
            GenerationRebaseFailureReason.GRAPH_EXECUTION_SEAL_MISSING,
            "execution_finalized",
            0,
        ),
    ),
)
def test_recovery_host_invokes_exact_seam_once(
    reason: GenerationRebaseFailureReason,
    action: str,
    artifact_count: int,
) -> None:
    service = object()
    request = object()
    failure = GenerationRebaseRecoveryRequired(
        "one graph seal is missing",
        reason=reason,
        subject={
            "execution_id": "execution-recovery",
            "generation_id": "generation-recovery",
        },
    )
    result = GenerationRebaseRecoveryResult(
        action=action,
        reason=reason.value,
        execution_id="execution-recovery",
        generation_id="generation-recovery",
        appended_event_count=1,
        artifact_count=artifact_count,
    )

    with mock.patch.object(
        rebase_module,
        "recover_generation_rebase_attempt",
        return_value=result,
    ) as seam:
        observation = recover_generation_rebase_once(
            service=service,
            request=request,
            failure=failure,
        )

    seam.assert_called_once()
    call = seam.call_args
    assert call.kwargs["service"] is service
    assert call.kwargs["request"] is request
    assert call.kwargs["failure"] is failure
    assert callable(call.kwargs["artifact_sanitizer"])
    assert observation.reason == reason.value
    assert observation.action == action
    assert observation.appended_event_count == 1


def test_recovery_host_rejects_mismatched_result_identity() -> None:
    failure = GenerationRebaseRecoveryRequired(
        "step recovery is required",
        reason=GenerationRebaseFailureReason.GRAPH_STEP_SEAL_MISSING,
        subject={
            "execution_id": "execution-recovery",
            "generation_id": "generation-recovery",
        },
    )
    mismatched = GenerationRebaseRecoveryResult(
        action="execution_finalized",
        reason=(
            GenerationRebaseFailureReason.GRAPH_EXECUTION_SEAL_MISSING.value
        ),
        execution_id="execution-recovery",
        generation_id="generation-recovery",
        appended_event_count=1,
        artifact_count=0,
    )

    with mock.patch.object(
        rebase_module,
        "recover_generation_rebase_attempt",
        return_value=mismatched,
    ), pytest.raises(GenerationRebaseRecoveryHostError) as caught:
        recover_generation_rebase_once(
            service=object(),
            request=object(),
            failure=failure,
        )

    assert caught.value.classification == "journal_incompatible"


def test_recovery_host_classifies_missing_seam_and_io_separately() -> None:
    failure = GenerationRebaseRecoveryRequired(
        "step recovery is required",
        reason=GenerationRebaseFailureReason.GRAPH_STEP_SEAL_MISSING,
        subject={
            "execution_id": "execution-recovery",
            "generation_id": "generation-recovery",
        },
    )

    with mock.patch.object(
        rebase_module,
        "recover_generation_rebase_attempt",
        None,
    ), pytest.raises(GenerationRebaseRecoveryHostError) as missing:
        recover_generation_rebase_once(
            service=object(),
            request=object(),
            failure=failure,
        )
    assert missing.value.classification == "journal_incompatible"

    with mock.patch.object(
        rebase_module,
        "recover_generation_rebase_attempt",
        side_effect=OSError("storage unavailable"),
    ), pytest.raises(GenerationRebaseRecoveryHostError) as unavailable:
        recover_generation_rebase_once(
            service=object(),
            request=object(),
            failure=failure,
        )
    assert unavailable.value.classification == "unavailable"
