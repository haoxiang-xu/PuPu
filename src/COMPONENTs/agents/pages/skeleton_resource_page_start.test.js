import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { api } from "../../../SERVICEs/api";
import SkeletonResourcePage from "./skeleton_resource_page";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { CAPTURED_DUPLICATE_ENTRIES } from "./recipes_page/skeleton_drill_identity_capture";
import { new_agent_document } from "./recipes_page/skeleton_graph_edits";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
install_legacy_store_bridge(api.unchain);
// The canvas drawing alone is substituted; the page, session, real controls,
// detail panel and v2 facade own every navigation and document write below.
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => <div>{props.nodes.map((node) => (
    <div key={node.id} data-testid={`start-test-node-${node.id}`} onClick={() => props.on_select?.(node.id)}>
      {props.render_node(node)}
    </div>
  ))}</div>,
}));
const copy = (value) => JSON.parse(JSON.stringify(value));
const parent = () => copy(JSON.parse(CAPTURED_DUPLICATE_ENTRIES.find((r) => r.case === "duplicate-entry-ids").document));
const stored = (document, token = "edit-1") => ({
  ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])),
  id: document.id, kind: document.kind, name: document.name, document: copy(document), edit_token: token,
});
const page = (id) => <ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={id} /></ConfigContext.Provider>;
const select = (id) => fireEvent.click(screen.getByTestId(`start-test-node-${id}`));
const inputs = () => screen.getByTestId("skeleton-input-variables");
const openChild = () => fireEvent.doubleClick(within(screen.getByTestId("start-test-node-pool-a")).getByTestId("pool-node-row-1"));

beforeEach(() => {
  window.localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
  api.unchain.saveSkeletonResource = jest.fn(async ({ document }) => stored(document, "edit-2"));
});

test("a library Start shows the locked caller object with no input edits or automatic writes", async () => {
  const document = new_agent_document({ id: "start-library", name: "Library" }).document;
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(stored(document));
  render(page(document.id));
  await screen.findByTestId("start-test-node-start");
  select("start");
  expect(inputs()).toHaveTextContent("Caller input");
  expect(inputs()).toHaveTextContent("caller is not specified");
  expect(within(inputs()).queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
});

test("an embedded Subagent updates caller names with Start edits, then back returns to unknown", async () => {
  const document = parent();
  const child = document.nodes.find((n) => n.id === "pool-a").config.subagents[1].source.document;
  const start = child.nodes.find((n) => n.type === "start");
  start.config.execution.outputs = [{ name: "delegated", source: { kind: "result", path: ["different-path"] } }];
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(stored(document));
  render(page(document.id));
  await screen.findByTestId("start-test-node-pool-a");
  openChild();
  select(start.id);
  expect(inputs()).toHaveTextContent("delegated");
  expect(inputs()).not.toHaveTextContent("different-path");
  expect(inputs()).toHaveTextContent("same delegated message text");
  const output = screen.getByTestId("skeleton-output-variables");
  fireEvent.change(within(output).getByDisplayValue("delegated"), { target: { value: "renamed-field" } });
  expect(inputs()).toHaveTextContent("renamed-field");
  expect(within(inputs()).queryByText("delegated", { exact: true })).not.toBeInTheDocument();
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  const saved = api.unchain.saveSkeletonResource.mock.calls[0][0].document;
  expect(JSON.stringify(saved)).not.toMatch(/startContext|caller_context/);
  expect(saved.nodes.find((n) => n.id === "pool-a").config.subagents[1].source.document.nodes.find((n) => n.type === "start").config.execution).not.toHaveProperty("inputs");
  fireEvent.keyDown(window.document, { key: "Escape" });
  select(document.nodes.find((n) => n.type === "start").id);
  expect(inputs()).toHaveTextContent("Caller input");
  expect(inputs()).not.toHaveTextContent("renamed-field");
});

test("a referenced Subagent caller does not leak into the restored or newly opened library graph", async () => {
  const document = parent();
  const peer = new_agent_document({ id: "peer", name: "Peer" }).document;
  peer.nodes[0].config.execution.outputs = [{ name: "peer-task", source: { kind: "result", path: [] } }];
  document.nodes.find((n) => n.id === "pool-a").config.subagents[1].source = { kind: "agent_ref", agent_id: peer.id };
  api.unchain.getSkeletonResource = jest.fn(async (id) => stored(id === document.id ? document : peer));
  const view = render(page(document.id));
  await screen.findByTestId("start-test-node-pool-a");
  openChild();
  await waitFor(() => expect(screen.getByTestId("skeleton-drill-crumbs")).toHaveTextContent("Peer"));
  select("start");
  expect(inputs()).toHaveTextContent("peer-task");
  fireEvent.keyDown(window.document, { key: "Escape" });
  select(document.nodes.find((n) => n.type === "start").id);
  expect(inputs()).toHaveTextContent("Caller input");
  view.rerender(page(peer.id));
  await waitFor(() => expect(screen.queryByTestId("skeleton-drill-crumbs")).not.toBeInTheDocument());
  await waitFor(() => expect(api.unchain.getSkeletonResource).toHaveBeenLastCalledWith(peer.id));
  select("start");
  expect(inputs()).toHaveTextContent("Caller input");
  expect(inputs()).not.toHaveTextContent("peer-task");
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
});
