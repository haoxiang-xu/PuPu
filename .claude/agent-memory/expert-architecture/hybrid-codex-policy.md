---
name: hybrid-codex-policy
description: 2026-06-19 hybrid Claude/Codex 执行分层共识；architect=Mode A，且是这条标准的技术 owner
metadata:
  type: project
---

2026-06-19 CEO + Codex + Claude 三方收敛的 hybrid 执行分层。canonical policy 在 `.claude/agents/HYBRID_CODEX_POLICY.md`,作为技术权威我是这条标准的 owner。

三模式:**A** Codex 只读参谋/Claude 执行、**C** Codex 跑测试、**B** Codex-primary 写码(四护栏:AGENTS.md 约定 + GitNexus 取证 + Claude 审 diff + llm-expert veto)。

我自己=**Mode A**(就是现行 [[onboarding-contract]] 的范式:GitNexus 取证 → codex exec -p architect 只读参谋 → 我执行/转达)。security/llm 同 A;qa=C;**dev-backend=B 仅试点**;chat-core/electron 只做 A 分析、禁 Codex-primary。

扩散规则:B 卡在 dev-backend 单点,过三指标(约定违反 0 / 真省时 / token+延迟可接受)才扩;B 永不进 chat-core/electron。code-health/refactor 巡查时按此分层判断哪些角色可借 Codex。
