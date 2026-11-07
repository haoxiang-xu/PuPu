"""#448: persisted tool evidence stays readable after bounded projection.

These are deterministic production-factory/HTTP boundary tests. They never
invoke a model or claim desktop/provider acceptance.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from types import SimpleNamespace

import pytest

from test_memory_v2_unchain_runtime_factory import (
    _NeverRunOfficialMemoryAgent,
    _OpenAIResponseStream,
    _canonical_digest,
    _context,
    _factory,
    _prepared_context_reader,
    _runtime_context,
)
from test_chat_stream_v4 import _parse_sse_blocks
from unchain.context import (
    ContextBudgetExceededError,
    ContextCompileRequest,
    ContextCompiler,
    DurableToolCompletionEnvelope,
    DurableToolExecutionSubject,
    HostResolvedCurrentInput,
    resolve_context_budget,
)
from unchain.context_content import (
    decode_context_content_locator,
    encode_context_content_locator,
)
from unchain.agent import AgentBuilder, AgentCallContext, AgentSpec, AgentState
from unchain.agent.model_io import ModelIOFactoryRegistry
from unchain.execution import ExecutionFence
from unchain.execution import ExecutionRuntime
from unchain.journal import ResourceRef, journal_event_to_semantic_event
from unchain.memory.toolkit.models import MemoryToolkitError
from unchain.memory import InMemorySessionStore
from unchain.providers import OpenAIModelIO
from unchain.tools.tool import Tool
from unchain.tools.toolkit import Toolkit


_GOAL = "Fix poker handlePlayerAction and handleRaise without skipping players."
_PROGRESS = "Inspected game-manager.js and ui-controller.js; action ordering confirmed."
_NEXT_STEP = "Add regression coverage before changing advanceToNextPlayer."


def _production_host(root, **kwargs):
    return _factory(
        root,
        production_enabled=True,
        memory_agent_enabled=True,
        memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
        **kwargs,
    )


def _persist_completed_exchanges(host, *, count=64, first_index=0):
    """Use the real durable tool boundary, artifactizer and journal producer."""
    context = _context(
        execution_id="execution-a",
        generation_id="generation-a",
        attempt_id="attempt-a",
        current_input=_GOAL,
    )
    context.event["toolkit"] = Toolkit({
        "inspect_file": Tool(
            name="inspect_file",
            description="Inspect a task file",
            func=lambda **_arguments: None,
            output_policy="artifact_only",
        ),
    })
    runtime = host.context_module.runtime
    runtime.bind_context(context)
    runtime.bind_execution_toolkit(context)
    attempt = host.attempt(execution_id="execution-a", attempt_id="attempt-a")
    expected = {}
    for index in range(first_index, first_index + count):
        call_id = f"ticket-448-call-{index:03}"
        arguments = {"source": f"argument-{index:03}-" + "x" * 4096}
        output = {"sentinel": f"output-{index:03}-", "status": "complete"}
        boundary = attempt.bundle.tool_boundary
        intent = boundary.sink({
            "type": "tool_call",
            "run_id": "attempt-a",
            "iteration": index,
            "tool_name": "inspect_file",
            "call_id": call_id,
            "arguments": arguments,
        })
        subject = DurableToolExecutionSubject(
            intent_cursor=intent.cursor,
            original_arguments_sha256=_canonical_digest(arguments),
            effective_arguments_sha256=_canonical_digest(arguments),
            approval_state="not_required",
            approval_request_sha256="",
            approval_receipt_sha256="",
            route_kind="normal",
            route_manifest_sha256="1" * 64,
            terminal_handler_manifest_sha256="2" * 64,
            execution_fence=ExecutionFence("execution-a", "ticket-448", 1),
        )
        authorization = boundary.authorize_execution(
            tool_name="inspect_file",
            call_id=call_id,
            iteration=index,
            subject=subject,
        )
        result = attempt.bundle.artifacts.artifactize_tool_result(
            output,
            operation_id=f"ticket-448-result-{index}",
        )
        completion = DurableToolCompletionEnvelope(
            attempt=attempt.bundle.attempt,
            tool_name="inspect_file",
            call_id=call_id,
            iteration=index,
            execution_subject=subject,
            execution_subject_sha256=subject.sha256,
            result_artifact=result.artifact,
            visible_result=result.visible_result,
            should_observe=False,
        )
        completion_artifact = attempt.bundle.artifacts.artifactize_tool_completion(
            completion.to_dict(),
            operation_id=f"ticket-448-completion-{index}",
        )
        boundary.persist_prepared_result(
            authorization,
            artifactization=result,
            completion_artifactization=completion_artifact,
            tool_result_policy="artifact_only",
        )
        expected[call_id] = (arguments, output)
    events = tuple(
        journal_event_to_semantic_event(event)
        for event in attempt.bundle.journal.capture_snapshot().events
    )
    return context, attempt, events, expected


def _compile_request(events, **kwargs):
    return ContextCompileRequest(
        case="ticket-448-production-evidence",
        source_messages=({"role": "user", "content": _GOAL},),
        current_generation="generation-a",
        semantic_events=events,
        budget=resolve_context_budget(context_window_tokens=128_000),
        provider="openai",
        model="deterministic-contract",
        build_id="ticket-448-build",
        execution_id="execution-a",
        generation_id="generation-a",
        attempt_id="attempt-a",
        **kwargs,
    )


def _history(compiled):
    matches = [
        message["content"]
        for message in compiled.to_dict()["messages"]
        if "[MEMORY_V2_EVIDENCE_HISTORY]" in str(message.get("content") or "")
    ]
    assert len(matches) == 1
    return json.loads(matches[0].split("\n", 2)[2])


def _decode_locator(value):
    ref = decode_context_content_locator(value, error_message="invalid test evidence ref")
    assert ref is not None
    return ref


def _read_all(reader, read_request):
    assert set(read_request) == {"tool", "arguments"}
    assert read_request["tool"] == "context_content_read"
    assert set(read_request["arguments"]) == {"ref", "offset", "limit"}
    assert read_request["arguments"]["offset"] == 0
    request = read_request
    pages = []
    while request is not None:
        page = reader(**request["arguments"])
        assert "error" not in page, page
        assert page["ref"] == read_request["arguments"]["ref"]
        assert page["offset"] == sum(len(part) for part in pages)
        part = page["content"]["text"].encode("utf-8")
        assert len(part) == page["page_bytes"]
        pages.append(part)
        request = page["next_read"]
    data = b"".join(pages)
    assert len(data) == page["total_bytes"]
    assert hashlib.sha256(data).hexdigest() == page["sha256"]
    return json.loads(data)


def _assert_exact_reads(host, history, events, expected):
    reader = _prepared_context_reader(host)
    calls = {event["call_id"]: event for event in events if event["type"] == "tool_call"}
    results = {event["call_id"]: event for event in events if event["type"] == "tool_result"}
    exchanges = history["tool_exchanges"]
    assert [item["call_id"] for item in exchanges] == list(expected)
    for item in exchanges:
        call_id = item["call_id"]
        assert item["tool_name"] == "inspect_file"
        arguments = item["arguments"]
        assert set(arguments) == {
            "evidence_kind", "preview", "truncated", "projected_value_bytes",
            "projected_value_sha256", "read_scope", "full_output_ref", "read_request",
        }
        assert arguments["truncated"] is True
        assert arguments["evidence_kind"] == "historical_tool_arguments"
        original = json.dumps(expected[call_id][0], sort_keys=True, ensure_ascii=False,
                              separators=(",", ":")).encode("utf-8")
        assert arguments["read_scope"] == "canonical_tool_call_event"
        assert arguments["projected_value_bytes"] == len(original)
        assert arguments["projected_value_sha256"] == hashlib.sha256(original).hexdigest()
        decoded = _decode_locator(arguments["full_output_ref"])
        assert decoded == ResourceRef("context_event", calls[call_id]["event_id"], 1)
        assert arguments["read_request"]["arguments"]["ref"] == arguments["full_output_ref"]
        call = _read_all(reader, arguments["read_request"])
        assert set(call) == {
            "attempt", "event_id", "event_type", "operation", "payload",
            "resource_refs", "schema", "store_seq",
        }
        assert call["event_id"] == calls[call_id]["event_id"]
        assert call["event_type"] == "tool_call"
        assert call["payload"]["call_id"] == call_id
        assert call["payload"]["arguments"] == expected[call_id][0]
        result_ref = item["full_output_ref"]
        assert _decode_locator(result_ref) == ResourceRef.from_dict(
            results[call_id]["full_output_ref"]
        )
        output = _read_all(reader, {
            "tool": "context_content_read",
            "arguments": {"ref": result_ref, "offset": 0, "limit": 8192},
        })
        assert output == expected[call_id][1]


def test_ticket_448_completed_evidence_reduces_and_exact_reads_survive_cold_host(tmp_path):
    host = _production_host(tmp_path)
    context, attempt, events, expected = _persist_completed_exchanges(host)
    original = json.dumps(events, sort_keys=True, ensure_ascii=False)
    request = _compile_request(events)

    compiled = ContextCompiler().compile(request)
    diagnostics = compiled.diagnostics
    assert diagnostics["semantic_history_before_bytes"] > 256 * 1024
    assert diagnostics["semantic_history_after_bytes"] < 256 * 1024
    assert diagnostics["semantic_history_compacted_exchange_count"] == len(expected)
    assert diagnostics["after_estimated_tokens"] < diagnostics["before_estimated_tokens"]
    history = _history(compiled)
    assert ContextCompiler().compile(request).to_dict() == compiled.to_dict()
    assert json.dumps(tuple(
        journal_event_to_semantic_event(event)
        for event in attempt.bundle.journal.capture_snapshot().events
    ), sort_keys=True, ensure_ascii=False) == original
    _assert_exact_reads(host, history, events, expected)

    cold = _production_host(tmp_path)
    cold_context = _context(
        execution_id="execution-a", generation_id="generation-a",
        attempt_id="attempt-a", current_input=_GOAL,
    )
    cold.context_module.runtime.bind_context(cold_context)
    _assert_exact_reads(cold, history, events, expected)
    cold_events = tuple(
        journal_event_to_semantic_event(event)
        for event in cold.attempt(
            execution_id="execution-a", attempt_id="attempt-a",
        ).bundle.journal.capture_snapshot().events
    )
    cold_by_id = {event["event_id"]: event for event in cold_events}
    # Coordinator receipts may append events; original call/result bytes cannot
    # be rewritten by either compilation or a cold host object reopen.
    assert all(cold_by_id[event["event_id"]] == event for event in events)


def test_ticket_448_production_coordinator_continues_one_turn_with_strict_fake_provider(tmp_path, monkeypatch):
    """Real native receipts and coordinator; only provider network IO is replaced."""
    # Cross the real 256 KiB history limit without 64 expensive coordinator
    # rebuilds. The latest native batch is excluded, so seven older 40 KiB
    # arguments must still exceed that limit. Separate tests retain 64 exchanges.
    tool_count = 8
    argument_padding = "x" * (40 * 1024)
    host = _production_host(
        tmp_path,
        root_run_id="attempt-a",
        generation_resolver=lambda _context, _execution: "generation-a",
        current_input_resolver=lambda _context, attempt: HostResolvedCurrentInput(
            attempt=attempt, content=_GOAL,
        ),
    )
    requests = []
    tool_effects = []
    compiled_builds = []
    runtime = host.context_module.runtime
    runtime_type = type(runtime)
    compile_context = runtime_type.compile_context

    def record_compiled_context(self, context):
        compiled = compile_context(self, context)
        if self is runtime:
            compiled_builds.append(compiled)
        return compiled

    monkeypatch.setattr(runtime_type, "compile_context", record_compiled_context)

    class Responses:
        def create(self, **kwargs):
            assert set(kwargs) == {"model", "input", "tools", "stream"}
            assert kwargs["model"] == "gpt-test" and kwargs["stream"] is True
            requests.append(json.loads(json.dumps(kwargs)))
            ordinal = len(requests) - 1
            if ordinal < tool_count:
                output = [{
                    "type": "function_call", "call_id": f"native-448-{ordinal:03}",
                    "name": "inspect_file",
                    "arguments": json.dumps({"source": f"argument-{ordinal:03}-" + argument_padding}),
                }]
            else:
                assert ordinal == tool_count
                output = [{
                    "type": "message", "role": "assistant",
                    "content": [{"type": "output_text", "text": "inspection complete"}],
                }]
            return _OpenAIResponseStream(SimpleNamespace(
                id=f"response-448-{ordinal}", output=output,
                usage={"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
            ))

    model_io = OpenAIModelIO(
        model="gpt-test", api_key="offline-test-key",
        client_factory=lambda **_kwargs: SimpleNamespace(responses=Responses()),
        default_payloads={}, model_capabilities={},
    )

    def inspect_file(source):
        tool_effects.append(source)
        return {"inspected": source[:13], "status": "complete"}

    builder = AgentBuilder(
        agent=SimpleNamespace(name="normal-agent"),
        spec=AgentSpec(name="normal-agent", provider="openai", model="gpt-test"),
        state=AgentState(),
        call_context=AgentCallContext(
            mode="run", input_messages=[{"role": "user", "content": _GOAL}],
            session_id="execution-a", run_id="attempt-a", max_iterations=tool_count + 1,
            max_context_window_tokens=128_000,
            execution_guard=ExecutionRuntime(InMemorySessionStore()).acquire("execution-a"),
            runtime_context=_runtime_context(
                execution_id="execution-a", attempt_id="attempt-a", run_id="attempt-a",
            ),
        ),
        model_io_registry=ModelIOFactoryRegistry(),
        toolkit=Toolkit({"inspect_file": Tool(
            name="inspect_file", description="Inspect a task file", func=inspect_file,
            output_policy="artifact_only",
        )}),
    )
    builder.set_model_io(model_io)
    for module in host.modules_for_active():
        module.configure(builder)
    result = builder.build().run()
    assert result.status == "completed"
    assert len(requests) == tool_count + 1
    assert tool_effects == [
        f"argument-{index:03}-" + argument_padding for index in range(tool_count)
    ]
    pressured = [compiled for compiled in compiled_builds
                 if compiled.diagnostics.get("semantic_history_compacted_exchange_count", 0)]
    assert pressured
    assert any(compiled.diagnostics["semantic_history_before_bytes"] > 256 * 1024
               for compiled in pressured)
    assert all(compiled.diagnostics["semantic_history_after_bytes"] < 256 * 1024
               and compiled.diagnostics["after_estimated_tokens"]
               < compiled.diagnostics["before_estimated_tokens"]
               for compiled in pressured)

    def texts(value):
        if isinstance(value, str):
            yield value
        elif isinstance(value, dict):
            for nested in value.values():
                yield from texts(nested)
        elif isinstance(value, list):
            for nested in value:
                yield from texts(nested)

    markers = [text for text in texts(requests[-1]["input"])
               if text.startswith("[MEMORY_V2_EVIDENCE_HISTORY]")]
    assert len(markers) == 1
    history = json.loads(markers[0].split("\n", 2)[2])
    assert [item["call_id"] for item in history["tool_exchanges"]] == [
        f"native-448-{index:03}" for index in range(tool_count - 1)
    ]
    native_calls = [item["call_id"] for item in requests[-1]["input"]
                    if item.get("type") == "function_call"]
    assert native_calls == [f"native-448-{tool_count - 1:03}"]
    assert len(markers[0].encode("utf-8")) < 256 * 1024
    assert any(isinstance(item["arguments"], dict)
               and item["arguments"].get("truncated") is True
               for item in history["tool_exchanges"])
    assert _GOAL in json.dumps(requests[-1])


def test_ticket_448_compacted_refs_reject_foreign_event_and_invalid_identity(tmp_path):
    host = _production_host(tmp_path)
    context, _attempt, events, _expected = _persist_completed_exchanges(host)
    compiled = ContextCompiler().compile(_compile_request(events))
    ref = _history(compiled)["tool_exchanges"][0]["arguments"]["full_output_ref"]
    reader = _prepared_context_reader(host)
    foreign = _production_host(tmp_path, owner_chat_id="chat-b", root_run_id="root-b")
    foreign.context_module.runtime.bind_context(_context(
        execution_id="execution-b", generation_id="generation-b", attempt_id="attempt-b",
    ))
    event = _decode_locator(ref)
    invalid_refs = [
        encode_context_content_locator(ResourceRef("context_event", event.resource_id, 2)),
        encode_context_content_locator(ResourceRef("context_event", event.resource_id, 1, "arguments")),
    ]
    for invalid in invalid_refs:
        try:
            response = reader(ref=invalid, offset=0, limit=8192)
        except MemoryToolkitError as error:
            assert "disclosed" in str(error) or "invalid" in str(error)
        else:
            assert "error" in response
            assert "argument-000" not in json.dumps(response)
    with pytest.raises(MemoryToolkitError, match="disclosed|scope|available"):
        reader(
            ref=encode_context_content_locator(ResourceRef("context_event", "missing-event", 1)),
            offset=0, limit=8192,
        )
    with pytest.raises(Exception, match="scope|available|event"):
        foreign.context_capability.read_content(ref=event, offset=0, limit=8192)
    assert host.context_module.runtime is not foreign.context_module.runtime


def test_ticket_448_persisted_progress_survives_compaction_and_next_two_inputs(tmp_path):
    host = _production_host(tmp_path)
    _context_a, _attempt, events, _expected = _persist_completed_exchanges(host)
    source = next(event for event in events if event["type"] == "message.user")
    pinned = host.task_state.update(
        expected_revision=None,
        patch={"objective": _GOAL, "confirmed_decisions": (_PROGRESS,), "active_plan": (_NEXT_STEP,)},
        source_event_refs=(ResourceRef("context_event", source["event_id"], 1),),
        operation_id="ticket-448-record-existing-progress",
    )
    compiled = ContextCompiler().compile(_compile_request(events, task_state=pinned.to_dict()))
    assert _GOAL in json.dumps(compiled.to_dict())
    assert _PROGRESS in json.dumps(compiled.to_dict())
    assert _NEXT_STEP in json.dumps(compiled.to_dict())

    for ordinal, current_input in enumerate(("Continue the poker fix.", "What remains?"), start=1):
        host = _production_host(tmp_path, root_run_id=f"root-next-{ordinal}")
        context = _context(
            execution_id="execution-a", generation_id="generation-a",
            attempt_id=f"attempt-next-{ordinal}", current_input=current_input,
        )
        context.state.provider_state.provider = "openai"
        context.state.provider_state.model = "deterministic-contract"
        context.state.provider_state.max_context_window_tokens = 128_000
        runtime = host.context_module.runtime
        runtime.bind_context(context)
        compiled_next = runtime.compile_context(context)
        rendered = json.dumps(compiled_next.to_dict())
        for evidence in (_GOAL, _PROGRESS, _NEXT_STEP, current_input):
            assert evidence in rendered
        assert host.task_state.get() == pinned


def test_ticket_448_actual_local_projection_error_reaches_v4_sse(tmp_path, monkeypatch):
    """Use an actual compiler exception as the HTTP producer, never a fake code."""
    events = []
    for index in range(400):
        call_id = f"irreducible-{index}-" + "x" * 700
        events.extend((
            {"type": "tool_call", "event_id": f"call-{index}", "store_seq": index * 2 + 1,
             "call_id": call_id, "tool_name": "inspect_file", "arguments": {}},
            {"type": "tool_result", "event_id": f"result-{index}", "store_seq": index * 2 + 2,
             "call_id": call_id, "tool_name": "inspect_file", "result": "done",
             "full_output_ref": ResourceRef("artifact", f"result-{index}", 1).to_dict(),
             "result_bytes": 6, "result_sha256": hashlib.sha256(b'"done"').hexdigest()},
        ))
    for event in events:
        event.update(execution_id="execution-a", generation_id="generation-a")
    request = replace(
        _compile_request(tuple(events)),
        budget=resolve_context_budget(context_window_tokens=1_000_000),
    )
    with pytest.raises(ContextBudgetExceededError) as caught:
        ContextCompiler().compile(request)
    error = caught.value
    assert error.code == "context_semantic_history_projection_exceeded"
    assert "local" in str(error).lower()
    assert "larger" not in str(error).lower()
    assert "has a" not in str(error).lower()

    import app as miso_app
    import route_chat
    import routes as miso_routes

    code, message = route_chat._normalize_stream_error(error)
    assert code == error.code
    assert message == str(error)
    calls = []

    def compiler_failure(**kwargs):
        calls.append(kwargs)
        raise error
        yield  # Keep the production streaming producer protocol.

    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path / "http"))
    monkeypatch.setattr(miso_routes, "stream_chat_events", compiler_failure)
    response = miso_app.create_app().test_client().post(
        "/chat/stream/v4",
        json={"message": _GOAL, "threadId": "ticket-448-http", "attempt_id": "attempt-http"},
    )
    frames = _parse_sse_blocks(response.get_data(as_text=True))
    done = next(payload for name, payload in frames if name == "done")
    assert done["error"] == {"code": error.code, "message": str(error)}
    assert len(calls) == 1
    assert all("provider_retry" not in json.dumps(payload) for _, payload in frames)
