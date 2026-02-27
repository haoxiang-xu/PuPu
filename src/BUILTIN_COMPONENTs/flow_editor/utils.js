/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Flow Editor Utilities                                                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Default port configuration — one port on each side
 */
export const DEFAULT_PORTS = [
  { id: "top", side: "top" },
  { id: "right", side: "right" },
  { id: "bottom", side: "bottom" },
  { id: "left", side: "left" },
];

/**
 * Return the opposite side string
 */
export function opposite_side(side) {
  const map = { top: "bottom", bottom: "top", left: "right", right: "left" };
  return map[side] || "left";
}

/**
 * Calculate a port's position in canvas-space.
 *
 * @param {number} node_x   Node X
 * @param {number} node_y   Node Y
 * @param {number} width    Node width
 * @param {number} height   Node height
 * @param {string} side     "top" | "right" | "bottom" | "left"
 * @param {number} index    Index of this port among same-side ports
 * @param {number} total    Total ports on this side
 * @returns {{ x: number, y: number }}
 */
export function calculate_port_position(
  node_x,
  node_y,
  width,
  height,
  side,
  index,
  total,
) {
  const fraction = (index + 1) / (total + 1);
  switch (side) {
    case "top":
      return { x: node_x + width * fraction, y: node_y };
    case "bottom":
      return { x: node_x + width * fraction, y: node_y + height };
    case "left":
      return { x: node_x, y: node_y + height * fraction };
    case "right":
      return { x: node_x + width, y: node_y + height * fraction };
    default:
      return { x: node_x, y: node_y };
  }
}

/**
 * Resolve a port's canvas-space position for a given node object.
 *
 * @param {{ id: string, x: number, y: number, ports?: Array }} node
 * @param {string} port_id
 * @param {Object} node_dimensions  Map of nodeId → { width, height }
 * @returns {{ x: number, y: number, side: string } | null}
 */
export function get_port_position(node, port_id, node_dimensions) {
  const dims = node_dimensions[node.id] || { width: 120, height: 60 };
  const ports = node.ports || DEFAULT_PORTS;
  const port = ports.find((p) => p.id === port_id);
  if (!port) return null;

  const same_side = ports.filter((p) => p.side === port.side);
  const index = same_side.indexOf(port);
  const pos = calculate_port_position(
    node.x,
    node.y,
    dims.width,
    dims.height,
    port.side,
    index,
    same_side.length,
  );
  return { ...pos, side: port.side };
}

/**
 * Build a cubic-bézier SVG path between two port positions.
 * Control-point direction is driven by each port's side so the curve
 * always "leaves" the source and "arrives" at the target naturally.
 *
 * @param {{ x: number, y: number, side: string }} source
 * @param {{ x: number, y: number, side: string }} target
 * @returns {string} SVG `d` attribute
 */
export function calculate_bezier_path(source, target) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.max(50, Math.min(250, distance * 0.45));

  const vectors = {
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const sv = vectors[source.side] || vectors.right;
  const tv = vectors[target.side] || vectors.left;

  const cp1x = source.x + sv.x * offset;
  const cp1y = source.y + sv.y * offset;
  const cp2x = target.x + tv.x * offset;
  const cp2y = target.y + tv.y * offset;

  return (
    `M ${source.x} ${source.y} ` +
    `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${target.x} ${target.y}`
  );
}

/**
 * Calculate the midpoint of the same cubic bézier used by `calculate_bezier_path`.
 * Evaluates the curve at t = 0.5.
 *
 * @param {{ x: number, y: number, side: string }} source
 * @param {{ x: number, y: number, side: string }} target
 * @returns {{ x: number, y: number }}
 */
export function get_bezier_midpoint(source, target) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.max(50, Math.min(250, distance * 0.45));

  const vectors = {
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const sv = vectors[source.side] || vectors.right;
  const tv = vectors[target.side] || vectors.left;

  const cp1x = source.x + sv.x * offset;
  const cp1y = source.y + sv.y * offset;
  const cp2x = target.x + tv.x * offset;
  const cp2y = target.y + tv.y * offset;

  /* Cubic bézier at t = 0.5 */
  const t = 0.5;
  const mt = 1 - t;
  const x =
    mt * mt * mt * source.x +
    3 * mt * mt * t * cp1x +
    3 * mt * t * t * cp2x +
    t * t * t * target.x;
  const y =
    mt * mt * mt * source.y +
    3 * mt * mt * t * cp1y +
    3 * mt * t * t * cp2y +
    t * t * t * target.y;

  return { x, y };
}
