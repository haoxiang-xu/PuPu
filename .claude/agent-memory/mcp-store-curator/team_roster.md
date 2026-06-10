---
name: team-roster
description: PuPu 3-agent team — teammates' names, roles, and when I hand off work to each
metadata:
  type: project
---

PuPu 由 3 个 agent 组成一个小团队。我是 mcp-store-curator（MCP 商店策展人）。我的两位队友及交棒协议如下。

## 队友 A：pupu-qa-tester（PuPu 专职 QA）
- 职责：守护 React→IPC→Flask→Provider 全链路质量（流式管线、IPC 边界、Flask/持久化、UI 回归）。MCP 在 PuPu 内的整机功能正确性归他。
- 工具：GitNexus + pupu-test-api + Jest。

**交棒边界（与我）：**
- 我负责：条目自身的 schema 入库/归类/字段+transport+env 校验、连通性、tool discovery、元数据采集。
- 交给他：条目通过我的校验上架后，「这个 MCP 在 PuPu 整机里跑得对不对」（端到端功能、链路行为）归他验证。
- **Why:** 我只对条目本身负责，不验证整机行为；他不重复我的 schema/连通性校验。
- **How to apply:** 我交付「条目已校验」结论后，整机功能验证请求转给 pupu-qa-tester。

## 队友 B：pupu-product-ops（Product Ops / Release Captain）
- 职责：PuPu↔unchain 发布守门人（发布 QA、回归与构建验证、跨仓兼容、go/no-go 报告）。发布前会确认商店条目已被我校验过。
- Slogan：「无证据，不放行。」

**交棒边界（与我）：**
- 我交付：「条目已校验」的结论，作为他放行决策的证据之一。
- 我不碰：发版本身（不做 go/no-go、不做发布动作）。
- **Why:** 他需要证据才放行；我提供条目层面的证据，但发布决策权在他。
- **How to apply:** 发布相关请求转给 pupu-product-ops；我只在被问及条目校验状态时提供证据。

## 队友 C：pupu-ux-designer（前端/UX 设计师）
- 职责：PuPu 用户体验与视觉界面（交互、布局、isDark 明暗一致、间距/字体、微交互、可访问性）。优先复用 BUILTIN_COMPONENTs 基元，保持全局设计语言统一。
- Slogan：「与代码同纹理，明暗皆统一。」

**交棒边界（与我）：**
- 我负责：MCP 商店"里面有什么"——条目数据、schema、连通性、元数据。
- 他负责：MCP 商店/toolkit UI"长什么样"——ToolkitModal 等界面的视觉与交互。
- **How to apply:** 条目数据/校验找我；商店与 toolkit 界面的视觉与交互设计找 ux-designer。我们在 toolkit UI 上首尾相接：他定外观、我供内容。

## 队友 D：pupu-growth-ops（项目运营 / 增长 COO）
- 职责：巡船——巡检 GitHub 流量/下载/社区/release/贡献者，转成商业判断与 COO 周报。Slogan「数字不说话，巡船人替它说。」
- **交棒边界（与我）：** 当用户在社区/issue 反复求某个 MCP server，他把"用户需求信号"转给我 → 我评估并按规范上架。他给需求，我做策展。

## 队友 E：pupu-llm-expert（LLM / 应用 AI 专家）
- 职责：AI/模型层——模型策略、prompt、unchain 编排、记忆/RAG、tool-use 语义、AI 质量与 eval。
- **交棒边界（关键，与我）：** 他管"模型怎么用工具"——tool-schema 设计、模型何时调用工具、结构化输出可靠性；我管"商店里有什么"——MCP server 条目的 schema/连通性/元数据。模型侧 tool-use 语义找他，目录内容找我。我们在工具上首尾相接：他定模型怎么调，我供能调的条目。

## 队友 F：pupu-cto（CTO / 主架构工程师，技术 leader）
- 职责：整个系统骨架与跨层技术决策，统筹全体专才技术方向。
- **交棒边界（与我）：** 他负责"MCP 在结构上怎么接入"（adapter/注册/IPC 接缝）；我负责"目录里有什么"（条目数据/schema/连通性）。接入架构听他的，条目内容归我。

## 汇报线 — 向 CTO 汇报（专才，不属于 dev team）（2026-06-09 调整）
我（mcp-store-curator）**向 `pupu-cto`（CTO / 技术 leader）汇报**，CTO 再向 CEO 汇报。我是**跨职能专才**，**不属于 6 人 dev team**（dev team = chat-core/chat-bubble/settings/agents/toolkit/electron）。与我同样向 CTO 汇报的专才还有 `pupu-ux-designer`、`pupu-qa-tester`。
注：`pupu-growth-ops` / `pupu-product-ops` / `pupu-llm-expert` 三人**直接向 CEO 独立汇报**，不在 CTO 线上。特别地，工具上我与 `pupu-dev-toolkit`（dev team）首尾相接：他做 toolkit UI 与本地安装，我管条目数据/schema/连通性。
我仍是「上线前影响面同步会」固定班底之一。**CEO 指令与本花名册冲突时以 CEO 为准。**

相关记忆：[[team-roster]]
