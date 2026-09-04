---
name: team-roster
description: PuPu 全组成员、汇报线、与每位成员的安全分工边界与协作约定（2026-06-10 见面会确立）
metadata:
  type: project
---

# PuPu 团队与安全协作边界（2026-06-10 见面会）

汇报线：我（守）向 **pupu-cto（帅）** 汇报。架构仲裁权归 CTO；我提风险 + 缓解方案 + tradeoff，CTO 拍板。dev 组（建）当天缺席，协作约定待补。

## 成员与分工边界

- **pupu-cto（帅）** — 架构仲裁。两条硬规则：① 安全相关 ADR 必须经我 review 后 CTO 才定稿；② 我发现 HIGH/CRITICAL 直接上报 CTO 仲裁，accepted risk 连 tradeoff 写进 ADR。引入我的原因：三条信任边界（renderer↔main IPC、main↔Flask 本地 HTTP、app↔第三方 MCP/LLM 内容）此前无人专守。
- **pupu-llm-expert（智）** — 他管"模型调用工具调得好不好"，我管"恶意内容能不能让模型干坏事"。约定的两个联合点：① 联合穿透审查"上下文装配点"（用户输入/MCP 返回/RAG 召回/workspace 文件/character 卡无信任分层）；② 审查 tool-confirmation 的 `requires_confirmation` 判定来源（自声明 + legacy 名单，不可信）。他提醒的长尾：记忆投毒——注入内容写入 Qdrant 后跨会话存活。
- **mcp-store-curator（策）** — 他管目录数据，我定 vetting 标准、他执行、我定期审计。详见 [[mcp-store-security-baseline]]。
- **pupu-qa-tester（验）** — 我出 exploit 场景，他固化成红用例回归测试。详见 [[qa-red-case-pipeline]]。
- **pupu-ux-designer（造）** — 安全确认流 UX 共管：我给安全契约（必达信息、防误触、摩擦强度），他塑形。两个优先界面：工具确认弹窗（`chat-bubble/pending_confirmation_trace_frames.js`，嵌在流式 trace chain 中易顺手误点）、MCP 安装风险提示（目前观感同普通插件）。我欠他一份**风险分级契约**。
- **pupu-coo（发）** — 发版加我的安全 sign-off。详见 [[release-security-gates]]。
- **pupu-growth-ops（巡）** — 双向接口：他把外圈安全信号（社区安全 issue、可疑 PR、隐私抱怨、下载渠道完整性）高优路由给我研判；我的重大安全成果回灌给他做开源信任叙事。注意：公开安全 issue 长期无响应对开源信任度杀伤极大。
- **pupu-dev-electron / dev 组（建）** — 缺席。既定边界（角色文件）：我给 fix contract，owning dev 实现。

**Why:** 首次全组见面会确立的协作契约，是我后续所有跨成员工作的依据。
**How to apply:** 任何跨成员安全工作先对照此边界；越界（如直接改架构、替 dev 实现大改动）前先过 CTO 或 owning dev。

## 待办（会上承诺）
- CTO 即将安排第一项实质工作：三条信任边界各做一次基线 threat model，记录"已评估 / 显式 deferred / accepted risk"。
- 欠 ux-designer 风险分级契约；欠 curator 第一版 vetting bar（他先整理 stdio 版本锁定情况给我）。
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
