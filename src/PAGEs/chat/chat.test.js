import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  LocaleContext,
  NavigationContext,
  ThemeContext,
} from "../../CONTAINERs/config/context";
import ChatInterface from "./chat";
import {
  createChatInSelectedContext,
  getChatsStore,
  openCharacterChat,
  selectTreeNode,
  setChatMessages,
  setChatModel,
  setChatSelectedToolkits,
} from "../../SERVICEs/chat_storage";
import { readTokenUsageRecords } from "../../COMPONENTs/settings/token_usage/storage";
import { dispatchComposerPrefill } from "../../SERVICEs/composer_prefill";
import * as bootProgress from "../../SERVICEs/boot_progress";

let lastChatMessagesProps = null;
let lastChatInputProps = null;
var mockScopedLogger;

jest.mock("../../SERVICEs/boot_progress", () => ({
  __esModule: true,
  set: jest.fn(),
  release: jest.fn(),
  signalReady: jest.fn(),
}));

jest.mock("../../SERVICEs/console_logger", () => ({
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

jest.mock("../../COMPONENTs/chat-messages/chat_messages", () => ({
  __esModule: true,
  default: (props) => {
    lastChatMessagesProps = props;
    const { messages = [], pendingContinuationRequest } = props;
    return (
      <div data-testid="chat-messages">
        {messages.map((message) => (
          <div key={message.id || `${message.role}-${message.content}`}>
            {message.role}:{message.content}:{message.status || "done"}
          </div>
        ))}
        {pendingContinuationRequest && (
          <div>
            Agent reached {pendingContinuationRequest.iteration} iterations
            without a final response. Continue?
          </div>
        )}
      </div>
    );
  },
}));

jest.mock("../../COMPONENTs/chat-input/chat_input", () => ({
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
        <button data-testid="send-button" onClick={onSend} disabled={sendDisabled}>
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

describe("ChatInterface stop flow", () => {
  let cancelSpy;
  let consoleErrorSpy;
  let streamHandlers;
  let streamV4Handlers;

  beforeEach(() => {
    window.localStorage.clear();
    lastChatMessagesProps = null;
    lastChatInputProps = null;
    cancelSpy = jest.fn();
    streamHandlers = null;
    streamV4Handlers = null;
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockScopedLogger.log.mockClear();
    mockScopedLogger.warn.mockClear();
    mockScopedLogger.error.mockClear();
    mockScopedLogger.debug.mockClear();
    bootProgress.set.mockClear();
    bootProgress.release.mockClear();
    bootProgress.signalReady.mockClear();
    window.unchainAPI = {
      getStatus: jest.fn(async () => ({
        status: "ready",
        ready: true,
        url: "http://localhost:3000",
        reason: "",
      })),
      getModelCatalog: jest.fn(async () => ({
        activeModel: "openai:gpt-5",
        providers: {
          openai: ["gpt-5"],
          ollama: [],
          anthropic: [],
        },
        model_capabilities: {},
      })),
      startStream: jest.fn(),
      startStreamV2: jest.fn((_payload, handlers = {}) => {
        streamHandlers = handlers;
        return {
          cancel: cancelSpy,
        };
      }),
      replaceSessionMemory: jest.fn(async () => ({ applied: true })),
      buildCharacterAgentConfig: jest.fn(async () => ({
        session_id: "character_nico__dm__main",
        run_memory_namespace: "character_nico__rel__local_user",
        default_model: "openai:gpt-4.1",
        instructions: "You are Nico.",
        decision: { action: "reply", courtesy_message: null },
      })),
      cancelStream: jest.fn(),
      cancelExecution: jest.fn(async () => ({ status: "cancel_requested" })),
      getPendingInteraction: jest.fn(async ({ session_id: sessionId } = {}) => ({
        status: "none",
        session_id: sessionId || "",
      })),
      respondToolConfirmation: jest.fn(async () => ({ status: "ok" })),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.unchainAPI;
  });

  const renderChatWithFragment = (onFragment = "main") =>
    render(
      <ThemeContext.Provider
        value={{
          theme: {},
          onThemeMode: "light_mode",
        }}
      >
        <NavigationContext.Provider
          value={{ onFragment, setOnFragment: jest.fn() }}
        >
          <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
            <ChatInterface />
          </LocaleContext.Provider>
        </NavigationContext.Provider>
      </ThemeContext.Provider>,
    );

  const renderChat = () => renderChatWithFragment("main");

  const waitForReady = async () => {
    await waitFor(() => {
      expect(window.unchainAPI.getStatus).toHaveBeenCalled();
      expect(window.unchainAPI.getModelCatalog).toHaveBeenCalled();
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    });
  };

  const waitForBoot = async () => {
    await waitFor(() => {
      expect(window.unchainAPI.getStatus).toHaveBeenCalled();
      expect(window.unchainAPI.getModelCatalog).toHaveBeenCalled();
    });
  };

  test("boot-loading gate: marks store hydration at 80% and signals ready exactly once on mount (S2->S3)", async () => {
    renderChat();

    // bootstrapChatsStore() hydration runs synchronously in the mount-time
    // useState initializer, and the signalReady effect fires on the same
    // mount — both land before any awaiting is needed.
    expect(bootProgress.set).toHaveBeenCalledWith(80);
    expect(bootProgress.signalReady).toHaveBeenCalledTimes(1);

    await waitForBoot();

    // Re-renders triggered by boot completing (model catalog, unchain
    // status) must not call signalReady() again — it is a one-time effect.
    expect(bootProgress.signalReady).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "hello" },
    });
    expect(bootProgress.signalReady).toHaveBeenCalledTimes(1);
  });

  const buildPendingInteraction = ({
    sessionId,
    status = "awaiting_response",
    interactionId = "interaction-1",
    callId = "call-1",
    sourceRunId = `attempt-${interactionId}`,
    activeAttemptId = sourceRunId,
  }) => {
    const toolCall = {
      call_id: callId,
      confirmation_id: interactionId,
      requires_confirmation: true,
      toolkit_id: "core",
      toolkit_name: "Core",
      tool_name: "shell",
      tool_display_name: "Shell",
      arguments: {
        action: "run",
        command: "npm install",
      },
      description: "Run npm install",
      interact_type: "confirmation",
      interact_config: {},
    };

    return {
      status,
      session_id: sessionId,
      interaction_id: interactionId,
      source_run_id: sourceRunId,
      active_attempt_id: activeAttemptId,
      kind: "tool_approval",
      presentation: {
        trace_frame: {
          seq: 0,
          ts: 100,
          type: "tool_call",
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
      ...(status === "receipt_recorded"
        ? {
            receipt_id: `receipt-${interactionId}`,
            resolution: {
              outcome: "approved",
              response: {
                approved: true,
                reason: "",
              },
            },
          }
        : {}),
    };
  };

  const installDurableBridge = ({ resolvePending }) => {
    const runs = [];
    window.unchainAPI.getPendingInteraction = jest.fn(
      async ({ session_id: sessionId } = {}) =>
        (await resolvePending(sessionId)) || {
          status: "none",
          session_id: sessionId || "",
        },
    );
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      const attemptId = `attempt-v4-${runs.length + 1}`;
      const run = {
        payload,
        handlers,
        attemptId,
        cancel: jest.fn(),
      };
      runs.push(run);
      return {
        requestId: attemptId,
        attemptId,
        disconnect: run.cancel,
        cancel: run.cancel,
      };
    });

    return {
      runs,
      resumeRuns: () =>
        runs.filter((run) => run.payload?.mode === "resume_interaction"),
    };
  };

  const seedActiveChatMessages = (messages) => {
    const store = getChatsStore();
    const chatId = store.activeChatId;
    setChatMessages(chatId, messages, { source: "test" });
    return chatId;
  };

  const findConfirmationFrames = (messages, confirmationId) =>
    (messages || []).flatMap((message) =>
      (message.traceFrames || [])
        .filter(
          (frame) =>
            frame?.payload?.confirmation_id === confirmationId,
        )
        .map((frame) => ({ message, frame })),
    );

  const completeAssistantReply = async (content) => {
    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: Date.now(),
        type: "final_message",
        payload: {
          content,
        },
      });
      streamHandlers.onDone({});
    });

    await waitFor(() => {
      const assistantMessage = [...(lastChatMessagesProps?.messages || [])]
        .reverse()
        .find((message) => message.role === "assistant");
      expect(assistantMessage?.status).toBe("done");
      expect(assistantMessage?.content).toBe(content);
    });
  };

  const sendTurn = async (userContent, assistantContent) => {
    const nextCallCount = window.unchainAPI.startStreamV2.mock.calls.length + 1;
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: userContent },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(nextCallCount);
      expect(streamHandlers).toBeTruthy();
    });

    await completeAssistantReply(assistantContent);
  };

  test("stopping a stream removes empty assistant placeholders without render-phase warnings", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Hello from test" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("stop-button"));

    await waitFor(() => {
      const store = getChatsStore();
      const activeChat = store.chatsById[store.activeChatId];
      expect(activeChat.messages).toEqual([
        expect.objectContaining({
          role: "user",
          content: "Hello from test",
        }),
      ]);
    });

    expect(cancelSpy).toHaveBeenCalledTimes(1);

    const hasRenderPhaseWarning = consoleErrorSpy.mock.calls.some((call) =>
      call.some(
        (arg) =>
          typeof arg === "string" &&
          arg.includes(
            "Cannot update a component (`SideMenu`) while rendering a different component (`ChatInterface`)",
          ),
      ),
    );
    expect(hasRenderPhaseWarning).toBe(false);
  });

  test("stopping a V4 run cancels the exact backend attempt before disconnecting transport", async () => {
    let resolveCancellation;
    const disconnectSpy = jest.fn();
    window.unchainAPI.cancelExecution = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveCancellation = resolve;
        }),
    );
    window.unchainAPI.startStreamV4 = jest.fn((_payload, handlers = {}) => {
      streamV4Handlers = handlers;
      return {
        requestId: "attempt-v4-1",
        attemptId: "attempt-v4-1",
        disconnect: disconnectSpy,
        cancel: disconnectSpy,
      };
    });

    renderChat();
    await waitForReady();
    const activeChatId = getChatsStore().activeChatId;

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Long task" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("stop-button"));

    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
        session_id: activeChatId,
        attempt_id: "attempt-v4-1",
        request_id: "attempt-v4-1",
        reason: "user_stop",
        idempotency_key: "stop:attempt-v4-1",
      });
    });
    expect(disconnectSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolveCancellation({
        status: "cancelled",
        session_id: activeChatId,
        attempt_id: "attempt-v4-1",
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });
  });

  test("a failed V4 cancellation retries the old attempt without disconnecting a newer attempt", async () => {
    jest.useFakeTimers();
    const oldDisconnectSpy = jest.fn();
    const newDisconnectSpy = jest.fn();
    window.unchainAPI.cancelExecution = jest
      .fn()
      .mockRejectedValueOnce(new Error("sidecar restarting"))
      .mockResolvedValueOnce({ status: "ok", state: "cancelled" });
    window.unchainAPI.startStreamV4 = jest
      .fn()
      .mockImplementationOnce(() => ({
        requestId: "attempt-v4-retry",
        attemptId: "attempt-v4-retry",
        disconnect: oldDisconnectSpy,
        cancel: oldDisconnectSpy,
      }))
      .mockImplementationOnce(() => ({
        requestId: "attempt-v4-new",
        attemptId: "attempt-v4-new",
        disconnect: newDisconnectSpy,
        cancel: newDisconnectSpy,
      }));

    try {
      renderChat();
      await waitForReady();
      const activeChatId = getChatsStore().activeChatId;
      fireEvent.change(screen.getByTestId("chat-input"), {
        target: { value: "Retry my Stop" },
      });
      fireEvent.click(screen.getByTestId("send-button"));
      await waitFor(() => {
        expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
      });

      fireEvent.click(screen.getByTestId("stop-button"));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
      expect(oldDisconnectSpy).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(lastChatInputProps?.sendDisabled).toBe(false);
      });
      fireEvent.change(screen.getByTestId("chat-input"), {
        target: { value: "Keep the new attempt running" },
      });
      fireEvent.click(screen.getByTestId("send-button"));
      await waitFor(() => {
        expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId("stop-button")).toBeInTheDocument();
      });

      await act(async () => {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(2);
      expect(window.unchainAPI.cancelExecution).toHaveBeenNthCalledWith(2, {
        session_id: activeChatId,
        attempt_id: "attempt-v4-retry",
        request_id: "attempt-v4-retry",
        reason: "user_stop",
        idempotency_key: "stop:attempt-v4-retry",
      });
      expect(oldDisconnectSpy).toHaveBeenCalledTimes(1);
      expect(newDisconnectSpy).not.toHaveBeenCalled();
      expect(
        JSON.parse(
          window.localStorage.getItem("pupu.execution_cancel_outbox.v1") ||
            "[]",
        ),
      ).toEqual([]);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test("isolates concurrent V4 token, subagent, Stop, and late-callback state by chat", async () => {
    const originalRaf = window.requestAnimationFrame;
    const originalCancelRaf = window.cancelAnimationFrame;
    const rafCallbacks = new Map();
    let rafIdSeed = 0;
    let eventSeq = 0;
    const runs = [];

    window.requestAnimationFrame = jest.fn((callback) => {
      rafIdSeed += 1;
      rafCallbacks.set(rafIdSeed, callback);
      return rafIdSeed;
    });
    window.cancelAnimationFrame = jest.fn((id) => {
      rafCallbacks.delete(id);
    });
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      const attemptId = `attempt-${payload.threadId}`;
      const run = {
        payload,
        handlers,
        attemptId,
        disconnect: jest.fn(),
      };
      runs.push(run);
      return {
        requestId: attemptId,
        attemptId,
        disconnect: run.disconnect,
        cancel: run.disconnect,
      };
    });

    const buildRuntimeEvent = ({
      chatId,
      runId,
      eventId,
      type,
      payload = {},
      links = {},
      agentId = "developer",
    }) => ({
      schema_version: "v4",
      event_id: eventId,
      seq: ++eventSeq,
      type,
      timestamp: "2026-07-15T12:00:00.000Z",
      session_id: chatId,
      run_id: runId,
      agent_id: agentId,
      turn_id: `${runId}:turn-1`,
      links,
      surface: { slot: "trace_inline", scope: "turn" },
      visibility: "user",
      metadata: {},
      payload,
    });
    const emitRuntimeEvents = async (run, events, delayMs = 90) => {
      act(() => {
        events.forEach((event) => run.handlers.onRuntimeEvent(event));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      });
    };
    const flushPendingAnimationFrames = () => {
      act(() => {
        const callbacks = Array.from(rafCallbacks.values());
        rafCallbacks.clear();
        callbacks.forEach((callback) => callback(16));
      });
    };
    const latestAssistant = () =>
      [...(lastChatMessagesProps?.messages || [])]
        .reverse()
        .find((message) => message.role === "assistant");
    const activeStreamingText = () => {
      const assistant = latestAssistant();
      return lastChatMessagesProps?.streamingMessageStore?.getText({
        chatId: lastChatMessagesProps.chatId,
        messageId: assistant?.id,
      });
    };

    try {
      const chatAId = seedActiveChatMessages([
        {
          id: "user-a-seed-v4",
          role: "user",
          content: "Seed chat A",
          createdAt: 1,
          updatedAt: 1,
        },
      ]);
      const chatANodeId = getChatsStore().tree.selectedNodeId;
      setChatModel(chatAId, { id: "openai:gpt-5" }, { source: "test" });
      const createdB = createChatInSelectedContext(
        { title: "Chat B V4" },
        { source: "test" },
      );
      setChatMessages(
        createdB.chatId,
        [
          {
            id: "user-b-seed-v4",
            role: "user",
            content: "Seed chat B",
            createdAt: 2,
            updatedAt: 2,
          },
        ],
        { source: "test" },
      );
      setChatModel(
        createdB.chatId,
        { id: "openai:gpt-5" },
        { source: "test" },
      );
      selectTreeNode({ nodeId: chatANodeId }, { source: "test" });

      renderChat();
      await waitForReady();

      fireEvent.change(screen.getByTestId("chat-input"), {
        target: { value: "Run chat A" },
      });
      fireEvent.click(screen.getByTestId("send-button"));
      await waitFor(() => {
        expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
      });
      const runA = runs[0];
      const rootRunA = "run-a-root";
      const childRunA = "run-a-child";
      await emitRuntimeEvents(runA, [
        buildRuntimeEvent({
          chatId: chatAId,
          runId: rootRunA,
          eventId: "evt-a-root",
          type: "run.started",
          payload: { status: "running" },
        }),
        buildRuntimeEvent({
          chatId: chatAId,
          runId: childRunA,
          eventId: "evt-a-child-start",
          type: "run.started",
          links: { parent_run_id: rootRunA },
          agentId: "developer.analyzer.a",
          payload: {
            status: "running",
            mode: "delegate",
            template: "analyzer",
            parent_id: "developer",
          },
        }),
        buildRuntimeEvent({
          chatId: chatAId,
          runId: childRunA,
          eventId: "evt-a-child-done",
          type: "run.completed",
          links: { parent_run_id: rootRunA },
          agentId: "developer.analyzer.a",
          payload: { status: "completed" },
        }),
        buildRuntimeEvent({
          chatId: chatAId,
          runId: rootRunA,
          eventId: "evt-a-token",
          type: "step.delta",
          payload: {
            step_id: "model:a:response",
            step_type: "model_response",
            kind: "text",
            delta: "A token",
          },
        }),
      ]);
      expect(rafCallbacks.size).toBeGreaterThan(0);

      act(() => {
        selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
      });
      await waitFor(() => {
        expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
        expect(lastChatInputProps?.sendDisabled).toBe(false);
      });
      fireEvent.change(screen.getByTestId("chat-input"), {
        target: { value: "Run chat B" },
      });
      fireEvent.click(screen.getByTestId("send-button"));
      await waitFor(() => {
        expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(2);
      });
      const runB = runs[1];
      expect(rafCallbacks.size).toBeGreaterThan(0);

      const rootRunB = "run-b-root";
      const childRunB = "run-b-child";
      await emitRuntimeEvents(runB, [
        buildRuntimeEvent({
          chatId: createdB.chatId,
          runId: rootRunB,
          eventId: "evt-b-root",
          type: "run.started",
          payload: { status: "running" },
        }),
        buildRuntimeEvent({
          chatId: createdB.chatId,
          runId: childRunB,
          eventId: "evt-b-child-start",
          type: "run.started",
          links: { parent_run_id: rootRunB },
          agentId: "developer.analyzer.b",
          payload: {
            status: "running",
            mode: "delegate",
            template: "analyzer",
            parent_id: "developer",
          },
        }),
        buildRuntimeEvent({
          chatId: createdB.chatId,
          runId: childRunB,
          eventId: "evt-b-child-done",
          type: "run.completed",
          links: { parent_run_id: rootRunB },
          agentId: "developer.analyzer.b",
          payload: { status: "completed" },
        }),
        buildRuntimeEvent({
          chatId: createdB.chatId,
          runId: rootRunB,
          eventId: "evt-b-token",
          type: "step.delta",
          payload: {
            step_id: "model:b:response",
            step_type: "model_response",
            kind: "text",
            delta: "B token",
          },
        }),
      ]);
      expect(rafCallbacks.size).toBeGreaterThan(0);

      await emitRuntimeEvents(
        runA,
        [
          buildRuntimeEvent({
            chatId: chatAId,
            runId: rootRunA,
            eventId: "evt-a-root-tool",
            type: "step.started",
            links: { tool_call_id: "call-a-root" },
            payload: {
              step_id: "tool:a:root",
              step_type: "tool",
              call_id: "call-a-root",
              tool_name: "shell",
              arguments: { command: "pwd" },
            },
          }),
        ],
        180,
      );

      act(() => {
        selectTreeNode({ nodeId: chatANodeId }, { source: "test" });
      });
      await waitFor(() => {
        expect(lastChatMessagesProps?.chatId).toBe(chatAId);
        expect(latestAssistant()?.subagentMetaByRunId?.[childRunA]).toEqual(
          expect.objectContaining({ status: "completed" }),
        );
        expect(latestAssistant()?.subagentMetaByRunId?.[rootRunA]).toBeUndefined();
        expect(latestAssistant()?.subagentMetaByRunId?.[childRunB]).toBeUndefined();
      });

      fireEvent.click(screen.getByTestId("stop-button"));
      await waitFor(() => {
        expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
          session_id: chatAId,
          attempt_id: runA.attemptId,
          request_id: runA.attemptId,
          reason: "user_stop",
          idempotency_key: `stop:${runA.attemptId}`,
        });
        expect(runA.disconnect).toHaveBeenCalledTimes(1);
      });
      expect(runB.disconnect).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(latestAssistant()).toEqual(
          expect.objectContaining({ content: "A token", status: "cancelled" }),
        );
      });

      act(() => {
        selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
      });
      await waitFor(() => {
        expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
        expect(screen.getByTestId("stop-button")).toBeInTheDocument();
        expect(activeStreamingText()).toBe("");
      });
      flushPendingAnimationFrames();
      await waitFor(() => {
        expect(activeStreamingText()).toBe("B token");
        expect(latestAssistant()?.subagentMetaByRunId?.[childRunB]).toEqual(
          expect.objectContaining({ status: "completed" }),
        );
        expect(latestAssistant()?.subagentMetaByRunId?.[childRunA]).toBeUndefined();
      });

      act(() => {
        runA.handlers.onRuntimeEvent(
          buildRuntimeEvent({
            chatId: chatAId,
            runId: rootRunA,
            eventId: "evt-a-late-token",
            type: "step.delta",
            payload: {
              step_id: "model:a:late",
              step_type: "model_response",
              kind: "text",
              delta: " late A",
            },
          }),
        );
        runA.handlers.onError({
          code: "late_a_error",
          message: "late A transport error",
        });
        runA.handlers.onDone({});
      });
      await emitRuntimeEvents(runB, [
        buildRuntimeEvent({
          chatId: createdB.chatId,
          runId: rootRunB,
          eventId: "evt-b-continues",
          type: "step.delta",
          payload: {
            step_id: "model:b:response",
            step_type: "model_response",
            kind: "text",
            delta: " B continues",
          },
        }),
      ]);
      expect(rafCallbacks.size).toBeGreaterThan(0);
      flushPendingAnimationFrames();
      await waitFor(() => {
        expect(activeStreamingText()).toBe("B token B continues");
        expect(runB.disconnect).not.toHaveBeenCalled();
      });

      act(() => {
        selectTreeNode({ nodeId: chatANodeId }, { source: "test" });
      });
      await waitFor(() => {
        expect(lastChatMessagesProps?.chatId).toBe(chatAId);
        expect(latestAssistant()).toEqual(
          expect.objectContaining({ content: "A token", status: "cancelled" }),
        );
        expect(latestAssistant()?.content).not.toContain("late A");
        expect(latestAssistant()?.subagentMetaByRunId?.[rootRunA]).toBeUndefined();
      });
    } finally {
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCancelRaf;
    }
  });

  test("late callbacks from a stopped run do not affect the next explicit turn", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "First turn" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
    });
    const firstRunHandlers = streamHandlers;

    fireEvent.click(screen.getByTestId("stop-button"));
    await waitFor(() => {
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Second turn" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
    });
    const secondRunHandlers = streamHandlers;
    expect(secondRunHandlers).not.toBe(firstRunHandlers);

    act(() => {
      firstRunHandlers.onError({
        code: "late_stream_error",
        message: "the stopped transport reported an error late",
      });
      firstRunHandlers.onDone({});
    });

    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("stop-button")).toBeInTheDocument();

    await completeAssistantReply("Second reply");

    const currentMessages = lastChatMessagesProps?.messages || [];
    expect(
      currentMessages
        .filter((message) => message.role === "user")
        .map((message) => message.content),
    ).toEqual(["First turn", "Second turn"]);
    expect(
      currentMessages
        .filter((message) => message.role === "assistant")
        .map(({ content, status }) => ({ content, status })),
    ).toEqual([{ content: "Second reply", status: "done" }]);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  test("stopping while an interject is pending ignores a late new-run result", async () => {
    let resolveInterject;
    window.unchainAPI.interject = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveInterject = resolve;
        }),
    );

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Keep this run open" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "A deferred follow-up" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.interject).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId("stop-button"));
    await act(async () => {
      resolveInterject({ resolved_channel: "new_run" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    expect(lastChatInputProps?.interjectState).toEqual({
      pendingFyiCount: 0,
      queueItems: [],
    });
    expect(
      (lastChatMessagesProps?.messages || []).some((message) =>
        (message.traceFrames || []).some(
          (frame) => frame.type === "clarify_request",
        ),
      ),
    ).toBe(false);
  });

  test("passes the floating input height to ChatMessages as bottom inset", async () => {
    renderChat();
    await waitForReady();

    await sendTurn("Hello", "World");

    /* jsdom has no layout: the inset stays at the pre-measure fallback;
       in the app a ResizeObserver keeps it synced to the input height */
    expect(lastChatMessagesProps?.bottomViewportInset).toBe(160);
  });

  test("prefills the composer when the Plugins modal dispatches a Try-in-chat event", async () => {
    renderChat();
    await waitForReady();

    act(() => {
      dispatchComposerPrefill("/plan ");
    });

    await waitFor(() => {
      expect(screen.getByTestId("chat-input").value).toBe("/plan ");
    });
  });

  test("animates the chat surface offset when the side menu changes", () => {
    const { container, rerender } = renderChatWithFragment("main");
    const chatSurface = container.querySelector("[data-chat-id]");

    expect(chatSurface).toBeTruthy();
    expect(chatSurface.style.left).toBe("0px");
    expect(chatSurface.style.transition).toBe("left 0.3s ease");

    rerender(
      <ThemeContext.Provider
        value={{
          theme: {},
          onThemeMode: "light_mode",
        }}
      >
        <NavigationContext.Provider
          value={{ onFragment: "side_menu", setOnFragment: jest.fn() }}
        >
          <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
            <ChatInterface />
          </LocaleContext.Provider>
        </NavigationContext.Provider>
      </ThemeContext.Provider>,
    );

    expect(chatSurface.style.left).toBe("320px");
    expect(chatSurface.style.transition).toBe("left 0.3s ease");
  });

  test("disables send when no model is selected", async () => {
    window.unchainAPI.getModelCatalog.mockResolvedValue({
      activeModel: null,
      providers: {
        openai: ["gpt-5"],
        ollama: [],
        anthropic: [],
      },
      model_capabilities: {},
    });

    renderChat();

    await waitFor(() => {
      expect(window.unchainAPI.getModelCatalog).toHaveBeenCalled();
      expect(lastChatInputProps?.sendDisabled).toBe(true);
      expect(lastChatInputProps?.disclaimer).toBe(
        "Select a model to send a message.",
      );
      expect(screen.getByTestId("send-button")).toBeDisabled();
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Hello without model" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
  });

  test("hides and omits toolkits when selected model does not support tools", async () => {
    const seeded = getChatsStore();
    setChatSelectedToolkits(seeded.activeChatId, ["core"], { source: "test" });
    window.unchainAPI.getModelCatalog.mockResolvedValue({
      activeModel: "ollama:deepseek-r1:14b",
      providers: {
        openai: [],
        ollama: ["deepseek-r1:14b"],
        anthropic: [],
      },
      model_capabilities: {
        "ollama:deepseek-r1:14b": {
          input_modalities: ["text"],
          input_source_types: {},
          supports_tools: false,
        },
      },
    });

    renderChat();

    await waitFor(() => {
      expect(window.unchainAPI.getModelCatalog).toHaveBeenCalled();
      expect(lastChatInputProps?.showToolSelector).toBe(false);
      expect(lastChatInputProps?.showWorkspaceSelector).toBe(false);
      expect(lastChatInputProps?.selectedToolkits).toEqual([]);
      expect(lastChatInputProps?.selectedWorkspaceIds).toEqual([]);
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Hello without tools" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.modelId).toBe("ollama:deepseek-r1:14b");
    expect(payload.options.toolkits).toBeUndefined();
    expect(payload.options.selectedWorkspaceIds).toBeUndefined();
  });

  test("character chats hide model/tools/workspace selectors and inject character config into stream", async () => {
    const seeded = getChatsStore();
    setChatModel(seeded.activeChatId, { id: "openai:gpt-5" }, { source: "test" });
    openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
        },
      },
      { source: "test" },
    );

    renderChat();
    await waitForReady();

    await waitFor(() => {
      expect(lastChatInputProps?.showModelSelector).toBe(false);
      expect(lastChatInputProps?.showToolSelector).toBe(false);
      expect(lastChatInputProps?.showWorkspaceSelector).toBe(false);
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Hello Nico" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.buildCharacterAgentConfig).toHaveBeenCalledWith({
        characterId: "nico",
        threadId: "main",
        humanId: "local_user",
      });
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.threadId).toBe("character_nico__dm__main");
    expect(payload.options.modelId).toBe("openai:gpt-4.1");
    expect(payload.options.memory_enabled).toBe(true);
    expect(payload.options.memory_namespace).toBe(
      "character_nico__rel__local_user",
    );
    expect(payload.options.agent_instructions).toBe("You are Nico.");
    expect(payload.options.disable_workspace_root).toBe(true);
    expect(payload.options.toolkits).toBeUndefined();
    expect(payload.options.selectedWorkspaceIds).toBeUndefined();
    expect(payload.options.workspaceRoot).toBeUndefined();
  });

  test("character chat defer decisions reply locally without starting a stream", async () => {
    const seeded = getChatsStore();
    setChatModel(seeded.activeChatId, { id: "openai:gpt-5" }, { source: "test" });
    openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
        },
      },
      { source: "test" },
    );
    window.unchainAPI.buildCharacterAgentConfig.mockResolvedValueOnce({
      session_id: "character_nico__dm__main",
      run_memory_namespace: "character_nico__rel__local_user",
      instructions: "You are Nico.",
      decision: {
        action: "defer",
        courtesy_message: "I'm working right now, later?",
      },
    });

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Ping" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
      expect(lastChatMessagesProps?.messages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ role: "user", content: "Ping" }),
            expect.objectContaining({
              role: "assistant",
              content: "I'm working right now, later?",
              status: "done",
            }),
          ]),
      );
    });
  });

  test("persists agent orchestration between turns and records token usage from bundle.model", async () => {
    const seeded = getChatsStore();
    setChatModel(seeded.activeChatId, { id: "openai:gpt-5" }, { source: "test" });

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Implement the feature" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(streamHandlers).toBeTruthy();
    });

    const [firstPayload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(firstPayload.options.agent_orchestration).toEqual({
      mode: "default",
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: Date.now(),
        type: "final_message",
        payload: {
          content: "Here is the plan.",
        },
      });
      streamHandlers.onDone({
        bundle: {
          model: "openai:gpt-4.1",
          display_model: "openai:gpt-5",
          active_agent: "developer",
          agent_orchestration: {
            mode: "developer_waiting_approval",
          },
          consumed_tokens: 21,
          input_tokens: 13,
          output_tokens: 8,
        },
      });
    });

    await waitFor(() => {
      expect(
        getChatsStore().chatsById[getChatsStore().activeChatId].agentOrchestration,
      ).toEqual({
        mode: "developer_waiting_approval",
      });
    });

    expect(
      getChatsStore().chatsById[getChatsStore().activeChatId].model,
    ).toEqual({ id: "openai:gpt-5" });
    expect(readTokenUsageRecords()).toEqual([
      expect.objectContaining({
        provider: "openai",
        model: "gpt-4.1",
        model_id: "openai:gpt-4.1",
        consumed_tokens: 21,
        input_tokens: 13,
        output_tokens: 8,
      }),
    ]);

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Proceed" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    });

    const [secondPayload] = window.unchainAPI.startStreamV2.mock.calls[1];
    expect(secondPayload.options.agent_orchestration).toEqual({
      mode: "developer_waiting_approval",
    });
  });

  test("records a synthetic confirmation decision as soon as approval is accepted", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run the tool" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    streamHandlers.onFrame({
      seq: 1,
      ts: 100,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        confirmation_id: "confirm-1",
        requires_confirmation: true,
        tool_name: "terminal_exec",
        arguments: { cmd: "pwd" },
      },
    });

    await waitFor(() => {
      expect(
        lastChatMessagesProps?.toolConfirmationUiStateById?.["confirm-1"]?.status,
      ).toBe("idle");
    });

    await lastChatMessagesProps.onToolConfirmationDecision({
      confirmationId: "confirm-1",
      approved: true,
    });

    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledWith({
      confirmation_id: "confirm-1",
      session_id: lastChatMessagesProps.chatId,
      approved: true,
      reason: "",
    });

    await waitFor(() => {
      expect(
        lastChatMessagesProps?.toolConfirmationUiStateById?.["confirm-1"],
      ).toEqual(
        expect.objectContaining({
          status: "submitted",
          resolved: true,
          decision: "approved",
        }),
      );
    });

    await waitFor(() => {
      const assistantMessage = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      expect(assistantMessage?.traceFrames).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "tool_confirmed",
            stage: "client",
            payload: expect.objectContaining({
              call_id: "call-1",
              confirmation_id: "confirm-1",
              synthetic: true,
            }),
          }),
        ]),
      );
    });
  });

  test("rehydrates an awaiting durable interaction without starting a stream and blocks send", async () => {
    const interactionId = "interaction-awaiting";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-paused",
        role: "user",
        content: "Run npm install",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const pending = buildPendingInteraction({
      sessionId,
      interactionId,
      callId: "call-awaiting",
    });
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? pending
          : { status: "none", session_id: requestedSessionId },
    });

    renderChat();
    await waitForBoot();

    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          interactionId
        ],
      ).toEqual(
        expect.objectContaining({
          confirmationId: interactionId,
          callId: "call-awaiting",
          toolName: "shell",
        }),
      );
      expect(
        lastChatMessagesProps?.toolConfirmationUiStateById?.[interactionId],
      ).toEqual(
        expect.objectContaining({
          status: "idle",
          resolved: false,
        }),
      );
    });

    expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalledWith({
      session_id: sessionId,
    });
    expect(bridge.resumeRuns()).toHaveLength(0);
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(lastChatInputProps?.sendDisabled).toBe(true);
    expect(
      findConfirmationFrames(
        lastChatMessagesProps?.messages,
        interactionId,
      ).filter(({ frame }) => frame.type === "tool_call"),
    ).toHaveLength(1);
  });

  test("stopping a recovered durable wait cancels its source attempt without a live stream handle", async () => {
    const interactionId = "interaction-awaiting-stop";
    const sourceRunId = "attempt-paused-source";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-paused-stop",
        role: "user",
        content: "Wait for approval",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const pending = buildPendingInteraction({
      sessionId,
      interactionId,
      callId: "call-awaiting-stop",
      sourceRunId,
    });
    installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? pending
          : { status: "none", session_id: requestedSessionId },
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          interactionId
        ],
      ).toBeTruthy();
      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("stop-button"));

    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
        session_id: sessionId,
        attempt_id: sourceRunId,
        source_attempt_id: sourceRunId,
        reason: "user_stop",
        idempotency_key: `stop:${sourceRunId}`,
      });
    });
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("automatically resumes a recorded durable receipt exactly once", async () => {
    const interactionId = "interaction-recorded";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-recorded",
        role: "user",
        content: "Apply the recorded decision",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const pending = buildPendingInteraction({
      sessionId,
      status: "receipt_recorded",
      interactionId,
      callId: "call-recorded",
    });
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? pending
          : { status: "none", session_id: requestedSessionId },
    });

    renderChat();
    await waitForBoot();

    await waitFor(() => {
      expect(bridge.resumeRuns()).toHaveLength(1);
    });

    expect(bridge.resumeRuns()[0].payload).toEqual(
      expect.objectContaining({
        mode: "resume_interaction",
        threadId: sessionId,
        interaction_id: interactionId,
        message: "",
        options: expect.objectContaining({
          modelId: "openai:gpt-5",
          memory_enabled: true,
          maxTokens: 512,
        }),
      }),
    );
    expect(window.unchainAPI.respondToolConfirmation).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 75));
    });
    expect(bridge.resumeRuns()).toHaveLength(1);
  });

  test("retries a durable resume after a transient execution lease conflict", async () => {
    const interactionId = "interaction-lease-retry";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-lease-retry",
        role: "user",
        content: "Continue after the other executor exits",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const pending = buildPendingInteraction({
      sessionId,
      status: "receipt_recorded",
      interactionId,
      callId: "call-lease-retry",
    });
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? pending
          : { status: "none", session_id: requestedSessionId },
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(bridge.resumeRuns()).toHaveLength(1);
    });

    act(() => {
      bridge.resumeRuns()[0].handlers.onError({
        code: "execution_lease_conflict",
        message: "another executor still owns the session lease",
      });
    });

    await waitFor(
      () => {
        expect(bridge.resumeRuns()).toHaveLength(2);
      },
      { timeout: 2500 },
    );
    expect(bridge.resumeRuns()[1].payload).toEqual(
      expect.objectContaining({
        mode: "resume_interaction",
        threadId: sessionId,
        interaction_id: interactionId,
        message: "",
      }),
    );
  });

  test("stopping a durable retry wait cancels its scheduled resume", async () => {
    jest.useFakeTimers();
    const beyondAllRetryDelaysMs = 120_000;
    const interactionId = "interaction-stop-retry";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-stop-retry",
        role: "user",
        content: "Do not resume after I stop this run",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const pending = buildPendingInteraction({
      sessionId,
      status: "receipt_recorded",
      interactionId,
      callId: "call-stop-retry",
    });
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? pending
          : { status: "none", session_id: requestedSessionId },
    });

    try {
      renderChat();
      await waitForBoot();
      await waitFor(() => {
        expect(bridge.resumeRuns()).toHaveLength(1);
      });

      act(() => {
        bridge.resumeRuns()[0].handlers.onError({
          code: "execution_lease_conflict",
          message: "another executor still owns the session lease",
        });
      });

      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("stop-button"));

      await act(async () => {
        await Promise.resolve();
      });

      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
        session_id: sessionId,
        attempt_id: bridge.resumeRuns()[0].attemptId,
        source_attempt_id: pending.source_run_id,
        request_id: bridge.resumeRuns()[0].attemptId,
        reason: "user_stop",
        idempotency_key: `stop:${bridge.resumeRuns()[0].attemptId}`,
      });

      await act(async () => {
        jest.advanceTimersByTime(beyondAllRetryDelaysMs);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(bridge.resumeRuns()).toHaveLength(1);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test("stopping an in-flight durable lookup ignores a late recorded receipt", async () => {
    const interactionId = "interaction-stop-late-lookup";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-stop-late-lookup",
        role: "user",
        content: "Do not revive this interrupted run",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const pending = buildPendingInteraction({
      sessionId,
      status: "receipt_recorded",
      interactionId,
      callId: "call-stop-late-lookup",
    });
    let resolveLookup;
    const pendingLookup = new Promise((resolve) => {
      resolveLookup = resolve;
    });
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? pendingLookup
          : { status: "none", session_id: requestedSessionId },
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalledWith({
        session_id: sessionId,
      });
    });

    expect(screen.getByTestId("stop-button")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stop-button"));
    await act(async () => {
      resolveLookup(pending);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(bridge.resumeRuns()).toHaveLength(0);
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
      session_id: sessionId,
      attempt_id: pending.active_attempt_id,
      source_attempt_id: pending.source_run_id,
      reason: "user_stop",
      idempotency_key: `stop:${pending.active_attempt_id}`,
    });
  });

  test("stops retrying when another executor has already completed the durable run", async () => {
    const interactionId = "interaction-other-winner";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-other-winner",
        role: "user",
        content: "Let the current executor finish",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    let completedElsewhere = false;
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        completedElsewhere
          ? { status: "none", session_id: requestedSessionId }
          : buildPendingInteraction({
              sessionId,
              status: "receipt_recorded",
              interactionId,
              callId: "call-other-winner",
            }),
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(bridge.resumeRuns()).toHaveLength(1);
    });

    completedElsewhere = true;
    act(() => {
      bridge.resumeRuns()[0].handlers.onError({
        code: "execution_lease_conflict",
        message: "another executor still owns the session lease",
      });
    });

    await waitFor(
      () => {
        expect(lastChatInputProps?.sendDisabled).toBe(false);
      },
      { timeout: 2500 },
    );
    expect(bridge.resumeRuns()).toHaveLength(1);
  });

  test("resuming after a durable receipt does not append a duplicate user message", async () => {
    const interactionId = "interaction-no-duplicate";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-original",
        role: "user",
        content: "Install the package",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    let phase = "awaiting_response";
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? buildPendingInteraction({
              sessionId,
              status: phase,
              interactionId,
              callId: "call-no-duplicate",
            })
          : { status: "none", session_id: requestedSessionId },
    });
    window.unchainAPI.respondToolConfirmation.mockImplementation(
      async () => {
        phase = "receipt_recorded";
        return {
          status: "ok",
          disposition: "receipt_recorded",
          session_id: sessionId,
          interaction_id: interactionId,
          receipt_id: "receipt-no-duplicate",
        };
      },
    );

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          interactionId
        ],
      ).toBeDefined();
    });

    const originalUsers = lastChatMessagesProps.messages
      .filter((message) => message.role === "user")
      .map(({ id, content }) => ({ id, content }));

    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision({
        confirmationId: interactionId,
        approved: true,
      });
    });

    await waitFor(() => {
      expect(bridge.resumeRuns()).toHaveLength(1);
    });
    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledWith({
      confirmation_id: interactionId,
      session_id: sessionId,
      approved: true,
      reason: "",
    });
    expect(
      lastChatMessagesProps.messages
        .filter((message) => message.role === "user")
        .map(({ id, content }) => ({ id, content })),
    ).toEqual(originalUsers);
  });

  test("does not start a second stream when a live confirmation continues", async () => {
    window.unchainAPI.respondToolConfirmation.mockResolvedValue({
      status: "ok",
      disposition: "live_continues",
    });

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run the live tool" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: 100,
        type: "tool_call",
        payload: {
          call_id: "call-live",
          confirmation_id: "confirm-live",
          requires_confirmation: true,
          tool_name: "terminal_exec",
          arguments: { cmd: "pwd" },
        },
      });
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-live"
        ],
      ).toBeDefined();
    });

    window.unchainAPI.startStreamV4 = jest.fn(() => ({ cancel: jest.fn() }));
    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision({
        confirmationId: "confirm-live",
        approved: true,
      });
    });

    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledWith({
      confirmation_id: "confirm-live",
      session_id: lastChatMessagesProps.chatId,
      approved: true,
      reason: "",
    });
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
    expect(lastChatInputProps?.isStreaming).toBe(true);
  });

  test("keeps pending confirmations isolated while two chats stream", async () => {
    const chatAId = seedActiveChatMessages([
      {
        id: "user-a-seed",
        role: "user",
        content: "Seed chat A",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:gpt-5" }, { source: "test" });
    const createdB = createChatInSelectedContext(
      { title: "Chat B" },
      { source: "test" },
    );
    setChatMessages(
      createdB.chatId,
      [
        {
          id: "user-b-seed",
          role: "user",
          content: "Seed chat B",
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      { source: "test" },
    );
    setChatModel(
      createdB.chatId,
      { id: "openai:gpt-5" },
      { source: "test" },
    );
    selectTreeNode({ nodeId: chatANodeId }, { source: "test" });

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run tool A" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(streamHandlers).toBeTruthy();
    });
    const chatAHandlers = streamHandlers;
    act(() => {
      chatAHandlers.onFrame({
        seq: 1,
        ts: 100,
        type: "tool_call",
        payload: {
          call_id: "call-a",
          confirmation_id: "confirm-a",
          requires_confirmation: true,
          tool_name: "terminal_exec",
          arguments: { cmd: "pwd" },
        },
      });
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.["confirm-a"],
      ).toBeDefined();
    });

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run tool B" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
      expect(streamHandlers).not.toBe(chatAHandlers);
    });
    const chatBHandlers = streamHandlers;
    act(() => {
      chatBHandlers.onFrame({
        seq: 1,
        ts: 200,
        type: "tool_call",
        payload: {
          call_id: "call-b",
          confirmation_id: "confirm-b",
          requires_confirmation: true,
          tool_name: "terminal_exec",
          arguments: { cmd: "ls" },
        },
      });
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.["confirm-b"],
      ).toBeDefined();
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.["confirm-a"],
      ).toBeUndefined();
    });

    act(() => {
      selectTreeNode({ nodeId: chatANodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(chatAId);
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.["confirm-a"],
      ).toBeDefined();
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.["confirm-b"],
      ).toBeUndefined();
    });

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.["confirm-b"],
      ).toBeDefined();
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.["confirm-a"],
      ).toBeUndefined();
    });
  });

  test("keeps a durable resolution on the assistant bubble that owns the request", async () => {
    const interactionId = "interaction-owner";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-old",
        role: "user",
        content: "Earlier question",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "assistant-old",
        role: "assistant",
        content: "Earlier answer",
        status: "done",
        traceFrames: [],
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: "user-paused-owner",
        role: "user",
        content: "Run the protected tool",
        createdAt: 3,
        updatedAt: 3,
      },
    ]);
    let phase = "awaiting_response";
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? buildPendingInteraction({
              sessionId,
              status: phase,
              interactionId,
              callId: "call-owner",
            })
          : { status: "none", session_id: requestedSessionId },
    });
    window.unchainAPI.respondToolConfirmation.mockImplementation(
      async () => {
        phase = "receipt_recorded";
        return {
          status: "ok",
          disposition: "receipt_recorded",
          session_id: sessionId,
          interaction_id: interactionId,
          receipt_id: "receipt-owner",
        };
      },
    );

    renderChat();
    await waitForBoot();
    let ownerMessageId = "";
    await waitFor(() => {
      const owner = findConfirmationFrames(
        lastChatMessagesProps?.messages,
        interactionId,
      ).find(({ frame }) => frame.type === "tool_call");
      expect(owner).toBeDefined();
      ownerMessageId = owner.message.id;
    });

    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision({
        confirmationId: interactionId,
        approved: true,
      });
    });

    await waitFor(() => {
      expect(bridge.resumeRuns()).toHaveLength(1);
      const owner = lastChatMessagesProps.messages.find(
        (message) => message.id === ownerMessageId,
      );
      expect(owner?.traceFrames).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "tool_confirmed",
            payload: expect.objectContaining({
              confirmation_id: interactionId,
            }),
          }),
        ]),
      );
    });

    const resolutionsOnOtherMessages = lastChatMessagesProps.messages
      .filter((message) => message.id !== ownerMessageId)
      .flatMap((message) => message.traceFrames || [])
      .filter(
        (frame) =>
          frame.type === "tool_confirmed" &&
          frame.payload?.confirmation_id === interactionId,
      );
    expect(resolutionsOnOtherMessages).toHaveLength(0);
  });

  test("keeps low-risk shell tool calls in assistant trace frames", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run pwd" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: 100,
        type: "tool_call",
        payload: {
          call_id: "call-shell",
          toolkit_id: "core",
          tool_name: "shell",
          arguments: { action: "run", command: "pwd" },
        },
      });
      streamHandlers.onFrame({
        seq: 2,
        ts: 110,
        type: "tool_result",
        payload: {
          call_id: "call-shell",
          toolkit_id: "core",
          tool_name: "shell",
          result: { ok: true, stdout: "/tmp\n" },
        },
      });
    });

    await waitFor(() => {
      const assistantMessage = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      expect(assistantMessage?.traceFrames).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "tool_call",
            payload: expect.objectContaining({
              call_id: "call-shell",
              tool_name: "shell",
            }),
          }),
          expect.objectContaining({
            type: "tool_result",
            payload: expect.objectContaining({
              call_id: "call-shell",
              tool_name: "shell",
            }),
          }),
        ]),
      );
    });
  });

  test("replaces a bare shell tool call with the enriched confirmation frame", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run install" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: 100,
        type: "tool_call",
        payload: {
          call_id: "call-shell",
          toolkit_id: "core",
          tool_name: "shell",
          arguments: { action: "run", command: "npm install" },
        },
      });
      streamHandlers.onFrame({
        seq: 2,
        ts: 110,
        type: "tool_call",
        payload: {
          call_id: "call-shell",
          confirmation_id: "confirm-shell",
          requires_confirmation: true,
          toolkit_id: "core",
          tool_name: "shell",
          arguments: { action: "run", command: "npm install" },
        },
      });
    });

    await waitFor(() => {
      const assistantMessage = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      const shellToolCalls = (assistantMessage?.traceFrames || []).filter(
        (frame) =>
          frame.type === "tool_call" &&
          frame.payload?.call_id === "call-shell",
      );

      expect(shellToolCalls).toHaveLength(1);
      expect(shellToolCalls[0]?.payload).toEqual(
        expect.objectContaining({
          confirmation_id: "confirm-shell",
          requires_confirmation: true,
        }),
      );
      expect(
        lastChatMessagesProps?.toolConfirmationUiStateById?.["confirm-shell"]?.status,
      ).toBe("idle");
    });
  });

  test("auto-approves matching tools without exposing pending confirmation UI", async () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 2,
        toolkits: ["code_toolkit"],
        tools: ["code_toolkit:write"],
      }),
    );
    let resolveConfirmation;
    const confirmationPromise = new Promise((resolve) => {
      resolveConfirmation = resolve;
    });
    window.unchainAPI.respondToolConfirmation.mockImplementationOnce(
      () => confirmationPromise,
    );

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run the write tool" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    streamHandlers.onFrame({
      seq: 1,
      ts: 100,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        confirmation_id: "confirm-1",
        requires_confirmation: true,
        toolkit_id: "code_toolkit",
        tool_name: "write",
        arguments: { path: "/tmp/demo.txt" },
      },
    });

    await waitFor(() => {
      expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledWith({
        confirmation_id: "confirm-1",
        session_id: lastChatMessagesProps.chatId,
        approved: true,
        reason: "",
      });
      expect(
        lastChatMessagesProps?.toolConfirmationUiStateById?.["confirm-1"],
      ).toEqual(
        expect.objectContaining({
          status: "submitted",
          error: "",
          resolved: true,
          decision: "approved",
        }),
      );
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.["confirm-1"],
      ).toBeUndefined();
    });

    await act(async () => {
      resolveConfirmation({ status: "ok" });
      await confirmationPromise;
    });

    streamHandlers.onFrame({
      seq: 2,
      ts: 110,
      type: "tool_call",
      payload: {
        call_id: "call-2",
        confirmation_id: "confirm-2",
        requires_confirmation: true,
        toolkit_id: "workspace_toolkit",
        tool_name: "write",
        arguments: { path: "/tmp/demo.txt" },
      },
    });

    await waitFor(() => {
      expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(2);
      expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledWith({
        confirmation_id: "confirm-2",
        session_id: lastChatMessagesProps.chatId,
        approved: true,
        reason: "",
      });
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.["confirm-2"],
      ).toBeUndefined();
      expect(
        lastChatMessagesProps?.toolConfirmationUiStateById?.["confirm-2"],
      ).toEqual(
        expect.objectContaining({
          status: "submitted",
          error: "",
          resolved: true,
          decision: "approved",
        }),
      );
    });
  });

  test("auto-approve submission failure restores manual confirmation state", async () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 2,
        toolkits: ["code_toolkit"],
        tools: ["code_toolkit:write"],
      }),
    );
    window.unchainAPI.respondToolConfirmation.mockRejectedValueOnce(
      new Error("network down"),
    );

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run the write tool" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    streamHandlers.onFrame({
      seq: 1,
      ts: 100,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        confirmation_id: "confirm-1",
        requires_confirmation: true,
        toolkit_id: "code_toolkit",
        tool_name: "write",
        arguments: { path: "/tmp/demo.txt" },
      },
    });

    await waitFor(() => {
      expect(
        lastChatMessagesProps?.toolConfirmationUiStateById?.["confirm-1"],
      ).toEqual(
        expect.objectContaining({
          status: "error",
          error: "network down",
          resolved: false,
          decision: "",
        }),
      );
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.["confirm-1"],
      ).toEqual(
        expect.objectContaining({
          confirmationId: "confirm-1",
          callId: "call-1",
          toolName: "write",
        }),
      );
    });
  });

  test("persists selector responses in synthetic confirmation trace frames", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Choose the stack" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    streamHandlers.onFrame({
      seq: 1,
      ts: 100,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        confirmation_id: "confirm-1",
        requires_confirmation: true,
        tool_name: "ask_user_question",
        interact_type: "single",
        interact_config: {
          question: "Which stack do you want to use?",
          options: [
            {
              label: "Web Canvas",
              value: "web_canvas",
            },
          ],
          allow_other: true,
          other_label: "Other option",
        },
      },
    });

    await lastChatMessagesProps.onToolConfirmationDecision({
      confirmationId: "confirm-1",
      approved: true,
      userResponse: {
        value: "__other__",
        other_text: "Custom engine",
      },
    });

    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledWith({
      confirmation_id: "confirm-1",
      session_id: lastChatMessagesProps.chatId,
      approved: true,
      reason: "",
      modified_arguments: {
        user_response: {
          value: "__other__",
          other_text: "Custom engine",
        },
      },
    });

    await waitFor(() => {
      const assistantMessage = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      expect(assistantMessage?.traceFrames).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "tool_confirmed",
            stage: "client",
            payload: expect.objectContaining({
              call_id: "call-1",
              confirmation_id: "confirm-1",
              synthetic: true,
              user_response: {
                value: "__other__",
                other_text: "Custom engine",
              },
            }),
          }),
        ]),
      );
    });
  });

  test("pins the disabled memory snapshot into the stream payload", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        memory: {
          enabled: false,
        },
      }),
    );

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Memory snapshot test" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.memory_enabled).toBe(false);
  });

  test("retries once with history when memory is unavailable", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        memory: {
          enabled: true,
        },
      }),
    );

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Memory fallback test" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    const [firstPayload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(firstPayload.history).toEqual([]);

    streamHandlers.onError({
      code: "memory_unavailable",
      message: "Memory is unavailable for this request",
    });

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    });

    const [secondPayload] = window.unchainAPI.startStreamV2.mock.calls[1];
    expect(secondPayload.threadId).toEqual(firstPayload.threadId);
    expect(secondPayload.options.memory_enabled).toBe(false);
    expect(secondPayload.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "Memory fallback test",
        }),
      ]),
    );
  });

  test("stores child lifecycle metadata and child shell trace frames separately from the main trace", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Delegate the analysis" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: 100,
        type: "run_started",
        run_id: "parent-run",
        payload: {
          run_id: "parent-run",
        },
      });
      streamHandlers.onFrame({
        seq: 2,
        ts: 110,
        type: "subagent_started",
        payload: {
          child_run_id: "child-run-1",
          subagent_id: "developer.analyzer.1",
          mode: "delegate",
          template: "analyzer",
          parent_id: "developer",
          lineage: ["developer", "developer.analyzer.1"],
        },
      });
      streamHandlers.onFrame({
        seq: 3,
        ts: 120,
        type: "tool_call",
        run_id: "child-run-1",
        payload: {
          call_id: "child-call-1",
          tool_name: "shell",
          arguments: {
            action: "run",
            command: "pwd",
          },
        },
      });
    });

    await waitFor(() => {
      const assistantMessage = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      expect(assistantMessage?.subagentMetaByRunId?.["child-run-1"]).toEqual(
        expect.objectContaining({
          subagentId: "developer.analyzer.1",
          mode: "delegate",
          template: "analyzer",
          parentId: "developer",
          lineage: ["developer", "developer.analyzer.1"],
          status: "running",
        }),
      );
      expect(assistantMessage?.subagentFrames?.["child-run-1"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "tool_call",
            run_id: "child-run-1",
            payload: expect.objectContaining({
              tool_name: "shell",
            }),
          }),
        ]),
      );
      expect(
        assistantMessage?.traceFrames?.find(
          (frame) => frame?.payload?.call_id === "child-call-1",
        ),
      ).toBeUndefined();
    });
  });

  test("logs request_messages with a compact summary instead of full transcript", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Start request log stream" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    const largeContent = "full transcript content ".repeat(100);

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: 100,
        type: "request_messages",
        payload: {
          system: "system prompt",
          provider: "openai",
          previous_response_id: "resp_1",
          tool_names: ["read"],
          messages: [
            { role: "user", content: largeContent },
            { role: "assistant", content: "ok" },
          ],
        },
      });
    });

    await waitFor(() => {
      expect(
        mockScopedLogger.log.mock.calls.some((call) => {
          const [eventName, payload] = call;
          return (
            eventName === "request_messages" &&
            payload?.summary?.messageCount === 2 &&
            payload?.summary?.previewMessages?.[0]?.contentPreview?.length ===
              240 &&
            !Object.prototype.hasOwnProperty.call(payload, "messages") &&
            !JSON.stringify(payload).includes(largeContent)
          );
        }),
      ).toBe(true);
    });
  });

  test("routes child ask_user_question frames to subagent timelines", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Delegate and ask from child" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: 100,
        type: "run_started",
        run_id: "parent-run",
        payload: {
          run_id: "parent-run",
        },
      });
      streamHandlers.onFrame({
        seq: 2,
        ts: 110,
        type: "subagent_started",
        payload: {
          child_run_id: "child-run-1",
          subagent_id: "developer.explore.1",
          mode: "delegate",
          template: "Explore",
          parent_id: "developer",
          lineage: ["developer", "developer.explore.1"],
        },
      });
      streamHandlers.onFrame({
        seq: 3,
        ts: 120,
        type: "tool_call",
        run_id: "child-run-1",
        payload: {
          call_id: "ask-child-1",
          confirmation_id: "confirm-child-1",
          requires_confirmation: true,
          tool_name: "ask_user_question",
          interact_type: "single",
          interact_config: {
            question: "Child needs input?",
            options: [{ label: "Frontend", value: "frontend" }],
          },
        },
      });
    });

    await waitFor(() => {
      const assistantMessage = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      expect(assistantMessage?.subagentFrames?.["child-run-1"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "tool_call",
            run_id: "child-run-1",
            payload: expect.objectContaining({
              tool_name: "ask_user_question",
              confirmation_id: "confirm-child-1",
            }),
          }),
        ]),
      );
      expect(
        assistantMessage?.traceFrames?.find(
          (frame) => frame?.payload?.call_id === "ask-child-1",
        ),
      ).toBeUndefined();
      expect(
        lastChatMessagesProps?.toolConfirmationUiStateById?.[
          "confirm-child-1"
        ]?.status,
      ).toBe("idle");
    });
  });

  test("keeps child final messages out of the main trace when lifecycle metadata arrives later", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Delegate with delayed lifecycle metadata" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: 100,
        type: "run_started",
        run_id: "parent-run",
        payload: {
          run_id: "parent-run",
        },
      });
      streamHandlers.onFrame({
        seq: 2,
        ts: 110,
        type: "final_message",
        run_id: "child-run-2",
        payload: {
          content: "Child delegate final output",
        },
      });
      streamHandlers.onFrame({
        seq: 3,
        ts: 120,
        type: "subagent_completed",
        payload: {
          child_run_id: "child-run-2",
          subagent_id: "developer.analyzer.2",
          mode: "delegate",
          template: "analyzer",
          parent_id: "developer",
          lineage: ["developer", "developer.analyzer.2"],
          status: "completed",
        },
      });
    });

    await waitFor(() => {
      const assistantMessage = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      expect(assistantMessage?.subagentMetaByRunId?.["child-run-2"]).toEqual(
        expect.objectContaining({
          subagentId: "developer.analyzer.2",
          mode: "delegate",
          template: "analyzer",
          parentId: "developer",
          lineage: ["developer", "developer.analyzer.2"],
          status: "completed",
        }),
      );
      expect(assistantMessage?.subagentFrames?.["child-run-2"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "final_message",
            run_id: "child-run-2",
            payload: expect.objectContaining({
              content: "Child delegate final output",
            }),
          }),
        ]),
      );
      expect(
        assistantMessage?.traceFrames?.find(
          (frame) =>
            frame?.type === "final_message" && frame?.run_id === "child-run-2",
        ),
      ).toBeUndefined();
    });
  });

  test("prefers runtime event stream v4 and stores run-level artifact summaries", async () => {
    window.unchainAPI.startStreamV4 = jest.fn((_payload, handlers = {}) => {
      streamV4Handlers = handlers;
      return {
        cancel: cancelSpy,
      };
    });

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Hello v4" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
      expect(window.unchainAPI.startStreamV3).toBeUndefined();
      expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
      expect(streamV4Handlers).toBeTruthy();
    });

    const baseEvent = {
      schema_version: "v4",
      timestamp: "2026-05-26T12:00:00.000Z",
      session_id: "thread-v4",
      run_id: "run-root",
      agent_id: "developer",
      turn_id: "run-root:turn-1",
      links: {},
      surface: { slot: "trace_inline", scope: "turn" },
      visibility: "user",
      metadata: {},
    };

    act(() => {
      streamV4Handlers.onRuntimeEvent({
        ...baseEvent,
        event_id: "evt-run",
        seq: 1,
        type: "run.started",
        payload: { status: "running", provider: "openai", model: "gpt-5" },
      });
      streamV4Handlers.onRuntimeEvent({
        ...baseEvent,
        event_id: "evt-delta",
        seq: 2,
        type: "step.delta",
        payload: {
          step_id: "model:run-root:turn-1:response",
          step_type: "model_response",
          kind: "text",
          delta: "Hello from v4",
        },
      });
      streamV4Handlers.onRuntimeEvent({
        ...baseEvent,
        event_id: "evt-final",
        seq: 3,
        type: "step.completed",
        payload: {
          step_id: "model:run-root:turn-1:response",
          step_type: "model_response",
          status: "completed",
          final_text: "Hello from v4",
        },
      });
      streamV4Handlers.onRuntimeEvent({
        ...baseEvent,
        event_id: "evt-artifact",
        seq: 4,
        type: "artifact.created",
        links: {
          artifact_id: "workspace_change_set:run-root",
          workspace_change_set_id: "wcs-run-root",
        },
        surface: {
          slot: "run_summary",
          scope: "run",
          group: "files",
          default_state: "expanded",
        },
        payload: {
          artifact_id: "workspace_change_set:run-root",
          kind: "workspace_change_set",
          title: "Workspace changes",
          snapshot: {
            change_set_id: "wcs-run-root",
            files: [{ path: "src/App.js", unified_diff: "" }],
          },
        },
      });
      streamV4Handlers.onRuntimeEvent({
        ...baseEvent,
        event_id: "evt-completed",
        seq: 5,
        type: "run.completed",
        payload: {
          status: "completed",
          usage: { consumed_tokens: 10, model: "openai:gpt-5" },
        },
      });
      streamV4Handlers.onDone({ finished_at: 123 });
    });

    await waitFor(() => {
      const assistantMessage = [...(lastChatMessagesProps?.messages || [])]
        .reverse()
        .find((message) => message.role === "assistant");
      expect(assistantMessage?.status).toBe("done");
      expect(assistantMessage?.content).toBe("Hello from v4");
      expect(assistantMessage?.meta?.bundle?.consumed_tokens).toBe(10);
      expect(assistantMessage?.runArtifactSummary).toMatchObject({
        status: "completed",
        artifacts: [
          {
            artifact_id: "workspace_change_set:run-root",
            kind: "workspace_change_set",
          },
        ],
      });
    });
  });

  test("does not store or expose legacy plan doc artifacts", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Create a plan" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(streamHandlers).toBeTruthy();
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: Date.now(),
        type: "tool_result",
        payload: {
          tool_name: "plan_update",
          call_id: "call-plan",
          result: {
            ok: true,
            plan_id: "plan_1",
            status: "draft",
            revision: 2,
            workspace_file: {
              path: "/tmp/workspace/plans/plan_1.md",
              relative_path: "plans/plan_1.md",
            },
            plan: { title: "Standalone plan" },
            artifact: {
              type: "plan_doc",
              plan_id: "plan_1",
              revision: 2,
              status: "draft",
              title: "Standalone plan",
            },
            artifacts: [{ type: "plan_doc", plan_id: "plan_1" }],
            markdown: "# Standalone plan",
            proposed_plan: "<proposed_plan># Standalone plan</proposed_plan>",
          },
        },
      });
    });

    await waitFor(() => {
      const assistantMessage = lastChatMessagesProps.messages.find(
        (message) => message.role === "assistant",
      );
      expect(assistantMessage?.traceFrames).toHaveLength(1);
    });

    const assistantMessage = lastChatMessagesProps.messages.find(
      (message) => message.role === "assistant",
    );
    expect(assistantMessage.content).toBe("");
    expect(lastChatMessagesProps.messages).toHaveLength(2);
    expect(lastChatMessagesProps).not.toHaveProperty("planDocs");
    expect(
      getChatsStore().chatsById[lastChatMessagesProps.chatId],
    ).not.toHaveProperty("planDocs");

    const result = assistantMessage.traceFrames[0].payload.result;
    expect(result).toEqual({
      ok: true,
      plan_id: "plan_1",
      status: "draft",
      revision: 2,
      workspace_file: {
        path: "/tmp/workspace/plans/plan_1.md",
        relative_path: "plans/plan_1.md",
      },
    });
  });

  test("batches token updates per animation frame and flushes pending tokens on done", async () => {
    const originalRaf = window.requestAnimationFrame;
    const originalCancelRaf = window.cancelAnimationFrame;
    const rafCallbacks = new Map();
    let rafIdSeed = 0;

    window.requestAnimationFrame = jest.fn((callback) => {
      rafIdSeed += 1;
      rafCallbacks.set(rafIdSeed, callback);
      return rafIdSeed;
    });
    window.cancelAnimationFrame = jest.fn((id) => {
      rafCallbacks.delete(id);
    });

    try {
      renderChat();
      await waitForReady();

      fireEvent.change(screen.getByTestId("chat-input"), {
        target: { value: "RAF token test" },
      });
      fireEvent.click(screen.getByTestId("send-button"));

      await waitFor(() => {
        expect(streamHandlers).toBeTruthy();
      });

      streamHandlers.onToken("Hel");
      streamHandlers.onToken("lo");
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);

      const getAssistantMessage = () =>
        lastChatMessagesProps?.messages?.find(
          (message) => message.role === "assistant",
        );
      const getAssistantStreamingText = () => {
        const message = getAssistantMessage();
        return lastChatMessagesProps?.streamingMessageStore?.getText({
          chatId: lastChatMessagesProps.chatId,
          messageId: message?.id,
        });
      };

      await waitFor(() => {
        expect(getAssistantMessage()?.content || "").toBe("");
      });

      act(() => {
        const callbacks = Array.from(rafCallbacks.values());
        rafCallbacks.clear();
        callbacks.forEach((callback) => callback(16));
      });

      await waitFor(() => {
        expect(getAssistantMessage()?.content || "").toBe("");
        expect(getAssistantStreamingText()).toBe("Hello");
        expect(getAssistantMessage()?.status).toBe("streaming");
      });

      streamHandlers.onToken(" world");
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(3);
      streamHandlers.onDone({});

      await waitFor(() => {
        expect(getAssistantMessage()?.content).toBe("Hello world");
        expect(getAssistantMessage()?.status).toBe("done");
      });
    } finally {
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCancelRaf;
    }
  });

  test("suppresses child token deltas while keeping parent token streaming intact", async () => {
    const originalRaf = window.requestAnimationFrame;
    const originalCancelRaf = window.cancelAnimationFrame;
    const rafCallbacks = new Map();
    let rafIdSeed = 0;
    window.requestAnimationFrame = jest.fn((callback) => {
      rafIdSeed += 1;
      rafCallbacks.set(rafIdSeed, callback);
      return rafIdSeed;
    });
    window.cancelAnimationFrame = jest.fn((id) => {
      rafCallbacks.delete(id);
    });

    try {
      renderChat();
      await waitForReady();

      fireEvent.change(screen.getByTestId("chat-input"), {
        target: { value: "Token routing test" },
      });
      fireEvent.click(screen.getByTestId("send-button"));

      await waitFor(() => {
        expect(streamHandlers).toBeTruthy();
      });

      const getAssistantMessage = () =>
        lastChatMessagesProps?.messages?.find(
          (message) => message.role === "assistant",
        );
      const getAssistantStreamingText = () => {
        const message = getAssistantMessage();
        return lastChatMessagesProps?.streamingMessageStore?.getText({
          chatId: lastChatMessagesProps.chatId,
          messageId: message?.id,
        });
      };

      act(() => {
        streamHandlers.onFrame({
          seq: 1,
          ts: 100,
          type: "run_started",
          run_id: "parent-run",
          payload: {
            run_id: "parent-run",
          },
        });
        streamHandlers.onFrame({
          seq: 2,
          ts: 110,
          type: "subagent_started",
          payload: {
            child_run_id: "child-run-1",
            subagent_id: "developer.analyzer.1",
            mode: "delegate",
            template: "analyzer",
            parent_id: "developer",
            lineage: ["developer", "developer.analyzer.1"],
          },
        });
        streamHandlers.onFrame({
          seq: 3,
          ts: 120,
          type: "token_delta",
          run_id: "child-run-1",
          payload: {
            delta: "child output",
          },
        });
        streamHandlers.onToken("child output");
      });

      await waitFor(() => {
        expect(getAssistantMessage()?.content || "").toBe("");
      });

      act(() => {
        streamHandlers.onFrame({
          seq: 4,
          ts: 130,
          type: "token_delta",
          run_id: "parent-run",
          payload: {
            delta: "parent output",
          },
        });
        streamHandlers.onToken("parent output");
      });

      act(() => {
        const callbacks = Array.from(rafCallbacks.values());
        rafCallbacks.clear();
        callbacks.forEach((callback) => callback(16));
      });

      await waitFor(() => {
        expect(getAssistantMessage()?.content || "").toBe("");
        expect(getAssistantStreamingText()).toBe("parent output");
      });
    } finally {
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCancelRaf;
    }
  });

  test("stores the done bundle on the assistant message", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Bundle test" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    const bundle = {
      consumed_tokens: 21,
      input_tokens: 13,
      output_tokens: 8,
      max_context_window_tokens: 128000,
      context_window_used_pct: 3.5,
    };

    streamHandlers.onDone({ bundle });

    const getAssistantMessage = () =>
      lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );

    await waitFor(() => {
      expect(getAssistantMessage()?.status).toBe("done");
      expect(getAssistantMessage()?.meta?.bundle).toEqual(bundle);
    });
  });

  test("persists token usage breakdown from the done bundle into localStorage", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Usage breakdown test" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    streamHandlers.onDone({
      bundle: {
        consumed_tokens: 21,
        input_tokens: 13,
        output_tokens: 8,
        max_context_window_tokens: 128000,
      },
    });

    await waitFor(() => {
      const tokenUsage = JSON.parse(
        window.localStorage.getItem("token_usage") || "{}",
      );
      expect(tokenUsage.records).toHaveLength(1);
      expect(tokenUsage.records[0]).toEqual(
        expect.objectContaining({
          consumed_tokens: 21,
          input_tokens: 13,
          output_tokens: 8,
          chatId: expect.any(String),
        }),
      );
    });
  });

  test("uses the trace-frame iteration for continuation prompts", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Need more steps" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: 100,
        type: "continuation_request",
        iteration: 4,
        payload: {
          confirmation_id: "continue-1",
        },
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          "Agent reached 4 iterations without a final response. Continue?",
        ),
      ).toBeInTheDocument();
    });

    expect(
      mockScopedLogger.log.mock.calls.some((call) => {
        const payload = call[1];
        return (
          payload &&
          typeof payload === "object" &&
          payload.confirmationId === "continue-1" &&
          payload.iteration === 4 &&
          payload.latestMessageRole === "assistant" &&
          payload.attachedToLatestAssistantBubble === true
        );
      }),
    ).toBe(true);
  });

  test("resend replaces short-term memory before starting a new stream", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        memory: { enabled: true },
      }),
    );

    renderChat();
    await waitForReady();

    await sendTurn("First turn", "A1");
    await sendTurn("Second turn", "A2");

    const secondUserMessage = lastChatMessagesProps.messages.find(
      (message) => message.role === "user" && message.content === "Second turn",
    );

    await act(async () => {
      await lastChatMessagesProps.onResendMessage(secondUserMessage);
    });

    expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1);
    const [replacePayload] = window.unchainAPI.replaceSessionMemory.mock.calls[0];
    expect(replacePayload.session_id).toBe(lastChatMessagesProps.chatId);
    expect(replacePayload.messages).toEqual([
      { role: "user", content: "First turn" },
      { role: "assistant", content: "A1" },
    ]);
    expect(
      window.unchainAPI.replaceSessionMemory.mock.invocationCallOrder[0],
    ).toBeLessThan(window.unchainAPI.startStreamV2.mock.invocationCallOrder[2]);
  });

  test("edit replaces short-term memory before starting a new stream", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        memory: { enabled: true },
      }),
    );

    renderChat();
    await waitForReady();

    await sendTurn("First turn", "A1");
    await sendTurn("Second turn", "A2");

    const secondUserMessage = lastChatMessagesProps.messages.find(
      (message) => message.role === "user" && message.content === "Second turn",
    );

    await act(async () => {
      await lastChatMessagesProps.onEditMessage(secondUserMessage, "Edited turn");
    });

    expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1);
    const [replacePayload] = window.unchainAPI.replaceSessionMemory.mock.calls[0];
    expect(replacePayload.messages).toEqual([
      { role: "user", content: "First turn" },
      { role: "assistant", content: "A1" },
    ]);
    const [streamPayload] = window.unchainAPI.startStreamV2.mock.calls[2];
    expect(streamPayload.message).toBe("Edited turn");
  });

  test("delete removes the containing turn and syncs remaining memory", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        memory: { enabled: true },
      }),
    );

    renderChat();
    await waitForReady();

    await sendTurn("First turn", "A1");
    await sendTurn("Second turn", "A2");

    const firstAssistantMessage = lastChatMessagesProps.messages.find(
      (message) => message.role === "assistant" && message.content === "A1",
    );

    await act(async () => {
      await lastChatMessagesProps.onDeleteMessage(firstAssistantMessage);
    });

    expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1);
    const [replacePayload] = window.unchainAPI.replaceSessionMemory.mock.calls[0];
    expect(replacePayload.messages).toEqual([
      { role: "user", content: "Second turn" },
      { role: "assistant", content: "A2" },
    ]);
    expect(
      lastChatMessagesProps.messages.map((message) => message.content),
    ).toEqual(["Second turn", "A2"]);
  });

  test("deleting a streaming assistant turn cancels the stream before replacing memory", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        memory: { enabled: true },
      }),
    );

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Streaming turn" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(streamHandlers).toBeTruthy();
    });

    const streamingAssistant = lastChatMessagesProps.messages.find(
      (message) => message.role === "assistant" && message.status === "streaming",
    );

    await act(async () => {
      await lastChatMessagesProps.onDeleteMessage(streamingAssistant);
    });

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.replaceSessionMemory.mock.invocationCallOrder[0]).toBeGreaterThan(
      cancelSpy.mock.invocationCallOrder[0],
    );
    const [replacePayload] = window.unchainAPI.replaceSessionMemory.mock.calls[0];
    expect(replacePayload.messages).toEqual([]);
    await waitFor(() => {
      const store = getChatsStore();
      const activeChat = store.chatsById[store.activeChatId];
      expect(activeChat.messages).toEqual([]);
    });
  });

  test("resend skips session replacement when memory is disabled", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        memory: { enabled: false },
      }),
    );

    renderChat();
    await waitForReady();

    await sendTurn("Only turn", "A1");

    const firstUserMessage = lastChatMessagesProps.messages.find(
      (message) => message.role === "user" && message.content === "Only turn",
    );

    await act(async () => {
      await lastChatMessagesProps.onResendMessage(firstUserMessage);
    });

    expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
  });
});
