from __future__ import annotations

import json
import os
from collections import Counter
from contextlib import ExitStack

from unittest import mock

import unchain_adapter as adapter
from context_memory_v2_capability import ContextMemoryV2CapabilityVerdict
from recipe import parse_recipe_json
from unchain.context.artifacts import ArtifactService
from unchain.context.graph_checkpoint import (
    GraphCheckpointService,
    GraphExecutionPlan,
    GraphStepBinding,
    JournalGraphCheckpointRepository,
)
from unchain.journal import AttemptRef, EventCursor
from unchain.kernel import ModelTurnResult
from unchain.memory import (
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_CAPABILITIES,
    MEMORY_V2_MODULE_KEY,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from unchain.providers.durable_turn_runtime import ExactProviderRouteTransport
from unchain.runtime import AgentRuntimeContext, ExecutionIdentity, ModuleGrant


def _root_runtime_context(
    *,
    execution_id: str,
    run_id: str,
) -> AgentRuntimeContext:
    return AgentRuntimeContext(
        identity=ExecutionIdentity(
            execution_id=execution_id,
            attempt_id=run_id,
            run_id=run_id,
            run_lineage=(run_id,),
        ),
        module_grants=(
            ModuleGrant(
                module_key=MEMORY_V2_MODULE_KEY,
                capabilities=MEMORY_V2_CAPABILITIES,
                delegable_capabilities=MEMORY_V2_CAPABILITIES.difference(
                    {MEMORY_EXECUTION_COMPLETE}
                ),
                authority=f"memory-completion:{execution_id}",
            ),
        ),
    )


def _two_provider_recipe():
    return parse_recipe_json(
        {
            "name": "Active Graph Restart",
            "description": "",
            "model": "openai:graph-base",
            "max_iterations": 1,
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
                        "prompt": "collect canonical evidence",
                    },
                },
                {
                    "id": "write",
                    "type": "agent",
                    "override": {
                        "model": "anthropic:graph-write",
                        "prompt": "write from {{#collect.output#}}",
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
    )


def _ready_capability() -> ContextMemoryV2CapabilityVerdict:
    return ContextMemoryV2CapabilityVerdict(
        ready=True,
        reason="unchain_context_memory_ready",
        verification="exact_sha",
        immutable=True,
        unchain_revision="a" * 40,
    )


def _active_environment(tmp_path) -> dict[str, str]:
    return {
        "UNCHAIN_DATA_DIR": str(tmp_path),
        "PUPU_CONTEXT_V2_STORE_OWNER": "unchain",
        "PUPU_FEATURE_MEMORY_V2": "all",
        "PUPU_MEMORY_V2_MODE": "all",
        "PUPU_MEMORY_V2_CANARY_PERCENT": "100",
    }


def _plan_from_admission(event) -> GraphExecutionPlan:
    raw = event.payload["plan"]
    return GraphExecutionPlan(
        orchestration_attempt=AttemptRef.from_dict(raw["orchestration_attempt"]),
        topology_sha256=raw["topology_sha256"],
        initial_input_cursor=EventCursor.from_dict(raw["initial_input_cursor"]),
        steps=tuple(GraphStepBinding.from_dict(step) for step in raw["steps"]),
    )


def test_active_two_node_graph_restarts_without_provider_reexecution(
    tmp_path,
    monkeypatch,
) -> None:
    workflow_run_id = "workflow-active-restart"
    execution_id = "execution-active-restart"
    owner_chat_id = "chat-active-graph-restart"
    recipe = _two_provider_recipe()
    provider_calls: Counter[tuple[str, str]] = Counter()
    provider_requests: dict[tuple[str, str], list[object]] = {}
    run_calls: list[dict[str, object]] = []
    build_calls: list[tuple[str, str]] = []
    terminal_order: list[str] = []
    admissions = []
    outputs = {
        ("openai", "graph-collect"): "canonical collected output",
        ("anthropic", "graph-write"): "canonical final report",
    }

    class OfflineModelIO:
        def __init__(self, provider: str, model: str) -> None:
            self.provider = provider
            self.model = model

        def fetch_turn(self, request):
            key = (self.provider, self.model)
            provider_calls[key] += 1
            provider_requests.setdefault(key, []).append(request)
            if key == ("anthropic", "graph-write"):
                assert "canonical collected output" in json.dumps(
                    request.messages,
                    ensure_ascii=False,
                    default=str,
                )
            output = outputs[key]
            return ModelTurnResult(
                assistant_messages=[
                    {"role": "assistant", "content": output},
                ],
                tool_calls=[],
                final_text=output,
                response_id=f"offline-{self.provider}-{self.model}",
            )

        def _merged_payload(self, payload):
            return dict(payload or {})

        def _model_capability(self, _name, default=None):
            return default

        def _provider_request_model(self):
            return self.model

    class OfflineExactTransport(ExactProviderRouteTransport):
        def __init__(self, model_io, request) -> None:
            self.model_io = model_io
            self.request = request

        def send(self, *, envelope, route, retry_ordinal):
            del envelope, route, retry_ordinal
            return self.model_io.fetch_turn(self.request)

        def release_buffered_events(self):
            return None

        def discard_buffered_events(self):
            return None

    def offline_exact_transport(*, model_io, request, **_kwargs):
        return OfflineExactTransport(model_io, request)

    real_build_agent = adapter._build_developer_agent
    real_resolve_admission = adapter._resolve_memory_v2_admission

    def capture_admission(*args, **kwargs):
        admission = real_resolve_admission(*args, **kwargs)
        admissions.append(admission)
        return admission

    class RecordingAgent:
        def __init__(self, inner) -> None:
            object.__setattr__(self, "_inner", inner)

        def __getattr__(self, name):
            return getattr(self._inner, name)

        def __setattr__(self, name, value) -> None:
            setattr(self._inner, name, value)

        def run(self, **kwargs):
            run_calls.append(
                {
                    "run_id": kwargs.get("run_id"),
                    "session_id": kwargs.get("session_id"),
                    "runtime_context": kwargs.get("runtime_context"),
                }
            )
            return self._inner.run(**kwargs)

    def build_offline_agent(**kwargs):
        provider = str(kwargs["provider"])
        model = str(kwargs["model"])
        build_calls.append((provider, model))
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
        reason="not-needed-for-graph-checkpoint-test",
    )
    memory_runtime = {
        "kind": "v2_durability",
        "requested": True,
        "required": True,
        "available": True,
        "durability_available": True,
        "legacy_context_available": False,
        "reason": "",
    }
    options = {
        "modelId": "openai:graph-base",
        "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": owner_chat_id,
        "_memory_v2_session_id": execution_id,
        "_memory_v2_attempt_id": workflow_run_id,
    }
    root_runtime_context = _root_runtime_context(
        execution_id=execution_id,
        run_id=workflow_run_id,
    )
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")

    probe_store = SQLiteContextV2Store(
        database_path=tmp_path / "memory_v2" / "context_v2.sqlite3",
        object_directory=tmp_path / "memory_v2" / "objects",
    )
    repository_type = type(probe_store.bind_execution(execution_id))
    original_persist_bundle = repository_type.persist_bundle

    def record_persisted_bundle(repository, bundle):
        persisted = original_persist_bundle(repository, bundle)
        if bundle.identity.relation == "root":
            terminal_order.append(f"bundle:{bundle.lifecycle.status}")
        return persisted

    import memory_v2_unchain_graph_root_completion as root_completion

    original_complete_root = root_completion.complete_pupu_unchain_graph_root

    def record_complete_root(*args, **kwargs):
        terminal_order.append("graph_finalize")
        return original_complete_root(*args, **kwargs)

    with mock.patch.dict(
        os.environ,
        _active_environment(tmp_path),
        clear=False,
    ), ExitStack() as stack:
        stack.enter_context(
            mock.patch.object(
                adapter,
                "_build_developer_agent",
                side_effect=build_offline_agent,
            )
        )
        stack.enter_context(
            mock.patch.object(
                adapter,
                "_resolve_memory_v2_admission",
                side_effect=capture_admission,
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
            mock.patch.object(adapter, "_resolve_agent_max_iterations", return_value=1)
        )
        stack.enter_context(
            mock.patch.object(
                adapter,
                "_inspect_memory_v2_rollout_intent",
                return_value={"target_mode": "active"},
            )
        )
        stack.enter_context(
            mock.patch.object(
                adapter,
                "get_pending_interaction",
                return_value={"status": "none", "session_id": execution_id},
            )
        )
        stack.enter_context(
            mock.patch.object(
                adapter,
                "_resolve_memory_runtime",
                return_value=(memory_runtime, None),
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
            mock.patch(
                "unchain.context.provider_execution._exact_transport",
                side_effect=offline_exact_transport,
            )
        )
        stack.enter_context(
            mock.patch.object(
                repository_type,
                "persist_bundle",
                autospec=True,
                side_effect=record_persisted_bundle,
            )
        )
        stack.enter_context(
            mock.patch.object(
                root_completion,
                "complete_pupu_unchain_graph_root",
                side_effect=record_complete_root,
            )
        )
        stack.enter_context(
            mock.patch(
                "memory_v2_context.resolve_context_memory_v2_capability",
                return_value=_ready_capability(),
            )
        )
        stack.enter_context(
            mock.patch("memory_v2_context._load_runtime", return_value=None)
        )
        stack.enter_context(
            mock.patch(
                "memory_v2_context._core_suppression_available",
                return_value=True,
            )
        )
        stack.enter_context(
            mock.patch(
                "memory_v2_unchain_agent_selection."
                "select_pupu_memory_agent_invoker",
                return_value=unavailable_memory_agent,
            )
        )

        first_events = list(
            adapter._stream_recipe_graph_events(
                recipe=recipe,
                message="produce the restart-safe report",
                history=[],
                attachments=[],
                options=options,
                session_id=execution_id,
                run_id_override=workflow_run_id,
                runtime_context=root_runtime_context,
            )
        )
        calls_after_first = provider_calls.copy()
        builds_after_first = tuple(build_calls)

        restarted_events = list(
            adapter._stream_recipe_graph_events(
                recipe=recipe,
                message="produce the restart-safe report",
                history=[],
                attachments=[],
                options=options,
                session_id=execution_id,
                run_id_override=workflow_run_id,
                runtime_context=root_runtime_context,
            )
        )

    assert calls_after_first == Counter(
        {
            ("openai", "graph-collect"): 1,
            ("anthropic", "graph-write"): 1,
        }
    )
    assert admissions and all(item.is_active for item in admissions)
    assert provider_calls == calls_after_first
    assert builds_after_first == (
        ("openai", "graph-collect"),
        ("anthropic", "graph-write"),
    )
    assert tuple(build_calls) == builds_after_first
    assert terminal_order.index("bundle:completed") < terminal_order.index(
        "graph_finalize"
    )
    assert len(run_calls) == 2
    assert len({call["run_id"] for call in run_calls}) == 2
    assert all(call["session_id"] == execution_id for call in run_calls)
    first_run_id = str(run_calls[0]["run_id"])
    second_run_id = str(run_calls[1]["run_id"])
    first_context = run_calls[0]["runtime_context"]
    second_context = run_calls[1]["runtime_context"]
    assert isinstance(first_context, AgentRuntimeContext)
    assert isinstance(second_context, AgentRuntimeContext)
    assert first_context.identity.run_lineage == (
        workflow_run_id,
        first_run_id,
    )
    assert second_context.identity.run_lineage == (
        workflow_run_id,
        first_run_id,
        second_run_id,
    )
    root_grant = root_runtime_context.grant_for(MEMORY_V2_MODULE_KEY)
    first_grant = first_context.grant_for(MEMORY_V2_MODULE_KEY)
    second_grant = second_context.grant_for(MEMORY_V2_MODULE_KEY)
    assert root_grant is not None
    assert first_grant == root_grant.delegated()
    assert second_grant == first_grant.delegated()
    assert not first_grant.allows(MEMORY_EXECUTION_COMPLETE)
    assert not second_grant.allows(MEMORY_EXECUTION_COMPLETE)
    assert any(
        event.get("type") == "final_message"
        and event.get("content") == "canonical final report"
        for event in first_events
    )
    assert any(
        event.get("type") == "final_message"
        and event.get("content") == "canonical final report"
        for event in restarted_events
    )

    store = SQLiteContextV2Store(
        database_path=tmp_path / "memory_v2" / "context_v2.sqlite3",
        object_directory=tmp_path / "memory_v2" / "objects",
    )
    journal = store.bind_execution(execution_id)
    snapshot = journal.capture_snapshot()
    admissions = tuple(
        event
        for event in snapshot.events
        if event.event_type == "graph.execution.admitted"
    )
    assert len(admissions) == 1
    plan = _plan_from_admission(admissions[0])
    assert len(plan.steps) == 2
    assert plan.steps[0].source_attempt == plan.orchestration_attempt
    assert plan.steps[1].source_attempt == plan.steps[0].attempt

    second_handoffs = tuple(
        event
        for event in snapshot.events
        if event.event_type == "handoff.recorded"
        and event.attempt == plan.steps[1].attempt
    )
    assert len(second_handoffs) == 1
    assert AttemptRef.from_dict(
        second_handoffs[0].payload["handoff_envelope"]["child_attempt"]
    ) == plan.steps[0].attempt
    assert [
        event.event_type
        for event in snapshot.events
        if event.event_type
        in {
            "graph.step.started",
            "graph.step.completed",
            "graph.execution.completed",
        }
    ].count("graph.step.started") == 2
    assert [
        event.event_type
        for event in snapshot.events
        if event.event_type
        in {
            "graph.step.started",
            "graph.step.completed",
            "graph.execution.completed",
        }
    ].count("graph.step.completed") == 2
    assert sum(
        event.event_type == "graph.execution.completed"
        for event in snapshot.events
    ) == 1

    artifacts = ArtifactService(
        journal,
        sanitizer=lambda content, media_type: content,
    )
    service = GraphCheckpointService(
        repository=JournalGraphCheckpointRepository(journal),
        artifacts=artifacts,
        derived_ingress_resolver=lambda consumer, source: (_ for _ in ()).throw(
            AssertionError("completed graph recovery must not rebuild handoffs")
        ),
    )
    assert service.read_completed_output(plan, 0) == {
        "schema": "unchain.graph_step_output.v1",
        "status": "completed",
        "output": "canonical collected output",
    }
    assert service.read_completed_output(plan, 1) == {
        "schema": "unchain.graph_step_output.v1",
        "status": "completed",
        "output": "canonical final report",
    }
    assert service.recover(plan).is_complete is True
