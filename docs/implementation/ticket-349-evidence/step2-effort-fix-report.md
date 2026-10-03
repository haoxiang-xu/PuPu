# #349 step 2 F3 repair — 2026-09-26

The background provider projection now preserves a string `reasoningEffort` through model selection, transient registration, retry and reconstruction. The existing payload builder still owns normalization, supported values and protocol-specific omission. Non-string values are dropped before retention. No durable host schema or Unchain runtime change.

## Verification

- Red-before-green against frozen r6: **15 failed, 6 passed**. Actual OpenAI Responses and Anthropic payload assertions show the missing low/high effort. The other failures cover retained scalar options. [Red log](step2-effort-red.log).
- Frozen r7 with the exact same Unchain wheel: **286 tests passed, 65 subtests passed in 47.88 seconds**, including 21 new parameterized cases. An import-origin guard checks that runtime imports remain inside the wheel. [Test log](step2-effort-tests.log).
- New cases exercise real selection, SQLite registration, option recovery and provider payload construction; repeated registration/retry; cold configuration unavailability followed by authorized refresh. They assert exact wire payloads, string-only retention, unknown-value omission, Anthropic minimal-effort omission, Ollama effort omission, and exclusion of prompt/callback/cancellation state.
- OpenAI Responses and Ollama use the actual official invoker/raw factory with only the final Agent constructor intercepted. Anthropic uses the actual downstream payload builder after registry resolution: the existing official raw factory rejects its `hyperspace` twin (`_SUPPORTED_PROVIDERS` contains `anthropic`, not `hyperspace`). This predates the F3 repair and remains a separate compatibility limitation; these tests do not certify full custom-Anthropic agent execution. No live provider requests were sent.
- Four task-owned sidecar starts/restarts (two official, two legacy) returned healthy and exited 0. Retry deadlines/attempt counts and original legacy provider binding were preserved. [Official evidence](step2-effort-sidecar-smoke.json), [legacy evidence](step2-effort-legacy-sidecar-smoke.json). Python changes were loaded by fresh processes; the user's original desktop app was not restarted.
- All 372 frozen source/resources match current working source. Relative to r6, only `memory_v2_background_worker.py` and the new `test_memory_v2_background_effort.py` changed. `git diff --check` passes.
- GitNexus was bound explicitly to `/Users/red/Desktop/GITRepo/pupu-349`. The new `narrow_provider_options` symbol is absent from the index (UNKNOWN), so callers were corroborated from source: official selector, configuration extraction, registry registration and invoker resolution. Consumer `_build_payload` reports CRITICAL (6 direct edges, 82 processes, 20 modules); the user was warned before the fix. That shared consumer was not edited. No commit was made.
- Plan records BC-349-03a, SEQ-349-04h and AC-349-14. No wheel rebuild or durable-schema change.

## Artifact pair and limits

Candidate server/resources digest: `sha256:176faa3e22f2ad42fcf3580654d35b1ba326e425789917aede12b16c094c7100` (SHA-256 of the retained source-manifest JSON bytes).

Unchain wheel SHA-256: `sha256:03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`.

Imported runtime manifest: `sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`.

[Identity](step2-effort-artifact-identity.json), [source manifest](step2-effort-source-manifest.json). Replay directory: `.local/ticket-349-background-checkpoint-r7/`; run its `run_tests.py` with `/Users/red/Desktop/GITRepo/unchain/.venv/bin/python`.

F3 implementation is ready. Real-provider desktop/package validation remains incomplete; this is not a formal audit PASS. Ticket remains open and In Progress. No commit, push, PR, closure or active rollout.
