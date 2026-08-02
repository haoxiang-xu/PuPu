---
name: adr-context-memory-v2-migration-review
description: 2026-08-02 CTO 强制评审 unchain context/memory v2 迁移；seam 判定放行、emit_event CRITICAL 前提证伪、P0 baseline 全未入库=拦截
metadata:
  type: project
---

CTO 对 `docs/superpowers/plans/2026-08-01-unchain-context-memory-v2-core-migration.md` 三个强制评审项（context ownership / builder-prepared-agent integration / durable ordering）的裁决。

## 裁决

- **context ownership seam：放行。** `AgentBuilder.semantic_context_owner` 是显式字段，`runtime/assembly.py` 的排除判定用 isinstance + `semantic_context_capability` 属性，**不是**按 harness 名字推断。legacy 路径（owner is None）返回与原来完全一致的列表与顺序，可逐项核对。
- **persist-before-observe：有条件放行。** seam 成立是因为 `AgentCallContext.callback` 是**单一字段**，run / resume_human_input / resume_interaction 三个入口都从同一个 `PreparedAgent` 实例读它，`build()` 里一次组合即全覆盖。这是构造性证明，不是经验判断。
- **durable ordering：有条件放行**，故障注入点需补（见下）。

## 关键前提已被证伪（重要，别再据此论证）

plan 与 ownership contract 都写「GitNexus 报 `KernelLoop.emit_event` 为 CRITICAL、参与六条执行流，故不动它」。**实测 live index 是 `risk: LOW, impactedCount: 9, direct: 4`。** 同表其余 5 行（AgentBuilder 19 / KernelMemoryRuntime 18 / build_memory_v2_optimizer_module 5 / _append_memory_v2_normal_toolkit 6 / _finalize_memory_v2_curator 5）全部精确复现，唯独最关键这行不复现。

**Why:** 结论（不动 emit_event，改在 PreparedAgent 组合）依然正确，但正确的理由不是风险等级，而是：`emit_event` 的 callback 是**逐次调用参数**、无实例状态，loop.py 内 11 处直调 + 经 `emit_loop_event` 间接 13 处跨 5 文件；穿一个 sink 进去要改 ~24 处调用点，而 PreparedAgent 只需 1 处。

**How to apply:** 以后有人复查发现 LOW 就想「那直接改 emit_event 得了」时，用调用点数量论证，不要用风险等级。同时提醒：plan 里任何 GitNexus 快照都要现场复验，快照会漂。

## 逃生舱口触发条件（plan 写得太软，需具体化）

plan 只说「若证明不了 persist-before-observe 就上报」。可证伪条件应枚举为：
1. 出现不经 `call_context.callback` 的发射路径；
2. 有组件在组合前捕获了原始 callback；
3. 发射发生在 worker thread 且「同步」无法保证；
4. resume 路径自建 call context。
任一成立才允许考虑动 emit_event，且必须先回 CTO/architect。

## 相关

[[adr-v2-migration-baseline-blocker]] 是本次评审的拦截项。
