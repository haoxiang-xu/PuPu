<!-- release-start-ticket:v1 -->
## Cache checkpoint closed locally — 2026-09-26

The current run-local journal cache slice now has final-candidate timing, SQL/read-volume and allocation measurements, plus explicit full-history/cache differential evidence. No additional production logic changed during this closeout. Keep #349 **open / In Progress**; this is not whole-ticket acceptance or release approval.

One diagnostic wheel was built once from a frozen dirty-source snapshot and reused throughout:

- Wheel SHA-256: `03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`
- Actual imported manifest: `sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`
- Frozen PuPu source-pair digest: `70de3084df8e8e33ef7432b143437c1dd4617aa45e978f10c8337967f6262078`

Final guarded tests: **1,499 passed, 1 skipped, 1 xfailed** for Context V2 plus 23 new differential cases; **195 passed** for PuPu admission/runtime/active-host/graph/protocol paths and prior defect reproducers. Runtime modules were checked against the fixed wheel. Differential cases cover tools, >128 KB artifact output, duplicate replay, consecutive approvals, cold resume, eviction/reopen, graph and subagent scope. Exact provider-wire bytes agree for OpenAI, Anthropic, Gemini, Ollama and Hyperspace before/after a tool pair. No live provider requests were sent.

Python 3.12.11, 100 measured repetitions after 10 warmups per cell, no tracing during timing:

| History | Tool continuation median off → on | Saved | Unchanged history median off → on |
|---|---:|---:|---:|
| 1 turn | 12.383 → 14.568 ms | **−2.185 ms (regression)** | 6.220 → 8.189 ms |
| 25 turns | 83.511 → 72.329 ms | 11.182 ms / 13.4% | 76.227 → 51.211 ms |
| 100 turns | 299.176 → 250.762 ms | 48.414 ms / 16.2% | 298.632 → 181.909 ms |

These measure factory + compiler after the tool result is committed, not end-to-end dispatch, TTFT or streaming. Both long-history p95s improve. Short-history overhead is explained by the additional integrity queries and is retained as an explicit tradeoff.

Warm full-history snapshots decrease **2 → 0**, but total read transactions increase **4 → 8**. At 100-turn continuation, SELECTs decrease **413 → 21**, and returned logical value bytes **526,013 → 6,442**. This is not physical disk I/O. Context-build writes remain **1 transaction / 2 statements**; tool write durability is unchanged. The 100-turn tool fixture retains about **0.54 MiB** of newly allocated Python memory after cache acquisition, with **1.47 MiB** acquisition peak. The 32 MiB configuration limit bounds serialization, not resident memory.

Reports, raw samples, test logs, identity records and replay scripts are retained under `docs/implementation/ticket-349-evidence/cache-checkpoint-*` in the implementation workspace. The plan now describes the actual complete JournalSnapshot v1 cache rather than a proposed new serialized delta protocol.

BC-349-01/02 and the local cache portions of AC-349-02/03/06/07 and SEQ-349-02/03/05/06 have fixed-wheel evidence. **BC-349-05 / AC-349-09 remain INCOMPLETE** for official release artifacts, package smoke and restarted-sidecar application verification. Full host timing remains for final application validation. The next approved slice is background memory organization. No commit, PR, sidecar restart, rollout or ticket closure occurred.
