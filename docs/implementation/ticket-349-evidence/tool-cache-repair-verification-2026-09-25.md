<!-- release-feature-audit:v2 -->
## Issue feature audit — repair verification, 2026-09-25

Release: #216 (v0.1.12). Scope: #349 first slice only, the run-local
committed-journal cache.

Overall: FAIL — the repaired source passes its targeted correctness checks, but
the required exact candidate/wheel/manifest and real-app checks have not run.

1. i18n: PASS — no user-facing strings changed; the preceding fresh full scan
   remains zero missing/orphan/placeholder mismatch.
2. UI: N/A — backend/persistence-only slice.
3. model × agent builder: N/A — no model or provider selection change.
4. static rules: PASS — backend-only; both working trees pass `git diff --check`.
5. end-to-end: FAIL — source regression coverage passes, but the exact built
   PuPu candidate plus one reused Unchain wheel, imported manifest and restarted
   sidecar probe remain NOT_RUN.

Candidate digest: NOT_BUILT / NOT_VERIFIED
Unchain wheel SHA-256: NOT_BUILT / NOT_VERIFIED
Runtime manifest digest: NOT_VERIFIED for a built artifact pair

### P1 repair verified

The cache now captures an SQLite trigger-backed `integrity_revision` with each
full snapshot. Updates or deletions of `events` and `operations` advance the
revision. Before reusing the prefix, the cache verifies the revision and the
cached high-water prefix shape in one SQLite transaction; after tail reading it
checks the revision again. A change forces the ordinary full snapshot path,
which retains the established event-byte, indexed identity and operation-linkage
validation.

Temporary-database probes now pass for all of the previously bypassed cases:
payload replacement with a stale digest, generation-column mutation, operation
target mutation, cached-prefix deletion, and the real request-factory/compiler
path. The cache continues to release completed journals and caches.

The schema is now exactly `{1,2,3}`. Version 3 adds
`executions.integrity_revision` and its triggers. The paired Unchain read-only
status and PuPu fail-closed owner admission both accept that exact version; an
unknown/mixed schema remains rejected.

### Fresh evidence

- Unchain Context V2: **1457 passed, 1 skipped, 1 xfailed**.
- PuPu owner-boundary plus runtime factory/context/worker: **43 passed**.
- Cache acceptance and integrity probes: **7 passed**.
- Corrected 100-sample benchmark raw SHA-256:
  `158b925146a9e9faa9c7236f5c186789b37f40db1e267cae6657806566470523`.

The post-fix benchmark preserves the long-history result: stable continuation
improves 35.3% at 25 turns and 38.9% at 100 turns; a newly committed tool pair
improves 14.1% and 16.6%, respectively. One-turn histories regress by 0.97–1.17
ms because the durable revision check has a fixed cost. That limitation is
recorded rather than hidden.

The broader first-slice differential matrix (canonical messages, provider wire,
durable write counts, sequential tools, artifacts, retry/resume/restart and
graph/subagent) and exact artifact evidence remain open requirements from the
ticket plan. Keep #349 In Progress.
