"""Encrypted MCP persistence shared by the sidecar and one-shot workers.

Only ciphertext is written to the profile. The AES key lives in an explicitly
selected OS credential service, never a keyring plugin or plaintext fallback.
Legacy JSON is atomically replaced only after encryption has been verified.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import tempfile
import threading
import time
from contextlib import contextmanager
from pathlib import Path

FORMAT = "pupu.mcp-credentials"
VERSION = 2
STORES = {
    "mcp_secrets.json": "toolkits",
    "mcp_oauth_tokens.json": "toolkits",
    "mcp_oauth_apps.json": "apps",
}
_ENVELOPE_KEYS = {"format", "version", "profile", "store", "nonce", "ciphertext"}
_MAX_BYTES = 16 * 1024 * 1024
_LOCKS = {}
_LOCKS_GUARD = threading.Lock()
_HELD = threading.local()


class McpCredentialStoreError(RuntimeError):
    def __init__(self, code="mcp_secret_storage_unavailable"):
        # Static codes only: native keychain/crypto errors may contain secrets.
        super().__init__(code)
        self.code = code
        self.status = 503


def _native_keyring():
    try:
        if sys.platform == "darwin":
            from keyring.backends.macOS import Keyring
            backend = Keyring()
            backend.keychain = None
        elif sys.platform == "win32":
            from keyring.backends.Windows import WinVaultKeyring
            backend = WinVaultKeyring()
        elif sys.platform.startswith("linux"):
            from keyring.backends.SecretService import Keyring
            backend = Keyring()
            backend.appid = "com.red.pupu"
        else:
            raise McpCredentialStoreError()
        return backend
    except Exception:
        raise McpCredentialStoreError() from None


def _profile_id(path):
    canonical = os.path.normcase(str(Path(path).parent.resolve()))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@contextmanager
def credential_store_lock(path):
    """Reentrant within a thread, exclusive across threads AND processes."""
    root = Path(path).parent.resolve()
    with _LOCKS_GUARD:
        lock = _LOCKS.setdefault(str(root), threading.RLock())
    with lock:
        held = getattr(_HELD, "roots", set())
        if root in held:
            yield
            return
        fd = None
        locked = False
        try:
            root.mkdir(parents=True, exist_ok=True)
            lock_path = root / ".mcp-credentials.lock"
            if lock_path.is_symlink():
                raise McpCredentialStoreError("mcp_secret_store_invalid")
            fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
            if os.fstat(fd).st_size == 0:
                os.write(fd, b"\0")
            deadline = time.monotonic() + 10
            while True:
                try:
                    if sys.platform == "win32":
                        import msvcrt
                        os.lseek(fd, 0, os.SEEK_SET)
                        msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    locked = True
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise McpCredentialStoreError("mcp_secret_store_busy") from None
                    time.sleep(0.02)
            _HELD.roots = held | {root}
            yield
        except OSError:
            raise McpCredentialStoreError("mcp_secret_store_io_failed") from None
        finally:
            _HELD.roots = held
            if fd is not None:
                try:
                    if locked and sys.platform == "win32":
                        import msvcrt
                        os.lseek(fd, 0, os.SEEK_SET)
                        msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
                finally:
                    os.close(fd)


def _json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


def _decode_json(raw):
    try:
        return json.loads(raw, object_pairs_hook=_json_object,
                          parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise McpCredentialStoreError("mcp_secret_store_invalid") from None


def _read_raw(path):
    if path.is_symlink():
        raise McpCredentialStoreError("mcp_secret_store_invalid")
    try:
        with path.open("rb") as stream:
            raw = stream.read(_MAX_BYTES + 1)
    except FileNotFoundError:
        return None
    except OSError:
        raise McpCredentialStoreError("mcp_secret_store_io_failed") from None
    if len(raw) > _MAX_BYTES:
        raise McpCredentialStoreError("mcp_secret_store_invalid")
    value = _decode_json(raw)
    if not isinstance(value, dict):
        raise McpCredentialStoreError("mcp_secret_store_invalid")
    return value


def _validate_store(path, value):
    collection = STORES.get(path.name)
    if (collection is None or not isinstance(value, dict)
            or set(value) != {"version", collection}
            or type(value["version"]) is not int or value["version"] != 1
            or not isinstance(value[collection], dict)
            or any(not isinstance(record, dict) for record in value[collection].values())):
        raise McpCredentialStoreError("mcp_secret_store_invalid")
    if path.name == "mcp_secrets.json" and any(
        not isinstance(secret, str)
        for record in value[collection].values() for secret in record.values()
    ):
        raise McpCredentialStoreError("mcp_secret_store_invalid")
    return value


def _key(path, *, create):
    profile = _profile_id(path)
    service = f"com.red.pupu.mcp-credentials.{profile}"
    try:
        backend = _native_keyring()
        encoded = backend.get_password(service, "aes256-gcm-v1")
        if encoded is None:
            if not create:
                raise McpCredentialStoreError("mcp_secret_store_key_missing")
            # A new store must not replace the missing key of a sibling store.
            for name in STORES:
                sibling = _read_raw(path.parent / name)
                if sibling is not None and (
                    not isinstance(sibling, dict) or sibling.get("version") != 1
                ):
                    raise McpCredentialStoreError("mcp_secret_store_key_missing")
            encoded = base64.b64encode(os.urandom(32)).decode("ascii")
            backend.set_password(service, "aes256-gcm-v1", encoded)
            if backend.get_password(service, "aes256-gcm-v1") != encoded:
                raise McpCredentialStoreError()
        key = base64.b64decode(encoded, validate=True)
        if len(key) != 32:
            raise McpCredentialStoreError("mcp_secret_store_key_invalid")
        return key
    except McpCredentialStoreError:
        raise
    except Exception:
        raise McpCredentialStoreError() from None


def _aad(path):
    return f"{FORMAT}\n{VERSION}\n{_profile_id(path)}\n{path.name}".encode("utf-8")


def _decrypt(path, envelope):
    if (set(envelope) != _ENVELOPE_KEYS or envelope["format"] != FORMAT
            or type(envelope["version"]) is not int or envelope["version"] != VERSION
            or envelope["profile"] != _profile_id(path) or envelope["store"] != path.name):
        raise McpCredentialStoreError("mcp_secret_store_invalid")
    key = _key(path, create=False)
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        nonce = base64.b64decode(envelope["nonce"], validate=True)
        ciphertext = base64.b64decode(envelope["ciphertext"], validate=True)
        if len(nonce) != 12:
            raise ValueError()
        plaintext = AESGCM(key).decrypt(nonce, ciphertext, _aad(path))
    except Exception:
        raise McpCredentialStoreError("mcp_secret_store_decrypt_failed") from None
    return _validate_store(path, _decode_json(plaintext))


def _write_encrypted(path, store):
    key = _key(path, create=True)
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        plaintext = json.dumps(store, ensure_ascii=False, allow_nan=False).encode("utf-8")
        nonce = os.urandom(12)
        cipher = AESGCM(key)
        ciphertext = cipher.encrypt(nonce, plaintext, _aad(path))
        if cipher.decrypt(nonce, ciphertext, _aad(path)) != plaintext:
            raise ValueError()
        envelope = {"format": FORMAT, "version": VERSION, "profile": _profile_id(path),
                    "store": path.name, "nonce": base64.b64encode(nonce).decode("ascii"),
                    "ciphertext": base64.b64encode(ciphertext).decode("ascii")}
        encoded = json.dumps(envelope, sort_keys=True).encode("utf-8")
        if len(encoded) > _MAX_BYTES:
            raise ValueError()
    except Exception:
        raise McpCredentialStoreError("mcp_secret_store_encrypt_failed") from None
    temp = None
    try:
        fd, temp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
        with os.fdopen(fd, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
        temp = None
    except OSError:
        raise McpCredentialStoreError("mcp_secret_store_io_failed") from None
    finally:
        if temp is not None:
            try:
                os.unlink(temp)
            except OSError:
                pass  # This temporary file contains ciphertext only.


def read_credential_store(path):
    path = Path(path)
    if path.name not in STORES:
        raise McpCredentialStoreError("mcp_secret_store_invalid")
    # Credential-free MCPs remain usable with no OS credential service.
    if not path.exists() and not path.is_symlink():
        return {"version": 1, STORES[path.name]: {}}
    with credential_store_lock(path):
        value = _read_raw(path)
        if value is None:
            return {"version": 1, STORES[path.name]: {}}
        if not isinstance(value, dict):
            raise McpCredentialStoreError("mcp_secret_store_invalid")
        if type(value.get("version")) is int and value["version"] == 1:
            store = _validate_store(path, value)
            _write_encrypted(path, store)
            return store
        return _decrypt(path, value)


def write_credential_store(path, store):
    path = Path(path)
    _validate_store(path, store)
    with credential_store_lock(path):
        # Verify any existing data before replacing it, including on retries.
        if path.exists() or path.is_symlink():
            read_credential_store(path)
        elif not store[STORES[path.name]]:
            return
        _write_encrypted(path, store)


def migrate_mcp_credentials(data_dir=None):
    root = Path(data_dir or os.environ.get("UNCHAIN_DATA_DIR", "").strip() or Path.home() / ".pupu")
    for name in STORES:
        read_credential_store(root / name)
