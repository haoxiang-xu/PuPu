from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Dict, List

from mcp_registry import oauth_recipe_for_entry, oauth_registry_entry, oauth_registry_entries
from mcp_credential_store import credential_store_lock, read_credential_store, write_credential_store


class McpOAuthAppError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


MCP_OAUTH_APPS_FILENAME = "mcp_oauth_apps.json"


def _data_dir(data_dir: str | Path | None = None) -> Path:
    if data_dir is not None:
        return Path(data_dir)
    raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    return Path(raw) if raw else Path.home() / ".pupu"


def _store_path(data_dir: str | Path | None = None) -> Path:
    return _data_dir(data_dir) / MCP_OAUTH_APPS_FILENAME


def _empty_store() -> Dict[str, Any]:
    return {"version": 1, "apps": {}}


def _read_store(data_dir: str | Path | None = None) -> Dict[str, Any]:
    return read_credential_store(_store_path(data_dir))


def _write_store(store: Dict[str, Any], data_dir: str | Path | None = None) -> None:
    write_credential_store(_store_path(data_dir), store)


def _client_id_preview(client_id: str) -> str:
    clean = str(client_id or "").strip()
    if len(clean) <= 8:
        return clean
    return f"{clean[:4]}...{clean[-4:]}"


def _app_status(entry: Dict[str, Any], stored: Dict[str, Any] | None = None) -> Dict[str, Any]:
    recipe = oauth_recipe_for_entry(entry)
    stored = stored if isinstance(stored, dict) else {}
    client_id = str(stored.get("client_id") or "").strip()
    client_secret = str(stored.get("client_secret") or "").strip()
    return {
        "provider": recipe.get("provider", ""),
        "providerLabel": recipe.get("providerLabel", ""),
        "toolkitId": entry.get("toolkit_id", ""),
        "entryId": entry.get("entry_id", ""),
        "configured": bool(client_id and client_secret),
        "clientIdPreview": _client_id_preview(client_id),
        "scopes": list(stored.get("scopes") or recipe.get("scopes") or []),
        "lastUpdatedAt": float(stored.get("last_updated_at") or 0),
    }


def _validate_user_credentials_entry(toolkit_id: str) -> Dict[str, Any]:
    try:
        entry = oauth_registry_entry(toolkit_id)
    except KeyError as exc:
        raise McpOAuthAppError(
            "mcp_oauth_provider_unsupported",
            "This MCP entry does not support OAuth app credentials",
            400,
        ) from exc
    recipe = oauth_recipe_for_entry(entry)
    if recipe.get("clientRegistration") != "user_credentials":
        raise McpOAuthAppError(
            "mcp_oauth_app_invalid",
            "This MCP OAuth entry does not use user-supplied app credentials",
            400,
        )
    return entry


def configure_mcp_oauth_app(
    payload: Dict[str, Any],
    *,
    data_dir: str | Path | None = None,
    now_fn=None,
) -> Dict[str, Any]:
    toolkit_id = str(
        payload.get("toolkitId") or payload.get("toolkit_id") or ""
    ).strip()
    entry = _validate_user_credentials_entry(toolkit_id)
    recipe = oauth_recipe_for_entry(entry)
    if (
        str(entry.get("status") or "") != "available"
        or str(recipe.get("releaseStatus") or "") != "ready"
    ):
        raise McpOAuthAppError(
            "mcp_oauth_release_unavailable",
            "This MCP OAuth app cannot be configured in this release",
            403,
        )
    client_id = str(payload.get("clientId") or payload.get("client_id") or "").strip()
    client_secret = str(
        payload.get("clientSecret") or payload.get("client_secret") or ""
    ).strip()
    if not client_id or not client_secret:
        raise McpOAuthAppError(
            "mcp_oauth_app_invalid",
            "OAuth app client_id and client_secret are required",
            400,
        )
    raw_scopes = payload.get("scopes")
    scopes = raw_scopes if isinstance(raw_scopes, list) else recipe.get("scopes", [])
    clean_scopes: List[str] = []
    for scope in scopes:
        clean = str(scope or "").strip()
        if clean:
            clean_scopes.append(clean)
    if not clean_scopes and recipe.get("scopes"):
        raise McpOAuthAppError(
            "mcp_oauth_scope_invalid",
            "OAuth app scopes cannot be empty for this MCP provider",
            400,
        )
    now = (now_fn or time.time)()
    with credential_store_lock(_store_path(data_dir)):
        store = _read_store(data_dir)
        store["apps"][entry["toolkit_id"]] = {
            "entry_id": entry["entry_id"],
            "toolkit_id": entry["toolkit_id"],
            "provider": recipe.get("provider", ""),
            "client_id": client_id,
            "client_secret": client_secret,
            "scopes": clean_scopes,
            "last_updated_at": now,
        }
        _write_store(store, data_dir)
    return {"app": _app_status(entry, store["apps"][entry["toolkit_id"]])}


def get_mcp_oauth_app(
    entry_or_toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any] | None:
    try:
        entry = oauth_registry_entry(entry_or_toolkit_id)
    except KeyError:
        return None
    stored = _read_store(data_dir)["apps"].get(entry["toolkit_id"])
    return dict(stored) if isinstance(stored, dict) else None


def list_mcp_oauth_apps(
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    store = _read_store(data_dir)
    apps = []
    for entry in oauth_registry_entries():
        recipe = oauth_recipe_for_entry(entry)
        release_ready = (
            str(entry.get("status") or "") == "available"
            and str(recipe.get("releaseStatus") or "") == "ready"
        )
        if recipe.get("clientRegistration") != "user_credentials":
            continue
        stored = store["apps"].get(entry["toolkit_id"])
        if not release_ready and not isinstance(stored, dict):
            continue
        app = _app_status(entry, stored)
        app.update(
            {
                "configurable": release_ready,
                "connectable": release_ready,
                "releaseBlocked": not release_ready,
            }
        )
        apps.append(app)
    return {"apps": apps, "count": len(apps)}


def delete_mcp_oauth_app(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    entry = _validate_user_credentials_entry(toolkit_id)
    with credential_store_lock(_store_path(data_dir)):
        store = _read_store(data_dir)
        store["apps"].pop(entry["toolkit_id"], None)
        _write_store(store, data_dir)
    return {"ok": True, "toolkitId": entry["toolkit_id"]}
