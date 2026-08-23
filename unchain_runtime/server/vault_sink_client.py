"""Authenticated loopback client for the Electron-owned Vault sink broker.

The client deliberately exposes only the four reviewed broker capabilities.
It cannot request plaintext, choose an arbitrary path, or forward a raw broker
error into model-visible state.  Secret values never enter this process.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Mapping


BROKER_URL_ENV = "PUPU_VAULT_BROKER_URL"
BROKER_FD_ENV = "PUPU_VAULT_BROKER_FD"
MAX_RESPONSE_BYTES = 64 * 1024

_KEY_RE = re.compile(r"^[0-9a-f]{64}$")
_NONCE_RE = re.compile(r"^[0-9a-f]{32}$")
_STATIC_PATHS = frozenset(
    {
        "/v1/status",
        "/v1/intents/prepare",
        "/v1/intents/execute",
        "/v1/intents/cancel",
    }
)


class VaultSinkClientError(RuntimeError):
    """A static, non-secret failure safe to project into a tool result."""

    def __init__(self, code: str, *, retryable: bool = False) -> None:
        normalized = str(code or "vault_broker_failed").strip()
        super().__init__(normalized)
        self.code = normalized
        self.retryable = bool(retryable)


def _canonical_json(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise VaultSinkClientError("vault_invalid_request") from exc


def _validated_base_url(value: str) -> str:
    raw = str(value or "").strip()
    try:
        parsed = urllib.parse.urlsplit(raw)
        port = parsed.port
    except (TypeError, ValueError) as exc:
        raise VaultSinkClientError("vault_broker_unavailable") from exc
    if (
        parsed.scheme != "http"
        or parsed.hostname != "127.0.0.1"
        or port is None
        or port < 1
        or port > 65535
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise VaultSinkClientError("vault_broker_unavailable")
    return f"http://127.0.0.1:{port}"


def _validated_key(value: str) -> bytes:
    raw = str(value or "").strip()
    if _KEY_RE.fullmatch(raw) is None:
        raise VaultSinkClientError("vault_broker_unavailable")
    return bytes.fromhex(raw)


def _read_key_from_fd(fd: int) -> str:
    if isinstance(fd, bool) or not isinstance(fd, int) or not 3 <= fd <= 255:
        raise VaultSinkClientError("vault_broker_unavailable")
    chunks: list[bytes] = []
    total = 0
    try:
        while total <= 65:
            chunk = os.read(fd, 66 - total)
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if b"\n" in chunk:
                break
    except OSError:
        raise VaultSinkClientError("vault_broker_unavailable") from None
    finally:
        try:
            os.close(fd)
        except OSError:
            pass
    raw = b"".join(chunks)
    if b"\n" in raw:
        key_line, remainder = raw.split(b"\n", 1)
        if remainder:
            raise VaultSinkClientError("vault_broker_unavailable")
    else:
        key_line = raw
    try:
        return key_line.decode("ascii")
    except UnicodeDecodeError:
        raise VaultSinkClientError("vault_broker_unavailable") from None


@dataclass(frozen=True)
class VaultSinkClient:
    """Fixed-route HMAC client for one Electron process lifetime."""

    base_url: str
    key: bytes
    timeout_seconds: float = 5.0
    _urlopen: Callable[..., Any] = urllib.request.urlopen
    _clock_ms: Callable[[], int] = lambda: int(time.time() * 1000)
    _nonce_factory: Callable[[], str] = lambda: secrets.token_hex(16)

    def __post_init__(self) -> None:
        normalized_url = _validated_base_url(self.base_url)
        raw_key = self.key
        if isinstance(raw_key, bytearray):
            raw_key = bytes(raw_key)
        if not isinstance(raw_key, bytes) or len(raw_key) != 32:
            raise VaultSinkClientError("vault_broker_unavailable")
        try:
            timeout = float(self.timeout_seconds)
        except (TypeError, ValueError) as exc:
            raise VaultSinkClientError("vault_broker_unavailable") from exc
        if not 0.1 <= timeout <= 30.0:
            raise VaultSinkClientError("vault_broker_unavailable")
        object.__setattr__(self, "base_url", normalized_url)
        object.__setattr__(self, "key", raw_key)
        object.__setattr__(self, "timeout_seconds", timeout)

    @classmethod
    def from_env(
        cls,
        *,
        required: bool = False,
        environ: Mapping[str, str] | None = None,
        _key_reader: Callable[[int], str] = _read_key_from_fd,
        **kwargs: Any,
    ) -> "VaultSinkClient | None":
        source = os.environ if environ is None else environ
        raw_url = str(source.get(BROKER_URL_ENV) or "").strip()
        raw_fd = str(source.get(BROKER_FD_ENV) or "").strip()
        if not raw_url and not raw_fd and not required:
            return None
        if not raw_url or not re.fullmatch(r"[0-9]{1,3}", raw_fd):
            raise VaultSinkClientError("vault_broker_unavailable")
        fd = int(raw_fd)
        raw_key = _key_reader(fd)
        return cls(base_url=raw_url, key=_validated_key(raw_key), **kwargs)

    def status(self) -> dict[str, Any]:
        return self._request("GET", "/v1/status", None)

    def prepare_intent(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/v1/intents/prepare", payload)

    def execute_intent(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/v1/intents/execute", payload)

    def cancel_intent(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/v1/intents/cancel", payload)

    def _request(
        self,
        method: str,
        path: str,
        payload: Mapping[str, Any] | None,
    ) -> dict[str, Any]:
        normalized_method = str(method or "").upper()
        if path not in _STATIC_PATHS or normalized_method not in {"GET", "POST"}:
            raise VaultSinkClientError("vault_broker_route_rejected")
        if normalized_method == "GET":
            if payload is not None or path != "/v1/status":
                raise VaultSinkClientError("vault_invalid_request")
            body = b""
        else:
            if not isinstance(payload, Mapping):
                raise VaultSinkClientError("vault_invalid_request")
            body = _canonical_json(dict(payload))
            if len(body) > 64 * 1024:
                raise VaultSinkClientError("vault_invalid_request")

        timestamp = str(int(self._clock_ms()))
        nonce = str(self._nonce_factory() or "").strip()
        if _NONCE_RE.fullmatch(nonce) is None:
            raise VaultSinkClientError("vault_broker_unavailable")
        body_digest = hashlib.sha256(body).hexdigest()
        canonical = (
            f"v1\n{normalized_method}\n{path}\n{timestamp}\n{nonce}\n{body_digest}"
        ).encode("utf-8")
        signature = hmac.new(self.key, canonical, hashlib.sha256).hexdigest()
        headers = {
            "Accept": "application/json",
            "X-PuPu-Vault-Timestamp": timestamp,
            "X-PuPu-Vault-Nonce": nonce,
            "X-PuPu-Vault-Signature": signature,
        }
        if normalized_method == "POST":
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            self.base_url + path,
            data=body if normalized_method == "POST" else None,
            headers=headers,
            method=normalized_method,
        )
        try:
            response = self._urlopen(request, timeout=self.timeout_seconds)
            with response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                status = int(getattr(response, "status", 200) or 200)
        except urllib.error.HTTPError as exc:
            code = self._coded_http_error(exc)
            raise VaultSinkClientError(
                code,
                retryable=int(getattr(exc, "code", 0) or 0) >= 500,
            ) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise VaultSinkClientError(
                "vault_broker_unavailable",
                retryable=True,
            ) from None
        except VaultSinkClientError:
            raise
        except Exception:
            raise VaultSinkClientError(
                "vault_broker_unavailable",
                retryable=True,
            ) from None
        if status < 200 or status >= 300:
            raise VaultSinkClientError(
                "vault_broker_failed",
                retryable=status >= 500,
            )
        if len(raw) > MAX_RESPONSE_BYTES:
            raise VaultSinkClientError("vault_broker_invalid_response")
        try:
            decoded = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise VaultSinkClientError("vault_broker_invalid_response") from None
        if not isinstance(decoded, dict):
            raise VaultSinkClientError("vault_broker_invalid_response")
        if decoded.get("ok") is False:
            code = (
                decoded.get("error", {}).get("code")
                if isinstance(decoded.get("error"), dict)
                else ""
            )
            raise VaultSinkClientError(
                str(code or "vault_broker_failed"),
                retryable=status >= 500,
            )
        return decoded

    @staticmethod
    def _coded_http_error(error: urllib.error.HTTPError) -> str:
        try:
            raw = error.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                return "vault_broker_failed"
            payload = json.loads(raw.decode("utf-8"))
            error_payload = payload.get("error") if isinstance(payload, dict) else None
            code = error_payload.get("code") if isinstance(error_payload, dict) else None
            if isinstance(code, str) and re.fullmatch(r"vault_[a-z0-9_]{1,80}", code):
                return code
        except Exception:
            pass
        return "vault_broker_failed"


_PROCESS_CLIENT_LOCK = threading.RLock()
_PROCESS_CLIENT_INITIALIZED = False
_PROCESS_CLIENT: VaultSinkClient | None = None


def initialize_process_vault_sink_client(
    *,
    required: bool = False,
) -> VaultSinkClient | None:
    """Consume and close the inherited key FD exactly once.

    Both broker environment variables are removed immediately after the first
    attempt so user-launched shell/MCP children cannot discover even the stale
    capability transport metadata.  The 32-byte key remains only in this
    process-local client object.
    """

    global _PROCESS_CLIENT_INITIALIZED, _PROCESS_CLIENT
    with _PROCESS_CLIENT_LOCK:
        if _PROCESS_CLIENT_INITIALIZED:
            if required and _PROCESS_CLIENT is None:
                raise VaultSinkClientError("vault_broker_unavailable")
            return _PROCESS_CLIENT
        try:
            _PROCESS_CLIENT = VaultSinkClient.from_env(required=required)
        finally:
            os.environ.pop(BROKER_FD_ENV, None)
            os.environ.pop(BROKER_URL_ENV, None)
            _PROCESS_CLIENT_INITIALIZED = True
        return _PROCESS_CLIENT


def get_process_vault_sink_client() -> VaultSinkClient | None:
    with _PROCESS_CLIENT_LOCK:
        return _PROCESS_CLIENT


def _reset_process_vault_sink_client_for_tests() -> None:
    global _PROCESS_CLIENT_INITIALIZED, _PROCESS_CLIENT
    with _PROCESS_CLIENT_LOCK:
        _PROCESS_CLIENT_INITIALIZED = False
        _PROCESS_CLIENT = None


__all__ = [
    "BROKER_FD_ENV",
    "BROKER_URL_ENV",
    "VaultSinkClient",
    "VaultSinkClientError",
    "get_process_vault_sink_client",
    "initialize_process_vault_sink_client",
]
