"""SEQ-010: exit at every persistence boundary, recover in a fresh process.

Complements test_memory_v2_acceptance_boundary_review.py, whose two tests
recover an interrupted acceptance inside the SAME process (a new
DurableInteractionRuntime instance, but the same Python interpreter). This
file adds the matrix cells that review left NOT_RUN in Checkpoint 1:
a real second OS process recovering the answer, concurrent submissions
racing for the same question, and cancel/accept ordering.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from collections import Counter
from contextlib import contextmanager

import pytest
import durable_interaction_host as host
import test_memory_v2_unchain_active_graph_interaction_resume as fixture
import unchain_adapter as adapter
from unchain.persistence.sqlite_v2 import _SQLiteBoundContextV2Repository


@contextmanager
def second_pending(tmp_path, monkeypatch):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    from recipe_loader import save_recipe

    options = {
        "modelId": "openai:graph-base", "recipe_name": fixture.RECIPE_NAME,
        "memory_enabled": True, "durable_interactions_required": True,
        "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": fixture.OWNER_CHAT_ID,
        "_memory_v2_session_id": fixture.EXECUTION_ID,
        "_memory_v2_attempt_id": fixture.COORDINATOR_ATTEMPT_ID,
    }
    with fixture._production_patches(
        tmp_path=tmp_path, provider_calls=Counter(), provider_requests={},
        agent_calls=[], interaction_counts={
            ("openai", "graph-collect"): 1, ("openai", "graph-write"): 1,
        },
    ):
        save_recipe(fixture._recipe_payload(write_model="openai:graph-write"))
        list(adapter.stream_chat_events(
            message="Crash matrix acceptance boundaries", history=[],
            attachments=[], options=options, session_id=fixture.EXECUTION_ID,
            attempt_id=fixture.COORDINATOR_ATTEMPT_ID,
        ))
        first = adapter.get_pending_interaction(fixture.EXECUTION_ID)
        submit(first, "react")
        list(adapter.resume_chat_interaction_events(
            session_id=fixture.EXECUTION_ID,
            interaction_id=first["interaction_id"], options=options,
            attempt_id="transport-crash-matrix",
            source_attempt_id=first["source_run_id"],
        ))
        pending = adapter.get_pending_interaction(fixture.EXECUTION_ID)
        assert pending["status"] == "awaiting_response"
        yield pending


@contextmanager
def first_pending(tmp_path, monkeypatch):
    """The graph's first interaction, before any resume.

    Cancel/accept ordering only needs the atomic-acceptance path (J3); it
    does not need the second interaction's post-resume graph lineage, whose
    own cancel/guard validation is a separate, pre-existing concern outside
    this fix's scope. Using the first interaction keeps the cancel tests
    focused on what this fix actually changed.
    """

    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    from recipe_loader import save_recipe

    options = {
        "modelId": "openai:graph-base", "recipe_name": fixture.RECIPE_NAME,
        "memory_enabled": True, "durable_interactions_required": True,
        "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": fixture.OWNER_CHAT_ID,
        "_memory_v2_session_id": fixture.EXECUTION_ID,
        "_memory_v2_attempt_id": fixture.COORDINATOR_ATTEMPT_ID,
    }
    with fixture._production_patches(
        tmp_path=tmp_path, provider_calls=Counter(), provider_requests={},
        agent_calls=[], interaction_counts={
            ("openai", "graph-collect"): 1, ("openai", "graph-write"): 1,
        },
    ):
        save_recipe(fixture._recipe_payload(write_model="openai:graph-write"))
        list(adapter.stream_chat_events(
            message="Crash matrix cancel ordering", history=[],
            attachments=[], options=options, session_id=fixture.EXECUTION_ID,
            attempt_id=fixture.COORDINATOR_ATTEMPT_ID,
        ))
        pending = adapter.get_pending_interaction(fixture.EXECUTION_ID)
        assert pending["status"] == "awaiting_response"
        yield pending


def submit(pending, answer):
    return host.record_interaction_receipt(
        session_id=fixture.EXECUTION_ID,
        interaction_id=pending["interaction_id"], approved=True,
        modified_arguments={"user_response": {"selected_values": [answer]}},
    )


_RECOVER_SCRIPT = """
import json, os, sys
sys.path.insert(0, {server!r})
import unchain_adapter as adapter
print(json.dumps(adapter.get_pending_interaction({session!r})))
"""


def _fresh_process_pending(tmp_path):
    """Query the pending interaction from a brand-new Python process.

    Unlike host._interaction_runtime() called again in this same process,
    this proves recovery survives an actual process boundary: no shared
    interpreter state, no cached module singletons, only the on-disk data
    under UNCHAIN_DATA_DIR.
    """

    env = {
        **os.environ,
        "UNCHAIN_DATA_DIR": str(tmp_path),
        "PUPU_CONTEXT_V2_STORE_OWNER": "unchain",
    }
    server_dir = os.path.dirname(os.path.abspath(adapter.__file__))
    completed = subprocess.run(
        [sys.executable, "-c", _RECOVER_SCRIPT.format(server=server_dir, session=fixture.EXECUTION_ID)],
        capture_output=True,
        text=True,
        env=env,
        timeout=120,
    )
    assert completed.returncode == 0, (
        f"recovery subprocess failed: stdout={completed.stdout!r} stderr={completed.stderr!r}"
    )
    last_line = completed.stdout.strip().splitlines()[-1]
    return json.loads(last_line)


@pytest.mark.parametrize(
    "boundary",
    [
        "before_canonical_commit",
        "after_canonical_before_host_receipt",
    ],
)
def test_interruption_then_fresh_process_recovers_one_answer(
    tmp_path, monkeypatch, boundary,
):
    with second_pending(tmp_path, monkeypatch) as pending:
        if boundary == "before_canonical_commit":
            original = _SQLiteBoundContextV2Repository._append_with_connection

            def explode(self, connection, request):
                if request.event_type == "interaction.resolved":
                    raise RuntimeError("exit before canonical commit")
                return original(self, connection, request)

            monkeypatch.setattr(
                _SQLiteBoundContextV2Repository, "_append_with_connection", explode
            )
            # record_interaction_receipt wraps any canonical-ingress failure
            # into a DurableInteractionHostError (see _canonical_rejection_reason);
            # an uncaught RuntimeError never reaches the caller.
            with pytest.raises(host.DurableInteractionHostError) as rejected:
                submit(pending, "vue")
            assert rejected.value.code == "interaction_canonical_conflict"
            monkeypatch.setattr(
                _SQLiteBoundContextV2Repository, "_append_with_connection", original
            )
        else:
            runtime = host._interaction_runtime()
            monkeypatch.setattr(host, "_interaction_runtime", lambda: runtime)
            monkeypatch.setattr(
                runtime,
                "record_receipt",
                lambda *a, **k: (_ for _ in ()).throw(
                    RuntimeError("exit before host receipt")
                ),
            )
            with pytest.raises(RuntimeError, match="exit before host receipt"):
                submit(pending, "vue")

    # Everything above ran with this test's monkeypatches and in-process
    # session-guard state; query recovery from a genuinely separate process
    # that only sees what was actually committed to disk.
    recovered = _fresh_process_pending(tmp_path)
    assert recovered["interaction_id"] == pending["interaction_id"]
    if boundary == "before_canonical_commit":
        assert recovered["status"] == "awaiting_response"
    else:
        assert recovered["status"] == "receipt_recorded"
        assert recovered["resolution"]["response"]["selected_values"] == ["vue"]


def test_concurrent_same_and_different_answers_accept_exactly_one(
    tmp_path, monkeypatch,
):
    with second_pending(tmp_path, monkeypatch) as pending:
        results: list[tuple[str, str]] = []
        errors: list[tuple[str, str]] = []
        crashes: list[tuple[str, str]] = []
        lock = threading.Lock()

        def go(answer):
            try:
                receipt_id = submit(pending, answer)["receipt_id"]
                with lock:
                    results.append((answer, receipt_id))
            except host.DurableInteractionHostError as exc:
                with lock:
                    errors.append((answer, exc.code))
            except BaseException as exc:  # noqa: BLE001 - every outcome must be accounted for
                with lock:
                    crashes.append((answer, repr(exc)))

        threads = [
            threading.Thread(target=go, args=(answer,))
            for answer in ("vue", "vue", "react", "react")
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=60)
            assert not thread.is_alive(), "submission thread did not finish"

        assert not crashes, f"submission threads died outside the host error contract: {crashes}"
        assert len(results) + len(errors) == 4, (results, errors)
        accepted_answers = {answer for answer, _ in results}
        assert len(accepted_answers) == 1, f"both answers were accepted: {results}"
        accepted_receipt_ids = {receipt_id for _, receipt_id in results}
        assert len(accepted_receipt_ids) == 1, (
            f"the same answer produced different receipt ids: {results}"
        )
        assert results, "no submission succeeded at all"
        assert all(
            code in {"interaction_canonical_conflict", "interaction_receipt_conflict"}
            for _, code in errors
        ), errors

        store, _ = fixture._plan_from_store(tmp_path)
        journal = store.bind_execution(fixture.EXECUTION_ID)
        resolved_count = sum(
            1
            for event in journal.capture_snapshot().events
            if event.event_type == "interaction.resolved"
            and event.payload.get("interaction_id") == pending["interaction_id"]
        )
        assert resolved_count == 1, (
            "exactly one interaction.resolved event must exist for this question"
        )


def test_cancel_before_accept_rejects_the_answer(tmp_path, monkeypatch):
    with first_pending(tmp_path, monkeypatch) as pending:
        cancellation = adapter.cancel_chat_execution(
            session_id=fixture.EXECUTION_ID,
            attempt_id=pending["source_run_id"],
            owner_chat_id=fixture.OWNER_CHAT_ID,
            expected_interaction_id=pending["interaction_id"],
            reason="user_stop",
        )
        assert cancellation["durable_interaction_cancelled"] is True

        # Cancellation itself projects a terminal canonical resolution (via
        # require_unresolved=False, see persist_pupu_unchain_cold_interaction_resolution).
        # A later, real answer is rejected by record_interaction_receipt's
        # host-side cancellation check (execution_cancelled) before the
        # canonical precondition is ever consulted; the canonical
        # already_resolved defence for the same scenario is pinned separately
        # in unchain's test_interaction_resolution_atomic_ingress.py.
        with pytest.raises(host.DurableInteractionHostError) as rejected:
            submit(pending, "vue")
        assert rejected.value.code == "execution_cancelled"

        store, _ = fixture._plan_from_store(tmp_path)
        journal = store.bind_execution(fixture.EXECUTION_ID)
        resolutions = tuple(
            event
            for event in journal.capture_snapshot().events
            if event.event_type == "interaction.resolved"
            and event.payload.get("interaction_id") == pending["interaction_id"]
        )
        assert len(resolutions) == 1, (
            "cancellation must leave exactly its own terminal resolution, "
            "not additionally accept the rejected answer"
        )


def test_accept_before_cancel_keeps_the_accepted_fact(tmp_path, monkeypatch):
    with first_pending(tmp_path, monkeypatch) as pending:
        accepted = submit(pending, "vue")
        assert accepted["status"] == "ok"

        store, _ = fixture._plan_from_store(tmp_path)
        journal = store.bind_execution(fixture.EXECUTION_ID)

        def resolutions_for(interaction_id):
            return tuple(
                event
                for event in journal.capture_snapshot().events
                if event.event_type == "interaction.resolved"
                and event.payload.get("interaction_id") == interaction_id
            )

        before = resolutions_for(pending["interaction_id"])
        assert len(before) == 1

        # A cancel arriving after the answer was already accepted recognizes
        # (via pupu_unchain_cold_accepted_interaction_resolution) that the
        # event-identity operation for this interaction is already claimed
        # by a real answer, and treats reconciliation as already done rather
        # than attempting -- and always losing -- a competing write. This
        # must succeed gracefully and never touch the already-accepted fact.
        result = adapter.cancel_chat_execution(
            session_id=fixture.EXECUTION_ID,
            attempt_id=pending["source_run_id"],
            owner_chat_id=fixture.OWNER_CHAT_ID,
            expected_interaction_id=pending["interaction_id"],
            reason="user_stop",
        )
        assert result["status"] == "ok"
        assert result["durable_interaction_cancelled"] is True

        after = resolutions_for(pending["interaction_id"])
        assert after == before, (
            "cancelling an already-accepted interaction must not alter its "
            "canonical resolution"
        )
        snapshot = host._interaction_runtime().load(
            fixture.EXECUTION_ID,
            interaction_id=pending["interaction_id"],
            require_active=False,
        )
        assert snapshot.receipt is not None, (
            "the host receipt for the accepted answer must remain intact"
        )
        assert snapshot.receipt.response["selected_values"] == ["vue"]
        # ... and the cancellation forbids continuation (plan §10.4 step 5):
        # the interaction is applied as cancelled, nothing is pending, and a
        # further answer is refused.
        assert isinstance(snapshot.application, dict)
        assert str(snapshot.application.get("applied_checkpoint_id", "")).startswith(
            "cancelled:"
        )
        assert adapter.get_pending_interaction(fixture.EXECUTION_ID)["status"] == "none"
        with pytest.raises(host.DurableInteractionHostError) as late:
            submit(pending, "react")
        assert late.value.code in {"execution_cancelled", "interaction_not_found"}
