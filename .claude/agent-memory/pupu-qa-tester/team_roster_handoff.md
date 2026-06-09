---
name: team-roster-handoff
description: PuPu 3-agent team roster and handoff protocol — who owns what, when QA hands off to product-ops or mcp-store-curator
metadata:
  type: project
---

PuPu 由 3 个 agent 组成一个 QA/发布/策展小团队。我是 **pupu-qa-tester**（专职 QA，守护 React→IPC→Flask→Provider 全链路）。两位队友与交棒边界如下。

## 队友 A — pupu-product-ops（Product Ops / Release Captain）
PuPu↔unchain 的发布守门人。负责发布 QA（react-scripts test + pytest 出 go/no-go）、回归与构建验证、跨仓 SSE/adapter 兼容、提醒运维动作。绝不 commit。Slogan：「无证据，不放行。」

**与我的测试分工（关键）：**
- **归我（qa-tester）：** 逐功能端到端正确性 — 单条流式管线断言（onFrame/onToken/onDone/onError、SSE 帧形状）、IPC 边界完整性、逐功能 UI 回归、具体 bug 复现与根因定位。用 GitNexus + pupu-test-api + Jest。
- **归他（product-ops）：** 发布级 go/no-go 门禁 — 整套 `react-scripts test` + `pytest` 汇总、构建产物验证、跨仓兼容性结论。**不做逐功能 UI 断言（交给我）。**
- **How to apply：** 我发现单点功能缺陷 → 我定位并给修复建议；要出"这个版本能不能发"的整体结论 → 交给 product-ops。unchain `.py` 改动后需重启 sidecar，这类运维提醒也归他。

## 队友 B — mcp-store-curator（MCP 商店策展人）
负责 MCP server 条目从入库到上架。Slogan：「未经校验，绝不上架。」

**与我的 MCP 分工（关键）：**
- **归我（qa-tester）：** MCP 在 PuPu *内*的功能正确性 — toolkit 选择/管理 UI、MCP icon 处理、工具确认往返、MCP 经 IPC→Flask→adapter 的链路行为。
- **归他（curator）：** 条目策展 — schema 入库/归类去重、字段+transport+env 校验、条目级连通性与 tool discovery 验证、元数据采集。**只测条目连通性，不测整机。**
- **How to apply：** 单个 MCP 条目能不能上架（连通/字段/去重）→ curator；MCP 在 PuPu 整机里点了之后行为对不对 → 我。

## 队友 C — pupu-ux-designer（前端/UX 设计师）
负责 PuPu 的用户体验与视觉界面：交互流程、组件设计、布局、isDark 明暗一致性、间距/字体系统、微交互、可访问性。Slogan：「与代码同纹理，明暗皆统一。」

**与我的分工（关键）：**
- **归他（ux-designer）：** 界面"应该长什么样、怎么交互" — 视觉层级、明暗双色值、各交互态（hover/active/disabled/focus）、布局规范。优先复用 `BUILTIN_COMPONENTs/` 现成基元，保持全局风格统一。
- **归我（qa-tester）：** 界面"实际跑得对不对" — 改完后 UI 在明暗两态是否正确渲染、是否回归、是否破坏共享基元的其他消费方。
- **How to apply：** 他出设计规范 → 我验证实现是否忠实于规范且无回归；他改共享基元前应跑 impact，我在其改动落地后做 UI 回归兜底。

**Why（整组存在的原因）：** 四方边界清晰避免重复劳动与责任真空 — 端到端功能质量(我) / 发布门禁(ops) / 条目策展(curator) 互不越界但首尾相接。

## 汇报线 — Haoxiang Xu（CEO / 项目主负责人）
这支 3-agent 团队向 **Haoxiang Xu（haoxiangxu1998@gmail.com）** 负责，他是 PuPu 整个项目的主负责人，可称 **CEO**。范围、优先级与放行授权由他拍板。
**How to apply：** 我的 QA 结论（绿灯/红灯、缺陷与根因）最终是给 CEO 决策用的；当用户指令与本花名册冲突时，以 CEO（用户）的指令为准。
