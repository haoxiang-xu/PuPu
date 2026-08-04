from __future__ import annotations

import os
from contextlib import ExitStack
from types import SimpleNamespace
from unittest import mock

import unchain_adapter as adapter
from context_memory_v2_capability import ContextMemoryV2CapabilityVerdict
from memory_v2_unchain_active_bridge import (
    bind_pupu_unchain_active_bridge,
    preflight_pupu_unchain_active_host,
)
from memory_v2_unchain_admission_adapter import (
    open_pupu_unchain_admission_authority,
)
import memory_v2_unchain_graph_root_completion as graph_root_completion
from memory_v2_unchain_lazy_bootstrap import (
    bootstrap_pupu_unchain_active_chat,
)
from memory_v2_unchain_run_binding import PupuMemoryV2TextInputDraft
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from recipe import parse_recipe_json
from unchain.context.subagent_input import prepare_subagent_input
from unchain.context.task_state_bootstrap import PinnedTaskStateBootstrapHarness
from unchain.kernel import ModelTurnResult
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.memory.curator import EnqueueDisposition
from unchain.memory.curator.host import MemoryAgentWorkerDisposition
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from unchain.run_identity import MemoryV2RunRole


def _recipe():
    return parse_recipe_json(
        {
            "name": "Graph root completion entry",
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
                        "prompt": "collect evidence",
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


def _environment(tmp_path, mode: str) -> dict[str, str]:
    return {
        "UNCHAIN_DATA_DIR": str(tmp_path),
        "PUPU_CONTEXT_V2_STORE_OWNER": "unchain",
        "PUPU_FEATURE_MEMORY_V2": "all",
        "PUPU_MEMORY_V2_MODE": mode,
        "PUPU_MEMORY_V2_CANARY_PERCENT": "100",
    }


def _runtime_state() -> dict[str, object]:
    return {
        "kind": "v2_durability",
        "requested": True,
        "required": True,
        "available": True,
        "durability_available": True,
        "legacy_context_available": False,
        "reason": "",
    }


def _selection():
    from memory_v2_unchain_agent_selection import (
        PupuMemoryAgentSelection,
        PupuMemoryAgentSelectionStatus,
    )

    return PupuMemoryAgentSelection(
        status=PupuMemoryAgentSelectionStatus.PENDING,
        reason="entry-test-has-no-memory-candidate",
    )


def _entry_stack(
    stack: ExitStack,
    *,
    tmp_path,
    mode: str,
    execution_id: str,
):
    outputs = {
        ("openai", "graph-collect"): "collected evidence",
        ("anthropic", "graph-write"): "canonical graph report",
    }
    real_build_agent = adapter._build_developer_agent

    class OfflineModelIO:
        def __init__(self, provider: str, model: str) -> None:
            self.provider = provider
            self.model = model

        def fetch_turn(self, request):
            del request
            output = outputs[(self.provider, self.model)]
            return ModelTurnResult(
                assistant_messages=[
                    {"role": "assistant", "content": output},
                ],
                tool_calls=[],
                final_text=output,
                response_id=f"offline-{self.provider}-{self.model}",
            )

    def build_offline_agent(**kwargs):
        provider = str(kwargs["provider"])
        model = str(kwargs["model"])
        kwargs["model_io_factory"] = (
            lambda spec, context, _provider=provider, _model=model: (
                OfflineModelIO(_provider, _model)
            )
        )
        return real_build_agent(**kwargs)

    stack.enter_context(
        mock.patch.dict(
            os.environ,
            _environment(tmp_path, mode),
            clear=False,
        )
    )
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
        mock.patch.object(
            adapter,
            "_resolve_agent_max_iterations",
            return_value=1,
        )
    )
    stack.enter_context(
        mock.patch.object(
            adapter,
            "_inspect_memory_v2_rollout_intent",
            return_value={"target_mode": mode},
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
            return_value=(_runtime_state(), None),
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
        mock.patch.object(
            adapter,
            "_build_bundle_from_result",
            return_value=None,
        )
    )
    stack.enter_context(
        mock.patch.object(
            adapter,
            "_extract_user_prompt_modules",
            return_value={},
        )
    )
    for name in (
        "_memory_v2_bind_recalled_refs",
        "_import_memory_v2_history",
        "_prepare_memory_v2_first_message_recall",
        "_persist_memory_v2_run_started",
        "_persist_memory_v2_semantic_event",
        "_finalize_memory_v2_curator",
    ):
        stack.enter_context(mock.patch.object(adapter, name))
    stack.enter_context(
        mock.patch.object(
            adapter,
            "_bootstrap_memory_v2_current_request",
            return_value={},
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
            return_value=_selection(),
        )
    )


def _root_options(
    *,
    owner_chat_id: str,
    execution_id: str,
    run_id: str,
) -> dict[str, object]:
    return {
        "modelId": "openai:graph-base",
        "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": owner_chat_id,
        "_memory_v2_session_id": execution_id,
        "_memory_v2_attempt_id": run_id,
    }


def _journal(tmp_path, execution_id: str):
    return SQLiteContextV2Store(
        database_path=tmp_path / "memory_v2" / "context_v2.sqlite3",
        object_directory=tmp_path / "memory_v2" / "objects",
    ).bind_execution(execution_id).capture_snapshot()


def _prepare_active_child_input(
    tmp_path,
    monkeypatch,
    *,
    owner_chat_id: str,
    execution_id: str,
    root_run_id: str,
    child_run_id: str,
):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    run = PupuUnchainShadowRunDraft(
        execution_id=execution_id,
        session_id=execution_id,
        attempt_id=root_run_id,
        run_id=root_run_id,
        root_run_id=root_run_id,
        role=MemoryV2RunRole.ROOT,
        current_input_draft=PupuMemoryV2TextInputDraft(
            content="delegate the child graph"
        ),
    )
    preflight = preflight_pupu_unchain_active_host(
        owner_chat_id=owner_chat_id,
        run=run,
        bootstrap_history=(),
        no_unfinished_durable_checkpoint=True,
        no_pending_interaction=True,
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )
    authority = open_pupu_unchain_admission_authority(
        owner_chat_id=owner_chat_id,
        preflight_complete=True,
    )
    record = authority.resolve_chat_admission(
        owner_chat_id=owner_chat_id,
        session_id=execution_id,
        requested_rollout_mode="all",
        effective_rollout_mode="all",
        cohort="all_active",
        target_mode="active",
        decision_reason="active_cutover",
        canary_selected=False,
        canary_percent=100,
        canary_bucket=1,
        hash_strategy="sha256_owner_v1",
        provenance={"source": "graph_root_completion_entry_test"},
        operation_id="admit-" + owner_chat_id,
    )
    admission = SimpleNamespace(
        is_active=True,
        owner_chat_id=owner_chat_id,
        session_id=execution_id,
        attempt_id=root_run_id,
        admission_id=record["admission_id"],
        admission_revision=record["revision"],
        v2_bootstrapped=record["v2_bootstrapped"],
        admission_authority=authority,
    )
    bootstrap = bootstrap_pupu_unchain_active_chat(
        preflight=preflight,
        admission=admission,
    )
    assert bootstrap["status"] == "completed"
    assert authority.get_chat_admission(owner_chat_id=owner_chat_id)[
        "v2_bootstrapped"
    ] is True
    bridge = bind_pupu_unchain_active_bridge(
        admission=admission,
        preflight=preflight,
    )
    factory = bridge.preparation.host_factory
    state = RunState()
    state.session_state.session_id = execution_id
    context = HarnessContext(
        state=state,
        phase="bootstrap",
        event={"run_id": root_run_id},
    )
    factory.context_module.runtime.bind_context(context)
    PinnedTaskStateBootstrapHarness(
        binding_resolver=factory.resolve_pinned_task_state_bootstrap,
    ).build_delta(context)
    parent = bridge.attempt_for_run(root_run_id)
    parent.bundle.durable_event_sink(
        {
            "type": "tool_call",
            "run_id": root_run_id,
            "iteration": 0,
            "call_id": "delegate-child-graph",
            "tool_name": "delegate_to_subagent",
            "arguments": {"task": "run the child graph"},
        }
    )
    return prepare_subagent_input(
        parent.bundle,
        call_id="delegate-child-graph",
        child_run_id=child_run_id,
        child_id="child-graph",
        mode="run",
        lineage=("child-graph",),
        template_name="child-graph",
        input_messages="run the child graph",
    )


def test_active_root_entry_runs_canonical_root_terminal_and_curator(
    tmp_path,
) -> None:
    execution_id = "execution-entry-active-root"
    root_run_id = "entry-active-root"
    owner_chat_id = "chat-entry-active-root"
    completions = []
    real_complete = graph_root_completion.complete_pupu_unchain_graph_root

    def record_completion(*args, **kwargs):
        receipt = real_complete(*args, **kwargs)
        completions.append(receipt)
        return receipt

    with ExitStack() as stack:
        _entry_stack(
            stack,
            tmp_path=tmp_path,
            mode="active",
            execution_id=execution_id,
        )
        stack.enter_context(
            mock.patch.object(
                graph_root_completion,
                "complete_pupu_unchain_graph_root",
                side_effect=record_completion,
            )
        )
        events = list(
            adapter._stream_recipe_graph_events(
                recipe=_recipe(),
                message="produce the canonical report",
                history=[],
                attachments=[],
                options=_root_options(
                    owner_chat_id=owner_chat_id,
                    execution_id=execution_id,
                    run_id=root_run_id,
                ),
                session_id=execution_id,
                run_id_override=root_run_id,
            )
        )

    assert len(completions) == 1
    receipt = completions[0]
    assert receipt.coordinator_attempt_id == root_run_id
    assert receipt.root_run_id == root_run_id
    assert receipt.memory.enqueue_disposition is EnqueueDisposition.NO_OP
    assert (
        receipt.memory.worker_receipt.disposition
        is MemoryAgentWorkerDisposition.IDLE
    )
    assert any(
        event.get("type") == "final_message"
        and event.get("content") == "canonical graph report"
        for event in events
    )
    snapshot = _journal(tmp_path, execution_id)
    root_attempt = next(
        event.attempt
        for event in snapshot.events
        if event.attempt.attempt_id == root_run_id
    )
    assert [
        event.event_type
        for event in snapshot.events
        if event.attempt == root_attempt
        and event.event_type in {"final_message", "run_completed"}
    ] == ["final_message", "run_completed"]


def test_active_subagent_entry_finalizes_graph_without_root_completion(
    tmp_path,
    monkeypatch,
) -> None:
    execution_id = "execution-entry-active-child"
    root_run_id = "entry-active-parent"
    child_run_id = "entry-active-child"
    owner_chat_id = "chat-entry-active-child"
    prepared = _prepare_active_child_input(
        tmp_path,
        monkeypatch,
        owner_chat_id=owner_chat_id,
        execution_id=execution_id,
        root_run_id=root_run_id,
        child_run_id=child_run_id,
    )
    calls = []

    def forbidden(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("a SUBAGENT graph cannot trigger ROOT completion")

    options = _root_options(
        owner_chat_id=owner_chat_id,
        execution_id=execution_id,
        run_id=child_run_id,
    )
    options.update(
        {
            "_memory_v2_run_role": MemoryV2RunRole.SUBAGENT.value,
            "_memory_v2_root_run_id": root_run_id,
            "_memory_v2_source_attempt_id": root_run_id,
            "_memory_v2_prepared_subagent_input": prepared,
            "_recipe_subagent_run": True,
        }
    )
    with ExitStack() as stack:
        _entry_stack(
            stack,
            tmp_path=tmp_path,
            mode="active",
            execution_id=execution_id,
        )
        stack.enter_context(
            mock.patch.object(
                graph_root_completion,
                "complete_pupu_unchain_graph_root",
                side_effect=forbidden,
            )
        )
        list(
            adapter._stream_recipe_graph_events(
                recipe=_recipe(),
                message="",
                history=[],
                attachments=[],
                options=options,
                session_id=execution_id,
                run_id_override=child_run_id,
            )
        )

    assert calls == []
    snapshot = _journal(tmp_path, execution_id)
    child_attempt = next(
        event.attempt
        for event in snapshot.events
        if event.attempt.attempt_id == child_run_id
    )
    assert sum(
        event.event_type == "graph.execution.completed"
        and event.attempt == child_attempt
        for event in snapshot.events
    ) == 1
    assert not any(
        event.attempt == child_attempt
        and event.event_type in {"final_message", "run_completed"}
        for event in snapshot.events
    )


def test_shadow_root_entry_finalizes_graph_without_active_root_completion(
    tmp_path,
) -> None:
    execution_id = "execution-entry-shadow-root"
    root_run_id = "entry-shadow-root"
    calls = []

    def forbidden(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("a shadow graph cannot trigger active ROOT completion")

    with ExitStack() as stack:
        _entry_stack(
            stack,
            tmp_path=tmp_path,
            mode="shadow",
            execution_id=execution_id,
        )
        stack.enter_context(
            mock.patch.object(
                graph_root_completion,
                "complete_pupu_unchain_graph_root",
                side_effect=forbidden,
            )
        )
        list(
            adapter._stream_recipe_graph_events(
                recipe=_recipe(),
                message="observe the graph",
                history=[],
                attachments=[],
                options=_root_options(
                    owner_chat_id="chat-entry-shadow-root",
                    execution_id=execution_id,
                    run_id=root_run_id,
                ),
                session_id=execution_id,
                run_id_override=root_run_id,
            )
        )

    assert calls == []
    snapshot = _journal(tmp_path, execution_id)
    root_attempt = next(
        event.attempt
        for event in snapshot.events
        if event.attempt.attempt_id == root_run_id
    )
    assert sum(
        event.event_type == "graph.execution.completed"
        and event.attempt == root_attempt
        for event in snapshot.events
    ) == 1
    assert not any(
        event.attempt == root_attempt
        and event.event_type in {"final_message", "run_completed"}
        for event in snapshot.events
    )
