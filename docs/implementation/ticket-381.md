# Ticket #381 — Live interject startup fallback repair

## Delivery identity

- Ticket: https://github.com/haoxiang-xu/PuPu/issues/381
- Release: v0.1.13, direct child of #318
- Workspace: `/Users/red/Desktop/GITRepo/pupu-381`
- Branch: `codex/ticket-381-live-interjection-routing`
- Base: `dev` at `1a0094f3b692323b012905bdafeffed16a8984e4`
- Candidate state: accepted by the project owner for the scoped #381 behavior; close delivery authorized on 2026-10-11

## Goal

When an explicit `/fyi` or `/btw` reaches `/chat/interject` during the narrow V4 startup gap and receives `resolved_channel: new_run`, retry the same intent for a bounded period while the exact run remains active. Accept it once the sidecar channel is registered. If the live run continues to refuse it, keep the text exactly once and visibly explain the fallback.

## Non-goals

- Do not add graph-recipe interjection; that remains #214.
- Do not change the interject HTTP schema, Electron IPC channel, provider selection, command registry, or queue persistence format.
- Do not use a local model for testing.
- Do not redesign the composer, queued-turn surface, or toast system unless the project owner explicitly selects a component for alternatives.
- Do not commit, push, create a PR, audit, merge or close during the start phase.

## Reproduction and causal path

The deterministic no-provider probe drives the real Flask V4 and interject routes with a fake event generator:

1. POST `/chat/stream/v4` for session S/attempt A.
2. Consume the first SSE block: `session.started`.
3. POST explicit FYI for S before advancing the event iterator: response is `new_run`.
4. Advance to the first runtime event, which causes `stream_chat_events()` to register `InterjectChannels`.
5. POST FYI again with the same session: response is `fyi`.

The race is caused by route ordering, not a thread-ID mismatch. The renderer installs the active stream handle and accepts interject input before the adapter generator has necessarily executed its registration block. `dispatchInterjectChannel` then interprets `new_run` as a queue fallback. That fallback is safe for a truly unsupported run but wrong and silent for this transient startup state.

## Settled repair

Add a focused, testable bounded-retry helper in `interject_controller.js` and call it from the existing `dispatchInterjectChannel` network boundary.

The helper receives the already-built request, request function, active/current predicate, wait function and fixed retry delays. It performs the first request immediately. It retries only a `new_run` result while the exact run predicate remains true. Every attempt reuses the same request object, especially thread/session and FYI message ID. It returns the final response without changing the HTTP contract; the hook combines that response with its current ownership predicate to distinguish acceptance, inactive termination and retry exhaustion.

The hook retains all current accepted `fyi`, `btw`, `clarify`, `queue`, stale generation, error and durable-outbox branches. On exhausted `new_run` while still active, it performs the existing exactly-once queue migration/push and emits a deduplicated informational toast explaining that the live run could not accept the requested command and that it was queued for the next turn. The copy must name FYI or BTW based on the requested channel. If the run stops during the retry window, the existing post-run/new-send handling applies.

## UI inventory and selected direction

1. **Fallback notice (`toast.info`)**
   - Role: make a genuine live-run refusal visible after retry exhaustion.
   - Reuse: the existing toast service; no new component or layer.
   - States: absent during transparent retry and success; one deduplicated notice after exhaustion; existing error toast for request failures.
   - Interaction: informational only; queue undo remains on the existing queued-turn surface.
   - Selected direction: reuse the existing informational toast style and duration; add only precise fallback copy and deduplication.
2. **Queued-turn surface**
   - Role: retain the fallback command exactly once and provide existing undo behavior.
   - Reuse unchanged; no new states or visuals.
3. **Composer/input**
   - Role: entry point for `/fyi` and `/btw` during streaming.
   - Reuse unchanged; no loading control or new disabled state.
4. **Accepted FYI/BTW trace/message projection**
   - Role: existing accepted state and side answer display.
   - Reuse unchanged; no new component.

The project owner requested no new UI and no visual alternatives. Existing toast, queued-turn, composer and accepted-projection patterns are binding.

## Boundary records

The canonical BC-381-01, SEQ-381-01 and AC-381-01..06 are in the GitHub issue body. Implementation rules:

- preserve the exact request identity across retry;
- keep the HTTP request and response shapes unchanged;
- bound retries and stop on stale/inactive ownership;
- never turn one pending FYI into multiple queue items or injected notes;
- make exhausted active-run degradation visible;
- treat graph recipe permanent `new_run` as an exhausted/unsupported path, not as evidence of transient readiness.

## GitNexus impact and risk warning

The clone index is current at the base SHA, covers the >512 KiB streaming hook via a 1024 KiB limit, and reports 45,337 nodes, 153,789 edges and 1,208 flows. Global process generation is truncated, so absent paths are not an all-clear.

- `dispatchInterjectChannel`: **CRITICAL**, 24 upstream symbols, two direct callers, 14 affected processes, two modules. Direct callers are `handleInterject` and `onClarifyResolve`.
- `pushQueuedTurn`: **CRITICAL**, 13 upstream symbols, two direct callers, nine affected processes.
- `buildInterjectionRecord`: LOW, five upstream symbols and two affected processes.
- `api.unchain.interject`: UNKNOWN due plain-object dispatch. Text-backed call and API tests confirm it is live; do not edit its projection.

The CRITICAL warning is accepted only for the narrow response-boundary change described above. Re-run exact impact before editing if the symbol or edit scope changes.

## Ordered implementation slices

### Slice 1 — deterministic retry policy

Permitted files:

- `src/PAGEs/chat/hooks/interject_controller.js`
- `src/PAGEs/chat/hooks/interject_controller.test.js`

Add red-before-green tests for:

- first `new_run`, second `fyi` using the same request/message ID;
- first `new_run`, second `btw` returning its answer;
- inactive/stale predicate after the first result stops retry;
- all `new_run` results stop at the fixed budget;
- accepted/clarify/queue and thrown error do not receive inappropriate retries.

Checkpoint: helper tests green; no hook edit yet.

Result: complete. The helper uses 40/80/160 ms delays, preserves request identity, stops before or after a delay when ownership becomes inactive, propagates transport errors, and is covered for transient FYI, transient BTW, permanent refusal and non-retry responses.

### Slice 2 — hook integration and visible exhaustion

Permitted files:

- `src/PAGEs/chat/hooks/use_chat_stream.js`
- one existing focused `use_chat_stream.*.test.js`, or a new focused JavaScript test if the existing harness cannot express the sequence

Integrate the helper with the exact generation/stream-active predicate. Preserve durable FYI intent and queue migration. Add integration tests proving FYI and BTW acceptance after transient fallback, stale-run termination, one queue fallback on exhaustion and one user-visible explanation.

Checkpoint: inspect diff against the CRITICAL impact list and run all focused interject/outbox/secret-disposition suites.

Result: complete. The existing hook now supplies its exact generation plus live stream/handle predicate. Exhausted active-run fallback uses the existing durable FYI migration or queued-turn push and one deduplicated informational toast naming `/fyi` or `/btw`. Existing accepted FYI copy now says “Accepted” instead of describing the sidecar queue as the local follow-up queue.

### Slice 3 — boundary regression and final development verification

- Run the deterministic no-provider V4 ordering probe to preserve evidence that the startup gap exists.
- Run existing Python interject route/adapter suites; no Python production edit is expected.
- Run targeted frontend suites and diff checks.
- Run fresh GitNexus change detection for review; mandatory pre-commit change detection remains deferred until the user says `close`.

Result: complete for development review. No Python production file changed, so no sidecar restart is required. The mandatory fresh pre-commit graph check remains intentionally deferred until close delivery.

## Development verification evidence

- Red-before-green helper test: six new cases initially failed because the helper did not exist; all pass after implementation. A seventh case covers transient BTW acceptance.
- Frontend focused regression: 231 tests passed across the chat, interject controller, chat storage and test-bridge suites. After the final channel-specific copy/test addition, the 11 directly affected tests passed again.
- Sidecar interject regression: 23 route and adapter tests passed.
- No-provider route probe: `session.started` was followed by an early `new_run`; advancing the fake event generator registered the channel and the same FYI identity resolved to `fyi`. Provider request count remained zero.
- `git diff --check`: clean.
- GitNexus development change review: four tracked files, seven indexed changed symbols, ten affected processes, risk `high`; the report was complete and did not indicate partial or truncated output. The change remains inside the pre-declared CRITICAL hook boundary.

## Test commands

Use PuPu's installed dependencies; never invoke bare Jest:

```bash
CI=true npx react-scripts test --watchAll=false --runInBand --testPathPattern='interject_controller|use_chat_stream.*interject|queued_turn_outbox|api.unchain.interject'
```

Use the existing PuPu sidecar environment:

```bash
cd unchain_runtime/server
PYTHONDONTWRITEBYTECODE=1 /Users/red/Desktop/GITRepo/PuPu/.venv/bin/python -m pytest -q tests/test_route_interject.py tests/test_adapter_interject.py --tb=short
```

No sidecar restart is required unless a Python production file changes. No local-model inference is allowed.

## Model/delegation assessment

**Not suitable for a weaker implementation model.** The small expected diff sits inside a CRITICAL 14-process hook and must preserve durable outbox ownership, stale-generation fencing, clarification barriers, exact FYI idempotency, queue migration and cross-process timing semantics. Existing tests do not currently exercise this startup response sequence end to end, so the implementation still requires judgment when selecting the insertion point and proving no duplicate fallback. The strong agent will implement and review both slices using the selected existing UI patterns; no implementation subagent is planned.

## Stop conditions

Stop before dependent edits if evidence requires a wire-schema change, a new UI component, graph-recipe support, queue persistence changes, altered command semantics, or Python production changes broader than the established startup ordering. Those would change scope or require a revised boundary plan and project-owner decision.
