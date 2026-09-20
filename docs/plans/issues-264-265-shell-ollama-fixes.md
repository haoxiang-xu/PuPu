# Issues #264–#265: shell confirmation and unknown Ollama windows

Release parent: #203. The user authorized finishing, committing, pushing and closing both bugs using automated evidence, and explicitly prohibited further local-model execution. Full release qualification is separate from these bug closures.

## Implementation and contracts

- **BC-264 — CLOSED tool arguments / existing VERSIONED interaction envelope.** OpenAI can produce a JSON-encoded object where other providers produce an object. The existing tool argument parser now runs before confirmation policy evaluation. Its canonical object is used by policy, confirmation UI and eventual execution; the original provider call remains available for replay. Invalid/non-object JSON fails before execution. Missing or unreadable shell commands cannot grant a policy exemption. Tool-specific schema validation and the existing poll/wait/kill lifecycle exemption remain unchanged. Attempt/call/interaction identities and durable receipt schemas are unchanged. **AC-264:** dict/string parity, no side effects before approval, and no side effects after denial. **AC-266:** invalid arguments fail closed while read-only shell policy still works. **AC-267:** real OpenAI producer output, strict provider keys, deferred/durable execution and replay remain covered.
- **BC-265 — CLOSED model window / native provider option.** PuPu supplies an uncatalogued built-in Ollama model with a documented **32,768-token default**, and sends that same value through Unchain to `options.num_ctx`. This is PuPu's default, not a claim about a model's maximum capacity or the daemon's hardware-dependent default. Unchain retains this native option through request preparation, requires a positive non-boolean integer, and continues filtering unknown options. Known Ollama models, other providers and custom-provider settings keep their existing behavior. **AC-265:** known/unknown lookup plus plain requests with and without a toolkit. **AC-268:** the real PuPu payload producer reaches a strict HTTP consumer with exact expected keys and the same positive window; invalid options are rejected/filtered. **AC-269:** a real compiler budget failure retains its subtype and reports the actual model, window and remedy through PuPu's error normalization.
- **SEQ-264:** identified attempt/call → prepare → pending interaction → approve/deny → execute at most once; repeated interaction, retry and cold replay use the same argument meaning. Persistence remains in the existing canonical journal/receipt boundary; BC-264 and AC-264/266/267 apply.
- **SEQ-265:** selected uncatalogued model → first message → second message → tools enabled → restart. Compiler admission and provider wire must agree on the context window. Normal, graph and subagent construction retain the existing identity and protocol contracts; BC-265 and AC-265/268/269 apply. Real local-model execution is not required for bug closure under the user's final acceptance instruction.

## Impact analysis

Both repositories were analyzed before production edits. `prepare_tool_confirmation` is HIGH risk (6 direct callers, 9 upstream symbols across Context V2, deferred tools and durable shell jobs); the user was warned before editing. The core shell resolver is LOW with one resolved direct caller, and dynamic toolkit registration was checked in source. PuPu `get_max_context_window_tokens` is MEDIUM (7 direct callers, 11 upstream symbols across ordinary/graph runtime construction). Ollama request merging and compiler error handling were also analyzed before edits.

PuPu's index was refreshed at base `89c47acd`; the Unchain base is `882a6d2`. Final pre-commit graph results are retained with the evidence below. The added test functions have UNKNOWN graph risk because pytest and injected callbacks are dynamically invoked; source review confirms their use is confined to this regression fixture. Index caps and skipped large files remain limitations: zero resolved flows is not proof that a path is unused.

## Final offline verification

- **PuPu: 312 passed, 40 subtests passed** (39.97 s). Includes unknown Ollama contexts, normal streaming, adapter capabilities, interaction persistence, active host event boundaries, crash matrix and graph interaction resume.
- **Unchain: 1602 passed, 1 skipped, 1 expected failure** (35.33 s). Includes all Context V2 tests, shell confirmation and policy, core toolkit, kernel ModelIO, prepared provider wire/replay, durable approval/exposure/runtime/jobs, interaction fields and runtime manifest.
- The Ollama regression covers four uncatalogued model names, with and without a real toolkit, over two consecutive simulated replies. Each request uses the real compiler with PuPu's resolved window, the real Ollama adapter and an exact-key HTTP fake. No Ollama daemon or local inference is used.
- Both final suites preload the retained wheel before pytest collection and audit every imported `unchain.*` module afterward. Both print `FIXED_RUNTIME_IMPORT_AUDIT_OK`. This prevents the development adapter's sibling-source fallback from silently changing the tested runtime.
- Original red-before-green results were observed: shell regression 12 failed / 3 passed; unknown-context regression 10 failed / 1 passed. Those temporary logs were not retained. Final logs are retained below.
- Both repositories pass `git diff --check`. Each final run has one pytest warning about the preloaded `anyio` module not receiving assertion rewriting; there are no unexpected test failures.

### Retained candidate identity

Evidence directory: `.release-qa/issues-264-265/close-evidence/` (ignored local artifacts).

- One successful build of `unchain-0.2.0-py3-none-any.whl`, reused for both final suites.
- Wheel SHA-256: `3d9c584519fbe9cfeab027e164933b8df853ecb4ff077ca6f83c1a5071b552bf`.
- Actual imported manifest, independently validated by `RuntimeProtocolManifest`: `sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc`.
- `artifact.json` records the wheel, imported path, producer hash and all four changed Unchain source-file hashes. The four runtime files match the retained wheel byte-for-byte.
- Final logs: `pupu-final-tests.log` and `unchain-final-tests.log`. Full graph outputs: `pupu-graph.json` and `unchain-graph.json`. `run_fixed_wheel.py` reproduces the import isolation and audit.
- This retained candidate supersedes the earlier temporary wheel that was lost before archival. It is bug-fix evidence, not certification of an installer or release package.

## Live diagnostics and remaining coverage

Before the user stopped live testing, a real GPT-4.1-mini shell call displayed a confirmation card with no file created while pending. Approval created the expected file. An independent explicit denial returned a durable receipt, ended normally and left no file. A separate two-command probe had an ambiguous second approved UI state and a 500 response; it is not counted as proof of a live approve-then-deny sequence. Automated durable tests provide that sequence coverage.

The earlier Ollama run confirmed `context_length: 32768` but did not yield a verified final reply; a subsequent probe also had no verified final result. Further local-model testing was stopped at the user's request. Live completion with/without toolkits and after restart remains **NOT_RUN / incomplete**, not PASS. No further local model was started during final verification.

Temporary shell files were cleaned up. The app had already exited, so probe-chat deletion and restoring the original selected chat through its API were unavailable; storage was not edited directly. Probe chats are named `QA #264–265`, `QA #264 explicit denial`, `QA #265 unknown Ollama`, and `QA #265 gemma plain and tools`.

| Sequence / acceptance | Evidence | Status |
| --- | --- | --- |
| BC-264 / AC-264, AC-266 | Real toolkit dict/JSON/invalid-input tests; independent live approve/deny | PASS |
| BC-264 / AC-267 / SEQ-264 | Real producer, strict wire, repeated/durable/crash/replay suites | PASS automated; live multi-interaction incomplete |
| BC-265 / AC-265, AC-268 | Real compiler and producer to strict HTTP fake, two replies, toolkit on/off | PASS automated |
| AC-269 | Real compiler failure through PuPu error normalization | PASS |
| SEQ-265 live first/second message, toolkit on/off, restart | Excluded from bug closure by explicit user instruction | NOT_RUN / incomplete |
| Normal / graph / subagent paths | Context V2 and PuPu normal/graph suites | PASS automated |
| Packaged application and release wheel | Not requested or executed | NOT_RUN |

The remaining live/package cells do not block the two authorized bug closures. Full release qualification is not certified here. Pushed commit links and final GitHub closure evidence are recorded in each ticket. Python changes require restarting PuPu's sidecar to load the fixes.
