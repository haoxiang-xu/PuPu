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
  TURN_MUTATION_OUTBOX_STORAGE_KEY,
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

  /* A real browser storage refusal, scoped the way a quota failure actually
     lands: only the turn-mutation outbox key is rejected, so chat messages and
     every other key still save. `attemptingOnly` reproduces the narrower
     fault — the single write that would mark the row ATTEMPTING fails, while a
     terminal hold could still be written. A reservation that cannot be
     persisted must never read back as "this turn was never tried". */
  const refuseOutboxWrites = ({ attemptingOnly = true } = {}) => {
    /* Patched on the prototype: jsdom's localStorage is a proxy whose own
       properties are stored items, so an instance spy would write a key
       called "setItem" instead of replacing the method. */
    const realSetItem = window.Storage.prototype.setItem;
    const refusedWrites = [];
    const spy = jest
      .spyOn(window.Storage.prototype, "setItem")
      .mockImplementation(function patchedSetItem(key, value) {
        const text = typeof value === "string" ? value : String(value);
        const marksAttempting = text.includes('"retryStatus":"attempting"');
        if (
          key === TURN_MUTATION_OUTBOX_STORAGE_KEY &&
          (!attemptingOnly || marksAttempting)
        ) {
          refusedWrites.push(key);
          const quotaError = new Error(
            "Failed to set the 'pupu.turn_mutation_outbox.v1' value: quota exceeded.",
          );
          quotaError.name = "QuotaExceededError";
          throw quotaError;
        }
        return realSetItem.call(this, key, value);
      });
    return { refusedWrites, allowWritesAgain: () => spy.mockRestore() };
  };

  /* The narrower fault the fence triage missed: the reservation's write is
     refused, and then the read that follows it — the read that decides which
     fence owns the operation — is refused too. A store that cannot be read
     answers "I don't know", which is not the same as "another fence already
     holds this". */
  const refuseReadsAfterARefusedWrite = () => {
    const realSetItem = window.Storage.prototype.setItem;
    const realGetItem = window.Storage.prototype.getItem;
    const refusedWrites = [];
    const refusedReads = [];
    let readsRefused = false;
    const writeSpy = jest
      .spyOn(window.Storage.prototype, "setItem")
      .mockImplementation(function patchedSetItem(key, value) {
        if (key === TURN_MUTATION_OUTBOX_STORAGE_KEY) {
          refusedWrites.push(key);
          /* From the moment the write is refused the store is unreachable in
             both directions, which is how a revoked storage permission or a
             disk-backed profile going read-only actually behaves. */
          readsRefused = true;
          const quotaError = new Error(
            "Failed to set the 'pupu.turn_mutation_outbox.v1' value: quota exceeded.",
          );
          quotaError.name = "QuotaExceededError";
          throw quotaError;
        }
        return realSetItem.call(this, key, value);
      });
    const readSpy = jest
      .spyOn(window.Storage.prototype, "getItem")
      .mockImplementation(function patchedGetItem(key) {
        if (readsRefused && key === TURN_MUTATION_OUTBOX_STORAGE_KEY) {
          refusedReads.push(key);
          const accessError = new Error(
            "Failed to read the 'pupu.turn_mutation_outbox.v1' value: access is denied.",
          );
          accessError.name = "SecurityError";
          throw accessError;
        }
        return realGetItem.call(this, key);
      });
    return {
      refusedWrites,
      refusedReads,
      recoverStore: () => {
        readsRefused = false;
        writeSpy.mockRestore();
        readSpy.mockRestore();
      },
    };
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

  test("a reservation write the store refuses still holds the turn", async () => {
    const record = seedRecovery();
    renderChat();
    await waitFor(() => expect(dispatches()).toBe(1));
    const { refusedWrites } = refuseOutboxWrites();

    const answered = await refuseEveryDispatch({
      code: "resource_missing",
      message: "That Agent was not found on the host",
    });

    /* The fault has to have actually fired, or this test proves nothing. */
    expect(refusedWrites.length).toBeGreaterThan(0);

    /* One run for one refusal even though the attempt could not be reserved:
       a refused write is not permission to treat the intent as untried. */
    expect(answered).toBe(1);
    expect(dispatches()).toBe(1);
    expect(lastChatInputProps.disclaimer).not.toMatch(/is streaming/i);
    expect(lastAssistant().status).toBe("error");

    /* Held for review with its reason, its text and its Agent — not deleted,
       not replayed, not Default. */
    const entry = entryNow(record.operationId);
    expect(entry).not.toBeNull();
    expect(entry.retryStatus).toBe("quarantined");
    expect(entry.lastFailureCode).toBe("resource_missing");
    expect(entry.selectedSkeletonAgentId).toBe("research.agent:v2");
    expect(entry.text).toBe("replayed question");
  });

  test("when the store refuses every write the page says so and still stops", async () => {
    const record = seedRecovery();
    renderChat();
    await waitFor(() => expect(dispatches()).toBe(1));
    const { refusedWrites } = refuseOutboxWrites({ attemptingOnly: false });

    const answered = await refuseEveryDispatch({
      code: "resource_missing",
      message: "That Agent was not found on the host",
    });

    expect(refusedWrites.length).toBeGreaterThan(0);

    /* Nothing about this turn can be written down, so the only remaining
       bound is this session's: one run, and the page says the hold could not
       be saved instead of showing a spinner forever. */
    expect(answered).toBe(1);
    expect(dispatches()).toBe(1);
    expect(lastChatInputProps.disclaimer).toMatch(/persist/i);
    expect(lastChatInputProps.disclaimer).not.toMatch(/is streaming/i);

    /* The user's frozen intent survives: nothing is deleted to make the
       failure go away. */
    const entry = entryNow(record.operationId);
    expect(entry).not.toBeNull();
    expect(entry.text).toBe("replayed question");
    expect(entry.selectedSkeletonAgentId).toBe("research.agent:v2");
  });

  test("a hold that could not be saved is written down once the store accepts writes", async () => {
    const record = seedRecovery();
    renderChat();
    await waitFor(() => expect(dispatches()).toBe(1));
    const { refusedWrites, allowWritesAgain } = refuseOutboxWrites({
      attemptingOnly: false,
    });

    const answered = await refuseEveryDispatch({
      code: "resource_missing",
      message: "That Agent was not found on the host",
    });
    expect(refusedWrites.length).toBeGreaterThan(0);
    expect(answered).toBe(1);
    /* Nothing landed, so the row is still the pristine one on disk. */
    expect(entryNow(record.operationId).retryStatus).toBe("");

    /* The store frees up and the person comes back to the chat. */
    allowWritesAgain();
    await act(async () => {
      createChatInSelectedContext();
    });
    await flush();
    const firstNode = buildTreeNodeLookupByChatId(getChatsStore().tree)[
      record.chatId
    ];
    expect(firstNode).toBeTruthy();
    await act(async () => {
      selectTreeNode({ nodeId: firstNode }, { source: "test" });
    });
    await flush();

    /* Now it can be recorded, so the hold becomes the durable one — with the
       run's own reason, so a reload still knows why — and the turn is still
       not replayed. */
    const entry = entryNow(record.operationId);
    expect(entry).not.toBeNull();
    expect(entry.retryStatus).toBe("quarantined");
    expect(entry.lastFailureCode).toBe("resource_missing");
    expect(entry.selectedSkeletonAgentId).toBe("research.agent:v2");
    expect(entry.text).toBe("replayed question");
    expect(dispatches()).toBe(1);
  });
  test("a read that fails right after a refused reservation still holds the turn", async () => {
    const record = seedRecovery();
    renderChat();
    await waitFor(() => expect(dispatches()).toBe(1));
    const { refusedWrites, refusedReads, recoverStore } =
      refuseReadsAfterARefusedWrite();

    const answered = await refuseEveryDispatch({
      code: "resource_missing",
      message: "That Agent was not found on the host",
    });

    /* Both halves of the fault have to have fired, or this test proves
       nothing: the reservation write was refused AND the read that follows it
       was refused. */
    expect(refusedWrites.length).toBeGreaterThan(0);
    expect(refusedReads.length).toBeGreaterThan(0);

    /* While the store answers nothing, the page says so rather than showing a
       spinner, and no further run is launched. */
    expect(answered).toBe(1);
    expect(dispatches()).toBe(1);
    expect(lastChatInputProps.disclaimer).toMatch(/persist/i);
    expect(lastChatInputProps.disclaimer).not.toMatch(/is streaming/i);

    /* The store comes back and the person returns to the chat. */
    recoverStore();
    await act(async () => {
      createChatInSelectedContext();
    });
    await flush();
    const firstNode = buildTreeNodeLookupByChatId(getChatsStore().tree)[
      record.chatId
    ];
    expect(firstNode).toBeTruthy();
    await act(async () => {
      selectTreeNode({ nodeId: firstNode }, { source: "test" });
    });
    await flush();

    /* An unreadable snapshot was never a fence holding this turn, so the same
       terminal refusal must not buy a second run once reads work again — and
       the hold it could not write down earlier is written down now. */
    expect(dispatches()).toBe(1);
    const entry = entryNow(record.operationId);
    expect(entry).not.toBeNull();
    expect(entry.retryStatus).toBe("quarantined");
    expect(entry.lastFailureCode).toBe("resource_missing");
    expect(entry.selectedSkeletonAgentId).toBe("research.agent:v2");
    expect(entry.text).toBe("replayed question");
  });
});
