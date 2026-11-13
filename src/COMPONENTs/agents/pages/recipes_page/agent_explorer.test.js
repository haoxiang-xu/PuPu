import React from "react";
import { install_legacy_store_bridge } from "./legacy_store_test_bridge";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AgentExplorer from "./agent_explorer";
import { api } from "../../../../SERVICEs/api";
import { emitSkeletonLibraryRefresh } from "../../../../SERVICEs/skeleton_library_refresh";
import { getFolderState, resetAgentFolderStorageForTests, setFolderState } from "../../../../SERVICEs/agent_folder_storage";
import { LocaleContext } from "../../../../CONTAINERs/config/context";
import capture from "./managed_code_capture.json";

/* The Agents side menu (owner decision 2026-10-22: back to the original
 * explorer, native Agents only, legacy folders carried over by alias). The
 * explorer is replaced by a probe that draws every row and exposes the
 * callbacks the real one would call; storage runs for real in its fallback
 * mode. Safety goals of the list this replaced are kept: rows by id, absent is
 * not empty, a refusal is not empty, the latest answer wins, unmount stops
 * listening, no creation without a save bridge. */

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
/* The side menu reports a failed action as a toast. The toast service is a
   recording fake; ToastProbe draws what is showing, under whatever language
   the test renders it in, so an alert is read where a person would see it. */
const mockToasts = { items: [], next: 1, listeners: new Set() };
jest.mock("../../../../SERVICEs/toast", () => {
  const changed = () => mockToasts.listeners.forEach((listener) => listener());
  return { toast: {
    // Plain functions: the CRA config resets jest.fn implementations per test.
    error: (message, options = {}) => {
      const id = `toast-${mockToasts.next++}`;
      mockToasts.items = [...mockToasts.items, { id, message, options }];
      changed();
      return id;
    },
    dismiss: (id) => { mockToasts.items = mockToasts.items.filter((item) => item.id !== id); changed(); },
  } };
});
function ToastProbe() {
  const [, repaint] = React.useState(0);
  React.useEffect(() => {
    const listener = () => repaint((n) => n + 1);
    mockToasts.listeners.add(listener);
    return () => mockToasts.listeners.delete(listener);
  }, []);
  return mockToasts.items.map((item) => <div key={item.id} role="alert">{item.message}</div>);
}
/* The editor speaks v2 only (#357 G1); these mocks are graph-only. */
install_legacy_store_bridge(api.unchain);
const explorers = [];
jest.mock("../../../../BUILTIN_COMPONENTs/explorer/explorer", () => function MockExplorer(props) {
  explorers.push(props);
  const { data, root, active_node_id } = props;
  const draw = (id) => {
    const node = data[id];
    if (!node) return null;
    const { children: childIds = [] } = node;
    return (
      <div key={id} data-testid={`row-${id}`} data-active={String(active_node_id === id)}>
        <button type="button" data-testid={`open-${id}`} onClick={node.on_click}>{node.custom_label || node.label}</button>
        {node.postfix && <span data-testid={`postfix-${id}`}>{node.postfix}</span>}
        {node.on_context_menu && (
          <button type="button" data-testid={`menu-${id}`}
            onClick={() => node.on_context_menu(node, { preventDefault() {}, stopPropagation() {}, clientX: 1, clientY: 2 })}>menu</button>
        )}
        {childIds.map(draw)}
      </div>
    );
  };
  return <div data-testid={props.draggable ? "main-tree" : "side-tree"}>{(root || []).map(draw)}</div>;
});
jest.mock("../../../../BUILTIN_COMPONENTs/context_menu/context_menu", () => function MockMenu({ visible, items }) {
  if (!visible) return null;
  return <div data-testid="context-menu">{items.filter((item) => item.label).map((item) => (
    <button key={item.label} type="button" disabled={item.disabled} data-trail={item.trail || ""} onClick={item.onClick}>{item.label}</button>
  ))}</div>;
});
jest.mock("../../../../BUILTIN_COMPONENTs/modal/modal", () => function MockModal({ open, children }) {
  return open ? <div data-testid="modal">{children}</div> : null;
});
jest.mock("../../../../BUILTIN_COMPONENTs/input/button", () => function MockButton({ label, ariaLabel, onClick, disabled }) {
  return <button type="button" aria-label={ariaLabel} disabled={disabled} onClick={onClick}>{label || ariaLabel}</button>;
});

const agent = (id, name = id, extra = {}) => ({ id, name, kind: "agent", archived: false, edit_token: `token-${id}`, ...extra });
/* What the store reads back for one: Rename and Duplicate rewrite the stored
   document through the v2 aggregate (the legacy bridge stands in for it). */
const stored = (id, name = id, extra = {}) => ({ ...agent(id, name, extra), document: { id, name, kind: "agent", nodes: [], edges: [] } });
const missing = () => Object.assign(new Error("selected legacy resource was not found"), { code: "resource_missing" });
const deferred = () => {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { resolve, promise };
};
const props = (extra = {}) => ({
  recipes: [], activeId: null, activeLegacyName: null, newDraft: null, activeDirty: false,
  onSelect: jest.fn(), onSelectLegacy: jest.fn(), onCreate: jest.fn(), onActiveChanged: jest.fn(),
  isDark: false, ...extra,
});
const show = (extra) => {
  const p = props(extra);
  const view = render(<><AgentExplorer {...p} /><ToastProbe /></>);
  return { ...view, p };
};
const openMenu = (rowId) => fireEvent.click(screen.getByTestId(`menu-${rowId}`));
const menuItem = (label) => within(screen.getByTestId("context-menu")).getByRole("button", { name: label });

beforeEach(() => {
  explorers.length = 0;
  localStorage.clear();
  delete window.settingsStorageAPI;
  resetAgentFolderStorageForTests();
  act(() => { mockToasts.items = []; mockToasts.listeners.forEach((listener) => listener()); });
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.saveSkeletonResource = jest.fn();
});

describe("locale changes preserve the live resource action", () => {
  test("switching language preserves the rename control, selection and raw name without reading or writing", async () => {
    const rawName = "agents.save.saved {name} · é";
    const nextName = "  My raw 名称 {value}  ";
    const item = Object.freeze(agent("id-{raw}", rawName));
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([item]);
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(stored(item.id, rawName));
    api.unchain.saveSkeletonResource = jest.fn(async ({ document }) => stored(document.id, document.name));
    const p = props({ activeId: item.id });
    const tree = (locale) => <LocaleContext.Provider value={{ locale }}><AgentExplorer {...p} /><ToastProbe /></LocaleContext.Provider>;
    const view = render(tree("en"));
    await screen.findByTestId(`row-resource:${item.id}`);
    openMenu(`resource:${item.id}`);
    fireEvent.click(menuItem("Rename"));
    const input = within(screen.getByTestId(`row-resource:${item.id}`)).getByRole("textbox");
    fireEvent.change(input, { target: { value: nextName } });
    input.focus();
    input.setSelectionRange(3, 9);
    const folderBefore = JSON.stringify(getFolderState());
    for (const locale of ["zh-CN", "de", "en"]) {
      view.rerender(tree(locale));
      const current = within(screen.getByTestId(`row-resource:${item.id}`)).getByRole("textbox");
      expect(current).toBe(input);
      expect(current).toHaveFocus();
      expect(current).toHaveValue(nextName);
      expect([current.selectionStart, current.selectionEnd]).toEqual([3, 9]);
      expect(api.unchain.listSkeletonResources).toHaveBeenCalledTimes(1);
      expect(api.unchain.getSkeletonResource).not.toHaveBeenCalled();
      expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
      expect(JSON.stringify(getFolderState())).toBe(folderBefore);
      expect(p.onActiveChanged).not.toHaveBeenCalled();
    }
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1));
    const [{ document, expected_edit_token }] = api.unchain.saveSkeletonResource.mock.calls[0];
    expect([document.id, document.name, expected_edit_token]).toEqual([item.id, nextName.trim(), item.edit_token]);
    expect(item.name).toBe(rawName);
  });

  test("an in-flight refusal resolves in the current language and later locale changes only repaint its owned explanation", async () => {
    const pending = deferred();
    const rawName = "agents.explorer.rename_failed {name}";
    const rawError = "RAW_BACKEND {message} é document.nodes[0]";
    const item = Object.freeze(agent("opaque-resource-id", rawName));
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([item]);
    api.unchain.getSkeletonResource = jest.fn().mockReturnValue(pending.promise);
    api.unchain.saveSkeletonResource = jest.fn();
    const p = props({ activeId: item.id });
    const tree = (locale) => <LocaleContext.Provider value={{ locale }}><AgentExplorer {...p} /><ToastProbe /></LocaleContext.Provider>;
    const view = render(tree("en"));
    await screen.findByTestId(`row-resource:${item.id}`);
    openMenu(`resource:${item.id}`);
    fireEvent.click(menuItem("Rename"));
    const input = within(screen.getByTestId(`row-resource:${item.id}`)).getByRole("textbox");
    fireEvent.change(input, { target: { value: "New authored name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    view.rerender(tree("zh-CN"));
    await act(async () => { pending.resolve(Promise.reject(Object.assign(new Error(rawError), { code: "raw_code" }))); });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(`无法重命名“${rawName}”：${rawError}`);
    const readsAfterAction = api.unchain.listSkeletonResources.mock.calls.length;
    expect(readsAfterAction).toBe(2);
    view.rerender(tree("en"));
    expect(screen.getByRole("alert")).toHaveTextContent(`Could not rename “${rawName}”: ${rawError}`);
    view.rerender(tree("zh-CN"));
    expect(screen.getByRole("alert")).toHaveTextContent(`无法重命名“${rawName}”：${rawError}`);
    expect(api.unchain.listSkeletonResources).toHaveBeenCalledTimes(readsAfterAction);
    expect(api.unchain.getSkeletonResource).toHaveBeenCalledTimes(1);
    expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
    expect(p.onActiveChanged).not.toHaveBeenCalled();
    expect(item.name).toBe(rawName);
  });
});

describe("what is listed", () => {
  test("native Agents by id with their names; selecting hands back the id, never the name", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [agent("rev", "Reviewer")] });
    const { p } = show();
    fireEvent.click(await screen.findByTestId("open-resource:rev"));
    expect(screen.getByTestId("open-resource:rev")).toHaveTextContent("Reviewer");
    expect(p.onSelect).toHaveBeenCalledWith("rev");
    expect(api.unchain.listSkeletonResources).toHaveBeenCalledWith(true);
  });

  test("a build with no store lists no Agents and does not claim an empty library", async () => {
    show({ recipes: [{ name: "Old" }] });
    expect(await screen.findByRole("button", { name: "New Agent" })).toBeInTheDocument();
    expect(screen.queryByTestId("row-legacy:Old")).toBeNull();
    expect(screen.queryByTestId("agent-explorer-empty")).toBeNull();
    expect(screen.getByRole("button", { name: "New Agent" })).toBeDisabled();
  });

  test("an empty library says so", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
    show();
    expect(await screen.findByTestId("agent-explorer-empty")).toHaveTextContent("No Agents yet");
  });

  test("a refusal is reported with a retry, never shown as empty", async () => {
    api.unchain.listSkeletonResources = jest.fn()
      .mockResolvedValueOnce({ error: { code: "skeleton_store_failed", message: "store is down" } })
      .mockResolvedValueOnce([agent("a")]);
    show();
    expect(await screen.findByTestId("agent-explorer-failed")).toHaveTextContent("store is down");
    expect(screen.queryByTestId("agent-explorer-empty")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("row-resource:a")).toBeInTheDocument(); // a bare array is accepted too
  });

  test("legacy recipes are never listed — no \"Not migrated\" group, row or note — whatever the store says", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [agent("legacy-default", "Default")] });
    api.unchain.resolveSkeletonResource = jest.fn(async () => { throw missing(); });
    show({ recipes: [{ name: "Default" }, { name: "Ghost" }] });
    expect(await screen.findByTestId("row-resource:legacy-default")).toBeInTheDocument();
    expect(screen.queryByTestId("row-legacy:Ghost")).toBeNull();
    expect(screen.queryByTestId("row-group:not-migrated")).toBeNull();
    expect(screen.queryByText(/Not migrated|old editor/i)).toBeNull();
    expect(screen.queryByTestId("agent-explorer-side")).toBeNull();
  });

  test("with nothing open, the chat's default Agent is opened — only when exactly one active Agent is named Default", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("d1", "Default"), agent("other")]);
    const { p } = show({ autoSelectDefault: true });
    await waitFor(() => expect(p.onSelect).toHaveBeenCalledWith("d1"));
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("d1", "Default"), agent("d2", "Default")]);
    const second = show({ autoSelectDefault: true });
    await screen.findAllByTestId("row-resource:d2");
    expect(second.p.onSelect).not.toHaveBeenCalled();
  });
});

describe("refreshes", () => {
  test("the latest library answer wins when announcements overlap", async () => {
    const first = deferred();
    const second = deferred();
    api.unchain.listSkeletonResources = jest.fn()
      .mockResolvedValueOnce([agent("initial")])
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    show();
    expect(await screen.findByTestId("row-resource:initial")).toBeInTheDocument();
    act(() => { emitSkeletonLibraryRefresh(); emitSkeletonLibraryRefresh(); });
    await act(async () => { second.resolve([agent("latest")]); });
    expect(screen.getByTestId("row-resource:latest")).toBeInTheDocument();
    await act(async () => { first.resolve([agent("obsolete")]); });
    expect(screen.queryByTestId("row-resource:obsolete")).toBeNull();
  });

  test("unmount stops listening", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("initial")]);
    const view = show();
    await screen.findByTestId("row-resource:initial");
    view.unmount();
    act(() => { emitSkeletonLibraryRefresh(); });
    expect(api.unchain.listSkeletonResources).toHaveBeenCalledTimes(1);
  });
});

describe("folders", () => {
  const tree = (extra = {}) => ({
    folders: { f_work: { id: "f_work", name: "Work", parentId: null, childFolderIds: [], expanded: true } },
    folderOrder: ["f_work"], recipeFolder: {}, ...extra,
  });

  test("the shared folders hold native Agents placed by id", async () => {
    setFolderState(tree({ resourceFolder: { a: "f_work" }, resourceMigration: { version: 1, mapped: 0, unresolved: [] } }));
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a", "Alpha"), agent("b", "Beta")]);
    show();
    await screen.findByTestId("row-resource:a"); // folders draw from storage at once; Agents arrive with the library
    const folder = screen.getByTestId("row-folder:f_work");
    expect(within(folder).getByTestId("row-resource:a")).toBeInTheDocument();
    expect(within(folder).queryByTestId("row-resource:b")).toBeNull();
  });

  test("the legacy folder placement is carried over once, through the store's alias", async () => {
    setFolderState(tree({ recipeFolder: { Writer: "f_work" } }));
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("legacy-writer", "Writer")]);
    api.unchain.resolveSkeletonResource = jest.fn(async ({ legacy_name }) => {
      if (legacy_name === "Writer") return agent("legacy-writer", "Writer");
      throw missing();
    });
    show({ recipes: [{ name: "Writer" }] });
    await waitFor(() => expect(within(screen.getByTestId("row-folder:f_work")).getByTestId("row-resource:legacy-writer")).toBeInTheDocument());
    expect(getFolderState().resourceMigration).toStrictEqual({ version: 1, mapped: 1, unresolved: [] });
  });

  test("a drag rewrites native placement and leaves legacy placement alone", async () => {
    setFolderState(tree({ recipeFolder: { Old: "f_work" }, resourceMigration: { version: 1, mapped: 0, unresolved: [] } }));
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a")]);
    show();
    await screen.findByTestId("row-resource:a");
    const main = explorers.filter((entry) => entry.draggable).at(-1);
    const data = { ...main.data, "folder:f_work": { ...main.data["folder:f_work"], children: ["resource:a"] } };
    act(() => main.on_reorder(data, ["folder:f_work"]));
    expect(getFolderState().resourceFolder).toStrictEqual({ a: "f_work" });
    expect(getFolderState().recipeFolder).toStrictEqual({ Old: "f_work" });
    expect(within(screen.getByTestId("row-folder:f_work")).getByTestId("row-resource:a")).toBeInTheDocument();
  });

  test("deleting a folder asks, then moves its Agents to the top level", async () => {
    setFolderState(tree({ resourceFolder: { a: "f_work" }, resourceMigration: { version: 1, mapped: 0, unresolved: [] } }));
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a")]);
    show();
    await screen.findByTestId("row-folder:f_work");
    openMenu("folder:f_work");
    fireEvent.click(menuItem("Delete folder"));
    expect(screen.getByTestId("modal")).toHaveTextContent("The Agents in them stay");
    fireEvent.click(within(screen.getByTestId("modal")).getByRole("button", { name: "Delete folder" }));
    expect(screen.queryByTestId("row-folder:f_work")).toBeNull();
    expect(screen.getByTestId("main-tree")).toContainElement(screen.getByTestId("row-resource:a"));
    expect(getFolderState().resourceFolder).toStrictEqual({});
  });
});

describe("creating", () => {
  test("New Agent names an inline row, then opens a draft under a fresh opaque id in the chosen folder", async () => {
    setFolderState({ folders: { f_work: { id: "f_work", name: "Work", parentId: null, childFolderIds: [], expanded: true } }, folderOrder: ["f_work"], recipeFolder: {}, resourceMigration: { version: 1, mapped: 0, unresolved: [] } });
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([]);
    const { p, rerender } = show();
    await screen.findByTestId("row-folder:f_work");
    openMenu("folder:f_work");
    fireEvent.click(menuItem("New Agent"));
    const input = within(screen.getByTestId("row-__pending_agent__")).getByRole("textbox");
    fireEvent.change(input, { target: { value: "  Planner  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onCreate).toHaveBeenCalledTimes(1);
    const created = p.onCreate.mock.calls[0][0];
    expect(created.name).toBe("Planner");
    expect(created.id).toMatch(/^agent-[0-9a-f]{32}$/);
    expect(getFolderState().resourceFolder).toStrictEqual({ [created.id]: "f_work" });
    rerender(<AgentExplorer {...p} activeId={created.id} newDraft={created} />);
    const draft = within(screen.getByTestId("row-folder:f_work")).getByTestId(`row-draft:${created.id}`);
    expect(draft).toHaveAttribute("data-active", "true");
    expect(within(draft).getByTestId(`postfix-draft:${created.id}`)).toHaveTextContent("unsaved");
  });

  test("a blank name creates nothing; a listing without a save bridge offers no creation", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([]);
    const { p } = show();
    await screen.findByTestId("agent-explorer-empty");
    fireEvent.click(screen.getByRole("button", { name: "New Agent" }));
    const input = within(screen.getByTestId("row-__pending_agent__")).getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onCreate).not.toHaveBeenCalled();
    delete api.unchain.saveSkeletonResource;
    act(() => { emitSkeletonLibraryRefresh(); });
    await waitFor(() => expect(screen.getByRole("button", { name: "New Agent" })).toBeDisabled());
  });
});

describe("the right-click verbs", () => {
  test("rename uses the listed token, refreshes, and asks the open editor to re-read", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a", "Alpha")]);
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(stored("a", "Alpha"));
    api.unchain.saveSkeletonResource = jest.fn(async ({ document }) => stored(document.id, document.name));
    api.unchain.renameSkeletonResource = jest.fn();
    const { p } = show({ activeId: "a" });
    await screen.findByTestId("row-resource:a");
    openMenu("resource:a");
    fireEvent.click(menuItem("Rename"));
    const input = within(screen.getByTestId("row-resource:a")).getByRole("textbox");
    fireEvent.change(input, { target: { value: "Omega" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1));
    const [{ document, expected_edit_token }] = api.unchain.saveSkeletonResource.mock.calls[0];
    expect([document.id, document.name, expected_edit_token]).toEqual(["a", "Omega", "token-a"]);
    expect(api.unchain.renameSkeletonResource).not.toHaveBeenCalled();
    await waitFor(() => expect(p.onActiveChanged).toHaveBeenCalledWith({ type: "reload", id: "a" }));
    expect(api.unchain.listSkeletonResources).toHaveBeenCalledTimes(2);
  });

  test("a rename that lost a race says so and changes nothing else", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a", "Alpha")]);
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(stored("a", "Alpha"));
    api.unchain.saveSkeletonResource = jest.fn().mockRejectedValue(Object.assign(new Error("resource changed"), { code: "edit_conflict" }));
    const { p } = show();
    await screen.findByTestId("row-resource:a");
    openMenu("resource:a");
    fireEvent.click(menuItem("Rename"));
    const input = within(screen.getByTestId("row-resource:a")).getByRole("textbox");
    fireEvent.change(input, { target: { value: "Omega" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(within(screen.getByTestId("agent-explorer")).queryByRole("alert")).not.toBeInTheDocument();
    expect(mockToasts.items).toHaveLength(1);
    expect(mockToasts.items[0].options.dedupeKey).toMatch(/^agent-explorer:.*changed elsewhere/);
    expect(p.onActiveChanged).not.toHaveBeenCalled();
  });

  test("a later success withdraws the failure toast instead of leaving it up", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a", "Alpha")]);
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(stored("a", "Alpha"));
    api.unchain.saveSkeletonResource = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error("resource changed"), { code: "edit_conflict" }))
      .mockImplementation(async ({ document }) => stored(document.id, document.name));
    show();
    await screen.findByTestId("row-resource:a");
    const rename = async (value) => {
      openMenu("resource:a");
      fireEvent.click(menuItem("Rename"));
      const input = within(screen.getByTestId("row-resource:a")).getByRole("textbox");
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter" });
    };
    await rename("Omega");
    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
    await rename("Omega");
    await waitFor(() => expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  test("Delete is available for an unsaved Agent and Default while Rename still requires saving", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a", "Alpha"), agent("d", "Default")]);
    show({ activeId: "a", activeDirty: true });
    await screen.findByTestId("row-resource:a");
    openMenu("resource:a");
    expect(menuItem("Rename")).toBeDisabled();
    expect(menuItem("Rename")).toHaveAttribute("data-trail", "save first");
    expect(menuItem("Delete")).not.toBeDisabled();
    expect(menuItem("Duplicate")).not.toBeDisabled();
    openMenu("resource:d");
    expect(menuItem("Delete")).not.toBeDisabled();
    expect(menuItem("Rename")).not.toBeDisabled();
  });

  test("duplicate saves a copy under a new id in the same folder and opens it", async () => {
    setFolderState({ folders: { f: { id: "f", name: "F", parentId: null, childFolderIds: [], expanded: true } }, folderOrder: ["f"], recipeFolder: {}, resourceFolder: { a: "f" }, resourceMigration: { version: 1, mapped: 0, unresolved: [] } });
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a", "Alpha"), agent("b", "Alpha copy")]);
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(stored("a", "Alpha"));
    api.unchain.saveSkeletonResource = jest.fn(async ({ document }) => stored(document.id, document.name));
    api.unchain.duplicateSkeletonResource = jest.fn();
    const { p } = show();
    await screen.findByTestId("row-resource:a");
    openMenu("resource:a");
    fireEvent.click(menuItem("Duplicate"));
    await waitFor(() => expect(p.onSelect).toHaveBeenCalled());
    expect(api.unchain.getSkeletonResource).toHaveBeenCalledWith("a");
    const [{ document, expected_edit_token }] = api.unchain.saveSkeletonResource.mock.calls[0];
    const newId = document.id, name = document.name;
    expect([name, expected_edit_token]).toEqual(["Alpha copy 2", undefined]);
    expect(api.unchain.duplicateSkeletonResource).not.toHaveBeenCalled();
    expect(newId).toMatch(/^agent-[0-9a-f]{32}$/);
    expect(p.onSelect).toHaveBeenCalledWith(newId);
    expect(getFolderState().resourceFolder[newId]).toBe("f");
  });

  /* The reported failure: Default, once saved by the editor, owns Code text,
     and the graph-only duplicate answered `source_api_required`. The copy is
     now read and written as the v2 aggregate (the real producer's capture),
     and every Code text goes with it at the same address. */
  test("duplicate of a resource that owns Code text carries that text to the copy", async () => {
    const copy = (value) => JSON.parse(JSON.stringify(value));
    const reply = copy(capture.rows.find((row) => row.case === "nested_get").reply);
    const source = reply.resource;
    const v2 = (name, value) => Object.defineProperty(api.unchain, name, { configurable: true, writable: true, value });
    try {
      api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent(source.id, source.name, { edit_token: source.edit_token })]);
      api.unchain.duplicateSkeletonResource = jest.fn().mockRejectedValue(
        Object.assign(new Error("this resource requires the managed-source API"), { code: "source_api_required" }));
      v2("getManagedSkeletonResource", jest.fn().mockResolvedValue(copy(reply)));
      v2("saveManagedSkeletonResource", jest.fn(async (edit) => {
        const answer = copy(reply);
        answer.resource = { ...answer.resource, id: edit.document.id, name: edit.document.name, document: edit.document };
        return answer;
      }));
      const { p } = show();
      await screen.findByTestId(`row-resource:${source.id}`);
      openMenu(`resource:${source.id}`);
      fireEvent.click(menuItem("Duplicate"));
      await waitFor(() => expect(p.onSelect).toHaveBeenCalled());
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(api.unchain.duplicateSkeletonResource).not.toHaveBeenCalled();
      expect(api.unchain.getManagedSkeletonResource).toHaveBeenCalledWith(source.id);
      const [edit] = api.unchain.saveManagedSkeletonResource.mock.calls[0];
      expect(Object.keys(edit).sort()).toEqual(["document", "expected_edit_token", "managed_sources", "schema"]);
      expect(edit.schema).toBe("pupu.skeleton-edit.v2");
      expect(edit.expected_edit_token).toBeNull();
      expect(edit.document.id).toMatch(/^agent-[0-9a-f]{32}$/);
      expect(edit.document.id).not.toBe(source.id);
      expect(edit.document.name).toBe(`${source.name} copy`);
      expect(edit.document.nodes).toEqual(source.document.nodes);
      const texts = Object.fromEntries(reply.contents.map((row) => [row.sha256, row.text]));
      const expected = reply.sources_manifest.entries.map((entry) => JSON.stringify({ node_path: entry.node_path, text: texts[entry.sha256] })).sort();
      expect(edit.managed_sources.map((row) => JSON.stringify(row)).sort()).toEqual(expected);
      expect(expected.length).toBe(3);
      expect(p.onSelect).toHaveBeenCalledWith(edit.document.id);
    } finally {
      delete api.unchain.getManagedSkeletonResource;
      delete api.unchain.saveManagedSkeletonResource;
      install_legacy_store_bridge(api.unchain);
    }
  });

  test.each(["agent", "workflow"])("Delete confirms then removes a %s, clears the editor and never archives it", async (kind) => {
    let deleted = false;
    api.unchain.listSkeletonResources = jest.fn(async () => deleted ? [] : [agent("a", "Alpha", { kind, edit_token: "t1" })]);
    api.unchain.deleteSkeletonResource = jest.fn(async () => { deleted = true; return { ok: true }; });
    api.unchain.archiveSkeletonResource = jest.fn();
    const { p } = show({ activeId: "a" });
    await screen.findByTestId("row-resource:a");
    openMenu("resource:a");
    fireEvent.click(menuItem("Delete"));
    expect(api.unchain.deleteSkeletonResource).not.toHaveBeenCalled();
    expect(screen.getByTestId("modal")).toHaveTextContent("cannot be undone");
    fireEvent.click(within(screen.getByTestId("modal")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByTestId("row-resource:a")).not.toBeInTheDocument());
    expect(api.unchain.deleteSkeletonResource).toHaveBeenCalledWith("a", "t1");
    expect(api.unchain.archiveSkeletonResource).not.toHaveBeenCalled();
    expect(p.onActiveChanged).toHaveBeenCalledWith({ type: "deleted", id: "a" });
    expect(screen.queryByTestId("row-archived:a")).not.toBeInTheDocument();
  });

  test("Cancel preserves the resource and delete failure keeps it visible", async () => {
    api.unchain.listSkeletonResources = jest.fn(async () => [agent("a", "Alpha")]);
    api.unchain.deleteSkeletonResource = jest.fn().mockRejectedValue(new Error("Used by Caller"));
    const { p } = show({ activeId: "a" });
    await screen.findByTestId("row-resource:a");
    openMenu("resource:a");
    fireEvent.click(menuItem("Delete"));
    fireEvent.click(within(screen.getByTestId("modal")).getByRole("button", { name: "Cancel" }));
    expect(api.unchain.deleteSkeletonResource).not.toHaveBeenCalled();
    openMenu("resource:a");
    fireEvent.click(menuItem("Delete"));
    fireEvent.click(within(screen.getByTestId("modal")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Used by Caller");
    expect(screen.getByTestId("row-resource:a")).toBeInTheDocument();
    expect(p.onActiveChanged).not.toHaveBeenCalled();
  });

  test("historical archived resources offer Delete and have no Restore action", async () => {
    api.unchain.listSkeletonResources = jest.fn(async () => [agent("a", "Alpha", { archived: true })]);
    show();
    await screen.findByTestId("row-archived:a");
    openMenu("archived:a");
    expect(menuItem("Delete")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Restore", exact: true })).not.toBeInTheDocument();
  });
});


test("the open Agents header preserves the shared top-strip leading offset without writing", async () => {
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
  const onCollapse = jest.fn();
  show({ headerLeadingPad: 48, onCollapse });
  await screen.findByTestId("agent-explorer-empty");
  const toggle = screen.getByRole("button", { name: /^Hide (agents|workflows)$/ });
  expect(toggle.parentElement.style.paddingLeft).toBe("48px");
  expect(screen.getByTestId("agent-explorer").style.padding).toBe("4px 4px");
  fireEvent.click(toggle);
  expect(onCollapse).toHaveBeenCalledTimes(1);
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
});


test("searching the native list keeps selection and stored placement unchanged", async () => {
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [agent("review", "Reviewer"), agent("build", "Builder")] });
  const { p } = show();
  await screen.findByTestId("row-resource:build");
  const input = screen.getByRole("textbox", { name: "Search..." });
  fireEvent.change(input, { target: { value: "VIEW" } });
  expect(screen.getByTestId("row-resource:review")).toBeInTheDocument();
  expect(screen.queryByTestId("row-resource:build")).toBeNull();
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.getByTestId("row-resource:build")).toBeInTheDocument();
  expect(p.onSelect).not.toHaveBeenCalled();
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
});
