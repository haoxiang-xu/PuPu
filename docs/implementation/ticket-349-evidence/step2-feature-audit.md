# #349 step 2 acceptance — 2026-09-26

**FAIL — two reproduced implementation defects.** Scope: background memory consolidation only, including its supported legacy path. This is not acceptance of the remaining Memory V3 steps. No application code was changed during the audit; no commit, rollout or ticket closure was performed.

## Findings

### F1 / P1 — An older custom-provider job can be rerouted to a built-in provider

Location: `unchain_runtime/server/memory_v2_background_worker.py:364-375` (especially line 368), with owner-wide registration replacement at lines 120-125.

The legacy dispatcher takes the old job's provider/model, but takes `custom` and transient transport options from the owner's latest registration. The legacy job's configuration fingerprint covers the four Memory Agent settings, not the custom transport identity. After a job is enqueued for a custom OpenAI-compatible endpoint, registering the same model with the built-in provider changes `custom` to false. Processing the old job then constructs the built-in OpenAI agent without a custom model-I/O factory. This changes the intended destination for the candidate's content.

Reproduction used a real temporary SQLite store, the existing completion fixture with real custom-provider parsing, the actual finalizer and dispatcher, and the real legacy agent factory. Only the final raw-agent constructor was intercepted to stop before network I/O. Observed: original registration `custom=true`; replacement `custom=false`; old-job constructor `provider=openai`, `model=gpt-test`, no custom transport. **No outbound request or data transmission occurred.**

Suggested fix: bind the authorized non-secret provider/transport identity or configuration version to each queued job and only use matching transient configuration. Missing or mismatched configuration must leave an explicit retryable job, not fall through to a built-in twin. Cover custom→built-in and custom A→custom B, including restart and delayed jobs.

### F2 / P2 — Legacy readiness scanning hides eligible jobs behind 500 deferred jobs

Location: `unchain_runtime/server/memory_v2_background_worker.py:352-356`.

The dispatcher reads only 500 pending/leased jobs per state and returns `idle` when those rows are not due. The store lists by `updated_at_ms DESC`, not by eligibility. An older ready job therefore disappears from consideration while newer deferred rows occupy the page. Repeated wakes repeat the same false-idle decision. This can postpone ready work until the deferred rows become eligible, or starve it under a continuing backlog.

Reproduction created one real queued candidate job and 500 newer jobs scheduled one hour later. The dispatcher returned `idle`; immediately calling the store's authoritative claim API found the original ready job. No list/claim methods were mocked. The official backend already has a full-page fallback; the legacy branch does not.

Suggested fix: query/claim eligible work across the whole owner scope, or retain the same full-page fallback as the official branch. Cover pending and expired-lease work hidden beyond the first page.

## Five consistency checks

1. **i18n — PASS.** Full scan: 815 English keys, 10 target locales, no missing/orphan/placeholder mismatches and no source keys missing in English. Existing static-analysis output includes 65 potentially dead keys and 48 dynamic calls; no translations were changed. This backend slice introduces no UI strings.
2. **UI — N/A.** No renderer/Electron or interactive UI changes in step 2.
3. **Model × agent builder — FAIL.** No builder/recipe schema or picker changes, and upstream graph analysis of `PupuOfficialMemoryAgentInvokerFactory` found the adapter import and backend consumers, no builder files. Existing selection regressions pass. Nevertheless F1 violates provider identity during execution, so the model-related behavior is not fully compatible.
4. **Static rules — PASS.** Python-only implementation; no renderer IPC, localStorage, router, styling or Electron test-twin changes. `git diff --check` passed. Audit made no production-code edits.
5. **End-to-end — FAIL / incomplete evidence.** F1/F2 reproduce in the exact frozen server/wheel pair. Existing source-backed sidecar restart and blocked-worker tests remain useful, but no real-provider desktop probe of this candidate or candidate package smoke has been completed. The running desktop process (PID 65195) uses `/Users/red/Desktop/GITRepo/PuPu`, not the candidate clone; its Test API responds, but testing it would validate different code. Do not mark the candidate PASS from that app. This is a candidate verification gap, not a request for production rollout, canary traffic or signing.

## Evidence and provenance

- Newly rerun focused regressions: **57 passed, 2 subtests passed**, 10.43 s. Scope: background dispatcher, legacy lifecycle, model selection. Pytest's fixed-wheel guard verified loaded Unchain module origins after each test. [Log](step2-audit-regression.log).
- Two additional defect probes reproduced F1/F2; their success means the bugs were observed, not feature acceptance. [Probe code](step2-audit-probes.py), [observed results](step2-audit-probes.json).
- [Full i18n scan](step2-audit-i18n.json), [candidate integrity check](step2-audit-integrity.json). All 376 frozen manifest records match their retained hashes; current source/resources match the frozen source, excluding irrelevant local cache files from the working-tree comparison.
- Prior broad implementation evidence: 247 tests / 65 subtests and two task-owned sidecar starts, documented in [the implementation report](step2-background-memory.md). These are prior results, not newly rerun totals.
- Candidate server/resources digest: `sha256:16a4ab3f4f3d4a81f0b8e8c9ffb91e50ad793ebe4c03ed23520113c3d7e54514`.
- Reused Unchain wheel: `sha256:03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`.
- Runtime manifest: `sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c` (previous fixed-pair runtime evidence; same unchanged wheel).
- GitNexus bound to `/Users/red/Desktop/GITRepo/pupu-349`; indexed branch base `2b8cb2e197d4c873bf9e78c8688e4c21e9457947`. Shared selector impact LOW, one direct import; graph coverage is incomplete for newly added/dynamic Python paths, which were inspected directly. No graph clean/commit claim is made.
- BC-349-03a / SEQ-349-04d: FAIL for preserved provider identity under a later configuration refresh (F1). BC-349-03c / recovery expectations: FAIL for legacy scheduling visibility (F2). BC-349-05 / AC-349-09 candidate desktop verification remains incomplete. No waiver is implied.

Replay the probe with Python 3.12, `UNCHAIN_SOURCE_PATH` pointing to the retained wheel, and `PYTHONPATH` containing the retained r4 `server`, `server/tests`, the wheel, and `.local/ticket-349-cache-checkpoint/extra312`. Run `step2-audit-probes.py`; it uses temporary stores and deliberately blocks outbound model construction. Retained candidate: `.local/ticket-349-background-checkpoint-r4/`.

Release membership verified: #349 is a direct child of open Release #216 (v0.1.12), whose PUPU Project item has Size=Release. Keep #349 open, **In Progress**. Fix findings and rerun acceptance on the resulting candidate digest before moving to In Review.
