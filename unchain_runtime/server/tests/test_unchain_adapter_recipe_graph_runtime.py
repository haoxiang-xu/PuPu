import threading
import unittest
from types import SimpleNamespace
from unittest import mock

from recipe import parse_recipe_json


def _recipe_dict():
    return {
        "name": "Graph",
        "description": "",
        "model": "ollama:test",
        "max_iterations": None,
        "agent": {"prompt_format": "soul", "prompt": ""},
        "toolkits": [],
        "subagent_pool": [],
        "nodes": [
            {"id": "start", "type": "start", "outputs": [{"name": "text", "type": "string"}]},
            {"id": "a1", "type": "agent", "override": {"prompt": "first {{#start.text#}}"}, "outputs": [{"name": "output", "type": "string"}]},
            {"id": "a2", "type": "agent", "override": {"prompt": "{{#a1.output#}} second"}, "outputs": [{"name": "output", "type": "string"}]},
            {"id": "end", "type": "end"},
        ],
        "edges": [
            {"id": "e1", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "a1", "target_port_id": "in"},
            {"id": "e2", "kind": "flow", "source_node_id": "a1", "source_port_id": "out", "target_node_id": "a2", "target_port_id": "in"},
            {"id": "e3", "kind": "flow", "source_node_id": "a2", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"},
        ],
    }


def _tk(tk_id):
    return SimpleNamespace(id=tk_id, name=tk_id, tools={})


class FakeAgent:
    def __init__(self, instructions, toolkits):
        self.instructions = instructions
        self.provider = "ollama"
        self.model = "test"
        self._display_model = "ollama:test"
        self._toolkits = toolkits

    def run(self, *, callback=None, run_id=None, **_kwargs):
        if callback:
            callback({"type": "token_delta", "run_id": run_id, "iteration": 0, "delta": self.instructions})
            callback({"type": "final_message", "run_id": run_id, "iteration": 0, "content": self.instructions})
        return SimpleNamespace(messages=[{"role": "assistant", "content": self.instructions}])


class RecipeGraphRuntimeTests(unittest.TestCase):
    def test_stream_recipe_graph_runs_agents_in_order_and_only_final_is_final_message(self):
        import unchain_adapter as ua

        recipe = parse_recipe_json(_recipe_dict())
        built = []

        def fake_build(**kwargs):
            agent = FakeAgent(kwargs["recipe"].agent.prompt, kwargs["toolkits"])
            built.append(agent)
            return agent

        with mock.patch.object(ua, "_UnchainAgent", object), \
             mock.patch.object(ua, "_build_developer_agent", side_effect=fake_build), \
             mock.patch.object(ua, "_build_requested_toolkits", return_value=[]), \
             mock.patch.object(ua, "_build_bundle_from_result", return_value={}):
            events = list(
                ua._stream_recipe_graph_events(
                    recipe=recipe,
                    message="Hello",
                    history=[],
                    attachments=[],
                    options={"modelId": "ollama:test"},
                    session_id="s",
                )
            )

        self.assertEqual([agent.instructions for agent in built], ["first Hello", "first Hello second"])
        finals = [event for event in events if event.get("type") == "final_message"]
        self.assertEqual(len(finals), 1)
        self.assertEqual(finals[0]["content"], "first Hello second")
        step_finals = [event for event in events if event.get("type") == "workflow_step_final"]
        self.assertEqual(step_finals[0]["content"], "first Hello")

    def test_stream_recipe_graph_ignores_user_toolkits_without_merge_pool(self):
        import unchain_adapter as ua

        recipe = parse_recipe_json(_recipe_dict())

        def fake_build(**kwargs):
            return FakeAgent(kwargs["recipe"].agent.prompt, kwargs["toolkits"])

        with mock.patch.object(ua, "_UnchainAgent", object), \
             mock.patch.object(ua, "_build_developer_agent", side_effect=fake_build), \
             mock.patch.object(ua, "_build_requested_toolkits") as build_user_toolkits, \
             mock.patch.object(ua, "_build_bundle_from_result", return_value={}):
            list(
                ua._stream_recipe_graph_events(
                    recipe=recipe,
                    message="Hello",
                    history=[],
                    attachments=[],
                    options={"modelId": "ollama:test", "toolkits": ["core"]},
                    session_id="s",
                )
            )

        build_user_toolkits.assert_not_called()

    def test_stream_recipe_graph_emits_ask_user_question_from_human_input_callback(self):
        import unchain_adapter as ua

        data = _recipe_dict()
        data["nodes"] = [
            data["nodes"][0],
            data["nodes"][1],
            data["nodes"][-1],
        ]
        data["edges"] = [
            data["edges"][0],
            {
                "id": "e2",
                "kind": "flow",
                "source_node_id": "a1",
                "source_port_id": "out",
                "target_node_id": "end",
                "target_port_id": "in",
            },
        ]
        recipe = parse_recipe_json(data)

        class AskingAgent(FakeAgent):
            def run(self, *, callback=None, run_id=None, on_human_input=None, **_kwargs):
                answer = {}
                if callable(on_human_input):
                    request = SimpleNamespace(
                        request_id="ask-1",
                        question="Which stack?",
                        selection_mode="single",
                        to_dict=lambda: {
                            "request_id": "ask-1",
                            "question": "Which stack?",
                            "selection_mode": "single",
                            "options": [{"label": "Web", "value": "web"}],
                        },
                    )
                    answer = on_human_input(request)
                content = ",".join(answer.get("selected_values", [])) or "no answer"
                if callback:
                    callback({
                        "type": "final_message",
                        "run_id": run_id,
                        "iteration": 0,
                        "content": content,
                    })
                return SimpleNamespace(messages=[{"role": "assistant", "content": content}])

        def fake_build(**kwargs):
            return AskingAgent(kwargs["recipe"].agent.prompt, kwargs["toolkits"])

        events = []
        errors = []

        def consume_events():
            try:
                for event in ua._stream_recipe_graph_events(
                    recipe=recipe,
                    message="Hello",
                    history=[],
                    attachments=[],
                    options={"modelId": "ollama:test"},
                    session_id="s",
                ):
                    events.append(event)
                    if (
                        event.get("type") == "tool_call"
                        and event.get("tool_name") == "ask_user_question"
                    ):
                        ua.submit_tool_confirmation(
                            confirmation_id=event["confirmation_id"],
                            approved=True,
                            modified_arguments={"user_response": {"value": "web"}},
                        )
            except Exception as exc:
                errors.append(exc)

        with mock.patch.object(ua, "_UnchainAgent", object), \
             mock.patch.object(ua, "_build_developer_agent", side_effect=fake_build), \
             mock.patch.object(ua, "_build_requested_toolkits", return_value=[]), \
             mock.patch.object(ua, "_build_bundle_from_result", return_value={}):
            worker = threading.Thread(target=consume_events, daemon=True)
            worker.start()
            worker.join(timeout=2)

        self.assertFalse(worker.is_alive())
        self.assertEqual(errors, [])
        ask_event = next(
            event
            for event in events
            if event.get("type") == "tool_call"
            and event.get("tool_name") == "ask_user_question"
        )
        self.assertEqual(ask_event.get("call_id"), "ask-1")
        self.assertIsInstance(ask_event.get("confirmation_id"), str)
        self.assertEqual(ask_event.get("requires_confirmation"), True)
        self.assertEqual(ask_event.get("interact_type"), "single")
        self.assertEqual(ask_event.get("interact_config", {}).get("question"), "Which stack?")
        self.assertTrue(
            any(
                event.get("type") == "final_message" and event.get("content") == "web"
                for event in events
            )
        )

    def test_toolkit_pool_merge_switch_controls_user_toolkits(self):
        import unchain_adapter as ua

        data = _recipe_dict()
        data["nodes"].append({
            "id": "tp",
            "type": "toolkit_pool",
            "toolkits": [{"id": "external_api"}],
            "merge_with_user_selected": True,
        })
        data["edges"].append({
            "id": "a1tp",
            "kind": "attach",
            "source_node_id": "a1",
            "source_port_id": "attach_top",
            "target_node_id": "tp",
            "target_port_id": "attach_bot",
        })
        recipe = parse_recipe_json(data)
        compiled = ua._compile_recipe_graph_for_runtime(recipe)

        with mock.patch.object(ua, "_build_toolkits_by_ids", return_value=[_tk("external_api")]):
            merged = ua._resolve_graph_agent_toolkits(
                compiled["agents"][0],
                compiled,
                [_tk("core")],
                options={},
            )
        self.assertEqual([tk.id for tk in merged], ["core", "external_api"])

        compiled["attach_by_agent"]["a1"][0]["merge_with_user_selected"] = False
        with mock.patch.object(ua, "_build_toolkits_by_ids", return_value=[_tk("external_api")]):
            isolated = ua._resolve_graph_agent_toolkits(
                compiled["agents"][0],
                compiled,
                [_tk("core")],
                options={},
            )
        self.assertEqual([tk.id for tk in isolated], ["external_api"])


if __name__ == "__main__":
    unittest.main()
