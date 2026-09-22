# Ticket 274: restore Ollama reasoning events

Ticket: https://github.com/haoxiang-xu/PuPu/issues/274
Release: #216 (v0.1.12)
PuPu base: dev @ 7c1f2fde798e9c499bca0a18da5ec840637ac91e
Unchain base: dev @ 8cd6c13cb04e2eccd74e777ec024d749e8cb5399
Workspaces: /Users/red/Desktop/GITRepo/pupu-274 and /Users/red/Desktop/GITRepo/unchain-274
Branch in both: codex/ticket-274-ollama-reasoning

## Diagnosis and decision

The current OllamaModelIO._fetch_turn_streaming collects each nonempty message.thinking chunk but never emits it. Its content path emits token_delta. Anthropic emits reasoning with run_id, iteration, provider and delta. RuntimeEventBridge normalizes this into events-v4 step.delta, payload step_type=model_response and kind=reasoning; PuPu projects that to a reasoning trace frame. Preserve the existing wire schema, request options, final content, thinking replay, usage and tool-call behavior. Add the same guarded reasoning emit directly after accumulating thinking, before processing content/tool_calls/done on that chunk. No UI or model selection changes, no synthetic reasoning or family-name gate.

GitNexus provider query/context/impact: LOW, 2 direct callers (OllamaModelIO.fetch_turn and OllamaExactRouteTransport.send), 0 resolved affected processes. Test both entry points. Host consumer impact is recorded with delivery evidence. Raw graph evidence and text inspections complement the graph; no implication that dynamic callers are absent.

## Contract and acceptance

BC-001: Ollama NDJSON message.thinking (OPEN provider response: ignore unrelated daemon fields) -> raw provider callback -> RuntimeEventBridge -> JSON transport -> PuPu events-v4 store/projector. Raw reasoning callback has exactly type, run_id, iteration, provider, delta; canonical step.delta keeps the established v4 envelope, run/turn/step identities and model_response payload. VERSIONED event admission rejects non-v4 events; unknown event types are rejected. No schema negotiation or protocol manifest change. Empty/missing thinking produces no reasoning; emit_stream=False suppresses text and reasoning callbacks without dropping returned/replayed thinking. HTTP/provider errors continue to propagate. Reasoning must never be added to answer text.

SEQ-001: same chat/session, first run then second run; each iteration's split thinking precedes text/tool return, no accumulation leaking into later requests; completed event journal JSON replay reconstructs the same trace. Assess normal, exact-route, graph/subagent shared provider paths. Retry/durable resume and actual cold sidecar replay are reachable and remain NOT_RUN unless verified; no inference from pure reducer replay to full sidecar restart.

AC-001: real provider parser against deterministic NDJSON, split/empty/same-chunk reasoning and content, run/iteration identity, callback during consumption before completion; parameterize deepseek-r1/qwen3/gpt-oss names without claiming inference on those models.
AC-002: tool-call early return and final return preserve thinking replay/reasoning_items, content/tool arguments/usage unchanged; emit_stream=False and nonreasoning replies emit no reasoning. Callback absent remains supported.
AC-003: exact persisted request route preserves reasoning callback and existing buffering/release semantics; strict event shape; real RuntimeEventBridge output admitted by PuPu event store/projector, live reduction and JSON replay retain reasoning separately from answer; invalid version/type rejected and duplicate event IDs not replayed twice.
AC-004: live real-app family tests (deepseek-r1/qwen3/gpt-oss), second message, repeated interactions, retry and cold restart, plus packaged candidate/wheel/manifest identities and package smoke. NOT_RUN: owner forbids local model inference. Cloud-only success cannot establish local-family acceptance. No active rollout/merge/Done or audit PASS without required evidence or explicit owner waiver.

Artifact plan: commit reviewed runtime change, build one immutable wheel, reuse it for producer contract tests and fixture emission, bind SHA-256 and actual imported protocol manifest digest. Host PR pins that source revision. A full packaged-app candidate and live acceptance remain pending; source tests are not package acceptance.

## Delegation and checkpoints

Partially suitable for a weaker cloud model: the provider omission, exact event fields, insertion point and compatibility constraints are settled, with deterministic observable regressions. Delegate only Unchain provider fix and new focused test file to gpt-5.6-luna; no local inference and no commit/push. Strong parent owns host integration, artifacts, review and audit.

Slice 1 permitted files: src/unchain/providers/ollama.py and tests/test_ollama_reasoning_stream.py (new). Read repo instructions, independently run GitNexus impact before changing _fetch_turn_streaming. Write tests and run against old source first (red evidence). Add guarded _emit, run .venv/bin/python -m pytest -q tests/test_ollama_reasoning_stream.py tests/test_kernel_model_io.py tests/test_exact_provider_route_transport.py tests/test_runtime_events_canonical_v4.py. Include exact route test using existing test helper as needed; do not modify unrelated tests/transport. Stop at checkpoint with diff, commands, actual test results and unresolved issues. Missing interface, scope expansion or changed buffering semantics must be reported before edits.

Checkpoint: strong parent reviews exact raw/canonical shape, ordering/early return, silent mode, existing transport semantics, and reruns targeted tests. Then integrate host regression and immutable revision; final strong review before graph check/commit/PR. Do not delegate unresolved end-to-end acceptance decisions.

## Delivery evidence — 2026-09-22

Strong checkpoint: continue after test corrections. Worker `gpt-5.6-luna` was actually dispatched; parent inspected its nine-line production diff and reran 54 provider/canonical tests. Genuine pre-fix regression: 3 failures / 5 passes, preserved outside the clone. Actual installed-wheel rerun: 54 passed. Host event/recipe tests: 42 passed across five suites, including five immutable-producer contract tests. No inference or running sidecar was started, so no sidecar restart acceptance is claimed.

Unchain source `a9012174584ca099f22ec29bd75928545e572a7f`, draft PR https://github.com/haoxiang-xu/unchain/pull/37. One wheel built and reused: `sha256:a9f3dd6f617ca727b0b212a2de649d22937e1715f34d1de828f77ba1d105cc07`; actual imported manifest `sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`. Generator verifies installed distribution archive hash and complete imported manifest against artifact evidence. Fixture JSON SHA-256 `7a2c18c51dee8f5afb7ba9799cd0a4ef02505e2842a9154a6dabba7ccc4b0646`. Host fixture `src/SERVICEs/runtime_events/fixtures/ollama_reasoning.json` was generated by `scripts/fixtures/generate_ollama_reasoning.py` using HTTPX MockTransport and real provider/RuntimeEventBridge code from that wheel.

Reproduce: build once using `node scripts/release-qa/build-unchain-artifact.mjs --source <clean-runtime-clone> --source-ref <revision> --out-dir <artifact-dir> --python <python>`; install the resulting wheel with pip `--force-reinstall --no-deps`; run `<python> -I scripts/fixtures/generate_ollama_reasoning.py --evidence <artifact-dir>/unchain-artifact.json --output src/SERVICEs/runtime_events/fixtures/ollama_reasoning.json`. Run host regression via `CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/SERVICEs/runtime_events/ollama_reasoning_contract.test.js src/SERVICEs/runtime_events/activity_tree.test.js src/SERVICEs/runtime_events/event_store.test.js src/SERVICEs/runtime_events/stream_replay_projector.test.js src/COMPONENTs/agents/pages/recipes_page/recipe_roundtrip.test.js`. Regeneration from another wheel changes provenance and requires fresh review.

Host consumer impact LOW: three resolved direct callers, no resolved processes. New test helper impact UNKNOWN (closure references not resolved); text inspection confirms only this contract test calls it. Fixture generator is excluded from graph indexing; inspected its sole __main__ entry and imports manually. No existing host production symbol is edited. Complete detect_changes results, test logs and the immutable wheel are retained outside the clone at `/Users/red/Desktop/GITRepo/pupu-274-evidence-20260922/`.

Acceptance remains INCOMPLETE. AC-001/002 and the deterministic parser→canonical→projector portions of AC-003 pass. The combined journal stores later runs in framesByRunId; tests now inspect both root and per-run trace buckets and compare both on replay. This is not proof of a second-message real UI session. AC-004 real model families, real-app interaction/retry/cold sidecar resume, packaged PuPu candidate digest and package smoke are NOT_RUN. No waiver is inferred from the no-local-inference instruction. Exact-route buffering remains a known obstacle to claiming live reasoning on that path. PRs remain drafts, issue stays open / In Progress, and both clones remain for continued acceptance work.
