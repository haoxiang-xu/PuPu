import json
import sys
import tempfile
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
        ):
            providers = miso_adapter.get_capability_catalog()

        self.assertEqual(providers["openai"], ["gpt-5"])
        self.assertEqual(providers["anthropic"], ["claude-opus-4-6"])
        self.assertEqual(providers["ollama"], ["deepseek-r1:14b"])

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
                "toolkit",
                "builtin_toolkit",
                "python_workspace_toolkit",
                "mcp",
            ],
        )
        self.assertEqual(catalog["count"], 4)

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
                agent = miso_adapter._create_agent({"workspace_root": tmp})

        self.assertEqual(len(agent.toolkits), 1)
        self.assertEqual(captured["workspace_root"], str(Path(tmp).resolve()))
        self.assertEqual(captured["include_python_runtime"], True)

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
                    miso_adapter._create_agent({"workspaceRoot": missing})

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
                agent = miso_adapter._create_agent({"workspace_root": tmp})

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
