import React from "react";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RecipesPage from "./recipes_page";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { api } from "../../../SERVICEs/api";
import { new_agent_document } from "./recipes_page/skeleton_graph_edits";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";
import { openAddNode } from "./recipes_page/skeleton_canvas_test_helpers";

/* Docked: in the Agents workspace the agent list lives in the side menu's
 * Agents pane, not floating over the canvas. The real page and explorer,
 * rendered into a slot element standing in for that pane. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
/* The editor speaks v2 only (#357 G1); these mocks are graph-only. */
install_legacy_store_bridge(api.unchain);
jest.mock("../../side-menu/side_menu_utils", () => ({ getRuntimePlatform: () => "darwin" }));
jest.mock("../../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: { isListenerAvailable: () => false, onWindowStateChange: () => () => {} },
}));
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => <div data-testid="flow-editor">{props.nodes.map((node) => <div key={node.id} onMouseDown={() => props.on_select?.(node.id)}>{props.render_node(node)}</div>)}</div>,
}));
jest.mock("../../../BUILTIN_COMPONENTs/context_menu/context_menu", () => function MockMenu({ visible, items, onClose }) {
  if (!visible) return null;
  return (
    <div data-testid="context-menu">
      {items.filter((item) => item.label).map((item) => (
        <button key={item.label} type="button" disabled={item.disabled} data-trail={item.trail || ""} onClick={item.onClick}>{item.label}</button>
      ))}
      <button type="button" onClick={onClose}>close menu</button>
    </div>
  );
});

if (!global.ResizeObserver) global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const ID = "native-page";
const result = (document, token) => ({
  ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])),
  id: document.id, kind: document.kind, name: document.name, document, edit_token: token,
});
let stored;

beforeEach(() => {
  localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  stored = { document: new_agent_document({ id: ID, name: "Planner" }).document, token: "edit-1" };
  api.unchain.listRecipes = jest.fn().mockResolvedValue({ recipes: [] });
  api.unchain.listSkeletonResources = jest.fn(async () => ({
    resources: [{ id: ID, name: stored.document.name, kind: "agent", archived: false, edit_token: stored.token }],
  }));
  api.unchain.getSkeletonResource = jest.fn(async () => result(JSON.parse(JSON.stringify(stored.document)), stored.token));
  api.unchain.saveSkeletonResource = jest.fn();
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
  api.unchain.resolveSkeletonResource = jest.fn();
  api.unchain.renameSkeletonResource = jest.fn(async (id, name) => {
    stored = { document: { ...stored.document, name }, token: "edit-2" };
    return result(stored.document, stored.token);
  });
});

const showDocked = (slot, onBack) => render(
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <RecipesPage isDark={false} selectedNodeId={null} onSelectNode={() => {}} fullscreen={false} explorerSlot={slot} explorerDocked onExplorerBack={onBack} />
  </ConfigContext.Provider>,
);

test("a docked list renders into the side menu slot and nothing floats over the canvas", async () => {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  showDocked(slot);

  const docked = within(slot).getByTestId("agent-explorer");
  expect(within(docked).queryByLabelText(/hide agents/i)).toBeNull();
  expect(screen.queryByTestId("recipe-list-panel-shell")).toBeNull();
  expect(screen.queryByTestId("recipe-list-resize-handle")).toBeNull();

  fireEvent.click(await within(docked).findByText("Planner"));
  await screen.findByTestId("skeleton-node-start");
  slot.remove();
});

test("docked with no slot yet, the list waits instead of falling back to floating", () => {
  showDocked(null);
  expect(screen.queryByTestId("agent-explorer")).toBeNull();
  expect(screen.queryByTestId("recipe-list-panel-shell")).toBeNull();
});

test("undocked, the list still floats over the canvas as before", () => {
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <RecipesPage isDark={false} selectedNodeId={null} onSelectNode={() => {}} fullscreen={false} />
    </ConfigContext.Provider>,
  );
  expect(screen.getByTestId("recipe-list-panel-shell")).toContainElement(screen.getByTestId("agent-explorer"));
  expect(screen.getByLabelText(/hide agents/i)).toBeInTheDocument();
});

test("docked, the pane reads the way back, then the Agents title and its actions, with no search field of its own", () => {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  const onBack = jest.fn();
  showDocked(slot, onBack);

  /* the side menu's own field, which stays put above both panes, searches it */
  expect(within(slot).queryByPlaceholderText("Search...")).toBeNull();
  const back = within(slot).getByRole("button", { name: "Chats" });
  const title = within(slot).getByTestId("agent-explorer-section-title");
  const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  expect(before(back, title)).toBe(true);
  expect(within(title).getByLabelText("New Agent")).toBeInTheDocument();

  fireEvent.click(back);
  expect(onBack).toHaveBeenCalledTimes(1);
  slot.remove();
});

test("docked, the way back stays small, and the title carries its own colour", () => {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  showDocked(slot, () => {});

  const back = within(slot).getByRole("button", { name: "Chats" });
  expect(back.style.width).not.toBe("100%");
  expect(back.style.alignSelf).toBe("flex-start");

  const label = within(slot).getByText("Agents", { selector: "[data-testid='agent-explorer-section-title'] > div" });
  expect(label.style.color).toBe("rgba(0, 0, 0, 0.9)");
  slot.remove();
});
