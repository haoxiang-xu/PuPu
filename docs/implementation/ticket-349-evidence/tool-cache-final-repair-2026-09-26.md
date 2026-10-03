# #349 — repair of independent re-audit findings, 2026-09-26

Scope: the two defects recorded in the independent re-audit. Both are repaired
at source level. This is not a whole-ticket feature-audit PASS; #349 remains
In Progress under Release #216.

## P1: destination invalidation and existing v3 upgrade

The event and operation UPDATE triggers now advance the revision for both
OLD.execution_id and NEW.execution_id. This handles UPDATE OR REPLACE with
recursive triggers disabled as well as enabled. A same-execution update advances
that execution once; an ordinary durable append and idempotent replay continue
to leave the mutation revision unchanged.

Store initialization checks the installed UPDATE trigger definitions and replaces
the earlier definitions in the same migration transaction. When upgrading them,
it also advances existing executions' revisions once: caches acquired under the
old definitions cannot prove that their prefix is still current. Reopening an
already upgraded store does not advance revisions or force a full history read.

## P2: startup status before runtime migration

The Unchain read-only status reader explicitly accepts the known {1,2} and
{1,2,3} schemas, whose health-query tables are compatible. It reports the actual
schema version (2 or 3) and performs no migration or durable write. Runtime
construction still performs the migration to v3 before cache use. Unknown and
partial version sets remain rejected. PuPu's actual startup status adapter now
works for old stores before any host has been constructed.

Two PuPu status tests still expected version 2 from a newly constructed store;
they now assert 3. Separate old-store coverage remains in the independent probe.

## Evidence

Before the repair: the three independent probes failed; the two fresh-store
version assertions also failed. After the repair:

- Unchain Python 3.12 Context V2: **1476 passed, 1 skipped, 1 xfailed**.
- PuPu owner boundary, runtime factory/context/worker, read adapter, full Memory
  routes and all fourteen historical/independent acceptance probes:
  **101 passed**.
- Seventeen new core tests cover same/cross-execution UPDATE OR REPLACE for
  events and operations with recursive_triggers=0/1, upgrading old v3 triggers
  with a surviving warm cache, ordinary append/replay/unchanged reopen, and
  read-only status for known and unsupported version sets.
- Both source trees pass `git diff --check`.

Impact analysis used the Unchain index at 1c54e19 in the paired checkout.
SQLiteContextV2Store._initialize resolves to LOW, with its constructor as the
one direct caller and no indexed processes. Status-reader callers are UNKNOWN
in the graph; source inspection confirms PuPu's startup status adapter calls
it. The two modified PuPu test symbols are unindexed; their pytest definitions
were verified directly. No absence of graph edges was treated as safety proof.

BC-349-01 / SEQ-349-05 / AC-349-06/07: the reproduced destination invalidation
and old-trigger upgrade paths pass. BC-349-05 / AC-349-07: known old-store status
is compatible, read-only, and reports its actual version; unsupported schemas
are refused. BC-349-02: normal append/replay and cached/full snapshot parity
remain covered. These results do not assert completion of the broader planned
provider-wire, recovery and scope differential matrix.

The earlier 100-sample benchmark was not rerun for this repair and is historical
evidence for its measured source. No new speedup claim is made. Required SQL
transaction/write/byte counters and peak-cache-memory evidence remain open.
AC-349-09's fixed PuPu candidate, one reused wheel, runtime manifest digest,
package smoke and restarted-sidecar app probe are still NOT_RUN. The live
sidecar was not restarted; Python changes require restart before app testing.
No commit, push, publication or active rollout occurred.
