/* The puzzle node's own outline as SVG path data, for anything drawn on the
 * node's edge (the run states). One set of measurements with PuzzleShape:
 * the body's corner, each side's bump (a tab) and notch (a cutout), and the
 * rounded joint the goo filter leaves where a bump or a notch meets the body.
 *
 * Coordinates are the node's own box (0,0 at its top-left); the line sits
 * `offset` px outside the body. */

export const PUZZLE_CORNER = 16;
/* side tabs are 22px circles pushed 9px out; top/bottom ones 18px, 7px out */
export const PUZZLE_TAB = Object.freeze({
  side: Object.freeze({ size: 22, offset: -9 }),
  end: Object.freeze({ size: 18, offset: -7 }),
});
export const PUZZLE_NOTCH_RADIUS = Object.freeze({ side: 12, end: 10 });

/* How round the goo filter leaves the joint where a bump or a notch meets
   the body (the blend width of the smooth union below). */
const JOINT = 5;
/* sampling step of the outline, px */
const GRID = 1;
const MARGIN = 16;

const side_of = (tab) => (tab && typeof tab === "object" ? tab.side : tab);

/* Every bump and notch as a circle in the node's box. */
function circles(width, height, tabs, cutouts, anchor) {
  const side_y = Number.isFinite(anchor) ? anchor : height / 2;
  const bumps = [];
  const notches = [];
  const tab_at = {
    right: (d, y) => [width - d, y],
    left: (d, y) => [d, y],
    top: (d) => [width / 2, d],
    bottom: (d) => [width / 2, height - d],
  };
  (tabs || []).forEach((tab) => {
    const side = side_of(tab);
    if (!tab_at[side]) return;
    const geom = side === "left" || side === "right" ? PUZZLE_TAB.side : PUZZLE_TAB.end;
    const r = geom.size / 2;
    const y = tab && typeof tab === "object" && Number.isFinite(tab.y) ? tab.y : side_y;
    const [x, cy] = tab_at[side](r + geom.offset, y);
    bumps.push({ x, y: cy, r });
  });
  const notch_at = { right: [width, side_y], left: [0, side_y], top: [width / 2, 0], bottom: [width / 2, height] };
  (cutouts || []).forEach((side) => {
    if (!notch_at[side]) return;
    const r = side === "left" || side === "right" ? PUZZLE_NOTCH_RADIUS.side : PUZZLE_NOTCH_RADIUS.end;
    notches.push({ x: notch_at[side][0], y: notch_at[side][1], r });
  });
  return { bumps, notches };
}

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};

/* Signed distance to the piece (negative inside): the rounded body less its
   notches, plus its bumps, each joint blended like the goo filter does. A
   bump drawn over a notch (Agent's top and bottom) wins, as in the DOM. */
function distance(width, height, { bumps, notches }) {
  const R = PUZZLE_CORNER;
  const hx = width / 2 - R;
  const hy = height / 2 - R;
  return (x, y) => {
    const qx = Math.abs(x - width / 2) - hx;
    const qy = Math.abs(y - height / 2) - hy;
    let d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
    for (let i = 0; i < notches.length; i += 1) {
      const n = notches[i];
      d = -smin(-d, Math.hypot(x - n.x, y - n.y) - n.r, JOINT);
    }
    for (let i = 0; i < bumps.length; i += 1) {
      const b = bumps[i];
      d = smin(d, Math.hypot(x - b.x, y - b.y) - b.r, JOINT);
    }
    return d;
  };
}

/* The line `offset` px outside the piece, traced on a 1px grid (marching
   squares, crossings interpolated) and chained into one clockwise loop. A
   bump, a notch, or a bump that runs into a corner (If/Else's outlets) all
   come out right without a special case. */
export function puzzle_outline_points(width, height, { tabs = [], cutouts = [], anchor } = {}, offset = 1) {
  if (!(width > 0 && height > 0)) return [];
  const sdf = distance(width, height, circles(width, height, tabs, cutouts, anchor));
  const x0 = -MARGIN;
  const y0 = -MARGIN;
  const nx = Math.ceil((width + MARGIN * 2) / GRID) + 1;
  const ny = Math.ceil((height + MARGIN * 2) / GRID) + 1;
  const v = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) v[j * nx + i] = sdf(x0 + i * GRID, y0 + j * GRID) - offset;
  }
  const at = (i, j) => v[j * nx + i];
  /* a crossing on a grid edge, keyed by that edge */
  const point = (key, i, j, horizontal) => {
    const a = at(i, j);
    const b = horizontal ? at(i + 1, j) : at(i, j + 1);
    const t = a / (a - b);
    return { key, x: x0 + (i + (horizontal ? t : 0)) * GRID, y: y0 + (j + (horizontal ? 0 : t)) * GRID };
  };
  const next = new Map();
  const where = new Map();
  const link = (p, q) => {
    where.set(p.key, p);
    where.set(q.key, q);
    next.set(p.key, q.key);
  };
  for (let j = 0; j < ny - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const code = (at(i, j) < 0 ? 8 : 0) | (at(i + 1, j) < 0 ? 4 : 0) | (at(i + 1, j + 1) < 0 ? 2 : 0) | (at(i, j + 1) < 0 ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const top = () => point(`h${i},${j}`, i, j, true);
      const bottom = () => point(`h${i},${j + 1}`, i, j + 1, true);
      const left = () => point(`v${i},${j}`, i, j, false);
      const right = () => point(`v${i + 1},${j}`, i + 1, j, false);
      /* walk with the inside on the right hand: clockwise on screen */
      switch (code) {
        case 1: link(bottom(), left()); break;
        case 2: link(right(), bottom()); break;
        case 3: link(right(), left()); break;
        case 4: link(top(), right()); break;
        case 6: link(top(), bottom()); break;
        case 7: link(top(), left()); break;
        case 8: link(left(), top()); break;
        case 9: link(bottom(), top()); break;
        case 11: link(right(), top()); break;
        case 12: link(left(), right()); break;
        case 13: link(bottom(), right()); break;
        case 14: link(left(), bottom()); break;
        case 5: link(top(), right()); link(bottom(), left()); break;
        case 10: link(left(), top()); link(right(), bottom()); break;
        default: break;
      }
    }
  }
  /* the longest loop is the piece's outline */
  const seen = new Set();
  let best = [];
  next.forEach((_, start) => {
    if (seen.has(start)) return;
    const loop = [];
    let key = start;
    while (key !== undefined && !seen.has(key)) {
      seen.add(key);
      loop.push(where.get(key));
      key = next.get(key);
    }
    if (loop.length > best.length) best = loop;
  });
  /* a crossing that lands exactly on a grid corner is reached from two edges */
  const pts = best.map((p) => [p.x, p.y]).filter((p, k, all) => k === 0 || Math.hypot(p[0] - all[k - 1][0], p[1] - all[k - 1][1]) > 0.01);
  /* clockwise on screen (y down): positive shoelace sum */
  let area = 0;
  for (let k = 0; k < pts.length; k += 1) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[(k + 1) % pts.length];
    area += ax * by - bx * ay;
  }
  return area < 0 ? pts.reverse() : pts;
}

const to_d = (pts, close) =>
  `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}${close ? "Z" : ""}`;

export function puzzle_outline_path(width, height, shape, offset = 1) {
  return to_d(puzzle_outline_points(width, height, shape, offset), true);
}

/* The outline split at the way in (left, on the port line) and the way out
   (right, on the port line): the half over the top and the half under the
   bottom, both starting at the way in. */
export function puzzle_outline_halves(width, height, shape = {}, offset = 1) {
  const pts = puzzle_outline_points(width, height, shape, offset);
  const y = Number.isFinite(shape.anchor) ? shape.anchor : height / 2;
  const nearest = (keep) => pts.reduce((best, p, i) => {
    if (!keep(p)) return best;
    return best < 0 || Math.abs(p[1] - y) < Math.abs(pts[best][1] - y) ? i : best;
  }, -1);
  const into = nearest((p) => p[0] < width * 0.25);
  const out = nearest((p) => p[0] > width * 0.75);
  if (into < 0 || out < 0) return [to_d(pts, true), ""];
  const ring = pts.slice(into).concat(pts.slice(0, into));
  const split = (out - into + pts.length) % pts.length;
  return [to_d(ring.slice(0, split + 1)), to_d(ring.slice(split).concat([ring[0]]).reverse())];
}
