# Refresh ASAR identity after native restart update

Status: implemented locally; isolated regressions PASS; native hosted verification
NOT_RUN.

## Failure evidence and scope

Qualification 35418064043 / macOS arm64 job 105830924248, tools
`v0.1.11-tools.2` at `69055b986e98ccf5cce75c36e2edd99b43050e3c`, reached
`relaunched-identity` after observing the real PuPu root and packaged Sidecar.
`assertSnapshot` parsed SVG bytes as JSON. The installed `@electron/asar` library
caches headers/file offsets by archive path, while each extract opens the current
file. Native replacement at that same path therefore combines the old header
with new archive bytes. A real two-archive reproduction using `inspectResources`
fails before cache invalidation and matches all Candidate hashes after it.
Windows currently clears this cache in its separate Sidecar identity verification;
the common snapshot reader must not depend on that platform-specific side effect.

Only qualification tooling changes. Product `v0.1.11` at
`f6b654a6d87857cfc54a2712ae7f7bb1796c683a`, retained Candidate `35299965095`,
and N-1 `v0.1.10` at `020d898de56d1cdebafb136f6176c4d10bbfdcf8` stay unchanged.
No workflow dispatch, tag mutation, commit, push or PR is part of this fix step.

## BC-001 — on-disk ASAR generation to snapshot and identity checks

Producer: the signed updater replaces the installed archive. Consumer:
`inspectResources` / `assertSnapshot`, followed by `assertUpdatedIdentity`.
Boundary: persistent `app.asar` bytes versus in-process library metadata.
The canonical identity is the exact Candidate executable, ASAR, Sidecar and
snapshot SHA-256 plus snapshot fingerprint; a pathname alone is not a generation.

Admission: CLOSED for Candidate identity. Clear only the archive path being read,
then extract current `build/build_feature_flags.json`; retain existing enabled
Memory V2 / fingerprint validation and all exact hash comparisons. Snapshot field
extensions remain as before; this patch does not change its schema or allowlist.
Missing/corrupt snapshots, invalid fingerprints, disabled Memory V2 and different
Candidate bytes fail closed. No retry, fallback to old data, re-signing or relaxed
hash comparison. Other cached archives are not globally invalidated.

## SEQ-001 — same path, different package generation

Identity key: installed path + exact Candidate hashes, not path alone.
Start with N-1, inspect once (warming the library cache), replace the ASAR with N
at the same path, then run the production identity comparator. It must read N's
header/offsets and match the current Candidate. Repeated inspection must remain
stable. Replacing N with N-1 at the same path must expose N-1, not stale N data.
Corrupt replacement or wrong Candidate must still fail at snapshot/identity gates.
Maps to BC-001 and AC-001 through AC-003 below.

## Acceptance

- AC-001: real `asar.createPackage` producer → real `inspectResources` consumer
  → unchanged production `assertUpdatedIdentity`. Save red-before-green evidence
  with deliberately different archive offsets. Repeat and reverse-replacement
  coverage. No application/Sidecar/model or installer runs locally.
- AC-002: real malformed/missing/disabled/invalid-fingerprint snapshots fail;
  valid snapshot in wrong ASAR, wrong executable or wrong Sidecar still fail the
  exact production Candidate comparator.
- AC-003: common installed/restart qualification, Windows identity, report,
  receipt, signing and workflow regressions stay green.
- AC-004: the actual signed N-1 fixture → retained Candidate pair on native
  hosted macOS arm64/x64 remains NOT_RUN for this patch. Requires reviewed/merged
  tools and a newly authorized immutable tools tag + Qualification; never move
  tools.2. No new product Candidate or Release QA is needed for this tools fix.

Chat/interaction/provider/runtime-protocol state matrices: NOT_APPLICABLE; only
the external test-process archive reader changes, not application behavior.
Actual release acceptance stays INCOMPLETE until AC-004 is observed.

## Impact review

Repository/worktree: `/Users/red/Desktop/GITRepo/PuPu`, index refreshed at
`69055b986e98ccf5cce75c36e2edd99b43050e3c`. GitNexus upstream impact reports
CRITICAL (warning given before edits). Direct caller is `inspectResources`;
second-level callers include all four installer adapters and the restart identity
check. Full-text indexing failed, so empty search results were not treated as
evidence of no usage; exact-symbol context, graph impact and source imports were
reviewed. Preserve shared consumers and regression-test them.

## Local verification

- Nine real-ASAR regressions: before the fix, 3 passed / 6 failed; after the fix,
  all 9 passed. Production change is one path-scoped `asar.uncache` call before
  snapshot extraction, with no other admission or updater changes.
- Broader installed/restart/release/signing/Windows-Sidecar-identity suite:
  **279 tests, 276 passed, 3 Windows-native skips, 0 failures**. Skips are the
  native 8.3-path probe and two native Windows window/shutdown probes.
- `git diff --check` passed. Tests used inert synthetic archives and byte files;
  no local app, model, installer or Sidecar process ran.
- Initial final graph-diff output omitted the changed production function and
  was not accepted as a low-risk/no-impact result. A full index rebuild followed
  by `detect_changes(scope=all)` includes all 3 files / 23 symbols, including
  `assertSnapshot`, with no partial/truncated flag. Its direct changed-flow
  summary is LOW / zero flows, which does not override the pre-edit upstream
  CRITICAL assessment or the shared callers confirmed in source. Temporary-index
  analysis did not stage files in the user's actual Git index.
