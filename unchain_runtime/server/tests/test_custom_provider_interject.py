"""Regression tests for C1/C9 — interject side-calls misroute + fail-open.

A mid-run interject (classifier + btw side answer) runs against a snapshot of
the live run's options. For a custom-provider run those options carry
custom_provider, but the pre-fix interject path built a BARE Agent — no cfg, no
model_io_factory — so:
  - the openai twin got downgraded to gpt-4.1 and sent to api.openai.com with the
    env OPENAI_API_KEY (fail-open key leak);
  - the anthropic → hyperspace twin used the default HyperspaceModelIO pointed at
    the official endpoint instead of the user's base_url.

The fix routes both interject sites through ``build_interject_agent``, which is
cfg-aware: parses custom_provider, builds the factory, resolves the key
cfg-aware, and skips the _GENERAL_MODEL_BY_PROVIDER downgrade (§7.2). Built-in
sessions are byte-for-byte unchanged.
"""
import sys
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import unchain_adapter as adapter  # noqa: E402


CUSTOM_KEY = "hs-super-secret-key"


def _anthropic_provider():
    return {
        "id": "sap-hyperspace",
        "protocol": "anthropic",
        "base_url": "http://localhost:6655/anthropic",
        "auth": {"mode": "x-api-key"},
        "models": [
            {"id": "anthropic--claude-4.5-haiku", "capabilities": {"max_context_window_tokens": 200000}}
        ],
    }


def _openai_provider():
    return {
        "id": "my-vllm",
        "protocol": "openai-responses",
        "base_url": "https://vllm.internal/v1",
        "auth": {"mode": "bearer"},
        "models": [{"id": "llama-3.3-70b", "capabilities": {"max_context_window_tokens": 128000}}],
    }


def _custom_options(provider_def, api_key=CUSTOM_KEY):
    model = provider_def["models"][0]["id"]
    return {
        "modelId": f"custom.{provider_def['id']}:{model}",
        "custom_provider": provider_def,
        "custom_provider_api_key": api_key,
    }


class _CaptureAgent:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.provider = kwargs.get("provider")
        self.model = kwargs.get("model")
        self.api_key = kwargs.get("api_key")
        self.model_io_factory = kwargs.get("model_io_factory")
        _CaptureAgent.instances.append(self)

    def run(self, *args, **kwargs):
        return mock.MagicMock(messages=[{"role": "assistant", "content": "ok"}])


def _build(options, env=None):
    """Call build_interject_agent with unchain.Agent swapped for the capturer."""
    import unchain

    _CaptureAgent.instances = []
    env = env or {}
    with mock.patch.object(unchain, "Agent", _CaptureAgent), \
         mock.patch.dict("os.environ", env, clear=False):
        adapter.build_interject_agent(options, name="interject_test")
    assert len(_CaptureAgent.instances) == 1
    return _CaptureAgent.instances[0]


class BuildInterjectAgentCustomTests(unittest.TestCase):
    def test_anthropic_twin_gets_factory_and_base_url_endpoint(self):
        agent = _build(_custom_options(_anthropic_provider()))
        self.assertEqual(agent.provider, "hyperspace")
        self.assertEqual(agent.model, "anthropic--claude-4.5-haiku")
        # A model_io_factory means the agent will use the custom base_url, not
        # the official Anthropic endpoint (C1/C9 anthropic-twin fix).
        self.assertIsNotNone(agent.model_io_factory)
        self.assertEqual(agent.api_key, CUSTOM_KEY)

    def test_openai_twin_gets_factory_not_downgraded(self):
        # The openai twin must NOT be downgraded to gpt-4.1 (§7.2) and must carry
        # the factory + custom key, never the env OPENAI_API_KEY.
        agent = _build(
            _custom_options(_openai_provider()),
            env={"OPENAI_API_KEY": "sk-env-openai-should-not-leak"},
        )
        self.assertEqual(agent.provider, "openai")
        self.assertEqual(agent.model, "llama-3.3-70b")  # NOT gpt-4.1
        self.assertNotEqual(agent.model, "gpt-4.1")
        self.assertIsNotNone(agent.model_io_factory)
        self.assertEqual(agent.api_key, CUSTOM_KEY)
        self.assertNotEqual(agent.api_key, "sk-env-openai-should-not-leak")

    def test_missing_custom_key_raises(self):
        import custom_provider as cp

        with self.assertRaises(cp.CustomProviderError) as ctx:
            _build(_custom_options(_anthropic_provider(), api_key=""))
        self.assertEqual(ctx.exception.code, "custom_provider_missing_api_key")


class BuildInterjectAgentBuiltinUnchangedTests(unittest.TestCase):
    def test_builtin_openai_still_downgrades_and_has_no_factory(self):
        # Byte-for-byte prior behaviour: built-in openai downgrades to the cheap
        # tier and never gets a custom factory.
        agent = _build(
            {"modelId": "openai:gpt-5"},
            env={"OPENAI_API_KEY": "sk-env-openai"},
        )
        self.assertEqual(agent.provider, "openai")
        self.assertIsNone(agent.model_io_factory)
        # Downgrade target from _GENERAL_MODEL_BY_PROVIDER (subject to catalog
        # availability); at minimum it must not carry any custom factory and use
        # the env key.
        self.assertEqual(agent.api_key, "sk-env-openai")

    def test_builtin_ollama_has_no_factory(self):
        agent = _build({"modelId": "ollama:test"})
        self.assertEqual(agent.provider, "ollama")
        self.assertIsNone(agent.model_io_factory)


class InterjectCallSitesUseHelperTests(unittest.TestCase):
    """The two live interject entry points must delegate to build_interject_agent."""

    def test_classifier_uses_helper(self):
        from interject_router import _default_run_classifier

        captured = {}

        class _Agent:
            def run(self, *a, **k):
                return mock.MagicMock(messages=[{"role": "assistant", "content": "fyi"}])

        def fake_helper(options, *, name):
            captured["name"] = name
            captured["options"] = options
            return _Agent()

        opts = _custom_options(_anthropic_provider())
        with mock.patch.object(adapter, "build_interject_agent", side_effect=fake_helper):
            runner = _default_run_classifier(opts)
            runner([{"role": "user", "content": "hi"}])
        self.assertEqual(captured["name"], "interject_router")
        self.assertEqual(captured["options"], opts)

    def test_side_answer_uses_helper(self):
        from route_interject import _run_side_answer

        captured = {}

        class _Agent:
            def run(self, *a, **k):
                return mock.MagicMock(messages=[{"role": "assistant", "content": "answer"}])

        def fake_helper(options, *, name):
            captured["name"] = name
            captured["options"] = options
            return _Agent()

        opts = _custom_options(_openai_provider())
        with mock.patch.object(adapter, "build_interject_agent", side_effect=fake_helper):
            _run_side_answer([{"role": "user", "content": "hi"}], opts)
        self.assertEqual(captured["name"], "interject_side")
        self.assertEqual(captured["options"], opts)


if __name__ == "__main__":
    unittest.main()
