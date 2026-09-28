<!-- release-feature-audit:v2 -->
# Issue feature audit — 2026-09-26 (Step 4 fourth repair)

Release: #216; child: #349; Project: #13.
Overall: **FAIL**. Verified child remains OPEN / In Progress.
Scope: final6 repair. This audit changes no product code.

## P1 — Checkpoint planning cannot advance past the first tentative prefix

Location: `unchain/src/unchain/context/compiler.py:3725–3768`.

The fallback plans a prefix with all optional history disabled. For short chat
messages, it chooses the first old turn. Reassembly then restores every tool
exchange after that tentative cutoff as mandatory history. If that suffix is
still too large, the second reduction raises and the handler returns the
original error; it never retries a larger complete prefix. Changing
`minimum_cutoff` alone does not shrink that mandatory semantic-history blob.

Reproduced on final6 with an 8192-token window, short old user/assistant
messages, 20 completed lookup pairs per old turn, 1200-character result previews,
and a short current user message:

- One old turn: succeeds; one checkpoint; source indexes (0, 1) omitted.
- Two old turns: `PinnedTaskStateBudgetError`; zero checkpoints written.
- Three old turns: same error; zero checkpoints written.

All large content belongs to completed old turns, so this is not oversized
mandatory current input. It violates AC-349-04. The existing regression covers
only one old turn, where the first tentative cutoff happens to remove all
large tool history.

Fix direction: evaluate successive complete-prefix candidates with the actual
retained semantic tool groups and checkpoint overhead until a valid budget is
found. Publish no reduced model context before the selected exact prefix is
durably bound. Cover multi-turn tool history, crossing pairs, and a retained
recent result in tests.

## P1 — An existing checkpoint prevents tool-heavy suffix growth from compacting

Location: `unchain/src/unchain/context/compiler.py:3717–3718,3777–3785` and
`unchain/src/unchain/context/coordinator.py:944–947`.

The new planning fallback only runs when no checkpoint cutoff is supplied.
When a committed checkpoint is selected and its completed tool suffix grows
too large, the compiler rethrows the budget error. The coordinator only falls
back for the exact `checkpoint_consumption_invalid` error, so it aborts before
trying a new covering checkpoint.

The existing `step4-second-repair-audit-probe.py` reproduces this unchanged:
create a committed text-history checkpoint, append a completed old turn with
20 lookup pairs (1200-character previews), then append a short current message.
Final6 raises `PinnedTaskStateBudgetError`; checkpoint count stays at one.
This violates AC-349-04 and SEQ-349-05. It is an unresolved earlier failure,
not a newly discovered storage corruption defect.

Fix direction: allow an insufficient valid binding to trigger a new-prefix
planning pass, while preserving hard failures for corrupt/unauthorized
checkpoints and genuinely oversized pinned state. Add a regression that first
commits a checkpoint and then grows a tool-heavy completed suffix.

## Repairs confirmed

The two third-audit regressions are fixed on final6:

- `USD 7319.42` remains in a below-budget follow-up context after the assistant
  merely says `Done.`; no checkpoint is created (219 estimated tokens).
- Corrupting a temporary SQLite checkpoint object after warm reuse makes both
  warm and fresh coordinators raise `ArtifactIntegrityError`.

The latter fix restores validated persistent reads; it is not a verified
zero-read checkpoint cache optimization. Three repeated compilations perform
three checkpoint payload reads. Projection reuse remains at two canonical
projections and four validation scans per compile. No latency claim is made.

## Artifact and test evidence

Candidate digest: NOT_AVAILABLE; no delivered PuPu candidate verified.
Unchain wheel SHA-256: sha256:7deeb672b058f269049c0cc092ad47b0f382f60cc3f55c9023f7646158a4c1c1
Runtime manifest digest: sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e

Reused `/tmp/unchain-349-wheel-final6/unchain-0.2.0-py3-none-any.whl`, not rebuilt.
SHA rechecked; wheel import confirmed. Ran with the existing Python 3.12 at
`/Users/red/Desktop/GITRepo/unchain/.venv/bin/python` and wheel-first PYTHONPATH.

- Current audit: compiler, coordinator and projection suites **151 passed**
  (2.61s), plus the three production-wheel probes noted above.
- New diagnostic: `step4-fourth-repair-audit-probe.py` (recording persistence,
  production compiler/coordinator); not a real-app test.
- Prior implementation evidence: 3753 passed / 16 skipped / 5 xfailed full
  source suite; 134 wheel focused tests + 43 compiler tests; 99 PuPu pair tests.
  Those broader suites were not rerun in this audit and do not cover the two
  reproduced scenarios above.
- Both repository diffs pass whitespace checks.

## Five checks

1. **i18n: PASS.** Fresh full scan: no missing/orphan keys, missing English
   references or placeholder mismatch. 48 dynamic references and 65 dead-key
   candidates remain the static scan's existing limitations.
2. **UI: N/A.** This repair adds no UI or styling.
3. **Model × agent builder: PASS for schema compatibility.** No model selector,
   capability or recipe-schema change in this repair. Context correctness
   remains blocked by the findings above.
4. **Static rules: PASS.** Repair changes are Python/compiler tests; no new
   renderer IPC/localStorage/router/style violations. Prior Electron twin uses
   the shared `.cjs` suite.
5. **End-to-end: FAIL.** Two reproducible production-wheel compaction failures.
   Exact candidate/package smoke/restarted-sidecar real-app check: **NOT_RUN**.
   The observed running sidecar still points at the shared `PuPu` checkout,
   not the isolated candidate. AC-349-09 remains incomplete.

No desktop deployment or sidecar restart was performed during this failed
review. Correct the two pressure paths, then verify the exact candidate/wheel
pair after restarting its Python sidecar.
