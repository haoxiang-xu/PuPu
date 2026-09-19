# macOS restart qualification identity correction

Status: implemented locally; isolated regression PASS; native hosted acceptance
NOT_RUN. Product and Candidate
remain unchanged. No workflow dispatch, tag change, commit or PR is part of this
implementation step.

## Evidence and scope

Run 35403504906, tools v0.1.11-tools.1 at
ff16406d7e4946a4a94d240dd29928cafd992137, failed both macOS upgrade lanes at
`relaunched-sidecar`. Windows restart and all four fresh-install lanes passed.
Product v0.1.11 / f6b654a6d87857cfc54a2712ae7f7bb1796c683a and retained Candidate
35299965095 are not rebuilt. N-1 is v0.1.10 /
020d898de56d1cdebafb136f6176c4d10bbfdcf8.

The observed selected PIDs were ShipIt (arm64 53095, x64 95291), not the real
PuPu roots (53163 and 96609). Both real roots had packaged Sidecar descendants.
Recorded relaunch Helper arguments also switched from the temporary test profile
to `/Users/runner/Library/Application Support/PuPu`; checking the old sentinel
path alone would not prove settings retention by N.

## BC-001 — process table to restarted-root/Sidecar admission (CLOSED)

Producer: native process table. Consumer: restart executor. Identity: exact
installed executable path and its PID, followed by packaged Sidecar descendant.
Use filesystem-resolved macOS path aliases and an executable-position boundary,
not a bundle directory substring or a path mentioned in arguments. Unknown or
unresolvable images fail closed. ShipIt, Helpers, other installations and the
old root cannot qualify. Windows image identity remains unchanged.

AC-001: replay minimized real arm64/x64 failure sequence through the production
selector; ShipIt alone must remain pending, then accept only the real root.
AC-002: reject helper-only, sidecar-only, argument spoofing, sibling prefix,
unresolvable paths and unrelated Sidecar ancestry.

## BC-002 — N-1/Squirrel/N profile and persistence identity (CLOSED)

Producer: native runner user home and Electron renderer process arguments.
Consumer: launch plan, preflight and retained-settings check. On macOS use the
native default PuPu profile for both the initial launch and argument-free native
relaunch. Do not rely on a temporary HOME or a --user-data-dir argument surviving
Squirrel. Allow only a disposable GitHub-hosted runner and a nonexistent PuPu
profile; never use/delete an existing or symlinked profile. Seed the ordinary
auto-update preference before launch, then use the real updater bridge to set
and hash the sentinel. Confirm that the relaunched renderer belonging to the
exact new root uses that same profile before reading retained sentinel bytes.
Missing, conflicting or different profile evidence cannot pass. No signed app
patching, weakened target set or replacement of the native updater.

AC-003: native profile launch and local/self-hosted/existing/broken-symlink refusal.
AC-004: production profile check rejects the old temporary-vs-default split even
if the old file still exists; only a renderer under the new root can prove use.
AC-005: full Windows regression, exact Candidate hashes, duplicate install guard,
old process cleanup and normal final shutdown remain enforced.

## SEQ-001 — update, relaunch, profile proof, settings retention

Identity: candidate digest + fixture source + installed root + native profile.
Start fresh; create profile exclusively and seed preferences; launch N-1; verify
profile; update exactly once (duplicate request rejected); observe N-1 exit;
ignore ShipIt; observe exact N root and Sidecar; verify N hashes; prove renderer
uses the same native profile; compare sentinel bytes; normal shutdown and cleanup.
No installer replay or fresh launch may substitute for native update. A failed
attempt emits no passing receipt. A workflow retry uses a fresh hosted runner;
an existing profile on the current runner fails closed, not reset or reused.
Maps to BC-001/002 and AC-001..005.

Chat/interaction/graph/provider matrices: N/A (no application/runtime changes).
Exact deployed N-1 fixture to retained N Candidate: NOT_RUN until reviewed tools
are merged/frozen under a new tag and a separately authorized Qualification runs.
The prior failed run is not success evidence. No local application/model runs.

## Local verification — 2026-09-18

- Red/green: first three regressions failed against the original implementation
  (ShipIt admitted as root; temporary initial profile), then passed after correction.
- Fifteen new tests exercise both architecture process sequences, exact executable
  matching, unrelated Sidecar ancestry, native-home selection, local/self-hosted
  refusal, existing/symlink profile refusal, renderer ancestry and missing/duplicate/
  wrong profile arguments. The actual production orchestrator is exercised with
  isolated OS/artifact/UI boundaries, including refusal before reading stale
  sentinel bytes. These mocks are not native upgrade acceptance.
- Replayed the full downloaded failure process snapshots through the new matching
  and profile functions (filesystem alias resolution simulated, not local runner
  filesystem): arm64 admits only root 53163 / renderer 53245; x64 only root 96609 /
  renderer 96776. Both prove the native default profile and reject the previous
  temporary sentinel profile.
- Broader release/qualification regression run twice: **254 tests, 251 passed,
  3 platform-dependent skips, zero failures**. Includes Windows lifecycle, browser
  recovery, diagnostic, cleanup, feed, signing, manifest, receipt and workflow
  contracts. `git diff --check` passes.
- GitNexus refreshed on this branch. Exact upstream impacts for the five modified
  production entry functions are LOW. File-level test impact was UNKNOWN; source
  inspection confirmed the changed assertion is test-only, not a production entry.
- Full `detect_changes(scope=all)` included all five files through an isolated
  temporary Git index, without staging the user's real index: 127 symbols,
  71 affected flows, aggregate **CRITICAL**, no partial/truncated result. Warning
  surfaced to the owner. Of those flows, 63 are associated with the new test
  sandbox's generic `error` member and 8 with `runRestartUpdateQualification`.
  Exact-symbol rechecks and import review bound production changes to the restart
  executor/helper; the Windows diagnostic also consumes this executor via a
  default function argument, so its regression is included despite no direct
  caller edge. Do not equate this graph result or the local tests with hosted PASS.

Next: review/commit/merge this tools-only fix; freeze a **new** tools tag rather
than moving `v0.1.11-tools.1`; run separately authorized Qualification against the
same retained Candidate. No product tag, Release QA or Candidate rebuild is
required by this patch. Hosted macOS arm64/x64 N-1→N evidence remains NOT_RUN.
