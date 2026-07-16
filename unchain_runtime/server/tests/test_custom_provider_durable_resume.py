"""Regression tests for C6 — durable resume drops the custom provider.

The durable resume store persists options through a strict allowlist and
re-supplies credentials fresh from the renderer. Before the fix neither the
custom_provider definition nor the custom API key were in those sets, and
resolve_resume_options forced modelId to the twin form — so a memory-enabled
custom-provider session that suspended on a tool and resumed rebuilt a BUILT-IN
agent pointed at the official endpoint (ollama → localhost:11434, openai →
api.openai.com, hyperspace → env-key fallback).

The fix:
  1. custom_provider is in _STABLE_RESUME_OPTION_KEYS (safe: no key in the def).
  2. custom_provider_api_key / customProviderApiKey are in the fresh-secret
     overlay (re-supplied by the renderer, never written to disk).
  3. resolve_resume_options keeps the custom.<slug>:<model> modelId intact so
     the adapter's custom override path reconstructs the twin from the cfg.
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import durable_interaction_host as host  # noqa: E402


def _anthropic_provider_def():
    return {
        "id": "sap-hyperspace",
        "protocol": "anthropic",
        "base_url": "http://localhost:6655/anthropic",
        "auth": {"mode": "x-api-key"},
        "models": [
            {"id": "anthropic--claude-4.5-haiku", "capabilities": {"max_context_window_tokens": 200000}}
        ],
    }


class DurableResumeCustomProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        patcher = mock.patch.dict(
            os.environ, {"UNCHAIN_DATA_DIR": self.temp_dir.name}, clear=False
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_custom_provider_def_persists_but_key_does_not(self) -> None:
        provider_def = _anthropic_provider_def()
        host.save_resume_context(
            session_id="chat-c6",
            run_id="run-c6",
            options={
                # provider/model saved as the TWIN (what the agent reports).
                "modelId": "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
                "memory_enabled": True,
                "custom_provider": provider_def,
                "custom_provider_api_key": "hs-secret-must-not-persist",
                "customProviderApiKey": "hs-secret-must-not-persist-camel",
            },
            provider="hyperspace",
            model="anthropic--claude-4.5-haiku",
        )

        persisted = host.load_resume_context("chat-c6", "run-c6")
        opts = persisted["options"]
        # The definition survives (needed to rebuild the cfg + factory).
        self.assertEqual(opts.get("custom_provider"), provider_def)
        self.assertEqual(
            opts.get("modelId"), "custom.sap-hyperspace:anthropic--claude-4.5-haiku"
        )
        # The key is NEVER written to disk (allowlist boundary preserved).
        self.assertNotIn("custom_provider_api_key", opts)
        self.assertNotIn("customProviderApiKey", opts)
        # And no secret string leaked anywhere in the serialized options.
        self.assertNotIn("hs-secret", str(opts))

    def test_resolve_reinjects_fresh_custom_key_and_keeps_custom_modelid(self) -> None:
        provider_def = _anthropic_provider_def()
        host.save_resume_context(
            session_id="chat-c6",
            run_id="run-c6",
            options={
                "modelId": "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
                "memory_enabled": True,
                "custom_provider": provider_def,
                "custom_provider_api_key": "stale-must-not-persist",
            },
            provider="hyperspace",
            model="anthropic--claude-4.5-haiku",
        )

        resolved = host.resolve_resume_options(
            session_id="chat-c6",
            run_id="run-c6",
            fresh_options={
                "custom_provider_api_key": "fresh-hs-key",
                # A stray built-in secret in the fresh overlay is still honoured
                # for its own key but must not clobber the custom modelId.
                "openai_api_key": "fresh-openai",
            },
            expected_provider="hyperspace",
            expected_model="anthropic--claude-4.5-haiku",
        )

        # The custom key is re-supplied by the renderer.
        self.assertEqual(resolved["custom_provider_api_key"], "fresh-hs-key")
        # CRITICAL (C6): modelId keeps the custom.<slug>:<model> form, NOT the
        # twin form "hyperspace:anthropic--claude-4.5-haiku". Otherwise the
        # adapter would rebuild a built-in agent.
        self.assertEqual(
            resolved["modelId"], "custom.sap-hyperspace:anthropic--claude-4.5-haiku"
        )
        self.assertNotEqual(
            resolved["modelId"], "hyperspace:anthropic--claude-4.5-haiku"
        )
        # The cfg is present so the adapter can rebuild the factory.
        self.assertEqual(resolved["custom_provider"], provider_def)

    def test_camel_case_custom_key_also_reinjected(self) -> None:
        host.save_resume_context(
            session_id="chat-c6",
            run_id="run-c6",
            options={
                "modelId": "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
                "custom_provider": _anthropic_provider_def(),
            },
            provider="hyperspace",
            model="anthropic--claude-4.5-haiku",
        )
        resolved = host.resolve_resume_options(
            session_id="chat-c6",
            run_id="run-c6",
            fresh_options={"customProviderApiKey": "fresh-camel-key"},
            expected_provider="hyperspace",
            expected_model="anthropic--claude-4.5-haiku",
        )
        self.assertEqual(resolved["customProviderApiKey"], "fresh-camel-key")

    def test_builtin_resume_still_forces_twin_modelid(self) -> None:
        # Byte-for-byte prior behaviour for a NON-custom session: modelId is
        # reconstructed from provider:model (no custom_provider present).
        host.save_resume_context(
            session_id="chat-builtin",
            run_id="run-builtin",
            options={"modelId": "openai:gpt-5", "toolkits": ["core"]},
            provider="openai",
            model="gpt-5",
        )
        resolved = host.resolve_resume_options(
            session_id="chat-builtin",
            run_id="run-builtin",
            fresh_options={"openai_api_key": "fresh"},
            expected_provider="openai",
            expected_model="gpt-5",
        )
        self.assertEqual(resolved["modelId"], "openai:gpt-5")
        self.assertEqual(resolved["provider"], "openai")
        self.assertEqual(resolved["model"], "gpt-5")
        self.assertNotIn("custom_provider", resolved)

    def test_custom_provider_in_stable_allowlist(self) -> None:
        # Direct guard on the allowlist membership so a future refactor that
        # drops the key is caught immediately.
        self.assertIn("custom_provider", host._STABLE_RESUME_OPTION_KEYS)
        self.assertIn("custom_provider_api_key", host._FRESH_SECRET_OPTION_KEYS)
        self.assertIn("customProviderApiKey", host._FRESH_SECRET_OPTION_KEYS)
        # The def-with-key must never be a persisted secret channel.
        self.assertNotIn("custom_provider_api_key", host._STABLE_RESUME_OPTION_KEYS)


if __name__ == "__main__":
    unittest.main()
