import {
  buildExplorerFromTree,
  createChatInSelectedContext,
  getChatsStore,
} from "./chat_storage";

const DAY_MS = 24 * 60 * 60 * 1000;

const findNodeIdByChatId = (tree, chatId) => {
  for (const [nodeId, node] of Object.entries(tree?.nodesById || {})) {
    if (node?.entity === "chat" && node?.chatId === chatId) {
      return nodeId;
    }
  }
  return null;
};

describe("chat_storage relative time postfix", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("buildExplorerFromTree adds compact relative updated times to chat nodes", () => {
    const referenceNow = 2000000000000;
    const seeded = getChatsStore();
    const firstChatId = seeded.activeChatId;
    const second = createChatInSelectedContext(
      { title: "Second chat" },
      { source: "test" },
    );
    const third = createChatInSelectedContext(
      { title: "Third chat" },
      { source: "test" },
    );

    const store = getChatsStore();
    store.chatsById[firstChatId].updatedAt = referenceNow - 2 * DAY_MS;
    store.chatsById[second.chatId].updatedAt = referenceNow - 20 * DAY_MS;
    store.chatsById[third.chatId].updatedAt = referenceNow - 70 * DAY_MS;

    const firstNodeId = findNodeIdByChatId(store.tree, firstChatId);
    const secondNodeId = findNodeIdByChatId(store.tree, second.chatId);
    const thirdNodeId = findNodeIdByChatId(store.tree, third.chatId);

    expect(firstNodeId).toBeTruthy();
    expect(secondNodeId).toBeTruthy();
    expect(thirdNodeId).toBeTruthy();

    const model = buildExplorerFromTree(store.tree, store.chatsById, {
      selectedNodeId: store.tree.selectedNodeId,
      relativeNow: referenceNow,
    });

    expect(model.data[firstNodeId].postfix).toBe("2d");
    expect(model.data[secondNodeId].postfix).toBe("2w");
    expect(model.data[thirdNodeId].postfix).toBe("2mo");
  });
});
