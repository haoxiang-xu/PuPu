<!-- release-feature-audit:v2 -->
## Issue feature audit — 2026-09-26

Release: #216 (v0.1.12). GitHub direct parent and Project Size=Release verified.
Scope: #349 first slice, including the new revision triggers and schema admission.
Overall: FAIL — source-level correctness defects are repaired, but the required
immutable candidate/wheel/manifest and restarted-sidecar evidence remains open.
Project Status: In Progress (verified; unchanged).

This audit originally found three reproducible correctness failures. The repair
below has been rerun against the same real-SQLite fault-injection probes.

1. i18n: PASS — fresh full scan: 815 English keys; ten other locales have zero
   missing/orphan/placeholder mismatch; zero missingInEn. Existing 65 dead-key
   candidates and 48 dynamic uses remain outside this backend feature's diff.
2. UI: N/A — no renderer or new user-facing strings.
3. model × agent builder: N/A — no model-selection/provider-schema change.
4. static rules: PASS — scoped backend changes; both repositories pass
   `git diff --check`; no Electron test-twin or frontend rule changes.
5. end-to-end: FAIL — source-level paths pass, but the exact built pair and
   restarted real-app probe remain NOT_RUN.

Candidate digest: NOT_BUILT / NOT_VERIFIED
Unchain wheel SHA-256: NOT_BUILT / NOT_VERIFIED
Runtime manifest digest: NOT_VERIFIED for a built artifact pair

### Resolved [P1] Existing v2 databases are rejected before their migration can run

Location: PuPu `unchain_runtime/server/memory_v2_store_boundary.py:36` and `:158`.

Changing the sole admitted version set to `{1,2,3}` makes a valid existing
`{1,2}` store incompatible. `PupuUnchainHostFactory` calls owner admission at
`memory_v2_unchain_runtime_factory.py:547` before constructing the migrating
`SQLiteContextV2Store` at `:574`. The upgrade is therefore unreachable through
the normal host entry point. New-empty-store tests do not cover this path.

A real temporary database with a durable event and the exact prior schema
(v3 triggers/column/version removed) is readable by the journal, but
`open_context_v2_owned_store` rejects it with `ContextV2StoreBoundaryError`;
the migration opener is never called.

The existing route regression
`MemoryV2RouteTests.test_chat_delete_with_off_routes_to_the_persisted_unchain_owner`
also now returns **503 instead of 200** for its persisted v2 store. Restoring only
the prior `{1,2}` admission constant in a diagnostic process makes that existing
test pass, isolating the regression. This was not applied to production files.

Fix verified: owner inspection recognizes both known `{1,2}` and current
`{1,2,3}` Unchain schemas. The real old database now reaches the existing store
migration with its durable event retained; unknown/mixed schema tests remain
fail-closed. The prior persisted-v2 delete route also passes again.

### Resolved [P1] INSERT OR REPLACE bypasses the invalidation revision

Location: Unchain `src/unchain/persistence/sqlite_v2.py:841–879`.

The new triggers cover UPDATE and DELETE only. On an independent SQLite
connection with the default `recursive_triggers=0`, `INSERT OR REPLACE` does not
invoke the DELETE triggers for the replaced row. No INSERT trigger covers the
replacement, so the revision remains zero.

Two fault-injection probes warm an eight-event cache, then replace either the
first event payload (leaving its stored digest unchanged) or the corresponding
operation target. In both cases the full durable snapshot rejects the corrupted
state, while the warm cache returns all eight old events. These are temporary
durable-database writes, not in-process cache mutation.

Fix verified: `BEFORE INSERT` replacement triggers detect an existing conflicting
event or operation before SQLite removes it, so the revision advances even with
`recursive_triggers=0`. Both independent-connection replacement probes now
force the normal full snapshot, which rejects the corrupted durable row.

### Resolved [P1] Retry can associate an old snapshot with a newer mutation revision

Location: Unchain `src/unchain/context/journal_view_cache.py:253–264`.

When the initial before/after revisions differ, `_capture_full` retries once.
It then stores the revision read after that retry without proving that no
mutation occurred during the retry. If another writer commits between the
second snapshot and revision read, an old snapshot is marked current at the new
revision. Later calls cannot detect the stale prefix.

A deterministic interleaving test delegates every read to the real SQLite
journal and commits through another SQLite connection after each of the first
two snapshots. The first commit triggers the retry; the second corrupts a
cached event. The ordinary full reader then rejects it, but the initial and
subsequent cached reads both accept eight events, with only two actual full
reads. The wrapper schedules writes only; it does not fabricate snapshot or
revision values or mutate cached objects.

Fix verified: the journal now exposes one snapshot-plus-revision operation and
SQLite returns the pair in a single read transaction. The interleaving probe
commits corrupt data immediately after that pair returns; on its next use the
cache observes the earlier revision, falls back, and rejects the corruption.

### Fresh repair verification

- Unchain Context V2: **1459 passed, 1 skipped, 1 xfailed**.
- PuPu owner-boundary/runtime/context/worker: **43 passed**.
- PuPu persisted-v2 owner route: **1 passed**.
- Cache acceptance, corruption, schema-upgrade, replacement and interleaving
  probes: **11 passed**.
- Fresh 100-sample benchmark hash:
  `1f7333c47783147523a3323c271db26b830b1c3745c86b3a4449f34adda1ff6e`.

From the PuPu candidate root:

```bash
PYTHONPATH=/Users/red/Desktop/GITRepo/unchain/src:/Users/red/Desktop/GITRepo/pupu-349/unchain_runtime/server \
  python -m pytest \
  docs/implementation/ticket-349-evidence/test_tool_cache_revision_audit.py \
  -q --tb=short
```

The repair changes production source in the isolated workspaces; the live
sidecar remains untouched. No commit was created.

The previously measured long-history speedups are not recomputed here and do
not establish correctness. The first-slice plan's full differential matrix,
SQL transaction/write/byte counters and peak cache memory remain incomplete.
The recorded one-turn ~1 ms slowdown remains a known performance tradeoff.

BC-349-01/02/05 source mutation/recovery/admission evidence is now PASS. The
exact candidate/wheel/manifest, package smoke and restarted-sidecar app probe
remain INCOMPLETE, so this is not an audit PASS or a rollout approval.
