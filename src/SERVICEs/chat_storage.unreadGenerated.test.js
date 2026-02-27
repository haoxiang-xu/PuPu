import {
  buildExplorerFromTree,
  chatsStorageConstants,
  createChatInSelectedContext,
  createFolder,
  getChatsStore,
  selectTreeNode,
  setChatGeneratedUnread,
} from "./chat_storage";

const findNodeIdByChatId = (tree, chatId) => {
  for (const [nodeId, node] of Object.entries(tree?.nodesById || {})) {
    if (node?.entity === "chat" && node?.chatId === chatId) {
      return nodeId;
    }
  }
  return null;
};

describe("chat_storage unread generated markers", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("defaults hasUnreadGeneratedReply to false for legacy chat payloads", () => {
    const seeded = getChatsStore();
    const activeChatId = seeded.activeChatId;
    const legacy = JSON.parse(JSON.stringify(seeded));
    delete legacy.chatsById[activeChatId].hasUnreadGeneratedReply;
    window.localStorage.setItem(chatsStorageConstants.key, JSON.stringify(legacy));

    const hydrated = getChatsStore();
    expect(hydrated.chatsById[activeChatId].hasUnreadGeneratedReply).toBe(false);
  });

  test("setChatGeneratedUnread toggles persisted unread generated state", () => {
    const seeded = getChatsStore();
    const activeChatId = seeded.activeChatId;

    setChatGeneratedUnread(activeChatId, true, { source: "test" });
    expect(getChatsStore().chatsById[activeChatId].hasUnreadGeneratedReply).toBe(
      true,
    );

    setChatGeneratedUnread(activeChatId, false, { source: "test" });
    expect(getChatsStore().chatsById[activeChatId].hasUnreadGeneratedReply).toBe(
      false,
    );
  });

  test("buildExplorerFromTree includes unread generated marker for chat nodes", () => {
    const seeded = getChatsStore();
    const activeChatId = seeded.activeChatId;
    const activeNodeId = findNodeIdByChatId(seeded.tree, activeChatId);

    setChatGeneratedUnread(activeChatId, true, { source: "test" });
    const store = getChatsStore();
    const model = buildExplorerFromTree(store.tree, store.chatsById, {
      selectedNodeId: store.tree.selectedNodeId,
    });

    expect(activeNodeId).toBeTruthy();
    expect(model.data[activeNodeId].has_unread_generated_reply).toBe(true);
  });

  test("buildExplorerFromTree rolls unread generated marker up to nested folders", () => {
    const parent = createFolder({ label: "Parent" }, { source: "test" });
    const child = createFolder(
      { label: "Child", parentFolderId: parent.folderId },
      { source: "test" },
    );
    const created = createChatInSelectedContext(
      { parentFolderId: child.folderId, title: "Nested chat" },
      { source: "test" },
    );

    setChatGeneratedUnread(created.chatId, true, { source: "test" });
    const store = getChatsStore();
    const model = buildExplorerFromTree(store.tree, store.chatsById, {
      selectedNodeId: store.tree.selectedNodeId,
    });

    expect(model.data[created.nodeId].has_unread_generated_reply).toBe(true);
    expect(model.data[child.folderId].has_unread_generated_descendant).toBe(true);
    expect(model.data[parent.folderId].has_unread_generated_descendant).toBe(
      true,
    );
  });

  test("selectTreeNode clears unread generated marker for the selected chat", () => {
    const seeded = getChatsStore();
    const firstChatId = seeded.activeChatId;

    createChatInSelectedContext({ title: "Second chat" }, { source: "test" });
    setChatGeneratedUnread(firstChatId, true, { source: "test" });

    const beforeSelect = getChatsStore();
    const firstNodeId = findNodeIdByChatId(beforeSelect.tree, firstChatId);
    expect(firstNodeId).toBeTruthy();
    expect(beforeSelect.chatsById[firstChatId].hasUnreadGeneratedReply).toBe(
      true,
    );

    selectTreeNode({ nodeId: firstNodeId }, { source: "test" });
    const afterSelect = getChatsStore();

    expect(afterSelect.activeChatId).toBe(firstChatId);
    expect(afterSelect.chatsById[firstChatId].hasUnreadGeneratedReply).toBe(
      false,
    );
  });
});
