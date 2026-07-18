"""skill_packs — local persistence for imported open-ecosystem skill packs.

A "skill pack" is a PURE-SKILL plugin: an imported directory of Claude-style
SKILL.md files, normalized on the frontend (see src/SERVICEs/skill_pack_import.js)
into `{name, description, body, phase, tools}` skill rows. It carries NO MCP
transport, NO tools, and — by construction — NEVER opens an MCP connection
(architect M6). This module deliberately shares nothing with mcp_toolkits.py's
connect/discover machinery: installing a pack is a pure validate-and-write.

Persistence sits at the SAME tier as custom MCP (a local user-installed store in
the app data dir) but in its own file, so the two never entangle. Catalog v2
appends installed packs alongside installed MCP toolkits
(unchain_adapter._append_installed_skill_packs), where plugin_skill_sync turns
each skill into a /command.
"""
from __future__ import annotations

import copy
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List

from skill_rows import normalize_skill_rows

SKILL_PACKS_FILENAME = "skill_packs.json"

SKILL_PACK_ID_PREFIX = "skillpack."

DEFAULT_SKILL_PACK_ICON = {
    "type": "builtin",
    "name": "command",
    "color": "#7c8cf8",
    "backgroundColor": "#eef0fe",
}


class SkillPackError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


def _data_dir(explicit: str | Path | None = None) -> Path:
    if explicit is not None:
        return Path(explicit)
    raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if raw:
        return Path(raw)
    return Path.home() / ".pupu"


def _store_path(data_dir: str | Path | None = None) -> Path:
    return _data_dir(data_dir) / SKILL_PACKS_FILENAME


def _empty_store() -> Dict[str, Any]:
    return {"version": 1, "packs": []}


def _read_store(data_dir: str | Path | None = None) -> Dict[str, Any]:
    path = _store_path(data_dir)
    if not path.exists():
        return _empty_store()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return _empty_store()
    if not isinstance(raw, dict) or not isinstance(raw.get("packs"), list):
        return _empty_store()
    return {"version": 1, "packs": [r for r in raw["packs"] if isinstance(r, dict)]}


def _write_store(store: Dict[str, Any], data_dir: str | Path | None = None) -> None:
    path = _store_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2, sort_keys=True), encoding="utf-8")


def _record_to_frontend(record: Dict[str, Any]) -> Dict[str, Any]:
    skills = list(record.get("skills", []) or [])
    return {
        "toolkitId": record.get("toolkit_id", ""),
        "toolkitName": record.get("toolkit_name", ""),
        "toolkitDescription": record.get("toolkit_description", ""),
        "toolkitIcon": record.get("toolkit_icon") or DEFAULT_SKILL_PACK_ICON,
        "source": "skillpack",
        "status": "available",
        "tools": [],
        "toolCount": 0,
        "skills": skills,
        "skillCount": len(skills),
        "sourceLabel": record.get("source_label", ""),
        "installedAt": record.get("installed_at", 0),
    }


def list_installed_skill_packs(
    data_dir: str | Path | None = None,
) -> List[Dict[str, Any]]:
    store = _read_store(data_dir)
    return [_record_to_frontend(record) for record in store["packs"]]


def get_installed_skill_pack(
    toolkit_id: str,
    data_dir: str | Path | None = None,
) -> Dict[str, Any] | None:
    normalized = str(toolkit_id or "").strip()
    for record in _read_store(data_dir)["packs"]:
        if record.get("toolkit_id") == normalized:
            return _record_to_frontend(record)
    return None


def install_skill_pack(
    pack: Dict[str, Any] | None,
    *,
    data_dir: str | Path | None = None,
    now_fn=None,
) -> Dict[str, Any]:
    """Persist an imported skill pack. Pure validate-and-write — no MCP.

    `pack` is the frontend descriptor from buildSkillPackFromScan:
      { toolkitId, toolkitName, toolkitDescription?, sourceLabel?, skills[] }
    """
    if not isinstance(pack, dict):
        raise SkillPackError("invalid_skill_pack", "skill pack payload is required", 400)

    toolkit_id = str(pack.get("toolkitId") or pack.get("toolkit_id") or "").strip()
    if not toolkit_id.startswith(SKILL_PACK_ID_PREFIX):
        raise SkillPackError(
            "invalid_skill_pack",
            "skill pack toolkitId must start with 'skillpack.'",
            400,
        )

    toolkit_name = str(pack.get("toolkitName") or pack.get("toolkit_name") or "").strip()
    if not toolkit_name:
        raise SkillPackError("invalid_skill_pack", "skill pack toolkitName is required", 400)

    # Re-normalize defensively: the store is the source of truth for the
    # catalog, so it never trusts the client's shaping blindly. Invalid rows are
    # dropped exactly as the builtin/MCP skill paths drop them.
    skills = normalize_skill_rows(pack.get("skills"))
    if not skills:
        raise SkillPackError(
            "skill_pack_empty",
            "skill pack has no importable skills",
            400,
        )

    store = _read_store(data_dir)
    if any(record.get("toolkit_id") == toolkit_id for record in store["packs"]):
        raise SkillPackError(
            "skill_pack_already_installed",
            "skill pack is already installed",
            409,
        )

    record = {
        "toolkit_id": toolkit_id,
        "toolkit_name": toolkit_name,
        "toolkit_description": str(
            pack.get("toolkitDescription")
            or pack.get("toolkit_description")
            or ""
        ).strip(),
        "toolkit_icon": copy.deepcopy(DEFAULT_SKILL_PACK_ICON),
        "source_label": str(pack.get("sourceLabel") or pack.get("source_label") or "").strip(),
        "skills": skills,
        "installed_at": (now_fn or time.time)(),
    }
    store["packs"].append(record)
    _write_store(store, data_dir)
    return {"toolkit": _record_to_frontend(record)}


def delete_skill_pack(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    normalized = str(toolkit_id or "").strip()
    store = _read_store(data_dir)
    next_records = [
        record for record in store["packs"] if record.get("toolkit_id") != normalized
    ]
    if len(next_records) == len(store["packs"]):
        raise SkillPackError("skill_pack_not_found", "skill pack is not installed", 404)
    store["packs"] = next_records
    _write_store(store, data_dir)
    return {"ok": True, "toolkitId": normalized}
