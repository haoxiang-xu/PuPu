# PuPu #383 parity slice evidence

## Candidate and review record

- Core candidate reviewed as `9b9b1e8bf48f59cb6683d23849dc79f77ad95c5e`; review 1 returned **CONTINUE**.
- Parity candidate: `d9f3e76c0fcafd7f751eb63ec9d65ea600a0c937`, tree `98702eab83929d7f946c0a61118acd214518a9ee`.
- Review 2 returned **CONTINUE** after requesting one renderer-only coverage correction for every prefix of the actual legacy V2 fixture. That test was added and passed before the verdict.
- Final GPT-6.1 acceptance then found one must-fix expansion regression: a late truncation summary anchored to call A shifted an already-expanded call B observation onto call B's argument row in the nested detail Timeline. The final delta adds `ToolGroupTimeline` inside TraceChain, controlling the existing Timeline by stable member keys. The exact regression was RED before the wrapper and GREEN after it; see `phase2-final-nested-expansion.log` and the current focused log. Final independent delta checks passed on source commit `0eb843fe2312f0e5e4ba6edd98cb8056e9bfe40e`; see `final-acceptance.md` and `final-independent-evidence.json`.
- The correction is durably saved as `382c0e24f850f5a93c605a38e7fd93559c9f55cd`, tree `609ac092700db5b772240108d23432c7562a9a6e`. The d9f3 review candidate is its parent.
- Allowed production files remain `src/COMPONENTs/chat-bubble/trace_chain.js` and `trace_tool_grouping.js`. The final correction changes only the state owner in TraceChain and its renderer regression test; no backend, provider, Unchain, schema, journal, Timeline, or ordinary result/status changes.

Candidate file SHA-256:

- `trace_chain.js`: `9c38823b599c76ba92256d8210de6e8ee18f3a0dae151d427056c12be111e502`
- `trace_tool_grouping.js`: `65a7f4bf78bd3eb42418f307e9bd02788a184eff61d6dac2feace64c386a71c8`
- `trace_tool_grouping.test.js`: `ebf34fbbbb9bff2decd374769d0b1ab572b2246a226948d2eeac70ce5128af28`
- `trace_chain.grouping.test.js`: `3bfda65257790fabdacdb2e5def65c8b7703f6372067506854ce39c9e12c04bf`
- `trace_chain.grouping_parity.test.js`: `a0014a3081a2ecf40a68e89c00437912864dd01879c015c64270d937584159e3`

## Coverage and focused results

`phase2-focused.log` records the required focused command: `CI=true npm test -- --watchAll=false --runInBand --runTestsByPath ...` across TraceChain, grouping, replay/projector, event store, adapter, chat storage, lazy mount, confirmation/selection, subagent, and provider retry suites. After the final correction, result: **12 suites / 122 tests PASS**.

The new parity suite (`trace_chain.grouping_parity.test.js`) exercises:

- Every prefix of the 16-event actual V4 sidecar-runtime fixture: incremental projection equals a fresh replay and rendered group count follows the calls received.
- V4 replay batched in sizes 1, 2, 3, and all events yields the same trace frames; exact duplicate event replay remains two executions.
- Partial V4 frames retain `×2` while UI status is streaming, waiting, paused, or stopped; serialized reopen retains grouping across streaming/waiting/paused/stopped/done/error status snapshots.
- Every prefix of the 19-frame actual sequential legacy V2 fixture: no count badge before the second call, `×2` from the second call onward, and the number of visible Observation rows equals the number of observation frames received. Serialized V2 reopen retains `×2` and both rows.
- Same-tool grouping inside a nested subagent; chat/message owner switches do not retain expanded singleton observation or nested group-output state.
- A late earlier-call truncation summary shifts nested member indices but leaves expansion attached to the originally expanded observation; the call argument row remains collapsed.

The existing renderer integration test also expands the actual sequential V2 group and verifies both observations, both fixture names, and both output bodies remain accessible. Existing helper tests cover no mutation, mixed/incomplete/stale batches, semantic barriers, output order, omitted-count rows with empty tails, and alias/toolkit/run identity controls. Existing event-store tests cover wrong-version/unknown-event admission and duplicates; no parallel validator was added.

The initial external legacy UI harness still contains a pre-fix expectation that `observed-sequential` must **not** show `×2`; that assertion now fails by design. The current in-repo actual legacy-frame tests assert the corrected `×2` behavior and pass. Do not report the stale harness expectation as a product regression.

## Exact pinned producer evidence

- Unchain source revision: `1ec49ddfc28d3b42ba035debada5e3db759dad1b`.
- The wheel was built once only; SHA-256: `f62aa13af4525e5e98548612bc15171cbc01c784e7be55f73d704c7840164889`.
- Runtime manifest digest: `a4448f85fc219f8535a6dafca8cfe1f8ba7963a3219ef1a0f00f8f14e30079be`.
- Reusing that exact installed wheel, `verify-unchain-artifact.mjs --installed true` passed; see `phase2-wheel-verification.log`.
- Actual pinned producer + actual V4 sidecar + actual replay projector + current TraceChain controls passed **5/5**; see `phase2-v4-producer-ui.log` and refreshed `ui-evidence.json` in `/workspace/shared/pupu-383-producer`.
- The wheel remains at `/workspace/shared/pupu-383-producer/artifact/unchain-0.2.0-py3-none-any.whl`. Its recoverable branch backup is commit `918212672dd7202f9a918325cc6458378ecd2b12`. A separate fresh clone fetched that commit without local alternates and verified the recovered wheel bytes against the SHA above. The binary and generated backup README are removed from the final tree; do not rebuild the wheel.
- Actual V4 fixture has no observation frames because the real V4 route drops raw batch observations. Actual V2 frames preserve the two call-id-less batch observations; the current renderer proves grouping without inventing per-call ownership.
- The producer path used deterministic fake model requests and in-memory fixture tools. Full Agent assembly, provider HTTP adapters, persistent production-turn ownership, and live provider acceptance remain mocked/not tested; this evidence is not release or live-provider qualification.

## Aggregate suite classification

The final reviewer independently reran `CI=true npm run test:frontend -- --runInBand` on frozen source commit `0eb843fe2312f0e5e4ba6edd98cb8056e9bfe40e`: **445/447 suites passed, 5,375 tests passed, 38 failed, 5 skipped (5,418 total)**. The 38 failed assertion names exactly match the immutable original-dev baseline; see `final-frontend-summary.json`. All failures are confined to these two unrelated Electron suites:

- `src/electron/tests/main/memory_vault_service.test.js`: 19 failures.
- `src/electron/tests/main/memory_vault_use_state.test.js`: 19 failures.

Thirty-seven of 38 failed assertions explicitly report `[secret_storage_unavailable] encrypted secret storage is unavailable on this machine`; the remaining assertion expected one `encryptString` call but observed zero in the same fail-closed context. Both suites were rerun with the same runner in immutable archives of the original `dev` commit `0047d58d0369d5c245a3fd8021d4d97c3e3f9a35` and `9b9b1e8`; each reproduced **2 suites failed, 38 failed, 19 passed**. See `phase2-original-dev-vault-baseline.txt` for exact paths, hashes, and failure classification. The relevant service and test sources are byte-identical between original `dev` and the final candidate. No encryption/platform-capability workaround or scope expansion was attempted.

## Build and browser verification

The default build is **NOT PASS**: an instrumented `PUPU_BUILD_VERSION=0.1.12 npm run build:web` captured a `SIGKILL` child with no artifacts even though the existing wrapper reported exit 0. OOM was not established. The final reviewer then ran a resource-bounded **CI=true** build on the unchanged final source: **PASS**, actual child status 0 / signal null, complete successful footer, `build/index.html`, 72 JS assets and feature snapshot present. Supported environment flags cap the heap at 1536 MB, disable source maps and pin CPU affinity 0; the tiny out-of-repo diagnostic preload only records child status. The two missing memo dependency warnings were corrected in commit `0eb843fe2312f0e5e4ba6edd98cb8056e9bfe40e`, and no lint warning remains. See `final-acceptance.md`, `final-ci-build.log`, `final-ci-build-child.jsonl` and `final-ci-build-artifacts.json`.

Actual browser QA is **NOT_RUN**. The cloud browser returned `ERR_BLOCKED_BY_CLIENT` for localhost; no alternate network probing was attempted.

## Graph risk record

The fresh scoped GraphNexus check reports HIGH for TraceChain/timelineItems and 12 inferred flows; TraceChain symbol impact remains UNKNOWN because JSX callers are unresolved. Text search corroborated the four actual consumers. Outputs are preserved in `phase2-scope-guard-graph.txt`, `phase2-final-detect-changes.txt`, and `phase2-truncation-impact.txt`; this warning is not a low-risk waiver and no unrelated graph repair was attempted.
