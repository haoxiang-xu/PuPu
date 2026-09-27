# Memory V3 closeout — 2026-09-27

Ticket #349; Release #216. Integrated PuPu dev `8450a98cb841e5c695552c5e3d44819990ab727d`.

## Result and delivered behavior

- Run-local context views reuse a verified durable prefix and read the new suffix. Durable tool calls/results still commit before dependent model calls. No auxiliary LLM is introduced for tool append.
- Memory organization runs in a supervised background worker after durable enqueue; slow organization no longer holds foreground completion. Fencing, deletion, retry and restart remain authoritative.
- Independent preparation is deferred; required authorization, durable input and context validation remain before model dispatch.
- Default context uses required instructions/task state, canonical ordered conversation, valid checkpoint and complete tool groups within budget. Older memory is read explicitly when needed.
- Default activity labels are localized plain language. Actual background jobs are discovered only when conversation details open, scoped to the message root run. Pending jobs poll only while their details are open; terminal, failed and unavailable outcomes stop polling. No invented retrieval event or extra per-turn lookup.

## Final controlled cache comparison

Same final9 wheel, real temporary SQLite, identical fixtures, 5 warmups + 30 measured samples per cell, alternating mode order by fixture. Units are milliseconds; total is request factory + compiler, not network/model/whole-turn time. The timed section excludes fixture setup and tool durable append; structural SQL diagnostics include the single continuation append. Raw samples: [benchmark](closeout-cache-benchmark-2026-09-27.json).

| History turns | Scenario | Off median | On median | Saved median | Off p95 | On p95 |
|---:|---|---:|---:|---:|---:|---:|
| 1 | unchanged_history | 7.403 | 9.366 | -1.963 | 23.854 | 10.374 |
| 1 | tool_continuation | 14.044 | 15.844 | -1.800 | 15.956 | 17.788 |
| 25 | unchanged_history | 81.215 | 51.112 | 30.103 | 93.631 | 54.805 |
| 25 | tool_continuation | 85.069 | 74.060 | 11.009 | 89.002 | 109.586 |
| 100 | unchanged_history | 320.654 | 182.245 | 138.409 | 412.818 | 194.407 |
| 100 | tool_continuation | 313.988 | 249.570 | 64.418 | 354.695 | 266.931 |

At 100 turns, unchanged-history SELECTs fall 404→14 and returned bytes 519,671→3,867; tool-continuation SELECTs 414→22 and bytes 526,013→6,442. Full snapshots per warm preparation fall 2→0. Read transactions increase 5→9 because integrity and tail checks are small separate reads; this is not a claim that every SQL count falls. Tool writes remain one transaction/two statements in both modes. One-turn medians regress about 2 ms; 25-turn tool p95 is worse in this sample. Cache improves long-history medians, not every latency percentile.

## What each step saved

| Step | Evidence-supported result |
|---|---|
| Timing logs | Observability only; no speedup attributed. |
| Cache | Earlier 100-sample checkpoint: 100-turn unchanged 298.63→181.91 ms; tool 299.18→250.76 ms. Final same-wheel results above corroborate scale, not an additive extra gain. |
| Background organization | Controlled foreground 112.272→89.918 ms without injected wait (22.354 ms saved). With a synthetic 1,000-ms worker delay: 1,149.664→88.285 ms (1,061.379 ms saved). The fixed second was a test fixture, never a product wait. |
| Defer independent work | About 1.26 ms moved for the first request and 0.07 ms for the second. End-to-end admission 45.152→46.507 ms / 57.819→61.679 ms: no measured total speedup. |
| Conservative context | Correctness/structure verified; no isolated matched wall-time delta established. |
| Plain labels/lazy details | No claimed speedup. Collapsed details initiate no job reads. |

These cells overlap and must not be summed. The original 18.432-s sample remains 6.047 s pre-run, 1.575 s before provider dispatch, 10.740 s provider request-through-finish and 0.071 s final tail. Provider duration is completion, not first token. The 6.047 s is still unattributed/outside this closeout. A matched old-vs-new full-app TTFT/completion comparison was NOT_RUN; no total-percentage or “18 s→3 s” claim is supported.

## Verification on the integrated candidate

- PuPu server: 2,601 passed, 17 skipped, 3,590 subtests passed. Two warnings retained: intentional invalid-signature fixture serialization; graph-test cleanup thread without UNCHAIN_DATA_DIR. Neither was hidden or counted as a failure-free warning log.
- Core Context V2: 1,500 passed, 1 skipped, 1 xfailed, imported only from the fixed wheel under the artifact guard.
- Renderer: 85 passed across 8 suites, including actual Python/IPC-produced job fixture, foreign owner/run, stale revision, unknown status, unmount and polling stop.
- Electron rollout/startup compatibility: 68 passed; .js wrapper and .cjs implementation remain paired.
- Full locale scan: no missing locale keys, orphan keys, placeholder mismatches or new missing English key. Existing dynamic-key blind spots remain.
- Frozen arm64 sidecar: all 5 package smoke checks pass, source overrides cleared, exact manifest verified.
- Real isolated Electron + GPT-4.1 after sidecar restart (PID 81736→24328): ordinary reply 3.417 s; explicit memory_propose turn 5.926 s. One actual durable proposal for the new chat was applied by a completed background job. English/dark and Chinese/light UI show prepared conversation and completed organization from those records. These two different prompts are supplementary completion timings, not an A/B benchmark.
- Earlier final9 live restart/explicit memory_list/tool continuity evidence remains applicable to unchanged core bytes; current full regression rechecks the integrated PuPu pair.

## Closeout regression found and repaired

The additive legacy Context host uses physical events/cursors for read(), but projected logical events/cursors for capture_snapshot(). A cached physical suffix could append an internal context.build record to a logical snapshot, causing the second unavailable-build retry to fail receipt validation. The legacy binding now explicitly uses FullJournalSnapshotSource. Production Unchain-owned context retains the verified incremental cache. Existing idempotent unavailable-build test was red before this fix; 103 adapter/repository/reference/guard tests passed afterward. An attempted SQL receipt-name compatibility change did not solve this and was removed.

## Boundary evidence and limits

BC-349-01/02/03/05/06 and SEQ-349-01..08 retain the fixed-wheel context, worker, deferred-work and recovery matrices documented in prior checkpoints; see full current server/core regression logs. BC-349-04 / AC-349-08/09 / SEQ-349-09 add real listJobs→IPC→renderer consumption: OPEN page extensions, strict owner/root-job identity, positive monotonic revision and closed status values; missing/unknown/failure remains unavailable, never success. Legacy snapshot fallback is the AC-349-04 retry compatibility case.

This is an unsigned diagnostic candidate, not a signed installer or release certification. Artifact identity is recorded in closeout-identity-2026-09-27.json. No user rollout or merge is claimed. Raw provider responses in this evidence are synthetic test content; private settings and credentials are excluded.
