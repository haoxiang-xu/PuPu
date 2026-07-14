"""C2 unit tests for ComputerToolkit: native-spec production, beta aggregation,
action dispatch/translation, capability degradation, and the S0 image-block
redaction contract. All hardware is mocked — no real screenshot or injection.
"""

from __future__ import annotations

import base64
import sys
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from computer_control import toolkit as toolkit_mod
from computer_control.toolkit import ComputerToolkit


def _caps(screenshot=True, injection=True, caveats=None, degradation_reason=None):
    return {
        "platform": "macos",
        "screenshot": screenshot,
        "injection": injection,
        "caveats": list(caveats or []),
        "degradation_reason": degradation_reason,
    }


class _FakeScreenshot:
    def __init__(self, png_bytes, w, h):
        self.png_bytes = png_bytes
        self.model_width = w
        self.model_height = h


class FakeController:
    """Stand-in for C1 ComputerController with recorded calls."""

    def __init__(self, caps, *, screenshot_result=None):
        self._caps = caps
        self._last_scale_map = None
        self.act_calls = []
        self.screenshot_calls = []
        self._screenshot_result = screenshot_result or _FakeScreenshot(
            b"\x89PNGfake", 1512, 982
        )

    def capabilities(self, refresh=False):
        return self._caps

    def screenshot(self, max_long_edge=None):
        self.screenshot_calls.append(max_long_edge)
        self._last_scale_map = object()  # a screenshot was taken
        return self._screenshot_result

    def act(self, action, **params):
        self.act_calls.append((action, params))
        return {
            "ok": True,
            "action": action,
            "coordinate_space": "logical",
            "caveats": [],
        }


def _make_toolkit(caps, *, geometry=(1512, 982), controller=None, **kwargs):
    ctrl = controller or FakeController(caps)
    with mock.patch.object(
        toolkit_mod, "_probe_display_geometry", return_value=geometry
    ):
        tk = ComputerToolkit(controller=ctrl, **kwargs)
    return tk, ctrl


class NativeSpecTests(unittest.TestCase):
    def test_native_spec_and_beta_declared_when_screenshot_capable(self):
        tk, _ = _make_toolkit(_caps())
        tool = tk.get("computer")
        self.assertIsNotNone(tool)
        spec = tool.provider_native_specs.get("anthropic")
        self.assertEqual(spec["type"], "computer_20251124")
        self.assertEqual(spec["name"], "computer")
        self.assertEqual(spec["display_width_px"], 1512)
        self.assertEqual(spec["display_height_px"], 982)
        self.assertEqual(
            tool.required_betas.get("anthropic"), ["computer-use-2025-11-24"]
        )

    def test_to_provider_json_short_circuits_to_native_spec(self):
        tk, _ = _make_toolkit(_caps())
        payloads = tk.to_provider_json("anthropic")
        self.assertEqual(len(payloads), 1)
        self.assertEqual(payloads[0]["type"], "computer_20251124")
        # generic providers fall back to a function schema (no native spec)
        openai_payload = tk.to_provider_json("openai")[0]
        self.assertNotEqual(openai_payload.get("type"), "computer_20251124")

    def test_beta_aggregation(self):
        tk, _ = _make_toolkit(_caps())
        self.assertEqual(tk.required_betas("anthropic"), ["computer-use-2025-11-24"])
        self.assertEqual(tk.required_betas("openai"), [])

    def test_display_dims_budget_boundary(self):
        # Retina logical below the 1568 budget: budget = long edge (1512).
        tk, _ = _make_toolkit(_caps(), geometry=(1512, 982))
        spec = tk.get("computer").provider_native_specs["anthropic"]
        self.assertEqual((spec["display_width_px"], spec["display_height_px"]), (1512, 982))
        self.assertEqual(tk._screenshot_budget, 1512)

    def test_display_dims_downscaled_above_budget(self):
        # 1920 long edge > 1568 budget: declared scales to the 1568 budget.
        tk, _ = _make_toolkit(_caps(), geometry=(1920, 1080))
        spec = tk.get("computer").provider_native_specs["anthropic"]
        self.assertEqual(spec["display_width_px"], 1568)
        self.assertEqual(spec["display_height_px"], 882)
        self.assertEqual(tk._screenshot_budget, 1568)

    def test_construction_takes_no_screenshot(self):
        # Lazy: constructing the toolkit must never grab (TCC red line).
        _tk, ctrl = _make_toolkit(_caps())
        self.assertEqual(ctrl.screenshot_calls, [])


class DispatchTests(unittest.TestCase):
    def test_screenshot_returns_text_first_then_image_block(self):
        ctrl = FakeController(_caps(), screenshot_result=_FakeScreenshot(b"PNGDATA", 1512, 982))
        tk, _ = _make_toolkit(_caps(), controller=ctrl)
        result = tk.execute("computer", {"action": "screenshot"})
        blocks = result["content_blocks"]
        # Contract: text block FIRST, image block SECOND.
        self.assertEqual(blocks[0]["type"], "text")
        image = blocks[1]
        self.assertEqual(image["type"], "image")
        self.assertEqual(image["media_type"], "image/png")
        self.assertEqual(base64.b64decode(image["data_b64"]), b"PNGDATA")
        self.assertEqual((image["width"], image["height"]), (1512, 982))
        # screenshot captured with the pinned budget, not the raw default
        self.assertEqual(ctrl.screenshot_calls, [tk._screenshot_budget])

    def test_wait_really_sleeps_and_is_capped(self):
        tk, _ = _make_toolkit(_caps())
        with mock.patch.object(toolkit_mod.time, "sleep") as slept:
            result = tk.execute("computer", {"action": "wait", "duration": 2})
        slept.assert_called_once_with(2.0)
        self.assertTrue(result["ok"])
        # cap: a large duration is clamped to the max
        with mock.patch.object(toolkit_mod.time, "sleep") as slept:
            tk.execute("computer", {"action": "wait", "duration": 999})
        slept.assert_called_once_with(5.0)
        # default when unspecified
        with mock.patch.object(toolkit_mod.time, "sleep") as slept:
            tk.execute("computer", {"action": "wait"})
        slept.assert_called_once_with(1.0)

    def test_tool_is_always_load(self):
        tk, _ = _make_toolkit(_caps())
        self.assertTrue(tk.get("computer").always_load)

    def test_unsupported_action_message_lists_supported(self):
        tk, _ = _make_toolkit(_caps())
        result = tk.execute("computer", {"action": "hold_key", "text": "shift"})
        self.assertIn("supported:", result["result"])
        self.assertIn("left_click", result["result"])

    def test_left_click_forwards_coordinate_to_controller(self):
        ctrl = FakeController(_caps())
        tk, _ = _make_toolkit(_caps(), controller=ctrl)
        ctrl._last_scale_map = object()  # pretend a screenshot happened
        result = tk.execute("computer", {"action": "left_click", "coordinate": [100, 200]})
        self.assertTrue(result["ok"])
        self.assertEqual(ctrl.act_calls[0][0], "left_click")
        self.assertEqual(ctrl.act_calls[0][1]["coordinate"], [100, 200])

    def test_mouse_move_alias_translates_to_move(self):
        ctrl = FakeController(_caps())
        tk, _ = _make_toolkit(_caps(), controller=ctrl)
        ctrl._last_scale_map = object()
        tk.execute("computer", {"action": "mouse_move", "coordinate": [5, 6]})
        self.assertEqual(ctrl.act_calls[0][0], "move")

    def test_unsupported_action_reported_not_raised(self):
        tk, ctrl = _make_toolkit(_caps())
        result = tk.execute("computer", {"action": "hold_key", "text": "shift"})
        self.assertFalse(result["ok"])
        self.assertIn("unsupported_action", result["caveats"])
        self.assertEqual(ctrl.act_calls, [])

    def test_no_screenshot_caveat_before_first_capture(self):
        ctrl = FakeController(_caps())
        tk, _ = _make_toolkit(_caps(), controller=ctrl)
        # _last_scale_map is None → click surfaces the caveat
        result = tk.execute("computer", {"action": "left_click", "coordinate": [1, 2]})
        self.assertIn("no_screenshot_taken", result["caveats"])

    def test_controller_error_becomes_structured_result(self):
        class BoomController(FakeController):
            def act(self, action, **params):
                err = RuntimeError("boom")
                err.code = "invalid_coordinate"
                err.message = "bad coord"
                raise err

        ctrl = BoomController(_caps())
        tk, _ = _make_toolkit(_caps(), controller=ctrl)
        ctrl._last_scale_map = object()
        result = tk.execute("computer", {"action": "left_click", "coordinate": [1, 2]})
        self.assertFalse(result["ok"])
        self.assertEqual(result["result"], "bad coord")
        self.assertIn("invalid_coordinate", result["caveats"])


class DegradationTests(unittest.TestCase):
    def test_no_native_spec_when_screenshot_incapable(self):
        caps = _caps(screenshot=False, injection=False, degradation_reason="Wayland")
        tk, _ = _make_toolkit(caps, geometry=None)
        tool = tk.get("computer")
        self.assertEqual(tool.provider_native_specs, {})
        self.assertEqual(tool.required_betas, {})
        # anthropic falls back to a generic function schema
        self.assertNotEqual(
            tk.to_provider_json("anthropic")[0].get("type"), "computer_20251124"
        )

    def test_screenshot_action_reports_unavailable(self):
        caps = _caps(screenshot=False, injection=False, degradation_reason="Wayland")
        tk, _ = _make_toolkit(caps, geometry=None)
        result = tk.execute("computer", {"action": "screenshot"})
        self.assertFalse(result["ok"])
        self.assertIn("screenshot_unavailable", result["caveats"])

    def test_injection_unavailable_rejects_clicks(self):
        caps = _caps(screenshot=True, injection=False)
        tk, ctrl = _make_toolkit(caps)
        result = tk.execute("computer", {"action": "left_click", "coordinate": [1, 1]})
        self.assertFalse(result["ok"])
        self.assertIn("injection_unavailable", result["caveats"])
        self.assertEqual(ctrl.act_calls, [])

    def test_windows_uipi_caveat_flows_into_results(self):
        caps = _caps(caveats=["uipi_may_block"])
        tk, _ = _make_toolkit(caps)
        result = tk.execute("computer", {"action": "screenshot"})
        self.assertIn("uipi_may_block", result["caveats"])


class RedactionContractTests(unittest.TestCase):
    """The fail-closed red line, verified at the toolkit's own output shape."""

    def test_screenshot_result_redacts_to_reference_marker(self):
        from unchain.tools.messages import redact_result_image_data

        ctrl = FakeController(_caps(), screenshot_result=_FakeScreenshot(b"BIGIMAGE", 10, 10))
        tk, _ = _make_toolkit(_caps(), controller=ctrl)
        result = tk.execute("computer", {"action": "screenshot"})
        image = result["content_blocks"][1]  # text-first, image-second
        self.assertIn("data_b64", image)

        redact_result_image_data(result)
        image = result["content_blocks"][1]
        self.assertNotIn("data_b64", image)
        self.assertTrue(image["data_omitted"])
        self.assertGreater(image["byte_len"], 0)
        # non-image metadata survives so the frontend can render a placeholder
        self.assertEqual(image["type"], "image")
        self.assertEqual(image["media_type"], "image/png")


if __name__ == "__main__":
    unittest.main()
