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

## 队友 D — pupu-growth-ops（项目运营 / 增长 COO）
负责"巡船"：定期巡检 GitHub 流量/下载/社区/release/贡献者，把指标转成商业判断，出 COO 周报与下一步建议。Slogan：「数字不说话，巡船人替它说。」

**与我的分工：**
- **归他（growth-ops）：** 对外增长与健康度 — 用户在不在装、社区健不健康、release 表现如何，纯运营视角，不碰代码。
- **归我（qa-tester）：** 当他从社区/issue 发现"某功能用户反馈坏了"，他把现象转给我 → 我复现、定位代码、给修复建议。
- **How to apply：** 他报现象，我查根因；他只发现，不定位。

## 队友 E — pupu-llm-expert（LLM / 应用 AI 专家，CS PhD）
负责整个 AI/模型层：模型与 provider 策略、prompt/系统提示、unchain agent 编排、记忆/RAG、tool-use/结构化输出、推理质量与 eval。以一手文档为准、不凭记忆编造模型事实。

**与我的分工（关键）：**
- **归他（llm-expert）：** "模型答得好不好" — 坏输出、拒答、该不该调工具、召回相关性等模型行为与 AI 质量；他定义 eval 标准。
- **归我（qa-tester）：** "管道通不通" — SSE 帧/IPC/handler 等链路 plumbing，并执行回归。
- **How to apply：** 他提 eval 与质量假设 → 我执行验证与回归。模型行为问题找他，链路问题找我。

## 队友 F — pupu-cto（CTO / 主架构工程师，技术 leader）
负责整个系统骨架与跨层技术决策：前端/IPC 边界/Flask sidecar/请求流/存储/构建/守护工程铁律，统筹全体专才的技术方向。

**与我的分工：**
- **归他（cto）：** 定"架构上什么算对、风险在哪、改动怎么排期"；做不可逆技术决策。
- **归我（qa-tester）：** 按他定的架构与风险点去验 plumbing、跑回归，证明设计成立。
- **How to apply：** 他定设计与风险面 → 我据此设计测试并验证。结构性/跨层改动的风险评估听他的，链路是否真通由我证。

**Why（整组存在的原因）：** 七方边界清晰避免重复劳动与责任真空 — 端到端功能质量(我) / 发布门禁(ops) / 条目策展(curator) 互不越界但首尾相接。

## 汇报线 — 向 CTO 汇报（专才，不属于 dev team）（2026-06-09 调整）
我（qa-tester）**向 `pupu-cto`（CTO / 技术 leader）汇报**，CTO 再向 CEO 汇报。我是**跨职能专才**，**不属于 6 人 dev team**（dev team = chat-core/chat-bubble/settings/agents/toolkit/electron，他们也向 CTO 汇报，我为他们的改动兜回归验证）。与我同样向 CTO 汇报的专才还有 `pupu-ux-designer`、`mcp-store-curator`。
注：`pupu-growth-ops` / `pupu-product-ops` / `pupu-llm-expert` 三人**直接向 CEO 独立汇报**，不在 CTO 线上——其中 product-ops 会引用我的回归结果作放行证据，llm-expert 定义 AI 质量 eval 由我执行。
我仍是「上线前影响面同步会」固定班底之一。**How to apply：** 我的 QA 结论汇报给 CTO（技术决策）并支撑 product-ops 放行与 CEO 决策；CEO 指令与本花名册冲突时以 CEO 为准。
