"""Factory propagation (design §7.3, FM13): the custom model_io_factory must
reach the developer agent and every explicitly-constructed subagent path."""
import sys
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import subagent_loader  # noqa: E402
import unchain_adapter  # noqa: E402


class _RecordingAgent:
    """Stand-in for UnchainAgent that records the model_io_factory it got."""

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.model_io_factory = kwargs.get("model_io_factory")
        self.provider = kwargs.get("provider")
        self.model = kwargs.get("model")


class _Module:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs


class DeveloperAgentPropagationTests(unittest.TestCase):
    def test_developer_agent_receives_factory(self):
        sentinel = object()
        agent = unchain_adapter._build_developer_agent(
            UnchainAgent=_RecordingAgent,
            ToolsModule=_Module,
            MemoryModule=_Module,
            PoliciesModule=_Module,
            SubagentModule=None,
            SubagentTemplate=None,
            SubagentPolicy=None,
            provider="hyperspace",
            model="anthropic--claude-4.5-haiku",
            api_key="k",
            max_iterations=8,
            toolkits=[],
            memory_manager=None,
            options={},
            recipe=None,
            model_io_factory=sentinel,
        )
        self.assertIs(agent.model_io_factory, sentinel)

    def test_builtin_developer_agent_has_no_factory_kwarg(self):
        # When no factory is threaded, model_io_factory must NOT be passed
        # (byte-clean built-in path).
        agent = unchain_adapter._build_developer_agent(
            UnchainAgent=_RecordingAgent,
            ToolsModule=_Module,
            MemoryModule=_Module,
            PoliciesModule=_Module,
            SubagentModule=None,
            SubagentTemplate=None,
            SubagentPolicy=None,
            provider="anthropic",
            model="claude-sonnet-4",
            api_key="k",
            max_iterations=8,
            toolkits=[],
            memory_manager=None,
            options={},
            recipe=None,
        )
        self.assertNotIn("model_io_factory", agent.kwargs)


class SubagentLoaderPropagationTests(unittest.TestCase):
    def test_build_child_agent_forwards_factory(self):
        sentinel = object()
        agent = subagent_loader._build_child_agent(
            UnchainAgent=_RecordingAgent,
            ToolsModule=_Module,
            PoliciesModule=_Module,
            toolkits=(),
            provider="hyperspace",
            model="anthropic--claude-4.5-haiku",
            api_key="k",
            max_iterations=9,
            name="worker",
            instructions="do work",
            model_io_factory=sentinel,
        )
        self.assertIs(agent.model_io_factory, sentinel)

    def test_build_child_agent_omits_factory_when_none(self):
        agent = subagent_loader._build_child_agent(
            UnchainAgent=_RecordingAgent,
            ToolsModule=_Module,
            PoliciesModule=_Module,
            toolkits=(),
            provider="anthropic",
            model="claude-sonnet-4",
            api_key="k",
            max_iterations=9,
            name="worker",
            instructions="do work",
        )
        self.assertNotIn("model_io_factory", agent.kwargs)


if __name__ == "__main__":
    unittest.main()
