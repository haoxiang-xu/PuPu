<!-- release-feature-audit:v2 -->
# Issue feature audit — 2026-09-26 (Step 4 second repair)

Release: #216; child: #349; Project: #13.
Overall: **FAIL** — keep In Progress. Scope is Step 4 and its latest repair.
Earlier cache/background acceptance is unchanged.

## Findings

### P1 — Completed tool history still blocks context compaction

`unchain/src/unchain/context/compiler.py:2929–2931` marks the entire completed
history blob mandatory. `_reduce` raises at lines 3077–3087 before it can select
an older prefix for a checkpoint. The new covered-pair filter at lines 2789–2794
only helps pairs already covered by an existing binding.

On the exact retained wheel, an 8192-token window, a short current user message,
and 20 completed historical lookup pairs with 1200-character result previews
raise `PinnedTaskStateBudgetError`; zero checkpoints are prepared. Five and ten
pairs succeed. An existing committed checkpoint followed by a completed old
20-pair tool turn also raises the same error and leaves checkpoint count at one.
The coordinator only falls back for `checkpoint_consumption_invalid` (lines
921–924); this budget failure escapes. The visible error incorrectly attributes
the overflow to pinned instructions/current input when completed old history is
responsible.

This is an unresolved Step 4 design/acceptance gap, not a claim that the latest
repair introduced the original mandatory-history behavior. AC-349-04 and the
Step 4 requirement to stop rebuilding a mandatory all-tool-history blob remain
unsatisfied. Fix selection/compaction of complete old tool groups before the
mandatory-budget check, preserve unfinished/current pairs and durable references,
and exercise both first-checkpoint and existing-checkpoint growth paths. Merely
catching the error cannot fix the unbound path, which has the same mandatory blob.

### P2 — Warm reuse still rereads archived content and reprojects full history

`unchain/src/unchain/context/coordinator.py:657–680` reads the whole selected
checkpoint and rematerializes its source proof every compile. `_read_checkpoint_payload`
uses bounded pages correctly, but has no verified warm-content reuse.
`_checkpoint_materialization` (line 538) invokes the full canonical projection;
compiler preparation/assembly/reduction invoke it again.

Instrumentation around three identical warm coordinator compilations recorded:

- 3 complete checkpoint reads (31,018 bytes each in this fixture).
- 21 calls to `_canonical_journal_message_projection` (7 per compile).
- 27 calls to `_validated_projection_events` (9 per compile).
- 3 calls to `_neutral_context`.

Lazy candidate enumeration now stops after a successful candidate, and reuse
now uses one compiler pass: those fixes are verified. However, no validated
incremental projection exists in this path. This leaves Step 4's explicit
incremental-projection requirement incomplete; the counters do not establish
any particular wall-clock slowdown or improvement. Use a revision-bound verified
projection/checkpoint view with safe invalidation, then measure archived reads,
processed events, median and p95 against a cold rebuild.

## Repairs verified

The previous real SQLite read-limit failure is fixed by 64 KiB pages.
The previous multi-turn larger-window mismatch and text-only growing-suffix
fallback pass the retained production-wheel probe. The PuPu legacy discovery
now spans attempts within the same owner/session/generation; its regression
passes. Plan BC-349-08 still says lookup is restricted to the originating attempt
and should be updated to distinguish current execution authorization from the
checkpoint's originating attempt.

## Evidence and limitations

Reused, not rebuilt, wheel:
`/tmp/unchain-349-wheel-final3/unchain-0.2.0-py3-none-any.whl`.
Unchain wheel SHA-256: sha256:147a4bc4dd5e2a19866ca587ce4ae74ae6ea1089eff8789a9be6479849a53728
Runtime manifest digest: sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e
Candidate digest: NOT_AVAILABLE (no delivered PuPu candidate verified).

Confirmed actual import from that wheel and byte identity of all four changed
Unchain production files with the reviewed source. Used the existing Unchain
Python 3.12 environment with wheel-first PYTHONPATH; did not modify it.

- Four focused Unchain suites: **75 passed** (2.58s).
- Four PuPu paired suites: **72 passed, 2 subtests passed** (5.58s).
- Existing `step4-repair-audit-probe.py`: real SQLite repeat, multi-turn reuse,
  larger-window reuse and text growing-suffix fallback all OK.
- `step4-second-repair-audit-probe.py`: counters and tool-history failures above.
  It uses the production coordinator/compiler from the wheel with recording
  persistence to isolate compiler selection; it is not a real-app probe.
- Both source diffs pass `git diff --check`.

The dev Test API responds, but the current sidecar command points at
`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/main.py`, not the audited
isolated candidate. No restarted-sidecar test with this exact PuPu/wheel pair was
performed; no desktop performance result is claimed. Because concrete compiler
failures already block acceptance, deployment was not advanced during review.
BC-349-05 / AC-349-09 package smoke and exact running candidate remain NOT_RUN.
This is an evidence gap, separate from the two implementation findings above.

## Five audit checks

1. i18n: PASS — full scan: no missing, orphan, placeholder mismatch or missing
   English keys; 48 dynamic calls and 65 existing dead keys are informational.
2. UI: N/A — Step 4 repair adds no UI.
3. Model × agent builder: N/A — no model selection/schema changes; compiler
   behavior is evaluated by the end-to-end/contracts check.
4. Static rules: PASS — scoped Python-only repair; no renderer IPC, storage,
   router, style or Electron twin changes.
5. End-to-end/contracts: FAIL — reproducible tool-history overflow and incomplete
   incremental projection; exact running artifact pair remains NOT_RUN.

No product code changed, no commit or deployment performed, no issue closure.
