from __future__ import annotations

import json

from memory_v2_unchain_runtime_factory import (
    PupuUnchainContextMemoryV2HostFactory,
)
from unchain.context import (
    HostResolvedCurrentInput,
    SemanticEventProjectionMode,
)
from unchain.context.task_state_bootstrap import (
    PinnedTaskStateBootstrapHarness,
)
from unchain.context.task_state_runtime import TaskStateContextRuntime
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState


def _host(tmp_path, *, root_run_id: str):
    return PupuUnchainContextMemoryV2HostFactory(
        owner_chat_id="chat-pinned",
        root_run_id=root_run_id,
        database_path=tmp_path / "context_v2.sqlite3",
        object_directory=tmp_path / "objects",
        generation_resolver=lambda context, execution_id: context.event[
            "generation_id"
        ],
        current_input_resolver=lambda context, attempt: HostResolvedCurrentInput(
            attempt=attempt,
            content=context.event["current_input"],
        ),
        artifact_sanitizer=lambda content, media_type: content,
        event_payload_sanitizer=lambda event_type, payload: payload,
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
        projection_mode=SemanticEventProjectionMode.CANONICAL,
        production_enabled=True,
    )


def _context(*, phase: str, objective: str) -> HarnessContext:
    state = RunState()
    state.session_state.session_id = "execution-pinned"
    state.provider_state.provider = "openai"
    state.provider_state.model = "gpt-test"
    state.provider_state.max_context_window_tokens = 16_384
    return HarnessContext(
        state=state,
        phase=phase,
        event={
            "run_id": "attempt-pinned",
            "generation_id": "generation-pinned",
            "current_input": objective,
        },
    )


def test_active_host_bootstraps_and_compiles_restart_safe_pinned_task_state(
    tmp_path,
) -> None:
    objective = "Preserve the full Memory V2 task picture"
    host = _host(tmp_path, root_run_id="attempt-pinned")
    assert type(host.context_module.runtime) is TaskStateContextRuntime

    bootstrap = _context(phase="bootstrap", objective=objective)
    host.context_module.runtime.bind_context(bootstrap)
    PinnedTaskStateBootstrapHarness(
        binding_resolver=host.resolve_pinned_task_state_bootstrap,
    ).build_delta(bootstrap)

    task_state = host.task_state.get()
    assert task_state is not None
    assert task_state.revision == 1
    assert task_state.objective == objective
    assert len(task_state.source_event_refs) == 1
    assert task_state.source_event_refs[0].kind == "context_event"

    compiled = host.context_module.runtime.compile_context(
        _context(phase="before_model", objective=objective)
    )
    assert objective in json.dumps(compiled.to_dict(), ensure_ascii=False)

    restarted = _host(tmp_path, root_run_id="attempt-after-restart")
    recovered = restarted.task_state.get()
    assert recovered == task_state
