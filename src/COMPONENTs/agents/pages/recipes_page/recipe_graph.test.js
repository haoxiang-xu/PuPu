import { compile_recipe_graph } from "./recipe_graph";

const start = { id: "start", type: "start", outputs: [{ name: "text", type: "string" }] };
const end = { id: "end", type: "end" };
const agent = (id, prompt = "") => ({
  id,
  type: "agent",
  override: { prompt },
  outputs: [{ name: "output", type: "string" }],
});
const flow = (source, target) => ({
  id: `e_${source}_${target}`,
  kind: "flow",
  source_node_id: source,
  source_port_id: "out",
  target_node_id: target,
  target_port_id: "in",
});
const attach = (agent_id, pool_id) => ({
  id: `a_${agent_id}_${pool_id}`,
  kind: "attach",
  source_node_id: agent_id,
  source_port_id: "attach_top",
  target_node_id: pool_id,
  target_port_id: "attach_bot",
});

function recipe(nodes, edges) {
  return { name: "X", nodes, edges };
}

test("compiles a linear multi-agent graph", () => {
  const compiled = compile_recipe_graph(
    recipe(
      [start, agent("a1"), agent("a2", "{{#a1.output#}}"), end],
      [flow("start", "a1"), flow("a1", "a2"), flow("a2", "end")],
    ),
  );
  expect(compiled.agents.map((node) => node.id)).toEqual(["a1", "a2"]);
});

test("canonicalizes legacy toolpool nodes to toolkit_pool", () => {
  const compiled = compile_recipe_graph(
    recipe(
      [
        start,
        agent("a1"),
        end,
        { id: "tp", type: "toolpool", toolkits: [{ id: "core" }] },
      ],
      [flow("start", "a1"), flow("a1", "end"), attach("a1", "tp")],
    ),
  );
  expect(compiled.nodes.find((node) => node.id === "tp").type).toBe("toolkit_pool");
  expect(compiled.toolkits).toEqual([{ id: "core" }]);
});

test("rejects branching", () => {
  expect(() =>
    compile_recipe_graph(
      recipe(
        [start, agent("a1"), agent("a2"), end],
        [
          flow("start", "a1"),
          flow("start", "a2"),
          flow("a1", "end"),
          flow("a2", "end"),
        ],
      ),
    ),
  ).toThrow(/multiple flow outputs|multiple flow inputs/);
});

test("rejects invalid variable references", () => {
  expect(() =>
    compile_recipe_graph(
      recipe(
        [start, agent("a1", "{{#a2.output#}}"), agent("a2"), end],
        [flow("start", "a1"), flow("a1", "a2"), flow("a2", "end")],
      ),
    ),
  ).toThrow(/not upstream/);
});
