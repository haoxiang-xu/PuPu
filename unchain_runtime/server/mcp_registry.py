from __future__ import annotations

import copy
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import urlparse


REGISTRY_FILENAME = "mcp_toolkit_registry.json"


def _candidate_registry_paths() -> List[Path]:
    candidates: List[Path] = []
    override = os.environ.get("PUPU_MCP_REGISTRY_PATH", "").strip()
    if override:
        candidates.append(Path(override))

    bundle_raw = str(getattr(sys, "_MEIPASS", "") or "").strip()
    if bundle_raw:
        bundle_root = Path(bundle_raw)
        candidates.append(bundle_root / "resources" / REGISTRY_FILENAME)
        candidates.append(bundle_root / REGISTRY_FILENAME)

    server_path = Path(__file__).resolve()
    candidates.append(
        server_path.parents[2] / "src" / "SERVICEs" / REGISTRY_FILENAME
    )
    candidates.append(server_path.parent / "resources" / REGISTRY_FILENAME)
    return candidates


def registry_path() -> Path:
    for path in _candidate_registry_paths():
        if path.exists():
            return path
    searched = ", ".join(str(path) for path in _candidate_registry_paths())
    raise RuntimeError(f"MCP registry JSON not found. Searched: {searched}")


def _read_registry_payload(path: Path | None = None) -> Dict[str, Any]:
    resolved = path or registry_path()
    raw = json.loads(resolved.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise RuntimeError("MCP registry JSON root must be an object")
    if not isinstance(raw.get("entries"), list):
        raise RuntimeError("MCP registry JSON must contain an entries array")
    return raw


def _clean_str(value: Any) -> str:
    return str(value or "").strip()


def _normalize_header(raw: Any) -> Dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    name = _clean_str(raw.get("name"))
    if not name:
        return None
    header: Dict[str, Any] = {"name": name}
    secret_key = _clean_str(
        raw.get("value_from_secret") or raw.get("valueFromSecret") or raw.get("secret")
    )
    if secret_key:
        header["value_from_secret"] = secret_key
        if raw.get("prefix"):
            header["prefix"] = str(raw.get("prefix") or "")
        if raw.get("suffix"):
            header["suffix"] = str(raw.get("suffix") or "")
    else:
        header["value"] = str(raw.get("value") or "")
    return header


def _normalize_mcp(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise RuntimeError("MCP registry entry is missing mcp config")
    transport = _clean_str(raw.get("transport"))
    if transport not in {"stdio", "http"}:
        raise RuntimeError(f"Unsupported MCP registry transport: {transport}")

    mcp: Dict[str, Any] = {"transport": transport}
    if transport == "stdio":
        mcp["command"] = _clean_str(raw.get("command"))
        mcp["args"] = [str(arg) for arg in (raw.get("args") or [])]
    else:
        mcp["runtime_transport"] = _clean_str(
            raw.get("runtime_transport") or raw.get("runtimeTransport")
        ) or "streamable_http"
        mcp["url"] = _clean_str(raw.get("url"))
        raw_headers = raw.get("headers") or []
        if isinstance(raw_headers, dict):
            mcp["headers"] = {
                str(key): str(value)
                for key, value in raw_headers.items()
                if _clean_str(key)
            }
        else:
            mcp["headers"] = [
                header
                for header in (_normalize_header(item) for item in raw_headers)
                if header
            ]
    return mcp


def _normalize_metadata_recipe(raw: Any) -> Dict[str, Any]:
    if raw in (None, ""):
        return {}
    if not isinstance(raw, dict):
        raise RuntimeError("MCP registry metadata recipe must be an object")
    recipe_type = _clean_str(raw.get("type"))
    if recipe_type != "http_json":
        raise RuntimeError(f"Unsupported MCP registry metadata type: {recipe_type}")
    request = raw.get("request") if isinstance(raw.get("request"), dict) else {}
    url = _clean_str(request.get("url"))
    if not url:
        raise RuntimeError("MCP registry metadata request.url is required")
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise RuntimeError("MCP registry metadata request.url must use https")
    headers = request.get("headers") if isinstance(request.get("headers"), dict) else {}
    fields = raw.get("fields") if isinstance(raw.get("fields"), dict) else {}
    icon = raw.get("icon") if isinstance(raw.get("icon"), dict) else {}
    icon_policy = _clean_str(raw.get("iconPolicy") or raw.get("icon_policy")) or "fallback"
    if icon_policy not in {"fallback", "replace"}:
        raise RuntimeError("MCP registry metadata iconPolicy must be fallback or replace")
    cache_ttl_ms = raw.get("cacheTtlMs") or raw.get("cache_ttl_ms") or 86400000
    try:
        cache_ttl_ms = int(cache_ttl_ms)
    except (TypeError, ValueError):
        cache_ttl_ms = 86400000
    if cache_ttl_ms <= 0:
        cache_ttl_ms = 86400000
    return {
        "type": "http_json",
        "request": {
            "url": url,
            "headers": {
                str(key): str(value)
                for key, value in headers.items()
                if _clean_str(key)
            },
        },
        "fields": {
            str(key): str(value)
            for key, value in fields.items()
            if _clean_str(key) and _clean_str(value)
        },
        "icon": {
            "urlPath": _clean_str(
                icon.get("urlPath") or icon.get("url_path") or icon.get("path")
            )
        },
        "iconPolicy": icon_policy,
        "cacheTtlMs": cache_ttl_ms,
    }


def _normalize_entry(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise RuntimeError("MCP registry entries must be objects")
    entry_id = _clean_str(raw.get("id") or raw.get("entry_id"))
    toolkit_id = _clean_str(raw.get("toolkitId") or raw.get("toolkit_id"))
    if not entry_id or not toolkit_id:
        raise RuntimeError("MCP registry entry requires id and toolkitId")

    secrets = raw.get("secrets") if isinstance(raw.get("secrets"), list) else []
    auth = copy.deepcopy(raw.get("auth") if isinstance(raw.get("auth"), dict) else {})
    oauth = auth.get("oauth") if isinstance(auth.get("oauth"), dict) else {}
    workspace = (
        copy.deepcopy(raw.get("workspace"))
        if isinstance(raw.get("workspace"), dict)
        else {}
    )
    requires_workspace = bool(
        workspace.get("required") or raw.get("requiresWorkspace") or raw.get("requires_workspace")
    )
    workspace_placeholder = _clean_str(
        workspace.get("placeholder")
        or raw.get("workspacePlaceholder")
        or raw.get("workspace_placeholder")
    )
    workspace_binding = _clean_str(
        workspace.get("binding") or raw.get("workspaceBinding") or raw.get("workspace_binding")
    )

    entry: Dict[str, Any] = {
        "entry_id": entry_id,
        "toolkit_id": toolkit_id,
        "toolkit_name": _clean_str(raw.get("toolkitName") or raw.get("name")),
        "toolkit_description": _clean_str(
            raw.get("toolkitDescription") or raw.get("description")
        ),
        "toolkit_icon": copy.deepcopy(raw.get("toolkitIcon") or raw.get("icon") or {}),
        "category": _clean_str(raw.get("category")),
        "source": _clean_str(raw.get("source")) or "mcp",
        "trust_level": _clean_str(raw.get("trustLevel") or raw.get("trust_level")),
        "status": _clean_str(raw.get("status")) or "available",
        "installable": bool(raw.get("installable")),
        "license": _clean_str(raw.get("license")),
        "source_repo": _clean_str(raw.get("sourceRepo") or raw.get("source_repo")),
        "docs_url": _clean_str(raw.get("docsUrl") or raw.get("docs_url")),
        "readme_markdown": str(raw.get("readmeMarkdown") or raw.get("readme_markdown") or ""),
        "metadata": _normalize_metadata_recipe(raw.get("metadata")),
        "setup_preview": str(raw.get("setupPreview") or raw.get("setup_preview") or ""),
        "prerequisites": [str(item) for item in (raw.get("prerequisites") or [])],
        "tools": copy.deepcopy(raw.get("tools") if isinstance(raw.get("tools"), list) else []),
        "policy_summary": copy.deepcopy(
            raw.get("policySummary") if isinstance(raw.get("policySummary"), dict) else {}
        ),
        "secrets": copy.deepcopy(secrets),
        "auth": auth,
        "mcp": _normalize_mcp(raw.get("mcp")),
        "workspace": {
            "required": requires_workspace,
            "placeholder": workspace_placeholder,
            "binding": workspace_binding,
        },
        "requires_workspace": requires_workspace,
        "workspace_placeholder": workspace_placeholder,
        "workspace_binding": workspace_binding,
    }
    if oauth:
        entry["requires_oauth"] = bool(raw.get("requiresOAuth") or not secrets)
        entry["auth_type"] = "oauth"
        entry["auth_provider"] = _clean_str(oauth.get("provider"))
    return entry


def _load_registry(path: Path | None = None) -> Dict[str, Any]:
    payload = _read_registry_payload(path)
    categories = [str(item) for item in (payload.get("categories") or [])]
    entries_by_id: Dict[str, Dict[str, Any]] = {}
    toolkit_ids: set[str] = set()
    for raw_entry in payload["entries"]:
        entry = _normalize_entry(raw_entry)
        entry_id = entry["entry_id"]
        toolkit_id = entry["toolkit_id"]
        if entry_id in entries_by_id:
            raise RuntimeError(f"Duplicate MCP registry entry id: {entry_id}")
        if toolkit_id in toolkit_ids:
            raise RuntimeError(f"Duplicate MCP registry toolkit id: {toolkit_id}")
        toolkit_ids.add(toolkit_id)
        entries_by_id[entry_id] = entry
    return {
        "version": int(payload.get("version") or 1),
        "categories": categories,
        "entries_by_id": entries_by_id,
    }


_REGISTRY = _load_registry()
MCP_STORE_CATEGORIES: List[str] = list(_REGISTRY["categories"])
INSTALLABLE_MCP_REGISTRY: Dict[str, Dict[str, Any]] = _REGISTRY["entries_by_id"]


def registry_entry(entry_id: str) -> Dict[str, Any]:
    entry = INSTALLABLE_MCP_REGISTRY.get(str(entry_id or "").strip())
    if entry is None:
        raise KeyError(str(entry_id or "").strip())
    return copy.deepcopy(entry)


def registry_entry_from_any_id(entry_or_toolkit_id: str) -> Dict[str, Any]:
    normalized = str(entry_or_toolkit_id or "").strip()
    if normalized in INSTALLABLE_MCP_REGISTRY:
        return registry_entry(normalized)
    for entry in INSTALLABLE_MCP_REGISTRY.values():
        if entry.get("toolkit_id") == normalized:
            return copy.deepcopy(entry)
    raise KeyError(normalized)


def oauth_recipe_for_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    auth = entry.get("auth") if isinstance(entry.get("auth"), dict) else {}
    oauth = auth.get("oauth") if isinstance(auth.get("oauth"), dict) else {}
    return copy.deepcopy(oauth)


def oauth_registry_entry(entry_or_toolkit_id: str) -> Dict[str, Any]:
    entry = registry_entry_from_any_id(entry_or_toolkit_id)
    if not oauth_recipe_for_entry(entry):
        raise KeyError(str(entry_or_toolkit_id or "").strip())
    return entry


def oauth_registry_entries() -> List[Dict[str, Any]]:
    return [
        copy.deepcopy(entry)
        for entry in INSTALLABLE_MCP_REGISTRY.values()
        if oauth_recipe_for_entry(entry)
    ]
