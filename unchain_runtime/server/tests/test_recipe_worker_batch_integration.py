import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import unchain_adapter  # noqa: E402
from recipe import Recipe, RecipeAgent, RecipeSubagentRef  # noqa: E402
from unchain.agent import Agent, SubagentModule  # noqa: E402
from unchain.kernel import ModelTurnResult, ToolCall  # noqa: E402
from unchain.subagents import SubagentTemplate  # noqa: E402


class _SequenceModelIO:
    def __init__(self, steps):
        self.provider = "openai"
        self.model = "openai-model"
        self._steps = list(steps)

    def fetch_turn(self, request):
        if not self._steps:
            raise AssertionError("unexpected model turn")
        step = self._steps.pop(0)
        return step(request) if callable(step) else step


def _tool_turn(*, call_id, name, arguments):
    return ModelTurnResult(
        assistant_messages=[
            {
                "role": "assistant",
                "type": "function_call",
                "call_id": call_id,
                "name": name,
                "arguments": json.dumps(arguments),
            }
        ],
        tool_calls=[ToolCall(call_id=call_id, name=name, arguments=arguments)],
        final_text="",
    )


def _text_turn(text):
    return ModelTurnResult(
        assistant_messages=[{"role": "assistant", "content": text}],
        tool_calls=[],
        final_text=text,
    )


class RecipeWorkerBatchIntegrationTests(unittest.TestCase):
    def test_materialized_explore_workers_overlap_with_isolated_run_contexts(self):
        barrier = threading.Barrier(3)
        lock = threading.Lock()
        active = 0
        max_active = 0
        run_contexts = []

        def fake_stream_recipe_graph_events(
            *, session_id, run_id_override, message, **_kwargs
        ):
            nonlocal active, max_active
            with lock:
                active += 1
                max_active = max(max_active, active)
                run_contexts.append((session_id, run_id_override, message))
            try:
                barrier.wait(timeout=3)
                yield {"type": "final_message", "content": f"done: {message}"}
            finally:
                with lock:
                    active -= 1

        with tempfile.TemporaryDirectory() as tmp:
            home_path = Path(tmp)
            with mock.patch("pathlib.Path.home", return_value=home_path):
                from recipe_loader import save_recipe

                save_recipe({
                    "name": "Explore",
                    "description": "Repository scout",
                    "model": None,
                    "max_iterations": None,
                    "subagent_profile": {
                        "allowed_modes": ["delegate", "worker"],
                        "output_mode": "summary",
                        "memory_policy": "ephemeral",
                        "parallel_safe": True,
                    },
                    "agent": {"prompt_format": "soul", "prompt": "Explore"},
                    "toolkits": [],
                    "subagent_pool": [],
                })
                parent_recipe = Recipe(
                    name="Default",
                    description="",
                    model=None,
                    max_iterations=None,
                    agent=RecipeAgent(prompt_format="soul", prompt="parent"),
                    toolkits=(),
                    subagent_pool=(
                        RecipeSubagentRef(
                            kind="recipe_ref",
                            recipe_name="Explore",
                            disabled_tools=(),
                        ),
                    ),
                )
                templates = unchain_adapter._materialize_recipe_subagents(
                    recipe=parent_recipe,
                    toolkits=[],
                    provider="openai",
                    model="openai-model",
                    api_key=None,
                    max_iterations=5,
                    UnchainAgent=Agent,
                    ToolsModule=object,
                    PoliciesModule=object,
                    SubagentTemplate=SubagentTemplate,
                    options={},
                )

        self.assertEqual(len(templates), 1)
        self.assertEqual(templates[0].allowed_modes, ("delegate", "worker"))
        self.assertIs(templates[0].parallel_safe, True)

        def join_turn(request):
            payload = json.loads(request.messages[-1]["output"])
            self.assertEqual(payload["status"], "completed")
            self.assertEqual(len(payload["results"]), 3)
            return _text_turn("joined")

        parent = Agent(
            name="manager",
            provider="openai",
            modules=(SubagentModule(templates=templates),),
            model_io_factory=lambda spec, ctx: _SequenceModelIO(
                [
                    _tool_turn(
                        call_id="batch",
                        name="spawn_worker_batch",
                        arguments={
                            "tasks": [
                                {"target": "Explore", "task": "one"},
                                {"target": "Explore", "task": "two"},
                                {"target": "Explore", "task": "three"},
                            ]
                        },
                    ),
                    join_turn,
                ]
            ),
        )

        with mock.patch.object(
            unchain_adapter,
            "_stream_recipe_graph_events",
            side_effect=fake_stream_recipe_graph_events,
        ):
            result = parent.run(
                "fan out",
                session_id="root-session",
                run_id="root-run",
                max_iterations=2,
            )

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.messages[-1]["content"], "joined")
        self.assertEqual(max_active, 3)
        self.assertEqual(len(run_contexts), 3)
        self.assertEqual(len({item[0] for item in run_contexts}), 3)
        self.assertEqual(len({item[1] for item in run_contexts}), 3)


if __name__ == "__main__":
    unittest.main()
