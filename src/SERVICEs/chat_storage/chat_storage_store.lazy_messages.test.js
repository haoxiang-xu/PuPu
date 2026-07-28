/** @jest-environment jsdom */

// Task 3 (chat storage V3): renderer store on v3 ops + lazy messages.
// Contract under test (spec §3 ops protocol + §5 renderer model):
//  - v3 composite bootstrap assembles a lazy store: non-active chats carry
//    `messages: []` placeholders (stats intact); the active chat is full.
//  - getChatMessages routes: memory for active/hydrated chats, sendSync
//    readMessages for cold non-active chats.
//  - Chat switch preloads the new active chat's messages BEFORE emit.
//  - writeStore emits coalesced ops per microtask: put_tree_meta always,
//    put_chat_meta / put_messages per dirty declaration, delete_chats via
//    key diff; dedupe by (type, chatId), last write wins.
//  - Placeholder stats survive normalize cycles (tree ordering/summaries).
//  - setChatMessages maintains the isGenerating meta flag.

const CHAT_A = "chat-a";
const CHAT_B = "chat-b";
const NODE_A = `chn-${CHAT_A}`;
const NODE_B = `chn-${CHAT_B}`;

const makeMessage = (id, role, content, overrides = {}) => ({
  id,
  role,
  content,
  createdAt: 1000,
  updatedAt: 1000,
  ...(role === "assistant" ? { status: "done" } : {}),
  ...overrides,
});

const makeMeta = (id, { title, updatedAt = 2000, messageCount = 0 } = {}) => ({
  id,
  kind: "default",
  title: title || id,
  createdAt: 1000,
  updatedAt,
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

const ACTIVE_MESSAGES = [makeMessage("msg-a1", "user", "hello from A")];
const CHAT_B_MESSAGES = [
  makeMessage("msg-b1", "user", "hello from B"),
  makeMessage("msg-b2", "assistant", "reply for B"),
];

const makeV3Bootstrap = () => ({
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
    [CHAT_B]: makeMeta(CHAT_B, { title: "Chat B", messageCount: 2 }),
  },
  activeChatMessages: ACTIVE_MESSAGES,
});

describe("chat_storage lazy messages (v3 ops protocol)", () => {
  let bridge;

  const setupIpcBridge = ({ bootstrap } = {}) => {
    bridge = {
      bootstrap: jest.fn(() => bootstrap ?? makeV3Bootstrap()),
      write: jest.fn(),
      readMessages: jest.fn((chatId) =>
        chatId === CHAT_B ? CHAT_B_MESSAGES.map((m) => ({ ...m })) : [],
      ),
      applyOps: jest.fn(),
    };
    window.chatStorageAPI = bridge;
  };

  const flushOps = async () => {
    await Promise.resolve();
  };

  const allOps = () =>
    bridge.applyOps.mock.calls.flatMap(([payload]) =>
      Array.isArray(payload) ? payload : payload?.ops || [],
    );

  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
    delete window.chatStorageAPI;
    setupIpcBridge();
  });

  afterEach(() => {
    delete window.chatStorageAPI;
  });

  test("v3 bootstrap assembly: active chat full, non-active placeholder with stats intact", () => {
    const store = require("./chat_storage_store");
    const snapshot = store.getChatsStore();

    expect(snapshot.activeChatId).toBe(CHAT_A);
    expect(snapshot.chatsById[CHAT_A].messages).toHaveLength(1);
    expect(snapshot.chatsById[CHAT_A].messages[0].content).toBe("hello from A");

    // non-active: placeholder + preserved stats
    expect(snapshot.chatsById[CHAT_B].messages).toEqual([]);
    expect(snapshot.chatsById[CHAT_B].stats.messageCount).toBe(2);

    // assembly must not hit per-chat reads for non-active chats
    expect(bridge.readMessages).not.toHaveBeenCalledWith(CHAT_B);
  });

  test("getChatMessages: memory for active chat, IPC readMessages for cold non-active chat", () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridge.readMessages.mockClear();

    const activeMessages = store.getChatMessages(CHAT_A);
    expect(activeMessages).toHaveLength(1);
    expect(bridge.readMessages).not.toHaveBeenCalled();

    const coldMessages = store.getChatMessages(CHAT_B);
    expect(bridge.readMessages).toHaveBeenCalledWith(CHAT_B);
    expect(coldMessages).toHaveLength(2);
    expect(coldMessages[1].content).toBe("reply for B");
  });

  test("getChatMessages: unknown chat returns [] without IPC", () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridge.readMessages.mockClear();

    expect(store.getChatMessages("chat-missing")).toEqual([]);
    expect(store.getChatMessages(null)).toEqual([]);
    expect(bridge.readMessages).not.toHaveBeenCalled();
  });

  test("message read failure aborts a switch without writing back an empty list", () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridge.applyOps.mockClear();
    bridge.readMessages.mockImplementation(() => {
      throw new Error("message payload is corrupt");
    });

    expect(() => store.getChatMessages(CHAT_B)).toThrow(
      "message payload is corrupt",
    );
    expect(() =>
      store.selectTreeNode({ nodeId: NODE_B }, { source: "test" }),
    ).toThrow("message payload is corrupt");
    expect(store.getChatsStore().activeChatId).toBe(CHAT_A);
    expect(bridge.applyOps).not.toHaveBeenCalled();
  });

  test("chat switch preloads the new active chat's messages before emit", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();

    const seen = [];
    const unsubscribe = store.subscribeChatsStore((snapshot) => {
      seen.push(snapshot.chatsById[CHAT_B]?.messages?.length ?? -1);
    });

    store.selectTreeNode({ nodeId: NODE_B }, { source: "test" });

    // synchronous read right after the mutation already sees the messages
    const immediate = store.getChatsStore();
    expect(immediate.activeChatId).toBe(CHAT_B);
    expect(immediate.chatsById[CHAT_B].messages).toHaveLength(2);

    await flushOps();
    expect(seen.length).toBeGreaterThan(0);
    // every emitted snapshot after the switch carries the hydrated messages
    expect(seen.every((count) => count === 2)).toBe(true);
    unsubscribe();
  });

  test("selectTreeNode persists unread-clear: put_chat_meta for the activated chat with hasUnreadGeneratedReply=false", async () => {
    const bootstrap = makeV3Bootstrap();
    bootstrap.chatMetasById[CHAT_B].hasUnreadGeneratedReply = true;
    jest.resetModules();
    setupIpcBridge({ bootstrap });

    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridge.applyOps.mockClear();

    store.selectTreeNode({ nodeId: NODE_B }, { source: "test" });

    await flushOps();
    const ops = allOps();
    const metaOp = ops.find(
      (op) => op.type === "put_chat_meta" && op.chatId === CHAT_B,
    );
    expect(metaOp).toBeDefined();
    expect(metaOp.meta.hasUnreadGeneratedReply).toBe(false);
    // in-memory store agrees with what was persisted
    expect(
      store.getChatsStore().chatsById[CHAT_B].hasUnreadGeneratedReply,
    ).toBe(false);
  });

  test("cleanupTransientNewChatOnPageLeave persists unread-clear on the reselected fallback chat", async () => {
    const bootstrap = makeV3Bootstrap();
    bootstrap.chatMetasById[CHAT_A].isTransientNewChat = true;
    bootstrap.chatMetasById[CHAT_A].stats.messageCount = 0;
    bootstrap.chatMetasById[CHAT_A].lastMessageAt = null;
    bootstrap.activeChatMessages = [];
    bootstrap.chatMetasById[CHAT_B].hasUnreadGeneratedReply = true;
    jest.resetModules();
    setupIpcBridge({ bootstrap });

    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridge.applyOps.mockClear();

    store.cleanupTransientNewChatOnPageLeave({ source: "test" });

    await flushOps();
    const ops = allOps();
    // transient A removed via key diff, fallback B activated
    const deleteOp = ops.find((op) => op.type === "delete_chats");
    expect(deleteOp).toBeDefined();
    expect(deleteOp.chatIds).toContain(CHAT_A);

    const metaOp = ops.find(
      (op) => op.type === "put_chat_meta" && op.chatId === CHAT_B,
    );
    expect(metaOp).toBeDefined();
    expect(metaOp.meta.hasUnreadGeneratedReply).toBe(false);
    expect(store.getChatsStore().activeChatId).toBe(CHAT_B);
  });

  test("deleteTreeNodeCascade reselect keeps memory and persistence consistent (no unread flip, no divergence)", async () => {
    const bootstrap = makeV3Bootstrap();
    bootstrap.chatMetasById[CHAT_B].hasUnreadGeneratedReply = true;
    jest.resetModules();
    setupIpcBridge({ bootstrap });

    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridge.applyOps.mockClear();

    // delete the active chat A → reselect falls back to B (direct assignment path)
    store.deleteTreeNodeCascade({ nodeId: NODE_A }, { source: "test" });

    await flushOps();
    const ops = allOps();
    const snapshot = store.getChatsStore();
    expect(snapshot.activeChatId).toBe(CHAT_B);
    // this path does not clear the unread flag in memory, so no
    // put_chat_meta claiming otherwise may be emitted — flag must not
    // diverge between memory and disk (would resurrect/flip on restart)
    const metaOpB = ops.find(
      (op) => op.type === "put_chat_meta" && op.chatId === CHAT_B,
    );
    if (metaOpB) {
      expect(metaOpB.meta.hasUnreadGeneratedReply).toBe(
        snapshot.chatsById[CHAT_B].hasUnreadGeneratedReply,
      );
    }
    expect(snapshot.chatsById[CHAT_B].hasUnreadGeneratedReply).toBe(true);
  });

  test("selectTreeNode with no unread on the target emits only put_tree_meta (no gratuitous put_chat_meta)", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridge.applyOps.mockClear();

    store.selectTreeNode({ nodeId: NODE_B }, { source: "test" });
    expect(bridge.applyOps).not.toHaveBeenCalled(); // coalesced to microtask

    await flushOps();
    expect(bridge.applyOps).toHaveBeenCalledTimes(1);
    const ops = allOps();
    expect(ops.map((op) => op.type)).toEqual(["put_tree_meta"]);
    expect(ops[0].activeChatId).toBe(CHAT_B);
    expect(ops[0].tree?.nodesById?.[NODE_B]).toBeDefined();
    expect(typeof ops[0].updatedAt).toBe("number");
  });

  test("setChatMessages emits put_chat_meta (without messages) + put_messages + put_tree_meta", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridge.applyOps.mockClear();

    const nextMessages = [
      ...ACTIVE_MESSAGES,
      makeMessage("msg-a2", "assistant", "reply for A"),
    ];
    store.setChatMessages(CHAT_A, nextMessages, { source: "test" });

    await flushOps();
    expect(bridge.applyOps).toHaveBeenCalledTimes(1);
    const ops = allOps();

    const metaOp = ops.find((op) => op.type === "put_chat_meta");
    expect(metaOp).toBeDefined();
    expect(metaOp.chatId).toBe(CHAT_A);
    expect(metaOp.meta).not.toHaveProperty("messages");
    expect(metaOp.meta.stats.messageCount).toBe(2);

    const messagesOp = ops.find((op) => op.type === "put_messages");
    expect(messagesOp).toBeDefined();
    expect(messagesOp.chatId).toBe(CHAT_A);
    expect(messagesOp.messages).toHaveLength(2);

    expect(ops.filter((op) => op.type === "put_tree_meta")).toHaveLength(1);
    expect(ops.some((op) => op.type === "delete_chats")).toBe(false);
  });

  test("deleteTreeNodeCascade emits delete_chats via key diff", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridge.applyOps.mockClear();

    store.deleteTreeNodeCascade({ nodeId: NODE_B }, { source: "test" });

    await flushOps();
    expect(bridge.applyOps).toHaveBeenCalledTimes(1);
    const ops = allOps();
    const deleteOp = ops.find((op) => op.type === "delete_chats");
    expect(deleteOp).toBeDefined();
    expect(deleteOp.chatIds).toEqual([CHAT_B]);
    expect(ops.filter((op) => op.type === "put_tree_meta")).toHaveLength(1);
  });

  test("same-tick ops coalesce into one applyOps; (type, chatId) dedupe keeps the last write", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridge.applyOps.mockClear();

    store.setChatMessages(CHAT_A, ACTIVE_MESSAGES, { source: "test" });
    store.setChatMessages(
      CHAT_A,
      [...ACTIVE_MESSAGES, makeMessage("msg-a2", "assistant", "second write")],
      { source: "test" },
    );
    store.updateChatDraft(CHAT_A, { text: "draft text" }, { source: "test" });

    await flushOps();
    expect(bridge.applyOps).toHaveBeenCalledTimes(1);
    const ops = allOps();

    const messageOps = ops.filter((op) => op.type === "put_messages");
    expect(messageOps).toHaveLength(1);
    expect(messageOps[0].messages).toHaveLength(2);
    expect(messageOps[0].messages[1].content).toBe("second write");

    const metaOps = ops.filter((op) => op.type === "put_chat_meta");
    expect(metaOps).toHaveLength(1);
    expect(metaOps[0].meta.draft.text).toBe("draft text");

    expect(ops.filter((op) => op.type === "put_tree_meta")).toHaveLength(1);
  });

  test("delete wins over puts for the same chat id within a tick", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridge.applyOps.mockClear();

    store.updateChatDraft(CHAT_B, { text: "soon gone" }, { source: "test" });
    store.deleteTreeNodeCascade({ nodeId: NODE_B }, { source: "test" });

    await flushOps();
    expect(bridge.applyOps).toHaveBeenCalledTimes(1);
    const ops = allOps();
    expect(ops.some((op) => op.type === "put_chat_meta" && op.chatId === CHAT_B)).toBe(false);
    expect(ops.some((op) => op.type === "put_messages" && op.chatId === CHAT_B)).toBe(false);
    const deleteOp = ops.find((op) => op.type === "delete_chats");
    expect(deleteOp.chatIds).toContain(CHAT_B);
  });

  test("placeholder stats survive a normalize cycle triggered by another mutation", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();

    // mutate a different chat; chat B goes through normalize as a placeholder
    store.updateChatDraft(CHAT_A, { text: "typing..." }, { source: "test" });
    await flushOps();

    const snapshot = store.getChatsStore();
    expect(snapshot.chatsById[CHAT_B].messages).toEqual([]);
    expect(snapshot.chatsById[CHAT_B].stats.messageCount).toBe(2);
    expect(snapshot.chatsById[CHAT_B].lastMessageAt).toBe(1500);
  });

  test("setChatMessages sets and clears the isGenerating meta flag", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridge.applyOps.mockClear();

    store.setChatMessages(
      CHAT_A,
      [
        ...ACTIVE_MESSAGES,
        makeMessage("msg-a2", "assistant", "", { status: "streaming" }),
      ],
      { source: "test" },
    );
    expect(store.getChatsStore().chatsById[CHAT_A].isGenerating).toBe(true);

    await flushOps();
    const streamingMetaOp = allOps().find((op) => op.type === "put_chat_meta");
    expect(streamingMetaOp.meta.isGenerating).toBe(true);

    bridge.applyOps.mockClear();
    store.setChatMessages(
      CHAT_A,
      [
        ...ACTIVE_MESSAGES,
        makeMessage("msg-a2", "assistant", "done now", { status: "done" }),
      ],
      { source: "test" },
    );
    expect(store.getChatsStore().chatsById[CHAT_A].isGenerating).toBe(false);

    await flushOps();
    const doneMetaOp = allOps().find((op) => op.type === "put_chat_meta");
    expect(doneMetaOp.meta.isGenerating).toBe(false);
  });

  test("legacy whole-store bootstrap (first-boot migration) still hydrates fully in memory", () => {
    jest.resetModules();
    delete window.chatStorageAPI;
    const legacyStore = {
      schemaVersion: 2,
      updatedAt: 3000,
      activeChatId: CHAT_A,
      lruChatIds: [CHAT_A],
      chatsById: {
        [CHAT_A]: {
          ...makeMeta(CHAT_A, { title: "Chat A", messageCount: 1 }),
          messages: ACTIVE_MESSAGES,
        },
        [CHAT_B]: {
          ...makeMeta(CHAT_B, { title: "Chat B", messageCount: 2 }),
          messages: CHAT_B_MESSAGES,
        },
      },
      tree: {
        root: [NODE_A, NODE_B],
        nodesById: {
          [NODE_A]: makeChatNode(NODE_A, CHAT_A, "Chat A"),
          [NODE_B]: makeChatNode(NODE_B, CHAT_B, "Chat B"),
        },
        selectedNodeId: NODE_A,
        expandedFolderIds: [],
      },
      ui: {},
    };
    setupIpcBridge({ bootstrap: legacyStore });

    const store = require("./chat_storage_store");
    const snapshot = store.getChatsStore();
    expect(snapshot.chatsById[CHAT_B].messages).toHaveLength(2);
    // memory has everything → accessor never hits IPC
    bridge.readMessages.mockClear();
    expect(store.getChatMessages(CHAT_B)).toHaveLength(2);
    expect(bridge.readMessages).not.toHaveBeenCalled();
  });

  test("fallback build (no IPC): getChatMessages reads memory, never touches readMessages", () => {
    jest.resetModules();
    delete window.chatStorageAPI;
    window.localStorage.clear();

    const store = require("./chat_storage_store");
    const created = store.createChatWithMessagesInSelectedContext(
      { title: "Local", messages: CHAT_B_MESSAGES },
      { source: "test" },
    );
    const other = store.createChatInSelectedContext(
      { title: "Other" },
      { source: "test" },
    );
    expect(other.chatId).not.toBe(created.chatId);

    // created chat is now non-active, but fallback memory keeps everything
    const messages = store.getChatMessages(created.chatId);
    expect(messages).toHaveLength(2);
  });
});
