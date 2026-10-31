import {
  ADDABLE_NODE_TYPES,
  add_node,
  connect_nodes,
  delete_node,
  flow_outlets,
  new_agent_document,
} from "./skeleton_graph_edits";

/* Branch nodes in the pure authoring core (#351).
 *
 * The rules mirrored here were measured on the fixed installed pair before any
 * of this was written (native-advanced/branch-351/branch-candidate-capture-01):
 *   - seeds `if_else {execution:{inputs:[]}}` and
 *     `switch_case {execution:{inputs:[],cases:[]}}` save as unfinished drafts;
 *   - if_else leaves through exactly `true` and `false`, switch_case through
 *     each case id plus `default`, every other flow node through `out`;
 *   - several edges into one inlet are a legal rejoin, one edge per outlet.
 * The store and runtime stay authoritative; the core refuses what they would
 * refuse at the graph level and hands back the original object when it does. */

const seed = () => new_agent_document({ id: "branch-core", name: "Branch core" }).document;
const flow = (source_node_id, target_node_id, source_port_id = "out") => ({
  kind: "flow", source_node_id, source_port_id, target_node_id, target_port_id: "in",
});
const ok = (result) => {
  expect(result.ok).toBe(true);
  expect(result.problem).toBeNull();
  return result.document;
};
const refused = (result, original, code) => {
  expect(result.ok).toBe(false);
  expect(result.document).toBe(original);
  expect(result.problem.code).toBe(code);
  expect(typeof result.problem.message).toBe("string");
};
const withSwitchCases = (document, node_id, cases) => ({
  ...document,
  nodes: document.nodes.map((node) => node.id === node_id
    ? { ...node, config: { ...node.config, execution: { ...node.config.execution, cases } } }
    : node),
});
/* Start → Agent → If, with the factory's agent → end edge removed so the
   branch has somewhere to go. */
const ifGraph = () => {
  const added = ok(add_node(seed(), { type: "if_else" }));
  return {
    ...added,
    edges: [...added.edges.filter((edge) => edge.id !== "flow-agent-end")],
  };
};

test("the branch types are addable alongside the native types that already had editors", () => {
  expect([...ADDABLE_NODE_TYPES]).toEqual(["toolkit_pool", "agent", "subagent_pool", "if_else", "switch_case"]);
});

test("new branch nodes carry exactly the measured unfinished seeds and nothing invented", () => {
  const withIf = ok(add_node(seed(), { type: "if_else" }));
  expect(withIf.nodes.at(-1)).toStrictEqual({ id: "if", type: "if_else", config: { execution: { inputs: [] } } });
  const withSwitch = ok(add_node(withIf, { type: "switch_case" }));
  expect(withSwitch.nodes.at(-1)).toStrictEqual({
    id: "switch", type: "switch_case", config: { execution: { inputs: [], cases: [] } },
  });
  expect(ok(add_node(withSwitch, { type: "if_else" })).nodes.at(-1).id).toBe("if-2");
});

test("if_else leaves through true and false only; both may rejoin the same inlet", () => {
  const graph = ifGraph();
  const wiredIn = ok(connect_nodes(graph, flow("agent", "if")));
  const trueEnd = ok(connect_nodes(wiredIn, flow("if", "end", "true")));
  const both = ok(connect_nodes(trueEnd, flow("if", "end", "false")));
  expect(both.edges.slice(-2)).toStrictEqual([
    { id: "flow-if-end", ...flow("if", "end", "true") },
    { id: "flow-if-end-2", ...flow("if", "end", "false") },
  ]);
  refused(connect_nodes(wiredIn, flow("if", "end")), wiredIn, "unknown_port");
  refused(connect_nodes(wiredIn, flow("if", "end", "maybe")), wiredIn, "unknown_port");
  refused(connect_nodes(both, flow("if", "agent", "true")), both, "outlet_occupied");
});

test("a branch outlet may lead into another branch or back into the flow, never into a cycle", () => {
  const graph = ok(add_node(ifGraph(), { type: "switch_case" }));
  const a = ok(connect_nodes(graph, flow("agent", "if")));
  const b = ok(connect_nodes(a, flow("if", "switch", "true")));
  refused(connect_nodes(b, flow("switch", "agent", "default")), b, "flow_cycle");
  refused(connect_nodes(b, flow("if", "if", "false")), b, "self_connection");
  const c = ok(connect_nodes(b, flow("switch", "end", "default")));
  expect(c.edges.at(-1)).toMatchObject(flow("switch", "end", "default"));
});

test("switch_case leaves through each declared case id and default, by id not by value", () => {
  const graph = withSwitchCases(ok(add_node(seed(), { type: "switch_case" })), "switch", [
    { id: "case-1", value: "a" }, { id: "case-2", value: 2 },
  ]);
  expect(flow_outlets(graph.nodes.at(-1))).toStrictEqual({ ok: true, outlets: ["case-1", "case-2", "default"], problem: null });
  const one = ok(connect_nodes(graph, flow("switch", "end", "case-1")));
  const two = ok(connect_nodes(one, flow("switch", "end", "default")));
  refused(connect_nodes(two, flow("switch", "end", "a")), two, "unknown_port");
  refused(connect_nodes(two, flow("switch", "end", "out")), two, "unknown_port");
  refused(connect_nodes(two, flow("switch", "end", "case-1")), two, "outlet_occupied");
});

test("a switch whose cases cannot be read is not wired by guessing its outlets", () => {
  for (const cases of [undefined, "a,b", [null], [{ id: "" }], [{ id: "x" }, { id: "x" }], [{ id: "default" }]]) {
    const node = { id: "switch", type: "switch_case", config: { execution: { inputs: [], ...(cases === undefined ? {} : { cases }) } } };
    const graph = { ...seed(), nodes: [...seed().nodes, node] };
    const outlets = flow_outlets(node);
    expect(outlets.ok).toBe(false);
    expect(outlets.outlets).toBeNull();
    refused(connect_nodes(graph, flow("switch", "end", "default")), graph, "unreadable_outlets");
  }
});

test("outlets of the other flow nodes and of nodes that never leave", () => {
  const [start, agent, end] = seed().nodes;
  expect(flow_outlets(start).outlets).toEqual(["out"]);
  expect(flow_outlets(agent).outlets).toEqual(["out"]);
  expect(flow_outlets(end)).toStrictEqual({ ok: true, outlets: [], problem: null });
  expect(flow_outlets({ id: "pool", type: "subagent_pool", config: {} }).outlets).toEqual([]);
  expect(flow_outlets({ id: "if", type: "if_else", config: "broken" }).outlets).toEqual(["true", "false"]);
  expect(flow_outlets(null).ok).toBe(false);
});

test("branch nodes take flow in from start, agents and other branches; pools still never take part", () => {
  const graph = { ...ok(add_node(ok(add_node(ifGraph(), { type: "subagent_pool" })), { type: "switch_case" })), edges: [] };
  ok(connect_nodes(graph, flow("start", "if")));
  ok(connect_nodes(graph, flow("if", "switch", "false")));
  refused(connect_nodes(graph, flow("pool", "if")), graph, "invalid_flow_source");
  refused(connect_nodes(graph, flow("if", "pool", "true")), graph, "invalid_flow_target");
  refused(connect_nodes(graph, flow("end", "if")), graph, "invalid_flow_source");
  refused(connect_nodes(graph, flow("if", "start", "true")), graph, "invalid_flow_target");
  refused(connect_nodes(graph, { ...flow("if", "end", "true"), target_port_id: "true" }), graph, "unknown_port");
  refused(connect_nodes(graph, { kind: "attach", source_node_id: "if", source_port_id: "attach_top", target_node_id: "pool", target_port_id: "attach_top" }), graph, "invalid_attachment");
});

test("deleting a branch removes exactly its incident edges and leaves downstream bindings for diagnose", () => {
  const graph = ok(connect_nodes(ok(connect_nodes(ifGraph(), flow("agent", "if"))), flow("if", "end", "true")));
  const bound = {
    ...graph,
    nodes: graph.nodes.map((node) => node.id === "end"
      ? { ...node, config: { execution: { inputs: [{ name: "m", value: { kind: "ref", node_id: "agent", path: ["message"] }, missing: "error" }], outputs: [] } } }
      : node),
  };
  const removed = ok(delete_node(bound, "if"));
  expect(removed.nodes.map((node) => node.id)).toEqual(["start", "agent", "end"]);
  expect(removed.edges.map((edge) => edge.id)).toEqual(["flow-start-agent"]);
  expect(removed.nodes[2]).toBe(bound.nodes[2]);
});
