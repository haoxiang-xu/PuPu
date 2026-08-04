from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import unchain_adapter as adapter
from memory_v2_unchain_run_binding import (
    PupuMemoryV2InteractionInputDraft,
    PupuMemoryV2RunBindingRegistry,
    PupuMemoryV2TextInputDraft,
)
from memory_v2_unchain_shadow_bridge import (
    PupuUnchainShadowRunDraft,
    prepare_pupu_unchain_shadow_bridge,
)
from unchain.agent import Agent
from unchain.kernel import ModelTurnResult
from unchain.run_identity import MemoryV2RunRole


def _two_step_recipe():
    from recipe import parse_recipe_json

    return parse_recipe_json(
        {
            "name": "Two Step",
            "description": "",
            "model": "ollama:test",
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": ""},
            "toolkits": [],
            "subagent_pool": [],
            "nodes": [
                {"id": "start", "type": "start"},
                {
                    "id": "first",
                    "type": "agent",
                    "override": {"prompt": "first"},
                },
                {
                    "id": "second",
                    "type": "agent",
                    "override": {"prompt": "second {{#first.output#}}"},
                },
                {"id": "end", "type": "end"},
            ],
            "edges": [
                {
                    "id": "e1",
                    "kind": "flow",
                    "source_node_id": "start",
                    "source_port_id": "out",
                    "target_node_id": "first",
                    "target_port_id": "in",
                },
                {
                    "id": "e2",
                    "kind": "flow",
                    "source_node_id": "first",
                    "source_port_id": "out",
                    "target_node_id": "second",
                    "target_port_id": "in",
                },
                {
                    "id": "e3",
                    "kind": "flow",
                    "source_node_id": "second",
                    "source_port_id": "out",
                    "target_node_id": "end",
                    "target_port_id": "in",
                },
            ],
        }
    )


def test_normal_shadow_binds_root_and_persists_raw_event_before_pupu_trace() -> None:
    order: list[str] = []
    create_calls = []
    run_kwargs = {}

    class Bridge:
        def compose_event_callback(self, host_callback):
            def callback(event):
                order.append("official")
                return host_callback(event)

            return callback

    bridge = Bridge()
    admission = SimpleNamespace(
        is_active=False,
        is_shadow=True,
        mode="shadow",
        owner_chat_id="chat-a",
        session_id="root-run-a",
        attempt_id="root-run-a",
        source_attempt_id="",
    )

    class Agent:
        provider = "ollama"
        model = "test"
        _memory_runtime = {
            "requested": False,
            "required": False,
            "available": False,
            "reason": "",
        }
        _memory_v2_admission = admission
        _memory_v2_unchain_shadow_bridge = bridge
        _toolkits = []
        _max_iterations = 3
        _max_context_window_tokens = 8_192

        def run(self, **kwargs):
            run_kwargs.update(kwargs)
            kwargs["callback"](
                {
                    "type": "final_message",
                    "run_id": kwargs["run_id"],
                    "iteration": 0,
                    "content": "done",
                }
            )
            return SimpleNamespace(
                status="completed",
                messages=[{"role": "assistant", "content": "done"}],
            )

    def create_agent(*args, **kwargs):
        create_calls.append((args, kwargs))
        return Agent()

    with mock.patch.object(
        adapter, "_create_agent", side_effect=create_agent
    ), mock.patch.object(
        adapter, "_load_recipe_from_options", return_value=None
    ), mock.patch.object(
        adapter, "_persist_memory_v2_semantic_event", side_effect=lambda *_: order.append("legacy")
    ), mock.patch.object(
        adapter, "_persist_memory_v2_run_started"
    ), mock.patch.object(
        adapter, "_finalize_memory_v2_curator"
    ), mock.patch.object(
        adapter, "_build_bundle_from_result", return_value=None
    ), mock.patch.object(
        adapter, "register_interject_channels"
    ) as register, mock.patch.object(
        adapter, "release_interject_channels"
    ):
        register.return_value = SimpleNamespace(
            fyi=object(),
            digest=lambda event: None,
        )
        events = list(
            adapter.stream_chat_events(
                message="remember the full task",
                history=[],
                attachments=[],
                options={"_memory_v2_requested": True},
                session_id="",
                attempt_id="root-run-a",
            )
        )

    shadow_run = create_calls[0][1]["memory_v2_shadow_run"]
    assert isinstance(shadow_run, PupuUnchainShadowRunDraft)
    assert shadow_run.execution_id == "root-run-a"
    assert shadow_run.run_id == shadow_run.root_run_id == "root-run-a"
    assert shadow_run.role is MemoryV2RunRole.ROOT
    assert isinstance(shadow_run.current_input_draft, PupuMemoryV2TextInputDraft)
    assert shadow_run.current_input_draft.content == "remember the full task"
    assert run_kwargs["memory_v2_run_role"] is MemoryV2RunRole.ROOT
    assert run_kwargs["root_run_id"] == "root-run-a"
    assert order[:2] == ["official", "legacy"]
    assert any(event.get("type") == "final_message" for event in events)


def test_graph_shadow_uses_root_then_unique_step_ids_before_ui_rewrite(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    built = []
    run_calls = []
    registrations = []
    prepared_runs = []
    prepared_bridges = []
    original_register_attempt = PupuMemoryV2RunBindingRegistry.register_attempt

    def register_attempt(self, **kwargs):
        binding = original_register_attempt(self, **kwargs)
        registrations.append(binding)
        return binding

    monkeypatch.setattr(
        PupuMemoryV2RunBindingRegistry,
        "register_attempt",
        register_attempt,
    )
    admission = SimpleNamespace(
        is_active=False,
        is_shadow=True,
        mode="shadow",
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="workflow-a",
        source_attempt_id="",
        provider="ollama",
        model="test",
        real_context_window_tokens=16_384,
        runtime=None,
    )

    class ModelIO:
        provider = "ollama"
        model = "test"

        def __init__(self, text):
            self.text = text
            self.called = False

        def fetch_turn(self, _request):
            assert self.called is False
            self.called = True
            return ModelTurnResult(
                assistant_messages=[
                    {"role": "assistant", "content": self.text}
                ],
                tool_calls=[],
                final_text=self.text,
            )

    def build_agent(**kwargs):
        built.append(kwargs)
        instructions = kwargs["recipe"].agent.prompt
        model_io = ModelIO(instructions)
        agent = Agent(
            name="graph-shadow-step",
            instructions=instructions,
            provider=kwargs["provider"],
            model=kwargs["model"],
            modules=tuple(kwargs.get("context_memory_v2_modules") or ()),
            model_io_factory=lambda _spec, _context: model_io,
        )
        original_run = agent.run

        def recording_run(**run_kwargs):
            run_calls.append(run_kwargs)
            return original_run(**run_kwargs)

        agent.run = recording_run
        return agent

    def prepare_bridge(**kwargs):
        prepared_runs.append(kwargs["run"])
        bridge = prepare_pupu_unchain_shadow_bridge(**kwargs)
        prepared_bridges.append(bridge)
        return bridge

    with mock.patch.object(adapter, "_UnchainAgent", object), mock.patch.object(
        adapter, "_build_developer_agent", side_effect=build_agent
    ), mock.patch.object(
        adapter,
        "_resolve_memory_runtime",
        return_value=({"requested": False, "available": False, "reason": ""}, None),
    ), mock.patch.object(
        adapter, "_resolve_memory_v2_admission", return_value=admission
    ), mock.patch.object(
        adapter, "_import_memory_v2_history"
    ), mock.patch.object(
        adapter, "_bootstrap_memory_v2_current_request"
    ), mock.patch.object(
        adapter,
        "_persist_memory_v2_semantic_event",
        side_effect=AssertionError(
            "canonical graph shadow must not dual-write through PuPu"
        ),
    ), mock.patch.object(
        adapter, "_persist_memory_v2_run_started"
    ), mock.patch.object(
        adapter, "_build_memory_v2_tool_runtime_config", return_value={}
    ), mock.patch.object(
        adapter, "get_max_context_window_tokens", return_value=16_384
    ), mock.patch.object(
        adapter, "_build_bundle_from_result", return_value={}
    ), mock.patch.object(
        adapter, "_finalize_memory_v2_curator"
    ), mock.patch(
        "memory_v2_unchain_shadow_bridge.prepare_pupu_unchain_shadow_bridge",
        side_effect=prepare_bridge,
    ):
        events = list(
            adapter._stream_recipe_graph_events(
                recipe=_two_step_recipe(),
                message="full graph task",
                history=[],
                attachments=[],
                    options={
                        "modelId": "ollama:test",
                        "_memory_v2_requested": True,
                        "_memory_v2_owner_chat_id": "chat-a",
                    },
                session_id="session-a",
                run_id_override="workflow-a",
            )
        )

    assert prepared_runs[0].run_id == "workflow-a"
    assert prepared_runs[0].role is MemoryV2RunRole.ROOT
    assert isinstance(prepared_runs[0].current_input_draft, PupuMemoryV2TextInputDraft)
    first_run_id = adapter._memory_v2_graph_step_run_id(
        "workflow-a",
        0,
        "first",
    )
    second_run_id = adapter._memory_v2_graph_step_run_id(
        "workflow-a",
        1,
        "second",
    )
    assert [call["run_id"] for call in run_calls] == [
        first_run_id,
        second_run_id,
    ]
    assert run_calls[0]["memory_v2_run_role"] is MemoryV2RunRole.GRAPH_STEP
    assert run_calls[1]["memory_v2_run_role"] is MemoryV2RunRole.GRAPH_STEP
    assert run_calls[0]["root_run_id"] == "workflow-a"
    assert run_calls[1]["root_run_id"] == "workflow-a"
    assert {
        binding.attempt_id
        for binding in registrations
        if binding.role is MemoryV2RunRole.GRAPH_STEP
    }.issuperset({first_run_id, second_run_id})
    assert all(
        kwargs["context_memory_v2_modules"][:-1] == prepared_bridges[0].modules
        and kwargs["context_memory_v2_modules"][-1].name
        == "graph_step_bootstrap"
        for kwargs in built
    )
    attempt = prepared_bridges[0].preparation.host_factory.attempt(
        execution_id="session-a",
        attempt_id=first_run_id,
    )
    snapshot = attempt.bundle.journal.capture_snapshot()
    final_attempts = {
        item.attempt.attempt_id
        for item in snapshot.events
        if item.event_type == "final_message"
    }
    assert {run_calls[0]["run_id"], run_calls[1]["run_id"]}.issubset(
        final_attempts
    )
    assert any(
        event.get("type") == "final_message"
        and event.get("run_id") == second_run_id
        for event in events
    )


def test_resume_shadow_bootstraps_exact_response_before_resumed_provider() -> None:
    order: list[str] = []
    create_calls = []
    resume_kwargs = {}
    composed_callbacks = []

    class Bridge:
        def compose_event_callback(self, host_callback):
            composed_callbacks.append(host_callback)

            def callback(event):
                order.append("official")
                return host_callback(event)

            return callback

    bridge = Bridge()
    admission = SimpleNamespace(
        is_active=False,
        is_shadow=True,
        mode="shadow",
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="resume-a",
        source_attempt_id="",
    )

    class Agent:
        provider = "ollama"
        model = "test"
        _display_model = "ollama:test"
        _memory_runtime = {
            "kind": "v2_durability",
            "requested": False,
            "required": True,
            "available": True,
            "durability_available": True,
            "legacy_context_available": False,
            "reason": "",
        }
        _memory_v2_admission = admission
        _memory_v2_unchain_shadow_bridge = bridge
        _toolkits = []

        def resume_interaction(self, **kwargs):
            resume_kwargs.update(kwargs)
            order.append("provider")
            kwargs["callback"](
                {
                    "type": "final_message",
                    "run_id": kwargs["run_id"],
                    "iteration": 1,
                    "content": "resumed",
                }
            )
            return SimpleNamespace(
                status="completed",
                messages=[{"role": "assistant", "content": "resumed"}],
            )

    def create_agent(*args, **kwargs):
        create_calls.append((args, kwargs))
        shadow_run = kwargs["memory_v2_shadow_run"]
        assert isinstance(
            shadow_run.current_input_draft,
            PupuMemoryV2InteractionInputDraft,
        )
        order.append("bootstrap")
        return Agent()

    pending = {
        "status": "receipt_recorded",
        "session_id": "session-a",
        "interaction_id": "interaction-a",
        "source_run_id": "source-a",
        "provider": "ollama",
        "model": "test",
        "kind": "tool_approval",
        "receipt_id": "receipt-a",
        "resolution": {
            "outcome": "approved",
            "response": {"decision": "approve", "selected": ["one"]},
        },
        "resume_available": True,
    }

    with mock.patch.object(
        adapter,
        "get_pending_interaction",
        side_effect=[pending, {"status": "none", "session_id": "session-a"}],
    ), mock.patch.object(
        adapter,
        "resolve_resume_options",
        return_value={"modelId": "ollama:test"},
    ), mock.patch.object(
        adapter, "_create_agent", side_effect=create_agent
    ), mock.patch.object(
        adapter, "save_resume_context"
    ), mock.patch.object(
        adapter, "clear_resume_context"
    ), mock.patch.object(
        adapter, "_persist_memory_v2_run_started"
    ), mock.patch.object(
        adapter, "_persist_memory_v2_semantic_event"
    ), mock.patch.object(
        adapter, "_build_bundle_from_result", return_value=None
    ), mock.patch.object(
        adapter, "_finalize_memory_v2_curator"
    ), mock.patch.object(
        adapter, "register_interject_channels"
    ) as register, mock.patch.object(
        adapter, "release_interject_channels"
    ), mock.patch.object(
        adapter._uuid, "uuid4", return_value="resume-a"
    ):
        register.return_value = SimpleNamespace(
            fyi=object(),
            digest=lambda event: None,
        )
        events = list(
            adapter.resume_chat_interaction_events(
                session_id="session-a",
                interaction_id="interaction-a",
                options={
                    "_memory_v2_requested": True,
                    "_memory_v2_owner_chat_id": "chat-a",
                },
            )
        )

    shadow_run = create_calls[0][1]["memory_v2_shadow_run"]
    assert isinstance(shadow_run, PupuUnchainShadowRunDraft)
    assert shadow_run.execution_id == shadow_run.session_id == "session-a"
    assert shadow_run.attempt_id == shadow_run.run_id == "resume-a"
    assert shadow_run.root_run_id == "resume-a"
    assert shadow_run.role is MemoryV2RunRole.ROOT
    assert shadow_run.source_attempt_id == ""
    assert shadow_run.current_input_draft.canonical_value() == {
        "kind": "interaction",
        "interaction_id": "interaction-a",
        "response": {"decision": "approve", "selected": ["one"]},
        "submitted_by": "user",
    }
    assert order.index("bootstrap") < order.index("provider") < order.index("official")
    assert len(composed_callbacks) == 1
    assert resume_kwargs["memory_v2_run_role"] is MemoryV2RunRole.ROOT
    assert resume_kwargs["root_run_id"] == "resume-a"
    assert any(event.get("type") == "final_message" for event in events)
