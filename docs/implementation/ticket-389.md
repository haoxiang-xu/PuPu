# Ticket #389 implementation plan and handoff

Failed or stopped runs can leave Memory V2 attempts open, blocking edits and resends.

## Final candidate definition — 2026-10-11

This section supersedes historical proposals and preliminary wheel identities below.
The final development candidate combines PuPu `38211377fb128a74698360357bc7f74c98e51b5d` with Unchain
`3a7885bc04786d11c0b6e45b5d673b493283a73f`, plus the isolated #389 working changes.
Unchain PR #47 is included because its #383 producer companion had not reached dev.

Final artifact: `verified-wheel/unchain-0.2.0-py3-none-any.whl`, installed once to
`verified-runtime`, under `/Users/red/.codex/backups/ticket-389-20261011-evidence`.
SHA-256: `a5486e70741c42e3471961d3b892a50eecd0854333b636ef4688d718a7297ab9`.
Imported and independently validated runtime manifest:
`sha256:b163345c68666cc2dbe766a3a8e75da0246748def8fa9b1be75f446d9148da3f`.
Both `graph_failure_terminals_v1` and `durable_interaction_settlement_fence_v1`
are required by producer/consumer gates. All earlier wheels (`wheel`,
`final-wheel`, `paired-wheel`) are superseded. This is a development artifact,
not a signed release or clean-source provenance claim.

Current behavior and contract corrections:

- Stop immediately freezes UI/history, including admitted tool calls, and fences
  later content from the stopped attempt. Memory V2 settlement continues offscreen.
- Canonical interaction resolution must precede a kernel terminal. A proven
  persistence failure defers that terminal and retains exact stopped ownership;
  retry/restart finishes the journal without invoking providers or tools.
- The existing renderer cancellation event gate stays closed. Durable terminal
  persistence uses the journal boundary independently; opening SSE after Stop
  is not part of this implementation.
- New sends wait for an exactly identified cancelled predecessor. Edit/resend
  retries only the same frozen rebase transaction. Both waits are cancellable
  and bounded to 30 seconds; neither replays the stopped model run.
- Cold repair requires exact failed/cancelled or provably dead coordinator
  authority under the rebase guard. Missing records, completed coordinators and
  live owners are not permission to synthesize a terminal. Thus historical data
  recovery is deliberately evidence-dependent, not a promise to repair every
  old chat regardless of its records.
- The additional parked-interaction settlement writer has its own exact guard,
  canonical receipt/application and graph lineage checks (BC-389-9).
- Reopen retires orphaned approvals without restoring actionable cards or
  starting a model. An accepted new live attempt is protected from stale lookup.
- The original ten attempts/nine chats describe the September investigation.
  Current copied-profile evidence has a different population and is recorded
  separately; these counts must not be interchanged.

The issue remains open/In Progress during implementation verification. No delivery
commit, PR, audit, or active user-profile rollout is performed before requested close.

## Current integration baseline — 2026-10-11

The original base SHAs and checkpoint logs below are historical. On 2026-10-11,
both main checkouts and both #389 clones were fast-forwarded to the fetched
`origin/dev`, preserving the existing uncommitted #389 implementation:

- PuPu: `38211377fb128a74698360357bc7f74c98e51b5d` (includes #384 / PR #394,
  #383 tool grouping, provider retry changes, native replay, and #381 live interjection).
- Unchain: `358b96d723daa0d2882158985c8245c7f8c7fb23`.
- The sole conflict was in `kernel/lifecycle_events.py`; both the upstream
  `build_provider_retry_payload` and #389 `build_run_failure_payload` were retained
  unchanged, including both exports. `loop.py` and `unchain_adapter.py` auto-merged.
- Main PuPu's 44 existing dirty/untracked files were verified byte-for-byte unchanged.
  Backups of all four working copies are at
  `/Users/red/.codex/backups/stop-sync-20261011-144809`; both #389 tracked-change
  stashes are retained as additional backups.

The initial source checks paired `/Users/red/Desktop/GITRepo/pupu-389` with
`UNCHAIN_SOURCE_PATH=/Users/red/Desktop/GITRepo/unchain-389`. Final artifact tests
use the fixed installed wheel recorded in the latest integration section below. Restart the app/sidecar
and verify the loaded source paths before interactive acceptance; syncing disk
does not update a running Python process. The main checkouts include merged dev
fixes, while the uncommitted #389 work remains only in the #389 clones.

Validation on this exact source pair: 190 Unchain tests passed (kernel failure
terminals, provider retry wait, graph checkpoints, generation rebase); 158 PuPu
sidecar tests plus 48 subtests passed (graph failure terminal/settle, adapter
capabilities, graph checkpoint, provider retry events); 150 renderer tests across
7 suites passed (Memory V2 stream payloads, Stop turn cleanup, interrupted trace
persistence, tool grouping, provider retry, Stop during retry). This is source
integration coverage, not packaged-artifact or live-app acceptance. The Unchain
tests used its own `.venv/bin/python -m pytest` because `run_tests.sh` still checks
for the obsolete `miso` import. Existing EOF-whitespace and fake-timer warnings
were not changed.

This synchronization does not complete #389's remaining cold repair, late approval,
or renderer work. Preserve the owner's latest UX decision during that work: Stop
gives immediate UI feedback, retains admitted tool history, blocks further content
from that attempt, and finalizes Memory V2 in the background. A subsequent user
request waits explicitly for finalization, with cancellation/error handling rather
than an indefinite wait; the stopped attempt must not automatically rerun.

## Original setup

- Ticket: https://github.com/haoxiang-xu/PuPu/issues/389 (direct child of Release v0.1.12, #216)
- PuPu clone: `/Users/red/Desktop/GITRepo/pupu-389`, branch `codex/ticket-389-journal-terminal`, base `dev @ 3394b12a4defc8b7d732d27b27cf17e354e44e0e`
- Unchain clone (companion repository): `/Users/red/Desktop/GITRepo/unchain-389`, same branch name, base `dev @ 48f235dcce8d2b62b3e7f3ac3cfc9b6d5956c217`
- Both clones are prepared: `npm ci` done, `.venv` created in the Unchain clone (with Flask/Werkzeug/truststore for sidecar tests), GitNexus indexed at the base commits. Run GitNexus from the main checkout's runner: `node /Users/red/Desktop/GITRepo/unchain/.gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .`
- The ticket body holds the What & Why, the owner's decisions, BC-389-1..3, SEQ-389-1..3 and AC-389-1..7. This file is the execution plan. It is written for an implementer that has not seen the investigation.

## Goal and non-goals

Goal: after any failed, uncertain or stopped run the Memory V2 journal holds a canonical terminal for the step attempt and the root attempt, the graph seals follow, the rebase preflight no longer reports `attempt_open`, a Stop leaves no pending approval (including one that arrives after the Stop), reopening the app never offers a recovered approval card and never calls a model or runs a tool, and the ten attempts already left open in the owner's profile are repaired on next use.

Non-goals: no change to retry budgets or provider classification (#386), no change to `select_attempt_terminal` or `_execution_is_cancelled` (CRITICAL impact), no new schema version for journal records, no separate worker process unless a slice proves it necessary (report first), no change to the visible tool-call chain on pause (#384).

## Root cause (verified 2026-09-30)

1. `unchain/src/unchain/kernel/loop.py` `_run_state_with_failure_bundle` (~L1762) attaches a failure record to the exception and re-raises; `kernel/run_outcomes.py` `finish_completed_run` is the only terminal emitter, so the journal never receives `run_failed` or `run_cancelled`.
2. `unchain_runtime/server/unchain_adapter.py` `emit()` (~L9787) drops every event once `_execution_is_cancelled(token)` is true, so a cancel terminal could not reach the journal today.
3. The graph runner seals success (`graph_checkpoint_host.complete_step`, ~L10908) but has no failure/cancel counterpart; `GraphStepCheckpoint` has `complete_step` and `finalize` but nothing for failure; `GraphStepCheckpointRepository.terminal(status=FAILED|CANCELLED)` exists but is only called from recovery (`graph_checkpoint.py` ~L1570-1605, `sqlite_generation_rebase_v2.py` ~L5366-5400).
4. Consumers already accept the missing terminals: `journal/graph_attempt_quiescence.py`, `context/coordinator.py` (~L70), `context/projector.py` (~L37), `events/normalizer.py` (~L352 `run_failed` → `run.failed`).
5. Rebase preflight (`sqlite_generation_rebase_v2.py` ~L3470-3530) reports `attempt_open`; the sidecar maps it to `context_v2_rebase_in_progress` (`memory_v2_unchain_generation_api.py` ~L100) and only runs recovery for `*_seal_missing` (`_rebase_with_recovery` ~L650); the renderer renders it as "Waiting for the previous run to finish…".
6. Renderer `lookupDurableInteraction` (`use_chat_stream.js` ~L9441) offers a still-pending approval as an actionable card after reload (~L9758) and seals only when a receipt exists (~L9843). The owner decided the card must not be offered; reopen seals.
7. Evidence: `memory_v2/context_v2.sqlite3` in the owner's profile has zero `run_failed`/`run_cancelled`/`graph.step.failed`/`graph.execution.failed` events and ten unsealed graph-step attempts across nine chats (last events `provider.wire_snapshot` ×4, `interaction.resolved` ×5, `iteration_started` ×1). A copy of that database is the AC-389-4 fixture; never modify the live profile.

## Decisions already made (do not reopen)

- Terminal vocabulary: `run_failed` for exceptions, `run_cancelled` for `ExecutionCancelledError` and for the tool-confirmation cancel (`RuntimeError("stream cancelled during tool confirmation")` raised from `unchain_adapter.py` `_make_tool_confirm_callback`); payload mirrors `build_run_completed_payload` plus `error: {code, message}` with the sanitized `error_code` already computed in `_run_state_with_failure_bundle` and a fixed message (`"Run failed"` / `"Run cancelled"`); `recoverable: false`. Raw exception text never enters the payload.
- Exactly one canonical terminal per attempt. If the kernel emitted one, the sidecar must not add another; the sidecar writes a terminal itself only when the kernel could not (cancellation after the event gate) or in cold repair.
- Cold repair is allowed only when the execution record (`executions/<hash>/*.json`, status `failed`/`cancelled`) is terminal or its `owner_pid` is not alive; fixed code `cold_terminal_repair`; written through `PupuUnchainHostEventBoundary.bind_semantic` under the exact attempt authority; then the existing recovery seals the step/execution and the rebase is retried once.
- Stop semantics per the ticket: reopen seals and shows nothing actionable; no `resume_interaction` from a reload. Live-run behaviour (approve/deny while streaming, human-input submit during a live run) is unchanged.
- No new `unchain.provider_request_lease` or diagnostic versions; no journal schema bump.

## Ordered slices

Every slice: read the listed files first, run GitNexus impact for the symbols it edits, write the red test, save its failing output, then implement, then rerun the slice's tests and the module suites named. Stop at each checkpoint and report the diff, test output, deviations and open questions; do not continue past a checkpoint on your own.

### U1 — kernel emits the terminal (Unchain)
- Edit: `src/unchain/kernel/loop.py` `_run_state_with_failure_bundle`; add `finish_failed_run` / `finish_cancelled_run` in `src/unchain/kernel/run_outcomes.py` and a payload builder in `src/unchain/kernel/lifecycle_events.py`, mirroring `finish_completed_run` / `build_run_completed_payload`.
- Tests: extend `tests/test_kernel_runtime.py` (or the nearest kernel fake-client test module) with a provider that raises → exactly one `run_failed` callback event with `error.code`, `status: "failed"`; a run cancelled through the execution guard → one `run_cancelled`; success unchanged; the V4 normalizer projects both. Also assert that the journal sink (`context/runtime.py` `persist_event`) receives the terminal in an active Context V2 run (`tests/context_v2/test_provider_turn_execution_service.py` has the fixture pattern).
- Expected: `PYTHONPATH=src .venv/bin/python -m pytest tests/test_kernel_runtime.py tests/context_v2/test_provider_turn_execution_service.py tests/context_v2/test_journal_message_projection.py -q` green; full suite green.
- **Checkpoint 1** after U1: strong agent reviews payload shape against the normalizer and the projector before anything downstream is built on it.

### U2 — graph step and execution terminals at run time (Unchain)
- Edit: `src/unchain/context/graph_checkpoint.py`: add `fail_step(plan, step_index, *, status: GraphTerminalStatus)` that requires a canonical failed/cancelled terminal after the start and seals through `self.repository.terminal(...)`, idempotent when recovery already sealed; add `finalize_failed(plan, *, status)` writing the execution terminal (`graph.execution.failed` / `graph.execution.cancelled`) with the same discriminator rules as `finalize`. Check `sqlite_generation_rebase_v2.py` execution-seal handling (~L3538-3560) accepts the new execution terminal types; if it only knows `graph.execution.completed`, extend the accepted set there without touching `select_attempt_terminal`.
- Tests: `tests/context_v2/test_graph_checkpoint.py` (pattern `test_restart_seals_canonical_terminal_left_before_graph_checkpoint`): seal at run time; recovery after a journal that has the terminal but no seal; double seal refused; `tests/context_v2/test_sqlite_generation_rebase_v2.py`: a failed and a cancelled attempt sealed at run time allow rebase (pattern `test_completed_tool_and_terminal_attempt_allow_rebase`).
- **Checkpoint 2** after U2: strong agent runs the Unchain full suite and reviews the rebase changes.

### P1 — sidecar: run-time settle of a graph that was left (PuPu) — plan as built (supersedes the original text)
- The original plan opened the `emit()` cancellation gate for canonical terminals. **Not done, and not needed**: `emit()` only gates the SSE queue (and the legacy non-active journaling); in an active graph the kernel's terminal is persisted by the context runtime before the host callback raises, which the real-cancel-token tests confirm (Stop during a model call journals the step's `run_cancelled`). Opening `emit()` would also let a raw `run_failed` / `run_cancelled` reach V4 and show a second root error.
- New module `unchain_runtime/server/memory_v2_unchain_graph_failure.py`, `settle_pupu_unchain_graph_failure(graph_host, *, cancelled, iteration)`, called from the graph runner's `except Exception` branch after the existing error/cancel classification. It decides from the journal, not from the kind of failure: (1) `graph_host.recover()` seals every step whose terminal is already in the journal (a step that ran to `run_completed` is sealed COMPLETED even when Stop landed before `complete_step`; it is never turned into a cancelled step); (2) a step this run was executing (`uncertain` or `resuming`) that left no terminal gets `run_failed` / `run_cancelled`, then `fail_step`; (3) a step parked on a durable interaction (`suspended`, `resume_ready`) is left alone and the root is not terminated while one remains, so a rejected or failed resume attempt cannot kill a pending interaction; (4) otherwise the root gets `run_failed` / `run_cancelled` unless it already has any canonical terminal (including `run_completed`); (5) a step that never started gets nothing.
- Journal only: events go through the attempts' durable sinks, never through `emit`, so V4 shows no second root failure. Lost ownership (`ExecutionLeaseError` that is not a cancel, `SessionExecutionGuardError`, directly or as `__cause__`) writes nothing. A failure inside the settle is stored in `output_holder["graph_settle_error"]` and never replaces the run's own error.
- Host additions (additive): `PupuUnchainGraphCheckpointHost.fail_step(index, *, status)` and `step_event_sink(index)`. `complete_pupu_unchain_graph_root` (GitNexus HIGH) and `_is_execution_cancelled_error` (HIGH) are not edited.
- The three blocking callbacks (tool confirmation, human input, continuation request) now raise their Stop error through `_stream_cancelled_error`, which carries `code = "execution_cancelled"`, so the kernel journals `run_cancelled` for them (checkpoint 1 leftover).
- Tests: `tests/test_memory_v2_graph_settle.py` (16 cases on the real graph runner: S1 first and second step failing, Stop during a model call, Stop before the first step, between a step's run and its seal, between steps, after the last step, failure after `finalize`, root already terminal, lost ownership, failing settle, no root event on the stream; each followed by an edit/resend through the real generation API), adapter tests for the cancel codes and the ownership classification, the checkpoint 1 failure terminal test updated for the trailing seal; the pre-existing cold resume tests pin the parked-step rule.

### P2 — cold terminal repair (PuPu)
- Edit: `unchain_runtime/server/memory_v2_unchain_generation_api.py` `_rebase_with_recovery`: before translating `attempt_open`, consult the execution record for the open attempt (helpers around `_execution_control_status` / `_load_execution_cancellation` in `durable_interaction_host.py`, and owner liveness the way `session_execution_guard.py` checks dead owners); if terminal or owner dead, append the canonical terminal with code `cold_terminal_repair` under the exact attempt authority (reuse the shape of `_memory_v2_takeover_recovery_event` in `unchain_adapter.py` ~L1650) for the step and, when the root attempt is also open, the root; then run the existing recovery and retry the rebase once. A running attempt with a live owner is never repaired.
- Tests: `tests/test_memory_v2_unchain_generation_api.py`: open attempt + terminal execution record → repaired and rebased; open attempt + live owner → still `context_v2_rebase_in_progress`; repaired event carries the fixed code and origin. AC-389-4: a copy of the owner's `context_v2.sqlite3` (ask the project owner for the copy path; never open the live file for writing) — all ten attempts rebase after repair.
- **Checkpoint 4** after P2: strong agent reviews identity handling and the live-owner guard before the renderer changes.

### P3 — Stop and late approvals (PuPu)
- Investigate first (report before editing): in `durable_interaction_host.py`, what happens when a tool-approval request is registered for an execution that already has a cancellation (`_load_execution_cancellation`); the morning case had the request created after the Stop and it stayed active. Then make the host refuse or immediately resolve such a request as cancelled so `getPendingInteraction` returns `none`, and make the tool-confirm callback in `unchain_adapter.py` (`_make_tool_confirm_callback`, the `if normalized_cancel_event.is_set()` branch) not leave a durable request behind.
- Tests: `tests/test_durable_interaction_host.py`: request after cancel → not pending; cancel after request → resolved cancelled; `tests/test_adapter_interject.py` or the nearest callback test for the race.
- **Checkpoint 5** after P3.

### F1 — renderer reopen (PuPu)
- Edit: `src/PAGEs/chat/hooks/use_chat_stream.js` `lookupDurableInteraction`: when `pending.status !== "receipt_recorded"` and the chat is not streaming, seal through the existing `interaction_suspended` cancellation path instead of building an actionable card; keep the receipt-recorded path; remove the reload-time `resume_interaction` start (`submittedHumanInputId` on reload); leave live-run paths untouched. Update the comment block at ~L9758 to state the new rule.
- Tests: `src/PAGEs/chat/chat.test.js`: flip "rehydrates an awaiting durable interaction without cancelling or auto-resuming it" (~L3645) to expect `cancelExecution` with `interaction_suspended`, no card, no stream start; flip "keeps a failed durable human-input request actionable…" (~L3709); adjust "stopping a recovered durable wait…" (~L4205); keep "seals a recorded durable receipt on reload without auto-resuming" (~L4257) and every `startStreamV2/V4 not called` assertion.
- Run `npm test -- --watchAll=false --testPathPattern="chat.test|use_chat_stream"`.
- **Checkpoint 6** after F1: strong agent runs the AC-389-7 matrix on a fresh instance and records journal evidence; then implementation-ready.

## Verification commands (summary)
- Unchain: `cd /Users/red/Desktop/GITRepo/unchain-389 && PYTHONPATH=src .venv/bin/python -m pytest tests -q -p no:cacheprovider`
- PuPu sidecar: `cd /Users/red/Desktop/GITRepo/pupu-389/unchain_runtime/server && UNCHAIN_SOURCE_PATH=/Users/red/Desktop/GITRepo/unchain-389 /Users/red/Desktop/GITRepo/unchain-389/.venv/bin/python -m pytest tests -q --tb=short -p no:cacheprovider` (known environment failures unrelated to this ticket: 3 screenshot tests without Pillow, 5 Kimi replay tests pinned to anthropic 0.83.0)
- PuPu renderer: `cd /Users/red/Desktop/GITRepo/pupu-389 && CI=true npx react-scripts test --watchAll=false --testPathPattern="chat.test|use_chat_stream|context_v2_turn_mutation"`
- Real app: `cd /Users/red/Desktop/GITRepo/pupu-389 && ln -s ../PuPu/.venv .venv && UNCHAIN_SOURCE_PATH=/Users/red/Desktop/GITRepo/unchain-389 npm run start:electron`, then prove the loaded code per `dev-run-instance` before any claim, and tear the instance down afterwards.
- Restart the sidecar after every Python change before a real-app check and say so in the evidence.

## Delegation assessment

**Partially suitable.** Root cause, vocabulary, payload shape, authority rules and tests are settled, so U1, P1 and F1 are bounded slices with observable red-to-green signals and can be implemented by the model the project owner selects. U2 touches the rebase acceptance of a new execution terminal type next to CRITICAL code, P2 writes durable records on behalf of dead runs, and P3 starts with an investigation of a race; these stay under strong-model checkpoints (2, 4, 5) and the implementer must stop and report before editing beyond the listed files. Worker model: the project owner's choice (recorded on the ticket when dispatched). Strong reviewer: the planning agent of this ticket at checkpoints 1–6. Stop conditions: any need to change `select_attempt_terminal`, `_execution_is_cancelled`, journal schemas, or the SSE error contract; any test in the listed suites failing for a reason not explained by the slice; any doubt about attempt identity in P2.

## Known limitations to carry into the delivery notes
- Journals from older builds are repaired lazily on next rebase, not proactively.
- The visible tool-call chain after pause (#384) is unchanged.
- #386's provider-failure texts are on a separate branch; when both merge, a 5xx that exhausts retries will produce both the new text and the terminal.

## Implementation log

### U1 (kernel terminal) — done, at checkpoint 1 (implementer: Sonnet 5.5)

Files (Unchain, uncommitted): `src/unchain/kernel/lifecycle_events.py` (`build_run_failure_payload`), `src/unchain/kernel/run_outcomes.py` (`TERMINAL_EVENT_TYPES`, `emit_run_failure_terminal`), `src/unchain/kernel/loop.py` (`_RUN_OBSERVER` ContextVar, recording in `emit_event`, terminal emission in `_run_state_with_failure_bundle`), tests `tests/test_kernel_failure_terminal.py` (8) and `tests/context_v2/test_sqlite_generation_rebase_v2.py::test_kernel_failure_terminal_payloads_let_a_dead_graph_prefix_rebase` (2).

Deviations from the plan, for the reviewer:
1. **Payload shape**: `code` and `message` are top-level (`{iteration, status, code, message, recoverable}`), not a nested `error{}`, because the V4 normalizer reads `raw_event["code"]` / `["message"]` for `run_failed` and the existing takeover recovery event uses the same top-level shape. No `bundle` field is included.
2. **`run_cancelled` has no V4 projection** (the normalizer returns `[]` for unknown raw types). That is intended: a Stop adds no UI event; it only journals the terminal. AC-389-1 is read accordingly (`run.failed` projected, `run_cancelled` journal-only).
3. **The callback must not be wrapped.** A first version wrapped the user callback to observe events; four `tests/context_v2/test_context_provider_turn_*` tests failed with `SemanticEventProjectionError: tool execution subject is missing` because the context runtime identifies its callback object. Observation moved to a ContextVar read in `KernelLoop.emit_event` (records the `run_started` run id and whether a terminal was already attempted).
4. **Cancellation classification is narrow**: only `ExecutionCancelledError` yields `run_cancelled`. The PuPu tool-confirmation cancel raises a plain `RuntimeError("stream cancelled during tool confirmation")` and therefore yields `run_failed` with `kernel_run_failed` from the kernel; P1 must decide (and, if the execution record is cancelled, write the cancelled terminal itself or treat the failed terminal as sufficient).
5. Terminal emission is best effort: an exception from the callback (for example a latched journal failure) is swallowed so the run's own error reaches the caller. If the terminal is not persisted the attempt stays open exactly as before.

Evidence (kept outside the repo): red 5 failed / 3 passed before the change; after: targeted 158 passed, rebase acceptance 3 passed, Unchain full suite 3826 passed, 16 skipped, 5 xfailed. GitNexus detect_changes: 4 files, 8 symbols, 0 flows, risk low.

Decision needed at checkpoint 1: accept deviations 1, 2 and 4 (especially how P1 treats the tool-confirmation cancel) before U2 starts.

### Checkpoint 1 review (reviewer: Opus 5.5) — correct before continuing

Independent verification, not the implementer's report: diff read in full; U1's own tests rerun (10 passed); an acceptance probe drove the real sidecar graph runner (`adapter._stream_recipe_graph_events`, Memory V2 active, real Unchain kernel and journal, offline provider whose second node raises) against the untouched base (`git archive 48f235d`) and against U1, then replayed the raw events through the exact route_chat V4 sequence (`RuntimeEventBridge.normalize` for each event, `emit_transport_failure` on the exception). The probe lives outside the repository; its reports are kept with the ticket evidence.

What U1 achieves (proven by the probe): base leaves the failed step attempt ending at `provider.wire_snapshot` with no terminal, which is exactly the pattern in the owner's profile; with U1 that attempt ends with one `run_failed` (code `durable_provider_turn_uncertain`, message `Run failed`), the completed step is untouched, and no provider text reaches the raw events or the SQLite file. As planned, U1 alone does not unblock the chat: the orchestration attempt still has no terminal and the failed step has no `graph.step.failed` seal (U2/P1).

Accepted deviations: (1) top-level `code`/`message` — the V4 projection shows the expected code and fixed message; (2) no V4 projection for `run_cancelled` — a Stop is renderer-initiated and route_chat already ends with a cancelled `done`; (3) ContextVar observation instead of wrapping the callback — nested per-step runs stay isolated (only the failed step got a terminal).

Required corrections before U2:
- **C1 cancellation classification.** PuPu cancels with `RuntimeError("execution attempt was cancelled")` carrying `code = "execution_cancelled"` (`unchain_adapter.py` `_execution_raise_if_cancelled`), not `ExecutionCancelledError`. Measured: U1 emits `run_failed` / `execution_cancelled` for it. Classify as cancelled when the exception is `ExecutionCancelledError` **or** the sanitized `error_code == "execution_cancelled"`; add the test. This also resolves deviation (4): in P1 the tool-confirmation cancel (`RuntimeError("stream cancelled during tool confirmation")`) gets `code = "execution_cancelled"` so the kernel emits `run_cancelled`; the sidecar never adds a second terminal.
- **C2 lost ownership.** Measured: `ExecutionLeaseNotOwnedError` and `StaleExecutionLeaseError` each produce a `run_failed` for the attempt. When ownership is lost another owner may be running that attempt, and a second terminal makes the rebase fail with `attempt_duplicate_terminal` → `journal_incompatible` (the chat is quarantined). Emit nothing for `ExecutionLeaseError` subclasses other than `ExecutionCancelledError` (not owned, expired, stale, active lease); test all four.
- **C3 missing required evidence.** The handoff required proof that the terminal reaches the journal through the real context runtime; U1's rebase test appends the payload to the sink directly. Add the probe as a repository test, `unchain_runtime/server/tests/test_memory_v2_graph_failure_terminal.py`: failed step attempt has exactly one `run_failed` in the journal, the completed step has only `run_completed`, no provider text in raw events or the database, and V4 carries the step-level `run.failed` (step run id) plus exactly one root transport failure.

Observation for checkpoint 3: the new step-level `run.failed` reaches the renderer with the step's run id, so `activity_tree.js` routes it as a child-run failure (same path as the existing step-level `run.completed`), not as a second root error. Confirm the visible chain in the real app.

Release condition for U2: C1–C3 done, U1 tests plus the new sidecar test green, Unchain full suite green, reviewer confirms.

### Checkpoint 1 corrections C1–C3 — done, awaiting reviewer release (implementer: Sonnet 5.5)

- **C1** `src/unchain/kernel/loop.py`: `cancelled = isinstance(exc, ExecutionCancelledError) or error_code == "execution_cancelled"`. Test `test_a_cancel_carried_by_the_host_error_code_is_cancelled_not_failed` (red before, green after).
- **C2** same handler: `lost_ownership = isinstance(exc, ExecutionLeaseError) and not isinstance(exc, ExecutionCancelledError)`; no terminal is emitted for it. Test `test_lost_ownership_emits_no_terminal_for_an_attempt_another_owner_may_hold` covers `ExecutionLeaseNotOwnedError`, `ExecutionLeaseExpiredError`, `StaleExecutionLeaseError`, `ActiveExecutionLeaseError` (red before, green after).
- **C3** new `unchain_runtime/server/tests/test_memory_v2_graph_failure_terminal.py` (3 tests): failed step attempt has exactly one `run_failed` and is last, the completed step only `run_completed`; provider text is absent from raw events and from the SQLite file; V4 carries one step-level `run.failed` (`graph-step-…`, message `Run failed`) and exactly one root `run.failed`. Against the untouched base Unchain the terminal and V4 tests are red (2 failed, 3 passed, the other assertions hold vacuously there); against the corrected Unchain all pass.
- One test was dropped: a sidecar-level lost-ownership case injected the lease error from the provider transport, where the durable provider-turn runtime wraps it into `DurableProviderTurnUncertainError` before the kernel sees it, so it did not exercise the real path. Real lease loss comes from the kernel's own `execution_guard.assert_active()`; the kernel-level test above covers it.

Results: kernel and boundary suites 85 passed; sidecar graph set (new test, active graph restart, chat stream v4) 31 passed; Unchain full suite 3831 passed, 16 skipped, 5 xfailed. Not committed.

Open for the reviewer: with C1 in place the tool-confirmation cancel must carry `code = "execution_cancelled"` (P1 item, not done yet).


### U2 part 1 (run-time step seal) — done (implementer: Sonnet 5.5; started on the project owner's instruction, 2026-09-30). Its "Deviation" paragraph (root stays open) is WITHDRAWN: see "U2 part 2" below.

Files (Unchain, uncommitted): `src/unchain/context/graph_checkpoint.py` (new `GraphCheckpointService.fail_step(plan, step_index, *, status)`), tests `tests/context_v2/test_graph_checkpoint.py` (+12 tests, 17 cases) and `tests/context_v2/test_sqlite_generation_rebase_v2.py` (+3 tests, 5 cases).

`fail_step` seals a step whose run ended with a failed or cancelled canonical terminal: it requires a durable start and a canonical terminal after it, requires the requested status to agree with that terminal (`GraphCheckpointConflict`), is idempotent for an already sealed step, refuses a completed step or a different existing seal, and reuses `JournalGraphCheckpointRepository.terminal`. `scan` (GitNexus **CRITICAL**: 10 symbols, 8 flows) and `recover` (HIGH) are not edited; `fail_step` only reads what `scan` returns.

**Deviation from the plan, for the reviewer: no `finalize_failed`, no root terminal, no `graph.execution.failed` / `graph.execution.cancelled`.**
- The rebase preflight already defines the quiescent shape of a dead graph: a sealed failed/cancelled step under an orchestration attempt whose last event is `graph.execution.admitted` (`sqlite_generation_rebase_v2.py` dead-prefix branch, `admission == attempt_events[-1]`). `test_real_root_terminal_and_dead_graph_prefix_are_quiescent` exists for it.
- Writing more would be refused by the same code: the orchestration group allows only `graph.execution.admitted` and `graph.execution.completed` (`GRAPH_ATTEMPT_KIND_AMBIGUOUS` otherwise), and a root canonical terminal is refused unless every step completed and the execution seal precedes it (`GRAPH_EXECUTION_SEAL_MISMATCHED`). New test `test_a_root_terminal_on_a_dead_graph_is_refused_so_the_root_stays_open` pins this.
- Making the preflight accept them would change fail-closed rebase code and break downgrade: a binary without that change would raise `journal_incompatible` for those chats and quarantine them. The ticket promises no journal schema bump and rollback safety (same posture as #195), and `graph.step.failed` / `graph.step.cancelled` are already known to every released build.
- Real data (owner's profile, read-only `immutable=1`, queried 2026-09-30): 17 graph-step attempts across 7 chats are open; for all 17 the orchestration attempt's last two events are `graph.execution.admitted` then `message.user` and it has no terminal. That is exactly the shape the preflight accepts once the step is sealed.
- Consequence for later slices: BC-389-1's "root terminal" and the root half of SEQ-389-1/-2 are not produced; P1 seals only the step (and, on cancellation, writes the step's `run_cancelled` through the host boundary when the kernel could not). The ticket body's SEQ-389-1 line "run_failed (root) + execution terminal" should be corrected if the reviewer accepts this.

Evidence (kept outside the repo): `fail_step` tests 17 red before the method existed, then `test_graph_checkpoint.py` 29 passed; the rebase tests fail with `AttributeError` on a copy of the source without `fail_step` (4 failed, 1 passed: the unchanged recovery path) and pass with it; Unchain full suite 3853 passed, 16 skipped, 5 xfailed. GitNexus detect_changes (all of U1+C+U2): 6 files, 16 symbols, risk high; the `finalize` hit is a line shift, its body is unchanged.

Decision needed at checkpoint 2: accept the deviation (step seal only; root stays open by design) before P1 starts.

### U2 revised plan (2026-09-30, after Codex review of checkpoint 2) — root terminal; approved by the project owner and implemented, see "U2 part 2"

Owner direction: every attempt ends with exactly one canonical terminal (BC-389-1 as written), including the orchestration ("root") attempt. The checkpoint-2 deviation ("root stays admitted") is withdrawn. Verified gaps that this plan closes (temporary-database probe, 2026-09-30): with a root `run_cancelled` written, `recover()` reports no terminal, `start_step` is allowed before the first step and between steps, and `finalize()` appends `graph.execution.completed` after the cancel. Cause: `scan` keys on `graph_scope_id`, so root `run_*` events are skipped.

Target journal shapes (root = orchestration attempt; `T` = `run_failed` or `run_cancelled`):

| # | Stop / failure timing | Steps | Root |
|---|---|---|---|
| S1 | a step's run failed or was stopped | completed prefix, dead step: `run_*` + `graph.step.failed|cancelled` | `graph.execution.admitted`, `T` |
| S2 | Stop before the first step started | none | `admitted`, `run_cancelled` |
| S3 | Stop between two steps (after `complete_step`) | completed prefix only | `admitted`, `run_cancelled` |
| S4 | Stop after the last step completed, before `finalize` | all completed | `admitted`, `run_cancelled` (no `graph.execution.completed`) |
| S5 | failure after `finalize` (root completion hooks) | all completed + `graph.execution.completed` | `admitted`, `graph.execution.completed`, then `run_failed` (or `run_completed` if the root already finished: then nothing is added) |

Rule (as implemented, order matters): a completed step is never given a cancelled terminal. When the graph did NOT complete (S1–S4) the root terminal is the last event of the root attempt, follows `admitted` directly, and no execution seal exists. When the graph DID complete (S5) the order is `graph.execution.completed` and then the root's own outcome: `run_completed`, or `run_failed` / `run_cancelled` if something fails after `finalize` (accepted by the preflight and by `scan`). The contradictory order, a failed or cancelled root terminal followed by `graph.execution.completed`, is refused ("graph terminal is ambiguous" in `scan`, `attempt_continued_after_terminal` in rebase).

Edits (Unchain):
1. `context/graph_checkpoint.py` `JournalGraphCheckpointRepository.scan` — **CRITICAL** (9 direct callers, 9 flows: `recover`, `complete_step`, `fail_step`, `finalize`, `resume_step`, `read_completed_output`, `resolved_interaction_for_step`, `prove_graph_interaction_lineage`, rebase `recover_generation_rebase_attempt`). One branch at the top of the event loop: an event of the orchestration attempt whose type is in `_FAILED_TERMINALS | _CANCELLED_TERMINALS` sets `graph_terminal` (FAILED / CANCELLED); a second graph terminal of any kind is ambiguous, and so is a `graph.execution.completed` after a failed/cancelled root terminal (the contradictory order); a failed/cancelled root terminal after `graph.execution.completed` is the root's own later outcome and is ignored. Root `run_completed` stays ignored (the completed terminal is the execution seal). Nothing else in `scan` changes. Effect: `start_step` / `resume_step` / `resolved_interaction_for_step` already refuse when `terminal_status` is set ("terminal graph execution cannot advance").
2. `GraphCheckpointService.finalize` — refuse when `recovery.terminal_status` is FAILED or CANCELLED (new error text "terminal graph execution cannot finalize"). `complete_step` and `recover` keep sealing evidence that already exists (a completed step under a cancelled root is S4; a crash between the step's `run_completed` and its seal must still recover).
3. `persistence/sqlite_generation_rebase_v2.py` `_assert_no_open_attempt_or_tool` (LOW), orchestration branch: when the root canonical terminal is failed/cancelled, accept iff no execution seal, the terminal is the last event and the only event after the admission, and the step states are either a valid dead prefix (S1: exactly one dead step, completed before it, nothing started after it) or a completed-only prefix of any length (S2–S4). Then `continue` before the `if completed:` recovery branch, so `graph_execution_seal_missing` recovery never runs for a cancelled root. A started-but-unsealed step still blocks with `attempt_open` (step branch, unchanged). `select_attempt_terminal` untouched.

Tests, red before green:
- `tests/context_v2/test_graph_checkpoint.py`: for S1–S4, `recover().terminal_status` is the root status; `start_step` (next or replay) and `resume_step` raise "cannot advance"; `finalize` raises "cannot finalize"; `fail_step`/`complete_step`/`recover` still seal existing evidence under a terminal root; root `run_completed` alone changes nothing; root terminal followed by `graph.execution.completed` → "ambiguous".
- `tests/context_v2/test_sqlite_generation_rebase_v2.py`: S1–S4 rebase to revision 2 with no recovery; flip `test_a_root_terminal_on_a_dead_graph_is_refused…` into the S1 acceptance; refusals keep their reasons: execution seal + failed root (`graph_execution_seal_mismatched`), root terminal not last (`attempt_continued_after_terminal`), invalid dead prefix (`graph_step_sequence_invalid`), root terminal with an open step (`attempt_open`); legacy journals (no root terminal) keep today's paths (`graph_step_seal_missing` recovery, `attempt_open`).
- Downgrade evidence (scratchpad script, output kept with the ticket evidence): the base Unchain (`git archive 48f235d`) preflight on an S1 and an S4 journal → `journal_incompatible` / `graph_execution_seal_mismatched`. Record in the ticket: a build without this change cannot edit or resend a chat that failed or was stopped after the upgrade, nor a legacy chat repaired by P2; same posture as #195/#386 (profile backup before install), no schema change.
- Then Unchain full suite, GitNexus detect_changes, plan and ticket update (BC-389-1 unchanged; SEQ-389-1/-2 gain the S2–S4 cells; "Impact / risk" gains the downgrade note), checkpoint-2 report revised.

Consequences for later slices:
- P1: failure branch → `fail_step(current)` then root `run_failed` through `PupuUnchainHostEventBoundary.bind_semantic`, journal-only (route_chat already emits the one root `run.failed` to V4; the C3 test pins exactly one). Cancel at 10873 (after a step's run, before its seal), 10931 (after the loop, before `finalize`) and before the first `start_step`: no step terminal for a completed step; root `run_cancelled` only; the kernel's own `run_cancelled` for an interrupted step (C1) is followed by `fail_step(CANCELLED)` then the root terminal.
- P2: cold repair writes, in order, the open step's terminal (if the step is open), its seal, then the root terminal; the 17 legacy attempts end in S1 or S4 shape. Never for a running attempt with a live owner.

Stop conditions unchanged, plus: any need to touch `select_attempt_terminal`, any `scan` change beyond the one branch, or any test in the listed suites failing for a reason the slice does not explain.

Approval needed before editing: `scan` is CRITICAL per GitNexus.

### U2 part 2 (root terminal) — done, at checkpoint 2 (implementer: Sonnet 5.5; `scan` edit approved by the project owner, GitNexus CRITICAL)

Files (Unchain, uncommitted): `src/unchain/context/graph_checkpoint.py` (`scan`: one branch before the scope filter, `next_index` handling; `finalize`: refusal; constant `_ROOT_DEAD_TERMINALS`), `src/unchain/persistence/sqlite_generation_rebase_v2.py` (`_assert_no_open_attempt_or_tool`, orchestration branch, plus two constant imports), tests in `tests/context_v2/test_graph_checkpoint.py` and `tests/context_v2/test_sqlite_generation_rebase_v2.py`.

What it does:
- **`scan`**: an orchestration-attempt event of type `run_failed|run_cancelled` (and aliases) sets the graph terminal (FAILED / CANCELLED). If the graph already completed (`graph.execution.completed` earlier) it is the root's own later outcome and is ignored, as before; a second graph terminal, or a `graph.execution.completed` after a root terminal, is "graph terminal is ambiguous". A started step without a seal is still reported (uncertain / suspended), so `recover` can seal evidence it already has (crash between a step's `run_completed` and its seal, then a cold cancel = S4); `next_step_index` is None once the root is terminal. Nothing else in `scan` changed.
- **`finalize`**: refuses with "terminal graph execution cannot finalize" when the graph is failed or cancelled. `start_step`/`resume_step`/`resolved_interaction_for_step` already refuse on a terminal graph ("cannot advance").
- **Rebase preflight**: a failed or cancelled root terminal with no execution seal is accepted when the admission is the event right before it (terminal last and sole event after the admission); step checks still decide: an unsealed step with a terminal asks for recovery first (`graph_step_seal_missing`), a started step without a terminal stays `attempt_open`, an invalid dead prefix stays `graph_step_sequence_invalid`. Refusals unchanged: root terminal not last (`attempt_continued_after_terminal`), two root terminals (`attempt_duplicate_terminal`), root cancelled and then a completed graph (`attempt_continued_after_terminal`). A root `run_failed` after a completed, sealed graph is still accepted (existing behaviour, now covered by a test); `select_attempt_terminal` untouched.

Deviation from the plan text: the plan said a second graph terminal "including a later `graph.execution.completed`" is ambiguous in every order; the implementation keeps the legacy-compatible case (root failure after a completed graph), because P1 must be able to record a failure that happens after `finalize`.

Shapes covered (checkpoint and rebase layers): S1 failed and cancelled step, S2 Stop before the first step, S3 Stop between steps, S4 Stop after the last step before `finalize`, plus a restart (reopened store) for each.

Evidence (kept outside the repo): checkpoint tests 9 red before the change, then `test_graph_checkpoint.py` 44 passed; rebase tests 8 red before the change, then the module 128 passed (both modules 173); Unchain full suite 3878 passed, 16 skipped, 5 xfailed; probe of the contradictory orders on the pre-change `scan`: Stop before the first step and between steps allowed `start_step`, and Stop after the last step allowed `finalize` to append `graph.execution.completed` after the cancel (Codex's finding, reproduced).

**Downgrade evidence (BC-389-1 persistence compatibility)**, same journals, base Unchain 48f235d vs this branch (rebase on the edit intent): S1 failed step + root `run_failed`, S2 and S4 with root `run_cancelled`: base `journal_incompatible` / `graph_execution_seal_mismatched` (the chat cannot be edited or resent), this branch rebases (revision 2). A legacy journal (dead step sealed, root left at admitted) rebases on both. Therefore: a build without this change cannot edit or resend (a) a chat whose run failed or was stopped after the upgrade, nor (b) a legacy chat that P2 repairs. No schema change; same posture as #195/#386 (back up the profile before installing); to be stated in the delivery notes and the ticket body.

GitNexus: `scan` CRITICAL (9 direct callers, 9 flows) edited with the owner's approval, only the branch described above; `_assert_no_open_attempt_or_tool` LOW; detect_changes for U1 + corrections + U2: 7 files, 39 symbols, risk critical (the `scan` edit).

Decision needed at checkpoint 2: release P1.

Consequences for P1/P2 (updated): P1 failure branch = `fail_step(current step)` then root `run_failed`; a failure after `finalize` = root `run_failed` only; Stop at the cancel checks (before the first `start_step`, between steps after `complete_step`, after the step loop before `finalize`) = root `run_cancelled` only, never a cancelled terminal for a completed step; the kernel's own `run_cancelled` for an interrupted step (C1) is followed by `fail_step(CANCELLED)` then the root terminal. P2 cold repair writes step terminal (if the step is open), its seal, then the root terminal, in that order; never for a live owner.


### P1 — done, at checkpoint 3 (implementer: Opus 5.5 / Fable 5.1; released by the reviewer after checkpoint 2)

Files (PuPu, uncommitted): new `unchain_runtime/server/memory_v2_unchain_graph_failure.py`; `memory_v2_unchain_graph_checkpoint.py` (`fail_step`, `step_event_sink`); `unchain_adapter.py` (`_stream_cancelled_error`, `_graph_run_lost_ownership`, three callback raises, settle call in the graph runner's `except Exception`); tests `tests/test_memory_v2_graph_settle.py` (new, 16), `tests/test_unchain_adapter_capabilities.py` (+2 tests, 1 extended), `tests/test_memory_v2_graph_failure_terminal.py` (trailing seal). Unchain unchanged since U2.

Reviewer requirements from checkpoint 2, and where each is met:
1. **No blanket `fail_step(current)`**: the settle reads the journal. A step with a terminal is sealed by `recover()` as what it is; only a step this run was executing with no terminal gets one; a parked step (interaction pending or answered) is untouched and keeps the root open; a never-started step gets nothing. Tests: first/second step failing, Stop during a model call, Stop before the first step; the existing cold-resume tests pin the parked rule (a mutation that closes parked steps fails both of them).
2. **Stop between a step's `run_completed` and `complete_step`**: sealed `graph.step.completed`, root `run_cancelled`, never a cancelled step (`test_stop_between_a_steps_run_and_its_seal_seals_it_completed`; with the settle disabled the chat stays `context_v2_rebase_in_progress`).
3. **Failure after `finalize`**: root `run_failed` after `graph.execution.completed`; a root that already has `run_completed` gets nothing (`test_a_root_that_already_has_its_terminal_gets_no_second_one`); every root terminal is journal-only, so V4 carries no root `run_failed` from it (`test_the_root_terminal_stays_in_the_journal_only`, 5 cases); lost ownership writes nothing (`test_lost_ownership_writes_nothing`).

Mutation check (each mutation applied, run, restored): root-terminal check removed → 1 test fails; `recover()` skipped → 4; cancelled flag ignored → 5; parked step also closed → 2 (cold resume); root closed despite a parked step → 2; lost-ownership guard removed → 1.

Red before green: 9 of the 16 settle tests failed before the settle existed (the other 7 assert things the base already did: no second root terminal, no write on lost ownership, journal-only root events); the 3 cancel-code assertions failed on the base callbacks (`'' != 'execution_cancelled'`).

Real sidecar evidence (headless, isolated profile, no Electron, no owner data): harness `scratchpad/real_sidecar_p1/run_evidence.py` starts the clone's real `unchain_runtime/server/main.py` (app interpreter, `UNCHAIN_SOURCE_PATH=unchain-389`), drives `/chat/stream/v4`, `/chat/executions/cancel`, `/context/v2/session/head` and `/context/v2/session/rebase` with a loopback fake provider (Ollama protocol custom provider), hard-kills the process and starts a second one on the same profile.

| Scenario | This branch | Base (dev 3394b12 + Unchain 48f235d) |
|---|---|---|
| A provider failure | step `run_failed` + `graph.step.failed`; root `admitted, run_failed`; V4 one step and one root `run.failed`; edit/resend 200 (rev 2) | no terminal, no seal; edit/resend 409 `context_v2_rebase_in_progress` |
| B Stop during the model call (cancel route) | step `run_cancelled` + `graph.step.cancelled`; root `admitted, run_cancelled`; V4 no root failure; edit/resend 200 | same 409 |
| C after A, sidecar hard-killed and restarted | new message completes (new root `graph.execution.completed, final_message, run_completed`); edit/resend 200 (rev 3) | new message completes; edit/resend still 409 |
| D after B, same restart | same as C | same as C (409) |

Full suites: PuPu sidecar 2653 passed, 2 failed (`test_main_memory_v2_deletion_startup.py`, fail identically on unmodified base: pre-existing), Unchain unchanged since U2 (3878 passed). detect_changes (tracked files): 3 files, 27 symbols, risk medium, flow `run_workflow`; `_is_execution_cancelled_error` listed only by line shift.

Not done in P1 (unchanged scope): `emit()` gate (not needed, see the plan text), late approval after Stop (P3), cold repair of legacy journals (P2), renderer (F1). The real app (Electron) was not started; the AC-389-7 matrix belongs to checkpoint 6.

## Resumption — 2026-10-11

The owner authorized completing the remaining implementation after baseline sync.
Checkpoint 3 source integration was independently revalidated (498 tests + 48
subtests). Continue P2/P3 and F1, retaining development checkpoints internally;
no commit/push/PR until close. Existing UI patterns are retained: immediate Stop
state, Interrupted history, existing waiting status and cancel control. No new
visual component or alternative layout is proposed.

Delegation assessment remains partially suitable: the bounded F1 reload policy
(no restored actionable approval or automatic human-input resume; preserve live
approvals and history) will use gpt-6-luna/high with parent review. Worker owns
only use_chat_stream.js reload branch and related chat tests until checkpoint F1.
Parent owns P2/P3, Stop/wait integration, cross-boundary review and final tests.
No worker may change durable schemas or cancellation identity.

### P2 current boundary contract

BC-389-4: producer is the cold-repair host under session_rebase_guard and memory
background source guard; consumer is the existing Unchain DurableEventSink and
GraphCheckpointService.recover. Admission CLOSED. A new host origin
cold_terminal_repair admits exactly {type,run_id,iteration,status,code,message,
recoverable}; type is run_failed/run_cancelled, code is cold_terminal_repair,
message fixed, iteration a nonnegative integer, recoverable false. Existing live
host-event origins keep their prior contracts. The bound event is revalidated
before the exact AttemptRef projector persists it; no UI delivery/provider/tool.
Identity is verified from current execution/generation journal and admitted graph
plan, never supplied frontend history. ExecutionControlRegistry exact session/root
record must show failed/cancelled or a proven dead PID; missing/unknown/completed
records cannot authorize repair. A live session guard still prevents repair even
when cancellation was requested. Existing successful step terminals stay intact.
No journal schema change; runtime contract is the installed Unchain manifest,
not source SHA. Mutable-source evidence is development only; fixed wheel pair
acceptance remains required before rollout.

SEQ-389-4 / AC-389-8: legacy started graph -> failure/Stop/dead PID -> cold reopen
-> acquire rebase guard -> append missing step terminal -> recover seal -> append
root terminal -> replay the same rebase once. Repeat the frozen request writes no
second terminal. Negative cells: live PID, missing control, different session,
completed control, mismatched identity/unknown fields, concurrent run guard. Cold
repair failure maps to a bounded nonretryable incompatibility, not infinite wait.

### P2 development checkpoint — 2026-10-11

Implemented journal-only legacy repair under exact owned session_rebase_guard.
The guard is independently checked inside the repair helper (same session,
execution, frozen operation and process incarnation). Missing step terminals are
appended via CLOSED cold_terminal_repair host origin, then existing graph recover
seals them, then missing root terminal is appended. Successful terminals are
preserved. The repair also runs before existing seal-only recovery, so a crash
between step-terminal and seal cannot let an unclosed root slip through legacy
rebase acceptance. Normal rebase still validates the complete journal afterwards.
A failed unrelated resume record does not authorize repair: only the admitted
plan's coordinator/root record is consulted. An explicitly abandoned root is not
resumed even if a prior answer had been accepted. Unresolved approvals are left
for the exact host cancellation path; no receipts are fabricated.

Evidence: original missing-terminal tests red, 45 cold-repair + generation API
tests green, including missing/live/wrong-session/completed control rejection,
cancelled-control + still-owned worker guard rejection, CLOSED payload drift,
retry idempotency, and crash after step terminal. Independent P3-agent review
found no identity/guard safety blocker. Copied current profile (SQLite online
backup opened source read-only, isolated object/control files): 21 chats with
unclosed graph-step attempts in current generation, 20 successfully rebased; 1
conservatively remains blocked with earlier completed coordinator records (no
failed/cancelled authority for those attempts). Original profile never mutated.
Report: /Users/red/.codex/backups/ticket-389-20261011-evidence/profile-repair-report.json.
A timeline_merge_policy KeyError in existing cold-presentation test also reproduces
against unchanged PuPu dev archive; keep separate from #389.

### Successor settlement wait — 2026-10-11

BC-389-5: the successor execution may wait up to 30 seconds for an ACTIVE or PARKED run
session guard whose exact predecessor control record is cancelled. It does not
steal/release that guard or replay the predecessor. Admission keeps retrying the
ordinary guard acquisition for the same new attempt; cancellation of that new
attempt exits without acquiring ownership. An uncancelled parked/live/missing/unverified
predecessor still fails closed immediately. No schema or endpoint changes.

BC-389-6: a foreground edit/resend/delete may poll only its already-frozen V2
rebase payload after `context_v2_rebase_in_progress`, every 250 ms within one
30-second deadline. It does not reread the head or start a model until the exact
ack is verified. A stalled bridge shares that deadline. Stop/unmount cancels the
local wait; timeout/cancellation retain the durable intent in quarantine for
explicit retry/discard. Already-issued server transactions are not rolled back
by stopping the local wait; late acknowledgements cannot start a new model.
Ordinary incompatible/failed responses keep the existing bounded retry policy.

SEQ-389-5 / AC-389-9: Stop leaves the old session guard held until background
finalization; a new request shows the existing composer waiting status and
retains its Stop control, then enters only after ordinary admission succeeds.
The frontend waits for acceptance evidence to leave this status. Old-attempt
callbacks remain fenced by the existing generation tombstone. Rebase waiting
has its own Stop action that quarantines the frozen intent and preserves visible
history; it cannot cancel an unrelated old/new execution by borrowing its ID.
Tests cover delayed release, new-attempt cancellation, timeout, fail-closed
parked/live/missing predecessors; frozen rebase polling, Stop/no further polls,
hanging bridge timeout, normal-send waiting and late old content rejection.

### BC-389-7 — failed/cancelled graph terminal runtime compatibility

Producer: the imported Unchain runtime module's immutable, digest-verified
`unchain.runtime_protocol_manifest.v1` declares
`context_memory.graph_failure_terminals_v1`. This feature means failed/cancelled
kernel terminal emission, graph failed/cancelled step seals, and acceptance of a
failed/cancelled orchestration terminal by graph recovery and generation rebase.
The manifest schema and protocol major/minor remain unchanged; feature admission
is additive and required. Git revision, source path and checkout cleanliness are
telemetry, never compatibility authority.

Consumers: PuPu Python capability admission, Electron Memory V2 rollout readiness,
and release artifact validation require the feature; the Windows contract fixture
tracks the identical requirement. Admission remains CLOSED at manifest/protocol
shape and VERSIONED by supported major/minor plus required features. An old wheel
without this feature is rejected before active Memory V2 use even if its revision
or path looks correct; no silent downgrade is allowed. Optional feature names
remain supported according to the existing extension policy.

SEQ-389-6: installed runtime manifest -> independent digest/shape verification ->
required feature match -> active admission. Repeat/restart recheck the imported
runtime; replacing it with an older wheel fails admission. Rollback of journals
already written with new root terminals remains incompatible with an older binary,
as documented in BC-389-1; this feature cannot make old binaries understand them.

AC-389-10: the real producer advertises the feature; removing only that feature and
re-signing the manifest must be rejected by Python, Electron and release gates.
Existing unknown-field, wrong-version, digest and identity negative matrices remain
in force. The `.js` Electron entries import their `.cjs` suites, so both entrypoints
exercise the same updated fixtures. Final packaged evidence must use the one newly
built wheel and record its SHA-256 plus this new manifest digest; the intermediate
wheel built before this feature is superseded and is not release evidence.


### Missing companion integration discovered — 2026-10-11

The first aggregate sidecar run exposed two timeline-policy failures. Both also
reproduce on unchanged PuPu dev. This was traced to missing integration, not
waived as an unrelated baseline issue: Unchain PR #47 (PuPu #383 companion) was
merged into `codex/ticket-386-gemini-5xx-catalog` after that dependency had already
landed in dev, so fetching dev omitted the tool policy implementation. The PR's
reviewed head already includes accepted dev/#390. The isolated Unchain #389 branch
was fast-forwarded to `3a7885bc04786d11c0b6e45b5d673b493283a73f`, then all #389
uncommitted work was restored; the before/after #389 patches compare byte-for-byte.
No new delivery commit, force push, main-checkout edit or running-app replacement.
The preservation stash and pre-integration patch remain outside the working tree.

Impact before integration: tool_harness, tool declarations/decorators and human
input are CRITICAL (up to 176 processes); Toolkit HIGH (29 direct imports).
Projector remained ambiguous/UNKNOWN despite exact file UID; text corroborated
its imports and producer/projector consumers. Warnings were communicated before
the fast-forward. Existing #383 contracts and independent review travel with its
commits, including frozen-array comparison and original-policy/omission replay.

BC-389-8 / SEQ-389-7 / AC-389-11: integration pairs PuPu dev with the already
accepted #383/#386/#390 producer plus #389. Timeline presentation remains outside
provider payloads and durable receipt identity; existing CLOSED/VERSIONED
contracts are unchanged. Validate real producer -> PuPu tool metadata and cold
policy consumers, first/second approval and nested arguments/legacy omission,
then full suites and real-app Stop/reopen/resend against the same fixed wheel.
PuPu's test dependencies must match its pinned Anthropic 0.83.0 and Pillow 10.2.0;
the initial isolated venv had Anthropic 1.10.0 and lacked Pillow, causing eight
additional environment failures. Those dependencies have now been corrected.

Superseded artifacts: `wheel` and `final-wheel` were preliminary and are not
acceptance evidence. The complete candidate uses `paired-wheel/unchain-0.2.0-py3-none-any.whl`
under `/Users/red/.codex/backups/ticket-389-20261011-evidence`, SHA-256
`30c3ecce6e2d417e68a1bb4d5a81dae074981bd1fd9928e118825371ff15b9c9`,
installed once to `paired-runtime`. All remaining evidence must reference this
artifact; runtime manifest digest is independently checked from its bytes.
This is a development wheel from the isolated uncommitted candidate, not a signed
release build or a clean-source provenance claim.

### Live cancellation ordering and failure-safe finalizers — 2026-10-11

Real Electron evidence (`electron-ui-3` and `electron-ui-4` in the isolated
#389 evidence directory) exposed a distinct ordering race: the live callback
raised on transport Stop, the kernel wrote a step terminal and graph seals,
then the concurrent HTTP cancellation appended `interaction.resolved`. This
violates terminal-last and makes resend correctly reject the journal. Merely
retaining a session guard does not repair that ordering.

BC-389-9: the exact live callback identity (execution, source attempt,
interaction) must finish canonical cancellation projection before it raises the
kernel cancellation. HTTP cancellation projects the exact resolution before
notifying registry/tombstone cancellation. The existing per-session commit lock
serializes the accepted-answer/cancellation boundary; accepted answers remain
unchanged. A parked exact cancellation seals its graph step/root before consuming
the parked guard. Active owners remain held until their stopped worker finalizes.
A foreign source/coordinator/interaction never acquires this authority.

Unchain adds the public typed `DurableInteractionSettlementPending`, carrying
exact execution/attempt/interaction IDs and a static safe error code/message.
Only matching execution and attempt identities defer the kernel terminal; this
is neither a lease-loss signal nor permission to suppress arbitrary failures.
PuPu treats that explicit condition as deferred durable settlement, parks the
stopped owner on its exact interaction, and preserves context for cancellation
retry or cold recovery. Read/proof/projection failures are covered by the same
boundary. A failure to retire an interaction in a worker finalizer cannot skip
resource disconnect or the SSE completion marker; it also cannot blindly release
the session guard. Existing provider-error terminals and ownership-loss rules
remain unchanged.

SEQ-389-8: live request -> (HTTP-first or transport-first) exact cancellation
projection -> kernel cancellation terminal -> step seal/root terminal -> guard
release. If projection fails: typed deferral -> no terminal -> stopped worker
parks guard -> later exact cancellation (same process or cold process) projects
resolution -> seals step/root -> releases exact guard. All stages are idempotent;
no provider or tool is resumed during retry. Finalizer exceptions always notify
stream completion independently of durable success.

AC-389-12: deterministic real-kernel two-thread tests block HTTP/transport
projection and assert no terminal before the barrier opens; failure injection
asserts no terminal while projection fails and successful exact cancellation
retry in both the same and a fresh process. Snapshot/lineage failures and a
foreign source cannot claim another owner. Separate graph/flat/resume worker and
setup injections verify bounded reader termination and preserved guards.

BC-389-10 / SEQ-389-9 / AC-389-13: imported runtime additionally declares
`context_memory.durable_interaction_settlement_fence_v1`. Python, Electron,
release validator and Windows contract require this feature so the intermediate
wheel with graph terminals but without typed deferral cannot be admitted. No
schema or protocol major/minor changes. Producer assertion, exact-ID positive/
negative kernel cases and feature-removed re-signed consumer manifests cover this
contract. A rebuilt installed wheel containing this feature supersedes all earlier
#389 candidate wheels; final artifact-pair evidence is recorded by the parent.

Pre-edit impact: PuPu callback builders LOW, each with three direct call paths
(graph/flat/resume); cancelled-guard consumption LOW, 15 reachable callers and two
worker flows. New finalizer lookup UNKNOWN on the older graph index, corroborated
by all five concrete adapter callsites. Unchain shared kernel failure wrapper
CRITICAL (241 reachable, 40 flows, 15 modules); warning communicated before the
narrow exact-type/identity change. Kernel terminal/provider/lease behavior and
runtime manifest suites are mandatory regression checks for this slice.

Parked-settlement authority clarification: `_append_terminal` reuses the CLOSED
`cold_terminal_repair` host-event origin only after matching the parked session
guard's execution/source/interaction and authorized coordinator (or exact cancelled
resume owner), the admitted canonical plan/step/configuration identity, the host
`cancelled:<checkpoint>` application, and the identical canonical accepted receipt.
The helper never seals on behalf of an active worker. The per-session commit lock
covers parked settlement through exact guard consumption. Pending-interaction
polling follows the same cancelled-settlement path: a host application alone cannot
release the parked guard. A real `get_pending_interaction` failure-injection test
keeps the guard when canonical projection fails; retry seals before release.

### Final isolated Electron acceptance — 2026-10-11

AC-389-7 / AC-389-9: `e2e/pupu-stop-389.spec.js` passed against the installed
`verified-runtime` wheel (SHA256
`a5486e70741c42e3471961d3b892a50eecd0854333b636ef4688d718a7297ab9`), with
import-path and live sidecar manifest both verified as
`sha256:b163345c68666cc2dbe766a3a8e75da0246748def8fa9b1be75f446d9148da3f`.
The isolated Electron profile used only a loopback fake Responses provider and
local deterministic MCP fixture. No real credentials or user profile were used.
Evidence: `/Users/red/.codex/backups/ticket-389-20261011-evidence/electron-ui-final-2/`
(`electron-report.json`, screenshots, `electron-context-v2.sqlite3`,
`journal-terminals.json`, execution/guard snapshots, and process log).

All 12 reported cells passed: first/second normal message; Stop during a model
response; Stop awaiting a question; Stop awaiting a real destructive MCP tool
approval; resend after each Stop case; successor waiting and cancellation;
late provider content absent; reopen without an automatic provider request;
provider failure and successful resend. Measured Stop UI feedback was 33–66 ms.
The delayed provider socket remained writable and emitted its late delta; the
stopped chat did not accept it. Tool cards remained visible as Interrupted.
The MCP destructive tool was never executed. Stop used real pointer clicks;
Resend used the existing button's DOM click dispatch after hover because its
hover wrapper intercepts Playwright pointer clicks.

Read-only journal evidence confirms interaction resolution precedes the step
terminal, graph seal, and root terminal (question sequences 16/17/18/19;
real tool approval 17/18/19/20). Model Stop and provider failure each contain
step and root terminal plus matching graph seal. No session guard remained
apart from the protocol marker. The earlier failed preliminary runs are
retained separately; they are not counted as acceptance.

Focused successor guard coverage: 54 tests and 11 subtests passed. The existing
frontend successor-wait test additionally verifies that `stream_started`
(the projection of V4 `session.started`, emitted before guard admission) does
not clear the waiting message; authoritative `run_started` does.

Reproduction command (from the `pupu-389` checkout; unique report directory per
run):

```sh
PUPU_E2E_PORT=2924 PUPU_E2E_RELEASE=1 PUPU_STOP389_UI=1 \
PUPU_STOP389_REPORT_DIR=/Users/red/.codex/backups/ticket-389-20261011-evidence/electron-ui-final-2 \
UNCHAIN_SOURCE_PATH=/Users/red/.codex/backups/ticket-389-20261011-evidence/verified-wheel-source \
UNCHAIN_PYTHON_BIN=/Users/red/Desktop/GITRepo/unchain-389/.venv/bin/python \
npx playwright test e2e/pupu-stop-389.spec.js --workers=1
```

The evidence-only source-layout shim is necessary because Electron's existing
source resolver expects `pyproject.toml` plus `src/unchain`. The shim contains
minimal package metadata and symlinks `src/unchain` and
`src/unchain-0.2.0.dist-info` to the exact installed `verified-runtime` package
and metadata. The spec resolves the real imported package path and asserts the
manifest against both the import and live sidecar status; fallback to a sibling
checkout is a test failure. Production source validation is unchanged. Fixture
MCP audit paths and timing values are passed through an evidence-only Python
wrapper, avoiding a keychain dependency for these non-secret values.

Cleanup verified after the passing run: Playwright exited with code 0, its
sidecar PID 31299 no longer existed, no task fixture/Electron process remained,
and no listener remained on the isolated web port 2924. The fixture removed
its temporary profile after copying the listed evidence.

Final aggregate regression correction: cancellation of a second graph interaction
may be owned by a resumed transport rather than the original coordinator. Parked
settlement now reuses the existing immutable resume-binding plus canonical graph
successor proof before accepting that exact current owner; arbitrary parked
owners remain rejected. The concurrent-cancel test still proves Stop wins over
an already preflighted answer, now verifying that the commit lock excludes that
answer and the kernel cancellation signal remains absent until canonical
projection, rather than requiring the obsolete signal-before-projection order.
Also initialize the graph checkpoint host before memory preparation so setup
exceptions cannot escape the worker's error/finalization path as an unbound local.

### Electron re-verification after final PuPu P3 fixes — 2026-10-11

After the resume-transport parked-owner proof and graph-host setup-finalizer fixes,
the unchanged 12-cell Electron matrix passed again against the same verified wheel
and exact manifest. Latest acceptance evidence is now
`/Users/red/.codex/backups/ticket-389-20261011-evidence/electron-ui-final-3/`;
use that report directory with the reproduction command above. Stop UI feedback:
question 58 ms, tool approval 47 ms, model response 46 ms, waiting successor 47 ms.
All 12 cells passed, no page errors, late provider delivery attempted on an open
socket and did not enter the stopped chat, and the same canonical terminal/seal
ordering was observed. `journal-terminals.json` contains the read-only DB summary.
Cleanup again confirmed Playwright exit 0, sidecar PID 50920 absent, no fixture
processes and no listener on port 2924.

The Electron matrix does not claim coverage of answering a first interaction and
then stopping a second interaction in the same run. That narrower resumed-owner
case is covered by the separate real-kernel tests recorded in P3; the UI fixture
remains a deterministic single-interaction scenario.

## Implementation-ready verification — 2026-10-11

The final PuPu source plus the fixed verified-wheel/runtime passes development
verification. Unchain: 4,278 passed, 16 skipped, 5 xfailed. PuPu sidecar: 2,778
passed, 17 skipped, 3,611 subtests passed in 206.05 seconds, with thread-exception
warnings treated as errors. The only remaining warning is the existing intentional
malformed Kimi signature fixture's Pydantic serializer warning. Renderer: 451
suites, 5,617 passed, 5 skipped; final runtime gates: 80 Electron checks and 12
release validator checks. Final real Electron evidence is electron-ui-final-3
(12 cells PASS, Stop 46–58 ms). See the matrix above for the explicit distinction
between real-window and real-kernel coverage.

A handful of existing Unchain child-process tests explicitly prepend a source
path. Their 29 tests were rerun in verified-runtime-tests, with a physical test
copy and src symlink to verified-runtime, ensuring those processes also used the
fixed wheel. The main full-suite process imported verified-runtime via PYTHONPATH.
No new wheel was built for these tests.

Fresh verified-profile-copy result: 20 of 21 targeted chats repaired, one kept
blocked because completed original coordinator records provide no authority to
synthesize a failure/cancellation. All writes were confined to the copy.

Logs, screenshots, wheel, manifest, profile report and source snapshots are
preserved outside the clones in the ticket evidence directory. In particular:
logs/389-verified-sidecar-final.log, logs/389-verified-unchain.log,
logs/389-paired-frontend-all.log, logs/389-verified-subprocess-artifact.log,
verified-profile-repair-report.json and electron-ui-final-3/electron-report.json.
The failed preliminary sidecar run remains as diagnostic evidence and is superseded
by the final full run. The final source snapshot includes tracked patches plus
untracked task files and SHA-256 manifests.

No delivery commit or PR has been created. Issue #389 stays open/In Progress;
requested close starts delivery and feature audit. A fresh non-partial GitNexus
change analysis is required before any delivery commit; earlier partial graph
output is not claimed as a clean final check. No active user-profile rollout.

## User-requested manual instance — 2026-10-11

The owner requested an instance for hands-on acceptance after development
verification. It is running from pupu-389 at http://localhost:2923/# with
Electron PID 98307 and sidecar PID 98319, using the unchanged verified-wheel
and its imported b163345…9148da3f manifest. Runtime, Memory V2 and boot readiness
are true. The instance is intentionally left running; manual acceptance remains
pending the owner's observations. No automated real-provider inference was sent.

Instance metadata and startup evidence:
/Users/red/.codex/backups/ticket-389-20261011-evidence/manual-instance-20261011-160828.
The active user data is that directory's profile copy, including real model
configuration and chats. Installed third-party MCP toolkits are temporarily
excluded in this copy because the original encrypted MCP envelope itself has a
profile fingerprint mismatch; both copied- and original-profile startup reproduced
the failure. A briefly started original-profile instance was closed; its credential
stores were not rewritten. The copied inventory and pre-start job state are
preserved. Builtin tools remain available. This startup limitation is distinct
from #389 cancellation and must not be reported as a formal acceptance PASS.

## Manual Stop → immediate Send failure — 2026-10-11

The owner's actual Gemini tool run exposed a missing state sequence; the earlier
implementation-ready claim is superseded. Active rollout is NO-GO until the
regressions below and the updated instance are verified. Original evidence is
preserved at `/Users/red/.codex/backups/ticket-389-20261011-evidence/manual-resend-failure-1617`.
The UI chat is `chat-1791760611452-22c136f025acba83de4257174eb7565b`.
The first tool was approved. Stop froze the UI at 23:17:01.283 UTC; the next user
send registered at 23:17:06.940, but the original coordinator's execution record
did not become cancelled until 23:17:09.247. Admission therefore returned
`session_execution_in_progress`. This is a cancellation-delivery/admission gap,
not evidence of a permanent journal lock. Logs also record
`interaction_cancel_target_required` during Stop recovery.

BC-389-11: producer is the existing sidecar `get_pending_interaction` HTTP/IPC
projection. Consumer is the renderer's strict `normalizePendingInteraction` and
the exact Stop retry. The CLOSED wire contains the existing graph-only trio
`resume_kind=graph_step`, `graph_step_attempt_id`, `graph_coordinator_attempt_id`;
the step must equal `source_run_id=active_attempt_id`, and the session must equal
the captured Stop session. Canonical representation remains the validated graph
resume context and original coordinator. The normalized renderer projection must
retain that already-validated lineage. A retry may attach an interaction ID only
when its source or verified coordinator is the exact captured Stop attempt.
Unknown fields, malformed lineage, another session or another coordinator fail
closed; no cancellation authorization is inferred solely from the chat ID.
Protocol/artifact identity remains the unchanged verified wheel (SHA-256
`a5486e70741c42e3471961d3b892a50eecd0854333b636ef4688d718a7297ab9`)
and imported manifest `sha256:b163345c68666cc2dbe766a3a8e75da0246748def8fa9b1be75f446d9148da3f`.

BC-389-12: the renderer Stop promise/outbox is the producer of exact
owner/session/attempt cancellation intent and terminal confirmation. A new
user-initiated send is the consumer. Its preflight must join outstanding exact
cancellation before registering a successor. A successful transport disconnect,
an accepted request, or an unresolved promise is not terminal evidence. The wait
is bounded to 30 seconds and cancellable without cancelling/replaying the old
run. Failure preserves the user's draft and sends no successor. The backend's
existing guarded admission separately waits for Memory V2 and writer exit.
Persistence is the existing cancellation outbox; its storage failure must not
erase the in-memory Stop join. CLOSED execution cancellation responses remain
strictly validated against the original identity.

SEQ-389-10 / AC-389-14: first tool approved → worker begins another iteration →
Stop before the second approval is presented → exact graph lineage lookup →
cancel receipt → old writer finishes → Memory V2 terminal/seals → guard release →
one user successor. Test ordinary send, immediate resend, repeated cancellation,
cancellation IPC delay, timeout, waiting Stop and remount. Positive graph pending
must cross the real producer → strict renderer consumer; negative cases reject
wrong session, wrong coordinator, divergent step/source and unknown fields.
The stopped UI remains frozen and already-admitted tool history remains visible.

SEQ-389-11 / AC-389-15: a live callback waiting for approval is not quiescent.
Canonical cancellation and finalization must precede guard release; the parked
recovery path may only seal a writer that has actually suspended/exited. The
real-kernel regression must count exactly one step terminal and one coordinator
terminal and must forbid a successor while the live finalizer is blocked.
The observed journal had host terminal/seals followed by a second kernel step
terminal, so mock-only coverage is insufficient.

BC-389-13: the sidecar's interaction event observer is the producer of an exact
live-writer claim; cancellation settlement is the consumer. `parked` retains its
existing approval protocol meaning and does not prove worker exit. The in-memory
claim binds session, guard attempt, owner ID/PID/process incarnation, source step,
interaction ID and a weak reference to the actual kernel thread. A matching live
thread or a foreign live/unknown owner prevents host terminals and guard release.
Only the owning worker, after its kernel and graph finalization succeeded, can
clear that exact claim. Persistence failure retains the durable guard; a dead
thread/process may subsequently use existing exact cold recovery. PID reuse is
checked through the guard's existing incarnation proof. No serialized schema,
runtime manifest or wheel change is introduced. AC-389-15 covers both HTTP-first
and transport-first cancellation, a blocked live kernel, another live process,
actual child-process exit and recovery, and persistence failure.

The original reproduction's stored journal is already incompatible: two
`run_cancelled` events for one graph step make generation rebase report
`GRAPH_STEP_TERMINAL_AMBIGUOUS`; its seal also precedes the duplicate terminal.
A fixed-wheel probe on a separate data copy confirms this failure. Ordinary
context compilation also rejects its terminal outcome conflict. This is distinct
from a missing terminal and is not repaired by dropping journal evidence or
weakening the strict consumer. Preserve the original test chat and use a fresh
chat for acceptance of the corrected lifecycle. The probe that omitted
UNCHAIN_SOURCE_PATH accidentally imported the mutable sibling; it is excluded.
Only the corrected probe verified the fixed installed module path.

### Stop acknowledgement → successor admission fence — 2026-10-11

A real-app report exposed a gap before the existing backend settlement wait:
the next attempt registered while the Stop IPC was still pending, so the old
control still looked live and admission correctly rejected it as busy.

Implementation of BC-389-12: before a successor can create messages, consume its composer draft,
or start a stream, the renderer joins exact prior Stop requests scoped by
owner chat, execution session, attempt and interaction identity. Stop and the
cancel outbox drain share an in-flight promise. The in-memory identity/promise
also survives a failed outbox write. Only a terminal cancellation response
permits successor admission; an accepted request without terminal confirmation
is insufficient. Unknown or unrelated busy runs do not become waitable.

Implementation of SEQ-389-10 / AC-389-14: Stop remains immediate. The successor shows the existing
waiting message while cancellation acknowledgement is pending, with a 30-second
bound. Stop during this wait, timeout, failure, or unmount ends only the local
wait and leaves the draft intact; the exact original cancellation can finish
in the background. A late acknowledgement cannot launch the abandoned send.
After acknowledgement, the backend's existing bounded guard wait still covers
Memory V2 settlement. No prior model execution is replayed.

Graph impact before editing reported CRITICAL for `runTurnRequest` (414
impacted, 25 processes, 14 modules); its symbol metadata lacked a file/type and
included unrelated server symbols. This uncertainty is retained, not treated
as low risk. Text corroborated the send/edit/resend/preflight callers, and the
patch is restricted to cancellation tracking and the preflight fence. Full
raw impact/context output is in `/tmp/pupu389-gate-impact-run.txt`,
`/tmp/pupu389-gate-impact-stop.txt`, and `/tmp/pupu389-gate-context-run.txt`.
The hanging-cancel integration regression first failed because a second stream
started before cancellation confirmation; evidence is
`/tmp/pupu389-cancel-gate-red.log`.

Cancellation-gate validation: the three focused suites passed 238 tests before
the final character-scope adjustment. A separate regression then demonstrated
that character UI thread `main` differs from actual execution session
`character_nico__dm__main`; the gate now prefers the exact Stop-captured
execution identity (or the persisted assistant execution identity) before
matching owner + session. The character regression failed before this scope
fix and passed afterward, alongside the two existing successor/interject cases
(3 tests). Evidence: `/tmp/pupu389-cancel-gate-final.log`,
`/tmp/pupu389-character-gate-red.log`, and
`/tmp/pupu389-character-gate-green.log`. Other covered boundaries include
outbox write failure, unconfirmed/timeout acknowledgements preserving the
draft, unrelated owner/session exclusions, unmount, and late acknowledgements
after local Stop. Two older chat tests were updated only to provide an exact
terminal cancel response before their expected successor, rather than treating
`cancel_requested` alone as permission to start.

### Manual regression corrected and instance restarted — 2026-10-11

BC-389-11/12/13, SEQ-389-10/11 and AC-389-14/15 now have development evidence on
the same fixed installed wheel and PuPu candidate. The new exact-target
projection and cancellation join preserve the captured owner/session/attempt;
the live interaction writer fence prevents host recovery from sealing a kernel
that is still in its callback. No additional Unchain production change or wheel
rebuild was needed for this correction.

Validation after the manual report:

- Renderer full run: 451 passing suites, 5,634 passing tests, one failure and
  five skipped tests. The remaining fixture omitted cancellation confirmation
  while expecting a successor; only its mock was corrected to supply the exact
  terminal acknowledgement. Its entire file then passed 41 tests. Production
  did not change after this full run. Logs: `/tmp/389-manual-fix-frontend-all.log`
  and `/tmp/pupu389-payload-exact-cancel.log`.
- Sidecar full run: 2,780 passed, one failure, 17 skipped, 3,611 passing subtests.
  That fixture renamed the registry owner while keeping its old PID alive and
  incorrectly called this a process restart. It now explicitly proves old owner
  death and checks the exact PID liveness lookup. The entire file and four P3
  files passed 66 tests and six subtests afterward, including the real child
  `os._exit` recovery. Production did not change after the full run. Logs:
  `/tmp/389-manual-fix-sidecar-all.log`, `/tmp/389-writer-restart-fixture.log`.
- The real two-iteration kernel regression proves first-tool execution, Stop
  before the second approval is displayed, no early step/root terminal or guard
  release while the kernel is blocked, then one terminal per attempt and no
  second-tool execution. HTTP-first, transport-first, live foreign process and
  actual dead-process recovery are covered. Focused final log:
  `/tmp/389-writer-final.log` (48 tests, four subtests).
- Electron report `electron-ui-manual-repro-fix-3`: all 14 cells PASS, no page
  errors. Stop response was 42–56 ms. The new real cancellation test holds only
  the acknowledgement returned to the renderer for 1,250 ms after the actual
  IPC/HTTP response: provider count remains 7 during the visible wait and becomes
  exactly 8 after settlement. A separate draft remains unsent (provider count
  stays 9). Waiting Stop, late content rejection, reopen without automatic
  execution, tool-history preservation and failure/resend also passed.
- The Electron database contains 26 terminal attempts, each with exactly one
  canonical terminal (10 cancelled, 14 completed, two failed). There are no
  duplicate terminals. Evidence: `journal-terminal-counts.json` next to the
  report and database backup. The first two new fixture runs failed while
  attempting to wrap Electron's frozen bridge or an unavailable Webpack cache;
  these are retained as failures. The passing fixture resolves only the exact
  already-loaded renderer API module and delays its mutable domain method;
  it still calls the real bridge. It never modifies the user's instance.

The affected user's original acceptance chat is still preserved as evidence;
its duplicate-terminal journal is not rewritten or presented as repaired. A new
manual acceptance chat was created in the existing copied profile:
`chat-1791762096148-c3700247bf4608ba8707005898a32fcc`, title
`#389 Stop 后再发送验收（修正版）`, Gemini with built-in `core` tools. The copied
profile's existing third-party credential mismatch remains separate; its
installed MCP inventory is still excluded only in the copy.

The old Electron/sidecar pair (98307/98319) was stopped and the updated pair
(4951/4963) was opened from `/Users/red/Desktop/GITRepo/pupu-389`. Web port 2923
remains running; test API is now 56266. Boot and Memory V2 readiness are verified,
including the fixed runtime manifest. Updated logs, screenshot and metadata are
under `manual-instance-20261011-160828`. User manual acceptance remains pending;
these are development checks, not release provenance or acceptance on the
original user profile. The ticket remains open/In Progress, with no delivery
commit, push, PR, merge, audit or closure.

### Cancellation acknowledgement contract mismatch corrected — 2026-10-11

The next manual pass disproved the sufficiency of the previous 14-cell matrix.
The same fresh acceptance chat stopped at 23:48:56.021 UTC. The sidecar completed
cancellation at 23:49:02.483, wrote one step terminal, its seal and one root
terminal, and released its guard. However, three pending-target lookups failed
in the renderer's strict API validator, leaving a retry-blocked cancellation
outbox entry. Waiting could not change that local blocker. The prior record is
retained as development evidence, not proof that this path had been accepted.

BC-389-14 / SEQ-389-12 / AC-389-16: the real pending-interaction producer and
both strict renderer consumers must agree on canonical presentation provenance.
The producer adds `call_ref`, `call_ref_metadata`, `timeline_merge_policy` and
trace `iteration`; canonical original arguments can be a JSON object string.
Both old consumers rejected this legitimate response. They now share a closed
metadata validator using the existing tool reference/cursor/metadata validators.
Session, source attempt, call, tool, optional toolkit, iteration, policy,
declaration flags and cursor must agree. Original argument bytes are retained;
JSON parsing checks shape without replacing the original text. Unknown fields,
partial provenance, conflicting identities/cursors/policy, argument drift and
non-object or malformed argument JSON are rejected. Existing canonical base
presentation keys and trace/payload equality remain required.

BC-389-15 / SEQ-389-13 / AC-389-17: exhausted background cancellation retries
must remain exhausted on remount, but one newly requested user send can ask for
fresh confirmation of the same exact cancellation. Only a matching terminal
acknowledgement clears the entry and admits one successor. An unconfirmed result,
error or conflicting identity preserves the draft and starts no stream. This
does not retry a provider, run a tool or resume the stopped model attempt.

Graph analysis ran before the presentation/helper/gate changes. The send entry
reported CRITICAL, 414 impacted nodes, 25 processes and 14 modules, with missing
symbol file/type metadata and unrelated graph links; that uncertainty remains
recorded. Presentation and metadata helpers reported UNKNOWN; text confirmed
their two durable consumers and the existing lifecycle metadata caller. Raw
outputs are `/tmp/389-confirm-*-impact.txt`. The two enclosing normalizers' call
arguments were also changed to pass the session identity; their separate graph
checks followed those small call-site edits, which is a sequencing deviation.
They also reported UNKNOWN and were corroborated by the actual consumers.
No unknown result was interpreted as evidence of absence or low risk.

Evidence at `manual-confirm-failure-1649`: original state/logs/outbox/database
copies; true two-approval kernel producer payload; and an exact idempotent
cancellation probe returning the user's session/attempt with `state: cancelled`.
The producer payload was first fed unchanged into the real API consumer (two
RED tests). The isolated Electron RED run kept the other 14 cells passing but
failed the new producer → both strict consumers cell, matching the user's error.
Four explicit-send retry cases also failed before the gate correction (zero
requests instead of one). These failures are preserved.

Final validation on the unchanged wheel and corrected PuPu source:

- Renderer full suite: **453 suites, 5,659 tests passed, five skipped**, no failed
  tests. Log: `/tmp/389-confirm-frontend-all.log`.
- Real producer/consumer contract tests: 20 passed, including both actual live
  approval payloads and 18 malformed/conflicting cases. Original provenance and
  argument text survive both layers. The five other focused files passed 229
  tests; the intermediate two failures were test assertions referring to a
  nonexistent normalized `presentation` property and were corrected to check
  the actual `traceFrame` field, then included in the clean full run.
- The changed real-writer test file passed all three tests, including actual
  child-process exit/recovery. Backend production and the installed wheel are
  unchanged; the prior backend full-suite coverage remains applicable.
- `electron-ui-confirm-green-20261011-run1`: **all 15 cells PASS**, no page errors.
  The added cell calls the actual domain API consumer and hook normalizer on
  the same real pending producer; previous Stop/immediate-send, draft, waiting
  cancellation, late-content, tool-history, reopen and failure/resend checks
  still pass. Log: `/tmp/389-confirm-electron-green.log`.
- The running manual window was independently checked: it accepts the true
  producer fixture and contains the explicit cancellation retry correction.
  `manual-confirm-failure-1649/live-frontend-loaded.json` records both checks.
  Its current chat needs no journal rewrite or replacement. A new explicit
  user send can obtain the already-existing terminal confirmation. No model
  call or tool execution was initiated on the user's profile by these probes.

Manual acceptance is still pending. The old duplicate-terminal chat remains
preserved and incompatible as previously recorded; this latest chat has no such
duplicate. Issue state and delivery restrictions are unchanged.

### Owner-directed background Stop and immediate successor admission — 2026-10-11

This section supersedes the frontend cancellation-confirmation admission gate
in BC-389-15. The owner now explicitly requires Stop to return the UI to ready
without waiting for any request. A new user message is displayed and saved
immediately; any predecessor execution/Memory V2 settlement wait belongs to the
backend. Stop during that wait immediately retires only the waiting successor,
which must never start later. Cancellation acknowledgements remain background
bookkeeping for their exact stopped identity, not a frontend send lock.

The existing V4 `session.started` handshake precedes adapter registration today.
It will be emitted only after registration of the exact new execution/attempt;
its existing wire shape stays unchanged. Registration is acceptance for a pending
execution, not evidence of model/tool start. `run.started` (and existing stronger
acceptance/content signals) clears the waiting presentation. Local message
storage remains authoritative for the immediately submitted content; no claim is
made that the execution registry stores a copy of the message body.

Implementation decisions and slices:

- Renderer `use_chat_stream.runTurnRequest`: remove joining old cancellation
  promises before optimistic message persistence; capture exact stopped
  identities for this owner/session and pass a closed `stopped_attempts` list
  on a fresh send. Preserve secret/attachment/character preflight and existing
  edit/resend Memory V2 transaction rules. All Stop feedback stays synchronous;
  late cancellation errors cannot overwrite a newer run's UI.
- PuPu V4 route registers the new attempt before its existing handshake, then
  reconciles exact predecessor Stop intents before calling the ordinary adapter
  and its writer fence. `stopped_attempts` has at most 64 entries, each requiring
  `attempt_id` and allowing only `source_attempt_id` and `interaction_id`; reject
  unknown keys, duplicates, a self target and use in durable resume. Inherited
  owner/session, immutable attempt lineage and canonical interaction identity
  constrain all recovery; never cancel whichever attempt happens to be active.
- PuPu cancellation host allows an atomic never-started/registered successor
  cancellation without applying the predecessor's pending approval. CAS shares
  the registration/mark-running lock; an already-running attempt must use its
  existing canonical cancellation path. A waiting cancellation never releases
  the predecessor's guard.
- Reuse the existing input ready/Stop button and waiting disclaimer; the user
  selected this behavior explicitly. No new UI component or visual alternative
  is required. A waiting user message remains in history after Stop; no queued
  auto-rerun is created. Bounded backend timeout preserves the submitted message
  and exposes retry, not silent model replay.

BC-389-16 / SEQ-389-14 / AC-389-18: renderer → domain API → preload/IPC → PuPu
V4 HTTP admission. CLOSED stopped identity list, same owner/session binding,
fresh attempt only. Positive: immediate visible/persisted message and cleared
composer even when the old cancel response never arrives; backend may execute
after settlement without that response. Negative: foreign/self/unknown/duplicate
identity metadata refused; legacy fresh sends remain compatible. Sequence:
running A → Stop A/ready → submit B/registered handshake/wait → A settles → B
starts exactly once. Repeat with the second approval and character execution
session, and preserve ordinary first/second messages and cold reload behavior.

BC-389-17 / SEQ-389-15 / AC-389-19: PuPu cancellation host → execution registry
and durable interaction/Memory V2 runtime. Registered B can be atomically stopped
while A owns a live or parked writer. A's guard, approvals and journal are not
released by stopping B. Sequence adds Stop B/ready before A finishes, late A
confirmation/content, then submit C; B must never call a model/tool, and C waits
for A's actual settlement. Race negatives cover B starting concurrently, late
old callbacks, held cancellation transport, duplicate Stop and cold restart.
The existing fixed wheel/manifest remains unchanged and is reused throughout.

Risk and execution assessment: this is not suitable for a weaker implementation
model because execution admission, canonical-before-signal cancellation and
durable ownership races cross multiple layers. The primary strong agent retains
design/frontend integration; the existing strong backend agent handles only the
settled backend slice. Independent agents write reproduction and Electron tests
under the TDD skill. No weaker-model dispatch is claimed. Checkpoints are the
RED regressions, backend contract/registered-stop tests, then the exact fixed
wheel + candidate Electron tests. `mark_running` impact reports CRITICAL (76
impacted nodes / 16 modules); frontend send/Stop and route/host lookups report
UNKNOWN after the refreshed index, with actual composer/resend/edit/queue and
route→adapter→registry callers corroborated in source. UNKNOWN is not low risk.
Raw root impact outputs are `/tmp/389-background-*-impact.txt`.

The issue remains open/In Progress. No delivery commit, push, PR, audit, merge
or closure is authorized by this implementation step. Manual acceptance and
runtime instance refresh follow passing development verification.

### Background Stop verification — 2026-10-12

This revision supersedes the earlier renderer cancellation-confirmation gate.
The durable cancellation outbox and exact acknowledgements remain background
bookkeeping. Neither a hung acknowledgement nor its late error can prevent a
fresh message from being saved/submitted or overwrite a successor's UI.

- Independent renderer RED: `/tmp/pupu389-immediate-admission-red.log` and
  `/tmp/389-background-root-red.log`; both immediate-admission tests expected a
  saved successor but found none while the old response was unresolved.
- Updated renderer contract files: 242/242 tests passed, including delayed,
  failed and mismatched acknowledgements, unavailable outbox storage, waiting
  Stop, character execution IDs and foreign owner/session exclusion. The
  existing edit/resend rebase and draft protections remain covered.
- Complete renderer suite: 452 suites passed, 5,658 tests passed and 5 skipped;
  `/tmp/389-background-frontend-full.log`. The removed acknowledgement-wait
  helper accounted for one obsolete suite; no current tests were suppressed.
- Main affected Python tests: 139 passed plus 18 subtests;
  `/tmp/389-admission-affected-final.log`. Extra route consumers and admission
  tests: 76 passed; `/tmp/389-admission-route-consumers-final.log`. All use the
  unchanged installed wheel and treat background thread exceptions as errors.
  V4 fixtures now supply isolated data directories for the real durable
  registration; registration is not mocked away.
- Actual Electron/sidecar pair: all 16 recorded cells passed with no page
  errors. A four-second delay after the real backend cancellation response
  proved a successor completed before the renderer received that response.
  A real MCP child remained inside an executing tool: the successor was saved
  and waited; Stop cancelled it; releasing the child did not start it. Tool
  history, strict pending producers/consumers, provider failure, resend, reopen
  and late-content rejection remained green. Report:
  `/Users/red/.codex/backups/ticket-389-20261011-evidence/electron-background-stop-green-20261012/electron-report.json`.

Safety negative: if an older graph step's authoritative coordinator binding has
been removed, its stale interaction identity fails closed. The current pending
pointer alone is not proof of the older identity's owner. The negative test
preserves the current approval and guard and starts no successor; no lineage
inference was added to make the test pass.

The manual instance was restarted with this Python sidecar and the unchanged
verified wheel. Both runtime and Memory V2 report ready. The loaded hook factory
contains fresh Stop metadata and no old acknowledgement-wait helper. Evidence:
`/Users/red/.codex/backups/ticket-389-20261011-evidence/manual-instance-20261011-160828/background-stop-loaded-verification.json`.
The existing acceptance chat is retained; human manual acceptance is pending.

The initial complete Python run found seven legacy V4 fixture failures because
their mocked event sources had never required `UNCHAIN_DATA_DIR`. Those tests
now use real registration in isolated directories. The final complete run is
green: 2,801 passed, 17 skipped, 3,611 subtests passed, one existing intentional
Pydantic serializer warning, with background thread warnings treated as errors.
Log: `/tmp/389-background-backend-full-green.log`. No production changes were
needed after the 16-cell Electron run, so it remains current-pair evidence.

Preserved verification logs and source snapshots are under
`/Users/red/.codex/backups/ticket-389-20261011-evidence/background-stop-verification-20261012/`.
The eight changed Unchain production modules byte-match the installed wheel;
its SHA-256 remains
`a5486e70741c42e3471961d3b892a50eecd0854333b636ef4688d718a7297ab9`.
Issue #389 is implementation-ready and remains open/In Progress; only human
manual acceptance and a later explicitly requested delivery/close remain.

### I18n finding repair — 2026-10-13

The explicit feature audit found three new hardcoded settlement captions. The
owner authorized their repair. All eleven maintained locales now contain
`chat.settlement.waiting`, `chat.settlement.cancelled` and
`chat.settlement.timeout`.

Waiting is translated directly at presentation time. Cancellation and timeout
retain their exact English-source internal error values from `en.json`; the
chat presentation maps only these known values to the current locale. Its memo
depends on `t`, so existing captions update after language changes. Attempt IDs,
error codes, mutation/outbox state, provider content and execution callbacks are
not altered by locale changes. This is presentation coverage for BC-389-16 /
AC-389-18; no serialized backend contract or Unchain artifact changed.

Independent RED and root-confirmed RED each reproduced all three English
captions remaining after an English-to-Chinese switch. The final integration
tests cover English → Chinese → English in each existing state and retain the
same message/history, attempt/cancel call counts and held mutation identity.
All three pass. The complete renderer suite passes 452 suites / 5,661 tests
(5 existing skips). Full locale coverage has zero missing, orphan,
placeholder-mismatch or missingInEn references; all three new keys are used.

The exact current renderer and reused wheel passed a fresh sixteen-cell Electron
run with no page errors. Fresh diagnostic source-host/wheel smoke passed all
five checks; all 29 recorded host files and the generated build snapshot match
the previous verified pair. The loaded manual renderer contains the three new
translation keys. A fresh real `openai:gpt-4.1` probe returned
`AUDIT389_I18N_FIXED_OK.` in the visible app and produced durable Memory V2
records; its disposable chat is removed after evidence capture.

Evidence and the refreshed candidate manifest are preserved under
`/Users/red/.codex/backups/ticket-389-20261011-evidence/i18n-fix-verification-20261013/`.
The fresh Electron report is under
`/Users/red/.codex/backups/ticket-389-20261011-evidence/electron-i18n-fix-green-20261013/`.
The historical failing audit remains recorded against its old candidate. The
new audit must bind the refreshed candidate digest and the unchanged wheel and
runtime manifest. No delivery commit or PR is part of this repair instruction.

### PR integration with current dev — 2026-10-13

The owner explicitly requested paired PRs after manual acceptance. The accepted
patches are replayed onto PuPu `82e46033` and Unchain `5706c99`, including the
already merged Memory V3 work (#401). The inherited Unchain #383 evidence-only
commit is excluded from the #389 PR. Earlier candidate evidence remains history;
it cannot establish acceptance of this new integrated artifact pair.

BC-389-18 / SEQ-389-16 / AC-389-20: GitHub workflow input `unchain_ref` is the
producer of the immutable source revision consumed by the shared deterministic
and package workflows and `build-unchain-artifact.mjs`. Admission is VERSIONED:
the full revision identifies provenance, while only the actual imported runtime's
strict manifest grants capabilities. All five default/fallback references must
point to the same companion commit containing both Memory V3 and #389. The old
default lacks `graph_failure_terminals_v1` and
`durable_interaction_settlement_fence_v1` and must fail the existing feature gate.
No missing-feature fallback or manifest gate weakening is permitted. Sequence:
commit companion runtime → build one wheel → install and verify that exact wheel
→ pin its commit → exercise the current PuPu source host and Electron renderer.
Record wheel SHA-256, imported path, manifest digest and both repository heads
in the new delivery evidence. Reuse that one wheel for all pair checks; retry
must not rebuild or silently switch to the mutable sibling source. Signed
packaging and active release rollout remain outside this PR request.

BC-389-19 / SEQ-389-17 / AC-389-21: Unchain's graph coordinator terminal is the
producer of journal events consumed by generation rebase. Admission is CLOSED:
the existing terminal-tail allowlist admits only the four Memory V3 curator
audit types after the terminal. A failed/cancelled root without an execution
seal must have its admission immediately before the terminal, located by that
terminal's position rather than the end of the complete event list. Repeat,
retry and rebase accept the allowed audit tail; ordinary provider/tool events
after a terminal and duplicate terminals still fail closed. Regression evidence
must cover both failed/cancelled terminals with all four audit types, plus the
invalid tails, while preserving #401's audit provenance validation.

GitNexus reports both complete accepted patches as CRITICAL overall (PuPu:
421 changed symbols / 74 processes; Unchain: 88 / 21). The rebase preflight's
specific upstream impact is LOW: `_assert_durable_preflight` → `rebase`, two
modules and no indexed process. Workflow and plan file impact are UNKNOWN;
direct source references establish their shared-workflow/artifact consumers
and documentation-only role. UNKNOWN is not interpreted as an all-clear.
Fresh combined-source suites, strict pair matrix and diagnostic source-host
smoke are required before reporting the delivered candidate as verified.
