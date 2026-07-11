/** @jest-environment jsdom */

// Task 4 (chat storage V3): the test-bridge adapter must read messages via
// getChatMessages (detail/config) and keep the summary list CHEAP by using
// chat.stats.messageCount — never loading messages for listChatsSummary.

const CHAT_A = "chat-a";
const CHAT_B = "chat-b";
const NODE_A = `chn-${CHAT_A}`;
const NODE_B = `chn-${CHAT_B}`;

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

describe("test_bridge chat_storage_adapter (v3 lazy messages)", () => {
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
          [CHAT_B]: makeMeta(CHAT_B, { title: "Chat B", messageCount: 2 }),
        },
        activeChatMessages: ACTIVE_MESSAGES,
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

  const makeAdapter = () => {
    const { buildChatStorageAdapter } = require("./chat_storage_adapter");
    return buildChatStorageAdapter();
  };

  test("listChatsSummary reads stats.messageCount and never loads messages", () => {
    const adapter = makeAdapter();

    const summaries = adapter.listChatsSummary();
    const byId = Object.fromEntries(summaries.map((s) => [s.id, s]));

    expect(byId[CHAT_A].message_count).toBe(1);
    expect(byId[CHAT_B].message_count).toBe(2);
    expect(bridge.readMessages).not.toHaveBeenCalled();
  });

  test("getChatDetail pulls a non-active chat's messages via getChatMessages", () => {
    const adapter = makeAdapter();

    const detail = adapter.getChatDetail(CHAT_B);

    expect(detail.id).toBe(CHAT_B);
    expect(detail.messages).toEqual(
      CHAT_B_MESSAGES.map((m) =>
        expect.objectContaining({ id: m.id, role: m.role, content: m.content }),
      ),
    );
    expect(bridge.readMessages).toHaveBeenCalledWith(CHAT_B);
  });

  test("getChatConfig derives last_message_role via getChatMessages", () => {
    const adapter = makeAdapter();

    const config = adapter.getChatConfig(CHAT_B);

    expect(config.last_message_role).toBe("assistant");
    expect(bridge.readMessages).toHaveBeenCalledWith(CHAT_B);
  });
});
