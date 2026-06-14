---
name: team-roster
description: PuPu 组织真相源 — 两层结构（CEO → CTO/COO/智）+ CTO 线内 3 个 sub-team + 4 个横向直挂(验/造/策/擎) + agent 文件目录布局
metadata:
  type: project
---

**这是 PuPu 的组织真相源（2026-06-10 reorg 已批准并物理落地）。** 任何关于"谁向谁汇报、谁管什么"的判断以本条为准。

我是 **pupu-cto（CTO / 主架构工程师，「帅」）**，负责整个系统骨架与跨层技术决策：前端(React 19+Electron 40) / IPC 边界 / Flask sidecar / 请求流 / 存储 / 构建打包 / 守护高风险铁律。我设计接缝、做不可逆决策、改结构前强制走 GitNexus impact。reorg 后我不再面对一堆扁平下属，而是 **3 个 sub-team lead + 4 个横向直挂专才（验/造/策/擎）**。

## 顶层 = 3 条线（向 CEO 汇报）

```
CEO（Haoxiang Xu, haoxiangxu1998@gmail.com）
├─ CTO「帅」= pupu-cto              （技术/架构总线）
├─ COO「发」= pupu-coo              （运营闭环：发布门禁 + 增长巡检）
└─ llm-expert「智」= pupu-llm-expert（AI 战略，独立直属 CEO，无下属）
```

**Why 收成 3 线：** 2026-06-10 CEO reorg，把 CEO 直接下属从原来的 4 条独立线收敛到 3 条。原先独立直汇报 CEO 的 product-ops（发）、growth-ops（巡）现已合进 COO 线。llm-expert 刻意保留 CEO 平级直属——AI 战略须对 CEO 保持直接能见度，不并入任何人。详见 [[reorg-proposal-2026-06-10]]。

## A. CTO 线（我管）—— 3 个 sub-team + 3 个横向直挂

### 3 个 sub-team（每组设 lead，按代码耦合切分；我只面对 3 个 lead）
- **Chat 体验组**（lead = **pupu-dev-chat-core**）：成员 dev-chat-core + dev-chat-bubble。
  *耦合理由：* streaming_message_store / runtime_events(_v4) 强耦合，chat-core 是流的驱动方=契约定义者，bubble 只消费渲染。
- **配置与扩展组**（lead = **pupu-dev-settings**）：成员 dev-settings + dev-toolkit + dev-agents。
  *耦合理由：* 共享 localStorage `settings` 单对象 + MCP catalog ID 空间，settings 在交叉点。
- **平台与安全组**（lead = **pupu-dev-electron**）：成员 dev-electron + **pupu-security-expert（守）**。
  *耦合理由：* 守的两条信任边界（renderer↔main、main↔Flask）=electron 地盘。
  **红线：** 守的 **severity 定级 / 发版安全 sign-off / HIGH-CRITICAL 上报**职权**不下放给 electron lead**，越级直达 CTO/COO（sign-off 对象=COO）。组长只协调日常 plumbing，不裁安全。详见 [[security-expert-onboarding]]、[[sec-investigation-001]]。

### 4 个横向直挂 CTO（不塞进单组，保持中立/全局性）
- **pupu-qa-tester（验）：** 我定"架构上什么算对、风险在哪"，他验 plumbing 跑回归。横向以保 QA 中立性。
- **pupu-ux-designer（造）：** 我负责组件/分层结构与数据流，他负责其中的视觉与交互。横向以保 UX 全局一致性。
- **mcp-store-curator（策）：** 我负责 MCP 怎么在结构上接入，他负责目录条目数据。横向以保跨组协作。
- **pupu-dev-backend（擎）**（2026-06-10 加入，文件 `agents/cto/direct/pupu-dev-backend.md`，起步 1 人不设 lead）：拥有 PuPu backend `unchain_runtime/server/`（70 文件/28800 行，该层唯一真实副本）+ unchain core 独立 repo 库。**填补后端 0-owner 真空。** 起步使命=建立架构看护 + 执行 SEC-001 P1/P2 整改，**非重写**。横向以跨越 chat/config/platform 三组共用后端、又跨 PuPu↔unchain 两 repo，不归任何单组。三权边界（vs 智/守/验）+ 跨 repo 纪律 + 第二人触发条件见 [[backend-dev-onboarding]]。

**公共动脉守门权仍留 CTO**（IPC 通道与 dev-electron 共管），未随 sub-team 下放给任何组长。功能面 owner 可提议改公共件、不能自行合入。详见 [[dev-team-roster-plan]]。

## B. COO 线（pupu-coo「发」管，不向我汇报，平级协作）
- **pupu-coo（发）：** product-ops 升格改名而来，下辖 **pupu-growth-ops（巡）**。管发布门禁 go/no-go + 增长巡检（运营闭环）。我负责构建/打包的*架构*，他对某个 build 做发布 sign-off。**触及信任边界的 release 需守的安全 sign-off，对象=COO。**
- **pupu-growth-ops（巡）：** 暴露用户侧技术痛点（崩溃/性能）→ 经 COO → 我决定架构层面应对。

## C. llm-expert 线（pupu-llm-expert「智」，独立直属 CEO，无下属）
- 我负责 AI 层怎么"插进"架构（adapter 接缝、streaming 契约、记忆放哪），层内推理判断 defer 给他。**他直汇报 CEO，不是我下属，也不在 COO 线下。**

## 我的汇报线 — CEO / 创始人
我向 **CEO（haoxiangxu1998@gmail.com）** 负责：**他定产品优先级（what），我负责技术实现路径（how）**，并管理 CTO 线（3 sub-team + 验/造/策）。CEO 指令与工程铁律冲突时以 CEO 为准（但我先讲清技术后果）。工作方法见 [[architecture-operating-principles]]；上线前同步会见 [[dev-team-and-prelaunch-review]]。

## Agent 文件目录布局（reorg 后镜像组织树；调用名只看 frontmatter `name:`，物理路径变了）
```
.claude/agents/
├─ cto/
│  ├─ pupu-cto.md
│  ├─ chat-experience/      pupu-dev-chat-core.md  pupu-dev-chat-bubble.md
│  ├─ config-extension/     pupu-dev-settings.md  pupu-dev-toolkit.md  pupu-dev-agents.md
│  ├─ platform-security/    pupu-dev-electron.md  pupu-security-expert.md
│  └─ direct/               pupu-qa-tester.md  pupu-ux-designer.md  mcp-store-curator.md  pupu-dev-backend.md
├─ coo/                     pupu-coo.md  pupu-growth-ops.md
└─ ai/                      pupu-llm-expert.md
```
注：嵌套目录纯为定位方便；Claude Code 按 frontmatter `name` 解析 agent，目录层级不影响调用。memory 目录同步：`agent-memory/pupu-coo/`（原 pupu-product-ops 已改名）。
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
