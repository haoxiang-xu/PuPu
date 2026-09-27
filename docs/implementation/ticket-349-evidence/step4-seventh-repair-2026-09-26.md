# Step 4 seventh repair — retained checkpoint repositories

## Result

The final8 audit regression is fixed. Repositories that do not implement
`checkpoint_ref_for`, or explicitly raise `NotImplementedError`, no longer price
a fabricated maximum-length checkpoint identifier. They prepare the first
complete-prefix candidate, bind the actual returned reference, and run the same
budget and consumption proof used by exact-preview repositories. If that marker
does not fit, the coordinator advances to the next complete-turn cutoff. Only
the candidate that passes the bound proof is committed.

PuPu's retained `PupuCheckpointRepository` now implements an exact, read-only
preview from the same commit-operation and checkpoint-id derivation used by
`prepare`. `prepare` calls the preview method for its resource identity, which
prevents the two paths from drifting.

BC-349-08 now records both cases: exact preview for the official/retained PuPu
repositories and verified prepared-ref fallback for third-party or older
repositories. No new serialized field, provider message shape, schema, or LLM
call was introduced.

## Regression coverage

- Exact-preview repository: still prices the exact marker before preparation.
- Unsupported preview (`NotImplementedError`): a 19,000-character current-only
  suffix succeeds with one prepare and one commit.
- Absent preview method: the same boundary succeeds.
- Actual marker does not fit the first tentative suffix: the coordinator
  prepares the next complete prefix and commits only the second candidate.
- PuPu preview identity equals the reference returned by `prepare` and `commit`.
- A repository that previews one identity and prepares another still fails with
  zero commits.

The sixth-audit reproducer now succeeds for both exact and unsupported preview
at 18,900, 19,000, 19,050 and 19,100 characters. All six retained Step 4 audit
probes pass unchanged from the final9 wheel.

## Verification

- Full Unchain source suite: **3,764 passed, 16 skipped, 5 xfailed** in 85.01s.
- Unchain context-v2 source suite: **1,500 passed, 1 skipped, 1 xfailed**.
- Exact final9 wheel context-v2 suite: **1,500 passed, 1 skipped, 1 xfailed**.
- Exact final9 wheel with PuPu repository/read-adapter/runtime-factory/protocol
  suites: **100 passed** in 4.11s.
- PuPu checkpoint repository source test: **45 passed**.
- All six retained Step 4 audit probes pass from the final9 wheel.
- Changed production wheel members match the candidate source bytes.
- Both repository diffs pass whitespace validation.
- GitNexus cumulative change analysis: PuPu **medium** across one recorded flow;
  Unchain **critical** across 35 flows because the result includes the complete
  ticket diff. Full-suite and fixed-wheel checks were therefore retained.

## Exact artifact pair

- Wheel: `/tmp/unchain-349-wheel-final9/unchain-0.2.0-py3-none-any.whl`
- Wheel SHA-256: `5df9bd1b6b2b4d084acb199bbc342cad8819be758910e1fbbffa95831d65f52f`
- Imported runtime manifest:
  `sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e`
- Imported compiler path during the compatibility probe:
  `/private/tmp/unchain-349-final9-site/unchain/context/compiler.py`

A task-owned candidate sidecar was started from `pupu-349` with the final9 wheel
on port 5894. Authenticated `/health` returned HTTP 200, and the process shut
down cleanly. The user's currently running desktop app was not replaced, no
release package was installed, and no commit, push, PR, rollout, or ticket
closure was performed.
