from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List

from mcp_credential_store import credential_store_lock, read_credential_store, write_credential_store

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
    return read_credential_store(_store_path(data_dir))


def _write_store(store: Dict, data_dir: str | Path | None = None) -> None:
    write_credential_store(_store_path(data_dir), store)


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

    with credential_store_lock(_store_path(data_dir)):
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
    with credential_store_lock(_store_path(data_dir)):
        store = _read_store(data_dir)
        store["toolkits"].pop(clean_toolkit_id, None)
        _write_store(store, data_dir)
    return {"ok": True, "toolkitId": clean_toolkit_id}
