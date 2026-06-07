from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable, Dict

from mcp_oauth_apps import get_mcp_oauth_app
from mcp_registry import oauth_recipe_for_entry, oauth_registry_entry


class McpOAuthError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


MCP_OAUTH_TOKENS_FILENAME = "mcp_oauth_tokens.json"
OAUTH_STATE_TTL_SECONDS = 600
TOKEN_REFRESH_SKEW_SECONDS = 60

_PENDING_STATES: Dict[str, Dict[str, Any]] = {}
_PENDING_LOCK = threading.Lock()
_REFRESH_LOCKS: Dict[str, threading.Lock] = {}
_REFRESH_LOCKS_LOCK = threading.Lock()


def _data_dir(data_dir: str | Path | None = None) -> Path:
    if data_dir is not None:
        return Path(data_dir)
    raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    return Path(raw) if raw else Path.home() / ".pupu"


def _store_path(data_dir: str | Path | None = None) -> Path:
    return _data_dir(data_dir) / MCP_OAUTH_TOKENS_FILENAME


def _empty_store() -> Dict[str, Any]:
    return {"version": 1, "toolkits": {}}


def _read_store(data_dir: str | Path | None = None) -> Dict[str, Any]:
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


def _write_store(store: Dict[str, Any], data_dir: str | Path | None = None) -> None:
    path = _store_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2, sort_keys=True), encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def _entry_from_any_id(entry_or_toolkit_id: str) -> Dict[str, Any]:
    try:
        return oauth_registry_entry(entry_or_toolkit_id)
    except KeyError as exc:
        raise McpOAuthError(
            "unsupported_mcp_entry",
            "This MCP entry does not support OAuth setup",
            400,
        ) from exc


def _entry_provider(entry: Dict[str, Any]) -> str:
    return str(oauth_recipe_for_entry(entry).get("provider") or "")


def _entry_mcp_url(entry: Dict[str, Any]) -> str:
    recipe = oauth_recipe_for_entry(entry)
    return str(recipe.get("mcpUrl") or entry.get("mcp", {}).get("url") or "").strip()


def _entry_transport(entry: Dict[str, Any]) -> str:
    recipe = oauth_recipe_for_entry(entry)
    return str(recipe.get("transport") or entry.get("mcp", {}).get("runtime_transport") or "streamable_http")


def _base64_url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _generate_verifier() -> str:
    return secrets.token_urlsafe(32)


def _generate_state() -> str:
    return secrets.token_urlsafe(32)


def _code_challenge(verifier: str) -> str:
    return _base64_url(hashlib.sha256(verifier.encode("ascii")).digest())


def _http_json_response(response) -> Dict[str, Any]:
    raw = response.read().decode("utf-8")
    if not raw:
        return {}
    parsed = json.loads(raw)
    return parsed if isinstance(parsed, dict) else {}


def _default_http_get(url: str) -> Dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "PuPu-MCP-OAuth/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return _http_json_response(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise McpOAuthError(
            "mcp_oauth_start_failed",
            f"OAuth discovery failed: {exc.code} {body[:200]}",
            502,
        ) from exc


def _default_http_post(
    url: str,
    payload: Dict[str, Any] | None = None,
    headers: Dict[str, str] | None = None,
    form: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "PuPu-MCP-OAuth/1.0",
        **(headers or {}),
    }
    if form is not None:
        data = urllib.parse.urlencode(form).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    else:
        data = json.dumps(payload or {}).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")

    request = urllib.request.Request(
        url,
        data=data,
        headers=request_headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return _http_json_response(response)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
        raise McpOAuthError(
            "mcp_oauth_start_failed",
            f"OAuth request failed: {exc.code} {raw[:200]}",
            502,
        ) from exc


def _protected_resource_metadata_url(mcp_url: str) -> str:
    parsed = urllib.parse.urlparse(mcp_url)
    return urllib.parse.urlunparse(
        (parsed.scheme, parsed.netloc, "/.well-known/oauth-protected-resource", "", "", "")
    )


def _authorization_server_metadata_url(auth_server_url: str) -> str:
    parsed = urllib.parse.urlparse(auth_server_url)
    return urllib.parse.urlunparse(
        (parsed.scheme, parsed.netloc, "/.well-known/oauth-authorization-server", "", "", "")
    )


def _discover_oauth_metadata(
    entry: Dict[str, Any],
    *,
    http_get: Callable[[str], Dict[str, Any]],
) -> Dict[str, Any]:
    recipe = oauth_recipe_for_entry(entry)
    explicit_auth = str(recipe.get("authorizationEndpoint") or "").strip()
    explicit_token = str(recipe.get("tokenEndpoint") or "").strip()
    if explicit_auth and explicit_token:
        return {
            "authorization_endpoint": explicit_auth,
            "token_endpoint": explicit_token,
            "registration_endpoint": str(recipe.get("registrationEndpoint") or ""),
            "auth_server": str(recipe.get("authServer") or ""),
        }

    protected_url = str(recipe.get("protectedResourceMetadataUrl") or "").strip()
    if not protected_url:
        protected_url = _protected_resource_metadata_url(_entry_mcp_url(entry))
    protected = http_get(protected_url)
    auth_servers = protected.get("authorization_servers")
    if not isinstance(auth_servers, list) or not auth_servers:
        raise McpOAuthError(
            "mcp_oauth_start_failed",
            "No OAuth authorization server found for MCP resource",
            502,
        )

    auth_server = str(auth_servers[0] or "").strip()
    if not auth_server:
        raise McpOAuthError(
            "mcp_oauth_start_failed",
            "OAuth authorization server metadata is invalid",
            502,
        )

    metadata_url = str(recipe.get("authorizationServerMetadataUrl") or "").strip()
    if not metadata_url:
        metadata_url = _authorization_server_metadata_url(auth_server)
    metadata = http_get(metadata_url)
    if not metadata.get("authorization_endpoint") or not metadata.get("token_endpoint"):
        raise McpOAuthError(
            "mcp_oauth_start_failed",
            "OAuth metadata is missing required endpoints",
            502,
        )
    metadata["auth_server"] = auth_server
    return metadata


def save_mcp_oauth_token(
    toolkit_id: str,
    token: Dict[str, Any],
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    entry = _entry_from_any_id(str(token.get("entry_id") or toolkit_id))
    clean_toolkit_id = str(toolkit_id or "").strip() or entry["toolkit_id"]
    clean_token = {
        "entry_id": entry["entry_id"],
        "auth_provider": _entry_provider(entry),
        "auth_status": str(token.get("auth_status") or "connected"),
        "access_token": str(token.get("access_token") or ""),
        "refresh_token": str(token.get("refresh_token") or ""),
        "expires_at": float(token.get("expires_at") or 0),
        "client_id": str(token.get("client_id") or ""),
        "client_secret": str(token.get("client_secret") or ""),
        "token_endpoint": str(token.get("token_endpoint") or ""),
        "auth_server": str(token.get("auth_server") or ""),
        "last_checked_at": float(token.get("last_checked_at") or 0),
        "last_error": str(token.get("last_error") or ""),
    }
    store = _read_store(data_dir)
    store["toolkits"][clean_toolkit_id] = clean_token
    _write_store(store, data_dir)
    return {"ok": True, "toolkitId": clean_toolkit_id}


def _get_token_record(
    entry_or_toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> tuple[Dict[str, str], Dict[str, Any] | None]:
    entry = _entry_from_any_id(entry_or_toolkit_id)
    store = _read_store(data_dir)
    token = store["toolkits"].get(entry["toolkit_id"])
    return entry, token if isinstance(token, dict) else None


def get_mcp_oauth_status(
    entry_or_toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    entry, token = _get_token_record(entry_or_toolkit_id, data_dir=data_dir)
    now = (now_fn or time.time)()
    status = "missing"
    if token:
        status = str(token.get("auth_status") or "connected")
        expires_at = float(token.get("expires_at") or 0)
        if status == "connected" and expires_at and expires_at <= now:
            status = "expired"

    return {
        "entryId": entry["entry_id"],
        "toolkitId": entry["toolkit_id"],
        "authType": "oauth",
        "authProvider": _entry_provider(entry),
        "authStatus": status,
        "authExpiresAt": float((token or {}).get("expires_at") or 0),
        "authLastCheckedAt": float((token or {}).get("last_checked_at") or 0),
        "lastError": str((token or {}).get("last_error") or ""),
    }


def delete_mcp_oauth_token(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    entry = _entry_from_any_id(toolkit_id)
    store = _read_store(data_dir)
    store["toolkits"].pop(entry["toolkit_id"], None)
    _write_store(store, data_dir)
    return {"ok": True, "toolkitId": entry["toolkit_id"]}


def _refresh_lock(toolkit_id: str) -> threading.Lock:
    with _REFRESH_LOCKS_LOCK:
        if toolkit_id not in _REFRESH_LOCKS:
            _REFRESH_LOCKS[toolkit_id] = threading.Lock()
        return _REFRESH_LOCKS[toolkit_id]


def _mark_oauth_token_expired(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
    last_error: str = "",
) -> None:
    entry, token = _get_token_record(toolkit_id, data_dir=data_dir)
    if not token:
        return
    token["auth_status"] = "expired"
    token["last_error"] = last_error
    save_mcp_oauth_token(entry["toolkit_id"], token, data_dir=data_dir)


def get_valid_mcp_oauth_access_token(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
    http_post: Callable[..., Dict[str, Any]] | None = None,
    now_fn: Callable[[], float] | None = None,
) -> str:
    entry, token = _get_token_record(toolkit_id, data_dir=data_dir)
    if not token or not token.get("access_token"):
        raise McpOAuthError(
            "mcp_oauth_required",
            "This MCP toolkit requires OAuth setup before installation",
            400,
        )

    now = (now_fn or time.time)()
    expires_at = float(token.get("expires_at") or 0)
    if expires_at and expires_at > now + TOKEN_REFRESH_SKEW_SECONDS:
        return str(token.get("access_token") or "")

    refresh_token = str(token.get("refresh_token") or "")
    token_endpoint = str(token.get("token_endpoint") or "")
    client_id = str(token.get("client_id") or "")
    if not refresh_token or not token_endpoint or not client_id:
        _mark_oauth_token_expired(
            entry["toolkit_id"],
            data_dir=data_dir,
            last_error="OAuth refresh token is missing",
        )
        raise McpOAuthError("mcp_oauth_expired", "OAuth authorization expired", 400)

    with _refresh_lock(entry["toolkit_id"]):
        _, latest = _get_token_record(entry["toolkit_id"], data_dir=data_dir)
        if latest:
            latest_expires_at = float(latest.get("expires_at") or 0)
            if latest_expires_at and latest_expires_at > now + TOKEN_REFRESH_SKEW_SECONDS:
                return str(latest.get("access_token") or "")
            token = latest

        form = {
            "grant_type": "refresh_token",
            "refresh_token": str(token.get("refresh_token") or ""),
            "client_id": str(token.get("client_id") or ""),
        }
        if token.get("client_secret"):
            form["client_secret"] = str(token.get("client_secret") or "")

        try:
            response = (http_post or _default_http_post)(
                token_endpoint,
                form=form,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except McpOAuthError:
            raise
        except Exception as exc:
            raise McpOAuthError("mcp_oauth_refresh_failed", str(exc), 502) from exc

        if response.get("error") == "invalid_grant":
            _mark_oauth_token_expired(
                entry["toolkit_id"],
                data_dir=data_dir,
                last_error=str(response.get("error_description") or "OAuth grant expired"),
            )
            raise McpOAuthError("mcp_oauth_expired", "OAuth authorization expired", 400)
        if response.get("error"):
            raise McpOAuthError(
                "mcp_oauth_refresh_failed",
                str(response.get("error_description") or response.get("error")),
                502,
            )

        access_token = str(response.get("access_token") or "")
        if not access_token:
            raise McpOAuthError("mcp_oauth_refresh_failed", "OAuth refresh did not return an access token", 502)

        expires_in = float(response.get("expires_in") or 0)
        updated = dict(token)
        updated.update(
            {
                "access_token": access_token,
                "refresh_token": str(response.get("refresh_token") or token.get("refresh_token") or ""),
                "expires_at": now + expires_in if expires_in else 0,
                "auth_status": "connected",
                "last_checked_at": now,
                "last_error": "",
            }
        )
        save_mcp_oauth_token(entry["toolkit_id"], updated, data_dir=data_dir)
        return access_token


def start_mcp_oauth(
    entry_id: str,
    *,
    callback_base_url: str,
    data_dir: str | Path | None = None,
    http_get: Callable[[str], Dict[str, Any]] | None = None,
    http_post: Callable[..., Dict[str, Any]] | None = None,
    now_fn: Callable[[], float] | None = None,
    state_factory: Callable[[], str] | None = None,
    verifier_factory: Callable[[], str] | None = None,
) -> Dict[str, Any]:
    entry = _entry_from_any_id(entry_id)
    recipe = oauth_recipe_for_entry(entry)
    now = (now_fn or time.time)()
    redirect_uri = str(callback_base_url or "").rstrip("/") + "/mcp/oauth/callback"

    try:
        metadata = _discover_oauth_metadata(
            entry,
            http_get=http_get or _default_http_get,
        )
        client_registration = str(recipe.get("clientRegistration") or "dynamic")
        if client_registration == "dynamic":
            registration_endpoint = str(metadata.get("registration_endpoint") or "")
            if not registration_endpoint:
                raise McpOAuthError(
                    "mcp_oauth_start_failed",
                    "OAuth server does not support dynamic client registration",
                    502,
                )
            client = (http_post or _default_http_post)(
                registration_endpoint,
                payload={
                    "client_name": "PuPu MCP Client",
                    "redirect_uris": [redirect_uri],
                    "grant_types": ["authorization_code", "refresh_token"],
                    "response_types": ["code"],
                    "token_endpoint_auth_method": "none",
                },
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
        elif client_registration == "user_credentials":
            app = get_mcp_oauth_app(entry["toolkit_id"], data_dir=data_dir)
            if not app or not app.get("client_id") or not app.get("client_secret"):
                raise McpOAuthError(
                    "mcp_oauth_app_required",
                    "OAuth app credentials are required before connecting this MCP toolkit",
                    400,
                )
            client = {
                "client_id": str(app.get("client_id") or ""),
                "client_secret": str(app.get("client_secret") or ""),
                "scopes": list(app.get("scopes") or recipe.get("scopes") or []),
            }
        else:
            raise McpOAuthError(
                "mcp_oauth_provider_unsupported",
                f"Unsupported OAuth client registration mode: {client_registration}",
                400,
            )
        client_id = str(client.get("client_id") or "")
        if not client_id:
            raise McpOAuthError("mcp_oauth_start_failed", "OAuth registration did not return a client_id", 502)
    except McpOAuthError:
        raise
    except Exception as exc:
        raise McpOAuthError("mcp_oauth_start_failed", str(exc), 502) from exc

    state = (state_factory or _generate_state)()
    verifier = (verifier_factory or _generate_verifier)()
    expires_at = now + OAUTH_STATE_TTL_SECONDS
    with _PENDING_LOCK:
        _PENDING_STATES[state] = {
            "entry_id": entry["entry_id"],
            "toolkit_id": entry["toolkit_id"],
            "provider": _entry_provider(entry),
            "code_verifier": verifier,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "client_secret": str(client.get("client_secret") or ""),
            "token_endpoint": str(metadata.get("token_endpoint") or ""),
            "authorization_endpoint": str(metadata.get("authorization_endpoint") or ""),
            "auth_server": str(metadata.get("auth_server") or metadata.get("issuer") or ""),
            "token_request": dict(recipe.get("tokenRequest") or {}),
            "expires_at": expires_at,
        }

    query = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "code_challenge": _code_challenge(verifier),
        "code_challenge_method": "S256",
    }
    scopes = list(client.get("scopes") or recipe.get("scopes") or [])
    if scopes:
        query["scope"] = " ".join(str(scope).strip() for scope in scopes if str(scope).strip())
    query.update(
        {
            str(key): str(value)
            for key, value in (recipe.get("authUrlParams") or {}).items()
            if str(key).strip() and str(value).strip()
        }
    )
    auth_url = (
        str(metadata.get("authorization_endpoint") or "")
        + "?"
        + urllib.parse.urlencode(query)
    )
    return {
        "entryId": entry["entry_id"],
        "toolkitId": entry["toolkit_id"],
        "authUrl": auth_url,
        "state": state,
        "expiresAt": expires_at,
    }


def _default_install(entry_id: str, **kwargs):
    from mcp_toolkits import check_mcp_toolkit_health, install_mcp_toolkit

    try:
        return install_mcp_toolkit(entry_id, **kwargs)
    except Exception as exc:
        if getattr(exc, "code", "") == "mcp_already_installed":
            entry = _entry_from_any_id(entry_id)
            return check_mcp_toolkit_health(
                entry["toolkit_id"],
                data_dir=kwargs.get("data_dir"),
                toolkit_factory=kwargs.get("toolkit_factory"),
            )
        raise


def handle_mcp_oauth_callback(
    code: str,
    state: str,
    *,
    error: str = "",
    error_description: str = "",
    data_dir: str | Path | None = None,
    http_post: Callable[..., Dict[str, Any]] | None = None,
    install_fn: Callable[..., Dict[str, Any]] | None = None,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    if error:
        raise McpOAuthError(
            "mcp_oauth_callback_failed",
            error_description or error,
            400,
        )
    normalized_state = str(state or "").strip()
    with _PENDING_LOCK:
        pending = _PENDING_STATES.pop(normalized_state, None)
    now = (now_fn or time.time)()
    if not pending or float(pending.get("expires_at") or 0) < now:
        raise McpOAuthError("mcp_oauth_state_invalid", "OAuth state is invalid or expired", 400)
    normalized_code = str(code or "").strip()
    if not normalized_code:
        raise McpOAuthError("mcp_oauth_callback_failed", "OAuth callback is missing code", 400)

    form = {
        "grant_type": "authorization_code",
        "code": normalized_code,
        "client_id": pending["client_id"],
        "redirect_uri": pending["redirect_uri"],
        "code_verifier": pending["code_verifier"],
    }
    if pending.get("client_secret"):
        form["client_secret"] = pending["client_secret"]

    try:
        token_response = (http_post or _default_http_post)(
            pending["token_endpoint"],
            form=form,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    except McpOAuthError:
        raise
    except Exception as exc:
        raise McpOAuthError("mcp_oauth_callback_failed", str(exc), 502) from exc

    if token_response.get("error"):
        raise McpOAuthError(
            "mcp_oauth_callback_failed",
            str(token_response.get("error_description") or token_response.get("error")),
            400,
        )
    access_token = str(token_response.get("access_token") or "")
    if not access_token:
        raise McpOAuthError("mcp_oauth_callback_failed", "OAuth token response is missing access_token", 502)

    expires_in = float(token_response.get("expires_in") or 0)
    token_record = {
        "entry_id": pending["entry_id"],
        "auth_provider": pending["provider"],
        "auth_status": "connected",
        "access_token": access_token,
        "refresh_token": str(token_response.get("refresh_token") or ""),
        "expires_at": now + expires_in if expires_in else 0,
        "client_id": pending["client_id"],
        "client_secret": pending.get("client_secret", ""),
        "token_endpoint": pending["token_endpoint"],
        "auth_server": pending.get("auth_server", ""),
        "last_checked_at": now,
        "last_error": "",
    }
    save_mcp_oauth_token(pending["toolkit_id"], token_record, data_dir=data_dir)

    try:
        result = (install_fn or _default_install)(
            pending["entry_id"],
            data_dir=data_dir,
        )
    except Exception:
        delete_mcp_oauth_token(pending["toolkit_id"], data_dir=data_dir)
        raise
    return result


def disconnect_mcp_oauth(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    entry = _entry_from_any_id(toolkit_id)
    try:
        from mcp_toolkits import delete_mcp_toolkit

        delete_mcp_toolkit(entry["toolkit_id"], data_dir=data_dir)
    except Exception as exc:
        if getattr(exc, "code", "") != "mcp_toolkit_not_found":
            raise
        delete_mcp_oauth_token(entry["toolkit_id"], data_dir=data_dir)
    return {"ok": True, "toolkitId": entry["toolkit_id"]}
