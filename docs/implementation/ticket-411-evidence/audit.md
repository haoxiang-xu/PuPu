# Ticket #411 feature audit — 2026-10-20 (local date)

Delivered-candidate identity: `sha256:7744e70e429e5bebe9b6b2638159dd76db4a337f19d030d52bc1f1d2436082e6`.
The exact runtime inputs and canonical digest recipe are in [candidate.json](candidate.json).
One reused wheel and imported runtime manifest remain unchanged; see [pair.json](pair.json).
Both freshly fetched remote dev bases are unchanged, with no integration delta.

1. **i18n: PASS.** Full scan of all 10 translations: no missing/orphan keys,
   placeholder mismatches or missing English keys. Existing dead-key candidates
   and 50 dynamically composed references are reported in audit-i18n.json;
   no deletion or unrelated translation edit was applied.
2. **UI: PASS.** Production PuPu change adds one option to the existing recipe
   Select. No new primitive, theme color, overlay, layer or layout.
3. **model × agent builder: compatible / PASS.** Native wheel catalog supplies
   chat/character/subagent capability-driven model lists; the recipe's static
   MODEL_OPTIONS now includes the exact native ID. Its existing Select and
   schema/defaults are unchanged. Upstream recipe file impact is LOW through
   detail panel → recipes page → agents modal; unresolved constant use is
   corroborated by the existing local Select consumer. Exact host payload,
   effort fallback, previous model defaults, signed replay and durable graph/
   subagent regressions passed with the same installed wheel.
4. **static rules: PASS.** Complete production diff reviewed: no renderer IPC,
   localStorage writes, router/provider changes, TS, styles, Electron tests or
   new persisted schema. Unchain validation is exact-model scoped; previous
   models retain their timeout/config. No dependency/protocol changes.
5. **end-to-end: PASS for real-app producer/consumer; Gemini successful response
   WAIVED by maintainer.** After Python sidecar restart, the actual Electron
   acceptance instance uses the fixed installed wheel and inherited encrypted
   user configuration. Native Argon selection reached the real provider; the
   owner's chat shows HTTP 429 RESOURCE_EXHAUSTED, retries_exhausted after 10
   host retries. This is actual provider error output reaching the UI, not a
   mock and not a successful Gemini generation. Separately a real openai:gpt-4.1
   probe in that same app returned TICKET411OK (9.1 seconds, UI usage 12,107 in /
   6 out). Probe input: Reply exactly TICKET411OK. No toolkit was invoked.
   The owner's Gemini chat/config must be preserved during cleanup; audit-only
   probe session is disposable. Private profiles/logs are excluded from Git.

## Maintainer waiver

Approver: project maintainer haoxiang-xu, explicitly in this Codex chat:
“你直接过吧” followed by “直接 close 了。” (2026-10-20 local).
Omitted gate: successful live Gemini Argon generation/tool/vision completion.
Reason: maintainer accepted delivery despite provider queuing/quota symptoms;
actual application reports 429 RESOURCE_EXHAUSTED. Risk: successful live Argon
response and live vision/tool behavior remain unverified; strict exact-wire,
replay, full source and installed-pair tests plus cold packaged sidecar checks
are retained, but are not relabelled as live success or release certification.
Record the structured waiver on both #411 and Release #318.

Overall: **PASS with explicit maintainer waiver**, bound to the digest above.
Signed/notarized Electron release qualification remains a Release pipeline task.

## Fresh CI-input revalidation — 2026-10-20 local

The workflow source pin now matches companion Unchain #51, preserving every
previous #389 fix. All 886 runtime inputs, archived wheel and frozen binary
hashes were freshly checked and remain identical to the exercised real app.
The new candidate binding includes release-qa.yml and the immutable source
revision. Full i18n scan remains clean; 17 workflow schema, artifact continuity,
test-exit handling and toolchain tests passed. See ci-pair-correction.md and
ci-workflow-tests.log. No new app behavior, UI or model setting was introduced,
so the previously observed real-app output and waiver apply to identical runtime
bytes. Fresh current-head GitHub CI remains a separate pending merge gate.
