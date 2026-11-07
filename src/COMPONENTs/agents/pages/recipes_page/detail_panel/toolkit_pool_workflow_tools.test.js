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
  fireEvent.click(screen.getByRole("button", { name: "Add Workflow tool" }));
  expect(latest.nodes[1].config).toEqual({ ...base(), workflow_tools: [{ id: "tool-1" }] });
  fireEvent.click(within(row()).getByRole("button", { name: "Pin fixed Workflow" }));
  expect(latest.nodes[1].config.workflow_tools).toEqual([{ id: "tool-1", workflow: ref() }]);
  expect(within(row()).getByText("workflow_tool-1")).toBeInTheDocument();
});

test("each write preserves current ordinary toolkit settings, other row fields and sibling rows", async () => {
  const one = { id: "first", workflow: ref(), future: { keep: true } };
  const two = { id: "second", workflow: ref() };
  await start({ initial: { ...base(), workflow_tools: [one, two] } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Include chat-selected toolkits" }));
  fireEvent.change(within(row()).getByRole("textbox", { name: "Workflow tool id" }), { target: { value: "renamed" } });
  expect(latest.nodes[1].config.merge_with_user_selected).toBe(true);
  expect(latest.nodes[1].config.workflow_tools).toEqual([{ ...one, id: "renamed" }, two]);
  fireEvent.click(within(row()).getByRole("button", { name: "Pin fixed Workflow" }));
  expect(latest.nodes[1].config.workflow_tools[0].future).toEqual({ keep: true });
});

test("invalid id text stays editable without writing; valid replacement changes only id", async () => {
  await start({ initial: { ...base(), workflow_tools: [{ id: "stored", workflow: ref() }] } });
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
  fireEvent.click(screen.getByRole("button", { name: "Add Workflow tool" }));
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
  expect(screen.queryByRole("button", { name: "Add Workflow tool" })).not.toBeInTheDocument();
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
  expect(screen.queryByRole("button", { name: "Add Workflow tool" })).not.toBeInTheDocument();
  expect(writes).toHaveLength(0);
  await act(async () => done(capability));
  expect(await screen.findByRole("button", { name: "Add Workflow tool" })).toBeEnabled();
  expect(writes).toHaveLength(0);
});
