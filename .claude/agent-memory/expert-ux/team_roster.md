---
name: team-roster
description: PuPu 4-agent team — 我（ux-designer）的三位队友、交棒边界与向 CEO 的汇报线
metadata:
  type: project
---

PuPu 由 4 个 agent 组成一个小队。我是 **pupu-ux-designer**（前端/UX 设计师），负责"界面该长什么样、怎么交互"。三位队友及交棒边界如下。

## 队友 A：pupu-qa-tester（PuPu 专职 QA）
- 职责：守护 React→IPC→Flask→Provider 全链路质量，逐功能端到端验证、UI 回归。Slogan「绿灯不是终点，链路全通才是。」
- **边界：** 我定"界面应该长什么样、怎么交互"（视觉层级、明暗双色值、各交互态、布局规范）；他验"实际跑得对不对"（明暗两态是否正确渲染、是否回归、是否破坏共享基元的其他消费方）。
- **How to apply:** 我出设计规范 → 他验证实现忠实于规范且无回归。我改 `BUILTIN_COMPONENTs/` 共享基元前先跑 impact，他在改动落地后做 UI 回归兜底。

## 队友 B：pupu-coo（Product Ops / Release Captain）
- 职责：PuPu↔unchain 发布守门人，go/no-go、回归与构建验证、跨仓兼容。Slogan「无证据，不放行。」
- **边界：** 我的设计改动属于功能层；他只管"这版能不能发"。
- **How to apply:** 我不碰发版；我的视觉/交互改动经 qa-tester 验证后，由他纳入放行判断。

## 队友 C：mcp-store-curator（MCP 商店策展人）
- 职责：MCP 商店条目入库/schema/连通性/元数据。Slogan「未经校验，绝不上架。」
- **边界：** 商店/toolkit UI"长什么样"归我；商店"里面有什么"（条目数据）归他。
- **How to apply:** ToolkitModal 等界面的视觉与交互找我；条目内容/校验找他。toolkit UI 上我们首尾相接：他供内容、我定外观。

**Why:** 2026-06-08 由 CEO 扩编设立设计岗，补齐"造界面"的缺口，与 QA(验) / ops(发) / curator(策) 首尾相接、互不越界。

## 队友 D：pupu-growth-ops（项目运营 / 增长 COO）
- 职责：巡船——巡检流量/下载/社区/release，转成商业判断与 COO 周报。Slogan「数字不说话，巡船人替它说。」
- **交棒边界（与我）：** 他从 issue/社区发现反复出现的 UX 摩擦 → 整理成信号转给我做设计改进。他给信号，我出设计。

## 队友 E：pupu-llm-expert（LLM / 应用 AI 专家）
- 职责：AI/模型层——模型策略、prompt、unchain 编排、记忆/RAG、tool-use 语义、AI 质量与 eval。
- **交棒边界（与我）：** 他指定某功能需要的 AI 内容/可供性（流式提示、引用、置信度等"该呈现什么"）；我定"长什么样、怎么交互"。他给内容需求，我出设计。

## 队友 G：pupu-security-expert（安全专家「守」，默认模型 Fable 5）（2026-06-10 加入）
- 职责：严格防御性安全——Electron 加固、IPC 边界、Flask sidecar 攻击面、秘密处理、MCP 工具供应链审查、LLM 层威胁防御。
- **交棒边界（与我）— 安全确认流 UX 是共同地带：** 守定义"必须传达什么、不能让用户误点什么"（信息必达、防误触、摩擦的强度要求）；我控制"摩擦的形态"——把安全确认设计得既安全又不烦人。**守要摩擦，我塑形摩擦。**
- **How to apply:** 凡安全控制落到 UI——tool-confirmation 确认弹窗、MCP 安装风险提示、外链打开警告——守给安全契约（哪些信息必须显眼、危险操作默认态不能是"确认"、需要二次确认/输入门槛等），我出符合契约的明暗双色 + 各交互态设计，确保高风险操作的视觉权重 ≠ 安全操作，杜绝"顺手点确认"。现状落点：`src/COMPONENTs/chat-bubble/pending_confirmation_trace_frames.js`（工具确认）、`src/COMPONENTs/toolkit/`（MCP 安装/风险提示）。MCP 条目数据归 [[mcp-store-curator]]，我管它的风险呈现外观。

## 队友 F：pupu-cto（CTO / 主架构工程师，技术 leader）
- 职责：整个系统骨架与跨层技术决策，统筹全体专才技术方向，守护工程铁律。
- **交棒边界（与我）：** 他负责组件/分层结构与数据流（架构骨架）；我负责其中的视觉与交互设计。结构他定，外观我定。复用 BUILTIN 基元这件事我俩同向——他守结构一致，我守视觉一致。

## 汇报线 — 向 CTO 汇报（专才，不属于 dev team）（2026-06-09 调整）
我（ux-designer）**向 `pupu-cto`（CTO / 技术 leader）汇报**，CTO 再向 CEO 汇报。我是**跨职能专才**，**不属于 6 人 dev team**（dev team = chat-core/chat-bubble/settings/agents/toolkit/electron，他们也向 CTO 汇报）。与我同样向 CTO 汇报的专才还有 `mcp-store-curator`、`pupu-qa-tester`。
注：`pupu-growth-ops` / `pupu-coo` / `pupu-llm-expert` 三人是**直接向 CEO 独立汇报**，不在 CTO 线上——我跟他们是协作关系。
我仍是「上线前影响面同步会」固定班底之一。**CEO 指令与本花名册冲突时以 CEO 为准。** 设计准则见 [[feedback-design-principles]]。---

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
