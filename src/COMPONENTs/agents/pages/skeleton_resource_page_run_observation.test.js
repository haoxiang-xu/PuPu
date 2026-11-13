import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { api } from "../../../SERVICEs/api";
import { getChatMessages, getChatsStore } from "../../../SERVICEs/chat_storage";
import SkeletonResourcePage from "./skeleton_resource_page";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";
import completed from "./recipes_page/__fixtures__/run_observation/test_real_route_observes_compl0--producer-observation-completed.json";

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
jest.mock("../../../SERVICEs/chat_storage", () => ({ getChatsStore: jest.fn(), getChatMessages: jest.fn() }));
install_legacy_store_bridge(api.unchain);
let editor;
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({ FlowEditor: (props) => {
  editor = props;
  return <div data-testid="run-test-flow">{props.nodes.map((node) => <div key={node.id}
    onMouseDown={() => props.on_select?.(node.id)}>{props.render_node(node)}</div>)}</div>;
} }));
const resource = (document, edit_token = "edit-1") => ({
  ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])),
  id: document.id, name: document.name, kind: document.kind, document, edit_token,
});
const scope = { owner_chat_id: "production-chat", execution_id: "view-session", resource_id: "production-agent" };
const show = () => render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
  <SkeletonResourcePage resourceId="production-agent" />
</ConfigContext.Provider>);
const openView = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Open the run menu" }));
  fireEvent.click(await screen.findByRole("button", { name: "View current chat run" }));
};

beforeEach(() => {
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  const draft = JSON.parse(JSON.stringify(completed.run.graphs[0].document));
  draft.nodes[0].label = "Editable Start B";
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(resource(draft));
  api.unchain.saveSkeletonResource = jest.fn(async ({ document }) => resource(document, "edit-2"));
  api.unchain.preflightSkeletonResource = jest.fn().mockResolvedValue({ ok: true, diagnostics: [] });
  api.unchain.getSkeletonRunObservation = jest.fn().mockResolvedValue({ ok: true, data: completed });
  getChatsStore.mockReturnValue({ activeChatId: "production-chat", chatsById: { "production-chat": { threadId: "view-session" } } });
  getChatMessages.mockReturnValue([{ role: "assistant", meta: { executionSessionId: "view-session" } }]);
});

test("a dirty draft B is preserved under frozen run A, including undo and explicit Save", async () => {
  show();
  await screen.findByText("Editable Start B");
  fireEvent.mouseDown(screen.getByTestId("skeleton-node-end"));
  fireEvent.click(screen.getByRole("button", { name: "+ Add input", exact: true }));
  const before = JSON.stringify(editor.nodes.map(({ config, ...node }) => ({ id: node.id, config })));
  await openView();
  await screen.findByTestId("skeleton-run-observation-view");
  expect(api.unchain.getSkeletonRunObservation).toHaveBeenCalledWith(scope);
  expect(screen.queryByText("Editable Start B")).toBeNull();
  expect(screen.getByTestId("run-node-state-start")).toHaveAttribute("data-run-state", "succeeded");
  expect(screen.queryByTestId("skeleton-control-center")).toBeNull();
  // Inert/hidden ancestry is the contract; accessible queries cannot inspect it.
  /* eslint-disable testing-library/no-node-access */
  expect(screen.getByTestId("skeleton-detail-panel-shell").closest("[inert]")).not.toBeNull();
  expect(screen.getByTestId("skeleton-detail-panel-shell").closest('[aria-hidden="true"]')).not.toBeNull();
  /* eslint-enable testing-library/no-node-access */
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Escape" });
  await screen.findByText("Editable Start B");
  // The panel exists again; only its former inert ancestor must be absent.
  // eslint-disable-next-line testing-library/no-node-access, testing-library/prefer-presence-queries
  expect(screen.getByTestId("skeleton-detail-panel-shell").closest("[inert]")).toBeNull();
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");
  expect(JSON.stringify(editor.nodes.map(({ config, ...node }) => ({ id: node.id, config })))).toBe(before);
  fireEvent.click(within(screen.getByTitle(/^Undo/)).getByRole("button"));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1));
  const saved = api.unchain.saveSkeletonResource.mock.calls[0][0].document;
  expect(saved.nodes[0].label).toBe("Editable Start B");
  expect(saved.nodes.find((node) => node.id === "end").config.execution.inputs).toHaveLength(1);
  expect(JSON.stringify(saved)).not.toMatch(/high_watermark|node_invocation_id|run_state/);
});

test("without a current chat the entry explains why; it does not guess an execution", async () => {
  getChatsStore.mockReturnValue({ activeChatId: null, chatsById: {} });
  show(); await screen.findByText("Editable Start B");
  await openView();
  expect(screen.getByTestId("skeleton-graph-problem")).toHaveTextContent(/open a chat/i);
  expect(api.unchain.getSkeletonRunObservation).not.toHaveBeenCalled();
  expect(screen.queryByTestId("skeleton-run-observation-view")).toBeNull();
});

test("closing a view with a pending read fences its late response", async () => {
  let answer;
  api.unchain.getSkeletonRunObservation.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
  show(); await screen.findByText("Editable Start B"); await openView();
  fireEvent.click(screen.getByRole("button", { name: "Back to editor" }));
  await act(async () => { answer({ ok: true, data: completed }); });
  expect(screen.queryByTestId("skeleton-run-observation-view")).toBeNull();
  expect(screen.getByText("Editable Start B")).toBeInTheDocument();
});

test("normal chat sends to its chat execution, not its unrelated threadId", async () => {
  getChatMessages.mockReturnValue([]);
  getChatsStore.mockReturnValue({ activeChatId: "production-chat", chatsById: { "production-chat": { kind: "default", threadId: "display-thread" } } });
  api.unchain.getSkeletonRunObservation.mockResolvedValue({ ok: true, data: { schema: completed.schema, run: null } });
  show(); await screen.findByText("Editable Start B"); await openView();
  expect(api.unchain.getSkeletonRunObservation).toHaveBeenCalledWith({ ...scope, execution_id: "production-chat" });
});

test("a character chat uses recorded execution metadata and never derives a session from its thread", async () => {
  getChatsStore.mockReturnValue({ activeChatId: "production-chat", chatsById: { "production-chat": { kind: "character", threadId: "display-thread" } } });
  getChatMessages.mockReturnValue([{ role: "assistant", meta: { executionSessionId: "character-session" } }]);
  api.unchain.getSkeletonRunObservation.mockResolvedValue({ ok: true, data: { schema: completed.schema, run: null } });
  show(); await screen.findByText("Editable Start B"); await openView();
  expect(api.unchain.getSkeletonRunObservation).toHaveBeenCalledWith({ ...scope, execution_id: "character-session" });
});

test("a character chat without a recorded execution identity explains the unavailable view", async () => {
  getChatsStore.mockReturnValue({ activeChatId: "production-chat", chatsById: { "production-chat": { kind: "character", threadId: "display-thread" } } });
  getChatMessages.mockReturnValue([]);
  show(); await screen.findByText("Editable Start B"); await openView();
  expect(api.unchain.getSkeletonRunObservation).not.toHaveBeenCalled();
  expect(screen.getByTestId("skeleton-graph-problem")).toHaveTextContent(/execution identity/i);
});
