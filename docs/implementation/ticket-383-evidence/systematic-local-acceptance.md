# Ticket 383: systematic local acceptance evidence

Status: local acceptance snapshot, 2026-10-03 (America/Vancouver). This is local implementation evidence, not a completed feature audit or rollout approval. Final backend, frontend, independent review, lifecycle matrix, and production-build runs passed on stable source snapshots. Actual-HTTP cold resume and manual application acceptance remain unqualified or not run as stated below.

## Artifact identity

The native/backend qualification reused one already-built Unchain wheel: SHA-256 `27139af8f6bf94b8f6bd1ce219a5da6966e17dc90b20225ace032e0c1a57d8b6`. The imported protocol manifest digest was `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`; its source revision is `a7fa15d685b1130bf5678c1e493a51d2551185cf`. The pinned runtime site must be selected explicitly with both `UNCHAIN_SOURCE_PATH` and `PYTHONPATH`; `PYTHONPATH` alone can select a different sibling source tree. The wheel was not rebuilt.

## Final local checkpoints

| Area | Result | Qualification |
| --- | --- | --- |
| Affected exact-wheel host suites | 120 tests + 18 subtests passed across seven suites. All five production host source hashes matched before and after. | PASS. The audit blocked one `socket.bind` attempt from urllib3's IPv6 availability probe; there was no socket connection. |
| Native producer and cold-core checks | 4/4 passed for OpenAI and Anthropic argument shapes; each producer yielded five qualified frames, one tool probe, and zero replay redispatches. Cold projection retained the original JSON-string or structured-object arguments exactly; the request was unchanged and each core resume completed once. | PASS for the tested producer and core-resume paths, using local fake-provider transports and the reused wheel. No external provider request occurred. This does not qualify the separate HTTP cold-resume path. |
| Frontend full suite | 84/84 suites and 1,032/1,032 tests passed; no skipped tests. 1,227 source hashes matched before and after. | PASS on the verified local source snapshot. |
| Independent frontend review | 113/113 checks passed; source and harness snapshot stable. | PASS for its mounted frontend and pinned-runtime scenarios. |
| Independent strict-source review | 46/46 checks passed with 11 source hashes stable across run and final readback. | PASS for the reviewed projection, ownership, provenance, and presence cases. |
| Fresh lifecycle matrix | 147/147 passed: projection 79, genuine native lifecycle 10 (all 16 prefixes), TraceChain 53, and actual SQLite reopen 5. All four component suites exited cleanly. | PASS for the tested local lifecycle coverage. |
| Actual SQLite reopen | SQLite integrity passed; the private fixture database hash matched before close, after reopen, and at final readback. Counters were bootstrap 1, message reads 2, and zero apply/write operations during the replay/read path. | PASS for the isolated production store/service path with in-process IPC and a private test profile. No Electron application was launched and no user or production database was used. |
| CRA production build | Optimized production build compiled successfully; source hashes stable. | PASS. The log contains Node's `fs.F_OK` deprecation warning and CRA's bundle-size advisory; no ESLint warning was reported. No app-version build or runtime wheel rebuild was run. |
| Actual HTTP cold pending-resume | Successful actual-HTTP resume was not established. Earlier guarded attempts remained blocked by existing final-model or immutable-registration checks and dispatched no model/tool. | **NOT_RUN / UNQUALIFIED** as acceptance. Core cold resume and display reopen do not substitute for this row; no guard was relaxed. |
| Manual application acceptance | Electron app/UI launch, user-profile checks, real external provider activity, and manual user acceptance were not performed. | **NOT_RUN**. No candidate packaging readiness or manual-launch check is claimed. |

The passing SQLite reopen used the real SQLite service with an isolated private fixture, so it did include fixture-local persistence. No user or production database write occurred. The host audit's blocked IPv6 availability probe was a denied bind attempt only, not a network connection. These local results do not constitute full feature-audit completion or live rollout approval; the ticket matrix and rollout remain **INCOMPLETE** until the actual-HTTP and manual-acceptance boundaries above are resolved.

## Local commands

Run the host tests with the exact reused runtime site explicitly selected. Set `UNCHAIN_SOURCE_PATH` to the site directory containing the already-built wheel installation; use a new isolated data directory for each run.

```sh
export UNCHAIN_SOURCE_PATH=/path/to/reused-runtime/site
export PYTHONPATH="$UNCHAIN_SOURCE_PATH:unchain_runtime/server"
export UNCHAIN_DATA_DIR="$(mktemp -d)"
.venv/bin/python -m pytest -q \
  unchain_runtime/server/tests/test_memory_v2_unchain_active_bridge.py \
  unchain_runtime/server/tests/test_chat_stream_v4.py \
  unchain_runtime/server/tests/test_chat_stream_runtime_protocol_gate.py \
  unchain_runtime/server/tests/test_tool_call_ref.py \
  unchain_runtime/server/tests/test_durable_interaction_host.py \
  unchain_runtime/server/tests/test_unchain_adapter_execution_owner_scope.py \
  unchain_runtime/server/tests/test_tool_timeline_merge_policy_transport.py
```

Run the focused frontend suites through the repository's CRA/Jest wrapper:

```sh
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath \
  src/SERVICEs/runtime_events/tool_call_projection.test.js \
  src/SERVICEs/runtime_events/activity_tree.test.js \
  src/COMPONENTs/chat-bubble/pending_confirmation_trace_frames.test.js \
  src/COMPONENTs/chat-bubble/trace_tool_grouping.test.js \
  src/PAGEs/chat/hooks/use_chat_stream.memory_v2_payload.test.js
```

The actual SQLite reopen acceptance uses the saved isolated test harness in the private review workspace; the generic focused command above does not replace that production save/read/backend/render path. Preserve and compare the harness's complete production dependency hashes around the run. Do not point it at a user profile or database.

## Acceptance boundary

The local source checks, final build, and 147-case lifecycle matrix passed, but actual-HTTP cold pending-resume acceptance remains **NOT_RUN / UNQUALIFIED**. Earlier guarded attempts were blocked by existing final-model or immutable-registration checks; those checks remain intact. Cold core resume and display reopen are not evidence of successful actual-HTTP resume. Electron app/UI launch, external real-LLM activity, user-profile checks, and manual user acceptance remain **NOT_RUN**, so live rollout remains **INCOMPLETE**. The SQLite run used the actual storage service with an isolated private fixture and did not write a user or production database. Local fake-provider transports were used; no external provider request is claimed. No candidate artifact readiness or manual-launch check is claimed.
