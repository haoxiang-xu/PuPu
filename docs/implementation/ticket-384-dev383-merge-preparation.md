# #384 merge preparation: Stop preserves visible tool history

## Proposed outcome

Prepare the #384 repair against current dev, which already contains accepted #383 behavior. The reviewed local candidate is tree `523f0d1a1a9f1188154abe321e591c90396a88df`, assembled from #384 HEAD `6fdaf960869ca515d6dccb0c56e55b129e597df7` and dev input `e680c64f4d2feb42e4387f34e369cecd13d0d962`.

On Stop, assistant messages retain meaningful tool-result history even when the call frame is missing, including nested history, scalar `false`/`0`, and fallback error output. No call, owner, body, or successful completion is synthesized. A stopped grouped row shows `Interrupted` when any member remains pending; completed groups retain their completed status and elapsed span. Existing approval guards continue to block actions after cancellation or a terminal result.

The text conflicts retain the union of both test imports, both approval-action guards, and the five release workflow pins to `a7fa15d685b1130bf5678c1e493a51d2551185cf`. The workflow matches current dev byte-for-byte. The accepted runtime wheel remains SHA-256 `27139af8f6bf94b8f6bd1ce219a5da6966e17dc90b20225ace032e0c1a57d8b6`; strict validation uses the actually imported protocol manifest with digest `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`.

## Contracts and acceptance criteria

- **BC-384-383-001** — Runtime events through raw audit storage, logical-call projection, and TraceChain. Preserve source identity and feedback grouping; unknown or contradictory ownership remains visible and unqualified rather than borrowing another call's owner. **AC-384-383-001:** #383 confirmation references and once-only display pass alongside #384 Stop/history cases.
- **BC-384-383-002** — Fixed Unchain artifact to host and packaging consumers. The imported strict protocol manifest controls compatibility; preserve the five current-dev workflow defaults and the accepted wheel. **AC-384-383-002:** workflow defaults and remaining bytes match dev; host source and fixed-wheel provenance match; old-head CI is not treated as qualification for this candidate.
- **SEQ-384-383-001** — Flush accepted events and exact pending-interaction identity before tombstoning and generation invalidation. Late and prior-generation callbacks must not change the stopped record or successor turn. **AC-384-383-003:** existing Stop timing, repeated interaction, stale/successor, storage round-trip, and grouping regressions pass.
- **SEQ-384-383-002** — Session switch/reopen and Memory V2 journal/cold-sidecar recovery. The exact candidate started ready and the user reported overall manual acceptance passed. **AC-384-383-004:** that user confirmation is bound to this local tree and runtime; it does not claim separately instrumented cases, cold-sidecar/journal qualification, or deployment.

## Validation evidence

- Combined focused regression: **19 suites / 564 tests passed**, no failures or skips.
- Frontend aggregate: **450 suites, 5,597 passed, 5 pending, zero failed**. One complete run had eight environment-only failures in two unchanged vault suites because sandbox loopback listen returned `EPERM`; the exact two suites were rerun after that restriction and all 30 assertions passed. The aggregate combines that complete run with the two exact reruns; it is not a second all-green full invocation.
- Release workflow checks: **15 passed**.
- All **1,060** frozen source hashes match; independent final source review passed.
- Startup, runtime readiness, Memory V2 readiness, and strict protocol validation were observed. The user confirmed **“可以验收通过”** for the overall manual acceptance of this candidate. The record contains no per-case screenshots or logs.

## Publication state

The source merge commit is to preserve the exact reviewed tree `523f0d1a1a9f1188154abe321e591c90396a88df`, with parents #384 `6fdaf960869ca515d6dccb0c56e55b129e597df7` and current dev `e680c64f4d2feb42e4387f34e369cecd13d0d962`. A docs-only follow-up will publish this preparation note while preserving all 1,060 frozen source files. The latest GitHub head and CI result are tracked by the PR checks. This preparation note records the source/evidence checkpoint; it does not perform the merge or deployment. Exact deployed artifact-pair qualification remains separate work.
