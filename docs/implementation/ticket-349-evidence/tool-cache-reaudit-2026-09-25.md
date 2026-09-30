<!-- release-feature-audit:v2 -->
## Issue feature audit — 2026-09-25 (repair re-audit)

Release: #216 (v0.1.12), direct relationship and Size=Release verified.
Scope: #349 first slice, run-local committed-journal cache, not all Memory V3 work.
Overall: FAIL

This supersedes the preceding repair comment's **Source-level result: PASS**.
The memory retention and deleted-prefix regressions are fixed, but the durable
integrity check is still weaker with caching enabled.

1. i18n: PASS — fresh full scan: 815 English keys, all ten other locales have
   zero missing/orphan/placeholder mismatch; zero missingInEn. Existing 65 dead-key
   candidates and 48 dynamic calls are unchanged static-analysis limitations.
2. UI: N/A — no UI or labels in this slice.
3. model × agent builder: N/A — no model selection/provider schema changes.
4. static rules: PASS — backend-only scope, no renderer IPC/localStorage/router,
   styles or Electron twin tests. Both repositories pass `git diff --check`.
5. end-to-end: FAIL — reproduced durable-integrity regression; exact artifact
   pair and real-app probe remain NOT_RUN.

Candidate digest: NOT_BUILT / NOT_VERIFIED
Unchain wheel SHA-256: NOT_BUILT / NOT_VERIFIED
Runtime manifest digest: NOT_VERIFIED for a built artifact pair
Project Status: In Progress (verified; unchanged).

### [P1] Cached prefixes bypass existing durable integrity checks

Location: Unchain `src/unchain/persistence/sqlite_v2.py:2496–2505`, with cached
reuse in `src/unchain/context/journal_view_cache.py:208–212`.

`snapshot_prefix_is_current` reads only sequence, event ID and the stored event
digest. The existing `_event_from_row` also verifies actual event bytes against
that digest, indexed generation/attempt/type/operation fields, and the durable
operation record. Those checks are skipped for a reused prefix.

Three independent temporary-SQLite fault injections reproduce the mismatch:

| Mutation after warming the cache | Full durable snapshot | Warm cache |
| --- | --- | --- |
| Replace old event_json with `{}`, leave stored digest unchanged | Rejects: event digest changed on disk | Accepts |
| Change old generation_id column | Rejects: indexed fields changed | Accepts |
| Change associated operation target_key | Rejects: operation payload or target changed | Accepts |

These mutations use a separate SQLite connection and do not modify Python cache
objects. They exercise the already-declared reset/corruption/identity contract,
not hypothetical in-process attacker isolation.

The issue reaches the actual request factory/compiler path: using a three-turn
SQLite fixture plus a committed tool pair, corrupting the first event makes the
original cache-off path reject. The cache-on path still compiles **8 messages**.
No provider call is made by this probe.

Required fix: preserve the full durable integrity contract when deciding a
prefix is reusable, including bytes, indexed identity and operation linkage.
A store invalidation design may optimize this, but merely comparing stored
digest columns is insufficient evidence that the underlying records are valid.
Re-run performance measurements after the correctness fix.

### Acceptance evidence still missing

First-slice plan steps 1, 5 and 6 require exact cache-on/off canonical messages,
envelope digest, provider wire and durable write order/count, with sequential
tools, artifact output, incomplete pairs, failed append, retry/approval,
resume/restart and graph/subagent cases. Existing broad tests and the benchmark's
nonempty-output assertions do not establish this differential matrix.

The corrected benchmark fixes the biased control and independent committed-tail
sampling. The saved JSON contains 100 raw samples per mode/scenario/tier and p95.
It still omits the planned SQLite transaction/write counts, bytes read, and peak
cache memory. Zero full snapshots does not mean zero SQL access: each warm cache
capture performs a prefix query and a tail transaction. Document the complete
counts before claiming reduced database round trips.

The earlier benchmark is accepted as provisional timing evidence, not proof of
correctness or final post-fix performance. Its `1/25/100-turns` labels refer to
conversation turns (multi-event histories), not exactly 1/25/100 journal rows.
Raw JSON SHA-256: `0d266fe7d3151d65d8d0e296e8c6d951b2c4aea1b2101f9bfb5fd7166ef02bc2`.

### Fresh verification

- Unchain Context V2 suite plus prior acceptance probes: **1457 passed,
  1 skipped, 1 xfailed** (1454 suite tests + 3 prior probes).
- PuPu Memory V2 runtime factory/context/worker: **32 passed**.
- New integrity probes: **4 failed**. They remain failing tests as reproduction
  evidence; production code was not changed during this audit.
- GitNexus context inspection used the Unchain index at commit `1c54e19`, indexed
  2026-09-25T17:24:44Z. New uncommitted cache/prefix symbols were verified directly
  in the working source; graph output is not proof of their current callers.

Reproduce from the PuPu candidate root:

```bash
PYTHONPATH=/Users/red/Desktop/GITRepo/unchain/src python -m pytest \
  docs/implementation/ticket-349-evidence/test_tool_cache_integrity_reaudit.py \
  -q --tb=short
```

BC-349-01/02 and their corruption/identity ACs are NO-GO on the current source.
BC-349-05 exact candidate/wheel/manifest, package smoke and real-app verification
remain INCOMPLETE. No rollout, signing or production-traffic requirement is being
added. The confirmed source defect already blocks PASS; the unchanged live
sidecar was not used as evidence for this candidate.
