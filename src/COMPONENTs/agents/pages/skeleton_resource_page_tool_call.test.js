/* eslint-disable testing-library/no-container, testing-library/no-node-access -- Ports and edges are driven on the actual shared editor. */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import capture from "./recipes_page/skeleton_native_embedded_capture.json";
import toolCapture from "./recipes_page/tool_call_capture.json";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";
import { openAddNode, pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";

/* The #352 Tool Call author flow on the real page: actual SkeletonResourcePage,
 * FlowEditor, DetailPanel, Select, Input and SegmentedControl. Only the
 * renderer facade is mocked, and it answers with the sidecar's own captured
 * bodies (tool_call_capture.json). With NATIVE_STEPS_BASE_RESULT_PATH set the
 * starting record is the one the real store returned for the base document;
 * with NATIVE_STEPS_PAYLOAD_DIR set each flow's exact Save request is written
 * out for the strict store + runtime consumer (qualify_tool_call_page.py). */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const profile = capture.rows[1].document.nodes[1].config.kernel.profile;
const CATALOG = JSON.parse(toolCapture.catalog_v2.body_text);
const CORE = JSON.parse(toolCapture.core_schemas.body_text);
const BASE = require("./recipes_page/skeleton_branch_page_base.json");
const fs = require("fs");
const ref = (node_id, path) => ({ kind: "ref", node_id, path });
const baseRecord = () => {
  if (process.env.NATIVE_STEPS_BASE_RESULT_PATH) return JSON.parse(fs.readFileSync(process.env.NATIVE_STEPS_BASE_RESULT_PATH, "utf8"));
  return { ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])),
    id: BASE.id, kind: BASE.kind, name: BASE.name, document: JSON.parse(JSON.stringify(BASE)), edit_token: "base-token" };
};
const stored = (document, token) => ({ ...baseRecord(), document, edit_token: token });
const exportPayload = (name, payload) => {
  if (process.env.NATIVE_STEPS_PAYLOAD_DIR) fs.writeFileSync(`${process.env.NATIVE_STEPS_PAYLOAD_DIR}/${name}.json`, JSON.stringify(payload, null, 2) + "\n");
};

let view;
async function open(record) {
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(record);
  view = render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={record.id} /></ConfigContext.Provider>);
  await screen.findByTestId("skeleton-node-router");
}
const add = async (type) => {
  openAddNode();
  fireEvent.click(screen.getByTestId(`palette-entry-${type}`));
};
const port = (node, id) => view.container.querySelector(`[data-node-id="${node}"][data-port-id="${id}"]`);
const drag = (from, out, to, into) => {
  const source = port(from, out);
  const target = port(to, into);
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  const original = document.elementFromPoint;
  document.elementFromPoint = () => target;
  try { fireEvent.mouseDown(source, { button: 0 }); fireEvent.mouseUp(window); } finally { document.elementFromPoint = original; }
};
const deleteEdge = (id) => {
  fireEvent.click(view.container.querySelector(`[data-flow-edge-id="${id}"]`));
  fireEvent.click(view.container.querySelector(`[data-edge-delete-btn="${id}"]`));
};
/* jsdom reports the popover list as visibility:hidden, so the open list is
   found with `hidden: true`; the most recently opened one is the last. */
const choose = (container, label, which = 0) => {
  fireEvent.click(within(container).getAllByRole("combobox")[which]);
  const lists = screen.getAllByRole("listbox", { hidden: true });
  fireEvent.click(within(lists[lists.length - 1]).getByText(label, { exact: true }));
};
const argument = (name) => screen.getByTestId(`tool-call-argument-${name}`);
const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  return api.unchain.saveSkeletonResource.mock.calls.at(-1)[0];
};
const nodeOf = (document, id) => document.nodes.find((node) => node.id === id);
const edgeSet = (document) => document.edges.map((edge) => `${edge.source_node_id}.${edge.source_port_id}>${edge.target_node_id}.${edge.target_port_id}`).sort();
const addOutput = (row, root, name) => {
  fireEvent.click(screen.getByText("+ Add output"));
  choose(screen.getByTestId(`output-row-${row}`), "What this node produced", 0);
  choose(screen.getByTestId(`output-row-${row}`), root, 1);
  fireEvent.change(within(screen.getByTestId(`output-row-${row}`)).getByPlaceholderText("name"), { target: { value: name } });
};

beforeEach(() => {
  localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [profile], unavailable: [] });
  api.unchain.listToolModalCatalog = jest.fn().mockResolvedValue(CATALOG);
  api.unchain.listSkeletonToolSchemas = jest.fn().mockResolvedValue({ toolkit_id: CORE.toolkit_id, tools: CORE.tools });
  api.unchain.saveSkeletonResource = jest.fn().mockImplementation(async ({ document }) => stored(document, "saved-token"));
});

test("Read: add, pick, bind one argument and fix another, choose Continue, map the result, branch on ok, save, reopen", async () => {
  await open(baseRecord());
  deleteEdge("a");
  await add("tool_call");
  await screen.findByTestId("tool-call-section");
  drag("start", "out", "tool", "in");

  choose(screen.getByTestId("tool-call-picker"), "Read · Core");
  await screen.findByTestId("tool-call-argument-path");
  fireEvent.click(within(argument("path")).getByRole("button", { name: "Variable" }));
  choose(argument("path"), "start · message");
  fireEvent.click(within(argument("limit")).getByRole("button", { name: "Value" }));
  fireEvent.change(within(argument("limit")).getByPlaceholderText("a value written here"), { target: { value: "5" } });
  fireEvent.click(within(screen.getByTestId("tool-call-on-error")).getByRole("button", { name: "Continue" }));
  fireEvent.change(within(screen.getByTestId("tool-call-approval")).getByPlaceholderText("seconds"), { target: { value: "60" } });
  addOutput(0, "result", "page");
  addOutput(1, "ok", "ok");
  expect(screen.queryByTestId("tool-call-problems")).toBeNull();
  expect(screen.getByTestId("tool-call-node-tool-row-0")).toHaveTextContent("start.message");

  await add("if_else");
  await screen.findByTestId("branch-section");
  drag("tool", "out", "if", "in");
  fireEvent.click(screen.getByText("+ Add input"));
  fireEvent.change(within(screen.getByTestId("binding-row-0")).getByPlaceholderText("name"), { target: { value: "ok" } });
  choose(screen.getByTestId("binding-row-0"), "tool · ok", 1);
  fireEvent.click(screen.getByRole("button", { name: "+ Add a condition" }));
  /* `ok` is proved true/false, so the comparison starts as `ok is true` and
     offers no other kind of value. */
  expect(screen.queryByTestId("condition-root-right-literal-kind")).toBeNull();
  drag("if", "true", "router", "in");
  drag("if", "false", "end", "in");

  pressCanvasNode("router");
  fireEvent.click(screen.getByText("+ Add input"));
  fireEvent.change(within(screen.getByTestId("binding-row-1")).getByPlaceholderText("name"), { target: { value: "page" } });
  choose(screen.getByTestId("binding-row-1"), "tool · page", 1);

  /* When the read fails the router is skipped, so End answers with the
     router's reply if it ran and the path that was asked for otherwise. */
  pressCanvasNode("end");
  choose(screen.getByTestId("binding-row-0"), "First of several", 0);
  choose(screen.getByTestId("binding-row-0-alt-1"), "start · message");

  const payload = await save();
  expect(payload.expected_edit_token).toBe(baseRecord().edit_token);
  const document = payload.document;
  expect(nodeOf(document, "tool")).toStrictEqual({ id: "tool", type: "tool_call", config: {
    execution: {
      inputs: [
        { name: "path", value: ref("start", ["message"]), missing: "error" },
        { name: "limit", value: { kind: "literal", value: 5 }, missing: "error" },
      ],
      outputs: [
        { name: "page", source: { kind: "result", path: ["result"] } },
        { name: "ok", source: { kind: "result", path: ["ok"] } },
      ],
    },
    tool: { name: "read", on_error: "continue", approval_timeout_ms: 60000 },
  } });
  expect(nodeOf(document, "if").config.execution).toStrictEqual({
    inputs: [{ name: "ok", value: ref("tool", ["ok"]), missing: "error" }],
    condition: { kind: "compare", operator: "eq", left: { kind: "input", path: ["ok"] }, right: { kind: "literal", value: true } },
  });
  expect(nodeOf(document, "router").config.execution.inputs[1]).toStrictEqual({ name: "page", value: ref("tool", ["page"]), missing: "error" });
  expect(nodeOf(document, "end").config.execution.inputs[0].value).toStrictEqual({
    kind: "first_present", values: [ref("router", ["reply"]), ref("start", ["message"])],
  });
  expect(edgeSet(document)).toEqual(["if.false>end.in", "if.true>router.in", "router.out>end.in", "start.out>tool.in", "tool.out>if.in"]);
  expect(document.nodes.every((node) => Object.keys(node).sort().join() === "config,id,type")).toBe(true);
  exportPayload("tool-read-page", payload);

  view.unmount();
  await open(stored(document, "saved-token"));
  expect(screen.getByTestId("tool-call-node-tool")).toHaveTextContent("read");
  expect(screen.getByTestId("tool-call-node-tool-row-1")).toHaveTextContent("limit5");
  pressCanvasNode("tool");
  await screen.findByTestId("tool-call-argument-path");
  expect(within(screen.getByTestId("tool-call-picker")).getByRole("combobox")).toHaveTextContent("Read · Core");
  expect(within(argument("path")).getByRole("button", { name: "Variable" })).toBeInTheDocument();
  expect(within(argument("path")).getAllByRole("combobox")[0]).toHaveTextContent("start · message");
  expect(within(argument("limit")).getByPlaceholderText("a value written here")).toHaveValue("5");
  expect(within(screen.getByTestId("tool-call-approval")).getByPlaceholderText("seconds")).toHaveValue("60");
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
});

test("Write: a tool that asks for approval, Fail the run, saved and reopened as chosen", async () => {
  await open(baseRecord());
  deleteEdge("a");
  await add("tool_call");
  await screen.findByTestId("tool-call-section");
  drag("start", "out", "tool", "in");
  drag("tool", "out", "router", "in");
  choose(screen.getByTestId("tool-call-picker"), "Write · Core");
  await screen.findByTestId("tool-call-argument-content");
  expect(screen.getByTestId("tool-call-confirmation")).toHaveTextContent("asks for approval each time");
  fireEvent.click(within(argument("path")).getByRole("button", { name: "Variable" }));
  choose(argument("path"), "start · message");
  fireEvent.click(within(argument("content")).getByRole("button", { name: "Value" }));
  fireEvent.change(within(argument("content")).getByPlaceholderText("a value written here"), { target: { value: "written by the builder" } });
  fireEvent.click(within(screen.getByTestId("tool-call-on-error")).getByRole("button", { name: "Fail the run" }));
  fireEvent.change(within(screen.getByTestId("tool-call-approval")).getByPlaceholderText("seconds"), { target: { value: "30" } });
  expect(screen.queryByTestId("tool-call-problems")).toBeNull();

  const payload = await save();
  const document = payload.document;
  expect(nodeOf(document, "tool").config).toStrictEqual({
    execution: {
      inputs: [
        { name: "path", value: ref("start", ["message"]), missing: "error" },
        { name: "content", value: { kind: "literal", value: "written by the builder" }, missing: "error" },
      ],
      outputs: [],
    },
    tool: { name: "write", on_error: "stop", approval_timeout_ms: 30000 },
  });
  expect(edgeSet(document)).toEqual(["router.out>end.in", "start.out>tool.in", "tool.out>router.in"]);
  exportPayload("tool-write-page", payload);

  view.unmount();
  await open(stored(document, "saved-token"));
  pressCanvasNode("tool");
  await screen.findByTestId("tool-call-argument-content");
  expect(within(argument("content")).getByPlaceholderText("a value written here")).toHaveValue("written by the builder");
  expect(within(screen.getByTestId("tool-call-approval")).getByPlaceholderText("seconds")).toHaveValue("30");
});
