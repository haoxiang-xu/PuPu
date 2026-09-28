# Step 4 repair acceptance — 2026-09-26

Overall: **FAIL**. Release #216, child #349, Project #13; child remains In Progress.
This is a review of the Step 4 repair, not a reversal of prior cache/background acceptance.

## Blocking findings

1. **P1 — Production SQLite checkpoint reuse always exceeds the artifact page limit.**
   `unchain/context/coordinator.py:658` requests 32 MiB + 1 in one `read`.
   `_SQLiteBoundCheckpointRepository.read` delegates to `ArtifactService.read_page`,
   which rejects limits above 65,536 bytes (`context/artifacts.py:606`).
   This is independent of checkpoint size: the first pressured compile succeeds,
   but the next compile raises `ArtifactBudgetError: artifact page limit exceeds
   65536 bytes`. PuPu's active runtime uses this official SQLite implementation
   (`memory_v2_unchain_runtime_factory.py:991–1016`).
   Fix: use the repository's bounded-page contract (or add a verified full-read
   capability) and exercise create → commit → reuse with the real repository.
   The PuPu legacy repository has a related incompatibility: its read silently
   clamps at 128 KiB; a 150,066-byte JSON checkpoint returned 131,072 bytes and
   failed JSON parsing. A recording dictionary is not a strict port consumer test.

2. **P1 — Reuse fails for multi-turn checkpoints and growing suffixes.**
   `_reduce` starts at cutoff 1 but breaks on the first fitting *nonmatching*
   prefix (`context/compiler.py:3176–3184`). A checkpoint covering two old turns
   therefore fails when a larger window would also fit a shorter cutoff, before
   the correct cutoff is considered. Conversely, if the retained suffix grows
   beyond the budget, the coordinator's bound pass cannot request a larger
   checkpoint and raises `checkpoint_consumption_invalid`.
   Both cases reproduced on the retained wheel. Fix: select the exact bound
   prefix when it fits; if further compaction is needed, return to the durable
   checkpoint creation protocol without reusing a ref for expanded coverage.

3. **P2 — Reuse adds full archived-content reads before every model request.**
   `_verified_committed_checkpoint_bindings` reads, parses and rematerializes
   every discovered candidate (up to 32) before returning, although compile
   only uses `bindings[0]`. `_checkpoint_materialization` projects the journal
   again for each candidate. `_neutral_context` still walks all historical
   calls/results and constructs their records before filtering covered pairs;
   the remaining tool history is still one mandatory synthetic blob.
   This is not the planned incremental projection. No latency improvement is
   established by smaller provider payloads. Fix: bounded metadata selection,
   stop after a usable selection, and a validated incremental view with measured
   archived-read/event-processing counts (AC-349-02/04, Step 4).

## Additional integration gap

The new PuPu legacy `list_committed_refs` filters by current attempt
(`context_memory_v2_repository.py:1372`), so a new attempt in the same chat,
session and generation sees zero refs from the previous attempt. A real store
probe returned one ref in attempt A and zero in attempt B. This limits that
adapter to same-attempt reuse; it does not implement cross-turn history reuse.
The active host uses official SQLite, so this finding must not be described as
the active host's scope behavior. Preserve execution authorization separately
from the originating checkpoint attempt when supporting legacy cross-turn reuse.

## Evidence

Retained wheel: `/tmp/unchain-349-wheel/unchain-0.2.0-py3-none-any.whl`.
SHA-256: `09eed6ce11096d30610c333df2ce9fb4f3dec34e51d687a2cd659b2241034a1a`.
Its four changed Unchain production files are byte-identical to the audited source.
Imported manifest digest: `sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e`.

Run the adjacent `step4-repair-audit-probe.py` with PYTHONPATH set to that wheel.
It uses production compiler/coordinator and real SQLite for the first case,
and recording persistence only to isolate the compiler coverage cases:

```text
sqlite first checkpoint refs: 1
sqlite repeat: ArtifactBudgetError artifact page limit exceeds 65536 bytes
two-turn checkpoint omitted: (0, 1, 2, 3)
larger-window reuse: ContextCompilerError checkpoint_consumption_invalid
growing suffix: ContextCompilerError checkpoint_consumption_invalid
```

Source regression reruns: Unchain four focused suites **71 passed**; PuPu four
related suites **72 passed**. These passing suites do not exercise the failing
compositions above. Prior full-context result of 1455 passed is not repeated here.

Reviewed five-production-file inventory digest:
`5b35142b2555aa5ce202f7983f4c1ad7a0a56a8b93e48798383028fec5489ced`
(sorted-key compact JSON records of repo, relative path and file SHA-256).
This is source-review provenance, not a delivered desktop candidate digest.

## Feature audit checks

1. i18n: PASS — full scan: no missing/orphan/placeholder mismatch or missing
   English keys; 48 dynamic calls and 65 dead keys are existing informational results.
2. UI: N/A — no Step 4 UI changes.
3. Model selection × agent builder: N/A — no selection value/schema changes;
   actual context/model dispatch defects are covered by check 5.
4. Static conventions: PASS — Python-only repair, no renderer IPC, styles,
   component storage, router or Electron twin changes.
5. End-to-end/contracts: FAIL. BC-349-08 / AC-349-04/07 fail the above concrete
   composition probes. AC-349-02's incremental projection remains incomplete.
   BC-349-05 / AC-349-09 exact desktop candidate + wheel + restarted-sidecar
   smoke remain NOT_RUN. No full deployed-candidate digest is available.

No product code was changed or deployed by this audit; temporary stores were
deleted. The retained wheel was reused, not rebuilt. Do not mark Step 4 accepted.
