# #384 remote checkpoints

## Initial reviewed plan: f5d0278ecc38f7b2978210c826c687f14875aff6

Pushed `codex/ticket-384-interrupted-tool-chain` to existing authenticated origin `https://github.com/haoxiang-xu/PuPu.git`. Then cloned that branch directly from GitHub, depth 1, into a fresh independent checkout `/Users/red/Documents/Codex/2026-10-02/task-3/pupu-384-remote-proof` (not seeded from any local clone). Both source and restore HEAD equal `f5d0278ecc38f7b2978210c826c687f14875aff6`. `cmp` confirms identical implementation-plan and independent-review bytes. Restore `git status --short` is empty. This proof completed before Luna's first test/source edit.

Existing Git authentication was used; no credential was generated or copied. DNS required normal sandbox network escalation, which succeeded. No draft PR was created.

## Pre-edit graph risk and bounded rebuild

One full forced no-parse-cache rebuild completed with 1024 KiB max-file-size to include the 550,802-byte streaming hook. Repository identity is the independent #384 checkout at baseline `0047d58d`. GitNexus 1.6.12: 44,396 nodes, 150,330 edges, 1,201 flows. The isolated registry is `/Users/red/Documents/Codex/2026-10-02/task-3/gitnexus-home`; no shared index was mutated.

Settlement upstream impact: **CRITICAL**, 8 affected symbols / 5 direct callers: useChatSessionState, useChatStream, cancelCurrentStreamAndSettleMessages, cancelRunForTest, settleUnavailableStream. Stop callback upstream impact: **HIGH**, direct stopStream/deleteTurn, indirect useChatStream/ChatInterface. Warnings were sent before code edits. TraceChain remains **UNKNOWN** because JSX calls are not resolved; direct source corroborates ChatBubble's lazy import and recursive nested TraceChain rendering. Process enumeration/callable fanout is capped; absence is not proof of safety. Full impact outputs are retained alongside this record.

The previous incremental refresh temporarily lost helper/renderer lookups. The one forced rebuild recovered both; no further infrastructure repair is planned. Docs-only staged graph check found 2 files/11 sections, zero affected processes, low risk before the initial plan commit. Production-symbol scope still requires graph analysis plus source corroboration before each source checkpoint.

## Remaining coordination

#383/#390 shared profile access stays off limits. Real connected-app pause/reopen, provider requests, approval clicks and cold sidecar restart remain NOT_RUN. Active rollout INCOMPLETE. Draft PR requires source-parent coordination after full review.

## Red and first source checkpoints

- `0ef41b29455b30654481cb979c5187279f181258`: baseline red regression checkpoint, four suites / six expected failures / 61 passes. The failures include the actual composer `onStop` callback through the real hook and storage. No production source edits in that checkpoint.
- `f3d3fd6b7618509b62d91f77b393409825140945`: meaningful root/nested execution-history retention and interrupted status projection. Four focused suites / 70 tests passed. Staged graph detection reported 7 files, 11 symbols, 14 processes, HIGH risk; source corroborates shifted line mappings and newly added helpers absent from the baseline index. Both commits were pushed using existing authentication and `ls-remote` readback matched exact HEAD.
- Independent #383 integration probe: first source patch applied cleanly to detached `7e7abc21` in a separate task-local clone; eight suites / 124 tests passed, including grouping and interaction rendering. This is source-integration evidence only. No #383 commit, policy or candidate wheel was adopted into #384.

Intermediate review 1 is saved separately and requests a nested visible-status correction; additional state-sequence and compiled-consumer checks remain pending. Small remote checkpoints do not count as extra reviews.

## Correction and timing checkpoints

All checkpoints below were pushed to the same dedicated branch using existing authentication; remote `ls-remote` readback matched each full source SHA.

- `e957848de3fe9417d25e55831309079296780c03`: review-1 nested visible-status/active-branch correction, supported-history negatives and ordinary renderer compatibility; 4 suites / 76 tests passed. The independent pre-correction replay reproduced five expected failures. The first CI build exposed a missing cancellation-state memo dependency rather than producing an accepted artifact.
- `a074f48d26d1f2b50131c4a6e482f78fb04c0436`: includes `isCancelled` in the timeline memo dependency list. CI web build passed with actual compiler child exit status 0; wrapper success alone was not used.
- `d713e2584e20fff1bfa6af43d3f13ac5dff4b432`: red actual V4 admitted-batch case and byte-identical accepted-producer fixture; already-projected own result preserved in the paired passing case. No drain implementation in this checkpoint.
- `ce9e434c069c14cf0ae6bf7997671d6d065d1394`: synchronous stop-only drain of the exact current V4 handle before identity capture and generation invalidation, with no await or admission change. Final pre-drain replay: 3 expected failures, 2 passing timing cases. Six focused suites / 109 tests passed; final CI build actual child status 0. The final source patch applies cleanly to isolated detached #383 `7e7abc21`, where 10 suites / 163 tests passed. No #383 policy/runtime adoption.

The full frontend run on `ce9e434c` passed 443/445 suites (5402 tests, 5 skipped) and failed 8 tests solely in two isolated vault-listener suites. An independent ephemeral loopback probe confirmed sandbox `listen EPERM`. The same two suites passed 30/30 tests after an authorized isolated-loopback rerun on identical source. Combined closure is 445 suites / 5410 passing / 5 skipped; this is explicitly not a single all-green aggregate run. See `aggregate-closure.json` and its attributed raw-log hash.

Intermediate review 2 found no production defect and requested two actual-hook evidence cases: buffered child calls/results and Stop on the second interaction after resume. Test-only corrections are being checkpointed separately; compiled saved-record remount/reload verification remains pending at this record's update. Real-device cells stay ON HOLD.

## Final focused and compiled checkpoints

- `5a2e3fa52ded0a29098d828898d6800bccb832ce`: review-2 test-only correction plus aggregate/build records. Both added cases fail for the intended reasons on immutable pre-drain `d713e258` and pass on current production. Root and the same second reviewer independently pass 6 suites / 111 tests; both findings are resolved.
- `0d672d5425419b4b79687258daf8b0b99d3b5e26`: production-config compiled actual consumer, saved-record unmount/Return/cold page reload for generic/nested/approval, source/lock/bundle hashes, request readback and inspected PNGs. Final #383 integration includes both new cases: 10 suites / 165 tests. Pushed fast-forward and exact remote readback matched; dev remains `0047d58d`.

The task-owned remote-proof checkout was then fetched directly from authenticated GitHub and restored clean at detached `0d672d54`. Its entire tracked tree equals the source tree; nine production/test/plan/QA/report/PNG files were independently byte-compared. See `remote-restore-proof.json`. The initial plan restore at `f5d0278e` still predates every implementation edit. This fetch was depth 1; the shallow local remote-tracking update's ancestry display is not a force push (all source checkpoint pushes were ordinary fast-forward pushes).

Root's temporary QA server and browser contexts were closed after verification. Read-only final shared-checkout checks still show unrelated main growth/store dirty files preserved, #383 clean at `7e7abc21`, Unchain main clean at `48f235dc`. No shared app/profile access. Remote combined-status readback at `0d672d54` has no statuses; Release QA triggers on PRs to dev/main or version tags, so remote PR CI is NOT_RUN until a coordinated draft PR exists. Final independent Sol acceptance is recorded separately when complete.

Final independent GPT-6.1 Sol acceptance of 0d672d54 is PASS for the isolated repair, ready for draft delivery after parent coordination. The reviewer independently passes 6 suites / 111 tests, verifies all 73 production artifacts and QA/source/lock/wheel/fixture/verifier/PNG/raw-log hashes, and inspects all three screenshots. No unresolved production finding. This final evidence commit adds only report/provenance/current-status prose; production/tests/QA code remain unchanged. Real rollout remains ON HOLD / INCOMPLETE.
