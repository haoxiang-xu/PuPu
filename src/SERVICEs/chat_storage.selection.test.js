import {
  buildExplorerFromTree,
  chatsStorageConstants,
  createChatInSelectedContext,
  createChatWithMessagesInSelectedContext,
  createFolder,
  duplicateTreeNodeSubtree,
  getChatsStore,
  setChatMessages,
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

  test("duplicateTreeNodeSubtree copies a folder with nested subitems", () => {
    const sourceFolder = createFolder({ label: "Source" }, { source: "test" });
    const childFolder = createFolder(
      { label: "Child", parentFolderId: sourceFolder.folderId },
      { source: "test" },
    );
    const topChat = createChatInSelectedContext(
      { title: "Top Chat", parentFolderId: sourceFolder.folderId },
      { source: "test" },
    );
    setChatMessages(
      topChat.chatId,
      [{ role: "user", content: "top message" }],
      { source: "test" },
    );
    const nestedChat = createChatInSelectedContext(
      { title: "Nested Chat", parentFolderId: childFolder.folderId },
      { source: "test" },
    );
    setChatMessages(
      nestedChat.chatId,
      [{ role: "user", content: "nested message" }],
      { source: "test" },
    );

    const before = getChatsStore();
    const copied = duplicateTreeNodeSubtree(
      {
        sourceNodeId: sourceFolder.folderId,
        parentFolderId: null,
        label: "Copy of Source",
      },
      { source: "test" },
    );
    const after = copied.store;

    expect(after.activeChatId).toBe(before.activeChatId);
    expect(after.tree.selectedNodeId).toBe(before.tree.selectedNodeId);

    const copiedRoot = after.tree.nodesById[copied.nodeId];
    expect(copiedRoot?.entity).toBe("folder");
    expect(copiedRoot?.label).toBe("Copy of Source");
    expect(copiedRoot?.children?.length).toBe(2);

    const copiedTopChatNodeId = copiedRoot.children.find(
      (id) => after.tree.nodesById[id]?.entity === "chat",
    );
    const copiedChildFolderId = copiedRoot.children.find(
      (id) => after.tree.nodesById[id]?.entity === "folder",
    );
    expect(copiedTopChatNodeId).toBeTruthy();
    expect(copiedChildFolderId).toBeTruthy();

    const copiedTopChatNode = after.tree.nodesById[copiedTopChatNodeId];
    const copiedChildFolder = after.tree.nodesById[copiedChildFolderId];
    expect(copiedTopChatNode.chatId).not.toBe(topChat.chatId);
    expect(copiedChildFolder.children.length).toBe(1);

    const copiedNestedChatNode =
      after.tree.nodesById[copiedChildFolder.children[0]];
    expect(copiedNestedChatNode.entity).toBe("chat");
    expect(copiedNestedChatNode.chatId).not.toBe(nestedChat.chatId);

    expect(after.chatsById[copiedTopChatNode.chatId].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "top message" }),
      ]),
    );
    expect(after.chatsById[copiedNestedChatNode.chatId].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "nested message" }),
      ]),
    );
  });

  test("createChatWithMessagesInSelectedContext creates active chat with seeded messages", () => {
    const before = getChatsStore();
    const beforeCount = Object.keys(before.chatsById).length;
    const result = createChatWithMessagesInSelectedContext(
      {
        title: "Copy Seeded",
        parentFolderId: null,
        messages: [{ role: "user", content: "seeded content" }],
      },
      { source: "test" },
    );
    const after = result.store;

    expect(Object.keys(after.chatsById).length).toBe(beforeCount + 1);
    expect(after.activeChatId).toBe(result.chatId);
    expect(after.tree.selectedNodeId).toBe(result.nodeId);
    expect(after.chatsById[result.chatId].title).toBe("Copy Seeded");
    expect(after.chatsById[result.chatId].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "seeded content" }),
      ]),
    );
  });
});
