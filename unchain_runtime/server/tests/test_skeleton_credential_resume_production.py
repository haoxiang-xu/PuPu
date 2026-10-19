"""Issued credential scopes continue real persisted approvals to durable End.

The shared production fixture redirects Path.home to pytest's temporary tree;
no HOME environment override, user library, live vault or model is used here.
"""
from copy import deepcopy
import json
import os
from pathlib import Path
from types import SimpleNamespace

import pytest

import durable_interaction_host as interactions
import skeleton_production_chat as production_chat
import unchain_adapter as adapter
from route_chat import _sanitize_memory_agent_config
from session_execution_guard import snapshot_session_guard
from skeleton_credential_requirements import requirements_for_resume, requirements_for_start
from skeleton_production_interactions import resolve_pending_skeleton_interaction
from skeleton_production_state import load_launch
from skeleton_resource_store import SkeletonResourceStore
from test_skeleton_production_chat import production, _approval_fixture


def _query(options, session_id, *, interaction_id=""):
    resume = bool(interaction_id)
    return {"schema": "pupu.skeleton_credential_query.v1", "mode": "resume" if resume else "start",
        "session_id": session_id, "owner_chat_id": options["_memory_v2_owner_chat_id"],
        "interaction_id": interaction_id, "source_attempt_id": "",
        "selection": None if resume else options["skeleton_selection"], "recipe_name": "",
        "memory_agent_config": options["_memory_v2_memory_agent_config"]}


def _waiting(production, monkeypatch, *, case, count=2):
    options, effects, calls = _approval_fixture(production, monkeypatch, count=count)
    store = production[0]
    old = store.get_resource("production-agent")
    document = deepcopy(old["document"])
    document["nodes"][1]["config"]["kernel"]["profile"].update(
        id="openai:test-model", credential_ref="openai", endpoint="https://api.openai.com/v1")
    store.save_draft(document, expected_edit_token=old["edit_token"])
    memory_config = _sanitize_memory_agent_config({"displayName": "  Scoped Memory Agent  ",
        "additionalInstructions": "Literal memory instructions", "provider": "Anthropic",
        "modelId": "claude-sonnet-4-6"})
    assert memory_config["provider"] == "anthropic"
    assert memory_config["displayName"] == "Scoped Memory Agent"
    options["_memory_v2_memory_agent_config"] = memory_config
    options["anthropicApiKey"] = "SENTINEL_MEMORY_INITIAL"
    options["skeleton_credentials"] = {"openai": {"provider": "openai",
        "endpoint": "https://api.openai.com/v1", "api_key": "SENTINEL_ROOT_INITIAL"}}
    session_id = "credential-" + case + "-session"
    root_run_id = "credential-" + case + "-root"
    issued = requirements_for_start(_query(options, session_id),
        memory_provider=memory_config["provider"], store=store)
    assert issued["scope"]["memory_provider"] == "anthropic"
    options["skeleton_credential_scope"] = issued["scope"]
    memory_selections = []
    import memory_v2_unchain_agent_selection as memory_selection
    real_select = memory_selection.select_pupu_memory_agent_invoker

    def select(**kwargs):
        value = real_select(**kwargs)
        memory_selections.append({"provider": value.provider, "model_id": value.model_id,
            "config": deepcopy(kwargs["options"]["_memory_v2_memory_agent_config"])})
        return value

    monkeypatch.setattr(memory_selection, "select_pupu_memory_agent_invoker", select)
    # This test only needs the Memory Agent factory selected, not a memory
    # rewrite. Even an unexpected request must remain an offline failure.
    import anthropic
    def forbidden_memory_request(**kwargs):
        pytest.fail("ordinary approval resume unexpectedly invoked the memory model")
    monkeypatch.setattr(anthropic, "Anthropic", lambda **kwargs: SimpleNamespace(
        messages=SimpleNamespace(create=forbidden_memory_request)))
    events = list(adapter.stream_chat_events(message="Approve two exact operations", history=[],
        options=options, session_id=session_id, attempt_id=root_run_id))
    assert not any(event.get("type") == "final_message" for event in events)
    assert effects == [] and len(calls) == 1
    assert calls[0]["client"]["api_key"] == "SENTINEL_ROOT_INITIAL"
    assert memory_selections[0]["provider"] == "anthropic"
    assert memory_selections[0]["model_id"] == "claude-sonnet-4-6"
    return options, effects, calls, session_id, root_run_id, memory_selections


def _approve_and_discover(options, session_id):
    public = interactions.get_pending_interaction(session_id)
    receipt = interactions.record_interaction_receipt(session_id=session_id,
        interaction_id=public["interaction_id"], approved=True)
    issued = requirements_for_resume(_query(options, session_id, interaction_id=public["interaction_id"]),
        memory_provider=options["_memory_v2_memory_agent_config"]["provider"])
    assert issued["scope"]["interaction_id"] == public["interaction_id"]
    assert issued["scope"]["memory_provider"] == "anthropic"
    return public, receipt, issued


def test_credential_scope_real_resume_uses_rotated_keys_and_never_replays(production, monkeypatch):
    options, effects, calls, session_id, root_run_id, memory_selections = _waiting(
        production, monkeypatch, case="positive")
    original = load_launch(session_id, root_run_id,
        expected_owner_chat_id=options["_memory_v2_owner_chat_id"])
    original_descriptor = deepcopy(original.descriptor)
    def unreadable(*args, **kwargs):
        pytest.fail("credential discovery or resume tried to read current resources")
    monkeypatch.setattr(SkeletonResourceStore, "get_resource", unreadable)
    scopes = []
    receipts = []
    for index in range(2):
        public, receipt, issued = _approve_and_discover(options, session_id)
        scopes.append(issued["scope"])
        receipts.append(receipt["receipt_id"])
        assert issued["scope"]["source_attempt_id"] == root_run_id
        resume_options = deepcopy(options)
        resume_options["skeleton_credential_scope"] = issued["scope"]
        resume_options["skeleton_credentials"]["openai"]["api_key"] = f"SENTINEL_ROOT_ROTATED_{index}"
        resume_options["anthropicApiKey"] = f"SENTINEL_MEMORY_ROTATED_{index}"
        events = list(adapter.resume_chat_interaction_events(session_id=session_id,
            interaction_id=public["interaction_id"], options=resume_options,
            attempt_id=f"credential-resume-{index}", source_attempt_id=root_run_id))
        assert effects == [f"effect-{position}" for position in range(index + 1)]
        assert len(calls) == index + 2
        assert calls[-1]["client"]["api_key"] == f"SENTINEL_ROOT_ROTATED_{index}"
        assert calls[-1]["client"]["base_url"] == "https://api.openai.com/v1"
        assert calls[-1]["wire"]["model"] == "test-model"
    assert scopes[0]["interaction_id"] != scopes[1]["interaction_id"]
    assert scopes[0]["launch_digest"] == scopes[1]["launch_digest"]
    assert scopes[0]["selection_digest"] == scopes[1]["selection_digest"]
    assert len(set(receipts)) == 2
    roots = [event for event in events if event.get("type") == "final_message" and event.get("scope") == "root"]
    assert len(roots) == 1 and roots[0]["content"] == "Approved End"
    final = load_launch(session_id, root_run_id,
        expected_owner_chat_id=options["_memory_v2_owner_chat_id"])
    assert final.store.load().state["status"] == "completed"
    assert final.store.load().state["root_committed"] is True
    assert final.descriptor == original_descriptor
    assert "SENTINEL_" not in json.dumps(final.descriptor)
    assert interactions.get_pending_interaction(session_id)["status"] == "none"
    assert len(memory_selections) == 3
    assert all(value["config"] == options["_memory_v2_memory_agent_config"]
               and value["provider"] == "anthropic" for value in memory_selections)
    target = os.environ.get("PUPU_CREDENTIAL_RESUME_CAPTURE")
    if target:
        Path(target).write_text(json.dumps({"scopes": scopes, "receipt_ids": receipts,
            "sdk_calls": calls, "tool_effects": effects, "final_root": roots[0],
            "memory_selections": memory_selections, "launch_unchanged": True,
            "root_committed": True}, indent=2) + "\n")


@pytest.mark.parametrize("kind,code,status", [
    ("missing_field", "skeleton_credential_scope_invalid", 400),
    ("mismatch", "skeleton_credential_scope_stale", 409),
])
def test_real_waiting_resume_refuses_bad_scope_before_transfer_or_binding(
        production, monkeypatch, kind, code, status):
    options, effects, calls, session_id, root_run_id, _memory = _waiting(
        production, monkeypatch, case=kind, count=1)
    public, receipt, issued = _approve_and_discover(options, session_id)
    options["skeleton_credential_scope"] = deepcopy(issued["scope"])
    if kind == "missing_field":
        del options["skeleton_credential_scope"]["launch_digest"]
    else:
        options["skeleton_credential_scope"]["selection_digest"] = "0" * 64
    before_guard = snapshot_session_guard(session_id=session_id)
    pending = resolve_pending_skeleton_interaction(session_id)
    before_state = deepcopy(pending.launch.store.load().state)
    before_events = len(pending.launch.journal.capture_snapshot().events)
    real_transition = adapter._session_execution_guard_transition
    real_control = adapter._execution_control_call

    def forbidden(*args, **kwargs):
        pytest.fail("invalid scope reached an execution binding or capability constructor")

    def transition(operation, *args, **kwargs):
        assert operation != "prepare_parked_session_guard_transfer", "scope must precede parked transfer"
        return real_transition(operation, *args, **kwargs)

    def control(operation, *args, **kwargs):
        assert operation not in {"register", "mark_running"}, "scope must precede execution registration"
        return real_control(operation, *args, **kwargs)

    with monkeypatch.context() as fences:
        fences.setattr(production_chat, "bind_execution_attempt", forbidden)
        fences.setattr(production_chat, "SkeletonProductionBindings", forbidden)
        fences.setattr(adapter, "_session_execution_guard_transition", transition)
        fences.setattr(adapter, "_execution_control_call", control)
        with pytest.raises(interactions.DurableInteractionHostError) as rejected:
            list(adapter.resume_chat_interaction_events(session_id=session_id,
                interaction_id=public["interaction_id"], options=options,
                attempt_id="credential-refused-resume", source_attempt_id=root_run_id))
    assert (rejected.value.code, rejected.value.status_code) == (code, status)
    assert len(calls) == 1 and effects == []
    assert snapshot_session_guard(session_id=session_id) == before_guard
    assert pending.launch.store.load().state == before_state
    assert len(pending.launch.journal.capture_snapshot().events) == before_events
    after = interactions.get_pending_interaction(session_id)
    assert after["status"] == "receipt_recorded"
    assert after["receipt_id"] == receipt["receipt_id"]
