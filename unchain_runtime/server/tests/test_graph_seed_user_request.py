from __future__ import annotations

import copy
import json
from collections import Counter
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

import test_memory_v2_unchain_active_graph_interaction_resume as fixture
import unchain_adapter as adapter
from durable_interaction_host import record_interaction_receipt


FIRST_REQUEST = "Build the first graph-seed report"
SECOND_REQUEST = "Build the follow-up graph-seed report"
SECOND_ATTEMPT_ID = "workflow-active-graph-second-message-seed-test"
SEED_SCHEMAS = (
    "unchain.derived_handoff_input.v1",
    "unchain.graph_input_seed.v1",
)


def _capture_real_provider_wire(
    stack: ExitStack,
) -> dict[str, list[dict[str, object]]]:
    wires: dict[str, list[dict[str, object]]] = {
        "openai": [],
        "anthropic": [],
    }
    real_openai_model_io = fixture.OpenAIModelIO
    real_anthropic_model_io = fixture.AnthropicModelIO

    def openai_model_io(*args, client_factory, **kwargs):
        def capturing_client_factory(**client_kwargs):
            client = client_factory(**client_kwargs)
            inner_responses = client.responses

            class Responses:
                def create(self, **wire):
                    wires["openai"].append(copy.deepcopy(wire))
                    return inner_responses.create(**wire)

            client.responses = Responses()
            return client

        return real_openai_model_io(
            *args,
            client_factory=capturing_client_factory,
            **kwargs,
        )

    def anthropic_model_io(*args, client_factory, **kwargs):
        def capturing_client_factory(**client_kwargs):
            client = client_factory(**client_kwargs)
            inner_messages = client.messages

            class Messages:
                def stream(self, **wire):
                    wires["anthropic"].append(copy.deepcopy(wire))
                    return inner_messages.stream(**wire)

            client.messages = Messages()
            return client

        return real_anthropic_model_io(
            *args,
            client_factory=capturing_client_factory,
            **kwargs,
        )

    stack.enter_context(
        mock.patch.object(
            fixture,
            "OpenAIModelIO",
            side_effect=openai_model_io,
        )
    )
    stack.enter_context(
        mock.patch.object(
            fixture,
            "AnthropicModelIO",
            side_effect=anthropic_model_io,
        )
    )
    return wires


def _assert_exact_wire_shape(
    *,
    openai_wires: list[dict[str, object]],
    anthropic_wires: list[dict[str, object]],
) -> None:
    assert all(
        set(wire) == {"input", "model", "stream", "tools"}
        for wire in openai_wires
    )
    assert all(
        set(message) == {"content", "role"}
        for wire in openai_wires
        for message in wire["input"]
    )
    assert all(
        set(wire) == {"max_tokens", "messages", "model", "system", "tools"}
        for wire in anthropic_wires
    )
    assert all(
        set(message) == {"content", "role"}
        for wire in anthropic_wires
        for message in wire["messages"]
    )


def _assert_root_step_wire(
    wire: dict[str, object],
    *,
    request: str,
) -> None:
    messages = wire["input"]
    plain_user_messages = [
        message["content"]
        for message in messages
        if message["role"] == "user"
        and isinstance(message["content"], str)
    ]
    assert plain_user_messages.count(request) == 1
    assert messages[-1] == {"role": "user", "content": request}
    serialized_messages = json.dumps(messages, ensure_ascii=False)
    assert all(schema not in serialized_messages for schema in SEED_SCHEMAS)


def test_active_graph_seed_keeps_each_user_request_on_real_provider_wire(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    from recipe_loader import save_recipe

    provider_calls: Counter[tuple[str, str]] = Counter()
    provider_requests: dict[tuple[str, str], list[object]] = {}
    agent_calls: list[tuple[str, str, str]] = []
    base_options = {
        "modelId": "openai:graph-base",
        "recipe_name": fixture.RECIPE_NAME,
        "memory_enabled": True,
        "durable_interactions_required": True,
        "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": fixture.OWNER_CHAT_ID,
        "_memory_v2_session_id": fixture.EXECUTION_ID,
    }

    with ExitStack() as stack:
        wires = _capture_real_provider_wire(stack)
        stack.enter_context(
            fixture._production_patches(
                tmp_path=tmp_path,
                provider_calls=provider_calls,
                provider_requests=provider_requests,
                agent_calls=agent_calls,
            )
        )
        save_recipe(fixture._recipe_payload())

        first_events = list(
            adapter.stream_chat_events(
                message=FIRST_REQUEST,
                history=[],
                attachments=[],
                options={
                    **base_options,
                    "_memory_v2_attempt_id": fixture.COORDINATOR_ATTEMPT_ID,
                },
                session_id=fixture.EXECUTION_ID,
                attempt_id=fixture.COORDINATOR_ATTEMPT_ID,
            )
        )
        assert not any(
            event.get("type") == "final_message" for event in first_events
        )

        pending = adapter.get_pending_interaction(fixture.EXECUTION_ID)
        assert pending["status"] == "awaiting_response"
        receipt = record_interaction_receipt(
            session_id=fixture.EXECUTION_ID,
            interaction_id=pending["interaction_id"],
            approved=True,
            modified_arguments={
                "user_response": {"selected_values": ["react"]}
            },
            submitted_by="ui:test",
        )
        assert receipt["disposition"] == "receipt_recorded"

        reopened_events = list(
            adapter.resume_chat_interaction_events(
                session_id=fixture.EXECUTION_ID,
                interaction_id=pending["interaction_id"],
                options={
                    "modelId": "openai:graph-base",
                    "recipe_name": fixture.RECIPE_NAME,
                    "_memory_v2_requested": True,
                    "_memory_v2_owner_chat_id": fixture.OWNER_CHAT_ID,
                },
                attempt_id="transport-cold-reopen-seed-test",
                source_attempt_id=pending["source_run_id"],
            )
        )
        assert any(
            event.get("type") == "final_message"
            and event.get("content") == "Restart-safe React report"
            for event in reopened_events
        )

        second_events = list(
            adapter.stream_chat_events(
                message=SECOND_REQUEST,
                history=[],
                attachments=[],
                options={
                    **base_options,
                    "durable_interactions_required": False,
                    "_memory_v2_attempt_id": SECOND_ATTEMPT_ID,
                },
                session_id=fixture.EXECUTION_ID,
                attempt_id=SECOND_ATTEMPT_ID,
            )
        )
        assert any(
            event.get("type") == "final_message"
            and event.get("content") == "Restart-safe React report"
            for event in second_events
        )

    assert provider_calls == Counter(
        {
            ("openai", "graph-collect"): 3,
            ("anthropic", "graph-write"): 2,
        }
    )
    assert len(wires["openai"]) == 3
    assert len(wires["anthropic"]) == 2
    _assert_exact_wire_shape(
        openai_wires=wires["openai"],
        anthropic_wires=wires["anthropic"],
    )

    first_root_wire, cold_reopen_wire, second_root_wire = wires["openai"]
    _assert_root_step_wire(first_root_wire, request=FIRST_REQUEST)
    _assert_root_step_wire(second_root_wire, request=SECOND_REQUEST)

    cold_reopen_messages = cold_reopen_wire["input"]
    assert any(
        message == {"role": "user", "content": FIRST_REQUEST}
        for message in cold_reopen_messages
    )
    assert cold_reopen_messages[-1] == {"role": "user", "content": "react"}
    cold_reopen_serialized = json.dumps(
        cold_reopen_messages,
        ensure_ascii=False,
    )
    assert all(schema not in cold_reopen_serialized for schema in SEED_SCHEMAS)

    second_root_serialized = json.dumps(
        second_root_wire["input"],
        ensure_ascii=False,
    )
    assert FIRST_REQUEST in second_root_serialized
    assert "React evidence collected" in second_root_serialized

    for later_step_wire in wires["anthropic"]:
        later_step_serialized = json.dumps(
            later_step_wire["messages"],
            ensure_ascii=False,
        )
        assert "React evidence collected" in later_step_serialized
        assert "unchain.derived_handoff_input.v1" in later_step_serialized
