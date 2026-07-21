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
OAUTH_ATTEMPT_RETENTION_SECONDS = 300
TOKEN_REFRESH_SKEW_SECONDS = 60

_PENDING_STATES: Dict[str, Dict[str, Any]] = {}
_PENDING_LOCK = threading.Lock()
_COMMIT_LOCKS: Dict[str, Any] = {}
_COMMIT_LOCKS_LOCK = threading.Lock()
_TOKEN_EPOCHS: Dict[str, int] = {}
_REFRESH_LOCKS: Dict[str, threading.Lock] = {}
_REFRESH_LOCKS_LOCK = threading.Lock()
_STORE_LOCKS: Dict[str, Any] = {}
_STORE_LOCKS_LOCK = threading.Lock()


def _data_dir(data_dir: str | Path | None = None) -> Path:
    if data_dir is not None:
        return Path(data_dir)
    raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    return Path(raw) if raw else Path.home() / ".pupu"


def _store_path(data_dir: str | Path | None = None) -> Path:
    return _data_dir(data_dir) / MCP_OAUTH_TOKENS_FILENAME


def _store_scope_key(data_dir: str | Path | None = None) -> str:
    return str(_store_path(data_dir).resolve())


def _store_lock(data_dir: str | Path | None = None):
    key = _store_scope_key(data_dir)
    with _STORE_LOCKS_LOCK:
        if key not in _STORE_LOCKS:
            _STORE_LOCKS[key] = threading.RLock()
        return _STORE_LOCKS[key]


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
    temp_path = path.with_name(
        f".{path.name}.{os.getpid()}.{threading.get_ident()}.{secrets.token_hex(4)}.tmp"
    )
    try:
        temp_path.write_text(
            json.dumps(store, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        try:
            temp_path.chmod(0o600)
        except OSError:
            pass
        os.replace(temp_path, path)
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass


def _entry_from_any_id(
    entry_or_toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    try:
        return oauth_registry_entry(entry_or_toolkit_id)
    except KeyError as exc:
        try:
            from mcp_external_registries import (
                approved_external_registry_entry,
                external_entry_exists,
            )

            approved_external_seen = False
            try:
                entry = approved_external_registry_entry(
                    entry_or_toolkit_id,
                    data_dir=data_dir,
                )
                approved_external_seen = True
                if oauth_recipe_for_entry(entry):
                    return entry
            except Exception as approval_exc:
                if getattr(approval_exc, "code", "") not in {
                    "mcp_registry_entry_not_approved",
                    "mcp_registry_approval_stale",
                    "mcp_registry_not_found",
                }:
                    raise
            if approved_external_seen:
                raise McpOAuthError(
                    "unsupported_mcp_entry",
                    "This MCP entry does not support OAuth setup",
                    400,
                )

            if external_entry_exists(entry_or_toolkit_id, data_dir=data_dir):
                raise McpOAuthError(
                    "mcp_registry_entry_untrusted",
                    "This external MCP registry entry requires review before OAuth setup",
                    403,
                )
        except McpOAuthError:
            raise
        except Exception:
            pass
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
        exc.read()
        raise McpOAuthError(
            "mcp_oauth_start_failed",
            "OAuth discovery request failed",
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
        exc.read()
        raise McpOAuthError(
            "mcp_oauth_start_failed",
            "OAuth provider request failed",
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
    entry = _entry_from_any_id(str(token.get("entry_id") or toolkit_id), data_dir=data_dir)
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
    with _oauth_commit_lock(clean_toolkit_id, data_dir):
        with _store_lock(data_dir):
            store = _read_store(data_dir)
            store["toolkits"][clean_toolkit_id] = clean_token
            _write_store(store, data_dir)
        _bump_token_epoch_locked(clean_toolkit_id, data_dir)
    return {"ok": True, "toolkitId": clean_toolkit_id}


def _get_token_record(
    entry_or_toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> tuple[Dict[str, str], Dict[str, Any] | None]:
    entry = _entry_from_any_id(entry_or_toolkit_id, data_dir=data_dir)
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


def _token_scope_key(
    toolkit_id: str,
    data_dir: str | Path | None = None,
) -> str:
    normalized = str(toolkit_id or "").strip()
    return f"{_store_scope_key(data_dir)}\0{normalized}"


def _oauth_commit_lock(
    toolkit_id: str,
    data_dir: str | Path | None = None,
):
    key = _token_scope_key(toolkit_id, data_dir)
    with _COMMIT_LOCKS_LOCK:
        if key not in _COMMIT_LOCKS:
            _COMMIT_LOCKS[key] = threading.RLock()
        return _COMMIT_LOCKS[key]


def _token_epoch_locked(
    toolkit_id: str,
    data_dir: str | Path | None = None,
) -> int:
    return _TOKEN_EPOCHS.get(_token_scope_key(toolkit_id, data_dir), 0)


def _bump_token_epoch_locked(
    toolkit_id: str,
    data_dir: str | Path | None = None,
) -> int:
    key = _token_scope_key(toolkit_id, data_dir)
    next_epoch = _TOKEN_EPOCHS.get(key, 0) + 1
    _TOKEN_EPOCHS[key] = next_epoch
    return next_epoch


def _scrub_attempt_secrets_locked(attempt: Dict[str, Any]) -> None:
    for key in (
        "client_secret",
        "code_verifier",
        "redirect_uri",
        "token_endpoint",
        "token_request",
    ):
        attempt.pop(key, None)


def _finish_mcp_oauth_attempt(
    pending: Dict[str, Any],
    *,
    status: str,
    message: str = "",
    now: float,
) -> str:
    with _PENDING_LOCK:
        current = _PENDING_STATES.get(str(pending.get("state") or ""))
        if current is not pending:
            return "missing"
        if pending["cancel_event"].is_set() and status != "cancelled":
            status = "cancelled"
            message = "OAuth connection was cancelled"
        pending["auth_status"] = status
        pending["last_error"] = message
        pending["processing"] = False
        pending["purge_at"] = now + OAUTH_ATTEMPT_RETENTION_SECONDS
        _scrub_attempt_secrets_locked(pending)
        return status


def _cleanup_expired_attempts_locked(now: float) -> None:
    for state, attempt in list(_PENDING_STATES.items()):
        purge_at = float(attempt.get("purge_at") or 0)
        if purge_at and purge_at <= now:
            _PENDING_STATES.pop(state, None)
            continue
        if (
            str(attempt.get("auth_status") or "pending") == "pending"
            and not attempt.get("processing")
            and float(attempt.get("expires_at") or 0) <= now
        ):
            attempt["cancel_event"].set()
            attempt["auth_status"] = "expired"
            attempt["last_error"] = "OAuth authorization expired before completion"
            attempt["processing"] = False
            attempt["purge_at"] = now + OAUTH_ATTEMPT_RETENTION_SECONDS
            _scrub_attempt_secrets_locked(attempt)


def get_mcp_oauth_attempt_status(
    state: str,
    *,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    normalized_state = str(state or "").strip()
    if not normalized_state:
        raise McpOAuthError("mcp_oauth_state_invalid", "OAuth state is required", 400)
    now = (now_fn or time.time)()
    with _PENDING_LOCK:
        _cleanup_expired_attempts_locked(now)
        attempt = _PENDING_STATES.get(normalized_state)
        if not attempt:
            raise McpOAuthError(
                "mcp_oauth_state_invalid",
                "OAuth state is invalid or expired",
                404,
            )
        return {
            "entryId": str(attempt.get("entry_id") or ""),
            "toolkitId": str(attempt.get("toolkit_id") or ""),
            "authType": "oauth",
            "authProvider": str(attempt.get("provider") or ""),
            "authStatus": str(attempt.get("auth_status") or "pending"),
            "authExpiresAt": float(attempt.get("expires_at") or 0),
            "authLastCheckedAt": float(attempt.get("last_checked_at") or 0),
            "lastError": str(attempt.get("last_error") or ""),
        }


def _raise_if_attempt_cancelled(pending: Dict[str, Any], *, now: float) -> None:
    if not pending["cancel_event"].is_set():
        return
    _finish_mcp_oauth_attempt(
        pending,
        status="cancelled",
        message="OAuth connection was cancelled",
        now=now,
    )
    raise McpOAuthError(
        "mcp_oauth_cancelled",
        "OAuth connection was cancelled",
        409,
    )


def _token_snapshot(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any] | None:
    normalized = str(toolkit_id or "").strip()
    with _oauth_commit_lock(normalized, data_dir):
        record = _read_store(data_dir)["toolkits"].get(normalized)
        return dict(record) if isinstance(record, dict) else None


def _restore_token_snapshot(
    toolkit_id: str,
    snapshot: Dict[str, Any] | None,
    *,
    data_dir: str | Path | None = None,
) -> None:
    normalized = str(toolkit_id or "").strip()
    with _oauth_commit_lock(normalized, data_dir):
        with _store_lock(data_dir):
            store = _read_store(data_dir)
            if snapshot is None:
                store["toolkits"].pop(normalized, None)
            else:
                store["toolkits"][normalized] = dict(snapshot)
            _write_store(store, data_dir)
        _bump_token_epoch_locked(normalized, data_dir)


def delete_mcp_oauth_token(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    entry = _entry_from_any_id(toolkit_id, data_dir=data_dir)
    normalized = entry["toolkit_id"]
    with _oauth_commit_lock(normalized, data_dir):
        with _store_lock(data_dir):
            store = _read_store(data_dir)
            store["toolkits"].pop(normalized, None)
            _write_store(store, data_dir)
        _bump_token_epoch_locked(normalized, data_dir)
    return {"ok": True, "toolkitId": entry["toolkit_id"]}


def _refresh_lock(
    toolkit_id: str,
    data_dir: str | Path | None = None,
) -> threading.Lock:
    key = _token_scope_key(toolkit_id, data_dir)
    with _REFRESH_LOCKS_LOCK:
        if key not in _REFRESH_LOCKS:
            _REFRESH_LOCKS[key] = threading.Lock()
        return _REFRESH_LOCKS[key]


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


def _superseding_refresh_access_token(
    token: Dict[str, Any] | None,
    *,
    now: float,
) -> str:
    if not token or not token.get("access_token"):
        raise McpOAuthError(
            "mcp_oauth_required",
            "This MCP toolkit requires OAuth setup before installation",
            400,
        )
    status = str(token.get("auth_status") or "connected")
    expires_at = float(token.get("expires_at") or 0)
    if status == "connected" and (not expires_at or expires_at > now):
        return str(token.get("access_token") or "")
    if status == "expired" or (expires_at and expires_at <= now):
        raise McpOAuthError("mcp_oauth_expired", "OAuth authorization expired", 400)
    raise McpOAuthError(
        "mcp_oauth_refresh_superseded",
        "OAuth credentials changed while refresh was in progress",
        409,
    )


def get_valid_mcp_oauth_access_token(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
    http_post: Callable[..., Dict[str, Any]] | None = None,
    now_fn: Callable[[], float] | None = None,
) -> str:
    entry = _entry_from_any_id(toolkit_id, data_dir=data_dir)
    normalized = entry["toolkit_id"]
    now = (now_fn or time.time)()
    commit_lock = _oauth_commit_lock(normalized, data_dir)
    with commit_lock:
        _, current = _get_token_record(normalized, data_dir=data_dir)
        if not current or not current.get("access_token"):
            raise McpOAuthError(
                "mcp_oauth_required",
                "This MCP toolkit requires OAuth setup before installation",
                400,
            )
        current_expires_at = float(current.get("expires_at") or 0)
        if (
            str(current.get("auth_status") or "connected") == "connected"
            and (
                not current_expires_at
                or current_expires_at > now + TOKEN_REFRESH_SKEW_SECONDS
            )
        ):
            return str(current.get("access_token") or "")
    with _refresh_lock(normalized, data_dir):
        with commit_lock:
            _, token = _get_token_record(normalized, data_dir=data_dir)
            if not token or not token.get("access_token"):
                raise McpOAuthError(
                    "mcp_oauth_required",
                    "This MCP toolkit requires OAuth setup before installation",
                    400,
                )
            expires_at = float(token.get("expires_at") or 0)
            if (
                str(token.get("auth_status") or "connected") == "connected"
                and (
                    not expires_at
                    or expires_at > now + TOKEN_REFRESH_SKEW_SECONDS
                )
            ):
                return str(token.get("access_token") or "")
            refresh_token = str(token.get("refresh_token") or "")
            token_endpoint = str(token.get("token_endpoint") or "")
            client_id = str(token.get("client_id") or "")
            if not refresh_token or not token_endpoint or not client_id:
                expired = dict(token)
                expired["auth_status"] = "expired"
                expired["last_error"] = "OAuth refresh token is missing"
                save_mcp_oauth_token(normalized, expired, data_dir=data_dir)
                raise McpOAuthError(
                    "mcp_oauth_expired",
                    "OAuth authorization expired",
                    400,
                )
            token_snapshot = dict(token)
            token_epoch = _token_epoch_locked(normalized, data_dir)
        form = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
        }
        if token.get("client_secret"):
            form["client_secret"] = str(token.get("client_secret") or "")

        try:
            response = (http_post or _default_http_post)(
                token_endpoint,
                form=form,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except Exception as exc:
            raise McpOAuthError(
                "mcp_oauth_refresh_failed",
                "OAuth token refresh failed",
                502,
            ) from exc
        commit_now = (now_fn or time.time)()
        with commit_lock:
            _, latest = _get_token_record(normalized, data_dir=data_dir)
            if (
                _token_epoch_locked(normalized, data_dir) != token_epoch
                or latest != token_snapshot
            ):
                return _superseding_refresh_access_token(
                    latest,
                    now=commit_now,
                )
            if not isinstance(response, dict):
                raise McpOAuthError(
                    "mcp_oauth_refresh_failed",
                    "OAuth token refresh failed",
                    502,
                )
            if response.get("error") == "invalid_grant":
                expired = dict(token_snapshot)
                expired["auth_status"] = "expired"
                expired["last_error"] = "OAuth authorization expired"
                save_mcp_oauth_token(normalized, expired, data_dir=data_dir)
                raise McpOAuthError(
                    "mcp_oauth_expired",
                    "OAuth authorization expired",
                    400,
                )
            if response.get("error"):
                raise McpOAuthError(
                    "mcp_oauth_refresh_failed",
                    "OAuth token refresh failed",
                    502,
                )
            access_token = str(response.get("access_token") or "")
            if not access_token:
                raise McpOAuthError(
                    "mcp_oauth_refresh_failed",
                    "OAuth refresh did not return an access token",
                    502,
                )
            try:
                expires_in = float(response.get("expires_in") or 0)
            except (TypeError, ValueError) as exc:
                raise McpOAuthError(
                    "mcp_oauth_refresh_failed",
                    "OAuth token refresh failed",
                    502,
                ) from exc
            updated = dict(token_snapshot)
            updated.update(
                {
                    "access_token": access_token,
                    "refresh_token": str(
                        response.get("refresh_token")
                        or token_snapshot.get("refresh_token")
                        or ""
                    ),
                    "expires_at": commit_now + expires_in if expires_in else 0,
                    "auth_status": "connected",
                    "last_checked_at": commit_now,
                    "last_error": "",
                }
            )
            save_mcp_oauth_token(normalized, updated, data_dir=data_dir)
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
    entry = _entry_from_any_id(entry_id, data_dir=data_dir)
    recipe = oauth_recipe_for_entry(entry)
    if not str(entry.get("registry_id") or "").strip() and (
        str(entry.get("status") or "") != "available"
        or str(recipe.get("releaseStatus") or "") != "ready"
    ):
        raise McpOAuthError(
            "mcp_oauth_release_unavailable",
            "This MCP OAuth connection is not available in this release",
            403,
        )
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
    except McpOAuthError as exc:
        if exc.code in {
            "mcp_oauth_app_required",
            "mcp_oauth_provider_unsupported",
        }:
            raise
        raise McpOAuthError(
            "mcp_oauth_start_failed",
            "OAuth connection could not be started",
            502,
        ) from exc
    except Exception as exc:
        raise McpOAuthError(
            "mcp_oauth_start_failed",
            "OAuth connection could not be started",
            502,
        ) from exc

    state = str((state_factory or _generate_state)() or "").strip()
    verifier = str((verifier_factory or _generate_verifier)() or "").strip()
    if not state or not verifier:
        raise McpOAuthError(
            "mcp_oauth_start_failed",
            "OAuth connection could not be started",
            502,
        )
    expires_at = now + OAUTH_STATE_TTL_SECONDS
    commit_lock = _oauth_commit_lock(entry["toolkit_id"], data_dir)
    with _PENDING_LOCK:
        _cleanup_expired_attempts_locked(now)
        if state in _PENDING_STATES:
            raise McpOAuthError(
                "mcp_oauth_start_failed",
                "OAuth connection could not be started",
                502,
            )
        _PENDING_STATES[state] = {
            "state": state,
            "entry_id": entry["entry_id"],
            "toolkit_id": entry["toolkit_id"],
            "provider": _entry_provider(entry),
            "auth_status": "pending",
            "last_error": "",
            "last_checked_at": now,
            "processing": False,
            "cancel_event": threading.Event(),
            "commit_lock": commit_lock,
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
    from mcp_toolkits import install_mcp_toolkit, probe_mcp_toolkit_health

    try:
        return install_mcp_toolkit(entry_id, **kwargs)
    except Exception as exc:
        if getattr(exc, "code", "") == "mcp_already_installed":
            entry = _entry_from_any_id(entry_id, data_dir=kwargs.get("data_dir"))
            return probe_mcp_toolkit_health(
                entry["toolkit_id"],
                data_dir=kwargs.get("data_dir"),
                toolkit_factory=kwargs.get("toolkit_factory"),
            )
        raise


def cancel_mcp_oauth_start(
    state: str,
    *,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    normalized_state = str(state or "").strip()
    if not normalized_state:
        raise McpOAuthError(
            "mcp_oauth_state_invalid",
            "OAuth state is required",
            400,
        )
    now = (now_fn or time.time)()
    with _PENDING_LOCK:
        _cleanup_expired_attempts_locked(now)
        pending = _PENDING_STATES.get(normalized_state)
    if not pending:
        return {"ok": True, "cancelled": False}
    with pending["commit_lock"]:
        with _PENDING_LOCK:
            current = _PENDING_STATES.get(normalized_state)
            if (
                current is not pending
                or str(pending.get("auth_status") or "pending") != "pending"
            ):
                return {
                    "ok": True,
                    "cancelled": False,
                    "authStatus": str((current or {}).get("auth_status") or "missing"),
                }
            pending["cancel_event"].set()
            pending["auth_status"] = "cancelled"
            pending["last_error"] = "OAuth connection was cancelled"
            pending["last_checked_at"] = now
            pending["processing"] = False
            pending["purge_at"] = now + OAUTH_ATTEMPT_RETENTION_SECONDS
            _scrub_attempt_secrets_locked(pending)
            return {
                "ok": True,
                "cancelled": True,
                "entryId": str(pending.get("entry_id") or ""),
                "toolkitId": str(pending.get("toolkit_id") or ""),
            }


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
    normalized_state = str(state or "").strip()
    now = (now_fn or time.time)()
    with _PENDING_LOCK:
        _cleanup_expired_attempts_locked(now)
        pending = _PENDING_STATES.get(normalized_state)
        pending_status = str((pending or {}).get("auth_status") or "missing")
        if pending and pending_status == "pending" and not pending.get("processing"):
            pending["processing"] = True
            callback_context = {
                key: pending.get(key)
                for key in (
                    "entry_id",
                    "toolkit_id",
                    "provider",
                    "code_verifier",
                    "redirect_uri",
                    "client_id",
                    "client_secret",
                    "token_endpoint",
                    "auth_server",
                    "expires_at",
                )
            }
        else:
            callback_context = {}
    if not pending:
        raise McpOAuthError("mcp_oauth_state_invalid", "OAuth state is invalid or expired", 400)
    if pending_status == "cancelled":
        raise McpOAuthError(
            "mcp_oauth_cancelled",
            "OAuth connection was cancelled",
            409,
        )
    if pending_status != "pending" or not callback_context:
        raise McpOAuthError(
            "mcp_oauth_state_invalid",
            "OAuth state is invalid or already completed",
            400,
        )
    if float(callback_context.get("expires_at") or 0) < now:
        message = "OAuth authorization expired before completion"
        _finish_mcp_oauth_attempt(
            pending,
            status="expired",
            message=message,
            now=now,
        )
        raise McpOAuthError("mcp_oauth_state_invalid", message, 400)
    if error:
        message = "OAuth authorization was denied or cancelled"
        terminal_status = _finish_mcp_oauth_attempt(
            pending,
            status="error",
            message=message,
            now=now,
        )
        if terminal_status == "cancelled":
            raise McpOAuthError(
                "mcp_oauth_cancelled",
                "OAuth connection was cancelled",
                409,
            )
        raise McpOAuthError("mcp_oauth_provider_denied", message, 400)
    normalized_code = str(code or "").strip()
    if not normalized_code:
        message = "OAuth callback did not include an authorization code"
        terminal_status = _finish_mcp_oauth_attempt(
            pending,
            status="error",
            message=message,
            now=now,
        )
        if terminal_status == "cancelled":
            raise McpOAuthError(
                "mcp_oauth_cancelled",
                "OAuth connection was cancelled",
                409,
            )
        raise McpOAuthError("mcp_oauth_callback_failed", message, 400)

    form = {
        "grant_type": "authorization_code",
        "code": normalized_code,
        "client_id": callback_context["client_id"],
        "redirect_uri": callback_context["redirect_uri"],
        "code_verifier": callback_context["code_verifier"],
    }
    if callback_context.get("client_secret"):
        form["client_secret"] = callback_context["client_secret"]

    try:
        token_response = (http_post or _default_http_post)(
            callback_context["token_endpoint"],
            form=form,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    except Exception as exc:
        _raise_if_attempt_cancelled(pending, now=(now_fn or time.time)())
        message = "OAuth token exchange failed"
        _finish_mcp_oauth_attempt(
            pending,
            status="error",
            message=message,
            now=now,
        )
        raise McpOAuthError("mcp_oauth_token_exchange_failed", message, 502) from exc

    _raise_if_attempt_cancelled(pending, now=(now_fn or time.time)())
    if not isinstance(token_response, dict):
        message = "OAuth token exchange failed"
        _finish_mcp_oauth_attempt(
            pending,
            status="error",
            message=message,
            now=now,
        )
        raise McpOAuthError("mcp_oauth_token_exchange_failed", message, 502)
    if token_response.get("error"):
        message = "OAuth token exchange failed"
        _finish_mcp_oauth_attempt(
            pending,
            status="error",
            message=message,
            now=now,
        )
        raise McpOAuthError("mcp_oauth_token_exchange_failed", message, 400)
    access_token = str(token_response.get("access_token") or "")
    if not access_token:
        message = "OAuth token exchange did not return an access token"
        _finish_mcp_oauth_attempt(
            pending,
            status="error",
            message=message,
            now=now,
        )
        raise McpOAuthError("mcp_oauth_token_exchange_failed", message, 502)

    commit_now = (now_fn or time.time)()
    if float(callback_context.get("expires_at") or 0) < commit_now:
        message = "OAuth authorization expired before completion"
        _finish_mcp_oauth_attempt(
            pending,
            status="expired",
            message=message,
            now=commit_now,
        )
        raise McpOAuthError("mcp_oauth_state_invalid", message, 400)
    try:
        expires_in = float(token_response.get("expires_in") or 0)
    except (TypeError, ValueError) as exc:
        message = "OAuth token exchange failed"
        _finish_mcp_oauth_attempt(
            pending,
            status="error",
            message=message,
            now=commit_now,
        )
        raise McpOAuthError("mcp_oauth_token_exchange_failed", message, 502) from exc
    token_record = {
        "entry_id": callback_context["entry_id"],
        "auth_provider": callback_context["provider"],
        "auth_status": "connected",
        "access_token": access_token,
        "refresh_token": str(token_response.get("refresh_token") or ""),
        "expires_at": commit_now + expires_in if expires_in else 0,
        "client_id": callback_context["client_id"],
        "client_secret": callback_context.get("client_secret", ""),
        "token_endpoint": callback_context["token_endpoint"],
        "auth_server": callback_context.get("auth_server", ""),
        "last_checked_at": commit_now,
        "last_error": "",
    }
    with pending["commit_lock"]:
        _raise_if_attempt_cancelled(pending, now=commit_now)
        previous_token = _token_snapshot(
            callback_context["toolkit_id"],
            data_dir=data_dir,
        )
        try:
            save_mcp_oauth_token(
                callback_context["toolkit_id"],
                token_record,
                data_dir=data_dir,
            )
            result = (install_fn or _default_install)(
                callback_context["entry_id"],
                data_dir=data_dir,
            )
            installed_toolkit = (
                result.get("toolkit") if isinstance(result, dict) else None
            )
            if (
                not isinstance(installed_toolkit, dict)
                or str(installed_toolkit.get("status") or "").strip().lower()
                != "available"
            ):
                raise McpOAuthError(
                    "mcp_oauth_install_failed",
                    "OAuth connected, but MCP installation or tool discovery failed",
                    502,
                )
        except Exception as exc:
            try:
                _restore_token_snapshot(
                    callback_context["toolkit_id"],
                    previous_token,
                    data_dir=data_dir,
                )
            except Exception:
                pass
            message = "OAuth connected, but MCP installation or tool discovery failed"
            _finish_mcp_oauth_attempt(
                pending,
                status="error",
                message=message,
                now=commit_now,
            )
            raise McpOAuthError("mcp_oauth_install_failed", message, 502) from exc
        _finish_mcp_oauth_attempt(
            pending,
            status="connected",
            now=commit_now,
        )
        return result


def _cancel_pending_attempts_for_toolkit_locked(
    toolkit_id: str,
    *,
    commit_lock: Any,
    now: float,
) -> int:
    cancelled = 0
    with _PENDING_LOCK:
        _cleanup_expired_attempts_locked(now)
        for pending in _PENDING_STATES.values():
            if (
                str(pending.get("toolkit_id") or "") != toolkit_id
                or pending.get("commit_lock") is not commit_lock
                or str(pending.get("auth_status") or "pending") != "pending"
            ):
                continue
            pending["cancel_event"].set()
            pending["auth_status"] = "cancelled"
            pending["last_error"] = "OAuth connection was cancelled"
            pending["last_checked_at"] = now
            pending["processing"] = False
            pending["purge_at"] = now + OAUTH_ATTEMPT_RETENTION_SECONDS
            _scrub_attempt_secrets_locked(pending)
            cancelled += 1
    return cancelled


def disconnect_mcp_oauth(
    toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
    now_fn: Callable[[], float] | None = None,
) -> Dict[str, Any]:
    entry = _entry_from_any_id(toolkit_id, data_dir=data_dir)
    normalized = entry["toolkit_id"]
    commit_lock = _oauth_commit_lock(normalized, data_dir)
    with commit_lock:
        _cancel_pending_attempts_for_toolkit_locked(
            normalized,
            commit_lock=commit_lock,
            now=(now_fn or time.time)(),
        )
        try:
            from mcp_toolkits import delete_mcp_toolkit

            delete_mcp_toolkit(normalized, data_dir=data_dir)
        except Exception as exc:
            if getattr(exc, "code", "") != "mcp_toolkit_not_found":
                raise
            delete_mcp_oauth_token(normalized, data_dir=data_dir)
    return {"ok": True, "toolkitId": entry["toolkit_id"]}
