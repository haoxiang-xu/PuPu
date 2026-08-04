from __future__ import annotations

import copy
import json
import os
from collections import Counter
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

import pytest

import execution_control
import unchain_adapter as adapter
from context_memory_v2_capability import ContextMemoryV2CapabilityVerdict
from durable_interaction_host import (
    DurableInteractionHostError,
    record_interaction_receipt,
)
from recipe import parse_recipe_json
from unchain.context.graph_checkpoint import GraphExecutionPlan, GraphStepBinding
from unchain.input import ASK_USER_QUESTION_TOOL_NAME
from unchain.journal import AttemptRef, EventCursor
from unchain.kernel import ModelTurnResult
from unchain.kernel.types import ToolCall
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from unchain.tools import Toolkit


OWNER_CHAT_ID = "chat-active-graph-interaction-resume"
EXECUTION_ID = "execution-active-graph-interaction-resume"
COORDINATOR_ATTEMPT_ID = "workflow-active-graph-interaction-resume"
RECIPE_NAME = "Active Graph Interaction Resume"


def _recipe_payload() -> dict:
    return {
        "name": RECIPE_NAME,
        "description": "",
        "model": "openai:graph-base",
        "max_iterations": 3,
        "agent": {"prompt_format": "soul", "prompt": ""},
        "toolkits": [],
        "subagent_pool": [],
        "nodes": [
            {"id": "start", "type": "start"},
            {
                "id": "collect",
                "type": "agent",
                "override": {
                    "model": "openai:graph-collect",
                    "prompt": "Ask which framework to use, then collect evidence.",
                },
            },
            {
                "id": "write",
                "type": "agent",
                "override": {
                    "model": "anthropic:graph-write",
                    "prompt": "Write the report from {{#collect.output#}}.",
                },
            },
            {"id": "end", "type": "end"},
        ],
        "edges": [
            {
                "id": "flow-start-collect",
                "kind": "flow",
                "source_node_id": "start",
                "source_port_id": "out",
                "target_node_id": "collect",
                "target_port_id": "in",
            },
            {
                "id": "flow-collect-write",
                "kind": "flow",
                "source_node_id": "collect",
                "source_port_id": "out",
                "target_node_id": "write",
                "target_port_id": "in",
            },
            {
                "id": "flow-write-end",
                "kind": "flow",
                "source_node_id": "write",
                "source_port_id": "out",
                "target_node_id": "end",
                "target_port_id": "in",
            },
        ],
    }


def _ready_capability() -> ContextMemoryV2CapabilityVerdict:
    return ContextMemoryV2CapabilityVerdict(
        ready=True,
        reason="unchain_context_memory_ready",
        verification="exact_sha",
        immutable=True,
        unchain_revision="a" * 40,
    )


def _active_environment(tmp_path: Path) -> dict[str, str]:
    return {
        "UNCHAIN_DATA_DIR": str(tmp_path),
        "PUPU_CONTEXT_V2_STORE_OWNER": "unchain",
        "PUPU_FEATURE_MEMORY_V2": "all",
        "PUPU_MEMORY_V2_MODE": "all",
        "PUPU_MEMORY_V2_CANARY_PERCENT": "100",
    }


def _ask_user_toolkit() -> Toolkit:
    toolkit = Toolkit()
    toolkit.register(
        lambda **_: {"error": "reserved"},
        name=ASK_USER_QUESTION_TOOL_NAME,
        parameters=[],
    )
    return toolkit


def _ask_turn() -> ModelTurnResult:
    arguments = {
        "title": "Choose framework",
        "question": "Which framework should the report use?",
        "selection_mode": "single",
        "options": [
            {"label": "React", "value": "react"},
            {"label": "Vue", "value": "vue"},
        ],
    }
    return ModelTurnResult(
        assistant_messages=[
            {
                "type": "function_call",
                "call_id": "call-choose-framework",
                "name": ASK_USER_QUESTION_TOOL_NAME,
                "arguments": json.dumps(arguments),
            }
        ],
        tool_calls=[
            ToolCall(
                call_id="call-choose-framework",
                name=ASK_USER_QUESTION_TOOL_NAME,
                arguments=arguments,
            )
        ],
        response_id="response-ask-framework",
    )


def _final_turn(text: str, response_id: str) -> ModelTurnResult:
    return ModelTurnResult(
        assistant_messages=[{"role": "assistant", "content": text}],
        tool_calls=[],
        final_text=text,
        response_id=response_id,
    )


def _plan_from_store(tmp_path: Path) -> tuple[SQLiteContextV2Store, GraphExecutionPlan]:
    store = SQLiteContextV2Store(
        database_path=tmp_path / "memory_v2" / "context_v2.sqlite3",
        object_directory=tmp_path / "memory_v2" / "objects",
    )
    snapshot = store.bind_execution(EXECUTION_ID).capture_snapshot()
    [admission] = [
        event
        for event in snapshot.events
        if event.event_type == "graph.execution.admitted"
    ]
    raw = admission.payload["plan"]
    plan = GraphExecutionPlan(
        orchestration_attempt=AttemptRef.from_dict(raw["orchestration_attempt"]),
        topology_sha256=raw["topology_sha256"],
        initial_input_cursor=EventCursor.from_dict(raw["initial_input_cursor"]),
        steps=tuple(GraphStepBinding.from_dict(step) for step in raw["steps"]),
    )
    return store, plan


def _production_patches(
    *,
    tmp_path: Path,
    provider_calls: Counter[tuple[str, str]],
    provider_requests: dict[tuple[str, str], list[object]],
    agent_calls: list[tuple[str, str, str]],
):
    stack = ExitStack()
    real_build_agent = adapter._build_developer_agent

    class OfflineModelIO:
        def __init__(self, provider: str, model: str) -> None:
            self.provider = provider
            self.model = model

        def fetch_turn(self, request):
            key = (self.provider, self.model)
            provider_calls[key] += 1
            provider_requests.setdefault(key, []).append(request)
            if key == ("openai", "graph-collect"):
                if provider_calls[key] == 1:
                    return _ask_turn()
                return _final_turn(
                    "React evidence collected",
                    "response-collect-complete",
                )
            if key == ("anthropic", "graph-write"):
                assert "React evidence collected" in json.dumps(
                    request.messages,
                    ensure_ascii=False,
                    default=str,
                )
                return _final_turn(
                    "Restart-safe React report",
                    "response-write-complete",
                )
            raise AssertionError(f"unexpected provider/model: {key!r}")

    class RecordingAgent:
        def __init__(self, inner) -> None:
            object.__setattr__(self, "_inner", inner)

        def __getattr__(self, name):
            return getattr(self._inner, name)

        def __setattr__(self, name, value) -> None:
            setattr(self._inner, name, value)

        def run(self, **kwargs):
            key = (str(self.provider), str(self.model))
            agent_calls.append(("run", key[0], key[1]))
            call = dict(kwargs)
            if key == ("openai", "graph-collect"):
                # A process boundary, rather than a live blocking callback, owns
                # this interaction.  Returning the durable wait checkpoint is
                # what the resumed graph must consume after a cold rebuild.
                call["on_human_input"] = None
            return self._inner.run(**call)

        def resume_interaction(self, **kwargs):
            agent_calls.append(
                ("resume_interaction", str(self.provider), str(self.model))
            )
            return self._inner.resume_interaction(**kwargs)

    def build_offline_agent(**kwargs):
        provider = str(kwargs["provider"])
        model = str(kwargs["model"])
        kwargs["model_io_factory"] = (
            lambda spec, context, _provider=provider, _model=model: OfflineModelIO(
                _provider,
                _model,
            )
        )
        return RecordingAgent(real_build_agent(**kwargs))

    from memory_v2_unchain_agent_selection import (
        PupuMemoryAgentSelection,
        PupuMemoryAgentSelectionStatus,
    )

    unavailable_memory_agent = PupuMemoryAgentSelection(
        status=PupuMemoryAgentSelectionStatus.PENDING,
        reason="not-needed-for-graph-interaction-resume-test",
    )
    stack.enter_context(
        mock.patch.dict(os.environ, _active_environment(tmp_path), clear=False)
    )
    stack.enter_context(mock.patch("pathlib.Path.home", return_value=tmp_path))
    stack.enter_context(
        mock.patch.object(
            adapter,
            "_build_developer_agent",
            side_effect=build_offline_agent,
        )
    )
    stack.enter_context(
        mock.patch.object(adapter, "parse_custom_provider", return_value=None)
    )
    stack.enter_context(
        mock.patch.object(
            adapter,
            "get_runtime_config",
            return_value={"provider": "openai", "model": "graph-base"},
        )
    )
    stack.enter_context(
        mock.patch.object(adapter, "_resolve_agent_api_key", return_value="")
    )
    stack.enter_context(
        mock.patch.object(
            adapter,
            "get_max_context_window_tokens",
            return_value=16_384,
        )
    )
    stack.enter_context(
        mock.patch.object(adapter, "_resolve_agent_max_iterations", return_value=3)
    )
    stack.enter_context(
        mock.patch.object(
            adapter,
            "_inspect_memory_v2_rollout_intent",
            return_value={"target_mode": "active"},
        )
    )
    stack.enter_context(
        mock.patch.object(adapter, "get_durable_jobs_runtime", return_value=None)
    )
    stack.enter_context(
        mock.patch.object(
            adapter,
            "_build_memory_v2_tool_runtime_config",
            return_value={},
        )
    )
    stack.enter_context(
        mock.patch.object(adapter, "_build_bundle_from_result", return_value=None)
    )
    stack.enter_context(
        mock.patch.object(adapter, "_extract_user_prompt_modules", return_value={})
    )
    stack.enter_context(
        mock.patch.object(
            adapter,
            "_resolve_graph_agent_toolkits",
            return_value=[_ask_user_toolkit()],
        )
    )
    stack.enter_context(
        mock.patch(
            "memory_v2_context.resolve_context_memory_v2_capability",
            return_value=_ready_capability(),
        )
    )
    stack.enter_context(mock.patch("memory_v2_context._load_runtime", return_value=None))
    stack.enter_context(
        mock.patch(
            "memory_v2_context._core_suppression_available",
            return_value=True,
        )
    )
    stack.enter_context(
        mock.patch(
            "memory_v2_unchain_agent_selection.select_pupu_memory_agent_invoker",
            return_value=unavailable_memory_agent,
        )
    )
    return stack


def test_active_graph_cold_resume_continues_exact_step_without_replaying_start(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    from recipe_loader import save_recipe

    recipe = parse_recipe_json(_recipe_payload())
    provider_calls: Counter[tuple[str, str]] = Counter()
    provider_requests: dict[tuple[str, str], list[object]] = {}
    agent_calls: list[tuple[str, str, str]] = []
    options = {
        "modelId": "openai:graph-base",
        "recipe_name": RECIPE_NAME,
        "memory_enabled": True,
        "durable_interactions_required": True,
        "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": OWNER_CHAT_ID,
        "_memory_v2_session_id": EXECUTION_ID,
        "_memory_v2_attempt_id": COORDINATOR_ATTEMPT_ID,
    }

    with _production_patches(
        tmp_path=tmp_path,
        provider_calls=provider_calls,
        provider_requests=provider_requests,
        agent_calls=agent_calls,
    ):
        save_recipe(_recipe_payload())
        initial_events = list(
            adapter.stream_chat_events(
                message="Produce a framework report",
                history=[],
                attachments=[],
                options=options,
                session_id=EXECUTION_ID,
                attempt_id=COORDINATOR_ATTEMPT_ID,
            )
        )
        assert not any(
            event.get("type") == "final_message" for event in initial_events
        )
        assert provider_calls == Counter({("openai", "graph-collect"): 1})
        suspended_control = execution_control.snapshot(
            EXECUTION_ID,
            COORDINATOR_ATTEMPT_ID,
        )
        assert suspended_control is not None
        assert suspended_control.status == "running"

        pending = adapter.get_pending_interaction(EXECUTION_ID)
        assert pending["status"] == "awaiting_response"
        assert pending["resume_kind"] == "graph_step"
        assert pending["resume_available"] is True
        assert pending["graph_coordinator_attempt_id"] == COORDINATOR_ATTEMPT_ID
        interaction_id = str(pending["interaction_id"])
        step_attempt_id = str(pending["source_run_id"])

        receipt = record_interaction_receipt(
            session_id=EXECUTION_ID,
            interaction_id=interaction_id,
            approved=True,
            modified_arguments={
                "user_response": {"selected_values": ["react"]}
            },
            submitted_by="ui:test",
        )
        assert receipt["disposition"] == "receipt_recorded"
        answered = adapter.get_pending_interaction(EXECUTION_ID)
        assert answered["status"] == "receipt_recorded"
        assert answered["resume_kind"] == "graph_step"
        assert answered["source_run_id"] == step_attempt_id

        graph_record = adapter.load_graph_step_resume_context(
            EXECUTION_ID,
            step_attempt_id,
            expected_owner_chat_id=OWNER_CHAT_ID,
            expected_provider="openai",
            expected_model="graph-collect",
        )
        assert graph_record is not None

        # Drift checks use the exact cold-resume entry point and must reject
        # before constructing a provider-backed step.
        calls_before_drift = provider_calls.copy()
        agents_before_drift = list(agent_calls)
        drift_cases = {
            "provider": (
                {"provider": "anthropic"},
                "graph resume metadata changed its canonical execution plan",
            ),
            "topology": (
                {"topology_sha256": "f" * 64},
                "graph resume metadata changed its canonical execution plan",
            ),
            "recipe": (
                {
                    "recipe_identity": {
                        **copy.deepcopy(graph_record["recipe_identity"]),
                        "name": "Different Recipe",
                    }
                },
                "graph resume recipe identity changed",
            ),
        }
        for label, (update, expected_error) in drift_cases.items():
            drifted = copy.deepcopy(graph_record)
            drifted.update(update)
            drifted["_interaction_id"] = interaction_id
            drifted["_interaction_response"] = copy.deepcopy(
                answered["resolution"]["response"]
            )
            drifted["_interaction_submitted_by"] = "ui:test"
            drift_options = dict(options)
            drift_options["_memory_v2_graph_resume_context"] = drifted
            with pytest.raises(
                (RuntimeError, DurableInteractionHostError),
                match=expected_error,
            ):
                list(
                    adapter._stream_recipe_graph_events(
                        recipe=recipe,
                        message="",
                        history=[],
                        attachments=[],
                        options=drift_options,
                        session_id=EXECUTION_ID,
                    )
                )
            assert provider_calls == calls_before_drift, label
            assert agent_calls == agents_before_drift, label

        # All runtime objects above are now abandoned.  The public resume path
        # has to rebuild from SQLite/CAS, the recipe file, and the durable
        # interaction receipt only.
        resumed_events = list(
            adapter.resume_chat_interaction_events(
                session_id=EXECUTION_ID,
                interaction_id=interaction_id,
                options={
                    "modelId": "openai:graph-base",
                    "recipe_name": RECIPE_NAME,
                    "_memory_v2_requested": True,
                    "_memory_v2_owner_chat_id": OWNER_CHAT_ID,
                },
                attempt_id="transport-resume-attempt",
                source_attempt_id=step_attempt_id,
            )
        )

        assert provider_calls == Counter(
            {
                ("openai", "graph-collect"): 2,
                ("anthropic", "graph-write"): 1,
            }
        )
        assert agent_calls == [
            ("run", "openai", "graph-collect"),
            ("resume_interaction", "openai", "graph-collect"),
            ("run", "anthropic", "graph-write"),
        ]
        assert any(
            event.get("type") == "final_message"
            and event.get("content") == "Restart-safe React report"
            for event in resumed_events
        )

        store, plan = _plan_from_store(tmp_path)
        snapshot = store.bind_execution(EXECUTION_ID).capture_snapshot()
        event_types = [event.event_type for event in snapshot.events]
        assert event_types.count("graph.step.started") == 2
        assert event_types.count("handoff.recorded") == 2
        assert event_types.count("graph.step.resume.admitted") == 1
        assert event_types.count("graph.step.completed") == 2
        assert event_types.count("graph.execution.completed") == 1
        assert plan.steps[0].attempt.attempt_id == step_attempt_id

        calls_after_completion = provider_calls.copy()
        agents_after_completion = list(agent_calls)
        with pytest.raises(DurableInteractionHostError) as repeated:
            list(
                adapter.resume_chat_interaction_events(
                    session_id=EXECUTION_ID,
                    interaction_id=interaction_id,
                    options={
                        "modelId": "openai:graph-base",
                        "recipe_name": RECIPE_NAME,
                        "_memory_v2_requested": True,
                        "_memory_v2_owner_chat_id": OWNER_CHAT_ID,
                    },
                    attempt_id="transport-repeat-attempt",
                    source_attempt_id=step_attempt_id,
                )
            )
        assert repeated.value.code == "interaction_not_found"
        assert provider_calls == calls_after_completion
        assert agent_calls == agents_after_completion
