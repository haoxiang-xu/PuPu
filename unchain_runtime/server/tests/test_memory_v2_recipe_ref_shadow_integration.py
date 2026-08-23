from __future__ import annotations

import copy
import json
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import unchain_adapter as adapter
from memory_v2_unchain_read_adapter import open_pupu_unchain_memory_v2_reader
from memory_v2_unchain_run_binding import (
    PupuMemoryV2RunBindingRegistry,
    PupuMemoryV2TextInputDraft,
)
from memory_v2_unchain_shadow_bridge import (
    PupuUnchainShadowRunDraft,
    prepare_pupu_unchain_shadow_bridge,
)
from recipe import Recipe, RecipeAgent, RecipeSubagentRef
from unchain.agent import Agent, SubagentModule
from unchain.kernel import ModelTurnResult, ToolCall
from unchain.memory import (
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_CAPABILITIES,
    MEMORY_V2_MODULE_KEY,
)
from unchain.providers import OpenAIModelIO
from unchain.runtime import AgentRuntimeContext, ExecutionIdentity, ModuleGrant
from unchain.subagents import SubagentTemplate


OWNER_CHAT_ID = "chat-recipe-ref-shadow"
ROOT_SESSION_ID = "session-recipe-ref-shadow"
ROOT_RUN_ID = "root-recipe-ref-shadow"


def _root_runtime_context() -> AgentRuntimeContext:
    return AgentRuntimeContext(
        identity=ExecutionIdentity(
            execution_id=ROOT_SESSION_ID,
            attempt_id=ROOT_RUN_ID,
            run_id=ROOT_RUN_ID,
            run_lineage=(ROOT_RUN_ID,),
        ),
        module_grants=(
            ModuleGrant(
                module_key=MEMORY_V2_MODULE_KEY,
                capabilities=MEMORY_V2_CAPABILITIES,
                delegable_capabilities=MEMORY_V2_CAPABILITIES.difference(
                    {MEMORY_EXECUTION_COMPLETE}
                ),
                authority=f"memory-completion:{ROOT_SESSION_ID}",
            ),
        ),
    )


class _OpenAIStream:
    def __init__(self, response):
        self._response = response

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def __iter__(self):
        yield SimpleNamespace(
            type="response.completed",
            response=self._response,
        )


def _sequence_model_io(steps) -> OpenAIModelIO:
    remaining_steps = list(steps)
    response_index = 0

    class Responses:
        def create(self, **kwargs):
            nonlocal response_index
            if not remaining_steps:
                raise AssertionError("unexpected model turn")
            step = remaining_steps.pop(0)
            request = SimpleNamespace(
                messages=copy.deepcopy(kwargs.get("input") or [])
            )
            turn = step(request) if callable(step) else step
            response_index += 1

            output = []
            for tool_call in turn.tool_calls:
                arguments = tool_call.arguments
                if not isinstance(arguments, str):
                    arguments = json.dumps(arguments)
                output.append(
                    {
                        "type": "function_call",
                        "call_id": tool_call.call_id,
                        "name": tool_call.name,
                        "arguments": arguments,
                    }
                )
            if not output:
                output.append(
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [
                            {
                                "type": "output_text",
                                "text": turn.final_text,
                            }
                        ],
                    }
                )
            return _OpenAIStream(
                SimpleNamespace(
                    id=turn.response_id or f"offline-response-{response_index}",
                    output=output,
                    usage={
                        "input_tokens": 1,
                        "output_tokens": 1,
                        "total_tokens": 2,
                    },
                )
            )

    class Client:
        responses = Responses()

    return OpenAIModelIO(
        model="gpt-test",
        api_key="test-key",
        client_factory=lambda **_kwargs: Client(),
        default_payloads={},
        model_capabilities={},
    )


def _tool_turn(*, call_id: str, name: str, arguments: dict) -> ModelTurnResult:
    return ModelTurnResult(
        assistant_messages=[
            {
                "role": "assistant",
                "type": "function_call",
                "call_id": call_id,
                "name": name,
                "arguments": json.dumps(arguments),
            }
        ],
        tool_calls=[ToolCall(call_id=call_id, name=name, arguments=arguments)],
        final_text="",
    )


def _text_turn(text: str) -> ModelTurnResult:
    return ModelTurnResult(
        assistant_messages=[{"role": "assistant", "content": text}],
        tool_calls=[],
        final_text=text,
    )


def _child_recipe_payload() -> dict:
    return {
        "name": "Explore",
        "description": "Repository scout",
        "model": "openai:gpt-test",
        "max_iterations": 1,
        "subagent_profile": {
            "allowed_modes": ["delegate"],
            "output_mode": "summary",
            "memory_policy": "ephemeral",
            "parallel_safe": False,
        },
        "agent": {"prompt_format": "soul", "prompt": "Explore"},
        "toolkits": [],
        "subagent_pool": [],
        "nodes": [
            {"id": "start", "type": "start"},
            {
                "id": "inspect",
                "type": "agent",
                "override": {"prompt": "inspect the task"},
            },
            {
                "id": "summarize",
                "type": "agent",
                "override": {"prompt": "summarize {{#inspect.output#}}"},
            },
            {"id": "end", "type": "end"},
        ],
        "edges": [
            {
                "id": "e1",
                "kind": "flow",
                "source_node_id": "start",
                "source_port_id": "out",
                "target_node_id": "inspect",
                "target_port_id": "in",
            },
            {
                "id": "e2",
                "kind": "flow",
                "source_node_id": "inspect",
                "source_port_id": "out",
                "target_node_id": "summarize",
                "target_port_id": "in",
            },
            {
                "id": "e3",
                "kind": "flow",
                "source_node_id": "summarize",
                "source_port_id": "out",
                "target_node_id": "end",
                "target_port_id": "in",
            },
        ],
    }


def _shadow_admission(*, session_id: str, attempt_id: str):
    diagnostics = {}

    def update_diagnostics(value):
        diagnostics.clear()
        diagnostics.update(dict(value))

    return SimpleNamespace(
        is_active=False,
        is_shadow=True,
        mode="shadow",
        owner_chat_id=OWNER_CHAT_ID,
        session_id=session_id,
        attempt_id=attempt_id,
        source_attempt_id="",
        provider="openai",
        model="gpt-test",
        real_context_window_tokens=16_384,
        runtime=None,
        handoff_messages=[],
        diagnostics=lambda: dict(diagnostics),
        update_diagnostics=update_diagnostics,
    )


def _cold_attempt_events(root: Path, attempt_id: str) -> list[dict]:
    reader = open_pupu_unchain_memory_v2_reader(
        root_dir=root / "memory_v2",
        owner_chat_id=OWNER_CHAT_ID,
    )
    return reader.load_events(
        owner_chat_id=OWNER_CHAT_ID,
        after=0,
        limit=200,
        attempt_id=attempt_id,
        include_payload=True,
    )["events"]


def test_recipe_ref_child_graph_keeps_explicit_lineage_in_one_shadow_journal(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """A recipe-ref wrapper must not erase the root/child/graph identity."""

    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")

    registrations = []
    original_register_attempt = PupuMemoryV2RunBindingRegistry.register_attempt

    def register_attempt(self, **kwargs):
        binding = original_register_attempt(self, **kwargs)
        registrations.append(binding)
        return binding

    delegated_payloads = []

    def parent_after_delegate(request):
        delegated_payloads.append(json.loads(request.messages[-1]["output"]))
        return _text_turn("root complete")

    def resolve_shadow_admission(
        options,
        *,
        provider,
        model,
        real_context_window_tokens,
        session_id="",
    ):
        del provider, model, real_context_window_tokens
        return _shadow_admission(
            session_id=str(session_id or ROOT_SESSION_ID),
            attempt_id=str(
                (options or {}).get("_memory_v2_attempt_id") or ROOT_RUN_ID
            ),
        )

    def build_graph_step_agent(**kwargs):
        instructions = str(kwargs["recipe"].agent.prompt)
        return Agent(
            name=f"child-graph-{instructions[:16]}",
            instructions=instructions,
            provider=kwargs["provider"],
            model=kwargs["model"],
            modules=tuple(kwargs.get("context_memory_v2_modules") or ()),
            model_io_factory=lambda spec, context: _sequence_model_io(
                [_text_turn(instructions)]
            ),
        )

    runtime_state = {
        "kind": "disabled",
        "requested": False,
        "required": False,
        "available": False,
        "durability_available": False,
        "legacy_context_available": False,
        "reason": "",
    }

    with mock.patch.object(
        PupuMemoryV2RunBindingRegistry,
        "register_attempt",
        new=register_attempt,
    ), mock.patch("pathlib.Path.home", return_value=tmp_path):
        from recipe_loader import save_recipe

        save_recipe(_child_recipe_payload())
        parent_recipe = Recipe(
            name="Default",
            description="",
            model=None,
            max_iterations=2,
            agent=RecipeAgent(prompt_format="soul", prompt="delegate work"),
            toolkits=(),
            subagent_pool=(
                RecipeSubagentRef(
                    kind="recipe_ref",
                    recipe_name="Explore",
                    disabled_tools=(),
                ),
            ),
        )
        templates = adapter._materialize_recipe_subagents(
            recipe=parent_recipe,
            toolkits=[],
            provider="openai",
            model="gpt-test",
            api_key=None,
            max_iterations=2,
            UnchainAgent=Agent,
            ToolsModule=object,
            PoliciesModule=object,
            SubagentTemplate=SubagentTemplate,
            options={
                "modelId": "openai:gpt-test",
                "_memory_v2_requested": True,
                "_memory_v2_owner_chat_id": OWNER_CHAT_ID,
                "_memory_v2_attempt_id": ROOT_RUN_ID,
            },
        )

        root_admission = _shadow_admission(
            session_id=ROOT_SESSION_ID,
            attempt_id=ROOT_RUN_ID,
        )
        root_runtime_context = _root_runtime_context()
        root_grant = root_runtime_context.grant_for(MEMORY_V2_MODULE_KEY)
        assert root_grant is not None
        root_bridge = prepare_pupu_unchain_shadow_bridge(
            admission=root_admission,
            run=PupuUnchainShadowRunDraft(
                session_id=ROOT_SESSION_ID,
                identity=root_runtime_context.identity,
                grant=root_grant,
                current_input_draft=PupuMemoryV2TextInputDraft(
                    content="delegate to Explore"
                ),
            ),
            model_window_fallback=lambda provider, model: 16_384,
            partial_attempt_sink=lambda value, error: None,
        )
        assert root_bridge is not None

        parent = Agent(
            name="manager",
            provider="openai",
            model="gpt-test",
            modules=(
                *root_bridge.modules,
                SubagentModule(templates=templates),
            ),
            model_io_factory=lambda spec, context: _sequence_model_io(
                [
                    _tool_turn(
                        call_id="delegate-explore",
                        name="delegate_to_subagent",
                        arguments={
                            "target": "Explore",
                            "task": "inspect the repository",
                        },
                    ),
                    parent_after_delegate,
                ]
            ),
        )

        with mock.patch.object(
            adapter,
            "_resolve_memory_v2_admission",
            side_effect=resolve_shadow_admission,
        ), mock.patch.object(
            adapter,
            "_resolve_memory_runtime",
            return_value=(runtime_state, None),
        ), mock.patch.object(
            adapter,
            "_build_developer_agent",
            side_effect=build_graph_step_agent,
        ), mock.patch.object(
            adapter,
            "get_max_context_window_tokens",
            return_value=16_384,
        ), mock.patch.object(
            adapter,
            "_resolve_agent_api_key",
            return_value="test-key",
        ), mock.patch.object(
            adapter,
            "get_durable_jobs_runtime",
            return_value=None,
        ), mock.patch.object(
            adapter,
            "_memory_v2_bind_recalled_refs",
        ), mock.patch.object(
            adapter,
            "_import_memory_v2_history",
        ), mock.patch.object(
            adapter,
            "_bootstrap_memory_v2_current_request",
            return_value={},
        ), mock.patch.object(
            adapter,
            "_prepare_memory_v2_first_message_recall",
        ), mock.patch.object(
            adapter,
            "_build_memory_v2_tool_runtime_config",
            return_value={},
        ), mock.patch.object(
            adapter,
            "_persist_memory_v2_run_started",
        ), mock.patch.object(
            adapter,
            "_persist_memory_v2_semantic_event",
        ), mock.patch.object(
            adapter,
            "_build_bundle_from_result",
            return_value={},
        ), mock.patch.object(
            adapter,
            "_finalize_memory_v2_curator",
        ):
            result = parent.run(
                "delegate to Explore",
                session_id=ROOT_SESSION_ID,
                run_id=ROOT_RUN_ID,
                max_iterations=2,
                max_context_window_tokens=16_384,
                callback=root_bridge.compose_event_callback(None),
                runtime_context=root_runtime_context,
            )

    assert result.status == "completed"
    assert delegated_payloads == [
        mock.ANY
    ], "the root recipe must receive one recipe-ref result"
    assert delegated_payloads[0].get("status") == "completed", delegated_payloads[0]

    root_binding = next(
        binding for binding in registrations if binding.attempt_id == ROOT_RUN_ID
    )
    child_bindings = [
        binding
        for binding in registrations
        if len(binding.identity.run_lineage) == 2
    ]
    graph_bindings = sorted(
        (
            binding
            for binding in registrations
            if len(binding.identity.run_lineage) in (3, 4)
        ),
        key=lambda binding: len(binding.identity.run_lineage),
    )
    assert len(child_bindings) == 1
    assert len(graph_bindings) == 2
    child_binding = child_bindings[0]
    first_graph_binding, second_graph_binding = graph_bindings
    assert root_binding.root_run_id == ROOT_RUN_ID
    assert root_binding.parent_run_id is None
    assert root_binding.grant.allows(MEMORY_EXECUTION_COMPLETE)
    assert root_binding.grant.authority
    assert child_binding.root_run_id == ROOT_RUN_ID
    assert child_binding.parent_run_id == ROOT_RUN_ID
    assert child_binding.grant == root_binding.grant.delegated()
    assert first_graph_binding.root_run_id == ROOT_RUN_ID
    assert first_graph_binding.parent_run_id == child_binding.attempt_id
    assert second_graph_binding.root_run_id == ROOT_RUN_ID
    assert second_graph_binding.parent_run_id == first_graph_binding.attempt_id
    assert first_graph_binding.grant == child_binding.grant.delegated()
    assert second_graph_binding.grant == first_graph_binding.grant.delegated()

    for binding in (
        root_binding,
        child_binding,
        first_graph_binding,
        second_graph_binding,
    ):
        cold_events = _cold_attempt_events(tmp_path, binding.attempt_id)
        assert cold_events
        assert {event["attempt_id"] for event in cold_events} == {
            binding.attempt_id
        }
    assert len(
        {
            root_binding.attempt_id,
            child_binding.attempt_id,
            first_graph_binding.attempt_id,
            second_graph_binding.attempt_id,
        }
    ) == 4
