"""Seed a Default.recipe file on first launch.

Idempotent: re-runs are no-ops if Default.recipe already exists. Users can
delete Default.recipe to force a re-seed on next call ("Reset to Default").
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

_logger = logging.getLogger(__name__)

DEFAULT_RECIPE: dict = {
    "name": "Default",
    "description": "PuPu 默认 agent 配置（复刻内置行为）",
    "model": None,
    "max_iterations": None,
    "merge_with_user_selected": True,
    "agent": {
        "prompt_format": "skeleton",
        "prompt": "{{USE_BUILTIN_DEVELOPER_PROMPT}}",
    },
    "toolkits": [
        {"id": "core", "enabled_tools": None},
    ],
    "subagent_pool": [
        {"kind": "ref", "template_name": "Explore", "disabled_tools": []},
    ],
}


def ensure_recipe_seeds_written(target_dir: Path) -> None:
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
    except (FileExistsError, OSError) as exc:
        _logger.warning("[recipe_seeds] cannot create %s: %s", target_dir, exc)
        return

    default_path = target_dir / "Default.recipe"
    if default_path.exists():
        return
    try:
        default_path.write_text(
            json.dumps(DEFAULT_RECIPE, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except OSError as exc:
        _logger.warning("[recipe_seeds] write failed %s: %s", default_path, exc)
