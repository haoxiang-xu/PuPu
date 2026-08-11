# 法典 · Codex

本目录是 PuPu 当前生效的 Quorum 法典副本，归 [`codex`](roles/codex.md) 维护。具体角色 instance 位于 `.claude/agents/`；历史案卷位于 `.claude/court/`。

## 来源与版本

| 项 | 值 |
|---|---|
| 上游 | `https://github.com/haoxiang-xu/quorum.git` · `docs/quorum/` |
| 迁入版本 | `ab40f4d` · 2026-08-10 |
| 本地生效副本 | `.claude/codex/` |
| PuPu 专有差异 | [`adaptations.md`](adaptations.md) |

上游是通用规范来源，本目录是 PuPu 的生效版本。同步不得覆盖 `.claude` 路径适配、混合执行政策、判例或历史兼容页；所有本仓偏离都必须在 `adaptations.md` 说明。

## 推荐阅读顺序

1. [Constitution 宪法](constitution.md)
2. [Case Lifecycle 讨论生命周期](lifecycle/README.md)
   - [讨论模型与最小主 owner 原则](lifecycle/discussion-model.md)
   - [交棒、参与与传唤](lifecycle/summons.md)
   - [Debate 辩论庭](lifecycle/debate-court.md)
   - [Full 众议庭](lifecycle/full-court.md)
   - [庭审发言协议](lifecycle/speech-protocol.md)
   - [收敛与裁定控制](lifecycle/decision-controls.md)
   - [证据规则](lifecycle/evidence-rules.md)
   - [延伸与 Side Case](lifecycle/side-cases.md)
3. [Roles 角色](roles/README.md)
4. [Court Records 协作与庭审档案](court-records/README.md)
5. [Department 部门](department.md)
6. [Archive 数据总库](archive.md)

议案 (`motion`) 与方案 (`proposal`) 是独立讨论类别；协作、Debate 与 Full（众议庭）是分歧程序强度。新 case 一律从一个主 owner 和 `collaboration` 开始，不预选 Track 或 roster。

## PuPu 专有条文

- [`adaptations.md`](adaptations.md) —— 因地制宜台账与上游同步记录
- [`hybrid-execution-policy.md`](hybrid-execution-policy.md) —— Claude/Codex 混合执行政策
- [`precedents/`](precedents/) —— 判例库
- [`lifecycle/tracks.md`](lifecycle/tracks.md) —— 旧 Track 案卷的只读兼容说明，不具现行效力
- [`lifecycle/quorum.md`](lifecycle/quorum.md) —— 旧 roster 案卷与调度故障的只读兼容说明，不具现行增员效力

## 角色定义与角色 instance

本目录的 `roles/` 说明角色模板；`.claude/agents/<department>/<instance>.md` 说明 PuPu 中的具体 instance、所有权边界和本地职责。

修改法典、角色 instance、skill、所有权或组织结构都属于真实 action：可先用 motion 判断是否应改，但实际修改必须由获准 proposal 授权。历史 `.claude/court/**` 始终 append-only，不因法典同步回写。
