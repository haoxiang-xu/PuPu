# Ticket #386 implementation plan

Gemini: retry 5xx instead of "uncertain", surface provider reasons, and bring the model catalog up to the current 3.x line.

- Ticket: https://github.com/haoxiang-xu/PuPu/issues/386 (direct child of Release v0.1.12, #216)
- PuPu clone: `/Users/red/Desktop/GITRepo/pupu-386`, branch `codex/ticket-386-gemini-5xx-catalog`, base `dev @ f7e4fb3102a0232114a509febf6ba0b3e5264c78`
- Unchain clone (companion repository): `/Users/red/Desktop/GITRepo/unchain-386`, same branch name, base `dev @ 48f235dcce8d2b62b3e7f3ac3cfc9b6d5956c217`
- This file is the direct implementation plan. The ticket body holds BC-386-1..3, SEQ-386-1..2, AC-386-1..7 and decisions D1..D3; this file only records what implementation added or clarified.

## Root cause (bug)

Reproduced on 2026-09-30 by replaying the frozen failed request against the real Gemini API.

1. `gemini-3.8-flash` / `gemini-3.7-flash` return HTTP 503 `UNAVAILABLE` (high demand). `exact_route_transport._classified_failure_kind` maps only 429/529 to `TRANSIENT_RETRY_SAFE` and 4xx (except 408/409) to `TERMINAL`; every 5xx returns `None`.
2. `None` re-raises out of `GeminiExactRouteTransport.send` into `DurableProviderTurnRuntime._execute_route`'s `except BaseException`, which records the attempt as `uncertain` and raises `DurableProviderTurnUncertainError()`. Its message is only its code; the cause is chained and never serialized, so neither a retry nor the HTTP status reaches the user. `tests/test_exact_provider_route_transport.py:729` pins `503 -> None`, so this was intentional and is changed here.
3. `gemini-2.5-pro` / `gemini-2.5-flash` return 404 `NOT_FOUND` "no longer available to new users". That is an existing `TERMINAL` path, but `ProviderFailureDiagnostic` carries only `{http_status, provider_code, parameter}` and Google's body has an integer `code` and a string `status`, so the user sees "Provider model or endpoint was not found" with no replacement. Both retired ids are still exported by `model_capabilities.json`.

## Design decisions (settled by the strong agent)

- **DD1 diagnostic versioning.** `ProviderFailureDiagnostic` gains `provider_status` and `replacement_model`, both default `""`. `to_dict()` emits the existing `unchain.provider_failure_diagnostic.v1` shape (3 fields) when both are empty, so every existing record, digest and test keeps its bytes. It emits `...v2` (5 fields, closed) when either is set. `from_dict` accepts exactly these two shapes and fails closed otherwise.
- **DD2 lease versioning.** `ProviderRequestLease` keeps schema v2 (no diagnostic) and v3 (diagnostic v1). A lease whose diagnostic is v2 serializes as `unchain.provider_request_lease.v4`; `from_dict` requires the diagnostic schema to match the lease schema (v3 with v1, v4 with v2). `from_durable_dict` accepts v2, v3 and v4. Old binaries cannot read v4 (same rollback posture as BC-202).
- **DD3 provider_status.** Read only from a google-genai `APIError.status`, kept only if it is in the allowlist `UNAVAILABLE, NOT_FOUND, RESOURCE_EXHAUSTED, PERMISSION_DENIED, INVALID_ARGUMENT, UNAUTHENTICATED, FAILED_PRECONDITION, INTERNAL, DEADLINE_EXCEEDED`, else `""`. Other providers' errors never set it.
- **DD4 replacement_model.** Parsed from `APIError.message` with `use models/([a-z0-9][a-z0-9.-]{0,60})` (anchored on "use", so the retired model named earlier in the same sentence is never picked), then kept only if `load_model_capabilities()` has that id with `provider == "gemini"`. The message text itself is never stored, logged or shown (BC-201 stays closed).
- **DD5 user text.** `summary()` keeps its current output for v1 diagnostics. It gains fixed local sentences for 500/502/503/504 and appends `, status=<provider_status>` and, when present, `; suggested model: <replacement_model>`. Example 404: `Provider model or endpoint was not found (HTTP 404, status=NOT_FOUND; suggested model: gemini-3.8-flash)`.
- **DD6 uncertain message.** `DurableProviderTurnUncertainError` takes an optional diagnostic; message becomes `durable_provider_turn_uncertain; <summary>` when the cause carries a provider HTTP status, else unchanged. `code` and class do not change. No Unchain source outside `durable_turn_runtime.py` references the class (GitNexus reports MEDIUM risk from module-level imports only); tests match it by class with `pytest.raises`, and PuPu's `_normalize_stream_error` passes `str(exc)` through unchanged, so nothing matches on the message.
- **DD7 retry exhaustion.** `RetriesExhaustedError` gains an optional `detail` kwarg appended to its message; `_execute_route` passes `<summary> after <N> retries`. Transient leases are still recorded without a diagnostic so existing 429 lease bytes do not change. Limitation: after a cold restart that finds an exhausted budget the message is still `...terminal_failed:transient` without the status.
- **DD8 scope of "no gemini-2.5".** AC-386-6 is read as: the exported catalog and every picker or recipe list no longer contain a `gemini-2.5-*` id. The dead `gemini-2.5-` thinking-budget branch in PuPu `_build_payload` (upstream impact CRITICAL, 556 symbols / 117 flows) and the `GEMINI_PRO_15` constant in unchain `schemas/models.py` (public schema example pinned by `tests/test_new_models.py`) are left untouched and named as follow-up in the delivery notes. Test fixtures that only use a 2.5 string as an opaque model name move to a current id.
- **DD9 catalog facts.** Added ids: `gemini-3.5-flash`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite`, `gemini-3-flash-preview`. All: 1,048,576 in / 65,536 out, tools and structured output supported, `input_modalities` `["text","image","pdf"]`, allowed payload keys `["max_output_tokens","thinking_config"]`. Levels and defaults from Google's thinking page: 3.5-flash `minimal..high` default `medium`; 3.1-pro-preview `low..high` default `high`; 3-flash-preview `minimal..high` default `high`; 3.1-flash-lite unlisted. Those pages were read through a summarizing fetch, so every declared level is validated live before the ticket is called done; a level the API rejects is removed from the entry. `gemini-3.6-flash` gains `minimal` only if that live check accepts it. Floating `-latest` aliases are not added (D3).
- **No UI design choices.** The model picker and recipe panel are data-driven from `/models` plus one hardcoded recipe list; the error bubble already renders `meta.error.message`. No new component or visual state is introduced.

## Ordered slices

All Unchain commands run in `unchain-386` with `PYTHONPATH=src .venv/bin/python -m pytest ...`. Baseline before any edit: 99 passed for `tests/test_exact_provider_route_transport.py tests/test_durable_provider_turn_runtime.py tests/test_provider_failure_diagnostic.py tests/test_gemini_model_io.py tests/test_september_native_models.py tests/test_runtime_model_payloads.py tests/test_new_models.py`.

1. **U1 classification (red first).** Edit `tests/test_exact_provider_route_transport.py` parametrize (`503 -> transient_retry_safe`, add `502` same, `500` and `504` stay `None`); add a durable runtime test: transport raises 503 then returns a result -> one retry, completed. Save the failing output, then edit `_classified_failure_kind`. Files: `src/unchain/providers/exact_route_transport.py`, the two test files.
2. **U2 diagnostic and lease (red first).** Extend `failure_diagnostic.py` and `request_lease.py` per DD1..DD5; `from_exception` fills the new fields for google-genai errors only. New tests in `tests/test_provider_failure_diagnostic.py` and the lease tests: v1 and v3 bytes round-trip unchanged; v2 diagnostic plus v4 lease round-trip; extra key, unlisted status, replacement outside the catalog, schema mismatch between lease and diagnostic all fail closed; the real 404 message yields `gemini-3.8-flash`; the same message with `models/not-a-real-model` yields `""`.
3. **U3 messages.** DD6 and DD7 in `durable_turn_runtime.py` and `retry/types.py`; tests for the uncertain message with status, without status, and the exhaustion text.
4. **U4 catalog.** `model_capabilities.json` and `model_default_payloads.json`; new exact-assertion tests in the pattern of `tests/test_september_native_models.py`; move fixtures that named `gemini-2.5-*` (`tests/test_gemini_model_io.py`, `tests/test_eval_harness.py`, and any other failing test) to a current id.
5. **P1 PuPu.** `unchain_runtime/server/tests/test_gemini_provider.py`, `test_september_provider_models.py`, `agent_panel.js` and `agent_panel.models.test.js` (recipe list as a subset of the exported catalog), `build_model_options.test.js` and `api.unchain.secretDescriptor.test.js` fixtures. No production Python change is expected; add a host test that a v4 terminal error passes through `_normalize_stream_error` unchanged.
6. **V artifact pair and live check.** Build one Unchain wheel, run the PuPu sidecar tests against it, then the live matrix (every catalog model, one tool-calling turn, every declared thinking level once). The Gemini key was deleted after the 2026-09-30 matrix, so the user supplies it again for this step.

## Verification commands

- Unchain: slice-specific files above, then `PYTHONPATH=src .venv/bin/python -m pytest tests -q`.
- PuPu sidecar: `cd unchain_runtime/server && UNCHAIN_SOURCE_PATH=/Users/red/Desktop/GITRepo/unchain-386 python -m pytest tests/test_gemini_provider.py tests/test_september_provider_models.py tests/test_provider_terminal_diagnostic.py tests/test_durable_interaction_host.py -q --tb=short`. `../unchain` next to `pupu-386` is the original checkout, never evidence; the wheel build replaces this override for final evidence.
- PuPu frontend: `npm test -- --watchAll=false --testPathPattern="build_model_options|agent_panel.models|api.unchain.secretDescriptor"`.
- Restart the sidecar after any Python change before runtime verification, and record that in the evidence comment.

## Delegation assessment

**Partially suitable, no worker dispatched.** U1 has a settled design and an observable red-to-green signal, but it is three lines and the judgment is the retry set, already decided (D1). U2 and U3 cross a closed-schema, versioned persistence boundary with negative cases that decide correctness, so they stay with the strong agent. U4 depends on facts that are not yet proven (levels are checked live). P1 is bounded and mechanical, but it is a handful of string edits whose review cost is larger than writing them. Reassess if the live check adds more catalog work.

## Non-goals

No change to `_build_payload`, no reclassification of Gemini's own `RuntimeError`s (blocked prompt, finish reason, no content), no UI change, no retry-budget change, no new provider, no sidecar log persistence.

## Implementation status (2026-09-30)

Done in both clones, not committed (start phase): U1, U2, U3, U4, P1, the BC-201/202 documentation section and the Unchain README provider row.

Refinements made while implementing, all inside the decisions above:

- DD4: catalog membership of `replacement_model` is checked when a diagnostic is built from a provider error. A persisted record is checked for id shape only (`[a-z0-9][a-z0-9.-]{0,60}`), so an old failure record stays readable after a later release drops that model from the catalog.
- DD6/DD7: the status evidence for the uncertain and retry-exhausted messages is read through `_message_diagnostic`, which returns `None` if reading the provider error itself raises. Found by a red test with a provider error whose `status_code` property raises; before the guard the new exception replaced the uncertain error.
- Tests moved off retired ids as opaque names: `tests/test_gemini_model_io.py`, `tests/test_eval_harness.py` (Unchain) and three PuPu frontend tests. Test strings that quote Google's real 404 message, `tests/test_new_models.py` (`GEMINI_PRO_15`) and `tests/test_mid_run_microcompact.py` keep their 2.5 text on purpose (DD8).

Results: Unchain full suite 3869 passed, 16 skipped, 5 xfailed. PuPu sidecar full suite 2633 passed, 8 failed; the same 8 (3 screenshot tests without Pillow, 5 Kimi replay tests because the clone venv has anthropic 1.10.0 instead of the pinned 0.83.0) also fail against the untouched Unchain checkout. PuPu Gemini sidecar set (Gemini provider, September models, terminal diagnostic, durable interaction host, chat stream v4) 90 passed against a wheel built from `unchain-386`; the same set passes against the source tree. PuPu frontend `build_model_options`, `agent_panel.models`, `api.unchain.secretDescriptor` 38 passed.

Open: AC-386-7, the live check with a real Gemini key (every catalog model, one tool-calling turn, every declared thinking level). `gemini-3.1-flash-lite` levels are provisional until it runs. The wheel used above is a development build; the release-qa build (`scripts/release-qa/build-unchain-artifact.mjs`, clean source plus ref) belongs to the close step.

## Follow-up from user testing (2026-09-30, instance from `pupu-386`)

- A `gemini-3.7-flash` turn hung at Google and hit the SDK's 120 s HTTP timeout (`httpx.ReadTimeout`, no HTTP status). It surfaced as a bare `durable_provider_turn_uncertain`. Added, within D1: a timeout is still uncertain (never resent), but the text is now `durable_provider_turn_uncertain; Provider request timed out before a response arrived; the provider may still have processed it` (`_uncertain_detail` in `durable_turn_runtime.py`, red test `test_gemini_timeout_stays_uncertain_but_says_it_timed_out`). `httpx.ConnectError` (nothing was sent) is a candidate for retry-safe classification but is left out of this ticket.
- Resending after that failure showed "Waiting for the previous run to finish…" indefinitely. Cause, from the Memory V2 journal (`memory_v2/context_v2.sqlite3`): the failed graph-step attempt has no terminal event (its last event is `provider.wire_snapshot`), so the generation rebase preflight reports `attempt_open` → `context_v2_rebase_in_progress`. The journal holds zero `run_failed` / `graph.step.failed` / `graph.execution.failed` events for any execution, and four graph-step attempts across three chats are left at `provider.wire_snapshot`, plus five left at `interaction.resolved` after a Stop. Unchain's kernel never emits a `run_failed` runtime event (`grep` finds only the normalizer and compiler allowlists) and `GraphStepCheckpoint.terminal(status=FAILED)` has no caller on the failure path. This predates #386 and applies to every provider failure and every Stop under Memory V2 active; filed as #389 (direct child of #216), not folded in.

## Owner real-app testing round 1 (2026-09-30, instance from `pupu-386`)

Observed and handled:
- `gemini-3.8-flash` / `gemini-3.7-flash` failed after 18.6 s / 9.1 s with a bare `durable_provider_turn_uncertain`. Replaying the frozen requests (`memory_v2/objects/b0ebf523…`, `ae99b8b8…`) returned 503 up front every time, which this branch retries; the in-app exception therefore had no HTTP status and was not a timeout (connection lost mid-stream or a Gemini stream that ended without an answer). The sidecar traceback was not recoverable: sidecar stderr only reaches the renderer console, and neither the Electron log nor the test API log collector keeps it. Fix: failures without an HTTP status now carry fixed wording (httpx transport class, or the closed SDK finish/block reason via `ProviderResponseEndedError`), still uncertain and never resent (D1). Red 12 failed before, green after.
- `gemini-3.1-pro-preview` waited 3 min 17 s, then showed `retries_exhausted; Provider rate or quota limit reached (HTTP 429, status=RESOURCE_EXHAUSTED) after 10 retries`. The replay confirmed the key has no Pro quota. Known limitation recorded, not changed here: a quota 429 is retried like a rate limit, with no visible "retrying" state.

Out of scope, recorded:
- A `gemini-3.7-flash` turn with an approved `web_fetch` failed on the next turn with `provider-native tool/reasoning segment was mutated ambiguously` (`context_assembler.py` `_rehydrate`). No Gemini turn in the profile has ever completed a tool call. Same guard as closed #369 / #380 (provider-specific fixes); the project owner decided not to open a new ticket; the closest open ticket is #382 (tool results re-projected before the next model request), not yet confirmed to cover it.
- The same turn's `web_fetch` succeeded (`ok: true`, `error: ""`) but was labelled `status: error`: existing #254.

Acceptance change (project owner, 2026-09-30): AC-386-7 no longer requires a tool-calling turn per model; it requires each catalog model to answer a plain turn at each declared thinking level in the real app (3.1-pro-preview answering with the quota 429 counts as expected on this key). Tool-calling turns move to the provider-native replay work above.

## Added scope (owner, 2026-09-30): retry visibility (design A2), token line after retries

Design: A2 from https://claude.ai/artifact/2kPVC1jy2UDLqv4VXPhoPE (round 2). Budget wording: the default retry budget is 10 retries, i.e. 11 tries, so the segmented bar has one segment per try (`max_attempts`).

Event path (no new V4 event type):
1. Unchain `DurableProviderTurnRuntime._execute_route`: after a retry-safe failure with budget left, call an optional `retry_wait(ProviderRetryWait, sleep)` hook instead of `_delay`; `ProviderRetryWait` = failed try number, next try number, `max_attempts`, `delay_ms`, closed `ProviderFailureDiagnostic`. Without the hook the old `_delay` runs. Restart recovery keeps `_delay`.
2. Plumbing: `ContextProviderTurnExecutionService.fetch_prepared(retry_wait=…)`, `ContextRuntime._fetch_provider_turn_boundary` reads `before_attempt.retry_wait` like `after_attempt`.
3. Kernel: binds `before_attempt.retry_wait`; the hook emits raw `provider_retry` events through the run callback (one at the start of the wait, then one per second with `remaining_ms`) and sleeps in ≤1 s slices with the injected sleep. The sidecar step callback raises on a cancelled execution for every event, so a Stop interrupts the wait within a second and no further request is sent; an Unchain execution guard is also checked each slice.
4. Projector: `provider_retry` joins `_EPHEMERAL_EVENT_TYPES` (not journaled; the provider request leases are the durable retry record).
5. Normalizer: raw `provider_retry` → V4 `step.delta` on `model:{turn}:response`, `kind: "provider_retry"`. Old renderers treat an unknown kind as an empty text delta.
6. Renderer: activity tree adds one `provider_retry` frame per wait (the start event; heartbeats add no frame, the countdown is drawn from the frame's own time); the trace chain groups the waits of one run and model turn into one row and renders A2 (waiting: spinner, reason, countdown, segmented bar, legend, Stop wired to the composer's stop; settled: "Retried N×", or "Stopped while retrying" when the turn was stopped). New strings go through i18n in all 11 locales.

Token line: `selectRunBundleUsage` (V1 bundles) sums observed provider-call usage per metric when the aggregate is null because some calls have unavailable usage, and marks the result partial, following #377.

Contract:
- **BC-386-4** Unchain retry wait → kernel callback → sidecar → V4. CLOSED payload `{type, run_id, iteration, provider, attempt_failed, next_attempt, max_attempts, delay_ms, remaining_ms, http_status, provider_status}`; status fields come only from the closed diagnostic; no provider text.
- **BC-386-5** raw `provider_retry` → journal: ephemeral, never persisted.
- **BC-386-6** V4 `step.delta kind=provider_retry` → activity tree frame → persisted trace frame; unknown kinds stay text deltas in old renderers.
- **SEQ-386-3** send 503 → lease failed transient → `provider_retry` (start) → heartbeats → next send → result; Stop cell: Stop during the wait → next heartbeat raises → no send for the next ordinal, lease stays failed/retryable, turn shows "Stopped while retrying".
- **AC-386-8** runtime: hook called once per retryable failure with exact info; without hook old delay; hook raising stops before the next send (transport calls unchanged).
- **AC-386-9** kernel/sidecar: real graph runner emits start + heartbeat `provider_retry` events with exact closed payload; a cancelled token during the wait ends the turn with no further send.
- **AC-386-10** projector ignores `provider_retry`; normalizer maps it to the exact V4 payload.
- **AC-386-11** renderer: one frame per wait, grouped per model turn, settled by any later frame of the same run; A2 states (waiting, answered, gave up, stopped); Stop calls the composer stop; token line shows known usage for a retried turn and marks it partial.

### Implementation log (retry visibility and token line)

Unchain (`unchain-386`):
- `providers/durable_turn_runtime.py`: `ProviderRetryWait`, `RetryWaitHook`; `execute(retry_wait=…)` passed to every `_execute_route` call (primary and OpenAI fallback); `_delay_ms` split out of `_delay`.
- `context/provider_execution.py`, `context/runtime.py`: `retry_wait` plumbing.
- `kernel/model_tool_boundary.py`: the wrapper that rebuilds `before_attempt` when `after_attempt` is set now also copies `retry_wait`. Without it the hook was silently dropped on the final-model boundary path (found by the sidecar end-to-end test, which failed with no retry events before this fix).
- `kernel/loop.py` `_provider_retry_wait`, `kernel/lifecycle_events.py` `build_provider_retry_payload`.
- `context/projector.py`: `provider_retry` is ephemeral.
- `events/normalizer.py`: `_provider_retry_payload` copies only the closed fields and drops malformed events (non-integer or out-of-range numbers, `next_attempt != attempt_failed + 1`, `next_attempt > max_attempts`, `remaining_ms > delay_ms`, HTTP status outside 400–599, non-string status/provider).

PuPu (`pupu-386`):
- `SERVICEs/runtime_events/activity_tree.js`: `provider_retry` frames with the same closed checks.
- `COMPONENTs/chat-bubble/provider_retry_step.js` (new): grouping, outcome, reason text, A2 bodies and points.
- `COMPONENTs/chat-bubble/trace_chain.js`: rows, "Retrying…" header, no "Thinking…" row while waiting, `onStopStream` forwarded to nested chains, token-line partial note.
- `COMPONENTs/chat-bubble/chat_bubble.js`, `COMPONENTs/chat-messages/chat_messages.js`, `PAGEs/chat/chat.js`: a retry-only turn counts as trace activity; `stream.stopStream` reaches only the streaming last assistant message.
- `SERVICEs/run_bundle_v1.js`: V1 selector sums known usage per metric when the aggregate is unknown and reports `callCount` / `callsWithoutUsage`. Checked against the owner's profile (read-only): retried turns are V1 bundles whose completed call has usage (e.g. 17,296 total) and whose failed calls have none.
- `locales/*.json`: `provider_retry` block (19 keys) in all 11 locales.

Evidence (red before green unless noted):
- AC-386-8: `tests/test_durable_provider_turn_runtime.py` 3 new tests (2 red: missing hook); file 43 passed.
- AC-386-9: `unchain_runtime/server/tests/test_provider_retry_events.py` (real graph runner, Memory V2 active): red with no events until the boundary fix, then 2 passed. `tests/test_kernel_provider_retry_wait.py` 4 passed (written after the kernel hook; covers slicing, closed payload, Stop at the next heartbeat, lost execution guard).
- AC-386-10: normalizer 3 new tests (2 red) + projector rule; V4 normalizer suites 33 passed.
- AC-386-11: activity tree 3 new tests (3 red), runtime events 70 passed; `trace_chain.provider_retry.test.js` 9 tests (9 red, then 9 passed); `chat_bubble.provider_retry.test.js` + ChatMessages stop routing (2 red, then 4 passed); `run_bundle_v1.test.js` 2 new tests (red on the old selector with a validated bundle, then 12 passed); token line note (1 red, then 9 passed).
- Not yet verified in the real app.


## Bare `durable_provider_turn_uncertain` (owner report, 2026-09-30)

Observation: on 3.7-flash, ordinals 0 and 1 failed transient (503), ordinal 2 stayed `started`, and the surfaced text was the bare code. Waiting for a reproduction does not help: the renderer only ever receives the bare text, and the sidecar's stderr traceback is not kept. Every site that still raises the bare code leaves the lease `started`:

| Site (`durable_turn_runtime.py`) | When | New fixed text (after `durable_provider_turn_uncertain; `) |
|---|---|---|
| transport `send` raised an exception that is not an HTTP error, timeout, httpx transport error or Gemini response end | e.g. an SDK parsing error mid-stream | `Provider call failed with an unexpected error; the provider may still have processed it (<ExceptionClass>)` |
| `before_send` raised | the request never reached the provider | `Provider request could not be started (<ExceptionClass>)` |
| `send` returned something that is not a `ModelTurnResult` | adapter bug | `Provider returned an unusable result (<TypeName>)` |
| `_persist_result` could not seal the answer | e.g. an answer field the result envelope rejects | `Provider answer could not be recorded (<ExceptionClass>)` |
| `build_run_receipt` returned the wrong type | internal | `Provider call record could not be built` |
| lease found `started` by a later execution | a previous send never finished (crash, restart) | `An earlier send of this request did not finish and is not repeated; the provider may still have processed it` |

Only the class name is used, never the exception message, so no provider text can reach the UI (extends D4, which already names httpx transport classes). A class name that is not a plain identifier is shown as `unknown error`. Behaviour is unchanged: nothing is resent, the error type and code stay the same, and the cause stays chained for the stderr traceback.

Tests: the three existing tests that pinned the bare text are updated to the new wording; new tests cover `before_send`, an invalid result, a seal failure, an invalid run receipt and an unsafe class name.

Evidence: `tests/test_durable_provider_turn_runtime.py` 8 red (5 new tests, 3 updated pins), then 48 passed. Sidecar end-to-end `test_an_unexpected_provider_error_reaches_the_stream_with_its_class_only` (real graph runner, `ValueError("PRIVATE …")` on the first send): passes, and fails with exactly the owner's bare `DurableProviderTurnUncertainError('durable_provider_turn_uncertain')` when only the fallback wording is removed from a copy of the runtime.
