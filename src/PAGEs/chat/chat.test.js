import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ChatInterface from "./chat";
import { getChatsStore, openCharacterChat, setChatModel } from "../../SERVICEs/chat_storage";
import { readTokenUsageRecords } from "../../COMPONENTs/settings/token_usage/storage";

let lastChatMessagesProps = null;
let lastChatInputProps = null;

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
    const { value, onChange, onSend, onStop, isStreaming } = props;
    return (
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
    );
  },
}));

describe("ChatInterface stop flow", () => {
  let cancelSpy;
  let consoleErrorSpy;
  let streamHandlers;

  beforeEach(() => {
    window.localStorage.clear();
    lastChatMessagesProps = null;
    lastChatInputProps = null;
    cancelSpy = jest.fn();
    streamHandlers = null;
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    window.unchainAPI = {
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
      replaceSessionMemory: jest.fn(async () => ({ applied: true })),
      buildCharacterAgentConfig: jest.fn(async () => ({
        session_id: "character_nico__dm__main",
        run_memory_namespace: "character_nico__rel__local_user",
        default_model: "openai:gpt-4.1",
        instructions: "You are Nico.",
        decision: { action: "reply", courtesy_message: null },
      })),
      cancelStream: jest.fn(),
      respondToolConfirmation: jest.fn(async () => ({ status: "ok" })),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.unchainAPI;
  });

  const renderChat = () =>
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

  const waitForReady = async () => {
    await waitFor(() => {
      expect(window.unchainAPI.getStatus).toHaveBeenCalled();
    });
  };

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

      await waitFor(() => {
        expect(getAssistantMessage()?.content || "").toBe("");
      });

      act(() => {
        const callbacks = Array.from(rafCallbacks.values());
        rafCallbacks.clear();
        callbacks.forEach((callback) => callback(16));
      });

      await waitFor(() => {
        expect(getAssistantMessage()?.content).toBe("Hello");
        expect(getAssistantMessage()?.status).toBe("streaming");
      });

      streamHandlers.onToken(" world");
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
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
