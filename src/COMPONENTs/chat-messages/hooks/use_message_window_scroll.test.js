import { act, renderHook } from "@testing-library/react";
import useMessageWindowScroll from "./use_message_window_scroll";

const makeMessages = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `m-${i}`,
    role: "user",
    content: `${i}`,
  }));

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
});
