"""Deliver only a completed Skeleton Agent's explicit End message to chat."""
from __future__ import annotations

from memory_v2_unchain_active_bridge import PupuUnchainActiveBridge
from memory_v2_unchain_graph_root_completion import (
    PupuUnchainGraphRootCompletionReceipt,
    _completion_from_attachment,
    _run_memory_completion,
)
from memory_v2_unchain_worker import PupuUnchainMemoryAgentWorker
from unchain.context.projector import SemanticEventProjectionMode
from unchain.journal import ArtifactRef, JournalAppendResult
from unchain.journal.models import _required_text
from unchain.memory import MEMORY_EXECUTION_COMPLETE, MemoryAttachmentRequest
from unchain.memory.curator.host import MemoryAgentHostAdapter
from unchain.skeleton.agent_preparation import PreparedAgentPlan
from unchain.skeleton.durable_execution import DurableWorkflowRunner


def complete_pupu_skeleton_root(runner, bridge, *, agent_name, mode="skeleton"):
    """Opt-in chat completion; standalone Workflow output has no chat consumer."""
    if type(runner) is not DurableWorkflowRunner or type(runner.plan) is not PreparedAgentPlan:
        raise TypeError("Skeleton chat completion requires an exact Agent runner")
    if type(bridge) is not PupuUnchainActiveBridge:
        raise TypeError("Skeleton chat completion requires an active bridge")
    agent_name = _required_text(agent_name, "agent_name", maximum=512)
    mode = _required_text(mode, "mode", maximum=128, identifier=True)
    binding = bridge.preparation.binding
    factory = bridge.preparation.host_factory
    if not binding.grant.allows(MEMORY_EXECUTION_COMPLETE) or not binding.grant.authority:
        raise ValueError("Skeleton root completion authority is missing")
    if not factory.production_enabled or factory.projection_mode is not SemanticEventProjectionMode.CANONICAL:
        raise ValueError("Skeleton completion requires a canonical production host")
    root = bridge.attempt_for_run(binding.root_run_id)
    bundle = root.bundle
    attempt = bundle.attempt
    if any((
        runner.store.attempt != attempt,
        runner.store.journal is not bundle.journal,
        binding.execution_id != bridge.execution_id,
        binding.session_id != binding.execution_id,
        binding.attempt_id != binding.run_id,
        binding.root_run_id != binding.attempt_id,
        attempt.generation.execution_id != binding.execution_id,
        attempt.generation.generation_id != binding.generation_id,
        attempt.attempt_id != binding.attempt_id,
        bundle.durable_event_sink.attempt != attempt,
        factory.owner_chat_id != binding.owner_chat_id,
        factory.root_run_id != binding.root_run_id,
        factory.normal_attachment_factory.binding_id != factory.binding_id,
    )):
        raise ValueError("Skeleton root completion identity changed")
    if type(factory.memory_host) is not MemoryAgentHostAdapter or type(factory.memory_worker) is not PupuUnchainMemoryAgentWorker:
        raise ValueError("Skeleton root memory capabilities are invalid")
    if (factory.memory_host.binding_id != factory.binding_id
            or factory.memory_worker.host is not factory.memory_host
            or factory.memory_worker.host_binding_id != factory.binding_id):
        raise ValueError("Skeleton root memory binding changed")
    record = runner.store.load()
    if record is None:
        raise ValueError("Skeleton execution does not exist")
    state = record.state
    if state["status"] != "completed" or state["paused"] or len(state["call_stack"]) != 1:
        raise ValueError("only a completed root Skeleton may deliver a chat reply")
    end = state["completed"][-1]
    node = next(n for n in runner.plan.snapshot()["nodes"] if n["id"] == end["node_id"])
    if node["type"] != "end" or end["edge_id"] is not None:
        raise ValueError("Skeleton has no terminal End receipt")
    outputs = runner.store.read_json(end["output_ref"])
    if type(outputs) is not dict or type(outputs.get("message")) is not str:
        raise ValueError("chat End must explicitly export a string message")
    final_text = outputs["message"]
    iteration = len(state["completed"])
    sink = bundle.durable_event_sink
    final = sink({"type": "final_message", "run_id": attempt.attempt_id,
                  "iteration": iteration, "content": final_text})
    terminal = sink({"type": "run_completed", "run_id": attempt.attempt_id,
                     "iteration": iteration, "status": "completed"})
    if type(final) is not JournalAppendResult or type(terminal) is not JournalAppendResult:
        raise ValueError("Skeleton root terminal has no durable receipts")
    if (final.event.attempt != attempt or terminal.event.attempt != attempt
            or final.event.event_type != "final_message" or terminal.event.event_type != "run_completed"
            or final.event.payload.get("content") != final_text
            or terminal.event.payload.get("status") != "completed"
            or final.cursor.store_seq >= terminal.cursor.store_seq):
        raise ValueError("Skeleton root terminal receipts changed")
    request = MemoryAttachmentRequest(agent_name=agent_name, mode=mode,
                                     identity=binding.identity, grant=binding.grant)
    completion = _completion_from_attachment(factory=factory, request=request, final_text=final_text)
    memory = _run_memory_completion(factory=factory, owner_chat_id=binding.owner_chat_id,
                                   root_run_id=binding.root_run_id, completion=completion)
    # A lost reply is retried through the same journal/capture/worker identities.
    runner.commit_root()
    output_artifact = ArtifactRef.from_dict(end["output_ref"])
    return PupuUnchainGraphRootCompletionReceipt(
        graph_plan_id=runner.plan.document_id, graph_scope_id=runner.store.graph_id,
        execution_id=attempt.generation.execution_id, coordinator_attempt_id=attempt.attempt_id,
        root_run_id=binding.root_run_id, output_ref=output_artifact.ref,
        output_bytes=output_artifact.byte_length, output_sha256=output_artifact.sha256,
        final_cursor=final.cursor, terminal_cursor=terminal.cursor,
        journal_replayed=final.duplicate and terminal.duplicate,
        completion_trigger_key=completion.trigger_key, memory=memory)


__all__ = ["complete_pupu_skeleton_root"]
