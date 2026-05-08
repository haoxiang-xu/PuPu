import { compute_variable_scope } from "./variable_scope";

const node = (over) => ({
  id: "x",
  type: "agent",
  outputs: [{ name: "output", type: "string" }],
  ...over,
});
const flow_edge = (src, tgt) => ({
  id: `e_${src}_${tgt}`,
  source_node_id: src,
  source_port_id: "out",
  target_node_id: tgt,
  target_port_id: "in",
  kind: "flow",
});
const attach_edge = (src, tgt) => ({
  id: `a_${src}_${tgt}`,
  source_node_id: src,
  source_port_id: "attach_top",
  target_node_id: tgt,
  target_port_id: "attach_bot",
  kind: "attach",
});

describe("compute_variable_scope", () => {
  test("returns empty when no upstream", () => {
    const nodes = [node({ id: "a1" })];
    expect(compute_variable_scope("a1", nodes, [])).toEqual([]);
  });

  test("returns start outputs when directly upstream", () => {
    const nodes = [
      node({
        id: "start",
        type: "start",
        outputs: [
          { name: "text", type: "string" },
          { name: "images", type: "image[]" },
        ],
      }),
      node({ id: "a1" }),
    ];
    const scope = compute_variable_scope("a1", nodes, [flow_edge("start", "a1")]);
    expect(scope.map((v) => `${v.node_id}.${v.field}`)).toEqual([
      "start.text",
      "start.images",
    ]);
  });

  test("collects transitive upstream chain", () => {
    const nodes = [
      node({ id: "start", type: "start", outputs: [{ name: "text", type: "string" }] }),
      node({ id: "a1" }),
      node({ id: "a2" }),
    ];
    const edges = [flow_edge("start", "a1"), flow_edge("a1", "a2")];
    const scope = compute_variable_scope("a2", nodes, edges);
    const pairs = scope.map((v) => `${v.node_id}.${v.field}`);
    expect(pairs).toContain("start.text");
    expect(pairs).toContain("a1.output");
  });

  test("ignores attach edges (plugins are not upstream)", () => {
    const nodes = [
      node({ id: "a1" }),
      node({ id: "tp1", type: "toolpool", outputs: [] }),
      node({ id: "a2" }),
    ];
    const edges = [attach_edge("a1", "tp1"), flow_edge("a1", "a2")];
    const scope = compute_variable_scope("a2", nodes, edges);
    const node_ids = scope.map((v) => v.node_id);
    expect(node_ids).not.toContain("tp1");
    expect(node_ids).toContain("a1");
  });

  test("does not include self", () => {
    const nodes = [node({ id: "a1" })];
    const edges = [flow_edge("a1", "a1")];
    expect(compute_variable_scope("a1", nodes, edges)).toEqual([]);
  });
});
