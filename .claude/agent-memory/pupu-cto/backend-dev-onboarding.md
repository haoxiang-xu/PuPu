---
name: backend-dev-onboarding
description: pupu-dev-backend（擎）入职契约 — 横向直挂 CTO，拥后端唯一真实副本 + unchain core 库；三权边界(智/守/验)、跨 repo 纪律、第二人触发条件
metadata:
  type: project
---

**pupu-dev-backend（花名「擎」）于 2026-06-10 加入，CEO 批准建 backend dev 组（采纳 HR 方案）。** 文件 `agents/cto/direct/pupu-dev-backend.md`，**横向直挂 CTO**（与验/造/策同列），起步 1 人不设 lead。我（CTO）是其唯一指挥线。

**Why 建组：** PuPu backend 长期 0-owner 真空——后端是多组（chat/config/platform）共用的承重层却无人专责。CEO 批准建组填补此真空。详见 [[hiring-policy]]（新大功能/真空配新成员而非撑大现有成员）。

## 拥有什么
- PuPu backend `unchain_runtime/server/`（70 文件 / ~28800 行 Flask 适配层）= 该层**唯一真实副本**（unchain repo 内 `unchain_runtime/` 是空壳）。详见 [[boundary-pupu-server-vs-unchain]]。
- unchain core 独立 repo 库（sibling `/Users/red/Desktop/GITRepo/unchain/`，editable install 链接）。

## 起步使命（非重写）
建立后端架构看护 + 接 SEC-001 P1/P2 整改。**明确不是重写**——先把 0-owner 真空补成有人看护的状态。SEC-001 处置见 [[adr-sec-001-arbitration]]、[[sec-investigation-001]]。

## 三权边界（我是唯一指挥，下列为协作裁量分工）
- **vs 智「llm-expert」：** 智定"做成什么样算对"（prompt / 检索 / tool-schema / 帧语义的 spec + 模型可见行为的 PR 否决权）；擎定"怎么做"（实现自主）。**纯工程重构，eval 不回归则擎自主 merge。**
- **vs 守「security-expert」：** MCP 后端代码归擎，安全裁量归守。擎是 SEC-001 整改**执行人**，守是**定级人**；守的 ADR review / 上报权对擎生效。守的越级安全职权见 [[security-expert-onboarding]]。
- **vs 验「qa-tester」：** 擎补**后端单测**，验做**端到端**。

## 跨 repo 纪律（我要守护的新承重缝）
- 改 `events_v4` / Agent / memory 等**跨层接口须双边 impact**（PuPu server 侧 + unchain core 侧都要跑 GitNexus impact）。
- **禁硬编码 unchain path**（CEO 预告路径会变）。
- **unchain core 接口改动 = 智 + CTO 双签。**
- PuPu server 是适配层**唯一真实副本**（unchain repo 内为空壳）——别被空壳误导成镜像/同步。跨 repo 契约 `events_v4` 见 [[boundary-pupu-server-vs-unchain]]。

## 第二人触发条件（任一触发 → HR 复审扩到 2 人）
1. SEC-001 转入持续运维（一次性整改 → 长期运营）。
2. 双边（PuPu server + unchain core）并行改动成瓶颈。
3. scope 分化出独立的安全后端簇。

相关：[[team_roster]] [[architecture-operating-principles]]。
