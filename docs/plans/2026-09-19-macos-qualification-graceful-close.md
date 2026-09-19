# macOS Qualification: PID-bound graceful shutdown

## Scope and evidence

Run 35421642808 on tools.3 passed four fresh installs and Windows restart;
both macOS restart jobs reached `relaunched-shutdown` then exceeded 60 seconds.
New process, exact installed hashes, Sidecar ancestry, retained profile and
sentinel checks passed. The adapter ignored the supplied PID and sent JXA
`Application(bundlePath).quit()`. No receipt established the actual recipient.
The deployed v0.1.11 settings coordinator cancels an unanswered drain after
7 seconds. Neither a wrong recipient nor this cancellation is proven as the
specific cause of this run.

Bound repository: /Users/red/Desktop/GITRepo/PuPu, index d6d2c9b matching HEAD.
GitNexus upstream: installMacDmg LOW, six dependent symbols, fresh-install and
restart consumers; runRestartUpdateQualification LOW, two dependents. Source
review covers the returned close callback across the dynamic/native boundary.

Only qualification tools change. Product v0.1.11 f6b654a6d87857cfc54a2712ae7f7bb1796c683a
and Candidate 35299965095 remain unchanged. No tag, dispatch, publish or local
PuPu execution is authorized by this implementation step.

## BC-001: Node harness → JXA/AppKit → one application instance (CLOSED)

Producer: closeMacApplication, consumed by fixed MACOS_CLOSE_SCRIPT through
separate argv: PID, canonical bundle path, canonical executable path, pinned
start identity, action (`inspect` or `quit`). Paths are never code interpolation.
Native consumer resolves NSRunningApplication by PID, checks both file URLs
and start identity before calling normal terminate. It never launches an app,
addresses an app by name alone, uses a force-quit API, or overrides a veto.

Reverse wire is exact-key pupu.macos-close-observation.v1: schema, pid,
bundle_path, executable_path, started_at, finished_launching, request_sent,
accepted. Strict Node validator rejects unknown keys, wrong schema/identity,
PID reuse and impossible action/boolean combinations. Native errors and
uncertain timed-out requests fail closed, without automatic re-send.

Start identity prefers `launch-date:<seconds>`; when LaunchServices has no date
(observed on the local Finder through an inspect-only probe), use
`kernel-lstart:<LC_ALL=C ps lstart>`. Pin that source for the entire operation,
even if LaunchServices later supplies a date. Missing/malformed kernel output
fails. Kernel fallback has one-second resolution, not a microsecond identity:
it detects different-second PID reuse, not same-second same-image reuse.
The same NSRunningApplication object is retained within each native probe;
both paths and start identity are revalidated before any quit.

Admission uses exact owned process identity, not version guesses. An accepted
request is not exit evidence: existing independent process-exit check remains.
Readiness polls native finishedLaunching then settles for ten seconds under a
120-second total deadline. This is NOT renderer/quit-drain handshake proof.
The relaunched app loses the old CDP launch argument; we do not re-launch it,
modify Candidate bytes or falsely label process presence as JS readiness.

AC-001: real fixed JXA producer exercised with strict AppKit fake, then strict
Node consumer; negative identity/schema/unknown-field/launch-date tests.
AC-002: actual DMG adapter forwards PID and immutable path identity (red before
change: path-only quit invoked). No native call on invalid Node inputs.
AC-003: native-not-ready and settling transitions poll within deadline, a
ready instance gets exactly one normal quit, rejection/uncertain result fails.

## BC-002: harness → retained diagnostics (OPEN additive telemetry)

Existing diagnostics v1 allows additive platform telemetry. `macos_close`
holds bounded (128) validated observations plus action, attempt, elapsed_ms
and explicit limited-readiness label. Persist on success and before/after
failure cleanup. No secrets, application settings values or private payloads
are collected. The stdout tail still belongs to N-1; it does not prove the
relaunched app's internal cancellation reason. No fabricated cancellation code.

AC-004: integration coverage confirms observations survive failure/cleanup;
normal-exit proof is unchanged and cleanup cannot convert failure into pass.

## SEQ-001: installed N-1 → updated N → graceful exit

Identity key: root PID + pinned native/kernel start identity + canonical bundle/executable,
bound to existing exact Candidate hashes and wheel verification.
Sequence: N-1 exits → new root/hash/profile/Sidecar/sentinel gates → inspect
native launch → stable settling → revalidate identity → one quit → independent
exit check → report. Before sending, unready probes may repeat; ready-to-unready
resets settling. Once sent, do not repeat, force terminate, or relaunch.
PID reuse, rejection, exhausted budget and protocol drift fail BC-001.
Normal forced teardown remains cleanup only and cannot erase primary failure.

Chat/interaction/provider modes and durable resume are N/A: no chat or runtime
protocol change. Restart and repeated pre-send polling are covered by AC-003.

## Native acceptance (AC-005, PENDING)

After review/merge and explicit tag/dispatch instruction, use a new immutable
tools tag with the same Candidate 35299965095, same sealed wheel, from v0.1.10.
Run all four fresh-install and three restart lanes; inspect macOS arm64/x64
native close receipts AND actual root exit. Synthetic tests cannot prove the
real Cocoa/Electron delivery or solve an internal app veto. If still blocked,
receipt distinguishes native targeting/request acceptance from non-exit;
product changes/rebuild are only justified by further product evidence.
Active rollout stays INCOMPLETE until this exact artifact-pair run passes.

Apple API reference: https://developer.apple.com/documentation/appkit/nsrunningapplication
(normal terminate, PID lookup, launchDate and finishedLaunching).

## Implementation verification

- Red-before-green: real adapter extraction test failed on old path-only JXA
  quit; passes after PID forwarding change.
- Local scoped regression after the fixture correction: three consecutive
  rounds of 166 tests each, 163 passed, zero failed, three Windows
  native-only tests skipped on macOS. Includes native producer/strict consumer,
  kernel fallback/source pinning, delayed readiness, timeout accounting,
  refusal/identity drift, retained diagnostics and accepted-request-but-no-exit.
- Real JXA inspect-only probes: nonexistent PID correctly rejected; existing
  Finder metadata validated with the kernel fallback, request_sent=false.
  No application was launched or sent a quit by these native checks.
- Syntax checks and git diff --check passed. Product Electron/Unchain files,
  build inputs, feature flags and existing release receipts were not changed.
- A repeat run exposed an existing ASAR fixture race (initial archive read
  contained zero bytes; isolated rerun passed). The pinned @electron/asar
  writeFilesystem resolves with out.end(), not stream completion. The test
  builder now awaits stream/promises.finished on that returned stream before
  reading/copying. Only test data generation changes; no production ASAR retry
  or relaxed validation. GitNexus makeArchives upstream LOW, one test dependent.
- Full GitNexus detect_changes used a disposable GIT_INDEX_FILE so all seven
  files, including new files, were visible without staging the user's index.
  Result: 98 changed symbols, 71 affected flows, CRITICAL; no partial/truncated
  flags. Retain that warning rather than report graph all-clear. Many reported
  application flows end at the test sandbox's generic `error` member (e.g.
  SwipeCardContent → Error); actual production diff is the release adapter,
  new native-control helper and restart diagnostics. Pre-edit exact function
  upstream walks were LOW. Native release acceptance AC-005 is still PENDING.

## tools.4 regression amendment: physical path representation

Run 35425219249 failed both macOS fresh-install lanes on the first `inspect`:
`macOS close target identity mismatch`. Windows/Linux fresh installs passed;
the restart lanes had not run at diagnosis. This is a tools.4 regression, not
evidence of a Candidate signing fault or an application shutdown timeout.

BC-001 canonical representation is now explicitly POSIX `realpath` on BOTH
sides: Node `fs.realpathSync.native` and the native libc `realpath` exposed to
JXA. Foundation `stringByResolvingSymlinksInPath` is not equivalent: it can
return `/var/folders/...` while Node returns `/private/var/folders/...` for the
same file. Native path-resolution failure fails closed; no prefix stripping,
basename comparison, schema widening or consumer-side acceptance relaxation.
The exact eight-key response, PID/start pinning and independent exit proof
remain unchanged. Two native path results are allocated per short-lived probe
and reclaimed when osascript exits; no long-lived process uses this binding.

AC-006 (BC-001 / SEQ-001): actual macOS filesystem fixtures in `/tmp` AND
`os.tmpdir()`, including `/private` aliases, symbolic links, spaces, apostrophes
and Unicode filenames. Run the real JXA producer with only process lookup
replaced by an inert instance; file URLs and native resolution stay real.
Feed its result to the unchanged strict Node validator. Negative cases cover
another bundle, another executable, a repointed symbolic link and a missing
file; all must fail before the fixture's forbidden-termination getter.
Red-before-green: the new native test failed with the exact identity mismatch
before the production edit, and passed after it. No running application is
looked up, started or terminated by this fixture test.

Bound repository/worktree: /Users/red/Desktop/GITRepo/PuPu, pre-edit index
9975d90 matching HEAD. Upstream closeMacApplication: LOW, one dependent.
Script constant and nested JXA resolver: UNKNOWN/unindexed; source confirms
the fixed script is used only by closeMacApplication and its tests, with the
DMG adapter forwarding to both fresh-install and restart qualification.

AC-005 remains PENDING: the full exact Candidate/native app pair, including
arm64/x64 restart and real graceful exit, must pass with a new immutable tools
tag after review/merge and explicit dispatch authorization. This local fix
does not establish that the earlier tools.3 shutdown failure is solved.

Local amendment verification: three consecutive scoped regression rounds,
167 tests each: 164 passed, zero failed, three Windows-native-only skips on
macOS. Syntax and whitespace checks pass. Full graph diff: three files,
15 changed symbols, reported risk LOW, no partial/truncated flags. Its zero
affected flows is NOT proof of no native effects: the JXA string boundary is
not indexed; the source trace and AC-006 cover that gap. No product files,
feature flags, Candidate bytes or release workflow definitions were changed.
