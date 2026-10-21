# Ticket #411 — Gemini 4 Argon

Ticket: https://github.com/haoxiang-xu/PuPu/issues/411; direct Release #318 child.
PuPu workspace: `/Users/red/Desktop/GITRepo/pupu-411`, branch
`codex/ticket-411-gemini-4-argon`, dev base `b2700372578b0fa8837c173b2b44ae2acbfdf96b`.
Unchain workspace: `/Users/red/Desktop/GITRepo/unchain-411`, same branch name,
dev base `8cd825239a6d14b7fdee17b7912562c3810f2677`.
Start phase: no commits, push, PR, acceptance audit or cleanup until requested close.

## Goal and researched decisions

Register the exact native `gemini-4-argon` ID and make it selectable in chat and
the recipe model list. Reuse the existing Gemini `generate_content_stream`
transport and canonical signed-parts replay. Keep the default Gemini model
`gemini-3.6-flash`; no provider migration, billing/pricing catalog change,
background execution, long decode, audio/video inputs, computer use or new UI.

Official sources checked 2026-10-20:
- https://ai.google.dev/gemini-api/docs/models/gemini-4-argon
- https://ai.google.dev/gemini-api/docs/latest-model?hl=en
- https://ai.google.dev/gemini-api/docs/generate-content/long-decode

Argon has a unified 1,048,576 context window. PuPu exposes the supported synchronous
streaming subset: 65,536 maximum combined thinking/output tokens, text/image/PDF
inputs, tools, structured output, and thinking `low`, `medium` (default), `high`.
The newer SDK can automatically continue long decode above 65,536; reject that
range instead of silently enabling extra network sends. Explicit cache,
sampling and background/continuation options are outside this catalog contract.
Use the installed pinned google-genai 1.68.0 for the PuPu artifact pair as well
as the development SDK for Unchain regression tests. Do not bump dependencies.

Flow: wheel resource → host raw capability loader → `/models/catalog` → existing
renderer capability normalizer/model picker → selected `gemini:gemini-4-argon`
and reasoning effort → host `_build_payload` → native defaults/allowlist →
durable wire preparation or direct adapter → strict SDK config → streamed text,
thoughts and function calls → existing journal/replay.

The existing chat picker, reasoning selector, attachment affordances and recipe
Select are reused. Only a model option is added to the existing constant; there
is no layout, new component or visual interaction to design.

## Files, impact and invariants

Unchain:
- `runtime/resources/model_capabilities.json`, `model_default_payloads.json`:
  add exact records matching existing 3.8 Flash shape, limits and thinking defaults.
  Allow only `max_output_tokens` and `thinking_config` from user/default payloads.
- `providers/gemini.py`: validate the Argon-specific synchronous config before
  SDK/client creation; use a 15-minute Argon timeout, preserving one SDK attempt.
- `providers/wire_preparer.py:_gemini_route`: validate the same model contract
  before issuing a durable envelope. Do not mutate a frozen envelope at send time.
- New small `providers/gemini_config.py` validator, scoped to the exact model ID.
  Reject invalid token counts, invalid/unsupported thinking fields and levels,
  sampling, explicit cache and continuation options at the final config boundary.
- `tests/test_september_native_models.py`: expand the exact catalog expectation.
- New `tests/test_gemini_argon.py`: resource, projection, direct stream, durable
  envelope, signature/tool continuation, strict negative and prior-model cases.

PuPu:
- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js:MODEL_OPTIONS`:
  one option, preserving existing component and defaults.
- New host tests and renderer fixture contract tests; existing production host
  loaders/effort mapping need no behavior change unless a regression proves one.
- Evidence under `docs/implementation/ticket-411-evidence/` and this plan.

GitNexus identity is explicitly each clone and its base above. Unchain index is
current. `_gemini_route`: LOW, one direct caller `_prepare_provider_wire_from_input`,
4 upstream nodes through `prepare_provider_wire` and provider-turn authority.
`_fetch_prepared`: LOW lower bound, direct `fetch_turn`, 2 reported execution
flows; text corroboration finds `GeminiExactRouteTransport.send` as the unresolved
dynamic caller. GeminiModelIO class: MEDIUM, 7 direct importers, 48 upstream nodes.
JSON resources: UNKNOWN; confirmed importlib loaders, adapter initialization and
host catalog consumption. Recipe file: LOW, 3 importer nodes through detail panel,
recipes page and agents modal. No UNKNOWN is treated as unused.

## Boundary contracts and acceptance

BC-411-001 (OPEN resource/catalog boundary): Unchain wheel JSON resources produce
model-keyed capability/default records. Host consumes known fields and preserves
its existing normalized model-capability shape. Additional unrelated model IDs
are allowed; exact Argon record and allowed payload key set are asserted.
Model identity is exact `gemini-4-argon`; host ID is `gemini:gemini-4-argon`.
Missing Argon in an older wheel must be observable as absent, not a new host
fallback. AC-411-001 verifies the real wheel → host `/models/catalog` → real JS
normalizer fixture and effort defaults; AC-411-002 verifies recipe selection and
real host model parsing/payload production, including invalid effort fallback.

BC-411-002 (CLOSED provider projection boundary): Producer is the real host
`_build_payload` plus Unchain defaults and user overrides; canonical form is the
prepared provider request v1, then `unchain.gemini.contents.request.v1` envelope.
Consumer is the pinned Google SDK `GenerateContentConfig` and an independent
strict fake transport. Native final root is exactly model/contents/config;
durable envelope additionally owns tools outside config until transport projection.
User/default admission is max_output_tokens/thinking_config only; unsupported
sampling/cache/background/unknown root options are omitted at allowlist projection.
Nested thinking fields are closed to thinking_level/include_thoughts; unsupported
levels, budgets, null/noninteger/out-of-range limits fail locally before send.
Final forged wire settings fail before provider client construction. Existing
text/image/PDF and signed tool response shapes are retained. AC-411-003 checks
strict full wire keys, streaming, tools and all three levels; AC-411-004 covers
unknown fields, sampling/cache omission, limits and invalid thinking; AC-411-005
covers signed tool response and second-turn/retry/replay reuse without extra sends.

BC-411-003 (VERSIONED runtime/artifact boundary): PuPu candidate + one wheel built
once from this Unchain candidate, reused unchanged for every pair/matrix/package
smoke. Record wheel SHA-256 and the code-exported runtime manifest digest, validate
with PuPu's independent runtime-manifest validator. Existing protocol versions
remain unchanged because request schemas and transport do not change. Git SHA,
source path and dirtiness are provenance only. Development build may be dirty
because start forbids commits; this is not production release provenance evidence.
AC-411-006 checks installed wheel origin/resources/config and strict manifest
acceptance; changed version/identity/extra fields fail the existing admission gate.
All reports must carry the same wheel and manifest identity. Cold process imports
must select site-packages, never the mutable sibling source.

SEQ-411-001: identity = chat/execution/generation/attempt plus exact model ID.
Initial state is no history. First normal turn emits streamed text/tool call;
second normal turn includes the preceding native model parts and user continuation.
Within a tool cycle, first and second function response turns preserve signatures
and call identity; retry/replay uses the already prepared request rather than
reinterpreting model settings. A cold import reloads the same wheel capability and
defaults. AC-411-005 and AC-411-006 cover these.

State matrix: first/second normal message and first/second tool interaction are
applicable. Retry/durable resume and cold restart/replay are applicable through the
existing Gemini durable replay suites plus Argon prepared-envelope round trips.
Normal/graph/subagent provider projection shares this adapter and wire preparer;
verify those regression paths with the same installed wheel. Host interactions,
journal formats and durable settlement behavior themselves do not change; avoid
inventing a new interaction mechanism. Reset/rollback = switch model or return to
old wheel: preserve Flash defaults and fail Argon catalog presence assertions for
the old wheel. Active rollout remains INCOMPLETE if any applicable evidence is
NOT_RUN; no development test alone represents feature-audit or release acceptance.

## Slices and supervision

Weaker-model assessment: **partially suitable**. Exact static resource records,
the recipe option and a pinned catalog expectation are bounded and follow existing
patterns. Provider config admission, signed durable replay, artifact identity and
cross-repository integration require the strong parent to implement/review.
Worker: gpt-6-luna, selected for the small static catalog slice. Strong reviewer:
the parent Codex agent. No unresolved model/API/architecture decision goes to it.

1. Strong parent writes new failing contract tests and records red-before-green.
2. Worker reads repo instructions, repeats impact and changes only the two Unchain
   JSON resources, exact-catalog test expectation, and PuPu recipe MODEL_OPTIONS.
   Worker must stop at checkpoint; no commits/push or other files. Test command:
   Unchain `.venv/bin/python -m pytest tests/test_gemini_argon.py -k catalog -q`
   and `tests/test_september_native_models.py -q`. Resources should pass; runtime
   limit tests remain red until the parent's next slice. Unknown contract, missing
   interface, unrelated failure or scope drift: report and stop.
3. Strong checkpoint inspects exact diff and reruns resource contract tests, then
   implements admission and tests both direct and prepared paths. Unexpected
   regression is diagnosed before dependent implementation.
4. Build the candidate wheel once, install it in PuPu's isolated venv with pinned
   requirements, run host/renderer producer contracts, selected durable/replay,
   model catalog and runtime-manifest regressions plus package/import smoke.
5. Record evidence and final graph diff; post implementation-ready, retain both
   clones and wait for requested close. No audit, Done or PR at this stage.

Baseline: Unchain Gemini/catalog focused suites pass, 38 tests, before any edits.
Detailed evidence and final test counts will be appended after implementation.

## Implementation-ready evidence (2026-10-20)

The bounded worker slice was reviewed and accepted; strong-parent admission,
strict producer/consumer tests and pair checks are complete. No production host
adapter, protocol manifest or dependency change was needed. Source trees remain
uncommitted on the recorded ticket branches.

Fixed wheel SHA-256: `3c574ff42197b212c7c3462d6cc423324c96c9b6ece4c03ba5e9d1cad34aa33e`.
Imported manifest digest: `sha256:b163345c68666cc2dbe766a3a8e75da0246748def8fa9b1be75f446d9148da3f`.
Development frozen sidecar SHA-256:
`9ca3a5f2ce31109eb2466231b8708f1ff3954d3bc34a95ea55d609fae81cd421`.
See `ticket-411-evidence/README.md`, `pair.json`, `frozen-smoke.json` and logs.

- Corrected Argon contract tests against untouched archived dev source: 38 failed,
  1 passed; candidate: 39 passed (AC-411-003/004/005).
- Unchain full source suite: 4,332 passed, 16 existing opt-in skips, 5 xfails.
- Same installed wheel + PuPu pinned SDKs: 161 Gemini/runtime tests and 110 durable,
  graph-interaction and subagent regressions passed (AC-411-003..006).
- Same installed wheel + host catalog/route/protocol group: 91 passed, with NumPy
  preloaded because existing mock.patch.dict(sys.modules) tests unload it. The
  initially failing projection case also passed in isolation (AC-411-001/002/006).
- Real host catalog fixture → actual renderer normalizer: 20 tests passed;
  isolated Chromium rendered and selected Argon with no page errors
  (AC-411-001/002). Bridge fakes advertise credential presence only, no real key.
- Real PuPu main.py frozen with the same installed wheel: first cold boot and
  restart using the same test data directory both advertised Argon and the same
  independently checked imported runtime manifest (AC-411-006).
- Final raw graph analysis: Unchain 7 files / 19 symbols, PuPu 6 files / 25 symbols;
  both low, partial=false, truncated=false. An intermediate PuPu incremental
  index lost symbol UIDs and falsely connected MODEL_OPTIONS across 1,153 flows;
  discarded that local index, rebuilt it, and retained the superseded warning and
  complete replacement result. MODEL_OPTIONS UNKNOWN remains corroborated by its
  local Select consumer and actual one-option diff; zero graph callers is not
  interpreted as unused.

Pinned old OpenAI SDK checks for existing Sol/Luna none/xhigh efforts fail in
both the unchanged archived baseline and candidate (4 failures, baseline also
8 passing selected cases). These are not Argon failures; dependencies were not
changed. Raw results are retained. Signed Electron release, paid/live Google API
and feature acceptance audit were NOT_RUN. Development artifact smoke is not a
release-provenance or active-rollout GO. Those delivery/acceptance steps remain
for requested close and release qualification; the ticket remains In Progress.

## CI pair correction at authorized merge monitoring

See `ticket-411-evidence/ci-pair-correction.md`. BC-411-003 / AC-411-006
now bind the CI default/fallback runtime source to companion Unchain PR #51.
The initial mismatched-pair run failed correctly; new-head CI must pass before
merging either PR. No runtime code or previously exercised wheel changed.
