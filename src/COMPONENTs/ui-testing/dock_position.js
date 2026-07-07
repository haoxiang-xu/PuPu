export const DOCK_MARGIN = 6;

/**
 * Clamp a desired dock position so the panel stays fully inside `bounds`
 * with a `margin` gutter. `pos` null → null (caller uses the default anchor).
 */
export function clampDockPos(pos, bounds, dockSize, margin = DOCK_MARGIN) {
  if (!pos) return null;
  const maxX = Math.max(margin, bounds.width - dockSize.width - margin);
  const maxY = Math.max(margin, bounds.height - dockSize.height - margin);
  return {
    x: Math.min(Math.max(pos.x, margin), maxX),
    y: Math.min(Math.max(pos.y, margin), maxY),
  };
}
