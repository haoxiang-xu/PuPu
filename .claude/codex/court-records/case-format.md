# `case.md` 格式

[Quorum 索引](../README.md) · [Court Records](README.md)

```markdown
---
case_id: 0000-0001-2026-0806
title: 示例议案
track: debate
status: awaiting-evidence-direction
phase: debate
stage_instance_id: SI-002
acceptance_series_id: null
lead_owner: code-owner-example
parent_case_id: null
relation: null
blocking_case_id: null
created_at: 2026-08-06T18:00:00-07:00
updated_at: 2026-08-06T19:20:00-07:00
---

# 示例议案

## 目标与范围
- **目标结果**: ...
- **write_set**: ...
- **contract_set**: ...
- **non_goals**: ...
- **当前范围授权**: INTAKE@2026-08-06T18:00:00-07:00

## 待裁问题
- Q-001 | ...
- Q-002 | ...

## 当前收敛控制
- **阻塞清单**: BOS-001 | frozen | S-0018

## 初始参与批准（不可改写）
- **初始批准**: Chief Judge | 2026-08-06T18:00:00-07:00 | intake-sha256:...
- `speaker-of-the-house` | Speaker of the House | 主持、相关性路由、归档 | case 全部规范档案 | `INTAKE@2026-08-06T18:00:00-07:00`
- `code-owner-example` | Code Owner | 主 owner、集成方案 | `src/example/**` | `INTAKE@2026-08-06T18:00:00-07:00`
- `evidence-examiner-0000-0001-2026-0806-01` | Evidence Examiner | 首批 16% 随机抽查与置信度报告 | 仅本案经 Chief Judge 明示授权 SI 中冻结 DES 的抽中 DU | `INTAKE@2026-08-06T18:00:00-07:00`
- `acceptance-inspector` | Acceptance Inspector | 实施后验收 | 获准方案与验收对象 | `INTAKE@2026-08-06T18:00:00-07:00`

## 当前 roster
- `speaker-of-the-house` | Speaker of the House | 主持、相关性路由、归档 | case 全部规范档案 | `INTAKE@2026-08-06T18:00:00-07:00`
- `code-owner-example` | Code Owner | 主 owner、集成方案 | `src/example/**` | `INTAKE@2026-08-06T18:00:00-07:00`
- `evidence-examiner-0000-0001-2026-0806-01` | Evidence Examiner | 首批 16% 随机抽查与置信度报告 | 仅本案经 Chief Judge 明示授权 SI 中冻结 DES 的抽中 DU | `INTAKE@2026-08-06T18:00:00-07:00`
- `acceptance-inspector` | Acceptance Inspector | 实施后验收 | 获准方案与验收对象 | `INTAKE@2026-08-06T18:00:00-07:00`

## 待批参与请求
- RP-001 | ADD | `expert-example` | Expert | NOT_APPLICABLE | Q-002 | 现有 roster 无该专业判断 | 缺席将使 Q-002 保持未知 | 仅读取 Q-002 相关档案 | NOT_APPLICABLE | pending

## 当前证据控制
- **决策证据集**: DES-001
- **sampling scope**: SI-002
- **初始抽样处置**: FIRST_RANDOM_REQUIRED
- **active revision cycle**: null
- **最新置信度报告**: CR-001
- **Chief Judge 当前指令**: PENDING

## 已知缺口
- 无

## 文件索引
- [发言记录](record.md)
- [证据台账](evidence.md)
- [方案](proposal.md)
- [范围外清单](parking-lot.md)
```

- `track` 只允许 `fast`、`express`、`debate`、`full`
- `status` 只允许 `filed`、`awaiting-participant-approval`、`hearing`、`awaiting-witness`、`awaiting-evidence-direction`、`awaiting-ruling`、`awaiting-blocking-side-case`、`implementing`、`acceptance`、`reconsideration`、`closed`、`terminated`
- `phase` 只允许 `intake`、`motion`、`proposal`、`combined`、`debate`、`implementation`、`acceptance`、`reconsideration`；所有 Track 可从 `intake` 开始，`combined` 只用于 Express，`debate` 只用于 Debate
- `stage_instance_id` 使用 case 内 `SI-###`。只有获准的 lifecycle phase 转换可创建新 SI；同一 phase 内的 `EVIDENCE_DIRECTION: RETURN_FOR_REVISION`、同一争点重分类与 successor DES 沿用当前 SI。`RECONSIDERATION_RULING`、`ACCEPTANCE_REVISION` 或其他获准 phase transition 必须点名新 SI。每个新 `AT-###` 对应新的 acceptance SI，且该 SI 必须已由实施裁定条件授权或后继阶段裁定明示授权；新 SI 不改变 sampling scope 或首批状态
- `acceptance_series_id` 在 action 尚未获准时为 `null`；批准 implementation 的实体裁定分配一个 `AS-###`，同一 action 的全部后继 AT、acceptance SI 与复议始终沿用，不得借新 AT 重置 BOS 或自动首批抽样资格
- `lead_owner` 使用 role instance 正式名称；不适用时为 `null`
- `relation` 只允许 `blocking`、`non-blocking` 或 `null`
- `blocking_case_id` 只在 `awaiting-blocking-side-case` 时非空，指向唯一获准 blocking child
- `Q-###` 在一个 case 内唯一，编号一经分配不复用
- **当前收敛控制** 只保存 effective `BOS-###` 指针与状态；首次 BOS 尚未冻结时写 `null`。BOS/BO 正文及状态历史在 `record.md`。同一争点重框只有在 standalone `REFRAME_RULING` 或带 `ATOMIC_REFRAME` 的 `SCOPE_RULING / TRACK_RULING / RECLASSIFY` 原子生效后才更新指针，行末引用该 `R-####`；旧 BOS 与旧指针历史均保留
- `write_set` 只列候选 action 会直接写入的对象；只读证据来源不得放入
- `contract_set` 只列候选 action 会改变的契约；背景提及不得放入
- **初始参与批准** 是不可改写的历史块；**当前 roster** 是当前状态的 canonical source。后续 `ADD / REMOVE / CHANGE_SCOPE / CHANGE_DELIVERY / WAIVE_DELIVERY` 均引用 `PARTICIPATION_RULING` 更新当前 roster，不改写初始块。每一行依次记录 agent instance、角色、具体交付、可访问范围与最新批准来源
- 候选、自请、推荐或现有 roster 变更在 `Chief Judge` 批准前只进入 **待批参与请求**；每项使用 `RP-###`，依次记录请求动作、agent instance、角色、原批准来源、目标决定/交付、理由或独有信息、缺席/变更影响、建议访问范围、重提依据与状态。`ADD` 的原批准来源为 `NOT_APPLICABLE`，其余动作引用当前 `INTAKE@...` 或 `R-####`。初次请求的重提依据为 `NOT_APPLICABLE`；重提必须引用旧 RP、拒绝 R 与直接推翻 `rejection_predicate` 的同 target/覆盖角色状态变化
- **当前证据控制** 只保存最新指针、`sampling scope` 与 `active revision cycle`；action 获准前 scope 为当前 SI，批准 action 后从 implementation 起始终为其 AS。没有返修周期时 cycle 为 `null`；RETURN/REAUTHORIZE 后写其 `R-#### | PENDING_VERIFICATION`，rank 严格下降或终局处置后清空。重框与重分类必须沿 atom lineage 继承 active cycle。`DES-###` 与 `CR-###` 正文在 `evidence.md`，续查指令正文在 `ruling.md`
- **Chief Judge 当前指令** 在尚未裁定时写 `PENDING`；裁定后写 `R-#### | <direction>`
- `filed → awaiting-participant-approval` 只在初始批准尚未完成，或 `Chief Judge` 把某个 `RP-###` 明示为 blocking 时发生；请求获批或被拒后返回原阶段
- 最新 `CR-###` 归档，或非空 DES 的 **初始抽样处置** 为 `AWAITING_CHIEF_DIRECTION` 时进入 `awaiting-evidence-direction`。返修 successor 尚无新 CR 时，依据写为 `successor DES + RETURN R + predecessor CR`；没有 predecessor CR 时显式写 `CR = NOT_APPLICABLE`，不得制造空报告。Chief 可对 current effective DES 签发 `NEXT_RANDOM_16 / TARGETED_CHECK / RULE_NOW`；active cycle 的 atom lineage rank 未下降前不得再次 RETURN，重框或重分类不清除该 cycle。`RULE_NOW` 或实体裁定结束证据等待，`NEXT_RANDOM_16 / TARGETED_CHECK / RETURN_FOR_REVISION` 返回相应 hearing，`RECLASSIFY` 进入新 track 的适用阶段。验收由 `ACCEPTANCE_RULING` 结束证据等待：`PASSED` 在 BOS 状态事件完成后关闭，`FAILED_TO_HEARING` 保留 OPEN BO 并进入验收庭审
- `EMPTY / INHERITED_ONLY` 的 SUMMARY 进入 `awaiting-ruling`；后者必须引用全部继承 DU 的原 CR 历史，既不创建 Examiner/新 CR，也不消耗尚未使用的首批资格。通常可直接实体裁定、用 `RETURN_FOR_REVISION` 恢复当前 atom lineage，或 `RECLASSIFY`。active cycle 若仍为等-rank `PENDING_VERIFICATION`，不得再次 RETURN，只能裁定、回滚、终止、拆案，或作继承 cycle 的重分类/合规重框；裸改档也不得清空返修债务。`EMPTY` 不得签发随机/定向核验；`INHERITED_ONLY` 后续若出现新 `RANDOM_ELIGIBLE` DU，未消费的 scope 资格仍可执行唯一首批
- `RECONSIDERATION_RULING: REAUTHORIZE_REVISION` 依 Track 进入受限返修：Fast 与方案不变的 Express/Debate 可在 `CARRY_OPEN_TO_IMPLEMENTATION` 状态事件后进入 `implementing`；Express/Debate 的方案变化分别以 `KEEP_OPEN_FOR_REVISION_HEARING` 原子进入 `hearing + combined/debate`；Full 始终以同一处置原子进入 `hearing + proposal`。后两类受限方案 visit 获批时使用 `裁定模式 = ACCEPTANCE_REVISION`，在 carry-open 状态事件后进入新的 implementation SI；驳回时使用 `KEEP_OPEN_AWAITING_RULING`，保留验收失败、AS/BOS/effective DES/active cycle 并回 `awaiting-ruling`。所有路径均不得新建 AS/BOS 或清除返修周期
- blocking side case 获准时进入 `awaiting-blocking-side-case`；child 为 `closed` 或 `terminated` 后仍须由 `SIDE_CASE_RULING` 明示恢复或终止 parent，不自动迁移
- 所有时间使用带 UTC offset 的 ISO 8601；编号中的日期仍使用编号责任规定的归档日期格式
