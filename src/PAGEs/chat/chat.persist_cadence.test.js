// T4(B 批性能):流式 lull-persist 节奏 250ms → 2000ms(对齐 background persister)。
// 归因证据:chat.js 消息持久化 effect(delay = streamIsStreaming ? 250 : 0)在流式
// 中凡有 ≥250ms token 间歇就整库写一次(实测 48–68ms 长任务 ×3/流)。
// 契约:流式期间 ≥2s 才落盘一次;done 边沿仍即时(finalizeStreamPersist 同步路径);
// 非流式 delay=0 行为不变。崩溃丢失窗口 2s,与后台会话持久化节奏一致。

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  LocaleContext,
  NavigationContext,
  ThemeContext,
} from "../../CONTAINERs/config/context";
import ChatInterface from "./chat";
import { getChatsStore } from "../../SERVICEs/chat_storage";

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
    return <div data-testid="chat-messages" />;
  },
}));

jest.mock("../../COMPONENTs/chat-input/chat_input", () => ({
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
        <button data-testid="send-button" onClick={onSend} disabled={sendDisabled}>
          Send
        </button>
      </div>
    );
  },
}));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("ChatInterface streaming persist cadence (T4)", () => {
  let streamHandlers;

  beforeEach(() => {
    window.localStorage.clear();
    lastChatMessagesProps = null;
    lastChatInputProps = null;
    streamHandlers = null;
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
      cancelStream: jest.fn(),
      respondToolConfirmation: jest.fn(async () => ({ status: "ok" })),
    };
  });

  afterEach(() => {
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
      expect(lastChatInputProps?.sendDisabled).toBe(false);
    });
  };

  const persistedAssistantContents = () => {
    const store = getChatsStore();
    const chats = Object.values(store.chatsById || {});
    return chats.flatMap((chat) =>
      (chat.messages || [])
        .filter((message) => message.role === "assistant")
        .map((message) => message.content || ""),
    );
  };

  test("流式期间 ≥2s 才落盘;done 边沿经 finalize 即时落盘;最终内容完整", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
      expect(streamHandlers).toBeTruthy();
    });

    // 推一个 token,随后进入 lull(不再有内容变化)
    await act(async () => {
      streamHandlers.onToken("partial answer chunk");
      await sleep(120); // 让 64ms 批 flush 把内容提交进 session.messages
    });

    // t≈0.5s:旧节奏(250ms)此时已把流式中间态整库写盘 → 断言"未落盘"在 T4 前红灯
    await act(async () => {
      await sleep(400);
    });
    expect(
      persistedAssistantContents().some((content) =>
        content.includes("partial answer chunk"),
      ),
    ).toBe(false);

    // t≈2.7s:新节奏(2000ms)到期,lull-persist 应已落盘(节奏保留,不是彻底不写)
    await act(async () => {
      await sleep(2200);
    });
    expect(
      persistedAssistantContents().some((content) =>
        content.includes("partial answer chunk"),
      ),
    ).toBe(true);

    // done 边沿:finalize 同步落盘,不等任何防抖窗口
    act(() => {
      streamHandlers.onFrame({
        seq: 2,
        ts: Date.now(),
        type: "final_message",
        payload: { content: "the complete final answer" },
      });
      streamHandlers.onDone({});
    });
    await waitFor(() => {
      expect(
        persistedAssistantContents().some(
          (content) => content === "the complete final answer",
        ),
      ).toBe(true);
    });
  }, 15000);

  test("非流式路径:消息变化 delay=0 即时落盘(行为不变)", async () => {
    renderChat();
    await waitForReady();

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "quick turn" },
    });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => {
      expect(streamHandlers).toBeTruthy();
    });

    act(() => {
      streamHandlers.onFrame({
        seq: 1,
        ts: Date.now(),
        type: "final_message",
        payload: { content: "instant done" },
      });
      streamHandlers.onDone({});
    });

    // done 后(非流式,delay=0)很快落盘 —— 不需要等 2s
    await waitFor(() => {
      expect(
        persistedAssistantContents().some(
          (content) => content === "instant done",
        ),
      ).toBe(true);
    });

    const store = getChatsStore();
    const chat = Object.values(store.chatsById || {}).find((c) =>
      (c.messages || []).some((m) => m.content === "instant done"),
    );
    expect(chat).toBeDefined();
    const assistant = chat.messages.find((m) => m.content === "instant done");
    expect(assistant.status).toBe("done");
  });
});
