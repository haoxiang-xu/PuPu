from __future__ import annotations

import sys
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from computer_control.errors import ComputerControlError  # noqa: E402
from computer_control.protocol import (  # noqa: E402
    batch_requires_confirmation,
    normalize_batch,
    redact_sensitive_arguments,
    validate_batch,
)


class ComputerProtocolTests(unittest.TestCase):
    def test_openai_actions_normalize_to_canonical_batch(self):
        batch = normalize_batch(
            {
                "provider": "openai",
                "protocol": "openai.responses.computer.v1",
                "actions": [
                    {"type": "click", "button": "left", "x": 12, "y": 34},
                    {"type": "keypress", "keys": ["CTRL", "S"]},
                ],
            }
        )
        self.assertEqual(batch["schema"], "pupu.computer.actions")
        self.assertEqual(batch["actions"][0]["coordinate"], {"x": 12.0, "y": 34.0})
        self.assertEqual(batch["actions"][1]["keys"], ["CTRL", "S"])

    def test_anthropic_legacy_action_normalizes(self):
        batch = normalize_batch(
            {"action": "left_click", "coordinate": [5, 6], "keys": ["SHIFT"]}
        )
        self.assertEqual(batch["provider"], "anthropic")
        self.assertEqual(batch["actions"][0]["type"], "click")
        self.assertEqual(batch["actions"][0]["button"], "left")

    def test_batch_validation_is_atomic(self):
        batch = normalize_batch(
            {
                "provider": "openai",
                "actions": [
                    {"type": "click", "x": 10, "y": 10},
                    {"type": "type", "text": "x" * 8193},
                ],
            }
        )
        with self.assertRaises(ComputerControlError) as ctx:
            validate_batch(batch, width=100, height=100, has_screenshot=True)
        self.assertEqual(ctx.exception.code, "text_too_large")

    def test_coordinate_action_requires_screenshot(self):
        batch = normalize_batch({"actions": [{"type": "move", "x": 1, "y": 2}]})
        with self.assertRaises(ComputerControlError) as ctx:
            validate_batch(batch, width=100, height=100, has_screenshot=False)
        self.assertEqual(ctx.exception.code, "screenshot_required")

    def test_read_only_batch_is_confirmation_exempt(self):
        batch = normalize_batch(
            {"actions": [{"type": "screenshot"}, {"type": "wait", "duration": 1}]}
        )
        validate_batch(batch, width=100, height=100, has_screenshot=False)
        self.assertFalse(batch_requires_confirmation(batch))

    def test_any_mutation_confirms_whole_batch(self):
        batch = normalize_batch(
            {
                "actions": [
                    {"type": "screenshot"},
                    {"type": "click", "x": 1, "y": 2},
                ]
            }
        )
        validate_batch(batch, width=100, height=100, has_screenshot=False)
        self.assertTrue(batch_requires_confirmation(batch))

    def test_typed_text_redaction_keeps_shape_but_not_secret(self):
        original = {
            "actions": [
                {"type": "type", "text": "secret-value"},
                {"type": "click", "x": 1, "y": 2},
            ]
        }
        redacted = redact_sensitive_arguments(original)
        self.assertEqual(redacted["actions"][0]["text"], "[redacted 12 chars]")
        self.assertNotIn("secret-value", repr(redacted))
        self.assertEqual(original["actions"][0]["text"], "secret-value")

    def test_expired_typed_text_marker_fails_closed(self):
        batch = normalize_batch(
            {
                "actions": [
                    {"type": "type", "text": "", "text_omitted": True}
                ]
            }
        )
        with self.assertRaises(ComputerControlError) as ctx:
            validate_batch(batch, width=100, height=100, has_screenshot=True)
        self.assertEqual(ctx.exception.code, "sensitive_payload_expired")


if __name__ == "__main__":
    unittest.main()
