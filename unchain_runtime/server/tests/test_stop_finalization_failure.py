"""Durable Stop cleanup failures must not strand the stream reader."""
import threading
from unittest import mock

import pytest

import execution_control
import session_execution_guard
import unchain_adapter as adapter
from test_memory_v2_unchain_active_graph_interaction_resume import (
    COORDINATOR_ATTEMPT_ID, EXECUTION_ID, OWNER_CHAT_ID, RECIPE_NAME, _recipe_payload,
)


def _read_bounded(stream):
    result = {}

    def read():
        try:
            result["events"] = list(stream)
        except BaseException as error:
            result["error"] = error

    reader = threading.Thread(target=read, daemon=True)
    reader.start()
    reader.join(timeout=5)
    assert not reader.is_alive(), "worker failed to notify the stream reader"
    return result


def test_flat_stop_retirement_failure_disconnects_and_preserves_guard(tmp_path, monkeypatch):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    session_execution_guard.initialize_session_guard_protocol()
    failure = OSError("durable cancellation write failed")

    class Agent:
        provider = "openai"
        _memory_runtime = {"requested": False, "available": False}
        _toolkits = []
        _max_iterations = 3
        _max_context_window_tokens = 8192

        def run(self, **kwargs):
            execution_control.request_cancel("flat", "attempt")
            raise adapter._stream_cancelled_error("stopped")

    with mock.patch.object(adapter, "_create_agent", return_value=Agent()), mock.patch.object(
        adapter, "_load_recipe_from_options", return_value=None,
    ), mock.patch.object(adapter, "finalize_cancelled_execution_interactions", side_effect=failure), mock.patch.object(
        adapter, "_disconnect_runtime_toolkits",
    ) as disconnect, mock.patch.object(adapter, "_failed_run_summary_event", return_value=None):
        result = _read_bounded(adapter.stream_chat_events(
            message="hello", history=[], options={}, session_id="flat", attempt_id="attempt",
        ))
    assert result["error"] is failure
    disconnect.assert_called_once()
    guard = session_execution_guard.snapshot_session_guard(session_id="flat")
    assert guard is not None and guard.state == "active" and guard.attempt_id == "attempt"


@pytest.mark.parametrize("failure_site", ["retirement", "settlement"])
def test_graph_stop_retirement_failure_disconnects_and_notifies_reader(tmp_path, monkeypatch, failure_site):
    from collections import Counter
    from test_memory_v2_unchain_active_graph_interaction_resume import _production_patches

    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    failure = OSError("durable graph cancellation write failed")
    # Wrap the production graph agent after the offline provider fixtures have bound it.
    with _production_patches(
        tmp_path=tmp_path, provider_calls=Counter(), provider_requests={}, agent_calls=[],
    ):
        build_agent = adapter._build_developer_agent

        def build(*args, **kwargs):
            agent = build_agent(*args, **kwargs)
            run = agent.run

            def stop(**run_kwargs):
                result = run(**run_kwargs)
                execution_control.request_cancel(EXECUTION_ID, COORDINATOR_ATTEMPT_ID)
                return result

            object.__setattr__(agent, "run", stop)
            return agent

        import memory_v2_unchain_graph_failure as graph_failure
        fault_target = adapter if failure_site == "retirement" else graph_failure
        fault_name = (
            "finalize_cancelled_execution_interactions"
            if failure_site == "retirement" else "settle_cancelled_parked_graph_interaction"
        )
        with mock.patch.object(adapter, "_build_developer_agent", side_effect=build), mock.patch.object(
            fault_target, fault_name, side_effect=failure,
        ), mock.patch.object(adapter, "_disconnect_runtime_toolkits") as disconnect, mock.patch.object(
            adapter, "_failed_run_summary_event", return_value=None,
        ) as summary:
            from recipe_loader import save_recipe
            save_recipe(_recipe_payload())
            result = _read_bounded(adapter.stream_chat_events(
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
    assert "error" not in result
    assert summary.call_args.args[0] is failure
    disconnect.assert_called()
    guard = session_execution_guard.snapshot_session_guard(session_id=EXECUTION_ID)
    assert guard is not None and guard.attempt_id == COORDINATOR_ATTEMPT_ID


def test_setup_retirement_failure_preserves_original_cancel_and_guard(tmp_path, monkeypatch):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    execution_control.register("setup", "attempt")
    running = execution_control.mark_running("setup", "attempt")
    token = execution_control.cancellation_token("setup", "attempt")
    execution_control.request_cancel("setup", "attempt")
    owner = adapter._AppliedExecutionOwnerScope(
        session_id="setup", attempt_id="attempt", running=running, execution_token=token,
    )
    with mock.patch.object(adapter, "finalize_cancelled_execution_interactions", side_effect=OSError("cleanup failed")):
        owner.cleanup(error=adapter._stream_cancelled_error("original Stop"))
    guard = session_execution_guard.snapshot_session_guard(session_id="setup")
    assert guard is not None and guard.attempt_id == "attempt"


def test_resume_stop_retirement_failure_disconnects_and_preserves_guard(tmp_path, monkeypatch):
    import test_unchain_adapter_execution_owner_scope as scope_tests

    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    fixture = scope_tests.UnchainAdapterExecutionOwnerScopeTests()
    fixture._parked_resume(
        session_id="resume", interaction_id="interaction", owner_attempt_id="source",
        source_attempt_id="source", receipt_id="receipt",
    )
    pending = fixture._pending(
        session_id="resume", interaction_id="interaction", source_attempt_id="source",
        receipt_id="receipt",
    )
    failure = OSError("durable resume cancellation write failed")

    class Agent:
        provider = "openai"
        model = "gpt-5"
        _memory_runtime = {"requested": True, "available": True}
        _toolkits = []
        _max_iterations = 3
        _max_context_window_tokens = 8192

        def resume_interaction(self, **kwargs):
            execution_control.request_cancel("resume", "attempt")
            raise adapter._stream_cancelled_error("stopped")

    with mock.patch.object(adapter, "get_pending_interaction", return_value=pending), mock.patch.object(
        adapter, "resolve_resume_options", return_value={},
    ), mock.patch.object(adapter, "_load_recipe_from_options", return_value=None), mock.patch.object(
        adapter, "bind_execution_attempt",
    ), mock.patch.object(adapter, "_create_agent", return_value=Agent()), mock.patch.object(
        adapter, "finalize_cancelled_execution_interactions", side_effect=failure,
    ), mock.patch.object(adapter, "_disconnect_runtime_toolkits") as disconnect, mock.patch.object(
        adapter, "_failed_run_summary_event", return_value=None,
    ):
        result = _read_bounded(adapter.resume_chat_interaction_events(
            session_id="resume", interaction_id="interaction", options={},
            attempt_id="attempt", source_attempt_id="source",
        ))
    assert result.get("error") is failure
    disconnect.assert_called_once()
    guard = session_execution_guard.snapshot_session_guard(session_id="resume")
    assert guard is not None and guard.state == "active" and guard.attempt_id == "attempt"
