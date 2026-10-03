# Integrate accepted dev / #390 into #383

Date: 2026-10-03 UTC. Status: source integration, corrected exact-wheel local
qualification and qualified lite CI **PASS** after independent GPT-6.1 Sol review.
Final evidence-head publication/CI is pending. Live and active rollout remain
**INCOMPLETE**; full local frontend/Electron invocations retain baseline failures.

## Scope and immutable history

Merge accepted dev into the existing bugfix branch and push fast-forward checkpoints.
No rebase, force push, merge into dev/main, deployment, real profile/database mutation,
app/sidecar restart, paid provider call or issue closure is performed.

- Original branch head: `7e7abc21c9e7a5aa6850de01df4c981cb2de4126`
- Plan checkpoint: `eeb1dff240f5488f133cc11ed45267e98b2b305e`
- Accepted PuPu dev: `f689b9fa9732fc4dc3ae527eea96e56c82dc1873`
- Accepted Unchain dev: `358b96d723daa0d2882158985c8245c7f8c7fb23`
- Merge base: `0047d58d0369d5c245a3fd8021d4d97c3e3f9a35`
- Host source merge: `9d6ca4322e5c338d2a2c4f0f4fb482ae0c0792ea`, tree
  `affd0d13c210b1710539cb2a4f568c6df3f6d2e7`, with plan checkpoint and accepted
  PuPu dev as its exact two parents
- Final host pin checkpoint: `77f8afb0a73d27a6783790ce118a3f184eec900b`, tree
  `8cfd25df927edf7bf1dd89af17691d60823bf44a`, parent `9d6ca432`; all five QA refs
  select corrected immutable Unchain source `a7fa15d685b1130bf5678c1e493a51d2551185cf`
- Corrected runtime tree: `e9fcc714c0756a8db67b4b9811b2829161e3bc30`, parent
  `4a0add1936e0369e16d5286289b280456eb913ca`

Published checkpoints were independently read back/restored with exact trees and
parents. No #384 bugfix source or missing macOS-only unpublished workaround is imported.

## Three-way conflict and preservation map

The two textual conflicts were the five runtime refs in `release-qa.yml` and adjacent
additions in `activity_tree.test.js`. The test resolution inserts the complete
86-line dev block without removing branch assertions. The automatic `TraceChain`
and activity-projector merge required no production repair.

Preserve #383's four developer policies (`never`, `no_feedback`, `approved`, `always`),
default `approved`, original policy/legacy omission, Approved grouping and each member's
identity, controls, callback and result. Display metadata remains outside provider
schemas, durable request contents/digests, receipts and capability authorization.
Malformed present metadata remains conservative; absent historical metadata stays absent.
The grouping helper, cold-policy reader, adapter and interaction source remain unchanged
from the branch. Retry frames remain original-sequence grouping barriers.

Preserve accepted #390 native replay/provenance, strict imported manifests, historical
closed diagnostic/lease shapes, no-resend fences and interruptible retry/Stop behavior.
Both bounded-ordinal and grouped wait representations render; malformed/hybrid input
is rejected. The pertinent replay/admission/artifact/context sources remain unchanged
from accepted dev. Existing private replay guards are not weakened.

## Boundary contracts and sequences

**BC-390-I01 — imported runtime artifact to host/Electron/artifact consumers. VERSIONED.**
The producer is the actual imported immutable wheel. Canonical protocol manifest and
its strict digest/required capabilities decide admission; source revision/path are
provenance telemetry only. Unknown keys, schema/version and missing capability fail
closed. AC-390-I01: actual installed producer to independent strict positive/negative
consumers, both official contract matrices and installed-distribution smoke on one wheel.

**BC-390-I02 — persisted historical diagnostics/leases to runtime. CLOSED.**
Keep exact canonical bytes, hashes and predecessor identities. Historical diagnostic-v2
and lease-v4 forms are discriminated by exact key sets, HTTP/null types and lease status;
unknown/hybrid/crossed states fail closed. No migration or renumbering occurs.
AC-390-I02: inherited historical shape/identity negatives, safe host diagnostics and
full exact-wheel host/contract coverage; unknown outcomes never authorize resend.

**BC-383-I01 — original call to cold/live interaction presentation and grouping. OPEN
presentation extensions, closed four-policy enum.** The original call's policy or its
original omission is preserved; cold recovery requires exact event cursor, call/tool,
execution and source-attempt identity. Metadata is beside the copied durable request,
not inside its hashed contents. AC-390-I03: policy/member renderer and transport/cold
journal tests, immutable request/digest checks and wrong-owner/identity negatives.

**SEQ-390-I01 — first/second messages and interactions, retry, durable resume/replay,
Stop and normal/graph/subagent paths.** Inherited deterministic tests cover applicable
stored-state paths. Real-profile first/second provider messages, actual sidecar cold
restart, durable app Stop/reopen and policy-specific live graph/subagent paths remain
NOT_RUN; simulated/local state evidence does not claim those cells passed.

**SEQ-383-I02 — original-policy resume with recursively frozen array arguments.**
Independent review found an inherited #383 recovery hole: stored arrays are tuples,
so direct comparison against live JSON arrays could miss the original policy and
produce a duplicate-operation conflict after toolkit policy changes. At `4a0add1`,
15 array-bearing cases fail while five scalar controls pass across original omission
and all four policies. The bounded correction thaws stored JSON only for comparison;
journal bytes, request/digests, subjects, schemas, leases and no-resend guards stay intact.
All 73 focused tests pass, including the 20-state matrix and five changed-array negatives.
The old `4a0add1` / `d1735fac...` wheel is historical **NO-GO** for this case.

## One final local artifact

Corrected source: `a7fa15d685b1130bf5678c1e493a51d2551185cf`.
The wheel was built once and reused throughout host/backend/contract qualification:

- `unchain-0.2.0-py3-none-any.whl`, 1,170,318 bytes
- SHA-256 `a88028bbb7d286d4792e49b5945f80e33d71203579298ddb053190cca1aced62`
- Imported manifest
  `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`

Official isolated installation smoke verifies actual module origin, installation archive
hash and strict manifest. Independent review compares all 346 packaged entries / 335
Python files with immutable source and installed bytes. Host checks use the exact
checked-in server requirements; latest-SDK runtime qualification stays separate.

## Results and invocation recovery

- Final full backend: **2,678 passed / 18 skipped / 3,599 subtests**, exit 0, 208.35 s;
  wheel/manifest asserted and no foreign runtime imports. Two warnings retained
- Context V2: **92 runtime + 24 host + 3 subtests + 2 strict-fake tests passed**, exit 0
- RunBundle: **63 runtime + 31 host + 2 subtests + 14 pricing + 36 Electron + 225
  renderer passed**, exit 0; non-failing fake-timer cleanup warning retained
- Independent acceptance: **144 frontend and 103 exact-installation host tests pass**
- Stable full frontend: **445/447 suites, 5,412 passed / 38 failed / 5 skipped**;
  full Electron: **54/56 suites, 936 passed / 38 failed / 5 skipped**. Both are **FAIL**
  invocations. Exact failure names/errors match unchanged dev's Linux vault fixtures;
  production secret-storage gates and assertions are not patched
- Initial six extra AgentsModal aggregate failures pass in focused dev/candidate and
  the complete unchanged-source stable rerun. The initial failed run is retained
- Release QA: **399 passed / 7 skipped**, plus **62 harness tests passed**, exit 0
- Web build: actual compiler child **status 0 / signal null / error null**, 39.36 s;
  fresh index/feature snapshot/asset manifest and 72 JS assets verified

The first backend evidence wrapper was invalid: unguarded main execution recursively
ran pytest under multiprocessing spawn, and its namespace audit incorrectly included
the separate host adapter. Ambient CA aliases also overrode explicit mock fixtures.
Only invocation changed: guarded main, exact runtime namespace, fresh temporary state
and per-command neutral CA aliases. All 61 setup/control/guard/MCP tests plus 11 subtests
pass before the valid full rerun. No product, fixture, assertion, skip or provider guard
changes were made. Failed raw output is not counted as acceptance evidence.

## Independent review and remote CI

[Scoped GPT-6.1 Sol review](ticket-383-dev390-evidence/independent-review.md): **PASS for
source integration, corrected exact-wheel local qualification and qualified lite CI**;
no unresolved host-source finding. Live/active rollout remains INCOMPLETE.
Review SHA-256: `dafd5cde6182f8f4f5e988857aee4ac8ca4aaf04ddde9406ead142e5f5e685af`.

[Release QA 37108144017](https://github.com/haoxiang-xu/PuPu/actions/runs/37108144017),
CodeQL and source enforcement are terminal **SUCCESS** for exact checkpoint `77f8afb0`.
CI's distinct wheel SHA-256 is
`166f7e33855f8a38891fd893bdc84e51ffde44e232353b5ec2a82dd0d6bbb080`; all 346 packaged
entries / 335 Python files match the same corrected source/manifest. It is not falsely
presented as the local archive hash. Qualified lite CI reports 5,136 frontend / 319
skipped, 660 Electron / 319 skipped, 2,678 backend / 18 skipped / 3,599 subtests; both
contracts, build, two Linux Playwright smoke tests and final report pass with zero failed
checks. Lite coverage does not erase complete local aggregate failures or imply full
platform/package acceptance. Final documentation-head CI is tracked separately.

## Graph scope and evidence handling

Merged-source complete graph: **118 changed symbols / 274 affected flows / 38 files,
CRITICAL**, no error/partial/truncated flag. TraceChain's UNKNOWN symbol result is
corroborated by its real imports; dynamic/JSX resolution, FTS and traversal caps remain.
Later docs-only graph checks do not waive integrated-source risk.

Public [qualification summary](ticket-383-dev390-evidence/qualification-summary.json)
and [invocation recovery summary](ticket-383-dev390-evidence/invocation-recovery-summary.json)
are explicitly derived and path-free. Every original raw log/probe remains unchanged
locally with its recorded SHA-256; summaries are never mislabeled as raw bytes. Verified
GitHub run/report artifacts provide full remote evidence. No new validation run is
required for this documentation-only finalization: executable/test/workflow bytes stay
identical to the reviewed and CI-qualified source checkpoint.

Real-provider, existing-profile, durable app reopen/cold restart, frozen-sidecar and
platform-specific manual acceptance remain **NOT_RUN / INCOMPLETE**. No active rollout,
merge into dev/main, deployment, real database/profile mutation or process restart occurs.
