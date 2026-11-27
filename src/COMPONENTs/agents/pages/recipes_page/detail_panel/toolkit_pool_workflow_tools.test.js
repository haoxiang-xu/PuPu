import React, { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import ToolkitPoolSection from "./toolkit_pool_section";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { api } from "../../../../../SERVICEs/api";
import { toolkit_pool_problems } from "../toolkit_pool_config";
import capability from "../../../../../SERVICEs/skeleton_workflow_tool_capabilities_capture.json";

jest.mock("../../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
// The existing exact-version picker has its own producer/transport/lifecycle
// tests. Here only that seam is substituted; pool controls and document writes
// are real. This suite does not claim packaged App or Store execution.
jest.mock("./workflow_pin_control", () => ({
  __esModule: true,
  default: ({ onPin, editable }) => <button disabled={!editable} onClick={() => onPin("echo", "rev-exact")}>Pin fixed Workflow</button>,
}));

let latest;
let writes;
const base = () => ({ toolkits: [], merge_with_user_selected: false });
const ref = () => ({ workflow_id: "echo", revision_id: "rev-exact" });
function Harness({ initial = base(), siblings = [] }) {
  const [document, setDocument] = useState({ id: "workflow-tool-author", schema_version: 1, kind: "agent", nodes: [
    { id: "kernel", type: "agent", config: {} },
    { id: "pool", type: "toolkit_pool", config: initial },
    ...siblings,
  ], edges: [{ id: "attach", kind: "attach", source_node_id: "kernel", target_node_id: "pool" },
    ...siblings.map((node) => ({ id: node.id, kind: "attach", source_node_id: "kernel", target_node_id: node.id }))] });
  latest = document;
  return <ConfigContext.Provider value={{ theme: {} }}><ToolkitPoolSection document={document} node={document.nodes[1]} isDark={false} onChange={(next) => { writes.push(next); setDocument(next); }} /></ConfigContext.Provider>;
}
const row = (index = 0) => screen.getByTestId(`native-workflow-tool-row-${index}`);
/* A Workflow tool's strip folds like a toolkit's; a complete one starts shut. */
const expand = (index, name) => fireEvent.click(within(row(index)).getByRole("button", { name, exact: true }));
/* The one Add under the list opens a menu: Toolkit or Workflow. */
const openAdd = () => fireEvent.click(screen.getByRole("button", { name: "Add", exact: true }));
const addWorkflow = () => { openAdd(); fireEvent.click(screen.getByTestId("native-toolkit-add-menu-workflow")); };
const start = async (props = {}) => {
  render(<Harness {...props} />);
  await screen.findByTestId("native-workflow-tools-ready");
};
beforeEach(() => {
  writes = [];
  api.unchain.listToolModalCatalog = jest.fn().mockResolvedValue({ toolkits: [] });
  api.unchain.getSkeletonWorkflowToolCapabilities = jest.fn().mockResolvedValue(capability);
});

test("the new optional field is accepted structurally without changing legacy pools", () => {
  expect(toolkit_pool_problems(base())).toEqual([]);
  expect(toolkit_pool_problems({ ...base(), workflow_tools: [] })).toEqual([]);
  expect(toolkit_pool_problems({ ...base(), future: [] }).length).toBeGreaterThan(0);
});

test("reading and opening write nothing; add writes only a local id then pin writes the exact revision", async () => {
  await start();
  expect(writes).toHaveLength(0);
  expect(latest.nodes[1].config).not.toHaveProperty("workflow_tools");
  addWorkflow();
  expect(latest.nodes[1].config).toEqual({ ...base(), workflow_tools: [{ id: "tool-1" }] });
  fireEvent.click(within(row()).getByRole("button", { name: "Pin fixed Workflow" }));
  expect(latest.nodes[1].config.workflow_tools).toEqual([{ id: "tool-1", workflow: ref() }]);
  expect(within(row()).getByText("workflow_tool-1")).toBeInTheDocument();
});

test("each write preserves current ordinary toolkit settings, other row fields and sibling rows", async () => {
  const one = { id: "first", workflow: ref(), future: { keep: true } };
  const two = { id: "second", workflow: ref() };
  await start({ initial: { ...base(), workflow_tools: [one, two] } });
  fireEvent.click(screen.getByRole("switch", { name: "Merge with user-selected" }));
  fireEvent.change(within(row()).getByRole("textbox", { name: "Workflow tool id" }), { target: { value: "renamed" } });
  expect(latest.nodes[1].config.merge_with_user_selected).toBe(true);
  expect(latest.nodes[1].config.workflow_tools).toEqual([{ ...one, id: "renamed" }, two]);
  fireEvent.click(within(row()).getByRole("button", { name: "Pin fixed Workflow" }));
  expect(latest.nodes[1].config.workflow_tools[0].future).toEqual({ keep: true });
});

test("invalid id text stays editable without writing; valid replacement changes only id", async () => {
  await start({ initial: { ...base(), workflow_tools: [{ id: "stored", workflow: ref() }] } });
  expand(0, "stored");
  const input = within(row()).getByRole("textbox", { name: "Workflow tool id" });
  fireEvent.change(input, { target: { value: "bad id" } });
  expect(input).toHaveValue("bad id");
  expect(latest.nodes[1].config.workflow_tools[0].id).toBe("stored");
  expect(writes).toHaveLength(0);
  fireEvent.change(input, { target: { value: "valid_id" } });
  expect(latest.nodes[1].config.workflow_tools).toEqual([{ id: "valid_id", workflow: ref() }]);
});

test("new ids avoid pools attached to this Kernel", async () => {
  await start({ siblings: [{ id: "sibling", type: "toolkit_pool", config: { ...base(), workflow_tools: [{ id: "tool-1", workflow: ref() }] } }] });
  addWorkflow();
  expect(latest.nodes[1].config.workflow_tools).toEqual([{ id: "tool-2" }]);
  expect(latest.nodes[2].config.workflow_tools).toEqual([{ id: "tool-1", workflow: ref() }]);
});

test.each(["bad\n", "bad\r", ""])("a stored non-exact id %j is invalid and is never normalized on open", async (value) => {
  // HTML single-line inputs strip CR/LF before change callbacks. The producer
  // can retain them in a repairable draft, so inspect the actual stored value.
  await start({ initial: { ...base(), workflow_tools: [{ id: value, workflow: ref() }] } });
  expect(within(row()).getByText(/Stored id is invalid:/)).toBeInTheDocument();
  expect(latest.nodes[1].config.workflow_tools[0].id).toBe(value);
  expect(writes).toHaveLength(0);
});

test("a malformed list is retained until explicit replacement", async () => {
  const bad = { toString: null };
  await start({ initial: { ...base(), workflow_tools: bad } });
  expect(writes).toHaveLength(0);
  expect(latest.nodes[1].config.workflow_tools).toBe(bad);
  fireEvent.click(screen.getByRole("button", { name: "Replace invalid Workflow tools with an empty list" }));
  expect(latest.nodes[1].config).toEqual({ ...base(), workflow_tools: [] });
});

test("removing a preceding bad row preserves another row's pending id text", async () => {
  await start({ initial: { ...base(), workflow_tools: [null, { id: "kept", workflow: ref() }] } });
  expand(1, "kept");
  fireEvent.change(within(row(1)).getByRole("textbox", { name: "Workflow tool id" }), { target: { value: "not valid" } });
  fireEvent.click(within(row(0)).getByRole("button", { name: "Remove Workflow tool" }));
  expect(within(row()).getByRole("textbox", { name: "Workflow tool id" })).toHaveValue("not valid");
  expect(latest.nodes[1].config.workflow_tools).toEqual([{ id: "kept", workflow: ref() }]);
});

test("unavailable capability permits removal but never invents support or clears saved references", async () => {
  api.unchain.getSkeletonWorkflowToolCapabilities.mockRejectedValue(Object.assign(new Error("old host"), { code: "runtime_unavailable" }));
  const stored = [{ id: "kept", workflow: ref() }];
  render(<Harness initial={{ ...base(), workflow_tools: stored }} />);
  await screen.findByTestId("native-workflow-tools-unavailable");
  openAdd();
  expect(screen.queryByTestId("native-toolkit-add-menu-workflow")).not.toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expand(0, "kept");
  expect(within(row()).getByRole("textbox", { name: "Workflow tool id" })).toBeDisabled();
  expect(writes).toHaveLength(0);
  expect(latest.nodes[1].config.workflow_tools).toBe(stored);
  fireEvent.click(within(row()).getByRole("button", { name: "Remove Workflow tool" }));
  expect(latest.nodes[1].config.workflow_tools).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Remove Workflow tools setting" }));
  expect(latest.nodes[1].config).toEqual(base());
});

test("loading capability never writes or offers a stale authoring control", async () => {
  let done;
  api.unchain.getSkeletonWorkflowToolCapabilities.mockReturnValue(new Promise((resolve) => { done = resolve; }));
  render(<Harness />);
  openAdd();
  expect(screen.getByTestId("native-toolkit-add-menu-toolkit")).toBeInTheDocument();
  expect(screen.queryByTestId("native-toolkit-add-menu-workflow")).not.toBeInTheDocument();
  expect(writes).toHaveLength(0);
  await act(async () => done(capability));
  /* the open menu gains the entry once the contract is read */
  expect(await screen.findByTestId("native-toolkit-add-menu-workflow")).toBeInTheDocument();
  // eslint-disable-next-line testing-library/no-node-access
  expect(screen.getByTestId("native-toolkit-add-menu-workflow").parentElement.parentElement.style.cursor).toBe("pointer");
  expect(writes).toHaveLength(0);
});

test("one Tools and Workflows list: toolkits first, then Workflow tool strips, one count", async () => {
  const first = { id: "first", workflow: ref() };
  await start({ initial: { ...base(), toolkits: [{ id: "core", enabled_tools: null }], workflow_tools: [first, { id: "second" }] } });
  const block = screen.getByRole("region", { name: "Tools and Workflows" });
  expect(screen.queryByText("Workflows as tools")).not.toBeInTheDocument();
  expect(screen.queryByText("Pool")).not.toBeInTheDocument();
  expect(screen.queryByTestId("process-section-workflow-tools")).not.toBeInTheDocument();
  expect(screen.getByTestId("process-aside-toolkits")).toHaveTextContent("3");
  const toolkit = screen.getByTestId("native-toolkit-row-0");
  expect(block).toContainElement(row(0));
  /* the same surface: each row sits in a cell of one Region, toolkit first */
  // eslint-disable-next-line testing-library/no-node-access
  const surface = toolkit.parentElement.parentElement;
  // eslint-disable-next-line testing-library/no-node-access
  expect(row(0).parentElement.parentElement).toBe(surface);
  // eslint-disable-next-line testing-library/no-node-access
  expect(row(1).parentElement.parentElement).toBe(surface);
  // eslint-disable-next-line no-bitwise
  expect(toolkit.compareDocumentPosition(row(0)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  /* a complete tool starts folded; an unpinned one starts open */
  const toggle = within(row(0)).getByRole("button", { name: "first", exact: true });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(within(row(0)).queryByRole("textbox")).not.toBeInTheDocument();
  expect(within(row(0)).getByTestId("native-workflow-tool-pinned-0")).toHaveTextContent("echo");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(within(row(0)).getByRole("textbox", { name: "Workflow tool id" })).toHaveValue("first");
  expect(within(row(1)).getByRole("button", { name: "second", exact: true })).toHaveAttribute("aria-expanded", "true");
  /* the way out is the strip's last control */
  // eslint-disable-next-line testing-library/no-node-access
  const remove = within(toggle.parentElement).getAllByRole("button").pop();
  expect(remove).toHaveAccessibleName("Remove Workflow tool");
  fireEvent.click(remove);
  expect(latest.nodes[1].config.workflow_tools).toEqual([{ id: "second" }]);
  expect(latest.nodes[1].config.toolkits).toEqual([{ id: "core", enabled_tools: null }]);
  expect(screen.getByTestId("process-aside-toolkits")).toHaveTextContent("2");
});

test("the Add menu offers Toolkit and Workflow; Workflow adds a Workflow tool row and closes", async () => {
  await start();
  expect(screen.queryByRole("button", { name: "Add Workflow tool" })).not.toBeInTheDocument();
  openAdd();
  expect(screen.getByTestId("native-toolkit-add-menu-toolkit")).toHaveTextContent("Toolkit");
  expect(screen.getByTestId("native-toolkit-add-menu-workflow")).toHaveTextContent("Workflow");
  fireEvent.click(screen.getByTestId("native-toolkit-add-menu-workflow"));
  expect(screen.queryByTestId("native-toolkit-add-menu-workflow")).not.toBeInTheDocument();
  expect(latest.nodes[1].config.workflow_tools).toEqual([{ id: "tool-1" }]);
  expect(within(row(0)).getByRole("button", { name: "tool-1", exact: true })).toHaveAttribute("aria-expanded", "true");
  expect(within(row(0)).getByRole("textbox", { name: "Workflow tool id" })).toHaveValue("tool-1");
});

test("Escape closes the Add menu without writing", async () => {
  await start();
  openAdd();
  expect(screen.getByTestId("native-toolkit-add-menu-workflow")).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByTestId("native-toolkit-add-menu-workflow")).not.toBeInTheDocument();
  expect(writes).toHaveLength(0);
});
