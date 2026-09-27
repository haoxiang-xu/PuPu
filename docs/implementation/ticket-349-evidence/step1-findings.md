# Ticket #349 — Step 1 latency baseline

Scope: investigation only. No product code, user conversation, provider request, or Memory Agent model call was changed or executed. PuPu base is `origin/dev` at `2b8cb2e197d4c873bf9e78c8688e4c21e9457947`; the paired Unchain source is `dev` at `1c54e19a5d733ccf5a87e085774b0c42c62dd901`. Measurements ran on macOS 26.6.2 arm64 with Python 3.12.11.

## Reproduce

From `/Users/red/Desktop/GITRepo/pupu-349`:

```sh
/Users/red/Desktop/GITRepo/unchain/.venv/bin/python docs/implementation/ticket-349-evidence/benchmark_step1.py --samples 30 --warmups 3 --turns 1 25 100 --worker-delay-ms 250 > docs/implementation/ticket-349-evidence/baseline-step1.json
```

The fixture uses the real Unchain SQLite Context V2 journal, canonical event ingress, `JournalContextRequestFactory`, and `ContextCompileCoordinator`. It excludes fixture construction from the timing, then times the factory and coordinator on a fresh first build and 30 same-execution replays after three warmups. A separate controlled experiment uses the actual PuPu completion run hooks with an in-process fake Memory Agent host delayed by either 0 or 250 ms. The fake host avoids network/model variability; the 250 ms is an injected delay, not an observed production model latency. See `benchmark_step1.py` and raw `baseline-step1.json` in this directory.

## Measurements

Durations are milliseconds. “Message” is ordinary context assembly; “tool” is the next assembly after one durably recorded tool call/result in the current turn. Snapshot time is a subset of total assembly time, not an additional duration. One turn means one current user message; each earlier turn has a user and assistant message.

| Scenario | First build | Warm median | Warm p95 | Snapshot median | Full snapshot calls | Events read across snapshots |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Message, 1 turn | 7.48 | 6.58 | 7.08 | 2.71 | 2 | 2 |
| Message, 25 turns | 83.06 | 78.33 | 80.96 | 23.07 | 2 | 98 |
| Message, 100 turns | 308.00 | 303.97 | 306.90 | 87.04 | 2 | 398 |
| Tool continuation, 1 turn | 12.41 | 11.50 | 11.79 | 3.81 | 2 | 6 |
| Tool continuation, 25 turns | 84.47 | 84.04 | 84.84 | 24.49 | 2 | 102 |
| Tool continuation, 100 turns | 310.25 | 309.50 | 311.40 | 88.54 | 2 | 402 |

| Completion hook with fake worker | Enqueue median | Worker hook median | Worker hook p95 |
| --- | ---: | ---: | ---: |
| 0 ms injected delay | 0.001 | 0.022 | 0.028 |
| 250 ms injected delay | 0.002 | 255.109 | 255.261 |

## Causal findings

1. Every measured model-context assembly took two full execution-history snapshots. The request factory captures one (`unchain/src/unchain/context/request_factory.py`, `_validated_snapshot`); the coordinator captures another (`unchain/src/unchain/context/coordinator.py`, `compile`). SQLite snapshot capture reads the execution history. The tool continuation follows the same pattern. Replaying a warmed execution did not remove this work.
2. Local preparation scales strongly with history length: 6.58 ms at one turn, 78.33 ms at 25 turns, and 303.97 ms at 100 turns for the ordinary-message fixture. At 100 turns, the measured snapshot operations consume about 87 ms of the 304 ms total. Removing only one SQLite read cannot remove the remaining validation and projection work. A separate cProfile run (`profile-step1.txt`) qualitatively confirms repeated JSON resource validation and canonical projection; its profiler-inflated times are not baseline timings.
3. The Memory Agent execution path can extend foreground completion. `PupuMemoryAgentWorkerModule.configure` installs an inline `process_after_enqueue` run hook that calls `process_next`; the graph-root and legacy finalization paths also invoke processing inline. In the controlled hook pair, adding 250 ms to worker execution increased the hook's median by about 255 ms, while enqueue itself remained about 0.002 ms. This proves the synchronous dependency for this path, not that every greeting launches a Memory Agent or that any observed 18.4-second run spent its time there.

## Attribution limits and next measurement boundary

This benchmark measures local context preparation and a controlled completion hook. It does **not** measure Electron/IPC, request admission, sidecar cold start, provider network/prefill, time to first visible token, token throughput, real Memory Agent model latency, or real user message/media size. The screenshot's 18.4 seconds cannot be apportioned from this evidence. Its roughly 15.9k input tokens make provider prefill a plausible contributor, but provider timestamps are required to test that explanation. The benchmark's `provider_calls: 0` field means no provider was invoked in this synthetic run; it is not a production auxiliary-call count.

The next implementation checkpoint should collect content-free timestamps at admission, first provider dispatch, first visible token, tool-result commit, next dispatch, terminal commit, memory-job enqueue, worker start/end, and foreground done on the **same run ID**. Compare one short greeting, a second message, long history, and a real memory-candidate turn. Until then, treat the two confirmed waits above as measured local contributors and the rest of the 18.4 seconds as unattributed.
