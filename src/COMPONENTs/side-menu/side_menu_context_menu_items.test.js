import { buildSideMenuContextMenuItems } from "./side_menu_context_menu_items";
import {
  createChatInSelectedContext,
  createFolder,
  getChatsStore,
  setChatMessages,
} from "../../SERVICEs/chat_storage";

describe("side_menu_context_menu_items root paste", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("root menu shows Paste when clipboard exists", () => {
    const items = buildSideMenuContextMenuItems({
      node: null,
      clipboard: { type: "chat", chatId: "chat-1", label: "Any chat" },
      chatStore: getChatsStore(),
      setChatStore: jest.fn(),
      handleStartRename: jest.fn(),
      setClipboard: jest.fn(),
      setConfirmDelete: jest.fn(),
    });

    expect(items.some((item) => item?.label === "Paste")).toBe(true);
  });

  test("root paste duplicates folder subtree", () => {
    const sourceFolder = createFolder({ label: "Source" }, { source: "test" });
    const childFolder = createFolder(
      { label: "Child", parentFolderId: sourceFolder.folderId },
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

    const setChatStore = jest.fn();
    const items = buildSideMenuContextMenuItems({
      node: null,
      clipboard: {
        type: "folder",
        nodeId: sourceFolder.folderId,
        label: "Source",
      },
      chatStore: getChatsStore(),
      setChatStore,
      handleStartRename: jest.fn(),
      setClipboard: jest.fn(),
      setConfirmDelete: jest.fn(),
    });
    const pasteItem = items.find((item) => item?.label === "Paste");

    expect(pasteItem).toBeTruthy();
    pasteItem.onClick();

    expect(setChatStore).toHaveBeenCalled();

    const after = getChatsStore();
    const copiedRootId = Object.keys(after.tree.nodesById).find((id) => {
      const treeNode = after.tree.nodesById[id];
      return treeNode?.entity === "folder" && treeNode?.label === "Copy of Source";
    });
    expect(copiedRootId).toBeTruthy();

    const copiedRoot = after.tree.nodesById[copiedRootId];
    expect(copiedRoot.children.length).toBe(1);

    const copiedChildFolder = after.tree.nodesById[copiedRoot.children[0]];
    expect(copiedChildFolder.entity).toBe("folder");
    expect(copiedChildFolder.children.length).toBe(1);

    const copiedChatNode = after.tree.nodesById[copiedChildFolder.children[0]];
    expect(copiedChatNode.entity).toBe("chat");
    expect(copiedChatNode.chatId).not.toBe(nestedChat.chatId);
    expect(after.chatsById[copiedChatNode.chatId].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "nested message" }),
      ]),
    );
  });

  test("root paste duplicates chat messages", () => {
    const source = createChatInSelectedContext(
      { title: "Message Source", parentFolderId: null },
      { source: "test" },
    );
    setChatMessages(
      source.chatId,
      [{ role: "user", content: "copied content" }],
      { source: "test" },
    );

    const before = getChatsStore();
    const beforeCount = Object.keys(before.chatsById).length;
    const setChatStore = jest.fn();
    const items = buildSideMenuContextMenuItems({
      node: null,
      clipboard: {
        type: "chat",
        chatId: source.chatId,
        label: "Message Source",
      },
      chatStore: before,
      setChatStore,
      handleStartRename: jest.fn(),
      setClipboard: jest.fn(),
      setConfirmDelete: jest.fn(),
    });
    const pasteItem = items.find((item) => item?.label === "Paste");

    expect(pasteItem).toBeTruthy();
    pasteItem.onClick();
    expect(setChatStore).toHaveBeenCalled();

    const after = getChatsStore();
    expect(Object.keys(after.chatsById).length).toBe(beforeCount + 1);

    const copiedChatId = Object.keys(after.chatsById).find(
      (chatId) =>
        !before.chatsById[chatId] && after.chatsById[chatId]?.title === "Copy of Message Source",
    );
    expect(copiedChatId).toBeTruthy();
    expect(after.chatsById[copiedChatId].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "copied content" }),
      ]),
    );
  });
});
