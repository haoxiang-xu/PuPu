# Ticket #224 — free-text human input implementation plan

Ticket: https://github.com/haoxiang-xu/PuPu/issues/224
Release: #203, v0.1.11
PuPu workspace: /Users/red/Desktop/GITRepo/pupu-224
PuPu base: dev @ cc2047a978965764ec13894dcf0cc8e73a44082e
Unchain workspace: /Users/red/Desktop/GITRepo/unchain-224
Unchain base: dev @ b98e532f244170e33c9c63f47f5c9ed9ade69567
Both branches: codex/ticket-224-free-text
Phase: transferred for verification on another computer. Start with [ticket-224-next-agent.md](ticket-224-next-agent.md) and the current issue top section. The user authorized remote preservation, local clone cleanup, and merge/close after successful verification; older wait-for-close instructions below are history.

## Goal and evidence

Keep the ticket's existing What & Why and AC-1 through AC-5. Make unbounded
questions such as a folder path answerable directly, while preserving concrete
single/multiple choices and malformed-request error results. Do not add a new
wire kind, a path picker, a new toolkit, or unrelated UI refactors.

Unchain baseline reproduces `options: [], allow_other: true` raising ValueError.
The declared tool schema sets additionalProperties=false, yet the parser accepts
unknown top-level and option fields. Tightening this advertised CLOSED boundary
is in scope; schema-valid existing selector requests remain valid.

At PuPu base cc2047a, SingleSelectInteract/MultiSelectInteract suppress the input
until Other is explicitly picked. The ticket's statement that the existing UI
already renders a bare input is inaccurate; an input-only rendering branch is
needed in both existing components. No new component primitive is required.

Baseline Unchain tests: 63 passed across test_human_input, test_kernel_runtime,
test_kernel_agent, test_interaction_effects, test_durable_tool_exposure_replay.
Local Ollama inventory has qwen3:14b, not qwen3:32b. 14B evidence cannot satisfy
AC-1's 32B requirement. Record that required live check as NOT_RUN until available.

## Fixed implementation decisions

1. Retain `kind: selector`, the existing request dictionary keys, selection_mode
   single/multiple and the existing __other__ response encoding. Free text is
   `options: []` plus `allow_other: true`; prompt models to use single. Accept
   either supported mode with this shape; existing count checks limit it to one
   available selection. No model-authored kind or question_type field is added.
2. In HumanInputRequest.from_tool_arguments, first require parsed arguments to be
   an object and reject keys outside the existing advertised parameter set.
   Require options to be a list; permit it empty only with strict boolean
   allow_other=true. Preserve defaults, duplicate/reserved values, min/max and
   all existing field normalization. Do not coerce malformed data or synthesize
   an Other option. HumanInputOption.from_raw rejects unknown option fields.
3. Keep from_dict/to_dict and response encoding unchanged unless concrete tests
   expose a blocker; ask the strong planner before extending edits. from_dict
   passes only known tool argument keys and gains the new form through admission.
   Durable envelope/response strictness remains in the existing durable validator.
4. Prompt/tool parameter guidance distinguishes bounded choices from free text
   with a complete path/name example using options=[], allow_other=true, single,
   and a meaningful input label. Never create custom_path/enter_text/placeholder
   options. Ask the blocking destination question before unrelated feature scope.
   Do not guess an OS-specific path; no fallback to plain assistant discussion
   when the tool can accept the needed free-text answer.
5. UI-only behavior for empty-options+allow_other: reuse TextInputInteract (already built on builtin TextField and Button) with
   a meaningful label, omit radio/checkbox affordance, require trimmed
   nonempty text before submission, and submit __other__ plus other_text using
   the existing single/multiple callback shape. Preserve disabled/history state.
   Keep the existing nonempty selector branch unchanged. User choice: reuse the
   existing TextInputInteract and styling; no design alternatives are required.

## Functional path and files

Unchain CoreToolkit -> build_ask_user_question_tool -> provider tool call ->
parse_human_input_request -> HumanInputRequest.from_tool_arguments -> tool harness
suspension -> human_input_request dict and continuation/durable journal -> PuPu
sidecar/SSE/Electron projection -> SingleSelectInteract or MultiSelectInteract ->
existing submit response adapter -> HumanInputResponse -> tool result -> resume.

Primary Unchain production edits: src/unchain/input/human_input.py only.
References: src/unchain/interaction/{resume,runtime,requests}.py;
src/unchain/tools/execution.py:743 error handling; tests/test_kernel_agent.py;
tests/test_durable_tool_exposure_replay.py (durable receipt/cold resume examples).
Unchain new tests: tests/test_human_input_free_text.py and bounded integration
coverage as agreed at checkpoints. Existing tests should continue to pass.
PuPu primary UI edits: src/COMPONENTs/chat-bubble/interact/{single_select_interact,
multi_select_interact}.js and colocated tests. Confirm mapping helpers by clone
GitNexus query/context before implementation; do not invent an adapter.

## Impact and constraints

Unchain clone was freshly indexed at its base with GitNexus 1.6.11.
from_tool_arguments: HIGH; direct parse_human_input_request and from_dict callers;
flows include build_tool_delta and context tool invoke. HumanInputOption.from_raw:
HIGH, directly called by admission. Tool builder: LOW, CoreToolkit._register_tools.
from_dict: CRITICAL, called by context snapshot, durable answer normalization and
resume delta construction; deliberately no direct edit planned. Parser helper:
HIGH; validate decoded object at admission rather than editing this shared helper.
Index reports global process/callable-flow caps; absence of a flow is not evidence
of no impact. Corroborate the relevant source paths and run actual regression tests.
PuPu SingleSelectInteract/MultiSelectInteract impact: UNKNOWN (dynamic registry).
Text corroboration confirms interact_registry single/multi mappings and
InteractWrapper rendering via interactRegistry[resolvedType]. Test these live
entrypoints and both response shapes. Relevant skipped oversized stream source
will be included in a refreshed index during CP1.

Follow all local AGENTS.md, GitNexus impact requirements, JS-only/inline styling,
preload boundaries and sidecar restart rules. No commits, pushes, PRs or feature
audits before user close. run_tests.sh still checks legacy `import miso`; use this
clone's .venv/bin/python -m pytest directly, not system pytest or npx jest.

## BC-001 — request and reply across Unchain and PuPu

Producer: model-authored tool args admitted by HumanInputRequest. Canonical form:
HumanInputRequest with request_id=tool call ID, selector kind, fields normalized
by the existing parser. Consumer/wire: to_dict through sidecar/SSE/main/renderer;
response returns through existing UI adapter to HumanInputResponse/durable runtime.
Admission CLOSED: exact allowed top-level tool keys and option keys, supported
modes, strict types, distinct nonreserved option values. Unknown/invalid request
returns error tool_result; never emit a pending broken prompt. Wire key set stays
{request_id,kind,title,question,selection_mode,options,allow_other,other_label,
other_placeholder,min_selected,max_selected}. Option keys stay label/value/description.
Input reply selected_values=[__other__], nonblank other_text, matching request_id;
blank text, wrong ID, unsupported selected value or duplicate selection fails.
No migration or new schema version: old valid selector payloads remain readable;
new free-text producer requires the updated runtime parser. Do not roll a new
producer to an old consumer that rejects the shape. Runtime capability decisions
remain based on imported protocol manifest, not Git identity. Freeze one Unchain
wheel for package/cross-boundary verification; record its SHA-256 and imported
runtime manifest digest alongside the actual PuPu candidate digest at close.

AC-001 maps original AC-2: admit pure input, exact producer key set, render directly,
submit actual text and resume. AC-002 maps original AC-4: malformed/unknown request
returns tool error without pending interaction, plus invalid reply negatives.
AC-003 maps original AC-5: existing single/multiple selectors and Other behavior
remain unchanged. AC-004 maps original AC-1/AC-3: raw tool args for the ticket's
three prompts, qwen3:32b required; supplement other available provider/model probes
without claiming untested models pass. Maintain original AC labels in ticket body.

## SEQ-001 — successive questions and durable resume (BC-001)

Identity: session ID + run ID + tool-call request_id; initial state has no pending
interaction. First valid input question suspends -> empty reply rejected with no
resume -> valid reply consumed once -> second question with new request_id suspends
-> old request ID rejected -> second valid reply resumes. Verify normal subsequent
messages still proceed. Cold resume: preserve the pending serialized request and
receipt; construct a fresh Agent/runtime with the persisted store, resume using
that same request, verify text reaches tool_result, and do not rerun the original
question or duplicate external effects. Cover repeat/stale receipt behavior via
existing durable tests plus input-specific cases. Normal path and serial repeated
interactions apply; inspect graph/subagent consumers and record exact tested vs
NOT_RUN paths. No active rollout or acceptance claim with untested required cells.

## Model assessment and checkpoint handoff

Assessment: PARTIALLY SUITABLE. Once these decisions/UI picks are settled,
admission, guidance and renderer changes are bounded and have observable tests.
Cross-repository integration, protocol/compatibility judgment, cold resume evidence
and live model diagnosis stay with the strong parent. Worker: gpt-5.6-luna, high
reasoning, using actual agent dispatch; reviewer/planner: the current strong parent.
Do not give the worker any unresolved architectural or product choice.

CP1: delegate only Unchain admission/prompt plus new focused tests. Capture tests
failing before production edits and passing afterward. Cover free input both modes,
strict request/option keys, type errors, min/max, duplicates/reserved values, JSON
string input, serialization roundtrip and invalid responses. Worker stops; parent
reviews actual diff and reruns targeted regression. No UI or lifecycle edits yet.
CP2: after CP1 and user design decision, delegate only approved UI edits/tests in
PuPu. Parent checks direct reachability, no extra picker step, no blank submissions,
real callback payload, disabled/history behavior and untouched selector behavior.
CP3: parent runs cross-repository producer-fixture/renderer/response checks,
successive/cold-resume regressions and available live probes. Fix drift before
implementation-ready. These checkpoints are development supervision, not audit.

Worker must stop for unexpected test failure, missing interface, scope expansion,
changes outside the listed files or any conflict with settled decisions. Report
diff/test commands/results and questions; do not guess, commit, push or self-release
past the current checkpoint. Only the parent authorizes the next slice.

## Implementation discovery — recovery admission
Both PuPu isCanonicalHumanInputPayload validators reject empty options today:
src/SERVICEs/api.unchain.js and src/PAGEs/chat/hooks/durable_interaction_recovery.js.
The strong parent will change only the empty-options predicate to require
allow_other === true while preserving all other strict wire checks. API impact
LOW (isCanonicalDurablePresentation); recovery impact HIGH (same local caller,
four affected processes). Regression tests must pass real Unchain-produced,
PuPu-sidecar-projected payloads through both validators, including negatives.
This is BC-001/SEQ-001 completion within the original scope, not a new capability.

CP2 strong review complete: both selector modes reuse TextInputInteract directly.
Review caught and fixed an unsent-draft reset on parent rerender. The same-request
draft survives rerenders; new request_id resets the field. Real builtin input and
button tests cover Enter/click submission, trimming/blank rejection, disabled
history and unchanged bounded choices/Other. The registry test submits the exact
Unicode fixture response used by the real host response producer. CP2 red baseline
had 10 failures; final focused UI suite has 15 passes. Final combined PuPu suites:
110 passed across UI, API, recovery and trace/history. No shared UI primitive changed.
CP3 development integration review complete; remaining live/deployment cells below
are explicitly pending and are not waived by these development checks.

## Development evidence and remaining verification

CP1 passed strong review after adding explicit blocking-question/path/fake-option
prompt rules. Runtime targeted suite: 93 passed; additional existing durable,
graph-resume and subagent suite: 63 passed. New tests exercise real Agent tool
suspension/error handling and persisted receipt/fresh-Agent resume, with scripted
model turns. PuPu API/recovery: 38 passed; trace/history adapters: 46 passed.
Red baselines: runtime admission 15 failures; runtime integration 5 failures;
producer-fixture API/recovery two positive failures before fixes. The two remaining
serial-test failures after admission were a test assumption about OpenAI remote
continuation; corrected to assert successive output deltas, not full history.

Local qwen3:14b supplemental raw-provider probes (temperature 0, thinking disabled,
actual CoreToolkit tool definition/prompt, no tool execution): all three original
prompts returned valid admitted calls. Run 1 concrete stack choices; Runs 2/3 bare
path input, no fake choices. See ticket-224-live-probe.json. qwen3:32b remains
NOT_RUN because the local model is absent. Other shipped-model combinations and
full live Agent tests remain NOT_RUN; do not infer acceptance from 14B raw probes.

Built one development Unchain wheel, /tmp/224-wheel/unchain-0.2.0-py3-none-any.whl:
SHA-256 f17a41d5b50da559b80c9c935832a74d6017334754eb3702aad6a19c2d860545.
Imported wheel module verified at /private/tmp/224-wheel-site/unchain/input/human_input.py;
actual runtime manifest strictly parsed, digest
sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc.
Wheel-targeted free-text tests: 30 passed. Fixture --check against this installed
wheel and actual PuPu host producer passes. This is development package smoke,
not evidence for an as-yet-unbuilt packaged PuPu release candidate. On close,
reuse this wheel if source is unchanged and record the exact PuPu candidate digest;
otherwise supersede it explicitly and rerun the complete applicable pair matrix.

SEQ-001 coverage: initial question, second question, invalid blank/stale response,
receipt retry, fresh persisted-store Agent resume and normal follow-up PASS in
runtime development tests. Existing graph/subagent regressions PASS, but new-form
full graph/subagent execution and real application sidecar process-restart cycles
are NOT_RUN. Fresh Python verification processes loaded changed code; the user's
running PuPu sidecar was not modified/restarted. Install the matching wheel and
restart the sidecar before checking the active application. Active rollout remains
INCOMPLETE until required model/artifact/state cells are evidenced. No audit run.
