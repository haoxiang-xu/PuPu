<!-- release-feature-audit:v2 -->
# Issue feature audit — 2026-09-26 (final7)

Release: #216; child: #349; Project: #13.
Overall: **FAIL**. Child verified OPEN / In Progress. No product code changed.

## P1 — Planning excludes checkpoint overhead and prepares an unusable prefix

Location: `unchain/src/unchain/context/compiler.py:3170–3208`;
failure escapes at `unchain/src/unchain/context/coordinator.py:1001–1016`.

During an unbound planning pass, `binding_matches` is false, so `_reduce`
compares only the retained messages with the budget. The checkpoint marker's
tokens are included only in the later bound pass. If retained messages fit but
retained messages plus that marker do not, the coordinator has already prepared
the checkpoint. The bound compile raises `checkpoint_consumption_invalid` and
this preparation path aborts instead of selecting a larger complete prefix.
The new tool-pressure loop has the same unbound cost model; it does not solve
this boundary. This is a remaining Step 4 acceptance gap, not evidence that
final7 introduced the underlying cost omission.

Reproduced using the production final7 wheel, an 8192-token window (5068-token
message budget), two completed text-only old turns and a seven-character
current message. The first old user message has 30000 characters; varying the
second old user message produces:

| Second old message | Outcome |
| --- | --- |
| 19000 chars | Success; first turn omitted; 5044 final estimated tokens |
| 19250 chars | `checkpoint_consumption_invalid`; one prepare, zero commits |
| 19500 chars | Same failure |
| 19750 chars | Same failure |
| 20000 chars | Same failure |
| 20250 chars | Success; both old turns omitted; 277 final estimated tokens |

For the exact same 19500-character source state, creating the larger covering
checkpoint with a 4096-token budget and then compiling at 8192 succeeds with
277 estimated tokens. Therefore a valid complete-prefix solution exists; the
failure is not oversized mandatory input. AC-349-04 remains unsatisfied.

Fix direction: include the eventual checkpoint projection cost while selecting
every prefix, before durable preparation, or safely replan a larger prefix when
the actual prepared reference makes it exceed budget. Preserve hard failures
for corrupted storage and oversized current/pinned inputs. Test both text-only
and tool-heavy suffixes immediately below/above the budget boundary and verify
that an insufficient tentative prefix does not leave the turn stuck.

## Verified repairs and tests

- Previous multi-turn tool probe: one, two and three tool-heavy old turns all
  compact successfully with exact contiguous source omissions.
- Previous existing-checkpoint plus tool-heavy suffix probe: succeeds.
- Below-budget invoice amount is retained; warm/cold temporary object corruption
  both raise `ArtifactIntegrityError`.
- Mixed-history check: two large old tool turns are omitted while a third small
  recent result (`RECENT_AMOUNT_7319`) remains in the model messages.
- Current audit wheel suites: **154 passed** (3.11s), covering compiler,
  coordinator and journal projection. Existing wider implementation counts are
  not treated as tests of the newly reproduced budget boundary.
- Fresh full i18n scan and both source whitespace checks pass.

New reproduction: `step4-fifth-repair-audit-probe.py` in this evidence directory.
It uses the production coordinator/compiler with recording persistence; it is
not a desktop end-to-end probe. Existing second/third/fourth audit probes were
rerun unchanged against final7.

## Artifact and five checks

Reused wheel: `/tmp/unchain-349-wheel-final7/unchain-0.2.0-py3-none-any.whl`.
SHA rechecked; production wheel import confirmed. No rebuild or deployment.
Candidate digest: NOT_AVAILABLE.
Unchain wheel SHA-256: sha256:8e8a1eec13036675b55440f68ae6206b2bf69c83c192881246f9662a107b097b
Runtime manifest digest (retained final7 identity): sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e

1. **i18n: PASS.** No missing/orphan keys, missing English references or
   placeholder mismatches. Existing static limitations: 48 dynamic references,
   65 dead-key candidates; none modified.
2. **UI: N/A.** No UI changes in this repair.
3. **Model × builder: PASS for schema compatibility.** No model picker or
   recipe-schema change; context budget correctness fails as described above.
4. **Static rules: PASS.** Python/compiler-test repair; no new frontend IPC,
   storage/router/style concerns. No product edits during review.
5. **End-to-end: FAIL.** Reproduced compiler budget failure. Exact delivered
   candidate/package smoke/restarted-sidecar real-app check: **NOT_RUN**.
   Running sidecar still points to the shared `PuPu` checkout rather than the
   isolated candidate. AC-349-09 remains incomplete.

After correction, restart the intended candidate's Python sidecar before
testing the exact candidate/wheel pair. No sidecar was restarted in this audit.
