"""Contract tests for the outbound TLS trust factory.

The bug these guard against: the frozen PyInstaller sidecar inherits the build
machine's compiled-in OpenSSL trust path, which does not exist on a user's
machine, so every stdlib TLS call loaded zero trust anchors and failed with
``CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate``.

The absolute invariant asserted here is that no configuration, no fallback and
no failure mode ever yields a context that skips verification.
"""

import os
import ssl
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import net_tls  # noqa: E402


class _TrustEnv:
    """Context manager that pins the TLS-related environment for one test."""

    KEYS = ("PUPU_TLS_TRUST_SOURCE", "SSL_CERT_FILE", "SSL_CERT_DIR")

    def __init__(self, **overrides):
        self.overrides = overrides
        self.saved = {}

    def __enter__(self):
        for key in self.KEYS:
            self.saved[key] = os.environ.get(key)
            os.environ.pop(key, None)
        for key, value in self.overrides.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        net_tls.reset_outbound_tls_cache()
        return self

    def __exit__(self, *exc):
        for key, value in self.saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        net_tls.reset_outbound_tls_cache()
        return False


def _assert_verifying(testcase, context):
    testcase.assertIsInstance(context, ssl.SSLContext)
    testcase.assertTrue(
        context.check_hostname,
        "hostname verification must never be disabled",
    )
    testcase.assertEqual(
        context.verify_mode,
        ssl.CERT_REQUIRED,
        "certificate verification must never be disabled",
    )


class VerificationIsNeverDisabledTests(unittest.TestCase):
    """The security red line, asserted across every resolution strategy."""

    def test_every_strategy_verifies(self):
        for strategy in ("auto", "truststore", "certifi", "system"):
            with self.subTest(strategy=strategy):
                with _TrustEnv(PUPU_TLS_TRUST_SOURCE=strategy):
                    _assert_verifying(self, net_tls.get_outbound_ssl_context())

    def test_env_strategy_verifies(self):
        import certifi

        with _TrustEnv(PUPU_TLS_TRUST_SOURCE="env", SSL_CERT_FILE=certifi.where()):
            context = net_tls.get_outbound_ssl_context()
            _assert_verifying(self, context)
            self.assertEqual(net_tls.outbound_tls_trust_info()["source"], "env")

    def test_verification_survives_total_trust_source_failure(self):
        """Even when every preferred source fails, the result still verifies."""
        with _TrustEnv():
            with mock.patch.object(net_tls, "_build_from_env", return_value=(None, {})), \
                    mock.patch.object(net_tls, "_build_from_truststore", return_value=(None, {})), \
                    mock.patch.object(net_tls, "_build_from_certifi", return_value=(None, {})):
                context = net_tls.get_outbound_ssl_context()
                _assert_verifying(self, context)
                self.assertEqual(
                    net_tls.outbound_tls_trust_info()["source"], "system"
                )

    def test_builder_patching_does_not_leak_between_tests(self):
        """Guards the ordering-dependent pollution this test file once caused."""
        with _TrustEnv():
            with mock.patch.object(net_tls, "_build_from_truststore", return_value=(None, {})):
                self.assertEqual(
                    net_tls.outbound_tls_trust_info()["source"], "certifi"
                )
        with _TrustEnv():
            self.assertEqual(
                net_tls.outbound_tls_trust_info()["source"], "truststore"
            )


class MissingCaEnvironmentTests(unittest.TestCase):
    """Simulate the user machine where OpenSSL's default trust path is gone."""

    def test_system_default_has_no_anchors_when_cert_path_is_empty(self):
        """Reproduces the shipped bug: system trust resolves to nothing."""
        with tempfile.TemporaryDirectory() as tmp:
            empty_dir = Path(tmp) / "empty-certs"
            empty_dir.mkdir()
            with _TrustEnv(
                PUPU_TLS_TRUST_SOURCE="system",
                SSL_CERT_DIR=str(empty_dir),
                SSL_CERT_FILE=str(Path(tmp) / "does-not-exist.pem"),
            ):
                context = net_tls.get_outbound_ssl_context()
                # Still verifying -- it simply has nothing to verify against,
                # which is exactly why a handshake fails loudly instead of
                # silently succeeding.
                _assert_verifying(self, context)
                self.assertEqual(context.get_ca_certs(), [])
                self.assertTrue(net_tls.outbound_tls_trust_info()["trust_store_empty"])

    def test_auto_recovers_anchors_in_the_same_broken_environment(self):
        """The fix: identical broken env, but auto resolution finds real anchors."""
        with tempfile.TemporaryDirectory() as tmp:
            empty_dir = Path(tmp) / "empty-certs"
            empty_dir.mkdir()
            with _TrustEnv(
                SSL_CERT_DIR=str(empty_dir),
                SSL_CERT_FILE=str(Path(tmp) / "does-not-exist.pem"),
            ):
                context = net_tls.get_outbound_ssl_context()
                _assert_verifying(self, context)
                info = net_tls.outbound_tls_trust_info()
                # A non-existent SSL_CERT_FILE must not be accepted as the
                # trust source; resolution has to fall through past it.
                self.assertNotEqual(info["source"], "env")
                self.assertIn(info["source"], ("truststore", "certifi"))

    def test_certifi_fallback_supplies_anchors_without_truststore(self):
        with tempfile.TemporaryDirectory() as tmp:
            with _TrustEnv(
                PUPU_TLS_TRUST_SOURCE="certifi",
                SSL_CERT_FILE=str(Path(tmp) / "does-not-exist.pem"),
            ):
                context = net_tls.get_outbound_ssl_context()
                _assert_verifying(self, context)
                self.assertGreater(
                    len(context.get_ca_certs()),
                    0,
                    "certifi fallback must load real trust anchors",
                )
                self.assertEqual(
                    net_tls.outbound_tls_trust_info()["source"], "certifi"
                )

    def test_empty_but_existing_env_paths_are_rejected(self):
        """An empty bundle/dir looks configured but trusts nothing -- reject it."""
        with tempfile.TemporaryDirectory() as tmp:
            empty_dir = Path(tmp) / "certs"
            empty_dir.mkdir()
            empty_pem = Path(tmp) / "empty.pem"
            empty_pem.touch()
            with _TrustEnv(
                PUPU_TLS_TRUST_SOURCE="env",
                SSL_CERT_FILE=str(empty_pem),
                SSL_CERT_DIR=str(empty_dir),
            ):
                self.assertEqual(
                    net_tls.outbound_tls_trust_info()["source"], "system"
                )

    def test_nonexistent_env_paths_are_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            with _TrustEnv(
                PUPU_TLS_TRUST_SOURCE="env",
                SSL_CERT_FILE=str(Path(tmp) / "missing.pem"),
                SSL_CERT_DIR=str(Path(tmp) / "missing-dir"),
            ):
                # Falls through to system rather than trusting a bogus path.
                self.assertEqual(
                    net_tls.outbound_tls_trust_info()["source"], "system"
                )


class TrustErrorDiagnosticsTests(unittest.TestCase):
    def _cert_error(self):
        error = ssl.SSLCertVerificationError(
            1,
            "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: "
            "unable to get local issuer certificate (_ssl.c:1000)",
        )
        error.verify_code = 20
        error.verify_message = "unable to get local issuer certificate"
        return error

    def test_detects_cert_error_wrapped_by_urllib(self):
        # This is the exact shape the CEO's report arrived in: urllib hides the
        # SSL error inside URLError.reason, so a flat isinstance check misses it.
        wrapped = urllib.error.URLError(self._cert_error())
        self.assertTrue(net_tls.is_tls_trust_error(wrapped))

    def test_detects_cert_error_through_cause_chain(self):
        try:
            try:
                raise self._cert_error()
            except ssl.SSLCertVerificationError as inner:
                raise RuntimeError("install failed") from inner
        except RuntimeError as outer:
            self.assertTrue(net_tls.is_tls_trust_error(outer))

    def test_ignores_unrelated_errors(self):
        self.assertFalse(net_tls.is_tls_trust_error(TimeoutError("slow")))
        self.assertFalse(
            net_tls.is_tls_trust_error(urllib.error.URLError(OSError("no route")))
        )

    def test_guidance_is_actionable_and_never_suggests_disabling_verification(self):
        with _TrustEnv():
            message = net_tls.describe_tls_trust_failure()
        lowered = message.lower()
        for forbidden in (
            "disable",
            "verify=false",
            "check_hostname",
            "cert_none",
            "unverified",
            "insecure",
            "skip verification",
        ):
            self.assertNotIn(
                forbidden,
                lowered,
                f"guidance must never point users at {forbidden!r}",
            )
        self.assertIn("ssl_cert_file", lowered)
        self.assertIn("proxy", lowered)

    def test_annotate_only_touches_trust_errors(self):
        with _TrustEnv():
            plain = net_tls.annotate_tls_error("boom", TimeoutError("slow"))
            self.assertEqual(plain, "boom")

            annotated = net_tls.annotate_tls_error(
                "boom", urllib.error.URLError(self._cert_error())
            )
            self.assertTrue(annotated.startswith("boom -- "))
            self.assertIn("certificate", annotated.lower())


class TrustOrderContractTests(unittest.TestCase):
    """The resolution order is a shipped compatibility contract, not a default.

    It determines which certificates are actually trusted on machines already in
    the field, so reordering it silently changes live trust behaviour on existing
    installs. This test is the tripwire: if you are here because it failed, read
    docs/architecture/outbound-tls-trust.md before changing the expected value.
    Changing the order is a breaking change requiring an explicit decision, a
    release note, and security sign-off -- it is not a refactor.
    """

    def test_auto_resolution_order_is_frozen(self):
        self.assertEqual(
            net_tls._AUTO_ORDER,
            ("env", "truststore", "certifi"),
            "TLS trust resolution order changed. This is a BREAKING CHANGE, not "
            "a refactor -- see docs/architecture/outbound-tls-trust.md. "
            "certifi above truststore stops honouring corporate proxy roots; "
            "truststore above env overrides an admin-pinned SSL_CERT_FILE.",
        )

    def test_system_is_always_the_terminal_fallback(self):
        self.assertNotIn(
            "system",
            net_tls._AUTO_ORDER,
            "system is the terminal fallback appended after the chain, never a "
            "candidate inside it",
        )

    def test_accepted_strategy_names_are_frozen(self):
        self.assertEqual(
            set(net_tls._VALID_STRATEGIES),
            {"auto", "env", "truststore", "certifi", "system"},
            "PUPU_TLS_TRUST_SOURCE values are a documented support-facing escape "
            "hatch; removing one breaks field instructions already given out.",
        )

    def test_unrecognised_strategy_degrades_to_auto_not_to_an_error(self):
        """A typo in a support instruction must not brick outbound networking."""
        with _TrustEnv(PUPU_TLS_TRUST_SOURCE="trustsotre"):
            info = net_tls.outbound_tls_trust_info()
            self.assertEqual(info["requested"], "auto")
            _assert_verifying(self, net_tls.get_outbound_ssl_context())

    def test_env_is_first_so_an_admin_pinned_bundle_is_never_overridden(self):
        """The behavioural statement behind position 1, not just the tuple."""
        import certifi

        with _TrustEnv(SSL_CERT_FILE=certifi.where()):
            self.assertEqual(net_tls.outbound_tls_trust_info()["source"], "env")

    def test_truststore_outranks_certifi(self):
        """Position 2 vs 3: the OS keychain wins, so MITM proxy roots work."""
        with _TrustEnv():
            info = net_tls.outbound_tls_trust_info()
            if info["source"] != "truststore":
                self.skipTest("truststore backend unavailable in this environment")
            self.assertLess(
                info["attempted"].index("truststore"),
                net_tls._AUTO_ORDER.index("certifi") + 1,
            )
            self.assertNotIn("certifi", info["attempted"])

    def test_no_strategy_can_request_an_unverified_context(self):
        """There must be no value of the escape hatch that lowers security."""
        for strategy in net_tls._VALID_STRATEGIES + ("bogus", ""):
            with self.subTest(strategy=strategy):
                with _TrustEnv(PUPU_TLS_TRUST_SOURCE=strategy):
                    _assert_verifying(self, net_tls.get_outbound_ssl_context())


class StartupTrustLoggingTests(unittest.TestCase):
    """The boot line exists to make a silent fallback-chain change visible.

    Its specific job: catch ``truststore`` being dropped from the PyInstaller
    bundle. That degrades trust from "the OS keychain, including the corporate
    proxy root" to "Mozilla's bundle" with no symptom until a user behind a MITM
    proxy hits a handshake failure.
    """

    def test_log_line_names_the_resolved_source_and_chain(self):
        with _TrustEnv(PUPU_TLS_TRUST_SOURCE="certifi"):
            line = net_tls.describe_trust_source_for_log()
        self.assertIn("source=certifi", line)
        self.assertIn("chain=certifi", line)
        self.assertIn("frozen=no", line)
        self.assertEqual(len(line.splitlines()), 1, "must stay a single log line")

    def test_log_line_records_the_full_attempted_chain(self):
        with _TrustEnv():
            line = net_tls.describe_trust_source_for_log()
        # ``env`` is always tried first, so it must appear in the chain even
        # though it loses. That ordering is the contract being observed.
        self.assertIn("chain=env", line)

    def test_log_line_does_not_leak_absolute_paths(self):
        """Paths carry the user's home directory and account name."""
        import certifi

        with _TrustEnv(PUPU_TLS_TRUST_SOURCE="env", SSL_CERT_FILE=certifi.where()):
            line = net_tls.describe_trust_source_for_log()
        self.assertIn("bundle=cacert.pem", line)
        self.assertNotIn(os.sep + "Users", line)
        self.assertNotIn(str(Path.home()), line)
        self.assertNotIn(certifi.where(), line)

    def test_truststore_delegation_is_reported_without_a_bogus_anchor_count(self):
        with _TrustEnv(PUPU_TLS_TRUST_SOURCE="truststore"):
            line = net_tls.describe_trust_source_for_log()
        if "source=truststore" in line:
            self.assertIn("anchors=os-delegated", line)
            self.assertNotIn("anchors=0", line)

    def test_no_warning_when_the_os_trust_store_is_in_use(self):
        with _TrustEnv():
            if net_tls.outbound_tls_trust_info().get("source") == "truststore":
                self.assertIsNone(net_tls.outbound_tls_warning())

    def test_warns_when_truststore_was_tried_and_lost(self):
        """This is the PyInstaller --collect-submodules regression signal."""
        with _TrustEnv():
            with mock.patch.object(
                net_tls, "_build_from_truststore", return_value=(None, {})
            ):
                warning = net_tls.outbound_tls_warning()
                line = net_tls.describe_trust_source_for_log()
        self.assertIsNotNone(warning)
        self.assertIn("truststore", warning)
        self.assertIn("keychain", warning)
        self.assertIn("chain=env>truststore>certifi", line)

    def test_no_warning_when_an_admin_deliberately_pinned_a_bundle(self):
        """env winning is a deliberate override, not a degradation."""
        import certifi

        with _TrustEnv(SSL_CERT_FILE=certifi.where()):
            self.assertEqual(net_tls.outbound_tls_trust_info()["source"], "env")
            self.assertIsNone(net_tls.outbound_tls_warning())

    def test_warns_loudly_when_no_anchors_are_loadable(self):
        with _TrustEnv():
            with mock.patch.object(net_tls, "_build_from_truststore", return_value=(None, {})), \
                    mock.patch.object(net_tls, "_build_from_certifi", return_value=(None, {})), \
                    mock.patch.object(net_tls, "_system_trust_looks_empty", return_value=True):
                warning = net_tls.outbound_tls_warning()
                line = net_tls.describe_trust_source_for_log()
        self.assertIsNotNone(warning)
        self.assertIn("anchors=NONE", line)
        self.assertIn("no TLS trust anchors", warning)

    def test_warning_never_suggests_disabling_verification(self):
        with _TrustEnv():
            with mock.patch.object(
                net_tls, "_build_from_truststore", return_value=(None, {})
            ):
                warning = net_tls.outbound_tls_warning() or ""
        for forbidden in ("disable", "verify=false", "insecure", "cert_none"):
            self.assertNotIn(forbidden, warning.lower())

    def test_startup_hook_prints_and_never_raises(self):
        import io
        import contextlib

        import main as server_main

        buffer = io.StringIO()
        with _TrustEnv():
            with contextlib.redirect_stdout(buffer):
                server_main._log_outbound_tls_trust()
        self.assertIn("[unchain] outbound TLS trust:", buffer.getvalue())

        # A diagnostic must never be able to block the sidecar from booting.
        buffer = io.StringIO()
        with mock.patch.object(
            net_tls, "describe_trust_source_for_log", side_effect=RuntimeError("boom")
        ):
            with contextlib.redirect_stdout(buffer):
                server_main._log_outbound_tls_trust()
        self.assertIn("unavailable", buffer.getvalue())


class CallSiteWiringTests(unittest.TestCase):
    """Every stdlib TLS call site must hand urlopen the shared context."""

    def test_managed_runtime_passes_context(self):
        import mcp_managed_runtime

        sentinel = ssl.create_default_context()
        with mock.patch.object(
            net_tls, "get_outbound_ssl_context", return_value=sentinel
        ), mock.patch.object(
            mcp_managed_runtime, "get_outbound_ssl_context", return_value=sentinel
        ), mock.patch.object(
            mcp_managed_runtime.urllib.request, "urlopen"
        ) as fake:
            fake.return_value.__enter__.return_value.read.return_value = b"{}"
            mcp_managed_runtime._read_url_text("https://example.test/index.json")
            self.assertIs(fake.call_args.kwargs.get("context"), sentinel)

    def test_managed_runtime_annotates_cert_failure(self):
        import mcp_managed_runtime

        boom = urllib.error.URLError(
            ssl.SSLCertVerificationError(
                1,
                "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: "
                "unable to get local issuer certificate (_ssl.c:1000)",
            )
        )
        with _TrustEnv():
            with mock.patch.object(
                mcp_managed_runtime.urllib.request, "urlopen", side_effect=boom
            ):
                with self.assertRaises(
                    mcp_managed_runtime.McpManagedRuntimeError
                ) as caught:
                    mcp_managed_runtime._read_url_text("https://nodejs.org/dist/index.json")
        message = str(caught.exception)
        self.assertIn("certificate verification failed", message.lower())
        self.assertIn("SSL_CERT_FILE", message)
        self.assertNotIn("verify=False", message)

    def test_external_registry_passes_context(self):
        import mcp_external_registries

        sentinel = ssl.create_default_context()
        with mock.patch.object(
            mcp_external_registries, "get_outbound_ssl_context", return_value=sentinel
        ), mock.patch.object(mcp_external_registries, "urlopen") as fake:
            fake.return_value.__enter__.return_value.read.return_value = b"{}"
            mcp_external_registries._default_registry_fetcher(
                "https://registry.test/servers.json", 5, 1024
            )
            self.assertIs(fake.call_args.kwargs.get("context"), sentinel)

    def test_store_metadata_passes_context(self):
        import mcp_store_metadata

        sentinel = ssl.create_default_context()
        with mock.patch.object(
            mcp_store_metadata, "get_outbound_ssl_context", return_value=sentinel
        ), mock.patch.object(mcp_store_metadata, "urlopen") as fake:
            fake.return_value.__enter__.return_value.read.return_value = b"{}"
            mcp_store_metadata._default_http_json_fetcher(
                "https://metadata.test/pkg.json", {}, 5
            )
            self.assertIs(fake.call_args.kwargs.get("context"), sentinel)

    def test_oauth_passes_context(self):
        import mcp_oauth

        sentinel = ssl.create_default_context()
        with mock.patch.object(
            mcp_oauth, "get_outbound_ssl_context", return_value=sentinel
        ), mock.patch.object(mcp_oauth.urllib.request, "urlopen") as fake:
            fake.return_value.__enter__.return_value.read.return_value = b"{}"
            mcp_oauth._default_http_get("https://provider.test/.well-known/x")
            self.assertIs(fake.call_args.kwargs.get("context"), sentinel)

            fake.reset_mock()
            fake.return_value.__enter__.return_value.read.return_value = b"{}"
            mcp_oauth._default_http_post("https://provider.test/token", form={"a": "b"})
            self.assertIs(fake.call_args.kwargs.get("context"), sentinel)


if __name__ == "__main__":
    unittest.main()
