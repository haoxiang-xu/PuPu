"""Test-connection endpoint tests (design §7.6): error mapping + one-shot key."""
import sys
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

# Importing unchain_adapter runs _ensure_unchain_on_path(), which puts the
# unchain source on sys.path so the factory's lazy `from unchain.providers ...`
# resolves.
import unchain_adapter  # noqa: E402,F401
import custom_provider as cp  # noqa: E402


def _anthropic_provider():
    return {
        "id": "sap-hyperspace",
        "display_name": "SAP Hyperspace",
        "protocol": "anthropic",
        "base_url": "http://localhost:6655/anthropic",
        "auth": {"mode": "x-api-key"},
        "models": [{"id": "anthropic--claude-4.5-haiku", "capabilities": {"max_context_window_tokens": 200000}}],
    }


class _AuthError(Exception):
    status_code = 401


class _TimeoutErr(Exception):
    pass


class TestConnectionMappingTests(unittest.TestCase):
    def test_missing_key_maps_error(self):
        result = cp.test_custom_provider(_anthropic_provider(), "")
        self.assertFalse(result["ok"])
        self.assertEqual(result["code"], "custom_provider_missing_api_key")

    def test_invalid_provider_returns_structured_error(self):
        bad = _anthropic_provider()
        bad["protocol"] = "nope"
        result = cp.test_custom_provider(bad, "k")
        self.assertFalse(result["ok"])
        self.assertEqual(result["code"], "custom_provider_invalid_protocol")

    def test_success(self):
        class _FakeClient:
            class messages:  # noqa: N801
                @staticmethod
                def create(**kwargs):
                    return object()

        with mock.patch("anthropic.Anthropic", return_value=_FakeClient()):
            result = cp.test_custom_provider(_anthropic_provider(), "hs-key")
        self.assertTrue(result["ok"])
        self.assertEqual(result["model"], "anthropic--claude-4.5-haiku")

    def test_auth_failure_mapped(self):
        class _FakeClient:
            class messages:  # noqa: N801
                @staticmethod
                def create(**kwargs):
                    raise _AuthError("invalid x-api-key")

        with mock.patch("anthropic.Anthropic", return_value=_FakeClient()):
            result = cp.test_custom_provider(_anthropic_provider(), "bad-key")
        self.assertFalse(result["ok"])
        self.assertEqual(result["code"], "provider_auth_failed")

    def test_timeout_mapped(self):
        class _FakeClient:
            class messages:  # noqa: N801
                @staticmethod
                def create(**kwargs):
                    raise _TimeoutErr("Request timed out")

        with mock.patch("anthropic.Anthropic", return_value=_FakeClient()):
            result = cp.test_custom_provider(_anthropic_provider(), "k")
        self.assertFalse(result["ok"])
        self.assertEqual(result["code"], "provider_timeout")

    def test_unreachable_mapped(self):
        class _FakeClient:
            class messages:  # noqa: N801
                @staticmethod
                def create(**kwargs):
                    raise ConnectionError("Connection refused")

        with mock.patch("anthropic.Anthropic", return_value=_FakeClient()):
            result = cp.test_custom_provider(_anthropic_provider(), "k")
        self.assertFalse(result["ok"])
        self.assertEqual(result["code"], "provider_unreachable")

    def test_bad_response_mapped_and_redacted(self):
        class _FakeClient:
            class messages:  # noqa: N801
                @staticmethod
                def create(**kwargs):
                    raise RuntimeError("404 not found; api_key=sk-should-not-appear")

        with mock.patch("anthropic.Anthropic", return_value=_FakeClient()):
            result = cp.test_custom_provider(_anthropic_provider(), "k")
        self.assertFalse(result["ok"])
        self.assertEqual(result["code"], "provider_bad_response")
        self.assertNotIn("sk-should-not-appear", result["message"])


if __name__ == "__main__":
    unittest.main()
