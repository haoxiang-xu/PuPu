import sys
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from computer_control.coordinates import (  # noqa: E402
    ScaleMap,
    compute_target_size,
)


class ComputeTargetSizeTests(unittest.TestCase):
    def test_no_downsample_when_within_budget(self):
        self.assertEqual(compute_target_size(1200, 800, 1568), (1200, 800, 1.0))

    def test_no_downsample_when_budget_falsy(self):
        self.assertEqual(compute_target_size(4000, 3000, None), (4000, 3000, 1.0))
        self.assertEqual(compute_target_size(4000, 3000, 0), (4000, 3000, 1.0))

    def test_downsamples_on_long_edge_preserving_aspect(self):
        w, h, scale = compute_target_size(2880, 1800, 1440)
        self.assertEqual((w, h), (1440, 900))
        self.assertAlmostEqual(scale, 0.5)

    def test_downsamples_portrait_on_long_edge(self):
        w, h, scale = compute_target_size(1000, 2000, 1000)
        self.assertEqual((w, h), (500, 1000))
        self.assertAlmostEqual(scale, 0.5)

    def test_default_budget_1568(self):
        w, h, _ = compute_target_size(3840, 2160, 1568)
        self.assertEqual(max(w, h), 1568)

    def test_reserves_2576_budget_for_newer_models(self):
        w, h, _ = compute_target_size(5152, 3200, 2576)
        self.assertEqual(max(w, h), 2576)

    def test_rejects_nonpositive_source(self):
        with self.assertRaises(ValueError):
            compute_target_size(0, 100, 1000)


class ScaleMapRetinaTests(unittest.TestCase):
    """The mandated Retina DPR=2 chain: physical 2880x1800 capture, downsampled
    to a 1440x900 model image, logical injection space at DPR 2."""

    def setUp(self):
        self.scale_map = ScaleMap(
            physical_width=2880,
            physical_height=1800,
            model_width=1440,
            model_height=900,
            device_pixel_ratio=2.0,
        )

    def test_scale_factors(self):
        self.assertAlmostEqual(self.scale_map.scale_x, 0.5)
        self.assertAlmostEqual(self.scale_map.scale_y, 0.5)

    def test_model_to_physical(self):
        px, py = self.scale_map.model_to_physical(720, 450)
        self.assertAlmostEqual(px, 1440.0)
        self.assertAlmostEqual(py, 900.0)

    def test_model_to_logical_divides_physical_by_dpr(self):
        # Full chain: model (720,450) -> physical (1440,900) -> logical (720,450)
        lx, ly = self.scale_map.model_to_logical(720, 450)
        self.assertAlmostEqual(lx, 720.0)
        self.assertAlmostEqual(ly, 450.0)

    def test_physical_to_model_inverse(self):
        mx, my = self.scale_map.physical_to_model(1440, 900)
        self.assertAlmostEqual(mx, 720.0)
        self.assertAlmostEqual(my, 450.0)

    def test_model_to_injection_logical_vs_physical(self):
        self.assertEqual(
            self.scale_map.model_to_injection(720, 450, "logical"),
            (720.0, 450.0),
        )
        self.assertEqual(
            self.scale_map.model_to_injection(720, 450, "physical"),
            (1440.0, 900.0),
        )

    def test_injection_to_model_round_trip_logical(self):
        lx, ly = self.scale_map.model_to_injection(720, 450, "logical")
        mx, my = self.scale_map.injection_to_model(lx, ly, "logical")
        self.assertAlmostEqual(mx, 720.0)
        self.assertAlmostEqual(my, 450.0)

    def test_injection_to_model_round_trip_physical(self):
        px, py = self.scale_map.model_to_injection(720, 450, "physical")
        mx, my = self.scale_map.injection_to_model(px, py, "physical")
        self.assertAlmostEqual(mx, 720.0)
        self.assertAlmostEqual(my, 450.0)

    def test_unknown_space_raises(self):
        with self.assertRaises(ValueError):
            self.scale_map.model_to_injection(0, 0, "device")


class ScaleMapNonRetinaTests(unittest.TestCase):
    def test_dpr_1_logical_equals_physical(self):
        sm = ScaleMap(
            physical_width=1920,
            physical_height=1080,
            model_width=1568,
            model_height=882,
            device_pixel_ratio=1.0,
        )
        px, py = sm.model_to_physical(784, 441)
        lx, ly = sm.model_to_logical(784, 441)
        self.assertEqual((px, py), (lx, ly))

    def test_rejects_bad_dimensions(self):
        with self.assertRaises(ValueError):
            ScaleMap(0, 100, 50, 50)
        with self.assertRaises(ValueError):
            ScaleMap(100, 100, 50, 50, device_pixel_ratio=0)

    def test_to_dict_round_trips(self):
        sm = ScaleMap(2880, 1800, 1440, 900, device_pixel_ratio=2.0)
        data = sm.to_dict()
        self.assertEqual(data["physical_width"], 2880)
        self.assertEqual(data["model_width"], 1440)
        self.assertEqual(data["device_pixel_ratio"], 2.0)
        self.assertAlmostEqual(data["scale_x"], 0.5)


if __name__ == "__main__":
    unittest.main()
