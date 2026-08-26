# Context V2 live-interaction rebase repair

Status: implementation draft, 2026-08-21

## Scope

This cross-repository change aligns Unchain generation rebase with the existing
graph-checkpoint interpretation of live interactions. It must not rewrite old
journals, synthesize `graph.step.resume.admitted`, or loosen identity checks.

## Boundary contracts

### BC-001 — canonical interaction journal to graph/rebase consumers

The canonical producer is the Unchain/PuPu interaction journal. Graph
checkpoint and SQLite generation rebase remain independent strict consumers.
An interaction is live only when same-attempt runtime activity proves that the
attempt continued and no exact resume admission exists. A durable pause still
requires request, resolution, and an exact admission bound to execution,
generation, attempt, step, interaction, and cursors. Invalid identity,
duplicate, late, or foreign evidence remains fail-closed with zero writes.

### BC-002 — runtime capability and immutable artifact

The imported Unchain manifest advertises
`context_memory.generation_rebase_live_interaction_cycles`. PuPu sidecar and
Electron admission require that feature before V2 side effects. Release tests
and packages must consume one immutable Unchain wheel and verify its SHA-256
and manifest digest.

## State sequences

- **SEQ-001:** live request/resolution, runtime activity, another request,
  terminal, historical resend; graph checkpoint and rebase succeed without a
  fabricated admission.
- **SEQ-002:** durable request/resolution/admission/resume; valid order passes,
  while late, foreign, duplicate, or mismatched admission fails with an
  unchanged durable-authority image.
- **SEQ-003:** successful resend retry and sidecar restart are idempotent;
  stale revision and concurrent operation remain fail-closed.
- **SEQ-004:** one wheel is built, tested, packaged, and reported; any wheel
  or manifest digest drift is `NO-GO`.

## Acceptance criteria

- Red-before-green reproduces the incident sequence (`request@15`,
  `resolution@16`, runtime activity, then `request@24`) against the real
  producer output.
- The repaired rebase accepts canonical live cycles, live tool outcomes, and
  mixed live/durable sequences.
- Late admission, foreign identity, duplicate IDs/cursors, and invalid
  provenance still return non-retryable `graph_step_seal_foreign` with zero
  writes.
- PuPu resend receives a V2 acknowledgement and does not quarantine; retry
  and cold restart remain exactly-once.
- The required manifest feature, exact wheel SHA-256, and manifest digest are
  verified by Unchain, PuPu, Electron, and package smoke tests.

## Tool Output Module Stage 1 addendum

### BC-TOOL-001 — artifactized tool result to Unchain projection

In canonical active Context V2, Unchain creates the versioned
`tool_output_policy_map` directly from the exposed toolkit and its native Tool
declarations, binds the selected policy to the durable tool request, then
ToolOutputManager produces the model-visible projection receipt. PuPu does not
parse, normalize, or write tool policies.
Unknown policy/version, mismatched digest/bytes, invalid ref and malformed
snapshot fail closed.  The identity is the durable source ref plus the attempt
and call ID.  The active runtime requires manifest feature
`context_memory.tool_output_management_v1`.

### BC-TOOL-002 — attempt bundle to tool execution

The Unchain ContextExecutionBundle owns one ToolOutputManager instance and the
ToolExecutionHarness consumes that exact event attachment.  Active snapshots
disable the legacy after-tool-batch budget; legacy/shadow snapshots retain it.
Foreign manager replacement, malformed versioned config and malformed tool
policy maps fail closed.  The journal keeps `{result, metadata}` as the
projection receipt, while the compiler sends only `result` to the provider.

### BC-TOOL-003 — projection ref to paged artifact read

Continuation requests may change only offset and limit and must retain the
original source artifact ref.  A changed source ref is rejected.

### SEQ-TOOL-001 / AC mapping

First, repeated, retry, resume and restart tool results use the same durable
source ref and attempt-scoped manager (AC-TOOL-001, AC-TOOL-002, AC-TOOL-005).
Malformed policy/config fails at admission (AC-TOOL-003), and a changed
continuation source fails at read binding (AC-TOOL-004).  Exact deployed wheel
pair verification remains required before active rollout.

## Tool Output Module Stage 2 — declaration ownership

Status: implementation in progress, 2026-08-21.

### BC-TOOL-004 — Unchain Tool declaration to active route snapshot

Producer: the public Unchain `Tool` / `Toolkit` construction API. Consumer:
the active Context V2 runtime. The declaration is a closed, versioned Unchain
contract: each tool owns one `output_policy` name, defaulting to `default`.
PuPu neither selects, normalizes, nor validates policies; it only exposes an
Unchain Toolkit to the runtime. Unknown or malformed policy names fail when a
Tool is constructed or registered. The attempt snapshot is immutable after
binding, and the active runtime rejects an unknown snapshot version.

### SEQ-TOOL-002 — policy declaration through normal, graph, resume and child runs

1. An Unchain tool declares a policy during construction or toolkit registration.
2. The actual exposed toolkit creates the attempt snapshot.
3. The active Context V2 runtime binds that snapshot before tool execution.
4. Normal, graph, resume, and subagent executions resolve the same declaration
   from their own exposed toolkit; no agent-role or PuPu metadata fallback is
   permitted.
5. Legacy and shadow runs retain their existing result-budget behavior.

### Acceptance criteria

- `Tool(...)`, `Toolkit.register(...)`, and `@Toolkit.tool(...)` accept the
  same closed declaration and preserve `default` for all existing callers.
- An explicit unknown policy fails before a provider request or tool execution.
- PuPu active normal, graph, and resume paths no longer construct or pass a
  tool-output policy map.
- A subagent resolves its policy from the subagent's actual toolkit, not from
  its parent or a role enum.
- A non-default `output_policy` changes the durable handler configuration
  digest; cold recovery with a changed declaration is rejected. The historical
  default digest remains compatible with pre-policy records.

### BC-TOOL-005 — durable projection receipt to model response

Producer: the canonical Unchain semantic event projector. Consumers: the
durable tool result/completion receipts, ContextRuntime, and the tool harness.
For an active output manager, the `tool_result` journal event carries one
closed `model_projection` object with exactly `{result, metadata}`. The result
and completion receipts retain that exact immutable projection. ContextRuntime
returns only its `result`; it must not reread the raw tool artifact or run a
second projection. Missing or malformed active projection data is fail-closed;
legacy output management continues to use the existing visible result.

### SEQ-TOOL-003 — persist once, reuse across the current turn and recovery

1. The semantic projector artifactizes the raw result and appends the model
   projection in the durable `tool_result` event.
2. The live executor returns a receipt copied from that persisted projection.
3. A repeated call or cold executor recovery rebuilds its receipt from the
   same journal event.
4. ContextRuntime and the harness use the receipt projection for the current
   model response, so neither path re-reads or re-compresses the raw result.

For a terminal large result, recovery validates the persisted artifact envelope
(ref, preview, byte count, and hash) against its journal-visible result and
does not load the full result object. Inline results retain full-content
verification. Completion artifacts remain separately verified because they
carry the state-transition binding.

This sequence is covered by AC-TOOL-006 (live/recovery receipt equality) and
AC-TOOL-007 (active runtime does not read the result artifact).

### BC-TOOL-006 — PuPu admission to Unchain attempt snapshot

Producer: the PuPu Memory V2 host admission configuration. Consumer: the
Unchain active `ContextRuntime` binding an attempt to its sealed execution
Toolkit. This is a CLOSED boundary: PuPu sends only `memory_v2_context` and
removes the legacy `tool_result_budget`; it must not send
`tool_output_management` or `tool_output_policy_map`. Unchain creates the
versioned manager snapshot exactly once immediately before the first tool
invocation, validates it before execution, and owns all policy selection. A
host-provided snapshot is not a
supported production input. Shadow and legacy retain their legacy budget
configuration. Identity is the attempt ID plus the toolkit-visible tool set.

### SEQ-TOOL-004 — active admission through snapshot binding

1. PuPu admits an active V2 run and emits only context identity metadata.
2. The Unchain runtime binds the attempt without freezing its bootstrap
   toolkit.
3. Just before the first invocation it derives the immutable snapshot from
   that run's sealed execution Toolkit; later policy-map changes fail closed.
4. The executor and durable projector consume that same snapshot.
5. Before the first tool execution, Unchain atomically writes one
   `unchain.context_tool_output_snapshot.v1` journal receipt for the attempt.
   Retry/resume/cold restart recover that receipt and reject any Toolkit-derived
   policy-map drift before tool execution. The stable handler configuration
   digest includes every non-default output policy; Unchain never restores a
   PuPu-created default policy map.

AC-TOOL-008 proves the real PuPu producer omits both host policy fields;
AC-TOOL-009 proves Unchain derives the actual Toolkit declaration. The release
matrix exercises normal, graph, cold-resume, and subagent entrypoints with a
real tool invocation and verifies that the second provider turn contains the
artifact-only projection rather than raw output. The shared Toolkit/projection
test remains module-level provider-encoding evidence; the exact-wheel release
gate remains required before rollout.
