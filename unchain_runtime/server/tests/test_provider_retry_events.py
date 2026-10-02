"""#386 BC-386-4 / SEQ-386-3: retry waits reach the stream and Stop ends them.

Drives the real sidecar graph runner (Memory V2 active, real Unchain kernel,
durable provider-turn runtime and retry hook) with a transport whose first
try for the first node fails retry-safe. Run with UNCHAIN_SOURCE_PATH pointing
at the Unchain checkout or wheel under test.
"""
from __future__ import annotations

import os
import threading
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
from unchain.kernel import ModelTurnResult
from unchain.providers.durable_turn_runtime import (
    ExactProviderRouteFailure,
    ExactProviderRouteFailureKind,
    ExactProviderRouteTransport,
)

# Keys the sidecar's graph step callback adds to every step event.
SIDECAR_STEP_KEYS = {"workflow_node_id", "workflow_step_index", "workflow_step_count"}
RETRY_KEYS = {
    "type", "run_id", "iteration", "provider", "attempt_failed", "next_attempt",
    "max_attempts", "delay_ms", "remaining_ms", "http_status", "provider_status",
}


def _run(tmp_path, monkeypatch, *, stop_on_first_retry: bool, first_error=None):
    from google.genai import errors

    sends: list[tuple[str, int]] = []
    stop = threading.Event()

    class OfflineModelIO:
        def __init__(self, provider, model):
            self.provider, self.model = provider, model

        def fetch_turn(self, request):
            return ModelTurnResult(
                assistant_messages=[{"role": "assistant", "content": f"answer from {self.model}"}],
                tool_calls=[],
                final_text=f"answer from {self.model}",
                response_id=f"offline-{self.model}",
            )

        def _merged_payload(self, payload):
            return dict(payload or {})

        def _model_capability(self, _name, default=None):
            return default

        def _provider_request_model(self):
            return self.model

    class FlakyTransport(ExactProviderRouteTransport):
        def __init__(self, model_io, request):
            self.model_io, self.request = model_io, request

        def send(self, *, envelope, route, retry_ordinal):
            sends.append((self.model_io.model, retry_ordinal))
            if self.model_io.model == "graph-collect" and retry_ordinal == 0 and first_error is not None:
                raise first_error
            if self.model_io.model == "graph-collect" and retry_ordinal == 0:
                raise ExactProviderRouteFailure(
                    ExactProviderRouteFailureKind.TRANSIENT_RETRY_SAFE,
                    errors.ServerError(
                        503,
                        {"error": {"code": 503, "message": "PRIVATE overloaded", "status": "UNAVAILABLE"}},
                    ),
                )
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

    real_raise_if_cancelled = adapter._execution_raise_if_cancelled

    def raise_if_stopped(token):
        # Only the token source is substituted: the step callback still calls
        # this for every event, exactly as in production.
        if stop.is_set():
            error = RuntimeError("execution attempt was cancelled")
            error.code = "execution_cancelled"
            raise error
        return real_raise_if_cancelled(token)

    execution_id, workflow_run_id = "execution-retry-events", "workflow-retry-events"
    options = {
        "modelId": "openai:graph-base",
        "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": "chat-retry-events",
        "_memory_v2_session_id": execution_id,
        "_memory_v2_attempt_id": workflow_run_id,
    }
    memory_runtime = {
        "kind": "v2_durability", "requested": True, "required": True, "available": True,
        "durability_available": True, "legacy_context_available": False, "reason": "",
    }
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    events: list[dict] = []
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
            mock.patch.object(adapter, "_execution_raise_if_cancelled", side_effect=raise_if_stopped),
            mock.patch(
                "unchain.context.provider_execution._exact_transport",
                side_effect=lambda *, model_io, request, **_k: FlakyTransport(model_io, request),
            ),
            # 1.2 s wait: one start event and two heartbeats (200 ms left, then 0).
            mock.patch("unchain.providers.durable_turn_runtime.compute_delay_ms", return_value=1200),
            mock.patch("memory_v2_context.resolve_context_memory_v2_capability", return_value=_ready_capability()),
            mock.patch("memory_v2_context._load_runtime", return_value=None),
            mock.patch("memory_v2_context._core_suppression_available", return_value=True),
            mock.patch(
                "memory_v2_unchain_agent_selection.select_pupu_memory_agent_invoker",
                return_value=PupuMemoryAgentSelection(
                    status=PupuMemoryAgentSelectionStatus.PENDING, reason="retry-events-test"
                ),
            ),
        ):
            stack.enter_context(patch)
        try:
            for event in adapter._stream_recipe_graph_events(
                recipe=_two_provider_recipe(),
                message="retry events",
                history=[],
                attachments=[],
                options=options,
                session_id=execution_id,
                run_id_override=workflow_run_id,
                runtime_context=_root_runtime_context(
                    execution_id=execution_id, run_id=workflow_run_id
                ),
            ):
                events.append(event)
                if stop_on_first_retry and event.get("type") == "provider_retry":
                    stop.set()
        except BaseException as exc:  # noqa: BLE001 - the test inspects it
            raised.append(exc)
    return events, sends, raised


def test_retry_wait_streams_a_start_event_and_heartbeats(tmp_path, monkeypatch):
    events, sends, raised = _run(tmp_path, monkeypatch, stop_on_first_retry=False)

    assert raised == []
    assert sends == [("graph-collect", 0), ("graph-collect", 1), ("graph-write", 0)]
    retries = [event for event in events if event.get("type") == "provider_retry"]
    assert [event["remaining_ms"] for event in retries] == [1200, 200, 0]
    for event in retries:
        assert set(event) - SIDECAR_STEP_KEYS == RETRY_KEYS
        assert event["run_id"].startswith("graph-step-")
        assert (event["attempt_failed"], event["next_attempt"], event["max_attempts"]) == (1, 2, 11)
        assert (event["http_status"], event["provider_status"]) == (503, "UNAVAILABLE")
        assert event["delay_ms"] == 1200
    assert "PRIVATE" not in repr(retries)
    assert any(
        event.get("type") == "final_message" and event.get("content") == "answer from graph-write"
        for event in events
    )


def test_stop_during_the_wait_sends_nothing_more(tmp_path, monkeypatch):
    events, sends, raised = _run(tmp_path, monkeypatch, stop_on_first_retry=True)

    # The wait was interrupted: the next try was never sent and the second
    # node never ran. The sidecar ends a cancelled turn quietly, without an
    # error event, the same way as a Stop at any other point.
    assert sends == [("graph-collect", 0)]
    assert raised == []
    assert not [event for event in events if event.get("type") in {"final_message", "error"}]
    retries = [event for event in events if event.get("type") == "provider_retry"]
    assert [event["remaining_ms"] for event in retries] == [1200]


def test_an_unexpected_provider_error_reaches_the_stream_with_its_class_only(tmp_path, monkeypatch):
    """#386 bare uncertain: the turn fails with fixed wording and the class name."""

    events, sends, raised = _run(
        tmp_path,
        monkeypatch,
        stop_on_first_retry=False,
        first_error=ValueError("PRIVATE stream parse detail"),
    )

    assert sends == [("graph-collect", 0)]
    surfaced = [
        repr(event) for event in events if event.get("type") in {"error", "run_failed"}
    ] + [repr(exc) for exc in raised]
    assert any(
        "Provider call failed with an unexpected error; the provider may still have "
        "processed it (ValueError)" in text
        for text in surfaced
    ), surfaced
    assert not any("PRIVATE" in text for text in surfaced)

