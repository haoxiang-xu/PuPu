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

/* The Agent icon on the real page: the Agents explorer, the open editor and
   its detail panel. Only the canvas drawing and the right-click menu are
   probes. */

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
  const openPicker = async () => {
    await open();
    fireEvent.mouseDown(screen.getByTestId(`pick-${agentNodeId()}`));
    /* A plain avatar until the runtime has said it stores icons. */
    await waitFor(() => expect(screen.getByTestId("recipe-detail-panel-agent-icon").tagName).toBe("BUTTON"));
    fireEvent.click(screen.getByTestId("recipe-detail-panel-agent-icon"));
    const picker = screen.getByTestId("recipe-detail-panel-agent-icon-picker");
    await waitFor(() => expect(within(picker).getByTestId("recipe-detail-panel-agent-icon-picker-icon-robot_face")).toBeEnabled());
    return picker;
  };
  const headerAvatar = () => screen.getByTestId("recipe-detail-panel-agent-icon-avatar");
  const canvasAvatar = () => within(screen.getByTestId(`pick-${agentNodeId()}`)).queryByTestId("agent-node-avatar");
  /* The page's own Save, not the picker's. */
  const pageSave = () => screen.getAllByRole("button", { name: "Save", exact: true })
    .find((button) => !screen.queryByTestId("recipe-detail-panel-agent-icon-picker")?.contains(button));

  test("choosing previews only; the picker's Save commits into the draft and closes", async () => {
    api.unchain.getManagedCodeCapabilities = jest.fn().mockResolvedValue(SUPPORTED());
    show();
    const picker = await openPicker();
    const save = within(picker).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.click(within(picker).getByTestId("recipe-detail-panel-agent-icon-picker-icon-robot_face"));
    fireEvent.click(within(picker).getByTestId("recipe-detail-panel-agent-icon-picker-color-2e8f5a"));
    /* A preview: the trigger shows it, nothing else does, nothing is dirty. */
    expect(headerAvatar().getAttribute("data-agent-icon")).toBe("robot_face");
    expect(within(picker).getByTestId("recipe-detail-panel-agent-icon-picker-icon-robot_face")).toHaveAttribute("aria-pressed", "true");
    expect(canvasAvatar()).toBeNull();
    expect(screen.getByTestId("skeleton-save-state")).not.toHaveTextContent("Unsaved changes");
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(screen.queryByTestId("recipe-detail-panel-agent-icon-picker")).toBeNull();
    expect(headerAvatar().getAttribute("data-agent-icon")).toBe("robot_face");
    expect(headerAvatar().getAttribute("data-agent-color")).toBe("#2e8f5a");
    expect(canvasAvatar().getAttribute("data-agent-icon")).toBe("robot_face");
    expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");
    expect(pageSave()).toBeEnabled();
    /* The draft holds it; nothing was written to the store behind the editor. */
    expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
  });

  test("closing without Save discards the preview and leaves the draft clean", async () => {
    api.unchain.getManagedCodeCapabilities = jest.fn().mockResolvedValue(SUPPORTED());
    show();
    const picker = await openPicker();
    fireEvent.click(within(picker).getByTestId("recipe-detail-panel-agent-icon-picker-icon-robot_face"));
    expect(headerAvatar().getAttribute("data-agent-icon")).toBe("robot_face");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("recipe-detail-panel-agent-icon-picker")).toBeNull();
    expect(headerAvatar().getAttribute("data-agent-icon")).toBe("bot");
    expect(screen.getByTestId("skeleton-save-state")).not.toHaveTextContent("Unsaved changes");
  });

  test("an old runtime: the icon is a plain avatar — no button, no picker, no message, no draft", async () => {
    api.unchain.getManagedCodeCapabilities = jest.fn().mockResolvedValue(OLD());
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    show();
    await open();
    fireEvent.mouseDown(screen.getByTestId(`pick-${agentNodeId()}`));
    await waitFor(() => expect(api.unchain.getManagedCodeCapabilities).toHaveBeenCalled());
    /* The cause goes to the developer console only. */
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("document_presentation_v1")));
    const avatar = screen.getByTestId("recipe-detail-panel-agent-icon");
    expect(avatar.tagName).toBe("SPAN");
    expect(avatar.getAttribute("data-agent-icon")).toBe("bot");
    fireEvent.click(avatar);
    expect(screen.queryByTestId("recipe-detail-panel-agent-icon-picker")).toBeNull();
    expect(screen.queryByText(/runtime|restart|reopen/i)).toBeNull();
    expect(screen.getByTestId("skeleton-save-state")).not.toHaveTextContent("Unsaved changes");
    warn.mockRestore();
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

  test("a stored colour outside the palette draws the default", async () => {
    api.unchain.getManagedCodeCapabilities = jest.fn().mockResolvedValue(SUPPORTED());
    stored.document = { ...stored.document, presentation: { icon: "kimi", color: "#123456" } };
    show();
    await within(explorer()).findByText("Planner");
    expect(rowAvatar().getAttribute("data-agent-icon")).toBe("kimi");
    /* The row draws the glyph alone: no chosen colour, so the default tint. */
    expect(rowAvatar().getAttribute("data-agent-color")).toBe("");
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
