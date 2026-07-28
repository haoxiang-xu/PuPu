from __future__ import annotations

import os
import sys
from typing import Any, Callable, Dict, Mapping, Optional

from .actions import ACTIONS
from .screenshot import DEFAULT_MAX_LONG_EDGE

# Permission states. macOS is the only platform that gates screen capture /
# input injection behind per-app TCC grants; other platforms report
# ``not_applicable``.
PERM_GRANTED = "granted"
PERM_DENIED = "denied"
PERM_UNKNOWN = "unknown"
PERM_NOT_APPLICABLE = "not_applicable"

_WAYLAND_REASON = (
    "Wayland session detected: mss screen capture and pynput injection are "
    "unsupported under Wayland (compositor blocks raw capture/injection). "
    "A portal-based backend is planned for phase 2."
)
_HEADLESS_REASON = (
    "No X11 DISPLAY and no Wayland session detected (headless or unknown "
    "session); screen control is unavailable."
)


def detect_platform(platform_name: Optional[str] = None) -> str:
    """Normalise ``sys.platform`` to macos / windows / linux (or raw value)."""
    name = (platform_name if platform_name is not None else sys.platform).lower()
    if name.startswith("darwin"):
        return "macos"
    if name.startswith("win"):
        return "windows"
    if name.startswith("linux"):
        return "linux"
    return name


def detect_display_server(
    platform_key: str, env: Optional[Mapping[str, str]] = None
) -> str:
    """Detect the display server: quartz / windows / x11 / wayland / unknown."""
    environ = env if env is not None else os.environ
    if platform_key == "macos":
        return "quartz"
    if platform_key == "windows":
        return "windows"
    if platform_key == "linux":
        session = (environ.get("XDG_SESSION_TYPE") or "").strip().lower()
        if session == "wayland" or environ.get("WAYLAND_DISPLAY"):
            return "wayland"
        if session == "x11" or environ.get("DISPLAY"):
            return "x11"
        return "unknown"
    return "unknown"


# --- macOS permission probes (best-effort; independent for C3 reuse) -------


def _probe_screen_recording() -> str:
    try:
        import Quartz  # type: ignore  # noqa: WPS433

        preflight = getattr(Quartz, "CGPreflightScreenCaptureAccess", None)
        if callable(preflight):
            return PERM_GRANTED if preflight() else PERM_DENIED
    except Exception:
        pass
    return PERM_UNKNOWN


def _probe_accessibility() -> str:
    for module_name in ("HIServices", "ApplicationServices"):
        try:
            module = __import__(module_name)
            checker = getattr(module, "AXIsProcessTrusted", None)
            if callable(checker):
                return PERM_GRANTED if checker() else PERM_DENIED
        except Exception:
            continue
    return PERM_UNKNOWN


def get_permissions(
    platform_key: Optional[str] = None,
    probes: Optional[Mapping[str, Callable[[], str]]] = None,
) -> Dict[str, str]:
    """Return per-capability OS permission states.

    Designed as a standalone function so C3 can expose it over HTTP without
    pulling in the rest of the module. ``probes`` may inject fake probes for
    tests. On non-macOS platforms both entries are ``not_applicable``.
    """
    platform_key = platform_key or detect_platform()
    if platform_key != "macos":
        return {
            "screen_recording": PERM_NOT_APPLICABLE,
            "accessibility": PERM_NOT_APPLICABLE,
        }
    screen = (probes or {}).get("screen_recording", _probe_screen_recording)
    access = (probes or {}).get("accessibility", _probe_accessibility)
    return {"screen_recording": screen(), "accessibility": access()}


def get_capabilities(
    platform_name: Optional[str] = None,
    env: Optional[Mapping[str, str]] = None,
    probes: Optional[Mapping[str, Callable[[], str]]] = None,
) -> Dict[str, Any]:
    """Report structured screen-control capabilities and degradation reasons.

    Args are injectable so every branch (Wayland / X11 / macOS / Windows /
    headless) is unit-testable without touching the real platform.
    """
    platform_key = detect_platform(platform_name)
    display_server = detect_display_server(platform_key, env)

    screenshot = False
    injection = False
    degradation_reason: Optional[str] = None
    caveats: list = []

    if platform_key == "linux":
        if display_server == "wayland":
            degradation_reason = _WAYLAND_REASON
        elif display_server == "x11":
            screenshot = True
            injection = True
        else:
            degradation_reason = _HEADLESS_REASON
    elif platform_key == "macos":
        # Capability = the platform CAN do it; runtime TCC grants are reported
        # separately under ``permissions`` (a denied grant fails at call time).
        screenshot = True
        injection = True
    elif platform_key == "windows":
        screenshot = True
        injection = True
        # UIPI: injection into a higher-integrity window fails silently and
        # cannot be detected post-hoc. Surface it as a standing caveat so the
        # upper layer can attach it to tool results for the model.
        caveats.append("uipi_may_block")
    else:
        degradation_reason = f"unsupported platform: {platform_key}"

    permissions = get_permissions(platform_key, probes)

    return {
        "platform": platform_key,
        "display_server": display_server,
        "screenshot": screenshot,
        "injection": injection,
        "multi_display": False,  # v1: primary display only
        "degradation_reason": degradation_reason,
        "permissions": permissions,
        "caveats": caveats,
        "action_set": sorted(ACTIONS),
        "screenshot_max_long_edge": DEFAULT_MAX_LONG_EDGE,
    }
