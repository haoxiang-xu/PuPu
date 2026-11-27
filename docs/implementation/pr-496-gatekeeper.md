# PR #496 gatekeeper follow-up

The owner selected **retain Intel Mac support and hold both merges** on
2026-11-27. This is not an acceptance of the remaining cryptography advisories.
The already published v0.2.0 tag, installers and retained release wheel remain
unchanged. Follow-up source checks do not recertify those published artifacts.

## Contracts and checks

- **BC-001:** untrusted user/tool/provider text crosses the durable storage
  sanitizer. Replace backtracking PEM matching at its shared text/binary
  boundary; retain complete-block redaction, mismatched-label redaction and
  rejection of protected binary material. No storage schema changes.
- **SEQ-001:** malformed or repeated BEGIN headers must finish with bounded
  work; a later complete PEM must still be removed. The test runs adversarial
  inputs in an owned short-lived child with a five-second bound.
- **AC-001:** six public sanitizer regressions cover ordinary multiple blocks,
  malformed/greedy headers, protected binary input and 120KB repeated-header
  inputs. The old malformed-header redaction coverage is retained.
- **BC-002:** the source follow-up consumes the exact Unchain revision selected
  for the paired #83 fixes, with one retained wheel, installed module bytes and
  actual runtime manifest verified in the consuming test bootstrap. A source
  SHA or a shell import alone is not a dependent PASS.
- **SEQ-002 / AC-002:** node-scoped provider-context recovery retains the same
  node-memory-view identity and filtering on rebuild and cold replay. Core
  regressions and the affected host contracts must pass with that artifact.
- **BC-003 / AC-003:** managed imported Code can retain identical reviewed
  Python bytes while changing its JSON result schema. The selected Core fix
  uses an explicit empty referencing registry; schema validation must not fetch
  network/file resources. Legitimate document-local references remain valid.
- **BC-004 / AC-004:** refresh follow-redirects to 1.16.3 and serialize-javascript
  to 7.1.3; override only the affected modern minimatch copies owned by
  app-builder-lib and @electron/universal to 11.0.1. Older unaffected minimatch
  3/5 copies retain their contracts. Real packaging filters, universal matchBase,
  bounded glob preprocessing, worker-option serialization and cross-origin
  redirect header handling are tested. Complete npm audit falls from 13 to 0;
  46 owning tests pass with one native-Windows-only skip, and the Node 24.22.1
  web build succeeds. Native Mach-O assembly is not claimed.

The selected source pair uses Core
`e694d24cc7d9450dad72e7726d2a4d5a5a206064`. One retained local follow-up wheel
has SHA-256 `decb46758bbed6266329f1c9308c295d1f244ef0bd5fe4662da163b0cc8b458a`
and actual manifest digest
`sha256:8bb1c7d474eed7bd82f906ac6cd88a6b7e073a23f46319cf500ebbd6b50ff17b`.
After adapter bootstrap, collection and tests, actual importing processes
verified every loaded product module against that wheel. Host checks pass
127 tests plus 3,330 subtests; Code/recovery artifact checks pass 41 tests with
one existing optional bundled-interpreter skip. Separate processes avoid the
repositories' conflicting `tests` package names. This is source-host/artifact
validation, not installed application or Intel package qualification.

## Static-analysis dispositions

CodeQL #601/#602 return only public SkeletonResourceError validation/conflict
messages. Unexpected exceptions have separate fixed 500 responses; no stack is
serialized. #579 is an intentional read-only facade over one existing SQLite
BEGIN snapshot, with both base state attributes supplied; calling the base
initializer would perform schema initialization inside admission.

Cache alerts #440/#661 are mitigated by server-enforced `cache-mode: read` on
both caller and reusable QA workflows, not by treating a SHA as trusted.
Run 46051258775/job 140682851030 initialization records `Cache mode: read`.
GitHub's documented scoped-token control prevents cache saves; existing workflow
regressions check both caps and writable telemetry rejection.

The async `ended` guard in #435 is required when a watchdog finishes
Promise.race before a pending request rejects. A held-request reproduction
confirmed that it suppresses late waiting callbacks and polling. The redundant
sixth argument in #625 is removed without changing validation behavior.

## Remaining blocker

Both repositories retain cryptography 48.0.1 for Intel Mac compatibility.
GHSA-g6cj-pr64-35w5, GHSA-jwv3-5hgf-82ww and GHSA-m2h6-j472-rp4c are not
remediated by this follow-up. Upstream's fixes require releases that removed
Intel Mac support. No exception, suppressed dependency alert or all-clear is
claimed. Keep the PRs open while a compatible resolution remains outstanding.
