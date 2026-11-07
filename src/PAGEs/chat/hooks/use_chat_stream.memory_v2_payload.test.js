/**
 * Memory V2 P0 payload seams — owner_chat_id identity + always-on memory
 * lazy-bootstrap fields on the outgoing stream payload.
 *
 * Locks:
 *  - owner_chat_id is ALWAYS the UI chat id (targetChatId) on the normal
 *    payload and on a character-chat payload (where threadId becomes the
 *    character session_id).
 *  - normal sends always carry memory_v2_requested, memory_agent_config,
 *    and bootstrap history, even when the retired flag was saved as false.
 *  - changing the retired flag does not change legacy history bytes.
 *  - passive durable receipts are sealed without a model payload.
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
  getChatMessages,
  getChatsStore,
  createChatInSelectedContext,
  selectTreeNode,
  openCharacterChat,
  setChatMessages,
  setChatModel,
} from "../../../SERVICEs/chat_storage";
import { writeFeatureFlags } from "../../../SERVICEs/feature_flags";
import {
  enqueueExecutionCancel,
  EXECUTION_CANCEL_OUTBOX_STORAGE_KEY,
  readExecutionCancelOutbox,
} from "./execution_cancel_outbox";
import * as executionCancelOutbox from "./execution_cancel_outbox";
import * as turnMutationOutbox from "../../../SERVICEs/turn_mutation_outbox";
import { CHATS_STORAGE_KEY } from "../../../SERVICEs/chat_storage/chat_storage_constants";
import { normalizePendingInteraction } from "./durable_interaction_recovery";
import { writeReasoningEffortPref } from "../../../SERVICEs/reasoning_effort_prefs";
import ollamaPreviewFixture from "../../../SERVICEs/runtime_events/fixtures/ollama_live_preview.json";
import { resolveToolCallOwnerForRequest } from "../../../SERVICEs/runtime_events/tool_call_projection";
import { mergePendingConfirmationTraceState } from "../../../COMPONENTs/chat-bubble/pending_confirmation_trace_frames";
import observedBatchFixture from "../../../SERVICEs/runtime_events/fixtures/ticket_384_observed_batch.json";

import settlementFixture from "../../../COMPONENTs/chat-bubble/__fixtures__/ticket_357_subagent_settlement.json";
import coldMetadataFixture from "./fixtures/ticket_357_cold_child_metadata.json";
import nativeColdApprovalCapture from "./fixtures/native_cold_approval.json";
import cancelledSubagentProducer from "../../../COMPONENTs/chat-bubble/__fixtures__/ticket_357_cancelled_subagent_producer.json";
import { collectSubagentSettlements, settlementForToolCall } from "../../../SERVICEs/runtime_events/subagent_settlement";

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

const pendingGraphStepInteraction = (sessionId, graphStepAttemptId, coordinatorAttemptId, interactionId) => ({
  ...pendingToolInteraction(sessionId, graphStepAttemptId, interactionId),
  resume_kind: "graph_step",
  graph_step_attempt_id: graphStepAttemptId,
  graph_coordinator_attempt_id: coordinatorAttemptId,
});

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

const prepareNativeColdApproval = (chatId, mount) => {
  const captured = nativeColdCaptureForChat(chatId);
  let pending = captured.pending;
  setChatMessages(chatId, captured.messages, { source: "test" });
  window.unchainAPI.isDurableInteractionBridgeAvailable = jest.fn(() => true);
  window.unchainAPI.getPendingInteraction = jest.fn(async ({ session_id: sessionId } = {}) =>
    sessionId === chatId ? pending : { status: "none", session_id: sessionId },
  );
  window.unchainAPI.cancelExecution = jest.fn(async () => ({ status: "ok" }));
  window.unchainAPI.startStreamV4 = jest.fn((payload) => {
    return {
      requestId: `native-resume-${payload?.interaction_id || "unknown"}`,
      attemptId: "native-resume-attempt",
      disconnect: jest.fn(),
      cancel: jest.fn(),
    };
  });
  return {
    captured,
    setPending: (value) => { pending = value; },
    mount,
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
    const { value, onChange, onSend, onStop, isStreaming, sendDisabled } = props;
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
        {isStreaming ? (
          <button data-testid="stop-button" onClick={onStop}>
            Stop
          </button>
        ) : null}
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

const makeQualifiedToolFrame = ({ confirmationId, callId, attemptId, eventId, args }) => {
  const intentCursor = {
    schema: "unchain.event_cursor.v1",
    store_seq: attemptId === "attempt-one" ? 11 : 12,
    event_id: eventId,
  };
  const callRef = {
    schema: "pupu.tool_call_ref.v1",
    execution_id: "execution-one",
    original_attempt_id: attemptId,
    call_id: callId,
    tool_name: "shell",
    intent_cursor: intentCursor,
    iteration: attemptId === "attempt-one" ? 2 : 3,
    toolkit_id: "core",
  };
  return {
    seq: intentCursor.store_seq,
    ts: intentCursor.store_seq * 10,
    type: "tool_call",
    run_id: attemptId,
    execution_id: "execution-one",
    session_id: "session-one",
    stage: "tools",
    iteration: callRef.iteration,
    payload: {
      call_id: callId,
      confirmation_id: confirmationId,
      requires_confirmation: true,
      toolkit_id: "core",
      tool_name: "shell",
      arguments: args,
      interact_type: "confirmation",
      timeline_merge_policy: "approved",
      call_ref: callRef,
      call_ref_metadata: {
        schema: "pupu.tool_call_ref_metadata.v1",
        intent_cursor: intentCursor,
        timeline_merge_policy_declared: true,
        timeline_merge_policy: "approved",
        original_arguments_declared: true,
        original_arguments: args,
      },
    },
  };
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
      isRuntimeEventStreamV4Available: jest.fn(() => false),
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

  test("localStorage fallback bootstrap restores a native owner before lookup", async () => {
    const chatId = "native-cold-bootstrap-chat";
    const captured = nativeColdCaptureForChat(chatId);
    const nodeId = `chn-${chatId}`;
    const now = Date.now();
    window.localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify({
      schemaVersion: 2,
      updatedAt: now,
      activeChatId: chatId,
      lruChatIds: [chatId],
      chatsById: {
        [chatId]: {
          id: chatId,
          title: "Native cold approval",
          createdAt: now,
          updatedAt: now,
          lastMessageAt: now,
          threadId: chatId,
          model: { id: "openai:gpt-5" },
          agentOrchestration: { mode: "default" },
          selectedToolkits: [],
          selectedWorkspaceIds: [],
          systemPromptOverrides: {},
          draft: { text: "", attachments: [], updatedAt: now },
          isTransientNewChat: false,
          hasUnreadGeneratedReply: false,
          isGenerating: false,
          stats: { messageCount: captured.messages.length, approxBytes: 1024 },
          messages: captured.messages,
        },
      },
      tree: {
        root: [nodeId],
        nodesById: {
          [nodeId]: { id: nodeId, entity: "chat", type: "file", chatId, label: "Native cold approval" },
        },
        selectedNodeId: nodeId,
        expandedFolderIds: [],
      },
      ui: {},
    }));
    window.unchainAPI.isDurableInteractionBridgeAvailable = jest.fn(() => true);
    window.unchainAPI.getPendingInteraction = jest.fn(async ({ session_id: sessionId } = {}) =>
      sessionId === chatId ? captured.pending : { status: "none", session_id: sessionId },
    );
    window.unchainAPI.cancelExecution = jest.fn(async () => ({ status: "ok" }));
    window.unchainAPI.startStreamV4 = jest.fn();

    renderChat();
    await waitFor(() => expect(lastChatMessagesProps?.pendingToolConfirmationRequests?.[
      captured.pending.interaction_id
    ]).toBeDefined());

    expect(lastChatMessagesProps.messages).toEqual(captured.messages);
    expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalledWith({ session_id: chatId });
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("cold lookup retains the original native approval owner without cancelling or resuming", async () => {
    const chatId = getChatsStore().activeChatId;
    const { captured, mount } = prepareNativeColdApproval(chatId, renderChat);
    mount();
    await waitFor(() => {
      expect(window.unchainAPI.getStatus).toHaveBeenCalled();
      expect(window.unchainAPI.getModelCatalog).toHaveBeenCalled();
    });
    await waitFor(() => expect(lastChatMessagesProps?.pendingToolConfirmationRequests?.[
      captured.pending.interaction_id
    ]).toBeDefined());

    expect(lastChatMessagesProps.messages).toEqual(captured.messages);
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test.each([
    ["cancel", executionCancelOutbox, "readExecutionCancelOutboxState"],
    ["turn mutation", turnMutationOutbox, "readTurnMutationAdmissionOutboxState"],
  ])("cold native approval waits on an unavailable %s fence then retries safely", async (_name, module, readerName) => {
    const chatId = getChatsStore().activeChatId;
    const { captured, mount } = prepareNativeColdApproval(chatId, renderChat);
    const originalReader = module[readerName].bind(module);
    let fenceUnavailable = true;
    const reader = jest.spyOn(module, readerName).mockImplementation((...args) =>
      fenceUnavailable
        ? { available: false, entries: [] }
        : originalReader(...args),
    );
    mount();

    await waitFor(() => expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalled());
    expect(lastChatMessagesProps?.pendingToolConfirmationRequests?.[
      captured.pending.interaction_id
    ]).toBeUndefined();
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();

    fenceUnavailable = false;
    await waitFor(() => expect(lastChatMessagesProps?.pendingToolConfirmationRequests?.[
      captured.pending.interaction_id
    ]).toBeDefined(), { timeout: 4000 });
    expect(reader.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("target-first oversized cancellation snapshot cannot be rewritten before native lookup", async () => {
    const chatId = getChatsStore().activeChatId;
    const { captured, mount } = prepareNativeColdApproval(chatId, renderChat);
    const entries = [
      {
        ownerChatId: chatId,
        sessionId: chatId,
        attemptId: captured.pending.source_run_id,
        sourceAttemptId: captured.pending.source_run_id,
        interactionId: captured.pending.interaction_id,
        reason: "user_stop",
        createdAt: 1,
      },
      ...Array.from({ length: 64 }, (_value, index) => ({
        ownerChatId: `unrelated-chat-${index}`,
        sessionId: `unrelated-session-${index}`,
        attemptId: `unrelated-attempt-${index}`,
        reason: "user_stop",
        createdAt: index + 2,
      })),
    ];
    const originalBytes = JSON.stringify(entries);
    window.localStorage.setItem(EXECUTION_CANCEL_OUTBOX_STORAGE_KEY, originalBytes);
    let releasePending = null;
    let releaseSecondCancellation = null;
    window.unchainAPI.getPendingInteraction = jest.fn(({ session_id: sessionId } = {}) =>
      new Promise((resolve) => {
        if (sessionId === chatId) releasePending = resolve;
        else resolve({ status: "none", session_id: sessionId });
      }),
    );
    window.unchainAPI.cancelExecution = jest.fn((payload) => {
      const response = {
        status: "cancelled",
        execution_id: payload.session_id,
        attempt_id: payload.attempt_id,
        state: "cancelled",
      };
      if (payload.attempt_id === "unrelated-attempt-0") {
        return Promise.resolve(response);
      }
      if (payload.attempt_id === "unrelated-attempt-1") {
        return new Promise((resolve) => { releaseSecondCancellation = () => resolve(response); });
      }
      return Promise.resolve(response);
    });

    const rendered = mount();
    await waitFor(() => expect(releasePending).toEqual(expect.any(Function)));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 40)));
    const cancellationCallsBeforePending = window.unchainAPI.cancelExecution.mock.calls.length;
    const bytesBeforePending = window.localStorage.getItem(EXECUTION_CANCEL_OUTBOX_STORAGE_KEY);
    await act(async () => releasePending(captured.pending));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 40)));
    const actionableOwner = lastChatMessagesProps?.pendingToolConfirmationRequests?.[
      captured.pending.interaction_id
    ];
    rendered.unmount();
    releaseSecondCancellation?.();

    expect(bytesBeforePending).toBe(originalBytes);
    expect(actionableOwner).toBeUndefined();
    expect(cancellationCallsBeforePending).toBe(0);
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test.each([
    ["root Stop", (chatId, captured) => ({
      ownerChatId: chatId,
      sessionId: chatId,
      attemptId: captured.pending.source_run_id,
      sourceAttemptId: captured.pending.source_run_id,
    })],
    ["resumed-attempt Stop linked to the root", (_chatId, captured) => ({
      ownerChatId: "foreign-owner",
      sessionId: "foreign-session",
      attemptId: "later-resume-attempt",
      sourceAttemptId: captured.pending.source_run_id,
    })],
  ])("cold native approval preserves an unresolved %s fence", async (_label, makeEntry) => {
    const chatId = getChatsStore().activeChatId;
    const { captured, setPending, mount } = prepareNativeColdApproval(chatId, renderChat);
    window.localStorage.setItem(EXECUTION_CANCEL_OUTBOX_STORAGE_KEY, JSON.stringify([{
      ...makeEntry(chatId, captured),
      reason: "user_stop",
      createdAt: 1,
      retryBlocked: true,
    }]));
    window.unchainAPI.cancelExecution.mockImplementation(async (payload) => {
      const exactTarget =
        payload.owner_chat_id === chatId &&
        payload.session_id === chatId &&
        payload.attempt_id === captured.pending.source_run_id &&
        payload.reason === "interaction_suspended";
      if (exactTarget) setPending({ status: "none", session_id: chatId });
      return {
        status: exactTarget ? "cancelled" : "ok",
        execution_id: payload.session_id,
        attempt_id: payload.attempt_id,
        source_attempt_id: payload.source_attempt_id,
        state: exactTarget ? "cancelled" : "accepted",
      };
    });
    mount();

    await waitFor(() => expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalled());
    await waitFor(() => expect(window.unchainAPI.cancelExecution).toHaveBeenCalled());
    await waitFor(() => expect(lastChatMessagesProps?.pendingToolConfirmationRequests?.[
      captured.pending.interaction_id
    ]).toBeUndefined());
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
    expect(window.unchainAPI.respondToolConfirmation).not.toHaveBeenCalled();
  });

  test("a pending turn mutation blocks native cold admission while keeping its own path", async () => {
    const chatId = getChatsStore().activeChatId;
    const { captured, setPending, mount } = prepareNativeColdApproval(chatId, renderChat);
    window.localStorage.setItem(turnMutationOutbox.TURN_MUTATION_OUTBOX_STORAGE_KEY, JSON.stringify([{
      operationId: "pending-resend-fence",
      chatId,
      sessionId: chatId,
      kind: "resend",
      targetMessageId: "user-native-captured",
      originalFingerprint: "original",
      baseFingerprint: "base",
      baseMessageCount: 0,
      text: "preserve the pending resend",
      createdAt: 1,
    }]));
    window.unchainAPI.cancelExecution.mockImplementation(async (payload) => {
      setPending({ status: "none", session_id: chatId });
      return { status: "cancelled", execution_id: chatId, attempt_id: payload.attempt_id, state: "cancelled" };
    });
    mount();

    await waitFor(() => expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalled());
    await waitFor(() => expect(lastChatMessagesProps?.pendingToolConfirmationRequests?.[
      captured.pending.interaction_id
    ]).toBeUndefined());
    expect(window.unchainAPI.startStreamV4.mock.calls.some(
      ([payload]) => payload?.mode === "resume_interaction",
    )).toBe(false);
  });

  test("target-first oversized turn-mutation snapshot cannot be rewritten by recovery", async () => {
    const chatId = getChatsStore().activeChatId;
    const { captured, mount } = prepareNativeColdApproval(chatId, renderChat);
    const mutation = (operationId, targetChatId, overrides = {}) => ({
      operationId,
      chatId: targetChatId,
      sessionId: targetChatId,
      kind: "resend",
      targetMessageId: "user-native-captured",
      originalFingerprint: "original",
      baseFingerprint: "base",
      baseMessageCount: 0,
      text: "preserve the pending resend",
      createdAt: 1,
      ...overrides,
    });
    const rows = [
      mutation("target-first-native-fence", chatId),
      ...Array.from({ length: 31 }, (_value, index) =>
        mutation(`unrelated-mutation-${index}`, `unrelated-chat-${index}`),
      ),
      mutation("retained-current-chat-tail", chatId, {
        retryStatus: "attempting",
        retryAt: 0,
      }),
    ];
    const originalBytes = JSON.stringify(rows);
    window.localStorage.setItem(turnMutationOutbox.TURN_MUTATION_OUTBOX_STORAGE_KEY, originalBytes);
    const rendered = mount();
    await waitFor(() => expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalled());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 40)));
    const storedBytes = window.localStorage.getItem(turnMutationOutbox.TURN_MUTATION_OUTBOX_STORAGE_KEY);
    const actionableOwner = lastChatMessagesProps?.pendingToolConfirmationRequests?.[
      captured.pending.interaction_id
    ];
    rendered.unmount();

    expect(storedBytes).toBe(originalBytes);
    expect(actionableOwner).toBeUndefined();
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV4.mock.calls.some(
      ([payload]) => payload?.mode === "resume_interaction",
    )).toBe(false);
  });

  test.each([true, false])("cold native approval submits %s once with the original root receipt", async (approved) => {
    const chatId = getChatsStore().activeChatId;
    const { captured, setPending, mount } = prepareNativeColdApproval(chatId, renderChat);
    const receiptId = `native-receipt-${approved ? "approved" : "denied"}`;
    window.unchainAPI.respondToolConfirmation = jest.fn(async (payload) => {
      const resolvedApproval = payload.approved === true;
      setPending({
        ...captured.pending,
        status: "receipt_recorded",
        receipt_id: receiptId,
        resolution: {
          outcome: resolvedApproval ? "approved" : "denied",
          response: { approved: resolvedApproval, reason: "" },
        },
      });
      return {
        status: "ok",
        durable: true,
        disposition: "receipt_recorded",
        session_id: chatId,
        interaction_id: captured.pending.interaction_id,
        receipt_id: receiptId,
      };
    });
    window.unchainAPI.isRuntimeEventStreamV4Available.mockReturnValue(true);
    mount();
    await waitFor(() => expect(lastChatMessagesProps?.pendingToolConfirmationRequests?.[
      captured.pending.interaction_id
    ]).toBeDefined());

    const decision = {
      confirmationId: captured.pending.interaction_id,
      approved,
    };
    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision(decision);
      await lastChatMessagesProps.onToolConfirmationDecision(decision);
    });
    await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1));

    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.startStreamV4.mock.calls[0][0]).toEqual(expect.objectContaining({
      mode: "resume_interaction",
      threadId: chatId,
      interaction_id: captured.pending.interaction_id,
      source_attempt_id: captured.pending.source_run_id,
      message: "",
      history: [],
      attachments: [],
    }));
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
  });

  const sendText = (text) => {
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: text },
    });
    fireEvent.click(screen.getByTestId("send-button"));
  };

  const startRuntimeV4 = (attemptId) => {
    window.unchainAPI.isRuntimeEventStreamV4Available.mockReturnValue(true);
    window.unchainAPI.startStreamV4 = jest.fn((_payload, handlers) => {
      streamHandlers = handlers;
      return { cancel: jest.fn(), disconnect: jest.fn(), requestId: `request-${attemptId}`, attemptId };
    });
  };

  const observedBatchEvent = (index, { chatId, runId, callIds = {} }) => {
    const event = JSON.parse(JSON.stringify(observedBatchFixture[index]));
    event.event_id = `test-${runId}-${event.seq}`;
    event.session_id = chatId;
    event.run_id = runId;
    event.turn_id = `${runId}:turn-0`;
    const previousCallId = event.links?.tool_call_id;
    const mappedCallId = previousCallId ? callIds[previousCallId] : undefined;
    if (mappedCallId) {
      event.links.tool_call_id = mappedCallId;
      if (typeof event.links.step_id === "string") {
        event.links.step_id = `tool:${mappedCallId}`;
      }
      if (event.payload?.call_id) event.payload.call_id = mappedCallId;
      if (typeof event.payload?.step_id === "string") {
        event.payload.step_id = `tool:${mappedCallId}`;
      }
    }
    return event;
  };

  const waitForRuntimeRun = async () => {
    await waitFor(() => expect(streamHandlers).not.toBeNull());
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
  };

  const nativeChildObservationFixture356 = {
  "ids": {
    "R": "observation-root-R",
    "T": "observation-transport-T",
    "P": "observation-parent-P",
    "C": "observation-child-C",
    "N": "node-attempt-observation-N"
  },
  "events": [
    {
      "schema_version": "v4",
      "event_id": "event-0",
      "type": "session.started",
      "timestamp": "2026-11-07T00:18:27.009662Z",
      "session_id": "observation-session",
      "run_id": "observation-transport-T",
      "agent_id": "developer",
      "turn_id": null,
      "seq": 1,
      "links": {
        "parent_run_id": null,
        "parent_event_id": null,
        "caused_by_event_id": null,
        "step_id": null,
        "tool_call_id": null,
        "interaction_id": null,
        "artifact_id": null,
        "workspace_change_set_id": null,
        "plan_id": null,
        "channel_id": null,
        "team_id": null
      },
      "surface": {
        "slot": "debug",
        "scope": "session",
        "group": "session",
        "default_state": "hidden",
        "priority": 1000
      },
      "visibility": "debug",
      "payload": {},
      "metadata": {}
    },
    {
      "schema_version": "v4",
      "event_id": "event-1",
      "type": "run.started",
      "timestamp": "2026-11-07T00:18:27.009947Z",
      "session_id": "observation-session",
      "run_id": "observation-child-C",
      "agent_id": "kernel.reviewer.1",
      "turn_id": null,
      "seq": 2,
      "links": {
        "parent_run_id": "observation-parent-P",
        "parent_event_id": null,
        "caused_by_event_id": null,
        "step_id": null,
        "tool_call_id": null,
        "interaction_id": null,
        "artifact_id": null,
        "workspace_change_set_id": null,
        "plan_id": null,
        "channel_id": null,
        "team_id": null
      },
      "surface": {
        "slot": "debug",
        "scope": "run",
        "group": "debug",
        "default_state": "hidden",
        "priority": 1000
      },
      "visibility": "user",
      "payload": {
        "agent_id": "kernel.reviewer.1",
        "parent_id": "kernel",
        "mode": "delegate",
        "template": "Reviewer",
        "lineage": [
          "kernel",
          "kernel.reviewer.1"
        ],
        "status": "running"
      },
      "metadata": {
        "raw_type": "subagent_started"
      }
    },
    {
      "schema_version": "v4",
      "event_id": "event-2",
      "type": "step.completed",
      "timestamp": "2026-11-07T00:18:27.009996Z",
      "session_id": "observation-session",
      "run_id": "node-attempt-observation-N",
      "agent_id": "developer",
      "turn_id": null,
      "seq": 3,
      "links": {
        "parent_run_id": "observation-child-C",
        "parent_event_id": null,
        "caused_by_event_id": null,
        "step_id": "model:node-attempt-observation-N:response",
        "tool_call_id": null,
        "interaction_id": null,
        "artifact_id": null,
        "workspace_change_set_id": null,
        "plan_id": null,
        "channel_id": null,
        "team_id": null
      },
      "surface": {
        "slot": "trace_inline",
        "scope": "turn",
        "group": "model",
        "default_state": "collapsed",
        "priority": 100
      },
      "visibility": "user",
      "payload": {
        "step_id": "model:node-attempt-observation-N:response",
        "step_type": "model_response",
        "status": "completed",
        "response_id": "child-response",
        "has_tool_calls": false
      },
      "metadata": {
        "raw_type": "response_received"
      }
    },
    {
      "schema_version": "v4",
      "event_id": "event-3",
      "type": "step.completed",
      "timestamp": "2026-11-07T00:18:27.010026Z",
      "session_id": "observation-session",
      "run_id": "node-attempt-observation-N",
      "agent_id": "developer",
      "turn_id": null,
      "seq": 4,
      "links": {
        "parent_run_id": "observation-child-C",
        "parent_event_id": null,
        "caused_by_event_id": null,
        "step_id": "model:node-attempt-observation-N:response",
        "tool_call_id": null,
        "interaction_id": null,
        "artifact_id": null,
        "workspace_change_set_id": null,
        "plan_id": null,
        "channel_id": null,
        "team_id": null
      },
      "surface": {
        "slot": "trace_inline",
        "scope": "turn",
        "group": "model",
        "default_state": "collapsed",
        "priority": 100
      },
      "visibility": "user",
      "payload": {
        "step_id": "model:node-attempt-observation-N:response",
        "step_type": "model_response",
        "status": "completed",
        "final_text": "NATIVE_CHILD_MODEL_OBSERVATION"
      },
      "metadata": {
        "raw_type": "final_message"
      }
    },
    {
      "schema_version": "v4",
      "event_id": "event-4",
      "type": "step.completed",
      "timestamp": "2026-11-07T00:18:27.010050Z",
      "session_id": "observation-session",
      "run_id": "observation-child-C",
      "agent_id": "developer",
      "turn_id": null,
      "seq": 5,
      "links": {
        "parent_run_id": "observation-parent-P",
        "parent_event_id": null,
        "caused_by_event_id": null,
        "step_id": "model:observation-child-C:response",
        "tool_call_id": null,
        "interaction_id": null,
        "artifact_id": null,
        "workspace_change_set_id": null,
        "plan_id": null,
        "channel_id": null,
        "team_id": null
      },
      "surface": {
        "slot": "trace_inline",
        "scope": "turn",
        "group": "model",
        "default_state": "collapsed",
        "priority": 100
      },
      "visibility": "user",
      "payload": {
        "step_id": "model:observation-child-C:response",
        "step_type": "model_response",
        "status": "completed",
        "final_text": "COMMITTED_CHILD_END"
      },
      "metadata": {
        "raw_type": "final_message"
      }
    },
    {
      "schema_version": "v4",
      "event_id": "event-5",
      "type": "step.completed",
      "timestamp": "2026-11-07T00:18:27.010069Z",
      "session_id": "observation-session",
      "run_id": "observation-root-R",
      "agent_id": "developer",
      "turn_id": null,
      "seq": 6,
      "links": {
        "parent_run_id": null,
        "parent_event_id": null,
        "caused_by_event_id": null,
        "step_id": "model:observation-root-R:response",
        "tool_call_id": null,
        "interaction_id": null,
        "artifact_id": null,
        "workspace_change_set_id": null,
        "plan_id": null,
        "channel_id": null,
        "team_id": null
      },
      "surface": {
        "slot": "trace_inline",
        "scope": "turn",
        "group": "model",
        "default_state": "collapsed",
        "priority": 100
      },
      "visibility": "user",
      "payload": {
        "step_id": "model:observation-root-R:response",
        "step_type": "model_response",
        "status": "completed",
        "final_text": "ROOT_PARENT_FINAL"
      },
      "metadata": {
        "raw_type": "final_message"
      }
    }
  ]
};

  test("#356 native child observation: no node run_started persists N under lifecycle C", async () => {
    // Exact existing Core95 RuntimeEventBridge output; only execution session is
    // rebound to this real hook/store harness. No raw/node run_started exists.
    const captured = JSON.parse(JSON.stringify(nativeChildObservationFixture356));
    const { R: root, T: transport, C: child, N: node } = captured.ids;
    expect(captured.events.some((event) => event.run_id === node && event.type === "run.started")).toBe(false);
    startRuntimeV4(transport);
    renderChat();
    await waitForReady();
    sendText("observe the committed child and its native model");
    await waitForRuntimeRun();
    const chatId = getChatsStore().activeChatId;
    await act(async () => {
      captured.events.forEach((event) => streamHandlers.onRuntimeEvent({ ...event, session_id: chatId }));
      await new Promise((resolve) => setTimeout(resolve, 100));
      streamHandlers.onDone({ status: "completed" });
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const stored = getChatMessages(chatId).find((message) => message.role === "assistant");
    expect(stored).toBeDefined();
    expect(stored.content).toBe("ROOT_PARENT_FINAL");
    expect(stored.subagentMetaByRunId[child].subagentId).toBe("kernel.reviewer.1");
    expect(stored.subagentFrames[child]).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "final_message", run_id: child,
        payload: expect.objectContaining({ content: "COMMITTED_CHILD_END" }) }),
    ]));
    // Genuine regression: lifecycle C and canonical root prerequisites passed.
    expect(stored.subagentFrames[node]).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "final_message", run_id: node,
        links: expect.objectContaining({ parent_run_id: child }),
        payload: expect.objectContaining({ content: "NATIVE_CHILD_MODEL_OBSERVATION" }) }),
    ]));
    expect((stored.traceFrames || []).filter((frame) => frame.run_id === node)).toEqual([]);
    expect(stored.subagentMetaByRunId?.[node]).toBeUndefined();
    expect(stored.traceFrames.some((frame) => frame.run_id === root)).toBe(true);
    // Reopen from the actual store, not a separately constructed renderer shape.
    const reopened = getChatMessages(chatId).find((message) => message.id === stored.id);
    expect(reopened.subagentFrames[node]).toEqual(stored.subagentFrames[node]);
    expect(lastChatMessagesProps.messages.find((message) => message.id === stored.id).subagentFrames[node])
      .toEqual(stored.subagentFrames[node]);
  });

  const nativeObservationEvent356 = (index, chatId, overrides = {}) => ({
    ...JSON.parse(JSON.stringify(nativeChildObservationFixture356.events[index])),
    session_id: chatId,
    ...overrides,
  });

  test.each(["wrong session", "unknown parent", "status-only parent", "root P", "root started"])(
    "#356 native child observation current fences: %s", async (scenario) => {
      const { R: root, T: transport, P: parent, C: child, N: node } = nativeChildObservationFixture356.ids;
      startRuntimeV4(transport);
      renderChat(); await waitForReady(); sendText("observe child ownership fences");
      await waitForRuntimeRun();
      const chatId = getChatsStore().activeChatId;
      if (scenario === "status-only parent") {
        await act(async () => setChatMessages(chatId, getChatMessages(chatId).map((message) =>
          message.role === "assistant" ? { ...message,
            subagentMetaByRunId: { [child]: { status: "running", subagentId: "" } },
            subagentFrames: { [child]: [] } } : message), { source: "test" }));
      }
      await act(async () => {
        streamHandlers.onRuntimeEvent(nativeObservationEvent356(0, chatId));
        if (scenario === "root started") streamHandlers.onRuntimeEvent({
          ...nativeObservationEvent356(0, chatId), type: "run.started", run_id: root,
          event_id: "root-started-observation", payload: { status: "running" }, metadata: { raw_type: "run_started" },
        });
        if (scenario !== "status-only parent") streamHandlers.onRuntimeEvent(nativeObservationEvent356(1, chatId));
        [2, 3].forEach((index) => {
          const event = nativeObservationEvent356(index, chatId);
          if (scenario === "wrong session") event.session_id = "foreign-execution-session";
          if (scenario === "unknown parent") event.links.parent_run_id = "unrelated-child";
          if (scenario === "root P") { event.run_id = parent; event.links.parent_run_id = root; }
          streamHandlers.onRuntimeEvent(event);
        });
        streamHandlers.onRuntimeEvent(nativeObservationEvent356(5, chatId));
        await new Promise((resolve) => setTimeout(resolve, 100));
        streamHandlers.onDone({ status: "completed" });
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      const stored = getChatMessages(chatId).find((message) => message.role === "assistant");
      expect(stored.content).toBe("ROOT_PARENT_FINAL");
      if (scenario === "root started") {
        expect(stored.subagentFrames[node].filter((frame) => frame.type === "final_message")).toHaveLength(1);
        expect(stored.subagentMetaByRunId?.[node]).toBeUndefined();
      } else {
        expect(stored.subagentFrames?.[node]).toBeUndefined();
        if (scenario === "wrong session") {
          expect((stored.traceFrames || []).some((frame) => frame.run_id === node)).toBe(false);
          expect(JSON.stringify(stored)).not.toContain("NATIVE_CHILD_MODEL_OBSERVATION");
        }
        if (scenario === "root P") {
          expect(stored.traceFrames.some((frame) => frame.run_id === parent && frame.type === "final_message")).toBe(true);
          expect(stored.subagentFrames?.[parent]).toBeUndefined();
          expect(stored.subagentMetaByRunId?.[parent]).toBeUndefined();
        }
      }
    },
  );

  test.each(["saved owner", "foreign owner", "status-only parent", "wrong session"])(
    "#356 native child observation cold ownership: %s", async (scenario) => {
      const { chatId, decision } = await prepareSettlementResume();
      const { C: child, N: node } = nativeChildObservationFixture356.ids;
      const prior = getChatMessages(chatId);
      const currentOwner = prior.find((message) => message.role === "assistant" && message.meta?.attemptId === "attempt-path");
      expect(currentOwner).toBeDefined();
      const savedNode = { seq: 1, ts: 1, type: "response_received", run_id: node, session_id: chatId,
        stage: "runtime_event", event_id: "saved-native-response", links: { parent_run_id: child }, payload: { status: "success" } };
      const savedEnd = { seq: 2, ts: 2, type: "final_message", run_id: child, session_id: chatId,
        stage: "runtime_event", event_id: "saved-committed-end", payload: { content: "SAVED_COMMITTED_END" } };
      const lifecycle = { subagentId: "kernel.reviewer.1", template: "Reviewer", status: "completed", mode: "delegate" };
      const owner = { ...currentOwner, subagentFrames: { [node]: [savedNode], [child]: [savedEnd] },
        subagentMetaByRunId: scenario === "foreign owner" ? {} : { [child]: scenario === "status-only parent" ? { status: "running", subagentId: "" } : lifecycle } };
      const foreign = { id: "foreign-owner-356", role: "assistant", content: "foreign owner", status: "done",
        meta: { attemptId: "foreign-attempt" }, subagentFrames: { [child]: [savedEnd] }, subagentMetaByRunId: { [child]: lifecycle } };
      await act(async () => setChatMessages(chatId,
        [...prior.map((message) => message.id === owner.id ? owner : message), ...(scenario === "foreign owner" ? [foreign] : [])], { source: "test" }));
      const storedForeignBefore = JSON.stringify(getChatMessages(chatId).find((message) => message.id === foreign.id));
      await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
      await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1));
      const handlers = window.unchainAPI.startStreamV4.mock.calls[0][1];
      await act(async () => {
        const response = nativeObservationEvent356(2, chatId);
        const final = nativeObservationEvent356(3, chatId);
        if (scenario === "wrong session") response.session_id = final.session_id = "wrong-cold-session";
        handlers.onRuntimeEvent(response); handlers.onRuntimeEvent(final); handlers.onRuntimeEvent(final);
        handlers.onRuntimeEvent(nativeObservationEvent356(5, chatId, { run_id: "attempt-path" }));
        await new Promise((resolve) => setTimeout(resolve, 100));
        handlers.onDone({ status: "completed" });
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      const stored = getChatMessages(chatId).find((message) => message.id === owner.id);
      expect(stored.subagentFrames[node][0]).toEqual(savedNode);
      expect(stored.subagentFrames[child]).toEqual([savedEnd]);
      expect(stored.subagentMetaByRunId?.[node]).toBeUndefined();
      if (scenario === "saved owner") {
        expect(stored.subagentFrames[node]).toHaveLength(3);
        expect(stored.subagentFrames[node].filter((frame) => frame.type === "final_message")).toHaveLength(1);
        expect((stored.traceFrames || []).some((frame) => frame.run_id === node)).toBe(false);
      } else {
        expect(stored.subagentFrames[node]).toEqual([savedNode]);
        if (scenario === "wrong session") expect((stored.traceFrames || []).some((frame) => frame.run_id === node)).toBe(false);
        if (scenario === "foreign owner") expect(JSON.stringify(getChatMessages(chatId).find((message) => message.id === foreign.id))).toBe(storedForeignBefore);
      }
    },
  );

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

  test("#384: stop preserves a canonical V4 call admitted to the pending 64ms batch", async () => {
    startRuntimeV4("attempt-buffered-384");
    renderChat();
    await waitForReady();
    sendText("read the fixture");
    await waitForRuntimeRun();

    const chatId = getChatsStore().activeChatId;
    const admittedCall = observedBatchEvent(2, {
      chatId,
      runId: "attempt-buffered-384",
      callIds: { "observed-batch-call-1": "call-buffered-384" },
    });
    await act(async () => streamHandlers.onRuntimeEvent(admittedCall));
    expect(lastChatMessagesProps.messages.find((message) => message.role === "assistant")?.traceFrames)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "tool_call" })]));

    await act(async () => fireEvent.click(screen.getByTestId("stop-button")));

    const assistant = getChatMessages(chatId).find((message) => message.role === "assistant");
    expect(assistant).toBeDefined();
    expect(assistant.status).toBe("cancelled");
    expect(assistant.traceFrames).toEqual([
      expect.objectContaining({
        type: "tool_call",
        payload: expect.objectContaining({
          call_id: "call-buffered-384",
          tool_name: "read_file",
          arguments: { path: "fixture-1.txt" },
        }),
      }),
    ]);
  });

  test("#384: stop drains a result and the in-flight root call admitted in the same stack", async () => {
    startRuntimeV4("attempt-same-stack-result-384");
    renderChat();
    await waitForReady();
    sendText("read both files");
    await waitForRuntimeRun();
    const chatId = getChatsStore().activeChatId;
    const callIds = {
      "observed-batch-call-1": "call-same-stack-complete-384",
    };

    await act(async () => {
      observedBatchFixture.slice(0, 5).forEach((_event, index) => {
        streamHandlers.onRuntimeEvent(observedBatchEvent(index, {
          chatId,
          runId: "attempt-same-stack-result-384",
          callIds: {
            ...callIds,
            "observed-batch-call-2": "call-same-stack-running-384",
          },
        }));
      });
      fireEvent.click(screen.getByTestId("stop-button"));
    });

    const assistant = getChatMessages(chatId).find((message) => message.role === "assistant");
    expect(assistant.status).toBe("cancelled");
    expect(assistant.traceFrames.map((frame) => frame.payload?.call_id).filter(Boolean)).toEqual([
      "call-same-stack-complete-384",
      "call-same-stack-complete-384",
      "call-same-stack-running-384",
    ]);
    expect(assistant.traceFrames.find((frame) =>
      frame.type === "tool_result" && frame.payload?.call_id === "call-same-stack-complete-384",
    )?.payload.result).toEqual({ content: "fixture contents for fixture-1.txt" });
  });

  test("#384: stop drains nested V4 calls and results admitted in the same 64ms batch", async () => {
    startRuntimeV4("attempt-nested-buffered-384");
    renderChat();
    await waitForReady();
    sendText("inspect with a worker");
    await waitForRuntimeRun();
    const chatId = getChatsStore().activeChatId;
    const runId = "attempt-nested-buffered-384";
    const rootCallIds = {
      "observed-batch-call-1": "call-nested-root-complete-384",
      "observed-batch-call-2": "call-nested-root-running-384",
    };
    const childEvents = [
      {
        seq: 6, type: "run.started", run_id: "worker-run-384", agent_id: "worker-search",
        links: { parent_run_id: runId }, payload: { agent_id: "worker-search", mode: "delegate" },
      },
      {
        seq: 7, type: "step.started", run_id: "worker-run-384", agent_id: "worker-search",
        links: { parent_run_id: runId, tool_call_id: "child-call-complete-384" },
        payload: { step_type: "tool", call_id: "child-call-complete-384", tool_name: "read_file", arguments: { path: "worker-complete.txt" } },
      },
      {
        seq: 8, type: "step.completed", run_id: "worker-run-384", agent_id: "worker-search",
        links: { parent_run_id: runId, tool_call_id: "child-call-complete-384" },
        payload: { step_type: "tool", call_id: "child-call-complete-384", tool_name: "read_file", status: "success", result: { content: "worker result" } },
      },
      {
        seq: 9, type: "step.started", run_id: "worker-run-384", agent_id: "worker-search",
        links: { parent_run_id: runId, tool_call_id: "child-call-running-384" },
        payload: { step_type: "tool", call_id: "child-call-running-384", tool_name: "search", arguments: { query: "unfinished" } },
      },
    ].map((event) => ({
      schema_version: "v4",
      event_id: `test-worker-${event.seq}`,
      timestamp: "2026-10-02T00:00:00.000Z",
      session_id: chatId,
      turn_id: `${runId}:turn-0`,
      visibility: "user",
      metadata: {},
      surface: { slot: "trace_inline", scope: "turn" },
      ...event,
    }));

    await act(async () => {
      observedBatchFixture.slice(0, 5).forEach((_event, index) => {
        streamHandlers.onRuntimeEvent(observedBatchEvent(index, { chatId, runId, callIds: rootCallIds }));
      });
      childEvents.forEach((event) => streamHandlers.onRuntimeEvent(event));
      fireEvent.click(screen.getByTestId("stop-button"));
    });

    const assistant = getChatMessages(chatId).find((message) => message.role === "assistant");
    expect(assistant.status).toBe("cancelled");
    expect(assistant.traceFrames.map((frame) => frame.payload?.call_id).filter(Boolean)).toEqual([
      "call-nested-root-complete-384",
      "call-nested-root-complete-384",
      "call-nested-root-running-384",
    ]);
    expect(assistant.traceFrames.find((frame) => frame.type === "tool_result" && frame.payload?.call_id === "call-nested-root-complete-384")?.payload.result)
      .toEqual({ content: "fixture contents for fixture-1.txt" });
    expect(assistant.subagentFrames["worker-run-384"].map((frame) => frame.payload?.call_id).filter(Boolean)).toEqual([
      "child-call-complete-384",
      "child-call-complete-384",
      "child-call-running-384",
    ]);
    expect(assistant.subagentFrames["worker-run-384"].find((frame) => frame.type === "tool_result")?.payload.result)
      .toEqual({ content: "worker result" });
    // Keep the worker's observed raw status for provenance. TraceChain projects
    // running child metadata as Cancelled when its saved parent is cancelled.
    expect(assistant.subagentMetaByRunId["worker-run-384"].status).toBe("running");
    expect(JSON.stringify(getChatMessages(chatId).find((message) => message.id === assistant.id).subagentFrames["worker-run-384"]))
      .toBe(JSON.stringify(assistant.subagentFrames["worker-run-384"]));
  });

  test("#384: repeated stop and callbacks from a finished V4 run cannot mutate its successor", async () => {
    // This scenario starts a successor only after the exact Stop is confirmed.
    window.unchainAPI.cancelExecution = jest.fn(async (payload) => ({
      status: "cancelled", state: "cancelled",
      execution_id: payload.session_id, attempt_id: payload.attempt_id,
    }));
    const handlersByRun = [];
    window.unchainAPI.isRuntimeEventStreamV4Available.mockReturnValue(true);
    window.unchainAPI.startStreamV4 = jest.fn((_payload, handlers) => {
      handlersByRun.push(handlers);
      streamHandlers = handlers;
      const index = handlersByRun.length;
      return {
        cancel: jest.fn(),
        requestId: `request-stale-${index}`,
        attemptId: `attempt-stale-${index}`,
      };
    });
    renderChat();
    await waitForReady();
    sendText("first attempt");
    await waitForRuntimeRun();
    const chatId = getChatsStore().activeChatId;
    const firstHandlers = streamHandlers;

    await act(async () => {
      firstHandlers.onRuntimeEvent(observedBatchEvent(2, {
        chatId,
        runId: "attempt-stale-first",
        callIds: { "observed-batch-call-1": "call-stale-first" },
      }));
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    await act(async () => fireEvent.click(screen.getByTestId("stop-button")));
    const firstSnapshot = getChatMessages(chatId).find((message) => message.role === "assistant");
    expect(firstSnapshot.status).toBe("cancelled");

    await act(async () => lastChatInputProps.onStop());
    await act(async () => firstHandlers.onRuntimeEvent(observedBatchEvent(3, {
      chatId,
      runId: "attempt-stale-first",
      callIds: { "observed-batch-call-1": "call-stale-first" },
    })));
    sendText("successor attempt");
    await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(2));
    const successorHandlers = handlersByRun[1];

    await act(async () => {
      firstHandlers.onRuntimeEvent(observedBatchEvent(5, {
        chatId,
        runId: "attempt-stale-first",
        callIds: { "observed-batch-call-2": "call-stale-first-late-result" },
      }));
      firstHandlers.onRuntimeEvent(nativeObservationEvent356(3, chatId));
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    const messagesBeforeSuccessorEvent = getChatMessages(chatId);
    expect(messagesBeforeSuccessorEvent.find((message) => message.id === firstSnapshot.id).traceFrames)
      .toEqual(firstSnapshot.traceFrames);
    const successorBeforeEvent = messagesBeforeSuccessorEvent.filter((message) => message.role === "assistant")[1];
    expect(successorBeforeEvent?.traceFrames || []).toEqual([]);
    expect(JSON.stringify(messagesBeforeSuccessorEvent)).not.toContain("NATIVE_CHILD_MODEL_OBSERVATION");

    await act(async () => {
      successorHandlers.onRuntimeEvent(observedBatchEvent(2, {
        chatId,
        runId: "attempt-stale-second",
        callIds: { "observed-batch-call-1": "call-stale-second" },
      }));
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    await waitFor(() => {
      const successor = lastChatMessagesProps.messages.filter((message) => message.role === "assistant")[1];
      expect(successor?.traceFrames?.some((frame) => frame.payload?.call_id === "call-stale-second")).toBe(true);
    });
    const assistants = getChatMessages(chatId).filter((message) => message.role === "assistant");
    expect(assistants[0].traceFrames.some((frame) => frame.payload?.call_id === "call-stale-first-late-result")).toBe(false);
  });

  test("#384: stop drains a same-stack approval request before recording cancellation identity", async () => {
    startRuntimeV4("attempt-same-stack-approval-384");
    window.unchainAPI.cancelExecution = jest.fn(async (payload) => ({
      status: "ok",
      session_id: payload.session_id,
      attempt_id: payload.attempt_id,
      state: "cancelled",
    }));
    renderChat();
    await waitForReady();
    sendText("choose a folder");
    await waitForRuntimeRun();
    const chatId = getChatsStore().activeChatId;
    const interactionId = "interaction-stop-384";
    const callId = "call-stop-approval-384";
    const config = {
      prompt: "Choose a folder",
      options: [],
      allow_other: true,
    };
    const approvalEvent = {
      schema_version: "v4",
      event_id: "event-stop-approval-384",
      type: "interaction.requested",
      timestamp: "2026-10-02T00:00:00.000Z",
      session_id: chatId,
      run_id: "attempt-same-stack-approval-384",
      agent_id: "developer",
      turn_id: "attempt-same-stack-approval-384:turn-0",
      seq: 1,
      links: { interaction_id: interactionId, tool_call_id: callId },
      surface: { slot: "trace_inline", scope: "turn" },
      visibility: "user",
      metadata: {},
      payload: {
        interaction_id: interactionId,
        kind: "choice",
        renderer: "single",
        title: "Folder",
        prompt: "Choose a folder",
        selection_mode: "single",
        options: [],
        allow_other: true,
        target: { tool_call_id: callId, tool_name: "ask_user_question" },
        config,
      },
    };

    await act(async () => {
      streamHandlers.onRuntimeEvent(approvalEvent);
      fireEvent.click(screen.getByTestId("stop-button"));
    });

    const assistant = getChatMessages(chatId).find((message) => message.role === "assistant");
    expect(assistant.status).toBe("cancelled");
    expect(assistant.traceFrames).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_call", payload: expect.objectContaining({
        confirmation_id: interactionId,
        call_id: callId,
        requires_confirmation: true,
      }) }),
    ]));
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith(expect.objectContaining({
      owner_chat_id: chatId,
      interaction_id: interactionId,
      reason: "user_stop",
    }));
    expect(lastChatMessagesProps.pendingToolConfirmationRequests[interactionId]).toBeUndefined();
    expect(window.unchainAPI.respondToolConfirmation).not.toHaveBeenCalled();
  });

  const stopPendingApproval357 = async (durable, label) => {
    const attemptId = `attempt-cancelled-approval-357-${label}`;
    startRuntimeV4(attemptId);
    window.unchainAPI.cancelExecution = jest.fn(async (payload) => ({
      status: "ok",
      execution_id: payload.session_id,
      attempt_id: payload.attempt_id,
      source_attempt_id: payload.attempt_id,
      state: "cancelled",
      disposition: "cancelled",
      durable_interaction_cancelled: durable,
      cancellation: { reason: "user_stop" },
    }));
    renderChat();
    await waitForReady();
    sendText("write the file");
    await waitForRuntimeRun();
    const chatId = getChatsStore().activeChatId;
    const interactionId = `interaction-stop-357-${label}`;
    const callId = `call-stop-357-${label}`;
    await act(async () => {
      streamHandlers.onRuntimeEvent({
        schema_version: "v4",
        event_id: `event-stop-approval-357-${label}`,
        type: "interaction.requested",
        timestamp: "2026-10-26T00:00:00.000Z",
        session_id: chatId,
        run_id: attemptId,
        agent_id: "developer",
        turn_id: `${attemptId}:turn-0`,
        seq: 1,
        links: { interaction_id: interactionId, tool_call_id: callId },
        surface: { slot: "trace_inline", scope: "turn" },
        visibility: "user",
        metadata: {},
        payload: {
          interaction_id: interactionId,
          kind: "confirmation",
          title: "Write",
          prompt: "Allow write?",
          target: { tool_call_id: callId, tool_name: "write" },
          config: {},
        },
      });
    });
    fireEvent.click(screen.getByTestId("stop-button"));
    await waitFor(() => expect(window.unchainAPI.cancelExecution).toHaveBeenCalled());
    const cancelledFrames = () => getChatMessages(chatId)
      .find((message) => message.role === "assistant")
      .traceFrames.filter((frame) => frame.type === "interaction_cancelled");
    return { attemptId, interactionId, callId, cancelledFrames };
  };

  /* Delegate cancel settlement: the real producer reply (delegate, waiting),
     with its execution, root attempt and consumer generation rebound to this
     test chat (constructed); call, consumer node attempt and child run kept. */
  test("#357: Stop records the producer's delegate settlement and a cold read still binds it", async () => {
    const row = cancelledSubagentProducer.rows[0];
    const attemptId = "attempt-delegate-cancel-357";
    const consumer = row.consumer_node_attempt;
    const call = row.parent_wait.parent_tool_call;
    startRuntimeV4(attemptId);
    let reply;
    window.unchainAPI.cancelExecution = jest.fn(async (payload) => {
      reply = JSON.parse(JSON.stringify(row.response));
      reply.execution_id = payload.session_id;
      reply.attempt_id = payload.attempt_id;
      reply.source_attempt_id = payload.attempt_id;
      for (const ref of [reply.subagent_settlements[0].consumer_attempt, reply.subagent_settlements[0].source_attempt]) {
        ref.generation.execution_id = payload.session_id;
      }
      return reply;
    });
    renderChat();
    await waitForReady();
    sendText("delegate the review");
    await waitForRuntimeRun();
    const chatId = getChatsStore().activeChatId;
    const interactionId = "interaction-delegate-cancel-357";
    await act(async () => {
      streamHandlers.onRuntimeEvent({
        schema_version: "v4", event_id: "event-delegate-call-357", type: "step.started",
        timestamp: "2026-10-27T00:00:00.000Z", session_id: chatId, run_id: consumer,
        agent_id: "developer", turn_id: `${consumer}:turn-0`, seq: 1,
        links: { step_id: `tool:${call.call_id}`, tool_call_id: call.call_id },
        surface: { slot: "trace_inline", scope: "turn" }, visibility: "user", metadata: {},
        payload: { step_id: `tool:${call.call_id}`, step_type: "tool", tool_name: call.tool_name,
          call_id: call.call_id, arguments: { target: "Reviewer", task: "review" } },
      });
      streamHandlers.onRuntimeEvent({
        schema_version: "v4", event_id: "event-delegate-child-approval-357", type: "interaction.requested",
        timestamp: "2026-10-27T00:00:01.000Z", session_id: chatId, run_id: attemptId,
        agent_id: "developer", turn_id: `${attemptId}:turn-0`, seq: 2,
        links: { interaction_id: interactionId, tool_call_id: "child-approval-call" },
        surface: { slot: "trace_inline", scope: "turn" }, visibility: "user", metadata: {},
        payload: { interaction_id: interactionId, kind: "confirmation", title: "Write", prompt: "Allow?",
          target: { tool_call_id: "child-approval-call", tool_name: "dangerous_tool" }, config: {} },
      });
    });
    fireEvent.click(screen.getByTestId("stop-button"));
    await waitFor(() => expect(window.unchainAPI.cancelExecution).toHaveBeenCalled());
    const stored = () => getChatMessages(chatId).find((message) => message.role === "assistant");
    await waitFor(() => expect(stored().traceFrames.filter((frame) => frame.type === "subagent_settlement")).toHaveLength(1));
    // Cold read: the chat store alone binds the delegate call to its settlement.
    const message = stored();
    const settlements = collectSubagentSettlements([message.traceFrames, ...Object.values(message.subagentFrames || {})]);
    const delegate = message.traceFrames.find((frame) => frame.type === "tool_call" && frame.payload?.call_id === call.call_id);
    expect(delegate.run_id).toBe(consumer);
    expect(settlementForToolCall(settlements, delegate, message.traceFrames)).toEqual(expect.objectContaining({
      status: "cancelled", consumerAttemptId: consumer,
      sourceAttemptId: reply.subagent_settlements[0].source_attempt.attempt_id,
    }));
  });

  test("#357: stop records cancelled-before-run when the backend proves the durable interaction was cancelled", async () => {
    const { attemptId, interactionId, callId, cancelledFrames } = await stopPendingApproval357(true, "proved");
    await waitFor(() => expect(cancelledFrames()).toHaveLength(1));
    expect(cancelledFrames()[0].payload).toEqual(expect.objectContaining({
      call_id: callId, confirmation_id: interactionId, attempt_id: attemptId,
      durable_interaction_cancelled: true,
    }));
    await waitFor(() => {
      const shown = lastChatMessagesProps.messages.find((message) => message.role === "assistant");
      expect(shown.traceFrames.some((frame) => frame.type === "interaction_cancelled")).toBe(true);
    });
  });

  test("#357: stop records nothing when the backend only reports the run cancelled", async () => {
    const { cancelledFrames } = await stopPendingApproval357(false, "unproved");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(cancelledFrames()).toHaveLength(0);
  });

  /* #357 cold child settlement: the producer's real V4 child run.completed,
     with only its execution id rebound to this test chat (constructed). */
  const settlementEventFor = (chatId) => {
    const event = JSON.parse(JSON.stringify(settlementFixture.reprojection.v4_event));
    event.session_id = chatId;
    const { settlement } = event.payload;
    settlement.consumer_attempt.generation.execution_id = chatId;
    settlement.source_attempt.generation.execution_id = chatId;
    return event;
  };

  test("#357: a child settlement is stored with the message and survives a cold reopen", async () => {
    startRuntimeV4("attempt-settlement-357");
    renderChat();
    await waitForReady();
    sendText("resume the reviewer");
    await waitForRuntimeRun();
    const chatId = getChatsStore().activeChatId;
    const event = settlementEventFor(chatId);
    await act(async () => {
      streamHandlers.onRuntimeEvent(event);
      await new Promise((resolve) => setTimeout(resolve, 80));
      streamHandlers.onDone({ status: "completed" });
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    const storedSettlement = () => {
      const assistant = getChatMessages(chatId).find((message) => message.role === "assistant");
      return Object.values(assistant?.subagentFrames || {})
        .flat()
        .filter((frame) => frame?.payload?.settlement);
    };
    await waitFor(() => expect(storedSettlement()).toHaveLength(1));
    expect(storedSettlement()[0]).toEqual(expect.objectContaining({
      type: "subagent_completed",
      run_id: event.run_id,
      session_id: chatId,
      links: expect.objectContaining({
        parent_run_id: event.links.parent_run_id,
        tool_call_id: event.links.tool_call_id,
      }),
    }));
    expect(storedSettlement()[0].payload.settlement).toEqual(event.payload.settlement);
    // Cold reopen reads the same chat store and admits the same settlement.
    const reopened = getChatMessages(chatId).find((message) => message.role === "assistant");
    const settlements = collectSubagentSettlements([
      reopened.traceFrames || [],
      ...Object.values(reopened.subagentFrames || {}),
    ]);
    expect([...settlements.values()].map((entry) => entry.status)).toEqual(["completed"]);
  });

  test("#357: a late settlement from an earlier stream does not reach the successor turn", async () => {
    startRuntimeV4("attempt-settlement-first-357");
    renderChat();
    await waitForReady();
    sendText("first turn");
    await waitForRuntimeRun();
    const chatId = getChatsStore().activeChatId;
    const firstHandlers = streamHandlers;
    await act(async () => {
      firstHandlers.onDone({ status: "completed" });
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    window.unchainAPI.startStreamV4.mockClear();
    startRuntimeV4("attempt-settlement-second-357");
    sendText("second turn");
    await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1));
    await act(async () => {
      firstHandlers.onRuntimeEvent(settlementEventFor(chatId));
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    const assistants = getChatMessages(chatId).filter((message) => message.role === "assistant");
    const successor = assistants[assistants.length - 1];
    expect(Object.values(successor?.subagentFrames || {}).flat()
      .some((frame) => frame?.payload?.settlement)).toBe(false);
  });

  test("#384: stop preserves two V4 calls when one result was projected before stop", async () => {
    startRuntimeV4("attempt-visible-384");
    renderChat();
    await waitForReady();
    sendText("read both files");
    await waitForRuntimeRun();
    const chatId = getChatsStore().activeChatId;
    const callIds = {
      "observed-batch-call-1": "call-completed-384",
      "observed-batch-call-2": "call-running-384",
    };

    await act(async () => {
      observedBatchFixture.slice(0, 5).forEach((_event, index) => {
        streamHandlers.onRuntimeEvent(observedBatchEvent(index, {
          chatId,
          runId: "attempt-visible-384",
          callIds,
        }));
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    await waitFor(() => {
      const assistant = lastChatMessagesProps.messages.find((message) => message.role === "assistant");
      expect(assistant.traceFrames?.some((frame) => frame.payload?.call_id === "call-running-384")).toBe(true);
    });
    await act(async () => fireEvent.click(screen.getByTestId("stop-button")));

    const assistant = getChatMessages(chatId).find((message) => message.role === "assistant");
    expect(assistant.status).toBe("cancelled");
    expect(assistant.traceFrames.map((frame) => frame.payload?.call_id).filter(Boolean)).toEqual([
      "call-completed-384",
      "call-completed-384",
      "call-running-384",
    ]);
    const completedResult = assistant.traceFrames.find((frame) =>
      frame.type === "tool_result" && frame.payload?.call_id === "call-completed-384",
    );
    expect(completedResult?.payload).toEqual(expect.objectContaining({
      result: { content: "fixture contents for fixture-1.txt" },
    }));
  });

  test("a v4 reset removes only its failed live reasoning from the assistant message", async () => {
    window.unchainAPI.startStreamV4 = jest.fn((_payload, handlers) => {
      streamHandlers = handlers;
      return { cancel: jest.fn(), requestId: "preview-request", attemptId: "ticket-274-run-1" };
    });
    renderChat();
    await waitForReady();
    sendText("think aloud");
    await waitFor(() => expect(streamHandlers).not.toBeNull());

    const preview = ollamaPreviewFixture.live_events[0];
    const reset = ollamaPreviewFixture.live_events[1];
    const accepted = ollamaPreviewFixture.live_events[2];
    const runStarted = {
      ...preview,
      event_id: "preview-run-started",
      type: "run.started",
      seq: 0,
      payload: {},
      metadata: {},
    };
    await act(async () => {
      streamHandlers.onRuntimeEvent(runStarted);
      streamHandlers.onRuntimeEvent(preview);
    });
    await waitFor(() => expect(lastChatMessagesProps.messages.find(
      (message) => message.role === "assistant",
    )?.traceFrames?.some((frame) => frame.payload?.reasoning === "discard this")).toBe(true));

    await act(async () => streamHandlers.onRuntimeEvent(reset));
    await act(async () => streamHandlers.onRuntimeEvent(accepted));
    await waitFor(() => {
      const assistant = lastChatMessagesProps.messages.find((message) => message.role === "assistant");
      expect(assistant.traceFrames.some((frame) => frame.payload?.reasoning === "discard this")).toBe(false);
      expect(assistant.traceFrames.some((frame) => frame.payload?.reasoning === "accepted plan")).toBe(true);
      expect(assistant.traceFrames.some((frame) => frame.type === "run_started")).toBe(true);
    });
  });

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

  test("default: owner_chat_id and memory fields are sent without opting in", async () => {
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
    expect(deepHasKey(payload, "memory_v2_requested")).toBe(true);
    expect(deepHasKey(payload, "context_v2_history")).toBe(true);
    expect(deepHasKey(payload, "memory_agent_config")).toBe(true);
  });

  test("retired flags do not change bootstrap fields or legacy history", async () => {
    // Control profile has the retired flag disabled.
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

    // Same seeded state with the retired flag enabled.
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

  const prepareLiveHumanInput = async ({ disposition = "receipt_recorded", mismatch = false, resumeAvailable = true, initialAssistant = null } = {}) => {
    const chatId = getChatsStore().activeChatId;
    setChatMessages(chatId, [
      { id: "user-path", role: "user", content: "Ask where to put the project", createdAt: 1, updatedAt: 1 },
      ...(initialAssistant ? [initialAssistant] : []),
    ], { source: "test" });
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
    const awaiting = {
      status: "awaiting_response", session_id: chatId, interaction_id: interactionId,
      source_run_id: "attempt-path", active_attempt_id: "attempt-path", kind: "human_input",
      provider: "openai", model: "gpt-5", resume_available: resumeAvailable,
      resume_options: { modelId: "openai:gpt-5" },
      ...(!resumeAvailable ? { resume_unavailable_reason: "missing_checkpoint" } : {}),
      presentation: { tool_call: toolCall, trace_frame: { seq: 0, ts: 100, type: "tool_call", run_id: "attempt-path", stage: "durable_recovery", payload: toolCall } },
    };
    let pending = { status: "none", session_id: chatId };
    startRuntimeV4("attempt-path");
    window.unchainAPI.getPendingInteraction = jest.fn(async ({ session_id: sessionId = chatId } = {}) => sessionId === chatId ? pending : { status: "none", session_id: sessionId });
    window.unchainAPI.cancelExecution = jest.fn(async (payload) => {
      pending = { status: "none", session_id: chatId };
      return { status: "ok", attempt_id: payload.attempt_id, source_attempt_id: payload.source_attempt_id };
    });
    window.unchainAPI.startStreamV4.mockImplementation((payload, handlers = {}) => {
      streamHandlers = handlers;
      return {
        requestId: payload?.mode === "resume_interaction" ? "resume-path" : "request-path",
        attemptId: payload?.mode === "resume_interaction" ? "resume-path" : "attempt-path",
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });
    window.unchainAPI.respondToolConfirmation = jest.fn(async () => {
      pending = { ...awaiting, status: "receipt_recorded", receipt_id: "receipt-path", resolution: {
        outcome: "submitted", response: { request_id: "call-path", selected_values: ["__other__"], other_text: "/tmp/中文 项目" },
      } };
      return { status: "ok", durable: true, disposition, session_id: chatId,
        interaction_id: interactionId, receipt_id: mismatch ? "foreign-receipt" : "receipt-path" };
    });
    renderChat();
    await waitForReady();
    sendText("Ask where to put the project");
    await waitForRuntimeRun();
    pending = awaiting;
    await act(async () => streamHandlers.onRuntimeEvent({
      schema_version: "v4",
      event_id: "event-live-human-input-path",
      type: "interaction.requested",
      timestamp: "2026-09-12T00:00:00.000Z",
      session_id: chatId,
      run_id: "attempt-path",
      agent_id: "developer",
      turn_id: "attempt-path:turn-1",
      seq: 1,
      links: { tool_call_id: "call-path", interaction_id: interactionId },
      surface: { slot: "trace_inline", scope: "turn" },
      visibility: "user",
      metadata: {},
      payload: {
        interaction_id: interactionId,
        kind: "human_input",
        renderer: "single",
        title: config.title,
        prompt: config.question,
        selection_mode: config.selection_mode,
        options: config.options,
        allow_other: config.allow_other,
        min_selected: config.min_selected,
        max_selected: config.max_selected,
        target: {
          tool_call_id: "call-path",
          tool_name: "ask_user_question",
          toolkit_id: "core",
          arguments: config,
        },
      },
    }));
    await waitFor(() => expect(lastChatMessagesProps?.pendingToolConfirmationRequests[interactionId]).toBeDefined());
    return { chatId, interactionId, replacePending: (value) => { pending = value; }, decision: { confirmationId: interactionId, approved: true, userResponse: { value: "__other__", other_text: "/tmp/中文 项目" } } };
  };

  // The current contract requires this interaction to have been presented by
  // a real live stream before its finite SSE ends. Only resume calls are counted
  // below; the initial live request has already completed during this setup.
  const prepareSettlementResume = async () => {
    const prepared = await prepareLiveHumanInput();
    await act(async () => {
      streamHandlers.onDone({ status: "completed" });
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    window.unchainAPI.startStreamV4.mockClear();
    return prepared;
  };

  /* R-SETTLE-01: a resumed stream must keep the child's history already saved
     on the message, whichever child event arrives first. The saved child
     frames are constructed; the settlement is the real producer event with
     only its execution id rebound to this chat. */
  const resumeWithSavedChildren = async (sequence, { settlementAlreadySaved = false } = {}) => {
    const { chatId, decision } = await prepareSettlementResume();
    const first = settlementEventFor(chatId);
    const second = JSON.parse(JSON.stringify(first));
    const secondRun = `${first.run_id}-second`;
    second.run_id = secondRun;
    second.agent_id = secondRun;
    second.event_id = "evt-second-child-settlement";
    second.links.tool_call_id = "second-delegate";
    second.payload.settlement.call_id = "second-delegate";
    second.payload.settlement.source_attempt.attempt_id = secondRun;
    const savedFor = (runId, seq) => ({
      seq, ts: 100 + seq, type: "response_received", run_id: runId, session_id: chatId,
      stage: "runtime_event", event_id: `saved-${runId}-${seq}`, payload: { content: `saved ${seq}` },
    });
    const saved = {
      [first.run_id]: [savedFor(first.run_id, 1), savedFor(first.run_id, 2)],
      [secondRun]: [savedFor(secondRun, 1)],
    };
    if (settlementAlreadySaved) {
      // An earlier delivery of the same settlement event, already saved.
      saved[first.run_id].push({
        seq: 3, ts: 103, type: "subagent_completed", run_id: first.run_id, session_id: chatId,
        stage: "runtime_event", event_id: first.event_id, links: first.links,
        payload: { status: "completed", settlement: first.payload.settlement },
      });
    }
    // The assistant message the paused run already saved (constructed).
    const prior = getChatMessages(chatId);
    const pending = await window.unchainAPI.getPendingInteraction();
    const currentOwner = prior.find((message) => message.role === "assistant" && message.meta?.attemptId === "attempt-path");
    expect(currentOwner).toBeDefined();
    const owner = {
      ...currentOwner,
      id: currentOwner.id, role: "assistant", content: "", status: "done",
      createdAt: 2, updatedAt: 3,
      meta: { attemptId: "attempt-path", executionSessionId: chatId },
      traceFrames: [pending.presentation.trace_frame],
      subagentFrames: saved,
      subagentMetaByRunId: {
        [first.run_id]: { subagentId: "reviewer.1", template: "Reviewer", mode: "delegate", status: "running" },
        [secondRun]: { subagentId: "reviewer.2", template: "Reviewer", mode: "delegate", status: "running" },
      },
    };
    await act(async () => setChatMessages(chatId, prior.map((message) => message.id === owner.id ? owner : message), { source: "test" }));
    await waitFor(() => expect(lastChatMessagesProps.messages.find((m) => m.id === owner.id)?.subagentFrames?.[first.run_id]).toEqual(saved[first.run_id]));
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1));
    const handlers = window.unchainAPI.startStreamV4.mock.calls[0][1];
    const started = (event) => ({ ...event, event_id: `${event.event_id}-started`, type: "run.started", seq: 1, payload: {} });
    await act(async () => {
      sequence({ first, second, started }).forEach((event) => handlers.onRuntimeEvent(event));
      await new Promise((resolve) => setTimeout(resolve, 100));
      handlers.onDone({ status: "completed" });
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    return { chatId, ownerId: owner.id, first, second, saved };
  };

  test.each([
    ["terminal only", ({ first }) => [first]],
    ["started before the settlement", ({ first, started }) => [started(first), first]],
    ["a repeated started and settlement", ({ first, started }) => [started(first), first, started(first), first]],
    ["two children interleaved", ({ first, second, started }) => [started(first), started(second), second, first]],
    ["a settlement already saved from an earlier delivery", ({ first, started }) => [started(first), first], true],
  ])("#357 R-SETTLE-01: %s keeps saved child history and one settlement after reopen", async (_label, sequence, settlementAlreadySaved = false) => {
    const { chatId, ownerId, first, second, saved } = await resumeWithSavedChildren(sequence, { settlementAlreadySaved });
    // Cold reopen: read the chat store, not the live view.
    const stored = getChatMessages(chatId).find((message) => message.id === ownerId);
    const usedSecond = sequence({ first, second, started: (event) => event }).includes(second);
    [[first, saved[first.run_id]], ...(usedSecond ? [[second, saved[second.run_id]]] : [])].forEach(([event, history]) => {
      const frames = stored.subagentFrames[event.run_id];
      expect(frames.slice(0, history.length)).toEqual(history);
      expect(frames.filter((frame) => frame.payload?.settlement)).toHaveLength(1);
      expect(new Set(frames.map((frame) => frame.event_id)).size).toBe(frames.length);
    });
    // A child the resumed stream never mentioned keeps exactly its saved history.
    const untouched = usedSecond ? null : stored.subagentFrames[second.run_id];
    expect(untouched).toEqual(usedSecond ? null : saved[second.run_id]);
  });

  /* R-SETTLE-03: the actual desktop sparse child run.completed (status +
     settlement only) must not erase metadata the message saved for that
     child before the cold restart. Real before-message and real event from
     cold-settlement-desktop-03; only the chat/execution ids and the owner's
     attempt binding are rebound to this test chat (constructed). */
  const resumeWithSavedMetadata = async ({ withSavedMeta = true, mutateEvent = (event) => event } = {}) => {
    const { chatId, decision } = await prepareSettlementResume();
    const real = JSON.parse(JSON.stringify(coldMetadataFixture));
    const runId = real.source_run_id;
    const event = real.resume_runtime_event;
    event.session_id = chatId;
    for (const ref of [event.payload.settlement.consumer_attempt, event.payload.settlement.source_attempt]) {
      ref.generation.execution_id = chatId;
    }
    const prior = getChatMessages(chatId);
    const pending = await window.unchainAPI.getPendingInteraction();
    const currentOwner = prior.find((message) => message.role === "assistant" && message.meta?.attemptId === "attempt-path");
    expect(currentOwner).toBeDefined();
    const owner = {
      ...real.before_message,
      id: currentOwner.id,
      meta: { attemptId: "attempt-path", executionSessionId: chatId },
      // The harness's own paused interaction, so recovery resumes this message.
      traceFrames: [...real.before_message.traceFrames, pending.presentation.trace_frame],
      ...(withSavedMeta ? {} : { subagentMetaByRunId: {} }),
    };
    await act(async () => setChatMessages(chatId, prior.map((message) => message.id === owner.id ? owner : message), { source: "test" }));
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1));
    const handlers = window.unchainAPI.startStreamV4.mock.calls[0][1];
    await act(async () => {
      handlers.onRuntimeEvent(mutateEvent(event));
      await new Promise((resolve) => setTimeout(resolve, 100));
      handlers.onDone({ status: "completed" });
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    // Cold reopen: the chat store, not the live view.
    const stored = getChatMessages(chatId).find((message) => message.id === owner.id);
    return { stored, runId, saved: real.before_message.subagentMetaByRunId[runId], event };
  };

  test("#357 R-SETTLE-03: a sparse settlement keeps the child's saved metadata and updates only status", async () => {
    const { stored, runId, saved } = await resumeWithSavedMetadata();
    expect(saved).toEqual(expect.objectContaining({
      subagentId: "kernel.reviewer.1", mode: "delegate", template: "Reviewer",
      parentId: "kernel", lineage: ["kernel", "kernel.reviewer.1"], status: "running",
    }));
    expect(stored.subagentMetaByRunId[runId]).toEqual({ ...saved, status: "completed" });
    expect(stored.subagentFrames[runId].filter((frame) => frame.payload?.settlement)).toHaveLength(1);
  });

  test("#357 R-SETTLE-03: a child with no saved metadata still gets the existing defaults", async () => {
    const { stored, runId, event } = await resumeWithSavedMetadata({ withSavedMeta: false });
    expect(stored.subagentMetaByRunId[runId]).toEqual(expect.objectContaining({
      subagentId: runId, parentId: event.links.parent_run_id, status: "completed",
    }));
  });

  test("#357 R-SETTLE-03: fields the event explicitly provides still replace the saved ones", async () => {
    const { stored, runId, saved } = await resumeWithSavedMetadata({
      mutateEvent: (event) => ({
        ...event,
        agent_id: "kernel.reviewer.9",
        payload: { ...event.payload, mode: "handoff", template: "Auditor", parent_id: "kernel-2",
          lineage: ["kernel-2", "kernel.reviewer.9"] },
      }),
    });
    expect(stored.subagentMetaByRunId[runId]).toEqual({
      ...saved, subagentId: "kernel.reviewer.9", mode: "handoff", template: "Auditor",
      parentId: "kernel-2", lineage: ["kernel-2", "kernel.reviewer.9"], status: "completed",
    });
  });

  test("explicit answer to a live human-input request resumes once without sealing the receipt", async () => {
    const { chatId, interactionId, decision } = await prepareLiveHumanInput();
    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision(decision);
      await lastChatMessagesProps.onToolConfirmationDecision(decision);
    });
    await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(2));
    expect(window.unchainAPI.startStreamV4.mock.calls[1][0]).toEqual(expect.objectContaining({ threadId: chatId, owner_chat_id: chatId, interaction_id: interactionId, source_attempt_id: "attempt-path" }));
    expect(window.unchainAPI.startStreamV4.mock.calls[1][0]).not.toHaveProperty("stopped_attempts");
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(1);
    const legacyDecision = lastChatMessagesProps.messages
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.traceFrames || [])
      .find((frame) => frame.type === "tool_confirmed" && frame.payload?.confirmation_id === interactionId);
    expect(legacyDecision).toMatchObject({
      type: "tool_confirmed",
      run_id: "attempt-path",
      payload: {
        tool_name: "ask_user_question",
        call_id: "call-path",
        confirmation_id: interactionId,
        feedback_acknowledged: true,
        user_response: decision.userResponse,
      },
    });
    expect(legacyDecision).not.toHaveProperty("intent_cursor");
    expect(legacyDecision).not.toHaveProperty("execution_cursor");
    expect(legacyDecision.payload).not.toHaveProperty("call_ref");
    expect(legacyDecision.payload).not.toHaveProperty("call_ref_metadata");
  });

  test("a stale receipt projection cannot replace a newer live attempt's identity or history", async () => {
    const { chatId, interactionId, replacePending, decision } = await prepareLiveHumanInput();
    const recordReceipt = window.unchainAPI.respondToolConfirmation.getMockImplementation();
    window.unchainAPI.respondToolConfirmation.mockImplementation(async (...args) => {
      const response = await recordReceipt(...args);
      const receiptProjection = await window.unchainAPI.getPendingInteraction({ session_id: chatId });
      replacePending({
        ...receiptProjection,
        source_run_id: "attempt-older",
        active_attempt_id: "attempt-older",
        presentation: {
          ...receiptProjection.presentation,
          tool_call: {
            ...receiptProjection.presentation.tool_call,
            call_id: "call-stale-history",
            description: "Stale prior-run content",
          },
          trace_frame: {
            ...receiptProjection.presentation.trace_frame,
            run_id: "attempt-older",
            payload: {
              ...receiptProjection.presentation.trace_frame.payload,
              call_id: "call-stale-history",
            },
          },
        },
      });
      return response;
    });

    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));

    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
    expect(lastChatMessagesProps.pendingToolConfirmationRequests[interactionId]).toEqual(expect.objectContaining({
      callId: "call-path",
      runId: "attempt-path",
    }));
    expect(lastChatMessagesProps.messages.flatMap((message) => message.traceFrames || [])
      .some((frame) => frame.payload?.call_id === "call-stale-history")).toBe(false);

    await act(async () => lastChatInputProps.onStop());
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith(expect.objectContaining({
      attempt_id: "attempt-path",
      reason: "user_stop",
    }));
  });

  test("live human input callback does not start another stream", async () => {
    const { decision } = await prepareLiveHumanInput({ disposition: "live_continues" });
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
  });

  test.each([
    ["mismatched receipt", { mismatch: true }],
    ["unavailable resume", { resumeAvailable: false }],
  ])("%s cannot restart a live human answer", async (_name, options) => {
    const { decision } = await prepareLiveHumanInput(options);
    jest.useFakeTimers();
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    for (let index = 0; index < 4; index += 1) {
      await act(async () => { jest.advanceTimersByTime(5000); });
    }
    expect(lastChatInputProps.sendDisabled).toBe(true);
    expect((await window.unchainAPI.getPendingInteraction()).status).toBe("receipt_recorded");
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
  });

  test("passive lookup while a live answer POST is in flight cannot seal that answer", async () => {
    const { chatId, decision } = await prepareLiveHumanInput();
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
    await act(async () => { selectTreeNode({ nodeId: originalNodeId }, { source: "test" }); });
    await waitFor(() => {
      expect(document.querySelector("[data-chat-id]")?.getAttribute("data-chat-id")).toBe(chatId);
    });
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    await act(async () => { resolveReceipt(); await submission; });
    await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(2));
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
  });

  test.each(["root", "child"])("a new %s question after resume is sealed when that stream disconnects", async (branch) => {
    const { decision, replacePending } = await prepareLiveHumanInput();
    const next = JSON.parse(JSON.stringify(await window.unchainAPI.getPendingInteraction()));
    next.interaction_id = "interaction-next-path";
    for (const call of [next.presentation.tool_call, next.presentation.trace_frame.payload]) {
      call.call_id = "call-next-path";
      call.confirmation_id = next.interaction_id;
      call.arguments.request_id = "call-next-path";
      call.interact_config.request_id = "call-next-path";
    }
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    await waitFor(() => expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(2));
    const handlers = window.unchainAPI.startStreamV4.mock.calls[1][1];
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
    await waitFor(() => expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith(expect.objectContaining({
      interaction_id: next.interaction_id,
      reason: "interaction_suspended",
    })));
    expect(lastChatMessagesProps.pendingToolConfirmationRequests[next.interaction_id]).toBeUndefined();
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(2);
    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(1);
  });

  test("#384: Stop on a second child approval cancels that interaction and preserves the first completed answer", async () => {
    const interactionId = "interaction-path";
    const firstCompleted = {
      id: "assistant-first-answer-384",
      role: "assistant",
      content: "The first folder was selected.",
      status: "done",
      createdAt: 2,
      updatedAt: 3,
      traceFrames: [
        { seq: 1, ts: 2, run_id: "attempt-path", type: "tool_call", payload: {
          call_id: "call-path", confirmation_id: interactionId, requires_confirmation: true,
          tool_name: "ask_user_question", arguments: { question: "Where first?" },
        } },
        { seq: 2, ts: 3, run_id: "attempt-path", type: "tool_result", payload: {
          call_id: "call-path", result: { selected_values: ["/tmp/first"] },
        } },
      ],
    };
    const { chatId, decision, replacePending } = await prepareLiveHumanInput({ initialAssistant: firstCompleted });
    await waitFor(() => expect(lastChatMessagesProps.messages.some((message) => message.id === firstCompleted.id)).toBe(true));
    const savedFirstCompleted = firstCompleted;

    let resumedHandlers;
    window.unchainAPI.startStreamV4.mockImplementation((_payload, handlers) => {
      resumedHandlers = handlers;
      return { requestId: "resume-second-interaction", attemptId: "resume-second-interaction", disconnect: jest.fn(), cancel: jest.fn() };
    });
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    await waitFor(() => expect(resumedHandlers).not.toBeNull());
    const second = JSON.parse(JSON.stringify(await window.unchainAPI.getPendingInteraction()));
    second.interaction_id = "interaction-second-stop-384";
    for (const call of [second.presentation.tool_call, second.presentation.trace_frame.payload]) {
      call.call_id = "call-second-stop-384";
      call.confirmation_id = second.interaction_id;
      call.arguments.request_id = call.call_id;
      call.interact_config.request_id = call.call_id;
    }
    replacePending(second);
    window.unchainAPI.cancelExecution.mockClear();

    await act(async () => {
      resumedHandlers.onRuntimeEvent({
        schema_version: "v4", event_id: "event-second-run-started-384", type: "run.started",
        timestamp: "2026-10-02T00:00:00.000Z", session_id: chatId,
        run_id: "resume-second-interaction", agent_id: "developer",
        turn_id: "resume-second-interaction:turn-1", seq: 0,
        links: {}, surface: { slot: "trace_inline", scope: "turn" }, visibility: "user", metadata: {}, payload: {},
      });
      resumedHandlers.onRuntimeEvent({
        schema_version: "v4", event_id: "event-second-child-approval-384", type: "interaction.requested",
        timestamp: "2026-10-02T00:00:00.000Z", session_id: chatId,
        run_id: "worker-second-interaction", agent_id: "developer",
        turn_id: "resume-second-interaction:turn-1", seq: 1,
        links: { parent_run_id: "resume-second-interaction", interaction_id: second.interaction_id, tool_call_id: "call-second-stop-384" },
        surface: { slot: "trace_inline", scope: "turn" }, visibility: "user", metadata: {},
        payload: {
          interaction_id: second.interaction_id, kind: "choice", renderer: "single",
          title: "Folder", prompt: "Where next?", selection_mode: "single", options: [], allow_other: true,
          target: { tool_call_id: "call-second-stop-384", tool_name: "ask_user_question" },
          config: second.presentation.tool_call.interact_config,
        },
      });
    });

    await act(async () => lastChatInputProps.onStop());

    await waitFor(() => expect(window.unchainAPI.cancelExecution).toHaveBeenCalled());
    expect(window.unchainAPI.cancelExecution.mock.calls[0][0]).toEqual(expect.objectContaining({
      interaction_id: second.interaction_id,
      reason: "user_stop",
    }));
    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.respondToolConfirmation.mock.calls[0][0]).toEqual(expect.objectContaining({
      confirmation_id: interactionId,
    }));
    await waitFor(() => {
      expect(lastChatMessagesProps.pendingToolConfirmationRequests[second.interaction_id]).toBeUndefined();
      expect(lastChatMessagesProps.messages.find((message) => message.id === savedFirstCompleted.id)?.status).toBe("cancelled");
    });
    const afterStop = getChatMessages(chatId).find((message) => message.id === savedFirstCompleted.id);
    expect(afterStop.content).toBe(savedFirstCompleted.content);
    expect(afterStop.traceFrames.slice(0, 2)).toEqual(savedFirstCompleted.traceFrames.slice(0, 2));
    const retainedSecondCall = [
      ...(afterStop.traceFrames || []),
      ...Object.values(afterStop.subagentFrames || {}).flat(),
    ].some((frame) => frame.payload?.call_id === "call-second-stop-384");
    expect(retainedSecondCall).toBe(true);
  });

  test("a resume startup error preserves the receipt and exposes the failure without cancellation", async () => {
    const { decision } = await prepareLiveHumanInput();
    window.unchainAPI.startStreamV4.mockImplementation(() => { throw new Error("resume startup failed"); });
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    await waitFor(() => expect(lastChatInputProps.disclaimer).toContain("resume startup failed"));
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(2);
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    expect((await window.unchainAPI.getPendingInteraction()).status).toBe("receipt_recorded");
  });

  test("Stop while the answer is being recorded prevents the late receipt from resuming", async () => {
    const { decision } = await prepareLiveHumanInput();
    const record = window.unchainAPI.respondToolConfirmation.getMockImplementation();
    let resolveReceipt;
    window.unchainAPI.respondToolConfirmation.mockImplementation(() => new Promise((resolve) => { resolveReceipt = resolve; }));
    let submission;
    await act(async () => { submission = lastChatMessagesProps.onToolConfirmationDecision(decision); });
    await act(async () => lastChatInputProps.onStop());
    await act(async () => { resolveReceipt(await record()); await submission; });
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
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
    expect(lastChatMessagesProps.messages
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.traceFrames || [])
      .some((frame) => frame.payload?.feedback_acknowledged === true)).toBe(false);
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision(decision));
    expect(lastChatMessagesProps.toolConfirmationUiStateById["live-confirmation"].resolved).toBe(true);
    const calls = window.unchainAPI.respondToolConfirmation.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toEqual(calls[1][0]);
  });

  test("same call_id requests keep both source frames and acknowledge only the uniquely bound owner", async () => {
    renderChat();
    await waitForReady();
    sendText("run two attempts");
    await waitFor(() => expect(streamHandlers).not.toBeNull());

    const first = makeQualifiedToolFrame({
      confirmationId: "confirm-one",
      callId: "reused-call-id",
      attemptId: "attempt-one",
      eventId: "intent-one",
      args: { command: "first" },
    });
    const second = makeQualifiedToolFrame({
      confirmationId: "confirm-two",
      callId: "reused-call-id",
      attemptId: "attempt-two",
      eventId: "intent-two",
      args: { command: "second" },
    });
    first.session_id = "frame-session-one";
    first.event_cursor = first.payload.call_ref.intent_cursor;
    first.event_id = "intent-one";
    first.links = { interaction_id: "confirm-one", call_id: "reused-call-id" };
    delete first.payload.toolkit_id;
    first.payload.timeline_merge_policy = "approved";
    expect(resolveToolCallOwnerForRequest([first, second], "confirm-one").status)
      .toBe("qualified");
    await act(async () => streamHandlers.onFrame(first));
    await act(async () => streamHandlers.onFrame(second));

    const sourceFrames = () => lastChatMessagesProps.messages
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.traceFrames || []);
    await waitFor(() => {
      expect(sourceFrames().filter((frame) => frame.type === "tool_call")).toHaveLength(2);
    });
    expect(resolveToolCallOwnerForRequest(sourceFrames(), "confirm-one").status)
      .toBe("qualified");
    await waitFor(() => {
      expect(lastChatMessagesProps.pendingToolConfirmationRequests["confirm-one"]).toBeDefined();
    });
    const pendingRequest =
      lastChatMessagesProps.pendingToolConfirmationRequests["confirm-one"];
    expect(pendingRequest).toMatchObject({
      runId: first.run_id,
      run_id: first.run_id,
      executionId: first.execution_id,
      execution_id: first.execution_id,
      sessionId: getChatsStore().activeChatId,
      session_id: first.session_id,
      eventCursor: first.event_cursor,
      event_cursor: first.event_cursor,
      eventId: first.event_id,
      event_id: first.event_id,
      iteration: first.iteration,
      links: first.links,
      callRef: first.payload.call_ref,
      callRefMetadata: first.payload.call_ref_metadata,
      timelineMergePolicy: "approved",
    });
    expect(Object.prototype.hasOwnProperty.call(pendingRequest, "toolkitId"))
      .toBe(false);
    const merged = mergePendingConfirmationTraceState({
      frames: sourceFrames(),
      requests: { "confirm-one": pendingRequest },
    });
    expect(merged.frames).toHaveLength(2);
    expect(merged.frames.map((frame) => frame.payload?.confirmation_id))
      .toEqual(["confirm-one", "confirm-two"]);
    expect(merged.frames[0].payload.call_ref).toEqual(first.payload.call_ref);
    expect(window.unchainAPI.respondToolConfirmation).not.toHaveBeenCalled();

    window.unchainAPI.respondToolConfirmation.mockResolvedValue({
      status: "ok",
      durable: false,
      disposition: "live_only",
      interaction_id: "confirm-one",
    });
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision({
      confirmationId: "confirm-one",
      approved: true,
    }));
    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalled();
    expect(lastChatMessagesProps.toolConfirmationUiStateById["confirm-one"]?.status)
      .toBe("submitted");

    await waitFor(() => {
      const frames = sourceFrames();
      const decisions = frames.filter((frame) => frame.type === "tool_confirmed");
      expect(decisions).toHaveLength(1);
      expect(decisions[0].payload.confirmation_id).toBe("confirm-one");
      expect(decisions[0].payload.feedback_acknowledged).toBe(true);
      expect(decisions[0].payload.call_ref).toEqual(first.payload.call_ref);
      expect(decisions[0].payload.call_ref_metadata).toEqual(first.payload.call_ref_metadata);
      expect(decisions[0].run_id).toBe("attempt-one");
      expect(decisions[0].iteration).toBe(2);
      expect(frames.filter((frame) => frame.type === "tool_call")).toEqual([first, second]);
    });
  });

  test("a malformed explicit call_ref remains visible and never gets synthetic acknowledged feedback", async () => {
    renderChat();
    await waitForReady();
    sendText("run a malformed-reference call");
    await waitFor(() => expect(streamHandlers).not.toBeNull());

    const malformed = makeQualifiedToolFrame({
      confirmationId: "confirm-malformed",
      callId: "malformed-call",
      attemptId: "attempt-one",
      eventId: "intent-malformed",
      args: { command: "preserve evidence" },
    });
    malformed.payload.call_ref = { ...malformed.payload.call_ref, unexpected: true };
    await act(async () => streamHandlers.onFrame(malformed));
    await waitFor(() => {
      expect(lastChatMessagesProps.pendingToolConfirmationRequests["confirm-malformed"])
        .toBeDefined();
    });

    window.unchainAPI.respondToolConfirmation.mockResolvedValue({
      status: "ok",
      durable: false,
      disposition: "live_only",
      interaction_id: "confirm-malformed",
    });
    await act(async () => lastChatMessagesProps.onToolConfirmationDecision({
      confirmationId: "confirm-malformed",
      approved: true,
    }));

    const frames = lastChatMessagesProps.messages
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.traceFrames || []);
    expect(frames.find((frame) => frame.type === "tool_call")?.payload.call_ref)
      .toEqual(malformed.payload.call_ref);
    expect(frames.some((frame) => frame.type === "tool_confirmed" &&
      frame.payload?.confirmation_id === "confirm-malformed")).toBe(false);
    expect(frames.some((frame) => frame.payload?.feedback_acknowledged === true)).toBe(false);
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

  test("old Stop outbox refetch matches a graph-step interaction to its coordinator attempt", async () => {
    const chatId = getChatsStore().activeChatId;
    const coordinatorAttemptId = "unchain-coordinator-attempt";
    const graphStepAttemptId = "graph-step-attempt";
    const interactionId = "graph-step-interaction";
    const pending = pendingGraphStepInteraction(
      chatId,
      graphStepAttemptId,
      coordinatorAttemptId,
      interactionId,
    );
    expect(normalizePendingInteraction(pending, chatId)).toEqual(expect.objectContaining({
      status: "awaiting_response",
      sourceRunId: graphStepAttemptId,
      activeAttemptId: graphStepAttemptId,
      resumeKind: "graph_step",
      graphStepAttemptId,
      graphCoordinatorAttemptId: coordinatorAttemptId,
    }));

    enqueueExecutionCancel({
      ownerChatId: chatId,
      sessionId: chatId,
      attemptId: coordinatorAttemptId,
    });
    window.unchainAPI.getPendingInteraction = jest.fn(async () => pending);
    window.unchainAPI.cancelExecution = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error("interaction_cancel_target_required"), {
        code: "interaction_cancel_target_required",
      }))
      .mockImplementation(async (payload) => ({
        status: "ok",
        execution_id: payload.session_id,
        attempt_id: payload.attempt_id,
        state: "cancelled",
      }));

    const rendered = renderChat();
    await waitFor(() => expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(2));
    expect(window.unchainAPI.cancelExecution.mock.calls[1][0]).toEqual({
      owner_chat_id: chatId,
      session_id: chatId,
      attempt_id: coordinatorAttemptId,
      interaction_id: interactionId,
      reason: "user_stop",
      idempotency_key: `stop:${coordinatorAttemptId}`,
    });
    await waitFor(() => expect(readExecutionCancelOutbox()).toEqual([]));
    rendered.unmount();
  });

  test.each([
    ["wrong coordinator", { graphCoordinatorAttemptId: "foreign-coordinator-attempt" }],
    ["graph step/source mismatch", { graphStepAttemptId: "foreign-graph-step" }],
    ["wrong session", { sessionId: "foreign-session" }],
  ])("old Stop outbox blocks a graph-step interaction with %s lineage", async (_label, mismatch) => {
    const chatId = getChatsStore().activeChatId;
    const coordinatorAttemptId = "unchain-coordinator-attempt";
    const graphStepAttemptId = "graph-step-attempt";
    const pending = pendingGraphStepInteraction(
      mismatch.sessionId || chatId,
      graphStepAttemptId,
      coordinatorAttemptId,
      "graph-step-interaction",
    );
    if (mismatch.graphCoordinatorAttemptId) {
      pending.graph_coordinator_attempt_id = mismatch.graphCoordinatorAttemptId;
      expect(normalizePendingInteraction(pending, chatId)).not.toBeNull();
    }
    if (mismatch.graphStepAttemptId) {
      pending.graph_step_attempt_id = mismatch.graphStepAttemptId;
      expect(normalizePendingInteraction(pending, chatId)).toBeNull();
    }
    if (mismatch.sessionId) {
      expect(normalizePendingInteraction(pending, chatId)).toBeNull();
    }

    enqueueExecutionCancel({
      ownerChatId: chatId,
      sessionId: chatId,
      attemptId: coordinatorAttemptId,
    });
    window.unchainAPI.getPendingInteraction = jest.fn(async () => pending);
    window.unchainAPI.cancelExecution = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error("interaction_cancel_target_required"), {
        code: "interaction_cancel_target_required",
      }))
      .mockImplementation(async (payload) => ({
        status: "ok",
        execution_id: payload.session_id,
        attempt_id: payload.attempt_id,
        state: "cancelled",
      }));

    const rendered = renderChat();
    if (mismatch.sessionId) {
      await waitFor(() => expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalled());
    } else {
      await waitFor(() => expect(readExecutionCancelOutbox()[0]?.retryBlocked).toBe(true));
    }
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.cancelExecution.mock.calls[0][0]).toEqual(expect.objectContaining({
      session_id: chatId,
      attempt_id: coordinatorAttemptId,
    }));
    expect(window.unchainAPI.cancelExecution.mock.calls.some(
      ([payload]) => payload.interaction_id === "graph-step-interaction",
    )).toBe(false);
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
    expect(lastChatInputProps.disclaimer).not.toContain("Stop failed; try again");
    expect(lastChatInputProps.isStreaming).toBe(false);
    rendered.unmount();
    const reopened = renderChat();
    await act(async () => { jest.advanceTimersByTime(20000); });
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(3);
    expect(lastChatInputProps.disclaimer).not.toContain("Stop failed; try again");
    expect(lastChatInputProps.isStreaming).toBe(false);
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
