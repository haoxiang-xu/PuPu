# Ticket #280 — selected Ollama context window usage

Ticket: https://github.com/haoxiang-xu/PuPu/issues/280
Release: #203 (v0.1.11)
Workspace: /Users/red/Desktop/GITRepo/pupu-280
Branch: codex/ticket-280-context-window-usage
Base: remote dev at e8b394880c2841eb728af9754e03fdde0a84f87e

## Goal and reproduction

With 8192 input tokens and a catalog maximum of 131072, change the selected Ollama window from 32768 to 65536. Current code leaves pressure at 6.25%; the composer should show 25% then 12.5%. This is the last observed input measured against the current configured capacity, not an estimate of the next prompt.

`ChatInterface.contextUsageView` currently depends only on messages/capabilities and calls `selectContextWindowTokens`, which reads only the catalog maximum. The request path already sends `selectedContextWindow` as `options.contextWindow`; the sidecar uses the selection or declared default, capped by the catalog maximum. No request or backend changes are required. The shared composition panel currently mixes usage pressure with the recorded call window in its headline/bar.

## Settled implementation decisions

- Preserve the existing maximum-only selector for historical/general callers. Add a renderer helper for the active composer window, with `{modelId, selectedContextWindow}` options.
- Apply selected/default policy only to built-in `ollama:` model IDs. A valid positive safe integer selection wins, then the catalog's valid `default_context_window_tokens`; cap either by a valid catalog maximum. If neither selection nor declared default is available, return null. Other providers, including custom Ollama protocol providers, keep the existing catalog-maximum behavior.
- Chat usage recomputation must depend on selection and selected model ID as well as messages/capabilities. Character chats retain their existing behavior, since the request path does not send their context selection.
- Preserve last reported input-token accounting. No token estimation, sum of calls, receipt mutation, persistence change, or daemon capability/memory-policy work (#228/#229/#234).
- In the mini app's default current-call pane, use a transient view with the same denominator as the supplied usage view for the headline readout and composition bar. Only overlay when the call's provider/model and input total match the usage view; no overlay on explicitly selected historical calls, aggregate scope, or the historical modal (which supplies no usage view). Preserve the underlying bundle and composition quality/category shares.
- UI inventory: existing window slider, progress ring, shared composition headline/bar and call picker. This is a value-calculation bug fix; no new controls, layout, styles, or visual design decisions.

## Acceptance and boundary assessment

- AC-001: Selecting 32K then 64K with unchanged usage changes capacity/pressure immediately, without another request.
- AC-002: Declared default, maximum cap, missing maximum, missing/invalid values and cloud/custom-provider isolation are covered by service tests.
- AC-003: The current mini app headline percentage, token/window readout and composition bar agree after rerender; raw bundle stays unchanged.
- AC-004: Explicit historical-call selection and historical modal retain recorded windows and percentages; aggregate scope remains recorded.
- Cross-boundary gate: NOT_APPLICABLE. Only renderer-local derived values and React dependencies change. Existing storage records, read/write functions, IPC/HTTP/provider payloads, closed schemas, runtime code and deployment artifacts are untouched. Historical data is read into a temporary UI view, never projected to compiler/provider wire. No runtime retry/resume behavior changes; wheel-pair rollout qualification is outside this renderer-only implementation.
- UI sequence: same messages -> change selected window -> rerender -> inspect historical call -> return/reopen current view. AC-001/003/004 cover this non-persistent display sequence.

## Execution slices and supervision

Partially suitable for a lower-cost implementation worker. Root cause, effective-window policy and observable tests are settled for the service/chat slice; panel consistency and historical-call isolation remain with the strong parent for direct implementation and integration review.

Worker: gpt-5.6-sol, high reasoning. Strong reviewer: parent GPT-6 agent.

Slice 1 (worker, stop after this checkpoint): only `src/SERVICEs/context_usage_v1.js`, its test file, `src/PAGEs/chat/chat.js`, and `src/PAGEs/chat/chat.test.js`. Implement the helper and wiring. Add service edge cases and a chat-level regression that changes the selected window with stable messages/capabilities. Record red-before-green evidence. Do not edit panel files, schemas, storage, backend, or docs. Run required GitNexus impact before every existing symbol edit, warn on HIGH/CRITICAL, corroborate UNKNOWN. No commit/push. Stop and report unexpected interfaces or scope changes.

Parent slice (independent): shared panel transient display projection and regression tests in `context_composition_panel.test.js`; inspect historical modal behavior. Review worker's diff and evidence before integration.

Commands (run from this clone):

```
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/SERVICEs/context_usage_v1.test.js
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/PAGEs/chat/chat.test.js -t 'context window'
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/COMPONENTs/chat-bubble/context-composition/context_composition_panel.test.js src/COMPONENTs/chat-bubble/context-composition/context_composition_modal.test.js src/COMPONENTs/chat-input/components/context_composition_progress.test.js
```

Dependencies: node_modules symlink uses the existing installed dependency tree; source/tests are rooted in this independent clone. GitNexus index must be this clone's. No product files copied from the original dirty checkout.

## Evidence

Implementation-ready, 2026-09-12. Strong-agent checkpoint accepted after correcting the integration fixture to use canonical same-model Ollama receipt and usage-slice identity, with recomputed receipt hash and bundle digest.

- Clone-local pre-edit impact: selector LOW (contextUsageView -> sharedChatInputProps), derived contextUsageView LOW. ScopePane/ChatInterface JSX callers UNKNOWN, corroborated via source imports/render sites; composer, historical modal and application/chat paths were explicitly reviewed.
- Red-before-green: chat baseline reported 131072 / 0.0625 for 8192 input instead of the configured default 32768 / 0.25. Parent panel tests failed on old 128K readouts while usage percentage reflected 4K.
- Final combined command includes all five suites listed above, run together on the final code and canonical Ollama fixture: **5 suites passed, 225 tests passed, 51.105 seconds**. Service 30; full chat 165; panel/modal/progress 30. Logs include a fake/native timer warning but no failed test.
- AC-001: same messages/catalog, default32K -> callback64K, input8192, pressure25% ->12.5%, no stream request. AC-002: defaults, caps, invalid values, missing maximum and cloud/custom isolation covered. AC-003/004: rerendered headline/readout/bar agree, raw bundle unchanged, explicit history and mismatched model retain recorded evidence; historical modal and aggregate tests pass.
- Post-edit GitNexus detect-changes --scope all --limit 100 --repo .: 7 tracked files, 19 mapped symbols, 8 affected ChatInterface flows, HIGH. User warned; complete backend result (no partial/truncated warning). CLI presentation itself shows only the first 15 symbols; its formatter confirms this is a display cap. New untracked implementation plan is also reviewed by git status/diff, not counted in that tracked diff.
- git diff --check passes. Product diff is limited to renderer window resolution, memo dependencies and transient panel values; no persistence, wire, runtime, styles or UI controls changed. Catalog documentation updated.
- Desktop/daemon live smoke was NOT_RUN; this is development-test evidence, not release acceptance or deployed Ollama qualification. No Python changes, sidecar restart, commit, push, PR or audit.

Issue remains OPEN / In Progress under #203. User-requested close is the next workflow step for PR/audit/cleanup.

## PR preparation — 2026-09-12

The user explicitly requested a PR, authorizing the delivery commit and push for this ticket. Fast-forwarded the independent branch to current remote dev `5c18e8b8f9801cee8a8641d6cffd6948cb728661` without conflicts; no changes to the original workspace. The two newer dev changes concern input palette sizing and attach-panel layout.

Fresh integration verification on that base: the original five suites plus `src/COMPONENTs/chat-input/components/attach_panel.test.js`, run together with `CI=true npm test -- --watchAll=false --runInBand --runTestsByPath ...`: **6 suites passed, 307 tests passed, 52.713 seconds**. Existing timer/React act diagnostics remain in the log, with no test failures. No desktop/daemon live smoke or release acceptance claim. This request creates the PR; it does not merge it, close the issue, invoke the close/audit workflow, or delete this clone.
