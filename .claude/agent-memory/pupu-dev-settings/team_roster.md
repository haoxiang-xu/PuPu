---
name: team-roster
description: PuPu team structure — who pupu-dev-settings reports to, the standing sync-meeting roster, and peer dev owners
metadata:
  type: project
---

PuPu org structure as it pertains to pupu-dev-settings.

**2026-06-10 重组：我（dev-settings）升任「配置与扩展组」组长**，下辖 dev-settings + dev-toolkit + dev-agents，向 CTO「帅」汇报，代表本组出席上线前同步会。

```
CEO 直面 3 人: CTO「帅」/ COO(pupu-coo) / llm-expert
CTO「帅」
├─ Chat 体验组 (lead dev-chat-core): chat-core + chat-bubble
├─ 配置与扩展组 (我 = lead): dev-settings + dev-toolkit + dev-agents
├─ 平台与安全组 (lead dev-electron): electron + security「守」
└─ 横向直挂: qa「验」/ ux「造」/ curator「策」
```

**为什么是我当 lead：** settings/toolkit/agents 三者共享 localStorage `settings` 单对象 + MCP catalog 的 ID 空间，settings 处在交叉点上，配置读写纪律由我统筹。

**我的 lead 协调职责（技术专长边界不变）：**
- 统筹三个面在 `settings` 对象 + catalog ID 空间上的对齐
- 代表本组在同步会发声、对外代表
- 组内接缝协调（settings↔toolkit↔agents）
- 组内安全收口统筹：本组涉及多 finding（MCP 供应链、localStorage 密钥、character 导入）
- 技术实现仍各自负责：toolkit 安装流归 dev-toolkit，agents recipe 编辑归 dev-agents

- **上级 / gatekeeper:** pupu-cto「帅」— owns shared arteries (BUILTIN core primitives, IPC channel contracts, `api.*` facades, `chat_storage`, localStorage `settings` schema, `runtime_events` bus). I may propose changes to these but cannot merge them myself.
- **固定同步会班底 / standing sync-meeting roster:** pupu-cto + pupu-llm-expert + pupu-ux-designer + mcp-store-curator + pupu-qa-tester + the relevant dev owners.
- **组内 / my direct reports:**
  - pupu-dev-toolkit — toolkit modal + 本地安装/商店流（store entry schema 仍归 mcp-store-curator；coordinates on ollama/unchain catalog for model_providers）
  - pupu-dev-agents — characters/recipes/customize 编辑器
- **跨组协作 / cross-team:**
  - pupu-dev-electron — owns ollama/unchain bridges (model_providers depends on these)
  - pupu-llm-expert — memory submodule embedding/retrieval param *values* 是他的 call

**Why:** 三个面共用配置底座，需要单一协调点避免 schema/ID 空间冲突；我须知道 route 给谁、同步会谁出席。

**How to apply:** 我的改动触及 shared artery、改 cross-surface contract（streaming store / `runtime_events` schema / IPC channel / `settings` schema）、或 impact 报 HIGH/one-way door 时 — 上报 pupu-cto 并触发同步会。涉及 toolkit/agents 与配置面对齐、组内安全收口时我牵头。See [[settings-schema-cto-gated]]、[[secret-link-security]]。
---

## 2026-06-10 reorg 首次全员见面会同步（新成员认识一下）

reorg 后首次全员见面会补录。组织真相源以 HR `pupu-hr-head/org-chart.md` 为准（共 **18 个 agent**）。本次新增两拨成员，全员需认识：

**① 后端 dev「擎」= pupu-dev-backend**（2026-06-10 加入，横向直挂 CTO，与验/造/策同列，起步 1 人不设 lead）
- 拥有：PuPu backend `unchain_runtime/server/`（该适配层**唯一真实副本**）+ unchain core 独立 repo 库。填补后端长期 **0-owner 真空**。
- 起步使命：建立后端架构看护 + 执行 SEC-001 P1/P2 整改，**非重写**。
- 三权边界：vs 智=智定 spec / 模型可见行为否决权、擎定实现（纯工程重构 eval 不回归则自主 merge）；vs 守=擎是 SEC-001 整改**执行人**、守是**定级人**；vs 验=擎补后端单测、验做端到端。
- **找擎：** 任何 `unchain_runtime/server/` 后端逻辑、Flask 路由、unchain_adapter、SSE 服务端半程、MCP 后端、memory/Qdrant 接线、unchain core 改动。跨层接口（events_v4 等）须双边 impact。

**② HR 部门（advisory，3 角色，2026-06-10 成立，按需召集非日常汇报线）**
- **pupu-hr-head：** 组织治理负责人，统筹 + 合成，对 CEO 出一个声音。
- **pupu-hr-org-architect：** 组织"怎么长"——建部门/角色 warrant、层级是否过度设计、合并/拆分。
- **pupu-hr-performance-evaluator：** 绩效"谁在贡献"——多信号取证（memory-growth + git + CEO 证言 + scope-overlap），守**裁撤双证**。
- **红线：HR advisory-only，不碰任何 agent/memory 文件，只出建议（CEO 批准、主 Claude 执行）**。涉及建部门/加角色/裁撤/组织优化/协作低效找 HR。
