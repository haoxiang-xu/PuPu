// 窗口归中滑动:点击/瞬时跳转造成的大位移,winS 逐帧趋近目标(选中区域滑入
// 轨道中央),而非一帧内瞬间重映射。小步进与首帧仍直接落位。
import { render } from "@testing-library/react";
import MessageMinimap from "./components/message_minimap";

const msg = (id, role) => ({ id, role, content: "x".repeat(80) });

// 手动 rAF 队列:逐帧驱动滑动,测试完全确定
let rafQ = [];
const origRaf = window.requestAnimationFrame;
const origCancelRaf = window.cancelAnimationFrame;
beforeEach(() => {
  rafQ = [];
  window.requestAnimationFrame = (cb) => {
    rafQ.push(cb);
    return rafQ.length;
  };
  window.cancelAnimationFrame = () => {};
});
afterEach(() => {
  window.requestAnimationFrame = origRaf;
  window.cancelAnimationFrame = origCancelRaf;
  document.body.innerHTML = "";
});
const flushFrame = () => {
  const q = rafQ;
  rafQ = [];
  q.forEach((cb) => cb());
};

const setup = () => {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientHeight", { value: 400, configurable: true });
  Object.defineProperty(el, "scrollHeight", { value: 3000, configurable: true });
  el.scrollTop = 0;
  document.body.appendChild(el);

  // 30 条消息,每条占 100px;jsdom 下轨道 clientHeight=0 → 窗口容量 10 → 窗口模式
  const messages = Array.from({ length: 30 }, (_, i) =>
    msg(`m${i}`, i % 2 ? "assistant" : "user"),
  );
  const nodeMap = new Map();
  messages.forEach((_, i) => {
    nodeMap.set(i, { offsetTop: i * 100, offsetHeight: 100 });
  });

  const props = {
    messagesRef: { current: el },
    messageNodeRefs: { current: nodeMap },
    messages,
    safeVisibleStart: 0,
    scrollToMessageIndex: jest.fn(() => true),
    bottomViewportInset: 0,
    isDark: true,
    isStreaming: false,
  };
  const utils = render(<MessageMinimap {...props} />);
  return { el, props, ...utils };
};

const hiddenAbove = (container) => {
  const text = container.querySelector("[data-mm-count-top]").textContent;
  return text ? parseInt(text.replace(/[^\d]/g, ""), 10) : 0;
};

test("点击跳转的大位移:窗口滑动归中(先高光后滑入),不一帧闪跳", () => {
  const { el, container } = setup();
  flushFrame(); // 首帧 paint:snap 落位,winS=0
  expect(hiddenAbove(container)).toBe(0);

  // 模拟点击 tick 后的瞬时落位:scrollTop 跳到消息 25-28 处
  el.scrollTop = 2500;
  el.dispatchEvent(new Event("scroll"));
  flushFrame(); // 第一滑动帧:winS 只走了剩余距离的一段

  const afterOneFrame = hiddenAbove(container);
  expect(afterOneFrame).toBeGreaterThan(0); // 已经在动
  expect(afterOneFrame).toBeLessThan(20); // 但没有瞬间到位(目标 winS=20)

  // 逐帧驱动至收敛(时间基推进在紧循环里按 8ms dt 下限走,需要更多帧)
  let frames = 0;
  while (rafQ.length && frames++ < 300) flushFrame();
  expect(hiddenAbove(container)).toBe(20); // 收敛到归中目标
  expect(rafQ.length).toBe(0); // 收敛后自停,不留常驻 rAF
});

test("滑动进行中 effect 重初始化(chunked expand 改 safeVisibleStart):动画不被打断成闪跳", () => {
  const { el, container, props, rerender } = setup();
  flushFrame(); // 首帧 snap 落位,winS=0

  el.scrollTop = 2500; // 大跳距,目标 winS=20
  el.dispatchEvent(new Event("scroll"));
  flushFrame();
  const midGlide = hiddenAbove(container);
  expect(midGlide).toBeGreaterThan(0);
  expect(midGlide).toBeLessThan(20);

  // 点击跳远消息会触发 chunked expand → safeVisibleStart 变化 → 大 effect 重初始化。
  // 重初始化的同步 paintNow 只允许把滑动往前推一步,不允许重置成"首帧直接落位"。
  rerender(<MessageMinimap {...props} safeVisibleStart={7} />);
  const afterReinit = hiddenAbove(container);
  expect(afterReinit).toBeLessThan(20); // 没有闪跳到目标

  let frames = 0;
  while (rafQ.length && frames++ < 300) flushFrame();
  expect(hiddenAbove(container)).toBe(20); // 仍收敛到归中目标
});

test("小步进(相邻滚动)仍即时落位,不引入滞后", () => {
  const { el, container } = setup();
  flushFrame();

  // 向下滚几条消息:目标 winS 变化 ≤1 → 直接落位,无滑动帧
  el.scrollTop = 400; // 视口 4-7 → target = recenter = 1,diff = 1
  el.dispatchEvent(new Event("scroll"));
  flushFrame();
  expect(hiddenAbove(container)).toBe(1); // 一步到位
  expect(rafQ.length).toBe(0); // 没有排入滑动帧
});
