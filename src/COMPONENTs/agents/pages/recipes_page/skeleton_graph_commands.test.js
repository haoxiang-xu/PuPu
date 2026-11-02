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
