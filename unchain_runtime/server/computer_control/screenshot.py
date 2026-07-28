from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any, Dict, Tuple

from .coordinates import ScaleMap, compute_target_size
from .errors import ComputerControlError

# Default long-edge budget for the screenshot handed to the model. 1568px is the
# established target for current Claude computer-use models; newer models accept
# up to 2576px, hence ``max_long_edge`` is a caller-tunable parameter rather than
# a hard constant.
DEFAULT_MAX_LONG_EDGE = 1568

# The primary display is index 1 in mss (index 0 is the "all monitors" virtual
# bounding box). v1 captures the primary display only.
PRIMARY_DISPLAY_INDEX = 1


@dataclass
class ScreenshotResult:
    png_bytes: bytes
    scale_map: ScaleMap
    model_width: int
    model_height: int
    image_format: str = "png"

    def to_metadata(self) -> Dict[str, Any]:
        """JSON-safe description WITHOUT the raw bytes (for logs / envelopes)."""
        return {
            "image_format": self.image_format,
            "model_width": self.model_width,
            "model_height": self.model_height,
            "size_bytes": len(self.png_bytes),
            "scale_map": self.scale_map.to_dict(),
        }


def _import_mss():
    try:
        import mss  # noqa: WPS433 (lazy import by design)

        return mss
    except Exception as exc:  # pragma: no cover - import guard
        raise ComputerControlError(
            "screenshot_backend_unavailable",
            f"screen capture library (mss) unavailable: {exc}",
            500,
        ) from exc


def _grab_display(mss_module, display_index: int) -> Tuple[Dict[str, Any], Any]:
    """Grab a single display. Returns ``(monitor_dict, raw_pixels)``."""
    try:
        with mss_module.mss() as sct:
            monitors = sct.monitors
            if display_index < 0 or display_index >= len(monitors):
                raise ComputerControlError(
                    "screenshot_display_not_found",
                    f"display index {display_index} out of range "
                    f"(have {len(monitors) - 1} display(s))",
                    400,
                )
            monitor = dict(monitors[display_index])
            raw = sct.grab(monitor)
            return monitor, raw
    except ComputerControlError:
        raise
    except Exception as exc:
        # mss raises on missing Screen Recording permission (macOS) and on
        # Wayland; surface a stable code so callers can map to a permission
        # hint instead of a raw traceback.
        raise ComputerControlError(
            "screenshot_capture_failed",
            f"screen capture failed: {exc}",
            502,
        ) from exc


def detect_device_pixel_ratio(monitor_width: int, grabbed_width: int) -> float:
    """Best-effort DPR from the mss monitor geometry vs the grabbed pixel grid.

    mss reports the monitor size in the OS coordinate space while ``grab``
    returns physical pixels; on a Retina display the grabbed grid is 2x wider,
    giving DPR 2.0. Pure and clamped to >= 1.0.
    """
    if not monitor_width or monitor_width <= 0:
        return 1.0
    ratio = grabbed_width / monitor_width
    return round(ratio, 6) if ratio >= 1.0 else 1.0


def _encode_png(raw, target_width: int, target_height: int) -> bytes:
    """Downsample raw capture pixels to the model size and encode PNG.

    ``raw`` is an mss ScreenShot (exposes ``.rgb``, ``.width``, ``.height``).
    """
    try:
        from PIL import Image  # noqa: WPS433 (lazy import by design)
    except Exception as exc:  # pragma: no cover - import guard
        raise ComputerControlError(
            "screenshot_backend_unavailable",
            f"image library (Pillow) unavailable: {exc}",
            500,
        ) from exc

    image = Image.frombytes("RGB", (raw.width, raw.height), raw.rgb)
    if (target_width, target_height) != (raw.width, raw.height):
        image = image.resize((target_width, target_height), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def capture_screenshot(
    max_long_edge: int | None = DEFAULT_MAX_LONG_EDGE,
    display_index: int = PRIMARY_DISPLAY_INDEX,
) -> ScreenshotResult:
    """Capture the primary display, downsample to the model budget, and return
    PNG bytes plus a :class:`ScaleMap` describing the physical<->model<->logical
    transform.

    Multi-display is out of scope for v1; ``display_index`` other than the
    primary is accepted but capabilities report ``multi_display: False``.
    """
    mss_module = _import_mss()
    monitor, raw = _grab_display(mss_module, display_index)

    physical_width = int(raw.width)
    physical_height = int(raw.height)
    monitor_width = int(monitor.get("width") or physical_width)
    dpr = detect_device_pixel_ratio(monitor_width, physical_width)

    model_width, model_height, _scale = compute_target_size(
        physical_width, physical_height, max_long_edge
    )
    png_bytes = _encode_png(raw, model_width, model_height)

    scale_map = ScaleMap(
        physical_width=physical_width,
        physical_height=physical_height,
        model_width=model_width,
        model_height=model_height,
        device_pixel_ratio=dpr,
        # v1: primary display only -> origin at (0, 0).
        physical_offset_x=0,
        physical_offset_y=0,
        display_index=display_index,
    )
    return ScreenshotResult(
        png_bytes=png_bytes,
        scale_map=scale_map,
        model_width=model_width,
        model_height=model_height,
    )
