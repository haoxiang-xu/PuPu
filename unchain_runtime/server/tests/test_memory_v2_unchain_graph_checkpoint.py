from __future__ import annotations

import copy
from types import SimpleNamespace

import pytest

from memory_v2_unchain_active_bridge import (
    PupuUnchainActiveBridge,
    prepare_pupu_unchain_active_bridge,
)
from memory_v2_unchain_derived_handoff import (
    PupuUnchainDerivedHandoffHostAdapter,
    PupuUnchainDerivedHandoffRequest,
)
from memory_v2_unchain_graph_checkpoint import (
    PupuUnchainGraphCheckpointHost,
    PupuUnchainGraphCheckpointHostError,
    PupuUnchainGraphStepDescriptor,
    prepare_pupu_unchain_graph_checkpoint_host,
)
from memory_v2_unchain_run_binding import PupuMemoryV2TextInputDraft
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from unchain.agent.modules.graph_checkpoint import GraphStepBootstrapModule
from unchain.context.graph_checkpoint import GraphCheckpointConflict
from unchain.context.graph_harness import (
    GraphStepBootstrapBinding,
    GraphStepBootstrapHarness,
)
from unchain.context.models import HandoffStatus
from unchain.context.task_state_bootstrap import PinnedTaskStateBootstrapHarness
from unchain.journal import EventCursor, EventRange
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.memory import (
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_CAPABILITIES,
    MEMORY_V2_MODULE_KEY,
)
from unchain.runtime import ExecutionIdentity, ModuleGrant


def _root_grant() -> ModuleGrant:
    return ModuleGrant(
        module_key=MEMORY_V2_MODULE_KEY,
        capabilities=MEMORY_V2_CAPABILITIES,
        delegable_capabilities=(
            MEMORY_V2_CAPABILITIES - {MEMORY_EXECUTION_COMPLETE}
        ),
        authority="graph-root-authority",
    )


def _run(
    *,
    execution_id: str,
    attempt_id: str,
    run_lineage: tuple[str, ...] | None = None,
    grant: ModuleGrant | None = None,
    content: str | None = None,
) -> PupuUnchainShadowRunDraft:
    lineage = run_lineage or (attempt_id,)
    return PupuUnchainShadowRunDraft(
        session_id=execution_id,
        identity=ExecutionIdentity(
            execution_id=execution_id,
            attempt_id=attempt_id,
            run_id=attempt_id,
            run_lineage=lineage,
        ),
        grant=(
            grant
            or (
                _root_grant()
                if len(lineage) == 1
                else _root_grant().delegated()
            )
        ),
        current_input_draft=(
            None
            if content is None
            else PupuMemoryV2TextInputDraft(content=content)
        ),
    )


def _bridge(
    tmp_path,
    monkeypatch,
    *,
    run: PupuUnchainShadowRunDraft,
    owner_chat_id: str = "chat-graph-checkpoint",
) -> PupuUnchainActiveBridge:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    admission = SimpleNamespace(
        is_active=True,
        owner_chat_id=owner_chat_id,
        session_id=run.session_id,
        attempt_id=run.attempt_id,
    )
    bridge = prepare_pupu_unchain_active_bridge(
        admission=admission,
        run=run,
        bootstrap_history=(),
        no_unfinished_durable_checkpoint=True,
        no_pending_interaction=True,
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )
    assert type(bridge) is PupuUnchainActiveBridge
    return bridge


def _descriptors(*, changed_prompt: bool = False):
    return (
        PupuUnchainGraphStepDescriptor(
            index=0,
            node_id="collect",
            attempt_id="graph-step-collect",
            provider="OpenAI",
            model="gpt-test",
            prompt="collect changed" if changed_prompt else "collect sources",
            configuration={"temperature": 0, "tools": ["search"]},
        ),
        PupuUnchainGraphStepDescriptor(
            index=1,
            node_id="write",
            attempt_id="graph-step-write",
            provider="anthropic",
            model="claude-test",
            prompt="write the report",
            configuration={"temperature": 0.2},
        ),
    )


def _bootstrap_context(*, execution_id: str, run_id: str) -> HarnessContext:
    state = RunState()
    state.session_state.session_id = execution_id
    return HarnessContext(
        state=state,
        phase="bootstrap",
        event={"run_id": run_id},
    )


def _bootstrap_bridge(bridge: PupuUnchainActiveBridge) -> None:
    factory = bridge.preparation.host_factory
    binding = bridge.preparation.binding
    context = _bootstrap_context(
        execution_id=binding.execution_id,
        run_id=binding.run_id,
    )
    factory.context_module.runtime.bind_context(context)
    PinnedTaskStateBootstrapHarness(
        binding_resolver=factory.resolve_pinned_task_state_bootstrap,
    ).build_delta(context)


def _start_step(host: PupuUnchainGraphCheckpointHost, index: int):
    step = host.plan.steps[index]
    host.register_step(index)
    context = _bootstrap_context(
        execution_id=host.plan.execution_id,
        run_id=step.attempt.attempt_id,
    )
    runtime = host.active_bridge.preparation.host_factory.context_module.runtime
    runtime.bind_context(context)
    GraphStepBootstrapHarness(
        runtime=runtime,
        binding_resolver=lambda supplied: GraphStepBootstrapBinding(
            service=host.service,
            plan=host.plan,
            step_index=index,
        ),
    ).build_delta(context)
    return host.active_bridge.attempt_for_run(step.attempt.attempt_id)


def _finish_step(host: PupuUnchainGraphCheckpointHost, index: int, output: str):
    prepared = host.active_bridge.attempt_for_run(
        host.plan.steps[index].attempt.attempt_id
    )
    prepared.bundle.durable_event_sink(
        {
            "type": "final_message",
            "run_id": prepared.bundle.attempt.attempt_id,
            "iteration": 1,
            "content": output,
        }
    )
    prepared.bundle.durable_event_sink(
        {
            "type": "run_completed",
            "run_id": prepared.bundle.attempt.attempt_id,
            "iteration": 1,
            "status": "completed",
        }
    )
    return host.complete_step(index, full_output=output)


def test_top_level_coordinator_bootstraps_and_binds_all_nodes_as_graph_steps(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _bridge(
        tmp_path,
        monkeypatch,
        run=_run(
            execution_id="execution-graph-root",
            attempt_id="graph-coordinator",
            content="build a durable report",
        ),
    )

    host = prepare_pupu_unchain_graph_checkpoint_host(
        active_bridge=bridge,
        steps=_descriptors(),
    )

    assert type(host) is PupuUnchainGraphCheckpointHost
    assert host.plan.orchestration_attempt == host.coordinator.bundle.attempt
    seed = next(
        event
        for event in host.coordinator.bundle.journal.capture_snapshot().events
        if event.attempt == host.plan.orchestration_attempt
        and event.event_type == "message.user"
    )
    assert host.plan.initial_input_cursor == EventCursor(
        seed.store_seq,
        seed.event_id,
    )
    task_state = bridge.preparation.host_factory.task_state.get()
    assert task_state.objective == "build a durable report"

    last_registered = host.register_step(1)
    registered = (host.register_step(0), last_registered)
    assert [binding.parent_run_id for binding in registered] == [
        "graph-coordinator",
        "graph-step-collect",
    ]
    assert [binding.identity.run_lineage for binding in registered] == [
        ("graph-coordinator", "graph-step-collect"),
        (
            "graph-coordinator",
            "graph-step-collect",
            "graph-step-write",
        ),
    ]
    delegated = bridge.preparation.binding.grant.delegated()
    assert [binding.grant for binding in registered] == [delegated, delegated]
    assert all(binding.grant.authority is None for binding in registered)
    assert all(
        not binding.grant.allows(MEMORY_EXECUTION_COMPLETE)
        for binding in registered
    )
    assert host.register_step(1) is registered[1]
    assert host.plan.steps[1].source_attempt == host.plan.steps[0].attempt
    modules = host.step_modules(0)
    assert type(modules[-1]) is GraphStepBootstrapModule


def test_changed_prompt_or_topology_conflicts_with_admitted_plan(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _bridge(
        tmp_path,
        monkeypatch,
        run=_run(
            execution_id="execution-graph-cas",
            attempt_id="graph-cas-coordinator",
            content="stable task",
        ),
    )
    prepare_pupu_unchain_graph_checkpoint_host(
        active_bridge=bridge,
        steps=_descriptors(),
    )

    with pytest.raises(GraphCheckpointConflict, match="conflicted"):
        prepare_pupu_unchain_graph_checkpoint_host(
            active_bridge=bridge,
            steps=_descriptors(changed_prompt=True),
        )


def test_resume_snapshot_checks_canonical_identity_and_grant(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _bridge(
        tmp_path,
        monkeypatch,
        run=_run(
            execution_id="execution-graph-resume",
            attempt_id="graph-resume-coordinator",
            content="resume-safe task",
        ),
    )
    host = prepare_pupu_unchain_graph_checkpoint_host(
        active_bridge=bridge,
        steps=_descriptors(),
    )
    step = host.plan.steps[0]
    locator = {
        "resume_kind": "graph_step",
        "owner_chat_id": bridge.preparation.binding.owner_chat_id,
        "graph_execution_id": bridge.preparation.binding.execution_id,
        "coordinator_attempt_id": host.plan.orchestration_attempt.attempt_id,
        "graph_plan_id": host.plan.plan_id,
        "graph_scope_id": host.plan.scope_id,
        "topology_sha256": host.plan.topology_sha256,
        "step_index": step.index,
        "node_id": step.node_id,
        "step_attempt_id": step.attempt.attempt_id,
        "predecessor_attempt_id": step.source_attempt.attempt_id,
        "provider": step.provider,
        "model": step.model,
        "configuration_sha256": step.configuration_sha256,
        "canonical_build_fingerprint": host.canonical_build_fingerprint,
        "coordinator_binding_snapshot": host.coordinator_binding_snapshot,
    }

    assert host.validate_resume_context(locator) == 0

    changed_identity = copy.deepcopy(locator)
    changed_identity["coordinator_binding_snapshot"]["identity"][
        "run_lineage"
    ] = ["different-coordinator"]
    with pytest.raises(
        PupuUnchainGraphCheckpointHostError,
        match="changed its coordinator binding",
    ):
        host.validate_resume_context(changed_identity)

    changed_grant = copy.deepcopy(locator)
    changed_grant["coordinator_binding_snapshot"]["grant"]["capabilities"] = []
    with pytest.raises(
        PupuUnchainGraphCheckpointHostError,
        match="changed its coordinator binding",
    ):
        host.validate_resume_context(changed_grant)


def test_restart_skips_completed_step_and_reads_official_output(
    tmp_path,
    monkeypatch,
) -> None:
    run = _run(
        execution_id="execution-graph-restart",
        attempt_id="graph-restart-coordinator",
        content="restart-safe task",
    )
    first_bridge = _bridge(tmp_path, monkeypatch, run=run)
    first = prepare_pupu_unchain_graph_checkpoint_host(
        active_bridge=first_bridge,
        steps=_descriptors(),
    )
    step_runtime = _start_step(first, 0)
    assert step_runtime.bundle.journal is not first.coordinator.bundle.journal
    _finish_step(first, 0, "collected sources")

    restarted_bridge = _bridge(tmp_path, monkeypatch, run=run)
    restarted = prepare_pupu_unchain_graph_checkpoint_host(
        active_bridge=restarted_bridge,
        steps=_descriptors(),
    )

    assert restarted.should_skip(0) is True
    assert restarted.should_skip(1) is False
    assert restarted.read_completed_output(0) == {
        "schema": "unchain.graph_step_output.v1",
        "status": "completed",
        "output": "collected sources",
    }
    assert not any(
        event.event_type == "graph.step.started"
        and event.attempt == restarted.plan.steps[1].attempt
        for event in restarted.coordinator.bundle.journal.capture_snapshot().events
    )

    _start_step(restarted, 1)
    second_events = tuple(
        event
        for event in restarted.coordinator.bundle.journal.capture_snapshot().events
        if event.attempt == restarted.plan.steps[1].attempt
    )
    assert [
        event.event_type
        for event in second_events
        if event.event_type
        in {"handoff.recorded", "message.user", "graph.step.started"}
    ] == ["handoff.recorded", "message.user", "graph.step.started"]
    _finish_step(restarted, 1, "finished report")
    finalized = restarted.finalize()
    assert finalized.is_complete is True
    assert restarted.read_completed_output(1)["output"] == "finished report"


def test_recipe_ref_coordinator_binds_existing_derived_subagent_input(
    tmp_path,
    monkeypatch,
) -> None:
    execution_id = "execution-recipe-ref-graph"
    root_run_id = "recipe-parent-root"
    root_bridge = _bridge(
        tmp_path,
        monkeypatch,
        run=_run(
            execution_id=execution_id,
            attempt_id=root_run_id,
            content="parent objective",
        ),
    )
    _bootstrap_bridge(root_bridge)
    root_attempt = root_bridge.attempt_for_run(root_run_id).bundle.attempt
    root_event = next(
        event
        for event in root_bridge.attempt_for_run(
            root_run_id
        ).bundle.journal.capture_snapshot().events
        if event.attempt == root_attempt and event.event_type == "message.user"
    )
    source_cursor = EventCursor(root_event.store_seq, root_event.event_id)

    coordinator_id = "recipe-ref-coordinator"
    child_bridge = _bridge(
        tmp_path,
        monkeypatch,
        run=_run(
            execution_id=execution_id,
            attempt_id=coordinator_id,
            run_lineage=(root_run_id, coordinator_id),
        ),
    )
    binding = child_bridge.preparation.binding
    factory = child_bridge.preparation.host_factory
    PupuUnchainDerivedHandoffHostAdapter(
        database_path=factory.database_path,
        object_directory=factory.object_directory,
    ).persist(
        PupuUnchainDerivedHandoffRequest(
            owner_chat_id=binding.owner_chat_id,
            session_id=binding.session_id,
            generation_id=binding.generation_id,
            head_revision=binding.head_revision,
            identity=binding.identity,
            grant=binding.grant,
            source_attempt_id=binding.parent_run_id,
            source_event_range=EventRange(source_cursor, source_cursor),
            operation_id="recipe-ref-derived-input",
            status=HandoffStatus.COMPLETE,
            full_output={"task": "run the nested graph"},
        )
    )

    host = prepare_pupu_unchain_graph_checkpoint_host(
        active_bridge=child_bridge,
        steps=_descriptors(),
    )
    coordinator_events = tuple(
        event
        for event in host.coordinator.bundle.journal.capture_snapshot().events
        if event.attempt == host.plan.orchestration_attempt
    )

    assert binding.identity.run_lineage == (root_run_id, coordinator_id)
    assert binding.parent_run_id == root_run_id
    assert binding.grant == root_bridge.preparation.binding.grant.delegated()
    assert [
        event.event_type
        for event in coordinator_events
        if event.event_type in {"handoff.recorded", "message.user"}
    ] == ["handoff.recorded", "message.user"]
    assert host.plan.initial_input_cursor.event_id == next(
        event.event_id
        for event in coordinator_events
        if event.event_type == "message.user"
    )
    assert child_bridge.preparation.host_factory.task_state.get().objective == (
        "parent objective"
    )


def test_nested_coordinator_requires_one_exact_durable_input(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _bridge(
        tmp_path,
        monkeypatch,
        run=_run(
            execution_id="execution-invalid-coordinator",
            attempt_id="invalid-graph-coordinator",
            run_lineage=(
                "different-root-run",
                "source-before-invalid-coordinator",
                "invalid-graph-coordinator",
            ),
        ),
        owner_chat_id="chat-invalid-graph-coordinator",
    )

    with pytest.raises(
        PupuUnchainGraphCheckpointHostError,
        match="requires one exact durable input",
    ):
        prepare_pupu_unchain_graph_checkpoint_host(
            active_bridge=bridge,
            steps=_descriptors(),
        )
