"""Narrow clickclickclick-derived local planner/schema adapter.

Derived from instavm/clickclickclick at commit
e4ce8f958b4d7748a95af6d7201d1fa12ca5d2cb (MIT).  Only its planner guidance,
function-name mappings, and strict finder bounds convention are represented
here.  PuPu intentionally excludes its executor, server, autonomous loop,
PyAutoGUI/ADB code, and cloud provider clients.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional

LOCAL_PLANNER_PROMPT = (
    "Use screenshots to choose the next computer action. Re-check the screen "
    "after mutations, prefer small verifiable steps, and change approach "
    "instead of repeating a failed action. Use only the provided computer tool."
)

FINDER_PROMPT = (
    "Return only a UI bounding box as ymin,xmin,ymax,xmax. Return 0,0,0,0 "
    "when the requested element is not confidently visible."
)

CLICK3_ACTION_MAP = {
    "screenshot": "screenshot",
    "move_mouse": "move",
    "click_mouse": "click",
    "click_at_a_point": "click",
    "type_text": "type",
    "press_key": "keypress",
    "scroll_mouse": "scroll",
    "find_element": "locate",
    "find_element_and_click": "locate",
}

_BOUNDS_PATTERN = re.compile(
    r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*"
    r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$"
)


def parse_finder_bounds(value: Any) -> Optional[Dict[str, float]]:
    """Parse click3's ymin,xmin,ymax,xmax convention, fail closed."""
    if not isinstance(value, str):
        return None
    match = _BOUNDS_PATTERN.fullmatch(value)
    if match is None:
        return None
    ymin, xmin, ymax, xmax = (float(item) for item in match.groups())
    if (ymin, xmin, ymax, xmax) == (0.0, 0.0, 0.0, 0.0):
        return None
    if min(ymin, xmin) < 0 or ymax <= ymin or xmax <= xmin:
        return None
    return {"x": xmin, "y": ymin, "width": xmax - xmin, "height": ymax - ymin}


def local_computer_tool_schema() -> Dict[str, Any]:
    """Small Ollama function schema; execution still uses the PuPu protocol."""
    return {
        "type": "function",
        "function": {
            "name": "computer",
            "description": LOCAL_PLANNER_PROMPT,
            "parameters": {
                "type": "object",
                "properties": {
                    "actions": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 12,
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {
                                    "type": "string",
                                    "enum": [
                                        "screenshot", "wait", "move", "click",
                                        "drag", "type", "keypress", "hold_key",
                                        "mouse_button", "scroll", "locate",
                                    ],
                                },
                                "x": {"type": "number"},
                                "y": {"type": "number"},
                                "text": {"type": "string"},
                                "keys": {"type": "array", "items": {"type": "string"}},
                                "button": {"type": "string"},
                                "clicks": {"type": "integer"},
                                "duration": {"type": "number"},
                                "scroll_x": {"type": "number"},
                                "scroll_y": {"type": "number"},
                                "path": {"type": "array"},
                                "query": {"type": "string"},
                            },
                            "required": ["type"],
                        },
                    }
                },
                "required": ["actions"],
            },
        },
    }

