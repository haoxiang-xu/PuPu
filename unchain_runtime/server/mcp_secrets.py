from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, List

MCP_SECRETS_FILENAME = "mcp_secrets.json"


def _data_dir(data_dir: str | Path | None = None) -> Path:
    if data_dir is not None:
        return Path(data_dir)
    raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    return Path(raw) if raw else Path.home() / ".pupu"


def _store_path(data_dir: str | Path | None = None) -> Path:
    return _data_dir(data_dir) / MCP_SECRETS_FILENAME


def _empty_store() -> Dict:
    return {"version": 1, "toolkits": {}}


def _read_store(data_dir: str | Path | None = None) -> Dict:
    path = _store_path(data_dir)
    if not path.exists():
        return _empty_store()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return _empty_store()
    if not isinstance(raw, dict) or not isinstance(raw.get("toolkits"), dict):
        return _empty_store()
    return {"version": 1, "toolkits": raw["toolkits"]}


def _write_store(store: Dict, data_dir: str | Path | None = None) -> None:
    path = _store_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2, sort_keys=True), encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def save_mcp_secret_values(
    toolkit_id: str,
    values: Dict[str, str],
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, object]:
    clean_toolkit_id = str(toolkit_id or "").strip()
    clean_values = {
        str(key).strip(): str(value)
        for key, value in (values or {}).items()
        if str(key).strip() and str(value)
    }

    store = _read_store(data_dir)
    store["toolkits"][clean_toolkit_id] = clean_values
    _write_store(store, data_dir)
    return {"ok": True, "toolkitId": clean_toolkit_id}


def get_mcp_secret_value(
    toolkit_id: str,
    key: str,
    *,
    data_dir: str | Path | None = None,
) -> str:
    store = _read_store(data_dir)
    values = store["toolkits"].get(str(toolkit_id or "").strip(), {})
    if not isinstance(values, dict):
        return ""
    return str(values.get(str(key or "").strip(), "") or "")


def get_mcp_secret_values(
    toolkit_id: str,
    keys: list[str] | tuple[str, ...],
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, str]:
    return {
        key: get_mcp_secret_value(toolkit_id, key, data_dir=data_dir)
        for key in keys
    }


def list_mcp_secret_status(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> List[Dict[str, object]]:
    store = _read_store(data_dir)
    values = store["toolkits"].get(str(toolkit_id or "").strip(), {})
    if not isinstance(values, dict):
        return []
    return [
        {"key": key, "configured": bool(value)}
        for key, value in sorted(values.items())
    ]


def delete_mcp_secret_values(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, object]:
    clean_toolkit_id = str(toolkit_id or "").strip()
    store = _read_store(data_dir)
    store["toolkits"].pop(clean_toolkit_id, None)
    _write_store(store, data_dir)
    return {"ok": True, "toolkitId": clean_toolkit_id}
