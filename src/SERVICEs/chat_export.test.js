/** @jest-environment jsdom */

// Task 4 (chat storage V3): export must read messages through getChatMessages
// (single chat) / a hydrated subtree snapshot (folder) — the store snapshot
// carries `messages: []` placeholders for non-active chats in IPC mode.

const mockShowSaveDialog = jest.fn();
const mockWriteFile = jest.fn();

jest.mock("./bridges/unchain_bridge", () => ({
  runtimeBridge: {
    showSaveDialog: (...args) => mockShowSaveDialog(...args),
    writeFile: (...args) => mockWriteFile(...args),
    showOpenDialog: jest.fn(),
    readFile: jest.fn(),
  },
}));

jest.mock("./api", () => ({
  api: {
    unchain: {
      getSessionMemoryExport: jest.fn(async () => ({ messages: [] })),
      replaceSessionMemory: jest.fn(async () => ({ ok: true })),
    },
  },
}));

const CHAT_A = "chat-a";
const CHAT_B = "chat-b";
const NODE_A = `chn-${CHAT_A}`;
const NODE_B = `chn-${CHAT_B}`;
const FOLDER_ID = "fold-1";

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

const ACTIVE_MESSAGES = [
  { id: "msg-a1", role: "user", content: "hello from A", createdAt: 1000 },
];
const CHAT_B_MESSAGES = [
  { id: "msg-b1", role: "user", content: "hello from B", createdAt: 1000 },
  {
    id: "msg-b2",
    role: "assistant",
    status: "done",
    content: "reply for B",
    createdAt: 1001,
  },
];

const makeV3Bootstrap = () => ({
  schemaVersion: 3,
  updatedAt: 3000,
  activeChatId: CHAT_A,
  tree: {
    root: [NODE_A, FOLDER_ID],
    nodesById: {
      [NODE_A]: {
        id: NODE_A,
        entity: "chat",
        type: "file",
        chatId: CHAT_A,
        label: "Chat A",
        createdAt: 1000,
        updatedAt: 2000,
      },
      [FOLDER_ID]: {
        id: FOLDER_ID,
        entity: "folder",
        type: "folder",
        label: "Folder One",
        children: [NODE_B],
        createdAt: 1000,
        updatedAt: 2000,
      },
      [NODE_B]: {
        id: NODE_B,
        entity: "chat",
        type: "file",
        chatId: CHAT_B,
        label: "Chat B",
        createdAt: 1000,
        updatedAt: 2000,
      },
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

describe("chat_export lazy-messages reads (IPC placeholder store)", () => {
  let bridge;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    window.localStorage.clear();
    bridge = {
      bootstrap: jest.fn(() => makeV3Bootstrap()),
      write: jest.fn(),
      readMessages: jest.fn((chatId) =>
        chatId === CHAT_B ? CHAT_B_MESSAGES.map((m) => ({ ...m })) : [],
      ),
      applyOps: jest.fn(),
    };
    window.chatStorageAPI = bridge;
    mockShowSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: "/tmp/export.json",
    });
    mockWriteFile.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    delete window.chatStorageAPI;
  });

  const writtenPayload = () => {
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    return JSON.parse(mockWriteFile.mock.calls[0][1]);
  };

  test("exportChat on a non-active chat pulls messages via getChatMessages", async () => {
    const { exportChat } = require("./chat_export");

    const result = await exportChat(CHAT_B);

    expect(result).toEqual({ ok: true });
    const payload = writtenPayload();
    expect(payload.type).toBe("chat");
    expect(payload.chat.messages).toEqual(
      CHAT_B_MESSAGES.map((m) => expect.objectContaining({
        id: m.id,
        role: m.role,
        content: m.content,
      })),
    );
    expect(bridge.readMessages).toHaveBeenCalledWith(CHAT_B);
  });

  test("exportFolder hydrates placeholder chats inside the subtree snapshot", async () => {
    const { exportFolder } = require("./chat_export");

    const result = await exportFolder(FOLDER_ID);

    expect(result).toEqual({ ok: true });
    const payload = writtenPayload();
    expect(payload.type).toBe("folder");
    expect(payload.snapshot.chatsById[CHAT_B].messages).toEqual(
      CHAT_B_MESSAGES.map((m) => expect.objectContaining({
        id: m.id,
        role: m.role,
        content: m.content,
      })),
    );
    expect(bridge.readMessages).toHaveBeenCalledWith(CHAT_B);
  });
});
