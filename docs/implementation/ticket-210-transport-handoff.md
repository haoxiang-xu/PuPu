# #210 CP2: observation transport only

Historical implementation handoff. Delivery now uses the separate
`pupu-210-close` clone and the current delivery section in `ticket-210.md`;
this CP2 brief is not an instruction to modify the frozen development clone.

Implement in `/Users/red/Desktop/GITRepo/pupu-210`, current branch
`codex/ticket-210-run-state`. Read `ticket-210.md`, AGENTS.md, CLAUDE.md and
the cross-boundary rule. No commits, pushes, installs, Core/Host edits, UI edits,
other clones, frozen evidence changes or heavy work without Root's test window.
Root owns the canvas, polling/fencing hook and the direct plan. Do not edit them.

## Settled producer

Host CP1 is accepted: 46 tests, source-verified selected wheel c1213803 / manifest
c172bc02. Real captures and independent expected scopes are in
`/Users/red/.codex/artifacts/ticket-210-start-20261107/producer-packet-01/`.
Its manifest labels authenticated Flask captures versus semantic Core fixtures.
Copy fixtures to a ticket-owned source test-fixture location; retain provenance
and exact hashes. Never write to the packet or derive expected identities from
the response under test. Do not modify the Host contract to fit JavaScript.

## Allowed implementation

- New isolated Electron contract validator/module, preferably
  `electron/main/services/unchain/skeleton_run_observation.js`.
- Existing `buildSkeletonResourceRequest` / `runMisoSkeletonResourceCommand`
  only to add the action `run_observation` and validate its reply.
- `createMisoBridge`: new `getSkeletonRunObservation(request)` method.
- New renderer module `src/SERVICEs/skeleton_run_observation_api.js`, independently
  validating the same closed producer contract.
- `api.unchain.js`: import/spread that facade; preserve existing signatures.
- Focused tests/fixtures. Keep Electron .js/.cjs test variants in sync.

Use GitNexus context/upstream impact before every existing symbol edit, with
fresh private index. Root will finish the index refresh before dispatch.
`buildSkeletonResourceRequest` initially returned HIGH; refreshed pre-edit impact
reports CRITICAL for it, the Main command, preload bridge and API File (shared
IPC callers). Keep the new action isolated. UNKNOWN is unresolved;
confirm callers by text. No graph queries while the index is being written.

## Request/response contract (BC-210-002)

Public API: `api.unchain.getSkeletonRunObservation(request)`; bridge method same.
Request CLOSED keys: owner_chat_id, execution_id, resource_id, optional root_run_id.
Each value matches `[A-Za-z0-9][A-Za-z0-9._:-]{0,199}`. Do not trim/coerce. Optional
root absent is valid; explicit null/undefined/wrong types are not. Main GETs
`/skeleton_runs/observation` with encoded exact fields. No v1/pending fallback.
Typed error code/path/message/status preserve the existing resource transport.
Main and renderer both validate success before exposing it; old/missing bridge
is explicitly unavailable. Return facade `{ok:true,data:{schema,run}}` or the
existing typed refusal/unavailable shape (not a new third convention).

Envelope CLOSED: `{schema:"pupu.skeleton-run-observation.v1", run}`. null run valid.
Run CLOSED keys:
owner_chat_id, execution_id, generation_id, root_run_id, resource_id,
definition_digest, runtime_manifest_digest, launch_manifest_digest,
high_watermark, graphs.
Graph CLOSED keys:
graph_id, attempt_id, parent_graph_id, caller_node_id, call_stack,
definition_digest, document, revision, event_id, store_seq, status, paused,
root_committed, owner_liveness, nodes, skipped_edges, error.
Node CLOSED keys:
node_id, state, phase, node_invocation_id, node_attempt_id, interaction_id, reason.
Graph error: null or CLOSED `{code,path}`. Inspect real path types in captures.
Call-stack current/final frame CLOSED 5 keys: execution_id, graph_invocation_id,
attempt_id, definition_id, definition_digest. Each non-final ancestor frame also
has caller_node_invocation_id. A one-frame root stack therefore has five keys.
Raw definition digests are 64 hex; manifest digests are `sha256:` + 64 hex.

Graph statuses: ready, running, waiting, result_received, completed, failed,
cancelled, outcome_unknown. Node states: pending, running, waiting,
waiting_approval, suspended, succeeded, failed, cancelled, outcome_unknown.
Phases: pending, completed, running, result_received, failed, cancelled,
outcome_unknown, paused, waiting_for_child, awaiting_approval, receipt_recorded,
awaiting_input, receipt_recorded_upstream. owner_liveness exactly unknown.

Diagram uses existing closed common envelope only: schema_version/kind/id/name/
nodes/edges and optional description; node id/type/config and optional label;
six common edge keys as in capture. Config is opaque JSON: do not mirror Core
node configuration schemas. Existing twelve node types. Node IDs/labels are
not API identifiers and can contain Unicode; no coercion, prototype lookups,
JS trim or opaque ID parsing. Reject non-JSON / non-finite numbers, oversized
ASCII-JSON (>8MiB), >64 graphs and unsafe counters. No Python canonical hashing.
The independent JS size budget is deliberately conservative, including a worst
case number allowance: numeric-dense or near-limit valid Host views may also be
unavailable. Do not claim exact Python JSON-byte parity. Main bounds raw HTTP
bytes before parsing, independent of the post-parse contract budget.

Validate exact request scope, optional root, unique graph/attempt identities,
unique node IDs and exact non-Pool projected-node set, graph document/digest
and call-stack final frame identity, parent/caller ancestry references in this
run and execution. Root graph is first, has no parent/caller, matches root run,
resource and root digest. Child graphs may legitimately repeat one definition.
Some failed pre-dispatch nodes have null invocation/attempt IDs: don't reject.
Do not invent liveness or infer terminal statuses from a different receipt.

## Checkpoint tests and handoff

Real captures positive at Main, preload and renderer; run:null; all node phases;
wrong version/unknown keys/mismatched requested scope/duplicate identities/
contradictory ancestry/non-JSON; no bridge/old Host; exact query encoding and
typed refusal preservation. Existing resource actions retain positive controls.
State sequencing and UI tests belong to Root, not this slice.

First deliver source changes and explicit test paths. Root coordinates serial
test execution with private dependencies/caches and a denied-network launcher.
Do not run builds, index, all tests, app or provider calls yourself. Report the
implemented files, impact evidence, captures used, NOT_RUN and known limits.
Stop at CP2 for strong review before any further work.
