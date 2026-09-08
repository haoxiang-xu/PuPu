// C2(C 批性能):scrollable observer 收敛。
// 契约:全模块共享 1 个 ResizeObserver(observe/unobserve 各容器,回调按 target
// 分发)替代每容器一个;per-container subtree MutationObserver 的回调经 rAF 合并
// (同帧多次变更只 sync 一次)。滚动条视觉与交互语义不变。
// 注:本文件是 scrollable 的第一个测试,同时为既有行为(auto-attach、清理)建基线。

import { render } from "@testing-library/react";
import { act } from "@testing-library/react";
import Scrollable from "./scrollable";
import { ConfigContext } from "../../CONTAINERs/config/context";

const renderScrollable = () =>
  render(
    <ConfigContext.Provider
      value={{ theme: { scrollable: {} }, onThemeMode: "light_mode" }}
    >
      <Scrollable />
    </ConfigContext.Provider>,
  );

const stubScrollMetrics = (el, metrics) => {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(el, key, { value, configurable: true });
  }
};

const makeContainer = () => {
  const parent = document.createElement("div");
  const container = document.createElement("div");
  container.className = "scrollable";
  const child = document.createElement("div");
  container.appendChild(child);
  parent.appendChild(container);
  document.body.appendChild(parent);
  return { parent, container, child };
};

describe("scrollable observer 收敛", () => {
  let originalRO;
  let originalRaf;
  let originalCancelRaf;
  let roInstances;
  let rafQueue;

  beforeEach(() => {
    document.body.innerHTML = "";
    roInstances = [];
    originalRO = global.ResizeObserver;
    global.ResizeObserver = jest.fn(function MockRO(callback) {
      this.callback = callback;
      this.observe = jest.fn();
      this.unobserve = jest.fn();
      this.disconnect = jest.fn();
      roInstances.push(this);
    });
    window.ResizeObserver = global.ResizeObserver;

    rafQueue = [];
    originalRaf = window.requestAnimationFrame;
    originalCancelRaf = window.cancelAnimationFrame;
    window.requestAnimationFrame = (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    };
    window.cancelAnimationFrame = (id) => {
      if (id >= 1 && id <= rafQueue.length) rafQueue[id - 1] = null;
    };
  });

  afterEach(() => {
    global.ResizeObserver = originalRO;
    window.ResizeObserver = originalRO;
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancelRaf;
    document.body.innerHTML = "";
  });

  const flushRaf = () => {
    const q = rafQueue.splice(0);
    q.forEach((cb) => cb && cb(performance.now()));
  };

  test("attach 3 个容器,全模块只构造 1 个 ResizeObserver", () => {
    makeContainer();
    makeContainer();
    makeContainer();

    renderScrollable();

    expect(global.ResizeObserver).toHaveBeenCalledTimes(1);
  });

  test("共享 RO 回调按 target 分发:只有对应容器被 sync(写它的 thumb)", () => {
    const a = makeContainer();
    const b = makeContainer();
    renderScrollable();
    flushRaf();

    const spyA = jest.spyOn(a.container, "getBoundingClientRect");
    const spyB = jest.spyOn(b.container, "getBoundingClientRect");

    // 模拟 RO 报告:只有 a.container resize
    const ro = roInstances[0];
    act(() => {
      ro.callback([{ target: a.container }]);
    });
    flushRaf();

    expect(spyA).toHaveBeenCalled();
    expect(spyB).not.toHaveBeenCalled();
  });

  test("同一帧内对容器连发 5 次 style 变更,sync 只执行 1 次(rAF 合并)", async () => {
    const { container, child } = makeContainer();
    renderScrollable();
    flushRaf(); // 消化 attach 时排的初始 scheduleSync

    const spy = jest.spyOn(container, "getBoundingClientRect");

    // 同一帧内 5 次 style 变更(跨微任务,确保 MutationObserver 逐批回调)
    await act(async () => {
      for (let i = 0; i < 5; i += 1) {
        child.style.width = `${10 + i}px`;
        await new Promise((r) => setTimeout(r, 0));
      }
    });

    spy.mockClear();
    flushRaf(); // 帧到来:合并后的 sync 应只跑一次
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("被 clip 的轴不画 thumb:overflowX:hidden 的超宽内容不生成横向滚动条", () => {
    // 真实形态:面板用 overflowX:hidden 夹住一条 200% 宽的滑轨做左右切换,
    // 纵向才是真滚动。scrollWidth 依然大于 clientWidth,若照此画横向 thumb,
    // 它不只是死的 —— scrollLeft 对被 clip 的轴仍然生效,拖它会把内容推走。
    const { parent, container } = makeContainer();
    container.style.overflowX = "hidden";
    container.style.overflowY = "auto";
    stubScrollMetrics(container, {
      scrollWidth: 548,
      clientWidth: 274,
      scrollHeight: 400,
      clientHeight: 200,
    });

    renderScrollable();
    flushRaf();

    // overlay 是 attach 追加到 parent 的兄弟节点,内含 [vThumb, hThumb]
    const [vThumb, hThumb] = parent.lastElementChild.children;
    expect(vThumb.style.display).not.toBe("none"); // 纵向真能滚 → 有 thumb
    expect(hThumb.style.display).toBe("none"); // 横向被 clip → 没有 thumb
  });
});
