"""External, process-local accident guard for isolated runtime HTTP probes.

Install before any host/routes/SDK import. Not an OS sandbox or a defence
against hostile Python, inherited open handles, or arbitrary native extensions.
No environment value or rejected credential is recorded in receipts.
"""
from __future__ import annotations

import builtins
import contextlib
import hashlib
import io
import ipaddress
import os
from pathlib import Path
import re
import socket
import sqlite3
import sys
import sysconfig
from urllib.parse import unquote, urlsplit
from unittest.mock import patch

SENTINEL_CREDENTIAL = "sentinel-active-context-http-no-real-secret"
_SECRET_ENV = re.compile(r"(?:API_?KEY|API_KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTHORIZATION)", re.I)
_PROXY_ENV = re.compile(r"(?:^|_)PROXY$", re.I)
_SECRET_FILE = re.compile(r"(?:^|[._-])(?:credentials?|secrets?|vault)(?:[._-]|$)", re.I)
_SOURCE_SUFFIXES = {".py", ".pyc", ".pyo", ".js", ".cjs", ".mjs", ".md"}
_PRIVATE_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".keystore", ".jks"}
_READONLY_NAMES = {".netrc", "_netrc", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "authorized_keys"}
_ACTIVE = None
_AUDIT_INSTALLED = False


class GuardViolation(PermissionError):
    """Content-free refusal; callers must not add secret arguments to logs."""


def _audit(event, args):
    guard = _ACTIVE
    if guard is not None:
        guard._audit(event, args)


def _under(path, root):
    return path == root or path.startswith(root + os.sep)


def _absolute(value):
    return os.path.abspath(os.fspath(value))


class RuntimeSafetyGuard(contextlib.AbstractContextManager):
    def __init__(self, *, sandbox_root, read_roots=(), real_home=None):
        self.real_home = Path(real_home) if real_home is not None else Path.home()
        self._real_home = os.path.realpath(_absolute(self.real_home))
        protected = (".pupu", ".aws", ".ssh", ".config/gcloud", "Library/Keychains",
                     "Library/Application Support/PuPu", "Library/Application Support/pupu")
        # Do not resolve/stat the protected library paths themselves merely to
        # build a policy. Resolve only the home directory prefix.
        self.protected_roots = tuple(dict.fromkeys(os.path.join(home, suffix)
            for home in (_absolute(self.real_home), self._real_home) for suffix in protected))
        self.refusals = []
        raw_sandbox = _absolute(sandbox_root)
        if any(_under(raw_sandbox, root) for root in self.protected_roots):
            self._deny("unsafe_sandbox_root")
        self.sandbox_root = Path(os.path.realpath(raw_sandbox))
        if any(_under(str(self.sandbox_root), root) for root in self.protected_roots):
            self._deny("unsafe_sandbox_root")
        self.home = self.sandbox_root / "home"
        self.data_dir = self.sandbox_root / "data"
        self.tmp_dir = self.sandbox_root / "tmp"
        self.sentinel = SENTINEL_CREDENTIAL
        self.allowed_ports = set()
        self.fake_calls = []
        self.removed_env_names = []
        self._stack = None
        self._ctypes_bootstrap_count = 0
        self._stdlib_ctypes_file = os.path.realpath(os.path.join(sysconfig.get_path("stdlib"), "ctypes", "__init__.py"))
        self._original_getaddrinfo = socket.getaddrinfo
        self._original_sqlite_connect = sqlite3.connect
        self._original_expanduser = os.path.expanduser
        automatic = [sys.prefix, sys.base_prefix, sysconfig.get_path("stdlib"), sysconfig.get_path("platstdlib")]
        canonical_roots = []
        for path in [self.sandbox_root, *read_roots, *automatic]:
            if not path:
                continue
            raw = _absolute(path)
            if any(_under(raw, root) for root in self.protected_roots):
                self._deny("unsafe_read_root")
            canonical_roots.append(os.path.realpath(raw))
        self.read_roots = tuple(dict.fromkeys(canonical_roots))
        self.read_files = {"/dev/null", "/dev/urandom", "/dev/random"}

    def _deny(self, reason):
        self.refusals.append(reason)
        raise GuardViolation("runtime_safety_guard:" + reason)

    def _path(self, value, *, write=False):
        if isinstance(value, int):
            if value in (0, 1, 2):
                return None
            self._deny("inherited_file_descriptor")
        if value is None:
            self._deny("path_missing")
        try:
            path = _absolute(os.fsdecode(value))
        except (TypeError, ValueError):
            self._deny("path_invalid")
        # Refuse protected lexical paths before resolving symlinks; never open
        # or enumerate a real protected path to decide whether it is allowed.
        if any(_under(path, root) for root in self.protected_roots):
            self._deny("real_user_store")
        def sensitive(candidate):
            name = os.path.basename(candidate).lower()
            parent_names = {part.lower() for part in Path(candidate).parts[:-1]}
            return (name == ".env" or name.startswith(".env.") or name in _READONLY_NAMES or
                    Path(name).suffix in _PRIVATE_SUFFIXES or
                    (Path(name).suffix not in _SOURCE_SUFFIXES and _SECRET_FILE.search(name)) or
                    bool(parent_names & {".env", ".secrets", "secrets", "credentials", "vault", ".ssh", ".aws"}))
        if sensitive(path):
            self._deny("sensitive_file")
        resolved = os.path.realpath(path)
        # An innocuous symlink name must not launder a denied target basename.
        if sensitive(resolved):
            self._deny("sensitive_file")
        if any(_under(resolved, root) for root in self.protected_roots):
            self._deny("real_user_store")
        if write:
            if not _under(resolved, str(self.sandbox_root)):
                self._deny("write_outside_sandbox")
        elif resolved not in self.read_files and not any(_under(resolved, root) for root in self.read_roots):
            self._deny("read_outside_allowlist")
        return resolved

    def _host(self, host, *, allow_localhost=False):
        if isinstance(host, bytes):
            host = host.decode("ascii", "strict")
        if allow_localhost and host in ("localhost", "localhost."):
            return "127.0.0.1"
        if not isinstance(host, str) or "%" in host:
            self._deny("network_address")
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            self._deny("dns_escape")
        # Mapped IPv6 loopback is allowed only when its embedded IP is loopback.
        if not address.is_loopback and not (getattr(address, "ipv4_mapped", None) and address.ipv4_mapped.is_loopback):
            self._deny("non_loopback_network")
        return str(address)

    def _address(self, sock, address, *, bind=False):
        if sock.family not in (socket.AF_INET, socket.AF_INET6) or not isinstance(address, tuple) or len(address) < 2:
            self._deny("non_inet_socket")
        self._host(address[0])
        port = address[1]
        if not isinstance(port, int) or isinstance(port, bool) or not 0 <= port <= 65535:
            self._deny("network_port")
        if not bind and port not in self.allowed_ports:
            self._deny("unapproved_loopback_port")

    def allow_loopback_port(self, port):
        if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
            self._deny("network_port")
        self.allowed_ports.add(port)

    def _getaddrinfo(self, host, port, family=0, type=0, proto=0, flags=0):
        numeric = self._host(host, allow_localhost=True)
        if family == socket.AF_INET6 and host in ("localhost", "localhost."):
            numeric = "::1"
        if port is not None and not (isinstance(port, int) or isinstance(port, str) and port.isascii() and port.isdigit()):
            self._deny("service_lookup")
        # AI_NUMERICHOST and AI_NUMERICSERV prevent resolver/network fallback.
        return self._original_getaddrinfo(numeric, port, family, type, proto,
                                         flags | socket.AI_NUMERICHOST | socket.AI_NUMERICSERV)

    def _gethostbyname(self, host):
        return self._host(host, allow_localhost=True)

    def _gethostbyaddr(self, host):
        numeric = self._host(host)
        return ("localhost", [], [numeric])

    def _getnameinfo(self, address, flags):
        self._host(address[0])
        return (address[0] if flags & socket.NI_NUMERICHOST else "localhost", str(address[1]))

    def _database(self, database, *, uri=False):
        value = os.fsdecode(database)
        if value == ":memory:":
            return value
        if value.startswith("file:"):
            parts = urlsplit(value)
            if parts.netloc not in ("", "localhost"):
                self._deny("sqlite_remote_uri")
            # Named in-memory SQLite URIs are allowed without a file path.
            if parts.path == ":memory:" or "mode=memory" in parts.query.split("&"):
                return value
            path = unquote(parts.path)
        else:
            path = value
        self._path(path, write=True)
        return value

    def _connect(self, database, *args, **kwargs):
        self._database(database, uri=kwargs.get("uri", False))
        connection = self._original_sqlite_connect(database, *args, **kwargs)
        # SQLite ATTACH opens files in native code, beyond Python open hooks.
        def authorizer(action, arg1, arg2, _database_name, _trigger):
            if action == sqlite3.SQLITE_ATTACH:
                # Parameterized ATTACH can have arg1=None at prepare time.
                # No SQL reparser/authorizer guess: this probe forbids ATTACH.
                self.refusals.append("sqlite_attach_disabled")
                return sqlite3.SQLITE_DENY
            return sqlite3.SQLITE_OK
        connection.set_authorizer(authorizer)
        return connection

    def _expanduser(self, path):
        if isinstance(path, str) and (path == "~" or path.startswith("~/")):
            return str(self.home) + path[1:]
        if isinstance(path, bytes) and (path == b"~" or path.startswith(b"~/")):
            return os.fsencode(self.home) + path[1:]
        if path.startswith(b"~" if isinstance(path, bytes) else "~"):
            self._deny("other_user_home")
        return path

    def _allow_ctypes_process_bootstrap(self, name):
        # ctypes initializes pythonapi=PyDLL(None) while importing the real
        # stdlib module on POSIX. No pathname load or later caller is admitted.
        if name is not None or self._ctypes_bootstrap_count != 0 or os.name == "nt":
            return False
        module = sys.modules.get("ctypes")
        if module is None:
            return False
        spec = getattr(module, "__spec__", None)
        if not getattr(spec, "_initializing", False):
            return False
        if os.path.realpath(getattr(module, "__file__", "")) != self._stdlib_ctypes_file:
            return False
        frame = sys._getframe(1)
        while frame is not None and frame.f_globals is globals():
            frame = frame.f_back
        if frame is None or frame.f_code.co_name != "__init__":
            return False
        if os.path.realpath(frame.f_code.co_filename) != self._stdlib_ctypes_file or frame.f_globals is not vars(module):
            return False
        instance = frame.f_locals.get("self")
        if type(instance).__name__ != "PyDLL" or type(instance).__module__ != "ctypes" or frame.f_locals.get("name") is not None:
            return False
        parent = frame.f_back
        if (parent is None or parent.f_code.co_name != "<module>" or parent.f_globals is not vars(module) or
                os.path.realpath(parent.f_code.co_filename) != self._stdlib_ctypes_file):
            return False
        self._ctypes_bootstrap_count = 1
        return True

    def _audit(self, event, args):
        if event == "open":
            path, mode, flags = args
            write = (isinstance(mode, str) and any(c in mode for c in "wax+")) or bool(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND))
            self._path(path, write=write)
        elif event in ("os.listdir", "os.scandir"):
            self._path(args[0] if args else ".")
        elif event in ("os.mkdir", "os.remove", "os.rmdir", "os.chmod", "os.truncate", "os.utime"):
            self._path(args[0], write=True)
            if event in ("os.mkdir", "os.remove", "os.rmdir") and len(args) > 1 and args[-1] not in (None, -1):
                self._deny("dir_fd")
        elif event in ("os.rename", "os.link", "os.symlink"):
            self._path(args[0], write=True)
            self._path(args[1], write=True)
            if len(args) > 2 and any(v not in (None, -1) for v in args[2:]):
                self._deny("dir_fd")
        elif event == "os.chdir":
            self._path(args[0])
        elif event == "sqlite3.connect":
            self._database(args[0])
        elif event in ("socket.connect", "socket.bind"):
            self._address(args[0], args[1], bind=event == "socket.bind")
        elif event == "socket.sendto":
            self._address(args[0], args[-1])
        elif event in ("socket.getaddrinfo", "socket.gethostbyname", "socket.gethostbyaddr"):
            self._host(args[0])
        elif event == "socket.getnameinfo":
            self._host(args[0][0])
        elif event == "ctypes.dlopen":
            if not self._allow_ctypes_process_bootstrap(args[0] if args else ""):
                self._deny("native_or_subprocess")
        elif event in ("ctypes.dlsym", "ctypes.dlsym/handle"):
            self._deny("native_symbol_lookup")
        elif event in ("subprocess.Popen", "os.system", "os.exec", "os.posix_spawn", "pty.spawn", "os.fork", "os.forkpty"):
            self._deny("native_or_subprocess")

    def assert_sentinel_key(self, value):
        if not isinstance(value, str) or value != self.sentinel:
            self._deny("non_sentinel_credential")

    def fake_sdk(self, *, provider, api_key):
        self.assert_sentinel_key(api_key)
        return SentinelSDK(self, provider)

    def receipt(self):
        return {"schema": "pupu.http_probe_guard.v1", "mode": "same-process-accident-guard-not-os-sandbox",
                "home_env_unchanged": os.environ.get("HOME") == self._home_env,
                "path_home": str(self.home), "data_dir": str(self.data_dir),
                "read_roots": list(self.read_roots), "allowed_ports": sorted(self.allowed_ports),
                "removed_env_names": sorted(self.removed_env_names), "refusal_codes": list(self.refusals),
                "fake_calls": list(self.fake_calls), "ctypes_process_bootstrap_count": self._ctypes_bootstrap_count, "sentinel_sha256": hashlib.sha256(self.sentinel.encode()).hexdigest()}

    def __enter__(self):
        global _ACTIVE, _AUDIT_INSTALLED
        if _ACTIVE is not None:
            raise RuntimeError("nested runtime guard unsupported")
        for path in (self.sandbox_root, self.home, self.data_dir, self.tmp_dir):
            path.mkdir(parents=True, exist_ok=True)
        self._home_env = os.environ.get("HOME")
        self._environment = dict(os.environ)
        for key in tuple(os.environ):
            if (_SECRET_ENV.search(key) or _PROXY_ENV.search(key) or key.upper() in
                    ("SSH_AUTH_SOCK", "NETRC", "CURL_HOME", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "SSLKEYLOGFILE")):
                self.removed_env_names.append(key)
                del os.environ[key]
        os.environ.update(UNCHAIN_DATA_DIR=str(self.data_dir), UNCHAIN_AUTH_TOKEN=self.sentinel,
                          XDG_CONFIG_HOME=str(self.home / ".config"), XDG_CACHE_HOME=str(self.home / ".cache"),
                          XDG_DATA_HOME=str(self.home / ".local/share"), TMPDIR=str(self.tmp_dir))
        self._old_dont_write_bytecode = sys.dont_write_bytecode
        sys.dont_write_bytecode = True
        self._stack = contextlib.ExitStack()
        self._stack.enter_context(patch("pathlib.Path.home", return_value=self.home))
        self._stack.enter_context(patch("os.path.expanduser", self._expanduser))
        self._stack.enter_context(patch("socket.getaddrinfo", self._getaddrinfo))
        self._stack.enter_context(patch("socket.gethostbyname", self._gethostbyname))
        self._stack.enter_context(patch("socket.gethostbyname_ex", lambda host: (host, [], [self._gethostbyname(host)])))
        self._stack.enter_context(patch("socket.gethostbyaddr", self._gethostbyaddr))
        self._stack.enter_context(patch("socket.getnameinfo", self._getnameinfo))
        self._stack.enter_context(patch("sqlite3.connect", self._connect))
        self._stack.enter_context(patch("sqlite3.dbapi2.connect", self._connect))
        # CPython's C socket.connect resolves names BEFORE socket.connect audit.
        # Validate at the Python method entry as well, before the C resolver.
        original_connect = socket.socket.connect
        original_connect_ex = socket.socket.connect_ex
        original_bind = socket.socket.bind
        original_sendto = socket.socket.sendto
        def guarded_connect(sock, address):
            self._address(sock, address)
            return original_connect(sock, address)
        def guarded_connect_ex(sock, address):
            self._address(sock, address)
            return original_connect_ex(sock, address)
        def guarded_bind(sock, address):
            self._address(sock, address, bind=True)
            return original_bind(sock, address)
        def guarded_sendto(sock, data, *args):
            if not args:
                self._deny("network_address")
            self._address(sock, args[-1])
            return original_sendto(sock, data, *args)
        self._stack.enter_context(patch.object(socket.socket, "connect", guarded_connect))
        self._stack.enter_context(patch.object(socket.socket, "connect_ex", guarded_connect_ex))
        self._stack.enter_context(patch.object(socket.socket, "bind", guarded_bind))
        self._stack.enter_context(patch.object(socket.socket, "sendto", guarded_sendto))
        if not _AUDIT_INSTALLED:
            sys.addaudithook(_audit)
            _AUDIT_INSTALLED = True
        _ACTIVE = self
        return self

    def __exit__(self, *exc):
        global _ACTIVE
        _ACTIVE = None
        self._stack.close()
        sys.dont_write_bytecode = self._old_dont_write_bytecode
        # Restore changed keys individually. HOME is never set/deleted by the
        # guard, even if host code changed it; receipt must expose that change.
        for key in tuple(os.environ):
            if key != "HOME" and key not in self._environment:
                del os.environ[key]
        for key, value in self._environment.items():
            if key != "HOME" and os.environ.get(key) != value:
                os.environ[key] = value
        return False


class SentinelSDK:
    """Deliberately minimal fake; not an implementation of a provider SDK API."""
    def __init__(self, guard, provider):
        self._guard = guard
        if provider not in ("openai", "anthropic", "gemini", "ollama", "fixture"):
            guard._deny("fake_provider_unknown")
        self.provider = provider
        self.api_key = SENTINEL_CREDENTIAL

    def complete(self, request_tag="guard-self-test"):
        self._guard.assert_sentinel_key(self.api_key)
        self._guard.fake_calls.append({"provider": self.provider, "call_index": len(self._guard.fake_calls) + 1, "credential_kind": "sentinel-only"})
        return {"message": "sentinel fake response", "provider": self.provider}
