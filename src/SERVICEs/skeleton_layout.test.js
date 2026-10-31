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
  copySkeletonLayout,
} from "./skeleton_layout";
import { NODE_ID_ROWS } from "../COMPONENTs/agents/pages/recipes_page/skeleton_node_id_capture";

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

describe("an id the document chose, used as a key", () => {
  /* A node id and a resource id are data. `NODE_ID_ROWS` is the real store
     and the installed runtime on the fixed pair: a whole Workflow whose Start
     is named `__proto__` is saved byte for byte, passes the store's own
     check, and executes — completing both nodes and returning the same output
     as the ordinary one. So the editor may not treat such a graph as damaged.
     On a plain object the table answered with an inherited member and the
     write set a prototype: the node was drawn at `x: undefined`, a drag
     changed nothing, and the stored layout held every other node. */

  const row = (name) => NODE_ID_ROWS.find((item) => item.case === name);
  const document_of = (name) => JSON.parse(row(name).document);
  const SPECIAL = ["proto", "constructor", "to_string"];

  test("the capture is the store's and the runtime's own answer", () => {
    expect(NODE_ID_ROWS).toHaveLength(4);
    NODE_ID_ROWS.forEach((item) => {
      expect([item.case, item.saved, item.round_trip, item.draft_diagnostics]).toEqual([
        item.case,
        true,
        true,
        [],
      ]);
      expect([item.case, item.preflight.ok]).toEqual([item.case, true]);
      /* Same input, same output, both nodes completed — including the one
         whose id names a member of every object. */
      expect([item.case, item.execution.outputs]).toEqual([
        item.case,
        { message: "Same valid input" },
      ]);
      expect([item.case, item.execution.completed_nodes]).toEqual([
        item.case,
        [item.start_id, "end"],
      ]);
    });
  });

  test("every one of them is laid out with finite coordinates", () => {
    NODE_ID_ROWS.forEach((item) => {
      const placed = auto_layout(JSON.parse(item.document));
      expect([
        item.case,
        Object.prototype.hasOwnProperty.call(placed, item.start_id),
      ]).toEqual([item.case, true]);
      const at = placed[item.start_id];
      expect([item.case, Number.isFinite(at.x), Number.isFinite(at.y)]).toEqual([
        item.case,
        true,
        true,
      ]);
      expect([item.case, at]).toEqual([item.case, { x: ORIGIN.x, y: ORIGIN.y }]);
    });
  });

  test("a drag is stored under that id and read back, per id", () => {
    SPECIAL.forEach((name) => {
      const document = document_of(name);
      const id = row(name).start_id;
      writeSkeletonNodePositions(document.id, { [id]: { x: 501, y: 502 } });
      const layout = readSkeletonLayout(document.id, document);
      expect([name, Object.prototype.hasOwnProperty.call(layout.nodes, id)]).toEqual([
        name,
        true,
      ]);
      expect([name, layout.nodes[id]]).toEqual([name, { x: 501, y: 502 }]);
      /* And it really is in storage, not only in the answer. */
      const raw = JSON.parse(window.localStorage.getItem("skeleton_layout"));
      expect([
        name,
        Object.prototype.hasOwnProperty.call(raw.resources[document.id].nodes, id),
      ]).toEqual([name, true]);
      expect([name, raw.resources[document.id].nodes[id]]).toEqual([
        name,
        { x: 501, y: 502 },
      ]);
      /* The ordinary node beside it is untouched. */
      expect(Number.isFinite(layout.nodes.end.x)).toBe(true);
    });
  });

  test("a second drag merges rather than replacing the record", () => {
    const document = document_of("proto");
    /* A computed key, which is what `moved[node.id] = …` does at runtime.
       Written as the literal `{ __proto__: … }` it would not be a key at all:
       that spelling is the prototype setter, and the fixture would be testing
       nothing — which is how this test first went green on a broken read. */
    writeSkeletonNodePositions(document.id, { ["__proto__"]: { x: 1, y: 2 } });
    writeSkeletonNodePositions(document.id, { end: { x: 3, y: 4 } });
    const layout = readSkeletonLayout(document.id, document);
    expect(layout.nodes["__proto__"]).toEqual({ x: 1, y: 2 });
    expect(layout.nodes.end).toEqual({ x: 3, y: 4 });
  });

  test("a resource id that names a prototype member is its own record too", () => {
    /* A resource id is a document id, and the store asks only that it be a
       non-empty string. Two of them must not share one record. */
    const document = { ...document_of("normal"), id: "__proto__" };
    writeSkeletonNodePositions("__proto__", { start: { x: 11, y: 12 } });
    writeSkeletonNodePositions("other", { start: { x: 21, y: 22 } });
    expect(readSkeletonLayout("__proto__", document).nodes.start).toEqual({
      x: 11,
      y: 12,
    });
    expect(readSkeletonLayout("other", document).nodes.start).toEqual({
      x: 21,
      y: 22,
    });
    writeSkeletonViewport("__proto__", { x: 5, y: 6, zoom: 2 });
    expect(readSkeletonLayout("__proto__", document).viewport).toEqual({
      x: 5,
      y: 6,
      zoom: 2,
    });
    /* And forgetting it forgets only it. */
    forgetSkeletonLayout("__proto__");
    expect(readSkeletonLayout("__proto__", document).nodes.start).toEqual({
      x: ORIGIN.x,
      y: ORIGIN.y,
    });
    expect(readSkeletonLayout("other", document).nodes.start).toEqual({
      x: 21,
      y: 22,
    });
  });

  test("a resource with no record of its own is not handed another's", () => {
    /* `read_all()[resource_id]` answered with `Object.prototype` for an
       unvisited `constructor`, which is an object, so it was read as a
       record. */
    const document = document_of("normal");
    expect(readSkeletonLayout("constructor", document).nodes.start).toEqual({
      x: ORIGIN.x,
      y: ORIGIN.y,
    });
    expect(readSkeletonLayout("toString", document).viewport).toBeNull();
    forgetSkeletonLayout("hasOwnProperty");
    expect(window.localStorage.getItem("skeleton_layout")).toBeNull();
  });

  test("a stored record whose node the graph no longer has is still ignored", () => {
    const document = document_of("proto");
    writeSkeletonNodePositions(document.id, { __proto__: { x: 7, y: 8 } });
    const other = { ...document, nodes: document.nodes.filter((n) => n.id === "end") };
    const layout = readSkeletonLayout(document.id, other);
    expect(Object.prototype.hasOwnProperty.call(layout.nodes, "__proto__")).toBe(false);
  });
});

describe("the same drawing under a new key", () => {
  /* An embedded child is keyed by the steps that reach it, and those carry
     the entry's position only while two entries share an id. Giving one of
     them an id of its own changes the key — the same graph, under a new name
     — and the author must not lose the drawing for having repaired it. */

  const document = () => chain();

  test("a record is copied onto a key that has none", () => {
    writeSkeletonNodePositions("old-key", { a1: { x: 11, y: 12 } });
    writeSkeletonViewport("old-key", { x: 1, y: 2, zoom: 3 });
    copySkeletonLayout("old-key", "new-key");
    expect(readSkeletonLayout("new-key", document()).nodes.a1).toEqual({ x: 11, y: 12 });
    expect(readSkeletonLayout("new-key", document()).viewport).toEqual({
      x: 1,
      y: 2,
      zoom: 3,
    });
    /* Copied, not moved: the old key may still name a sibling's drawing. */
    expect(readSkeletonLayout("old-key", document()).nodes.a1).toEqual({ x: 11, y: 12 });
  });

  test("a key that already has one is left alone", () => {
    writeSkeletonNodePositions("old-key", { a1: { x: 11, y: 12 } });
    writeSkeletonNodePositions("new-key", { a1: { x: 90, y: 91 } });
    copySkeletonLayout("old-key", "new-key");
    expect(readSkeletonLayout("new-key", document()).nodes.a1).toEqual({ x: 90, y: 91 });
  });

  test("nothing to copy, nothing happens", () => {
    copySkeletonLayout("missing", "new-key");
    expect(window.localStorage.getItem("skeleton_layout")).toBeNull();
    writeSkeletonNodePositions("old-key", { a1: { x: 1, y: 2 } });
    copySkeletonLayout("old-key", "old-key");
    copySkeletonLayout("", "new-key");
    copySkeletonLayout("old-key", null);
    expect(readSkeletonLayout("new-key", document()).nodes.a1).not.toEqual({ x: 1, y: 2 });
  });

  test("a key that names something every object has is its own", () => {
    writeSkeletonNodePositions("constructor", { a1: { x: 5, y: 6 } });
    copySkeletonLayout("constructor", "toString");
    expect(readSkeletonLayout("toString", document()).nodes.a1).toEqual({ x: 5, y: 6 });
  });
});
