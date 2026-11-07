import { new_agent_document, add_node } from "./skeleton_graph_edits";
import { apply_graph_command } from "./skeleton_graph_commands";

const seed = () => new_agent_document({ id: "native-canvas", name: "Canvas" }).document;
const extra = (graph, type = "agent") => add_node(graph, { type }).document;
const connection = (from, to, source = "out", target = "in") => ({
  source_node_id: from, source_port_id: source, target_node_id: to, target_port_id: target,
});
const command = (graph, type, args = {}) => apply_graph_command(graph, { type, ...args });

test("adds only native supported nodes without drawing fields", () => {
  const result = command(seed(), "add_node", { node_type: "subagent_pool" });
  expect(result.ok).toBe(true);
  expect(result.document.nodes.at(-1)).toStrictEqual({ id: "pool", type: "subagent_pool", config: { subagents: [] } });
  /* Every native type is addable since #357; an unknown one is not. */
  expect(command(seed(), "add_node", { node_type: "some_future_step" }).ok).toBe(false);
});

test("a reverse inlet drag becomes the same native flow as an outlet drag", () => {
  const graph = extra({ ...seed(), edges: [] });
  const result = command(graph, "connect", { connection: connection("agent-2", "agent", "in", "out") });
  expect(result.ok).toBe(true);
  expect(result.document.edges[0]).toMatchObject({ kind: "flow", ...connection("agent", "agent-2") });
});

test.each([["attach_top", "attach_top"], ["attach_bot", "attach_bot"], ["attach_top", "attach_bot"], ["attach_bot", "attach_top"]])(
  "attach %s to %s preserves either drag direction", (from, to) => {
    const graph = extra(seed(), "subagent_pool");
    for (const pair of [["agent", "pool"], ["pool", "agent"]]) {
      const result = command(graph, "connect", { connection: connection(...pair, from, to) });
      expect(result.ok).toBe(true);
      expect(result.document.edges.at(-1)).toMatchObject({ kind: "attach", ...connection(...pair, from, to) });
    }
  },
);

test("batch deletion is one atomic result; protected nodes roll the entire command back", () => {
  const graph = extra(seed());
  const edge = graph.edges[0];
  const rejected = command(graph, "delete", { node_ids: ["agent-2", "start"], edge_ids: [edge.id] });
  expect(rejected.ok).toBe(false);
  expect(rejected.document).toBe(graph);
  const result = command(graph, "delete", { node_ids: ["agent", "agent"], edge_ids: [edge.id, edge.id] });
  expect(result.ok).toBe(true);
  expect(result.document.nodes.map((n) => n.id)).toEqual(["start", "end", "agent-2"]);
  expect(result.document.edges).toEqual([]);
  expect(graph.nodes).toHaveLength(4);
});

test("disconnect leaves the node and all consumer bindings alone", () => {
  const graph = seed();
  const result = command(graph, "disconnect", { node_id: "agent" });
  expect(result.ok).toBe(true);
  expect(result.document.nodes).toBe(graph.nodes);
  expect(result.document.edges).toEqual([]);
  expect(command(result.document, "disconnect", { node_id: "agent" }).document).toBe(result.document);
  expect(command(graph, "disconnect", { node_id: "absent" }).ok).toBe(false);
});

test("reconnect retains edge position, id, unknown values and all unaffected objects", () => {
  const original = extra(seed());
  const old = { ...original.edges[0], unexpected: { preserved: true } };
  const graph = { ...original, edges: [old, original.edges[1]] };
  const result = command(graph, "reconnect", { edge_id: old.id, connection: connection("start", "agent-2") });
  expect(result.ok).toBe(true);
  expect(result.document.edges.map((e) => e.id)).toEqual(graph.edges.map((e) => e.id));
  expect(result.document.edges[0]).toMatchObject({ ...old, target_node_id: "agent-2" });
  expect(result.document.edges[0].unexpected).toBe(old.unexpected);
  expect(result.document.edges[1]).toBe(graph.edges[1]);
  expect(result.document.nodes).toBe(graph.nodes);
});

test.each([null, connection("agent", "agent"), connection("end", "start"), connection("agent", "end", "out", "bogus")])(
  "failed or cancelled reconnection retains the original graph: %j", (next) => {
    const graph = seed();
    const result = command(graph, "reconnect", { edge_id: graph.edges[0].id, connection: next });
    expect(result.ok).toBe(false);
    expect(result.document).toBe(graph);
    expect(result.problem.message).toBeTruthy();
  },
);

test("outlet and cycle refusals preserve the graph, but flow joins are accepted", () => {
  const graph = extra(seed());
  expect(command(graph, "connect", { connection: connection("agent", "agent-2") }).document).toBe(graph);
  const joined = command(graph, "connect", { connection: connection("agent-2", "end") });
  expect(joined.ok).toBe(true);
  const detached = command(graph, "disconnect", { node_id: "agent" }).document;
  const forward = command(detached, "connect", { connection: connection("agent", "agent-2") }).document;
  const cycle = command(forward, "connect", { connection: connection("agent-2", "agent") });
  expect(cycle.ok).toBe(false);
  expect(cycle.document).toBe(forward);
});

test.each([null, {}, { type: "__proto__" }, { type: "delete", node_ids: [null], edge_ids: [] }, { type: "delete", node_ids: [], edge_ids: [], x: 5 }, { type: "connect", connection: { toString: null } }])(
  "malformed commands refuse without coercion or normalization: %j", (next) => {
    const graph = seed();
    expect(() => apply_graph_command(graph, next)).not.toThrow();
    expect(apply_graph_command(graph, next)).toMatchObject({ ok: false, document: graph });
  },
);

 describe("atomic native node rename", () => {
  test.each(["  审核 e\u0301\n", "\ufeff", "\u0085name\u0085"])("only patches label and preserves exact text: %j", (label) => {
    const original = seed();
    const graph = { ...original, unrelated: { keep: true }, nodes: original.nodes.map((node) => ({ ...node, extra: { keep: true } })) };
    const result = command(graph, "rename_node", { node_id: "agent", label });
    expect(result.ok).toBe(true);
    expect(result.problem).toBeNull();
    expect(result.document).toEqual({ ...graph, nodes: graph.nodes.map((node) => node.id === "agent" ? { ...node, label } : node) });
    expect(result.document.edges).toBe(graph.edges);
    expect(result.document.unrelated).toBe(graph.unrelated);
    graph.nodes.forEach((node, index) => {
      if (node.id !== "agent") expect(result.document.nodes[index]).toBe(node);
      else {
        expect(result.document.nodes[index].config).toBe(node.config);
        expect(result.document.nodes[index].extra).toBe(node.extra);
        expect(node).not.toHaveProperty("label");
      }
    });
    const same = command(result.document, "rename_node", { node_id: "agent", label });
    expect(same.ok).toBe(true);
    expect(same.document).toBe(result.document);
  });

  test("valid input repairs only a malformed target label", () => {
    const original = seed();
    const bad = { toString: null };
    const graph = { ...original, nodes: original.nodes.map((node) => ({ ...node, label: bad })) };
    const result = command(graph, "rename_node", { node_id: "agent", label: "Repaired" });
    expect(result.ok).toBe(true);
    expect(result.document.nodes.find((node) => node.id === "agent").label).toBe("Repaired");
    expect(result.document.nodes.find((node) => node.id === "start")).toBe(graph.nodes[0]);
    expect(graph.nodes.find((node) => node.id === "agent").label).toBe(bad);
  });

  test.each([null, undefined, true, 3, {}, [], "", " \t\u0085\u001c\u3000"])("bad label is refused atomically: %j", (label) => {
    const graph = seed();
    const result = command(graph, "rename_node", { node_id: "agent", label });
    expect(result.ok).toBe(false);
    expect(result.document).toBe(graph);
    expect(result.problem.code).toBe(typeof label === "string" ? "invalid_value" : "invalid_type");
  });

  test.each([
    { type: "rename_node", node_id: "agent" },
    { type: "rename_node", node_id: "agent", label: "Valid", extra: true },
    { type: "rename_node", node_id: {}, label: "Valid" },
    { type: "rename_node", node_id: "", label: "Valid" },
  ])("malformed closed rename command is refused: %j", (next) => {
    const graph = seed();
    const result = apply_graph_command(graph, next);
    expect(result).toMatchObject({ ok: false, document: graph, problem: { code: "invalid_command" } });
    expect(result.document).toBe(graph);
  });

  test("missing or duplicate ids are refused without normalizing the graph", () => {
    const graph = seed();
    const missing = command(graph, "rename_node", { node_id: "absent", label: "Valid" });
    expect(missing).toMatchObject({ ok: false, problem: { code: "missing_node" } });
    expect(missing.document).toBe(graph);
    const ambiguous = { ...graph, nodes: [...graph.nodes, { ...graph.nodes.find((node) => node.id === "agent") }] };
    const duplicate = command(ambiguous, "rename_node", { node_id: "agent", label: "Valid" });
    expect(duplicate).toMatchObject({ ok: false, problem: { code: "ambiguous_node" } });
    expect(duplicate.document).toBe(ambiguous);
  });
});
