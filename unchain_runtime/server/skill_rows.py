"""skill_rows — normalize [[skills]] declarations into catalog rows.

Shared by the builtin toolkit.toml path (unchain_adapter) and the MCP
store-entry path (mcp_registry / mcp_toolkits). Tolerant by design: the
catalog must keep serving, so invalid rows are dropped, never raised —
strict validation lives in unchain's manifest parser instead.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

_SKILL_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
_SKILL_PHASES = {"composer", "streaming", "always"}


def _clean_str(value: Any) -> str:
    """Strings pass through stripped; every other type yields "" (dropped
    or defaulted by the caller) — repr-coercing a dict/int into a prompt
    body would leak garbage into the catalog."""
    return value.strip() if isinstance(value, str) else ""


def normalize_skill_rows(raw: Any) -> List[Dict[str, object]]:
    if not isinstance(raw, list):
        return []
    rows: List[Dict[str, object]] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = _clean_str(item.get("name"))
        body = _clean_str(item.get("body"))
        if not name or not body or not _SKILL_NAME_RE.match(name) or name in seen:
            continue
        phase = _clean_str(item.get("phase")) or "composer"
        if phase not in _SKILL_PHASES:
            phase = "composer"
        raw_tools = item.get("tools")
        tools = [
            tool.strip()
            for tool in (raw_tools if isinstance(raw_tools, list) else [])
            if isinstance(tool, str) and tool.strip()
        ]
        seen.add(name)
        rows.append({
            "name": name,
            "title": _clean_str(item.get("title")) or name,
            "description": _clean_str(item.get("description")),
            "body": body,
            "tools": tools,
            "phase": phase,
        })
    return rows
