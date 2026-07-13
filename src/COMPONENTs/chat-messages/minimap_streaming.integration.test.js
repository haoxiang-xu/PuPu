// 固定 spec §6:流式期间几何零重排 —— 刻度几何是消息数据的纯函数,
// token 增长(不改 messages 引用)绝不触碰刻度 top/height。
import { render } from "@testing-library/react";
import MessageMinimap from "./components/message_minimap";

const msg = (id, role, content = "x".repeat(50)) => ({ id, role, content });

const makeScrollHost = () => {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientHeight", { value: 400, configurable: true });
  Object.defineProperty(el, "scrollHeight", { value: 2000, configurable: true });
  el.scrollTop = 0;
  document.body.appendChild(el);
  return el;
};

afterEach(() => {
  document.body.innerHTML = "";
});

test("流式期间:同一 messages 引用重渲染 N 次,刻度 top/height 逐像素不变", () => {
  const messages = [msg("a", "user"), msg("b", "assistant"), msg("c", "assistant", "")];
  const props = {
    messagesRef: { current: makeScrollHost() },
    messageNodeRefs: { current: new Map() },
    messages,
    safeVisibleStart: 0,
    scrollToMessageIndex: jest.fn(() => true),
    bottomViewportInset: 0,
    isDark: true,
    isStreaming: true,
  };
  const { container, rerender } = render(<MessageMinimap {...props} />);
  const snapshot = Array.from(container.querySelectorAll("[data-mm-tick]")).map(
    (t) => `${t.style.top}|${t.style.height}|${t.style.width}`,
  );
  for (let i = 0; i < 5; i++) rerender(<MessageMinimap {...props} />);
  const after = Array.from(container.querySelectorAll("[data-mm-tick]")).map(
    (t) => `${t.style.top}|${t.style.height}|${t.style.width}`,
  );
  expect(after).toEqual(snapshot);
});

test("流式结束下降沿:直播消息内容落库 → 宽度一次性收敛", () => {
  const live = { id: "c", role: "assistant", content: "" };
  const messages = [msg("a", "user", "x".repeat(30)), msg("b", "assistant", "x".repeat(900)), live];
  const props = {
    messagesRef: { current: makeScrollHost() },
    messageNodeRefs: { current: new Map() },
    messages,
    safeVisibleStart: 0,
    scrollToMessageIndex: jest.fn(() => true),
    bottomViewportInset: 0,
    isDark: true,
    isStreaming: true,
  };
  const { container, rerender } = render(<MessageMinimap {...props} />);
  const ticks = () => container.querySelectorAll("[data-mm-tick]");
  const liveWidthBefore = parseFloat(ticks()[2].style.width);
  expect(liveWidthBefore).toBeCloseTo(7, 1); // 空消息:TICK_W_MIN

  // 下降沿:内容提交 + isStreaming=false(messages 换新引用)
  const committed = [...messages.slice(0, 2), { ...live, content: "x".repeat(900) }];
  rerender(<MessageMinimap {...props} messages={committed} isStreaming={false} />);
  const liveWidthAfter = parseFloat(ticks()[2].style.width);
  expect(liveWidthAfter).toBeGreaterThan(liveWidthBefore); // 收敛到真实字数档位
  expect(ticks()[2].classList.contains("pupu-mm-live")).toBe(false);
});
