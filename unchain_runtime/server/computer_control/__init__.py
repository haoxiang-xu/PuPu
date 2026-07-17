"""computer_control — the GUI "hand" for PuPu's computer-use feature.

Pure sidecar library: screen capture, keyboard/mouse injection, and coordinate
mapping. This package intentionally has NO Flask routes and does NOT import
``unchain_adapter``; C2 wires it into the agent, C3 adds permission UX.

Public surface (see individual modules for details):

  capabilities:
    get_capabilities() -> dict      structured screenshot/injection capability
    get_permissions()  -> dict      standalone OS permission probe (C3 reuse)

  screenshot:
    capture_screenshot() -> ScreenshotResult   PNG bytes + ScaleMap

  coordinates:
    ScaleMap                        physical<->model<->logical affine transform
    compute_target_size()           downsample math (pure)

  actions / keymap:
    ACTIONS                         frozen computer_20251124 action vocabulary
    resolve_combo()                 xdotool-style key names -> pynput tokens

  backends / controller:
    build_backend(caps)             platform injection backend
    ComputerController              screenshot + capabilities + injection facade
"""

from __future__ import annotations

from .actions import ACTIONS, is_supported
from .backends import InjectionBackend, PynputBackend, build_backend
from .capabilities import (
    PERM_DENIED,
    PERM_GRANTED,
    PERM_NOT_APPLICABLE,
    PERM_UNKNOWN,
    detect_display_server,
    detect_platform,
    get_capabilities,
    get_permissions,
)
from .controller import ComputerController
from .coordinates import ScaleMap, compute_target_size
from .errors import ComputerControlError
from .keymap import KeyToken, resolve_combo, resolve_key
from .screenshot import (
    DEFAULT_MAX_LONG_EDGE,
    ScreenshotResult,
    capture_screenshot,
    detect_device_pixel_ratio,
)

__all__ = [
    "ACTIONS",
    "is_supported",
    "get_capabilities",
    "get_permissions",
    "detect_platform",
    "detect_display_server",
    "PERM_GRANTED",
    "PERM_DENIED",
    "PERM_UNKNOWN",
    "PERM_NOT_APPLICABLE",
    "capture_screenshot",
    "detect_device_pixel_ratio",
    "ScreenshotResult",
    "DEFAULT_MAX_LONG_EDGE",
    "ScaleMap",
    "compute_target_size",
    "resolve_key",
    "resolve_combo",
    "KeyToken",
    "InjectionBackend",
    "PynputBackend",
    "build_backend",
    "ComputerController",
    "ComputerControlError",
]
