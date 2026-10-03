# #390 / PR #395 CI reconciliation — 2026-10-02

PuPu QA run [37097837391](https://github.com/haoxiang-xu/PuPu/actions/runs/37097837391)
failed on host `61a500e2d43ca15c8546fb7d40fb7e5b214d080b` because it selected
Unchain #46 (`1ec49ddfc28d3b42ba035debada5e3db759dad1b`). That producer lacks
#390's provider-result reader and uncertainty capability. Frontend **5,086**
and Electron **658** passed, while the sidecar had **264 failures / 13 fixture
errors**, and the Context V2 gate had **7 failures / 17 passes**.

Selecting the old #48 wheel alone would still leave the six integration
failures documented in `ticket-390-pr395-conflict-resolution.md`. This repair
merges the two runtime branches and qualifies their combined host/runtime pair.
The earlier isolated-pair acceptance is not transferred to this pair.

## Resulting behavior

- Both historical diagnostic-v2 and lease-v4 forms retain exact canonical
  bytes, SHA-256 and predecessor identity. Complete key sets, HTTP/null type
  and lease status distinguish them; mixed, unknown and crossed forms fail
  closed. No stored record is migrated or renumbered.
- Normal kernel retries use #386's interruptible countdown and Stop, with one
  event representation per wait. Direct execution-service callers retain
  #390's ordinal notice. Hybrid events cannot bypass either strict projection.
- Gemini 503 requires an actual rejected HTTP response and matching SDK code.
  HTTP-200 SSE errors, missing HTTP evidence, partial streams and unknown
  outcomes remain uncertain and cannot authorize a resend. The two-retry cap
  applies to fresh sends recovered from older #386 records; already-recorded
  later outcomes remain recoverable.
- Provider-native continuation, precise closed uncertainty reason/phase,
  explicit response outcomes and the Anthropic SDK repair remain intact.
  Tests inherited from #386 now observe these safer diagnostics while retaining
  their send-count, Stop, persistence and no-resend assertions.
- All five Release QA defaults select the combined immutable source revision.
  Deterministic tests bind to the verified installed wheel via an isolated
  `python -I` import after byte verification, preventing sibling source from
  shadowing that artifact.
- Electron startup and artifact admission now require both new provider-turn
  capabilities, matching the Python host and Windows contract. The checked-in
  Windows contract already had them; it was not weakened to satisfy the test.

Contracts and sequence: **BC-390-03/15/16, SEQ-390-13,
AC-CI-01 through AC-CI-05**, recorded in `ticket-390.md`.

## One artifact, reused throughout local acceptance

| Identity | Value |
| --- | --- |
| Clean Unchain source | `1c9b399beb65bda72520e1c3ebc11c7f117751cb` |
| Wheel | `unchain-0.2.0-py3-none-any.whl` |
| Wheel SHA-256 | `31f4acdf6a0e746d8b063fc70c4b70e1c9d1a060ed07c4f08d8fc21ebf20b63e` |
| Imported manifest digest | `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672` |
| Byte comparison | All **345 packaged files / 334 Python files** match committed source and installation |

The wheel was built once from clean committed source, installed without
rebuilding, and reused for every local result below. Runtime admission is
determined by the strict imported manifest, not Git revision or source path.
Each fresh GitHub build has its own recorded wheel digest; it must preserve
continuity throughout that run rather than reuse an assumed local digest.

## Verification

| Check | Result |
| --- | --- |
| Full Unchain source, latest CI SDK environment | **4,174 passed / 16 skipped / 5 xfailed** |
| Full Unchain from the installed wheel, same SDK environment | **4,174 passed / 16 skipped / 5 xfailed**, 131.58 s |
| Full PuPu sidecar, same installed wheel | **2,676 passed / 17 skipped / 3,599 subtests passed**, 168.58 s |
| Context V2 gate, same wheel | **92 runtime + 24 host + 3 subtests + 2 strict-fake tests passed** |
| RunBundle gate, same wheel | **63 runtime + 31 host + 2 subtests + 36 Electron + 225 renderer tests passed** |
| Reconciled runtime focused suite | **79 passed** |
| Historical SQLite shape compatibility, combined focused matrix | **112 passed** |
| Historical Gemini 503 retry budget, focused matrix | **90 passed** |
| Electron capability repair | RED **2 failed / 56 passed**; GREEN **58 passed** |
| Complete Electron suite after startup-fixture alignment | **974 passed / 5 skipped**, 56 suites |
| Artifact requirement repair | RED **1 failed / 9 passed**; GREEN **15 passed**, including workflow checks |
| Real installed manifest → independent strict consumers | Electron and artifact consumers each **1 positive + 2 freshly-digested missing-feature negatives passed** |
| Release QA unit scripts | **400 passed / 6 skipped**, no failures |
| Long-run deterministic harness scripts | **62 passed**, no failures |

No new skip, expected-failure marker or admission bypass was introduced.
The old #386 cold-503 probe produced a fourth request before repair; the
expanded five-case regression was **1 failed / 4 passed**, then passed after
repair. Existing receipt-only/completed outcomes are recovered without sending
again; an existing STARTED lease stays uncertain.

The first local Context V2 attempt omitted the explicit installation binding.
Its runtime stage passed, but host collection selected stale sibling source
and could not import `unchain.context_content`. The identical wheel passed
all stages with the corrected binding. CI now exports that binding only after
installed-byte verification; normal application loaders are unchanged.

Two warnings were emitted by each complete Python suite. PuPu's warnings are
the deliberately malformed numeric Anthropic-signature fixture and a background
thread reporting `UNCHAIN_DATA_DIR` unset during an adapter-test teardown.
These are recorded rather than counted as failed assertions or silently hidden.

Local logs are retained under `/tmp/ticket390-ci-*`; artifact evidence and the
once-built wheel are retained in the isolated Unchain clone at
`.release-qa/ticket-390/pr395-ci-combined/`. These local paths are not remote
release receipts. Fresh GitHub run links/results are recorded on #390 and the
two PRs after push.

## Impact and delivery limits

Unchain's complete staged pre-commit graph check covered **175 changed symbols,
9 affected processes and 28 files, HIGH**, with no partial/truncated/error
result. Core retry/projector and Electron readiness upstream checks report
CRITICAL risk; the edits are bounded by the contracts and regression matrices
above. Unknown configuration-file graph results were corroborated by all
explicit workflow inputs and test-loader references.

PuPu's complete staged pre-commit graph reports **10 changed symbols, 1,108
affected processes and 13 files, CRITICAL**, with no partial/truncated/error
result. The delivery revision and graph result are also recorded on #390.
This is a risk report, not a low-impact or rollout all-clear.
The full readiness suite updates only its independent positive manifest
fixture to include the newly required features; its assertions remain intact.

Both PRs remain Draft. Unchain's fresh [CI run 37101522360](https://github.com/haoxiang-xu/unchain/actions/runs/37101522360)
passed on the combined runtime revision. PuPu GitHub QA is pending at this
document's commit; local success is not presented as its remote CI pass. Packaged/frozen-sidecar and live
manual acceptance of this reconciled pair are **NOT_RUN**. The existing user
profile and running acceptance instance were not modified or restarted. No
merge, issue closure or active rollout is performed by this CI repair.
