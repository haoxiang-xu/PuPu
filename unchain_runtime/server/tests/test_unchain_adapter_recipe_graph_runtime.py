import threading
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

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
    def test_stream_recipe_graph_rejects_memory_owned_full_history_before_agent_run(self):
        import unchain_adapter as ua
        from unchain.memory import InMemorySessionStore, MemoryManager

        recipe = parse_recipe_json(_recipe_dict())
        store = InMemorySessionStore()
        store.save(
            "s",
            {
                "messages": [
                    {"role": "user", "content": "old user"},
                    {"role": "assistant", "content": "old assistant"},
                ]
            },
        )
        memory_manager = MemoryManager(store=store)

        with mock.patch.object(ua, "_UnchainAgent", object), \
             mock.patch.object(ua, "_build_developer_agent") as build_agent, \
             mock.patch.object(
                 ua,
                 "_resolve_memory_runtime",
                 return_value=(
                     {"requested": True, "available": True, "reason": ""},
                     memory_manager,
                 ),
             ), \
             mock.patch.object(ua, "_build_requested_toolkits", return_value=[]):
            with self.assertRaisesRegex(RuntimeError, "session history ownership conflict"):
                list(
                    ua._stream_recipe_graph_events(
                        recipe=recipe,
                        message="new user",
                        history=[
                            {"role": "user", "content": "old user"},
                            {"role": "assistant", "content": "old assistant"},
                        ],
                        attachments=[],
                        options={"modelId": "ollama:test", "memory_enabled": True},
                        session_id="s",
                    )
                )

        build_agent.assert_not_called()

    def test_stream_recipe_graph_rethrows_checkpoint_resume_required_before_agent_run(self):
        import unchain_adapter as ua

        recipe = parse_recipe_json(_recipe_dict())

        class CheckpointResumeRequired(RuntimeError):
            code = "execution_checkpoint_resume_required"

        class CheckpointMemoryManager:
            def __init__(self):
                self.prepare_calls = 0
                self.commit_calls = 0

            def prepare_messages(self, **_kwargs):
                self.prepare_calls += 1
                raise CheckpointResumeRequired("checkpoint must be resumed")

            def commit_messages(self, **_kwargs):
                self.commit_calls += 1

        memory_manager = CheckpointMemoryManager()
        events = []

        with mock.patch.object(ua, "_UnchainAgent", object), \
             mock.patch.object(ua, "_build_developer_agent") as build_agent, \
             mock.patch.object(
                 ua,
                 "_resolve_memory_runtime",
                 return_value=(
                     {"requested": True, "available": True, "reason": ""},
                     memory_manager,
                 ),
             ), \
             mock.patch.object(ua, "_build_requested_toolkits", return_value=[]):
            with self.assertRaisesRegex(RuntimeError, "checkpoint must be resumed"):
                for event in ua._stream_recipe_graph_events(
                    recipe=recipe,
                    message="new user",
                    history=[],
                    attachments=[],
                    options={"modelId": "ollama:test", "memory_enabled": True},
                    session_id="s",
                ):
                    events.append(event)

        self.assertEqual(events, [])
        self.assertEqual(memory_manager.prepare_calls, 1)
        self.assertEqual(memory_manager.commit_calls, 0)
        build_agent.assert_not_called()

    def test_stream_recipe_graph_keeps_fallback_for_non_ownership_memory_failure(self):
        import unchain_adapter as ua

        recipe = parse_recipe_json(_recipe_dict())
        built = []

        class BrokenMemoryManager:
            def __init__(self):
                self.commit_calls = 0

            def prepare_messages(self, **_kwargs):
                raise RuntimeError("vector backend unavailable")

            def commit_messages(self, **_kwargs):
                self.commit_calls += 1
                return None

        broken_memory = BrokenMemoryManager()

        def fake_build(**kwargs):
            agent = FakeAgent(kwargs["recipe"].agent.prompt, kwargs["toolkits"])
            built.append(agent)
            return agent

        with mock.patch.object(ua, "_UnchainAgent", object), \
             mock.patch.object(ua, "_build_developer_agent", side_effect=fake_build), \
             mock.patch.object(
                 ua,
                 "_resolve_memory_runtime",
                 return_value=(
                     {"requested": True, "available": True, "reason": ""},
                     broken_memory,
                 ),
             ), \
             mock.patch.object(ua, "_build_requested_toolkits", return_value=[]), \
             mock.patch.object(ua, "_build_bundle_from_result", return_value={}):
            events = list(
                ua._stream_recipe_graph_events(
                    recipe=recipe,
                    message="new user",
                    history=[],
                    attachments=[],
                    options={"modelId": "ollama:test", "memory_enabled": True},
                    session_id="s",
                )
            )

        self.assertEqual(len(built), 2)
        self.assertTrue(
            any(
                event.get("type") == "memory_prepare"
                and event.get("applied") is False
                and "vector backend unavailable" in str(event.get("fallback_reason") or "")
                for event in events
            )
        )
        self.assertEqual(broken_memory.commit_calls, 0)

    def test_stream_recipe_graph_forwards_prepare_revision_to_commit(self):
        import unchain_adapter as ua

        recipe = parse_recipe_json(_recipe_dict())

        class RevisionMemoryManager:
            def __init__(self):
                self._last_prepare_info = {"session_revision": 7}
                self._last_commit_info = {}
                self.expected_revision = None

            @property
            def last_prepare_info(self):
                return dict(self._last_prepare_info)

            @property
            def last_commit_info(self):
                return dict(self._last_commit_info)

            def prepare_messages(self, **kwargs):
                return list(kwargs["incoming"])

            def commit_messages(self, *, expected_revision=None, **_kwargs):
                self.expected_revision = expected_revision

        manager = RevisionMemoryManager()

        def fake_build(**kwargs):
            return FakeAgent(kwargs["recipe"].agent.prompt, kwargs["toolkits"])

        with mock.patch.object(ua, "_UnchainAgent", object), \
             mock.patch.object(ua, "_build_developer_agent", side_effect=fake_build), \
             mock.patch.object(
                 ua,
                 "_resolve_memory_runtime",
                 return_value=(
                     {"requested": True, "available": True, "reason": ""},
                     manager,
                 ),
             ), \
             mock.patch.object(ua, "_build_requested_toolkits", return_value=[]), \
             mock.patch.object(ua, "_build_bundle_from_result", return_value={}):
            list(
                ua._stream_recipe_graph_events(
                    recipe=recipe,
                    message="new user",
                    history=[],
                    attachments=[],
                    options={"modelId": "ollama:test", "memory_enabled": True},
                    session_id="s",
                )
            )

        self.assertEqual(manager.expected_revision, 7)

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

    def test_stream_recipe_graph_passes_agent_optimizer_config_to_builder(self):
        import unchain_adapter as ua

        data = _recipe_dict()
        data["nodes"][1]["override"]["optimizer"] = {"preset": "aggressive"}
        data["nodes"][2]["override"]["optimizer"] = {
            "preset": "off",
            "enabled": False,
        }
        recipe = parse_recipe_json(data)
        captured = []

        def fake_build(**kwargs):
            captured.append(kwargs.get("optimizer_config"))
            return FakeAgent(kwargs["recipe"].agent.prompt, kwargs["toolkits"])

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
                    options={"modelId": "ollama:test"},
                    session_id="s",
                )
            )

        self.assertEqual(
            captured,
            [
                {"preset": "aggressive"},
                {"preset": "off", "enabled": False},
            ],
        )

    def test_stream_recipe_graph_uses_global_optimizer_when_node_has_no_override(self):
        import unchain_adapter as ua

        recipe = parse_recipe_json(_recipe_dict())
        captured = []

        def fake_build(**kwargs):
            captured.append(kwargs.get("optimizer_config"))
            return FakeAgent(kwargs["recipe"].agent.prompt, kwargs["toolkits"])

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
                    options={
                        "modelId": "ollama:test",
                        "optimizer": {"preset": "aggressive"},
                    },
                    session_id="s",
                )
            )

        self.assertEqual(
            captured,
            [
                {"preset": "aggressive"},
                {"preset": "aggressive"},
            ],
        )

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
                    run_id_override="child-run-ask",
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
        self.assertEqual(ask_event.get("run_id"), "child-run-ask")
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

    def test_stream_recipe_graph_preserves_child_run_id_from_callback(self):
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

        class ChildEventAgent(FakeAgent):
            def run(self, *, callback=None, run_id=None, **_kwargs):
                if callback:
                    callback({
                        "type": "tool_call",
                        "run_id": "child-run-ask",
                        "iteration": 0,
                        "tool_name": "ask_user_question",
                        "call_id": "ask-child",
                        "confirmation_id": "confirm-child",
                        "requires_confirmation": True,
                        "interact_type": "single",
                        "interact_config": {"question": "Child needs input?"},
                    })
                    callback({
                        "type": "final_message",
                        "run_id": run_id,
                        "iteration": 0,
                        "content": "parent final",
                    })
                return SimpleNamespace(messages=[{"role": "assistant", "content": "parent final"}])

        def fake_build(**kwargs):
            return ChildEventAgent(kwargs["recipe"].agent.prompt, kwargs["toolkits"])

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
                    run_id_override="parent-run",
                )
            )

        ask_event = next(
            event
            for event in events
            if event.get("type") == "tool_call"
            and event.get("tool_name") == "ask_user_question"
        )
        self.assertEqual(ask_event.get("run_id"), "child-run-ask")
        self.assertNotIn("workflow_node_id", ask_event)
        self.assertNotIn("workflow_step_index", ask_event)
        self.assertTrue(
            any(
                event.get("type") == "final_message"
                and event.get("run_id") == "parent-run"
                and event.get("content") == "parent final"
                for event in events
            )
        )

    def test_workflow_recipe_subagent_forwards_run_id_to_child_graph(self):
        import unchain_adapter as ua

        recipe = parse_recipe_json(_recipe_dict())
        agent = ua._WorkflowRecipeSubagentAgent(
            recipe=recipe,
            options={"modelId": "ollama:test"},
            name="Explore",
        )

        with mock.patch.object(
            ua,
            "_stream_recipe_graph_events",
            return_value=iter([
                {
                    "type": "final_message",
                    "run_id": "child-run-ask",
                    "content": "done",
                }
            ]),
        ) as stream_graph:
            result = agent.run(
                [{"role": "user", "content": "Inspect the frontend"}],
                run_id="child-run-ask",
            )

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.messages[-1]["content"], "done")
        self.assertEqual(stream_graph.call_args.kwargs["run_id_override"], "child-run-ask")

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

        with mock.patch.object(ua, "_build_toolkits_by_ids", return_value=[]) as build_missing:
            merged = ua._resolve_graph_agent_toolkits(
                compiled["agents"][0],
                compiled,
                [_tk("core")],
                options={},
            )
        build_missing.assert_not_called()
        self.assertEqual([tk.id for tk in merged], ["core"])

        compiled["attach_by_agent"]["a1"][0]["merge_with_user_selected"] = False
        with mock.patch.object(ua, "_build_toolkits_by_ids", return_value=[_tk("core")]) as build_missing:
            isolated = ua._resolve_graph_agent_toolkits(
                compiled["agents"][0],
                compiled,
                [_tk("core")],
                options={},
            )
        build_missing.assert_called_once_with(["core"], {})
        self.assertEqual([tk.id for tk in isolated], ["core"])


if __name__ == "__main__":
    unittest.main()
