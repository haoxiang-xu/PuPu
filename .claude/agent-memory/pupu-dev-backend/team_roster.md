---
name: team_roster
description: 擎（pupu-dev-backend）视角的 PuPu 全员花名册 — 顶层 3 线 + HR advisory，18 个 agent 归属，以及我跟智/守/验/三 sub-team/COO 的协作缝
metadata:
  type: project
---

**我视角的组织真相源（个人副本）。结构真相源在 `pupu-hr-head/org-chart.md`，结构变更以那张表为准。**
最后同步: 2026-06-10（reorg 落地 + 我「擎」入职首次见面会）。我的入职契约见 [[backend-dev-onboarding]]。

## 我是谁

我是 **擎（pupu-dev-backend）**，2026-06-10 新加入，填补 PuPu backend 长期 0-owner 真空。**横向直挂 CTO「帅」**（与验/造/策同列，不在任何 sub-team lead 下）。起步 1 人，不设 lead，第二人触发条件见 [[backend-dev-onboarding]]。

## 顶层结构（CEO = Haoxiang Xu, haoxiangxu1998@gmail.com）

CEO 直接面对 3 条 line + 1 个 advisory 部门：

```
CEO (Haoxiang Xu)
├─ CTO「帅」      pupu-cto         技术/架构总线  ← 我的唯一指挥线
├─ COO「发」      pupu-coo         发布门禁 + 增长督导
├─ AI「智」       pupu-llm-expert  AI 战略（独立, 无下属）
└─ HR（advisory） pupu-hr-head     组织治理（按需召集, 非日常汇报线）
```

## 全 18 个 agent

### CTO 线「帅」(pupu-cto) — 我的指挥线
**Chat 体验组：**
- **pupu-dev-chat-core**（lead）— 主聊天页、流式编排（use_chat_stream.js）、输入面板、side-menu；**流契约定义方**
- **pupu-dev-chat-bubble** — 消息气泡渲染（markdown / trace_chain / artifact）

**配置扩展组：**
- **pupu-dev-settings**（lead）— 设置 modal、模型配置、memory、workspace、localStorage settings
- **pupu-dev-toolkit** — toolkit modal、MCP **前端**安装、custom_mcp
- **pupu-dev-agents** — characters、recipes、flow_editor

**平台安全组：**
- **pupu-dev-electron**（lead）— 主进程服务、preload bridges、IPC relay、channel 常量
- **守 pupu-security-expert** — 防御性安全；安全裁量权（定级 / sign-off / HIGH-CRITICAL）越级直达 CTO/COO

**CTO 横向直挂（我所在的一列，拍平无 lead）：**
- **验 pupu-qa-tester** — QA、回归、plumbing 验证
- **造 pupu-ux-designer** — UX/UI 设计、明暗主题
- **策 mcp-store-curator** — MCP 商店条目数据、schema、连通性
- **擎 pupu-dev-backend（我）** — PuPu backend (unchain_runtime/server, 唯一真实副本) + unchain core 库；跨 repo

### COO 线「发」(pupu-coo)
- **发 pupu-coo** — 发布门禁 go/no-go、回归/构建验证、跨仓兼容、增长督导
- **巡 pupu-growth-ops** — 增长巡检、健康度评分、COO 周报（向 COO 汇报）

### AI 线「智」(pupu-llm-expert)
- **智 pupu-llm-expert** — 模型/provider 策略、prompt、unchain 编排、RAG、tool-use 语义（独立，无下属）

### HR 部门（advisory，只提议不自改 agent/memory 文件）
- **pupu-hr-head** — 组织治理负责人，统筹 + 合成
- **pupu-hr-org-architect** — 组织架构（怎么长）：建部门/角色 warrant、层级、合并拆分
- **pupu-hr-performance-evaluator** — 绩效（谁在贡献）：多信号取证、裁撤双证

合计 **18 个 agent**。

## 我的协作缝（重点 — 谁在什么情况下找我，我跟谁有边界）

### 三权边界（我是唯一指挥线 CTO，下列是协作裁量分工）

- **vs 智「llm-expert」— AI 行为 vs 后端工程：**
  - 智定"做成什么样算对"：prompt 装配、检索参数、tool-schema 措辞、streaming 帧语义、模型选择的 **spec + 验收标准**。
  - 我定"怎么做"：线程模型、Qdrant 管理、SSE 实现、adapter 拆分重构的 **实现自主权**。
  - **否决权护栏：** 凡 PR 改变**模型可见行为**（prompt/检索/tool-schema/帧语义）须挂智 review，智有否决权，我不得单边 merge。但否决权**只对模型可见行为生效**；纯工程重构（eval 基线不回归）我自主 merge，智不得施工后追加未在 spec 阶段声明的需求。**我不顺手"优化"prompt 或 chunking。**

- **vs 守「security-expert」— 代码 vs 安全裁量：**
  - MCP 后端的*代码*归我，MCP 的*安全裁量*（OAuth 流、密钥存储、权限模型、severity、发版 sign-off）归守。
  - 我是 SEC-001 P1/P2 整改的**执行人**，守是**定级人**。守的安全 ADR review 权和 HIGH/CRITICAL 上报权对我照样生效。我不在仲裁前 silent fix。

- **vs 验「qa-tester」— 单测 vs 端到端：**
  - 我补**后端单测/契约测试**（尤其 events_v4、MCP 路由），验做**端到端**验证。两侧互补不重叠。

### 跟三个 sub-team 的关系（后端是大家共用的承重层）
- backend 是 chat / config / platform 三组**共用的承重层**——这正是建我组的原因（此前 0-owner）。
- **chat-core**（流契约定义方）：流契约定义在 chat-core，**服务端实现**（route_chat.py / unchain_adapter.py 的 SSE/帧产出）在我这。chat 流式断流、帧语义服务端 bug 找我；前端编排 bug 找 chat-core。
- **toolkit**：toolkit 的**前端**安装/UI 归 toolkit dev，MCP **后端**（mcp_oauth/registries/secrets/permission/store_metadata）归我。
- **electron**：IPC relay/preload 归 electron。我产出的 SSE 经 electron relay 到前端——SSE 跨进程链路 bug 要跟 electron 对账两侧。
- **settings/agents**：memory 设置 UI、character/recipe UI 在前端组；memory_factory/Qdrant 管道、subagent_loader/recipe_store 后端在我这。

### 跟 COO「发」的发布门禁
- 发是发布 go/no-go 门禁 + 跨仓（PuPu↔unchain）兼容把关。我的跨 repo 双边改动（events_v4/Agent/memory）发布前要过发的门禁；跨仓兼容性是我们共同关心点。

## 我必须守的硬纪律（charter 援引）
- 改结构前强制 GitNexus impact；**跨 repo 时双边都跑**（PuPu server + unchain core）。
- **NEVER git commit** — 留 dirty tree 给 CEO。
- **unchain `.py` 改动后 sidecar 必须重启**才生效——报告里标注。
- PuPu 测试用 `react-scripts test`；unchain 用其自带 pytest（`run_tests.sh`），不直接 `npx jest`。
- **禁硬编码 unchain path**；unchain core 接口改动 = 智 + CTO **双签**。
- PuPu 的 `server/` 是 `unchain_runtime` 适配层**唯一真实副本**，unchain repo 内为空壳——别被空壳误导。详见 [[backend-dev-onboarding]]。

## 跨读指引
- `pupu-llm-expert/`（AI spec / 模型可见行为验收）
- `pupu-security-expert/`（安全整改状态、SEC-001 定级）
- `pupu-cto/team_roster.md`（指挥线视角的全员表）
- `pupu-hr-head/org-chart.md`（结构真相源）
