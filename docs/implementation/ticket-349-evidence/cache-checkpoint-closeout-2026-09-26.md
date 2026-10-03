# #349 — cache checkpoint closeout, 2026-09-26

**Local cache checkpoint: complete. Active rollout / whole-ticket acceptance: INCOMPLETE.**

This closes the current measurement and verification slice. It makes no new production-code change. The next approved slice is background memory organization. #349 remains open and In Progress; no commit, PR, sidecar restart, packaged-app smoke or live-provider run occurred.

## Fixed candidate and scope

One diagnostic Unchain wheel was built once from a copied dirty-source snapshot and reused in every new benchmark and guarded contract test. It is not an official clean-source release artifact. Test processes import directly from that wheel; a per-test guard rejects modules imported from a mutable checkout. A source-inventory test and a subprocess read-only test use a byte-verified extraction of the same wheel.

- Wheel SHA-256: `03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`
- Imported manifest digest: `sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`
- Unchain source snapshot: `a4f340c7043cf85e3e72fd549a657970965882600ccdc9eae277d2cf96d38d37` (base `1c54e19a5d733ccf5a87e085774b0c42c62dd901`, dirty).
- PuPu server/test/contract/resource snapshot: `70de3084df8e8e33ef7432b143437c1dd4617aa45e978f10c8337967f6262078` (base `2b8cb2e197d4c873bf9e78c8688e4c21e9457947`, dirty; this is not a packaged PuPu binary).
- Python 3.12.11 on this Mac. The actual manifest passes PuPu's protocol admission tests, including missing-feature, wrong-version, bad-digest and malformed-manifest negatives. Git provenance is not used for runtime compatibility.

Identity, raw samples and logs: [identity](cache-checkpoint-identity-2026-09-26.json), [1,200 measured samples](cache-checkpoint-results-2026-09-26.json), [core tests](cache-checkpoint-core-tests-2026-09-26.log), [PuPu tests](cache-checkpoint-pupu-tests-2026-09-26.log).

## Performance

100 measured repetitions after 10 warmups per mode × history size × scenario; same wheel, fixtures, provider schema, budget and Python runtime. The cache-off control reproduces the pre-cache factory snapshot clone and coordinator full snapshot. It does not add the extra validation of `FullJournalSnapshotSource`. No SQL tracing or allocation tracing is enabled during timed samples. Test suites ran outside the benchmark interval. Mode order alternates at 25 turns; this is a synthetic local benchmark, not a statistically randomized fleet study.

Times below are milliseconds for **request factory + context compile**. Positive savings mean faster. The tool pair is already durably committed before the measured continuation. Fixture construction, durable tool writes, garbage collection before the sample, provider preparation/send, network and streaming are outside this interval. This is not an end-to-end tool-result-to-network-dispatch measurement or a new TTFT measurement.

| Prior turns | Scenario | Cache off median | Cache on median | Saved ms | Saved % | p95 off → on |
|---|---|---:|---:|---:|---:|---:|
| 1 | unchanged_history | 6.220 | 8.189 | -1.969 | -31.7% | 6.733 → 8.617 |
| 1 | tool_continuation | 12.383 | 14.568 | -2.185 | -17.6% | 12.847 → 15.694 |
| 25 | unchanged_history | 76.227 | 51.211 | +25.016 | +32.8% | 83.299 → 57.571 |
| 25 | tool_continuation | 83.511 | 72.329 | +11.182 | +13.4% | 93.679 → 81.700 |
| 100 | unchanged_history | 298.632 | 181.909 | +116.723 | +39.1% | 324.564 → 195.070 |
| 100 | tool_continuation | 299.176 | 250.762 | +48.414 | +16.2% | 343.477 → 282.104 |

Short-history regression is confirmed, not hidden: roughly 2 ms per context build. Integrity checks add four read transactions while little historical payload is avoided. At 25/100 turns both median and p95 improve. No threshold or transaction batching was introduced during closeout; that would be another production change. The measured tradeoff is recorded before final rollout. This cache cannot remove the previously observed seconds of setup/provider wait.

## SQL reads and durable writes

Separate untimed probes use real SQLite cursors. A read transaction is explicit `BEGIN`; a write transaction is `BEGIN IMMEDIATE`, matching these measured paths. SELECTs and fetched rows count actual operations, including cursor iteration/fetchone/fetchmany/fetchall. A UTF-8/BLOB/NULL/integer self-check verified 8 returned rows / 32 value bytes without double counting.

- Every warm context: **full snapshots 2 → 0**, bounded tail reads **0 → 2**. Cache metrics report two hits and zero fallback/full reload for the measured warm build.
- Total read transactions, including compiler repositories: **4 → 8**. The shared cache is verified separately by the factory and coordinator; it is not one SQL transaction per model turn.
- Unchanged-history context: write transactions **0 → 0**, write statements **0 → 0**.
- First context after a committed tool result: write transactions **1 → 1**, write statements **2 → 2**, changed rows **2 → 2** (context-build persistence). This is not a measurement of the earlier tool commit itself; the durable tool write path was not changed, and its receipts/replay/order are tested below.

| Prior turns | Scenario | SELECTs off → on | Returned rows off → on | Returned value bytes off → on |
|---|---|---:|---:|---:|
| 1 | unchanged_history | 7 → 13 | 7 → 11 | 7,087 → 3,835 |
| 1 | tool_continuation | 17 → 21 | 15 → 15 | 13,392 → 6,395 |
| 25 | unchanged_history | 103 → 13 | 199 → 11 | 131,049 → 3,851 |
| 25 | tool_continuation | 113 → 21 | 207 → 15 | 137,373 → 6,419 |
| 100 | unchanged_history | 403 → 13 | 799 → 11 | 519,671 → 3,867 |
| 100 | tool_continuation | 413 → 21 | 807 → 15 | 526,013 → 6,442 |

“Bytes” means UTF-8 text representations of returned values plus raw BLOB lengths, with NULL contributing zero. It is **not physical disk I/O**, database file size, SQLite pages or operating-system cache misses. At 100-turn continuation returned data decreases about 98.8%, but preparation improves only 16.2%; validation/projection and other context work remain. Raw fixture-setup counters exclude statements executed by schema `executescript` and must not be interpreted as complete migration/write measurements; only the measured warm interval above supports the SQL claims.

## Memory (KiB = 1,024 bytes)

Tracemalloc runs separately from timing. “Acquisition retained/peak” measures newly allocated Python memory during a fresh cache capture after invalidation and GC. It excludes pre-existing journal/runtime objects. “Warm build peak” measures a subsequent unchanged build, including compiler temporaries; in the tool scenario the tail has already been consumed. These are allocation probes, not process RSS or a worst-case stress test.

| Prior turns | Scenario | Snapshot serialized KiB | Acquisition retained KiB | Acquisition peak KiB | Warm build peak KiB |
|---|---|---:|---:|---:|---:|
| 1 | unchanged_history | 1.6 | 20.3 | 25.8 | 51.8 |
| 1 | tool_continuation | 4.4 | 34.1 | 46.2 | 83.6 |
| 25 | unchanged_history | 46.4 | 153.5 | 378.3 | 371.1 |
| 25 | tool_continuation | 49.3 | 162.8 | 401.3 | 392.7 |
| 100 | unchanged_history | 186.9 | 542.1 | 1483.8 | 1434.4 |
| 100 | tool_continuation | 189.8 | 551.4 | 1507.6 | 1458.1 |

The 100-turn tool fixture retains about 0.54 MiB of new allocations after cache acquisition, with a 1.47 MiB acquisition peak. The configured 10,000-event / 32 MiB limits bound the serialized snapshot, **not resident Python memory**. Completed-run collection and overflow/fallback behavior remain covered by the cache tests.

## Correctness and sequence evidence

- **1,499 passed, 1 skipped, 1 xfailed** in the final guarded core run: the existing Context V2 suite (1,476 passing tests) plus 23 new differential cases. Existing skip/xfail remain unchanged.
- **195 passed** in the final guarded PuPu/pair run: owner/store admission, runtime factory/context, worker/read adapter, active host, graph gate/restart/interaction resume, protocol compatibility and the prior defect reproducers.
- 13 runtime/SQLite differential cases shadow each successful factory/compile with the exact full-history path against the **same durable identity and state**, with no ID/timestamp normalization. Whole requests/results, canonical messages and envelopes must match, and shadow replay cannot append journal events. Cases cover normal sends, tools, graph and child scope, artifact-only projection, sync/cold approval resume, consecutive approvals, eviction/reopen, incomplete pairing, a >128 KB artifact and duplicate-result replay. Existing scenario assertions check tool effects, final sends and approval identities.
- 10 additional cases compare **exact canonical provider-wire bytes** for OpenAI, Anthropic, Gemini, Ollama and Hyperspace, before/after a committed tool pair. Real wire preparation is consumed by `ProviderWireEnvelope.from_dict` and catalog validation. These are deterministic provider contract tests, not live requests.
- The full core suite retains mutation, failed-write, gap/identity, concurrent revision, trigger-upgrade rollback, old-v2/v3 admission, unknown-schema rejection and cache collection coverage. No test was removed to obtain a pass.

The first copied-fixture run had a source-inventory path error; the first PuPu collection lacked its registry JSON. Those were checkpoint-layout omissions, not production defects. Required resources and exact wheel-source extraction were added, and both full guarded suites then passed. The wheel was never rebuilt.

## Contract status and handoff

- **BC-349-01/02**, relevant local **AC-349-02/03/06/07**, and the cache portions of **SEQ-349-02/03/05/06** now have fixed-wheel local evidence. The implementation returns complete existing JournalSnapshot v1 records; it does not introduce a serialized delta protocol.
- **AC-349-01**: local warm preparation measurement complete. Full first-dispatch/TTFT/foreground-done and host tool-result-to-dispatch measurements remain for application validation.
- **BC-349-05 / AC-349-09**: a fixed diagnostic wheel and frozen PuPu source pair are verified locally; official clean release artifacts, package smoke, actual restarted-sidecar and live-app evidence are still **NOT_RUN**. No claim of full production rollout readiness.
- Background queue changes, deferred pre-dispatch work, conservative/lazy context and UI wording remain future approved slices. Do not close #349 or reclassify the prior whole-ticket audit as PASS.

Retained checkpoint: `pupu-349/.local/ticket-349-cache-checkpoint/`, including wheel, source manifests, fixed PuPu/test copies, wheel extraction, harness copy and logs. Replay with the recorded Python 3.12 interpreter and [run_cache_checkpoint.py](run_cache_checkpoint.py), `--checkpoint .local/ticket-349-cache-checkpoint --suite core`, `pupu` or `benchmark`. The benchmark writes a separate replay file. Avoid concurrent workloads during performance measurement. Any future runtime change needs a new explicitly identified candidate; preserve this report as the cache baseline.
