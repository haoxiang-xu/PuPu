"""C2 adapter-wiring tests: the ``builtin.`` mount branch + feature flag, the
fail-closed SSE image-redaction choke point, and non-regression of the existing
mcp./generic branches. ComputerToolkit is mocked so the branch test never
touches real display/injection hardware.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import unchain_adapter


class _FakeComputerToolkit:
    """Minimal stand-in for ComputerToolkit (class name drives display name)."""

    def __init__(self, *args, **kwargs):
        self.tools = {}


def _with_flag(value):
    return mock.patch.dict("os.environ", {"PUPU_COMPUTER_USE": value}, clear=False)


class BuiltinBranchTests(unittest.TestCase):
    def _build(self, flag_value, *, provider="anthropic", model="claude-opus-4-8"):
        options = {"toolkits": ["builtin.computer"], "provider": provider, "model": model}
        with _with_flag(flag_value), mock.patch(
            "computer_control.toolkit.ComputerToolkit", _FakeComputerToolkit
        ):
            return unchain_adapter._build_selected_toolkits(options)

    def test_flag_off_yields_zero_exposure(self):
        for off in ("", "0", "false", "off"):
            with self.subTest(value=off):
                result = self._build(off)
                self.assertEqual(result, [])

    def test_flag_on_builds_and_mounts_computer_toolkit(self):
        for on in ("1", "true", "on", "enabled"):
            with self.subTest(value=on):
                result = self._build(on)
                self.assertEqual(len(result), 1)
                self.assertIsInstance(result[0], _FakeComputerToolkit)

    def test_flag_on_sets_runtime_toolkit_metadata(self):
        result = self._build("1")
        meta = unchain_adapter._get_runtime_toolkit_metadata(result[0])
        self.assertEqual(meta["toolkit_id"], "builtin.computer")

    def test_unknown_builtin_is_skipped_not_errored(self):
        with _with_flag("1"):
            result = unchain_adapter._build_selected_toolkits(
                {"toolkits": ["builtin.does_not_exist"]}
            )
        self.assertEqual(result, [])

    def test_computer_use_enabled_flag_parsing(self):
        with _with_flag("1"):
            self.assertTrue(unchain_adapter._computer_use_enabled())
        with _with_flag("nope"):
            self.assertFalse(unchain_adapter._computer_use_enabled())


class ModelGatingTests(unittest.TestCase):
    """Only Anthropic sessions on computer_20251124-capable models mount the
    tool; older Anthropic models and non-Anthropic sessions are skipped so we
    never send the new tool type to a model that would 400 on it."""

    def _build(self, provider, model):
        options = {"toolkits": ["builtin.computer"], "provider": provider, "model": model}
        with _with_flag("1"), mock.patch(
            "computer_control.toolkit.ComputerToolkit", _FakeComputerToolkit
        ):
            return unchain_adapter._build_selected_toolkits(options)

    def test_supported_models_mount(self):
        for model in ("claude-opus-4-8", "claude-sonnet-5", "claude-opus-4-6",
                      "claude-sonnet-4-6", "claude-opus-4-5", "claude-opus-4-7"):
            with self.subTest(model=model):
                self.assertEqual(len(self._build("anthropic", model)), 1)

    def test_unsupported_anthropic_models_skip(self):
        # Sonnet 4.5 / Haiku 4.5 / Opus 4.1 need the OLD computer tool type.
        for model in ("claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"):
            with self.subTest(model=model):
                self.assertEqual(self._build("anthropic", model), [])

    def test_non_anthropic_session_skips(self):
        self.assertEqual(self._build("openai", "gpt-4.1"), [])
        self.assertEqual(self._build("ollama", "llama3"), [])

    def test_date_suffix_tolerated_by_prefix_match(self):
        self.assertEqual(len(self._build("anthropic", "claude-opus-4-8-20260101")), 1)

    def test_model_support_predicate(self):
        self.assertTrue(unchain_adapter._model_supports_computer_use("anthropic", "claude-opus-4-8"))
        self.assertFalse(unchain_adapter._model_supports_computer_use("anthropic", "claude-sonnet-4-5"))
        self.assertFalse(unchain_adapter._model_supports_computer_use("openai", "claude-opus-4-8"))


class RedactionChokePointTests(unittest.TestCase):
    """Hard assertion: base64 image data can never survive the enrich step, so
    it can never reach the SSE frame or the (frontend) persistence path."""

    def _image_result_event(self):
        return {
            "type": "tool_result",
            "tool_name": "computer",
            "result": {
                "content_blocks": [
                    {
                        "type": "image",
                        "media_type": "image/png",
                        "data_b64": "QUJDREVGRw==",
                        "width": 1512,
                        "height": 982,
                    },
                    {"type": "text", "text": "screenshot 1512x982 px"},
                ],
                "ok": True,
                "action": "screenshot",
            },
        }

    def test_enrich_strips_base64_from_tool_result(self):
        event = self._image_result_event()
        enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(event, {})
        image = enriched["result"]["content_blocks"][0]
        self.assertNotIn("data_b64", image)
        self.assertTrue(image["data_omitted"])
        self.assertGreater(image["byte_len"], 0)
        # text block and other metadata survive
        self.assertEqual(enriched["result"]["content_blocks"][1]["type"], "text")

    def test_no_base64_string_anywhere_in_enriched_event(self):
        import json

        event = self._image_result_event()
        enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(event, {})
        self.assertNotIn("QUJDREVGRw==", json.dumps(enriched))

    def test_legacy_tool_result_without_blocks_unchanged(self):
        event = {"type": "tool_result", "tool_name": "x", "result": {"ok": True, "value": 7}}
        enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(event, {})
        self.assertEqual(enriched["result"], {"ok": True, "value": 7})

    def test_redact_helper_tolerates_missing_result(self):
        # Must not raise on odd shapes.
        unchain_adapter._redact_tool_result_images({"type": "tool_result"})
        unchain_adapter._redact_tool_result_images({"type": "tool_result", "result": None})
        unchain_adapter._redact_tool_result_images({"type": "tool_result", "result": "str"})


class ExistingBranchRegressionTests(unittest.TestCase):
    def test_builtin_branch_does_not_intercept_mcp_names(self):
        # An mcp. name must still reach the mcp branch, not the builtin one.
        with mock.patch.object(
            unchain_adapter, "build_mcp_runtime_toolkit"
        ) as mocked_mcp:
            mocked_mcp.return_value = _FakeComputerToolkit()
            result = unchain_adapter._build_selected_toolkits({"toolkits": ["mcp.demo"]})
        mocked_mcp.assert_called_once_with("mcp.demo")
        self.assertEqual(len(result), 1)

    def test_generic_toolkit_names_still_flow_through(self):
        # A non-prefixed name must not be swallowed by the builtin branch; it
        # reaches the generic resolver (which raises for an unavailable toolkit).
        with self.assertRaises(RuntimeError):
            unchain_adapter._build_selected_toolkits(
                {"toolkits": ["definitely_not_a_real_toolkit"]}
            )


if __name__ == "__main__":
    unittest.main()
