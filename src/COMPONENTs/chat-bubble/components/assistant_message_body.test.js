import { act, render, screen } from "@testing-library/react";
import hljs from "highlight.js/lib/common";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { createStreamingMessageStore } from "../../../SERVICEs/streaming_message_store";
import AssistantMessageBody from "./assistant_message_body";
import {
  StreamingMessageStoreContext,
} from "./streaming_message_store_context";

jest.mock("highlight.js/lib/common", () => ({
  getLanguage: jest.fn(),
  highlight: jest.fn(),
  highlightAuto: jest.fn(),
}));

const TEST_THEME = {
  color: "#222",
  font: { fontFamily: "sans-serif" },
  markdown: {},
};

const heavyMarkdown = `# Title\n\n${"Long line for markdown rendering.\n".repeat(500)}`;

const renderAssistantBody = (props) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: TEST_THEME,
        onThemeMode: "light_mode",
      }}
    >
      <AssistantMessageBody {...props} />
    </ConfigContext.Provider>,
  );

const makeRafScheduler = () => {
  const callbacks = [];
  return {
    scheduler: (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancel: (id) => {
      callbacks[id - 1] = null;
    },
    flush: () => {
      const pending = callbacks.splice(0);
      pending.forEach((callback) => {
        if (typeof callback === "function") {
          callback();
        }
      });
    },
  };
};

const renderAssistantBodyWithStreamingStore = ({
  props,
  store,
  chatId = "chat",
  notifyStreamingContentCommitted = jest.fn(),
}) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: TEST_THEME,
        onThemeMode: "light_mode",
      }}
    >
      <StreamingMessageStoreContext.Provider
        value={{
          chatId,
          store,
          notifyStreamingContentCommitted,
        }}
      >
        <AssistantMessageBody {...props} />
      </StreamingMessageStoreContext.Provider>
    </ConfigContext.Provider>,
  );

describe("AssistantMessageBody seamless rendering", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    hljs.getLanguage.mockReturnValue(true);
    hljs.highlight.mockImplementation((code) => ({
      value: String(code)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;"),
    }));
    hljs.highlightAuto.mockImplementation((code) => ({
      value: String(code)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;"),
    }));
    window.requestIdleCallback = (callback) =>
      setTimeout(
        () =>
          callback({
            didTimeout: false,
            timeRemaining: () => 16,
          }),
        1,
      );
    window.cancelIdleCallback = (id) => clearTimeout(id);
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    delete window.requestIdleCallback;
    delete window.cancelIdleCallback;
    jest.clearAllMocks();
  });

  test("uses lightweight rendering during streaming and upgrades after completion", () => {
    const { rerender } = renderAssistantBody({
      message: {
        id: "assistant-1",
        role: "assistant",
        status: "streaming",
        content: heavyMarkdown,
      },
      isRawTextMode: false,
      theme: TEST_THEME,
      hasTraceFrames: false,
    });

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(
      document.querySelector("[data-streaming-plain-text]"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-streaming-plain-text]").textContent,
    ).toContain("Long line for markdown rendering");

    rerender(
      <ConfigContext.Provider
        value={{
          theme: TEST_THEME,
          onThemeMode: "light_mode",
        }}
      >
        <AssistantMessageBody
          message={{
            id: "assistant-1",
            role: "assistant",
            status: "done",
            content: heavyMarkdown,
          }}
          isRawTextMode={false}
          theme={TEST_THEME}
          hasTraceFrames={false}
        />
      </ConfigContext.Provider>,
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
  });

  test("keeps raw text mode behavior unchanged", () => {
    const { container } = renderAssistantBody({
      message: {
        id: "assistant-raw",
        role: "assistant",
        status: "done",
        content: heavyMarkdown,
      },
      isRawTextMode: true,
      theme: TEST_THEME,
      hasTraceFrames: false,
    });

    expect(container.querySelector("pre")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Title" })).not.toBeInTheDocument();
    expect(screen.getByText(/# Title/)).toBeInTheDocument();
  });

  test("renders raw html documents as fenced code instead of mounting document tags", () => {
    const htmlDocumentMarkdown = `下面是一款纯前端页面：

<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <title>Demo</title>
  </head>
  <body>
    <main>Hello world</main>
  </body>
</html>`;

    const { container } = renderAssistantBody({
      message: {
        id: "assistant-html",
        role: "assistant",
        status: "done",
        content: htmlDocumentMarkdown,
      },
      isRawTextMode: false,
      theme: TEST_THEME,
      hasTraceFrames: false,
    });

    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(screen.getByText("下面是一款纯前端页面：")).toBeInTheDocument();
    expect(screen.getByText(/<!DOCTYPE html>/)).toBeInTheDocument();
    expect(container.querySelector("code.hljs")).toBeInTheDocument();
    expect(
      container.querySelector("[data-markdown-id] meta"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-markdown-id] html"),
    ).not.toBeInTheDocument();
  });

  test("keeps streaming html code fences as plain text before the closing fence arrives", () => {
    const partialHtmlDocumentMarkdown = `下面给你一个**纯前端页面**：

\`\`\`html
<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <title>Demo</title>
  </head>`;

    const { container } = renderAssistantBody({
      message: {
        id: "assistant-streaming-html",
        role: "assistant",
        status: "streaming",
        content: partialHtmlDocumentMarkdown,
      },
      isRawTextMode: false,
      theme: TEST_THEME,
      hasTraceFrames: false,
    });

    expect(screen.getByText(/下面给你一个/)).toBeInTheDocument();
    expect(screen.getByText(/<!DOCTYPE html>/)).toBeInTheDocument();
    expect(container.querySelector("code.hljs")).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-streaming-plain-text]"),
    ).toBeInTheDocument();
    expect(
      container.querySelector("[data-markdown-id] meta"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-markdown-id] html"),
    ).not.toBeInTheDocument();
  });

  test("renders streaming chunks even when message.content is kept empty", () => {
    const { container } = renderAssistantBody({
      message: {
        id: "assistant-streaming-chunks",
        role: "assistant",
        status: "streaming",
        content: "",
        streamingChunks: ["Hello", ", world"],
      },
      isRawTextMode: false,
      theme: TEST_THEME,
      hasTraceFrames: false,
    });

    expect(container.textContent).toBe("Hello, world");
    expect(
      container.querySelector("[data-streaming-plain-text]"),
    ).toBeInTheDocument();
    expect(container.querySelector(".mini-ui-cell-split")).not.toBeInTheDocument();
  });

  test("renders external streaming store text without receiving a new message object", () => {
    const raf = makeRafScheduler();
    const store = createStreamingMessageStore({
      notifyScheduler: raf.scheduler,
      cancelScheduler: raf.cancel,
    });
    const notifyStreamingContentCommitted = jest.fn();
    const message = {
      id: "assistant-store",
      role: "assistant",
      status: "streaming",
      content: "",
    };
    store.begin({ chatId: "chat", messageId: message.id });

    const { container } = renderAssistantBodyWithStreamingStore({
      store,
      notifyStreamingContentCommitted,
      props: {
        message,
        isRawTextMode: false,
        theme: TEST_THEME,
        hasTraceFrames: false,
      },
    });

    expect(container.querySelector(".mini-ui-cell-split")).toBeInTheDocument();

    store.append({
      chatId: "chat",
      messageId: message.id,
      delta: "Hello from store",
    });
    act(() => {
      raf.flush();
    });

    expect(container.textContent).toContain("Hello from store");
    expect(container.querySelector(".mini-ui-cell-split")).not.toBeInTheDocument();
    expect(notifyStreamingContentCommitted).toHaveBeenCalled();
  });
});
