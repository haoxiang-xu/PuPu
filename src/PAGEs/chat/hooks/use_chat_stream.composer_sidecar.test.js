/**
 * Composer sidecar (S1) — write behavior + 禁读方 lock-down + content-rewrite
 * paths (contract 2026-07-18-composer-sidecar-contract.md, v1 FROZEN).
 *
 * Same harness as use_chat_stream_skill_expand.test.js: mount the real
 * ChatInterface (real useChatStream) with mocked ChatMessages / ChatInput so we
 * can read the outgoing user message object AND the payload handed to
 * window.unchainAPI.startStreamV2 / .interject.
 *
 * What this locks:
 *  - §1/§2  composer written on a command send, byte-aligned templateLength;
 *  - §2     no command → no composer field at all;
 *  - §3.2   composer/rawText NEVER appear in the stream payload (message /
 *           history / options) — the禁读 boundary is structurally clean;
 *  - §3.2   interject channel carries raw text only, no composer;
 *  - §2铁律 edit re-expands (fresh composer) / edit-to-plain drops the stale
 *           sidecar (宁删勿 stale); resend keeps composer (content unchanged).
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
  setChatSelectedToolkits,
} from "../../../SERVICEs/chat_storage";
import {
  registerCommand,
  unregisterBySource,
} from "../../../SERVICEs/command_registry";

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

const PLUGIN_TOOLKIT_ID = "demokit";
const PLUGIN_SOURCE = `plugin:${PLUGIN_TOOLKIT_ID}`;
const TEMPLATE = "Use the demo tools carefully: alpha, beta";

// deep scan for a KEY anywhere in a nested object/array
const deepHasKey = (value, key) => {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => deepHasKey(v, key));
  return Object.keys(value).some(
    (k) => k === key || deepHasKey(value[k], key),
  );
};

describe("composer sidecar (write + 禁读 + rewrite paths)", () => {
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
      buildCharacterAgentConfig: jest.fn(async () => ({})),
      cancelStream: jest.fn(),
      respondToolConfirmation: jest.fn(async () => ({ status: "ok" })),
      interject: jest.fn(async () => ({ resolved_channel: "queue" })),
    };

    registerCommand({
      name: "/plan",
      description: "Plan the task",
      source: PLUGIN_SOURCE,
      sourceLabel: "Plankit",
      sourceToolkitId: PLUGIN_TOOLKIT_ID,
      expandsTo: TEMPLATE,
      availability: (ctx) => ctx.phase === "composer",
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    unregisterBySource(PLUGIN_SOURCE);
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

  const lastUserMessage = () =>
    [...(lastChatMessagesProps?.messages || [])]
      .reverse()
      .find((message) => message.role === "user");

  const sendText = (text) => {
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: text },
    });
    fireEvent.click(screen.getByTestId("send-button"));
  };

  const selectPluginToolkit = () => {
    const seeded = getChatsStore();
    setChatSelectedToolkits(seeded.activeChatId, [PLUGIN_TOOLKIT_ID], {
      source: "test",
    });
  };

  test("writes composer on a command send with a byte-aligned templateLength", async () => {
    selectPluginToolkit();
    renderChat();
    await waitForReady();

    sendText("/plan build the login flow");

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      const msg = lastUserMessage();
      expect(msg?.content).toBe(`${TEMPLATE}\n\nbuild the login flow`);
      expect(msg?.composer).toBeTruthy();
    });

    const msg = lastUserMessage();
    expect(msg.composer.v).toBe(1);
    // rawText is the pre-expansion input, verbatim (§1.2)
    expect(msg.composer.rawText).toBe("/plan build the login flow");
    // commands projected to exactly {name, sourceToolkitId}, order + slash kept
    expect(msg.composer.commands).toEqual([
      { name: "/plan", sourceToolkitId: PLUGIN_TOOLKIT_ID },
    ]);
    // templateLength indexes the template prefix exactly (§1.4)
    expect(msg.composer.templateLength).toBe(TEMPLATE.length);
    expect(msg.content.slice(0, msg.composer.templateLength)).toBe(TEMPLATE);
    expect(msg.content.slice(msg.composer.templateLength)).toBe(
      "\n\nbuild the login flow",
    );
  });

  test("no command → no composer field on the user message", async () => {
    renderChat();
    await waitForReady();

    sendText("just a plain message");

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(lastUserMessage()?.content).toBe("just a plain message");
    });
    expect("composer" in (lastUserMessage() || {})).toBe(false);
  });

  test("禁读: composer/rawText never appear in the stream payload (§3.2)", async () => {
    selectPluginToolkit();
    renderChat();
    await waitForReady();

    sendText("/plan build the login flow");

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    // model-visible message is the expanded content only
    expect(payload.message).toBe(`${TEMPLATE}\n\nbuild the login flow`);
    // no sidecar keys anywhere in message / history / options
    expect(deepHasKey(payload, "composer")).toBe(false);
    expect(deepHasKey(payload, "rawText")).toBe(false);
    // the raw /command token was stripped from what the model sees
    expect(JSON.stringify(payload)).not.toContain("/plan");
  });

  test("禁读: an active-stream send routes to interject with raw text, no composer (§3.2)", async () => {
    selectPluginToolkit();
    renderChat();
    await waitForReady();

    sendText("first message"); // leaves the stream active (never onDone)
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
    });

    sendText("/plan build something else");
    await waitFor(() => {
      expect(window.unchainAPI.interject).toHaveBeenCalledTimes(1);
    });

    const [interjectPayload] = window.unchainAPI.interject.mock.calls[0];
    expect(interjectPayload.text).toBe("/plan build something else");
    expect(deepHasKey(interjectPayload, "composer")).toBe(false);
    // never re-entered the new-turn send
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
  });

  test("edit re-expands a newly-typed command into a fresh composer (§2)", async () => {
    selectPluginToolkit();
    renderChat();
    await waitForReady();

    // first send: plain, no composer
    sendText("original plain text");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    streamHandlers.onDone?.({});
    await waitFor(() =>
      expect(screen.queryByTestId("stop-button")).not.toBeInTheDocument(),
    );
    const original = lastUserMessage();
    expect("composer" in original).toBe(false);

    // edit it to introduce a /command → must re-expand + write a fresh composer
    lastChatMessagesProps.onEditMessage(original, "/plan build the flow");

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      const edited = lastUserMessage();
      expect(edited?.content).toBe(`${TEMPLATE}\n\nbuild the flow`);
      expect(edited?.composer?.rawText).toBe("/plan build the flow");
    });
    const edited = lastUserMessage();
    expect(edited.composer.templateLength).toBe(TEMPLATE.length);
    // and the model payload for the edit run is still clean
    const [editPayload] = window.unchainAPI.startStreamV2.mock.calls[1];
    expect(deepHasKey(editPayload, "composer")).toBe(false);
  });

  test("edit to plain text drops the stale composer (宁删勿 stale, §2铁律)", async () => {
    selectPluginToolkit();
    renderChat();
    await waitForReady();

    // first send: command → carries a composer
    sendText("/plan build the login flow");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(lastUserMessage()?.composer).toBeTruthy());
    streamHandlers.onDone?.({});
    await waitFor(() =>
      expect(screen.queryByTestId("stop-button")).not.toBeInTheDocument(),
    );

    const withComposer = lastUserMessage();
    // edit to plain text — content changes, composer MUST NOT survive stale
    lastChatMessagesProps.onEditMessage(withComposer, "totally different text");

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(lastUserMessage()?.content).toBe("totally different text");
    });
    expect("composer" in lastUserMessage()).toBe(false);
  });

  test("resend keeps the composer (content re-sent identical, §2)", async () => {
    selectPluginToolkit();
    renderChat();
    await waitForReady();

    sendText("/plan build the login flow");
    await waitFor(() =>
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(lastUserMessage()?.composer).toBeTruthy());
    streamHandlers.onDone?.({});
    await waitFor(() =>
      expect(screen.queryByTestId("stop-button")).not.toBeInTheDocument(),
    );

    const sent = lastUserMessage();
    const expandedContent = sent.content;
    lastChatMessagesProps.onResendMessage(sent);

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      const resent = lastUserMessage();
      expect(resent?.content).toBe(expandedContent);
      // content unchanged → composer stays valid and is preserved
      expect(resent?.composer?.rawText).toBe("/plan build the login flow");
    });
    // resend payload also clean
    const [resendPayload] = window.unchainAPI.startStreamV2.mock.calls[1];
    expect(deepHasKey(resendPayload, "composer")).toBe(false);
  });
});
