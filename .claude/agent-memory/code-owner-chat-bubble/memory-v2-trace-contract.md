---
name: memory-v2-trace-contract
description: Memory V2 在 trace chain 里的真实数据契约——bundle 是终局帧独家来源、journal reload 的 ref 恢复对生产 active 适配器无效、四态里两态不可达
metadata:
  type: project
---

Memory V2 的 trace 呈现有三条与直觉相反的事实，全部于 2026-08-07 在 PuPu HEAD `14ca3ccc` 上核实（代码 + 本机 official store + 测试三路独立佐证）。

**1. `bundle.memory_v2` 是终局帧独家来源，流式期间零存在。**
`unchain_adapter.py:7884` 只在 `_build_bundle_from_result` 里塞 `memory_v2`，随 `stream_summary`（:9656 / :10447 / :11191）发出；`chat_bubble.js:107-110` 用 `message.meta.bundle.memory_v2` 做挂载门。所以 Memory V2 节点是**回合结束后才凭空出现的审计块**，不是过程信号。

**2. journal reload 的 ref 恢复对生产路径是死代码（但测试全绿）。**
`memory_v2_journal_reload.js:178 / :210` 读 `event.payload.*`；生产 active 读适配器 `memory_v2_unchain_read_adapter.py:176` 是 `item["event"] = {"type": ..., **payload}` —— payload 被**摊平**，`event.payload` 恒 undefined。旧的 PuPu fallback store（`memory_v2_store.py:3705`）才是嵌套形状，渲染层是照着它写的。
第二重失配：真实 payload 里 ref 是 `unchain.resource_ref.v1` 对象 `{kind,id,revision}`，渲染层只认 `pupu://artifact/<id>@<rev>` 字符串。两个原因各自独立，修一个不够。
`trace_chain.memory_v2.test.js` / `memory_v2_journal_reload*.test.js` 的 fixture 全用嵌套 + 已规范化的 `pupu://` 串，21 test 全绿。**别拿这套测试当"能工作"的证据。**

**3. Trace 四态里 `Legacy` 不可达（`Unavailable` 的原判撤回）。** `memory_v2_trace_presenter.js:162-196` 支持 Complete/Partial/Legacy/Unavailable。
- **`Legacy` 不可达，2026-08-07 二次复核成立**：`grep trace_status unchain_runtime/server --include=*.py`（去 tests）**零赋值**；`journal_status` 只被赋过 `"partial"`（`memory_v2_context.py:4298`、`memory_v2_context_adapter.py:671`）；顶层 `legacy_v1` 从未被设过（`memory_v2_legacy_adapter.py:252/365/438` 的 `legacy_v1: True` 在 **provenance 子对象** 里，`:655-656` 就是这么读的，过不了 presenter 的顶层 `raw.legacy_v1`）。
- **`Unavailable` 的"不可达"判断撤回，改为未核实**：`memory_v2_bundle_payload`（`memory_v2_context.py:4774`）在 admission 为 None 时返回 `{schema_version, requested_mode:"off", mode:"off"}`，该形状能过 `isMemoryV2TraceBundle` 的门，`resolveMode→"off"` 会直接判 `Unavailable`。这个 payload 到底挂不挂进 message bundle 未实测。
- 且 `Complete` 的语义是"trace bundle 完整"，不是"记忆成功"——active 且无报错就恒为 Complete，哪怕一条 entry 都没写。

**Why:** 这三条决定了任何"Memory V2 在 trace 里够不够"的判断。不知道 1 就会以为流式期间有信号；不知道 2 就会相信绿测试；不知道 3 就会去设计两个永远看不到的状态。

**How to apply:** 动 `memory_v2_*` 任何一个文件前先看这条。修 2 属跨面：ref 词汇归服务端规范化（runtime 的 `load_events`），渲染层不该自造 URI 词汇——按单向契约提议，不自己改 presenter。相关 [[testing-timeline-ref-stability]]。
