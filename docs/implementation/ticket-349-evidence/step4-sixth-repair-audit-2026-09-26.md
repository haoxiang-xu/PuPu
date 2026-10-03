<!-- release-feature-audit:v2 -->
# Issue feature audit — 2026-09-26 (final8)

Release: #216 (verified Size=Release); child: #349; Project: #13.
Overall: **FAIL**. Child verified OPEN / In Progress. No product code changed.

## P2 — Non-preview repositories reject valid mandatory input

Location: `unchain/src/unchain/context/compiler.py:3185–3194`, with rejection
at 3224–3225; fallback selection at `context/coordinator.py:939–954`.

When a repository omits `checkpoint_ref_for` or raises `NotImplementedError`,
the planner substitutes a 256-character ID. That is safe against undercounting
ordinary revision-1 IDs, but is not a complete compatibility fallback. If the
only remaining suffix is the current mandatory user turn, the larger placeholder
can exhaust the budget even though the actual checkpoint marker fits. No larger
prefix is eligible because it would remove the current input. The request fails
before preparation, whereas final7 succeeds with the identical real reference.

Reproduction uses the production compiler/coordinator, an 8,192-token window,
a 5,068-token message budget, one old 30,004-character user message plus its
answer, and a current user message. The recording repository returns the same
43-character revision-1 reference with preview enabled or unsupported:

| Current input | Actual context estimate | final8 exact preview | final8 unsupported preview | final7 unsupported preview |
| --- | ---: | --- | --- | --- |
| 18,900 chars | 5,001 | success | success | success |
| 19,000 chars | 5,026 | success | ContextBudgetExceededError, zero prepares | success |
| 19,050 chars | 5,038 | success | ContextBudgetExceededError, zero prepares | success |
| 19,100 chars | 5,051 | success | ContextBudgetExceededError, zero prepares | success |

`PupuCheckpointRepository` still inherits the base unsupported-preview method;
`memory_v2_context_adapter.py:707` supplies it to the coordinator. This matters
to the retained adapter/custom-repository compatibility path. The main active
factory (`memory_v2_unchain_runtime_factory.py:991–1017`) uses the official
SQLite implementation with exact preview and is **not** implicated by this
finding. The reproduction is not presented as a live desktop failure.

Fix: implement exact preview for retained first-party adapters, and make the
supported non-preview fallback handle a real fitting checkpoint rather than
treating a worst-case estimate as proof that mandatory input cannot fit. Preserve
the actual post-prepare budget and consumption checks. Add a negative/positive
matrix for absent preview, unsupported preview, exact preview, and current-only
suffixes. AC-349-04 remains incomplete for the supported compatibility path.

Reproducer: `step4-sixth-repair-audit-probe.py`; run from `/tmp` with `PYTHONPATH`
set to the selected final7/final8 wheel and the existing Unchain Python 3.12.

## Verified fixes and tests

- Exact final8 wheel focused suites: **101 passed** (3.72s), covering compiler,
  coordinator, checkpoint projection/proof, and SQLite persistence.
- PuPu repository, official read adapter, official runtime factory, and protocol
  suites against the wheel: **99 passed** (4.43s). This is the prior 99-test
  selection; the previous repair report's 89/1 result used a different group.
- The 19,250–20,000-character older-turn failure now succeeds; 19,000 retains
  the recent old turn at 5,044 estimated tokens. This validates the main repair.
- Prior multi-turn-tool, below-budget invoice, and warm/cold corruption probes
  pass unchanged. Corruption still raises ArtifactIntegrityError.
- The separate legacy oversized-task-state adapter test still fails at journal
  operation validation. This is a pre-existing failure, reproduced in the repair
  against final7; it is not classified as a newly introduced final8 defect here.
- Both source diffs pass whitespace checks. Full backend tests were not repeated;
  the implementation's 3,761-pass result is previous evidence, not this audit's
  fresh test count.

## Five checks and artifact evidence

1. **i18n: PASS.** Full scan: no missing/orphan keys, missing English references,
   or placeholder mismatches. Existing blind spots: 48 dynamic references and
   65 dead-key candidates; no translations changed.
2. **UI: N/A.** This repair adds no UI.
3. **Model × builder: PASS for compatibility.** No model picker, model selection,
   effort, or recipe-schema changes. Context budget correctness has the P2 above.
4. **Static rules: PASS.** Python/compiler-port repair; no new renderer IPC,
   component storage, router, styling, or Electron test-twin changes.
5. **End-to-end: FAIL / INCOMPLETE.** Compatibility defect reproduced. The running
   Electron PID 47880 and Python PID 47927 point to the original `PuPu` checkout,
   not `pupu-349`/final8. Test API is responsive, but no final8 app probe was run
   and no sidecar restarted. Exact candidate/package smoke remains NOT_RUN;
   BC-349-05 / AC-349-09 is not certified by these compiler tests.

Candidate digest: NOT_AVAILABLE.
Unchain wheel SHA-256: sha256:f6a5be52ff43733e120d24d3c2a2ac7bd2f647db5b72f156c425bdd4e9c67232
Runtime manifest digest: sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e

Wheel reused without rebuilding:
`/tmp/unchain-349-wheel-final8/unchain-0.2.0-py3-none-any.whl`.
Compiler import verified from this wheel. No commit, rollout, or closure.
