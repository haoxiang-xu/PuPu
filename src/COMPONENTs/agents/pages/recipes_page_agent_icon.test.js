import React from "react";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RecipesPage from "./recipes_page";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { api } from "../../../SERVICEs/api";
import { new_agent_document } from "./recipes_page/skeleton_graph_edits";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";
import capture from "../../../../electron/tests/fixtures/managed_code_producer.json";
import { resetPresentationCapabilityForTests } from "../use_presentation_capability";

/* The Agent icon on the real page. It belongs to the Agent resource: the
   Agents explorer shows it and is the only place it is changed ("Change
   icon…"). The open editor's Agent node — canvas and detail panel — keeps the
   fixed Agent node identity. Only the canvas drawing and the right-click menu
   are probes. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
/* A failed side-menu action is a toast; only what it says is read here.
   Plain functions: CRA resets jest.fn implementations per test. */
const mockToastErrors = [];
jest.mock("../../../SERVICEs/toast", () => ({ toast: {
  error: (message) => { mockToastErrors.push(message); return `toast-${mockToastErrors.length}`; },
  dismiss: () => {},
  success: () => "ok",
} }));
install_legacy_store_bridge(api.unchain);
jest.mock("../../side-menu/side_menu_utils", () => ({ getRuntimePlatform: () => "darwin" }));
jest.mock("../../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: { isListenerAvailable: () => false, onWindowStateChange: () => () => {} },
}));
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => <div data-testid="flow-editor">{props.nodes.map((node) => <div key={node.id} data-testid={`pick-${node.id}`} onMouseDown={() => props.on_select?.(node.id)}>{props.render_node(node)}</div>)}</div>,
}));
jest.mock("../../../BUILTIN_COMPONENTs/context_menu/context_menu", () => function MockMenu({ visible, items }) {
  if (!visible) return null;
  return (
    <div data-testid="context-menu">
      {items.filter((item) => item.label).map((item) => (
        <button key={item.label} type="button" disabled={item.disabled} onClick={item.onClick}>{item.label}</button>
      ))}
    </div>
  );
});

if (!global.ResizeObserver) global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const ID = "native-page";
const result = (document, token) => ({
  ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])),
  id: document.id, kind: document.kind, name: document.name, document, edit_token: token,
});
const capabilities = (features) => ({
  ...capture.capabilities,
  runtime_manifest: {
    ...capture.capabilities.runtime_manifest,
    protocols: [{ id: "skeleton_execution", major: 1, minor: features.length ? 9 : 8, features: ["node_display_label_v1", ...features] }],
  },
});
const SUPPORTED = () => capabilities(["document_presentation_v1"]);
const OLD = () => capabilities([]);
let stored;

beforeEach(() => {
  mockToastErrors.length = 0;
  resetPresentationCapabilityForTests();
  localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  stored = { document: new_agent_document({ id: ID, name: "Planner" }).document, token: "edit-1" };
  api.unchain.listRecipes = jest.fn().mockResolvedValue({ recipes: [] });
  api.unchain.listSkeletonResources = jest.fn(async () => ({
    resources: [{ id: ID, name: stored.document.name, kind: "agent", archived: false, edit_token: stored.token,
      presentation: stored.document.presentation || null }],
  }));
  api.unchain.getSkeletonResource = jest.fn(async () => result(JSON.parse(JSON.stringify(stored.document)), stored.token));
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
const open = async () => {
  fireEvent.click(await within(explorer()).findByText("Planner"));
  await screen.findByTestId("skeleton-node-start");
};
const agentNodeId = () => stored.document.nodes.find((node) => node.type === "agent").id;

describe("in the editor", () => {
  test.each([
    ["an icon", { icon: "kimi" }],
    ["a legacy icon and colour", { icon: "kimi", color: "#2e8f5a" }],
  ])("an Agent with %s: the explorer row shows it, the Agent node does not, and nothing in the editor changes it", async (_label, presentation) => {
    api.unchain.getManagedCodeCapabilities = jest.fn().mockResolvedValue(SUPPORTED());
    stored.document = { ...stored.document, presentation };
    show();
    await open();
    expect(screen.getByTestId(`agent-explorer-avatar-${ID}`).getAttribute("data-agent-icon")).toBe("kimi");
    fireEvent.mouseDown(screen.getByTestId(`pick-${agentNodeId()}`));
    await waitFor(() => expect(api.unchain.getManagedCodeCapabilities).toHaveBeenCalled());
    const canvasNode = screen.getByTestId(`pick-${agentNodeId()}`);
    expect(within(canvasNode).queryByTestId("agent-node-avatar")).toBeNull();
    // eslint-disable-next-line testing-library/no-node-access
    expect(canvasNode.querySelector("[data-agent-icon]")).toBeNull();
    expect(screen.queryByTestId("recipe-detail-panel-agent-icon")).toBeNull();
    expect(screen.queryByRole("button", { name: "Change icon" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Agent icon" })).toBeNull();
    expect(screen.getByTestId("skeleton-save-state")).not.toHaveTextContent("Unsaved changes");
  });
});

describe("from the explorer", () => {
  const changeIcon = async () => {
    await within(explorer()).findByText("Planner");
    fireEvent.contextMenu(within(explorer()).getByText("Planner"));
    /* Offered once the runtime has said it stores icons. */
    fireEvent.click(await within(screen.getByTestId("context-menu")).findByRole("button", { name: "Change icon…" }));
    return screen.getByTestId("agent-explorer-icon-picker");
  };
  const rowAvatar = () => screen.getByTestId(`agent-explorer-avatar-${ID}`);

  test("saves at once and the row shows the choice", async () => {
    api.unchain.getManagedCodeCapabilities = jest.fn().mockResolvedValue(SUPPORTED());
    api.unchain.saveSkeletonResource = jest.fn(async ({ document }) => {
      stored = { document, token: "edit-2" };
      return result(document, "edit-2");
    });
    show();
    const picker = await changeIcon();
    await waitFor(() => expect(within(picker).getByTestId("agent-explorer-icon-picker-icon-kimi")).toBeEnabled());
    fireEvent.click(within(picker).getByTestId("agent-explorer-icon-picker-icon-kimi"));
    /* A preview: nothing is written and the row is unchanged. */
    expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
    expect(rowAvatar().getAttribute("data-agent-icon")).toBe("bot");
    fireEvent.click(within(picker).getByRole("button", { name: "Save" }));
    expect(screen.queryByTestId("agent-explorer-icon-picker")).toBeNull();
    expect(rowAvatar().getAttribute("data-agent-icon")).toBe("kimi");
    await waitFor(() => expect(stored.document.presentation).toEqual({ icon: "kimi" }));
    await waitFor(() => expect(rowAvatar().getAttribute("data-agent-icon")).toBe("kimi"));
    expect(mockToastErrors).toHaveLength(0);
  });

  test("a refused save rolls the row back and says so", async () => {
    api.unchain.getManagedCodeCapabilities = jest.fn().mockResolvedValue(SUPPORTED());
    api.unchain.saveSkeletonResource = jest.fn(async () => { throw Object.assign(new Error("store said no"), { code: "edit_conflict" }); });
    show();
    const picker = await changeIcon();
    await waitFor(() => expect(within(picker).getByTestId("agent-explorer-icon-picker-icon-kimi")).toBeEnabled());
    fireEvent.click(within(picker).getByTestId("agent-explorer-icon-picker-icon-kimi"));
    fireEvent.click(within(picker).getByRole("button", { name: "Save" }));
    expect(rowAvatar().getAttribute("data-agent-icon")).toBe("kimi");
    await waitFor(() => expect(mockToastErrors).toHaveLength(1));
    render(<div data-testid="toast">{mockToastErrors[0]}</div>);
    expect(screen.getByTestId("toast")).toHaveTextContent(/Could not change the icon of Planner/);
    await waitFor(() => expect(rowAvatar().getAttribute("data-agent-icon")).toBe("bot"));
  });

  test("a legacy stored colour is never drawn, and saving an icon writes { icon } alone", async () => {
    api.unchain.getManagedCodeCapabilities = jest.fn().mockResolvedValue(SUPPORTED());
    api.unchain.saveSkeletonResource = jest.fn(async ({ document }) => {
      stored = { document, token: "edit-2" };
      return result(document, "edit-2");
    });
    stored.document = { ...stored.document, presentation: { icon: "kimi", color: "#d23f37" } };
    show();
    await within(explorer()).findByText("Planner");
    expect(rowAvatar().getAttribute("data-agent-icon")).toBe("kimi");
    /* The glyph alone, in the row's own text colour. */
    expect(rowAvatar().getAttribute("data-agent-tint")).toBe("currentColor");
    expect(rowAvatar().hasAttribute("data-agent-color")).toBe(false);
    const picker = await changeIcon();
    // eslint-disable-next-line testing-library/no-node-access
    expect(picker.querySelectorAll('[data-testid^="agent-explorer-icon-picker-color-"]')).toHaveLength(0);
    await waitFor(() => expect(within(picker).getByTestId("agent-explorer-icon-picker-icon-star")).toBeEnabled());
    fireEvent.click(within(picker).getByTestId("agent-explorer-icon-picker-icon-star"));
    fireEvent.click(within(picker).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(stored.document.presentation).toStrictEqual({ icon: "star" }));
    await waitFor(() => expect(rowAvatar().getAttribute("data-agent-icon")).toBe("star"));
  });

  test("an old runtime: no \"Change icon…\", no picker, no message and no write", async () => {
    api.unchain.getManagedCodeCapabilities = jest.fn().mockResolvedValue(OLD());
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    show();
    await within(explorer()).findByText("Planner");
    await waitFor(() => expect(warn).toHaveBeenCalled());
    fireEvent.contextMenu(within(explorer()).getByText("Planner"));
    const menu = screen.getByTestId("context-menu");
    expect(within(menu).getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: "Change icon…" })).toBeNull();
    expect(screen.queryByTestId("agent-explorer-icon-picker")).toBeNull();
    expect(screen.queryByText(/runtime|restart|reopen/i)).toBeNull();
    expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
    expect(rowAvatar().getAttribute("data-agent-icon")).toBe("bot");
    warn.mockRestore();
  });
});
