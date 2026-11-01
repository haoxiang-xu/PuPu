/* eslint-disable testing-library/no-node-access -- the explorer's background menu is opened on its scroll area, which has no role. */
import React from "react";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { fireEvent, render, screen, within } from "@testing-library/react";
import RecipesPage from "./recipes_page";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { api } from "../../../SERVICEs/api";
import { new_agent_document } from "./recipes_page/skeleton_graph_edits";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";

/* #357 G7: the Agents explorer creates a native Workflow as well as an Agent.
 * The real page, explorer and editor; the right-click menu is a probe and the
 * canvas drawing is stubbed, as in recipes_page_agent_explorer.test.js. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
install_legacy_store_bridge(api.unchain);
jest.mock("../../side-menu/side_menu_utils", () => ({ getRuntimePlatform: () => "darwin" }));
jest.mock("../../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: { isListenerAvailable: () => false, onWindowStateChange: () => () => {} },
}));
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => <div data-testid="flow-editor">{props.nodes.map((node) => <div key={node.id}>{props.render_node(node)}</div>)}</div>,
}));
jest.mock("../../../BUILTIN_COMPONENTs/context_menu/context_menu", () => function MockMenu({ visible, items, onClose }) {
  if (!visible) return null;
  return (
    <div data-testid="context-menu">
      {items.filter((item) => item.label).map((item) => (
        <button key={item.label} type="button" disabled={item.disabled} onClick={item.onClick}>{item.label}</button>
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

beforeEach(() => {
  localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  const stored = new_agent_document({ id: ID, name: "Planner" }).document;
  api.unchain.listRecipes = jest.fn().mockResolvedValue({ recipes: [] });
  api.unchain.listSkeletonResources = jest.fn(async () => ({
    resources: [{ id: ID, name: "Planner", kind: "agent", archived: false, edit_token: "edit-1" }],
  }));
  api.unchain.getSkeletonResource = jest.fn(async () => result(JSON.parse(JSON.stringify(stored)), "edit-1"));
  api.unchain.saveSkeletonResource = jest.fn();
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
  api.unchain.resolveSkeletonResource = jest.fn();
});

const show = () => render(
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <RecipesPage isDark={false} selectedNodeId={null} onSelectNode={() => {}} fullscreen={false} />
  </ConfigContext.Provider>,
);
const explorer = () => screen.getByTestId("agent-explorer");
const menuItem = (label) => within(screen.getByTestId("context-menu")).getByRole("button", { name: label });
const name = (text) => {
  const input = within(explorer()).getByRole("textbox");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
};

test("New Workflow from the explorer opens an unsaved Workflow draft: Start and End, no model node", async () => {
  show();
  await within(explorer()).findByText("Planner");
  fireEvent.contextMenu(explorer().querySelector(".scrollable"));
  expect(menuItem("New Agent")).toBeInTheDocument();
  fireEvent.click(menuItem("New Workflow"));
  name("Summarize");
  await screen.findByTestId("skeleton-node-start");
  expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument();
  expect(screen.queryByTestId("skeleton-node-agent")).toBeNull();
  expect(within(explorer()).getByText("Summarize")).toBeInTheDocument();
  expect(screen.getByTestId("skeleton-save-state")).not.toHaveTextContent(/^Saved$/);
});

test("the header button creates a Workflow too, and New Agent still creates an Agent", async () => {
  show();
  await within(explorer()).findByText("Planner");
  fireEvent.click(within(explorer()).getByRole("button", { name: "New Workflow" }));
  name("Flow two");
  await screen.findByTestId("skeleton-node-start");
  expect(screen.queryByTestId("skeleton-node-agent")).toBeNull();

  fireEvent.click(within(explorer()).getByRole("button", { name: "New Agent" }));
  name("Agent two");
  await screen.findByTestId("skeleton-node-agent");
});
