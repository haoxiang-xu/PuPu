# Ticket 384 dev integration independent review

Date: 2026-10-03 UTC. Reviewer: GPT-6.1 Sol. Read-only review; no production edits or publication.

## Verdict

**PASS for the source integration and qualified lite CI lane.** No unresolved source finding was identified. This verdict covers PuPu `30bf2126851ddb3adc27d1d06dfa1fbc19235f7a`, tree `8d0821998060c7ba19dd4bc03f64d301b44fe6b3`, with the immutable runtime pairs below. Active rollout and real-profile acceptance remain **INCOMPLETE**.

The two merge parents are branch checkpoint `be7c0badc5ccc702709dcc4c8be89d8535d04a79` and accepted dev `f689b9fa9732fc4dc3ae527eea96e56c82dc1873`. The CI synthetic merge `9802d0b629aa75db074e32e9ab4f7dd364262503` has the identical entire tree, independently checked with Git and a zero-file diff.

## Source findings

- The three-way integration preserves the #384 history settlement and Stop repair. Incoming dev does not modify the streaming hook or settlement helper relative to the common base. The merged 551,348-byte hook remains SHA-256 `3dc910b8be3786cf036cae4fe0f3ef72002782e3652e40557809df5172b3a1d9`.
- Stop synchronously drains the current run's already-admitted V4 batch, nested state and message commits before capturing cancellation identity and tombstoning the generation. It introduces no asynchronous admission window. Exact pending interaction, run, attempt and successor fences remain intact.
- TraceChain retains truthful interrupted generic and nested-call presentation and disables cancelled approval actions. The accepted #390 bounded-ordinal and grouped retry paths compose without consuming each other's records. Malformed and hybrid ordinal input remains rejected.
- Strict imported-manifest admission, digest/provenance checks and verified provider-result readers remain intact. All five workflow defaults select immutable Unchain dev `358b96d723daa0d2882158985c8245c7f8c7fb23`. No #383 source is imported.

## Artifact and test evidence

Two separately built artifacts are recorded accurately; they are not claimed to have the same archive hash:

- Local wheel SHA-256: `819e097dee4ad8b934b76fabf83d04360c3081a48730d21792bf525b806e7e76`
- CI wheel SHA-256: `f069e77fb9f230e9548f7f96d3e90083b1d5095935b985c7820fe700e1d9fee3`
- Both derive from clean Unchain `358b96d723daa0d2882158985c8245c7f8c7fb23` and import manifest `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`

Independent checks verified all 345 packaged files, including 334 Python files, against committed source for both wheels, and against the local installation. The production artifact validator accepted the actual imported manifest. Freshly digested missing-feature negatives were rejected by both Electron and artifact consumers.

Independent archived-source tests passed: 149 frontend tests, 78 Electron admission/readiness tests, 15 artifact/workflow tests, 46 host diagnostic/V4 tests plus 6 subtests, and 75 adapter/factory/protocol tests. These exercise actual consumers with fake external transport; they do not constitute a live provider probe.

Canonical local pinned-SDK backend validation passed **2,675 tests, 18 skipped and 3,599 subtests** against the same local wheel. Both exact-wheel contract gates passed. The final local web compiler child exited **0 with no signal**, after two recorded SIGKILL attempts.

[Release QA run 37106504542](https://github.com/haoxiang-xu/PuPu/actions/runs/37106504542) reached terminal success. Its final merged lite report records passing deterministic checks and two Linux Playwright Electron smoke tests, with zero failed checks. CodeQL and merge-source checks passed. CI reused its single recorded wheel throughout.

## Limits

The raw local full frontend and Electron invocations failed on 38 vault fixture tests, reproduced on exact dev. Initial latest-SDK backend/runtime invocations also failed on documented SDK, CA-environment and fixture-root cases. Their later scoped or canonical reruns do not turn those original invocations into all-green aggregates. Qualified lite CI does not establish complete vault coverage.

The complete whole-branch graph comparison reports **195 changed symbols, 54 affected flows and 56 files, CRITICAL**, without partial/truncated/error flags. This is a risk report, not a source-risk waiver; FTS, dynamic/JSX dispatch and traversal limits remain.

Real-profile Stop/reopen, cold sidecar resume, live provider behavior, frozen-sidecar/package qualification and other-platform manual acceptance remain **NOT_RUN**. No app/profile restart, real database mutation, paid provider call, PR merge, deployment or issue closure was performed by this review.
