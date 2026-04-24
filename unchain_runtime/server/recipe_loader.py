"""Loader for Agent Recipes under ~/.pupu/agent_recipes/.

Recipes live in files named <Name>.recipe with JSON content. Invalid files are
skipped with a warning — never raised — to keep the agent creation path robust.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from recipe import Recipe, RecipeValidationError, is_valid_recipe_name, parse_recipe_json

_logger = logging.getLogger(__name__)
_RECIPE_SUFFIX = ".recipe"


def recipes_dir() -> Path:
    return Path.home() / ".pupu" / "agent_recipes"


def _read_recipe_file(path: Path) -> Recipe | None:
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        return parse_recipe_json(data)
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, RecipeValidationError) as exc:
        _logger.warning("[recipe_loader] %s: parse failed — %s", path, exc)
        return None
    except OSError as exc:
        _logger.warning("[recipe_loader] %s: read failed — %s", path, exc)
        return None


def list_recipes() -> list[dict[str, Any]]:
    root = recipes_dir()
    if not root.is_dir():
        return []
    result: list[dict[str, Any]] = []
    for entry in sorted(root.iterdir()):
        if not entry.is_file() or entry.suffix != _RECIPE_SUFFIX:
            continue
        recipe = _read_recipe_file(entry)
        if recipe is None:
            continue
        result.append({
            "name": recipe.name,
            "description": recipe.description,
            "model": recipe.model,
            "toolkit_ids": [tk.id for tk in recipe.toolkits],
            "subagent_count": len(recipe.subagent_pool),
        })
    return result


def load_recipe(name: str) -> Recipe | None:
    if not is_valid_recipe_name(name):
        return None
    path = recipes_dir() / f"{name}{_RECIPE_SUFFIX}"
    return _read_recipe_file(path)


def save_recipe(data: dict) -> None:
    """Validate and write a recipe dict to ~/.pupu/agent_recipes/<Name>.recipe.

    Raises ValueError (via RecipeValidationError) on invalid data.
    """
    recipe = parse_recipe_json(data)
    root = recipes_dir()
    root.mkdir(parents=True, exist_ok=True)
    target = root / f"{recipe.name}{_RECIPE_SUFFIX}"
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(target)


def delete_recipe(name: str) -> None:
    if name == "Default":
        raise ValueError("Default recipe cannot be deleted (delete the file manually to reset)")
    if not is_valid_recipe_name(name):
        raise ValueError(f"invalid recipe name: {name!r}")
    target = recipes_dir() / f"{name}{_RECIPE_SUFFIX}"
    try:
        target.unlink()
    except FileNotFoundError:
        pass


def list_subagent_refs() -> list[dict[str, str]]:
    """List available subagent source files from ~/.pupu/subagents/."""
    result: list[dict[str, str]] = []
    sa_dir = Path.home() / ".pupu" / "subagents"
    if not sa_dir.is_dir():
        return result
    for entry in sorted(sa_dir.iterdir()):
        if not entry.is_file():
            continue
        if entry.suffix not in (".soul", ".skeleton"):
            continue
        try:
            from subagent_loader import parse_skeleton, parse_soul  # type: ignore
            parsed = parse_skeleton(entry) if entry.suffix == ".skeleton" else parse_soul(entry)
            result.append({
                "name": parsed.name,
                "format": entry.suffix.lstrip("."),
                "description": parsed.description,
            })
        except Exception as exc:
            _logger.warning("[recipe_loader] cannot read subagent ref %s: %s", entry, exc)
            continue
    return result
