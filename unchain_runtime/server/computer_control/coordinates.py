from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Tuple

# Coordinate spaces used across the module:
#
#   physical  — raw capture pixels from mss (what ``sct.grab`` returns). On a
#               macOS Retina display this is the full 2x pixel grid.
#   model     — the (possibly downsampled) screenshot pixels handed to the
#               model. Model tool-calls address points in THIS space, because
#               that is the image the model actually looked at.
#   logical   — OS "point" coordinates = physical / device_pixel_ratio. macOS
#               CGEvent (and therefore pynput on macOS) injects in this space.
#
# The mapping between them is a per-display affine transform. v1 handles the
# primary display only; ``physical_offset_*`` fields exist to keep the shape
# multi-display ready but are 0 for the primary display.

VALID_SPACES = ("physical", "logical")


def compute_target_size(
    width: int, height: int, max_long_edge: int | None
) -> Tuple[int, int, float]:
    """Return ``(target_w, target_h, scale)`` for downsampling to ``max_long_edge``.

    Pure function. Aspect ratio is preserved by scaling on the longest edge.
    ``scale`` is the nominal long-edge scale factor (<= 1.0). When no downsample
    is needed (or ``max_long_edge`` is falsy) the source size is returned with
    ``scale == 1.0``. The per-axis exact ratios live on :class:`ScaleMap`.
    """
    if width <= 0 or height <= 0:
        raise ValueError(f"invalid source size: {width}x{height}")
    long_edge = max(width, height)
    if not max_long_edge or max_long_edge <= 0 or long_edge <= max_long_edge:
        return width, height, 1.0
    scale = max_long_edge / long_edge
    target_w = max(1, round(width * scale))
    target_h = max(1, round(height * scale))
    return target_w, target_h, scale


@dataclass(frozen=True)
class ScaleMap:
    """Affine transform between physical / model / logical coordinate spaces
    for a single display.

    Stored as plain numbers so it survives JSON round-trips (C2/C3 will ship
    this alongside the screenshot so the model's coordinates can be mapped back
    to injection coordinates).
    """

    physical_width: int
    physical_height: int
    model_width: int
    model_height: int
    device_pixel_ratio: float = 1.0
    physical_offset_x: int = 0
    physical_offset_y: int = 0
    display_index: int = 1

    def __post_init__(self) -> None:
        if self.physical_width <= 0 or self.physical_height <= 0:
            raise ValueError("physical dimensions must be positive")
        if self.model_width <= 0 or self.model_height <= 0:
            raise ValueError("model dimensions must be positive")
        if self.device_pixel_ratio <= 0:
            raise ValueError("device_pixel_ratio must be positive")

    @property
    def scale_x(self) -> float:
        return self.model_width / self.physical_width

    @property
    def scale_y(self) -> float:
        return self.model_height / self.physical_height

    # --- model <-> physical ------------------------------------------------
    def model_to_physical(self, mx: float, my: float) -> Tuple[float, float]:
        px = self.physical_offset_x + mx / self.scale_x
        py = self.physical_offset_y + my / self.scale_y
        return px, py

    def physical_to_model(self, px: float, py: float) -> Tuple[float, float]:
        mx = (px - self.physical_offset_x) * self.scale_x
        my = (py - self.physical_offset_y) * self.scale_y
        return mx, my

    # --- physical <-> logical ---------------------------------------------
    def physical_to_logical(self, px: float, py: float) -> Tuple[float, float]:
        return px / self.device_pixel_ratio, py / self.device_pixel_ratio

    def logical_to_physical(self, lx: float, ly: float) -> Tuple[float, float]:
        return lx * self.device_pixel_ratio, ly * self.device_pixel_ratio

    # --- model <-> logical -------------------------------------------------
    def model_to_logical(self, mx: float, my: float) -> Tuple[float, float]:
        px, py = self.model_to_physical(mx, my)
        return self.physical_to_logical(px, py)

    def logical_to_model(self, lx: float, ly: float) -> Tuple[float, float]:
        px, py = self.logical_to_physical(lx, ly)
        return self.physical_to_model(px, py)

    # --- model <-> injection (space chosen by the platform backend) --------
    def model_to_injection(
        self, mx: float, my: float, coordinate_space: str
    ) -> Tuple[float, float]:
        if coordinate_space == "logical":
            return self.model_to_logical(mx, my)
        if coordinate_space == "physical":
            return self.model_to_physical(mx, my)
        raise ValueError(f"unknown coordinate space: {coordinate_space!r}")

    def injection_to_model(
        self, ix: float, iy: float, coordinate_space: str
    ) -> Tuple[float, float]:
        if coordinate_space == "logical":
            return self.logical_to_model(ix, iy)
        if coordinate_space == "physical":
            return self.physical_to_model(ix, iy)
        raise ValueError(f"unknown coordinate space: {coordinate_space!r}")

    def to_dict(self) -> dict:
        data = asdict(self)
        data["scale_x"] = self.scale_x
        data["scale_y"] = self.scale_y
        return data
