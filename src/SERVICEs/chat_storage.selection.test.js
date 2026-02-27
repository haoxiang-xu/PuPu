import {
  buildExplorerFromTree,
  chatsStorageConstants,
  createFolder,
  getChatsStore,
  selectTreeNode,
} from "./chat_storage";

describe("chat_storage folder selection behavior", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("buildExplorerFromTree folders are renameable without selection and not clickable-selectable", () => {
    const created = createFolder({ label: "Folder A" }, { source: "test" });
    const store = getChatsStore();
    const onSelect = jest.fn();
    const onStartRename = jest.fn();

    const model = buildExplorerFromTree(store.tree, store.chatsById, {
      selectedNodeId: store.tree.selectedNodeId,
      onSelect,
      onStartRename,
    });

    const folderNode = model.data[created.folderId];
    expect(folderNode).toBeTruthy();
    expect(folderNode.on_click).toBeUndefined();

    folderNode.on_double_click();

    expect(onSelect).not.toHaveBeenCalled();
    expect(onStartRename).toHaveBeenCalledTimes(1);
    expect(onStartRename).toHaveBeenCalledWith(
      expect.objectContaining({ id: created.folderId, entity: "folder" }),
    );
  });

  test("createFolder keeps selected node on a chat", () => {
    const before = getChatsStore();
    const selectedBefore = before.tree.selectedNodeId;

    const created = createFolder({ label: "Folder B" }, { source: "test" });
    const after = created.store;

    expect(after.tree.selectedNodeId).toBe(selectedBefore);
    expect(after.tree.selectedNodeId).not.toBe(created.folderId);
    expect(after.tree.nodesById[after.tree.selectedNodeId]?.entity).toBe("chat");
  });

  test("selectTreeNode ignores folder targets", () => {
    const before = getChatsStore();
    const selectedBefore = before.tree.selectedNodeId;
    const created = createFolder({ label: "Folder C" }, { source: "test" });

    const after = selectTreeNode({ nodeId: created.folderId }, { source: "test" });

    expect(after.tree.selectedNodeId).toBe(selectedBefore);
    expect(after.tree.nodesById[after.tree.selectedNodeId]?.entity).toBe("chat");
  });

  test("legacy selected folder ids are normalized back to chat nodes", () => {
    const created = createFolder({ label: "Folder Legacy" }, { source: "test" });
    const current = getChatsStore();
    const legacy = JSON.parse(JSON.stringify(current));
    legacy.tree.selectedNodeId = created.folderId;

    window.localStorage.setItem(chatsStorageConstants.key, JSON.stringify(legacy));

    const hydrated = getChatsStore();

    expect(hydrated.tree.selectedNodeId).not.toBe(created.folderId);
    expect(hydrated.tree.nodesById[hydrated.tree.selectedNodeId]?.entity).toBe(
      "chat",
    );
  });
});
