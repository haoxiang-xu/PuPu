# Windows qualification: bounded graceful shutdown

## Evidence and scope

Run 35371731574, tools be0f678f8182dcde36e2279d5e0182bc585ef19e,
failed at `relaunched-shutdown`: the one-shot `CloseMainWindow()` returned false.
The runner had already accepted the automatic relaunch, Sidecar descendant,
exact candidate file identity, retained settings sentinel and feed requests.
A subsequent observation showed PID 7244 with a responding PuPu window.
The strongest explanation is a window-readiness race; the original probe did
not record window state at the call, so temporary disabling is not excluded.

Retain Candidate 35299965095 / v0.1.11 at
f6b654a6d87857cfc54a2712ae7f7bb1796c683a and fixture v0.1.10 at
020d898de56d1cdebafb136f6176c4d10bbfdcf8. Change only the shared Windows
qualification close adapter, its two lifecycle consumers and tests. Product
updater, artifact bytes, signing and workflow dispatch remain unchanged.

## BC-CLOSE-001: Node harness to native Windows window control

Producer: PowerShell `Get-Process` / `Process.Refresh`, `MainWindowHandle`,
`Responding`, `StartTime` and `CloseMainWindow`. Consumer: Node
`closeWindowsApplication`, called by installed-package and restart qualification.
Transport: a bounded child-process stdout JSON document; stderr/nonzero exit is
failure, not a retryable observation. Each probe has at most 10 seconds within
one 60-second close-request budget. A timeout terminates the probe, not PuPu.

CLOSED wire keys: `schema`, `pid`, `started_at`, `window_handle`, `responding`,
`close_requested`. Schema is `pupu.windows-close-observation.v1`; ticks/handles
are decimal strings (no JavaScript numeric precision loss), PID a positive
integer, flags booleans. Extra/missing fields, wrong version, wrong PID, invalid
types, inconsistent success and changed creation time fail closed. The first
observation binds creation ticks to the already-identified app PID. Later native
probes verify those ticks before sending any close request; self/parent PIDs
are prohibited. Missing/exited processes or access failures never become success.

No-window, nonresponding-window and rejected-close observations may retry with
a one-second pause under the shared deadline. The probe refreshes state each
time; no fixed sleep is treated as proof of readiness. Every valid observation
is logged with attempt, PID, creation ticks, handle and result. Exhaustion
retains the last observation in the primary error. No force-kill fallback exists
in this adapter. The helper reports only request acceptance, never process exit.

## BC-CLOSE-002 / SEQ-CLOSE-001: request acceptance to lifecycle evidence

Both callers await the close request. Only afterwards do they independently
wait for actual main-process exit (60 seconds on Windows). Restart report
validation remains strict and occurs after this check. Existing failure/residual
cleanup remains separate; its success cannot overwrite a failed shutdown.
Non-Windows adapters keep their existing close behavior and exit deadlines.

State key: already-qualified PID plus captured creation ticks.
Sequence: installed candidate verified → Sidecar discovered → hidden/not-ready
window → refreshed ready window → accepted WM_CLOSE → normal exit → report.
Applicable retry cells: hidden → ready, temporarily nonresponding → responsive,
close rejected → accepted; deadline never resets. Negative cells: always hidden,
PID reused, probe invalid/error, accepted request without exit. No product
relaunch, install retry, persistent-state mutation or new candidate is introduced.
Chat/provider/replay matrices are N/A because no product runtime or conversation
protocol is modified. Exact deployed-pair validation is still required below.

## Acceptance

- AC-CLOSE-001: real installed adapter regression fails on old one-shot close
  (`CloseMainWindow returned false`), passes when window appears on a later probe.
- AC-CLOSE-002: production helper with strict OS-boundary fixtures covers closed
  schema, identity, delayed readiness, rejected requests, bounded deadlines,
  PowerShell failures and no force kill.
- AC-CLOSE-003: full production restart runner uses the real close helper against
  fake native observations. Delayed readiness passes; permanent failure and
  accepted request without exit remain failures even after cleanup succeeds.
- AC-CLOSE-004: Windows-only tests use real PowerShell against a disposable
  windowless Node child and a delayed WinForms window. Neither starts PuPu,
  an installer, a local model or a provider. NOT_RUN on the macOS developer host.
- AC-CLOSE-005: hosted Windows diagnostic must use merged tools and the exact
  retained Candidate/fixture pair above. NOT_RUN; no formal qualification pass.

## Impact and handoff

GitNexus bound to PuPu at /Users/red/Desktop/GITRepo/PuPu, index refreshed to
be0f678f. Existing production entry points return LOW upstream impact, covering
installed-package and restart qualification. Test harness resolution is UNKNOWN;
source callers and full lifecycle tests provide supplementary evidence. Graph
flow-budget omissions are not interpreted as proof of no other impact.

Local red evidence: /tmp/pupu-close-red.log. Local focused regression evidence:
/tmp/pupu-close-focused.log. Full suite /tmp/pupu-close-suite-final.log: 350
tests, 345 passed, 0 failed, 5 skipped (two existing environment gates and three
Windows-native tests on macOS). Syntax and whitespace checks passed. The install
sequence test VM now explicitly rejects an unexpected close before its runtime
boundary, rather than silently omitting the adapter's new dependency.

Post-edit graph detection initially reported CRITICAL. A refresh then produced
an inconsistent symbol identity (the Windows close function pointed to a Python
registry function) and failed FTS construction; that output is not acceptance
evidence. A forced no-parser-cache rebuild completed successfully (54.9s).
The final detector still reports CRITICAL (17 changed symbols, 16 processes);
the helper upstream impact also reports CRITICAL. Both lack partial/truncated
flags at their configured limits. This warning is retained, not downgraded.
The helper has 60 name-fallback CALLS at confidence 0.7 (including unrelated
database/browser close calls) and one USES edge at 0.85 from installWindowsNsis.
Exact source reference review confirms the production adapter and its two
lifecycle consumers; all other direct helper references are tests. Initial
LOW entry-point impact is pre-edit context, not a clean final graph verdict.
Evidence: /tmp/pupu-close-changes-final.log and
/tmp/pupu-close-impact-final.log. Detector scope covers four tracked files;
the untracked new test and this plan were reviewed separately and the new test
is included in the full test suite. No commit was made.

Do not commit, dispatch, retag or publish without the
corresponding user instruction. A new Diagnostic run does not require Release
QA or Candidate rebuild, and is not itself a formal release qualification seal.
