# PuPu #384 — retain interrupted tool-call history

## Scope and isolation

Repair [#384](https://github.com/haoxiang-xu/PuPu/issues/384): stopping a response retains every already-visible completed and in-flight tool call, its own arguments/result, order and identity. Unfinished calls remain truthfully interrupted or pending. History survives conversation switching and reload. No model request, shared-profile app/sidecar start/restart/stop, live approval click, merge, deployment, ticket closure or #249 work is authorized here. #383 real-device acceptance stays on hold.

Checkout: `/Users/red/Documents/Codex/2026-10-02/task-3/pupu-384` (independent Git clone, no shared Git objects). Branch: `codex/ticket-384-interrupted-tool-chain`. Baseline: remote `dev` at `0047d58d0369d5c245a3fd8021d4d97c3e3f9a35`, fetched using existing Git authentication. Main PuPu checkout stays at `3394b12a` with unrelated growth/store changes; main Unchain stays at `48f235dc` clean. The original worktrees and apps are untouched. Dependencies use task-local node_modules with read-only links to installed packages and a task-local `.cache`; no install or cache write into the shared dependency directory is allowed.

User requested model workflow: GPT-6.1 Sol planning and independent plan review; GPT-6 Luna authors implementation/tests; two proportionate GPT-5.6 Sol intermediate reviews; GPT-6.1 Sol final acceptance. Small source commits and remote push/readback checkpoints are separate from reviews. Initial plan must be pushed and independently fetched/restored before meaningful implementation. No credentials will be generated or copied.

## Baseline evidence and #383 overlap

Issue #384 is open, intent-only and has no comments/reproduction attachment. The actual composer stop button (`InputActionButtons`, `stop_mini_filled`) invokes `onStop`; `ChatInterface` binds it to `stream.stopStream`; the hook calls `cancelCurrentStreamAndSettleMessages`. That invalidates the run generation, queues exact execution cancellation, clears interaction UI, materializes streaming text, then calls `settleStreamingAssistantMessages` and persists its result.

On the immutable baseline, a direct real-helper probe with one completed `read_file` call and one in-flight `search` call, no final answer and empty content produced:

```
before message IDs: user-384, assistant-384
visible call IDs: complete-384, running-384
after message IDs: user-384
AssertionError: already-visible tool-only assistant chain must survive UI stop settlement
```

The helper drops a streaming assistant when neither streaming text nor `final_message` text is meaningful. Its existing #66 test explicitly expects a tool-only response to be dropped. This establishes frontend reconciliation loss; it does NOT establish deletion of MemoryV2 journal records. Real connected-app reproduction is NOT_RUN because the profile is reserved. A failed initial probe due to absent `@babel/register` was replaced by a local Babel module-loader probe that exercises the actual helper.

Independent hypotheses to test:

1. Text-only retention gate drops tool-only history (demonstrated above). Preserving meaningful execution history without fabricating body text should prevent this loss.
2. Pending runtime-frame batching can lose the last visible call around stop. If true, a real hook test with a frame/result around the stop boundary will show missing entries even after helper repair.
3. Renderer treats result-less stopped calls as complete. Baseline source confirms generic `toolStatus` defaults unconditionally to `done`; nested subagent parents without a result default to `active`, and worker traces derive status from child metadata. Generic and nested cancellation-status tests are mandatory, including metadata still saying running after local stop.

The deterministic actual V4 hook test established hypothesis 2 after the first retention repair: an accepted-baseline producer `step.started` call admitted before Stop but still pending in the 64 ms batch is discarded during teardown; no assistant remains. A paired case with two calls and one result already projected before Stop passes and preserves the exact call/result order and payload. These are separate observations: already-visible reconciliation loss, admitted batch loss, and genuinely late callback admission must not be conflated. The required patch is a synchronous stop-only drain of the exact current handle's already-admitted batch, including nested/frame UI commits, before capturing pending interaction identity and invalidating the generation. No await, timer change or new event admission is allowed during that drain. Tombstoning must still precede asynchronous cancellation, lookup, retry and disconnect work. Same-stack stop and stale/successor tests must rule out later scheduled message commits resurrecting the stopped response.

Pre-edit graph assessment for this newly proven batch slice: startRuntimeEventStream **CRITICAL**, 16 symbols / 14 process groups; wrapRuntimeEventStreamHandle LOW, 3 symbols; cancelCurrentStreamAndSettleMessages **HIGH**, 4 symbols / 3 process groups. Warnings were sent before the hook edit. Existing baseline index and source corroboration are used without another rebuild.

Baseline focused CRA suite: 2 suites / 4 tests pass (`chat_turn_utils` and `chat_storage.subagent_persistence`); the passing #66 expectation encodes the defect, so it is not evidence against this red probe. Graph CLI uses the installed GitNexus 1.6.12 artifact directly because generated run.cjs attempts an unavailable npm fetch. First fresh graph at baseline reports settlement risk LOW (useChatSessionState direct, ChatInterface indirect) and TraceChain UNKNOWN (JSX edges unresolved). Source confirms ChatBubble and recursive TraceChain callers. The hook is 550,802 bytes, above the default 512 KiB cutoff; a fresh 1024 KiB analysis is required before implementation and risk classification must be revisited. Process walks are also capped; graph absence is never used as an all-clear.

The one forced full 1024 KiB rebuild includes the hook: `settleStreamingAssistantMessages` reports **CRITICAL**, 8 impacted symbols, 5 direct callers, 7 process groups. `cancelCurrentStreamAndSettleMessages` reports **HIGH**, 4 impacted symbols, 3 process groups: direct `stopStream` and `deleteTurn`, indirect useChatStream and ChatInterface. Warnings were sent before editing. Delete/edit/resend/stop ownership regressions belong in focused/aggregate evidence. The incremental refresh temporarily lost settlement/TraceChain lookups; the forced rebuild recovered them. JSX caller coverage and capped process walks remain limitations, corroborated by source. No further graph rebuild is planned.

#383 PuPu PR393 remains draft at `7e7abc21c9e7a5aa6850de01df4c981cb2de4126`; its Unchain companion PR47 remains draft at `73b11eb7db996fcd303555d448c4a145246f6760`, stacked on PR46. The fetched #383 branch has the same `dev` baseline and changes TraceChain, timeline, activity_tree and sidecar projections. It does not change chat_turn_utils or use_chat_stream. #384 must not adopt its policy/grouping API or pin its unaccepted runtime. Keep retention logic in existing message settlement; if TraceChain status needs changes, keep them narrow and explicitly assess the shared hunks against #383. Test an isolated combined candidate (without committing/cherry-picking #383 into #384) if both patches touch that renderer. Related #262 cancellation and #252 replay are regression dependencies, not the issue being fixed.

## Engineering plan

1. Read AGENTS/CLAUDE, relevant local GitNexus skills, contract gate and permitted Codex memory summaries/recaps. Build a fresh checkout-specific GitNexus index with an isolated GITNEXUS_HOME. Run query/context/upstream impact before any symbol edit; report HIGH/CRITICAL and corroborate UNKNOWN with source reads. Save this plan plus independent Sol review, run graph change detection, commit, push and fetch into a separate restore clone; compare commit and plan bytes.
2. Luna writes red regression tests through the actual stop callback and storage boundary, plus focused settlement and rendering tests. Capture the baseline failures. Cover tool-only responses; completed + in-flight calls; pending approval; result before/at/after stop; root and nested subagent frames; text/no-text; empty placeholders; repeat stop; switch/reload; exact call/run/attempt ownership. Distinguish an event admitted before stop but pending in the batch from a genuinely late callback. Do not delay generation invalidation behind asynchronous flush. A meaningful-history predicate must keep supported root/nested visible tool history while excluding metadata-only, empty object/array and malformed placeholders. Exercise real components/helpers, mock only external transport/model boundaries.
3. Luna implements the smallest proven fix. Preserve frames/metadata and content without converting tool output into prose, minting fake results, marking pending approval approved, changing receipts/digests, or accepting stale-run callbacks. Result received before stop stays completed; no result stays interrupted/pending. Cancelled message status must not imply backend cancellation has already finished. Do not loosen storage/schema guards.
4. Run first GPT-5.6 Sol review after focused red-to-green and first code checkpoint; fix substantiated findings with additional tests/commits. Push/read back every meaningful slice. Run second GPT-5.6 Sol review after full stop/reload/race evidence and overlap assessment.
5. Run relevant aggregate frontend suites and a CI web build with version preparation. Use an isolated browser fixture of the compiled actual consumer with fake runtime/temporary data for UI inspection; do not start Electron or a real sidecar with the shared profile. Add exact artifact-pair evidence where the boundary gate applies. Final GPT-6.1 Sol acceptance evaluates immutable committed/pushed source, red-before-green, focused/aggregate evidence, graph limits and remaining live checks. Coordinate with source parent before any draft PR. Keep active rollout INCOMPLETE until applicable real-device cells are coordinated and pass.

## Boundary contracts

### BC-384-001 — runtime frames → UI stop settlement → chat persistence → reload

- Producer: actual streaming hook projection and existing runtime event/legacy-frame adapters. Consumer: settlement, chat_storage sanitizer/persistence and ChatBubble/TraceChain after switch/remount. Transport: React/ref state and existing storage APIs; durable backend journal is a separate authority.
- Producer shape: assistant message with stable id/attempt metadata, `status: streaming`, optional streaming text, `traceFrames`, `subagentFrames`, `subagentMetaByRunId` and existing allowed metadata. Canonical representation: unchanged ordered call/result frames and existing message identity, materialized content, truthful `status: cancelled`. Consumer shape: existing sanitized persisted message, no new wire schema.
- Admission: CLOSED existing message/frame key sets through chat_storage sanitizer, with OPEN bounded cloned frame payload extensions (existing string truncation). No schema or unknown-field widening. Preserve supported trace payloads; reject/drop malformed data under existing guards. Strict tests must compare persisted message/frame key sets and exercise unknown message/frame fields versus supported payload extensions. Malformed/nonmeaningful placeholder data must not accidentally keep an empty message; unrelated message/attempt/run remains untouched.
- Projection/failure: keep inspectable execution history even with empty content; retain existing completed results and pending interactions without fabricating success. Drain only the current handle's already-admitted runtime batch synchronously, including frame/nested UI commits, before stop settlement and generation invalidation; do not await or admit further events. Tombstoning still precedes async cancellation/retry/disconnect. Cancellation transport failure retains local history and existing outbox error/retry behavior. No frame reordering/duplication or synthesized runtime receipts.
- Identity: assistant message id + attempt/run/call identities and confirmation ownership. No new schema version, manifest, provider payload, digest or receipt. Artifact identity: bind source SHA, dependency lockfile and compiled UI evidence; if real runtime producer evidence is used, build/import one accepted-baseline Unchain wheel once, record wheel SHA-256 and actual runtime protocol manifest digest and reuse it throughout. No mutable #383 runtime as acceptance evidence.
- AC-384-001: actual stop callback retains completed/in-flight visible calls in same order with exact payloads and no fake body; tool-only response survives.
- AC-384-002: stop during pending approval retains the call, does not approve it and disables stale interaction actions; existing exact cancellation ownership stays intact.
- AC-384-003: result arrival before/around stop preserves an observed result; stale callbacks after stop cannot mutate a successor or fabricate completion.
- AC-384-004: storage round trip and conversation switch/remount retain identities, payloads, order and truthful status; repeated stop is idempotent.
- AC-384-005: empty no-history placeholders remain droppable, unaffected messages keep reference/value semantics, malformed data and mismatched identities fail at existing boundary.
- AC-384-006: compiled actual UI shows preserved calls, expandable own arguments/results and truthful unfinished status in generic, parent-subagent and nested worker traces; stopped children cannot remain actively spinning due to stale running metadata. #383 overlap inspection/isolated integration remains clean or is documented unresolved.

### SEQ-384-001 — visible tool-only response → stop → switch → reload

- Identity: chat/message/attempt/run/call ids. Start with a user message and streaming assistant. Observe call A, result A, call B (or pending approval B), no final answer. Invoke the same `stopStream` callback as composer; cancellation queues with exact identity. Persist cancelled assistant with observed ordered history. Switch away/back; reload/remount from storage; still inspect A and B once each with A's result and B's truthful interrupted/pending state.
- Repeat: second stop does not duplicate/drop frames or change completed results. Result timing: parameterize before stop, within pending flush, and late stale callback. Newer attempt: cancellation/result for old attempt cannot overwrite successor. Nested subagent history: preserve own run scope and expose retained detail. Persistence boundary: BC-384-001; AC-384-001 through AC-384-006.
- Retry/durable resume/restart: tests exercise unchanged cancellation and replay behavior where reachable; no new durable resume mechanism. Real sidecar cold restart remains NOT_RUN until parent coordinates profile access. Graph/subagent paths applicable when same settlement handles frames; provider-message semantics unchanged but live runtime evidence remains NOT_RUN.

## Acceptance matrix and delivery state

| Cell | Evidence target | Initial state |
|---|---|---|
| First ordinary response with calls | real stop hook + fake transport | NOT_RUN |
| Second response in same chat | ownership/reference regression | NOT_RUN |
| First interaction | pending approval + stop | NOT_RUN |
| Second interaction in same execution | exact second-call owner preserved | NOT_RUN |
| Tool execution/result race | deterministic callback ordering | NOT_RUN |
| Retry/replay/durable resume | relevant existing regression suites, isolated storage | NOT_RUN |
| Switch/reload/reopen | actual storage round trip + consumer remount | NOT_RUN |
| Root/subagent scopes | same helper and nested TraceChain | NOT_RUN |
| Compiled UI + accepted runtime artifact | pinned exact artifact pair if used | NOT_RUN |
| Real Electron stop/reopen, cold sidecar resume | parent-coordinated shared-profile window | NOT_RUN / ON HOLD |

Initial gate completed at `f5d0278e`: reviewed plan pushed and independently restored directly from GitHub before Luna edited tests/source. Red checkpoint `0ef41b29` reproduced six failures across four suites; source checkpoint `f3d3fd6b` passed four suites / 70 tests and was pushed/read back. Intermediate review 1 requested a nested visible-status correction. The matrix above records the original planned cells; final evidence and current cell states will be added after corrections and state-sequence verification. Active rollout: INCOMPLETE; real-device cells remain ON HOLD.
