# #448 — long-current-turn semantic history projection

Ticket: https://github.com/haoxiang-xu/PuPu/issues/448
Release: #208 (0.2.0), direct child verified on 2026-10-24.
PuPu workspace: `/Users/red/Desktop/GITRepo/pupu-448`, base dev `50ddb4b866c56dedaa446edf863e6a9b12c9e7ce`.
Unchain workspace: `/Users/red/Desktop/GITRepo/unchain-448`, base dev `d2aa98f54a9daa4862ba4cf529fe12406e380e34`.
Both branches: `codex/ticket-448-current-turn-projection`.

## Reproduction and decision

The HELLO export records 60 completed provider calls and 40 compaction metrics.
Some compactions reduced input substantially; the export does not prove that all
40 were ineffective. The final error is the local semantic-history byte cap,
not a demonstrated provider context-length rejection. Its last successful call
used 164,324 input tokens (82.162% of 200,000); input plus output was 82.26%.

A deterministic reproduction on the current dev runtime uses one user turn and
64 completed tool exchanges with 4 KiB arguments each. Its optional projection
is 274,226 bytes, exceeding 256 KiB, although its estimated input is only 69,671
tokens against a 105,523-token pressure threshold. `_assemble` rejects this
before `_reduce`; the fallback cannot checkpoint the pinned current user turn.
`_compile_core` then misleadingly recommends a larger model context window.

Repair the existing deterministic compiler. Under byte or token pressure,
reduce verbose **completed** tool arguments/results to bounded evidence with
exact readable references. Keep every exchange's identity and name; do not
silently drop old exchanges. Keep pending/unmatched pairs, current native tool
batch, currently requested content page, user instructions and pinned task state
unchanged. Preserve canonical journal bytes and checkpoint authority. If even
the reference representation cannot fit, fail truthfully as a local projection
limit; finite context does not promise unlimited exchange counts.

No UI, compaction-mode picker, extra summary model calls, local-model inference,
provider probes, duplicate-call reminders, or #457 adoption. Do not change the
checkpoint schema, source-turn split, task-state objective or graph scheduling.

## Implementation slices and graph evidence

1. Strong agent: implement pressure-only historical evidence projection in
   `src/unchain/context/compiler.py` (`_assemble`,
   `ContextCompiler._compile_core` plus small private helpers). Preserve the
   unpressured representation. Measure before/after serialized history bytes and
   actual projected token estimates; do not count a no-op as compaction.
2. Bounded worker: in `src/unchain/memory/toolkit/validation.py`,
   `decode_context_content_ref` accepts a bare `context_event` in addition to its
   existing `/content` fragment. Other fragments/kinds/invalid locators remain
   rejected. Scope authorization and disclosure stay unchanged. Add regression
   tests in the existing toolkit security suite; no other production edits.
3. Strong agent: compiler regressions and PuPu production runtime-factory
   integration, real durable event/artifact reads, cold reopen and error-to-SSE
   tests. Update architecture documentation only as needed to describe behavior.
4. Review diff, complete graph change analysis, build one wheel, verify the exact
   PuPu/wheel pair, commit/push separate repository PRs to dev, feature audit.
5. Deployment integration follow-up: bind the Release QA default and every
   reusable-job fallback to the same verified Unchain source commit. The first
   PR head still selected the older #451 runtime in CI; local exact-wheel tests
   did not prove that workflow default. Preserve explicit operator overrides,
   source-SHA validation, cache/permission and signing boundaries.

GitNexus upstream impact for `_neutral_context`, `_assemble`, `_compile_core` is
LOW: direct compiler assembly/core callers, coordinator compile passes, and six
to seven indexed compile flows. Qualified `ContextCompiler._compile_core` was
UNKNOWN because CLI lookup expects `_compile_core`; the exact unique method was
then resolved with context and impact. Analyzer flow caps mean absent flows are
not proof of safety. Worker must run and preserve impact on its own symbol.

Weaker-model assessment: **partially suitable**. The settled one-condition
validator change and explicit rejection tests are suitable for `gpt-6-luna`.
Compiler pressure budgeting, ref provenance and restart/continuity integration
remain with the strong parent because they involve coupled immutable-state and
provider boundaries. Worker is authorized only for slice 2, then stops. No
commit/push or dependent edits by worker. Checkpoint 1 reviews its actual diff
and red/green results; checkpoint 2 reviews core negative cases and provenance;
checkpoint 3 reviews exact wheel integration before delivery. Unexpected schema,
authorization, state or scope decisions require strong-agent takeover.

## Contracts

### BC-448-001 — journal → bounded model evidence → scoped content reader

Producer: validated immutable canonical tool events in the bound execution.
Canonical representation: original call arguments, result event and artifact
descriptor with event ID/store sequence and execution/generation identity.
Consumer: model evidence JSON plus existing `context_content_read` request;
canonical locator decodes to `ResourceRef(context_event, event_id, 1)` for the
whole event or the existing exact artifact ref for output. Preview explicitly
indicates incomplete content; it is historical evidence, not instructions.
Admission: existing VERSIONED locator/page protocol; CLOSED tool arguments and
strict ref kinds/fragments; evidence payload is OPEN data, no new provider fields.
Each reduced value carries `projected_value_bytes`/`projected_value_sha256`
for the model value being previewed, not a false descriptor for the read source.
`read_scope` distinguishes `canonical_tool_call_event` (read its
`payload.arguments`) from `full_tool_output` (read the original artifact).
Actual content-page byte counts/checksums describe the fetched source separately.
Unknown fields do not confer authority. Invalid locator, wrong revision/scope,
missing content, ambiguous identity or false readback equality fails closed.
No journal rewrite, synthesized checkpoint coverage, inferred latest fact or
summary-model fallback is allowed. Bound identity and protocol admission remain
unchanged; use the imported runtime manifest, never a Git SHA allowlist.
Positive/negative acceptance: AC-448-001/002/003/005.

### BC-448-003 — QA runtime selection → one built wheel → reusable consumers

Producer: `.github/workflows/release-qa.yml` dispatch default and four job
fallbacks. Canonical source provenance is the full immutable Unchain commit
`122f476df60a549c4e13c102d8a48abe1f1e46f0`, matching the already built wheel's
source revision. Consumers are shared deterministic, Playwright and platform
package workflows; existing admission requires a full 40-hex SHA and builds one
wheel for subsequent consumers. CLOSED source selection remains unchanged;
explicit operator input still overrides the default. Wrong/mutable source refs,
dirty source, changed wheel bytes or manifest mismatch fail at existing guards.
This is artifact provenance, not runtime compatibility via Git SHA allowlisting.
Runtime admission remains based on the actual imported manifest. AC-448-006:
existing artifact-continuity/source-identity/workflow contracts prove that all
fallbacks agree, explicit overrides survive, and consumers retain one-wheel
verification; independently compare the selected SHA to wheel evidence.

GitNexus lookup for this YAML file is UNKNOWN (no callable graph anchor).
Literal/caller inspection confirms exactly five old fixed-SHA occurrences:
one dispatch default and four `unchain_ref` fallbacks. All called workflows use
the passed immutable source and the existing artifact contract. This unresolved
graph coverage is supplemented by direct workflow inspection and owning contract
tests; it is not described as LOW risk or proof that the workflow is unused.

### BC-448-002 — compiler failure → host error → SSE consumer

Producer: typed local semantic-history projection exception; consumer:
`route_chat._normalize_stream_error` and existing stream error presentation.
Admission: existing OPEN error code/message projection; no new request schema.
Byte/reference floor failure must name the local projection and not claim a
provider rejection, exhausted token window or suggest a larger model as a cure.
Genuine token-budget failure keeps existing behavior. Provider-rejection retry
from #451 must not be triggered by this pre-provider error. AC-448-004.

### SEQ-448-001 — repeated tools and durable continuation

Identity: owner chat + execution + generation + attempt, exact event refs and
tool call IDs. Start with a normal user task, append many completed tools in the
same turn, compile under pressure, execute the exact exposed read request, repeat
compile, append another batch, resolve two interactions, reopen the durable store
in a fresh process, then build the next two normal turns. Required observations:
stable originals/refs and meaningful size reduction, current/pending inputs and
task progress retained, no tool reexecution or additional model call. Repeat and
retry rebuild the same view; cold resume/replay reads durable originals. Reset or
generation change cannot reuse foreign refs; rollback to older runtime remains
subject to existing manifest admission and cannot be called proof of this fix.
Normal/graph/subagent use the shared compiler; preserve child filtering and
current batch rules, exercise existing graph/interactions regression suites.
AC-448-001/002/003/004/005.

## Acceptance and verification

- AC-448-001: red-before-green single-turn >256 KiB reproduction compiles below
  byte and token limits with all exchange identities; measured reduction and
  idempotence, no journal mutation. Include Unicode/JSON escaping and token-only
  pressure, plus under-limit unchanged behavior.
- AC-448-002: latest user, pinned goal/progress/next step, pending parallel pairs,
  approvals/receipts, native batch and current content page remain intact;
  regression suites cover checkpoint growth and graph/child filtering.
- AC-448-003: actual PuPu production factory persists real events, compiles the
  exposed handles, invokes the official tool against strict scoped reads, checks
  exact arguments/results/artifact bytes before and after cold reopen; wrong
  execution/revision/fragment/ref identity is rejected.
- AC-448-004: irreducible local history byte limit is typed and reaches the host
  stream error unchanged with zero provider send/recovery; actual token pressure
  remains separately classified. Missing refs fail without mutation.
- AC-448-005: no extra model requests or changed consent; continuation sees
  original task progress across the next two normal turns and cold reopen.

Use Unchain `./run_tests.sh` with its own Python 3.12 environment; host tests use
pytest from a clone-local Python 3.12 environment. Build the final Unchain wheel
once, reuse its exact SHA-256 for all host/contract checks, set
`UNCHAIN_SOURCE_PATH` to the installed site-packages directory, verify actual
imports and runtime manifest digest. Every Python verification uses a fresh
process; an already running sidecar is not evidence for changed Python.

Real desktop/provider acceptance is NOT_RUN unless actually performed; no mock
or strict fake is represented as real-app acceptance. Preserve clones when the
audit is incomplete. PRs wait for owner review; do not merge/close/mark Done.

## Evidence / checkpoints

Research and raw graph/reproduction artifacts are preserved outside the clones:
`/Users/red/.codex/artifacts/pupu-sprint-bug-20261024/`.
Checkpoint and final exact-artifact results will be appended here before delivery.

Checkpoint 1: **continue**. The actual `gpt-6-luna` validator slice was reviewed:
one production condition, strict official-tool positive/negative regressions.
Red: 2 failed/3 passed before the fix; green: 39 passed/4 existing xfails.
The repository `run_tests.sh` currently refuses to start because it checks for
an unrelated `miso` import while this package is named `unchain`. The attempted
runner and error are preserved; equivalent clone-local Python 3.12 pytest is
used without changing that unrelated runner.

Checkpoint 2: **correct before continuing**, then **continue**. Strong review
found misleading source metadata on the first descriptor candidate. Separate
projected-value metadata and explicit read scope fixed it; independent args and
managed-output repros plus red/green strict assertions confirm the correction.
No other actionable findings remained. An initial golden mismatch was corrected
by emitting new diagnostics only for actual compaction, preserving ordinary
request bytes/diagnostics without updating golden fixtures.

Development evidence: 13 new compiler cases pass; compiler/toolkit focused set
52 passed/4 existing xfails. Full Context V2 suite before the metadata naming
correction: 2,002 passed/1 skipped/1 xfailed. Final-source full-suite evidence is
recorded separately below. A 64-exchange fixture shrinks 274,034 → 64,434 history
bytes and 69,623 → 18,247 estimated input tokens; all 64 identities remain. The
128-exchange fixture shrinks 548,046 → 128,846 bytes. These are deterministic
fixtures, not claimed measurements of the original HELLO provider request.

Checkpoint 3: **continue to PR delivery**. Final Unchain source
`122f476df60a549c4e13c102d8a48abe1f1e46f0` passed **4,755** offline tests
(4 skipped, 12 live-provider tests excluded, 5 existing xfails). One wheel was
built from that clean source and reused throughout:

- Wheel SHA-256: `a3b1a538c649afb1caedbb2cd13062bba8715984538b14a01a6a8f8aa84922ee`.
- Imported runtime manifest:
  `sha256:f96b620fca6dc3e26f84cac47c4bbd8ce5e5d43505bf63759b88a15ec5234077`.
- Candidate digest:
  `sha256:8c6534755a46293efe686b35051da7ee2545d2b7edcc54130c995d0f6e628ffd`.
  It hashes 1,910 PuPu workflow/source/test/support files plus wheel and manifest digests;
  Git metadata, plans, reports, caches and environments are excluded. Complete
  input list: external evidence `candidate-inputs.json`.

The exact-wheel host run passed **53 tests**, including all five new #448 tests
and existing runtime-factory/#447/token-budget cases. It verified all 340
installed Python members against wheel bytes before and after pytest, checked
that every loaded Unchain module came from the installed package, and pinned
`UNCHAIN_SOURCE_PATH` to that site-packages directory. The production release
contract entrypoint passed **92 Unchain + 24 PuPu/3 subtests + 2 strict HTTP fake**
tests using the same wheel/source provenance. Counts overlap and are not summed.

The real AgentBuilder/coordinator/provider-wire path completed 64 tools exactly
once across 65 strict-fake model requests; no auxiliary model call or network
provider request occurred. Actual argument-event and output-artifact reads pass
hot and after a fresh host object/context reopens the same store. Task progress
was explicitly persisted through the existing CAS service; these tests do not
claim automatic objective extraction or an actual sidecar-process restart.

Graph delivery review: Unchain full raw `detect_changes(scope=all)` returned all
33 changed symbols/8 affected flows, aggregate HIGH; PuPu returned all 30 changed
test symbols/0 affected indexed flows, aggregate LOW. Neither result reports
partial/truncated, and returned lists match both summary counts. Individual core
upstream impacts were LOW; new helper lookup initially UNKNOWN was resolved by
a forced fresh index and exact LOW impact, not assumed unused. Full raw outputs
and independent strong review are in the external evidence directory.

Remaining acceptance: real desktop/provider probe, packaged application smoke
and an actual sidecar-process cold resume are **NOT_RUN**. No audit PASS or waiver
is inferred from deterministic tests. Keep both clones for owner acceptance;
PR delivery does not merge, close the ticket or mark it Done.

Deployment-binding checkpoint: corrected the five Release QA runtime selections
to the same verified Unchain source. All **19** owning artifact-continuity,
Playwright, source/toolchain, signing-boundary and cache-authority tests pass. An
independent YAML check verifies the one dispatch default and four job fallbacks
match the wheel source revision, with explicit overrides unchanged. Initial
runner failure was a missing clone-local YAML dependency; the exact lockfile
version (1.10.3) was then used read-only without changing source/lock files. All
1,880 previously verified runtime/test/support inputs remain byte-identical, so
the same wheel and runtime/host results remain applicable. The candidate digest
now includes workflow inputs as well. The prior audit draft was not posted; a
fresh audit is required for this delivered head and updated digest.
