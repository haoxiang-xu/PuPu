import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import { resolveKey } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import zh from "../../../../locales/zh-CN.json";
import { agentMessage, agentProblemMessage } from "./agents_i18n";
import { connect_nodes, delete_node } from "./skeleton_graph_edits";
import HookWorkflowSource from "./detail_panel/hook_workflow_source";
import HooksPoolSection from "./detail_panel/hooks_pool_section";
import SkeletonRunView from "./skeleton_run_view";
import { list_resources, save_draft } from "./skeleton_resources";
import { api } from "../../../../SERVICEs/api";

jest.mock("./skeleton_resources", () => ({ is_unavailable: (value) => value?.reason === "unavailable", list_resources: jest.fn(), save_draft: jest.fn() }));
jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
jest.mock("../../../../SERVICEs/toolkit_catalog_refresh", () => ({ subscribeToolkitCatalogRefresh: () => () => {} }));
const tree = (locale, element) => <ConfigContext.Provider value={{ theme: {} }}><LocaleContext.Provider value={{ locale }}>{element}</LocaleContext.Provider></ConfigContext.Provider>;
const graph = (nodes) => ({ schema_version: 1, kind: "agent", id: "raw-parent", name: "raw parent", nodes, edges: [] });
const node = (id) => ({ id, type: "agent", config: {} });
const translate = (key, vars) => resolveKey(zh, key).replace(/\{(\w+)\}/g, (whole, name) => Object.prototype.hasOwnProperty.call(vars || {}, name) ? String(vars[name]) : whole);
beforeEach(() => { list_resources.mockResolvedValue({ ok: true, data: { resources: [] } }); });

test.each([
  ["the", false, [], (doc, t) => delete_node(doc, "opaque-id", t)],
  ["the", true, [node("opaque-id"), node("opaque-id")], (doc, t) => delete_node(doc, "opaque-id", t)],
  ["source", false, [node("end")], (doc, t) => connect_nodes(doc, { kind: "flow", source_node_id: "opaque-id", source_port_id: "out", target_node_id: "end", target_port_id: "in" }, t)],
  ["target", false, [node("start")], (doc, t) => connect_nodes(doc, { kind: "flow", source_node_id: "start", source_port_id: "out", target_node_id: "opaque-id", target_port_id: "in" }, t)],
  ["source", true, [node("opaque-id"), node("opaque-id"), node("end")], (doc, t) => connect_nodes(doc, { kind: "flow", source_node_id: "opaque-id", source_port_id: "out", target_node_id: "end", target_port_id: "in" }, t)],
  ["target", true, [node("start"), node("opaque-id"), node("opaque-id")], (doc, t) => connect_nodes(doc, { kind: "flow", source_node_id: "start", source_port_id: "out", target_node_id: "opaque-id", target_port_id: "in" }, t)],
])("owned %s node role is localized without changing ambiguity=%s or opaque ids", (role, ambiguous, nodes, perform) => {
  const document = graph(nodes), before = JSON.stringify(document);
  const original = perform(document), shown = perform(document, agentMessage);
  expect(JSON.stringify(shown)).toBe(JSON.stringify(original));
  expect(original.problem).toMatchObject({ code: ambiguous ? "ambiguous_node_id" : "node_not_found", message: ambiguous ? `${role} node id "opaque-id" matches 2 nodes` : `${role} node "opaque-id" does not exist` });
  const message = agentProblemMessage(shown.problem, translate);
  expect(message).toContain("opaque-id");
  expect(message).not.toMatch(/the|source|target|agents\./);
  expect(JSON.stringify(document)).toBe(before);
});

test("unknown stored Hook event localizes only its UI prefix and never writes the value", async () => {
  const item = { id: "raw-hook", event: "future_event" };
  const pool = { id: "pool", type: "hooks_pool", config: { hooks: [item] } }, document = graph([pool]), before = JSON.stringify(document), onChange = jest.fn();
  const element = <HooksPoolSection node={pool} document={document} isDark={false} onChange={onChange} />;
  const view = render(tree("en", element));
  await act(async () => { await Promise.resolve(); });
  fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
  expect(within(screen.getByTestId("hook-0-event")).getByText('stored: "future_event"')).toBeInTheDocument();
  view.rerender(tree("zh-CN", element));
  expect(within(screen.getByTestId("hook-0-event")).getByText('已存储："future_event"')).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled(); expect(JSON.stringify(document)).toBe(before);
});

test.each([{ bad: 1 }, { toString: null }])("copy refusal retains safe raw-message presentation for %p", async (message) => {
  save_draft.mockResolvedValue({ ok: false, error: { code: "raw-code", message } });
  const entry = { id: "raw-hook", workflow: { kind: "embedded", document: { schema_version: 1, kind: "workflow", id: "owned", name: "Opaque Workflow", nodes: [], edges: [] } } };
  const element = <HookWorkflowSource entry={entry} index={0} nodeId="pool" parentId="parent" editable isDark={false} testid="copy" capability={{ status: "ready", contract: { embedded_kind: "embedded", document_kind: "workflow" } }} onWrite={jest.fn()} />;
  const view = render(tree("en", element));
  fireEvent.click(screen.getByRole("button", { name: "Save as a Workflow…" }));
  fireEvent.change(screen.getByPlaceholderText("new Workflow id, e.g. redact-paths"), { target: { value: "copied" } });
  fireEvent.click(screen.getByRole("button", { name: "Save the copy" }));
  await waitFor(() => expect(screen.getByTestId("copy-save-as-state")).toHaveTextContent("Nothing was saved: an unreadable value"));
  /* The store's code is for developers, not shown. */
  expect(screen.getByTestId("copy-save-as-state")).not.toHaveTextContent("raw-code");
  view.rerender(tree("zh-CN", element));
  expect(screen.getByTestId("copy-save-as-state")).toHaveTextContent("an unreadable value");
  expect(save_draft).toHaveBeenCalledTimes(1);
  save_draft.mockClear();
});

test.each([{}, { message: { bad: 1 } }, { message: { toString: null } }, { message: 42 }, { message: false }])("run observation uses its original typed fallback for rejected %p", async (error) => {
  api.unchain.getSkeletonRunObservation = jest.fn().mockRejectedValue(error);
  const scope = { owner_chat_id: "raw-chat", execution_id: "raw-execution", resource_id: "raw-agent" };
  const element = <SkeletonRunView scope={scope} isDark={false} onClose={jest.fn()} />;
  const view = render(tree("en", element));
  await waitFor(() => expect(screen.getByTestId("run-observation-error")).toHaveTextContent("The recorded run could not be read."));
  view.rerender(tree("zh-CN", element));
  expect(screen.getByTestId("run-observation-error")).not.toHaveTextContent("The recorded run could not be read.");
  expect(api.unchain.getSkeletonRunObservation).toHaveBeenCalledTimes(1);
});
