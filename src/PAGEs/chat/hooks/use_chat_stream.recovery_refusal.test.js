/**
 * What happens when a recovered turn's run is refused (#356).
 *
 * A turn mutation that is recovered from the durable outbox dispatches a real
 * run. If that run starts and then fails, the failure has to reach the
 * intent: otherwise the recovery effect reads a pristine entry and dispatches
 * it again — measured at fifteen runs for one refusal before this suite — and
 * every new run replaces the refusal banner with the streaming disclaimer, so
 * the person is left watching a spinner for a turn that can never succeed.
 *
 * Harness mirrors use_chat_stream.skeleton_selection.test.js: the real
 * ChatInterface with ChatMessages / ChatInput mocked, and the payload read
 * from the `window.unchainAPI.startStreamV2` mock.
 */
import { act, render, waitFor } from "@testing-library/react";
import {
  LocaleContext,
  NavigationContext,
  ThemeContext,
} from "../../../CONTAINERs/config/context";
import ChatInterface from "../chat";
import {
  createChatInSelectedContext,
  getChatsStore,
  getChatMessages,
  selectTreeNode,
  setChatMessages,
  setChatModel,
  setChatSessionBundle,
} from "../../../SERVICEs/chat_storage";
import { buildTreeNodeLookupByChatId } from "../../../SERVICEs/chat_storage/chat_storage_tree";
import {
  enqueueTurnMutation,
  fingerprintTurnMutationMessages,
  readTurnMutationOutbox,
} from "../../../SERVICEs/turn_mutation_outbox";
import { writeFeatureFlags } from "../../../SERVICEs/feature_flags";

let lastChatInputProps = null;
let lastChatMessagesProps = null;
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
    return <div data-testid="chat-messages" />;
  },
}));

jest.mock("../../../COMPONENTs/chat-input/chat_input", () => ({
  __esModule: true,
  default: (props) => {
    lastChatInputProps = props;
    return <div data-testid="chat-input-stub" />;
  },
}));

const RESOURCES = [
  {
    id: "research.agent:v2",
    kind: "agent",
    name: "Research Agent",
    description: null,
    archived: false,
    edit_token: "edit-1",
    draft_digest: null,
    source_identity: null,
  },
  {
    id: "legacy-132613d90b9bfa97c0545330",
    kind: "agent",
    name: "Reviewer",
    description: null,
    archived: false,
    edit_token: "edit-2",
    draft_digest: null,
    source_identity: null,
  },
];

describe("a refused recovery settles instead of looping", () => {
  let streamHandlers;

  beforeEach(() => {
    streamHandlers = null;
    window.localStorage.clear();
    lastChatInputProps = null;
    lastChatMessagesProps = null;
    jest.spyOn(console, "error").mockImplementation(() => {});
    writeFeatureFlags({ enable_user_access_to_agents: true });
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
      listRecipes: jest.fn(async () => ({ recipes: [{ name: "Default" }] })),
      listSkeletonResources: jest.fn(async () => ({ resources: RESOURCES })),
      startStream: jest.fn(),
      startStreamV2: jest.fn((_payload, handlers = {}) => {
        streamHandlers = handlers;
        return { cancel: jest.fn() };
      }),
      cancelStream: jest.fn(),
      replaceSessionMemory: jest.fn(async () => ({ applied: true })),
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

  /* Two settled turns in the store and one frozen resend intent over them:
     what a cold start finds after the app died mid-change. */
  const seedRecovery = ({ agentId = "research.agent:v2", chatId } = {}) => {
    const targetChatId = chatId || getChatsStore().activeChatId;
    setChatModel(targetChatId, { id: "openai:gpt-5" }, { source: "test" });
    setChatSessionBundle(
      targetChatId,
      { selectedSkeletonAgentId: agentId, selectedRecipeName: "Default" },
      { source: "test" },
    );
    setChatMessages(
      targetChatId,
      [
        {
          id: "recover-user",
          role: "user",
          content: "old question",
          status: "done",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "recover-answer",
          role: "assistant",
          content: "old answer",
          status: "done",
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      { source: "test" },
    );
    const stored = getChatMessages(targetChatId);
    const record = {
      operationId: `turn-recovery-${targetChatId}`,
      chatId: targetChatId,
      sessionId: targetChatId,
      kind: "resend",
      targetMessageId: "recover-user",
      originalFingerprint: fingerprintTurnMutationMessages(stored),
      baseFingerprint: fingerprintTurnMutationMessages([]),
      baseMessageCount: 0,
      text: "replayed question",
      modelId: "openai:gpt-5",
      threadId: targetChatId,
      selectedSkeletonAgentId: agentId,
      createdAt: 1,
    };
    expect(enqueueTurnMutation(record)).not.toBeNull();
    return record;
  };

  const flush = async () => {
    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
  };

  const dispatches = () => window.unchainAPI.startStreamV2.mock.calls.length;
  const sentOptions = (call = 0) =>
    window.unchainAPI.startStreamV2.mock.calls[call][0].options;
  const entryNow = (operationId) =>
    readTurnMutationOutbox().find((row) => row.operationId === operationId) ||
    null;
  const lastAssistant = () =>
    (lastChatMessagesProps?.messages || [])
      .filter((message) => message.role === "assistant")
      .slice(-1)[0] || null;

  /* Answer every dispatch the product makes, so a loop would show up as a
     growing count rather than as a quiet hang. */
  const refuseEveryDispatch = async (error, rounds = 8) => {
    let answered = 0;
    for (let round = 0; round < rounds; round += 1) {
      await flush();
      if (dispatches() <= answered) break;
      answered = dispatches();
      await act(async () => {
        streamHandlers.onError?.(error);
      });
      await flush();
    }
    return answered;
  };

  test("a refusal the selection owns runs once, says why, and quarantines the intent", async () => {
    const record = seedRecovery();
    renderChat();
    await waitFor(() => expect(dispatches()).toBe(1));

    const answered = await refuseEveryDispatch({
      code: "resource_missing",
      message: "That Agent was not found on the host",
    });

    /* One run for one refusal: the loop this suite exists for would have kept
       dispatching for as long as anything answered. */
    expect(answered).toBe(1);
    expect(dispatches()).toBe(1);

    /* The reason is the chat's own sentence for a selection refusal, and the
       wait is over rather than back to streaming. */
    expect(lastChatInputProps.disclaimer).toMatch(/was not found/i);
    expect(lastChatInputProps.disclaimer).not.toMatch(/is streaming/i);
    expect(lastAssistant().status).toBe("error");

    /* The frozen intent is kept for review with its reason, not deleted, and
       it still names the Agent it was launched with. */
    const entry = entryNow(record.operationId);
    expect(entry).not.toBeNull();
    expect(entry.retryStatus).toBe("quarantined");
    expect(entry.lastFailureCode).toBe("resource_missing");
    expect(entry.selectedSkeletonAgentId).toBe("research.agent:v2");
    expect(sentOptions().skeleton_selection.resource_id).toBe(
      "research.agent:v2",
    );
    expect("recipe_name" in sentOptions()).toBe(false);
  });

  test("any other terminal failure takes the existing policy's one retry and then stops", async () => {
    const record = seedRecovery();
    renderChat();
    await waitFor(() => expect(dispatches()).toBe(1));

    const answered = await refuseEveryDispatch({
      code: "stream_bridge_failed",
      message: "The stream could not be bridged",
    });

    /* The existing failure policy allows one 250 ms retry and quarantines the
       second time; nothing here dispatches a third run. */
    expect(answered).toBeLessThanOrEqual(2);
    expect(dispatches()).toBeLessThanOrEqual(2);
    const entry = entryNow(record.operationId);
    expect(entry).not.toBeNull();
    expect(["waiting", "quarantined"]).toContain(entry.retryStatus);
    expect(entry.lastFailureCode).toBe("stream_bridge_failed");
    expect(entry.replayAttempts).toBeGreaterThan(0);
  });

  test("a cancelled run leaves the intent recoverable instead of quarantining it", async () => {
    const record = seedRecovery();
    renderChat();
    await waitFor(() => expect(dispatches()).toBe(1));

    await act(async () => {
      streamHandlers.onError?.({ code: "cancelled", message: "Cancelled" });
    });
    await flush();

    /* Stop must never spend the user's frozen edit. */
    const entry = entryNow(record.operationId);
    expect(entry).not.toBeNull();
    expect(entry.retryStatus).not.toBe("quarantined");
    expect(entry.lastFailureCode).toBe("");
  });

  test("a recovered turn that completes normally is retired, not quarantined", async () => {
    const record = seedRecovery();
    renderChat();
    await waitFor(() => expect(dispatches()).toBe(1));

    /* A real completion acknowledges first — the hook retires the intent on
       the run's first authoritative evidence, a token here — and then ends. */
    await act(async () => {
      streamHandlers.onToken?.("answer");
    });
    await flush();
    await act(async () => {
      streamHandlers.onDone?.({});
    });
    await flush();

    /* Acknowledged work is retired, not quarantined, and nothing re-runs. */
    expect(entryNow(record.operationId)).toBeNull();
    expect(lastChatInputProps.disclaimer).not.toMatch(/was not found/i);
    expect(lastAssistant().status).not.toBe("error");
    expect(dispatches()).toBe(1);
  });

  test("a refusal that arrives after the person left lands on its own chat only", async () => {
    const record = seedRecovery();
    const firstChatId = record.chatId;
    renderChat();
    await waitFor(() => expect(dispatches()).toBe(1));

    /* Leave for a second chat before the refusal arrives. */
    await act(async () => {
      createChatInSelectedContext();
    });
    const secondChatId = getChatsStore().activeChatId;
    expect(secondChatId).not.toBe(firstChatId);
    await flush();

    await act(async () => {
      streamHandlers.onError?.({
        code: "resource_missing",
        message: "That Agent was not found on the host",
      });
    });
    await flush();

    /* The chat on screen is not the one that failed, so it shows no refusal of
       its own, and the failed chat's intent still carries the reason. */
    expect(lastChatInputProps.disclaimer || "").not.toMatch(/was not found/i);
    const entry = entryNow(record.operationId);
    expect(entry).not.toBeNull();
    expect(entry.retryStatus).toBe("quarantined");
    expect(entry.lastFailureCode).toBe("resource_missing");

    /* Coming back shows it, and still does not start another run. */
    const firstNode = buildTreeNodeLookupByChatId(getChatsStore().tree)[
      firstChatId
    ];
    if (firstNode) {
      await act(async () => {
        selectTreeNode({ nodeId: firstNode }, { source: "test" });
      });
      await flush();
    }
    expect(dispatches()).toBe(1);
  });
});
