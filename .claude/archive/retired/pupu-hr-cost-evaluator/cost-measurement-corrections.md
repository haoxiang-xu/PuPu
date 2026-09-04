---
name: cost-measurement-corrections
description: 两条已实证的成本测量纠错 — charter 词数被 boilerplate 污染不可直接用; memory 目录大小不是 per-call 成本(只有 MEMORY.md 入 context)
metadata:
  type: project
---

# 成本测量纠错(2026-08-04 首轮全量评估实证)

## 纠错 1：charter 词数不能直接当成本信号 —— 先剥 boilerplate

**事实：** 23 份 charter 中 15 份把 harness 注入的 `# Persistent Agent Memory` 段(~2027 词 / ~13KB)**逐字硬写进文件**。占比 61%~74%。剥离后排名完全反转：
- 看似最胖的 6 个 dev(2731~2804 词)实际 role content 只有 **704~777 词，是全组织最瘦的**。
- `pupu-dev-backend` 声明 scope 最宽(70 文件/28800 行 + 独立 repo)，role content 仅 854 词。

**判定 boilerplate 冗余的证据：** 每个 agent frontmatter 都有 `memory: project` → harness 必然注入该段。`pupu-architect` / `pupu-release-full-test` 带 `memory: project` 且 in-file block = **0**，照常工作 —— 证明 in-file 副本纯冗余。两份 in-file block 互 diff 仅差 **2 行**(目录路径)，即通用模板非角色定制。

**Why:** 2026-08-04 首轮评估若直接用 charter 词数，会把 6 个 dev 误报为 bloated generalist 拆分候选，而真实病因是一段可机械去重的模板。

**How to apply:** 任何 charter 体积测量，第一步先跑
`awk '/^# Persistent Agent Memory/{f=1} f' <charter> | wc -w` 剥离，只用 role content 排名。此项属"能用 CI 守的一致性"(见 hr-head 判例 2.5)，处方是去重/加 lint，**不是拆 agent**。

## 纠错 2：memory 目录大小 ≠ per-call 成本

**事实：** 每次调用自动载入的只有 `MEMORY.md` 索引，不是整个目录。实测索引都很小(19~532 词)，而目录可达 196KB。
`pupu-cto` 196KB/41 文件，但 MEMORY.md 仅 **532 词**。

**Why:** 我的 charter 原写"memory 越大越贵"。按目录大小判，会把 cto(196K)/architect(172K)/llm-expert(132K) 判成最贵且失焦 —— 实际它们的目录内容是 ADR/contract/invariant，是**职务产出本身**，且不进每次 context。

**How to apply:** per-call 固定开销 = charter role content + MEMORY.md 索引词数(+ harness 注入段，人人都付)。目录总大小只作"活跃产出"信号用于区分 [[大 memory=活跃]] vs 失焦，**不计入 per-call 账**。目录大而 MEMORY.md 索引臃肿才是真成本。

## 纠错 3：backend 拆分轴线的准确表述

口头流传的"runtime-reliability 方向"在全组织 memory 中**检索不到**。有据可查的是 `pupu-cto/backend-sizing-2026-07-05.md`：编制排序可吸收、暂不招第二 backend dev，若将来招则边界为 **runner/pool 域**，复评触发器 = 0.1.10 结束。引用时用 runner/pool，别用 runtime-reliability。

相关：[[MEMORY]]
