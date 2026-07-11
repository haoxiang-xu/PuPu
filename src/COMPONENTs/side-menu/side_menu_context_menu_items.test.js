import { buildSideMenuContextMenuItems } from "./side_menu_context_menu_items";
import {
  createChatInSelectedContext,
  createFolder,
  getChatsStore,
  openCharacterChat,
  setChatModel,
  setChatMessages,
} from "../../SERVICEs/chat_storage";

const testT = (key, params = {}) => {
  const labels = {
    "context_menu.copy_of": `Copy of ${params.label}`,
    "context_menu.delete": "Delete",
    "context_menu.import": "Import",
    "context_menu.inspect_memory": "Inspect Memory",
    "context_menu.new_chat": "New Chat",
    "context_menu.new_folder": "New Folder",
    "context_menu.paste": "Paste",
    "context_menu.rename": "Rename",
    "context_menu.copy": "Copy",
    "context_menu.export": "Export",
  };
  return labels[key] || key;
};

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
      t: testT,
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
      t: testT,
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
      t: testT,
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

  test("root paste chat falls back to latest store when clipboard messages is empty", () => {
    const source = createChatInSelectedContext(
      { title: "Fallback Source", parentFolderId: null },
      { source: "test" },
    );
    setChatMessages(
      source.chatId,
      [{ role: "user", content: "fallback content" }],
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
        label: "Fallback Source",
        messages: [],
      },
      chatStore: before,
      setChatStore,
      handleStartRename: jest.fn(),
      setClipboard: jest.fn(),
      setConfirmDelete: jest.fn(),
      t: testT,
    });
    const pasteItem = items.find((item) => item?.label === "Paste");

    expect(pasteItem).toBeTruthy();
    pasteItem.onClick();
    expect(setChatStore).toHaveBeenCalled();

    const after = getChatsStore();
    expect(Object.keys(after.chatsById).length).toBe(beforeCount + 1);

    const copiedChatId = Object.keys(after.chatsById).find(
      (chatId) =>
        !before.chatsById[chatId] && after.chatsById[chatId]?.title === "Copy of Fallback Source",
    );
    expect(copiedChatId).toBeTruthy();
    expect(after.chatsById[copiedChatId].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "fallback content" }),
      ]),
    );
  });

  test("copy action reads messages via getChatMessages, not the store snapshot", () => {
    const source = createChatInSelectedContext(
      { title: "Copy Source", parentFolderId: null },
      { source: "test" },
    );
    setChatMessages(
      source.chatId,
      [{ role: "user", content: "real copied content" }],
      { source: "test" },
    );

    // Simulate the v3 IPC snapshot shape: non-active chats carry `messages: []`
    // placeholders (stats intact). The copy handler must NOT trust it.
    const snapshotStore = getChatsStore();
    const placeholderStore = JSON.parse(JSON.stringify(snapshotStore));
    placeholderStore.chatsById[source.chatId].messages = [];

    const setClipboard = jest.fn();
    const items = buildSideMenuContextMenuItems({
      node: {
        id: source.nodeId,
        entity: "chat",
        chatId: source.chatId,
        label: "Copy Source",
      },
      clipboard: null,
      chatStore: placeholderStore,
      setChatStore: jest.fn(),
      handleStartRename: jest.fn(),
      setClipboard,
      setConfirmDelete: jest.fn(),
      t: testT,
    });

    const copyItem = items.find((item) => item?.label === "Copy");
    expect(copyItem).toBeTruthy();
    copyItem.onClick();

    expect(setClipboard).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat",
        chatId: source.chatId,
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: "real copied content",
          }),
        ]),
      }),
    );
  });

  test("character chat menu removes rename and copy actions", () => {
    const initialStore = getChatsStore();
    setChatModel(initialStore.activeChatId, { id: "openai:gpt-5" }, { source: "test" });
    const created = openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
        },
      },
      { source: "test" },
    );
    const chatStore = getChatsStore();
    const node = Object.values(chatStore.tree.nodesById).find(
      (treeNode) => treeNode?.entity === "chat" && treeNode?.chatId === created.chatId,
    );

    const items = buildSideMenuContextMenuItems({
      node,
      clipboard: null,
      chatStore,
      setChatStore: jest.fn(),
      handleStartRename: jest.fn(),
      setClipboard: jest.fn(),
      setConfirmDelete: jest.fn(),
      onInspectMemory: jest.fn(),
      t: testT,
    });

    expect(items.some((item) => item?.label === "Inspect Memory")).toBe(true);
    expect(items.some((item) => item?.label === "Delete")).toBe(true);
    expect(items.some((item) => item?.label === "Rename")).toBe(false);
    expect(items.some((item) => item?.label === "Copy")).toBe(false);
  });
});

describe("side_menu_context_menu_items paste under v3 IPC placeholder store", () => {
  const CHAT_A = "chat-a";
  const CHAT_B = "chat-b";
  const NODE_A = `chn-${CHAT_A}`;
  const NODE_B = `chn-${CHAT_B}`;

  const CHAT_B_MESSAGES = [
    { id: "msg-b1", role: "user", content: "cold paste content", createdAt: 1000 },
  ];

  const makeMeta = (id, { title, messageCount = 0 } = {}) => ({
    id,
    kind: "default",
    title: title || id,
    createdAt: 1000,
    updatedAt: 2000,
    lastMessageAt: messageCount > 0 ? 1500 : null,
    threadId: null,
    model: { id: "test-model" },
    agentOrchestration: { mode: "default" },
    selectedToolkits: [],
    selectedWorkspaceIds: [],
    systemPromptOverrides: {},
    draft: { text: "", attachments: [], updatedAt: 1000 },
    isTransientNewChat: false,
    hasUnreadGeneratedReply: false,
    isGenerating: false,
    stats: { messageCount, approxBytes: 640 },
  });

  const makeChatNode = (nodeId, chatId, label) => ({
    id: nodeId,
    entity: "chat",
    type: "file",
    chatId,
    label,
    createdAt: 1000,
    updatedAt: 2000,
  });

  let bridge;

  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
    bridge = {
      bootstrap: jest.fn(() => ({
        schemaVersion: 3,
        updatedAt: 3000,
        activeChatId: CHAT_A,
        tree: {
          root: [NODE_A, NODE_B],
          nodesById: {
            [NODE_A]: makeChatNode(NODE_A, CHAT_A, "Chat A"),
            [NODE_B]: makeChatNode(NODE_B, CHAT_B, "Chat B"),
          },
          selectedNodeId: NODE_A,
          expandedFolderIds: [],
        },
        chatMetasById: {
          [CHAT_A]: makeMeta(CHAT_A, { title: "Chat A", messageCount: 1 }),
          [CHAT_B]: makeMeta(CHAT_B, { title: "Chat B", messageCount: 1 }),
        },
        activeChatMessages: [
          { id: "msg-a1", role: "user", content: "hello from A", createdAt: 1000 },
        ],
      })),
      write: jest.fn(),
      readMessages: jest.fn((chatId) =>
        chatId === CHAT_B ? CHAT_B_MESSAGES.map((m) => ({ ...m })) : [],
      ),
      applyOps: jest.fn(),
    };
    window.chatStorageAPI = bridge;
  });

  afterEach(() => {
    delete window.chatStorageAPI;
  });

  test("paste of a cold non-active chat pulls messages via getChatMessages", () => {
    const cs = require("../../SERVICEs/chat_storage");
    const {
      buildSideMenuContextMenuItems: buildItems,
    } = require("./side_menu_context_menu_items");

    const before = cs.getChatsStore();
    // Placeholder precondition: the snapshot really is lazy for chat B.
    expect(before.chatsById[CHAT_B].messages).toEqual([]);

    const setChatStore = jest.fn();
    const items = buildItems({
      node: null,
      clipboard: { type: "chat", chatId: CHAT_B, label: "Chat B", messages: [] },
      chatStore: before,
      setChatStore,
      handleStartRename: jest.fn(),
      setClipboard: jest.fn(),
      setConfirmDelete: jest.fn(),
      t: testT,
    });

    const pasteItem = items.find((item) => item?.label === "Paste");
    expect(pasteItem).toBeTruthy();
    pasteItem.onClick();
    expect(setChatStore).toHaveBeenCalled();

    const after = cs.getChatsStore();
    const copiedChatId = Object.keys(after.chatsById).find(
      (chatId) => !before.chatsById[chatId],
    );
    expect(copiedChatId).toBeTruthy();
    expect(bridge.readMessages).toHaveBeenCalledWith(CHAT_B);
    expect(cs.getChatMessages(copiedChatId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "cold paste content" }),
      ]),
    );
  });
});
