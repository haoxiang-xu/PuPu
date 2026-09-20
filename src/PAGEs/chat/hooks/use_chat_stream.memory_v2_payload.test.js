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
 *  - a passively observed durable receipt is sealed without a model payload,
 *    regardless of the Memory V2 flag.
 *  - memory_agent_config carries exactly the normalized Memory Agent surface
 *    ({displayName, additionalInstructions, provider, modelId}) and never
 *    leaks any other settings namespace or extra stored field.
 *
 * Harness mirrors use_chat_stream.composer_sidecar.test.js: real
 * ChatInterface, mocked ChatMessages / ChatInput, payload read from the
 * window.unchainAPI stream mocks.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  LocaleContext,
  NavigationContext,
  ThemeContext,
} from "../../../CONTAINERs/config/context";
import ChatInterface from "../chat";
import {
  getChatsStore,
  createChatInSelectedContext,
  selectTreeNode,
  openCharacterChat,
  setChatMessages,
  setChatModel,
} from "../../../SERVICEs/chat_storage";
import { writeFeatureFlags } from "../../../SERVICEs/feature_flags";
import { enqueueExecutionCancel, readExecutionCancelOutbox } from "./execution_cancel_outbox";
import { writeReasoningEffortPref } from "../../../SERVICEs/reasoning_effort_prefs";

const pendingToolInteraction = (sessionId, attemptId, interactionId) => {
  const toolCall = {
    call_id: "pending-call", confirmation_id: interactionId, requires_confirmation: true,
    toolkit_id: "core", toolkit_name: "Core", tool_name: "shell", tool_display_name: "Shell",
    arguments: { command: "pwd" }, description: "Run pwd", interact_type: "confirmation", interact_config: {},
  };
  return {
    status: "awaiting_response", session_id: sessionId, interaction_id: interactionId,
    source_run_id: attemptId, active_attempt_id: attemptId, kind: "tool_approval",
    provider: "openai", model: "gpt-5", resume_available: true,
    resume_options: { modelId: "openai:gpt-5" },
    presentation: {
      trace_frame: { seq: 0, ts: 100, type: "tool_call", run_id: attemptId, stage: "durable_recovery", payload: toolCall },
      tool_call: { ...toolCall },
    },
  };
};

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
  writeFeatureFlags({ enable_memory_v2: enabled === true });
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
    jest.useRealTimers();
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

  test.each(["none", "awaiting_response"])("a fresh chat can send before a late %s recovery lookup", async (status) => {
    const chatId = getChatsStore().activeChatId;
    let resolveLookup;
    window.unchainAPI.getPendingInteraction = jest.fn(() => new Promise((resolve) => {
      resolveLookup = resolve;
    }));
    window.unchainAPI.startStreamV4 = window.unchainAPI.startStreamV2;
    renderChat();
    await waitFor(() => expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalled());
    await waitForReady();
    sendText("first message immediately after creation");
    await waitFor(() => expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1));
    await act(async () => resolveLookup(status === "none"
      ? { status: "none", session_id: chatId }
      : pendingToolInteraction(chatId, "old-attempt", "old-confirmation")));
    expect(lastChatMessagesProps.messages.some((message) => message.content === "first message immediately after creation")).toBe(true);
    expect(window.unchainAPI.cancelStream).not.toHaveBeenCalled();
    expect(lastChatMessagesProps.pendingToolConfirmationRequests?.["old-confirmation"]).toBeUndefined();
  });

  test("a failed speculative lookup does not mark a fresh chat as restoring", async () => {
    getChatsStore();
    window.unchainAPI.getPendingInteraction = jest.fn(async () => {
      throw new Error("temporary lookup failure");
    });
    window.unchainAPI.startStreamV4 = window.unchainAPI.startStreamV2;
    renderChat();
    await waitFor(() => expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalled());
    await waitForReady();
    sendText("a new chat has nothing to restore");
    await waitFor(() => expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1));
  });

  test("a chat with persisted history stays blocked until its recovery lookup resolves", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPriorTurn(chatId);
    let resolveLookup;
    window.unchainAPI.getPendingInteraction = jest.fn(() => new Promise((resolve) => {
      resolveLookup = resolve;
    }));
    window.unchainAPI.startStreamV4 = window.unchainAPI.startStreamV2;
    renderChat();
    await waitFor(() => expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalled());
    expect(lastChatInputProps.sendDisabled).toBe(true);
    await act(async () => resolveLookup({ status: "none", session_id: chatId }));
    await waitForReady();
  });

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

  const prepareRecoveredHumanInput = async ({ disposition = "receipt_recorded", mismatch = false, resumeAvailable = true } = {}) => {
    const chatId = getChatsStore().activeChatId;
    setChatMessages(chatId, [{ id: "user-path", role: "user", content: "Ask where to put the project", createdAt: 1, updatedAt: 1 }], { source: "test" });
    const interactionId = "interaction-path";
    const config = {
      kind: "selector", request_id: "call-path", selection_mode: "single",
      title: "Folder", question: "Where?", options: [], allow_other: true,
      other_label: "Path", other_placeholder: "", min_selected: 1, max_selected: 1,
    };
    const toolCall = {
      call_id: "call-path", confirmation_id: interactionId, requires_confirmation: true,
      toolkit_id: "core", toolkit_name: "Core", tool_name: "ask_user_question",
      tool_display_name: "Ask User", description: "Where?", arguments: config,
      interact_type: "single", interact_config: config,
    };
    let pending = {
      status: "awaiting_response", session_id: chatId, interaction_id: interactionId,
      source_run_id: "attempt-path", active_attempt_id: "attempt-path", kind: "human_input",
      provider: "openai", model: "gpt-5", resume_available: resumeAvailable,
      resume_options: { modelId: "openai:gpt-5" },
      ...(!resumeAvailable ? { resume_unavailable_reason: "missing_checkpoint" } : {}),
      presentation: { tool_call: toolCall, trace_frame: { seq: 0, ts: 100, type: "tool_call", run_id: "attempt-path", stage: "durable_recovery", payload: toolCall } },
    };
    window.unchainAPI.getPendingInteraction = jest.fn(async ({ session_id: sessionId = chatId } = {}) => sessionId === chatId ? pending : { status: "none", session_id: sessionId });
    window.unchainAPI.cancelExecution = jest.fn(async (payload) => {
      pending = { status: "none", session_id: chatId };
      return { status: "ok", attempt_id: payload.attempt_id, source_attempt_id: payload.source_attempt_id };
    });
    window.unchainAPI.startStreamV4 = jest.fn(() => ({ requestId: "resume-path", attemptId: "resume-path", disconnect: jest.fn(), cancel: jest.fn() }));
    window.unchainAPI.respondToolConfirmation = jest.fn(async () => {
      pending = { ...pending, status: "receipt_recorded", receipt_id: "receipt-path", resolution: {
        outcome: "submitted", response: { request_id: "call-path", selected_values: ["__other__"], other_text: "/tmp/中文 项目" },
      } };
      return { status: "ok", durable: true, disposition, session_id: chatId,
        interaction_id: interactionId, receipt_id: mismatch ? "foreign-receipt" : "receipt-path" };
    });
    renderChat();
    await waitFor(() => expect(lastChatMessagesProps?.pendingToolConfirmationRequests[interactionId]).toBeDefined());
    return { chatId, interactionId, replacePending: (value) => { pending = value; }, decision: { confirmationId: interactionId, approved: true, userResponse: { value: "__other__", other_text: "/tmp/中文 项目" } } };
  };

  test("explicit answer to recovered human input resumes once without sealing the receipt", async () => {
    const { chatId, interactionId, decision } = await prepareRecoveredHumanInput();
    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision(decision);
      await lastChatMessagesProps.onToolConfirmationDecision(decision);
    });
    await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1));
    expect(window.unchainAPI.startStreamV4.mock.calls[0][0]).toEqual(expect.objectContaining({ threadId: chatId, owner_chat_id: chatId, interaction_id: interactionId, source_attempt_id: "attempt-path" }));
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(1);
  });

  test("live human input callback does not start another stream", async () => {
    const { decision } = await prepareRecoveredHumanInput({ disposition: "live_continues" });
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
  });

  test.each([
    ["mismatched receipt", { mismatch: true }],
    ["unavailable resume", { resumeAvailable: false }],
  ])("%s cannot resume or cancel a recorded human answer", async (_name, options) => {
    const { decision } = await prepareRecoveredHumanInput(options);
    jest.useFakeTimers();
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    for (let index = 0; index < 4; index += 1) {
      await act(async () => { jest.advanceTimersByTime(5000); });
    }
    expect(lastChatInputProps.sendDisabled).toBe(true);
    expect((await window.unchainAPI.getPendingInteraction()).status).toBe("receipt_recorded");
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
  });

  test("passive recovery while an explicit answer POST is in flight cannot seal that answer", async () => {
    const { chatId, decision } = await prepareRecoveredHumanInput();
    const originalNodeId = getChatsStore().tree.selectedNodeId;
    const record = window.unchainAPI.respondToolConfirmation.getMockImplementation();
    let resolveReceipt;
    window.unchainAPI.respondToolConfirmation.mockImplementation(async () => {
      const receipt = await record();
      return new Promise((resolve) => { resolveReceipt = () => resolve(receipt); });
    });
    let submission;
    await act(async () => { submission = lastChatMessagesProps.onToolConfirmationDecision(decision); });
    let otherChat;
    await act(async () => {
      otherChat = createChatInSelectedContext({ title: "Other chat" }, { source: "test" });
      selectTreeNode({ nodeId: otherChat.nodeId }, { source: "test" });
    });
    await waitFor(() => expect(document.querySelector("[data-chat-id]")?.getAttribute("data-chat-id")).toBe(otherChat.chatId));
    const before = window.unchainAPI.getPendingInteraction.mock.calls.length;
    await act(async () => { selectTreeNode({ nodeId: originalNodeId }, { source: "test" }); });
    await waitFor(() => {
      expect(document.querySelector("[data-chat-id]")?.getAttribute("data-chat-id")).toBe(chatId);
      expect(window.unchainAPI.getPendingInteraction.mock.calls.length).toBeGreaterThan(before);
    });
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    await act(async () => { resolveReceipt(); await submission; });
    await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1));
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
  });

  test.each(["root", "child"])("a new %s question after resume remains actionable when that stream disconnects", async (branch) => {
    const { decision, replacePending } = await prepareRecoveredHumanInput();
    const next = JSON.parse(JSON.stringify(await window.unchainAPI.getPendingInteraction()));
    next.interaction_id = "interaction-next-path";
    for (const call of [next.presentation.tool_call, next.presentation.trace_frame.payload]) {
      call.call_id = "call-next-path";
      call.confirmation_id = next.interaction_id;
      call.arguments.request_id = "call-next-path";
      call.interact_config.request_id = "call-next-path";
    }
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1));
    const handlers = window.unchainAPI.startStreamV4.mock.calls[0][1];
    replacePending(next);
    await act(async () => handlers.onRuntimeEvent({
      schema_version: "v4", event_id: "event-resume-started", type: "run.started",
      timestamp: "2026-09-12T00:00:00.000Z", session_id: next.session_id,
      run_id: "resume-path", agent_id: "developer", turn_id: "resume-path:turn-1", seq: 0,
      links: {}, surface: { slot: "trace_inline", scope: "turn" }, visibility: "user", metadata: {}, payload: {},
    }));
    await act(async () => handlers.onRuntimeEvent({
      schema_version: "v4", event_id: "event-next-path", type: "interaction.requested",
      timestamp: "2026-09-12T00:00:00.000Z", session_id: next.session_id,
      run_id: branch === "child" ? "worker-next" : "resume-path", agent_id: "developer", turn_id: "resume-path:turn-1", seq: 1,
      links: { interaction_id: next.interaction_id, tool_call_id: "call-next-path" },
      surface: { slot: "trace_inline", scope: "turn" }, visibility: "user", metadata: {},
      payload: { interaction_id: next.interaction_id, kind: "choice", renderer: "single",
        title: "Folder", prompt: "Where?", selection_mode: "single", options: [], allow_other: true,
        target: { tool_call_id: "call-next-path", tool_name: "ask_user_question" },
        config: next.presentation.tool_call.interact_config,
      },
    }));
    await act(async () => handlers.onError(Object.assign(new Error("aborted"), { code: "stream_bridge_failed" })));
    await waitFor(() => expect(lastChatInputProps.disclaimer).toBe("This run is waiting for your confirmation."));
    expect(lastChatMessagesProps.pendingToolConfirmationRequests[next.interaction_id]).toBeDefined();
    expect(lastChatMessagesProps.toolConfirmationUiStateById[next.interaction_id].status).toBe("idle");
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    window.unchainAPI.respondToolConfirmation.mockImplementation(async () => {
      replacePending({ ...next, status: "receipt_recorded", receipt_id: "receipt-next-path", resolution: {
        outcome: "submitted", response: { request_id: "call-next-path", selected_values: ["__other__"], other_text: "/tmp/新 路径" },
      } });
      return { status: "ok", durable: true, disposition: "receipt_recorded", session_id: next.session_id,
        interaction_id: next.interaction_id, receipt_id: "receipt-next-path" };
    });
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision({
      confirmationId: next.interaction_id, approved: true, userResponse: { value: "__other__", other_text: "/tmp/新 路径" },
    }));
    await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(2));
    expect(window.unchainAPI.startStreamV4.mock.calls[1][0].interaction_id).toBe(next.interaction_id);
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
  });

  test("a resume startup error preserves the receipt and exposes the failure without cancellation", async () => {
    const { decision } = await prepareRecoveredHumanInput();
    window.unchainAPI.startStreamV4.mockImplementation(() => { throw new Error("resume startup failed"); });
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    await waitFor(() => expect(lastChatInputProps.disclaimer).toContain("resume startup failed"));
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    expect((await window.unchainAPI.getPendingInteraction()).status).toBe("receipt_recorded");
  });

  test("Stop while the answer is being recorded prevents the late receipt from resuming", async () => {
    const { decision } = await prepareRecoveredHumanInput();
    const record = window.unchainAPI.respondToolConfirmation.getMockImplementation();
    let resolveReceipt;
    window.unchainAPI.respondToolConfirmation.mockImplementation(() => new Promise((resolve) => { resolveReceipt = resolve; }));
    let submission;
    await act(async () => { submission = lastChatMessagesProps.onToolConfirmationDecision(decision); });
    await act(async () => lastChatInputProps.onStop());
    await act(async () => { resolveReceipt(await record()); await submission; });
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalled();
    expect(window.unchainAPI.cancelExecution.mock.calls[0][0].reason).toBe("user_stop");
  });

  test("Stop carries a live tool confirmation id and the same chat can send again", async () => {
    window.unchainAPI.startStreamV2.mockImplementation((payload, handlers) => {
      streamHandlers = handlers;
      return { cancel: jest.fn(), requestId: "request-live", attemptId: "attempt-live" };
    });
    window.unchainAPI.cancelExecution = jest.fn(async (payload) => ({
      status: "ok", execution_id: payload.session_id,
      attempt_id: payload.attempt_id, state: "cancelled",
    }));
    renderChat();
    await waitForReady();
    sendText("run a command");
    await waitFor(() => expect(streamHandlers).not.toBeNull());
    await act(async () => streamHandlers.onFrame({
      seq: 1, ts: 100, type: "tool_call", run_id: "live-run", stage: "tools",
      payload: {
        call_id: "live-call", confirmation_id: "live-confirmation",
        requires_confirmation: true, tool_name: "shell", toolkit_id: "core",
        arguments: { command: "pwd" }, interact_type: "confirmation",
      },
    }));
    await waitFor(() => expect(lastChatMessagesProps.pendingToolConfirmationRequests["live-confirmation"]).toBeDefined());
    await act(async () => lastChatInputProps.onStop());
    await waitFor(() => expect(window.unchainAPI.cancelExecution).toHaveBeenCalled());
    expect(window.unchainAPI.cancelExecution.mock.calls[0][0].interaction_id).toBe("live-confirmation");
    await waitFor(() => expect(lastChatInputProps.sendDisabled).toBe(false));
    sendText("next message in the same chat");
    await waitFor(() => expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2));
  });

  test("a failed confirmation stays actionable and retries the same decision", async () => {
    window.unchainAPI.respondToolConfirmation.mockResolvedValue({
      status: "ok", durable: false, disposition: "live_only", interaction_id: "live-confirmation",
    });
    window.unchainAPI.respondToolConfirmation
      .mockRejectedValueOnce(Object.assign(new Error("Retry the same decision"), {
        code: "interaction_resolution_persistence_failed",
      }));
    renderChat();
    await waitForReady();
    sendText("write a file");
    await waitFor(() => expect(streamHandlers).not.toBeNull());
    await act(async () => streamHandlers.onFrame({
      seq: 1, ts: 100, type: "tool_call", run_id: "live-run", stage: "tools",
      payload: {
        call_id: "live-call", confirmation_id: "live-confirmation",
        requires_confirmation: true, tool_name: "shell", toolkit_id: "core",
        arguments: { command: "pwd" }, interact_type: "confirmation",
      },
    }));
    const decision = { confirmationId: "live-confirmation", approved: true };
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    expect(lastChatMessagesProps.toolConfirmationUiStateById["live-confirmation"].status).toBe("error");
    expect(lastChatMessagesProps.pendingToolConfirmationRequests["live-confirmation"]).toBeDefined();
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    expect(lastChatMessagesProps.toolConfirmationUiStateById["live-confirmation"].resolved).toBe(true);
    const calls = window.unchainAPI.respondToolConfirmation.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toEqual(calls[1][0]);
  });

  test.each(["same", "foreign"])("old Stop outbox recovers only a %s attempt target", async (target) => {
    const chatId = getChatsStore().activeChatId;
    enqueueExecutionCancel({ ownerChatId: chatId, sessionId: chatId, attemptId: "attempt-stop" });
    window.unchainAPI.getPendingInteraction = jest.fn(async () => pendingToolInteraction(
      chatId, target === "same" ? "attempt-stop" : "foreign-attempt", "pending-stop",
    ));
    window.unchainAPI.cancelExecution = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error("interaction_cancel_target_required"), {
        code: "interaction_cancel_target_required",
      }))
      .mockImplementation(async (payload) => ({
        status: "ok", execution_id: payload.session_id, attempt_id: payload.attempt_id, state: "cancelled",
      }));
    const rendered = renderChat();
    if (target === "same") {
      await waitFor(() => expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(2));
      expect(window.unchainAPI.cancelExecution.mock.calls[1][0]).toEqual({
        owner_chat_id: chatId, session_id: chatId, attempt_id: "attempt-stop",
        interaction_id: "pending-stop", reason: "user_stop", idempotency_key: "stop:attempt-stop",
      });
      await waitFor(() => expect(readExecutionCancelOutbox()).toEqual([]));
    } else {
      await waitFor(() => expect(readExecutionCancelOutbox()[0]?.retryBlocked).toBe(true));
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
    }
    rendered.unmount();
  });

  test("cancel failures stop retrying after three attempts and stay stopped after remount", async () => {
    jest.useFakeTimers();
    const chatId = getChatsStore().activeChatId;
    enqueueExecutionCancel({ ownerChatId: chatId, sessionId: chatId, attemptId: "attempt-stop" });
    window.unchainAPI.cancelExecution = jest.fn(async () => { throw new Error("Stop failed; try again"); });
    const rendered = renderChat();
    await act(async () => {});
    for (let index = 0; index < 6; index += 1) {
      await act(async () => { jest.advanceTimersByTime(5000); });
    }
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(3);
    expect(readExecutionCancelOutbox()[0].retryBlocked).toBe(true);
    expect(lastChatInputProps.disclaimer).toContain("Stop failed; try again");
    rendered.unmount();
    const reopened = renderChat();
    await act(async () => { jest.advanceTimersByTime(20000); });
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(3);
    reopened.unmount();
    jest.useRealTimers();
  });

  test("Codex replaces a persisted minimal preference with its supported default", async () => {
    const modelId = "openai:gpt-5.3-codex";
    setChatModel(getChatsStore().activeChatId, { id: modelId, reasoningEffort: "minimal" });
    writeReasoningEffortPref(modelId, "minimal");
    window.unchainAPI.getModelCatalog.mockResolvedValue({
      activeModel: modelId, providers: { openai: ["gpt-5.3-codex"], ollama: [], anthropic: [] },
      model_capabilities: { [modelId]: {
        reasoning_efforts: ["low", "medium", "high", "xhigh"], default_reasoning_effort: "medium",
      } },
    });
    renderChat();
    await waitForReady();
    await waitFor(() => expect(lastChatInputProps.selectedReasoningEffort).toBe("medium"));
    expect(lastChatInputProps.reasoningEffortOptions).toEqual(["low", "medium", "high", "xhigh"]);
    sendText("hello codex");
    await waitFor(() => expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1));
    expect(window.unchainAPI.startStreamV2.mock.calls[0][0].options.reasoningEffort).toBe("medium");
  });

  test("flag off: a durable receipt is sealed without a model payload", async () => {
    const { chatId, interactionId, cancellationPayload, v4Runs } =
      await captureDurableReceiptSeal();

    expect(cancellationPayload).toEqual({
      session_id: chatId,
      owner_chat_id: chatId,
      attempt_id: `attempt-${interactionId}`,
      source_attempt_id: `attempt-${interactionId}`,
      interaction_id: interactionId,
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

  test("a picked context window rides the request for a built-in Ollama model (#227)", async () => {
    const modelId = "ollama:deepseek-r1:14b";
    setChatModel(getChatsStore().activeChatId, { id: modelId, contextWindow: 65536 });
    window.unchainAPI.getModelCatalog.mockResolvedValue({
      activeModel: modelId, providers: { openai: [], ollama: ["deepseek-r1:14b"], anthropic: [] },
      model_capabilities: { [modelId]: {
        default_context_window_tokens: 32768, max_context_window_tokens: 128000,
      } },
    });
    renderChat();
    await waitForReady();
    await waitFor(() => expect(lastChatInputProps.selectedContextWindow).toBe(65536));
    expect(lastChatInputProps.defaultContextWindow).toBe(32768);
    expect(lastChatInputProps.maxContextWindow).toBe(128000);
    expect(lastChatInputProps.contextWindowPresets).toEqual([4096, 8192, 16384, 32768, 65536, 131072]);
    sendText("hello local");
    await waitFor(() => expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1));
    expect(window.unchainAPI.startStreamV2.mock.calls[0][0].options.contextWindow).toBe(65536);
  });

  test("no pick means no contextWindow key, and a model without a declared default hides the picker (#227)", async () => {
    const modelId = "openai:gpt-5";
    setChatModel(getChatsStore().activeChatId, { id: modelId });
    window.unchainAPI.getModelCatalog.mockResolvedValue({
      activeModel: modelId, providers: { openai: ["gpt-5"], ollama: [], anthropic: [] },
      model_capabilities: { [modelId]: { max_context_window_tokens: 400000 } },
    });
    renderChat();
    await waitForReady();
    await waitFor(() => expect(lastChatInputProps.defaultContextWindow).toBeNull());
    expect(lastChatInputProps.selectedContextWindow).toBeNull();
    sendText("hello cloud");
    await waitFor(() => expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1));
    expect(window.unchainAPI.startStreamV2.mock.calls[0][0].options).not.toHaveProperty("contextWindow");
  });
});
