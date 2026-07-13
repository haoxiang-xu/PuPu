/**
 * 回归:minimap up-one/down-one(PREV/NEXT)pill 的瞬移/卡死四机制修复。
 * 由 2026-07-11 调查探针(__pill_step_probe)翻转而来,断言修复后行为:
 *  - M1b: landing 结算循环在 smooth 在飞时不补发 auto(动画不被中途钉死),
 *         hold 下降沿后照常补正(职责保留)。
 *  - M1:  ±1 邻窗跳转保留 smooth(经 loadOlder/NewerMessages 移窗 + anchor 补偿),
 *         远跳仍走跨窗强制 auto(DOM 换窗竞态防护,设计保留)。
 *  - M2:  落位 top 超挂载窗口 maxScroll 且下方还有未挂载消息 → 判窗内不可达,
 *         改道移窗;连点 NEXT 不再钉死在挂载底部。
 *
 * Harness 用真实 useMessageWindowScroll,按 chat_messages.js 同构注册节点;
 * clickPill 逐行复刻 message_minimap.js 的 jumpRelative(±1)。
 */
import { createElement } from "react";
import { act, render } from "@testing-library/react";
import { useMessageWindowScroll } from "./use_message_window_scroll";

const STRIDE = 100;
const NODE_H = 80;
const CLIENT_H = 300;
const LEN = 60;

const makeMessages = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `m-${i}`,
    role: "user",
    content: `${i}`,
  }));

const makeHost = (binding) => {
  const calls = [];
  let scrollTopValue = 0;
  const host = {
    clientHeight: CLIENT_H,
    get scrollHeight() {
      return binding.map ? binding.map.size * (binding.stride || STRIDE) : 0;
    },
    get scrollTop() {
      return scrollTopValue;
    },
    set scrollTop(v) {
      const max = Math.max(0, host.scrollHeight - host.clientHeight);
      const n = Number.isFinite(v) ? v : max;
      scrollTopValue = Math.max(0, Math.min(n, max));
    },
    scrollTo(opts) {
      calls.push({ top: opts.top, behavior: opts.behavior });
      host.scrollTop = opts.top;
    },
  };
  return { host, calls };
};

const Harness = ({ api, binding, host, chatId, messages }) => {
  const scroll = useMessageWindowScroll({
    chat_id: chatId,
    messages,
    is_streaming: false,
    initial_visible_count: 12,
    load_batch_size: 6,
    top_load_threshold: 80,
    boot_visible_count: 3,
    max_mounted_count: 12,
  });
  api.current = scroll;
  binding.map = scroll.messageNodeRefs.current;
  scroll.messagesRef.current = host;
  const stride = binding.stride || STRIDE;
  const nodeH = binding.nodeH || NODE_H;
  const start = scroll.safeVisibleStart;
  return createElement(
    "div",
    null,
    scroll.visibleMessages.map((msg, i) => {
      const messageIndex = start + i;
      return createElement("div", {
        key: msg.id,
        ref: (node) => {
          if (node) {
            scroll.messageNodeRefs.current.set(messageIndex, {
              offsetTop: (messageIndex - start) * stride,
              offsetHeight: nodeH,
            });
          } else {
            scroll.messageNodeRefs.current.delete(messageIndex);
          }
        },
      });
    }),
  );
};

// 复刻 message_minimap.js paintNow 的首条可见消息判定(inset=0)
const computeViewFirst = (host, map) => {
  const top = host.scrollTop;
  const vh = host.clientHeight;
  let first = -1;
  map.forEach((node, idx) => {
    if (!node) return;
    const a = node.offsetTop;
    const b = a + node.offsetHeight;
    if (b > top + 8 && a < top + vh - 8) {
      if (first < 0 || idx < first) first = idx;
    }
  });
  return first;
};

// 复刻 message_minimap.js jumpRelative(delta) 的消息级步进分支
const clickPill = (api, binding, host, delta) => {
  const v = computeViewFirst(host, binding.map);
  const cur = v >= 0 ? v : api.current.safeVisibleStart;
  const next = Math.max(0, Math.min(LEN - 1, cur + delta));
  let called = false;
  if (next !== cur) {
    act(() => {
      api.current.scrollToMessageIndex(next, "smooth");
    });
    called = true;
  }
  return { cur, next, called };
};

// 公共起点:60 条、窗口 [24,36)、视口落在 index 30 顶(scrollTop=588)、非贴底
const setup = () => {
  const binding = {};
  const { host, calls } = makeHost(binding);
  const api = { current: null };
  const messages = makeMessages(LEN);
  const utils = render(
    createElement(Harness, { api, binding, host, chatId: "probe", messages }),
  );
  act(() => {
    api.current.scrollToMessageIndex(30, "auto");
  });
  calls.length = 0;
  return { api, binding, host, calls, messages, utils };
};

describe("pill step regression (minimap PREV/NEXT)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test("SETUP 校验:跳到中部后窗口 [24,36)、scrollTop=588、非贴底", () => {
    const { api, host } = setup();
    expect(api.current.safeVisibleStart).toBe(24);
    expect(api.current.visibleMessages).toHaveLength(12);
    expect(host.scrollTop).toBe(588); // (30-24)*100 - 12
    expect(api.current.isAtBottom).toBe(false);
  });

  test("窗内 +1 → 单次 smooth scrollTo,几何稳定时 settle 循环不补发 auto", () => {
    const { api, binding, host, calls } = setup();
    const { cur, next } = clickPill(api, binding, host, +1);
    expect(cur).toBe(30);
    expect(next).toBe(31);
    expect(calls).toEqual([{ top: 688, behavior: "smooth" }]);

    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(calls).toHaveLength(1);
  });

  test("M1b:smooth 在飞时布局漂移不补发 auto(动画不被钉死);hold 下降沿后照常补正", () => {
    const { api, binding, host, calls } = setup();
    clickPill(api, binding, host, +1); // smooth → 688,settle 已武装(index 31)
    // 模拟懒渲染/代码块撑高:目标 31 下移 40px
    binding.map.get(31).offsetTop += 40;
    act(() => {
      jest.advanceTimersByTime(50); // smooth hold(160ms)还在飞
    });
    // 修复点:在飞期间结算循环只等待,不用 auto 直写掐断动画
    expect(calls).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(400); // hold 下降沿之后的结算 tick
    });
    // 补正职责保留:动画结束后照常把落点钉准(auto)
    expect(calls[1]).toEqual({ top: 728, behavior: "auto" });
  });

  test("PREV 目标在窗口上边界外一条 → 邻窗滑动保留 smooth(不再强制 auto 瞬移)", () => {
    const { api, binding, host, calls } = setup();
    act(() => {
      api.current.scrollToMessageIndex(24, "auto"); // 视口移到窗口首条顶部
    });
    expect(host.scrollTop).toBe(0);
    calls.length = 0;

    const { cur, next } = clickPill(api, binding, host, -1);
    expect(cur).toBe(24);
    expect(next).toBe(23);
    // 邻窗路径:loadOlderMessages 移窗 [18,30),目标 23 以请求的 smooth 落位
    expect(api.current.safeVisibleStart).toBe(18);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ top: 488, behavior: "smooth" }); // (23-18)*100-12
  });

  test("NEXT 目标=窗口下边界(36) → 邻窗滑动向下移窗并保留 smooth", () => {
    const { api, host, calls } = setup();
    let returned;
    act(() => {
      returned = api.current.scrollToMessageIndex(36, "smooth");
    });
    expect(returned).toBe(false); // 异步移窗路径
    expect(api.current.safeVisibleStart).toBe(30); // loadNewer → [30,42)
    // 目标入窗后以请求的 smooth 落位((36-30)*100-12 = 588),不再被强制 auto
    const landing = calls[calls.length - 1];
    expect(landing).toEqual({ top: 588, behavior: "smooth" });
  });

  test("连点 NEXT 越过挂载窗口底部:不再钉死,窗口向下移、步进持续前进", () => {
    const { api, binding, host, calls } = setup();
    const log = [];
    for (let i = 1; i <= 8; i += 1) {
      const r = clickPill(api, binding, host, +1);
      log.push({
        click: i,
        cur: r.cur,
        next: r.next,
        called: r.called,
        scrollTop: host.scrollTop,
        visibleStart: api.current.safeVisibleStart,
        lastBehavior: (calls[calls.length - 1] || {}).behavior || null,
      });
    }

    // 前 3 步:窗内 smooth(688/788/888)
    expect(log[0]).toMatchObject({ cur: 30, next: 31, scrollTop: 688 });
    expect(log[1]).toMatchObject({ cur: 31, next: 32, scrollTop: 788 });
    expect(log[2]).toMatchObject({ cur: 32, next: 33, scrollTop: 888 });

    // 第 4 步(旧 bug 的钉死点):落位 top 988 > 挂载 maxScroll 900 且下方还有消息
    // → 可达性判定改道移窗,窗口向下、落位走 smooth,不再钉死在 900/[24,36)
    expect(log[3].visibleStart).toBeGreaterThan(24);
    expect(log[3].lastBehavior).toBe("smooth");

    // 第 4~8 步:viewFirst 严格前进 —— 每次点击都有真实位移,永不重打同一目标
    for (let i = 4; i < 8; i += 1) {
      expect(log[i].cur).toBeGreaterThan(log[i - 1].cur);
      expect(log[i].called).toBe(true);
    }
    // 全程窗口已离开初始 [24,36)
    expect(api.current.safeVisibleStart).toBeGreaterThan(24);
  });

  test("远跳(超出邻窗范围)仍走跨窗强制 auto —— DOM 换窗竞态防护保留", () => {
    const { api, calls } = setup();
    let returned;
    act(() => {
      returned = api.current.scrollToMessageIndex(2, "smooth"); // 24-6 之外的远跳
    });
    expect(returned).toBe(false);
    const landing = calls[calls.length - 1];
    expect(landing.behavior).toBe("auto"); // 设计保留:远跳不冒 smooth 跨 DOM 边界的险
  });
});
