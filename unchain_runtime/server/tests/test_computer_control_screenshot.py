import io
import sys
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from computer_control import screenshot as shot  # noqa: E402
from computer_control.errors import ComputerControlError  # noqa: E402


class _FakeGrab:
    """Stand-in for an mss ScreenShot: RGB pixel buffer + dimensions."""

    def __init__(self, width, height):
        self.width = width
        self.height = height
        # deterministic gradient so PNG encode is exercised for real
        self.rgb = bytes((i % 256) for i in range(width * height * 3))


class _FakeSct:
    def __init__(self, monitors, grab):
        self._monitors = monitors
        self._grab = grab
        self.grabbed_monitor = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    @property
    def monitors(self):
        return self._monitors

    def grab(self, monitor):
        self.grabbed_monitor = monitor
        return self._grab


class _FakeMssModule:
    def __init__(self, sct):
        self._sct = sct

    def mss(self):
        return self._sct


def _fake_mss(monitors, grab):
    return _FakeMssModule(_FakeSct(monitors, grab))


class DetectDprTests(unittest.TestCase):
    def test_retina_dpr_2(self):
        self.assertEqual(shot.detect_device_pixel_ratio(1440, 2880), 2.0)

    def test_non_retina_dpr_1(self):
        self.assertEqual(shot.detect_device_pixel_ratio(1920, 1920), 1.0)

    def test_clamps_below_one_to_one(self):
        self.assertEqual(shot.detect_device_pixel_ratio(2000, 1000), 1.0)

    def test_zero_monitor_width_defaults_one(self):
        self.assertEqual(shot.detect_device_pixel_ratio(0, 1000), 1.0)


class CaptureScreenshotTests(unittest.TestCase):
    def _decode_png_size(self, png_bytes):
        from PIL import Image

        with Image.open(io.BytesIO(png_bytes)) as img:
            return img.size

    def test_retina_capture_downsamples_and_builds_scale_map(self):
        # Physical 2880x1800 grab, monitor reported as 1440 wide -> DPR 2.0.
        monitors = [
            {"left": 0, "top": 0, "width": 1440, "height": 900},  # virtual [0]
            {"left": 0, "top": 0, "width": 1440, "height": 900},  # primary [1]
        ]
        grab = _FakeGrab(2880, 1800)
        with mock.patch.object(shot, "_import_mss", return_value=_fake_mss(monitors, grab)):
            result = shot.capture_screenshot(max_long_edge=1440)

        self.assertEqual((result.model_width, result.model_height), (1440, 900))
        self.assertEqual(self._decode_png_size(result.png_bytes), (1440, 900))
        sm = result.scale_map
        self.assertEqual((sm.physical_width, sm.physical_height), (2880, 1800))
        self.assertEqual((sm.model_width, sm.model_height), (1440, 900))
        self.assertEqual(sm.device_pixel_ratio, 2.0)
        # End-to-end: model (720,450) -> logical (720,450) on this Retina display.
        self.assertEqual(sm.model_to_logical(720, 450), (720.0, 450.0))

    def test_non_retina_capture_dpr_1_no_downsample(self):
        monitors = [
            {"left": 0, "top": 0, "width": 1280, "height": 800},
            {"left": 0, "top": 0, "width": 1280, "height": 800},
        ]
        grab = _FakeGrab(1280, 800)
        with mock.patch.object(shot, "_import_mss", return_value=_fake_mss(monitors, grab)):
            result = shot.capture_screenshot(max_long_edge=1568)

        self.assertEqual((result.model_width, result.model_height), (1280, 800))
        self.assertEqual(result.scale_map.device_pixel_ratio, 1.0)
        self.assertEqual(self._decode_png_size(result.png_bytes), (1280, 800))

    def test_display_out_of_range_raises(self):
        monitors = [
            {"left": 0, "top": 0, "width": 1280, "height": 800},
            {"left": 0, "top": 0, "width": 1280, "height": 800},
        ]
        grab = _FakeGrab(1280, 800)
        with mock.patch.object(shot, "_import_mss", return_value=_fake_mss(monitors, grab)):
            with self.assertRaises(ComputerControlError) as ctx:
                shot.capture_screenshot(display_index=5)
        self.assertEqual(ctx.exception.code, "screenshot_display_not_found")

    def test_capture_failure_wrapped(self):
        class _BoomSct(_FakeSct):
            def grab(self, monitor):
                raise RuntimeError("CGDisplayCreateImage failed (no permission)")

        boom = _FakeMssModule(
            _BoomSct(
                [
                    {"width": 1280, "height": 800},
                    {"width": 1280, "height": 800},
                ],
                None,
            )
        )
        with mock.patch.object(shot, "_import_mss", return_value=boom):
            with self.assertRaises(ComputerControlError) as ctx:
                shot.capture_screenshot()
        self.assertEqual(ctx.exception.code, "screenshot_capture_failed")

    def test_metadata_excludes_raw_bytes(self):
        monitors = [
            {"width": 1000, "height": 500},
            {"width": 1000, "height": 500},
        ]
        grab = _FakeGrab(1000, 500)
        with mock.patch.object(shot, "_import_mss", return_value=_fake_mss(monitors, grab)):
            result = shot.capture_screenshot(max_long_edge=1568)
        meta = result.to_metadata()
        self.assertEqual(meta["model_width"], 1000)
        self.assertIn("scale_map", meta)
        self.assertNotIn("png_bytes", meta)
        self.assertEqual(meta["size_bytes"], len(result.png_bytes))


if __name__ == "__main__":
    unittest.main()
