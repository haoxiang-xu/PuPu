import { render, act, fireEvent } from "@testing-library/react";
import MessageMinimap from "./message_minimap";

const seg = (id, role, top, height) => ({ id, role, top, height });

// 真实 DOM host,使 MessageMinimap 的命令式 layout effect 能完整跑起来
// (getComputedStyle / clientHeight / scrollHeight 都需要真实 Element)。
const makeScrollHost = () => {
  const el = document.createElement("div");
  const inner = document.createElement("div");
  el.appendChild(inner);
  Object.defineProperty(el, "clientHeight", { value: 400, configurable: true });
  Object.defineProperty(el, "scrollHeight", {
    value: 2000,
    configurable: true,
  });
  el.scrollTop = 0;
  document.body.appendChild(el);
  return el;
};

const baseProps = (over = {}) => ({
  messagesRef: { current: null },
  messageNodeRefs: { current: new Map() },
  segments: [seg("a", "user", 0, 100), seg("b", "assistant", 100, 100)],
  total: 200,
  safeVisibleStart: 0,
  measure: () => {},
  scrollToMessageIndex: jest.fn(),
  bottomViewportInset: 0,
  isDark: true,
  ...over,
});

test("renders one tick per segment with role data-attr", () => {
  const { container } = render(<MessageMinimap {...baseProps()} />);
  const ticks = container.querySelectorAll('[data-mm-tick]');
  expect(ticks).toHaveLength(2);
  expect(ticks[0].getAttribute("data-mm-role")).toBe("user");
  expect(ticks[1].getAttribute("data-mm-role")).toBe("assistant");
});

test("renders nothing when there are no segments", () => {
  const { container } = render(<MessageMinimap {...baseProps({ segments: [], total: 0 })} />);
  expect(container.querySelector('[data-mm-track]')).toBeNull();
});

test("user tick is grey, assistant tick uses theme highlight color (dark)", () => {
  const { container } = render(<MessageMinimap {...baseProps()} />);
  const ticks = container.querySelectorAll('[data-mm-tick]');
  expect(ticks[0].style.background).toContain("255, 255, 255"); // user 灰
  expect(ticks[1].style.background).toContain("101, 196, 102"); // highlight 色
});

describe("measure is off the scroll hot path", () => {
  let originalRaf;
  let originalCancelRaf;
  beforeEach(() => {
    jest.useFakeTimers();
    // 强制走 setTimeout 节流分支,保证 fake timers 可确定性推进
    originalRaf = window.requestAnimationFrame;
    originalCancelRaf = window.cancelAnimationFrame;
    window.requestAnimationFrame = undefined;
    window.cancelAnimationFrame = undefined;
  });
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancelRaf;
    document.body.innerHTML = "";
  });

  test("bursts of scroll events do not run measure() synchronously per event; it is throttled", () => {
    const el = makeScrollHost();
    const measure = jest.fn();
    render(
      <MessageMinimap
        {...baseProps({ messagesRef: { current: el }, measure })}
      />,
    );
    measure.mockClear();

    // 一连串 scroll 事件:节流后 measure 不应逐事件同步触发
    act(() => {
      el.dispatchEvent(new Event("scroll"));
      el.dispatchEvent(new Event("scroll"));
      el.dispatchEvent(new Event("scroll"));
    });
    expect(measure).not.toHaveBeenCalled();

    // 节流窗口过后合并成一次 measure
    act(() => {
      jest.advanceTimersByTime(120);
    });
    expect(measure).toHaveBeenCalledTimes(1);
  });
});

describe("lite mode while streaming (minimap stays mounted)", () => {
  let originalRaf;
  let originalCancelRaf;
  beforeEach(() => {
    jest.useFakeTimers();
    // 强制走 setTimeout 节流分支,保证 fake timers 可确定性推进
    originalRaf = window.requestAnimationFrame;
    originalCancelRaf = window.cancelAnimationFrame;
    window.requestAnimationFrame = undefined;
    window.cancelAnimationFrame = undefined;
  });
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancelRaf;
    document.body.innerHTML = "";
  });

  test("scroll during streaming does not schedule measure; a ~400ms timer measures without any scroll", () => {
    const el = makeScrollHost();
    const measure = jest.fn();
    render(
      <MessageMinimap
        {...baseProps({
          messagesRef: { current: el },
          measure,
          isStreaming: true,
        })}
      />,
    );
    measure.mockClear();

    // lite 模式:scroll 事件不再排程昂贵的 measure(热路径静默)
    act(() => {
      el.dispatchEvent(new Event("scroll"));
      el.dispatchEvent(new Event("scroll"));
    });
    act(() => {
      jest.advanceTimersByTime(120);
    });
    expect(measure).not.toHaveBeenCalled();

    // 即便没有 scroll,~400ms 定时器也会驱动一次 measure
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(measure).toHaveBeenCalled();
  });

  test("scroll during streaming still drives a layout update (box/inner reposition), not just the timer", () => {
    const el = makeScrollHost();
    const measure = jest.fn();
    const { container } = render(
      <MessageMinimap
        {...baseProps({
          messagesRef: { current: el },
          measure,
          isStreaming: true,
        })}
      />,
    );
    measure.mockClear();

    const track = container.querySelector("[data-mm-track]");
    const inner = track.querySelector("div"); // innerRef:applyLayout 会写 transform
    // 哨兵:若 onScroll 跑了 update()→applyLayout,transform 会被计算值覆盖
    inner.style.transform = "translateY(999px)";

    // 用户手动滚动到新位置(120ms < 400ms 定时器周期,排除定时器影响)
    act(() => {
      el.scrollTop = 1500;
      el.dispatchEvent(new Event("scroll"));
    });
    act(() => {
      jest.advanceTimersByTime(120);
    });

    // measure 仍不在 scroll 上排程(移出热路径)
    expect(measure).not.toHaveBeenCalled();
    // 但 update() 在 scroll 上照跑:视口框/tick 实时跟手,而非随定时器跳格
    expect(inner.style.transform).not.toBe("translateY(999px)");
  });

  test("ending streaming triggers a convergence measure", () => {
    const el = makeScrollHost();
    const measure = jest.fn();
    const { rerender } = render(
      <MessageMinimap
        {...baseProps({
          messagesRef: { current: el },
          measure,
          isStreaming: true,
        })}
      />,
    );
    measure.mockClear();

    // 流式结束:effect 依赖变化重跑 → 立即收敛一次 measure
    rerender(
      <MessageMinimap
        {...baseProps({
          messagesRef: { current: el },
          measure,
          isStreaming: false,
        })}
      />,
    );
    expect(measure).toHaveBeenCalled();
  });
});

describe("lite mode v2 — 命令式几何补偿 + rAF 合并", () => {
  let originalRaf;
  let originalCancelRaf;
  afterEach(() => {
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancelRaf;
    document.body.innerHTML = "";
  });

  test("一帧内多次 scroll 只排一次 rAF(update 合并)", () => {
    originalRaf = window.requestAnimationFrame;
    originalCancelRaf = window.cancelAnimationFrame;
    const rafSpy = jest.fn(() => 1);
    window.requestAnimationFrame = rafSpy;
    window.cancelAnimationFrame = jest.fn();

    const el = makeScrollHost();
    render(
      <MessageMinimap
        {...baseProps({ messagesRef: { current: el }, isStreaming: true })}
      />,
    );
    rafSpy.mockClear(); // 挂载时的直接 update() 不走 rAF,清掉噪声

    act(() => {
      el.dispatchEvent(new Event("scroll"));
      el.dispatchEvent(new Event("scroll"));
      el.dispatchEvent(new Event("scroll"));
    });
    // 三次 scroll 合并成一次 rAF 调度
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  test("recalcGeometry 用已渲染节点的真实 offsetHeight 覆盖冻结的 segment 高度", () => {
    originalRaf = window.requestAnimationFrame;
    originalCancelRaf = window.cancelAnimationFrame;

    const el = makeScrollHost();
    const nodeRefs = { current: new Map() };
    // 段 0 冻结高度 100,但真实节点已长到 300(流式膨胀)
    nodeRefs.current.set(0, { offsetHeight: 300, offsetTop: 0 });
    const { container } = render(
      <MessageMinimap
        {...baseProps({
          messagesRef: { current: el },
          messageNodeRefs: nodeRefs,
          segments: [seg("a", "user", 0, 100), seg("b", "assistant", 100, 100)],
          total: 200,
        })}
      />,
    );
    const ticks = container.querySelectorAll("[data-mm-tick]");
    // jsdom 下 padding/gap=0、scale=1(track clientHeight=0 → usable<=0 → scale 1)。
    // 段 1 顶部 = PAD(8) + cOffsets[1]。用真实高度覆盖后 cOffsets[1]=300 → top=308px
    // (未覆盖则用冻结值 100 → 108px)。
    expect(ticks[1].style.top).toBe("308px");
  });
});

describe("drag vs click semantics", () => {
  // jsdom 未实现 pointer capture,补一层 no-op,让 onPointerDown/Up 不抛
  let hadSet;
  let hadHas;
  let hadRelease;
  beforeAll(() => {
    hadSet = Element.prototype.setPointerCapture;
    hadHas = Element.prototype.hasPointerCapture;
    hadRelease = Element.prototype.releasePointerCapture;
    Element.prototype.setPointerCapture = function () {};
    Element.prototype.hasPointerCapture = function () {
      return false;
    };
    Element.prototype.releasePointerCapture = function () {};
  });
  afterAll(() => {
    Element.prototype.setPointerCapture = hadSet;
    Element.prototype.hasPointerCapture = hadHas;
    Element.prototype.releasePointerCapture = hadRelease;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("a synchronous landing enters drag; move drives a settle:false scroll", () => {
    const el = makeScrollHost();
    const scrollToMessageIndex = jest.fn(() => true); // 同步落位
    const { container } = render(
      <MessageMinimap
        {...baseProps({ messagesRef: { current: el }, scrollToMessageIndex })}
      />,
    );
    const track = container.querySelector("[data-mm-track]");

    fireEvent.pointerDown(track, { clientY: 100, pointerId: 1 });
    scrollToMessageIndex.mockClear();

    // 超过 6px 阈值 → 接管为拖动 → dragTo 用 settle:false
    fireEvent.pointerMove(track, { clientY: 200, pointerId: 1 });
    expect(scrollToMessageIndex).toHaveBeenCalled();
    const lastCall =
      scrollToMessageIndex.mock.calls[
        scrollToMessageIndex.mock.calls.length - 1
      ];
    expect(lastCall[2]).toMatchObject({ settle: false });
  });

  test("a deferred (async) landing stays a pure click — no drag scroll on move", () => {
    const el = makeScrollHost();
    const scrollToMessageIndex = jest.fn(() => false); // 异步扩窗跳转
    const { container } = render(
      <MessageMinimap
        {...baseProps({ messagesRef: { current: el }, scrollToMessageIndex })}
      />,
    );
    const track = container.querySelector("[data-mm-track]");

    fireEvent.pointerDown(track, { clientY: 100, pointerId: 1 });
    expect(scrollToMessageIndex).toHaveBeenCalledTimes(1); // 按下的跳转
    scrollToMessageIndex.mockClear();

    // 未进入拖动态:移动超过阈值也不再产生滚动
    fireEvent.pointerMove(track, { clientY: 200, pointerId: 1 });
    expect(scrollToMessageIndex).not.toHaveBeenCalled();
  });
});
