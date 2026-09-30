# Ticket #347: shipped provider identity in the model selector

- Ticket: https://github.com/haoxiang-xu/PuPu/issues/347
- Release: v0.1.12 (#216)
- Clone: `/Users/red/Desktop/GITRepo/pupu-347`
- Branch: `codex/ticket-347-provider-selector-identity`
- Base: remote dev at `d1bbc0db8f129b788091c805832a2b76a80553f3`

## Settled bug and repair

Configured Kimi and DeepSeek models reach `useChatInputModels`, then
`build_model_options`, then the existing palette Select rail. The builder
unconditionally gives all custom-transport groups the server icon and Custom
badge. Built-in providers intentionally still use custom-transport identifiers.

Reuse `findShippedProviderBySlug` from the shipped registry in
`src/COMPONENTs/chat-input/utils/build_model_options.js`. A registered slug gets
its registered icon and neither `is_custom` nor `badge`. Unregistered slugs keep
the current icon and markers. Update nearby comments to describe both kinds.
Preserve names, group keys, model values, ordering and collapse state.

No new UI or design alternatives: restore existing brand icons and existing
unbadged rail behavior. Do not edit Select, provider storage, registry, presets,
backend, routing, configuration or credentials. Do not merge Kimi site groups.

## Impact and boundary assessment

Initial upstream impact on the same base in PuPu: LOW, 3 impacted symbols;
direct caller `useChatInputModels.modelOptions`, then `useChatInputModels` and
`ChatInput`; no processes listed. Repeat impact in this clone before edits.

Boundary gate: NOT_APPLICABLE. This changes in-process frontend presentation
metadata only, with no process/provider SDK/serialization/persistence/durable
state change. BC/SEQ and deployed artifact-pair checks are not applicable.

## Acceptance and verification

- AC-001: rendered DeepSeek, Kimi international, and Kimi China rail entries use
  their brand icons without Custom badges.
- AC-002: a user provider with the same display name still renders a Custom
  badge and generic icon. Identity comes from the reserved slug, not the name.
- AC-003: clicking another model emits its unchanged transport identifier;
  existing model filtering, collapse and group tests remain green.

Parent agent owns the new regression test in
`src/BUILTIN_COMPONENTs/select/select.shipped_provider_identity.test.js`, including
red-before-green evidence. Worker must not edit tests to make them pass.

Run from this clone:

```sh
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath \
  src/BUILTIN_COMPONENTs/select/select.shipped_provider_identity.test.js \
  src/BUILTIN_COMPONENTs/select/select.custom_group_badge_toggle.test.js \
  src/COMPONENTs/chat-input/utils/build_model_options.test.js \
  src/COMPONENTs/chat-input/hooks/use_chat_input_models.test.js
```

Dependencies reuse the existing node_modules installation by symlink; tests and
source resolution are rooted in this clone. No secret or account access needed.

## Delegation and checkpoint

Suitable for a lower-cost implementation model: the defect, exact lookup,
allowed file, compatibility invariants and observable regression are settled.
Worker: gpt-6-luna. Strong parent agent reviews the complete diff and independently
runs the focused suite. One bounded slice: edit only the builder, run existing
builder tests, and stop at the final implementation checkpoint. Read repository
instructions and run GitNexus upstream impact before editing. Report unexpected
regressions, missing interfaces or scope changes before further edits.

No commit or push during start. The parent records evidence on #347 and leaves it
open/In Progress at implementation-ready. PR, acceptance audit and cleanup occur
only after the user's close instruction. Installed-app visual verification is
not claimed by development tests.

## Implementation checkpoint (2026-09-25)

Strong-parent review: pass. Production change is limited to the builder's import,
registry lookup and group display metadata; identities, filtering, ordering and
collapse handling are preserved. Worker gpt-6-luna ran 9 existing builder tests.

The parent independently ran the final regression against the original HEAD
builder: all 3 branded cases failed on the missing unbadged rail entry. With the
fix restored, all 4 focused suites passed (25 tests), including real preset →
builder → Select rendering/callback checks and same-name user-provider badges.
`git diff --check` passed. AC-001 through AC-003 are covered by development tests.

GitNexus `detect-changes --scope all --repo .` identified the one changed symbol
and reported HIGH across 8 flows. Its pre-existing context links array `push`
and Set `add` to unrelated same-name functions (logging, icons and formatting),
so these downstream flow names are an over-approximation, not verified runtime
paths. Direct upstream impact remained LOW/exact with the three chat-input
symbols. Manual source review and focused integration tests support the bounded
presentation-only assessment; do not interpret the flow list as absent risk or
as proof of unrelated runtime execution.

No commit, push, PR, audit, merge or installed-app deployment performed. Issue
remains open/In Progress with implementation-ready evidence recorded remotely.
