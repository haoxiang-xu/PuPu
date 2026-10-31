import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecipesPage from "./recipes_page";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { api } from "../../../SERVICEs/api";
import { EDIT_CONFLICT_ERROR, RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";
import { new_agent_document } from "./recipes_page/skeleton_graph_edits";

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
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

const compose = async (name = "My first Agent") => {
  await waitFor(() => expect(screen.getByRole("button", { name: "New Agent" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "New Agent" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Agent name" }), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Create Agent" }));
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
  expect(screen.getByRole("button", { name: "Check it can run" })).toBeDisabled();
  expect(screen.getByTestId("skeleton-diagnostics-stale")).toBeInTheDocument();
  expect(screen.queryByText("Inherits the chat's model")).toBeNull();
  expect(screen.getByText("No model configured")).toBeInTheDocument();
  expect(api.unchain.getSkeletonResource).not.toHaveBeenCalled();
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
});

test("the native workspace reserves the floating list width and its collapsed control", async () => {
  show();
  await compose();
  const workspace = screen.getByTestId("skeleton-workspace");
  expect(Number.parseFloat(workspace.style.left)).toBeGreaterThanOrEqual(218);
  fireEvent.click(screen.getByRole("button", { name: "Hide agents" }));
  expect(Number.parseFloat(workspace.style.left)).toBeGreaterThan(0);
  expect(Number.parseFloat(workspace.style.left)).toBeLessThan(200);
  fireEvent.click(screen.getByRole("button", { name: "Show agents" }));
  expect(Number.parseFloat(workspace.style.left)).toBeGreaterThanOrEqual(218);
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
  expect(await screen.findByTestId(`skeleton-resource-${saved.id}`)).toBeInTheDocument();
  fireEvent.click(screen.getByTestId(`skeleton-resource-${saved.id}`));
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

test("a blank name cannot create, and Cancel does not leave a draft or send a request", async () => {
  show();
  await waitFor(() => expect(screen.getByRole("button", { name: "New Agent" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "New Agent" }));
  expect(screen.getByRole("button", { name: "Create Agent" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByTestId("skeleton-resource-page")).toBeNull();
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
});

test("a listing without a save bridge does not offer creation", async () => {
  delete api.unchain.saveSkeletonResource;
  show();
  expect(await screen.findByText("None yet.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "New Agent" })).toBeNull();
});
