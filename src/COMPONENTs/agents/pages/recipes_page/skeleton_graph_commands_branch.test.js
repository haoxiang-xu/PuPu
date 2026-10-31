import { new_agent_document, add_node } from "./skeleton_graph_edits";
import { apply_graph_command } from "./skeleton_graph_commands";

/* Canvas intents that involve branch outlets (#351). FlowEditor reports which
   two ports a drag joined, in whichever direction the author dragged; the
   adapter decides the edge kind from the ports and the core decides whether
   the outlet exists. */

const seed = () => new_agent_document({ id: "branch-canvas", name: "Branch canvas" }).document;
const connection = (from, out, to, into) => ({
  source_node_id: from, source_port_id: out, target_node_id: to, target_port_id: into,
});
const withIf = () => {
  const graph = add_node(seed(), { type: "if_else" }).document;
  return { ...graph, edges: graph.edges.filter((edge) => edge.id !== "flow-agent-end") };
};
const run = (graph, command) => apply_graph_command(graph, command);

test("dragging from a branch outlet to an inlet writes a flow edge from that outlet", () => {
  const result = run(withIf(), { type: "connect", connection: connection("if", "true", "end", "in") });
  expect(result.ok).toBe(true);
  expect(result.document.edges.at(-1)).toStrictEqual({ id: "flow-if-end", kind: "flow", ...connection("if", "true", "end", "in") });
});

test("dragging from an inlet back to a branch outlet is the same edge, reversed", () => {
  const result = run(withIf(), { type: "connect", connection: connection("end", "in", "if", "false") });
  expect(result.ok).toBe(true);
  expect(result.document.edges.at(-1)).toStrictEqual({ id: "flow-if-end", kind: "flow", ...connection("if", "false", "end", "in") });
});

test("a switch case outlet and its default are wired by id", () => {
  const graph = add_node(seed(), { type: "switch_case" }).document;
  const cased = { ...graph, nodes: graph.nodes.map((node) => node.id === "switch"
    ? { ...node, config: { execution: { inputs: [], cases: [{ id: "case-1", value: "a" }] } } } : node) };
  const one = run(cased, { type: "connect", connection: connection("switch", "case-1", "end", "in") });
  expect(one.ok).toBe(true);
  // Dragged from the Agent's inlet to the Switch's default outlet: reversed.
  const two = run(one.document, { type: "connect", connection: connection("agent", "in", "switch", "default") });
  expect(two.ok).toBe(true);
  expect(two.document.edges.at(-1)).toStrictEqual({ id: "flow-switch-agent", kind: "flow", ...connection("switch", "default", "agent", "in") });
  const value = run(two.document, { type: "connect", connection: connection("switch", "a", "end", "in") });
  expect(value.ok).toBe(false);
  expect(value.problem.code).toBe("unknown_port");
  expect(value.document).toBe(two.document);
});

test("pairs that are neither outlet-to-inlet nor two attachment ports are refused without a guess", () => {
  const graph = withIf();
  for (const pair of [connection("if", "true", "agent", "out"), connection("if", "true", "if", "false"),
                      connection("agent", "attach_top", "if", "in"), connection("end", "in", "agent", "in")]) {
    const result = run(graph, { type: "connect", connection: pair });
    expect(result.ok).toBe(false);
    expect(result.document).toBe(graph);
  }
});

test("reconnecting a branch edge keeps its id, position and outlet, and a refused move keeps the edge", () => {
  const wired = run(withIf(), { type: "connect", connection: connection("if", "true", "end", "in") }).document;
  const chained = run(wired, { type: "connect", connection: connection("agent", "out", "if", "in") }).document;
  const back = run(chained, { type: "reconnect", edge_id: "flow-if-end", connection: connection("if", "true", "agent", "in") });
  expect(back.ok).toBe(false);
  expect(back.problem.code).toBe("flow_cycle");
  expect(back.document).toBe(chained);
  const other = run(chained, { type: "reconnect", edge_id: "flow-if-end", connection: connection("if", "false", "end", "in") });
  expect(other.ok).toBe(true);
  const index = chained.edges.findIndex((edge) => edge.id === "flow-if-end");
  expect(other.document.edges[index]).toStrictEqual({ id: "flow-if-end", kind: "flow", ...connection("if", "false", "end", "in") });
});
