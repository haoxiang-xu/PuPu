from __future__ import annotations

import copy
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Callable, Dict, List

import mcp_registry
from mcp_managed_runtime import (
    McpManagedRuntimeError,
    resolve_managed_stdio_runtime,
)
from mcp_registry import oauth_recipe_for_entry
from mcp_secrets import (
    delete_mcp_secret_values,
    get_mcp_secret_values,
    save_mcp_secret_values,
)
from mcp_oauth import (
    delete_mcp_oauth_token,
    get_mcp_oauth_status,
    get_valid_mcp_oauth_access_token,
    McpOAuthError,
)


class McpToolkitError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


MCP_TOOLKITS_FILENAME = "mcp_toolkits.json"

INSTALLABLE_MCP_REGISTRY = mcp_registry.INSTALLABLE_MCP_REGISTRY


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


def _registry_entry(
    entry_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    try:
        return mcp_registry.registry_entry(entry_id)
    except KeyError:
        try:
            from mcp_external_registries import (
                approved_external_registry_entry,
                external_entry_exists,
            )

            try:
                return approved_external_registry_entry(entry_id, data_dir=data_dir)
            except Exception as approval_exc:
                if getattr(approval_exc, "code", "") not in {
                    "mcp_registry_entry_not_approved",
                    "mcp_registry_approval_stale",
                    "mcp_registry_not_found",
                }:
                    raise

            if external_entry_exists(entry_id, data_dir=data_dir):
                raise McpToolkitError(
                    "mcp_registry_entry_untrusted",
                    "This external MCP registry entry requires review before installation",
                    403,
                )
        except McpToolkitError:
            raise
        except Exception:
            pass
        raise McpToolkitError(
            "unsupported_mcp_entry",
            "This MCP entry is not supported by the registry",
            400,
        )


def _invalid_custom(message: str) -> McpToolkitError:
    return McpToolkitError("invalid_custom_mcp_recipe", message, 400)


CUSTOM_SECRET_KEY_RE = re.compile(r"^[A-Z_][A-Z0-9_]*$")


def _custom_entry(custom_recipe: Dict[str, Any] | None) -> Dict[str, Any]:
    if not isinstance(custom_recipe, dict):
        raise _invalid_custom("custom recipe is required")

    toolkit_id = str(custom_recipe.get("toolkit_id") or "").strip()
    if not toolkit_id.startswith("mcp.custom."):
        raise _invalid_custom("custom toolkit_id must start with mcp.custom.")

    toolkit_name = str(custom_recipe.get("toolkit_name") or "").strip()
    if not toolkit_name:
        raise _invalid_custom("custom toolkit_name is required")

    raw_mcp = custom_recipe.get("mcp")
    if not isinstance(raw_mcp, dict):
        raise _invalid_custom("mcp config is required")

    transport = str(raw_mcp.get("transport") or "").strip()
    if transport not in {"stdio", "http"}:
        raise _invalid_custom("transport must be stdio or http")

    if transport == "stdio":
        command = str(raw_mcp.get("command") or "").strip()
        if not command:
            raise _invalid_custom("stdio command is required")
        raw_args = raw_mcp.get("args") or []
        if not isinstance(raw_args, list):
            raise _invalid_custom("stdio args must be a list")
        mcp = {
            "transport": "stdio",
            "command": command,
            "args": [str(arg) for arg in raw_args],
        }
    else:
        url = str(raw_mcp.get("url") or "").strip()
        if not (url.startswith("https://") or url.startswith("http://")):
            raise _invalid_custom("http url must start with http:// or https://")
        if raw_mcp.get("headers"):
            raise _invalid_custom("custom http headers are not supported yet")
        mcp = {
            "transport": "http",
            "runtime_transport": "streamable_http",
            "url": url,
            "headers": [],
        }

    secrets: List[Dict[str, str]] = []
    raw_secrets = custom_recipe.get("secrets") or []
    if raw_secrets:
        if not isinstance(raw_secrets, list):
            raise _invalid_custom("secrets must be a list")
        if transport != "stdio":
            raise _invalid_custom("custom secrets are supported only for stdio env")
        seen_secret_keys = set()
        for raw_secret in raw_secrets:
            if not isinstance(raw_secret, dict):
                raise _invalid_custom("secret entries must be objects")
            key = str(raw_secret.get("key") or "").strip()
            if not CUSTOM_SECRET_KEY_RE.match(key):
                raise _invalid_custom("secret keys must be uppercase env names")
            if key in seen_secret_keys:
                continue
            seen_secret_keys.add(key)
            secrets.append({"key": key, "label": str(raw_secret.get("label") or key).strip() or key})

    sanitized_recipe = {
        "toolkit_id": toolkit_id,
        "toolkit_name": toolkit_name,
        "toolkit_description": str(
            custom_recipe.get("toolkit_description")
            or custom_recipe.get("description")
            or "Custom MCP toolkit"
        ).strip(),
        "mcp": copy.deepcopy(mcp),
    }
    if secrets:
        sanitized_recipe["secrets"] = copy.deepcopy(secrets)
    return {
        "entry_id": "custom",
        "toolkit_id": toolkit_id,
        "toolkit_name": toolkit_name,
        "toolkit_description": sanitized_recipe["toolkit_description"],
        "toolkit_icon": {
            "type": "builtin",
            "name": "server",
            "color": "#374151",
            "backgroundColor": "#f3f4f6",
        },
        "license": "custom",
        "source_repo": "",
        "docs_url": "",
        "readme_markdown": "## Custom MCP\n\nUser-provided MCP recipe.",
        "custom_recipe": sanitized_recipe,
        "secrets": copy.deepcopy(secrets),
        "mcp": mcp,
    }


def _entry_for_record(record: Dict[str, Any]) -> Dict[str, Any]:
    if record.get("entry_id") == "custom":
        return _custom_entry(record.get("custom_recipe"))
    if isinstance(record.get("external_entry_snapshot"), dict):
        return copy.deepcopy(record["external_entry_snapshot"])
    return _registry_entry(record.get("entry_id", ""))


def _secret_keys(entry: Dict[str, Any]) -> List[str]:
    keys: List[str] = []
    for spec in entry.get("secrets") or []:
        if not isinstance(spec, dict):
            continue
        key = str(spec.get("key") or "").strip()
        if key:
            keys.append(key)
    return keys


def _resolve_secret_values(
    entry: Dict[str, Any],
    *,
    secrets: Dict[str, Any] | None = None,
    data_dir: str | Path | None = None,
) -> Dict[str, str]:
    keys = _secret_keys(entry)
    if not keys:
        return {}

    supplied = {
        str(key): str(value).strip()
        for key, value in (secrets or {}).items()
        if str(key).strip() and str(value).strip()
    }
    stored = get_mcp_secret_values(entry["toolkit_id"], keys, data_dir=data_dir)
    env: Dict[str, str] = {}
    for key in keys:
        value = supplied.get(key) or stored.get(key, "")
        if not value:
            raise McpToolkitError(
                "mcp_secret_required",
                f"{key} is required to install this MCP toolkit",
                400,
            )
        env[key] = value
    return env


def _resolve_secret_env(
    entry: Dict[str, Any],
    *,
    secrets: Dict[str, Any] | None = None,
    data_dir: str | Path | None = None,
) -> Dict[str, str]:
    return _resolve_secret_values(entry, secrets=secrets, data_dir=data_dir)


def _headers_from_templates(
    templates: List[Dict[str, Any]],
    secret_values: Dict[str, str],
) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    for template in templates:
        name = str(template.get("name") or "").strip()
        if not name:
            continue
        secret_key = str(
            template.get("value_from_secret") or template.get("secret") or ""
        ).strip()
        if secret_key:
            headers[name] = (
                str(template.get("prefix") or "")
                + str(secret_values.get(secret_key) or "")
                + str(template.get("suffix") or "")
            )
        else:
            headers[name] = str(template.get("value") or "")
    return {key: value for key, value in headers.items() if value}


def _resolve_headers(
    mcp: Dict[str, Any],
    secret_values: Dict[str, str],
) -> tuple[Dict[str, str], List[Dict[str, Any]]]:
    raw_headers = mcp.get("headers") or []
    if isinstance(raw_headers, dict):
        templates = [
            {"name": str(name), "value": str(value)}
            for name, value in raw_headers.items()
            if str(name).strip() and str(value).strip()
        ]
        return _headers_from_templates(templates, secret_values), templates

    templates: List[Dict[str, Any]] = []
    for raw in raw_headers:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("name") or "").strip()
        if not name:
            continue
        template = {"name": name}
        secret_key = str(
            raw.get("value_from_secret") or raw.get("secret") or ""
        ).strip()
        if secret_key:
            template["value_from_secret"] = secret_key
            if raw.get("prefix"):
                template["prefix"] = str(raw.get("prefix") or "")
            if raw.get("suffix"):
                template["suffix"] = str(raw.get("suffix") or "")
        else:
            template["value"] = str(raw.get("value") or "")
        templates.append(template)
    return _headers_from_templates(templates, secret_values), templates


def _workspace_meta(entry_or_record: Dict[str, Any]) -> Dict[str, Any]:
    workspace = entry_or_record.get("workspace")
    workspace = workspace if isinstance(workspace, dict) else {}
    return {
        "required": bool(
            workspace.get("required")
            or entry_or_record.get("requires_workspace")
            or entry_or_record.get("requiresWorkspace")
        ),
        "placeholder": str(
            workspace.get("placeholder")
            or entry_or_record.get("workspace_placeholder")
            or entry_or_record.get("workspacePlaceholder")
            or ""
        ),
        "binding": str(
            workspace.get("binding")
            or entry_or_record.get("workspace_binding")
            or entry_or_record.get("workspaceBinding")
            or ""
        ),
    }


def _workspace_meta_for_frontend(record: Dict[str, Any]) -> Dict[str, Any]:
    meta = _workspace_meta(record)
    if meta["required"] or meta["placeholder"] or meta["binding"]:
        return meta
    try:
        return _workspace_meta(_entry_for_record(record))
    except Exception:
        return meta


def _resolve_mcp_config(
    entry: Dict[str, Any],
    workspace_root: str = "",
    *,
    secrets: Dict[str, Any] | None = None,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    mcp = copy.deepcopy(entry.get("mcp") or {})
    transport = str(mcp.get("transport") or "").strip()
    if transport not in {"stdio", "http"}:
        raise McpToolkitError(
            "unsupported_mcp_entry",
            "This MCP transport is not installable yet",
            400,
        )

    oauth = oauth_recipe_for_entry(entry)
    if oauth:
        if transport != "http":
            raise McpToolkitError(
                "unsupported_mcp_entry",
                "OAuth MCP entries must use HTTP transport",
                400,
            )
        try:
            access_token = get_valid_mcp_oauth_access_token(
                entry["toolkit_id"],
                data_dir=data_dir,
            )
            return {
                "transport": str(mcp.get("runtime_transport") or oauth.get("transport") or "streamable_http"),
                "url": str(mcp.get("url") or oauth.get("mcpUrl") or "").strip(),
                "headers": {"Authorization": f"Bearer {access_token}"},
                "header_templates": [],
                "secret_keys": [],
                "secret_values": {},
                "workspace_root": "",
                "auth_type": "oauth",
                "auth_provider": str(oauth.get("provider") or entry.get("auth_provider") or ""),
            }
        except McpOAuthError as exc:
            if exc.code == "mcp_oauth_required" and _secret_keys(entry):
                pass
            else:
                raise McpToolkitError(exc.code, str(exc), exc.status) from exc

    if entry.get("requires_oauth") and not _secret_keys(entry):
        try:
            get_valid_mcp_oauth_access_token(entry["toolkit_id"], data_dir=data_dir)
        except McpOAuthError as exc:
            raise McpToolkitError(exc.code, str(exc), exc.status) from exc

    secret_values = _resolve_secret_values(entry, secrets=secrets, data_dir=data_dir)

    if transport == "http":
        headers, header_templates = _resolve_headers(mcp, secret_values)
        return {
            "transport": str(mcp.get("runtime_transport") or "streamable_http"),
            "url": str(mcp.get("url") or "").strip(),
            "headers": headers,
            "header_templates": header_templates,
            "secret_keys": _secret_keys(entry),
            "secret_values": secret_values,
            "workspace_root": "",
        }

    raw_args = [str(arg) for arg in mcp.get("args") or []]
    workspace_meta = _workspace_meta(entry)
    workspace_placeholder = workspace_meta["placeholder"]
    uses_workspace = workspace_meta["required"] or (
        bool(workspace_placeholder)
        and any(workspace_placeholder in arg for arg in raw_args)
    )
    resolved_workspace = str(workspace_root or "").strip() if uses_workspace else ""
    if uses_workspace and not resolved_workspace:
        raise McpToolkitError(
            "mcp_workspace_required",
            "This MCP toolkit requires an agent workspace root",
            400,
        )

    args: List[str] = []
    for text in raw_args:
        if workspace_placeholder and workspace_placeholder in text:
            text = text.replace(workspace_placeholder, resolved_workspace)
        args.append(text)

    command = str(mcp.get("command") or "").strip()
    env = dict(secret_values)
    try:
        managed = resolve_managed_stdio_runtime(
            command,
            env,
            data_dir=data_dir,
        )
    except McpManagedRuntimeError as exc:
        raise McpToolkitError(exc.code, str(exc), exc.status) from exc

    managed_env = dict(managed.get("managed_env") or {})
    env = {
        **env,
        **managed_env,
    }

    return {
        "transport": "stdio",
        "command": str(managed.get("command") or command).strip(),
        "args": args,
        "env": env,
        "secret_keys": _secret_keys(entry),
        "secret_values": secret_values,
        "workspace_root": resolved_workspace,
        "requires_workspace": workspace_meta["required"],
        "workspace_placeholder": workspace_meta["placeholder"],
        "workspace_binding": workspace_meta["binding"],
        "managed_env": managed_env,
        "managed_runtime": dict(managed.get("managed_runtime") or {}),
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
    transport = str(resolved_config.get("transport") or "stdio")
    if transport == "stdio":
        toolkit = factory(
            command=resolved_config["command"],
            args=list(resolved_config.get("args") or []),
            env=dict(resolved_config.get("env") or {}),
            transport="stdio",
        )
    elif transport == "streamable_http":
        toolkit = factory(
            url=str(resolved_config.get("url") or ""),
            headers=dict(resolved_config.get("headers") or {}),
            transport="streamable_http",
        )
    else:
        raise McpToolkitError(
            "unsupported_mcp_entry",
            f"Unsupported MCP runtime transport: {transport}",
            400,
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


def _record_to_frontend(
    record: Dict[str, Any],
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    secret_keys = [str(key) for key in record.get("secret_keys", []) or [] if str(key).strip()]
    secret_values = get_mcp_secret_values(
        record.get("toolkit_id", ""),
        secret_keys,
        data_dir=data_dir,
    )
    policy = {
        "reviewed": True,
        "defaultEnabledTools": 0,
        "confirmationRequiredTools": sum(
            1 for t in record.get("tools", []) if t.get("requiresConfirmation")
        ),
    }
    auth_type = str(record.get("auth_type") or "")
    oauth_status = None
    if auth_type == "oauth":
        oauth_status = get_mcp_oauth_status(record.get("toolkit_id", ""), data_dir=data_dir)
    workspace_meta = _workspace_meta_for_frontend(record)

    frontend = {
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
        "requiresWorkspace": workspace_meta["required"],
        "workspaceBinding": workspace_meta["binding"],
        "workspacePlaceholder": workspace_meta["placeholder"],
        "secretKeys": secret_keys,
        "secretStatus": [
            {"key": key, "configured": bool(secret_values.get(key))}
            for key in secret_keys
        ],
        "requiresSecrets": bool(secret_keys),
        "customRecipe": copy.deepcopy(record.get("custom_recipe") or {}),
        "policySummary": policy,
    }
    if oauth_status:
        frontend.update(
            {
                "authType": "oauth",
                "authProvider": oauth_status.get("authProvider", record.get("auth_provider", "")),
                "authStatus": oauth_status.get("authStatus", "unknown"),
                "authExpiresAt": oauth_status.get("authExpiresAt", 0),
                "authLastCheckedAt": oauth_status.get("authLastCheckedAt", 0),
            }
        )
    return frontend


def _record_from_entry(
    entry: Dict[str, Any],
    resolved_config: Dict[str, Any],
    tools: List[Dict[str, Any]],
    *,
    now: float,
    status: str = "available",
    last_error: str = "",
) -> Dict[str, Any]:
    workspace_meta = _workspace_meta(entry)
    record = {
        "entry_id": entry["entry_id"],
        "toolkit_id": entry["toolkit_id"],
        "toolkit_name": entry["toolkit_name"],
        "toolkit_description": entry["toolkit_description"],
        "toolkit_icon": entry["toolkit_icon"],
        "license": entry.get("license", ""),
        "source_repo": entry.get("source_repo", ""),
        "docs_url": entry.get("docs_url", ""),
        "readme_markdown": entry.get("readme_markdown", ""),
        "transport": resolved_config.get("transport", "stdio"),
        "secret_keys": list(resolved_config.get("secret_keys") or []),
        "workspace_root": resolved_config.get("workspace_root", ""),
        "requires_workspace": workspace_meta["required"],
        "workspace_binding": workspace_meta["binding"],
        "workspace_placeholder": workspace_meta["placeholder"],
        "tools": tools,
        "status": status,
        "last_error": last_error,
        "last_checked_at": now,
    }
    if record["transport"] == "stdio":
        record["command"] = resolved_config["command"]
        record["args"] = list(resolved_config.get("args") or [])
        if resolved_config.get("managed_env"):
            record["managed_env"] = dict(resolved_config.get("managed_env") or {})
        if resolved_config.get("managed_runtime"):
            record["managed_runtime"] = dict(resolved_config.get("managed_runtime") or {})
    else:
        record["url"] = resolved_config.get("url", "")
        record["header_templates"] = list(resolved_config.get("header_templates") or [])
    if resolved_config.get("auth_type"):
        record["auth_type"] = resolved_config.get("auth_type", "")
        record["auth_provider"] = resolved_config.get("auth_provider", "")
    if entry.get("custom_recipe"):
        record["custom_recipe"] = copy.deepcopy(entry["custom_recipe"])
    if entry.get("source") == "mcp_registry" or entry.get("registry_id"):
        record["external_entry_snapshot"] = copy.deepcopy(entry)
    return record


def list_installed_mcp_toolkits(
    data_dir: str | Path | None = None,
) -> List[Dict[str, Any]]:
    store = _read_store(data_dir)
    return [_record_to_frontend(record, data_dir) for record in store["toolkits"]]


def get_installed_mcp_toolkit(
    toolkit_id: str,
    data_dir: str | Path | None = None,
) -> Dict[str, Any] | None:
    normalized = str(toolkit_id or "").strip()
    for record in _read_store(data_dir)["toolkits"]:
        if record.get("toolkit_id") == normalized:
            return _record_to_frontend(record, data_dir)
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
    secrets: Dict[str, Any] | None = None,
    custom_recipe: Dict[str, Any] | None = None,
    data_dir: str | Path | None = None,
    toolkit_factory: Callable[..., Any] | None = None,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    normalized_entry_id = str(entry_id or "").strip()
    entry = (
        _custom_entry(custom_recipe)
        if normalized_entry_id == "custom"
        else _registry_entry(normalized_entry_id, data_dir=data_dir)
    )
    toolkit_id = entry["toolkit_id"]
    store = _read_store(data_dir)
    if any(record.get("toolkit_id") == toolkit_id for record in store["toolkits"]):
        raise McpToolkitError("mcp_already_installed", "MCP toolkit is already installed", 409)

    resolved_config = _resolve_mcp_config(
        entry,
        workspace_root,
        secrets=secrets,
        data_dir=data_dir,
    )
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
    if resolved_config.get("secret_keys"):
        save_mcp_secret_values(
            toolkit_id,
            {
                key: resolved_config["secret_values"][key]
                for key in resolved_config.get("secret_keys", [])
            },
            data_dir=data_dir,
        )
    _write_store(store, data_dir)
    return {"toolkit": _record_to_frontend(record, data_dir)}


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
    delete_mcp_secret_values(normalized, data_dir=data_dir)
    try:
        delete_mcp_oauth_token(normalized, data_dir=data_dir)
    except Exception:
        pass
    _write_store(store, data_dir)
    return {"ok": True, "toolkitId": normalized}


def configure_mcp_toolkit(
    toolkit_id: str,
    *,
    workspace_root: str = "",
    secrets: Dict[str, Any] | None = None,
    data_dir: str | Path | None = None,
    toolkit_factory: Callable[..., Any] | None = None,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    normalized = str(toolkit_id or "").strip()
    store = _read_store(data_dir)
    updated = None
    records = []
    for record in store["toolkits"]:
        if record.get("toolkit_id") != normalized:
            records.append(record)
            continue

        entry = _entry_for_record(record)
        resolved_workspace = (
            str(workspace_root or "").strip()
            or str(record.get("workspace_root") or "")
        )
        resolved_config = _resolve_mcp_config(
            entry,
            resolved_workspace,
            secrets=secrets,
            data_dir=data_dir,
        )
        try:
            tools = _discover_tools(resolved_config, toolkit_factory)
        except McpToolkitError:
            raise
        except Exception as exc:
            raise McpToolkitError("mcp_configure_failed", str(exc), 502) from exc

        updated = _record_from_entry(
            entry,
            resolved_config,
            tools,
            now=(now_fn or time.time)(),
        )
        records.append(updated)

    if updated is None:
        raise McpToolkitError("mcp_toolkit_not_found", "MCP toolkit is not installed", 404)

    if updated.get("secret_keys"):
        save_mcp_secret_values(
            normalized,
            {
                key: _resolve_secret_values(
                    _entry_for_record(updated),
                    secrets=secrets,
                    data_dir=data_dir,
                )[key]
                for key in updated.get("secret_keys", [])
            },
            data_dir=data_dir,
        )
    store["toolkits"] = records
    _write_store(store, data_dir)
    return {"toolkit": _record_to_frontend(updated, data_dir)}


def _check_record_health(
    record: Dict[str, Any],
    *,
    workspace_root: str = "",
    data_dir: str | Path | None = None,
    toolkit_factory: Callable[..., Any] | None = None,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    now = (now_fn or time.time)()
    try:
        entry = _entry_for_record(record)
        resolved_workspace = str(workspace_root or "").strip() or str(record.get("workspace_root") or "")
        resolved_config = _resolve_mcp_config(
            entry,
            resolved_workspace,
            data_dir=data_dir,
        )
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
                data_dir=data_dir,
                toolkit_factory=toolkit_factory,
                now_fn=now_fn,
            )
            updated = record
        records.append(record)
    if updated is None:
        raise McpToolkitError("mcp_toolkit_not_found", "MCP toolkit is not installed", 404)
    store["toolkits"] = records
    _write_store(store, data_dir)
    return {"toolkit": _record_to_frontend(updated, data_dir)}


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
            data_dir=data_dir,
            toolkit_factory=toolkit_factory,
            now_fn=now_fn,
        )
        for record in store["toolkits"]
    ]
    store["toolkits"] = updated
    _write_store(store, data_dir)
    toolkits = [_record_to_frontend(record, data_dir) for record in updated]
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
    secret_keys = [str(key) for key in record.get("secret_keys", []) or [] if str(key).strip()]
    secret_values = get_mcp_secret_values(record["toolkit_id"], secret_keys, data_dir=data_dir)
    for key in secret_keys:
        if not secret_values.get(key):
            raise McpToolkitError(
                "mcp_secret_required",
                f"{key} is required to run this MCP toolkit",
                400,
            )
    transport = str(record.get("transport") or "stdio")
    if transport == "stdio":
        env = {
            **secret_values,
            **dict(record.get("managed_env") or {}),
        }
        toolkit = factory(
            command=str(record.get("command") or ""),
            args=list(record.get("args") or []),
            env=env,
            transport="stdio",
        )
    elif transport == "streamable_http":
        headers = _headers_from_templates(
            list(record.get("header_templates") or []),
            secret_values,
        )
        if record.get("auth_type") == "oauth":
            headers["Authorization"] = (
                "Bearer "
                + get_valid_mcp_oauth_access_token(
                    record["toolkit_id"],
                    data_dir=data_dir,
                )
            )
        toolkit = factory(
            url=str(record.get("url") or ""),
            headers=headers,
            transport="streamable_http",
        )
    else:
        raise McpToolkitError(
            "unsupported_mcp_entry",
            f"Unsupported MCP runtime transport: {transport}",
            400,
        )
    return toolkit.connect()
