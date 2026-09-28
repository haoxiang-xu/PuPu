# Ticket #349 — observed 18.4-second run and timing logs

This is a read-only reconstruction of the run in the project owner's screenshot, followed by a local diagnostic change. It does not send a new provider request, read or reproduce message content, or restart the live PuPu sidecar.

## Evidence and attribution

The screenshot shows 15,905 input tokens, 15,872 cache-write tokens and 19 output tokens. Exactly one provider receipt in the local read-only `memory_v2/context_v2.sqlite3` matched that triplet. Its execution ID identified one chat in the local read-only `chats.db`, whose saved trace contained the stream/run/response/done timestamps below. Neither raw IDs nor content are included here.

| Boundary | UTC timestamp | Time since stream start |
| --- | --- | ---: |
| Stream started | 2026-09-25 16:32:52.387 | 0.000 s |
| Run started | 2026-09-25 16:32:58.434 | 6.047 s |
| Provider call started | 2026-09-25 16:33:00.008 | 7.622 s |
| Provider call completed | 2026-09-25 16:33:10.748 | 18.361 s |
| Response received event | 2026-09-25 16:33:10.810 | 18.423 s |
| Stream done | 2026-09-25 16:33:10.819 | 18.432 s |

The provider call took **10.740 seconds (58.3%)**. The **6.047 seconds (32.8%)** before `run_started` and **1.575 seconds (8.5%)** from run start to provider start need finer timing. The remaining **0.071 seconds (0.4%)** follows provider completion. Provider-call time includes the provider/network and complete response; no first-token timestamp is persisted for this run. `run_started` is emitted after Unchain bootstrap, so the first 6.047 seconds may include admission, graph setup, memory preflight/bootstrap and other local work. It cannot be attributed to SQLite without a finer trace. The current database contains no consolidation job tied to this execution's curation scopes, and the 71-ms post-provider segment is inconsistent with a long synchronous Memory Agent call in this particular run; neither observation proves what would happen in other runs.

## Diagnostic change in the isolated PuPu checkout

`chat_latency_diagnostics.py` now writes a small `pupu.chat_latency.v1` JSON line per `/chat/stream/v4` request, with elapsed time to `run_started`, each `request_messages`, first token/tool/result, and terminal events. It bounds model-turn records at 32 entries and logs only fixed stage names, integer times, outcome, and 12-hex SHA-256 session/attempt fingerprints. It never copies the event payload. The separate graph phase lines measure recipe compilation, active-host preflight, active-chat bootstrap, selected-toolkit construction, full graph setup and worker-to-first-run time. The normal path logs agent setup. Electron's existing runtime-log service relays sidecar stderr lines as text to its runtime-log channel; it does not parse these JSON fields. A diagnostic write failure is swallowed and does not alter SSE output or durable behavior.

These logs will let a reproduced run split the observed 6.047 seconds and the pre-provider 1.575 seconds more accurately. They still do not separate provider queueing, network, prefill and generation; the first visible token can be timed only on future streamed turns. Existing provider receipts remain the authority for provider-call start/end and usage.

Validation: focused privacy/bounded-record/fail-safe tests, v4 route tests and graph-path tests passed (`66 passed, 14 subtests` with source paths set explicitly). The active sidecar is still running the original checkout; these new lines have **not** been observed in a live request. No sidecar restart, product rollout, commit or PR has occurred.

## Follow-up: 14 saved streams and bounded local probes

A second read-only pass matched provider receipt windows to saved stream/run/done frames in **14 completed active-Memory-V2 streams from 8 chats**. No chat content or raw identifiers were exported. In the current chat metadata, five streams belong to chats with only the `core` toolkit selected: stream start to `run_started` was **0.42–0.82 s** (median **0.56 s**). Nine streams belong to chats with four selected toolkits or skill packs: **3.07–8.24 s** (median **4.33 s**). The latter includes the screenshot's **6.05 s**. The provider model alone does not explain this split: three `gpt-4.1-mini` streams include two in the shorter group (0.47, 0.56 s) and one in the longer group (4.29 s). `run_started` to first provider call likewise ranged **0.63–0.84 s** in the shorter group versus **1.55–3.86 s** in the longer group. This is an association, not a causal estimate: toolkit selection is the chat metadata **at inspection time**, not a per-request snapshot, and workspaces, context size and runtime state also differ.

An isolated no-provider probe using the active-host test fixture and temporary SQLite stores measured preflight plus admission setup at median **34 / 67 / 105 ms** for **0 / 25 / 100** bootstrap-history messages; bootstrap itself was **5 / 9 / 22 ms** (three repetitions each). A separate read-only selected-toolkit probe on the local configuration measured median **5.36 ms** for `core` and **0.53 ms** for four instruction-only skill packs over 30 warmed repetitions. These probes do not reproduce the real 3–8 s delay and cannot exonerate other graph setup steps. The four-skill-pack case opens no MCP connection; the four-MCP case can connect synchronously during toolkit construction. The added `graph_user_toolkits` timer will distinguish that candidate from preflight/bootstrap and the remaining graph setup on a future instrumented run.

The saved streams also cover the requested first/second/later-turn comparison with a fixed provider model within each example. In one `core` chat using `claude-sonnet-4-6`, the first and second turns took **0.42 s** and **0.82 s** before `run_started`. In one four-skill-pack chat using `gpt-5.6-luna`, the first, second and a later turn took **3.07 s**, **4.88 s** and **8.24 s** respectively; first-call input rose from **14,098** to **24,420** to **70,168** tokens. Provider-call counts and intervening chat state also changed, so this is a directional comparison, not a controlled experiment.
