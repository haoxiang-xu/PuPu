# #224 — final CI correction and repeated verification

The current delivered diagnostic candidate is
`546853f3498fcf0aba98723f38c67b1070c3bd4f829e56bf0542e9af741b97bd`.
It supersedes candidate `2bc66d…` for delivery. [Exact identity](final3-candidate-identity.json).

## CI finding and correction

PR CI on `fd13ae18` exposed two failures in chat.test.js (both also exercised by
the RunBundle gate). Its frontend step used continue-on-error, so a completed
step was not evidence of a passing suite. The failure was investigated before merge.

- The old failed-human-input test still expected cancellation after an explicit
  answer. It now requires exactly one resumed run with the exact session/source
  attempt/interaction, one POST, a confirmed answer and no cancellation.
- Adding runTurnRequest to lookupDurableInteraction's dependencies caused passive
  recovery to run twice when sender inputs changed, duplicating cancellation of
  the same recorded receipt before queued relay. A ref mirrors the latest sender
  while keeping the lookup stable. The preexisting test retains its one cancel,
  one queued successor and no automatic resume assertions. The reviewer reproduced
  baseline PASS, current FAIL, and isolated the callback dependency as the cause.
- The in-flight answer race test used the wrong selectTreeNode signature and had
  relied on incidental rerenders. It now actually switches to another chat and
  back, asserts the rendered chat identity and observes a fresh lookup.

Both full suites pass: **188 tests**, including all 164 chat-page tests and 24
payload/recovery tests. [Log](224-ci-recovery-final3.log). Production build passed;
independent review of the three-file correction found no blocker. Graph analysis
of the complete source patch: 10 files, 66 symbols, 49 flows, CRITICAL; result
arrays are complete. [Graph](ticket-224-final3-graph.json).

## Exact candidate verification

The candidate was rebuilt using the same all.v1 feature snapshot, packaged
sidecar, reused Unchain wheel and imported runtime manifest. Archive asar and
sidecar hashes match the launched files. Source changes since fd13ae18 are the
sender-ref correction and tests only; the wheel/sidecar bytes are unchanged.

- app.asar: `6ae4d8d925215dbabf7c8e34d3095e41f6826efcb5c53957087e524845a2f156`
- sidecar: `c890efcd6c32e354fada21073ab388b89ed9aa883cab05bfef133564323d4ea7`
- wheel: `13aa7c14a3fb454afb8a8082f26e630c87f7e469be3d9c6e8c74cd337d8e8282`
- manifest: `ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc`

The exact new package ran qwen3:32b in the isolated profile. It asked a real path
question with options=[] and allow_other=true. Sidecar PID 52530 was killed and
replaced by PID 61544; the same interaction remained actionable. Blank Enter and
composing Enter did not submit. Normal Enter trimmed outer spaces and submitted
`/private/tmp/ticket-224-live-qwen/workspace/中文 最终三`.

[Original question](ticket-224-final3-first.json), [restored identity](ticket-224-final3-restored.json),
[blank/IME/submission](ticket-224-final3-submission.json),
[receipt and one resume admission](ticket-224-final3-after-submit.json).
The full 42,004-byte next provider wire was read in chunks and its SHA-256
`3b82fa1a04aa69cc186ec6e82a9acd01c7edca729129f0b6c259892de431ef95` verified;
it contains that exact answer. [Wire](ticket-224-final3-wire.json).

The original graph step `graph-step-a89fce41a6166c5a27c92f4dcf1dd8f7febc8771c0e3d10b5538dcca61032e5d`
then completed. There is one request, one resolution and one resume admission;
the journal records graph.step.completed and graph.execution.completed, pending
is none, and the model's final response is “测试完成”.
[Complete journal](ticket-224-final3-completed.json), [screenshot](ticket-224-final3-completed.png).
The preserved trace still displays the deliberately induced process-exit error;
completion is established by the authoritative journal and final model response.

The model did not ask the extra confirmation requested in this final prompt, so
this run is not claimed as another live successive-question test. Successive
root/child questions have final-source integration coverage; the prior candidate's
real successive-question/restart evidence remains supplemental. The unchanged
wheel's original three 32B prompts and strict admission matrix remain applicable.
No project-file side effects were executed. A different answer against the closed
interaction was rejected (graph owner missing); this is distinct from the earlier
pending-successor canonical-conflict probe. [Rejection](ticket-224-final3-stale.json).
The probe chat was deleted through the normal tree API and the test app stopped.
[Cleanup](ticket-224-final3-cleanup.json).

GPT-4.1 remains explicitly waived by the maintainer. The earlier Stop/immediate
Send ownership race remains a separate documented limitation. Release #203 is not
closed by feature delivery. GitHub issue #224 records final audit, CI and merge SHAs.
