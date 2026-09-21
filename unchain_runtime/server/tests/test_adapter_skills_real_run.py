"""Ticket #291 CP2: real Unchain agent runs through PuPu's developer-agent
assembly against the pinned wheel (SEQ-001 cells 1–3 at the host boundary).

The model is faked at the ModelIO seam only; everything else — PuPu's
`_build_developer_agent`, Unchain's SkillsModule, catalog/activation harnesses,
the `skill` tool, kernel loop and transcript — is the real code path.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest import mock

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

pytest.importorskip("unchain.skills")

import skills_inventory  # noqa: E402
import unchain_adapter as adapter  # noqa: E402
from unchain.agent import MemoryModule, PoliciesModule, ToolsModule  # noqa: E402
from unchain.agent import Agent as UnchainAgent  # noqa: E402
from unchain.kernel.types import ModelTurnResult, ToolCall  # noqa: E402
from unchain.skills.rendering import (  # noqa: E402
    is_active_skills_message,
    is_skill_catalog_message,
    parse_active_skills_block,
)

PACK = {
    "toolkitId": "skillpack.demo",
    "toolkitName": "Demo",
    "source": "skillpack",
    "tools": [],
    "skills": [
        {
            "name": "Plan_First",
            "description": "Draft a plan before acting.",
            "body": "Draft a numbered plan and wait for confirmation.",
            "phase": "composer",
            "tools": [],
        }
    ],
}


class _ScriptedModelIO:
    provider = "openai"

    def __init__(self, model: str, results: list[ModelTurnResult]) -> None:
        self.model = model
        self._results = list(results)
        self.requests: list = []

    def fetch_turn(self, request):
        self.requests.append(request)
        return self._results.pop(0)


def _final(text: str) -> ModelTurnResult:
    return ModelTurnResult(
        assistant_messages=[{"role": "assistant", "content": text}],
        tool_calls=[],
        final_text=text,
        response_id=f"resp-{len(text)}",
    )


def _skill_call(name: str) -> ModelTurnResult:
    arguments = {"name": name}
    return ModelTurnResult(
        assistant_messages=[
            {"type": "function_call", "call_id": "call_skill_1", "name": "skill", "arguments": json.dumps(arguments)}
        ],
        tool_calls=[ToolCall(call_id="call_skill_1", name="skill", arguments=arguments)],
        final_text="",
        response_id="resp-tool",
    )


def _build_real_agent(workspace: Path, model_io: _ScriptedModelIO):
    with mock.patch.object(skills_inventory, "list_installed_skill_packs", return_value=[PACK]):
        return adapter._build_developer_agent(
            UnchainAgent=UnchainAgent,
            ToolsModule=ToolsModule,
            MemoryModule=MemoryModule,
            PoliciesModule=PoliciesModule,
            provider="openai",
            model="gpt-test",
            api_key="",
            max_iterations=6,
            toolkits=[],
            memory_manager=None,
            options={"workspace_roots": [str(workspace)], "skills": {"include_user_dirs": False}},
            enable_subagents=False,
            model_io_factory=lambda *args, **kwargs: model_io,
        )


def _kinds(messages):
    return (
        [m for m in messages if is_skill_catalog_message(m)],
        [m for m in messages if is_active_skills_message(m)],
    )


def test_explicit_legacy_alias_invocation_then_plain_follow_up(tmp_path):
    workspace = tmp_path / "ws"
    (workspace / ".agents" / "skills" / "ws-review").mkdir(parents=True)
    (workspace / ".agents" / "skills" / "ws-review" / "SKILL.md").write_text(
        "---\nname: ws-review\ndescription: Review the workspace.\n---\nCheck every file twice.\n",
        encoding="utf-8",
    )
    model_io = _ScriptedModelIO("gpt-test", [_final("planned"), _final("continued")])
    agent = _build_real_agent(workspace, model_io)

    user_text = "  /Plan_First then /ws-review the repo  "
    first = agent.run(user_text)
    assert first.status == "completed"

    request = model_io.requests[0].messages
    catalog, active = _kinds(request)
    assert len(catalog) == 1 and len(active) == 1
    # Catalog lists the canonical pack name and the workspace skill.
    assert "- `plan-first`: Draft a plan before acting." in catalog[0]["content"]
    assert "- `ws-review`: Review the workspace." in catalog[0]["content"]
    entries = parse_active_skills_block(active[0]["content"])
    assert [(e.identity.name, e.identity.source) for e in entries] == [
        ("plan-first", "skillpack"),
        ("ws-review", "project-agents"),
    ]
    assert entries[0].identity.source_id == "skillpack.demo"
    assert entries[0].body == "Draft a numbered plan and wait for confirmation."
    assert all(e.activation.startswith("user:") for e in entries)
    # The user's own message reaches the provider verbatim (SEQ-001 cell 1).
    user_messages = [m for m in request if m.get("role") == "user"]
    assert user_messages[-1]["content"] == user_text

    # Cell 3: a later plain message keeps the active bodies, activates nothing new.
    second = agent.run([*first.messages, {"role": "user", "content": "now continue"}])
    assert second.status == "completed"
    request2 = model_io.requests[1].messages
    catalog2, active2 = _kinds(request2)
    assert len(catalog2) == 1 and len(active2) == 1
    assert parse_active_skills_block(active2[0]["content"]) == entries
    assert request2[-1] == {"role": "user", "content": "now continue"}
    assert json.dumps(request2, ensure_ascii=False).count("Draft a numbered plan and wait for confirmation.") == 1


def test_model_triggered_activation_projects_once_with_call_id(tmp_path):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    model_io = _ScriptedModelIO("gpt-test", [_skill_call("plan-first"), _final("done")])
    agent = _build_real_agent(workspace, model_io)

    result = agent.run("please plan this")
    assert result.status == "completed"
    assert len(model_io.requests) == 2

    first_catalog, first_active = _kinds(model_io.requests[0].messages)
    assert len(first_catalog) == 1 and first_active == []
    tool_names = {tool.name for tool in model_io.requests[0].toolkit.tools.values()}
    assert "skill" in tool_names

    second = model_io.requests[1].messages
    catalog, active = _kinds(second)
    assert len(catalog) == 1 and len(active) == 1
    (entry,) = parse_active_skills_block(active[0]["content"])
    assert entry.identity.name == "plan-first" and entry.activation == "tool:call_skill_1"
    serialized = json.dumps(second, ensure_ascii=False)
    assert serialized.count("Draft a numbered plan and wait for confirmation.") == 1
    assert "<skill_loaded" in serialized and 'status=' in serialized


def test_recipe_subagent_run_has_no_skills_surface(tmp_path):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    model_io = _ScriptedModelIO("gpt-test", [_final("done")])
    with mock.patch.object(skills_inventory, "list_installed_skill_packs", return_value=[PACK]):
        agent = adapter._build_developer_agent(
            UnchainAgent=UnchainAgent,
            ToolsModule=ToolsModule,
            MemoryModule=MemoryModule,
            PoliciesModule=PoliciesModule,
            provider="openai",
            model="gpt-test",
            api_key="",
            max_iterations=3,
            toolkits=[],
            memory_manager=None,
            options={"workspace_roots": [str(workspace)], "_recipe_subagent_run": True},
            enable_subagents=False,
            model_io_factory=lambda *args, **kwargs: model_io,
        )
    result = agent.run("/plan-first go")
    assert result.status == "completed"
    catalog, active = _kinds(model_io.requests[0].messages)
    assert catalog == [] and active == []
