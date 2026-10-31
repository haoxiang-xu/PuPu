/* eslint-disable testing-library/no-node-access, testing-library/no-container -- Real graph ports and SVG handles are the interaction surface. */
import React, { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import SkeletonCanvas from "./skeleton_canvas";
import { new_agent_document } from "./skeleton_graph_edits";
import { apply_graph_command } from "./skeleton_graph_commands";

const seed = () => new_agent_document({ id: "commands", name: "Commands" }).document;
let current;
let commands;
let selected;
function Harness({ initial = seed(), scope = "one", readOnly = false }) {
  const [graph, setGraph] = useState(initial);
  const ref = useRef(graph);
  current = graph;
  return <ConfigContext.Provider value={{ theme: {} }}><SkeletonCanvas
    resourceId="commands" document={graph} commandScope={scope} onSelectNode={selected}
    onGraphCommand={readOnly ? undefined : (command) => {
      commands.push(command);
      const result = apply_graph_command(ref.current, command);
      if (result.ok) { ref.current = result.document; setGraph(result.document); }
      return result;
    }}
  /></ConfigContext.Provider>;
}
const add = (type) => {
  fireEvent.click(screen.getByRole("button", { name: "Add node" }));
  fireEvent.click(screen.getByTestId(`palette-entry-${type}`));
};
const node = (container, id) => container.querySelector(`[data-flow-node-id="${id}"]`);
const port = (container, id, name) => container.querySelector(`[data-node-id="${id}"][data-port-id="${name}"]`);
const wire = (container, from, source, to, target) => {
  const old = document.elementFromPoint;
  document.elementFromPoint = () => port(container, to, target);
  try {
    fireEvent.mouseDown(port(container, from, source), { button: 0, clientX: 20, clientY: 20 });
    fireEvent.mouseUp(document, { clientX: 100, clientY: 100 });
  } finally { document.elementFromPoint = old; }
};
beforeEach(() => { localStorage.clear(); commands = []; selected = jest.fn(); });

test("palette adds native Agent and Pool, selects them, never offers unsupported types", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Add node" }));
  expect(screen.queryByTestId("palette-entry-code")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("palette-entry-agent"));
  add("subagent_pool");
  expect(current.nodes.map((n) => n.id)).toEqual(["start", "agent", "end", "agent-2", "pool"]);
  expect(selected).toHaveBeenLastCalledWith("pool");
  current.nodes.forEach((n) => expect(Object.keys(n).sort()).toEqual(["config", "id", "type"]));
});

test("keyboard deletion is one command and cannot remove Start or End", () => {
  const { container } = render(<Harness />);
  fireEvent.mouseDown(node(container, "agent"), { button: 0 });
  fireEvent.mouseUp(document);
  fireEvent.keyDown(document, { key: "Delete", code: "Delete" });
  expect(commands).toEqual([{ type: "delete", node_ids: ["agent"], edge_ids: [] }]);
  expect(current.nodes.map((n) => n.id)).toEqual(["start", "end"]);
  expect(current.edges).toEqual([]);
  fireEvent.mouseDown(node(container, "start"), { button: 0 });
  fireEvent.mouseUp(document);
  fireEvent.keyDown(document, { key: "Delete", code: "Delete" });
  expect(commands).toHaveLength(1);
});

test("reverse flow drag joins End; occupied outlet refuses visibly without changing the graph", () => {
  const { container } = render(<Harness />);
  add("agent");
  wire(container, "end", "in", "agent-2", "out");
  expect(current.edges.at(-1)).toMatchObject({ kind: "flow", source_node_id: "agent-2", target_node_id: "end" });
  const before = current;
  wire(container, "agent", "out", "agent-2", "in");
  expect(current).toBe(before);
  expect(screen.getByTestId("skeleton-graph-problem")).toHaveTextContent(/outlet/i);
});

test.each([["attach_top", "attach_top"], ["attach_bot", "attach_bot"]])("real same-side attach drag %s to %s is native", (source, target) => {
  const { container } = render(<Harness />);
  add("subagent_pool");
  wire(container, "pool", source, "agent", target);
  expect(current.edges.at(-1)).toMatchObject({ kind: "attach", source_node_id: "pool", source_port_id: source, target_node_id: "agent", target_port_id: target });
});

test("node menu disconnects edges only; edge menu deletes that connection", () => {
  const { container } = render(<Harness />);
  fireEvent.contextMenu(node(container, "agent"), { clientX: 200, clientY: 200 });
  fireEvent.click(screen.getByText("Disconnect node"));
  expect(current.nodes).toHaveLength(3);
  expect(current.edges).toEqual([]);
  wire(container, "start", "out", "agent", "in");
  fireEvent.contextMenu(container.querySelector("[data-flow-edge-id]"), { clientX: 200, clientY: 200 });
  fireEvent.click(screen.getByText("Delete connection"));
  expect(current.edges).toEqual([]);
});

test("a cancelled reconnect leaves the original edge and explains why", () => {
  const { container } = render(<Harness />);
  const before = current;
  fireEvent.click(container.querySelector("[data-flow-edge-id]"));
  fireEvent.mouseDown(container.querySelector("[data-edge-reconnect-target]"), { button: 0 });
  const old = document.elementFromPoint;
  document.elementFromPoint = () => null;
  try { fireEvent.mouseUp(document); } finally { document.elementFromPoint = old; }
  expect(current).toBe(before);
  expect(screen.getByTestId("skeleton-graph-problem")).toHaveTextContent(/unchanged/i);
});

test("external view scope change closes an open palette; a local render keeps it", () => {
  const view = render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Add node" }));
  view.rerender(<Harness scope="one" />);
  expect(screen.getByTestId("recipe-node-palette")).toBeInTheDocument();
  view.rerender(<Harness scope="two" />);
  expect(screen.queryByTestId("recipe-node-palette")).not.toBeInTheDocument();
});

test("read-only canvas has no add action or graph mutation controls", () => {
  const { container } = render(<Harness readOnly />);
  expect(screen.queryByRole("button", { name: "Add node" })).not.toBeInTheDocument();
  fireEvent.click(container.querySelector("[data-flow-edge-id]"));
  expect(container.querySelector("[data-edge-reconnect-target]")).toBeNull();
});

test("dragging and zooming an editable canvas still make no semantic command", () => {
  const { container } = render(<Harness />);
  const before = current;
  fireEvent.mouseDown(node(container, "agent"), { button: 0, clientX: 0, clientY: 0 });
  fireEvent.mouseMove(window, { clientX: 160, clientY: 120 });
  fireEvent.mouseUp(window, { clientX: 160, clientY: 120 });
  fireEvent.wheel(screen.getByTestId("flow-editor-viewport"), { deltaY: -40, ctrlKey: true });
  expect(commands).toEqual([]);
  expect(current).toBe(before);
});
