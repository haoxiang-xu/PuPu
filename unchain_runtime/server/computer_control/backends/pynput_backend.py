from __future__ import annotations

from typing import Sequence, Tuple

from ..errors import ComputerControlError
from ..keymap import KeyToken
from .base import InjectionBackend


class PynputBackend(InjectionBackend):
    """Injection backend built on pynput.

    pynput dispatches to the native APIs per platform (CGEvent on macOS,
    SendInput on Windows, XTest on X11). pynput is imported lazily so the module
    stays importable on headless CI and so unit tests can mock it. pynput is
    LGPL-3.0; it is used as a dynamic dependency only (never vendored).
    """

    def __init__(
        self,
        coordinate_space: str = "physical",
        default_caveats: Sequence[str] = (),
    ) -> None:
        self.coordinate_space = coordinate_space
        self.default_caveats = tuple(default_caveats)
        self._mouse = None
        self._keyboard = None
        self._Button = None
        self._Key = None
        self._held_buttons = []
        self._held_keys = []

    def _ensure(self) -> None:
        if self._mouse is not None:
            return
        try:
            from pynput import keyboard, mouse  # noqa: WPS433 (lazy import by design)
        except Exception as exc:  # pragma: no cover - import guard
            raise ComputerControlError(
                "injection_backend_unavailable",
                f"input injection library (pynput) unavailable: {exc}",
                500,
            ) from exc
        self._mouse = mouse.Controller()
        self._keyboard = keyboard.Controller()
        self._Button = mouse.Button
        self._Key = keyboard.Key

    def _button(self, name: str):
        button = getattr(self._Button, name, None)
        if button is None:
            raise ComputerControlError(
                "invalid_button", f"unsupported mouse button: {name!r}", 400
            )
        return button

    def _resolve_token(self, token: KeyToken):
        if token.kind == "special":
            key = getattr(self._Key, token.value, None)
            if key is None:
                raise ComputerControlError(
                    "unknown_key",
                    f"pynput has no key named {token.value!r}",
                    400,
                )
            return key
        return token.value  # printable character

    # --- primitives --------------------------------------------------------
    def _move_to(self, x: float, y: float) -> None:
        self._ensure()
        self._mouse.position = (int(round(x)), int(round(y)))

    def _click(self, button: str, count: int) -> None:
        self._ensure()
        self._mouse.click(self._button(button), count)

    def _drag(self, x1: float, y1: float, x2: float, y2: float, button: str) -> None:
        self._ensure()
        pressed = self._button(button)
        self._mouse.position = (int(round(x1)), int(round(y1)))
        self._mouse.press(pressed)
        try:
            self._mouse.position = (int(round(x2)), int(round(y2)))
        finally:
            self._mouse.release(pressed)

    def _drag_path(self, points, button: str) -> None:
        self._ensure()
        pressed = self._button(button)
        start_x, start_y = points[0]
        self._mouse.position = (int(round(start_x)), int(round(start_y)))
        self._mouse.press(pressed)
        try:
            for x, y in points[1:]:
                self._mouse.position = (int(round(x)), int(round(y)))
        finally:
            self._mouse.release(pressed)

    def _scroll(self, dx: float, dy: float) -> None:
        self._ensure()
        self._mouse.scroll(int(round(dx)), int(round(dy)))

    def _type_text(self, text: str) -> None:
        self._ensure()
        self._keyboard.type(text)

    def _press_combo(self, tokens: Sequence[KeyToken]) -> None:
        self._ensure()
        resolved = [self._resolve_token(token) for token in tokens]
        for key in resolved:
            self._keyboard.press(key)
        for key in reversed(resolved):
            self._keyboard.release(key)

    def _press_key(self, token: KeyToken) -> None:
        self._ensure()
        key = self._resolve_token(token)
        self._keyboard.press(key)
        self._held_keys.append(key)

    def _release_key(self, token: KeyToken) -> None:
        self._ensure()
        key = self._resolve_token(token)
        self._keyboard.release(key)
        for index in range(len(self._held_keys) - 1, -1, -1):
            if self._held_keys[index] == key:
                self._held_keys.pop(index)
                break

    def _mouse_button(self, button: str, pressed: bool) -> None:
        self._ensure()
        resolved = self._button(button)
        if pressed:
            self._mouse.press(resolved)
            self._held_buttons.append(resolved)
            return
        self._mouse.release(resolved)
        for index in range(len(self._held_buttons) - 1, -1, -1):
            if self._held_buttons[index] == resolved:
                self._held_buttons.pop(index)
                break

    def release_all(self) -> None:
        if self._mouse is None:
            return
        for key in reversed(self._held_keys):
            try:
                self._keyboard.release(key)
            except Exception:
                pass
        self._held_keys.clear()
        for button in reversed(self._held_buttons):
            try:
                self._mouse.release(button)
            except Exception:
                pass
        self._held_buttons.clear()

    def _cursor_position(self) -> Tuple[float, float]:
        self._ensure()
        x, y = self._mouse.position
        return float(x), float(y)
