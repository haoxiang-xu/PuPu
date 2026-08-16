# Record

## S-0001 | 2026-08-14T09:39:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: FRAMING
- **target**: case
- **basis**: Chief Judge direction: use runtime-relative protocol detection and do not maintain a SHA lock
- **decision effect**: create a blocking side-case because the approved parent RunBundle plan bound rollout to an exact Unchain lock
- **核心问题/目标**: 用版本化runtime manifest及同一artifact连续性替代Git SHA compatibility admission
- **non_goals**: 不允许不兼容runtime；不删除构建溯源；不改写parent历史裁定
- **主 owner**: code-owner-runtime
- **选择依据**: 对sidecar admission、release artifact、package与跨边界集成负责
- **选择不确定性**: Unchain producer与Electron consumer必须分别确认exact contract
- **初始已知范围**: Unchain runtime producer；PuPu sidecar/Electron；release/package/report；旧lock/probe/bypass

## S-0002 | 2026-08-14T09:40:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: HANDOFF
- **target**: HS-001
- **basis**: P-0000-0003-2026-0814#PS-001
- **decision effect**: 补全并确认Unchain code-backed manifest producer及升级序列后方案才能集成
- **from**: code-owner-runtime
- **to**: code-owner-unchain
- **scope**: SLOT-002, BC-001, SEQ-002, AC-001, AC-002, AC-003, AC-004, AC-005, AC-009
- **delivery**: 确认producer exact wire/digest、实际loaded-code来源、major/minor/features升级语义及正负验收责任
- **return_to**: code-owner-runtime
- **expires at**: 2026-08-14T10:15:00-07:00
- **expiry effect**: 记录EXPIRED并重新路由或终止；不得把未确认producer当作完成
- **status**: OPEN

## S-0003 | 2026-08-14T09:46:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-unchain
- **type**: HANDOFF_RETURN
- **target**: HS-001
- **basis**: P-0000-0003-2026-0814#PS-001
- **decision effect**: 确认Unchain code-backed runtime protocol producer、严格wire/digest与兼容升级边界，无blocker
- **from**: code-owner-unchain
- **to**: code-owner-runtime
- **scope**: SLOT-002, BC-001, SEQ-002, AC-001, AC-002, AC-003, AC-004, AC-005, AC-009
- **contribution**: BC-001 producer与SEQ-002 owner确认；Unchain新增closed manifest dataclasses、strict from/to dict、builder与public export；不读Git、lock或外部capability JSON
- **boundary confirmation**: BC-001=AGREE；installed source/wheel必须产生同一manifest，unknown/mutation/重复/乱序/非法类型fail closed
- **sequence confirmation**: SEQ-002=AGREE；minor只允许向后兼容增加feature，major或既有feature语义变化必须由consumer拒绝
- **acceptance confirmation**: AC-001, AC-002, AC-003, AC-004, AC-005, AC-009=AGREE
- **status**: RETURNED

## S-0004 | 2026-08-14T09:47:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: HANDOFF
- **target**: HS-002
- **basis**: P-0000-0003-2026-0814#PS-001
- **decision effect**: 补全并确认Electron独立strict consumer、错误投影及sticky V2语义后方案才能集成
- **from**: code-owner-runtime
- **to**: code-owner-electron
- **scope**: SLOT-003, BC-002, SEQ-001, SEQ-002, SEQ-004, AC-002, AC-003, AC-004, AC-005, AC-009
- **delivery**: 确认manifest strict admission、digest重算、readiness/status projection与legacy/sticky失败语义
- **return_to**: code-owner-runtime
- **expires at**: 2026-08-14T10:20:00-07:00
- **expiry effect**: 记录EXPIRED并重新路由或终止；不得把未确认consumer当作完成
- **status**: OPEN

## S-0005 | 2026-08-14T09:49:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-electron
- **type**: HANDOFF_RETURN
- **target**: HS-002
- **basis**: P-0000-0003-2026-0814#PS-001
- **decision effect**: 确认Electron独立strict consumer、稳定错误投影及legacy/sticky失败语义，无blocker
- **from**: code-owner-electron
- **to**: code-owner-runtime
- **scope**: SLOT-003, BC-002, SEQ-001, SEQ-002, SEQ-004, AC-002, AC-003, AC-004, AC-005, AC-009
- **contribution**: BC-002 consumer确认；Electron独立校验exact keys、digest、major/minor/required features及success tuple；revision/checkout永不参与准入
- **boundary confirmation**: BC-002=AGREE；invalid与incompatible使用稳定、可区分的错误且在V2 side effect前fail closed
- **sequence confirmation**: SEQ-001, SEQ-002, SEQ-004=AGREE；off/legacy不要求协议，sticky V2/RunBundle不得降级
- **acceptance confirmation**: AC-002, AC-003, AC-004, AC-005, AC-009=AGREE
- **status**: RETURNED

## S-0006 | 2026-08-14T09:51:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: RS-001
- **basis**: P-0000-0003-2026-0814#PS-001
- **decision effect**: 冻结runtime protocol/no-SHA方案的合作owner审查窗口
- **artifact**: P-0000-0003-2026-0814#PS-001
- **supersedes**: null
- **review kind**: ORDINARY
- **boundary reviewed objects**: BC-001, BC-002, BC-003, SEQ-001, SEQ-002, SEQ-003, SEQ-004
- **boundary object hash**: sha256:efc07ce0a053522757f6c7d4c380c28e96f5bcb057031d2a3339e9f8b2277c0b
- **artifact content hash**: sha256:48a27b002028f0792d312c28d59d0d9cb63424f8476853d25cf6084eb91e10cc
- **eligible owners**: code-owner-runtime, code-owner-unchain, code-owner-electron
- **N**: 3
- **inherited stances**: NOT_APPLICABLE
- **re-review owners**: code-owner-runtime, code-owner-unchain, code-owner-electron
- **invalidated scopes**: ALL
- **review deadline**: 2026-08-14T10:05:00-07:00
- **objection intake deadline**: 2026-08-14T10:05:00-07:00
- **lead disposition deadline**: 2026-08-14T10:10:00-07:00
- **lead reminder final deadline**: 2026-08-14T10:15:00-07:00
- **content hash**: sha256:730c4144a7890d4b0292dab6fbc17b89f5ca99b45f24830e15df7a3d2cf7787e

## S-0007 | 2026-08-14T09:52:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-runtime
- **type**: AGREE
- **owner**: code-owner-runtime
- **target**: P-0000-0003-2026-0814#PS-001
- **basis**: PS-001
- **decision effect**: 确认runtime integration、single-artifact release continuity与legacy/sticky基线
- **review snapshot**: RS-001
- **scope**: BC-001, BC-002, BC-003, SEQ-001, SEQ-003, SEQ-004, AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009

## S-0008 | 2026-08-14T09:52:30-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-unchain
- **type**: AGREE
- **owner**: code-owner-unchain
- **target**: P-0000-0003-2026-0814#PS-001
- **basis**: HS-001
- **decision effect**: 确认code-backed producer、strict digest与兼容升级边界
- **review snapshot**: RS-001
- **scope**: BC-001, SEQ-002, AC-001, AC-002, AC-003, AC-004, AC-005, AC-009

## S-0009 | 2026-08-14T09:53:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-electron
- **type**: AGREE
- **owner**: code-owner-electron
- **target**: P-0000-0003-2026-0814#PS-001
- **basis**: HS-002
- **decision effect**: 确认独立strict consumer、错误投影和sticky fail-closed边界
- **review snapshot**: RS-001
- **scope**: BC-002, SEQ-001, SEQ-002, SEQ-004, AC-002, AC-003, AC-004, AC-005, AC-009

## S-0010 | 2026-08-15T15:05:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: RS-002
- **basis**: P-0000-0003-2026-0814#PS-002, RS-001
- **decision effect**: 在 Chief 授权的 canonical reconstruction 上冻结 PS-002 successor review；不继承旧 stance
- **artifact**: P-0000-0003-2026-0814#PS-002
- **supersedes**: RS-001
- **review kind**: ORDINARY
- **boundary reviewed objects**: BC-001, BC-002, BC-003, SEQ-001, SEQ-002, SEQ-003, SEQ-004
- **boundary object hash**: sha256:a4c59962b01d13426e06f1964731fab1e762888f0cc85a9035c1ec1aeb38dad7
- **artifact content hash**: sha256:d3547ca0cefef7837cecb5e3d73b5696ca09be92283bab733c72f33bc81b3e61
- **inherited stances**: NOT_APPLICABLE
- **re-review owners**: code-owner-runtime, code-owner-unchain, code-owner-electron
- **invalidated scopes**: AM-001/AM-002 及其直接依赖 BC-001, BC-002, SEQ-001, SEQ-002, SEQ-004, AC-001, AC-002, AC-003, AC-004, AC-005, AC-009；lead baseline 必须重发
- **eligible owners**: code-owner-runtime, code-owner-unchain, code-owner-electron
- **N**: 3
- **review deadline**: 2026-08-15T16:00:00-07:00
- **objection intake deadline**: 2026-08-15T16:00:00-07:00
- **lead disposition deadline**: 2026-08-15T16:15:00-07:00
- **lead reminder final deadline**: 2026-08-15T16:30:00-07:00
- **content hash**: sha256:1da9cfbc0562d390f717c2ec230d8c998e80b19f4ad55e1705419a914b00f2ad

## S-0011 | 2026-08-15T15:06:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-runtime
- **type**: ABSTAIN
- **owner**: code-owner-runtime
- **target**: P-0000-0003-2026-0814#PS-002
- **basis**: RS-002; proposal sha256:d3547ca0cefef7837cecb5e3d73b5696ca09be92283bab733c72f33bc81b3e61; boundary sha256:a4c59962b01d13426e06f1964731fab1e762888f0cc85a9035c1ec1aeb38dad7
- **decision effect**: lead 不确认 PS-002 为可送裁基线；必须形成冻结 uncontaminated contract dependencies 的 successor artifact/RS
- **review snapshot**: RS-002
- **scope**: BC-001, BC-002, SEQ-001, SEQ-002, SEQ-004, AC-001, AC-002, AC-003, AC-004, AC-005, AC-009
- **reason**: P3 两份共享 contract JSON 当前包含已迁 P6 的 `context_memory.chat_deletion_sqlite_scope_closure`，但 PS-002 仅纳入 AM-001/AM-002；继续 AGREE 会把未授权 AM-003/P6 scope 静默导回 P3。quarantine 只冻结 proposal bytes，未冻结 PS-002-specific contract copy。
- **requested next state**: lead revision to PS-003 with immutable PS-specific contract copies, then RS-003 re-review

## S-0012 | 2026-08-15T15:10:15-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-runtime
- **type**: ANSWER
- **target**: P-0000-0003-2026-0814#PS-003
- **basis**: S-0011, AM-004; verified contract copies sha256:8d35df6e0b1b49f6c52e2014a011fa1a54838db06e5a5c3d0a35fe8718608d6f + sha256:591c4aee30b2cc5df873819d574ebd81019b4ca18d5f3fb5e8796d706f13e6d0
- **decision effect**: lead forms PS-003 only on the verified isolation delta and requests fresh RS-003 review
- **scope**: AM-004, BC-001 canonical representation, PS-specific contract dependencies, rollout disposition
- **lead formation statement**: 恢复 AM-001/AM-002 runtime-protocol/no-SHA plan，不导入 AM-003/P6 authority；production PuPu consumer matrix 未匹配 frozen PS-003 时 active rollout fail closed
- **owner limitation**: 不代表或确认 code-owner-unchain producer 与 code-owner-electron consumer；两者必须提交 fresh RS-003 stance

## S-0013 | 2026-08-15T15:11:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: RS-003
- **basis**: P-0000-0003-2026-0814#PS-003, RS-002
- **decision effect**: 冻结 PS-003 successor review；RS-002 ABSTAIN保留历史但不继承为当前stance
- **artifact**: P-0000-0003-2026-0814#PS-003
- **supersedes**: RS-002
- **review kind**: ORDINARY
- **boundary reviewed objects**: BC-001, BC-002, BC-003, SEQ-001, SEQ-002, SEQ-003, SEQ-004
- **boundary object hash**: sha256:79e545d9bda6e67055919b91b2faeaab11d2a75e251e0b92d83ce7e70b8300f6
- **artifact content hash**: sha256:9de7c7a8bee2d56b66f13fcedc5c9c2311f6bc8e74c9a7cbec033ec97e2f50d4
- **inherited stances**: NOT_APPLICABLE
- **re-review owners**: code-owner-runtime, code-owner-unchain, code-owner-electron
- **invalidated scopes**: AM-004/BC-001 contract dependency change及直接依赖 BC-002, BC-003, SEQ-001, SEQ-002, SEQ-003, SEQ-004, AC-001..AC-009；全体必须fresh review
- **eligible owners**: code-owner-runtime, code-owner-unchain, code-owner-electron
- **N**: 3
- **review deadline**: 2026-08-15T16:15:00-07:00
- **objection intake deadline**: 2026-08-15T16:15:00-07:00
- **lead disposition deadline**: 2026-08-15T16:30:00-07:00
- **lead reminder final deadline**: 2026-08-15T16:45:00-07:00
- **content hash**: sha256:9a4d4610048caae48faba8d84cf81ee4d70936bb64031e7a35681176c6d1226e

## S-0014 | 2026-08-15T15:14:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-runtime
- **type**: AGREE
- **owner**: code-owner-runtime
- **target**: P-0000-0003-2026-0814#PS-003
- **basis**: RS-003; proposal sha256:9de7c7a8bee2d56b66f13fcedc5c9c2311f6bc8e74c9a7cbec033ec97e2f50d4; boundary sha256:79e545d9bda6e67055919b91b2faeaab11d2a75e251e0b92d83ce7e70b8300f6
- **decision effect**: lead confirms PS-003 isolation baseline while preserving active rollout block
- **review snapshot**: RS-003
- **scope**: BC-001, BC-002, BC-003, SEQ-001, SEQ-003, SEQ-004, AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009
- **evidence**: PS-specific producer sha256:8d35df6e0b1b49f6c52e2014a011fa1a54838db06e5a5c3d0a35fe8718608d6f and consumer sha256:591c4aee30b2cc5df873819d574ebd81019b4ca18d5f3fb5e8796d706f13e6d0 exclude only migrated deletion slug; current PuPu consumers still require it, so ACTIVE_ROLLOUT_BLOCKED is presently triggered
- **owner limitation**: dependency read of BC-002 consumer/SEQ-002 is not an Electron or Unchain stance

## S-0015 | 2026-08-15T15:18:30-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-unchain
- **type**: AGREE
- **owner**: code-owner-unchain
- **target**: P-0000-0003-2026-0814#PS-003
- **basis**: RS-003; proposal sha256:9de7c7a8bee2d56b66f13fcedc5c9c2311f6bc8e74c9a7cbec033ec97e2f50d4; boundary sha256:79e545d9bda6e67055919b91b2faeaab11d2a75e251e0b92d83ce7e70b8300f6
- **decision effect**: confirm clean imported-manifest/no-SHA producer baseline and P6 isolation
- **review snapshot**: RS-003
- **scope**: BC-001, SEQ-002, AC-001, AC-002, AC-003, AC-004, AC-005, AC-009
- **evidence**: producer contract sha256:8d35df6e0b1b49f6c52e2014a011fa1a54838db06e5a5c3d0a35fe8718608d6f differs from contaminated shared producer only by removal of `context_memory.chat_deletion_sqlite_scope_closure`; strict UTF-8/NFC/safe integer, interaction_resolution_compat, expected_interaction_id_cas, exact-key/digest semantics remain
- **test limitation**: focused run_tests could not execute because editable miso is absent; no environment change was made and no test PASS is claimed; static code/test review plus isolated module strict round-trip found no producer blocker
- **owner limitation**: does not speak for runtime or Electron consumer

## S-0016 | 2026-08-15T15:22:00-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-electron
- **type**: AGREE
- **owner**: code-owner-electron
- **target**: P-0000-0003-2026-0814#PS-003
- **basis**: RS-003; proposal sha256:9de7c7a8bee2d56b66f13fcedc5c9c2311f6bc8e74c9a7cbec033ec97e2f50d4; boundary sha256:79e545d9bda6e67055919b91b2faeaab11d2a75e251e0b92d83ce7e70b8300f6
- **decision effect**: confirm strict Electron consumer/no-SHA admission baseline while preserving the triggered active-rollout block
- **review snapshot**: RS-003
- **scope**: BC-002, SEQ-001, SEQ-002, SEQ-004, AC-002, AC-003, AC-004, AC-005, AC-009
- **evidence**: consumer contract sha256:591c4aee30b2cc5df873819d574ebd81019b4ca18d5f3fb5e8796d706f13e6d0 removes only migrated deletion slug and preserves AM-001/AM-002 strict NFC/UTF-8/safe-integer/digest/feature rules; Electron startup/status consumers independently validate the manifest and treat revision/source as telemetry only
- **tests**: `memory_v2_rollout.test.cjs` + `memory_v2_startup_readiness.test.cjs` PASS, 2 suites / 39 tests; `.js` twins delegate to canonical `.cjs` suites
- **rollout observation**: current Electron still requires the P6 deletion slug, so PS-003 ACTIVE_ROLLOUT_BLOCKED is triggered until P6 authorization or evidenced removal; producer advertisement alone grants no P6 authority
- **owner limitation**: does not speak for runtime or Unchain producer

## S-0017 | 2026-08-15T16:17:37-07:00
- **case**: P-0000-0003-2026-0814
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: R-0003
- **basis**: R-0003
- **decision effect**: make the ACTION ruling and implementing state effective atomically while preserving the independent P6 active-rollout block
- **notice kind**: CLOSURE_COMMIT
- **ruling**: R-0003
- **closure bundle hash**: sha256:4e63eb882c1b15e721dfc1e455e67078fabd2b975137b0e085f00bb1ef94c1a3
- **precommit event hashes**: []
- **old logical state**: awaiting-ruling
- **new logical state**: implementing
- **payload hash**: sha256:b3da8f5007b1edc35afa57b4f018a3c45b53022952fa9a21edde7056b4a04017
