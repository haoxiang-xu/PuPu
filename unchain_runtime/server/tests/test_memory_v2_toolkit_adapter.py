from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


class _Toolkit:
    def __init__(self, *tool_names):
        self.tools = {name: object() for name in tool_names}


class _ToolsModule:
    def __init__(self, *, tools):
        self.tools = tuple(tools)


class _PoliciesModule:
    def __init__(self, *, max_iterations):
        self.max_iterations = max_iterations


class _Agent:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


def _admission(*, active=True):
    return SimpleNamespace(
        is_active=active,
        mode="active" if active else "shadow",
        owner_chat_id="chat_123",
        session_id="session_456",
        attempt_id="attempt_789",
        source_attempt_id="",
        provider="ollama",
        model="test",
        real_context_window_tokens=100_000,
        runtime=object(),
    )


def _graph_recipe():
    from recipe import parse_recipe_json

    return parse_recipe_json(
        {
            "name": "Graph",
            "description": "",
            "model": "ollama:test",
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": ""},
            "toolkits": [],
            "subagent_pool": [],
            "nodes": [
                {
                    "id": "start",
                    "type": "start",
                    "outputs": [{"name": "text", "type": "string"}],
                },
                {
                    "id": "a1",
                    "type": "agent",
                    "override": {"prompt": "work {{#start.text#}}"},
                    "outputs": [{"name": "output", "type": "string"}],
                },
                {"id": "end", "type": "end"},
            ],
            "edges": [
                {
                    "id": "e1",
                    "kind": "flow",
                    "source_node_id": "start",
                    "source_port_id": "out",
                    "target_node_id": "a1",
                    "target_port_id": "in",
                },
                {
                    "id": "e2",
                    "kind": "flow",
                    "source_node_id": "a1",
                    "source_port_id": "out",
                    "target_node_id": "end",
                    "target_port_id": "in",
                },
            ],
        }
    )


class MemoryV2ToolkitAdapterTests(unittest.TestCase):
    def test_inactive_admission_is_exact_noop(self):
        import unchain_adapter as ua

        existing = [_Toolkit("read")]
        with mock.patch(
            "memory_v2_toolkit.build_memory_v2_toolkit"
        ) as build_toolkit:
            result = ua._append_memory_v2_normal_toolkit(
                existing,
                _admission(active=False),
                run_id="run_1",
            )
        self.assertIs(result, existing)
        build_toolkit.assert_not_called()

    def test_active_admission_binds_scope_and_registers_normal_only(self):
        import unchain_adapter as ua

        memory_toolkit = _Toolkit(
            "context_content_read",
            "memory_list",
            "memory_search",
            "memory_read",
            "memory_propose",
        )
        admission = _admission()
        with mock.patch(
            "memory_v2_toolkit.build_memory_v2_toolkit",
            return_value=memory_toolkit,
        ) as build_toolkit:
            result = ua._append_memory_v2_normal_toolkit(
                [_Toolkit("read")],
                admission,
                run_id="run_child",
            )
        build_toolkit.assert_called_once()
        call_args, call_kwargs = build_toolkit.call_args
        self.assertEqual(call_args, (admission.runtime,))
        authorizer = call_kwargs.pop("content_ref_authorizer")
        self.assertTrue(callable(authorizer))
        self.assertEqual(
            call_kwargs,
            {
                "owner_chat_id": "chat_123",
                "session_id": "session_456",
                "attempt_id": "attempt_789",
                "run_id": "run_child",
                "curator": False,
                "namespace": "",
            },
        )
        self.assertIs(result[-1], memory_toolkit)
        self.assertEqual(
            getattr(memory_toolkit, "_pupu_toolkit_id"),
            "system.memory_v2",
        )
        self.assertNotIn("memory_upsert", memory_toolkit.tools)
        self.assertNotIn("memory_promote", memory_toolkit.tools)

    def test_content_ref_authorizer_uses_diagnostics_and_current_chat_journal_only(self):
        import unchain_adapter as ua

        diagnostics_ref = "pupu://context/checkpoint/checkpoint_1"
        journal_ref = "pupu://artifact/artifact_1@1"
        argument_only_ref = "pupu://artifact/argument_only@1"

        class Runtime:
            def __init__(self):
                self.calls = []

            def load_events(self, **arguments):
                self.calls.append(arguments)
                return {
                    "events": [
                        {
                            "store_seq": 5,
                            "event": {
                                "type": "tool_result",
                                "full_output_ref": journal_ref,
                            },
                        },
                        {
                            "store_seq": 6,
                            "event": {
                                "type": "tool_call",
                                "arguments": {"ref": argument_only_ref},
                            },
                        },
                    ],
                    "next_after": 6,
                    "has_more": False,
                }

        runtime = Runtime()
        admission = _admission()
        admission.runtime = runtime
        admission.diagnostics = lambda: {
            "checkpoint_refs": [{"uri": diagnostics_ref}]
        }
        authorizer = ua._memory_v2_build_content_ref_authorizer(admission)

        self.assertTrue(authorizer(diagnostics_ref))
        self.assertTrue(authorizer(journal_ref))
        self.assertFalse(authorizer(argument_only_ref))
        self.assertFalse(authorizer("pupu://artifact/undisclosed@1"))
        self.assertTrue(runtime.calls)
        self.assertEqual(runtime.calls[0]["owner_chat_id"], "chat_123")
        self.assertEqual(runtime.calls[0]["session_id"], "session_456")
        self.assertEqual(runtime.calls[0]["attempt_id"], "")

    def test_active_duplicate_tool_name_fails_closed_after_append(self):
        import unchain_adapter as ua

        with mock.patch(
            "memory_v2_toolkit.build_memory_v2_toolkit",
            return_value=_Toolkit("memory_read"),
        ):
            with self.assertRaisesRegex(RuntimeError, "Duplicate tool name"):
                ua._append_memory_v2_normal_toolkit(
                    [_Toolkit("memory_read")],
                    _admission(),
                    run_id="run_1",
                )

    def test_developer_appends_after_recipe_resolution(self):
        import unchain_adapter as ua

        admission = _admission()
        recipe_toolkit = _Toolkit("recipe_read")
        memory_toolkit = _Toolkit("memory_read")
        order = []

        def resolve_recipe(*_args, **_kwargs):
            order.append("recipe")
            return [recipe_toolkit]

        def append_memory(toolkits, received_admission, *, run_id):
            order.append("memory")
            self.assertEqual(toolkits, [recipe_toolkit])
            self.assertIs(received_admission, admission)
            self.assertEqual(run_id, "run_bound")
            return [*toolkits, memory_toolkit]

        with mock.patch.object(
            ua,
            "_resolve_recipe_toolkits",
            side_effect=resolve_recipe,
        ), mock.patch.object(
            ua,
            "_append_memory_v2_normal_toolkit",
            side_effect=append_memory,
        ), mock.patch.object(
            ua,
            "_memory_v2_admission_from_options",
            return_value=admission,
        ), mock.patch.object(
            ua,
            "_build_memory_v2_optimizer_module",
            return_value=None,
        ), mock.patch.object(
            ua,
            "_resolve_recipe_prompt",
            return_value="instructions",
        ):
            agent = ua._build_developer_agent(
                UnchainAgent=_Agent,
                ToolsModule=_ToolsModule,
                MemoryModule=None,
                PoliciesModule=_PoliciesModule,
                provider="ollama",
                model="test",
                api_key="",
                max_iterations=3,
                toolkits=[_Toolkit("selected_read")],
                memory_manager=None,
                enable_subagents=False,
                options={},
                recipe=SimpleNamespace(),
                memory_v2_run_id="run_bound",
            )

        self.assertEqual(order, ["recipe", "memory"])
        tools_module = next(
            module for module in agent.modules if isinstance(module, _ToolsModule)
        )
        self.assertEqual(tools_module.tools, (recipe_toolkit, memory_toolkit))
        self.assertEqual(
            agent._memory_v2_effective_toolkits,
            [recipe_toolkit, memory_toolkit],
        )

    def test_create_agent_rejects_fake_active_before_toolkit_binding(self):
        import unchain_adapter as ua

        admission = _admission()
        with mock.patch.object(ua, "_UnchainAgent", object), mock.patch.object(
            ua, "parse_custom_provider", return_value=None
        ), mock.patch.object(
            ua, "_load_recipe_from_options", return_value=None
        ), mock.patch.object(
            ua,
            "get_runtime_config",
            return_value={"provider": "ollama", "model": "test"},
        ), mock.patch.object(
            ua, "_resolve_agent_api_key", return_value=""
        ), mock.patch.object(
            ua,
            "_resolve_memory_runtime",
            side_effect=AssertionError(
                "legacy runtime must not open without official preflight"
            ),
        ) as resolve_runtime, mock.patch.object(
            ua,
            "_build_developer_agent",
            side_effect=AssertionError(
                "legacy PuPu toolkit binding must remain unreachable"
            ),
        ) as build_agent, mock.patch.object(
            ua,
            "_append_memory_v2_normal_toolkit",
            side_effect=AssertionError(
                "legacy PuPu toolkit binding must remain unreachable"
            ),
        ) as append_toolkit, mock.patch.object(
            ua, "_extract_user_prompt_modules", return_value={}
        ), mock.patch.object(
            ua, "get_max_context_window_tokens", return_value=100_000
        ), mock.patch.object(
            ua, "_resolve_memory_v2_admission", return_value=admission
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "official Unchain run preflight",
            ):
                ua._create_agent(
                    {"_memory_v2_attempt_id": "attempt_789"},
                    session_id="session_456",
                )

        resolve_runtime.assert_not_called()
        build_agent.assert_not_called()
        append_toolkit.assert_not_called()

    def test_graph_rejects_fake_active_before_legacy_toolkit_binding(self):
        import unchain_adapter as ua

        admission = _admission()
        with mock.patch.object(ua, "_UnchainAgent", object), mock.patch.object(
            ua,
            "_build_developer_agent",
            side_effect=AssertionError(
                "graph agent must not build without official preflight"
            ),
        ) as build_agent, mock.patch.object(
            ua,
            "_resolve_memory_runtime",
            side_effect=AssertionError(
                "legacy runtime must not open without official preflight"
            ),
        ) as resolve_runtime, mock.patch.object(
            ua,
            "_append_memory_v2_normal_toolkit",
            side_effect=AssertionError(
                "legacy PuPu toolkit binding must remain unreachable"
            ),
        ) as append_toolkit, mock.patch.object(
            ua,
            "_finalize_memory_v2_curator",
            side_effect=AssertionError(
                "legacy PuPu Curator must remain unreachable"
            ),
        ) as finalize_curator, mock.patch.object(
            ua,
            "_resolve_memory_v2_admission",
            return_value=admission,
        ), mock.patch.object(
            ua, "get_max_context_window_tokens", return_value=100_000
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "official Unchain run preflight",
            ):
                list(ua._stream_recipe_graph_events(
                    recipe=_graph_recipe(),
                    message="hello",
                    history=[],
                    attachments=[],
                    options={"modelId": "ollama:test"},
                    session_id="session_456",
                    run_id_override="child_run",
                ))

        resolve_runtime.assert_not_called()
        build_agent.assert_not_called()
        append_toolkit.assert_not_called()
        finalize_curator.assert_not_called()


if __name__ == "__main__":
    unittest.main()
