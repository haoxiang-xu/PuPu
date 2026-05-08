"""File-based subagent loader — scans .soul / .skeleton files and builds
SubagentTemplate instances at chat-session start."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")
_RESERVED_NAMES = frozenset(
    {"delegate_to_subagent", "handoff_to_subagent", "spawn_worker_batch"}
)
_VALID_MODES = frozenset({"delegate", "handoff", "worker"})
_VALID_OUTPUT_MODES = frozenset({"summary", "last_message", "full_trace"})
_VALID_MEMORY_POLICIES = frozenset({"ephemeral", "scoped_persistent"})
_SOUL_DEFAULT_MODES = ("delegate", "worker")


class LoaderParseError(ValueError):
    """Raised internally by parsers. Caught by load_templates and logged."""


@dataclass(frozen=True)
class ParsedTemplate:
    name: str
    description: str
    instructions: str
    allowed_modes: tuple[str, ...]
    output_mode: str
    memory_policy: str
    parallel_safe: bool
    allowed_tools: tuple[str, ...] | None
    model: str | None
    source_path: Path
    source_scope: str
    source_format: str


def _parse_soul_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Minimal YAML frontmatter parser for .soul files.

    Supports only these forms:
      key: bare string value
      key: [a, b, c]   (list of bare strings, no quotes, no nested)

    Returns (frontmatter_dict, body_str). Raises LoaderParseError on malformed input.
    """
    if not text.startswith("---"):
        raise LoaderParseError("missing frontmatter (file must start with '---')")
    rest = text[3:]
    if rest.startswith("\n"):
        rest = rest[1:]
    end_marker = rest.find("\n---")
    if end_marker == -1:
        raise LoaderParseError("frontmatter not terminated (expected closing '---')")
    fm_text = rest[:end_marker]
    body_start = end_marker + len("\n---")
    body = rest[body_start:]
    if body.startswith("\n"):
        body = body[1:]

    fm: dict[str, Any] = {}
    for line_no, raw_line in enumerate(fm_text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            raise LoaderParseError(
                f"frontmatter line {line_no}: expected 'key: value', got {raw_line!r}"
            )
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if not key:
            raise LoaderParseError(f"frontmatter line {line_no}: empty key")
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            if not inner:
                fm[key] = []
            else:
                fm[key] = [item.strip() for item in inner.split(",") if item.strip()]
        else:
            fm[key] = value
    return fm, body


def parse_soul(path: Path) -> ParsedTemplate:
    """Parse a .soul file. Raises LoaderParseError on any issue."""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise LoaderParseError(f"not valid UTF-8: {exc}") from exc
    fm, body = _parse_soul_frontmatter(text)
    body = body.strip()
    if not body:
        raise LoaderParseError("empty body (instructions required)")

    name = fm.get("name")
    if not isinstance(name, str) or not name.strip():
        raise LoaderParseError("missing or invalid 'name' in frontmatter")
    description = fm.get("description")
    if not isinstance(description, str) or not description.strip():
        raise LoaderParseError("missing or invalid 'description' in frontmatter")

    tools_raw = fm.get("tools")
    if tools_raw is None:
        allowed_tools: tuple[str, ...] | None = None
    elif isinstance(tools_raw, list):
        allowed_tools = tuple(str(t).strip() for t in tools_raw if str(t).strip())
    else:
        raise LoaderParseError("'tools' must be a list like [a, b, c]")

    model_raw = fm.get("model")
    if model_raw is None:
        model: str | None = None
    elif isinstance(model_raw, str):
        stripped = model_raw.strip()
        model = stripped or None
    else:
        raise LoaderParseError("'model' must be a string")

    return ParsedTemplate(
        name=name.strip(),
        description=description.strip(),
        instructions=body,
        allowed_modes=_SOUL_DEFAULT_MODES,
        output_mode="summary",
        memory_policy="ephemeral",
        parallel_safe=True,
        allowed_tools=allowed_tools,
        model=model,
        source_path=path,
        source_scope="user",
        source_format=path.suffix,
    )


def parse_skeleton(path: Path) -> ParsedTemplate:
    """Parse a .skeleton JSON file. Raises LoaderParseError on any issue."""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise LoaderParseError(f"not valid UTF-8: {exc}") from exc
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LoaderParseError(f"invalid JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise LoaderParseError("top-level value must be a JSON object")

    name = raw.get("name")
    if not isinstance(name, str) or not name.strip():
        raise LoaderParseError("missing or invalid 'name'")
    description = raw.get("description")
    if not isinstance(description, str) or not description.strip():
        raise LoaderParseError("missing or invalid 'description'")
    instructions = raw.get("instructions")
    if not isinstance(instructions, str) or not instructions.strip():
        raise LoaderParseError("missing or invalid 'instructions'")

    allowed_modes_raw = raw.get("allowed_modes", ["delegate", "worker"])
    if not isinstance(allowed_modes_raw, list) or not all(
        isinstance(item, str) for item in allowed_modes_raw
    ):
        raise LoaderParseError("'allowed_modes' must be a list of strings")
    allowed_modes = tuple(allowed_modes_raw)

    output_mode = raw.get("output_mode", "summary")
    if not isinstance(output_mode, str):
        raise LoaderParseError("'output_mode' must be a string")
    memory_policy = raw.get("memory_policy", "ephemeral")
    if not isinstance(memory_policy, str):
        raise LoaderParseError("'memory_policy' must be a string")
    parallel_safe = raw.get("parallel_safe", True)
    if not isinstance(parallel_safe, bool):
        raise LoaderParseError("'parallel_safe' must be a boolean")

    allowed_tools_raw = raw.get("allowed_tools", None)
    if allowed_tools_raw is None:
        allowed_tools: tuple[str, ...] | None = None
    elif isinstance(allowed_tools_raw, list) and all(
        isinstance(item, str) for item in allowed_tools_raw
    ):
        allowed_tools = tuple(item.strip() for item in allowed_tools_raw if item.strip())
    else:
        raise LoaderParseError("'allowed_tools' must be null or a list of strings")

    model_raw = raw.get("model", None)
    if model_raw is None:
        model = None
    elif isinstance(model_raw, str):
        stripped = model_raw.strip()
        model = stripped or None
    else:
        raise LoaderParseError("'model' must be null or a string")

    return ParsedTemplate(
        name=name.strip(),
        description=description.strip(),
        instructions=instructions.strip(),
        allowed_modes=allowed_modes,
        output_mode=output_mode,
        memory_policy=memory_policy,
        parallel_safe=parallel_safe,
        allowed_tools=allowed_tools,
        model=model,
        source_path=path,
        source_scope="user",
        source_format=path.suffix,
    )


_PRECEDENCE_RANK: dict[tuple[str, str], int] = {
    ("user", ".skeleton"): 0,
    ("user", ".soul"): 1,
    ("workspace", ".skeleton"): 2,
    ("workspace", ".soul"): 3,
}


def _validate_parsed(parsed: ParsedTemplate) -> str | None:
    """Return None if valid, else a human-readable reason for rejection."""
    if not _NAME_RE.match(parsed.name):
        return (
            f"name {parsed.name!r} does not match [A-Za-z][A-Za-z0-9_-]{{0,63}}"
        )
    if parsed.name in _RESERVED_NAMES:
        return f"name {parsed.name!r} is reserved"
    bad_modes = [m for m in parsed.allowed_modes if m not in _VALID_MODES]
    if bad_modes:
        return (
            f"allowed_modes contains invalid values {bad_modes}; "
            f"valid: {sorted(_VALID_MODES)}"
        )
    if not parsed.allowed_modes:
        return "allowed_modes must contain at least one mode"
    if parsed.output_mode not in _VALID_OUTPUT_MODES:
        return (
            f"output_mode {parsed.output_mode!r} invalid; "
            f"valid: {sorted(_VALID_OUTPUT_MODES)}"
        )
    if parsed.memory_policy not in _VALID_MEMORY_POLICIES:
        return (
            f"memory_policy {parsed.memory_policy!r} invalid; "
            f"valid: {sorted(_VALID_MEMORY_POLICIES)}"
        )
    return None


def _scan_dir(directory: Path, scope: str) -> list[ParsedTemplate]:
    """Scan a directory for .soul/.skeleton files and return parsed templates.
    Parse failures are logged and skipped — never raised."""
    results: list[ParsedTemplate] = []
    if not directory.exists() or not directory.is_dir():
        return results
    for path in sorted(directory.iterdir()):
        if not path.is_file():
            continue
        suffix = path.suffix
        if suffix not in (".soul", ".skeleton"):
            continue
        try:
            parsed = parse_soul(path) if suffix == ".soul" else parse_skeleton(path)
        except LoaderParseError as exc:
            logger.warning("[subagent_loader] %s: parse failed — %s", path, exc)
            continue
        except Exception as exc:
            logger.warning(
                "[subagent_loader] %s: unexpected parse error — %s", path, exc
            )
            continue
        normalized = ParsedTemplate(
            name=parsed.name,
            description=parsed.description,
            instructions=parsed.instructions,
            allowed_modes=parsed.allowed_modes,
            output_mode=parsed.output_mode,
            memory_policy=parsed.memory_policy,
            parallel_safe=parsed.parallel_safe,
            allowed_tools=parsed.allowed_tools,
            model=parsed.model,
            source_path=parsed.source_path,
            source_scope=scope,
            source_format=suffix,
        )
        reason = _validate_parsed(normalized)
        if reason is not None:
            logger.warning(
                "[subagent_loader] %s: rejected — %s", path, reason
            )
            continue
        results.append(normalized)
    return results


def _dedupe_by_precedence(
    templates: list[ParsedTemplate],
) -> list[ParsedTemplate]:
    """Apply user.skeleton > user.soul > workspace.skeleton > workspace.soul.
    Same-name conflicts keep the highest-ranked; losers logged as shadowed."""
    by_name: dict[str, list[ParsedTemplate]] = {}
    for tpl in templates:
        by_name.setdefault(tpl.name, []).append(tpl)
    winners: list[ParsedTemplate] = []
    for name, group in by_name.items():
        group.sort(
            key=lambda t: _PRECEDENCE_RANK.get(
                (t.source_scope, t.source_format), 99
            )
        )
        winner = group[0]
        for loser in group[1:]:
            logger.warning(
                "[subagent_loader] %s: shadowed by %s (same name %r)",
                loser.source_path,
                winner.source_path,
                name,
            )
        winners.append(winner)
    return winners


def _compute_effective_tools(
    allowed_tools: tuple[str, ...] | None,
    main_tool_names: set[str],
) -> tuple[str, ...] | None:
    """Intersect a subagent's declared allowed_tools with the main agent's toolset.

    Returns None if the subagent allows all (``allowed_tools is None``), otherwise
    the ordered intersection. Returns empty tuple if the declared list has no
    overlap with ``main_tool_names`` — caller should skip such a subagent.
    """
    if allowed_tools is None:
        return None
    declared = tuple(dict.fromkeys(allowed_tools))
    return tuple(t for t in declared if t in main_tool_names)


def _build_child_agent(
    *,
    UnchainAgent: Any,
    ToolsModule: Any,
    PoliciesModule: Any,
    toolkits: tuple[Any, ...],
    provider: str,
    model: str,
    api_key: str | None,
    max_iterations: int,
    name: str,
    instructions: str,
) -> Any:
    """Construct the inner Agent instance wrapped inside a SubagentTemplate.

    Mirrors the inline body in ``load_templates`` so that
    ``unchain_adapter._materialize_recipe_subagents`` can reuse it.
    """
    child_modules: list[Any] = []
    if toolkits:
        child_modules.append(ToolsModule(tools=tuple(toolkits)))
    child_modules.append(PoliciesModule(max_iterations=max(2, max_iterations // 3)))
    return UnchainAgent(
        name=name,
        instructions=instructions,
        provider=provider,
        model=model,
        api_key=api_key,
        modules=tuple(child_modules),
    )


def _collect_main_tool_names(toolkits: tuple[Any, ...]) -> set[str]:
    names: set[str] = set()
    for toolkit in toolkits:
        tools_attr = getattr(toolkit, "tools", None)
        if isinstance(tools_attr, dict):
            names.update(str(k) for k in tools_attr.keys())
        elif isinstance(tools_attr, (list, tuple)):
            for tool in tools_attr:
                tool_name = getattr(tool, "name", None)
                if isinstance(tool_name, str) and tool_name:
                    names.add(tool_name)
    return names


def load_templates(
    *,
    toolkits: tuple[Any, ...],
    provider: str,
    model: str,
    api_key: str | None,
    max_iterations: int,
    user_dir: Path,
    workspace_dir: Path | None,
    UnchainAgent: Any,
    ToolsModule: Any,
    PoliciesModule: Any,
    SubagentTemplate: Any,
) -> tuple[Any, ...]:
    """Scan user_dir + workspace_dir, parse files, validate, apply precedence,
    intersect allowed_tools against main agent's tools, and return a tuple of
    ready-to-register SubagentTemplate instances.

    All failure modes (missing dirs, parse errors, validation failures, empty
    tool intersections) result in log warnings + skipping — never raises."""
    main_tool_names = _collect_main_tool_names(toolkits)

    parsed: list[ParsedTemplate] = []
    parsed.extend(_scan_dir(user_dir, "user"))
    if workspace_dir is not None:
        parsed.extend(_scan_dir(workspace_dir, "workspace"))

    survivors = _dedupe_by_precedence(parsed)

    templates: list[Any] = []
    for tpl in survivors:
        if tpl.allowed_tools is None:
            effective_tools: tuple[str, ...] | None = None
        else:
            declared = tuple(dict.fromkeys(tpl.allowed_tools))
            intersect = tuple(t for t in declared if t in main_tool_names)
            if not intersect:
                logger.warning(
                    "[subagent_loader] %s: no allowed_tools available in main "
                    "agent (declared: %s, main has: %s) — skipping",
                    tpl.source_path,
                    list(declared),
                    sorted(main_tool_names),
                )
                continue
            if len(intersect) < len(declared):
                dropped = [t for t in declared if t not in main_tool_names]
                logger.info(
                    "[subagent_loader] %s: allowed_tools filtered (dropped: %s) "
                    "— not in main agent",
                    tpl.name,
                    dropped,
                )
            effective_tools = intersect

        child_modules = []
        if toolkits:
            child_modules.append(ToolsModule(tools=tuple(toolkits)))
        child_modules.append(PoliciesModule(max_iterations=max(2, max_iterations // 3)))

        child_agent = UnchainAgent(
            name=tpl.name,
            instructions=tpl.instructions,
            provider=provider,
            model=tpl.model or model,
            api_key=api_key,
            modules=tuple(child_modules),
        )

        template = SubagentTemplate(
            name=tpl.name,
            description=tpl.description,
            agent=child_agent,
            allowed_modes=tpl.allowed_modes,
            output_mode=tpl.output_mode,
            memory_policy=tpl.memory_policy,
            parallel_safe=tpl.parallel_safe,
            allowed_tools=effective_tools,
            model=tpl.model,
        )
        templates.append(template)

    if templates:
        logger.info(
            "[subagent_loader] loaded %d templates: %s",
            len(templates),
            [t.name for t in templates],
        )
    else:
        logger.info("[subagent_loader] no subagent templates registered")

    return tuple(templates)
