"""Integration: verify _build_developer_agent wires the subagent loader."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import unchain_adapter  # noqa: E402


class _FakeTool:
    def __init__(self, name):
        self.name = name


class _FakeToolkit:
    def __init__(self, names):
        self.tools = {n: _FakeTool(n) for n in names}


class _FakeModule:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _FakeSubagentModule:
    def __init__(self, *, templates, policy):
        self.templates = templates
        self.policy = policy


class _FakeSubagentTemplate:
    def __init__(
        self,
        *,
        name,
        description,
        agent,
        allowed_modes,
        output_mode,
        memory_policy,
        parallel_safe,
        allowed_tools,
        model,
    ):
        self.name = name
        self.description = description
        self.agent = agent
        self.allowed_modes = allowed_modes
        self.output_mode = output_mode
        self.memory_policy = memory_policy
        self.parallel_safe = parallel_safe
        self.allowed_tools = allowed_tools
        self.model = model


class _FakeSubagentPolicy:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class _FakeAgent:
    def __init__(
        self,
        *,
        name,
        instructions,
        provider,
        model,
        api_key,
        modules,
    ):
        self.name = name
        self.instructions = instructions
        self.provider = provider
        self.model = model
        self.api_key = api_key
        self.modules = modules
        self._orchestration_role = None
        self._developer_model_id = None


class AdapterSubagentIntegrationTests(unittest.TestCase):
    def test_loader_registers_seeded_explore(self):
        with tempfile.TemporaryDirectory() as home:
            home_path = Path(home)
            user_dir = home_path / ".pupu" / "subagents"
            user_dir.mkdir(parents=True)
            from subagent_seeds import EXPLORE_SKELETON

            (user_dir / "Explore.skeleton").write_text(
                json.dumps(EXPLORE_SKELETON), encoding="utf-8"
            )
            with patch("pathlib.Path.home", return_value=home_path):
                agent = unchain_adapter._build_developer_agent(
                    UnchainAgent=_FakeAgent,
                    ToolsModule=_FakeModule,
                    MemoryModule=_FakeModule,
                    PoliciesModule=_FakeModule,
                    SubagentModule=_FakeSubagentModule,
                    SubagentTemplate=_FakeSubagentTemplate,
                    SubagentPolicy=_FakeSubagentPolicy,
                    provider="anthropic",
                    model="claude-haiku-4-5",
                    api_key=None,
                    max_iterations=30,
                    toolkits=[_FakeToolkit(["read", "grep", "glob", "lsp", "web_fetch", "shell", "ask_user_question"])],
                    memory_manager=None,
                    options={"workspace_roots": []},
                )
            sub_modules = [m for m in agent.modules if isinstance(m, _FakeSubagentModule)]
            self.assertEqual(len(sub_modules), 1)
            template_names = [t.name for t in sub_modules[0].templates]
            self.assertIn("Explore", template_names)
            self.assertNotIn("{{SUBAGENT_LIST}}", agent.instructions)
            self.assertIn("Explore", agent.instructions)

    def test_loader_failure_does_not_break_agent_build(self):
        import subagent_loader

        with patch.object(
            subagent_loader,
            "load_templates",
            side_effect=RuntimeError("loader exploded"),
        ):
            with patch("pathlib.Path.home", return_value=Path("/nonexistent")):
                agent = unchain_adapter._build_developer_agent(
                    UnchainAgent=_FakeAgent,
                    ToolsModule=_FakeModule,
                    MemoryModule=_FakeModule,
                    PoliciesModule=_FakeModule,
                    SubagentModule=_FakeSubagentModule,
                    SubagentTemplate=_FakeSubagentTemplate,
                    SubagentPolicy=_FakeSubagentPolicy,
                    provider="anthropic",
                    model="claude-haiku-4-5",
                    api_key=None,
                    max_iterations=30,
                    toolkits=[_FakeToolkit(["read"])],
                    memory_manager=None,
                    options={"workspace_roots": []},
                )
        sub_modules = [m for m in agent.modules if isinstance(m, _FakeSubagentModule)]
        self.assertEqual(sub_modules, [])
        self.assertNotIn("{{SUBAGENT_LIST}}", agent.instructions)
        self.assertIn("(no subagents registered)", agent.instructions)


if __name__ == "__main__":
    unittest.main()
