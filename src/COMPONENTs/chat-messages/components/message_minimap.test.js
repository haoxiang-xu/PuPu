// src/COMPONENTs/chat-messages/components/message_minimap.test.js
import { render, act, fireEvent } from "@testing-library/react";
import MessageMinimap from "./message_minimap";
import { CRAWL_STEP_MS } from "../minimap_rail_geometry";

// jsdom(本项目锁定的 16.7)未实现 PointerEvent,RTL 的 fireEvent.pointer* 退化成
// 裸 Event(丢 clientY)。旧 message_minimap.test.js 已注明同一坑,此处用同一惯例:
// 补一个 MouseEvent 子类当 PointerEvent,让 clientY 随 init dict 正常携带。
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  class PointerEvent extends MouseEvent {
    constructor(type, params = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
    }
  }
  window.PointerEvent = PointerEvent;
}

// jsdom 下 track.clientHeight = 0 → winCapacity 恒为下限 10(池容量 10),
// 测试利用这一确定性构造非窗口(n≤10)与窗口(n>10)两种形态。

const msg = (id, role, content = "hello world", attachments) => ({
  id, role, content, attachments,
});

const makeScrollHost = () => {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientHeight", { value: 400, configurable: true });
  Object.defineProperty(el, "scrollHeight", { value: 2000, configurable: true });
  el.scrollTop = 0;
  el.scrollTo = jest.fn();
  document.body.appendChild(el);
  return el;
};

const makeMessageNode = (offsetTop, offsetHeight) => {
  const n = document.createElement("div");
  Object.defineProperty(n, "offsetTop", { value: offsetTop, configurable: true });
  Object.defineProperty(n, "offsetHeight", { value: offsetHeight, configurable: true });
  return n;
};

const baseProps = (over = {}) => ({
  scrollHostId: "chat-scroll-host-test",
  messagesRef: { current: makeScrollHost() },
  messageNodeRefs: { current: new Map() },
  messages: [msg("a", "user"), msg("b", "assistant")],
  safeVisibleStart: 0,
  scrollToMessageIndex: jest.fn(() => true),
  onBackToBottom: jest.fn(),
  bottomViewportInset: 0,
  isDark: true,
  ...over,
});

afterEach(() => {
  document.body.innerHTML = "";
});

test("每条消息一根刻度(n ≤ 容量),带 role 标记", () => {
  const { container } = render(<MessageMinimap {...baseProps()} />);
  const ticks = container.querySelectorAll("[data-mm-tick]");
  expect(ticks).toHaveLength(2);
  expect(ticks[0].getAttribute("data-mm-role")).toBe("user");
  expect(ticks[1].getAttribute("data-mm-role")).toBe("assistant");
});

test("scrollbar 语义指向真实消息容器并暴露当前位置", () => {
  const props = baseProps({
    messages: [msg("a", "user"), msg("b", "assistant"), msg("c", "user")],
    safeVisibleStart: 1,
  });
  const { container } = render(<MessageMinimap {...props} />);
  const track = container.querySelector("[data-mm-track]");

  expect(track).toHaveAttribute("aria-controls", "chat-scroll-host-test");
  expect(track).toHaveAttribute("aria-orientation", "vertical");
  expect(track).toHaveAttribute("aria-valuemin", "0");
  expect(track).toHaveAttribute("aria-valuemax", "2");
  expect(track).toHaveAttribute("aria-valuenow", "1");
  expect(track).toHaveAttribute("aria-valuetext", "Message 2 of 3");
});

test("无消息时不渲染", () => {
  const { container } = render(<MessageMinimap {...baseProps({ messages: [] })} />);
  expect(container.querySelector("[data-mm-track]")).toBeNull();
});

test("底部导航调用全局回到底部,不只滚当前窗口", () => {
  const props = baseProps();
  const { container } = render(<MessageMinimap {...props} />);
  const pills = container.querySelectorAll("[data-mm-pill]");

  fireEvent.click(pills[pills.length - 1]);

  expect(props.onBackToBottom).toHaveBeenCalledTimes(1);
  expect(props.scrollToMessageIndex).not.toHaveBeenCalled();
});

test("窗口封顶:25 条消息只渲染容量(10)根刻度,端点计数出现", () => {
  const messages = Array.from({ length: 25 }, (_, i) =>
    msg(`m${i}`, i % 2 ? "assistant" : "user"),
  );
  const nodeRefs = { current: new Map() };
  // 视口中部:第 12/13 条可见(offsetTop 与 scrollTop=1200 对齐)
  nodeRefs.current.set(12, makeMessageNode(1200, 150));
  nodeRefs.current.set(13, makeMessageNode(1350, 150));
  const props = baseProps({ messages, messageNodeRefs: nodeRefs });
  props.messagesRef.current.scrollTop = 1200;
  const { container } = render(<MessageMinimap {...props} />);
  const visibleTicks = Array.from(
    container.querySelectorAll("[data-mm-tick]"),
  ).filter((t) => t.style.display !== "none");
  expect(visibleTicks.length).toBeLessThanOrEqual(10);
  const cTop = container.querySelector("[data-mm-count-top]");
  const cBot = container.querySelector("[data-mm-count-bottom]");
  expect(cTop.textContent).toMatch(/^↑ \d+$/);
  expect(cBot.textContent).toMatch(/^↓ \d+$/);
});

test("点击轨道 → scrollToMessageIndex(居中)", () => {
  const props = baseProps();
  props.messageNodeRefs.current.set(0, makeMessageNode(0, 100));
  const { container } = render(<MessageMinimap {...props} />);
  const track = container.querySelector("[data-mm-track]");
  fireEvent.pointerDown(track, { clientY: 100, pointerId: 1 });
  fireEvent.pointerUp(track, { clientY: 100, pointerId: 1 });
  expect(props.scrollToMessageIndex).toHaveBeenCalledWith(
    expect.any(Number),
    "auto",
    expect.objectContaining({ align: "center" }),
  );
});

test("键盘 ↓ → 跳到下一条(smooth 居中)", () => {
  const props = baseProps({
    messages: [msg("a", "user"), msg("b", "assistant"), msg("c", "user")],
  });
  props.messageNodeRefs.current.set(0, makeMessageNode(0, 100));
  const { container } = render(<MessageMinimap {...props} />);
  const track = container.querySelector("[data-mm-track]");
  fireEvent.keyDown(track, { key: "ArrowDown" });
  expect(props.scrollToMessageIndex).toHaveBeenCalledWith(
    1,
    "smooth",
    expect.objectContaining({ align: "center" }),
  );
});

test("快速连续 jump 取消旧 flash 重试,过期 rAF 不能复活", () => {
  const originalRaf = window.requestAnimationFrame;
  const originalCancelRaf = window.cancelAnimationFrame;
  const callbacks = new Map();
  let nextRafId = 100;
  const rafMock = jest.fn((callback) => {
    const id = nextRafId++;
    callbacks.set(id, callback);
    return id;
  });
  const cancelRafMock = jest.fn((id) => callbacks.delete(id));
  window.requestAnimationFrame = rafMock;
  window.cancelAnimationFrame = cancelRafMock;

  try {
    const props = baseProps({
      messages: [msg("a", "user"), msg("b", "assistant"), msg("c", "user")],
    });
    const { container, unmount } = render(<MessageMinimap {...props} />);
    const track = container.querySelector("[data-mm-track]");
    callbacks.clear();
    rafMock.mockClear();
    cancelRafMock.mockClear();

    fireEvent.keyDown(track, { key: "ArrowDown" });
    const firstRafId = rafMock.mock.results[0].value;
    const staleFirstAttempt = callbacks.get(firstRafId);

    fireEvent.keyDown(track, { key: "ArrowDown" });
    const secondRafId = rafMock.mock.results[1].value;
    const staleSecondAttempt = callbacks.get(secondRafId);
    expect(cancelRafMock).toHaveBeenCalledWith(firstRafId);

    const scheduledAfterSecondJump = rafMock.mock.calls.length;
    act(() => staleFirstAttempt(performance.now()));
    expect(rafMock).toHaveBeenCalledTimes(scheduledAfterSecondJump);

    unmount();
    expect(cancelRafMock).toHaveBeenCalledWith(secondRafId);
    act(() => staleSecondAttempt(performance.now()));
    expect(rafMock).toHaveBeenCalledTimes(scheduledAfterSecondJump);
  } finally {
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancelRaf;
  }
});

test("快速连续 flash 清除旧目标,卸载清除最新 timeout 与标记", () => {
  jest.useFakeTimers();
  const clearTimeoutSpy = jest.spyOn(window, "clearTimeout");
  try {
    const firstTarget = makeMessageNode(100, 100);
    const latestTarget = makeMessageNode(200, 100);
    const nodeRefs = { current: new Map() };
    const props = baseProps({
      messages: [msg("a", "user"), msg("b", "assistant"), msg("c", "user")],
      messageNodeRefs: nodeRefs,
    });
    const { container, unmount } = render(<MessageMinimap {...props} />);
    const track = container.querySelector("[data-mm-track]");
    // 初始 paint 保持无可见锚点(cur 回退到 safeVisibleStart=0),随后再模拟
    // 两个目标节点随扩窗挂载,使两次 ArrowDown 稳定落到 1、2。
    nodeRefs.current.set(1, firstTarget);
    nodeRefs.current.set(2, latestTarget);

    fireEvent.keyDown(track, { key: "ArrowDown" });
    expect(firstTarget.classList.contains("pupu-mm-flash")).toBe(true);

    fireEvent.keyDown(track, { key: "ArrowDown" });
    expect(firstTarget.classList.contains("pupu-mm-flash")).toBe(false);
    expect(latestTarget.classList.contains("pupu-mm-flash")).toBe(true);
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockClear();
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(latestTarget.classList.contains("pupu-mm-flash")).toBe(false);
  } finally {
    clearTimeoutSpy.mockRestore();
    jest.useRealTimers();
  }
});

test("流式:末条刻度带 live 类;结束后移除", () => {
  const props = baseProps({ isStreaming: true });
  const { container, rerender } = render(<MessageMinimap {...props} />);
  const ticks = container.querySelectorAll("[data-mm-tick]");
  expect(ticks[1].classList.contains("pupu-mm-live")).toBe(true);
  rerender(<MessageMinimap {...props} isStreaming={false} />);
  expect(ticks[1].classList.contains("pupu-mm-live")).toBe(false);
});

test("四颗导航 pill 全部渲染", () => {
  const { container } = render(<MessageMinimap {...baseProps()} />);
  expect(container.querySelectorAll("[data-mm-pill]")).toHaveLength(4);
});

test("hover 轨道 → 快照卡出现且正文走 textContent(不解释 HTML)", () => {
  const props = baseProps({
    messages: [msg("a", "user", "<img src=x onerror=alert(1)> 你好世界"), msg("b", "assistant")],
  });
  const { container } = render(<MessageMinimap {...props} />);
  const track = container.querySelector("[data-mm-track]");
  // track.clientHeight=0(jsdom 无布局)→ usable=-12 → groupTopPx=-10(见 minimap_rail_geometry
  // 的 groupTopPx/indexAtY);clientY 需 <0 才落在消息 0 的槽位,故用 -15 而非天真的 5。
  fireEvent.pointerMove(track, { clientY: -15 });
  const snap = container.querySelector("[data-mm-snap]");
  expect(snap.style.opacity).toBe("1");
  expect(snap.querySelector("img")).toBeNull(); // XSS 面:消息内容不得进 innerHTML
  expect(snap.textContent).toContain("你好世界");
});

describe("扫播与窗口冻结", () => {
  // 30 条 → 窗口模式(jsdom 下 track.clientHeight=0 → 容量恒为 10)
  const makeWindowedProps = (over = {}) => {
    const messages = Array.from({ length: 30 }, (_, i) =>
      msg(`m${i}`, i % 2 ? "assistant" : "user"),
    );
    return baseProps({ messages, ...over });
  };

  test("扫播:越过阈值后按 top 对齐滚动(非居中),松手不触发额外的居中跳转", () => {
    const props = makeWindowedProps();
    const { container } = render(<MessageMinimap {...props} />);
    const track = container.querySelector("[data-mm-track]");

    fireEvent.pointerDown(track, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(track, { clientY: 110, pointerId: 1 }); // |110-100|=10 > 阈值(6)

    // 扫播语义:align:"top", settle:false —— 绝非点击式的 align:"center"
    expect(props.scrollToMessageIndex).toHaveBeenCalledWith(
      expect.any(Number),
      "auto",
      { align: "top", settle: false },
    );
    const callsBeforeRelease = props.scrollToMessageIndex.mock.calls.length;
    const lastBeforeRelease =
      props.scrollToMessageIndex.mock.calls[callsBeforeRelease - 1];

    fireEvent.pointerUp(track, { clientY: 110, pointerId: 1 });

    // 松手(scrub-release)不应追加一次 align:"center" 的点击式跳转
    const callsAfterRelease = props.scrollToMessageIndex.mock.calls;
    const lastAfterRelease = callsAfterRelease[callsAfterRelease.length - 1];
    expect(lastAfterRelease).toEqual(lastBeforeRelease);
    expect(lastAfterRelease[2]).toEqual({ align: "top", settle: false });
  });

  test("扫播贴近轨道顶边 → 冻结窗口逐步爬行(索引单调递减);松手后计时器停止", () => {
    jest.useFakeTimers();
    try {
      // first=last=20 的视口 → 挂载时 winSRef 归中到 15(round(20-cap/2)),
      // 扫播冻结取这个非零起点,爬行才能真正"走",不会一开始就被 clamp 在 0
      const nodeRefs = { current: new Map() };
      nodeRefs.current.set(20, makeMessageNode(2000, 150));
      const props = makeWindowedProps({ messageNodeRefs: nodeRefs });
      props.messagesRef.current.scrollTop = 2000;
      const { container } = render(<MessageMinimap {...props} />);
      const track = container.querySelector("[data-mm-track]");

      fireEvent.pointerDown(track, { clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(track, { clientY: 110, pointerId: 1 }); // 越过阈值,进入扫播,窗口冻结
      fireEvent.pointerMove(track, { clientY: 2, pointerId: 1 }); // y=2 < CRAWL_EDGE_PX(16) → 顶边爬行

      const preCrawlCalls = props.scrollToMessageIndex.mock.calls.length;
      act(() => {
        jest.advanceTimersByTime(CRAWL_STEP_MS * 3);
      });
      const crawlCalls = props.scrollToMessageIndex.mock.calls.slice(preCrawlCalls);
      expect(crawlCalls.length).toBeGreaterThanOrEqual(3);
      const indices = crawlCalls.map((c) => c[0]);
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBeLessThan(indices[i - 1]);
      }
      crawlCalls.forEach((c) => expect(c[2]).toEqual({ align: "top", settle: false }));

      fireEvent.pointerUp(track, { clientY: 2, pointerId: 1 });
      const callsAfterRelease = props.scrollToMessageIndex.mock.calls.length;
      act(() => {
        jest.advanceTimersByTime(CRAWL_STEP_MS * 5);
      });
      // 松手清了 crawl interval → 之后推进计时器不应再产生新调用
      expect(props.scrollToMessageIndex.mock.calls.length).toBe(callsAfterRelease);
    } finally {
      jest.useRealTimers();
    }
  });

  test("单条超长消息淹没视口 → 阅读进度读数出现;多条可见时隐藏", () => {
    // Case 1: 单消息(offsetHeight 2000)远超 1.2×clientHeight(400*1.2=480),first===last
    const nodeRefsLong = { current: new Map() };
    nodeRefsLong.current.set(0, makeMessageNode(0, 2000));
    const propsLong = baseProps({ messageNodeRefs: nodeRefsLong });
    propsLong.messagesRef.current.scrollTop = 300;
    const { container: longContainer } = render(<MessageMinimap {...propsLong} />);
    const pctLong = longContainer.querySelector("[data-mm-lenspct]");
    expect(pctLong.textContent).toMatch(/%$/);
    expect(pctLong.style.opacity).toBe("0.9");

    // Case 2: 两条短消息同时可见,first!==last → 阅读进度读数隐藏
    const nodeRefsShort = { current: new Map() };
    nodeRefsShort.current.set(0, makeMessageNode(0, 100));
    nodeRefsShort.current.set(1, makeMessageNode(100, 100));
    const propsShort = baseProps({ messageNodeRefs: nodeRefsShort });
    propsShort.messagesRef.current.scrollTop = 0;
    const { container: shortContainer } = render(<MessageMinimap {...propsShort} />);
    const pctShort = shortContainer.querySelector("[data-mm-lenspct]");
    expect(pctShort.style.opacity).toBe("0");
  });
});
