"""Recipe dataclasses + JSON parser for PuPu Agent Recipe system.

A Recipe is a named, user-composable agent configuration persisted as JSON
under ~/.pupu/agent_recipes/<Name>.recipe.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_\- ]{1,64}$")
_VALID_PROMPT_FORMATS = ("soul", "skeleton")
_VALID_SUBAGENT_KINDS = ("ref", "inline")

BUILTIN_DEVELOPER_PROMPT_SENTINEL = "{{USE_BUILTIN_DEVELOPER_PROMPT}}"


class RecipeValidationError(ValueError):
    """Raised when JSON does not conform to the Recipe schema."""


@dataclass(frozen=True)
class RecipeAgent:
    prompt_format: Literal["soul", "skeleton"]
    prompt: str


@dataclass(frozen=True)
class ToolkitRef:
    id: str
    enabled_tools: tuple[str, ...] | None


@dataclass(frozen=True)
class SubagentRef:
    kind: Literal["ref"]
    template_name: str
    disabled_tools: tuple[str, ...]


@dataclass(frozen=True)
class InlineSubagent:
    kind: Literal["inline"]
    name: str
    prompt_format: Literal["soul", "skeleton"]
    template: dict
    disabled_tools: tuple[str, ...]


@dataclass(frozen=True)
class Recipe:
    name: str
    description: str
    model: str | None
    max_iterations: int | None
    agent: RecipeAgent
    toolkits: tuple[ToolkitRef, ...]
    subagent_pool: tuple[SubagentRef | InlineSubagent, ...]


def is_valid_recipe_name(name: str) -> bool:
    return isinstance(name, str) and bool(_NAME_PATTERN.match(name))


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise RecipeValidationError(msg)


def _as_str_tuple(value: Any, field: str) -> tuple[str, ...]:
    _require(isinstance(value, list), f"{field} must be a list")
    result: list[str] = []
    for item in value:
        _require(isinstance(item, str), f"{field}[] entries must be strings")
        result.append(item)
    return tuple(result)


def _parse_agent(data: Any) -> RecipeAgent:
    _require(isinstance(data, dict), "agent must be an object")
    prompt_format = data.get("prompt_format")
    _require(
        prompt_format in _VALID_PROMPT_FORMATS,
        f"agent.prompt_format must be one of {_VALID_PROMPT_FORMATS}",
    )
    prompt = data.get("prompt", "")
    _require(isinstance(prompt, str), "agent.prompt must be a string")
    return RecipeAgent(prompt_format=prompt_format, prompt=prompt)


def _parse_toolkit_ref(data: Any) -> ToolkitRef:
    _require(isinstance(data, dict), "toolkits[] entry must be an object")
    tid = data.get("id")
    _require(isinstance(tid, str) and tid, "toolkits[].id must be a non-empty string")
    enabled = data.get("enabled_tools", None)
    if enabled is None:
        return ToolkitRef(id=tid, enabled_tools=None)
    return ToolkitRef(id=tid, enabled_tools=_as_str_tuple(enabled, f"toolkits[{tid}].enabled_tools"))


def _parse_subagent_entry(data: Any) -> SubagentRef | InlineSubagent:
    _require(isinstance(data, dict), "subagent_pool[] entry must be an object")
    kind = data.get("kind")
    _require(kind in _VALID_SUBAGENT_KINDS, f"subagent_pool[].kind must be one of {_VALID_SUBAGENT_KINDS}")
    disabled = _as_str_tuple(data.get("disabled_tools", []), "subagent_pool[].disabled_tools")
    if kind == "ref":
        tname = data.get("template_name")
        _require(isinstance(tname, str) and tname, "ref subagent requires template_name")
        return SubagentRef(kind="ref", template_name=tname, disabled_tools=disabled)
    name = data.get("name")
    _require(isinstance(name, str) and name, "inline subagent requires name")
    pformat = data.get("prompt_format")
    _require(pformat in _VALID_PROMPT_FORMATS, "inline.prompt_format must be soul or skeleton")
    template = data.get("template")
    _require(isinstance(template, dict), "inline.template must be an object")
    return InlineSubagent(
        kind="inline",
        name=name,
        prompt_format=pformat,
        template=template,
        disabled_tools=disabled,
    )


def parse_recipe_json(data: Any) -> Recipe:
    """Parse a JSON-decoded dict into a Recipe. Raises RecipeValidationError on any violation."""
    _require(isinstance(data, dict), "recipe root must be an object")
    name = data.get("name")
    _require(is_valid_recipe_name(name), f"recipe name invalid: {name!r}")

    description = data.get("description", "")
    _require(isinstance(description, str), "description must be a string")

    model = data.get("model", None)
    _require(model is None or isinstance(model, str), "model must be a string or null")

    max_iter = data.get("max_iterations", None)
    if max_iter is not None:
        _require(isinstance(max_iter, int) and max_iter > 0, "max_iterations must be positive int or null")

    agent = _parse_agent(data.get("agent"))

    toolkits_raw = data.get("toolkits", [])
    _require(isinstance(toolkits_raw, list), "toolkits must be a list")
    toolkits = tuple(_parse_toolkit_ref(tk) for tk in toolkits_raw)

    pool_raw = data.get("subagent_pool", [])
    _require(isinstance(pool_raw, list), "subagent_pool must be a list")
    pool = tuple(_parse_subagent_entry(entry) for entry in pool_raw)

    return Recipe(
        name=name,
        description=description,
        model=model,
        max_iterations=max_iter,
        agent=agent,
        toolkits=toolkits,
        subagent_pool=pool,
    )
