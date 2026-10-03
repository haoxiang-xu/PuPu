import {
  diagnostic_target,
  diagnostics_for_node,
  diagnostics_for_row,
  has_diagnostics,
  normalize_diagnostics,
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
