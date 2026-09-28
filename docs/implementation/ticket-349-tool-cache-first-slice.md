# Ticket #349 — first implementation slice: run-local committed-event cache

## Outcome and boundary

Reduce repeated SQLite history reads during a **warm tool continuation in one active Context V2 execution**, then measure the change before taking on another Memory V3 feature. Keep the existing durable writes for tool intent, execution start, result, artifacts, provider receipts, and context builds. The cache is a disposable read optimization, never an authority to execute a tool or claim that a result was saved.

This slice does not change Memory Agent scheduling, default retrieval, compaction policy, UI wording, or the provider message contract. It does not reuse cached state across a sidecar restart or a new execution. Existing cold/full behavior remains available as a fallback.

The current path calls `JournalContextRequestFactory.__call__()` and `ContextCompileCoordinator.compile()` for each model turn; both capture a complete SQLite journal snapshot. The step-1 fixture measured **two full snapshots** and warm tool-continuation medians of **11.50 / 84.04 / 309.50 ms** at 1 / 25 / 100 prior turns. This is a local-context baseline, not an estimate of the screenshot's 6.047-second pre-run stage.

## Implementation steps (English)

1. **Pin a comparable control.** Extend the existing step-1 fixture to count complete snapshot calls, bounded tail reads, SQLite read/write transactions, events and bytes read, and time spent preparing context. Run the unchanged path and save raw per-sample data. Keep counters separate from timed samples if tracing itself changes timing. Use the same fixed conversation/tool-result fixtures, budget, provider schema, and Python runtime for both modes.
2. **Add a bounded run-local read cache in Unchain.** On the first model turn, load one authoritative `JournalSnapshot` v1. Hold its exact store/execution/generation identity, high-water cursor, event digests, and immutable complete event prefix only for the active execution. At the next model turn, use the existing `BoundExecutionJournal.read(after=cursor, limit=...)` inside its SQLite read transaction to obtain a small verified suffix. Accept it only if the cursor matches, event sequence is contiguous, identities/digests are valid, and `has_more` is false; otherwise capture a fresh full snapshot or fail if the durable store is corrupt. Bound the cache by events and bytes. Do not represent a suffix as a `JournalSnapshot`.
3. **Use one complete view per model turn.** Feed the same verified complete snapshot to the request factory and coordinator so they do not each query SQLite for the full execution. Preserve both components' current authority checks and the v1 snapshot digest/size limits. The existing compiler, compaction decisions, tool pairing, artifact references, and provider projection remain unchanged in this slice. Construct the cached view only from durable events; a failed append never advances it.
4. **Handle lifecycle and invalidation.** Eviction and cold entry rehydrate from SQLite. A foreign append, changed execution/generation, missing cursor, gap, overflow, reset/rebase, deletion, resume, or restart cannot reuse a stale view. A duplicate/idempotent append must not duplicate an event. A tool result becomes eligible for the next model request only after its durable receipt is acknowledged; existing before-execution and after-result commit barriers stay in place.
5. **Prove parity and recovery.** Compare cache-on and cache-off canonical messages, context envelope digest, provider wire, and durable event order for one tool, two sequential tools, a large artifact-backed result, an incomplete pair, approval/retry, interaction resume, and graph/subagent scope. Inject write failure, cache eviction, out-of-band append, wrong identity, gap, and restart. No dependent model request may proceed on an uncommitted or mismatched result. Run the relevant Unchain tests and the PuPu active-host/graph route tests.
6. **Calculate the optimization before expanding scope.** Run at least 100 measured repetitions per mode after 10 warmups for 1 / 25 / 100-turn fixtures. Include a realistic tool-continuation sample where the tool call/result commits before the timed next-context build, plus an unchanged-history control. Report median, p95, absolute delta (`control - cache`) and percentage (`100 × delta / control`) for context preparation and tool-result-to-next-request time. Report full snapshots, tail reads, SQLite read/write transactions, events/bytes read, cache hit/fallback counts, and peak cache bytes. Retain the old 30-sample baseline as context; use the same candidate build with cache enabled/disabled for the primary A/B claim. Do not attribute provider/network time to the cache.

## Pass/fail and next decision

- **Correctness gate:** exact cache-on/off canonical and provider outputs; unchanged durable write count and order; all failure/restart/concurrency cases pass. A warm normal tool continuation should perform **zero full-history SQLite snapshots**; a bounded tail check is allowed. Any mismatch or lost recovery guarantee blocks rollout.
- **Performance gate:** publish raw samples, median/p95 and percentage improvement for all three history sizes. Investigate any short-history regression or long-history p95 regression before rollout. Do not promise a speedup from reduced SQL reads alone: full `JournalSnapshot` validation and message projection may remain CPU-bound.
- **Scope decision:** only after this report decide whether the next slice should cache canonical projection, batch any *safe* transactions, or address another measured bottleneck. This first slice makes no change to write durability or Memory Agent timing.

## Integration and release evidence

Expected touch points: Unchain `context/request_factory.py`, `context/coordinator.py`, a focused run-local cache module, and their tests; PuPu `memory_v2_unchain_runtime_factory.py` only for lifecycle wiring if needed. Prefer the existing journal page API over a new persistence schema. Run GitNexus impact before each edited symbol in PuPu and inspect Unchain callers independently.

This slice implements the relevant parts of **BC-349-01/02/05**, **SEQ-349-02/03/05**, and **AC-349-01/02/03/06/07/09** in the main [ticket plan](ticket-349.md). If an Unchain API or runtime manifest changes, record the exact versioned contract and negative tests there. Before active rollout, test the PuPu candidate against **one built Unchain wheel reused throughout** the contract matrix and package smoke; record its SHA-256 and the actual imported manifest digest. The current live sidecar remains untouched during local benchmarking.

The implemented cache and the cache-on/cache-off benchmark are recorded in
[tool-cache-first-slice.zh-CN.md](ticket-349-evidence/tool-cache-first-slice.zh-CN.md).

Latest repair evidence is in [the 2026-09-26 repair record](ticket-349-evidence/tool-cache-final-repair-2026-09-26.md).
For BC-349-01/05, updates invalidate both old and new execution identities;
reopening an earlier v3 store upgrades its UPDATE triggers atomically and
invalidates views captured under the earlier definitions. Repeated opening of
an already upgraded store preserves the revision. For SEQ-349-05 / AC-349-06/07,
startup health reads support known v2 and v3 schemas without writing, report
their actual version, and reject unsupported sets. Runtime construction retains
responsibility for schema migration. AC-349-09 remains NOT_RUN.

## Local checkpoint closed — 2026-09-26

The fixed-candidate measurements and differential checks are now recorded in
[the closeout report](ticket-349-evidence/cache-checkpoint-closeout-2026-09-26.md)
and [its Chinese explanation](ticket-349-evidence/cache-checkpoint-closeout-2026-09-26.zh-CN.md).
The guarded fixed-wheel runs pass 1,499 core/differential tests and 195 PuPu tests.
All twelve benchmark cells contain 100 measured samples after 10 warmups;
separate SQL and allocation probes are included. At 100 turns, tool continuation
preparation improves by 48.414 ms (16.2%); unchanged history improves by
116.723 ms (39.1%). One-turn overhead is approximately 2 ms.

The implementation shares a cache object, not a single transaction: factory
and coordinator each verify it. Full snapshots decrease from two to zero, but
total read transactions increase from four to eight. Durable writes remain.
No serialized delta protocol or provider-wire change was introduced.

This closes the local cache checkpoint. The diagnostic wheel/source pair has
fixed-identity contract evidence, but AC-349-09 remains INCOMPLETE until official
artifact/package and restarted-sidecar application verification. Whole-host
tool-result-to-dispatch timing is also deferred to that application check; the
new benchmark measures only factory plus compiler after the result is committed.
No ticket closure, rollout or new Memory V3 production slice is implied.
