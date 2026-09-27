<!-- release-feature-audit:v2 -->
## Issue feature audit — acceptance after final repair, 2026-09-26

Release: #216 (v0.1.12); direct parent, Project membership and Size=Release
verified fresh. #349 is open, Size=L, Status=In Progress; unchanged.

**Known-defect repair verification: PASS.** No new reproducible defect was
identified within the reviewed source paths. This does not certify unexecuted
sequence, performance or delivered-artifact requirements.

**Overall: FAIL (incomplete delivery evidence).** No remaining demonstrated
source defect from the previous audits; the whole first-slice acceptance is
still incomplete under the approved plan.

1. i18n: PASS — fresh scan: 815 English keys, ten locales, zero missing,
   orphan, placeholder mismatch and missingInEn. Existing 65 dead-key candidates
   and 48 dynamic references remain outside the backend change.
2. UI: N/A — no UI change in the audited cache slice.
3. model × agent builder: N/A — no model/provider selection change.
4. static rules: PASS — scoped Python change, both workspaces pass
   `git diff --check`; no frontend/Electron twin rule applies.
5. end-to-end: FAIL (NOT_RUN) — no fixed candidate/wheel/manifest, package smoke
   or restarted-sidecar real-app evidence for this source candidate.

Candidate digest: NOT_BUILT / NOT_VERIFIED
Unchain wheel SHA-256: NOT_BUILT / NOT_VERIFIED
Runtime manifest digest: NOT_VERIFIED for a delivered artifact pair

### Fresh source verification

- Unchain Context V2, its Python 3.12 environment: **1476 passed, 1 skipped,
  1 xfailed** (28.42 seconds).
- PuPu owner boundary, runtime factory/context/worker, read adapter, complete
  Memory routes, and all fourteen prior acceptance probes: **101 passed**
  (3.05 seconds).
- Known repaired paths reviewed: old-v2 owner admission and migration; v2/v3
  read-only startup status; INSERT OR REPLACE; UPDATE OR REPLACE across and
  within executions; atomic snapshot/revision acquisition; old-v3 trigger
  upgrade; no invalidation on unchanged reopen/ordinary append/idempotent replay.
- Independent temporary-database failure injection: install the prior event
  UPDATE trigger and a SQLite BEFORE UPDATE trigger that raises ABORT when
  integrity_revision is changed; attempt initialization; verify the complete
  SQLite iterdump before/after is identical. Remove the injected abort trigger,
  retry initialization, compare cached/full snapshots and repeat initialization.
  **PASS**: failed migration rolls back DDL/data; retry succeeds; repeated open
  preserves the revision. The probe changed no live database or production code.

The Unchain suite includes the seventeen new mutation/upgrade/status matrix
cases. The PuPu suite includes all earlier red-before-green defect reproducers;
none were removed or bypassed in this acceptance run.

### Remaining planned acceptance work

1. First-slice plan step 5: complete the explicit cache-on/off comparison of
   canonical messages, context digest, provider wire and durable order across
   sequential tools, artifacts, approval/retry, resume/restart and graph/subagent
   paths. Existing suite success alone does not prove every differential cell.
2. Step 6: report SQL read/write transactions, bytes and peak-cache-memory
   measurements, and validate final-candidate performance. The historical
   100-sample run predates this final repair; short-history overhead remains a
   recorded tradeoff, not a newly measured result.
3. AC-349-09 / BC-349-05: build and reuse one Unchain wheel with an identified
   PuPu candidate, verify the imported runtime manifest, package smoke and
   restarted-sidecar real-app behavior. These are delivery tests, not a request
   for public rollout or release publication.

BC-349-01/02/05's reproduced source repairs pass their current tests; the broader
AC/SEQ evidence above remains INCOMPLETE. Keep #349 In Progress. The next work
is acceptance completion, not another speculative source repair cycle.

This audit added only its report. No production edit, sidecar restart, commit,
push, ticket closure or release-state transition occurred.
