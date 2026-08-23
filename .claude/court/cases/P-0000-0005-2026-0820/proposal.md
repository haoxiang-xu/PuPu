# Compact RunBundle v2 boundary contract

## Scope

RunBundle v1 remains frozen at its 2 MiB canonical wire ceiling.  When the
producer cannot construct a complete v1 projection, Unchain emits
`unchain.run_bundle.v2`: bounded accounting totals plus an immutable
`unchain.run_bundle_details_ref.v1`.  Provider receipts and metric events are
never dropped or replaced by a top-N sample; they are stored as durable detail
facts and addressed by partition roots.

## Boundary contracts

### BC-001 — Unchain facts → v2 envelope

Producer: Unchain RunLedger; consumer: PuPu sidecar adapter.  VERSIONED/CLOSED.
The v2 envelope is canonical UTF-8 JSON, max 512 KiB, and contains exact
identity/lifecycle/descriptor, bounded totals/counts, `details_ref`, and
domain-separated facts roots.  Unknown fields, invalid digests, cross-execution
facts, and an oversized envelope fail closed.  v1 is not constructed first and
there is no v1 fallback for a present-invalid v2 value.  AC-001, AC-002,
AC-004.

### BC-002 — v2 envelope → durable sidecar/Electron storage

Producer: sidecar/SSE projection; consumers: Electron main, preload, renderer.
VERSIONED/CLOSED.  Schema, bundle identity, revision, and digest are storage
keys; v1 and v2 records cannot overwrite each other.  v2 records persist with
zero inline usage slices and remain queryable after restart.  The main process
admits v2 independently of v1 and rejects malformed v2 values.  A v2 head must
strictly advance any v1 head; after v2 exists, v1 cannot become the head again.
Combined queries return only the highest revision and reject a dual-schema
same-revision head as corrupt.  AC-003, AC-005, AC-006.

### BC-003 — details_ref → durable facts resolver

Owner: Unchain durable ledger.  VERSIONED/CLOSED.  The ref binds execution,
bundle revision, facts digest, partition item counts, byte counts, and roots.
Missing or mismatched detail facts are integrity failures; no legacy fallback or
provider re-run is permitted.  AC-007, AC-008.

### BC-004 — runtime compatibility and rollout

Owner: runtime manifest/capability gate.  VERSIONED.  v1 remains the default
for v1-only consumers; v2 is accepted only when the producer and consumer both
advertise the compact feature.  A present-invalid schema never silently falls
back.  Exact producer wheel and PuPu candidate are tested as one artifact pair.
AC-009, AC-010.

## State sequences

### SEQ-001 — oversized normal run

Provider receipts are durably appended, v1 construction crosses the limit,
v2 facts/ref are persisted, one v2 terminal envelope is admitted by sidecar
and Electron, and the provider is not retried.  Repeat/replay returns the same
revision and digest.  BC-001/002/003; AC-003/005/007.

### SEQ-002 — small run compatibility

The same path with a small fact set continues to emit and persist unchanged v1
bytes.  BC-001/002; AC-001/006.

### SEQ-003 — restart and invalid detail

Cold sidecar/Electron restart reloads the v2 envelope.  Missing, wrong-scope, or
wrong-root detail facts quarantine the projection and do not resend the model
call.  BC-002/003; AC-007/008.

### SEQ-004 — graph/subagent

Child facts are referenced by exact child identity.  Root aggregation uses
set-union of durable facts; parent and child summaries are never added twice.
BC-001/003; AC-004/008.

## Acceptance criteria

- **AC-001:** v1 golden fixtures and exact 2 MiB boundary remain unchanged.
- **AC-002:** v2 canonical envelope is accepted at 512 KiB and rejected at
  512 KiB + 1 byte in Python, sidecar, preload, main, and renderer validators.
- **AC-003:** 2,000+ provider receipts produce v2 without
  `run bundle exceeds the canonical byte limit`; provider call count and usage
  totals remain exact.
- **AC-004:** no unbounded receipt/event/child arrays are inline in v2; each
  externalized partition has count, canonical byte count, and root digest.
- **AC-005:** v2 survives sidecar/Electron restart and duplicate terminal replay
  idempotently; v1→v2 strictly advances revision, cannot regress to v1, and a
  combined query exposes one unambiguous highest-revision head.
- **AC-006:** v1-only malformed/present-invalid behavior remains fail closed;
  absence-only legacy behavior remains unchanged.
- **AC-007:** details scope/digest tampering fails closed and never triggers a
  provider resend.
- **AC-008:** graph/subagent duplicate receipt IDs are counted once after
  durable hydration.
- **AC-009:** runtime manifest and loaded artifact identity are explicit in the
  release report.
- **AC-010:** all applicable normal/repeat/retry/resume/restart cells are run;
  `NOT_RUN` means incomplete rollout, not pass.

## Current implementation gate

The source implementation is complete across Unchain producer/details storage,
failure and completion carriers, continuation/restart, subagent/graph union,
PuPu sidecar projection, Electron storage, renderer admission, and chat
deletion.  Source-pair verification passes the full Unchain and PuPu sidecar
suites plus the Electron/renderer contract matrix and production web build.

Active rollout remains **INCOMPLETE** until the sibling Unchain changes and the
PuPu candidate are committed, a clean-source Unchain wheel and runtime-manifest
evidence are generated, and `test:run-bundle-contract` passes against that exact
wheel/revision pair.  The release artifact builder intentionally rejects the
current dirty source trees, so source tests are not represented as artifact
provenance.
