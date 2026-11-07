/* eslint-disable testing-library/no-node-access -- Real graph nodes are the selection surface. */
import React, { useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { api } from "../../../../SERVICEs/api";
import capture from "../../../../../electron/tests/fixtures/managed_code_producer.json";
import SkeletonCanvas from "./skeleton_canvas";
import { new_agent_document } from "./skeleton_graph_edits";
import { apply_graph_command } from "./skeleton_graph_commands";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: { getManagedCodeCapabilities: jest.fn() } } }));
const allowed = () => ({ ...capture.capabilities, runtime_manifest: {
  ...capture.capabilities.runtime_manifest,
  protocols: [{ id: "skeleton_execution", major: 1, minor: 8, features: ["node_display_label_v1"] }],
} });
let commands, current, replaceGraph;
const seed = () => new_agent_document({ id: "rename", name: "Rename" }).document;
function Harness({ initial = seed(), scope = "one", readOnly = false }) {
  const [graph, setGraph] = useState(initial); replaceGraph = setGraph;
  const ref = useRef(graph); ref.current = graph; current = graph;
  return <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <SkeletonCanvas resourceId="rename" commandScope={scope} document={graph}
      onGraphCommand={readOnly ? undefined : (command) => {
        commands.push(command); const result = apply_graph_command(ref.current, command);
        if (result.ok) setGraph(result.document); return result;
      }} />
  </ConfigContext.Provider>;
}
const select = (container, id = "agent") => {
  const node = container.querySelector(`[data-flow-node-id="${id}"]`);
  fireEvent.mouseDown(node, { button: 0 }); fireEvent.mouseUp(document);
};
const f2 = () => fireEvent.keyDown(document, { key: "F2" });
const menu = (container, id = "agent") => fireEvent.contextMenu(container.querySelector(`[data-flow-node-id="${id}"]`), { clientX: 100, clientY: 100 });
const ready = async () => { await waitFor(() => expect(api.unchain.getManagedCodeCapabilities).toHaveBeenCalled()); };
beforeEach(() => { commands = []; api.unchain.getManagedCodeCapabilities.mockReset().mockResolvedValue(allowed()); });

test("real F2 and explicit confirm rename exactly once; opening and Cancel do not write", async () => {
  const { container } = render(<Harness />); await ready();
  select(container); f2();
  const dialog = await screen.findByRole("dialog", { name: "Rename node" });
  expect(commands).toEqual([]);
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "  审核 e\u0301  " } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
  expect(commands).toEqual([{ type: "rename_node", node_id: "agent", label: "  审核 e\u0301  " }]);
  expect(current.nodes.find((node) => node.id === "agent").label).toBe("  审核 e\u0301  ");
  select(container); f2();
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Rename node" })).getByRole("button", { name: "Cancel" }));
  expect(commands).toHaveLength(1);
});

test("unchanged fallback confirmation on an unlabelled node is a true noop", async () => {
  const { container } = render(<Harness />); await ready(); const original = current;
  menu(container); fireEvent.click(await screen.findByText("Rename"));
  const dialog = await screen.findByRole("dialog", { name: "Rename node" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
  expect(commands).toEqual([]); expect(current).toBe(original);
});

test("blank label reports diagnostic; Escape closes only the dialog", async () => {
  const parentEscape = jest.fn(); window.addEventListener("keydown", parentEscape);
  try {
    const { container } = render(<Harness />); await ready(); select(container); f2();
    const dialog = await screen.findByRole("dialog", { name: "Rename node" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "\u0085" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/non-blank/);
    parentEscape.mockClear(); fireEvent.keyDown(within(dialog).getByRole("textbox"), { key: "Escape" });
    expect(parentEscape).not.toHaveBeenCalled(); expect(commands).toEqual([]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rename node" })).not.toBeInTheDocument());
  } finally { window.removeEventListener("keydown", parentEscape); }
});

test.each([null, {}, { ...allowed(), runtime_manifest: null }, { ...allowed(), runtime_manifest: { ...allowed().runtime_manifest, protocols: [{ id: "skeleton_execution", major: 1, minor: 7, features: ["node_display_label_v1"] }] } }])(
  "malformed or old actual capability cannot enable a writer %#", async (response) => {
    api.unchain.getManagedCodeCapabilities.mockResolvedValue(response);
    const { container } = render(<Harness />); await ready(); select(container); f2();
    expect(screen.queryByRole("dialog", { name: "Rename node" })).not.toBeInTheDocument();
    menu(container); expect(await screen.findByText(/Rename unavailable/)).toBeInTheDocument(); expect(commands).toEqual([]);
  },
);

test("loading and late capabilities cannot revive an obsolete graph dialog", async () => {
  let finish; api.unchain.getManagedCodeCapabilities.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const { container, rerender } = render(<Harness />); await waitFor(() => expect(api.unchain.getManagedCodeCapabilities).toHaveBeenCalledTimes(1)); select(container); f2();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  api.unchain.getManagedCodeCapabilities.mockResolvedValue({}); rerender(<Harness scope="two" />);
  await act(async () => { finish(allowed()); }); select(container); f2(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("typing, read-only, foreign focus and multiple selection never open Rename", async () => {
  const { container, rerender } = render(<Harness />); await ready(); select(container);
  const external = document.createElement("input"); document.body.appendChild(external); external.focus(); f2();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); external.remove();
  select(container); fireEvent.contextMenu(screen.getByTestId("flow-editor-viewport")); fireEvent.click(await screen.findByText("Select all")); f2();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  rerender(<Harness readOnly />); select(container); f2(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("scope changes invalidate an already open editor without writes", async () => {
  const { container, rerender } = render(<Harness />); await ready(); select(container); f2();
  await screen.findByRole("dialog", { name: "Rename node" }); rerender(<Harness scope="two" />);
  expect(screen.queryByRole("dialog", { name: "Rename node" })).not.toBeInTheDocument(); expect(commands).toEqual([]);
});


test.each(["missing", "duplicate"])("confirm rechecks latest target and refuses %s identity", async (kind) => {
  const { container } = render(<Harness />); await ready(); select(container); f2();
  const dialog = await screen.findByRole("dialog", { name: "Rename node" });
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "New name" } });
  await act(async () => replaceGraph((graph) => ({ ...graph, nodes: kind === "missing"
    ? graph.nodes.filter((node) => node.id !== "agent")
    : [...graph.nodes, { id: "agent", type: "unrecognized", config: {} }] })));
  fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent(/missing or its id is shared/);
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

test("a same-label confirm is a noop and another modal owns F2", async () => {
  const initial = seed(); initial.nodes.find((node) => node.id === "agent").label = "Reviewer";
  const { container } = render(<Harness initial={initial} />); await ready(); select(container); f2();
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Rename node" })).getByRole("button", { name: "Rename" }));
  expect(commands).toEqual([]);
  const overlay = document.createElement("div"); overlay.setAttribute("data-pupu-modal-overlay-host", "true"); document.body.appendChild(overlay);
  try { select(container); f2(); expect(screen.queryByRole("dialog", { name: "Rename node" })).not.toBeInTheDocument(); }
  finally { overlay.remove(); }
});

test("graph identity changes invalidate an open dialog even under the same resource scope", async () => {
  const { container } = render(<Harness />); await ready(); select(container); f2(); await screen.findByRole("dialog", { name: "Rename node" });
  await act(async () => replaceGraph({ ...seed(), id: "another-graph" }));
  expect(screen.queryByRole("dialog", { name: "Rename node" })).not.toBeInTheDocument(); expect(commands).toEqual([]);
});

test("returning from read-only checks capability again and waits before enabling Rename", async () => {
  const { container, rerender } = render(<Harness />); await ready();
  rerender(<Harness readOnly />); await act(async () => { await Promise.resolve(); });
  let finish; api.unchain.getManagedCodeCapabilities.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  rerender(<Harness />); await waitFor(() => expect(finish).toBeDefined()); select(container); f2();
  expect(screen.queryByRole("dialog", { name: "Rename node" })).not.toBeInTheDocument();
  await act(async () => { finish(allowed()); }); f2();
  expect(await screen.findByRole("dialog", { name: "Rename node" })).toBeInTheDocument(); expect(commands).toEqual([]);
});
