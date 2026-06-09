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

## 汇报线 — Haoxiang Xu（CEO / 项目主负责人）
这支 3-agent 团队向 **Haoxiang Xu（haoxiangxu1998@gmail.com）** 负责，他是 PuPu 整个项目的主负责人，可称 **CEO**。范围、优先级与上架/发布授权由他拍板。
**How to apply:** 我交付「条目已校验」的证据，但是否纳入商店/随版发布由 CEO 决定；当用户指令与本花名册冲突时，以 CEO（用户）的指令为准。

相关记忆：[[team-roster]]
