"""F1 (SEC-001 P0, /守 CRITICAL) tests for the ComputerToolkit confirmation gate.

Two layers:
  * resolver unit tests — every injection action requires confirmation, every
    read-only action is exempt, unknown actions fail closed;
  * integration red tests — driving unchain's real ``execute_confirmable_tool_call``
    with a spy ``on_tool_confirm``, we assert an injection action ALWAYS produces
    a confirmation request and is NOT dispatched to the injection backend unless
    approved, while a read-only action never prompts.

All hardware is mocked — no real screenshot or injection.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from computer_control import toolkit as toolkit_mod
from computer_control.toolkit import ComputerToolkit

from unchain.kernel.types import ToolCall
from unchain.tools.confirmation import execute_confirmable_tool_call


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
    def __init__(self, caps):
        self._caps = caps
        self._last_scale_map = object()  # pretend a screenshot already happened
        self.act_calls = []
        self.screenshot_calls = []

    def capabilities(self, refresh=False):
        return self._caps

    def screenshot(self, max_long_edge=None):
        self.screenshot_calls.append(max_long_edge)
        self._last_scale_map = object()
        return _FakeScreenshot(b"PNGDATA", 1512, 982)

    def act(self, action, **params):
        self.act_calls.append((action, params))
        return {"ok": True, "action": action, "coordinate_space": "logical", "caveats": []}


def _make_toolkit(caps=None, *, geometry=(1512, 982), controller=None):
    caps = caps or _caps()
    ctrl = controller or FakeController(caps)
    with mock.patch.object(toolkit_mod, "_probe_display_geometry", return_value=geometry):
        tk = ComputerToolkit(controller=ctrl)
    return tk, ctrl


# Actions the model can emit and how F1 must classify them.
_INJECTION_ACTIONS = [
    {"action": "left_click", "coordinate": [10, 20]},
    {"action": "right_click", "coordinate": [10, 20]},
    {"action": "middle_click", "coordinate": [10, 20]},
    {"action": "double_click", "coordinate": [10, 20]},
    {"action": "triple_click", "coordinate": [10, 20]},
    {"action": "left_click_drag", "start_coordinate": [1, 2], "coordinate": [3, 4]},
    {"action": "type", "text": "hello world"},
    {"action": "key", "text": "cmd+c"},
    {"action": "scroll", "scroll_direction": "down", "scroll_amount": 3, "coordinate": [5, 6]},
    {"action": "move", "coordinate": [7, 8]},
    {"action": "mouse_move", "coordinate": [7, 8]},  # Anthropic alias for move
]
_READ_ONLY_ACTIONS = [
    {"action": "screenshot"},
    {"action": "wait", "duration": 1},
    {"action": "cursor_position"},
]


class ResolverClassificationTests(unittest.TestCase):
    """The action-classification table (待 llm-expert/守 复核)."""

    def setUp(self):
        self.tk, _ = _make_toolkit()
        self.tool = self.tk.get("computer")

    def test_base_tool_requires_confirmation(self):
        # The base flag must be True so the runtime AND can only narrow it.
        self.assertTrue(self.tool.requires_confirmation)
        self.assertTrue(callable(self.tool.confirmation_resolver))

    def test_every_injection_action_requires_confirmation(self):
        for args in _INJECTION_ACTIONS:
            policy = self.tool.confirmation_resolver(args, None)
            self.assertTrue(
                policy["requires_confirmation"],
                f"injection action must confirm: {args['action']}",
            )
            self.assertTrue(
                str(policy.get("description") or "").strip(),
                f"injection confirm must carry a summary: {args['action']}",
            )

    def test_every_read_only_action_is_exempt(self):
        for args in _READ_ONLY_ACTIONS:
            policy = self.tool.confirmation_resolver(args, None)
            self.assertFalse(
                policy["requires_confirmation"],
                f"read-only action must not confirm: {args['action']}",
            )

    def test_unknown_action_fails_closed_to_confirm(self):
        # Fail-closed: anything not on the exempt allowlist confirms, including
        # unknown/unsupported/future action names.
        for name in ("hold_key", "left_mouse_down", "totally_new_action", "", None):
            policy = self.tool.confirmation_resolver({"action": name}, None)
            self.assertTrue(
                policy["requires_confirmation"],
                f"unknown action must fail closed to confirm: {name!r}",
            )

    def test_malformed_arguments_fail_closed(self):
        # Non-dict arguments must not crash and must default to confirm.
        for bad in (None, "left_click", 42, [1, 2]):
            policy = self.tool.confirmation_resolver(bad, None)
            self.assertTrue(policy["requires_confirmation"])

    def test_summary_includes_coordinate_but_never_typed_text(self):
        click = self.tool.confirmation_resolver(
            {"action": "left_click", "coordinate": [123, 456]}, None
        )
        self.assertIn("(123, 456)", click["description"])
        typed = self.tool.confirmation_resolver(
            {"action": "type", "text": "secret passphrase"}, None
        )
        self.assertNotIn("secret passphrase", typed["description"])
        self.assertIn("17 characters", typed["description"])
        drag = self.tool.confirmation_resolver(
            {"action": "left_click_drag", "start_coordinate": [1, 2], "coordinate": [3, 4]},
            None,
        )
        self.assertIn("(1, 2)", drag["description"])
        self.assertIn("(3, 4)", drag["description"])

    def test_long_typed_text_reports_length_without_payload(self):
        long_text = "A" * 500
        policy = self.tool.confirmation_resolver({"action": "type", "text": long_text}, None)
        self.assertLess(len(policy["description"]), 200)  # frame stays small
        self.assertIn("500 characters", policy["description"])
        self.assertNotIn("AAAA", policy["description"])

    def test_short_typed_text_is_also_redacted(self):
        policy = self.tool.confirmation_resolver({"action": "type", "text": "hi"}, None)
        self.assertNotIn("hi", policy["description"])
        self.assertIn("2 characters", policy["description"])


class ConfirmationGateIntegrationTests(unittest.TestCase):
    """Red line: drive unchain's real confirmation runtime end-to-end."""

    def _run(self, arguments, on_tool_confirm):
        tk, ctrl = _make_toolkit()
        outcome = execute_confirmable_tool_call(
            toolkit=tk,
            tool_call=ToolCall(call_id="c1", name="computer", arguments=arguments),
            on_tool_confirm=on_tool_confirm,
            loop=None,
            callback=None,
            run_id="run-1",
            iteration=0,
        )
        return outcome, ctrl

    def test_left_click_denied_is_never_dispatched(self):
        # THE F1 RED CASE: an injection action MUST produce a confirmation request,
        # and if not approved MUST NOT reach the injection backend.
        seen = []

        def deny(request):
            seen.append(request)
            return {"approved": False, "reason": "user declined"}

        outcome, ctrl = self._run({"action": "left_click", "coordinate": [10, 20]}, deny)

        self.assertEqual(len(seen), 1, "left_click must request confirmation")
        self.assertTrue(outcome.denied)
        self.assertEqual(ctrl.act_calls, [], "denied click must NOT be dispatched")
        self.assertTrue(outcome.tool_result.get("denied"))

    def test_left_click_approved_is_dispatched(self):
        seen = []

        def approve(request):
            seen.append(request)
            return {"approved": True}

        outcome, ctrl = self._run({"action": "left_click", "coordinate": [10, 20]}, approve)

        self.assertEqual(len(seen), 1, "left_click must still request confirmation")
        self.assertFalse(outcome.denied)
        self.assertEqual(len(ctrl.act_calls), 1, "approved click must be dispatched")
        self.assertEqual(ctrl.act_calls[0][0], "left_click")

    def test_confirmation_request_carries_action_summary_and_arguments(self):
        captured = {}

        def approve(request):
            # request is unchain's ToolConfirmationRequest
            captured["description"] = getattr(request, "description", "")
            captured["arguments"] = getattr(request, "arguments", {})
            captured["tool_name"] = getattr(request, "tool_name", "")
            return True

        self._run({"action": "type", "text": "hunter2"}, approve)

        self.assertEqual(captured["tool_name"], "computer")
        self.assertNotIn("hunter2", captured["description"])
        self.assertIn("7 characters", captured["description"])
        # The private in-process request retains the payload for execution; the
        # host adapter redacts it before creating an SSE presentation.
        self.assertEqual(captured["arguments"].get("text"), "hunter2")
        self.assertEqual(captured["arguments"].get("action"), "type")

    def test_screenshot_never_prompts(self):
        seen = []

        def spy(request):
            seen.append(request)
            return True

        outcome, ctrl = self._run({"action": "screenshot"}, spy)

        self.assertEqual(seen, [], "read-only screenshot must NOT request confirmation")
        self.assertIn("content_blocks", outcome.tool_result)
        self.assertEqual(len(ctrl.screenshot_calls), 1, "screenshot must still execute")

    def test_wait_never_prompts(self):
        seen = []

        def spy(request):
            seen.append(request)
            return True

        with mock.patch.object(toolkit_mod.time, "sleep"):
            outcome, _ = self._run({"action": "wait", "duration": 1}, spy)

        self.assertEqual(seen, [], "read-only wait must NOT request confirmation")
        self.assertTrue(outcome.tool_result.get("ok"))

    def test_all_injection_actions_prompt_all_readonly_exempt(self):
        # Full sweep across the classification table through the real runtime.
        for args in _INJECTION_ACTIONS:
            seen = []
            self._run(dict(args), lambda r, s=seen: (s.append(r), True)[1])
            self.assertEqual(
                len(seen), 1, f"injection action must prompt: {args['action']}"
            )
        for args in _READ_ONLY_ACTIONS:
            seen = []
            with mock.patch.object(toolkit_mod.time, "sleep"):
                self._run(dict(args), lambda r, s=seen: (s.append(r), True)[1])
            self.assertEqual(
                seen, [], f"read-only action must not prompt: {args['action']}"
            )


if __name__ == "__main__":
    unittest.main()
