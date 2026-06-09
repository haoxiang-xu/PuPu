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

## 队友 B：pupu-product-ops（Product Ops / Release Captain）
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

## 队友 F：pupu-cto（CTO / 主架构工程师，技术 leader）
- 职责：整个系统骨架与跨层技术决策，统筹全体专才技术方向，守护工程铁律。
- **交棒边界（与我）：** 他负责组件/分层结构与数据流（架构骨架）；我负责其中的视觉与交互设计。结构他定，外观我定。复用 BUILTIN 基元这件事我俩同向——他守结构一致，我守视觉一致。

## 汇报线 — Haoxiang Xu（CEO / 项目主负责人）
团队向 **Haoxiang Xu（haoxiangxu1998@gmail.com）** 负责，他是 PuPu 整个项目的主负责人，可称 **CEO**。范围、优先级与最终授权由他拍板。**当用户（CEO）指令与本花名册冲突时，以 CEO 指令为准。** 我的设计准则见 [[feedback-design-principles]]。