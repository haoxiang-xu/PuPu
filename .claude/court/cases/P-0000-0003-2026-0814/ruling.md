# Ruling

## R-0001 | 2026-08-15T15:04:30-07:00
- **ruling identity**: Chief Judge
- **record type**: PROCEDURAL_RULING
- **discussion type / procedure mode**: proposal | collaboration
- **basis**: Chief Judge user message 2026-08-15 “批准”，明确批准先修 P-0000-0002/P-0000-0003 append-only lineage 与全局 gate，再建立 P-0000-0004；不得伪造 owner stance/hash
- **result**: REMEDY_REQUIRED
- **quarantine manifest**: proposal-quarantine.json
- **preserved source**: proposal.md | sha256:b994571340b3990396b4942dee6b9855da4785e5c7f3b33b217c3a2f4c949ac5
- **canonical snapshot**: proposal.canonical.PS-002.md | sha256:9b4bb9f1311134f482525591814dd10530eaf25f5bbd589f256f4d32d806903d
- **content-hash reconstruction basis**: sha256:d3547ca0cefef7837cecb5e3d73b5696ca09be92283bab733c72f33bc81b3e61 | exact preserved source prefix through PS-002 before replacing PENDING_CANONICALIZATION_SPEC
- **migration disposition**: AM-003、BC-004、SEQ-005、AC-010..AC-018 保留在原始 proposal.md 作为字节证据，并迁入独立 ACTION side-case P-0000-0006-2026-0815
- **decision effect**: 只恢复 PS-002 的合法 successor review；任何 owner stance 必须由对应真实 owner 在 RS-002 后重新提交
- **authorization limit**: 本程序裁定不批准 PS-002，不授权 active rollout 或生产代码；PLAN_RULING 与 CLOSURE_COMMIT 仍为必要前置条件

## R-0002 | 2026-08-15T15:10:30-07:00
- **ruling identity**: Chief Judge
- **record type**: PROCEDURAL_RULING
- **discussion type / procedure mode**: proposal | collaboration
- **basis**: Chief coordination directive 2026-08-15 to preserve S-0011 ABSTAIN and repair with PS-specific contracts; original Chief Judge user approval “批准” for P2/P3 append-only lineage remedy
- **result**: REMEDY_REQUIRED
- **quarantine manifest**: proposal-quarantine.PS-003.json
- **preserved source**: proposal.md | sha256:b994571340b3990396b4942dee6b9855da4785e5c7f3b33b217c3a2f4c949ac5
- **canonical snapshot**: proposal.canonical.PS-003.md | sha256:5b9b22e758b7eecd663bc43cf02bc65c2f08d7d2bc6a1f7f08ab56d63b8f1dcc
- **content-hash reconstruction basis**: sha256:9de7c7a8bee2d56b66f13fcedc5c9c2311f6bc8e74c9a7cbec033ec97e2f50d4 | exact snapshot bytes with only PS-003 content-hash value replaced by PENDING_CANONICALIZATION
- **contract isolation**: producer sha256:8d35df6e0b1b49f6c52e2014a011fa1a54838db06e5a5c3d0a35fe8718608d6f; consumer sha256:591c4aee30b2cc5df873819d574ebd81019b4ca18d5f3fb5e8796d706f13e6d0; exact delta removes only migrated P6 deletion slug
- **migration disposition**: AM-003/BC-004/SEQ-005/AC-010..AC-018 remain isolated in P-0000-0006-2026-0815 with explicit rollout block
- **decision effect**: authorize PS-003 canonical successor review only; S-0011 remains immutable history and all RS-003 owners must submit fresh stance
- **authorization limit**: no PLAN_RULING, active rollout, P6 action or production authority is created

## R-0003 | 2026-08-15T16:17:36-07:00
- **ruling identity**: Chief Judge
- **record type**: PLAN_RULING
- **discussion type / procedure mode**: proposal | collaboration
- **basis**: P-0000-0003-2026-0814#PS-003, RS-003, S-0014, S-0015, S-0016
- **evidence flag disposition**: NOT_APPLICABLE
- **mandatory responses**: NOT_APPLICABLE
- **proposal result**: APPROVED
- **ruling scope**: ACTION
- **approved proposal/snapshot**: P-0000-0003-2026-0814#PS-003
- **authorized action**: implement the isolated AM-001/AM-002 runtime-protocol/no-SHA plan against the exact PS-003 producer/consumer contract pair; runtime compatibility derives from the actual imported manifest, while revision/source remain telemetry only
- **acceptance criteria**: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009
- **boundary revision set**: sha256:9de45df3769b73011ee9fd6001786db5ea8a12e11714f0484c1cad12051c5da9+sha256:446c1f4478c78b97d3f00404fbe3c6a8605920dc80826384e4adc529e647f2b4
- **boundary protocol**: v1
- **boundary contracts / state sequences**: BC-001, BC-002, BC-003, SEQ-001, SEQ-002, SEQ-003, SEQ-004
- **evidence disposition**: implementation acceptance must prove strict producer/sidecar/Electron/release parity and one immutable built artifact across tests, import and package smoke; no mutable sibling checkout or Git SHA is admission authority
- **accepted uncovered risks**: focused Unchain manifest tests were NOT_RUN because the reviewed checkout lacked editable miso; current PuPu runtime and Electron consumers still require the migrated P6 deletion slug, so the PS-003 active-rollout block is presently triggered
- **BOS disposition**: NOT_APPLICABLE
- **acceptance series**: AS-001
- **effect status at append**: PENDING_CLOSURE
- **closure bundle manifest**: {"bundle_body":{"case_id":"P-0000-0003-2026-0814","commit_event_id":"S-0017","deadline":"2026-08-15T16:30:00-07:00","new_logical_state":"implementing","old_logical_state":"awaiting-ruling","precommit_events":[],"ruling_id":"R-0003"},"commit_payload":{"case_id":"P-0000-0003-2026-0814","closure_bundle_hash":"sha256:4e63eb882c1b15e721dfc1e455e67078fabd2b975137b0e085f00bb1ef94c1a3","event_id":"S-0017","new_logical_state":"implementing","notice_kind":"CLOSURE_COMMIT","old_logical_state":"awaiting-ruling","precommit_event_hashes":[],"ruling_id":"R-0003","type":"NOTICE"},"precommit_event_payloads":[]}
- **closure bundle hash**: sha256:4e63eb882c1b15e721dfc1e455e67078fabd2b975137b0e085f00bb1ef94c1a3
- **expected commit payload hash**: sha256:b3da8f5007b1edc35afa57b4f018a3c45b53022952fa9a21edde7056b4a04017
- **closure deadline**: 2026-08-15T16:30:00-07:00
- **effective when**: record.md#S-0017 NOTICE:CLOSURE_COMMIT
- **next state / SI**: implementing | SI-001
- **parent release**: PENDING_SIDE_CASE_RULING | P-0000-0006-2026-0815 must independently authorize the deletion capability or production consumers must remove that requirement with evidence
- **stop condition**: implementation may begin after CLOSURE_COMMIT; active rollout remains blocked until AS-001 exact-artifact evidence passes and the independent P6 rollout dependency is lawfully resolved
