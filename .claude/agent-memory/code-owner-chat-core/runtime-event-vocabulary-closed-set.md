---
name: runtime-event-vocabulary-closed-set
description: The v4 runtime event bus is a closed 14-type whitelist with two silent-drop gates and a diagnostics buffer that nothing reads — adding a frame type gets zero feedback
metadata:
  type: project
---

**runtime event 总线是一个封闭词汇表，未知类型无声消失。** 核实于 2026-08-07（法庭 `0000-0002-2026-0807` E-0027，PuPu HEAD `8d7fbd1d`）。**这三个文件都在 `code-owner-shared-arteries` 边界内，不是我的** —— 但它们是我驱动的流的下游门禁，我每次核算「加个帧要多少钱」都要重走一遍。

## 两道门

**门 1 · `src/SERVICEs/runtime_events/event_store.js:1-16`** —— `RUNTIME_EVENT_TYPES` 是 14 项 `Set`：

```
session.started · run.started · run.completed · run.failed
turn.started · turn.completed
step.started · step.delta · step.completed
interaction.requested · interaction.resolved · interaction.fyi_injected
artifact.created · artifact.updated
```

`:189-192`：不在集合里 → 塞进 `diagnostics.unknownEvents`（上限 100）→ `return null`。**进不了 store。**

**门 2 · `activity_tree.js:398-849`** —— reducer 是 17 个平铺 `if (eventType === ...)`，最后一个（`:816` `input.resolved`）之后 **函数直接结束，没有 else、没有 default、不产生任何 diagnostic**。

## 为什么这是坑而不只是设计

`grep -rn "unknownEvents|droppedEvents|duplicateEvents" src/ --include="*.js"` 排除测试后，命中 **全部落在 `runtime_events/` 模块内部**。**没有任何 UI、日志、测试台读它。**

> **后端新增一个 runtime event 类型，今天得到零反馈：不崩、不报错、不打点、测试不红。** 与 `worker_status` / `candidate_count` 那类「产出即丢弃」同一失败类，但发生在帧层且更糟 —— presenter 至少有一张能读的白名单，reducer 那道 **连计数都没有**。

## 两条容易踩的细节

1. **store 的词表名与 reducer 的分支名对不上，不能靠肉眼比对。** `activity_tree.js:903-921` 把 `step.started/delta/completed` 按 payload 投影成 `model.*` / `tool.*` / `input.*`。所以 reducer 里那些 `model.started` / `tool.completed` 分支在 `RUNTIME_EVENT_TYPES` 里 **一个都找不到**。
2. **重放路径共用同一套门。** `stream_replay_projector.js:1-6` / `:104-113` 直接 import 同一个 store + reducer + adapter。开了门就免费覆盖 durable resume；**但也没有任何绕过口**。注意它的返回值是 11 字段固定表（`:130-152`），新信号若不落在 `trace.frames` 里，重放还要再加字段。
3. **持久化不是门。** `chat_storage_sanitize.js:419` 对 frame `type` 只做 `String()` + 64 字符截断，**无白名单**。新帧类型不需要为持久化单独做一遍。

**How to apply:** 任何「让流承载 X」的方案，先判它要不要新的 event type。要 → 门 1 与门 2 **必须同一次改**，且要在方案里写明「不改就是静默丢弃」；不要（搭 `bundle` 或既有 event 的 payload）→ 传输层零成本。**永远不要拿「测试全绿」当帧类型改动的安全性证据**，这条链路上没有任何一条测试跨越 wire 中段。相关：[[contract-bubble-streaming]] · [[memory-v2-wire-path]]
