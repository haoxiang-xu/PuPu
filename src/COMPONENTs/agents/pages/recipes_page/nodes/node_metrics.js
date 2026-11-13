/* One set of measurements for every node on the Agents canvas.
 *
 * Start and Agent are the reference: 14px above and below an icon-tile header,
 * 18px at the sides, a 28px tile beside a title and a subtitle. Every node type
 * draws that same header (`NodeHeader`) at the same place, so a node with
 * nothing below its header is exactly as tall as Start, and its title sits at
 * the same y. A node with rows below the header grows downwards from there.
 *
 * Positions are a node's top-left corner, so a height change never moves a
 * node; the in/out ports of a node that can grow are anchored to the header's
 * centre line (`NODE_PORT_ANCHOR`) instead of the node's middle, which is
 * where Start's and Agent's ports already are — a chain of mixed node types
 * keeps its edges straight. */

export const NODE_PADDING_Y = 14;
export const NODE_PADDING_X = 18;
export const NODE_ICON_SIZE = 28;
export const NODE_ICON_RADIUS = 9;
export const NODE_ICON_GLYPH = 16;
export const NODE_HEADER_GAP = 10;

/* Fixed line boxes, so the header's height does not depend on the font's own
   line gap. 18 + 2 + 15 is what Start's title and subtitle measured at in the
   app font. */
export const NODE_TITLE_SIZE = 12.5;
export const NODE_TITLE_LINE = 18;
export const NODE_SUBTITLE_SIZE = 10.5;
export const NODE_SUBTITLE_LINE = 15;
export const NODE_SUBTITLE_GAP = 2;

export const NODE_HEADER_HEIGHT = Math.max(
  NODE_ICON_SIZE,
  NODE_TITLE_LINE + NODE_SUBTITLE_GAP + NODE_SUBTITLE_LINE,
);
/* The shortest any node is: the header and its padding. */
export const NODE_MIN_HEIGHT = NODE_PADDING_Y * 2 + NODE_HEADER_HEIGHT;
/* The header's centre line, from the node's top: where every left/right port
   sits. Equal to half of NODE_MIN_HEIGHT, so a node at its minimum height has
   its ports in the middle either way. */
export const NODE_PORT_ANCHOR = NODE_PADDING_Y + NODE_HEADER_HEIGHT / 2;

/* ── branches (If / Else, Switch / Case) ─────────────────────────────── */

export const BRANCH_ROW_HEIGHT = 26;
/* Space kept between the outlet rows and the node's top and bottom edges:
   what is left when two rows share a node of minimum height. */
export const BRANCH_ROW_INSET = (NODE_MIN_HEIGHT - 2 * BRANCH_ROW_HEIGHT) / 2;

/* Where a branch's outlet rows go. The rows are centred on the inlet while
   they fit inside the minimum height — one outlet runs straight through on the
   inlet's line, two sit symmetrically above and below it — and once they do
   not, they start at the top inset and the node grows by one row each. Each
   row's centre is its outlet port's anchor. */
export function branch_layout(row_count) {
  const count = Number.isSafeInteger(row_count) && row_count > 0 ? row_count : 0;
  const block = count * BRANCH_ROW_HEIGHT;
  const top = Math.max(BRANCH_ROW_INSET, NODE_PORT_ANCHOR - block / 2);
  const height = Math.max(NODE_MIN_HEIGHT, top + block + BRANCH_ROW_INSET);
  const anchors = Array.from({ length: count }, (_, index) => top + BRANCH_ROW_HEIGHT / 2 + index * BRANCH_ROW_HEIGHT);
  return { height, top, anchors };
}

/* ── size motion (every node, through PuzzleShape) ───────────────────── */

/* The one place the canvas's size spring is tuned. A node that grows rides
   NODE_SPRING: slightly underdamped (ζ ≈ 0.66), about 6% overshoot of the
   change — under 2px for a 26px case row — settling in ~0.3s. A node that
   shrinks rides NODE_SPRING_SETTLE: critically damped, no dip below the new
   height (its content is already that short). Units: px, seconds, unit mass. */
export const NODE_SPRING = Object.freeze({ stiffness: 520, damping: 30, mass: 1 });
export const NODE_SPRING_SETTLE = Object.freeze({ stiffness: 520, damping: 46, mass: 1 });
/* Size changes this soon after a node mounts are layout settling (graph
   load, fonts), not the node growing: they land instantly. */
export const NODE_MOTION_MOUNT_GRACE_MS = 500;
