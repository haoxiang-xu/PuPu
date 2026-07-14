from __future__ import annotations

from typing import Any, Mapping

from ..errors import ComputerControlError
from .base import InjectionBackend
from .pynput_backend import PynputBackend

# macOS CGEvent injects in logical ("point") coordinates; other platforms inject
# in physical pixels. The base layer uses this to pick the model->injection
# transform.
_LOGICAL_SPACE_PLATFORMS = {"macos"}


def build_backend(capabilities: Mapping[str, Any]) -> InjectionBackend:
    """Construct the injection backend for the current platform from a
    capabilities dict (see ``capabilities.get_capabilities``)."""
    if not capabilities.get("injection"):
        reason = capabilities.get("degradation_reason") or "injection unavailable"
        raise ComputerControlError("injection_unavailable", reason, 400)
    platform_key = capabilities.get("platform", "")
    space = "logical" if platform_key in _LOGICAL_SPACE_PLATFORMS else "physical"
    caveats = tuple(capabilities.get("caveats") or ())
    return PynputBackend(coordinate_space=space, default_caveats=caveats)


__all__ = ["InjectionBackend", "PynputBackend", "build_backend"]
