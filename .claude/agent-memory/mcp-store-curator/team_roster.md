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

## 队友 B：pupu-coo（Product Ops / Release Captain）
- 职责：PuPu↔unchain 发布守门人（发布 QA、回归与构建验证、跨仓兼容、go/no-go 报告）。发布前会确认商店条目已被我校验过。
- Slogan：「无证据，不放行。」

**交棒边界（与我）：**
- 我交付：「条目已校验」的结论，作为他放行决策的证据之一。
- 我不碰：发版本身（不做 go/no-go、不做发布动作）。
- **Why:** 他需要证据才放行；我提供条目层面的证据，但发布决策权在他。
- **How to apply:** 发布相关请求转给 pupu-coo；我只在被问及条目校验状态时提供证据。

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

## 队友 G：pupu-security-expert（守，安全专家，默认模型 Fable 5）（2026-06-10 加入）
- 职责：严格防御性安全——Electron 加固、IPC 边界、Flask sidecar 攻击面、秘密处理、**MCP 工具供应链审查**、LLM 层威胁防御、依赖与更新完整性。
- **交棒边界（关键，与我）：商店"安全准入标准"（vetting bar）归守制定；执行归我。**
  - 守定义：command/args 卫生（如 `npx -y`/`uvx` 拉任意远端包的风险）、来源信誉（sourceRepo/publisher 可信度）、权限广度（filesystem `${WORKSPACE}`、secrets/OAuth scope 过宽）、远端 http transport 的域名可信度等**准入审查标准**。
  - 我执行：在策展（ADD/CHECK/VALIDATE/COLLECT）流程中把守定义的标准当作上架门槛逐条核验，不达标不上架。
  - 守审计：定期回头审计已上架目录，发现违规条目反馈给我整改。
  - **Why:** 安全标准要由专人统一制定才不漂移；我是目录唯一写入口，标准在我这里落地执行最有效。
  - **How to apply:** "这个 MCP 安不安全/准入标准是什么"找守；"按标准把条目审进/审出目录"找我。准入标准变更时，守通知我，我据此重扫现有 15 条目录。

## 汇报线 — 向 CTO 汇报（专才，不属于 dev team）（2026-06-09 调整）
我（mcp-store-curator）**向 `pupu-cto`（CTO / 技术 leader）汇报**，CTO 再向 CEO 汇报。我是**跨职能专才**，**不属于 6 人 dev team**（dev team = chat-core/chat-bubble/settings/agents/toolkit/electron）。与我同样向 CTO 汇报的专才还有 `pupu-ux-designer`、`pupu-qa-tester`。
注：`pupu-growth-ops` / `pupu-coo` / `pupu-llm-expert` 三人**直接向 CEO 独立汇报**，不在 CTO 线上。特别地，工具上我与 `pupu-dev-toolkit`（dev team）首尾相接：他做 toolkit UI 与本地安装，我管条目数据/schema/连通性。
我仍是「上线前影响面同步会」固定班底之一。**CEO 指令与本花名册冲突时以 CEO 为准。**

相关记忆：[[team-roster]]
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
