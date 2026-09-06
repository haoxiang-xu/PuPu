"""Independent AC-016/017 review of canonical/host persistent boundaries."""

from collections import Counter
from contextlib import contextmanager

import pytest
import durable_interaction_host as host
import test_memory_v2_unchain_active_graph_interaction_resume as fixture
import unchain_adapter as adapter
from unchain.journal import DurableEventSink


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


def test_failed_canonical_event_does_not_permanently_claim_unaccepted_answer(
    tmp_path, monkeypatch,
):
    with second_pending(tmp_path, monkeypatch) as pending:
        original_append = DurableEventSink.append_projected
        interrupted = False

        def fail_resolution_event(self, draft):
            nonlocal interrupted
            if draft.event_type == "interaction.resolved":
                interrupted = True
                raise RuntimeError("interrupted between artifact and event")
            return original_append(self, draft)

        monkeypatch.setattr(DurableEventSink, "append_projected", fail_resolution_event)
        with pytest.raises(host.DurableInteractionHostError) as rejected:
            submit(pending, "vue")
        assert interrupted
        assert rejected.value.code == "interaction_canonical_conflict"
        assert host._interaction_runtime().load_active(fixture.EXECUTION_ID).receipt is None
        store, _ = fixture._plan_from_store(tmp_path)
        journal = store.bind_execution(fixture.EXECUTION_ID)
        assert not any(
            event.event_type == "interaction.resolved"
            and event.payload.get("interaction_id") == pending["interaction_id"]
            for event in journal.capture_snapshot().events
        )
        monkeypatch.setattr(DurableEventSink, "append_projected", original_append)
        # No accepted resolution exists, so the failed attempt cannot reserve
        # the question against a subsequent valid answer.
        assert submit(pending, "react")["status"] == "ok"
