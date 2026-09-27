<!-- release-feature-audit:v2 -->
## Issue feature audit — independent re-audit, 2026-09-26

Release: #216 (v0.1.12), verified direct parent and Project Size=Release.
Scope: #349 first slice and the latest schema/replacement/atomic-read repairs.
Overall: FAIL — two reproduced source defects remain.
Project Status: In Progress, verified and unchanged.

1. i18n: PASS — fresh scan: 815 English keys, ten locales, zero missing,
   orphan, placeholder mismatch or missingInEn. Existing 65 dead-key candidates
   and 48 dynamic references are outside this backend change.
2. UI: N/A — no renderer or labels in this slice.
3. model × agent builder: N/A — no model-selection change.
4. static rules: PASS — both scoped workspaces pass `git diff --check`;
   no frontend or Electron test-twin change.
5. end-to-end: FAIL — durable-cache invalidation and existing-store startup
   status regressions below. Exact artifact pair/app evidence remains NOT_RUN.

Candidate digest: NOT_BUILT / NOT_VERIFIED
Unchain wheel SHA-256: NOT_BUILT / NOT_VERIFIED
Runtime manifest digest: NOT_VERIFIED for a built artifact pair

### [P1] UPDATE OR REPLACE leaves the destination execution cache current

Unchain `src/unchain/persistence/sqlite_v2.py:861-868` and `:893-898`.

The replacement INSERT triggers fix INSERT OR REPLACE, but UPDATE OR REPLACE
executes UPDATE triggers instead. When moving a row from another execution
onto an existing destination row, the update trigger advances OLD.execution_id
only. With the default recursive_triggers=0, the implicit deletion of the
destination does not invoke its DELETE trigger. Its revision, count and
high-water remain unchanged, so its cache accepts obsolete history.

Two real SQLite probes build valid events using SemanticEventDraft in executions
`audit` and `other`, warm the eight-event audit cache, then use an independent
connection to UPDATE OR REPLACE either an event or its operation into audit.
The uncached reader rejects the inconsistent durable identity/linkage; the
cached reader returns eight events. A diagnostic confirms audit's revision
remains zero before and after. No cached object or Python authority is modified.

Fix direction: invalidate both source and destination execution identities for
UPDATE, including replacement conflicts, then cover UPDATE/INSERT/DELETE and
both replacement forms with distinct-execution and same-execution cases.
Existing v3 databases must receive any updated trigger definition on reopen.
This violates BC-349-01 and AC-349-06/07's out-of-band mutation contract.

### [P2] Existing v2 stores report unavailable through startup status

Unchain `src/unchain/persistence/sqlite_read_v2.py:144-150`; PuPu consumer
`unchain_runtime/server/memory_v2_unchain_read_adapter.py:684-707`.

Owner admission now recognizes v2, but the status reader accepts only v3.
The real PuPu status adapter only bootstraps when the database is absent;
it neither migrates nor otherwise supports an existing v2 store. This is a
separate entry point from the runtime host constructor fixed previously.

The probe creates real Context/Memory stores and a durable event, confirms
status is available, restores the old {1,2} schema while preserving the data,
then calls the actual PuPu status adapter. It raises PupuUnchainMemoryV2ReadError
with `Context V2 database schema is unsupported`. A diagnostic confirms status
becomes available again after explicitly constructing the migrating store.
The observed impact is unavailable startup Memory status until migration; no
claim is made that all chat execution is permanently blocked.

Fix direction: make existing-store startup status compatible with the supported
upgrade sequence, either through the sanctioned migration entry point or an
explicit supported read-only old-schema path. Keep unknown versions rejected.
This leaves the BC-349-05 existing-store admission sequence incomplete.

### Fresh evidence

- Unchain Python 3.12 Context V2: **1459 passed, 1 skipped, 1 xfailed**.
- Combined PuPu boundary/runtime/context/worker, full Memory routes, and the
  previous eleven cache probes: **85 passed**.
- New independent probes: **3 failed** (two variants of P1 and one P2).
- Prior specific v2 host migration, INSERT OR REPLACE and atomic-read probes
  remain green. They do not cover these additional paths.

Reproduce from the PuPu ticket clone:

```bash
PYTHONPATH=/Users/red/Desktop/GITRepo/unchain/src:unchain_runtime/server:unchain_runtime/server/tests \
  python -m pytest docs/implementation/ticket-349-evidence/test_tool_cache_final_reaudit.py -q --tb=short
```

Only this report and independent regression tests were added during re-audit;
no production code, live database or sidecar was modified. No commit was made.
Do not treat the previous benchmark as correctness evidence. SQL transaction/
byte/write counts, peak cache memory and the broader differential sequence
matrix remain incomplete as previously documented. AC-349-09 still requires
the fixed candidate/wheel/manifest, package smoke and restarted-sidecar probe.
Keep #349 In Progress.
