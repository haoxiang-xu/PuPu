"""Independent BC-007 / R04 regression at the public receipt boundary."""

import json
from collections import Counter

import pytest

import test_memory_v2_unchain_active_graph_interaction_resume as fixture
import durable_interaction_host as host
import session_execution_guard
import unchain_adapter as adapter


def test_rejected_graph_identity_does_not_persist_answer(tmp_path, monkeypatch):
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
        tmp_path=tmp_path,
        provider_calls=provider_calls,
        provider_requests={},
        agent_calls=[],
        interaction_counts={
            ("openai", "graph-collect"): 1,
            ("openai", "graph-write"): 1,
        },
    ):
        save_recipe(fixture._recipe_payload(write_model="openai:graph-write"))
        list(adapter.stream_chat_events(
            message="Check preflight before persisting the second answer",
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
            attempt_id="transport-checkpoint-review",
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

        # Structurally valid, correctly hashed context with a noncanonical plan.
        # Keep the actual admitted plan/journal and all guard state untouched.
        context_path = host._graph_step_context_path(
            fixture.EXECUTION_ID, second["source_run_id"]
        )
        raw = json.loads(context_path.read_text(encoding="utf-8"))
        raw["graph_plan_id"] = "foreign-review-plan"
        raw["payload_sha256"] = host._graph_step_context_payload_sha256({
            key: value for key, value in raw.items()
            if key not in {"payload_sha256", "created_at_ms"}
        })
        context_path.write_text(json.dumps(raw, sort_keys=True), encoding="utf-8")

        with pytest.raises(host.DurableInteractionHostError) as rejected:
            host.record_interaction_receipt(
                session_id=fixture.EXECUTION_ID,
                interaction_id=second["interaction_id"], approved=True,
                modified_arguments={"user_response": {"selected_values": ["vue"]}},
            )
        assert rejected.value.code == "session_guard_interaction_attempt_mismatch"
        after = runtime.load_active(fixture.EXECUTION_ID)
        assert provider_calls == calls_before
        assert session_execution_guard.snapshot_session_guard(
            session_id=fixture.EXECUTION_ID
        ) == guard_before
        assert after.receipt is None, (
            "The rejected request persisted an answer before identity preflight: "
            f"{after.receipt.receipt_id}"
        )
        assert after.session_snapshot.revision == before.session_snapshot.revision
