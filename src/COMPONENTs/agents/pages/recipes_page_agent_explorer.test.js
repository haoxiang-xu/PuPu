import React from "react";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RecipesPage from "./recipes_page";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { api } from "../../../SERVICEs/api";
import { new_agent_document } from "./recipes_page/skeleton_graph_edits";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";
import { openAddNode } from "./recipes_page/skeleton_canvas_test_helpers";

/* The page wiring between the Agents explorer and the open Skeleton editor:
 * the editor reports unsaved work, so the explorer will not rename or archive
 * the stored version underneath it; and after a rename of the open, clean
 * Agent the editor re-reads it, so its next save carries the new token. The
 * real page, explorer and editor; only the right-click menu is a probe and the
 * canvas drawing is stubbed. */

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

const show = () => render(
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <RecipesPage isDark={false} selectedNodeId={null} onSelectNode={() => {}} fullscreen={false} />
  </ConfigContext.Provider>,
);
const explorer = () => screen.getByTestId("agent-explorer");
const open = async () => {
  fireEvent.click(await within(explorer()).findByText("Planner"));
  await screen.findByTestId("skeleton-node-start");
};
const rightClick = (label) => fireEvent.contextMenu(within(explorer()).getByText(label));
const menuItem = (label) => within(screen.getByTestId("context-menu")).getByRole("button", { name: label });

test("an open Agent with unsaved work cannot be renamed or archived from the explorer until it is saved", async () => {
  show();
  await open();
  rightClick("Planner");
  expect(menuItem("Rename")).toBeEnabled();
  fireEvent.click(menuItem("close menu"));

  openAddNode();
  fireEvent.click(screen.getByTestId("palette-entry-agent"));
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");

  rightClick("Planner");
  expect(menuItem("Rename")).toBeDisabled();
  expect(menuItem("Rename")).toHaveAttribute("data-trail", "save first");
  expect(menuItem("Archive")).toBeDisabled();
  expect(api.unchain.renameSkeletonResource).not.toHaveBeenCalled();
});

test("renaming the open, clean Agent re-reads it, so the editor holds the new name and token", async () => {
  show();
  await open();
  expect(api.unchain.getSkeletonResource).toHaveBeenCalledTimes(1);
  rightClick("Planner");
  fireEvent.click(menuItem("Rename"));
  const input = within(explorer()).getByRole("textbox", { name: "" });
  fireEvent.change(input, { target: { value: "Planner Two" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(api.unchain.renameSkeletonResource).toHaveBeenCalledWith(ID, "Planner Two", "edit-1"));
  await waitFor(() => expect(api.unchain.getSkeletonResource).toHaveBeenCalledTimes(2));
  expect(await within(explorer()).findByText("Planner Two")).toBeInTheDocument();
  await screen.findByTestId("skeleton-node-start");
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
});
