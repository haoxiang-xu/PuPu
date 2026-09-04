---
case_id: P-0000-0008-2026-0821
discussion_type: proposal
boundary_protocol: v1
procedure_mode: collaboration
status: drafting
stage_instance_id: null
acceptance_series_id: null
evidence_continuation_ref: null
proposal_ruling_scope: ACTION
lead_owner: code-owner-runtime
current_owner: code-owner-runtime
current_artifact_ref: P-0000-0008-2026-0821#PS-001
boundary_contract_refs: [BC-001, BC-002, BC-003]
state_sequence_refs: [SEQ-001, SEQ-002, SEQ-003]
review_snapshot_ref: null
objection_group_refs: []
full_vote_ref: null
full_scope_overlay_ref: null
parent_case_id: null
relation: null
derived_from: null
blocking: false
blocking_case_id: null
created_at: 2026-08-21T17:20:00-07:00
updated_at: 2026-08-21T17:20:00-07:00
---

# Windows Memory V2 containment、candidate 与 release-gate

## 讨论对象

- **目标结果**: 为 Windows 上的 Memory V2 建立独立、可审查的 containment 支持面、candidate identity 链和 release-gate；在完整 ACTION PLAN_RULING 与 CLOSURE 前，Windows Active 始终不可进入。
- **non_goals**: 不在本案 drafting 阶段改动 Windows Active guard、运行时 sidecar、Vault、Job Object、GitHub ruleset 或任何 rollout 配置；不把 Job Object 说成 OS-wide sandbox；不把 Shadow 结果当作 Active 资格；不改变既有 P6 durable chat deletion scope closure 的审理边界。
- **初始已知范围**: `electron/main/services/unchain/memory_v2_rollout.*`、Windows sidecar 启动/containment 边界、`scripts/build-web.cjs`、`scripts/release-qa/package-sidecar-smoke.mjs`、`e2e/fixtures/pupu_app.js`、`.github/workflows/release-qa.yml`，以及 GitHub `main` ruleset `11921569` 的 required-check/bypass 配置。
- **当前 write_set**: W0 仅限 case/contract/evidence 与 release-QA red detector；后续实现必须由获准 PS 明确列出 Electron、runtime、workflow、release ruleset 和测试文件。
- **当前 contract_set**: BC-001, BC-002, BC-003
- **当前 boundary contracts**: BC-001, BC-002, BC-003
- **当前 state sequences**: SEQ-001, SEQ-002, SEQ-003

## 主 owner

- **选择**: code-owner-runtime
- **选择依据**: 主要实施结果是 Memory V2 的 Windows lifecycle/capability containment 与其对候选资格的 fail-closed 投影；release/Q A 和 Electron consumer 是明确的跨边界依赖，须在后续串行 handoff 中由对应 owner 确认。
- **选择不确定性**: Windows Job Object 的实际控制通道归属、Electron launch integration、CI snapshot producer 和 repository ruleset consumer 尚未取得 material owner confirmation；本草案不代写这些 owner 的实现决定。
- **选择事件**: S-0001

## owner chain

- lead | code-owner-runtime | S-0001 | active

## 当前 handoff

- **open**: null
- **return_to**: code-owner-runtime

## 合作 owner

- code-owner-runtime | lead/framing only | P-0000-0008-2026-0821#PS-001 | voting=false until an integrated review freezes an electorate

## 当前产出与审查

- **artifact**: P-0000-0008-2026-0821#PS-001 | DRAFT_ONLY
- **review electorate**: null | no RS has been frozen
- **Full scope overlay**: null
- **stance events canonical**: none
- **stance summary**: NOT_EVALUATED

## 异议与程序升级

- **lead dispositions pending**: null
- **objection groups**: null
- **Full eligibility**: NOT_EVALUATED
- **Full vote**: null

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
- **rollout disposition**: BLOCKED | Windows Active requires this case's independent ACTION PLAN_RULING + CLOSURE and later acceptance evidence. Until then, the only permitted Windows runtime disposition is the existing Shadow/off behavior.

## 文件索引

- [协作记录](record.md)
- [方案](proposal.md)
- [基线证据](evidence.md)（W0 red detector 执行后创建）
