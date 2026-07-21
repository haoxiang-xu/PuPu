from __future__ import annotations

import math
import time
from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from ..actions import (
    ACTIONS,
    CLICK_BUTTON_BY_ACTION,
    CLICK_COUNT_BY_ACTION,
    COORDINATE_ACTIONS,
    SCROLL_DIRECTIONS,
)
from ..coordinates import ScaleMap
from ..errors import ComputerControlError
from ..keymap import KeyToken, resolve_combo

# Default scroll step (in injection scroll "clicks") applied per scroll_amount
# unit. pynput's scroll is in notches; 1 notch per amount unit is a sane base.
_SCROLL_STEP = 1


class InjectionBackend(ABC):
    """Platform-agnostic dispatch layer over a small set of injection
    primitives. Subclasses implement only the primitives; the action vocabulary,
    coordinate mapping, and result envelope live here so they stay identical
    across platforms.

    ``coordinate_space`` declares which space this backend injects in
    ("logical" on macOS/CGEvent, "physical" elsewhere); the base layer converts
    model-space coordinates accordingly via the supplied :class:`ScaleMap`.
    """

    coordinate_space: str = "physical"
    default_caveats: Tuple[str, ...] = ()

    # --- primitives implemented by subclasses ------------------------------
    @abstractmethod
    def _move_to(self, x: float, y: float) -> None: ...

    @abstractmethod
    def _click(self, button: str, count: int) -> None: ...

    @abstractmethod
    def _drag(self, x1: float, y1: float, x2: float, y2: float, button: str) -> None: ...

    @abstractmethod
    def _scroll(self, dx: float, dy: float) -> None: ...

    @abstractmethod
    def _type_text(self, text: str) -> None: ...

    @abstractmethod
    def _press_combo(self, tokens: Sequence[KeyToken]) -> None: ...

    @abstractmethod
    def _cursor_position(self) -> Tuple[float, float]: ...

    def _drag_path(self, points: Sequence[Tuple[float, float]], button: str) -> None:
        """Default path adapter for backends that only implement start/end."""
        if len(points) < 2:
            raise ComputerControlError("invalid_drag", "drag path needs two points", 400)
        self._drag(*points[0], *points[-1], button)

    def _press_key(self, token: KeyToken) -> None:
        raise ComputerControlError(
            "input_state_unsupported", "held keyboard input is unavailable", 400
        )

    def _release_key(self, token: KeyToken) -> None:
        raise ComputerControlError(
            "input_state_unsupported", "held keyboard input is unavailable", 400
        )

    def _mouse_button(self, button: str, pressed: bool) -> None:
        raise ComputerControlError(
            "input_state_unsupported", "held mouse input is unavailable", 400
        )

    def release_all(self) -> None:
        """Best-effort emergency release; stateful backends override this."""
        return None

    # --- helpers -----------------------------------------------------------
    @staticmethod
    def _require_coordinate(coordinate: Any) -> Tuple[float, float]:
        if (
            not isinstance(coordinate, (list, tuple))
            or len(coordinate) != 2
        ):
            raise ComputerControlError(
                "invalid_coordinate",
                "coordinate must be a [x, y] pair in model-image pixels",
                400,
            )
        try:
            return float(coordinate[0]), float(coordinate[1])
        except (TypeError, ValueError) as exc:
            raise ComputerControlError(
                "invalid_coordinate", f"non-numeric coordinate: {coordinate!r}", 400
            ) from exc

    def _to_injection(
        self, scale_map: Optional[ScaleMap], mx: float, my: float
    ) -> Tuple[float, float]:
        if scale_map is None:
            # No scale map -> coordinates are assumed already in injection space
            # (useful for tests and for callers that pre-mapped).
            return float(mx), float(my)
        return scale_map.model_to_injection(mx, my, self.coordinate_space)

    def _envelope(
        self, action: str, result: Any = None, extra_caveats: Sequence[str] = ()
    ) -> Dict[str, Any]:
        caveats: List[str] = list(self.default_caveats)
        for caveat in extra_caveats:
            if caveat not in caveats:
                caveats.append(caveat)
        envelope: Dict[str, Any] = {
            "ok": True,
            "action": action,
            "coordinate_space": self.coordinate_space,
            "caveats": caveats,
        }
        if result is not None:
            envelope["result"] = result
        return envelope

    @staticmethod
    def _resolve_keys(keys: Any) -> List[KeyToken]:
        if keys is None:
            return []
        if isinstance(keys, str):
            combo = keys
        elif isinstance(keys, (list, tuple)):
            combo = "+".join(str(key) for key in keys if str(key).strip())
        else:
            raise ComputerControlError("invalid_keys", "keys must be an array", 400)
        return resolve_combo(combo) if combo else []

    def _with_modifiers(self, keys: Any, operation: Callable[[], None]) -> None:
        tokens = self._resolve_keys(keys)
        pressed: List[KeyToken] = []
        try:
            for token in tokens:
                self._press_key(token)
                pressed.append(token)
            operation()
        finally:
            for token in reversed(pressed):
                try:
                    self._release_key(token)
                except Exception:
                    pass

    # --- dispatch ----------------------------------------------------------
    def dispatch(
        self,
        action: str,
        *,
        coordinate: Any = None,
        start_coordinate: Any = None,
        text: Optional[str] = None,
        scroll_direction: Optional[str] = None,
        scroll_amount: Optional[int] = None,
        scroll_x: Optional[float] = None,
        scroll_y: Optional[float] = None,
        path: Any = None,
        keys: Any = None,
        button: Optional[str] = None,
        pressed: Optional[bool] = None,
        duration: Optional[float] = None,
        scale_map: Optional[ScaleMap] = None,
    ) -> Dict[str, Any]:
        """Execute one action. Coordinates are in MODEL-image pixel space and are
        mapped to this backend's injection space via ``scale_map``."""
        if action not in ACTIONS:
            raise ComputerControlError(
                "unsupported_action", f"unsupported action: {action!r}", 400
            )

        if action in COORDINATE_ACTIONS and coordinate is None:
            raise ComputerControlError(
                "invalid_coordinate", f"action {action!r} requires a coordinate", 400
            )

        if action == "move":
            mx, my = self._require_coordinate(coordinate)
            ix, iy = self._to_injection(scale_map, mx, my)
            self._with_modifiers(keys, lambda: self._move_to(ix, iy))
            return self._envelope(action)

        if action in CLICK_BUTTON_BY_ACTION:
            if coordinate is not None:
                mx, my = self._require_coordinate(coordinate)
                ix, iy = self._to_injection(scale_map, mx, my)
                self._move_to(ix, iy)
            button = CLICK_BUTTON_BY_ACTION[action]
            count = CLICK_COUNT_BY_ACTION[action]
            self._with_modifiers(keys, lambda: self._click(button, count))
            return self._envelope(action)

        if action == "left_click_drag":
            mx2, my2 = self._require_coordinate(coordinate)
            ix2, iy2 = self._to_injection(scale_map, mx2, my2)
            if start_coordinate is not None:
                mx1, my1 = self._require_coordinate(start_coordinate)
                ix1, iy1 = self._to_injection(scale_map, mx1, my1)
            else:
                ix1, iy1 = self._cursor_position()
            drag_button = str(button or "left")
            if isinstance(path, list) and len(path) >= 2:
                injection_points = []
                for raw_point in path:
                    mx, my = self._require_coordinate(raw_point)
                    injection_points.append(self._to_injection(scale_map, mx, my))
                self._with_modifiers(
                    keys,
                    lambda: self._drag_path(injection_points, drag_button),
                )
            else:
                self._with_modifiers(
                    keys,
                    lambda: self._drag(ix1, iy1, ix2, iy2, drag_button),
                )
            return self._envelope(action)

        if action == "type":
            if text is None:
                raise ComputerControlError(
                    "invalid_text", "type action requires text", 400
                )
            self._type_text(str(text))
            return self._envelope(action)

        if action == "key":
            if not text:
                raise ComputerControlError(
                    "invalid_text", "key action requires a key combo in text", 400
                )
            tokens = resolve_combo(text)
            self._press_combo(tokens)
            return self._envelope(action)

        if action == "hold_key":
            if not text:
                raise ComputerControlError(
                    "invalid_text", "hold_key requires a key combo in text", 400
                )
            tokens = resolve_combo(text)
            seconds = 1.0 if duration is None else float(duration)
            held: List[KeyToken] = []
            try:
                for token in tokens:
                    self._press_key(token)
                    held.append(token)
                time.sleep(seconds)
            finally:
                for token in reversed(held):
                    try:
                        self._release_key(token)
                    except Exception:
                        pass
            return self._envelope(action)

        if action == "mouse_button":
            mouse_button = str(button or "left")
            if not isinstance(pressed, bool):
                raise ComputerControlError(
                    "invalid_button_state", "mouse_button requires pressed boolean", 400
                )
            self._mouse_button(mouse_button, pressed)
            return self._envelope(action)

        if action == "scroll":
            if coordinate is not None:
                mx, my = self._require_coordinate(coordinate)
                ix, iy = self._to_injection(scale_map, mx, my)
                self._move_to(ix, iy)
            if scroll_x is not None or scroll_y is not None:
                raw_x = float(scroll_x or 0)
                raw_y = float(scroll_y or 0)
                dx = 0.0 if raw_x == 0 else math.copysign(max(1, round(abs(raw_x) / 100)), raw_x)
                # OpenAI screen coordinates use positive Y downward; pynput's
                # scroll primitive uses positive Y upward.
                dy = 0.0 if raw_y == 0 else -math.copysign(max(1, round(abs(raw_y) / 100)), raw_y)
            else:
                dx, dy = self._scroll_delta(scroll_direction, scroll_amount)
            self._with_modifiers(keys, lambda: self._scroll(dx, dy))
            return self._envelope(action)

        if action == "cursor_position":
            ix, iy = self._cursor_position()
            if scale_map is not None:
                mx, my = scale_map.injection_to_model(ix, iy, self.coordinate_space)
            else:
                mx, my = ix, iy
            return self._envelope(
                action, result={"x": round(mx), "y": round(my)}
            )

        # Should be unreachable given the ACTIONS guard above.
        raise ComputerControlError(
            "unsupported_action", f"no handler for action: {action!r}", 500
        )

    @staticmethod
    def _scroll_delta(
        scroll_direction: Optional[str], scroll_amount: Optional[int]
    ) -> Tuple[float, float]:
        if scroll_direction is None:
            raise ComputerControlError(
                "invalid_scroll", "scroll action requires scroll_direction", 400
            )
        if scroll_direction not in SCROLL_DIRECTIONS:
            raise ComputerControlError(
                "invalid_scroll",
                f"scroll_direction must be one of {sorted(SCROLL_DIRECTIONS)}",
                400,
            )
        amount = 1 if scroll_amount is None else int(scroll_amount)
        if amount < 0:
            raise ComputerControlError(
                "invalid_scroll", "scroll_amount must be >= 0", 400
            )
        magnitude = amount * _SCROLL_STEP
        if scroll_direction == "up":
            return 0.0, float(magnitude)
        if scroll_direction == "down":
            return 0.0, float(-magnitude)
        if scroll_direction == "left":
            return float(-magnitude), 0.0
        return float(magnitude), 0.0  # right
