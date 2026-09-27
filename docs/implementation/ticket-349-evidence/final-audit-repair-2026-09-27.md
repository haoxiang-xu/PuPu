# Ticket #349 final-audit repair — 2026-09-27

Status: **local repaired-pair audit PASS; corrected-pair Release QA PASS;
final feature audit pending**.
This report is the authoritative artifact and correctness addendum to the
[historical closeout report](closeout-report-2026-09-27.md).

## Candidate identity

- PuPu product repair: `8622ad2fe899ec80c266d889e57b348f00c3b28d`
  ([PR #361](https://github.com/haoxiang-xu/PuPu/pull/361)).
- PuPu Release QA pin repair: `c6a1a4b291cf95fd9549067040631e75eef2f79a`
  on the same PR.
- Unchain repair: `93e97c0a9239488ea0dc9379335aa8cb73d95815`
  ([PR #40](https://github.com/haoxiang-xu/unchain/pull/40)).
- Wheel: `unchain-0.2.0-py3-none-any.whl`,
  `sha256:d6cbdeb02c1b75cf711631b09e5b6a417077c4636b46658136ccd893565a5bf0`.
- Imported runtime manifest:
  `sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e`.
- The wheel was built once from a clean Unchain tree and installed into the
  isolated PuPu runtime used for exact-pair tests and sidecar freezing.

The first CI run for the repaired PuPu code was not admissible evidence: the
caller workflow still selected the prior Unchain `063c8f25...` and built wheel
`sha256:009f...`, reproducing the old URI failure. The five default pin sites in
`.github/workflows/release-qa.yml` now select `93e97c0...`.

Corrected-pair [Release QA run 36343756372](https://github.com/haoxiang-xu/PuPu/actions/runs/36343756372)
passed on PuPu `c6a1a4b291cf95fd9549067040631e75eef2f79a` and Unchain
`93e97c0a9239488ea0dc9379335aa8cb73d95815`. Deterministic QA, the Context V2
and RunBundle gates, Electron Playwright, and the final report all passed. The
CI backend result was 2,601 passed, 18 skipped and one known warning.

CI built its own Linux wheel once (`sha256:3f8c667a8874d221db423dcd0e0bc3c87d702f271d0dc3d569a9bd735c37cf2a`)
and every downstream CI job used those bytes. That hash differs from the local
fixed wheel because the builds were separate; each chain preserves its own
artifact continuity. Both report the same source revision and runtime manifest.

## Audit findings repaired

1. Populated `memory_list` and `memory_search` results now project the official
   `MemoryEntry` shape, expose the canonical `entry_ref`, hide `content_ref`,
   and require the exact current revision before a read or mutation.
2. Checkpoint reuse accepts only compiler-owned namespaces and verified
   operation claims. Host-authored and legacy plaintext checkpoints are skipped
   without parsing their payload as compiler state.
3. Renderer memory-job updates are monotonic by revision and status rank; a
   terminal state cannot regress when a slower pending response arrives later.
4. Legacy nested job rows are canonicalized and merged by the real job identity,
   preserving the correct root-run binding during discovery and polling.

## Deterministic verification

| Layer | Result |
|---|---:|
| Unchain full suite | 3,785 passed, 16 skipped, 5 xfailed |
| Installed exact-wheel Context + Memory suites | 1,907 passed, 1 skipped, 5 xfailed |
| Focused PuPu repair tests | 22 passed |
| Full PuPu server against the installed wheel | 2,602 passed, 17 skipped, 3,590 subtests passed |
| PuPu renderer | 43 suites, 351 tests passed |
| Frozen arm64 sidecar package smoke | 5/5 checks passed |
| Release-workflow structure tests after pin repair | 26 passed |

The server suite retains two known warnings: the intentional invalid-signature
serializer fixture and one graph-test cleanup thread without
`UNCHAIN_DATA_DIR`. Renderer output retains two pre-existing React `act`
warnings. None was converted into a pass or omitted from the result.

The exact-wheel restart coverage includes cold apply replay with the same
workspace effect, FTS/description search after restart, and memory
create/update/move/archive/history persistence across restart.

## Live exact-wheel desktop verification

An isolated Electron profile configured for the rebuilt sidecar and GPT-4.1 used chat
`chat-1790536164171-fc2fc185c146f`. The three completed turns took 3,806 ms,
5,905 ms and 10,212 ms. This was a functional flow, not a matched latency A/B.
The harness recorded the selected source identities; the frozen binary, feature
snapshot and package smoke are bound independently in the identity receipt. A
runtime-status capture from the live process was not retained, so the live result
alone is not used as proof of the binary hash.

Before restart, the run completed:

1. one authorized memory proposal;
2. durable background-job completion and candidate application;
3. a fresh `memory_list` call;
4. a fresh `memory_search` call for `amber harbor 349`;
5. a fresh `memory_read` call.

List and search returned the same canonical reference:

`pupu://memory/space-chat-81121f0523a4948fec0a18604b4577c9383be627/memory-95182ca840e169d4c8d11513b12b4346@1`

Neither list nor search exposed `content_ref`. Read returned exactly
`Synthetic verification marker: amber harbor 349.` The durable tool order was
`memory_list`, `memory_search`, `memory_read`.

The desktop process was then fully stopped and restarted with the same isolated
profile. One new `memory_list` tool result was durably recorded at store sequence
112 and returned the same canonical reference without `content_ref`.

The requested post-restart search/read prompts did not cause new tool calls: the
model answered from prior durable tool history. The harness rejected that model
behavior. Therefore fresh live post-restart search and read are
**NOT_RUN / NOT_EVIDENCED**; only the fresh post-restart list is live evidence.
The deterministic exact-wheel restart tests above cover the remaining persisted
search/read behavior without overstating the desktop observation.
The evidence field `restart_phase_completed: false` means the requested complete
post-restart list → search → read phase did not finish; it does not mean the
desktop process itself failed to restart.

After verification, chat deletion left scoped counts of zero for events,
candidates, jobs and spaces. Both isolated profiles containing copied encrypted
provider settings were removed. No credential or private prompt is stored in
this evidence bundle.

## Durable evidence

- [Candidate, wheel, feature snapshot and frozen-sidecar identity](final-audit-repair-identity-2026-09-27.json)
- [Final test-result ledger](final-audit-repair-test-results-2026-09-27.json)
- [Built artifact identity](final-audit-repair-artifact-2026-09-27.json)
- [Frozen feature snapshot](final-audit-repair-feature-snapshot-2026-09-27.json)
- [Frozen sidecar smoke](final-audit-repair-package-smoke-2026-09-27.json)
- [Live flow](final-audit-repair-live-2026-09-27.json)
- [Cold-restart observation and explicit limit](final-audit-repair-restart-observation-2026-09-27.json)
- [Cleanup result](final-audit-repair-cleanup-2026-09-27.json)

## Latency claim boundary

This repair establishes correctness and artifact continuity. It adds no new
speedup claim. Earlier timing cells overlap and cannot be summed. The original
6.047-second pre-run gap remains unattributed, and no matched old-versus-new
full-app TTFT or completion benchmark was run on this repaired wheel.

Final transition to In Review requires a fresh feature audit bound to the
corrected-pair run and the final documentation-only PR head. No merge, release
rollout or signed installer is claimed here.
