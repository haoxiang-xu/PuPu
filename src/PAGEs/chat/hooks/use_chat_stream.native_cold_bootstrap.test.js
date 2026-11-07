import nativeColdApprovalCapture from "./fixtures/native_cold_approval.json";

const nativeColdCaptureForChat = (chatId) => {
  const captured = JSON.parse(JSON.stringify(nativeColdApprovalCapture));
  captured.chatId = chatId;
  captured.pending.session_id = chatId;
  captured.pending.interaction_session_id = chatId;
  captured.messages[1].meta.executionSessionId = chatId;
  captured.messages[1].traceFrames = captured.messages[1].traceFrames.map((frame) => ({
    ...frame,
    session_id: frame.type === "tool_call" &&
      frame.payload?.runtime_source_type === "interaction_requested"
      ? chatId
      : frame.session_id,
  }));
  return captured;
};

test("ChatInterface admits the retained native owner after synchronous IPC bootstrap and readMessages", async () => {
  jest.resetModules();
  window.localStorage.clear();
  const chatId = "native-cold-ipc-bootstrap-chat";
  const nodeId = `chn-${chatId}`;
  const captured = nativeColdCaptureForChat(chatId);
  const order = [];
  window.chatStorageAPI = {
    bootstrap: jest.fn(() => {
      order.push("bootstrap");
      return {
        schemaVersion: 3,
        updatedAt: 1000,
        activeChatId: chatId,
        tree: {
          root: [nodeId],
          nodesById: {
            [nodeId]: {
              id: nodeId,
              entity: "chat",
              type: "file",
              chatId,
              label: "Native cold approval",
              createdAt: 1000,
              updatedAt: 1000,
            },
          },
          selectedNodeId: nodeId,
          expandedFolderIds: [],
        },
        chatMetasById: {
          [chatId]: {
            id: chatId,
            kind: "default",
            title: "Native cold approval",
            createdAt: 1000,
            updatedAt: 1000,
            lastMessageAt: 1000,
            threadId: chatId,
            model: { id: "openai:gpt-5" },
            agentOrchestration: { mode: "default" },
            selectedToolkits: [],
            selectedWorkspaceIds: [],
            systemPromptOverrides: {},
            draft: { text: "", attachments: [], updatedAt: 1000 },
            isTransientNewChat: false,
            hasUnreadGeneratedReply: false,
            isGenerating: false,
            stats: { messageCount: captured.messages.length, approxBytes: 1024 },
          },
        },
        activeChatMessages: captured.messages,
      };
    }),
    readMessages: jest.fn((targetChatId) => {
      return targetChatId === chatId ? captured.messages : [];
    }),
    applyOps: jest.fn(() => true),
    write: jest.fn(),
  };
  window.unchainAPI = {
    getStatus: jest.fn(async () => ({ status: "ready", ready: true, url: "http://localhost:3000" })),
    isDurableInteractionBridgeAvailable: jest.fn(() => true),
    isRuntimeEventStreamV4Available: jest.fn(() => false),
    getModelCatalog: jest.fn(async () => ({
      activeModel: "openai:gpt-5",
      providers: { openai: ["gpt-5"], ollama: [], anthropic: [] },
      model_capabilities: {},
    })),
    listRecipes: jest.fn(async () => ({ recipes: [{ name: "Default" }] })),
    listSkeletonResources: jest.fn(async () => ({ resources: [] })),
    getPendingInteraction: jest.fn(async ({ session_id: sessionId } = {}) => {
      order.push("pending");
      return sessionId === chatId
        ? captured.pending
        : { status: "none", session_id: sessionId };
    }),
    startStream: jest.fn(),
    startStreamV2: jest.fn(),
    startStreamV4: jest.fn(),
    cancelExecution: jest.fn(),
    respondToolConfirmation: jest.fn(),
    replaceSessionMemory: jest.fn(async () => ({ applied: true })),
  };
  jest.doMock("../../../COMPONENTs/chat-messages/chat_messages", () => ({
    __esModule: true,
    default: (props) => {
      window.__nativeColdBootstrapProps = props;
      return require("react").createElement("div", { "data-testid": "chat-messages" });
    },
  }));
  jest.doMock("../../../COMPONENTs/chat-input/chat_input", () => ({
    __esModule: true,
    default: () => require("react").createElement("div", { "data-testid": "chat-input" }),
  }));

  let rendered = null;
  try {
    const React = require("react");
    const { render, waitFor } = require("@testing-library/react/pure");
    const ChatInterface = require("../chat").default;
    const { LocaleContext, NavigationContext, ThemeContext } = require("../../../CONTAINERs/config/context");
    const { writeFeatureFlags } = require("../../../SERVICEs/feature_flags");
    writeFeatureFlags({ enable_user_access_to_agents: true });
    rendered = render(
      React.createElement(ThemeContext.Provider, { value: { theme: {}, onThemeMode: "light_mode" } },
        React.createElement(NavigationContext.Provider, { value: { onFragment: "main", setOnFragment: jest.fn() } },
          React.createElement(LocaleContext.Provider, { value: { locale: "en", setLocale: jest.fn() } },
            React.createElement(ChatInterface),
          ),
        ),
      ),
    );
    await waitFor(() => expect(window.__nativeColdBootstrapProps?.pendingToolConfirmationRequests?.[
      captured.pending.interaction_id
    ]).toBeDefined());

    expect(order.indexOf("bootstrap")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("pending")).toBeGreaterThan(order.indexOf("bootstrap"));
    expect(window.__nativeColdBootstrapProps.messages).toEqual(captured.messages);
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  } finally {
    rendered?.unmount();
    delete window.chatStorageAPI;
    delete window.unchainAPI;
    delete window.__nativeColdBootstrapProps;
  }
});
