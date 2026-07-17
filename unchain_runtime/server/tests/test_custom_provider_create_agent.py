"""Integration: _create_agent end-to-end wiring for a custom provider (design §7)."""
import sys
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import custom_provider as cp  # noqa: E402
import unchain_adapter  # noqa: E402


def _anthropic_provider():
    return {
        "id": "sap-hyperspace",
        "display_name": "SAP Hyperspace",
        "protocol": "anthropic",
        "base_url": "http://localhost:6655/anthropic",
        "auth": {"mode": "x-api-key"},
        "models": [
            {
                "id": "anthropic--claude-4.5-haiku",
                "capabilities": {"max_context_window_tokens": 200000, "supports_tools": True},
            }
        ],
    }


class _FakeAgent:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.provider = kwargs.get("provider", "")
        self.model = kwargs.get("model", "")
        self.model_io_factory = kwargs.get("model_io_factory")
        self.name = kwargs.get("name", "")
        for key, value in kwargs.items():
            if not hasattr(self, key):
                setattr(self, key, value)


class CreateAgentCustomProviderTests(unittest.TestCase):
    def _make(self, options):
        import recipe_loader

        with mock.patch.object(
            unchain_adapter, "_UnchainAgent", _FakeAgent
        ), mock.patch.object(
            unchain_adapter, "_load_recipe_from_options", return_value=None
        ), mock.patch.object(
            unchain_adapter, "_build_requested_toolkits", return_value=[]
        ), mock.patch.object(
            unchain_adapter, "_resolve_memory_runtime",
            return_value=({"requested": False, "available": False, "reason": ""}, None),
        ), mock.patch.object(
            recipe_loader, "load_recipe", return_value=None
        ):
            return unchain_adapter._create_agent(options)

    def test_custom_agent_built_with_factory(self):
        options = {
            "modelId": "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
            "custom_provider": _anthropic_provider(),
            "custom_provider_api_key": "hs-secret",
        }
        agent = self._make(options)
        # provider is the twin, model is the declared model, factory is attached.
        self.assertEqual(agent.provider, "hyperspace")
        self.assertEqual(agent.model, "anthropic--claude-4.5-haiku")
        self.assertIsNotNone(agent.model_io_factory)
        # context window comes from the declared capability (design §7.2).
        self.assertEqual(agent._max_context_window_tokens, int(200000 * 0.40))

    def test_undeclared_model_raises(self):
        options = {
            "modelId": "custom.sap-hyperspace:ghost-model",
            "custom_provider": _anthropic_provider(),
            "custom_provider_api_key": "hs-secret",
        }
        # The parse step already fails on the modelId mismatch (ghost-model not in
        # cfg.models) → custom_provider_model_not_declared, not a silent fallback.
        with self.assertRaises(cp.CustomProviderError) as ctx:
            self._make(options)
        self.assertEqual(ctx.exception.code, "custom_provider_model_not_declared")

    def test_missing_key_raises_in_create(self):
        options = {
            "modelId": "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
            "custom_provider": _anthropic_provider(),
            "custom_provider_api_key": "",
        }
        with self.assertRaises(cp.CustomProviderError) as ctx:
            self._make(options)
        self.assertEqual(ctx.exception.code, "custom_provider_missing_api_key")

    def test_builtin_agent_has_no_factory(self):
        # Byte-clean built-in path: no custom_provider → no factory kwarg.
        agent = self._make(
            {"modelId": "anthropic:claude-sonnet-4", "anthropic_api_key": "sk-ant-builtin"}
        )
        self.assertIsNone(agent.model_io_factory)


if __name__ == "__main__":
    unittest.main()
