"""Regression tests for C0/C5 — custom-provider key leak on built-in graph steps.

A recipe graph step may override ``.model`` onto a genuine built-in provider
(e.g. ``openai:gpt-4o``). The custom-provider cfg / model_io_factory must NOT be
threaded into such a step: ``_resolve_agent_api_key``'s cfg branch ignores the
provider argument and returns the custom key, which would then be wired into a
built-in OpenAIModelIO and sent to api.openai.com (C0), and both the factory and
``get_max_context_window_tokens`` would read the wrong config (C5).

Only a step whose provider equals the custom twin gets the cfg / factory; a
built-in step gets ``cfg=None`` and ``model_io_factory=None`` so it goes through
normal built-in assembly with its own / env key.
"""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from recipe import parse_recipe_json  # noqa: E402
import custom_provider as cp  # noqa: E402


CUSTOM_KEY = "hs-super-secret-key"


def _custom_graph_recipe():
    """Two agent steps. Step a1 stays on the custom model (no override); step a2
    overrides onto a real built-in provider (openai:gpt-4o)."""
    return {
        "name": "Graph",
        "description": "",
        # The graph-level model is irrelevant for a custom session because
        # options.modelId is set, but keep it a real provider.
        "model": "ollama:test",
        "max_iterations": None,
        "agent": {"prompt_format": "soul", "prompt": ""},
        "toolkits": [],
        "subagent_pool": [],
        "nodes": [
            {"id": "start", "type": "start", "outputs": [{"name": "text", "type": "string"}]},
            {"id": "a1", "type": "agent", "override": {"prompt": "first {{#start.text#}}"}, "outputs": [{"name": "output", "type": "string"}]},
            {"id": "a2", "type": "agent", "override": {"prompt": "{{#a1.output#}} second", "model": "openai:gpt-4o"}, "outputs": [{"name": "output", "type": "string"}]},
            {"id": "end", "type": "end"},
        ],
        "edges": [
            {"id": "e1", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "a1", "target_port_id": "in"},
            {"id": "e2", "kind": "flow", "source_node_id": "a1", "source_port_id": "out", "target_node_id": "a2", "target_port_id": "in"},
            {"id": "e3", "kind": "flow", "source_node_id": "a2", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"},
        ],
    }


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


def _custom_options():
    return {
        "modelId": "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
        "custom_provider": _anthropic_provider(),
        "custom_provider_api_key": CUSTOM_KEY,
    }


class _StepAgent:
    def __init__(self, *, provider, model, api_key, model_io_factory, instructions):
        self.provider = provider
        self.model = model
        self.api_key = api_key
        self.model_io_factory = model_io_factory
        self.instructions = instructions
        self._display_model = f"{provider}:{model}"
        self._toolkits = []

    def run(self, *, callback=None, run_id=None, **_kwargs):
        if callback:
            callback({"type": "final_message", "run_id": run_id, "iteration": 0, "content": self.instructions})
        return SimpleNamespace(messages=[{"role": "assistant", "content": self.instructions}])


class GraphStepKeyLeakTests(unittest.TestCase):
    def _run_graph(self, options):
        import unchain_adapter as ua

        recipe = parse_recipe_json(_custom_graph_recipe())
        built = []
        key_calls = []

        real_resolve = ua._resolve_agent_api_key

        def spy_resolve(opts, provider, cfg=None):
            resolved = real_resolve(opts, provider, cfg=cfg)
            key_calls.append({"provider": provider, "cfg": cfg, "resolved": resolved})
            return resolved

        def fake_build(**kwargs):
            agent = _StepAgent(
                provider=kwargs["provider"],
                model=kwargs["model"],
                api_key=kwargs["api_key"],
                model_io_factory=kwargs.get("model_io_factory"),
                instructions=kwargs["recipe"].agent.prompt,
            )
            built.append(agent)
            return agent

        with mock.patch.object(ua, "_UnchainAgent", object), \
             mock.patch.object(ua, "_build_developer_agent", side_effect=fake_build), \
             mock.patch.object(ua, "_resolve_agent_api_key", side_effect=spy_resolve), \
             mock.patch.object(ua, "_build_requested_toolkits", return_value=[]), \
             mock.patch.object(ua, "_build_bundle_from_result", return_value={}), \
             mock.patch.dict("os.environ", {"OPENAI_API_KEY": "sk-builtin-openai-env"}, clear=False):
            events = list(
                ua._stream_recipe_graph_events(
                    recipe=recipe,
                    message="Hello",
                    history=[],
                    attachments=[],
                    options=options,
                    session_id="s",
                )
            )
        return built, key_calls, events

    def test_custom_step_gets_factory_builtin_step_does_not(self):
        built, key_calls, _events = self._run_graph(_custom_options())
        self.assertEqual(len(built), 2)
        custom_step, builtin_step = built

        # Custom step: twin provider + factory attached.
        self.assertEqual(custom_step.provider, "hyperspace")
        self.assertIsNotNone(custom_step.model_io_factory)

        # Built-in step: real provider, NO custom factory.
        self.assertEqual(builtin_step.provider, "openai")
        self.assertEqual(builtin_step.model, "gpt-4o")
        self.assertIsNone(builtin_step.model_io_factory)

    def test_builtin_step_never_receives_custom_key(self):
        built, key_calls, _events = self._run_graph(_custom_options())
        # The built-in step's api_key must NOT be the custom key — that is the
        # exact leak (C0). It should be the env fallback instead.
        _custom_step, builtin_step = built
        self.assertNotEqual(builtin_step.api_key, CUSTOM_KEY)
        self.assertEqual(builtin_step.api_key, "sk-builtin-openai-env")

    def test_resolve_key_cfg_gated_per_step(self):
        _built, key_calls, _events = self._run_graph(_custom_options())
        # Filter to the two step resolutions (provider hyperspace / openai).
        by_provider = {call["provider"]: call for call in key_calls if call["provider"] in {"hyperspace", "openai"}}
        # Custom twin step: cfg passed → custom key.
        self.assertIsNotNone(by_provider["hyperspace"]["cfg"])
        self.assertEqual(by_provider["hyperspace"]["resolved"], CUSTOM_KEY)
        # Built-in step: cfg is None → env key, never the custom key.
        self.assertIsNone(by_provider["openai"]["cfg"])
        self.assertNotEqual(by_provider["openai"]["resolved"], CUSTOM_KEY)

    def test_all_custom_steps_still_get_factory(self):
        # Sanity: when NO step overrides onto a built-in, both stay custom.
        recipe_data = _custom_graph_recipe()
        # Drop the built-in override from a2.
        recipe_data["nodes"][2]["override"].pop("model")
        import unchain_adapter as ua

        recipe = parse_recipe_json(recipe_data)
        built = []

        def fake_build(**kwargs):
            agent = _StepAgent(
                provider=kwargs["provider"],
                model=kwargs["model"],
                api_key=kwargs["api_key"],
                model_io_factory=kwargs.get("model_io_factory"),
                instructions=kwargs["recipe"].agent.prompt,
            )
            built.append(agent)
            return agent

        with mock.patch.object(ua, "_UnchainAgent", object), \
             mock.patch.object(ua, "_build_developer_agent", side_effect=fake_build), \
             mock.patch.object(ua, "_build_requested_toolkits", return_value=[]), \
             mock.patch.object(ua, "_build_bundle_from_result", return_value={}):
            list(
                ua._stream_recipe_graph_events(
                    recipe=recipe,
                    message="Hello",
                    history=[],
                    attachments=[],
                    options=_custom_options(),
                    session_id="s",
                )
            )
        self.assertEqual(len(built), 2)
        for step in built:
            self.assertEqual(step.provider, "hyperspace")
            self.assertIsNotNone(step.model_io_factory)


if __name__ == "__main__":
    unittest.main()
