---
name: reorg-proposal-2026-06-10
description: 2026-06-10 reorg 已批准并落地 — 顶层收成 3 条线(CTO/COO/智) + CTO 线内分 3 sub-team，权威结构见 team-roster
metadata:
  type: project
---

**状态：已批准并于 2026-06-10 落地。** CEO 批准了下述全部提案内容（含 product-ops 升 COO 收编 growth-ops、3 sub-team 划分与三位 lead 任命、验/造/策维持横向直挂），agent 文件已重组为镜像组织树的嵌套目录、product-ops 已改名 pupu-coo、相关 org memory 已同步更新。**最终权威结构以 [[team-roster]] 为准；本条保留作决策背景与 Why 的存档。**

---

**【背景存档】2026-06-10：CEO 发起 reorg，CTO 产出完整提案。** 以下为提案原文（已被采纳）：

**Why（CEO 两条诉求）：** ① CEO 直接下属从 4 条线（CTO/智/发/巡）收敛到 2-3 条；② 不要扁平——CTO 之下再切若干小团队各设 lead，使 CTO 也只面对 2-3 个 team lead，逐层收敛。

**提案内容（CTO 推荐方案）：**
- **顶层 = 3 条线：** ① CTO（技术/架构总线，含全部 dev + 验/造/策/守）；② **COO = product-ops（发）升格**，收编 growth-ops（巡），管发布门禁+增长巡检（运营闭环，可逆）；③ **llm-expert（智）保留 CEO 平级直属**，不并入任何人（AI 战略须对 CEO 保持直接能见度）。CTO 明确反对硬收成 2 条而牺牲 AI 战略能见度。
- **CTO 线内分 3 个 sub-team（按代码耦合切 dev）：**
  - **Chat 体验组** lead=dev-chat-core，成员 chat-core+chat-bubble（streaming_message_store/runtime_events 强耦合，chat-core 是流的驱动方=契约定义者）。
  - **配置与扩展组** lead=dev-settings，成员 settings+toolkit+agents（共享 localStorage `settings` 单对象 + MCP catalog ID 空间，settings 在交叉点）。
  - **平台与安全组** lead=dev-electron，成员 dev-electron+守（守两条信任边界=electron 地盘；但守的 severity 定级/安全 sign-off/HIGH-CRITICAL 上报职权**不下放给 electron lead**，直达 CTO/COO）。
- **横向专才 验/造/策：** 横向直挂 CTO，不塞进单组（QA 中立性/UX 全局性/curator 跨组协作）。即 CTO 面对"3 lead + 3 横向直挂"。

**【已决策，原为待 CEO 拍板的 3 点，全部按 CTO 推荐通过】：** ① 同意 product-ops 升 COO 并收编 growth-ops（唯一组织级任命，单向门性质——已执行）；② 认可 3 sub-team 划分与 chat-core/settings/electron 任 lead；③ 验/造/策 维持横向直挂（采纳 CTO 推荐，不收成横向组）。

**【已执行的落地动作】：** [[team-roster]] 已重写为两层权威结构（含 agent 文件目录布局）、[[dev-team-and-prelaunch-review]]（同步会改 3 sub-team lead 代表各组 + COO 列席发版会）、[[security-expert-onboarding]] 与 [[sec-investigation-001]]（守挂平台安全组但保留 HIGH/CRITICAL 越级达 CTO + 发版 sign-off 改对 COO）、[[dev-team-roster-plan]]（公共区守门权仍留 CTO 不下放）均已更新。[[hiring-policy]] 不变（设 lead 属职责调整非扩编，随 reorg 一并批）。agent `.md` 文件已由 CEO 重组并改名（product-ops→pupu-coo），memory 目录同步改名 `agent-memory/pupu-coo/`。
