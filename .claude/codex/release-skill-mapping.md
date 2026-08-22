# Release Skill 套件 · 角色映射

> 法典条文（程序性）。[法典索引](README.md) · 收录理由与本仓适配见 [`adaptations.md` A-013](adaptations.md#a-013--release-skill-套件收入法典映射)。

`.claude/skills/release-*`（`open-sprint` / `draft-ticket` / `refine-ticket` / `close-sprint` / `feature-audit`）是书记员在 GitHub Project 驱动的 release 生命周期上使用的操作工具。本版本的唯一操作记录是一个 `Size=Release` 父 issue 及其直接 sub-issues；本套件不持有裁决权。本条映射它们各自触及哪些角色的权限边界、在何处止步。

## 定位：scope 直令 + 实施正文授权，非独立裁决

Release scope、Project metadata、版本基调、遗留票处置与 GO/NO-GO 等决定，都由 `chief-judge`（project owner）直接触发或口述；skill 只做机械落地（建票、打标签、建立父子关系、更新 Project 字段、记录 issue comment、跑脚本）与如实报告，不代 project owner 做取舍。

但 direct Release child 的**正文**有一项窄的常驻授权：当前实际负责实现该 ticket 的 code owner / agent，可在不改变既定用户结果或 release scope 的前提下，直接把 draft body 细化为可执行说明。它无需另派 refine agent、无需逐次请求 project owner 确认，也不以 GitHub assignee 为资格依据；审阅、研究、audit 参与本身不取得这项授权。

这与 A-009 的既有豁免逻辑一致：`.claude/skills/**` 由书记员依裁定写入无需常驻 owner；同理，**在 project owner 直接口述范围内的 Release scope 规划与 GitHub Project 留痕，以及已授权实施者对既有 direct child 的不扩容正文细化，本身不构成需要独立 `proposal` 的"真实 action"**。此前 `create-issue` skill 已确立同一先例（project owner 直接确认后建公开 issue，不经 case）；本条把该先例明文写入法典，覆盖范围扩至整个 release-* 套件。

**边界**：这条豁免不覆盖实质 scope 判断。凡 skill 或实施者需要改变用户结果、必交付能力、Release membership、title、labels、Size、Status、Iteration、assignee、父子关系、延期/取消或关闭时，仍须走 project owner 的裁决路径——见下表。

## 逐 skill 映射

| Skill | 触及的角色/边界 | 明确止步之处 |
|---|---|---|
| `release-open-sprint` | 无常设 owner；`growth-analyst`/`topic-optimizer` 数据仅供 `chief-judge` 参考 | 不得把 roadmap memory 自动导入范围（`chief-judge` 未在场决定 = 不算数） |
| `release-draft-ticket` | 无；开票只记录 project owner 给出的初始方向 | 不验证可行性、不判断范围；后续实施 owner 可在既定范围内细化该 body |
| `release-refine-ticket` | 实施 owner 可把它作为可选的深度调查与零上下文 brief 方法 | 不是实施前门禁；调查推翻草稿范围时，止步于报告选项，范围取舍权仍在 project owner |
| `release-close-sprint` | **`task-owner-release-certification`**（旧代号「检」）—— 该角色持有的是版本 GO/NO-GO 发布裁决权 | close-sprint **不是**该角色的替代品：它只能核验直接 sub-issues、audit/waiver 与结构化认证记录；没有 project owner/COO 的 `GO` 或获准 `EXCEPTION`，不得关闭 Release issue 或标为 Done |
| `release-feature-audit` | 各 `code-owner-*` 对自身边界的验收权 | 五项检查全部 report-first：违规列出 file:line 与建议修法，取舍权仍归实施者/`chief-judge`；本 skill 不构成对 code-owner 验收结论的推翻或替代 |

## 与混合执行政策的关系

Release skill 套件与 [`hybrid-execution-policy.md`](hybrid-execution-policy.md) 正交：前者管"GitHub Project 中的 release 生命周期记录与执行媒介"，后者管"谁可以把写码委派给 Codex"。`release-feature-audit` 检查的对象（各 code owner 的产出）可能来自任一 hybrid 模式，本条不改变、不复述该政策。

## 何时这套映射需要重新裁定

- 任一 skill 从"记录 project owner 已口述的决定"扩展为"自主拍板"（例如自动裁定遗留票去向、自动判定发布能否放行）——这是权限扩张，须由 `proposal` 授权，不得在 skill 文档里悄悄加一句就生效。
- `task-owner-release-certification` 的边界发生变化，导致 close-sprint 与它的分工线需要重画。
- 新增 release-* skill，或既有 skill 被赋予新的、此前未映射到某角色边界的检查项。
