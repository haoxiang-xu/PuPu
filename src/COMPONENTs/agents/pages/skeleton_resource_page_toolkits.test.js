/* eslint-disable testing-library/no-container, testing-library/no-node-access -- Port gestures use the actual shared editor. */
import React from "react";
import { pressCanvasNode, openAddNode, openRunMenu } from "./recipes_page/skeleton_canvas_test_helpers";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import capture from "./recipes_page/skeleton_toolkit_capture.json";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";
import { new_agent_document } from "./recipes_page/skeleton_graph_edits";
import { CAPTURED_DUPLICATE_ENTRIES } from "./recipes_page/skeleton_drill_identity_capture";

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
/* The editor speaks v2 only (#357 G1); these mocks are graph-only. */
install_legacy_store_bridge(api.unchain);
const draft = { id: "native-tool-page", name: "Tool authoring" };
const stored = (document) => ({ ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])), document, id: document.id, kind: document.kind, name: document.name, edit_token: "saved-token" });
const show = async () => {
  const view = render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={draft.id} newDraft={draft} /></ConfigContext.Provider>);
  await screen.findByTestId("skeleton-node-agent");
  return view;
};
const addPool = async () => {
  openAddNode();
  fireEvent.click(screen.getByTestId("palette-entry-toolkit_pool"));
  await screen.findByTestId("native-toolkit-library-ready");
};
const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  return api.unchain.saveSkeletonResource.mock.calls.at(-1)[0];
};
beforeEach(() => {
  localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listToolModalCatalog = jest.fn().mockResolvedValue(capture.catalog);
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
  api.unchain.saveSkeletonResource = jest.fn().mockImplementation(async ({ document }) => stored(document));
});

test("real page and ports author a restricted Toolkit Pool; Save sends only native fields", async () => {
  const view = await show();
  await addPool();
  fireEvent.click(screen.getByRole("button", { name: "Add Core" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose tools" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "read", exact: true }));
  fireEvent.click(screen.getByRole("checkbox", { name: "write", exact: true }));
  const from = view.container.querySelector('[data-node-id="agent"][data-port-id="attach_top"]');
  const to = view.container.querySelector('[data-node-id="tools"][data-port-id="attach_top"]');
  const original = document.elementFromPoint; document.elementFromPoint = () => to;
  try { fireEvent.mouseDown(from, { button: 0 }); fireEvent.mouseUp(window); } finally { document.elementFromPoint = original; }
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
  const payload = await save();
  const pool = payload.document.nodes.find((n) => n.id === "tools");
  expect(Object.keys(pool).sort()).toEqual(["config", "id", "type"]);
  expect(pool.config).toEqual({ toolkits: [{ id: "core", enabled_tools: ["read", "write"] }], merge_with_user_selected: false });
  expect(payload.document.edges.at(-1)).toMatchObject({ kind: "attach", source_node_id: "agent", target_node_id: "tools", source_port_id: "attach_top", target_port_id: "attach_top" });
  expect(within(screen.getByTestId("recipe-detail-panel")).getByText("1 toolkit")).toBeInTheDocument();
  expect(within(view.container.querySelector('[data-flow-node-id="tools"]')).getByText("1 toolkit")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "read", exact: true })).toBeChecked();
  if (process.env.NATIVE_TOOLKIT_PAYLOAD_PATH) require("fs").writeFileSync(process.env.NATIVE_TOOLKIT_PAYLOAD_PATH, JSON.stringify(payload, null, 2) + "\n");
});

test("an explicit empty restriction remains an array through first save and later editing", async () => {
  await show(); await addPool();
  fireEvent.click(screen.getByRole("button", { name: "Add Core" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose tools" }));
  const first = await save();
  expect(first.document.nodes.at(-1).config.toolkits[0].enabled_tools).toEqual([]);
  fireEvent.click(screen.getByRole("checkbox", { name: "Include chat-selected toolkits" }));
  const next = await save();
  expect(next.expected_edit_token).toBe("saved-token");
  expect(next.document.nodes.at(-1).config).toEqual({ toolkits: [{ id: "core", enabled_tools: [] }], merge_with_user_selected: true });
});

test("the same editor inside an embedded graph writes its parent resource only", async () => {
  const parent = JSON.parse(CAPTURED_DUPLICATE_ENTRIES.find((r) => r.case === "duplicate-entry-ids").document);
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(stored(parent));
  const view = render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={parent.id} /></ConfigContext.Provider>);
  await screen.findByTestId("skeleton-node-pool-a");
  fireEvent.doubleClick(within(view.container.querySelector('[data-flow-node-id="pool-a"]')).getByTestId("pool-node-row-1"));
  await addPool();
  fireEvent.click(screen.getByRole("button", { name: "Add Core" }));
  const payload = await save();
  const before = parent.nodes.find((n) => n.id === "pool-a").config.subagents;
  const after = payload.document.nodes.find((n) => n.id === "pool-a").config.subagents;
  expect(payload.document.id).toBe(parent.id);
  expect(after[0]).toEqual(before[0]);
  expect(after[1].source.document.nodes.at(-1).config.toolkits).toEqual([{ id: "core", enabled_tools: null }]);
});

test("late catalog answer from the previous pool cannot populate the next pool", async () => {
  const graph = new_agent_document(draft).document;
  graph.nodes.push({ id: "one", type: "toolkit_pool", config: { toolkits: [], merge_with_user_selected: false } }, { id: "two", type: "toolkit_pool", config: { toolkits: [], merge_with_user_selected: false } });
  let first, second;
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(stored(graph));
  api.unchain.listToolModalCatalog.mockReturnValueOnce(new Promise((r) => { first = r; })).mockReturnValueOnce(new Promise((r) => { second = r; }));
  render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={graph.id} /></ConfigContext.Provider>);
  pressCanvasNode(await screen.findByTestId("skeleton-node-one"));
  pressCanvasNode(screen.getByTestId("skeleton-node-two"));
  await act(async () => { second({ toolkits: [] }); first(capture.catalog); });
  expect(screen.getByText("No toolkits are listed in this library.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add Core" })).not.toBeInTheDocument();
});
