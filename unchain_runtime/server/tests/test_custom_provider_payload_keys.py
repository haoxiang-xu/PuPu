"""Regression tests for the custom-provider payload-key defects.

C2: ``_SECRET_FIELD_PATTERN`` must be fully anchored (^...$) so that legitimate
payload keys whose name merely CONTAINS "token" (e.g. ``max_tokens`` /
``max_output_tokens``) survive ``_sanitize_default_payload`` while exact
secret-shaped keys (``api_key`` / ``token`` / ``secret`` / ...) are still stripped.

C8: the ModelIO capabilities' ``allowed_payload_keys`` must UNION the protocol's
static allowlist with every key the model's own ``default_payload`` declares, so
that non-allowlist scalar keys (openai ``truncation``, ollama
``repeat_penalty`` / ``seed``, anthropic ``metadata``) are not silently dropped
by native._merged_payload's final allowed-key filter.
"""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import custom_provider as cp  # noqa: E402
import unchain_adapter  # noqa: E402  (ensures unchain is on sys.path for lazy imports)


# ── C2: anchored secret-field pattern in _sanitize_default_payload ────────────

class SanitizeDefaultPayloadC2Tests(unittest.TestCase):
    def test_max_tokens_survives(self):
        # "max_tokens" contains the substring "token" — the pre-fix unanchored
        # re.search stripped it, silently disabling the user's output cap.
        out = cp._sanitize_default_payload({"max_tokens": 8192})
        self.assertEqual(out, {"max_tokens": 8192})

    def test_max_output_tokens_survives(self):
        out = cp._sanitize_default_payload({"max_output_tokens": 4096})
        self.assertEqual(out, {"max_output_tokens": 4096})

    def test_exact_secret_keys_still_stripped(self):
        out = cp._sanitize_default_payload(
            {
                "api_key": "sk-leak",
                "apiKey": "sk-leak2",
                "token": "t",
                "secret": "s",
                "api-key": "k",
                "temperature": 0.7,
                "max_tokens": 2048,
            }
        )
        # Only exact secret-shaped keys removed; everything else preserved.
        self.assertEqual(out, {"temperature": 0.7, "max_tokens": 2048})

    def test_nested_secret_keys_still_stripped_but_token_suffix_survives(self):
        out = cp._sanitize_default_payload(
            {"reasoning": {"token": "leak", "max_tokens": 500, "effort": "high"}}
        )
        self.assertEqual(out, {"reasoning": {"max_tokens": 500, "effort": "high"}})

    def test_pattern_is_anchored(self):
        # Direct assertion on the pattern semantics: a full-string secret name
        # matches; a name that merely embeds one does not.
        self.assertTrue(cp._SECRET_FIELD_PATTERN.search("token"))
        self.assertTrue(cp._SECRET_FIELD_PATTERN.search("API_KEY"))
        self.assertIsNone(cp._SECRET_FIELD_PATTERN.search("max_tokens"))
        self.assertIsNone(cp._SECRET_FIELD_PATTERN.search("max_output_tokens"))
        self.assertIsNone(cp._SECRET_FIELD_PATTERN.search("token_budget"))


# ── C8: default_payload keys forced into allowed_payload_keys ─────────────────

class _CapturingModelIO:
    """Stand-in for a real unchain ModelIO that records what it was built with."""

    provider = "captured"

    def __init__(self, **kwargs):
        self.kwargs = kwargs


class AllowedPayloadKeysC8Tests(unittest.TestCase):
    def _caps_for_model(self, provider_def, model_id, api_key="k"):
        cfg = cp.parse_custom_provider({"custom_provider": provider_def})
        captured = {}

        def _capture(**kwargs):
            captured.update(kwargs)
            return _CapturingModelIO(**kwargs)

        # make_custom_model_io_factory does `from unchain.providers import ...`
        # at build time, so patch the source module BEFORE building the factory.
        import unchain.providers as providers

        with mock.patch.object(providers, "HyperspaceModelIO", _capture, create=True), \
             mock.patch.object(providers, "OpenAIModelIO", _capture, create=True), \
             mock.patch.object(providers, "OllamaModelIO", _capture, create=True):
            factory = cp.make_custom_model_io_factory(cfg, api_key)
            factory(
                SimpleNamespace(provider=cfg.twin, model=model_id, api_key=None),
                None,
            )
        return captured.get("model_capabilities", {}).get(model_id, {})

    def test_openai_truncation_key_allowed(self):
        p = {
            "id": "vllm",
            "protocol": "openai-responses",
            "base_url": "https://vllm.internal/v1",
            "auth": {"mode": "bearer"},
            "models": [
                {
                    "id": "llama-3.3-70b",
                    "capabilities": {"max_context_window_tokens": 128000},
                    "default_payload": {"truncation": "auto", "max_output_tokens": 4096},
                }
            ],
        }
        caps = self._caps_for_model(p, "llama-3.3-70b")
        allowed = caps.get("allowed_payload_keys", [])
        # Static protocol keys present…
        self.assertIn("temperature", allowed)
        self.assertIn("max_output_tokens", allowed)
        # …AND the declared non-allowlist key survives.
        self.assertIn("truncation", allowed)

    def test_ollama_repeat_penalty_and_seed_allowed(self):
        p = {
            "id": "remote-ollama",
            "protocol": "ollama",
            "base_url": "http://gpu-box:11434",
            "auth": {"mode": "none"},
            "models": [
                {
                    "id": "deepseek-r1:14b",
                    "default_payload": {"repeat_penalty": 1.1, "seed": 42, "num_predict": 256},
                }
            ],
        }
        caps = self._caps_for_model(p, "deepseek-r1:14b")
        allowed = caps.get("allowed_payload_keys", [])
        self.assertIn("num_predict", allowed)  # static
        self.assertIn("repeat_penalty", allowed)  # declared extra
        self.assertIn("seed", allowed)  # declared extra

    def test_anthropic_metadata_key_allowed(self):
        p = {
            "id": "sap-hyperspace",
            "protocol": "anthropic",
            "base_url": "http://localhost:6655/anthropic",
            "auth": {"mode": "x-api-key"},
            "models": [
                {
                    "id": "anthropic--claude-4.5-haiku",
                    "capabilities": {"max_context_window_tokens": 200000},
                    "default_payload": {"metadata": {"user_id": "u1"}, "max_tokens": 8192},
                }
            ],
        }
        caps = self._caps_for_model(p, "anthropic--claude-4.5-haiku")
        allowed = caps.get("allowed_payload_keys", [])
        self.assertIn("max_tokens", allowed)  # static
        self.assertIn("metadata", allowed)  # declared extra

    def test_static_keys_still_present_when_no_default_payload(self):
        p = {
            "id": "sap-hyperspace",
            "protocol": "anthropic",
            "base_url": "http://localhost:6655/anthropic",
            "auth": {"mode": "x-api-key"},
            "models": [
                {
                    "id": "anthropic--claude-4.5-haiku",
                    "capabilities": {"max_context_window_tokens": 200000},
                }
            ],
        }
        caps = self._caps_for_model(p, "anthropic--claude-4.5-haiku")
        allowed = caps.get("allowed_payload_keys", [])
        for static_key in cp.PROTOCOL_ALLOWED_PAYLOAD_KEYS["anthropic"]:
            self.assertIn(static_key, allowed)


if __name__ == "__main__":
    unittest.main()
