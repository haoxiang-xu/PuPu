<!-- release-feature-audit:v2 -->
## Issue feature audit — 2026-09-25
Release: #216 (v0.1.12)
Scope: #349 first slice only — run-local committed-journal cache. This is not acceptance of the rest of Memory V3.
Overall: FAIL
Cross-boundary evidence: INCOMPLETE

1. i18n: PASS — full scan, 815 English keys, all 10 other locales have zero missing/orphan/placeholder mismatch; zero missingInEn. Existing 65 dead-key candidates and 48 dynamic calls are out-of-scope static-analysis observations, not regressions.
2. UI: N/A — this slice adds no UI or user-facing labels.
3. model × agent builder: N/A — no model selection/schema change; graph/subagent runtime parity is still required under the runtime checks below.
4. static rules: PASS — scoped backend change, no renderer IPC, localStorage, router, styling, or Electron test-twin changes. This does not imply runtime correctness.
5. end-to-end: FAIL — two reproduced correctness/lifecycle regressions; exact candidate/wheel/manifest verification and real-app probe remain NOT_RUN.

Candidate digest: NOT_BUILT / NOT_VERIFIED (no delivered artifact acceptance)
Unchain wheel SHA-256: NOT_BUILT / NOT_VERIFIED
Runtime manifest digest: NOT_VERIFIED for a built artifact pair
Audited source-input manifest digest (provenance only, not a delivered candidate): sha256:9163c72538900a59cd476c7a3f204c03341a3076da1fdc2693c856ca369b4742
Source heads: PuPu 2b8cb2e197d4c873bf9e78c8688e4c21e9457947; Unchain 1c54e19a5d733ccf5a87e085774b0c42c62dd901, both with the scoped uncommitted candidate inputs. No commits or production-code edits were made during this audit.

### Findings

**[P1] Global registry permanently retains completed-run snapshots.**
Unchain `src/unchain/context/journal_view_cache.py:120-159` stores a strong cache value in a WeakKeyDictionary; that cache strongly references its journal at line 171. The global root therefore keeps the weak key alive through its value. Dropping every caller reference and forcing garbage collection leaves both journal and cache alive. Every new bound journal can retain a complete history plus its store for the life of the sidecar, with no global capacity bound. This violates first-slice step 4 and the report's claimed run-local lifecycle. Fix the ownership graph (for example, bundle-owned cache with a weak-value lookup) and prove collection after completed/cancelled/failed runs.

**[P1] A valid tail cursor does not establish that the cached prefix still matches durable state.**
Unchain `src/unchain/context/journal_view_cache.py:237-246` accepts an empty tail and immediately returns the cached prefix. The SQLite tail API checks only the high-water row's event ID; it does not detect deleted/changed earlier rows. In a temporary real SQLite store, cache events 1 and 2, delete durable event 1 while retaining event 2: a full snapshot raises `JournalSnapshotError: journal snapshot must be a complete contiguous prefix`, but the warm cache returns both events, including the deleted event. This is durable-boundary fault injection, not trusted in-process object tampering; it does not assert normal deletion APIs perform partial deletion. The existing plan explicitly requires reset/deletion/corruption not to reuse stale state. Add a verifiable store/prefix invalidation contract appropriate to that requirement and tests before claiming parity.

**[P2] Performance control and sample labels do not support the published before/after claim.**
Unchain `journal_view_cache.py:91-99` makes FullJournalSnapshotSource normalize a full snapshot for both consumers. The original factory normalized once, while the original coordinator captured directly and normalized in `_prepare_journal_view`. The new control adds another full conversion/validation before that coordinator validation, making the baseline slower.
A 100-turn interleaved diagnostic (2 warmups, 10 measurements per mode, same fixture and process) measured:
- Original path-equivalent source adapters: median 326.914 ms.
- Reported cache-off control: median 377.860 ms.
- Warm cache: median 193.148 ms.
This supports a real improvement, but demonstrates that the control is biased; the small diagnostic is not a replacement release benchmark.

PuPu `docs/implementation/ticket-349-evidence/benchmark_step1.py:363-379` measures the new-tool-result build once per fixture, then runs all 100 measured repetitions against unchanged history. Thus 46.1% describes unchanged-history replays against the slower new control, and 28.4% is one new-tail observation, not a 100-sample tool-continuation result. Per-sample raw data is discarded. SQL transaction/write counters, bytes read, peak cache memory, and complete parity comparisons requested by the plan are absent. Re-run with an equivalent original control, 100 independently prepared committed-tail samples, raw samples, median/p95, and the planned counters.

### Evidence and acceptance gaps

Fresh audit runs:
- Scoped Unchain factory/coordinator/cache/adversarial/task-state suite: **61 passed**.
- PuPu Memory V2 Unchain runtime/context/worker suite: **32 passed**.
- New temporary-SQLite acceptance probes: **2 failed, 1 passed**. The failures are the registry retention and stale deleted-prefix cases above; the committed append-only tail exactly matches a full durable snapshot.
- Previous implementation run reported **1452 passed, 1 skipped, 1 xfailed**; that whole suite was not rerun during this audit. Passing it did not cover the two new failures.

Reproduction artifact: `docs/implementation/ticket-349-evidence/test_tool_cache_acceptance.py`.
Run from the PuPu candidate with the candidate Unchain on PYTHONPATH:
`PYTHONPATH=/Users/red/Desktop/GITRepo/unchain/src python -m pytest docs/implementation/ticket-349-evidence/test_tool_cache_acceptance.py -q`.
It touches temporary SQLite databases only.

The first-slice plan step 5 also requires exact cache-on/off canonical messages, envelope, provider wire, durable write order/count, two sequential tools, large artifact output, incomplete pair, failed append, eviction, identity/gap, restart, approval/retry, interaction and graph/subagent cases. The two added cache unit tests and passing existing tests do not establish this differential matrix. Those unproved cells remain NOT_RUN, not PASS.

BC-349-01/02/05 and SEQ-349-02/03/05 remain pending the associated AC evidence; the prior report's grouped references do not supply it. The exact PuPu candidate plus one reused Unchain wheel, imported manifest, package smoke and restarted-sidecar app probe have not been verified. The live sidecar was not restarted or modified: concrete source defects already make this candidate NO-GO, and probing the unchanged live sidecar would test old code.

Recommendation: fix the two regressions, correct the benchmark control and sampling, add the planned differential/recovery evidence, then rerun acceptance. Keep #349 In Progress; do not mark Done or advance to In Review.
