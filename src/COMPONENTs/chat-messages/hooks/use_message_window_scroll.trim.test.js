import { useLayoutEffect } from "react";
import { act, renderHook } from "@testing-library/react";
import useMessageWindowScroll from "./use_message_window_scroll";

const makeMessages = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `m-${i}`,
    role: i % 2 ? "assistant" : "user",
    content: `msg ${i}`,
  }));

// jsdom scroll host with a real clamp on scrollTo (top clamped to
// scrollHeight - clientHeight), matching browser behavior so isAtBottom math holds.
const makeScrollHost = ({ scrollHeight = 4000, clientHeight = 400 } = {}) => {
  const host = {
    __scrollHeight: scrollHeight,
    clientHeight,
    scrollTop: 0,
    scrollTo: jest.fn((opts) => {
      const top = opts && typeof opts.top === "number" ? opts.top : 0;
      host.scrollTop = Math.max(
        0,
        Math.min(top, host.__scrollHeight - host.clientHeight),
      );
    }),
    get scrollHeight() {
      return host.__scrollHeight;
    },
    set scrollHeight(v) {
      host.__scrollHeight = v;
    },
  };
  return host;
};

const useScrollWithHost = (props, host) => {
  const scroll = useMessageWindowScroll(props);
  useLayoutEffect(() => {
    scroll.messagesRef.current = host;
  });
  return scroll;
};

const baseProps = (over = {}) => ({
  chat_id: "chat-trim",
  messages: makeMessages(100),
  is_streaming: false,
  initial_visible_count: 12,
  load_batch_size: 6,
  top_load_threshold: 80,
  boot_visible_count: 3,
  max_mounted_count: 40,
  ...over,
});

// Drive loadOlderMessages via scroll-to-top until the window is fully expanded
// (visibleStart === 0). Each iteration first parks scrollTop high (establishes a
// downward lastScrollTop) then jumps to 0 (an upward scroll into the top threshold).
const expandToTop = (result, host) => {
  for (let i = 0; i < 80; i++) {
    if (result.current.safeVisibleStart === 0) break;
    act(() => {
      host.scrollTop = 200;
      result.current.handleScroll();
    });
    act(() => {
      host.scrollTop = 0;
      result.current.handleScroll();
    });
  }
};

const goToBottom = (result, host) => {
  act(() => {
    host.scrollTop = host.__scrollHeight - host.clientHeight;
    result.current.handleScroll();
  });
};

describe("window trim (max_mounted_count)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test("向上翻页扩窗后回到底部,挂载窗口收缩回上限", () => {
    const host = makeScrollHost();
    const { result } = renderHook(() =>
      useScrollWithHost(baseProps(), host),
    );

    expect(result.current.safeVisibleStart).toBe(88); // 100 - 12

    expandToTop(result, host);
    expect(result.current.safeVisibleStart).toBe(0); // fully mounted (100)

    goToBottom(result, host);
    act(() => {
      jest.advanceTimersByTime(200); // trailing trim debounce
    });

    // 100 - 40 = 60
    expect(result.current.safeVisibleStart).toBe(60);
    expect(result.current.visibleMessages.length).toBe(40);
  });

  test("不贴底(用户在中部阅读)绝不收缩", () => {
    const host = makeScrollHost();
    const { result } = renderHook(() =>
      useScrollWithHost(baseProps(), host),
    );

    expandToTop(result, host);
    expect(result.current.safeVisibleStart).toBe(0);

    // 停在中部(远离底部)
    act(() => {
      host.scrollTop = 1000;
      result.current.handleScroll();
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.safeVisibleStart).toBe(0); // 绝不收缩
    expect(result.current.visibleMessages.length).toBe(100);
  });

  test("收缩下限受 max_mounted_count 约束,不会把窗口缩到比 initial_visible_count 小", () => {
    const host = makeScrollHost();
    // max_mounted_count=5 低于 initial_visible_count(12)+load_batch_size(6)=18 → 抬到 18
    const { result } = renderHook(() =>
      useScrollWithHost(baseProps({ max_mounted_count: 5 }), host),
    );

    expandToTop(result, host);
    expect(result.current.safeVisibleStart).toBe(0);

    goToBottom(result, host);
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // 收缩到下限 18(而非 5),挂载数 >= initial_visible_count
    expect(result.current.visibleMessages.length).toBe(18);
    expect(result.current.visibleMessages.length).toBeGreaterThanOrEqual(12);
    expect(result.current.safeVisibleStart).toBe(82); // 100 - 18
  });

  test("流式 append 且贴底时,挂载数维持在上限而不是单调增长", () => {
    const host = makeScrollHost();
    const { result, rerender } = renderHook(
      ({ messages, is_streaming }) =>
        useScrollWithHost(baseProps({ messages, is_streaming }), host),
      { initialProps: { messages: makeMessages(100), is_streaming: false } },
    );

    // 非流式下把窗口撑满(挂载 100)
    expandToTop(result, host);
    expect(result.current.safeVisibleStart).toBe(0);

    // 用户滚回底部 → 恢复吸底跟随
    goToBottom(result, host);

    // 进入流式,提交内容触发吸底跟随(follow 落地时收缩窗口)
    rerender({ messages: makeMessages(100), is_streaming: true });
    act(() => {
      result.current.notifyStreamingContentCommitted();
    });
    act(() => {
      jest.advanceTimersByTime(64); // streaming bottom-follow fires
    });
    expect(result.current.visibleMessages.length).toBe(40);
    expect(result.current.safeVisibleStart).toBe(60);

    // 再 append 一条并跟随:挂载数仍被上限约束,不单调增长
    rerender({ messages: makeMessages(101), is_streaming: true });
    act(() => {
      result.current.notifyStreamingContentCommitted();
      jest.advanceTimersByTime(64);
    });
    expect(result.current.visibleMessages.length).toBeLessThanOrEqual(40);
  });
});
