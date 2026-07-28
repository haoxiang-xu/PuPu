/** @jest-environment jsdom */

// Task 4 (chat storage V3): the bootstrap straggler-settle effect is meta
// driven — it iterates chat metas, and ONLY for chats with isGenerating===true
// loads messages via getChatMessages, settles them, and writes back. It must
// not scan (placeholder) message arrays and must not load non-generating chats.

const CHAT_A = "chat-a";
const CHAT_B = "chat-b";
const CHAT_C = "chat-c";
const NODE_A = `chn-${CHAT_A}`;
const NODE_B = `chn-${CHAT_B}`;
const NODE_C = `chn-${CHAT_C}`;

const makeMeta = (id, { title, messageCount = 0, isGenerating = false } = {}) => ({
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
  isGenerating,
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
  { id: "msg-b1", role: "user", content: "question B", createdAt: 1000 },
  {
    id: "msg-b2",
    role: "assistant",
    status: "streaming",
    content: "partial reply B",
    createdAt: 1001,
  },
];
const CHAT_C_MESSAGES = [
  {
    id: "msg-c1",
    role: "assistant",
    status: "streaming",
    content: "stale but not flagged",
    createdAt: 1000,
  },
];

describe("useChatSessionState bootstrap straggler settle (isGenerating meta driven)", () => {
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
          root: [NODE_A, NODE_B, NODE_C],
          nodesById: {
            [NODE_A]: makeChatNode(NODE_A, CHAT_A, "Chat A"),
            [NODE_B]: makeChatNode(NODE_B, CHAT_B, "Chat B"),
            [NODE_C]: makeChatNode(NODE_C, CHAT_C, "Chat C"),
          },
          selectedNodeId: NODE_A,
          expandedFolderIds: [],
        },
        chatMetasById: {
          [CHAT_A]: makeMeta(CHAT_A, { title: "Chat A", messageCount: 1 }),
          [CHAT_B]: makeMeta(CHAT_B, {
            title: "Chat B",
            messageCount: 2,
            isGenerating: true,
          }),
          [CHAT_C]: makeMeta(CHAT_C, { title: "Chat C", messageCount: 1 }),
        },
        activeChatMessages: ACTIVE_MESSAGES,
      })),
      write: jest.fn(),
      readMessages: jest.fn((chatId) => {
        if (chatId === CHAT_B) return CHAT_B_MESSAGES.map((m) => ({ ...m }));
        if (chatId === CHAT_C) return CHAT_C_MESSAGES.map((m) => ({ ...m }));
        return [];
      }),
      applyOps: jest.fn(),
    };
    window.chatStorageAPI = bridge;
  });

  afterEach(() => {
    delete window.chatStorageAPI;
  });

  const renderSessionState = () => {
    // jest.resetModules gives each test a fresh chat_storage memory store;
    // renderHook must come from the SAME fresh registry so it shares one React
    // instance with the hook module. The /pure entry avoids registering
    // cleanup hooks at require time (illegal mid-test); we unmount manually.
    const { renderHook } = require("@testing-library/react/pure");
    const cs = require("../../../SERVICEs/chat_storage");
    const { useChatSessionState } = require("./use_chat_session_state");
    const activeStreamsRef = { current: new Map() };
    const view = renderHook(() =>
      useChatSessionState({
        draftAttachments: [],
        setDraftAttachments: jest.fn(),
        activeStreamsRef,
        setStreamError: jest.fn(),
      }),
    );
    return { cs, view };
  };

  test("settles the non-active isGenerating chat via getChatMessages and clears the flag", () => {
    const { cs, view } = renderSessionState();

    expect(bridge.readMessages).toHaveBeenCalledWith(CHAT_B);

    const settled = cs.getChatMessages(CHAT_B);
    expect(settled.length).toBe(2);
    expect(
      settled.some(
        (m) => m?.role === "assistant" && m?.status === "streaming",
      ),
    ).toBe(false);
    expect(
      settled.some(
        (m) => m?.role === "assistant" && m?.content === "partial reply B",
      ),
    ).toBe(true);

    expect(cs.getChatsStore().chatsById[CHAT_B].isGenerating).toBe(false);

    view.unmount();
  });

  test("never loads chats whose meta is not generating (no message scanning)", () => {
    const { view } = renderSessionState();

    const readIds = bridge.readMessages.mock.calls.map(([chatId]) => chatId);
    expect(readIds).not.toContain(CHAT_C);
    expect(readIds).not.toContain(CHAT_A);

    view.unmount();
  });

  test("preserves a streaming message that has an exact attach identity", () => {
    bridge.readMessages.mockImplementation((chatId) => {
      if (chatId !== CHAT_B) return [];
      return CHAT_B_MESSAGES.map((message) =>
        message.id === "msg-b2"
          ? {
              ...message,
              meta: {
                requestId: "req-b",
                attemptId: "attempt-b",
                executionSessionId: CHAT_B,
              },
            }
          : { ...message },
      );
    });

    const { cs, view } = renderSessionState();
    const preserved = cs.getChatMessages(CHAT_B);

    expect(
      preserved.some(
        (message) =>
          message?.id === "msg-b2" && message?.status === "streaming",
      ),
    ).toBe(true);
    expect(cs.getChatsStore().chatsById[CHAT_B].isGenerating).toBe(true);

    view.unmount();
  });
});
