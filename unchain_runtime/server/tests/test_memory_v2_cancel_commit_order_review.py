"""AC-016/017: concurrent cancellation and acceptance must agree durably."""

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

import durable_interaction_host as host
import test_memory_v2_unchain_active_graph_interaction_resume as fixture
from memory_v2_unchain_active_bridge import (
    pupu_unchain_cold_accepted_interaction_resolution,
)
from test_memory_v2_acceptance_crash_matrix import first_pending, second_pending, submit


@pytest.mark.parametrize("pending_factory", [first_pending, second_pending])
def test_durable_cancel_wins_over_preflighted_answer(tmp_path, monkeypatch, pending_factory):
    with pending_factory(tmp_path, monkeypatch) as pending:
        preflight_done = threading.Event()
        release_answer = threading.Event()
        original_validate = host._validated_durable_interaction_guard_owner_attempt
        original_reconcile = host._reconcile_cancelled_interaction_to_context
        observed = {}

        def read_canonical():
            return pupu_unchain_cold_accepted_interaction_resolution(
                owner_chat_id=fixture.OWNER_CHAT_ID,
                session_id=fixture.EXECUTION_ID,
                source_attempt_id=pending["source_run_id"],
                interaction_id=pending["interaction_id"],
            )

        def pause_answer_after_preflight(**kwargs):
            result = original_validate(**kwargs)
            if threading.current_thread().name.startswith("accept-review"):
                preflight_done.set()
                assert release_answer.wait(30), "Cancellation did not reach reconciliation"
            return result

        monkeypatch.setattr(
            host, "_validated_durable_interaction_guard_owner_attempt",
            pause_answer_after_preflight,
        )
        with ThreadPoolExecutor(max_workers=1, thread_name_prefix="accept-review") as pool:
            answer_future = pool.submit(submit, pending, "vue")

            def continue_answer_after_durable_cancel(**kwargs):
                snapshot = host._interaction_runtime().load(
                    fixture.EXECUTION_ID,
                    interaction_id=pending["interaction_id"],
                    require_active=False,
                )
                assert snapshot.application is not None
                assert host._load_execution_cancellation(
                    fixture.EXECUTION_ID, pending["source_run_id"],
                ) is not None
                assert read_canonical() is None
                observed["cancelled_host_response"] = snapshot.receipt.response
                release_answer.set()
                try:
                    observed["answer_result"] = answer_future.result(timeout=30)
                except host.DurableInteractionHostError as exc:
                    observed["answer_error"] = exc.code
                observed["canonical_after_answer"] = read_canonical()
                return original_reconcile(**kwargs)

            monkeypatch.setattr(
                host, "_reconcile_cancelled_interaction_to_context",
                continue_answer_after_durable_cancel,
            )
            try:
                assert preflight_done.wait(30), "Answer did not reach preflight"
                result = host.cancel_chat_execution(
                    session_id=fixture.EXECUTION_ID,
                    attempt_id=pending["source_run_id"],
                    owner_chat_id=fixture.OWNER_CHAT_ID,
                    expected_interaction_id=pending["interaction_id"],
                    reason="user_stop",
                )
            finally:
                release_answer.set()

        assert result["status"] == "ok"
        assert result["context_interaction_reconciled"] is True
        canonical = read_canonical()
        final_host = host._interaction_runtime().load(
            fixture.EXECUTION_ID,
            interaction_id=pending["interaction_id"],
            require_active=False,
        )
        assert canonical is not None
        assert final_host.application is not None
        # Either ordering may win the race, but an accepted answer must be
        # preserved in its receipt when cancellation follows. Returning
        # "reconciled" while the two durable responses disagree is invalid.
        assert canonical.response == final_host.receipt.response, (
            "Cancellation returned reconciled with contradictory durable "
            f"responses: canonical={canonical.response!r}, "
            f"host={final_host.receipt.response!r}, ordering={observed!r}"
        )
