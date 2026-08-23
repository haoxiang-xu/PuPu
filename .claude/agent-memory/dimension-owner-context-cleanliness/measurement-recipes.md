---
name: measurement-recipes
description: 已复现验证的两条测量路径 — co-change 内聚配方(复现了 backend 73-87% 判例)与 per-call 载荷分解常量(样板恒为 2027 词, architect 127 词是反例)
metadata:
  type: project
---

# 验证过的测量路径（2 次以上复现）

## 1. co-change 内聚配方 — 单位必须是 P(rest|X)

**别用 jaccard 报数**：判例"backend 内聚 73–87%"是**条件同 commit 率** `P(该 dev 其余文件 | X)`，不是 jaccard。用 jaccard 复述会把同一份数据报成 27–36%，看起来像有缝，实际没有。

配方：`git log --since=<date> --pretty=format:@@%H --name-only` → 按 commit 聚合文件集 → 对该 dev **charter 声明的**每个子目录 X 求 `|X∩rest| / |X|`。

- **复现验证 (2026-08-04)**：对 `unchain_runtime/server/` 四桶重算得 78.9 / 59.0 / 76.9 / 91.3%，落在判例 73–87% 带内 ⇒ 配方与判例同尺，可直接援引比较。
- 判读：`<20%` = 缝（第二人门槛）；`>=60%` = 热路径，沿此轴切必载两份 context。
- **必查样本量**：n<10 的桶不作数（`diff/` P=0.0% 但 n=4；`chat-header` n=2 → P=100%，两个方向都是噪声）。
- **必查窗口稳定性**：跑 12 个月与 3 个月两窗，只有两窗同号的缝才算缝。

## 2. per-call 载荷分解 — 三项，其中一项是硬常量

`per-call = 净 role content + memory 样板 + MEMORY.md 索引`

- **样板恒为 2027 词**，6 个 dev charter 逐一实测完全相同（切点 = `# Persistent Agent Memory` 行）。
- **architect 是反例：127 词的自定义 memory 指针**（`.claude/agents/cto/pupu-architect.md` 第 56 行起），功能等价。⇒ **2027 不是平台强制的，是可删项**；任何"样板动不了"的论证已被这个反例证伪。
- 实测底：dev ≈ 2883 词（733 role + 2027 样板 + 123 索引）；cto = 3873；architect = 1498。
- MEMORY.md 索引才是常驻项，memory 目录体积不进账（见 [[founding-methods]]）。

## 3. 多参与者流程的记账法（founding-methods 未覆盖，2026-08-04 新增）

流程提案（议会/会签/多方评审）的成本单位 **不是编制而是每次调用**：
`Σ(参与者 × per-call 底 + 参与者 × 提案包) × 轮次`

- 关键非直觉项：**2027 词样板被参与者数乘**。单份 charter 里它占 72% 但判例 S4 说"不是问题"；7 人一轮它是 52%、11 次调用 22,297 词，成为全流程最大单项。**"样板不是问题"这个判断只在单人派发下成立，不可外推到流程提案。**
- 提案包实测锚点：本法庭自身材料 = 1052 词；architect 真实设计产物 261–1212 词。
