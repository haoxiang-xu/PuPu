"""Credential discovery/dispatch contract without app startup or a real vault.

All resources are explicit temporary Stores. Importing the production adapter
is forbidden: dispatch tests supply only the host methods they exercise.
"""
from copy import deepcopy
from types import SimpleNamespace
import sys

from flask import Flask
import pytest

from skeleton_resource_store import SkeletonResourceStore


def document(resource_id="credential-agent"):
    def out(name, kind, path):
        return {"name": name, "source": {"kind": kind, "path": path}}
    def inp(node):
        return [{"name": "message", "value": {"kind": "ref", "node_id": node,
                  "path": ["message"]}, "missing": "error"}]
    return {"schema_version": 1, "id": resource_id, "kind": "agent", "name": "Credentials",
        "nodes": [
            {"id": "start", "type": "start", "config": {"execution": {
                "outputs": [out("message", "result", ["message"])]}}},
            {"id": "kernel", "type": "agent", "config": {
                "execution": {"inputs": inp("start"), "outputs": [out("message", "result", ["message"])]},
                "kernel": {"schema_version": 1, "profile": {"id": "native-openai", "provider": "openai",
                    "model": "offline-model", "protocol": "openai-responses", "endpoint": "https://api.openai.com/v1",
                    "credential_ref": "openai", "context_window": 8192, "output_limit": 2048,
                    "capabilities": {"json_schema": True, "images": False, "files": False}},
                    "prompt": "{{#input.message#}}", "max_iterations": 3, "output_tokens": 512,
                    "history": "root", "overflow": "error", "json_schema": None}}},
            {"id": "end", "type": "end", "config": {"execution": {
                "inputs": inp("kernel"), "outputs": [out("message", "input", ["message"])]}}}],
        "edges": [{"id": str(i), "kind": "flow", "source_node_id": a, "source_port_id": "out",
                   "target_node_id": b, "target_port_id": "in"}
                  for i, (a, b) in enumerate((("start", "kernel"), ("kernel", "end")))]}


def query():
    return {"schema": "pupu.skeleton_credential_query.v1", "mode": "start", "session_id": "session",
        "owner_chat_id": "owner", "interaction_id": "", "source_attempt_id": "",
        "selection": {"schema": "pupu.skeleton_chat_selection.v1", "kind": "resource", "resource_id": "credential-agent"},
        "recipe_name": "", "memory_agent_config": None}


@pytest.fixture
def boundary(tmp_path, monkeypatch):
    import route_skeleton_resources as routes
    from route_auth import _is_authorized
    from route_blueprint import api_blueprint
    store = SkeletonResourceStore(tmp_path / "resources")
    store.save_draft(document())
    monkeypatch.setattr(routes, "SkeletonResourceStore", lambda: store)
    monkeypatch.setattr(routes, "_root", lambda: SimpleNamespace(_is_authorized=_is_authorized))
    app = Flask(__name__)
    app.config["UNCHAIN_AUTH_TOKEN"] = "offline-auth"
    app.register_blueprint(api_blueprint)
    return app.test_client(), {"x-unchain-auth": "offline-auth"}, store


def test_requirements_route_is_authenticated_and_uses_real_saved_graph(boundary):
    client, headers, _store = boundary
    url = "/skeleton_credentials/requirements"
    assert client.post(url, json=query()).status_code == 401
    reply = client.post(url, headers=headers, json=query())
    assert reply.status_code == 200, reply.get_json()
    body = reply.get_json()
    assert set(body) == {"schema", "kind", "scope", "profiles"}
    assert body["profiles"] == [{"id": "native-openai", "provider": "openai", "model": "offline-model",
        "protocol": "openai-responses", "endpoint": "https://api.openai.com/v1", "credential_ref": "openai"}]
    assert body["scope"]["memory_provider"] == "openai"


@pytest.mark.parametrize("change,code", [
    ({"extra": True}, "unknown_field"), ({"schema": "future"}, "unsupported_version"),
    ({"mode": "future"}, "unknown_variant"), ({"owner_chat_id": ""}, "invalid_value"),
    ({"memory_agent_config": {"provider": "anthropic"}}, "invalid_value"),
    # The selector's version gate precedes its remaining shape checks.
    ({"selection": {"resource_id": "credential-agent"}}, "unsupported_version"),
])
def test_requirements_route_refuses_bad_queries_with_typed_paths(boundary, change, code):
    client, headers, _store = boundary
    reply = client.post("/skeleton_credentials/requirements", headers=headers, json={**query(), **change})
    assert reply.status_code == 400, reply.get_json()
    assert reply.get_json()["error"]["code"] == code
    assert isinstance(reply.get_json()["error"]["path"], list)


def test_requirements_memory_provider_is_explicit_config_not_composer(boundary):
    client, headers, _store = boundary
    body = query()
    body["memory_agent_config"] = {"displayName": "Memory Agent", "additionalInstructions": "",
        "provider": "anthropic", "modelId": "offline-memory"}
    reply = client.post("/skeleton_credentials/requirements", headers=headers, json=body)
    assert reply.status_code == 200, reply.get_json()
    assert reply.get_json()["scope"]["memory_provider"] == "anthropic"


def test_stale_scope_is_refused_before_start_registers_any_effect(boundary, monkeypatch):
    from skeleton_chat_selection import prepare_skeleton_chat_selection
    from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies
    from skeleton_resource_store import SkeletonResourceError
    import skeleton_production_chat as chat
    client, headers, store = boundary
    reply = client.post("/skeleton_credentials/requirements", headers=headers, json=query())
    assert reply.status_code == 200, reply.get_json()
    scope = reply.get_json()["scope"]
    old = store.get_resource("credential-agent")
    newer = deepcopy(old["document"])
    newer["nodes"][1]["config"]["kernel"]["prompt"] = "Changed after discovery"
    store.save_draft(newer, expected_edit_token=old["edit_token"])
    selected = prepare_skeleton_chat_selection({"skeleton_selection": query()["selection"]}, store=store)
    workflows = freeze_skeleton_workflow_dependencies(selected, store=store)
    monkeypatch.setattr(chat, "prepare_skeleton_chat_selection", lambda _options: selected)
    monkeypatch.setattr(chat, "freeze_skeleton_workflow_dependencies", lambda _selected: workflows)
    def unexpected(*_args, **_kwargs):
        pytest.fail("stale scope reached execution registration/workspace effects")
    monkeypatch.setitem(sys.modules, "unchain_adapter", SimpleNamespace(
        _extract_workspace_roots_from_options=unexpected, _execution_control_call=unexpected))
    options = {"skeleton_selection": query()["selection"], "skeleton_credential_scope": scope,
        "_memory_v2_owner_chat_id": "owner"}
    from durable_interaction_host import DurableInteractionHostError
    with pytest.raises((DurableInteractionHostError, SkeletonResourceError)) as refused:
        list(chat.stream_skeleton_chat_events(message="offline", history=[], attachments=[], options=options,
            session_id="session", attempt_id="attempt"))
    assert refused.value.code == "skeleton_credential_scope_stale"


def test_current_start_scope_reaches_registration_without_composer_model(boundary, monkeypatch, tmp_path):
    from skeleton_chat_selection import prepare_skeleton_chat_selection
    from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies
    import skeleton_production_chat as chat
    # Start now checks for a stopped predecessor before registration. Give
    # that real read a disposable data root; no prior launch exists here.
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path / "execution-data"))
    client, headers, store = boundary
    scope = client.post("/skeleton_credentials/requirements", headers=headers, json=query()).get_json()["scope"]
    options = {"skeleton_selection": query()["selection"], "skeleton_credential_scope": scope,
        "_memory_v2_owner_chat_id": "owner"}
    selected = prepare_skeleton_chat_selection(options, store=store)
    frozen = freeze_skeleton_workflow_dependencies(selected, store=store)
    monkeypatch.setattr(chat, "prepare_skeleton_chat_selection", lambda _options: selected)
    monkeypatch.setattr(chat, "freeze_skeleton_workflow_dependencies", lambda _selected: frozen)
    class Registered(Exception):
        pass
    def registered(*args):
        assert args == ("register", "session", "attempt")
        raise Registered()
    monkeypatch.setitem(sys.modules, "unchain_adapter", SimpleNamespace(
        _extract_workspace_roots_from_options=lambda _options: [],
        _memory_v2_active_graph_candidate=lambda _options: True,
        _execution_control_call=registered))
    with pytest.raises(Registered):
        list(chat.stream_skeleton_chat_events(message="offline", history=[], attachments=[], options=options,
            session_id="session", attempt_id="attempt"))


def test_resume_scope_is_checked_before_attempt_binding_or_parked_transfer(tmp_path, monkeypatch):
    from test_skeleton_credential_requirements import _frozen, _launch
    from skeleton_credential_requirements import requirements_from_frozen
    import skeleton_production_chat as chat
    from durable_interaction_host import DurableInteractionHostError
    _store, selection, workflows = _frozen(tmp_path)
    launch = _launch(selection, workflows)
    scope = requirements_from_frozen(selection, workflows, mode="resume", session_id="session",
        owner_chat_id="owner", interaction_id="interaction", launch=launch)["scope"]
    scope["selection_digest"] = "0" * 64
    monkeypatch.setattr(chat, "resolve_pending_skeleton_interaction", lambda *_args, **_kwargs: SimpleNamespace(launch=launch))
    def unexpected(*_args, **_kwargs):
        pytest.fail("stale resume reached binding, registration or parked guard")
    monkeypatch.setattr(chat, "bind_execution_attempt", unexpected)
    monkeypatch.setitem(sys.modules, "unchain_adapter", SimpleNamespace(
        get_pending_interaction=lambda _session: {"interaction_id": "interaction", "status": "receipt_recorded"},
        _execution_control_call=unexpected, _session_execution_guard_transition=unexpected))
    with pytest.raises(DurableInteractionHostError) as refused:
        list(chat.resume_skeleton_chat_events(session_id="session", interaction_id="interaction",
            options={"_memory_v2_owner_chat_id": "owner", "skeleton_credential_scope": scope}, attempt_id="resumed"))
    assert refused.value.code == "skeleton_credential_scope_stale"
