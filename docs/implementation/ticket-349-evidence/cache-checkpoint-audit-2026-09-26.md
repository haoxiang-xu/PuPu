<!-- release-feature-audit:v2 -->
## Issue feature audit — cache checkpoint, 2026-09-26

Release: #216 (v0.1.12). GitHub's direct parent relationship and the parent's
Size=Release item in PUPU Project #13 were verified fresh. #349 is open,
Size=L, Status=In Progress; unchanged.

**Local cache checkpoint: PASS. No new reproducible production defect was found
in the reviewed diff and targeted paths.**

**Overall: FAIL (INCOMPLETE end-to-end evidence).** This is the whole-ticket
feature-audit verdict, not a failure of the local cache comparison. The remaining
Memory V3 slices are still planned work. No additional cache repair is required
by this audit before progressing to the next approved slice.

1. **i18n: PASS.** Fresh full scan: 815 English keys, ten locales, zero missing,
   orphan, placeholder mismatch and missingInEn. Existing 65 dead-key candidates
   and 48 dynamic references are unchanged and outside this backend slice.
2. **UI: N/A.** No new UI in the cache diff; plain-language activity wording is a
   later implementation slice.
3. **Model × agent builder: N/A.** No model selection/capability/builder change.
   Provider serialization parity is separately covered below.
4. **Static rules: PASS.** Scoped changes are Python backend code and evidence.
   No renderer IPC/storage/router/layer or Electron test-twin changes apply.
   Both source workspaces pass `git diff --check`.
5. **End-to-end: FAIL (NOT_RUN for this candidate).** There is no package smoke
   or actual restarted-sidecar/live-app evidence bound to this fixed pair.
   The running test-API PID resolves to the original PuPu working directory,
   not the isolated candidate. It was not used to claim verification of the new
   wheel, and no active user session was modified.

Candidate digest (verified PuPu source snapshot, **not a packaged application**):
`sha256:70de3084df8e8e33ef7432b143437c1dd4617aa45e978f10c8337967f6262078`

Unchain wheel SHA-256:
`sha256:03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`

Runtime manifest digest:
`sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`

### Fresh verification and evidence review

- **91 passed in 10.39 seconds**, using the same wheel and per-test artifact
  guard. Scope: cache lifecycle/invalidation, mutation matrix, v2/v3 status
  compatibility, request factory/coordinator, 23 differential cases and all
  prior cache defect reproducers. Log: `cache-checkpoint-audit-tests-2026-09-26.log`.
- Independently checked the recorded current Unchain and PuPu source files
  against their frozen manifests, and verified frozen PuPu files, harness and
  archived test-log/raw-data hashes. No recorded candidate-input drift found.
- Independently recalculated every summary from all **1,200 raw samples**:
  median, nearest-rank p95, minimum, maximum and discrete counters match the
  report. No performance rerun was needed because candidate inputs did not
  change. The 100-turn tool-continuation saving remains 48.414 ms / 16.2%.
- Reviewed the full-history shadow implementation: coordinator comparison
  recompiles before checking its durable build receipt; it does not merely
  return a previously stored envelope. Exact compile requests/results and
  provider-wire bytes are compared without identity/timestamp normalization.
- Reviewed prefix/revision/tail acquisition, atomic initial snapshot/revision,
  trigger invalidation/upgrade, durable write preservation and fail-closed
  paths. The known repaired defects remain covered.
- The previous guarded **1,499 passing core/differential tests** (one skip,
  one xfail) and **195 passing PuPu tests** remain valid evidence for these
  unchanged inputs; they were verified from their retained hashed logs, not
  represented as newly rerun by this audit.

### Limits and next action

The approximately 2 ms short-history regression and read-transaction increase
from 4 to 8 are explicitly documented tradeoffs. Long-history query count/data
volume and preparation time improve. These numbers do not measure actual disk
I/O, TTFT, model streaming, or complete host tool-result-to-dispatch latency.

Local cache portions of BC-349-01/02, AC-349-02/03/06/07 and
SEQ-349-02/03/05/06 have evidence. BC-349-05 / AC-349-09 and AC-349-01's real-app
timing portions remain INCOMPLETE. The next delivery verification must bind an
actual application candidate, this or a newly identified runtime wheel, the
imported manifest, package smoke, and real behavior after sidecar restart.

**Gate clarification:** a diagnostic/local/unsigned candidate can satisfy this
audit. Clean source, signing/notarization, release publication, rollout cohorts
and real users are not prerequisites. The earlier closeout report's reference
to unbuilt “official clean release artifacts” must not be interpreted as an
additional feature-audit gate. The missing requirement is exact-candidate
package/application evidence. The audit skill explicitly permits a diagnostic
candidate “when the exact candidate digest, wheel digest, runtime manifest
digest, package smoke, and applicable real-app behavior are verified.”

Keep #349 In Progress. This audit changed only its evidence files/comment;
no production edit, sidecar restart, commit, PR, rollout or ticket closure.
