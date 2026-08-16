---
case_id: P-0000-0003-2026-0814
discussion_type: proposal
boundary_protocol: v1
procedure_mode: collaboration
status: implementing
proposal_quarantine_manifest: proposal-quarantine.PS-003.json
stage_instance_id: SI-001
acceptance_series_id: AS-001
evidence_continuation_ref: null
proposal_ruling_scope: ACTION
lead_owner: code-owner-runtime
current_owner: code-owner-runtime
current_artifact_ref: P-0000-0003-2026-0814#PS-003
boundary_contract_refs: [BC-001, BC-002, BC-003]
state_sequence_refs: [SEQ-001, SEQ-002, SEQ-003, SEQ-004]
review_snapshot_ref: RS-003
objection_group_refs: []
full_vote_ref: null
full_scope_overlay_ref: null
parent_case_id: P-0000-0002-2026-0813
relation: side-case
derived_from: null
blocking: true
blocking_case_id: null
created_at: 2026-08-14T09:39:00-07:00
updated_at: 2026-08-15T16:17:37-07:00
---

# 用运行时协议握手替代 Unchain SHA 兼容锁

## 讨论对象
- **目标结果**: 删除 Git SHA、clean/dirty checkout 和 dev bypass 对运行兼容性的决定权；由实际加载的 Unchain code-backed protocol manifest 与 PuPu required-protocol matrix 决定 Memory V2/RunBundle readiness，并以同一 immutable build artifact 保证测试与发布连续性。
- **non_goals**: 不把未知或不兼容协议降级为 legacy V2 写入；不取消 Git revision 的诊断/溯源价值；不把 artifact digest 当兼容 allowlist；不改变 RunBundle、provider receipt、Context Memory 或 durable interaction 的既有业务语义。
- **初始已知范围**: sibling Unchain runtime protocol producer；PuPu sidecar capability admission/status；Electron readiness；release QA/reporting/workflow；PyInstaller source/wheel input；旧 lock、Git probe 与 bypass 测试/文档。
- **当前 write_set**: `../unchain/src/unchain/runtime/**`, `../unchain/tests/**`, `unchain_runtime/server/context_memory_v2_capability.py`, sidecar capability/status tests, `electron/main/services/unchain/{memory_v2_rollout.js,service.js}`, Electron tests, release QA scripts/tests/reporting/workflow, `.sh/.ps1` build inputs, package/docs
- **当前 contract_set**: BC-001, BC-002, BC-003
- **当前 boundary contracts**: BC-001, BC-002, BC-003
- **当前 state sequences**: SEQ-001, SEQ-002, SEQ-003, SEQ-004

## 主 owner
- **选择**: code-owner-runtime
- **选择依据**: 主要结果是 PuPu runtime admission、release artifact continuity 与跨边界集成；Unchain producer及 Electron consumer通过有限 HS 确认。
- **选择不确定性**: Unchain manifest producer与 Electron strict consumer需分别确认 exact wire；两项关闭前不得送裁。
- **选择事件**: S-0001

## owner chain
- lead | code-owner-runtime | S-0001 | active
- HS-001 | code-owner-runtime → code-owner-unchain | SLOT-002, BC-001, SEQ-002, AC-001, AC-002, AC-003, AC-004, AC-005, AC-009 | S-0002 → S-0003 | RETURNED
- HS-002 | code-owner-runtime → code-owner-electron | SLOT-003, BC-002, SEQ-001, SEQ-002, SEQ-004, AC-002, AC-003, AC-004, AC-005, AC-009 | S-0004 → S-0005 | RETURNED

## 当前 handoff
- **open**: null
- **return_to**: code-owner-runtime

## 合作 owner
- code-owner-runtime | lead/integration/release | P-0000-0003-2026-0814#PS-003 | voting=true
- code-owner-unchain | manifest producer | P-0000-0003-2026-0814#PS-003 | voting=true
- code-owner-electron | strict readiness consumer | P-0000-0003-2026-0814#PS-003 | voting=true

## 当前产出与审查
- **artifact**: P-0000-0003-2026-0814#PS-003
- **review electorate**: RS-003 | code-owner-runtime, code-owner-unchain, code-owner-electron | N=3
- **Full scope overlay**: null
- **stance events canonical**: S-0014, S-0015, S-0016; S-0011 remains historical RS-002 ABSTAIN
- **stance summary**: RS-003 AGREE=3, OBJECT=0, ABSTAIN=0; objection window closed at 2026-08-15T16:15:00-07:00 with no new objection; R-0003 and S-0017 entered implementing while active rollout remains blocked

## 异议与程序升级
- **lead dispositions pending**: null
- **objection groups**: null
- **Full eligibility**: NOT_EVALUATED
- **Full vote**: null

## 其他参与权限
- speaker-of-the-house | procedure/archive | case records | standing

## 当前收敛与证据控制
- **BOS**: NOT_APPLICABLE
- **DES**: NOT_APPLICABLE
- **sampling scope**: NOT_APPLICABLE
- **active revision cycle**: null
- **evidence continuation**: NOT_APPLICABLE
- **latest CR**: NOT_APPLICABLE

## 关系与阻塞
- **parent**: P-0000-0002-2026-0813
- **relation**: side-case
- **derived_from**: null
- **blocking child**: null

## 文件索引
- [协作记录](record.md)
- [方案](proposal.md)
- [PS-002 canonical reconstruction](proposal.canonical.PS-002.md)
- [PS-003 canonical successor](proposal.canonical.PS-003.md)
- [提案 quarantine manifest](proposal-quarantine.json)
- [PS-003 quarantine manifest](proposal-quarantine.PS-003.json)
- [Unchain producer contract](contracts/unchain-runtime-protocol-producer-v1.json)
- [PuPu consumer contract](contracts/pupu-runtime-protocol-consumer-v1.json)
- [PS-003 Unchain contract](contracts/ps-003/unchain-runtime-protocol-producer-v1.json)
- [PS-003 PuPu contract](contracts/ps-003/pupu-runtime-protocol-consumer-v1.json)
