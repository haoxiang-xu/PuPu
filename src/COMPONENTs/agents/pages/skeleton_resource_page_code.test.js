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
import { STARTER_CODE, starter_code } from "./recipes_page/code_config";

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
  const row = container.getAttribute("data-testid") || "";
  if (/^binding-row-\d+$/.test(row) && !within(container).queryByRole("button", { name: / · More$/ })) {
    /* A Code node's input row is the shared variable pill: its source is
       picked from the menu under its value, an option being the node and
       the field side by side. */
    const [node, name] = label.split(" · ");
    fireEvent.click(within(container).getByRole("textbox", { name: /^(?!name$).+/ }));
    const options = screen.getAllByText((_, el) => el?.tagName === "SPAN" && el.children.length === 2
      && el.textContent === `${node}${name}`);
    fireEvent.click(options[options.length - 1]);
    return;
  }
  if (/^(binding|output)-row-\d+$/.test(row)) {
    if (which === 0) {
      const more = within(container).getByRole("button", { name: / · More$/ });
      if (more.getAttribute("aria-expanded") !== "true") fireEvent.click(more);
      container = within(container).getByTestId(`${row}-settings`);
    } else {
      container = within(container).getByTestId(`${row}-source`);
    }
    which = 0;
  }
  fireEvent.click(within(container).getAllByRole("combobox")[which]);
  const lists = screen.getAllByRole("listbox", { hidden: true });
  fireEvent.click(within(lists[lists.length - 1]).getByText(label, { exact: true }));
};
const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  return api.unchain.saveSkeletonResource.mock.calls.at(-1)[0];
};
const edgeCount = () => new Set([...view.container.querySelectorAll("[data-flow-edge-id]")].map((element) => element.getAttribute("data-flow-edge-id"))).size;
const nodeOf = (document, id) => document.nodes.find((node) => node.id === id);
const edgeSet = (document) => document.edges.map((edge) => `${edge.source_node_id}.${edge.source_port_id}>${edge.target_node_id}.${edge.target_port_id}`).sort();
/* A step's output row is the shared variable pill: what it passes on is
   typed as a path (`result.<field>`), offered as you type. */
const typePath = (container, text) => {
  const box = within(container).getByRole("textbox", { name: /^(?!name$).+/ });
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
};
const addOutput = (row, root, name) => {
  fireEvent.click(screen.getByRole("button", { name: "+ Add output", exact: true }));
  typePath(screen.getByTestId(`output-row-${row}`), `result.${root}`);
  fireEvent.change(within(screen.getByTestId(`output-row-${row}`)).getByPlaceholderText("name"), { target: { value: name } });
};
const addField = (index, name, type) => {
  fireEvent.click(screen.getByRole("button", { name: "+ Add field" }));
  const row = screen.getByTestId(`schema-field-${index}`);
  fireEvent.change(within(row).getByPlaceholderText("field name"), { target: { value: name } });
  if (type) choose(row, type, 0);
};
const document_open_folds = () => window.document
  .querySelectorAll('[data-testid^="process-toggle-"][aria-expanded="false"]').forEach((toggle) => fireEvent.click(toggle));
/* Limits starts folded; reading it opens it first, as an author would. */
const limits = () => {
  const toggle = screen.queryByTestId("process-toggle-code-limits");
  if (toggle && toggle.getAttribute("aria-expanded") === "false") fireEvent.click(toggle);
  return screen.getByTestId("code-limits");
};
/* Every problem the Code panel says, in whichever section says it. */
const said = () => [...screen.getByTestId("code-section").querySelectorAll('[data-testid^="code-problems"]')].map((node) => node.textContent).join(" ");

beforeEach(() => {
  localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [profile], unavailable: [] });
  api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: PROFILES });
  api.unchain.probeSkeletonPythonProfile = jest.fn().mockResolvedValue(codeCapture.profiles.probe_builtin);
  api.unchain.saveSkeletonResource = jest.fn().mockImplementation(async ({ document }) => stored(document, "saved-token"));
});

test("Code: add, wire, name the file, set the limits, declare the Result, bind an input, export the fields, save, reopen", async () => {
  await open(baseRecord());
  deleteEdge("a");
  await add("code");
  await screen.findByTestId("code-section");
  /* A new node starts usable: starter code, its Result field, the
     defaults — nothing to complain about. */
  expect(said()).toBe("");
  expect(screen.getByRole("textbox", { name: "Code of code" })).toHaveValue(STARTER_CODE);
  /* Python only: no runtime picker. */
  expect(screen.queryByTestId("code-runtime-picker")).toBeNull();
  drag("start", "out", "code", "in");
  drag("code", "out", "router", "in");
  /* Output Variables, Limits, Result, On Error start folded: open them all. */
  document_open_folds();

  /* Connected after Start, it inherits Start's outputs: the input, a Result
     that passes it on, and the matching output — still nothing to fix. */
  expect(within(screen.getByTestId("binding-row-0")).getByPlaceholderText("name")).toHaveValue("message");
  expect(within(screen.getByTestId("output-row-0")).getByPlaceholderText("name")).toHaveValue("message");
  expect(said()).toBe("");

  /* From here the author's own: the input renamed, the mirror let go. */
  fireEvent.change(within(screen.getByTestId("binding-row-0")).getByPlaceholderText("name"), { target: { value: "diff" } });
  fireEvent.click(within(screen.getByTestId("output-row-0")).getByRole("button", { name: "Remove message" }));

  fireEvent.click(within(screen.getByTestId("code-source")).getByText("Use a workspace file"));
  fireEvent.change(within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py"), { target: { value: "tools/score.py" } });
  /* The limits arrive as the defaults. */
  expect(within(limits()).getByRole("textbox", { name: "Run time ≤ seconds" })).toHaveValue("30");
  addField(0, "rows", "integer");
  addField(1, "summary", null);
  expect(said()).toBe("");

  /* The Output Variables offer exactly the declared fields. */
  addOutput(0, "rows", "count");
  addOutput(1, "summary", "first");
  expect(screen.getByTestId("code-node-code")).toHaveTextContent("Python");

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
      /* Open: it was inherited from Start, whose field types nobody declares. */
      result_schema: { type: "object", properties: { rows: { type: "integer" }, summary: { type: "string" } } },
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
  expect(screen.getByTestId("code-node-code")).toHaveTextContent("Python");
  pressCanvasNode("code");
  await screen.findByTestId("code-section");
  expect(within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py")).toHaveValue("tools/score.py");
  expect(within(limits()).getByRole("textbox", { name: "Run time ≤ seconds" })).toHaveValue("30");
  expect(within(screen.getByTestId("schema-field-0")).getByPlaceholderText("field name")).toHaveValue("rows");
  expect(within(screen.getByTestId("schema-field-1")).getByPlaceholderText("field name")).toHaveValue("summary");
  expect(said()).toBe("");
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
  expect(screen.getByTestId("code-node-score")).toHaveTextContent("Python");
  pressCanvasNode("score");
  await screen.findByTestId("code-section");
  const problems = said();
  expect(problems).toContain("a Python named “nope” that this computer doesn't have");
  expect(problems).toContain("PuPu doesn't use the setting “on_error”");
  expect(problems).toContain("must describe an object");
  expect(screen.getByTestId("code-setting-on_error")).toBeInTheDocument();
  expect(screen.getByTestId("code-result-undeclared")).toHaveTextContent("not a schema this editor can read");
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
});

test("a new Code node saved as added carries its starter text, its Result and the defaults", async () => {
  await open(baseRecord());
  await add("code");
  await screen.findByTestId("code-section");
  expect(screen.queryByRole("button", { name: "Name a Python…" })).toBeNull();
  /* The shared v1 bridge refuses host-kept text, so the v2 edit itself is
     read here: the starter's text goes with the document that names it. */
  const sent = jest.fn(async () => { throw Object.assign(new Error("probe"), { code: "probe" }); });
  Object.defineProperty(api.unchain, "saveManagedSkeletonResource", { configurable: true, value: sent });
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
  const edit = sent.mock.calls[0][0];
  const index = edit.document.nodes.findIndex((node) => node.id === "code");
  expect(edit.document.nodes[index].config.code).toStrictEqual(starter_code().code);
  expect(edit.managed_sources).toEqual([{ node_path: ["nodes", index], text: STARTER_CODE }]);
  install_legacy_store_bridge(api.unchain);
});

test("an old Code node without limits or Python: no problem shown, opening writes nothing, and the next save writes the defaults", async () => {
  const { timeout_ms: _a, max_result_bytes: _b, max_log_bytes: _c, environment_profile_id: _d, ...partial } =
    codeCapture.rows.find((row) => row.case === "complete").config.code;
  const document = JSON.parse(JSON.stringify(BASE));
  document.nodes.splice(1, 0, { id: "score", type: "code", config: { execution: { inputs: [], outputs: [] }, code: partial } });
  await open(stored(document, "stored-token"));
  pressCanvasNode("score");
  await screen.findByTestId("code-section");
  expect(said()).toBe("");
  expect(within(limits()).getByRole("textbox", { name: "Run time ≤ seconds" })).toHaveValue("");
  expect(within(limits()).getByRole("textbox", { name: "Run time ≤ seconds" })).toHaveAttribute("placeholder", "30");
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
  /* Any edit, then Save: the defaults ride along; a cleared box is a default too. */
  fireEvent.change(within(limits()).getByRole("textbox", { name: "Result size ≤ bytes" }), { target: { value: "2048" } });
  fireEvent.change(within(limits()).getByRole("textbox", { name: "Result size ≤ bytes" }), { target: { value: "" } });
  fireEvent.change(within(limits()).getByRole("textbox", { name: "Printed output kept ≤ bytes" }), { target: { value: "4096" } });
  const payload = await save();
  expect(nodeOf(payload.document, "score").config.code).toStrictEqual({
    ...partial, environment_profile_id: "builtin", timeout_ms: 30000, max_result_bytes: 1048576, max_log_bytes: 4096,
  });
});



test("connecting is one undo step: the edge and the inherited variables go back together", async () => {
  await open(baseRecord());
  deleteEdge("a");
  await add("code");
  await screen.findByTestId("code-section");
  expect(screen.queryByTestId("binding-row-0")).toBeNull();
  const edges = edgeCount();
  drag("start", "out", "code", "in");
  expect(within(screen.getByTestId("binding-row-0")).getByPlaceholderText("name")).toHaveValue("message");
  expect(edgeCount()).toBe(edges + 1);
  fireEvent.click(screen.getByRole("button", { name: /^Undo/ }));
  await waitFor(() => expect(screen.queryByTestId("binding-row-0")).toBeNull());
  expect(edgeCount()).toBe(edges);
  expect(screen.getByTestId("code-node-code")).toBeInTheDocument();
});
