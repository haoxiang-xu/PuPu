# 聊天区分段 Minimap 滚动条 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 PuPu 聊天消息区的滚动条换成垂直分段 minimap(每条消息一根 pill 竖条、长度∝渲染高度、描边窗框住视口、上下导航 pill、超长对话 sliding window + 计数),并接管聊天区滚动。

**Architecture:** 纯几何/估算逻辑抽到无 DOM 的 `minimap_geometry.js`(可完整 TDD);`use_message_minimap.js` hook 持有高度缓存 + 测量 + 派生 segment 数据;`message_minimap.js` 组件渲染并在 scroll 时**命令式**更新(不走 React state,避免每帧重渲染);`use_message_window_scroll.js` 加一个 `scrollToMessageIndex`(跨窗口展开-再跳);`chat_messages.js` 用 minimap 替换 `MessageJumpControls` 并改容器 class。

**Tech Stack:** React 19(函数组件、JS-only、**无 TypeScript / 无 PropTypes**)、inline styles、Jest + @testing-library/react(CRA, jsdom)。

**设计来源:** `docs/superpowers/specs/2026-05-31-chat-minimap-scrollbar-design.md`;可视化原型:`docs/scrollbar-5d-final.html`。

---

## 实施前须知

- **影响分析(CLAUDE.md 强制):** 本 session GitNexus MCP 未连接。已手动确认爆炸半径:`ChatMessages` 全 app 仅 `src/PAGEs/chat/chat.js:882` 使用;`useMessageWindowScroll` 仅 `chat_messages.js` 使用。**若实施时 GitNexus 可用**,先跑 `gitnexus_impact({target:"useMessageWindowScroll", direction:"upstream"})` 和 `gitnexus_impact({target:"ChatMessages", direction:"upstream"})`,HIGH/CRITICAL 风险先报告再动手。
- **约定:** 文件 `snake_case.js`,组件 `PascalCase`,目录 `kebab-case`;只用 inline style + `ConfigContext`(`isDark = onThemeMode === "dark_mode"`)。不要引入 TypeScript / CSS modules。
- **jsdom 限制:** jsdom 不做真实布局,`offsetHeight/offsetTop/clientHeight` 恒为 0。因此把所有数值逻辑放进 `minimap_geometry.js` 做严格单测;DOM/组件层只测「角色→配色映射、空/不可滚动 return null、点击回调」等不依赖真实布局的部分,真实手感靠 Task 7 的运行时验证。
- **测试运行:** `CI=true npx react-scripts test <文件> --watchAll=false`。
- **不要 commit 之外的东西**;每个 Task 末尾 commit 自己的改动。用户禁止他人代为最终汇总 commit,但 TDD 内的逐 task commit 是计划的一部分,按步骤执行即可。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/COMPONENTs/chat-messages/minimap_geometry.js`(新) | 纯函数:高度估算/校准、累积 offset、scale(含 MIN_SEG)、sliding off、计数(99+)、content↔index 换算、absScrollTop。无 React/DOM。 |
| `src/COMPONENTs/chat-messages/minimap_geometry.test.js`(新) | 上面的完整单测。 |
| `src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.js`(改) | 新增 `scrollToMessageIndex(index, behavior)`(跨窗口展开-再跳),在 return 中导出;在 `useLayoutEffect` 加 `toIndex` pending 分支。 |
| `src/COMPONENTs/chat-messages/hooks/use_message_minimap.js`(新) | 高度缓存(按 chatId 隔离)、测量(ResizeObserver + layout effect)、校准、派生 `segments`/`total`/`calib`,bump `version`。 |
| `src/COMPONENTs/chat-messages/hooks/use_message_minimap.test.js`(新) | hook 行为单测(缓存写入、chat 切换清空、segments 估算回退)。 |
| `src/COMPONENTs/chat-messages/components/message_minimap.js`(新) | 渲染 track/inner/ticks/box/上下 pill/计数;命令式 scroll 更新;注入隐藏原生滚动条 CSS。 |
| `src/COMPONENTs/chat-messages/components/message_minimap.test.js`(新) | 角色配色、空/不可滚动 return null、点击→scrollToMessageIndex。 |
| `src/COMPONENTs/chat-messages/chat_messages.js`(改) | 用 `<MessageMinimap/>` 替换 `<MessageJumpControls/>`;容器 class `scrollable`→`chat-scroll-host`。 |

---

## Task 1: 纯几何/估算模块 `minimap_geometry.js`

**Files:**
- Create: `src/COMPONENTs/chat-messages/minimap_geometry.js`
- Test: `src/COMPONENTs/chat-messages/minimap_geometry.test.js`

- [ ] **Step 1: 写失败测试**

Create `src/COMPONENTs/chat-messages/minimap_geometry.test.js`:

```js
import {
  MIN_SEG, GAP, PAD, DEFAULT_CALIB,
  median, estimateHeight, calibrate, buildHeights,
  cumulativeOffsets, pickScale, slideOffset, visibleCounts,
  capCount, indexAtContentY, absScrollTop,
} from "./minimap_geometry";

describe("minimap_geometry", () => {
  test("constants", () => {
    expect(GAP).toBe(7);
    expect(PAD).toBe(GAP + 1);
    expect(MIN_SEG).toBe(7);
  });

  test("median handles odd/even/empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  test("estimateHeight = base + slope*len + attachments*120", () => {
    expect(estimateHeight({ content: "abcd" }, { base: 40, slope: 0.5 })).toBe(42);
    expect(estimateHeight({ content: "ab", attachments: [{}, {}] }, { base: 40, slope: 0.5 }))
      .toBe(40 + 1 + 240);
    expect(estimateHeight({}, DEFAULT_CALIB)).toBe(DEFAULT_CALIB.base);
  });

  test("calibrate uses median slope when >=3 samples, else fallback", () => {
    const fb = { base: 40, slope: 0.3 };
    expect(calibrate([{ len: 10, height: 50 }], fb)).toEqual(fb);
    const c = calibrate(
      [{ len: 10, height: 10 }, { len: 10, height: 20 }, { len: 10, height: 30 }],
      fb,
    );
    expect(c.slope).toBeCloseTo(2, 5); // median of [1,2,3]
    expect(c.base).toBe(40);
  });

  test("buildHeights prefers cache over estimate", () => {
    const cache = new Map([["b", 999]]);
    const hs = buildHeights(
      [{ id: "a", content: "xx" }, { id: "b", content: "xx" }],
      cache,
      { base: 40, slope: 0 },
    );
    expect(hs).toEqual([40, 999]);
  });

  test("cumulativeOffsets", () => {
    expect(cumulativeOffsets([10, 20, 5])).toEqual({ offsets: [0, 10, 30], total: 35 });
    expect(cumulativeOffsets([])).toEqual({ offsets: [], total: 0 });
  });

  test("pickScale = max(fit, minSeg/median)", () => {
    // fit larger
    expect(pickScale({ total: 100, usable: 100, medianHeight: 50, minSeg: 7 })).toBe(1);
    // desired larger (long convo)
    expect(pickScale({ total: 1000, usable: 100, medianHeight: 10, minSeg: 7 }))
      .toBeCloseTo(0.7, 5);
  });

  test("slideOffset clamps; 0 when fits", () => {
    expect(slideOffset({ boxTop: 0, boxHeight: 20, usable: 100, MH: 80 })).toBe(0);
    // overflow, centered then clamped
    expect(slideOffset({ boxTop: 0, boxHeight: 20, usable: 100, MH: 300 })).toBe(0);
    expect(slideOffset({ boxTop: 250, boxHeight: 20, usable: 100, MH: 300 })).toBe(200);
    expect(slideOffset({ boxTop: 150, boxHeight: 20, usable: 100, MH: 300 })).toBe(110);
  });

  test("visibleCounts above/below the window", () => {
    // 3 segs each height 100 at scale 1; window [off=120, off+usable=220]
    const offsets = [0, 100, 200];
    const heights = [100, 100, 100];
    const { above, below } = visibleCounts({ offsets, heights, scale: 1, off: 120, usable: 100 });
    expect(above).toBe(1); // seg0 fully above
    expect(below).toBe(0); // seg2 starts at 200 < 220 → not below
  });

  test("capCount caps at 99+", () => {
    expect(capCount(0)).toBe("0");
    expect(capCount(99)).toBe("99");
    expect(capCount(100)).toBe("99+");
  });

  test("indexAtContentY binary search", () => {
    const offsets = [0, 100, 300];
    const total = 350;
    expect(indexAtContentY({ offsets, total, contentY: 0 })).toBe(0);
    expect(indexAtContentY({ offsets, total, contentY: 150 })).toBe(1);
    expect(indexAtContentY({ offsets, total, contentY: 320 })).toBe(2);
    expect(indexAtContentY({ offsets, total, contentY: 99999 })).toBe(2);
  });

  test("absScrollTop = offset[start] + (scrollTop - firstNodeOffsetTop)", () => {
    expect(absScrollTop({
      offsets: [0, 100, 250], safeVisibleStart: 1, scrollTop: 30, firstNodeOffsetTop: 10,
    })).toBe(120);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `CI=true npx react-scripts test src/COMPONENTs/chat-messages/minimap_geometry.test.js --watchAll=false`
Expected: FAIL — `Cannot find module './minimap_geometry'`.

- [ ] **Step 3: 写实现**

Create `src/COMPONENTs/chat-messages/minimap_geometry.js`:

```js
// 聊天 minimap 的纯几何 + 高度估算。无 React、无 DOM。坐标单位:
//   content px  = 聊天容器内的真实/估算像素
//   minimap px  = content px × scale(轨道内坐标)

export const MIN_SEG = 7; // 最小可辨识段高(minimap px)
export const GAP = 7; // 框上下各外扩(使四边间距与左右一致、首尾留白更足)
export const PAD = GAP + 1; // 裁剪安全边距,保证框两端不被 overflow:hidden 切掉

// 估算参数默认值(运行时会被真实测量校准)
export const DEFAULT_CALIB = { base: 40, slope: 0.32 };

export function median(nums) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function estimateHeight(message, calib = DEFAULT_CALIB) {
  const len =
    message && typeof message.content === "string" ? message.content.length : 0;
  const attachments =
    message && Array.isArray(message.attachments) ? message.attachments.length : 0;
  return calib.base + calib.slope * len + attachments * 120;
}

// 从已测量样本反推 slope(中位),样本不足回退默认
export function calibrate(samples, fallback = DEFAULT_CALIB) {
  const usable = samples.filter((s) => s.len > 0 && s.height > 0);
  if (usable.length < 3) return fallback;
  const slope = median(usable.map((s) => s.height / s.len));
  return { base: fallback.base, slope: slope > 0 ? slope : fallback.slope };
}

export function buildHeights(messages, cache, calib = DEFAULT_CALIB) {
  return messages.map((m) => {
    const cached = cache.get(m.id);
    return typeof cached === "number" && cached > 0 ? cached : estimateHeight(m, calib);
  });
}

export function cumulativeOffsets(heights) {
  const offsets = new Array(heights.length);
  let acc = 0;
  for (let i = 0; i < heights.length; i++) {
    offsets[i] = acc;
    acc += heights[i];
  }
  return { offsets, total: acc };
}

export function pickScale({ total, usable, medianHeight, minSeg = MIN_SEG }) {
  if (total <= 0 || usable <= 0) return 1;
  const fit = usable / total;
  const desired = medianHeight > 0 ? minSeg / medianHeight : fit;
  return Math.max(fit, desired);
}

export function slideOffset({ boxTop, boxHeight, usable, MH }) {
  if (MH <= usable) return 0;
  const raw = boxTop + boxHeight / 2 - usable / 2;
  return Math.min(Math.max(0, raw), MH - usable);
}

export function visibleCounts({ offsets, heights, scale, off, usable }) {
  let above = 0;
  let below = 0;
  for (let i = 0; i < offsets.length; i++) {
    const y = offsets[i] * scale;
    const yEnd = y + heights[i] * scale;
    if (yEnd <= off + 2) above++;
    else if (y >= off + usable - 2) below++;
  }
  return { above, below };
}

export function capCount(n) {
  return n > 99 ? "99+" : String(n);
}

export function indexAtContentY({ offsets, total, contentY }) {
  if (!offsets.length) return 0;
  const y = Math.min(Math.max(0, contentY), Math.max(0, total - 1));
  let lo = 0;
  let hi = offsets.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= y) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function absScrollTop({ offsets, safeVisibleStart, scrollTop, firstNodeOffsetTop }) {
  const base = offsets[safeVisibleStart] || 0;
  return base + (scrollTop - firstNodeOffsetTop);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `CI=true npx react-scripts test src/COMPONENTs/chat-messages/minimap_geometry.test.js --watchAll=false`
Expected: PASS(全部 green)。

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/chat-messages/minimap_geometry.js src/COMPONENTs/chat-messages/minimap_geometry.test.js
git commit -m "feat(chat-minimap): pure geometry + height estimation module"
```

---

## Task 2: `use_message_window_scroll` 加 `scrollToMessageIndex`

**Files:**
- Modify: `src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.js`
- Test: `src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.test.js`

- [ ] **Step 1: 写失败测试(追加到现有 describe)**

在 `use_message_window_scroll.test.js` 的 `describe("useMessageWindowScroll", …)` 块内,`it("keeps the latest…")` 之后追加:

```js
  it("scrollToMessageIndex expands the window when target is above it", () => {
    const messages = buildMessages(40);
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `CI=true npx react-scripts test src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.test.js --watchAll=false`
Expected: FAIL — `result.current.scrollToMessageIndex is not a function`。

- [ ] **Step 3: 实现 — 加 `toIndex` pending 分支**

在 `use_message_window_scroll.js` 的 `useLayoutEffect`(处理 `pendingJumpActionRef` 的那个,约第 295-322 行)里,`if (pendingAction.type === "previous") { … }` 之前,插入新分支:

```js
    if (pendingAction.type === "toIndex") {
      const targetNode = messageNodeRefs.current.get(pendingAction.index);
      if (targetNode) {
        pendingJumpActionRef.current = null;
        el.scrollTo({
          top: Math.max(0, targetNode.offsetTop - 12),
          behavior: pendingAction.behavior || "auto",
        });
        updateIsAtBottom(el);
        return;
      }
      if (visibleStartRef.current > 0) {
        loadOlderMessages();
        return;
      }
      pendingJumpActionRef.current = null;
      return;
    }
```

- [ ] **Step 4: 实现 — 加 `scrollToMessageIndex` callback**

在 `use_message_window_scroll.js` 中,`handleJumpToPreviousMessage` 的 `useCallback`(约第 197-209 行)之后,新增:

```js
  const scrollToMessageIndex = useCallback(
    (index, behavior = "auto") => {
      const el = messagesRef.current;
      if (!el) {
        return;
      }
      const clamped = Math.max(0, Math.min(index, messages.length - 1));

      if (clamped >= visibleStartRef.current) {
        const node = messageNodeRefs.current.get(clamped);
        if (node) {
          el.scrollTo({ top: Math.max(0, node.offsetTop - 12), behavior });
          updateIsAtBottom(el);
          return;
        }
      }

      const nextStart = Math.max(0, clamped - load_batch_size);
      visibleStartRef.current = nextStart;
      pendingJumpActionRef.current = { type: "toIndex", index: clamped, behavior };
      setVisibleStartIndex(nextStart);
    },
    [messages.length, load_batch_size, updateIsAtBottom],
  );
```

- [ ] **Step 5: 实现 — 导出**

在 `use_message_window_scroll.js` 末尾的 `return { … }` 对象里(约第 364-375 行),加入 `scrollToMessageIndex`:

```js
  return {
    messagesRef,
    messageNodeRefs,
    safeVisibleStart,
    visibleMessages,
    isAtBottom,
    isAtTop,
    handleScroll,
    handleBackToBottom,
    handleSkipToTop,
    handleJumpToPreviousMessage,
    scrollToMessageIndex,
  };
```

- [ ] **Step 6: 跑测试确认通过**

Run: `CI=true npx react-scripts test src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.test.js --watchAll=false`
Expected: PASS(新旧两个测试都过)。

- [ ] **Step 7: Commit**

```bash
git add src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.js src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.test.js
git commit -m "feat(chat-minimap): add scrollToMessageIndex (cross-window jump)"
```

---

## Task 3: minimap 数据 hook `use_message_minimap`

**Files:**
- Create: `src/COMPONENTs/chat-messages/hooks/use_message_minimap.js`
- Test: `src/COMPONENTs/chat-messages/hooks/use_message_minimap.test.js`

职责:维护按 chatId 隔离的高度缓存;暴露 `measure()`(从 messageNodeRefs 读真实高度写入缓存并在变化时 bump version);用 `minimap_geometry` 派生 `segments`(content 坐标)+ `total` + `calib`。**不做 scale/scroll**(那是组件的命令式职责)。

- [ ] **Step 1: 写失败测试**

Create `src/COMPONENTs/chat-messages/hooks/use_message_minimap.test.js`:

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `CI=true npx react-scripts test src/COMPONENTs/chat-messages/hooks/use_message_minimap.test.js --watchAll=false`
Expected: FAIL — `Cannot find module './use_message_minimap'`。

- [ ] **Step 3: 写实现**

Create `src/COMPONENTs/chat-messages/hooks/use_message_minimap.js`:

```js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CALIB,
  buildHeights,
  calibrate,
  cumulativeOffsets,
} from "../minimap_geometry";

// 维护高度缓存 + 校准,派生 minimap 的 segment 数据(content 坐标)。
// 不负责 scale/scroll —— 那是 MessageMinimap 组件的命令式职责。
export const useMessageMinimap = ({
  chatId,
  messages,
  messageNodeRefs,
  safeVisibleStart,
}) => {
  const heightCacheRef = useRef(new Map());
  const calibRef = useRef(DEFAULT_CALIB);
  const [version, setVersion] = useState(0);

  // chat 切换:高度按 chat 隔离,清空缓存与校准
  useEffect(() => {
    heightCacheRef.current = new Map();
    calibRef.current = DEFAULT_CALIB;
    setVersion((v) => v + 1);
  }, [chatId]);

  // 从当前挂载节点读真实高度写入缓存;有变化则重算校准并 bump
  const measure = useCallback(() => {
    const cache = heightCacheRef.current;
    let changed = false;
    messageNodeRefs.current.forEach((node, index) => {
      if (!node) return;
      const msg = messages[index];
      if (!msg) return;
      const h = node.offsetHeight;
      if (h > 0 && cache.get(msg.id) !== h) {
        cache.set(msg.id, h);
        changed = true;
      }
    });
    if (changed) {
      const samples = [];
      messages.forEach((m) => {
        const h = cache.get(m.id);
        if (typeof h === "number") {
          samples.push({ len: (m.content || "").length, height: h });
        }
      });
      calibRef.current = calibrate(samples, DEFAULT_CALIB);
      setVersion((v) => v + 1);
    }
  }, [messages, messageNodeRefs]);

  // 派生 segments(content 坐标)
  const { segments, total } = useMemo(() => {
    const heights = buildHeights(messages, heightCacheRef.current, calibRef.current);
    const { offsets, total: tot } = cumulativeOffsets(heights);
    const segs = messages.map((m, i) => ({
      id: m.id,
      role: m.role,
      top: offsets[i],
      height: heights[i],
    }));
    return { segments: segs, total: tot };
    // version 进入依赖:测量/换 chat 后重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, version]);

  return { segments, total, measure, safeVisibleStart };
};

export default useMessageMinimap;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `CI=true npx react-scripts test src/COMPONENTs/chat-messages/hooks/use_message_minimap.test.js --watchAll=false`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/chat-messages/hooks/use_message_minimap.js src/COMPONENTs/chat-messages/hooks/use_message_minimap.test.js
git commit -m "feat(chat-minimap): height cache + segment data hook"
```

---

## Task 4: 组件 `MessageMinimap`

**Files:**
- Create: `src/COMPONENTs/chat-messages/components/message_minimap.js`
- Test: `src/COMPONENTs/chat-messages/components/message_minimap.test.js`

职责:接收 `{ messagesRef, segments, total, safeVisibleStart, measure, scrollToMessageIndex, isDark }`;渲染 track / inner(可滑动)/ ticks / box / 上下 pill / 计数;在 `messagesRef` 的 scroll 上**命令式**更新(用 `minimap_geometry` 算 scale/off/box/counts/highlight);注入隐藏原生滚动条的 CSS。空对话或不可滚动时不渲染交互。

- [ ] **Step 1: 写失败测试**

Create `src/COMPONENTs/chat-messages/components/message_minimap.test.js`:

```js
import { render } from "@testing-library/react";
import MessageMinimap from "./message_minimap";

const seg = (id, role, top, height) => ({ id, role, top, height });

const baseProps = (over = {}) => ({
  messagesRef: { current: null },
  segments: [seg("a", "user", 0, 100), seg("b", "assistant", 100, 100)],
  total: 200,
  safeVisibleStart: 0,
  measure: () => {},
  scrollToMessageIndex: jest.fn(),
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

test("user tick is grey, assistant tick is blue (dark)", () => {
  const { container } = render(<MessageMinimap {...baseProps()} />);
  const ticks = container.querySelectorAll('[data-mm-tick]');
  expect(ticks[0].style.background).toContain("255, 255, 255"); // user 灰
  expect(ticks[1].style.background).toContain("120, 170, 255"); // assistant 蓝
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `CI=true npx react-scripts test src/COMPONENTs/chat-messages/components/message_minimap.test.js --watchAll=false`
Expected: FAIL — `Cannot find module './message_minimap'`。

- [ ] **Step 3: 写实现**

Create `src/COMPONENTs/chat-messages/components/message_minimap.js`:

```js
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  GAP,
  PAD,
  MIN_SEG,
  median,
  pickScale,
  slideOffset,
  visibleCounts,
  capCount,
  indexAtContentY,
} from "../minimap_geometry";

const EASE = "cubic-bezier(.22,.61,.36,1)";
const INSET_BASE = 30;
const INSET_COUNTS = 46;

const PALETTE = {
  dark: {
    uOff: "rgba(255,255,255,0.13)", uOn: "rgba(255,255,255,0.50)",
    aOff: "rgba(120,170,255,0.40)", aOn: "rgba(120,170,255,0.95)",
    box: "rgba(255,255,255,0.28)", boxIdle: "rgba(255,255,255,0.12)",
    pillBg: "rgba(255,255,255,0.12)", pillFg: "rgba(255,255,255,0.85)",
    count: "rgba(255,255,255,0.40)",
  },
  light: {
    uOff: "rgba(0,0,0,0.12)", uOn: "rgba(0,0,0,0.42)",
    aOff: "rgba(40,110,230,0.35)", aOn: "rgba(40,110,230,0.85)",
    box: "rgba(0,0,0,0.25)", boxIdle: "rgba(0,0,0,0.10)",
    pillBg: "rgba(0,0,0,0.10)", pillFg: "rgba(0,0,0,0.70)",
    count: "rgba(0,0,0,0.40)",
  },
};

const CH_UP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 15 12 9 18 15"/></svg>';
const CH_DOWN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

// 注入一次:隐藏聊天容器原生滚动条(inline 无法写伪元素)
let styleInjected = false;
const ensureStyle = () => {
  if (styleInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.textContent =
    ".chat-scroll-host{scrollbar-width:none;-ms-overflow-style:none;}" +
    ".chat-scroll-host::-webkit-scrollbar{width:0;height:0;display:none;}";
  document.head.appendChild(el);
  styleInjected = true;
};

const MessageMinimap = ({
  messagesRef,
  segments,
  total,
  safeVisibleStart,
  measure,
  scrollToMessageIndex,
  isDark,
}) => {
  const C = PALETTE[isDark ? "dark" : "light"];
  const miniRef = useRef(null);
  const innerRef = useRef(null);
  const boxRef = useRef(null);
  const topPillRef = useRef(null);
  const botPillRef = useRef(null);
  const cTopRef = useRef(null);
  const cBotRef = useRef(null);
  const tickRefs = useRef([]);
  const hideTimer = useRef(null);

  useEffect(() => {
    ensureStyle();
  }, []);

  // 命令式更新:scale/off/box/highlight/counts/pill。不触发 React re-render。
  useLayoutEffect(() => {
    const el = messagesRef.current;
    const mini = miniRef.current;
    const inner = innerRef.current;
    const box = boxRef.current;
    if (!el || !mini || !inner || !box || !segments.length) return undefined;

    const heights = segments.map((s) => s.height);
    const medH = median(heights);

    let scale = 1;
    let usable = 0;
    let MH = 0;
    let overflow = false;

    const recalcGeometry = () => {
      const stackH = mini.parentElement
        ? mini.parentElement.clientHeight
        : mini.clientHeight;
      const baseUsable = stackH - 2 * INSET_BASE - 2 * PAD;
      const willOverflow =
        pickScale({ total, usable: baseUsable, medianHeight: medH, minSeg: MIN_SEG }) *
          total >
        baseUsable + 1;
      const inset = willOverflow ? INSET_COUNTS : INSET_BASE;
      mini.style.top = `${inset}px`;
      mini.style.bottom = `${inset}px`;
      const trackH = mini.clientHeight;
      usable = trackH - 2 * PAD;
      scale = pickScale({ total, usable, medianHeight: medH, minSeg: MIN_SEG });
      MH = total * scale;
      overflow = MH > usable + 1;
      // 定位 ticks(content→minimap)
      tickRefs.current.forEach((tk, i) => {
        if (!tk) return;
        const s = segments[i];
        tk.style.top = `${PAD + s.top * scale}px`;
        tk.style.height = `${Math.max(3, s.height * scale - 3)}px`;
      });
    };

    const update = () => {
      const st = el.scrollTop;
      const viewH = el.clientHeight;
      const boxTop = st * scale;
      const boxH = Math.max(20, viewH * scale);
      const off = slideOffset({ boxTop, boxHeight: boxH, usable, MH });
      inner.style.transform = `translateY(${-off}px)`;
      box.style.top = `${PAD + boxTop - GAP}px`;
      box.style.height = `${boxH + 2 * GAP}px`;

      const vTop = st * scale;
      const vBtm = vTop + viewH * scale;
      tickRefs.current.forEach((tk, i) => {
        if (!tk) return;
        const s = segments[i];
        const y = s.top * scale;
        const yEnd = y + s.height * scale;
        const inView = yEnd > vTop && y < vBtm;
        tk.style.background = inView
          ? s.role === "user"
            ? C.uOn
            : C.aOn
          : s.role === "user"
          ? C.uOff
          : C.aOff;
      });

      const cTop = cTopRef.current;
      const cBot = cBotRef.current;
      if (overflow) {
        const { above, below } = visibleCounts({
          offsets: segments.map((s) => s.top),
          heights,
          scale,
          off,
          usable,
        });
        cTop.textContent = `↑ ${capCount(above)}`;
        cBot.textContent = `↓ ${capCount(below)}`;
        cTop.style.opacity = above > 0 ? "1" : "0";
        cBot.style.opacity = below > 0 ? "1" : "0";
      } else {
        cTop.style.opacity = "0";
        cBot.style.opacity = "0";
      }

      const contentH = el.scrollHeight;
      topPillRef.current.style.opacity = st > 2 ? "1" : "0";
      topPillRef.current.style.pointerEvents = st > 2 ? "auto" : "none";
      const atBottom = contentH - (st + viewH) <= 24;
      botPillRef.current.style.opacity = atBottom ? "0" : "1";
      botPillRef.current.style.pointerEvents = atBottom ? "none" : "auto";
    };

    const showActive = () => {
      box.style.borderColor = C.box;
      box.style.opacity = "1";
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    const scheduleHide = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        box.style.borderColor = C.boxIdle;
        box.style.opacity = "0.6";
      }, 1200);
    };
    const onScroll = () => {
      measure();
      showActive();
      update();
      scheduleHide();
    };

    recalcGeometry();
    update();

    el.addEventListener("scroll", onScroll, { passive: true });
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            measure();
            recalcGeometry();
            update();
          })
        : null;
    if (ro) {
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (ro) ro.disconnect();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [segments, total, C, measure, messagesRef]);

  if (!segments.length) return null;

  const jumpToRatio = (clientY) => {
    const el = messagesRef.current;
    const mini = miniRef.current;
    if (!el || !mini) return;
    const r = mini.getBoundingClientRect();
    const heights = segments.map((s) => s.height);
    const medH = median(heights);
    const usable = mini.clientHeight - 2 * PAD;
    const scale = pickScale({ total, usable, medianHeight: medH, minSeg: MIN_SEG });
    const MH = total * scale;
    const st = el.scrollTop;
    const boxH = Math.max(20, el.clientHeight * scale);
    const off = slideOffset({ boxTop: st * scale, boxHeight: boxH, usable, MH });
    const rel = Math.min(Math.max(0, clientY - r.top - PAD), usable);
    const contentY = (rel + off) / scale;
    const index = indexAtContentY({
      offsets: segments.map((s) => s.top),
      total,
      contentY,
    });
    scrollToMessageIndex(index, "auto");
  };

  let dragging = false;

  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: 22,
        zIndex: 2,
      }}
      data-mm-stack
    >
      <div
        ref={cTopRef}
        style={{
          position: "absolute",
          left: "50%",
          top: 30,
          transform: "translateX(-50%)",
          fontSize: 9,
          fontWeight: 600,
          color: C.count,
          opacity: 0,
          transition: "opacity .25s ease",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      />
      <div
        ref={cBotRef}
        style={{
          position: "absolute",
          left: "50%",
          bottom: 30,
          transform: "translateX(-50%)",
          fontSize: 9,
          fontWeight: 600,
          color: C.count,
          opacity: 0,
          transition: "opacity .25s ease",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      />

      <div
        ref={miniRef}
        data-mm-track
        style={{
          position: "absolute",
          right: 3,
          top: INSET_BASE,
          bottom: INSET_BASE,
          width: 16,
          overflow: "hidden",
          cursor: "pointer",
        }}
        onPointerDown={(e) => {
          dragging = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          jumpToRatio(e.clientY);
        }}
        onPointerMove={(e) => {
          if (dragging) jumpToRatio(e.clientY);
        }}
        onPointerUp={() => {
          dragging = false;
        }}
      >
        <div ref={innerRef} style={{ position: "absolute", left: 0, right: 0, top: 0 }}>
          <div
            ref={boxRef}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              borderRadius: 100,
              border: `1px solid ${C.boxIdle}`,
              opacity: 0.6,
              pointerEvents: "none",
              transition: `top .14s ${EASE}, height .14s ${EASE}, border-color .25s, opacity .3s`,
            }}
          />
          {segments.map((s, i) => (
            <div
              key={s.id}
              data-mm-tick
              data-mm-role={s.role}
              ref={(n) => {
                tickRefs.current[i] = n;
              }}
              style={{
                position: "absolute",
                left: "50%",
                width: 4,
                transform: "translateX(-50%)",
                borderRadius: 100,
                background: s.role === "user" ? C.uOff : C.aOff,
                transition: `background .25s ${EASE}`,
              }}
            />
          ))}
        </div>
      </div>

      <div
        ref={topPillRef}
        onClick={() => {
          const el = messagesRef.current;
          if (el) el.scrollTo({ top: 0, behavior: "smooth" });
        }}
        style={{
          position: "absolute",
          left: "50%",
          top: 4,
          width: 16,
          height: 24,
          transform: "translateX(-50%)",
          borderRadius: 100,
          background: C.pillBg,
          color: C.pillFg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          opacity: 0,
          pointerEvents: "none",
          transition: "opacity .22s ease, background .2s",
        }}
        dangerouslySetInnerHTML={{ __html: `<span style="width:10px;height:10px;display:block">${CH_UP}</span>` }}
      />
      <div
        ref={botPillRef}
        onClick={() => {
          const el = messagesRef.current;
          if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }}
        style={{
          position: "absolute",
          left: "50%",
          bottom: 4,
          width: 16,
          height: 24,
          transform: "translateX(-50%)",
          borderRadius: 100,
          background: C.pillBg,
          color: C.pillFg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          opacity: 0,
          pointerEvents: "none",
          transition: "opacity .22s ease, background .2s",
        }}
        dangerouslySetInnerHTML={{ __html: `<span style="width:10px;height:10px;display:block">${CH_DOWN}</span>` }}
      />
    </div>
  );
};

export default MessageMinimap;
```

> 说明:pill 的点击用 `scrollTo`(平滑)而非 hook 的 handler,是因为 minimap 自己拥有容器 ref 且只需到顶/到底;若想复用跨窗口展开,可改调 `scrollToMessageIndex(0)` / `scrollToMessageIndex(segments.length-1)`。本计划保持简单用 `scrollTo`,跨窗口展开由 Task 5 透传的 handler 在 chat_messages 层接管(见 Task 5 备注)。

- [ ] **Step 4: 跑测试确认通过**

Run: `CI=true npx react-scripts test src/COMPONENTs/chat-messages/components/message_minimap.test.js --watchAll=false`
Expected: PASS(3 个测试)。jsdom 下 useLayoutEffect 因 `messagesRef.current` 为 null 提前 return,不影响渲染断言。

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/chat-messages/components/message_minimap.js src/COMPONENTs/chat-messages/components/message_minimap.test.js
git commit -m "feat(chat-minimap): MessageMinimap component (ticks, box, pills, counts, sliding)"
```

---

## Task 5: 接入 `chat_messages.js`(替换 jump controls + 接管)

**Files:**
- Modify: `src/COMPONENTs/chat-messages/chat_messages.js`
- Test: `src/COMPONENTs/chat-messages/chat_messages.plan_doc.test.js`

备注:`MessageMinimap` 的上下 pill 默认用 `scrollTo`(到顶/到底);PuPu windowing 下「到顶」需要展开窗口才能真到第一条。为复用跨窗口逻辑,**在 chat_messages 层不额外处理**——`scrollToMessageIndex` 已透传给 minimap 供拖动/点击轨道跳转使用;pill 的平滑 `scrollTo(0)` 在已展开到顶时即真到顶,未展开时会触发 `handleScroll` 的 `loadOlderMessages` 自动继续上拉,行为可接受。若后续要 pill 严格一键到首条,把 Task 4 两个 pill 的 onClick 换成 `props.onSkipToTop` / `props.onBackToBottom` 并在此处透传 `handleSkipToTop` / `handleBackToBottom`。

- [ ] **Step 1: 写失败测试**

替换 `chat_messages.plan_doc.test.js` 全文为(包 `ConfigContext.Provider` + `scrollTo` polyfill,对齐原文件写法,否则 ChatMessages 挂载时 `useMessageWindowScroll` 调 `scrollTo` 会报错):

```js
import { render } from "@testing-library/react";
import ChatMessages from "./chat_messages";
import { ConfigContext } from "../../CONTAINERs/config/context";

beforeAll(() => {
  if (!HTMLElement.prototype.scrollTo) {
    HTMLElement.prototype.scrollTo = function scrollTo() {};
  }
});

const messages = [
  { id: "m0", role: "user", content: "hello" },
  { id: "m1", role: "assistant", content: "world" },
];

const renderCM = (props = {}) =>
  render(
    <ConfigContext.Provider
      value={{ onThemeMode: "light_mode", theme: { color: "#222" } }}
    >
      <ChatMessages chatId="c1" messages={messages} {...props} />
    </ConfigContext.Provider>,
  );

describe("ChatMessages minimap integration", () => {
  it("is a function component", () => {
    expect(typeof ChatMessages).toBe("function");
  });

  it("uses chat-scroll-host (minimap takeover), not the global scrollable class", () => {
    const { container } = renderCM();
    expect(container.querySelector(".chat-scroll-host")).not.toBeNull();
    expect(container.querySelector(".scrollable")).toBeNull();
  });

  it("renders the minimap track when there are messages", () => {
    const { container } = renderCM();
    expect(container.querySelector("[data-mm-track]")).not.toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `CI=true npx react-scripts test src/COMPONENTs/chat-messages/chat_messages.plan_doc.test.js --watchAll=false`
Expected: FAIL —— `.chat-scroll-host` / `[data-mm-track]` 找不到(当前仍是 `.scrollable` + jump controls)。

- [ ] **Step 3: 实现 — import 与 hook**

在 `chat_messages.js` 顶部 import 区:把
```js
import MessageJumpControls from "./components/message_jump_controls";
```
替换为
```js
import MessageMinimap from "./components/message_minimap";
import { useMessageMinimap } from "./hooks/use_message_minimap";
```

在解构 `useMessageWindowScroll(...)` 返回值处(约第 35-54 行),加入 `scrollToMessageIndex`:
```js
  const {
    messagesRef,
    messageNodeRefs,
    safeVisibleStart,
    visibleMessages,
    isAtBottom,
    isAtTop,
    handleScroll,
    handleBackToBottom,
    handleSkipToTop,
    handleJumpToPreviousMessage,
    scrollToMessageIndex,
  } = useMessageWindowScroll({ /* 原有参数不变 */
    chat_id: chatId,
    messages,
    is_streaming: isStreaming,
    initial_visible_count: initialVisibleCount,
    load_batch_size: loadBatchSize,
    top_load_threshold: topLoadThreshold,
    boot_visible_count: bootVisibleCount,
  });

  const { segments, total, measure } = useMessageMinimap({
    chatId,
    messages,
    messageNodeRefs,
    safeVisibleStart,
  });
```

- [ ] **Step 4: 实现 — 改容器 class**

把滚动容器(约第 64-67 行)的 `className={className}` 改为固定的接管 class:
```js
      <div
        ref={messagesRef}
        className="chat-scroll-host"
        onScroll={handleScroll}
```
(保留 `className` prop 以兼容外部传入,但默认接管 class 优先。若要兼容外部 class,可写 `className={\`chat-scroll-host ${className === "scrollable" ? "" : className}\`.trim()}`。本计划用固定 `"chat-scroll-host"` 即可。)

- [ ] **Step 5: 实现 — 替换 jump controls 为 minimap**

把底部的 `<MessageJumpControls … />`(约第 166-176 行)整体替换为:
```js
      <MessageMinimap
        messagesRef={messagesRef}
        segments={segments}
        total={total}
        safeVisibleStart={safeVisibleStart}
        measure={measure}
        scrollToMessageIndex={scrollToMessageIndex}
        isDark={isDark}
      />
```

- [ ] **Step 6: 跑测试确认通过**

Run: `CI=true npx react-scripts test src/COMPONENTs/chat-messages/chat_messages.plan_doc.test.js --watchAll=false`
Expected: PASS(3 个测试)。

- [ ] **Step 7: 跑整个 chat-messages 目录回归**

Run: `CI=true npx react-scripts test src/COMPONENTs/chat-messages --watchAll=false`
Expected: PASS(geometry / window-scroll / minimap hook / minimap component / chat_messages 全绿)。

- [ ] **Step 8: 确认 `message_jump_controls.js` 已无引用并删除**

Run: `grep -rn "message_jump_controls\|MessageJumpControls" src`
Expected: 无输出(除测试外无引用)。然后:
```bash
git rm src/COMPONENTs/chat-messages/components/message_jump_controls.js
```
若上面 grep 仍有非本任务引用,**不要删**,改为保留文件,并在本计划记录该引用点待后续处理。

- [ ] **Step 9: Commit**

```bash
git add src/COMPONENTs/chat-messages/chat_messages.js src/COMPONENTs/chat-messages/chat_messages.plan_doc.test.js
git commit -m "feat(chat-minimap): integrate minimap into ChatMessages, remove jump controls"
```

---

## Task 6: 运行时视觉/手感验证(无法单测的部分)

**Files:** 无代码改动(验证 + 必要微调)。

- [ ] **Step 1: 启动 app**

Run: `npm start`(React 端口 2907 + Electron)。打开任意聊天。

- [ ] **Step 2: 短对话(≤12 条)核对**
检查:minimap 铺满轨道、无计数、user 灰 / assistant 蓝、描边框框住视口且四边间距一致(上下略大)、滚动框平滑跟随、停手 1.2s 淡出、原生滚动条不可见。

- [ ] **Step 3: 长对话(>100 条)核对**
检查:节点保持可辨识大小、minimap 内容随滚动滑动、顶/底 `↑N / ↓M` 实时变化且超 99 显示 `99+`、上下 pill 在非顶/非底时出现、点击/拖动 minimap 跳转正确(含跳到未加载的历史区,窗口自动展开)。

- [ ] **Step 4: 主题切换**
切 light/dark,核对两套配色与原型一致。

- [ ] **Step 5: 流式**
发一条消息,核对流式时最后一段与描边框随高度增长而变化、在底部时自动跟随。

- [ ] **Step 6: 回归(pupu-test-api)**
用 `pupu-test-api` skill 跑:创建 chat → 发消息(blocking)→ 切模型 → 读 state/截图,确认聊天生命周期未被破坏。

- [ ] **Step 7: 如需微调**
只调 `message_minimap.js` 的 `PALETTE` / `INSET_*` / 动效时长;若改了几何相关常量,回到 `minimap_geometry.js` 并补/改对应单测后重跑 Task 1 测试。

- [ ] **Step 8: 留 dirty 状态**
**不要做最终汇总 commit**(用户规则)。各 Task 的逐项 commit 已完成;把工作区留给用户自行 commit。

---

## 实施期修正(post-implementation)

- **absScrollTop 漏实现修复(最终复审发现):** Task 4 原始组件代码沿用了原型的 `el.scrollTop * scale`,但 PuPu 虚拟化下 `el.scrollTop` 是**窗口相对**坐标,而 segments offset 是**整段绝对**坐标,导致 >12 条对话框选/计数/滑动错位。已按 spec §4b.1 修复:组件接收 `messageNodeRefs`,用 `absScrollTop({offsets, safeVisibleStart, scrollTop, firstNodeOffsetTop})` 把窗口相对量换算为绝对量(`update()` 与 `jumpToRatio()` 一致使用);pill 显隐改用绝对量(`atTop=absTop<=2`、`atBottom=total-(absTop+viewH)<=24`);top pill 点击改用 `scrollToMessageIndex(0,"smooth")`(跨窗口到首条),bottom pill 保留 `scrollTo(scrollHeight)`(末段恒在窗口内)。`chat_messages.js` 增传 `messageNodeRefs`。此修复 jsdom 无法单测(无布局),靠 Task 6 运行时验证。
- **className 死 prop 清理:** 接管后 `chat_messages.js` 的 `className="scrollable"` 默认 prop 失效,已移除(连带清理接管后未用的 `theme/color/attachPanelBg/isAtBottom/isAtTop/handleBackToBottom/handleSkipToTop/handleJumpToPreviousMessage`,否则 CI build 因未用变量 warning 失败)。
- **框两端被裁修复(运行时验证发现):** 框位置基于「真实滚动坐标」(含容器上下 padding + 消息 gap),而 `scale`/`MH` 基于「消息高度之和坐标」,两坐标系不一致 → 滚到顶 boxTop 变负(顶部裁切)、滚到底 box 超出轨道(底部裁切)。修复:`update()` 里把 `boxTop` 夹紧到内容范围 `Math.min(Math.max(0, absTop*scale), Math.max(0, MH - boxH))`。运行时实测(轨道 573):顶 boxTop 1、底 boxBottom 572,两端均不裁,且仍随滚动单调跟随。overflow/sliding 情形该夹紧亦安全(推导:底部 visual bottom = trackH−1)。

## 实施期 bug 修复(运行时 systematic-debugging)

- **位置标记不准(根因已证实):** minimap 的 `offsets[]`/`total` 来自 `cumulativeOffsets(heights)` = 纯「消息高度累加」坐标;但聊天容器的真实 `scrollTop` 坐标含 `paddingTop(28)+paddingBottom(64)+消息间 gap(20×(n-1))`。证据:某 4 消息聊天 `scrollHeight(3290) - Σ高度(3138) = 152 = 28+64+3×20`,差额随消息数线性增长。`absScrollTop` 把「压缩空间的 offsets」与「真实空间的 scrollTop」混用 → 框/刻度/计数系统性偏移(实测 real 0→box 0.098,real 1→box 0.902)。**修复**:`message_minimap.js` 在 `recalcGeometry`/`jumpToRatio` 里从 DOM 量出 `paddingTop/paddingBottom/rowGap`,构造 `cOffsets[i]`(= 真实 `offsetTop[i]`)与 `cTotal`(= 真实 `scrollHeight`),框/刻度/计数/`atBottom`/点击跳转全部改用这套真实坐标。修复后非溢出聊天位置映射线性准确(0→0.08, 0.5→0.5, 1→0.92,即正确的视口-thumb 行为)。padding/gap 从 `getComputedStyle` 量,不写死。
- **artifact 折叠致 minimap 显示不全:** 同根因的次生症状 —— artifact 消息很高,折叠/展开改变了「被忽略的 gap 累加」落点,使底部刻度/框落到轨道外。坐标系修复后,展开(content 4120→4734)与折叠(→4120)两态实测刻度均填满轨道、框滚到底 `boxBotFrac 0.998` 不裁切;`ResizeObserver` 触发 `measure()` 更新高度缓存→几何重算,动态切换跟随正常。
- **计数标签去箭头(用户反馈):** `↑N/↓N` 的箭头被误读为数字,改为纯数字 `capCount(above)`。

## Self-Review(已核对 spec)

- **§2 视觉规格** → Task 1 常量(GAP/PAD/MIN_SEG)+ Task 4 PALETTE/尺寸/pill;✅
- **§3 虚拟化 + §4 高度缓存/估算** → Task 3(缓存、measure、校准、估算回退);✅
- **§4b sliding window + §4b.1 视口框 + §4b.2 计数 + §4b.3 动态内边距** → Task 1(pickScale/slideOffset/visibleCounts/capCount)+ Task 4(recalcGeometry/update);✅
- **§4c 跨窗口跳转** → Task 2(scrollToMessageIndex)+ Task 4(jumpToRatio→indexAtContentY);✅
- **§4d 上下 pill** → Task 4(topPill/botPill 显隐 + 点击);✅(pill 一键到首条的严格版见 Task 5 备注)
- **§4e 流式** → Task 4 ResizeObserver + onScroll measure;Task 6 Step 5 验证;✅
- **§5 接管(去 overlay + 隐藏原生 + 移除 jump controls)** → Task 4 ensureStyle + Task 5(class 改 chat-scroll-host、删 MessageJumpControls);✅
- **§7 边界(空/不可滚动/换 chat/reduce-motion)** → Task 3(换 chat 清缓存)+ Task 4(空 segments return null);**reduce-motion 未覆盖** → 见下方补充任务。

### Task 4b(补):尊重 prefers-reduced-motion

**Files:** Modify `src/COMPONENTs/chat-messages/components/message_minimap.js`

- [ ] **Step 1:** 在 `ensureStyle` 的 `el.textContent` 字符串里追加一条媒体查询(用 `+` 连接),关闭 minimap 自身的过渡。minimap 是滚动容器的兄弟节点、有 `data-mm-stack` 标记,故选择器命中 `[data-mm-stack]`:
```js
    "@media (prefers-reduced-motion: reduce){[data-mm-stack] *{transition:none !important;}}";
```
- [ ] **Step 2:** Run: `CI=true npx react-scripts test src/COMPONENTs/chat-messages/components/message_minimap.test.js --watchAll=false` → Expected: PASS(渲染断言不受影响)。
- [ ] **Step 3:** Commit:
```bash
git add src/COMPONENTs/chat-messages/components/message_minimap.js
git commit -m "feat(chat-minimap): respect prefers-reduced-motion"
```
