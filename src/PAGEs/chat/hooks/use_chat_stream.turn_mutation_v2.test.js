/**
 * Memory V2 P0 — turn-mutation rebase seam (edit / resend / delete).
 *
 * Locks the invariants that make a turn mutation safe under Context V2:
 *  - a V2-admitted chat rewrites its visible history through
 *    getSessionHead + rebaseSession, and NEVER through the V1
 *    replaceSessionMemory / getSessionMemoryExport pair;
 *  - the frozen rebase payload carries exactly the seven allowlisted fields,
 *    role/content-only history, and accepts expectedSessionRevision 0;
 *  - the server ack lands BEFORE any optimistic message, local persist or
 *    outbound run;
 *  - every ambiguous admission state (pending / failed / unavailable /
 *    not-ready) blocks with a static error and leaves local history untouched
 *    — it never silently falls back to V1;
 *  - shadow-sticky chats still rebase (their journal is canonical too), AND
 *    additionally mirror the frozen history into V1 — under shadow the model
 *    still reads V1 short-term memory, so a journal-only rebase would leave
 *    the mutated turn visible to the model and make shadow change model input;
 *  - the shadow legs run journal-first and the local commit / outbound run
 *    happens only after BOTH; a V1 failure after the ack leaves a PARTIAL row
 *    (v2Ack + v1MirrorState "pending") that blocks the chat and is retried
 *    V1-leg-only;
 *  - recovery replays the FROZEN payload byte-for-byte and never re-reads the
 *    session head;
 *  - an outbox entry with no memoryMode keeps the exact legacy behaviour.
 *
 * Harness mirrors use_chat_stream.memory_v2_payload.test.js: real
 * ChatInterface, mocked ChatMessages / ChatInput, bridges installed on window.
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
  setChatMessages,
} from "../../../SERVICEs/chat_storage";
import {
  TURN_MUTATION_OUTBOX_STORAGE_KEY,
  fingerprintTurnMutationMessages,
  readTurnMutationOutbox,
} from "../../../SERVICEs/turn_mutation_outbox";

let lastChatMessagesProps = null;
let lastChatInputProps = null;
var mockScopedLogger;
var mockRejectTurnMutationSecretToken = false;

jest.mock("./use_secret_capture_gate", () => {
  const actual = jest.requireActual("./use_secret_capture_gate");
  return {
    __esModule: true,
    ...actual,
    useSecretCaptureGate: (options) => {
      const result = actual.useSecretCaptureGate(options);
      return {
        ...result,
        consumeSecretGateToken: (token, binding) => {
          const consumed = result.consumeSecretGateToken(token, binding);
          return mockRejectTurnMutationSecretToken ? false : consumed;
        },
      };
    },
  };
});

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
    /* The real ChatInput docks the hold banner above its capsule; the mock
       renders the real banner straight from the same props (without the
       real component's exit-retention window) so hold interactions and
       absence assertions stay observable here. */
    const TurnMutationQuarantine =
      require("../../../COMPONENTs/chat-messages/components/turn_mutation_quarantine").default;
    return (
      <div>
        <TurnMutationQuarantine
          hold={props.turnMutationHold}
          open
          isDark={false}
          onRetry={props.onTurnMutationRetry}
          onDiscard={props.onTurnMutationDiscard}
        />
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

const setMemoryV2Flag = (enabled) => {
  const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
  root.feature_flags = {
    ...(root.feature_flags || {}),
    enable_memory_v2: enabled === true,
  };
  window.localStorage.setItem("settings", JSON.stringify(root));
};

const setMemoryEnabled = (enabled) => {
  const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
  root.memory = { ...(root.memory || {}), enabled: enabled === true };
  window.localStorage.setItem("settings", JSON.stringify(root));
};

/* Ordered log of the cross-system calls a mutation makes. The whole point of
   the shadow contract is the ORDER (journal → V1 → local/outbound), so the
   tests assert on this rather than on per-mock call counts. */
let callOrder = [];

const ADMITTED_HEAD = Object.freeze({
  admissionMode: "active",
  targetMode: "active",
  bootstrapStatus: "complete",
  bootstrapErrorCode: "",
  v2Bootstrapped: true,
  sticky: true,
  sessionExists: true,
  mutationReady: true,
  currentGenerationId: "ctx_generation_1",
  currentGenerationNo: 2,
  sessionRevision: 4,
});

/* Shadow rollout (the DEFAULT rollout state). mutationReady is structurally
   false here — memory_v2_store.session_head requires target==effective=="active"
   — yet the journal is canonical and the model input is still V1, so a shadow
   mutation writes BOTH. */
const SHADOW_HEAD = Object.freeze({
  ...ADMITTED_HEAD,
  admissionMode: "shadow",
  targetMode: "shadow",
  mutationReady: false,
});

const PRIOR_MESSAGES = [
  { id: "user-1", role: "user", content: "first question", createdAt: 1, updatedAt: 1 },
  {
    id: "assistant-1",
    role: "assistant",
    content: "first answer",
    createdAt: 2,
    updatedAt: 2,
    status: "done",
    traceFrames: [{ seq: 1, type: "tool_call", payload: { secret: "x" } }],
  },
  { id: "user-2", role: "user", content: "second question", createdAt: 3, updatedAt: 3 },
  {
    id: "assistant-2",
    role: "assistant",
    content: "second answer",
    createdAt: 4,
    updatedAt: 4,
    status: "done",
  },
];

describe("Memory V2 P0 turn-mutation rebase", () => {
  let contextV2API;
  let rebaseCalls;
  let headCalls;

  const installContextV2 = ({
    head = ADMITTED_HEAD,
    headError = null,
    rebase = null,
    rebaseError = null,
  } = {}) => {
    rebaseCalls = [];
    headCalls = [];
    const noop = jest.fn(async () => ({}));
    contextV2API = {
      getStatus: noop,
      listEvents: noop,
      readContent: noop,
      getSessionHead: jest.fn(async (payload) => {
        headCalls.push(payload);
        if (headError) throw headError;
        return {
          ownerChatId: payload.ownerChatId,
          sessionId: payload.sessionId,
          ...head,
        };
      }),
      rebaseSession: jest.fn(async (payload) => {
        rebaseCalls.push(payload);
        callOrder.push("rebase");
        if (rebaseError) throw rebaseError;
        return (
          rebase || {
            ownerChatId: payload.ownerChatId,
            sessionId: payload.sessionId,
            attemptId: "ctx_rebase_attempt",
            generationId: "ctx_generation_2",
            generationNo: 3,
            sourceGenerationId: payload.sourceGenerationId,
            sourceGenerationRef: `pupu://context/generation/${payload.sourceGenerationId}`,
            sessionRevision: payload.expectedSessionRevision + 1,
            eventCount: payload.replacementHistory.length + 1,
            messageEventCount: payload.replacementHistory.length,
            eventRefs: ["pupu://context/event/ctx_evt_rebase_audit_a1"],
            turnMutationEventRef:
              "pupu://context/event/ctx_evt_rebase_audit_a1",
            captureQuality: "partial",
            journalDigest: "digest",
            pinnedTaskStateRevision: 1,
            replacementHistoryHash: "hash",
            reason: payload.reason,
            replayed: false,
          }
        );
      }),
      listSpaces: noop,
      getTree: noop,
      listEntries: noop,
      search: noop,
      listCandidates: noop,
      listJobs: noop,
      listPromotions: noop,
      decideCandidate: noop,
      createPromotion: noop,
      decidePromotion: noop,
      listCandidateReviews: noop,
      getCandidateReview: noop,
      decideCandidateReview: noop,
    };
    window.contextV2API = contextV2API;
  };

  const codedError = (code) => {
    const error = new Error(`[${code}] context v2 request failed`);
    error.code = code;
    return error;
  };

  beforeEach(() => {
    window.localStorage.clear();
    lastChatMessagesProps = null;
    lastChatInputProps = null;
    callOrder = [];
    mockRejectTurnMutationSecretToken = false;
    jest.spyOn(console, "error").mockImplementation(() => {});
    setMemoryEnabled(true);
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
      startStreamV2: jest.fn(() => {
        callOrder.push("stream");
        return { cancel: jest.fn() };
      }),
      replaceSessionMemory: jest.fn(async () => {
        callOrder.push("v1_replace");
        return { applied: true };
      }),
      getSessionMemoryExport: jest.fn(async (sessionId) => ({
        session_id: sessionId,
        session_revision: 1,
        messages: [],
      })),
      cancelStream: jest.fn(),
      respondToolConfirmation: jest.fn(async () => ({ status: "ok" })),
      interject: jest.fn(async () => ({ resolved_channel: "queue" })),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.unchainAPI;
    delete window.contextV2API;
    delete window.memoryVaultAPI;
  });

  const installMemoryVault = () => {
    window.memoryVaultAPI = {
      deposit: jest.fn(async (payload) => ({
        ok: true,
        handle: `pvh1_${"d".repeat(64)}`,
        scopeKind: payload.scopeKind,
        scopeId: payload.scopeId,
        label: payload.label,
      })),
      listDescriptors: jest.fn(async () => ({ ok: true, descriptors: [] })),
      delete: jest.fn(async () => ({ ok: true })),
      grant: jest.fn(async () => ({ ok: true })),
      revoke: jest.fn(async () => ({ ok: true })),
      getStatus: jest.fn(async () => ({ ok: true, available: true })),
    };
  };

  const failOutboxWritesWhen = (predicate) => {
    const originalSetItem = Storage.prototype.setItem;
    return jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function setItem(key, value) {
        if (key === TURN_MUTATION_OUTBOX_STORAGE_KEY) {
          const rows = JSON.parse(value);
          if (predicate(rows)) {
            throw new DOMException("quota", "QuotaExceededError");
          }
        }
        return originalSetItem.call(this, key, value);
      });
  };

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

  const waitForReady = async ({ requireSendEnabled = true } = {}) => {
    await waitFor(() =>
      expect(window.unchainAPI.getModelCatalog).toHaveBeenCalled(),
    );
    // A pending turn mutation legitimately keeps the composer disabled, so
    // recovery scenarios opt out of this leg.
    if (requireSendEnabled) {
      await waitFor(() =>
        expect(lastChatInputProps?.sendDisabled).toBe(false),
      );
    }
  };

  /* The hook's stream error reaches the UI through the composer disclaimer
     ("Unchain error: <message>"), which is the only surface a user sees. */
  const streamErrorText = () => {
    const disclaimer = lastChatInputProps?.disclaimer || "";
    return disclaimer.startsWith("Unchain error: ")
      ? disclaimer.slice("Unchain error: ".length)
      : "";
  };

  /* Writes ONE durable outbox row for a delete of the "user-2" turn, with
     fingerprints computed from what chat_storage actually holds (the store
     augments seeded messages, so a hand-written fingerprint would never
     match and recovery would refuse to run). */
  const seedOutbox = ({ chatId, ...overrides }) => {
    const stored = getChatMessages(chatId) || [];
    const remaining = stored.filter(
      (message) => message.id !== "user-2" && message.id !== "assistant-2",
    );
    window.localStorage.setItem(
      TURN_MUTATION_OUTBOX_STORAGE_KEY,
      JSON.stringify([
        {
          chatId,
          sessionId: chatId,
          originalFingerprint: fingerprintTurnMutationMessages(stored),
          baseFingerprint: fingerprintTurnMutationMessages([]),
          resultFingerprint: fingerprintTurnMutationMessages(remaining),
          baseMessageCount: 0,
          text: "",
          createdAt: 1,
          ...overrides,
        },
      ]),
    );
  };

  // Seeds a two-turn chat, renders, and returns its chat id.
  const seedChat = async () => {
    const chatId = getChatsStore().activeChatId;
    setChatMessages(chatId, PRIOR_MESSAGES, { source: "test" });
    renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(lastChatMessagesProps?.messages?.length).toBe(4);
    });
    return chatId;
  };

  const targetMessage = (id) =>
    lastChatMessagesProps.messages.find((message) => message.id === id);

  describe("Secret Gate proof precedes every turn-mutation side effect", () => {
    const SECRET_TEXT = "please use api_key=abcdefgh12345678 now";

    const rejectStoredDecision = async (operation) => {
      await screen.findByText("Store securely and send");
      fireEvent.click(screen.getByText("Store securely and send"));
      await operation;
    };

    test("edit with an invalidated token touches neither V2 nor V1", async () => {
      setMemoryV2Flag(true);
      installContextV2({ head: SHADOW_HEAD });
      installMemoryVault();
      mockRejectTurnMutationSecretToken = true;
      const chatId = await seedChat();

      const operation = lastChatMessagesProps.onEditMessage(
        targetMessage("user-2"),
        SECRET_TEXT,
      );
      await rejectStoredDecision(operation);

      expect(headCalls).toHaveLength(0);
      expect(rebaseCalls).toHaveLength(0);
      expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
      expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
      expect(readTurnMutationOutbox()).toEqual([]);
      expect(
        lastChatMessagesProps.messages.map((message) => message.id),
      ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
      expect(getChatMessages(chatId).map((message) => message.id)).toEqual([
        "user-1",
        "assistant-1",
        "user-2",
        "assistant-2",
      ]);
    });

    test("resend with an invalidated token touches neither V2 nor V1", async () => {
      setMemoryV2Flag(true);
      installContextV2({ head: SHADOW_HEAD });
      installMemoryVault();
      mockRejectTurnMutationSecretToken = true;
      const chatId = getChatsStore().activeChatId;
      setChatMessages(
        chatId,
        PRIOR_MESSAGES.map((message) =>
          message.id === "user-2"
            ? { ...message, content: SECRET_TEXT }
            : message,
        ),
        { source: "test" },
      );
      renderChat();
      await waitForReady();

      const operation = lastChatMessagesProps.onResendMessage(
        targetMessage("user-2"),
      );
      await rejectStoredDecision(operation);

      expect(headCalls).toHaveLength(0);
      expect(rebaseCalls).toHaveLength(0);
      expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
      expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
      expect(readTurnMutationOutbox()).toEqual([]);
      expect(getChatMessages(chatId)).toHaveLength(4);
    });
  });

  // ── V2 payload shape ────────────────────────────────────────────────────

  test("edit rebases through the bridge and never calls V1 replaceSessionMemory", async () => {
    setMemoryV2Flag(true);
    installContextV2();
    const chatId = await seedChat();

    await lastChatMessagesProps.onEditMessage(
      targetMessage("user-2"),
      "second question, revised",
    );

    await waitFor(() => expect(rebaseCalls).toHaveLength(1));
    expect(headCalls).toEqual([{ ownerChatId: chatId, sessionId: chatId }]);
    // No orphan V1 write of any kind.
    expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
    expect(window.unchainAPI.getSessionMemoryExport).not.toHaveBeenCalled();

    const payload = rebaseCalls[0];
    expect(Object.keys(payload).sort()).toEqual([
      "expectedSessionRevision",
      "operationId",
      "ownerChatId",
      "reason",
      "replacementHistory",
      "sessionId",
      "sourceGenerationId",
    ]);
    expect(payload.ownerChatId).toBe(chatId);
    expect(payload.sessionId).toBe(chatId);
    expect(payload.reason).toBe("edit");
    expect(payload.sourceGenerationId).toBe("ctx_generation_1");
    expect(payload.expectedSessionRevision).toBe(4);
    // history = everything before the edited turn, role/content only
    expect(payload.replacementHistory).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ]);
    payload.replacementHistory.forEach((entry) => {
      expect(Object.keys(entry).sort()).toEqual(["content", "role"]);
    });
    expect(JSON.stringify(payload)).not.toContain("traceFrames");
  });

  test("resend rebases with reason resend", async () => {
    setMemoryV2Flag(true);
    installContextV2();
    await seedChat();

    await lastChatMessagesProps.onResendMessage(targetMessage("user-2"));

    await waitFor(() => expect(rebaseCalls).toHaveLength(1));
    expect(rebaseCalls[0].reason).toBe("resend");
    expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
  });

  test("delete rebases with the post-delete history and commits only after the ack", async () => {
    setMemoryV2Flag(true);
    installContextV2();
    const chatId = await seedChat();

    let releaseRebase;
    const gate = new Promise((resolve) => {
      releaseRebase = resolve;
    });
    const originalRebase = contextV2API.rebaseSession;
    contextV2API.rebaseSession = jest.fn(async (payload) => {
      await gate;
      return originalRebase(payload);
    });

    const deletion = lastChatMessagesProps.onDeleteMessage(
      targetMessage("user-2"),
    );
    await waitFor(() =>
      expect(contextV2API.rebaseSession).toHaveBeenCalledTimes(1),
    );

    // Ack has NOT arrived: local history must still be intact.
    expect(
      lastChatMessagesProps.messages.map((message) => message.id),
    ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);

    releaseRebase();
    await deletion;

    await waitFor(() => {
      expect(
        lastChatMessagesProps.messages.map((message) => message.id),
      ).toEqual(["user-1", "assistant-1"]);
    });
    expect(rebaseCalls[0].reason).toBe("delete");
    expect(rebaseCalls[0].replacementHistory).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ]);
    expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
    // Operation retired from the durable outbox once it is committed.
    expect(
      readTurnMutationOutbox().filter((item) => item.chatId === chatId),
    ).toEqual([]);
  });

  test("expectedSessionRevision 0 is sent for a never-rebased session", async () => {
    setMemoryV2Flag(true);
    installContextV2({ head: { ...ADMITTED_HEAD, sessionRevision: 0 } });
    await seedChat();

    await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

    await waitFor(() => expect(rebaseCalls).toHaveLength(1));
    expect(rebaseCalls[0].expectedSessionRevision).toBe(0);
  });

  // ── shadow dual-write: journal + authoritative V1 ───────────────────────

  describe("shadow writes BOTH legs, journal first", () => {
    /* Why this exists at all: shadow's signed definition is "record, but never
       change model input — the model still reads V1". The sidecar assembles a
       shadow chat's context from renderer history + V1 short-term memory, so
       rebasing only the journal would leave the deleted/edited turn alive in
       V1 and the model would keep seeing it. That IS shadow changing model
       input, and it poisons the very A/B baseline shadow exists to produce. */

    test("delete: rebase → V1 replace → local commit, in that order", async () => {
      setMemoryV2Flag(true);
      installContextV2({ head: SHADOW_HEAD });
      const chatId = await seedChat();

      let releaseV1;
      const v1Gate = new Promise((resolve) => {
        releaseV1 = resolve;
      });
      window.unchainAPI.replaceSessionMemory = jest.fn(async () => {
        callOrder.push("v1_replace");
        // The journal ack has already landed at this point...
        expect(callOrder).toEqual(["rebase", "v1_replace"]);
        // ...and the local history must still be untouched.
        expect(
          lastChatMessagesProps.messages.map((message) => message.id),
        ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
        await v1Gate;
        return { applied: true };
      });

      const deletion = lastChatMessagesProps.onDeleteMessage(
        targetMessage("user-2"),
      );
      await waitFor(() =>
        expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1),
      );
      releaseV1();
      await deletion;

      await waitFor(() => {
        expect(
          lastChatMessagesProps.messages.map((message) => message.id),
        ).toEqual(["user-1", "assistant-1"]);
      });
      expect(callOrder).toEqual(["rebase", "v1_replace"]);
      // Both legs converged → the durable row retires.
      expect(
        readTurnMutationOutbox().filter((item) => item.chatId === chatId),
      ).toEqual([]);
    });

    test.each([
      [
        "edit",
        (message) =>
          lastChatMessagesProps.onEditMessage(message, "second question, revised"),
      ],
      ["resend", (message) => lastChatMessagesProps.onResendMessage(message)],
    ])(
      "%s: rebase → V1 replace → outbound run, in that order",
      async (reason, invoke) => {
        setMemoryV2Flag(true);
        installContextV2({ head: SHADOW_HEAD });
        await seedChat();

        await invoke(targetMessage("user-2"));

        await waitFor(() =>
          expect(window.unchainAPI.startStreamV2).toHaveBeenCalled(),
        );
        // The optimistic user message and the request both come strictly after
        // BOTH memory legs have committed.
        expect(callOrder).toEqual(["rebase", "v1_replace", "stream"]);
        expect(rebaseCalls[0].reason).toBe(reason);
      },
    );

    test("the V1 leg replays the ONE frozen artifact, not live state", async () => {
      setMemoryV2Flag(true);
      installContextV2({ head: SHADOW_HEAD });
      await seedChat();

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

      await waitFor(() =>
        expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1),
      );
      const v1Call = window.unchainAPI.replaceSessionMemory.mock.calls[0][0];
      // Byte-identical to what the journal was rebased to: both systems now
      // describe exactly the same post-mutation conversation.
      expect(v1Call.messages).toEqual(rebaseCalls[0].replacementHistory);
      expect(v1Call.operationId).toBe(rebaseCalls[0].operationId);
      /* No revision / cancel-attempt fence: the chat-level mutation claim has
         already serialised writers and the rebase's own open-attempt fence
         already refused to run while an attempt was live. Re-fencing a frozen
         replay on a transient id would strand the row instead of converging
         it. */
      expect(v1Call.expectedSessionRevision).toBeUndefined();
      expect(v1Call.expectedCancelAttemptId).toBeUndefined();
    });

    test("active never touches V1, even though shadow does", async () => {
      setMemoryV2Flag(true);
      installContextV2({ head: ADMITTED_HEAD });
      await seedChat();

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

      await waitFor(() => expect(rebaseCalls).toHaveLength(1));
      await waitFor(() => {
        expect(
          lastChatMessagesProps.messages.map((message) => message.id),
        ).toEqual(["user-1", "assistant-1"]);
      });
      // In active the journal IS the model input — a V1 write there would be
      // an orphan rewrite of a subsystem nothing reads.
      expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
      expect(callOrder).toEqual(["rebase"]);
    });

    test("the frozen row carries admissionMode and a pending mirror state", async () => {
      setMemoryV2Flag(true);
      installContextV2({ head: SHADOW_HEAD });
      const chatId = await seedChat();
      // Hold the V1 leg open so the PARTIAL row can be inspected mid-flight.
      let releaseV1;
      window.unchainAPI.replaceSessionMemory = jest.fn(
        async () =>
          new Promise((resolve) => {
            releaseV1 = () => resolve({ applied: true });
          }),
      );

      const deletion = lastChatMessagesProps.onDeleteMessage(
        targetMessage("user-2"),
      );
      await waitFor(() =>
        expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalled(),
      );
      const row = readTurnMutationOutbox().find(
        (item) => item.chatId === chatId,
      );
      expect(row.admissionMode).toBe("shadow");
      expect(row.v1MirrorState).toBe("pending");
      expect(row.v2Ack.generationId).toBe("ctx_generation_2");
      releaseV1();
      await deletion;
    });
  });

  // ── equivalence: shadow must leave V1 exactly where legacy would ─────────

  /* The acceptance core of the dual-write ruling. Same chat, same mutation,
     memory enabled: whatever V1 short-term memory the flag-off legacy path
     produces, the shadow path must produce byte-identically. If these ever
     diverge, shadow has changed model input and the V2 rollout's A/B baseline
     is no longer measuring what it claims to measure. */
  test("shadow leaves V1 session memory identical to flag-off legacy", async () => {
    const runMutation = async ({ shadow }) => {
      window.localStorage.clear();
      callOrder = [];
      setMemoryEnabled(true);
      setMemoryV2Flag(shadow);
      installContextV2({ head: SHADOW_HEAD });
      window.unchainAPI.replaceSessionMemory = jest.fn(async () => ({
        applied: true,
      }));
      window.unchainAPI.getSessionMemoryExport = jest.fn(async (sessionId) => ({
        session_id: sessionId,
        session_revision: 1,
        messages: [],
      }));
      const { unmount } = renderChat();
      const chatId = getChatsStore().activeChatId;
      setChatMessages(chatId, PRIOR_MESSAGES, { source: "test" });
      await waitForReady();
      await waitFor(() =>
        expect(lastChatMessagesProps?.messages?.length).toBe(4),
      );

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));
      await waitFor(() =>
        expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1),
      );
      const call = window.unchainAPI.replaceSessionMemory.mock.calls[0][0];
      unmount();
      return call;
    };

    const legacyCall = await runMutation({ shadow: false });
    const shadowCall = await runMutation({ shadow: true });

    // The history handed to V1 — the thing the model actually reads back — is
    // the same in both worlds.
    expect(shadowCall.messages).toEqual(legacyCall.messages);
    expect(shadowCall.messages).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ]);
    expect(shadowCall.options.memory_namespace).toEqual(
      legacyCall.options.memory_namespace,
    );
  });

  // ── fail closed ─────────────────────────────────────────────────────────

  describe("fail closed — never silently falls back to V1", () => {
    const expectBlocked = async (chatId) => {
      await waitFor(() => {
        expect(streamErrorText()).toBeTruthy();
      });
      expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
      expect(window.unchainAPI.getSessionMemoryExport).not.toHaveBeenCalled();
      expect(rebaseCalls || []).toHaveLength(0);
      // local history untouched
      expect(
        lastChatMessagesProps.messages.map((message) => message.id),
      ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
      expect(
        readTurnMutationOutbox().filter((item) => item.chatId === chatId),
      ).toEqual([]);
      // static message only — no server text, path or payload body
      expect(streamErrorText()).not.toMatch(
        /pupu:\/\/|https?:|[/\\]Users|session_id|ctx_generation|\[context_v2/,
      );
    };

    test.each([
      ["bootstrap pending", { bootstrapStatus: "pending", v2Bootstrapped: false }],
      ["bootstrap failed", { bootstrapStatus: "failed", v2Bootstrapped: false }],
      ["active but not mutation-ready", { mutationReady: false }],
      ["no current generation", { currentGenerationId: "" }],
      ["session row gone", { sessionExists: false }],
    ])("%s blocks the mutation", async (_label, headOverrides) => {
      setMemoryV2Flag(true);
      installContextV2({ head: { ...ADMITTED_HEAD, ...headOverrides } });
      const chatId = await seedChat();

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));
      await expectBlocked(chatId);
    });

    test("bridge unavailable blocks without even reading the head", async () => {
      setMemoryV2Flag(true);
      installContextV2();
      delete window.contextV2API;
      const chatId = await seedChat();

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));
      await expectBlocked(chatId);
      expect(headCalls).toHaveLength(0);
    });

    test("an unreachable head blocks rather than assuming legacy", async () => {
      setMemoryV2Flag(true);
      installContextV2({ headError: codedError("context_v2_unreachable") });
      const chatId = await seedChat();

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));
      await expectBlocked(chatId);
    });

    test("a head for the wrong session blocks", async () => {
      setMemoryV2Flag(true);
      installContextV2();
      contextV2API.getSessionHead = jest.fn(async (payload) => {
        headCalls.push(payload);
        return {
          ownerChatId: payload.ownerChatId,
          sessionId: "some-other-session",
          ...ADMITTED_HEAD,
        };
      });
      const chatId = await seedChat();

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));
      await expectBlocked(chatId);
    });
  });

  test("a 404 head is the one server-confirmed legacy path", async () => {
    setMemoryV2Flag(true);
    installContextV2({ headError: codedError("context_v2_not_found") });
    await seedChat();

    await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

    await waitFor(() =>
      expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1),
    );
    expect(rebaseCalls).toHaveLength(0);
    expect(window.unchainAPI.getSessionMemoryExport).toHaveBeenCalled();
  });

  test("flag off keeps the exact legacy V1 path", async () => {
    setMemoryV2Flag(false);
    installContextV2();
    const chatId = await seedChat();

    await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

    await waitFor(() =>
      expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1),
    );
    // The Context V2 bridge is never consulted at all with the flag off.
    expect(headCalls).toHaveLength(0);
    expect(rebaseCalls).toHaveLength(0);
    expect(
      readTurnMutationOutbox().filter((item) => item.chatId === chatId),
    ).toEqual([]);
  });

  // ── ack contract ────────────────────────────────────────────────────────

  test("an ack missing required fields is rejected and nothing is committed", async () => {
    setMemoryV2Flag(true);
    installContextV2({
      rebase: {
        ownerChatId: "will-be-overwritten",
        generationId: "ctx_generation_2",
        // turnMutationEventRef intentionally absent
        sessionRevision: 5,
        reason: "delete",
      },
    });
    const chatId = await seedChat();
    // the stub returns a fixed object; align its identity fields
    contextV2API.rebaseSession = jest.fn(async (payload) => {
      rebaseCalls.push(payload);
      return {
        ownerChatId: payload.ownerChatId,
        sessionId: payload.sessionId,
        generationId: "ctx_generation_2",
        sourceGenerationId: payload.sourceGenerationId,
        turnMutationEventRef: "",
        sessionRevision: payload.expectedSessionRevision + 1,
        reason: payload.reason,
      };
    });

    await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

    await waitFor(() => expect(rebaseCalls).toHaveLength(1));
    // local history untouched, durable intent retained for a retry
    expect(
      lastChatMessagesProps.messages.map((message) => message.id),
    ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
    const pending = readTurnMutationOutbox().filter(
      (item) => item.chatId === chatId,
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].v2Ack).toBeNull();
  });

  test("a stale-revision ack is rejected (server must actually advance)", async () => {
    setMemoryV2Flag(true);
    installContextV2();
    const chatId = await seedChat();
    contextV2API.rebaseSession = jest.fn(async (payload) => {
      rebaseCalls.push(payload);
      return {
        ownerChatId: payload.ownerChatId,
        sessionId: payload.sessionId,
        generationId: "ctx_generation_2",
        sourceGenerationId: payload.sourceGenerationId,
        turnMutationEventRef: "pupu://context/event/a",
        sessionRevision: payload.expectedSessionRevision,
        reason: payload.reason,
      };
    });

    await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

    await waitFor(() => expect(rebaseCalls).toHaveLength(1));
    expect(
      lastChatMessagesProps.messages.map((message) => message.id),
    ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
    expect(
      readTurnMutationOutbox().filter((item) => item.chatId === chatId),
    ).toHaveLength(1);
  });

  test("a retryable rebase failure keeps the durable intent", async () => {
    setMemoryV2Flag(true);
    installContextV2({
      rebaseError: codedError("context_v2_rebase_in_progress"),
    });
    const chatId = await seedChat();

    await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

    await waitFor(() => expect(rebaseCalls.length).toBeGreaterThanOrEqual(1));
    const pending = readTurnMutationOutbox().filter(
      (item) => item.chatId === chatId,
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].memoryMode).toBe("v2");
    expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
    expect(
      lastChatMessagesProps.messages.map((message) => message.id),
    ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(rebaseCalls).toHaveLength(1);
    const [held] = readTurnMutationOutbox().filter(
      (item) => item.chatId === chatId,
    );
    expect(held.retryStatus).toBe("in_progress");
    expect(held.replayAttempts).toBe(0);
    expect(held.retryAt).toBe(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("recovery-required spends two durable calls across a remount, then waits for the user", async () => {
    setMemoryV2Flag(true);
    installContextV2({
      rebaseError: codedError("context_v2_rebase_recovery_required"),
    });
    const chatId = getChatsStore().activeChatId;
    setChatMessages(chatId, PRIOR_MESSAGES, { source: "test" });
    const view = renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(lastChatMessagesProps?.messages?.length).toBe(4);
    });

    await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

    await waitFor(() => expect(rebaseCalls).toHaveLength(1));
    let [held] = readTurnMutationOutbox().filter(
      (item) => item.chatId === chatId,
    );
    expect(held.retryStatus).toBe("waiting");
    expect(held.replayAttempts).toBe(1);
    expect(held.recoveryRequiredAttempts).toBe(1);

    view.unmount();
    renderChat();
    await waitForReady({ requireSendEnabled: false });

    await waitFor(() => expect(rebaseCalls).toHaveLength(2), {
      timeout: 1500,
    });
    await waitFor(() => {
      [held] = readTurnMutationOutbox().filter(
        (item) => item.chatId === chatId,
      );
      expect(held.retryStatus).toBe("quarantined");
    });
    expect(held.replayAttempts).toBe(2);
    expect(held.recoveryRequiredAttempts).toBe(2);
    expect(
      screen.getByRole("button", { name: "Retry message change" }),
    ).toBeEnabled();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(rebaseCalls).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Retry message change" }),
    );
    await waitFor(() => expect(rebaseCalls).toHaveLength(3));
    [held] = readTurnMutationOutbox().filter(
      (item) => item.chatId === chatId,
    );
    expect(held.retryStatus).toBe("waiting");
    expect(held.replayAttempts).toBe(1);
    expect(held.recoveryRequiredAttempts).toBe(1);
  });

  test("an outcome write failure cannot schedule an unpersisted second call", async () => {
    setMemoryV2Flag(true);
    installContextV2({
      rebaseError: codedError("context_v2_rebase_recovery_required"),
    });
    const failWaitingOutcome = failOutboxWritesWhen((rows) =>
      rows.some(
        (row) => row?.retryStatus === "waiting" && row?.retryAt > 0,
      ),
    );
    const chatId = getChatsStore().activeChatId;
    setChatMessages(chatId, PRIOR_MESSAGES, { source: "test" });
    const view = renderChat();
    await waitForReady();
    await waitFor(() => {
      expect(lastChatMessagesProps?.messages?.length).toBe(4);
    });

    await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

    await waitFor(() => expect(rebaseCalls).toHaveLength(1));
    await waitFor(() => {
      const [held] = readTurnMutationOutbox().filter(
        (item) => item.chatId === chatId,
      );
      expect(held.retryStatus).toBe("quarantined");
    });
    let [held] = readTurnMutationOutbox().filter(
      (item) => item.chatId === chatId,
    );
    expect(held.lastFailureCode).toBe("context_v2_persist_failed");
    expect(held.replayAttempts).toBe(1);
    expect(held.retryAt).toBe(0);
    expect(streamErrorText()).toBe(
      "Unable to safely persist this message change. Please try again.",
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(rebaseCalls).toHaveLength(1);

    view.unmount();
    renderChat();
    await waitForReady({ requireSendEnabled: false });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(rebaseCalls).toHaveLength(1);

    failWaitingOutcome.mockRestore();
    contextV2API.rebaseSession.mockImplementation(async (payload) => {
      rebaseCalls.push(payload);
      callOrder.push("rebase");
      throw codedError("context_v2_rebase_journal_incompatible");
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Retry message change" }),
    );

    await waitFor(() => expect(rebaseCalls).toHaveLength(2));
    await waitFor(() => {
      [held] = readTurnMutationOutbox().filter(
        (item) => item.chatId === chatId,
      );
      expect(held.retryStatus).toBe("quarantined");
    });
    expect(held.lastFailureCode).toBe(
      "context_v2_rebase_journal_incompatible",
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(rebaseCalls).toHaveLength(2);
  });

  test("a terminal conflict quarantines the intent while local history stays unchanged", async () => {
    setMemoryV2Flag(true);
    installContextV2({
      rebaseError: codedError("context_v2_revision_conflict"),
    });
    const chatId = await seedChat();

    await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

    await waitFor(() => expect(rebaseCalls).toHaveLength(1));
    await waitFor(() => {
      const rows = readTurnMutationOutbox().filter(
        (item) => item.chatId === chatId,
      );
      expect(rows[0].retryStatus).toBe("quarantined");
    });
    const [held] = readTurnMutationOutbox().filter(
      (item) => item.chatId === chatId,
    );
    expect(held.lastFailureCode).toBe("context_v2_revision_conflict");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This message change is paused because memory could not be updated safely.",
    );
    expect(
      screen.getByRole("button", { name: "Retry message change" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Discard message change and restore text",
      }),
    ).toBeEnabled();
    expect(
      lastChatMessagesProps.messages.map((message) => message.id),
    ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
    expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
  });

  test("discard restores an edited message to the composer before deleting its quarantined intent", async () => {
    setMemoryV2Flag(true);
    installContextV2({
      rebaseError: codedError("context_v2_rebase_journal_incompatible"),
    });
    const chatId = await seedChat();
    const revisedText = "second question, safely revised";

    await lastChatMessagesProps.onEditMessage(
      targetMessage("user-2"),
      revisedText,
    );

    await waitFor(() => {
      const [held] = readTurnMutationOutbox().filter(
        (item) => item.chatId === chatId,
      );
      expect(held.retryStatus).toBe("quarantined");
    });
    const [held] = readTurnMutationOutbox().filter(
      (item) => item.chatId === chatId,
    );
    expect(held.lastFailureCode).toBe(
      "context_v2_rebase_journal_incompatible",
    );
    expect(held.text).toBe(revisedText);
    expect(screen.getByTestId("chat-input")).toHaveValue("");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Discard message change and restore text",
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("chat-input")).toHaveValue(revisedText);
    });
    expect(
      readTurnMutationOutbox().filter((item) => item.chatId === chatId),
    ).toEqual([]);
    expect(
      lastChatMessagesProps.messages.map((message) => message.id),
    ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
  });

  // ── recovery ────────────────────────────────────────────────────────────

  test("discard preserves a newer draft and does not duplicate restored text when deletion must be retried", async () => {
    setMemoryV2Flag(true);
    installContextV2({
      rebaseError: codedError("context_v2_rebase_journal_incompatible"),
    });
    const chatId = await seedChat();
    const revisedText = "second question, safely revised";
    const newerDraft = "a newer unrelated draft";

    await lastChatMessagesProps.onEditMessage(
      targetMessage("user-2"),
      revisedText,
    );
    await waitFor(() => {
      const [held] = readTurnMutationOutbox().filter(
        (item) => item.chatId === chatId,
      );
      expect(held.retryStatus).toBe("quarantined");
    });
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: newerDraft },
    });

    const failRemoval = failOutboxWritesWhen((rows) => rows.length === 0);
    const discardButton = screen.getByRole("button", {
      name: "Discard message change and restore text",
    });
    fireEvent.click(discardButton);
    await waitFor(() => {
      expect(lastChatInputProps.value).toBe(
        `${newerDraft}\n\n${revisedText}`,
      );
    });
    expect(readTurnMutationOutbox()).toHaveLength(1);

    fireEvent.click(discardButton);
    expect(lastChatInputProps.value).toBe(
      `${newerDraft}\n\n${revisedText}`,
    );
    expect(readTurnMutationOutbox()).toHaveLength(1);

    failRemoval.mockRestore();
    fireEvent.click(discardButton);
    await waitFor(() => expect(readTurnMutationOutbox()).toEqual([]));
    expect(lastChatInputProps.value).toBe(
      `${newerDraft}\n\n${revisedText}`,
    );
    expect(
      lastChatMessagesProps.messages.map((message) => message.id),
    ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
  });

  test("discarding a quarantined delete leaves a newer composer draft untouched", async () => {
    setMemoryV2Flag(true);
    installContextV2({
      rebaseError: codedError("context_v2_rebase_journal_incompatible"),
    });
    const chatId = await seedChat();
    const newerDraft = "keep this newer draft";

    await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));
    await waitFor(() => {
      const [held] = readTurnMutationOutbox().filter(
        (item) => item.chatId === chatId,
      );
      expect(held).toMatchObject({ retryStatus: "quarantined", text: "" });
    });
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: newerDraft },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Discard message change and restore text",
      }),
    );

    await waitFor(() => expect(readTurnMutationOutbox()).toEqual([]));
    expect(screen.getByTestId("chat-input")).toHaveValue(newerDraft);
    expect(
      lastChatMessagesProps.messages.map((message) => message.id),
    ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
  });

  test("recovery replays the frozen payload and never re-reads the head", async () => {
    setMemoryV2Flag(true);
    installContextV2();
    const chatId = getChatsStore().activeChatId;
    setChatMessages(chatId, PRIOR_MESSAGES, { source: "test" });

    const frozen = {
      ownerChatId: chatId,
      sessionId: chatId,
      // deliberately NOT what a rebuild from current messages would produce —
      // if recovery recomputed, this exact array could not survive.
      replacementHistory: [{ role: "user", content: "frozen-only-turn" }],
      sourceGenerationId: "ctx_generation_frozen",
      expectedSessionRevision: 0,
      operationId: "turn-recovery-op-123456",
      reason: "delete",
    };
    seedOutbox({
      operationId: "turn-recovery-op-123456",
      chatId,
      kind: "delete",
      memoryMode: "v2",
      v2RebasePayload: frozen,
      targetMessageId: "user-2",
    });

    renderChat();
    await waitForReady({ requireSendEnabled: false });

    await waitFor(() => expect(rebaseCalls).toHaveLength(1));
    // byte-for-byte the frozen payload
    expect(JSON.stringify(rebaseCalls[0])).toBe(JSON.stringify(frozen));
    // the session head is NEVER re-read during recovery
    expect(headCalls).toHaveLength(0);
    expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
  });

  // ── PARTIAL: journal committed, V1 leg did not ──────────────────────────

  describe("Partial — V2 acked, V1 mirror failed", () => {
    /* The two systems cannot be written atomically, so this state is real
       rather than theoretical. Running the turn anyway would send a request
       against a V1 memory that still holds the mutated turn — the exact drift
       being eliminated — so nothing is committed and nothing is sent. */

    const seedShadowChatWithFailingV1 = async (v1Failure) => {
      setMemoryV2Flag(true);
      installContextV2({ head: SHADOW_HEAD });
      const chatId = await seedChat();
      window.unchainAPI.replaceSessionMemory = jest.fn(async () => {
        callOrder.push("v1_replace");
        if (typeof v1Failure === "function") return v1Failure();
        throw v1Failure;
      });
      return chatId;
    };

    test("nothing is committed and no request is sent", async () => {
      const chatId = await seedShadowChatWithFailingV1(
        codedError("unchain_session_memory_replace_failed"),
      );

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

      await waitFor(() =>
        expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalled(),
      );
      expect(callOrder).toEqual(["rebase", "v1_replace"]);
      expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
      // Local history untouched — the delete did NOT land on screen.
      expect(
        lastChatMessagesProps.messages.map((message) => message.id),
      ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);

      const rows = readTurnMutationOutbox().filter(
        (item) => item.chatId === chatId,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].v2Ack.generationId).toBe("ctx_generation_2");
      expect(rows[0].v1MirrorState).toBe("pending");
    });

    test("the retained row keeps the chat locked", async () => {
      await seedShadowChatWithFailingV1(
        codedError("unchain_session_memory_replace_failed"),
      );
      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));
      await waitFor(() =>
        expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalled(),
      );
      // isTurnMutationBlocked is driven by the surviving outbox row.
      await waitFor(() => expect(lastChatInputProps.sendDisabled).toBe(true));
    });

    /* A V1 rejection is authored by the sidecar and can carry request detail.
       The V1 helper sets it on the stream error; the V2 seam overwrites it
       with a fixed literal in the same continuation, so only the literal is
       ever rendered. */
    test("only static text is surfaced, never the sidecar's message", async () => {
      const leaky = new Error(
        "replace failed for session_id chat-1 at /Users/red/pupu/memory.db",
      );
      leaky.code = "unchain_session_memory_replace_failed";
      await seedShadowChatWithFailingV1(leaky);

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

      await waitFor(() => expect(streamErrorText()).toBeTruthy());
      expect(streamErrorText()).toBe(
        "This message change could not be applied. Please try again.",
      );
      expect(streamErrorText()).not.toMatch(
        /pupu:\/\/|https?:|[/\\]Users|session_id|ctx_generation|memory\.db/,
      );
    });

    /* A terminal-looking V1 code must NOT discard the row: the journal is
       already rebased, so dropping the row would erase the only record that V1
       is behind and unlock the chat with dirty short-term memory. */
    test("even a 4xx-shaped V1 rejection keeps the row instead of discarding it", async () => {
      const chatId = await seedShadowChatWithFailingV1(() => ({
        applied: false,
        error: {
          code: "session_revision_conflict",
          message: "conflict",
          retryable: false,
          status: 409,
        },
      }));

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

      await waitFor(() =>
        expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalled(),
      );
      const rows = readTurnMutationOutbox().filter(
        (item) => item.chatId === chatId,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].v1MirrorState).toBe("pending");
    });
  });

  describe("durable progress markers fail closed", () => {
    test("an unpersisted rebase ack never permits the V1 leg or local run", async () => {
      setMemoryV2Flag(true);
      installContextV2({ head: SHADOW_HEAD });
      const chatId = await seedChat();
      failOutboxWritesWhen((rows) => rows.some((row) => row?.v2Ack));

      await lastChatMessagesProps.onEditMessage(
        targetMessage("user-2"),
        "second question, revised",
      );

      await waitFor(() => expect(rebaseCalls.length).toBeGreaterThanOrEqual(1));
      expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
      expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
      expect(
        lastChatMessagesProps.messages.map((message) => message.id),
      ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
      const row = readTurnMutationOutbox().find((item) => item.chatId === chatId);
      expect(row.v2Ack).toBeNull();
      expect(row.v1MirrorState).toBe("pending");
    });

    test("an unpersisted V1 marker stays Partial and recovery retries only V1", async () => {
      setMemoryV2Flag(true);
      installContextV2({ head: SHADOW_HEAD });
      const chatId = await seedChat();
      let rejectAppliedMarker = true;
      failOutboxWritesWhen(
        (rows) =>
          rejectAppliedMarker &&
          rows.some((row) => row?.v1MirrorState === "applied"),
      );

      let releaseRecoveryV1;
      let v1Attempt = 0;
      window.unchainAPI.replaceSessionMemory = jest.fn(async () => {
        callOrder.push("v1_replace");
        v1Attempt += 1;
        if (v1Attempt === 1) return { applied: true };
        return new Promise((resolve) => {
          releaseRecoveryV1 = resolve;
        });
      });

      await lastChatMessagesProps.onEditMessage(
        targetMessage("user-2"),
        "second question, revised",
      );

      await waitFor(() =>
        expect(window.unchainAPI.replaceSessionMemory.mock.calls.length).toBe(2),
      );
      expect(rebaseCalls).toHaveLength(1);
      expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
      expect(
        lastChatMessagesProps.messages.map((message) => message.id),
      ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
      const partial = readTurnMutationOutbox().find(
        (item) => item.chatId === chatId,
      );
      expect(partial.v2Ack.generationId).toBe("ctx_generation_2");
      expect(partial.v1MirrorState).toBe("pending");

      rejectAppliedMarker = false;
      await act(async () => {
        releaseRecoveryV1({ applied: true });
      });

      await waitFor(() =>
        expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
      );
      expect(rebaseCalls).toHaveLength(1);
    });
  });

  // ── crash points ────────────────────────────────────────────────────────

  /* Two distinct interruption points, both of which a reload must resolve
     without re-reading the session head and without double-writing. */
  describe("crash recovery", () => {
    const FROZEN_ACK = Object.freeze({
      generationId: "ctx_generation_frozen_2",
      sourceGenerationId: "ctx_generation_frozen",
      turnMutationEventRef: "pupu://context/event/ctx_evt_frozen",
      sessionRevision: 1,
    });

    const frozenPayload = (chatId) => ({
      ownerChatId: chatId,
      sessionId: chatId,
      replacementHistory: [{ role: "user", content: "frozen-only-turn" }],
      sourceGenerationId: "ctx_generation_frozen",
      expectedSessionRevision: 0,
      operationId: "turn-crash-op-123456",
      reason: "delete",
    });

    const seedInterruptedShadowDelete = ({ withAck }) => {
      const chatId = getChatsStore().activeChatId;
      setChatMessages(chatId, PRIOR_MESSAGES, { source: "test" });
      seedOutbox({
        operationId: "turn-crash-op-123456",
        chatId,
        kind: "delete",
        memoryMode: "v2",
        admissionMode: "shadow",
        v1MirrorState: "pending",
        v2RebasePayload: frozenPayload(chatId),
        ...(withAck ? { v2Ack: FROZEN_ACK } : {}),
        targetMessageId: "user-2",
      });
      return chatId;
    };

    test("crash BEFORE the ack: the frozen payload replays, then the V1 leg runs", async () => {
      setMemoryV2Flag(true);
      // A replayed rebase returns the idempotency receipt rather than minting
      // a second generation.
      installContextV2({
        rebase: null,
        head: SHADOW_HEAD,
      });
      const chatId = seedInterruptedShadowDelete({ withAck: false });
      const originalRebase = contextV2API.rebaseSession;
      contextV2API.rebaseSession = jest.fn(async (payload) => {
        const ack = await originalRebase(payload);
        return { ...ack, replayed: true };
      });

      renderChat();
      await waitForReady({ requireSendEnabled: false });

      await waitFor(() =>
        expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalled(),
      );
      expect(callOrder).toEqual(["rebase", "v1_replace"]);
      // byte-for-byte the frozen payload; the head is never re-read
      expect(JSON.stringify(rebaseCalls[0])).toBe(
        JSON.stringify(frozenPayload(chatId)),
      );
      expect(headCalls).toHaveLength(0);
      await waitFor(() => {
        expect(
          readTurnMutationOutbox().filter((item) => item.chatId === chatId),
        ).toEqual([]);
      });
    });

    test("crash AFTER the ack: recovery skips the rebase and retries only V1", async () => {
      setMemoryV2Flag(true);
      installContextV2({ head: SHADOW_HEAD });
      const chatId = seedInterruptedShadowDelete({ withAck: true });

      renderChat();
      await waitForReady({ requireSendEnabled: false });

      await waitFor(() =>
        expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1),
      );
      // The journal is already committed — re-sending would only refetch the
      // receipt, and re-reading the head could rebase away newer work.
      expect(rebaseCalls).toHaveLength(0);
      expect(headCalls).toHaveLength(0);
      expect(callOrder).toEqual(["v1_replace"]);
      // The V1 leg replays the FROZEN history, not the on-screen one.
      expect(
        window.unchainAPI.replaceSessionMemory.mock.calls[0][0].messages,
      ).toEqual([{ role: "user", content: "frozen-only-turn" }]);

      await waitFor(() => {
        expect(
          lastChatMessagesProps.messages.map((message) => message.id),
        ).toEqual(["user-1", "assistant-1"]);
      });
      await waitFor(() => {
        expect(
          readTurnMutationOutbox().filter((item) => item.chatId === chatId),
        ).toEqual([]);
      });
    });
  });

  // ── shadow fail-closed: still no legacy-only fallback ───────────────────

  describe("shadow fail closed — a V2 failure never becomes a legacy write", () => {
    /* The dual-write adds a V1 leg BEHIND the journal ack; it does not create
       a bypass. If the journal leg cannot commit, V1 must not be touched at
       all — writing it alone would desynchronise the canonical journal in the
       one direction no later phase can repair. */

    test("a terminal rebase conflict writes nothing to V1", async () => {
      setMemoryV2Flag(true);
      installContextV2({
        head: SHADOW_HEAD,
        rebaseError: codedError("context_v2_revision_conflict"),
      });
      const chatId = await seedChat();

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

      await waitFor(() => expect(rebaseCalls).toHaveLength(1));
      await waitFor(() => {
        const rows = readTurnMutationOutbox().filter(
          (item) => item.chatId === chatId,
        );
        expect(rows[0].retryStatus).toBe("quarantined");
      });
      const [held] = readTurnMutationOutbox().filter(
        (item) => item.chatId === chatId,
      );
      expect(held.lastFailureCode).toBe("context_v2_revision_conflict");
      expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
      expect(callOrder).toEqual(["rebase"]);
      expect(
        lastChatMessagesProps.messages.map((message) => message.id),
      ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
    });

    test("a retryable rebase failure writes nothing to V1 and keeps the intent", async () => {
      setMemoryV2Flag(true);
      installContextV2({
        head: SHADOW_HEAD,
        rebaseError: codedError("context_v2_rebase_in_progress"),
      });
      const chatId = await seedChat();

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

      await waitFor(() => expect(rebaseCalls.length).toBeGreaterThanOrEqual(1));
      expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
      const rows = readTurnMutationOutbox().filter(
        (item) => item.chatId === chatId,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].v1MirrorState).toBe("pending");
      expect(rows[0].v2Ack).toBeNull();
    });

    test.each([
      ["bootstrap pending", { bootstrapStatus: "pending", v2Bootstrapped: false }],
      ["session row gone", { sessionExists: false }],
      ["no current generation", { currentGenerationId: "" }],
    ])("a blocked shadow admission (%s) writes neither subsystem", async (
      _label,
      headOverrides,
    ) => {
      setMemoryV2Flag(true);
      installContextV2({ head: { ...SHADOW_HEAD, ...headOverrides } });
      const chatId = await seedChat();

      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));

      await waitFor(() => expect(streamErrorText()).toBeTruthy());
      expect(rebaseCalls).toHaveLength(0);
      expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
      expect(
        readTurnMutationOutbox().filter((item) => item.chatId === chatId),
      ).toEqual([]);
      expect(
        lastChatMessagesProps.messages.map((message) => message.id),
      ).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
    });
  });

  describe("unreadable outbox is a hard lock", () => {
    const prepare = async () => {
      setMemoryV2Flag(true);
      installContextV2({ head: SHADOW_HEAD });
      const chatId = getChatsStore().activeChatId;
      setChatMessages(chatId, PRIOR_MESSAGES, { source: "test" });
      return chatId;
    };

    const assertBlocked = async (chatId) => {
      renderChat();
      await waitForReady({ requireSendEnabled: false });
      await waitFor(() => expect(lastChatInputProps.sendDisabled).toBe(true));
      await lastChatMessagesProps.onDeleteMessage(targetMessage("user-2"));
      expect(rebaseCalls).toHaveLength(0);
      expect(window.unchainAPI.replaceSessionMemory).not.toHaveBeenCalled();
      expect(getChatMessages(chatId).map((message) => message.id)).toEqual([
        "user-1",
        "assistant-1",
        "user-2",
        "assistant-2",
      ]);
    };

    test("a storage read exception cannot be mistaken for an empty outbox", async () => {
      const chatId = await prepare();
      const originalGetItem = Storage.prototype.getItem;
      jest
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(function getItem(key) {
          if (key === TURN_MUTATION_OUTBOX_STORAGE_KEY) {
            throw new DOMException("blocked", "SecurityError");
          }
          return originalGetItem.call(this, key);
        });
      await assertBlocked(chatId);
    });

    test("corrupt outbox JSON cannot be overwritten by a new mutation", async () => {
      const chatId = await prepare();
      window.localStorage.setItem(TURN_MUTATION_OUTBOX_STORAGE_KEY, "{not-json");
      await assertBlocked(chatId);
      expect(window.localStorage.getItem(TURN_MUTATION_OUTBOX_STORAGE_KEY)).toBe(
        "{not-json",
      );
    });
  });

  // ── first-edit session revision ─────────────────────────────────────────

  /* memory_v2_store creates a session row at `revision INTEGER NOT NULL
     DEFAULT 1`, and session_head reports 0 only when there is NO session row —
     a shape that can never reach a V2 admission. So the live first edit
     carries 1, not 0. What the renderer must guarantee either way is that it
     forwards the head's number verbatim: any defaulting or falsy-coercion here
     produces a frozen payload that can never match the server and therefore an
     unrecoverable operation. */
  test.each([
    ["a first edit on a freshly created session", 1],
    ["a session that reports revision 0", 0],
    ["a long-lived session", 4],
  ])("%s sends expectedSessionRevision verbatim", async (_label, revision) => {
    setMemoryV2Flag(true);
    installContextV2({ head: { ...SHADOW_HEAD, sessionRevision: revision } });
    const chatId = await seedChat();

    await lastChatMessagesProps.onEditMessage(
      targetMessage("user-2"),
      "second question, revised",
    );

    await waitFor(() => expect(rebaseCalls).toHaveLength(1));
    expect(rebaseCalls[0].expectedSessionRevision).toBe(revision);
    // and the frozen durable copy agrees with what went on the wire
    const row = readTurnMutationOutbox().find((item) => item.chatId === chatId);
    expect(row.v2RebasePayload.expectedSessionRevision).toBe(revision);
  });

  test("a recovered entry with no memoryMode replays the legacy V1 path", async () => {
    setMemoryV2Flag(true);
    installContextV2();
    const chatId = getChatsStore().activeChatId;
    setChatMessages(chatId, PRIOR_MESSAGES, { source: "test" });

    seedOutbox({
      operationId: "turn-legacy-op-123456",
      chatId,
      // no memoryMode — the pre-Memory-V2 row shape
      kind: "delete",
      targetMessageId: "user-2",
      expectedSessionRevision: 3,
    });

    renderChat();
    await waitForReady({ requireSendEnabled: false });

    await waitFor(() =>
      expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalled(),
    );
    expect(rebaseCalls).toHaveLength(0);
    expect(headCalls).toHaveLength(0);
    const call = window.unchainAPI.replaceSessionMemory.mock.calls[0][0];
    expect(call.operationId).toBe("turn-legacy-op-123456");
    expect(call.expectedSessionRevision).toBe(3);
  });
});
