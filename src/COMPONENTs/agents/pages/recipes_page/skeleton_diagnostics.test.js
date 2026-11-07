import {
  diagnostic_target,
  diagnostics_for_node,
  diagnostics_for_row,
  has_diagnostics,
  diagnostic_location_label,
  normalize_diagnostics,
  route_diagnostics,
  unplaced_diagnostics,
} from "./skeleton_diagnostics";

const document = {
  schema_version: 1,
  kind: "workflow",
  id: "w",
  name: "W",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [] } } },
    { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [],
};

/* The exact path the runtime produced for a malformed binding, observed on
 * 2026-10-03 through validate_skeleton_for_execution + _validate_all. */
const ROW_PATH = ["document", "nodes", 1, "config", "execution", "inputs", 0, "default"];
/* And the shape the draft check produces, which never enters a config. */
const STRUCTURE_PATH = ["document", "nodes"];

describe("a row-level problem is placed on its row", () => {
  test("the preflight path resolves to a node, a section, a row and a field", () => {
    expect(diagnostic_target({ path: ROW_PATH }, document)).toEqual({
      node_id: "end",
      section: "inputs",
      row: 0,
      field: "default",
    });
  });

  test("an output mapping resolves to the outputs section", () => {
    expect(
      diagnostic_target(
        { path: ["document", "nodes", 1, "config", "execution", "outputs", 2, "source"] },
        document,
      ),
    ).toEqual({ node_id: "end", section: "outputs", row: 2, field: "source" });
  });

  test("the section is read one level deeper than the config, where it lives", () => {
    /* `config.inputs` is not where the runtime keeps them; a path that stopped
     * at the config would be a different, older shape and must not resolve. */
    expect(
      diagnostic_target({ path: ["document", "nodes", 1, "config", "inputs", 0] }, document),
    ).toEqual({ node_id: "end", section: null, row: null, field: null });
  });
});

describe("a structural problem stays at the node", () => {
  test("the draft check's path names a node but no row", () => {
    expect(diagnostic_target({ path: ["document", "nodes", 0] }, document)).toEqual({
      node_id: "start",
      section: null,
      row: null,
      field: null,
    });
  });

  test("a graph-level path names nothing", () => {
    expect(diagnostic_target({ path: STRUCTURE_PATH }, document)).toEqual({
      node_id: null,
      section: null,
      row: null,
      field: null,
    });
  });

  test("an edge path is not mistaken for a node", () => {
    expect(
      diagnostic_target({ path: ["document", "edges", 0, "kind"] }, document).node_id,
    ).toBeNull();
  });

  test("a node index past the end resolves to nothing rather than throwing", () => {
    expect(diagnostic_target({ path: ["document", "nodes", 9, "config"] }, document).node_id).toBeNull();
  });
});

describe("nothing is silently dropped", () => {
  const list = [
    { code: "end_count", path: STRUCTURE_PATH, message: "graph requires exactly one end node" },
    { code: "unknown_field", path: ROW_PATH, message: "default is only allowed for default policy" },
    { code: "flow_output_required", path: ["document", "nodes", 1], message: "execution node requires flow output" },
  ];

  test("per-node filtering keeps what points at that node", () => {
    expect(diagnostics_for_node(list, document, "end").map((d) => d.code)).toEqual([
      "unknown_field",
      "flow_output_required",
    ]);
  });

  test("per-row filtering keeps only the row's own", () => {
    expect(diagnostics_for_row(list, document, "end", "inputs", 0).map((d) => d.code)).toEqual([
      "unknown_field",
    ]);
    expect(diagnostics_for_row(list, document, "end", "inputs", 1)).toEqual([]);
  });

  test("what no row can show is still shown somewhere", () => {
    /* A panel that printed only row problems would render nothing for a graph
     * that is missing its end node, which reads as a clean draft. */
    expect(unplaced_diagnostics(list, document).map((d) => d.code)).toEqual([
      "end_count",
      "flow_output_required",
    ]);
  });

  test("a malformed entry is normalized rather than crashing a render", () => {
    expect(normalize_diagnostics([null, 7, { code: 1 }])).toEqual([
      { code: "unknown", message: "", path: [] },
    ]);
    expect(normalize_diagnostics(undefined)).toEqual([]);
    expect(has_diagnostics([])).toBe(false);
    expect(has_diagnostics(list)).toBe(true);
  });
});

describe("R2 — routing is a partition, so nothing can fall through", () => {
  /* Paths taken from the real store's diagnose output, not invented. */
  const real = [
    { code: "end_count", path: ["document", "nodes"], message: "graph requires exactly one end node" },
    { code: "flow_source_port", path: ["document", "edges", 0, "source_port_id"], message: "flow source port is invalid" },
    { code: "unknown_field", path: ["document", "nodes", 1, "config", "execution", "inputs", 0, "default"], message: "default is only allowed for default policy" },
    { code: "flow_output_required", path: ["document", "nodes", 1], message: "execution node requires flow output" },
    { code: "something_new", path: ["document", "sidecar", "x"], message: "a path this build does not know" },
    { code: "unknown_field", path: ["document", "nodes", 0, "config", "execution", "outputs", 0, "name"], message: "belongs to another node" },
    { code: "invalid_value", path: ["document", "nodes", 1, "config", "execution", "inputs", 9, "value"], message: "a row that is not rendered" },
  ];

  test("every diagnostic lands in exactly one bucket", () => {
    const routed = route_diagnostics(real, document, {
      node_id: "end",
      row_counts: { inputs: 1, outputs: 0 },
    });
    const placed =
      routed.rows.inputs.flat().length +
      routed.rows.outputs.flat().length +
      routed.node.length +
      routed.elsewhere.length;
    expect(placed).toBe(real.length);
  });

  test("a graph-level problem is not lost for having no node", () => {
    const routed = route_diagnostics(real, document, { node_id: "end", row_counts: { inputs: 1, outputs: 0 } });
    expect(routed.elsewhere.map((d) => d.code)).toContain("end_count");
  });

  test("an edge problem is not lost for not being a node", () => {
    const routed = route_diagnostics(real, document, { node_id: "end", row_counts: { inputs: 1, outputs: 0 } });
    expect(routed.elsewhere.map((d) => d.code)).toContain("flow_source_port");
  });

  test("a path shape this build does not know is kept", () => {
    const routed = route_diagnostics(real, document, { node_id: "end", row_counts: { inputs: 1, outputs: 0 } });
    expect(routed.elsewhere.map((d) => d.code)).toContain("something_new");
  });

  test("a claimed row with no rendered row falls back to the node, not away", () => {
    /* `target.row` is non-null for it, which is exactly how it used to escape
     * both the row and the fallback. */
    const routed = route_diagnostics(real, document, { node_id: "end", row_counts: { inputs: 1, outputs: 0 } });
    expect(routed.node.map((d) => d.message)).toContain("a row that is not rendered");
  });

  test("another node's problem is scoped, not hidden", () => {
    const routed = route_diagnostics(real, document, { node_id: "end", row_counts: { inputs: 1, outputs: 0 } });
    expect(routed.elsewhere.map((d) => d.message)).toContain("belongs to another node");
  });

  test("a rendered row still gets its own", () => {
    const routed = route_diagnostics(real, document, { node_id: "end", row_counts: { inputs: 1, outputs: 0 } });
    expect(routed.rows.inputs[0].map((d) => d.code)).toEqual(["unknown_field"]);
  });

  test("every entry carries where it belongs, so the fallback can say so", () => {
    const routed = route_diagnostics(real, document, { node_id: "end", row_counts: { inputs: 1, outputs: 0 } });
    expect(diagnostic_location_label(real[0], document)).toMatch(/graph/i);
    expect(diagnostic_location_label(real[1], document)).toMatch(/edge/i);
    expect(diagnostic_location_label(real[5], document)).toMatch(/start/);
    expect(routed.elsewhere.length).toBeGreaterThan(0);
  });
});
