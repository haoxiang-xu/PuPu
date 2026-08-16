---
case_id: P-0000-0005-2026-0815
discussion_type: proposal
boundary_protocol: v1
procedure_mode: collaboration
status: drafting
stage_instance_id: null
acceptance_series_id: null
evidence_continuation_ref: null
proposal_ruling_scope: ACTION
lead_owner: code-owner-unchain
current_owner: code-owner-unchain
current_artifact_ref: P-0000-0005-2026-0815#PS-001
boundary_contract_refs: []
state_sequence_refs: []
review_snapshot_ref: null
objection_group_refs: []
full_vote_ref: null
full_scope_overlay_ref: null
parent_case_id: P-0000-0002-2026-0813
relation: side-case
derived_from: null
blocking: false
blocking_case_id: null
created_at: 2026-08-15T14:55:30-07:00
updated_at: 2026-08-15T14:55:30-07:00
---

# Historical durable interaction resolution repair

## 讨论对象
- **目标结果**: 独立审理 P-0000-0002-2026-0813 在 R-0001 后追加、未经 review/ruling 的 historical interaction repair；形成 compiler、graph recovery、generation rebase 与 PuPu fresh-continuation 的一致 fail-closed 契约。
- **non_goals**: 不改写父案 PS-001/R-0001；不以本次迁移授权生产代码；不恢复 auto-resume；不以 Git SHA allowlist 证明 runtime capability。
- **初始已知范围**: 父案原始 proposal.md 中 PS-002、BC-009、SEQ-007、AC-013；Unchain compiler/graph/generation；PuPu sidecar/chat-core；runtime feature readiness。
- **当前 write_set**: PENDING_DISCOVERY
- **当前 contract_set**: PENDING_DISCOVERY
- **当前 boundary contracts**: PENDING_DISCOVERY
- **当前 state sequences**: PENDING_DISCOVERY

## 主 owner
- **选择**: code-owner-unchain
- **选择依据**: canonical durable event repair 与 compiler/graph/generation consumers 位于 Unchain core；PuPu runtime/chat-core 边界须后续串行 handoff 确认。
- **选择不确定性**: BC/SEQ 拆分、consumer owner 与 exact acceptance matrix 尚待主 owner 集成和真实 owner handoff。
- **选择事件**: S-0001

## 当前 handoff
- **open**: null
- **return_to**: code-owner-unchain

## 关系与阻塞
- **parent**: P-0000-0002-2026-0813
- **relation**: side-case
- **blocking**: false
- **migration source**: P-0000-0002-2026-0813/proposal.md#PS-002, BC-009, SEQ-007, AC-013

## 文件索引
- [协作记录](record.md)
- [方案](proposal.md)
