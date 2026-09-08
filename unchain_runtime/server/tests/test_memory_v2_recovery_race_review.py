"""Independent BC-007/R06 review of preflight-to-receipt serialization."""

from collections import Counter

import pytest

import durable_interaction_host as host
import session_execution_guard
import test_memory_v2_unchain_active_graph_interaction_resume as fixture
import unchain_adapter as adapter
from unchain.context.artifacts import ArtifactService
from unchain.context.ingress import ContextInputIngress, HostResolvedInteractionInput
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.journal import DurableEventSink


def test_resolution_between_preflight_and_receipt_does_not_persist_answer(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    from recipe_loader import save_recipe

    provider_calls = Counter()
    options = {
        "modelId": "openai:graph-base",
        "recipe_name": fixture.RECIPE_NAME,
        "memory_enabled": True,
        "durable_interactions_required": True,
        "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": fixture.OWNER_CHAT_ID,
        "_memory_v2_session_id": fixture.EXECUTION_ID,
        "_memory_v2_attempt_id": fixture.COORDINATOR_ATTEMPT_ID,
    }
    with fixture._production_patches(
        tmp_path=tmp_path, provider_calls=provider_calls,
        provider_requests={}, agent_calls=[],
        interaction_counts={
            ("openai", "graph-collect"): 1,
            ("openai", "graph-write"): 1,
        },
    ):
        save_recipe(fixture._recipe_payload(write_model="openai:graph-write"))
        list(adapter.stream_chat_events(
            message="Check a canonical transition after preflight",
            history=[], attachments=[], options=options,
            session_id=fixture.EXECUTION_ID,
            attempt_id=fixture.COORDINATOR_ATTEMPT_ID,
        ))
        first = adapter.get_pending_interaction(fixture.EXECUTION_ID)
        host.record_interaction_receipt(
            session_id=fixture.EXECUTION_ID,
            interaction_id=first["interaction_id"], approved=True,
            modified_arguments={"user_response": {"selected_values": ["react"]}},
        )
        list(adapter.resume_chat_interaction_events(
            session_id=fixture.EXECUTION_ID,
            interaction_id=first["interaction_id"], options=options,
            attempt_id="transport-race-review",
            source_attempt_id=first["source_run_id"],
        ))
        second = adapter.get_pending_interaction(fixture.EXECUTION_ID)
        assert second["status"] == "awaiting_response"
        runtime = host._interaction_runtime()
        before = runtime.load_active(fixture.EXECUTION_ID)
        assert before.receipt is None
        guard_before = session_execution_guard.snapshot_session_guard(
            session_id=fixture.EXECUTION_ID
        )
        calls_before = provider_calls.copy()
        store, plan = fixture._plan_from_store(tmp_path)
        journal = store.bind_execution(fixture.EXECUTION_ID)
        step = plan.steps[1]
        artifacts = ArtifactService(journal, sanitizer=lambda content, _: content)
        projector = CanonicalSemanticEventProjector(
            attempt=step.attempt, artifacts=artifacts,
            payload_sanitizer=lambda _, payload: payload,
        )
        sink = DurableEventSink(journal, step.attempt, projector)
        validate = host._validated_durable_interaction_guard_owner_attempt
        advanced = False

        def advance_after_preflight(**kwargs):
            nonlocal advanced
            result = validate(**kwargs)
            if not advanced:
                advanced = True
                # Real canonical ingress advances the authoritative journal in
                # the gap after proof validation, before the host receipt CAS.
                ContextInputIngress(
                    attempt=step.attempt, projector=projector, sink=sink
                ).persist(HostResolvedInteractionInput(
                    attempt=step.attempt,
                    interaction_id=second["interaction_id"],
                    response={"answer": "concurrent answer"},
                    submitted_by="ui:concurrent-review",
                ))
            return result

        monkeypatch.setattr(
            host, "_validated_durable_interaction_guard_owner_attempt",
            advance_after_preflight,
        )
        with pytest.raises(host.DurableInteractionHostError) as rejected:
            host.record_interaction_receipt(
                session_id=fixture.EXECUTION_ID,
                interaction_id=second["interaction_id"], approved=True,
                modified_arguments={"user_response": {"selected_values": ["vue"]}},
            )
        assert advanced
        assert rejected.value.code == "interaction_canonical_conflict"
        after = runtime.load_active(fixture.EXECUTION_ID)
        assert provider_calls == calls_before
        assert session_execution_guard.snapshot_session_guard(
            session_id=fixture.EXECUTION_ID
        ) == guard_before
        assert after.receipt is None, "Stale preflight persisted a conflicting answer"
        assert after.session_snapshot.revision == before.session_snapshot.revision


def test_retry_recovers_when_canonical_resolution_precedes_host_receipt(
    tmp_path, monkeypatch,
):
    """A host write failure must leave one replayable canonical resolution."""
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    from recipe_loader import save_recipe

    provider_calls = Counter()
    options = {
        "modelId": "openai:graph-base",
        "recipe_name": fixture.RECIPE_NAME,
        "memory_enabled": True,
        "durable_interactions_required": True,
        "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": fixture.OWNER_CHAT_ID,
        "_memory_v2_session_id": fixture.EXECUTION_ID,
        "_memory_v2_attempt_id": fixture.COORDINATOR_ATTEMPT_ID,
    }
    with fixture._production_patches(
        tmp_path=tmp_path, provider_calls=provider_calls,
        provider_requests={}, agent_calls=[],
        interaction_counts={
            ("openai", "graph-collect"): 1,
            ("openai", "graph-write"): 1,
        },
    ):
        save_recipe(fixture._recipe_payload(write_model="openai:graph-write"))
        list(adapter.stream_chat_events(
            message="Recover canonical interaction receipt",
            history=[], attachments=[], options=options,
            session_id=fixture.EXECUTION_ID,
            attempt_id=fixture.COORDINATOR_ATTEMPT_ID,
        ))
        pending = adapter.get_pending_interaction(fixture.EXECUTION_ID)
        runtime = host._interaction_runtime()
        original_record = runtime.record_receipt
        monkeypatch.setattr(host, "_interaction_runtime", lambda: runtime)

        def fail_after_canonical(*_args, **_kwargs):
            raise RuntimeError("simulated host receipt interruption")

        monkeypatch.setattr(runtime, "record_receipt", fail_after_canonical)
        with pytest.raises(RuntimeError, match="simulated host receipt interruption"):
            host.record_interaction_receipt(
                session_id=fixture.EXECUTION_ID,
                interaction_id=pending["interaction_id"], approved=True,
                modified_arguments={"user_response": {"selected_values": ["react"]}},
            )

        assert runtime.load_active(fixture.EXECUTION_ID).receipt is None
        store, _plan = fixture._plan_from_store(tmp_path)
        journal = store.bind_execution(fixture.EXECUTION_ID)
        assert [event.event_type for event in journal.capture_snapshot().events].count(
            "interaction.resolved"
        ) == 1

        monkeypatch.setattr(runtime, "record_receipt", original_record)
        result = host.record_interaction_receipt(
            session_id=fixture.EXECUTION_ID,
            interaction_id=pending["interaction_id"], approved=True,
            modified_arguments={"user_response": {"selected_values": ["react"]}},
        )

        assert result["status"] == "ok"
        assert runtime.load_active(fixture.EXECUTION_ID).receipt is not None
        assert [event.event_type for event in journal.capture_snapshot().events].count(
            "interaction.resolved"
        ) == 1
