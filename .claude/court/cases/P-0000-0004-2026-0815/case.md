---
case_id: P-0000-0004-2026-0815
discussion_type: proposal
boundary_protocol: v1
procedure_mode: collaboration
status: implementing
stage_instance_id: SI-001
acceptance_series_id: AS-001
evidence_continuation_ref: null
proposal_ruling_scope: ACTION
lead_owner: code-owner-unchain
current_owner: code-owner-unchain
current_artifact_ref: P-0000-0004-2026-0815#PS-002
boundary_contract_refs: [BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008, BC-009]
state_sequence_refs: [SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006, SEQ-007]
review_snapshot_ref: RS-002
objection_group_refs: []
full_vote_ref: null
full_scope_overlay_ref: null
parent_case_id: P-0000-0002-2026-0813
relation: side-case
derived_from: null
blocking: false
blocking_case_id: null
created_at: 2026-08-15T15:10:00-07:00
updated_at: 2026-08-15T17:08:05-07:00
---

# Context Composition V1

## 讨论对象
- **目标结果**: 以每次 physical provider call 的 ProviderCallReceipt/RunBundle 为唯一事实源，生成 content-free、可对账、可持久恢复的 Context Composition V1，并提供类似 Cursor 的 Model Call / Run Tree 两级 context usage UI。
- **non_goals**: 不建立第二 token ledger；不保存 raw prompt、隐藏推理、secret、tool/artifact bytes 或普通跨用户 content hash；不把 Context Control/cache/MCP/provider-retained/retry/fallback 当 category；不以 Git SHA、dirty checkout 或 source path 决定 runtime compatibility；不声称远程 continuation 的不可见上下文已被精确分类。
- **初始已知范围**: Unchain context assembly/provider send/ProviderCallReceipt/RunBundle/runtime manifest；PuPu sidecar/SSE；renderer runtime event/store/selectors；Electron仅验证既有bundle_json连续性且不新增IPC/table/store；Context Usage modal。
- **当前 write_set**: owner-confirmed Unchain ModelTurnRequest/provider execution/ProviderCallReceipt/RunBundle/runtime-protocol seams与tests；PuPu runtime sidecar/SSE/fresh-hint durable admission；chat-core request/event/message-store carriage；shared Model Call/Run Tree selector；既有Electron bundle persistence verification；chat-bubble Context Composition modal/tests
- **当前 contract_set**: BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008, BC-009
- **当前 boundary contracts**: BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008, BC-009
- **当前 state sequences**: SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006, SEQ-007

## 主 owner
- **选择**: code-owner-unchain
- **选择依据**: physical provider send、ProviderCallReceipt 与 RunBundle 是唯一计量权威，核心 composition manifest/reconciliation 必须在 Unchain 内形成。
- **选择不确定性**: PuPu runtime、chat-core、Electron、shared selector 与 bubble/modal 的责任必须按真实边界串行 handoff；本 intake draft 不代表其 stance。
- **选择事件**: S-0001

## owner chain
- lead | code-owner-unchain | S-0001 | active
- HS-001 | code-owner-unchain → code-owner-runtime | superseded runtime draft | EXPIRED
- HS-002 + HS-004 | code-owner-unchain → code-owner-runtime | BC-005/BC-007/BC-008, SEQ-005/SEQ-006 | RETURNED
- HS-003 + HS-006 | code-owner-unchain → code-owner-chat-core | BC-005/BC-007, SEQ-004 | RETURNED
- HS-005 | code-owner-unchain → code-owner-shared-arteries | BC-006 producer | RETURNED
- HS-007 | code-owner-unchain → code-owner-electron | existing persistence verification only | RETURNED
- HS-008 | code-owner-unchain → code-owner-chat-bubble | BC-006 consumer | RETURNED
- HS-009 | code-owner-unchain → code-owner-runtime | r9 overlay closure review | RETURNED_NEEDS_REVISION
- HS-010 | code-owner-unchain → code-owner-runtime | r10 BC-005/007/008 + SEQ-005/006 | RETURNED
- HS-011 | code-owner-unchain → code-owner-chat-core | r10 BC-005/007 + SEQ-004 | RETURNED

## 当前 handoff
- **open**: null
- **return_to**: code-owner-unchain

## 合作 owner
- code-owner-unchain | lead/carrier/receipt/RunBundle | P-0000-0004-2026-0815#PS-002 | voting=true
- code-owner-runtime | sidecar/SSE/fresh durable admission | P-0000-0004-2026-0815#PS-002 | voting=true
- code-owner-chat-core | fresh hint/carriage lifecycle | P-0000-0004-2026-0815#PS-002 | voting=true
- code-owner-shared-arteries | strict selector producer | P-0000-0004-2026-0815#PS-002 | voting=true
- code-owner-electron | existing persistence verification | P-0000-0004-2026-0815#PS-002 | voting=true
- code-owner-chat-bubble | modal consumer | P-0000-0004-2026-0815#PS-002 | voting=true

## 当前产出与审查
- **artifact**: P-0000-0004-2026-0815#PS-002
- **review electorate**: RS-002 | code-owner-unchain, code-owner-runtime, code-owner-chat-core, code-owner-shared-arteries, code-owner-electron, code-owner-chat-bubble | N=6
- **Full scope overlay**: null
- **stance events canonical**: RS-002 requires fresh lead/runtime/chat-core stances; shared S-0050, Electron S-0051 and bubble S-0053 are explicitly inherited from direct predecessor RS-001
- **stance summary**: RS-002 direct code-owner-unchain/runtime/chat-core AGREE plus explicit unchanged-scope shared/Electron/bubble inheritance complete; objection deadline passed with no new objection; R-0001/CLOSURE effective

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
- **parent**: P-0000-0002-2026-0813
- **relation**: side-case
- **blocking**: false
- **production authorization**: ACTION_IMPLEMENTATION_AUTHORIZED | R-0001 + S-0077 effective; active rollout remains AC-015 BLOCKED/PENDING

## 文件索引
- [协作记录](record.md)
- [Historical non-normative Chief/Speaker intake; MUST NOT implement/review](proposal-draft.md)
- [Unchain producer contract](contracts/unchain-context-composition-producer-v1.json)
- [PuPu consumer contract](contracts/pupu-context-composition-consumer-v1.json)
- [Corrected PS-001 producer candidate](contracts/ps-001/unchain-context-composition-producer-v1.json)
- [Corrected PS-001 consumer candidate](contracts/ps-001/pupu-context-composition-consumer-v1.json)
- [Exact-shape PS-001-r2 producer candidate](contracts/ps-001-r2/unchain-context-composition-producer-v1.json)
- [Exact-shape PS-001-r2 consumer candidate](contracts/ps-001-r2/pupu-context-composition-consumer-v1.json)
- [Formal PS-001-r3 producer candidate](contracts/ps-001-r3/unchain-context-composition-producer-v1.json)
- [Formal PS-001-r3 consumer candidate](contracts/ps-001-r3/pupu-context-composition-consumer-v1.json)
- [Consolidated PS-001-r4 producer candidate](contracts/ps-001-r4/unchain-context-composition-producer-v1.json)
- [Consolidated PS-001-r4 consumer candidate](contracts/ps-001-r4/pupu-context-composition-consumer-v1.json)
- [Identity/reconciliation PS-001-r5 producer candidate](contracts/ps-001-r5/unchain-context-composition-producer-v1.json)
- [Identity/reconciliation PS-001-r5 consumer candidate](contracts/ps-001-r5/pupu-context-composition-consumer-v1.json)
- [Closed route-manifest PS-001-r6 producer candidate](contracts/ps-001-r6/unchain-context-composition-producer-v1.json)
- [Closed route-manifest PS-001-r6 consumer candidate](contracts/ps-001-r6/pupu-context-composition-consumer-v1.json)
- [Runtime-closed PS-001-r7 consumer candidate](contracts/ps-001-r7/pupu-context-composition-consumer-v1.json)
- [PS-001-r7 contract set](contracts/ps-001-r7/contract-set.json)
- [PS-001 canonical snapshot](proposal.canonical.PS-001.md)
- [Rejected compact PS-002-r8 candidate](contracts/ps-002-r8/contract-set.json)
- [Runtime-returned NEEDS_REVISION PS-002-r9 candidate](contracts/ps-002-r9/contract-set.json)
- [Approved PS-002-r10 producer](contracts/ps-002-r10/unchain-context-composition-producer-v2.json)
- [Approved PS-002-r10 consumer](contracts/ps-002-r10/pupu-context-composition-consumer-v2.json)
- [Approved PS-002-r10 contract set](contracts/ps-002-r10/contract-set.json)
- [PS-002 canonical snapshot](proposal.canonical.PS-002.md)
- [PLAN_RULING](ruling.md)
