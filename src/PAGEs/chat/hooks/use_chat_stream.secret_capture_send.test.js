/**
 * Memory V2 P0 secret capture through the real send flow.
 *
 * Locks (fail-closed contract):
 *  - explicit {{secret:label}}value{{/secret}} syntax and heuristic hits are
 *    ONE gated decision: both stop the send at the confirmation modal BEFORE
 *    any side effect (markChatStarted, the composer draft claim, chat-storage,
 *    the stream) and neither has a silent auto-deposit path;
 *  - a confirmed store deposits into the memory vault (chat scope = UI chat
 *    id, random operationId) and sends only the label+handle marker;
 *  - a partial deposit failure compensates the rows it already created and
 *    sends/persists nothing;
 *  - while a deposit is still pending, nothing is rendered/persisted/sent;
 *  - a deposit rejection aborts the send with a STATIC error (no plaintext,
 *    no message write, no stream call);
 *  - vault bridge missing / safeStorage unavailable → fail closed, and plain
 *    sends still work;
 *  - an explicit plaintext approval drops the wrapper but keeps the value, and
 *    carries its disposition through the queue outbox for a later relay;
 *  - a programmatic send (test API) with a credential is refused, never
 *    prompted — there is no late deposit left inside runTurnRequest.
 *
 * Harness mirrors use_chat_stream.composer_sidecar.test.js.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  LocaleContext,
  NavigationContext,
  ThemeContext,
} from "../../../CONTAINERs/config/context";
import ChatInterface from "../chat";
import { getChatsStore } from "../../../SERVICEs/chat_storage";
import {
  registerCommand,
  unregisterBySource,
} from "../../../SERVICEs/command_registry";
import { SECRET_CAPTURE_MESSAGES } from "./secret_capture";

let lastChatMessagesProps = null;
let lastChatInputProps = null;
const renderedMessageSnapshots = [];
var mockScopedLogger;

/* Side-effect spies. The whole point of the gate is that NONE of these may
   fire before the user has decided, so they are wrapped rather than replaced:
   the real implementations still run. */
var mockSideEffectSpies;
jest.mock("../../../SERVICEs/chat_storage", () => {
  const actual = jest.requireActual("../../../SERVICEs/chat_storage");
  if (!mockSideEffectSpies) {
    mockSideEffectSpies = {
      markChatStarted: jest.fn((...args) => actual.markChatStarted(...args)),
      claimChatDraft: jest.fn((...args) => actual.claimChatDraft(...args)),
      setChatMessages: jest.fn((...args) => actual.setChatMessages(...args)),
    };
  }
  return {
    __esModule: true,
    ...actual,
    markChatStarted: (...args) => mockSideEffectSpies.markChatStarted(...args),
    claimChatDraft: (...args) => mockSideEffectSpies.claimChatDraft(...args),
    setChatMessages: (...args) => mockSideEffectSpies.setChatMessages(...args),
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
    renderedMessageSnapshots.push(JSON.stringify(props.messages || []));
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

const HANDLE = `pvh1_${"c".repeat(64)}`;
const SECRET_VALUE = "sk-live-PLAINTEXT-9876543210";

const installMemoryVault = ({ deposit } = {}) => {
  window.memoryVaultAPI = {
    deposit:
      deposit ||
      jest.fn(async (payload) => ({
        ok: true,
        handle: HANDLE,
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
  return window.memoryVaultAPI;
};

describe("Memory V2 P0 secret capture on send", () => {
  beforeEach(() => {
    window.localStorage.clear();
    lastChatMessagesProps = null;
    lastChatInputProps = null;
    renderedMessageSnapshots.length = 0;
    jest.spyOn(console, "error").mockImplementation(() => {});
    if (mockSideEffectSpies) {
      mockSideEffectSpies.markChatStarted.mockClear();
      mockSideEffectSpies.claimChatDraft.mockClear();
      mockSideEffectSpies.setChatMessages.mockClear();
    }
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
      startStreamV2: jest.fn((_payload, _handlers = {}) => ({
        cancel: jest.fn(),
      })),
      replaceSessionMemory: jest.fn(async () => ({ applied: true })),
      getSessionMemoryExport: jest.fn(async (sessionId) => ({
        session_id: sessionId,
        session_revision: 1,
        messages: [],
      })),
      buildCharacterAgentConfig: jest.fn(async () => ({})),
      cancelStream: jest.fn(),
      respondToolConfirmation: jest.fn(async () => ({ status: "ok" })),
      interject: jest.fn(async () => ({ resolved_channel: "queue" })),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.unchainAPI;
    delete window.memoryVaultAPI;
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

  const storedActiveMessagesJson = () => {
    const store = getChatsStore();
    return JSON.stringify(store.chatsById[store.activeChatId]?.messages || []);
  };

  const expectNoPlaintextAnywhere = () => {
    for (const snapshot of renderedMessageSnapshots) {
      expect(snapshot).not.toContain(SECRET_VALUE);
    }
    expect(storedActiveMessagesJson()).not.toContain(SECRET_VALUE);
    for (const call of window.unchainAPI.startStreamV2.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain(SECRET_VALUE);
    }
  };

  const waitForGate = async () =>
    waitFor(() => {
      expect(screen.getByText("Store securely and send")).toBeTruthy();
    });

  const clickStore = () =>
    fireEvent.click(screen.getByText("Store securely and send"));

  /* ── the regression: explicit syntax must NOT skip the gate ───────────── */

  test("explicit syntax pauses at the gate before every side effect", async () => {
    installMemoryVault();
    renderChat();
    await waitForReady();
    // The chat page settles by writing messages once; only writes made AFTER
    // the send matter, so the baseline is taken here.
    mockSideEffectSpies.markChatStarted.mockClear();
    mockSideEffectSpies.claimChatDraft.mockClear();
    mockSideEffectSpies.setChatMessages.mockClear();
    const storedBefore = storedActiveMessagesJson();

    sendText(`use {{secret:API key}}${SECRET_VALUE}{{/secret}} for the call`);
    await waitForGate();
    // Give any wrongly-scheduled effect a chance to run.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // NOTHING downstream of the gate has happened.
    expect(mockSideEffectSpies.markChatStarted).not.toHaveBeenCalled();
    expect(mockSideEffectSpies.claimChatDraft).not.toHaveBeenCalled();
    expect(mockSideEffectSpies.setChatMessages).not.toHaveBeenCalled();
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(storedActiveMessagesJson()).toBe(storedBefore);
    // The modal names the secret by the syntax label and shows no value.
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("API key");
    expect(dialog.innerHTML).not.toContain(SECRET_VALUE);
    expectNoPlaintextAnywhere();
  });

  test("confirming deposits the wrapped secret and sends only the marker", async () => {
    const vault = installMemoryVault();
    const chatId = getChatsStore().activeChatId;
    renderChat();
    await waitForReady();

    sendText(`use {{secret:API key}}${SECRET_VALUE}{{/secret}} for the call`);
    await waitForGate();
    clickStore();

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    // deposit contract: chat scope = UI chat id, valid random operationId,
    // exact label/plaintext
    expect(vault.deposit).toHaveBeenCalledTimes(1);
    const depositPayload = vault.deposit.mock.calls[0][0];
    expect(depositPayload.scopeKind).toBe("chat");
    expect(depositPayload.scopeId).toBe(chatId);
    expect(depositPayload.label).toBe("API key");
    // The VALUE only — the {{secret:...}} wrapper is PuPu syntax, not secret.
    expect(depositPayload.plaintext).toBe(SECRET_VALUE);
    expect(depositPayload.operationId).toMatch(/^[A-Za-z0-9_.-]{8,128}$/);

    const expectedRedacted =
      `use <secret-handle label="API key" handle="${HANDLE}"/> for the call`;
    const streamPayload = window.unchainAPI.startStreamV2.mock.calls[0][0];
    // No wrapper and no value survive anywhere in the outgoing text.
    expect(streamPayload.message).toBe(expectedRedacted);
    expect(streamPayload.message).not.toContain("{{secret:");
    expect(streamPayload.message).not.toContain("{{/secret}}");

    const userMessage = [...(lastChatMessagesProps?.messages || [])]
      .reverse()
      .find((message) => message.role === "user");
    expect(userMessage?.content).toBe(expectedRedacted);

    // the replacement happened BEFORE any render/persist: no snapshot, no
    // stored message, no payload ever contained the plaintext
    expectNoPlaintextAnywhere();
  });

  test("two explicit secrets: a failed second deposit compensates the first and sends nothing", async () => {
    let depositIndex = 0;
    installMemoryVault({
      deposit: jest.fn(async () => {
        depositIndex += 1;
        if (depositIndex === 2) {
          throw new Error("[secret_storage_unavailable] nope");
        }
        return { ok: true, handle: HANDLE };
      }),
    });
    renderChat();
    await waitForReady();
    mockSideEffectSpies.setChatMessages.mockClear();
    const storedBefore = storedActiveMessagesJson();
    const secondValue = "zzzz9999yyyy-SECOND";

    sendText(
      `a {{secret:First}}${SECRET_VALUE}{{/secret}} b ` +
        `{{secret:Second}}${secondValue}{{/secret}} c`,
    );
    await waitForGate();
    clickStore();

    await waitFor(() => {
      expect(lastChatInputProps?.disclaimer || "").toContain(
        SECRET_CAPTURE_MESSAGES.secret_capture_deposit_failed,
      );
    });
    // The row the first deposit created is deleted again — no orphan.
    expect(window.memoryVaultAPI.deposit).toHaveBeenCalledTimes(2);
    expect(window.memoryVaultAPI.delete).toHaveBeenCalledTimes(1);
    expect(window.memoryVaultAPI.delete.mock.calls[0][0].handle).toBe(HANDLE);
    // And absolutely nothing was sent or written.
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(mockSideEffectSpies.setChatMessages).not.toHaveBeenCalled();
    expect(storedActiveMessagesJson()).toBe(storedBefore);
    expect(lastChatInputProps.disclaimer).not.toContain(SECRET_VALUE);
    expect(lastChatInputProps.disclaimer).not.toContain(secondValue);
    expectNoPlaintextAnywhere();
  });

  test("cancelling an explicit-syntax gate stores nothing and keeps the composer", async () => {
    installMemoryVault();
    renderChat();
    await waitForReady();
    const storedBefore = storedActiveMessagesJson();
    const typed = `{{secret:API key}}${SECRET_VALUE}{{/secret}}`;

    sendText(typed);
    await waitForGate();
    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(lastChatInputProps.sendDisabled).toBe(false);
    });
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
    expect(window.memoryVaultAPI.delete).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(storedActiveMessagesJson()).toBe(storedBefore);
    // The composer keeps the user's own text so they can edit or retry.
    expect(lastChatInputProps.value).toBe(typed);
    expectNoPlaintextAnywhere();
  });

  test("a stale composer edit while the modal is open abandons the send", async () => {
    installMemoryVault();
    renderChat();
    await waitForReady();
    const storedBefore = storedActiveMessagesJson();

    sendText(`{{secret:API key}}${SECRET_VALUE}{{/secret}}`);
    await waitForGate();
    // The user edits the composer behind the modal, then confirms. The
    // approval no longer describes what is on screen.
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "something completely different" },
    });
    clickStore();

    await waitFor(() => {
      expect(window.memoryVaultAPI.deposit).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    // The deposit happened (the user did click store) but the send is dropped.
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(storedActiveMessagesJson()).toBe(storedBefore);
    expectNoPlaintextAnywhere();
  });

  test("nothing is rendered, persisted, or sent while the deposit is still pending", async () => {
    installMemoryVault({ deposit: jest.fn(() => new Promise(() => {})) });
    renderChat();
    await waitForReady();
    mockSideEffectSpies.markChatStarted.mockClear();
    const storedBefore = storedActiveMessagesJson();

    sendText(`{{secret:API key}}${SECRET_VALUE}{{/secret}}`);
    await waitForGate();
    clickStore();
    // let any wrongly-scheduled optimistic write flush
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(window.memoryVaultAPI.deposit).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(mockSideEffectSpies.markChatStarted).not.toHaveBeenCalled();
    expect(storedActiveMessagesJson()).toBe(storedBefore);
    expectNoPlaintextAnywhere();
  });

  test("a deposit rejection fails closed with a static error and no writes", async () => {
    installMemoryVault({
      deposit: jest.fn(async () => {
        const error = new Error(
          "[secret_storage_unavailable] encrypted secret storage is unavailable on this machine",
        );
        throw error;
      }),
    });
    renderChat();
    await waitForReady();
    const storedBefore = storedActiveMessagesJson();

    sendText(`{{secret:token}}${SECRET_VALUE}{{/secret}}`);
    await waitForGate();
    clickStore();

    await waitFor(() => {
      expect(lastChatInputProps?.disclaimer || "").toContain(
        SECRET_CAPTURE_MESSAGES.secret_capture_deposit_failed,
      );
    });
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(storedActiveMessagesJson()).toBe(storedBefore);
    // safeStorage's own wording crossed IPC and must never be surfaced.
    expect(lastChatInputProps.disclaimer).not.toContain(SECRET_VALUE);
    expect(lastChatInputProps.disclaimer).not.toContain("safeStorage");
    expect(lastChatInputProps.disclaimer).not.toContain(
      "unavailable on this machine",
    );
    expectNoPlaintextAnywhere();
  });

  test("vault bridge missing: secret sends fail closed, plain sends still work", async () => {
    // no window.memoryVaultAPI installed
    renderChat();
    await waitForReady();
    const storedBefore = storedActiveMessagesJson();

    sendText(`{{secret:key}}${SECRET_VALUE}{{/secret}}`);
    await waitForGate();
    clickStore();
    await waitFor(() => {
      expect(lastChatInputProps?.disclaimer || "").toContain(
        SECRET_CAPTURE_MESSAGES.secret_capture_vault_unavailable,
      );
    });
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(storedActiveMessagesJson()).toBe(storedBefore);
    expectNoPlaintextAnywhere();

    sendText("just a plain message");
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    expect(
      window.unchainAPI.startStreamV2.mock.calls[0][0].message,
    ).toBe("just a plain message");
  });

  test("explicit + heuristic in one message: both are gated, neither leaks", async () => {
    const handles = [`pvh1_${"1".repeat(64)}`, `pvh1_${"2".repeat(64)}`];
    let index = 0;
    installMemoryVault({
      deposit: jest.fn(async () => {
        const handle = handles[index];
        index += 1;
        return { ok: true, handle };
      }),
    });
    renderChat();
    await waitForReady();
    const leakedValue = "abcd1234efgh5678";

    sendText(
      `wrapped {{secret:Deploy key}}${SECRET_VALUE}{{/secret}} and ` +
        `bare api_key=${leakedValue} done`,
    );
    await waitForGate();
    // Both candidates are surfaced — the explicit one by its syntax name, the
    // heuristic one by its static kind label.
    expect(screen.getByRole("dialog").textContent).toContain("Deploy key");
    expect(screen.getByRole("dialog").textContent).toContain("API key");
    clickStore();

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    expect(window.memoryVaultAPI.deposit).toHaveBeenCalledTimes(2);
    expect(
      window.memoryVaultAPI.deposit.mock.calls.map((call) => call[0].plaintext),
    ).toEqual([SECRET_VALUE, leakedValue]);

    const sent = window.unchainAPI.startStreamV2.mock.calls[0][0].message;
    expect(sent).toBe(
      `wrapped <secret-handle label="Deploy key" handle="${handles[0]}"/> and ` +
        `bare api_key=<secret-handle label="API key" handle="${handles[1]}"/> done`,
    );
    expect(sent).not.toContain(SECRET_VALUE);
    expect(sent).not.toContain(leakedValue);
    expect(sent).not.toContain("{{secret:");
    expectNoPlaintextAnywhere();
    for (const snapshot of renderedMessageSnapshots) {
      expect(snapshot).not.toContain(leakedValue);
    }
  });

  test("explicit plain approval drops the wrapper but keeps the value", async () => {
    installMemoryVault();
    renderChat();
    await waitForReady();

    sendText(`use {{secret:API key}}${SECRET_VALUE}{{/secret}} now`);
    await waitFor(() => {
      expect(screen.getByText("Send as plain text")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Send as plain text"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    const sent = window.unchainAPI.startStreamV2.mock.calls[0][0].message;
    // The user approved the CREDENTIAL, not PuPu's capture syntax.
    expect(sent).toBe(`use ${SECRET_VALUE} now`);
    expect(sent).not.toContain("{{secret:");
    expect(sent).not.toContain("{{/secret}}");
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  test("clean text still takes the fully synchronous path", async () => {
    installMemoryVault();
    renderChat();
    await waitForReady();

    mockSideEffectSpies.markChatStarted.mockClear();
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "an ordinary question" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    /* No await between the click and runTurnRequest's first side effect.
       markChatStarted fires before runTurnRequest's first `await`, so seeing
       it here — with zero microtasks drained — proves the gate did not insert
       an async hop into the ordinary send path. */
    expect(mockSideEffectSpies.markChatStarted).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    expect(window.unchainAPI.startStreamV2.mock.calls[0][0].message).toBe(
      "an ordinary question",
    );
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  /* Structural sentinel. Capture and deposit belong to useSecretCaptureGate
     and run before any side effect; runTurnRequest only PROVES a decision.
     A late deposit reintroduced here would re-open the exact hole this suite
     was written for (side effects already fired, no compensation on partial
     failure), and would not necessarily fail any behavioral test above. */
  test("use_chat_stream performs no vault deposit of its own", () => {
    // eslint-disable-next-line global-require
    const fs = require("fs");
    // eslint-disable-next-line global-require
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "use_chat_stream.js"),
      "utf8",
    );
    expect(source).not.toContain("memoryVaultBridge");
    expect(source).not.toContain("isMemoryVaultBridgeAvailable");
    expect(source).not.toContain("planSecretCapture");
  });

  test("unwrapped credential opens the gate and blocks every side effect while pending", async () => {
    installMemoryVault();
    renderChat();
    await waitForReady();
    const storedBefore = storedActiveMessagesJson();
    const leakedValue = "abcd1234efgh5678";

    sendText(`my api_key=${leakedValue} please use it`);

    // The gate is up: the modal renders the static kind label only.
    await waitFor(() => {
      expect(screen.getByText("Store securely and send")).toBeTruthy();
    });

    // Nothing happened. No stream, no deposit, no message write, and the
    // composer still holds the user's text.
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
    expect(storedActiveMessagesJson()).toBe(storedBefore);
    expect(lastChatInputProps.value).toContain(leakedValue);

    // Every composer control is locked while the decision is pending.
    expect(lastChatInputProps.sendDisabled).toBe(true);
    expect(lastChatInputProps.modelSelectDisabled).toBe(true);
    expect(lastChatInputProps.toolSelectDisabled).toBe(true);
    expect(lastChatInputProps.attachmentsEnabled).toBe(false);

    // The value never reached a render, a disclaimer, or the modal DOM.
    // The composer is the ONE place it legitimately still exists (the user is
    // looking at their own text), so the modal subtree is checked explicitly
    // rather than the whole body.
    expect(lastChatInputProps.disclaimer || "").not.toContain(leakedValue);
    const dialog = screen.getByRole("dialog");
    expect(dialog.innerHTML).not.toContain(leakedValue);
    // It describes the credential only by its static kind label.
    expect(dialog.textContent).toContain("API key");
    for (const snapshot of renderedMessageSnapshots) {
      expect(snapshot).not.toContain(leakedValue);
    }
  });

  test("cancelling the gate stores nothing, sends nothing and keeps the composer", async () => {
    installMemoryVault();
    renderChat();
    await waitForReady();
    const storedBefore = storedActiveMessagesJson();
    const leakedValue = "abcd1234efgh5678";

    sendText(`my api_key=${leakedValue} please use it`);
    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(lastChatInputProps.sendDisabled).toBe(false);
    });
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
    expect(window.memoryVaultAPI.delete).not.toHaveBeenCalled();
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(storedActiveMessagesJson()).toBe(storedBefore);
    // Composer keeps the text so the user can edit or resend deliberately.
    expect(lastChatInputProps.value).toContain(leakedValue);
    expectNoPlaintextAnywhere();
  });

  test("confirming the gate deposits, then sends handle-only text", async () => {
    installMemoryVault();
    renderChat();
    await waitForReady();
    const leakedValue = "abcd1234efgh5678";

    sendText(`my api_key=${leakedValue} please use it`);
    await waitFor(() => {
      expect(screen.getByText("Store securely and send")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Store securely and send"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    const deposits = window.memoryVaultAPI.deposit.mock.calls;
    expect(deposits).toHaveLength(1);
    expect(deposits[0][0].scopeKind).toBe("chat");
    expect(deposits[0][0].plaintext).toBe(leakedValue);

    const sentMessage = window.unchainAPI.startStreamV2.mock.calls[0][0].message;
    // Only the credential span was replaced; the surrounding prose survives.
    expect(sentMessage).toContain("my api_key=");
    expect(sentMessage).toContain(`handle="${HANDLE}"`);
    expect(sentMessage).toContain("please use it");
    expect(sentMessage).not.toContain(leakedValue);
    expectNoPlaintextAnywhere();
    for (const snapshot of renderedMessageSnapshots) {
      expect(snapshot).not.toContain(leakedValue);
    }
  });

  test("send-as-plain-text requires an explicit click and is not replayable", async () => {
    installMemoryVault();
    renderChat();
    await waitForReady();
    const leakedValue = "abcd1234efgh5678";

    sendText(`my api_key=${leakedValue} please use it`);
    await waitFor(() => {
      expect(screen.getByText("Send as plain text")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Send as plain text"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    // The user chose plaintext, so it goes out verbatim and nothing is stored.
    expect(window.unchainAPI.startStreamV2.mock.calls[0][0].message).toContain(
      leakedValue,
    );
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  test("a plain-approved /queue message persists its disposition for the relay", async () => {
    installMemoryVault();
    // Capture the stream handlers so the first run can be held open, which is
    // what makes the second send take the QUEUE path instead of a new run.
    const streamHandlers = [];
    window.unchainAPI.startStreamV2 = jest.fn((_payload, handlers = {}) => {
      streamHandlers.push(handlers);
      return { cancel: jest.fn() };
    });
    renderChat();
    await waitForReady();
    const leakedValue = "abcd1234efgh5678";

    sendText("start a long run");
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    // Give the run a server identity so the queue has a durable owner.
    await act(async () => {
      streamHandlers[0]?.onFrame?.({
        type: "execution.started",
        attempt_id: "attempt-1",
        session_id: "session-1",
      });
    });

    sendText(`/queue rotate api_key=${leakedValue} tomorrow`);
    await waitFor(() => {
      expect(screen.getByText("Send as plain text")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Send as plain text"));

    // The queued item is persisted WITH the user's explicit approval, so a
    // later programmatic relay can proceed without re-prompting.
    await waitFor(() => {
      const raw = window.localStorage.getItem("pupu.queued_turn_outbox.v1");
      expect(raw || "").toContain("plain_user_approved");
    });
    const outbox = JSON.parse(
      window.localStorage.getItem("pupu.queued_turn_outbox.v1"),
    );
    const items = (outbox.queues || []).flatMap((entry) => entry.items || []);
    const approved = items.filter(
      (item) => item.disposition === "plain_user_approved",
    );
    expect(approved).toHaveLength(1);
    expect(approved[0].text).toContain(leakedValue);
    // Nothing was deposited — the user chose plaintext, not the vault.
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  test("a queued message that trips the scanner without approval never persists", async () => {
    installMemoryVault();
    const streamHandlers = [];
    window.unchainAPI.startStreamV2 = jest.fn((_payload, handlers = {}) => {
      streamHandlers.push(handlers);
      return { cancel: jest.fn() };
    });
    renderChat();
    await waitForReady();
    const leakedValue = "abcd1234efgh5678";

    sendText("start a long run");
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      streamHandlers[0]?.onFrame?.({
        type: "execution.started",
        attempt_id: "attempt-1",
        session_id: "session-1",
      });
    });

    sendText(`/queue rotate api_key=${leakedValue} tomorrow`);
    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(lastChatInputProps.sendDisabled).toBe(false);
    });
    const raw = window.localStorage.getItem("pupu.queued_turn_outbox.v1") || "";
    expect(raw).not.toContain(leakedValue);
    expect(storedActiveMessagesJson()).not.toContain(leakedValue);
  });

  /* ── skill expansion: the guard's subject is the PRE-EXPANSION text ─────
     The token binds to what the user reviewed. Composer plugin-skill
     expansion happens AFTER the gate and splices in app-authored content, so
     the final guard must scan the reviewed text, not the expanded body —
     otherwise a skill whose template merely mentions a credential-shaped
     example would refuse a send the user's own text never triggered. */
  test("app skill expansion never false-positives the final guard", async () => {
    const PLUGIN_SOURCE = "plugin:leakykit";
    // The TEMPLATE itself trips the scanner. It is app content, not the
    // user's credential, and the user never saw or approved it.
    const TEMPLATE = "Reference config: api_key=abcd1234efgh5678";
    registerCommand({
      name: "/leaky",
      description: "Expands to credential-shaped app content",
      source: PLUGIN_SOURCE,
      sourceLabel: "Leakykit",
      sourceToolkitId: "leakykit",
      expandsTo: TEMPLATE,
      availability: (ctx) => ctx.phase === "composer",
    });
    try {
      installMemoryVault();
      renderChat();
      await waitForReady();

      sendText("/leaky please check this");

      // The user's own text is clean, so no modal and no refusal.
      await waitFor(() => {
        expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(lastChatInputProps.disclaimer || "").not.toContain(
        SECRET_CAPTURE_MESSAGES.secret_capture_gate_required,
      );
      // The expanded app content went out untouched — the gate never
      // rewrites content it did not show the user.
      expect(window.unchainAPI.startStreamV2.mock.calls[0][0].message).toContain(
        TEMPLATE,
      );
      expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
    } finally {
      unregisterBySource(PLUGIN_SOURCE);
    }
  });

  test("a plain-approved explicit /queue message persists de-wrapped text", async () => {
    installMemoryVault();
    const streamHandlers = [];
    window.unchainAPI.startStreamV2 = jest.fn((_payload, handlers = {}) => {
      streamHandlers.push(handlers);
      return { cancel: jest.fn() };
    });
    renderChat();
    await waitForReady();

    sendText("start a long run");
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      streamHandlers[0]?.onFrame?.({
        type: "execution.started",
        attempt_id: "attempt-1",
        session_id: "session-1",
      });
    });

    sendText(`/queue rotate {{secret:API key}}${SECRET_VALUE}{{/secret}} later`);
    await waitFor(() => {
      expect(screen.getByText("Send as plain text")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Send as plain text"));

    await waitFor(() => {
      const raw = window.localStorage.getItem("pupu.queued_turn_outbox.v1");
      expect(raw || "").toContain("plain_user_approved");
    });
    const outbox = JSON.parse(
      window.localStorage.getItem("pupu.queued_turn_outbox.v1"),
    );
    const approved = (outbox.queues || [])
      .flatMap((entry) => entry.items || [])
      .filter((item) => item.disposition === "plain_user_approved");
    expect(approved).toHaveLength(1);
    // The value the user approved survives; PuPu's capture syntax does not.
    expect(approved[0].text).toContain(SECRET_VALUE);
    expect(approved[0].text).not.toContain("{{secret:");
    expect(approved[0].text).not.toContain("{{/secret}}");
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  test("an explicit /queue message with no approval never persists", async () => {
    installMemoryVault();
    const streamHandlers = [];
    window.unchainAPI.startStreamV2 = jest.fn((_payload, handlers = {}) => {
      streamHandlers.push(handlers);
      return { cancel: jest.fn() };
    });
    renderChat();
    await waitForReady();

    sendText("start a long run");
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      streamHandlers[0]?.onFrame?.({
        type: "execution.started",
        attempt_id: "attempt-1",
        session_id: "session-1",
      });
    });

    sendText(`/queue rotate {{secret:API key}}${SECRET_VALUE}{{/secret}} later`);
    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(lastChatInputProps.sendDisabled).toBe(false);
    });
    const raw = window.localStorage.getItem("pupu.queued_turn_outbox.v1") || "";
    expect(raw).not.toContain(SECRET_VALUE);
    expect(raw).not.toContain("{{secret:");
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  test("an approval abandoned before the send is burned, not left reusable", async () => {
    installMemoryVault();
    renderChat();
    await waitForReady();
    /* Force runSend down an early-return path that never reaches
       runTurnRequest: the unchain bridge goes away after the page is ready,
       so the gate still runs but the send is refused afterwards. */
    const realStartStream = window.unchainAPI.startStream;
    window.unchainAPI.startStream = undefined;

    sendText(`{{secret:API key}}${SECRET_VALUE}{{/secret}}`);
    await waitForGate();
    clickStore();

    // The deposit happened (the user did approve), but no run started.
    await waitFor(() => {
      expect(window.memoryVaultAPI.deposit).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();

    // The approval did not survive: with the bridge back, re-sending the same
    // text prompts AGAIN rather than sliding through on the abandoned token.
    window.unchainAPI.startStream = realStartStream;
    sendText(`{{secret:API key}}${SECRET_VALUE}{{/secret}}`);
    await waitForGate();
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expectNoPlaintextAnywhere();
  });

  test("malformed secret syntax fails closed with the static syntax hint", async () => {
    installMemoryVault();
    renderChat();
    await waitForReady();

    sendText(`{{secret:key}}${SECRET_VALUE}`);

    await waitFor(() => {
      expect(lastChatInputProps?.disclaimer || "").toContain(
        SECRET_CAPTURE_MESSAGES.secret_capture_malformed,
      );
    });
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
    expect(lastChatInputProps.disclaimer).not.toContain(SECRET_VALUE);
    expectNoPlaintextAnywhere();
  });
});
