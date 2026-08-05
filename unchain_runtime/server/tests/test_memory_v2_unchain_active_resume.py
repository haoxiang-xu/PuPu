from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import unchain_adapter as adapter
from memory_v2_unchain_run_binding import PupuMemoryV2InteractionInputDraft
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from unchain.memory import MEMORY_EXECUTION_COMPLETE, MEMORY_V2_MODULE_KEY
from unchain.runtime import AgentRuntimeContext


def test_active_resume_uses_canonical_host_without_legacy_double_write() -> None:
    durable_events: list[dict] = []
    create_calls: list[tuple[tuple, dict]] = []
    resume_kwargs: dict = {}

    class ActiveBridge:
        def persist_host_event(self, event):
            durable_events.append(dict(event))

    bridge = ActiveBridge()
    admission = SimpleNamespace(
        is_active=True,
        is_shadow=False,
        mode="active",
        owner_chat_id="chat-resume-active",
        session_id="session-resume-active",
        attempt_id="resume-attempt-active",
        source_attempt_id="source-attempt-active",
        runtime=None,
    )

    class Agent:
        provider = "ollama"
        model = "test"
        _display_model = "ollama:test"
        _memory_runtime = {
            "kind": "v2_durability",
            "requested": True,
            "required": True,
            "available": True,
            "durability_available": True,
            "legacy_context_available": False,
            "reason": "",
        }
        _memory_v2_admission = admission
        _memory_v2_unchain_active_bridge = bridge
        _toolkits = []

        def resume_interaction(self, **kwargs):
            resume_kwargs.update(kwargs)
            event = {
                "type": "final_message",
                "run_id": kwargs["run_id"],
                "iteration": 1,
                "content": "resumed",
            }
            # A real Unchain Agent persists this through ContextRuntime before
            # invoking the PuPu host callback.
            bridge.persist_host_event(event)
            kwargs["callback"](event)
            return SimpleNamespace(
                status="completed",
                messages=[{"role": "assistant", "content": "resumed"}],
            )

    def create_agent(*args, **kwargs):
        create_calls.append((args, kwargs))
        return Agent()

    pending = {
        "status": "receipt_recorded",
        "session_id": "session-resume-active",
        "interaction_id": "interaction-active",
        "source_run_id": "source-attempt-active",
        "provider": "ollama",
        "model": "test",
        "kind": "human_input",
        "receipt_id": "receipt-active",
        "resolution": {
            "outcome": "submitted",
            "response": {"selected_values": ["continue"]},
        },
        "resume_available": True,
    }

    forbidden = AssertionError("legacy PuPu Context V2 path must be bypassed")
    with mock.patch.object(
        adapter, "get_pending_interaction", return_value=pending
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
    ), mock.patch.object(
        adapter._uuid, "uuid4", return_value="resume-attempt-active"
    ):
        register.return_value = SimpleNamespace(
            fyi=object(),
            digest=lambda event: None,
        )
        events = list(
            adapter.resume_chat_interaction_events(
                session_id="session-resume-active",
                interaction_id="interaction-active",
                options={
                    "_memory_v2_requested": True,
                    "_memory_v2_owner_chat_id": "chat-resume-active",
                },
            )
        )

    run = create_calls[0][1]["memory_v2_shadow_run"]
    assert isinstance(run, PupuUnchainShadowRunDraft)
    assert run.run_id == "resume-attempt-active"
    assert run.identity.run_lineage == (
        "source-attempt-active",
        "resume-attempt-active",
    )
    assert run.root_run_id == "source-attempt-active"
    assert run.parent_run_id == "source-attempt-active"
    assert run.grant.allows(MEMORY_EXECUTION_COMPLETE)
    assert run.grant.authority
    assert isinstance(run.current_input_draft, PupuMemoryV2InteractionInputDraft)
    assert run.current_input_draft.interaction_id == "interaction-active"
    assert dict(run.current_input_draft.response) == {
        "selected_values": ("continue",)
    }
    runtime_context = resume_kwargs["runtime_context"]
    assert isinstance(runtime_context, AgentRuntimeContext)
    assert runtime_context.identity == run.identity
    assert runtime_context.grant_for(MEMORY_V2_MODULE_KEY) == run.grant
    assert [event["type"] for event in durable_events] == [
        "interaction_resolved",
        "final_message",
    ]
    assert sum(event.get("type") == "final_message" for event in events) == 1
