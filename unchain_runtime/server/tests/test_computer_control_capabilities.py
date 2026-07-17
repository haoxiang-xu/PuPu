import sys
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from computer_control import capabilities as caps  # noqa: E402

_FAKE_PROBES = {
    "screen_recording": lambda: caps.PERM_GRANTED,
    "accessibility": lambda: caps.PERM_DENIED,
}


class DetectPlatformTests(unittest.TestCase):
    def test_normalises_known_platforms(self):
        self.assertEqual(caps.detect_platform("darwin"), "macos")
        self.assertEqual(caps.detect_platform("win32"), "windows")
        self.assertEqual(caps.detect_platform("linux"), "linux")

    def test_passes_through_unknown(self):
        self.assertEqual(caps.detect_platform("sunos5"), "sunos5")


class DetectDisplayServerTests(unittest.TestCase):
    def test_macos_is_quartz(self):
        self.assertEqual(caps.detect_display_server("macos", {}), "quartz")

    def test_windows(self):
        self.assertEqual(caps.detect_display_server("windows", {}), "windows")

    def test_linux_wayland_via_session_type(self):
        self.assertEqual(
            caps.detect_display_server("linux", {"XDG_SESSION_TYPE": "wayland"}),
            "wayland",
        )

    def test_linux_wayland_via_wayland_display(self):
        self.assertEqual(
            caps.detect_display_server("linux", {"WAYLAND_DISPLAY": "wayland-0"}),
            "wayland",
        )

    def test_linux_x11(self):
        self.assertEqual(
            caps.detect_display_server("linux", {"XDG_SESSION_TYPE": "x11"}),
            "x11",
        )
        self.assertEqual(
            caps.detect_display_server("linux", {"DISPLAY": ":0"}), "x11"
        )

    def test_linux_headless_unknown(self):
        self.assertEqual(caps.detect_display_server("linux", {}), "unknown")


class GetPermissionsTests(unittest.TestCase):
    def test_non_macos_not_applicable(self):
        perms = caps.get_permissions("linux")
        self.assertEqual(perms["screen_recording"], caps.PERM_NOT_APPLICABLE)
        self.assertEqual(perms["accessibility"], caps.PERM_NOT_APPLICABLE)

    def test_macos_uses_injected_probes(self):
        perms = caps.get_permissions("macos", probes=_FAKE_PROBES)
        self.assertEqual(perms["screen_recording"], caps.PERM_GRANTED)
        self.assertEqual(perms["accessibility"], caps.PERM_DENIED)


class GetCapabilitiesTests(unittest.TestCase):
    def test_macos_all_open_with_permissions(self):
        result = caps.get_capabilities(
            platform_name="darwin", env={}, probes=_FAKE_PROBES
        )
        self.assertEqual(result["platform"], "macos")
        self.assertEqual(result["display_server"], "quartz")
        self.assertTrue(result["screenshot"])
        self.assertTrue(result["injection"])
        self.assertIsNone(result["degradation_reason"])
        self.assertFalse(result["multi_display"])
        self.assertEqual(result["permissions"]["screen_recording"], caps.PERM_GRANTED)
        self.assertEqual(result["caveats"], [])
        self.assertIn("left_click", result["action_set"])

    def test_windows_open_with_uipi_caveat(self):
        result = caps.get_capabilities(platform_name="win32", env={})
        self.assertTrue(result["injection"])
        self.assertIn("uipi_may_block", result["caveats"])
        self.assertEqual(result["permissions"]["screen_recording"], caps.PERM_NOT_APPLICABLE)

    def test_linux_x11_open(self):
        result = caps.get_capabilities(
            platform_name="linux", env={"XDG_SESSION_TYPE": "x11"}
        )
        self.assertTrue(result["screenshot"])
        self.assertTrue(result["injection"])
        self.assertIsNone(result["degradation_reason"])

    def test_linux_wayland_degraded_closed(self):
        result = caps.get_capabilities(
            platform_name="linux", env={"XDG_SESSION_TYPE": "wayland"}
        )
        self.assertFalse(result["screenshot"])
        self.assertFalse(result["injection"])
        self.assertIn("Wayland", result["degradation_reason"])
        self.assertIn("portal", result["degradation_reason"].lower())

    def test_linux_headless_degraded_closed(self):
        result = caps.get_capabilities(platform_name="linux", env={})
        self.assertFalse(result["screenshot"])
        self.assertFalse(result["injection"])
        self.assertIsNotNone(result["degradation_reason"])

    def test_unsupported_platform_closed(self):
        result = caps.get_capabilities(platform_name="sunos5", env={})
        self.assertFalse(result["screenshot"])
        self.assertFalse(result["injection"])
        self.assertIn("unsupported", result["degradation_reason"].lower())


if __name__ == "__main__":
    unittest.main()
