import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AgentExplorer from "./agent_explorer";
import { api } from "../../../../SERVICEs/api";
import { writeResourcePresentation } from "../../../../SERVICEs/agent_resource_presentation_store";
import { resetAgentFolderStorageForTests } from "../../../../SERVICEs/agent_folder_storage";

/* An Agent row in the side menu wears the Agent's own icon and colour, read
   from the stored summary's `presentation`; "Change icon…" writes through the
   resource store for an Agent that may not be open. */

jest.mock("../../use_presentation_capability", () => ({
  ...jest.requireActual("../../use_presentation_capability"),
  usePresentationCapability: () => "supported",
}));
jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
jest.mock("../../../../SERVICEs/agent_resource_presentation_store", () => ({ writeResourcePresentation: jest.fn() }));
/* A failed side-menu action is a toast (agent_explorer.test.js covers the
   toast itself); here only what it says is read. Plain function: CRA resets
   jest.fn implementations per test. */
const mockToastErrors = [];
jest.mock("../../../../SERVICEs/toast", () => ({ toast: {
  error: (message) => { mockToastErrors.push(message); return `toast-${mockToastErrors.length}`; },
  dismiss: () => {},
} }));
jest.mock("../../../../BUILTIN_COMPONENTs/explorer/explorer", () => function MockExplorer({ data, root }) {
  const draw = (id) => {
    const node = data[id];
    if (!node) return null;
    return (
      <div key={id} data-testid={`row-${id}`} data-prefix-icon={node.prefix_icon || ""}>
        {typeof node.prefix_render === "function" && node.prefix_render(15)}
        <span>{node.label}</span>
        {node.on_context_menu && (
          <button type="button" data-testid={`menu-${id}`}
            onClick={() => node.on_context_menu(node, { preventDefault() {}, stopPropagation() {}, clientX: 40, clientY: 50 })}>menu</button>
        )}
        {/* eslint-disable-next-line testing-library/no-node-access */}
        {(node.children || []).map(draw)}
      </div>
    );
  };
  return <div>{(root || []).map(draw)}</div>;
});
jest.mock("../../../../BUILTIN_COMPONENTs/context_menu/context_menu", () => function MockMenu({ visible, items }) {
  if (!visible) return null;
  return <div data-testid="context-menu">{items.filter((item) => item.label).map((item) => (
    <button key={item.label} type="button" disabled={item.disabled} data-trail={item.trail || ""} onClick={item.onClick}>{item.label}</button>
  ))}</div>;
});

const agent = (id, extra = {}) => ({ id, name: id, kind: "agent", archived: false, edit_token: `token-${id}`, ...extra });
const props = (extra = {}) => ({
  recipes: [], activeId: null, activeLegacyName: null, newDraft: null, activeDirty: false,
  onSelect: jest.fn(), onSelectLegacy: jest.fn(), onCreate: jest.fn(), onActiveChanged: jest.fn(),
  isDark: false, ...extra,
});
const avatar = (id) => screen.getByTestId(`agent-explorer-avatar-${id}`);

beforeEach(() => {
  mockToastErrors.length = 0;
  localStorage.clear();
  delete window.settingsStorageAPI;
  resetAgentFolderStorageForTests();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  writeResourcePresentation.mockReset();
});

test("rows draw each Agent's stored icon and colour, and the default for none or an unknown one", async () => {
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([
    agent("constructor", { presentation: { icon: "robot_face", color: "#2E8F5A" } }),
    agent("plain"),
    agent("odd", { presentation: { icon: "not-an-icon", color: "oops" } }),
    { id: "wf", name: "wf", kind: "workflow", archived: false, presentation: { icon: "kimi" } },
  ]);
  render(<AgentExplorer {...props()} />);
  await screen.findByTestId("row-resource:constructor");
  expect(avatar("constructor").getAttribute("data-agent-icon")).toBe("robot_face");
  expect(avatar("constructor").getAttribute("data-agent-color")).toBe("#2e8f5a");
  expect(avatar("plain").getAttribute("data-agent-icon")).toBe("bot");
  /* list rows: no tile; an un-customised Agent keeps the row's own colour */
  expect(avatar("plain").getAttribute("data-agent-variant")).toBe("glyph");
  expect(avatar("plain").getAttribute("data-agent-color")).toBe("");
  expect(avatar("plain").getAttribute("data-agent-tint")).toBe("currentColor");
  expect(avatar("plain").style.background).toBe("");
  expect(avatar("odd").getAttribute("data-agent-icon")).toBe("bot");
  expect(avatar("odd").getAttribute("data-agent-color")).toBe("");
  /* A Workflow keeps its flow glyph. */
  expect(screen.queryByTestId("agent-explorer-avatar-wf")).toBeNull();
  expect(screen.getByTestId("row-resource:wf").getAttribute("data-prefix-icon")).toBe("workflow");
});

test("Change icon… writes through the resource store and re-reads the library", async () => {
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a1")]);
  writeResourcePresentation.mockResolvedValue({ ok: true });
  render(<AgentExplorer {...props()} />);
  await screen.findByTestId("row-resource:a1");
  fireEvent.click(screen.getByTestId("menu-resource:a1"));
  fireEvent.click(within(screen.getByTestId("context-menu")).getByRole("button", { name: "Change icon…" }));
  const picker = screen.getByTestId("agent-explorer-icon-picker");
  fireEvent.click(within(picker).getByTestId("agent-explorer-icon-picker-icon-deepseek"));
  expect(writeResourcePresentation).not.toHaveBeenCalled();
  fireEvent.click(within(picker).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(writeResourcePresentation).toHaveBeenCalledWith("a1", { icon: "deepseek" }));
  /* Shown on the row at once, then read back from the store. */
  expect(avatar("a1").getAttribute("data-agent-icon")).toBe("deepseek");
  await waitFor(() => expect(api.unchain.listSkeletonResources).toHaveBeenCalledTimes(2));
});

test("Reset to default, then Save, removes the stored presentation", async () => {
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a1", { presentation: { icon: "deepseek" } })]);
  writeResourcePresentation.mockResolvedValue({ ok: true });
  render(<AgentExplorer {...props()} />);
  await screen.findByTestId("row-resource:a1");
  fireEvent.click(screen.getByTestId("menu-resource:a1"));
  fireEvent.click(within(screen.getByTestId("context-menu")).getByRole("button", { name: "Change icon…" }));
  const picker = screen.getByTestId("agent-explorer-icon-picker");
  fireEvent.click(within(picker).getByRole("button", { name: "Reset to default" }));
  expect(writeResourcePresentation).not.toHaveBeenCalled();
  fireEvent.click(within(picker).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(writeResourcePresentation).toHaveBeenLastCalledWith("a1", null));
  expect(avatar("a1").getAttribute("data-agent-icon")).toBe("bot");
});

test.each(["source_api_required", "presentation_unsupported", "edit_conflict"])("a refused write (%s) gets one plain message, never the code", async (code) => {
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a1")]);
  writeResourcePresentation.mockResolvedValue({ ok: false, code });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  render(<AgentExplorer {...props()} />);
  await screen.findByTestId("row-resource:a1");
  fireEvent.click(screen.getByTestId("menu-resource:a1"));
  fireEvent.click(within(screen.getByTestId("context-menu")).getByRole("button", { name: "Change icon…" }));
  fireEvent.click(screen.getByTestId("agent-explorer-icon-picker-color-d23f37"));
  fireEvent.click(within(screen.getByTestId("agent-explorer-icon-picker")).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockToastErrors).toHaveLength(1));
  render(<div data-testid="toast">{mockToastErrors[0]}</div>);
  expect(screen.getByTestId("toast")).toHaveTextContent(/^Could not change the icon of a1\.$/);
  expect(warn).toHaveBeenCalledWith(expect.any(String), code);
  warn.mockRestore();
});

test("the open Agent with unsaved edits must be saved first; a Workflow has no Change icon", async () => {
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([
    agent("a1"),
    { id: "wf", name: "wf", kind: "workflow", archived: false },
  ]);
  render(<AgentExplorer {...props({ activeId: "a1", activeDirty: true })} />);
  await screen.findByTestId("row-resource:a1");
  fireEvent.click(screen.getByTestId("menu-resource:a1"));
  const item = within(screen.getByTestId("context-menu")).getByRole("button", { name: "Change icon…" });
  expect(item).toBeDisabled();
  expect(item.getAttribute("data-trail")).toBe("save first");
  fireEvent.click(screen.getByTestId("menu-resource:wf"));
  expect(within(screen.getByTestId("context-menu")).queryByRole("button", { name: "Change icon…" })).toBeNull();
});
