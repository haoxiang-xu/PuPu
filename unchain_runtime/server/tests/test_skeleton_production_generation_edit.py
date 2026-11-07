"""Actual production terminal graphs remain compatible with history edits."""
import os
from pathlib import Path

import pytest
import unchain_adapter as adapter
from durable_interaction_host import DurableInteractionHostError
from memory_v2_unchain_generation_api import (
    MemoryV2UnchainGenerationAPIError, open_pupu_unchain_generation_api,
)
from skeleton_production_state import load_launch
from test_skeleton_production_chat import production, _approval_fixture


def _edit_history(session, operation_id):
    api = open_pupu_unchain_generation_api(
        root_dir=Path(os.environ["UNCHAIN_DATA_DIR"]) / "memory_v2",
        owner_chat_id="production-chat")
    head = api.get_session_head(owner_chat_id="production-chat", session_id=session)
    return api.rebase_session(owner_chat_id="production-chat", session_id=session,
        replacement_history=[{"role": "user", "content": "edited root history"}],
        source_generation_id=head["current_generation_id"],
        expected_session_revision=head["session_revision"],
        operation_id=operation_id, reason="edit")


def test_completed_public_skeleton_generation_can_be_edited_and_reused(production):
    _store, options, calls = production
    session = "history-edit-session"
    first = list(adapter.stream_chat_events(message="original prompt", history=[], options=options,
        session_id=session, attempt_id="history-root-1"))
    assert [e["content"] for e in first if e.get("type") == "final_message"
        and e.get("scope") == "root"] == ["End production reply"]
    original = load_launch(session, "history-root-1")
    changed = _edit_history(session, "edit-completed-root")
    assert changed["generation_id"] != original.descriptor["binding"]["generation_id"]
    with pytest.raises(DurableInteractionHostError) as stale:
        load_launch(session, "history-root-1")
    assert stale.value.code == "skeleton_launch_generation_mismatch"
    second = list(adapter.stream_chat_events(message="new prompt", history=[], options=options,
        session_id=session, attempt_id="history-root-2"))
    assert [e["content"] for e in second if e.get("type") == "final_message"
        and e.get("scope") == "root"] == ["End production reply"]
    assert len(calls) == 2
    assert "edited root history" in str(calls[1]["wire"])


def test_cancelled_public_approval_can_be_edited(production, monkeypatch):
    options, effects, calls = _approval_fixture(production, monkeypatch, count=1)
    session = "cancelled-history-session"
    list(adapter.stream_chat_events(message="wait then cancel", history=[], options=options,
        session_id=session, attempt_id="cancelled-history-root"))
    pending = adapter.get_pending_interaction(session)
    adapter.cancel_chat_execution(session_id=session, attempt_id="cancelled-history-root",
        owner_chat_id="production-chat", expected_interaction_id=pending["interaction_id"])
    assert load_launch(session, "cancelled-history-root").store.load().state["status"] == "cancelled"
    assert effects == [] and len(calls) == 1
    assert _edit_history(session, "edit-cancelled-root")["session_revision"] == 2


def test_premodel_context_overflow_public_attempt_can_be_edited(production):
    from test_skeleton_resource_store import agent
    store, options, calls = production
    resource = store.get_resource("production-agent")
    document = agent("production-agent")
    document["nodes"][1]["config"]["kernel"]["prompt"] = "mandatory " * 20_000
    store.save_draft(document, expected_edit_token=resource["edit_token"])
    session = "failed-history-session"
    with pytest.raises(DurableInteractionHostError) as failure:
        list(adapter.stream_chat_events(message="pre-model failure", history=[], options=options,
            session_id=session, attempt_id="failed-history-root"))
    assert failure.value.code == "context_overflow"
    state = load_launch(session, "failed-history-root").store.load().state
    assert state["status"] == "failed" and state["error"]["code"] == "context_overflow"
    assert calls == []
    assert _edit_history(session, "edit-failed-root")["session_revision"] == 2


def test_public_waiting_approval_still_blocks_history_edit(production, monkeypatch):
    options, effects, calls = _approval_fixture(production, monkeypatch, count=1)
    session = "waiting-history-session"
    list(adapter.stream_chat_events(message="wait for approval", history=[], options=options,
        session_id=session, attempt_id="waiting-history-root"))
    launch = load_launch(session, "waiting-history-root")
    before = launch.journal.capture_snapshot()
    pending = adapter.get_pending_interaction(session)
    with pytest.raises(MemoryV2UnchainGenerationAPIError) as failure:
        _edit_history(session, "must-not-edit-wait")
    assert failure.value.code == "context_v2_rebase_in_progress"
    assert launch.journal.capture_snapshot() == before
    after = adapter.get_pending_interaction(session)
    # Presentation time is allocated at each read; durable identity is stable.
    after["presentation"]["trace_frame"].pop("ts")
    pending["presentation"]["trace_frame"].pop("ts")
    assert after == pending
    assert effects == [] and len(calls) == 1
