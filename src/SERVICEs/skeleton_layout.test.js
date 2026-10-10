import {
  ATTACH_OFFSET_Y,
  COLUMN_WIDTH,
  ORIGIN,
  ROW_HEIGHT,
  auto_layout,
  forgetSkeletonLayout,
  readSkeletonLayout,
  writeSkeletonNodePositions,
  writeSkeletonViewport,
} from "./skeleton_layout";

const flow = (id, a, b) => ({
  id, kind: "flow", source_node_id: a, source_port_id: "out",
  target_node_id: b, target_port_id: "in",
});
const attach = (id, a, b) => ({
  id, kind: "attach", source_node_id: a, source_port_id: "attach_bot",
  target_node_id: b, target_port_id: "attach_top",
});
const node = (id, type) => ({ id, type, config: {} });

const chain = () => ({
  schema_version: 1, kind: "agent", id: "r", name: "r",
  nodes: [node("start", "start"), node("a1", "agent"), node("end", "end")],
  edges: [flow("e1", "start", "a1"), flow("e2", "a1", "end")],
});

beforeEach(() => window.localStorage.clear());

describe("a graph lays itself out from its own edges", () => {
  test("a chain runs left to right, one column per step", () => {
    const placed = auto_layout(chain());
    expect(placed.start).toEqual({ x: ORIGIN.x, y: ORIGIN.y });
    expect(placed.a1.x).toBe(ORIGIN.x + COLUMN_WIDTH);
    expect(placed.end.x).toBe(ORIGIN.x + COLUMN_WIDTH * 2);
    expect(new Set([placed.start.y, placed.a1.y, placed.end.y]).size).toBe(1);
  });

  test("it is the same every time, so a graph opens where it opened before", () => {
    expect(auto_layout(chain())).toEqual(auto_layout(chain()));
  });

  test("two nodes in one column are stacked rather than overlapped", () => {
    const doc = chain();
    doc.nodes.push(node("a2", "agent"));
    doc.edges.push(flow("e3", "start", "a2"));
    const placed = auto_layout(doc);
    expect(placed.a1.x).toBe(placed.a2.x);
    expect(Math.abs(placed.a1.y - placed.a2.y)).toBe(ROW_HEIGHT);
  });

  test("a pool hangs under the agent it attaches to, not in a column of its own", () => {
    /* It does not run in the flow, so giving it a step would read as one. */
    const doc = chain();
    doc.nodes.push(node("tp", "toolkit_pool"));
    doc.edges.push(attach("at1", "a1", "tp"));
    const placed = auto_layout(doc);
    expect(placed.tp.x).toBe(placed.a1.x);
    expect(placed.tp.y).toBe(placed.a1.y + ATTACH_OFFSET_Y);
  });

  test("two pools on one agent stack", () => {
    const doc = chain();
    doc.nodes.push(node("tp", "toolkit_pool"), node("sp", "subagent_pool"));
    doc.edges.push(attach("at1", "a1", "tp"), attach("at2", "a1", "sp"));
    const placed = auto_layout(doc);
    expect(placed.tp.y).not.toBe(placed.sp.y);
  });

  test("a cycle terminates instead of walking forever", () => {
    const doc = chain();
    doc.edges.push(flow("loop", "end", "start"));
    expect(() => auto_layout(doc)).not.toThrow();
    expect(Object.keys(auto_layout(doc))).toHaveLength(3);
  });

  test("an empty or absent document lays out nothing", () => {
    expect(auto_layout(null)).toEqual({});
    expect(auto_layout({ nodes: [], edges: [] })).toEqual({});
  });
});

describe("what is remembered, and what cannot be", () => {
  test("a stored position wins over the automatic one", () => {
    writeSkeletonNodePositions("r", { a1: { x: 999, y: 111 } });
    const layout = readSkeletonLayout("r", chain());
    expect(layout.nodes.a1).toEqual({ x: 999, y: 111 });
    /* And the untouched ones still get a place. */
    expect(layout.nodes.start).toEqual({ x: ORIGIN.x, y: ORIGIN.y });
  });

  test("a node added since the last visit is placed, not left at the origin", () => {
    writeSkeletonNodePositions("r", { start: { x: 10, y: 10 } });
    const doc = chain();
    doc.nodes.push(node("a2", "agent"));
    doc.edges.push(flow("e3", "a1", "a2"));
    const layout = readSkeletonLayout("r", doc);
    expect(layout.nodes.a2).toBeDefined();
    expect(layout.nodes.a2).not.toEqual({ x: 10, y: 10 });
  });

  test("a position is kept per resource, not shared between them", () => {
    writeSkeletonNodePositions("one", { a1: { x: 5, y: 5 } });
    expect(readSkeletonLayout("two", chain()).nodes.a1).toEqual({
      x: ORIGIN.x + COLUMN_WIDTH,
      y: ORIGIN.y,
    });
  });

  test("a record for a node the graph no longer has is simply not used", () => {
    writeSkeletonNodePositions("r", { ghost: { x: 1, y: 2 } });
    expect(readSkeletonLayout("r", chain()).nodes.ghost).toBeUndefined();
  });

  test("a nonsense record is discarded rather than drawn", () => {
    window.localStorage.setItem("skeleton_layout", "{ not json");
    expect(() => readSkeletonLayout("r", chain())).not.toThrow();
    writeSkeletonNodePositions("r", { a1: { x: "left", y: null } });
    expect(readSkeletonLayout("r", chain()).nodes.a1).toEqual({
      x: ORIGIN.x + COLUMN_WIDTH,
      y: ORIGIN.y,
    });
  });

  test("the viewport is remembered, and a broken one is not", () => {
    writeSkeletonViewport("r", { x: 12, y: -4, zoom: 1.5 });
    expect(readSkeletonLayout("r", chain()).viewport).toEqual({ x: 12, y: -4, zoom: 1.5 });
    writeSkeletonViewport("r", { x: 1, y: 2 });
    expect(readSkeletonLayout("r", chain()).viewport).toEqual({ x: 12, y: -4, zoom: 1.5 });
  });

  test("forgetting one resource leaves the others", () => {
    writeSkeletonNodePositions("one", { a1: { x: 5, y: 5 } });
    writeSkeletonNodePositions("two", { a1: { x: 7, y: 7 } });
    forgetSkeletonLayout("one");
    expect(readSkeletonLayout("two", chain()).nodes.a1).toEqual({ x: 7, y: 7 });
  });

  test("no storage at all still draws the graph", () => {
    const real = window.localStorage;
    Object.defineProperty(window, "localStorage", { value: undefined, configurable: true });
    try {
      expect(readSkeletonLayout("r", chain()).nodes.a1).toBeDefined();
      expect(() => writeSkeletonNodePositions("r", { a1: { x: 1, y: 1 } })).not.toThrow();
    } finally {
      Object.defineProperty(window, "localStorage", { value: real, configurable: true });
    }
  });
});

describe("layout can never reach the document", () => {
  test("the module exports no way to write one", () => {
    /* The guarantee that moving a node cannot change execution is structural:
     * there is no path from here into a saved Skeleton document. */
    const api = require("./skeleton_layout");
    const writers = Object.keys(api).filter((name) => /^write|^forget/.test(name));
    expect(writers.sort()).toEqual([
      "forgetSkeletonLayout",
      "writeSkeletonNodePositions",
      "writeSkeletonViewport",
    ]);
  });

  test("reading never mutates the document it was given", () => {
    const doc = chain();
    const before = JSON.stringify(doc);
    readSkeletonLayout("r", doc);
    writeSkeletonNodePositions("r", { a1: { x: 3, y: 4 } });
    readSkeletonLayout("r", doc);
    expect(JSON.stringify(doc)).toBe(before);
  });
});
