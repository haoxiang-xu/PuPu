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
