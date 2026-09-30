"""Ticket #291 P4 (BC-005): `/skills/inventory` and the stale-revision send check."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest import mock

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

pytest.importorskip("unchain.skills")

import app as miso_app  # noqa: E402
import routes as miso_routes  # noqa: E402
import skills_inventory  # noqa: E402

PACK = {
    "toolkitId": "skillpack.demo",
    "toolkitName": "Demo",
    "source": "skillpack",
    "tools": [],
    "skills": [
        {"name": "demo", "description": "Demo skill.", "body": "Do it.", "phase": "composer", "tools": []}
    ],
}

_INVENTORY_KEYS = {"schema", "revision", "skills", "diagnostics"}
_ENTRY_KEYS = {"id", "name", "description", "source", "source_id", "aliases", "model_invocable", "user_invocable", "reserved"}


def _events():
    return iter([{"type": "final_message", "run_id": "run-skills", "iteration": 0, "content": "done"}])


def _workspace(tmp_path: Path) -> Path:
    root = tmp_path / "ws"
    (root / ".agents" / "skills" / "ws-skill").mkdir(parents=True)
    (root / ".agents" / "skills" / "ws-skill" / "SKILL.md").write_text(
        "---\nname: ws-skill\ndescription: From the workspace.\n---\nBody.\n", encoding="utf-8"
    )
    return root


def test_inventory_route_returns_closed_schema_for_workspace(tmp_path) -> None:
    workspace = _workspace(tmp_path)
    client = miso_app.create_app().test_client()
    with mock.patch.object(skills_inventory, "list_installed_skill_packs", return_value=[PACK]):
        response = client.get(
            "/skills/inventory",
            query_string={"workspace_root": str(workspace), "include_user_dirs": "false"},
        )
    assert response.status_code == 200
    payload = response.get_json()
    assert set(payload) == _INVENTORY_KEYS
    assert payload["schema"] == "pupu.skill_inventory.v1"
    assert payload["revision"].startswith("sha256:")
    assert [entry["name"] for entry in payload["skills"]] == ["demo", "ws-skill"]
    for entry in payload["skills"]:
        assert set(entry) == _ENTRY_KEYS
    by_name = {entry["name"]: entry for entry in payload["skills"]}
    assert by_name["demo"]["source"] == "skillpack" and by_name["demo"]["source_id"] == "skillpack.demo"
    assert by_name["ws-skill"]["source"] == "project-agents"


def test_inventory_route_without_workspace_lists_packs_only_and_validates_flags(tmp_path) -> None:
    client = miso_app.create_app().test_client()
    with mock.patch.object(skills_inventory, "list_installed_skill_packs", return_value=[PACK]):
        response = client.get("/skills/inventory", query_string={"include_user_dirs": "false"})
        bad = client.get("/skills/inventory", query_string={"include_user_dirs": "maybe"})
    assert response.status_code == 200
    assert [entry["name"] for entry in response.get_json()["skills"]] == ["demo"]
    assert bad.status_code == 400


def test_send_with_current_revision_passes_and_stale_revision_is_refused(tmp_path) -> None:
    workspace = _workspace(tmp_path)
    client = miso_app.create_app().test_client()
    with mock.patch.object(skills_inventory, "list_installed_skill_packs", return_value=[PACK]):
        current = client.get(
            "/skills/inventory",
            query_string={"workspace_root": str(workspace), "include_user_dirs": "false"},
        ).get_json()["revision"]

        with mock.patch.object(miso_routes, "stream_chat_events", return_value=_events()) as stream:
            ok = client.post(
                "/chat/stream/v4",
                json={
                    "message": "/ws-skill go",
                    "attempt_id": "attempt-skills-ok",
                    "options": {
                        "workspace_roots": [str(workspace)],
                        "skills": {"include_user_dirs": False},
                        "skill_inventory_revision": current,
                    },
                },
            )
            ok.get_data(as_text=True)
        assert ok.status_code == 200
        assert stream.call_args.kwargs["options"]["skill_inventory_revision"] == current
        # The user's text reaches the runtime verbatim (no expansion, no stripping).
        assert stream.call_args.kwargs["message"] == "/ws-skill go"

        with mock.patch.object(miso_routes, "stream_chat_events", return_value=_events()) as stream:
            stale = client.post(
                "/chat/stream/v4",
                json={
                    "message": "/ws-skill go",
                    "attempt_id": "attempt-skills-stale",
                    "options": {
                        "workspace_roots": [str(workspace)],
                        "skills": {"include_user_dirs": False},
                        "skill_inventory_revision": "sha256:" + "0" * 64,
                    },
                },
            )
        assert stale.status_code == 409
        body = stale.get_json()
        assert body["error"]["code"] == "skill_inventory_stale"
        assert body["error"]["current_revision"] == current
        stream.assert_not_called()

        # Programmatic sends (no revision) skip the check.
        with mock.patch.object(miso_routes, "stream_chat_events", return_value=_events()):
            plain = client.post(
                "/chat/stream/v4",
                json={"message": "hello", "attempt_id": "attempt-skills-plain", "options": {}},
            )
            plain.get_data(as_text=True)
        assert plain.status_code == 200


MCP_CATALOG = {
    "toolkits": [
        {
            "toolkitId": "mcp.reviewer",
            "toolkitName": "Reviewer",
            "source": "mcp",
            "tools": [{"name": "lint"}],
            "skills": [{"name": "review", "description": "MCP review skill.", "body": "MCP BODY", "phase": "composer", "tools": ["lint"]}],
        },
        {
            "toolkitId": "core",
            "toolkitName": "Core",
            "source": "builtin",
            "tools": [{"name": "read_file"}],
            "skills": [],
        },
    ]
}


def test_p1_menu_stale_check_and_run_share_one_effective_inventory(tmp_path) -> None:
    """Audit P1: the same identity mapping backs the menu, the 409 check and the run."""
    import unchain_adapter as adapter
    from unchain.tools import Toolkit

    workspace = tmp_path / "ws"
    workspace.mkdir()
    client = miso_app.create_app().test_client()
    with mock.patch.object(skills_inventory, "list_installed_skill_packs", return_value=[]), mock.patch.object(
        adapter, "get_toolkit_catalog_v2", return_value=MCP_CATALOG
    ):
        # Without a project skill, selecting the MCP toolkit adds its embedded
        # /review to the effective inventory -> different revision, toolkit source.
        mcp_only = client.get(
            "/skills/inventory",
            query_string={"workspace_root": str(workspace), "include_user_dirs": "false", "toolkits": "core,mcp.reviewer"},
        ).get_json()
        core_only = client.get(
            "/skills/inventory",
            query_string={"workspace_root": str(workspace), "include_user_dirs": "false", "toolkits": "core"},
        ).get_json()
        assert [(e["name"], e["source"], e["source_id"]) for e in mcp_only["skills"]] == [("review", "toolkit", "mcp.reviewer")]
        assert core_only["skills"] == []
        assert mcp_only["revision"] != core_only["revision"]

        (workspace / ".unchain" / "skills" / "review").mkdir(parents=True)
        (workspace / ".unchain" / "skills" / "review" / "SKILL.md").write_text(
            "---\nname: review\ndescription: Project review skill.\n---\nPROJECT BODY\n", encoding="utf-8"
        )
        with_mcp = client.get(
            "/skills/inventory",
            query_string={"workspace_root": str(workspace), "include_user_dirs": "false", "toolkits": "core,mcp.reviewer"},
        ).get_json()
        without_mcp = client.get(
            "/skills/inventory",
            query_string={"workspace_root": str(workspace), "include_user_dirs": "false", "toolkits": "core"},
        ).get_json()

        # One winner for /review: the project skill (rank 100) shadows the MCP one (600),
        # and the menu learns that through the diagnostics, never via a second authority.
        assert [e["name"] for e in with_mcp["skills"]] == ["review"]
        assert with_mcp["skills"][0]["source"] == "project-unchain"
        assert ("shadowed", "review", "toolkit", "mcp.reviewer") in {
            (d["kind"], d["name"], d["source"], d["source_id"]) for d in with_mcp["diagnostics"]
        }
        # With the project skill shadowing the MCP one, the *effective* mapping is
        # the same with or without the MCP toolkit, so the revision is identical —
        # the revision tracks what a token resolves to, not the raw selection.
        assert with_mcp["revision"] == without_mcp["revision"]
        assert with_mcp["revision"] != mcp_only["revision"]

        # The stale check resolves with the *same* selection: a revision fetched
        # before the project skill existed (MCP /review effective) is refused
        # now that /review resolves elsewhere; the current one passes.
        with mock.patch.object(miso_routes, "stream_chat_events", return_value=_events()) as stream:
            refused = client.post(
                "/chat/stream/v4",
                json={
                    "message": "/review this",
                    "attempt_id": "attempt-p1-stale",
                    "options": {
                        "workspace_roots": [str(workspace)],
                        "skills": {"include_user_dirs": False},
                        "toolkits": ["core", "mcp.reviewer"],
                        "skill_inventory_revision": mcp_only["revision"],
                    },
                },
            )
            assert refused.status_code == 409
            stream.assert_not_called()
        with mock.patch.object(miso_routes, "stream_chat_events", return_value=_events()):
            ok = client.post(
                "/chat/stream/v4",
                json={
                    "message": "/review this",
                    "attempt_id": "attempt-p1-ok",
                    "options": {
                        "workspace_roots": [str(workspace)],
                        "skills": {"include_user_dirs": False},
                        "toolkits": ["core", "mcp.reviewer"],
                        "skill_inventory_revision": with_mcp["revision"],
                    },
                },
            )
            ok.get_data(as_text=True)
            assert ok.status_code == 200

        # The run attaches the identical descriptor identity to the instantiated toolkit.
        instance = Toolkit()
        rows = skills_inventory.catalog_skill_rows_by_toolkit(MCP_CATALOG)
        skills_inventory.attach_embedded_skills(instance, "mcp.reviewer", rows)
        (descriptor,) = instance.skills
        assert (descriptor.source, descriptor.source_id, descriptor.name) == ("toolkit", "mcp.reviewer", "review")
        run_inventory = skills_inventory.resolve_skill_inventory(
            workspace_root=str(workspace), include_user_dirs=False, selected_toolkit_ids=["core", "mcp.reviewer"], packs=[]
        )
        assert run_inventory.revision == with_mcp["revision"]
