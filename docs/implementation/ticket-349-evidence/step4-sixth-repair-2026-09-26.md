# Step 4 sixth repair — checkpoint projection budget

Date: 2026-09-26
Release: #216
Child: #349

## Repaired failure

The unbound reduction pass previously selected a checkpoint prefix using only
the retained messages. The coordinator then prepared that checkpoint, added the
checkpoint marker in the bound pass, and could fail with
`checkpoint_consumption_invalid` because the marker crossed the real input
budget. A larger complete prefix was valid, but was never selected.

The official checkpoint repository now exposes the exact deterministic
checkpoint reference for an already-materialized operation without writing it.
The coordinator supplies that reference to the private planning pass, which
prices the complete future marker before preparation. The prepared reference
must equal the previewed reference; identity drift fails before commit. Custom
repositories without preview support retain a safe maximum-size fallback.

BC-349-08 now records this read-only preview and identity check. The change does
not add an LLM call, a SQL read, or a SQL write to the normal below-pressure
path. It only runs while planning a new checkpoint under context pressure.

## Boundary evidence

At an 8,192-token window with a 5,068-token message budget:

| History shape | Boundary input | Selected omission | Result |
| --- | ---: | --- | --- |
| Two completed text turns | 19,000 chars in recent old turn | `(0, 1)` | 5,044 tokens; recent turn retained |
| Two completed text turns | 19,250 chars in recent old turn | `(0, 1, 2, 3)` | 277 tokens; larger prefix selected before prepare |
| Recent old turn contains a complete tool call/result | 17,850 chars | `(0, 1)` | 5,063 tokens; complete tool turn retained |
| Same tool turn | 17,900 chars | `(0, 1, 2, 3)` | 277 tokens; complete tool turn moved as one group |

The prior failing 19,250–20,000 character range now succeeds with one prepare
and one commit. A repository that previews one reference and prepares another
is rejected with zero commits.

## Verification

- Full Unchain source suite: **3,761 passed, 16 skipped, 5 xfailed** in 80.12s.
- Focused source suites for compiler, coordinator, checkpoint proof/projection,
  and SQLite persistence: **101 passed**.
- Exact final8 wheel, same five suites: **101 passed** in 3.45s.
- All five retained Step 4 audit reproducers pass from the final8 wheel,
  including multi-turn tools, growing suffixes, warm/cold corruption, and the
  newly fixed marker boundary.
- The four changed production files match the wheel bytes exactly.
- Both repository diffs pass whitespace checks.
- Direct GitNexus impact for the compiler methods and SQLite repository is LOW;
  the checkpoint repository interface is MEDIUM. The cumulative Unchain ticket
  diff remains CRITICAL across 35 flows because it includes all prior Memory V3
  work, so the full-suite and wheel checks remain required.

PuPu's selected repository/adapter/runtime/protocol group currently reports
**89 passed, 1 failed**. The failure is the legacy oversized-task-state fixture
whose seeded journal operation receipt is rejected before budget planning.
The same isolated test fails identically against final7, so it is not introduced
by this repair and is retained as an explicit baseline issue rather than called
green.

## Artifact identity

- Wheel: `/tmp/unchain-349-wheel-final8/unchain-0.2.0-py3-none-any.whl`
- Wheel SHA-256: `f6a5be52ff43733e120d24d3c2a2ac7bd2f647db5b72f156c425bdd4e9c67232`
- Imported runtime manifest: `sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e`

No sidecar was restarted, no desktop candidate was installed, and no commit,
push, pull request, rollout, or ticket closure was performed.
