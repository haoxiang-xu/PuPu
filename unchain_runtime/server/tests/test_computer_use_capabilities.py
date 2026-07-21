from __future__ import annotations

import os
import unittest
from unittest import mock

import computer_use_flag
from computer_control.click3_adapter import parse_finder_bounds
from computer_use_capabilities import resolve_computer_use_capability
from computer_use_probe import _reset_probe_cache, probe_local_model


class ComputerUseCapabilityTests(unittest.TestCase):
    def setUp(self):
        self._previous_feature_flag = os.environ.get(
            "PUPU_FEATURE_COMPUTER_USE"
        )
        os.environ["PUPU_FEATURE_COMPUTER_USE"] = "1"
        computer_use_flag.set_local_beta_runtime_override(None)
        _reset_probe_cache()

    def tearDown(self):
        if self._previous_feature_flag is None:
            os.environ.pop("PUPU_FEATURE_COMPUTER_USE", None)
        else:
            os.environ["PUPU_FEATURE_COMPUTER_USE"] = self._previous_feature_flag
        computer_use_flag.set_local_beta_runtime_override(None)
        _reset_probe_cache()

    def test_native_provider_routes_are_explicit(self):
        anthropic = resolve_computer_use_capability("anthropic", "claude-opus-4-8")
        openai = resolve_computer_use_capability("openai", "gpt-5.6")
        self.assertTrue(anthropic["supported"])
        self.assertEqual(anthropic["protocol"], "anthropic.computer_20251124")
        self.assertTrue(openai["supported"])
        self.assertEqual(openai["protocol"], "openai.responses.computer.v1")
        self.assertFalse(
            resolve_computer_use_capability("openai", "gpt-5.5")["supported"]
        )

    def test_provider_kill_switch_fails_closed(self):
        with mock.patch.dict(os.environ, {"PUPU_COMPUTER_USE_OPENAI": "off"}):
            result = resolve_computer_use_capability("openai", "gpt-5.6")
        self.assertFalse(result["supported"])
        self.assertEqual(result["reason"], "provider_disabled")

    def test_local_beta_requires_switch_and_passing_cached_probe(self):
        disabled = resolve_computer_use_capability("ollama", "qwen3.5:4b-q4_K_M")
        self.assertEqual(disabled["mode"], "local_beta")
        self.assertEqual(disabled["reason"], "local_beta_disabled")

        computer_use_flag.set_local_beta_runtime_override(True)
        with mock.patch(
            "computer_use_probe.get_cached_probe",
            return_value={
                "supported": True,
                "model": "qwen3.5:4b-q4_k_m",
                "digest": "sha256:test",
                "checked_at": 1,
                "expires_at": 2,
            },
        ):
            enabled = resolve_computer_use_capability(
                "ollama", "qwen3.5:4b-q4_K_M"
            )
        self.assertTrue(enabled["supported"])
        self.assertEqual(enabled["protocol"], "pupu.local.click3.v1")


class OllamaProbeTests(unittest.TestCase):
    def setUp(self):
        _reset_probe_cache()

    def tearDown(self):
        _reset_probe_cache()

    def test_probe_checks_digest_show_capabilities_and_structured_action(self):
        calls = []

        def requester(method, url, payload, timeout):
            calls.append((method, url, payload, timeout))
            if url.endswith("/api/tags"):
                return {
                    "models": [
                        {"name": "qwen3.5:4b", "digest": "sha256:abc"}
                    ]
                }
            if url.endswith("/api/show"):
                return {"capabilities": ["completion", "vision", "tools"]}
            return {
                "message": {
                    "tool_calls": [
                        {
                            "function": {
                                "name": "computer",
                                "arguments": {
                                    "actions": [{"type": "screenshot"}]
                                },
                            }
                        }
                    ]
                }
            }

        result = probe_local_model("qwen3.5:4b", requester=requester)
        self.assertTrue(result["supported"])
        self.assertEqual(result["digest"], "sha256:abc")
        self.assertEqual([call[1].rsplit("/", 2)[-1] for call in calls], ["tags", "show", "chat"])

        cached = probe_local_model("qwen3.5:4b", requester=requester)
        self.assertEqual(cached, result)
        self.assertEqual(len(calls), 3)

    def test_probe_rejects_model_without_both_vision_and_tools(self):
        def requester(_method, url, _payload, _timeout):
            if url.endswith("/api/tags"):
                return {"models": [{"name": "qwen3.5:4b", "digest": "d"}]}
            return {"capabilities": ["tools"]}

        result = probe_local_model("qwen3.5:4b", requester=requester)
        self.assertFalse(result["supported"])
        self.assertEqual(result["reason"], "missing_vision_or_tools")


class Click3AdapterTests(unittest.TestCase):
    def test_finder_bounds_parser_is_strict_and_uses_yx_order(self):
        self.assertEqual(
            parse_finder_bounds("10,20,50,80"),
            {"x": 20.0, "y": 10.0, "width": 60.0, "height": 40.0},
        )
        self.assertIsNone(parse_finder_bounds("0,0,0,0"))
        self.assertIsNone(parse_finder_bounds("bounds: 10,20,50,80"))


if __name__ == "__main__":
    unittest.main()
