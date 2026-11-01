/* eslint-disable testing-library/no-container, testing-library/no-node-access -- Ports and edges are driven on the actual shared editor. */
import React from "react";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import capture from "./recipes_page/skeleton_native_embedded_capture.json";
import codeCapture from "./recipes_page/code_capture.json";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";
import { openAddNode, pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";

/* The #357 Code author flow on the real page: actual SkeletonResourcePage,
 * FlowEditor, DetailPanel, Select, Input, Switch and the shared field rows.
 * Only the renderer facade is mocked, and it answers with the store's own
 * captured Python profiles (code_capture.json). With NATIVE_STEPS_BASE_RESULT_PATH
 * set the starting record is the one the real store returned for the base
 * document; with NATIVE_STEPS_PAYLOAD_DIR set the flow's exact Save request
 * is written out for the strict store + runtime consumer. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
/* The editor speaks v2 only (#357 G1); these mocks are graph-only. */
install_legacy_store_bridge(api.unchain);

const profile = capture.rows[1].document.nodes[1].config.kernel.profile;
const PROFILES = codeCapture.profiles.list_after;
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
const addField = (index, name, type) => {
  fireEvent.click(screen.getByRole("button", { name: "+ Add field" }));
  const row = screen.getByTestId(`schema-field-${index}`);
  fireEvent.change(within(row).getByPlaceholderText("field name"), { target: { value: name } });
  if (type) choose(row, type, 0);
};
const limits = () => screen.getByTestId("code-limits");

beforeEach(() => {
  localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [profile], unavailable: [] });
  api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: PROFILES });
  api.unchain.probeSkeletonPythonProfile = jest.fn().mockResolvedValue(codeCapture.profiles.probe_builtin);
  api.unchain.saveSkeletonResource = jest.fn().mockImplementation(async ({ document }) => stored(document, "saved-token"));
});

test("Code: add, wire, choose the runtime, name the file, set the limits, declare the Result, bind an input, export the fields, save, reopen", async () => {
  await open(baseRecord());
  deleteEdge("a");
  await add("code");
  await screen.findByTestId("code-section");
  expect(screen.getByTestId("code-problems")).toHaveTextContent("Choose a runtime");
  drag("start", "out", "code", "in");
  drag("code", "out", "router", "in");

  /* Input Variables are the node's own, declared and bound as anywhere. */
  fireEvent.click(screen.getByText("+ Add input"));
  fireEvent.change(within(screen.getByTestId("binding-row-0")).getByPlaceholderText("name"), { target: { value: "diff" } });
  choose(screen.getByTestId("binding-row-0"), "start · message", 1);

  choose(screen.getByTestId("code-runtime-picker"), "builtin · built-in Python");
  expect(screen.getByTestId("code-runtime-executable")).toHaveTextContent("the built-in interpreter");
  fireEvent.click(within(screen.getByTestId("code-source")).getByText("Use a workspace file"));
  fireEvent.change(within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py"), { target: { value: "tools/score.py" } });
  fireEvent.change(within(limits()).getByPlaceholderText("seconds"), { target: { value: "30" } });
  const [resultBytes, logBytes] = within(limits()).getAllByPlaceholderText("bytes");
  fireEvent.change(resultBytes, { target: { value: "1048576" } });
  fireEvent.change(logBytes, { target: { value: "1048576" } });
  addField(0, "rows", "integer");
  addField(1, "summary", null);
  expect(screen.queryByTestId("code-problems")).toBeNull();

  /* The Output Variables offer exactly the declared fields. */
  addOutput(0, "rows", "count");
  addOutput(1, "summary", "first");
  expect(screen.getByTestId("code-node-code")).toHaveTextContent("Code · builtin");
  expect(screen.getByTestId("code-node-code-source")).toHaveTextContent("tools/score.py");

  const payload = await save();
  expect(payload.expected_edit_token).toBe(baseRecord().edit_token);
  const document = payload.document;
  expect(nodeOf(document, "code")).toStrictEqual({ id: "code", type: "code", config: {
    execution: {
      inputs: [{ name: "diff", value: ref("start", ["message"]), missing: "error" }],
      outputs: [
        { name: "count", source: { kind: "result", path: ["rows"] } },
        { name: "first", source: { kind: "result", path: ["summary"] } },
      ],
    },
    code: {
      environment_profile_id: "builtin",
      source: { kind: "file", path: "tools/score.py" },
      timeout_ms: 30000,
      max_result_bytes: 1048576,
      max_log_bytes: 1048576,
      result_schema: { type: "object", properties: { rows: { type: "integer" }, summary: { type: "string" } }, additionalProperties: false },
    },
  } });
  /* The same keys, with the same values, that the real store admitted and
     preflight accepted (code_capture.json, "complete"). */
  const admitted = codeCapture.rows.find((row) => row.case === "complete").config.code;
  expect(Object.keys(nodeOf(document, "code").config.code).sort()).toEqual(Object.keys(admitted).sort());
  expect(edgeSet(document)).toEqual(["code.out>router.in", "router.out>end.in", "start.out>code.in"]);
  expect(document.nodes.every((node) => Object.keys(node).sort().join() === "config,id,type")).toBe(true);
  exportPayload("code-page", payload);

  view.unmount();
  await open(stored(document, "saved-token"));
  expect(screen.getByTestId("code-node-code")).toHaveTextContent("Code · builtin");
  pressCanvasNode("code");
  await screen.findByTestId("code-section");
  expect(within(screen.getByTestId("code-runtime-picker")).getByRole("combobox")).toHaveTextContent("builtin · built-in Python");
  expect(within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py")).toHaveValue("tools/score.py");
  expect(within(limits()).getByPlaceholderText("seconds")).toHaveValue("30");
  expect(within(screen.getByTestId("schema-field-0")).getByPlaceholderText("field name")).toHaveValue("rows");
  expect(within(screen.getByTestId("schema-field-1")).getByPlaceholderText("field name")).toHaveValue("summary");
  expect(screen.queryByTestId("code-problems")).toBeNull();
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
});

test("a stored draft with a profile this machine does not have, an unknown key and an unreadable schema opens, says so, and is kept until replaced", async () => {
  const code = {
    ...codeCapture.rows.find((row) => row.case === "complete").config.code,
    environment_profile_id: "nope",
    on_error: "continue",
    result_schema: "object",
  };
  const document = JSON.parse(JSON.stringify(BASE));
  document.nodes.splice(1, 0, { id: "score", type: "code", config: { execution: { inputs: [], outputs: [] }, code } });
  await open(stored(document, "stored-token"));
  expect(screen.getByTestId("code-node-score")).toHaveTextContent("Code · nope");
  pressCanvasNode("score");
  await screen.findByTestId("code-section");
  const problems = screen.getByTestId("code-problems").textContent;
  expect(problems).toContain("No Python profile named “nope”");
  expect(problems).toContain("does not read the setting “on_error”");
  expect(problems).toContain("must describe an object");
  expect(screen.getByTestId("code-setting-on_error")).toBeInTheDocument();
  expect(screen.getByTestId("code-result-undeclared")).toHaveTextContent("not a schema this editor can read");
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
});

test("R-357-01: a Python registered late never rewrites an edit made while it was pending, in the actual Save request", async () => {
  let resolveProfile;
  api.unchain.saveSkeletonPythonProfile = jest.fn().mockImplementation(() => new Promise((resolve) => { resolveProfile = resolve; }));
  await open(baseRecord());
  await add("code");
  await screen.findByTestId("code-section");
  fireEvent.click(within(screen.getByTestId("code-source")).getByText("Use a workspace file"));
  fireEvent.change(within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py"), { target: { value: "tools/before.py" } });
  fireEvent.click(screen.getByRole("button", { name: "Name a Python…" }));
  fireEvent.change(screen.getByPlaceholderText("profile name, e.g. pupu-tools"), { target: { value: "review-python" } });
  fireEvent.change(screen.getByPlaceholderText("absolute path to its python, e.g. ~/.venvs/x/bin/python"), { target: { value: "/tmp/owned-python" } });
  fireEvent.click(within(screen.getByTestId("code-runtime-add")).getByRole("button", { name: "Add", exact: true }));
  await waitFor(() => expect(api.unchain.saveSkeletonPythonProfile).toHaveBeenCalledTimes(1));
  fireEvent.change(within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py"), { target: { value: "tools/new.py" } });
  resolveProfile({ id: "review-python", kind: "venv", available: true, executable: "/tmp/owned-python", fingerprint: "x", changed: false, edit_token: "edit-1-x" });
  await waitFor(() => expect(screen.queryByTestId("code-runtime-add")).toBeNull());
  const payload = await save();
  expect(nodeOf(payload.document, "code").config.code).toStrictEqual({ source: { kind: "file", path: "tools/new.py" }, environment_profile_id: "review-python" });
});
