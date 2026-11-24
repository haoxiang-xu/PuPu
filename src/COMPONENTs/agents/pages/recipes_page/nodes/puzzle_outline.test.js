import { puzzle_outline_halves, puzzle_outline_path, puzzle_outline_points } from "./puzzle_outline";

const W = 168;
const H = 63;
const ANCHOR = 31.5;
const xs = (pts) => pts.map(([x]) => x);
const ys = (pts) => pts.map(([, y]) => y);
const near = (pts, y, keep) => pts.filter(keep).reduce((a, b) => (Math.abs(b[1] - y) < Math.abs(a[1] - y) ? b : a));

test("a plain body is its rounded box, 1px outside", () => {
  const pts = puzzle_outline_points(W, H, {});
  expect(Math.min(...xs(pts))).toBeCloseTo(-1, 5);
  expect(Math.max(...xs(pts))).toBeCloseTo(W + 1, 5);
  expect(Math.min(...ys(pts))).toBeCloseTo(-1, 5);
  expect(Math.max(...ys(pts))).toBeCloseTo(H + 1, 5);
  expect(puzzle_outline_path(W, H, {})).toMatch(/^M.*Z$/);
});

test("a right tab bulges out by its 9px plus the offset, on the port line", () => {
  const pts = puzzle_outline_points(W, H, { tabs: ["right"], anchor: ANCHOR });
  const tip = pts.reduce((a, b) => (b[0] > a[0] ? b : a));
  expect(tip[0]).toBeCloseTo(W + 9 + 1, 1);
  expect(Math.abs(tip[1] - ANCHOR)).toBeLessThan(1);
});

test("a left notch goes 12px into the body (less the offset), on the port line", () => {
  const pts = puzzle_outline_points(W, H, { cutouts: ["left"], anchor: ANCHOR });
  const deepest = near(pts, ANCHOR, ([x]) => x < W / 4);
  expect(deepest[0]).toBeCloseTo(12 - 1, 1);
});

test("a bump and a notch on the same spot draw as the bump (Agent's top and bottom)", () => {
  const both = puzzle_outline_points(W, H, { tabs: ["top", "bottom"], cutouts: ["top", "bottom"] });
  expect(Math.min(...ys(both))).toBeCloseTo(-(7 + 1), 1);
  expect(Math.max(...ys(both))).toBeCloseTo(H + 7 + 1, 1);
});

test("several outlets on one side get one bump each (If/Else)", () => {
  const pts = puzzle_outline_points(W, 90, { tabs: [{ side: "right", y: 24 }, { side: "right", y: 60 }], cutouts: ["left"], anchor: 42 });
  const tips = pts.filter(([x]) => x > W + 9.5);
  expect(tips.some(([, y]) => Math.abs(y - 24) < 1)).toBe(true);
  expect(tips.some(([, y]) => Math.abs(y - 60) < 1)).toBe(true);
});

test("an outlet bump that runs into a corner never folds back on itself (two outlets at minimum height)", () => {
  /* If/Else at its minimum height: the outlets sit 5.5px + half a row from the top and bottom */
  const pts = puzzle_outline_points(W, H, { tabs: [{ side: "right", y: 18.5 }, { side: "right", y: 44.5 }], cutouts: ["left"], anchor: ANCHOR });
  /* walking clockwise down the right side, y never goes back up between the two bumps' tips */
  const right = pts.filter(([x]) => x > W - 4);
  for (let k = 1; k < right.length; k += 1) expect(right[k][1]).toBeGreaterThanOrEqual(right[k - 1][1] - 0.01);
});

test("the outline is one clockwise loop", () => {
  const pts = puzzle_outline_points(W, H, { tabs: ["right", "top", "bottom"], cutouts: ["left", "top", "bottom"], anchor: ANCHOR });
  let area = 0;
  pts.forEach(([ax, ay], k) => { const [bx, by] = pts[(k + 1) % pts.length]; area += ax * by - bx * ay; });
  expect(area).toBeGreaterThan(0);
  expect(puzzle_outline_points(0, 0, {})).toEqual([]);
});

test("the two halves both start at the in-port and end at the out-port", () => {
  const [top, bottom] = puzzle_outline_halves(W, H, { tabs: ["right", "top", "bottom"], cutouts: ["left", "top", "bottom"], anchor: ANCHOR });
  const ends = (d) => {
    const nums = d.slice(1).split("L").map((p) => p.split(" ").map(Number));
    return [nums[0], nums[nums.length - 1], nums];
  };
  const [ts, te, tp] = ends(top);
  const [bs, be, bp] = ends(bottom);
  expect(ts).toEqual(bs);
  expect(te).toEqual(be);
  expect(ts[0]).toBeLessThan(W / 4);
  expect(te[0]).toBeGreaterThan(W * 0.75);
  expect(Math.min(...ys(tp))).toBeLessThan(0);
  expect(Math.max(...ys(bp))).toBeGreaterThan(H);
});

test("a node with no in-port (Start) still splits on its left side", () => {
  const [top, bottom] = puzzle_outline_halves(W, H, { tabs: ["right"], anchor: ANCHOR });
  const start = (d) => d.slice(1).split("L")[0].split(" ").map(Number);
  [top, bottom].forEach((d) => {
    const [x, y] = start(d);
    expect(x).toBeCloseTo(-1, 1);
    expect(Math.abs(y - ANCHOR)).toBeLessThanOrEqual(1);
  });
});
