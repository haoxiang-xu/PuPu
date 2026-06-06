from __future__ import annotations

import copy
import json
import os
import time
from pathlib import Path
from typing import Any, Callable, Dict, List


class McpToolkitError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


MCP_TOOLKITS_FILENAME = "mcp_toolkits.json"

INSTALLABLE_MCP_REGISTRY: Dict[str, Dict[str, Any]] = {
    "browser.playwright": {
        "entry_id": "browser.playwright",
        "toolkit_id": "mcp.browser.playwright",
        "toolkit_name": "Playwright Browser",
        "toolkit_description": "Browser automation through the official Playwright MCP server.",
        "toolkit_icon": {
            "type": "builtin",
            "name": "globe",
            "color": "#2563eb",
            "backgroundColor": "#dbeafe",
        },
        "license": "Apache-2.0",
        "source_repo": "https://github.com/microsoft/playwright-mcp",
        "docs_url": "https://github.com/microsoft/playwright-mcp",
        "readme_markdown": (
            "## Playwright Browser\n\n"
            "Drives a real browser over stdio. Installed MCP servers are "
            "validated by starting the server and discovering tools."
        ),
        "mcp": {
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@playwright/mcp@latest"],
        },
    },
    "memory.memory": {
        "entry_id": "memory.memory",
        "toolkit_id": "mcp.memory.memory",
        "toolkit_name": "Memory",
        "toolkit_description": "Persistent knowledge-graph memory via the reference MCP server.",
        "toolkit_icon": {
            "type": "builtin",
            "name": "server",
            "color": "#0d9488",
            "backgroundColor": "#ccfbf1",
        },
        "license": "Apache-2.0 / MIT",
        "source_repo": "https://github.com/modelcontextprotocol/servers",
        "docs_url": "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
        "readme_markdown": (
            "## Memory\n\n"
            "Reference knowledge-graph memory server. Stores entities and "
            "relations the agent can recall across sessions."
        ),
        "mcp": {
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-memory"],
        },
    },
    "workspace.filesystem": {
        "entry_id": "workspace.filesystem",
        "toolkit_id": "mcp.workspace.filesystem",
        "toolkit_name": "Filesystem",
        "toolkit_description": "Read and write files within the current agent workspace.",
        "toolkit_icon": {
            "type": "builtin",
            "name": "folder",
            "color": "#d97706",
            "backgroundColor": "#fef3c7",
        },
        "license": "Apache-2.0 / MIT",
        "source_repo": "https://github.com/modelcontextprotocol/servers",
        "docs_url": "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
        "readme_markdown": (
            "## Filesystem\n\n"
            "Reference MCP server for scoped file access. PuPu resolves "
            "`${WORKSPACE}` to the current agent workspace root."
        ),
        "requires_workspace": True,
        "mcp": {
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "${WORKSPACE}"],
        },
    },
}


def _data_dir(explicit: str | Path | None = None) -> Path:
    if explicit is not None:
        return Path(explicit)
    raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if raw:
        return Path(raw)
    return Path.home() / ".pupu"


def _store_path(data_dir: str | Path | None = None) -> Path:
    return _data_dir(data_dir) / MCP_TOOLKITS_FILENAME


def _empty_store() -> Dict[str, Any]:
    return {"version": 1, "toolkits": []}


def _read_store(data_dir: str | Path | None = None) -> Dict[str, Any]:
    path = _store_path(data_dir)
    if not path.exists():
        return _empty_store()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return _empty_store()
    if not isinstance(raw, dict) or not isinstance(raw.get("toolkits"), list):
        return _empty_store()
    return {"version": 1, "toolkits": [r for r in raw["toolkits"] if isinstance(r, dict)]}


def _write_store(store: Dict[str, Any], data_dir: str | Path | None = None) -> None:
    path = _store_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2, sort_keys=True), encoding="utf-8")


def _registry_entry(entry_id: str) -> Dict[str, Any]:
    entry = INSTALLABLE_MCP_REGISTRY.get(str(entry_id or "").strip())
    if entry is None:
        raise McpToolkitError(
            "unsupported_mcp_entry",
            "This MCP entry is not installable in Phase 2A",
            400,
        )
    return copy.deepcopy(entry)


def _resolve_mcp_config(entry: Dict[str, Any], workspace_root: str = "") -> Dict[str, Any]:
    mcp = copy.deepcopy(entry.get("mcp") or {})
    if mcp.get("transport") != "stdio":
        raise McpToolkitError(
            "unsupported_mcp_entry",
            "Only stdio MCP entries are installable in Phase 2A",
            400,
        )

    raw_args = [str(arg) for arg in mcp.get("args") or []]
    uses_workspace = entry.get("requires_workspace") or any(
        "${WORKSPACE}" in arg for arg in raw_args
    )
    resolved_workspace = str(workspace_root or "").strip() if uses_workspace else ""
    if uses_workspace and not resolved_workspace:
        raise McpToolkitError(
            "mcp_workspace_required",
            "Filesystem MCP requires an agent workspace root",
            400,
        )

    args: List[str] = []
    for text in raw_args:
        if "${WORKSPACE}" in text:
            text = text.replace("${WORKSPACE}", resolved_workspace)
        args.append(text)

    return {
        "transport": "stdio",
        "command": str(mcp.get("command") or "").strip(),
        "args": args,
        "workspace_root": resolved_workspace,
    }


def _default_toolkit_factory():
    from unchain.toolkits import MCPToolkit

    return MCPToolkit


def _tool_to_dict(tool: Any) -> Dict[str, Any]:
    name = str(getattr(tool, "name", "") or "").strip()
    title = str(getattr(tool, "title", "") or "").strip() or name
    description = str(getattr(tool, "description", "") or "").strip()
    requires_confirmation = bool(
        getattr(tool, "requires_confirmation", False)
        or getattr(tool, "requiresConfirmation", False)
    )
    return {
        "name": name,
        "title": title,
        "description": description,
        "requiresConfirmation": requires_confirmation,
    }


def _discover_tools(
    resolved_config: Dict[str, Any],
    toolkit_factory: Callable[..., Any] | None = None,
) -> List[Dict[str, Any]]:
    factory = toolkit_factory or _default_toolkit_factory()
    toolkit = factory(
        command=resolved_config["command"],
        args=list(resolved_config.get("args") or []),
        transport="stdio",
    )
    try:
        toolkit.connect()
        tools = getattr(toolkit, "tools", {}) or {}
        return [
            _tool_to_dict(tool)
            for tool in tools.values()
            if str(getattr(tool, "name", "") or "").strip()
        ]
    finally:
        disconnect = getattr(toolkit, "disconnect", None)
        if callable(disconnect):
            try:
                disconnect()
            except Exception:
                pass


def _record_to_frontend(record: Dict[str, Any]) -> Dict[str, Any]:
    policy = {
        "reviewed": True,
        "defaultEnabledTools": 0,
        "confirmationRequiredTools": sum(
            1 for t in record.get("tools", []) if t.get("requiresConfirmation")
        ),
    }
    return {
        "entryId": record.get("entry_id", ""),
        "toolkitId": record.get("toolkit_id", ""),
        "toolkitName": record.get("toolkit_name", ""),
        "toolkitDescription": record.get("toolkit_description", ""),
        "toolkitIcon": record.get("toolkit_icon", {}),
        "source": "mcp",
        "status": record.get("status", "unknown"),
        "license": record.get("license", ""),
        "sourceRepo": record.get("source_repo", ""),
        "docsUrl": record.get("docs_url", ""),
        "readmeMarkdown": record.get("readme_markdown", ""),
        "tools": list(record.get("tools", []) or []),
        "toolCount": len(record.get("tools", []) or []),
        "lastCheckedAt": record.get("last_checked_at", 0),
        "lastError": record.get("last_error", ""),
        "workspaceRoot": record.get("workspace_root", ""),
        "workspace_root": record.get("workspace_root", ""),
        "policySummary": policy,
    }


def _record_from_entry(
    entry: Dict[str, Any],
    resolved_config: Dict[str, Any],
    tools: List[Dict[str, Any]],
    *,
    now: float,
    status: str = "available",
    last_error: str = "",
) -> Dict[str, Any]:
    return {
        "entry_id": entry["entry_id"],
        "toolkit_id": entry["toolkit_id"],
        "toolkit_name": entry["toolkit_name"],
        "toolkit_description": entry["toolkit_description"],
        "toolkit_icon": entry["toolkit_icon"],
        "license": entry.get("license", ""),
        "source_repo": entry.get("source_repo", ""),
        "docs_url": entry.get("docs_url", ""),
        "readme_markdown": entry.get("readme_markdown", ""),
        "transport": "stdio",
        "command": resolved_config["command"],
        "args": list(resolved_config.get("args") or []),
        "workspace_root": resolved_config.get("workspace_root", ""),
        "tools": tools,
        "status": status,
        "last_error": last_error,
        "last_checked_at": now,
    }


def list_installed_mcp_toolkits(
    data_dir: str | Path | None = None,
) -> List[Dict[str, Any]]:
    store = _read_store(data_dir)
    return [_record_to_frontend(record) for record in store["toolkits"]]


def get_installed_mcp_toolkit(
    toolkit_id: str,
    data_dir: str | Path | None = None,
) -> Dict[str, Any] | None:
    normalized = str(toolkit_id or "").strip()
    for record in _read_store(data_dir)["toolkits"]:
        if record.get("toolkit_id") == normalized:
            return _record_to_frontend(record)
    return None


def _get_installed_record(
    toolkit_id: str,
    data_dir: str | Path | None = None,
) -> Dict[str, Any] | None:
    normalized = str(toolkit_id or "").strip()
    for record in _read_store(data_dir)["toolkits"]:
        if record.get("toolkit_id") == normalized:
            return record
    return None


def install_mcp_toolkit(
    entry_id: str,
    *,
    workspace_root: str = "",
    data_dir: str | Path | None = None,
    toolkit_factory: Callable[..., Any] | None = None,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    entry = _registry_entry(entry_id)
    toolkit_id = entry["toolkit_id"]
    store = _read_store(data_dir)
    if any(record.get("toolkit_id") == toolkit_id for record in store["toolkits"]):
        raise McpToolkitError("mcp_already_installed", "MCP toolkit is already installed", 409)

    resolved_config = _resolve_mcp_config(entry, workspace_root)
    try:
        tools = _discover_tools(resolved_config, toolkit_factory)
    except McpToolkitError:
        raise
    except Exception as exc:
        raise McpToolkitError("mcp_install_failed", str(exc), 502) from exc

    record = _record_from_entry(
        entry,
        resolved_config,
        tools,
        now=(now_fn or time.time)(),
    )
    store["toolkits"].append(record)
    _write_store(store, data_dir)
    return {"toolkit": _record_to_frontend(record)}


def delete_mcp_toolkit(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    normalized = str(toolkit_id or "").strip()
    store = _read_store(data_dir)
    next_records = [
        record for record in store["toolkits"] if record.get("toolkit_id") != normalized
    ]
    if len(next_records) == len(store["toolkits"]):
        raise McpToolkitError("mcp_toolkit_not_found", "MCP toolkit is not installed", 404)
    store["toolkits"] = next_records
    _write_store(store, data_dir)
    return {"ok": True, "toolkitId": normalized}


def _check_record_health(
    record: Dict[str, Any],
    *,
    workspace_root: str = "",
    toolkit_factory: Callable[..., Any] | None = None,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    entry = _registry_entry(record.get("entry_id", ""))
    resolved_workspace = str(workspace_root or "").strip() or str(record.get("workspace_root") or "")
    resolved_config = _resolve_mcp_config(entry, resolved_workspace)
    now = (now_fn or time.time)()
    try:
        tools = _discover_tools(resolved_config, toolkit_factory)
        return _record_from_entry(entry, resolved_config, tools, now=now)
    except Exception as exc:
        failed = dict(record)
        failed["status"] = "error"
        failed["last_error"] = str(exc)
        failed["last_checked_at"] = now
        return failed


def check_mcp_toolkit_health(
    toolkit_id: str,
    *,
    workspace_root: str = "",
    data_dir: str | Path | None = None,
    toolkit_factory: Callable[..., Any] | None = None,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    normalized = str(toolkit_id or "").strip()
    store = _read_store(data_dir)
    updated = None
    records = []
    for record in store["toolkits"]:
        if record.get("toolkit_id") == normalized:
            record = _check_record_health(
                record,
                workspace_root=workspace_root,
                toolkit_factory=toolkit_factory,
                now_fn=now_fn,
            )
            updated = record
        records.append(record)
    if updated is None:
        raise McpToolkitError("mcp_toolkit_not_found", "MCP toolkit is not installed", 404)
    store["toolkits"] = records
    _write_store(store, data_dir)
    return {"toolkit": _record_to_frontend(updated)}


def reload_mcp_toolkits(
    *,
    workspace_root: str = "",
    data_dir: str | Path | None = None,
    toolkit_factory: Callable[..., Any] | None = None,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    store = _read_store(data_dir)
    updated = [
        _check_record_health(
            record,
            workspace_root=workspace_root,
            toolkit_factory=toolkit_factory,
            now_fn=now_fn,
        )
        for record in store["toolkits"]
    ]
    store["toolkits"] = updated
    _write_store(store, data_dir)
    toolkits = [_record_to_frontend(record) for record in updated]
    return {"toolkits": toolkits, "count": len(toolkits)}


def build_mcp_runtime_toolkit(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
    toolkit_factory: Callable[..., Any] | None = None,
) -> Any:
    record = _get_installed_record(toolkit_id, data_dir)
    if record is None:
        raise McpToolkitError("mcp_toolkit_not_found", "MCP toolkit is not installed", 404)
    factory = toolkit_factory or _default_toolkit_factory()
    toolkit = factory(
        command=str(record.get("command") or ""),
        args=list(record.get("args") or []),
        transport="stdio",
    )
    return toolkit.connect()
