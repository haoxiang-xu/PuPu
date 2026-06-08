import { useLayoutEffect } from "react";
import { act, renderHook } from "@testing-library/react";
import useMessageWindowScroll, {
  computeLandingTop,
} from "./use_message_window_scroll";

const makeMessages = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `m-${i}`,
    role: "user",
    content: `${i}`,
  }));

const makeScrollHost = () => {
  let scrollHeightReads = 0;
  const host = {
    __scrollHeight: 1000,
    clientHeight: 400,
    scrollTop: 0,
    scrollTo: jest.fn(({ top }) => {
      host.scrollTop = top;
    }),
    get scrollHeight() {
      scrollHeightReads += 1;
      return host.__scrollHeight;
    },
  };

  return {
    host,
    getScrollHeightReads: () => scrollHeightReads,
    resetScrollHeightReads: () => {
      scrollHeightReads = 0;
    },
    setScrollHeight: (value) => {
      host.__scrollHeight = value;
    },
  };
};

const makeBottomSentinel = () => ({
  scrollIntoView: jest.fn(),
});

const useScrollWithHost = (props, host) => {
  const scroll = useMessageWindowScroll(props);
  useLayoutEffect(() => {
    scroll.messagesRef.current = host;
  });
  return scroll;
};

describe("boot visible window", () => {
  const originalIdle = window.requestIdleCallback;
  const originalCancel = window.cancelIdleCallback;
  let idleQueue;

  beforeEach(() => {
    idleQueue = [];
    window.requestIdleCallback = (cb) => {
      idleQueue.push(cb);
      return idleQueue.length;
    };
    window.cancelIdleCallback = () => {};
  });

  afterEach(() => {
    window.requestIdleCallback = originalIdle;
    window.cancelIdleCallback = originalCancel;
  });

  test("on chat switch, starts with boot_visible_count and expands to initial_visible_count via idle", () => {
    const messages = makeMessages(20);
    const { result, rerender } = renderHook(
      ({ chat_id }) =>
        useMessageWindowScroll({
          chat_id,
          messages,
          is_streaming: false,
          initial_visible_count: 12,
          load_batch_size: 6,
          top_load_threshold: 80,
          boot_visible_count: 3,
        }),
      { initialProps: { chat_id: "a" } },
    );

    rerender({ chat_id: "b" });

    expect(result.current.visibleMessages.length).toBe(3);

    act(() => {
      idleQueue.forEach((cb) => cb());
    });

    expect(result.current.visibleMessages.length).toBe(12);
  });

  test("defaults boot_visible_count to initial_visible_count when unset (backward compatible)", () => {
    const messages = makeMessages(20);
    const { result, rerender } = renderHook(
      ({ chat_id }) =>
        useMessageWindowScroll({
          chat_id,
          messages,
          is_streaming: false,
          initial_visible_count: 12,
          load_batch_size: 6,
          top_load_threshold: 80,
        }),
      { initialProps: { chat_id: "a" } },
    );

    rerender({ chat_id: "b" });
    expect(result.current.visibleMessages.length).toBe(12);
  });
});

describe("useMessageWindowScroll", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("follows streaming output on a throttled timer", () => {
    const scrollHost = makeScrollHost();
    const bottomSentinel = makeBottomSentinel();
    const initialMessages = makeMessages(20);
    const { result } = renderHook(
      () =>
        useScrollWithHost(
          {
            chat_id: "chat-streaming",
            messages: initialMessages,
            is_streaming: true,
            initial_visible_count: 12,
            load_batch_size: 6,
            top_load_threshold: 80,
            boot_visible_count: 3,
          },
          scrollHost.host,
        ),
    );
    act(() => {
      result.current.bottomSentinelRef.current = bottomSentinel;
    });

    expect(scrollHost.host.scrollTo).not.toHaveBeenCalled();
    expect(scrollHost.getScrollHeightReads()).toBe(0);
    scrollHost.setScrollHeight(1400);

    act(() => {
      result.current.notifyStreamingContentCommitted();
    });

    expect(scrollHost.host.scrollTo).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(63);
    });
    expect(scrollHost.host.scrollTo).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(bottomSentinel.scrollIntoView).not.toHaveBeenCalled();
    expect(scrollHost.host.scrollTop).toBe(Number.MAX_SAFE_INTEGER);
    expect(scrollHost.host.scrollTo).not.toHaveBeenCalled();
    expect(scrollHost.getScrollHeightReads()).toBe(0);
  });

  it("follows streaming output by clamping the scroll host instead of aligning the sentinel", () => {
    const scrollHost = makeScrollHost();
    const bottomSentinel = makeBottomSentinel();
    const initialMessages = makeMessages(20);
    const { result } = renderHook(
      () =>
        useScrollWithHost(
          {
            chat_id: "chat-streaming",
            messages: initialMessages,
            is_streaming: true,
            initial_visible_count: 12,
            load_batch_size: 6,
            top_load_threshold: 80,
            boot_visible_count: 3,
          },
          scrollHost.host,
        ),
    );
    act(() => {
      result.current.bottomSentinelRef.current = bottomSentinel;
      result.current.notifyStreamingContentCommitted();
    });

    act(() => {
      jest.advanceTimersByTime(64);
    });

    expect(bottomSentinel.scrollIntoView).not.toHaveBeenCalled();
    expect(scrollHost.host.scrollTop).toBe(Number.MAX_SAFE_INTEGER);
    expect(scrollHost.host.scrollTo).not.toHaveBeenCalled();
    expect(scrollHost.getScrollHeightReads()).toBe(0);
  });

  it("keeps following when streaming growth makes the viewport geometrically no longer at bottom", () => {
    const scrollHost = makeScrollHost();
    const initialMessages = makeMessages(20);
    const { result, rerender } = renderHook(
      ({ messages }) =>
        useScrollWithHost(
          {
            chat_id: "chat-streaming",
            messages,
            is_streaming: true,
            initial_visible_count: 12,
            load_batch_size: 6,
            top_load_threshold: 80,
            boot_visible_count: 3,
          },
          scrollHost.host,
        ),
      { initialProps: { messages: initialMessages } },
    );

    act(() => {
      scrollHost.host.scrollTop = 0;
      scrollHost.setScrollHeight(2000);
      result.current.handleScroll();
    });

    scrollHost.host.scrollTo.mockClear();

    rerender({
      messages: [
        ...initialMessages,
        { id: "m-20", role: "assistant", content: "streaming" },
      ],
    });

    act(() => {
      jest.advanceTimersByTime(64);
    });

    expect(scrollHost.host.scrollTop).toBe(Number.MAX_SAFE_INTEGER);
    expect(scrollHost.host.scrollTo).not.toHaveBeenCalled();
  });

  it("keeps following after a non-user scroll event looks like upward movement", () => {
    const scrollHost = makeScrollHost();
    const initialMessages = makeMessages(20);
    const { result, rerender } = renderHook(
      ({ messages }) =>
        useScrollWithHost(
          {
            chat_id: "chat-streaming",
            messages,
            is_streaming: true,
            initial_visible_count: 12,
            load_batch_size: 6,
            top_load_threshold: 80,
            boot_visible_count: 3,
          },
          scrollHost.host,
        ),
      { initialProps: { messages: initialMessages } },
    );

    scrollHost.setScrollHeight(1200);
    act(() => {
      jest.advanceTimersByTime(64);
    });
    scrollHost.host.scrollTo.mockClear();

    act(() => {
      scrollHost.host.scrollTop = 700;
      scrollHost.setScrollHeight(2200);
      result.current.handleScroll();
    });

    rerender({
      messages: [
        ...initialMessages,
        { id: "m-20", role: "assistant", content: "streaming" },
      ],
    });

    act(() => {
      jest.advanceTimersByTime(64);
    });

    expect(scrollHost.host.scrollTop).toBe(Number.MAX_SAFE_INTEGER);
    expect(scrollHost.host.scrollTo).not.toHaveBeenCalled();
  });

  it("does not force-follow streaming output after the user scrolls away", () => {
    const scrollHost = makeScrollHost();
    const initialMessages = makeMessages(20);
    const { result, rerender } = renderHook(
      ({ messages }) =>
        useScrollWithHost(
          {
            chat_id: "chat-streaming",
            messages,
            is_streaming: true,
            initial_visible_count: 12,
            load_batch_size: 6,
            top_load_threshold: 80,
            boot_visible_count: 3,
          },
          scrollHost.host,
        ),
      { initialProps: { messages: initialMessages } },
    );

    scrollHost.setScrollHeight(1200);
    act(() => {
      jest.advanceTimersByTime(64);
    });
    scrollHost.host.scrollTo.mockClear();
    scrollHost.resetScrollHeightReads();

    act(() => {
      result.current.handleUserScrollIntent();
      scrollHost.host.scrollTop = 0;
      scrollHost.setScrollHeight(2000);
      result.current.handleScroll();
    });

    scrollHost.host.scrollTo.mockClear();
    scrollHost.resetScrollHeightReads();

    rerender({
      messages: [
        ...initialMessages,
        { id: "m-20", role: "assistant", content: "streaming" },
      ],
    });

    act(() => {
      jest.advanceTimersByTime(64);
    });
    expect(scrollHost.host.scrollTo).not.toHaveBeenCalled();
  });

  it("scrollToMessageIndex expands the window when target is above it", () => {
    const messages = makeMessages(40);
    const { result } = renderHook(() =>
      useMessageWindowScroll({
        chat_id: "chat-b",
        messages,
        is_streaming: false,
        initial_visible_count: 12,
        load_batch_size: 6,
        top_load_threshold: 80,
        boot_visible_count: 3,
      }),
    );
    // 初始窗口 start = 28;目标 index 2 在窗口外
    act(() => {
      result.current.messagesRef.current = {
        scrollTo: () => {},
        scrollHeight: 1000,
        clientHeight: 400,
        scrollTop: 0,
      };
      result.current.scrollToMessageIndex(2, "auto");
    });
    // 窗口应被展开到 <= 目标(max(0, 2 - load_batch_size) = 0)
    expect(result.current.safeVisibleStart).toBeLessThanOrEqual(2);
  });

  it("scrollToMessageIndex 默认 top 对齐:落到 offsetTop - 12", () => {
    const messages = makeMessages(40);
    const { result } = renderHook(() =>
      useMessageWindowScroll({
        chat_id: "chat-top",
        messages,
        is_streaming: false,
        initial_visible_count: 12,
        load_batch_size: 6,
        top_load_threshold: 80,
        boot_visible_count: 3,
      }),
    );
    // 只捕获第一次 scrollTo 调用:scrollToMessageIndex 同步触发,effects 之后的 scrollToBottom 不计
    let firstCapture = null;
    act(() => {
      result.current.messagesRef.current = {
        scrollTo: (opts) => {
          if (firstCapture === null) firstCapture = opts;
        },
        scrollHeight: 5000,
        clientHeight: 400,
        scrollTop: 0,
      };
      // index 38 落在初始/展开窗口内(boot start=37, final start=28),节点已渲染
      result.current.messageNodeRefs.current.set(38, { offsetTop: 1000 });
      result.current.scrollToMessageIndex(38, "auto");
    });
    expect(firstCapture.top).toBe(988); // 1000 - 12
  });

  it("scrollToMessageIndex center 对齐:落点 = offsetTop + within - 视口高/2", () => {
    const messages = makeMessages(40);
    const { result } = renderHook(() =>
      useMessageWindowScroll({
        chat_id: "chat-center",
        messages,
        is_streaming: false,
        initial_visible_count: 12,
        load_batch_size: 6,
        top_load_threshold: 80,
        boot_visible_count: 3,
      }),
    );
    let firstCapture = null;
    act(() => {
      result.current.messagesRef.current = {
        scrollTo: (opts) => {
          if (firstCapture === null) firstCapture = opts;
        },
        scrollHeight: 5000,
        clientHeight: 400,
        scrollTop: 0,
      };
      result.current.messageNodeRefs.current.set(38, { offsetTop: 1000 });
      result.current.scrollToMessageIndex(38, "auto", { within: 150, align: "center" });
    });
    expect(firstCapture.top).toBe(950); // 1000 + 150 - 200
  });
});

describe("computeLandingTop", () => {
  it("top 对齐:offsetTop 减 12px 顶边距", () => {
    expect(
      computeLandingTop({ offsetTop: 1000, align: "top", viewportHeight: 400 }),
    ).toBe(988);
  });

  it("center 对齐:落点 = offsetTop + within - 视口高/2", () => {
    expect(
      computeLandingTop({
        offsetTop: 1000,
        within: 150,
        align: "center",
        viewportHeight: 400,
      }),
    ).toBe(950); // 1000 + 150 - 200
  });

  it("不为负:贴顶时 clamp 到 0", () => {
    expect(
      computeLandingTop({ offsetTop: 0, within: 0, align: "center", viewportHeight: 400 }),
    ).toBe(0);
  });

  it("缺省参数:within=0, align=top", () => {
    expect(computeLandingTop({ offsetTop: 500 })).toBe(488);
  });
});
