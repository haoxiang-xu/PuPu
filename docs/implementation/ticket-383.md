# Ticket 383: consistent same-tool grouping

Issue: https://github.com/haoxiang-xu/PuPu/issues/383
Release: https://github.com/haoxiang-xu/PuPu/issues/216
Base: PuPu dev @ 0047d58d0369d5c245a3fd8021d4d97c3e3f9a35
Checkpoint branch: codex/ticket-383-tool-call-grouping
Companion source inspected: Unchain dev @ da5d55b8bf50a51bd81974ada99ba8a888f969d5
PuPu QA runtime pin to qualify: 1ec49ddfc28d3b42ba035debada5e3db759dad1b

## Current phase and recovery contract

Planning and read-only diagnosis only. No production implementation has begun.
The owner approved a dedicated branch and frequent committed remote checkpoints,
with independent remote retrieval verified before implementation.
This document is the first recovery checkpoint. A checkpoint is not preserved
until its exact GitHub ref, commit, tree and content are retrieved independently.
The branch must remain separate from dev/main; no merge or deployment is authorized.
After any environment replacement, fetch this exact branch and inspect its latest
checkpoint before resuming. Do not assume a local workspace or dependency cache survived.

## Goal and scope

The owner clarified that consecutive uses of the same tool should normally merge,
but currently sometimes do not. Preserve the existing grouped header, count badge,
KVPanel detail appearance and interactions. Different arguments do not make a call
a different tool. Keep chronology, correct unique execution counts and individual
argument/result access. No UI redesign, runtime journal/schema/provider changes,
reasoning fragmentation fix, pause-lifecycle fix, or work on stopped ticket 249.

## Verified investigation

The current renderer groups adjacent rendered items by display label only in
src/COMPONENTs/chat-bubble/trace_chain.js, lines 2053-2093. Its observation rows are
inserted between calls. The loop therefore groups two silent same-tool calls but
leaves the same calls separate when own-call output has an observation row.
A static reproduction confirms that algorithm behavior; the original acceptance
incident has not yet been reproduced. Canonical producer-to-render evidence is
required before selecting production edits. Display-alias collisions, global
call-id lookup, ordinary-call statuses and numeric-index expansion are regression
risks, not authorization for speculative broad refactoring.

Two existing production baseline suites passed: trace_chain_adapter.test.js and
stream_replay_projector.test.js (7 tests). This is not proof of a fix.
Both isolated source checkouts are clean dev snapshots. No matching ticket branch
or competing open PuPu PR was present at investigation time.

## Plan review and remaining pre-implementation gates

An independent GPT-6.1 Sol review agreed that the narrowed merge-only plan is sound,
but implementation remains blocked until these gates pass:
1. Verify this remote checkpoint can be restored independently with exact hashes.
2. Complete GitNexus query/context/upstream impact in the actual isolated checkout.
   PuPu's current index is at the base SHA. TraceChain impact reports UNKNOWN because
   JSX callers are not resolved; corroboration is required, not a low-risk waiver.
   Keyword search is degraded because the FTS extension could not be loaded.
   The Unchain index attempt also needs its registry-lock failure resolved.
3. Reproduce and document the actual defect, settle precise boundary/legacy behavior,
   and complete the technical BC/SEQ/AC handoff before dispatching Luna.

## Bounded implementation and review sequence

GPT-6.1 Sol owns investigation and the settled implementation plan; independent
GPT-6.1 Sol reviews the plan. GPT-6 Luna owns production changes, one slice at a time.
GPT-5.6 Sol reviews at least three intermediate checkpoints. GPT-6.1 Sol performs
final development acceptance after the final candidate and evidence are preserved.

Provisional slices, to finalize after reproduction:
1. Minimal deterministic grouping projection and regression tests; no unrelated
   identity/status changes. Stop for GPT-5.6 Sol checkpoint 1.
2. Integrate the settled grouping repair while preserving existing presentation,
   output/truncation and per-call sections. Stop for GPT-5.6 Sol checkpoint 2.
3. Live, stop/pause snapshot, replay/reopen, second-message and expansion parity,
   exact pinned runtime artifact evidence and documentation. Stop for GPT-5.6 Sol
   checkpoint 3, then GPT-6.1 Sol final development review.

At every checkpoint, record actual diff, tests, deviations, unresolved questions,
exact candidate identity and next authorized slice; commit and publish only this
branch, retrieve the exact remote head, and verify all required work is recoverable.
Every production symbol edit requires applicable GitNexus impact first, and every
commit requires graph change analysis. Review outcome is CONTINUE, CORRECT BEFORE
CONTINUING, or STRONG-MODEL TAKEOVER; no dependent slice starts before review.

## Invariants and verification to finalize

Groups must consume contiguous original subsequences. Member-owned output can be
transparent to call adjacency but must never be pulled backward across reasoning,
assistant text, retry/error, user injection, interaction or subagent barriers.
Boundaries cannot disappear solely because lifecycle-dependent display filtering
moves final text ownership to the assistant bubble. Unknown/unowned output is a
barrier. Preserve legacy calls without toolkit metadata according to actual producer
and persisted examples. Missing execution identity must not inflate replay counts.
Do not claim a renderer change recovers provenance already lost upstream.

Compare grouping and counts at every event prefix, including different flush/batch
sizes and duplicate replay, against a fresh replay of that prefix. Cover different
arguments, display aliases, singleton calls, owned/unowned and late observations,
truncated output, second use, serialized/reopened traces and stable expansion while
a group grows. Preserve confirmation, selection, subagent and provider-retry tests.

The cross-boundary gate applies because behavior depends on replay/restart.
BC-383-01 (producer -> event projection -> trace rendering), SEQ-383-01 (live prefix,
stop, replay, reopen, repeat) and their AC mappings must be completed from actual
producer evidence. Required final evidence binds the PuPu candidate to one built-once
pinned Unchain wheel with a recorded SHA-256 and runtime manifest digest. Unrun or
unavailable matrix cells are NOT_RUN/INCOMPLETE, never PASS.

Initial planned checks: focused trace_chain*, runtime_events* and chat_storage*
suites, frontend aggregate tests and build:web, with additional exact-artifact
checks selected from the settled BC/SEQ/AC. PR creation/audit wait for owner close
under repository workflow; no automatic merge, ticket closure or deployment.
