/**
 * Memory V2 P0 payload seams — owner_chat_id identity + enable_memory_v2
 * lazy-bootstrap fields on the outgoing stream payload.
 *
 * Locks:
 *  - owner_chat_id is ALWAYS the UI chat id (targetChatId) on the normal
 *    payload and on a character-chat payload (where threadId becomes the
 *    character session_id).
 *  - flag OFF → memory_v2_requested / memory_agent_config /
 *    context_v2_history appear NOWHERE on the normal payload.
 *  - flag ON (normal send) → memory_v2_requested: true + memory_agent_config
 *    + context_v2_history built from the chat's settled prior user/assistant
 *    messages (attachments preserved, no streaming placeholder, no trace
 *    residue), while the legacy `history` field stays byte-equivalent to the
 *    flag-off payload.
 *  - a recorded durable receipt is sealed and never emits a model payload,
 *    regardless of the Memory V2 flag.
 *  - memory_agent_config carries exactly the normalized Memory Agent surface
 *    ({displayName, additionalInstructions, provider, modelId}) and never
 *    leaks any other settings namespace or extra stored field.
 *
 * Harness mirrors use_chat_stream.composer_sidecar.test.js: real
 * ChatInterface, mocked ChatMessages / ChatInput, payload read from the
 * window.unchainAPI stream mocks.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  LocaleContext,
  NavigationContext,
  ThemeContext,
} from "../../../CONTAINERs/config/context";
import ChatInterface from "../chat";
import {
  getChatsStore,
  openCharacterChat,
  setChatMessages,
  setChatModel,
} from "../../../SERVICEs/chat_storage";

let lastChatMessagesProps = null;
let lastChatInputProps = null;
var mockScopedLogger;

jest.mock("../../../SERVICEs/console_logger", () => ({
  createLogger: () => {
    if (!mockScopedLogger) {
      mockScopedLogger = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
    }
    return mockScopedLogger;
  },
}));

jest.mock("../../../COMPONENTs/chat-messages/chat_messages", () => ({
  __esModule: true,
  default: (props) => {
    lastChatMessagesProps = props;
    const { messages = [] } = props;
    return (
      <div data-testid="chat-messages">
        {messages.map((message) => (
          <div key={message.id || `${message.role}-${message.content}`}>
            {message.role}:{message.content}:{message.status || "done"}
          </div>
        ))}
      </div>
    );
  },
}));

jest.mock("../../../COMPONENTs/chat-input/chat_input", () => ({
  __esModule: true,
  default: (props) => {
    lastChatInputProps = props;
    const { value, onChange, onSend, sendDisabled } = props;
    return (
      <div>
        <input
          data-testid="chat-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          data-testid="send-button"
          onClick={onSend}
          disabled={sendDisabled}
        >
          Send
        </button>
      </div>
    );
  },
}));

// deep scan for a KEY anywhere in a nested object/array
const deepHasKey = (value, key) => {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => deepHasKey(v, key));
  return Object.keys(value).some(
    (k) => k === key || deepHasKey(value[k], key),
  );
};

// deep scan for a VALUE anywhere in a nested object/array
const deepHasValue = (value, needle) => {
  if (value === needle) return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((v) => deepHasValue(v, needle));
};

const setMemoryV2Flag = (enabled) => {
  const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
  root.feature_flags = {
    ...(root.feature_flags || {}),
    enable_memory_v2: enabled === true,
  };
  window.localStorage.setItem("settings", JSON.stringify(root));
};

// Seeds the memory_agent_v2 settings namespace the way the Agent Builder
// would, via the same "settings" root the repository reads in Jest mode.
const setMemoryAgentSettings = (record) => {
  const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
  root.memory_agent_v2 = record;
  window.localStorage.setItem("settings", JSON.stringify(root));
};

const DEFAULT_MEMORY_AGENT_CONFIG = {
  displayName: "Memory Agent",
  additionalInstructions: "",
  provider: "",
  modelId: "",
};

describe("Memory V2 P0 payload seams", () => {
  let streamHandlers;

  beforeEach(() => {
    window.localStorage.clear();
    lastChatMessagesProps = null;
    lastChatInputProps = null;
    streamHandlers = null;
    jest.spyOn(console, "error").mockImplementation(() => {});
    if (mockScopedLogger) {
      mockScopedLogger.log.mockClear();
      mockScopedLogger.warn.mockClear();
      mockScopedLogger.error.mockClear();
      mockScopedLogger.debug.mockClear();
    }
    window.unchainAPI = {
      getStatus: jest.fn(async () => ({
        status: "ready",
        ready: true,
        url: "http://localhost:3000",
        reason: "",
      })),
      getModelCatalog: jest.fn(async () => ({
        activeModel: "openai:gpt-5",
        providers: { openai: ["gpt-5"], ollama: [], anthropic: [] },
        model_capabilities: {},
      })),
      startStream: jest.fn(),
      startStreamV2: jest.fn((_payload, handlers = {}) => {
        streamHandlers = handlers;
        return { cancel: jest.fn() };
      }),
      replaceSessionMemory: jest.fn(async () => ({ applied: true })),
      getSessionMemoryExport: jest.fn(async (sessionId) => ({
        session_id: sessionId,
        session_revision: 1,
        messages: [],
      })),
      buildCharacterAgentConfig: jest.fn(async () => ({
        session_id: "character_nico__dm__main",
        run_memory_namespace: "character_nico__rel__local_user",
        default_model: "openai:gpt-4.1",
        instructions: "You are Nico.",
        decision: { action: "reply", courtesy_message: null },
      })),
      cancelStream: jest.fn(),
      respondToolConfirmation: jest.fn(async () => ({ status: "ok" })),
      interject: jest.fn(async () => ({ resolved_channel: "queue" })),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.unchainAPI;
  });

  const renderChat = () =>
    render(
      <ThemeContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <NavigationContext.Provider
          value={{ onFragment: "main", setOnFragment: jest.fn() }}
        >
          <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
            <ChatInterface />
          </LocaleContext.Provider>
        </NavigationContext.Provider>
      </ThemeContext.Provider>,
    );

  const waitForReady = async () => {
    await waitFor(() => {
      expect(window.unchainAPI.getStatus).toHaveBeenCalled();
      expect(window.unchainAPI.getModelCatalog).toHaveBeenCalled();
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    });
  };

  const sendText = (text) => {
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: text },
    });
    fireEvent.click(screen.getByTestId("send-button"));
  };

  const seedPriorTurn = (chatId) => {
    const priorMessages = [
      {
        id: "user-prior-1",
        role: "user",
        content: "earlier question",
        createdAt: 1,
        updatedAt: 1,
        attachments: [{ id: "att-1", name: "notes.txt" }],
      },
      {
        id: "assistant-prior-1",
        role: "assistant",
        content: "earlier answer",
        createdAt: 2,
        updatedAt: 2,
        status: "done",
        traceFrames: [{ seq: 1, type: "tool_call", payload: { x: 1 } }],
      },
    ];
    setChatMessages(chatId, priorMessages, { source: "test" });
    return priorMessages;
  };

  test("flag off: owner_chat_id is the UI chat id and no memory-v2 fields exist", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPriorTurn(chatId);
    renderChat();
    await waitForReady();

    sendText("hello there");
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    const payload = window.unchainAPI.startStreamV2.mock.calls[0][0];
    expect(payload.owner_chat_id).toBe(chatId);
    expect(payload.threadId).toBe(chatId);
    expect(deepHasKey(payload, "memory_v2_requested")).toBe(false);
    expect(deepHasKey(payload, "context_v2_history")).toBe(false);
    expect(deepHasKey(payload, "memory_agent_config")).toBe(false);
  });

  test("flag on: bootstrap fields are added while legacy history stays byte-equivalent", async () => {
    // control run — flag off
    const chatId = getChatsStore().activeChatId;
    const priorMessages = seedPriorTurn(chatId);
    const { unmount } = renderChat();
    await waitForReady();
    sendText("follow-up question");
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    const controlPayload = window.unchainAPI.startStreamV2.mock.calls[0][0];
    const controlHistoryJson = JSON.stringify(controlPayload.history);
    unmount();

    // flagged run — same seeded state, flag on
    window.localStorage.clear();
    window.unchainAPI.startStreamV2.mockClear();
    const flaggedChatId = getChatsStore().activeChatId;
    setChatMessages(flaggedChatId, priorMessages, { source: "test" });
    setMemoryV2Flag(true);
    renderChat();
    await waitForReady();
    sendText("follow-up question");
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    const payload = window.unchainAPI.startStreamV2.mock.calls[0][0];
    expect(payload.owner_chat_id).toBe(flaggedChatId);
    expect(payload.memory_v2_requested).toBe(true);
    expect(payload.memory_agent_config).toEqual(DEFAULT_MEMORY_AGENT_CONFIG);
    // legacy history unchanged → model input byte-equivalent in shadow mode
    expect(JSON.stringify(payload.history)).toBe(controlHistoryJson);
    // bootstrap history: prior settled user/assistant turns only, with
    // attachments preserved and no trace/streaming residue; the in-flight
    // message travels in payload.message, not here.
    expect(payload.context_v2_history).toEqual([
      {
        role: "user",
        content: "earlier question",
        // chat_storage augments stored attachment metadata (kind/source/…);
        // the bootstrap history preserves the stored form as-is.
        attachments: [
          expect.objectContaining({ id: "att-1", name: "notes.txt" }),
        ],
      },
      { role: "assistant", content: "earlier answer" },
    ]);
    expect(deepHasKey(payload.context_v2_history, "traceFrames")).toBe(false);
    expect(payload.message).toBe("follow-up question");
  });

  test("character chat: threadId is the character session while owner_chat_id stays the UI chat id", async () => {
    const sourceChatId = getChatsStore().activeChatId;
    setChatModel(sourceChatId, { id: "openai:gpt-5" }, { source: "test" });
    const opened = openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
          metadata: { default_model: "openai:gpt-4.1" },
        },
      },
      { source: "test" },
    );
    expect(opened.ok).toBe(true);
    const characterChatId = opened.chatId;
    expect(getChatsStore().activeChatId).toBe(characterChatId);

    renderChat();
    await waitForReady();

    sendText("hi nico");
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    const payload = window.unchainAPI.startStreamV2.mock.calls[0][0];
    expect(payload.threadId).toBe("character_nico__dm__main");
    expect(payload.owner_chat_id).toBe(characterChatId);
    expect(payload.owner_chat_id).not.toBe(payload.threadId);
  });

  // Rehydrates one recorded receipt and verifies the old attempt is sealed
  // without handing any automatic-resume payload to a model stream.
  // Flag / settings seeding must happen BEFORE calling this.
  const captureDurableReceiptSeal = async () => {
    const chatId = getChatsStore().activeChatId;
    setChatMessages(
      chatId,
      [
        {
          id: "user-durable",
          role: "user",
          content: "apply the recorded decision",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      { source: "test" },
    );

    const interactionId = "interaction-owner-check";
    const toolCall = {
      call_id: "call-owner-check",
      confirmation_id: interactionId,
      requires_confirmation: true,
      toolkit_id: "core",
      toolkit_name: "Core",
      tool_name: "shell",
      tool_display_name: "Shell",
      arguments: { action: "run", command: "npm install" },
      description: "Run npm install",
      interact_type: "confirmation",
      interact_config: {},
    };
    let authoritativePending = {
      status: "receipt_recorded",
      session_id: chatId,
      interaction_id: interactionId,
      source_run_id: `attempt-${interactionId}`,
      active_attempt_id: `attempt-${interactionId}`,
      kind: "tool_approval",
      provider: "openai",
      model: "gpt-5",
      presentation: {
        trace_frame: {
          seq: 0,
          ts: 100,
          type: "tool_call",
          run_id: `attempt-${interactionId}`,
          stage: "durable_recovery",
          payload: toolCall,
        },
        tool_call: { ...toolCall },
      },
      resume_available: true,
      resume_options: {
        modelId: "openai:gpt-5",
        memory_enabled: true,
        maxTokens: 512,
      },
      receipt_id: `receipt-${interactionId}`,
      resolution: {
        outcome: "approved",
        response: { approved: true, reason: "" },
      },
    };

    const v4Runs = [];
    window.unchainAPI.getPendingInteraction = jest.fn(
      async ({ session_id: sessionId } = {}) =>
        sessionId === chatId
          ? authoritativePending
          : { status: "none", session_id: sessionId || "" },
    );
    window.unchainAPI.cancelExecution = jest.fn(async (payload) => {
      authoritativePending = { status: "none", session_id: chatId };
      return {
        status: "ok",
        attempt_id: payload.attempt_id,
        source_attempt_id: payload.source_attempt_id,
      };
    });
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      const attemptId = `attempt-v4-${v4Runs.length + 1}`;
      v4Runs.push({ payload, handlers, attemptId });
      return {
        requestId: attemptId,
        attemptId,
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });

    renderChat();
    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalled();
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    });

    return {
      chatId,
      interactionId,
      cancellationPayload:
        window.unchainAPI.cancelExecution.mock.calls[0][0],
      v4Runs,
    };
  };

  test("flag off: a durable receipt is sealed without a model payload", async () => {
    const { chatId, interactionId, cancellationPayload, v4Runs } =
      await captureDurableReceiptSeal();

    expect(cancellationPayload).toEqual({
      session_id: chatId,
      attempt_id: `attempt-${interactionId}`,
      source_attempt_id: `attempt-${interactionId}`,
      reason: "interaction_suspended",
      idempotency_key: `interaction-pause:attempt-${interactionId}:${interactionId}`,
    });
    expect(v4Runs).toHaveLength(0);
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(deepHasKey(cancellationPayload, "memory_v2_requested")).toBe(false);
    expect(deepHasKey(cancellationPayload, "context_v2_history")).toBe(false);
    expect(deepHasKey(cancellationPayload, "memory_agent_config")).toBe(false);
  });

  test("flag on: a durable receipt is still sealed without a model payload", async () => {
    setMemoryV2Flag(true);
    setMemoryAgentSettings({
      displayName: "Archivist",
      additionalInstructions: "Keep entries terse.",
      provider: "anthropic",
      modelId: "claude-haiku-4-5",
      // an extra stored field must never reach the wire
      apiKey: "sk-must-not-leak",
    });

    const { cancellationPayload, v4Runs } =
      await captureDurableReceiptSeal();

    expect(v4Runs).toHaveLength(0);
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(deepHasKey(cancellationPayload, "memory_v2_requested")).toBe(false);
    expect(deepHasKey(cancellationPayload, "memory_agent_config")).toBe(false);
    expect(deepHasKey(cancellationPayload, "context_v2_history")).toBe(false);
    expect(deepHasValue(cancellationPayload, "sk-must-not-leak")).toBe(false);
  });
});
