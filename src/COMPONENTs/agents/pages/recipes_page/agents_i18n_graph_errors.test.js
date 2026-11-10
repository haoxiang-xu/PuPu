import { apply_graph_command } from "./skeleton_graph_commands";
import { add_node, connect_nodes, delete_node, delete_edge, flow_outlets } from "./skeleton_graph_edits";
import { new_embedded_entry } from "./new_embedded_entry";
import { compile_recipe_graph } from "./recipe_graph";
import { agentMessage, agentProblemMessage } from "./agents_i18n";

const t = (key, vars) => `T:${key}:${JSON.stringify(vars || {})}`;
const graph = { schema_version: 1, kind: "agent", id: "raw", name: "raw name", nodes: [], edges: [] };
test("native command refusal only changes its presentation, never the graph or error code", () => {
  const inputs = [{ type: "rename_node", node_id: "raw", label: " " }, { type: "connect", connection: {} }, { type: "unknown" }];
  for (const command of inputs) {
    const original = apply_graph_command(graph, command); const translated = apply_graph_command(graph, command, t);
    expect(translated.document).toBe(original.document); expect(translated.ok).toBe(original.ok); expect(translated.problem.code).toBe(original.problem.code);
    expect(translated.problem.message).toMatch(/^T:agents\.graph\./);
  }
});
test("native graph-edit refusals retain all identity and structure with translated explanations", () => {
  const inputs = [[add_node, [graph, { type: "start" }]], [delete_node, [graph, "opaque-id"]],
    [delete_edge, [graph, "opaque-edge"]], [connect_nodes, [graph, { kind: "flow", source_node_id: "a", target_node_id: "b", source_port_id: "out", target_port_id: "in" }]]];
  for (const [fn, args] of inputs) {
    const original = fn(...args); const translated = fn(...args, t);
    expect(translated.document).toBe(original.document); expect(translated.ok).toBe(original.ok); expect(translated.problem.code).toBe(original.problem.code);
    expect(translated.problem.message).toMatch(/^T:agents\.graph\./);
  }
  expect(flow_outlets(null, t).problem).toMatch(/^T:agents\.graph\./);
});
test("embedded creation refusal can carry current presentation without changing its default output or invoking random", () => {
  const randomBytes = jest.fn(); const args = { rootDocument: null, entries: [], randomBytes };
  const original = new_embedded_entry(args); const translated = new_embedded_entry(args, t);
  expect({ ...translated, problem: original.problem }).toEqual(original); expect(translated.problem).toMatch(/^T:agents\./);
  expect(randomBytes).not.toHaveBeenCalled();
});
test("locally compiled legacy graph errors retain normal Error messages and private presentation ownership", () => {
  let error;
  try { compile_recipe_graph({ nodes: [], edges: [] }); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(Error); expect(error.code).toBe("recipe_graph_invalid");
  expect(agentProblemMessage(error, t)).toMatch(/^T:agents\.graph\./);
});

test("native UI problem notices preserve serialized English diagnostics while carrying owned language provenance", () => {
  const command = { type: "rename_node", node_id: "raw", label: " " };
  const english = apply_graph_command(graph, command);
  const shown = apply_graph_command(graph, command, agentMessage);
  expect(JSON.stringify(shown)).toBe(JSON.stringify(english));
  expect(agentProblemMessage(shown.problem, t)).toMatch(/^T:agents\.graph\./);
});
