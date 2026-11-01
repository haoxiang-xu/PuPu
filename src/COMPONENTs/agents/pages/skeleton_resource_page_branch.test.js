/* eslint-disable testing-library/no-container, testing-library/no-node-access -- Ports and edges are driven on the actual shared editor. */
import React from "react";
import { pressCanvasNode, openAddNode, openRunMenu } from "./recipes_page/skeleton_canvas_test_helpers";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import capture from "./recipes_page/skeleton_native_embedded_capture.json";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";

/* The #351 author flow on the real page: actual SkeletonResourcePage,
 * FlowEditor, DetailPanel, Select and Input. Only the renderer facade is
 * mocked. With NATIVE_BRANCH_BASE_RESULT_PATH set, the starting record is
 * the one the real source store returned for the base document; with
 * NATIVE_BRANCH_PAYLOAD_DIR set, each flow's exact Save request is written out
 * for the strict store + runtime consumer (qualify_branch_page.py). */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
/* The editor speaks v2 only (#357 G1); these mocks are graph-only. */
install_legacy_store_bridge(api.unchain);

const profile = capture.rows[1].document.nodes[1].config.kernel.profile;
const ref = (node_id, path) => ({ kind: "ref", node_id, path });
/* One base document for this test and for the strict consumer that saves it
   first: Start → router Agent → End, the router carrying the captured real
   Kernel profile. */
const BASE = require("./recipes_page/skeleton_branch_page_base.json");
const fs = require("fs");
const baseRecord = () => {
  if (process.env.NATIVE_BRANCH_BASE_RESULT_PATH) return JSON.parse(fs.readFileSync(process.env.NATIVE_BRANCH_BASE_RESULT_PATH, "utf8"));
  return { ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])),
    id: BASE.id, kind: BASE.kind, name: BASE.name, document: JSON.parse(JSON.stringify(BASE)), edit_token: "base-token" };
};
const stored = (document, token) => ({ ...baseRecord(), document, edit_token: token });
const exportPayload = (name, payload) => {
  if (process.env.NATIVE_BRANCH_PAYLOAD_DIR) fs.writeFileSync(`${process.env.NATIVE_BRANCH_PAYLOAD_DIR}/${name}.json`, JSON.stringify(payload, null, 2) + "\n");
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
/* The dropdown is a popover, which jsdom always reports as visibility:hidden,
   so the open list is found with `hidden: true` — the most recently opened
   one is the last in the document. */
const choose = (container, label, which = 0) => {
  fireEvent.click(within(container).getAllByRole("combobox")[which]);
  const lists = screen.getAllByRole("listbox", { hidden: true });
  fireEvent.click(within(lists[lists.length - 1]).getByText(label, { exact: true }));
};
const select = (id) => pressCanvasNode(screen.getByTestId(`skeleton-node-${id}`));
const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  return api.unchain.saveSkeletonResource.mock.calls.at(-1)[0];
};
const nodeOf = (document, id) => document.nodes.find((node) => node.id === id);
const edgeSet = (document) => document.edges.map((edge) => `${edge.source_node_id}.${edge.source_port_id}>${edge.target_node_id}.${edge.target_port_id}`).sort();

beforeEach(() => {
  localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [profile], unavailable: [] });
  api.unchain.saveSkeletonResource = jest.fn().mockImplementation(async ({ document }) => stored(document, "saved-token"));
});

test("the base document is the captured real Kernel profile, not a hand-made one", () => {
  expect(BASE.nodes[1].config.kernel).toStrictEqual({ ...capture.rows[1].document.nodes[1].config.kernel, prompt: "[router]" });
});

test("If / Else: add, bind, write the condition, wire both outlets and a rejoin, save, reopen", async () => {
  await open(baseRecord());
  deleteEdge("b");
  await add("if_else");
  await screen.findByTestId("branch-section");
  expect(screen.getByTestId("branch-node-if-summary")).toHaveTextContent("No condition yet");
  expect(port("if", "true")).not.toBeNull();
  expect(port("if", "false")).not.toBeNull();
  drag("router", "out", "if", "in");

  fireEvent.click(screen.getByText("+ Add input"));
  fireEvent.change(within(screen.getByTestId("binding-row-0")).getByPlaceholderText("name"), { target: { value: "reply" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add a condition" }));
  fireEvent.change(within(screen.getByTestId("condition-root-right-literal-text")).getByPlaceholderText("text"), { target: { value: "yes" } });
  choose(screen.getByTestId("condition-root-operator"), "contains");
  expect(screen.getByTestId("branch-node-if-summary")).toHaveTextContent("1 comparison");

  await add("agent");
  fireEvent.click(within(await screen.findByTestId("kernel-model")).getByRole("combobox"));
  fireEvent.click(screen.getByText("openai · gpt-6-luna", { exact: true }));
  fireEvent.change(await screen.findByPlaceholderText("what this Agent is for"), { target: { value: "[yes-branch]" } });
  fireEvent.click(screen.getByText("+ Add output"));
  choose(screen.getByTestId("output-row-0"), "What this node produced", 0);
  choose(screen.getByTestId("output-row-0"), "message", 1);
  fireEvent.change(within(screen.getByTestId("output-row-0")).getByPlaceholderText("name"), { target: { value: "message" } });

  drag("if", "true", "agent", "in");
  drag("agent", "out", "end", "in");
  drag("end", "in", "if", "false"); // dragged backwards: still if.false → end.in

  select("end");
  choose(screen.getByTestId("binding-row-0"), "First of several", 0);
  choose(screen.getByTestId("binding-row-0-alt-0"), "agent · message — only if its branch ran");

  const payload = await save();
  expect(payload.expected_edit_token).toBe(baseRecord().edit_token);
  const document = payload.document;
  expect(Object.keys(nodeOf(document, "if")).sort()).toEqual(["config", "id", "type"]);
  expect(nodeOf(document, "if").config).toStrictEqual({ execution: {
    inputs: [{ name: "reply", value: ref("router", ["reply"]), missing: "error" }],
    condition: { kind: "compare", operator: "contains", left: { kind: "input", path: ["reply"] }, right: { kind: "literal", value: "yes" } },
  } });
  expect(edgeSet(document)).toEqual([
    "agent.out>end.in", "if.false>end.in", "if.true>agent.in", "router.out>if.in", "start.out>router.in",
  ]);
  expect(nodeOf(document, "end").config.execution.inputs[0].value).toStrictEqual({
    kind: "first_present", values: [ref("agent", ["message"]), ref("router", ["reply"])],
  });
  expect(nodeOf(document, "agent").config.kernel.prompt).toBe("[yes-branch]");
  expect(document.nodes.every((node) => Object.keys(node).sort().join() === "config,id,type")).toBe(true);
  exportPayload("if-page", payload);

  view.unmount();
  await open(stored(document, "saved-token"));
  expect(screen.getByTestId("branch-node-if-summary")).toHaveTextContent("1 comparison");
  expect(within(screen.getByTestId("branch-node-if")).getByText("True")).toBeInTheDocument();
  expect(view.container.querySelectorAll("[data-flow-edge-id]")).toHaveLength(5);
  select("if");
  expect(within(screen.getByTestId("condition-root-operator")).getByRole("combobox")).toHaveTextContent("contains");
  expect(within(screen.getByTestId("condition-root-right-literal-text")).getByPlaceholderText("text")).toHaveValue("yes");
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
});

test("Switch / Case: cases keep their outlets through rename and reorder; removing a wired case asks and takes its edge", async () => {
  await open(baseRecord());
  deleteEdge("b");
  await add("switch_case");
  await screen.findByTestId("branch-section");
  drag("router", "out", "switch", "in");
  fireEvent.click(screen.getByText("+ Add input"));
  fireEvent.change(within(screen.getByTestId("binding-row-0")).getByPlaceholderText("name"), { target: { value: "reply" } });
  choose(screen.getByTestId("branch-switch-value-pick"), "reply");
  fireEvent.click(screen.getByRole("button", { name: "+ Add a case" }));
  fireEvent.change(within(screen.getByTestId("branch-case-0-value-text")).getByPlaceholderText("text"), { target: { value: "a" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add a case" }));
  fireEvent.change(within(screen.getByTestId("branch-case-1-value-text")).getByPlaceholderText("text"), { target: { value: "b" } });
  expect(port("switch", "case-1")).not.toBeNull();
  expect(port("switch", "case-2")).not.toBeNull();
  drag("switch", "case-1", "end", "in");
  drag("switch", "case-2", "end", "in");
  drag("switch", "default", "end", "in");
  expect(screen.getByTestId("branch-case-1-target")).toHaveTextContent("→ end");

  fireEvent.change(within(screen.getByTestId("branch-case-0-value-text")).getByPlaceholderText("text"), { target: { value: "x" } });
  fireEvent.click(screen.getByRole("button", { name: "Move case 2 up" }));
  expect(within(screen.getByTestId("branch-node-switch")).getAllByText(/“/).map((node) => node.textContent)).toEqual(["“b”", "“x”"]);

  fireEvent.click(screen.getByRole("button", { name: "Remove case 1" }));
  expect(screen.getByTestId("branch-case-0-confirm")).toHaveTextContent("Removing it also removes that connection");
  fireEvent.click(screen.getByRole("button", { name: "Remove case and connection" }));
  expect(port("switch", "case-2")).toBeNull();

  const payload = await save();
  const document = payload.document;
  expect(nodeOf(document, "switch").config).toStrictEqual({ execution: {
    inputs: [{ name: "reply", value: ref("router", ["reply"]), missing: "error" }],
    cases: [{ id: "case-1", value: "x" }],
    value: { kind: "input", path: ["reply"] },
  } });
  expect(edgeSet(document)).toEqual(["router.out>switch.in", "start.out>router.in", "switch.case-1>end.in", "switch.default>end.in"]);
  exportPayload("switch-page", payload);

  view.unmount();
  await open(stored(document, "saved-token"));
  expect(within(screen.getByTestId("branch-node-switch")).getByText("“x”")).toBeInTheDocument();
  expect(within(screen.getByTestId("branch-node-switch")).getByText("Default")).toBeInTheDocument();
  select("switch");
  expect(within(screen.getByTestId("branch-case-0-value-text")).getByPlaceholderText("text")).toHaveValue("x");
});

test("a refused branch wire keeps the graph and says why", async () => {
  await open(baseRecord());
  await add("if_else");
  await screen.findByTestId("branch-section");
  drag("if", "true", "end", "in");
  drag("if", "true", "router", "in"); // the outlet already has an edge
  expect(screen.getByTestId("skeleton-graph-problem")).toHaveTextContent('outlet "true" of node "if" already has an edge');
});
