"""The builder's read-only preview of one exactly identified skill (#352, BC-352-2).

A Skill Read node's content is read by the runtime when the run reaches it, so
the panel's preview must be the same read, not a second listing that merely
looks alike: the reference here is what a real Skill Read node returns when a
production host runs it, for the same identity and the same skill roots.
"""
import itertools
from unittest.mock import patch

import pytest

import app as pupu_app
from unchain.skeleton import prepare_workflow
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from test_skeleton_production_bindings import _execution, _host, _offline_sdk_clients  # noqa: F401
from test_skeleton_resource_store import output, workflow

SCHEMA = "pupu.skeleton_skill_preview.v1"
_RUNS = itertools.count()


def _skill(root, name, body):
    folder = root / name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "SKILL.md").write_text(f"---\nname: {name}\ndescription: preview probe {name}\n---\n{body}")
    return str(folder / "SKILL.md")


@pytest.fixture()
def home(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    with patch("pathlib.Path.home", return_value=home):
        yield home


@pytest.fixture()
def client(home):
    app = pupu_app.create_app()
    app.config["UNCHAIN_AUTH_TOKEN"] = ""
    return app.test_client()


def _run_skill_read(tmp_path, identity, include_user_dirs=True, project_body=None):
    """What a production Skill Read node reads for `identity`: the host the
    bindings build for a run in an empty workspace, with the user roots on."""
    workspace = tmp_path / f"workspace-{next(_RUNS)}"
    workspace.mkdir()
    if project_body is not None:
        (workspace / ".git").mkdir()
        _skill(workspace / ".unchain" / "skills", identity["name"], project_body)
    host, _store, _selected = _host(workspace, options={"skills": {"include_user_dirs": include_user_dirs}})
    document = workflow("preview-reference")
    document["nodes"][1]["type"] = "skill_read"
    document["nodes"][1]["config"] = {"execution": {"inputs": [], "outputs": [
        output("value", "result", ["content"]), output("name", "result", ["name"])]}, "skill": identity}
    plan = prepare_workflow(document)
    execution = _execution(workspace, plan)
    runner = DurableWorkflowRunner(execution, host.handlers_for_store(execution, plan))
    runner.create({"value": "unused"})
    result = runner.run()
    state = execution.load().state
    rows = [row for row in state["completed"] if row["node_id"] == document["nodes"][1]["id"]]
    raw = execution.read_json(rows[0]["result_ref"]) if rows else None
    return result, state, raw


def _preview(client, skill, include_user_dirs=True, **extra):
    return client.post("/skeleton_skills/preview", json={"skill": skill, "include_user_dirs": include_user_dirs, **extra})


def test_the_preview_is_the_read_a_skill_read_node_makes(client, home, tmp_path):
    path = _skill(home / ".unchain" / "skills", "notes", "Notes body\nsecond line\n")
    identity = {"source": "user-unchain", "source_id": path, "name": "notes"}
    response = _preview(client, identity)
    assert response.status_code == 200
    body = response.get_json()
    assert set(body) == {"schema", "identity", "body", "revision", "bytes"}
    result, _state, raw = _run_skill_read(tmp_path, identity)
    assert result.status == "completed"
    assert body == {"schema": SCHEMA, "identity": identity, "body": raw["content"],
                    "revision": raw["_skeleton_skill"]["revision"], "bytes": len(raw["content"].encode("utf-8"))}
    assert body["body"] == "Notes body\nsecond line"


def test_a_shadowed_or_unknown_identity_is_refused_as_the_run_would_fail(client, home, tmp_path):
    _skill(home / ".unchain" / "skills", "notes", "winner\n")
    shadowed = _skill(home / ".agents" / "skills", "notes", "shadowed\n")
    # The stored identity is gone; a remaining same-name Skill is not a fallback.
    from pathlib import Path
    Path(shadowed).unlink()
    for identity in ({"source": "user-agents", "source_id": shadowed, "name": "notes"},
                     {"source": "user-unchain", "source_id": "/nowhere/SKILL.md", "name": "nothing-here"}):
        response = _preview(client, identity)
        assert response.status_code == 404
        refused = response.get_json()["error"]
        result, state, _raw = _run_skill_read(tmp_path, identity)
        assert result.status == "failed"
        assert refused["code"] == state["error"]["code"] == "identity_mismatch"
        assert refused["path"] == ["skill"]


def test_an_available_exact_skill_is_not_replaced_by_name_priority(client, home, tmp_path):
    _skill(home / ".unchain" / "skills", "notes", "ordinary name winner")
    selected = _skill(home / ".agents" / "skills", "notes", "selected exact body")
    identity = {"source": "user-agents", "source_id": selected, "name": "notes"}
    preview = _preview(client, identity)
    assert preview.status_code == 200
    result, _state, raw = _run_skill_read(tmp_path, identity, project_body="project name winner")
    assert result.status == "completed"
    assert raw["content"] == preview.get_json()["body"] == "selected exact body"
    assert raw["_skeleton_skill"]["identity"] == identity


def test_user_skills_are_previewed_only_when_user_roots_are_on(client, home, tmp_path):
    path = _skill(home / ".unchain" / "skills", "notes", "body\n")
    identity = {"source": "user-unchain", "source_id": path, "name": "notes"}
    response = _preview(client, identity, include_user_dirs=False)
    assert response.status_code == 404
    result, state, _raw = _run_skill_read(tmp_path, identity, include_user_dirs=False)
    assert result.status == "failed" and response.get_json()["error"]["code"] == state["error"]["code"]


@pytest.mark.parametrize("payload, status, code, path", [
    ({"include_user_dirs": True}, 400, "missing_field", ["skill"]),
    ({"skill": {"source": "user-unchain", "source_id": "x"}, "include_user_dirs": True}, 400, "missing_field", ["skill", "name"]),
    ({"skill": {"source": "user-unchain", "source_id": "x", "name": "n", "revision": "r"}, "include_user_dirs": True}, 400, "unknown_field", ["skill", "revision"]),
    ({"skill": {"source": "user-unchain", "source_id": "x", "name": ""}, "include_user_dirs": True}, 400, "invalid_value", ["skill", "name"]),
    ({"skill": {"source": "user-unchain", "source_id": "x", "name": 3}, "include_user_dirs": True}, 400, "invalid_value", ["skill", "name"]),
    ({"skill": ["user-unchain"], "include_user_dirs": True}, 400, "invalid_type", ["skill"]),
    ({"skill": {"source": "user-unchain", "source_id": "x", "name": "n"}}, 400, "missing_field", ["include_user_dirs"]),
    ({"skill": {"source": "user-unchain", "source_id": "x", "name": "n"}, "include_user_dirs": "yes"}, 400, "invalid_type", ["include_user_dirs"]),
    ({"skill": {"source": "user-unchain", "source_id": "x", "name": "n"}, "include_user_dirs": True, "workspace_root": "/"}, 400, "unknown_field", ["body", "workspace_root"]),
])
def test_a_malformed_request_names_its_field(client, payload, status, code, path):
    response = client.post("/skeleton_skills/preview", json=payload)
    assert response.status_code == status
    assert response.get_json() == {"error": {"code": code, "path": path, "message": response.get_json()["error"]["message"]}}


def test_the_preview_needs_the_sidecar_token(home):
    app = pupu_app.create_app()
    app.config["UNCHAIN_AUTH_TOKEN"] = "sentinel-active-context-http-no-real-secret"
    client = app.test_client()
    request = {"skill": {"source": "user-unchain", "source_id": "x", "name": "n"}, "include_user_dirs": True}
    assert client.post("/skeleton_skills/preview", json=request).status_code == 401
    answered = client.post("/skeleton_skills/preview", json=request,
                           headers={"x-unchain-auth": "sentinel-active-context-http-no-real-secret"})
    assert answered.status_code == 404


def test_a_preview_writes_nothing(client, home):
    path = _skill(home / ".unchain" / "skills", "notes", "body\n")
    before = sorted(str(item.relative_to(home)) for item in home.rglob("*"))
    assert _preview(client, {"source": "user-unchain", "source_id": path, "name": "notes"}).status_code == 200
    assert sorted(str(item.relative_to(home)) for item in home.rglob("*")) == before
