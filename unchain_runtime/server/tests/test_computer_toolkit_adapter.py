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
    return mock.patch.dict(
        "os.environ",
        {
            "PUPU_FEATURE_COMPUTER_USE": "1",
            "PUPU_COMPUTER_USE": value,
        },
        clear=False,
    )


_COMPUTER_TOOLKIT_META = {
    "computer": {
        "toolkit_id": "builtin.computer",
        "toolkit_name": "ComputerToolkit",
    }
}


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


class SubagentExclusionTests(unittest.TestCase):
    """F9 (SEC-001 P0): recipe-subagent runs execute with on_tool_confirm=None,
    so the F1 confirmation gate can't fire there. The computer tool must be kept
    OUT of a subagent's tool set entirely (tool-absent, not mount-then-deny)."""

    def _build(self, options):
        with _with_flag("1"), mock.patch(
            "computer_control.toolkit.ComputerToolkit", _FakeComputerToolkit
        ):
            return unchain_adapter._build_selected_toolkits(options)

    def _computer_options(self, **extra):
        opts = {
            "toolkits": ["builtin.computer"],
            "provider": "anthropic",
            "model": "claude-opus-4-8",
        }
        opts.update(extra)
        return opts

    def test_main_run_mounts_computer(self):
        # Baseline: a normal (non-subagent) run with the flag on and a supported
        # model still mounts the tool.
        result = self._build(self._computer_options())
        self.assertEqual(len(result), 1)
        self.assertIsInstance(result[0], _FakeComputerToolkit)

    def test_subagent_run_does_not_mount_computer(self):
        # THE F9 RED CASE: same options + _recipe_subagent_run=True ⇒ tool absent.
        result = self._build(self._computer_options(_recipe_subagent_run=True))
        self.assertEqual(result, [], "computer tool must be absent in a subagent run")

    def test_subagent_flag_falsey_still_mounts(self):
        # A falsey flag value must not exclude (only a truthy subagent flag does).
        for falsey in (False, 0, "", None):
            with self.subTest(value=falsey):
                result = self._build(self._computer_options(_recipe_subagent_run=falsey))
                self.assertEqual(len(result), 1)

    def test_build_builtin_toolkit_subagent_arg_gates_directly(self):
        # Unit-level: the mount helper returns None for a subagent run regardless
        # of an otherwise-valid model/flag.
        with _with_flag("1"), mock.patch(
            "computer_control.toolkit.ComputerToolkit", _FakeComputerToolkit
        ):
            mounted = unchain_adapter._build_builtin_toolkit(
                "builtin.computer",
                provider="anthropic",
                model="claude-opus-4-8",
                is_subagent_run=False,
            )
            skipped = unchain_adapter._build_builtin_toolkit(
                "builtin.computer",
                provider="anthropic",
                model="claude-opus-4-8",
                is_subagent_run=True,
            )
        self.assertIsInstance(mounted, _FakeComputerToolkit)
        self.assertIsNone(skipped)


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
        enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(
            event, _COMPUTER_TOOLKIT_META
        )
        image = enriched["result"]["content_blocks"][0]
        self.assertNotIn("data_b64", image)
        self.assertTrue(image["data_omitted"])
        self.assertGreater(image["byte_len"], 0)
        # text block and other metadata survive
        self.assertEqual(enriched["result"]["content_blocks"][1]["type"], "text")

    def test_no_base64_string_anywhere_in_enriched_event(self):
        import json

        event = self._image_result_event()
        enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(
            event, _COMPUTER_TOOLKIT_META
        )
        self.assertNotIn("QUJDREVGRw==", json.dumps(enriched))

    def test_typed_text_is_redacted_before_sse_enrichment(self):
        event = {
            "type": "tool_call",
            "tool_name": "computer",
            "arguments": {
                "actions": [
                    {"type": "type", "text": "TOP-SECRET-VALUE"},
                    {"type": "click", "x": 1, "y": 2},
                ]
            },
        }

        enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(
            event, _COMPUTER_TOOLKIT_META
        )

        self.assertNotIn("TOP-SECRET-VALUE", repr(enriched))
        self.assertEqual(
            enriched["arguments"]["actions"][0]["text"],
            "[redacted 16 chars]",
        )
        self.assertEqual(event["arguments"]["actions"][0]["text"], "TOP-SECRET-VALUE")

    def test_confirmation_payload_redacts_typed_text_before_sse(self):
        request = {
            "tool_name": "computer",
            "call_id": "call-1",
            "arguments": {"action": "type", "text": "CONFIRM-SECRET"},
            "description": "Model wants to type 14 characters.",
        }

        payload = unchain_adapter._build_tool_confirmation_request_payload(request)

        self.assertNotIn("CONFIRM-SECRET", repr(payload))
        self.assertEqual(payload["arguments"]["text"], "[redacted 14 chars]")
        self.assertEqual(request["arguments"]["text"], "CONFIRM-SECRET")

    def test_unmounted_image_tool_result_is_unchanged(self):
        event = self._image_result_event()
        enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(event, {})
        image = enriched["result"]["content_blocks"][0]
        self.assertEqual(image["data_b64"], "QUJDREVGRw==")
        self.assertNotIn("data_omitted", image)

    def test_explicit_computer_identity_redacts_even_without_tool_name(self):
        event = self._image_result_event()
        event.pop("tool_name")
        event["toolkit_id"] = "builtin.computer"

        enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(
            event, {}
        )

        image = enriched["result"]["content_blocks"][0]
        self.assertNotIn("data_b64", image)
        self.assertTrue(image["data_omitted"])

    def test_missing_unchain_redactor_uses_host_fail_closed_fallback(self):
        event = self._image_result_event()
        with mock.patch.object(unchain_adapter, "_redact_result_image_data", None):
            enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(
                event, _COMPUTER_TOOLKIT_META
            )
        image = enriched["result"]["content_blocks"][0]
        self.assertNotIn("data_b64", image)
        self.assertTrue(image["data_omitted"])

    def test_failing_unchain_redactor_uses_host_fail_closed_fallback(self):
        event = self._image_result_event()
        with mock.patch.object(
            unchain_adapter,
            "_redact_result_image_data",
            side_effect=RuntimeError("redactor boom"),
        ):
            enriched = unchain_adapter._enrich_tool_event_with_toolkit_metadata(
                event, _COMPUTER_TOOLKIT_META
            )
        image = enriched["result"]["content_blocks"][0]
        self.assertNotIn("data_b64", image)
        self.assertTrue(image["data_omitted"])

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
