import json
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
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

        self.assertEqual(
            prompt_text,
            "\n\n".join(
                [
                    "[Personality]\nHelpful and concise.",
                    "[Rules]\nAlways ask clarifying questions when blocked.",
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

    def test_get_toolkit_catalog_lists_known_toolkit_exports(self) -> None:
        class FakeToolkitBase:
            pass

        class FakeBuiltinToolkit(FakeToolkitBase):
            pass

        class FakePythonWorkspaceToolkit(FakeToolkitBase):
            pass

        class FakeMcpToolkit(FakeToolkitBase):
            pass

        def import_module_side_effect(module_name: str):
            if module_name == "miso.tool":
                return SimpleNamespace(toolkit=FakeToolkitBase)
            if module_name == "miso":
                return SimpleNamespace(
                    builtin_toolkit=FakeBuiltinToolkit,
                    python_workspace_toolkit=FakePythonWorkspaceToolkit,
                    mcp=FakeMcpToolkit,
                )
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
                "builtin_toolkit",
                "python_workspace_toolkit",
                "mcp",
            ],
        )
        self.assertEqual(catalog["count"], 3)

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
        self.assertEqual(request_event.get("type"), "tool_confirmation_request")
        confirmation_id = request_event.get("confirmation_id")
        self.assertIsInstance(confirmation_id, str)

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

            def _find_tool(self, name):
                if name == "observe_tool":
                    return SimpleNamespace(observe=True)
                return SimpleNamespace(observe=False)

            def _execute_from_toolkits(self, name, arguments):
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

            def _emit(self, _callback, event_type, _run_id, *, iteration, **extra):
                self.events.append((event_type, iteration, extra))

            def _find_tool(self, _name):
                return SimpleNamespace(
                    observe=False,
                    requires_confirmation=True,
                    description="dangerous",
                )

            def _execute_from_toolkits(self, name, arguments):
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
        approved_content = approved_messages[0]["content"][0]["content"]
        approved_result = json.loads(approved_content)
        self.assertEqual(approved_result["ok"], True)

    def test_apply_broth_runtime_patches_non_anthropic_confirmation_events(self) -> None:
        class FakeBroth:
            def __init__(self):
                self.provider = "openai"
                self.used_original_execute = False
                self.events = []

            def _execute_tool_calls(
                self,
                *,
                tool_calls,
                run_id,
                iteration,
                callback,
                on_tool_confirm=None,
            ):
                self.used_original_execute = True
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
        )
        confirmed_events = [event for event in agent.events if event[0] == "tool_confirmed"]
        self.assertEqual(len(confirmed_events), 1)
        self.assertEqual(confirmed_events[0][2].get("call_id"), "call-openai-1")
        self.assertTrue(agent.used_original_execute)

        agent.events = []
        _messages, _observe = agent._execute_tool_calls(
            tool_calls=tool_calls,
            run_id="run-openai-2",
            iteration=1,
            callback=None,
            on_tool_confirm=lambda _req: {"approved": False, "reason": "denied"},
        )
        denied_events = [event for event in agent.events if event[0] == "tool_denied"]
        self.assertEqual(len(denied_events), 1)
        self.assertEqual(denied_events[0][2].get("call_id"), "call-openai-1")
        self.assertEqual(denied_events[0][2].get("reason"), "denied")

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

        def fake_workspace_toolkit(*, workspace_root=None, include_python_runtime=True):
            captured["workspace_root"] = workspace_root
            captured["include_python_runtime"] = include_python_runtime
            return {
                "workspace_root": workspace_root,
                "include_python_runtime": include_python_runtime,
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
                    python_workspace_toolkit=fake_workspace_toolkit
                ),
            ):
                agent = miso_adapter._create_agent({"workspace_root": tmp, "toolkits": ["python_workspace_toolkit"]})

        self.assertEqual(len(agent.toolkits), 1)
        self.assertEqual(captured["workspace_root"], str(Path(tmp).resolve()))
        self.assertEqual(captured["include_python_runtime"], True)

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

        def fake_workspace_toolkit(*, workspace_root=None, include_python_runtime=True):
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
                    python_workspace_toolkit=fake_workspace_toolkit
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

        def fake_workspace_toolkit(*, workspace_root=None, include_python_runtime=True):
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
                    python_workspace_toolkit=fake_workspace_toolkit
                ),
            ):
                _agent = miso_adapter._create_agent({"workspace_root": tmp, "toolkits": ["python_workspace_toolkit"]})

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

        def fake_workspace_toolkit(*, workspace_root=None, include_python_runtime=True):
            return {
                "workspace_root": workspace_root,
                "include_python_runtime": include_python_runtime,
            }

        with mock.patch.object(miso_adapter, "_BROTH_CLASS", FakeAgent), mock.patch.object(
            miso_adapter, "_IMPORT_ERROR", None
        ), mock.patch.object(
            miso_adapter.importlib,
            "import_module",
            return_value=SimpleNamespace(python_workspace_toolkit=fake_workspace_toolkit),
        ):
            with tempfile.TemporaryDirectory() as tmp:
                missing = str(Path(tmp) / "missing")
                with self.assertRaisesRegex(RuntimeError, "workspace_root does not exist"):
                    miso_adapter._create_agent({"workspaceRoot": missing, "toolkits": ["python_workspace_toolkit"]})

    def test_create_agent_uses_min_two_iterations_when_workspace_root_is_set(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.toolkits = []
                self.provider = ""
                self.model = ""
                self.max_iterations = 0

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        def fake_workspace_toolkit(*, workspace_root=None, include_python_runtime=True):
            return {
                "workspace_root": workspace_root,
                "include_python_runtime": include_python_runtime,
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
                    python_workspace_toolkit=fake_workspace_toolkit
                ),
            ), mock.patch.dict(miso_adapter.os.environ, {"MISO_MAX_ITERATIONS": "1"}, clear=False):
                agent = miso_adapter._create_agent({"workspace_root": tmp, "toolkits": ["python_workspace_toolkit"]})

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
                return [{"role": "assistant", "content": "done"}], {}

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
                package_dir = source_root / "miso"
                package_dir.mkdir(parents=True, exist_ok=True)
                (package_dir / "__init__.py").write_text("", encoding="utf-8")
                (package_dir / "broth.py").write_text("", encoding="utf-8")

                fake_module = SimpleNamespace(
                    broth=FakeBroth,
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
            capability_file = package_dir / "model_capabilities.json"
            capability_file.write_text("{}", encoding="utf-8")

            fake_module = SimpleNamespace(__file__=str(module_file))
            with mock.patch.object(
                miso_adapter.importlib,
                "import_module",
                return_value=fake_module,
            ):
                candidates = miso_adapter._capability_file_candidates()

            self.assertIn(capability_file.resolve(), candidates)


if __name__ == "__main__":
    unittest.main()
