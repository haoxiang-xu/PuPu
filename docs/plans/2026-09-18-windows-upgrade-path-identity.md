# Windows restart qualification: canonical process paths

## Evidence and scope

Diagnostic run 35314008246 used tools 8b7b71cb4944b07b2e219ebf93588fdc1224280e,
retained Candidate 35299965095 / v0.1.11 at
f6b654a6d87857cfc54a2712ae7f7bb1796c683a, and fixture v0.1.10 at
020d898de56d1cdebafb136f6176c4d10bbfdcf8. Azure signing succeeded.
Artifact 10535745719 records old PID 3064 exiting and new PuPu PID 9072
appearing with --updated; its window was responding. The old path contained
C:\Users\RUNNER~1, the new image path C:\Users\runneradmin. The production
command-substring matcher rejected this new process until its deadline.
The same mismatch excluded it from private-directory cleanup, which hit EBUSY.

Change only the qualification harness and tests. Do not change product updater
behavior, candidate files, version/tag, signing rules, timeouts, or publication.
This evidence does not yet prove the final N hashes or retained settings passed.

## BC-PATH-001: native process image to qualification identity

Producer: Windows CIM Win32_Process ExecutablePath plus installed artifact paths.
Consumer: fixture Sidecar readiness, new PuPu discovery, new Sidecar readiness,
and private-installation cleanup. OPEN process rows may carry extra telemetry;
admission of a new owned image is CLOSED. Missing/unresolvable image paths add
no ownership. Never infer ownership from process name or command arguments.

Canonical representation: resolve each existing path using native filesystem
realpath, normalize namespace prefixes, separators and Windows case. Do not
hard-code account names or replace 8.3 text heuristically. PuPu/Sidecar readiness
requires exact canonical executable equality; Sidecar also requires ancestry.
Cleanup requires canonical containment within this run's private directory with
a separator boundary, or ownership already acquired by this run. Drive/share
roots, sibling directories and unrelated PIDs cannot gain ownership. Protected
harness/parent PIDs and existing tree termination rules remain unchanged.
Filesystem resolution failures fail closed for newly observed ownership while
preserving the existing lifecycle failure and known-process cleanup.

## SEQ-PATH-001 / acceptance

Sequence: install exact pair → short-path fixture launch → download N → old tree
exits → native installer relaunches long-path PuPu → descendant Sidecar → exact
N identity hashes → retained-settings sentinel → controlled shutdown / cleanup.
No extra installation, manual app restart or retry is introduced. Subsequent
attempts use fresh hosted runner state, never the developer's PuPu profile.

- AC-PATH-001: replay minimal actual-run process records through real matcher,
  Sidecar and cleanup functions. Four tests fail on the old implementation and
  pass after the fix, including command-argument false-positive rejection.
- AC-PATH-002: negative cases cover inaccessible/missing paths, unrelated images,
  sibling directories, old PID, wrong Sidecar parent, helper-only process,
  drive-root cleanup, extended/UNC namespaces, and preserved known ownership.
- AC-PATH-003: execute the complete production lifecycle with mocked OS
  boundaries and strict final report validation. Cover long-path restart,
  candidate identity mismatch remaining fatal, and cleanup before discovery.
- AC-PATH-004: native Windows-only test creates non-executable placeholder files,
  obtains a real 8.3 path and exercises native realpath; no PuPu/model is launched.
  Hosted end-to-end Windows diagnostic with the exact retained pair is NOT_RUN.

Chat/provider/replay contract matrices are N/A: no app/runtime implementation,
provider calls or persistent conversation state changes. Installed pair identity
and settings retention remain required by the existing strict qualification.

## Verification and handoff

Local release suite: 337 tests, 334 passed, 0 failed, 3 skipped (two existing
environment gates plus the native Windows-only test on macOS). Syntax and
whitespace checks pass. No app, local model, installer or signing operation ran
on the developer machine.

GitNexus repository/worktree: /Users/red/Desktop/GITRepo/PuPu; refreshed at
8b7b71cb. Exact core-symbol upstream impact is LOW, reaching the shared restart
runner and independent diagnostic wrapper. Test harness callers are UNKNOWN in
the graph and checked against source/test execution. Index generation reports
flow-budget omissions, so graph analysis is not exhaustive acceptance evidence.

After review/merge into dev, keep Candidate 35299965095 and both tags unchanged.
Start only a fresh windows-diagnostic run after explicit owner confirmation.
Native upgrade validation remains INCOMPLETE until hosted evidence is accepted.
Diagnostic success alone is not a formal release qualification seal.
