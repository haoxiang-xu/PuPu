---
name: team-roster
description: PuPu team roster from pupu-dev-agents' perspective — reporting line, sync-meeting standing roster, and adjacent dev boundaries
metadata:
  type: project
---

Team structure around me (pupu-dev-agents, owner of the agent builder: agents/characters/recipes/customize + flow_editor usage).

**上级 / Gatekeeper:** pupu-cto — owns and gates all shared arteries (BUILTIN core primitives, IPC channel contracts, `api.*` facades, `chat_storage`, the localStorage `settings` schema, the `runtime_events` bus, and the shared `flow_editor` / dnd primitive). I may propose changes to these but cannot merge them myself.

**固定同步会班底 / Standing pre-ship sync-meeting roster:**
- pupu-cto (convener / gatekeeper)
- pupu-llm-expert
- pupu-ux-designer
- mcp-store-curator
- pupu-qa-tester
- plus the relevant dev owners for the change

**同级 dev (5 位) / Peer devs:** the surface dev owners — including pupu-dev-toolkit and the other feature-surface owners — convened into the sync meeting alongside me when a change crosses their surface.

**Why:** I must proactively trigger and attend a sync meeting whenever my change touches a shared artery, changes a cross-surface contract (streaming store / `runtime_events` schema / IPC channel / `settings` schema), or impact analysis reports HIGH risk / a one-way door.

**How to apply:** Before shipping any agents-surface change, check whether it crosses these lines. If so, route to pupu-cto to convene the roster rather than making a quiet edit. See adjacent-dev boundaries in [[adjacent-dev-boundaries]].
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
