from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from memory_v2_unchain_run_binding import (
    PupuMemoryV2TextInputDraft,
    build_shadow_host_factory,
)
from memory_v2_unchain_shadow_bridge import (
    PupuUnchainShadowBridgeError,
    PupuUnchainShadowEventBridge,
    PupuUnchainShadowRunDraft,
    prepare_pupu_unchain_shadow_bridge,
)
from unchain.memory import (
    MEMORY_CANDIDATE_PROPOSE,
    MEMORY_CONTEXT_READ,
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_MODULE_KEY,
    MEMORY_WORKSPACE_READ,
)
from unchain.context import SemanticEventProjectionMode
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.runtime import ExecutionIdentity, ModuleGrant


_DELEGABLE_MEMORY_CAPABILITIES = frozenset(
    {
        MEMORY_CONTEXT_READ,
        MEMORY_WORKSPACE_READ,
        MEMORY_CANDIDATE_PROPOSE,
    }
)


def _identity(
    *,
    run_id: str,
    ancestors: tuple[str, ...] = (),
) -> ExecutionIdentity:
    return ExecutionIdentity(
        execution_id="execution-a",
        attempt_id=run_id,
        run_id=run_id,
        run_lineage=(*ancestors, run_id),
    )


def _grant(*, completion_authority: bool) -> ModuleGrant:
    capabilities = _DELEGABLE_MEMORY_CAPABILITIES
    if completion_authority:
        capabilities = frozenset(
            {*capabilities, MEMORY_EXECUTION_COMPLETE}
        )
    return ModuleGrant(
        module_key=MEMORY_V2_MODULE_KEY,
        capabilities=capabilities,
        delegable_capabilities=_DELEGABLE_MEMORY_CAPABILITIES,
        authority=("memory-completion:execution" if completion_authority else None),
    )


def _run(*, run_id: str = "root-run-a") -> PupuUnchainShadowRunDraft:
    ancestors = () if run_id == "root-run-a" else ("root-run-a",)
    return PupuUnchainShadowRunDraft(
        session_id="session-a",
        identity=_identity(run_id=run_id, ancestors=ancestors),
        grant=_grant(completion_authority=not ancestors),
        current_input_draft=(
            PupuMemoryV2TextInputDraft(content="hello")
            if not ancestors
            else None
        ),
    )


def _context(*, execution_id: str, run_id: str) -> HarnessContext:
    state = RunState()
    state.session_state.session_id = execution_id
    return HarnessContext(
        state=state,
        phase="bootstrap",
        event={"run_id": run_id},
    )


def _bridge(root: Path) -> PupuUnchainShadowEventBridge:
    preparation = build_shadow_host_factory(
        owner_chat_id="chat-a",
        session_id="session-a",
        identity=_identity(run_id="root-run-a"),
        grant=_grant(completion_authority=True),
        current_input_draft=PupuMemoryV2TextInputDraft(content="hello"),
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )
    preparation.host_factory.context_module.runtime.bind_context(
        _context(execution_id="execution-a", run_id="root-run-a")
    )
    return PupuUnchainShadowEventBridge(
        preparation=preparation,
        execution_id="execution-a",
    )


def test_semantic_event_is_durable_before_host_notification(tmp_path: Path) -> None:
    bridge = _bridge(tmp_path)
    assert (
        bridge.preparation.host_factory.projection_mode
        is SemanticEventProjectionMode.SHADOW_OBSERVED
    )
    observed: list[str] = []

    def notify(event):
        snapshot = (
            bridge.preparation.host_factory.attempt(
                execution_id="execution-a",
                attempt_id="root-run-a",
            )
            .bundle.journal.capture_snapshot()
        )
        assert snapshot.events[-1].event_type == "final_message"
        observed.append(str(event["content"]))
        return "notified"

    result = bridge.persist_then_notify(
        {
            "type": "final_message",
            "run_id": "root-run-a",
            "iteration": 1,
            "content": "finished",
        },
        notify,
    )

    assert result == "notified"
    assert observed == ["finished"]


def test_ephemeral_event_is_not_stored_but_is_still_notified(tmp_path: Path) -> None:
    bridge = _bridge(tmp_path)
    attempt = bridge.preparation.host_factory.attempt(
        execution_id="execution-a",
        attempt_id="root-run-a",
    )
    before = attempt.bundle.journal.capture_snapshot().events
    notified: list[str] = []

    bridge.persist_then_notify(
        {
            "type": "token_delta",
            "run_id": "root-run-a",
            "delta": "x",
        },
        lambda event: notified.append(str(event["delta"])),
    )

    assert attempt.bundle.journal.capture_snapshot().events == before
    assert notified == ["x"]


def test_shadow_bridge_records_legacy_tool_pair_as_observed_artifact(
    tmp_path: Path,
) -> None:
    bridge = _bridge(tmp_path)

    bridge.persist(
        {
            "type": "tool_call",
            "run_id": "root-run-a",
            "iteration": 0,
            "tool_name": "lookup",
            "call_id": "call-a",
            "arguments": {"query": "weather"},
            "source_provider": "openai",
        }
    )
    bridge.persist(
        {
            "type": "tool_result",
            "run_id": "root-run-a",
            "iteration": 0,
            "tool_name": "lookup",
            "call_id": "call-a",
            "result": {"forecast": "sunny", "detail": "complete"},
        }
    )

    snapshot = (
        bridge.preparation.host_factory.attempt(
            execution_id="execution-a",
            attempt_id="root-run-a",
        )
        .bundle.journal.capture_snapshot()
    )
    call, result = snapshot.events[-2:]
    assert [call.event_type, result.event_type] == ["tool_call", "tool_result"]
    assert call.payload["call_id"] == result.payload["call_id"] == "call-a"
    assert result.payload["observation"]["authoritative"] is False
    assert result.payload["full_output_ref"]["kind"] == "artifact"
    assert "execution_subject" not in result.payload


def test_unbound_event_fails_before_host_notification(tmp_path: Path) -> None:
    bridge = _bridge(tmp_path)
    notified = []

    with pytest.raises(PupuUnchainShadowBridgeError, match="exact bootstrapped"):
        bridge.persist_then_notify(
            {"type": "final_message", "run_id": "foreign-run"},
            notified.append,
        )

    assert notified == []


def test_parent_shadow_forwards_official_sibling_attempt_without_duplicate_write(
    tmp_path: Path,
) -> None:
    parent = _bridge(tmp_path)
    child_preparation = build_shadow_host_factory(
        owner_chat_id="chat-a",
        session_id="session-a",
        identity=_identity(
            run_id="child-run-a",
            ancestors=("root-run-a",),
        ),
        grant=_grant(completion_authority=False),
        current_input_draft=None,
        database_path=tmp_path / "context_v2.sqlite3",
        object_directory=tmp_path / "objects",
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )
    child_preparation.host_factory.context_module.runtime.bind_context(
        _context(execution_id="execution-a", run_id="child-run-a")
    )
    child = PupuUnchainShadowEventBridge(
        preparation=child_preparation,
        execution_id="execution-a",
    )
    event = {
        "type": "final_message",
        "run_id": "child-run-a",
        "iteration": 0,
        "content": "child complete",
    }
    child.persist(event)
    before = child_preparation.host_factory.attempt(
        execution_id="execution-a",
        attempt_id="child-run-a",
    ).bundle.journal.capture_snapshot().events
    notified = []

    parent.compose_event_callback(notified.append)(event)

    after = child_preparation.host_factory.attempt(
        execution_id="execution-a",
        attempt_id="child-run-a",
    ).bundle.journal.capture_snapshot().events
    assert after == before
    assert notified == [event]


def test_dynamic_child_bootstrap_routes_to_same_generation_journal(
    tmp_path: Path,
) -> None:
    bridge = _bridge(tmp_path)
    bridge.preparation.host_factory.context_module.runtime.bind_context(
        _context(execution_id="execution-a", run_id="child-run-a")
    )

    bridge.persist(
        {
            "type": "subagent_completed",
            "run_id": "child-run-a",
            "parent_run_id": "root-run-a",
            "child_run_id": "child-run-a",
            "status": "completed",
        }
    )

    child = bridge.preparation.host_factory.attempt(
        execution_id="execution-a",
        attempt_id="child-run-a",
    )
    assert child.bundle.attempt.generation.generation_id == (
        bridge.preparation.binding.generation_id
    )
    snapshot = child.bundle.journal.capture_snapshot()
    assert snapshot.events[-1].attempt.attempt_id == "child-run-a"
    assert snapshot.events[-1].event_type == "subagent_completed"


def test_admitted_unchain_shadow_builds_from_data_directory(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")

    bridge = prepare_pupu_unchain_shadow_bridge(
        admission=SimpleNamespace(is_shadow=True, owner_chat_id="chat-a"),
        run=_run(),
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )

    assert isinstance(bridge, PupuUnchainShadowEventBridge)
    assert bridge.preparation.host_factory.database_path == (
        tmp_path / "memory_v2" / "context_v2.sqlite3"
    )


def test_off_or_non_unchain_owner_keeps_off_path_unmounted(
    tmp_path: Path,
    monkeypatch,
) -> None:
    run = _run()
    monkeypatch.delenv("UNCHAIN_DATA_DIR", raising=False)
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    assert (
        prepare_pupu_unchain_shadow_bridge(
            admission=SimpleNamespace(is_shadow=False, owner_chat_id="chat-a"),
            run=run,
            model_window_fallback=lambda provider, model: 16_384,
            partial_attempt_sink=lambda value, error: None,
        )
        is None
    )

    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "pupu_legacy")
    assert (
        prepare_pupu_unchain_shadow_bridge(
            admission=SimpleNamespace(is_shadow=True, owner_chat_id="chat-a"),
            run=run,
            model_window_fallback=lambda provider, model: 16_384,
            partial_attempt_sink=lambda value, error: None,
        )
        is None
    )


def test_admitted_attachment_only_input_is_resolved_before_run_binding(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")

    bridge = prepare_pupu_unchain_shadow_bridge(
        admission=SimpleNamespace(is_shadow=True, owner_chat_id="chat-a"),
        run=PupuUnchainShadowRunDraft(
            session_id="session-a",
            identity=_identity(run_id="root-run-a"),
            grant=_grant(completion_authority=True),
            attachment_blocks=(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": "iVBORw0KGgoAAAANSUhEUg==",
                    },
                },
            ),
        ),
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )

    assert bridge is not None
    current_input = bridge.preparation.binding.current_input_draft
    assert isinstance(current_input, PupuMemoryV2TextInputDraft)
    assert current_input.content == ""
    assert len(current_input.attachments) == 1
