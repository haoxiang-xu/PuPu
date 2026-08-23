# Record

## S-0001 | 2026-08-13T22:21:00-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: code-owner-unchain
- **basis**: Chief Judge direction to begin Run Bundle v1 implementation after protocol and impact review
- **decision effect**: select canonical Unchain protocol owner as the sole lead

## S-0002 | 2026-08-13T22:22:00-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: HANDOFF
- **target**: HS-001
- **basis**: P-0000-0002-2026-0813#PS-001
- **decision effect**: request the PuPu runtime owner boundary and sequence contract
- **to**: code-owner-runtime
- **scope**: BC-003, BC-004, BC-007, SEQ-002, SEQ-005, SEQ-006, AC-002, AC-003, AC-004, AC-005, AC-007, AC-009, AC-010, AC-012
- **expires at**: 2026-08-13T22:23:30-07:00
- **status**: OPEN

## S-0003 | 2026-08-13T22:23:00-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-runtime
- **type**: HANDOFF_RETURN
- **target**: HS-001
- **basis**: S-0002
- **decision effect**: confirm strict host projection, graph attribution, pricing ingestion and rollout obligations
- **contribution**: BC-003, BC-004, BC-007, SEQ-002, SEQ-005, SEQ-006 runtime responsibility; avoid CRITICAL agent factories and keep graph checkpoint schema unchanged
- **status**: RETURNED

## S-0004 | 2026-08-13T22:24:00-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: HANDOFF
- **target**: HS-002
- **basis**: P-0000-0002-2026-0813#PS-001
- **decision effect**: request the Electron persistence and IPC contract
- **to**: code-owner-electron
- **scope**: BC-005, SEQ-003, AC-002, AC-007, AC-010, AC-011, AC-012
- **expires at**: 2026-08-13T22:25:30-07:00
- **status**: OPEN

## S-0005 | 2026-08-13T22:25:00-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-electron
- **type**: HANDOFF_RETURN
- **target**: HS-002
- **basis**: S-0004
- **decision effect**: confirm keyed revision/digest UPSERT and transactional slice replacement
- **contribution**: BC-005, SEQ-003 Electron SQLite, IPC, preload and migration responsibility
- **status**: RETURNED

## S-0006 | 2026-08-13T22:26:00-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: HANDOFF
- **target**: HS-003
- **basis**: P-0000-0002-2026-0813#PS-001
- **decision effect**: request the renderer admission and no-auto-resume contract
- **to**: code-owner-chat-core
- **scope**: BC-004, BC-005, BC-006, BC-008, SEQ-004, AC-002, AC-005, AC-006, AC-007, AC-008, AC-010, AC-011, AC-012
- **expires at**: 2026-08-13T22:27:30-07:00
- **status**: OPEN

## S-0007 | 2026-08-13T22:27:00-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-chat-core
- **type**: HANDOFF_RETURN
- **target**: HS-003
- **basis**: S-0006
- **decision effect**: confirm strict done admission, keyed upsert and authoritative no-resume lookup seam
- **contribution**: BC-004, BC-005, BC-006, BC-008, SEQ-004 chat-core responsibility; preserve live_continues and provider recovery
- **status**: RETURNED

## S-0008 | 2026-08-13T22:28:00-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: HANDOFF
- **target**: HS-004
- **basis**: P-0000-0002-2026-0813#PS-001
- **decision effect**: request the canonical usage presentation contract
- **to**: code-owner-chat-bubble
- **scope**: BC-006, AC-002, AC-008, AC-012
- **expires at**: 2026-08-13T22:29:30-07:00
- **status**: OPEN

## S-0009 | 2026-08-13T22:29:00-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-chat-bubble
- **type**: HANDOFF_RETURN
- **target**: HS-004
- **basis**: S-0008
- **decision effect**: confirm canonical input/cache/reasoning/null display semantics
- **contribution**: BC-006 chat-bubble and Settings presentation responsibility
- **status**: RETURNED

## S-0010 | 2026-08-13T22:31:00-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: RS-001
- **basis**: P-0000-0002-2026-0813#PS-001
- **decision effect**: freeze the Run Bundle v1 proposal review window
- **artifact**: P-0000-0002-2026-0813#PS-001
- **supersedes**: null
- **review kind**: ORDINARY
- **boundary reviewed objects**: BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008, SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006
- **boundary object hash**: sha256:9bfe4d8c537cd0777aa107bc236b7c3905208f4c43f08d0be53f454c4a046408
- **artifact content hash**: sha256:c613577536c25a2858425fb76f519494112c9e8a192de187b5a19972acebe822
- **eligible owners**: code-owner-unchain, code-owner-runtime, code-owner-electron, code-owner-chat-core, code-owner-chat-bubble
- **N**: 5
- **inherited stances**: NOT_APPLICABLE
- **re-review owners**: code-owner-unchain, code-owner-runtime, code-owner-electron, code-owner-chat-core, code-owner-chat-bubble
- **invalidated scopes**: ALL
- **review deadline**: 2026-08-13T22:34:00-07:00
- **objection intake deadline**: 2026-08-13T22:34:00-07:00
- **lead disposition deadline**: 2026-08-13T22:35:00-07:00
- **lead reminder final deadline**: 2026-08-13T22:36:00-07:00
- **content hash**: sha256:834120e0cdf79d8126901aa058b976e4864542e3533d43cdb08464ac661a9b62

## S-0011 | 2026-08-13T22:31:30-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-unchain
- **type**: AGREE
- **owner**: code-owner-unchain
- **target**: P-0000-0002-2026-0813#PS-001
- **basis**: PS-001
- **decision effect**: confirm the atomic receipt and unique call-set ledger baseline
- **review snapshot**: RS-001
- **scope**: BC-001, BC-002, BC-003, BC-007, BC-008, SEQ-001, AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-009, AC-010, AC-012

## S-0012 | 2026-08-13T22:32:00-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-runtime
- **type**: AGREE
- **owner**: code-owner-runtime
- **target**: P-0000-0002-2026-0813#PS-001
- **basis**: HS-001
- **decision effect**: confirm graph/SSE/pricing/rollout scope
- **review snapshot**: RS-001
- **scope**: BC-003, BC-004, BC-007, SEQ-002, SEQ-005, SEQ-006, AC-002, AC-003, AC-004, AC-005, AC-007, AC-009, AC-010, AC-012

## S-0013 | 2026-08-13T22:32:30-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-electron
- **type**: AGREE
- **owner**: code-owner-electron
- **target**: P-0000-0002-2026-0813#PS-001
- **basis**: HS-002
- **decision effect**: confirm transactionally keyed Bundle persistence
- **review snapshot**: RS-001
- **scope**: BC-005, SEQ-003, AC-002, AC-007, AC-010, AC-011, AC-012

## S-0014 | 2026-08-13T22:33:00-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-chat-core
- **type**: AGREE
- **owner**: code-owner-chat-core
- **target**: P-0000-0002-2026-0813#PS-001
- **basis**: HS-003
- **decision effect**: confirm strict stream admission and fresh-message continuation
- **review snapshot**: RS-001
- **scope**: BC-004, BC-005, BC-006, BC-008, SEQ-004, AC-002, AC-005, AC-006, AC-007, AC-008, AC-010, AC-011, AC-012

## S-0015 | 2026-08-13T22:33:30-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-chat-bubble
- **type**: AGREE
- **owner**: code-owner-chat-bubble
- **target**: P-0000-0002-2026-0813#PS-001
- **basis**: HS-004
- **decision effect**: confirm canonical usage presentation
- **review snapshot**: RS-001
- **scope**: BC-006, AC-002, AC-008, AC-012

## S-0016 | 2026-08-13T22:36:30-07:00
- **case**: P-0000-0002-2026-0813
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: R-0001
- **basis**: R-0001
- **decision effect**: make the ACTION ruling and implementing state effective atomically
- **notice kind**: CLOSURE_COMMIT
- **ruling**: R-0001
- **closure bundle hash**: sha256:afd8ec9c2dfc46edd279d503b2dfeee82fc3194c936410c9b03323db1c2d0768
- **precommit event hashes**: []
- **old logical state**: awaiting-ruling
- **new logical state**: implementing
- **payload hash**: sha256:69acd303973c01734dfadae5bbab804114ea8dd0b23c0948e57cecc5f1a93e2a
