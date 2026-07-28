"""Opt-in real-hardware smoke tests for computer_control.

These touch the real display / input stack and are therefore excluded from the
default suite (headless CI, any platform). Run explicitly on a workstation:

    PUPU_CC_SMOKE=1 python -m pytest tests/test_computer_control_smoke.py

Set PUPU_CC_SMOKE=inject additionally to allow the (harmless 1px) mouse-move
injection probe; by default even under smoke the injection probe is skipped so
the suite never moves the developer's cursor unexpectedly.
"""

import io
import os
import sys
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

_SMOKE = os.environ.get("PUPU_CC_SMOKE")
_INJECT = os.environ.get("PUPU_CC_SMOKE") == "inject"


@unittest.skipUnless(_SMOKE, "set PUPU_CC_SMOKE=1 to run real-hardware smoke tests")
class ScreenshotSmokeTests(unittest.TestCase):
    def test_real_capture_produces_valid_png(self):
        from PIL import Image

        from computer_control.screenshot import capture_screenshot

        result = capture_screenshot()
        with Image.open(io.BytesIO(result.png_bytes)) as img:
            self.assertEqual(img.format, "PNG")
            self.assertEqual(img.size, (result.model_width, result.model_height))
        self.assertLessEqual(max(result.model_width, result.model_height), 1568)
        self.assertGreaterEqual(result.scale_map.device_pixel_ratio, 1.0)


@unittest.skipUnless(_INJECT, "set PUPU_CC_SMOKE=inject to run the injection probe")
class InjectionSmokeTests(unittest.TestCase):
    def test_cursor_position_round_trip(self):
        from computer_control.backends.pynput_backend import PynputBackend

        backend = PynputBackend(coordinate_space="physical")
        env = backend.dispatch("cursor_position")
        self.assertIn("result", env)
        # nudge the cursor by 1px and restore, proving injection is wired
        x = env["result"]["x"]
        y = env["result"]["y"]
        backend.dispatch("move", coordinate=[x + 1, y + 1])
        backend.dispatch("move", coordinate=[x, y])


if __name__ == "__main__":
    unittest.main()
