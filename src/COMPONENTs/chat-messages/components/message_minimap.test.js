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
