import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";
import ChatInterface from "./chat";
import {
  getChatsStore,
  openCharacterChat,
  setChatModel,
  setChatSelectedToolkits,
} from "../../SERVICEs/chat_storage";
import { readTokenUsageRecords } from "../../COMPONENTs/settings/token_usage/storage";

let lastChatMessagesProps = null;
let lastChatInputProps = null;
var mockScopedLogger;

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

  beforeEach(() => {
    window.localStorage.clear();
    lastChatMessagesProps = null;
    lastChatInputProps = null;
    cancelSpy = jest.fn();
    streamHandlers = null;
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockScopedLogger.log.mockClear();
    mockScopedLogger.warn.mockClear();
    mockScopedLogger.error.mockClear();
    mockScopedLogger.debug.mockClear();
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
        <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
          <ChatInterface />
        </LocaleContext.Provider>
      </ConfigContext.Provider>,
    );

  const waitForReady = async () => {
    await waitFor(() => {
      expect(window.unchainAPI.getStatus).toHaveBeenCalled();
      expect(window.unchainAPI.getModelCatalog).toHaveBeenCalled();
      expect(lastChatInputProps?.sendDisabled).toBe(false);
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

  test("auto-approves only toolkit-scoped tool matches", async () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 2,
        toolkits: ["code_toolkit"],
        tools: ["code_toolkit:write"],
      }),
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
        approved: true,
        reason: "",
      });
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
      expect(window.unchainAPI.respondToolConfirmation).toHaveBeenCalledTimes(1);
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
        expect(getAssistantMessage()?.content).toBe("parent output");
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
