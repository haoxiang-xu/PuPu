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
    InMemorySessionStore,
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
    ContextCompileRequest,
    ContextCompiler,
    ContextExecutionBundle,
    ContextRuntime,
    DurableToolCompletionEnvelope,
    DurableToolExecutionSubject,
    DurableContextRuntimeFactory,
    HostResolvedCurrentInput,
    SemanticEventProjectionMode,
    resolve_context_budget,
)
from unchain.context_content import encode_context_content_locator
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.context.request_factory import JournalContextRequestFactory
from unchain.context.tool_boundary import DurableToolBoundary
from unchain.journal import (
    AttemptRef,
    EventCursor,
    EventRange,
    GenerationRef,
    ResourceRef,
    journal_event_to_semantic_event,
)
from unchain.journal.runtime import build_operation_ref
from unchain.execution import ExecutionFence, ExecutionRuntime
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.kernel.types import KernelRunResult
from unchain.memory.curator import RunCaptureStatus, SourceRunStatus
from unchain.memory.toolkit.models import MemoryToolkitError
from unchain.memory.curator.host import MemoryAgentWorkerDisposition
from unchain.runtime import AgentRuntimeContext, ExecutionIdentity, ModuleGrant
from unchain.subagents.types import SubagentResult
from unchain.providers import OpenAIModelIO
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


def _canonical_digest(value: object) -> str:
    return hashlib.sha256(
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    ).hexdigest()


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


class _OpenAIResponseStream:
    def __init__(self, response) -> None:
        self._response = response

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def __iter__(self):
        yield SimpleNamespace(type="response.completed", response=self._response)


def _large_search_then_final_model_io(provider_requests: list[dict]):
    outputs_by_turn = [
        [
            {
                "type": "function_call",
                "call_id": "ticket-382-provider-call",
                "name": "large_search",
                "arguments": "{}",
            }
        ],
        [
            {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": "done"}],
            }
        ],
    ]

    class _Responses:
        def create(self, **kwargs):
            provider_requests.append(json.loads(json.dumps(kwargs)))
            response = SimpleNamespace(
                id=f"ticket-382-response-{len(provider_requests)}",
                output=outputs_by_turn.pop(0),
                usage={"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
            )
            return _OpenAIResponseStream(response)

    responses = _Responses()

    class _Client:
        def __init__(self, **_kwargs) -> None:
            self.responses = responses

    return OpenAIModelIO(
        model="gpt-test",
        api_key="test-key",
        client_factory=lambda **_kwargs: _Client(),
        default_payloads={},
        model_capabilities={},
    )


def _context_read_failure_then_final_model_io(
    provider_requests: list[dict],
    *,
    ref: str,
):
    """Make the next provider turn prove a rejected read stays recoverable."""
    outputs_by_turn = [
        [
            {
                "type": "function_call",
                "call_id": "ticket-382-invalid-read",
                "name": "context_content_read",
                "arguments": json.dumps({"ref": ref}),
            }
        ],
        [
            {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": "recovered"}],
            }
        ],
    ]

    class _Responses:
        def create(self, **kwargs):
            provider_requests.append(json.loads(json.dumps(kwargs)))
            response = SimpleNamespace(
                id=f"ticket-382-invalid-read-{len(provider_requests)}",
                output=outputs_by_turn.pop(0),
                usage={"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
            )
            return _OpenAIResponseStream(response)

    responses = _Responses()

    class _Client:
        def __init__(self, **_kwargs) -> None:
            self.responses = responses

    return OpenAIModelIO(
        model="gpt-test",
        api_key="test-key",
        client_factory=lambda **_kwargs: _Client(),
        default_payloads={},
        model_capabilities={},
    )


def _repeated_context_read_failure_then_final_model_io(
    provider_requests: list[dict],
    *,
    ref: str,
):
    """Expose the official reader's third identical failure to the next turn."""
    outputs_by_turn = [
        [
            {
                "type": "function_call",
                "call_id": f"ticket-382-repeat-read-{index}",
                "name": "context_content_read",
                "arguments": json.dumps({"ref": ref}),
            }
        ]
        for index in range(1, 4)
    ] + [
        [
            {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": "stopped"}],
            }
        ]
    ]

    class _Responses:
        def create(self, **kwargs):
            provider_requests.append(json.loads(json.dumps(kwargs)))
            response = SimpleNamespace(
                id=f"ticket-382-repeat-read-{len(provider_requests)}",
                output=outputs_by_turn.pop(0),
                usage={"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
            )
            return _OpenAIResponseStream(response)

    responses = _Responses()

    class _Client:
        def __init__(self, **_kwargs) -> None:
            self.responses = responses

    return OpenAIModelIO(
        model="gpt-test",
        api_key="test-key",
        client_factory=lambda **_kwargs: _Client(),
        default_payloads={},
        model_capabilities={},
    )


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
    generation_resolver=None,
    current_input_resolver=None,
) -> PupuUnchainContextMemoryV2HostFactory:
    return PupuUnchainContextMemoryV2HostFactory(
        owner_chat_id=owner_chat_id,
        root_run_id=root_run_id,
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
        generation_resolver=generation_resolver or _generation,
        current_input_resolver=current_input_resolver or _current_input,
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
    assert host.memory_worker_module.last_receipt is None


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


def test_raw_durable_tool_output_ref_does_not_grant_reader_access(
    tmp_path: Path,
) -> None:
    """A durable raw ref remains non-authorizing outside its model projection."""
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
        )
    )
    attempt = host.attempt(execution_id="execution-a", attempt_id="attempt-a")
    visible = attempt.persist_tool_outcome_then_notify(
        ToolRuntimeOutcome(tool_result={"sentinel": "x" * 20_000}),
        operation_id="ticket-382-large-tool-output",
        notify=lambda artifactization: artifactization.visible_result,
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

    assert visible["full_output_ref"]["kind"] == "artifact"
    with pytest.raises(MemoryToolkitError, match="ref must be text"):
        prepared.toolkit.tools["context_content_read"].func(
            ref=visible["full_output_ref"],
            offset=0,
            limit=1024,
        )


def _persist_large_prepared_tool_result_via_active_runtime(
    host,
    context,
    *,
    output_policy="default",
    tool_result=None,
):
    """Exercise the durable envelope, output manager, and compiler input path."""
    tool_result = tool_result or {
        "sentinel": "ticket-382-sentinel-" + ("x" * 20_000)
    }
    context.event["toolkit"] = Toolkit(
        {
            "large_search": Tool(
                name="large_search",
                description="search",
                func=lambda: tool_result,
                output_policy=output_policy,
            ),
            "context_content_read": Tool(
                name="context_content_read",
                description="read disclosed context content",
                func=lambda **_arguments: (_ for _ in ()).throw(
                    AssertionError("the prepared official reader must serve the page")
                ),
                output_policy="context_page",
            ),
        }
    )
    runtime = host.context_module.runtime
    runtime.bind_context(context)
    runtime.bind_execution_toolkit(context)
    attempt = host.attempt(execution_id="execution-a", attempt_id="attempt-a")
    boundary = attempt.bundle.tool_boundary
    intent = boundary.sink(
        {
            "type": "tool_call",
            "run_id": "attempt-a",
            "iteration": 0,
            "tool_name": "large_search",
            "call_id": "ticket-382-call",
            "arguments": {},
        }
    )
    subject = DurableToolExecutionSubject(
        intent_cursor=intent.cursor,
        original_arguments_sha256=_canonical_digest({}),
        effective_arguments_sha256=_canonical_digest({}),
        approval_state="not_required",
        approval_request_sha256="",
        approval_receipt_sha256="",
        route_kind="normal",
        route_manifest_sha256="1" * 64,
        terminal_handler_manifest_sha256="2" * 64,
        execution_fence=ExecutionFence("execution-a", "ticket-382", 1),
    )
    authorization = boundary.authorize_execution(
        tool_name="large_search",
        call_id="ticket-382-call",
        iteration=0,
        subject=subject,
    )
    artifactization = attempt.bundle.artifacts.artifactize_tool_result(
        tool_result,
        operation_id="ticket-382-prepared-result",
    )
    completion = DurableToolCompletionEnvelope(
        attempt=attempt.bundle.attempt,
        tool_name="large_search",
        call_id="ticket-382-call",
        iteration=0,
        execution_subject=subject,
        execution_subject_sha256=subject.sha256,
        result_artifact=artifactization.artifact,
        visible_result=artifactization.visible_result,
        should_observe=False,
    )
    completion_artifactization = attempt.bundle.artifacts.artifactize_tool_completion(
        completion.to_dict(),
        operation_id="ticket-382-prepared-completion",
    )
    receipt = boundary.persist_prepared_result(
        authorization,
        artifactization=artifactization,
        completion_artifactization=completion_artifactization,
        tool_result_policy=output_policy,
    )
    events = tuple(
        journal_event_to_semantic_event(event)
        for event in attempt.bundle.journal.capture_snapshot().events
    )
    return attempt, receipt, events


def _prepared_context_reader(host):
    builder = AgentBuilder(
        agent=SimpleNamespace(name="normal-agent"),
        spec=AgentSpec(name="normal-agent", provider="openai", model="gpt-test"),
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
    return builder.build().toolkit.tools["context_content_read"].func


@pytest.mark.parametrize("output_policy", ("default", "head_tail", "artifact_only"))
def test_large_durable_result_reaches_native_model_view_with_a_readable_locator(
    tmp_path: Path,
    output_policy: str,
) -> None:
    """The ref emitted in the second provider request must be directly readable."""
    host = _factory(
        tmp_path,
        production_enabled=True,
        memory_agent_enabled=True,
        memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
        generation_resolver=lambda _context, _execution_id: "generation-a",
        current_input_resolver=lambda _context, attempt: HostResolvedCurrentInput(
            attempt=attempt,
            content="search",
        ),
    )
    provider_requests: list[dict] = []
    model_io = _large_search_then_final_model_io(provider_requests)
    toolkit = Toolkit(
        {
            "large_search": Tool(
                name="large_search",
                description="search",
                func=lambda: {
                    "sentinel": "ticket-382-native-sentinel-" + ("x" * 20_000)
                },
                output_policy=output_policy,
            )
        }
    )
    builder = AgentBuilder(
        agent=SimpleNamespace(name="normal-agent"),
        spec=AgentSpec(name="normal-agent", provider="openai", model="gpt-test"),
        state=AgentState(),
        call_context=AgentCallContext(
            mode="run",
            input_messages=[{"role": "user", "content": "search"}],
            session_id="execution-a",
            run_id="attempt-a",
            max_iterations=2,
            max_context_window_tokens=16_384,
            execution_guard=ExecutionRuntime(InMemorySessionStore()).acquire(
                "execution-a"
            ),
            runtime_context=_runtime_context(
                execution_id="execution-a",
                attempt_id="attempt-a",
                run_id="attempt-a",
            ),
        ),
        model_io_registry=ModelIOFactoryRegistry(),
        toolkit=toolkit,
    )
    builder.set_model_io(model_io)
    for module in host.modules_for_active():
        module.configure(builder)
    prepared = builder.build()
    result = prepared.run()

    assert result.status == "completed"
    assert len(provider_requests) == 2

    def find_full_output_ref(value):
        if isinstance(value, dict):
            if "full_output_ref" in value:
                return value["full_output_ref"]
            for nested in value.values():
                found = find_full_output_ref(nested)
                if found is not None:
                    return found
        if isinstance(value, list):
            for nested in value:
                found = find_full_output_ref(nested)
                if found is not None:
                    return found
        if isinstance(value, str) and value.lstrip().startswith(("{", "[")):
            try:
                return find_full_output_ref(json.loads(value))
            except json.JSONDecodeError:
                return None
        return None

    ref = find_full_output_ref(provider_requests[1])
    assert ref is not None
    assert isinstance(ref, str)
    page = prepared.toolkit.tools["context_content_read"].func(
        ref=ref,
        offset=0,
        limit=1024,
    )
    assert "ticket-382-native-sentinel" in page["content"]["text"]


@pytest.mark.parametrize("output_policy", ("default", "head_tail", "artifact_only"))
def test_large_durable_result_reaches_neutral_model_view_with_a_readable_locator(
    tmp_path: Path,
    output_policy: str,
) -> None:
    """#382: each fresh neutral policy must expose an exact readable request."""
    host = _factory(
        tmp_path,
        production_enabled=True,
        memory_agent_enabled=True,
        memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
    )
    context = _context(
        execution_id="execution-a",
        generation_id="generation-a",
        attempt_id="attempt-a",
    )
    attempt, receipt, events = _persist_large_prepared_tool_result_via_active_runtime(
        host,
        context,
        output_policy=output_policy,
    )
    events_before_compile = json.dumps(events, sort_keys=True)
    result_event = next(event for event in events if event["type"] == "tool_result")
    compiled = ContextCompiler().compile(
        ContextCompileRequest(
            case="ticket-382",
            source_messages=({"role": "user", "content": "search"},),
            current_generation="generation-a",
            semantic_events=events,
            pending_task_inputs=(
                {
                    "event_id": result_event["event_id"],
                    "store_seq": result_event["store_seq"],
                    "type": "tool_result",
                    "preview": "large durable result",
                    "preview_truncated": True,
                    "content_ref": result_event["full_output_ref"],
                    "content_bytes": result_event["result_bytes"],
                    "content_sha256": result_event["result_sha256"],
                },
            ),
            budget=resolve_context_budget(context_window_tokens=16_384),
            provider="openai",
            model="gpt-test",
            build_id="ticket-382-build",
            execution_id="execution-a",
            generation_id="generation-a",
            attempt_id="attempt-a",
        )
    )

    history_message = next(
        message["content"]
        for message in compiled.to_dict()["messages"]
        if "MEMORY_V2_UNTRUSTED_HISTORY" in str(message.get("content") or "")
    )
    history = json.loads(history_message.split("\n", 2)[2])
    exchange = history["tool_exchanges"][0]
    ref = exchange["full_output_ref"]
    assert isinstance(ref, str)
    read_request = exchange["result"]["read_request"]
    expected_projection = {
        "default": "paged",
        "head_tail": "head_tail",
        "artifact_only": "artifact_only",
    }[output_policy]
    assert exchange["result"]["projection"] == expected_projection
    assert read_request == {
        "tool": "context_content_read",
        "arguments": {"ref": ref, "offset": 0, "limit": 8192},
    }
    page = _prepared_context_reader(host)(**read_request["arguments"])
    assert "ticket-382-sentinel" in page["content"]["text"]
    assert result_event["full_output_ref"]["kind"] == "artifact"
    assert json.dumps(events, sort_keys=True) == events_before_compile
    assert attempt.bundle.tool_output_manager.active is True


def test_default_output_between_source_and_presentation_limits_keeps_read_request(
    tmp_path: Path,
) -> None:
    """#382: bounded neutral fallback keeps its initial durable read operation."""
    host = _factory(
        tmp_path,
        production_enabled=True,
        memory_agent_enabled=True,
        memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
    )
    context = _context(
        execution_id="execution-a",
        generation_id="generation-a",
        attempt_id="attempt-a",
    )
    source = {"sentinel": "ticket-382-boundary-" + ("x" * 13_000)}
    attempt, receipt, events = _persist_large_prepared_tool_result_via_active_runtime(
        host,
        context,
        tool_result=source,
    )
    result_event = next(event for event in events if event["type"] == "tool_result")
    compiled = ContextCompiler().compile(
        ContextCompileRequest(
            case="ticket-382-boundary",
            source_messages=({"role": "user", "content": "search"},),
            current_generation="generation-a",
            semantic_events=events,
            pending_task_inputs=(
                {
                    "event_id": result_event["event_id"],
                    "store_seq": result_event["store_seq"],
                    "type": "tool_result",
                    "preview": "large durable result",
                    "preview_truncated": True,
                    "content_ref": result_event["full_output_ref"],
                    "content_bytes": result_event["result_bytes"],
                    "content_sha256": result_event["result_sha256"],
                },
            ),
            budget=resolve_context_budget(context_window_tokens=16_384),
            provider="openai",
            model="gpt-test",
            build_id="ticket-382-build",
            execution_id="execution-a",
            generation_id="generation-a",
            attempt_id="attempt-a",
        )
    )

    history_message = next(
        message["content"]
        for message in compiled.to_dict()["messages"]
        if "MEMORY_V2_UNTRUSTED_HISTORY" in str(message.get("content") or "")
    )
    exchange = json.loads(history_message.split("\n", 2)[2])["tool_exchanges"][0]
    ref = exchange["full_output_ref"]
    assert exchange["result"]["projection"] == "default"
    assert exchange["result"]["inline"] is False
    assert exchange["result"]["truncated"] is True
    assert exchange["result"]["read_request"] == {
        "tool": "context_content_read",
        "arguments": {"ref": ref, "offset": 0, "limit": 8192},
    }
    page = _prepared_context_reader(host)(**exchange["result"]["read_request"]["arguments"])
    serialized_source = json.dumps(
        source, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    assert page["content"]["text"] == serialized_source[: page["page_bytes"]]
    assert page["total_bytes"] == len(serialized_source.encode("utf-8"))
    assert page["eof"] is False
    assert page["next_read"]["arguments"]["offset"] == page["page_bytes"]
    assert ref == encode_context_content_locator(receipt.artifact.ref)


@pytest.mark.parametrize(
    "ref",
    (
        "bare-id",
        encode_context_content_locator(
            ResourceRef("artifact", "ticket-382-undisclosed", 1)
        ),
    ),
)
def test_context_content_read_failure_reaches_the_next_provider_request(
    tmp_path: Path,
    ref: str,
) -> None:
    host = _factory(
        tmp_path,
        production_enabled=True,
        memory_agent_enabled=True,
        memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
        generation_resolver=lambda _context, _execution_id: "generation-a",
        current_input_resolver=lambda _context, attempt: HostResolvedCurrentInput(
            attempt=attempt,
            content="read",
        ),
    )
    provider_requests: list[dict] = []
    builder = AgentBuilder(
        agent=SimpleNamespace(name="normal-agent"),
        spec=AgentSpec(name="normal-agent", provider="openai", model="gpt-test"),
        state=AgentState(),
        call_context=AgentCallContext(
            mode="run",
            input_messages=[{"role": "user", "content": "read"}],
            session_id="execution-a",
            run_id="attempt-a",
            max_iterations=2,
            max_context_window_tokens=16_384,
            execution_guard=ExecutionRuntime(InMemorySessionStore()).acquire(
                "execution-a"
            ),
            runtime_context=_runtime_context(
                execution_id="execution-a",
                attempt_id="attempt-a",
                run_id="attempt-a",
            ),
        ),
        model_io_registry=ModelIOFactoryRegistry(),
    )
    builder.set_model_io(_context_read_failure_then_final_model_io(provider_requests, ref=ref))
    for module in host.modules_for_active():
        module.configure(builder)
    result = builder.build().run()

    assert result.status == "completed"
    assert len(provider_requests) == 2
    response_output = next(
        item["output"]
        for item in provider_requests[1]["input"]
        if item.get("type") == "function_call_output"
    )
    assert json.loads(response_output) == {
        "schema_version": "unchain.context_content_error.v1",
        "trust": "UNTRUSTED_DATA",
        "code": "CONTEXT_CONTENT_READ_FAILED",
    }


def test_context_content_read_no_progress_reaches_the_next_provider_request(
    tmp_path: Path,
) -> None:
    host = _factory(
        tmp_path,
        production_enabled=True,
        memory_agent_enabled=True,
        memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
        generation_resolver=lambda _context, _execution_id: "generation-a",
        current_input_resolver=lambda _context, attempt: HostResolvedCurrentInput(
            attempt=attempt,
            content="read",
        ),
    )
    provider_requests: list[dict] = []
    builder = AgentBuilder(
        agent=SimpleNamespace(name="normal-agent"),
        spec=AgentSpec(name="normal-agent", provider="openai", model="gpt-test"),
        state=AgentState(),
        call_context=AgentCallContext(
            mode="run",
            input_messages=[{"role": "user", "content": "read"}],
            session_id="execution-a",
            run_id="attempt-a",
            max_iterations=4,
            max_context_window_tokens=16_384,
            execution_guard=ExecutionRuntime(InMemorySessionStore()).acquire(
                "execution-a"
            ),
            runtime_context=_runtime_context(
                execution_id="execution-a",
                attempt_id="attempt-a",
                run_id="attempt-a",
            ),
        ),
        model_io_registry=ModelIOFactoryRegistry(),
    )
    builder.set_model_io(
        _repeated_context_read_failure_then_final_model_io(
            provider_requests,
            ref=encode_context_content_locator(
                ResourceRef("artifact", "ticket-382-undisclosed", 1)
            ),
        )
    )
    for module in host.modules_for_active():
        module.configure(builder)

    result = builder.build().run()

    assert result.status == "completed"
    assert len(provider_requests) == 4
    response_output = next(
        item["output"]
        for item in provider_requests[3]["input"]
        if item.get("type") == "function_call_output"
    )
    assert json.loads(response_output) == {
        "schema_version": "unchain.context_content_error.v1",
        "trust": "UNTRUSTED_DATA",
        "code": "CONTEXT_READ_NO_PROGRESS",
    }


def test_large_context_read_page_survives_next_compiled_model_request(
    tmp_path: Path,
) -> None:
    """#382 baseline: a successful read must not become another retrieval hop."""
    host = _factory(
        tmp_path,
        production_enabled=True,
        memory_agent_enabled=True,
        memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
    )
    context = _context(
        execution_id="execution-a",
        generation_id="generation-a",
        attempt_id="attempt-a",
    )
    attempt, receipt, _events = _persist_large_prepared_tool_result_via_active_runtime(
        host,
        context,
    )
    page = _prepared_context_reader(host)(
        ref=host.reference_codec.encode(receipt.artifact.ref),
        offset=0,
        limit=8 * 1024,
    )
    assert "ticket-382-sentinel" in page["content"]["text"]

    boundary = attempt.bundle.tool_boundary
    intent = boundary.sink(
        {
            "type": "tool_call",
            "run_id": "attempt-a",
            "iteration": 1,
            "tool_name": "context_content_read",
            "call_id": "ticket-382-read-call",
            "arguments": {
                "ref": page["ref"],
                "offset": 0,
                "limit": 8 * 1024,
            },
        }
    )
    subject = DurableToolExecutionSubject(
        intent_cursor=intent.cursor,
        original_arguments_sha256=_canonical_digest(
            {"ref": page["ref"], "offset": 0, "limit": 8 * 1024}
        ),
        effective_arguments_sha256=_canonical_digest(
            {"ref": page["ref"], "offset": 0, "limit": 8 * 1024}
        ),
        approval_state="not_required",
        approval_request_sha256="",
        approval_receipt_sha256="",
        route_kind="normal",
        route_manifest_sha256="3" * 64,
        terminal_handler_manifest_sha256="4" * 64,
        execution_fence=ExecutionFence("execution-a", "ticket-382-read", 1),
    )
    authorization = boundary.authorize_execution(
        tool_name="context_content_read",
        call_id="ticket-382-read-call",
        iteration=1,
        subject=subject,
    )
    artifactization = attempt.bundle.artifacts.artifactize_tool_result(
        page,
        operation_id="ticket-382-read-page-result",
    )
    completion = DurableToolCompletionEnvelope(
        attempt=attempt.bundle.attempt,
        tool_name="context_content_read",
        call_id="ticket-382-read-call",
        iteration=1,
        execution_subject=subject,
        execution_subject_sha256=subject.sha256,
        result_artifact=artifactization.artifact,
        visible_result=artifactization.visible_result,
        should_observe=False,
    )
    completion_artifactization = attempt.bundle.artifacts.artifactize_tool_completion(
        completion.to_dict(),
        operation_id="ticket-382-read-page-completion",
    )
    read_receipt = boundary.persist_prepared_result(
        authorization,
        artifactization=artifactization,
        completion_artifactization=completion_artifactization,
        tool_result_policy="context_page",
    )
    model_view = host.context_module.runtime.project_tool_result_for_model(
        context,
        read_receipt,
    )
    assert model_view == page
    assert "ticket-382-sentinel" in model_view["content"]["text"]
    assert "full_output_ref" not in model_view

    events = tuple(
        journal_event_to_semantic_event(event)
        for event in attempt.bundle.journal.capture_snapshot().events
    )
    read_event = next(
        event
        for event in events
        if event["type"] == "tool_result"
        and event["call_id"] == "ticket-382-read-call"
    )
    compiled = ContextCompiler().compile(
        ContextCompileRequest(
            case="ticket-382-read-page",
            source_messages=({"role": "user", "content": "read"},),
            current_generation="generation-a",
            semantic_events=events,
            pending_task_inputs=(
                {
                    "event_id": read_event["event_id"],
                    "store_seq": read_event["store_seq"],
                    "type": "tool_result",
                    "preview": "context content page",
                    "preview_truncated": True,
                    "content_ref": read_event["full_output_ref"],
                    "content_bytes": read_event["result_bytes"],
                    "content_sha256": read_event["result_sha256"],
                },
            ),
            budget=resolve_context_budget(context_window_tokens=16_384),
            provider="openai",
            model="gpt-test",
            build_id="ticket-382-read-page-build",
            execution_id="execution-a",
            generation_id="generation-a",
            attempt_id="attempt-a",
        )
    )
    history_message = next(
        message["content"]
        for message in compiled.to_dict()["messages"]
        if "MEMORY_V2_UNTRUSTED_HISTORY" in str(message.get("content") or "")
    )
    history = json.loads(history_message.split("\n", 2)[2])
    read_exchange = next(
        exchange
        for exchange in history["tool_exchanges"]
        if exchange["call_id"] == "ticket-382-read-call"
    )
    assert read_exchange["result"] == page
    assert "full_output_ref" not in read_exchange
    assert isinstance(read_event["full_output_ref"], dict)


def test_small_context_content_page_is_directly_readable_and_keeps_its_body(
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
        )
    )
    attempt = host.attempt(execution_id="execution-a", attempt_id="attempt-a")
    artifact = attempt.bundle.artifacts.persist(
        b"ticket-382-small",
        media_type="text/plain",
        operation_id="ticket-382-small-context-content",
    )

    page = _prepared_context_reader(host)(
        ref=host.reference_codec.encode(artifact.ref),
        offset=0,
        limit=1024,
    )

    assert page["content"]["encoding"] == "utf-8"
    assert "ticket-382-small" in page["content"]["text"]


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
