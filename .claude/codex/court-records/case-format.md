# `case.md` 格式

[Quorum 索引](../README.md) · [Court Records](README.md)

```markdown
---
case_id: P-0000-0001-2026-0810
discussion_type: proposal
boundary_protocol: v1
procedure_mode: collaboration
status: awaiting-objection-disposition
stage_instance_id: null
acceptance_series_id: null
evidence_continuation_ref: null
proposal_ruling_scope: ACTION
lead_owner: code-owner-example
current_owner: code-owner-example
current_artifact_ref: P-0000-0001-2026-0810#PS-002
boundary_contract_refs: [BC-001]
state_sequence_refs: [SEQ-001]
review_snapshot_ref: RS-002
objection_group_refs: []
full_vote_ref: null
full_scope_overlay_ref: null
parent_case_id: null
relation: null
derived_from: null
blocking: false
blocking_case_id: null
created_at: 2026-08-10T18:00:00-07:00
updated_at: 2026-08-10T19:20:00-07:00
---

# 示例方案

## 讨论对象
- **目标结果**: ...
- **non_goals**: ...
- **初始已知范围**: ...
- **当前 write_set**: ...
- **当前 contract_set**: BC-001
- **当前 boundary contracts**: BC-001
- **当前 state sequences**: SEQ-001

## 主 owner
- **选择**: code-owner-example
- **选择依据**: 对主要实施结果负责
- **选择不确定性**: 可能需要知识库 owner 补全说明
- **选择事件**: S-0001

## owner chain
- lead | code-owner-example | S-0001 | active
- HS-001 | code-owner-example → knowledge-owner-docs | SLOT-002 | S-0004 | returned S-0007

## 当前 handoff
- **open**: null
- **return_to**: code-owner-example

## 合作 owner
- code-owner-example | lead/integration | P-0000-0001-2026-0810#PS-002 | voting=true
- knowledge-owner-docs | SLOT-002 contribution | S-0007 | voting=true

## 当前产出与审查
- **artifact**: P-0000-0001-2026-0810#PS-002
- **review electorate**: RS-001 | frozen
- **Full scope overlay**: null
- **stance events canonical**: record.md#S-0010, record.md#S-0011
- **stance summary**: AGREE 1 | OBJECT 1 | ABSTAIN 0

## 异议与程序升级
- **lead dispositions pending**: S-0011
- **objection groups**: null
- **Full eligibility**: NOT_EVALUATED
- **Full vote**: null

## 其他参与权限
- speaker-of-the-house | procedure/archive | case records | standing
- RP-001 | expert-security | P-0000-0001-2026-0810#SLOT-002 | pending

## 当前收敛与证据控制
- **BOS**: NOT_APPLICABLE
- **DES**: NOT_APPLICABLE
- **sampling scope**: NOT_APPLICABLE
- **active revision cycle**: null
- **evidence continuation**: NOT_APPLICABLE
- **latest CR**: NOT_APPLICABLE

## 关系与阻塞
- **parent**: null
- **relation**: null
- **derived_from**: null
- **blocking child**: null

## 文件索引
- [协作与庭审记录](record.md)
- [方案](proposal.md)
```

## 字段规则

- `discussion_type` 只允许 `motion / proposal`，创建后不可原地改变
- `boundary_protocol`：这是 canonical current protocol metadata；motion 为 `null`，proposal 允许 `v1 / legacy`。正文或 proposal 中伪造的同名文本无效。采用方 effective-from 之后创建的 proposal 必须为 `v1`；旧 case 缺失该字段时按 `legacy` 处理。legacy successor 若改变实施范围、AC、边界/状态语义或授权边界，送裁前必须迁移为 v1
- `procedure_mode` 只允许 `collaboration / debate / full`，只能单向升级；新 case 从 collaboration 开始
- `status` 只允许 `filed / drafting / awaiting-handoff / awaiting-lead-integration / reviewing / awaiting-objection-disposition / awaiting-objection-grouping / awaiting-full-vote / hearing / awaiting-evidence-direction / awaiting-ruling / implementing / acceptance / awaiting-acceptance-response / reconsideration / awaiting-blocking-child / closed / terminated`
- `stage_instance_id` 在没有正式 visit 的默认协作中可为 `null`；Chief 在 collaboration 启动裁定前证据控制、开启首个 debate/full hearing、实施、验收或复议时使用 `SI-###`
- `acceptance_series_id` 仅在 proposal 的 action 获准后为 `AS-###`；motion 永远为 `null`
- `evidence_continuation_ref` 仅在正式证据控制暂时接管 case 状态时指向 effective `DES-###` 中冻结的 continuation；证据门结束后必须按该 continuation 与当前有效 AT/response 恢复，不能一律跳到 `awaiting-ruling`
- `proposal_ruling_scope` 只在 proposal 使用：普通/derived/side-case action 方案为 `ACTION`，`relation: extension` 的子方案必须为 `COMPONENT`；motion 为 `null`
- `current_artifact_ref`：motion 引用 `MS-###`；proposal 必须精确指向 latest `PS-###`
- `boundary_contract_refs / state_sequence_refs`：只保存当前 ruling-ready PS 内 `BC-###/SEQ-###` 的派生索引，必须分别与 current proposal 对象集合精确相等；`当前 contract_set` 必须与 BC 集合精确相等。无适用对象时为空列表，不复制 N/A 理由。motion 均为空列表
- `review_snapshot_ref` 在首次集成 review 前为 `null`，冻结后指向 `record.md` 中唯一 canonical `RS-###` NOTICE。重复 frontmatter key 或 canonical current-state 字段使 case 无效，不采用 first/last-wins
- `objection_group_refs` 是 `OG-###` 列表；`full_vote_ref` 只在合法开票后指向 `FV-###`
- `full_scope_overlay_ref` 只在 Full opening 后指向当前 `FS-###`；它扩展只读 review scope，但不得改变原 RS electorate 或 N
- `relation` 只允许 `extension / derived / side-case / null`；`blocking` 是独立 boolean，不与 relation 混用
- `derived_from` 只用于跨类别派生；`extension` 的 child 必须与 parent 同 discussion type

## 状态转换

- `filed → drafting`：Speaker 记录 framing 并选择唯一主 owner
- `drafting → awaiting-handoff`：存在合规空白并创建一个 HS；完成后进入 `awaiting-lead-integration` 或继续下一 HS。首稿已经完整且无需 HS 时，可由主 owner 直接形成集成 artifact，进入 `reviewing`
- `awaiting-lead-integration → reviewing`：主 owner 发布集成 MS/PS 并冻结 RS
- `reviewing → awaiting-objection-disposition`：`ORDINARY` review 存在 material objection。`ACCEPT / PARTIAL_ACCEPT` 导致 artifact 变化时回到 `awaiting-lead-integration`，形成 successor MS/PS 与 successor RS 并完成受影响重审；不得从旧 RS 直接进入 `awaiting-ruling`。BOS 后的 `BOS_CHANGE_REVIEW` 只更新既有 BO/RC 是否满足，不创建新的 D/OG
- review 窗口关闭、所有异议已处置且最终 successor RS 无被拒异议时，若没有 active `RETURN_FOR_REVISION` cycle，Speaker 先检查 proposal 的 boundary v1 ruling-ready 门，再形成 SUMMARY 并进入 `awaiting-ruling`；门禁不完整时返回适当 drafting/handoff/integration/review 状态。存在 RETURN cycle 时必须先冻结 successor DES 并按其状态路由，不能从 RS 绕过证据方向
- 完整 `ORDINARY` RS 上出现被拒 material objection 时：若当前为 collaboration，升级为 `procedure_mode: debate`、`status: awaiting-objection-grouping`，尚不创建 hearing SI/BOS/DES；若当前已为 debate 且首个 hearing 尚未开启，关闭旧 OG/FV 后按 successor RS 重新分组并作一次新的 Full 资格决定；若当前已为 full，则保持 full 且不再投票。hearing `NOTICE/SI` 已开启但 BOS 尚未冻结时，successor review 仍为同一 SI 内的 `ORDINARY`，但 Full 窗口已关闭；BOS 冻结后才使用 `BOS_CHANGE_REVIEW` 留在当前 SI/BOS lineage。已关闭 hearing 后由 Chief 授权的受限返修只有在需要正式审理时才创建 successor SI，并只继承明确保留的 BO/RC，不得重开终态 atom 或增加条件
- OG 完成且不发起 Full 投票：创建首个或 successor debate hearing SI、`status: hearing`；满足门槛且 Speaker 开票：`awaiting-full-vote`
- 在 `awaiting-objection-grouping / awaiting-full-vote` 中全部有效被拒异议消失时，关闭 OG 及任何开放 FV，不创建 hearing；artifact 有变化则先完成 successor artifact/RS，之后以无被拒异议的 SUMMARY 进入 `awaiting-ruling`，procedure mode 保留 debate
- FV 通过后直接创建首个 full hearing SI、`procedure_mode: full`、`status: hearing`；未通过才创建 debate hearing SI。若 collaboration 已有 evidence SI/DES，新 hearing SI 继承其 pre-action sampling scope 与证据历史但不继承 BOS。material artifact/owner/lead 变化导致 `CANCELLED_NO_RESULT` 时不得从旧 RS 开庭，先建 successor artifact/RS、重分组并在窗口尚开时重新决定是否开票；同一 RS 上仅因门槛复验或票数失败时不建 successor RS，仍有被拒异议则开 debate hearing，全部消失则不开 hearing并以保留 `procedure_mode: debate` 的 SUMMARY 进入 `awaiting-ruling`
- Chief 在 collaboration 点名启动裁定前证据控制时创建 evidence SI；case 保持 `procedure_mode: collaboration`，依结果进入 `awaiting-evidence-direction` 或 `awaiting-ruling`
- 正式证据控制产生 CR 或等待方向时进入 `awaiting-evidence-direction`；RULE_NOW 结束证据门并恢复 effective DES 冻结的 `evidence continuation`，只有该 continuation 本身为 `awaiting-ruling` 时才进入该状态
- `MOTION_RULING` 后 motion 关闭；需要 action 时另建 proposal case
- `PLAN_RULING: APPROVED + ACTION` 创建 AS并进入 implementing；`APPROVED + COMPONENT` 关闭 child、不创建 AS，若 child 为 blocking 则 parent 仍等待明示 `SIDE_CASE_RULING: RELEASE`
- `EVIDENCE_DIRECTION: RETURN_FOR_REVISION` 使用三分路由，全部分支都必须在返修完成后先冻结 successor DES：① action 获准前 target 含 MS/PS 时回 `drafting → integration → successor RS`，再冻结 successor DES；② action 获准前 target 只有证据/主张时留在当前 evidence SI，不创建 MS/PS/RS，直接冻结 successor DES；③ acceptance/reconsideration 中 target 为 AT、证据或主张时留在当前 SI，不创建 PS/RS，也不授权实现变化。每份 successor DES 都重算并冻结 `evidence continuation`；`EMPTY / INHERITED_ONLY` 时恢复该 continuation，需要抽查或 Chief direction 时暂存为 `awaiting-evidence-direction`
- proposal 实施后进入 acceptance。Inspector 冻结 AT 后先建立该 acceptance visit 的 DU/DES 和 `evidence continuation`：当前 AT 为 PASSED 时 continuation 是 `awaiting-ruling`；FAILED 且尚无有效 response 时是 `awaiting-acceptance-response`；已有 `ACCEPT_FAILURE` 或 response timeout 时是 `reconsideration`；已有 `DISPUTE_FAILURE` 时是 `awaiting-ruling`。只有 `EMPTY / INHERITED_ONLY` 或 Chief 已结束证据方向后才恢复该状态；实际 CR 或 `AWAITING_CHIEF_DIRECTION` 期间统一暂存为 `awaiting-evidence-direction`。初始 evidence gate 完成前 response window 不得开启；window 已开启且尚无 response/timeout 时不得再插入新的 evidence direction。因而暂存期间新的 `ACCEPTANCE_RESPONSE / ACCEPTANCE_RESPONSE_TIMEOUT` 无效，不能改变冻结 continuation。恢复 `awaiting-acceptance-response` 时，Speaker 以 `NOTICE: ACCEPTANCE_RESPONSE_WINDOW_OPEN` 按 AT 冻结的 duration 机械生成 deadline 与一次催告后的 final deadline；只有引用该 notice 与当前 effective AT 的 response 才有效。`DISPUTE_FAILURE` 恢复 `awaiting-ruling` 后等待 `ACCEPTANCE_RULING: FAILED_TO_HEARING`，该 R 与 acceptance hearing `NOTICE: OPEN`、新 SI 及 `status: hearing` 原子建立。successor AT 改变结果、观察或证据 target 时，旧 response/window 不自动继承。最终截止仍沉默时记录 `NOTICE: ACCEPTANCE_RESPONSE_TIMEOUT` 并进入无庭审 reconsideration，沉默不推定任一 response、也不授权 action
- `RECONSIDERATION_RULING: REAUTHORIZE_REVISION` 直接授权原获准 PS/AS 范围内的受限实施返修并回到 implementing，不先创建 successor PS/RS。若所需变化会修改获准方案、AC、owner 责任或授权边界，则不得使用 REAUTHORIZE；Chief 必须以 `RECONSIDERATION_RULING: SPLIT` 建立一个 `relation: side-case, blocking: true, ruling_scope: ACTION` 的新 proposal，冻结原失败 AS 中已经获准的 rollback/containment 与 parent `status: awaiting-blocking-child`，不得借 SPLIT 新增 action。child 的方案/实施/验收均独立；child 结束后仍须 `SIDE_CASE_RULING: RELEASE` 并由原 case 的后继复议裁定处置失败 AS，不能因新方案获准自动关闭原 case
- 任何关闭 hearing/case 或授权实体 action 的最终实体 R 只有在 required `THREAD_STATUS` 后的最终 `NOTICE: CLOSURE_COMMIT` 归档时才生效；marker 必须匹配 R 冻结的完整 canonical bundle/expected hashes、晚于 R 且不晚于 deadline，并同时定义新 logical state，`case.md` 随后同步该索引。此前保留旧 logical state，不能开始 action；AT 必须晚于 ACTION commit 并使 current status 进入 acceptance，不能在已有 AT 时仍索引 implementing 或提前 closed

默认 collaboration 的 BOS/DES/CR 均写 `NOT_APPLICABLE`，不能为满足模板创建空记录。只有正式证据控制合法启动后，空 DES 才写 `EMPTY`。
