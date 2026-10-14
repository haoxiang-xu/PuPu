"""Stop fences the execution owner even when the request belongs to a graph step."""
from collections import Counter

import pytest

import durable_interaction_host as host
import execution_control
import session_execution_guard
import unchain_adapter as adapter
import test_durable_interaction_host as host_tests
from test_memory_v2_unchain_active_graph_interaction_resume import (
    COORDINATOR_ATTEMPT_ID, EXECUTION_ID, OWNER_CHAT_ID, RECIPE_NAME,
    _production_patches, _recipe_payload,
)


def _suspend_graph(tmp_path):
    from recipe_loader import save_recipe

    with _production_patches(
        tmp_path=tmp_path, provider_calls=Counter(), provider_requests={}, agent_calls=[],
    ):
        save_recipe(_recipe_payload())
        list(adapter.stream_chat_events(
            message="Ask for the framework", history=[], attachments=[],
            options={
                "modelId": "openai:graph-base", "recipe_name": RECIPE_NAME,
                "memory_enabled": True, "durable_interactions_required": True,
                "_memory_v2_requested": True, "_memory_v2_owner_chat_id": OWNER_CHAT_ID,
                "_memory_v2_session_id": EXECUTION_ID,
                "_memory_v2_attempt_id": COORDINATOR_ATTEMPT_ID,
            },
            session_id=EXECUTION_ID, attempt_id=COORDINATOR_ATTEMPT_ID,
        ))
    return host.get_pending_interaction(EXECUTION_ID)


@pytest.mark.parametrize("consumer", ["lookup", "receipt", "finalizer"])
def test_graph_coordinator_stop_retires_step_approval(tmp_path, monkeypatch, consumer):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    pending = _suspend_graph(tmp_path)
    execution_control.request_cancel(EXECUTION_ID, COORDINATOR_ATTEMPT_ID)
    if consumer == "lookup":
        assert host.get_pending_interaction(EXECUTION_ID)["status"] == "none"
    elif consumer == "receipt":
        with pytest.raises(host.DurableInteractionHostError) as caught:
            host.record_interaction_receipt(
                session_id=EXECUTION_ID, interaction_id=pending["interaction_id"], approved=True,
                modified_arguments={"user_response": {"selected_values": ["react"]}},
            )
        assert caught.value.code == "execution_cancelled"
    else:
        assert host.finalize_cancelled_execution_interactions(
            session_id=EXECUTION_ID, attempt_id=COORDINATOR_ATTEMPT_ID,
        )
    snapshot = host._interaction_runtime().load(
        EXECUTION_ID, interaction_id=pending["interaction_id"], require_active=False,
    )
    assert snapshot.application["applied_checkpoint_id"] == f"cancelled:{snapshot.checkpoint_id}"
    assert host.get_pending_interaction(EXECUTION_ID)["status"] == "none"
    assert session_execution_guard.snapshot_session_guard(session_id=EXECUTION_ID) is None


def test_old_cancel_finalizer_does_not_touch_new_attempt(tmp_path, monkeypatch):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    session_execution_guard.initialize_session_guard_protocol()
    execution_control.register("session", "old")
    execution_control.mark_running("session", "old")
    execution_control.request_cancel("session", "old")
    execution_control.finish_cancelled_run("session", "old")
    execution_control.register("session", "new")
    execution_control.mark_running("session", "new")
    fixture = host_tests.DurableInteractionHostTests()
    request = fixture._seed_cancellable_request(session_id="session", attempt_id="new")
    assert not host.finalize_cancelled_execution_interactions(session_id="session", attempt_id="old")
    assert host._interaction_runtime().load_active("session").request.interaction_id == request.interaction_id
    assert execution_control.snapshot("session", "new").status == "running"
    assert session_execution_guard.snapshot_session_guard(session_id="session").attempt_id == "new"


def test_late_flat_request_is_retired_before_worker_guard_release(tmp_path, monkeypatch):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    session_execution_guard.initialize_session_guard_protocol()
    execution_control.register("session", "old")
    execution_control.mark_running("session", "old")
    # The first cancellation scan sees no request; the in-flight request then commits.
    host.cancel_chat_execution(session_id="session", attempt_id="old")
    fixture = host_tests.DurableInteractionHostTests()
    request = fixture._seed_cancellable_request(session_id="session", attempt_id="old")
    assert host.finalize_cancelled_execution_interactions(session_id="session", attempt_id="old")
    snapshot = host._interaction_runtime().load(
        "session", interaction_id=request.interaction_id, require_active=False,
    )
    assert snapshot.application["applied_checkpoint_id"] == f"cancelled:{snapshot.checkpoint_id}"
    # Request cleanup must not impersonate the still-owned worker's guard release.
    assert session_execution_guard.snapshot_session_guard(session_id="session").state == "active"
    execution_control.finish_cancelled_run("session", "old")
    assert session_execution_guard.snapshot_session_guard(session_id="session") is None
    assert not host.finalize_cancelled_execution_interactions(session_id="session", attempt_id="old")


@pytest.mark.parametrize("stop_at", ["step_return", "after_cancel_check"])
def test_graph_worker_stop_between_step_return_and_suspend_seals_journal(tmp_path, monkeypatch, stop_at):
    from unittest import mock
    from recipe_loader import save_recipe
    from test_memory_v2_unchain_active_graph_interaction_resume import _plan_from_store

    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    with _production_patches(
        tmp_path=tmp_path, provider_calls=Counter(), provider_requests={}, agent_calls=[],
    ):
        real_build = adapter._build_developer_agent
        returned = False
        original_check = adapter._execution_raise_if_cancelled
        returned_checks = 0

        def check(token):
            nonlocal returned_checks
            original_check(token)
            if returned and stop_at == "after_cancel_check":
                returned_checks += 1
                if returned_checks == 2:
                    execution_control.request_cancel(EXECUTION_ID, COORDINATOR_ATTEMPT_ID)

        def build(*args, **kwargs):
            agent = real_build(*args, **kwargs)
            run = agent.run

            def stop_after_run(*run_args, **run_kwargs):
                nonlocal returned
                result = run(*run_args, **run_kwargs)
                returned = True
                if stop_at == "step_return":
                    execution_control.request_cancel(EXECUTION_ID, COORDINATOR_ATTEMPT_ID)
                return result

            object.__setattr__(agent, "run", stop_after_run)
            return agent

        save_recipe(_recipe_payload())
        with mock.patch.object(adapter, "_build_developer_agent", side_effect=build), mock.patch.object(
            adapter, "_execution_raise_if_cancelled", side_effect=check,
        ):
            list(adapter.stream_chat_events(
                message="Ask for the framework", history=[], attachments=[],
                options={
                    "modelId": "openai:graph-base", "recipe_name": RECIPE_NAME,
                    "memory_enabled": True, "durable_interactions_required": True,
                    "_memory_v2_requested": True, "_memory_v2_owner_chat_id": OWNER_CHAT_ID,
                    "_memory_v2_session_id": EXECUTION_ID,
                    "_memory_v2_attempt_id": COORDINATOR_ATTEMPT_ID,
                },
                session_id=EXECUTION_ID, attempt_id=COORDINATOR_ATTEMPT_ID,
            ))
    assert host.get_pending_interaction(EXECUTION_ID)["status"] == "none"
    assert session_execution_guard.snapshot_session_guard(session_id=EXECUTION_ID) is None
    store, plan = _plan_from_store(tmp_path)
    events = [event for event in store.bind_execution(EXECUTION_ID).capture_snapshot().events
              if event.attempt.attempt_id == plan.orchestration_attempt.attempt_id]
    assert [event.event_type for event in events][-1] == "run_cancelled"


@pytest.mark.parametrize("mode", ["failed_resume", "cancel_flag_only", "exact_stop"])
def test_accepted_answer_only_seals_after_exact_stop_application(tmp_path, monkeypatch, mode):
    from unittest import mock
    from memory_v2_unchain_graph_checkpoint import PupuUnchainGraphCheckpointHost
    from memory_v2_unchain_graph_failure import settle_pupu_unchain_graph_failure
    from memory_v2_unchain_active_bridge import pupu_unchain_cold_accepted_interaction_resolution

    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    instances = []
    original_init = PupuUnchainGraphCheckpointHost.__init__

    def capture(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        instances.append(self)

    with mock.patch.object(PupuUnchainGraphCheckpointHost, "__init__", capture):
        pending = _suspend_graph(tmp_path)
    host.record_interaction_receipt(
        session_id=EXECUTION_ID, interaction_id=pending["interaction_id"], approved=True,
        modified_arguments={"user_response": {"selected_values": ["react"]}},
    )
    stopped = mode == "exact_stop"
    if stopped:
        host.cancel_chat_execution(
            session_id=EXECUTION_ID, attempt_id=COORDINATOR_ATTEMPT_ID,
            expected_interaction_id=pending["interaction_id"],
        )
    result = settle_pupu_unchain_graph_failure(
        instances[0], cancelled=mode != "failed_resume",
    )
    events = instances[0].service.repository.journal.capture_snapshot().events
    for attempt in (instances[0].plan.orchestration_attempt, instances[0].plan.steps[0].attempt):
        assert sum(e.attempt == attempt and e.event_type == "run_cancelled" for e in events) == int(stopped)
    # Exact Stop now seals a parked graph before releasing its guard; the
    # later worker settlement is an idempotent read.
    assert result.root_terminal_written is False
    assert result.step_terminal_written is False
    accepted = pupu_unchain_cold_accepted_interaction_resolution(
        owner_chat_id=OWNER_CHAT_ID, session_id=EXECUTION_ID,
        source_attempt_id=pending["source_run_id"], interaction_id=pending["interaction_id"],
    )
    assert accepted.response["selected_values"] == ["react"]
    assert accepted.response.get("cancelled") is not True
