from __future__ import annotations

import copy
import json
from types import SimpleNamespace
from unittest import mock

import pytest

import unchain_adapter as adapter
from memory_v2_unchain_active_bridge import (
    PupuUnchainActiveBridge,
    PupuUnchainActiveBridgeError,
    preflight_pupu_unchain_active_host,
    prepare_pupu_unchain_active_bridge,
)
from memory_v2_unchain_host_event_boundary import (
    HOST_EVENT_ORIGIN_FALLBACK_FINAL,
    PupuUnchainHostEventAuthority,
    PupuUnchainHostEventBoundary,
)
from memory_v2_unchain_run_binding import PupuMemoryV2TextInputDraft
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from unchain.agent.modules import ContextModule
from unchain.agent.modules.task_state_bootstrap import (
    PinnedTaskStateBootstrapModule,
)
from unchain.agent import Agent, MemoryModule, PoliciesModule, ToolsModule
from unchain.context import SemanticEventProjectionMode
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.memory import (
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_CAPABILITIES,
    MEMORY_V2_MODULE_KEY,
)
from unchain.runtime import AgentRuntimeContext, ExecutionIdentity, ModuleGrant
from unchain.providers import OllamaModelIO


class _OllamaResponse:
    status_code = 200

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def raise_for_status(self):
        return None

    def iter_lines(self):
        yield json.dumps(
            {
                "message": {"content": "done"},
                "done": True,
                "prompt_eval_count": 2,
                "eval_count": 1,
            }
        )

    def read(self):
        return b""


def _exact_ollama_model_io(requests):
    def stream_factory(method, url, **request_kwargs):
        requests.append(copy.deepcopy(request_kwargs["json"]))
        return _OllamaResponse()

    return OllamaModelIO(model="test", stream_factory=stream_factory)


def _admission(*, active: bool = True):
    return SimpleNamespace(
        is_active=active,
        owner_chat_id="chat-active",
        session_id="session-active",
        attempt_id="root-active",
    )


def _run() -> PupuUnchainShadowRunDraft:
    return PupuUnchainShadowRunDraft(
        session_id="session-active",
        identity=ExecutionIdentity(
            execution_id="session-active",
            attempt_id="root-active",
            run_id="root-active",
            run_lineage=("root-active",),
        ),
        grant=ModuleGrant(
            module_key=MEMORY_V2_MODULE_KEY,
            capabilities=MEMORY_V2_CAPABILITIES,
            delegable_capabilities=MEMORY_V2_CAPABILITIES.difference(
                {MEMORY_EXECUTION_COMPLETE}
            ),
            authority="memory-completion:session-active",
        ),
        current_input_draft=PupuMemoryV2TextInputDraft(content="current objective"),
    )


def _prepare(tmp_path, monkeypatch):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    return prepare_pupu_unchain_active_bridge(
        admission=_admission(),
        run=_run(),
        bootstrap_history=(),
        no_unfinished_durable_checkpoint=True,
        no_pending_interaction=True,
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )


def test_active_bridge_mounts_canonical_context_module_and_bootstraps_input(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _prepare(tmp_path, monkeypatch)

    assert type(bridge) is PupuUnchainActiveBridge
    assert len(bridge.modules) == 2
    assert type(bridge.modules[0]) is ContextModule
    assert type(bridge.modules[1]) is PinnedTaskStateBootstrapModule
    assert (
        bridge.preparation.host_factory.projection_mode
        is SemanticEventProjectionMode.CANONICAL
    )

    state = RunState()
    state.session_state.session_id = "session-active"
    bridge.modules[0].runtime.bind_context(
        HarnessContext(
            state=state,
            phase="bootstrap",
            event={"run_id": "root-active"},
        )
    )
    attempt = bridge.attempt_for_run("root-active")
    events = attempt.bundle.journal.capture_snapshot().events
    assert [event.event_type for event in events] == [
        "generation.rebased",
        "message.user",
    ]
    assert events[1].payload["message"]["content"] == "current objective"

    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id="session-active",
        attempt_id="root-active",
        enqueue=lambda _event: None,
    )
    boundary.deliver(
        boundary.bind_semantic(
            {
                "type": "final_message",
                "run_id": "root-active",
                "iteration": 0,
                "content": "done",
            },
            authority=PupuUnchainHostEventAuthority(
                execution_id="session-active",
                attempt_id="root-active",
                origin=HOST_EVENT_ORIGIN_FALLBACK_FINAL,
            ),
        )
    )
    events = attempt.bundle.journal.capture_snapshot().events
    assert [event.event_type for event in events] == [
        "generation.rebased",
        "message.user",
        "final_message",
    ]


def test_active_preflight_atomically_imports_history_before_runtime_binding(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")

    preflight = preflight_pupu_unchain_active_host(
        owner_chat_id="chat-active",
        run=_run(),
        bootstrap_history=(
            {"role": "user", "content": "original objective"},
        ),
        no_unfinished_durable_checkpoint=True,
        no_pending_interaction=True,
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )

    bootstrap = preflight.atomic_bootstrap
    binding = preflight.preparation.binding
    events = preflight.preparation.host_factory.context_store.bind_execution(
        binding.execution_id
    ).capture_snapshot().events
    assert bootstrap.bootstrap_attempt_id != binding.attempt_id
    assert binding.generation_id == bootstrap.current_head.current_generation_id
    assert binding.head_revision == bootstrap.current_head.revision
    assert [event.payload["message"]["content"] for event in events] == [
        "original objective",
    ]


def test_active_bridge_is_default_closed_for_non_active_or_wrong_owner(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    assert prepare_pupu_unchain_active_bridge(
        admission=_admission(active=False),
        run=_run(),
        bootstrap_history=(),
        no_unfinished_durable_checkpoint=True,
        no_pending_interaction=True,
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    ) is None

    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "pupu_legacy")
    with pytest.raises(PupuUnchainActiveBridgeError, match="store owner"):
        prepare_pupu_unchain_active_bridge(
            admission=_admission(),
            run=_run(),
            bootstrap_history=(),
            no_unfinished_durable_checkpoint=True,
            no_pending_interaction=True,
            model_window_fallback=lambda provider, model: 16_384,
            partial_attempt_sink=lambda value, error: None,
        )


def test_active_context_module_compiles_provider_input_from_canonical_journal(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _prepare(tmp_path, monkeypatch)
    requests = []
    model_io = _exact_ollama_model_io(requests)

    admission = SimpleNamespace(
        is_active=True,
        provider="ollama",
        model="test",
        real_context_window_tokens=16_384,
    )
    with mock.patch.object(
        adapter,
        "_memory_v2_admission_from_options",
        return_value=admission,
    ), mock.patch.object(
        adapter,
        "_append_memory_v2_normal_toolkit",
        side_effect=AssertionError("legacy toolkit must remain bypassed"),
    ), mock.patch.object(
        adapter,
        "_build_memory_v2_optimizer_module",
        side_effect=AssertionError("legacy compiler must remain bypassed"),
    ):
        agent = adapter._build_developer_agent(
            UnchainAgent=Agent,
            ToolsModule=ToolsModule,
            MemoryModule=MemoryModule,
            PoliciesModule=PoliciesModule,
            provider="ollama",
            model="test",
            api_key="",
            max_iterations=1,
            toolkits=[],
            memory_manager=None,
            options={},
            enable_subagents=False,
            model_io_factory=lambda spec, context: model_io,
            context_memory_v2_modules=bridge.modules,
            official_context_v2_active=True,
        )

    result = agent.run(
        messages=[{"role": "user", "content": "stale inline duplicate"}],
        callback=lambda event: None,
        max_iterations=1,
        max_context_window_tokens=16_384,
        run_id="root-active",
        session_id="session-active",
        runtime_context=AgentRuntimeContext(
            identity=bridge.preparation.binding.identity,
            module_grants=(bridge.preparation.binding.grant,),
        ),
    )

    assert result.status == "completed"
    assert len(requests) == 1
    provider_messages = requests[0]["messages"]
    assert "current objective" in str(provider_messages)
    assert "stale inline duplicate" not in str(provider_messages)
    attempt = bridge.attempt_for_run("root-active")
    event_types = [
        event.event_type
        for event in attempt.bundle.journal.capture_snapshot().events
    ]
    assert event_types.count("message.user") == 1
    assert event_types.count("final_message") == 1


def test_active_provider_receives_exact_handle_but_never_plaintext(
    tmp_path,
    monkeypatch,
) -> None:
    handle = "pvh1_" + ("a" * 64)
    raw_handle = "pvh1_" + ("b" * 64)
    marker = f'<secret-handle label="API key" handle="{handle}"/>'
    raw_secret = "sk-proj-abcdefghijklmnopqrstuvwxyz"
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    bridge = prepare_pupu_unchain_active_bridge(
        admission=_admission(),
        run=PupuUnchainShadowRunDraft(
            session_id="session-active",
            identity=_run().identity,
            grant=_run().grant,
            current_input_draft=PupuMemoryV2TextInputDraft(
                content=(
                    f"Use {marker}; raw handle {raw_handle}; "
                    f"token={raw_secret}"
                )
            ),
        ),
        bootstrap_history=(),
        no_unfinished_durable_checkpoint=True,
        no_pending_interaction=True,
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )
    requests = []
    model_io = _exact_ollama_model_io(requests)

    admission = SimpleNamespace(
        is_active=True,
        provider="ollama",
        model="test",
        real_context_window_tokens=16_384,
    )
    with mock.patch.object(
        adapter,
        "_memory_v2_admission_from_options",
        return_value=admission,
    ), mock.patch.object(
        adapter,
        "_append_memory_v2_normal_toolkit",
        side_effect=AssertionError("legacy toolkit must remain bypassed"),
    ), mock.patch.object(
        adapter,
        "_build_memory_v2_optimizer_module",
        side_effect=AssertionError("legacy compiler must remain bypassed"),
    ):
        agent = adapter._build_developer_agent(
            UnchainAgent=Agent,
            ToolsModule=ToolsModule,
            MemoryModule=MemoryModule,
            PoliciesModule=PoliciesModule,
            provider="ollama",
            model="test",
            api_key="",
            max_iterations=1,
            toolkits=[],
            memory_manager=None,
            options={},
            enable_subagents=False,
            model_io_factory=lambda spec, context: model_io,
            context_memory_v2_modules=bridge.modules,
            official_context_v2_active=True,
        )

    result = agent.run(
        messages=[{"role": "user", "content": "stale inline duplicate"}],
        callback=lambda event: None,
        max_iterations=1,
        max_context_window_tokens=16_384,
        run_id="root-active",
        session_id="session-active",
        runtime_context=AgentRuntimeContext(
            identity=bridge.preparation.binding.identity,
            module_grants=(bridge.preparation.binding.grant,),
        ),
    )

    assert result.status == "completed"
    assert len(requests) == 1
    provider_messages = str(requests[0]["messages"])
    assert marker in provider_messages
    assert handle in provider_messages
    assert raw_handle not in provider_messages
    assert raw_secret not in provider_messages
    attempt = bridge.attempt_for_run("root-active")
    user_event = next(
        event
        for event in attempt.bundle.journal.capture_snapshot().events
        if event.event_type == "message.user"
    )
    assert marker in user_event.payload["message"]["content"]
    assert raw_handle not in str(user_event.to_dict())
    assert raw_secret not in str(user_event.to_dict())

    stored = b"\n".join(
        path.read_bytes()
        for path in bridge.preparation.host_factory.object_directory.iterdir()
        if path.is_file()
    )
    assert handle.encode("utf-8") in stored
    assert raw_handle.encode("utf-8") not in stored
    assert raw_secret.encode("utf-8") not in stored
