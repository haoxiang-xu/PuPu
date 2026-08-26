---
name: adr-trace-chain-155-66-dispatch
description: ADR — #155/#66 trace-chain 修复的 NOW/LATER 分期、派发与守门门槛（architect 定技术，CTO 定交付）
metadata:
  type: project
---

# ADR：Trace Chain #155/#66 修复的交付治理（2026-06-20）

**Context**：CEO 委托。architect（背后三路 Codex 5.5 综合）判定 #155（无 tool 时同时渲染 tool call + final response）与 #66（pause 丢已生成内容）同源——渲染层 `trace_chain.js` 用全局启发式 `frames.some(type==="tool_call")` 猜最终答案归属；cancel settlement 只读 streaming chunks 不读 trace 状态。

**Decision（交付侧，technical 部分 defer architect）**：
- NOW 修 bug、LATER 做结构改造，**两者不耦合，LATER 不排进 NOW 周期**。
- NOW 两 bug 共享 final-message ownership 标记，**作为一条交付线**（#155-A/#66-D 不拆成独立 PR，避免 chat-core 改两遍同区域 churn）。
- 关键路径：`llm-expert 命名签字(C) → chat-core 打标(A) →（chat-bubble 渲染 B ∥ chat-core settle D）→ chat-bubble cancelled 渲染(E) + qa`。chat-core 是瓶颈资源（A、D 都在它身上，D 串 A 后）。
- **llm-expert 命名门是 v4 finality 契约的 NOW 投影**：即便 NOW 只动渲染层标记，命名也必须经 llm-expert 签字，避免 LATER 的 v4 payload 契约返工。

**LATER 启动硬门槛（两者皆需才动持久化）**：
1. roadmap 门：真·A2A/多 agent/channel 执行进 PuPu 北极星 roadmap 且 CEO 明确排期。
2. 契约门（硬前置，architect 锁的不可逆门）：**llm-expert 签字的 v4 payload finality 契约**先落地。

**Consequences / 风险定级**：
- #155 A/B = MEDIUM（改渲染归属，影响所有 turn 显示；不碰 schema/IPC envelope）。
- #66 D/E = **MEDIUM-HIGH**：触及 cancelled turn 的**持久化与历史回放**——settle 取值顺序变化改变"取消时存什么"。回归**必须含历史会话回放**，不能只测新 turn。这是本批最接近用户可见数据正确性的改动。
- LATER 结构 = HIGH（持久化新 schema 即单向门，故 additive + 迁移 + 灰度）。

**我守的不可逆红线（PR review 盯死）**：不改 STREAM_EVENT envelope、不删 V2/V3 fallback、不整体替换 `trace_chain.js`、cancel 不伪装工具成功（须有测试钉住）。

**守门**：llm-expert 命名签字门 + 强制 gitnexus_impact upstream（铁律）+ qa 回归（有/无 tool 两路径、cancel settlement 含历史回放、"不伪造工具成功"断言）。本批不涉外壳，不触发 shell_background_guard。

相关：[[architecture-operating-principles]] [[adr-v4-doc-and-cross-repo-contract]] [[team_roster]]
