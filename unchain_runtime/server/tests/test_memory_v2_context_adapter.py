from __future__ import annotations

import hashlib
import json
from types import SimpleNamespace

import pytest

from context_memory_v2_repository import (
    PupuContextMemoryV2Repository,
    PupuExecutionScope,
)
from memory_v2_context import MemoryV2Admission
from memory_v2_context_adapter import bind_pupu_context_module
from memory_v2_store import MemoryV2Store
from memory_v2_workspace_adapter import bind_pupu_memory_workspace_service
from unchain.agent import AgentBuilder, AgentCallContext, AgentSpec, AgentState
from unchain.agent.model_io import ModelIOFactoryRegistry
from unchain.agent.modules import ContextModule
from unchain.context import ContextBuildUnavailableError
from unchain.journal import (
    AttemptRef,
    GenerationRef,
    OperationRef,
    SemanticEventDraft,
)
from unchain.kernel import ModelTurnResult


class _FinalModelIO:
    provider = "openai"
    model = "gpt-test"

    def fetch_turn(self, request):
        del request
        return ModelTurnResult(
            assistant_messages=[{"role": "assistant", "content": "done"}],
            tool_calls=[],
            final_text="done",
        )


def _admission() -> MemoryV2Admission:
    return MemoryV2Admission(
        requested_mode="all",
        effective_rollout_mode="all",
        mode="active",
        reason="test",
        provider="openai",
        model="gpt-test",
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-a",
        source_attempt_id="attempt-a",
        real_context_window_tokens=16_384,
        output_reserve_tokens=2_048,
        transport_margin_tokens=512,
        available_input_tokens=13_824,
        compression_threshold_tokens=12_441,
        declared_context_window_tokens=16_384,
        context_window_source="provider_capability",
    )


@pytest.fixture()
def context_host(tmp_path):
    store = MemoryV2Store(tmp_path / "memory_v2")
    seed = store.bootstrap_current_request(
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-a",
        message={"role": "user", "content": "initial objective"},
        operation_id="seed-event",
    )
    scope = PupuExecutionScope(
        owner_chat_id="chat-a",
        session_id="session-a",
        generation_id=seed["generation_id"],
        attempt_id="attempt-a",
    )
    host = PupuContextMemoryV2Repository(store)
    execution = host.bind_execution(scope)
    workspace = host.ensure_chat_workspace(
        owner_chat_id=scope.owner_chat_id,
        name="Chat Memory",
        description="Context reference authority",
        operation=OperationRef(
            "context-host-workspace",
            hashlib.sha256(b"context-host-workspace").hexdigest(),
        ),
    )
    workspace_binding = bind_pupu_memory_workspace_service(
        workspace,
        binding_id="context-host-references",
        execution=execution,
    )
    attempt = AttemptRef(
        GenerationRef(scope.session_id, scope.generation_id),
        scope.attempt_id,
    )
    partials = []

    def projector(event):
        if event.get("persist") is False:
            return None
        return SemanticEventDraft(
            event_id=event["event_id"],
            event_type=event["type"],
            attempt=attempt,
            operation_id=event.get("operation_id", f"operation-{event['event_id']}"),
            payload=event.get("payload", {}),
            resource_refs=event.get("resource_refs", ()),
        )

    binding = bind_pupu_context_module(
        admission=_admission(),
        execution=execution,
        reference_authorizer=workspace_binding.references,
        task_state_binding_id="context-host-a",
        event_projector=projector,
        partial_attempt_sink=lambda boundary, source, error: partials.append(
            (boundary, source, error)
        ),
        provider_window_resolver=lambda provider, model: (
            32_768 if (provider, model) == ("openai", "gpt-test") else 0
        ),
        fixed_overhead_estimator=lambda context: 37,
    )
    try:
        yield store, scope, execution, binding, partials
    finally:
        store.close()


def _builder(module: ContextModule, *, mode: str) -> AgentBuilder:
    builder = AgentBuilder(
        agent=SimpleNamespace(name=f"{mode}-agent"),
        spec=AgentSpec(name=f"{mode}-agent", provider="openai", model="gpt-test"),
        state=AgentState(),
        call_context=AgentCallContext(
            mode=mode,
            input_messages=[{"role": "user", "content": mode}],
            session_id="session-a",
            run_id="attempt-a",
            max_iterations=1,
        ),
        model_io_registry=ModelIOFactoryRegistry(),
    )
    builder.set_model_io(_FinalModelIO())
    module.configure(builder)
    return builder


def test_one_bound_context_module_constructs_every_agent_run_shape(context_host):
    _store, scope, execution, binding, _partials = context_host

    prepared_by_shape = {
        "normal": _builder(binding.module, mode="run").build(),
        "graph": _builder(binding.module, mode="graph").build(),
        "resume": _builder(binding.module, mode="resume").build(),
        "subagent": _builder(binding.module, mode="subagent").build(),
    }

    assert isinstance(binding.module, ContextModule)
    assert set(prepared_by_shape) == {"normal", "graph", "resume", "subagent"}
    assert all(
        prepared.context_runtime is binding.runtime
        for prepared in prepared_by_shape.values()
    )
    assert binding.coordinator is binding.runtime.compiler
    assert binding.execution is execution
    assert binding.execution.scope == scope


def test_request_factory_uses_bound_journal_task_state_and_provider_budget(context_host):
    _store, scope, _execution, binding, _partials = context_host
    prepared = _builder(binding.module, mode="normal").build()
    state = prepared.loop.seed_state(
        [{"role": "user", "content": "current request"}],
        provider="openai",
        model="gpt-test",
        session_id=scope.session_id,
        max_context_window_tokens=0,
    )
    harness_context = SimpleNamespace(
        state=state,
        event={"run_id": scope.attempt_id, "execution_path": "normal"},
        latest_messages=state.latest_messages,
    )

    request = binding.runtime.request_factory(harness_context)

    assert request.execution_id == scope.session_id
    assert request.generation_id == scope.generation_id
    assert request.attempt_id == scope.attempt_id
    assert request.provider == "openai"
    assert request.model == "gpt-test"
    assert request.budget.context_window_tokens == 32_768
    assert request.fixed_overhead_tokens == 37
    assert request.task_state is not None
    assert request.semantic_events[0]["type"] == "message.user"
    assert len(request.source_message_cursors) == 1
    cursor = request.source_message_cursors[0]
    assert cursor.message_index == 0
    assert cursor.event_id.startswith("context-input-")
    assert request.source_messages[0] == {
        "role": "user",
        "content": "current request",
    }


def test_durable_event_is_visible_in_storage_before_host_callback(context_host):
    _store, _scope, execution, binding, _partials = context_host
    observed = []

    def host_callback(event):
        persisted_ids = [
            record.event_id for record in execution.journal.read(limit=100).events
        ]
        observed.append((event["event_id"], persisted_ids))

    callback = binding.runtime.compose_event_callback(host_callback)
    callback(
        {
            "type": "run_started",
            "event_id": "event-run-started",
            "operation_id": "operation-run-started",
            "attempt_id": "attempt-a",
            "payload": {"run_id": "attempt-a"},
        }
    )

    assert observed[0][0] == "event-run-started"
    assert observed[0][1][-1] == "event-run-started"


def test_durable_sink_failure_marks_partial_and_blocks_host(
    context_host,
    monkeypatch,
):
    _store, _scope, execution, binding, partials = context_host
    failure = RuntimeError("journal unavailable")
    host_events = []

    def fail_append(*, request):
        del request
        raise failure

    monkeypatch.setattr(execution.journal, "append", fail_append)
    callback = binding.runtime.compose_event_callback(host_events.append)
    event = {
        "type": "run_started",
        "event_id": "event-failed",
        "operation_id": "operation-failed",
        "attempt_id": "attempt-a",
        "payload": {"run_id": "attempt-a"},
    }

    with pytest.raises(RuntimeError) as raised:
        callback(event)

    assert raised.value is failure
    assert host_events == []
    assert len(partials) == 1
    boundary, source, error = partials[0]
    assert boundary == "journal"
    assert source == event
    assert error is failure
    assert binding.admission.diagnostics()["journal_status"] == "partial"


def test_ref_translation_does_not_reinterpret_ordinary_message_content(context_host):
    _store, scope, _execution, binding, _partials = context_host
    callback = binding.runtime.compose_event_callback(None)
    literal = {"uri": "pupu://artifact/literal-reference@1"}
    callback(
        {
            "type": "message.user",
            "event_id": "event-literal-ref",
            "operation_id": "operation-literal-ref",
            "attempt_id": scope.attempt_id,
            "payload": {
                "message": {"role": "user", "content": literal},
            },
        }
    )
    prepared = _builder(binding.module, mode="normal").build()
    state = prepared.loop.seed_state(
        [{"role": "user", "content": "continue"}],
        provider="openai",
        model="gpt-test",
        session_id=scope.session_id,
        max_context_window_tokens=32_768,
    )
    request = binding.runtime.request_factory(
        SimpleNamespace(
            state=state,
            event={"run_id": scope.attempt_id, "execution_path": "normal"},
            latest_messages=state.latest_messages,
        )
    )

    event = next(
        item
        for item in request.semantic_events
        if item["event_id"] == "event-literal-ref"
    )
    assert event["message"]["content"] == literal


def test_pressure_uses_exact_message_cursor_and_persists_checkpoint(context_host):
    _store, scope, execution, binding, partials = context_host
    old_message = {"role": "user", "content": "old " + ("x" * 30_000)}
    callback = binding.runtime.compose_event_callback(None)
    callback(
        {
            "type": "message.user",
            "event_id": "event-large-history",
            "operation_id": "operation-large-history",
            "attempt_id": scope.attempt_id,
            "payload": {"message": old_message},
        }
    )
    prepared = _builder(binding.module, mode="normal").build()
    state = prepared.loop.seed_state(
        [old_message, {"role": "user", "content": "current request"}],
        provider="openai",
        model="gpt-test",
        session_id=scope.session_id,
        max_context_window_tokens=8_192,
    )
    harness_context = SimpleNamespace(
        state=state,
        event={"run_id": scope.attempt_id, "execution_path": "normal"},
        latest_messages=state.latest_messages,
    )

    request = binding.runtime.request_factory(harness_context)
    result = binding.runtime.compile_context(harness_context)

    assert len(request.source_message_cursors) == 1
    cursor = request.source_message_cursors[0]
    assert cursor.message_index == 0
    assert cursor.event_id.startswith("context-input-")
    assert request.source_messages[0]["content"] == "current request"
    old_receipt = next(
        event
        for event in request.semantic_events
        if event["event_id"] == "event-large-history"
    )
    assert old_receipt["store_seq"] < cursor.store_seq
    assert result.checkpoint_requests == ()
    assert len(result.envelope.checkpoint_refs) == 1
    assert result.diagnostics["compacted"] is True
    assert execution.checkpoints.read(
        ref=result.envelope.checkpoint_refs[0],
        limit=64 * 1024,
    )
    assert partials == []


def test_duplicate_message_content_is_not_assigned_ambiguous_provenance(context_host):
    _store, scope, _execution, binding, _partials = context_host
    repeated = {"role": "user", "content": "same words"}
    callback = binding.runtime.compose_event_callback(None)
    for suffix in ("one", "two"):
        callback(
            {
                "type": "message.user",
                "event_id": f"event-duplicate-{suffix}",
                "operation_id": f"operation-duplicate-{suffix}",
                "attempt_id": scope.attempt_id,
                "payload": {"message": repeated},
            }
        )
    prepared = _builder(binding.module, mode="normal").build()
    state = prepared.loop.seed_state(
        [repeated],
        provider="openai",
        model="gpt-test",
        session_id=scope.session_id,
        max_context_window_tokens=32_768,
    )
    request = binding.runtime.request_factory(
        SimpleNamespace(
            state=state,
            event={"run_id": scope.attempt_id, "execution_path": "normal"},
            latest_messages=state.latest_messages,
        )
    )

    assert len(request.source_message_cursors) == 1
    cursor = request.source_message_cursors[0]
    assert cursor.message_index == 0
    assert cursor.event_id == "event-duplicate-two"
    assert cursor.store_seq == 3


def test_compiler_recovers_a_complete_tool_pair_from_the_bound_journal(context_host):
    _store, scope, execution, binding, partials = context_host
    content = b'{"answer": 42}'
    artifact = execution.artifacts.put(
        content=content,
        media_type="application/json",
        operation=OperationRef(
            "artifact-tool-result",
            hashlib.sha256(content).hexdigest(),
        ),
        preview="answer 42",
    )
    callback = binding.runtime.compose_event_callback(None)
    callback(
        {
            "type": "tool_call",
            "event_id": "event-tool-call",
            "operation_id": "operation-tool-call",
            "attempt_id": scope.attempt_id,
            "payload": {
                "call_id": "call-1",
                "tool_name": "lookup",
                "arguments": {"query": "answer"},
            },
        }
    )
    callback(
        {
            "type": "tool_result",
            "event_id": "event-tool-result",
            "operation_id": "operation-tool-result",
            "attempt_id": scope.attempt_id,
            "payload": {
                "call_id": "call-1",
                "tool_name": "lookup",
                "result": {"answer": 42},
                "result_bytes": len(content),
                "result_sha256": hashlib.sha256(content).hexdigest(),
                "full_output_ref": artifact.ref.to_dict(),
            },
            "resource_refs": (artifact.ref,),
        }
    )
    prepared = _builder(binding.module, mode="normal").build()
    state = prepared.loop.seed_state(
        [{"role": "user", "content": "use the tool result"}],
        provider="openai",
        model="gpt-test",
        session_id=scope.session_id,
        max_context_window_tokens=32_768,
    )
    harness_context = SimpleNamespace(
        state=state,
        event={"run_id": scope.attempt_id, "execution_path": "normal"},
        latest_messages=state.latest_messages,
    )

    result = binding.runtime.compile_context(harness_context)

    serialized = json.dumps(result.to_dict()["messages"], sort_keys=True)
    assert "call-1" in serialized
    assert "lookup" in serialized
    assert "answer" in serialized
    assert "unfinished_tool_pairs" not in serialized
    assert result.diagnostics["atomic_call_ids"] == ()
    assert result.envelope is not None
    assert result.envelope.execution_id == scope.session_id
    assert partials == []
    assert execution.context_builds.latest(
        generation_id=scope.generation_id
    ) == result.envelope


def test_binding_rejects_an_admission_for_a_different_chat(context_host):
    _store, _scope, execution, binding, _partials = context_host
    foreign = _admission()
    foreign.owner_chat_id = "chat-other"

    with pytest.raises(ValueError, match="admission.*execution"):
        bind_pupu_context_module(
            admission=foreign,
            execution=execution,
            reference_authorizer=binding.reference_authorizer,
            task_state_binding_id="context-host-foreign",
            event_projector=binding.event_projector,
            partial_attempt_sink=lambda boundary, source, error: None,
        )


def _seed_legacy_task_state_overflow(store):
    with store._write() as connection:
        row = connection.execute(
            "SELECT pinned_state_id, state_json FROM pinned_task_state "
            "WHERE owner_chat_id='chat-a'"
        ).fetchone()
        assert row is not None
        state = json.loads(row["state_json"])
        state["objective"] = "classified legacy objective"
        state["constraints"] = [
            f"classified legacy constraint {index}" for index in range(257)
        ]
        connection.execute(
            "UPDATE pinned_task_state SET state_json=? WHERE pinned_state_id=?",
            (
                json.dumps(
                    state,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ),
                row["pinned_state_id"],
            ),
        )


def _task_state_storage_snapshot(store):
    with store._read() as connection:
        row = connection.execute(
            "SELECT state_json, source_event_ids_json, revision, "
            "covered_through_store_seq, updated_at_ms FROM pinned_task_state "
            "WHERE owner_chat_id='chat-a'"
        ).fetchone()
    assert row is not None
    return tuple(row)


def _harness_context_for(scope):
    prepared = _builder(
        SimpleNamespace(configure=lambda builder: None),
        mode="normal",
    ).build()
    state = prepared.loop.seed_state(
        [{"role": "user", "content": "continue"}],
        provider="openai",
        model="gpt-test",
        session_id=scope.session_id,
        max_context_window_tokens=32_768,
    )
    return SimpleNamespace(
        state=state,
        event={"run_id": scope.attempt_id, "execution_path": "normal"},
        latest_messages=state.latest_messages,
    )


def test_legacy_task_state_overflow_returns_only_a_typed_content_free_marker(
    context_host,
):
    store, scope, _execution, binding, _partials = context_host
    _seed_legacy_task_state_overflow(store)
    before = _task_state_storage_snapshot(store)

    request = binding.runtime.request_factory(_harness_context_for(scope))

    assert request.task_state is None
    assert request.capture_quality == "unavailable"
    assert request.task_state_unavailable is not None
    assert request.task_state_unavailable.state_ref.kind == "task_state"
    assert request.task_state_unavailable.state_ref.revision == 1
    assert request.task_state_unavailable.item_count == 257
    assert request.task_state_unavailable.content_bytes > 0
    assert request.task_state_unavailable.reason == "task_state_limits_exceeded"
    serialized = json.dumps(request.to_dict(), sort_keys=True)
    assert "classified legacy objective" not in serialized
    assert "classified legacy constraint" not in serialized
    assert _task_state_storage_snapshot(store) == before


def test_unavailable_task_state_build_is_durable_idempotent_and_blocks_model(
    context_host,
):
    store, scope, execution, binding, partials = context_host
    _seed_legacy_task_state_overflow(store)
    state_before = _task_state_storage_snapshot(store)
    harness_context = _harness_context_for(scope)

    for _ in range(2):
        with pytest.raises(ContextBuildUnavailableError):
            binding.runtime.compile_context(harness_context)

    with store._read() as connection:
        build_count = connection.execute(
            "SELECT COUNT(*) AS count FROM context_builds WHERE owner_chat_id='chat-a'"
        ).fetchone()["count"]
        build_event_count = connection.execute(
            "SELECT COUNT(*) AS count FROM events WHERE owner_chat_id='chat-a' "
            "AND event_type='context.build'"
        ).fetchone()["count"]
        context_json = connection.execute(
            "SELECT context_json FROM context_builds WHERE owner_chat_id='chat-a'"
        ).fetchone()["context_json"]

    assert build_count == 1
    assert build_event_count == 1
    assert json.loads(context_json)["status"] == "unavailable"
    assert "classified legacy objective" not in context_json
    assert "classified legacy constraint" not in context_json
    assert execution.context_builds.latest(
        generation_id=scope.generation_id
    ).status.value == "unavailable"
    assert _task_state_storage_snapshot(store) == state_before
    assert partials == []


def test_business_events_still_change_context_build_identity(context_host):
    _store, scope, _execution, binding, _partials = context_host
    _seed_legacy_task_state_overflow(_store)
    harness_context = _harness_context_for(scope)
    before = binding.runtime.request_factory(harness_context)

    binding.runtime.compose_event_callback(None)(
        {
            "type": "business_state_changed",
            "event_id": "event-business-state-changed",
            "operation_id": "operation-business-state-changed",
            "attempt_id": scope.attempt_id,
            "payload": {"change_id": "business-change-1"},
        }
    )
    after = binding.runtime.request_factory(harness_context)

    assert after.build_id != before.build_id
    assert any(
        event["type"] == "business_state_changed"
        for event in after.semantic_events
    )


def test_context_build_label_without_exact_compiler_operation_is_not_filtered(
    context_host,
):
    store, scope, _execution, binding, _partials = context_host
    _seed_legacy_task_state_overflow(store)
    harness_context = _harness_context_for(scope)
    before = binding.runtime.request_factory(harness_context)

    binding.runtime.compose_event_callback(None)(
        {
            "type": "context.build",
            "event_id": "event-noncompiler-context-build",
            "operation_id": "context-build.noncompiler-build",
            "attempt_id": scope.attempt_id,
            "payload": {"build_id": "noncompiler-build"},
        }
    )
    after = binding.runtime.request_factory(harness_context)

    assert after.build_id != before.build_id
    assert any(
        event["event_id"] == "event-noncompiler-context-build"
        for event in after.semantic_events
    )
