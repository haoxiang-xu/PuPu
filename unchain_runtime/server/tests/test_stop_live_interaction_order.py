"""A live callback must retire its interaction before the kernel writes a terminal."""
from collections import Counter
import threading
from unittest import mock

import pytest

import durable_interaction_host as host
import unchain_adapter as adapter
from recipe_loader import save_recipe
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from test_memory_v2_unchain_active_graph_interaction_resume import (
    _production_patches, _recipe_payload, EXECUTION_ID, COORDINATOR_ATTEMPT_ID,
    OWNER_CHAT_ID, RECIPE_NAME,
)


@pytest.mark.parametrize("first,fail_projection", [("http", False), ("transport", False), ("transport", True), ("transport", "cold")])
def test_live_stop_waits_for_exact_cancellation_projection_before_terminal(tmp_path, monkeypatch, first, fail_projection):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    presented = threading.Event()
    projecting = threading.Event()
    release_projection = threading.Event()
    transport = threading.Event()
    result = {}
    options = {
        "modelId": "openai:graph-base", "recipe_name": RECIPE_NAME,
        "memory_enabled": True, "durable_interactions_required": True,
        "_memory_v2_requested": True, "_memory_v2_owner_chat_id": OWNER_CHAT_ID,
        "_memory_v2_session_id": EXECUTION_ID,
        "_memory_v2_attempt_id": COORDINATOR_ATTEMPT_ID,
    }
    real_reconcile = host._reconcile_cancelled_interaction_to_context

    def delayed_projection(**kwargs):
        projecting.set()
        assert release_projection.wait(5), "test did not release durable projection"
        if fail_projection:
            raise OSError("private durable projection unavailable")
        return real_reconcile(**kwargs)

    def read():
        try:
            for event in adapter.stream_chat_events(
                message="Ask for the framework", history=[], options=options,
                session_id=EXECUTION_ID, attempt_id=COORDINATOR_ATTEMPT_ID,
                cancel_event=transport,
            ):
                if event.get("type") == "tool_call" and event.get("requires_confirmation"):
                    result["interaction"] = event["confirmation_id"]
                    presented.set()
        except BaseException as error:
            result["error"] = error

    def cancel():
        try:
            host.cancel_chat_execution(
                session_id=EXECUTION_ID, attempt_id=COORDINATOR_ATTEMPT_ID,
                expected_interaction_id=result["interaction"],
            )
        except BaseException as error:
            result["cancel_error"] = error

    with _production_patches(
        tmp_path=tmp_path, provider_calls=Counter(), provider_requests={}, agent_calls=[],
    ):
        build = adapter._build_developer_agent
        # Keep the production live callback; the shared restart fixture normally
        # removes it to produce a cold suspended checkpoint.
        with mock.patch.object(adapter, "_build_developer_agent", side_effect=lambda **kw: build(**kw)._inner), mock.patch.object(
            host, "_reconcile_cancelled_interaction_to_context", side_effect=delayed_projection,
        ):
            save_recipe(_recipe_payload())
            reader = threading.Thread(target=read, daemon=True)
            reader.start()
            assert presented.wait(5)
            cancel_thread = threading.Thread(target=cancel, daemon=True)
            if first == "http":
                cancel_thread.start()
                assert projecting.wait(5)
            transport.set()
            adapter.cancel_tool_confirmations()
            if first == "transport":
                assert projecting.wait(5)
                cancel_thread.start()
            try:
                assert projecting.wait(5)
                # Synchronize on the callback cancel error itself: before the
                # fix it returns immediately and closes the journal while HTTP
                # reconciliation remains blocked above.
                reader.join(.3)
                store = SQLiteContextV2Store(database_path=tmp_path / "memory_v2" / "context_v2.sqlite3", object_directory=tmp_path / "memory_v2" / "objects")
                events = store.bind_execution(EXECUTION_ID).capture_snapshot().events
                assert not any(e.event_type in {"run_cancelled", "run_failed"} for e in events)
            finally:
                release_projection.set()
                reader.join(5)
                cancel_thread.join(5)
            assert not reader.is_alive() and not cancel_thread.is_alive()
            if fail_projection:
                import session_execution_guard
                guard = session_execution_guard.snapshot_session_guard(session_id=EXECUTION_ID)
                assert guard is not None and guard.state == "parked"
                # Pending-interaction polling must not consume only the host
                # application while canonical settlement remains unavailable.
                with pytest.raises(OSError, match="projection unavailable"):
                    host.get_pending_interaction(EXECUTION_ID)
                assert session_execution_guard.snapshot_session_guard(session_id=EXECUTION_ID) is not None
                events = store.bind_execution(EXECUTION_ID).capture_snapshot().events
                assert not any(e.event_type in {"run_cancelled", "run_failed"} for e in events)
                cold_retry = fail_projection == "cold"
                fail_projection = False
                if cold_retry:
                    import os
                    import subprocess
                    import sys
                    code = (
                        "from durable_interaction_host import cancel_chat_execution; "
                        f"cancel_chat_execution(session_id={EXECUTION_ID!r}, "
                        f"attempt_id={COORDINATOR_ATTEMPT_ID!r}, "
                        f"expected_interaction_id={result['interaction']!r})"
                    )
                    retry = subprocess.run(
                        [sys.executable, "-c", code], timeout=10, capture_output=True, text=True,
                        env={**os.environ, "PYTHONPATH": os.pathsep.join(sys.path)},
                    )
                    assert retry.returncode == 0, retry.stderr
                    # This is a second process, not a restarted owner: the
                    # original process is still alive. Its local thread state
                    # cannot authorize a foreign process to release the guard.
                    assert session_execution_guard.snapshot_session_guard(session_id=EXECUTION_ID) is not None
                    host.cancel_chat_execution(
                        session_id=EXECUTION_ID, attempt_id=COORDINATOR_ATTEMPT_ID,
                        expected_interaction_id=result["interaction"],
                    )
                else:
                    host.cancel_chat_execution(
                        session_id=EXECUTION_ID, attempt_id=COORDINATOR_ATTEMPT_ID,
                        expected_interaction_id=result["interaction"],
                    )
                assert session_execution_guard.snapshot_session_guard(session_id=EXECUTION_ID) is None
            else:
                assert "error" not in result and "cancel_error" not in result
            events = store.bind_execution(EXECUTION_ID).capture_snapshot().events
            resolutions = [e.store_seq for e in events if e.event_type == "interaction.resolved"]
            terminals = [e.store_seq for e in events if e.event_type == "run_cancelled"]
            assert len(resolutions) == 1 and len(terminals) == 2
            assert resolutions[0] < min(terminals)


@pytest.mark.parametrize("failure", ["snapshot", "lineage", "foreign_source"])
def test_callback_durable_read_failure_defers_without_claiming_foreign_owner(failure):
    from types import SimpleNamespace
    from unchain.interaction import DurableInteractionSettlementPending

    runtime = mock.Mock()
    runtime.load.return_value = SimpleNamespace(request=SimpleNamespace(
        source_run_id="foreign" if failure == "foreign_source" else "source",
    ))
    if failure == "snapshot":
        runtime.load.side_effect = OSError("private snapshot read failure")
    with mock.patch.object(host, "_interaction_runtime", return_value=runtime), mock.patch.object(
        host, "_durable_interaction_guard_owner_attempt", side_effect=OSError("private lineage read failure"),
    ), mock.patch.object(host, "_execution_control_cancel") as cancel:
        with pytest.raises(DurableInteractionSettlementPending) as raised:
            host.retire_cancelled_callback_interaction(
                session_id="execution", source_attempt_id="source", interaction_id="interaction",
            )
    assert raised.value.execution_id == "execution"
    assert raised.value.attempt_id == "source"
    assert raised.value.interaction_id == "interaction"
    assert "private" not in str(raised.value)
    cancel.assert_not_called()
