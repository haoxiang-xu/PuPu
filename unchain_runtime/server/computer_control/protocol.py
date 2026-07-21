"""Provider-neutral Computer action protocol and fail-closed validation.

Provider adapters translate their wire vocabulary into this module.  The
controller never sees provider-specific action names, and provider adapters
never inject desktop input directly.
"""

from __future__ import annotations

import copy
import math
from typing import Any, Dict, Iterable, List, Optional

from .errors import ComputerControlError

SCHEMA = "pupu.computer.actions"
VERSION = 1
MAX_ACTIONS = 12
MAX_TYPE_CHARS = 8192
MAX_DRAG_POINTS = 64
MAX_DURATION_SECONDS = 5.0

READ_ONLY_ACTIONS = frozenset(
    {"screenshot", "wait", "cursor_position", "locate"}
)
SUPPORTED_ACTIONS = frozenset(
    {
        "screenshot",
        "wait",
        "move",
        "click",
        "drag",
        "type",
        "keypress",
        "hold_key",
        "mouse_button",
        "scroll",
        "cursor_position",
        "locate",
    }
)
COORDINATE_ACTIONS = frozenset({"move", "click", "drag", "scroll"})
MOUSE_BUTTONS = frozenset({"left", "middle", "right"})


def redact_sensitive_arguments(arguments: Any) -> Any:
    """Copy Computer arguments and remove text that would be typed.

    Execution always receives the original arguments; this helper is only for
    SSE, confirmation presentation, history compaction, and persistence.
    """
    if not isinstance(arguments, dict):
        return copy.deepcopy(arguments)
    redacted = copy.deepcopy(arguments)

    def redact_action(action: Any) -> None:
        if not isinstance(action, dict):
            return
        action_type = str(action.get("type") or action.get("action") or "").strip()
        if action_type not in {"type", "type_text"}:
            return
        text = action.get("text")
        if isinstance(text, str):
            action["text"] = f"[redacted {len(text)} chars]"

    redact_action(redacted)
    for action in redacted.get("actions") or []:
        redact_action(action)
    return redacted


def _point(value: Any, *, field: str) -> Dict[str, float]:
    if isinstance(value, dict):
        raw_x, raw_y = value.get("x"), value.get("y")
    elif isinstance(value, (list, tuple)) and len(value) >= 2:
        raw_x, raw_y = value[0], value[1]
    else:
        raise ComputerControlError(
            "invalid_coordinate", f"{field} must contain x and y", 400
        )
    try:
        x, y = float(raw_x), float(raw_y)
    except (TypeError, ValueError) as exc:
        raise ComputerControlError(
            "invalid_coordinate", f"{field} must contain numeric x and y", 400
        ) from exc
    if not math.isfinite(x) or not math.isfinite(y):
        raise ComputerControlError(
            "invalid_coordinate", f"{field} coordinates must be finite", 400
        )
    return {"x": x, "y": y}


def _keys(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        values: Iterable[Any] = [part for part in value.split("+") if part]
    elif isinstance(value, (list, tuple)):
        values = value
    else:
        raise ComputerControlError("invalid_keys", "keys must be an array", 400)
    normalized = [str(item).strip() for item in values if str(item).strip()]
    if len(normalized) > 16:
        raise ComputerControlError("invalid_keys", "at most 16 keys are allowed", 400)
    return normalized


def _legacy_action(arguments: Dict[str, Any]) -> Dict[str, Any]:
    action = str(arguments.get("action") or "").strip()
    coordinate = arguments.get("coordinate")
    start_coordinate = arguments.get("start_coordinate")
    keys = arguments.get("keys")
    if action == "mouse_move":
        action = "move"
    if action in {"left_click", "right_click", "middle_click"}:
        return {
            "type": "click",
            "button": action.removesuffix("_click"),
            "clicks": 1,
            "coordinate": coordinate,
            "keys": keys,
        }
    if action in {"double_click", "triple_click"}:
        return {
            "type": "click",
            "button": "left",
            "clicks": 2 if action == "double_click" else 3,
            "coordinate": coordinate,
            "keys": keys,
        }
    if action == "left_click_drag":
        path = []
        if start_coordinate is not None:
            path.append(start_coordinate)
        if coordinate is not None:
            path.append(coordinate)
        return {"type": "drag", "path": path, "button": "left", "keys": keys}
    if action == "key":
        return {"type": "keypress", "keys": arguments.get("text")}
    if action == "left_mouse_down":
        return {"type": "mouse_button", "button": "left", "pressed": True}
    if action == "left_mouse_up":
        return {"type": "mouse_button", "button": "left", "pressed": False}
    if action == "hold_key":
        return {
            "type": "hold_key",
            "keys": arguments.get("text") or keys,
            "duration": arguments.get("duration"),
        }
    return {
        "type": action,
        "coordinate": coordinate,
        "text": arguments.get("text"),
        "scroll_direction": arguments.get("scroll_direction"),
        "scroll_amount": arguments.get("scroll_amount"),
        "duration": arguments.get("duration"),
        "keys": keys,
    }


def _normalize_action(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise ComputerControlError("invalid_action", "each action must be an object", 400)
    action_type = str(raw.get("type") or raw.get("action") or "").strip()
    if action_type == "double_click":
        action_type = "click"
        raw = {**raw, "clicks": 2}
    if action_type == "keypress":
        return {"type": "keypress", "keys": _keys(raw.get("keys"))}
    if action_type == "hold_key":
        return {
            "type": "hold_key",
            "keys": _keys(raw.get("keys") or raw.get("text")),
            "duration": raw.get("duration"),
        }
    if action_type == "mouse_button":
        return {
            "type": action_type,
            "button": str(raw.get("button") or "left").strip().lower(),
            "pressed": raw.get("pressed"),
        }
    if action_type == "drag":
        path = raw.get("path")
        if not isinstance(path, list):
            path = []
        return {
            "type": action_type,
            "path": [_point(point, field="path") for point in path],
            "button": str(raw.get("button") or "left").strip().lower(),
            "keys": _keys(raw.get("keys")),
        }
    coordinate = raw.get("coordinate")
    if coordinate is None and ("x" in raw or "y" in raw):
        coordinate = {"x": raw.get("x"), "y": raw.get("y")}
    action: Dict[str, Any] = {"type": action_type}
    if coordinate is not None:
        action["coordinate"] = _point(coordinate, field="coordinate")
    if action_type == "click":
        action["button"] = str(raw.get("button") or "left").strip().lower()
        action["clicks"] = raw.get("clicks", 1)
        action["keys"] = _keys(raw.get("keys"))
    elif action_type == "scroll":
        action["scroll_x"] = raw.get("scroll_x", raw.get("scrollX"))
        action["scroll_y"] = raw.get("scroll_y", raw.get("scrollY"))
        action["scroll_direction"] = raw.get("scroll_direction")
        action["scroll_amount"] = raw.get("scroll_amount")
        action["keys"] = _keys(raw.get("keys"))
    elif action_type == "type":
        action["text"] = raw.get("text")
        action["text_omitted"] = raw.get("text_omitted") is True
    elif action_type == "wait":
        action["duration"] = raw.get("duration")
    elif action_type == "locate":
        action["query"] = raw.get("query") or raw.get("text")
    elif action_type == "move":
        action["keys"] = _keys(raw.get("keys"))
    return action


def normalize_batch(arguments: Any) -> Dict[str, Any]:
    if not isinstance(arguments, dict):
        raise ComputerControlError("invalid_batch", "computer arguments must be an object", 400)
    provider = str(arguments.get("provider") or "anthropic").strip().lower()
    protocol = str(arguments.get("protocol") or "").strip()
    raw_actions = arguments.get("actions")
    if raw_actions is None:
        raw_actions = [_legacy_action(arguments)]
    if not isinstance(raw_actions, list) or not raw_actions:
        raise ComputerControlError("invalid_batch", "actions must be a non-empty array", 400)
    if len(raw_actions) > MAX_ACTIONS:
        raise ComputerControlError(
            "batch_too_large", f"at most {MAX_ACTIONS} actions are allowed", 400
        )
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "provider": provider,
        "protocol": protocol,
        "actions": [_normalize_action(action) for action in raw_actions],
    }


def validate_batch(
    batch: Dict[str, Any],
    *,
    width: int,
    height: int,
    has_screenshot: bool,
) -> Dict[str, Any]:
    screenshot_available = bool(has_screenshot)
    for index, action in enumerate(batch.get("actions") or []):
        action_type = str(action.get("type") or "")
        if action_type not in SUPPORTED_ACTIONS:
            raise ComputerControlError(
                "unsupported_action",
                f"action {index} has unsupported type {action_type!r}",
                400,
            )
        if action_type == "screenshot":
            screenshot_available = True
            continue
        if action_type in COORDINATE_ACTIONS and not screenshot_available:
            raise ComputerControlError(
                "screenshot_required",
                f"action {index} requires a prior screenshot",
                400,
            )
        points: List[Dict[str, float]] = []
        if isinstance(action.get("coordinate"), dict):
            points.append(action["coordinate"])
        if action_type == "drag":
            path = action.get("path") or []
            if not 2 <= len(path) <= MAX_DRAG_POINTS:
                raise ComputerControlError(
                    "invalid_drag",
                    f"drag path must contain 2-{MAX_DRAG_POINTS} points",
                    400,
                )
            points.extend(path)
        for point in points:
            x, y = point["x"], point["y"]
            if x < 0 or y < 0 or x >= width or y >= height:
                raise ComputerControlError(
                    "coordinate_out_of_bounds",
                    f"action {index} coordinate ({x:g}, {y:g}) is outside {width}x{height}",
                    400,
                )
        if action_type == "click":
            if action.get("button") not in MOUSE_BUTTONS:
                raise ComputerControlError("invalid_button", "unsupported mouse button", 400)
            try:
                clicks = int(action.get("clicks", 1))
            except (TypeError, ValueError) as exc:
                raise ComputerControlError("invalid_clicks", "clicks must be an integer", 400) from exc
            if clicks not in {1, 2, 3}:
                raise ComputerControlError("invalid_clicks", "clicks must be 1, 2, or 3", 400)
            action["clicks"] = clicks
        if action_type in {"drag", "mouse_button"} and action.get("button") not in MOUSE_BUTTONS:
            raise ComputerControlError("invalid_button", "unsupported mouse button", 400)
        if action_type == "mouse_button" and not isinstance(action.get("pressed"), bool):
            raise ComputerControlError("invalid_button_state", "pressed must be boolean", 400)
        if action_type == "type":
            if action.get("text_omitted") is True:
                raise ComputerControlError(
                    "sensitive_payload_expired",
                    "typed text is no longer available; request a fresh action",
                    409,
                )
            text = action.get("text")
            if not isinstance(text, str):
                raise ComputerControlError("invalid_text", "type requires text", 400)
            if len(text) > MAX_TYPE_CHARS:
                raise ComputerControlError(
                    "text_too_large", f"text exceeds {MAX_TYPE_CHARS} characters", 400
                )
        if action_type in {"keypress", "hold_key"} and not action.get("keys"):
            raise ComputerControlError("invalid_keys", f"{action_type} requires keys", 400)
        if action_type in {"wait", "hold_key"}:
            raw_duration = action.get("duration")
            duration = 1.0 if raw_duration is None else float(raw_duration)
            if not math.isfinite(duration) or duration < 0 or duration > MAX_DURATION_SECONDS:
                raise ComputerControlError(
                    "invalid_duration",
                    f"duration must be between 0 and {MAX_DURATION_SECONDS:g} seconds",
                    400,
                )
            action["duration"] = duration
        if action_type == "locate":
            query = action.get("query")
            if not isinstance(query, str) or not query.strip():
                raise ComputerControlError("invalid_query", "locate requires a query", 400)
            if len(query) > 512:
                raise ComputerControlError("invalid_query", "locate query is too long", 400)
    return batch


def batch_requires_confirmation(batch: Dict[str, Any]) -> bool:
    return any(
        str(action.get("type") or "") not in READ_ONLY_ACTIONS
        for action in batch.get("actions") or []
    )


__all__ = [
    "MAX_ACTIONS",
    "READ_ONLY_ACTIONS",
    "SCHEMA",
    "SUPPORTED_ACTIONS",
    "VERSION",
    "batch_requires_confirmation",
    "normalize_batch",
    "validate_batch",
]
