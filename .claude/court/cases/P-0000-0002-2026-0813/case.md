---
case_id: P-0000-0002-2026-0813
discussion_type: proposal
boundary_protocol: v1
procedure_mode: collaboration
status: implementing
stage_instance_id: SI-002
acceptance_series_id: AS-001
evidence_continuation_ref: null
proposal_ruling_scope: ACTION
lead_owner: code-owner-unchain
current_owner: code-owner-unchain
current_artifact_ref: P-0000-0002-2026-0813#PS-001
boundary_contract_refs: [BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008]
state_sequence_refs: [SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006]
review_snapshot_ref: RS-001
objection_group_refs: []
full_vote_ref: null
full_scope_overlay_ref: null
parent_case_id: null
relation: null
derived_from: null
blocking: false
blocking_case_id: null
created_at: 2026-08-13T22:20:29-07:00
updated_at: 2026-08-13T22:36:30-07:00
---

# Run Bundle v1 与显式暂停后续运行

## 讨论对象
- **目标结果**: 建立覆盖 root、recipe graph、subagent 与 auxiliary model call 的标准 Run Bundle；统一 token/cache/reasoning/cost 口径；消除重复计费；将用户交互暂停后的继续语义改为新消息触发新 Run。
- **non_goals**: 不把 raw prompt、隐藏推理、secret 或无界 tool output 内联进 Bundle；不把公开 list price 冒充 provider-observed per-run actual；不取消 provider exact-once recovery、网络 retry 或 live stream reattach。
- **初始已知范围**: Unchain provider/kernel/journal/subagent/interaction；PuPu sidecar graph/SSE；Electron usage persistence；chat stream 与 chat bubble；离线价格目录及聚合对账。
- **当前 write_set**: sibling Unchain provider/kernel/journal/subagent/interaction 与新 Run Bundle modules；PuPu sidecar graph/SSE adapter；Electron keyed store/IPC；chat stream/selector/Bubble；pricing catalog tooling/tests
- **当前 contract_set**: BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008
- **当前 boundary contracts**: BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008
- **当前 state sequences**: SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006

## 主 owner
- **选择**: code-owner-unchain
- **选择依据**: canonical ProviderCallReceipt、Run topology 与 RunBundle reducer 属于 Unchain core；PuPu 是跨进程严格消费者。
- **选择不确定性**: 无；PuPu runtime、Electron、chat-core 与 chat-bubble 已通过 HS-001–HS-004 串行确认。
- **选择事件**: S-0001

## owner chain
- lead | code-owner-unchain | S-0001 | active

## 当前 handoff
- **open**: null
- **return_to**: code-owner-unchain

## 合作 owner
- code-owner-unchain | lead/integration | P-0000-0002-2026-0813#PS-001 | voting=true
- code-owner-runtime | graph/SSE/pricing/rollout | HS-001 | voting=true
- code-owner-electron | keyed SQLite/IPC | HS-002 | voting=true
- code-owner-chat-core | renderer admission/no-auto-resume | HS-003 | voting=true
- code-owner-chat-bubble | canonical usage presentation | HS-004 | voting=true

## 当前产出与审查
- **artifact**: P-0000-0002-2026-0813#PS-001
- **review electorate**: RS-001 | code-owner-unchain, code-owner-runtime, code-owner-electron, code-owner-chat-core, code-owner-chat-bubble
- **Full scope overlay**: null
- **stance events canonical**: S-0011, S-0012, S-0013, S-0014, S-0015
- **stance summary**: 5 AGREE / 0 OBJECT / 0 ABSTAIN

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
- **parent**: null
- **relation**: null
- **derived_from**: null
- **blocking child**: null

## 文件索引
- [协作记录](record.md)
- [方案](proposal.md)
