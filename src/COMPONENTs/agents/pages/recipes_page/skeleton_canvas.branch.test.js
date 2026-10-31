/* eslint-disable testing-library/no-node-access, testing-library/no-container -- Real graph ports and SVG edges are the interaction surface. */
import React, { useRef, useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import SkeletonCanvas from "./skeleton_canvas";
import { new_agent_document } from "./skeleton_graph_edits";
import { apply_graph_command } from "./skeleton_graph_commands";

/* Branch drawing on the real native canvas (#351). */

let current;
function Harness({ initial }) {
  const [graph, setGraph] = useState(initial);
  const ref = useRef(graph);
  current = graph;
  return <ConfigContext.Provider value={{ theme: {} }}><SkeletonCanvas
    resourceId="branch-canvas" document={graph} commandScope="one" onSelectNode={() => {}}
    onGraphCommand={(command) => {
      const result = apply_graph_command(ref.current, command);
      if (result.ok) { ref.current = result.document; setGraph(result.document); }
      return result;
    }}
  /></ConfigContext.Provider>;
}
const seed = () => new_agent_document({ id: "branch-canvas", name: "Branch canvas" }).document;
const port = (container, id, name) => container.querySelector(`[data-node-id="${id}"][data-port-id="${name}"]`);
const portsOf = (container, id, side) => [...container.querySelectorAll(`[data-node-id="${id}"][data-port-side="${side}"]`)]
  .map((element) => element.getAttribute("data-port-id")).filter((value, index, all) => all.indexOf(value) === index);
beforeEach(() => localStorage.clear());

test("the palette offers both branch steps beside the existing native types, and nothing the core cannot add", () => {
  render(<Harness initial={seed()} />);
  fireEvent.click(screen.getByRole("button", { name: "Add node" }));
  expect(screen.getByTestId("palette-entry-if_else")).toHaveTextContent("If / Else");
  expect(screen.getByTestId("palette-entry-switch_case")).toHaveTextContent("Switch / Case");
  /* Tool Call and Skill Read became addable with #352; the rest are still not the core's to add. */
  expect(screen.getByTestId("palette-entry-tool_call")).toHaveTextContent("Tool call");
  expect(screen.getByTestId("palette-entry-skill_read")).toHaveTextContent("Skill read");
  ["code", "workflow_call", "hooks_pool"].forEach((type) =>
    expect(screen.queryByTestId(`palette-entry-${type}`)).not.toBeInTheDocument());
  fireEvent.click(screen.getByTestId("palette-entry-if_else"));
  expect(current.nodes.at(-1)).toStrictEqual({ id: "if", type: "if_else", config: { execution: { inputs: [] } } });
});

test("one inlet on the left and one outlet port per row on the right, in row order", () => {
  const graph = seed();
  graph.nodes.push({ id: "sw", type: "switch_case", config: { execution: { inputs: [], cases: [{ id: "case-1", value: "a" }, { id: "case-2", value: 2 }] } } });
  const { container } = render(<Harness initial={graph} />);
  expect(portsOf(container, "sw", "left")).toEqual(["in"]);
  expect(portsOf(container, "sw", "right")).toEqual(["case-1", "case-2", "default"]);
  const rows = within(screen.getByTestId("branch-node-sw")).getAllByText(/“a”|^2$|Default/).map((element) => element.textContent);
  expect(rows).toEqual(["“a”", "2", "Default"]);
  expect(screen.getByTestId("branch-node-sw").style.height).toBe(`${4 * 26}px`); // (3 rows + 1) rows: ports land on row centres
});

test("an edge leaving an outlet the switch no longer declares is still drawn, and its row says so", () => {
  const graph = seed();
  graph.nodes.push({ id: "sw", type: "switch_case", config: { execution: { inputs: [], cases: [] } } });
  graph.edges.push({ id: "orphan", kind: "flow", source_node_id: "sw", source_port_id: "case-9", target_node_id: "end", target_port_id: "in" });
  const { container } = render(<Harness initial={graph} />);
  expect(container.querySelector('[data-flow-edge-id="orphan"]')).not.toBeNull();
  const row = container.querySelector('[data-port-row="case-9"]');
  expect(row.getAttribute("title")).toMatch(/not declared any more/);
  expect(port(container, "sw", "case-9")).not.toBeNull();
});

test("dragging from an If outlet into an inlet writes the outlet's own port", () => {
  const graph = seed();
  graph.edges = graph.edges.filter((edge) => edge.id !== "flow-agent-end");
  graph.nodes.push({ id: "if", type: "if_else", config: { execution: { inputs: [] } } });
  const { container } = render(<Harness initial={graph} />);
  const old = document.elementFromPoint;
  document.elementFromPoint = () => port(container, "end", "in");
  try {
    fireEvent.mouseDown(port(container, "if", "false"), { button: 0, clientX: 20, clientY: 20 });
    fireEvent.mouseUp(document, { clientX: 100, clientY: 100 });
  } finally { document.elementFromPoint = old; }
  expect(current.edges.at(-1)).toStrictEqual({ id: "flow-if-end", kind: "flow", source_node_id: "if", source_port_id: "false", target_node_id: "end", target_port_id: "in" });
});
