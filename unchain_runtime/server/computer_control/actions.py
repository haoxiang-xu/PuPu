from __future__ import annotations

# Action vocabulary. This set is aligned with Anthropic's ``computer_20251124``
# action set and was frozen by the architect for the C1 slice (single-direction
# door): downstream layers (C2 wiring) must not rename or reinterpret these
# tokens. Any change to this vocabulary is a model-visible contract change and
# requires the LLM-expert / architect sign-off, not a backend edit.
ACTIONS = frozenset(
    {
        "move",
        "left_click",
        "right_click",
        "middle_click",
        "double_click",
        "triple_click",
        "left_click_drag",
        "type",
        "key",
        "scroll",
        "cursor_position",
    }
)

# Convenience groupings used by the dispatch layer.
CLICK_BUTTON_BY_ACTION = {
    "left_click": "left",
    "right_click": "right",
    "middle_click": "middle",
    "double_click": "left",
    "triple_click": "left",
}

CLICK_COUNT_BY_ACTION = {
    "left_click": 1,
    "right_click": 1,
    "middle_click": 1,
    "double_click": 2,
    "triple_click": 3,
}

# Actions whose semantics require an (x, y) coordinate in model-image space.
COORDINATE_ACTIONS = frozenset(
    {"move", "left_click_drag"}
)

# Actions that may optionally carry a coordinate (click-at vs click-here) and a
# scroll anchor.
COORDINATE_OPTIONAL_ACTIONS = frozenset(
    {
        "left_click",
        "right_click",
        "middle_click",
        "double_click",
        "triple_click",
        "scroll",
    }
)

SCROLL_DIRECTIONS = frozenset({"up", "down", "left", "right"})


def is_supported(action: str) -> bool:
    return action in ACTIONS
