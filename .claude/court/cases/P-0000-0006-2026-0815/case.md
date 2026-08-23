---
case_id: P-0000-0006-2026-0815
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
current_artifact_ref: P-0000-0006-2026-0815#PS-001
boundary_contract_refs: []
state_sequence_refs: []
review_snapshot_ref: null
objection_group_refs: []
full_vote_ref: null
full_scope_overlay_ref: null
parent_case_id: P-0000-0003-2026-0814
relation: side-case
derived_from: null
blocking: false
blocking_case_id: null
created_at: 2026-08-15T15:04:30-07:00
updated_at: 2026-08-15T15:04:30-07:00
---

# Durable chat deletion SQLite scope closure

## 讨论对象
- **目标结果**: 独立审理 P-0000-0003-2026-0814 的 AM-003 删除闭包草案，形成 PuPu deletion outbox 到 Unchain SQLite scope closure 的完整 owner、边界、序列、验收与 rollout 授权。
- **non_goals**: 不改写 P3 PS-002；不以迁移继承 action authority 或 owner stance；object bytes GC 与 external vector physical GC 保持独立 non-goal。
- **初始已知范围**: P3 raw proposal 的 AM-003、BC-004、SEQ-005、AC-010..AC-018；现有删除闭包实现与对抗验证只作为后续 evidence input，不代替 proposal review/ruling。
- **当前 write_set**: PENDING_OWNER_INTEGRATION
- **当前 contract_set**: PENDING_OWNER_INTEGRATION
- **当前 boundary contracts**: PENDING_OWNER_INTEGRATION
- **当前 state sequences**: PENDING_OWNER_INTEGRATION

## 主 owner
- **选择**: code-owner-runtime
- **选择依据**: PuPu deletion outbox、scope resolver、sidecar adapter 与跨仓集成由 runtime owner 负责；Unchain SQLite consumer 必须另行串行 handoff。
- **选择不确定性**: Unchain consumer confirmation 与已实现 diff 是否完全落在迁移 AC 内，须由真实 owner review。
- **选择事件**: S-0001

## 当前 handoff
- **open**: null
- **return_to**: code-owner-runtime

## 关系与阻塞
- **parent**: P-0000-0003-2026-0814
- **relation**: side-case
- **blocking**: false
- **rollout disposition**: BLOCKED | P3/P4 candidate 若仍在 production consumer 要求 `context_memory.chat_deletion_sqlite_scope_closure`，active rollout 必须等待本案独立 PLAN_RULING+CLOSURE，或先回滚该 required feature 并提交证据；本字段不建立法典禁止的 nested blocking child
- **migration source**: P-0000-0003-2026-0814/proposal.md#AM-003, BC-004, SEQ-005, AC-010..AC-018

## 文件索引
- [协作记录](record.md)
- [方案](proposal.md)
