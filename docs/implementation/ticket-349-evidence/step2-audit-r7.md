<!-- release-feature-audit:v2 -->
# Issue feature audit — 2026-09-26

Release: #216. Ticket: #349. Candidate: r7, Memory V3 step 2.

**Overall: FAIL — end-to-end evidence incomplete.** F3 (lost reasoning effort) passes this review, with no new regression found. The previous F1/F2/replay fixes also pass the fresh focused tests. This is not a finding that the effort repair failed; the remaining formal acceptance gap is the candidate's real desktop path.

1. **i18n: PASS.** Fresh full scan: 815 English keys, 10 locales; no missing/orphan keys, placeholder mismatches or missing English source keys. Existing static-analysis caveats: 65 potentially dead keys and 48 dynamic lookups. No translation edits.
2. **UI: N/A.** No renderer/Electron UI changes in step 2 or F3.
3. **Model × agent builder: PASS — compatible for the changed projection.** String reasoning effort survives selection, transient SQLite host registration/options recovery, retry and invoker reconstruction. Exact custom OpenAI Responses / Anthropic wire projections and protocol-specific omissions pass. Factory impact is LOW (one direct import, no resolved builder/process hits); dynamic call paths were reviewed manually. No model schema or builder binding change. The existing custom-Anthropic `hyperspace` admission restriction was confirmed in HEAD before the step-2 working changes; full custom-Anthropic agent execution is not certified by this repair.
4. **Static rules: PASS.** Applicable diff contains no renderer IPC, component localStorage, routing, overlay or Electron test-twin changes. `git diff --check` passes.
5. **End-to-end: FAIL — INCOMPLETE.** The real running application's Test API responds and lists `openai:gpt-4.1`, but its process working directory is the original `/Users/red/Desktop/GITRepo/PuPu`, not the candidate clone. No candidate-bound real-provider desktop run or package smoke was completed. BC-349-05 / AC-349-09 remain incomplete. Existing source-sidecar restart smoke is useful evidence, not a substitute for the missing app path. No rollout, signing, canary or production-traffic requirement is added.

## Fresh evidence

- **80 tests passed in 11.79 seconds**, against frozen r7 and the same wheel with the runtime import-origin guard. Scope: background effort, legacy regressions, background worker, official agent factory and selection. [Regression log](step2-audit-r7-regression.log).
- Independent probe uses the **real Unchain Agent constructor without mocking it**, after real selection, registry registration/recovery and background factory resolution. Its final payload is exactly `{"reasoning":{"effort":"low"}}`. The model was not run and no outbound request was made. [Observed result](step2-audit-r7-real-factory.json), [replay script](step2-audit-r7-probe_real_factory.py).
- All **372** frozen source/resource hashes match current working source and the retained manifest. Manifest bytes and wheel SHA verified. The runtime manifest comes from the actually imported wheel. [Integrity](step2-audit-r7-integrity.json).
- [Full i18n scan](step2-audit-r7-i18n.json), [GitNexus impact](step2-audit-r7-impact.txt).
- The earlier implementation run (286 tests / 65 subtests and four sidecar starts) remains recorded in [the repair report](step2-effort-fix-report.md); it is not counted as this audit's fresh run.

Candidate digest: `sha256:176faa3e22f2ad42fcf3580654d35b1ba326e425789917aede12b16c094c7100`

Unchain wheel SHA-256: `sha256:03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`

Runtime manifest digest: `sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`

No production changes during this audit. Ticket remains OPEN / In Progress, verified under the direct OPEN Size=Release parent #216. No waiver, commit, push, PR or closure. Next acceptance step is to launch an isolated desktop candidate with this exact artifact pair, exercise a real model/background consolidation path, verify durable output reaches the app, and clean up probe chats.
