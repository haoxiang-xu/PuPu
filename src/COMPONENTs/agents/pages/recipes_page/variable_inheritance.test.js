import { apply_graph_command } from "./skeleton_graph_commands";
import { new_agent_document } from "./skeleton_graph_edits";
import { STARTER_CODE, code_problems } from "./code_config";
import { INHERITANCE_ADAPTERS, with_inherited_variables } from "./variable_inheritance";
import { binding_problems, output_mapping_problems } from "./skeleton_io";
import { result_root_problems } from "./detail_panel/output_variables_section";

/* Variable inheritance (Code only): a user connect fills an untouched Code
   node from what its new upstream passes on, as one edit. */

const run = (graph, command) => {
  const result = apply_graph_command(graph, command);
  if (!result.ok) throw new Error(JSON.stringify(result.problem));
  return result;
};
const connect = (graph, from, to) => run(graph, { type: "connect", connection: { source_node_id: from, source_port_id: "out", target_node_id: to, target_port_id: "in" } });
const nodeOf = (graph, id) => graph.nodes.find((node) => node.id === id);
const withOutputs = (graph, id, outputs) => ({ ...graph, nodes: graph.nodes.map((node) => (node.id === id ? { ...node, config: { ...node.config, execution: { ...node.config.execution, outputs } } } : node)) });

/* A Start and an Agent whose JSON Output declares `score`; a new
   Code node added beside them, unwired. */
function fixture() {
  /* No edges: each outlet takes one, and each test wires its own. */
  let graph = { ...new_agent_document({ id: "inherit", name: "Inherit" }).document, edges: [] };
  graph = withOutputs(graph, "start", [{ name: "message", source: { kind: "result", path: ["message"] } }]);
  graph = { ...graph, nodes: graph.nodes.map((node) => (node.id === "agent" ? { ...node, config: { ...node.config, kernel: { json_schema: { type: "object", properties: { score: { type: "integer" } } } } } } : node)) };
  graph = withOutputs(graph, "agent", [
    { name: "reply", source: { kind: "result", path: ["message"] } },
    { name: "score", source: { kind: "result", path: ["score"] } },
  ]);
  const added = run(graph, { type: "add_node", node_type: "code" });
  return { graph: added.document, sources: added.sources };
}

const problemsOf = (graph, sources, id) => {
  const node = nodeOf(graph, id);
  const mappings = node.config.execution.outputs;
  return [
    ...code_problems(node, null, sources),
    ...binding_problems(node.config.execution.inputs),
    ...output_mapping_problems(mappings),
    ...result_root_problems(node, mappings),
  ];
};

test("only Code is enabled", () => {
  expect(Object.keys(INHERITANCE_ADAPTERS)).toEqual(["code"]);
});

test("a fresh Code node, unconnected, has no inputs and no problems, and its starter runs with none", () => {
  const { graph, sources } = fixture();
  const code = nodeOf(graph, "code");
  expect(code.config.execution).toEqual({ inputs: [], outputs: [] });
  expect(code.config.code.result_schema).toEqual({ type: "object", properties: {}, additionalProperties: false });
  expect(Object.values(sources)).toEqual([STARTER_CODE]);
  expect(STARTER_CODE).toContain("return dict(input)");
  expect(problemsOf(graph, sources, "code")).toEqual([]);
});

test("connect: the inputs inherit every upstream output; the Result and the outputs mirror them, typed where the upstream declares a type", () => {
  const { graph, sources } = fixture();
  const connected = connect(graph, "agent", "code");
  const code = nodeOf(connected.document, "code");
  expect(code.config.execution.inputs).toEqual([
    { name: "reply", value: { kind: "ref", node_id: "agent", path: ["reply"] }, missing: "error" },
    { name: "score", value: { kind: "ref", node_id: "agent", path: ["score"] }, missing: "error" },
  ]);
  expect(code.config.execution.outputs).toEqual([
    { name: "reply", source: { kind: "result", path: ["reply"] } },
    { name: "score", source: { kind: "result", path: ["score"] } },
  ]);
  expect(code.config.code.result_schema).toEqual({
    type: "object",
    properties: { reply: { type: "string" }, score: { type: "integer" } },
    required: ["reply", "score"],
    additionalProperties: false,
  });
  /* The edge and the variables are one edit: one undo step. */
  expect(connected.document.edges.some((edge) => edge.source_node_id === "agent" && edge.target_node_id === "code")).toBe(true);
  expect(problemsOf(connected.document, { ...sources, ...connected.sources }, "code")).toEqual([]);
});

test("an upstream whose types are unknown leaves those fields undeclared and the Result open — still no problem", () => {
  const { graph, sources } = fixture();
  const connected = connect(graph, "start", "code").document;
  const code = nodeOf(connected, "code");
  expect(code.config.execution.inputs.map((binding) => binding.name)).toEqual(["message"]);
  expect(code.config.code.result_schema).toEqual({ type: "object", properties: {} });
  expect(problemsOf(connected, sources, "code")).toEqual([]);
});

test("reconnecting an untouched node to another upstream replaces the inheritance", () => {
  const { graph } = fixture();
  const first = connect(graph, "start", "code").document;
  const edge = first.edges.find((entry) => entry.target_node_id === "code");
  const moved = run(first, { type: "reconnect", edge_id: edge.id, connection: { source_node_id: "agent", source_port_id: "out", target_node_id: "code", target_port_id: "in" } }).document;
  expect(nodeOf(moved, "code").config.execution.inputs.map((binding) => binding.name)).toEqual(["reply", "score"]);
});

test.each([
  ["an input", (node) => ({ ...node, config: { ...node.config, execution: { ...node.config.execution, inputs: [{ ...node.config.execution.inputs[0], name: "mine" }] } } })],
  ["the outputs", (node) => ({ ...node, config: { ...node.config, execution: { ...node.config.execution, outputs: [] } } })],
  ["the Result", (node) => ({ ...node, config: { ...node.config, code: { ...node.config.code, result_schema: { type: "object", properties: {} , additionalProperties: true } } } })],
  ["the code", (node) => ({ ...node, config: { ...node.config, code: { ...node.config.code, source: { kind: "file", path: "tools/mine.py" } } } })],
])("once the author edits %s, a reconnect leaves the node exactly as they left it", (_label, edit) => {
  const { graph } = fixture();
  const first = connect(graph, "start", "code").document;
  const edited = { ...first, nodes: first.nodes.map((node) => (node.id === "code" ? edit(node) : node)) };
  const edge = edited.edges.find((entry) => entry.target_node_id === "code");
  const moved = run(edited, { type: "reconnect", edge_id: edge.id, connection: { source_node_id: "agent", source_port_id: "out", target_node_id: "code", target_port_id: "in" } }).document;
  expect(nodeOf(moved, "code")).toEqual(nodeOf(edited, "code"));
});

test("disconnecting leaves the inherited inputs as they are", () => {
  const { graph } = fixture();
  const connected = connect(graph, "agent", "code").document;
  const inputs = nodeOf(connected, "code").config.execution.inputs;
  const cut = run(connected, { type: "disconnect", node_id: "code" }).document;
  expect(nodeOf(cut, "code").config.execution.inputs).toEqual(inputs);
});

test("a second upstream adds the names the first did not offer, the first keeping a shared name", () => {
  const { graph } = fixture();
  const one = connect(graph, "agent", "code").document;
  const both = connect(one, "start", "code").document;
  expect(nodeOf(both, "code").config.execution.inputs.map((binding) => [binding.name, binding.value.node_id]))
    .toEqual([["reply", "agent"], ["score", "agent"], ["message", "start"]]);
});

test("attach edges, other node types and documents that did not gain a flow edge are left alone", () => {
  const { graph } = fixture();
  /* An Agent is not enabled: connecting into one inherits nothing. */
  const intoAgent = connect(graph, "start", "agent").document;
  expect(nodeOf(intoAgent, "agent").config.execution).toEqual(nodeOf(graph, "agent").config.execution);
  /* The same document, no new edge: nothing happens (load, paste, import). */
  expect(with_inherited_variables(graph, graph).document).toBe(graph);
});
