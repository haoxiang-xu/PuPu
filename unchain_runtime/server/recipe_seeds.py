"""Seed built-in agent workflow recipes on first launch.

Idempotent: re-runs preserve user-authored recipes. The legacy built-in
Default.recipe seed is migrated to the workflow-backed Explore subagent shape.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from recipe import BUILTIN_DEVELOPER_PROMPT_SENTINEL
from subagent_seeds import EXPLORE_SKELETON, EXPLORE_SYSTEM_PROMPT

_logger = logging.getLogger(__name__)

START_OUTPUTS = [
    {"name": "text", "type": "string"},
    {"name": "images", "type": "image[]"},
    {"name": "files", "type": "file[]"},
]

READ_ONLY_CORE_TOOLS = [
    "read",
    "grep",
    "glob",
    "lsp",
    "web_fetch",
    "shell",
    "ask_user_question",
]

EXPLORE_PROMPT = (
    "{{#start.text#}}\n"
    "{{#start.images#}}\n"
    "{{#start.files#}}\n\n"
    f"{EXPLORE_SYSTEM_PROMPT}"
)

EXPLORE_RECIPE: dict = {
    "name": "Explore",
    "description": EXPLORE_SKELETON["description"],
    "model": EXPLORE_SKELETON.get("model"),
    "max_iterations": None,
    "merge_with_user_selected": False,
    "agent": {
        "prompt_format": "soul",
        "prompt": EXPLORE_PROMPT,
    },
    "toolkits": [
        {"id": "core", "enabled_tools": READ_ONLY_CORE_TOOLS},
    ],
    "subagent_pool": [],
    "nodes": [
        {
            "id": "start",
            "type": "start",
            "kind": "workflow",
            "deletable": False,
            "outputs": START_OUTPUTS,
            "x": 80,
            "y": 260,
        },
        {
            "id": "agent_main",
            "type": "agent",
            "kind": "workflow",
            "deletable": True,
            "override": {
                "model": "",
                "prompt_format": "soul",
                "prompt": EXPLORE_PROMPT,
            },
            "outputs": [{"name": "output", "type": "string"}],
            "x": 380,
            "y": 260,
        },
        {
            "id": "end",
            "type": "end",
            "kind": "workflow",
            "deletable": False,
            "outputs_schema": [{"name": "output", "type": "string"}],
            "x": 720,
            "y": 260,
        },
        {
            "id": "tp_1",
            "type": "toolkit_pool",
            "kind": "plugin",
            "deletable": True,
            "toolkits": [
                {
                    "id": "core",
                    "config": {},
                    "enabled_tools": READ_ONLY_CORE_TOOLS,
                }
            ],
            "merge_with_user_selected": False,
            "x": 380,
            "y": 80,
        },
    ],
    "edges": [
        {
            "id": "e_start_agent",
            "source_node_id": "start",
            "source_port_id": "out",
            "target_node_id": "agent_main",
            "target_port_id": "in",
            "kind": "flow",
        },
        {
            "id": "e_agent_end",
            "source_node_id": "agent_main",
            "source_port_id": "out",
            "target_node_id": "end",
            "target_port_id": "in",
            "kind": "flow",
        },
        {
            "id": "e_agent_tp",
            "source_node_id": "agent_main",
            "source_port_id": "attach_top",
            "target_node_id": "tp_1",
            "target_port_id": "attach_bot",
            "kind": "attach",
        },
    ],
}

DEFAULT_RECIPE: dict = {
    "name": "Default",
    "description": "PuPu 默认 agent 配置（复刻内置行为）",
    "model": None,
    "max_iterations": None,
    "merge_with_user_selected": True,
    "agent": {
        "prompt_format": "skeleton",
        "prompt": BUILTIN_DEVELOPER_PROMPT_SENTINEL,
    },
    "toolkits": [
        {"id": "core", "enabled_tools": None},
    ],
    "subagent_pool": [
        {"kind": "recipe_ref", "recipe_name": "Explore", "disabled_tools": []},
    ],
    "nodes": [
        {
            "id": "start",
            "type": "start",
            "kind": "workflow",
            "deletable": False,
            "outputs": START_OUTPUTS,
            "x": 80,
            "y": 260,
        },
        {
            "id": "agent_main",
            "type": "agent",
            "kind": "workflow",
            "deletable": True,
            "override": {
                "model": "",
                "prompt_format": "skeleton",
                "prompt": BUILTIN_DEVELOPER_PROMPT_SENTINEL,
            },
            "outputs": [{"name": "output", "type": "string"}],
            "x": 380,
            "y": 260,
        },
        {
            "id": "end",
            "type": "end",
            "kind": "workflow",
            "deletable": False,
            "outputs_schema": [{"name": "output", "type": "string"}],
            "x": 720,
            "y": 260,
        },
        {
            "id": "tp_1",
            "type": "toolkit_pool",
            "kind": "plugin",
            "deletable": True,
            "toolkits": [{"id": "core", "config": {}}],
            "merge_with_user_selected": True,
            "x": 380,
            "y": 80,
        },
        {
            "id": "sp_1",
            "type": "subagent_pool",
            "kind": "plugin",
            "deletable": True,
            "subagents": [
                {"kind": "recipe_ref", "recipe_name": "Explore", "disabled_tools": []}
            ],
            "x": 380,
            "y": 440,
        },
    ],
    "edges": [
        {
            "id": "e_start_agent",
            "source_node_id": "start",
            "source_port_id": "out",
            "target_node_id": "agent_main",
            "target_port_id": "in",
            "kind": "flow",
        },
        {
            "id": "e_agent_end",
            "source_node_id": "agent_main",
            "source_port_id": "out",
            "target_node_id": "end",
            "target_port_id": "in",
            "kind": "flow",
        },
        {
            "id": "e_agent_tp",
            "source_node_id": "agent_main",
            "source_port_id": "attach_top",
            "target_node_id": "tp_1",
            "target_port_id": "attach_bot",
            "kind": "attach",
        },
        {
            "id": "e_agent_sp",
            "source_node_id": "agent_main",
            "source_port_id": "attach_bot",
            "target_node_id": "sp_1",
            "target_port_id": "attach_top",
            "kind": "attach",
        },
    ],
}


def _write_recipe(path: Path, payload: dict) -> None:
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _is_legacy_default_seed(data: object) -> bool:
    if not isinstance(data, dict) or data.get("name") != "Default":
        return False
    if "nodes" in data:
        return False
    agent = data.get("agent")
    if not isinstance(agent, dict):
        return False
    if agent.get("prompt") != BUILTIN_DEVELOPER_PROMPT_SENTINEL:
        return False
    pool = data.get("subagent_pool")
    return pool == [{"kind": "ref", "template_name": "Explore", "disabled_tools": []}]


def ensure_recipe_seeds_written(target_dir: Path) -> None:
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
    except (FileExistsError, OSError) as exc:
        _logger.warning("[recipe_seeds] cannot create %s: %s", target_dir, exc)
        return

    explore_path = target_dir / "Explore.recipe"
    if not explore_path.exists():
        try:
            _write_recipe(explore_path, EXPLORE_RECIPE)
        except OSError as exc:
            _logger.warning("[recipe_seeds] write failed %s: %s", explore_path, exc)

    default_path = target_dir / "Default.recipe"
    if default_path.exists():
        try:
            existing = json.loads(default_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return
        if not _is_legacy_default_seed(existing):
            return
    try:
        _write_recipe(default_path, DEFAULT_RECIPE)
    except OSError as exc:
        _logger.warning("[recipe_seeds] write failed %s: %s", default_path, exc)
