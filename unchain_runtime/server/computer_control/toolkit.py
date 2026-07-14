"""ComputerToolkit — the C2 wiring that exposes the C1 GUI "hand" as an unchain
agent tool.

This module is the ONLY file in ``computer_control`` that imports ``unchain``.
The rest of the package is a pure driver (C1) with no agent-framework coupling;
keep it that way — do not add ``from .toolkit import ...`` to ``__init__.py`` or
C1's unchain-free guarantee (and its tests in unchain-less environments) break.

What C2 does:
  * declares a single ``computer`` tool whose Anthropic wire shape is the native
    ``computer_20251124`` predefined tool (S1: ``provider_native_specs`` +
    ``required_betas``), so the model drives it with Anthropic's own action
    vocabulary rather than a generic function schema;
  * dispatches each action to :class:`ComputerController` (C1);
  * returns the screenshot as an S0 ``content_blocks`` image (+ a text block
    describing the coordinate space and caveats), and every other action as a
    structured text result carrying the C1 caveat envelope;
  * keeps the screenshot ScaleMap on the controller so the "screenshot → click"
    loop maps coordinates correctly.

Coordinate-space contract (frozen by the architect, see [[computer-control-module]]):
model coordinates == the pixels of the screenshot handed to the model. The
declared ``display_width_px`` / ``display_height_px`` are pinned to those exact
model dimensions at construction via a no-grab geometry probe, and every
screenshot is captured with the same long-edge budget, so declared == returned
for all real coordinate actions (proof in ``_resolve_display_dims``).
"""

from __future__ import annotations

import base64
import time
from typing import Any, Dict, List, Optional

from unchain.tools.tool import Tool
from unchain.tools.toolkit import Toolkit

from .actions import ACTIONS
from .controller import ComputerController
from .coordinates import compute_target_size
from .screenshot import DEFAULT_MAX_LONG_EDGE

# ── provider-native contract literals (architect-frozen, S1) ────────────────
# The Anthropic predefined computer tool. The model that sees this emits
# Anthropic's ``computer_20251124`` action vocabulary — NOT the C1 internal
# ``actions.ACTIONS`` names — so ``_normalize_action`` below translates.
_ANTHROPIC_COMPUTER_TOOL_TYPE = "computer_20251124"
_ANTHROPIC_COMPUTER_BETA = "computer-use-2025-11-24"
_TOOL_NAME = "computer"

# Fallback declared dimensions when the no-grab geometry probe fails on a
# screenshot-capable platform (rare — mss display enumeration needs no Screen
# Recording grant, and screenshot-incapable platforms don't declare the native
# spec at all). Documented degraded case: declared may not match the first
# screenshot's exact size.
_FALLBACK_DIMS = (1280, 800)

# ── action-name translation: Anthropic wire vocabulary → C1 ACTIONS ─────────
# The exact ``computer_20251124`` action names are a provider contract and their
# mapping is model-visible; pupu-llm-expert holds the authority. This layer is
# deliberately tolerant of BOTH Anthropic's names and the C1 names so it works
# regardless of the precise wire spelling. "screenshot"/"wait" are handled
# specially; everything not resolvable to an ACTIONS token is reported as an
# unsupported action (the model adapts) rather than raising.
_SPECIAL_ACTIONS = frozenset({"screenshot", "wait"})
_ACTION_ALIASES = {
    "mouse_move": "move",
}
# Anthropic-facing supported actions, advertised to the model in the
# unsupported-action hint so it can self-correct in one shot. Uses the wire
# vocabulary the model actually emits (not C1's internal ACTIONS names).
_SUPPORTED_ACTION_HINT = (
    "screenshot, left_click, right_click, middle_click, double_click, "
    "triple_click, mouse_move, left_click_drag, type, key, scroll, wait"
)
# ``wait`` really sleeps the worker thread (blocking is normal tool behavior) so
# the model doesn't screenshot an un-settled UI while being told it "waited".
_WAIT_DEFAULT_SECONDS = 1.0
_WAIT_MAX_SECONDS = 5.0
# Params C1's backend.dispatch accepts (in MODEL coordinate space). Anything the
# model sends outside this set (e.g. ``duration``) is captured but not forwarded.
_DISPATCH_PARAMS = (
    "coordinate",
    "start_coordinate",
    "text",
    "scroll_direction",
    "scroll_amount",
)

# ── F1 confirmation gate (SEC-001 P0 /守-defined CRITICAL) ───────────────────
# Every action that writes to the real desktop (clicks, typing, key presses,
# scrolls, drags, cursor moves) MUST get an explicit server-side user
# confirmation before it is dispatched to the injection backend. This is
# enforced via unchain's per-call ``confirmation_resolver`` hook: the tool
# declares ``requires_confirmation=True`` (base), and the runtime ANDs that with
# the policy this resolver returns — so a policy can only NARROW confirmation to
# False, never widen False→True. We narrow to False ONLY for the read-only
# exempt actions below.
#
# ``_CONFIRMATION_EXEMPT_ACTIONS`` is an ALLOWLIST, deliberately (fail-closed):
# any action NOT listed here — every injection action, plus any unknown/future
# action name — keeps confirmation ON. The exempt membership and the
# human-readable summary shown to the user are a security-policy + model-visible
# surface: pupu-security-expert (守) and pupu-llm-expert hold authority over this
# list and the summary wording. Backend implements a fail-closed default; the
# exact set/wording is theirs to ratify.
_CONFIRMATION_EXEMPT_ACTIONS = frozenset({"screenshot", "wait", "cursor_position"})

# Click-family actions, used only to phrase the confirmation summary.
_CLICK_ACTIONS = frozenset(
    {"left_click", "right_click", "middle_click", "double_click", "triple_click"}
)
# Longest text preview embedded in the confirmation summary (keeps the frame small).
_CONFIRM_TEXT_PREVIEW_CHARS = 80


def _normalize_action(action: str) -> str:
    cleaned = str(action or "").strip()
    if cleaned in _SPECIAL_ACTIONS:
        return cleaned
    return _ACTION_ALIASES.get(cleaned, cleaned)


def _format_point(value: Any, *, fallback: str = "the screen") -> str:
    """Render an [x, y] coordinate for the confirmation summary, or a fallback."""
    if isinstance(value, (list, tuple)) and len(value) == 2:
        return f"({value[0]}, {value[1]})"
    return fallback


def _resolve_wait_seconds(duration: Any) -> float:
    try:
        seconds = float(duration) if duration is not None else _WAIT_DEFAULT_SECONDS
    except (TypeError, ValueError):
        seconds = _WAIT_DEFAULT_SECONDS
    if seconds < 0:
        seconds = 0.0
    return min(seconds, _WAIT_MAX_SECONDS)


def _probe_display_geometry(
    controller: ComputerController,
) -> Optional[tuple[int, int]]:
    """Best-effort primary-display size WITHOUT capturing pixels.

    Uses mss's monitor enumeration (``CGGetActiveDisplayList`` /
    ``CGDisplayBounds`` on macOS) which does NOT require a Screen Recording
    grant — only ``.grab()`` does. Returns logical (point) dimensions or None.
    Aspect ratio is DPR-invariant, and the exact model-image size is recovered
    by ``_resolve_display_dims`` regardless of logical-vs-physical, so this only
    needs to report the primary display's shape.
    """
    try:
        import mss  # noqa: WPS433 — lazy, enumeration only (no grab, no TCC)

        with mss.mss() as sct:
            monitors = sct.monitors
            # index 0 is the virtual "all monitors" box; index 1 is primary.
            monitor = monitors[1] if len(monitors) > 1 else monitors[0]
            width = int(monitor.get("width") or 0)
            height = int(monitor.get("height") or 0)
            if width > 0 and height > 0:
                return width, height
    except Exception:
        return None
    return None


class ComputerToolkit(Toolkit):
    """Single-tool builtin toolkit exposing the C1 GUI hand as ``computer``.

    Construction is cheap and side-effect-free with respect to the display: it
    probes capabilities (no grab) and enumerates monitor geometry (no grab). No
    screenshot — and therefore no TCC prompt — is taken until the model actually
    calls the ``screenshot`` action.
    """

    def __init__(
        self,
        *,
        controller: Optional[ComputerController] = None,
        max_long_edge: int = DEFAULT_MAX_LONG_EDGE,
    ) -> None:
        super().__init__()
        self._controller = controller if controller is not None else ComputerController()
        # capabilities() is a platform + permission probe; it does NOT grab.
        self._caps: Dict[str, Any] = self._controller.capabilities()

        display_w, display_h, budget = self._resolve_display_dims(max_long_edge)
        self._display_width = display_w
        self._display_height = display_h
        self._screenshot_budget = budget

        native_specs: Dict[str, Dict[str, Any]] = {}
        required_betas: Dict[str, List[str]] = {}
        # Only declare the Anthropic native computer tool when the platform can
        # actually screenshot. On Wayland/headless (screenshot=False) the tool
        # still registers, but as a generic schema that reports unavailability —
        # no wasted beta header, no misleading predefined tool.
        if self._caps.get("screenshot"):
            native_specs["anthropic"] = {
                "type": _ANTHROPIC_COMPUTER_TOOL_TYPE,
                "name": _TOOL_NAME,
                "display_width_px": display_w,
                "display_height_px": display_h,
            }
            required_betas["anthropic"] = [_ANTHROPIC_COMPUTER_BETA]

        tool = Tool.from_callable(
            self._computer,
            name=_TOOL_NAME,
            description=self._tool_description(),
            provider_native_specs=native_specs or None,
            required_betas=required_betas or None,
            # Keep the "hand" always present: the exposure optimizer must not
            # defer it, and a tool set that changes between turns busts the
            # provider prompt cache.
            always_load=True,
            # F1 hard gate: confirm every injection action before dispatch.
            # Base True + a narrowing per-call resolver (see _resolve_confirmation)
            # ⇒ read-only actions run directly, injection actions require an
            # explicit user confirmation. Fail-closed: unknown actions confirm.
            requires_confirmation=True,
            confirmation_resolver=self._resolve_confirmation,
        )
        self.register(tool)

    # ── capability / geometry helpers ──────────────────────────────────────
    def _resolve_display_dims(self, max_long_edge: int) -> tuple[int, int, int]:
        """Pin the declared model-image dimensions and the screenshot budget.

        Invariant (coordinate correctness): the declared dims MUST equal the
        model dimensions ``capture_screenshot`` produces, or the model's
        coordinates map through the wrong scale. We guarantee it by deriving both
        from the SAME long-edge budget.

        Let the probe give the primary display's logical size ``(lw, lh)`` with
        long edge ``L``. Set ``budget = min(L, max_long_edge)``. Because DPR ≥ 1,
        the physical long edge ``P ≥ L ≥ budget``, so:
          * declared = compute_target_size(lw, lh, budget) → long edge == budget
          * screenshot = compute_target_size(pw, ph, budget) → long edge == budget
        Both preserve the (identical) primary-display aspect ratio, so
        declared == screenshot dims exactly. Screenshots are therefore captured
        with ``max_long_edge=budget`` (NOT the raw default).
        """
        try:
            budget_cap = int(max_long_edge) if max_long_edge else DEFAULT_MAX_LONG_EDGE
        except (TypeError, ValueError):
            budget_cap = DEFAULT_MAX_LONG_EDGE
        if budget_cap <= 0:
            budget_cap = DEFAULT_MAX_LONG_EDGE

        geometry = _probe_display_geometry(self._controller)
        if geometry is None:
            probe_w, probe_h = _FALLBACK_DIMS
        else:
            probe_w, probe_h = geometry

        long_edge = max(probe_w, probe_h)
        budget = min(long_edge, budget_cap)
        target_w, target_h, _scale = compute_target_size(probe_w, probe_h, budget)
        return target_w, target_h, budget

    def _tool_description(self) -> str:
        if not self._caps.get("screenshot"):
            reason = self._caps.get("degradation_reason") or "unavailable on this platform"
            return (
                "Control the computer via screenshots and mouse/keyboard input. "
                f"Screen control is currently UNAVAILABLE: {reason}"
            )
        if not self._caps.get("injection"):
            return (
                "Observe the screen by taking screenshots. Input injection "
                "(clicks, typing, scrolling) is UNAVAILABLE on this platform — "
                "only the 'screenshot' action is supported."
            )
        return (
            "Control the computer: take a screenshot to see the screen, then move "
            "the mouse, click, type, press keys, and scroll. Coordinates are in "
            "the pixel space of the most recent screenshot."
        )

    # ── F1 confirmation resolver ─────────────────────────────────────────────
    def _resolve_confirmation(
        self,
        arguments: Any,
        execution_context: Any = None,
    ) -> Dict[str, Any]:
        """Per-call confirmation policy for the ``computer`` tool (F1 P0 gate).

        Returns a policy dict that unchain ANDs with the tool's base
        ``requires_confirmation=True``. Read-only exempt actions narrow to
        ``False`` (run directly); every injection action — and any unknown
        action name — keeps confirmation ON (fail-closed) and carries a
        human-readable summary of exactly what the model is about to do.

        Robustness: this runs inside unchain's confirmation layer, which treats
        a resolver that raises as a hard failure that aborts the call (the action
        never dispatches). A ``None`` return would also default to
        confirmation-required. So even a malformed ``arguments`` fails closed.
        """
        del execution_context  # policy depends only on the requested action
        action = ""
        if isinstance(arguments, dict):
            action = str(arguments.get("action") or "").strip()
        normalized = _normalize_action(action)
        if normalized in _CONFIRMATION_EXEMPT_ACTIONS:
            return {"requires_confirmation": False}
        return {
            "requires_confirmation": True,
            "description": self._describe_pending_action(normalized, arguments),
        }

    def _describe_pending_action(self, normalized: str, arguments: Any) -> str:
        """One-line, user-facing summary of the injection action awaiting consent.

        Coordinates are reported in the screenshot's pixel space (the same space
        the model sees), so the user can relate the request to what is on screen.
        """
        args = arguments if isinstance(arguments, dict) else {}
        coord_txt = _format_point(args.get("coordinate"))
        if normalized in _CLICK_ACTIONS:
            verb = normalized.replace("_", " ")
            return f"Model wants to {verb} at {coord_txt}."
        if normalized == "move":
            return f"Model wants to move the cursor to {coord_txt}."
        if normalized == "left_click_drag":
            start_txt = _format_point(args.get("start_coordinate"), fallback="the current position")
            return f"Model wants to drag from {start_txt} to {coord_txt}."
        if normalized == "type":
            text = str(args.get("text") or "")
            if len(text) > _CONFIRM_TEXT_PREVIEW_CHARS:
                text = text[: _CONFIRM_TEXT_PREVIEW_CHARS - 3] + "..."
            return f"Model wants to type: {text!r}"
        if normalized == "key":
            return f"Model wants to press the key combo {str(args.get('text') or '')!r}."
        if normalized == "scroll":
            direction = str(args.get("scroll_direction") or "").strip() or "?"
            amount = args.get("scroll_amount")
            return f"Model wants to scroll {direction} by {amount} at {coord_txt}."
        # Unknown / unsupported action name: still gated (fail-closed).
        raw = args.get("action") if isinstance(args, dict) else normalized
        return f"Model wants to run the computer action {str(raw)!r}."

    # ── the tool ───────────────────────────────────────────────────────────
    def _computer(
        self,
        action: str,
        coordinate: Optional[list] = None,
        text: Optional[str] = None,
        scroll_direction: Optional[str] = None,
        scroll_amount: Optional[int] = None,
        start_coordinate: Optional[list] = None,
        duration: Optional[float] = None,
        **_ignored: Any,
    ) -> Dict[str, Any]:
        """Execute one computer-control action.

        :param action: computer_20251124 action (e.g. screenshot, left_click,
            mouse_move, type, key, scroll, wait).
        :param coordinate: [x, y] in the current screenshot's pixel space.
        :param text: text to type, or key combo for the ``key`` action.
        :param scroll_direction: up / down / left / right (for ``scroll``).
        :param scroll_amount: number of scroll units (for ``scroll``).
        :param start_coordinate: [x, y] drag start (for ``left_click_drag``).
        :param duration: seconds to wait for the ``wait`` action (capped).
        """
        del _ignored  # extra wire keys accepted for forward-compat
        normalized = _normalize_action(action)

        if normalized == "screenshot":
            return self._do_screenshot(action)
        if normalized == "wait":
            # Really sleep so the UI can settle before the next screenshot; the
            # tool runs in a worker thread, so a short block is normal.
            seconds = _resolve_wait_seconds(duration)
            time.sleep(seconds)
            return self._text_result(action, f"waited {seconds:g}s", ok=True)

        if normalized not in ACTIONS:
            return self._text_result(
                action,
                f"unsupported action: {action!r}; supported: {_SUPPORTED_ACTION_HINT}",
                ok=False,
                extra_caveats=["unsupported_action"],
            )

        if not self._caps.get("injection"):
            reason = self._caps.get("degradation_reason") or (
                "input injection is unavailable on this platform (screenshot only)"
            )
            return self._text_result(
                action, reason, ok=False, extra_caveats=["injection_unavailable"]
            )

        params = {
            "coordinate": coordinate,
            "start_coordinate": start_coordinate,
            "text": text,
            "scroll_direction": scroll_direction,
            "scroll_amount": scroll_amount,
        }
        forward = {k: v for k, v in params.items() if k in _DISPATCH_PARAMS}

        extra_caveats: List[str] = []
        if self._controller._last_scale_map is None:  # noqa: SLF001 — intentional
            # No screenshot taken yet: coordinates cannot be mapped to the
            # display. Surface it rather than silently clicking the wrong place.
            extra_caveats.append("no_screenshot_taken")

        try:
            envelope = self._controller.act(normalized, **forward)
        except Exception as exc:  # C1 raises ComputerControlError with .message
            message = getattr(exc, "message", None) or str(exc)
            code = getattr(exc, "code", None) or type(exc).__name__
            return self._text_result(
                action, message, ok=False, extra_caveats=[str(code)]
            )

        if extra_caveats:
            merged = list(envelope.get("caveats") or [])
            for caveat in extra_caveats:
                if caveat not in merged:
                    merged.append(caveat)
            envelope["caveats"] = merged
        return envelope

    # ── result builders ────────────────────────────────────────────────────
    def _do_screenshot(self, action: str) -> Dict[str, Any]:
        if not self._caps.get("screenshot"):
            reason = self._caps.get("degradation_reason") or "screenshot unavailable"
            return self._text_result(
                action, reason, ok=False, extra_caveats=["screenshot_unavailable"]
            )
        try:
            result = self._controller.screenshot(max_long_edge=self._screenshot_budget)
        except Exception as exc:
            message = getattr(exc, "message", None) or str(exc)
            code = getattr(exc, "code", None) or type(exc).__name__
            return self._text_result(
                action, message, ok=False, extra_caveats=[str(code)]
            )

        data_b64 = base64.b64encode(result.png_bytes).decode("ascii")
        caveats = list(self._caps.get("caveats") or [])
        summary = (
            f"screenshot {result.model_width}x{result.model_height} px; "
            f"coordinates are in this image's pixel space"
        )
        if caveats:
            summary += f"; caveats: {', '.join(caveats)}"
        # Contract (DP2 + unchain messages.py + Anthropic guidance): text FIRST,
        # image SECOND.
        return {
            "content_blocks": [
                {"type": "text", "text": summary},
                {
                    "type": "image",
                    "media_type": "image/png",
                    "data_b64": data_b64,
                    "width": result.model_width,
                    "height": result.model_height,
                },
            ],
            "ok": True,
            "action": action,
            "coordinate_space": "model",
            "caveats": caveats,
        }

    def _text_result(
        self,
        action: str,
        message: str,
        *,
        ok: bool,
        extra_caveats: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        caveats = list(self._caps.get("caveats") or [])
        for caveat in extra_caveats or []:
            if caveat not in caveats:
                caveats.append(caveat)
        return {
            "ok": ok,
            "action": action,
            "coordinate_space": "model",
            "caveats": caveats,
            "result": message,
        }


__all__ = ["ComputerToolkit"]
