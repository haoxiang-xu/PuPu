import sys
import types
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from computer_control.backends import build_backend  # noqa: E402
from computer_control.backends.base import InjectionBackend  # noqa: E402
from computer_control.backends.pynput_backend import PynputBackend  # noqa: E402
from computer_control.coordinates import ScaleMap  # noqa: E402
from computer_control.errors import ComputerControlError  # noqa: E402
from computer_control.keymap import KeyToken  # noqa: E402


class RecordingBackend(InjectionBackend):
    """Records primitive calls so dispatch logic can be tested with no pynput."""

    def __init__(self, coordinate_space="physical", default_caveats=(), cursor=(11, 22)):
        self.coordinate_space = coordinate_space
        self.default_caveats = tuple(default_caveats)
        self.calls = []
        self._cursor = cursor

    def _move_to(self, x, y):
        self.calls.append(("move_to", x, y))

    def _click(self, button, count):
        self.calls.append(("click", button, count))

    def _drag(self, x1, y1, x2, y2, button):
        self.calls.append(("drag", x1, y1, x2, y2, button))

    def _scroll(self, dx, dy):
        self.calls.append(("scroll", dx, dy))

    def _type_text(self, text):
        self.calls.append(("type", text))

    def _press_combo(self, tokens):
        self.calls.append(("combo", list(tokens)))

    def _cursor_position(self):
        return self._cursor


# Retina-style map: model->physical is 2x, logical = physical/2 => model==logical.
_MAP = ScaleMap(2880, 1800, 1440, 900, device_pixel_ratio=2.0)


class DispatchCoordinateMappingTests(unittest.TestCase):
    def test_move_maps_model_to_logical_on_mac_space(self):
        backend = RecordingBackend(coordinate_space="logical")
        env = backend.dispatch("move", coordinate=[720, 450], scale_map=_MAP)
        self.assertEqual(backend.calls, [("move_to", 720.0, 450.0)])
        self.assertTrue(env["ok"])
        self.assertEqual(env["coordinate_space"], "logical")

    def test_move_maps_model_to_physical_on_physical_space(self):
        backend = RecordingBackend(coordinate_space="physical")
        backend.dispatch("move", coordinate=[720, 450], scale_map=_MAP)
        self.assertEqual(backend.calls, [("move_to", 1440.0, 900.0)])

    def test_no_scale_map_passes_coords_through(self):
        backend = RecordingBackend(coordinate_space="logical")
        backend.dispatch("move", coordinate=[5, 6])
        self.assertEqual(backend.calls, [("move_to", 5.0, 6.0)])


class DispatchActionTests(unittest.TestCase):
    def setUp(self):
        self.backend = RecordingBackend(coordinate_space="physical")

    def test_left_click_at_coordinate_moves_then_clicks(self):
        self.backend.dispatch("left_click", coordinate=[10, 20])
        self.assertEqual(
            self.backend.calls,
            [("move_to", 10.0, 20.0), ("click", "left", 1)],
        )

    def test_left_click_without_coordinate_clicks_in_place(self):
        self.backend.dispatch("left_click")
        self.assertEqual(self.backend.calls, [("click", "left", 1)])

    def test_right_and_middle_click(self):
        self.backend.dispatch("right_click")
        self.backend.dispatch("middle_click")
        self.assertEqual(
            self.backend.calls,
            [("click", "right", 1), ("click", "middle", 1)],
        )

    def test_double_and_triple_click_counts(self):
        self.backend.dispatch("double_click")
        self.backend.dispatch("triple_click")
        self.assertEqual(
            self.backend.calls,
            [("click", "left", 2), ("click", "left", 3)],
        )

    def test_left_click_drag_from_cursor_by_default(self):
        self.backend.dispatch("left_click_drag", coordinate=[30, 40])
        self.assertEqual(
            self.backend.calls,
            [("drag", 11.0, 22.0, 30.0, 40.0, "left")],
        )

    def test_left_click_drag_with_start(self):
        self.backend.dispatch(
            "left_click_drag", start_coordinate=[1, 2], coordinate=[3, 4]
        )
        self.assertEqual(
            self.backend.calls,
            [("drag", 1.0, 2.0, 3.0, 4.0, "left")],
        )

    def test_type_text(self):
        self.backend.dispatch("type", text="hello")
        self.assertEqual(self.backend.calls, [("type", "hello")])

    def test_key_combo_resolves_tokens(self):
        self.backend.dispatch("key", text="ctrl+s")
        self.assertEqual(
            self.backend.calls,
            [("combo", [KeyToken("special", "ctrl"), KeyToken("char", "s")])],
        )

    def test_scroll_down(self):
        self.backend.dispatch("scroll", scroll_direction="down", scroll_amount=3)
        self.assertEqual(self.backend.calls, [("scroll", 0.0, -3.0)])

    def test_scroll_at_coordinate_moves_first(self):
        self.backend.dispatch(
            "scroll", coordinate=[7, 8], scroll_direction="up", scroll_amount=2
        )
        self.assertEqual(
            self.backend.calls,
            [("move_to", 7.0, 8.0), ("scroll", 0.0, 2.0)],
        )

    def test_scroll_left_right(self):
        self.backend.dispatch("scroll", scroll_direction="left", scroll_amount=1)
        self.backend.dispatch("scroll", scroll_direction="right", scroll_amount=1)
        self.assertEqual(
            self.backend.calls,
            [("scroll", -1.0, 0.0), ("scroll", 1.0, 0.0)],
        )

    def test_cursor_position_reports_model_coords(self):
        backend = RecordingBackend(coordinate_space="logical", cursor=(720.0, 450.0))
        env = backend.dispatch("cursor_position", scale_map=_MAP)
        # logical (720,450) -> model (720,450) on this Retina map
        self.assertEqual(env["result"], {"x": 720, "y": 450})


class DispatchErrorTests(unittest.TestCase):
    def setUp(self):
        self.backend = RecordingBackend()

    def test_unsupported_action(self):
        with self.assertRaises(ComputerControlError) as ctx:
            self.backend.dispatch("teleport")
        self.assertEqual(ctx.exception.code, "unsupported_action")

    def test_move_requires_coordinate(self):
        with self.assertRaises(ComputerControlError) as ctx:
            self.backend.dispatch("move")
        self.assertEqual(ctx.exception.code, "invalid_coordinate")

    def test_bad_coordinate_shape(self):
        with self.assertRaises(ComputerControlError) as ctx:
            self.backend.dispatch("move", coordinate=[1, 2, 3])
        self.assertEqual(ctx.exception.code, "invalid_coordinate")

    def test_type_requires_text(self):
        with self.assertRaises(ComputerControlError) as ctx:
            self.backend.dispatch("type")
        self.assertEqual(ctx.exception.code, "invalid_text")

    def test_key_requires_text(self):
        with self.assertRaises(ComputerControlError) as ctx:
            self.backend.dispatch("key", text="")
        self.assertEqual(ctx.exception.code, "invalid_text")

    def test_scroll_requires_direction(self):
        with self.assertRaises(ComputerControlError) as ctx:
            self.backend.dispatch("scroll")
        self.assertEqual(ctx.exception.code, "invalid_scroll")

    def test_scroll_bad_direction(self):
        with self.assertRaises(ComputerControlError) as ctx:
            self.backend.dispatch("scroll", scroll_direction="diagonal")
        self.assertEqual(ctx.exception.code, "invalid_scroll")


class CaveatEnvelopeTests(unittest.TestCase):
    def test_windows_uipi_caveat_surfaces_in_envelope(self):
        backend = RecordingBackend(default_caveats=("uipi_may_block",))
        env = backend.dispatch("left_click")
        self.assertIn("uipi_may_block", env["caveats"])


class BuildBackendTests(unittest.TestCase):
    def test_macos_uses_logical_space(self):
        backend = build_backend(
            {"platform": "macos", "injection": True, "caveats": []}
        )
        self.assertEqual(backend.coordinate_space, "logical")

    def test_windows_uses_physical_space_and_caveat(self):
        backend = build_backend(
            {"platform": "windows", "injection": True, "caveats": ["uipi_may_block"]}
        )
        self.assertEqual(backend.coordinate_space, "physical")
        self.assertIn("uipi_may_block", backend.default_caveats)

    def test_linux_uses_physical_space(self):
        backend = build_backend(
            {"platform": "linux", "injection": True, "caveats": []}
        )
        self.assertEqual(backend.coordinate_space, "physical")

    def test_injection_unavailable_raises(self):
        with self.assertRaises(ComputerControlError) as ctx:
            build_backend(
                {"platform": "linux", "injection": False, "degradation_reason": "Wayland"}
            )
        self.assertEqual(ctx.exception.code, "injection_unavailable")


class _FakeMouseController:
    def __init__(self):
        self.position = (0, 0)
        self.events = []

    def click(self, button, count):
        self.events.append(("click", button, count))

    def press(self, button):
        self.events.append(("press", button))

    def release(self, button):
        self.events.append(("release", button))

    def scroll(self, dx, dy):
        self.events.append(("scroll", dx, dy))


class _FakeKeyboardController:
    def __init__(self):
        self.events = []

    def type(self, text):
        self.events.append(("type", text))

    def press(self, key):
        self.events.append(("press", key))

    def release(self, key):
        self.events.append(("release", key))


def _fake_pynput_module():
    mouse_mod = types.ModuleType("pynput.mouse")
    keyboard_mod = types.ModuleType("pynput.keyboard")
    pynput_mod = types.ModuleType("pynput")

    fake_mouse = _FakeMouseController()
    fake_keyboard = _FakeKeyboardController()

    mouse_mod.Controller = lambda: fake_mouse
    mouse_mod.Button = types.SimpleNamespace(left="LEFT", right="RIGHT", middle="MIDDLE")
    keyboard_mod.Controller = lambda: fake_keyboard
    keyboard_mod.Key = types.SimpleNamespace(ctrl="KEY_CTRL", enter="KEY_ENTER")

    pynput_mod.mouse = mouse_mod
    pynput_mod.keyboard = keyboard_mod
    return pynput_mod, mouse_mod, keyboard_mod, fake_mouse, fake_keyboard


class PynputBackendAdapterTests(unittest.TestCase):
    """Exercise the pynput adapter layer with a fake pynput injected into
    sys.modules — no real display / no real input events."""

    def _install_fake(self):
        pynput_mod, mouse_mod, keyboard_mod, fm, fk = _fake_pynput_module()
        patcher = mock.patch.dict(
            sys.modules,
            {
                "pynput": pynput_mod,
                "pynput.mouse": mouse_mod,
                "pynput.keyboard": keyboard_mod,
            },
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        return fm, fk

    def test_move_and_click_wire_to_pynput(self):
        fm, _fk = self._install_fake()
        backend = PynputBackend(coordinate_space="physical")
        backend.dispatch("left_click", coordinate=[100, 200])
        self.assertEqual(fm.position, (100, 200))
        self.assertIn(("click", "LEFT", 1), fm.events)

    def test_key_combo_resolves_special_and_char(self):
        _fm, fk = self._install_fake()
        backend = PynputBackend()
        backend.dispatch("key", text="ctrl+enter")
        # press ctrl, press enter, release enter, release ctrl
        self.assertEqual(
            fk.events,
            [
                ("press", "KEY_CTRL"),
                ("press", "KEY_ENTER"),
                ("release", "KEY_ENTER"),
                ("release", "KEY_CTRL"),
            ],
        )

    def test_type_wires_to_keyboard(self):
        _fm, fk = self._install_fake()
        backend = PynputBackend()
        backend.dispatch("type", text="hi")
        self.assertIn(("type", "hi"), fk.events)

    def test_char_key_passes_through_as_string(self):
        _fm, fk = self._install_fake()
        backend = PynputBackend()
        backend.dispatch("key", text="a")
        self.assertEqual(fk.events, [("press", "a"), ("release", "a")])

    def test_unknown_special_key_raises(self):
        self._install_fake()
        backend = PynputBackend()
        # "tab" is a valid keymap token but the fake Key namespace lacks it,
        # so the adapter must raise a structured error rather than AttributeError.
        with self.assertRaises(ComputerControlError) as ctx:
            backend.dispatch("key", text="tab")
        self.assertEqual(ctx.exception.code, "unknown_key")

    def test_drag_press_move_release_order(self):
        fm, _fk = self._install_fake()
        backend = PynputBackend(coordinate_space="physical")
        backend.dispatch("left_click_drag", start_coordinate=[0, 0], coordinate=[50, 60])
        self.assertEqual(fm.position, (50, 60))
        self.assertEqual(
            [e for e in fm.events if e[0] in ("press", "release")],
            [("press", "LEFT"), ("release", "LEFT")],
        )


if __name__ == "__main__":
    unittest.main()
