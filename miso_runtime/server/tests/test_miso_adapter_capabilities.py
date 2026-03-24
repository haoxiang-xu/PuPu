import json
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import miso_adapter  # noqa: E402


class MisoAdapterCapabilityCatalogTests(unittest.TestCase):
    def _write_capability_file(self, payload: dict) -> tuple[tempfile.TemporaryDirectory, Path]:
        temp_dir = tempfile.TemporaryDirectory()
        capability_file = Path(temp_dir.name) / "model_capabilities.json"
        capability_file.write_text(json.dumps(payload), encoding="utf-8")
        return temp_dir, capability_file

    def test_get_capability_catalog_keeps_provider_model_lists(self) -> None:
        payload = {
            "gpt-5": {"provider": "openai"},
            "text-embedding-3-small": {"provider": "openai", "model_type": "embedding"},
            "claude-opus-4.6": {"provider": "anthropic"},
            "deepseek-r1:14b": {"provider": "ollama"},
            "ignored-model": {"provider": "unknown"},
        }
        temp_dir, capability_file = self._write_capability_file(payload)
        self.addCleanup(temp_dir.cleanup)

        with mock.patch.object(
            miso_adapter,
            "_capability_file_candidates",
            return_value=[capability_file],
        ), mock.patch.object(
            miso_adapter,
            "_fetch_ollama_models",
            return_value=[],
        ):
            providers = miso_adapter.get_capability_catalog()

        self.assertEqual(providers["openai"], ["gpt-5"])
        self.assertEqual(providers["anthropic"], ["claude-opus-4-6"])
        self.assertEqual(providers["ollama"], ["deepseek-r1:14b"])
        self.assertNotIn("text-embedding-3-small", providers["openai"])

    def test_get_capability_catalog_filters_dynamic_ollama_embedding_models(self) -> None:
        payload = {
            "deepseek-r1:14b": {"provider": "ollama"},
            "nomic-embed-text": {"provider": "ollama", "model_type": "embedding"},
        }
        temp_dir, capability_file = self._write_capability_file(payload)
        self.addCleanup(temp_dir.cleanup)

        class _FakeResponse:
            def raise_for_status(self) -> None:
                return None

            def json(self) -> dict:
                return {
                    "models": [
                        {
                            "name": "llama3",
                            "details": {"families": ["llama"]},
                        },
                        {
                            "name": "nomic-embed-text",
                            "details": {"families": ["nomic-bert"]},
                        },
                        {
                            "name": "bge-m3",
                            "details": {"families": ["bge-m3"]},
                        },
                    ]
                }

        fake_httpx = SimpleNamespace(get=mock.Mock(return_value=_FakeResponse()))

        with mock.patch.object(
            miso_adapter,
            "_capability_file_candidates",
            return_value=[capability_file],
        ), mock.patch.object(
            miso_adapter,
            "_httpx",
            fake_httpx,
        ):
            providers = miso_adapter.get_capability_catalog()

        self.assertEqual(providers["ollama"], ["deepseek-r1:14b", "llama3"])

    def test_get_embedding_provider_catalog_only_keeps_openai_embedding_models(self) -> None:
        payload = {
            "gpt-5": {"provider": "openai"},
            "text-embedding-3-small": {"provider": "openai", "model_type": "embedding"},
            "text-embedding-3-large": {"provider": "openai", "model_type": "embedding"},
            "nomic-embed-text": {"provider": "ollama", "model_type": "embedding"},
            "ignored-model": {"provider": "unknown", "model_type": "embedding"},
        }
        temp_dir, capability_file = self._write_capability_file(payload)
        self.addCleanup(temp_dir.cleanup)

        with mock.patch.object(
            miso_adapter,
            "_capability_file_candidates",
            return_value=[capability_file],
        ):
            providers = miso_adapter.get_embedding_provider_catalog()

        self.assertEqual(
            providers,
            {
                "openai": [
                    "text-embedding-3-large",
                    "text-embedding-3-small",
                ]
            },
        )

    def test_get_model_capability_catalog_normalizes_modalities_and_sources(self) -> None:
        payload = {
            "gpt-5": {
                "provider": "openai",
                "input_modalities": ["pdf", "FILE", "IMAGE", "video", "text", ""],
                "input_source_types": {
                    "image": ["URL", "base64", "ftp", "url"],
                    "file": ["url", "base64"],
                    "pdf": ["base64", 123, "url"],
                    "text": ["url"],
                    "video": ["url"],
                },
            },
            "text-embedding-3-small": {
                "provider": "openai",
                "model_type": "embedding",
                "input_modalities": ["text"],
            },
            "deepseek-r1:14b": {
                "provider": "ollama",
                "input_modalities": "text",
                "input_source_types": {"image": ["url"]},
            },
            "claude-opus-4.6": {
                "provider": "anthropic",
                "input_modalities": ["image", "text"],
                "input_source_types": {"image": ["base64"]},
            },
        }
        temp_dir, capability_file = self._write_capability_file(payload)
        self.addCleanup(temp_dir.cleanup)

        with mock.patch.object(
            miso_adapter,
            "_capability_file_candidates",
            return_value=[capability_file],
        ):
            model_capabilities = miso_adapter.get_model_capability_catalog()

        self.assertEqual(
            model_capabilities["openai:gpt-5"],
            {
                "input_modalities": ["text", "image", "pdf"],
                "input_source_types": {
                    "image": ["url", "base64"],
                    "pdf": ["url", "base64"],
                },
            },
        )
        self.assertEqual(
            model_capabilities["ollama:deepseek-r1:14b"],
            {
                "input_modalities": ["text"],
                "input_source_types": {},
            },
        )
        self.assertEqual(
            model_capabilities["anthropic:claude-opus-4-6"],
            {
                "input_modalities": ["text", "image"],
                "input_source_types": {"image": ["base64"]},
            },
        )
        self.assertNotIn("openai:text-embedding-3-small", model_capabilities)

    def test_get_default_model_capabilities_is_text_only(self) -> None:
        self.assertEqual(
            miso_adapter.get_default_model_capabilities(),
            {
                "input_modalities": ["text"],
                "input_source_types": {},
            },
        )

    def test_normalize_messages_supports_block_history_and_attachments(self) -> None:
        history = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this image"},
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": "abc",
                        },
                    },
                ],
            },
            {"role": "assistant", "content": "Looks good."},
        ]
        attachments = [
            {
                "type": "pdf",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": "pdf-data",
                    "filename": "demo.pdf",
                },
            }
        ]

        messages = miso_adapter._normalize_messages(history, "", attachments)

        self.assertEqual(messages[0]["role"], "user")
        self.assertIsInstance(messages[0]["content"], list)
        self.assertEqual(messages[1], {"role": "assistant", "content": "Looks good."})
        self.assertEqual(
            messages[2],
            {
                "role": "user",
                "content": [
                    {
                        "type": "pdf",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": "pdf-data",
                            "filename": "demo.pdf",
                        },
                    }
                ],
            },
        )

    def test_build_system_prompt_v2_text_from_options_normalizes_alias_and_merge(self) -> None:
        prompt_text = miso_adapter._build_system_prompt_v2_text_from_options(
            {
                "system_prompt_v2": {
                    "enabled": True,
                    "defaults": {
                        "personally": " Helpful and concise. ",
                        "rules": "Never fabricate facts.",
                        "context": "Project: PuPu",
                    },
                    "overrides": {
                        "rules": "Always ask clarifying questions when blocked.",
                        "personality": "",
                        "context": None,
                    },
                }
            }
        )

        expected_rules = "\n".join(
            [
                *miso_adapter._SYSTEM_PROMPT_V2_BUILTIN_RULES,
                "Always ask clarifying questions when blocked.",
            ]
        )
        self.assertEqual(
            prompt_text,
            "\n\n".join(
                [
                    "[Personality]\nHelpful and concise.",
                    f"[Rules]\n{expected_rules}",
                ]
            ),
        )

    def test_build_system_prompt_v2_text_from_options_skips_when_disabled(self) -> None:
        prompt_text = miso_adapter._build_system_prompt_v2_text_from_options(
            {
                "system_prompt_v2": {
                    "enabled": False,
                    "defaults": {
                        "personality": "Should not appear.",
                    },
                }
            }
        )

        self.assertEqual(prompt_text, "")

    def test_build_effective_system_prompt_text_appends_agent_instructions(self) -> None:
        prompt_text = miso_adapter._build_effective_system_prompt_text(
            {
                "system_prompt_v2": {
                    "enabled": True,
                    "defaults": {
                        "rules": "Keep answers concise.",
                    },
                },
                "agent_instructions": "You are Nico. Reply as the character.",
            }
        )

        self.assertIn("[Rules]", prompt_text)
        self.assertIn("Keep answers concise.", prompt_text)
        self.assertTrue(
            prompt_text.endswith("You are Nico. Reply as the character."),
        )

    def test_get_toolkit_catalog_lists_known_toolkit_exports(self) -> None:
        class FakeToolkitBase:
            pass

        class FakePythonWorkspaceToolkit(FakeToolkitBase):
            pass

        def import_module_side_effect(module_name: str):
            if module_name == "miso.tools":
                return SimpleNamespace(Toolkit=FakeToolkitBase)
            if module_name == "miso.toolkits":
                return SimpleNamespace(WorkspaceToolkit=FakePythonWorkspaceToolkit)
            raise ImportError(module_name)

        with mock.patch.object(
            miso_adapter.importlib,
            "import_module",
            side_effect=import_module_side_effect,
        ):
            catalog = miso_adapter.get_toolkit_catalog()

        names = [entry["name"] for entry in catalog["toolkits"]]
        self.assertEqual(
            names,
            [
                "workspace_toolkit",
            ],
        )
        self.assertEqual(catalog["count"], 1)

    def test_get_toolkit_catalog_returns_empty_when_toolkit_base_unavailable(self) -> None:
        with mock.patch.object(miso_adapter, "_resolve_toolkit_base", return_value=None):
            catalog = miso_adapter.get_toolkit_catalog()

        self.assertEqual(catalog["toolkits"], [])
        self.assertEqual(catalog["count"], 0)

    def test_extract_workspace_root_from_options(self) -> None:
        self.assertEqual(
            miso_adapter._extract_workspace_root_from_options(
                {"workspaceRoot": "  /tmp/a  "}
            ),
            "/tmp/a",
        )
        self.assertEqual(
            miso_adapter._extract_workspace_root_from_options(
                {"workspace_root": "  /tmp/b  "}
            ),
            "/tmp/b",
        )
        self.assertEqual(
            miso_adapter._extract_workspace_root_from_options({}),
            "",
        )

    def test_extract_max_iterations_from_options(self) -> None:
        self.assertEqual(
            miso_adapter._extract_max_iterations_from_options({"maxIterations": " 4 "}),
            4,
        )
        self.assertEqual(
            miso_adapter._extract_max_iterations_from_options({"max_iterations": 0}),
            1,
        )
        self.assertIsNone(
            miso_adapter._extract_max_iterations_from_options({"maxIterations": "abc"})
        )
        self.assertIsNone(miso_adapter._extract_max_iterations_from_options({}))

    def test_make_tool_confirm_callback_round_trip_with_submit(self) -> None:
        emitted_events = []
        confirm_cb = miso_adapter._make_tool_confirm_callback(
            emitted_events.append,
        )
        response_holder: dict[str, object] = {}

        def invoke_callback() -> None:
            response_holder["value"] = confirm_cb(
                SimpleNamespace(
                    tool_name="delete_file",
                    call_id="call-1",
                    arguments={"path": "tmp.txt"},
                    description="Delete a file",
                )
            )

        worker = threading.Thread(target=invoke_callback, daemon=True)
        worker.start()

        deadline = time.time() + 2
        while not emitted_events and time.time() < deadline:
            time.sleep(0.01)

        self.assertTrue(emitted_events)
        request_event = emitted_events[0]
        self.assertEqual(request_event.get("type"), "tool_call")
        confirmation_id = request_event.get("confirmation_id")
        self.assertIsInstance(confirmation_id, str)
        self.assertEqual(request_event.get("requires_confirmation"), True)

        submitted = miso_adapter.submit_tool_confirmation(
            confirmation_id=confirmation_id,
            approved=True,
            reason="approved",
        )
        self.assertTrue(submitted)

        worker.join(timeout=2)
        self.assertFalse(worker.is_alive())

        result = response_holder.get("value")
        self.assertIsInstance(result, dict)
        self.assertEqual(result["approved"], True)
        self.assertEqual(result["reason"], "approved")

    def test_make_tool_confirm_callback_returns_denied_when_cancelled(self) -> None:
        cancel_event = threading.Event()
        emitted_events = []
        confirm_cb = miso_adapter._make_tool_confirm_callback(
            emitted_events.append,
            cancel_event=cancel_event,
        )
        response_holder: dict[str, object] = {}

        def invoke_callback() -> None:
            response_holder["value"] = confirm_cb(
                {
                    "tool_name": "delete_file",
                    "call_id": "call-cancelled",
                    "arguments": {"path": "tmp.txt"},
                    "description": "Delete a file",
                }
            )

        worker = threading.Thread(target=invoke_callback, daemon=True)
        worker.start()

        deadline = time.time() + 2
        while not emitted_events and time.time() < deadline:
            time.sleep(0.01)

        self.assertTrue(emitted_events)
        confirmation_id = emitted_events[0].get("confirmation_id")
        self.assertIsInstance(confirmation_id, str)

        cancel_event.set()
        miso_adapter.cancel_tool_confirmations(cancel_event)
        worker.join(timeout=2)
        self.assertFalse(worker.is_alive())

        result = response_holder.get("value")
        submitted = miso_adapter.submit_tool_confirmation(
            confirmation_id=confirmation_id,
            approved=True,
        )

        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("approved"), False)
        self.assertEqual(
            result.get("reason"),
            "confirmation_cancelled_stream_terminated",
        )
        self.assertFalse(submitted)

    def test_submit_tool_confirmation_returns_false_for_unknown_id(self) -> None:
        submitted = miso_adapter.submit_tool_confirmation(
            confirmation_id="unknown-confirmation-id",
            approved=True,
        )
        self.assertFalse(submitted)

    def test_apply_broth_runtime_patches_batches_anthropic_tool_results(self) -> None:
        class FakeBroth:
            def __init__(self):
                self.provider = "anthropic"
                self.used_original_execute = False
                self.used_original_inject = False
                self.events = []
                self.executed_session_ids = []
                self.find_tool_toolkits = []
                self.execute_toolkits = []

            def _execute_tool_calls(self, **_kwargs):
                self.used_original_execute = True
                return [{"role": "tool", "content": "original"}], False

            def _build_observation_messages(self, full_messages, tool_messages):
                return [
                    {"role": "system", "content": "sys"},
                    *full_messages,
                    *tool_messages,
                    {"role": "user", "content": "Review the LAST tool result above and provide one brief actionable observation."},
                ]

            def _inject_observation(self, _tool_message, _observation):
                self.used_original_inject = True

            def _emit(self, _callback, event_type, _run_id, *, iteration, **_extra):
                self.events.append((event_type, iteration))

            def _find_tool(self, name, *, toolkits=None):
                self.find_tool_toolkits.append(toolkits)
                if name == "observe_tool":
                    return SimpleNamespace(observe=True)
                return SimpleNamespace(observe=False)

            def _execute_from_toolkits(self, name, arguments, session_id=None, toolkits=None):
                self.executed_session_ids.append(session_id)
                self.execute_toolkits.append(toolkits)
                return {"name": name, "arguments": arguments}

        miso_adapter._apply_broth_runtime_patches(FakeBroth)

        agent = FakeBroth()
        tool_calls = [
            SimpleNamespace(call_id="toolu_1", name="observe_tool", arguments={"a": 1}),
            SimpleNamespace(call_id="toolu_2", name="plain_tool", arguments={"b": 2}),
        ]
        result_messages, should_observe = agent._execute_tool_calls(
            tool_calls=tool_calls,
            run_id="run-1",
            iteration=0,
            callback=None,
            session_id="thread-anthropic-1",
            toolkits=["ask-user-toolkit"],
        )

        self.assertEqual(len(result_messages), 1)
        self.assertEqual(result_messages[0]["role"], "user")
        self.assertIsInstance(result_messages[0]["content"], list)
        self.assertEqual(
            [block["tool_use_id"] for block in result_messages[0]["content"]],
            ["toolu_1", "toolu_2"],
        )
        self.assertFalse(should_observe)
        self.assertFalse(agent.used_original_execute)
        self.assertEqual(agent.executed_session_ids, ["thread-anthropic-1", "thread-anthropic-1"])
        self.assertEqual(
            agent.find_tool_toolkits,
            [["ask-user-toolkit"], ["ask-user-toolkit"]],
        )
        self.assertEqual(
            agent.execute_toolkits,
            [["ask-user-toolkit"], ["ask-user-toolkit"]],
        )

        merged_observation_messages = agent._build_observation_messages(
            full_messages=[
                {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "id": "toolu_1", "name": "observe_tool", "input": {}},
                    ],
                }
            ],
            tool_messages=result_messages,
        )
        last_message = merged_observation_messages[-1]
        self.assertEqual(last_message.get("role"), "user")
        self.assertIsInstance(last_message.get("content"), list)
        self.assertEqual(last_message["content"][-1]["type"], "text")

        tool_result_message = {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": "toolu_1",
                    "content": '{"ok": true}',
                }
            ],
        }
        agent._inject_observation(tool_result_message, "looks good")
        parsed = json.loads(tool_result_message["content"][0]["content"])
        self.assertEqual(parsed["observation"], "looks good")
        self.assertFalse(agent.used_original_inject)

        # Non-anthropic providers keep upstream behavior.
        agent.provider = "ollama"
        _result_messages, _observe = agent._execute_tool_calls(
            tool_calls=tool_calls,
            run_id="run-2",
            iteration=1,
            callback=None,
        )
        self.assertTrue(agent.used_original_execute)

    def test_apply_broth_runtime_patches_anthropic_confirmation_gate(self) -> None:
        class FakeBroth:
            def __init__(self):
                self.provider = "anthropic"
                self.executed_arguments = []
                self.events = []

            def _execute_tool_calls(self, **_kwargs):
                return [{"role": "tool", "content": "original"}], False

            def _build_observation_messages(self, full_messages, tool_messages):
                return [*full_messages, *tool_messages]

            def _inject_observation(self, _tool_message, _observation):
                return None

            def _find_tool(self, _name):
                return SimpleNamespace(requires_confirmation=True)

            def _emit(self, _callback, event_type, _run_id, *, iteration, **extra):
                self.events.append((event_type, iteration, extra))

            def _find_tool(self, _name):
                return SimpleNamespace(
                    observe=False,
                    requires_confirmation=True,
                    description="dangerous",
                )

            def _execute_from_toolkits(self, name, arguments, **_kwargs):
                self.executed_arguments.append((name, arguments))
                return {"ok": True, "arguments": arguments}

        miso_adapter._apply_broth_runtime_patches(FakeBroth)

        agent = FakeBroth()
        denied_messages, _ = agent._execute_tool_calls(
            tool_calls=[
                SimpleNamespace(
                    call_id="call-deny",
                    name="delete_file",
                    arguments={"path": "a.txt"},
                )
            ],
            run_id="run-1",
            iteration=0,
            callback=None,
            on_tool_confirm=lambda _req: {"approved": False, "reason": "no"},
        )

        self.assertEqual(agent.executed_arguments, [])
        denied_events = [event for event in agent.events if event[0] == "tool_denied"]
        self.assertEqual(len(denied_events), 1)
        tool_call_events = [event for event in agent.events if event[0] == "tool_call"]
        self.assertEqual(len(tool_call_events), 1)
        self.assertIsInstance(tool_call_events[0][2].get("confirmation_id"), str)
        self.assertEqual(tool_call_events[0][2].get("requires_confirmation"), True)
        denied_content = denied_messages[0]["content"][0]["content"]
        denied_result = json.loads(denied_content)
        self.assertEqual(denied_result["denied"], True)

        approved_messages, _ = agent._execute_tool_calls(
            tool_calls=[
                SimpleNamespace(
                    call_id="call-approve",
                    name="move_file",
                    arguments={"source": "a.txt", "destination": "b.txt"},
                )
            ],
            run_id="run-2",
            iteration=1,
            callback=None,
            on_tool_confirm=lambda _req: {
                "approved": True,
                "modified_arguments": {"source": "x.txt", "destination": "y.txt"},
            },
        )

        self.assertEqual(
            agent.executed_arguments[-1],
            ("move_file", {"source": "x.txt", "destination": "y.txt"}),
        )
        confirmed_events = [event for event in agent.events if event[0] == "tool_confirmed"]
        self.assertEqual(len(confirmed_events), 1)
        tool_call_events = [event for event in agent.events if event[0] == "tool_call"]
        self.assertEqual(len(tool_call_events), 2)
        self.assertIsInstance(tool_call_events[-1][2].get("confirmation_id"), str)
        approved_content = approved_messages[0]["content"][0]["content"]
        approved_result = json.loads(approved_content)
        self.assertEqual(approved_result["ok"], True)

    def test_apply_broth_runtime_patches_non_anthropic_confirmation_events(self) -> None:
        class FakeBroth:
            def __init__(self):
                self.provider = "openai"
                self.used_original_execute = False
                self.events = []
                self.session_ids = []
                self.toolkits_seen = []

            def _execute_tool_calls(
                self,
                *,
                tool_calls,
                run_id,
                iteration,
                callback,
                on_tool_confirm=None,
                session_id=None,
                toolkits=None,
            ):
                self.used_original_execute = True
                self.session_ids.append(session_id)
                self.toolkits_seen.append(toolkits)
                if on_tool_confirm is not None and tool_calls:
                    request = {
                        "tool_name": tool_calls[0].name,
                        "call_id": tool_calls[0].call_id,
                        "arguments": tool_calls[0].arguments,
                        "description": "dangerous",
                    }
                    on_tool_confirm(request)
                    on_tool_confirm(request)
                return [{"role": "tool", "content": "original"}], False

            def _build_observation_messages(self, full_messages, tool_messages):
                return [*full_messages, *tool_messages]

            def _inject_observation(self, _tool_message, _observation):
                return None

            def _find_tool(self, _name):
                return SimpleNamespace(requires_confirmation=True)

            def _emit(self, _callback, event_type, _run_id, *, iteration, **extra):
                self.events.append((event_type, iteration, extra))

        miso_adapter._apply_broth_runtime_patches(FakeBroth)
        agent = FakeBroth()
        tool_calls = [
            SimpleNamespace(
                call_id="call-openai-1",
                name="terminal_exec",
                arguments={"cmd": "pwd"},
            )
        ]

        _messages, _observe = agent._execute_tool_calls(
            tool_calls=tool_calls,
            run_id="run-openai-1",
            iteration=0,
            callback=None,
            on_tool_confirm=lambda _req: {"approved": True},
            session_id="thread-openai-1",
            toolkits=["ask-user-toolkit"],
        )
        confirmed_events = [event for event in agent.events if event[0] == "tool_confirmed"]
        self.assertEqual(len(confirmed_events), 1)
        tool_call_events = [event for event in agent.events if event[0] == "tool_call"]
        self.assertEqual(len(tool_call_events), 1)
        self.assertIsInstance(tool_call_events[0][2].get("confirmation_id"), str)
        self.assertEqual(confirmed_events[0][2].get("call_id"), "call-openai-1")
        self.assertTrue(agent.used_original_execute)
        self.assertEqual(agent.session_ids, ["thread-openai-1"])
        self.assertEqual(agent.toolkits_seen, [["ask-user-toolkit"]])

        agent.events = []
        _messages, _observe = agent._execute_tool_calls(
            tool_calls=tool_calls,
            run_id="run-openai-2",
            iteration=1,
            callback=None,
            on_tool_confirm=lambda _req: {"approved": False, "reason": "denied"},
            session_id="thread-openai-2",
            toolkits=["ask-user-toolkit-2"],
        )
        denied_events = [event for event in agent.events if event[0] == "tool_denied"]
        self.assertEqual(len(denied_events), 1)
        tool_call_events = [event for event in agent.events if event[0] == "tool_call"]
        self.assertEqual(len(tool_call_events), 1)
        self.assertIsInstance(tool_call_events[0][2].get("confirmation_id"), str)
        self.assertEqual(denied_events[0][2].get("call_id"), "call-openai-1")
        self.assertEqual(denied_events[0][2].get("reason"), "denied")
        self.assertEqual(agent.session_ids, ["thread-openai-1", "thread-openai-2"])
        self.assertEqual(
            agent.toolkits_seen,
            [["ask-user-toolkit"], ["ask-user-toolkit-2"]],
        )

    def test_apply_broth_runtime_patches_bridges_human_input_into_tool_confirmation(self) -> None:
        class FakeBroth:
            def __init__(self):
                self.provider = "anthropic"
                self.forwarded_toolkits = []
                self.events = []

            def _execute_tool_calls(
                self,
                *,
                tool_calls,
                run_id,
                iteration,
                callback,
                on_tool_confirm=None,
                session_id=None,
                toolkits=None,
            ):
                self.forwarded_toolkits.append(toolkits)
                return [{"role": "tool", "content": "original"}], False, True, {
                    "request_id": "req-1",
                    "kind": "select",
                    "title": "Need input",
                    "question": "Choose one",
                    "selection_mode": "single",
                    "options": [
                        {
                            "id": "opt-1",
                            "label": "Option 1",
                        }
                    ],
                    "allow_other": False,
                }

            def _build_tool_message(self, *, tool_call, tool_result):
                return {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_call.call_id,
                            "content": json.dumps(tool_result),
                        }
                    ],
                }

            def _build_observation_messages(self, full_messages, tool_messages):
                return [*full_messages, *tool_messages]

            def _inject_observation(self, _tool_message, _observation):
                return None

            def _emit(self, _callback, event_type, _run_id, *, iteration, **extra):
                self.events.append((event_type, iteration, extra))

        miso_adapter._apply_broth_runtime_patches(FakeBroth)
        agent = FakeBroth()
        confirmation_requests = []

        result_messages, should_observe = agent._execute_tool_calls(
            tool_calls=[
                SimpleNamespace(
                    call_id="call-human-1",
                    name="ask_user_question",
                    arguments={
                        "title": "Need input",
                        "question": "Choose one",
                        "selection_mode": "single",
                        "options": [
                            {
                                "label": "Option 1",
                                "value": "opt-1",
                            }
                        ],
                        "allow_other": True,
                        "other_label": "Other option",
                        "other_placeholder": "Describe it",
                    },
                )
            ],
            run_id="run-human-1",
            iteration=0,
            callback=None,
            on_tool_confirm=lambda request: (
                confirmation_requests.append(request)
                or {
                    "approved": True,
                    "modified_arguments": {
                        "user_response": {
                            "value": "opt-1",
                        }
                    },
                }
            ),
            toolkits=["ask-user-toolkit"],
        )

        self.assertEqual(agent.forwarded_toolkits, [])
        self.assertFalse(should_observe)
        self.assertEqual(len(confirmation_requests), 1)
        self.assertEqual(confirmation_requests[0]["tool_name"], "ask_user_question")
        self.assertEqual(confirmation_requests[0]["interact_type"], "single")
        self.assertEqual(
            confirmation_requests[0]["interact_config"]["other_label"],
            "Other option",
        )
        self.assertEqual(
            confirmation_requests[0]["interact_config"]["other_placeholder"],
            "Describe it",
        )
        self.assertIsInstance(confirmation_requests[0]["confirmation_id"], str)
        self.assertEqual(confirmation_requests[0]["requires_confirmation"], True)

        tool_result_payload = json.loads(result_messages[0]["content"][0]["content"])
        self.assertEqual(
            tool_result_payload,
            {
                "submitted": True,
                "selected_values": ["opt-1"],
                "other_text": None,
            },
        )
        self.assertEqual(agent.events[0][0], "tool_call")
        self.assertEqual(agent.events[0][2].get("interact_type"), "single")
        self.assertIsInstance(agent.events[0][2].get("confirmation_id"), str)
        self.assertEqual(agent.events[-1][0], "tool_result")

    def test_apply_broth_runtime_patches_ignores_user_supplied_request_id_for_human_input(
        self,
    ) -> None:
        class FakeBroth:
            def __init__(self):
                self.provider = "openai"

            def _execute_tool_calls(self, **_kwargs):
                return [], False

            def _find_tool(self, _name, **_kwargs):
                return None

            def _build_tool_message(self, *, tool_call, tool_result):
                return {
                    "type": "function_call_output",
                    "call_id": tool_call.call_id,
                    "output": json.dumps(tool_result),
                }

            def _build_observation_messages(self, full_messages, tool_messages):
                return [*full_messages, *tool_messages]

            def _inject_observation(self, _tool_message, _observation):
                return None

            def _emit(self, _callback, _event_type, _run_id, *, iteration, **extra):
                del iteration, extra

        miso_adapter._apply_broth_runtime_patches(FakeBroth)
        agent = FakeBroth()

        result_messages, should_observe = agent._execute_tool_calls(
            tool_calls=[
                SimpleNamespace(
                    call_id="call-human-2",
                    name="ask_user_question",
                    arguments={
                        "title": "Need input",
                        "question": "Choose one",
                        "selection_mode": "single",
                        "options": [
                            {
                                "label": "Option 1",
                                "value": "opt-1",
                            }
                        ],
                        "allow_other": False,
                    },
                )
            ],
            run_id="run-human-2",
            iteration=0,
            callback=None,
            on_tool_confirm=lambda _request: {
                "approved": True,
                "modified_arguments": {
                    "user_response": {
                        "request_id": "stale-request-id",
                        "value": "opt-1",
                    }
                },
            },
            toolkits=["ask-user-toolkit"],
        )

        self.assertFalse(should_observe)
        payload = json.loads(result_messages[0]["output"])
        self.assertEqual(
            payload,
            {
                "submitted": True,
                "selected_values": ["opt-1"],
                "other_text": None,
            },
        )

    def test_apply_broth_runtime_patches_parses_openai_string_arguments_for_human_input(
        self,
    ) -> None:
        class FakeBroth:
            def __init__(self):
                self.provider = "openai"
                self.forwarded_toolkits = None
                self.events = []

            def _execute_tool_calls(self, **_kwargs):
                return [], False

            def _find_tool(self, _name, **kwargs):
                self.forwarded_toolkits = kwargs.get("toolkits")
                return None

            def _build_tool_message(self, *, tool_call, tool_result):
                return {
                    "type": "function_call_output",
                    "call_id": tool_call.call_id,
                    "output": json.dumps(tool_result),
                }

            def _build_observation_messages(self, full_messages, tool_messages):
                return [*full_messages, *tool_messages]

            def _inject_observation(self, _tool_message, _observation):
                return None

            def _emit(self, _callback, event_type, _run_id, *, iteration, **extra):
                self.events.append((event_type, iteration, extra))

        miso_adapter._apply_broth_runtime_patches(FakeBroth)
        agent = FakeBroth()
        confirmation_requests = []

        result_messages, should_observe = agent._execute_tool_calls(
            tool_calls=[
                SimpleNamespace(
                    call_id="call-human-openai-1",
                    name="ask_user_question",
                    arguments=json.dumps(
                        {
                            "title": "Need input",
                            "question": "Choose one",
                            "selection_mode": "single",
                            "options": [
                                {
                                    "label": "Option 1",
                                    "value": "opt-1",
                                }
                            ],
                            "allow_other": False,
                        }
                    ),
                )
            ],
            run_id="run-human-openai-1",
            iteration=0,
            callback=None,
            on_tool_confirm=lambda request: (
                confirmation_requests.append(request)
                or {
                    "approved": True,
                    "modified_arguments": {
                        "user_response": {
                            "value": "opt-1",
                        }
                    },
                }
            ),
            toolkits=["ask-user-toolkit"],
        )

        self.assertFalse(should_observe)
        self.assertEqual(len(confirmation_requests), 1)
        self.assertEqual(
            confirmation_requests[0]["interact_config"]["request_id"],
            "call-human-openai-1",
        )
        payload = json.loads(result_messages[0]["output"])
        self.assertEqual(
            payload,
            {
                "submitted": True,
                "selected_values": ["opt-1"],
                "other_text": None,
            },
        )

    def test_apply_broth_runtime_patches_exposes_workspace_proxy_display_name_to_callback(
        self,
    ) -> None:
        class FakeBroth:
            def __init__(self):
                self.provider = "openai"

            def _execute_tool_calls(
                self,
                *,
                tool_calls,
                run_id,
                iteration,
                callback,
                **_kwargs,
            ):
                del run_id, iteration
                callback(
                    {
                        "type": "tool_call",
                        "payload": {
                            "tool_name": tool_calls[0].name,
                            "call_id": tool_calls[0].call_id,
                            "arguments": tool_calls[0].arguments,
                        },
                    }
                )
                callback(
                    {
                        "type": "tool_result",
                        "payload": {
                            "tool_name": tool_calls[0].name,
                            "call_id": tool_calls[0].call_id,
                            "result": {"ok": True},
                        },
                    }
                )
                return [], False

            def _find_tool(self, _name, **_kwargs):
                tool = SimpleNamespace(observe=False, requires_confirmation=False)
                setattr(
                    tool,
                    miso_adapter._WORKSPACE_PROXY_ORIGINAL_TOOL_NAME_ATTR,
                    "read_file",
                )
                return tool

            def _build_observation_messages(self, full_messages, tool_messages):
                return [*full_messages, *tool_messages]

            def _inject_observation(self, _tool_message, _observation):
                return None

        miso_adapter._apply_broth_runtime_patches(FakeBroth)
        agent = FakeBroth()
        captured_events = []

        _messages, should_observe = agent._execute_tool_calls(
            tool_calls=[
                SimpleNamespace(
                    call_id="call-workspace-1",
                    name="workspace_2_extra_root_read_file",
                    arguments={"path": "hello.txt"},
                )
            ],
            run_id="run-workspace-1",
            iteration=0,
            callback=captured_events.append,
        )

        self.assertFalse(should_observe)
        self.assertEqual(len(captured_events), 2)
        self.assertEqual(
            captured_events[0]["payload"]["tool_name"],
            "workspace_2_extra_root_read_file",
        )
        self.assertEqual(captured_events[0]["payload"]["tool_display_name"], "read_file")
        self.assertEqual(captured_events[1]["payload"]["tool_display_name"], "read_file")

    def test_apply_broth_runtime_patches_extends_previous_response_fallback_error_detection(
        self,
    ) -> None:
        class FakeBroth:
            def __init__(self):
                self.provider = "openai"

            def _execute_tool_calls(self, **_kwargs):
                return [], False

            def _build_observation_messages(self, full_messages, tool_messages):
                return [*full_messages, *tool_messages]

            def _inject_observation(self, _tool_message, _observation):
                return None

            def _is_previous_response_not_found_error(self, exc):
                return "previous response" in str(exc).lower()

        miso_adapter._apply_broth_runtime_patches(FakeBroth)
        agent = FakeBroth()

        class FakeError(Exception):
            def __init__(self, message: str, body: dict | None = None):
                super().__init__(message)
                self.body = body

        no_tool_call_error = FakeError(
            (
                "Error code: 400 - {'error': {'message': "
                "'No tool call found for function call output with call_id call_123.', "
                "'type': 'invalid_request_error', 'param': 'input', 'code': None}}"
            ),
            body={
                "error": {
                    "message": (
                        "No tool call found for function call output with call_id call_123."
                    ),
                    "type": "invalid_request_error",
                    "param": "input",
                    "code": None,
                }
            },
        )
        previous_response_error = FakeError(
            "Previous response with id 'resp_1' not found.",
        )

        self.assertTrue(agent._is_previous_response_not_found_error(no_tool_call_error))
        self.assertTrue(agent._is_previous_response_not_found_error(previous_response_error))

    def test_create_agent_skips_workspace_toolkit_when_workspace_root_missing(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        with mock.patch.object(miso_adapter, "_BROTH_CLASS", FakeAgent), mock.patch.object(
            miso_adapter, "_IMPORT_ERROR", None
        ), mock.patch.object(miso_adapter.importlib, "import_module") as import_module_mock:
            agent = miso_adapter._create_agent({})

        self.assertEqual(agent.toolkits, [])
        import_module_mock.assert_not_called()

    def test_create_agent_attaches_workspace_toolkit_when_workspace_root_is_valid(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        captured = {}

        def fake_workspace_toolkit(*, workspace_root=None):
            captured["workspace_root"] = workspace_root
            return {
                "workspace_root": workspace_root,
            }

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(
                miso_adapter,
                "_BROTH_CLASS",
                FakeAgent,
            ), mock.patch.object(
                miso_adapter,
                "_IMPORT_ERROR",
                None,
            ), mock.patch.object(
                miso_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ):
                agent = miso_adapter._create_agent({"workspace_root": tmp, "toolkits": ["workspace_toolkit"]})

        self.assertEqual(len(agent.toolkits), 1)
        self.assertEqual(captured["workspace_root"], str(Path(tmp).resolve()))

    def test_create_agent_attaches_workspace_toolkit_with_current_export_name(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        captured = {}

        def fake_workspace_toolkit(*, workspace_root=None):
            captured["workspace_root"] = workspace_root
            return {
                "workspace_root": workspace_root,
            }

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(
                miso_adapter,
                "_BROTH_CLASS",
                FakeAgent,
            ), mock.patch.object(
                miso_adapter,
                "_IMPORT_ERROR",
                None,
            ), mock.patch.object(
                miso_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ):
                agent = miso_adapter._create_agent(
                    {
                        "workspace_root": tmp,
                        "toolkits": ["workspace_toolkit"],
                    }
                )

        self.assertEqual(len(agent.toolkits), 1)
        self.assertEqual(captured["workspace_root"], str(Path(tmp).resolve()))

    def test_create_agent_accepts_legacy_access_workspace_toolkit_alias(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        captured = {}

        def fake_workspace_toolkit(*, workspace_root=None):
            captured["workspace_root"] = workspace_root
            return {
                "workspace_root": workspace_root,
            }

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(
                miso_adapter,
                "_BROTH_CLASS",
                FakeAgent,
            ), mock.patch.object(
                miso_adapter,
                "_IMPORT_ERROR",
                None,
            ), mock.patch.object(
                miso_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ):
                agent = miso_adapter._create_agent(
                    {
                        "workspace_root": tmp,
                        "toolkits": ["access_workspace_toolkit"],
                    }
                )

        self.assertEqual(len(agent.toolkits), 1)
        self.assertEqual(captured["workspace_root"], str(Path(tmp).resolve()))

    def test_create_agent_attaches_workspace_toolkit_with_workspace_roots_fallback(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        captured = {}

        def fake_workspace_toolkit(*, workspace_roots=None):
            captured["workspace_roots"] = workspace_roots
            return {
                "workspace_roots": workspace_roots,
            }

        with tempfile.TemporaryDirectory() as tmp_a, tempfile.TemporaryDirectory() as tmp_b:
            with mock.patch.object(
                miso_adapter,
                "_BROTH_CLASS",
                FakeAgent,
            ), mock.patch.object(
                miso_adapter,
                "_IMPORT_ERROR",
                None,
            ), mock.patch.object(
                miso_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ):
                agent = miso_adapter._create_agent(
                    {
                        "workspace_roots": [tmp_a, tmp_b],
                        "toolkits": ["workspace_toolkit"],
                    }
                )

        self.assertEqual(len(agent.toolkits), 1)
        self.assertEqual(
            captured["workspace_roots"],
            [str(Path(tmp_a).resolve()), str(Path(tmp_b).resolve())],
        )

    def test_create_agent_builds_multi_workspace_proxy_toolkit_when_workspace_roots_are_unsupported(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        captured = {}

        class FakeTool:
            def __init__(
                self,
                *,
                name="",
                description="",
                func=None,
                parameters=None,
                observe=False,
                requires_confirmation=False,
            ):
                self.name = name
                self.description = description
                self.func = func
                self.parameters = list(parameters or [])
                self.observe = observe
                self.requires_confirmation = requires_confirmation

            def execute(self, arguments):
                payload = arguments or {}
                return self.func(**payload)

        class FakeToolkit:
            def __init__(self):
                self.tools = {}

            def register(self, tool_obj):
                self.tools[tool_obj.name] = tool_obj
                return tool_obj

            def get(self, function_name):
                return self.tools.get(function_name)

            def execute(self, function_name, arguments):
                tool_obj = self.get(function_name)
                if tool_obj is None:
                    return {"error": f"tool not found: {function_name}"}
                return tool_obj.execute(arguments)

        def fake_workspace_toolkit(*, workspace_roots=None, workspace_root=None):
            if workspace_roots is not None:
                raise TypeError("workspace_roots unsupported")
            captured.setdefault("workspace_roots", []).append(workspace_root)
            tk = FakeToolkit()
            tk.register(
                FakeTool(
                    name="read_file",
                    description="Read a file",
                    parameters=[
                        {
                            "name": "path",
                            "description": "Relative path",
                            "type_": "string",
                            "required": True,
                        }
                    ],
                    func=lambda path, _root=workspace_root: {
                        "workspace_root": _root,
                        "path": path,
                    },
                )
            )
            tk.register(
                FakeTool(
                    name="write_file",
                    description="Write a file",
                    parameters=[
                        {
                            "name": "path",
                            "description": "Relative path",
                            "type_": "string",
                            "required": True,
                        },
                        {
                            "name": "content",
                            "description": "Content",
                            "type_": "string",
                            "required": True,
                        },
                    ],
                    func=lambda path, content, _root=workspace_root: {
                        "workspace_root": _root,
                        "path": path,
                        "content": content,
                    },
                )
            )
            return tk

        with tempfile.TemporaryDirectory() as parent:
            tmp_a = str(Path(parent) / "default-root")
            tmp_b = str(Path(parent) / "extra-root")
            Path(tmp_a).mkdir()
            Path(tmp_b).mkdir()
            with mock.patch.object(
                miso_adapter,
                "_BROTH_CLASS",
                FakeAgent,
            ), mock.patch.object(
                miso_adapter,
                "_IMPORT_ERROR",
                None,
            ), mock.patch.object(
                miso_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit,
                    Toolkit=FakeToolkit,
                    Tool=FakeTool,
                ),
            ):
                agent = miso_adapter._create_agent(
                    {
                        "workspace_roots": [tmp_a, tmp_b],
                        "toolkits": ["workspace_toolkit"],
                    }
                )

        self.assertEqual(len(agent.toolkits), 1)
        self.assertEqual(
            captured["workspace_roots"],
            [str(Path(tmp_a).resolve()), str(Path(tmp_b).resolve())],
        )
        merged_toolkit = agent.toolkits[0]
        self.assertIn("read_file", merged_toolkit.tools)
        self.assertIn("write_file", merged_toolkit.tools)
        self.assertIn("workspace_2_extra_root_read_file", merged_toolkit.tools)
        self.assertIn("workspace_2_extra_root_write_file", merged_toolkit.tools)
        self.assertEqual(
            getattr(
                merged_toolkit.tools["workspace_2_extra_root_read_file"],
                miso_adapter._WORKSPACE_PROXY_ORIGINAL_TOOL_NAME_ATTR,
                "",
            ),
            "read_file",
        )
        self.assertIn("list_available_workspaces", merged_toolkit.tools)

        second_workspace_read = merged_toolkit.execute(
            "workspace_2_extra_root_read_file",
            {"path": "hello.txt"},
        )
        self.assertEqual(second_workspace_read["workspace_root"], str(Path(tmp_b).resolve()))
        self.assertEqual(second_workspace_read["path"], "hello.txt")
        self.assertTrue(merged_toolkit.tools["workspace_2_extra_root_write_file"].requires_confirmation)

    def test_create_agent_skips_toolkit_when_toolkits_option_absent(self) -> None:
        """When options has workspace_root but no toolkits key, toolkit should NOT be attached."""

        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        def fake_workspace_toolkit(*, workspace_root=None):
            return {"workspace_root": workspace_root}

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(
                miso_adapter, "_BROTH_CLASS", FakeAgent
            ), mock.patch.object(
                miso_adapter, "_IMPORT_ERROR", None
            ), mock.patch.object(
                miso_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ):
                agent = miso_adapter._create_agent({"workspace_root": tmp})

        self.assertEqual(len(agent.toolkits), 0)

    def test_create_agent_marks_selected_workspace_tools_requires_confirmation(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        class FakeTool:
            def __init__(self):
                self.requires_confirmation = False

        toolkit_instance = SimpleNamespace(
            tools={
                "write_file": FakeTool(),
                "delete_file": FakeTool(),
                "move_file": FakeTool(),
                "terminal_exec": FakeTool(),
                "read_file": FakeTool(),
            }
        )

        def fake_workspace_toolkit(*, workspace_root=None):
            return toolkit_instance

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(
                miso_adapter, "_BROTH_CLASS", FakeAgent
            ), mock.patch.object(
                miso_adapter, "_IMPORT_ERROR", None
            ), mock.patch.object(
                miso_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ):
                _agent = miso_adapter._create_agent({"workspace_root": tmp, "toolkits": ["workspace_toolkit"]})

        self.assertTrue(toolkit_instance.tools["write_file"].requires_confirmation)
        self.assertTrue(toolkit_instance.tools["delete_file"].requires_confirmation)
        self.assertTrue(toolkit_instance.tools["move_file"].requires_confirmation)
        self.assertTrue(toolkit_instance.tools["terminal_exec"].requires_confirmation)
        self.assertFalse(toolkit_instance.tools["read_file"].requires_confirmation)

    def test_create_agent_rejects_invalid_workspace_root(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        def fake_workspace_toolkit(*, workspace_root=None):
            return {
                "workspace_root": workspace_root,
            }

        with mock.patch.object(miso_adapter, "_BROTH_CLASS", FakeAgent), mock.patch.object(
            miso_adapter, "_IMPORT_ERROR", None
        ), mock.patch.object(
            miso_adapter.importlib,
            "import_module",
            return_value=SimpleNamespace(WorkspaceToolkit=fake_workspace_toolkit),
        ):
            with tempfile.TemporaryDirectory() as tmp:
                missing = str(Path(tmp) / "missing")
                with self.assertRaisesRegex(RuntimeError, "workspace_root does not exist"):
                    miso_adapter._create_agent({"workspaceRoot": missing, "toolkits": ["workspace_toolkit"]})

    def test_create_agent_uses_min_two_iterations_when_workspace_root_is_set(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        def fake_workspace_toolkit(*, workspace_root=None):
            return {
                "workspace_root": workspace_root,
            }

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(
                miso_adapter, "_BROTH_CLASS", FakeAgent
            ), mock.patch.object(
                miso_adapter, "_IMPORT_ERROR", None
            ), mock.patch.object(
                miso_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ), mock.patch.dict(miso_adapter.os.environ, {"MISO_MAX_ITERATIONS": "1"}, clear=False):
                agent = miso_adapter._create_agent({"workspace_root": tmp, "toolkits": ["workspace_toolkit"]})

        self.assertEqual(agent.max_iterations, 2)

    def test_create_agent_uses_default_max_iterations_when_env_missing(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        with mock.patch.object(miso_adapter, "_BROTH_CLASS", FakeAgent), mock.patch.object(
            miso_adapter, "_IMPORT_ERROR", None
        ), mock.patch.dict(miso_adapter.os.environ, {"MISO_MAX_ITERATIONS": ""}, clear=False):
            agent = miso_adapter._create_agent({})

        self.assertEqual(agent.max_iterations, miso_adapter._DEFAULT_MAX_ITERATIONS)

    def test_create_agent_prefers_options_max_iterations_over_env(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        with mock.patch.object(miso_adapter, "_BROTH_CLASS", FakeAgent), mock.patch.object(
            miso_adapter, "_IMPORT_ERROR", None
        ), mock.patch.dict(miso_adapter.os.environ, {"MISO_MAX_ITERATIONS": "1"}, clear=False):
            agent = miso_adapter._create_agent({"maxIterations": 5})

        self.assertEqual(agent.max_iterations, 5)

    def test_create_agent_preserves_workspace_pin_execution_context(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace_root = Path(tmp)
            target = workspace_root / "notes.txt"
            target.write_text("hello\n", encoding="utf-8")

            agent = miso_adapter._create_agent(
                {
                    "workspace_root": tmp,
                    "toolkits": ["workspace_toolkit"],
                }
            )

            self.assertIsNotNone(miso_adapter._PUPU_AGENT_CLASS)
            self.assertIsInstance(agent, miso_adapter._PUPU_AGENT_CLASS)
            self.assertEqual(len(agent.toolkits), 1)

            engine = agent._build_engine()
            self.assertIs(type(engine), miso_adapter._BROTH_CLASS)
            self.assertTrue(
                getattr(type(engine), "_pupu_tool_confirmation_contract_patch_v6", False)
            )

            result = engine._execute_from_toolkits(
                "pin_file_context",
                {"path": "notes.txt"},
                session_id="thread-1",
            )

        self.assertEqual(result.get("path"), str(target.resolve()))
        self.assertTrue(result.get("created"))
        self.assertFalse(result.get("duplicate", True))

    def test_create_agent_mounts_internal_memory_recall_tools_when_memory_is_available(self) -> None:
        from miso.memory import MemoryManager

        manager = MemoryManager()

        with mock.patch(
            "memory_factory.create_memory_manager_with_diagnostics",
            return_value=(manager, ""),
        ):
            agent = miso_adapter._create_agent(
                {
                    "provider": "ollama",
                    "model": "deepseek-r1:14b",
                    "memory_enabled": True,
                },
                session_id="chat-1",
            )

        engine = agent._build_engine(session_id="chat-1", memory_namespace="user-1")
        self.assertIsNotNone(engine._find_tool("recall_profile"))
        self.assertIsNotNone(engine._find_tool("recall_memory"))

    def test_create_agent_skips_internal_memory_recall_tools_when_tool_calling_is_disabled(self) -> None:
        from miso.memory import MemoryManager

        manager = MemoryManager()

        with mock.patch(
            "memory_factory.create_memory_manager_with_diagnostics",
            return_value=(manager, ""),
        ), mock.patch.object(
            miso_adapter._PUPU_AGENT_CLASS,
            "_supports_tool_calling",
            return_value=False,
        ):
            agent = miso_adapter._create_agent(
                {
                    "provider": "ollama",
                    "model": "plain-model",
                    "memory_enabled": True,
                },
                session_id="chat-1",
            )
            engine = agent._build_engine(session_id="chat-1", memory_namespace="user-1")
            self.assertIsNone(engine._find_tool("recall_profile"))
            self.assertIsNone(engine._find_tool("recall_memory"))

    def test_stream_chat_events_passes_on_tool_confirm_to_agent_run(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.provider = "openai"
                self.max_iterations = 3
                self.received_on_tool_confirm = False
                self.last_messages = []
                self._memory_runtime = {
                    "requested": False,
                    "available": False,
                    "reason": "",
                }

            def run(
                self,
                messages,
                payload=None,
                callback=None,
                max_iterations=None,
                on_tool_confirm=None,
            ):
                self.received_on_tool_confirm = callable(on_tool_confirm)
                self.last_messages = list(messages or [])
                if callable(callback):
                    callback(
                        {
                            "type": "final_message",
                            "run_id": "run-1",
                            "iteration": 0,
                            "timestamp": time.time(),
                            "content": "done",
                        }
                    )
                return [{"role": "assistant", "content": "done"}], {
                    "consumed_tokens": 21,
                    "input_tokens": 13,
                    "output_tokens": 8,
                    "max_context_window_tokens": 128000,
                    "context_window_used_pct": 3.5,
                }

        fake_agent = FakeAgent()

        with mock.patch.object(
            miso_adapter,
            "_create_agent",
            return_value=fake_agent,
        ):
            events = list(
                miso_adapter.stream_chat_events(
                    message="hello",
                    history=[],
                    attachments=[],
                    options={
                        "systemPromptV2": {
                            "enabled": True,
                            "defaults": {
                                "personally": "You are pragmatic.",
                                "rules": "Be concise.",
                            },
                        }
                    },
                )
            )

        self.assertTrue(fake_agent.received_on_tool_confirm)
        self.assertTrue(any(event.get("type") == "final_message" for event in events))
        self.assertTrue(any(event.get("type") == "stream_summary" for event in events))
        self.assertEqual(
            next(
                event.get("bundle", {})
                for event in events
                if event.get("type") == "stream_summary"
            ).get("consumed_tokens"),
            21,
        )
        self.assertEqual(
            next(
                event.get("bundle", {})
                for event in events
                if event.get("type") == "stream_summary"
            ).get("input_tokens"),
            13,
        )
        self.assertEqual(
            next(
                event.get("bundle", {})
                for event in events
                if event.get("type") == "stream_summary"
            ).get("output_tokens"),
            8,
        )
        self.assertGreaterEqual(len(fake_agent.last_messages), 1)
        self.assertEqual(fake_agent.last_messages[0].get("role"), "system")
        self.assertIn("[Personality]", fake_agent.last_messages[0].get("content", ""))
        self.assertIn("[Rules]", fake_agent.last_messages[0].get("content", ""))

    def test_stream_chat_events_emits_memory_unavailable_and_stops_when_history_empty(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.provider = "openai"
                self.max_iterations = 3
                self.run_called = False
                self._memory_runtime = {
                    "requested": True,
                    "available": False,
                    "reason": "embedding_provider_unavailable",
                }

            def run(self, *args, **kwargs):
                self.run_called = True
                return [], {}

        fake_agent = FakeAgent()

        with mock.patch.object(miso_adapter, "_create_agent", return_value=fake_agent):
            events = list(
                miso_adapter.stream_chat_events(
                    message="hello",
                    history=[],
                    attachments=[],
                    options={"memory_enabled": True},
                    session_id="chat-1",
                )
            )

        self.assertFalse(fake_agent.run_called)
        self.assertEqual(events[0]["type"], "memory_prepare")
        self.assertFalse(events[0]["applied"])
        self.assertEqual(events[0]["fallback_reason"], "embedding_provider_unavailable")
        self.assertEqual(events[1]["type"], "error")
        self.assertEqual(events[1]["code"], "memory_unavailable")

    def test_stream_chat_events_emits_memory_prepare_failure_but_runs_with_history(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.provider = "openai"
                self.max_iterations = 3
                self.run_called = False
                self._memory_runtime = {
                    "requested": True,
                    "available": False,
                    "reason": "embedding_provider_unavailable",
                }

            def run(
                self,
                messages,
                payload=None,
                callback=None,
                max_iterations=None,
                on_tool_confirm=None,
                session_id=None,
            ):
                self.run_called = True
                if callable(callback):
                    callback(
                        {
                            "type": "final_message",
                            "run_id": "run-1",
                            "iteration": 0,
                            "timestamp": time.time(),
                            "content": "done",
                        }
                    )
                return [{"role": "assistant", "content": "done"}], {}

        fake_agent = FakeAgent()

        with mock.patch.object(miso_adapter, "_create_agent", return_value=fake_agent):
            events = list(
                miso_adapter.stream_chat_events(
                    message="hello",
                    history=[{"role": "user", "content": "previous"}],
                    attachments=[],
                    options={"memory_enabled": True},
                    session_id="chat-1",
                )
            )

        self.assertTrue(fake_agent.run_called)
        self.assertEqual(events[0]["type"], "memory_prepare")
        self.assertFalse(events[0]["applied"])
        self.assertTrue(any(event.get("type") == "final_message" for event in events))

    def test_stream_chat_events_passes_memory_namespace_to_agent_run(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.provider = "openai"
                self.max_iterations = 3
                self.run_kwargs = None
                self._memory_runtime = {
                    "requested": True,
                    "available": True,
                    "reason": "",
                }

            def run(
                self,
                messages,
                payload=None,
                callback=None,
                max_iterations=None,
                on_tool_confirm=None,
                session_id=None,
                memory_namespace=None,
            ):
                self.run_kwargs = {
                    "messages": messages,
                    "payload": payload,
                    "max_iterations": max_iterations,
                    "session_id": session_id,
                    "memory_namespace": memory_namespace,
                }
                if callable(callback):
                    callback(
                        {
                            "type": "final_message",
                            "run_id": "run-1",
                            "iteration": 0,
                            "timestamp": time.time(),
                            "content": "done",
                        }
                    )
                return [{"role": "assistant", "content": "done"}], {}

        fake_agent = FakeAgent()

        with mock.patch.object(miso_adapter, "_create_agent", return_value=fake_agent):
            events = list(
                miso_adapter.stream_chat_events(
                    message="hello",
                    history=[],
                    attachments=[],
                    options={
                        "memory_enabled": True,
                        "memory_namespace": "pupu:default",
                    },
                    session_id="chat-1",
                )
            )

        self.assertEqual(fake_agent.run_kwargs["session_id"], "chat-1")
        self.assertEqual(fake_agent.run_kwargs["memory_namespace"], "pupu:default")
        self.assertTrue(any(event.get("type") == "final_message" for event in events))

    def test_extract_last_assistant_text_handles_structured_content(self) -> None:
        messages = [
            {
                "type": "message",
                "content": [
                    {"type": "output_text", "text": "Tool call completed."},
                ],
            },
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Final answer text"},
                ],
            },
        ]
        self.assertEqual(
            miso_adapter._extract_last_assistant_text(messages),
            "Final answer text",
        )

    def test_load_broth_class_falls_back_to_runtime_import_when_sources_invalid(self) -> None:
        class FakeBroth:
            pass

        original_broth = miso_adapter._BROTH_CLASS
        original_import_error = miso_adapter._IMPORT_ERROR
        original_source = miso_adapter._RESOLVED_MISO_SOURCE
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                source_root = Path(temp_dir)
                package_dir = source_root / "src" / "miso" / "runtime"
                package_dir.mkdir(parents=True, exist_ok=True)
                (package_dir / "__init__.py").write_text("", encoding="utf-8")

                fake_module = SimpleNamespace(
                    Broth=FakeBroth,
                    __file__=str(package_dir / "__init__.py"),
                )

                with mock.patch.object(
                    miso_adapter,
                    "_candidate_miso_sources",
                    return_value=[Path("/tmp/invalid-miso-source")],
                ), mock.patch.object(
                    miso_adapter,
                    "_is_valid_miso_source",
                    return_value=False,
                ), mock.patch.object(
                    miso_adapter.importlib,
                    "import_module",
                    return_value=fake_module,
                ):
                    miso_adapter._load_broth_class()

                self.assertIs(miso_adapter._BROTH_CLASS, FakeBroth)
                self.assertIsNone(miso_adapter._IMPORT_ERROR)
                self.assertEqual(
                    miso_adapter._RESOLVED_MISO_SOURCE,
                    str(source_root.resolve()),
                )
        finally:
            miso_adapter._BROTH_CLASS = original_broth
            miso_adapter._IMPORT_ERROR = original_import_error
            miso_adapter._RESOLVED_MISO_SOURCE = original_source

    def test_load_broth_class_reports_runtime_import_failure(self) -> None:
        original_broth = miso_adapter._BROTH_CLASS
        original_import_error = miso_adapter._IMPORT_ERROR
        original_source = miso_adapter._RESOLVED_MISO_SOURCE
        try:
            with mock.patch.object(
                miso_adapter,
                "_candidate_miso_sources",
                return_value=[Path("/tmp/invalid-miso-source")],
            ), mock.patch.object(
                miso_adapter,
                "_is_valid_miso_source",
                return_value=False,
            ), mock.patch.object(
                miso_adapter.importlib,
                "import_module",
                side_effect=ImportError("runtime missing"),
            ):
                miso_adapter._load_broth_class()

            self.assertIsNone(miso_adapter._BROTH_CLASS)
            self.assertIsNone(miso_adapter._RESOLVED_MISO_SOURCE)
            self.assertIsNotNone(miso_adapter._IMPORT_ERROR)
            error_text = str(miso_adapter._IMPORT_ERROR)
            self.assertIn("invalid source: /tmp/invalid-miso-source", error_text)
            self.assertIn("runtime import failed: runtime missing", error_text)
        finally:
            miso_adapter._BROTH_CLASS = original_broth
            miso_adapter._IMPORT_ERROR = original_import_error
            miso_adapter._RESOLVED_MISO_SOURCE = original_source

    def test_capability_file_candidates_include_packaged_module_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            package_dir = Path(temp_dir) / "miso"
            package_dir.mkdir(parents=True, exist_ok=True)
            module_file = package_dir / "__init__.pyc"
            module_file.write_text("", encoding="utf-8")
            capability_file = package_dir / "runtime" / "resources" / "model_capabilities.json"
            capability_file.parent.mkdir(parents=True, exist_ok=True)
            capability_file.write_text("{}", encoding="utf-8")

            fake_module = SimpleNamespace(__file__=str(module_file))
            with mock.patch.object(
                miso_adapter.importlib,
                "import_module",
                return_value=fake_module,
            ):
                candidates = miso_adapter._capability_file_candidates()

            self.assertIn(capability_file.resolve(), candidates)


class MisoAdapterToolkitIconTests(unittest.TestCase):
    def _build_toolkit_fixture(
        self,
        *,
        icon_value: str,
        color: str | None = None,
        backgroundcolor: str | None = None,
        include_icon_file: bool = False,
    ) -> tuple[type, str, ModuleType]:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)

        package_dir = Path(temp_dir.name) / "demo_toolkit"
        package_dir.mkdir(parents=True, exist_ok=True)
        (package_dir / "runtime.py").write_text("", encoding="utf-8")
        (package_dir / "README.md").write_text("# Demo Toolkit\n", encoding="utf-8")
        if include_icon_file:
            (package_dir / "icon.svg").write_text(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" rx="2" fill="#111827"/></svg>\n',
                encoding="utf-8",
            )

        color_line = f'color = "{color}"\n' if color is not None else ""
        background_line = (
            f'backgroundcolor = "{backgroundcolor}"\n'
            if backgroundcolor is not None
            else ""
        )
        (package_dir / "toolkit.toml").write_text(
            f"""
[toolkit]
id = "demo"
name = "Demo Toolkit"
description = "Toolkit for icon tests."
factory = "demo_toolkit:DemoToolkit"
version = "1.0.0"
readme = "README.md"
icon = "{icon_value}"
{color_line}{background_line}tags = ["local", "test"]

[display]
category = "builtin"
order = 1
hidden = false

[compat]
python = ">=3.9"
miso = ">=0"

[[tools]]
name = "echo"
title = "Echo"
description = "Echo text back."
observe = false
requires_confirmation = false
""".strip()
            + "\n",
            encoding="utf-8",
        )

        toolkit_base = type("FakeToolkitBase", (), {})
        module_name = "miso.toolkits.builtin.demo_toolkit"
        toolkit_module = ModuleType(module_name)
        toolkit_module.__file__ = str(package_dir / "runtime.py")
        toolkit_class = type(
            "DemoToolkit",
            (toolkit_base,),
            {
                "__module__": module_name,
                "__doc__": "Toolkit for icon tests.",
                "echo": lambda self: None,
            },
        )
        setattr(toolkit_module, "DemoToolkit", toolkit_class)
        return toolkit_base, module_name, toolkit_module

    def _build_import_side_effect(
        self,
        *,
        module_name: str,
        toolkit_module: ModuleType,
    ):
        builtin_pkg = ModuleType("miso.toolkits.builtin")
        builtin_pkg.__path__ = [str(Path(toolkit_module.__file__).parent.parent)]
        miso_module = ModuleType("miso")

        def _fake_import_module(name: str, package=None):
            del package
            if name == "miso.toolkits":
                return miso_module
            if name == "miso.toolkits.builtin":
                return builtin_pkg
            if name == module_name:
                return toolkit_module
            raise ImportError(name)

        return _fake_import_module

    def test_get_toolkit_catalog_v2_returns_builtin_icon_payload(self) -> None:
        toolkit_base, module_name, toolkit_module = self._build_toolkit_fixture(
            icon_value="terminal",
            color="#0f172a",
            backgroundcolor="#bae6fd",
        )

        with mock.patch.object(
            miso_adapter,
            "_resolve_toolkit_base",
            return_value=toolkit_base,
        ), mock.patch.object(
            miso_adapter.importlib,
            "import_module",
            side_effect=self._build_import_side_effect(
                module_name=module_name,
                toolkit_module=toolkit_module,
            ),
        ), mock.patch.object(
            miso_adapter.pkgutil,
            "iter_modules",
            return_value=[(None, "demo_toolkit", True)],
        ):
            payload = miso_adapter.get_toolkit_catalog_v2()

        self.assertEqual(payload["count"], 1)
        entry = payload["toolkits"][0]
        self.assertEqual(
            entry["toolkitIcon"],
            {
                "type": "builtin",
                "name": "terminal",
                "color": "#0f172a",
                "backgroundColor": "#bae6fd",
            },
        )
        self.assertEqual(entry["tools"][0]["icon"], entry["toolkitIcon"])

    def test_get_toolkit_metadata_returns_file_icon_payload(self) -> None:
        toolkit_base, module_name, toolkit_module = self._build_toolkit_fixture(
            icon_value="icon.svg",
            include_icon_file=True,
        )

        with mock.patch.object(
            miso_adapter,
            "_resolve_toolkit_base",
            return_value=toolkit_base,
        ), mock.patch.object(
            miso_adapter.importlib,
            "import_module",
            side_effect=self._build_import_side_effect(
                module_name=module_name,
                toolkit_module=toolkit_module,
            ),
        ), mock.patch.object(
            miso_adapter.pkgutil,
            "iter_modules",
            return_value=[(None, "demo_toolkit", True)],
        ):
            payload = miso_adapter.get_toolkit_metadata("DemoToolkit")

        self.assertEqual(payload["toolkitIcon"]["type"], "file")
        self.assertEqual(payload["toolkitIcon"]["mimeType"], "image/svg+xml")
        self.assertIn("<svg", payload["toolkitIcon"]["content"])

    def test_invalid_builtin_toolkit_icon_returns_empty_payload(self) -> None:
        toolkit_base, module_name, toolkit_module = self._build_toolkit_fixture(
            icon_value="terminal",
        )

        with mock.patch.object(
            miso_adapter,
            "_resolve_toolkit_base",
            return_value=toolkit_base,
        ), mock.patch.object(
            miso_adapter.importlib,
            "import_module",
            side_effect=self._build_import_side_effect(
                module_name=module_name,
                toolkit_module=toolkit_module,
            ),
        ), mock.patch.object(
            miso_adapter.pkgutil,
            "iter_modules",
            return_value=[(None, "demo_toolkit", True)],
        ):
            catalog_payload = miso_adapter.get_toolkit_catalog_v2()
            metadata_payload = miso_adapter.get_toolkit_metadata("DemoToolkit")

        self.assertEqual(catalog_payload["toolkits"][0]["toolkitIcon"], {})
        self.assertEqual(metadata_payload["toolkitIcon"], {})


if __name__ == "__main__":
    unittest.main()
