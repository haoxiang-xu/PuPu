/** @jest-environment jsdom */

// Task 4 (chat storage V3): tree reads the isGenerating META flag (no message
// scanning — messages are lazy [] placeholders for non-active chats), and
// snapshotSubtreeForCopy hydrates placeholder chats through a caller-provided
// loadMessages loader (cycle-free: chat_storage_store.js imports this module,
// so this module must NOT import getChatMessages from the store).

import {
  buildExplorerFromTree,
  snapshotSubtreeForCopy,
} from "./chat_storage_tree";

const makeChat = (id, overrides = {}) => ({
  id,
  kind: "default",
  title: `Chat ${id}`,
  createdAt: 1000,
  updatedAt: 2000,
  lastMessageAt: null,
  messages: [],
  isGenerating: false,
  hasUnreadGeneratedReply: false,
  stats: { messageCount: 0, approxBytes: 0 },
  ...overrides,
});

const makeChatNode = (nodeId, chatId, label = chatId) => ({
  id: nodeId,
  entity: "chat",
  type: "file",
  chatId,
  label,
  createdAt: 1000,
  updatedAt: 2000,
});

const makeFolderNode = (nodeId, children, label = nodeId) => ({
  id: nodeId,
  entity: "folder",
  type: "folder",
  label,
  children,
  createdAt: 1000,
  updatedAt: 2000,
});

describe("buildExplorerFromTree isGenerating meta flag", () => {
  test("chat node generating dot comes from chat.isGenerating even with a [] messages placeholder", () => {
    const chatsById = {
      "chat-a": makeChat("chat-a", {
        isGenerating: true,
        messages: [],
        stats: { messageCount: 3, approxBytes: 640 },
      }),
      "chat-b": makeChat("chat-b"),
    };
    const tree = {
      root: ["node-a", "node-b"],
      nodesById: {
        "node-a": makeChatNode("node-a", "chat-a"),
        "node-b": makeChatNode("node-b", "chat-b"),
      },
      selectedNodeId: "node-a",
      expandedFolderIds: [],
    };

    const model = buildExplorerFromTree(tree, chatsById, {
      selectedNodeId: "node-a",
    });

    expect(model.data["node-a"].is_generating).toBe(true);
    expect(model.data["node-b"].is_generating).toBe(false);
  });

  test("does NOT scan messages: streaming assistant message with isGenerating=false stays off", () => {
    const chatsById = {
      "chat-a": makeChat("chat-a", {
        isGenerating: false,
        messages: [
          {
            id: "m1",
            role: "assistant",
            status: "streaming",
            content: "partial",
          },
        ],
        stats: { messageCount: 1, approxBytes: 64 },
      }),
    };
    const tree = {
      root: ["node-a"],
      nodesById: { "node-a": makeChatNode("node-a", "chat-a") },
      selectedNodeId: "node-a",
      expandedFolderIds: [],
    };

    const model = buildExplorerFromTree(tree, chatsById, {
      selectedNodeId: "node-a",
    });

    expect(model.data["node-a"].is_generating).toBe(false);
  });

  test("folder roll-up: has_generating_chat_descendant from nested placeholder chat's meta flag", () => {
    const chatsById = {
      "chat-deep": makeChat("chat-deep", {
        isGenerating: true,
        messages: [],
        stats: { messageCount: 2, approxBytes: 320 },
      }),
      "chat-other": makeChat("chat-other"),
    };
    const tree = {
      root: ["folder-parent", "node-other"],
      nodesById: {
        "folder-parent": makeFolderNode("folder-parent", ["folder-child"]),
        "folder-child": makeFolderNode("folder-child", ["node-deep"]),
        "node-deep": makeChatNode("node-deep", "chat-deep"),
        "node-other": makeChatNode("node-other", "chat-other"),
      },
      selectedNodeId: "node-other",
      expandedFolderIds: [],
    };

    const model = buildExplorerFromTree(tree, chatsById, {
      selectedNodeId: "node-other",
    });

    expect(model.data["node-deep"].is_generating).toBe(true);
    expect(model.data["folder-child"].has_generating_chat_descendant).toBe(true);
    expect(model.data["folder-parent"].has_generating_chat_descendant).toBe(
      true,
    );
  });
});

describe("snapshotSubtreeForCopy lazy-messages hydration", () => {
  const makeStore = () => ({
    chatsById: {
      "chat-cold": makeChat("chat-cold", {
        messages: [],
        stats: { messageCount: 2, approxBytes: 320 },
      }),
      "chat-warm": makeChat("chat-warm", {
        messages: [{ id: "w1", role: "user", content: "warm in memory" }],
        stats: { messageCount: 1, approxBytes: 64 },
      }),
      "chat-empty": makeChat("chat-empty", {
        messages: [],
        stats: { messageCount: 0, approxBytes: 0 },
      }),
    },
    tree: {
      root: ["folder-1"],
      nodesById: {
        "folder-1": makeFolderNode("folder-1", [
          "node-cold",
          "node-warm",
          "node-empty",
        ]),
        "node-cold": makeChatNode("node-cold", "chat-cold"),
        "node-warm": makeChatNode("node-warm", "chat-warm"),
        "node-empty": makeChatNode("node-empty", "chat-empty"),
      },
      selectedNodeId: "node-cold",
      expandedFolderIds: [],
    },
  });

  const COLD_MESSAGES = [
    { id: "c1", role: "user", content: "cold question" },
    { id: "c2", role: "assistant", status: "done", content: "cold answer" },
  ];

  test("hydrates placeholder chats via loadMessages; skips warm and truly-empty chats", () => {
    const loadMessages = jest.fn((chatId) =>
      chatId === "chat-cold" ? COLD_MESSAGES.map((m) => ({ ...m })) : [],
    );

    const snapshot = snapshotSubtreeForCopy(
      makeStore(),
      "folder-1",
      loadMessages,
    );

    expect(snapshot).toBeTruthy();
    expect(snapshot.chatsById["chat-cold"].messages).toEqual(COLD_MESSAGES);
    expect(snapshot.chatsById["chat-warm"].messages).toEqual([
      { id: "w1", role: "user", content: "warm in memory" },
    ]);
    expect(snapshot.chatsById["chat-empty"].messages).toEqual([]);
    // Loader only consulted for the cold placeholder chat.
    expect(loadMessages).toHaveBeenCalledTimes(1);
    expect(loadMessages).toHaveBeenCalledWith("chat-cold");
  });

  test("without a loader keeps the current clone-as-is behavior", () => {
    const snapshot = snapshotSubtreeForCopy(makeStore(), "folder-1");

    expect(snapshot).toBeTruthy();
    expect(snapshot.chatsById["chat-cold"].messages).toEqual([]);
    expect(snapshot.chatsById["chat-warm"].messages).toEqual([
      { id: "w1", role: "user", content: "warm in memory" },
    ]);
  });

  test("hydrated snapshot does not mutate the source store", () => {
    const store = makeStore();
    snapshotSubtreeForCopy(store, "folder-1", () =>
      COLD_MESSAGES.map((m) => ({ ...m })),
    );
    expect(store.chatsById["chat-cold"].messages).toEqual([]);
  });
});
