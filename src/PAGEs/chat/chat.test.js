import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ChatInterface from "./chat";
import { getChatsStore } from "../../SERVICEs/chat_storage";

let lastChatMessagesProps = null;

jest.mock("../../COMPONENTs/chat-messages/chat_messages", () => ({
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

jest.mock("../../COMPONENTs/chat-input/chat_input", () => ({
  __esModule: true,
  default: ({ value, onChange, onSend, onStop, isStreaming }) => (
    <div>
      <input
        data-testid="chat-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button data-testid="send-button" onClick={onSend}>
        Send
      </button>
      {isStreaming ? (
        <button data-testid="stop-button" onClick={onStop}>
          Stop
        </button>
      ) : null}
    </div>
  ),
}));

describe("ChatInterface stop flow", () => {
  let cancelSpy;
  let consoleErrorSpy;
  let streamHandlers;

  beforeEach(() => {
    window.localStorage.clear();
    lastChatMessagesProps = null;
    cancelSpy = jest.fn();
    streamHandlers = null;
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    window.misoAPI = {
      getStatus: jest.fn(async () => ({
        status: "ready",
        ready: true,
        url: "http://localhost:3000",
        reason: "",
      })),
      getModelCatalog: jest.fn(async () => ({
        activeModel: null,
        providers: {},
        model_capabilities: {},
      })),
      startStream: jest.fn(),
      startStreamV2: jest.fn((_payload, handlers = {}) => {
        streamHandlers = handlers;
        return {
          cancel: cancelSpy,
        };
      }),
      cancelStream: jest.fn(),
      respondToolConfirmation: jest.fn(async () => ({ status: "ok" })),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.misoAPI;
  });

  test("stopping a stream removes empty assistant placeholders without render-phase warnings", async () => {
    render(
      <ConfigContext.Provider
        value={{
          theme: {},
          onFragment: "main",
          onThemeMode: "light_mode",
        }}
      >
        <ChatInterface />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(window.misoAPI.getStatus).toHaveBeenCalled();
    });

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

  test("records a synthetic confirmation decision as soon as approval is accepted", async () => {
    render(
      <ConfigContext.Provider
        value={{
          theme: {},
          onFragment: "main",
          onThemeMode: "light_mode",
        }}
      >
        <ChatInterface />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(window.misoAPI.getStatus).toHaveBeenCalled();
    });

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
      type: "tool_confirmation_request",
      payload: {
        call_id: "call-1",
        confirmation_id: "confirm-1",
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

    expect(window.misoAPI.respondToolConfirmation).toHaveBeenCalledWith({
      confirmation_id: "confirm-1",
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

  test("retries once with history when memory is unavailable", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        memory: {
          enabled: true,
        },
      }),
    );

    render(
      <ConfigContext.Provider
        value={{
          theme: {},
          onFragment: "main",
          onThemeMode: "light_mode",
        }}
      >
        <ChatInterface />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(window.misoAPI.getStatus).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Memory fallback test" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(window.misoAPI.startStreamV2).toHaveBeenCalledTimes(1);
    });

    const [firstPayload] = window.misoAPI.startStreamV2.mock.calls[0];
    expect(firstPayload.history).toEqual([]);

    streamHandlers.onError({
      code: "memory_unavailable",
      message: "Memory is unavailable for this request",
    });

    await waitFor(() => {
      expect(window.misoAPI.startStreamV2).toHaveBeenCalledTimes(2);
    });

    const [secondPayload] = window.misoAPI.startStreamV2.mock.calls[1];
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
});
