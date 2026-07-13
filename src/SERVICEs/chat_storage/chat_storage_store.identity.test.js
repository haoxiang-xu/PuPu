/** @jest-environment jsdom */

// Switch-chain incrementalization Task 1 (spec §1): copy-on-write store +
// identity-preserving normalize.
//
// Contract under test:
//  (a) chats untouched by a write generation keep their EXACT object
//      reference in memoryStore across generations; dirty chats get a new
//      identity (fresh sanitized object).
//  (b) untouched tree nodes keep their reference across generations.
//  (c) getChatsStore() stays a deep clone — it shares no chat/node/message
//      references with any memoryStore generation (one-way door: the
//      public contract is unchanged, reference reuse is internal only).
//  (d) dev guard: store-resident chat objects / messages arrays are frozen
//      outside production, so a mutator (or subscriber) writing without
//      cloning first throws instead of silently corrupting shared state.
//  (e) normalizeStore({ prevStore }) passes reference-equal chats through
//      without re-sanitizing (sanitize always mints fresh objects, so
//      reference passthrough ⟺ re-sanitize skipped).

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

describe("chat_storage copy-on-write identity (switch-chain spec §1)", () => {
  let bridge;

  const setupIpcBridge = () => {
    bridge = {
      bootstrap: jest.fn(() => makeV3Bootstrap()),
      write: jest.fn(),
      readMessages: jest.fn((chatId) =>
        chatId === CHAT_B ? CHAT_B_MESSAGES.map((m) => ({ ...m })) : [],
      ),
      applyOps: jest.fn(),
    };
    window.chatStorageAPI = bridge;
  };

  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
    delete window.chatStorageAPI;
    setupIpcBridge();
  });

  afterEach(() => {
    delete window.chatStorageAPI;
  });

  // Subscribers receive the actual memoryStore generation (not a clone) —
  // that is how we observe cross-generation object identity.
  const captureGenerations = (store) => {
    const generations = [];
    store.subscribeChatsStore((snapshot) => {
      generations.push(snapshot);
    });
    return generations;
  };

  test("(a) untouched chat keeps exact reference across write generations; dirty chat re-minted", () => {
    const store = require("./chat_storage_store");
    const generations = captureGenerations(store);

    store.setChatModel(CHAT_A, { id: "model-2" }, { source: "test" });
    store.flushStoreEmitSync();
    store.setChatModel(CHAT_A, { id: "model-3" }, { source: "test" });
    store.flushStoreEmitSync();

    expect(generations).toHaveLength(2);
    const [gen1, gen2] = generations;

    // dirty chat: new identity each generation
    expect(gen2.chatsById[CHAT_A]).not.toBe(gen1.chatsById[CHAT_A]);
    expect(gen2.chatsById[CHAT_A].model.id).toBe("model-3");

    // untouched chat: EXACT same object reference
    expect(gen2.chatsById[CHAT_B]).toBe(gen1.chatsById[CHAT_B]);
    // untouched messages array reference too
    expect(gen2.chatsById[CHAT_B].messages).toBe(gen1.chatsById[CHAT_B].messages);
  });

  test("(b) untouched tree node keeps exact reference across write generations", () => {
    const store = require("./chat_storage_store");
    const generations = captureGenerations(store);

    store.setChatModel(CHAT_A, { id: "model-2" }, { source: "test" });
    store.flushStoreEmitSync();
    store.setChatModel(CHAT_A, { id: "model-3" }, { source: "test" });
    store.flushStoreEmitSync();

    const [gen1, gen2] = generations;
    expect(gen1.tree.nodesById[NODE_B]).toBeTruthy();
    expect(gen2.tree.nodesById[NODE_B]).toBe(gen1.tree.nodesById[NODE_B]);
  });

  test("(c) getChatsStore() clone shares no references with a later generation's memoryStore", () => {
    const store = require("./chat_storage_store");
    const generations = captureGenerations(store);

    const publicClone = store.getChatsStore();

    store.setChatModel(CHAT_A, { id: "model-2" }, { source: "test" });
    store.flushStoreEmitSync();
    const memory = generations[generations.length - 1];

    for (const chatId of Object.keys(memory.chatsById)) {
      expect(publicClone.chatsById[chatId]).not.toBe(memory.chatsById[chatId]);
      expect(publicClone.chatsById[chatId].messages).not.toBe(
        memory.chatsById[chatId].messages,
      );
    }
    for (const nodeId of Object.keys(memory.tree.nodesById)) {
      expect(publicClone.tree.nodesById[nodeId]).not.toBe(
        memory.tree.nodesById[nodeId],
      );
    }
  });

  test("(d) dev freeze guard: writing a store-resident chat without cloning throws", () => {
    const store = require("./chat_storage_store");
    const generations = captureGenerations(store);

    store.setChatModel(CHAT_A, { id: "model-2" }, { source: "test" });
    store.flushStoreEmitSync();
    const memory = generations[generations.length - 1];

    // Simulated stale-reference mutator: direct write on a shared chat.
    expect(() => {
      memory.chatsById[CHAT_B].title = "stale write";
    }).toThrow(TypeError);
    expect(() => {
      memory.chatsById[CHAT_A].messages.push(
        makeMessage("msg-x", "user", "stale push"),
      );
    }).toThrow(TypeError);
    expect(() => {
      memory.tree.nodesById[NODE_B].label = "stale label";
    }).toThrow(TypeError);

    // and the store is unharmed
    expect(memory.chatsById[CHAT_B].title).toBe("Chat B");
  });

  test("(d2) mutators still work against frozen previous generations (clone-before-write discipline)", () => {
    const store = require("./chat_storage_store");
    store.setChatModel(CHAT_A, { id: "model-2" }, { source: "test" });
    store.flushStoreEmitSync();

    // rename touches the chat in place internally — must have claimed a clone
    const renamed = store.setChatTitle(CHAT_A, "Chat A renamed", {
      source: "test",
    });
    expect(renamed.chatsById[CHAT_A].title).toBe("Chat A renamed");

    // activating a chat with the unread flag set flips it (in-place flip must
    // clone first; metaChanged keeps it in the dirty set)
    store.setChatGeneratedUnread(CHAT_B, true, { source: "test" });
    store.flushStoreEmitSync();
    const selected = store.selectTreeNode({ nodeId: NODE_B }, { source: "test" });
    expect(selected.activeChatId).toBe(CHAT_B);
    expect(selected.chatsById[CHAT_B].hasUnreadGeneratedReply).toBe(false);
  });

  test("(e) normalizeStore with prevStore passes reference-equal chats through un-resanitized", () => {
    const { normalizeStore } = require("./chat_storage_migrate");
    const store = require("./chat_storage_store");
    const generations = captureGenerations(store);

    store.setChatModel(CHAT_A, { id: "model-2" }, { source: "test" });
    store.flushStoreEmitSync();
    const prev = generations[generations.length - 1];

    // simulate the next COW working store: fresh containers, chat values
    // carried by reference, CHAT_A replaced by a (cloned) dirty object
    const dirtyA = JSON.parse(JSON.stringify(prev.chatsById[CHAT_A]));
    dirtyA.title = "Chat A vNext";
    const input = {
      ...prev,
      chatsById: { ...prev.chatsById, [CHAT_A]: dirtyA },
      lruChatIds: [...prev.lruChatIds],
      tree: JSON.parse(JSON.stringify(prev.tree)),
    };

    const out = normalizeStore(input, { prevStore: prev });

    // untouched chat: exact reference passthrough (sanitize skipped)
    expect(out.chatsById[CHAT_B]).toBe(prev.chatsById[CHAT_B]);
    // dirty chat: fully re-sanitized fresh object
    expect(out.chatsById[CHAT_A]).not.toBe(prev.chatsById[CHAT_A]);
    expect(out.chatsById[CHAT_A]).not.toBe(dirtyA);
    expect(out.chatsById[CHAT_A].title).toBe("Chat A vNext");
    // untouched tree node reference restored even though the input tree was
    // a deep clone (equivalence-gated reuse)
    expect(out.tree.nodesById[NODE_B]).toBe(prev.tree.nodesById[NODE_B]);
  });
});
