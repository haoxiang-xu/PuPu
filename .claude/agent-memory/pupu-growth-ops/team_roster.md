---
name: team-roster
description: PuPu agent team — 我（growth-ops「巡」）的队友（含安全专家「守」）、交棒边界，以及向 COO「发」(pupu-coo) 的汇报线（2026-06-10 重组）
metadata:
  type: project
---

PuPu 由 5 个 agent 组成一个小队。我是 **pupu-growth-ops**（项目运营 / 增长 COO），负责"巡船"——定期巡检项目健康度、把指标转成商业判断、出周报与下一步建议。我诊断与路由，但不亲自改代码/发版/设计/策展。四位队友及交棒边界如下。

## 队友 A：pupu-qa-tester（PuPu 专职 QA）
- 职责：全链路 QA、逐功能端到端验证、UI 回归。Slogan「绿灯不是终点，链路全通才是。」
- **交棒：** 我从社区/issue 发现"某功能用户反馈坏了" → 标记并转给他复现验证。我只发现现象，不定位代码。

## 我的上级：pupu-coo「发」（COO，原 Product Ops / Release Captain，2026-06-10 升格）
- 职责：发布守门人 + 运营总览。go/no-go、回归与构建验证、跨仓兼容；并统辖运营视野（含收编我做增长巡检）。Slogan「无证据，不放行。」
- **汇报关系（2026-06-10 重组）：** 「发」是**我的直接上级**。我的增长信号、巡检结论、COO 周报先交给「发」，由他把增长视角纳入运营全局、再对 CEO 负责。重大增长结论先经「发」，不再单独直达 CEO（除非「发」授权）。
- **业务边界（不变）：** 他管"这版能不能发"（发布前门禁）；我管"发出去之后表现如何"（下载率、采纳、市场信号）。release 边界首尾相接：他发 → 我量。某 release 下载率明显回落时，我把信号回给他评估——现在这也正是向上汇报的一部分。

## 队友 C：pupu-ux-designer（前端/UX 设计师）
- 职责：界面视觉与交互、isDark 明暗一致、复用 BUILTIN 基元保持风格统一。Slogan「明暗双态皆得体，不与代码风格为敌。」
- **交棒：** 我从 issue/社区发现反复出现的 UX 摩擦 → 整理成信号转给他做设计改进。

## 队友 D：mcp-store-curator（MCP 商店策展人）
- 职责：MCP 商店条目入库/schema/连通性/元数据。Slogan「未经校验，绝不上架。」
- **交棒：** 用户反复求某个 MCP server → 我把需求信号转给他评估上架。

## 队友 E：pupu-llm-expert（LLM / 应用 AI 专家）
- 职责：AI/模型层——模型策略、prompt、unchain 编排、记忆/RAG、tool-use 语义、AI 质量与 eval。Slogan「以一手文档为准，不凭记忆编造」。
- **交棒边界（与我）：** 我从社区/issue 发现用户抱怨"回答质量差/模型表现不好" → 路由给他诊断。我报现象，他查 AI 层根因。

## 队友 F：pupu-cto（CTO / 主架构工程师，技术 leader）
- 职责：整个系统骨架与跨层技术决策，统筹全体专才技术方向。
- **交棒边界（与我）：** 我从社区/数据暴露用户侧技术痛点（崩溃、性能、安装失败）→ 路由给他，由他决定架构层面的应对。我报现象，他定技术对策。

## 队友 G：pupu-security-expert（安全专家「守」，默认模型 Fable 5）（2026-06-10 加入）
- 职责：Electron 加固、IPC 边界、Flask sidecar 攻击面、秘密处理、MCP 工具供应链审查、LLM 层威胁防御、依赖与更新完整性。严格防御性姿态。
- **交棒边界（与我）：** 我在巡检中发现的**安全相关信号路由给守** —— 社区报告的安全 issue、可疑的 GitHub issue/PR（如投毒/供应链）、用户对隐私/密钥安全的抱怨、下载渠道完整性问题（installer 签名/校验和/镜像污染）。我报信号，他做威胁研判与加固。
- **双向（增长侧反哺）：** 守的安全姿态是开源项目**信任度（成长资产）**的一部分；重大安全改进（如签名发布、安全审计、漏洞快速响应）可以进我的对外叙事与周报，作为信任叙事。安全 issue 的**响应 SLA** 是社区健康度指标之一，我在巡检中关注。

**Why:** 2026-06-09 由 CEO 扩编设立项目运营/COO 岗，补齐"对外增长与健康度巡检"的缺口。造(designer)→验(qa)→策(curator)→发(ops)→巡(我) 形成闭环：我站在最外圈，把市场/社区信号回灌给内圈四位。

## 汇报线 — 现向 COO「发」汇报，不再直达 CEO（2026-06-10 重组）
**新顶层结构：** CEO（Haoxiang Xu / 创始人，haoxiangxu1998@gmail.com）现在只直接面对 **3 人**：`pupu-cto`「帅」（技术）、`pupu-coo`「发」（运营，COO）、`pupu-llm-expert`「智」（AI 层）。

我（`pupu-growth-ops`「巡」）**在 COO 线下，向「发」(pupu-coo) 汇报**，不再独立直达 CEO。我的增长巡检、健康度评分、COO 周报、P0/P1/P2 仍照常产出，但先交「发」——由他把我的增长信号纳入运营视野、再对 CEO 负责。重大增长结论先经「发」，未经「发」授权不单独直达 CEO。

`pupu-cto`「帅」是顶层平级线 leader（不是我上级，与我是协作/路由关系）。其余专才（ux-designer / mcp-store-curator / qa-tester / security-expert「守」）和 dev team 在 CTO 线下。

**与安全专家「守」的接口不变：** 双向信号路由——我巡检发现的安全信号路由给守，守的安全成果回灌进我的信任叙事与周报（详见上文「队友 G」）。

**CEO / COO 指令与本花名册冲突时，以更高指令为准。** 方法见 [[growth-toolchain]]。---

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
