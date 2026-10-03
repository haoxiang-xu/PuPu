# PR #395 dev conflict resolution — 2026-10-02

Historical source-merge evidence. The subsequent runtime/CI reconciliation and
its combined-pair results are recorded in
[`ticket-390-pr395-ci-acceptance.md`](ticket-390-pr395-ci-acceptance.md).

Merge source: PuPu dev `0047d58d0369d5c245a3fd8021d4d97c3e3f9a35`.
Pre-merge PR head: `114d8f950d6b112d5d3e6adc6c199066dcf78664`.
Scope: resolve the requested PuPu source conflict and preserve both tickets'
frontend retry behavior. Unchain #46/#48 reconciliation is not performed here.

## Resolutions

- The only textual conflict was in `test_provider_terminal_diagnostic.py`.
  Retain both #386's HTTP/status/replacement-model cases and #390's explicit
  finish/admission cases. Preserve #390's already-tested detailed
  `unrecorded_outcome` explanation for a bare recovered error, replacing the
  overlapping #386 assertion that pinned the generic code alone. No diagnostic
  tests are skipped or weakened to accommodate a missing runtime API.
- Git automatically merged two incompatible `provider_retry` handlers in the
  activity tree: the first consumed every retry event and discarded #390's
  ordinal format. Dispatch explicitly by the legacy ordinal/budget fields;
  malformed or hybrid ordinal payloads fail their original strict validation
  instead of falling through to #386's grouped-wait parser. Preserve #386
  heartbeat deduplication and its original validated field projection.
- The automatic timeline merge similarly made #386's countdown/Stop renderer
  unreachable. Keep the bounded #390 renderer for its format and the grouped
  #386 renderer for its format. Only valid grouped start-of-wait records can
  enter grouping; legacy/invalid frames break groups and cannot manufacture a
  waiting header with no visible row. Existing #386 settlement rules are
  preserved; this is not a retry lifecycle redesign.

Contracts: BC-390-14, SEQ-390-11, AC-390-M01/M02 in `ticket-390.md`.

## Verification

- Existing automatically merged frontend suites: **12 failed / 73 passed**,
  `/tmp/pupu395-frontend-merge-red.txt`.
- Before production repair, expanded mixed-format/hybrid/no-hidden-header
  regressions: **23 failed / 73 passed**,
  `/tmp/pupu395-frontend-merge-expanded-red.txt`.
- Repaired projector plus both timeline suites: **96 passed**,
  `/tmp/pupu395-frontend-merge-green.txt`. Original bounded retry rows,
  grouped countdown/Stop, completion/failure/cancellation and heartbeat
  behavior remain covered.
- Affected parent, runner/Stop, storage, replay adapter and usage suites:
  **22 passed**, `/tmp/pupu395-frontend-merge-integration-green.txt`.
  Frontend total: **118 passed across 9 suites**.

Host checks use the unchanged, once-built Unchain #48 wheel:
`95d9a731c119a70a0df749e13b8b6e0bef1200b7acd48ff493e245406f109b7a`, imported
manifest `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`.
The artifact's earlier all-green CI does not establish merged-host acceptance.

- Terminal/uncertainty suites: **11 passed / 3 failed**. The #386 tests require
  `provider_status`/`replacement_model` constructor fields and `detail` on an
  uncertain error, which #48 does not implement. Log:
  `/tmp/ticket390-conflict-host-red.txt`.
- Retry graph plus runtime-admission and V4 stream suites: **58 passed / 3
  failed, 6 subtests passed**. The three #386 graph cases require its retry hook
  and class-based uncertainty wording: #48 emits no #386 wait heartbeats, Stop
  on that missing callback cannot prevent the next send, and its content-free
  diagnostic intentionally uses a fixed category instead of a dynamic class.
  Log: `/tmp/ticket390-conflict-host-retry.txt`.
- Total selected host evidence: **69 passed / 6 failed**. There is no claim that
  the merged host passes its full sidecar suite or is runtime-compatible.
- Complete staged GitNexus analysis includes the incoming dev changes:
  **152 changed symbols / 675 affected processes / 45 files, CRITICAL**.
  No partial/truncated/error result is accepted. Pre-edit existing projector
  and renderer checks were LOW; newly imported helpers returned UNKNOWN and
  received exact call-site corroboration. Source whitespace and unresolved
  index checks pass; the incoming dev files' trailing blank lines were removed
  without changing their behavior. No source-risk or rollout all-clear is
  inferred from the frontend test result.

## Delivery limits

Source conflict resolution must not remove the existing integration hold. Both
PRs remain Draft. The merged consumer plus either unreconciled producer is not a
release-qualified pair: durable diagnostic/lease versions, retry hooks/events,
exception compatibility, catalog and the immutable Release QA pin still need
one coordinated producer and same-wheel package/host qualification. Preserve
these failing integration tests for that work. No required feature gate is
bypassed, existing profile mutated, process stopped/restarted, issue closed or
PR merged by this change. Manual acceptance of the pre-merge pair is historical.
