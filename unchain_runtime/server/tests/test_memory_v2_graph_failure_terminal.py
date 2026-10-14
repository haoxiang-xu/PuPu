"""#389: a failed graph step leaves one canonical terminal in the Memory V2 journal.

Drives the real sidecar graph runner (Memory V2 active, real Unchain kernel and
journal) with an offline provider whose second node raises, then checks what the
journal and the V4 stream received. Run with UNCHAIN_SOURCE_PATH pointing at the
Unchain checkout or wheel under test.
"""
from __future__ import annotations

import os
from contextlib import ExitStack
from unittest import mock

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
from unchain.journal.graph_attempt_quiescence import (
    CANONICAL_ATTEMPT_TERMINALS,
    select_attempt_terminal,
)
from unchain.kernel import ModelTurnResult
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from unchain.providers.durable_turn_runtime import ExactProviderRouteTransport

PRIVATE = "PRIVATE-PROVIDER-TEXT-389"


def _run_with_failing_second_node(tmp_path, monkeypatch, error):
    workflow_run_id = "workflow-failure-terminal"
    execution_id = "execution-failure-terminal"
    owner_chat_id = "chat-failure-terminal"
    recipe = _two_provider_recipe()

    class OfflineModelIO:
        def __init__(self, provider, model):
            self.provider, self.model = provider, model

        def fetch_turn(self, request):
            if (self.provider, self.model) == ("anthropic", "graph-write"):
                raise error
            return ModelTurnResult(
                assistant_messages=[{"role": "assistant", "content": "collected"}],
                tool_calls=[],
                final_text="collected",
                response_id="offline-collect",
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
        return real_build_agent(**kwargs)

    options = {
        "modelId": "openai:graph-base",
        "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": owner_chat_id,
        "_memory_v2_session_id": execution_id,
        "_memory_v2_attempt_id": workflow_run_id,
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
        for patch in (
            mock.patch.object(adapter, "_build_developer_agent", side_effect=build_offline_agent),
            mock.patch.object(adapter, "parse_custom_provider", return_value=None),
            mock.patch.object(adapter, "get_runtime_config", return_value={"provider": "openai", "model": "graph-base"}),
            mock.patch.object(adapter, "_resolve_agent_api_key", return_value=""),
            mock.patch.object(adapter, "get_max_context_window_tokens", return_value=16_384),
            mock.patch.object(adapter, "_resolve_agent_max_iterations", return_value=1),
            mock.patch.object(adapter, "_inspect_memory_v2_rollout_intent", return_value={"target_mode": "active"}),
            mock.patch.object(adapter, "get_pending_interaction", return_value={"status": "none", "session_id": execution_id}),
            mock.patch.object(adapter, "_resolve_memory_runtime", return_value=(memory_runtime, None)),
            mock.patch.object(adapter, "get_durable_jobs_runtime", return_value=None),
            mock.patch.object(adapter, "_build_memory_v2_tool_runtime_config", return_value={}),
            mock.patch.object(adapter, "_build_bundle_from_result", return_value=None),
            mock.patch.object(adapter, "_extract_user_prompt_modules", return_value={}),
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
                    status=PupuMemoryAgentSelectionStatus.PENDING, reason="failure-terminal-test"
                ),
            ),
        ):
            stack.enter_context(patch)
        try:
            for event in adapter._stream_recipe_graph_events(
                recipe=recipe,
                message="failure terminal",
                history=[],
                attachments=[],
                options=options,
                session_id=execution_id,
                run_id_override=workflow_run_id,
                runtime_context=_root_runtime_context(
                    execution_id=execution_id, run_id=workflow_run_id
                ),
            ):
                raw_events.append(event)
        except BaseException as exc:  # noqa: BLE001 - the test inspects it
            raised.append(exc)

    store = SQLiteContextV2Store(
        database_path=tmp_path / "memory_v2" / "context_v2.sqlite3",
        object_directory=tmp_path / "memory_v2" / "objects",
    )
    snapshot = store.bind_execution(execution_id).capture_snapshot()
    by_attempt: dict[str, list] = {}
    for event in snapshot.events:
        by_attempt.setdefault(event.attempt.attempt_id, []).append(event)
    return {
        "raw_events": raw_events,
        "raised": raised,
        "by_attempt": by_attempt,
        "workflow_run_id": workflow_run_id,
        "execution_id": execution_id,
        "database": tmp_path / "memory_v2" / "context_v2.sqlite3",
    }


def _terminals(events):
    return [e.event_type for e in events if e.event_type in CANONICAL_ATTEMPT_TERMINALS]


def test_failed_step_attempt_gets_exactly_one_canonical_terminal(tmp_path, monkeypatch):
    result = _run_with_failing_second_node(
        tmp_path, monkeypatch, TimeoutError(PRIVATE)
    )
    assert len(result["raised"]) == 1

    step_attempts = {
        attempt_id: events
        for attempt_id, events in result["by_attempt"].items()
        if attempt_id.startswith("graph-step-")
    }
    assert len(step_attempts) == 2
    completed = [e for e in step_attempts.values() if "graph.step.completed" in {x.event_type for x in e}]
    failed = [e for e in step_attempts.values() if "graph.step.completed" not in {x.event_type for x in e}]
    assert len(completed) == 1 and len(failed) == 1
    assert _terminals(completed[0]) == ["run_completed"]
    assert _terminals(failed[0]) == ["run_failed"]
    # The step's own terminal is followed by its seal (written when the run
    # ended, #389 P1), and nothing else; the selector accepts exactly that.
    assert [e.event_type for e in failed[0][-2:]] == ["run_failed", "graph.step.failed"]
    assert select_attempt_terminal(failed[0]).event is None
    assert (
        select_attempt_terminal(
            failed[0], allowed_following_event_types=frozenset({"graph.step.failed"})
        ).event.event_type
        == "run_failed"
    )


def test_provider_text_never_reaches_the_events_or_the_database(tmp_path, monkeypatch):
    result = _run_with_failing_second_node(
        tmp_path, monkeypatch, TimeoutError(PRIVATE)
    )
    assert PRIVATE not in repr(result["raw_events"])
    assert PRIVATE.encode() not in result["database"].read_bytes()


def test_v4_carries_the_step_failure_and_exactly_one_root_failure(tmp_path, monkeypatch):
    result = _run_with_failing_second_node(
        tmp_path, monkeypatch, TimeoutError(PRIVATE)
    )
    # The exact route_chat V4 sequence: normalize every raw event, then the
    # transport failure for the exception that ended the stream.
    bridge = RuntimeEventBridge(
        session_id=result["execution_id"],
        root_run_id=result["workflow_run_id"],
        root_agent_id="developer",
        trace_level="minimal",
    )
    v4 = []
    for event in result["raw_events"]:
        if event.get("type") != "stream_summary":
            v4.extend(item.to_dict() for item in bridge.normalize(event))
    v4.append(bridge.emit_transport_failure("normalized", code="stream_failed").to_dict())

    failed = [e for e in v4 if e["type"] == "run.failed"]
    root = [e for e in failed if e["run_id"] == result["workflow_run_id"]]
    steps = [e for e in failed if e["run_id"] != result["workflow_run_id"]]
    assert len(root) == 1
    assert len(steps) == 1
    assert steps[0]["payload"]["error"]["message"] == "Run failed"
    assert steps[0]["run_id"].startswith("graph-step-")
