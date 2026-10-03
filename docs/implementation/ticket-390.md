# Ticket 390 — Provider-native tool continuation repair

Ticket: https://github.com/haoxiang-xu/PuPu/issues/390
Release: #216 / v0.1.12
Status: Candidate model/tool behavior accepted by the owner on 2026-10-02. The final exact-wheel regression results and limitations are recorded in ticket-390-uncertainty-diagnostics-acceptance.md. Delivery is Draft: integration with the parallel #386 runtime is blocked by incompatible persisted-schema and retry-event shapes; see the delivery hold below. Owner acceptance does not invent a completed per-model matrix.

PuPu workspace: `/Users/red/Desktop/GITRepo/pupu-390`
Branch: `codex/ticket-390-native-replay`
Base: `dev @ 5b0e15bc64a02c324d18124dfe919a2dc6c3e236`

Unchain workspace: `/Users/red/Desktop/GITRepo/unchain-390`
Branch: `codex/ticket-390-native-replay`
Base: `dev @ da5d55b8bf50a51bd81974ada99ba8a888f969d5`

## Goal

Restore reliable continuation after provider-native tool calls for Anthropic/Claude,
Google/Gemini, and DeepSeek/Hyperspace. The second model request must preserve the
complete semantic assistant message returned by the provider, including sibling text
and every tool-call block in original order, while the existing replay frame remains
the sole authority for opaque provider-only reasoning, signatures, and wire metadata.

The fix must retain the current fail-closed replay guard. A changed tool identity,
arguments, order, provider, attempt, iteration, artifact digest, or replay format must
still stop before another provider request.

## Non-goals

- No UI design or memory-inspector work.
- No general memory retrieval, compaction, pagination, or SQL optimization.
- No change to issue #389 run/step failure settlement.
- No mutation or migration of existing journal events, result artifacts, replay frames,
  provider signatures, or stored tool results.
- No provider-specific bypass and no downgrade from local replay to lossy semantic
  reconstruction.
- No public `ContextCompileRequest` schema change unless the fixed internal design is
  proven impossible at Checkpoint 1 and the ticket is re-planned before implementation.
- No new profile, API key, or disposable user instance for live acceptance.
- Do not touch the user's original PuPu or Unchain checkout or running profile.

## Confirmed root cause

Three real saved provider frames were replayed offline through the current compiler and
assembler:

- Anthropic: persisted semantic message is text plus one `tool_use`; the compiler
  rebuilds only the `tool_use`.
- Gemini: persisted semantic message is text plus two `function_call` parts; the
  compiler rebuilds only the two calls.
- DeepSeek/Hyperspace: persisted semantic message is text plus four `tool_use` blocks;
  the compiler rebuilds only the four calls.

Tool call IDs, names, arguments, and order are unchanged. Restoring the original full
semantic assistant message makes the existing strict `_rehydrate` comparison pass.
The failure reproduces without history, compaction, or model switching and also
reproduces with the pre-#382 compiler. Therefore #382 and Memory V3 history loading are
not causal.

The loss occurs in the current-tool-batch projection:

1. `provider.turn_result` durably stores the complete `ModelTurnResult`, including
   `assistant_messages`, normalized tool calls, and the provider replay frame.
2. Tool execution later writes canonical `tool_call` and `tool_result` events.
3. `ContextCompiler._current_native_tool_batch` reconstructs an assistant message from
   only the canonical `tool_call` events.
4. `ProviderContextAssembler._rehydrate` compares that call-only semantic message with
   the complete semantic segment derived from the replay frame and correctly rejects it
   as an ambiguous mutation.

## Why tickets #369 and #380 did not cover this defect

Both earlier fixes are valid and remain required, but they repaired narrower mismatches
inside one provider tool turn:

- #369 preserved supported Anthropic text-block metadata and normalized the SDK's
  `caller: {"type": "direct"}` transport marker. Its mixed text/tool regression used
  the legacy in-memory runtime and checkpoint path, where the provider's complete
  `assistant_messages` stay in `RunState`; it did not pass through the Memory V2 durable
  journal coordinator and `_current_native_tool_batch`. The final real Sonnet acceptance
  response was signed thinking plus `tool_use` with no sibling text block, so the durable
  compiler's message-level loss was not exercised.
- #380 normalized the SDK-filled `caller: None` used by DeepSeek's
  Anthropic-compatible endpoint. Its canonical-compiler regression explicitly rebuilt
  a response shaped as thinking plus tool call(s), without sibling text. The replayed
  real DeepSeek incident had the same shape, and the six-iteration/16-tool-call live
  acceptance therefore proved the field normalization but not mixed-content retention.

The missing matrix cell was: **Memory V2 durable journal → coordinator → compiler →
assembler, with one provider response containing both visible text and tool call(s)**.
#390 adds that cell for every affected provider and keeps the earlier field-normalization
regressions intact.

## Fixed design decisions

### D-390-01 — Preserve the strict replay guard

`ProviderContextAssembler._rehydrate` remains the final fail-closed comparison and wire
restoration boundary. Do not weaken equality to call IDs only, ignore sibling text, or
silently choose the replay frame on a mismatch. Existing negative mutation tests remain
required.

### D-390-02 — Use the durable provider result as the semantic authority

For a current completed tool batch, the coordinator resolves exactly one matching
`provider.turn_result` from the stable journal snapshot and its digest-verified artifact.
It validates:

- execution, generation, attempt, and provider-request subject;
- journal event payload and authorized whole-artifact reference;
- artifact byte length, SHA-256, canonical JSON, envelope schema, result digest, and
  route digest;
- one complete assistant message/tool-call group whose normalized call IDs, names,
  arguments, and order exactly equal the canonical current `tool_call` batch;
- event order: the provider result precedes the matching tool calls and all required
  tool results are present before continuation.

Missing, conflicting, overflowed, foreign, stale, or mismatched evidence fails closed
before compilation. The code must reuse the existing provider-result validation rules
rather than introduce a second permissive decoder.

### D-390-03 — Keep the new seam private

Carry the verified current-turn projection through coordinator-owned private types and
private compiler arguments, for example a frozen `_CurrentProviderTurnProjection`
attached to `_PreparedJournalView` and passed to `_compile_for_coordinator`.

Do not add unbound assistant messages to `source_messages`, overload
`pending_task_inputs`, or expand the public/versioned `ContextCompileRequest` schema.
Direct non-durable compiler callers retain the current synthetic call-only fallback;
the durable runtime path must use the verified projection whenever the replay frame
requires it.

### D-390-04 — Compiler owns budgeted semantic content; replay owns wire-only content

`_current_native_tool_batch` uses the verified complete `assistant_messages` for the
call side of the current atomic exchange and then appends canonical rebuilt tool-result
messages. This keeps sibling visible text in token accounting, checkpoint decisions,
and the model-visible context.

Opaque provider reasoning, signatures, encrypted items, and provider-only metadata are
never copied into compiler semantic messages. They continue to be restored only from
the verified provider replay frame after strict semantic matching.

### D-390-05 — One provider-neutral contract

The coordinator/compiler repair is shared. Provider adapters may contribute only their
existing normalized assistant-message/replay-frame representation. Do not add separate
Claude, Gemini, or DeepSeek bypass branches to the compiler or assembler.

## Cross-boundary records

- **BC-390-01 (VERSIONED):** provider SDK response → `ModelTurnResult` → canonical
  `unchain.provider_turn_result.v1` artifact/event → verified private current-turn
  projection. Preserve complete semantic assistant blocks and exact ordering. Reject a
  missing/conflicting receipt, noncanonical artifact, digest mismatch, foreign scope,
  route mismatch, or call-group mismatch before model I/O.
- **BC-390-02 (CLOSED):** verified current-turn projection + canonical tool results →
  context compiler atomic exchange → `ProviderContextAssembler` strict replay → next
  provider wire request. Compiler owns visible semantic content and budget accounting;
  replay frame owns opaque provider-only content. No silent fallback crosses the
  boundary.
- **BC-390-03 (VERSIONED):** exact Unchain wheel → PuPu sidecar import/admission → live
  chat stream. The accepted wheel SHA-256 and runtime manifest digest must be recorded
  and the sidecar restarted before acceptance. If implementation changes an advertised
  capability, PuPu must reject the old/missing capability before any provider call.
- **BC-390-04 (CLOSED):** Google SDK HTTP response/error → Unchain exact Gemini
  transport failure classification → durable lease. Producer evidence is an authentic
  Google APIError with code 503 and an HTTPX response whose actual status is 503, before
  any successful response stream. Canonical failure is transient_retry_safe with the
  frozen wire identity, retry ordinal, and a content-free HTTP 503 diagnostic. An SSE
  error carried by HTTP 200, arbitrary numeric exception code, missing response,
  mismatched status, transport disconnection, or partial stream remains uncertain.
  This rule changes no provider wire schema or runtime protocol manifest.
- **BC-390-05 (CLOSED):** durable provider lease/diagnostic → PuPu sidecar stream error
  → chat UI. The provider, HTTP status, failure classification, retry ordinal and
  bounded retry outcome may cross this boundary; provider response body, prompt, key,
  and raw exception text must not. The existing failure diagnostic v1 schema remains
  exact; unknown fields/versions fail closed. Successful retry produces no terminal
  error. Exhaustion reports a stable, intelligible provider-busy error, while an
  ambiguous stream retains its existing uncertain code and no automatic resend.
- **BC-390-06 (CLOSED):** committed retry-safe Gemini 503 lease → ephemeral
  `provider_retry` trace frame → PuPu timeline. Only provider=`gemini`, HTTP status
  503, next retry ordinal, bounded retry total, and computed delay cross the
  boundary. The frame is informational and carries no prompt, response body,
  credentials, raw exception, or journal semantic message. Host and renderer
  validate the closed shape before displaying it; the durable event sink explicitly
  skips this temporary status. Loss of the UI observer cannot alter the durable
  request identity or retry budget.
- **BC-390-07 (CLOSED):** Anthropic SDK streamed response block → canonical
  `ModelTurnResult` semantic/replay representations → verified replay association →
  copied Anthropic request wire. `parsed_output` is a known SDK-only response helper,
  never an Anthropic input field: remove it from text blocks before semantic/replay
  fan-out for new results, and remove it only from the already-copied outbound view
  for legacy persisted results. Preserve text, citations, thinking signatures, tool
  IDs/names/input/order, artifact bytes and all arbitrary unknown-field failures.
  Do not mutate journals, result artifacts, replay frames, or widen the CLOSED input
  allowlist.
- **SEQ-390-01:** provider returns mixed text + one tool call → result is durably stored
  → tool call/result are journaled → compiler restores the complete semantic assistant
  message → assembler restores exact wire items → second provider request succeeds.
- **SEQ-390-02:** provider returns mixed text + parallel tool calls → results complete in
  canonical order → one atomic call/result group continues without loss or duplication.
- **SEQ-390-03:** persist first provider turn → stop/restart sidecar → rebuild from the
  same profile → continue with the same verified semantic and wire content.
- **SEQ-390-04:** first provider completes a tool turn → user switches provider in the
  same chat → historical native material remains owned by its original replay frame and
  the active provider receives a valid projected history.
- **SEQ-390-05:** duplicate or stale current tool results conflict with the verified
  native batch → compilation stops with a stable diagnostic before the next provider
  request; no neutral-context fallback may discard the current exchange.
- **SEQ-390-06:** a verified exchange is compiled under history pressure → checkpoint
  reduction commits durably → complete sibling text and the ordered call/result group
  remain present in the next provider request.
- **SEQ-390-07:** a mixed-content tool turn completes → its next provider send receives
  one retry-safe transient failure → the identical durable request is retried with a
  new receipt ordinal, without executing the tool again or changing the exchange.
- **SEQ-390-08:** a mixed-content tool result is persisted → the root attempt receives
  a failed or cancelled terminal event → context compilation rejects another provider
  request for that attempt.
- **SEQ-390-09:** a verified Gemini tool/result turn is complete → the next frozen
  model request receives an HTTP 503 before the stream → failure lease with sanitized
  diagnostic is committed → bounded exponential backoff with jitter (and Retry-After
  when present) → a new ordinal sends the identical wire, without rerunning tools.
  Repeat and cold restart recover a completed result without another send; crash after
  the failed lease follows its retryable flag and budget. Permanent overload terminates
  after the smaller Gemini-specific budget and reports HTTP 503.
- **SEQ-390-10:** an HTTP 200 stream emits content, then carries a 503 error or drops →
  no verified terminal result → lease stays STARTED/uncertain; repeat and restart do
  not resend. An untrusted exception with a spoofed numeric 503 follows the same rule.
- **SEQ-390-11:** a confirmed HTTP 503 failure lease commits → before the bounded
  backoff, the live trace shows `Gemini temporarily busy — retrying 1/2` with the
  safe delay → success removes the active waiting state and the final answer
  completes. A second 503 shows 2/2; exhaustion keeps the existing clear error.
- **SEQ-390-12:** an Anthropic SDK stream returns text plus one or more tool calls →
  the SDK `ParsedTextBlock` is normalized before semantic/replay persistence → tools
  complete → strict replay matching completes → the second Anthropic request has no
  `parsed_output`. For an old persisted pair that contains the helper in both
  semantic and replay data, matching occurs unchanged first and only the outbound
  copied wire is normalized; retry and cold restart therefore retain the signed,
  byte-verified historical record while a second provider request remains valid.

- **AC-390-09:** real Google SDK + exact transport + SQLite test: authentic pre-stream
  HTTP 503, then success; exact wire equality, persisted failed/completed leases,
  Retry-After/backoff, restart and no duplicated tools.
- **AC-390-10:** real Google SDK negative tests: HTTP 200/SSE 503 after output,
  disconnect, bare or mismatched status, and budget exhaustion. Assert no duplicate
  send for ambiguous cases and bounded sends for definite overload.
- **AC-390-11:** PuPu sidecar/renderer tests: bounded HTTP 503 classification reaches
  a human-readable terminal message without raw response body or secret material; the
  prior uncertain path and mixed native replay remain unchanged. Rebuild one exact
  wheel, verify runtime manifest and PuPu candidate, restart sidecar, then live-test
  the existing profile without new credentials before active rollout.
- **AC-390-12:** real SDK + SQLite test observes only the two safe retry-progress
  events after committed 503 failures, in order, with the frozen request unchanged;
  SSE/transport uncertainty emits none. Sidecar and timeline tests accept the
  exact safe shape and reject malformed or content-bearing progress payloads.
- **AC-390-13:** the installed Anthropic SDK with HTTPX MockTransport produces a real
  `ParsedTextBlock` with null and populated `parsed_output`, then completes a
  text-plus-parallel-tool continuation and a second provider request. Assert the
  persisted semantic/replay pair and all valid metadata retain their order, the
  outbound wire omits only `parsed_output`, original legacy input remains unchanged,
  and an arbitrary unknown text field still fails before provider I/O. Repeat the
  legacy-pair case through durable coordinator/compiler/assembler and cold restart.

## Impact and risk evidence

- `ContextCompiler._current_native_tool_batch`: LOW; direct callers are
  `_neutral_context` and `_assemble`, within the context compile flow.
- `_native_tool_call_messages`: LOW; used only by the current native batch path.
- `JournalContextRequestFactory`: LOW at the class symbol; 26 import/dependency impacts.
- `project_canonical_journal_messages`: LOW; six graph impacts in the compile flow.
- `ProviderContextAssembler._rehydrate`: **HIGH**; reaches
  `build_model_turn_request`, `fetch_model_turn`, and `KernelLoop.step_once`. The plan
  intentionally leaves its production semantics unchanged and treats it as a regression
  boundary.
- `ContextCompileRequest`: **HIGH**; 67 graph impacts. The plan intentionally avoids a
  schema edit by using a private coordinator/compiler seam.
- GitNexus indexing reported capped-call/truncation warnings. Before editing each
  additional symbol, rerun impact in the exact ticket clone. Treat UNKNOWN as unresolved
  and corroborate it with text search. Warn before any HIGH/CRITICAL edit.

## Worker suitability

Assessment: **partially suitable for a lower-cost model after Checkpoint 1**.

The private durable projection, artifact verification, atomic call-group matching, and
final cross-boundary judgment require the stronger model. Once Checkpoint 1 fixes the
contract and the first provider-neutral red/green integration test, a lower-cost worker
may add mechanical provider fixtures and matrix coverage without changing contracts.
No worker has been dispatched.

## Phase 0 — Freeze the reproduction and evidence

Permitted edits: tests, fixtures, and ticket evidence only.

1. Verify both workspaces, branches, bases, and clean status. Do not use the original
   checkouts or the user's running profile.
2. Preserve deterministic provider-shaped SDK fixtures in the Unchain tests. Original
   production frames are not available in this workspace; these are constructed
   reproductions, not captured incident bytes. Keep that provenance explicit. Use
   mixed text/tool Anthropic and Hyperspace responses and signed Gemini parts to
   reproduce the strict replay error; retain unsigned Gemini text-loss coverage too.
3. Add one compiler→assembler integration test per failing provider and an OpenAI
   control. Each affected-provider test must fail before production edits with the exact
   ambiguous-mutation error and prove that restoring the complete semantic message
   passes the unchanged assembler.
4. Add negative controls for changed text, tool ID/name/arguments/order, replay format,
   artifact digest, and foreign attempt/provider subject.
5. Record red output and fixture provenance in `.release-qa/ticket-390/`. Keep the
   baseline-compatible harness in
   `tests/context_v2/fixtures/ticket_390/reproduce_native_replay.py` so the evidence
   can be regenerated after deleting the temporary baseline checkout.
6. Run GitNexus impact for every existing symbol selected for Phase 1.

Stop if the deterministic opaque-replay shapes cannot reproduce the exact error on
the pinned base, or if the evidence requires real credentials. This source-level
equivalent proof does not replace the later exact-artifact live acceptance.

## Phase 1 — Verified current-turn projection

1. Add a private frozen projection type containing the verified provider subject,
   journal cursor, result digest, complete semantic assistant messages, normalized tool
   calls, and replay-frame identity needed by the compiler.
   Equivalent binding in the implementation: the coordinator verifies all ordered
   typed tool calls and native semantic calls against the canonical journal batch,
   then carries the complete assistant messages and ordered call IDs. The compiler
   builds typed calls and tool results again from that same batch; no second unbound
   list of call arguments crosses the seam.
2. In the coordinator's stable snapshot preparation, locate the unique same-attempt
   `provider.turn_result` that precedes and exactly owns the current completed tool-call
   batch.
3. Read its whole artifact through the bounded artifact service; validate the event,
   artifact, canonical envelope, scope, digests, route, call identity, order, and result
   completeness. Fail closed on zero, multiple, overflowed, or inconsistent matches.
   Count both wire and result receipts across the entire same-turn stable snapshot
   before enforcing that the unique wire precedes its result and the unique result
   precedes its tool calls. Later duplicate receipts must not be filtered away.
4. Carry the private projection through `_PreparedJournalView` and `_compile_pass` to
   `_compile_for_coordinator`. Keep `ContextCompileRequest` unchanged.
5. Make `_current_native_tool_batch` use the verified complete semantic assistant
   messages for the call side and canonical tool-result events for the result side.
6. Keep the direct compiler fallback only for non-durable/unit callers with no private
   evidence. Durable replay-required paths may not fall back silently.
7. Make the Phase 0 integration tests green without changing `_rehydrate` equality.

### Checkpoint 1 — Contract and minimal repair review

Stop for advanced-model review. Provide:

- exact diff and changed symbols;
- GitNexus impact for every edited existing symbol;
- red-before/green-after compiler→assembler evidence;
- proof that public request schemas and persisted bytes are unchanged;
- negative mutation and artifact-integrity results;
- both workspace statuses and all deviations from D-390-01 through D-390-05.

Do not proceed if `_rehydrate` was weakened, if the public compile request changed, or if
the compiler accepts an unverified provider result.

### CP1 repair evidence — 2026-10-01

- Retained harness/fixture provenance: Unchain
  `tests/context_v2/fixtures/ticket_390/README.md` and `reproduce_native_replay.py`.
- `.release-qa/ticket-390/baseline-matrix.json`: pinned Unchain base
  `da5d55b8bf50a51bd81974ada99ba8a888f969d5`; Anthropic single-call,
  Hyperspace single/four-call and signed Gemini all reproduce the exact
  ambiguous-mutation error. OpenAI control succeeds.
- `.release-qa/ticket-390/candidate-matrix.json`: the same affected scenario
  definitions all succeed with the candidate; OpenAI control succeeds.
- New durable negative tests cover late result duplication, foreign subject,
  route/provider mismatch, changed text/call identity/name/arguments/order,
  visibility mismatch and wrong envelope version. The replay-format negative
  exercises the active replay frame at the unchanged assembler boundary.
- Late-result repair red/green outputs are saved alongside the matrix. Every
  boundary negative asserts no second provider request, and injected mutations
  must complete rather than being swallowed as a failed tool.
- These are source-level CP1 records. No wheel build, deployed artifact pair,
  sidecar restart or live-provider acceptance is claimed.

## Phase 2 — Durable lifecycle and provider matrix

1. Cover single-call and parallel-call groups for Anthropic, Gemini, and
   DeepSeek/Hyperspace, including sibling text before and after calls where supported.
2. Verify token accounting includes preserved visible text exactly once and that the
   atomic exchange cannot be split by reduction/checkpointing.
3. Exercise cold restart against the same durable profile and prove that no in-memory
   cache is required to reconstruct the turn.
4. Exercise retry/duplicate receipts, conflicting receipts, stale iteration, foreign
   attempt, partial tool results, reordered results, and cancelled/failed attempts.
5. Exercise same-chat provider switches in both directions and confirm historical native
   material is projected once without leaking source-provider wire fields.
6. Run targeted context/compiler/provider tests and the complete Unchain suite.

### Phase 2 local evidence — 2026-10-02

- **Fail-closed result integrity:** a real SQLite-backed runtime now rejects duplicate,
  partially stale, and uniformly stale current tool results before the second provider
  request. The coordinator reports a stable incomplete/conflicting native-batch error
  instead of silently falling back to neutral context and dropping sibling text.
- **Cold restart:** separate Python processes seed and resume file-backed native turns
  for Anthropic, Gemini, and Hyperspace. The resumed provider request preserves visible
  text, call identity, arguments, and replay signature. A second user turn in the same
  chat also completes without leaking the earlier native call.
- **Retry and terminal state:** all three affected providers complete a 429 retry of the
  exact same second request, recording retry ordinals 0 and 1 while executing the tool
  once. For each provider, both failed and cancelled root-attempt terminal events after
  the tool result prevent another provider request.
- **Durable checkpoint under pressure:** integration coverage uses the real SQLite
  checkpoint/build repositories, creates an actual committed checkpoint from prior chat
  history, then confirms the next provider request retains text on both sides of two
  parallel calls and their exact ordered results. The whole second request contains
  each sibling text once; its real compiled context and committed build agree on the
  token estimate, and that build references the checkpoint. A separate over-budget
  case stops before the second provider send.
- **Provider switching:** both directions involving OpenAI are covered for each affected
  provider: Anthropic ↔ OpenAI, Hyperspace ↔ OpenAI, and Gemini ↔ OpenAI. Target requests
  retain the prior answer once and contain no source-provider native wire items or
  signature fields.
- **Verification:** 108 targeted Unchain tests and 40 PuPu sidecar adapter/factory
  tests pass. Full Unchain after the nine new lifecycle cases: 3,958 passed,
  16 skipped, 5 xfailed, 4 failed in 102.09s. The four failures are the previously
  baseline-reproduced OpenAI SDK Literal incompatibilities for `none`/`xhigh` on
  `gpt-6-sol`/`gpt-6-luna`. Complete output:
  `.release-qa/ticket-390/phase2-full-unchain.log`. Both workspace diffs pass
  `git diff --check`.
- **Graph review:** refreshed, nonpartial compare-to-pinned-base analysis reports high
  risk across 6 Unchain compile flows and low risk with no affected processes in PuPu.
  The Unchain impact is the shared compiler/coordinator path changed by this ticket and
  requires explicit checkpoint review.

### Checkpoint 2 — State, restart, and compatibility review

Stop for advanced-model review. Provide:

- the provider/sequence matrix with PASS, FAIL, or NOT_RUN plus reason;
- cold-restart evidence from a fresh process;
- token/atomicity evidence;
- negative fail-closed results;
- complete Unchain test results;
- nonpartial GitNexus `detect-changes --scope all` output and any HIGH/CRITICAL paths.

Do not proceed with an unexplained provider-specific exception, in-memory-only success,
or any mutation of historical durable records.

### Checkpoint 2 independent re-review — 2026-10-02

- **Verdict: PASS for Phase 2 source-level acceptance.** Both findings from the previous
  review are resolved: the three affected-provider retry and failed/cancelled cells run
  through the actual durable coordinator/compiler/assembler, and the SQLite pressure
  test checks whole-request text uniqueness plus the current build's token estimate.
- Independently reran the 108 CP2 tests plus 33 related provider-turn execution-service
  regressions: **141 passed in 24.74s**. Independently reran the two PuPu
  adapter/factory files against the ticket runtime source: **40 passed in 7.97s**.
- Inspected the retained full Unchain log: **3,958 passed, 16 skipped, 5 xfailed,
  4 failed**. These remain the previously baseline-reproduced SDK Literal failures;
  this re-review does not claim a new full-suite run or an entirely green full suite.
- Both diffs pass `git diff --check`. Nonpartial `detect-changes --scope all` reports
  **HIGH**, six affected Unchain compile flows, and **LOW**, zero affected PuPu flows.
  The shared compiler/coordinator paths were reviewed. The graph summary covers tracked
  diffs; new untracked test files were inspected and exercised separately.
- The result authorizes the planned next checkpoint, not release acceptance. Exact-wheel
  import proof, sidecar restart, and real-provider evidence remain Phase 3 work.

## Phase 3 — Exact PuPu artifact and real multi-model acceptance

1. Build one exact Unchain wheel from the reviewed Unchain commit and record commit SHA,
   wheel filename, wheel SHA-256, manifest digest, and advertised features.
2. Install that exact wheel into the isolated PuPu ticket runtime, restart its sidecar,
   and prove the imported runtime points to the ticket artifact rather than another
   checkout or cached wheel.
3. Run PuPu sidecar contract tests, replay-wire tests, chat streaming tests, and the full
   relevant PuPu suite. If a manifest feature changed, run old/missing/wrong-digest
   admission negatives before provider I/O.
4. Using the user's existing configured profile and credentials, run real tool
   continuation on Claude Opus 5.5, Gemini 3.7 Flash, DeepSeek V4 Pro, and OpenAI GPT-5.3
   Codex. Record time to first tool call, tool completion, second request, final answer,
   and exact errors without exposing secrets.
5. In the same chats, switch models after a completed tool turn and verify a second user
   message. Stop/cancel must preserve the behavior owned by #389; #390 must not duplicate
   or replace that settlement logic.

### Phase 3 local artifact evidence — 2026-10-02

- Built one wheel from the reviewed ticket source tree and installed that same wheel under
  `.release-qa/ticket-390/artifacts/installed-runtime` in the isolated Unchain clone.
  Since ticket workflow has not authorized commits yet, source identity is bound to the
  pinned base plus the production diff and complete Unchain source-tree digests in
  `.release-qa/ticket-390/artifacts/identity.json`.
- Wheel: `unchain-0.2.0-py3-none-any.whl`, SHA-256
  `ace78828c08152b48d34ad3110b76310534ff64880edcb5f4df9e6606e54862b`.
  The PuPu-side Python import probe resolves `unchain` and
  `unchain.runtime.runtime_protocol` inside that installed wheel tree. Runtime manifest
  digest: `sha256:a4448f85fc219f8535a6dafca8cfe1f8ba7963a3219ef1a0f00f8f14e30079be`,
  schema `unchain.runtime_protocol_manifest.v1`, protocols `context_memory`,
  `durable_interaction`, `provider_turn_ownership`, `run_bundle`, and `skills`.
- Ran the PuPu adapter/factory, runtime-protocol, chat-stream admission, chat-streaming,
  active-stream, and replay-wire suites with the wheel install first on `PYTHONPATH`:
  **112 passed, 1 serializer warning, 6 subtests passed**. The warning is from the
  existing malformed-signature test case. The changed runtime manifest advertises no
  new feature, so the conditional old/missing/wrong-digest feature admission matrix is
  not applicable to this wheel.
- **Live-provider portion remains pending.** The user's existing PuPu profile and its
  Memory V2 database are currently held by a running PuPu instance from another clone.
  Replacing that running sidecar with this candidate requires stopping/switching that
  instance and will interrupt its current session. No profile, settings, credentials, or
  active sidecar was changed during this artifact check. Resume the real-provider matrix
  only after coordinating a safe switch to the ticket clone on that same profile.

### Checkpoint 3 — Release acceptance review

Stop for final advanced-model review. Provide:

- exact Unchain/PuPu commit and artifact identities;
- full automated results and any baseline-only failures;
- real-provider and same-chat switching matrix;
- screenshots/log extracts with secrets removed;
- final nonpartial graph change analysis for both repositories;
- remaining risks and rollback path.

No commit, push, PR, merge, ticket close, or active rollout is authorized by this plan.
Those actions require the user's later instruction under the ticket workflow.

### Gemini HTTP 503 remediation evidence — 2026-10-02

- Only an authentic Google `APIError(503)` whose attached HTTPX response itself has
  status 503 is classified as a retry-safe pre-stream rejection. An HTTP 200 SSE
  error, missing/mismatched response, or uncertain disconnect is never replayed.
- The durable runtime saves a content-free HTTP 503 diagnostic, caps this specific
  overload path at two retries (three physical sends), and uses the existing capped
  exponential backoff, jitter, and `Retry-After` handling. A cold reopen after a
  saved failure retries the frozen request; a reopen after completion neither sends
  nor waits. Exhaustion returns an actionable provider-busy message instead of an
  opaque uncertain code. A committed 503 also emits a content-free retry-progress
  event before backoff; v4 projects it to a bounded Gemini timeline row. Rejected
  progress events are redacted in bridge diagnostics, so malformed input cannot
  echo provider content through the completion envelope.
- Focused Unchain suites: **85 passed** before the final recovery-delay fix;
  **60 passed** in the transport/runtime/service subset after that fix. The
  final 503 classification and integration subset is **20 passed**, including
  an untrusted numeric status and a disconnected stream. The full
  Unchain source suite before the final narrow fix: **3,963 passed, 16 skipped,
  5 xfailed, 4 failed**. The same four OpenAI SDK `reasoning.effort` Literal failures
  reproduced against untouched `da5d55b` in the same interpreter.
- Final wheel: `unchain-0.2.0-py3-none-any.whl`, SHA-256
  `7dcaec28395672776e62236c20af97421e39aef78f7e6f9b85636acc9ebc3e9f`,
  installed under `.release-qa/ticket-390/gemini-503-final/installed-runtime`.
  The imported manifest digest remains
  `sha256:a4448f85fc219f8535a6dafca8cfe1f8ba7963a3219ef1a0f00f8f14e30079be`;
  no advertised protocol feature changed. PuPu full sidecar suite against that
  installed wheel: **2,652 passed, 17 skipped, 1 existing serializer warning,
  3,597 subtests passed**.
- The captured failed Gemini request and its 81-schema catalog were replayed
  offline through the final installed wheel, actual Google SDK, and SQLite store.
  The first HTTP 503 was durably recorded, the retry sent identical request bytes,
  and the successful result was cold-recovered without another send or delay.
  Input artifact SHA-256:
  `f3eb87aec4461fa306547410ba64b476d441c7abd433d822609d6670e7a53850`.
- The same existing-profile PuPu desktop instance was restarted with the final
  installed wheel, retaining its configured provider credentials and chat data.
  A real `gemini-3.6-flash` run completed `web_fetch` and paged
  `context_content_read` tool calls, then produced the final answer with
  `Conversation ready`. This run did not receive a live HTTP 503, so overload
  recovery is established by the exact-wire SDK test rather than a fresh remote
  overload observation. Other provider/model-switch cells remain Phase 3 work.

### Gemini retry-progress final artifact — 2026-10-02

- After the prior candidate, the v4 route was found to drop the new retry-progress
  event. The Unchain normalizer now emits an existing `step.delta` with a closed
  content-free payload; PuPu's activity tree validates the same bounds and creates
  the timeline frame. The renderer accepts only those fields plus its generated
  event ID. A malformed, content-bearing event is rejected and redacted from bridge
  diagnostics.
- Final progress wheel SHA-256:
  `62d48129fd5db524efbb9534aa34f63b79791e793fe8c10f598828b6b51f7889`,
  installed under `.release-qa/ticket-390/gemini-503-progress-final2/installed-runtime`.
  Its 333 Python source files match the reviewed source tree byte-for-byte; the
  runtime manifest digest remains
  `sha256:a4448f85fc219f8535a6dafca8cfe1f8ba7963a3219ef1a0f00f8f14e30079be`.
- Unchain full suite on final source: **3,968 passed, 16 skipped, 5 xfailed,
  4 failed**. The four
  failures are the same existing OpenAI SDK `reasoning.effort` Literal mismatch
  reproduced on the untouched base. Focused normalizer/bridge/Gemini retry suite:
  **26 passed**. PuPu activity-tree and timeline suites: **71 passed**. The v4
  sidecar test confirms a safe `step.delta` appears and an injected provider body
  appears nowhere in the SSE response. The durable-sink check added afterward
  confirms `provider_retry` is never projected or appended to the journal;
  the focused sink/normalizer/bridge/Gemini suite passes **45 tests**. The final
  installed wheel passed the full PuPu sidecar suite: **2,653 passed, 17 skipped,
  1 existing serializer warning, 3,597 subtests passed**.
- The saved 81-schema Gemini wire, real Google SDK, and SQLite were replayed through
  this installed wheel: first send received HTTP 503, second sent identical bytes
  and succeeded; lease history is `started, failed, started, completed`. Cold
  recovery produced no extra send. The existing-profile desktop was restarted
  with this exact wheel and a real `gemini-3.6-flash` final-runtime check in the
  prior ticket test chat completed with `READY` (attempt
  `unchain-1790972487254-45d36e06cd59d`). No new remote HTTP 503 was observed.

## Acceptance criteria

- **AC-390-01:** The recorded Anthropic, Gemini, and DeepSeek/Hyperspace shapes fail on
  the pinned baseline and pass after the repair through the real
  coordinator→compiler→assembler path.
- **AC-390-02:** Complete semantic assistant text and every tool call survive in original
  order, appear exactly once, are included in token accounting, and pair with the exact
  canonical tool results.
- **AC-390-03:** Opaque reasoning/signatures come only from the verified replay frame;
  compiler semantic messages contain no copied wire-only fields.
- **AC-390-04:** Changed text, tool identity, arguments, order, provider scope, artifact
  bytes/digest, route, replay format, or duplicate receipt still fails before provider
  I/O with a stable diagnostic.
- **AC-390-05:** Single, parallel, retry, restart, second-message, and same-chat
  model-switch sequences pass for every applicable provider; OpenAI remains green.
- **AC-390-06:** The full Unchain suite and PuPu sidecar/replay suites pass, with any
  unrelated baseline failure reproduced on the untouched base and documented.
- **AC-390-07:** Final live evidence uses one recorded exact Unchain wheel/runtime
  artifact in the isolated PuPu clone and the user's existing configured profile; no new
  credentials are requested.

## Gemini response outcomes repair — 2026-10-02

Scope: preserve explicit provider completion/failure, reject incomplete streams,
protect the primary outcome from cleanup faults, and retain content-free Gemini
HTTP status codes. Model availability (2.5 Pro HTTP 404) is not repaired by
retrying or changing credentials. Endpoint pinning and trace status projection
are separate findings and are not part of this repair.

- **BC-390-08:** Producer is pinned google-genai streaming responses; consumer is
  GeminiModelIO → exact transport → durable request lease → PuPu error projection.
  STOP/MAX_TOKENS must be observed before successful persistence. Known blocked
  or malformed outcomes are terminal; unknown finish reasons, truncated SSE,
  parser/network interruption remain uncertain and never resend automatically.
  Diagnostics are CLOSED: existing HTTP diagnostic v1 remains unchanged; response
  diagnostic v2 has exactly schema/http_status/provider_code/parameter, with null
  HTTP status, a closed response reason and empty parameter. No prompt, body,
  finishMessage, signature or arbitrary property name enters diagnostics.
  Runtime advertises provider_response_outcomes_v1; PuPu requires it before
  active use. Unknown schema, extra keys, wrong status/code combinations fail.
- **BC-390-09:** SDK cleanup is resource housekeeping, not provider completion.
  Both resources are attempted; ordinary cleanup exceptions are recorded only as
  content-free warning categories and do not replace success, cancellation or the
  original HTTP/stream failure. Exact artifact evidence must use one built wheel
  SHA and imported manifest digest with this PuPu candidate.
- **SEQ-390-08:** identity = attempt/iteration/envelope/route/retry ordinal. Fresh
  send starts a lease; known response failure seals FAILED/non_retryable with v2
  diagnostic; successful terminal response seals COMPLETED with result receipt;
  incomplete response stays STARTED/uncertain. Reopening the SQLite store must
  reproduce each disposition with zero additional sends. HTTP 503/429 retry
  remains bounded, frozen and cold-recoverable. Model/tool continuation preserves
  native parts/signatures. Applies to normal, graph and subagent through their
  common provider execution service; host error normalization is verified too.
- **AC-390-G01:** Real SDK + HTTPX + SQLite tests fail before repair for known
  SAFETY/MALFORMED_FUNCTION_CALL, prompt block, empty STOP, missing/unspecified
  finish, thought-only STOP, and success/HTTP-failure cleanup faults.
- **AC-390-G02:** Unknown reason/network/SSE failure never yields complete replay,
  result receipt, visible output or automatic resend. No diagnostic contains the
  injected private content. Strict v1/v2 roundtrip and malformed rejection pass.
- **AC-390-G03:** Same wheel passes SDK signed tool continuation, actual SQLite
  reopen, HTTP 503/429 regression, runtime feature admission and PuPu projection;
  applicable full suites are recorded. Packaged/frozen-sidecar smoke remains
  required before release qualification. Old feature manifests
  are rejected before active writes. Live checks use the existing profile/key.

Acceptance: AC-390-G01/G02 PASS, and AC-390-G03 runtime/host checks pass on the pair recorded in
`ticket-390-gemini-response-outcomes-acceptance.md`. The full Unchain suite
retains four independently reproduced baseline OpenAI sampling-contract failures;
these are not represented as passing. No packaged/frozen-sidecar smoke is recorded;
that part of G03 remains outstanding on the reconciled delivery pair.

## Uncertain request diagnostics — 2026-10-02

- **BC-390-10:** Provider SDK/adapter exceptions produce a CLOSED
  `unchain.provider_uncertainty_diagnostic.v1` record with exactly schema,
  reason, phase, http_status and provider_code. Reason/phase are fixed enums;
  status is null or an exact 400–599 integer; HTTP 200 is allowed only
  for provider_stream_error. Provider code uses the existing closed vocabulary;
  a stream error may retain a known provider code when its HTTP status is absent.
  Inner SDK error codes never replace the actual enclosing HTTP status. Never retain exception text,
  response body, URL, prompt, signature, dynamic class name or traceback.
  Gemini observes request preparation, send, stream reading and response
  processing separately. Typed known failures are classified; arbitrary errors
  remain local_processing_error rather than guessed network failures.
  Unmarked completion/receipt callback failures before result persistence are
  observed at result_processing, with no raw exception chain. Explicit cancel
  and marked durable-boundary failures retain their authoritative disposition.
- **BC-390-11:** Diagnostics cross SQLite → cold recovery → host HTTP/SSE → UI
  through a new lease v4 `uncertainty_diagnostic` field, permitted only on STARTED
  records. Existing lease v1/v2/v3 reader behavior and serialized bytes stay
  unchanged. Host preserves stable error code and safe detailed message; unknown
  original outcomes state that their cause was not recorded. Required runtime
  feature `provider_uncertainty_diagnostics_v1` binds producer and consumer.
- **SEQ-390-09:** Exact request subject and route identify one send. An observed
  nonterminal failure records STARTED → STARTED via revisioned CAS, retryable
  false and no result binding. Reopen reproduces the same reason with zero sends.
  Concurrent ownership/persistence failure cannot manufacture a terminal result.
  Genuine rejected HTTP responses retain existing terminal/retry behavior;
  errors inside HTTP 200 streaming responses remain uncertain. No change to
  retry budgets or graph/tool execution behavior.
  Ordinary pre-persistence completion callback failure stays STARTED with a safe
  diagnostic. Controlled accounting subject/start/ledger/receipt violations are
  marked durable boundaries and cannot be swallowed as observer failures.
  Completed cold replay does not invoke live completion callbacks.
- **AC-390-U01:** Real SDK/HTTPX/SQLite tests distinguish absent finish, JSON/SSE
  parse failure, timeout, disconnect, malformed native tool call, unsupported
  finish and stream API errors. Unknown private exceptions produce static text.
  All cases preserve no-result/no-resend behavior and cold reason recovery.
- **AC-390-U02:** v4 exact field/enum/state validation rejects unknown keys,
  invented codes, wrong versions, diagnostic on terminal state or retryable
  STARTED state; v2/v3 roundtrips remain byte compatible. Logging/diagnostic
  persistence failure cannot hide the observed primary failure or allow resend.
  Public Gemini content validation remains pre-send ValueError; actual SDK HTTP
  429 rejection remains bounded retry. Base receipt-factory failure still fails
  the request and cannot become partial composition or a successful result;
  the public diagnostic excludes its arbitrary exception text.
- **AC-390-U03:** Host normalization retains code, detailed safe message and
  cancellation handling; actual imported feature admission passes and old
  manifests fail. Verify same once-built wheel + PuPu candidate, full applicable
  regressions and existing-profile readiness. Existing user runs are not stopped
  for a diagnostic rollout; do not claim Google live failure root cause from a
  synthetic transport fixture. Normal/graph/subagent share the modified runtime;
  their relevant existing integration suites remain part of regression.

Acceptance: U01/U02 PASS on the once-built final wheel recorded in
`ticket-390-uncertainty-diagnostics-acceptance.md`. U03 imported-runtime admission, strict
host SSE and full regressions complete, retaining the four independently
reproduced baseline OpenAI sampling failures. At the owner's restart request, the
final candidate was launched on the existing profile; actual imported manifest,
Memory V2 all-mode readiness and profile identity are verified in
`live-instance-readiness.json` beside the final wheel. The owner reported real-device
model/tool acceptance satisfactory on 2026-10-02 at 20:22. The supplied console
warnings were diagnosed separately as bounded chat-journal fallback and telemetry
severity mapping; see the acceptance report. No exhaustive live Google reliability
or original-cause claim is made.


## Delivery integration hold — 2026-10-02

The owner explicitly requested push and PR creation. This authorizes delivery
commits in the two ticket clones; it does not request merging or closing #390.
The accepted candidate is preserved for review and both PRs are Draft.

Fetched PuPu dev is `0047d58d`, containing #386 via PuPu PR #392. Its release
workflow pins Unchain `1ec49ddfc28d3b42ba035debada5e3db759dad1b`, the head of
[Unchain PR #46](https://github.com/haoxiang-xu/unchain/pull/46). PR #46 is still
open, and Unchain dev remains `da5d55b8bf50a51bd81974ada99ba8a888f969d5`. Neither
that producer nor the new PuPu consumer was part of the accepted #390 pair.

The parallel implementations must be reconciled before merging/rollout:

- #386 uses `unchain.provider_failure_diagnostic.v2` for HTTP diagnostics with
  provider status/replacement model; #390 uses the same name for explicit
  response outcomes with no HTTP status. Their closed fields differ.
- #386 uses `unchain.provider_request_lease.v4` for FAILED leases carrying its
  extended diagnostic; #390 uses the same name for STARTED uncertainty
  observations. Their shapes and transition rules differ.
- #386 retry events use failed/next/max attempt and remaining wait fields; #390
  retry events use retry ordinal/max retries/delay. The new dev renderer cannot
  consume the old shape without an explicit integration decision.
- The new PuPu dev QA pin lacks the two new #390 runtime capabilities. It must
  select the reconciled producer revision before testing active admission.

BC-390-03 and BC-390-06 remain the integration gates: preserve readable records
from both implementations with unambiguous versioned shapes, unify the retry
producer/consumer, select one immutable runtime build, then repeat exact-wheel
PuPu admission, persistence/cold-recovery, host SSE and affected UI regression
tests on the integrated pair. Do not reuse the pre-integration owner acceptance
or weaken the runtime capability check to declare that pair accepted.

No production integration change, original checkout edit, live-instance stop,
profile migration, issue closure, or merge is part of this delivery.

## PR #48 SDK compatibility follow-up — 2026-10-02

The first CI run installed Anthropic 1.11.0 from the existing open dependency
range. Two actual SDK tests failed at client construction: this SDK uses
`httpx2`, while their mock transports used `httpx`. Reproducing that environment
also exposed the production timeout type mismatch and the SDK's newly populated
`toolset_name: null` response default. The earlier 0.83.0 wheel acceptance did
not test the 1.11.0 SDK. No SDK is downgraded or test skipped to make CI pass.

- **BC-390-12:** Anthropic/Hyperspace adapter configuration crosses the public
  Anthropic SDK client boundary. Convert the existing timeout values into the
  installed SDK's exported `Timeout` type, preserving connect=10, write=30,
  pool=10 and read=120 (Anthropic) / 600 (Hyperspace). Injected clients without
  the optional SDK retain their existing configuration. The real-SDK mock
  transport follows the installed SDK client's actual HTTP library, including
  when both HTTP packages are installed. No retry budget or wire message schema
  changes. Admission remains CLOSED for provider messages and VERSIONED for
  the imported runtime manifest; SDK version is telemetry, not a capability
  admission whitelist.
- **BC-390-13:** SDK response blocks become canonical semantic messages and
  native replay frames. Before that fan-out, remove only known null defaults
  `caller` and `toolset_name` from `tool_use`; retain non-null metadata and all
  unknown fields so the existing CLOSED outbound validator can reject them.
  Native signatures, arguments, call IDs and block order remain authoritative.
  No persisted frame migration is included. Frames already captured with
  SDK 1.11.0 and `toolset_name: null` are not covered by historical replay
  compatibility; the accepted live instance remains on SDK 0.83.0.
- **SEQ-390-10:** Real SDK SSE response → signed semantic/replay fan-out → two
  parallel tool effects → next model request → final response. Verify the
  SDK-filled null field does not pollute the next request and an unsupported
  non-null toolset is rejected before that next send. Existing cold checkpoint,
  exact durable route and mutated-signature/identity regressions remain required.
  No new persisted-state transition, automatic resend or profile migration is
  introduced; broader restart/interaction behavior remains covered by the
  unchanged #390 matrix. This follow-up does not reconcile the #386 hold.
- **AC-390-S01:** Preserve RED evidence for the two CI failures, production
  timeout rejection and null-default continuation rejection. Run the same
  real-SDK wire tests on 0.83.0 and 1.11.0, including both family providers,
  exact timeout values and strict negative metadata tests.
- **AC-390-S02:** Build one new wheel and reuse it for the full latest-SDK
  Unchain regression and the PuPu candidate's full sidecar regression. Verify
  all packaged source files against that installed wheel and record its SHA-256
  and actual imported manifest digest. Results are separate from the earlier
  r2 artifact acceptance; do not claim the old wheel matches the new source.
  Package/frozen-sidecar smoke and active rollout stay outstanding under the
  existing integration hold. Do not restart the owner's accepted live instance.

Evidence and final results: `ticket-390-ci-sdk-compatibility.md`.

## PR #395 source conflict resolution — 2026-10-02

Merge PuPu dev `0047d58d0369d5c245a3fd8021d4d97c3e3f9a35` into the existing
delivery branch. Preserve both tickets' host diagnostic tests. The text conflict
is in `test_provider_terminal_diagnostic.py`; the automatically merged retry
projector and renderer also shadow each other's handlers and need manual fixes.

- **BC-390-14:** #386 and #390 V4 `step.delta kind=provider_retry` producers feed
  the activity-tree projection, saved trace and timeline. They remain two
  explicit formats: #390 carries `retry_ordinal/max_retries` with its original
  CLOSED keys and Gemini 503/budget/scope checks; #386 carries
  `attempt_failed/next_attempt/max_attempts/remaining_ms` and retains its
  existing validated projection (unrelated input extensions are ignored,
  never copied to the frame). A payload carrying either legacy discriminator
  must pass the #390 validator, never fall back to #386. Do not infer a retry
  budget or transform a legacy record into the other format. Only #386-shaped
  frames enter grouped waits; invalid or legacy frames break grouping and
  cannot create an invisible waiting state. Preserve legacy rows and #386's
  grouped countdown, Stop and settled records. This consumer-only compatibility
  does not resolve the producers' durable schema/version collisions.
- **SEQ-390-11:** Reduce and render each format alone, adjacent mixed records,
  rejected legacy/hybrid records and #386 heartbeats. Grouped records retain
  waiting/completed/failed/cancelled behavior and Stop routing. Saved frames
  retain their format and scope; there is no backend resend, lease write or
  profile migration. Cross-format grouping must not combine unrelated waits.
- **AC-390-M01:** Preserve RED evidence for the automatic merge, then verify
  both projector/timeline suites plus mixed/hybrid/no-hidden-header regressions,
  heartbeat deduplication, countdown/Stop, saved retry traces and runner/Stop
  routing. Check no conflict markers or unresolved index entries remain.
- **AC-390-M02:** Run host diagnostic/admission checks using the once-built
  `95d9a731…` Unchain #48 wheel and record all #386 producer/API incompatibility
  failures rather than skipping tests, weakening assertions or the required
  capabilities. Keep both PRs Draft and the exact combined-artifact rollout
  `INCOMPLETE` until #46/#48 reconciliation and package smoke are qualified.

Source mergeability is separate from runtime/release qualification. Results are
recorded in `ticket-390-pr395-conflict-resolution.md`; earlier pair acceptance
is not transferred to this merged source.

# PR #395 CI runtime reconciliation — 2026-10-02

Run 37097837391 used Unchain #46 (`1ec49ddfc28d3b42ba035debada5e3db759dad1b`), which lacks #390's provider-result reader and uncertainty capability. Frontend (5,086) and Electron (658) passed; sidecar reported 264 failures and 13 fixture errors. Updating the pin alone to #48 is insufficient: the merged host also requires #386's retry wait and extended failure diagnostics.

1. Merge #46 into the isolated #390 runtime branch; retain both producers' tests.
2. Reconcile closed diagnostic and lease contracts. Preserve exact historical serialized bytes and SHA-256 for both existing v2 diagnostic and v4 lease shapes; reject hybrids. Resolve the historical schema identifiers by their exact closed key sets, HTTP/null type and lease status; do not migrate or renumber persisted values. This is a compatibility repair, not a new writer format.
3. Retain #386's interruptible retry countdown, while preserving #390's durable send fencing, bounded Gemini retry, explicit response outcomes, sanitized uncertainty categories and native continuation integrity. Emit one retry representation per kernel wait.
4. Build the reconciled runtime once, install that exact wheel into isolated test environments, and run both complete suites plus host artifact/contract smoke. Update every applicable QA pin to the committed runtime revision only after the pair passes.
5. Run complete graph change analysis before delivery commits, push both PRs, and verify the new CI runs. Keep Draft until the deployed pair is verified; no merge or ticket closure is authorized by this repair.

**BC-390-15 — reconciled runtime → host:** VERSIONED. Producer is the actual imported Unchain wheel; consumers are PuPu context factory, strict failure normalizer and retry SSE projector. Manifest capabilities continue to gate admission; the immutable Git revision identifies the built artifact only. Unknown fields and crossed schema/status combinations fail closed. Each historical variant has a strict discriminator (schema + exact key set + HTTP/null type + lease status); forms round-trip without hash changes, and mixed variants fail closed. AC-CI-01: both original diagnostic/lease forms restore unchanged; unknown/hybrid forms are rejected. AC-CI-02: real kernel wait produces one start plus heartbeat events, cancellation sends no subsequent request, and provider/body secrets never enter UI or durable diagnostic bytes.

**SEQ-390-13 — persistence/retry/restart:** identity is exact attempt + iteration + envelope + route + retry ordinal. Start → retry-safe failure → interruptible wait → next send or cancellation; completed native results replay after restart without reexecution. Historical uncertain STARTED records remain uncertain and are never resent. Historical retryable 503 records from #386 cannot authorize a fresh send beyond #390's cap, while already recorded results remain recoverable. Maps BC-390-15 to AC-CI-01/02 and existing #390 lifecycle/cold-resume tests. Normal/graph/subagent paths use the same bound runtime; full sidecar and kernel suites cover these paths.

**AC-CI-03 — exact artifact pair:** record one wheel SHA-256 and runtime manifest digest; use it for full Unchain tests, full PuPu sidecar tests and deployed artifact smoke. Frontend retry projection regression remains covered. Missing required features must still be refused, rather than bypassed to make CI pass.

**BC-390-16 — verified installed artifact → deterministic test bootstrap:** CLOSED. Producer is the `unchain` module imported immediately after the immutable wheel's installed-byte verification; representation is its resolved package-parent directory, exported as `UNCHAIN_SOURCE_PATH` through `GITHUB_ENV`. Consumers are the sidecar test bootstrap and adapter's existing explicit-path loader. Binding occurs after verification and before the Python, Context V2 and RunBundle tests; it prevents an available sibling checkout from shadowing the installed artifact. This path selects test bytes only; it does not decide runtime capability/admission, which still requires the strict imported protocol manifest. A missing module or failed artifact verification stops the producer step. No normal app/profile loader changes are made. AC-CI-04: tests and contract gates import the verified wheel even when sibling source exists; workflow regression verifies ordering and package-derived binding, and complete installed-wheel suites prove the consumer path. The first local contract attempt without this explicit binding failed collection against stale sibling source; the identical wheel passed after binding. Persisted chat-state sequence is N/A for this CI environment binding; retry/restart behavior remains covered by SEQ-390-13.

**AC-CI-05 — independent Electron/artifact capability consumers:** complete the existing BC-390-03/15 admission contract in `memory_v2_rollout.js` and `unchain-artifact.mjs`: both must require `provider_response_outcomes_v1` and `provider_uncertainty_diagnostics_v1`, matching the Python host and checked-in Windows contract. The release-script parity test exposed these two missing consumer requirements; the fixture already included them and is unchanged. Each consumer must reject a freshly digested real manifest missing either capability, and accept the same complete combined wheel. Preserve all earlier capability, schema, digest, cancellation and ownership guards. The broad readiness-call graph is CRITICAL, so this repair is limited to the closed feature requirements and their independent tests.
