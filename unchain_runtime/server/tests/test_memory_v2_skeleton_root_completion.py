"""Real durable Skeleton End delivery through the ordinary Memory V2 root path."""

from __future__ import annotations

from copy import deepcopy
import pytest

import memory_v2_skeleton_root_completion as skeleton_root_completion
from memory_v2_skeleton_root_completion import complete_pupu_skeleton_root
from test_memory_v2_unchain_graph_root_completion import (
    _NeverRunMemoryAgent,
    _active_bridge,
    _run,
)
from unchain.journal.runtime import DurableEventSink
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.persistence import SQLiteContextV2Store
from unchain.skeleton import WorkflowNodeCompleted
from unchain.skeleton.agent_preparation import (
    execution_definition_digest,
    prepare_agent_graph,
)
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from unchain.skeleton.durable_store import WorkflowExecutionStore


def _kernel_config() -> dict[str, object]:
    return {
        "schema_version": 1,
        "profile": {
            "id": "test.openai",
            "provider": "openai",
            "model": "test-model",
            "protocol": "openai-responses",
            "endpoint": "https://example.test/v1",
            "credential_ref": "test-key",
            "context_window": 8192,
            "output_limit": 2048,
            "capabilities": {"json_schema": True, "images": False, "files": False},
        },
        "prompt": "produce an intermediate model answer",
        "max_iterations": 1,
        "output_tokens": 128,
        "history": "root",
        "overflow": "error",
        "json_schema": {
            "type": "object",
            "properties": {"answer": {"type": "string"}},
            "required": ["answer"],
            "additionalProperties": False,
        },
    }


def _agent_document(*, exports_message: bool = True) -> dict[str, object]:
    end_outputs = [
        {
            "name": "message" if exports_message else "answer",
            "source": {"kind": "input", "path": ["message"]},
        },
        {
            "name": "evidence",
            "source": {"kind": "input", "path": ["evidence"]},
        },
    ]
    return {
        "schema_version": 1,
        "kind": "agent",
        "id": "skeleton-root-delivery",
        "name": "Skeleton root delivery",
        "nodes": [
            {
                "id": "start",
                "type": "start",
                "config": {"execution": {"outputs": []}},
            },
            {
                "id": "model",
                "type": "agent",
                "config": {
                    "execution": {
                        "inputs": [],
                        "outputs": [
                            {
                                "name": "answer",
                                "source": {"kind": "result", "path": ["answer"]},
                            }
                        ],
                    },
                    "kernel": _kernel_config(),
                },
            },
            {
                "id": "postprocess",
                "type": "code",
                "config": {
                    "execution": {
                        "inputs": [
                            {
                                "name": "model_answer",
                                "value": {
                                    "kind": "ref",
                                    "node_id": "model",
                                    "path": ["answer"],
                                },
                                "missing": "error",
                            }
                        ],
                        "outputs": [
                            {
                                "name": "message",
                                "source": {"kind": "result", "path": ["message"]},
                            },
                            {
                                "name": "evidence",
                                "source": {"kind": "result", "path": ["evidence"]},
                            },
                        ],
                    }
                },
            },
            {
                "id": "end",
                "type": "end",
                "config": {
                    "execution": {
                        "inputs": [
                            {
                                "name": "message",
                                "value": {
                                    "kind": "ref",
                                    "node_id": "postprocess",
                                    "path": ["message"],
                                },
                                "missing": "error",
                            },
                            {
                                "name": "evidence",
                                "value": {
                                    "kind": "ref",
                                    "node_id": "postprocess",
                                    "path": ["evidence"],
                                },
                                "missing": "error",
                            },
                        ],
                        "outputs": end_outputs,
                    }
                },
            },
        ],
        "edges": [
            {
                "id": "start-model",
                "kind": "flow",
                "source_node_id": "start",
                "source_port_id": "out",
                "target_node_id": "model",
                "target_port_id": "in",
            },
            {
                "id": "model-postprocess",
                "kind": "flow",
                "source_node_id": "model",
                "source_port_id": "out",
                "target_node_id": "postprocess",
                "target_port_id": "in",
            },
            {
                "id": "postprocess-end",
                "kind": "flow",
                "source_node_id": "postprocess",
                "source_port_id": "out",
                "target_node_id": "end",
                "target_port_id": "in",
            },
        ],
    }


def _bind_root_attempt(bridge, *, execution_id: str, run_id: str):
    state = RunState()
    state.session_state.session_id = execution_id
    bridge.preparation.host_factory.context_module.runtime.bind_context(
        HarnessContext(
            state=state,
            phase="bootstrap",
            event={"run_id": run_id},
        )
    )
    return bridge.attempt_for_run(run_id)


def _runner(
    bundle,
    *,
    exports_message: bool = True,
    call_stack=None,
    postprocessed_message: str = "postprocessed End reply",
):
    plan = prepare_agent_graph(_agent_document(exports_message=exports_message))
    runner = DurableWorkflowRunner(
        WorkflowExecutionStore(
            bundle.journal,
            plan,
            graph_id="skeleton-root-graph",
            attempt=bundle.attempt,
        ),
        {
            "agent": lambda _context, _inputs: WorkflowNodeCompleted(
                {
                    "message": '{"answer":"last model text must not be delivered"}',
                    "context": {},
                }
            ),
            "code": lambda _context, inputs: WorkflowNodeCompleted(
                {
                    "message": postprocessed_message,
                    "evidence": "derived from " + inputs["model_answer"],
                }
            ),
        },
    )
    runner.create({}, call_stack=call_stack)
    return runner


def _root_events(bundle):
    return tuple(
        event
        for event in bundle.journal.capture_snapshot().events
        if event.attempt == bundle.attempt
        and event.event_type in {"final_message", "run_completed"}
    )


def _child_call_stack(bundle):
    plan = prepare_agent_graph(_agent_document())
    return [
        {
            "execution_id": bundle.attempt.generation.execution_id,
            "graph_invocation_id": "parent-skeleton-graph",
            "attempt_id": "parent-skeleton-attempt",
            "definition_id": "parent-skeleton-definition",
            "definition_digest": "a" * 64,
            "caller_node_invocation_id": "parent-node",
        },
        {
            "execution_id": bundle.attempt.generation.execution_id,
            "graph_invocation_id": "skeleton-root-graph",
            "attempt_id": bundle.attempt.attempt_id,
            "definition_id": plan.document_id,
            "definition_digest": execution_definition_digest(plan),
        },
    ]


def test_real_skeleton_end_delivery_uses_postprocessed_message_and_acknowledges_last(
    tmp_path,
    monkeypatch,
) -> None:
    run = _run(
        execution_id="execution-skeleton-root",
        attempt_id="skeleton-root",
        content="answer the root objective",
    )
    invoker = _NeverRunMemoryAgent()
    bridge = _active_bridge(
        tmp_path,
        monkeypatch,
        run=run,
        owner_chat_id="chat-skeleton-root",
        invoker_factory=lambda _codec: invoker,
    )
    bundle = _bind_root_attempt(
        bridge,
        execution_id=run.session_id,
        run_id=run.attempt_id,
    ).bundle
    runner = _runner(bundle)

    completed = runner.run()
    assert completed.outputs == {
        "message": "postprocessed End reply",
        "evidence": "derived from last model text must not be delivered",
    }
    assert not completed.root_committed

    original_commit_root = DurableWorkflowRunner.commit_root

    def assert_acknowledgement_is_last(self):
        assert self is runner
        assert not self.inspect().root_committed
        assert [event.event_type for event in _root_events(bundle)] == [
            "final_message",
            "run_completed",
        ]
        return original_commit_root(self)

    monkeypatch.setattr(
        DurableWorkflowRunner,
        "commit_root",
        assert_acknowledgement_is_last,
    )
    receipt = complete_pupu_skeleton_root(
        runner,
        bridge,
        agent_name="Skeleton root",
    )

    assert runner.inspect().root_committed
    assert receipt.memory.enqueue_enabled is True
    assert receipt.memory.candidate_count == 0
    assert invoker.calls == []
    root_events = _root_events(bundle)
    assert [event.event_type for event in root_events] == [
        "final_message",
        "run_completed",
    ]
    assert root_events[0].payload["content"] == "postprocessed End reply"
    assert (root_events[0].store_seq, root_events[0].event_id) == (
        receipt.final_cursor.store_seq,
        receipt.final_cursor.event_id,
    )
    assert (root_events[1].store_seq, root_events[1].event_id) == (
        receipt.terminal_cursor.store_seq,
        receipt.terminal_cursor.event_id,
    )
    # The actual Host adds its content-free curator decision before the root
    # acknowledgement. History editing must accept this producer's seal, not
    # only Core's smaller final/terminal/acknowledgement test fixture.
    from unchain.skeleton.rebase_quiescence import classify_skeleton_attempts

    events = bundle.journal.capture_snapshot().events
    audits = [event for event in events if event.event_type.startswith("memory.curator.")]
    assert len(audits) == 1
    assert root_events[1].store_seq < audits[0].store_seq < events[-1].store_seq
    assert classify_skeleton_attempts(events, bundle.journal)[bundle.attempt.attempt_id] == "quiescent"
    assert bundle.journal.capture_snapshot().events == events


def test_repeat_and_cold_recovery_replay_one_root_delivery(tmp_path, monkeypatch) -> None:
    run = _run(
        execution_id="execution-skeleton-replay",
        attempt_id="skeleton-replay",
        content="complete once",
    )
    first_bridge = _active_bridge(
        tmp_path,
        monkeypatch,
        run=run,
        owner_chat_id="chat-skeleton-replay",
        invoker_factory=lambda _codec: _NeverRunMemoryAgent(),
    )
    first_bundle = _bind_root_attempt(
        first_bridge,
        execution_id=run.session_id,
        run_id=run.attempt_id,
    ).bundle
    first_runner = _runner(first_bundle)
    assert first_runner.run().status == "completed"
    first = complete_pupu_skeleton_root(
        first_runner,
        first_bridge,
        agent_name="Skeleton replay",
    )
    replay = complete_pupu_skeleton_root(
        first_runner,
        first_bridge,
        agent_name="Skeleton replay",
    )

    assert replay.journal_replayed is True
    assert replay.final_cursor == first.final_cursor
    assert replay.terminal_cursor == first.terminal_cursor

    cold_bridge = _active_bridge(
        tmp_path,
        monkeypatch,
        run=run,
        owner_chat_id="chat-skeleton-replay",
        invoker_factory=lambda _codec: _NeverRunMemoryAgent(),
    )
    cold_bundle = _bind_root_attempt(
        cold_bridge,
        execution_id=run.session_id,
        run_id=run.attempt_id,
    ).bundle
    cold_runner = _runner(cold_bundle)
    assert cold_runner.inspect().status == "completed"
    cold = complete_pupu_skeleton_root(
        cold_runner,
        cold_bridge,
        agent_name="Skeleton replay",
    )

    assert cold.journal_replayed is True
    assert cold.final_cursor == first.final_cursor
    assert cold.terminal_cursor == first.terminal_cursor
    assert [event.event_type for event in _root_events(cold_bundle)] == [
        "final_message",
        "run_completed",
    ]


@pytest.mark.parametrize(
    "case",
    ("incomplete", "child", "foreign_journal", "missing_message"),
)
def test_invalid_skeleton_roots_do_not_append_terminal(tmp_path, monkeypatch, case) -> None:
    run = _run(
        execution_id="execution-skeleton-invalid-" + case,
        attempt_id="skeleton-invalid-" + case,
        content="must remain private",
    )
    bridge = _active_bridge(
        tmp_path,
        monkeypatch,
        run=run,
        owner_chat_id="chat-skeleton-invalid-" + case,
        invoker_factory=lambda _codec: _NeverRunMemoryAgent(),
    )
    bundle = _bind_root_attempt(
        bridge,
        execution_id=run.session_id,
        run_id=run.attempt_id,
    ).bundle

    if case == "foreign_journal":
        foreign = SQLiteContextV2Store(
            database_path=tmp_path / "foreign.sqlite3",
            object_directory=tmp_path / "foreign-objects",
        ).bind_execution(run.session_id)
        runner = DurableWorkflowRunner(
            WorkflowExecutionStore(
                foreign,
                prepare_agent_graph(_agent_document()),
                graph_id="foreign-skeleton-root",
                attempt=bundle.attempt,
            ),
            {},
        )
    else:
        runner = _runner(
            bundle,
            exports_message=case != "missing_message",
            call_stack=_child_call_stack(bundle) if case == "child" else None,
        )
        if case == "child":
            assert len(runner.store.load().state["call_stack"]) == 2
        if case != "incomplete":
            assert runner.run().status == "completed"

    with pytest.raises((TypeError, ValueError)):
        complete_pupu_skeleton_root(
            runner,
            bridge,
            agent_name="Invalid Skeleton root",
        )

    assert not _root_events(bundle)


@pytest.mark.parametrize("message", ("", "   "))
def test_empty_or_blank_end_message_does_not_create_a_partial_terminal(
    tmp_path,
    monkeypatch,
    message,
) -> None:
    """Current frozen string-only contract permits both values end-to-end."""

    run = _run(
        execution_id="execution-skeleton-blank-" + str(len(message)),
        attempt_id="skeleton-blank-" + str(len(message)),
        content="empty messages remain explicit values",
    )
    bridge = _active_bridge(
        tmp_path,
        monkeypatch,
        run=run,
        owner_chat_id="chat-skeleton-blank-" + str(len(message)),
        invoker_factory=lambda _codec: _NeverRunMemoryAgent(),
    )
    bundle = _bind_root_attempt(
        bridge,
        execution_id=run.session_id,
        run_id=run.attempt_id,
    ).bundle
    runner = _runner(bundle, postprocessed_message=message)
    assert runner.run().outputs["message"] == message

    complete_pupu_skeleton_root(
        runner,
        bridge,
        agent_name="Blank Skeleton root",
    )

    assert runner.inspect().root_committed
    events = _root_events(bundle)
    assert [event.event_type for event in events] == [
        "final_message",
        "run_completed",
    ]
    assert events[0].payload["content"] == message


class _SimulatedCrash(BaseException):
    pass


@pytest.mark.parametrize(
    ("window", "expected_events", "acknowledged", "journal_replayed"),
    (
        ("after_final", ("final_message",), False, False),
        ("after_terminal", ("final_message", "run_completed"), False, True),
        ("after_capture", ("final_message", "run_completed"), False, True),
        ("after_worker", ("final_message", "run_completed"), False, True),
        ("after_ack", ("final_message", "run_completed"), True, True),
    ),
)
def test_crash_windows_replay_one_terminal_and_acknowledgement(
    tmp_path,
    monkeypatch,
    window,
    expected_events,
    acknowledged,
    journal_replayed,
) -> None:
    run = _run(
        execution_id="execution-skeleton-crash-" + window,
        attempt_id="skeleton-crash-" + window,
        content="retry the exact root completion",
    )
    invoker = _NeverRunMemoryAgent()
    bridge = _active_bridge(
        tmp_path,
        monkeypatch,
        run=run,
        owner_chat_id="chat-skeleton-crash-" + window,
        invoker_factory=lambda _codec: invoker,
    )
    bundle = _bind_root_attempt(
        bridge,
        execution_id=run.session_id,
        run_id=run.attempt_id,
    ).bundle
    runner = _runner(bundle)
    assert runner.run().status == "completed"

    with monkeypatch.context() as crash_patch:
        if window in {"after_final", "after_terminal"}:
            original_sink = DurableEventSink.__call__
            event_type = (
                "final_message" if window == "after_final" else "run_completed"
            )

            def crash_after_sink(self, event):
                result = original_sink(self, event)
                if self is bundle.durable_event_sink and event.get("type") == event_type:
                    raise _SimulatedCrash(window)
                return result

            crash_patch.setattr(DurableEventSink, "__call__", crash_after_sink)
        elif window == "after_capture":
            original_capture = skeleton_root_completion._completion_from_attachment

            def crash_after_capture(**kwargs):
                original_capture(**kwargs)
                raise _SimulatedCrash(window)

            crash_patch.setattr(
                skeleton_root_completion,
                "_completion_from_attachment",
                crash_after_capture,
            )
        elif window == "after_worker":
            original_worker = skeleton_root_completion._run_memory_completion

            def crash_after_worker(**kwargs):
                original_worker(**kwargs)
                raise _SimulatedCrash(window)

            crash_patch.setattr(
                skeleton_root_completion,
                "_run_memory_completion",
                crash_after_worker,
            )
        else:
            original_ack = DurableWorkflowRunner.commit_root

            def crash_after_ack(self):
                result = original_ack(self)
                if self is runner:
                    raise _SimulatedCrash(window)
                return result

            crash_patch.setattr(DurableWorkflowRunner, "commit_root", crash_after_ack)

        with pytest.raises(_SimulatedCrash):
            complete_pupu_skeleton_root(
                runner,
                bridge,
                agent_name="Crash-window Skeleton root",
            )

    assert tuple(event.event_type for event in _root_events(bundle)) == expected_events
    assert runner.inspect().root_committed is acknowledged

    replay = complete_pupu_skeleton_root(
        runner,
        bridge,
        agent_name="Crash-window Skeleton root",
    )
    assert replay.journal_replayed is journal_replayed
    assert tuple(event.event_type for event in _root_events(bundle)) == (
        "final_message",
        "run_completed",
    )
    assert runner.inspect().root_committed
    assert invoker.calls == []
