# Integrate current dev / #390 into #383

Status: SOURCE INTEGRATION IN PROGRESS; focused frontend checks pass. Immutable runtime pin selected; exact-wheel validation, independent review and remote delivery are pending. 2026-10-03 UTC.

## Authorized scope

Merge current dev into this bugfix branch and push fast-forward checkpoints. Preserve shared history. Do not merge this PR into dev/main, force push, deploy, restart an owner profile, modify real databases, or call live paid providers.

Initial remote head: 7e7abc21c9e7a5aa6850de01df4c981cb2de4126
Confirmed dev: f689b9fa9732fc4dc3ae527eea96e56c82dc1873
#390 is merged in PuPu PR395 and Unchain PR48. PuPu dev is f689b9fa9732fc4dc3ae527eea96e56c82dc1873; Unchain dev is 358b96d723daa0d2882158985c8245c7f8c7fb23.

## Integration plan

1. Read branch implementation/evidence and repository AGENTS and cross-boundary rules. Map three-way conflicts without discarding either intent.
2. Run complete graph impact before substantive edits. Resolve each semantic conflict using Sol, preserving the owner-accepted #390 behavior and #383 invariants.
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

## Three-way source map and bounded resolution

Merge base: `0047d58d0369d5c245a3fd8021d4d97c3e3f9a35`. Merge parents will be the
plan checkpoint `eeb1dff240f5488f133cc11ed45267e98b2b305e` and the confirmed dev
`f689b9fa9732fc4dc3ae527eea96e56c82dc1873`.

- `.github/workflows/release-qa.yml`: the five #383 runtime defaults conflict
  with dev's combined #386/#390 runtime. Final resolution must select one immutable
  integrated Unchain #47 commit at every site. All five sites select integrated Unchain #47 commit
  `4a0add1936e0369e16d5286289b280456eb913ca` (tree
  `cc13548266726f53502075196fafaf9797ff4183`), independently published/read back
  and restored by the coordinator. Exact-wheel qualification is still PENDING;
  neither old source alone establishes this combined pair's compatibility.
- `src/SERVICEs/runtime_events/activity_tree.test.js`: adjacent additions conflict.
  Retain all original-policy/legacy-omission cases and all strict bounded/grouped
  retry, heartbeat, hybrid-rejection and sanitized-output cases. The resolution
  inserts the complete 86-line dev block without removing branch assertions.
- `trace_chain.js` and `activity_tree.js`: automatic source merges preserve the
  branch's original-policy/member controls and dev's explicit strict retry dispatch.
  No manual production repair was required by the focused merged tests.
- The #383 grouping helper, adapter, cold journal policy reader and interaction
  presentation remain byte-identical to the branch. The #390 provider retry helper,
  Electron admission, artifact reader, Python capability/context/runtime factory
  remain byte-identical to dev. No #384 bugfix source is imported.

## Current graph and focused evidence

The graph is bound to the exclusive `/workspace/scratch/0b50cbee41b6/PuPu-383`
worktree, with isolated registry/index storage. GitNexus 1.6.12 indexed the pre-edit
`eeb1dff` source using a 1,024-KB source cap, two parse workers, a 512-MiB native
pool and a 2-GiB JS heap. Indexing completed with 44,667 nodes / 151,494 edges.
The initial unbounded native-pool attempt exited 1; the bounded retry completed.
FTS is unavailable and was disabled; named-symbol and graph traversal queries work.

Pre-edit `TraceChain` impact is UNKNOWN; direct imports in character chat bubble,
lazy trace chain and both UI runners corroborate its real consumers. Projector,
grouping helper and cold-policy impact results are LOW. File-level artifact,
rollout and runtime-factory impacts are MEDIUM; those file verdicts omit axes and
are not a waiver of symbol or whole-line risk. The complete comparison against dev
reports 245 changed symbols / 30 affected flows / 103 files, **CRITICAL**, exit 0
without partial/truncated-result notes. It includes both branch divergence and
incoming dev, not only the two textual conflicts. Analyzer process/fan-out/name
resolution caps remain explicit static-analysis limits; absent flows are not proof
of absence. A fresh merged-tree index completed with 44,784 nodes / 151,707 edges;
the complete staged all-scope raw backend check reports **118 changed symbols /
274–278 affected flows across complete runs / 38 files, CRITICAL**, with all symbols and flows returned and
no error/partial/truncated flag. Its explicit repository and worktree are both the
exclusive checkout above. Post-merge `providerRetryFields` is **CRITICAL** (102
affected processes / 20 modules); it is inherited unchanged from dev.
`safeGeminiRetry` is LOW. These are graph risk reports, not rollout clearance.

- Original branch frontend focus: **5 suites / 86 tests passed**, exit 0.
- Merged frontend focus: **6 suites / 144 tests passed**, exit 0. Includes the policy
  matrix/member controls, grouping live-prefix/replay/local-lifecycle cases and both
  strict provider-retry display/projection formats.
- Aggregate frontend, Electron, full backend, exact-wheel contract gates and build:
  **NOT_RUN** at this checkpoint. A focused pass is not aggregate acceptance.
- The isolated test environment preserves existing provider SDK versions
  (OpenAI 3.24.0, Anthropic 1.11.0, google-genai 2.28.0). Only missing host dependencies
  are added. No application profile, running process or real database is changed.

The prior #383 live Context V2 `UNAVAILABLE` diagnostic-v1 reader failure is
historical. This merge uses #390's reconciled diagnostic-v2/lease-v4 reader. Missing
macOS-only unpublished work is not reconstructed or represented as verified.
Live provider, frozen sidecar and platform-specific acceptance remain **NOT_RUN**.

## Selected immutable runtime artifact (qualification pending)

The coordinator published and independently restored Unchain source
`4a0add1936e0369e16d5286289b280456eb913ca`. The runtime worker built it once from
clean source; all checks for this pair must reuse those exact bytes:

- wheel: `unchain-0.2.0-py3-none-any.whl`
- wheel SHA-256: `d1735fac3affe1a00e402e78c85d110f7d939193c2ea014ebe747c428e248e54`
- imported runtime manifest digest:
  `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`

The runtime focused result is **190 passed / 6 failed** in the latest Google SDK
2.28.0 environment. Those six Gemini503 cases are being compared against immutable
dev before classification or changes. No provider guard is relaxed to make them pass.
PuPu host/backend/contract acceptance has not yet run at this source checkpoint.
The exact environment and source-focused log are preserved in
[`ticket-383-dev390-evidence/`](ticket-383-dev390-evidence/).
