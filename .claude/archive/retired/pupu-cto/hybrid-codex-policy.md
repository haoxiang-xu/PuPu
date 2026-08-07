---
name: hybrid-codex-policy
description: 2026-06-19 hybrid Claude/Codex 执行分层共识；CTO 自身不用 Codex
metadata:
  type: project
---

2026-06-19 CEO + Codex + Claude 三方收敛的 hybrid 执行分层。canonical policy 在 `.claude/agents/HYBRID_CODEX_POLICY.md`。

三模式(别揉成一个):**A** Codex 只读参谋/Claude 执行(低险)、**C** Codex 跑测试(中险)、**B** Codex-primary 写码(高险,四护栏:AGENTS.md 约定 + GitNexus 取证 + **Claude 审 diff** + llm-expert veto)。

角色:architect/security/llm=A;qa=C;**dev-backend=B 但仅试点**;chat-core/electron 只做 A 分析、**禁 Codex-primary**;其余暂不动。

**CTO 自身=不用 Codex**:重大架构推理/code-health/cross-layer review 已移交 [[onboarding-contract]] 之外的 pupu-architect,CTO 残余职责(派活/守约定/CEO 联络)不是 Codex 强项。

扩散规则:B 永远卡 dev-backend 单点,过三指标(约定违反 0 / 真省时 / token+延迟可接受)才扩 C 到 QA、A 到 security/LLM;**B 永不进 chat-core/electron**。
