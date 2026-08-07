---
name: measurement-recipes
description: 可复现的取证配方 — charter 双向引用图、声明面 vs 活跃面缺口审计、契约落盘方位;含 zsh 坑
metadata:
  type: project
---

# 三条已验证 2+ 次的测量路径 (org-rebalance 2026-08-04 + org-court 001 2026-08-04)

## 1. charter 双向引用图 (必须只扫正文, 排除 frontmatter)

`description` 在 frontmatter 里, 会把 roster/example 里的名字算进来污染结果。charter 前 7 行是
frontmatter, 一律 `tail -n +8`。**并且要区分「边界章节声明」与「同步会 roster 行」** ——
每份 dev charter 的 roster 行都点名 cto+llm-expert+ux+curator+qa, 那不是边界声明, 会把
单边边全洗成双边。判据: 该名字是否出现在 `## ...边界/Boundaries` 章节内。

**zsh 坑 (踩过一次, 浪费两轮)**: zsh 默认不对未加引号的变量做词分割, `for a in $AGENTS` 只迭代一次
整串, 输出全是 "NAMES NOBODY"。要么写 `${=AGENTS}`, 要么把名字列表直接写进 for。
另: 沙箱里 `/tmp` 不可写, 中间文件放 scratchpad。

## 2. 声明面 vs 活跃面缺口审计 (新, 001 案首用 — 比引用图更快见血)

charter 的 ownership 列表是「声明面」, `git log --since=90.days -- <dir>` 是「活跃面」。
两者相减即零认领缺口, 且带活跃度权重 (不活跃的零认领不是成本)。

```bash
for d in <目录列表>; do printf "%-32s commits(90d)=%-4s last=%s\n" "$d" \
  "$(git log --since=90.days --oneline -- $d | wc -l)" "$(git log -1 --format=%ad --date=short -- $d)"; done
grep -rl -- "<目录名>" .claude/agents/   # 零命中 = 零认领
```

配套第二步: 缺口目录的知识**实际**落在谁的 memory 里 (`grep -rl` agent-memory) ——
若有 de-facto owner, 结论是「补写 charter」; 若无, 才是「真空」。001 案的实测:
boot-overlay / electron/main/ipc 均零 charter 认领但 de-facto owner 在 memory 里存在。

## 3. 契约落盘方位 = 谁被约束 vs 谁记着

对每条已裁定的跨面契约, `grep -rl` 它在 agent-memory 里的分布, 看**被约束方**有没有副本。
001 案实测: U1 安装态单写方裁定 (2026-06-09 CEO 拍板) 落在 pupu-cto 7 个文件, 而
被约束的 toolkit / settings 双方 charter 与 memory 均 0 副本 —— 裁决存在但当事人不知道。
这是比「边界没写」更隐蔽的一种信息损失: 边界写了, 写在第三方那里。

**已达成双侧的正面样本 (可当模板)**: 验↔发 (`pupu-qa-tester/team_roster_handoff.md` ↔
`pupu-coo/handoff_protocol.md`)。注意它们是 **memory 双落盘, 不是 charter 双写** ——
全组织至今没有一对 charter 级双向边界 (架构师↔CTO 是唯一例外, 见下)。
选交付形式时要问: 这条约束在 agent **唤醒那一刻**是否需要可见? 需要 → 必须进 charter,
memory 正文只有主动读了才在。
