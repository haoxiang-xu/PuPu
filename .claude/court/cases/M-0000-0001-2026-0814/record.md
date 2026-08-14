---
case_id: M-0000-0001-2026-0814
---

# 协作与庭审记录

## S-0001 | 2026-08-14T09:01:00-07:00
- **case**: M-0000-0001-2026-0814
- **discussion type**: motion
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: FRAMING
- **target**: case
- **basis**: intake-sha256:bb5f141cd1c77c7b86f8c9e44903cf7d479738d1e0c6e5431e7bf7ee3c9fdb86
- **decision effect**: 固定讨论对象并选择唯一主 owner
- **核心问题/目标**: PuPu 当前生产实现（PuPu dev HEAD `93720ab1` + Unchain locked revision `d0572979aad7a66545a2cf03339a1813f3a3ff27`）是否符合 Context V2 与 Memory V2 各自已确立的验收标准
- **non_goals**: 不决定验收失败项的具体修复实现；不重新裁定 `0000-0002-2026-0807` 与 `0000-0003-2026-0807` 两个尚待裁定的历史案；不评估 sibling Unchain repo 未锁定的 dev HEAD 改动
- **主 owner**: code-owner-unchain
- **选择依据**: 机械路径路由（`summon.py lead motion`）对 Context V2 与 Memory V2 两份材料均给出唯一最高命中 code-owner-unchain，且两份验收标准文档的绝大多数证据锚点在 Unchain 仓库核心代码
- **选择不确定性**: PuPu 侧 lock/release 证据、rollout/capability 配置、memory-inspect UI 缺口预期在其边界外，需经串行交棒补全
- **初始已知范围**: `docs/architecture/context-v2-boundary-contracts.md`, `docs/architecture/context-v2-p0-contract-postmortem-2026-08-11.md`, `docs/architecture/memory-v2-claude-handoff-2026-08-07.md`, `docs/architecture/memory-v2-p0-followups.md`, `unchain_runtime/unchain-core.lock.json`, `unchain:src/unchain/context/**`, `unchain:src/unchain/memory/**`

## S-0002 | 2026-08-14T09:03:00-07:00
- **case**: M-0000-0001-2026-0814
- **discussion type**: motion
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: case
- **basis**: S-0001, .claude/codex/court-records/discussion-model.md
- **decision effect**: 记录程序模式说明，避免与 2026-08-10 前 `track: full` 旧字段混淆
- **notice kind**: PROCEDURE_MODE_CLARIFICATION
- **说明**: 立案人原始请求使用「full 案」措辞。当前法典（2026-08-10 起）已取消 2026-08-10 前案卷使用的 `track: full`（预召集完整团队）字段；`procedure_mode` 只能从 `collaboration` 开始，`full`（众议庭）只能经异议升级门槛（`D>=3` 且 `D>N/2` 且异议组不可合并且 Speaker 开票通过）到达，不得在立案时预选。本案按现行规则以单一主 owner + collaboration 起步。
