---
case_id: M-0000-0001-2026-0814
discussion_type: motion
boundary_protocol: null
procedure_mode: collaboration
status: drafting
stage_instance_id: null
acceptance_series_id: null
evidence_continuation_ref: null
proposal_ruling_scope: null
lead_owner: code-owner-unchain
current_owner: code-owner-unchain
current_artifact_ref: null
boundary_contract_refs: []
state_sequence_refs: []
review_snapshot_ref: null
objection_group_refs: []
full_vote_ref: null
full_scope_overlay_ref: null
parent_case_id: null
relation: null
derived_from: null
blocking: false
blocking_case_id: null
created_at: 2026-08-14T09:01:00-07:00
updated_at: 2026-08-14T09:01:00-07:00
---

# Context V2 与 Memory V2 现状验收合规审查

## 讨论对象
- **目标结果**: 对 PuPu 当前生产实现（PuPu dev HEAD `93720ab1` + Unchain locked revision `d0572979aad7a66545a2cf03339a1813f3a3ff27`，见 `unchain_runtime/unchain-core.lock.json`）分别就 Context V2、Memory V2 作出「是否符合当前已确立验收标准」的判断结论，逐项列出通过/未通过/未运行及依据。
- **non_goals**: 不决定验收失败项的具体修复实现（需要时另立 `proposal` case）；不重新裁定 `0000-0002-2026-0807`（Trace 的 Memory V2 词汇与旧实现清理）与 `0000-0003-2026-0807`（Memory 的用户可见面）两个尚待裁定的历史案，只在必要时引用其已归档事实作为背景；不评估 sibling Unchain repo 当前 dev HEAD（`38547bc`，领先 lock revision）的未锁定改动。
- **初始已知范围**:
  - `docs/architecture/context-v2-boundary-contracts.md`（CTX-B01–CTX-B06 boundary profile、CTX-S01–CTX-S06 state-sequence profile）
  - `docs/architecture/context-v2-p0-contract-postmortem-2026-08-11.md`
  - `docs/architecture/memory-v2-claude-handoff-2026-08-07.md`（§7 接线状态、§12 已知技术债、§17 下一里程碑 Definition of Done）
  - `docs/architecture/memory-v2-p0-followups.md`
  - `unchain_runtime/unchain-core.lock.json`
  - `unchain:src/unchain/context/**`、`unchain:src/unchain/memory/**`

## 主 owner
- **选择**: code-owner-unchain
- **选择依据**: 对两个子问题运行机械路径路由（`.claude/skills/case/summon.py lead motion`），Context V2 材料 9 个显式路径命中 code-owner-unchain 且无并列；Memory V2 材料 6 个显式路径命中 code-owner-unchain 且无并列。两份验收标准文档的绝大多数证据锚点（boundary contract 的 producer/consumer 实现、state-sequence 矩阵、Definition of Done 的五层实现状态）都落在 Unchain 仓库核心代码。
- **选择不确定性**: PuPu 侧的 lock/release 证据（CTX-B06/CTX-S06、DoD 条件 6）、rollout/capability 配置、memory-inspect UI 缺口（`src/COMPONENTs/memory-inspect` 未命中 code-owner-unchain 边界）预期不在其边界内，需经串行交棒补全，最可能对象为 `code-owner-runtime`（PuPu sidecar host adapter、lock 文件、rollout 配置的 owner）。
- **选择事件**: S-0001

## owner chain
- lead | code-owner-unchain | S-0001 | active

## 当前 handoff
- **open**: null
- **return_to**: code-owner-unchain

## 合作 owner
- （待首次集成快照后登记）

## 当前产出与审查
- **artifact**: null（drafting 中，尚无 MS）
- **review electorate**: null
- **Full scope overlay**: null
- **stance events canonical**: null
- **stance summary**: NOT_APPLICABLE

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
- [协作与庭审记录](record.md)
- [议案](motion.md)
