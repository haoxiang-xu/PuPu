"""Real page Save documents through Store and public execution, offline SDK.

The fixture documents are unedited page captures. Setup changes only the
resource id/name and the temporary Skill's exact identity, never its graph.
"""
from copy import deepcopy
import json
from pathlib import Path
import socket
from types import SimpleNamespace

import pytest

import durable_interaction_host as interactions
import unchain_adapter as adapter
from skeleton_production_state import load_launch
from skeleton_resource_store import SkeletonResourceStore
from test_skeleton_production_chat import Stream

DOCUMENTS = json.loads((Path(__file__).resolve().parents[3] /
                       "e2e/fixtures/skeleton_step_execution_documents.json").read_text())
SENTINEL = "qa-352-offline-no-real-credential"


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    for key, value in {"UNCHAIN_DATA_DIR": str(tmp_path / "data"),
                       "PUPU_CONTEXT_V2_STORE_OWNER": "unchain", "PUPU_FEATURE_MEMORY_V2": "all",
                       "PUPU_MEMORY_V2_MODE": "all", "PUPU_MEMORY_V2_CANARY_PERCENT": "100"}.items():
        monkeypatch.setenv(key, value)
    def deny(*_args, **_kwargs):
        pytest.fail("No network in the deterministic-step acceptance path")
    monkeypatch.setattr(socket.socket, "connect", deny)
    monkeypatch.setattr(socket, "create_connection", deny)
    calls = []
    import openai
    def client_factory(**kwargs):
        assert kwargs["api_key"] == SENTINEL
        assert kwargs["base_url"] == "https://api.openai.com/v1" and kwargs["max_retries"] == 0
        def create(**wire):
            assert set(wire) in ({"input", "model", "stream", "max_output_tokens"},
                                 {"input", "model", "stream", "tools", "max_output_tokens"})
            assert wire["stream"] is True and wire["model"] == "gpt-6-luna"
            calls.append(deepcopy(wire))
            return Stream("Deterministic End reply")
        return SimpleNamespace(responses=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, "OpenAI", client_factory)
    return SkeletonResourceStore(), calls


def _save(setup, tmp_path, kind):
    store, calls = setup
    document = deepcopy(DOCUMENTS[kind])
    document["id"] = kind
    document["name"] = "Page-produced " + kind
    if kind.startswith("skill"):
        identity = {"source": "user-unchain", "source_id": str(tmp_path / ".unchain/skills/notes/SKILL.md"), "name": "notes"}
        document["nodes"][next(i for i, n in enumerate(document["nodes"]) if n["id"] == "skill")]["config"]["skill"] = identity
    saved = store.save_draft(document)
    assert saved["document"] == store.get_resource(document["id"])["document"] == document
    assert saved["diagnostics"] == []
    store.preflight(document["id"])
    options = {"skeleton_selection": {"schema": "pupu.skeleton_chat_selection.v1", "kind": "resource", "resource_id": document["id"]},
               "_memory_v2_requested": True, "_memory_v2_owner_chat_id": "qa-352-owner",
               "durable_interactions_required": True, "workspace_root": str(tmp_path), "toolkits": ["CoreToolkit"],
               "skeleton_credentials": {"openai": {"provider": "openai", "endpoint": "https://api.openai.com/v1", "api_key": SENTINEL}}}
    return document, options, calls


def _start(options, message, session="page-session", attempt="page-root"):
    return list(adapter.stream_chat_events(message=message, history=[], options=options, session_id=session, attempt_id=attempt))


def _state(session="page-session", attempt="page-root"):
    return load_launch(session, attempt, expected_owner_chat_id="qa-352-owner").store


def _notes(tmp_path, body):
    file = tmp_path / ".unchain/skills/notes/SKILL.md"
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text("---\nname: notes\ndescription: Selected acceptance notes\n---\n" + body)
    return file


@pytest.mark.parametrize("on_error", ["stop", "continue"])
def test_required_argument_refusal_never_enters_the_tool_body(tmp_path, on_error):
    from unchain.skeleton import prepare_workflow, SkeletonToolRuntime
    from unchain.skeleton.durable_execution import DurableWorkflowRunner
    from unchain.tools import Toolkit
    from test_skeleton_production_bindings import _execution
    from test_skeleton_resource_store import workflow, output
    document = workflow("missing-required")
    document["nodes"][1].update(type="tool_call", config={
        "tool": {"name": "required_probe", "on_error": on_error, "approval_timeout_ms": 1000},
        "execution": {"inputs": [], "outputs": [output("value", "result", [])]}})
    effects = []
    toolkit = Toolkit()
    @toolkit.tool(name="required_probe", requires_confirmation=False)
    def required_probe(required: str):
        effects.append(required)
        return required
    plan = prepare_workflow(document)
    store = _execution(tmp_path, plan)
    runner = DurableWorkflowRunner(store, {"tool_call": SkeletonToolRuntime(plan, toolkit, "required-session", lambda: 1000)})
    runner.create({"value": "unused"})
    result = runner.run()
    assert effects == []
    assert result.status == ("failed" if on_error == "stop" else "completed")
    if on_error == "continue":
        value = result.outputs["value"]
        assert value["ok"] is False and value["error"] == {"code": "tool_error"}
        assert value["result"] is not None


@pytest.mark.parametrize("on_error", ["stop", "continue"])
def test_error_looking_text_is_not_an_explicit_failure(tmp_path, on_error):
    from unchain.skeleton import prepare_workflow, SkeletonToolRuntime
    from unchain.skeleton.durable_execution import DurableWorkflowRunner
    from unchain.tools import Toolkit
    from test_skeleton_production_bindings import _execution
    from test_skeleton_resource_store import workflow, output
    document = workflow("plain-error-text")
    document["nodes"][1].update(type="tool_call", config={
        "tool": {"name": "text_probe", "on_error": on_error, "approval_timeout_ms": 1000},
        "execution": {"inputs": [], "outputs": [output("value", "result", [])]}})
    toolkit = Toolkit()
    @toolkit.tool(name="text_probe", requires_confirmation=False)
    def text_probe():
        return "error: this is ordinary tool text, not a failure signal"
    plan = prepare_workflow(document)
    store = _execution(tmp_path, plan)
    runner = DurableWorkflowRunner(store, {"tool_call": SkeletonToolRuntime(plan, toolkit, "text-session", lambda: 1000)})
    runner.create({"value": "unused"})
    result = runner.run()
    assert result.status == "completed"
    # The existing tool executor wraps non-object return values in {result}.
    assert result.outputs["value"] == {"result": {"result": text_probe()}, "ok": True, "error": None}


@pytest.mark.parametrize("exists", [True, False])
def test_page_tool_result_and_continue_branch_use_the_real_core_read(setup, tmp_path, exists):
    document, options, calls = _save(setup, tmp_path, "tool-read-page")
    file = tmp_path / "input.txt"
    if exists:
        file.write_text("REAL-CORE-READ-CONTENT")
    events = _start(options, str(file))
    finals = [e["content"] for e in events if e.get("type") == "final_message" and e.get("scope") == "root"]
    assert finals == (["Deterministic End reply"] if exists else [str(file)])
    assert len(calls) == int(exists)
    store = _state()
    state = store.load().state
    assert state["status"] == "completed" and state["root_committed"] is True
    step = next(row for row in state["completed"] if row["node_id"] == "tool")
    raw = store.read_json(step["result_ref"])
    assert raw["ok"] is exists
    if exists:
        assert raw["error"] is None
        assert "REAL-CORE-READ-CONTENT" in json.dumps(calls[0]["input"])
    else:
        assert set(raw["error"]) == {"code"} and isinstance(raw["error"]["code"], str)
        assert raw["result"] is not None  # Continue preserves the actual failed result.
    branch = next(row for row in state["completed"] if row["node_id"] == "if")
    outlet = next(edge for edge in document["edges"] if edge["id"] == branch["edge_id"])
    assert outlet["source_port_id"] == ("true" if exists else "false")


def test_page_write_waits_for_existing_approval_then_executes_once(setup, tmp_path, monkeypatch):
    from functools import wraps
    from unchain.toolkits.builtin.core.core import CoreToolkit
    real_write = CoreToolkit.write
    effects = []
    @wraps(real_write)
    def counted_write(self, *args, **kwargs):
        effects.append(deepcopy(kwargs))
        return real_write(self, *args, **kwargs)
    monkeypatch.setattr(CoreToolkit, "write", counted_write)
    _document, options, calls = _save(setup, tmp_path, "tool-write-page")
    file = tmp_path / "approved.txt"
    assert not any(e.get("scope") == "root" and e.get("type") == "final_message" for e in _start(options, str(file)))
    pending = interactions.get_pending_interaction("page-session")
    assert pending["status"] == "awaiting_response" and calls == [] and effects == [] and not file.exists()
    interaction_id = pending["interaction_id"]
    interactions.record_interaction_receipt(session_id="page-session", interaction_id=interaction_id, approved=True)
    list(adapter.resume_chat_interaction_events(session_id="page-session", interaction_id=interaction_id,
         source_attempt_id="page-root", attempt_id="page-resume", options=options))
    assert file.read_text() == "written by the builder"
    assert effects == [{"path": str(file), "content": "written by the builder"}]
    assert _state().load().state["status"] == "completed" and len(calls) == 1


def test_page_skill_preview_is_not_executed_and_same_name_project_cannot_replace_it(setup, tmp_path):
    file = _notes(tmp_path, "PREVIEW-ONLY")
    _document, options, calls = _save(setup, tmp_path, "skill-read-page")
    from skeleton_step_catalogs import skill_preview
    identity = next(n for n in _document["nodes"] if n["id"] == "skill")["config"]["skill"]
    assert skill_preview({"skill": identity, "include_user_dirs": True})["body"] == "PREVIEW-ONLY"
    file.write_text(file.read_text().replace("PREVIEW-ONLY", "EXECUTED-CONTENT"))
    (tmp_path / ".git").mkdir()
    project = tmp_path / ".agents/skills/notes/SKILL.md"
    project.parent.mkdir(parents=True)
    project.write_text("---\nname: notes\ndescription: Project notes\n---\nPROJECT-ONLY")
    _start(options, "read the selected skill")
    assert _state().load().state["status"] == "completed" and len(calls) == 1
    wire = json.dumps(calls[0]["input"])
    assert "EXECUTED-CONTENT" in wire
    assert "PREVIEW-ONLY" not in wire and "PROJECT-ONLY" not in wire


def test_page_skill_snapshot_survives_wait_and_new_run_rereads(setup, tmp_path):
    file = _notes(tmp_path, "SNAPSHOT-V1")
    _document, options, calls = _save(setup, tmp_path, "skill-wait-page")
    target = tmp_path / "after-skill.txt"
    _start(options, str(target))
    pending = interactions.get_pending_interaction("page-session")
    assert pending["status"] == "awaiting_response" and calls == [] and not target.exists()
    first = _state().load().state
    skill = next(row for row in first["completed"] if row["node_id"] == "skill")
    assert _state().read_json(skill["result_ref"])["content"] == "SNAPSHOT-V1"
    file.write_text(file.read_text().replace("SNAPSHOT-V1", "SNAPSHOT-V2"))
    interactions.record_interaction_receipt(session_id="page-session", interaction_id=pending["interaction_id"], approved=True)
    list(adapter.resume_chat_interaction_events(session_id="page-session", interaction_id=pending["interaction_id"],
         source_attempt_id="page-root", attempt_id="page-resume", options=options))
    assert len(calls) == 1 and "SNAPSHOT-V1" in json.dumps(calls[0]["input"])
    assert "SNAPSHOT-V2" not in json.dumps(calls[0]["input"])
    # A chat admission is sticky to its first session. This independent run
    # uses a new chat owner as well as a new session, not a mismatched binding.
    second_options = deepcopy(options)
    second_options["_memory_v2_owner_chat_id"] = "qa-352-owner-second"
    _start(second_options, str(tmp_path / "second.txt"), session="second-session", attempt="second-root")
    pending = interactions.get_pending_interaction("second-session")
    interactions.record_interaction_receipt(session_id="second-session", interaction_id=pending["interaction_id"], approved=True)
    list(adapter.resume_chat_interaction_events(session_id="second-session", interaction_id=pending["interaction_id"],
         source_attempt_id="second-root", attempt_id="second-resume", options=second_options))
    assert len(calls) == 2 and "SNAPSHOT-V2" in json.dumps(calls[1]["input"])
    assert "SNAPSHOT-V1" not in json.dumps(calls[1]["input"])
