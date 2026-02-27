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


if __name__ == "__main__":
    unittest.main()
