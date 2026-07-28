---
name: methods
description: PuPu HR 考评官的多信号取证方法论 — 四信号路径 + 裁撤双证 + 新角色/休眠误判防护
metadata:
  type: project
---

**取证方法论。每次考评前读这份, 之后把验证有效 2+ 次的新路径补进来。**

## 信号 1 — 记忆生长 + git 历史（回溯·零成本·现可用）

- 扫 `.claude/agent-memory/<agent>/`: 文件数、总大小、`git log -1 --format=%cr -- <path>` 看最后改动时间。
- 判读: **从不生长 + 久未触碰 = 死重嫌疑**（仅嫌疑, 非定论）。
- 命令示例: `for d in .claude/agent-memory/*/; do echo "$d $(du -sh "$d" | cut -f1) $(git log -1 --format=%cr -- "$d" 2>/dev/null)"; done`
- **陷阱:** 刚成立的角色（HR、security-expert）和休眠能力天然没记忆生长, 不等于死重 — 必须用信号 2/3 校验。

## 信号 2 — CEO 口供（ground truth·现可用）

- 直接问 CEO: 这个 agent 近期用过吗? 帮上忙没? 还是摆设? 想留还是想裁?
- 这是最高权重信号。CEO 说"还要用"就不能裁, 无论其它信号多难看（可能是好角色暂未被调用）。

## 信号 3 — 职责重叠分析（结构性·现可用）

- 读各 agent `.md` 的 description/scope, 画 scope 边界图, 找: 谁被谁完全盖住、谁的职责为空、handoff 是否绕路。
- PuPu 已有清晰边界约定可对照: 智管"模型调得好不好" vs 守管"内容能否诱导恶意调用"; 策管商店条目数据 vs 守定 vetting 标准; 验验 plumbing vs 智诊断模型行为。重叠或边界模糊处 = 协作低效嫌疑。
- 也看汇报线是否绕路: 某角色每次都要经 3 跳才能完成一次协作, 是结构低效信号。

## 信号 4 — 活动日志（前瞻·机制本期未建）

- PuPu 暂无 SubagentStop hook 自动记 `时间│subagent_type`。**现阶段此信号为空, 靠前三信号运作。** 未来若建了 hook, 在此补取证路径。

## 信号 3b — 交接协议对照法（2026-07-28 验证有效，强证据）

判"两个角色是否真重叠"时，**不要只读两份 charter 的自我声明**（自我声明必然说"我们边界清晰"）。去读**第三方 agent 的 memory 里写的交接协议** — 那是协作实际发生时沉淀的，比 charter 的宣称更可信。

- 路径: `grep -rl "<agent-A>" .claude/agent-memory/` → 看 **别人**怎么描述 A 与 B 的分工。
- 判读: 若第三方 memory 已独立写出 A/B 的分工条款（且与 charter 一致）→ 边界是**真实生效**的，不是纸面。若无人提及 → 边界只是纸面宣称，重叠嫌疑成立。
- 2026-07-28 实例: qa-tester 的 `team_roster_handoff.md` 队友 A2 段独立写明"归我 feature-level / 归检 固定 protocol"，且 COO 的 `handoff_protocol.md` 同步写明 — 双向落盘，证明 验/检 边界真实。

## 信号 3c — 记忆考古法判"职责是被切出去的还是新增的"（2026-07-28 验证有效）

当新角色 X 上线、怀疑它是从老角色 Y 身上切肉时: 看 **Y 的 memory 里有没有 X 职责的历史沉淀**。有 = 切出去的（Y 真干过），没有 = 新增能力。

- 命令: `git log --format="%ad|%s" --date=short --name-only -- .claude/agent-memory/<Y>/`
- 判读: Y 的旧 memory 若密集记录 X 的工作面知识（且日期早于 X 上线）→ 证明是**减负式拆分**，且 Y 的这些 memory 成为 X 的启动资产（不是浪费）。
- 2026-07-28 实例: COO memory 有 5 条 release 工程记忆（release-version-bump / unchain-editable-coupling / electron-test-glob / react-router-jest / license-bundling），最早 2026-06-14，远早于检 2026-07-24 上线 → 检确系从 COO 切出，且 COO **未被掏空**（业务操盘授权 2026-07-21 同期注入新职责）。

## 信号 1b — memory 停滞 vs 代码面活跃的错位检测（2026-07-28 加强）

单看 memory 停滞不够。要**并排**看该 agent **charter 声明拥有的代码路径**在同期有没有 commit:
- `git log --since=<memory最后日期> --format="%ad|%s" --date=short -- <owned-path>`
- **错位 = 嫌疑加重**: memory 冻结但 owned 路径有 commit → 说明活是别人干的，或该 agent 被调用了却没沉淀。
- **同步冷却 = 嫌疑减轻**: memory 冻结且 owned 路径也无 commit → 只是该工作面本期没需求，不是死重。

## 裁撤双证（不可违背）

任何"该裁"结论 = **2+ 独立信号互证 + CEO 口供不反对**。单信号只产"嫌疑"。
- 例: 信号1（零生长）+ 信号3（scope 被完全覆盖）+ 信号2（CEO 说没用过）→ 可建议裁。
- 例: 仅信号1（零生长）→ 只能报嫌疑, 因为可能是新角色或好角色未被调用。

## 新角色 / 休眠误判防护（PuPu 特有）

考评前先在 `pupu-hr-head/org-chart.md` 的"组织变更史"核对每个 agent 的上线日期。**上线 < 2 周或标注休眠的角色, 一律不进裁撤候选**, 只记"观察期", 给出"何时复评"的时间点。
