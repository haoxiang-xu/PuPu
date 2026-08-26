---
name: bundle-driven-rows-mount-and-layout
description: bundle 驱动的 trace 行（memory_v2 / token summary）不是帧，因此对 lazy 占位高度模型不可见；且 memory_v2 的挂载门是整个 TraceChain 的门不是行的门，在报错回合上还是唯一的门
metadata:
  type: project
---

2026-08-08 于 PuPu HEAD `b2385d5d` 逐行核实（`0000-0005-2026-0807` 庭审取证）。全部为静态读取，未跑探针。

**1. `isMemoryV2TraceBundle` 是 `<TraceChain>` 整组件的门，不是链内一行的门。**
`chat_bubble.js:102-110` / `character_chat_bubble.js:133-141`（两面逐字同形）：
```js
const hasTokenSummary = isAssistant && message.status === "done" && consumed_tokens > 0;
const hasMemoryV2Audit = isAssistant && isMemoryV2TraceBundle(message.meta?.bundle?.memory_v2);
const shouldRenderTraceChain = hasVisibleTraceActivity || hasTokenSummary || hasMemoryV2Audit;
```
**`hasTokenSummary` 要求 `message.status === "done"`**，所以在 `error`/`cancelled`/`failed` 的回合上另外两个门都是 false —— **memory_v2 门是唯一的门**。任何改变 `sanitizeMemoryV2TraceBundle` 准入的动作（如给 `TOP_LEVEL_KEYS` 扩表）都会在"整张键集落白名单外"的 bundle 上让 **一整块组件出现或消失**，两个气泡面同时发生。

**2. lazy 占位高度模型对 bundle 驱动行完全不可见 —— 这是本面已知的布局塌点。**
`lazy_trace_chain.js:34-49` 的 `countDisplayFrames` 只数 `DISPLAY_FRAME_TYPES` 里的 **帧**（且排除 `tool_result`）；`estimatePlaceholderHeight:52-70` 在帧数 ≤ 0 时返回 `BASE_PLACEHOLDER_HEIGHT = 24`。**memory_v2 行与 token summary 行都由 `bundle` 驱动、不是帧，所以对该估算是零。**
该文件自己的头注释（`:4-8`）写明了后果，一字不改抄在这里，因为它就是复现条件：
> Opening an old conversation mounts every bubble's trace inside a 200ms idle window. A fixed 24px placeholder that expands to the real (often hundreds of px) TraceChain makes the scroll anchor drift and the minimap re-calibrate on every mount.

**复现条件**：重开一个长会话 → 每个气泡的 trace 在同一个 200ms idle window 内挂载 → 凡是"只有 bundle 行、没有工具帧"的消息，占位 24px 撑成实高。**已经在 token summary 上小规模发生；任何让更多消息挂上 TraceChain 的改动都会把它放大成 N 次。**
**注意**：`TRACE_HEIGHT_CACHE`（module 级 Map，上限 500，满了整清）只在**同一进程内重开同一 messageId** 时救得到，首次打开救不到。

**3. `audit.journalReload` 是一处活着的死写 —— "加个字段给下游读"这条处方在本边界的失败实例。**
`memory_v2_journal_reload.js:490` 的 `mergeMemoryV2AuditWithJournal` 往 audit 上挂 `journalReload: {status, reason, errorCode, pagesRead, eventsScanned}`，**全 `src/` 零读取**。旁边的 `MemoryV2ContextAudit` 不读它；面板里那些数字由子组件 `MemoryV2CanonicalJournalReload` 自己 fetch 并持有本地 state。
**失败机制与 `unknownEvents` / `diagnostics` 那两次不同**（那两次是"没有读者位置"）：**这里读者位置存在、就在同一个组件里，只是一个"就地自己取"的实现先把活干了。** 三次三种输法，同一结果。
**一处顺带的反讽**：这份没人读的 `journalReload.errorCode` 经 `identifierText(...,160)` 过滤；而 **屏幕上** 那份 `audit.errorCode` 从 `presentMemoryV2Audit:382-385` 只经 160 字符截断，`AuditRow` 原样渲染（`whiteSpace:pre-wrap` / `overflowWrap:anywhere` / `userSelect:text`），**无任何模式过滤**。React 自带转义所以没有注入面，但值可选中、可截图。

**4. `mergeMemoryV2AuditWithJournal` 从不触碰 `audit.status`。**
它只合并 `refs`、`agentRuns` 并追加 `journalReload`。故 `runStatusRank`/`mergeRuns` 那条跨数据源仲裁策略（见 [[trace-status-vocabulary-collision]] 第 3 条）**治权只及 `agentRuns`** —— journal 投影说什么都改不了 `Memory V2 · X` 那个词。判断"journal reload 会不会影响 trace 状态"时不要绕远路，答案是不会。

**Why:** 这四条决定了任何"给 trace 加一行 / 改挂载条件 / 加个字段让下游读"的判断。不知道 1 就会以为改准入只影响一行；不知道 2 就会重现 minimap 抖动那个已经被修过一次的坑；不知道 3 就会造第四个没人读的字段；不知道 4 就会去 journal 那边找状态错的原因。

**How to apply:** 动挂载门、动 `TOP_LEVEL_KEYS` 的准入、或往 trace 加任何非帧驱动的行之前先读这条。要加 bundle 驱动行就同批给 `estimatePlaceholderHeight` 一个对应项，否则布局成本必然回来。相关 [[memory-v2-trace-contract]] · [[issue-168-phase-b-landed]]。
