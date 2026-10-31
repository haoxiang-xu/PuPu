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

The first Host/installed-wheel check exposed a real integration error: Skeleton
completion still used the old attachment return value and omitted the completion
recorder required by current dev. Ten existing completion/recovery tests failed;
after unpacking and passing the recorder, the same 75-test suite passes, including
the unchanged ordinary graph-completion controls. Root acknowledgement remains
after the existing memory enqueue audit.

The bounded installed-wheel resource/condition/selection rerun passes 267 tests
and 193 subtests. Eighteen cases are explicitly deselected as whole named test
groups: ten are blocked by the offline OS policy preventing the system ps
operation, and eight are associated v3 route controls. They are not counted in
that passing rerun. The first runner also omitted PYTHONPATH needed by
four cold-source subprocesses; the corrected runner exports only this Host's
server and the installed wheel. All 333 imported Core modules are inside that
wheel installation, and all 377 wheel Python members match source. Main/preload
checks pass 165 tests across 11 suites using the repository's actual Jest entry.

The reused wheel is `4169aca0408ac88bd56369d94b3c728db1def61212014143c7571be4fa98a2f6`.
The runtime dependency PR is haoxiang-xu/unchain#66. Its follow-up fixture-import
fix changes tests only; production module bytes still match this same wheel.
The available offline environment has five versions below current dev floors;
dependency-check failure is retained and does not become package qualification.

The Release QA entrypoint's five default source selections are pinned together
to runtime PR #66 head `6a1cb5944d7022a06c28899553d0f004067491ca`. The previous
`e01b4fc6` remains an ancestor of this integrated runtime; using it directly would
omit Skeleton. Existing explicit operator input, read-only cache authority,
single-wheel continuity, signing conditions and publication gates are unchanged.
The actual imported manifest is
`sha256:ec8741b2425ef3d07578fff9508bd3be6dfd5804210068597ddd673e287b6330`.
This pin does not authorize launching a release or publishing an artifact.

## Complete-CI correction and bounded execution

The first Host full run on `0fe1d7be` passed 506 frontend suites (8347 tests)
and 67 Electron suites (1166 tests). Its Python phase did not pass: the step's
`continue-on-error` conclusion obscured an actual ten-minute timeout at 66%.
The aggregate gate correctly rejected that run. The raw log, including the
timeout, is retained under `~/.codex/artifacts/pupu-351/ci-02-20261030/`.

The Python phase now has a twenty-minute hard limit inside the unchanged
forty-five-minute job limit. Verbose case names, the slowest durations and
sixty-second stack diagnostics make an actual stall identifiable. `pipefail`,
failure outcomes, always-uploaded logs and the final rejection gate are kept.
The release lifecycle and seven related workflow files pass 23 offline checks.

Runtime PR #66 head `555f9fecc5a805e24c00d3cfd3fc10c216cdc1eb` passes its
complete Linux suite: 5519 passed, 17 skipped, five xfailed. CodeQL analysis also
completed; its findings are reviewed separately rather than inferred absent.
The Host entrypoint now pins that source. A newly built wheel is reused for
this stage: `b963ec5dd7a0c6b491eb8038a4de24290d0b023d6fc0656726c5fbcf0afe0874`
(1352413 bytes, 377 Python members equal to source). Its imported manifest stays
`sha256:ec8741b2425ef3d07578fff9508bd3be6dfd5804210068597ddd673e287b6330`.
The installed-wheel Host run passes 341 tests and 213 subtests, explicitly
deselects ten known process-identity cases, and encounters two more blocked
legacy graph cases at the same OS ps restriction. That bounded run is not a full
environment or App PASS.

## BC-351-D03 — declared dependency compatibility

Producer: Core's built-wheel Requires-Dist metadata. Consumer: the Host's pinned
requirements and build installer. Canonical form: normalized package names and
PEP 508 version constraints; admission requires a nonempty compatible selection.
No version conflict may be hidden by `--no-deps` or counted passing because the
runtime protocol manifest is well formed. AC-351-D04: compare the actual metadata
and pins, then verify the resolved CI environment and imported artifact identity.
This is a build-time boundary; durable execution sequences remain SEQ-351-D01.

The current declared conflict is explicit: Host pins Anthropic 0.83.0 while Core
requires >=0.87.0; Host pins cryptography 50.0.2 while Core requires >=48.0.1,<49.
Core's upper bound explicitly retains Intel macOS and 32-bit Windows support.
The maintainer selected preservation of Intel macOS / 32-bit Windows and Core's
already recorded legacy-platform exception on 2026-10-30. Accordingly, Host pins
cryptography 48.0.1 and Anthropic 0.87.0. This keeps Core's current supported range;
it does not claim the deferred upstream cryptography advisories are fixed. The
Anthropic version is an existing official release, independently checked against
its published v0.87.0 tag. Core's compatibility policy itself is unchanged.

CI and both sidecar builders now resolve dependency metadata from the same
immutable wheel under the Host constraints, then run `pip check` before artifact
verification. The build-time skip-install option cannot skip that validation.
Three added checks first fail on the previous scripts: the real workflow shell
with substituted executables must stop on a failed dependency check, must proceed
on a successful check, and both builders must resolve/check before verification.
Those shell-wiring tests substitute executables only. Runtime/Store checks use
the real installed wheel with their existing offline SDK substitutes.
Actual dependency-environment acceptance still requires the fresh CI result; the
older local cached environment is not labelled fully qualified.
