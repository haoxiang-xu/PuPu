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
