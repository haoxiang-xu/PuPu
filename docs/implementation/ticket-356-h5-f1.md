# H5 F1 bounded implementation handoff

## Restart scheduling amendment — 2026-10-22

Owner has 18 GB RAM; at most two Claude workers and one local heavy task globally. Controlling policy: /Users/red/.codex/artifacts/pupu-356/356-parallel-dispatch-20261022/RESOURCE-POLICY.md. The orchestrator performs graph commands and tests serially. Resumed Claude is file-tool-only: no Bash/MCP executor/spawn. Do NOT recreate the previous overlapping index/dependency work. First checkpoint now only adds a focused new regression test, with no product edit; root reviews and runs RED. The product fix is a separately released second checkpoint after that result. Native-core/shared-CAS stay queued.

Ticket: https://github.com/haoxiang-xu/PuPu/issues/356
Workspace: /Users/red/Desktop/GITRepo/pupu-356-h5-f1
Branch: codex/ticket-356-h5-f1
Base: e24e993fe9aaf70920cd94e43cfdb4fbc139e302
Reason for non-dev base: this isolated follow-up depends on the frozen production-entry/recovery integration; none of those unmerged inputs may be guessed to exist on dev.

The owner explicitly authorized parallel Claude workers on 2026-10-22. This is the first bounded implementation slice. Work only here and in a new evidence directory under /Users/red/.codex/artifacts/pupu-356/356-parallel-dispatch-20261022/f1/. Do not commit, push, merge, close issues, edit the main tree, existing clones, installed wheel, QA guard, or H1-H5 originals. No real provider/API. Do not start a new HTTP server in this slice; another lane may be preparing validation.

## Settled reproduction and repair decision

Independent finding: https://github.com/haoxiang-xu/PuPu/issues/356#issuecomment-6345470451
Read /Users/red/.codex/artifacts/pupu-356/356-h5-independent-review-20261021/report.md and f1/report.md, source hashes, captured error, real preload replay, and journal receipts. Producer originals remain under /Users/red/.codex/artifacts/pupu-341/356-active-context-http-h5-20261021/.

A sidecar is killed with a held Kernel call; B reclaims the same attempt. `_memory_v2_guard_reclaimed_execution` correctly marks failure and supplies `type:error`, code memory_v2_takeover_recovery_required. The native Skeleton stream yields that event and returns. Installed V4 normalizer drops raw error, so HTTP emits session.started and non-cancelled done without error; real preload calls onDone, never onError. Durable graph stays running, no old-node SDK is replayed, and a fresh attempt is skeleton_execution_already_active until explicit cancel.

Chosen repair scope: use the existing recognized public failure path at the native Skeleton host boundary for this takeover refusal; retain the typed code, exact run/attempt identity, and useful message. Keep the shared legacy guard and installed normalizer behavior unchanged unless concrete evidence makes the scoped host repair impossible; report before widening. Recovery guidance must explain that the current execution must be reviewed and explicitly cancelled before a new attempt; do not promise that starting a fresh attempt alone works. Do not auto replay, cancel, clear active state, alter effects or pretend the old run completed. Do not make a renderer parse dropped diagnostics as a workaround. No new endpoint/IPC/config/protocol field.

The emitter and installed consumer/route must be tested together. Prefer the existing local typed exception/failure constructor (`_fail` / DurableInteractionHostError) and V4 terminal-exception contract at this Skeleton seam, so both the normal failure event and done.error reach Main/preload. Merely renaming raw error to run_failed is insufficient unless terminal/error callbacks are independently proved. Do not invent an alternate wire envelope.

## Evidence and permitted implementation

Read this clone's AGENTS.md, CLAUDE.md and cross-boundary rule. Query/context then upstream impact before every existing symbol edit. HIGH/CRITICAL must be called out before editing; UNKNOWN needs text confirmation. Bootstrap this clone's GitNexus runner/index if absent; never substitute a different checkout's index as current evidence. Initial historical graph receipts are in independent review/f1/.

Likely production scope: unchain_runtime/server/skeleton_production_chat.py, with narrowly necessary host-side message construction if shared text cannot be changed safely. Tests under unchain_runtime/server/tests/. Do not touch unrelated frontend, shared runtime error handling or credentials. Keep Electron JS/CJS twins if evidence unexpectedly requires their edit (otherwise stop before widening).

Fixed test interpreter: /Users/red/.codex/artifacts/pupu-356/embedded-diagnostics-20261017/fixed-pair/install-venv/bin/python, CPython 3.12.10. Site-packages under install-venv/lib/python3.12/site-packages. Pin UNCHAIN_SOURCE_PATH to that site, disable bytecode, use disposable HOME/data/workspace and existing user-store guards. Never inject the mutable sibling unchain checkout.

Actual wheel SHA-256: 4e3efdc0acd9563e484ad91fa392cff0eeeb22c5793313e936c643614945427b.
Actual imported manifest: sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101.
Use PuPu's Python/pytest runner conventions; read the runner before selecting exact test commands. No broad frontend/Electron full suite is necessary if no such production code changes. Only one resource-heavy full build/test per lane; coordinate before a broad run.

## Boundary/sequence/acceptance

BC-356-H5F1-01: producer native host's takeover-refusal event -> installed RuntimeEventBridge/V4 normalizer -> route SSE terminal -> preload failure consumer. Existing VERSIONED runtime event contract; no shape/version change. Exact code/message and root/attempt identity must survive; unknown data may not become fallback success. Artifact pairing is candidate source host + the fixed installed wheel for this checkpoint; later sidecar deployment must receive a new artifact identity if .py changes. Git revision is telemetry, not a capability gate.

SEQ-356-H5F1-01: old running attempt has durable history; same-attempt cold reclaim refuses effects; public failure settles that request once; old graph remains unchanged; fresh start remains refused while active; explicit cancel closes old graph; fresh run is then eligible. Existing H5 records establish state invariants. This first slice need not rerun SIGKILL/HTTP; it must test the causal emitter-to-strict-consumer path in process with disposable fixtures.

AC-356-H5F1-01: red-before-green host producer test yields a visible recognized failure with exact code/identity/message; installed bridge retains it instead of dropped diagnostics; normal V4 path has observable terminal failure, not success-shaped done only.
AC-356-H5F1-02: no SDK replay/automatic cancel/root commit or active-state mutation introduced; repeat refusal safe; ordinary new attempt and normal completed stream unchanged.
AC-356-H5F1-03: current and missing-history/legacy controls preserve prior behavior; a guard exception still uses existing route exception handling. No dropped-diagnostic renderer workaround.
AC-356-H5F1-04: explicit review/cancel/new-attempt guidance matches the known active graph, without claiming exactly-once external effects or a successful old attempt.

## Checkpoint and delegation assessment

2026-10-22 source checkpoint: root took over implementation after a controlled-emitter RED, replacing only the native yield/return with existing `_fail`; the file-only Claude was used for bounded independent review. Four new host/V4 tests all fail on the saved original source and pass on fixed bytes; combined 52 passed + 8 subtests, no network attempts, measured peak test-tree RSS 180.3MiB. Read-only configured Claude review found no material issue; final completed logs/JUnit resolve its earlier mid-run count caveat. No commit, wheel/guard changes, HTTP/cold-process rerun or rollout. Detailed immutable-source/test/log receipts are in /Users/red/.codex/artifacts/pupu-356/356-parallel-dispatch-20261022/f1/restart-01/. Next gate is fresh source-sidecar/new artifact-pair H5 regression, not an assumption that the original F1-bearing capture has become green.

Suitable for a bounded configured Claude implementation: reproduction, causal boundary and expected behavior already independently established; cross-boundary emitter correctness still requires a strong independent review. Do not override the user's configured Claude model. Record actual model if the CLI reports it; never invent it.

Stop after the scoped repair, focused red/green and regression receipts, plan update and graph change analysis. Return changed files, exact commands/results, failures/deviations, artifact SHA and current dirty state in checkpoint.md. Do not claim H5 full acceptance, build a new wheel, rerun H5, or start the next slice. The orchestrator independently reviews, then arranges a new fixed host artifact and HTTP regression. Python product changes require a restarted/new sidecar before such runtime validation.
