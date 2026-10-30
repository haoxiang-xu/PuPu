"""Host integration coverage for the opt-in Skeleton Agent execution entry."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from hashlib import sha256
import json
from pathlib import Path
import sys
from threading import Thread
import time
from types import SimpleNamespace

import pytest


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import unchain_adapter  # noqa: E402  # puts the paired Unchain source on sys.path
import app as miso_app
import route_interject
from interaction_channels import get_interject_channels
from skeleton_agent_runtime import PupuSkeletonAgentExecution
from test_memory_v2_skeleton_root_completion import _agent_document, _kernel_config
from test_memory_v2_unchain_graph_root_completion import _NeverRunMemoryAgent, _active_bridge, _run
from unchain.execution import ExecutionRuntime
from unchain.journal import ArtifactRef, JournalConflictError
from unchain.journal.models import _thaw_json
from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
from unchain.skeleton import WorkflowNodeCompleted
from unchain.skeleton.agent_preparation import prepare_agent_graph
from unchain.skeleton.errors import SkeletonValidationError
from unchain.skeleton.kernel_profile import bind_kernel_profile
from unchain.skeleton.kernel_runtime import SkeletonKernelHandler
from unchain.skeleton.code_runtime import FileCodeSourceResolver, PythonEnvironmentProfile, SkeletonCodeRuntime
from unchain.skeleton.workflow_runtime import PublishedWorkflow
from unchain.skeleton.durable_store import DurableStoreError
from unchain.tools import Tool


class _OpenAIStream:
    def __init__(self, response):
        self.response = response

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def __iter__(self):
        yield SimpleNamespace(type="response.completed", response=self.response)


class _StrictOpenAIClient:
    """Native responses fake: accepts only the calls issued by the real adapter."""

    def __init__(self, responses, *, before_first=None):
        self.responses_to_send = list(responses)
        self.requests = []
        self.before_first = before_first
        self.responses = SimpleNamespace(create=self.create)

    def create(self, **request):
        self.requests.append(deepcopy(request))
        if len(self.requests) == 1 and self.before_first is not None:
            self.before_first()
        if not self.responses_to_send:
            raise AssertionError("unexpected native OpenAI request")
        return _OpenAIStream(self.responses_to_send.pop(0))


def _tool_response():
    return SimpleNamespace(
        id="fyi-tool-turn",
        output=[{
            "type": "function_call", "call_id": "fyi-tool-call", "name": "probe", "arguments": "{}",
        }],
        usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7},
    )


def _handoff_response():
    return SimpleNamespace(
        id="handoff-turn",
        output=[{
            "type": "function_call", "call_id": "handoff-call",
            "name": "handoff_to_subagent",
            "arguments": '{"target":"Reviewer","reason":"finish the task"}',
        }],
        usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7},
    )


def _approval_tool_response():
    return SimpleNamespace(
        id="child-approval-turn",
        output=[{
            "type": "function_call", "call_id": "child-approval-call",
            "name": "dangerous_tool", "arguments": '{"value":"approved child value"}',
        }],
        usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7},
    )


def _final_response(answer="model answer"):
    return SimpleNamespace(
        id="fyi-final-turn",
        output=[{
            "type": "message", "role": "assistant",
            "content": [{"type": "output_text", "text": '{"answer":"' + answer + '"}'}],
        }],
        usage={"input_tokens": 8, "output_tokens": 3, "total_tokens": 11},
    )


def _binding(config, client, sdk_calls):
    def factory(**kwargs):
        sdk_calls.append(deepcopy(kwargs))
        return client

    return bind_kernel_profile(
        config,
        profile_resolver=lambda _profile_id: deepcopy(config["profile"]),
        credential_resolver=lambda _credential_ref: "test-key",
        client_factories={"openai": factory},
    )


def _bridge(tmp_path, monkeypatch, *, execution_id="skeleton-host-execution", task="root task"):
    run = _run(execution_id=execution_id, attempt_id="skeleton-host-root", content=task)
    return _active_bridge(
        tmp_path, monkeypatch, run=run, owner_chat_id="skeleton-host-chat",
        invoker_factory=lambda _codec: _NeverRunMemoryAgent(),
    )


def _single_plan(*, invalid_output=False):
    document = _agent_document()
    for node in document["nodes"]:
        if node["type"] == "agent":
            node["config"]["kernel"]["max_iterations"] = 2
            if invalid_output:
                node["config"]["kernel"]["json_schema"] = {
                    "type": "object", "properties": {"answer": {"type": "integer"}},
                    "required": ["answer"], "additionalProperties": False,
                }
    return prepare_agent_graph(document)


def _two_kernel_plan():
    document = _agent_document()
    postprocess = next(node for node in document["nodes"] if node["id"] == "postprocess")
    postprocess["type"] = "agent"
    postprocess["config"] = {
        "execution": {"inputs": [], "outputs": [
            {"name": "answer", "source": {"kind": "result", "path": ["answer"]}},
        ]},
        "kernel": _kernel_config(),
    }
    end = next(node for node in document["nodes"] if node["id"] == "end")
    end["config"]["execution"] = {
        "inputs": [{"name": "message", "value": {"kind": "ref", "node_id": "postprocess", "path": ["answer"]}, "missing": "error"}],
        "outputs": [{"name": "message", "source": {"kind": "input", "path": ["message"]}}],
    }
    return prepare_agent_graph(document)


def _hook_workflow(workflow_id):
    return {
        "schema_version": 1, "kind": "workflow", "id": workflow_id,
        "name": "Hook workflow",
        "nodes": [
            {
                "id": "start", "type": "start",
                "config": {"execution": {"outputs": [{
                    "name": "value", "source": {"kind": "result", "path": ["value"]},
                }]}},
            },
            {
                "id": "end", "type": "end",
                "config": {"execution": {
                    "inputs": [{
                        "name": "value",
                        "value": {"kind": "ref", "node_id": "start", "path": ["value"]},
                        "missing": "error",
                    }],
                    "outputs": [{
                        "name": "value", "source": {"kind": "input", "path": ["value"]},
                    }],
                }},
            },
        ],
        "edges": [{
            "id": "start-end", "kind": "flow", "source_node_id": "start", "source_port_id": "out",
            "target_node_id": "end", "target_port_id": "in",
        }],
    }


def _single_plan_with_hook_pool():
    return prepare_agent_graph(_document_with_hook_pool(_agent_document()))


def _document_with_hook_pool(document, *, workflow_id="policy-workflow", revision_id="rev-1"):
    document = deepcopy(document)
    kernel = next(node for node in document["nodes"] if node["type"] == "agent")
    document["nodes"].append({"id": "hooks", "type": "hooks_pool", "config": {"hooks": [{
        "id": "policy", "order": 10, "event": "before_tool_call", "tool_name": None,
        "workflow": {"workflow_id": workflow_id, "revision_id": revision_id},
        "force_approval": False,
    }]}})
    document["edges"].append({
        "id": "attach-hooks", "kind": "attach", "source_node_id": kernel["id"],
        "source_port_id": "attach_bot", "target_node_id": "hooks", "target_port_id": "attach_top",
    })
    return document


def _host_execution(plan, bridge, *, client, guard, memory, callback=None,
                    tools_for_node=None, sdk_calls=None, subagent_manifests=None,
                    child_handlers_factory=None, hook_workflow_resolver=None,
                    other_handlers=None):
    sdk_calls = [] if sdk_calls is None else sdk_calls
    if other_handlers is None:
        other_handlers = {"code": lambda _context, inputs: WorkflowNodeCompleted({
            "message": "postprocessed End reply", "evidence": "derived " + inputs["model_answer"],
        })}
    return PupuSkeletonAgentExecution(
        plan, bridge, graph_id="pupu-skeleton-host", durability_runtime=memory,
        execution_guard=guard, bind_profile=lambda config: _binding(config, client, sdk_calls),
        tools_for_node=tools_for_node, callback=callback,
        other_handlers=other_handlers,
        subagent_manifests=subagent_manifests,
        child_handlers_factory=child_handlers_factory,
        hook_workflow_resolver=hook_workflow_resolver,
    )


def _before_hook_execution_workflow(workflow_id):
    return {
        "schema_version": 1, "kind": "workflow", "id": workflow_id,
        "name": "Before hook execution",
        "nodes": [
            {"id": "start", "type": "start", "config": {"execution": {"outputs": [
                {"name": name, "source": {"kind": "result", "path": [name]}}
                for name in ("event", "call_id", "tool_name", "arguments")
            ]}}},
            {"id": "code", "type": "code", "config": {"execution": {
                "inputs": [
                    {"name": name, "value": {"kind": "ref", "node_id": "start", "path": [name]}, "missing": "error"}
                    for name in ("event", "call_id", "tool_name", "arguments")
                ],
                "outputs": [
                    {"name": name, "source": {"kind": "result", "path": [name]}}
                    for name in ("decision", "require_approval", "arguments")
                ],
            }}},
            {"id": "end", "type": "end", "config": {"execution": {
                "inputs": [
                    {"name": name, "value": {"kind": "ref", "node_id": "code", "path": [name]}, "missing": "error"}
                    for name in ("decision", "require_approval", "arguments")
                ],
                "outputs": [
                    {"name": name, "source": {"kind": "input", "path": [name]}}
                    for name in ("decision", "require_approval", "arguments")
                ],
            }}},
        ],
        "edges": [
            {"id": "start-code", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "code", "target_port_id": "in"},
            {"id": "code-end", "kind": "flow", "source_node_id": "code", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"},
        ],
    }


def _after_hook_execution_workflow(workflow_id):
    inputs = ("event", "call_id", "tool_name", "arguments", "raw_result", "visible_result")
    outputs = ("decision", "result")
    return {
        "schema_version": 1, "kind": "workflow", "id": workflow_id,
        "name": "After hook execution",
        "nodes": [
            {"id": "start", "type": "start", "config": {"execution": {"outputs": [
                {"name": name, "source": {"kind": "result", "path": [name]}}
                for name in inputs
            ]}}},
            {"id": "code", "type": "code", "config": {"execution": {
                "inputs": [
                    {"name": name, "value": {"kind": "ref", "node_id": "start", "path": [name]}, "missing": "error"}
                    for name in inputs
                ],
                "outputs": [
                    {"name": name, "source": {"kind": "result", "path": [name]}}
                    for name in outputs
                ],
            }}},
            {"id": "end", "type": "end", "config": {"execution": {
                "inputs": [
                    {"name": name, "value": {"kind": "ref", "node_id": "code", "path": [name]}, "missing": "error"}
                    for name in outputs
                ],
                "outputs": [
                    {"name": name, "source": {"kind": "input", "path": [name]}}
                    for name in outputs
                ],
            }}},
        ],
        "edges": [
            {"id": "start-code", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "code", "target_port_id": "in"},
            {"id": "code-end", "kind": "flow", "source_node_id": "code", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"},
        ],
    }


def test_after_hook_replaces_tool_result_before_model_or_public_journal(tmp_path, monkeypatch):
    from unchain.skeleton.hook_raw_seal import HookRawSealStore, verify_hook_raw_event
    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-host-after-hook")
    document = _document_with_hook_pool(_agent_document())
    hook = next(node for node in document["nodes"] if node["type"] == "hooks_pool")["config"]["hooks"][0]
    hook["event"] = "after_tool_call"
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 3
    plan = prepare_agent_graph(document)
    client = _StrictOpenAIClient([_approval_tool_response(), _final_response("safe"), _final_response("safe")])
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    effects = []
    hook_inputs = []
    raw_capture = {}
    original_record = HookRawSealStore.record
    def capture_raw_seal(self, request, raw_draft, artifacts, effective_arguments):
        raw_capture.update(request=request, artifacts=artifacts)
        return original_record(self, request, raw_draft, artifacts, effective_arguments)
    monkeypatch.setattr(HookRawSealStore, "record", capture_raw_seal)

    def resolve(workflow_id, revision_id):
        return PublishedWorkflow(workflow_id, revision_id, _after_hook_execution_workflow(workflow_id))

    def code_handler(context, inputs):
        if context.document_id == "policy-workflow":
            hook_inputs.append(deepcopy(inputs))
            return WorkflowNodeCompleted({"decision": "replace", "result": {"visible": "safe"}})
        return WorkflowNodeCompleted({"message": "postprocessed End reply", "evidence": "safe"})

    def dangerous_tool(value):
        effects.append(value)
        return {"internal": "RAW_SENTINEL", "visible": value}

    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (Tool.from_callable(dangerous_tool,
                name="dangerous_tool", requires_confirmation=False),),
            hook_workflow_resolver=resolve, other_handlers={"code": code_handler})
        execution.create({})
        result, receipt = execution.run(original_task="after hook execution")


    assert result.status == "completed" and receipt is not None, result.error
    assert effects == ["approved child value"]
    assert hook_inputs[0]["raw_result"]["internal"] == "RAW_SENTINEL"
    assert "RAW_SENTINEL" not in repr(client.requests[1:])
    visible_events = [event for event in execution.store.journal.capture_snapshot().events
        if event.event_type == "tool_result" and event.payload.get("call_id") == "child-approval-call"]
    assert len(visible_events) == 1
    assert "RAW_SENTINEL" not in repr(visible_events[0].payload)
    visible_payload = visible_events[0].payload
    visible_artifact = ArtifactRef(
        ref=visible_payload["full_output_ref"],
        media_type="application/json",
        byte_length=visible_payload["result_bytes"],
        sha256=visible_payload["result_sha256"],
        preview=visible_payload.get("preview", ""),
    )
    visible_bytes = raw_capture["artifacts"].read_full(
        visible_artifact, remaining_budget_bytes=visible_artifact.byte_length)
    assert b"RAW_SENTINEL" not in visible_bytes
    assert "RAW_SENTINEL" not in repr(result.outputs)
    raw_event = next(event for event in execution.store.journal.capture_snapshot().events
        if event.event_type == "tool.hook_raw.sealed")
    raw_request = raw_capture["request"]
    _, raw_artifact, raw_draft, _ = verify_hook_raw_event(
        raw_event, raw_capture["artifacts"], attempt=raw_event.attempt,
        tool_name=raw_request.tool_name, call_id=raw_request.call_id,
        iteration=raw_request.iteration, recorded_subject=raw_request.subject,
    )
    assert raw_artifact.preview == ""
    assert raw_draft.result["internal"] == "RAW_SENTINEL"
    assert raw_artifact.ref != visible_artifact.ref
    assert raw_artifact.ref.resource_id not in repr(client.requests[1:])
    for changed in (
        {**_thaw_json(raw_event.payload), "unknown": True},
        {**_thaw_json(raw_event.payload), "schema": "unchain.skeleton_hook_raw_seal.v999"},
        {**_thaw_json(raw_event.payload), "call_id": "other-call"},
        {**_thaw_json(raw_event.payload), "parent_graph_id": None},
    ):
        forged = SimpleNamespace(event_type=raw_event.event_type,
            attempt=raw_event.attempt, payload=changed,
            resource_refs=raw_event.resource_refs)
        with pytest.raises(SkeletonValidationError):
            verify_hook_raw_event(forged, raw_capture["artifacts"],
                attempt=raw_event.attempt, tool_name=raw_request.tool_name,
                call_id=raw_request.call_id, iteration=raw_request.iteration,
                recorded_subject=raw_request.subject)
    wrong_operation = SimpleNamespace(event_type=raw_event.event_type,
        attempt=raw_event.attempt, payload=raw_event.payload,
        resource_refs=raw_event.resource_refs,
        event_id="event.changed", operation=raw_event.operation)
    with pytest.raises(SkeletonValidationError):
        verify_hook_raw_event(wrong_operation, raw_capture["artifacts"],
            attempt=raw_event.attempt, tool_name=raw_request.tool_name,
            call_id=raw_request.call_id, iteration=raw_request.iteration,
            recorded_subject=raw_request.subject)


@pytest.mark.parametrize("second_valid", [True, False])
@pytest.mark.parametrize("crash_after_first", [False, True])
def test_later_after_hook_cannot_read_raw_result_after_replacement(
    tmp_path, monkeypatch, second_valid, crash_after_first,
):
    from unchain.skeleton.hook_phase_journal import HookPhaseJournal
    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-two-after-hooks")
    document = _document_with_hook_pool(_agent_document())
    pool = next(node for node in document["nodes"] if node["type"] == "hooks_pool")
    first = pool["config"]["hooks"][0]
    first["event"] = "after_tool_call"
    second = deepcopy(first)
    second["id"] = "second"
    second["workflow"] = {"workflow_id": "second-policy", "revision_id": "rev-1"}
    second["order"] = first["order"] + 1
    pool["config"]["hooks"].append(second)
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 3
    plan = prepare_agent_graph(document)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    client = _StrictOpenAIClient([_approval_tool_response(), _final_response("safe")])
    first_calls = []
    second_inputs = []

    def resolve(workflow_id, revision_id):
        assert revision_id == "rev-1"
        return PublishedWorkflow(workflow_id, revision_id, _after_hook_execution_workflow(workflow_id))

    def code_handler(context, inputs):
        if context.document_id == "policy-workflow":
            first_calls.append(1)
            return WorkflowNodeCompleted({"decision": "replace", "result": {"visible": "safe"}})
        if context.document_id == "second-policy":
            second_inputs.append(deepcopy(inputs))
            if not second_valid:
                return WorkflowNodeCompleted({"decision": "block", "result": {"visible": "invalid"}})
            return WorkflowNodeCompleted({"decision": "replace", "result": {
                "visible": inputs["visible_result"]["visible"],
                "raw_was_available": bool(inputs["raw_result"]),
            }})
        return WorkflowNodeCompleted({"message": "done", "evidence": "safe"})

    def host(current_bridge, guard):
        return _host_execution(plan, current_bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (Tool.from_callable(
                lambda value: {"visible": value, "private": "RAW_SENTINEL"},
                name="dangerous_tool", requires_confirmation=False),),
            hook_workflow_resolver=resolve, other_handlers={"code": code_handler})
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = host(bridge, guard)
        execution.create({})
        if crash_after_first:
            class PowerLoss(BaseException):
                pass
            original_record = HookPhaseJournal.record
            def crash(self, binding, phase, inputs, decision):
                result = original_record(self, binding, phase, inputs, decision)
                if binding.hook["id"] == "policy":
                    raise PowerLoss()
                return result
            with monkeypatch.context() as fault:
                fault.setattr(HookPhaseJournal, "record", crash)
                with pytest.raises(PowerLoss):
                    execution.run(original_task="two after hooks")
        else:
            result, receipt = execution.run(original_task="two after hooks")
    if crash_after_first:
        with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
            execution = host(_bridge(tmp_path, monkeypatch, execution_id=bridge.execution_id), guard)
            result = execution.recover()
    assert result.status == ("completed" if second_valid else "failed")
    if not crash_after_first:
        assert (receipt is not None) == second_valid
    elif second_valid:
        assert any(event.event_type == "final_message"
                   and event.attempt == execution.store.attempt
                   for event in execution.store.journal.capture_snapshot().events)
    assert len(first_calls) == 1
    assert len(second_inputs) == 1
    assert second_inputs[0]["visible_result"] == {"visible": "safe"}
    assert second_inputs[0]["raw_result"] == {}
    assert "RAW_SENTINEL" not in repr(client.requests[1:])
    if not second_valid:
        assert len(client.requests) == 1
        events = execution.store.journal.capture_snapshot().events
        assert sum(event.event_type == "skeleton.hook_phase.receipt"
                   and event.payload.get("phase") == "after_tool_call" for event in events) == 1
        assert not any(event.event_type == "tool_result"
            and event.payload.get("call_id") == "child-approval-call" for event in events)


def test_after_hook_invalid_decision_fails_without_losing_tool_receipt(tmp_path, monkeypatch):
    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-after-invalid-decision")
    document = _document_with_hook_pool(_agent_document())
    next(node for node in document["nodes"] if node["type"] == "hooks_pool")["config"]["hooks"][0]["event"] = "after_tool_call"
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 3
    plan = prepare_agent_graph(document)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    effects = []
    client = _StrictOpenAIClient([_approval_tool_response(), _final_response("must not run")])

    def resolve(workflow_id, revision_id):
        return PublishedWorkflow(workflow_id, revision_id, _after_hook_execution_workflow(workflow_id))

    def code_handler(context, _inputs):
        if context.document_id == "policy-workflow":
            return WorkflowNodeCompleted({"decision": "block", "result": {"visible": "wrong"}})
        return WorkflowNodeCompleted({"message": "wrong", "evidence": "wrong"})

    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (Tool.from_callable(
                lambda value: effects.append(value) or {"visible": value},
                name="dangerous_tool", requires_confirmation=False),),
            hook_workflow_resolver=resolve, other_handlers={"code": code_handler})
        execution.create({})
        result, receipt = execution.run(original_task="invalid after Hook")
    assert result.status == "failed" and receipt is None
    assert result.error["code"] == "hook_invalid_decision"
    assert effects == ["approved child value"] and len(client.requests) == 1
    events = execution.store.journal.capture_snapshot().events
    assert sum(event.event_type == "tool.hook_raw.sealed" for event in events) == 1
    assert not any(event.event_type == "tool_result" and event.payload.get("call_id") == "child-approval-call"
                   for event in events)


def test_after_hook_code_quota_failure_preserves_known_parent_tool_result(tmp_path, monkeypatch):
    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-after-code-quota")
    document = _document_with_hook_pool(_agent_document())
    next(node for node in document["nodes"] if node["type"] == "hooks_pool")["config"]["hooks"][0]["event"] = "after_tool_call"
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 3
    plan = prepare_agent_graph(document)
    workflow = _after_hook_execution_workflow("policy-workflow")
    code = next(node for node in workflow["nodes"] if node["type"] == "code")
    code["config"]["code"] = {
        "source": {"kind": "file", "path": "hook.py"},
        "environment_profile_id": "hook-python",
        "timeout_ms": 5000, "max_result_bytes": 256, "max_log_bytes": 1024,
        "result_schema": {"type": "object"}, "artifacts": [],
    }
    source_root = tmp_path / "hook-source"
    source_root.mkdir()
    (source_root / "hook.py").write_text(
        "def main(input, context):\n return {'decision': 'replace', 'result': {'large': 'x' * 4096}}\n",
        encoding="utf-8",
    )
    profile = PythonEnvironmentProfile.venv("hook-python", sys.executable)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    effects = []
    client = _StrictOpenAIClient([_approval_tool_response(), _final_response("must not run")])

    def resolve(workflow_id, revision_id):
        return PublishedWorkflow(workflow_id, revision_id, deepcopy(workflow))

    def child_handlers(_store, child_plan):
        return {"code": SkeletonCodeRuntime(
            child_plan, source_resolver=FileCodeSourceResolver(source_root),
            profile_resolver=lambda profile_id: profile if profile_id == "hook-python" else None,
            staging_root=tmp_path / "hook-staging", poll_interval_s=0.01,
        )}

    def host(current_bridge, guard):
        return _host_execution(plan, current_bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (Tool.from_callable(
                lambda value: effects.append(value) or {"private": "RAW_SENTINEL"},
                name="dangerous_tool", requires_confirmation=False),),
            hook_workflow_resolver=resolve, child_handlers_factory=child_handlers)

    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = host(bridge, guard)
        execution.create({})
        result, receipt = execution.run(original_task="after Hook Code quota")
    assert result.status == "failed" and receipt is None, result.error
    assert result.error["code"] == "child_failed"
    assert effects == ["approved child value"] and len(client.requests) == 1
    events = execution.store.journal.capture_snapshot().events
    assert sum(event.event_type == "tool.hook_raw.sealed" for event in events) == 1
    assert not any(event.event_type == "tool_result" and event.payload.get("call_id") == "child-approval-call"
                   for event in events)
    cold_bridge = _bridge(tmp_path, monkeypatch, execution_id=bridge.execution_id)
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        cold = host(cold_bridge, guard)
        recovered = cold.recover()
    assert recovered.status == "failed" and recovered.error["code"] == "child_failed"
    assert effects == ["approved child value"] and len(client.requests) == 1


def test_uncertain_after_hook_child_preserves_parent_tool_effect_without_projection(tmp_path, monkeypatch):
    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-after-child-unknown")
    document = _document_with_hook_pool(_agent_document())
    next(node for node in document["nodes"] if node["type"] == "hooks_pool")["config"]["hooks"][0]["event"] = "after_tool_call"
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 3
    plan = prepare_agent_graph(document)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    effects = []
    client = _StrictOpenAIClient([_approval_tool_response(), _final_response("must not run")])

    def resolve(workflow_id, revision_id):
        return PublishedWorkflow(workflow_id, revision_id, _after_hook_execution_workflow(workflow_id))

    def code_handler(context, _inputs):
        if context.document_id == "policy-workflow":
            raise RuntimeError("Hook side effect may have escaped")
        return WorkflowNodeCompleted({"message": "wrong", "evidence": "wrong"})

    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (Tool.from_callable(
                lambda value: effects.append(value) or {"visible": value},
                name="dangerous_tool", requires_confirmation=False),),
            hook_workflow_resolver=resolve, other_handlers={"code": code_handler})
        execution.create({})
        result, receipt = execution.run(original_task="uncertain after Hook")
    assert result.status == "outcome_unknown" and receipt is None
    assert effects == ["approved child value"] and len(client.requests) == 1
    events = execution.store.journal.capture_snapshot().events
    assert sum(event.event_type == "tool.hook_raw.sealed" for event in events) == 1
    assert not any(event.event_type == "tool_result" and event.payload.get("call_id") == "child-approval-call"
                   for event in events)


def test_before_hook_phase_receipt_recovers_without_model_or_child_replay(tmp_path, monkeypatch):
    from unchain.skeleton.hook_phase_journal import HookPhaseJournal

    execution_id = "skeleton-before-phase-recovery"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    document = _document_with_hook_pool(_agent_document())
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 3
    plan = prepare_agent_graph(document)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    effects, child_calls = [], []

    def resolve(workflow_id, revision_id):
        return PublishedWorkflow(workflow_id, revision_id, _before_hook_execution_workflow(workflow_id))

    def code_handler(context, _inputs):
        if context.document_id == "policy-workflow":
            child_calls.append(1)
            return WorkflowNodeCompleted({"decision": "continue", "require_approval": False,
                "arguments": {"value": "normalized"}})
        return WorkflowNodeCompleted({"message": "done", "evidence": "safe"})

    def host(current_bridge, client, guard):
        return _host_execution(plan, current_bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (Tool.from_callable(
                lambda value: effects.append(value) or {"value": value},
                name="dangerous_tool", requires_confirmation=False),),
            hook_workflow_resolver=resolve, other_handlers={"code": code_handler})

    class PowerLoss(BaseException):
        pass
    original_record = HookPhaseJournal.record
    phase_capture = {}
    def crash_after_phase(self, binding, phase, inputs, decision):
        original_record(self, binding, phase, inputs, decision)
        phase_capture.update(context=self._context, binding=binding, inputs=deepcopy(inputs))
        raise PowerLoss()

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        first = host(bridge, _StrictOpenAIClient([_approval_tool_response()]), guard)
        first.create({})
        with monkeypatch.context() as fault:
            fault.setattr(HookPhaseJournal, "record", crash_after_phase)
            with pytest.raises(PowerLoss):
                first.run(original_task="before phase crash")
    assert effects == [] and len(child_calls) == 1
    phase_event = next(event for event in first.store.journal.capture_snapshot().events
        if event.event_type == "skeleton.hook_phase.receipt")
    for changed in (
        {**_thaw_json(phase_event.payload), "unknown": True},
        {**_thaw_json(phase_event.payload), "schema": "unchain.skeleton_hook_phase_receipt.v999"},
    ):
        forged = SimpleNamespace(event_type=phase_event.event_type,
            attempt=phase_event.attempt, payload=changed,
            event_id=phase_event.event_id, operation=phase_event.operation,
            resource_refs=phase_event.resource_refs)
        fake_store = SimpleNamespace(graph_id=first.store.graph_id,
            attempt=first.store.attempt,
            journal=SimpleNamespace(capture_snapshot=lambda: SimpleNamespace(events=[forged])))
        with pytest.raises(SkeletonValidationError):
            HookPhaseJournal(fake_store, phase_capture["context"],
                call_id="child-approval-call", tool_name="dangerous_tool").replay(
                    phase_capture["binding"], "before_tool_call", phase_capture["inputs"])
    cold_bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    cold_client = _StrictOpenAIClient([_final_response("safe")])
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        cold = host(cold_bridge, cold_client, guard)
        recovered = cold.recover()
    assert recovered.status == "completed"
    assert effects == ["normalized"] and len(child_calls) == 1
    assert len(cold_client.requests) == 1


@pytest.mark.parametrize("crash_phase", [
    "before_raw_seal", "raw_seal", "phase_receipt", "before_visible_result",
])
@pytest.mark.parametrize("nested", [False, True])
def test_after_hook_recovers_sealed_raw_result_without_repeating_tool(
    tmp_path, monkeypatch, crash_phase, nested,
):
    from unchain.skeleton.hook_raw_seal import HookRawSealStore
    from unchain.skeleton.hook_phase_journal import HookPhaseJournal
    from unchain.context.tool_boundary import DurableToolBoundary

    execution_id = "skeleton-host-after-hook-recovery"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    document = _document_with_hook_pool(_agent_document())
    next(node for node in document["nodes"] if node["type"] == "hooks_pool")["config"]["hooks"][0]["event"] = "after_tool_call"
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 3
    plan = prepare_agent_graph(document)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    effects = []
    hook_calls = []
    workflow = _after_hook_execution_workflow("policy-workflow")
    leaf_workflow = _after_hook_execution_workflow("leaf-policy") if nested else None
    if nested:
        step = next(node for node in workflow["nodes"] if node["id"] == "code")
        step["type"] = "workflow_call"
        step["config"] = {
            "workflow": {"workflow_id": "leaf-policy", "revision_id": "rev-leaf"},
            "execution": deepcopy(step["config"]["execution"]),
        }

    def resolve(workflow_id, revision_id):
        if (workflow_id, revision_id) == ("policy-workflow", "rev-1"):
            return PublishedWorkflow(workflow_id, revision_id, deepcopy(workflow))
        assert nested and (workflow_id, revision_id) == ("leaf-policy", "rev-leaf")
        return PublishedWorkflow(workflow_id, revision_id, deepcopy(leaf_workflow))

    def code_handler(context, inputs):
        if context.document_id == ("leaf-policy" if nested else "policy-workflow"):
            hook_calls.append(deepcopy(inputs))
            return WorkflowNodeCompleted({"decision": "replace", "result": {"visible": "safe"}})
        return WorkflowNodeCompleted({"message": "postprocessed End reply", "evidence": "safe"})

    def tool(value):
        effects.append(value)
        return {"internal": "RAW_SENTINEL", "visible": value}

    def host(current_bridge, client, guard):
        return _host_execution(plan, current_bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (Tool.from_callable(tool,
                name="dangerous_tool", requires_confirmation=False),),
            hook_workflow_resolver=resolve, other_handlers={"code": code_handler})

    class PowerLoss(BaseException):
        pass

    original_record = HookRawSealStore.record
    def crash_after_raw_seal(self, request, raw_draft, artifacts, effective_arguments):
        original_record(self, request, raw_draft, artifacts, effective_arguments)
        raise PowerLoss()
    def crash_before_raw_seal(self, request, raw_draft, artifacts, effective_arguments):
        raise PowerLoss()
    def crash_before_phase_receipt(self, binding, phase, inputs, decision):
        assert phase == "after_tool_call"
        raise PowerLoss()
    original_persist = DurableToolBoundary.persist_prepared_result
    def crash_before_visible_result(self, *args, **kwargs):
        if args and args[0].call_id == "child-approval-call":
            raise PowerLoss()
        return original_persist(self, *args, **kwargs)

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        first = host(bridge, _StrictOpenAIClient([_approval_tool_response()]), guard)
        first.create({})
        with monkeypatch.context() as fault:
            if crash_phase == "before_raw_seal":
                fault.setattr(HookRawSealStore, "record", crash_before_raw_seal)
            elif crash_phase == "raw_seal":
                fault.setattr(HookRawSealStore, "record", crash_after_raw_seal)
            else:
                if crash_phase == "phase_receipt":
                    fault.setattr(HookPhaseJournal, "record", crash_before_phase_receipt)
                else:
                    fault.setattr(DurableToolBoundary, "persist_prepared_result",
                        crash_before_visible_result)
            with pytest.raises(PowerLoss):
                first.run(original_task="after hook recovery")

    cold_bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    cold_client = _StrictOpenAIClient([_final_response("safe"), _final_response("safe")])
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        cold = host(cold_bridge, cold_client, guard)
        recovered = cold.recover()


    assert effects == ["approved child value"]
    if crash_phase == "before_raw_seal":
        assert recovered.status == "outcome_unknown"
        assert hook_calls == [] and cold_client.requests == []
        events = cold.store.journal.capture_snapshot().events
        assert not any(event.event_type in {"tool.hook_raw.sealed", "tool_result"}
                       and event.payload.get("call_id") == "child-approval-call"
                       for event in events)
        return
    assert recovered.status == "completed"
    assert len(hook_calls) == 1
    assert len(cold_client.requests) == 1
    assert "RAW_SENTINEL" not in repr(cold_client.requests)
    events = cold.store.journal.capture_snapshot().events
    assert sum(event.event_type == "tool.hook_raw.sealed" for event in events) == 1
    assert sum(event.event_type == "tool_result" and event.payload.get("call_id") == "child-approval-call"
               for event in events) == 1


def test_after_hook_recovery_selects_only_unfinished_tool_turn(tmp_path, monkeypatch):
    from unchain.skeleton.hook_raw_seal import HookRawSealStore

    execution_id = "skeleton-after-second-turn-recovery"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    document = _document_with_hook_pool(_agent_document())
    next(node for node in document["nodes"] if node["type"] == "hooks_pool")["config"]["hooks"][0]["event"] = "after_tool_call"
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 4
    plan = prepare_agent_graph(document)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    effects = []
    second_turn = deepcopy(_approval_tool_response())
    second_turn.id = "second-tool-turn"
    second_turn.output[0]["call_id"] = "second-tool-call"
    second_turn.output[0]["arguments"] = '{"value":"second value"}'

    def resolve(workflow_id, revision_id):
        return PublishedWorkflow(workflow_id, revision_id, _after_hook_execution_workflow(workflow_id))

    def code_handler(context, inputs):
        if context.document_id == "policy-workflow":
            return WorkflowNodeCompleted({"decision": "replace", "result": {"visible": "safe"}})
        return WorkflowNodeCompleted({"message": "done", "evidence": "safe"})

    def host(current_bridge, client, guard):
        return _host_execution(plan, current_bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (Tool.from_callable(
                lambda value: effects.append(value) or {"visible": value, "private": "RAW_SENTINEL"},
                name="dangerous_tool", requires_confirmation=False),),
            hook_workflow_resolver=resolve, other_handlers={"code": code_handler})

    class PowerLoss(BaseException):
        pass
    original_record = HookRawSealStore.record
    seals = []
    def crash_on_second_seal(self, request, raw_draft, artifacts, effective_arguments):
        result = original_record(self, request, raw_draft, artifacts, effective_arguments)
        seals.append(request.call_id)
        if len(seals) == 2:
            raise PowerLoss()
        return result

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        first = host(bridge, _StrictOpenAIClient([_approval_tool_response(), second_turn]), guard)
        first.create({})
        with monkeypatch.context() as fault:
            fault.setattr(HookRawSealStore, "record", crash_on_second_seal)
            with pytest.raises(PowerLoss):
                first.run(original_task="two tool turns")
    assert effects == ["approved child value", "second value"]
    assert seals == ["child-approval-call", "second-tool-call"]
    cold_bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    cold_client = _StrictOpenAIClient([_final_response("safe")])
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        cold = host(cold_bridge, cold_client, guard)
        recovered = cold.recover()
    assert recovered.status == "completed"
    assert effects == ["approved child value", "second value"]
    assert len(cold_client.requests) == 1
    assert "RAW_SENTINEL" not in repr(cold_client.requests)


@pytest.mark.parametrize("approved", [True, False, None])
@pytest.mark.parametrize("crash_after_seal", [False, True])
def test_after_hook_child_approval_waits_after_parent_tool_and_resumes_once(
    tmp_path, monkeypatch, approved, crash_after_seal,
):
    from unchain.skeleton.hook_raw_seal import HookRawSealStore
    from unchain.skeleton import SkeletonToolRuntime
    from unchain.tools.toolkit import Toolkit

    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-after-child-approval")
    document = _document_with_hook_pool(_agent_document())
    next(node for node in document["nodes"] if node["type"] == "hooks_pool")["config"]["hooks"][0]["event"] = "after_tool_call"
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 3
    plan = prepare_agent_graph(document)
    workflow = _after_hook_execution_workflow("policy-workflow")
    step = next(node for node in workflow["nodes"] if node["id"] == "code")
    step["type"] = "tool_call"
    step["config"] = {
        "execution": {
            "inputs": [{"name": "value", "value": {"kind": "ref", "node_id": "start",
                        "path": ["visible_result", "visible"]}, "missing": "error"}],
            "outputs": [{"name": name, "source": {"kind": "result", "path": ["result", name]}}
                        for name in ("decision", "result")],
        },
        "tool": {"name": "hook_decision", "on_error": "stop", "approval_timeout_ms": 30000},
    }
    toolkit = Toolkit()
    child_calls, parent_calls = [], []

    @toolkit.tool(name="hook_decision", requires_confirmation=True)
    def hook_decision(value: str):
        child_calls.append(value)
        return {"decision": "replace", "result": {"visible": "safe"}}

    def resolve(workflow_id, revision_id):
        assert (workflow_id, revision_id) == ("policy-workflow", "rev-1")
        return PublishedWorkflow(workflow_id, revision_id, deepcopy(workflow))

    def handlers(_store, child_plan):
        return {"tool_call": SkeletonToolRuntime(
            child_plan, toolkit, session_id=bridge.execution_id, clock_ms=lambda: 100,
        )}

    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    client = _StrictOpenAIClient([_approval_tool_response(), _final_response("safe")])
    def host(current_bridge, guard):
        return _host_execution(plan, current_bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (Tool.from_callable(
                lambda value: parent_calls.append(value) or {"visible": value, "private": "RAW_SENTINEL"},
                name="dangerous_tool", requires_confirmation=False),),
            child_handlers_factory=handlers, hook_workflow_resolver=resolve,
            other_handlers={"code": lambda _context, _inputs: WorkflowNodeCompleted({"message": "done", "evidence": "safe"})})
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        first = host(bridge, guard)
        first.create({})
        if crash_after_seal:
            class PowerLoss(BaseException):
                pass
            original_record = HookRawSealStore.record
            def crash(self, request, raw_draft, artifacts, effective_arguments):
                original_record(self, request, raw_draft, artifacts, effective_arguments)
                raise PowerLoss()
            with monkeypatch.context() as fault:
                fault.setattr(HookRawSealStore, "record", crash)
                with pytest.raises(PowerLoss):
                    first.run(original_task="approve after Hook")
        else:
            waiting, receipt = first.run(original_task="approve after Hook")
            assert waiting.status == "waiting" and receipt is None
    if crash_after_seal:
        cold_bridge = _bridge(tmp_path, monkeypatch, execution_id=bridge.execution_id)
        with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
            cold = host(cold_bridge, guard)
            waiting = cold.recover()
        assert waiting.status == "waiting"
    assert parent_calls == ["approved child value"] and child_calls == []
    active = first.store.load().state["active"]
    assert active["wait"]["kind"] == "interaction"
    events = first.store.journal.capture_snapshot().events
    assert sum(event.event_type == "tool.hook_raw.sealed" for event in events) == 1
    assert not any(event.event_type == "tool_result" and event.payload.get("call_id") == "child-approval-call"
                   for event in events)
    if approved is None:
        with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
            cold = host(_bridge(tmp_path, monkeypatch, execution_id=bridge.execution_id), guard)
            cancelled = cold.cancel()
        assert cancelled.status == "cancelled"
        assert child_calls == [] and parent_calls == ["approved child value"]
        assert len(client.requests) == 1
        assert not any(event.event_type == "tool_result"
            and event.payload.get("call_id") == "child-approval-call"
            for event in cold.store.journal.capture_snapshot().events)
        return
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        cold = host(_bridge(tmp_path, monkeypatch, execution_id=bridge.execution_id), guard)
        completed, receipt = cold.resume_interaction(
            active["wait"]["id"],
            {"approved": approved, "modified_arguments": None,
             "reason": "approved" if approved else "rejected"},
            node_invocation_id=active["node_invocation_id"],
            original_task="approve after Hook",
        )
    assert parent_calls == ["approved child value"]
    if approved:
        assert completed.status == "completed" and receipt is not None
        assert child_calls == ["approved child value"]
        assert len(client.requests) == 2
        assert "RAW_SENTINEL" not in repr(client.requests[1:])
    else:
        assert completed.status in {"failed", "outcome_unknown"} and receipt is None
        assert child_calls == []
        assert len(client.requests) == 1
        assert not any(event.event_type == "tool_result"
            and event.payload.get("call_id") == "child-approval-call"
            for event in cold.store.journal.capture_snapshot().events)


def test_host_admits_hook_workflows_before_graph_or_model_dispatch(tmp_path, monkeypatch):
    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-host-hook-admission")
    plan = _single_plan_with_hook_pool()
    resolved = []
    client = _StrictOpenAIClient([_final_response()])
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")

    def resolve(workflow_id, revision_id):
        resolved.append((workflow_id, revision_id))
        return PublishedWorkflow(workflow_id, revision_id, _hook_workflow(workflow_id))

    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            hook_workflow_resolver=resolve,
        )
        assert resolved == [("policy-workflow", "rev-1")]
        assert client.requests == []
        assert execution.runner.handlers["agent"].hook_runtime is not None
        execution.create({})
        durable, receipt = execution.run(original_task="hook admission")

    assert durable.status == "completed"
    assert receipt is not None
    assert len(client.requests) == 1
    assert resolved == [("policy-workflow", "rev-1")]


def test_host_runs_pinned_before_hook_workflow_before_parent_tool_execution(tmp_path, monkeypatch):
    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-host-hook-execution")
    document = _document_with_hook_pool(_agent_document())
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 3
    plan = prepare_agent_graph(document)
    client = _StrictOpenAIClient([
        _approval_tool_response(),
        _final_response("hook result"),
        _final_response("hook result"),
    ])
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    tool_calls = []
    hook_inputs = []

    def resolve(workflow_id, revision_id):
        assert (workflow_id, revision_id) == ("policy-workflow", "rev-1")
        return PublishedWorkflow(
            workflow_id,
            revision_id,
            _before_hook_execution_workflow(workflow_id),
        )

    def code_handler(context, inputs):
        if context.document_id == "policy-workflow":
            hook_inputs.append(deepcopy(inputs))
            return WorkflowNodeCompleted({
                "decision": "continue",
                "require_approval": False,
                "arguments": {"value": "normalized by hook"},
            })
        return WorkflowNodeCompleted({
            "message": "postprocessed End reply",
            "evidence": "derived " + inputs["model_answer"],
        })

    def dangerous_tool(value):
        tool_calls.append(value)
        return {"value": value}

    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(
            plan,
            bridge,
            client=client,
            guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (
                Tool.from_callable(
                    dangerous_tool,
                    name="dangerous_tool",
                    requires_confirmation=False,
                ),
            ),
            hook_workflow_resolver=resolve,
            other_handlers={"code": code_handler},
        )
        execution.create({})
        result, receipt = execution.run(original_task="hook execution")

    assert result.status == "completed"
    assert receipt is not None
    assert tool_calls == ["normalized by hook"]
    assert hook_inputs == [{
        "event": "before_tool_call",
        "call_id": "child-approval-call",
        "tool_name": "dangerous_tool",
        "arguments": {"value": "approved child value"},
    }]
    receipts = [event for event in execution.store.journal.capture_snapshot().events
                if event.event_type == "skeleton.hook_phase.receipt"]
    assert len(receipts) == 1
    assert receipts[0].payload["phase"] == "before_tool_call"
    assert receipts[0].payload["hook_id"] == "policy"
    assert receipts[0].payload["call_id"] == "child-approval-call"


@pytest.mark.parametrize("child_approved,parent_approved,revision_drift,nested", [
    (True, True, False, False), (True, False, False, False),
    (False, None, False, False), (True, None, True, False),
    (True, True, False, True),
])
def test_before_hook_tool_approval_waits_with_durable_child_identity(
    tmp_path, monkeypatch, child_approved, parent_approved, revision_drift, nested,
):
    from unchain.skeleton import SkeletonToolRuntime, prepare_workflow
    from unchain.tools.toolkit import Toolkit

    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-hook-child-approval")
    document = _document_with_hook_pool(_agent_document())
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 3
    plan = prepare_agent_graph(document)
    workflow = _before_hook_execution_workflow("policy-workflow")
    tool_step = {
        "execution": {
            "inputs": [{"name": "value", "value": {"kind": "ref", "node_id": "start", "path": ["arguments", "value"]}, "missing": "error"}],
            "outputs": [
                {"name": name, "source": {"kind": "result", "path": ["result", name]}}
                for name in ("decision", "require_approval", "arguments")
            ],
        },
        "tool": {"name": "hook_decision", "on_error": "stop", "approval_timeout_ms": 30000},
    }
    step = next(node for node in workflow["nodes"] if node["id"] == "code")
    leaf_workflow = None
    if nested:
        leaf_workflow = deepcopy(workflow)
        leaf_workflow["id"] = "nested-policy-workflow"
        leaf_workflow["name"] = "Nested policy workflow"
        leaf_step = next(node for node in leaf_workflow["nodes"] if node["id"] == "code")
        leaf_step["type"] = "tool_call"
        leaf_step["config"] = deepcopy(tool_step)
        step["type"] = "workflow_call"
        step["config"] = {
            "workflow": {"workflow_id": "nested-policy-workflow", "revision_id": "rev-nested"},
            "execution": deepcopy(step["config"]["execution"]),
        }
    else:
        step["type"] = "tool_call"
        step["config"] = tool_step
    toolkit = Toolkit()
    child_calls = []
    parent_calls = []

    @toolkit.tool(name="hook_decision", requires_confirmation=True)
    def hook_decision(value: str):
        child_calls.append(value)
        return {"decision": "continue", "require_approval": True,
                "arguments": {"value": value + " from child"}}

    def resolve(workflow_id, revision_id):
        if (workflow_id, revision_id) == ("policy-workflow", "rev-1"):
            return PublishedWorkflow(workflow_id, revision_id, deepcopy(workflow))
        assert nested and (workflow_id, revision_id) == ("nested-policy-workflow", "rev-nested")
        return PublishedWorkflow(workflow_id, revision_id, deepcopy(leaf_workflow))

    def handlers(_store, child_plan):
        return {"tool_call": SkeletonToolRuntime(
            child_plan, toolkit, session_id=bridge.execution_id, clock_ms=lambda: 100,
        )}

    client = _StrictOpenAIClient([
        _approval_tool_response(), _final_response("hook child approved"),
        _final_response("hook child approved"),
    ])
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    def host(guard):
        return _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (
                Tool.from_callable(lambda value: parent_calls.append(value) or {"value": value},
                                   name="dangerous_tool", requires_confirmation=False),
            ),
            child_handlers_factory=handlers,
            hook_workflow_resolver=resolve,
        )
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = host(guard)
        execution.create({})
        result, receipt = execution.run(original_task="approve Hook child")
        assert result.status == "waiting"
        assert receipt is None
        assert len(client.requests) == 1
        assert child_calls == parent_calls == []
        active = execution.store.load().state["active"]
        assert active["wait"]["kind"] == "interaction"
        request = execution.store.read_json(active["wait"]["request_ref"])
        hook_wait = request["subject"]["hook_child_wait"]
        assert hook_wait["schema"] == "unchain.hook_child_wait.v1"
        assert hook_wait["parent_tool_call"] == {
            "call_id": "child-approval-call", "tool_name": "dangerous_tool",
        }
        assert hook_wait["child_wait_kind"] == "interaction"
        assert hook_wait["interaction_request"]["kind"] == "tool_approval"
        from unchain.skeleton.hooks_runtime import validate_hook_child_wait
        for broken in (
            {**hook_wait, "unknown": True},
            {**hook_wait, "schema": "unchain.hook_child_wait.v999"},
            {**hook_wait, "parent_tool_call": {"call_id": "other", "tool_name": "dangerous_tool"}},
            {**hook_wait, "child_wait_id": "wrong-child"},
        ):
            with pytest.raises(ValueError):
                validate_hook_child_wait(broken, parent_call_id="child-approval-call",
                    parent_tool_name="dangerous_tool")
    if revision_drift:
        workflow["name"] = "changed after the published revision was pinned"
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = host(guard)
        with pytest.raises(SkeletonValidationError):
            execution.resume_interaction("stale-child-wait", True,
                node_invocation_id=active["node_invocation_id"],
                original_task="approve Hook child")
        assert child_calls == parent_calls == []
        after_child, receipt = execution.resume_interaction(
            active["wait"]["id"],
            {"approved": child_approved, "modified_arguments": None,
             "reason": "approved child" if child_approved else "rejected child"},
            node_invocation_id=active["node_invocation_id"],
            original_task="approve Hook child",
        )
        if revision_drift:
            assert after_child.status == "outcome_unknown"
            assert receipt is None
            assert child_calls == parent_calls == []
            assert len(client.requests) == 1
            return
        if not child_approved:
            assert after_child.status in {"failed", "outcome_unknown"}
            assert receipt is None
            assert child_calls == parent_calls == []
            assert len(client.requests) == 1
            return
        assert after_child.status == "waiting", after_child.error
        assert receipt is None
        assert child_calls == ["approved child value"]
        assert parent_calls == []
        assert len(client.requests) == 1
        parent_active = execution.store.load().state["active"]
        assert parent_active["wait"]["kind"] == "interaction"
        assert parent_active["wait"]["id"] != active["wait"]["id"]
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = host(guard)
        with pytest.raises(SkeletonValidationError):
            execution.resume_interaction(active["wait"]["id"], True,
                node_invocation_id=parent_active["node_invocation_id"],
                original_task="approve Hook child")
        assert child_calls == ["approved child value"]
        assert parent_calls == []
        completed, receipt = execution.resume_interaction(
            parent_active["wait"]["id"], parent_approved,
            node_invocation_id=parent_active["node_invocation_id"],
            original_task="approve Hook child",
        )
        assert completed.status == "completed"
        assert receipt is not None
        assert child_calls == ["approved child value"]
        assert parent_calls == (["approved child value from child"] if parent_approved else [])


def test_uncertain_before_hook_child_stops_the_parent_before_another_model_turn(tmp_path, monkeypatch):
    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-host-hook-uncertain")
    document = _document_with_hook_pool(_agent_document())
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 3
    plan = prepare_agent_graph(document)
    client = _StrictOpenAIClient([_approval_tool_response(), _final_response("must not run")])
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    tool_calls = []

    def resolve(workflow_id, revision_id):
        return PublishedWorkflow(
            workflow_id,
            revision_id,
            _before_hook_execution_workflow(workflow_id),
        )

    def code_handler(context, inputs):
        del inputs
        if context.document_id == "policy-workflow":
            raise RuntimeError("Hook process may have changed the outside world")
        return WorkflowNodeCompleted({"message": "postprocessed", "evidence": "unused"})

    def dangerous_tool(value):
        tool_calls.append(value)
        return {"value": value}

    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(
            plan,
            bridge,
            client=client,
            guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (
                Tool.from_callable(dangerous_tool, name="dangerous_tool", requires_confirmation=False),
            ),
            hook_workflow_resolver=resolve,
            other_handlers={"code": code_handler},
        )
        execution.create({})
        result, receipt = execution.run(original_task="uncertain Hook child")

    assert result.status == "outcome_unknown"
    assert receipt is None
    assert tool_calls == []
    assert len(client.requests) == 1


@pytest.mark.parametrize("authority_loss", ("same_host", "rebuilt_host", "released_guard"))
def test_parent_authority_terminates_active_before_hook_code_worker(tmp_path, monkeypatch, authority_loss):
    """The active Hook Code process must stop when parent authority ends."""
    started = tmp_path / "hook-code-started"
    release = tmp_path / "release-hook-code"
    late_effect = tmp_path / "hook-code-late-effect"
    source_root = tmp_path / "hook-source"
    source_root.mkdir()
    (source_root / "main.py").write_text(
        "from pathlib import Path\n"
        "import time\n"
        f"STARTED = Path({str(started)!r})\n"
        f"RELEASE = Path({str(release)!r})\n"
        f"LATE_EFFECT = Path({str(late_effect)!r})\n"
        "def main(input, context):\n"
        "    STARTED.write_text('started', encoding='utf-8')\n"
        "    while not RELEASE.exists():\n"
        "        time.sleep(0.01)\n"
        "    LATE_EFFECT.write_text('must never happen', encoding='utf-8')\n"
        "    return {'decision': 'continue', 'require_approval': False, 'arguments': input['arguments']}\n",
        encoding="utf-8",
    )
    workflow_id = "cancellable-hook"
    hook_document = _before_hook_execution_workflow(workflow_id)
    code = next(node for node in hook_document["nodes"] if node["id"] == "code")
    code["config"]["code"] = {
        "source": {"kind": "file", "path": "main.py"},
        "environment_profile_id": "host-python",
        "timeout_ms": 10_000,
        "max_result_bytes": 1_048_576,
        "max_log_bytes": 65_536,
        "result_schema": {"type": "object"},
        "artifacts": [],
    }
    document = _document_with_hook_pool(_agent_document(), workflow_id=workflow_id)
    next(node for node in document["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 3
    plan = prepare_agent_graph(document)
    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-host-hook-cancel")
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    profile = PythonEnvironmentProfile.venv("host-python", sys.executable)

    def resolve(resolved_workflow_id, revision_id):
        assert (resolved_workflow_id, revision_id) == (workflow_id, "rev-1")
        return PublishedWorkflow(workflow_id, revision_id, hook_document)

    def child_handlers(_store, child_plan):
        return {
            "code": SkeletonCodeRuntime(
                child_plan,
                source_resolver=FileCodeSourceResolver(source_root),
                profile_resolver=lambda profile_id: profile if profile_id == profile.profile_id else None,
                staging_root=tmp_path / "code-staging",
                poll_interval_s=0.01,
            ),
        }

    cancelled = []
    client = _StrictOpenAIClient([_approval_tool_response()])
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution = _host_execution(
            plan, bridge,
            client=client,
            guard=guard, memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (
                Tool.from_callable(lambda value: {"value": value}, name="dangerous_tool"),
            ),
            child_handlers_factory=child_handlers,
            hook_workflow_resolver=resolve,
        )
        execution.create({})

        def end_parent_authority_after_worker_starts():
            deadline = time.monotonic() + 5
            while not started.exists() and time.monotonic() < deadline:
                time.sleep(0.01)
            assert started.exists(), "Hook Code worker did not start"
            if authority_loss == "same_host":
                cancelled.append(execution.runner.cancel())
            elif authority_loss == "rebuilt_host":
                rebuilt = _host_execution(
                    plan, bridge,
                    client=client,
                    guard=guard, memory=KernelMemoryRuntime.from_config(store=memory_store),
                    tools_for_node=lambda _context: (
                        Tool.from_callable(lambda value: {"value": value}, name="dangerous_tool"),
                    ),
                    child_handlers_factory=child_handlers,
                    hook_workflow_resolver=resolve,
                )
                assert rebuilt._active_hook_runners == {}
                cancelled.append(rebuilt.runner.cancel())
            else:
                guard.release()
                cancelled.append("guard released")
            time.sleep(0.2)
            release.write_text("release", encoding="utf-8")

        cancellation = Thread(target=end_parent_authority_after_worker_starts)
        cancellation.start()
        result = None
        host_error = None
        try:
            result, _receipt = execution.run(original_task="cancel active Hook code")
        except JournalConflictError as error:
            host_error = error
        finally:
            release.write_text("release", encoding="utf-8")
            cancellation.join(timeout=5)

    assert not cancellation.is_alive()
    assert cancelled
    if authority_loss == "released_guard":
        assert cancelled == ["guard released"]
        assert execution.runner.inspect().status == "outcome_unknown"
    else:
        assert cancelled[0].status == "cancelled"
        assert execution.runner.inspect().status == "cancelled"
    assert result is None or result.status != "completed"
    assert host_error is None or isinstance(host_error, JournalConflictError)
    assert not late_effect.exists()


def test_host_rejects_hook_pools_without_a_workflow_resolver(tmp_path, monkeypatch):
    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-host-hook-resolver")
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    client = _StrictOpenAIClient([])

    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        with pytest.raises(ValueError, match="hook_workflow_resolver"):
            _host_execution(
                _single_plan_with_hook_pool(), bridge, client=client, guard=guard,
                memory=KernelMemoryRuntime.from_config(store=memory_store),
            )

    assert client.requests == []


def _parent_with_pool(child=None, *, with_after_hook=False):
    child = _agent_document() if child is None else deepcopy(child)
    child["id"] = "reviewer-agent"
    child["name"] = "Reviewer Agent"
    parent = _agent_document()
    kernel = next(node for node in parent["nodes"] if node["type"] == "agent")
    kernel["config"]["kernel"]["max_iterations"] = 2
    parent["nodes"].append({
        "id": "reviewers", "type": "subagent_pool", "config": {"subagents": [{
            "id": "reviewer", "name": "Reviewer", "description": "review",
            "source": {"kind": "embedded", "document": child},
            "allowed_modes": ["delegate", "handoff", "worker"],
            "output_mode": "summary", "memory_policy": "ephemeral",
            "parallel_safe": True, "allowed_tools": None, "disabled_tools": [],
        }]},
    })
    parent["edges"].append({
        "id": "attach-reviewers", "kind": "attach",
        "source_node_id": kernel["id"], "source_port_id": "attach_bot",
        "target_node_id": "reviewers", "target_port_id": "attach_top",
    })
    if with_after_hook:
        parent = _document_with_hook_pool(parent)
        hook = next(node for node in parent["nodes"] if node["type"] == "hooks_pool")["config"]["hooks"][0]
        hook["event"] = "after_tool_call"
        hook["tool_name"] = "handoff_to_subagent"
    manifest = [{
        "pool_node_id": "reviewers", "kernel_node_id": kernel["id"],
        "entry_id": "reviewer", "name": "Reviewer", "description": "review",
        "allowed_modes": ["delegate", "handoff", "worker"],
        "output_mode": "summary", "memory_policy": "ephemeral",
        "parallel_safe": True, "allowed_tools": None, "disabled_tools": [],
        "source_kind": "embedded", "agent_id": None, "edit_token": None,
        "definition_digest": "fixed-by-preflight", "document": child,
        "subagents": [],
    }]
    return prepare_agent_graph(parent), manifest


def test_after_hook_runs_before_terminal_handoff_and_parent_end(tmp_path, monkeypatch):
    execution_id = "skeleton-handoff-after-hook"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool(with_after_hook=True)
    client = _StrictOpenAIClient([_handoff_response(), _final_response("child model")])
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    hook_inputs = []

    def resolve(workflow_id, revision_id):
        return PublishedWorkflow(workflow_id, revision_id, _after_hook_execution_workflow(workflow_id))

    def child_handlers(_store, _plan):
        def code(context, inputs):
            if context.document_id == "policy-workflow":
                hook_inputs.append(deepcopy(inputs))
                return WorkflowNodeCompleted({"decision": "replace",
                    "result": {"visible": "sanitized"}})
            return WorkflowNodeCompleted({
                "message": '{"answer":"child handoff"}',
                "evidence": "child derived " + inputs["model_answer"],
            })
        return {"code": code}

    def code_handler(context, inputs):
        return WorkflowNodeCompleted({"message": "postprocessed End reply",
            "evidence": "derived " + inputs["model_answer"]})

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            subagent_manifests=manifests, child_handlers_factory=child_handlers,
            hook_workflow_resolver=resolve, other_handlers={"code": code_handler})
        execution.create({})
        result, receipt = execution.run(original_task="handoff after Hook")
    assert result.status == "completed" and receipt is not None, result.error
    assert result.outputs["message"] == "postprocessed End reply"
    assert len(client.requests) == 2 and len(hook_inputs) == 1
    events = execution.store.journal.capture_snapshot().events
    after_receipt = next(event for event in events if event.event_type == "skeleton.hook_phase.receipt"
        and event.payload.get("phase") == "after_tool_call")
    kernel_result = next(event for event in events if event.event_type == "skeleton.kernel_result.saved"
        and event.payload.get("graph_id") == execution.store.graph_id)
    assert after_receipt.store_seq < kernel_result.store_seq


def _document_with_subagent_pool(document, child):
    document = deepcopy(document)
    kernel = next(node for node in document["nodes"] if node["type"] == "agent")
    document["nodes"].append({
        "id": "nested-reviewers", "type": "subagent_pool", "config": {"subagents": [{
            "id": "nested-reviewer", "name": "Nested Reviewer", "description": "review",
            "source": {"kind": "embedded", "document": deepcopy(child)},
            "allowed_modes": ["delegate", "handoff", "worker"],
            "output_mode": "summary", "memory_policy": "ephemeral",
            "parallel_safe": True, "allowed_tools": None, "disabled_tools": [],
        }]},
    })
    document["edges"].append({
        "id": "attach-nested-reviewers", "kind": "attach",
        "source_node_id": kernel["id"], "source_port_id": "attach_bot",
        "target_node_id": "nested-reviewers", "target_port_id": "attach_top",
    })
    return document


def test_host_preflights_fixed_child_hook_workflows_before_root_dispatch(tmp_path, monkeypatch):
    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-host-child-hook-admission")
    child = _document_with_hook_pool(
        _agent_document(), workflow_id="missing-child-hook", revision_id="missing-revision",
    )
    child["id"] = "reviewer-agent"
    child["name"] = "Reviewer Agent"
    plan, manifests = _parent_with_pool(child)
    resolved = []
    client = _StrictOpenAIClient([])
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")

    def resolve(workflow_id, revision_id):
        resolved.append((workflow_id, revision_id))
        raise ValueError("missing published workflow")

    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        with pytest.raises(SkeletonValidationError, match="unavailable"):
            _host_execution(
                plan, bridge, client=client, guard=guard,
                memory=KernelMemoryRuntime.from_config(store=memory_store),
                subagent_manifests=manifests, hook_workflow_resolver=resolve,
            )

    assert resolved == [("missing-child-hook", "missing-revision")]
    assert client.requests == []


def test_host_recursively_preflights_nested_child_hook_workflows(tmp_path, monkeypatch):
    bridge = _bridge(tmp_path, monkeypatch, execution_id="skeleton-host-nested-hook-admission")
    grandchild = _document_with_hook_pool(
        _agent_document(), workflow_id="missing-nested-hook", revision_id="missing-revision",
    )
    grandchild["id"] = "nested-reviewer-agent"
    grandchild["name"] = "Nested Reviewer Agent"
    child = _document_with_subagent_pool(_agent_document(), grandchild)
    child["id"] = "reviewer-agent"
    child["name"] = "Reviewer Agent"
    plan, manifests = _parent_with_pool(child)
    manifests[0]["subagents"] = [{
        "pool_node_id": "nested-reviewers", "kernel_node_id": "agent", "entry_id": "nested-reviewer",
        "name": "Nested Reviewer", "description": "review",
        "allowed_modes": ["delegate", "handoff", "worker"],
        "output_mode": "summary", "memory_policy": "ephemeral",
        "parallel_safe": True, "allowed_tools": None, "disabled_tools": [],
        "source_kind": "embedded", "agent_id": None, "edit_token": None,
        "definition_digest": "fixed-by-preflight", "document": grandchild, "subagents": [],
    }]
    resolved = []
    client = _StrictOpenAIClient([])
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")

    def resolve(workflow_id, revision_id):
        resolved.append((workflow_id, revision_id))
        raise ValueError("missing published workflow")

    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        with pytest.raises(SkeletonValidationError, match="unavailable"):
            _host_execution(
                plan, bridge, client=client, guard=guard,
                memory=KernelMemoryRuntime.from_config(store=memory_store),
                subagent_manifests=manifests, hook_workflow_resolver=resolve,
            )

    assert resolved == [("missing-nested-hook", "missing-revision")]
    assert client.requests == []


def _subagent_tool_response(name, arguments, suffix):
    return SimpleNamespace(
        id="subagent-" + suffix,
        output=[{
            "type": "function_call", "call_id": "subagent-call-" + suffix,
            "name": name, "arguments": arguments,
        }],
        usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7},
    )


def _resume_child_wait(execution, *, original_task):
    active = execution.store.load().state["active"]
    return execution.resume_subagent_interaction(
        active["wait"]["id"], True,
        node_invocation_id=active["node_invocation_id"], original_task=original_task,
    )


def _event_contents(events):
    return [str(_thaw_json(event.payload)) for event in events]


def test_skeleton_handoff_completes_only_kernel_then_code_and_parent_end(
    tmp_path, monkeypatch,
):
    execution_id = "skeleton-host-handoff"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    client = _StrictOpenAIClient([_handoff_response(), _final_response("child model")])
    sdk_calls = []
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    memory = KernelMemoryRuntime.from_config(store=memory_store)

    def child_handlers(_store, _plan):
        return {"code": lambda _context, inputs: WorkflowNodeCompleted({
            "message": '{"answer":"child handoff"}',
            "evidence": "child derived " + inputs["model_answer"],
        })}

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard, memory=memory,
            sdk_calls=sdk_calls, subagent_manifests=manifests,
            child_handlers_factory=child_handlers,
        )
        execution.create({})
        durable, receipt = execution.run(original_task="handoff root")

    assert durable.status == "completed"
    assert durable.outputs["message"] == "postprocessed End reply"
    assert receipt is not None
    assert len(client.requests) == 2
    assert client.requests[0]["tools"][0]["name"] in {
        "delegate_to_subagent", "handoff_to_subagent", "spawn_worker_batch",
    }
    assert any(tool["name"] == "handoff_to_subagent" for tool in client.requests[0]["tools"])
    assert not client.requests[1].get("tools") or all(
        tool["name"] != "handoff_to_subagent" for tool in client.requests[1].get("tools", [])
    )
    events = execution.store.journal.capture_snapshot().events
    root_final = [event for event in events if event.event_type == "final_message"
                  and event.attempt == execution.store.attempt]
    assert len(root_final) == 1
    parent_kernel_results = [event for event in events
                             if event.event_type == "skeleton.kernel_result.saved"
                             and event.attempt.generation == execution.store.attempt.generation]
    assert len(parent_kernel_results) >= 2


def test_subagent_approval_cold_resume_does_not_resend_parent_or_commit_child_reply(
    tmp_path, monkeypatch,
):
    execution_id = "skeleton-host-child-approval"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    first_client = _StrictOpenAIClient([_handoff_response(), _approval_tool_response()])
    tool_calls = []
    tool = Tool.from_callable(
        lambda value: tool_calls.append(value) or {"applied": value},
        name="dangerous_tool", requires_confirmation=True,
    )
    memory_path = tmp_path / "kernel-sessions"

    def tools_for_node(_context):
        return (tool,)

    def child_handlers(_store, _plan):
        return {"code": lambda _context, inputs: WorkflowNodeCompleted({
            "message": '{"answer":"child approved"}',
            "evidence": "child derived " + inputs["model_answer"],
        })}

    first_store = JsonFileSessionStore(memory_path)
    with ExecutionRuntime(first_store).scope(execution_id) as guard:
        first = _host_execution(
            plan, bridge, client=first_client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=first_store),
            tools_for_node=tools_for_node, subagent_manifests=manifests,
            child_handlers_factory=child_handlers,
        )
        first.create({})
        waiting, receipt = first.run(original_task="approve child")

    assert waiting.status == "waiting", waiting.error
    assert receipt is None
    assert tool_calls == []
    assert len(first_client.requests) == 2
    root_active = first.store.load().state["active"]
    root_wait = root_active["wait"]
    assert root_wait["kind"] == "child"
    public_request = first.store.read_json(root_wait["request_ref"])
    assert set(public_request) == {
        "schema", "parent_graph_id", "parent_node_invocation_id", "parent_kernel_node_id",
        "child_graph_id", "child_attempt_id", "entry_id", "definition_digest",
        "child_guard_session_id", "child_node_invocation_id", "child_wait_kind", "child_wait_id",
        "interaction_request", "mode", "parent_tool_call",
    }
    assert public_request["schema"] == "pupu.skeleton_subagent_wait.v2"
    assert public_request["parent_tool_call"] == {
        "call_id": "handoff-call", "tool_name": "handoff_to_subagent",
    }
    assert public_request["child_wait_kind"] == "interaction"
    assert public_request["mode"] == "handoff"

    cold_client = _StrictOpenAIClient([_final_response("child after approval")])
    cold_store = JsonFileSessionStore(memory_path)
    with ExecutionRuntime(cold_store).scope(execution_id) as guard:
        cold = _host_execution(
            plan, bridge, client=cold_client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=cold_store),
            tools_for_node=tools_for_node, subagent_manifests=manifests,
            child_handlers_factory=child_handlers,
        )
        with pytest.raises(ValueError, match="not current"):
            cold.resume_subagent_interaction(
                "subagent.wrong", True,
                node_invocation_id=root_active["node_invocation_id"],
                original_task="approve child",
            )
        assert tool_calls == []
        completed, receipt = cold.resume_subagent_interaction(
            root_wait["id"], True,
            node_invocation_id=root_active["node_invocation_id"],
            original_task="approve child",
        )

    assert completed.status == "completed"
    assert completed.outputs["message"] == "postprocessed End reply"
    assert receipt is not None
    assert tool_calls == ["approved child value"]
    assert len(first_client.requests) == 2
    assert len(cold_client.requests) == 1
    events = cold.store.journal.capture_snapshot().events
    root_final = [event for event in events if event.event_type == "final_message"
                  and event.attempt == cold.store.attempt]
    assert len(root_final) == 1
    assert root_final[0].payload["content"] == "postprocessed End reply"
    with pytest.raises(ValueError, match="not current"):
        cold.resume_subagent_interaction(
            root_wait["id"], True,
            node_invocation_id=root_active["node_invocation_id"],
            original_task="approve child",
        )
    assert tool_calls == ["approved child value"]


def test_subagent_approval_cold_resume_rejects_sibling_guard_session_before_effects(
    tmp_path, monkeypatch,
):
    execution_id = "skeleton-host-child-sibling-session"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    first_client = _StrictOpenAIClient([_handoff_response(), _approval_tool_response()])
    tool_calls = []
    tool = Tool.from_callable(
        lambda value: tool_calls.append(value) or {"applied": value},
        name="dangerous_tool", requires_confirmation=True,
    )
    memory_path = tmp_path / "kernel-sessions"
    first_store = JsonFileSessionStore(memory_path)

    with ExecutionRuntime(first_store).scope(execution_id) as guard:
        first = _host_execution(
            plan, bridge, client=first_client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=first_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
        )
        first.create({})
        waiting, receipt = first.run(original_task="approve child")
        assert waiting.status == "waiting", waiting.error
        assert receipt is None
        original_active = first.store.load().state["active"]
        original_wait = original_active["wait"]
        assert original_wait["kind"] == "child"
        original_request = first.store.read_json(original_wait["request_ref"])
        original_session = original_request["child_guard_session_id"]
        ancestor_session, separator, leaf_session = original_session.rpartition(":")
        assert separator and leaf_session
        sibling_session = ancestor_session + ":forged-sibling"
        assert sibling_session != original_session

        forged_request = {
            **original_request, "child_guard_session_id": sibling_session,
        }
        replacement_wait_id = "subagent." + sha256(
            (original_wait["id"] + "\x00forged-sibling").encode("utf-8")
        ).hexdigest()
        replaced = first.runner.replace_kernel_child_wait(
            original_wait["id"], forged_request,
            next_wait_id=replacement_wait_id,
            node_invocation_id=original_active["node_invocation_id"],
        )
        assert replaced.status == "waiting"
        persisted_active = first.store.load().state["active"]
        persisted_wait = persisted_active["wait"]
        assert persisted_wait["id"] == replacement_wait_id
        assert first.store.read_json(persisted_wait["request_ref"]) == forged_request
        assert forged_request["child_attempt_id"] == original_request["child_attempt_id"]
        assert forged_request["child_wait_id"] == original_request["child_wait_id"]

    cold_store = JsonFileSessionStore(memory_path)
    cold_memory = KernelMemoryRuntime.from_config(store=cold_store)
    cold_client = _StrictOpenAIClient([])
    with ExecutionRuntime(cold_store).scope(execution_id) as guard:
        cold = _host_execution(
            plan, bridge, client=cold_client, guard=guard, memory=cold_memory,
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
        )
        with pytest.raises(ValueError, match="Kernel interaction checkpoint is absent"):
            cold.resume_subagent_interaction(
                replacement_wait_id, True,
                node_invocation_id=persisted_active["node_invocation_id"],
                original_task="approve child",
            )
        parent_after = cold.store.load().state
        adapter = cold._subagent_runtime.agent_for_attachment(
            original_request["parent_kernel_node_id"], original_request["entry_id"],
        )
        _graph_id, child_store, _nested, _runner = cold._child_runner(
            cold.store, adapter, original_request["child_attempt_id"],
        )
        child_after = child_store.load().state

    assert tool_calls == []
    assert len(first_client.requests) == 2
    assert cold_client.requests == []
    assert parent_after["status"] == "waiting"
    assert parent_after["active"]["wait"]["id"] == replacement_wait_id
    assert child_after["status"] == "waiting"
    assert child_after["active"]["wait"]["id"] == original_request["child_wait_id"]
    assert cold_memory.load_execution_checkpoint(original_session)["status"] == "awaiting_interaction"


def test_handoff_second_child_approval_stays_child_scoped_until_completion(
    tmp_path, monkeypatch,
):
    execution_id = "skeleton-host-second-child-approval"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    child = manifests[0]["document"]
    next(node for node in child["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 4
    second_approval = SimpleNamespace(
        id="child-second-approval-turn",
        output=[{
            "type": "function_call", "call_id": "child-second-approval-call",
            "name": "dangerous_tool", "arguments": '{"value":"second child value"}',
        }],
        usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7},
    )
    client = _StrictOpenAIClient([
        _handoff_response(), _approval_tool_response(), second_approval,
        _final_response("child after second approval"),
    ])
    tool_calls = []
    tool = Tool.from_callable(
        lambda value: tool_calls.append(value) or {"applied": value},
        name="dangerous_tool", requires_confirmation=True,
    )
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"child handoff"}',
                    "evidence": "child derived " + inputs["model_answer"],
                }),
            },
        )
        execution.create({})
        first, receipt = execution.run(original_task="two child approvals")
        first_active = execution.store.load().state["active"]
        second, receipt = execution.resume_subagent_interaction(
            first_active["wait"]["id"], True,
            node_invocation_id=first_active["node_invocation_id"],
            original_task="two child approvals",
        )
        second_active = execution.store.load().state["active"]
        completed, receipt = execution.resume_subagent_interaction(
            second_active["wait"]["id"], True,
            node_invocation_id=second_active["node_invocation_id"],
            original_task="two child approvals",
        )

    assert first.status == "waiting"
    assert second.status == "waiting"
    assert second_active["wait"]["kind"] == "child"
    assert completed.status == "completed"
    assert receipt is not None
    assert tool_calls == ["approved child value", "second child value"]
    assert len(client.requests) == 4


def test_delegate_resume_projects_child_end_into_parent_provider_input(tmp_path, monkeypatch):
    execution_id = "skeleton-host-delegate-result"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    child = manifests[0]["document"]
    next(node for node in child["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 4
    client = _StrictOpenAIClient([
        _subagent_tool_response(
            "delegate_to_subagent", '{"target":"Reviewer","task":"review this"}', "delegate",
        ),
        _approval_tool_response(), _final_response("child"), _final_response("parent"),
    ])
    tool = Tool.from_callable(lambda value: {"value": value}, name="dangerous_tool", requires_confirmation=True)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"child done"}', "evidence": "child evidence",
                }),
            },
        )
        execution.create({})
        waiting, _ = execution.run(original_task="delegate result")
        completed, receipt = _resume_child_wait(execution, original_task="delegate result")

    assert waiting.status == "waiting"
    assert completed.status == "completed"
    assert receipt is not None
    assert "child done" in json.dumps(client.requests[-1]["input"])
    delegate_receipts = []
    for item in client.requests[-1]["input"]:
        if item.get("type") == "function_call_output" and item.get("call_id") == "subagent-call-delegate":
            delegate_receipts.append(item)
        content = item.get("content")
        if type(content) is str and content.startswith("[MEMORY_V2_UNTRUSTED_HISTORY]"):
            history = json.loads(content[content.index("{"):])
            delegate_receipts.extend(
                exchange for exchange in history.get("tool_exchanges", ())
                if exchange.get("call_id") == "subagent-call-delegate"
            )
    assert delegate_receipts
    assert any("child done" in json.dumps(item) for item in delegate_receipts)


def test_handoff_child_failure_after_approval_fails_parent_without_stale_wait(tmp_path, monkeypatch):
    execution_id = "skeleton-host-handoff-child-failure"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    child = manifests[0]["document"]
    next(node for node in child["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 4
    client = _StrictOpenAIClient([_handoff_response(), _approval_tool_response(), _final_response("child")])
    tool = Tool.from_callable(lambda value: {"value": value}, name="dangerous_tool", requires_confirmation=True)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({"evidence": "missing message"}),
            },
        )
        execution.create({})
        waiting, _ = execution.run(original_task="handoff child failure")
        failed, receipt = _resume_child_wait(execution, original_task="handoff child failure")

    assert waiting.status == "waiting"
    assert failed.status == "failed"
    assert failed.error["code"] == "subagent_failed"
    assert receipt is None


def test_tool_approval_allows_one_completion_turn_without_extending_child_budget(tmp_path, monkeypatch):
    execution_id = "skeleton-host-child-budget"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    child = manifests[0]["document"]
    next(node for node in child["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 1
    second = _subagent_tool_response("dangerous_tool", '{"value":"second"}', "second")
    client = _StrictOpenAIClient([_handoff_response(), _approval_tool_response(), second])
    calls = []
    tool = Tool.from_callable(lambda value: calls.append(value) or {"value": value},
                              name="dangerous_tool", requires_confirmation=True)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"not reached"}', "evidence": "budget",
                }),
            },
        )
        execution.create({})
        waiting, _ = execution.run(original_task="child budget")
        second_wait, _ = _resume_child_wait(execution, original_task="child budget")
        failed, _ = _resume_child_wait(execution, original_task="child budget")

    assert waiting.status == "waiting"
    assert second_wait.status == "waiting"
    assert failed.status == "failed"
    assert calls == ["approved child value", "second"]
    assert len(client.requests) == 3


def test_nested_handoff_completes_without_restarting_middle_model(tmp_path, monkeypatch):
    execution_id = "skeleton-host-nested-handoff"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    middle, _ = _parent_with_pool()
    middle_document = middle.snapshot()
    middle_document["id"] = "middle-agent"
    middle_kernel = next(node for node in middle_document["nodes"] if node["type"] == "agent")
    middle_kernel["config"]["kernel"]["max_iterations"] = 4
    middle_kernel["config"]["kernel"]["profile"]["model"] = "middle-model"
    grandchild = next(node for node in middle_document["nodes"] if node["type"] == "subagent_pool")["config"]["subagents"][0]["source"]["document"]
    grandchild_kernel = next(node for node in grandchild["nodes"] if node["type"] == "agent")
    grandchild_kernel["config"]["kernel"]["max_iterations"] = 4
    grandchild_kernel["config"]["kernel"]["profile"]["model"] = "grand-model"
    manifests[0]["document"] = middle_document
    manifests[0]["subagents"] = [{
        "pool_node_id": "reviewers", "kernel_node_id": middle_kernel["id"],
        "entry_id": "reviewer", "name": "Reviewer", "description": "review",
        "allowed_modes": ["delegate", "handoff", "worker"],
        "output_mode": "summary", "memory_policy": "ephemeral",
        "parallel_safe": True, "allowed_tools": None, "disabled_tools": [],
        "source_kind": "embedded", "agent_id": None, "edit_token": None,
        "definition_digest": "nested-fixed-by-preflight", "document": grandchild,
        "subagents": [],
    }]
    client = _StrictOpenAIClient([
        _handoff_response(), _handoff_response(), _approval_tool_response(), _final_response("grand"),
    ])
    tool = Tool.from_callable(lambda value: {"value": value}, name="dangerous_tool", requires_confirmation=True)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"nested child done"}', "evidence": "nested",
                }),
            },
        )
        execution.create({})
        waiting, _ = execution.run(original_task="nested handoff")
        completed, receipt = _resume_child_wait(execution, original_task="nested handoff")

    assert waiting.status == "waiting"
    assert completed.status == "completed"
    assert receipt is not None
    assert [request["model"] for request in client.requests] == [
        "test-model", "middle-model", "grand-model", "grand-model",
    ]


def test_cancelling_parent_while_child_approval_waits_blocks_late_execution(
    tmp_path, monkeypatch,
):
    execution_id = "skeleton-host-child-cancel"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    client = _StrictOpenAIClient([_handoff_response(), _approval_tool_response()])
    tool_calls = []
    tool = Tool.from_callable(
        lambda value: tool_calls.append(value) or {"applied": value},
        name="dangerous_tool", requires_confirmation=True,
    )
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"must not commit"}', "evidence": "cancelled",
                }),
            },
        )
        execution.create({})
        waiting, receipt = execution.run(original_task="cancel child")
        active = execution.store.load().state["active"]
        wait = active["wait"]
        cancelled = execution.cancel()
        with pytest.raises(ValueError, match="not current"):
            execution.resume_subagent_interaction(
                wait["id"], True, node_invocation_id=active["node_invocation_id"],
                original_task="cancel child",
            )

    assert waiting.status == "waiting"
    assert receipt is None
    assert cancelled.status == "cancelled"
    assert tool_calls == []
    events = execution.store.journal.capture_snapshot().events
    assert not any(event.event_type == "final_message"
                   and event.attempt == execution.store.attempt for event in events)
    assert len(client.requests) == 2


def test_child_completion_must_match_the_committed_child_end(
    tmp_path, monkeypatch,
):
    """The parent cannot turn a host-only completion rewrite into a handoff."""

    original = SkeletonKernelHandler._persist_child_completion_input

    def forged_completion(self, context, bundle, completion):
        return original(
            self,
            context,
            bundle,
            {**completion, "outputs": {"message": "FORGED_CHILD_RESULT"}},
        )

    monkeypatch.setattr(
        SkeletonKernelHandler,
        "_persist_child_completion_input",
        forged_completion,
    )
    execution_id = "skeleton-host-child-end-provenance"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    next(node for node in manifests[0]["document"]["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 4
    client = _StrictOpenAIClient([
        _subagent_tool_response("delegate_to_subagent", '{"target":"Reviewer","task":"review"}', "delegate"),
        _approval_tool_response(), _final_response("child"), _final_response("parent"),
    ])
    tool = Tool.from_callable(
        lambda value: {"value": value},
        name="dangerous_tool",
        requires_confirmation=True,
    )
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"child done"}', "evidence": "child evidence",
                }),
            },
        )
        execution.create({})
        waiting, _ = execution.run(original_task="delegate result")
        result, _ = _resume_child_wait(execution, original_task="delegate result")

    assert waiting.status == "waiting"
    assert result.status != "completed"
    assert len(client.requests) == 3


def test_cold_recovery_continues_after_child_settlement_before_parent_request(
    tmp_path, monkeypatch,
):
    """A persisted settlement is a safe continuation point before provider dispatch."""

    class PowerLoss(BaseException):
        pass

    plan, manifests = _parent_with_pool()
    next(node for node in manifests[0]["document"]["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 4
    execution_id = "skeleton-host-settlement-recovery"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    client = _StrictOpenAIClient([
        _subagent_tool_response("delegate_to_subagent", '{"target":"Reviewer","task":"review"}', "delegate"),
        _approval_tool_response(), _final_response("child"),
    ])
    tool_calls = []
    tool = Tool.from_callable(
        lambda value: tool_calls.append(value) or {"value": value},
        name="dangerous_tool",
        requires_confirmation=True,
    )
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    original = SkeletonKernelHandler._persist_child_tool_settlement

    def crash_after_settlement(*args, **kwargs):
        original(*args, **kwargs)
        raise PowerLoss("settlement committed before parent request")

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"child done"}', "evidence": "child evidence",
                }),
            },
        )
        execution.create({})
        waiting, _ = execution.run(original_task="delegate result")
        assert waiting.status == "waiting"
        with monkeypatch.context() as fault:
            fault.setattr(
                SkeletonKernelHandler,
                "_persist_child_tool_settlement",
                staticmethod(crash_after_settlement),
            )
            with pytest.raises(PowerLoss):
                _resume_child_wait(execution, original_task="delegate result")

    cold_bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    cold_client = _StrictOpenAIClient([_final_response("parent")])
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        cold = _host_execution(
            execution.plan, cold_bridge, client=cold_client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"child done"}', "evidence": "child evidence",
                }),
            },
        )
        recovered = cold.recover()

    assert recovered.status == "completed"
    assert tool_calls == ["approved child value"]
    assert len(cold_client.requests) == 1


def test_failed_child_completion_must_match_its_durable_error_and_empty_output(
    tmp_path, monkeypatch,
):
    """A failed child cannot gain a host-supplied result before parent resume."""

    original = SkeletonKernelHandler._persist_child_completion_input

    def forged_failure(self, context, bundle, completion):
        return original(
            self,
            context,
            bundle,
            {
                **completion,
                "outputs": {"message": "FORGED_FAILED_CHILD_RESULT"},
                "error": "FORGED_RECOVERABLE_ERROR",
            },
        )

    monkeypatch.setattr(
        SkeletonKernelHandler,
        "_persist_child_completion_input",
        forged_failure,
    )
    execution_id = "skeleton-host-failed-child-provenance"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    next(node for node in manifests[0]["document"]["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 4
    client = _StrictOpenAIClient([
        _subagent_tool_response("delegate_to_subagent", '{"target":"Reviewer","task":"review"}', "delegate"),
        _approval_tool_response(), _final_response("child"), _final_response("parent"),
    ])
    calls = []
    tool = Tool.from_callable(
        lambda value: calls.append(value) or {"value": value},
        name="dangerous_tool", requires_confirmation=True,
    )
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({"evidence": "no message"}),
            },
        )
        execution.create({})
        waiting, _ = execution.run(original_task="delegate result")
        result, _ = _resume_child_wait(execution, original_task="delegate result")

    assert waiting.status == "waiting"
    assert result.status != "completed"
    assert calls == ["approved child value"]
    assert len(client.requests) == 3


def test_cold_recovery_finishes_handoff_recorded_before_settlement(
    tmp_path, monkeypatch,
):
    """The persisted child handoff supplies the missing settlement after a crash."""

    class PowerLoss(BaseException):
        pass

    plan, manifests = _parent_with_pool()
    next(node for node in manifests[0]["document"]["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 4
    execution_id = "skeleton-host-handoff-before-settlement"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    client = _StrictOpenAIClient([
        _subagent_tool_response("delegate_to_subagent", '{"target":"Reviewer","task":"review"}', "delegate"),
        _approval_tool_response(), _final_response("child"),
    ])
    calls = []
    tool = Tool.from_callable(
        lambda value: calls.append(value) or {"value": value},
        name="dangerous_tool", requires_confirmation=True,
    )
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")

    def crash_before_settlement(*_args, **_kwargs):
        raise PowerLoss("handoff committed before settlement")

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"child done"}', "evidence": "child evidence",
                }),
            },
        )
        execution.create({})
        waiting, _ = execution.run(original_task="delegate result")
        with monkeypatch.context() as fault:
            fault.setattr(
                SkeletonKernelHandler,
                "_persist_child_tool_settlement",
                staticmethod(crash_before_settlement),
            )
            with pytest.raises(PowerLoss):
                _resume_child_wait(execution, original_task="delegate result")

    cold_bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    cold_client = _StrictOpenAIClient([_final_response("parent")])
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        cold = _host_execution(
            execution.plan, cold_bridge, client=cold_client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"child done"}', "evidence": "child evidence",
                }),
            },
        )
        recovered = cold.recover()

    assert waiting.status == "waiting"
    assert recovered.status == "completed"
    assert calls == ["approved child value"]
    assert len(cold_client.requests) == 1


def test_cold_recovery_finishes_child_terminal_before_handoff(
    tmp_path, monkeypatch,
):
    """A saved child End resumes the parent even before its handoff is recorded."""

    class PowerLoss(BaseException):
        pass

    plan, manifests = _parent_with_pool()
    next(node for node in manifests[0]["document"]["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 4
    execution_id = "skeleton-host-terminal-before-handoff"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    client = _StrictOpenAIClient([
        _subagent_tool_response("delegate_to_subagent", '{"target":"Reviewer","task":"review"}', "delegate"),
        _approval_tool_response(), _final_response("child"),
    ])
    calls = []
    tool = Tool.from_callable(
        lambda value: calls.append(value) or {"value": value},
        name="dangerous_tool", requires_confirmation=True,
    )
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"child done"}', "evidence": "child evidence",
                }),
            },
        )
        execution.create({})
        waiting, _ = execution.run(original_task="delegate result")

        def crash_before_handoff(*_args, **_kwargs):
            raise PowerLoss("child terminal saved before parent handoff")

        with monkeypatch.context() as fault:
            fault.setattr(SkeletonKernelHandler, "_persist_child_completion_input", crash_before_handoff)
            with pytest.raises(PowerLoss):
                _resume_child_wait(execution, original_task="delegate result")
        state = execution.store.load().state
        events = execution.store.journal.capture_snapshot().events
        assert state["status"] == "running"
        assert state["active"]["resume"]["kind"] == "child"
        assert not any(event.event_type == "handoff.recorded" for event in events)
        assert not any(event.event_type == "skeleton.subagent_tool_settlement" for event in events)

    cold_bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    cold_client = _StrictOpenAIClient([_final_response("parent")])
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        cold = _host_execution(
            execution.plan, cold_bridge, client=cold_client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"child done"}', "evidence": "child evidence",
                }),
            },
        )
        recovered = cold.recover()

    assert waiting.status == "waiting"
    assert recovered.status == "completed"
    assert calls == ["approved child value"]
    assert len(cold_client.requests) == 1


def test_cold_recovery_scopes_terminal_child_to_its_own_serial_delegate(
    tmp_path, monkeypatch,
):
    """A prior child settlement cannot block a later child's terminal recovery."""

    class PowerLoss(BaseException):
        pass

    plan, manifests = _parent_with_pool()
    parent = plan.snapshot()
    next(node for node in parent["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 5
    next(node for node in manifests[0]["document"]["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 4
    plan = prepare_agent_graph(parent)
    execution_id = "skeleton-host-second-terminal-before-handoff"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    client = _StrictOpenAIClient([
        _subagent_tool_response("delegate_to_subagent", '{"target":"Reviewer","task":"first"}', "first"),
        _approval_tool_response(), _final_response("child first"),
        _subagent_tool_response("delegate_to_subagent", '{"target":"Reviewer","task":"second"}', "second"),
        _approval_tool_response(), _final_response("child second"),
    ])
    calls = []
    tool = Tool.from_callable(
        lambda value: calls.append(value) or {"value": value},
        name="dangerous_tool", requires_confirmation=True,
    )
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"child done"}', "evidence": "child evidence",
                }),
            },
        )
        execution.create({})
        first, _ = execution.run(original_task="serial delegates")
        first_active = execution.store.load().state["active"]
        second, _ = execution.resume_subagent_interaction(
            first_active["wait"]["id"], True,
            node_invocation_id=first_active["node_invocation_id"], original_task="serial delegates",
        )
        assert first.status == "waiting" and second.status == "waiting"
        assert sum(event.event_type == "skeleton.subagent_tool_settlement"
                   for event in execution.store.journal.capture_snapshot().events) == 1
        second_active = execution.store.load().state["active"]

        def crash_before_second_handoff(*_args, **_kwargs):
            raise PowerLoss("second child terminal saved before parent handoff")

        with monkeypatch.context() as fault:
            fault.setattr(SkeletonKernelHandler, "_persist_child_completion_input", crash_before_second_handoff)
            with pytest.raises(PowerLoss):
                execution.resume_subagent_interaction(
                    second_active["wait"]["id"], True,
                    node_invocation_id=second_active["node_invocation_id"], original_task="serial delegates",
                )
        state = execution.store.load().state
        assert state["status"] == "running"
        assert sum(event.event_type == "skeleton.subagent_tool_settlement"
                   for event in execution.store.journal.capture_snapshot().events) == 1

    cold_bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    cold_client = _StrictOpenAIClient([_final_response("parent")])
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        cold = _host_execution(
            execution.plan, cold_bridge, client=cold_client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"child done"}', "evidence": "child evidence",
                }),
            },
        )
        recovered = cold.recover()

    assert recovered.status == "completed"
    assert calls == ["approved child value", "approved child value"]
    assert len(cold_client.requests) == 1


@pytest.mark.parametrize("changed", ["wait_id", "request_ref"])
def test_child_resume_marker_must_match_the_replaced_wait(tmp_path, monkeypatch, changed):
    """The durable transition cannot detach a child resume from its original wait."""

    execution_id = "skeleton-host-resume-marker-identity-" + changed
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    next(node for node in manifests[0]["document"]["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 4
    client = _StrictOpenAIClient([
        _subagent_tool_response("delegate_to_subagent", '{"target":"Reviewer","task":"review"}', "delegate"),
        _approval_tool_response(), _final_response("child"),
    ])
    tool = Tool.from_callable(
        lambda value: {"value": value}, name="dangerous_tool", requires_confirmation=True,
    )
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
        )
        execution.create({})
        waiting, _ = execution.run(original_task="delegate result")
        assert waiting.status == "waiting"
        record = execution.store.load()
        state = deepcopy(record.state)
        wait = state["active"]["wait"]
        assert wait["kind"] == "child"
        state["status"] = "running"
        state["active"]["owner_token"] = "fresh-resume-owner"
        state["active"]["wait"] = None
        state["active"]["resume"] = {
            "kind": "child", "wait_id": wait["id"],
            "request_ref": deepcopy(wait["request_ref"]),
        }
        if changed == "wait_id":
            state["active"]["resume"]["wait_id"] = "foreign-child-wait"
        else:
            state["active"]["resume"]["request_ref"] = deepcopy(state["active"]["input_ref"])
        with pytest.raises(DurableStoreError, match="resume|identity|transition"):
            execution.store.save(
                state, expected_revision=record.revision,
                operation_id="test.child-resume-marker." + changed,
            )


@pytest.mark.parametrize("corruption", ["rehashed_output", "wrong_handoff", "wrong_child"])
def test_child_settlement_must_match_its_persisted_handoff(
    tmp_path, monkeypatch, corruption,
):
    """A self-consistent settlement cannot replace its persisted child result."""

    original = SkeletonKernelHandler._persist_child_tool_settlement

    def injected(bundle, *, source_attempt, completion, parent_tool_call, receipt):
        if corruption == "rehashed_output":
            completion = {**completion, "outputs": {"message": "FORGED_CHILD_RESULT"}}
            full_output = {
                "schema": "unchain.skeleton_child_completion.v1",
                "status": completion["status"],
                "outputs": completion["outputs"],
                "error": completion["error"],
                "summary": "FORGED_CHILD_RESULT",
            }
            content = json.dumps(
                full_output, ensure_ascii=False, sort_keys=True,
                separators=(",", ":"), allow_nan=False,
            ).encode("utf-8")
            artifact = replace(
                receipt.full_output_artifact,
                byte_length=len(content), sha256=sha256(content).hexdigest(),
            )
            receipt = replace(
                receipt, full_output_artifact=artifact,
                envelope=replace(receipt.envelope, byte_length=len(content), sha256=sha256(content).hexdigest()),
            )
        elif corruption == "wrong_handoff":
            receipt = replace(
                receipt,
                handoff_cursor=type(receipt.handoff_cursor)(
                    receipt.handoff_cursor.store_seq, "event.nonexistent",
                ),
            )
        else:
            source_attempt = type(source_attempt)(source_attempt.generation, "unrelated-child-attempt")
        return original(
            bundle, source_attempt=source_attempt, completion=completion,
            parent_tool_call=parent_tool_call, receipt=receipt,
        )

    monkeypatch.setattr(
        SkeletonKernelHandler, "_persist_child_tool_settlement", staticmethod(injected),
    )
    execution_id = "skeleton-host-settlement-" + corruption
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    plan, manifests = _parent_with_pool()
    next(node for node in manifests[0]["document"]["nodes"] if node["type"] == "agent")["config"]["kernel"]["max_iterations"] = 4
    client = _StrictOpenAIClient([
        _subagent_tool_response("delegate_to_subagent", '{"target":"Reviewer","task":"review"}', "delegate"),
        _approval_tool_response(), _final_response("child"), _final_response("parent"),
    ])
    tool = Tool.from_callable(lambda value: {"value": value}, name="dangerous_tool", requires_confirmation=True)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context: (tool,), subagent_manifests=manifests,
            child_handlers_factory=lambda _store, _plan: {
                "code": lambda _context, _inputs: WorkflowNodeCompleted({
                    "message": '{"answer":"child done"}', "evidence": "child evidence",
                }),
            },
        )
        execution.create({})
        waiting, _ = execution.run(original_task="delegate result")
        result, _ = _resume_child_wait(execution, original_task="delegate result")

    assert waiting.status == "waiting"
    assert result.status != "completed"
    assert len(client.requests) == 3


def test_host_execution_delivers_only_postprocessed_end_and_persists_fyi_on_current_node(
    tmp_path, monkeypatch,
):
    execution_id = "skeleton-host-fyi"
    original_task = "original task binding"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id, task=original_task)
    app_client = miso_app.create_app().test_client()
    interject = {}

    def post_fyi():
        response = app_client.post("/chat/interject", json={
            "thread_id": execution_id, "channel": "fyi", "text": "FYI change requirement", "message_id": "fyi-1",
        })
        interject.update(response.get_json())
        active = get_interject_channels(execution_id)
        assert active is not None
        assert active.original_task == original_task

    client = _StrictOpenAIClient([_tool_response(), _final_response()], before_first=post_fyi)
    sdk_calls = []
    callbacks = []
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    memory = KernelMemoryRuntime.from_config(store=memory_store)
    probe_calls = []
    tool = Tool.from_callable(lambda: probe_calls.append("probe") or {"ok": True}, name="probe")

    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(
            _single_plan(), bridge, client=client, guard=guard, memory=memory,
            callback=callbacks.append, tools_for_node=lambda _context: (tool,), sdk_calls=sdk_calls,
        )
        execution.create({"task": "fixed graph input"})
        durable, receipt = execution.run(original_task=original_task)

    assert durable.status == "completed"
    assert durable.outputs["message"] == "postprocessed End reply"
    assert receipt is not None
    assert interject == {"resolved_channel": "fyi", "message_id": "fyi-1"}
    assert probe_calls == ["probe"]
    assert len(client.requests) == 2
    assert client.requests[0]["model"] == "test-model"
    assert all(request["max_output_tokens"] == 128 for request in client.requests)
    assert client.requests[0]["text"]["format"]["strict"] is True
    assert sdk_calls == [{"api_key": "test-key", "base_url": "https://example.test/v1", "max_retries": 0}] * 2
    assert "FYI change requirement" not in repr(client.requests[0])
    assert "FYI change requirement" in repr(client.requests[1])
    assert get_interject_channels(execution_id) is None

    events = execution.store.journal.capture_snapshot().events
    node_events = [event for event in events if event.attempt != execution.store.attempt]
    root_events = [event for event in events if event.attempt == execution.store.attempt and event.event_type in {"final_message", "run_completed"}]
    assert any(event.event_type == "message.user" and "FYI change requirement" in str(event.payload) for event in node_events)
    injected = [event for event in callbacks if event.get("type") == "fyi_injected" and event["scope"] == "node"]
    assert len(injected) == 1
    assert injected[0]["messages"] == [{"message_id": "fyi-1", "origin": "user", "text": "FYI change requirement"}]
    assert [event.event_type for event in root_events] == ["final_message", "run_completed"]
    assert root_events[0].payload["content"] == "postprocessed End reply"
    assert all("FYI change requirement" not in content for content in _event_contents(root_events))
    assert any(event.get("scope") == "root" and event.get("content") == "postprocessed End reply" for event in callbacks)


def test_multikernel_interjects_queue_before_classifier_or_side_answer_and_releases_channel(
    tmp_path, monkeypatch,
):
    execution_id = "skeleton-host-queue"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    app_client = miso_app.create_app().test_client()
    side_calls = []
    monkeypatch.setattr(route_interject, "classify_interject", lambda *_args: side_calls.append("classifier"))
    monkeypatch.setattr(route_interject, "_run_side_answer", lambda *_args: side_calls.append("side-answer"))
    routes = []

    def post_all_channels():
        for channel in ("auto", "fyi", "btw"):
            response = app_client.post("/chat/interject", json={
                "thread_id": execution_id, "channel": channel, "text": "defer me", "message_id": "queued-" + channel,
            })
            routes.append(response.get_json())

    client = _StrictOpenAIClient([_final_response("one"), _final_response("two")], before_first=post_all_channels)
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    memory = KernelMemoryRuntime.from_config(store=memory_store)
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(_two_kernel_plan(), bridge, client=client, guard=guard, memory=memory)
        execution.create({})
        durable, receipt = execution.run(original_task="original task")

    assert durable.status == "completed"
    assert receipt is not None
    assert routes == [{"resolved_channel": "queue"}] * 3
    assert side_calls == []
    assert len(client.requests) == 2
    assert get_interject_channels(execution_id) is None


def test_host_execution_releases_interject_channel_after_kernel_failure(tmp_path, monkeypatch):
    execution_id = "skeleton-host-failure"
    bridge = _bridge(tmp_path, monkeypatch, execution_id=execution_id)
    registered = []
    client = _StrictOpenAIClient(
        [_final_response("not used")],
        before_first=lambda: registered.append(get_interject_channels(execution_id) is not None),
    )
    memory_store = JsonFileSessionStore(tmp_path / "kernel-sessions")
    memory = KernelMemoryRuntime.from_config(store=memory_store)
    with ExecutionRuntime(memory_store).scope(execution_id) as guard:
        execution = _host_execution(_single_plan(invalid_output=True), bridge, client=client, guard=guard, memory=memory,
            tools_for_node=lambda _context: ())
        execution.create({})
        durable, receipt = execution.run(original_task="failure path")

    assert durable.status == "failed"
    assert receipt is None
    assert registered == [True]
    assert len(client.requests) == 1
    assert get_interject_channels(execution_id) is None
