# #349 step 2 acceptance repairs — 2026-09-26

Implementation fixes for the two findings in [the failed acceptance report](step2-feature-audit.md), plus the related exact-finalization replay conflict found while testing. The ticket stays open and In Progress. This is an implementation checkpoint, not a replacement feature-audit PASS.

## Changes

**F1 — preserve each legacy job's provider identity.** The foreground finalizer supplies a closed, versioned provider binding. The legacy curator validates the exact fields and selected model, then stores the binding atomically in the existing job payload. Built-in jobs bind provider/model; custom jobs additionally bind a digest of parsed provider identity, protocol, endpoint, auth mode/header name, extra headers and selected-model declaration. Separate API keys are excluded; raw transport configuration and credentials remain transient.

Before building an agent, the background consumer compares that original binding with current authorized inputs. Switching custom A to built-in, custom B or a changed endpoint now produces an explicit retryable job without constructing an agent. Restoring the matching configuration lets the job run. API-key rotation does not change the binding. A restart with missing custom inputs waits for those inputs instead of using a built-in twin. Historical jobs without a binding also remain explicitly pending; the worker cannot safely infer their original destination. This is conservative compatibility, not an automatic migration of unknown historical identities.

**F2 — find eligible work beyond bounded list pages.** Both pending and leased scans treat a full 500-row page as inconclusive and defer to the store's authoritative eligible claim. A ready job or expired lease hidden behind 500 newer deferred rows is now processed. Normal empty scans stay idle.

**Related replay repair.** Exact legacy finalization replay previously reused an operation ID while the journal generated a different event ID, causing an operation conflict. Curator summaries now supply a deterministic event ID scoped by owner/session/attempt, event type, run and complete summary content. Repeating the same completion preserves one job and one audit event. This changes only curator audit summaries, not general journal or tool-call persistence.

## Verification

- Red-before-green: five focused failure cases captured before the provider/queue fixes (three destination changes, hidden pending work, hidden expired lease). A separate failing exact-finalization replay was captured before the audit-ID repair. Logs: [F1/F2 red](step2-fix-red.log), [replay red](step2-fix-replay-red.log).
- Eighteen new regression cases cover destination changes, atomic job bindings, original-configuration restoration and one application, cold registry recovery, built-in/custom key rotation, no raw credentials/endpoint in the SQLite payload, seven missing/invalid binding cases, job-enqueue replay and exact finalizer replay. Tests use actual SQLite stores and the actual finalizer/curator boundary; provider execution is intercepted or replaced by a tool-using test agent, so no external model data is sent.
- **265 tests passed, 65 subtests passed in 47.02 seconds** on the frozen r6 candidate and the same wheel, with an import-origin guard after each test. [Full log](step2-fix-tests.log), [test scope](step2-fix-tested-files.json).
- Four actual task-owned sidecar starts (two official, two legacy) returned healthy and exited 0. Restart preserved future retry deadlines; attempt counts stayed at one. The legacy custom-provider job preserved its original binding and waited for unavailable transport inputs. [Official restart evidence](step2-fix-sidecar-smoke.json), [legacy restart evidence](step2-fix-legacy-sidecar-smoke.json).
- Closed host-envelope negatives rejected unknown fields/version/type before claim. Job-binding negatives separately assert retry before any agent construction. [Host-envelope evidence](step2-fix-envelope-negatives.json).
- All 371 frozen source/resource hashes were checked again after tests and match the current working source. `git diff --check` passed. Prior r4/r5 results do not certify the final r6 source.
- GitNexus impact ran before production edits in `/Users/red/Desktop/GITRepo/pupu-349`. The legacy finalizer is CRITICAL; the enqueue-name query also reports CRITICAL with broad shared-method matches. Actual source callers were inspected: finalizer/module wrapper/test callers for enqueue, and `process_owner` for the new legacy dispatcher. The index cannot resolve the new dispatcher file/symbol (UNKNOWN), so that result was not treated as an all-clear. [Impact summary](step2-fix-impact.json). The user was warned before editing.
- Updated BC-349-03d/e, SEQ-349-04e/f/g and AC-349-11/12/13 in [the direct plan](../ticket-349-background-memory.md). No Unchain source changes or wheel rebuild.

## Limits

The task-owned sidecars use the frozen candidate. The user's original checkout and day-to-day desktop app remain on their existing code. Real-provider desktop/candidate package verification remains incomplete and must be performed for formal acceptance; no live latency improvement is claimed here. No commit, push, PR, issue closure or release rollout is included.

## Final fixed artifact pair

- PuPu server/resources: `sha256:02caddf170f4a1aaceaf7496cba5f54ae66eaee47701535e09e570e0eba45f1e`.
- Unchain wheel: `sha256:03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`.
- Actual imported runtime manifest: `sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`.
- Retained replay directory: `.local/ticket-349-background-checkpoint-r6/`; `run_tests.py`, `sidecar_smoke.py`, `sidecar_smoke_legacy.py` and `verify_background_envelope.py` use the same wheel. Run with the task Python 3.12. [Identity record](step2-fix-artifact-identity.json).
