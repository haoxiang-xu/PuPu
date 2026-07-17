import sys
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from computer_control.errors import ComputerControlError  # noqa: E402
from computer_control.keymap import (  # noqa: E402
    KeyToken,
    resolve_combo,
    resolve_key,
)


class ResolveKeyTests(unittest.TestCase):
    def test_xdotool_return_maps_to_enter(self):
        self.assertEqual(resolve_key("Return"), KeyToken("special", "enter"))

    def test_case_insensitive_special(self):
        self.assertEqual(resolve_key("CTRL"), KeyToken("special", "ctrl"))
        self.assertEqual(resolve_key("ctrl"), KeyToken("special", "ctrl"))

    def test_super_and_cmd_map_to_cmd(self):
        self.assertEqual(resolve_key("super"), KeyToken("special", "cmd"))
        self.assertEqual(resolve_key("cmd"), KeyToken("special", "cmd"))
        self.assertEqual(resolve_key("command"), KeyToken("special", "cmd"))

    def test_page_up_variants(self):
        self.assertEqual(resolve_key("Page_Up"), KeyToken("special", "page_up"))
        self.assertEqual(resolve_key("prior"), KeyToken("special", "page_up"))

    def test_function_keys(self):
        self.assertEqual(resolve_key("F5"), KeyToken("special", "f5"))
        self.assertEqual(resolve_key("f20"), KeyToken("special", "f20"))

    def test_left_right_modifier_variants_preserved(self):
        self.assertEqual(resolve_key("ctrl_r"), KeyToken("special", "ctrl_r"))
        self.assertEqual(resolve_key("shift_r"), KeyToken("special", "shift_r"))

    def test_single_char_is_char_token_case_preserved(self):
        self.assertEqual(resolve_key("s"), KeyToken("char", "s"))
        self.assertEqual(resolve_key("A"), KeyToken("char", "A"))

    def test_unknown_multichar_raises_structured_error(self):
        with self.assertRaises(ComputerControlError) as ctx:
            resolve_key("frobnicate")
        self.assertEqual(ctx.exception.code, "unknown_key")
        self.assertEqual(ctx.exception.status, 400)

    def test_empty_and_none_raise(self):
        with self.assertRaises(ComputerControlError):
            resolve_key("")
        with self.assertRaises(ComputerControlError):
            resolve_key(None)


class ResolveComboTests(unittest.TestCase):
    def test_single_key(self):
        self.assertEqual(resolve_combo("Return"), [KeyToken("special", "enter")])

    def test_ctrl_s(self):
        self.assertEqual(
            resolve_combo("ctrl+s"),
            [KeyToken("special", "ctrl"), KeyToken("char", "s")],
        )

    def test_three_key_chord_order_preserved(self):
        self.assertEqual(
            resolve_combo("ctrl+shift+t"),
            [
                KeyToken("special", "ctrl"),
                KeyToken("special", "shift"),
                KeyToken("char", "t"),
            ],
        )

    def test_lone_plus_is_plus_char(self):
        self.assertEqual(resolve_combo("+"), [KeyToken("char", "+")])

    def test_unknown_member_raises(self):
        with self.assertRaises(ComputerControlError) as ctx:
            resolve_combo("ctrl+boguskey")
        self.assertEqual(ctx.exception.code, "unknown_key")

    def test_empty_combo_raises(self):
        with self.assertRaises(ComputerControlError):
            resolve_combo("")
        with self.assertRaises(ComputerControlError):
            resolve_combo(None)


if __name__ == "__main__":
    unittest.main()
