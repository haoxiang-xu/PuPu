# #349 step 2 — implementation verification, 2026-09-26

Result: **IMPLEMENTATION READY / local fixed-pair checks PASS**. Ticket remains open and In Progress. Formal feature acceptance and packaged application rollout were not performed in this implementation turn.

## Resulting behavior

Normal completion, Graph root completion and the supported legacy finalizer persist their required completion/job data, notify the sidecar, and return without running the Memory Agent inline. Tool calls/results and context durability are unchanged. A single daemon worker rebuilds official scoped capabilities from durable ownership and narrow authorized provider inputs. Foreground cancellation and sealed completion diagnostics are not passed to the worker.

The existing durable curator queue remains authoritative. Fresh claim IDs allow genuine retries after idle, failure or expired leases; duplicate notifications do not duplicate application. The dispatcher starts/stops with the sidecar, pages owners, recovers pre-upgrade registrations, and retries transient startup discovery failures. The periodic recovery interval is 30 seconds; completion wakes can run sooner. A blocked provider consumes one background slot, not a foreground completion wait.

Only closed, versioned, non-secret model selection metadata is stored in a PuPu-owned table in the existing database. At most 128 owners' narrow provider inputs are retained in process memory. Built-in providers may recover their own environment key after restart. Missing credentials/custom transport configuration produce explicit durable retry state rather than fallback to another provider or a custom protocol twin. A later authorized request can refresh configuration. This is not a new credential vault.

Before official toolkit operations, the worker verifies the actual claimed execution/attempt's current generation and deletion state. An owner-scoped cross-process lock serializes these short operations against the host rebase API; ordinary chat does not take that lock. Legacy mutations additionally compare an exact host-only lease fence and current source generation inside the SQL write transaction. Both deletion paths remove the optional background host registration. Leases, candidate receipts and the official recursion guard remain authoritative.

No asynchronous completion writes back to a foreground RunBundle/SSE frame. Foreground memory metadata is an enqueue-time snapshot; later job status is read from durable jobs. User-facing label redesign remains a later step of #349.

## Evidence

- **247 tests passed, 65 subtests passed**, using the frozen PuPu server candidate and the same wheel retained at the cache checkpoint. The import guard checked loaded Unchain modules after each test to prevent a mutable sibling checkout from satisfying the pair tests. [Full test output](step2-fixed-pair-tests.log), [tested files](step2-tested-files.json).
- Real SQLite + blocked model barrier: graph foreground completion and the next same-chat admission both finish before releasing the background model. 100 duplicate wakes result in one application. Ordinary foreground run admission can also acquire its guard while the memory mutation lock is held.
- Real queue sequences: enqueue/restart without a wake, pre-upgrade discovery, transient recovery failure/retry, expired lease/reclaim/old-fence refusal, scheduled retry followed by a fresh claim, no-candidate/no-model, missing credentials, wrong owner/backend, deletion, rebase and shutdown before a late tool write. Legacy enqueue/apply and expired/reclaimed/deleted fence cases are exercised with its real store/toolkit. A late legacy tool after shutdown leaves a pending retry; failure receipts are scoped to the actual claim so an earlier failure cannot suppress a subsequent retry.
- Restored root lineage regression was captured **red before green**: an ancestor root ID must not be confused with the actual resumed source attempt. [Failing regression](step2-resume-scope-red.log), [corrected regression](step2-resume-scope-green.log). Normal/Graph interaction and cold-resume suites are also included.
- Independent closed-envelope consumer probes rejected unknown fields, wrong version and wrong type **before a job was claimed**. [Negative results](step2-envelope-negatives.json).
- Actual task-owned sidecar `main.py` was started, terminated and restarted using the frozen candidate. Both HTTP health checks succeeded and both processes exited 0. A previously persisted job was recovered into `memory_background_credentials_unavailable`, remained pending, and was not claimed again before its retry deadline. No provider request was needed. [Restart results](step2-sidecar-smoke.json).
- `git diff --check` passed. Final working source bytes were compared with the retained candidate after tests. No Unchain source changes were made in this slice and its wheel was not rebuilt.

## Exact artifact pair

- PuPu server/resources snapshot: `16a4ab3f4f3d4a81f0b8e8c9ffb91e50ad793ebe4c03ed23520113c3d7e54514` (376 files, including tests and the packaged MCP registry resource).
- Unchain wheel SHA-256: `03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`.
- Imported runtime manifest digest: `sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`.
- Retained replay directory: `.local/ticket-349-background-checkpoint-r4/`. Run `run_tests.py`, `sidecar_smoke.py` and `verify_background_envelope.py` with the task's Python 3.12. The first runner validates the frozen file and wheel hashes before testing.

The first isolated replay lacked the packaged MCP registry resource; it failed during collection/startup. The resource was then included and hashed. Earlier candidates are retained locally, but only the final pair above supports this report.

## Limits / remaining release work

This removes Memory Agent execution from the foreground completion path. It is not a measurement of a new whole-conversation duration, provider time or time to first token. The previously observed roughly 6-second pre-model segment is unchanged by this slice. No live-provider speed claim is made.

The task-owned Python sidecar was restarted for verification; the user's day-to-day application and original PuPu checkout were not switched to this candidate. Packaged desktop verification and final active rollout remain **INCOMPLETE** under BC-349-05 / AC-349-09. No commits, push, PR, ticket closure or automatic feature audit were performed. The implementation and boundary details are in [the step 2 plan](../ticket-349-background-memory.md).
