from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest

from memory_v2_unchain_runtime_factory import (
    PupuUnchainContextMemoryV2HostFactory,
    PupuUnchainHostFactoryError,
)
from unchain.agent import AgentBuilder, AgentCallContext, AgentSpec, AgentState
from unchain.agent.model_io import ModelIOFactoryRegistry
from unchain.agent.modules import ContextModule, ContextShadowModule
from unchain.memory import (
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_CAPABILITIES,
    MEMORY_V2_MODULE_KEY,
    MemoryAttachmentRequest,
    MemoryV2Module,
)
from unchain.agent.modules.task_state_bootstrap import (
    PinnedTaskStateBootstrapModule,
)
from unchain.context import (
    ContextExecutionBundle,
    ContextRuntime,
    DurableContextRuntimeFactory,
    HostResolvedCurrentInput,
    SemanticEventProjectionMode,
)
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.context.request_factory import JournalContextRequestFactory
from unchain.context.tool_boundary import DurableToolBoundary
from unchain.journal import (
    AttemptRef,
    EventCursor,
    EventRange,
    GenerationRef,
    ResourceRef,
)
from unchain.journal.runtime import build_operation_ref
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.kernel.types import KernelRunResult
from unchain.memory.curator import RunCaptureStatus, SourceRunStatus
from unchain.memory.curator.host import MemoryAgentWorkerDisposition
from unchain.runtime import AgentRuntimeContext, ExecutionIdentity, ModuleGrant
from unchain.subagents.types import SubagentResult
from unchain.tools.tool import Tool
from unchain.tools.toolkit import Toolkit
from unchain.tools.runtime import ToolRuntimeOutcome
from memory_v2_context import build_memory_v2_tool_runtime_config


def _current_input(context, attempt):
    return HostResolvedCurrentInput(
        attempt=attempt,
        content=context.event["current_input"],
    )


def _generation(context, execution_id):
    del execution_id
    return context.event["generation_id"]


def _identity_artifact(content: bytes, media_type: str) -> bytes:
    del media_type
    return content


def _identity_payload(event_type: str, payload: dict) -> dict:
    del event_type
    return payload


def _memory_grant(*, completion_authority: bool) -> ModuleGrant:
    delegable = MEMORY_V2_CAPABILITIES.difference({MEMORY_EXECUTION_COMPLETE})
    return ModuleGrant(
        module_key=MEMORY_V2_MODULE_KEY,
        capabilities=(
            MEMORY_V2_CAPABILITIES if completion_authority else delegable
        ),
        delegable_capabilities=delegable,
        authority="completion-authority-a" if completion_authority else None,
    )


def _memory_identity(
    *,
    execution_id: str,
    attempt_id: str,
    run_id: str,
    run_lineage: tuple[str, ...] | None = None,
) -> ExecutionIdentity:
    return ExecutionIdentity(
        execution_id=execution_id,
        attempt_id=attempt_id,
        run_id=run_id,
        run_lineage=run_lineage or (run_id,),
    )


def _runtime_context(
    *,
    execution_id: str,
    attempt_id: str,
    run_id: str,
    run_lineage: tuple[str, ...] | None = None,
    completion_authority: bool = True,
) -> AgentRuntimeContext:
    return AgentRuntimeContext(
        identity=_memory_identity(
            execution_id=execution_id,
            attempt_id=attempt_id,
            run_id=run_id,
            run_lineage=run_lineage,
        ),
        module_grants=(
            _memory_grant(completion_authority=completion_authority),
        ),
    )


def _attachment_request(
    *,
    agent_name: str,
    execution_id: str,
    attempt_id: str,
    run_id: str,
    run_lineage: tuple[str, ...] | None = None,
    completion_authority: bool,
) -> MemoryAttachmentRequest:
    return MemoryAttachmentRequest(
        agent_name=agent_name,
        mode="run",
        identity=_memory_identity(
            execution_id=execution_id,
            attempt_id=attempt_id,
            run_id=run_id,
            run_lineage=run_lineage,
        ),
        grant=_memory_grant(completion_authority=completion_authority),
    )


class _NeverRunOfficialMemoryAgent:
    def run(self, request, *, toolkit, binding):
        del request, toolkit, binding
        raise AssertionError("Memory Agent worker is outside this mount test")


class _NeverRunModelIO:
    provider = "openai"

    def fetch_turn(self, request):
        del request
        raise AssertionError("agent preparation must not invoke the provider")


def _context(
    *,
    execution_id: str,
    generation_id: str,
    attempt_id: str,
    current_input: str = "current input",
) -> HarnessContext:
    state = RunState()
    state.session_state.session_id = execution_id
    return HarnessContext(
        state=state,
        phase="bootstrap",
        event={
            "run_id": attempt_id,
            "generation_id": generation_id,
            "current_input": current_input,
        },
    )


def _factory(
    root: Path,
    *,
    owner_chat_id: str = "chat-a",
    root_run_id: str = "root-run-a",
    artifact_sanitizer=_identity_artifact,
    projection_mode: SemanticEventProjectionMode = (
        SemanticEventProjectionMode.CANONICAL
    ),
    production_enabled: bool = False,
    memory_agent_enabled: bool = False,
    memory_agent_model_invoker=None,
) -> PupuUnchainContextMemoryV2HostFactory:
    return PupuUnchainContextMemoryV2HostFactory(
        owner_chat_id=owner_chat_id,
        root_run_id=root_run_id,
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
        generation_resolver=_generation,
        current_input_resolver=_current_input,
        artifact_sanitizer=artifact_sanitizer,
        event_payload_sanitizer=_identity_payload,
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
        projection_mode=projection_mode,
        production_enabled=production_enabled,
        memory_agent_enabled=memory_agent_enabled,
        memory_agent_model_invoker=memory_agent_model_invoker,
    )


def _row_count(database_path: Path, table_name: str) -> int:
    connection = sqlite3.connect(database_path)
    try:
        return int(
            connection.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        )
    finally:
        connection.close()


def test_factory_builds_official_factory_context_and_closed_memory_modules(
    tmp_path: Path,
) -> None:
    host = _factory(tmp_path)

    assert type(host.context_module) is ContextModule
    assert type(host.context_module.runtime) is ContextRuntime
    assert (
        type(host.context_module.runtime.execution_factory)
        is DurableContextRuntimeFactory
    )
    assert host.context_module.runtime.durable_event_sink is None
    assert type(host.memory_module) is MemoryV2Module
    assert host.memory_module.host is host.memory_host
    assert host.memory_host.enabled is False
    assert host.task_state_bootstrap_module is None
    assert host.production_enabled is False
    shadow_modules = host.modules_for_shadow()
    assert len(shadow_modules) == 1
    assert type(shadow_modules[0]) is ContextShadowModule
    assert shadow_modules[0].enabled is True
    assert shadow_modules[0].runtime is host.context_module.runtime
    with pytest.raises(PupuUnchainHostFactoryError, match="production gate"):
        host.modules_for_active()


def test_explicit_production_gate_mounts_only_canonical_context_owner(
    tmp_path: Path,
) -> None:
    host = _factory(tmp_path, production_enabled=True)

    assert host.production_enabled is True
    assert host.modules_for_active() == (
        host.context_module,
        host.task_state_bootstrap_module,
    )
    assert type(host.task_state_bootstrap_module) is PinnedTaskStateBootstrapModule
    assert host.context_module.runtime.provider_turns_enabled is True
    assert host.context_module.runtime.tool_output_management_active is True
    host.context_module.runtime.bind_context(
        _context(
            execution_id="execution-provider-turn",
            generation_id="generation-provider-turn",
            attempt_id="attempt-provider-turn",
        )
    )
    attempt = host.attempt(
        execution_id="execution-provider-turn",
        attempt_id="attempt-provider-turn",
    )
    assert attempt.bundle.provider_turn_service is not None
    assert attempt.bundle.provider_turn_service.mode.value == "enforce"

    observed = _factory(
        tmp_path / "observed",
        projection_mode=SemanticEventProjectionMode.SHADOW_OBSERVED,
        production_enabled=True,
    )
    with pytest.raises(PupuUnchainHostFactoryError, match="canonical"):
        observed.modules_for_active()
    assert observed.context_module.runtime.provider_turns_enabled is False


def test_active_pupu_admission_leaves_snapshot_to_exposed_unchain_toolkit(
    tmp_path: Path,
) -> None:
    host = _factory(tmp_path, production_enabled=True)
    admission = SimpleNamespace(
        mode="active",
        is_active=True,
        owner_chat_id="chat-a",
        session_id="execution-tool-output",
        attempt_id="attempt-tool-output",
        source_attempt_id="attempt-tool-output",
    )
    context = _context(
        execution_id="execution-tool-output",
        generation_id="generation-tool-output",
        attempt_id="attempt-tool-output",
    )
    context.event["tool_runtime_config"] = build_memory_v2_tool_runtime_config(
        admission,
        run_id="attempt-tool-output",
    )
    context.event["toolkit"] = Toolkit(
        {
            "large_search": Tool(
                name="large_search",
                description="search",
                output_policy="artifact_only",
            )
        }
    )

    host.context_module.runtime.bind_context(context)
    host.context_module.runtime.bind_execution_toolkit(context)

    runtime_config = context.event["tool_runtime_config"]
    assert runtime_config["tool_output_policy_map"] == {
        "schema": "unchain.tool_output_policy_map.v1",
        "policies": {"large_search": "artifact_only"},
    }
    assert context.event["tool_output_manager"].active is True


def test_memory_agent_mount_gate_requires_exact_bool_and_active_production(
    tmp_path: Path,
) -> None:
    with pytest.raises(TypeError, match="exact boolean"):
        _factory(
            tmp_path / "not-bool",
            production_enabled=True,
            memory_agent_enabled=1,
            memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
        )

    with pytest.raises(PupuUnchainHostFactoryError, match="production gate"):
        _factory(
            tmp_path / "shadow",
            memory_agent_enabled=True,
            memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
        )


def test_enabled_memory_agent_mount_requires_explicit_official_model_invoker(
    tmp_path: Path,
) -> None:
    with pytest.raises(PupuUnchainHostFactoryError, match="model_invoker"):
        _factory(
            tmp_path,
            production_enabled=True,
            memory_agent_enabled=True,
        )


def test_active_host_builds_agent_with_only_official_normal_memory_tools(
    tmp_path: Path,
) -> None:
    invoker = _NeverRunOfficialMemoryAgent()
    host = _factory(
        tmp_path,
        production_enabled=True,
        memory_agent_enabled=True,
        memory_agent_model_invoker=invoker,
    )

    assert host.memory_agent_enabled is True
    assert host.memory_host.enabled is True
    assert host.modules_for_active() == (
        host.context_module,
        host.task_state_bootstrap_module,
        host.memory_module,
        host.memory_worker_module,
    )
    assert host.modules_for_shadow()[0].runtime is host.context_module.runtime
    assert len(host.modules_for_shadow()) == 1

    builder = AgentBuilder(
        agent=SimpleNamespace(name="normal-agent"),
        spec=AgentSpec(
            name="normal-agent",
            provider="openai",
            model="gpt-test",
        ),
        state=AgentState(),
        call_context=AgentCallContext(
            mode="run",
            runtime_context=_runtime_context(
                execution_id="session-a",
                attempt_id="root-run-a",
                run_id="root-run-a",
            ),
        ),
        model_io_registry=ModelIOFactoryRegistry(),
    )
    builder.set_model_io(_NeverRunModelIO())
    for module in host.modules_for_active():
        module.configure(builder)

    prepared = builder.build()
    memory_tools = tuple(
        name for name in prepared.toolkit.tools if name.startswith("memory_")
    )

    assert memory_tools == (
        "memory_list",
        "memory_search",
        "memory_read",
        "memory_propose",
    )
    assert "memory_candidate_apply_new" not in prepared.toolkit.tools
    assert "memory_candidate_propose_review" not in prepared.toolkit.tools
    assert "memory_upsert" not in prepared.toolkit.tools
    assert "memory_promote" not in prepared.toolkit.tools

    host.context_module.runtime.bind_context(
        _context(
            execution_id="session-a",
            generation_id="generation-a",
            attempt_id="root-run-a",
            current_input="current objective",
        )
    )
    host.context_module.runtime.persist_event(
        {
            "type": "final_message",
            "run_id": "root-run-a",
            "iteration": 0,
            "content": "done",
        }
    )
    host.context_module.runtime.persist_event(
        {
            "type": "run_completed",
            "run_id": "root-run-a",
            "iteration": 0,
            "status": "completed",
        }
    )
    result = KernelRunResult(
        messages=[{"role": "assistant", "content": "done"}],
        status="completed",
    )
    for hook in builder.run_hooks:
        assert hook(result) is None

    assert host.memory_worker_module.last_failure_code == ""
    assert host.memory_worker_module.last_receipt is not None
    assert (
        host.memory_worker_module.last_receipt.disposition
        is MemoryAgentWorkerDisposition.IDLE
    )


def test_active_root_attachment_captures_canonical_terminal_journal(
    tmp_path: Path,
) -> None:
    host = _factory(
        tmp_path,
        root_run_id="attempt-a",
        production_enabled=True,
        memory_agent_enabled=True,
        memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
    )
    host.context_module.runtime.bind_context(
        _context(
            execution_id="execution-a",
            generation_id="generation-a",
            attempt_id="attempt-a",
            current_input="current objective",
        )
    )
    host.context_module.runtime.persist_event(
        {
            "type": "final_message",
            "run_id": "attempt-a",
            "iteration": 0,
            "content": "done",
        }
    )
    host.context_module.runtime.persist_event(
        {
            "type": "run_completed",
            "run_id": "attempt-a",
            "iteration": 0,
            "status": "completed",
        }
    )
    attachment = host.normal_attachment_factory.attach(
        _attachment_request(
            agent_name="normal-agent",
            execution_id="execution-a",
            attempt_id="attempt-a",
            run_id="attempt-a",
            completion_authority=True,
        )
    )
    child_attachment = host.normal_attachment_factory.attach(
        _attachment_request(
            agent_name="child-agent",
            execution_id="execution-a",
            attempt_id="child-attempt",
            run_id="child-run",
            run_lineage=("attempt-a", "child-run"),
            completion_authority=False,
        )
    )

    assert attachment.completion_factory is not None
    assert child_attachment.completion_factory is None
    completion = attachment.completion_factory.build(
        result=KernelRunResult(
            messages=[{"role": "assistant", "content": "done"}],
            status="completed",
        )
    )

    assert completion.run_status is SourceRunStatus.COMPLETED
    assert completion.capture_status is RunCaptureStatus.COMPLETE


def test_official_memory_toolkit_reads_scope_bound_context_content(
    tmp_path: Path,
) -> None:
    host = _factory(
        tmp_path,
        production_enabled=True,
        memory_agent_enabled=True,
        memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
    )
    host.context_module.runtime.bind_context(
        _context(
            execution_id="execution-a",
            generation_id="generation-a",
            attempt_id="attempt-a",
            current_input="current objective",
        )
    )
    attempt = host.attempt(execution_id="execution-a", attempt_id="attempt-a")
    artifact = attempt.bundle.artifacts.persist(
        b"durable artifact payload",
        media_type="text/plain",
        operation_id="memory-toolkit-artifact",
    )
    events = attempt.bundle.journal.capture_snapshot().events
    source_range = EventRange(
        EventCursor(events[0].store_seq, events[0].event_id),
        EventCursor(events[-1].store_seq, events[-1].event_id),
    )
    checkpoints = host.compiler_store.bind_execution(
        "execution-a",
        artifacts=attempt.bundle.artifacts,
    ).checkpoints
    operation = build_operation_ref(
        "memory-toolkit-checkpoint",
        domain="test.memory_v2_unchain_runtime_factory",
        payload={"source_range": source_range.to_dict()},
    )
    checkpoint = checkpoints.commit(
        prepared=checkpoints.prepare(
            source_range=source_range,
            summary="durable checkpoint summary",
            refs=(artifact.ref,),
            operation=operation,
        )
    )

    builder = AgentBuilder(
        agent=SimpleNamespace(name="normal-agent"),
        spec=AgentSpec(
            name="normal-agent",
            provider="openai",
            model="gpt-test",
        ),
        state=AgentState(),
        call_context=AgentCallContext(
            mode="run",
            runtime_context=_runtime_context(
                execution_id="execution-a",
                attempt_id="attempt-a",
                run_id="root-run-a",
            ),
        ),
        model_io_registry=ModelIOFactoryRegistry(),
    )
    builder.set_model_io(_NeverRunModelIO())
    for module in host.modules_for_active():
        module.configure(builder)
    prepared = builder.build()

    artifact_result = prepared.toolkit.tools["context_content_read"].func(
        ref=host.reference_codec.encode(artifact.ref),
        offset=8,
        limit=8,
    )
    event_result = prepared.toolkit.tools["context_content_read"].func(
        ref=host.reference_codec.encode(
            ResourceRef("context_event", events[0].event_id, 1, "content")
        ),
        offset=0,
        limit=1024,
    )
    checkpoint_result = prepared.toolkit.tools[
        "context_checkpoint_events_read"
    ].func(
        checkpoint_ref=host.reference_codec.encode(checkpoint.checkpoint_ref),
        after_position=0,
        limit=1,
    )

    assert artifact_result["content"]["text"] == "artifact"
    assert artifact_result["sha256"] == artifact.sha256
    assert json.loads(event_result["content"]["text"])["content"] == (
        "current objective"
    )
    assert checkpoint_result["checkpoint_ref"] == host.reference_codec.encode(
        checkpoint.checkpoint_ref
    )
    assert checkpoint_result["coverage"]["ceiling_position"] == len(events)
    assert checkpoint_result["events"][0]["content_ref"].endswith("/event/1")
    assert "owner_chat_id" not in checkpoint_result
    assert str(tmp_path) not in repr(checkpoint_result)


def test_context_capability_rejects_another_host_execution_scope(
    tmp_path: Path,
) -> None:
    first = _factory(tmp_path, owner_chat_id="chat-a", root_run_id="root-a")
    second = _factory(tmp_path, owner_chat_id="chat-b", root_run_id="root-b")
    first.context_module.runtime.bind_context(
        _context(
            execution_id="execution-a",
            generation_id="generation-a",
            attempt_id="attempt-a",
        )
    )
    second.context_module.runtime.bind_context(
        _context(
            execution_id="execution-b",
            generation_id="generation-b",
            attempt_id="attempt-b",
        )
    )
    foreign = second.attempt(
        execution_id="execution-b",
        attempt_id="attempt-b",
    ).bundle.artifacts.persist(
        b"foreign payload",
        media_type="text/plain",
        operation_id="foreign-artifact",
    )

    with pytest.raises(Exception, match="artifact|scope"):
        first.context_capability.read_content(
            ref=foreign.ref,
            offset=0,
            limit=32,
        )


def test_attempts_share_chat_workspace_but_isolate_bundle_lifecycle(
    tmp_path: Path,
) -> None:
    host = _factory(tmp_path)
    first_context = _context(
        execution_id="execution-a",
        generation_id="generation-a",
        attempt_id="attempt-a",
    )
    second_context = _context(
        execution_id="execution-a",
        generation_id="generation-b",
        attempt_id="attempt-b",
    )

    host.context_module.runtime.bind_context(first_context)
    host.context_module.runtime.bind_context(second_context)
    first = host.attempt(execution_id="execution-a", attempt_id="attempt-a")
    second = host.attempt(execution_id="execution-a", attempt_id="attempt-b")

    assert type(first.bundle) is ContextExecutionBundle
    assert type(first.bundle.projector) is CanonicalSemanticEventProjector
    assert type(first.bundle.request_factory) is JournalContextRequestFactory
    assert type(first.bundle.tool_boundary) is DurableToolBoundary
    assert first.bundle is not second.bundle
    assert first.bundle.attempt == AttemptRef(
        GenerationRef("execution-a", "generation-a"),
        "attempt-a",
    )
    assert second.bundle.attempt == AttemptRef(
        GenerationRef("execution-a", "generation-b"),
        "attempt-b",
    )
    assert first.ownership.lifecycle.chat_space_id == host.chat_space_id
    assert second.ownership.lifecycle.chat_space_id == host.chat_space_id
    assert first.ownership.lifecycle.binding_id == host.binding_id
    assert first.ownership.lifecycle.root_run_id == "root-run-a"
    assert second.ownership.lifecycle.root_run_id == "root-run-a"
    assert first.ownership.normal_attachment_factory.workspace is host.workspace
    assert second.ownership.normal_attachment_factory.workspace is host.workspace
    assert first.bound_context_module.runtime.durable_event_sink is (
        first.bundle.durable_event_sink
    )
    assert first.ownership.context_module is first.bound_context_module
    assert first.ownership.artifact_handoff.recorder is first.bundle.handoff_recorder
    assert _row_count(host.database_path, "spaces") == 1
    assert _row_count(host.database_path, "curation_scopes") == 1
    assert _row_count(host.database_path, "pupu_unchain_ownership_bindings") == 2

    first_events = first.bundle.journal.capture_snapshot().events
    second_events = second.bundle.journal.capture_snapshot().events
    assert [event.event_type for event in first_events] == [
        "message.user",
        "message.user",
    ]
    assert second_events == first_events
    assert first_events[0].attempt == first.bundle.attempt
    assert first_events[1].attempt == second.bundle.attempt


def test_full_tool_payload_is_durable_before_host_notification(tmp_path: Path) -> None:
    host = _factory(tmp_path)
    host.context_module.runtime.bind_context(
        _context(
            execution_id="execution-a",
            generation_id="generation-a",
            attempt_id="attempt-a",
        )
    )
    attempt = host.attempt(execution_id="execution-a", attempt_id="attempt-a")
    observed: list[str] = []

    def notified(artifactization):
        artifact = artifactization.artifact
        connection = sqlite3.connect(host.database_path)
        try:
            row = connection.execute(
                """
                SELECT object_sha256, byte_length FROM artifacts
                WHERE execution_id = ? AND artifact_id = ? AND revision = ?
                """,
                (
                    "execution-a",
                    artifact.ref.resource_id,
                    artifact.ref.revision,
                ),
            ).fetchone()
        finally:
            connection.close()
        assert row == (artifact.sha256, artifact.byte_length)
        assert (host.object_directory / artifact.sha256).read_bytes()
        observed.append(artifact.ref.resource_id)
        return artifactization.visible_result

    visible = attempt.persist_tool_outcome_then_notify(
        ToolRuntimeOutcome(tool_result={"payload": "x" * 20_000}),
        operation_id="tool-output-a",
        notify=notified,
    )

    assert observed
    assert visible["full_output_ref"]["kind"] == "artifact"


def test_full_subagent_output_and_parent_receipt_precede_notification(
    tmp_path: Path,
) -> None:
    host = _factory(tmp_path)
    host.context_module.runtime.bind_context(
        _context(
            execution_id="execution-a",
            generation_id="generation-a",
            attempt_id="attempt-a",
        )
    )
    attempt = host.attempt(execution_id="execution-a", attempt_id="attempt-a")
    source = attempt.bundle.journal.capture_snapshot().events[-1]
    source_range = EventRange(
        EventCursor(source.store_seq, source.event_id),
        EventCursor(source.store_seq, source.event_id),
    )
    observed = []

    def notified(receipt):
        snapshot = attempt.bundle.journal.capture_snapshot()
        assert snapshot.events[-1].event_type == "handoff.recorded"
        assert (host.object_directory / receipt.envelope.sha256).is_file()
        observed.append(receipt.envelope.child_run_id)
        return receipt.model_payload

    payload = attempt.record_subagent_result_then_notify(
        SubagentResult(
            mode="subagent",
            agent_name="researcher",
            template_name=None,
            status="completed",
            output="complete child output " + ("y" * 20_000),
            summary="child summary",
        ),
        child_attempt=AttemptRef(
            GenerationRef("child-execution", "child-generation"),
            "child-run",
        ),
        source_event_range=source_range,
        operation_id="handoff-a",
        notify=notified,
    )

    assert observed == ["child-run"]
    assert payload["child_run_id"] == "child-run"
    assert payload["full_output_ref"]["kind"] == "artifact"


def test_persistence_failure_prevents_tool_notification(tmp_path: Path) -> None:
    def rejecting_sanitizer(content: bytes, media_type: str) -> bytes:
        if b"reject-this-output" in content:
            raise OSError("injected persistence redactor failure")
        return _identity_artifact(content, media_type)

    host = _factory(tmp_path, artifact_sanitizer=rejecting_sanitizer)
    host.context_module.runtime.bind_context(
        _context(
            execution_id="execution-a",
            generation_id="generation-a",
            attempt_id="attempt-a",
        )
    )
    attempt = host.attempt(execution_id="execution-a", attempt_id="attempt-a")
    notifications = []

    with pytest.raises(OSError, match="redactor failure"):
        attempt.persist_tool_outcome_then_notify(
            ToolRuntimeOutcome(tool_result={"payload": "reject-this-output"}),
            operation_id="tool-output-failed",
            notify=notifications.append,
        )

    assert notifications == []


def _install_tombstone(database_path: Path, owner_chat_id: str) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.execute(
        """
        CREATE TABLE chat_deletion_tombstones (
            owner_chat_id TEXT PRIMARY KEY,
            revision INTEGER NOT NULL,
            first_operation_id TEXT NOT NULL,
            scope_json BLOB NOT NULL,
            scope_sha256 TEXT NOT NULL,
            result_json BLOB NOT NULL,
            result_sha256 TEXT NOT NULL,
            deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.executescript(
        """
        CREATE TABLE chat_deletion_execution_scopes (
            owner_chat_id TEXT NOT NULL,
            execution_id TEXT NOT NULL UNIQUE,
            PRIMARY KEY(owner_chat_id, execution_id),
            FOREIGN KEY(owner_chat_id)
                REFERENCES chat_deletion_tombstones(owner_chat_id)
        );
        CREATE TABLE chat_deletion_space_scopes (
            owner_chat_id TEXT NOT NULL,
            space_id TEXT NOT NULL UNIQUE,
            PRIMARY KEY(owner_chat_id, space_id),
            FOREIGN KEY(owner_chat_id)
                REFERENCES chat_deletion_tombstones(owner_chat_id)
        );
        CREATE TABLE chat_deletion_binding_scopes (
            owner_chat_id TEXT NOT NULL,
            binding_id TEXT NOT NULL UNIQUE,
            PRIMARY KEY(owner_chat_id, binding_id),
            FOREIGN KEY(owner_chat_id)
                REFERENCES chat_deletion_tombstones(owner_chat_id)
        );
        CREATE TABLE chat_deletion_operations (
            owner_chat_id TEXT NOT NULL,
            operation_id TEXT NOT NULL,
            payload_sha256 TEXT NOT NULL,
            result_sha256 TEXT NOT NULL,
            PRIMARY KEY(owner_chat_id, operation_id),
            FOREIGN KEY(owner_chat_id)
                REFERENCES chat_deletion_tombstones(owner_chat_id)
        );
        """
    )
    scope = {
        "schema": "unchain.chat_deletion_scope.v1",
        "owner_chat_id": owner_chat_id,
        "execution_ids": [],
        "space_ids": [],
        "binding_ids": [],
    }
    receipt = {
        "schema": "unchain.chat_deletion_receipt.v1",
        "owner_chat_id": owner_chat_id,
        "tombstone_revision": 1,
        "deleted_rows": {},
        "pending_unreferenced_scan": True,
    }
    scope_bytes = json.dumps(
        scope,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    receipt_bytes = json.dumps(
        receipt,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    scope_sha256 = hashlib.sha256(scope_bytes).hexdigest()
    receipt_sha256 = hashlib.sha256(receipt_bytes).hexdigest()
    connection.execute(
        """
        INSERT INTO chat_deletion_tombstones(
            owner_chat_id, revision, first_operation_id,
            scope_json, scope_sha256, result_json, result_sha256
        ) VALUES (?, 1, ?, ?, ?, ?, ?)
        """,
        (
            owner_chat_id,
            "delete-chat-a",
            scope_bytes,
            scope_sha256,
            receipt_bytes,
            receipt_sha256,
        ),
    )
    connection.execute(
        """
        INSERT INTO chat_deletion_operations(
            owner_chat_id, operation_id, payload_sha256, result_sha256
        ) VALUES (?, ?, ?, ?)
        """,
        (owner_chat_id, "delete-chat-a", scope_sha256, receipt_sha256),
    )
    connection.commit()
    connection.close()


def test_deleted_owner_fails_before_any_store_or_scope_row_is_created(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "context_v2.sqlite3"
    _install_tombstone(database_path, "chat-a")
    before_size = database_path.stat().st_size
    before = sqlite3.connect(database_path)
    try:
        before_tables = tuple(
            row[0]
            for row in before.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
            )
        )
        before_counts = {
            table_name: before.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[
                0
            ]
            for table_name in before_tables
        }
    finally:
        before.close()

    with pytest.raises(PupuUnchainHostFactoryError, match="deleted"):
        _factory(tmp_path)

    connection = sqlite3.connect(database_path)
    try:
        tables = tuple(
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
            )
        )
        counts = {
            table_name: connection.execute(
                f"SELECT COUNT(*) FROM {table_name}"
            ).fetchone()[0]
            for table_name in tables
        }
    finally:
        connection.close()
    assert tables == before_tables
    assert counts == before_counts
    assert database_path.stat().st_size == before_size
    assert not (tmp_path / "context_v2.owner.json").exists()
    assert not (tmp_path / "objects").exists()
