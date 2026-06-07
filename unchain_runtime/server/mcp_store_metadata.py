from __future__ import annotations

import base64
import copy
import json
import os
import time
from pathlib import Path
from typing import Any, Callable, Dict, List
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import mcp_registry


class McpStoreMetadataError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


MCP_STORE_METADATA_FILENAME = "mcp_store_metadata_cache.json"
DEFAULT_CACHE_TTL_MS = 86400000
HTTP_TIMEOUT_SECONDS = 8
MAX_ICON_BYTES = 262144
ALLOWED_ICON_MIME = {"image/png", "image/jpeg", "image/svg+xml"}


def _data_dir(data_dir: str | Path | None = None) -> Path:
    if data_dir is not None:
        return Path(data_dir)
    raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    return Path(raw) if raw else Path.home() / ".pupu"


def _store_path(data_dir: str | Path | None = None) -> Path:
    return _data_dir(data_dir) / MCP_STORE_METADATA_FILENAME


def _empty_store() -> Dict[str, Any]:
    return {"version": 1, "entries": {}}


def _read_store(data_dir: str | Path | None = None) -> Dict[str, Any]:
    path = _store_path(data_dir)
    if not path.exists():
        return _empty_store()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return _empty_store()
    if not isinstance(raw, dict) or not isinstance(raw.get("entries"), dict):
        return _empty_store()
    return {"version": 1, "entries": raw["entries"]}


def _write_store(store: Dict[str, Any], data_dir: str | Path | None = None) -> None:
    path = _store_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2, sort_keys=True), encoding="utf-8")


def _require_https_url(url: str, *, code: str = "mcp_metadata_recipe_invalid") -> str:
    clean = str(url or "").strip()
    parsed = urlparse(clean)
    if parsed.scheme != "https" or not parsed.netloc:
        raise McpStoreMetadataError(
            code,
            "MCP metadata fetch URLs must use https",
            400,
        )
    return clean


def _get_path(payload: Any, selector: str) -> Any:
    current = payload
    for part in str(selector or "").split("."):
        if not part:
            return None
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        return None
    return current


def _normalize_metadata_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return copy.deepcopy(value)


def _extract_fields(payload: Dict[str, Any], fields: Dict[str, str]) -> Dict[str, Any]:
    extracted: Dict[str, Any] = {}
    for output_key, selector in fields.items():
        value = _normalize_metadata_value(_get_path(payload, selector))
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        extracted[str(output_key)] = value
    return extracted


def _default_http_json_fetcher(
    url: str,
    headers: Dict[str, str],
    timeout: int,
) -> Dict[str, Any]:
    _require_https_url(url, code="mcp_metadata_fetch_failed")
    request = Request(url, headers=headers or {}, method="GET")
    with urlopen(request, timeout=timeout) as response:
        raw = response.read()
    parsed = json.loads(raw.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise RuntimeError("metadata response must be a JSON object")
    return parsed


def _default_icon_fetcher(
    url: str,
    timeout: int,
    max_bytes: int,
) -> Dict[str, Any]:
    _require_https_url(url, code="mcp_metadata_fetch_failed")
    request = Request(url, method="GET")
    with urlopen(request, timeout=timeout) as response:
        content = response.read(max_bytes + 1)
        mime_type = str(response.headers.get_content_type() or "").strip()
    if len(content) > max_bytes:
        raise RuntimeError("icon payload is too large")
    return {"content": content, "mime_type": mime_type}


def _file_icon_payload(icon_response: Dict[str, Any] | None) -> Dict[str, str]:
    if not isinstance(icon_response, dict):
        return {}
    mime_type = str(
        icon_response.get("mime_type")
        or icon_response.get("mimeType")
        or ""
    ).strip()
    if mime_type not in ALLOWED_ICON_MIME:
        return {}
    content = icon_response.get("content")
    if isinstance(content, str):
        raw = content.encode("utf-8")
    elif isinstance(content, bytes):
        raw = content
    else:
        return {}
    if len(raw) > MAX_ICON_BYTES:
        return {}
    if mime_type == "image/svg+xml":
        try:
            encoded_content = raw.decode("utf-8")
        except UnicodeDecodeError:
            return {}
    else:
        encoded_content = base64.b64encode(raw).decode("ascii")
    return {
        "type": "file",
        "mimeType": mime_type,
        "content": encoded_content,
    }


def _metadata_recipe(entry: Dict[str, Any]) -> Dict[str, Any]:
    recipe = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    if not recipe:
        raise McpStoreMetadataError(
            "mcp_metadata_not_found",
            "MCP metadata recipe not found",
            404,
        )
    if recipe.get("type") != "http_json":
        raise McpStoreMetadataError(
            "mcp_metadata_recipe_invalid",
            "MCP metadata recipe type is invalid",
            400,
        )
    request = recipe.get("request") if isinstance(recipe.get("request"), dict) else {}
    _require_https_url(request.get("url"))
    return recipe


def _entry_from_id(entry_id: str) -> Dict[str, Any]:
    try:
        return mcp_registry.registry_entry(entry_id)
    except KeyError as exc:
        raise McpStoreMetadataError(
            "mcp_metadata_not_found",
            "MCP metadata entry not found",
            404,
        ) from exc


def _entries_with_metadata(entry_id: str | None = None) -> List[Dict[str, Any]]:
    if entry_id:
        entry = _entry_from_id(entry_id)
        _metadata_recipe(entry)
        return [entry]
    entries: List[Dict[str, Any]] = []
    for entry in mcp_registry.INSTALLABLE_MCP_REGISTRY.values():
        recipe = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
        if recipe:
            entries.append(copy.deepcopy(entry))
    return entries


def _frontend_record(record: Dict[str, Any], *, now: float | None = None) -> Dict[str, Any]:
    now_value = time.time() if now is None else now
    expires_at = float(record.get("expires_at") or 0)
    last_error = str(record.get("last_error") or "")
    status = str(record.get("status") or "")
    if not status:
        status = "error" if last_error else ("cached" if expires_at >= now_value else "stale")
    return {
        "entryId": record.get("entry_id", ""),
        "toolkitId": record.get("toolkit_id", ""),
        "metadata": copy.deepcopy(record.get("metadata") or {}),
        "icon": copy.deepcopy(record.get("icon") or {}),
        "iconPolicy": record.get("icon_policy") or "fallback",
        "lastFetchedAt": float(record.get("last_fetched_at") or 0),
        "expiresAt": expires_at,
        "lastError": last_error,
        "status": status,
    }


def _payload_from_records(records: List[Dict[str, Any]], *, now: float) -> Dict[str, Any]:
    entries = [_frontend_record(record, now=now) for record in records]
    by_entry_id = {record["entryId"]: record for record in entries if record.get("entryId")}
    return {
        "entries": entries,
        "byEntryId": by_entry_id,
        "count": len(entries),
        "status": "ok",
    }


def list_mcp_store_metadata(
    *,
    data_dir: str | Path | None = None,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    now = (now_fn or time.time)()
    store = _read_store(data_dir)
    valid_entry_ids = set(mcp_registry.INSTALLABLE_MCP_REGISTRY.keys())
    records = [
        record
        for record in store["entries"].values()
        if isinstance(record, dict) and record.get("entry_id") in valid_entry_ids
    ]
    return _payload_from_records(records, now=now)


def _fetch_entry_metadata(
    entry: Dict[str, Any],
    *,
    previous: Dict[str, Any] | None,
    now: float,
    http_json_fetcher: Callable[[str, Dict[str, str], int], Dict[str, Any]],
    icon_fetcher: Callable[[str, int, int], Dict[str, Any]],
) -> Dict[str, Any]:
    recipe = _metadata_recipe(entry)
    request = recipe["request"]
    ttl_ms = int(recipe.get("cacheTtlMs") or DEFAULT_CACHE_TTL_MS)
    try:
        payload = http_json_fetcher(
            request["url"],
            copy.deepcopy(request.get("headers") or {}),
            HTTP_TIMEOUT_SECONDS,
        )
        metadata = _extract_fields(payload, recipe.get("fields") or {})
        icon = {}
        icon_error = ""
        icon_url_path = str((recipe.get("icon") or {}).get("urlPath") or "").strip()
        if icon_url_path:
            icon_url = _get_path(payload, icon_url_path)
            if icon_url:
                try:
                    icon = _file_icon_payload(
                        icon_fetcher(
                            _require_https_url(
                                str(icon_url),
                                code="mcp_metadata_fetch_failed",
                            ),
                            HTTP_TIMEOUT_SECONDS,
                            MAX_ICON_BYTES,
                        )
                    )
                except Exception as exc:
                    icon_error = str(exc)
        return {
            "entry_id": entry["entry_id"],
            "toolkit_id": entry["toolkit_id"],
            "metadata": metadata,
            "icon": icon,
            "icon_policy": recipe.get("iconPolicy") or "fallback",
            "last_fetched_at": now,
            "expires_at": now + (ttl_ms / 1000.0),
            "last_error": icon_error,
            "status": "cached",
        }
    except Exception as exc:
        if isinstance(previous, dict) and previous:
            record = copy.deepcopy(previous)
            record["last_error"] = str(exc)
            record["status"] = "error"
            return record
        return {
            "entry_id": entry["entry_id"],
            "toolkit_id": entry["toolkit_id"],
            "metadata": {},
            "icon": {},
            "icon_policy": recipe.get("iconPolicy") or "fallback",
            "last_fetched_at": 0,
            "expires_at": 0,
            "last_error": str(exc),
            "status": "error",
        }


def reload_mcp_store_metadata(
    *,
    entry_id: str | None = None,
    data_dir: str | Path | None = None,
    now_fn: Callable[[], float] | None = None,
    http_json_fetcher: Callable[[str, Dict[str, str], int], Dict[str, Any]] | None = None,
    icon_fetcher: Callable[[str, int, int], Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    normalized_entry_id = str(entry_id or "").strip()
    entries = _entries_with_metadata(normalized_entry_id or None)
    now = (now_fn or time.time)()
    store = _read_store(data_dir)
    records: List[Dict[str, Any]] = []
    fetch_json = http_json_fetcher or _default_http_json_fetcher
    fetch_icon = icon_fetcher or _default_icon_fetcher
    for entry in entries:
        previous = store["entries"].get(entry["entry_id"])
        record = _fetch_entry_metadata(
            entry,
            previous=previous if isinstance(previous, dict) else None,
            now=now,
            http_json_fetcher=fetch_json,
            icon_fetcher=fetch_icon,
        )
        store["entries"][entry["entry_id"]] = record
        records.append(record)
    _write_store(store, data_dir)
    return _payload_from_records(records, now=now)
