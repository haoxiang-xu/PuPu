import json
import os
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

import unchain_adapter  # noqa: E402


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
            unchain_adapter,
            "_capability_file_candidates",
            return_value=[capability_file],
        ), mock.patch.object(
            unchain_adapter,
            "_fetch_ollama_models",
            return_value=[],
        ):
            providers = unchain_adapter.get_capability_catalog()

        self.assertEqual(providers["openai"], ["gpt-5"])
        self.assertEqual(providers["anthropic"], ["claude-opus-4-6"])
        self.assertEqual(providers["ollama"], ["deepseek-r1:14b"])
        self.assertNotIn("text-embedding-3-small", providers["openai"])

    def test_build_selected_plan_toolkit_passes_session_store(self) -> None:
        captured = {}

        class PlanToolkit:
            def __init__(self, *, session_store=None, session_id=""):
                captured["session_store"] = session_store
                captured["session_id"] = session_id
                self.tools = {}

        with tempfile.TemporaryDirectory() as data_dir:
            with mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": data_dir}, clear=False), \
                 mock.patch.object(
                     unchain_adapter.importlib,
                     "import_module",
                     return_value=SimpleNamespace(PlanToolkit=PlanToolkit),
                 ):
                built = unchain_adapter._build_selected_toolkits(
                    {"toolkits": ["plan"]},
                    session_id="chat-1",
                )

        self.assertEqual(len(built), 1)
        self.assertIsNotNone(captured["session_store"])
        self.assertEqual(captured["session_id"], "chat-1")
        self.assertEqual(
            getattr(built[0], unchain_adapter._RUNTIME_TOOLKIT_ID_ATTR),
            "plan",
        )

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
            unchain_adapter,
            "_capability_file_candidates",
            return_value=[capability_file],
        ), mock.patch.object(
            unchain_adapter,
            "_httpx",
            fake_httpx,
        ):
            providers = unchain_adapter.get_capability_catalog()

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
            unchain_adapter,
            "_capability_file_candidates",
            return_value=[capability_file],
        ):
            providers = unchain_adapter.get_embedding_provider_catalog()

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
                "supports_tools": False,
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
            unchain_adapter,
            "_capability_file_candidates",
            return_value=[capability_file],
        ):
            model_capabilities = unchain_adapter.get_model_capability_catalog()

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
                "supports_tools": False,
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
            unchain_adapter.get_default_model_capabilities(),
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

        messages = unchain_adapter._normalize_messages(history, "", attachments)

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
        prompt_text = unchain_adapter._build_system_prompt_v2_text_from_options(
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
                *unchain_adapter._SYSTEM_PROMPT_V2_BUILTIN_RULES,
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
        prompt_text = unchain_adapter._build_system_prompt_v2_text_from_options(
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
        prompt_text = unchain_adapter._build_effective_system_prompt_text(
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
            if module_name == "unchain.tools":
                return SimpleNamespace(Toolkit=FakeToolkitBase)
            if module_name == "unchain.toolkits":
                return SimpleNamespace(WorkspaceToolkit=FakePythonWorkspaceToolkit)
            raise ImportError(module_name)

        with mock.patch.object(
            unchain_adapter.importlib,
            "import_module",
            side_effect=import_module_side_effect,
        ):
            catalog = unchain_adapter.get_toolkit_catalog()

        names = [entry["name"] for entry in catalog["toolkits"]]
        self.assertEqual(
            names,
            [
                "workspace_toolkit",
            ],
        )
        self.assertEqual(catalog["count"], 1)

    def test_get_toolkit_catalog_returns_empty_when_toolkit_base_unavailable(self) -> None:
        with mock.patch.object(unchain_adapter, "_resolve_toolkit_base", return_value=None):
            catalog = unchain_adapter.get_toolkit_catalog()

        self.assertEqual(catalog["toolkits"], [])
        self.assertEqual(catalog["count"], 0)

    def test_extract_workspace_root_from_options(self) -> None:
        self.assertEqual(
            unchain_adapter._extract_workspace_root_from_options(
                {"workspaceRoot": "  /tmp/a  "}
            ),
            "/tmp/a",
        )
        self.assertEqual(
            unchain_adapter._extract_workspace_root_from_options(
                {"workspace_root": "  /tmp/b  "}
            ),
            "/tmp/b",
        )
        self.assertEqual(
            unchain_adapter._extract_workspace_root_from_options({}),
            "",
        )

    def test_extract_max_iterations_from_options(self) -> None:
        self.assertEqual(
            unchain_adapter._extract_max_iterations_from_options({"maxIterations": " 4 "}),
            4,
        )
        self.assertEqual(
            unchain_adapter._extract_max_iterations_from_options({"max_iterations": 0}),
            1,
        )
        self.assertIsNone(
            unchain_adapter._extract_max_iterations_from_options({"maxIterations": "abc"})
        )
        self.assertIsNone(unchain_adapter._extract_max_iterations_from_options({}))

    def test_make_tool_confirm_callback_round_trip_with_submit(self) -> None:
        emitted_events = []
        confirm_cb = unchain_adapter._make_tool_confirm_callback(
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

        submitted = unchain_adapter.submit_tool_confirmation(
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
        confirm_cb = unchain_adapter._make_tool_confirm_callback(
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
        unchain_adapter.cancel_tool_confirmations(cancel_event)
        worker.join(timeout=2)
        self.assertFalse(worker.is_alive())

        result = response_holder.get("value")
        submitted = unchain_adapter.submit_tool_confirmation(
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
        submitted = unchain_adapter.submit_tool_confirmation(
            confirmation_id="unknown-confirmation-id",
            approved=True,
        )
        self.assertFalse(submitted)

    def test_create_agent_skips_workspace_toolkit_when_workspace_root_missing(self) -> None:
        class FakeAgent:
            def __init__(self, **kwargs):
                self.toolkits = []
                self.provider = kwargs.get("provider", "")
                self.model = kwargs.get("model", "")
                self.max_iterations = 0
                self.name = kwargs.get("name", "")
                for key, value in kwargs.items():
                    if not hasattr(self, key):
                        setattr(self, key, value)

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        import recipe_loader

        with mock.patch.object(
            unchain_adapter, "_UnchainAgent", FakeAgent
        ), mock.patch.object(
            unchain_adapter.importlib, "import_module"
        ) as import_module_mock, mock.patch.object(
            recipe_loader, "load_recipe", return_value=None
        ):
            agent = unchain_adapter._create_agent({})

        self.assertEqual(agent._toolkits, [])
        import_module_mock.assert_not_called()

    def test_create_agent_attaches_workspace_toolkit_when_workspace_root_is_valid(self) -> None:
        class FakeAgent:
            def __init__(self, **kwargs):
                self.toolkits = []
                self.provider = kwargs.get("provider", "")
                self.model = kwargs.get("model", "")
                self.max_iterations = 0
                self.name = kwargs.get("name", "")
                for key, value in kwargs.items():
                    if not hasattr(self, key):
                        setattr(self, key, value)

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
                unchain_adapter,
                "_UnchainAgent",
                FakeAgent,
            ), mock.patch.object(
                unchain_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ):
                agent = unchain_adapter._create_agent({"workspace_root": tmp, "toolkits": ["workspace_toolkit"]})

        self.assertEqual(len(agent._toolkits), 1)
        self.assertEqual(captured["workspace_root"], str(Path(tmp).resolve()))

    def test_create_agent_attaches_workspace_toolkit_with_current_export_name(self) -> None:
        class FakeAgent:
            def __init__(self, **kwargs):
                self.toolkits = []
                self.provider = kwargs.get("provider", "")
                self.model = kwargs.get("model", "")
                self.max_iterations = 0
                self.name = kwargs.get("name", "")
                for key, value in kwargs.items():
                    if not hasattr(self, key):
                        setattr(self, key, value)

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
                unchain_adapter,
                "_UnchainAgent",
                FakeAgent,
            ), mock.patch.object(
                unchain_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ):
                agent = unchain_adapter._create_agent(
                    {
                        "workspace_root": tmp,
                        "toolkits": ["workspace_toolkit"],
                    }
                )

        self.assertEqual(len(agent._toolkits), 1)
        self.assertEqual(captured["workspace_root"], str(Path(tmp).resolve()))

    def test_create_agent_accepts_legacy_access_workspace_toolkit_alias(self) -> None:
        class FakeAgent:
            def __init__(self, **kwargs):
                self.toolkits = []
                self.provider = kwargs.get("provider", "")
                self.model = kwargs.get("model", "")
                self.max_iterations = 0
                self.name = kwargs.get("name", "")
                for key, value in kwargs.items():
                    if not hasattr(self, key):
                        setattr(self, key, value)

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
                unchain_adapter,
                "_UnchainAgent",
                FakeAgent,
            ), mock.patch.object(
                unchain_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ):
                agent = unchain_adapter._create_agent(
                    {
                        "workspace_root": tmp,
                        "toolkits": ["access_workspace_toolkit"],
                    }
                )

        self.assertEqual(len(agent._toolkits), 1)
        self.assertEqual(captured["workspace_root"], str(Path(tmp).resolve()))

    def test_create_agent_attaches_workspace_toolkit_with_workspace_roots_fallback(self) -> None:
        class FakeAgent:
            def __init__(self, **kwargs):
                self.toolkits = []
                self.provider = kwargs.get("provider", "")
                self.model = kwargs.get("model", "")
                self.max_iterations = 0
                self.name = kwargs.get("name", "")
                for key, value in kwargs.items():
                    if not hasattr(self, key):
                        setattr(self, key, value)

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
                unchain_adapter,
                "_UnchainAgent",
                FakeAgent,
            ), mock.patch.object(
                unchain_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ):
                agent = unchain_adapter._create_agent(
                    {
                        "workspace_roots": [tmp_a, tmp_b],
                        "toolkits": ["workspace_toolkit"],
                    }
                )

        self.assertEqual(len(agent._toolkits), 1)
        self.assertEqual(
            captured["workspace_roots"],
            [str(Path(tmp_a).resolve()), str(Path(tmp_b).resolve())],
        )

    def test_create_agent_builds_multi_workspace_proxy_toolkit_when_workspace_roots_are_unsupported(self) -> None:
        class FakeAgent:
            def __init__(self, **kwargs):
                self.toolkits = []
                self.provider = kwargs.get("provider", "")
                self.model = kwargs.get("model", "")
                self.max_iterations = 0
                self.name = kwargs.get("name", "")
                for key, value in kwargs.items():
                    if not hasattr(self, key):
                        setattr(self, key, value)

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
                unchain_adapter,
                "_UnchainAgent",
                FakeAgent,
            ), mock.patch.object(
                unchain_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit,
                    Toolkit=FakeToolkit,
                    Tool=FakeTool,
                ),
            ):
                agent = unchain_adapter._create_agent(
                    {
                        "workspace_roots": [tmp_a, tmp_b],
                        "toolkits": ["workspace_toolkit"],
                    }
                )

        self.assertEqual(len(agent._toolkits), 1)
        self.assertEqual(
            captured["workspace_roots"],
            [str(Path(tmp_a).resolve()), str(Path(tmp_b).resolve())],
        )
        merged_toolkit = agent._toolkits[0]
        self.assertIn("read_file", merged_toolkit.tools)
        self.assertIn("write_file", merged_toolkit.tools)
        self.assertIn("workspace_2_extra_root_read_file", merged_toolkit.tools)
        self.assertIn("workspace_2_extra_root_write_file", merged_toolkit.tools)
        self.assertEqual(
            getattr(
                merged_toolkit.tools["workspace_2_extra_root_read_file"],
                unchain_adapter._WORKSPACE_PROXY_ORIGINAL_TOOL_NAME_ATTR,
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

    def test_create_agent_does_not_attach_workspace_tools_when_workspace_toolkit_is_not_selected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            agent = unchain_adapter._create_agent(
                {
                    "modelId": "openai:gpt-5",
                    "openai_api_key": "test-key",
                    "workspace_root": tmp,
                }
            )

        self.assertEqual(agent.name, "pupu_developer")
        self.assertEqual(agent._toolkits, [])
        self.assertFalse(
            any(type(module).__name__ == "ToolsModule" for module in agent.spec.modules)
        )

    def test_build_workspace_toolkits_requires_explicit_workspace_toolkit_selection(self) -> None:
        class FakeWorkspaceToolkit:
            def __init__(self, *, workspace_root=None):
                self.workspace_root = workspace_root
                self.tools = {}

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(
                unchain_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(WorkspaceToolkit=FakeWorkspaceToolkit),
            ):
                omitted = unchain_adapter._build_workspace_toolkits(
                    {"workspace_root": tmp}
                )
                selected = unchain_adapter._build_workspace_toolkits(
                    {"workspace_root": tmp, "toolkits": ["workspace_toolkit"]}
                )
                other_toolkit = unchain_adapter._build_workspace_toolkits(
                    {"workspace_root": tmp, "toolkits": ["core"]}
                )

        self.assertEqual(omitted, [])
        self.assertEqual(other_toolkit, [])
        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0].workspace_root, str(Path(tmp).resolve()))

    def test_create_agent_marks_selected_workspace_tools_requires_confirmation(self) -> None:
        class FakeAgent:
            def __init__(self, **kwargs):
                self.toolkits = []
                self.provider = kwargs.get("provider", "")
                self.model = kwargs.get("model", "")
                self.max_iterations = 0
                self.name = kwargs.get("name", "")
                for key, value in kwargs.items():
                    if not hasattr(self, key):
                        setattr(self, key, value)

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
                unchain_adapter, "_UnchainAgent", FakeAgent
            ), mock.patch.object(
                unchain_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ):
                _agent = unchain_adapter._create_agent({"workspace_root": tmp, "toolkits": ["workspace_toolkit"]})

        self.assertTrue(toolkit_instance.tools["write_file"].requires_confirmation)
        self.assertTrue(toolkit_instance.tools["delete_file"].requires_confirmation)
        self.assertTrue(toolkit_instance.tools["move_file"].requires_confirmation)
        self.assertTrue(toolkit_instance.tools["terminal_exec"].requires_confirmation)
        self.assertFalse(toolkit_instance.tools["read_file"].requires_confirmation)

    def test_create_agent_rejects_invalid_workspace_root(self) -> None:
        class FakeAgent:
            def __init__(self, **kwargs):
                self.toolkits = []
                self.provider = kwargs.get("provider", "")
                self.model = kwargs.get("model", "")
                self.max_iterations = 0
                self.name = kwargs.get("name", "")
                for key, value in kwargs.items():
                    if not hasattr(self, key):
                        setattr(self, key, value)

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        def fake_workspace_toolkit(*, workspace_root=None):
            return {
                "workspace_root": workspace_root,
            }

        with mock.patch.object(
            unchain_adapter, "_UnchainAgent", FakeAgent
        ), mock.patch.object(
            unchain_adapter.importlib,
            "import_module",
            return_value=SimpleNamespace(WorkspaceToolkit=fake_workspace_toolkit),
        ):
            with tempfile.TemporaryDirectory() as tmp:
                missing = str(Path(tmp) / "missing")
                with self.assertRaisesRegex(RuntimeError, "workspace_root does not exist"):
                    unchain_adapter._create_agent({"workspaceRoot": missing, "toolkits": ["workspace_toolkit"]})

    def test_create_agent_uses_min_two_iterations_when_workspace_root_is_set(self) -> None:
        class FakeAgent:
            def __init__(self, **kwargs):
                self.toolkits = []
                self.provider = kwargs.get("provider", "")
                self.model = kwargs.get("model", "")
                self.max_iterations = 0
                self.name = kwargs.get("name", "")
                for key, value in kwargs.items():
                    if not hasattr(self, key):
                        setattr(self, key, value)

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        def fake_workspace_toolkit(*, workspace_root=None):
            return {
                "workspace_root": workspace_root,
            }

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(
                unchain_adapter, "_UnchainAgent", FakeAgent
            ), mock.patch.object(
                unchain_adapter.importlib,
                "import_module",
                return_value=SimpleNamespace(
                    WorkspaceToolkit=fake_workspace_toolkit
                ),
            ), mock.patch.dict(unchain_adapter.os.environ, {"UNCHAIN_MAX_ITERATIONS": "1"}, clear=False):
                agent = unchain_adapter._create_agent({"workspace_root": tmp, "toolkits": ["workspace_toolkit"]})

        self.assertEqual(agent._max_iterations, 2)

    def test_create_agent_uses_default_max_iterations_when_env_missing(self) -> None:
        class FakeAgent:
            def __init__(self, **kwargs):
                self.toolkits = []
                self.provider = kwargs.get("provider", "")
                self.model = kwargs.get("model", "")
                self.max_iterations = 0
                self.name = kwargs.get("name", "")
                for key, value in kwargs.items():
                    if not hasattr(self, key):
                        setattr(self, key, value)

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        with mock.patch.object(
            unchain_adapter, "_UnchainAgent", FakeAgent
        ), mock.patch.dict(unchain_adapter.os.environ, {"UNCHAIN_MAX_ITERATIONS": ""}, clear=False):
            agent = unchain_adapter._create_agent({})

        self.assertEqual(agent._max_iterations, unchain_adapter._DEFAULT_MAX_ITERATIONS)

    def _seed_explore_subagent(self, home_path: Path) -> None:
        from subagent_seeds import ensure_seeds_written

        ensure_seeds_written(home_path / ".pupu" / "subagents")

    def test_create_agent_builds_developer_directly_with_selected_model(self) -> None:
        with tempfile.TemporaryDirectory() as home:
            home_path = Path(home)
            self._seed_explore_subagent(home_path)
            with mock.patch("pathlib.Path.home", return_value=home_path):
                agent = unchain_adapter._create_agent(
                    {
                        "modelId": "openai:gpt-5",
                        "openai_api_key": "test-key",
                        "toolkits": ["core"],
                    }
                )

        self.assertEqual(agent.name, "pupu_developer")
        self.assertEqual(agent.model, "gpt-5")
        self.assertEqual(agent._display_model, "openai:gpt-5")
        self.assertEqual(agent._orchestration_role, "developer")
        self.assertEqual(agent._developer_model_id, "openai:gpt-5")
        self.assertEqual(agent._general_model_id, "openai:gpt-5")

        module_names = [type(module).__name__ for module in agent.spec.modules]
        self.assertIn("SubagentModule", module_names)

    def test_create_agent_routes_waiting_approval_mode_directly_to_developer(self) -> None:
        with tempfile.TemporaryDirectory() as home:
            home_path = Path(home)
            self._seed_explore_subagent(home_path)
            with mock.patch("pathlib.Path.home", return_value=home_path):
                agent = unchain_adapter._create_agent(
                    {
                        "modelId": "openai:gpt-5",
                        "openai_api_key": "test-key",
                        "toolkits": ["core"],
                        "agent_orchestration": {"mode": "developer_waiting_approval"},
                    }
                )

        self.assertEqual(agent.name, "pupu_developer")
        self.assertEqual(agent.model, "gpt-5")
        self.assertEqual(agent._orchestration_role, "developer")
        self.assertEqual(agent._orchestration_next_mode, "default")
        module_names = [type(module).__name__ for module in agent.spec.modules]
        self.assertIn("ToolsModule", module_names)
        self.assertIn("SubagentModule", module_names)

    def test_create_agent_always_uses_selected_model_directly(self) -> None:
        agent = unchain_adapter._create_agent(
            {
                "modelId": "openai:gpt-5",
                "openai_api_key": "test-key",
            }
        )

        self.assertEqual(agent.name, "pupu_developer")
        self.assertEqual(agent.model, "gpt-5")
        self.assertEqual(agent._display_model, "openai:gpt-5")
        self.assertEqual(agent._general_model_id, "openai:gpt-5")
        self.assertEqual(agent._developer_model_id, "openai:gpt-5")

    def test_resolve_general_runtime_config_downgrades_anthropic_and_keeps_ollama_selected_model(self) -> None:
        with mock.patch.object(
            unchain_adapter,
            "get_capability_catalog",
            return_value={
                "openai": ["gpt-4.1", "gpt-5"],
                "anthropic": ["claude-sonnet-4", "claude-sonnet-4-6"],
                "ollama": ["llama3.2"],
            },
        ):
            anthropic_config = unchain_adapter._resolve_general_runtime_config(
                {"modelId": "anthropic:claude-sonnet-4-6"}
            )
            ollama_config = unchain_adapter._resolve_general_runtime_config(
                {"modelId": "ollama:llama3.2"}
            )

        self.assertEqual(anthropic_config["provider"], "anthropic")
        self.assertEqual(anthropic_config["model"], "claude-sonnet-4")
        self.assertEqual(ollama_config["provider"], "ollama")
        self.assertEqual(ollama_config["model"], "llama3.2")

    def test_create_agent_prefers_options_max_iterations_over_env(self) -> None:
        class FakeAgent:
            def __init__(self, **kwargs):
                self.toolkits = []
                self.provider = kwargs.get("provider", "")
                self.model = kwargs.get("model", "")
                self.max_iterations = 0
                self.name = kwargs.get("name", "")
                for key, value in kwargs.items():
                    if not hasattr(self, key):
                        setattr(self, key, value)

            def add_toolkit(self, toolkit):
                self.toolkits.append(toolkit)

        with mock.patch.object(
            unchain_adapter, "_UnchainAgent", FakeAgent
        ), mock.patch.dict(unchain_adapter.os.environ, {"UNCHAIN_MAX_ITERATIONS": "1"}, clear=False):
            agent = unchain_adapter._create_agent({"maxIterations": 5})

        self.assertEqual(agent._max_iterations, 5)

    def test_create_agent_preserves_workspace_pin_execution_context(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace_root = Path(tmp)
            target = workspace_root / "notes.txt"
            target.write_text("hello\n", encoding="utf-8")

            agent = unchain_adapter._create_agent(
                {
                    "workspace_root": tmp,
                    "toolkits": ["workspace_toolkit"],
                }
            )

            self.assertIsNotNone(unchain_adapter._UnchainAgent)
            self.assertIsInstance(agent, unchain_adapter._UnchainAgent)
            self.assertEqual(len(agent._toolkits), 1)

            workspace_toolkit = agent._toolkits[0]
            self.assertIn("pin_file_context", workspace_toolkit.tools)

    def test_create_agent_mounts_memory_module_when_memory_is_available(self) -> None:
        from unchain.memory import MemoryManager

        manager = MemoryManager()

        with mock.patch(
            "memory_factory.create_memory_manager_with_diagnostics",
            return_value=(manager, ""),
        ):
            agent = unchain_adapter._create_agent(
                {
                    "provider": "ollama",
                    "model": "deepseek-r1:14b",
                    "memory_enabled": True,
                },
                session_id="chat-1",
            )

        module_names = [type(module).__name__ for module in agent.spec.modules]
        self.assertIn("MemoryModule", module_names)

    def test_create_agent_skips_memory_module_when_memory_is_not_enabled(self) -> None:
        agent = unchain_adapter._create_agent(
            {
                "provider": "ollama",
                "model": "deepseek-r1:14b",
            },
        )

        module_names = [type(module).__name__ for module in agent.spec.modules]
        self.assertNotIn("MemoryModule", module_names)

    def test_stream_chat_events_passes_on_tool_confirm_to_agent_run(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.provider = "openai"
                self.max_iterations = 3
                self.received_on_tool_confirm = False
                self.last_messages = []
                self._display_model = "openai:gpt-5"
                self._general_model_id = "openai:gpt-5"
                self._developer_model_id = "openai:gpt-5"
                self._orchestration_role = "developer"
                self._orchestration_next_mode = "default"
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
                **_kwargs,
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
                return SimpleNamespace(
                    messages=[{"role": "assistant", "content": "done"}],
                    consumed_tokens=21,
                    input_tokens=13,
                    output_tokens=8,
                    status="completed",
                    iteration=1,
                    previous_response_id=None,
                )

        fake_agent = FakeAgent()

        with mock.patch.object(
            unchain_adapter,
            "_create_agent",
            return_value=fake_agent,
        ):
            events = list(
                unchain_adapter.stream_chat_events(
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
        self.assertEqual(
            next(
                event.get("bundle", {})
                for event in events
                if event.get("type") == "stream_summary"
            ).get("model"),
            "openai:gpt-5",
        )
        self.assertEqual(
            next(
                event.get("bundle", {})
                for event in events
                if event.get("type") == "stream_summary"
            ).get("display_model"),
            "openai:gpt-5",
        )
        self.assertEqual(
            next(
                event.get("bundle", {})
                for event in events
                if event.get("type") == "stream_summary"
            ).get("agent_orchestration", {}).get("mode"),
            "default",
        )
        self.assertGreaterEqual(len(fake_agent.last_messages), 1)
        self.assertEqual(fake_agent.last_messages[-1].get("role"), "user")
        self.assertEqual(fake_agent.last_messages[-1].get("content"), "hello")

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

        with mock.patch.object(unchain_adapter, "_create_agent", return_value=fake_agent):
            events = list(
                unchain_adapter.stream_chat_events(
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

    def test_stream_chat_events_always_reports_developer_active_agent_in_bundle(self) -> None:
        class FakeAgent:
            def __init__(self):
                self.provider = "openai"
                self.max_iterations = 3
                self._display_model = "openai:gpt-5"
                self._general_model_id = "openai:gpt-5"
                self._developer_model_id = "openai:gpt-5"
                self._orchestration_role = "developer"
                self._orchestration_next_mode = "default"
                self._memory_runtime = {
                    "requested": False,
                    "available": False,
                    "reason": "",
                }

            def run(self, messages, payload=None, callback=None, max_iterations=None, **_kwargs):
                if callable(callback):
                    callback(
                        {
                            "type": "final_message",
                            "run_id": "run-1",
                            "iteration": 1,
                            "timestamp": time.time(),
                            "content": "plan ready",
                        }
                    )
                return SimpleNamespace(
                    messages=[{"role": "assistant", "content": "plan ready"}],
                    consumed_tokens=34,
                    input_tokens=20,
                    output_tokens=14,
                    status="completed",
                    iteration=1,
                    previous_response_id=None,
                )

        with mock.patch.object(
            unchain_adapter,
            "_create_agent",
            return_value=FakeAgent(),
        ):
            events = list(
                unchain_adapter.stream_chat_events(
                    message="implement this",
                    history=[],
                    attachments=[],
                    options={"modelId": "openai:gpt-5"},
                )
            )

        bundle = next(
            event.get("bundle", {})
            for event in events
            if event.get("type") == "stream_summary"
        )
        self.assertEqual(bundle.get("model"), "openai:gpt-5")
        self.assertEqual(bundle.get("active_agent"), "developer")
        self.assertEqual(
            bundle.get("agent_orchestration", {}).get("mode"),
            "default",
        )

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
                **_kwargs,
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
                return SimpleNamespace(
                    messages=[{"role": "assistant", "content": "done"}],
                    consumed_tokens=0,
                    input_tokens=0,
                    output_tokens=0,
                    status="completed",
                    iteration=0,
                    previous_response_id=None,
                )

        fake_agent = FakeAgent()

        with mock.patch.object(unchain_adapter, "_create_agent", return_value=fake_agent):
            events = list(
                unchain_adapter.stream_chat_events(
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
                **_kwargs,
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
                return SimpleNamespace(
                    messages=[{"role": "assistant", "content": "done"}],
                    consumed_tokens=0,
                    input_tokens=0,
                    output_tokens=0,
                    status="completed",
                    iteration=0,
                    previous_response_id=None,
                )

        fake_agent = FakeAgent()

        with mock.patch.object(unchain_adapter, "_create_agent", return_value=fake_agent):
            events = list(
                unchain_adapter.stream_chat_events(
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

    def test_stream_chat_events_enriches_tool_events_with_toolkit_metadata(self) -> None:
        class FakeToolkit:
            def __init__(self):
                self.tools = {"read": object()}
                setattr(self, unchain_adapter._RUNTIME_TOOLKIT_ID_ATTR, "core")
                setattr(self, unchain_adapter._RUNTIME_TOOLKIT_NAME_ATTR, "Core")

        class FakeAgent:
            def __init__(self):
                self.provider = "openai"
                self.max_iterations = 3
                self._display_model = "openai:gpt-5"
                self._general_model_id = "openai:gpt-5"
                self._developer_model_id = "openai:gpt-5"
                self._orchestration_role = "developer"
                self._orchestration_next_mode = "default"
                self._memory_runtime = {
                    "requested": False,
                    "available": False,
                    "reason": "",
                }
                self._toolkits = [FakeToolkit()]

            def run(
                self,
                messages,
                payload=None,
                callback=None,
                max_iterations=None,
                on_tool_confirm=None,
                **_kwargs,
            ):
                del messages, payload, max_iterations, on_tool_confirm
                if callable(callback):
                    callback(
                        {
                            "type": "tool_call",
                            "run_id": "run-1",
                            "iteration": 0,
                            "timestamp": time.time(),
                            "call_id": "call-1",
                            "tool_name": "read",
                            "arguments": {"path": "/tmp/demo.txt"},
                        }
                    )
                    callback(
                        {
                            "type": "tool_result",
                            "run_id": "run-1",
                            "iteration": 0,
                            "timestamp": time.time(),
                            "call_id": "call-1",
                            "tool_name": "read",
                            "result": {"ok": True},
                        }
                    )
                    callback(
                        {
                            "type": "final_message",
                            "run_id": "run-1",
                            "iteration": 0,
                            "timestamp": time.time(),
                            "content": "done",
                        }
                    )
                return SimpleNamespace(
                    messages=[{"role": "assistant", "content": "done"}],
                    consumed_tokens=0,
                    input_tokens=0,
                    output_tokens=0,
                    status="completed",
                    iteration=0,
                    previous_response_id=None,
                )

        with mock.patch.object(unchain_adapter, "_load_recipe_from_options", return_value=None), \
             mock.patch.object(unchain_adapter, "_create_agent", return_value=FakeAgent()):
            events = list(
                unchain_adapter.stream_chat_events(
                    message="hello",
                    history=[],
                    attachments=[],
                    options={"modelId": "openai:gpt-5"},
                )
            )

        tool_call = next(event for event in events if event.get("type") == "tool_call")
        tool_result = next(event for event in events if event.get("type") == "tool_result")
        self.assertEqual(tool_call.get("toolkit_id"), "core")
        self.assertEqual(tool_call.get("toolkit_name"), "Core")
        self.assertEqual(tool_result.get("toolkit_id"), "core")
        self.assertEqual(tool_result.get("toolkit_name"), "Core")

    def test_stream_chat_events_forwards_confirmation_capable_shell_tool_call(self) -> None:
        class FakeToolkit:
            def __init__(self):
                self.tools = {"shell": SimpleNamespace(requires_confirmation=True)}
                setattr(self, unchain_adapter._RUNTIME_TOOLKIT_ID_ATTR, "core")
                setattr(self, unchain_adapter._RUNTIME_TOOLKIT_NAME_ATTR, "Core")

        class FakeAgent:
            def __init__(self):
                self.provider = "openai"
                self.max_iterations = 3
                self._display_model = "openai:gpt-5"
                self._general_model_id = "openai:gpt-5"
                self._developer_model_id = "openai:gpt-5"
                self._orchestration_role = "developer"
                self._orchestration_next_mode = "default"
                self._memory_runtime = {
                    "requested": False,
                    "available": False,
                    "reason": "",
                }
                self._toolkits = [FakeToolkit()]

            def run(
                self,
                messages,
                payload=None,
                callback=None,
                max_iterations=None,
                on_tool_confirm=None,
                **_kwargs,
            ):
                del messages, payload, max_iterations, on_tool_confirm
                if callable(callback):
                    callback(
                        {
                            "type": "tool_call",
                            "run_id": "run-1",
                            "iteration": 0,
                            "timestamp": time.time(),
                            "call_id": "call-shell",
                            "tool_name": "shell",
                            "arguments": {
                                "action": "run",
                                "command": "pwd",
                            },
                        }
                    )
                    callback(
                        {
                            "type": "tool_result",
                            "run_id": "run-1",
                            "iteration": 0,
                            "timestamp": time.time(),
                            "call_id": "call-shell",
                            "tool_name": "shell",
                            "result": {"ok": True},
                        }
                    )
                    callback(
                        {
                            "type": "final_message",
                            "run_id": "run-1",
                            "iteration": 0,
                            "timestamp": time.time(),
                            "content": "done",
                        }
                    )
                return SimpleNamespace(
                    messages=[{"role": "assistant", "content": "done"}],
                    consumed_tokens=0,
                    input_tokens=0,
                    output_tokens=0,
                    status="completed",
                    iteration=0,
                    previous_response_id=None,
                )

        with mock.patch.object(unchain_adapter, "_load_recipe_from_options", return_value=None), \
             mock.patch.object(unchain_adapter, "_create_agent", return_value=FakeAgent()):
            events = list(
                unchain_adapter.stream_chat_events(
                    message="hello",
                    history=[],
                    attachments=[],
                    options={"modelId": "openai:gpt-5"},
                )
            )

        tool_call = next(
            event
            for event in events
            if event.get("type") == "tool_call"
            and event.get("tool_name") == "shell"
        )
        tool_result = next(
            event
            for event in events
            if event.get("type") == "tool_result"
            and event.get("tool_name") == "shell"
        )
        self.assertEqual(tool_call.get("call_id"), "call-shell")
        self.assertNotIn("confirmation_id", tool_call)
        self.assertEqual(tool_call.get("toolkit_id"), "core")
        self.assertEqual(tool_call.get("toolkit_name"), "Core")
        self.assertEqual(tool_result.get("toolkit_id"), "core")
        self.assertEqual(tool_result.get("toolkit_name"), "Core")

    def test_stream_chat_events_still_suppresses_bare_ask_user_question_tool_call(self) -> None:
        class FakeToolkit:
            def __init__(self):
                self.tools = {"ask_user_question": SimpleNamespace(requires_confirmation=False)}
                setattr(self, unchain_adapter._RUNTIME_TOOLKIT_ID_ATTR, "core")
                setattr(self, unchain_adapter._RUNTIME_TOOLKIT_NAME_ATTR, "Core")

        class FakeAgent:
            def __init__(self):
                self.provider = "openai"
                self.max_iterations = 3
                self._display_model = "openai:gpt-5"
                self._general_model_id = "openai:gpt-5"
                self._developer_model_id = "openai:gpt-5"
                self._orchestration_role = "developer"
                self._orchestration_next_mode = "default"
                self._memory_runtime = {
                    "requested": False,
                    "available": False,
                    "reason": "",
                }
                self._toolkits = [FakeToolkit()]

            def run(
                self,
                messages,
                payload=None,
                callback=None,
                max_iterations=None,
                on_tool_confirm=None,
                **_kwargs,
            ):
                del messages, payload, max_iterations, on_tool_confirm
                if callable(callback):
                    callback(
                        {
                            "type": "tool_call",
                            "run_id": "run-1",
                            "iteration": 0,
                            "timestamp": time.time(),
                            "call_id": "call-ask",
                            "tool_name": "ask_user_question",
                            "arguments": {"question": "Continue?"},
                        }
                    )
                    callback(
                        {
                            "type": "final_message",
                            "run_id": "run-1",
                            "iteration": 0,
                            "timestamp": time.time(),
                            "content": "done",
                        }
                    )
                return SimpleNamespace(
                    messages=[{"role": "assistant", "content": "done"}],
                    consumed_tokens=0,
                    input_tokens=0,
                    output_tokens=0,
                    status="completed",
                    iteration=0,
                    previous_response_id=None,
                )

        with mock.patch.object(unchain_adapter, "_load_recipe_from_options", return_value=None), \
             mock.patch.object(unchain_adapter, "_create_agent", return_value=FakeAgent()):
            events = list(
                unchain_adapter.stream_chat_events(
                    message="hello",
                    history=[],
                    attachments=[],
                    options={"modelId": "openai:gpt-5"},
                )
            )

        self.assertFalse(
            any(
                event.get("type") == "tool_call"
                and event.get("tool_name") == "ask_user_question"
                for event in events
            )
        )
        self.assertTrue(any(event.get("type") == "final_message" for event in events))

    def test_build_requested_toolkits_rejects_duplicate_tool_names(self) -> None:
        toolkit_a = SimpleNamespace(
            tools={"read": object()},
            _pupu_toolkit_id="core",
            _pupu_toolkit_name="Core",
        )
        toolkit_b = SimpleNamespace(
            tools={"read": object()},
            _pupu_toolkit_id="custom_toolkit",
            _pupu_toolkit_name="Custom Toolkit",
        )

        with mock.patch.object(
            unchain_adapter,
            "_build_workspace_toolkits",
            return_value=[],
        ), mock.patch.object(
            unchain_adapter,
            "_build_selected_toolkits",
            return_value=[toolkit_a, toolkit_b],
        ):
            with self.assertRaisesRegex(RuntimeError, "Duplicate tool name detected"):
                unchain_adapter._build_requested_toolkits(
                    {"toolkits": ["core", "custom_toolkit"]}
                )

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
            unchain_adapter._extract_last_assistant_text(messages),
            "Final answer text",
        )

    def test_capability_file_candidates_include_packaged_module_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            resources_dir = Path(temp_dir) / "unchain" / "runtime" / "resources"
            resources_dir.mkdir(parents=True, exist_ok=True)
            init_file = resources_dir / "__init__.py"
            init_file.write_text("", encoding="utf-8")
            capability_file = resources_dir / "model_capabilities.json"
            capability_file.write_text("{}", encoding="utf-8")

            fake_res_module = SimpleNamespace(__file__=str(init_file))
            fake_runtime_module = SimpleNamespace(resources=fake_res_module)
            with mock.patch.dict(
                sys.modules,
                {
                    "unchain.runtime": fake_runtime_module,
                    "unchain.runtime.resources": fake_res_module,
                },
            ):
                candidates = unchain_adapter._capability_file_candidates()

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
        module_name = "unchain.toolkits.builtin.demo_toolkit"
        toolkit_module = ModuleType(module_name)
        toolkit_module.__file__ = str(package_dir / "runtime.py")
        toolkit_class = type(
            "DemoToolkit",
            (toolkit_base,),
            {
                "__module__": module_name,
                "__doc__": "Toolkit for icon tests.",
                "echo": lambda self: None,
                "shutdown": lambda self: None,
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
        builtin_pkg = ModuleType("unchain.toolkits.builtin")
        builtin_pkg.__path__ = [str(Path(toolkit_module.__file__).parent.parent)]
        miso_module = ModuleType("miso")

        def _fake_import_module(name: str, package=None):
            del package
            if name == "unchain.toolkits":
                return miso_module
            if name == "unchain.toolkits.builtin":
                return builtin_pkg
            if name == module_name:
                return toolkit_module
            raise ImportError(name)

        return _fake_import_module

    def _build_core_toolkit_fixture(self) -> tuple[type, str, ModuleType]:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)

        package_dir = Path(temp_dir.name) / "core"
        package_dir.mkdir(parents=True, exist_ok=True)
        (package_dir / "runtime.py").write_text("", encoding="utf-8")
        (package_dir / "README.md").write_text("# Core\n", encoding="utf-8")
        (package_dir / "toolkit.toml").write_text(
            """
[toolkit]
id = "core"
name = "Core"
description = "Core execution tools."
factory = "core:CoreToolkit"
version = "1.0.0"
readme = "README.md"
icon = "terminal"

[display]
category = "builtin"
order = 1
hidden = false

[[tools]]
name = "read"
title = "Read"
description = "Read files."
requires_confirmation = false

[[tools]]
name = "write"
title = "Write"
description = "Write files."
requires_confirmation = true
""".strip()
            + "\n",
            encoding="utf-8",
        )

        toolkit_base = type("FakeToolkitBase", (), {})
        module_name = "unchain.toolkits.builtin.core"
        toolkit_module = ModuleType(module_name)
        toolkit_module.__file__ = str(package_dir / "runtime.py")
        toolkit_class = type(
            "CoreToolkit",
            (toolkit_base,),
            {
                "__module__": module_name,
                "__doc__": "Core execution tools.",
                "read": lambda self: None,
                "write": lambda self: None,
                "shutdown": lambda self: None,
            },
        )
        setattr(toolkit_module, "CoreToolkit", toolkit_class)
        return toolkit_base, module_name, toolkit_module

    def test_get_toolkit_catalog_v2_returns_builtin_icon_payload(self) -> None:
        toolkit_base, module_name, toolkit_module = self._build_toolkit_fixture(
            icon_value="terminal",
            color="#0f172a",
            backgroundcolor="#bae6fd",
        )

        with mock.patch.object(
            unchain_adapter,
            "_resolve_toolkit_base",
            return_value=toolkit_base,
        ), mock.patch.object(
            unchain_adapter.importlib,
            "import_module",
            side_effect=self._build_import_side_effect(
                module_name=module_name,
                toolkit_module=toolkit_module,
            ),
        ), mock.patch.object(
            unchain_adapter.pkgutil,
            "iter_modules",
            return_value=[(None, "demo_toolkit", True)],
        ):
            payload = unchain_adapter.get_toolkit_catalog_v2()

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

    def test_get_toolkit_catalog_v2_exposes_core_with_confirmation_metadata(self) -> None:
        toolkit_base, module_name, toolkit_module = self._build_core_toolkit_fixture()

        with mock.patch.object(
            unchain_adapter,
            "_resolve_toolkit_base",
            return_value=toolkit_base,
        ), mock.patch.object(
            unchain_adapter.importlib,
            "import_module",
            side_effect=self._build_import_side_effect(
                module_name=module_name,
                toolkit_module=toolkit_module,
            ),
        ), mock.patch.object(
            unchain_adapter.pkgutil,
            "iter_modules",
            return_value=[(None, "core", True)],
        ):
            payload = unchain_adapter.get_toolkit_catalog_v2()

        entry = payload["toolkits"][0]
        self.assertEqual(entry["toolkitId"], "core")
        self.assertEqual(entry["toolkitName"], "Core")
        self.assertEqual([tool["name"] for tool in entry["tools"]], ["read", "write"])
        self.assertEqual(entry["tools"][0]["name"], "read")
        self.assertFalse(entry["tools"][0]["requiresConfirmation"])
        self.assertEqual(entry["tools"][1]["name"], "write")
        self.assertTrue(entry["tools"][1]["requiresConfirmation"])

    def test_get_toolkit_metadata_returns_file_icon_payload(self) -> None:
        toolkit_base, module_name, toolkit_module = self._build_toolkit_fixture(
            icon_value="icon.svg",
            include_icon_file=True,
        )

        with mock.patch.object(
            unchain_adapter,
            "_resolve_toolkit_base",
            return_value=toolkit_base,
        ), mock.patch.object(
            unchain_adapter.importlib,
            "import_module",
            side_effect=self._build_import_side_effect(
                module_name=module_name,
                toolkit_module=toolkit_module,
            ),
        ), mock.patch.object(
            unchain_adapter.pkgutil,
            "iter_modules",
            return_value=[(None, "demo_toolkit", True)],
        ):
            payload = unchain_adapter.get_toolkit_metadata("DemoToolkit")

        self.assertEqual(payload["toolkitIcon"]["type"], "file")
        self.assertEqual(payload["toolkitIcon"]["mimeType"], "image/svg+xml")
        self.assertIn("<svg", payload["toolkitIcon"]["content"])

    def test_get_toolkit_metadata_accepts_core_aliases(self) -> None:
        toolkit_base, module_name, toolkit_module = self._build_core_toolkit_fixture()

        with mock.patch.object(
            unchain_adapter,
            "_resolve_toolkit_base",
            return_value=toolkit_base,
        ), mock.patch.object(
            unchain_adapter.importlib,
            "import_module",
            side_effect=self._build_import_side_effect(
                module_name=module_name,
                toolkit_module=toolkit_module,
            ),
        ), mock.patch.object(
            unchain_adapter.pkgutil,
            "iter_modules",
            return_value=[(None, "core", True)],
        ):
            payload_from_id = unchain_adapter.get_toolkit_metadata("core")
            payload_from_class = unchain_adapter.get_toolkit_metadata("CoreToolkit")
            payload_from_code_alias = unchain_adapter.get_toolkit_metadata("code_toolkit")
            payload_from_ask_user_alias = unchain_adapter.get_toolkit_metadata("ask-user-toolkit")

        self.assertEqual(payload_from_id["toolkitId"], "core")
        self.assertEqual(payload_from_class["toolkitId"], "core")
        self.assertEqual(payload_from_code_alias["toolkitId"], "core")
        self.assertEqual(payload_from_ask_user_alias["toolkitId"], "core")
        self.assertEqual(payload_from_code_alias["toolkitName"], "Core")

    def test_invalid_builtin_toolkit_icon_returns_empty_payload(self) -> None:
        toolkit_base, module_name, toolkit_module = self._build_toolkit_fixture(
            icon_value="terminal",
        )

        with mock.patch.object(
            unchain_adapter,
            "_resolve_toolkit_base",
            return_value=toolkit_base,
        ), mock.patch.object(
            unchain_adapter.importlib,
            "import_module",
            side_effect=self._build_import_side_effect(
                module_name=module_name,
                toolkit_module=toolkit_module,
            ),
        ), mock.patch.object(
            unchain_adapter.pkgutil,
            "iter_modules",
            return_value=[(None, "demo_toolkit", True)],
        ):
            catalog_payload = unchain_adapter.get_toolkit_catalog_v2()
            metadata_payload = unchain_adapter.get_toolkit_metadata("DemoToolkit")

        self.assertEqual(catalog_payload["toolkits"][0]["toolkitIcon"], {})
        self.assertEqual(metadata_payload["toolkitIcon"], {})


class ApplyRecipeToolkitFilterTests(unittest.TestCase):
    def _mk_tool(self, name):
        tool = type("T", (), {})()
        tool.name = name
        return tool

    def _mk_toolkit(self, tid, tool_names):
        tk = type("TK", (), {})()
        tk.id = tid
        tk.name = tid
        tk.tools = {n: self._mk_tool(n) for n in tool_names}
        return tk

    def test_filter_keeps_listed_toolkits_only(self):
        from unchain_adapter import _apply_recipe_toolkit_filter
        from recipe import ToolkitRef
        all_tks = [self._mk_toolkit("core", ["read", "grep"]),
                   self._mk_toolkit("workspace", ["write"])]
        refs = (ToolkitRef(id="core", enabled_tools=None),)
        filtered = _apply_recipe_toolkit_filter(all_tks, refs)
        self.assertEqual([t.id for t in filtered], ["core"])

    def test_filter_respects_enabled_tools_whitelist(self):
        from unchain_adapter import _apply_recipe_toolkit_filter
        from recipe import ToolkitRef
        all_tks = [self._mk_toolkit("core", ["read", "grep", "write"])]
        refs = (ToolkitRef(id="core", enabled_tools=("read", "grep")),)
        filtered = _apply_recipe_toolkit_filter(all_tks, refs)
        self.assertEqual(set(filtered[0].tools.keys()), {"read", "grep"})

    def test_filter_warns_on_missing_toolkit(self):
        from unchain_adapter import _apply_recipe_toolkit_filter
        from recipe import ToolkitRef
        all_tks = [self._mk_toolkit("core", ["read"])]
        refs = (ToolkitRef(id="ghost", enabled_tools=None),)
        filtered = _apply_recipe_toolkit_filter(all_tks, refs)
        self.assertEqual(filtered, [])

    def test_null_enabled_tools_keeps_all(self):
        from unchain_adapter import _apply_recipe_toolkit_filter
        from recipe import ToolkitRef
        all_tks = [self._mk_toolkit("core", ["read", "grep"])]
        refs = (ToolkitRef(id="core", enabled_tools=None),)
        filtered = _apply_recipe_toolkit_filter(all_tks, refs)
        self.assertEqual(set(filtered[0].tools.keys()), {"read", "grep"})


class MaterializeRecipeSubagentsTests(unittest.TestCase):
    def _fake_modules(self):
        UnchainAgent = type("UA", (), {"__init__": lambda s, **kw: setattr(s, "kw", kw) or None})
        ToolsModule = type("TM", (), {"__init__": lambda s, **kw: setattr(s, "kw", kw) or None})
        PoliciesModule = type("PM", (), {"__init__": lambda s, **kw: setattr(s, "kw", kw) or None})
        SubagentTemplate = type("ST", (), {"__init__": lambda s, **kw: setattr(s, "kw", kw) or None})
        return UnchainAgent, ToolsModule, PoliciesModule, SubagentTemplate

    def _fake_toolkit(self, tid, names):
        FakeTool = type("FT", (), {"__init__": lambda s, n: setattr(s, "name", n) or None})
        tk = type("TK", (), {})()
        tk.id = tid
        tk.name = tid
        tk.tools = {n: FakeTool(n) for n in names}
        return tk

    def test_ref_kind_loads_template_and_applies_disabled_tools(self):
        from unchain_adapter import _materialize_recipe_subagents
        from recipe import Recipe, RecipeAgent, SubagentRef
        UA, TM, PM, ST = self._fake_modules()
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("pathlib.Path.home", return_value=Path(tmp)):
                from subagent_seeds import ensure_seeds_written
                ensure_seeds_written(Path(tmp) / ".pupu" / "subagents")

                recipe = Recipe(
                    name="T", description="", model=None, max_iterations=None,
                    agent=RecipeAgent(prompt_format="soul", prompt="x"),
                    toolkits=(),
                    subagent_pool=(
                        SubagentRef(kind="ref", template_name="Explore", disabled_tools=("shell",)),
                    ),
                )
                toolkits = [self._fake_toolkit("core", ["read", "grep", "shell"])]
                templates = _materialize_recipe_subagents(
                    recipe=recipe, toolkits=toolkits,
                    provider="anthropic", model="claude-sonnet-4-6", api_key="k",
                    max_iterations=5,
                    UnchainAgent=UA, ToolsModule=TM, PoliciesModule=PM,
                    SubagentTemplate=ST,
                )
                self.assertEqual(len(templates), 1)
                allowed = templates[0].kw.get("allowed_tools") or ()
                self.assertNotIn("shell", allowed)
                self.assertIn("read", allowed)

    def test_missing_ref_logs_warning_and_skips(self):
        from unchain_adapter import _materialize_recipe_subagents
        from recipe import Recipe, RecipeAgent, SubagentRef
        UA, TM, PM, ST = self._fake_modules()
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("pathlib.Path.home", return_value=Path(tmp)):
                recipe = Recipe(
                    name="T", description="", model=None, max_iterations=None,
                    agent=RecipeAgent(prompt_format="soul", prompt="x"),
                    toolkits=(),
                    subagent_pool=(
                        SubagentRef(kind="ref", template_name="Ghost", disabled_tools=()),
                    ),
                )
                templates = _materialize_recipe_subagents(
                    recipe=recipe, toolkits=[],
                    provider="anthropic", model="m", api_key="k", max_iterations=5,
                    UnchainAgent=UA, ToolsModule=TM, PoliciesModule=PM,
                    SubagentTemplate=ST,
                )
                self.assertEqual(templates, ())

    def test_recipe_ref_builds_workflow_subagent(self):
        from unchain_adapter import _materialize_recipe_subagents
        from recipe import Recipe, RecipeAgent, RecipeSubagentRef
        UA, TM, PM, ST = self._fake_modules()
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("pathlib.Path.home", return_value=Path(tmp)):
                from recipe_loader import save_recipe

                save_recipe({
                    "name": "Explore",
                    "description": "scout",
                    "model": None,
                    "max_iterations": None,
                    "agent": {"prompt_format": "soul", "prompt": "look"},
                    "toolkits": [],
                    "subagent_pool": [],
                })
                recipe = Recipe(
                    name="Default", description="", model=None, max_iterations=None,
                    agent=RecipeAgent(prompt_format="soul", prompt="x"),
                    toolkits=(),
                    subagent_pool=(
                        RecipeSubagentRef(
                            kind="recipe_ref",
                            recipe_name="Explore",
                            disabled_tools=(),
                        ),
                    ),
                )
                templates = _materialize_recipe_subagents(
                    recipe=recipe, toolkits=[],
                    provider="anthropic", model="m", api_key="k", max_iterations=5,
                    UnchainAgent=UA, ToolsModule=TM, PoliciesModule=PM,
                    SubagentTemplate=ST,
                    options={},
                )
                self.assertEqual(len(templates), 1)
                self.assertEqual(templates[0].kw["name"], "Explore")
                self.assertTrue(hasattr(templates[0].kw["agent"], "fork_for_subagent"))

    def test_recipe_ref_cycle_skips(self):
        from unchain_adapter import _materialize_recipe_subagents
        from recipe import Recipe, RecipeAgent, RecipeSubagentRef
        UA, TM, PM, ST = self._fake_modules()
        recipe = Recipe(
            name="Loop", description="", model=None, max_iterations=None,
            agent=RecipeAgent(prompt_format="soul", prompt="x"),
            toolkits=(),
            subagent_pool=(
                RecipeSubagentRef(
                    kind="recipe_ref",
                    recipe_name="Loop",
                    disabled_tools=(),
                ),
            ),
        )
        templates = _materialize_recipe_subagents(
            recipe=recipe, toolkits=[],
            provider="anthropic", model="m", api_key="k", max_iterations=5,
            UnchainAgent=UA, ToolsModule=TM, PoliciesModule=PM,
            SubagentTemplate=ST,
            options={},
        )
        self.assertEqual(templates, ())

    def test_workflow_subagent_agent_runs_recipe_graph(self):
        from unchain_adapter import _WorkflowRecipeSubagentAgent
        from recipe import Recipe, RecipeAgent

        recipe = Recipe(
            name="Explore", description="", model=None, max_iterations=None,
            agent=RecipeAgent(prompt_format="soul", prompt="x"),
            toolkits=(),
            subagent_pool=(),
        )
        agent = _WorkflowRecipeSubagentAgent(
            recipe=recipe,
            options={},
            name="Explore",
        )
        with mock.patch.object(
            unchain_adapter,
            "_stream_recipe_graph_events",
            return_value=iter([
                {"type": "final_message", "content": "done"},
            ]),
        ):
            result = agent.fork_for_subagent(
                subagent_name="parent.explore.1",
                task="find",
                instructions="quick",
            ).run("find")
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.messages[-1]["content"], "done")


class BuildDeveloperAgentRecipeBranchTests(unittest.TestCase):
    def _common_kwargs(self, tmpdir):
        class _FakeAgent:
            def __init__(self, **kw):
                self.kw = kw

        class _FakeToolsModule:
            def __init__(self, **kw):
                self.kw = kw

        class _FakeMemoryModule:
            def __init__(self, **kw):
                self.kw = kw

        class _FakePoliciesModule:
            def __init__(self, **kw):
                self.kw = kw

        class _FakeST:
            def __init__(self, **kw):
                self.kw = kw

        class _FakeSM:
            def __init__(self, **kw):
                self.kw = kw

        class _FakeSP:
            def __init__(self, **kw):
                self.kw = kw

        class _FakeTool:
            def __init__(self, n):
                self.name = n

        class _FakeTK:
            def __init__(self, tid, names):
                self.id = tid
                self.name = tid
                self.tools = {n: _FakeTool(n) for n in names}

        toolkits = [
            _FakeTK("core", ["read", "grep"]),
            _FakeTK("workspace", ["write", "edit"]),
        ]
        return dict(
            UnchainAgent=_FakeAgent,
            ToolsModule=_FakeToolsModule,
            MemoryModule=_FakeMemoryModule,
            PoliciesModule=_FakePoliciesModule,
            SubagentModule=_FakeSM,
            SubagentTemplate=_FakeST,
            SubagentPolicy=_FakeSP,
            provider="anthropic",
            model="claude-sonnet-4-6",
            api_key="k",
            user_modules=None,
            max_iterations=10,
            toolkits=toolkits,
            memory_manager=None,
            options=None,
        )

    def test_recipe_none_uses_all_toolkits(self):
        from unchain_adapter import _build_developer_agent
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("pathlib.Path.home", return_value=Path(tmp)):
                kw = self._common_kwargs(tmp)
                agent = _build_developer_agent(**kw, recipe=None)
                modules = agent.kw.get("modules", ())
                tool_modules = [m for m in modules if hasattr(m, "kw") and "tools" in m.kw]
                self.assertEqual(len(tool_modules), 1)
                tool_ids = {getattr(t, "id", None) for t in tool_modules[0].kw["tools"]}
                self.assertEqual(tool_ids, {"core", "workspace"})

    def test_recipe_filters_toolkits_when_merge_off(self):
        from unchain_adapter import _build_developer_agent
        from recipe import Recipe, RecipeAgent, ToolkitRef
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("pathlib.Path.home", return_value=Path(tmp)):
                kw = self._common_kwargs(tmp)
                recipe = Recipe(
                    name="Coder",
                    description="",
                    model=None,
                    max_iterations=None,
                    agent=RecipeAgent(prompt_format="soul", prompt="body"),
                    toolkits=(ToolkitRef(id="core", enabled_tools=None),),
                    subagent_pool=(),
                    merge_with_user_selected=False,
                )
                agent = _build_developer_agent(**kw, recipe=recipe)
                modules = agent.kw.get("modules", ())
                tool_modules = [m for m in modules if hasattr(m, "kw") and "tools" in m.kw]
                tool_ids = {getattr(t, "id", None) for t in tool_modules[0].kw["tools"]}
                self.assertEqual(tool_ids, {"core"})

    def test_recipe_unions_with_user_when_merge_on(self):
        from unchain_adapter import _build_developer_agent
        from recipe import Recipe, RecipeAgent, ToolkitRef
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("pathlib.Path.home", return_value=Path(tmp)):
                kw = self._common_kwargs(tmp)
                recipe = Recipe(
                    name="Coder",
                    description="",
                    model=None,
                    max_iterations=None,
                    agent=RecipeAgent(prompt_format="soul", prompt="body"),
                    toolkits=(ToolkitRef(id="core", enabled_tools=None),),
                    subagent_pool=(),
                    merge_with_user_selected=True,
                )
                agent = _build_developer_agent(**kw, recipe=recipe)
                modules = agent.kw.get("modules", ())
                tool_modules = [m for m in modules if hasattr(m, "kw") and "tools" in m.kw]
                tool_ids = {getattr(t, "id", None) for t in tool_modules[0].kw["tools"]}
                self.assertEqual(tool_ids, {"core", "workspace"})

    def test_recipe_soul_prompt_used_as_instructions(self):
        from unchain_adapter import _build_developer_agent
        from recipe import Recipe, RecipeAgent
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("pathlib.Path.home", return_value=Path(tmp)):
                kw = self._common_kwargs(tmp)
                recipe = Recipe(
                    name="X",
                    description="",
                    model=None,
                    max_iterations=None,
                    agent=RecipeAgent(prompt_format="soul", prompt="CUSTOM SOUL BODY"),
                    toolkits=(),
                    subagent_pool=(),
                )
                agent = _build_developer_agent(**kw, recipe=recipe)
                self.assertIn("CUSTOM SOUL BODY", agent.kw.get("instructions", ""))

    def test_recipe_sentinel_uses_builtin_prompt(self):
        from unchain_adapter import _build_developer_agent
        from recipe import Recipe, RecipeAgent, BUILTIN_DEVELOPER_PROMPT_SENTINEL
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("pathlib.Path.home", return_value=Path(tmp)):
                kw = self._common_kwargs(tmp)
                recipe = Recipe(
                    name="Default",
                    description="",
                    model=None,
                    max_iterations=None,
                    agent=RecipeAgent(
                        prompt_format="skeleton",
                        prompt=BUILTIN_DEVELOPER_PROMPT_SENTINEL,
                    ),
                    toolkits=(),
                    subagent_pool=(),
                )
                agent = _build_developer_agent(**kw, recipe=recipe)
                instr = agent.kw.get("instructions", "")
                self.assertNotIn(BUILTIN_DEVELOPER_PROMPT_SENTINEL, instr)
                self.assertGreater(len(instr), 200)

    def test_recipe_sentinel_with_start_prelude_uses_builtin_prompt(self):
        from unchain_adapter import _build_developer_agent
        from recipe import Recipe, RecipeAgent, BUILTIN_DEVELOPER_PROMPT_SENTINEL
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("pathlib.Path.home", return_value=Path(tmp)):
                kw = self._common_kwargs(tmp)
                recipe = Recipe(
                    name="Default",
                    description="",
                    model=None,
                    max_iterations=None,
                    agent=RecipeAgent(
                        prompt_format="skeleton",
                        prompt=(
                            "{{#start.text#}}\n{{#start.images#}}\n"
                            "{{#start.files#}}\n\n"
                            f"{BUILTIN_DEVELOPER_PROMPT_SENTINEL}"
                        ),
                    ),
                    toolkits=(),
                    subagent_pool=(),
                )
                agent = _build_developer_agent(**kw, recipe=recipe)
                instr = agent.kw.get("instructions", "")
                self.assertNotIn(BUILTIN_DEVELOPER_PROMPT_SENTINEL, instr)
                self.assertNotIn("{{#start.text#}}", instr)
                self.assertGreater(len(instr), 200)

class CreateAgentRecipeWiringTests(unittest.TestCase):
    def test_create_agent_uses_default_recipe_when_name_unspecified(self):
        import unchain_adapter as ua
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("pathlib.Path.home", return_value=Path(tmp)):
                from recipe_seeds import ensure_recipe_seeds_written
                ensure_recipe_seeds_written(Path(tmp) / ".pupu" / "agent_recipes")
                captured = {}

                def _spy(**kw):
                    captured.update(kw)
                    return None

                with mock.patch.object(ua, "_build_developer_agent", _spy):
                    try:
                        ua._create_agent({}, session_id="s")
                    except Exception:
                        pass
                self.assertIsNotNone(captured.get("recipe"))
                self.assertEqual(captured["recipe"].name, "Default")

    def test_create_agent_loads_named_recipe(self):
        import unchain_adapter as ua
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("pathlib.Path.home", return_value=Path(tmp)):
                from recipe_loader import save_recipe
                save_recipe({
                    "name": "Coder",
                    "description": "",
                    "model": None,
                    "max_iterations": None,
                    "agent": {"prompt_format": "soul", "prompt": "x"},
                    "toolkits": [],
                    "subagent_pool": [],
                })
                captured = {}

                def _spy(**kw):
                    captured.update(kw)
                    return None

                with mock.patch.object(ua, "_build_developer_agent", _spy):
                    try:
                        ua._create_agent({"recipe_name": "Coder"}, session_id="s")
                    except Exception:
                        pass
                self.assertIsNotNone(captured.get("recipe"))
                self.assertEqual(captured["recipe"].name, "Coder")

    def test_options_model_overrides_recipe_model(self):
        import os
        import unchain_adapter as ua
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("pathlib.Path.home", return_value=Path(tmp)), \
                 mock.patch.dict(os.environ, {"UNCHAIN_API_KEY": "dummy"}, clear=False):
                from recipe_loader import save_recipe
                save_recipe({
                    "name": "R",
                    "description": "",
                    "model": "anthropic:claude-sonnet-4-6",
                    "max_iterations": None,
                    "agent": {"prompt_format": "soul", "prompt": "x"},
                    "toolkits": [],
                    "subagent_pool": [],
                })
                captured = {}

                def _spy(**kw):
                    captured.update(kw)
                    return None

                with mock.patch.object(ua, "_build_developer_agent", _spy):
                    try:
                        ua._create_agent(
                            {"recipe_name": "R", "modelId": "openai:gpt-4o"},
                            session_id="s",
                        )
                    except Exception:
                        pass
                self.assertIn("gpt-4o", captured.get("model", ""))


if __name__ == "__main__":
    unittest.main()
