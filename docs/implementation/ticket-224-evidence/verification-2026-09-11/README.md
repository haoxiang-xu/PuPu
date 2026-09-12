# #224 — local verification complete

PuPu issue [#224](https://github.com/haoxiang-xu/PuPu/issues/224), Release #203.
Verified 2026-09-11, America/Vancouver. GPT-4.1 was explicitly omitted by the
maintainer: “4.1 就不需要跑了”. See [waiver record](gpt-4.1-waiver.md).

The real qwen3:32b desktop path now accepts a bare text answer, preserves the
Chinese/spaces path, and resumes the original graph step after restart. A later
question remains actionable across another sidecar restart. Ordinary messages
work after cancellation settles; an immediate-send race is recorded below.

## Reviewable changes

Persistent checkout: `/Users/i770092/git_repos/PuPu-224-verification`.
Base: PuPu PR #271 HEAD `7e5c08de36bad0da1069287a3fb948ca91879fd9`.
Unchain PR #30 HEAD `36d7586dc2b7d0eca3d55ffb06f7fbc3860b291f` is unchanged.
Original `/Users/i770092/git_repos/PuPu` checkout remains clean.

Verification corrections included in this delivery:

- Prevent IME Enter from submitting a partially composed answer.
- Resume only a current explicit human-input answer with an exact durable receipt;
  retain the existing policy for passively observed old receipts. Protect against
  concurrent lookup cancellation, duplicates, mismatches and Stop generations.
- Give subsequent root/child questions their own awaiting-response UI identity,
  so disconnection cannot put the old receipt into a state that disables them.
- Fix two production-build hook dependency findings and align three release QA
  assertions with the already-shipped `all.v1` profile schema.

The maintainer authorized commit, merge and closure after successful verification
(“跑通的话就提交然后close”). This report records the tested candidate; GitHub
PRs #271 / unchain #30 and issue #224 record the subsequent CI and delivery state.
The candidate was built from the base above plus the source changes in this
delivery commit; adding evidence and committing does not change its runtime inputs.

## Exact candidate pair

The unsigned local diagnostic package is preserved in this checkout's `dist/`:
`PuPu-ticket-224-final-candidate.zip` (build version 0.1.10).

| Artifact | SHA-256 |
| --- | --- |
| PuPu candidate | `2bc66daae1e1f8cf69b02ca69f7f3546a01562f080c02d21cc27de676389ce1e` |
| app.asar | `38a35f54e8e310b47565f851d5b603fd5792fefa9f5ae137fbb35d698d14fba5` |
| Packaged sidecar | `c890efcd6c32e354fada21073ab388b89ed9aa883cab05bfef133564323d4ea7` |
| Reused Unchain wheel | `13aa7c14a3fb454afb8a8082f26e630c87f7e469be3d9c6e8c74cd337d8e8282` |
| Imported runtime manifest | `ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc` |

Archive contents match the launched asar and sidecar; the wheel was built once.
[Identity record](final-candidate-identity.json). Earlier candidates in the
investigation notes are superseded failure evidence, not accepted packages.

## BC-001 / SEQ-001 results

The original [implementation plan](../../ticket-224.md) defines the CLOSED request
and response boundary. This correction adds no wire keys, migration or protocol
version. New resume metadata always comes from the strict authoritative pending
response. Submission ownership is memory-only and scoped to chat/session,
interaction and Stop generation; merely reopening an old receipt does not resume.

- Original three prompts exercised with the real installed-wheel Agent and
  qwen3:32b: concrete choices for prompt 1; empty options + allow_other for 2/3.
  Raw evidence is in `qwen-agent/`. Some raw placeholders contain OS-specific
  examples; no destination was selected or executed by guessing. Desktop runs
  used generic placeholders and explicit user answers.
- Final packaged UI: blank Enter and composing Enter keep awaiting_response;
  normal Enter trims outer spaces and sends `/private/tmp/ticket-224-live-qwen/workspace/中文 最终`.
  [Submission](ticket-224-final2-submission.json), [tool result/journal](ticket-224-final2-after-submit.json).
- The actual next provider request contains the exact path. Its complete artifact
  was read in chunks and SHA-256 verified: [decoded wire](ticket-224-final2-provider-wire-decoded.json).
- qwen3:32b then asks a new confirmation question quoting that exact path. New IDs
  differ and the new field starts empty. After another sidecar restart, that new
  card remains actionable and submitting resumes only its new ID.
  [Restart](ticket-224-final2-second-restart.json), [resume](ticket-224-final2-second-resume.json).
- Four distinct question IDs have one request and one answer each; the three cold
  resumptions have one admission each; the final candidate owns the latter two,
  while the first belongs to the superseded candidate and is preserved history.
  All use the original graph step identity.
  No question replay or duplicate tool action was observed; this probe used only
  ask_user_question and deliberately did not execute project-file side effects.
- Old-ID/different-answer submission is rejected as canonical conflict:
  [negative case](ticket-224-final2-stale.json). Readonly history is visible in
  [the restart screenshot](ticket-224-final2-second-restart.png).
- Normal same-chat follow-up completes with “测试完成” after cancellation settles:
  [final response](ticket-224-final2-followup.json). Both probe chats were removed:
  [cleanup](ticket-224-final2-cleanup.json). Only the isolated test profile was used.
- Real application execution covers the shipped default graph with Core tools.
  No subagent node/toolkit is configured there, so a delegated live question is
  not reachable in these runs. New-form root/child V4 recovery has renderer
  integration coverage; generic kernel subagent tests are regression evidence,
  not a claim of a live delegated model run.

## Local feature-audit checks

| Check | Result and evidence |
| --- | --- |
| i18n | PASS: 733 keys, 10 locales; no missing/orphan/placeholder mismatch. Existing informational dead/dynamic references retained. |
| UI | PASS: reused TextInputInteract/TextField/Button; direct input, IME, blanks, Enter/button, history, selectors and Other covered. |
| Model × agent builder | N/A: no provider/model/effort selection or builder surface changed. |
| Static rules | PASS: JS-only, existing bridges/styles; production build and diff check pass. |
| Real end-to-end | PASS for qwen3:32b with the exact pair above; GPT-4.1 omitted by explicit user instruction. |

106 tests pass in the final five JS suites (input UI, payload/recovery, composer,
interject, turn mutation). Earlier focused API/recovery/history suites passed;
Unchain targeted suites: 156 passed. Host process/graph recovery: 21 passed and
6 subtests. Release QA: 238 passed, 1 skipped; harness: 62 passed. Production
build, notices check and five packaged-sidecar smoke checks passed.

Final graph analysis: 9 changed source files, 66 indexed symbols, 49 affected
flows, CRITICAL. Complete result arrays match counts and have no partial/truncated
flag; index-wide inference caps still apply. Source review and tests cover the
callback/dynamic dispatch gaps. Independent read-only review passed after finding
and verifying the IME, concurrent lookup, failed-start and later-question fixes.

Main commands and output: `ticket-224-tests-final2.log`,
`ticket-224-build-final2.log`, `ticket-224-host-resume-tests.log`,
`ticket-224-python-tests.log`, `ticket-224-release-qa-after.log`,
`ticket-224-graph-final2-raw.json`, `ticket-224-i18n.json`.
Build used Node 22 and the frozen all.v1 feature snapshot; Python tests used the
isolated Python 3.12 environment importing the pinned wheel. Actual sidecar
processes were restarted for desktop verification.

## Additional observed limitation

Stop followed immediately by Send can return the retryable
`session_execution_in_progress` / “another execution currently owns this session”
while the prior provider execution is releasing ownership. Once it settled,
the same chat accepted the retry and completed normally. Immediate retry is not
claimed as passing. No cancellation-lease or normal-send retry policy was changed;
see [follow-up details](stop-send-follow-up.md). This is separate from the now
verified answer/restart continuation path.
