import { document_problems, document_layout_positions, with_layout_positions, with_pruned_layout } from "./skeleton_document";
import { apply_graph_command } from "./skeleton_graph_commands";
import { node_layout_capability } from "./node_label_capability";
import capture from "./skeleton_document_layout_capture.json";

/* BC-NL-001 mirror: `document.layout` against the REAL unchain validator's
   verdicts (skeleton_document_layout_capture.json, recorded from
   validate_skeleton_document, never hand written). Both directions: what the
   runtime admits the editor admits, and what it refuses the editor refuses at
   the same code and path. */

const where_of = (path) =>
  path.reduce((text, step) => (typeof step === "number" ? `${text}[${step}]` : `${text}.${step}`), "").replace(/^\./, "");
const found = (document) => document_problems(document).map((p) => `${p.code} @ ${p.where}`);
const CASES = capture.envelope.map((case_) => ({ ...case_, value: JSON.parse(case_.json) }));
const base = () => JSON.parse(CASES.find((case_) => case_.label === "no layout").json);

describe("document.layout: the editor admits exactly what the runtime admits", () => {
  CASES.forEach((case_) => {
    test(`${case_.accepted ? "admits" : "refuses"}: ${case_.label}`, () => {
      expect(document_problems(case_.value).length === 0).toBe(case_.accepted);
    });
  });
  CASES.filter((case_) => !case_.accepted).forEach((case_) => {
    test(`says why at the runtime's own path: ${case_.label}`, () => {
      expect(found(case_.value)).toContain(`${case_.code} @ ${where_of(case_.path)}`);
    });
  });
  test("the capture came from the producer and covers both verdicts", () => {
    expect(capture.schema).toBe("pupu.capture.skeleton_document_layout.v1");
    expect(capture.producer.module).toMatch(/validate_skeleton_document/);
    expect(CASES.filter((c) => c.accepted).length).toBeGreaterThanOrEqual(5);
    expect(new Set(CASES.filter((c) => !c.accepted).map((c) => c.code))).toEqual(
      new Set(["invalid_type", "missing_field", "unknown_field", "missing_value", "invalid_value"]));
  });
});

describe("writing positions into a graph", () => {
  test("writes whole pixels for nodes the graph holds and ignores the rest", () => {
    const next = with_layout_positions(base(), { s: { x: 10.4, y: 20.6 }, ghost: { x: 1, y: 1 } });
    expect(next.layout).toEqual({ nodes: { s: { x: 10, y: 21 } } });
    expect(document_problems(next)).toEqual([]);
  });
  test("merges over what the graph already places", () => {
    const once = with_layout_positions(base(), { s: { x: 0, y: 0 }, k: { x: 5, y: 5 } });
    const twice = with_layout_positions(once, { k: { x: 9, y: 9 } });
    expect(twice.layout.nodes).toEqual({ s: { x: 0, y: 0 }, k: { x: 9, y: 9 } });
  });
  test("an unchanged position is no edit", () => {
    const once = with_layout_positions(base(), { s: { x: 3, y: 4 } });
    expect(with_layout_positions(once, { s: { x: 3, y: 4 } })).toBe(once);
  });
  test("pruning drops a layout entry for a node that is gone, and an empty layout entirely", () => {
    const placed = { ...base(), layout: { nodes: { s: { x: 0, y: 0 }, gone: { x: 1, y: 1 } } } };
    expect(with_pruned_layout(placed).layout).toEqual({ nodes: { s: { x: 0, y: 0 } } });
    const only_gone = { ...base(), layout: { nodes: { gone: { x: 1, y: 1 } } } };
    expect("layout" in with_pruned_layout(only_gone)).toBe(false);
    const clean = { ...base(), layout: { nodes: { s: { x: 0, y: 0 } } } };
    expect(with_pruned_layout(clean)).toBe(clean);
  });
  test("reading positions keeps a __proto__ node id as data", () => {
    const table = document_layout_positions({ layout: { nodes: JSON.parse('{"__proto__": {"x": 1, "y": 2}}') } });
    expect(Object.getPrototypeOf(table)).toBe(null);
    expect(table.__proto__).toEqual({ x: 1, y: 2 });
  });
});

describe("the move_nodes command", () => {
  test("a move is accepted and lands in the layout", () => {
    const result = apply_graph_command(base(), { type: "move_nodes", positions: { k: { x: 300, y: 120 } } });
    expect(result.ok).toBe(true);
    expect(result.document.layout).toEqual({ nodes: { k: { x: 300, y: 120 } } });
  });
  test.each([
    [{ type: "move_nodes" }],
    [{ type: "move_nodes", positions: {} }],
    [{ type: "move_nodes", positions: { k: { x: "1", y: 2 } } }],
    [{ type: "move_nodes", positions: { k: { x: NaN, y: 2 } } }],
    [{ type: "move_nodes", positions: { k: { x: 1, y: 2, z: 3 } } }],
    [{ type: "move_nodes", positions: { k: { x: 2e6, y: 2 } } }],
    [{ type: "move_nodes", positions: { k: { x: 1, y: 2 } }, extra: true }],
  ])("a malformed move is refused and changes nothing: %j", (command) => {
    const graph = base();
    const result = apply_graph_command(graph, command);
    expect(result.ok).toBe(false);
    expect(result.document).toBe(graph);
  });
  test("deleting a placed node drops it from the layout, so the save is admitted", () => {
    const graph = { ...base(), nodes: [...base().nodes, { id: "x", type: "agent", config: { execution: { inputs: [], outputs: [] } } }],
      layout: { nodes: { s: { x: 0, y: 0 }, x: { x: 5, y: 5 } } } };
    const result = apply_graph_command(graph, { type: "delete", node_ids: ["x"], edge_ids: [] });
    expect(result.ok).toBe(true);
    expect(result.document.layout).toEqual({ nodes: { s: { x: 0, y: 0 } } });
  });
});

describe("the layout capability is read from the actual runtime manifest", () => {
  const response = (minor, features) => ({
    runtime_manifest: {
      schema: "unchain.runtime_protocol_manifest.v1", runtime: "unchain",
      manifest_digest: `sha256:${"a".repeat(64)}`,
      protocols: [{ id: "skeleton_execution", major: 1, minor, features }],
    },
  });
  const LABEL = "node_display_label_v1";
  const ok = jest.requireActual("../../../../SERVICEs/managed_code_api");
  beforeEach(() => { jest.spyOn(ok, "checkManagedCodeResponse").mockImplementation(() => undefined); });
  afterEach(() => { jest.restoreAllMocks(); });
  test("1.10 with document_layout_v1 stores layout in the document", () => {
    expect(node_layout_capability(response(10, [LABEL, "document_layout_v1"]))).toBe(true);
  });
  test.each([
    [9, [LABEL, "document_layout_v1"]],
    [10, [LABEL]],
    [11, ["document_layout_v1"]],
  ])("minor %i with %j keeps positions on this machine", (minor, features) => {
    expect(node_layout_capability(response(minor, features))).toBe(false);
  });
  test("an invalid manifest is no capability", () => {
    expect(node_layout_capability({ runtime_manifest: null })).toBe(false);
  });
});
