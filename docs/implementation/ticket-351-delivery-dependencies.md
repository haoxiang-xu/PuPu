# #351 delivery dependencies

Owner instruction, 2026-10-30: resolve delivery dependencies, close #351, then
move to the next ticket. No new feature or release-scope change is authorized.
Frozen candidates and evidence remain read-only. Model/provider calls stay off.
One heavy local job runs at a time on the 18 GiB host.

## Delivery order

1. Retain and integrate the reviewed Skeleton runtime foundation in an independent
   Unchain delivery branch based on current remote dev `d2aa98f5`, preserving its
   security floors, history compression and terminal audit behavior. Frozen
   runtime source `09eec580` is the input, not the final delivery artifact.
2. Deliver the shared PuPu foundation from frozen `e24e993f` onto current remote
   dev `702dc830`. Preserve current modal controls, Stop settlement and memory
   curator provenance. This dependency PR does not close #341 or #356.
3. Carry the reviewed native-authoring prerequisite `a61d52b2…` and the separate
   25-path Branch delta `81d2b7a0…`, then complete #351's own acceptance and audit.
   No #357 import or later advanced-node UI is included.

Each dependency is explicit in the PRs. An unmerged checkpoint is not delivered;
opening a PR alone does not close #351. Do not auto-merge or bypass protections.

## BC-351-D01 — source foundation and runtime artifact

Producer: the merged Unchain source; consumer: the PuPu Skeleton adapter, Store,
production bindings and graph runner. The boundary remains the existing CLOSED
runtime protocol manifest and resource/selection envelopes. A Git SHA is
provenance, not capability admission. The previous wheel `4e3efdc0…` / manifest
`f6daf389…` is historical evidence only; merging newer runtime changes requires
one newly built wheel reused across the new checks and its actual imported
manifest. Do not label source-only tests installed-pair or packaged qualification.

AC-351-D01: schema/condition/Journal/rebase source regressions; wheel member/source
equality and actual import identity; producer-to-consumer capability/resource
checks with the same new wheel. Preserve current dependency security floors.
If required dependencies are unavailable offline, report that cell explicitly;
do not downgrade constraints or download packages to make a check pass.

## BC-351-D02 — renderer, Main and Store

Producer: existing Skeleton resource HTTP responses; transport: Main/preload and
the strict API facade; consumers: the shared resource page and Branch editor.
No new endpoint or shape is invented for integration. Keep existing closed
keys, typed refusals, node paths, CAS and error/no-fallback behavior.

AC-351-D02: resource API/response/bridge regressions and the real page's Save/read
roundtrip. Preserve current session identity validation while supporting the
Skeleton interaction-source node identity; retain legacy graph-step metadata.

## SEQ-351-D01 — preserve current lifecycle behavior

Identity: chat/session, source/root/node attempt, interaction, selected Agent and
resource edit token. The merge must retain both current Stop settlement refs and
the frozen refusal-persistence hold; neither replaces the other. Same-chat
selection, outbox, stale responses and recovery are covered by existing targeted
regressions. No ordinary root completion is used as proof of a child/tool result.

AC-351-D03: pending/settlement, selection-window, refused-recovery and outbox
regressions; Main credential identity and transport regressions. Actual desktop,
cold process and real-provider evidence are not inferred from these source tests.

## Risk and validation

Fresh offline pre-edit analyses cover 114 PuPu and 117 Unchain file/symbol targets;
HIGH/CRITICAL results are disclosed, not waived through file/shared-axis LOWs.
UNKNOWNs are corroborated with source references. Whole-process discovery is
capped by GitNexus and remains a lower bound; do not describe it as exhaustive.
Run change analysis again before each commit.

The first integration checks are 443 Core tests and 241 tests across 12 renderer
suites, all passing. These are bounded source results, not full feature-audit or
release PASS. Further results, exact digests and remaining cells are recorded in
the PR and #351, with local raw logs under
`~/.codex/artifacts/pupu-351/close-01-20261030/`.
