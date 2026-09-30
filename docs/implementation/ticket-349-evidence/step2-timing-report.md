# #349 step 2 measured timing — 2026-09-26

## Measured result

This is a controlled measurement of the completion path, not a live LLM end-to-end benchmark. It uses real SQLite, real graph-root completion/enqueue, the actual dispatcher/reconstructed host, real candidate application and a durable completed-job check. The Memory Agent is a deterministic tool-using test agent; the configured 1,000 ms delay is injected, not measured provider latency. Main-model generation, fixture setup and frontend rendering are excluded.

The synchronous control is the original graph completion module from HEAD (`2b8cb2e197d4c873bf9e78c8688e4c21e9457947`), loaded alongside the same r7 host/runtime. This isolates synchronous vs background completion scheduling; it is not a full old-release/new-release comparison. Both use the same fixed Unchain wheel. Each cell has one warmup and five measured repetitions, with alternating mode order. Every sample applies a real candidate and observes a completed durable job. Timings below are medians, in milliseconds.

| Injected model wait | Mode | Foreground completion | Durable memory completion observed | Model wait + tool application |
|---|---|---:|---:|---:|
| 0 ms | sync | 112.272 | 125.939 | 26.056 |
| 0 ms | background | 89.918 | 205.606 | 26.812 |
| 1000 ms | sync | 1149.664 | 1166.028 | 1063.360 |
| 1000 ms | background | 88.285 | 1243.966 | 1063.435 |

With the 1-second injected wait, foreground completion saves **1061.379 ms (92.3%)**. The full background job finishes later, because dispatch/reconstruction adds overhead; the feature removes the model wait from the foreground, not from total work. The durable-completion timestamp includes read-only observation overhead and is not an exact database commit timestamp. This small fixture/sample count does not establish production p95, first-token improvement or full-conversation savings.

[Raw samples and artifact identities](step2-timing-results.json), [benchmark script](step2-timing-controlled.py), [original synchronous module](step2-timing-original-completion.py). Replay from the task clone: run `.local/ticket-349-live-timing/controlled.py` with the Unchain Python 3.12 environment. The retained script expects the frozen r7 checkpoint and its exact wheel.

## Real desktop attempt: blocked before a valid measurement

A task-owned diagnostic Electron instance was launched with isolated user data, the fixed r7 server and the exact wheel installed from its retained archive. Wheel installation (rather than zip-import alone) is needed for filesystem-based model capability resources. The diagnostic window used the existing development frontend at localhost:2911; it was not a packaged-candidate test. Only settings were backed up locally, including encrypted credentials; no chat history was copied, and no plaintext credentials were read or printed. Memory V2 was explicitly enabled in the temporary diagnostic configuration.

**New integration blocker:** `electron/main/services/unchain/memory_v2_rollout.js:9` requires schema version 2, and line 601 rejects any other version. The exact candidate runtime initializes/migrates Context V2 to schema version 3. The actual app reported `status=degraded`, `reason=context_v2_schema_incompatible`; SQLite `context_v2_schema` contains migrations 1, 2 and 3. Runtime protocol manifest validation passed, so this is the desktop schema admission check, not a protocol-manifest mismatch. [Observed readiness evidence](step2-timing-live-readiness.json).

The baseline app's attempted synthetic `openai:gpt-4.1` message returned HTTP 500; its Memory V2 status reports `context_v2_readiness_unavailable`. No successful provider response was obtained, so there is **no valid real-model full-turn before/after timing**. The failed probe chat was deleted and the previous active chat restored. The candidate app/sidecar was stopped and its entire temporary profile, encrypted credential copy, temporary dependency link and diagnostic feature snapshot removed. The original app remains running.

This finding explains why prior Python/worker tests were insufficient for desktop acceptance. Resolve the desktop schema admission contract (including existing schema-2 migration behavior and rejection of unsupported versions), test both `.js`/`.cjs` variants, and repeat the same candidate-bound live probe before claiming end-to-end latency. This task records the blocker; it does not bypass the check or change product code.

PuPu server/resources: sha256:176faa3e22f2ad42fcf3580654d35b1ba326e425789917aede12b16c094c7100

Unchain wheel: sha256:03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44

Runtime manifest: sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c
