# Ticket 383: consistent same-tool grouping

Issue: https://github.com/haoxiang-xu/PuPu/issues/383
Release: https://github.com/haoxiang-xu/PuPu/issues/216
Original base: dev @ 0047d58d0369d5c245a3fd8021d4d97c3e3f9a35
Branch: codex/ticket-383-tool-call-grouping
Workspace: /workspace/shared/pupu-383-planning-20261002

## Goal and scope

Consecutive uses of the same tool should normally merge; currently they sometimes
do not. The owner clarified that different arguments do not make a different tool.
Preserve the existing grouped header/count badge, detail styling and interactions.
Fix grouping, count and output preservation only. Do not redesign the UI, change
runtime journal/schema/provider behavior, refactor ordinary statuses/result lookup,
fix reasoning fragmentation or pause lifecycle, or work on stopped ticket 249.
No merge, deployment, automatic ticket closure or PR is authorized by this phase.

## Findings and reproduced defect

The grouping loop in trace_chain.js (2053-2093 at the original base) compares adjacent
rendered _toolName values. Own-call observations inserted at lines 1125-1148 break
the run. A regression through the actual PuPu createRuntimeEventStreamReplayProjector
and actual TraceChain renderer demonstrates the defect with canonical V4 input:
- Same read_file calls with different arguments, no output delta: PASS, x2
- Exact duplicate event replay: PASS, two executions and x2
- The same calls with owned tool step.delta output: FAIL, no x2

This is a reproduced shipped mechanism using synthetic valid events, not a claim
that the original acceptance incident was reconstructed. The external diagnostic
source/log are preserved under docs/implementation/ticket-383-evidence/.
Two existing baseline suites also passed (adapter/replay projector; 7 tests).

Real producer research established that ordinary Unchain calls can omit toolkit_id
and tool_display_name, and actual tool completion status is success. The default
observe=True path emits a raw batch observation which the current bridge drops;
it does not by itself produce the synthetic per-tool step.delta. Preserve this
negative result and qualify actual host event paths in integration. Actual pinned KernelLoop -> PuPu metadata enrichment/Flask V4 route -> actual
projector/TraceChain passed all five controls (four real sequences and duplicate
replay), with no observation frame reaching this UI path. These are integration
negative controls; own tool delta remains synthetic contract coverage. Do not alter
Unchain or its bridge to manufacture the regression.

## Selected minimal design

Create a small pure grouping helper near TraceChain, with no React/rendering or
external-state mutation. Existing timeline item descriptors remain opaque values.
Build boundary metadata from ORIGINAL frames before display filtering, then group
the existing descriptors using that metadata.

Equivalence: exact trimmed canonical tool_name, toolkit scope and run scope.
Arguments and display aliases do not define identity. Both missing toolkit IDs use
an unnamed legacy scope; missing versus explicit toolkit is distinct. Missing run
IDs on both use this trace's legacy scope; missing versus explicit run is distinct.
Missing canonical tool_name or execution identity is not eligible for grouping.
Preserve existing dedup/result association behavior; do not broaden into speculative
upstream identity or status repair.

Consecutive means no semantic barrier in the original sequence. Reasoning,
assistant text (including bubble-owned/filtered text), retry/error, user injection,
confirmation/selection and subagent steps are barriers. Tool-result metadata is
transparent. Only output/truncation descriptors owned by already-started CURRENT
group calls are transparent. Unknown/unowned or earlier-group output is a barrier.
Groups consume contiguous original subsequences; no late output is pulled backward
across a barrier. Original arrays and payloads are not mutated or rewritten.

Reuse inventory: ToolTag, CountBadge, KVPanel, current observation Markdown and
Timeline details. No new visual primitive or requested design alternative.
Singletons and silent groups keep existing presentation. Output-bearing groups
preserve every consumed descriptor's title, span, body, details, status and order
inside the existing collapsed detail treatment. In particular the omitted-output
count lives in the truncation TITLE, and an empty-tail row may have no details:
never preserve only item.details or silently discard count-only rows. Keep each
call's arguments and results associated and accessible; output is not duplicated
in both the group and standalone timeline.

Use a stable first-call group key. Test expansion identity through the valid stream
transition A + observationA (expand observationA), then append same-tool B and an
error: the shifted error must not inherit expansion. If needed, control expansion
locally in TraceChain by stable item keys. Do not refactor builtin Timeline.

## Graph evidence and risk

GitNexus 1.6.12 indexed the actual PuPu checkout at the original base. Use the exact
indexed CLI artifact recorded in graph-status.txt; the generated runner selects
an inaccessible pnpm cache here. Keyword query was attempted but FTS is unavailable.
Exact symbolic context succeeds. TraceChain upstream impact is UNKNOWN because
JSX callers are unresolved; this is not a low-risk all-clear. Required corroboration
identifies character_chat_bubble, lazy_trace_chain, interject_runner and
trace_chain_runner. File impact resolves those four direct imports and 11 reachable
files, but its LOW file verdict omits process/module axes and does not waive the
symbol UNKNOWN. getToolDisplayName impact reaches timelineItems. The index also
reports capped process enumeration/name-fallback limitations. Evidence is preserved.
No unrelated GitNexus repair is needed for this scoped edit.

Before editing, Luna must inspect this handoff and applicable repo instructions,
run symbol impact for its actual targets and report any new HIGH/CRITICAL risk.
UNKNOWN requires corroboration. Before every commit, run detect_changes --scope all
in this exact checkout; partial/truncated results are not a clean check.

## Exactly two intermediate reviews, then final acceptance

GPT-6.1 Sol planned this fix and an independent GPT-6.1 Sol reviewed it. Its required
corrections (complete output descriptors; two review count) are incorporated here.
GPT-6 Luna owns production changes, one bounded slice at a time.

1. CORE SLICE: pure helper + focused unit tests + minimal TraceChain integration.
   Allowed production files: trace_chain.js and a nearby grouping helper only.
   Add focused grouping/render tests. Restore the red regression without losing
   observations, truncation labels, per-call sections or semantic barriers. Test
   aliases/different arguments/missing toolkit and expansion identity. Stop for
   intermediate GPT-5.6 Sol review 1.
2. PARITY SLICE: integration/lifecycle tests and only necessary corrections to the
   same core files. Compare every live event prefix and different batch sizes with
   fresh replay; duplicate replay, stop/pause snapshots, serialized reopen, second
   message and normal/subagent contexts. Preserve existing confirmation/selection,
   lazy mount, provider-retry and observation-coalescing tests. Reuse the one pinned
   wheel for actual producer -> strict PuPu consumer evidence. Stop for intermediate
   GPT-5.6 Sol review 2.
3. GPT-6.1 Sol final acceptance reviews the delivered candidate and independently
   runs required focused/aggregate checks. It cannot infer PASS from worker reports.

Review results are CONTINUE, CORRECT BEFORE CONTINUING, or STRONG-MODEL TAKEOVER.
Do not dispatch the next dependent slice before its review. Do not add more review
checkpoints by default: frequent durable commits are separate from review frequency.
Missing interfaces, architecture decisions, scope expansion or regression require
reporting to the planner before dependent edits. No hidden broad refactors.

## Durable checkpoint contract

The owner approved frequent commits and publication to this dedicated branch.
Initial checkpoint b6654c22fb437ebb672d0b92db5a5918fa956843 was independently retrieved
by API and fresh GitHub clone, no local alternates. Its tree is
5d78e12b4fe099d9384ee8fa45f111ae3426d071 and initial-plan SHA256 is
9cb97e8c07d317b553cb5c34fc7168b7420e84fb7a17f9167bf22e1d9df7240c.
The restore diff against original dev contained only this plan. The initial save/
restore gate passed before production code edits.

At each meaningful small milestone, Luna reports WIP readiness and pauses briefly
so the coordinator can save code/tests/evidence on this branch. Save WIP with an
accurate label even before a long review. Local commit alone is not durable.
For every checkpoint, verify remote ref, commit parent/tree and all changed content
against the staged tree or hashes before releasing the next slice. Never force
push, overwrite others' work, or reset an unrelated checkout. After an environment
reset, fetch the exact latest branch and inspect this file/evidence before resuming.

## Boundary and sequence contracts

BC-383-01: pinned Unchain RuntimeEvent V4 -> PuPu host normalization/stream -> actual
runtime event store/projector -> trace frames -> pure grouping -> TraceChain.
Existing V4 envelope admission/version and journal serialization are unchanged.
Trace payloads are OPEN to existing extensions; grouping reads only established
identity/type/ownership fields, preserves unknown payload fields and raw records,
and fails conservatively to separate rows on insufficient identity. Renderer-only
metadata is not serialized or added to the provider wire. Wrong-version/identity
negative checks use existing admission behavior, not a new parallel validator.

SEQ-383-01: start, first call/output/result, second same-tool call/output/result,
stop/settle, repeat identical events, serialized reopen, second message. At every
prefix, count unique calls and retain chronological descriptor order. Late output
across a barrier remains at its arrival position. Missing output identity remains
separate. Applicable normal/subagent/retry/interaction paths preserve their barriers.

AC-383-01: silent and output-bearing same-tool sequences group with correct counts;
alias collisions/different canonical tools, semantic barriers and unowned output
remain separate. AC-383-02: original arrays untouched; every original consumed
output label/body/detail and each call argument/result survives exactly once.
AC-383-03: prefix/batch/replay/stop/reopen/second-use grouping and counts match;
expansion belongs to stable items. AC-383-04: actual pinned runtime outputs copied
unchanged into the actual strict PuPu path, with version/identity negative controls.

Exact runtime identity for AC-383-04 (built ONCE, do not rebuild): Unchain source
1ec49ddfc28d3b42ba035debada5e3db759dad1b; wheel SHA256
f62aa13af4525e5e98548612bc15171cbc01c784e7be55f73d704c7840164889; imported manifest digest
a4448f85fc219f8535a6dafca8cfe1f8ba7963a3219ef1a0f00f8f14e30079be.
The producer fixture directory is /workspace/shared/pupu-383-producer. Generated
fixture/script/manifest evidence is preserved with the plan; actual wheel bytes
must remain available for integration. No altered runtime manifest or new protocol.

## Verification and stopping condition

Use react-scripts test via npm test, not direct npx jest. Focused grouping/trace_chain,
replay/event-store/adapter, chat-storage and lazy/confirmation/subagent/provider-retry
suites are required. Final check runs npm run test:frontend -- --runInBand and
npm run build:web, with failures/baseline failures/blockers distinguished. Use an
actual browser scenario if runtime is available; label any NOT_RUN verification.

Exact wheel producer fixtures, red-before-green evidence and final candidate hashes
must be linked in checkpoint records. Required unavailable matrix evidence is
INCOMPLETE, never PASS. No release qualification, live provider calls, merge or
rollout is implied. Finish when final accepted code/evidence are remotely preserved;
report remaining acceptance limits and wait for owner close for PR/audit workflow.
