"""Independent AC-016/017: terminal state must win before accepting an answer."""

import pytest

import durable_interaction_host as host
import test_memory_v2_unchain_active_graph_interaction_resume as fixture
from test_memory_v2_acceptance_crash_matrix import first_pending, second_pending, submit
from unchain.context.artifacts import ArtifactService
from unchain.context.graph_checkpoint import (
    GraphTerminalStatus, JournalGraphCheckpointRepository,
)
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.journal import DurableEventSink, SemanticEventDraft


def test_graph_cancelled_after_preflight_does_not_accept_receipt(tmp_path, monkeypatch):
    with second_pending(tmp_path, monkeypatch) as pending:
        store, plan = fixture._plan_from_store(tmp_path)
        journal = store.bind_execution(fixture.EXECUTION_ID)
        step = plan.steps[1]
        artifacts = ArtifactService(journal, sanitizer=lambda content, _: content)
        projector = CanonicalSemanticEventProjector(
            attempt=step.attempt, artifacts=artifacts,
            payload_sanitizer=lambda _, payload: payload,
        )
        sink = DurableEventSink(journal, step.attempt, projector)
        repository = JournalGraphCheckpointRepository(journal)
        original_validate = host._validated_durable_interaction_guard_owner_attempt
        advanced = False

        def terminal_after_preflight(**kwargs):
            nonlocal advanced
            result = original_validate(**kwargs)
            if not advanced:
                advanced = True
                terminal = sink.append_projected(SemanticEventDraft(
                    event_id="review-run-cancelled",
                    event_type="run_cancelled", attempt=step.attempt,
                    operation_id="review-run-cancelled-operation",
                    payload={"run_id": step.attempt.attempt_id, "status": "cancelled"},
                ))
                repository.terminal(
                    plan, step, status=GraphTerminalStatus.CANCELLED,
                    terminal_cursor=terminal.cursor,
                )
                assert repository.scan(plan).recovery.terminal_status == GraphTerminalStatus.CANCELLED
            return result

        monkeypatch.setattr(host, "_validated_durable_interaction_guard_owner_attempt", terminal_after_preflight)
        rejected = None
        try:
            submit(pending, "vue")
        except host.DurableInteractionHostError as exc:
            rejected = exc
        assert advanced
        current = host._interaction_runtime().load_active(fixture.EXECUTION_ID)
        assert current.receipt is None, "Receipt accepted after the canonical graph became cancelled"
        assert not any(
            event.event_type == "interaction.resolved"
            and event.payload.get("interaction_id") == pending["interaction_id"]
            for event in journal.capture_snapshot().events
        )
        assert rejected is not None


@pytest.mark.parametrize("accepted", [False, True])
def test_second_interaction_can_be_cancelled(tmp_path, monkeypatch, accepted):
    with second_pending(tmp_path, monkeypatch) as pending:
        if accepted:
            assert submit(pending, "vue")["status"] == "ok"
        result = host.cancel_chat_execution(
            session_id=fixture.EXECUTION_ID,
            attempt_id=pending["source_run_id"],
            owner_chat_id=fixture.OWNER_CHAT_ID,
            expected_interaction_id=pending["interaction_id"], reason="user_stop",
        )
        assert result["status"] == "ok"
        assert result["durable_interaction_cancelled"] is True


def test_first_accepted_interaction_cancel_succeeds(tmp_path, monkeypatch):
    with first_pending(tmp_path, monkeypatch) as pending:
        assert submit(pending, "vue")["status"] == "ok"
        result = host.cancel_chat_execution(
            session_id=fixture.EXECUTION_ID,
            attempt_id=pending["source_run_id"],
            owner_chat_id=fixture.OWNER_CHAT_ID,
            expected_interaction_id=pending["interaction_id"], reason="user_stop",
        )
        assert result["status"] == "ok"
        assert result["durable_interaction_cancelled"] is True
