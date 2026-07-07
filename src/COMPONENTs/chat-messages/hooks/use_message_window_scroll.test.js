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

  test("boot expand pins the bottom in the layoutEffect (auto) via prepend compensation, not a post-paint smooth", () => {
    const scrollHost = makeScrollHost();
    scrollHost.setScrollHeight(2000);
    scrollHost.host.scrollTop = 1600;
    const messages = makeMessages(20);
    const { rerender } = renderHook(
      ({ chat_id }) =>
        useScrollWithHost(
          {
            chat_id,
            messages,
            is_streaming: false,
            initial_visible_count: 12,
            load_batch_size: 6,
            top_load_threshold: 80,
            boot_visible_count: 3,
          },
          scrollHost.host,
        ),
      { initialProps: { chat_id: "a" } },
    );

    // 切会话 → boot 3 条,expand 排入 idle 队列
    rerender({ chat_id: "b" });
    scrollHost.host.scrollTo.mockClear();

    // idle 触发 expandToFinal:应在 setVisibleStartIndex 前设 prependCompensation,
    // 让 layoutEffect 补偿路径在 paint 前用 "auto" 钉底,而不是留给 post-paint smooth。
    act(() => {
      idleQueue.forEach((cb) => cb());
    });

    const calls = scrollHost.host.scrollTo.mock.calls.map(([opts]) => opts);
    // layoutEffect 补偿路径的 auto 钉底必须发生
    expect(calls.some((o) => o && o.behavior === "auto")).toBe(true);
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
            /* 这些用例验证吸底跟随语义;上限给大,避免窗口收缩介入
               重新钉底路径干扰断言(收缩行为由 .trim.test.js 专门覆盖) */
            max_mounted_count: 100,
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
            /* 这些用例验证吸底跟随语义;上限给大,避免窗口收缩介入
               重新钉底路径干扰断言(收缩行为由 .trim.test.js 专门覆盖) */
            max_mounted_count: 100,
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
            /* 这些用例验证吸底跟随语义;上限给大,避免窗口收缩介入
               重新钉底路径干扰断言(收缩行为由 .trim.test.js 专门覆盖) */
            max_mounted_count: 100,
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

  it("scrollToMessageIndex does not bottom-follow after expanding from the bottom", () => {
    const scrollHost = makeScrollHost();
    scrollHost.setScrollHeight(2000);
    scrollHost.host.scrollTop = 1600;
    const messages = makeMessages(40);
    const { result } = renderHook(() =>
      useScrollWithHost(
        {
          chat_id: "chat-explicit-jump",
          messages,
          is_streaming: false,
          initial_visible_count: 12,
          load_batch_size: 6,
          top_load_threshold: 80,
          boot_visible_count: 3,
        },
        scrollHost.host,
      ),
    );
    scrollHost.host.scrollTo.mockClear();

    act(() => {
      result.current.messageNodeRefs.current.set(2, { offsetTop: 500 });
      result.current.scrollToMessageIndex(2, "auto");
    });

    const calls = scrollHost.host.scrollTo.mock.calls.map(([opts]) => opts);
    expect(calls).toEqual([{ top: 488, behavior: "auto" }]);
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

  it("scrollToMessageIndex center 对齐 uses the effective viewport after bottom inset", () => {
    const messages = makeMessages(40);
    const { result } = renderHook(() =>
      useMessageWindowScroll({
        chat_id: "chat-center-inset",
        messages,
        is_streaming: false,
        initial_visible_count: 12,
        load_batch_size: 6,
        top_load_threshold: 80,
        boot_visible_count: 3,
        bottom_viewport_inset: 32,
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
    expect(firstCapture.top).toBe(966); // 1000 + 150 - ((400 - 32) / 2)
  });

  it("scrollToMessageIndex re-aligns when lazy layout shifts the target", () => {
    const scrollHost = makeScrollHost();
    scrollHost.setScrollHeight(2600);
    const messages = makeMessages(40);
    const { result } = renderHook(() =>
      useScrollWithHost(
        {
          chat_id: "chat-lazy-layout",
          messages,
          is_streaming: false,
          initial_visible_count: 12,
          load_batch_size: 6,
          top_load_threshold: 80,
          boot_visible_count: 3,
        },
        scrollHost.host,
      ),
    );
    scrollHost.host.scrollTo.mockClear();

    const targetNode = { offsetTop: 1000 };
    act(() => {
      result.current.messageNodeRefs.current.set(38, targetNode);
      result.current.scrollToMessageIndex(38, "auto");
    });
    expect(scrollHost.host.scrollTo).toHaveBeenLastCalledWith({
      top: 988,
      behavior: "auto",
    });

    act(() => {
      targetNode.offsetTop = 1160;
      jest.advanceTimersByTime(50);
    });

    expect(scrollHost.host.scrollTo).toHaveBeenLastCalledWith({
      top: 1148,
      behavior: "auto",
    });
  });

  it("re-aligns when ResizeObserver reports a late target layout shift", () => {
    const OriginalResizeObserver = global.ResizeObserver;
    const resizeObservers = [];
    global.ResizeObserver = class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
        this.observe = jest.fn();
        this.disconnect = jest.fn();
        resizeObservers.push(this);
      }
      trigger() {
        this.callback([]);
      }
    };
    window.ResizeObserver = global.ResizeObserver;

    const scrollHost = makeScrollHost();
    scrollHost.setScrollHeight(2600);
    const messages = makeMessages(40);
    const { result } = renderHook(() =>
      useScrollWithHost(
        {
          chat_id: "chat-late-layout",
          messages,
          is_streaming: false,
          initial_visible_count: 12,
          load_batch_size: 6,
          top_load_threshold: 80,
          boot_visible_count: 3,
        },
        scrollHost.host,
      ),
    );
    scrollHost.host.scrollTo.mockClear();

    const targetNode = { offsetTop: 1000 };
    act(() => {
      result.current.messageNodeRefs.current.set(38, targetNode);
      result.current.scrollToMessageIndex(38, "auto");
    });

    expect(resizeObservers).toHaveLength(1);

    act(() => {
      targetNode.offsetTop = 1160;
      resizeObservers[0].trigger();
    });

    expect(scrollHost.host.scrollTo).toHaveBeenLastCalledWith({
      top: 1148,
      behavior: "auto",
    });

    global.ResizeObserver = OriginalResizeObserver;
    window.ResizeObserver = OriginalResizeObserver;
  });

  it("a genuine user scroll cancels an in-flight landing correction (no re-land teleport)", () => {
    const OriginalResizeObserver = global.ResizeObserver;
    const resizeObservers = [];
    global.ResizeObserver = class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
        this.observe = jest.fn();
        this.disconnect = jest.fn();
        resizeObservers.push(this);
      }
      trigger() {
        this.callback([]);
      }
    };
    window.ResizeObserver = global.ResizeObserver;

    const scrollHost = makeScrollHost();
    scrollHost.setScrollHeight(2600);
    const messages = makeMessages(40);
    const { result } = renderHook(() =>
      useScrollWithHost(
        {
          chat_id: "chat-user-scroll-cancels-landing",
          messages,
          is_streaming: false,
          initial_visible_count: 12,
          load_batch_size: 6,
          top_load_threshold: 80,
          boot_visible_count: 3,
        },
        scrollHost.host,
      ),
    );

    // 挂载时 effect 会 scrollToBottom("auto") 钉底(一次程序性写)。真实浏览器里它派发的
    // scroll 事件会被 handleScroll 当程序性消费;测试环境不自动派发,先手动排掉,让计数归零。
    act(() => {
      result.current.handleScroll();
    });

    // 显式跳转武装 landing correction(settle:true),落点 offsetTop-12 = 988;
    // 跳转自身又是一次程序性写。
    const targetNode = { offsetTop: 1000 };
    act(() => {
      result.current.messageNodeRefs.current.set(38, targetNode);
      result.current.scrollToMessageIndex(38, "auto");
    });

    // 排掉跳转那次程序性写的 scroll 回声(模拟真实时序:该事件被当程序性消费,不清 landing)。
    act(() => {
      result.current.handleScroll();
    });

    scrollHost.host.scrollTo.mockClear();

    // 现在是一次真正的用户上滚(非程序性,programmaticScrollDepth 已归零):用户已接管视口,
    // 在飞的 landing correction 必须被取消。
    scrollHost.host.scrollTop = 400;
    act(() => {
      result.current.handleScroll();
    });

    // 之后目标因异步布局(prepend / 懒渲染 settle)下移,landing ResizeObserver 触发、
    // 结算定时器到点——绝不能再有 scrollTo 把视口一跳拽回旧跳转目标(即用户观察到的瞬移)。
    scrollHost.host.scrollTo.mockClear();
    act(() => {
      targetNode.offsetTop = 1160;
      resizeObservers[0].trigger();
      jest.advanceTimersByTime(50);
    });

    expect(scrollHost.host.scrollTo).not.toHaveBeenCalled();

    global.ResizeObserver = OriginalResizeObserver;
    window.ResizeObserver = OriginalResizeObserver;
  });
});

describe("streaming keep-at-bottom stability (ChatGPT-style)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  const streamingProps = (host, over = {}) => ({
    chat_id: "chat-stream",
    messages: makeMessages(20),
    is_streaming: true,
    initial_visible_count: 12,
    load_batch_size: 6,
    top_load_threshold: 80,
    boot_visible_count: 3,
    ...over,
  });

  it("wheel-up during streaming detaches follow immediately and cancels the pending bottom-follow", () => {
    const scrollHost = makeScrollHost();
    const { result } = renderHook(() =>
      useScrollWithHost(streamingProps(scrollHost.host), scrollHost.host),
    );

    act(() => {
      result.current.notifyStreamingContentCommitted();
    });

    // 用户在吸底 rAF 落地前上滚 → wheel 处理器应立即关跟随 + 取消 pending
    act(() => {
      result.current.handleWheel({ deltaY: -20 });
    });

    scrollHost.host.scrollTop = 300;
    act(() => {
      jest.advanceTimersByTime(64);
    });
    // 被取消,不再吸底
    expect(scrollHost.host.scrollTop).toBe(300);

    // 关跟随后,后续 chunk 提交也不再吸底
    act(() => {
      result.current.notifyStreamingContentCommitted();
      jest.advanceTimersByTime(64);
    });
    expect(scrollHost.host.scrollTop).toBe(300);
  });

  it("a programmatic bottom-pin scroll event does not clear user intent or reopen follow", () => {
    const scrollHost = makeScrollHost();
    const { result } = renderHook(() =>
      useScrollWithHost(streamingProps(scrollHost.host), scrollHost.host),
    );

    // mount 调度的吸底 rAF 落地:scrollTop → MAX(这是一次程序性写)
    act(() => {
      jest.advanceTimersByTime(64);
    });
    expect(scrollHost.host.scrollTop).toBe(Number.MAX_SAFE_INTEGER);

    // 用户上滚脱离(DOM 位置还没来得及更新,仍在底部)
    act(() => {
      result.current.handleWheel({ deltaY: -30 });
    });

    // 迟到的程序性吸底 scroll 事件到达(位置仍在底部)→ 必须被当作程序性忽略,
    // 不能因"落在底部阈值内"就重开跟随
    act(() => {
      result.current.handleScroll();
    });

    // 跟随必须保持关闭:换到较高位置再提交 → 不吸底
    scrollHost.host.scrollTop = 350;
    act(() => {
      result.current.notifyStreamingContentCommitted();
      jest.advanceTimersByTime(64);
    });
    expect(scrollHost.host.scrollTop).toBe(350);
  });

  it("scrolling back to the bottom (user-driven) re-enables streaming follow", () => {
    const scrollHost = makeScrollHost(); // scrollHeight 1000, clientHeight 400
    const { result } = renderHook(() =>
      useScrollWithHost(streamingProps(scrollHost.host), scrollHost.host),
    );

    act(() => {
      jest.advanceTimersByTime(64); // 吸底 pin,scrollTop → MAX
    });

    act(() => {
      result.current.handleWheel({ deltaY: -10 }); // 脱离
    });
    act(() => {
      result.current.handleScroll(); // 消费迟到的程序性 pin 事件(scrollTop 仍 MAX)
    });

    // 用户主动滚回底部(distance = 1000 - (600 + 400) = 0 → 在阈值内)
    scrollHost.host.scrollTop = 600;
    act(() => {
      result.current.handleScroll();
    });

    // 跟随恢复:再提交一次 → 吸底
    scrollHost.host.scrollTop = 500;
    act(() => {
      result.current.notifyStreamingContentCommitted();
      jest.advanceTimersByTime(64);
    });
    expect(scrollHost.host.scrollTop).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("scrollToBottom records the real clamped scrollTop so later downward scrolls are not misread as up", () => {
    // scrollTo 会把 top clamp 到 scrollHeight-clientHeight(真实 DOM 行为)
    const host = {
      __scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 600, // 已在 clamp 后的底部
      scrollTo: jest.fn(({ top }) => {
        host.scrollTop = Math.min(top, host.__scrollHeight - host.clientHeight);
      }),
      get scrollHeight() {
        return host.__scrollHeight;
      },
    };
    const messages = makeMessages(20);
    const { result, rerender } = renderHook(
      ({ streaming }) =>
        useScrollWithHost(
          {
            chat_id: "clamp",
            messages,
            is_streaming: streaming,
            initial_visible_count: 12,
            load_batch_size: 6,
            top_load_threshold: 80,
            boot_visible_count: 3,
          },
          host,
        ),
      { initialProps: { streaming: false } },
    );

    // 已在底部:scrollToBottom 是一次 no-op 滚动(top=1000 clamp 到 600,位置不变、不发事件)
    act(() => {
      result.current.handleBackToBottom(); // → scrollToBottom("auto")
    });

    // 切到流式,并让内容变高,使 600 不再是底部
    host.__scrollHeight = 2000;
    rerender({ streaming: true });

    // 用户向下滚(向新底部)。若 lastScrollTop 被错记成 scrollHeight(1000),
    // 650 < 1000 会被误判为"上滚"而错误脱离跟随。
    host.scrollTop = 650;
    act(() => {
      result.current.handleScroll();
    });

    host.scrollTop = 650;
    act(() => {
      result.current.notifyStreamingContentCommitted();
      jest.advanceTimersByTime(64);
    });
    expect(host.scrollTop).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("scrollToMessageIndex settle option and sync-completion contract", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  const baseProps = (over = {}) => ({
    chat_id: "chat-settle",
    messages: makeMessages(40),
    is_streaming: false,
    initial_visible_count: 12,
    load_batch_size: 6,
    top_load_threshold: 80,
    boot_visible_count: 3,
    ...over,
  });

  it("settle:false skips the landing-correction re-align; default keeps it (drag vs click)", () => {
    const scrollHost = makeScrollHost();
    scrollHost.setScrollHeight(2600);
    const { result } = renderHook(() =>
      useScrollWithHost(baseProps(), scrollHost.host),
    );
    scrollHost.host.scrollTo.mockClear();

    const targetNode = { offsetTop: 1000 };
    act(() => {
      result.current.messageNodeRefs.current.set(38, targetNode);
      // 拖动路径:settle:false
      result.current.scrollToMessageIndex(38, "auto", { settle: false });
    });
    expect(scrollHost.host.scrollTo).toHaveBeenCalledTimes(1);

    // 目标布局漂移 + 推进结算周期:settle:false 不应产生二次对齐
    act(() => {
      targetNode.offsetTop = 1160;
      jest.advanceTimersByTime(50);
    });
    expect(scrollHost.host.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("returns true when the target is in the window (sync), false when it must defer to a window expand", () => {
    const messages = makeMessages(40);
    const { result } = renderHook(() =>
      useMessageWindowScroll(baseProps({ messages })),
    );

    let syncResult = null;
    let deferredResult = null;
    act(() => {
      result.current.messagesRef.current = {
        scrollTo: () => {},
        scrollHeight: 5000,
        clientHeight: 400,
        scrollTop: 0,
      };
      // index 38 在初始/展开窗口内(final start=28),节点已渲染 → 同步落位
      result.current.messageNodeRefs.current.set(38, { offsetTop: 1000 });
      syncResult = result.current.scrollToMessageIndex(38, "auto");
      // index 2 在窗口外 → 需异步扩窗
      deferredResult = result.current.scrollToMessageIndex(2, "auto");
    });

    expect(syncResult).toBe(true);
    expect(deferredResult).toBe(false);
  });
});

describe("chunked window expansion (skip-to-top / far jumps)", () => {
  const originalIdle = window.requestIdleCallback;
  const originalCancel = window.cancelIdleCallback;
  let idleQueue;
  const drainIdle = () => {
    const q = idleQueue.splice(0);
    q.forEach((cb) => cb());
  };

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

  const chunkProps = (host, over = {}) => ({
    chat_id: "chunk",
    messages: makeMessages(200),
    is_streaming: false,
    initial_visible_count: 12,
    load_batch_size: 6,
    top_load_threshold: 80,
    boot_visible_count: 3,
    ...over,
  });

  it("a large-gap skip-to-top expands in chunks (~40/step), not a single visibleStart=0 frame", () => {
    const scrollHost = makeScrollHost();
    const { result } = renderHook(() =>
      useScrollWithHost(chunkProps(scrollHost.host), scrollHost.host),
    );
    // 初始窗口 start = 200 - 12 = 188
    expect(result.current.safeVisibleStart).toBe(188);

    act(() => {
      result.current.handleSkipToTop();
    });
    // 分批:首步排入 idle,尚未一步改窗口
    expect(result.current.safeVisibleStart).toBe(188);

    act(() => {
      drainIdle();
    });
    // 每步约 40 条:188 → 148,绝不一步到 0
    expect(result.current.safeVisibleStart).toBe(148);

    act(() => {
      drainIdle();
    });
    expect(result.current.safeVisibleStart).toBe(108);
  });

  it("each chunk step goes through prepend compensation (auto bottom-pin); final step lands at top", () => {
    const scrollHost = makeScrollHost();
    const { result } = renderHook(() =>
      useScrollWithHost(chunkProps(scrollHost.host, { messages: makeMessages(120) }), scrollHost.host),
    );
    // start = 120 - 12 = 108
    act(() => {
      result.current.handleSkipToTop();
    });
    scrollHost.host.scrollTo.mockClear();

    act(() => {
      drainIdle(); // 108 → 68(中途)
    });
    const calls = scrollHost.host.scrollTo.mock.calls.map(([o]) => o);
    // 补偿:isAtBottom(默认 true)→ 每步 layoutEffect 走 scrollToBottom("auto") 钉底,
    // 证明该步确实设了 prependCompensation 并被消费(而非裸 setVisibleStart 无补偿)。
    expect(calls.some((o) => o && o.behavior === "auto")).toBe(true);

    act(() => {
      drainIdle(); // 68 → 28
    });
    act(() => {
      drainIdle(); // 28 → 0(final)
    });
    expect(result.current.safeVisibleStart).toBe(0);
  });

  it("a user wheel scroll mid-expansion cancels the in-progress chunked expand", () => {
    const scrollHost = makeScrollHost();
    const { result } = renderHook(() =>
      useScrollWithHost(chunkProps(scrollHost.host), scrollHost.host),
    );
    act(() => {
      result.current.handleSkipToTop();
    });
    act(() => {
      drainIdle(); // 188 → 148
    });
    expect(result.current.safeVisibleStart).toBe(148);

    // 用户中途主动滚动 → 取消
    act(() => {
      result.current.handleWheel({ deltaY: -20 });
    });

    // 后续 idle 拍不再推进窗口
    act(() => {
      drainIdle();
      drainIdle();
    });
    expect(result.current.safeVisibleStart).toBe(148);
  });

  it("a small-gap skip-to-top keeps one-step behavior (immediate visibleStart=0, no idle)", () => {
    const scrollHost = makeScrollHost();
    const { result } = renderHook(() =>
      useScrollWithHost(chunkProps(scrollHost.host, { messages: makeMessages(20) }), scrollHost.host),
    );
    // start = 20 - 12 = 8;gap 8 <= 3×6=18 → 一步
    expect(result.current.safeVisibleStart).toBe(8);

    act(() => {
      result.current.handleSkipToTop();
    });
    expect(result.current.safeVisibleStart).toBe(0);
    expect(idleQueue.length).toBe(0);
  });

  it("scrollToMessageIndex to a far-above target also expands in chunks (deferred path)", () => {
    const scrollHost = makeScrollHost();
    const { result } = renderHook(() =>
      useScrollWithHost(chunkProps(scrollHost.host), scrollHost.host),
    );
    // start = 188;跳到 index 2(远在窗口上方)
    act(() => {
      result.current.scrollToMessageIndex(2, "auto");
    });
    // nextStart = max(0, 2-6) = 0;gap 188 远超阈值 → 分批,不一步到 0
    expect(result.current.safeVisibleStart).toBe(188);

    act(() => {
      drainIdle();
    });
    expect(result.current.safeVisibleStart).toBe(148);
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
