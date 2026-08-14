# Ruling

## R-0001 | 2026-08-13T22:36:00-07:00
- **ruling identity**: Chief Judge
- **record type**: PLAN_RULING
- **discussion type / procedure mode**: proposal | collaboration
- **basis**: P-0000-0002-2026-0813#PS-001, RS-001, S-0015
- **evidence flag disposition**: NOT_APPLICABLE
- **mandatory responses**: NOT_APPLICABLE
- **proposal result**: APPROVED
- **ruling scope**: ACTION
- **approved proposal/snapshot**: P-0000-0002-2026-0813#PS-001
- **authorized action**: 实施 Run Bundle v1 atomic provider-call ledger、unique-call-set aggregation、strict PuPu projection/UPSERT/UI、interaction cancel-to-fresh-run 与 signed offline pricing snapshot；仅在 exact deployed pair 全矩阵通过后 active rollout
- **acceptance criteria**: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012
- **boundary revision set**: sha256:69aa52362724fdb9d8f993561906b33f2063e54a82782300856aabf2239dc968+sha256:2e144cee5fb1498b59cd6a6ee5b534f2668e4fe439aa2a0bc8752d9f354abac5
- **boundary protocol**: v1
- **boundary contracts / state sequences**: BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008 / SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006
- **evidence disposition**: 实施后必须使用真实 producer→strict consumer、cold restart、duplicate/reconnect、failure injection 与 exact locked-pair evidence
- **accepted uncovered risks**: 历史 legacy usage 不可完整 backfill，必须 partial；公开价只能为 list-price estimate，provider admin cost 只在 bucket 级对账；未提交的 sibling Unchain 不得被 active PuPu lock 引用
- **BOS disposition**: NOT_APPLICABLE
- **acceptance series**: AS-001
- **effect status at append**: PENDING_CLOSURE
- **closure bundle manifest**: {"bundle_body":{"case_id":"P-0000-0002-2026-0813","commit_event_id":"S-0016","deadline":"2026-08-13T22:50:00-07:00","new_logical_state":"implementing","old_logical_state":"awaiting-ruling","precommit_events":[],"ruling_id":"R-0001"},"commit_payload":{"case_id":"P-0000-0002-2026-0813","closure_bundle_hash":"sha256:afd8ec9c2dfc46edd279d503b2dfeee82fc3194c936410c9b03323db1c2d0768","event_id":"S-0016","new_logical_state":"implementing","notice_kind":"CLOSURE_COMMIT","old_logical_state":"awaiting-ruling","precommit_event_hashes":[],"ruling_id":"R-0001","type":"NOTICE"},"precommit_event_payloads":[]}
- **closure bundle hash**: sha256:afd8ec9c2dfc46edd279d503b2dfeee82fc3194c936410c9b03323db1c2d0768
- **expected commit payload hash**: sha256:69acd303973c01734dfadae5bbab804114ea8dd0b23c0948e57cecc5f1a93e2a
- **closure deadline**: 2026-08-13T22:50:00-07:00
- **effective when**: record.md#S-0016 NOTICE:CLOSURE_COMMIT
- **next state / SI**: implementing | SI-002
- **parent release**: NOT_APPLICABLE
- **stop condition**: closure commit 后开始代码实施；active rollout 必须等待 acceptance 与 exact lock pair
