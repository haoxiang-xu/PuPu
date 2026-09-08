"""Independent AC-016/017 review of canonical/host persistent boundaries."""

from collections import Counter
from contextlib import contextmanager

import pytest
import durable_interaction_host as host
import test_memory_v2_unchain_active_graph_interaction_resume as fixture
import unchain_adapter as adapter
from unchain.journal import DurableEventSink
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
            message="Review persistent acceptance boundaries", history=[],
            attachments=[], options=options, session_id=fixture.EXECUTION_ID,
            attempt_id=fixture.COORDINATOR_ATTEMPT_ID,
        ))
        first = adapter.get_pending_interaction(fixture.EXECUTION_ID)
        submit(first, "react")
        list(adapter.resume_chat_interaction_events(
            session_id=fixture.EXECUTION_ID,
            interaction_id=first["interaction_id"], options=options,
            attempt_id="transport-acceptance-boundary-review",
            source_attempt_id=first["source_run_id"],
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


def test_pending_recovers_second_interaction_after_host_receipt_interruption(
    tmp_path, monkeypatch,
):
    with second_pending(tmp_path, monkeypatch) as pending:
        runtime = host._interaction_runtime()
        original_runtime_factory = host._interaction_runtime

        def fail_receipt(*args, **kwargs):
            raise RuntimeError("host receipt interruption")

        monkeypatch.setattr(host, "_interaction_runtime", lambda: runtime)
        monkeypatch.setattr(runtime, "record_receipt", fail_receipt)
        with pytest.raises(RuntimeError, match="host receipt interruption"):
            submit(pending, "vue")
        assert runtime.load_active(fixture.EXECUTION_ID).receipt is None
        # Discard the previous runtime instance before the public cold lookup.
        monkeypatch.setattr(host, "_interaction_runtime", original_runtime_factory)
        recovered = adapter.get_pending_interaction(fixture.EXECUTION_ID)
        assert recovered["interaction_id"] == pending["interaction_id"]
        assert recovered["status"] == "receipt_recorded"
        assert recovered["resolution"]["response"]["selected_values"] == ["vue"]
        assert host._interaction_runtime().load_active(fixture.EXECUTION_ID).receipt is not None
        # Same answer again is an idempotent replay, a different one is refused.
        assert submit(pending, "vue")["status"] == "ok"
        with pytest.raises(host.DurableInteractionHostError) as conflict:
            submit(pending, "react")
        assert conflict.value.code == "interaction_canonical_conflict"


def test_failed_canonical_event_does_not_permanently_claim_unaccepted_answer(
    tmp_path, monkeypatch,
):
    with second_pending(tmp_path, monkeypatch) as pending:
        original_append = _SQLiteBoundContextV2Repository._append_with_connection
        interrupted = False

        def fail_resolution_event(self, connection, request):
            nonlocal interrupted
            if request.event_type == "interaction.resolved":
                interrupted = True
                assert (
                    connection.execute(
                        "SELECT count(*) FROM artifacts "
                        "WHERE operation_id LIKE 'artifact.interaction-resolution.%'"
                    ).fetchone()[0]
                    >= 1
                ), "artifact rows must already be staged in this transaction"
                raise RuntimeError("interrupted between artifact and event")
            return original_append(self, connection, request)

        store, _ = fixture._plan_from_store(tmp_path)
        journal = store.bind_execution(fixture.EXECUTION_ID)
        with journal._store._transaction(immediate=False) as connection:
            operations_before = connection.execute(
                "SELECT count(*) FROM operations "
                "WHERE operation_id LIKE 'artifact.interaction-resolution.%'"
            ).fetchone()[0]

        monkeypatch.setattr(
            _SQLiteBoundContextV2Repository, "_append_with_connection", fail_resolution_event
        )
        with pytest.raises(host.DurableInteractionHostError) as rejected:
            submit(pending, "vue")
        assert interrupted
        assert rejected.value.code == "interaction_canonical_conflict"
        assert host._interaction_runtime().load_active(fixture.EXECUTION_ID).receipt is None
        assert not any(
            event.event_type == "interaction.resolved"
            and event.payload.get("interaction_id") == pending["interaction_id"]
            for event in journal.capture_snapshot().events
        )
        with journal._store._transaction(immediate=False) as connection:
            operations_after = connection.execute(
                "SELECT count(*) FROM operations "
                "WHERE operation_id LIKE 'artifact.interaction-resolution.%'"
            ).fetchone()[0]
        assert operations_after == operations_before, (
            "the rolled-back attempt must not leave a staged artifact claim"
        )
        monkeypatch.setattr(
            _SQLiteBoundContextV2Repository, "_append_with_connection", original_append
        )
        # No accepted resolution exists, so the failed attempt cannot reserve
        # the question against a subsequent valid answer.
        assert submit(pending, "react")["status"] == "ok"
