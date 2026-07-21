/**
 * Composer-send expansion of plugin skill commands (Part 3, Task 3).
 *
 * use_chat_stream.js is too heavy to renderHook directly (see
 * use_chat_stream.interject_channel.test.js) — instead we mount the real
 * ChatInterface page (same harness as chat.test.js), which wires the real
 * useChatStream hook end to end. A plugin skill command is registered
 * exactly the way plugin_skill_sync.js / chat_input.test.js do it, gated on
 * selectedToolkits, and we assert on the outgoing user message content
 * (rendered by the mocked ChatMessages component) plus, for the interject
 * regression, on the payload handed to window.unchainAPI.interject.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  LocaleContext,
  NavigationContext,
  ThemeContext,
} from "../../../CONTAINERs/config/context";
import ChatInterface from "../chat";
import { getChatsStore, setChatSelectedToolkits } from "../../../SERVICEs/chat_storage";
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
const SELECTED_TEMPLATE = "Use the toolkit selected when edit started";

describe("composer-send expansion of plugin skill commands", () => {
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
          cancel: jest.fn(),
        };
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

    // Mirrors plugin_skill_sync's registration: phase-gated only. An
    // installed plugin's skill is always usable from the composer; using it
    // selects the plugin for that single run via sourceToolkitId.
    registerCommand({
      name: "/plan",
      description: "Plan the task",
      source: PLUGIN_SOURCE,
      sourceLabel: "Plankit",
      sourceToolkitId: PLUGIN_TOOLKIT_ID,
      expandsTo: TEMPLATE,
      availability: (ctx) => ctx.phase === "composer",
    });
    registerCommand({
      name: "/selected-plan",
      description: "Plan with the selected toolkit",
      source: PLUGIN_SOURCE,
      sourceLabel: "Plankit",
      sourceToolkitId: PLUGIN_TOOLKIT_ID,
      expandsTo: SELECTED_TEMPLATE,
      availability: (ctx) =>
        ctx.phase === "composer" &&
        ctx.selectedToolkits.includes(PLUGIN_TOOLKIT_ID),
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

  test("expands the skill token into the message body when its toolkit is selected", async () => {
    const seeded = getChatsStore();
    setChatSelectedToolkits(seeded.activeChatId, [PLUGIN_TOOLKIT_ID], {
      source: "test",
    });

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/plan build the login flow" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(lastUserMessage()?.content).toBe(
        `${TEMPLATE}\n\nbuild the login flow`,
      );
    });
  });

  test("unselected toolkit: still expands, and the plugin rides THIS run's payload only", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/plan build something" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    // expansion no longer requires selection
    await waitFor(() => {
      expect(lastUserMessage()?.content).toBe(
        `${TEMPLATE}\n\nbuild something`,
      );
    });

    // the run's payload carries the owning plugin (ephemeral selection) on
    // top of whatever the session already had selected (e.g. default "core")
    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.toolkits).toContain(PLUGIN_TOOLKIT_ID);

    // ...but the session's stored selection was NOT touched
    const store = getChatsStore();
    const chat = store.chatsById?.[store.activeChatId];
    expect(chat?.selectedToolkits || []).not.toContain(PLUGIN_TOOLKIT_ID);
  });

  test("ephemeral selection reverts on the next turn (no command → no toolkit in payload)", async () => {
    renderChat();
    await waitForReady();

    // turn 1: command from an unselected plugin
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/plan build something" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    expect(
      window.unchainAPI.startStreamV2.mock.calls[0][0].options.toolkits,
    ).toContain(PLUGIN_TOOLKIT_ID);

    // finish turn 1
    streamHandlers.onDone?.({});
    await waitFor(() => {
      expect(screen.queryByTestId("stop-button")).not.toBeInTheDocument();
    });

    // turn 2: plain text — the plugin must NOT ride along anymore
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "plain follow-up" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    });
    const [secondPayload] = window.unchainAPI.startStreamV2.mock.calls[1];
    expect(secondPayload.options.toolkits || []).not.toContain(
      PLUGIN_TOOLKIT_ID,
    );
  });

  test("expands to exactly the template when the message is only the skill token", async () => {
    const seeded = getChatsStore();
    setChatSelectedToolkits(seeded.activeChatId, [PLUGIN_TOOLKIT_ID], {
      source: "test",
    });

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/plan" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(lastUserMessage()?.content).toBe(TEMPLATE);
    });
  });

  test("edit expansion uses the toolkit selection captured before async preflight", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ memory: { enabled: true } }),
    );
    const seeded = getChatsStore();
    setChatSelectedToolkits(seeded.activeChatId, [PLUGIN_TOOLKIT_ID], {
      source: "test",
    });

    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "original edit target" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });
    act(() => {
      streamHandlers.onDone?.({});
    });
    await waitFor(() => {
      expect(screen.queryByTestId("stop-button")).not.toBeInTheDocument();
    });

    let resolveMemoryReplacement;
    const memoryReplacement = new Promise((resolve) => {
      resolveMemoryReplacement = resolve;
    });
    window.unchainAPI.replaceSessionMemory.mockImplementationOnce(
      () => memoryReplacement,
    );
    const originalMessage = lastUserMessage();
    let editPromise;
    act(() => {
      editPromise = lastChatMessagesProps.onEditMessage(
        originalMessage,
        "/selected-plan update this",
      );
    });
    await waitFor(() => {
      expect(window.unchainAPI.replaceSessionMemory).toHaveBeenCalledTimes(1);
    });

    act(() => {
      lastChatInputProps.onToolkitsChange([]);
    });
    await act(async () => {
      resolveMemoryReplacement({ applied: true });
      await memoryReplacement;
      await editPromise;
    });

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
    });
    const [editPayload] = window.unchainAPI.startStreamV2.mock.calls[1];
    expect(editPayload.message).toBe(`${SELECTED_TEMPLATE}\n\nupdate this`);
    expect(editPayload.options.toolkits).toContain(PLUGIN_TOOLKIT_ID);
  });

  test("an active stream routes the send to interject with the ORIGINAL unexpanded text", async () => {
    const seeded = getChatsStore();
    setChatSelectedToolkits(seeded.activeChatId, [PLUGIN_TOOLKIT_ID], {
      source: "test",
    });

    renderChat();
    await waitForReady();

    // First turn — leave the stream active (never resolve onDone).
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "first message" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(streamHandlers).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByTestId("stop-button")).toBeInTheDocument();
    });

    // Second send while the chat's run is still active must redirect to the
    // interject channel with the raw, un-expanded text — the skill token
    // rides through as plain text since composer skills are unavailable in
    // the streaming-phase ctx that handleInterject uses.
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "/plan build something else" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.unchainAPI.interject).toHaveBeenCalledTimes(1);
    });

    const [interjectPayload] = window.unchainAPI.interject.mock.calls[0];
    expect(interjectPayload.text).toBe("/plan build something else");
    // No second new-turn send happened — the run was never re-entered.
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
  });
});
