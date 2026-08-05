from __future__ import annotations

import base64
import json
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import unchain_adapter as adapter
from memory_v2_unchain_read_adapter import (
    open_pupu_unchain_memory_v2_reader,
)
from memory_v2_unchain_run_binding import (
    PupuMemoryV2InteractionInputDraft,
)
from memory_v2_unchain_shadow_bridge import (
    PupuUnchainShadowEventBridge,
    PupuUnchainShadowRunDraft,
    prepare_pupu_unchain_shadow_bridge,
)
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.memory import (
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_CAPABILITIES,
    MEMORY_V2_MODULE_KEY,
)
from unchain.runtime import AgentRuntimeContext, ExecutionIdentity, ModuleGrant


OWNER_CHAT_ID = "chat-resume-integration"
SESSION_ID = "session-resume-integration"
SOURCE_ATTEMPT_ID = "source-attempt"
RESUME_ATTEMPT_ID = "resume-attempt"
INTERACTION_ID = "interaction-resume-integration"


def _runtime_context(
    *,
    attempt_id: str,
    run_lineage: tuple[str, ...] | None = None,
) -> AgentRuntimeContext:
    return AgentRuntimeContext(
        identity=ExecutionIdentity(
            execution_id=SESSION_ID,
            attempt_id=attempt_id,
            run_id=attempt_id,
            run_lineage=run_lineage or (attempt_id,),
        ),
        module_grants=(
            ModuleGrant(
                module_key=MEMORY_V2_MODULE_KEY,
                capabilities=MEMORY_V2_CAPABILITIES,
                delegable_capabilities=MEMORY_V2_CAPABILITIES.difference(
                    {MEMORY_EXECUTION_COMPLETE}
                ),
                authority=f"memory-completion:{SESSION_ID}",
            ),
        ),
    )


def _shadow_admission(*, attempt_id: str):
    return SimpleNamespace(
        is_active=False,
        is_shadow=True,
        mode="shadow",
        owner_chat_id=OWNER_CHAT_ID,
        session_id=SESSION_ID,
        attempt_id=attempt_id,
        source_attempt_id="",
    )


def _bootstrap_real_shadow_attempt(
    bridge: PupuUnchainShadowEventBridge,
    *,
    attempt_id: str,
) -> None:
    state = RunState()
    state.session_state.session_id = SESSION_ID
    bridge.preparation.host_factory.context_module.runtime.bind_context(
        HarnessContext(
            state=state,
            phase="bootstrap",
            event={"run_id": attempt_id},
        )
    )


def _prepare_real_shadow_bridge(
    *,
    attempt_id: str,
    current_input_draft=None,
) -> PupuUnchainShadowEventBridge:
    runtime_context = _runtime_context(attempt_id=attempt_id)
    grant = runtime_context.grant_for(MEMORY_V2_MODULE_KEY)
    assert grant is not None
    bridge = prepare_pupu_unchain_shadow_bridge(
        admission=_shadow_admission(attempt_id=attempt_id),
        run=PupuUnchainShadowRunDraft(
            session_id=SESSION_ID,
            identity=runtime_context.identity,
            grant=grant,
            current_input_draft=current_input_draft,
        ),
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )
    assert isinstance(bridge, PupuUnchainShadowEventBridge)
    return bridge


def _seed_real_interaction_request() -> PupuUnchainShadowEventBridge:
    bridge = _prepare_real_shadow_bridge(attempt_id=SOURCE_ATTEMPT_ID)
    _bootstrap_real_shadow_attempt(
        bridge,
        attempt_id=SOURCE_ATTEMPT_ID,
    )
    bridge.persist(
        {
            "type": "interaction_requested",
            "run_id": SOURCE_ATTEMPT_ID,
            "iteration": 1,
            "interaction_request": {
                "interaction_id": INTERACTION_ID,
                "kind": "human_input",
                "question": "Choose a framework",
            },
        }
    )
    return bridge


def _cold_read_events(root: Path):
    reader = open_pupu_unchain_memory_v2_reader(
        root_dir=root / "memory_v2",
        owner_chat_id=OWNER_CHAT_ID,
    )
    page = reader.load_events(
        owner_chat_id=OWNER_CHAT_ID,
        after=0,
        limit=100,
        session_id=SESSION_ID,
        include_payload=True,
    )
    return reader, page["events"]


def test_resume_shadow_persists_receipt_before_provider_and_survives_cold_read(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")

    source_bridge = _seed_real_interaction_request()
    exact_response = {
        "selected_values": ["react"],
        "other_text": None,
    }
    pending = {
        "status": "receipt_recorded",
        "session_id": SESSION_ID,
        "interaction_id": INTERACTION_ID,
        "source_run_id": SOURCE_ATTEMPT_ID,
        "provider": "ollama",
        "model": "test",
        "kind": "human_input",
        "receipt_id": "receipt-resume-integration",
        "resolution": {
            "outcome": "submitted",
            "response": exact_response,
        },
        "resume_available": True,
    }
    resume_bridge_holder = {}
    provider_snapshot = []

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
        _memory_v2_admission = _shadow_admission(attempt_id=RESUME_ATTEMPT_ID)
        _toolkits = []

        def resume_interaction(self, **kwargs):
            bridge = resume_bridge_holder["bridge"]
            runtime_context = kwargs["runtime_context"]
            assert isinstance(runtime_context, AgentRuntimeContext)
            assert runtime_context.identity.run_lineage == (
                SOURCE_ATTEMPT_ID,
                RESUME_ATTEMPT_ID,
            )
            grant = runtime_context.grant_for(MEMORY_V2_MODULE_KEY)
            assert grant is not None
            assert grant.allows(MEMORY_EXECUTION_COMPLETE)
            assert grant.authority
            _bootstrap_real_shadow_attempt(
                bridge,
                attempt_id=RESUME_ATTEMPT_ID,
            )

            _, events_before_provider = _cold_read_events(tmp_path)
            provider_snapshot.extend(events_before_provider)
            assert [event["type"] for event in events_before_provider] == [
                "interaction.requested",
                "interaction.resolved",
            ]

            kwargs["callback"](
                {
                    "type": "final_message",
                    "run_id": kwargs["run_id"],
                    "iteration": 2,
                    "content": "resumed from the durable response",
                }
            )
            return SimpleNamespace(
                status="completed",
                messages=[
                    {
                        "role": "assistant",
                        "content": "resumed from the durable response",
                    }
                ],
            )

    def create_agent(*args, **kwargs):
        del args
        shadow_run = kwargs["memory_v2_shadow_run"]
        assert isinstance(shadow_run, PupuUnchainShadowRunDraft)
        assert isinstance(
            shadow_run.current_input_draft,
            PupuMemoryV2InteractionInputDraft,
        )
        bridge = prepare_pupu_unchain_shadow_bridge(
            admission=Agent._memory_v2_admission,
            run=shadow_run,
            model_window_fallback=lambda provider, model: 16_384,
            partial_attempt_sink=lambda value, error: None,
        )
        assert isinstance(bridge, PupuUnchainShadowEventBridge)
        resume_bridge_holder["bridge"] = bridge
        agent = Agent()
        agent._memory_v2_unchain_shadow_bridge = bridge
        return agent

    with mock.patch.object(
        adapter,
        "get_pending_interaction",
        return_value=pending,
    ), mock.patch.object(
        adapter,
        "resolve_resume_options",
        return_value={"modelId": "ollama:test"},
    ), mock.patch.object(
        adapter,
        "_create_agent",
        side_effect=create_agent,
    ), mock.patch.object(
        adapter,
        "save_resume_context",
    ), mock.patch.object(
        adapter,
        "clear_resume_context",
    ), mock.patch.object(
        adapter,
        "_persist_memory_v2_run_started",
    ), mock.patch.object(
        adapter,
        "_persist_memory_v2_semantic_event",
    ), mock.patch.object(
        adapter,
        "_build_bundle_from_result",
        return_value=None,
    ), mock.patch.object(
        adapter,
        "_finalize_memory_v2_curator",
    ), mock.patch.object(
        adapter,
        "register_interject_channels",
    ) as register, mock.patch.object(
        adapter,
        "release_interject_channels",
    ), mock.patch.object(
        adapter._uuid,
        "uuid4",
        return_value=RESUME_ATTEMPT_ID,
    ):
        register.return_value = SimpleNamespace(
            fyi=object(),
            digest=lambda event: None,
        )
        emitted = list(
            adapter.resume_chat_interaction_events(
                session_id=SESSION_ID,
                interaction_id=INTERACTION_ID,
                options={
                    "_memory_v2_requested": True,
                    "_memory_v2_owner_chat_id": OWNER_CHAT_ID,
                },
            )
        )

    resume_bridge = resume_bridge_holder["bridge"]
    source_binding = source_bridge.preparation.binding
    resume_binding = resume_bridge.preparation.binding
    assert source_binding.generation_id == resume_binding.generation_id
    assert source_binding.attempt_id == SOURCE_ATTEMPT_ID
    assert resume_binding.attempt_id == RESUME_ATTEMPT_ID
    assert source_binding.attempt_id != resume_binding.attempt_id
    assert resume_binding.identity.run_lineage == (
        SOURCE_ATTEMPT_ID,
        RESUME_ATTEMPT_ID,
    )
    assert resume_binding.root_run_id == SOURCE_ATTEMPT_ID
    assert resume_binding.parent_run_id == SOURCE_ATTEMPT_ID
    assert resume_binding.grant.allows(MEMORY_EXECUTION_COMPLETE)
    assert resume_binding.grant.authority

    assert [event["type"] for event in provider_snapshot] == [
        "interaction.requested",
        "interaction.resolved",
    ]
    cold_reader, cold_events = _cold_read_events(tmp_path)
    assert [event["type"] for event in cold_events] == [
        "interaction.requested",
        "interaction.resolved",
        "final_message",
    ]
    assert [event["attempt_id"] for event in cold_events] == [
        SOURCE_ATTEMPT_ID,
        RESUME_ATTEMPT_ID,
        RESUME_ATTEMPT_ID,
    ]
    assert {event["generation_id"] for event in cold_events} == {
        source_binding.generation_id
    }

    resolved = cold_events[1]["event"]
    content_page = cold_reader.read_scoped_content(
        ref=resolved["content_ref"],
        offset=0,
        limit=64 * 1024,
        owner_chat_id=OWNER_CHAT_ID,
    )
    assert content_page["truncated"] is False
    assert json.loads(base64.b64decode(content_page["data"])) == {
        "interaction_id": INTERACTION_ID,
        "response": exact_response,
        "submitted_by": "user",
    }
    assert any(event.get("type") == "final_message" for event in emitted)
