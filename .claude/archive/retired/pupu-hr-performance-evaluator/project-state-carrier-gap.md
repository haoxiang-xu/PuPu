---
name: project-state-carrier-gap
description: 2026-07-31 结构性发现 — 全组织没有"项目运行态"载体，因为 14/22 份章程明文禁止存 in-progress work；CEO 本人是唯一状态载体
metadata:
  type: project
---

**PuPu 的 agent memory 系统存的是「知识 + 决策」，不存「项目走到哪了」。这是制度设计的结果，不是绩效问题。**

**Why:** 14/22 份章程的 "What NOT to save in memory" 段含这一条 —
`Ephemeral task details: in-progress work, temporary state, current conversation context.`
并跟一句 `These exclusions apply even when the user explicitly asks to save.`
即使 CEO 明说"记住这个项目的进度"，agent 的章程也让它别存。
未含该条款的 8 份: architect / dev-backend / hr×3 / ai-researcher / market-analyst / release-full-test。

**实测后果 (2026-07-31 数据):**
- 168 个非索引 memory 文件里，文件名带 progress/status/state/backlog/tracker 的只有 3 个 (1.8%)；带 adr/contract/boundary/decision/ref/security 的 32 个。
- memory 冻结 vs owned 路径活跃的错位: dev-chat-core memory 停在 07-04，其 owned 路径此后 **104 个 commit**；dev-electron 21；dev-chat-bubble 11；dev-settings 10。
- CEO 自己的 auto-memory 有 52 个文件，索引行大量是带尾巴的状态句（"Part 3 plan 未写"/"Phase 1A 已实施未提交"/"in-app 冒烟欠 CEO"）。**这些尾巴在任何 agent memory 里都搜不到。**
- GitHub: 48 个 open issue，34 个 (71%) 创建后再没被碰过；26 个 (54%) 存活 90-180 天。

**How to apply:** 以后遇到"某某事没人跟进"类的编制请求，先跑[[methods]]信号 5 查章程禁令。
若根因是制度禁令，正确处方是**改 memory 契约**（零编制成本），不是设新岗。
只有在禁令解除、观察一个周期后状态仍不沉淀，才回到编制讨论。
与 [[team_roster]] 的 07-28 判例一致: "能让 CI 挂掉的测试，就不需要一个人来记得" → 同理"能让 memory 记住的状态，就不需要一个人来记得"。

**能推翻它的证据:** 解除禁令并明确要求 dev 写 `state-<project>.md` 后，一个月内这些文件仍不出现或不更新 —— 那说明缺口不在制度而在承载力/意愿，编制讨论才重新成立。
