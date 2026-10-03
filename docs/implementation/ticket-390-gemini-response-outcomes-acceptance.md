# Gemini response outcomes repair acceptance — 2026-10-02

**Real-world acceptance remains incomplete.** The owner's subsequent 18:29–18:32
tests reproduced `durable_provider_turn_uncertain` on Gemini 3.7 Flash after
`context_content_read`. The targeted repair verification below remains valid, but
does not establish reliable multi-model execution. See the incident follow-up.

The three diagnosed gaps are repaired: explicit Gemini rejection seals a terminal
failure; an interrupted stream without STOP/MAX_TOKENS cannot seal success; and
ordinary stream/client cleanup errors cannot overwrite the primary outcome.
Closed Google HTTP status names also survive the safe failure diagnostic.

Existing HTTP diagnostics remain v1. Explicit response outcomes use the closed v2
schema with null HTTP status. The runtime and host require
`provider_response_outcomes_v1`; an older runtime is refused before active use.

## Exact artifact pair

- PuPu candidate: `/Users/red/Desktop/GITRepo/pupu-390`.
- Unchain wheel: `unchain-0.2.0-py3-none-any.whl`.
- SHA-256: `063e71393fb0968fae7c4237b90e306ab5d07713e53bec086397b871bb62cb49`.
- Imported protocol digest: `sha256:213ef239e6f3ed6738a58f22ff9fe14a47e7133010b272c7b9b74eba771159c3`.
- 333 imported Python source files match the production candidate byte for byte.
- Evidence directory: `/Users/red/Desktop/GITRepo/unchain-390/.release-qa/ticket-390/gemini-response-outcomes`.

## Verification

- Before repair, the SDK/HTTPX/SQLite outcome suite had 17 failures and 2 passing
  controls. Both new host checks also failed against the older installed wheel.
- All 20 outcome tests now pass, including signed tool continuation, exact result
  pairing and SQLite reopen without another provider send. Host feature admission
  and safe terminal error projection pass.
- Same installed wheel, full Unchain: 3,997 passed, 16 skipped, 5 expected failures,
  4 failures. All four are OpenAI `none`/`xhigh` sampling-contract tests for
  gpt-6-sol/luna, reproduced against the previous wheel (13 passed, same 4 failed).
- Same installed wheel, full PuPu sidecar: 2,655 passed, 17 skipped,
  3,597 subtests passed. One existing Kimi serializer warning remains.
- The installed-package import smoke test now checks coherent package provenance
  rather than assuming the package resides under a literal `src` directory.
- Both working-tree whitespace checks pass.

## Existing-profile live verification

The desktop instance uses `/Users/red/Library/Application Support/pupu`, retaining
existing conversations and provider credentials. Its readiness check returns
Memory V2 ready and the exact protocol digest above.

Session `gemini-strict-1790990634989`, Gemini 3.6 Flash:

1. First request received HTTP 503 repeatedly. Two bounded retries were displayed;
   the request ended after 71.328 seconds as `durable_provider_turn_terminal_failed`
   with the safe busy-service message, rather than `uncertain`.
2. A second message in that same session completed in 4.648 seconds with `READY`.
   The failed attempt did not block continued use of the session.

The first attempted developer launch fell back to the old sibling runtime because
the installed-wheel source bridge lacked the developer launcher's required
`pyproject.toml` marker. Adding the marker to the ignored acceptance fixture and
restarting selected the intended wheel; the live manifest verifies that correction.
No production launcher code or user profile was changed for this fixture repair.

## Graph review and limits

Pre-edit impact analysis covered changed production symbols; LOW and UNKNOWN
results were supplemented with exact dynamic call-site/constant-reference checks.
Full raw GitNexus change results were retained to avoid the CLI's top-15 display
truncation: Unchain 135 changed symbols/11 processes; PuPu 14 symbols/8 processes.
Overall risk is HIGH because both working trees include the earlier broad #390
repairs. This is not a clean-tree or low-risk claim.

Endpoint pinning, pre-send serialization classification, trace status projection,
Kimi loops and unavailable model IDs remain separate findings. The live test does
not simulate Google safety failures; those are covered through the real SDK with
controlled HTTP responses. No commit, push or issue closure was performed.

## Owner's subsequent real-world incident

- Gemini 2.5 Flash: HTTP 404, closed `NOT_FOUND` diagnostic. The diagnostic is
  working; whether the selected model is available on the configured endpoint
  needs a separate availability check. Do not infer that a missing API key caused it.
- Gemini 3.5 Flash Lite: the supplied screenshot shows successful completion.
- Gemini 3.7 Flash: execution
  `chat-1790990639446-b5450acfc5de7a41fbdb10e6482523df`, attempt
  `graph-step-06687d59acfc7f90c6e9e1803aa6dec1a649a72554d095269e3c4e5341a629b5`.
  Iteration 1 encountered a transient error, then retry ordinal 1 completed and
  produced the content-read call. Its canonical tool result is present at cursor
  138. Iteration 2 starts at cursor 141 and records its wire at cursor 143, but
  has no provider result receipt or completed/failed lease transition. The bundle
  records `uncertain`, 01:29:34.322514Z–01:29:48.190264Z (13.868 seconds).

Exact failed wire SHA:
`50eb53814a7b4e3e8212bfd9da09c6031fed1288ecf8ae03850eab351c95171d`.
Offline replay through the same installed SDK reaches HTTPX MockTransport and
accepts a controlled STOP reply. Serialized request: 64,662 bytes,
SHA `8c5c611b89b70cb685a5367d02da095441dc0835bba1edde40ebab6508cdddca`,
route `/v1beta/models/gemini-3.7-flash:streamGenerateContent`.
This proves local request validation/serialization succeeds for that captured
wire; it does not reproduce the real server response or establish root cause.

The original exception category is absent from the persisted lease/bundle and
available runtime logs. Transport interruption, incomplete response, SDK parsing
or another local exception cannot yet be distinguished. Further diagnosis needs
closed, content-free observation of the original failure and response progress;
blindly converting all uncertain states to retryable would invalidate durable
execution guarantees. The instance and user runs were not restarted or altered
during this incident inspection.
