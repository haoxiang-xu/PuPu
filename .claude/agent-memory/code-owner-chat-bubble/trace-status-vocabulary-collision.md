---
name: trace-status-vocabulary-collision
description: trace chain 上并存四个 status 面且三个共用 Complete/Partial/Unavailable 同一套词；Timeline 原语没有失败态，Isolated/Failed/Completed 渲染成同一个点；runStatusRank 的未知词降级是静默 finality bug
metadata:
  type: project
---

2026-08-07 于 PuPu HEAD `8d7fbd1d` 逐文件核实（`0000-0002-2026-0807` 庭审取证）。**2026-08-08 于 `b2385d5d` 复核第 3/4 条锚点仍逐字成立**（`CURATOR_EVENT_TYPES` 在 `:22-30`、`runStatusRank` 在 `:424-432`）。

**1. 同一条 trace 上有四个 status 面，三个共用同一套词。**

| 面 | 落点 | 词汇 | 语义 |
|---|---|---|---|
| presenter 轴 | `trace_chain.js:1941`、`memory_v2_trace_audit.js:317` | Complete/Partial/Legacy/Unavailable | trace bundle 完不完整 |
| journal reload 轴 | `memory_v2_journal_reload.js:272/309/366/377/389/404`，渲染于 `:568-572` | Complete/Partial/Unavailable/Loading | 渲染层自己那次 journal 重读跑没跑完 |
| curator 轴 | `trace_chain.js:1969`、`memory_v2_trace_audit.js:393` | Completed/Failed/Isolated/NoOp/Running/Pending | 整理任务的结局 |
| 决策面 | `memory_v2_pending_reviews.js:947-954` | N to decide / N awaiting / 空态 | 等你拍板的条目 |

前两个面在 **同一个展开面板里同时出现**，都能读作 "Partial"，指两件完全不同的事。缺的不是分层——分层已经是四行了——缺的是**词不重叠**，和**没有任何一层回答"我的记忆存下来了吗"**。

**2. Timeline 原语没有失败态，所以 trace 行上不存在"失败"这个视觉。**
`BUILTIN_COMPONENTs/timeline/timeline.js:742` 契约只有 `"done"|"active"|"pending"`，`resolveLineColor`/`resolvePointColor`（`:34-48`）也只分这三支。`trace_chain.js:1962-1963` 的活跃词表是 `["Pending","Running","Leased"]`——**`Isolated` 和 `Failed` 都不在里面**，于是 `:1980` 把它们判成 `"done"`，和 `Completed` 同一个点、同一种颜色。
**修法不必动 ui-primitives**：`trace_chain.js:545` 的 `ErrorPoint`（用于 `:1747` 的 error 帧）就是本面既有的失败约定，用自定义 `point` 即可，不要去给 Timeline 加第四态。

**2b. presenter 轴同病，且更彻底（2026-08-08 于 `b2385d5d` 实测，`0000-0005-2026-0807` 庭审取证）。**
Memory V2 那一行与状态相关的字段 **只有两个**：`trace_chain.js:1941` 把状态词插进 title，`:1949` 做一次 `memoryV2Audit.status === "Unavailable" ? "pending" : "done"`。**故 `Complete`/`Partial`/`Legacy` 三者同点同色同 span 同折叠高度，全部差别是标题里那几个字符。** 该行未提供 `point`，落 `DotDefault`。详情面板里 `Trace state` 与 `Error code` 是普通 `AuditRow`（`memory_v2_trace_audit.js:313`/`:344`），无状态分支；且 `:1950` 的 `unmountDetailsWhenClosed: true` 意味着它们在用户点 `detail` 前 **根本不在 DOM 里**。
**直接后果**：任何"让降级被看见"的需求，在这一面 **零成本地失败** —— 改产端词汇（形状 P）也好，扩白名单（形状 A）也好，用户看到的只是一个词变了。**要有可见效果就必须先有 `expert-ux` 的呈现规格，这是设计缺口不是实现缺口。**
**同时**：本边界非测试源码里这四个词的全部语义面就是 `:1949` 那一次相等判断，其余纯透传。**所以上游若改用 typed 枚举（`ContextBuildStatus`），渲染面零改动。**

**3. `runStatusRank` 的未知词降级是静默 finality bug。**
`memory_v2_journal_reload.js:424-432` 的终态词表是**硬编码小写闭集** `["completed","complete","failed","isolated","noop"]`，未知词返回 0，而 `pending` 是 1。`mergeRuns`（`:434-481`）用它判 journal 结果是否比 bundle 新。后果：**后端任何新增终态词，如果不同步改这张表，journal 的新终态会输给 bundle 的旧 `Pending`，那条 run 永远卡在 Pending**。加词不是零成本。

**4. 反向删词是零告警的。** `CURATOR_EVENT_TYPES`（`:22-30`）是闭集，后端停发某类事件 → `projectCanonicalEvent` 返回 false → `agentRuns` 空 → `trace_chain.js:1961` 的 `Memory Agent` 整行**不渲染**。不崩、不报错、测试全绿（`trace_chain.memory_v2.test.js:28-43` 把 `context_v2_bridge` 整个 mock 掉）。

**Why:** 任何"Memory V2 在 trace 里够不够 / 要不要加个态"的判断都必须先知道这四条，否则会去加第五个共用同一套词的面、会以为加词免费、会以为绿测试能保护删词。

**How to apply:** 动 `trace_chain.js` 的 Memory 段或任何 `memory_v2_*` 文件前先看这条，配合 [[memory-v2-trace-contract]] 一起读。加词必改 `runStatusRank`。词汇归一属产帧端，按单向契约提议，别在渲染层自造语义。
