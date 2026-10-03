<!-- release-feature-audit:v2 -->
# Issue feature audit — 2026-09-26 (final9)

Release: #216, verified direct parent and Project #13 Size=Release.
Child #349 remains OPEN / In Progress.
Overall: **FAIL / INCOMPLETE (application evidence)**.
The seventh repair passes the scoped code and compatibility review. No new
actionable implementation defect was found in this audit. The remaining
acceptance gap must not be represented as another compiler defect.

## Fresh verification

The existing final9 wheel was reused without rebuilding. Imports were verified
directly from the wheel archive, avoiding the editable original checkout and
the separately installed dependency directory. All 330 Python members in the
wheel match the candidate Unchain source bytes.

- Compiler, coordinator and SQLite compiler suites: **86 passed** in 3.83s.
- PuPu repository, official read adapter, runtime factory and runtime protocol
  suites: **100 passed** in 4.30s.
- All six retained Step 4 audit reproducers were rerun. Their previous failures
  remain fixed: exact marker boundary, multiple historical tool turns, growing
  checkpoint coverage, recent-result retention, corruption after warm reuse,
  and repositories lacking reference preview.
- Additional 12-case boundary matrix: exact, unsupported and absent preview at
  19,000 / 19,100 / 19,400 / 19,800 current-input characters. The first two
  sizes succeed within the actual budget. Repeating each successful request
  leaves one preparation and one commit, with zero partial reports. The latter
  two sizes fail explicitly with zero commits and zero recorded builds;
  non-preview repositories retain one uncommitted preparation, as designed.
- Existing retry-expansion test verifies two preparations but only one commit,
  covering the larger complete prefix. Preview identity drift still fails
  before commit. The PuPu prepare/commit preview round-trip passes.
- Both diffs pass whitespace checks. The prior full-suite 3,764-pass result is
  implementation evidence, not a fresh full-suite run in this audit.

Review found the new minimum cutoff is forwarded through initial compilation
and semantic-history recovery. Retry advances beyond the preceding complete
turn cutoff, and bound compilation still verifies the actual checkpoint marker
and consumption proof before commit. Current input and complete tool pairs
remain protected by the existing reducer checks.

## Five checks

1. **i18n: PASS.** Fresh full scan: no missing/orphan keys, placeholder mismatch,
   or missing English references. Existing static-analysis blind spots remain:
   48 dynamic references and 65 dead-key candidates. No translations changed.
2. **UI: N/A.** This repair introduces no renderer widgets or styling.
3. **Model × builder: PASS for compatibility.** No provider/model picker,
   effort, character binding or recipe schema changes in the repair. The
   candidate runtime factory suite passes with the same fixed wheel.
4. **Static rules: PASS.** No new renderer IPC, component storage, routing,
   styling or TypeScript changes. Existing Electron test twins are both present
   in the cumulative ticket diff. Graph change review reports PuPu medium and
   Unchain critical across 35 flows for the cumulative ticket, not just final9.
5. **End-to-end: FAIL / INCOMPLETE.** The repair's compiler/persistence boundary
   checks pass. The prior task-owned sidecar returned HTTP 200 from /health,
   but its response reported `protocol_not_required`, with no runtime manifest;
   that smoke cannot establish active Memory V2 admission or real model/UI
   behavior. The currently running Electron PID 47880 and sidecar PID 47927
   still use the original PuPu checkout. No final9 packaged candidate or
   candidate-bound real-model desktop conversation has been verified.
   BC-349-05 / AC-349-09 and the applicable application portions of SEQ-349-07
   therefore remain incomplete. This is not a rollout/signing requirement.

## Artifact identity

Candidate digest: sha256:1049090eb0472fda65be4b6908ff6ce504ac071e04c1a457fbb4e7035e609da8
Unchain wheel SHA-256: sha256:5df9bd1b6b2b4d084acb199bbc342cad8819be758910e1fbbffa95831d65f52f
Runtime manifest digest: sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e

Candidate digest binds the 854-file PuPu production-source manifest plus this
wheel digest, as recorded in `step4-final9-audit-identity.json`. It is an audited
source identity, not a packaged desktop artifact digest or deployment proof.

Wheel: `/tmp/unchain-349-wheel-final9/unchain-0.2.0-py3-none-any.whl`.
No product code edits, commits, PRs, desktop replacement or issue closure.

## Next acceptance work

Run the exact candidate desktop with this same wheel and active runtime
admission, restart its sidecar, complete a real GPT-4.1 conversation and inspect
the persisted build/provider output and UI result, then complete the declared
candidate package smoke and bind that evidence to its artifact digest. No
additional compiler repair is requested by this audit.
