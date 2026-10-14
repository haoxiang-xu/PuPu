"""#389 P1: every end of a graph run leaves one canonical terminal per attempt.

Drives the real sidecar graph runner (Memory V2 active, real Unchain kernel and
journal) with an offline provider and arms a failure or a Stop at each point the
runner can stop, then reads what the journal holds and whether the chat can be
edited and resent through the real generation API. Run with UNCHAIN_SOURCE_PATH
pointing at the Unchain checkout or wheel under test.

The shapes (S1-S4 from docs/implementation/ticket-389.md; root = orchestration
attempt): a step that failed or was stopped is sealed failed/cancelled, a step
that already completed is sealed completed and never cancelled, and the root
always ends with one `run_failed` / `run_cancelled`, except when it already has
a terminal or when ownership was lost (nothing is written then).
"""
from __future__ import annotations

import os
import threading
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

import pytest

import unchain_adapter as adapter
from memory_v2_unchain_agent_selection import (
    PupuMemoryAgentSelection,
    PupuMemoryAgentSelectionStatus,
)
from test_memory_v2_unchain_active_graph_restart import (
    _active_environment,
    _ready_capability,
    _root_runtime_context,
    _two_provider_recipe,
)
from unchain.events import RuntimeEventBridge
from unchain.execution import ExecutionLeaseNotOwnedError
from unchain.journal.graph_attempt_quiescence import CANONICAL_ATTEMPT_TERMINALS
from unchain.kernel import ModelTurnResult
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from unchain.providers.durable_turn_runtime import ExactProviderRouteTransport

PRIVATE = "PRIVATE-PROVIDER-TEXT-389-P1"
WORKFLOW_RUN_ID = "workflow-settle"
EXECUTION_ID = "execution-settle"
OWNER_CHAT_ID = "chat-settle"
SEALS = ("graph.step.completed", "graph.step.failed", "graph.step.cancelled")


def _run_graph(
    tmp_path,
    monkeypatch,
    *,
    first_error=None,
    second_error=None,
    stop_at=None,
    post_finalize=None,
    lease_loss=False,
    settle_error=None,
):
    stop = threading.Event()

    class OfflineModelIO:
        def __init__(self, provider, model):
            self.provider, self.model = provider, model

        def fetch_turn(self, request):
            if self.model == "graph-collect":
                if first_error is not None:
                    raise first_error
                if stop_at == "during_first_model_call":
                    stop.set()
            elif second_error is not None:
                raise second_error
            return ModelTurnResult(
                assistant_messages=[{"role": "assistant", "content": f"answer {self.model}"}],
                tool_calls=[],
                final_text=f"answer {self.model}",
                response_id=f"offline-{self.model}",
            )

        def _merged_payload(self, payload):
            return dict(payload or {})

        def _model_capability(self, _name, default=None):
            return default

        def _provider_request_model(self):
            return self.model

    class OfflineExactTransport(ExactProviderRouteTransport):
        def __init__(self, model_io, request):
            self.model_io, self.request = model_io, request

        def send(self, *, envelope, route, retry_ordinal):
            return self.model_io.fetch_turn(self.request)

        def release_buffered_events(self):
            return None

        def discard_buffered_events(self):
            return None

    real_build_agent = adapter._build_developer_agent

    def build_offline_agent(**kwargs):
        provider, model = str(kwargs["provider"]), str(kwargs["model"])
        kwargs["model_io_factory"] = (
            lambda spec, context, _p=provider, _m=model: OfflineModelIO(_p, _m)
        )
        agent = real_build_agent(**kwargs)
        if stop_at == "after_first_run" and model == "graph-collect":
            real_run = agent.run

            def run_then_stop(*args, **kw):
                result = real_run(*args, **kw)
                stop.set()  # between the step's run_completed and complete_step
                return result

            agent.run = run_then_stop
        return agent

    real_raise_if_cancelled = adapter._execution_raise_if_cancelled

    def raise_if_stopped(token):
        if stop.is_set():
            error = RuntimeError("execution attempt was cancelled")
            error.code = "execution_cancelled"
            raise error
        return real_raise_if_cancelled(token)

    import memory_v2_unchain_graph_checkpoint as host_module
    import memory_v2_unchain_graph_root_completion as completion_module

    real_prepare = host_module.prepare_pupu_unchain_graph_checkpoint_host

    def prepare_then_stop(**kwargs):
        host = real_prepare(**kwargs)
        if stop_at == "before_first_step":
            stop.set()
        return host

    real_complete_step = host_module.PupuUnchainGraphCheckpointHost.complete_step

    def complete_step(self, index, *, full_output):
        if lease_loss and index == 0:
            raise ExecutionLeaseNotOwnedError("lost", execution_id=EXECUTION_ID)
        receipt = real_complete_step(self, index, full_output=full_output)
        if (stop_at == "between_steps" and index == 0) or (
            stop_at == "after_last_step" and index == 1
        ):
            stop.set()
        return receipt

    real_complete_root = completion_module.complete_pupu_unchain_graph_root

    def complete_root(graph_host, **kwargs):
        if post_finalize == "after_finalize":
            graph_host.finalize()
            raise RuntimeError(f"post-finalize failure {PRIVATE}")
        if post_finalize == "after_root_terminal":
            real_complete_root(graph_host, **kwargs)
            raise RuntimeError(f"failure after the root terminal {PRIVATE}")
        return real_complete_root(graph_host, **kwargs)

    options = {
        "modelId": "openai:graph-base",
        "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": OWNER_CHAT_ID,
        "_memory_v2_session_id": EXECUTION_ID,
        "_memory_v2_attempt_id": WORKFLOW_RUN_ID,
    }
    memory_runtime = {
        "kind": "v2_durability", "requested": True, "required": True,
        "available": True, "durability_available": True,
        "legacy_context_available": False, "reason": "",
    }
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")

    raw_events: list[dict] = []
    raised: list[BaseException] = []
    with mock.patch.dict(os.environ, _active_environment(tmp_path), clear=False), ExitStack() as stack:
        patches = [
            mock.patch.object(adapter, "_build_developer_agent", side_effect=build_offline_agent),
            mock.patch.object(adapter, "parse_custom_provider", return_value=None),
            mock.patch.object(adapter, "get_runtime_config", return_value={"provider": "openai", "model": "graph-base"}),
            mock.patch.object(adapter, "_resolve_agent_api_key", return_value=""),
            mock.patch.object(adapter, "get_max_context_window_tokens", return_value=16_384),
            mock.patch.object(adapter, "_resolve_agent_max_iterations", return_value=1),
            mock.patch.object(adapter, "_inspect_memory_v2_rollout_intent", return_value={"target_mode": "active"}),
            mock.patch.object(adapter, "get_pending_interaction", return_value={"status": "none", "session_id": EXECUTION_ID}),
            mock.patch.object(adapter, "_resolve_memory_runtime", return_value=(memory_runtime, None)),
            mock.patch.object(adapter, "get_durable_jobs_runtime", return_value=None),
            mock.patch.object(adapter, "_build_memory_v2_tool_runtime_config", return_value={}),
            mock.patch.object(adapter, "_build_bundle_from_result", return_value=None),
            mock.patch.object(adapter, "_extract_user_prompt_modules", return_value={}),
            # The same flag drives the token check and the SSE event gate, as a
            # real cancellation does.
            mock.patch.object(adapter, "_execution_raise_if_cancelled", side_effect=raise_if_stopped),
            mock.patch.object(adapter, "_execution_is_cancelled", side_effect=lambda _token: stop.is_set()),
            mock.patch.object(host_module, "prepare_pupu_unchain_graph_checkpoint_host", side_effect=prepare_then_stop),
            mock.patch.object(host_module.PupuUnchainGraphCheckpointHost, "complete_step", complete_step),
            mock.patch.object(completion_module, "complete_pupu_unchain_graph_root", side_effect=complete_root),
            mock.patch(
                "unchain.context.provider_execution._exact_transport",
                side_effect=lambda *, model_io, request, **_k: OfflineExactTransport(model_io, request),
            ),
            mock.patch("memory_v2_context.resolve_context_memory_v2_capability", return_value=_ready_capability()),
            mock.patch("memory_v2_context._load_runtime", return_value=None),
            mock.patch("memory_v2_context._core_suppression_available", return_value=True),
            mock.patch(
                "memory_v2_unchain_agent_selection.select_pupu_memory_agent_invoker",
                return_value=PupuMemoryAgentSelection(
                    status=PupuMemoryAgentSelectionStatus.PENDING, reason="graph-settle-test"
                ),
            ),
        ]
        if settle_error is not None:
            import memory_v2_unchain_graph_failure as failure_module

            patches.append(
                mock.patch.object(
                    failure_module,
                    "settle_pupu_unchain_graph_failure",
                    side_effect=settle_error,
                )
            )
        for patch in patches:
            stack.enter_context(patch)
        try:
            for event in adapter._stream_recipe_graph_events(
                recipe=_two_provider_recipe(),
                message="graph settle",
                history=[],
                attachments=[],
                options=options,
                session_id=EXECUTION_ID,
                run_id_override=WORKFLOW_RUN_ID,
                runtime_context=_root_runtime_context(
                    execution_id=EXECUTION_ID, run_id=WORKFLOW_RUN_ID
                ),
            ):
                raw_events.append(event)
        except BaseException as exc:  # noqa: BLE001 - the test inspects it
            raised.append(exc)
    return {"raw_events": raw_events, "raised": raised, "root_dir": tmp_path / "memory_v2"}


def _journal(result):
    store = SQLiteContextV2Store(
        database_path=result["root_dir"] / "context_v2.sqlite3",
        object_directory=result["root_dir"] / "objects",
    )
    events = list(store.bind_execution(EXECUTION_ID).capture_snapshot().events)
    by_attempt: dict[str, list] = {}
    for event in events:
        by_attempt.setdefault(event.attempt.attempt_id, []).append(event)
    root_id = next(e.attempt.attempt_id for e in events if e.event_type == "graph.execution.admitted")
    steps = sorted(
        (a for a in by_attempt if a.startswith("graph-step-")),
        key=lambda a: by_attempt[a][0].store_seq,
    )
    return by_attempt, root_id, steps


def _terminals(events):
    return [e.event_type for e in events if e.event_type in CANONICAL_ATTEMPT_TERMINALS]


def _seals(events):
    return [e.event_type for e in events if e.event_type in SEALS]


def _shape(result):
    by_attempt, root_id, steps = _journal(result)
    root = by_attempt[root_id]
    return {
        "root_terminals": _terminals(root),
        "root_types": [e.event_type for e in root],
        "steps": [(_terminals(by_attempt[s]), _seals(by_attempt[s])) for s in steps],
    }


def _assert_root_closed(shape, terminal):
    assert shape["root_terminals"] == [terminal]
    types = shape["root_types"]
    assert types[-1] == terminal
    assert types[-2] == "graph.execution.admitted"


def _resend_after(result):
    """The edit/resend the user would do next, through the real generation API."""

    from memory_v2_unchain_generation_api import open_pupu_unchain_generation_api

    api = open_pupu_unchain_generation_api(
        root_dir=result["root_dir"], owner_chat_id=OWNER_CHAT_ID
    )
    head = api.get_session_head(owner_chat_id=OWNER_CHAT_ID, session_id=EXECUTION_ID)
    return api.rebase_session(
        owner_chat_id=OWNER_CHAT_ID,
        session_id=EXECUTION_ID,
        replacement_history=(
            {"role": "user", "content": "edited prompt"},
            {"role": "assistant", "content": "edited answer"},
        ),
        source_generation_id=head["current_generation_id"],
        expected_session_revision=head["session_revision"],
        operation_id="operation-resend-after-settle",
        reason="edit",
    )


def test_a_failed_first_step_is_sealed_and_the_root_fails(tmp_path, monkeypatch):
    result = _run_graph(tmp_path, monkeypatch, first_error=TimeoutError(PRIVATE))

    shape = _shape(result)
    assert shape["steps"] == [(["run_failed"], ["graph.step.failed"])]
    _assert_root_closed(shape, "run_failed")
    assert "graph.execution.completed" not in shape["root_types"]
    assert _resend_after(result)


def test_a_failed_second_step_keeps_the_first_sealed_completed(tmp_path, monkeypatch):
    result = _run_graph(tmp_path, monkeypatch, second_error=TimeoutError(PRIVATE))

    shape = _shape(result)
    assert shape["steps"] == [
        (["run_completed"], ["graph.step.completed"]),
        (["run_failed"], ["graph.step.failed"]),
    ]
    _assert_root_closed(shape, "run_failed")
    assert _resend_after(result)


def test_stop_during_a_model_call_cancels_the_step_and_the_root(tmp_path, monkeypatch):
    result = _run_graph(tmp_path, monkeypatch, stop_at="during_first_model_call")

    shape = _shape(result)
    assert shape["steps"] == [(["run_cancelled"], ["graph.step.cancelled"])]
    _assert_root_closed(shape, "run_cancelled")
    assert _resend_after(result)


def test_stop_before_the_first_step_writes_only_the_root_terminal(tmp_path, monkeypatch):
    result = _run_graph(tmp_path, monkeypatch, stop_at="before_first_step")

    shape = _shape(result)
    assert shape["steps"] == []
    _assert_root_closed(shape, "run_cancelled")
    assert _resend_after(result)


def test_stop_between_a_steps_run_and_its_seal_seals_it_completed(tmp_path, monkeypatch):
    """The step ran to run_completed; Stop must not turn that into a cancelled step."""

    result = _run_graph(tmp_path, monkeypatch, stop_at="after_first_run")

    shape = _shape(result)
    assert shape["steps"] == [(["run_completed"], ["graph.step.completed"])]
    _assert_root_closed(shape, "run_cancelled")
    assert _resend_after(result)


def test_stop_between_two_steps_writes_only_the_root_terminal(tmp_path, monkeypatch):
    result = _run_graph(tmp_path, monkeypatch, stop_at="between_steps")

    shape = _shape(result)
    assert shape["steps"] == [(["run_completed"], ["graph.step.completed"])]
    _assert_root_closed(shape, "run_cancelled")
    assert _resend_after(result)


def test_stop_after_the_last_step_leaves_no_execution_seal(tmp_path, monkeypatch):
    result = _run_graph(tmp_path, monkeypatch, stop_at="after_last_step")

    shape = _shape(result)
    assert shape["steps"] == [
        (["run_completed"], ["graph.step.completed"]),
        (["run_completed"], ["graph.step.completed"]),
    ]
    _assert_root_closed(shape, "run_cancelled")
    assert "graph.execution.completed" not in shape["root_types"]
    assert _resend_after(result)


def test_a_failure_after_the_graph_completed_fails_the_root_only(tmp_path, monkeypatch):
    result = _run_graph(tmp_path, monkeypatch, post_finalize="after_finalize")

    shape = _shape(result)
    assert shape["steps"] == [
        (["run_completed"], ["graph.step.completed"]),
        (["run_completed"], ["graph.step.completed"]),
    ]
    assert shape["root_terminals"] == ["run_failed"]
    assert shape["root_types"][-2:] == ["graph.execution.completed", "run_failed"]
    assert _resend_after(result)


def test_a_root_that_already_has_its_terminal_gets_no_second_one(tmp_path, monkeypatch):
    result = _run_graph(tmp_path, monkeypatch, post_finalize="after_root_terminal")

    shape = _shape(result)
    assert shape["root_terminals"] == ["run_completed"]
    assert _resend_after(result)


def test_lost_ownership_writes_nothing(tmp_path, monkeypatch):
    """Another owner may be running this attempt: no seal and no terminal."""

    result = _run_graph(tmp_path, monkeypatch, lease_loss=True)

    shape = _shape(result)
    assert shape["root_terminals"] == []
    assert shape["steps"] == [(["run_completed"], [])]


def test_a_failing_settle_never_hides_the_original_error(tmp_path, monkeypatch):
    result = _run_graph(
        tmp_path,
        monkeypatch,
        first_error=TimeoutError(PRIVATE),
        settle_error=RuntimeError("settle exploded"),
    )

    assert len(result["raised"]) == 1
    assert "settle exploded" not in repr(result["raised"][0])


@pytest.mark.parametrize(
    "kwargs",
    [
        {"first_error": TimeoutError(PRIVATE)},
        {"second_error": TimeoutError(PRIVATE)},
        {"stop_at": "during_first_model_call"},
        {"stop_at": "after_last_step"},
        {"post_finalize": "after_finalize"},
    ],
)
def test_the_root_terminal_stays_in_the_journal_only(tmp_path, monkeypatch, kwargs):
    """No raw event for the root terminal reaches the stream, so V4 shows at
    most one root failure (the transport failure route_chat adds) and the
    provider text never appears."""

    result = _run_graph(tmp_path, monkeypatch, **kwargs)

    root_events = [
        e for e in result["raw_events"]
        if e.get("run_id") == WORKFLOW_RUN_ID
        and e.get("type") in {"run_failed", "run_cancelled", "run_completed"}
    ]
    assert root_events == []
    assert PRIVATE not in repr(result["raw_events"])
    assert PRIVATE.encode() not in (result["root_dir"] / "context_v2.sqlite3").read_bytes()

    bridge = RuntimeEventBridge(
        session_id=EXECUTION_ID,
        root_run_id=WORKFLOW_RUN_ID,
        root_agent_id="developer",
        trace_level="minimal",
    )
    v4 = []
    for event in result["raw_events"]:
        if event.get("type") != "stream_summary":
            v4.extend(item.to_dict() for item in bridge.normalize(event))
    root_failures = [
        e for e in v4 if e["type"] == "run.failed" and e["run_id"] == WORKFLOW_RUN_ID
    ]
    assert root_failures == []
