# Integrate current dev / #390 into #384

Status: SOURCE MERGE PUSHED; local and canonical CI qualification recorded. 2026-10-03 UTC.

## Authorized scope

Merge current dev into this bugfix branch and push fast-forward checkpoints. Preserve shared history. Do not merge this PR into dev/main, force push, deploy, restart an owner profile, modify real databases, or call live paid providers.

Initial remote head: 42116eccf177ff98ee78840bdc55da9eaea20ee2
Confirmed dev: f689b9fa9732fc4dc3ae527eea96e56c82dc1873
#390 is merged in PuPu PR395 and Unchain PR48. PuPu dev is f689b9fa9732fc4dc3ae527eea96e56c82dc1873; Unchain dev is 358b96d723daa0d2882158985c8245c7f8c7fb23.

## Integration plan

1. Read branch implementation/evidence and repository AGENTS and cross-boundary rules. Map three-way conflicts without discarding either intent.
2. Run complete graph impact before substantive edits. Resolve each semantic conflict using Sol, preserving the owner-accepted #390 behavior and #384 invariants.
3. Obtain independent GPT-6.1 Sol review of final candidate and tests. Repeat affected checks after corrections.
4. Publish small safe remote checkpoints and verify remote SHA/tree and restoration. Final merge must have this branch and confirmed dev as parents; no rebase.
5. Build an immutable Unchain artifact once, reuse its exact bytes for applicable PuPu contract and backend tests. Keep all five workflow default pins consistent per bugfix line.
6. Run applicable aggregate frontend, Electron, runtime/backend, boundary gates and build checks. Publish final tested state; monitor exact-head CI to terminal status or a verified blocker.

## Contract and state tracking

BC-390-I01: Unchain imported artifact to PuPu host/Electron/artifact consumers. VERSIONED; strict exported protocol manifest admission, provenance and digest fences remain unchanged. No Git SHA may become capability admission. AC-390-I01: validate the actual installed wheel, strict manifest positive/negative checks, Context V2 and RunBundle gates against the same immutable wheel.

BC-390-I02: historical diagnostics and leases across persisted state to runtime. CLOSED exact key sets, types, HTTP/null/status associations, canonical bytes, hashes and predecessor identities. AC-390-I02: historical diagnostic-v2/lease-v4 matrices plus unknown/hybrid/crossed state negatives; unknown outcomes cannot authorize resend.

SEQ-390-I01: first/second message, first/second interaction, retry/durable resume/cold restart and normal/graph/subagent paths as applicable to inherited #383/#384 plans. Preserve approval gating, no-resend and Stop behavior. AC-390-I03: combined artifact-pair regression suites and focused policy/interrupted chain tests. Inapplicable cells require a reason; unrun cells stay NOT_RUN.

## Pending evidence

Conflict map, graph risk, final artifact identity, tests, independent review, remote restore proof and exact-head CI are PENDING. Prior branch acceptance is historical, not acceptance of this merged pair. macOS-only unpublished work is not assumed accessible or included. Live/frozen/platform-specific acceptance is NOT_RUN until demonstrated.


## Textual and semantic merge assessment

Read-only three-way merge from plan checkpoint `be7c0badc5ccc702709dcc4c8be89d8535d04a79` and current dev `f689b9fa9732fc4dc3ae527eea96e56c82dc1873` is textually clean. The automatic source tree is `5897c696c302d035a4cd0d9a50da78c8b7719bf6`. No broad ours/theirs selection was used. The merge remains a two-parent history-preserving integration, with no #383 policy fix imported.

The anticipated giant-hook conflict does not occur at these exact revisions: incoming dev does not change `use_chat_stream.js` relative to the shared base. The branch hook and automatic merged hook both have SHA-256 `3dc910b8be3786cf036cae4fe0f3ef72002782e3652e40557809df5172b3a1d9`. Thus the #384 current-handle synchronous admitted-batch drain, nested/message flush, interaction identity capture, generation tombstone, and stale/successor ownership guards survive byte-identically. `chat_turn_utils.js` likewise retains the original #384 supported-history retention without dev edits.

The shared TraceChain file composes disjoint hunks: #384 cancelled generic/parent/child statuses and disabled stale approval actions plus #390 strict legacy-ordinal/grouped-retry routing and renderer. Runtime projector, provider-result readers, strict capability consumers and diagnostic tests follow accepted current dev. This source assessment is not aggregate or live acceptance.

All five Release QA default source refs select immutable clean Unchain dev `358b96d723daa0d2882158985c8245c7f8c7fb23`, which contains reconciled #390/#386 source `1c9b399beb65bda72520e1c3ebc11c7f117751cb`. The same pinned ref feeds every downstream default. This integration supersedes the narrow runtime-pin portion of inaccessible Mac-only #384 WIP; no unpublished Mac document or edit is claimed recovered.

## Pre-edit graph evidence

GitNexus 1.6.12 is bound only to this exclusive linked worktree, indexed at `be7c0bad`, with isolated home/index and `--max-file-size 1024 --index-only`. The 551,348-byte streaming hook is included. Index completed: 2,728 files, 44,627 symbols, 151,054 edges, 1,220 flows. FTS was unavailable, while graph construction succeeded. Callable/property dispatch fanout, flow ranking and trace-depth caps remain coverage limits and are not an all-clear.

Upstream impact, reported before the merge/workflow edits: `startRuntimeEventStream` CRITICAL (16 symbols, 14 process groups); `settleStreamingAssistantMessages` CRITICAL (21 symbols including tests/compiled consumer, 7 groups); `cancelCurrentStreamAndSettleMessages` HIGH (4 symbols, 3 groups). Actual direct paths include `runTurnRequest`, Stop/deleteTurn, session bootstrap and unavailable/test cancellation settlement. `applyEvent` LOW (8 symbols), `providerRetryFields` LOW (5), `groupProviderRetryFrames` LOW (1), `wrapRuntimeEventStreamHandle` LOW (3). `TraceChain` UNKNOWN (JSX caller edges unresolved): actual ChatBubble → LazyTraceChain and recursive nested TraceChain call sites corroborate its load-bearing use. The workflow is unindexed/UNKNOWN; exact file reading verifies its five immutable defaults and downstream consumers. No UNKNOWN zero is interpreted as unused or safe.

## Exact artifact planned for all new validation

One clean-dev wheel was built once and independently inspected by the coordinator. Source/ref: `358b96d723daa0d2882158985c8245c7f8c7fb23`. Wheel: `unchain-0.2.0-py3-none-any.whl`, SHA-256 `819e097dee4ad8b934b76fabf83d04360c3081a48730d21792bf525b806e7e76`. Actual imported runtime manifest digest: `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`. Local acceptance must reuse these exact bytes and verified installed package; mutable sibling source is not runtime evidence. BC-390-I01/02 and SEQ-390-I01 apply alongside BC-384-001/SEQ-384-001. New focused, aggregate, contract, build and independent-review results remain PENDING at this checkpoint.


Admission-boundary File upstream impacts are separately scoped: Electron readiness MEDIUM (7 symbols), artifact consumer MEDIUM (11), runtime factory MEDIUM (42), Python capability file LOW (25), and context adapter UNKNOWN (0). File nodes omit process/community axes. The adapter's actual bind call sites and injected `execution.artifacts.read_full_verified` reader are corroborated in adapter tests; UNKNOWN does not imply unused. Same-wheel host tests will exercise both factories and strict consumers.

Before source-checkpoint publication, complete backend `detect_changes(scope=all, worktree=this checkout)` records 33 changed files, 32 symbols and 20 affected processes, CRITICAL risk. The full structured result has no `partial`, `truncated` or `error` flag. CLI prose intentionally abbreviates rows, so the full structured backend response was independently saved and checked instead. Coverage limitations above still apply. Whitespace and unresolved-index checks pass; validation remains PENDING.


## Current qualification

Source merge checkpoint `30bf2126851ddb3adc27d1d06dfa1fbc19235f7a` was published/restored with exact two parents and tree `8d0821998060c7ba19dd4bc03f64d301b44fe6b3`. No tracked production/test changes were needed after composition. See [new integration evidence](ticket-384-dev390-evidence/acceptance.md) for separate local and canonical CI artifact identities, complete fresh test counts, preserved raw local Linux fixture failures, environment-only recoveries, actual compiler exit proof and current limits. Historical ticket acceptance does not replace this qualification. Independent GPT-6.1 Sol final review is PASS for source integration and qualified lite CI on exact30bf212; see the cited review in the evidence directory. Evidence-only publication/readback is the remaining delivery step; live/frozen/platform acceptance and active rollout remain INCOMPLETE.
