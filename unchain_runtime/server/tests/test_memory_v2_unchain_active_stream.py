from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import unchain_adapter as adapter
from memory_v2_unchain_run_binding import PupuMemoryV2TextInputDraft
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from unchain.run_identity import MemoryV2RunRole


def test_active_normal_stream_uses_canonical_host_without_legacy_double_write() -> None:
    durable_events: list[dict] = []
    create_calls: list[tuple[tuple, dict]] = []
    run_kwargs: dict = {}

    class ActiveBridge:
        def persist_host_event(self, event):
            durable_events.append(dict(event))

    bridge = ActiveBridge()
    admission = SimpleNamespace(
        is_active=True,
        is_shadow=False,
        mode="active",
        owner_chat_id="chat-a",
        session_id="root-run-a",
        attempt_id="root-run-a",
        source_attempt_id="",
        runtime=None,
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
        _memory_v2_unchain_active_bridge = bridge
        _toolkits = []
        _max_iterations = 3
        _max_context_window_tokens = 16_384

        def run(self, **kwargs):
            run_kwargs.update(kwargs)
            event = {
                "type": "final_message",
                "run_id": kwargs["run_id"],
                "iteration": 0,
                "content": "done",
            }
            # A real Unchain Agent performs this persistence in ContextRuntime
            # before invoking PuPu's host callback.
            bridge.persist_host_event(event)
            kwargs["callback"](event)
            return SimpleNamespace(
                status="completed",
                messages=[{"role": "assistant", "content": "done"}],
            )

    def create_agent(*args, **kwargs):
        create_calls.append((args, kwargs))
        return Agent()

    forbidden = AssertionError("legacy PuPu Context V2 path must be bypassed")
    with mock.patch.object(
        adapter, "_create_agent", side_effect=create_agent
    ), mock.patch.object(
        adapter, "_load_recipe_from_options", return_value=None
    ), mock.patch.object(
        adapter, "_persist_memory_v2_semantic_event", side_effect=forbidden
    ), mock.patch.object(
        adapter, "_persist_memory_v2_run_started", side_effect=forbidden
    ), mock.patch.object(
        adapter, "_build_memory_v2_tool_runtime_config", side_effect=forbidden
    ), mock.patch.object(
        adapter, "_finalize_memory_v2_curator", side_effect=forbidden
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
                message="keep the complete task",
                history=[{"role": "user", "content": "legacy duplicate"}],
                attachments=[],
                options={"_memory_v2_requested": True},
                session_id="",
                attempt_id="root-run-a",
            )
        )

    run = create_calls[0][1]["memory_v2_shadow_run"]
    assert isinstance(run, PupuUnchainShadowRunDraft)
    assert run.execution_id == run.session_id == "root-run-a"
    assert run.run_id == run.root_run_id == "root-run-a"
    assert run.role is MemoryV2RunRole.ROOT
    assert isinstance(run.current_input_draft, PupuMemoryV2TextInputDraft)
    assert run.current_input_draft.content == "keep the complete task"
    assert run_kwargs["memory_v2_run_role"] is MemoryV2RunRole.ROOT
    assert run_kwargs["root_run_id"] == "root-run-a"
    assert run_kwargs["messages"] == [
        {"role": "user", "content": "keep the complete task"}
    ]
    assert [event["type"] for event in durable_events] == ["final_message"]
    assert sum(event.get("type") == "final_message" for event in events) == 1
