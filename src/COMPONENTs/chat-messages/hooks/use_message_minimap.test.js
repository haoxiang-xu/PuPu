import { renderHook, act } from "@testing-library/react";
import { useMessageMinimap } from "./use_message_minimap";

const msgs = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `m-${i}`,
    role: i % 2 === 0 ? "user" : "assistant",
    content: "x".repeat(10 * (i + 1)),
  }));

const makeRefs = () => ({ current: new Map() });

test("segments fall back to estimate, in message order with role", () => {
  const messageNodeRefs = makeRefs();
  const { result } = renderHook(() =>
    useMessageMinimap({
      chatId: "c1",
      messages: msgs(3),
      messageNodeRefs,
      safeVisibleStart: 0,
    }),
  );
  expect(result.current.segments).toHaveLength(3);
  expect(result.current.segments[0].role).toBe("user");
  expect(result.current.segments[1].role).toBe("assistant");
  // estimated heights are positive and offsets are cumulative
  expect(result.current.segments[0].top).toBe(0);
  expect(result.current.segments[1].top).toBeGreaterThan(0);
  expect(result.current.total).toBeGreaterThan(0);
});

test("measure() writes real node heights into cache and bumps", () => {
  const messageNodeRefs = makeRefs();
  // 模拟已挂载节点(index→node),offsetHeight 由 getter 提供
  messageNodeRefs.current.set(0, { offsetHeight: 200 });
  const { result } = renderHook(() =>
    useMessageMinimap({
      chatId: "c1",
      messages: msgs(3),
      messageNodeRefs,
      safeVisibleStart: 0,
    }),
  );
  act(() => result.current.measure());
  expect(result.current.segments[0].height).toBe(200);
});

describe("lite mode v2 — 流式期间零 React 参与", () => {
  test("流式追加 trace frame(数组换新、长度与首尾 id 不变)→ segments 引用稳定", () => {
    const messageNodeRefs = makeRefs();
    const initial = msgs(3);
    const { result, rerender } = renderHook(
      ({ messages }) =>
        useMessageMinimap({
          chatId: "c1",
          messages,
          messageNodeRefs,
          safeVisibleStart: 0,
          isStreaming: true,
        }),
      { initialProps: { messages: initial } },
    );
    const before = result.current.segments;
    // 追加 trace frame:全新数组、长度不变、首尾 id 不变(仅末条 content 变长)
    const next = initial.map((m, i) =>
      i === initial.length - 1 ? { ...m, content: m.content + "yyyy" } : m,
    );
    rerender({ messages: next });
    expect(result.current.segments).toBe(before); // 引用不变 → 下游 effect 不重初始化
  });

  test("流式 measure() 只写高度缓存 —— 不 bump version,segments 引用稳定", () => {
    const messageNodeRefs = makeRefs();
    messageNodeRefs.current.set(0, { offsetHeight: 200 });
    const { result } = renderHook(() =>
      useMessageMinimap({
        chatId: "c1",
        messages: msgs(3),
        messageNodeRefs,
        safeVisibleStart: 0,
        isStreaming: true,
      }),
    );
    const before = result.current.segments;
    act(() => result.current.measure());
    // 流式 measure 不 setVersion:React 不重渲,segments 仍是估算、引用不变
    expect(result.current.segments).toBe(before);
    expect(result.current.segments[0].height).not.toBe(200);
  });

  test("流式结束下降沿(true→false)触发一次完整收敛:缓存里的真实高度落入 segments", () => {
    const messageNodeRefs = makeRefs();
    messageNodeRefs.current.set(0, { offsetHeight: 200 });
    const { result, rerender } = renderHook(
      ({ isStreaming }) =>
        useMessageMinimap({
          chatId: "c1",
          messages: msgs(3),
          messageNodeRefs,
          safeVisibleStart: 0,
          isStreaming,
        }),
      { initialProps: { isStreaming: true } },
    );
    // 流式期间 measure 只写缓存,segments 还是估算
    act(() => result.current.measure());
    expect(result.current.segments[0].height).not.toBe(200);
    // 结束:下降沿强制 calibrate + setVersion 收敛
    rerender({ isStreaming: false });
    expect(result.current.segments[0].height).toBe(200);
  });
});

test("switching chatId clears the height cache", () => {
  const messageNodeRefs = makeRefs();
  messageNodeRefs.current.set(0, { offsetHeight: 200 });
  const { result, rerender } = renderHook(
    ({ chatId }) =>
      useMessageMinimap({
        chatId,
        messages: msgs(3),
        messageNodeRefs,
        safeVisibleStart: 0,
      }),
    { initialProps: { chatId: "c1" } },
  );
  act(() => result.current.measure());
  expect(result.current.segments[0].height).toBe(200);
  // 换 chat:缓存清空,seg0 回到估算值(≠200)
  rerender({ chatId: "c2" });
  expect(result.current.segments[0].height).not.toBe(200);
});
