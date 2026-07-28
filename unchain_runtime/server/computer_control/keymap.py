from __future__ import annotations

from dataclasses import dataclass
from typing import List

from .errors import ComputerControlError

# Maps xdotool-style key names (the naming convention Anthropic's computer-use
# action set uses for the ``key`` action, e.g. "Return", "ctrl+s") onto pynput
# ``keyboard.Key`` *attribute names*. Keeping this table free of any pynput
# import makes it a pure, fully-testable normalisation layer; the backend does
# the final ``getattr(Key, name)`` at injection time.
#
# Lookup is case-insensitive; both xdotool ("Return", "Page_Up") and casual
# ("enter", "pageup") spellings are accepted.
_SPECIAL_KEYS = {
    "return": "enter",
    "enter": "enter",
    "kp_enter": "enter",
    "tab": "tab",
    "space": "space",
    "backspace": "backspace",
    "delete": "delete",
    "del": "delete",
    "escape": "esc",
    "esc": "esc",
    "up": "up",
    "down": "down",
    "left": "left",
    "right": "right",
    "home": "home",
    "end": "end",
    "page_up": "page_up",
    "pageup": "page_up",
    "prior": "page_up",
    "page_down": "page_down",
    "pagedown": "page_down",
    "next": "page_down",
    "insert": "insert",
    "ctrl": "ctrl",
    "control": "ctrl",
    "ctrl_l": "ctrl",
    "ctrl_r": "ctrl_r",
    "alt": "alt",
    "alt_l": "alt",
    "alt_r": "alt_r",
    "option": "alt",
    "shift": "shift",
    "shift_l": "shift",
    "shift_r": "shift_r",
    "super": "cmd",
    "super_l": "cmd",
    "cmd": "cmd",
    "command": "cmd",
    "win": "cmd",
    "meta": "cmd",
    "capslock": "caps_lock",
    "caps_lock": "caps_lock",
    "menu": "menu",
    "print": "print_screen",
    "printscreen": "print_screen",
    "scroll_lock": "scroll_lock",
    "num_lock": "num_lock",
    "pause": "pause",
    "media_play_pause": "media_play_pause",
    "media_volume_up": "media_volume_up",
    "media_volume_down": "media_volume_down",
    "media_volume_mute": "media_volume_mute",
}

# Function keys F1..F20.
for _i in range(1, 21):
    _SPECIAL_KEYS[f"f{_i}"] = f"f{_i}"


@dataclass(frozen=True)
class KeyToken:
    """A resolved key: either a pynput ``Key`` attribute name (``special``) or a
    literal printable character (``char``)."""

    kind: str  # "special" | "char"
    value: str


def resolve_key(name: str) -> KeyToken:
    """Resolve a single xdotool-style key name to a :class:`KeyToken`.

    Raises :class:`ComputerControlError` with code ``unknown_key`` for names
    that are neither a recognised special key nor a single printable character.
    """
    if name is None:
        raise ComputerControlError("unknown_key", "key name is required", 400)
    raw = str(name).strip()
    if not raw:
        raise ComputerControlError("unknown_key", "key name is empty", 400)
    low = raw.lower()
    if low in _SPECIAL_KEYS:
        return KeyToken("special", _SPECIAL_KEYS[low])
    if len(raw) == 1:
        # Single printable character; preserve case so "A" != "a".
        return KeyToken("char", raw)
    raise ComputerControlError(
        "unknown_key", f"unrecognized key name: {raw!r}", 400
    )


def resolve_combo(combo: str) -> List[KeyToken]:
    """Resolve a "+"-joined chord (e.g. ``"ctrl+shift+s"``) to ordered tokens.

    Modifiers come first in the string and are pressed in order, then released
    in reverse by the backend. A lone ``"+"`` is treated as the plus character.
    """
    if combo is None:
        raise ComputerControlError("unknown_key", "key combo is required", 400)
    text = str(combo).strip()
    if not text:
        raise ComputerControlError("unknown_key", "key combo is empty", 400)
    if text == "+":
        return [resolve_key("+")]
    parts = [part for part in text.split("+") if part != ""]
    if not parts:
        raise ComputerControlError(
            "unknown_key", f"no keys in combo: {combo!r}", 400
        )
    return [resolve_key(part) for part in parts]
