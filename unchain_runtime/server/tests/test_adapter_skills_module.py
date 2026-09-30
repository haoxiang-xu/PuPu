"""Ticket #291 P3: SkillsModule mounting and the backend-authoritative inventory
against the pinned Unchain wheel (never a sibling source checkout)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest import mock

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import unchain_adapter as adapter  # noqa: E402
import skills_inventory  # noqa: E402
from skills_inventory import (  # noqa: E402
    INVENTORY_SCHEMA,
    RESERVED_COMMANDS,
    build_skills_config,
    inventory_payload,
    pack_skill_descriptors,
    resolve_skill_inventory,
    skills_options,
)

unchain_agent = pytest.importorskip("unchain.agent")
from unchain.agent import SkillsModule  # noqa: E402
from unchain.tools import SkillDescriptor, Toolkit  # noqa: E402


class _Module:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _Agent:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.provider = kwargs["provider"]
        self.model = kwargs["model"]


PACK = {
    "toolkitId": "skillpack.superpowers",
    "toolkitName": "Superpowers",
    "source": "skillpack",
    "tools": [],
    "skills": [
        {
            "name": "brainstorming",
            "title": "Brainstorming",
            "description": "Explore intent before building.",
            "body": "# Brainstorming\nAsk questions first.",
            "phase": "composer",
            "tools": [],
        },
        {
            "name": "quiet-review",
            "description": "User-only review checklist.",
            "body": "Review silently.",
            "disable-model-invocation": True,
        },
    ],
}


def _build(options: dict, *, toolkits=None):
    return adapter._build_developer_agent(
        UnchainAgent=_Agent,
        ToolsModule=_Module,
        MemoryModule=_Module,
        PoliciesModule=_Module,
        provider="openai",
        model="gpt-5",
        api_key="",
        max_iterations=4,
        toolkits=list(toolkits or []),
        memory_manager=None,
        options=options,
        enable_subagents=False,
    )


def _modules_of(agent):
    return list(agent.kwargs["modules"])


def test_pack_rows_become_skills_only_descriptors_with_source_identity():
    descriptors = pack_skill_descriptors([PACK, {"toolkitId": "mcp.notion", "skills": []}])
    assert [d.name for d in descriptors] == ["brainstorming", "quiet-review"]
    first, quiet = descriptors
    assert first.source == "skillpack" and first.source_id == "skillpack.superpowers"
    assert first.base_dir is None and first.tools == ()
    assert first.model_invocable is True and first.user_invocable is True
    assert quiet.model_invocable is False and quiet.user_invocable is True


def test_developer_chat_mounts_skills_module_after_tools_module(tmp_path):
    workspace = tmp_path / "ws"
    (workspace / ".agents" / "skills" / "ws-skill").mkdir(parents=True)
    (workspace / ".agents" / "skills" / "ws-skill" / "SKILL.md").write_text(
        "---\nname: ws-skill\ndescription: From the workspace.\n---\nBody.\n", encoding="utf-8"
    )
    selected = Toolkit(skills=(SkillDescriptor("embedded", "From a selected toolkit.", "b", source_id="mcp.x"),))
    with mock.patch.object(skills_inventory, "list_installed_skill_packs", return_value=[PACK]):
        agent = _build(
            {"workspace_roots": [str(workspace)], "skills": {"include_user_dirs": False}},
            toolkits=[selected],
        )

    modules = _modules_of(agent)
    tools_module = modules[0]
    assert isinstance(tools_module, _Module)
    # ToolsModule carries only the selected executable toolkits (no synthetic
    # skills-only toolkit); pack skills travel via SkillsConfig.extra_skills.
    assert tools_module.kwargs["tools"] == (selected,)

    (skills_module,) = [m for m in modules if isinstance(m, SkillsModule)]
    # Mounted after PoliciesModule so existing module-index expectations hold.
    assert isinstance(modules[1], _Module)  # policies / vault / memory come first
    config = skills_module.config
    assert config.project_root == workspace
    assert config.include_project_dirs is True
    assert config.include_user_dirs is False
    assert config.reserved_commands == RESERVED_COMMANDS
    assert sorted(s.name for s in config.extra_skills) == ["brainstorming", "quiet-review"]
    assert {s.source for s in config.extra_skills} == {"skillpack"}


def test_recipe_subagent_runs_do_not_mount_skills(tmp_path):
    with mock.patch.object(skills_inventory, "list_installed_skill_packs", return_value=[PACK]):
        agent = _build({"_recipe_subagent_run": True, "workspace_roots": [str(tmp_path)]})
    assert not any(isinstance(module, SkillsModule) for module in _modules_of(agent))


def test_no_workspace_skips_project_dirs_and_never_scans_sidecar_cwd(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".agents" / "skills" / "cwd-skill").mkdir(parents=True)
    (tmp_path / ".agents" / "skills" / "cwd-skill" / "SKILL.md").write_text(
        "---\nname: cwd-skill\ndescription: must not appear.\n---\nBody.\n", encoding="utf-8"
    )
    config = build_skills_config(workspace_root=None, include_user_dirs=False)
    assert config.include_project_dirs is False
    inventory = resolve_skill_inventory(workspace_root=None, include_user_dirs=False, packs=[PACK])
    assert [s.name for s in inventory.skills] == ["brainstorming", "quiet-review"]


def test_inventory_payload_is_closed_sorted_and_marks_policy_and_reserved(tmp_path):
    workspace = tmp_path / "ws"
    (workspace / ".unchain" / "skills" / "btw").mkdir(parents=True)
    (workspace / ".unchain" / "skills" / "btw" / "SKILL.md").write_text(
        "---\nname: btw\ndescription: collides with a builtin command.\n---\nBody.\n", encoding="utf-8"
    )
    (workspace / ".unchain" / "skills" / "brainstorming").mkdir(parents=True)
    (workspace / ".unchain" / "skills" / "brainstorming" / "SKILL.md").write_text(
        "---\nname: brainstorming\ndescription: workspace override.\n---\nBody.\n", encoding="utf-8"
    )
    inventory = resolve_skill_inventory(
        workspace_root=str(workspace), include_user_dirs=False, packs=[PACK]
    )
    payload = inventory_payload(inventory)

    assert payload["schema"] == INVENTORY_SCHEMA
    assert payload["revision"] == inventory.revision and payload["revision"].startswith("sha256:")
    assert [entry["name"] for entry in payload["skills"]] == ["brainstorming", "btw", "quiet-review"]
    by_name = {entry["name"]: entry for entry in payload["skills"]}
    assert set(by_name["brainstorming"]) == {
        "id", "name", "description", "source", "source_id", "aliases",
        "model_invocable", "user_invocable", "reserved",
    }
    # Workspace (rank 100) shadows the pack (rank 600).
    assert by_name["brainstorming"]["source"] == "project-unchain"
    assert by_name["btw"]["reserved"] is True
    assert by_name["quiet-review"]["model_invocable"] is False
    kinds = {(d["kind"], d["name"]) for d in payload["diagnostics"]}
    assert ("shadowed", "brainstorming") in kinds and ("reserved", "btw") in kinds

    again = resolve_skill_inventory(workspace_root=str(workspace), include_user_dirs=False, packs=[PACK])
    assert again.revision == inventory.revision


def test_skills_options_defaults_and_parsing():
    assert skills_options(None) == (True, None)
    assert skills_options({"skills": {"include_user_dirs": False}, "skill_inventory_revision": " sha256:ab "}) == (
        False,
        "sha256:ab",
    )
    assert skills_options({"skills": {"include_user_dirs": "no"}, "skill_inventory_revision": 3}) == (True, None)
