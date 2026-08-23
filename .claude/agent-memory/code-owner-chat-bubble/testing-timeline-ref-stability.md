---
name: testing-timeline-ref-stability
description: 测 chat-bubble Timeline items 引用稳定/大 React-element 数组比较时,别用 toBe 直接比,会 OOM;Timeline mock 别 return null
metadata:
  type: feedback
---

测 TraceChain/Timeline 渲染时踩过的两个坑,复现代价高、非显而易见:

1. **别用 `expect(a).toBe(b)` 直接比较两个 timelineItems 数组(或任何装满 React element 的数组)。**
   RED 失败时 jest 会 pretty-format 两个数组做 diff,而 items 里嵌着 `StreamingMarkdownView`/`SeamlessMarkdown` + 巨型 style 对象,序列化递归直接把 4GB 堆撑爆(FATAL: heap out of memory),看不到干净的断言差异。
   **How to apply:** 断言引用稳定时先塌成布尔再断:`const same = last === ref; expect(same).toBe(true);`(或断 `Timeline.__calls.length` 没变)。失败信息只剩 `Expected true Received false`。

2. **捕获 Timeline props 的 mock 不要 `return null`** —— TraceChain 把 Timeline 包在 `AnimatedChildren` 里,子节点 null 会触发测量/re-render 死循环 → 同样 OOM。让 mock `return <div data-count={props.items.length} />`。

3. **不要在 trace_chain.test.js 里全局 `jest.mock` Timeline** —— 该文件 28 个用例靠真 Timeline 渲染出 "Reasoning"/"read_file"/按钮 等文本做断言。想 spy items 就另开一个同目录测试文件(如 `trace_chain.live_subscription.test.js`)用纯捕获 mock,别污染 130 基线。delegating spy(`jest.requireActual` + 渲染真 Timeline)在本仓库会自递归 OOM,别用。

**Why:** 2026-07 做"流式布尔订阅化"重构(消灭每 chunk 全量重建 timelineItems)时,这三点各烧掉一次 OOM 复现。相关:[[streaming-live-tail-markdown]]。
