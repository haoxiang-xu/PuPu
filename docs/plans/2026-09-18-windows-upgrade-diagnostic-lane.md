# Windows upgrade diagnostic lane

## Scope and immutable identities

Investigate qualification 35303308744, which passed four fresh installations and
old-process/browser teardown but timed out finding the restarted Windows app.
Candidate 35299965095 is bound to v0.1.11 at
f6b654a6d87857cfc54a2712ae7f7bb1796c683a; source fixture v0.1.10 is at
020d898de56d1cdebafb136f6176c4d10bbfdcf8. Do not move either tag or rebuild N.
There is insufficient evidence to declare installer failure versus path-matching
failure. In particular, filtered processes=[] is not evidence of no installer.

## BC-DIAG-001 / SEQ-DIAG-001: tools versus candidate identity

Producer: manually dispatched Windows Signing Qualification in refs/heads/dev.
Consumer: a separate diagnostic-only Windows reusable job. Admission is CLOSED:
explicit DIAGNOSE_WINDOWS_UPGRADE confirmation, positive candidate run ID,
stable release/from tags, lower from version, exact resolved tag commits, exact
successful candidate provenance, retained manifest/hash verification. Tools are
checked out at github.sha, not a mutable branch head; their commit is recorded
separately from candidate/fixture commits. Existing formal qualification remains
unchanged. The existing windows-signing-qualification environment and reviewer
are retained; no environment permission changes or approvals are performed.

Sequence: protected dev dispatch → verify exact candidate/fixture identity →
build/sign only the immutable N-1 fixture → one upgrade against retained N →
upload diagnostic-only artifacts even on failure. No Release QA, N packaging,
macOS/Linux jobs, release receipt, tag mutation or publication. Repeat requires
a fresh hosted runner/profile and fresh user dispatch; no automatic installer
replay or broad process termination. The fixture signing build cannot currently
be omitted because the previous run retained evidence, not its signed installer.

AC-DIAG-001: parse actual workflow producers and execute operator/identity
validators; reject invalid refs, confirmation, tags, commits/run provenance.
AC-DIAG-002: diagnostic outputs use their own schema/artifact name and cannot be
accepted by the strict formal receipt consumer. Default signing mode is intact.

## BC-DIAG-002: Windows observations to bounded diagnostics

Producer: actual Windows process inventory and read-only post-failure OS probes;
consumer: additive OPEN diagnostic fields. Process identity is PID plus creation
time where available; include name/executable path/parent/session and bounded,
redacted command text. Capture related installer/cache/temp-uninstaller processes
outside the initial app tree plus possible PuPu relaunches (including path aliases).
These extra observations never expand cleanup ownership or prove qualification.
Preserve a bounded timeline and pre-cleanup evidence; errors collecting diagnostics
are secondary and cannot replace the upgrade failure or skip cleanup.

The failure handler captures window titles and bounded child-dialog text, recent
application errors and installation-directory metadata before runner teardown.
Do not dump environments, credentials, arbitrary files, or all process arguments.
Installer exit codes not actually observed remain unknown. No fake pass or silent
fallback is permitted. Retained artifact scans reject secret material.

AC-DIAG-003: RED/GREEN tests exercise the production lifecycle with detached
installer/long-path processes: evidence survives cleanup but unrelated PIDs are
not killed. Snapshot count/field sizes are bounded and secrets redacted.
AC-DIAG-004: observation failures preserve the first failure; the strict existing
success consumer and all process/identity/settings guards remain unchanged.

Chat/provider/durable-conversation matrices are N/A: only release harness and
workflow orchestration change. Exact hosted pair validation is NOT_RUN until the
diagnostic lane runs. Its result is not a formal release GO or qualification seal.
GitNexus in /Users/red/Desktop/GITRepo/PuPu has known mismatched symbol IDs and
CRITICAL results; graph acceptance remains unresolved, not silently waived.

## Operator handoff

The existing Windows Signing Qualification dispatcher is already on the default
branch. Merge these tool changes into dev; keep v0.1.11 at f6b654a6 and retain
Candidate 35299965095. Do not rebuild the tag or start another Candidate.
The isolated signing environment already permits only dev and requires the
project owner's review. No GitHub settings changes are needed.

Prepare with:

```sh
node scripts/release-qa/release-operator.mjs plan --phase windows-diagnostic --repo haoxiang-xu/PuPu --tag v0.1.11 --candidate-run-id 35299965095 --from-tag v0.1.10
```

After confirming the exact merged dev tools SHA and receiving the separate
START_WINDOWS_DIAGNOSTIC instruction, dispatch the same tuple with
`--confirm START_WINDOWS_DIAGNOSTIC`. Observe the exact returned run ID with
`--phase windows-diagnostic --tag v0.1.11 --commit <tools-sha>`; that SHA describes
tools, never the candidate. Output explicitly says diagnostic_only. The run is
not usable as a formal qualification run ID for Stage.

Implementation intentionally leaves path matching and product update behavior
unchanged: there is not yet enough evidence to justify changing either. Process
timeline observations are not cleanup ownership. Installer exit codes not
observed remain unknown, rather than being inferred from process disappearance.

## Local verification

- RED: three diagnostic-lane tests failed on the old implementation; two new
  complete-lifecycle observation cases failed while all 34 old cases passed.
- GREEN: full release unit suite has 325 tests, 323 passed, zero failed, two
  existing environment skips. Tests execute the actual operator projection and
  dispatch producer against a strict fake GitHub runner, the real diagnostic
  wrapper against the strict formal report consumer, actual YAML admission shell
  with negative input, and the production lifecycle against mocked OS boundaries.
- Fixture signing/path/sealing steps and retained candidate verification are
  compared directly with the formal workflow. Upload paths match the secret
  scanner allowlist. Formal qualification YAML files have no changes.
- No PuPu app, browser, local model, Windows installer or live signing operation
  was started locally. Native Windows CIM/User32/EventLog collection is NOT_RUN
  on this macOS host; JavaScript producer/consumer boundaries are unit-tested.
- Syntax checks and git diff --check pass. Pre-commit GitNexus detect-changes
  covers all 12 staged files and reports 13 indexed symbols / CRITICAL / 671
  affected processes with the known incorrect symbol associations. Newly added
  symbols are not yet represented in the index. This is not claimed as clean
  graph acceptance. No dispatch, tag rebuild or environment setting change has
  been performed during implementation or PR preparation.
