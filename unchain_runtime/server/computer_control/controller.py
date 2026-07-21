from __future__ import annotations

from typing import Any, Dict, Optional

from .backends import InjectionBackend, build_backend
from .capabilities import get_capabilities
from .coordinates import ScaleMap
from .errors import ComputerControlError
from .screenshot import DEFAULT_MAX_LONG_EDGE, ScreenshotResult, capture_screenshot


class ComputerController:
    """Thin facade tying screenshot + capabilities + injection together.

    Pure library object: no Flask, no unchain_adapter import. C2 consumes this
    (or the individual submodules) when wiring the tool into the agent. The
    backend is built lazily so importing / constructing the controller never
    touches pynput or the display.
    """

    def __init__(self, capabilities: Optional[Dict[str, Any]] = None) -> None:
        self._capabilities = capabilities
        self._backend: Optional[InjectionBackend] = None
        self._last_scale_map: Optional[ScaleMap] = None

    def capabilities(self, refresh: bool = False) -> Dict[str, Any]:
        if self._capabilities is None or refresh:
            self._capabilities = get_capabilities()
        return self._capabilities

    def screenshot(
        self, max_long_edge: int = DEFAULT_MAX_LONG_EDGE
    ) -> ScreenshotResult:
        caps = self.capabilities()
        if not caps.get("screenshot"):
            reason = caps.get("degradation_reason") or "screenshot unavailable"
            raise ComputerControlError("screenshot_unavailable", reason, 400)
        result = capture_screenshot(max_long_edge=max_long_edge)
        self._last_scale_map = result.scale_map
        return result

    def _get_backend(self) -> InjectionBackend:
        if self._backend is None:
            self._backend = build_backend(self.capabilities())
        return self._backend

    def act(
        self,
        action: str,
        *,
        scale_map: Optional[ScaleMap] = None,
        **params: Any,
    ) -> Dict[str, Any]:
        """Execute one injection action in MODEL coordinate space.

        ``scale_map`` defaults to the one from the most recent ``screenshot()``
        call; callers that manage their own screenshots should pass it
        explicitly so coordinates map correctly.
        """
        backend = self._get_backend()
        effective_map = scale_map if scale_map is not None else self._last_scale_map
        return backend.dispatch(action, scale_map=effective_map, **params)

    def release_all(self) -> None:
        """Release any held keys/buttons after a batch or execution failure."""
        if self._backend is not None:
            self._backend.release_all()
