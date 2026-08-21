# Tool Output Module — Stage 1 完成说明

Status: implementation complete, rollout remains gated.

Stage 1 moves model-visible Tool Output policy into Unchain.  It does not move
artifact storage ownership out of the Context V2 journal and does not enable a
rollout by itself.

## Delivered

- `unchain.tools.output_management` owns the closed policy snapshot,
  projection receipt, page-source guard, and the one attempt-scoped manager.
- `ContextExecutionBundle` binds one `ToolOutputManager`; the runtime puts that
  exact instance on the tool event.  A foreign replacement is rejected.
- Active V2 selects the manager and skips `ToolResultBudgetController` in the
  after-tool-batch path.  Legacy and shadow flows still use the legacy budget.
- Stage 1 initially allowed PuPu to normalize a toolkit declaration into a
  versioned runtime snapshot. Stage 2 moves that declaration ownership into
  Unchain `Tool` / `Toolkit`; PuPu no longer parses or writes tool policies.
- Active admission now requires `context_memory.tool_output_management_v1` in
  the imported Unchain runtime manifest.

## Boundary contracts

### BC-TOOL-001 — raw artifact to projection receipt

Producer: PuPu Context V2 artifact sink. Consumer: Unchain
`ToolOutputManager`. Owners: PuPu durable host / Unchain tools module.

The host supplies sanitized bytes, SHA-256, byte count, opaque `full_output_ref`
and a declared policy name. Unchain returns a closed `payload + metadata`
receipt. Mismatched bytes/digest/count, unsupported policy name, unsupported
policy version, and invalid source receipt fail closed. Raw bytes never become
receipt metadata.

### BC-TOOL-002 — manager snapshot to execution path

Producer: PuPu runtime config / ContextExecutionBundle. Consumer:
`ToolExecutionHarness`. Owners: PuPu context host / Unchain runtime.

The exact config shape is `unchain.tool_output_management.v1`. The manager is
attempt scoped; active snapshots disable legacy batch budgeting. Unknown fields,
unknown mode, duplicate policy names, invalid default policy, and invalid schema
are rejected. Host admission requires the matching protocol-manifest feature.

### BC-TOOL-003 — projection source to paged read

Producer: projection receipt. Consumer: artifact reader. Owners: Unchain tools
module / Context V2 artifact service.

The reader always receives the original `full_output_ref`; a continuation may
advance offset/limit only. Changing source ref is rejected and cannot create an
A→B→C derived-output chain.

## State sequences and AC mapping

| Sequence | Required behavior | Acceptance |
| --- | --- | --- |
| SEQ-TOOL-001 first/repeat tool result | one active manager; same call ID is idempotent, divergent replay fails | AC-TOOL-001, AC-TOOL-002 |
| SEQ-TOOL-002 retry/resume/restart | durable source ref stays canonical; no old budget is applied in active V2 | AC-TOOL-002, AC-TOOL-005 |
| SEQ-TOOL-003 invalid policy/config | bad version/policy/schema is rejected at its boundary | AC-TOOL-003 |
| SEQ-TOOL-004 paged source read | continuation retains original artifact ref only | AC-TOOL-004 |

## Verification performed

- Unchain Tool Output, kernel budget, and Context V2 factory tests.
- PuPu Context V2 and capability-admission tests using the changed Unchain
  source pair.

Before active rollout, acceptance must build one immutable Unchain wheel, run
the PuPu sidecar against that exact wheel, and record the wheel SHA-256 and
runtime-manifest digest. This is deliberately not treated as a source-checkout
substitute.
