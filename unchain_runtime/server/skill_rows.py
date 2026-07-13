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


def normalize_skill_rows(raw: Any) -> List[Dict[str, object]]:
    if not isinstance(raw, list):
        return []
    rows: List[Dict[str, object]] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        body = str(item.get("body") or "").strip()
        if not name or not body or not _SKILL_NAME_RE.match(name) or name in seen:
            continue
        phase = str(item.get("phase") or "composer").strip()
        if phase not in _SKILL_PHASES:
            phase = "composer"
        tools = [
            str(tool).strip()
            for tool in (item.get("tools") or [])
            if isinstance(tool, str) and str(tool).strip()
        ]
        seen.add(name)
        rows.append({
            "name": name,
            "title": str(item.get("title") or "").strip() or name,
            "description": str(item.get("description") or "").strip(),
            "body": body,
            "tools": tools,
            "phase": phase,
        })
    return rows
