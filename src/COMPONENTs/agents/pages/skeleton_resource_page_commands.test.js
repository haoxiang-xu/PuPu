import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import { new_agent_document } from "./recipes_page/skeleton_graph_edits";
import { CAPTURED_DUPLICATE_ENTRIES } from "./recipes_page/skeleton_drill_identity_capture";
import { EDIT_CONFLICT_ERROR, RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
let editor;
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => {
    editor = props;
    return <div data-testid="flow-editor">{props.nodes.map((node) => <div key={node.id} data-testid={`draw-${node.id}`}>{props.render_node(node)}</div>)}</div>;
  },
}));
const copy = (v) => JSON.parse(JSON.stringify(v));
const seed = (id = "native-page") => new_agent_document({ id, name: id }).document;
const result = (document, token = "edit-1") => ({
  ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])),
  id: document.id, name: document.name, kind: document.kind, document, edit_token: token,
});
const parent = () => copy(JSON.parse(CAPTURED_DUPLICATE_ENTRIES.find((r) => r.case === "duplicate-entry-ids").document));
const child = (document, index = 1) => document.nodes.find((n) => n.id === "pool-a").config.subagents[index].source.document;
const show = async (document = seed()) => {
  const installed = process.env.NATIVE_CANVAS_BASE_RESULT_PATH
    ? JSON.parse(require("fs").readFileSync(process.env.NATIVE_CANVAS_BASE_RESULT_PATH, "utf8")) : null;
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(
    installed && JSON.stringify(installed.document) === JSON.stringify(document) ? installed : result(copy(document)),
  );
  const view = render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={document.id} /></ConfigContext.Provider>);
  await screen.findByTestId("skeleton-node-start");
  return view;
};
const add = (type = "agent") => {
  fireEvent.click(screen.getByRole("button", { name: "Add node" }));
  fireEvent.click(screen.getByTestId(`palette-entry-${type}`));
};
const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(api.unchain.saveSkeletonResource).toHaveBeenCalled());
  return api.unchain.saveSkeletonResource.mock.calls.at(-1)[0];
};
const openChild = () => fireEvent.doubleClick(within(screen.getByTestId("draw-pool-a")).getByTestId("pool-node-row-1"));
beforeEach(() => {
  localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
  api.unchain.saveSkeletonResource = jest.fn().mockImplementation(async ({ document }) => result(document, "edit-2"));
});

test("rapid canvas commands keep one another and panel edits; only explicit Save sends them", async () => {
  await show();
  fireEvent.click(screen.getByTestId("skeleton-node-agent"));
  fireEvent.click(screen.getByText("+ Add input"));
  add();
  const connect = editor.on_connect;
  act(() => {
    connect({ source_node_id: "agent-2", source_port_id: "out", target_node_id: "end", target_port_id: "in" });
    editor.on_delete({ node_ids: [], edge_ids: ["flow-start-agent"] });
  });
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
  const payload = await save();
  expect(payload.expected_edit_token).toBe("edit-1");
  expect(payload.document.nodes).toHaveLength(4);
  expect(payload.document.nodes.find((n) => n.id === "agent").config.execution.inputs).toHaveLength(1);
  expect(payload.document.edges).toHaveLength(2);
  expect(payload.document.edges.some((e) => e.source_node_id === "agent-2")).toBe(true);
});

test("embedded commands write only the chosen child into its owning resource", async () => {
  const document = parent();
  await show(document);
  openChild();
  await screen.findByTestId("skeleton-drill-crumbs");
  add();
  const payload = await save();
  expect(payload.document.id).toBe(document.id);
  expect(child(payload.document).nodes).toHaveLength(child(document).nodes.length + 1);
  expect(child(payload.document, 0)).toEqual(child(document, 0));
  expect(payload.document.nodes.filter((n) => n.id !== "pool-a")).toEqual(document.nodes.filter((n) => n.id !== "pool-a"));
  expect(screen.getByTestId("skeleton-drill-crumbs")).toHaveTextContent("Child Second");
  if (process.env.NATIVE_CANVAS_CAPTURE_PATH) require("fs").writeFileSync(process.env.NATIVE_CANVAS_CAPTURE_PATH, JSON.stringify(payload, null, 2) + "\n");
});

test("an old child callback cannot mutate the parent after going back", async () => {
  const document = parent();
  await show(document);
  openChild();
  const late = editor.on_delete;
  fireEvent.keyDown(documentForKeys(), { key: "Escape" });
  await waitFor(() => expect(screen.queryByTestId("skeleton-drill-crumbs")).not.toBeInTheDocument());
  act(() => late({ node_ids: ["agent"], edge_ids: [] }));
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
  add();
  const payload = await save();
  expect(child(payload.document)).toEqual(child(document));
  expect(payload.document.nodes).toHaveLength(document.nodes.length + 1);
});
const documentForKeys = () => window.document;

test("taking another stored version invalidates an old canvas callback even with the same node ids", async () => {
  const document = seed();
  await show(document);
  const late = editor.on_delete;
  add();
  api.unchain.saveSkeletonResource.mockResolvedValue({ error: EDIT_CONFLICT_ERROR });
  await save();
  const newer = { ...document, description: "Other writer" };
  api.unchain.getSkeletonResource.mockResolvedValue(result(newer, "edit-3"));
  fireEvent.click(await screen.findByRole("button", { name: "Look at theirs" }));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  act(() => late({ node_ids: ["agent"], edge_ids: [] }));
  expect(screen.getByTestId("skeleton-node-agent")).toBeInTheDocument();
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
});

test("referenced graph commands save that resource, then returning keeps the untouched parent", async () => {
  const document = parent();
  const peer = seed("native-peer");
  document.nodes.find((n) => n.id === "pool-a").config.subagents[1].source = { kind: "agent_ref", agent_id: peer.id };
  await show(document);
  api.unchain.getSkeletonResource.mockResolvedValue(result(peer));
  openChild();
  await waitFor(() => expect(screen.getByTestId("skeleton-drill-crumbs")).toHaveTextContent(peer.name));
  add("subagent_pool");
  const payload = await save();
  expect(payload.document.id).toBe(peer.id);
  expect(payload.document.nodes.at(-1).type).toBe("subagent_pool");
  fireEvent.keyDown(window.document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByTestId("skeleton-drill-crumbs")).not.toBeInTheDocument());
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
  expect(screen.getByTestId("skeleton-node-pool-a")).toBeInTheDocument();
});
