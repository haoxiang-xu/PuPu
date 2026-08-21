import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  LocaleContext,
  NavigationContext,
  ThemeContext,
} from "../../CONTAINERs/config/context";
import ChatInterface from "./chat";
import { resolveQueueRelaySessionOwner } from "./hooks/use_chat_stream";
import {
  createChatInSelectedContext,
  getChatsStore,
  openCharacterChat,
  selectTreeNode,
  setChatMessages,
  setChatModel,
  setChatSelectedToolkits,
  setChatSessionBundle,
  setChatSystemPromptOverrides,
} from "../../SERVICEs/chat_storage";
import { readTokenUsageRecords } from "../../COMPONENTs/settings/token_usage/storage";
import { dispatchComposerPrefill } from "../../SERVICEs/composer_prefill";
import * as bootProgress from "../../SERVICEs/boot_progress";
import * as attachmentStorage from "../../SERVICEs/attachment_storage";
import {
  enqueueTurnMutation,
  fingerprintTurnMutationMessages,
  readTurnMutationOutbox,
} from "../../SERVICEs/turn_mutation_outbox";
import {
  QUEUED_TURN_OUTBOX_STORAGE_KEY,
  readPendingClarifyForChat,
  readPendingFyiOutbox,
  readPendingFyisForAttempt,
  readQueuedTurnsForAttempt,
  readQueuedTurnsForChat,
  writePendingFyi,
  writeQueuedTurnsForAttempt,
} from "../../SERVICEs/queued_turn_outbox";
import { computeCompletionDiagnosticsDigestV1 } from "../../SERVICEs/completion_diagnostics_v1";

const {
  buildRunBundleV1,
} = require("../../../electron/tests/fixtures/run_bundle_v1_fixture.cjs");
const {
  computeRunBundleDigest,
} = require("../../../electron/shared/run_bundle_v1");

const completionDiagnosticsFor = (memoryV2) => ({
  schema: "pupu.completion_diagnostics.v1",
  diagnostics_digest: computeCompletionDiagnosticsDigestV1(memoryV2),
  memory_v2: memoryV2,
});

const failedRunBundleV1 = () => {
  const bundle = buildRunBundleV1();
  bundle.lifecycle.status = "failed";
  bundle.bundle_digest = computeRunBundleDigest(bundle);
  return bundle;
};

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
      cancelExecution: jest.fn(async () => ({ status: "cancel_requested" })),
      getPendingInteraction: jest.fn(async ({ session_id: sessionId } = {}) => ({
        status: "none",
        session_id: sessionId || "",
      })),
      respondToolConfirmation: jest.fn(
        async ({ confirmation_id: confirmationId } = {}) => ({
          status: "ok",
          disposition: "live_only",
          durable: false,
          interaction_id: confirmationId || "",
        }),
      ),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.unchainAPI;
    delete window.runBundleStorageAPI;
    delete window.__pupuTestBridge;
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

  const installTestCommandBridge = () => {
    const handlers = new Map();
    window.__pupuTestBridge = {
      register: jest.fn((command, handler) => {
        handlers.set(command, handler);
        return () => {
          if (handlers.get(command) === handler) {
            handlers.delete(command);
          }
        };
      }),
    };
    return handlers;
  };

  const installAddressedV4Runs = () => {
    const runs = [];
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
        executionId: payload.threadId,
        attemptId,
        disconnect: run.disconnect,
        cancel: run.disconnect,
      };
    });
    return runs;
  };

  const completeAddressedV4Run = (run, content) => {
    const baseEvent = {
      schema_version: "v4",
      timestamp: "2026-07-21T12:00:00.000Z",
      session_id: run.payload.threadId,
      run_id: `run-${run.attemptId}`,
      agent_id: "developer",
      turn_id: `run-${run.attemptId}:turn-1`,
      links: {},
      surface: { slot: "trace_inline", scope: "turn" },
      visibility: "user",
      metadata: {},
    };
    act(() => {
      run.handlers.onRuntimeEvent({
        ...baseEvent,
        event_id: `${run.attemptId}-started`,
        seq: 1,
        type: "run.started",
        payload: { status: "running" },
      });
      run.handlers.onRuntimeEvent({
        ...baseEvent,
        event_id: `${run.attemptId}-delta`,
        seq: 2,
        type: "step.delta",
        payload: {
          step_id: `model:${run.attemptId}:response`,
          step_type: "model_response",
          kind: "text",
          delta: content,
        },
      });
      run.handlers.onRuntimeEvent({
        ...baseEvent,
        event_id: `${run.attemptId}-step-done`,
        seq: 3,
        type: "step.completed",
        payload: {
          step_id: `model:${run.attemptId}:response`,
          step_type: "model_response",
          status: "completed",
          final_text: content,
        },
      });
      run.handlers.onRuntimeEvent({
        ...baseEvent,
        event_id: `${run.attemptId}-done`,
        seq: 4,
        type: "run.completed",
        payload: { status: "completed" },
      });
      run.handlers.onDone({ finished_at: Date.now() });
    });
  };

  const seedPersistedV4Attempt = ({
    chatId,
    requestId = "request-reattach",
    attemptId = "attempt-reattach",
    assistantId = "assistant-reattach",
    content = "partial",
  }) => {
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    setChatMessages(
      chatId,
      [
        {
          id: `user-${attemptId}`,
          role: "user",
          content: "continue the original run",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: assistantId,
          role: "assistant",
          content,
          status: "streaming",
          createdAt: 2,
          updatedAt: 2,
          traceFrames: [],
          subagentFrames: {},
          subagentMetaByRunId: {},
          meta: {
            requestId,
            attemptId,
            executionSessionId: chatId,
          },
        },
      ],
      { source: "test" },
    );
  };

  const buildReattachEvent = ({
    chatId,
    id,
    type,
    seq,
    payload = {},
    links = {},
  }) => ({
    schema_version: "v4",
    timestamp: "2026-07-21T12:00:00.000Z",
    session_id: chatId,
    run_id: "run-reattach",
    agent_id: "developer",
    turn_id: "run-reattach:turn-1",
    links,
    surface: { slot: "trace_inline", scope: "turn" },
    visibility: "user",
    metadata: {},
    event_id: id,
    seq,
    type,
    payload,
  });

  const installSilentQueueRelayWatchdog = ({
    chatId,
    queueId,
    queueText,
    attachErrorCode,
    cancelResponse,
  }) => {
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [{ id: queueId, text: queueText, status: "queued" }],
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (identity, handlers = {}) => {
        if (identity.attemptId === "attempt-reattach") {
          handlers.onDone({ finished_at: Date.now() });
          return {
            requestId: "request-reattach",
            executionId: chatId,
            attemptId: "attempt-reattach",
            terminal: true,
            active: false,
            detach: jest.fn(),
            disconnect: jest.fn(),
            cancel: jest.fn(),
          };
        }
        throw Object.assign(new Error(`attach failed: ${attachErrorCode}`), {
          code: attachErrorCode,
        });
      },
    );
    window.unchainAPI.cancelExecution = jest.fn(async () => cancelResponse);
    const runs = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      const runNumber = runs.length + 1;
      const run = {
        payload,
        handlers,
        requestId: `request-watchdog-${runNumber}`,
        attemptId: `attempt-watchdog-${runNumber}`,
        disconnect: jest.fn(),
      };
      runs.push(run);
      return {
        requestId: run.requestId,
        executionId: payload.threadId,
        attemptId: run.attemptId,
        detach: jest.fn(),
        disconnect: run.disconnect,
        cancel: run.disconnect,
      };
    });
    return runs;
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

  test("Test API starts, reads, and cancels only the addressed chat attempt", async () => {
    const commandHandlers = installTestCommandBridge();
    const runs = installAddressedV4Runs();
    const chatAId = getChatsStore().activeChatId;
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:gpt-5" }, { source: "test" });
    const createdB = createChatInSelectedContext(
      { title: "Test API B" },
      { source: "test" },
    );
    setChatModel(createdB.chatId, { id: "openai:gpt-5" }, { source: "test" });
    selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });

    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(commandHandlers.has("startChatRun")).toBe(true);
      expect(commandHandlers.has("getChatRun")).toBe(true);
      expect(commandHandlers.has("cancelChatRun")).toBe(true);
    });

    await expect(
      commandHandlers.get("startChatRun")({
        id: chatAId,
        text: "must not cross into B",
      }),
    ).rejects.toMatchObject({ code: "chat_not_active" });
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();

    act(() => {
      selectTreeNode({ nodeId: chatANodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(
        document.querySelector("[data-chat-id]")?.getAttribute("data-chat-id"),
      ).toBe(chatAId);
    });

    const started = await commandHandlers.get("startChatRun")({
      id: chatAId,
      text: "start exact A",
    });
    expect(started).toMatchObject({
      chat_id: chatAId,
      execution_id: chatAId,
      attempt_id: `attempt-${chatAId}`,
      status: "running",
    });
    expect(runs).toHaveLength(1);

    expect(
      commandHandlers.get("getChatRun")({
        id: chatAId,
        attempt_id: `attempt-${chatAId}`,
      }),
    ).toMatchObject({
      chat_id: chatAId,
      attempt_id: `attempt-${chatAId}`,
      status: "running",
    });

    await expect(
      commandHandlers.get("cancelChatRun")({
        id: chatAId,
        attempt_id: `attempt-${createdB.chatId}`,
      }),
    ).rejects.toMatchObject({ code: "attempt_mismatch" });
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();

    await expect(
      commandHandlers.get("cancelChatRun")({
        id: chatAId,
        attempt_id: `attempt-${chatAId}`,
      }),
    ).resolves.toMatchObject({
      ok: true,
      chat_id: chatAId,
      attempt_id: `attempt-${chatAId}`,
      status: "cancel_requested",
    });
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
      owner_chat_id: chatAId,
      session_id: chatAId,
      attempt_id: `attempt-${chatAId}`,
      request_id: `attempt-${chatAId}`,
      reason: "test_api_cancel",
      idempotency_key: `stop:attempt-${chatAId}`,
    });
    expect(runs[0].disconnect).toHaveBeenCalledTimes(1);
    expect(
      commandHandlers.get("getChatRun")({
        id: chatAId,
        attempt_id: `attempt-${chatAId}`,
      }),
    ).toMatchObject({
      chat_id: chatAId,
      attempt_id: `attempt-${chatAId}`,
      status: "cancelled",
      content: "",
      message_id: expect.any(String),
    });
  });

  test("blocking Test API messages stay bound to their chat after switching", async () => {
    const commandHandlers = installTestCommandBridge();
    const runs = installAddressedV4Runs();
    const chatAId = getChatsStore().activeChatId;
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:gpt-5" }, { source: "test" });
    const createdB = createChatInSelectedContext(
      { title: "Blocking B" },
      { source: "test" },
    );
    setChatModel(createdB.chatId, { id: "openai:gpt-5" }, { source: "test" });
    selectTreeNode({ nodeId: chatANodeId }, { source: "test" });

    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(commandHandlers.has("sendMessage")).toBe(true);
    });

    let aResolved = false;
    const replyAPromise = commandHandlers
      .get("sendMessage")({ id: chatAId, text: "question A" })
      .then((reply) => {
        aResolved = true;
        return reply;
      });
    await waitFor(() => expect(runs).toHaveLength(1));
    const runA = runs[0];

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(
        document.querySelector("[data-chat-id]")?.getAttribute("data-chat-id"),
      ).toBe(createdB.chatId);
    });
    const replyBPromise = commandHandlers.get("sendMessage")({
      id: createdB.chatId,
      text: "question B",
    });
    await waitFor(() => expect(runs).toHaveLength(2));
    const runB = runs[1];

    completeAddressedV4Run(runB, "answer B");
    await expect(replyBPromise).resolves.toMatchObject({
      chat_id: createdB.chatId,
      attempt_id: `attempt-${createdB.chatId}`,
      content: "answer B",
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(aResolved).toBe(false);

    completeAddressedV4Run(runA, "answer A");
    await expect(replyAPromise).resolves.toMatchObject({
      chat_id: chatAId,
      attempt_id: `attempt-${chatAId}`,
      content: "answer A",
    });
  });

  test("keeps an exact Test API cancellation terminal when the stream event wins the race", async () => {
    const commandHandlers = installTestCommandBridge();
    const runs = installAddressedV4Runs();
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    let resolveCancellation;
    window.unchainAPI.cancelExecution = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveCancellation = resolve;
        }),
    );

    renderChat();
    await waitForReady();
    const started = await commandHandlers.get("startChatRun")({
      id: chatId,
      text: "cancel before first token",
    });
    const cancellation = commandHandlers.get("cancelChatRun")({
      id: chatId,
      attempt_id: started.attempt_id,
    });
    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
    });

    act(() => {
      runs[0].handlers.onError({
        code: "cancelled",
        message: "Execution cancelled",
        cancelled: true,
      });
    });
    await waitFor(() => {
      expect(
        commandHandlers.get("getChatRun")({
          id: chatId,
          attempt_id: started.attempt_id,
        }),
      ).toMatchObject({ status: "cancelled", content: "" });
    });

    await act(async () => {
      resolveCancellation({ status: "cancel_requested" });
      await cancellation;
    });
    expect(
      commandHandlers.get("getChatRun")({
        id: chatId,
        attempt_id: started.attempt_id,
      }),
    ).toMatchObject({
      status: "cancelled",
      content: "",
      message_id: expect.any(String),
    });
  });

  test("Test API same-tick activation starts each chat with its exact stored run config", async () => {
    const commandHandlers = installTestCommandBridge();
    const runs = installAddressedV4Runs();
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        runtime: {
          workspaces: [
            { id: "workspace-a", path: "/tmp/exact-a" },
            { id: "workspace-b", path: "/tmp/exact-b" },
          ],
        },
      }),
    );
    const chatAId = getChatsStore().activeChatId;
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:model-a" }, { source: "test" });
    setChatSessionBundle(
      chatAId,
      {
        selectedToolkits: ["toolkit.a"],
        selectedWorkspaceIds: ["workspace-a"],
        selectedRecipeName: "Recipe A",
        agentOrchestration: { mode: "developer_waiting_approval" },
      },
      { source: "test" },
    );
    setChatSystemPromptOverrides(
      chatAId,
      { rules: "rules-a" },
      { source: "test" },
    );
    const createdB = createChatInSelectedContext(
      { title: "Exact config B" },
      { source: "test" },
    );
    setChatModel(
      createdB.chatId,
      { id: "openai:model-b" },
      { source: "test" },
    );
    setChatSessionBundle(
      createdB.chatId,
      {
        selectedToolkits: ["toolkit.b"],
        selectedWorkspaceIds: ["workspace-b"],
        selectedRecipeName: "Recipe B",
        agentOrchestration: { mode: "default" },
      },
      { source: "test" },
    );
    setChatSystemPromptOverrides(
      createdB.chatId,
      { rules: "rules-b" },
      { source: "test" },
    );
    selectTreeNode({ nodeId: chatANodeId }, { source: "test" });

    renderChat();
    await waitForReady();
    let startBPromise;
    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test-api" });
      startBPromise = commandHandlers.get("startChatRun")({
        id: createdB.chatId,
        text: "exact B",
      });
    });
    await startBPromise;
    expect(runs[0].payload).toEqual(
      expect.objectContaining({
        threadId: createdB.chatId,
        options: expect.objectContaining({
          modelId: "openai:model-b",
          toolkits: ["toolkit.b"],
          workspace_root: "/tmp/exact-b",
          workspace_roots: ["/tmp/exact-b"],
          recipe_name: "Recipe B",
          agent_orchestration: { mode: "default" },
          system_prompt_v2: expect.objectContaining({
            overrides: { rules: "rules-b" },
          }),
        }),
      }),
    );

    let startAPromise;
    act(() => {
      selectTreeNode({ nodeId: chatANodeId }, { source: "test-api" });
      startAPromise = commandHandlers.get("startChatRun")({
        id: chatAId,
        text: "exact A",
      });
    });
    await startAPromise;
    expect(runs[1].payload).toEqual(
      expect.objectContaining({
        threadId: chatAId,
        options: expect.objectContaining({
          modelId: "openai:model-a",
          toolkits: ["toolkit.a"],
          workspace_root: "/tmp/exact-a",
          workspace_roots: ["/tmp/exact-a"],
          recipe_name: "Recipe A",
          agent_orchestration: { mode: "developer_waiting_approval" },
          system_prompt_v2: expect.objectContaining({
            overrides: { rules: "rules-a" },
          }),
        }),
      }),
    );
    completeAddressedV4Run(runs[0], "done B");
    completeAddressedV4Run(runs[1], "done A");
  });

  test("treats a V4 done error as failed and never as a successful Test API run", async () => {
    const commandHandlers = installTestCommandBridge();
    const runs = installAddressedV4Runs();
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });

    renderChat();
    await waitForReady();
    const started = await commandHandlers.get("startChatRun")({
      id: chatId,
      text: "surface terminal failure",
    });
    act(() => {
      runs[0].handlers.onDone({
        error: { code: "stream_failed", message: "boom" },
      });
    });

    await waitFor(() => {
      expect(
        commandHandlers.get("getChatRun")({
          id: chatId,
          attempt_id: started.attempt_id,
        }),
      ).toMatchObject({
        status: "failed",
        error: { code: "stream_failed", message: "boom" },
      });
    });
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
  });

  test("blocking Test API resolves a successful artifact-only run with empty text", async () => {
    const commandHandlers = installTestCommandBridge();
    const runs = installAddressedV4Runs();
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });

    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(commandHandlers.has("sendMessage")).toBe(true);
    });

    const replyPromise = commandHandlers.get("sendMessage")({
      id: chatId,
      text: "create an artifact without prose",
    });
    await waitFor(() => expect(runs).toHaveLength(1));
    completeAddressedV4Run(runs[0], "");

    await expect(replyPromise).resolves.toMatchObject({
      chat_id: chatId,
      attempt_id: `attempt-${chatId}`,
      content: "",
    });
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
      provider: "openai",
      model: "gpt-5",
      presentation: {
        trace_frame: {
          seq: 0,
          ts: 100,
          type: "tool_call",
          run_id: sourceRunId,
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

  const installDurableBridge = ({ resolvePending, cancelExecution }) => {
    const runs = [];
    if (typeof cancelExecution === "function") {
      window.unchainAPI.cancelExecution.mockImplementation(cancelExecution);
    }
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
        owner_chat_id: activeChatId,
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
        status: "ok",
        execution_id: activeChatId,
        attempt_id: "attempt-v4-1",
        state: "cancelled",
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
      .mockImplementationOnce(async (payload) => ({
        status: "ok",
        execution_id: payload.session_id,
        attempt_id: payload.attempt_id,
        state: "cancelled",
      }));
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
        owner_chat_id: activeChatId,
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

  test("commits a transient first turn before an immediate chat switch", async () => {
    const chatAId = seedActiveChatMessages([
      {
        id: "user-stable-chat-a",
        role: "user",
        content: "Stable chat A",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    const createdB = createChatInSelectedContext(
      { parentFolderId: null },
      { source: "test" },
    );
    setChatModel(
      createdB.chatId,
      { id: "openai:gpt-5" },
      { source: "test" },
    );
    expect(createdB.store.chatsById[createdB.chatId].isTransientNewChat).toBe(
      true,
    );

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "First turn in chat B" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    act(() => {
      selectTreeNode({ nodeId: chatANodeId }, { source: "test" });
    });

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(lastChatMessagesProps?.chatId).toBe(chatAId);
    });

    const afterSwitch = getChatsStore();
    const persistedB = afterSwitch.chatsById[createdB.chatId];
    expect(persistedB).toBeDefined();
    expect(persistedB.isTransientNewChat).toBe(false);
    expect(persistedB.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "First turn in chat B",
        }),
        expect.objectContaining({
          role: "assistant",
          status: "streaming",
        }),
      ]),
    );
    expect(
      Object.values(afterSwitch.tree.nodesById).some(
        (node) => node?.chatId === createdB.chatId,
      ),
    ).toBe(true);
    expect(cancelSpy).not.toHaveBeenCalled();
    expect(lastChatMessagesProps?.messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: "Stable chat A",
      }),
    ]);
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
          owner_chat_id: chatAId,
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

  test("blocks a second send while character preflight has no stream handle", async () => {
    const seeded = getChatsStore();
    setChatModel(seeded.activeChatId, { id: "openai:gpt-5" }, { source: "test" });
    openCharacterChat(
      { character: { id: "nico", name: "Nico" } },
      { source: "test" },
    );
    let resolveCharacterPreflight;
    window.unchainAPI.buildCharacterAgentConfig.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCharacterPreflight = resolve;
        }),
    );

    renderChat();
    await waitForReady();
    const characterChatId = getChatsStore().activeChatId;
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "First character turn" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.buildCharacterAgentConfig).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
      expect(screen.getByTestId("chat-input")).toHaveValue("");
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Second turn must remain a draft" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.buildCharacterAgentConfig).toHaveBeenCalledTimes(1);
      expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
      expect(screen.getByTestId("chat-input")).toHaveValue(
        "Second turn must remain a draft",
      );
      const messages = getChatsStore().chatsById[characterChatId]?.messages;
      expect(messages.filter((message) => message.role === "user")).toHaveLength(
        1,
      );
      expect(
        messages.filter(
          (message) =>
            message.role === "assistant" && message.status === "streaming",
        ),
      ).toHaveLength(1);
    });

    await act(async () => {
      resolveCharacterPreflight({
        session_id: "character_nico__dm__main",
        run_memory_namespace: "character_nico__rel__local_user",
        default_model: "openai:gpt-4.1",
        instructions: "You are Nico.",
        decision: { action: "reply", courtesy_message: null },
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("chat-input")).toHaveValue(
        "Second turn must remain a draft",
      );
    });
  });

  test("persists an optimistic character turn before pending preflight unmounts", async () => {
    const seeded = getChatsStore();
    setChatModel(seeded.activeChatId, { id: "openai:gpt-5" }, { source: "test" });
    openCharacterChat(
      { character: { id: "nico", name: "Nico" } },
      { source: "test" },
    );
    let resolveCharacterPreflight;
    window.unchainAPI.buildCharacterAgentConfig.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCharacterPreflight = resolve;
        }),
    );

    const view = renderChat();
    await waitForReady();
    const characterChatId = getChatsStore().activeChatId;
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Persist before leaving chat" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.buildCharacterAgentConfig).toHaveBeenCalledTimes(1);
      expect(getChatsStore().chatsById[characterChatId]?.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: "Persist before leaving chat",
          }),
          expect.objectContaining({
            role: "assistant",
            status: "streaming",
          }),
        ]),
      );
    });

    view.unmount();
    expect(getChatsStore().chatsById[characterChatId]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "Persist before leaving chat",
        }),
      ]),
    );

    await act(async () => {
      resolveCharacterPreflight({
        session_id: "character_nico__dm__main",
        run_memory_namespace: "character_nico__rel__local_user",
        instructions: "You are Nico.",
        decision: { action: "reply", courtesy_message: null },
      });
      await Promise.resolve();
    });
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(getChatsStore().chatsById[characterChatId]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "Persist before leaving chat",
        }),
      ]),
    );
  });

  test("reattaches a persisted V4 attempt without starting a duplicate turn", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    setChatMessages(
      chatId,
      [
        {
          id: "user-reattach",
          role: "user",
          content: "continue the original run",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "assistant-reattach",
          role: "assistant",
          content: "partial",
          status: "streaming",
          createdAt: 2,
          updatedAt: 2,
          traceFrames: [],
          subagentFrames: {},
          subagentMetaByRunId: {},
          meta: {
            requestId: "request-reattach",
            attemptId: "attempt-reattach",
            executionSessionId: chatId,
          },
        },
      ],
      { source: "test" },
    );
    window.unchainAPI.startStreamV4 = jest.fn();
    const detach = jest.fn();
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        const baseEvent = {
          schema_version: "v4",
          timestamp: "2026-07-21T12:00:00.000Z",
          session_id: chatId,
          run_id: "run-reattach",
          agent_id: "developer",
          turn_id: "run-reattach:turn-1",
          links: {},
          surface: { slot: "trace_inline", scope: "turn" },
          visibility: "user",
          metadata: {},
        };
        handlers.onRuntimeEvent(
          {
            ...baseEvent,
            event_id: "reattach-started",
            seq: 1,
            type: "run.started",
            payload: { status: "running" },
          },
          { streamSeq: 1 },
        );
        handlers.onRuntimeEvent(
          {
            ...baseEvent,
            event_id: "reattach-delta",
            seq: 2,
            type: "step.delta",
            payload: {
              step_id: "model:reattach:response",
              step_type: "model_response",
              kind: "text",
              delta: "recovered without duplication",
            },
          },
          { streamSeq: 2 },
        );
        handlers.onRuntimeEvent(
          {
            ...baseEvent,
            event_id: "reattach-step-done",
            seq: 3,
            type: "step.completed",
            payload: {
              step_id: "model:reattach:response",
              step_type: "model_response",
              status: "completed",
              final_text: "recovered without duplication",
            },
          },
          { streamSeq: 3 },
        );
        handlers.onRuntimeEvent(
          {
            ...baseEvent,
            event_id: "reattach-done",
            seq: 4,
            type: "run.completed",
            payload: { status: "completed" },
          },
          { streamSeq: 4 },
        );
        handlers.onDone({ finished_at: Date.now() });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          detach,
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );

    renderChat();
    await waitForReady();

    await waitFor(() => {
      const messages = getChatsStore().chatsById[chatId].messages;
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({
        id: "assistant-reattach",
        role: "assistant",
        status: "done",
        content: "recovered without duplication",
      });
    });
    expect(window.unchainAPI.attachStreamV4).toHaveBeenCalledWith(
      {
        requestId: "request-reattach",
        executionId: chatId,
        attemptId: "attempt-reattach",
        afterSeq: 0,
      },
      expect.objectContaining({
        onRuntimeEvent: expect.any(Function),
        onDone: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("keeps a reattached terminal stream pending until canonical accounting is durable", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    const bundle = buildRunBundleV1();
    const completionDiagnostics = completionDiagnosticsFor({
      mode: "shadow",
      trace_status: "complete",
      shadow_only: true,
    });
    let resolveUpsert;
    window.runBundleStorageAPI = {
      upsert: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveUpsert = resolve;
          }),
      ),
      query: jest.fn(async () => ({ ok: true, records: [] })),
      clear: jest.fn(async () => ({ ok: true, deleted: 0 })),
    };
    window.unchainAPI.startStreamV4 = jest.fn();
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onDone({
          bundle,
          completion_diagnostics: completionDiagnostics,
        });
        handlers.onRuntimeEvent(
          buildReattachEvent({
            chatId,
            id: "late-after-accounting-barrier",
            type: "step.delta",
            seq: 99,
            payload: {
              step_id: "model:late:response",
              step_type: "model_response",
              kind: "text",
              delta: "LATE ACCOUNTING FRAME MUST BE IGNORED",
            },
          }),
          { streamSeq: 99 },
        );
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );

    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(window.runBundleStorageAPI.upsert).toHaveBeenCalledTimes(1);
    });
    expect(getChatsStore().chatsById[chatId].messages[1].status).toBe(
      "streaming",
    );

    await act(async () => {
      resolveUpsert({
        ok: true,
        status: "inserted",
        bundleId: bundle.bundle_id,
        revision: bundle.revision,
        bundleDigest: bundle.bundle_digest,
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getChatsStore().chatsById[chatId].messages[1]).toMatchObject({
        status: "done",
        meta: {
          bundle,
          completion_diagnostics: completionDiagnostics,
        },
      });
    });
    expect(getChatsStore().chatsById[chatId].messages[1].content).not.toContain(
      "LATE ACCOUNTING FRAME MUST BE IGNORED",
    );
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("restores an unresolved replay interaction with exact chat ownership", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    writePendingFyi({
      chatId,
      attemptId: "attempt-reattach",
      messageId: "fyi-replay-exact",
      text: "SOAK_FYI lane=A",
      requestedChannel: "fyi",
      threadId: chatId,
    });
    window.unchainAPI.startStreamV4 = jest.fn();
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onRuntimeEvent(
          buildReattachEvent({
            chatId,
            id: "reattach-started",
            type: "run.started",
            seq: 1,
            payload: { status: "running" },
          }),
          { streamSeq: 1 },
        );
        handlers.onRuntimeEvent(
          buildReattachEvent({
            chatId,
            id: "reattach-interaction",
            type: "interaction.requested",
            seq: 2,
            links: {
              tool_call_id: "call-gate",
              interaction_id: "confirm-gate",
            },
            payload: {
              interaction_id: "confirm-gate",
              kind: "tool_approval",
              renderer: "confirmation",
              prompt: "Approve deterministic gate",
              target: {
                tool_call_id: "call-gate",
                tool_name: "soak_gate",
                toolkit_id: "mcp.custom.deterministic-soak",
                arguments: { lane: "A", checkpoint: "durable-pause" },
              },
            },
          }),
          { streamSeq: 2 },
        );
        handlers.onRuntimeEvent(
          buildReattachEvent({
            chatId,
            id: "reattach-fyi",
            type: "interaction.fyi_injected",
            seq: 3,
            payload: {
              messages: [
                {
                  message_id: "fyi-replay-exact",
                  origin: "user",
                  text: "SOAK_FYI lane=A",
                },
              ],
            },
          }),
          { streamSeq: 3 },
        );
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: false,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );

    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-gate"
        ],
      ).toMatchObject({
        chatId,
        sessionId: chatId,
        callId: "call-gate",
        toolName: "soak_gate",
      });
      expect(
        lastChatMessagesProps?.toolConfirmationUiStateById?.["confirm-gate"],
      ).toMatchObject({ status: "idle", resolved: false });
      expect(
        getChatsStore().chatsById[chatId].messages[1].interjections,
      ).toEqual([
        expect.objectContaining({
          id: "fyi-fyi-replay-exact",
          type: "fyi",
          text: "SOAK_FYI lane=A",
          origin: "user",
        }),
      ]);
      expect(
        readPendingFyisForAttempt(chatId, "attempt-reattach"),
      ).toEqual([]);
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-reattach"),
      ).toBeNull();
    });

    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision({
        confirmationId: "confirm-gate",
        approved: true,
      });
    });
    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledWith({
      confirmation_id: "confirm-gate",
      approved: true,
      reason: "",
      session_id: chatId,
    });
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("keeps a replayed run failure terminal when the transport sends done", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId, content: "" });
    window.unchainAPI.startStreamV4 = jest.fn();
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onRuntimeEvent(
          buildReattachEvent({
            chatId,
            id: "reattach-failed",
            type: "run.failed",
            seq: 1,
            payload: {
              status: "failed",
              error: { code: "soak_failed", message: "failed safely" },
            },
          }),
          { streamSeq: 1 },
        );
        handlers.onDone({
          error: { code: "soak_failed", message: "failed safely" },
        });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );

    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(getChatsStore().chatsById[chatId].messages[1]).toMatchObject({
        status: "error",
        content: "[error] failed safely",
        meta: { error: { code: "soak_failed", message: "failed safely" } },
      });
    });
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("persists admitted accounting for a reattached failed canonical run", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId, content: "safe failed partial" });
    const bundle = failedRunBundleV1();
    const completionDiagnostics = completionDiagnosticsFor({
      mode: "active",
      trace_status: "partial",
      active_applied: false,
    });
    let resolveUpsert;
    window.runBundleStorageAPI = {
      upsert: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveUpsert = resolve;
          }),
      ),
      query: jest.fn(async () => ({ ok: true, records: [] })),
      clear: jest.fn(async () => ({ ok: true, deleted: 0 })),
    };
    window.unchainAPI.startStreamV4 = jest.fn();
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onRuntimeEvent(
          buildReattachEvent({
            chatId,
            id: "reattach-canonical-failed",
            type: "run.failed",
            seq: 1,
            payload: {
              status: "failed",
              error: {
                code: "reattach_failed",
                message: "reattach failed safely",
              },
            },
          }),
          { streamSeq: 1 },
        );
        handlers.onDone({
          error: {
            code: "reattach_failed",
            message: "reattach failed safely",
          },
          bundle,
          completion_diagnostics: completionDiagnostics,
        });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );

    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(window.runBundleStorageAPI.upsert).toHaveBeenCalledWith(bundle);
    });
    expect(getChatsStore().chatsById[chatId].messages[1].status).toBe(
      "streaming",
    );

    await act(async () => {
      resolveUpsert({
        ok: true,
        status: "inserted",
        bundleId: bundle.bundle_id,
        revision: bundle.revision,
        bundleDigest: bundle.bundle_digest,
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getChatsStore().chatsById[chatId].messages[1]).toMatchObject({
        status: "error",
        meta: {
          bundle,
          completion_diagnostics: completionDiagnostics,
          error: {
            code: "reattach_failed",
            message: "reattach failed safely",
          },
        },
      });
    });
  });

  test("fails closed when reattached failed-run accounting rejects", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId, content: "untrusted failed partial" });
    const bundle = failedRunBundleV1();
    const completionDiagnostics = completionDiagnosticsFor({
      mode: "shadow",
      trace_status: "complete",
      shadow_only: true,
    });
    window.runBundleStorageAPI = {
      upsert: jest.fn(async () => {
        throw new Error("reattach ledger unavailable");
      }),
      query: jest.fn(async () => ({ ok: true, records: [] })),
      clear: jest.fn(async () => ({ ok: true, deleted: 0 })),
    };
    window.unchainAPI.startStreamV4 = jest.fn();
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onDone({
          error: {
            code: "reattach_failed",
            message: "untrusted raw failure",
          },
          bundle,
          completion_diagnostics: completionDiagnostics,
        });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );

    renderChat();
    await waitForReady();
    await waitFor(() => {
      const assistant = getChatsStore().chatsById[chatId].messages[1];
      expect(assistant).toMatchObject({
        status: "error",
        meta: {
          error: {
            code: "run_bundle_accounting_failed",
            message:
              "The failed recovered run could not be admitted to the Run Bundle ledger.",
          },
        },
      });
      expect(assistant.meta?.bundle).toBeUndefined();
      expect(assistant.meta?.completion_diagnostics).toBeUndefined();
    });
  });

  test("preserves cancelled semantics when an attached stream is cancelled", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId, content: "safe partial" });
    window.unchainAPI.startStreamV4 = jest.fn();
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onError({ code: "cancelled", message: "Stream was cancelled" });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );

    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(getChatsStore().chatsById[chatId].messages[1]).toMatchObject({
        status: "cancelled",
        content: "safe partial",
      });
    });
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("persists exact V4 identity before an immediate unmount and reattaches", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const detach = jest.fn();
    window.unchainAPI.startStreamV4 = jest.fn((payload) => ({
      requestId: "request-immediate",
      executionId: payload.threadId,
      attemptId: "attempt-immediate",
      detach,
      disconnect: jest.fn(),
      cancel: jest.fn(),
    }));
    window.unchainAPI.attachStreamV4 = jest.fn(async () => ({
      requestId: "request-immediate",
      executionId: chatId,
      attemptId: "attempt-immediate",
      terminal: false,
      detach: jest.fn(),
      disconnect: jest.fn(),
      cancel: jest.fn(),
    }));

    const view = renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "persist identity immediately" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
      expect(
        getChatsStore().chatsById[chatId].messages.find(
          (message) => message.role === "assistant",
        )?.meta,
      ).toMatchObject({
        requestId: "request-immediate",
        attemptId: "attempt-immediate",
        executionSessionId: chatId,
      });
    });

    view.unmount();
    expect(detach).toHaveBeenCalledTimes(1);
    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(window.unchainAPI.attachStreamV4).toHaveBeenCalledWith(
        {
          requestId: "request-immediate",
          executionId: chatId,
          attemptId: "attempt-immediate",
          afterSeq: 0,
        },
        expect.any(Object),
      );
    });
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
  });

  test("settles a missing replay once and never restarts the execution", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    setChatMessages(
      chatId,
      [
        {
          id: "user-missing-replay",
          role: "user",
          content: "do not run this twice",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "assistant-missing-replay",
          role: "assistant",
          content: "safe partial result",
          status: "streaming",
          createdAt: 2,
          updatedAt: 2,
          meta: {
            requestId: "request-missing",
            attemptId: "attempt-missing",
            executionSessionId: chatId,
          },
        },
      ],
      { source: "test" },
    );
    window.unchainAPI.startStreamV4 = jest.fn();
    window.unchainAPI.attachStreamV4 = jest.fn(async () => {
      throw Object.assign(new Error("expired"), { code: "stream_not_found" });
    });

    renderChat();
    await waitForReady();

    await waitFor(() => {
      const messages = getChatsStore().chatsById[chatId].messages;
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({
        id: "assistant-missing-replay",
        status: "cancelled",
        content: "safe partial result",
      });
      expect(getChatsStore().chatsById[chatId].isGenerating).toBe(false);
    });
    expect(window.unchainAPI.attachStreamV4).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("restores a character draft when preflight fails after switching chats", async () => {
    const normalChatId = seedActiveChatMessages([
      {
        id: "normal-chat-seed",
        role: "user",
        content: "Keep this normal chat",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const normalNodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(normalChatId, { id: "openai:gpt-5" }, { source: "test" });
    const openedCharacter = openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
        },
      },
      { source: "test" },
    );
    expect(openedCharacter.ok).toBe(true);

    delete window.unchainAPI.getPendingInteraction;
    let rejectCharacterPreflight;
    window.unchainAPI.buildCharacterAgentConfig.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectCharacterPreflight = reject;
        }),
    );

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Draft that must return" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.buildCharacterAgentConfig).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("chat-input")).toHaveValue("");
    });

    act(() => {
      selectTreeNode({ nodeId: normalNodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(normalChatId);
    });
    await act(async () => {
      rejectCharacterPreflight(new Error("character preflight failed"));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(
        getChatsStore().chatsById[openedCharacter.chatId]?.draft?.text,
      ).toBe("Draft that must return");
    });

    act(() => {
      selectTreeNode({ nodeId: openedCharacter.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(getChatsStore().activeChatId).toBe(openedCharacter.chatId);
      expect(screen.getByTestId("chat-input")).toHaveValue(
        "Draft that must return",
      );
    });
  });

  test("clears the originating draft when attachment hydration finishes in the background", async () => {
    const chatAId = seedActiveChatMessages([
      {
        id: "chat-a-history-attachment",
        role: "user",
        content: "Earlier attachment",
        attachments: [
          {
            id: "attachment-hydration-success",
            name: "history.txt",
            kind: "text",
            mimeType: "text/plain",
            sizeBytes: 7,
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:gpt-5" }, { source: "test" });
    const createdB = createChatInSelectedContext(
      { title: "Hydration Chat B" },
      { source: "test" },
    );
    setChatMessages(
      createdB.chatId,
      [
        {
          id: "chat-b-hydration-seed",
          role: "user",
          content: "Keep chat B",
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      { source: "test" },
    );
    setChatModel(createdB.chatId, { id: "openai:gpt-5" }, { source: "test" });
    selectTreeNode({ nodeId: chatANodeId }, { source: "test" });

    let resolveHydration;
    jest.spyOn(attachmentStorage, "loadAttachmentPayload").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHydration = resolve;
        }),
    );

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Send from chat A" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(attachmentStorage.loadAttachmentPayload).toHaveBeenCalledWith(
        "attachment-hydration-success",
      );
    });

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
    });
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Keep chat B draft" },
    });

    await act(async () => {
      resolveHydration({ type: "text", text: "history" });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(getChatsStore().chatsById[chatAId]?.draft).toMatchObject({
        text: "",
        attachments: [],
      });
      expect(screen.getByTestId("chat-input")).toHaveValue(
        "Keep chat B draft",
      );
    });
  });

  test("does not clear a newer originating draft after delayed attachment hydration", async () => {
    const chatAId = seedActiveChatMessages([
      {
        id: "chat-a-newer-draft-history",
        role: "user",
        content: "Earlier attachment",
        attachments: [
          {
            id: "attachment-hydration-newer-draft",
            name: "history.txt",
            kind: "text",
            mimeType: "text/plain",
            sizeBytes: 7,
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:gpt-5" }, { source: "test" });
    const createdB = createChatInSelectedContext(
      { title: "Draft Isolation Chat B" },
      { source: "test" },
    );
    setChatMessages(
      createdB.chatId,
      [
        {
          id: "chat-b-newer-draft-seed",
          role: "user",
          content: "Keep chat B",
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      { source: "test" },
    );
    setChatModel(createdB.chatId, { id: "openai:gpt-5" }, { source: "test" });
    selectTreeNode({ nodeId: chatANodeId }, { source: "test" });

    let resolveHydration;
    jest.spyOn(attachmentStorage, "loadAttachmentPayload").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHydration = resolve;
        }),
    );

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Original chat A send" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(attachmentStorage.loadAttachmentPayload).toHaveBeenCalledWith(
        "attachment-hydration-newer-draft",
      );
    });

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
    });
    act(() => {
      selectTreeNode({ nodeId: chatANodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(chatAId);
      expect(screen.getByTestId("chat-input")).toHaveValue(
        "Original chat A send",
      );
    });
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "New chat A draft" },
    });
    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
      expect(getChatsStore().chatsById[chatAId]?.draft?.text).toBe(
        "New chat A draft",
      );
    });

    await act(async () => {
      resolveHydration({ type: "text", text: "history" });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(getChatsStore().chatsById[chatAId]?.draft?.text).toBe(
        "New chat A draft",
      );
      expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
    });
  });

  test("does not restore an old character draft after delayed preflight fails", async () => {
    const normalChatId = seedActiveChatMessages([
      {
        id: "normal-hydration-seed",
        role: "user",
        content: "Normal chat",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const normalNodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(normalChatId, { id: "openai:gpt-5" }, { source: "test" });
    const openedCharacter = openCharacterChat(
      { character: { id: "nico", name: "Nico" } },
      { source: "test" },
    );
    setChatMessages(
      openedCharacter.chatId,
      [
        {
          id: "character-history-attachment",
          role: "user",
          content: "Earlier attachment",
          attachments: [
            {
              id: "attachment-hydration-failure",
              name: "history.txt",
              kind: "text",
              mimeType: "text/plain",
              sizeBytes: 7,
            },
          ],
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      { source: "test" },
    );

    let resolveHydration;
    jest.spyOn(attachmentStorage, "loadAttachmentPayload").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHydration = resolve;
        }),
    );
    let rejectCharacterPreflight;
    window.unchainAPI.buildCharacterAgentConfig.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectCharacterPreflight = reject;
        }),
    );

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Character draft A" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(attachmentStorage.loadAttachmentPayload).toHaveBeenCalledWith(
        "attachment-hydration-failure",
      );
    });

    act(() => {
      selectTreeNode({ nodeId: normalNodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(normalChatId);
    });
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Normal draft B" },
    });
    act(() => {
      selectTreeNode({ nodeId: openedCharacter.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(openedCharacter.chatId);
      expect(screen.getByTestId("chat-input")).toHaveValue(
        "Character draft A",
      );
    });
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "New character draft A" },
    });
    act(() => {
      selectTreeNode({ nodeId: normalNodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(normalChatId);
      expect(
        getChatsStore().chatsById[openedCharacter.chatId]?.draft?.text,
      ).toBe("New character draft A");
    });

    await act(async () => {
      resolveHydration({ type: "text", text: "history" });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(window.unchainAPI.buildCharacterAgentConfig).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      rejectCharacterPreflight(new Error("character preflight failed"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        getChatsStore().chatsById[openedCharacter.chatId]?.draft?.text,
      ).toBe("New character draft A");
      expect(getChatsStore().chatsById[normalChatId]?.draft?.text).toBe(
        "Normal draft B",
      );
    });
  });

  test("does not resurrect a sent draft after an inactive type-and-erase ABA edit", async () => {
    const normalChatId = seedActiveChatMessages([
      {
        id: "normal-aba-seed",
        role: "user",
        content: "Normal chat",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const normalNodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(normalChatId, { id: "openai:gpt-5" }, { source: "test" });
    const openedCharacter = openCharacterChat(
      { character: { id: "nico", name: "Nico" } },
      { source: "test" },
    );

    let rejectCharacterPreflight;
    window.unchainAPI.buildCharacterAgentConfig.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectCharacterPreflight = reject;
        }),
    );

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Original character draft" },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.buildCharacterAgentConfig).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("chat-input")).toHaveValue("");
    });

    act(() => {
      selectTreeNode({ nodeId: normalNodeId }, { source: "test" });
      selectTreeNode({ nodeId: openedCharacter.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(openedCharacter.chatId);
    });
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Temporary replacement" },
    });
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "" },
    });
    act(() => {
      selectTreeNode({ nodeId: normalNodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(normalChatId);
    });

    await act(async () => {
      rejectCharacterPreflight(new Error("character preflight failed"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        getChatsStore().chatsById[openedCharacter.chatId]?.draft?.text,
      ).toBe("");
      expect(lastChatMessagesProps?.chatId).toBe(normalChatId);
    });
  });

  test("does not clear a newer character draft when delayed preflight defers", async () => {
    const normalChatId = seedActiveChatMessages([
      {
        id: "normal-defer-seed",
        role: "user",
        content: "Normal chat",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const normalNodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(normalChatId, { id: "openai:gpt-5" }, { source: "test" });
    const openedCharacter = openCharacterChat(
      { character: { id: "nico", name: "Nico" } },
      { source: "test" },
    );

    let resolveCharacterPreflight;
    window.unchainAPI.buildCharacterAgentConfig.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCharacterPreflight = resolve;
        }),
    );

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Original character send" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.buildCharacterAgentConfig).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("chat-input")).toHaveValue("");
    });

    act(() => {
      selectTreeNode({ nodeId: normalNodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(normalChatId);
    });
    act(() => {
      selectTreeNode({ nodeId: openedCharacter.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(openedCharacter.chatId);
    });
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "New character draft after send" },
    });

    await act(async () => {
      resolveCharacterPreflight({
        session_id: "character_nico__dm__main",
        run_memory_namespace: "character_nico__rel__local_user",
        instructions: "You are Nico.",
        decision: {
          action: "defer",
          courtesy_message: "I'm working right now, later?",
        },
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
      expect(screen.getByTestId("chat-input")).toHaveValue(
        "New character draft after send",
      );
      expect(lastChatMessagesProps?.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "assistant",
            content: "I'm working right now, later?",
            status: "done",
          }),
        ]),
      );
    });
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

  test("persists agent orchestration while leaving legacy token usage read-only", async () => {
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
    expect(readTokenUsageRecords()).toEqual([]);

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

  test("rehydrates an awaiting durable interaction without cancelling or auto-resuming it", async () => {
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
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    expect(lastChatInputProps?.sendDisabled).toBe(false);
    expect(
      findConfirmationFrames(
        lastChatMessagesProps?.messages,
        interactionId,
      ).filter(({ frame }) => frame.type === "tool_call"),
    ).toHaveLength(1);
  });

  test("keeps a failed durable human-input request actionable and records its submitted answer as confirmed", async () => {
    const interactionId = "interaction-human-input-after-error";
    const callId = "call-human-input-after-error";
    const sourceRunId = "attempt-human-input-after-error";
    const sessionId = getChatsStore().activeChatId;
    const interactConfig = {
      request_id: callId,
      kind: "selector",
      title: "Choose a stack",
      question: "Which stack should be used?",
      selection_mode: "single",
      options: [{ label: "Web", value: "web", description: "" }],
      allow_other: false,
      other_label: "Other",
      other_placeholder: "",
      min_selected: 1,
      max_selected: 1,
    };
    const toolCall = {
      call_id: callId,
      confirmation_id: interactionId,
      requires_confirmation: true,
      toolkit_id: "core",
      toolkit_name: "Core",
      tool_name: "ask_user_question",
      tool_display_name: "Ask User",
      arguments: interactConfig,
      description: interactConfig.question,
      interact_type: "single",
      interact_config: interactConfig,
    };
    const buildHumanInputPending = (status) => ({
      status,
      session_id: sessionId,
      interaction_id: interactionId,
      source_run_id: sourceRunId,
      active_attempt_id: sourceRunId,
      kind: "human_input",
      provider: "openai",
      model: "gpt-5",
      presentation: {
        trace_frame: {
          seq: 0,
          ts: 100,
          run_id: sourceRunId,
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
            receipt_id: "receipt-human-input-after-error",
            resolution: {
              outcome: "submitted",
              response: {
                request_id: interactConfig.request_id,
                selected_values: ["web"],
                other_text: null,
              },
            },
          }
        : {}),
    });
    let authoritativePending = { status: "none", session_id: sessionId };
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? authoritativePending
          : { status: "none", session_id: requestedSessionId },
      cancelExecution: async (payload) => {
        authoritativePending = { status: "none", session_id: sessionId };
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });
    window.unchainAPI.respondToolConfirmation.mockImplementation(async () => {
      authoritativePending = buildHumanInputPending("receipt_recorded");
      return {
        status: "ok",
        disposition: "receipt_recorded",
        durable: true,
        session_id: sessionId,
        interaction_id: interactionId,
        receipt_id: "receipt-human-input-after-error",
      };
    });

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Ask me which stack to use" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(bridge.runs).toHaveLength(1);
    });
    const runHandlers = bridge.runs[0].handlers;

    act(() => {
      runHandlers.onRuntimeEvent(
        {
          schema_version: "v4",
          timestamp: "2026-08-14T12:00:00.000Z",
          session_id: sessionId,
          event_id: "event-human-input-after-error",
          seq: 1,
          run_id: sourceRunId,
          agent_id: "developer",
          turn_id: `${sourceRunId}:turn-1`,
          type: "interaction.requested",
          links: {
            tool_call_id: callId,
            interaction_id: interactionId,
          },
          surface: { slot: "trace_inline", scope: "turn" },
          visibility: "user",
          metadata: {},
          payload: {
            interaction_id: interactionId,
            kind: "human_input",
            renderer: "single",
            title: interactConfig.title,
            prompt: interactConfig.question,
            selection_mode: interactConfig.selection_mode,
            options: interactConfig.options,
            allow_other: interactConfig.allow_other,
            min_selected: interactConfig.min_selected,
            max_selected: interactConfig.max_selected,
            target: {
              tool_call_id: callId,
              tool_name: "ask_user_question",
              toolkit_id: "core",
              arguments: interactConfig,
            },
          },
        },
        { streamSeq: 1 },
      );
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[interactionId],
      ).toBeDefined();
    });

    const lookupCountBeforeFailure =
      window.unchainAPI.getPendingInteraction.mock.calls.length;
    authoritativePending = buildHumanInputPending("awaiting_response");
    act(() => {
      runHandlers.onError({
        code: "context_execution_bundle_error",
        message: "durable host event could not be bound",
      });
    });

    await waitFor(() => {
      expect(
        window.unchainAPI.getPendingInteraction.mock.calls.length,
      ).toBeGreaterThan(lookupCountBeforeFailure);
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[interactionId],
      ).toBeDefined();
      expect(
        lastChatMessagesProps?.toolConfirmationUiStateById?.[interactionId],
      ).toEqual(
        expect.objectContaining({
          status: "idle",
          resolved: false,
          decision: "",
        }),
      );
      expect(
        lastChatMessagesProps?.messages?.find(
          (message) => message.role === "assistant",
        )?.status,
      ).toBe("error");
    });

    const userResponse = { value: "web" };
    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision({
        confirmationId: interactionId,
        approved: true,
        userResponse,
      });
    });

    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
        owner_chat_id: sessionId,
        session_id: sessionId,
        attempt_id: sourceRunId,
        source_attempt_id: sourceRunId,
        interaction_id: interactionId,
        reason: "interaction_suspended",
        idempotency_key: `interaction-pause:${sourceRunId}:${interactionId}`,
      });
    });
    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledWith({
      confirmation_id: interactionId,
      session_id: sessionId,
      approved: true,
      reason: "",
      modified_arguments: { user_response: userResponse },
    });
    const decisionFrames = findConfirmationFrames(
      lastChatMessagesProps?.messages,
      interactionId,
    ).map(({ frame }) => frame);
    expect(decisionFrames.filter((frame) => frame.type === "tool_confirmed"))
      .toHaveLength(1);
    expect(decisionFrames.filter((frame) => frame.type === "tool_denied"))
      .toHaveLength(0);
    expect(bridge.resumeRuns()).toHaveLength(0);
  });

  test("cold fresh send seals the exact awaiting attempt before starting one normal run", async () => {
    const interactionId = "interaction-fresh-send";
    const sourceRunId = "attempt-fresh-send-paused";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-fresh-send-paused",
        role: "user",
        content: "Wait for the old approval",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    let authoritativePending = buildPendingInteraction({
      sessionId,
      interactionId,
      callId: "call-fresh-send",
      sourceRunId,
    });
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? authoritativePending
          : { status: "none", session_id: requestedSessionId },
      cancelExecution: async (payload) => {
        authoritativePending = { status: "none", session_id: sessionId };
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(lastChatInputProps?.sendDisabled).toBe(false);
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          interactionId
        ],
      ).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Start a clean task" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
        owner_chat_id: sessionId,
        session_id: sessionId,
        attempt_id: sourceRunId,
        source_attempt_id: sourceRunId,
        interaction_id: interactionId,
        reason: "interaction_abandoned_for_new_message",
        idempotency_key: `fresh-send-abandon:${sourceRunId}:${interactionId}`,
      });
    });
    await waitFor(() => {
      expect(
        window.unchainAPI.startStreamV2.mock.calls.length +
          bridge.runs.length,
      ).toBe(1);
    });
    expect(bridge.resumeRuns()).toHaveLength(0);
    const freshPayload =
      window.unchainAPI.startStreamV2.mock.calls[0]?.[0] ||
      bridge.runs[0]?.payload;
    expect(freshPayload).toEqual(
      expect.objectContaining({
        threadId: sessionId,
        message: "Start a clean task",
        continued_from_run_id: sourceRunId,
      }),
    );
    expect(
      lastChatMessagesProps?.pendingToolConfirmationRequests?.[interactionId],
    ).toBeUndefined();
  });

  test("fresh send fails closed when authoritative lookup still reports the paused run", async () => {
    const interactionId = "interaction-fresh-send-still-pending";
    const sourceRunId = "attempt-fresh-send-still-pending";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-fresh-send-still-pending",
        role: "user",
        content: "Keep this paused turn",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const authoritativePending = buildPendingInteraction({
      sessionId,
      interactionId,
      callId: "call-fresh-send-still-pending",
      sourceRunId,
    });
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? authoritativePending
          : { status: "none", session_id: requestedSessionId },
      cancelExecution: async (payload) => ({
        status: "ok",
        attempt_id: payload.attempt_id,
        source_attempt_id: payload.source_attempt_id,
      }),
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Do not send unless cancellation is visible" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalled();
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    });
    expect(bridge.runs).toHaveLength(0);
    expect(screen.getByTestId("chat-input")).toHaveValue(
      "Do not send unless cancellation is visible",
    );
    expect(
      lastChatMessagesProps?.pendingToolConfirmationRequests?.[interactionId],
    ).toBeDefined();
  });

  test("rolls back an unacknowledged mutation when an authoritative pending attempt owns the chat", async () => {
    const operationId = "turn-local-edit-superseded";
    const baseMessages = [
      {
        id: "user-before-superseded-edit",
        role: "user",
        content: "Stable question",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "assistant-before-superseded-edit",
        role: "assistant",
        content: "Stable answer",
        status: "done",
        createdAt: 2,
        updatedAt: 2,
      },
    ];
    const originalMessages = [
      ...baseMessages,
      {
        id: "user-superseded-edit",
        role: "user",
        content: "Original question",
        createdAt: 3,
        updatedAt: 3,
      },
      {
        id: "assistant-superseded-edit",
        role: "assistant",
        content: "Original answer",
        status: "done",
        createdAt: 4,
        updatedAt: 4,
      },
    ];
    const optimisticMessages = [
      ...baseMessages,
      {
        id: "user-superseded-edit",
        role: "user",
        content: "Edited question",
        createdAt: 3,
        updatedAt: 5,
      },
      {
        id: "assistant-local-edit-placeholder",
        role: "assistant",
        content: "",
        status: "streaming",
        createdAt: 5,
        updatedAt: 5,
        meta: {
          turnMutationOperationId: operationId,
        },
      },
    ];
    const sessionId = seedActiveChatMessages(optimisticMessages);
    expect(
      enqueueTurnMutation({
        operationId,
        chatId: sessionId,
        sessionId,
        kind: "edit",
        targetMessageId: "user-superseded-edit",
        originalFingerprint:
          fingerprintTurnMutationMessages(originalMessages),
        baseFingerprint: fingerprintTurnMutationMessages(baseMessages),
        baseMessageCount: baseMessages.length,
        text: "Edited question",
        modelId: "openai:gpt-5",
        threadId: sessionId,
        expectedSessionRevision: 1,
      }),
    ).toEqual(expect.objectContaining({ operationId }));

    let resolveStaleReplace;
    window.unchainAPI.replaceSessionMemory.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStaleReplace = resolve;
        }),
    );
    const pending = buildPendingInteraction({
      sessionId,
      interactionId: "interaction-newer-than-local-edit",
      callId: "call-newer-than-local-edit",
      sourceRunId: "server-attempt-newer-than-local-edit",
      activeAttemptId: "server-attempt-newer-than-local-edit",
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
          pending.interaction_id
        ],
      ).toBeDefined();
      expect(readTurnMutationOutbox()).toEqual([]);
    });

    const persistedMessages = getChatsStore().chatsById[sessionId].messages;
    expect(
      persistedMessages.map((message) => message.content),
    ).toEqual(["Stable question", "Stable answer", ""]);
    expect(
      persistedMessages.some(
        (message) =>
          message.id === "user-superseded-edit" ||
          message?.meta?.turnMutationOperationId === operationId,
      ),
    ).toBe(false);
    expect(bridge.resumeRuns()).toHaveLength(0);
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(lastChatInputProps?.sendDisabled).toBe(false);

    await act(async () => {
      resolveStaleReplace?.({ applied: true });
      await Promise.resolve();
    });
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
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
        owner_chat_id: sessionId,
        session_id: sessionId,
        attempt_id: sourceRunId,
        source_attempt_id: sourceRunId,
        interaction_id: interactionId,
        reason: "user_stop",
        idempotency_key: `stop:${sourceRunId}`,
      });
    });
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("seals a recorded durable receipt on reload without auto-resuming", async () => {
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
    let authoritativePending = buildPendingInteraction({
      sessionId,
      status: "receipt_recorded",
      interactionId,
      callId: "call-recorded",
    });
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? authoritativePending
          : { status: "none", session_id: requestedSessionId },
      cancelExecution: async (payload) => {
        authoritativePending = { status: "none", session_id: sessionId };
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });

    renderChat();
    await waitForBoot();

    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
        owner_chat_id: sessionId,
        session_id: sessionId,
        attempt_id: `attempt-${interactionId}`,
        source_attempt_id: `attempt-${interactionId}`,
        interaction_id: interactionId,
        reason: "interaction_suspended",
        idempotency_key: `interaction-pause:attempt-${interactionId}:${interactionId}`,
      });
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    });

    expect(bridge.resumeRuns()).toHaveLength(0);
    expect(window.unchainAPI.respondToolConfirmation).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(
      findConfirmationFrames(lastChatMessagesProps?.messages, interactionId)
        .filter(({ frame }) => frame.type === "tool_confirmed"),
    ).toHaveLength(1);
  });

  test("keeps an explicit durable tool-approval denial denied", async () => {
    const interactionId = "interaction-recorded-denial";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-recorded-denial",
        role: "user",
        content: "Do not run the protected tool",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    let authoritativePending = {
      ...buildPendingInteraction({
        sessionId,
        status: "receipt_recorded",
        interactionId,
        callId: "call-recorded-denial",
      }),
      resolution: {
        outcome: "denied",
        response: {
          approved: false,
          reason: "User denied the operation",
        },
      },
    };
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? authoritativePending
          : { status: "none", session_id: requestedSessionId },
      cancelExecution: async (payload) => {
        authoritativePending = { status: "none", session_id: sessionId };
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });

    renderChat();
    await waitForBoot();

    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalled();
    });
    const decisionFrames = findConfirmationFrames(
      lastChatMessagesProps?.messages,
      interactionId,
    ).map(({ frame }) => frame);
    expect(decisionFrames.filter((frame) => frame.type === "tool_denied"))
      .toHaveLength(1);
    expect(decisionFrames.filter((frame) => frame.type === "tool_confirmed"))
      .toHaveLength(0);
    expect(bridge.resumeRuns()).toHaveLength(0);
  });

  test("retries sealing a durable receipt after a transient cancellation failure", async () => {
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
    let authoritativePending = buildPendingInteraction({
      sessionId,
      status: "receipt_recorded",
      interactionId,
      callId: "call-lease-retry",
    });
    let failuresRemaining = 1;
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? authoritativePending
          : { status: "none", session_id: requestedSessionId },
      cancelExecution: async (payload) => {
        if (failuresRemaining > 0) {
          failuresRemaining -= 1;
          throw new Error("temporary cancellation transport failure");
        }
        authoritativePending = { status: "none", session_id: sessionId };
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });

    renderChat();
    await waitForBoot();

    await waitFor(
      () => {
        expect(window.unchainAPI.cancelExecution.mock.calls.length)
          .toBeGreaterThanOrEqual(2);
        expect(lastChatInputProps?.sendDisabled).toBe(false);
      },
      { timeout: 2500 },
    );
    expect(bridge.resumeRuns()).toHaveLength(0);
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
  });

  test("adopts a newer awaiting interaction instead of retrying a stale durable receipt", async () => {
    jest.useFakeTimers();
    const sessionId = seedActiveChatMessages([
      {
        id: "user-superseded-receipt",
        role: "user",
        content: "Continue through both approvals",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const pendingA = buildPendingInteraction({
      sessionId,
      status: "receipt_recorded",
      interactionId: "interaction-superseded-a",
      callId: "call-superseded-a",
    });
    const pendingB = buildPendingInteraction({
      sessionId,
      status: "awaiting_response",
      interactionId: "interaction-superseded-b",
      callId: "call-superseded-b",
    });
    let authoritativePending = pendingA;
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? authoritativePending
          : { status: "none", session_id: requestedSessionId },
      cancelExecution: async (payload) => {
        if (authoritativePending === pendingA) {
          authoritativePending = pendingB;
        }
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });

    try {
      renderChat();
      await waitForBoot();
      await waitFor(() => {
        expect(window.unchainAPI.cancelExecution).toHaveBeenCalled();
      });

      await act(async () => {
        jest.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          lastChatMessagesProps?.pendingToolConfirmationRequests?.[
            pendingB.interaction_id
          ],
        ).toEqual(
          expect.objectContaining({
            confirmationId: pendingB.interaction_id,
            callId: "call-superseded-b",
          }),
        );
      });
      expect(bridge.resumeRuns()).toHaveLength(0);
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          pendingA.interaction_id
        ],
      ).toBeUndefined();
      expect(
        lastChatMessagesProps?.toolConfirmationUiStateById?.[
          pendingB.interaction_id
        ],
      ).toEqual(
        expect.objectContaining({
          status: "idle",
          resolved: false,
        }),
      );
      expect(
        findConfirmationFrames(
          lastChatMessagesProps?.messages,
          pendingB.interaction_id,
        ).filter(({ frame }) => frame.type === "tool_call"),
      ).toHaveLength(1);
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test("waits for an authoritative lookup retry instead of replaying a stale receipt", async () => {
    jest.useFakeTimers();
    const sessionId = seedActiveChatMessages([
      {
        id: "user-authoritative-lookup-retry",
        role: "user",
        content: "Wait for the current approval state",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const pendingA = buildPendingInteraction({
      sessionId,
      status: "receipt_recorded",
      interactionId: "interaction-lookup-retry-a",
      callId: "call-lookup-retry-a",
    });
    const pendingB = buildPendingInteraction({
      sessionId,
      status: "awaiting_response",
      interactionId: "interaction-lookup-retry-b",
      callId: "call-lookup-retry-b",
    });
    let phase = "initial";
    let recoveryLookupCount = 0;
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) => {
        if (requestedSessionId !== sessionId) {
          return { status: "none", session_id: requestedSessionId };
        }
        if (phase === "initial") {
          return pendingA;
        }
        recoveryLookupCount += 1;
        if (recoveryLookupCount === 1) {
          throw new Error("pending interaction lookup unavailable");
        }
        return pendingB;
      },
      cancelExecution: async (payload) => {
        phase = "recovering";
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });

    try {
      renderChat();
      await waitForBoot();
      await waitFor(() => {
        expect(recoveryLookupCount).toBeGreaterThanOrEqual(1);
      });

      await act(async () => {
        jest.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(
          lastChatMessagesProps?.pendingToolConfirmationRequests?.[
            pendingB.interaction_id
          ],
        ).toBeDefined();
      });
      expect(recoveryLookupCount).toBeGreaterThanOrEqual(2);
      expect(bridge.resumeRuns()).toHaveLength(0);
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test("reconciles a missing stale interaction without surfacing a terminal error", async () => {
    jest.useFakeTimers();
    const interactionId = "interaction-stale-missing";
    const sessionId = seedActiveChatMessages([
      {
        id: "user-stale-missing",
        role: "user",
        content: "Continue after the stale approval disappears",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    let authoritativePending = buildPendingInteraction({
      sessionId,
      status: "receipt_recorded",
      interactionId,
      callId: "call-stale-missing",
    });
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? authoritativePending
          : { status: "none", session_id: requestedSessionId },
      cancelExecution: async (payload) => {
        authoritativePending = {
          status: "none",
          session_id: sessionId,
        };
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });

    try {
      renderChat();
      await waitForBoot();
      await waitFor(() => {
        expect(window.unchainAPI.cancelExecution).toHaveBeenCalled();
        expect(lastChatInputProps?.sendDisabled).toBe(false);
      });
      expect(bridge.resumeRuns()).toHaveLength(0);
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[interactionId],
      ).toBeUndefined();
      expect(
        (lastChatMessagesProps?.messages || []).some(
          (message) =>
            message?.meta?.error?.code === "interaction_not_found" ||
            (message?.traceFrames || []).some(
              (frame) =>
                frame?.type === "error" &&
                frame?.payload?.code === "interaction_not_found",
            ),
        ),
      ).toBe(false);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test("seals a replacement recorded interaction without resuming either receipt", async () => {
    jest.useFakeTimers();
    const sessionId = seedActiveChatMessages([
      {
        id: "user-replacement-receipt",
        role: "user",
        content: "Continue with the replacement receipt",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const pendingA = buildPendingInteraction({
      sessionId,
      status: "receipt_recorded",
      interactionId: "interaction-replacement-a",
      callId: "call-replacement-a",
    });
    const pendingB = buildPendingInteraction({
      sessionId,
      status: "receipt_recorded",
      interactionId: "interaction-replacement-b",
      callId: "call-replacement-b",
    });
    let authoritativePending = pendingA;
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? authoritativePending
          : { status: "none", session_id: requestedSessionId },
      cancelExecution: async (payload) => {
        if (
          payload.attempt_id === pendingA.active_attempt_id &&
          authoritativePending === pendingA
        ) {
          authoritativePending = pendingB;
        } else if (
          payload.attempt_id === pendingB.active_attempt_id &&
          authoritativePending === pendingB
        ) {
          authoritativePending = {
            status: "none",
            session_id: sessionId,
          };
        }
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });

    try {
      renderChat();
      await waitForBoot();
      await waitFor(() => {
        expect(window.unchainAPI.cancelExecution).toHaveBeenCalled();
      });

      await act(async () => {
        jest.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(lastChatInputProps?.sendDisabled).toBe(false);
      });
      expect(
        window.unchainAPI.cancelExecution.mock.calls.map(
          ([payload]) => payload.attempt_id,
        ),
      ).toEqual(
        expect.arrayContaining([
          pendingA.active_attempt_id,
          pendingB.active_attempt_id,
        ]),
      );
      expect(bridge.resumeRuns()).toHaveLength(0);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test("stopping a durable cancellation retry prevents any later auto-resume", async () => {
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
      cancelExecution: async () => {
        throw new Error("cancellation service unavailable");
      },
    });

    try {
      renderChat();
      await waitForBoot();
      await waitFor(() => {
        expect(window.unchainAPI.cancelExecution).toHaveBeenCalled();
      });

      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("stop-button"));

      await act(async () => {
        await Promise.resolve();
      });

      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
        owner_chat_id: sessionId,
        session_id: sessionId,
        attempt_id: pending.source_run_id,
        source_attempt_id: pending.source_run_id,
        interaction_id: pending.interaction_id,
        reason: "user_stop",
        idempotency_key: `stop:${pending.source_run_id}`,
      });

      await act(async () => {
        jest.advanceTimersByTime(beyondAllRetryDelaysMs);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(bridge.resumeRuns()).toHaveLength(0);
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
      owner_chat_id: sessionId,
      session_id: sessionId,
      attempt_id: pending.active_attempt_id,
      source_attempt_id: pending.source_run_id,
      interaction_id: pending.interaction_id,
      reason: "user_stop",
      idempotency_key: `stop:${pending.active_attempt_id}`,
    });
  });

  test("keeps a late background receipt seal scoped to its original chat", async () => {
    const snapshotMessages = (messages = []) =>
      messages.map(({ id, role, content, status }) => ({
        id,
        role,
        content,
        status,
      }));
    const chatAId = seedActiveChatMessages([
      {
        id: "user-late-resume-chat-a",
        role: "user",
        content: "Recover chat A only",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:gpt-5" }, { source: "test" });
    const createdB = createChatInSelectedContext(
      { title: "Stable Chat B" },
      { source: "test" },
    );
    setChatMessages(
      createdB.chatId,
      [
        {
          id: "user-stable-chat-b",
          role: "user",
          content: "Stable chat B",
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

    let resolveChatALookup;
    const chatALookup = new Promise((resolve) => {
      resolveChatALookup = resolve;
    });
    const interactionId = "interaction-late-chat-a";
    const pendingA = buildPendingInteraction({
      sessionId: chatAId,
      status: "receipt_recorded",
      interactionId,
      callId: "call-late-chat-a",
    });
    let chatASealed = false;
    const bridge = installDurableBridge({
      resolvePending: async (sessionId) =>
        sessionId === chatAId
          ? chatASealed
            ? { status: "none", session_id: chatAId }
            : chatALookup
          : { status: "none", session_id: sessionId },
      cancelExecution: async (payload) => {
        chatASealed = true;
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalledWith({
        session_id: chatAId,
      });
    });

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    });

    const visibleBBefore = snapshotMessages(lastChatMessagesProps.messages);
    const storedBBefore = snapshotMessages(
      getChatsStore().chatsById[createdB.chatId].messages,
    );

    await act(async () => {
      resolveChatALookup(pendingA);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
        owner_chat_id: chatAId,
        session_id: chatAId,
        attempt_id: pendingA.active_attempt_id,
        source_attempt_id: pendingA.source_run_id,
        interaction_id: pendingA.interaction_id,
        reason: "interaction_suspended",
        idempotency_key: `interaction-pause:${pendingA.source_run_id}:${interactionId}`,
      });
    });

    expect(bridge.resumeRuns()).toHaveLength(0);
    expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
    expect(snapshotMessages(lastChatMessagesProps?.messages)).toEqual(
      visibleBBefore,
    );
    expect(
      snapshotMessages(getChatsStore().chatsById[createdB.chatId].messages),
    ).toEqual(storedBBefore);
    expect(
      lastChatMessagesProps?.pendingToolConfirmationRequests?.[interactionId],
    ).toBeUndefined();
    expect(lastChatInputProps?.isStreaming).toBe(false);
    expect(screen.queryByTestId("stop-button")).not.toBeInTheDocument();
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
      cancelExecution: async () => {
        completedElsewhere = true;
        throw new Error("the other executor completed first");
      },
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalled();
    });

    await waitFor(
      () => {
        expect(lastChatInputProps?.sendDisabled).toBe(false);
      },
      { timeout: 2500 },
    );
    expect(bridge.resumeRuns()).toHaveLength(0);
  });

  test("sealing after a durable decision does not append a duplicate user message", async () => {
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
          ? phase === "none"
            ? { status: "none", session_id: sessionId }
            : buildPendingInteraction({
                sessionId,
                status: phase,
                interactionId,
                callId: "call-no-duplicate",
              })
          : { status: "none", session_id: requestedSessionId },
      cancelExecution: async (payload) => {
        phase = "none";
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });
    window.unchainAPI.respondToolConfirmation.mockImplementation(
      async () => {
        phase = "receipt_recorded";
        return {
          status: "ok",
          disposition: "receipt_recorded",
          durable: true,
          session_id: sessionId,
          interaction_id: interactionId,
          receipt_id: `receipt-${interactionId}`,
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
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalled();
    });
    expect(bridge.resumeRuns()).toHaveLength(0);
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
    window.unchainAPI.respondToolConfirmation.mockImplementation(
      async ({ confirmation_id: confirmationId, session_id: sessionId }) => ({
        status: "ok",
        disposition: "live_continues",
        durable: true,
        session_id: sessionId,
        interaction_id: confirmationId,
        receipt_id: "receipt-live",
      }),
    );

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

  test("keeps a durable card actionable when confirmation admission fails closed", async () => {
    window.unchainAPI.respondToolConfirmation.mockResolvedValueOnce(null);

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run only after an admitted receipt" },
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
          call_id: "call-invalid-admission",
          confirmation_id: "confirm-invalid-admission",
          requires_confirmation: true,
          toolkit_id: "core",
          tool_name: "shell",
          arguments: { action: "run", command: "pwd" },
        },
      });
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-invalid-admission"
        ],
      ).toBeDefined();
    });

    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision({
        confirmationId: "confirm-invalid-admission",
        approved: true,
      });
    });

    expect(
      lastChatMessagesProps?.pendingToolConfirmationRequests?.[
        "confirm-invalid-admission"
      ],
    ).toBeDefined();
    expect(
      lastChatMessagesProps?.toolConfirmationUiStateById?.[
        "confirm-invalid-admission"
      ],
    ).toEqual(
      expect.objectContaining({
        status: "error",
        resolved: false,
        decision: "",
      }),
    );
    expect(
      findConfirmationFrames(
        lastChatMessagesProps?.messages,
        "confirm-invalid-admission",
      ).filter(({ frame }) => frame.type === "tool_confirmed"),
    ).toHaveLength(0);
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
  });

  test("seals an authoritative recorded receipt once even while the old stream flag is stale", async () => {
    const sessionId = getChatsStore().activeChatId;
    const interactionId = "interaction-stale-stream-receipt";
    const callId = "call-stale-stream-receipt";
    const sourceRunId = `attempt-${interactionId}`;
    let pendingState = { status: "none", session_id: sessionId };
    const bridge = installDurableBridge({
      resolvePending: async (requestedSessionId) =>
        requestedSessionId === sessionId
          ? pendingState
          : { status: "none", session_id: requestedSessionId || "" },
      cancelExecution: async (payload) => {
        pendingState = { status: "none", session_id: sessionId };
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });
    window.unchainAPI.respondToolConfirmation.mockImplementation(
      async ({ confirmation_id: confirmationId, session_id: requestedSessionId }) => {
        pendingState = buildPendingInteraction({
          sessionId,
          status: "receipt_recorded",
          interactionId,
          callId,
          sourceRunId,
        });
        return {
          status: "ok",
          disposition: "receipt_recorded",
          durable: true,
          session_id: requestedSessionId,
          interaction_id: confirmationId,
          receipt_id: `receipt-${interactionId}`,
        };
      },
    );

    renderChat();
    await waitForBoot();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run the protected tool" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(bridge.runs).toHaveLength(1);
      expect(lastChatInputProps?.isStreaming).toBe(true);
    });

    act(() => {
      bridge.runs[0].handlers.onRuntimeEvent({
        schema_version: "v4",
        timestamp: "2026-08-14T12:00:00.000Z",
        session_id: sessionId,
        event_id: "event-stale-stream-receipt",
        seq: 1,
        run_id: sourceRunId,
        agent_id: "developer",
        turn_id: `${sourceRunId}:turn-1`,
        type: "interaction.requested",
        links: {
          tool_call_id: callId,
          interaction_id: interactionId,
        },
        surface: { slot: "trace_inline", scope: "turn" },
        visibility: "user",
        metadata: {},
        payload: {
          interaction_id: interactionId,
          kind: "tool_approval",
          renderer: "confirmation",
          prompt: "Approve protected tool",
          target: {
            tool_call_id: callId,
            toolkit_id: "core",
            tool_name: "shell",
            arguments: { action: "run", command: "pwd" },
          },
        },
      }, { streamSeq: 1 });
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[interactionId],
      ).toBeDefined();
    });

    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision({
        confirmationId: interactionId,
        approved: true,
      });
    });

    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledWith({
      confirmation_id: interactionId,
      session_id: sessionId,
      approved: true,
      reason: "",
    });
    await waitFor(() => {
      expect(window.unchainAPI.getPendingInteraction).toHaveBeenLastCalledWith({
        session_id: sessionId,
      });
    });
    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
        owner_chat_id: sessionId,
        session_id: sessionId,
        attempt_id: sourceRunId,
        source_attempt_id: sourceRunId,
        interaction_id: interactionId,
        reason: "interaction_suspended",
        idempotency_key: `interaction-pause:${sourceRunId}:${interactionId}`,
      });
    });
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
    expect(bridge.runs).toHaveLength(1);
    expect(bridge.resumeRuns()).toHaveLength(0);
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

  test("uses the exact confirmation request when root and subagent tool calls share a call id", async () => {
    const chatId = getChatsStore().activeChatId;

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Ask the child agent for a protected answer" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: 100,
        run_id: "root-confirmation-collision",
        type: "run_started",
        payload: {},
      });
      streamHandlers.onFrame({
        seq: 2,
        ts: 110,
        run_id: "root-confirmation-collision",
        type: "tool_call",
        payload: {
          call_id: "shared-confirmation-call",
          confirmation_id: "confirm-root-shared",
          requires_confirmation: true,
          toolkit_id: "root.tools",
          tool_name: "root_exec",
          interact_config: {
            request_id: "root-interact-request",
            question: "Root question",
            selection_mode: "single",
          },
          arguments: {
            request_id: "root-argument-request",
            question: "Root argument question",
          },
        },
      });
      streamHandlers.onFrame({
        seq: 3,
        ts: 120,
        run_id: "child-confirmation-collision",
        type: "tool_call",
        payload: {
          call_id: "shared-confirmation-call",
          confirmation_id: "confirm-child-shared",
          requires_confirmation: true,
          toolkit_id: "child.questions",
          tool_name: "ask_user_question",
          interact_config: {
            request_id: "child-interact-request",
            selection_mode: "multiple",
          },
          arguments: {
            request_id: "child-argument-request",
            question: "Child argument question",
          },
        },
      });
    });

    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-root-shared"
        ],
      ).toEqual(
        expect.objectContaining({
          toolName: "root_exec",
          toolkitId: "root.tools",
          interactConfig: expect.objectContaining({
            request_id: "root-interact-request",
          }),
          arguments: expect.objectContaining({
            request_id: "root-argument-request",
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-child-shared"
        ],
      ).toEqual(
        expect.objectContaining({
          toolName: "ask_user_question",
          toolkitId: "child.questions",
          interactConfig: expect.objectContaining({
            request_id: "child-interact-request",
          }),
          arguments: expect.objectContaining({
            request_id: "child-argument-request",
          }),
        }),
      );
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 4,
        ts: 125,
        run_id: "root-confirmation-collision",
        type: "response_received",
        payload: {},
      });
    });
    await waitFor(() => {
      const assistantMessage = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      const childRequest = Object.values(
        assistantMessage?.subagentFrames || {},
      )
        .flat()
        .find(
          (frame) =>
            frame.type === "tool_call" &&
            frame.payload?.confirmation_id === "confirm-child-shared",
        );
      expect(childRequest).toBeDefined();
    });

    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision({
        confirmationId: "confirm-child-shared",
        approved: true,
        scope: "session",
        userResponse: "Child answer",
      });
    });

    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledWith({
      confirmation_id: "confirm-child-shared",
      approved: true,
      reason: "",
      session_id: chatId,
      modified_arguments: { user_response: "Child answer" },
    });
    expect(mockScopedLogger.log).toHaveBeenCalledWith(
      "ask_user_question_submit",
      {
        confirmationId: "confirm-child-shared",
        callId: "shared-confirmation-call",
        approved: true,
        userResponse: "Child answer",
        interactRequestId: "child-interact-request",
        argumentRequestId: "child-argument-request",
        question: "Child argument question",
        selectionMode: "multiple",
      },
    );
    await waitFor(() => {
      const assistantMessage = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      const rootDecisions = (assistantMessage?.traceFrames || []).filter(
        (frame) =>
          frame.type === "tool_confirmed" &&
          frame.payload?.confirmation_id === "confirm-child-shared",
      );
      const childDecisions = Object.values(
        assistantMessage?.subagentFrames || {},
      )
        .flat()
        .filter(
          (frame) =>
            frame.type === "tool_confirmed" &&
            frame.payload?.confirmation_id === "confirm-child-shared",
        );
      expect(rootDecisions).toHaveLength(0);
      expect(childDecisions).toHaveLength(1);
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 5,
        ts: 130,
        run_id: "root-confirmation-collision",
        type: "tool_call",
        payload: {
          call_id: "root-followup-call",
          confirmation_id: "confirm-root-followup",
          requires_confirmation: true,
          toolkit_id: "root.tools",
          tool_name: "root_exec",
          interact_config: {},
          arguments: { command: "pwd" },
        },
      });
    });

    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-root-followup"
        ],
      ).toEqual(
        expect.objectContaining({
          toolName: "root_exec",
          toolkitId: "root.tools",
        }),
      );
    });
    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(1);
  });

  test("caches only the targeted subagent tool key when a root call id collides", async () => {
    const chatId = getChatsStore().activeChatId;

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Approve only the child tool for this session" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: 200,
        run_id: "root-cache-collision",
        type: "run_started",
        payload: {},
      });
      streamHandlers.onFrame({
        seq: 2,
        ts: 210,
        run_id: "root-cache-collision",
        type: "tool_call",
        payload: {
          call_id: "shared-cache-call",
          confirmation_id: "confirm-root-cache",
          requires_confirmation: true,
          toolkit_id: "root.cache",
          tool_name: "root_exec",
          interact_config: { source: "root" },
          arguments: { command: "root" },
        },
      });
      streamHandlers.onFrame({
        seq: 3,
        ts: 220,
        run_id: "child-cache-collision",
        type: "tool_call",
        payload: {
          call_id: "shared-cache-call",
          confirmation_id: "confirm-child-cache",
          requires_confirmation: true,
          toolkit_id: "child.cache",
          tool_name: "child_exec",
          interact_config: { source: "child" },
          arguments: { command: "child" },
        },
      });
    });

    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-child-cache"
        ],
      ).toEqual(
        expect.objectContaining({
          toolName: "child_exec",
          toolkitId: "child.cache",
        }),
      );
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 4,
        ts: 225,
        run_id: "root-cache-collision",
        type: "tool_confirmed",
        payload: {
          call_id: "shared-cache-call",
          confirmation_id: "confirm-root-cache",
          tool_name: "root_exec",
        },
      });
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-root-cache"
        ],
      ).toBeUndefined();
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-child-cache"
        ],
      ).toEqual(
        expect.objectContaining({
          toolName: "child_exec",
          toolkitId: "child.cache",
        }),
      );
    });

    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision({
        confirmationId: "confirm-child-cache",
        approved: true,
        scope: "session",
      });
    });

    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledWith({
      confirmation_id: "confirm-child-cache",
      approved: true,
      reason: "",
      session_id: chatId,
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 5,
        ts: 230,
        run_id: "root-cache-collision",
        type: "tool_call",
        payload: {
          call_id: "root-cache-followup-call",
          confirmation_id: "confirm-root-cache-followup",
          requires_confirmation: true,
          toolkit_id: "root.cache",
          tool_name: "root_exec",
          interact_config: {},
          arguments: { command: "root-followup" },
        },
      });
      streamHandlers.onFrame({
        seq: 6,
        ts: 240,
        run_id: "child-cache-collision",
        type: "tool_call",
        payload: {
          call_id: "child-cache-followup-call",
          confirmation_id: "confirm-child-cache-followup",
          requires_confirmation: true,
          toolkit_id: "child.cache",
          tool_name: "child_exec",
          interact_config: {},
          arguments: { command: "child-followup" },
        },
      });
    });

    await waitFor(() => {
      expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(2);
    });
    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenLastCalledWith({
      confirmation_id: "confirm-child-cache-followup",
      session_id: chatId,
      approved: true,
      reason: "",
    });
    expect(
      lastChatMessagesProps?.pendingToolConfirmationRequests?.[
        "confirm-root-cache-followup"
      ],
    ).toEqual(
      expect.objectContaining({
        toolName: "root_exec",
        toolkitId: "root.cache",
      }),
    );
    expect(
      lastChatMessagesProps?.pendingToolConfirmationRequests?.[
        "confirm-child-cache-followup"
      ],
    ).toBeUndefined();
  });

  test("keeps session-scoped tool approvals with their originating chat", async () => {
    const chatAId = seedActiveChatMessages([
      {
        id: "user-session-a-seed",
        role: "user",
        content: "Seed session chat A",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:gpt-5" }, { source: "test" });
    const createdB = createChatInSelectedContext(
      { title: "Session chat B" },
      { source: "test" },
    );
    setChatMessages(
      createdB.chatId,
      [
        {
          id: "user-session-b-seed",
          role: "user",
          content: "Seed session chat B",
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      { source: "test" },
    );
    setChatModel(createdB.chatId, { id: "openai:gpt-5" }, { source: "test" });
    selectTreeNode({ nodeId: chatANodeId }, { source: "test" });

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Approve shell in A" },
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
          call_id: "call-session-a-1",
          confirmation_id: "confirm-session-a-1",
          requires_confirmation: true,
          toolkit_id: "core",
          tool_name: "shell",
          arguments: { action: "run", command: "pwd" },
        },
      });
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-session-a-1"
        ],
      ).toBeDefined();
    });
    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision({
        confirmationId: "confirm-session-a-1",
        approved: true,
        scope: "session",
      });
    });
    expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(1);

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    });
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Do not inherit A approval" },
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
          call_id: "call-session-b-1",
          confirmation_id: "confirm-session-b-1",
          requires_confirmation: true,
          toolkit_id: "core",
          tool_name: "shell",
          arguments: { action: "run", command: "ls" },
        },
      });
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-session-b-1"
        ],
      ).toBeDefined();
      expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(1);
    });

    act(() => {
      chatAHandlers.onFrame({
        seq: 2,
        ts: 300,
        type: "tool_call",
        payload: {
          call_id: "call-session-a-2",
          confirmation_id: "confirm-session-a-2",
          requires_confirmation: true,
          toolkit_id: "core",
          tool_name: "shell",
          arguments: { action: "run", command: "whoami" },
        },
      });
    });
    await waitFor(() => {
      expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(2);
      expect(window.unchainAPI.respondToolConfirmation).toHaveBeenLastCalledWith({
        confirmation_id: "confirm-session-a-2",
        session_id: chatAId,
        approved: true,
        reason: "",
      });
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-session-b-1"
        ],
      ).toBeDefined();
    });
  });

  test("does not cache a session approval when confirmation submission fails", async () => {
    window.unchainAPI.respondToolConfirmation.mockRejectedValueOnce(
      new Error("confirmation rejected"),
    );

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Approve only after success" },
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
          call_id: "call-session-failed-1",
          confirmation_id: "confirm-session-failed-1",
          requires_confirmation: true,
          toolkit_id: "core",
          tool_name: "shell",
          arguments: { action: "run", command: "pwd" },
        },
      });
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-session-failed-1"
        ],
      ).toBeDefined();
    });
    await act(async () => {
      await lastChatMessagesProps.onToolConfirmationDecision({
        confirmationId: "confirm-session-failed-1",
        approved: true,
        scope: "session",
      });
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.toolConfirmationUiStateById?.[
          "confirm-session-failed-1"
        ],
      ).toEqual(
        expect.objectContaining({
          status: "error",
          error: "confirmation rejected",
          resolved: false,
        }),
      );
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 2,
        ts: 200,
        type: "tool_call",
        payload: {
          call_id: "call-session-failed-2",
          confirmation_id: "confirm-session-failed-2",
          requires_confirmation: true,
          toolkit_id: "core",
          tool_name: "shell",
          arguments: { action: "run", command: "ls" },
        },
      });
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          "confirm-session-failed-2"
        ],
      ).toBeDefined();
      expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(1);
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
          ? phase === "none"
            ? { status: "none", session_id: sessionId }
            : buildPendingInteraction({
                sessionId,
                status: phase,
                interactionId,
                callId: "call-owner",
              })
          : { status: "none", session_id: requestedSessionId },
      cancelExecution: async (payload) => {
        phase = "none";
        return {
          status: "ok",
          attempt_id: payload.attempt_id,
          source_attempt_id: payload.source_attempt_id,
        };
      },
    });
    window.unchainAPI.respondToolConfirmation.mockImplementation(
      async () => {
        phase = "receipt_recorded";
        return {
          status: "ok",
          disposition: "receipt_recorded",
          durable: true,
          session_id: sessionId,
          interaction_id: interactionId,
          receipt_id: `receipt-${interactionId}`,
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
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalled();
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
    expect(bridge.resumeRuns()).toHaveLength(0);

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
      resolveConfirmation({
        status: "ok",
        disposition: "live_only",
        durable: false,
        interaction_id: "confirm-1",
      });
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

  test("keeps a V2 FYI durable across a memory fallback attempt", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ memory: { enabled: true } }),
    );
    window.unchainAPI.interject = jest.fn(() => new Promise(() => {}));
    renderChat();
    await waitForReady();
    const chatId = getChatsStore().activeChatId;

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Memory fallback owner" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    const firstHandlers = streamHandlers;

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/fyi Survive the V2 retry" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(
        readPendingFyiOutbox().filter((entry) => entry.chatId === chatId),
      ).toHaveLength(1);
    });

    act(() => {
      firstHandlers.onError({
        code: "memory_unavailable",
        message: "Memory is unavailable for this request",
      });
    });
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2),
    );
    expect(
      readPendingFyiOutbox().filter((entry) => entry.chatId === chatId),
    ).toEqual([]);
    expect(readQueuedTurnsForChat(chatId)).toEqual([
      expect.objectContaining({
        items: [
          expect.objectContaining({
            text: "Survive the V2 retry",
            status: "queued",
          }),
        ],
      }),
    ]);

    const retryHandlers = streamHandlers;
    act(() => {
      retryHandlers.onDone({ finished_at: Date.now() });
    });
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(3),
    );
    expect(window.unchainAPI.startStreamV2.mock.calls[2][0]).toEqual(
      expect.objectContaining({ message: "Survive the V2 retry" }),
    );
  });

  test("ignores a late interject response after a V4 retry changes attempt owner", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ memory: { enabled: true } }),
    );
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      const suffix = runs.length === 0 ? "a" : "b";
      const run = {
        payload,
        handlers,
        attemptId: `attempt-retry-${suffix}`,
      };
      runs.push(run);
      return {
        requestId: `request-retry-${suffix}`,
        executionId: payload.threadId,
        attemptId: run.attemptId,
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });
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
      target: { value: "V4 retry owner" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Survive attempt A" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() =>
      expect(
        readPendingFyisForAttempt(chatId, "attempt-retry-a"),
      ).toHaveLength(1),
    );

    act(() => {
      runs[0].handlers.onError({
        code: "memory_unavailable",
        message: "Memory is unavailable for this request",
      });
    });
    await waitFor(() => expect(runs).toHaveLength(2));
    await act(async () => {
      resolveInterject({ resolved_channel: "btw", answer: "late answer" });
      await Promise.resolve();
    });

    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-retry-b")?.items,
    ).toEqual([
      expect.objectContaining({ text: "Survive attempt A", status: "queued" }),
    ]);
    expect(
      (lastChatMessagesProps?.messages || []).flatMap(
        (message) => message.traceFrames || [],
      ),
    ).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "side_answer" })]),
    );
  });

  test("keeps a queued background follow-up on its original chat model", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        runtime: {
          workspaces: [
            { id: "workspace-a", path: "/tmp/queue-a" },
            { id: "workspace-b", path: "/tmp/queue-b" },
          ],
        },
      }),
    );
    window.unchainAPI.getModelCatalog.mockResolvedValue({
      activeModel: "openai:model-a",
      providers: {
        openai: ["model-a", "model-b"],
        ollama: [],
        anthropic: [],
      },
      model_capabilities: {},
    });

    const chatAId = seedActiveChatMessages([
      {
        id: "user-queue-model-a-seed",
        role: "user",
        content: "Seed model A",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:model-a" }, { source: "test" });
    setChatSessionBundle(
      chatAId,
      {
        selectedToolkits: ["toolkit.a"],
        selectedWorkspaceIds: ["workspace-a"],
        selectedRecipeName: "Recipe A",
        agentOrchestration: { mode: "developer_waiting_approval" },
      },
      { source: "test" },
    );
    setChatSystemPromptOverrides(
      chatAId,
      { rules: "rules-a" },
      { source: "test" },
    );
    const createdB = createChatInSelectedContext(
      { title: "Model B chat" },
      { source: "test" },
    );
    setChatMessages(
      createdB.chatId,
      [
        {
          id: "user-queue-model-b-seed",
          role: "user",
          content: "Seed model B",
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      { source: "test" },
    );
    setChatModel(createdB.chatId, { id: "openai:model-b" }, { source: "test" });
    setChatSessionBundle(
      createdB.chatId,
      {
        selectedToolkits: ["toolkit.b"],
        selectedWorkspaceIds: ["workspace-b"],
        selectedRecipeName: "Recipe B",
        agentOrchestration: { mode: "default" },
      },
      { source: "test" },
    );
    setChatSystemPromptOverrides(
      createdB.chatId,
      { rules: "rules-b" },
      { source: "test" },
    );
    selectTreeNode({ nodeId: chatANodeId }, { source: "test" });

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "First model A run" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    const firstRunHandlers = streamHandlers;

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue Follow up on model A" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(lastChatInputProps?.interjectState?.queueItems).toHaveLength(1);
    });

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
    });

    act(() => {
      firstRunHandlers.onFrame({
        seq: 1,
        ts: Date.now(),
        type: "final_message",
        payload: { content: "First model A reply" },
      });
      firstRunHandlers.onDone({});
    });

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    });
    const [firstPayload] = window.unchainAPI.startStreamV2.mock.calls[0];
    const [queuedPayload] = window.unchainAPI.startStreamV2.mock.calls[1];
    expect(firstPayload).toEqual(
      expect.objectContaining({
        threadId: chatAId,
        options: expect.objectContaining({
          modelId: "openai:model-a",
          toolkits: ["toolkit.a"],
          workspace_root: "/tmp/queue-a",
          workspace_roots: ["/tmp/queue-a"],
          recipe_name: "Recipe A",
          agent_orchestration: { mode: "developer_waiting_approval" },
          system_prompt_v2: expect.objectContaining({
            overrides: { rules: "rules-a" },
          }),
        }),
      }),
    );
    expect(queuedPayload).toEqual(
      expect.objectContaining({
        threadId: chatAId,
        message: "Follow up on model A",
        options: expect.objectContaining({
          modelId: "openai:model-a",
          toolkits: ["toolkit.a"],
          workspace_root: "/tmp/queue-a",
          workspace_roots: ["/tmp/queue-a"],
          recipe_name: "Recipe A",
          agent_orchestration: { mode: "developer_waiting_approval" },
          system_prompt_v2: expect.objectContaining({
            overrides: { rules: "rules-a" },
          }),
        }),
      }),
    );
    expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
  });

  test("keeps a background memory retry on its original chat model", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ memory: { enabled: true } }),
    );
    window.unchainAPI.getModelCatalog.mockResolvedValue({
      activeModel: "openai:model-a",
      providers: {
        openai: ["model-a", "model-b"],
        ollama: [],
        anthropic: [],
      },
      model_capabilities: {},
    });

    const chatAId = seedActiveChatMessages([]);
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:model-a" }, { source: "test" });
    const createdB = createChatInSelectedContext(
      { title: "Memory model B chat" },
      { source: "test" },
    );
    setChatMessages(
      createdB.chatId,
      [
        {
          id: "user-memory-model-b-seed",
          role: "user",
          content: "Stable memory model B",
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      { source: "test" },
    );
    setChatModel(createdB.chatId, { id: "openai:model-b" }, { source: "test" });
    selectTreeNode({ nodeId: chatANodeId }, { source: "test" });

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Retry model A in the background" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    const firstRunHandlers = streamHandlers;

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
    });

    act(() => {
      firstRunHandlers.onError({
        code: "memory_unavailable",
        message: "Memory is unavailable for this request",
      });
    });
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    });

    const [retryPayload] = window.unchainAPI.startStreamV2.mock.calls[1];
    expect(retryPayload).toEqual(
      expect.objectContaining({
        threadId: chatAId,
        options: expect.objectContaining({
          modelId: "openai:model-a",
          memory_enabled: false,
        }),
      }),
    );
    expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
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

  test("keeps legacy done usage read-only during the RunBundle v1 cutover", async () => {
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
      expect(lastChatMessagesProps?.messages?.some(
        (message) => message.role === "assistant" && message.status === "done",
      )).toBe(true);
    });
    expect(readTokenUsageRecords()).toEqual([]);
  });

  test("projects a canonical done bundle into the keyed RunBundle store", async () => {
    const bundle = buildRunBundleV1();
    bundle.descriptor.agent_orchestration = "developer_waiting_approval";
    bundle.bundle_digest = computeRunBundleDigest(bundle);
    window.runBundleStorageAPI = {
      upsert: jest.fn(async () => ({
        ok: true,
        status: "stored",
        bundleId: bundle.bundle_id,
        revision: bundle.revision,
        bundleDigest: bundle.bundle_digest,
      })),
      query: jest.fn(async () => ({ ok: true, records: [] })),
      clear: jest.fn(async () => ({ ok: true, deleted: 0 })),
    };

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Canonical usage bundle" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });
    streamHandlers.onDone({ bundle });

    await waitFor(() => {
      expect(window.runBundleStorageAPI.upsert).toHaveBeenCalledTimes(1);
      expect(lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      )?.status).toBe("done");
      expect(
        getChatsStore().chatsById[getChatsStore().activeChatId]
          .agentOrchestration,
      ).toEqual({ mode: "developer_waiting_approval" });
    });
    expect(window.runBundleStorageAPI.upsert).toHaveBeenCalledWith(bundle);
    expect(readTokenUsageRecords()).toEqual([]);
  });

  test("keeps the assistant streaming until canonical accounting is durable", async () => {
    const bundle = buildRunBundleV1();
    let resolveUpsert;
    window.runBundleStorageAPI = {
      upsert: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveUpsert = resolve;
          }),
      ),
      query: jest.fn(async () => ({ ok: true, records: [] })),
      clear: jest.fn(async () => ({ ok: true, deleted: 0 })),
    };
    const completionDiagnostics = completionDiagnosticsFor({
      mode: "active",
      trace_status: "complete",
      active_applied: true,
    });

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Accounting barrier" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(streamHandlers).toBeTruthy());
    act(() => {
      streamHandlers.onDone({
        bundle,
        completion_diagnostics: completionDiagnostics,
      });
    });
    await waitFor(() => {
      expect(window.runBundleStorageAPI.upsert).toHaveBeenCalledTimes(1);
    });
    expect(
      lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      )?.status,
    ).toBe("streaming");

    await act(async () => {
      resolveUpsert({
        ok: true,
        status: "inserted",
        bundleId: bundle.bundle_id,
        revision: bundle.revision,
        bundleDigest: bundle.bundle_digest,
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      const assistant = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      expect(assistant?.status).toBe("done");
      expect(assistant?.meta?.bundle).toEqual(bundle);
      expect(assistant?.meta?.completion_diagnostics).toEqual(
        completionDiagnostics,
      );
    });
  });

  test("turns accounting rejection into a terminal error without persisting raw bundle", async () => {
    const bundle = buildRunBundleV1();
    window.runBundleStorageAPI = {
      upsert: jest.fn(async () => {
        throw new Error("ledger unavailable");
      }),
      query: jest.fn(async () => ({ ok: true, records: [] })),
      clear: jest.fn(async () => ({ ok: true, deleted: 0 })),
    };

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Reject false complete" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(streamHandlers).toBeTruthy());
    act(() => streamHandlers.onDone({ bundle }));

    await waitFor(() => {
      const assistant = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      expect(assistant?.status).toBe("error");
      expect(assistant?.meta?.bundle).toBeUndefined();
      expect(assistant?.meta?.error?.message).toContain("ledger unavailable");
    });
  });

  test("persists admitted V2 failed-run accounting before publishing the error", async () => {
    const bundle = failedRunBundleV1();
    const completionDiagnostics = completionDiagnosticsFor({
      mode: "active",
      trace_status: "partial",
      active_applied: false,
    });
    let resolveUpsert;
    window.runBundleStorageAPI = {
      upsert: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveUpsert = resolve;
          }),
      ),
      query: jest.fn(async () => ({ ok: true, records: [] })),
      clear: jest.fn(async () => ({ ok: true, deleted: 0 })),
    };

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "V2 failed accounting" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(streamHandlers).toBeTruthy());
    act(() => {
      streamHandlers.onDone({
        error: { code: "provider_failed", message: "provider failed safely" },
        bundle,
        completion_diagnostics: completionDiagnostics,
      });
    });

    await waitFor(() => {
      expect(window.runBundleStorageAPI.upsert).toHaveBeenCalledWith(bundle);
    });
    expect(
      lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      )?.status,
    ).toBe("streaming");

    await act(async () => {
      resolveUpsert({
        ok: true,
        status: "inserted",
        bundleId: bundle.bundle_id,
        revision: bundle.revision,
        bundleDigest: bundle.bundle_digest,
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      const assistant = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      expect(assistant).toMatchObject({
        status: "error",
        meta: {
          bundle,
          completion_diagnostics: completionDiagnostics,
          error: {
            code: "provider_failed",
            message: "provider failed safely",
          },
        },
      });
    });
  });

  test("holds a V4 run.failed projection until failed accounting is durable", async () => {
    const runs = installAddressedV4Runs();
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const bundle = failedRunBundleV1();
    const completionDiagnostics = completionDiagnosticsFor({
      mode: "shadow",
      trace_status: "complete",
      shadow_only: true,
    });
    let resolveUpsert;
    window.runBundleStorageAPI = {
      upsert: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveUpsert = resolve;
          }),
      ),
      query: jest.fn(async () => ({ ok: true, records: [] })),
      clear: jest.fn(async () => ({ ok: true, deleted: 0 })),
    };

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "V4 failed accounting" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    act(() => {
      runs[0].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "foreground-v4-failed",
          type: "run.failed",
          seq: 1,
          payload: {
            status: "failed",
            error: { code: "v4_failed", message: "V4 failed safely" },
          },
        }),
        { streamSeq: 1 },
      );
      runs[0].handlers.onDone({
        error: { code: "v4_failed", message: "V4 failed safely" },
        bundle,
        completion_diagnostics: completionDiagnostics,
      });
    });

    await waitFor(() => {
      expect(window.runBundleStorageAPI.upsert).toHaveBeenCalledWith(bundle);
    });
    expect(
      lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      )?.status,
    ).toBe("streaming");

    await act(async () => {
      resolveUpsert({
        ok: true,
        status: "inserted",
        bundleId: bundle.bundle_id,
        revision: bundle.revision,
        bundleDigest: bundle.bundle_digest,
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      const assistant = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      expect(assistant).toMatchObject({
        status: "error",
        meta: {
          bundle,
          completion_diagnostics: completionDiagnostics,
          error: { code: "v4_failed", message: "V4 failed safely" },
        },
      });
    });
  });

  test("fails closed when failed-run accounting rejects without persisting raw evidence", async () => {
    const bundle = failedRunBundleV1();
    const completionDiagnostics = completionDiagnosticsFor({
      mode: "active",
      trace_status: "complete",
      active_applied: true,
    });
    window.runBundleStorageAPI = {
      upsert: jest.fn(async () => {
        throw new Error("failed ledger unavailable");
      }),
      query: jest.fn(async () => ({ ok: true, records: [] })),
      clear: jest.fn(async () => ({ ok: true, deleted: 0 })),
    };

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Reject failed accounting" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(streamHandlers).toBeTruthy());
    act(() => {
      streamHandlers.onDone({
        error: { code: "provider_failed", message: "raw provider failure" },
        bundle,
        completion_diagnostics: completionDiagnostics,
      });
    });

    await waitFor(() => {
      const assistant = lastChatMessagesProps?.messages?.find(
        (message) => message.role === "assistant",
      );
      expect(assistant).toMatchObject({
        status: "error",
        meta: {
          error: {
            code: "run_bundle_accounting_failed",
            message:
              "The failed run could not be admitted to the Run Bundle ledger.",
          },
        },
      });
      expect(assistant?.meta?.bundle).toBeUndefined();
      expect(assistant?.meta?.completion_diagnostics).toBeUndefined();
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

  test("keeps continuation prompts scoped to the chat that emitted them", async () => {
    const chatAId = seedActiveChatMessages([
      {
        id: "user-continuation-chat-a",
        role: "user",
        content: "Seed continuation chat A",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:gpt-5" }, { source: "test" });
    const createdB = createChatInSelectedContext(
      { title: "Continuation Chat B" },
      { source: "test" },
    );
    setChatMessages(
      createdB.chatId,
      [
        {
          id: "user-continuation-chat-b",
          role: "user",
          content: "Seed continuation chat B",
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
      target: { value: "Continue only chat A" },
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
        iteration: 6,
        payload: {
          confirmation_id: "continue-chat-a",
        },
      });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.pendingContinuationRequest).toEqual(
        expect.objectContaining({ confirmationId: "continue-chat-a" }),
      );
    });

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
      expect(lastChatMessagesProps?.pendingContinuationRequest).toBeNull();
    });
    expect(
      screen.queryByText(
        "Agent reached 6 iterations without a final response. Continue?",
      ),
    ).not.toBeInTheDocument();

    act(() => {
      selectTreeNode({ nodeId: chatANodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(chatAId);
      expect(lastChatMessagesProps?.pendingContinuationRequest).toEqual(
        expect.objectContaining({ confirmationId: "continue-chat-a" }),
      );
    });
  });

  test("ignores a stale continuation decision and clears the active prompt on done", async () => {
    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Replace the continuation prompt" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });
    const firstRunHandlers = streamHandlers;

    act(() => {
      firstRunHandlers.onFrame({
        seq: 1,
        ts: 100,
        type: "continuation_request",
        iteration: 4,
        payload: { confirmation_id: "continue-stale" },
      });
      firstRunHandlers.onFrame({
        seq: 2,
        ts: 200,
        type: "continuation_request",
        iteration: 5,
        payload: { confirmation_id: "continue-current" },
      });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.pendingContinuationRequest).toEqual(
        expect.objectContaining({ confirmationId: "continue-current" }),
      );
    });

    await act(async () => {
      await lastChatMessagesProps.onContinuationDecision({
        confirmationId: "continue-stale",
        approved: true,
      });
    });
    expect(window.unchainAPI.respondToolConfirmation).not.toHaveBeenCalled();
    expect(lastChatMessagesProps?.pendingContinuationRequest).toEqual(
      expect.objectContaining({ confirmationId: "continue-current" }),
    );

    act(() => {
      firstRunHandlers.onDone({});
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.pendingContinuationRequest).toBeNull();
    });
  });

  test("preserves a newer continuation prompt while an older decision settles", async () => {
    let resolveOldDecision;
    let rejectCurrentDecision;
    window.unchainAPI.respondToolConfirmation = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOldDecision = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectCurrentDecision = reject;
          }),
      );

    renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Keep the newest continuation prompt" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });
    const firstRunHandlers = streamHandlers;

    act(() => {
      firstRunHandlers.onFrame({
        seq: 1,
        ts: 100,
        type: "continuation_request",
        iteration: 4,
        payload: { confirmation_id: "continue-old" },
      });
    });
    let oldDecisionPromise;
    act(() => {
      oldDecisionPromise = lastChatMessagesProps.onContinuationDecision({
        confirmationId: "continue-old",
        approved: true,
      });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.pendingContinuationRequest).toEqual(
        expect.objectContaining({
          confirmationId: "continue-old",
          status: "submitting",
        }),
      );
    });

    act(() => {
      firstRunHandlers.onFrame({
        seq: 2,
        ts: 200,
        type: "continuation_request",
        iteration: 5,
        payload: { confirmation_id: "continue-current" },
      });
    });
    await act(async () => {
      resolveOldDecision({
        status: "ok",
        disposition: "live_only",
        durable: false,
        interaction_id: "continue-old",
      });
      await oldDecisionPromise;
    });
    expect(lastChatMessagesProps?.pendingContinuationRequest).toEqual(
      expect.objectContaining({
        confirmationId: "continue-current",
        status: "idle",
      }),
    );

    let currentDecisionPromise;
    act(() => {
      currentDecisionPromise = lastChatMessagesProps.onContinuationDecision({
        confirmationId: "continue-current",
        approved: false,
      });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.pendingContinuationRequest).toEqual(
        expect.objectContaining({
          confirmationId: "continue-current",
          status: "submitting",
        }),
      );
    });
    act(() => {
      firstRunHandlers.onFrame({
        seq: 3,
        ts: 300,
        type: "continuation_request",
        iteration: 6,
        payload: { confirmation_id: "continue-latest" },
      });
    });
    await act(async () => {
      rejectCurrentDecision(new Error("decision failed"));
      await currentDecisionPromise;
    });
    expect(lastChatMessagesProps?.pendingContinuationRequest).toEqual(
      expect.objectContaining({
        confirmationId: "continue-latest",
        status: "idle",
      }),
    );
  });

  test("clears only the background chat continuation prompt on transport error", async () => {
    const chatAId = seedActiveChatMessages([
      {
        id: "user-continuation-error-a",
        role: "user",
        content: "Continuation error chat A",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:gpt-5" }, { source: "test" });
    const createdB = createChatInSelectedContext(
      { title: "Continuation error chat B" },
      { source: "test" },
    );
    setChatMessages(
      createdB.chatId,
      [
        {
          id: "user-continuation-error-b",
          role: "user",
          content: "Stable continuation chat B",
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
      target: { value: "Fail chat A after continuation" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });
    const firstRunHandlers = streamHandlers;
    act(() => {
      firstRunHandlers.onFrame({
        seq: 1,
        ts: 100,
        type: "continuation_request",
        iteration: 7,
        payload: { confirmation_id: "continue-error-a" },
      });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.pendingContinuationRequest).toEqual(
        expect.objectContaining({ confirmationId: "continue-error-a" }),
      );
    });

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
      expect(lastChatMessagesProps?.pendingContinuationRequest).toBeNull();
    });

    act(() => {
      firstRunHandlers.onError({
        code: "stream_bridge_failed",
        message: "terminated",
      });
    });
    expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId);
    expect(lastChatMessagesProps?.pendingContinuationRequest).toBeNull();

    act(() => {
      selectTreeNode({ nodeId: chatANodeId }, { source: "test" });
    });
    await waitFor(() => {
      expect(lastChatMessagesProps?.chatId).toBe(chatAId);
      expect(lastChatMessagesProps?.pendingContinuationRequest).toBeNull();
    });
  });

  test("retries a retryable revision conflict with the same mutation operation", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ memory: { enabled: true } }),
    );
    const operationId = "turn-retryable-revision-conflict";
    const originalMessages = [
      {
        id: "user-retryable-revision-conflict",
        role: "user",
        content: "Retry this resend safely",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "assistant-retryable-revision-conflict",
        role: "assistant",
        content: "Old answer",
        status: "done",
        createdAt: 2,
        updatedAt: 2,
      },
    ];
    const sessionId = seedActiveChatMessages(originalMessages);
    expect(
      enqueueTurnMutation({
        operationId,
        chatId: sessionId,
        sessionId,
        kind: "resend",
        targetMessageId: "user-retryable-revision-conflict",
        originalFingerprint:
          fingerprintTurnMutationMessages(originalMessages),
        baseFingerprint: fingerprintTurnMutationMessages([]),
        baseMessageCount: 0,
        text: "Retry this resend safely",
        modelId: "openai:gpt-5",
        threadId: sessionId,
        expectedSessionRevision: 9,
      }),
    ).toEqual(expect.objectContaining({ operationId }));
    let resolveRevisionConflict;
    window.unchainAPI.replaceSessionMemory
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRevisionConflict = resolve;
          }),
      )
      .mockResolvedValueOnce({
        applied: true,
        replayed: false,
        operation_id: operationId,
        session_revision: 10,
      });

    renderChat();
    await waitForBoot();

    await waitFor(() => {
      expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1);
    });
    expect(readTurnMutationOutbox()).toEqual([
      expect.objectContaining({ operationId, expectedSessionRevision: 9 }),
    ]);
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();

    await act(async () => {
      resolveRevisionConflict({
        applied: false,
        error: {
          code: "session_revision_conflict",
          message: "Revision is still being settled",
          retryable: true,
          status: 409,
        },
      });
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(2);
        expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      },
      { timeout: 2500 },
    );

    const mutationPayloads =
      window.unchainAPI.replaceSessionMemory.mock.calls.map(([payload]) =>
        payload,
      );
    expect(mutationPayloads).toEqual([
      expect.objectContaining({
        operation_id: operationId,
        expected_session_revision: 9,
      }),
      expect.objectContaining({
        operation_id: operationId,
        expected_session_revision: 9,
      }),
    ]);
    expect(window.unchainAPI.startStreamV2.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        message: "Retry this resend safely",
        attempt_id: operationId,
      }),
    );
    expect(readTurnMutationOutbox()).toHaveLength(1);

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: Date.now(),
        type: "run_started",
        payload: { attempt_id: operationId },
      });
    });
    await waitFor(() => {
      expect(readTurnMutationOutbox()).toEqual([]);
    });
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

  test("resend and edit lock the chat across async memory replacement", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ memory: { enabled: true } }),
    );

    renderChat();
    await waitForReady();
    await sendTurn("First turn", "A1");
    await sendTurn("Second turn", "A2");

    let secondUserMessage = lastChatMessagesProps.messages.find(
      (message) => message.role === "user" && message.content === "Second turn",
    );
    let resolveResendMemory;
    window.unchainAPI.replaceSessionMemory.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveResendMemory = resolve;
        }),
    );
    let resendPromise;
    act(() => {
      resendPromise = lastChatMessagesProps.onResendMessage(secondUserMessage);
    });
    await waitFor(() => {
      expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId("chat-input"), {
        target: { value: "Newer draft during resend" },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("chat-input")).toHaveValue(
      "Newer draft during resend",
    );
    expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveResendMemory({ applied: true });
      await resendPromise;
    });
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(3);
    });
    expect(window.unchainAPI.startStreamV2.mock.calls[2][0].message).toBe(
      "Second turn",
    );
    await completeAssistantReply("A2 resend");

    secondUserMessage = lastChatMessagesProps.messages.find(
      (message) => message.role === "user" && message.content === "Second turn",
    );
    let resolveEditMemory;
    window.unchainAPI.replaceSessionMemory.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveEditMemory = resolve;
        }),
    );
    let editPromise;
    act(() => {
      editPromise = lastChatMessagesProps.onEditMessage(
        secondUserMessage,
        "Edited second turn",
      );
    });
    await waitFor(() => {
      expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId("chat-input"), {
        target: { value: "Newer draft during edit" },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("chat-input")).toHaveValue(
      "Newer draft during edit",
    );
    expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(2);
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(3);

    await act(async () => {
      resolveEditMemory({ applied: true });
      await editPromise;
    });
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(4);
    });
    expect(window.unchainAPI.startStreamV2.mock.calls[3][0].message).toBe(
      "Edited second turn",
    );
    expect(screen.getByTestId("chat-input")).toHaveValue(
      "Newer draft during edit",
    );
  });

  test("retains a queued relay while a resend owns the chat and sends it once after release", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ memory: { enabled: true } }),
    );

    renderChat();
    await waitForReady();
    await sendTurn("Seed turn for queued relay", "Seed answer");
    const seedUserMessage = lastChatMessagesProps.messages.find(
      (message) =>
        message.role === "user" &&
        message.content === "Seed turn for queued relay",
    );

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run before queued relay" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    });
    const activeRunHandlers = streamHandlers;

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue Relay this exactly once" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(lastChatInputProps?.interjectState?.queueItems).toHaveLength(1);
    });

    let resolveResendMemory;
    window.unchainAPI.replaceSessionMemory.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveResendMemory = resolve;
        }),
    );
    act(() => {
      activeRunHandlers.onFrame({
        seq: 1,
        ts: Date.now(),
        type: "final_message",
        payload: { content: "Run before relay finished" },
      });
      activeRunHandlers.onDone({});
    });

    let resendPromise;
    act(() => {
      resendPromise = lastChatMessagesProps.onResendMessage(seedUserMessage);
    });
    await waitFor(() => {
      expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    expect(lastChatInputProps?.interjectState?.queueItems).toHaveLength(1);

    await act(async () => {
      resolveResendMemory({ applied: true });
      await resendPromise;
    });
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(3);
    });
    expect(window.unchainAPI.startStreamV2.mock.calls[2][0].message).toBe(
      "Seed turn for queued relay",
    );

    await completeAssistantReply("Seed answer after resend");
    await waitFor(
      () => {
        expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(4);
      },
      { timeout: 2500 },
    );
    const relayPayloads = window.unchainAPI.startStreamV2.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload.message === "Relay this exactly once");
    expect(relayPayloads).toHaveLength(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(
      window.unchainAPI.startStreamV2.mock.calls.filter(
        ([payload]) => payload.message === "Relay this exactly once",
      ),
    ).toHaveLength(1);
  });

  test("does not relay a consumed queue item again after stream startup throws", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run that owns the queue" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    const activeRunHandlers = streamHandlers;

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue Do not duplicate after startup failure" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(lastChatInputProps?.interjectState?.queueItems).toHaveLength(1);
    });

    window.unchainAPI.startStreamV2.mockImplementationOnce(() => {
      throw new Error("stream bridge failed after consuming the queued turn");
    });
    act(() => {
      activeRunHandlers.onFrame({
        seq: 1,
        ts: Date.now(),
        type: "final_message",
        payload: { content: "Queue owner finished" },
      });
      activeRunHandlers.onDone({});
    });

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
      const queueUsers = lastChatMessagesProps.messages.filter(
        (message) =>
          message.role === "user" &&
          message.content === "Do not duplicate after startup failure",
      );
      expect(queueUsers).toHaveLength(1);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    expect(
      lastChatMessagesProps.messages.filter(
        (message) =>
          message.role === "user" &&
          message.content === "Do not duplicate after startup failure",
      ),
    ).toHaveLength(1);
  });

  test("releases a pre-outbox mutation owner after unmount so a remount can retry", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ memory: { enabled: true } }),
    );
    const chatId = seedActiveChatMessages([
      {
        id: "user-pre-outbox-owner",
        role: "user",
        content: "Retry after the old page closes",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "assistant-pre-outbox-owner",
        role: "assistant",
        content: "Old answer",
        status: "done",
        createdAt: 2,
        updatedAt: 2,
      },
    ]);
    let resolveFirstRevision;
    window.unchainAPI.getSessionMemoryExport
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstRevision = resolve;
          }),
      )
      .mockResolvedValueOnce({
        session_id: chatId,
        session_revision: 2,
        messages: [],
      });

    const firstRender = renderChat();
    await waitForReady();
    const firstTarget = lastChatMessagesProps.messages.find(
      (message) => message.id === "user-pre-outbox-owner",
    );
    let firstResendPromise;
    act(() => {
      firstResendPromise = lastChatMessagesProps.onResendMessage(firstTarget);
    });
    await waitFor(() => {
      expect(window.unchainAPI.getSessionMemoryExport).toHaveBeenCalledTimes(1);
    });
    expect(readTurnMutationOutbox()).toEqual([]);
    firstRender.unmount();

    renderChat();
    await waitForReady();
    const secondTarget = lastChatMessagesProps.messages.find(
      (message) => message.id === "user-pre-outbox-owner",
    );
    await act(async () => {
      await lastChatMessagesProps.onResendMessage(secondTarget);
    });
    await waitFor(() => {
      expect(window.unchainAPI.getSessionMemoryExport).toHaveBeenCalledTimes(2);
      expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1);
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveFirstRevision({
        session_id: chatId,
        session_revision: 1,
        messages: [],
      });
      await firstResendPromise;
    });
    expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
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

  test("delete locks the chat until async memory replacement commits", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ memory: { enabled: true } }),
    );

    renderChat();
    await waitForReady();
    await sendTurn("First turn", "A1");
    await sendTurn("Second turn", "A2");
    const firstAssistantMessage = lastChatMessagesProps.messages.find(
      (message) => message.role === "assistant" && message.content === "A1",
    );

    let resolveDeleteMemory;
    window.unchainAPI.replaceSessionMemory.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDeleteMemory = resolve;
        }),
    );
    let deletePromise;
    act(() => {
      deletePromise = lastChatMessagesProps.onDeleteMessage(
        firstAssistantMessage,
      );
    });
    await waitFor(() => {
      expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Newer draft during delete" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    expect(screen.getByTestId("chat-input")).toHaveValue(
      "Newer draft during delete",
    );
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveDeleteMemory({ applied: true });
      await deletePromise;
    });
    await waitFor(() => {
      expect(
        lastChatMessagesProps.messages.map((message) => message.content),
      ).toEqual(["Second turn", "A2"]);
    });
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("chat-input")).toHaveValue(
      "Newer draft during delete",
    );
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

  test("queue relay fails closed without a proven execution session owner", () => {
    expect(resolveQueueRelaySessionOwner()).toBe("");
    expect(
      resolveQueueRelaySessionOwner({
        sourceSessionId: " ",
        activeSessionId: "",
        runContextSessionId: null,
      }),
    ).toBe("");
  });

  test("queue relay fails closed when exact session owners disagree", () => {
    expect(
      resolveQueueRelaySessionOwner({
        sourceSessionId: "execution-a",
        activeSessionId: "execution-a",
        runContextSessionId: "execution-b",
      }),
    ).toBe("");
  });

  test("holds an exact queued successor behind an authoritative suspended interaction", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-behind-suspension",
          text: "Run only after the suspended interaction is sealed",
          status: "queued",
        },
      ],
    });
    const pending = buildPendingInteraction({
      sessionId: chatId,
      interactionId: "interaction-queued-suspension",
      callId: "call-queued-suspension",
      sourceRunId: "attempt-reattach",
    });
    window.unchainAPI.getPendingInteraction = jest.fn(
      async ({ session_id: sessionId } = {}) =>
        sessionId === chatId
          ? pending
          : { status: "none", session_id: sessionId || "" },
    );
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onDone({ finished_at: Date.now() });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          active: false,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    window.unchainAPI.startStreamV4 = jest.fn();

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalledWith({
        session_id: chatId,
      });
      expect(
        lastChatMessagesProps?.pendingToolConfirmationRequests?.[
          pending.interaction_id
        ],
      ).toBeDefined();
    });

    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
    expect(window.unchainAPI.cancelExecution).not.toHaveBeenCalled();
    expect(readQueuedTurnsForAttempt(chatId, "attempt-reattach")?.items).toEqual([
      expect.objectContaining({
        id: "queue-behind-suspension",
        status: "queued",
      }),
    ]);
  });

  test("keeps a queued successor when a wrong-session none conflicts with its bound run", async () => {
    const chatId = getChatsStore().activeChatId;
    const wrongSessionId = "execution-wrong-session";
    seedPersistedV4Attempt({ chatId });
    const seededMessages = getChatsStore().chatsById[chatId].messages;
    setChatMessages(
      chatId,
      seededMessages.map((message) =>
        message.role === "assistant"
          ? {
              ...message,
              meta: {
                ...message.meta,
                executionSessionId: wrongSessionId,
              },
            }
          : message,
      ),
      { source: "test" },
    );
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-behind-wrong-session-none",
          text: "Do not run against a guessed session",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.getPendingInteraction = jest.fn(
      async ({ session_id: sessionId } = {}) => ({
        status: "none",
        session_id: sessionId || "",
      }),
    );
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onDone({ finished_at: Date.now() });
        return {
          requestId: "request-reattach",
          executionId: wrongSessionId,
          attemptId: "attempt-reattach",
          terminal: true,
          active: false,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    window.unchainAPI.startStreamV4 = jest.fn();

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalledWith({
        session_id: chatId,
      });
      expect(window.unchainAPI.attachStreamV4).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
    expect(readQueuedTurnsForAttempt(chatId, "attempt-reattach")?.items).toEqual([
      expect.objectContaining({
        id: "queue-behind-wrong-session-none",
        status: "queued",
      }),
    ]);
  });

  test("seals a cold recorded receipt before relaying its exact queued successor", async () => {
    const chatId = getChatsStore().activeChatId;
    const interactionId = "interaction-cold-queued-receipt";
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-after-cold-receipt",
          text: "Run after the cold receipt is sealed",
          status: "queued",
        },
      ],
    });
    const receipt = buildPendingInteraction({
      sessionId: chatId,
      status: "receipt_recorded",
      interactionId,
      callId: "call-cold-queued-receipt",
      sourceRunId: "attempt-reattach",
    });
    let pendingState = { status: "none", session_id: chatId };
    window.unchainAPI.getPendingInteraction = jest.fn(
      async ({ session_id: sessionId } = {}) =>
        sessionId === chatId
          ? pendingState
          : { status: "none", session_id: sessionId || "" },
    );
    window.unchainAPI.cancelExecution.mockImplementation(async (payload) => {
      pendingState = { status: "none", session_id: chatId };
      return {
        status: "ok",
        attempt_id: payload.attempt_id,
        source_attempt_id: payload.source_attempt_id,
      };
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        pendingState = receipt;
        handlers.onDone({ finished_at: Date.now() });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          active: false,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    const relayRuns = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      relayRuns.push({ payload, handlers });
      return {
        requestId: "request-after-cold-receipt",
        executionId: payload.threadId,
        attemptId: "attempt-after-cold-receipt",
        detach: jest.fn(),
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
        owner_chat_id: chatId,
        session_id: chatId,
        attempt_id: "attempt-reattach",
        source_attempt_id: "attempt-reattach",
        interaction_id: interactionId,
        reason: "interaction_suspended",
        idempotency_key: `interaction-pause:attempt-reattach:${interactionId}`,
      });
      expect(relayRuns).toHaveLength(1);
    });

    expect(
      window.unchainAPI.cancelExecution.mock.invocationCallOrder[0],
    ).toBeLessThan(window.unchainAPI.startStreamV4.mock.invocationCallOrder[0]);
    expect(relayRuns[0].payload).toEqual(
      expect.objectContaining({
        message: "Run after the cold receipt is sealed",
      }),
    );
    expect(
      window.unchainAPI.startStreamV4.mock.calls.some(
        ([payload]) => payload?.mode === "resume_interaction",
      ),
    ).toBe(false);
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
    expect(readQueuedTurnsForAttempt(chatId, "attempt-reattach")).toBeNull();
  });

  test("keeps the exact relay outbox queued while authoritative lookup fails", async () => {
    jest.useFakeTimers();
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-during-lookup-failure",
          text: "Keep this queued through lookup failure",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.getPendingInteraction = jest.fn(async () => {
      throw new Error("pending lookup unavailable");
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onDone({ finished_at: Date.now() });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          active: false,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    window.unchainAPI.startStreamV4 = jest.fn();

    try {
      renderChat();
      await waitForBoot();
      await waitFor(() => {
        expect(window.unchainAPI.getPendingInteraction).toHaveBeenCalled();
      });
      await act(async () => {
        jest.advanceTimersByTime(1250);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(
        window.unchainAPI.getPendingInteraction.mock.calls.length,
      ).toBeGreaterThan(1);
      expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-reattach")?.items,
      ).toEqual([
        expect.objectContaining({
          id: "queue-during-lookup-failure",
          status: "queued",
        }),
      ]);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test("returned relay handle keeps the new-attempt outbox until authoritative acceptance", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    const seededMessages = getChatsStore().chatsById[chatId].messages;
    setChatMessages(
      chatId,
      [
        {
          ...seededMessages[0],
          attachments: [
            {
              id: "relay-hydration-gate",
              name: "gate.txt",
              kind: "text",
              mimeType: "text/plain",
              sizeBytes: 4,
            },
          ],
        },
        seededMessages[1],
      ],
      { source: "test" },
    );
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-before-consumed",
          text: "Retry after the crash",
          status: "queued",
        },
      ],
    });
    jest
      .spyOn(attachmentStorage, "loadAttachmentPayload")
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ type: "text", text: "gate" });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (identity, handlers = {}) => {
        if (identity.attemptId !== "attempt-reattach") {
          handlers.onRuntimeEvent(
            buildReattachEvent({
              chatId,
              id: "retried-relay-session-only",
              type: "session.started",
              seq: 8,
              payload: { status: "running" },
            }),
            { streamSeq: 8 },
          );
          return {
            requestId: identity.requestId,
            executionId: identity.executionId,
            attemptId: identity.attemptId,
            terminal: false,
            active: true,
            detach: jest.fn(),
            disconnect: jest.fn(),
            cancel: jest.fn(),
          };
        }
        handlers.onDone({ finished_at: Date.now() });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    const retriedRelayRuns = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      const runNumber = retriedRelayRuns.length + 1;
      retriedRelayRuns.push({ payload, handlers, runNumber });
      return {
        requestId: `request-retried-relay-${runNumber}`,
        executionId: payload.threadId,
        attemptId:
          runNumber === 1
            ? "attempt-retried-relay"
            : "attempt-retried-relay-remainder",
        detach: jest.fn(),
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });

    const view = renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(attachmentStorage.loadAttachmentPayload).toHaveBeenCalledTimes(1);
      expect(lastChatInputProps?.interjectState?.queueItems).toEqual([
        expect.objectContaining({
          id: "queue-before-consumed",
          status: "relayed",
        }),
      ]);
    });
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-reattach")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-before-consumed",
        status: "queued",
      }),
    ]);
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();

    view.unmount();
    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
    });
    expect(window.unchainAPI.startStreamV4.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        threadId: chatId,
        message: "Retry after the crash",
      }),
    );
    expect(readQueuedTurnsForAttempt(chatId, "attempt-reattach")).toBeNull();
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-retried-relay")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-before-consumed",
        status: "relayed",
      }),
    ]);

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue Keep this exact remainder" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-retried-relay")?.items,
      ).toEqual([
        expect.objectContaining({
          id: "queue-before-consumed",
          status: "relayed",
        }),
        expect.objectContaining({
          text: "Keep this exact remainder",
          status: "queued",
        }),
      ]);
    });
    const firstRemainderId = readQueuedTurnsForAttempt(
      chatId,
      "attempt-retried-relay",
    ).items[1].id;
    act(() => {
      lastChatInputProps.onQueueUndo(firstRemainderId);
    });
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-retried-relay")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-before-consumed",
        status: "relayed",
      }),
    ]);

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue Keep this exact remainder" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-retried-relay")?.items,
      ).toHaveLength(2);
    });
    const remainderId = readQueuedTurnsForAttempt(
      chatId,
      "attempt-retried-relay",
    ).items[1].id;

    act(() => {
      retriedRelayRuns[0].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "retried-relay-session-started",
          type: "session.started",
          seq: 7,
          payload: { status: "running" },
        }),
        { streamSeq: 7 },
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-retried-relay")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-before-consumed",
        status: "relayed",
      }),
      expect.objectContaining({
        id: remainderId,
        status: "queued",
      }),
    ]);
    expect(window.unchainAPI.attachStreamV4).toHaveBeenCalledTimes(2);
    expect(window.unchainAPI.attachStreamV4.mock.calls[1][0]).toMatchObject({
      requestId: "request-retried-relay-1",
      executionId: chatId,
      attemptId: "attempt-retried-relay",
      afterSeq: 7,
    });
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);

    act(() => {
      retriedRelayRuns[0].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "retried-relay-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
      );
    });
    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-retried-relay")?.items,
      ).toEqual([
        expect.objectContaining({
          id: remainderId,
          status: "queued",
        }),
      ]);
    });

    act(() => {
      retriedRelayRuns[0].handlers.onDone({ finished_at: Date.now() });
    });
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(2);
    });
    expect(readQueuedTurnsForAttempt(chatId, "attempt-retried-relay")).toBeNull();
    expect(
      readQueuedTurnsForAttempt(
        chatId,
        "attempt-retried-relay-remainder",
      )?.items,
    ).toEqual([
      expect.objectContaining({
        id: remainderId,
        status: "relayed",
      }),
    ]);
    act(() => {
      retriedRelayRuns[1].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "retried-remainder-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
      );
    });
    expect(
      readQueuedTurnsForAttempt(
        chatId,
        "attempt-retried-relay-remainder",
      ),
    ).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    expect(lastChatInputProps?.interjectState?.queueItems).toEqual([]);
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(2);
  });

  test.each([
    {
      proof: "the first pre-register cancellation tombstone",
      attachErrorCode: "stream_not_found",
      cancelResponse: {
        status: "ok",
        disposition: "cancelled_before_register",
        state: "cancelled",
      },
    },
    {
      proof: "an idempotent never-registered cancellation snapshot",
      attachErrorCode: "stream_attach_target_unavailable",
      cancelResponse: {
        status: "ok",
        disposition: "unchanged",
        state: "cancelled",
        execution: { registered_at_ms: null },
      },
    },
  ])(
    "silent queue relay retries only after $proof proves it never registered",
    async ({ attachErrorCode, cancelResponse }) => {
      const chatId = getChatsStore().activeChatId;
      const queueText = "Retry only after a cancellation tombstone";
      const runs = installSilentQueueRelayWatchdog({
        chatId,
        queueId: "queue-watchdog-safe-retry",
        queueText,
        attachErrorCode,
        cancelResponse,
      });

      renderChat();
      await waitForBoot();
      await waitFor(
        () => {
          expect(runs).toHaveLength(2);
        },
        { timeout: 3500 },
      );

      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
        owner_chat_id: chatId,
        session_id: chatId,
        attempt_id: "attempt-watchdog-1",
        request_id: "request-watchdog-1",
        reason: "queue_relay_acceptance_unverified",
        idempotency_key: "queue-relay-acceptance:attempt-watchdog-1",
      });
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-watchdog-1"),
      ).toBeNull();
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-watchdog-2")?.items,
      ).toEqual([
        expect.objectContaining({
          id: "queue-watchdog-safe-retry",
          status: "relayed",
        }),
      ]);
      expect(
        getChatsStore().chatsById[chatId].messages.filter(
          (message) => message.role === "user" && message.content === queueText,
        ),
      ).toHaveLength(1);

      act(() => {
        runs[1].handlers.onRuntimeEvent(
          buildReattachEvent({
            chatId,
            id: "watchdog-safe-retry-started",
            type: "run.started",
            seq: 1,
            payload: { status: "running" },
          }),
          { streamSeq: 1 },
        );
        runs[1].handlers.onDone({ finished_at: Date.now() });
      });
      await waitFor(() => {
        expect(
          readQueuedTurnsForAttempt(chatId, "attempt-watchdog-2"),
        ).toBeNull();
      });
      expect(runs).toHaveLength(2);
    },
  );

  test.each([
    { disposition: "applied", state: "cancelled" },
    { disposition: "already_terminal", state: "completed" },
    {
      disposition: "unchanged",
      state: "cancelled",
      execution: { registered_at_ms: 123 },
    },
  ])(
    "silent queue relay stays fail-closed when exact cancellation is $disposition/$state",
    async ({ disposition, state, execution }) => {
      const chatId = getChatsStore().activeChatId;
      const queueId = `queue-watchdog-${disposition}`;
      const queueText = `Do not duplicate ${disposition}`;
      const runs = installSilentQueueRelayWatchdog({
        chatId,
        queueId,
        queueText,
        attachErrorCode: "stream_not_found",
        cancelResponse: { status: "ok", disposition, state, execution },
      });

      renderChat();
      await waitForBoot();
      await waitFor(
        () => {
          expect(
            [...getChatsStore().chatsById[chatId].messages]
              .reverse()
              .find((message) => message.role === "assistant")?.meta?.error,
          ).toMatchObject({ code: "queue_relay_stream_not_found" });
        },
        { timeout: 3500 },
      );

      expect(runs).toHaveLength(1);
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-watchdog-1")?.items,
      ).toEqual([
        expect.objectContaining({ id: queueId, status: "relayed" }),
      ]);
      expect(
        getChatsStore().chatsById[chatId].messages.filter(
          (message) => message.role === "user" && message.content === queueText,
        ),
      ).toHaveLength(1);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
      });
      expect(runs).toHaveLength(1);
    },
  );

  test.each([
    {
      lifecycleReason: "app_windows_closed",
      cancelResponse: {
        status: "ok",
        disposition: "cancelled_before_register",
        state: "cancelled",
        execution: {
          registered_at_ms: null,
          reason: "app_windows_closed",
        },
      },
    },
    {
      lifecycleReason: "system_suspend",
      cancelResponse: {
        status: "ok",
        disposition: "unchanged",
        state: "cancelled",
        execution: { registered_at_ms: null },
        cancellation: { reason: "system_suspend" },
      },
    },
  ])(
    "never auto-retries a never-registered queue relay stopped by $lifecycleReason",
    async ({ lifecycleReason, cancelResponse }) => {
      const chatId = getChatsStore().activeChatId;
      const queueId = `queue-watchdog-${lifecycleReason}`;
      const queueText = `Do not resume after ${lifecycleReason}`;
      const runs = installSilentQueueRelayWatchdog({
        chatId,
        queueId,
        queueText,
        attachErrorCode: "stream_not_found",
        cancelResponse,
      });

      renderChat();
      await waitForBoot();
      await waitFor(
        () => {
          expect(
            [...getChatsStore().chatsById[chatId].messages]
              .reverse()
              .find((message) => message.role === "assistant")?.meta?.error,
          ).toMatchObject({ code: "queue_relay_stream_not_found" });
        },
        { timeout: 3500 },
      );

      expect(runs).toHaveLength(1);
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-watchdog-1")?.items,
      ).toEqual([
        expect.objectContaining({ id: queueId, status: "relayed" }),
      ]);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
      });
      expect(runs).toHaveLength(1);
    },
  );

  test("queue relay replay gaps cancel exact ownership and never auto-retry", async () => {
    const chatId = getChatsStore().activeChatId;
    const runs = installSilentQueueRelayWatchdog({
      chatId,
      queueId: "queue-watchdog-replay-gap",
      queueText: "Never replay across a missing prefix",
      attachErrorCode: "stream_replay_gap",
      cancelResponse: {
        status: "ok",
        disposition: "cancelled_before_register",
        state: "cancelled",
      },
    });

    renderChat();
    await waitForBoot();
    await waitFor(
      () => {
        expect(
          [...getChatsStore().chatsById[chatId].messages]
            .reverse()
            .find((message) => message.role === "assistant")?.meta?.error,
        ).toMatchObject({ code: "stream_replay_gap" });
      },
      { timeout: 3500 },
    );

    expect(runs).toHaveLength(1);
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledWith({
      owner_chat_id: chatId,
      session_id: chatId,
      attempt_id: "attempt-watchdog-1",
      request_id: "request-watchdog-1",
      reason: "queue_relay_acceptance_unverified",
      idempotency_key: "queue-relay-acceptance:attempt-watchdog-1",
    });
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-watchdog-1")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-watchdog-replay-gap",
        status: "relayed",
      }),
    ]);
  });

  test("late acceptance during exact cancellation terminalizes locally without retrying", async () => {
    const chatId = getChatsStore().activeChatId;
    let resolveCancellation;
    const runs = installSilentQueueRelayWatchdog({
      chatId,
      queueId: "queue-watchdog-late-acceptance",
      queueText: "Accept while cancellation is pending",
      attachErrorCode: "stream_not_found",
      cancelResponse: null,
    });
    window.unchainAPI.cancelExecution = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveCancellation = resolve;
        }),
    );

    renderChat();
    await waitForBoot();
    await waitFor(
      () => {
        expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
      },
      { timeout: 3500 },
    );

    act(() => {
      runs[0].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "watchdog-late-acceptance-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
        { streamSeq: 1 },
      );
    });
    await act(async () => {
      resolveCancellation({
        status: "ok",
        disposition: "applied",
        state: "cancelled",
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getChatsStore().chatsById[chatId].isGenerating).toBe(false);
    });
    expect(runs).toHaveLength(1);
    expect(readQueuedTurnsForAttempt(chatId, "attempt-watchdog-1")).toBeNull();
    expect(
      [...getChatsStore().chatsById[chatId].messages]
        .reverse()
        .find((message) => message.role === "assistant")?.meta?.error,
    ).toMatchObject({
      code: "queue_relay_transport_lost_after_acceptance",
    });
  });

  test("partial replay acceptance followed by attach failure cannot strand a stream", async () => {
    const chatId = getChatsStore().activeChatId;
    const runs = installSilentQueueRelayWatchdog({
      chatId,
      queueId: "queue-watchdog-partial-replay",
      queueText: "Accept once before replay transport fails",
      attachErrorCode: "stream_attach_target_unavailable",
      cancelResponse: {
        status: "ok",
        disposition: "applied",
        state: "cancelled",
      },
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (identity, handlers = {}) => {
        if (identity.attemptId === "attempt-reattach") {
          handlers.onDone({ finished_at: Date.now() });
          return {
            requestId: "request-reattach",
            executionId: chatId,
            attemptId: "attempt-reattach",
            terminal: true,
            active: false,
            detach: jest.fn(),
            disconnect: jest.fn(),
            cancel: jest.fn(),
          };
        }
        handlers.onRuntimeEvent(
          buildReattachEvent({
            chatId,
            id: "watchdog-partial-replay-started",
            type: "run.started",
            seq: 1,
            payload: { status: "running" },
          }),
          { streamSeq: 1 },
        );
        throw Object.assign(new Error("renderer vanished during replay"), {
          code: "stream_attach_target_unavailable",
        });
      },
    );

    renderChat();
    await waitForBoot();
    await waitFor(
      () => {
        expect(getChatsStore().chatsById[chatId].isGenerating).toBe(false);
      },
      { timeout: 3500 },
    );

    expect(runs).toHaveLength(1);
    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
    expect(readQueuedTurnsForAttempt(chatId, "attempt-watchdog-1")).toBeNull();
    expect(
      [...getChatsStore().chatsById[chatId].messages]
        .reverse()
        .find((message) => message.role === "assistant")?.meta?.error,
    ).toMatchObject({
      code: "queue_relay_transport_lost_after_acceptance",
    });
  });

  test("synchronous relay acceptance before handle return is never rebound", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-sync-accept",
          text: "Accept this synchronously",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (identity, handlers = {}) => {
        if (identity.attemptId === "attempt-reattach") {
          handlers.onDone({ finished_at: Date.now() });
        }
        return {
          requestId: identity.requestId,
          executionId: identity.executionId,
          attemptId: identity.attemptId,
          terminal: identity.attemptId === "attempt-reattach",
          active: identity.attemptId !== "attempt-reattach",
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "sync-relay-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
      );
      return {
        requestId: "request-sync-relay",
        executionId: payload.threadId,
        attemptId: "attempt-sync-relay",
        detach: jest.fn(),
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
    });
    expect(
      lastChatMessagesProps.messages.filter(
        (message) =>
          message.role === "user" &&
          message.content === "Accept this synchronously",
      ),
    ).toHaveLength(1);
    expect(
      getChatsStore().chatsById[chatId].messages.filter(
        (message) =>
          message.role === "user" &&
          message.content === "Accept this synchronously",
      ),
    ).toHaveLength(1);
    expect(readQueuedTurnsForAttempt(chatId, "attempt-reattach")).toBeNull();
    expect(readQueuedTurnsForAttempt(chatId, "attempt-sync-relay")).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });

    expect(readQueuedTurnsForAttempt(chatId, "attempt-reattach")).toBeNull();
    expect(readQueuedTurnsForAttempt(chatId, "attempt-sync-relay")).toBeNull();
    expect(lastChatInputProps?.interjectState?.queueItems).toEqual([]);
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
    expect(
      getChatsStore().chatsById[chatId].messages.filter(
        (message) =>
          message.role === "user" &&
          message.content === "Accept this synchronously",
      ),
    ).toHaveLength(1);
  });

  test("pre-acceptance lease conflict retries once under the rebound owner", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-lease-retry",
          text: "Retry once after lease conflict",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onDone({ finished_at: Date.now() });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    const relayRuns = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      const runNumber = relayRuns.length + 1;
      relayRuns.push({ payload, handlers, runNumber });
      return {
        requestId: `request-lease-retry-${runNumber}`,
        executionId: payload.threadId,
        attemptId: `attempt-lease-retry-${runNumber}`,
        detach: jest.fn(),
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(relayRuns).toHaveLength(1);
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-lease-retry-1")?.items,
      ).toEqual([
        expect.objectContaining({
          id: "queue-lease-retry",
          status: "relayed",
        }),
      ]);
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue Preserve this companion through retry" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-lease-retry-1")?.items,
      ).toEqual([
        expect.objectContaining({
          id: "queue-lease-retry",
          status: "relayed",
        }),
        expect.objectContaining({
          text: "Preserve this companion through retry",
          status: "queued",
        }),
      ]);
    });
    const companionId = readQueuedTurnsForAttempt(
      chatId,
      "attempt-lease-retry-1",
    ).items[1].id;

    act(() => {
      relayRuns[0].handlers.onError({
        code: "execution_lease_conflict",
        message: "another owner still holds the lease",
      });
      relayRuns[0].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "rejected-relay-late-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
      );
    });
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-lease-retry-1")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-lease-retry",
        status: "queued",
      }),
      expect.objectContaining({
        id: companionId,
        status: "queued",
      }),
    ]);
    expect(
      getChatsStore().chatsById[chatId].messages.filter(
        (message) =>
          message.role === "user" &&
          message.content === "Retry once after lease conflict",
      ),
    ).toHaveLength(0);
    await waitFor(
      () => {
        expect(relayRuns).toHaveLength(2);
      },
      { timeout: 2500 },
    );
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-lease-retry-1"),
    ).toBeNull();
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-lease-retry-2")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-lease-retry",
        status: "relayed",
      }),
      expect.objectContaining({
        id: companionId,
        status: "relayed",
      }),
    ]);
    expect(relayRuns[1].payload.message).toContain(
      "Retry once after lease conflict",
    );
    expect(relayRuns[1].payload.message).toContain(
      "Preserve this companion through retry",
    );
    expect(
      getChatsStore().chatsById[chatId].messages.filter(
        (message) =>
          message.role === "user" &&
          message.content.includes("Retry once after lease conflict") &&
          message.content.includes("Preserve this companion through retry"),
      ),
    ).toHaveLength(1);

    act(() => {
      relayRuns[0].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "rejected-relay-late-started-after-rebound",
          type: "run.started",
          seq: 2,
          payload: { status: "running" },
        }),
      );
    });
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-lease-retry-2")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-lease-retry",
        status: "relayed",
      }),
      expect.objectContaining({
        id: companionId,
        status: "relayed",
      }),
    ]);
    expect(relayRuns).toHaveLength(2);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));
    });
    expect(relayRuns).toHaveLength(2);

    act(() => {
      relayRuns[1].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "lease-retry-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
      );
    });
    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-lease-retry-2"),
      ).toBeNull();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    expect(relayRuns).toHaveLength(2);
    expect(
      getChatsStore().chatsById[chatId].messages.filter(
        (message) =>
          message.role === "user" &&
          message.content.includes("Retry once after lease conflict") &&
          message.content.includes("Preserve this companion through retry"),
      ),
    ).toHaveLength(1);
  });

  test("an older relay cleanup cannot delete a newer relay outbox", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-chain-first",
          text: "First chained relay",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (identity, handlers = {}) => {
        if (identity.attemptId === "attempt-reattach") {
          handlers.onDone({ finished_at: Date.now() });
        }
        return {
          requestId: identity.requestId,
          executionId: identity.executionId,
          attemptId: identity.attemptId,
          terminal: identity.attemptId === "attempt-reattach",
          active: identity.attemptId !== "attempt-reattach",
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    const relayRuns = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      const runNumber = relayRuns.length + 1;
      relayRuns.push({ payload, handlers, runNumber });
      return {
        requestId: `request-chain-${runNumber}`,
        executionId: payload.threadId,
        attemptId: `attempt-chain-${runNumber}`,
        detach: jest.fn(),
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(relayRuns).toHaveLength(1);
    });
    act(() => {
      relayRuns[0].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "first-chain-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
      );
    });
    await waitFor(() => {
      expect(readQueuedTurnsForAttempt(chatId, "attempt-chain-1")).toBeNull();
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue Second chained relay" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-chain-1")?.items,
      ).toEqual([
        expect.objectContaining({
          text: "Second chained relay",
          status: "queued",
        }),
      ]);
    });
    const secondQueueId = readQueuedTurnsForAttempt(
      chatId,
      "attempt-chain-1",
    ).items[0].id;

    act(() => {
      relayRuns[0].handlers.onDone({ finished_at: Date.now() });
    });
    await waitFor(() => {
      expect(relayRuns).toHaveLength(2);
    });
    expect(relayRuns[1].payload.message).toBe("Second chained relay");
    expect(readQueuedTurnsForAttempt(chatId, "attempt-chain-1")).toBeNull();
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-chain-2")?.items,
    ).toEqual([
      {
        id: secondQueueId,
        text: "Second chained relay",
        status: "relayed",
      },
    ]);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-chain-2")?.items,
    ).toEqual([
      {
        id: secondQueueId,
        text: "Second chained relay",
        status: "relayed",
      },
    ]);
    expect(lastChatInputProps?.interjectState?.queueItems).toEqual([
      expect.objectContaining({
        id: secondQueueId,
        status: "relayed",
      }),
    ]);
    expect(relayRuns).toHaveLength(2);

    act(() => {
      relayRuns[1].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "second-chain-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
      );
    });
    expect(readQueuedTurnsForAttempt(chatId, "attempt-chain-1")).toBeNull();
    expect(readQueuedTurnsForAttempt(chatId, "attempt-chain-2")).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    expect(lastChatInputProps?.interjectState?.queueItems).toEqual([]);
    expect(relayRuns).toHaveLength(2);
  });

  test("an accepted relay cleanup cannot delete a clarify fallback replacement buffer", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-replacement-old",
          text: "First replacement relay",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onDone({ finished_at: Date.now() });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    const relayRuns = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      relayRuns.push({ payload, handlers });
      return {
        requestId: "request-replacement",
        executionId: payload.threadId,
        attemptId: "attempt-replacement",
        detach: jest.fn(),
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });
    window.unchainAPI.interject = jest.fn(async () => ({
      resolved_channel: "clarify",
    }));

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(relayRuns).toHaveLength(1);
    });
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-replacement")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-replacement-old",
        status: "relayed",
      }),
    ]);

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Clarify fallback replacement" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(readPendingClarifyForChat(chatId)).toEqual(
        expect.objectContaining({
          sourceAttemptId: "attempt-replacement",
          text: "Clarify fallback replacement",
        }),
      );
    });

    act(() => {
      relayRuns[0].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "replacement-relay-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
      );
    });
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-replacement"),
    ).toBeNull();
    expect(readPendingClarifyForChat(chatId)).not.toBeNull();

    act(() => {
      relayRuns[0].handlers.onError({
        code: "replacement_owner_failed",
        message: "replacement owner ended",
      });
    });
    await waitFor(() => {
      expect(readPendingClarifyForChat(chatId)).toBeNull();
    });
    const replacement = readQueuedTurnsForAttempt(
      chatId,
      "attempt-replacement",
    );
    expect(replacement?.items).toEqual([
      expect.objectContaining({
        text: "Clarify fallback replacement",
        status: "queued",
      }),
    ]);
    expect(replacement.items[0].id).not.toBe("queue-replacement-old");
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-replacement")?.items,
    ).toEqual(replacement.items);
    expect(readQueuedTurnsForChat(chatId)).toHaveLength(1);
    expect(lastChatInputProps?.interjectState?.queueItems).toEqual([
      expect.objectContaining({
        id: replacement.items[0].id,
        text: "Clarify fallback replacement",
        status: "queued",
      }),
    ]);
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
  });

  test("pending Test API cancel fences a relay lease-conflict retry", async () => {
    const commandHandlers = installTestCommandBridge();
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-cancel-fence",
          text: "Never retry behind cancel",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onDone({ finished_at: Date.now() });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    const relayRuns = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      relayRuns.push({ payload, handlers });
      return {
        requestId: "request-cancel-fence",
        executionId: payload.threadId,
        attemptId: "attempt-cancel-fence",
        detach: jest.fn(),
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });
    let resolveCancellation;
    window.unchainAPI.cancelExecution = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveCancellation = resolve;
        }),
    );

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(commandHandlers.has("cancelChatRun")).toBe(true);
    });
    await waitFor(() => {
      expect(relayRuns).toHaveLength(1);
    });
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-cancel-fence")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-cancel-fence",
        status: "relayed",
      }),
    ]);

    const cancellation = commandHandlers.get("cancelChatRun")({
      id: chatId,
      attempt_id: "attempt-cancel-fence",
    });
    await waitFor(() => {
      expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
    });
    expect(readQueuedTurnsForAttempt(chatId, "attempt-cancel-fence")).toBeNull();

    act(() => {
      relayRuns[0].handlers.onError({
        code: "execution_lease_conflict",
        message: "the cancelled owner lost its lease",
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(relayRuns).toHaveLength(1);

    let cancellationResult = null;
    await act(async () => {
      resolveCancellation({ status: "cancel_requested" });
      cancellationResult = await cancellation;
    });
    expect(cancellationResult).toMatchObject({
      ok: true,
      chat_id: chatId,
      attempt_id: "attempt-cancel-fence",
      status: "cancel_requested",
    });
    expect(relayRuns).toHaveLength(1);
    expect(readQueuedTurnsForAttempt(chatId, "attempt-cancel-fence")).toBeNull();
    const cancelledRun = commandHandlers.get("getChatRun")({
      id: chatId,
      attempt_id: "attempt-cancel-fence",
    });
    expect(cancelledRun).toMatchObject({
      chat_id: chatId,
      attempt_id: "attempt-cancel-fence",
      status: "cancelled",
      message_id: expect.any(String),
    });
    expect(
      commandHandlers.get("getChatRun")({
        id: chatId,
        attempt_id: "attempt-cancel-fence",
      }).message_id,
    ).toBe(cancelledRun.message_id);
  });

  test("reattach relay survives an immediate remount without duplicate or stale outbox", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-reattach-1",
          text: "Continue after the recovered run",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (identity, handlers = {}) => {
        if (identity.attemptId === "attempt-reattach") {
          handlers.onDone({ finished_at: Date.now() });
        } else if (identity.attemptId === "attempt-queued-followup") {
          handlers.onRuntimeEvent(
            buildReattachEvent({
              chatId,
              id: "queued-followup-replayed-started",
              type: "run.started",
              seq: 1,
              payload: { status: "running" },
            }),
          );
          handlers.onDone({ finished_at: Date.now() });
          handlers.onRuntimeEvent(
            buildReattachEvent({
              chatId,
              id: "queued-followup-late-delta",
              type: "step.delta",
              seq: 2,
              payload: {
                step_id: "model:queued-followup:response",
                step_type: "model_response",
                kind: "text",
                delta: "LATE FRAME MUST BE IGNORED",
              },
            }),
          );
        }
        return {
          requestId: identity.requestId,
          executionId: chatId,
          attemptId: identity.attemptId,
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    let view = null;
    let crashedDuringStart = false;
    let outboxDuringStart = "not-checked";
    window.unchainAPI.startStreamV4 = jest.fn((payload) => ({
      get requestId() {
        if (!crashedDuringStart) {
          crashedDuringStart = true;
          outboxDuringStart = readQueuedTurnsForAttempt(
            chatId,
            "attempt-reattach",
          );
          view.unmount();
        }
        return "request-queued-followup";
      },
      executionId: payload.threadId,
      attemptId: "attempt-queued-followup",
      detach: jest.fn(),
      disconnect: jest.fn(),
      cancel: jest.fn(),
    }));

    view = renderChat();
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
      expect(crashedDuringStart).toBe(true);
    });
    expect(window.unchainAPI.startStreamV4.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        threadId: chatId,
        message: "Continue after the recovered run",
      }),
    );
    // Blocker 6: the durable queue must NOT be removed merely because
    // startStream returned a handle — only authoritative acceptance consumes
    // it. The immediate remount crashes the relay before any acceptance frame,
    // so the outbox entry survives the start and is recovered below.
    expect(outboxDuringStart).not.toBeNull();
    expect(outboxDuringStart?.items).toEqual([
      expect.objectContaining({
        id: "queue-reattach-1",
        status: "queued",
      }),
    ]);
    await waitFor(() => {
      expect(readQueuedTurnsForAttempt(chatId, "attempt-reattach")).toBeNull();
    });
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-queued-followup")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-reattach-1",
        status: "relayed",
      }),
    ]);
    await waitFor(() => {
      expect(
        [...getChatsStore().chatsById[chatId].messages]
          .reverse()
          .find((message) => message.role === "assistant")?.meta,
      ).toMatchObject({
        requestId: "request-queued-followup",
        attemptId: "attempt-queued-followup",
      });
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(window.unchainAPI.attachStreamV4).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "request-queued-followup",
          attemptId: "attempt-queued-followup",
        }),
        expect.any(Object),
      );
    });
    // No duplicate successor: the crashed relay is not re-launched on remount
    // (the followup is reattached, not restarted).
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
    // The relay crashed before acceptance, so its durable turn follows the
    // returned successor identity until replayed acceptance ACKs it.
    expect(readQueuedTurnsForAttempt(chatId, "attempt-reattach")).toBeNull();
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-queued-followup"),
    ).toBeNull();
    await waitFor(() => {
      expect(
        [...getChatsStore().chatsById[chatId].messages]
          .reverse()
          .find((message) => message.role === "assistant")?.status,
      ).toBe("done");
    });
    expect(
      [...getChatsStore().chatsById[chatId].messages]
        .reverse()
        .find((message) => message.role === "assistant")?.content,
    ).not.toContain("LATE FRAME MUST BE IGNORED");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
    expect(
      getChatsStore().chatsById[chatId].messages.filter(
        (message) =>
          message.role === "user" &&
          message.content === "Continue after the recovered run",
      ),
    ).toHaveLength(1);
  });

  test("reattach lease conflict retries the exact relayed turn without duplicating it", async () => {
    const chatId = getChatsStore().activeChatId;
    const relayText = "Retry this exact relayed turn after remount";
    seedPersistedV4Attempt({
      chatId,
      requestId: "request-relayed-reject",
      attemptId: "attempt-relayed-reject",
      assistantId: "assistant-relayed-reject",
    });
    const seededMessages = getChatsStore().chatsById[chatId].messages;
    setChatMessages(
      chatId,
      [{ ...seededMessages[0], content: relayText }, seededMessages[1]],
      { source: "test" },
    );
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-relayed-reject",
      items: [
        {
          id: "queue-relayed-reject",
          text: relayText,
          status: "relayed",
        },
      ],
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onRuntimeEvent(
          buildReattachEvent({
            chatId,
            id: "relayed-reject-session-started",
            type: "session.started",
            seq: 1,
            payload: { status: "running" },
          }),
          { streamSeq: 1 },
        );
        handlers.onError({
          code: "execution_lease_conflict",
          message: "the remounted owner was rejected before acceptance",
        });
        return {
          requestId: "request-relayed-reject",
          executionId: chatId,
          attemptId: "attempt-relayed-reject",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    const relayRuns = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      const runNumber = relayRuns.length + 1;
      relayRuns.push({ payload, handlers, runNumber });
      return {
        requestId: `request-relayed-retry-${runNumber}`,
        executionId: payload.threadId,
        attemptId: `attempt-relayed-retry-${runNumber}`,
        detach: jest.fn(),
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(relayRuns).toHaveLength(1);
    });
    expect(relayRuns[0].payload.message).toBe(relayText);
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-relayed-reject"),
    ).toBeNull();
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-relayed-retry-1")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-relayed-reject",
        status: "relayed",
      }),
    ]);
    expect(
      getChatsStore().chatsById[chatId].messages.filter(
        (message) => message.role === "user" && message.content === relayText,
      ),
    ).toHaveLength(1);

    act(() => {
      relayRuns[0].handlers.onError({
        code: "execution_lease_conflict",
        message: "the retry also lost the lease once",
      });
    });
    await waitFor(
      () => {
        expect(relayRuns).toHaveLength(2);
      },
      { timeout: 2500 },
    );
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-relayed-retry-1"),
    ).toBeNull();
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-relayed-retry-2")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-relayed-reject",
        status: "relayed",
      }),
    ]);
    expect(
      getChatsStore().chatsById[chatId].messages.filter(
        (message) => message.role === "user" && message.content === relayText,
      ),
    ).toHaveLength(1);

    act(() => {
      relayRuns[1].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "relayed-retry-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
      );
      relayRuns[1].handlers.onDone({ finished_at: Date.now() });
    });
    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-relayed-retry-2"),
      ).toBeNull();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    expect(relayRuns).toHaveLength(2);
    expect(
      getChatsStore().chatsById[chatId].messages.filter(
        (message) => message.role === "user" && message.content === relayText,
      ),
    ).toHaveLength(1);
  });

  test("reattach keeps a relayed turn fail-closed on an unknown transport error", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({
      chatId,
      requestId: "request-relayed-unknown",
      attemptId: "attempt-relayed-unknown",
      assistantId: "assistant-relayed-unknown",
    });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-relayed-unknown",
      items: [
        {
          id: "queue-relayed-unknown",
          text: "Do not guess whether this was accepted",
          status: "relayed",
        },
      ],
    });
    window.unchainAPI.startStreamV4 = jest.fn();
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onError({
          code: "stream_bridge_failed",
          message: "the transport failed without acceptance evidence",
        });
        return {
          requestId: "request-relayed-unknown",
          executionId: chatId,
          attemptId: "attempt-relayed-unknown",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(
        getChatsStore().chatsById[chatId].messages.find(
          (message) => message.id === "assistant-relayed-unknown",
        )?.status,
      ).toBe("error");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-relayed-unknown")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-relayed-unknown",
        status: "relayed",
      }),
    ]);
    expect(lastChatInputProps?.interjectState?.queueItems).toEqual([]);
  });

  test("remount rebuilds the acceptance watchdog for a silent relayed attempt", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({
      chatId,
      requestId: "request-remount-silent-relay",
      attemptId: "attempt-remount-silent-relay",
      assistantId: "assistant-remount-silent-relay",
    });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-remount-silent-relay",
      items: [
        {
          id: "queue-remount-silent-relay",
          text: "Keep this exact relayed turn across remount",
          status: "relayed",
        },
      ],
    });
    window.unchainAPI.startStreamV4 = jest.fn();
    const attachCalls = [];
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (identity, handlers = {}) => {
        const callNumber = attachCalls.length + 1;
        attachCalls.push({ identity, handlers, callNumber });
        handlers.onRuntimeEvent(
          buildReattachEvent({
            chatId,
            id: `remount-session-only-${callNumber}`,
            type: "session.started",
            seq: callNumber,
            payload: { status: "running" },
          }),
          { streamSeq: callNumber },
        );
        return {
          requestId: identity.requestId,
          executionId: identity.executionId,
          attemptId: identity.attemptId,
          terminal: false,
          active: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(attachCalls).toHaveLength(1);
    });
    expect(
      readQueuedTurnsForAttempt(
        chatId,
        "attempt-remount-silent-relay",
      )?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-remount-silent-relay",
        status: "relayed",
      }),
    ]);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    expect(attachCalls).toHaveLength(2);
    expect(attachCalls[1].identity).toMatchObject({
      requestId: "request-remount-silent-relay",
      executionId: chatId,
      attemptId: "attempt-remount-silent-relay",
      afterSeq: 1,
    });
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
    expect(
      readQueuedTurnsForAttempt(
        chatId,
        "attempt-remount-silent-relay",
      )?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-remount-silent-relay",
        status: "relayed",
      }),
    ]);

    act(() => {
      attachCalls[1].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "remount-token-acceptance",
          type: "step.delta",
          seq: 3,
          payload: {
            step_id: "model:remount:response",
            step_type: "model_response",
            kind: "text",
            delta: "accepted",
          },
        }),
        { streamSeq: 3 },
      );
      attachCalls[1].handlers.onDone({ finished_at: Date.now() });
    });
    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(
          chatId,
          "attempt-remount-silent-relay",
        ),
      ).toBeNull();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    expect(attachCalls).toHaveLength(2);
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("remount safely retries a cancelled relayed attempt from its never-registered tombstone", async () => {
    const chatId = getChatsStore().activeChatId;
    const relayText = "Recover this exact pre-register relay after remount";
    seedPersistedV4Attempt({
      chatId,
      requestId: "request-remount-cancelled-relay",
      attemptId: "attempt-remount-cancelled-relay",
      assistantId: "assistant-remount-cancelled-relay",
    });
    const seededMessages = getChatsStore().chatsById[chatId].messages;
    setChatMessages(
      chatId,
      [{ ...seededMessages[0], content: relayText }, seededMessages[1]],
      { source: "test" },
    );
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-remount-cancelled-relay",
      items: [
        {
          id: "queue-remount-cancelled-relay",
          text: relayText,
          status: "relayed",
        },
      ],
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (identity, handlers = {}) => {
        handlers.onError({
          code: "cancelled",
          message: "the pre-register cancellation tombstone was replayed",
        });
        return {
          requestId: identity.requestId,
          executionId: identity.executionId,
          attemptId: identity.attemptId,
          terminal: true,
          active: false,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    window.unchainAPI.cancelExecution = jest.fn(async () => ({
      status: "ok",
      disposition: "unchanged",
      state: "cancelled",
      execution: { registered_at_ms: null },
    }));
    const relayRuns = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      relayRuns.push({ payload, handlers });
      return {
        requestId: "request-remount-cancelled-retry",
        executionId: payload.threadId,
        attemptId: "attempt-remount-cancelled-retry",
        detach: jest.fn(),
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(relayRuns).toHaveLength(1);
    });

    expect(window.unchainAPI.cancelExecution).toHaveBeenCalledTimes(1);
    expect(
      readQueuedTurnsForAttempt(
        chatId,
        "attempt-remount-cancelled-relay",
      ),
    ).toBeNull();
    expect(
      readQueuedTurnsForAttempt(
        chatId,
        "attempt-remount-cancelled-retry",
      )?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-remount-cancelled-relay",
        status: "relayed",
      }),
    ]);
    expect(
      getChatsStore().chatsById[chatId].messages.filter(
        (message) => message.role === "user" && message.content === relayText,
      ),
    ).toHaveLength(1);

    act(() => {
      relayRuns[0].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "remount-cancelled-retry-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
        { streamSeq: 1 },
      );
      relayRuns[0].handlers.onDone({ finished_at: Date.now() });
    });
    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(
          chatId,
          "attempt-remount-cancelled-retry",
        ),
      ).toBeNull();
    });
    expect(relayRuns).toHaveLength(1);
  });

  test("reattach done ACKs relayed items and sends only the queued remainder", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({
      chatId,
      requestId: "request-relayed-remainder",
      attemptId: "attempt-relayed-remainder",
      assistantId: "assistant-relayed-remainder",
    });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-relayed-remainder",
      items: [
        {
          id: "queue-already-relayed",
          text: "continue the original run",
          status: "relayed",
        },
        {
          id: "queue-reattach-remainder",
          text: "Send only this queued remainder",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onDone({ finished_at: Date.now() });
        return {
          requestId: "request-relayed-remainder",
          executionId: chatId,
          attemptId: "attempt-relayed-remainder",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    const relayRuns = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      relayRuns.push({ payload, handlers });
      return {
        requestId: "request-reattach-remainder",
        executionId: payload.threadId,
        attemptId: "attempt-reattach-remainder",
        detach: jest.fn(),
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });

    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(relayRuns).toHaveLength(1);
    });
    expect(relayRuns[0].payload.message).toBe("Send only this queued remainder");
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-relayed-remainder"),
    ).toBeNull();
    expect(
      readQueuedTurnsForAttempt(chatId, "attempt-reattach-remainder")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "queue-reattach-remainder",
        status: "relayed",
      }),
    ]);
    expect(
      window.unchainAPI.startStreamV4.mock.calls
        .map(([payload]) => payload.message)
        .filter((message) => message === "continue the original run"),
    ).toHaveLength(0);
  });

  test("preserves an exact queued attempt when reattach ends in error", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-error-1",
          text: "Keep this for recovery",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.startStreamV4 = jest.fn();
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onError({ code: "reattach_failed", message: "offline" });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );

    const failedView = renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(getChatsStore().chatsById[chatId].messages[1].status).toBe(
        "error",
      );
    });
    expect(readQueuedTurnsForAttempt(chatId, "attempt-reattach")?.items).toEqual([
      {
        id: "queue-error-1",
        text: "Keep this for recovery",
        status: "queued",
      },
    ]);
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();

    failedView.unmount();
    const startedRuns = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      const runNumber = startedRuns.length + 1;
      const run = { payload, handlers, runNumber };
      startedRuns.push(run);
      return {
        requestId: `request-recovery-${runNumber}`,
        executionId: payload.threadId,
        attemptId: `attempt-recovery-${runNumber}`,
        detach: jest.fn(),
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });
    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(lastChatInputProps?.interjectState?.queueItems).toEqual([
        expect.objectContaining({
          id: "queue-error-1",
          status: "queued",
        }),
      ]);
    });
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "A successful recovery turn" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(startedRuns).toHaveLength(1);
    });
    act(() => {
      startedRuns[0].handlers.onDone({ finished_at: Date.now() });
    });
    await waitFor(() => {
      expect(startedRuns).toHaveLength(2);
    });
    expect(startedRuns[1].payload).toEqual(
      expect.objectContaining({
        threadId: chatId,
        message: "Keep this for recovery",
      }),
    );
    expect(
      window.unchainAPI.startStreamV4.mock.calls
        .map(([payload]) => payload.message)
        .filter((message) => message === "Keep this for recovery"),
    ).toHaveLength(1);
  });

  test("Stop clears the durable queue for the exact attached attempt", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-stop-1",
          text: "Do not relay after Stop",
          status: "queued",
        },
      ],
    });
    writePendingFyi({
      chatId,
      attemptId: "attempt-reattach",
      messageId: "fyi-stop-1",
      text: "Do not recover after Stop",
      requestedChannel: "fyi",
      threadId: chatId,
    });
    window.unchainAPI.startStreamV4 = jest.fn();
    window.unchainAPI.attachStreamV4 = jest.fn(async () => ({
      requestId: "request-reattach",
      executionId: chatId,
      attemptId: "attempt-reattach",
      terminal: false,
      detach: jest.fn(),
      disconnect: jest.fn(),
      cancel: jest.fn(),
    }));

    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
      expect(lastChatInputProps?.interjectState?.queueItems).toHaveLength(1);
    });
    fireEvent.click(screen.getByTestId("stop-button"));

    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-reattach"),
      ).toBeNull();
      expect(
        readPendingFyisForAttempt(chatId, "attempt-reattach"),
      ).toEqual([]);
    });
  });

  test("binds a pre-identity queue to the returned attempt before immediate remount", async () => {
    const seeded = getChatsStore();
    setChatModel(seeded.activeChatId, { id: "openai:gpt-5" }, { source: "test" });
    openCharacterChat(
      { character: { id: "nico", name: "Nico" } },
      { source: "test" },
    );
    const characterChatId = getChatsStore().activeChatId;
    let resolveCharacterPreflight;
    window.unchainAPI.buildCharacterAgentConfig.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCharacterPreflight = resolve;
        }),
    );
    const detach = jest.fn();
    const startStreamV4 = jest.fn((payload) => ({
      requestId: "request-preidentity",
      executionId: payload.threadId,
      attemptId: "attempt-preidentity",
      detach,
      disconnect: jest.fn(),
      cancel: jest.fn(),
    }));
    const attachStreamV4 = jest.fn(async (identity) => ({
      requestId: identity.requestId,
      executionId: identity.executionId,
      attemptId: identity.attemptId,
      terminal: false,
      detach: jest.fn(),
      disconnect: jest.fn(),
      cancel: jest.fn(),
    }));

    const view = renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Start after delayed preflight" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.buildCharacterAgentConfig).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue Persist before identity" },
    });
    act(() => {
      lastChatInputProps.onSend({
        text: "/queue Persist before identity",
        chatId: characterChatId,
      });
    });
    expect(window.unchainAPI.buildCharacterAgentConfig).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(lastChatInputProps?.interjectState?.queueItems).toEqual([
        expect.objectContaining({
          text: "Persist before identity",
          status: "queued",
        }),
      ]);
    });
    expect(startStreamV4).not.toHaveBeenCalled();

    window.unchainAPI.startStreamV4 = startStreamV4;
    window.unchainAPI.attachStreamV4 = attachStreamV4;

    await act(async () => {
      resolveCharacterPreflight({
        session_id: "character_nico__dm__main",
        run_memory_namespace: "character_nico__rel__local_user",
        default_model: "openai:gpt-4.1",
        instructions: "You are Nico.",
        decision: { action: "reply", courtesy_message: null },
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startStreamV4).toHaveBeenCalledTimes(1);
      expect(
        readQueuedTurnsForAttempt(characterChatId, "attempt-preidentity")
          ?.items,
      ).toEqual([
        expect.objectContaining({
          text: "Persist before identity",
          status: "queued",
        }),
      ]);
    });

    view.unmount();
    expect(detach).toHaveBeenCalledTimes(1);
    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(attachStreamV4).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "request-preidentity",
          attemptId: "attempt-preidentity",
        }),
        expect.any(Object),
      );
      expect(lastChatInputProps?.interjectState?.queueItems).toEqual([
        expect.objectContaining({
          text: "Persist before identity",
          status: "queued",
        }),
      ]);
    });
    expect(startStreamV4).toHaveBeenCalledTimes(1);
  });

  test("persists a pre-identity queue before a pending character preflight unmounts", async () => {
    const seeded = getChatsStore();
    setChatModel(seeded.activeChatId, { id: "openai:gpt-5" }, { source: "test" });
    openCharacterChat(
      { character: { id: "nico", name: "Nico" } },
      { source: "test" },
    );
    const characterChatId = getChatsStore().activeChatId;
    let resolveCharacterPreflight;
    window.unchainAPI.buildCharacterAgentConfig.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCharacterPreflight = resolve;
        }),
    );
    const startStreamV4 = jest.fn((payload) => ({
      requestId: "request-after-preidentity-reload",
      executionId: payload.threadId,
      attemptId: "attempt-after-preidentity-reload",
      detach: jest.fn(),
      disconnect: jest.fn(),
      cancel: jest.fn(),
    }));

    const view = renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Original pending character turn" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() =>
      expect(window.unchainAPI.buildCharacterAgentConfig).toHaveBeenCalledTimes(
        1,
      ),
    );
    expect(screen.getByTestId("stop-button")).toBeInTheDocument();

    act(() => {
      lastChatInputProps.onSend({
        text: "/queue Survive before any attempt exists",
        chatId: characterChatId,
      });
    });
    await waitFor(() =>
      expect(lastChatInputProps?.interjectState?.queueItems).toEqual([
        expect.objectContaining({
          text: "Survive before any attempt exists",
          status: "queued",
        }),
      ]),
    );
    expect(screen.getByTestId("chat-input")).toHaveValue("");
    const pendingClientEntry = readQueuedTurnsForChat(characterChatId).find(
      (entry) => entry.clientOperationId,
    );
    expect(pendingClientEntry).toEqual(
      expect.objectContaining({
        chatId: characterChatId,
        clientOperationId: expect.stringMatching(/^queue-op-/),
      }),
    );
    expect(startStreamV4).not.toHaveBeenCalled();

    view.unmount();
    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(lastChatInputProps?.interjectState?.queueItems).toEqual([
        expect.objectContaining({
          text: "Survive before any attempt exists",
          status: "queued",
        }),
      ]);
    });
    window.unchainAPI.startStreamV4 = startStreamV4;

    await act(async () => {
      resolveCharacterPreflight({
        session_id: "character_nico__dm__main",
        run_memory_namespace: "character_nico__rel__local_user",
        default_model: "openai:gpt-4.1",
        instructions: "You are Nico.",
        decision: { action: "reply", courtesy_message: null },
      });
      await Promise.resolve();
    });
    expect(startStreamV4).not.toHaveBeenCalled();

    act(() => {
      lastChatInputProps.onSend({
        text: "Recovery owner turn",
        chatId: characterChatId,
      });
    });
    await waitFor(() => expect(startStreamV4).toHaveBeenCalledTimes(1));
    expect(
      readQueuedTurnsForAttempt(
        characterChatId,
        "attempt-after-preidentity-reload",
      )?.items,
    ).toEqual([
      expect.objectContaining({ text: "Survive before any attempt exists" }),
    ]);
    expect(
      readQueuedTurnsForChat(characterChatId).some(
        (entry) => entry.clientOperationId,
      ),
    ).toBe(false);
  });

  test("keeps the composer and hides fake queue state when the outbox is full", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Keep this attempt open" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));

    for (let index = 0; index < 64; index += 1) {
      expect(
        writeQueuedTurnsForAttempt({
          chatId: `capacity-chat-${index}`,
          attemptId: "capacity-attempt",
          items: [
            {
              id: `capacity-item-${index}`,
              text: `capacity ${index}`,
              status: "queued",
            },
          ],
        }),
      ).not.toBeNull();
    }

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue Keep this visible" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() =>
      expect(lastChatInputProps?.interjectState?.queueItems).toEqual([]),
    );
    expect(screen.getByTestId("chat-input")).toHaveValue(
        "/queue Keep this visible",
      );
    expect(readQueuedTurnsForChat(chatId)).toEqual([]);
    expect(window.localStorage.getItem(QUEUED_TURN_OUTBOX_STORAGE_KEY)).not.toBe(
      null,
    );
  });

  test("keeps the composer and hides fake queue state when the outbox write fails", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Keep this attempt open" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));

    const storagePrototype = Object.getPrototypeOf(window.localStorage);
    const originalSetItem = storagePrototype.setItem;
    jest
      .spyOn(storagePrototype, "setItem")
      .mockImplementation(function failQueuedTurnWrite(key, value) {
        if (key === QUEUED_TURN_OUTBOX_STORAGE_KEY) {
          throw new DOMException("quota", "QuotaExceededError");
        }
        return originalSetItem.call(this, key, value);
      });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue Keep this after write failure" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() =>
      expect(lastChatInputProps?.interjectState?.queueItems).toEqual([]),
    );
    expect(screen.getByTestId("chat-input")).toHaveValue(
      "/queue Keep this after write failure",
    );
    expect(readQueuedTurnsForChat(chatId)).toEqual([]);
  });

  test("moves a relayed parent queue remainder to the successor attempt", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "queue-parent-relay",
          text: "Start the successor",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onDone({ finished_at: Date.now() });
        return {
          requestId: "request-reattach",
          executionId: chatId,
          attemptId: "attempt-reattach",
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );
    const successorRuns = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      successorRuns.push({ payload, handlers });
      return {
        requestId: "request-successor",
        executionId: payload.threadId,
        attemptId: "attempt-successor",
        detach: jest.fn(),
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });

    const view = renderChat();
    await waitForBoot();
    await waitFor(() => expect(successorRuns).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue This belongs only to the successor" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-successor")?.items,
      ).toEqual([
        expect.objectContaining({
          id: "queue-parent-relay",
          text: "Start the successor",
          status: "relayed",
        }),
        expect.objectContaining({
          text: "This belongs only to the successor",
          status: "queued",
        }),
      ]);
    });
    expect(readQueuedTurnsForAttempt(chatId, "attempt-reattach")).toBeNull();

    act(() => {
      successorRuns[0].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "successor-parent-relay-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
      );
    });
    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-successor")?.items,
      ).toEqual([
        expect.objectContaining({
          text: "This belongs only to the successor",
          status: "queued",
        }),
      ]);
    });

    act(() => {
      successorRuns[0].handlers.onError({
        code: "successor_failed",
        message: "successor stopped",
      });
    });
    await waitFor(() =>
      expect(
        [...getChatsStore().chatsById[chatId].messages]
          .reverse()
          .find((message) => message.role === "assistant")?.status,
      ).toBe("error"),
    );
    expect(
        readQueuedTurnsForAttempt(chatId, "attempt-successor")?.items,
      ).toEqual([
        expect.objectContaining({
          text: "This belongs only to the successor",
          status: "queued",
        }),
      ]);
    view.unmount();
    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(lastChatInputProps?.interjectState?.queueItems).toEqual([
        expect.objectContaining({
          text: "This belongs only to the successor",
          status: "queued",
        }),
      ]);
    });
    expect(successorRuns).toHaveLength(1);
  });

  test("durably falls a pending clarify back to its exact queue on terminal", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    window.unchainAPI.interject = jest.fn(async () => ({
      resolved_channel: "clarify",
    }));
    const view = renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run awaiting clarification" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Question that must survive" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(readPendingClarifyForChat(chatId)).toEqual(
        expect.objectContaining({
          sourceAttemptId: `attempt-${chatId}`,
          text: "Question that must survive",
        }),
      );
    });

    act(() => {
      runs[0].handlers.onError({
        code: "clarify_owner_failed",
        message: "owner ended",
      });
    });
    await waitFor(() =>
      expect(readPendingClarifyForChat(chatId)).toBeNull(),
    );
    expect(
        readQueuedTurnsForAttempt(chatId, `attempt-${chatId}`)?.items,
      ).toEqual([
        expect.objectContaining({
          text: "Question that must survive",
          status: "queued",
        }),
      ]);

    view.unmount();
    renderChat();
    await waitForBoot();
    await waitFor(() => {
      expect(lastChatInputProps?.interjectState?.queueItems).toEqual([
        expect.objectContaining({
          text: "Question that must survive",
          status: "queued",
        }),
      ]);
    });
    expect(runs).toHaveLength(1);
  });

  test("persists an addressed FYI before dispatch and clears only its exact acknowledgement", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    window.unchainAPI.interject = jest.fn(async (payload) => ({
      resolved_channel: "fyi",
      message_id: payload.message_id,
    }));
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Keep the owner run open" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/fyi Check the exact checkpoint" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.interject).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("chat-input")).toHaveValue("");
    });
    const request = window.unchainAPI.interject.mock.calls[0][0];
    expect(request).toMatchObject({
      thread_id: chatId,
      text: "Check the exact checkpoint",
      channel: "fyi",
      message_id: expect.stringMatching(/^fyi-client-/),
    });
    expect(
      readPendingFyisForAttempt(chatId, runs[0].attemptId),
    ).toEqual([
      expect.objectContaining({
        messageId: request.message_id,
        text: "Check the exact checkpoint",
      }),
    ]);
    expect(lastChatInputProps?.interjectState?.pendingFyiCount).toBe(1);

    act(() => {
      runs[0].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "fyi-exact-ack",
          type: "interaction.fyi_injected",
          seq: 1,
          payload: {
            messages: [
              {
                message_id: request.message_id,
                origin: "user",
                text: "Check the exact checkpoint",
              },
            ],
          },
        }),
      );
    });
    await waitFor(() => {
      expect(
        readPendingFyisForAttempt(chatId, runs[0].attemptId),
      ).toEqual([]);
      expect(lastChatInputProps?.interjectState?.pendingFyiCount).toBe(0);
    });
  });

  test("durably ACKs a duplicate child FYI and keeps one stable replay after immediate remount", async () => {
    const chatId = getChatsStore().activeChatId;
    const messageId = "fyi-child-durable";
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    const rootStarted = buildReattachEvent({
      chatId,
      id: "child-fyi-root-started",
      type: "run.started",
      seq: 1,
      payload: { status: "running" },
    });
    const childFyi = {
      ...buildReattachEvent({
        chatId,
        id: "child-fyi-injected",
        type: "interaction.fyi_injected",
        seq: 2,
        links: { parent_run_id: "run-reattach" },
        payload: {
          messages: [
            {
              message_id: messageId,
              origin: "user",
              text: "Keep one durable child FYI",
            },
          ],
        },
      }),
      run_id: "run-child-fyi",
      agent_id: "developer.child-fyi",
    };
    const rootCompleted = buildReattachEvent({
      chatId,
      id: "child-fyi-root-completed",
      type: "run.completed",
      seq: 3,
      payload: { status: "completed" },
    });

    const view = renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run a child that receives FYI" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));

    writePendingFyi({
      chatId,
      attemptId: runs[0].attemptId,
      messageId,
      text: "Keep one durable child FYI",
      requestedChannel: "fyi",
      threadId: chatId,
    });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: runs[0].attemptId,
      items: [
        {
          id: messageId,
          text: "Keep one durable child FYI",
          status: "queued",
        },
      ],
    });
    const persistenceOrder = [];
    const nativeSetItem = window.localStorage.setItem.bind(
      window.localStorage,
    );
    const storageSpy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function setItem(key, value) {
        if (key === "chats") persistenceOrder.push("chat");
        if (key === QUEUED_TURN_OUTBOX_STORAGE_KEY) {
          persistenceOrder.push("outbox");
        }
        return nativeSetItem(key, value);
      });

    act(() => {
      runs[0].handlers.onRuntimeEvent(rootStarted);
      runs[0].handlers.onRuntimeEvent(childFyi);
      runs[0].handlers.onRuntimeEvent(childFyi);
    });

    await waitFor(() => {
      const messages = getChatsStore().chatsById[chatId].messages;
      const assistant = messages.find(
        (message) => message.role === "assistant",
      );
      expect(
        assistant?.subagentFrames?.["run-child-fyi"]?.filter(
          (frame) => frame.type === "fyi_injected",
        ),
      ).toHaveLength(1);
      expect(
        assistant?.interjections?.filter(
          (record) => record.id === `fyi-${messageId}`,
        ),
      ).toHaveLength(1);
      expect(
        readPendingFyisForAttempt(chatId, runs[0].attemptId),
      ).toEqual([]);
      expect(
        readQueuedTurnsForAttempt(chatId, runs[0].attemptId),
      ).toBeNull();
    });
    expect(persistenceOrder.indexOf("chat")).toBeGreaterThanOrEqual(0);
    expect(persistenceOrder.indexOf("outbox")).toBeGreaterThan(
      persistenceOrder.indexOf("chat"),
    );
    storageSpy.mockRestore();
    view.unmount();

    const persistedBeforeRemount = getChatsStore().chatsById[chatId].messages;
    const assistantBeforeRemount = persistedBeforeRemount.find(
      (message) => message.role === "assistant",
    );
    expect(
      assistantBeforeRemount?.subagentFrames?.["run-child-fyi"]?.filter(
        (frame) => frame.type === "fyi_injected",
      ),
    ).toHaveLength(1);
    expect(
      assistantBeforeRemount?.interjections?.filter(
        (record) => record.id === `fyi-${messageId}`,
      ),
    ).toHaveLength(1);
    expect(
      readPendingFyisForAttempt(chatId, runs[0].attemptId),
    ).toEqual([]);
    expect(
      readQueuedTurnsForAttempt(chatId, runs[0].attemptId),
    ).toBeNull();

    window.unchainAPI.attachStreamV4 = jest.fn(
      async (_identity, handlers = {}) => {
        handlers.onRuntimeEvent(rootStarted, { streamSeq: 1 });
        handlers.onRuntimeEvent(childFyi, { streamSeq: 2 });
        handlers.onRuntimeEvent(childFyi, { streamSeq: 2 });
        handlers.onRuntimeEvent(rootCompleted, { streamSeq: 3 });
        handlers.onDone({ finished_at: Date.now() });
        return {
          requestId: runs[0].attemptId,
          executionId: chatId,
          attemptId: runs[0].attemptId,
          terminal: true,
          detach: jest.fn(),
          disconnect: jest.fn(),
          cancel: jest.fn(),
        };
      },
    );

    renderChat();
    await waitForReady();
    await waitFor(() => {
      const messages = getChatsStore().chatsById[chatId].messages;
      const assistant = messages.find(
        (message) => message.role === "assistant",
      );
      expect(assistant?.status).toBe("done");
      expect(
        assistant?.subagentFrames?.["run-child-fyi"]?.filter(
          (frame) => frame.type === "fyi_injected",
        ),
      ).toHaveLength(1);
      expect(
        assistant?.interjections?.filter(
          (record) => record.id === `fyi-${messageId}`,
        ),
      ).toHaveLength(1);
    });
    expect(window.unchainAPI.attachStreamV4).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
    expect(runs).toHaveLength(1);
    expect(
      readPendingFyisForAttempt(chatId, runs[0].attemptId),
    ).toEqual([]);
    expect(
      readQueuedTurnsForAttempt(chatId, runs[0].attemptId),
    ).toBeNull();
  });

  test("keeps a failed child FYI persistence in its durable queue fallback without ACK", async () => {
    const chatId = getChatsStore().activeChatId;
    const messageId = "fyi-child-persist-failure";
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    const view = renderChat();
    await waitForReady();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Run a child before storage fails" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));

    writePendingFyi({
      chatId,
      attemptId: runs[0].attemptId,
      messageId,
      text: "Recover this child FYI",
      requestedChannel: "fyi",
      threadId: chatId,
    });
    const nativeSetItem = window.localStorage.setItem.bind(
      window.localStorage,
    );
    const storageSpy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function setItem(key, value) {
        if (key === "chats") {
          throw new DOMException("quota", "QuotaExceededError");
        }
        return nativeSetItem(key, value);
      });

    const childFyi = {
      ...buildReattachEvent({
        chatId,
        id: "child-fyi-persist-failed",
        type: "interaction.fyi_injected",
        seq: 2,
        links: { parent_run_id: "run-reattach" },
        payload: {
          messages: [
            {
              message_id: messageId,
              origin: "user",
              text: "Recover this child FYI",
            },
          ],
        },
      }),
      run_id: "run-child-persist-failure",
      agent_id: "developer.child-persist-failure",
    };
    act(() => {
      runs[0].handlers.onRuntimeEvent(
        buildReattachEvent({
          chatId,
          id: "child-fyi-persist-root-started",
          type: "run.started",
          seq: 1,
          payload: { status: "running" },
        }),
      );
      runs[0].handlers.onRuntimeEvent(childFyi);
    });

    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(chatId, runs[0].attemptId)?.items,
      ).toEqual([
        expect.objectContaining({
          id: messageId,
          text: "Recover this child FYI",
          status: "queued",
        }),
      ]);
    });
    expect(
      getChatsStore().chatsById[chatId].messages.some((message) =>
        message?.interjections?.some(
          (record) => record.id === `fyi-${messageId}`,
        ),
      ),
    ).toBe(false);
    view.unmount();
    storageSpy.mockRestore();
  });

  test("keeps the FYI composer intact when its durable prewrite fails", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    window.unchainAPI.interject = jest.fn(async () => ({
      resolved_channel: "fyi",
      message_id: "must-not-be-called",
    }));
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Keep the owner run open" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));

    const nativeSetItem = window.localStorage.setItem.bind(
      window.localStorage,
    );
    jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function setItem(key, value) {
        if (key === QUEUED_TURN_OUTBOX_STORAGE_KEY) {
          throw new DOMException("quota", "QuotaExceededError");
        }
        return nativeSetItem(key, value);
      });
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/fyi Preserve this draft" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(screen.getByTestId("chat-input")).toHaveValue(
        "/fyi Preserve this draft",
      );
    });
    expect(window.unchainAPI.interject).not.toHaveBeenCalled();
  });

  test("falls an unacknowledged FYI into its source queue before terminal relay", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    window.unchainAPI.interject = jest.fn(() => new Promise(() => {}));
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Keep the owner run open" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/fyi Relay me after the owner" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() =>
      expect(
        readPendingFyisForAttempt(chatId, runs[0].attemptId),
      ).toHaveLength(1),
    );

    act(() => {
      runs[0].handlers.onDone({ finished_at: Date.now() });
    });
    await waitFor(() => expect(runs).toHaveLength(2));
    expect(runs[1].payload).toEqual(
      expect.objectContaining({
        threadId: chatId,
        message: "Relay me after the owner",
      }),
    );
    expect(
      readPendingFyisForAttempt(chatId, runs[0].attemptId),
    ).toEqual([]);
  });

  test("keeps a late new-run interject result bound to its source chat", async () => {
    const chatAId = getChatsStore().activeChatId;
    const chatANodeId = getChatsStore().tree.selectedNodeId;
    setChatModel(chatAId, { id: "openai:gpt-5" }, { source: "test" });
    const createdB = createChatInSelectedContext(
      { title: "FYI isolation B" },
      { source: "test" },
    );
    setChatModel(createdB.chatId, { id: "openai:gpt-5" }, { source: "test" });
    setChatMessages(
      createdB.chatId,
      [
        {
          id: "chat-b-stable-user",
          role: "user",
          content: "Stable chat B",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      { source: "test" },
    );
    selectTreeNode({ nodeId: chatANodeId }, { source: "test" });
    const runs = installAddressedV4Runs();
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
      target: { value: "Run chat A" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "A-only follow-up" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(resolveInterject).toEqual(expect.any(Function)));

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
    });
    await waitFor(() => expect(lastChatMessagesProps?.chatId).toBe(createdB.chatId));
    await act(async () => {
      resolveInterject({ resolved_channel: "new_run" });
      await Promise.resolve();
    });

    expect(
      readQueuedTurnsForAttempt(chatAId, runs[0].attemptId)?.items,
    ).toEqual([
      expect.objectContaining({ text: "A-only follow-up", status: "queued" }),
    ]);
    expect(readQueuedTurnsForChat(createdB.chatId)).toEqual([]);
    expect(window.unchainAPI.startStreamV4).toHaveBeenCalledTimes(1);
  });

  test("persists a late BTW result on its terminal owner before removing fallback", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
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
      target: { value: "Terminal BTW owner" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Question racing terminal" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(resolveInterject).toEqual(expect.any(Function)));

    await act(async () => {
      runs[0].handlers.onDone({ finished_at: Date.now() });
      resolveInterject({ resolved_channel: "btw", answer: "Terminal answer" });
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      const assistant = [...getChatsStore().chatsById[chatId].messages]
        .reverse()
        .find((message) => message.role === "assistant");
      expect(assistant?.traceFrames).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "side_answer",
            payload: expect.objectContaining({
              message_id: expect.stringMatching(/^fyi-client-/),
              question: "Question racing terminal",
              answer: "Terminal answer",
            }),
          }),
        ]),
      );
      expect(assistant?.interjections).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "btw",
            text: "Question racing terminal",
            answer: "Terminal answer",
          }),
        ]),
      );
    });
    expect(readQueuedTurnsForAttempt(chatId, runs[0].attemptId)).toBeNull();
    expect(runs).toHaveLength(1);
  });

  test("holds terminal relay for a delayed clarify-owned BTW and records it once", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    let resolveBtw;
    let durableStateAtHttp = null;
    window.unchainAPI.interject = jest.fn((payload) => {
      if (payload.channel === "auto") {
        return Promise.resolve({ resolved_channel: "clarify" });
      }
      durableStateAtHttp = {
        clarify: readPendingClarifyForChat(chatId),
        fyis: readPendingFyisForAttempt(chatId, runs[0].attemptId),
      };
      return new Promise((resolve) => {
        resolveBtw = resolve;
      });
    });
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Clarify-owned BTW terminal race" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Answer this without changing the task" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() =>
      expect(readPendingClarifyForChat(chatId)).toEqual(
        expect.objectContaining({ text: "Answer this without changing the task" }),
      ),
    );

    jest.useFakeTimers();
    try {
      let settlementPromise;
      await act(async () => {
        settlementPromise = lastChatMessagesProps.onClarifyResolve(chatId, "btw");
        await Promise.resolve();
      });
      expect(resolveBtw).toEqual(expect.any(Function));
      expect(durableStateAtHttp?.clarify).toBeNull();
      expect(durableStateAtHttp?.fyis).toEqual([
        expect.objectContaining({
          requestedChannel: "btw",
          text: "Answer this without changing the task",
        }),
      ]);
      const messageId = durableStateAtHttp.fyis[0].messageId;

      act(() => {
        runs[0].handlers.onDone({ finished_at: Date.now() });
        jest.advanceTimersByTime(0);
      });
      expect(runs).toHaveLength(1);

      await act(async () => {
        resolveBtw({ resolved_channel: "btw", answer: "Stable side answer" });
        await expect(settlementPromise).resolves.toBe(true);
      });
      await act(async () => {
        jest.advanceTimersByTime(2_000);
        for (let index = 0; index < 10; index += 1) {
          await Promise.resolve();
        }
      });

      const ownerAssistant = getChatsStore().chatsById[chatId].messages.find(
        (message) =>
          message.role === "assistant" &&
          message.meta?.attemptId === runs[0].attemptId,
      );
      expect(
        ownerAssistant?.traceFrames?.filter(
          (frame) =>
            frame.type === "side_answer" &&
            frame.payload?.message_id === messageId,
        ),
      ).toHaveLength(1);
      expect(
        ownerAssistant?.interjections?.filter(
          (record) => record.id === `btw-${messageId}`,
        ),
      ).toHaveLength(1);
      expect(readPendingClarifyForChat(chatId)).toBeNull();
      expect(readPendingFyisForAttempt(chatId, runs[0].attemptId)).toEqual([]);
      expect(readQueuedTurnsForAttempt(chatId, runs[0].attemptId)).toBeNull();
      expect(runs).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("relays one queued successor when a clarify-owned BTW rejects after done", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    let rejectBtw;
    window.unchainAPI.interject = jest.fn((payload) => {
      if (payload.channel === "auto") {
        return Promise.resolve({ resolved_channel: "clarify" });
      }
      return new Promise((_, reject) => {
        rejectBtw = reject;
      });
    });
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "BTW reject owner" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Queue this rejected side question" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(readPendingClarifyForChat(chatId)).not.toBeNull());

    jest.useFakeTimers();
    try {
      let settlementPromise;
      act(() => {
        settlementPromise = lastChatMessagesProps.onClarifyResolve(chatId, "btw");
      });
      expect(rejectBtw).toEqual(expect.any(Function));
      act(() => {
        runs[0].handlers.onDone({ finished_at: Date.now() });
        jest.advanceTimersByTime(0);
      });
      expect(runs).toHaveLength(1);

      await act(async () => {
        rejectBtw(new Error("BTW unavailable"));
        await expect(settlementPromise).resolves.toBe(false);
      });
      await act(async () => {
        jest.advanceTimersByTime(2_000);
        for (let index = 0; index < 10; index += 1) {
          await Promise.resolve();
        }
      });
      expect(runs).toHaveLength(2);
      expect(runs[1].payload.message).toBe("Queue this rejected side question");
      expect(readPendingFyisForAttempt(chatId, runs[0].attemptId)).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  test("times out a hung clarify-owned BTW and releases one queued successor", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    window.unchainAPI.interject = jest.fn((payload) =>
      payload.channel === "auto"
        ? Promise.resolve({ resolved_channel: "clarify" })
        : new Promise(() => {}),
    );
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "BTW timeout owner" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Recover the hung side question" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(readPendingClarifyForChat(chatId)).not.toBeNull());

    jest.useFakeTimers();
    try {
      let settlementPromise;
      act(() => {
        settlementPromise = lastChatMessagesProps.onClarifyResolve(chatId, "btw");
        runs[0].handlers.onDone({ finished_at: Date.now() });
        jest.advanceTimersByTime(0);
      });
      expect(runs).toHaveLength(1);
      await act(async () => {
        jest.advanceTimersByTime(40_000);
        await expect(settlementPromise).resolves.toBe(false);
      });
      for (let cycle = 0; cycle < 4 && runs.length < 2; cycle += 1) {
        act(() => {
          jest.runOnlyPendingTimers();
        });
        await act(async () => {
          for (let index = 0; index < 10; index += 1) {
            await Promise.resolve();
          }
        });
      }
      expect(runs).toHaveLength(2);
      expect(runs[1].payload.message).toBe("Recover the hung side question");
    } finally {
      jest.useRealTimers();
    }
  });

  test("atomically replaces clarify with one FYI before HTTP and preserves it on failure", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    let durableStateAtHttp = null;
    window.unchainAPI.interject = jest.fn((payload) => {
      if (payload.channel === "auto") {
        return Promise.resolve({ resolved_channel: "clarify" });
      }
      durableStateAtHttp = {
        clarify: readPendingClarifyForChat(chatId),
        fyis: readPendingFyisForAttempt(chatId, runs[0].attemptId),
      };
      return Promise.reject(new Error("FYI request failed"));
    });
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "FYI transition owner" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Persist exactly one FYI" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(readPendingClarifyForChat(chatId)).not.toBeNull());

    let accepted;
    await act(async () => {
      accepted = await lastChatMessagesProps.onClarifyResolve(chatId, "fyi");
    });
    expect(accepted).toBe(false);
    expect(durableStateAtHttp?.clarify).toBeNull();
    expect(durableStateAtHttp?.fyis).toEqual([
      expect.objectContaining({
        requestedChannel: "fyi",
        text: "Persist exactly one FYI",
      }),
    ]);
    expect(readPendingClarifyForChat(chatId)).toBeNull();
    expect(readPendingFyisForAttempt(chatId, runs[0].attemptId)).toHaveLength(1);
    expect(readQueuedTurnsForAttempt(chatId, runs[0].attemptId)).toBeNull();
    expect(window.unchainAPI.interject).toHaveBeenCalledTimes(2);
  });

  test("a late clarify-owned BTW cannot write into a newer run generation", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      const attemptId = `attempt-generation-${runs.length + 1}`;
      const run = { payload, handlers, attemptId };
      runs.push(run);
      return {
        requestId: `request-generation-${runs.length}`,
        executionId: payload.threadId,
        attemptId,
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });
    let resolveBtw;
    window.unchainAPI.interject = jest.fn((payload) => {
      if (payload.channel === "auto") {
        return Promise.resolve({ resolved_channel: "clarify" });
      }
      return new Promise((resolve) => {
        resolveBtw = resolve;
      });
    });
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Old generation owner" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Old generation side question" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(readPendingClarifyForChat(chatId)).not.toBeNull());
    let oldSettlement;
    act(() => {
      oldSettlement = lastChatMessagesProps.onClarifyResolve(chatId, "btw");
      runs[0].handlers.onDone({ finished_at: Date.now() });
    });

    await waitFor(() => expect(lastChatInputProps?.sendDisabled).toBe(false));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "New generation owner" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(2));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue B queue before A settles" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() =>
      expect(
        readQueuedTurnsForAttempt(chatId, runs[1].attemptId)?.items,
      ).toEqual([
        expect.objectContaining({
          text: "B queue before A settles",
          status: "queued",
        }),
      ]),
    );
    await act(async () => {
      resolveBtw({ resolved_channel: "btw", answer: "Late old answer" });
      await expect(oldSettlement).resolves.toBe(false);
    });
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue B queue after A settles" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    const newOwner = getChatsStore().chatsById[chatId].messages.find(
      (message) =>
        message.role === "assistant" &&
        message.meta?.attemptId === runs[1].attemptId,
    );
    expect(newOwner?.status).toBe("streaming");
    expect(newOwner?.traceFrames || []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "side_answer" })]),
    );
    expect(newOwner?.interjections || []).toEqual([]);
    expect(
      readQueuedTurnsForAttempt(chatId, runs[0].attemptId)?.items,
    ).toEqual([
      expect.objectContaining({
        text: "Old generation side question",
        status: "queued",
      }),
    ]);
    expect(
      readQueuedTurnsForAttempt(chatId, runs[1].attemptId)?.items,
    ).toEqual([
      expect.objectContaining({
        text: "B queue before A settles",
        status: "queued",
      }),
      expect.objectContaining({
        text: "B queue after A settles",
        status: "queued",
      }),
    ]);
    expect(lastChatInputProps?.interjectState?.queueItems).toEqual([
      expect.objectContaining({ text: "B queue before A settles" }),
      expect.objectContaining({ text: "B queue after A settles" }),
    ]);
    expect(runs).toHaveLength(2);
  });

  test("removes an error fallback when its delayed clarify-owned BTW succeeds", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
    let resolveBtw;
    window.unchainAPI.interject = jest.fn((payload) => {
      if (payload.channel === "auto") {
        return Promise.resolve({ resolved_channel: "clarify" });
      }
      return new Promise((resolve) => {
        resolveBtw = resolve;
      });
    });
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Error owner with delayed BTW" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Answer after the owner errors" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(readPendingClarifyForChat(chatId)).not.toBeNull());

    let settlementPromise;
    act(() => {
      settlementPromise = lastChatMessagesProps.onClarifyResolve(chatId, "btw");
    });
    const [{ messageId }] = readPendingFyisForAttempt(
      chatId,
      runs[0].attemptId,
    );
    act(() => {
      runs[0].handlers.onError(
        Object.assign(new Error("owner failed"), { code: "stream_error" }),
      );
    });
    expect(
      readQueuedTurnsForAttempt(chatId, runs[0].attemptId)?.items,
    ).toEqual([
      expect.objectContaining({ id: messageId, status: "queued" }),
    ]);

    await act(async () => {
      resolveBtw({ resolved_channel: "btw", answer: "Delayed stable answer" });
      await expect(settlementPromise).resolves.toBe(true);
    });

    const ownerAssistant = getChatsStore().chatsById[chatId].messages.find(
      (message) =>
        message.role === "assistant" &&
        message.meta?.attemptId === runs[0].attemptId,
    );
    expect(
      ownerAssistant?.traceFrames?.filter(
        (frame) =>
          frame.type === "side_answer" &&
          frame.payload?.message_id === messageId,
      ),
    ).toHaveLength(1);
    expect(
      ownerAssistant?.interjections?.filter(
        (record) => record.id === `btw-${messageId}`,
      ),
    ).toHaveLength(1);
    expect(readPendingFyisForAttempt(chatId, runs[0].attemptId)).toEqual([]);
    expect(readQueuedTurnsForAttempt(chatId, runs[0].attemptId)).toBeNull();
    expect(runs).toHaveLength(1);
  });

  test("reconciles a persisted BTW receipt before remount queue recovery", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    window.unchainAPI.startStreamV4 = jest.fn();
    const firstView = renderChat();
    await waitForReady();
    firstView.unmount();

    const attemptId = "attempt-persisted-btw-receipt";
    const messageId = "fyi-client-persisted-btw-receipt";
    setChatMessages(
      chatId,
      [
        {
          id: "user-persisted-btw-receipt",
          role: "user",
          content: "Persisted receipt owner",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "assistant-persisted-btw-receipt",
          role: "assistant",
          content: "done",
          status: "done",
          createdAt: 2,
          updatedAt: 3,
          meta: { attemptId },
          traceFrames: [
            {
              seq: 3,
              ts: 3,
              type: "side_answer",
              stage: "client",
              payload: {
                message_id: messageId,
                question: "Recovered side question",
                answer: "Recovered side answer",
              },
            },
          ],
          interjections: [
            {
              id: `btw-${messageId}`,
              type: "btw",
              text: "Recovered side question",
              answer: "Recovered side answer",
              origin: "user",
              ts: 3,
            },
          ],
        },
      ],
      { source: "test" },
    );
    writePendingFyi({
      chatId,
      attemptId,
      messageId,
      text: "Recovered side question",
      requestedChannel: "btw",
      threadId: chatId,
    });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId,
      items: [
        { id: messageId, text: "Recovered side question", status: "queued" },
      ],
    });

    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(readPendingFyisForAttempt(chatId, attemptId)).toEqual([]);
      expect(readQueuedTurnsForAttempt(chatId, attemptId)).toBeNull();
    });
    const ownerAssistant = getChatsStore().chatsById[chatId].messages.find(
      (message) => message.id === "assistant-persisted-btw-receipt",
    );
    expect(
      ownerAssistant.traceFrames.filter(
        (frame) => frame.payload?.message_id === messageId,
      ),
    ).toHaveLength(1);
    expect(
      ownerAssistant.interjections.filter(
        (record) => record.id === `btw-${messageId}`,
      ),
    ).toHaveLength(1);
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("does not reconcile a partial persisted BTW receipt", async () => {
    const chatId = getChatsStore().activeChatId;
    const attemptId = "attempt-partial-btw-receipt";
    const messageId = "fyi-client-partial-btw-receipt";
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    setChatMessages(
      chatId,
      [
        {
          id: "assistant-partial-btw-receipt",
          role: "assistant",
          content: "failed",
          status: "error",
          createdAt: 1,
          updatedAt: 2,
          meta: { attemptId },
          traceFrames: [
            {
              seq: 2,
              ts: 2,
              type: "side_answer",
              payload: { message_id: messageId },
            },
          ],
          interjections: [],
        },
      ],
      { source: "test" },
    );
    writePendingFyi({
      chatId,
      attemptId,
      messageId,
      text: "Partial receipt must stay recoverable",
      requestedChannel: "btw",
      threadId: chatId,
    });
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId,
      items: [
        {
          id: messageId,
          text: "Partial receipt must stay recoverable",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.startStreamV4 = jest.fn();

    renderChat();
    await waitForReady();
    await waitFor(() =>
      expect(readQueuedTurnsForAttempt(chatId, attemptId)?.items).toEqual([
        expect.objectContaining({ id: messageId, status: "queued" }),
      ]),
    );
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });

  test("tombstones a stopped hung BTW before a successor starts its own BTW", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = [];
    window.unchainAPI.startStreamV4 = jest.fn((payload, handlers = {}) => {
      const attemptId = `attempt-stop-btw-${runs.length + 1}`;
      const run = { payload, handlers, attemptId };
      runs.push(run);
      return {
        requestId: `request-stop-btw-${runs.length}`,
        executionId: payload.threadId,
        attemptId,
        disconnect: jest.fn(),
        cancel: jest.fn(),
      };
    });
    let resolveStoppedBtw;
    let btwDispatchCount = 0;
    window.unchainAPI.interject = jest.fn((payload) => {
      if (payload.channel === "auto") {
        return Promise.resolve({ resolved_channel: "clarify" });
      }
      btwDispatchCount += 1;
      if (btwDispatchCount === 1) {
        return new Promise((resolve) => {
          resolveStoppedBtw = resolve;
        });
      }
      return Promise.resolve({
        resolved_channel: "btw",
        answer: "Successor side answer",
      });
    });
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Stopped BTW owner" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Hung stopped side question" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(readPendingClarifyForChat(chatId)).not.toBeNull());

    jest.useFakeTimers();
    let stoppedSettlement;
    try {
      act(() => {
        stoppedSettlement = lastChatMessagesProps.onClarifyResolve(chatId, "btw");
      });
      fireEvent.click(screen.getByTestId("stop-button"));
      act(() => {
        jest.advanceTimersByTime(40_000);
      });
    } finally {
      jest.useRealTimers();
    }

    await waitFor(() => expect(lastChatInputProps?.sendDisabled).toBe(false));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Successor BTW owner" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(2));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Successor side question" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(readPendingClarifyForChat(chatId)).not.toBeNull());
    let successorAccepted;
    await act(async () => {
      successorAccepted = await lastChatMessagesProps.onClarifyResolve(
        chatId,
        "btw",
      );
    });
    expect(successorAccepted).toBe(true);

    await act(async () => {
      resolveStoppedBtw({
        resolved_channel: "btw",
        answer: "Stale stopped answer",
      });
      await expect(stoppedSettlement).resolves.toBe(false);
    });
    const ownerMessages = getChatsStore().chatsById[chatId].messages.filter(
      (message) => message.role === "assistant",
    );
    const stoppedOwner = ownerMessages.find(
      (message) => message.meta?.attemptId === runs[0].attemptId,
    );
    const successorOwner = ownerMessages.find(
      (message) => message.meta?.attemptId === runs[1].attemptId,
    );
    expect(stoppedOwner?.traceFrames || []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "side_answer" })]),
    );
    expect(
      successorOwner?.traceFrames?.filter(
        (frame) =>
          frame.type === "side_answer" &&
          frame.payload?.question === "Successor side question",
      ),
    ).toHaveLength(1);
    expect(btwDispatchCount).toBe(2);
    expect(runs).toHaveLength(2);
  });

  test("keeps an existing queue visible when a BTW intent transition cannot persist", async () => {
    const chatId = getChatsStore().activeChatId;
    setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test" });
    const runs = installAddressedV4Runs();
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
      target: { value: "Transition owner" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/queue Existing queue item" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "BTW transition item" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() =>
      expect(
        readPendingFyisForAttempt(chatId, runs[0].attemptId),
      ).toHaveLength(1),
    );

    const nativeSetItem = window.localStorage.setItem.bind(
      window.localStorage,
    );
    const storageSpy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function setItem(key, value) {
        if (key === QUEUED_TURN_OUTBOX_STORAGE_KEY) {
          throw new DOMException("quota", "QuotaExceededError");
        }
        return nativeSetItem(key, value);
      });
    await act(async () => {
      resolveInterject({ resolved_channel: "btw", answer: "Saved answer" });
      await Promise.resolve();
      await Promise.resolve();
    });
    storageSpy.mockRestore();

    expect(
      readQueuedTurnsForAttempt(chatId, runs[0].attemptId)?.items,
    ).toEqual([
      expect.objectContaining({ text: "Existing queue item", status: "queued" }),
    ]);
    expect(lastChatInputProps?.interjectState?.queueItems).toEqual([
      expect.objectContaining({ text: "Existing queue item", status: "queued" }),
    ]);
    expect(
      readPendingFyisForAttempt(chatId, runs[0].attemptId),
    ).toHaveLength(1);
  });

  test("removes a queue-only FYI fallback when persisted replay evidence already acknowledged it", async () => {
    const chatId = getChatsStore().activeChatId;
    seedPersistedV4Attempt({ chatId });
    const seededMessages = getChatsStore().chatsById[chatId].messages;
    setChatMessages(
      chatId,
      [
        seededMessages[0],
        {
          ...seededMessages[1],
          traceFrames: [
            {
              seq: 3,
              ts: 3,
              type: "fyi_injected",
              payload: {
                messages: [
                  {
                    message_id: "fyi-queue-only-ack",
                    origin: "user",
                    text: "Already injected",
                  },
                ],
              },
            },
          ],
        },
      ],
      { source: "test" },
    );
    writeQueuedTurnsForAttempt({
      chatId,
      attemptId: "attempt-reattach",
      items: [
        {
          id: "fyi-queue-only-ack",
          text: "Already injected",
          status: "queued",
        },
      ],
    });
    window.unchainAPI.startStreamV4 = jest.fn();
    window.unchainAPI.attachStreamV4 = jest.fn(async () => ({
      requestId: "request-reattach",
      executionId: chatId,
      attemptId: "attempt-reattach",
      terminal: false,
      detach: jest.fn(),
      disconnect: jest.fn(),
      cancel: jest.fn(),
    }));

    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(
        readQueuedTurnsForAttempt(chatId, "attempt-reattach"),
      ).toBeNull();
      expect(lastChatInputProps?.interjectState?.queueItems).toEqual([]);
    });
    expect(window.unchainAPI.startStreamV4).not.toHaveBeenCalled();
  });
});
