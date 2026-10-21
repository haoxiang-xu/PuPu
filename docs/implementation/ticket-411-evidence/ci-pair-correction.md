# #411 CI artifact-pair correction — 2026-10-20 America/Vancouver

First PR run: https://github.com/haoxiang-xu/PuPu/actions/runs/39544384696
Result: 10 backend failures, 2,800 passed, 18 skipped; frontend/Electron pass.
Root cause: workflow default/fallback selected old Unchain `61efc72e64a22c5e5ac68dff74452b6ca6e1c105`
which has no Argon. New catalog/strict-config/recipe tests correctly reject it.

Correction: all five source references in release-qa.yml now select companion
PR #51 head `4e9d8c3bb228874bd81e4d80ea1905d4aa71110c`, matching the source of the already-tested wheel.
Its history includes the old reference (two commits ahead, zero behind), preserving
#389 fixes. Explicit workflow_dispatch overrides remain available. Deterministic
producer and all three package jobs use the same fallback; the shared pipeline
still builds one wheel and passes its verified immutable bytes to all consumers.

Pre-edit impact bound to /Users/red/Desktop/GITRepo/pupu-411 at 7043189d:
workflow YAML is absent from graph, risk UNKNOWN. This is not an all-clear.
Graph query located artifact verifier/report consumers; literal/manual verification
confirmed all five refs and deterministic → artifact_verify → shared package jobs.
No indexed callable was edited. The workflow YAML schema/continuity tests verify
single-build/reuse, installed import binding and valid unique YAML keys.

BC-411-003 / AC-411-006 now additionally require the CI source reference to match
the companion runtime used by the feature. Wrong-pair red evidence is the failing
run above. CI green evidence must come from the new PR head, never an old rerun.

New candidate: `sha256:7744e70e429e5bebe9b6b2638159dd76db4a337f19d030d52bc1f1d2436082e6`.
Previous candidate: `sha256:2d8c67291fe4fefe44ec85f719f27f5a3ce967669dc9477bdcf8c93da421246c`.
All 886 runtime file hashes match the previously exercised real-app candidate.
Only the build source-selection input is added/changed; the exact development
wheel SHA, imported manifest and frozen binary remain identical. Prior real-app,
strict wire/replay and package observations apply to these identical runtime bytes;
fresh workflow validation and current-head CI supply the changed build-input check.
The maintainer's Gemini live-completion waiver continues to cover only the same
unverified live behavior, without claiming a successful Gemini response.
