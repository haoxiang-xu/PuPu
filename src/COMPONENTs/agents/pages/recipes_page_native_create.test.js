import React from "react";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RecipesPage from "./recipes_page";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { api } from "../../../SERVICEs/api";
import { EDIT_CONFLICT_ERROR, RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";
import { new_agent_document } from "./recipes_page/skeleton_graph_edits";
import { openRunMenu } from "./recipes_page/skeleton_canvas_test_helpers";

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
/* The editor speaks v2 only (#357 G1); these mocks are graph-only. */
install_legacy_store_bridge(api.unchain);
jest.mock("../../side-menu/side_menu_utils", () => ({ getRuntimePlatform: () => "darwin" }));
jest.mock("../../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: { isListenerAvailable: () => false, onWindowStateChange: () => () => {} },
}));

if (!global.ResizeObserver) global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const show = () => render(
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <RecipesPage isDark={false} selectedNodeId={null} onSelectNode={() => {}} fullscreen={false} />
  </ConfigContext.Provider>,
);

let saved;
const result = (document) => ({
  ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])),
  id: document.id, kind: document.kind, name: document.name, document, edit_token: "first-token",
});

beforeEach(() => {
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  saved = null;
  api.unchain.listRecipes = jest.fn().mockResolvedValue({ recipes: [] });
  api.unchain.listSkeletonResources = jest.fn().mockImplementation(async () => ({
    resources: saved ? [{ id: saved.id, name: saved.name, kind: saved.kind }] : [],
  }));
  api.unchain.saveSkeletonResource = jest.fn().mockImplementation(async ({ document }) => {
    saved = JSON.parse(JSON.stringify(document));
    return result(saved);
  });
  api.unchain.getSkeletonResource = jest.fn().mockImplementation(async () => result(saved));
});

/* Creation is the explorer's own: New Agent opens an inline name row in the
   Agents explorer (the same row the legacy recipe list used), Enter creates. */
const nameRow = () => within(screen.getByTestId("agent-explorer")).getByRole("textbox", { name: "" });
const compose = async (name = "My first Agent") => {
  await waitFor(() => expect(screen.getByRole("button", { name: "New Agent" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "New Agent" }));
  fireEvent.change(nameRow(), { target: { value: name } });
  fireEvent.keyDown(nameRow(), { key: "Enter" });
  expect(await screen.findByTestId("skeleton-node-agent")).toBeInTheDocument();
};

test("an empty reachable library creates a real three-node canvas without reading or saving", async () => {
  const view = show();
  await compose();
  // FlowEditor exposes graph identity via this attribute; no per-node role
  // counts the actual drawing rather than the separate accessible node list.
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  expect(view.container.querySelectorAll("[data-flow-node-id]")).toHaveLength(3);
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");
  openRunMenu();
  expect(screen.getByRole("button", { name: "Check it can run" })).toBeDisabled();
  expect(screen.getByTestId("skeleton-run-save-first")).toBeInTheDocument();
  expect(screen.getByTestId("skeleton-diagnostics-stale")).toBeInTheDocument();
  expect(screen.queryByText("Inherits the chat's model")).toBeNull();
  expect(screen.getByText("No model configured")).toBeInTheDocument();
  expect(api.unchain.getSkeletonResource).not.toHaveBeenCalled();
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
});

test("the native workspace is full-bleed under the floating panels, like the legacy canvas", async () => {
  /* The unified design floats the library, the detail panel and the control
     center over the graph; the native page used to sit beside the library
     with a bar of its own, and reserved room for it. */
  show();
  await compose();
  const workspace = screen.getByTestId("skeleton-workspace");
  const placement = workspace.getAttribute("style");
  expect(placement).toMatch(/inset: 0/);
  expect(workspace.style.left).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Hide agents" }));
  expect(workspace.getAttribute("style")).toBe(placement);
  fireEvent.click(screen.getByRole("button", { name: "Show agents" }));
  expect(workspace.getAttribute("style")).toBe(placement);
  expect(screen.queryByTestId("skeleton-save-bar")).toBeNull();
  expect(screen.queryByTestId("skeleton-node-list")).toBeNull();
});

test("Save sends the exact native factory document once, and choosing its saved row loads it normally", async () => {
  show();
  await compose();
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1);
  const payload = api.unchain.saveSkeletonResource.mock.calls[0][0];
  // Optional offline qualification export: the producer reads this exact
  // page-emitted request rather than rebuilding what it assumes we sent.
  if (process.env.NATIVE_CREATE_CAPTURE_PATH) {
    require("fs").writeFileSync(process.env.NATIVE_CREATE_CAPTURE_PATH, JSON.stringify(payload, null, 2) + "\n");
  }
  expect(Object.keys(payload)).toEqual(["document"]);
  expect(payload.document.id).toMatch(/^agent-[a-f0-9]{32}$/);
  expect(payload.document).toStrictEqual(new_agent_document({ id: payload.document.id, name: "My first Agent" }).document);
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
  // After the save the explorer lists the stored Agent once (the unsaved
  // draft row gives way to it), and choosing that row loads it normally.
  await waitFor(() => expect(within(screen.getByTestId("agent-explorer")).getAllByText("My first Agent")).toHaveLength(1));
  fireEvent.click(within(screen.getByTestId("agent-explorer")).getByText("My first Agent"));
  await waitFor(() => expect(api.unchain.getSkeletonResource).toHaveBeenCalledWith(saved.id));
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
  expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1);
});

test("a refused first save keeps the draft and offers explicit conflict choices, without retry", async () => {
  api.unchain.saveSkeletonResource.mockResolvedValue({ error: EDIT_CONFLICT_ERROR });
  show();
  await compose("Collision draft");
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  expect(await screen.findByTestId("skeleton-save-conflict")).toBeInTheDocument();
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");
  expect(screen.getByRole("button", { name: "Look at theirs" })).toBeInTheDocument();
  expect(api.unchain.getSkeletonResource).not.toHaveBeenCalled();
  expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1);
});

test("a blank name cannot create, and Escape does not leave a draft or send a request", async () => {
  show();
  await waitFor(() => expect(screen.getByRole("button", { name: "New Agent" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "New Agent" }));
  fireEvent.keyDown(nameRow(), { key: "Enter" });
  expect(screen.queryByTestId("skeleton-resource-page")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "New Agent" }));
  fireEvent.change(nameRow(), { target: { value: "Never made" } });
  fireEvent.keyDown(nameRow(), { key: "Escape" });
  expect(within(screen.getByTestId("agent-explorer")).queryByRole("textbox", { name: "" })).toBeNull();
  expect(screen.queryByTestId("skeleton-resource-page")).toBeNull();
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
});

test("a listing without a save bridge does not offer creation", async () => {
  delete api.unchain.saveSkeletonResource;
  show();
  expect(await screen.findByTestId("agent-explorer-empty")).toHaveTextContent("No Agents yet");
  expect(screen.getByRole("button", { name: "New Agent" })).toBeDisabled();
});
