"""SEQ-010 / AC-016/017: the per-session commit lock and its crash cells.

test_memory_v2_cancel_commit_order_review.py (Codex, K4) pins the live
accept/cancel overlap.  This file pins the mechanism behind the fix and the
crash-shaped variants of the same race:

* the lock primitive itself (cross-thread exclusion, same-thread re-entry);
* an answer that committed canonically and crashed before its host receipt,
  followed by a cancel -- the cancel must keep the accepted answer, record
  the cancelled application, and leave nothing to continue;
* the same end state observed from a brand-new process.
"""

from __future__ import annotations

import threading
import time

import pytest

import durable_interaction_host as host
import test_memory_v2_unchain_active_graph_interaction_resume as fixture
from memory_v2_unchain_active_bridge import (
    pupu_unchain_cold_accepted_interaction_resolution,
)
from test_memory_v2_acceptance_crash_matrix import (
    _fresh_process_pending,
    first_pending,
    second_pending,
    submit,
)


def _read_canonical(pending):
    return pupu_unchain_cold_accepted_interaction_resolution(
        owner_chat_id=fixture.OWNER_CHAT_ID,
        session_id=fixture.EXECUTION_ID,
        source_attempt_id=pending["source_run_id"],
        interaction_id=pending["interaction_id"],
    )


def _load_host(pending):
    return host._interaction_runtime().load(
        fixture.EXECUTION_ID,
        interaction_id=pending["interaction_id"],
        require_active=False,
    )


def test_commit_lock_excludes_other_threads_and_reenters_on_the_same_thread(
    tmp_path, monkeypatch,
):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    session_id = "commit-lock-session"
    holder_entered = threading.Event()
    release_holder = threading.Event()
    holder_left_at: list[float] = []
    contender_entered_at: list[float] = []

    def hold():
        with host._interaction_commit_lock(session_id):
            # Same thread, same session: re-entry must not self-deadlock.
            with host._interaction_commit_lock(session_id):
                holder_entered.set()
                release_holder.wait(timeout=10)
            # Stamp while still holding: the contender cannot enter until the
            # release that immediately follows this line.
            holder_left_at.append(time.monotonic())

    def contend():
        with host._interaction_commit_lock(session_id):
            contender_entered_at.append(time.monotonic())

    holder = threading.Thread(target=hold)
    holder.start()
    assert holder_entered.wait(timeout=5)
    contender = threading.Thread(target=contend)
    contender.start()
    contender.join(timeout=0.5)
    assert contender.is_alive(), "second thread entered the commit lock while it was held"
    release_holder.set()
    holder.join(timeout=5)
    contender.join(timeout=5)
    assert not contender.is_alive()
    assert holder_left_at and contender_entered_at
    assert holder_left_at[0] <= contender_entered_at[0]
    # A different session is an independent lock.
    with host._interaction_commit_lock(session_id):
        other = threading.Thread(
            target=lambda: host._interaction_commit_lock("another-session").__enter__()
        )
        other.start()
        other.join(timeout=2)
        assert not other.is_alive()


@pytest.mark.parametrize("pending_factory", [first_pending, second_pending])
def test_cancel_after_answer_crashed_before_host_receipt_keeps_the_answer(
    tmp_path, monkeypatch, pending_factory,
):
    """Crash cell of K4: canonical committed, host receipt lost, then cancel."""

    with pending_factory(tmp_path, monkeypatch) as pending:
        runtime = host._interaction_runtime()
        original_factory = host._interaction_runtime
        monkeypatch.setattr(host, "_interaction_runtime", lambda: runtime)
        monkeypatch.setattr(
            runtime,
            "record_receipt",
            lambda *a, **k: (_ for _ in ()).throw(
                RuntimeError("crash before host receipt")
            ),
        )
        with pytest.raises(RuntimeError, match="crash before host receipt"):
            submit(pending, "vue")
        monkeypatch.setattr(host, "_interaction_runtime", original_factory)

        canonical_before = _read_canonical(pending)
        assert canonical_before is not None
        assert canonical_before.response["selected_values"] == ["vue"]
        assert _load_host(pending).receipt is None

        result = host.cancel_chat_execution(
            session_id=fixture.EXECUTION_ID,
            attempt_id=pending["source_run_id"],
            owner_chat_id=fixture.OWNER_CHAT_ID,
            expected_interaction_id=pending["interaction_id"],
            reason="user_stop",
        )
        assert result["status"] == "ok"
        assert result["durable_interaction_cancelled"] is True
        assert result["context_interaction_reconciled"] is True

        canonical = _read_canonical(pending)
        final_host = _load_host(pending)
        assert canonical is not None
        assert final_host.receipt is not None
        # The accepted answer is preserved on both sides ...
        assert canonical.response == final_host.receipt.response
        assert final_host.receipt.response["selected_values"] == ["vue"]
        assert canonical.response == canonical_before.response
        # ... and the cancellation is recorded as the applied terminal fact,
        # so nothing continues from here.
        assert isinstance(final_host.application, dict)
        assert str(final_host.application.get("applied_checkpoint_id", "")).startswith(
            "cancelled:"
        )
        assert host._load_execution_cancellation(
            fixture.EXECUTION_ID, pending["source_run_id"]
        ) is not None
        assert host.get_pending_interaction(fixture.EXECUTION_ID)["status"] == "none"
        with pytest.raises(host.DurableInteractionHostError) as late:
            submit(pending, "react")
        assert late.value.code in {"execution_cancelled", "interaction_not_found"}
        # Idempotent: a repeated cancel changes nothing and still agrees.
        again = host.cancel_chat_execution(
            session_id=fixture.EXECUTION_ID,
            attempt_id=pending["source_run_id"],
            owner_chat_id=fixture.OWNER_CHAT_ID,
            expected_interaction_id=pending["interaction_id"],
            reason="user_stop",
        )
        assert again["status"] == "ok"
        assert _read_canonical(pending).response == _load_host(pending).receipt.response

    # A brand-new process sees the same settled state, not a pending answer.
    fresh = _fresh_process_pending(tmp_path)
    assert fresh["status"] == "none"


def test_cancel_then_late_answer_leaves_one_agreeing_resolution(tmp_path, monkeypatch):
    """Cancel wins first; the late answer is rejected before any canonical write."""

    with second_pending(tmp_path, monkeypatch) as pending:
        result = host.cancel_chat_execution(
            session_id=fixture.EXECUTION_ID,
            attempt_id=pending["source_run_id"],
            owner_chat_id=fixture.OWNER_CHAT_ID,
            expected_interaction_id=pending["interaction_id"],
            reason="user_stop",
        )
        assert result["status"] == "ok"
        with pytest.raises(host.DurableInteractionHostError) as rejected:
            submit(pending, "vue")
        assert rejected.value.code == "execution_cancelled"
        canonical = _read_canonical(pending)
        final_host = _load_host(pending)
        assert canonical is not None and final_host.receipt is not None
        assert canonical.response == final_host.receipt.response
        assert final_host.receipt.response.get("cancelled") is True
        store, _ = fixture._plan_from_store(tmp_path)
        journal = store.bind_execution(fixture.EXECUTION_ID)
        assert sum(
            1
            for event in journal.capture_snapshot().events
            if event.event_type == "interaction.resolved"
            and event.payload.get("interaction_id") == pending["interaction_id"]
        ) == 1
