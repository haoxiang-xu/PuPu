# 法典 · Codex

> **已于 2026-08-21 完全退役。** 本目录仅保存历史制度与事故考古材料，不再是 PuPu 的生效规则。禁止用其中的 owner、Quorum、case、proposal、ruling、handoff 或庭审内容授权、阻断或组织新工作。当前规则只看根目录 `CLAUDE.md`、`AGENTS.md`、`.claude/CLAUDE.md` 和对应 Release skill。

> **quorum** — 议事有效所需的最少出席者；在分布式系统中，则是达成决议所需的最小节点集。
> 两个含义在此合一：[本文的传唤机制](lifecycle/summons.md)，管的正是"该到的人到齐了没有"。

本目录是 PuPu 已退役的 Quorum 法典历史副本。角色材料与案卷同样只读，不再参与当前工作流。

## 来源与版本

| 项 | 值 |
|---|---|
| 上游 | `https://github.com/haoxiang-xu/quorum.git` · `docs/quorum/` |
| 已提交迁入基线 | `ab40f4d` · 2026-08-10 |
| 当前同步状态 | 2026-08-12 冻结的上游未提交 working tree；source manifest `72e37a93…`，normative manifest `ba173463…`；commit pin 待上游提交后回填 |
| 本地历史副本 | `.claude/codex/` |
| PuPu 专有差异 | [`adaptations.md`](adaptations.md) |

上游曾是通用规范来源，本目录曾作为 PuPu 的生效版本；该关系已终止。后文的 Boundary Protocol、冻结工具与差异说明只解释历史状态，不构成当前要求。

## 推荐阅读顺序

1. [Constitution 宪法](constitution.md)
2. [Case Lifecycle 讨论生命周期](lifecycle/README.md)
   - [讨论模型与最小主 owner 原则](lifecycle/discussion-model.md)
   - [庭审发言协议](lifecycle/speech-protocol.md)
   - [收敛与裁定控制](lifecycle/decision-controls.md)
   - [边界契约与状态序列](lifecycle/boundary-contracts.md)
   - [证据规则](lifecycle/evidence-rules.md)
   - [Debate 辩论庭](lifecycle/debate-court.md)
   - [Full 众议庭](lifecycle/full-court.md)
   - [交棒、参与与传唤](lifecycle/summons.md)
   - [延伸与 Side Case](lifecycle/side-cases.md)
3. [Roles 角色](roles/README.md)
   - [`Chief Judge`](roles/chief-judge.md)
   - [`Procedural Judge`](roles/procedural-judge.md)
   - [`Witness`](roles/witness.md)

   - [`Code Owner`](roles/code-owner.md)
   - [`Task Owner`](roles/task-owner.md)
   - [`POV Owner`](roles/pov-owner.md)
   - [`Knowledge Owner`](roles/knowledge-owner.md)
   - [`Dimension Owner`](roles/dimension-owner.md)
   - [`Expert`](roles/expert.md)

   - [`Codex`](roles/codex.md)
   - [`Speaker of the House`](roles/speaker-of-the-house.md)
   - [`Evidence Examiner`](roles/evidence-examiner.md)
   - [`Acceptance Inspector`](roles/acceptance-inspector.md)
4. [Court Records 协作与庭审档案](court-records/README.md)
   - [目录布局](court-records/layout.md)
   - [Canonical source](court-records/canonical-sources.md)
   - [`case.md` 格式](court-records/case-format.md)
   - [编号与交叉引用](court-records/identifiers.md)
   - [固定模板](court-records/templates.md)
5. [Department 部门](department.md)
6. [Archive 数据总库](archive.md)

议案 (`motion`) 与方案 (`proposal`) 是独立讨论类别；协作、Debate 与 Full（众议庭）是分歧程序强度。新 case 一律从一个主 owner 和 `collaboration` 开始，不预选 Track 或 roster。

## PuPu 专有条文

- [`adaptations.md`](adaptations.md) —— 因地制宜台账与上游同步记录
- [`hybrid-execution-policy.md`](hybrid-execution-policy.md) —— Claude/Codex 混合执行政策
- [`release-skill-mapping.md`](release-skill-mapping.md) —— release-* skill 套件的角色映射：谁的边界被触及、各自止步之处
- [`precedents/`](precedents/) —— 判例库
- [`lifecycle/tracks.md`](lifecycle/tracks.md) —— 旧 Track 案卷的只读兼容说明，不具现行效力
- [`lifecycle/quorum.md`](lifecycle/quorum.md) —— 旧 roster 案卷与调度故障的只读兼容说明，不具现行增员效力

## 角色定义与角色 instance

本目录的 `roles/` 说明角色模板；`.claude/agents/<department>/<instance>.md` 说明 PuPu 中的具体 instance、所有权边界和本地职责。

修改法典、角色 instance、skill、所有权或组织结构都属于真实 action：可先用 motion 判断是否应改，但实际修改必须由获准 proposal 授权。历史 `.claude/court/**` 始终 append-only，不因法典同步回写。
