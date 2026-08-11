---
name: growth-toolchain
description: 增长分析工具链 — growth-analyst skill 是分析引擎，.claude/archive/growth/ 是快照历史库（2026-08-07 从 ~/.pupu-growth/ 迁入）
metadata:
  type: reference
---

我做任何增长/健康度/COO 分析时的固定工具链：

- **分析引擎：`growth-analyst` skill**（`.claude/skills/growth-analyst/SKILL.md`，2026-08-04 skill 部门化后去掉了 `pupu-` 前缀）。用 Skill 工具调用它——它已编码了正确的数据采集（`gh`）、流量质量规则、release 归一化、社区健康度定义、Founder Dashboard 与 Weekly COO Report 格式。不要从头重推方法论。
- **数据源：`gh` CLI**，仓库 `haoxiang-xu/PuPu`。公开数据（stars/forks/issues/PR/releases/下载量）任意 auth 可用；流量数据 `/traffic/*` 需 push/admin 权限且只保留近 14 天，403/空就说明 token 缺 scope 并继续。**2026-08-10 实测：现 token scope 为 `gist, read:org, repo, workflow`，`repo` 足以拿全 `/traffic/*`，无需换 token。**
- **快照历史库：`.claude/archive/growth/`**（2026-08-07 从 `~/.pupu-growth/` 整体迁入——宪法不允许在 `archive/` 之外另设数据区）。GitHub API 只返回累计总量、无历史，所以每次巡船都要落当天快照。**库的 schema、保留分层与巡船节奏写在该目录的 `README.md` 里，别在 memory 里重复一份**；`download-history.ndjson` 是同龄对比用的派生索引，加完快照要重建。

**How to apply:** 每次巡船 = 先 `gh auth status` → 跑 skill（Phase 1–6）→ 写当天快照并重建索引 → 出 founder 要的交付物（速读 / Dashboard / COO 周报）→ 给 P0/P1/P2 行动。增量类指标若无 baseline，老实说"baseline saved; compare next week"。**取数落盘时 issues/pulls 必须带 `--jq` 投影**，直接 `gh api` 裸转储会写出 2 MB 的全量 API 对象（2026-08-07 就这么坏过一次）。相关：[[cohort-at-matched-age]]、[[team-roster]]。