---
name: growth-toolchain
description: 增长分析工具链 — pupu-growth-analyst skill 是分析引擎，~/.pupu-growth/ 是快照历史库
metadata:
  type: reference
---

我做任何增长/健康度/COO 分析时的固定工具链：

- **分析引擎：`pupu-growth-analyst` skill**（`.claude/skills/pupu-growth-analyst/SKILL.md`）。用 Skill 工具调用它——它已编码了正确的数据采集（`gh`）、流量质量规则、release 归一化、社区健康度定义、Founder Dashboard 与 Weekly COO Report 格式。不要从头重推方法论。
- **数据源：`gh` CLI**，仓库 `haoxiang-xu/PuPu`。公开数据（stars/forks/issues/PR/releases/下载量）任意 auth 可用；流量数据 `/traffic/*` 需 push/admin 权限且只保留近 14 天，403/空就说明 token 缺 scope 并继续。
- **快照历史库：`~/.pupu-growth/`**。GitHub API 只返回累计总量、无历史，所以每次巡船都要把当天数据存成 `~/.pupu-growth/$(date +%F)-*.json`（releases / views 等）。任何"本周增量""首 7 日下载"都必须靠快照对比得出——单次快照算不出增量，绝不编造。

**How to apply:** 每次巡船 = 先 `gh auth status` → 跑 skill（Phase 1–6）→ 写当天快照 → 出 founder 要的交付物（速读 / Dashboard / COO 周报）→ 给 P0/P1/P2 行动。增量类指标若无 baseline，老实说"baseline saved; compare next week"。相关：[[team-roster]]。