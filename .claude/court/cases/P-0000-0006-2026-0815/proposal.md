---
case_id: P-0000-0006-2026-0815
updated_at: 2026-08-15T15:04:30-07:00
---

# 方案草案

## P-0000-0006-2026-0815
- **主 owner**: code-owner-runtime
- **目标结果**: 将 P3 AM-003 durable deletion closure 迁成独立、可审查、可裁定的 ACTION proposal。
- **non_goals**: 不继承 P3 的 PS/ruling/stance；不把既有实现或测试结果倒签为授权。
- **rollout disposition**: BLOCKED | production required slug 必须等待本案独立授权，或从候选中回滚并以真实 evidence 证明；P4 optional-extra 不能授权本案能力
- **实施范围**: PENDING_OWNER_INTEGRATION
- **验收标准**: 待主 owner 从迁移源 AC-010..AC-018 集成并按本案重新编号；必须覆盖 loaded feature parity、closed schema/order、atomic scope、immutable ownership、empty-scope authority、external vector fail-closed、non-resurrection、cold outbox replay 与 exact deployed pair。
- **boundary obligations**: PENDING_DISCOVERY
- **boundary N/A reason**: NOT_APPLICABLE
- **state sequence obligations**: PENDING_DISCOVERY
- **state sequence N/A reason**: NOT_APPLICABLE

### PS-001 | 2026-08-15T15:04:30-07:00
- **supersedes**: null
- **included contributions/amendments**: migrated draft evidence from P-0000-0003-2026-0814 raw proposal; no owner stance inherited
- **changed blocks**: framing only
- **dependent review blocks**: 全案
- **content hash**: PENDING_OWNER_INTEGRATION
- **governance status**: DRAFT_ONLY | BC/SEQ/AC、material handoff、hash、RS 与 owner stances 均未形成；不授予 action
- **formed_by**: code-owner-runtime

### PS-002 | 2026-08-21T00:00:00-07:00

- **supersedes**: PS-001 framing only; PS-001 remains historical evidence
- **included contributions/amendments**: two reproduced deletion P0s from the
  active PuPu runtime: `off` privacy deletion liveness and Unchain empty-root
  partial-schema containment
- **changed blocks**: BC-004, BC-005, SEQ-005, SEQ-006, AC-010..AC-023
- **dependent review blocks**: code-owner-runtime, code-owner-electron,
  code-owner-unchain, exact-artifact evidence
- **content hash**: PENDING_CANONICALIZATION_SPEC
- **governance status**: DRAFT_ONLY | this snapshot declares the implementation
  boundary and P0 containment work; it does not supply the required owner
  confirmations, PLAN_RULING, or active-rollout authority
- **formed_by**: code-owner-runtime

## BC-004 | PuPu chat deletion outbox to Unchain SQLite scope deletion

- **producer**: PuPu deletion outbox, sidecar deletion route, lifecycle scope
  resolver and exact extension declarations
- **consumer**: the actually imported Unchain `SQLiteChatDeletionV2Service`
- **owners**: producer `code-owner-runtime`; consumer `code-owner-unchain`
- **canonical representation**: closed `ChatDeletionScope`, stable
  `operation_id`, ordered extension declarations and immutable tombstone
  receipt. The normal Unchain success shape remains
  `pupu.unchain_chat_deletion.v1`.
- **admission policy**: VERSIONED. Unknown table, scope, schema or response
  shape fails closed; Git revision is provenance only and never capability
  admission.
- **failure semantics**: preflight and Core transaction failures preserve the
  outbox checkpoint. Commit-response loss replays the same scope and operation
  against immutable tombstone evidence.
- **positive acceptance**: AC-010, AC-012, AC-013, AC-014, AC-016, AC-017,
  AC-018, AC-023
- **negative acceptance**: AC-011, AC-014, AC-015, AC-016, AC-022

## BC-005 | Privacy-delete durable-owner routing and no-store receipt

- **producer**: sidecar `DELETE /context/v2/chat/<owner_chat_id>` after
  read-only marker/schema inspection
- **consumer**: Electron chat-deletion outbox
- **owners**: producer `code-owner-runtime`; consumer `code-owner-electron`
- **canonical no-store representation**: exact closed object
  `{schema: "pupu.context_v2_no_store_chat_deletion.v1", deleted: true,
  owner_chat_id: <canonical owner id>, outcome: "not_present"}`.
- **admission policy**: CLOSED. `off` prevents new V2 admission but never
  disables deletion authority. Only a sidecar that has read the durable marker
  and SQLite schema may produce `outcome=not_present`; Electron must not infer
  it from an error code, HTTP status, or transport failure.
- **routing**: absent/real blank database with no durable Context rows returns
  the no-store receipt without creating root, marker, SQLite, WAL or SHM.
  Recognized legacy and Unchain schemas dispatch to their persistent owner even
  if configured rollout owner is `off`. Mismatch, zero-byte, unknown or partial
  schema returns a typed non-success result.
- **failure semantics**: retryability is a stable sidecar error property.
  Electron's bounded retry/quarantine behaviour and independent Vault
  checkpoint are required before active rollout, but are not supplied by this
  P0 containment patch.
- **positive acceptance**: AC-019, AC-020
- **negative acceptance**: AC-019, AC-021, AC-022

## SEQ-005 | Durable scope deletion first attempt and cold replay

- **identity key**: `owner_chat_id + canonical scope SHA-256 + operation_id +
  tombstone revision`
- **initial state**: the exact chat has lifecycle evidence, or all known owner
  evidence is zero in an already canonical Unchain database
- **ordered events**: resolve exact scope -> Core `BEGIN IMMEDIATE` revalidates
  schema/owner/evidence -> write tombstone/scope evidence -> child-first delete
  -> immutable receipt -> `context_done`; response loss repeats the identical
  operation and receives the same durable receipt.
- **persistence boundary**: outbox, ownership/admission tables and shared
  Context/Memory SQLite tables
- **applicable cells**: first use, repeat, retry, resume, restart and rollback
- **acceptance**: AC-012, AC-013, AC-014, AC-016, AC-017, AC-018, AC-023

## SEQ-006 | No-store privacy deletion and empty-root containment

- **identity key**: `owner_chat_id + operation_id`
- **initial state**: configured owner can be `off`, `pupu_legacy` or
  `unchain`; marker and database are inspected read-only before a store opens
- **ordered events**: validate request -> inspect marker/schema ->
  `not_present` only for no-store -> otherwise dispatch to the persistent
  owner -> outbox acknowledges Context only after an exact success receipt.
- **repeat/restart**: no-store requests are idempotent but intentionally have
  no durable operation record, because creating one would violate the no-write
  property. A canonical Unchain tombstone replay remains governed by SEQ-005.
- **containment**: an Unchain empty root must never enter the lifecycle reader
  before canonical bootstrap exists. The temporary P0 response is no-store, not
  an empty-scope tombstone; a public Unchain canonical schema-only bootstrap is
  required before AC-014 can be claimed for empty roots.
- **acceptance**: AC-019, AC-020, AC-021, AC-022

## AC-019 | `off` no-store deletion is live and non-mutating

With `PUPU_CONTEXT_V2_STORE_OWNER=off`, a chat DELETE against a root with no
marker and no SQLite database returns the exact BC-005 no-store receipt. The
legacy runtime is not opened, and root, marker, database, WAL and SHM remain
absent through first use, repeat and cold restart.

## AC-020 | Privacy deletion follows durable owner, not current rollout

Recognized legacy and recognized Unchain stores are deleted by their respective
persistent owner when configuration is `off`. This does not re-enable normal
read, write or new-admission traffic.

## AC-021 | Empty-root Unchain delete cannot poison the data plane

An absent or truly blank Unchain root never invokes lifecycle schema
initialization, never creates a marker or partial database, and returns the
BC-005 no-store receipt. A subsequent official V2 bootstrap can establish a
recognized Unchain database.

## AC-022 | Partial schema failure is typed and non-generic

Known marker/schema conflict, zero-byte file, mixed schema or extension-only
database is reported as a stable sidecar deletion error; it never escapes as
generic HTTP 500 and it never causes automatic destructive repair.

## AC-023 | Canonical empty-scope tombstone remains a required successor

Before active rollout, `code-owner-unchain` must expose a versioned public
canonical schema-only initializer. The resulting exact deployed pair must
prove absent-root bootstrap -> full official schema -> extension schema ->
empty-scope tombstone -> cold replay, without extension-only residue. Until
then, this P0 containment patch does not claim AC-014 for absent roots.
