# Ticket 370: truthful Test API tool evidence

Ticket: https://github.com/haoxiang-xu/PuPu/issues/370
Workspace: `/Users/red/Desktop/GITRepo/pupu-370`
Branch: `codex/ticket-370-tool-evidence`
Base: dev `8753e9e41df35f2241a4e35233f0c5d2c9f00b84`

## Investigation and decision

`use_chat_stream.js` getRunForTest and the blocking V2 fallback read
`message.tool_calls`, but the stream persists tool_call/tool_result frames in
traceFrames and subagentFrames. `chat_storage_adapter.getChatDetail` returns those
stored messages without a tool_calls projection. Runtime V4 step.started/tool
and step.completed/tool produce these frames through activity_tree.js. Prose is
not evidence. Introduce a pure Test API projection, leaving chat storage and
runtime protocol unchanged; use it in run snapshots, both blocking paths, and
assistant messages in GET chat detail.

No UI components or design choices. No provider calls or local-model inference.
No changes to execution, confirmation policy, persistence schema or production
traces. No changes to logs unless investigation proves dropped records.

## Evidence contract

BC-001: persisted/in-memory assistant traces -> renderer Test API projection ->
IPC/HTTP JSON consumer. Existing API envelopes are OPEN/additive; the new projected
record keys are CLOSED: `id`, `run_id`, `name`, `arguments`, `status`, `result`.
Missing values are null. `tool_calls` remains null without trace evidence (preserve
an existing nonempty legacy tool_calls array only when there are no tool frames).
One record per (run_id, call_id); never combine repeated call ids across child
runs. Do not mutate input messages. Ignore malformed frames/missing call identity.
Unknown frame types/fields do not manufacture calls or success. Project only
explicit fields, not arbitrary payload spread. Arguments/result use existing
trace-sanitized values; do not obtain extra sensitive provider state.

Statuses: a tool_call requiring confirmation is `pending`; otherwise `running`.
tool_confirmed means `running`, never completion; tool_denied means `denied`.
A tool_result is `completed` only absent explicit failure/error/denial indicators;
preserve failed/denied/cancelled outcomes, do not label errors success. Inspect
actual payload status/error/success fields and existing fixtures before coding;
report ambiguity to planner instead of inventing a provider-specific heuristic.
Legacy V2 `tool_result` frames from Unchain can omit top-level `status` and carry
`result: {error: ..., tool: ...}`. Unchain's V4 normalizer maps nested `denied`
and non-null `error` to denied/error; its failure check also treats nested
`ok: false` as failure. The Test API projection therefore checks these explicit
nested fields as well as top-level status/error/success/is_error/ok. A plain
successful result remains completed. The red test first reported all three
legacy negative results as completed; the corrected projection preserves their
denied/failed states.
Terminal results dominate duplicate earlier call frames. Retain root and child
run identity using frame.run_id (bucket fallback for child frames). Result-only
frames are legitimate evidence and should be retained.

SEQ-001: pending -> approved -> result; denied has no successful result; repeated
frames remain one record; two calls in one turn stay distinct; a later turn or
other chat never inherits another turn's evidence; JSON persistence/reload gives
the same result. Applies root/child runs and legacy trace frames. Retry is scoped
by message/attempt and run identity. No runtime manifest or wheel changes.

AC-001: actual V4 producer events through event_store/reduceActivityTree and trace
adapter -> projection -> exact-key/value assertions show execution and preserve
identity, arguments and results, including root/child repeated ids. Producer
test starts both runs with a parent link, verifies separate root traceFrames and
child subagentFrames, then checks duplicate call frames cannot replace results.
AC-002: prose-only, malformed frames, confirmation-only, denied, failed, duplicate
and result-only cases; no false success or mutated input.
AC-003: run/blocking responses and chat detail expose equal evidence; persisted
message reload preserves it. Existing chat storage and streaming tests stay green.
AC-004: log capture investigation exercises renderer pushLog and main log tail,
capacity/source/since filtering and new-service reset; document what is proven
and any unavailable original-session evidence. Logs are an in-memory console
buffer, not a durable tool event journal.

## Impact and execution

GitNexus indexed 42,989 nodes. getRunForTest/useChatStream/use_chat_stream.js are
unresolved (UNKNOWN), not low risk. Text corroboration locates hook integration
in src/PAGEs/chat/chat.js, run callbacks, blocking-send paths and hook tests.
getChatDetail impact UNKNOWN; handlers/chat.js dynamically calls it, registered
by test_bridge/index.js. No graph processes resolved; this is a lower bound.
Worker must perform impact before each edited existing symbol, warn on HIGH or
CRITICAL, corroborate UNKNOWN. New helper has no preexisting graph symbol.

Assessment: suitable bounded implementation after this settled projection plan.
Worker gpt-6-sol; strong parent reviews contract/status handling and integration.
Checkpoint 1 only: implement helper + producer/negative tests + adapter and hook
integration with focused tests; stop and report diff, red-before-green evidence,
test results and deviations. Parent handles AC-004 independently. No commit,
push, PR or audit. Unexpected semantics/architecture requires parent decision.

Permitted product files: src/SERVICEs/test_bridge/tool_call_evidence.js (new),
chat_storage_adapter.js, src/PAGEs/chat/hooks/use_chat_stream.js (import and two
read replacements only). Associated focused tests and docs/api-reference/test-api.md
may change. Use existing react-scripts test patterns; run CI=true npm test --
--watchAll=false --runInBand --runTestsByPath <affected tests>. Record a failing
pre-fix response regression first. Stop at checkpoint before broadening edits.

Live exact candidate validation: NOT_RUN pending implementation. Development
tests do not equal feature acceptance or active rollout approval.

## Strong review and development verification (2026-09-29)

Decision: continue after correction. Parent found legacy nested result errors
were initially labeled completed; corrected with denied/error/ok=false regression.
Root/child producer routing, confirmation/terminal precedence and input immutability
reviewed. Parent reran 185 renderer tests (4 suites), plus one exact-output test
using actual RuntimeEventBridge output from the installed immutable Unchain wheel.
Six Electron Test API suites passed (38 tests); .js/.cjs twins are identical.
Total: 224 focused tests passed. Renderer log push, actual HTTP tail/filter and
new-service reset were exercised. No dropped records reproduced; the original
session's buffer was not retained, so its cause cannot be conclusively assigned.
No logging product change. Logs are console buffers, not a durable execution log.

Real packaged app/cloud-model probe NOT_RUN. Development evidence is not audit
PASS. New helper and huge hook were not completely represented by the pre-edit
graph; graph analysis is supplemented by explicit diff/caller review.

Delivery follows the owner's standing authorization to commit/push and raise a
separate PR per selected bug, then wait for review. No automatic merge or issue
closure. This authorization supersedes the skill's default wait-for-close prompt.
