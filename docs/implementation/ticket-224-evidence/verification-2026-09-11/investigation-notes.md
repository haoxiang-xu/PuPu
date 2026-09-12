# #224 verification — 2026-09-11

Working tree: `/private/tmp/pupu-224`, PuPu PR #271 HEAD
`7e5c08de36bad0da1069287a3fb948ca91879fd9`; Unchain PR #30 HEAD
`36d7586dc2b7d0eca3d55ffb06f7fbc3860b291f`.
The project owner's original checkout is untouched. No commits or rollout.

The user explicitly waived `openai:gpt-4.1` testing on 2026-09-11.
Real `ollama:qwen3:32b` tests remain required. See raw evidence here.

## BC-001 / SEQ-001 — explicit submission after restart

Real packaged application testing exposed a pre-existing recovery defect:
a restored unanswered human-input question renders and records its answer,
but receipt lookup cancels the suspended attempt instead of continuing it.
The original candidate is identified in `candidate-identity.json` and remains
failure evidence, not an accepted candidate.

Bounded correction: only a current, explicit human-input submission may resume
an identity-matched, submitted durable receipt through the existing V4 resume
route. Merely observing a stored receipt on reload must retain the existing
sealing policy. No wire or manifest changes. Stop generations, request identity,
receipt identity and duplicate resume protection remain mandatory.

AC-006: recovered awaiting response -> explicit Unicode/spaces answer -> exact
receipt -> one resume of the suspended interaction, no cancellation.
AC-007: live callback submissions launch no additional stream; passive receipts,
mismatched receipt identities, duplicate submissions and Stop races cannot
trigger an extra resume. Missing resume availability must fail without canceling
the user's recorded answer. Test the rebuilt candidate with the same pinned
wheel and imported manifest before claiming deployed-pair acceptance.

Status: IN PROGRESS. Final checks and artifact identity will be recorded below.

## Development checks after the recovery correction

- Added explicit-submission ownership before POST so passive lookups cannot seal
  an answer while its POST response is in flight. Identity includes chat, session,
  interaction and Stop generation. The marker is memory-only; reopening an old
  recorded receipt retains the prior observational sealing policy.
- Positive recovery regression was red before the fix. Final suites: 104 tests
  passing across input UI, payload/recovery, composer, interject and turn mutation.
- Read-only reviewer caught the overlapping lookup race and failed-start dedupe
  retention. Both corrected; reviewer subsequently found no blocking issues.
- CI production build passes. Final graph check: 9 files / 21 symbols / 38 flows,
  CRITICAL. Complete result arrays match counts; no partial/truncated result flag.
  Index refreshed with 2048 KB file threshold to include use_chat_stream.js.
  Global graph inference caps still apply; source/tests supply additional evidence.
- Initial live desktop run: direct free input, blank and IME Enter protection,
  restart preserves exact pending question, Unicode/spaces submission displayed.
  Cold submission then failed to resume (the reproduced defect above).
- No-restart control: submitted path appears in tool_result; 32B asks a second
  bounded confirmation question. Reusing the first ID with a different answer
  is rejected as interaction_canonical_conflict / already_accepted_different_answer.

The candidate rebuilt after the recovery correction is still under live test.

## Artifact and scope notes

This is a local unsigned feature-audit candidate, not a release signing or
publication qualification. The pinned Unchain wheel and packaged sidecar are
unchanged by the renderer recovery fix. The normal user profile is untouched;
only `/private/tmp/ticket-224-profile` and disposable workspace paths are used.

Model × agent-builder audit is N/A: no provider/model/effort selection or builder
surface changed. Real application execution uses the shipped default graph recipe
with Core tools; its persisted pending records declare `resume_kind=graph_step`.
No subagent node or subagent toolkit is configured in that recipe, so a delegated
new-form interaction cannot be reached by these live runs. Existing kernel
subagent tests are regression evidence only, not a claim of a live delegated run.

The GPT-4.1 omission was explicitly approved by the user in this session:
“4.1 就不需要跑了”. Risk: no independent OpenAI-provider live coverage. The
required qwen3:32b provider remains covered with real tool calls and application
round trips. This omission does not waive the restart/resume acceptance checks.

## Second candidate finding and correction

Candidate `97bd4038f19ed6a23279e56c0bb7c32b0e01ef76b20914861751ea835767e328`
resumed a recorded bounded answer through the SAME original graph step. Its
journal contains exactly one graph.step.resume.admitted for that interaction,
then a real qwen3:32b provider call and a new bare-input question with a fresh ID.
However, restarting again at this new question exposed stale renderer recovery
state: the old receipt became resume_failed and disabled the new question.
This candidate is therefore superseded too.

Correction: root and child tool-call registration now replace the old receipt's
UI state with a lightweight awaiting_response identity when a new confirmation
arrives. Full recovery metadata still comes only from the authoritative pending
lookup; it is never copied from the prior receipt. Red/green regression uses V4
interaction events, a disconnect, fresh pending lookup, and a second explicit
answer that resumes only the new interaction. Read-only review passed.

Final development regression: 106 tests across 5 JS suites. Additional host
process-recovery / graph-resume tests against the installed pinned wheel:
21 passed plus 6 subtests. No Python production source changed in this turn.

Raw-agent Qwen probes 2/3 used OS-specific placeholder examples; they did not
choose or execute a destination. Actual desktop probes used generic path
placeholders and required the user's explicit path. The model prompt is guidance,
not a guarantee of identical wording across contexts; raw output is preserved.

Final graph reindex/change analysis after the new-question fix: 9 changed source
files, 66 indexed symbols, 49 affected flows, CRITICAL. Complete raw arrays match
both counts, with no partial/truncated flag. Symbol overlap includes enclosing
callbacks/properties; this count is a conservative review aid, not 66 independent
behavior changes. Exact source patch is `/private/tmp/ticket-224-verification.patch`
and applies on PuPu PR #271 HEAD stated above.
