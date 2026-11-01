import React from "react";
import { install_legacy_store_bridge } from "./legacy_store_test_bridge";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AgentExplorer from "./agent_explorer";
import { api } from "../../../../SERVICEs/api";
import { emitSkeletonLibraryRefresh } from "../../../../SERVICEs/skeleton_library_refresh";
import { getFolderState, resetAgentFolderStorageForTests, setFolderState } from "../../../../SERVICEs/agent_folder_storage";

/* The Agents side menu (owner decision 2026-10-22: back to the original
 * explorer, native Agents only, legacy folders carried over by alias). The
 * explorer is replaced by a probe that draws every row and exposes the
 * callbacks the real one would call; storage runs for real in its fallback
 * mode. Safety goals of the list this replaced are kept: rows by id, absent is
 * not empty, a refusal is not empty, the latest answer wins, unmount stops
 * listening, no creation without a save bridge. */

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
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
  const view = render(<AgentExplorer {...p} />);
  return { ...view, p };
};
const openMenu = (rowId) => fireEvent.click(screen.getByTestId(`menu-${rowId}`));
const menuItem = (label) => within(screen.getByTestId("context-menu")).getByRole("button", { name: label });

beforeEach(() => {
  explorers.length = 0;
  localStorage.clear();
  delete window.settingsStorageAPI;
  resetAgentFolderStorageForTests();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.saveSkeletonResource = jest.fn();
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
    expect(await screen.findByTestId("row-legacy:Old")).toBeInTheDocument();
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

  test("a migrated recipe appears once, as its Agent; one with no migrated Agent stays reachable in the old editor", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [agent("legacy-default", "Default")] });
    api.unchain.resolveSkeletonResource = jest.fn(async ({ legacy_name, source_scope }) => {
      expect(source_scope).toBe("user:agent_recipes");
      if (legacy_name === "Default") return agent("legacy-default", "Default");
      throw missing();
    });
    const { p } = show({ recipes: [{ name: "Default" }, { name: "Ghost" }] });
    expect(await screen.findByTestId("row-legacy:Ghost")).toBeInTheDocument();
    expect(screen.queryByTestId("row-legacy:Default")).toBeNull();
    expect(screen.getByTestId("main-tree")).toHaveTextContent("Default");
    fireEvent.click(screen.getByTestId("open-legacy:Ghost"));
    expect(p.onSelectLegacy).toHaveBeenCalledWith("Ghost");
    expect(screen.getByTestId("postfix-legacy:Ghost")).toHaveTextContent("old editor");
  });

  test("a recipe the store holds several Agents for is not listed as not migrated", async () => {
    /* legacy_name_ambiguous means it WAS migrated, more than once: its Agents
       are in the main tree, so listing it again would show it twice. */
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("w1", "Writer"), agent("w2", "Writer")]);
    api.unchain.resolveSkeletonResource = jest.fn(async ({ legacy_name }) => {
      if (legacy_name === "Writer") throw Object.assign(new Error("selected legacy name is ambiguous"), { code: "legacy_name_ambiguous" });
      throw missing();
    });
    show({ recipes: [{ name: "Writer" }, { name: "Ghost" }] });
    expect(await screen.findByTestId("row-legacy:Ghost")).toBeInTheDocument();
    expect(screen.queryByTestId("row-legacy:Writer")).toBeNull();
    expect(screen.getByTestId("row-resource:w1")).toBeInTheDocument();
    expect(screen.getByTestId("row-resource:w2")).toBeInTheDocument();
  });

  test("a recipe whose migration could not be checked is checked again once the library answers again", async () => {
    /* Otherwise a sidecar that was briefly unreachable leaves a migrated
       recipe listed twice — as its Agent and as "not migrated" — for good. */
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("legacy-w", "Writer")]);
    api.unchain.resolveSkeletonResource = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error("sidecar busy"), { code: "unchain_unavailable" }))
      .mockResolvedValueOnce(agent("legacy-w", "Writer"));
    show({ recipes: [{ name: "Writer" }] });
    expect(await screen.findByTestId("row-legacy:Writer")).toBeInTheDocument();
    act(() => { emitSkeletonLibraryRefresh(); });
    await waitFor(() => expect(screen.queryByTestId("row-legacy:Writer")).toBeNull());
    expect(api.unchain.resolveSkeletonResource).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("row-resource:legacy-w")).toBeInTheDocument();
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
    api.unchain.renameSkeletonResource = jest.fn().mockResolvedValue(agent("a", "Omega"));
    const { p } = show({ activeId: "a" });
    await screen.findByTestId("row-resource:a");
    openMenu("resource:a");
    fireEvent.click(menuItem("Rename"));
    const input = within(screen.getByTestId("row-resource:a")).getByRole("textbox");
    fireEvent.change(input, { target: { value: "Omega" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(api.unchain.renameSkeletonResource).toHaveBeenCalledWith("a", "Omega", "token-a"));
    await waitFor(() => expect(p.onActiveChanged).toHaveBeenCalledWith({ type: "reload", id: "a" }));
    expect(api.unchain.listSkeletonResources).toHaveBeenCalledTimes(2);
  });

  test("a rename that lost a race says so and changes nothing else", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a", "Alpha")]);
    api.unchain.renameSkeletonResource = jest.fn().mockRejectedValue(Object.assign(new Error("resource changed"), { code: "edit_conflict" }));
    const { p } = show();
    await screen.findByTestId("row-resource:a");
    openMenu("resource:a");
    fireEvent.click(menuItem("Rename"));
    const input = within(screen.getByTestId("row-resource:a")).getByRole("textbox");
    fireEvent.change(input, { target: { value: "Omega" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(p.onActiveChanged).not.toHaveBeenCalled();
  });

  test("an open Agent with unsaved work cannot be renamed or archived from here, and Default cannot be archived", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a", "Alpha"), agent("d", "Default")]);
    show({ activeId: "a", activeDirty: true });
    await screen.findByTestId("row-resource:a");
    openMenu("resource:a");
    expect(menuItem("Rename")).toBeDisabled();
    expect(menuItem("Rename")).toHaveAttribute("data-trail", "save first");
    expect(menuItem("Archive")).toBeDisabled();
    expect(menuItem("Duplicate")).not.toBeDisabled();
    openMenu("resource:d");
    expect(menuItem("Archive")).toBeDisabled();
    expect(menuItem("Archive")).toHaveAttribute("data-trail", "chat default");
    expect(menuItem("Rename")).not.toBeDisabled();
  });

  test("duplicate saves a copy under a new id in the same folder and opens it", async () => {
    setFolderState({ folders: { f: { id: "f", name: "F", parentId: null, childFolderIds: [], expanded: true } }, folderOrder: ["f"], recipeFolder: {}, resourceFolder: { a: "f" }, resourceMigration: { version: 1, mapped: 0, unresolved: [] } });
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([agent("a", "Alpha"), agent("b", "Alpha copy")]);
    api.unchain.duplicateSkeletonResource = jest.fn().mockResolvedValue({});
    const { p } = show();
    await screen.findByTestId("row-resource:a");
    openMenu("resource:a");
    fireEvent.click(menuItem("Duplicate"));
    await waitFor(() => expect(p.onSelect).toHaveBeenCalled());
    const [source, newId, name] = api.unchain.duplicateSkeletonResource.mock.calls[0];
    expect([source, name]).toEqual(["a", "Alpha copy 2"]);
    expect(newId).toMatch(/^agent-[0-9a-f]{32}$/);
    expect(p.onSelect).toHaveBeenCalledWith(newId);
    expect(getFolderState().resourceFolder[newId]).toBe("f");
  });

  test("archive asks first, then leaves the list for Archived, where Restore brings it back", async () => {
    let archived = false;
    api.unchain.listSkeletonResources = jest.fn(async () => [agent("a", "Alpha", { archived, edit_token: archived ? "t2" : "t1" })]);
    api.unchain.archiveSkeletonResource = jest.fn(async () => { archived = true; return {}; });
    api.unchain.restoreSkeletonResource = jest.fn(async () => { archived = false; return {}; });
    show();
    await screen.findByTestId("row-resource:a");
    openMenu("resource:a");
    fireEvent.click(menuItem("Archive"));
    expect(api.unchain.archiveSkeletonResource).not.toHaveBeenCalled();
    expect(screen.getByTestId("modal")).toHaveTextContent("Restore it from Archived");
    fireEvent.click(within(screen.getByTestId("modal")).getByRole("button", { name: "Archive" }));
    expect(await screen.findByTestId("row-archived:a")).toBeInTheDocument();
    expect(api.unchain.archiveSkeletonResource).toHaveBeenCalledWith("a", "t1");
    expect(screen.queryByTestId("row-resource:a")).toBeNull();
    openMenu("archived:a");
    fireEvent.click(menuItem("Restore"));
    expect(await screen.findByTestId("row-resource:a")).toBeInTheDocument();
    expect(api.unchain.restoreSkeletonResource).toHaveBeenCalledWith("a", "t2");
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
