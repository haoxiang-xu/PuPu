<!-- release-feature-audit:v2 -->
# Issue feature audit — 2026-09-26 (Step 4 third repair)

Release: #216; child: #349; Project: #13.
Overall: **FAIL**. Child is OPEN / In Progress; no status change or closure.
Scope: the latest Step 4 repair, including its merged run-local journal cache.
This review changes no product code.

## Findings

### P1 — An assistant response retires tool context without budget pressure or a checkpoint

`unchain/src/unchain/context/compiler.py:2630–2635` uses the latest assistant
message as a completed-tool-history cutoff. Lines 2815–2818 then discard every
completed non-native pair at or before that cursor. An assistant response does
not prove that it contains the tool result or that a checkpoint covers it.

The attached production-wheel probe supplies a short conversation: user asks
for an invoice amount; lookup returns `USD 7319.42`; assistant says `Done.`;
user asks for half the amount. The final5 model messages lose `7319.42` while
reporting zero checkpoints, `compacted=False`, and only 38 estimated tokens
against a 5068-token message budget. The final3 wheel preserves the amount
(219 estimated tokens) for the identical fixture.

The journal is still durable; this defect is loss of necessary recent working
context, not deletion of storage. It violates AC-349-04's chronological suffix
and complete-tool-group requirement. The newly inverted history-retention test
currently codifies the loss instead of guarding against it.

Fix direction: preserve complete recent tool groups while they fit. Retire a
group only through budget-driven contiguous-prefix selection with a verified
covering checkpoint; keep current/unfinished exchanges intact. Add a follow-up
regression where the preceding assistant answer does not repeat the result.

### P1 — Warm checkpoint reuse bypasses persisted-artifact integrity checks

`unchain/src/unchain/context/coordinator.py:1107–1115` caches payload bytes solely
by `ResourceRef`. On a hit, the bound repository is not asked whether the
persisted content remains valid. Source-proof comparison then checks the old
cached bytes, not the current stored artifact.

The probe uses the real SQLite context store, artifact service and checkpoint
repository in a temporary directory. It creates a checkpoint, warms the same
coordinator, corrupts its one object file, and recompiles. Final5 accepts the
warm compilation with one checkpoint reference. A fresh coordinator rejects
the same persisted state with `ArtifactIntegrityError: artifact object length
or digest changed`. Final3 rejects both warm and cold paths.

This violates BC-349-08 / AC-349-06 / AC-349-07 and SEQ-349-05: warm and cold
validation disagree, and corrupt persisted checkpoint content passes context
admission. No real application data was modified by this probe.

Fix direction: bind reuse to a repository-backed integrity/invalidation
contract that actually covers checkpoint artifacts. Where no such capability
exists, retain the validated read path. A ref's revision alone cannot detect
same-ref corruption. Add warm-versus-cold corruption/deletion tests alongside
the zero-extra-read test.

## Verification

Reused fixed wheel, not rebuilt:
`/tmp/unchain-349-wheel-final5/unchain-0.2.0-py3-none-any.whl`.

- Unchain wheel SHA-256: sha256:253c16a85c4276a7fdf9fc0cb91c096c4cfae7a0f9ddc3a9d3897c4cbca9e23f
- Imported runtime manifest: sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e
- Candidate digest: NOT_AVAILABLE; no exact delivered PuPu candidate verified.
- All nine changed/new Unchain production Python files match the wheel bytes.
- Five focused wheel suites: **133 passed** (2.65s): coordinator, journal
  projection, cache mutation matrix, run-local view cache, SQLite upgrade.
- Four PuPu suites against this wheel: **99 passed** (4.09s): context repository,
  read adapter, runtime factory and runtime protocol.
- Both source diffs pass `git diff --check`.
- Counterexamples: `step4-third-repair-audit-probe.py`, run from the PuPu
  checkout using `/Users/red/Desktop/GITRepo/unchain/.venv/bin/python` and
  `PYTHONPATH` set to the exact wheel. Imports confirmed from the wheel.
- Comparison wheel: final3, SHA-256
  `147a4bc4dd5e2a19866ca587ce4ae74ae6ea1089eff8789a9be6479849a53728`.
  Both counterexamples behave correctly there.

Projection reuse does improve measured call counts: three warmed compiles of
one coordinator invoke canonical projection 6 times, validation 12 times and
neutral assembly 3 times, with zero additional checkpoint read pages. This is
2/4/1 per compile versus the prior 7/9/1. These are operation counts, not latency
measurements; full projection remains and the read saving currently has the
integrity defect above. No end-to-end speedup is claimed.

## Five checks

1. **i18n: PASS.** Full scan: no missing/orphan keys, placeholder mismatches or
   missing English references. 48 dynamic references remain outside static
   coverage; 65 existing dead-key candidates were not deleted.
2. **UI: N/A.** This repair adds no UI components or styling.
3. **Model × agent builder: PASS for compatibility reviewed.** No new model
   capability, selector or recipe schema; runtime factory/protocol pair tests
   pass. Model-content correctness fails under the first finding.
4. **Static rules: PASS.** No new renderer IPC, localStorage, router, TypeScript
   or styling changes in this repair. The Electron `.js` twin delegates to the
   shared `.cjs` migration/admission suite. No product code edited by the audit.
5. **End-to-end: FAIL.** Two production-wheel counterexamples above. Exact
   delivered candidate/package smoke/restarted-sidecar probe is **NOT_RUN**.
   The observed running sidecar points at the shared `PuPu` checkout, not this
   isolated candidate. It cannot establish AC-349-09 for this wheel pair.

No desktop update or sidecar restart was performed during this failed review.
After fixing these issues, use the intended PuPu candidate and fixed wheel,
restart its Python sidecar, then complete the real-app acceptance check.
