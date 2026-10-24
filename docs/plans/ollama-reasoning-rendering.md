# Ollama reasoning rendering fix

Target release: 0.2.0, direct child #453 of Release #208.

Scope: render adjacent reasoning deltas from the same run and model turn as
one live paragraph, including Ollama's per-delta provisional preview IDs.

Cause: `sameReasoningTurn` compared `provisional_reasoning_id`, but the exact
Ollama transport generates a separate ID for each buffered reasoning event.
These IDs identify individually retractable deltas, not model turns.

Boundary gate: **NOT_APPLICABLE**. The production change is entirely within
the renderer's derived display projection. Provider transport, canonical event
schema, IPC, persistence and raw activity frames keep their existing shapes
and identities. No rollout or backend artifact changes are part of this fix.
Raw frames retain preview IDs so resets still retract individual deltas before
the UI recomputes its merged paragraph.

Validation:

- AC-001: live canonical deltas with distinct preview IDs form one paragraph;
  regression failed before the fix for Qwen3 32B, DeepSeek R1 32B and GPT-OSS 20B.
- AC-002: reset retracts only the matching delta after the paragraph was merged.
- AC-003: adjacent different runs and iterations remain separate; frozen source
  frames remain unchanged. Tool boundaries and whole Responses reasoning items
  retain existing regression coverage.
- AC-004: existing Ollama producer fixtures retain durable replay, duplicate
  event handling, second-run and cold replay behavior. These are deterministic
  fixture tests, not live model inference or a deployed-artifact qualification.

GitNexus: refreshed PuPu at `937b4c14`; upstream impact is LOW for
`sameReasoningTurn` and `coalesceReasoningDeltaFrames`, with the caller chain
`sameReasoningTurn → coalesceReasoningDeltaFrames → displayFrames`.

Results:

- New regression suite: 8 passed. Existing focused trace and Ollama contract
  suites: 60 passed. Independent patch review: no findings.
- Isolated Chromium with the actual renderer and event reducer: nine distinct
  preview deltas displayed one `Reasoning` title and the complete sentence;
  no console errors or warnings.
- Full JS run: 446 suites passed; one suite's six localhost broker tests failed
  under sandbox port restrictions. All six passed when rerun with that
  restriction removed. Eight pre-existing skipped suites were unchanged.
- `git diff --check` passed; GitNexus change analysis reports one changed
  production symbol (`sameReasoningTurn`), low risk.
