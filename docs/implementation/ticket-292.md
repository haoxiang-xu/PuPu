# Ticket #292 — Kimi K2.7 Code thinking replay

Ticket: https://github.com/haoxiang-xu/PuPu/issues/292
Release: #216 (v0.1.12)
PuPu clone: /Users/red/Desktop/GITRepo/pupu-292
PuPu branch: codex/ticket-292-kimi-replay
PuPu base: dev @ ab11e6c2b1cc8a0b78a088499201603ac8a8e87c
Unchain clone: /Users/red/Desktop/GITRepo/unchain-292
Unchain branch: codex/ticket-292-kimi-replay
Unchain base: dev @ 312a1afa517be882a47effb0b2cbecf7d964ed8d

## Research and settled repair

Prior real-key reproduction is issue #202 comment 5672098722. K2.7 Code
requires enabled thinking, so the K3/K2.6 disabled-thinking preset workaround
cannot satisfy this ticket. Current code has two independent signature gates:
AnthropicModelIO._fetch_turn_streaming rejects the response with a tool call;
context_assembler._anthropic_semantic_assistant rejects retained history.
HyperspaceModelIO inherits the first gate. PuPu's actual
make_custom_model_io_factory constructs this class with the declared endpoint
and model, including both shipped Kimi sites.

Keep native Anthropic and other Hyperspace endpoints strict. Add an explicit,
versioned Kimi replay profile selected only by HyperspaceModelIO for exactly
kimi-k2.7-code at https://api.moonshot.ai/anthropic or
https://api.moonshot.cn/anthropic (optional trailing slash). Bind the profile to
endpoint and model. Never infer compatibility from a hostname substring, a
user payload flag, absence of a signature, or a forged placeholder signature.
Keep raw thinking in provider-private replay and existing reasoning trace output.
For this profile only, normalize an absent/null/empty signature by omission;
nonempty signatures remain intact. Non-string malformed signatures fail.

Persist the closed profile identity with each native replay frame. Pass the
actual live ModelIO's profile to request/context assembly on all three runtime
call sites, including KernelLoop's owned/final-boundary branches. A profiled
frame must exactly match the active endpoint/model/profile and hyperspace state;
unknown profiles, changed identity, native Anthropic, and callers without the
live profile fail closed. Untagged frames keep the existing strict rules. Do not
rewrite old broken checkpoints, provider presets or conversation histories.

## Files and verification

Read AGENTS.md, CLAUDE.md and the cross-boundary rule in both clones; PuPu
custom_provider.py and tests; Unchain anthropic.py, hyperspace.py,
context_assembler.py, model_turn_runtime.py, kernel/loop.py and
 tests/test_provider_replay.py. Add a small shared profile validator module.
Add regressions using real ModelIO output into the real context assembler,
KernelLoop and durable checkpoint restoration; strict fake wire consumers must
validate full block key sets and values independently. Preserve native signed
thinking, reject unsigned native/other endpoints, wrong profile/version/model,
unknown profile fields and malformed signatures. Test repeated calls and the
next user turn without duplicate/missing thinking or tool result blocks.

PuPu adds an integration regression using its shipped presets and actual custom
provider factory with the same built Unchain wheel; preserve K3/K2.6 defaults
and DeepSeek routing. Deliver companion Unchain PR and PuPu PR to dev. Pin QA
verification to the delivered runtime commit rather than claiming old-wheel CI
validates new runtime code. No UI changes or design choices in this ticket.

## Formal model assessment and checkpoints

Not suitable for weaker-model implementation at this stage: endpoint identity,
provider-private durable replay and both alternate KernelLoop request branches
must be changed together, and no existing Kimi-profile regression defines this
contract. The strong agent owns implementation and independent regression
review. Reassess only if a genuinely bounded remaining slice is established;
no local models or simulated delegation. Checkpoints: red reproduction;
profile/producer/consumer negative tests; real runtime sequences and host factory;
final graph/diff review; one built wheel + host tests; PR CI and feature audit.

## BC / SEQ / AC

BC-292-1: producer HyperspaceModelIO -> provider replay frame -> durable store /
ProviderContextAssembler -> Anthropic SDK Messages wire. Profile identity is
CLOSED: profile='kimi.unsigned-thinking.v1', endpoint, model; exact keys and exact
allowed values. Existing frame envelope remains OPEN under existing generic
replay schema; this new profile subobject is CLOSED. Thinking/tool content uses
the existing Anthropic-compatible wire with no fabricated signature. Unknown
profile identity or active route mismatch is an error before network/tool work;
there is no automatic fallback or checkpoint rewrite. Existing untagged
Anthropic frames retain strict signed-thinking validation.

BC-292-2: PuPu shipped preset -> parse_custom_provider -> real custom factory ->
Unchain wheel. Existing producer/consumer JSON contract and shipped preset IDs
are unchanged. Bind acceptance to one built wheel SHA256, imported manifest
digest and PuPu candidate digest. Source-only tests are development evidence.
No active rollout or full audit PASS without the exact artifact pair and live
acceptance. Old runtime rejects unsigned replay and is not an acceptable delivery.

SEQ-292-1: same endpoint/model/chat -> first tool turn -> result -> second tool
turn -> final answer -> second user message -> cold restart/resume. Raw reasoning
must survive once per original turn; tools/results retain IDs and order. Retry
and interaction resumes must retain profile identity; provider/model/endpoint
changes must reject incompatible profiled replay before network execution.
Normal, final-boundary and durable ownership request branches are applicable.
Graph/subagent factory propagation uses existing custom-provider tests plus
profile-aware runtime coverage. Record unexecuted live cells as NOT_RUN.

AC-292-1: unsigned Kimi thinking + tool call succeeds through real producer and
strict consumer; original implementation fails red before the repair.
AC-292-2: native Anthropic and non-Kimi proxies still reject unsigned thinking;
signed native replay, K3/K2.6 and DeepSeek paths do not regress.
AC-292-3: second tool call, next user message and cold restart preserve valid
replay identity and contents; mismatched identity/profile/version fails closed.
AC-292-4: actual PuPu shipped factory selects the narrow Kimi profile with no
new user-controlled toggle, using one immutable runtime wheel.
AC-292-5: real cloud K2.7 Code tool round-trip and repeated/restarted continuation
against the exact candidate pair. Credential or provider availability failures
remain explicit blockers; never use a local model or waive the requirement.

## Risk and limits

Both clones freshly indexed. PuPu factory impact: MEDIUM, 14 upstream symbols,
5 direct callers (normal agent, curator, graph, interject and probe). Unchain
stream parser LOW; request build / assembler / segment dispatcher / KernelLoop
step HIGH, reaching run and interaction/human-input resume paths. User warned
before edits. Hyperspace constructor and standalone fetch helper UNKNOWN;
text search confirms registry, PuPu factory, tests and KernelLoop runtime import.
Graph extraction has unresolved dynamic calls and process pruning; zero is not
proof of absence. Exact full detect_changes is required before commit.

Live cloud credentials and packaged acceptance are not yet verified. Official
Kimi docs currently describe newer Code model aliases; do not substitute another
model or expand this ticket based on those docs. Use the exact existing shipped
model and record any server-side availability change as a blocker.

## Review checkpoint — 2026-09-20

Independent strong-agent audit found a P2: existing stream parsing coerced raw
signature/thinking values before the new validator. Ten added cases failed on
the first candidate; profile-scoped checks now reject malformed initial blocks
and deltas before conversion. Added the separate durable provider-ownership
branch regression (legacy fetch forbidden) and SDK final-message cases. The
reviewer's actual pinned-SDK mock SSE probe also passed; preserve that as a
PuPu host regression because the shipped SDK is anthropic 0.83.0/httpx 0.28.1.
The source dev environment's newest SDK uses a different timeout class and is
not the deployed dependency pair; no deployed regression is inferred from that.

Full forced GitNexus rebuild corrected an incremental-index anomaly: a query
had lost the parser's symbol ID/type and attributed unrelated property access
edges to it, yielding CRITICAL/242. User was warned. A full rebuild restored
the exact parser UID and LOW/4 upstream symbols. Request-path HIGH risk remains
applicable. Raw final graph checks are preserved in the evidence directory.

Completed legacy MemoryManager turns retain semantic tool history but do not
persist earlier raw thinking into the next user turn. This is existing behavior,
not changed by this patch. Regression checks preserve tool IDs/results and
successful next-turn assembly; real Kimi acceptance of that completed-turn
history remains NOT_RUN. Within unfinished turns and checkpoint/approval
resumption, raw thinking is preserved. Do not claim the live continuation
acceptance criterion passed based on a deterministic final-text fixture.

No Kimi models were available in the running app catalog (25 models returned),
and KIMI_API_KEY/MOONSHOT_API_KEY were absent. No secrets were printed or copied.
Real cloud K2.7 Code and packaged qualification are blocked by missing live
verification inputs. Retain clones while acceptance is incomplete; never infer PASS.


## Delivery update — 2026-09-20 (America/Vancouver)

The owner merged [Unchain PR #34](https://github.com/haoxiang-xu/unchain/pull/34)
into dev at 2026-09-21T03:51:20Z, merge commit
`bc74d21db2f0cd07a19eb75004ca290e74170768`. Its delivered head is
`ce421020e9766b4ff315953e45ae2b2c49a4d3ee`; the Python 3.12 full-suite CI passed
[run 35521935671](https://github.com/haoxiang-xu/unchain/actions/runs/35521935671).
PuPu's workflow pins that exact tested head in the dispatch default and all four
callers. The branch was fast-forwarded to current PuPu dev `c5209de2` before
commit; intervening changes affect only the Ollama store selection menu.

One wheel was built from the final runtime head and reused for both test groups:

- Wheel SHA-256: `adaab468bd7bcc1af22fb918b6d0050d9f6031c2074033d045938f3d5f61e5ff`.
- Imported manifest digest: `sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc`.
- Host factory, shipped-wire and actual SDK stream tests: **114 passed**, plus
  **16 subtests**, using anthropic 0.83.0 and httpx 0.28.1.
- Runtime replay, repeated tools, cold checkpoint/approval resume, owned-provider
  path and strict identity/native-provider regressions: **117 passed** against
  the same installed wheel.
- Workflow artifact continuity: **5 passed**.
- Full i18n scan: all ten translated locales have zero missing/orphan/placeholder
  mismatches; code missingInEn=0. Existing dead keys/dynamic references remain.

The installed module origin, wheel bytes, pip-installed archive hash and actual
imported runtime manifest were verified before each group. The evidence directory
contains the artifact record and reproduction runner; its paths identify this
retained test workspace. Wheel bytes remain at
`/tmp/pupu-292-wheel-final/unchain-0.2.0-py3-none-any.whl` and the clones are
retained. No local model inference or live external LLM call was used.

Feature audit is still INCOMPLETE: real cloud K2.7 Code tool calls and subsequent
messages/cold restart in the candidate app, plus package smoke, have not run.
The sidecar was not restarted into this candidate, so no currently running app
is claimed as acceptance evidence. Merge is delivery evidence, not a substitute
for those AC-292-5 observations. The candidate digest and actual PR checks are
recorded in the issue audit after commit.
