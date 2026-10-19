from __future__ import annotations

import argparse
import ctypes
import importlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock

from runtime_safety_guard import RuntimeSafetyGuard, GuardViolation, SENTINEL_CREDENTIAL

OUT = Path(__file__).resolve().parent
OBSERVATIONS = []


class RuntimeSafetyGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pupu-safety-selftest-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.fake_real_home = self.root / "pretend-real-home"
        self.source = self.root / "readonly-source"
        self.source.mkdir()
        self.sandbox = self.root / "isolated-runtime"
        self.outside = self.root / "outside"
        self.outside.mkdir()
        self.protected = self.fake_real_home / ".pupu"
        self.protected.mkdir(parents=True)
        self.protected_file = self.protected / "context.sqlite3"
        self.protected_file.write_text("sentinel-never-read-this-fixture")
        (self.source / "fixture_module.py").write_text("VALUE='sentinel-import'\n")

    def guard(self):
        return RuntimeSafetyGuard(sandbox_root=self.sandbox,
                                  read_roots=[self.source, OUT], real_home=self.fake_real_home)

    def test_bad_sandbox_or_explicit_read_root_is_refused_before_any_directory_creation(self):
        bad = self.protected / "must-not-create"
        with self.assertRaisesRegex(GuardViolation, "unsafe_sandbox_root"):
            RuntimeSafetyGuard(sandbox_root=bad, real_home=self.fake_real_home)
        self.assertFalse(bad.exists())
        with self.assertRaisesRegex(GuardViolation, "unsafe_read_root"):
            RuntimeSafetyGuard(sandbox_root=self.sandbox, read_roots=[self.protected], real_home=self.fake_real_home)
        self.assertFalse(self.sandbox.exists())

    def test_home_environment_is_unchanged_and_secret_and_proxy_environment_scrubbed(self):
        old_home = os.environ.get("HOME")
        fake_env = {"OPENAI_API_KEY": "sentinel-old-fake-key", "GOOGLE_API_KEY": "sentinel-google-key",
                    "AWS_SECRET_ACCESS_KEY": "sentinel-aws-key", "HTTPS_PROXY": "http://sentinel.invalid:9999",
                    "SSH_AUTH_SOCK": "/tmp/sentinel-agent", "GOOGLE_APPLICATION_CREDENTIALS": "/tmp/sentinel.json"}
        with patch.dict(os.environ, fake_env):
            with self.guard() as guard:
                for key in fake_env:
                    self.assertNotIn(key, os.environ)
                self.assertEqual(os.environ.get("HOME"), old_home)
                self.assertEqual(os.environ["UNCHAIN_AUTH_TOKEN"], SENTINEL_CREDENTIAL)
                self.assertEqual(os.environ["UNCHAIN_DATA_DIR"], str(guard.data_dir))
                self.assertEqual(Path.home(), guard.home)
                self.assertEqual(Path("~/.pupu").expanduser(), guard.home / ".pupu")
                receipt = guard.receipt()
                self.assertNotIn("sentinel-old-fake-key", json.dumps(receipt))
                OBSERVATIONS.append({"case": self._testMethodName, "receipt": receipt})
            for key, value in fake_env.items():
                self.assertEqual(os.environ[key], value)
        self.assertEqual(os.environ.get("HOME"), old_home)

    def test_real_user_store_is_refused_even_when_an_overbroad_read_root_is_supplied(self):
        with RuntimeSafetyGuard(sandbox_root=self.sandbox,
                                read_roots=[self.root], real_home=self.fake_real_home):
            with self.assertRaisesRegex(GuardViolation, "real_user_store"):
                self.protected_file.read_text()
            with self.assertRaisesRegex(GuardViolation, "real_user_store"):
                list(self.protected.iterdir())
            with self.assertRaisesRegex(GuardViolation, "real_user_store"):
                sqlite3.connect(self.protected_file)

    def test_readonly_source_import_and_stdlib_loading_remain_available(self):
        sys.path.insert(0, str(self.source))
        self.addCleanup(lambda: sys.path.remove(str(self.source)))
        self.addCleanup(lambda: sys.modules.pop("fixture_module", None))
        with self.guard():
            self.assertIn("sentinel-import", (self.source / "fixture_module.py").read_text())
            self.assertEqual(importlib.import_module("fixture_module").VALUE, "sentinel-import")
            self.assertTrue(importlib.import_module("xml.etree.ElementTree").fromstring("<root/>") is not None)
            with self.assertRaisesRegex(GuardViolation, "write_outside_sandbox"):
                (self.source / "fixture_module.py").write_text("do not write")
        self.assertFalse((self.source / "__pycache__").exists())

    def test_dotenv_keys_vault_and_credential_files_are_never_allowed_by_source_root(self):
        names = [".env", ".env.local", "fixture.pem", "id_ed25519", "credentials.json", "provider-vault.sqlite3"]
        for name in names:
            (self.source / name).write_text("sentinel-fake-value")
        with self.guard():
            for name in names:
                with self.subTest(name=name), self.assertRaisesRegex(GuardViolation, "sensitive_file"):
                    (self.source / name).read_text()

    def test_symlink_does_not_launder_a_sensitive_filename_in_allowed_source(self):
        hidden = self.source / ".env.fixture"
        hidden.write_text("sentinel-not-a-real-key")
        alias = self.source / "ordinary.txt"
        alias.symlink_to(hidden)
        with self.guard():
            with self.assertRaisesRegex(GuardViolation, "sensitive_file"):
                alias.read_text()

    def test_non_allowlisted_read_and_outside_writes_are_refused(self):
        file = self.outside / "ordinary.txt"
        file.write_text("outside-sentinel")
        with self.guard():
            with self.assertRaisesRegex(GuardViolation, "read_outside_allowlist"):
                file.read_text()
            with self.assertRaisesRegex(GuardViolation, "write_outside_sandbox"):
                file.write_text("must not write")
            permitted = self.sandbox / "ordinary.txt"
            permitted.write_text("sandbox-sentinel")
            self.assertEqual(permitted.read_text(), "sandbox-sentinel")
        self.assertEqual(file.read_text(), "outside-sentinel")

    def test_symlink_read_cannot_escape_into_real_user_store(self):
        self.sandbox.mkdir()
        link = self.sandbox / "escape-link"
        link.symlink_to(self.protected_file)
        with self.guard():
            with self.assertRaisesRegex(GuardViolation, "real_user_store"):
                link.read_text()

    def test_sqlite_only_uses_sandbox_and_authorizes_attach(self):
        sqlite3.enable_callback_tracebacks(True)
        self.addCleanup(sqlite3.enable_callback_tracebacks, False)
        with self.guard():
            connection = sqlite3.connect(self.sandbox / "probe.sqlite3")
            self.addCleanup(connection.close)
            connection.execute("create table example(value text)")
            connection.execute("insert into example values ('sentinel')")
            self.assertEqual(connection.execute("select value from example").fetchone(), ("sentinel",))
            with self.assertRaises(sqlite3.DatabaseError):
                connection.execute("attach database ? as inside", (str(self.sandbox / "inside.sqlite3"),))
            with self.assertRaises(sqlite3.DatabaseError):
                connection.execute("attach database ? as outside", (str(self.outside / "blocked.sqlite3"),))
            with self.assertRaisesRegex(GuardViolation, "write_outside_sandbox"):
                sqlite3.connect(self.outside / "blocked.sqlite3")
            with self.assertRaisesRegex(GuardViolation, "sqlite_remote_uri"):
                sqlite3.connect("file://remote.invalid/probe.sqlite3?mode=ro", uri=True)
        self.assertFalse((self.outside / "blocked.sqlite3").exists())

    def test_sqlite_memory_is_available(self):
        with self.guard():
            with sqlite3.dbapi2.connect(":memory:") as connection:
                self.assertEqual(connection.execute("select 41+1").fetchone(), (42,))
            with sqlite3.connect("file:sentinel?mode=memory&cache=shared", uri=True) as connection:
                self.assertEqual(connection.execute("select 1").fetchone(), (1,))

    def test_non_loopback_connect_and_dns_escape_refuse_before_any_connection(self):
        # Independent inert bottoms: even a guard regression cannot issue DNS,
        # a TCP connect, or a UDP packet during these negative controls.
        below = Mock(side_effect=AssertionError("inert_network_bottom_reached"))
        with patch.object(socket.socket, "connect", below), patch.object(socket.socket, "connect_ex", below), patch.object(socket.socket, "sendto", below), patch("socket.getaddrinfo", below):
            with self.guard() as guard:
                for host in ("203.0.113.1", "fixture.invalid", "localhost.attacker.invalid", "::ffff:203.0.113.1"):
                    with self.subTest(host=host), socket.socket() as connection:
                        with self.assertRaises(GuardViolation):
                            connection.connect((host, 443))
                        with self.assertRaises(GuardViolation):
                            connection.connect_ex((host, 443))
                        with self.assertRaises(GuardViolation):
                            connection.sendto(b"sentinel", (host, 443))
                    with self.subTest(dns=host), self.assertRaises(GuardViolation):
                        socket.getaddrinfo(host, 443)
                with self.assertRaisesRegex(GuardViolation, "dns_escape"):
                    socket.gethostbyname("fixture.invalid")
                with socket.socket() as connection:
                    # Exercise the audit safety net without a real syscall.
                    with self.assertRaisesRegex(GuardViolation, "non_loopback_network"):
                        sys.audit("socket.connect", connection, ("203.0.113.1", 443))
                    with self.assertRaisesRegex(GuardViolation, "dns_escape"):
                        sys.audit("socket.getaddrinfo", "fixture.invalid", 443, 0, 0, 0)
                OBSERVATIONS.append({"case": self._testMethodName, "inert_bottom_calls": below.call_count, "receipt": guard.receipt()})
        self.assertEqual(below.call_count, 0)

    def test_localhost_is_resolved_numerically_without_dns_or_service_lookup(self):
        original = socket.getaddrinfo
        seen = []
        def numeric_only(host, port, family, type, proto, flags):
            seen.append({"host": host, "flags": flags})
            self.assertIn(host, ("127.0.0.1", "::1"))
            self.assertTrue(flags & socket.AI_NUMERICHOST)
            self.assertTrue(flags & socket.AI_NUMERICSERV)
            return original(host, port, family, type, proto, flags)
        with patch("socket.getaddrinfo", numeric_only):
            with self.guard():
                self.assertEqual(socket.getaddrinfo("localhost", 12345, type=socket.SOCK_STREAM)[0][4][0], "127.0.0.1")
                self.assertEqual(socket.getaddrinfo("localhost", 12345, family=socket.AF_INET6, type=socket.SOCK_STREAM)[0][4][0], "::1")
                with self.assertRaisesRegex(GuardViolation, "dns_escape"):
                    socket.getaddrinfo("localhost.evil.invalid", 12345)
                with self.assertRaisesRegex(GuardViolation, "service_lookup"):
                    socket.getaddrinfo("localhost", "http")
        self.assertEqual(len(seen), 2)

    def test_only_explicit_test_port_can_connect_on_loopback(self):
        with self.guard() as guard:
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", 0))
                listener.listen(1)
                port = listener.getsockname()[1]
                with socket.socket() as blocked:
                    with self.assertRaisesRegex(GuardViolation, "unapproved_loopback_port"):
                        blocked.connect(("127.0.0.1", port))
                guard.allow_loopback_port(port)
                with socket.create_connection(("localhost", port), timeout=1) as client:
                    with listener.accept()[0] as server:
                        client.sendall(b"sentinel-loopback-ping")
                        self.assertEqual(server.recv(64), b"sentinel-loopback-ping")
                OBSERVATIONS.append({"case": self._testMethodName, "receipt": guard.receipt()})

    def test_non_loopback_binding_and_unix_sockets_are_refused(self):
        below = Mock(side_effect=AssertionError("inert_bind_bottom_reached"))
        with patch.object(socket.socket, "bind", below), patch.object(socket.socket, "connect", below):
            with self.guard():
                with socket.socket() as listener:
                    with self.assertRaisesRegex(GuardViolation, "non_loopback_network"):
                        listener.bind(("0.0.0.0", 0))
                if hasattr(socket, "AF_UNIX"):
                    with socket.socket(socket.AF_UNIX) as client:
                        with self.assertRaisesRegex(GuardViolation, "non_inet_socket"):
                            client.connect("/tmp/sentinel-guard.sock")
        self.assertEqual(below.call_count, 0)

    def test_subprocess_and_ctypes_are_refused_before_native_entry(self):
        with self.guard():
            with self.assertRaisesRegex(GuardViolation, "native_or_subprocess"):
                sys.audit("subprocess.Popen", sys.executable, [sys.executable, "-c", "sentinel-never-execute"], None, None)
            with self.assertRaisesRegex(GuardViolation, "native_or_subprocess"):
                ctypes.CDLL(None)

    def test_fake_sdk_keeps_only_sentinel_credentials_and_safe_metadata(self):
        fake_bad_key = "sentinel-forbidden-only-test"
        with self.guard() as guard:
            sdk = guard.fake_sdk(provider="openai", api_key=guard.sentinel)
            self.assertEqual(sdk.complete("not-retained-request-tag")["message"], "sentinel fake response")
            self.assertEqual(sdk.api_key, SENTINEL_CREDENTIAL)
            with self.assertRaisesRegex(GuardViolation, "non_sentinel_credential") as refused:
                guard.fake_sdk(provider="openai", api_key=fake_bad_key)
            self.assertNotIn(fake_bad_key, str(refused.exception))
            self.assertNotIn(fake_bad_key, json.dumps(guard.receipt()))
            self.assertNotIn("not-retained-request-tag", json.dumps(guard.receipt()))
            self.assertEqual(guard.receipt()["fake_calls"], [{"provider": "openai", "call_index": 1, "credential_kind": "sentinel-only"}])
            OBSERVATIONS.append({"case": self._testMethodName, "receipt": guard.receipt()})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Finite isolated-runtime guard self-tests; no source-adjacent output by default")
    parser.add_argument("--out", type=Path, help="Explicit absolute artifact output directory; omitted means stdout summary only")
    parser.add_argument("--case", choices=sorted(name for name in dir(RuntimeSafetyGuardTests) if name.startswith("test_")),
                        help="Run one existing test method instead of the full finite suite")
    args = parser.parse_args()
    if args.out is not None and not args.out.is_absolute():
        parser.error("--out must be an absolute path")
    suite = (unittest.TestSuite([RuntimeSafetyGuardTests(args.case)]) if args.case else
             unittest.defaultTestLoader.loadTestsFromTestCase(RuntimeSafetyGuardTests))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    summary = {"tests": result.testsRun, "failures": len(result.failures), "errors": len(result.errors),
               "skipped": len(result.skipped), "success": result.wasSuccessful()}
    if args.out is not None:
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "selftest-observations.json").write_text(json.dumps(OBSERVATIONS, indent=2) + "\n")
        (args.out / "selftest-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    else:
        print(json.dumps(summary, sort_keys=True))
    raise SystemExit(0 if result.wasSuccessful() else 1)
