import capture from "./skeleton_toolkit_capture.json";
import { node_toolkit_refs, read_toolkit_catalog, toolkit_pool_problems, with_toolkit_config } from "./toolkit_pool_config";

test("drawings follow the host's legacy-field presence rule without a truthy fallback", () => {
  const list = [{ id: "core", enabled_tools: null }];
  expect(node_toolkit_refs({ config: { toolkits: list } })).toBe(list);
  expect(node_toolkit_refs({ config: { legacy_fields: { toolkits: list } } })).toBe(list);
  expect(node_toolkit_refs({ config: { legacy_fields: null, toolkits: list } })).toBeUndefined();
});

test("strict directory reader retains real IDs and every tool name; extension metadata is allowed", () => {
  const rows = read_toolkit_catalog({ ...capture.catalog, future: true });
  expect(rows.map((r) => r.toolkitId)).toEqual(capture.binding.catalog_admission.map((r) => r.id));
  rows.forEach((r, i) => expect(r.tools.map((t) => t.name)).toEqual(capture.binding.catalog_admission[i].names));
});
test.each([null, {}, { toolkits: null }, { toolkits: [null] }, { toolkits: [{ toolkitId: { toString: null }, tools: [] }] }, { toolkits: [{ toolkitId: "core", tools: [{ name: "read" }, { name: "read" }] }] }])("malformed directory is not empty: %j", (reply) => {
  expect(() => read_toolkit_catalog(reply)).toThrow();
});
test("duplicate toolkit IDs and bad names are refused without object-key coercion", () => {
  const row = capture.catalog.toolkits[0];
  expect(() => read_toolkit_catalog({ toolkits: [row, row] })).toThrow();
  expect(() => read_toolkit_catalog({ toolkits: [{ ...row, tools: [{ name: { toString: null } }] }] })).toThrow();
});
test("null, explicit empty and subsets express different admitted selections", () => {
  for (const name of ["all", "none", "enabled_2", "empty_pool"]) {
    const row = capture.binding.cases.find((r) => r.case === name);
    expect(row.ok).toBe(true);
    expect(toolkit_pool_problems(row.config)).toEqual([]);
  }
});
test.each(capture.binding.cases.filter((r) => !r.ok && !["entry_10", "enabled_3", "duplicate_alias"].includes(r.case)))("structural problems are visible: $case", (row) => {
  expect(toolkit_pool_problems(row.config).length).toBeGreaterThan(0);
});
test("changing one pool preserves unrelated content and refuses ambiguous or legacy targets", () => {
  const config = { toolkits: [{ id: "core", enabled_tools: ["read"] }], merge_with_user_selected: false, future: { keep: true } };
  const pool = { id: "p", type: "toolkit_pool", config };
  const graph = { schema_version: 1, kind: "agent", nodes: [pool, { id: "agent", config: { keep: 1 } }], edges: [] };
  const next = { ...config, merge_with_user_selected: true };
  const edited = with_toolkit_config(graph, "p", next);
  expect(edited.nodes[0].config).toBe(next);
  expect(edited.nodes[1]).toBe(graph.nodes[1]);
  expect(edited.edges).toBe(graph.edges);
  expect(next.future).toBe(config.future);
  const duplicated = { ...graph, nodes: [pool, pool] };
  expect(with_toolkit_config(duplicated, "p", next)).toBe(duplicated);
  const legacy = { ...graph, nodes: [{ ...pool, config: { legacy_fields: config } }] };
  expect(with_toolkit_config(legacy, "p", next)).toBe(legacy);
});
