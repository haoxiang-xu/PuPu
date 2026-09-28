<!-- release-feature-audit:v2 -->
# Issue feature audit — 2026-09-26

Release: #216. Ticket: #349. Scope: Memory V3 step 2, background consolidation, repaired r6 candidate.

**Overall: FAIL.** The previous provider-binding and queue-pagination findings, plus the related finalizer replay repair, pass the fresh focused regression run. One new configuration-preservation defect remains. No production code was changed during this audit.

## Checks

1. **i18n: PASS.** Full scan of 10 locales: zero missing/orphan keys, placeholder mismatches or missing English source keys. There are 65 existing potentially dead keys and 48 dynamic lookups, which remain static-analysis blind spots. No translations changed.
2. **UI: N/A.** Step 2 adds no renderer/Electron UI changes.
3. **Model × agent builder: FAIL — conflict found.** Custom-provider Memory Agent construction loses an existing reasoning-effort setting. No builder schema change was found. Upstream GitNexus analysis of `PupuOfficialMemoryAgentInvokerFactory` reports LOW, one direct import in `unchain_adapter.py`, no resolved builder/process hits. Dynamic Python edges were checked in source; graph absence alone is not compatibility proof.
4. **Static rules: PASS.** Applicable feature files checked; no new renderer IPC, localStorage, routing, layer or Electron test-twin changes. `git diff --check` passes.
5. **End-to-end: FAIL — incomplete evidence.** No real-provider desktop run or candidate package smoke was completed for this audit. The currently running app uses the original `/Users/red/Desktop/GITRepo/PuPu` checkout, not this candidate; its behavior cannot certify r6. Prior task-owned source-sidecar restart checks remain useful but are not full app evidence. BC-349-05 / AC-349-09 remain open. No rollout, signing or canary requirement is introduced.

## F3 — P2: preserve custom-provider reasoning effort through option narrowing

Location: `unchain_runtime/server/memory_v2_background_worker.py:34–37`, `narrow_provider_options`.

The allowlist omits `reasoningEffort`, although the official custom-provider factory passes provider options to `unchain_adapter._build_payload`, which consumes this field. Before step 2, `PupuOfficialMemoryAgentInvokerFactory` copied the complete options dictionary. With a custom OpenAI Responses provider and `reasoningEffort: low`, the original construction path produces `{"reasoning":{"effort":"low"}}`; the current selection/factory path produces `{}`. Custom transport is still correctly selected. The provider therefore receives no requested effort and falls back to its default. This can alter behavior, latency and usage; no live timing/cost delta is claimed.

The reproduction uses the frozen r6 selector, invoker factory, custom config parser, toolkit validation, raw factory and payload builder. Only the final raw Agent constructor is intercepted; no outbound request is made. The finding concerns custom-provider payloads, not an assertion that built-in effort behavior regressed.

Suggested repair: retain validated `reasoningEffort` in the narrow provider-construction inputs and preserve it through selection, registration and resolution. Add actual payload assertions for custom OpenAI Responses and Anthropic, while retaining protocol-specific omission and exclusion of callbacks, history and cancellation state. This is within provider projection boundary BC-349-03a.

## Verification and evidence

- Fresh frozen-candidate regression run: **59 passed in 12.05 seconds** across background legacy regressions, background worker, official agent factory and selection. [Log](step2-audit-r6-regression.log).
- Confirmed reproduction: [probe source](step2-audit-r6-probe_effort.py), [observed payloads](step2-audit-r6-probe-effort.json). Run from the task clone with the task Python 3.12; it expects the retained `.local/ticket-349-background-checkpoint-r6/` and exact wheel.
- All 371 frozen source/resource hashes match their manifest and current working source; wheel hash matches. [Checks](step2-audit-r6-checks.json), [artifact identity](step2-fix-artifact-identity.json).
- [Full i18n scan](step2-audit-r6-i18n.json), [GitNexus impact](step2-audit-r6-impact.json).
- Previous broader implementation evidence remains in [the repair report](step2-fix-report.md); its 265-test result is not presented as a fresh audit run.

Candidate digest: `sha256:02caddf170f4a1aaceaf7496cba5f54ae66eaee47701535e09e570e0eba45f1e`

Unchain wheel SHA-256: `sha256:03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`

Runtime manifest digest: `sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`

Ticket remains open and In Progress. No commit, push, PR, closure, production fix or active rollout was performed.
