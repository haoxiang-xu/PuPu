---
name: adr-unchain-team-plan
description: 2026-07-28 unchain 专属团队策划案 — 三簇两人起步、不设专属 architect、跨仓双签条款改 role-based、Mission 0 正名 API 面
metadata:
  type: project
---

**2026-07-28 CEO 指令：为 unchain 组建专属团队，CTO 出案 → HR 审 → CEO 拍板。本案已提交，待批。**

**Warrant 核心证据：** 2026-07 单月 95 commits 触 `src/unchain/`（=此前四个月总和），近 90 天作者 146/153 是 CEO 本人；擎 charter 虽名义 owns unchain core，但其 Codex 试点明文"不跨 repo 动 unchain core"——48K 行最热开发面从未获得 agent 团队吞吐。

**pupu-architect 裁决（三项，已落其记忆 `agent-memory/pupu-architect/unchain-team-ruling.md`）：**
1. **三簇不是两簇**：kernel/tools/agent/runtime/interaction/memory 是强连通执行事务体（interaction 被 kernel import 12 处，在引擎正中间，不可切开）。簇1 耐久运行时核心 ~29K / 簇2 扩展(toolkits/providers/subagents/character) ~13K / 簇3 宿主集成(jobs/events/render/cli) ~5.5K。最危险缝=簇1↔3 宿主契约面（行为性兼容，import 不破也能悄悄变掉）。
2. **不设专属 architect**（可逆，90 天复评）：pupu-architect 统管双 repo，代价=双 repo decision packet + 三档接口台账（stable public / adapter-supported / internal）。硬条件：触及声明边界的提案**自动路由**给它；内部改动**不需预批**（保 CEO 速度）。复评触发条件已列（队列>5、第二消费者出现、grounding 事故等 → 设**从属** domain architect，非 peer）。
3. **"智+CTO 双签"→ role-based**：跨仓接口改动 = 架构师一个技术决定 + 双侧 owner 事实作证（unchain 契约 owner + 擎/PuPu 适配 owner）+ CTO 运营门（派发/时序/发布就绪，非技术 co-signer）。任一 owner 可 BLOCKED、异议原文呈架构师。替换 CEO 时代条款，需 CEO 批准生效。

**编制：** 2 dev 起步——pupu-dev-unchain-core（簇1，lead）+ pupu-dev-unchain-ext（簇2+3），CTO 线第 4 个 sub-team。擎交出 unchain core、保留 PuPu server（charter 需修订）。**Mission 0 = 正名 public API 面**（包根只导出 Agent 而 PuPu 实际消费 ~10 面、含私有 `jobs._worker`×2）；唯一真单向门=Mission 0 阶段二对第三方宣布 stable，不随阶段一自动发生。

**红队要点：** 最大失败模式=治理节流创始人（95 commits/月是 CEO 手速，内部改动零摩擦条款是救命条款）；反方案"给擎加第二人"被否——瓶颈不是擎吞吐而是 unchain 未进 agent 工作流，且 77K 行跨两域违反 [[hiring-policy]] scope 稳定原则；诚实的最小方案是 1-dev 起步（Option B），不是塞进擎。

**注意：** unchain GitNexus 索引 07-16 生成已落后 HEAD，新团队上岗第一件事 reindex。相关 [[backend-dev-onboarding]] [[boundary-pupu-server-vs-unchain]] [[team_roster]]。
