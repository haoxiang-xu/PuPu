/* eslint-disable testing-library/no-node-access -- Real graph nodes are the selection surface. */
import React, { useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { api } from "../../../../SERVICEs/api";
import capture from "../../../../../electron/tests/fixtures/managed_code_producer.json";
import SkeletonCanvas from "./skeleton_canvas";
import { new_agent_document } from "./skeleton_graph_edits";
import { apply_graph_command } from "./skeleton_graph_commands";

/* Rename is in place: the node's title becomes a field. These drive the real
   canvas, the real graph commands and the real capability admission; the
   harness keeps an undo stack of whole documents, one entry per accepted
   command, the way the page's session does. */

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: { getManagedCodeCapabilities: jest.fn() } } }));
const allowed = () => ({ ...capture.capabilities, runtime_manifest: {
  ...capture.capabilities.runtime_manifest,
  protocols: [{ id: "skeleton_execution", major: 1, minor: 8, features: ["node_display_label_v1"] }],
} });
let commands, current, replaceGraph, history, undo;
const seed = () => new_agent_document({ id: "rename", name: "Rename" }).document;
function Harness({ initial = seed(), scope = "one", readOnly = false }) {
  const [graph, setGraph] = useState(initial); replaceGraph = setGraph;
  const ref = useRef(graph); ref.current = graph; current = graph;
  undo = () => { const previous = history.pop(); if (previous) setGraph(previous); };
  return <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <SkeletonCanvas resourceId="rename" commandScope={scope} document={graph}
      onGraphCommand={readOnly ? undefined : (command) => {
        commands.push(command); const result = apply_graph_command(ref.current, command);
        if (result.ok && result.document !== ref.current) { history.push(ref.current); setGraph(result.document); }
        return result;
      }} />
  </ConfigContext.Provider>;
}
const nodeEl = (container, id = "agent") => container.querySelector(`[data-flow-node-id="${id}"]`);
const titleOf = (container, id = "agent") => nodeEl(container, id).querySelector("[data-node-title]");
const fieldOf = (container, id = "agent") => nodeEl(container, id).querySelector("[data-node-title-field]");
const subtitleOf = (container, id = "agent") => titleOf(container, id).nextSibling;
const select = (container, id = "agent") => {
  fireEvent.mouseDown(nodeEl(container, id), { button: 0 }); fireEvent.mouseUp(document);
};
const menu = (container, id = "agent") => fireEvent.contextMenu(nodeEl(container, id), { clientX: 100, clientY: 100 });
const ready = async () => { await waitFor(() => expect(api.unchain.getManagedCodeCapabilities).toHaveBeenCalled()); await act(async () => { await Promise.resolve(); }); };
const labelOf = (id = "agent") => current.nodes.find((node) => node.id === id).label;
beforeEach(() => { commands = []; history = []; api.unchain.getManagedCodeCapabilities.mockReset().mockResolvedValue(allowed()); });

test("double-clicking the title edits it in place; Enter commits one rename and the line below keeps the type", async () => {
  const { container } = render(<Harness />); await ready();
  expect(titleOf(container)).toHaveTextContent("Agent");
  expect(subtitleOf(container).textContent).toBe("");
  fireEvent.doubleClick(titleOf(container));
  const field = fieldOf(container);
  expect(field).toBeInTheDocument();
  expect(field).toHaveFocus();
  expect(field).toHaveValue("Agent");
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, "Agent".length]);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(commands).toEqual([]);
  fireEvent.change(field, { target: { value: "  审核 é  " } });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(commands).toEqual([{ type: "rename_node", node_id: "agent", label: "  审核 é  " }]);
  expect(labelOf()).toBe("  审核 é  ");
  expect(fieldOf(container)).toBeNull();
  expect(titleOf(container).textContent).toBe("  审核 é  ");
  /* Unnamed, the title already says "Agent"; renamed, the line below does. */
  expect(subtitleOf(container).textContent).toBe("Agent");
  expect(screen.getByTestId("skeleton-canvas")).toHaveFocus();
});

test("leaving the field commits; Escape cancels without a write", async () => {
  const { container } = render(<Harness />); await ready();
  fireEvent.doubleClick(titleOf(container));
  fireEvent.change(fieldOf(container), { target: { value: "Reviewer" } });
  fireEvent.keyDown(fieldOf(container), { key: "Escape" });
  expect(fieldOf(container)).toBeNull();
  expect(commands).toEqual([]);
  expect(titleOf(container)).toHaveTextContent("Agent");
  fireEvent.doubleClick(titleOf(container));
  fireEvent.change(fieldOf(container), { target: { value: "Reviewer" } });
  fireEvent.blur(fieldOf(container));
  expect(commands).toEqual([{ type: "rename_node", node_id: "agent", label: "Reviewer" }]);
  expect(labelOf()).toBe("Reviewer");
});

test("Escape in the field stays in the field: the page never sees it", async () => {
  const pageEscape = jest.fn(); document.addEventListener("keydown", pageEscape);
  try {
    const { container } = render(<Harness />); await ready();
    fireEvent.doubleClick(titleOf(container));
    fireEvent.keyDown(fieldOf(container), { key: "Escape" });
    expect(pageEscape).not.toHaveBeenCalled();
  } finally { document.removeEventListener("keydown", pageEscape); }
});

test("an empty or blank name resets the node to unnamed", async () => {
  const initial = seed(); initial.nodes.find((node) => node.id === "agent").label = "Reviewer";
  const { container } = render(<Harness initial={initial} />); await ready();
  expect(titleOf(container)).toHaveTextContent("Reviewer");
  fireEvent.doubleClick(titleOf(container));
  expect(fieldOf(container)).toHaveValue("Reviewer");
  fireEvent.change(fieldOf(container), { target: { value: " \u0085 " } });
  fireEvent.keyDown(fieldOf(container), { key: "Enter" });
  expect(commands).toEqual([{ type: "reset_node_label", node_id: "agent" }]);
  expect(current.nodes.find((node) => node.id === "agent")).not.toHaveProperty("label");
  expect(titleOf(container)).toHaveTextContent("Agent");
  /* Blank on a node that has no name is nothing to do. */
  fireEvent.doubleClick(titleOf(container));
  fireEvent.change(fieldOf(container), { target: { value: "" } });
  fireEvent.keyDown(fieldOf(container), { key: "Enter" });
  expect(commands).toHaveLength(1);
  expect(fieldOf(container)).toBeNull();
});

test("an unchanged name writes nothing", async () => {
  const { container } = render(<Harness />); await ready(); const original = current;
  fireEvent.doubleClick(titleOf(container));
  fireEvent.keyDown(fieldOf(container), { key: "Enter" });
  expect(commands).toEqual([]); expect(current).toBe(original);
});

test("one rename is one undo step", async () => {
  const { container } = render(<Harness />); await ready(); const original = current;
  fireEvent.doubleClick(titleOf(container));
  fireEvent.change(fieldOf(container), { target: { value: "Reviewer" } });
  fireEvent.keyDown(fieldOf(container), { key: "Enter" });
  expect(history).toHaveLength(1);
  await act(async () => undo());
  expect(current).toBe(original);
  expect(titleOf(container)).toHaveTextContent("Agent");
});

test("the context menu's Rename and F2 open the same in-place field, focused and selected", async () => {
  const { container } = render(<Harness />); await ready(); select(container);
  menu(container); fireEvent.click(await screen.findByText("Rename"));
  let field = fieldOf(container);
  expect(field).toHaveFocus();
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, "Agent".length]);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.change(field, { target: { value: "From the menu" } });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(labelOf()).toBe("From the menu");
  select(container); fireEvent.keyDown(document, { key: "F2" });
  field = fieldOf(container);
  expect(field).toHaveFocus();
  expect(field).toHaveValue("From the menu");
});

test("Start and End are renamed the same way", async () => {
  const { container } = render(<Harness />); await ready();
  expect(subtitleOf(container, "start")).toHaveTextContent(/^entry$/);
  fireEvent.doubleClick(titleOf(container, "start"));
  fireEvent.change(fieldOf(container, "start"), { target: { value: "Question" } });
  fireEvent.keyDown(fieldOf(container, "start"), { key: "Enter" });
  expect(labelOf("start")).toBe("Question");
  expect(subtitleOf(container, "start")).toHaveTextContent(/^Start · entry$/);
});

test("while the field is open the canvas's keys and gestures stay out of it", async () => {
  const windowKeys = jest.fn(); window.addEventListener("keydown", windowKeys);
  try {
    const { container } = render(<Harness />); await ready(); select(container);
    fireEvent.doubleClick(titleOf(container));
    const field = fieldOf(container);
    ["Backspace", "Delete", " ", "z", "F2", "f", "Home"].forEach((key) => {
      fireEvent.keyDown(field, { key, code: key === " " ? "Space" : key, metaKey: key === "z" || key === "f" });
    });
    expect(windowKeys).not.toHaveBeenCalled();
    expect(commands).toEqual([]);
    /* A press-and-move in the field (selecting text) is not a node drag. */
    const before = { left: nodeEl(container).style.left, top: nodeEl(container).style.top };
    fireEvent.mouseDown(field, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 220, clientY: 180 });
    fireEvent.mouseUp(window, { clientX: 220, clientY: 180 });
    expect({ left: nodeEl(container).style.left, top: nodeEl(container).style.top }).toEqual(before);
    /* A double-click in the field (selecting a word) opens no palette. */
    fireEvent.doubleClick(field);
    expect(screen.queryByTestId("recipe-node-palette")).not.toBeInTheDocument();
    expect(fieldOf(container)).toBe(field);
    expect(field).toHaveFocus();
  } finally { window.removeEventListener("keydown", windowKeys); }
});

test("a refused name stays in the field with the reason under it", async () => {
  const { container } = render(<Harness />); await ready();
  fireEvent.doubleClick(titleOf(container));
  fireEvent.change(fieldOf(container), { target: { value: "New name" } });
  await act(async () => replaceGraph((graph) => ({ ...graph, nodes: [...graph.nodes, { id: "agent", type: "unrecognized", config: {} }] })));
  fireEvent.keyDown(fieldOf(container), { key: "Enter" });
  expect(commands).toEqual([]);
  expect(fieldOf(container)).toHaveValue("New name");
  const problem = nodeEl(container).querySelector("[data-node-title-problem]");
  expect(problem).toHaveTextContent(/missing or its id is shared/);
  /* Neither the field nor the reason changes the node's height (so its size
     motion never plays): the field takes the title's own line box and the
     reason sits out of the flow, in the body's bottom padding. */
  expect(fieldOf(container).style.height).toBe("18px");
  expect(problem.style.position).toBe("absolute");
  expect(nodeEl(container).querySelector("[data-node-header]").style.height).toBe("35px");
});

test.each([null, {}, { ...allowed(), runtime_manifest: null }, { ...allowed(), runtime_manifest: { ...allowed().runtime_manifest, protocols: [{ id: "skeleton_execution", major: 1, minor: 7, features: ["node_display_label_v1"] }] } }])(
  "without the runtime's rename there is no Rename at all, and nothing is said %#", async (response) => {
    api.unchain.getManagedCodeCapabilities.mockResolvedValue(response);
    const { container } = render(<Harness />); await ready(); select(container);
    fireEvent.doubleClick(titleOf(container));
    expect(fieldOf(container)).toBeNull();
    fireEvent.keyDown(document, { key: "F2" });
    expect(fieldOf(container)).toBeNull();
    menu(container);
    expect(await screen.findByText("Open details")).toBeInTheDocument();
    expect(screen.queryByText(/Rename/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-graph-problem")).not.toBeInTheDocument();
    expect(commands).toEqual([]);
  },
);

test("read-only, foreign focus and multiple selection never open Rename", async () => {
  const { container, rerender } = render(<Harness />); await ready(); select(container);
  const external = document.createElement("input"); document.body.appendChild(external); external.focus();
  fireEvent.keyDown(document, { key: "F2" });
  expect(fieldOf(container)).toBeNull(); external.remove();
  select(container); fireEvent.contextMenu(screen.getByTestId("flow-editor-viewport")); fireEvent.click(await screen.findByText("Select all"));
  fireEvent.keyDown(document, { key: "F2" });
  expect(fieldOf(container)).toBeNull();
  rerender(<Harness readOnly />);
  fireEvent.doubleClick(titleOf(container));
  expect(fieldOf(container)).toBeNull();
});

test("scope and graph identity changes close an open field without writes", async () => {
  const { container, rerender } = render(<Harness />); await ready();
  fireEvent.doubleClick(titleOf(container)); expect(fieldOf(container)).not.toBeNull();
  rerender(<Harness scope="two" />);
  await waitFor(() => expect(nodeEl(container).querySelector("[data-node-title-field]")).toBeNull());
  await ready();
  fireEvent.doubleClick(titleOf(container)); expect(fieldOf(container)).not.toBeNull();
  await act(async () => replaceGraph({ ...seed(), id: "another-graph" }));
  expect(fieldOf(container)).toBeNull();
  expect(commands).toEqual([]);
});

test("finder shows a label while stable id remains searchable", async () => {
  const initial = seed(); initial.nodes.find((node) => node.id === "agent").label = "Reviewer";
  const { container } = render(<Harness initial={initial} />); await ready(); select(container);
  fireEvent.keyDown(document, { key: "f", ctrlKey: true });
  const search = screen.getByRole("textbox"); fireEvent.change(search, { target: { value: "agent" } });
  expect(screen.getByTestId("palette-node-agent")).toHaveTextContent("Reviewer");
  expect(screen.getByTestId("palette-node-agent")).toHaveTextContent("agent");
});
