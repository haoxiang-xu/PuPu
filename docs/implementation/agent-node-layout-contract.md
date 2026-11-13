# Agent node layout — cross-boundary contract

Status: **INCOMPLETE**. Code and tests pass in both repositories (cloud
clones, see Evidence). The real sidecar has not been restarted onto the new
runtime and the live-app cells are `NOT_RUN`, so this cannot be rolled out yet.

Gate: `.claude/rules/cross-boundary-contract-gate.md`.
Precedent: `agent-presentation-contract.md` (`document.presentation`, 1.9).

## Why

Moving a node on a native Agent canvas used to write only to this machine's
`localStorage` (`SERVICEs/skeleton_layout`). The draft never became dirty,
Save never appeared, and the drawing did not travel with the Agent through
export, import, another machine or cleared storage. The project owner chose
option B: positions are part of the saved Agent, and a move is an edit.

## Shape

`layout` is an optional top-level key of the version-one Skeleton document,
next to `presentation`:

```
layout: absent
      | { "nodes": { <node id>: { "x": number, "y": number } } }
```

- **CLOSED at every level.** `layout` admits only `nodes`, and each point
  only `x` and `y`. Any other key → `unknown_field`. The root envelope is not
  reopened (`viewport` at the root is still `unknown_field`).
- `nodes` is required inside `layout` (`missing_field`); `{"nodes": {}}` is
  admitted.
- A coordinate is a JSON number (not a boolean), finite, within ±1,000,000.
  A wrong type → `invalid_type` and out of range → `invalid_value`, both at
  `document.layout.nodes.<id>.<axis>`.
- **Every key must name a node of the same document**, otherwise
  `missing_value` at `document.layout.nodes.<id>`. The PuPu writer prunes on
  every command that removes nodes, so a stale entry is never sent.
- **Display-only.** `prepare_workflow` / `prepare_agent_graph` drop `layout`
  from the root and, after each embedded child has been validated, from every
  embedded subagent document (`without_display_layout`). A move therefore
  never changes a plan, a definition digest, a run observation or anything a
  model sees, inside an embedded child included.
- The viewport (pan/zoom) is **not** part of the contract. It stays
  per-machine in `skeleton_layout`.

## Runtime identity and version binding

- Manifest: `skeleton_execution` **1.9 → 1.10**, new feature
  **`document_layout_v1`**. This is stacked on the uncommitted presentation
  change (1.9) from `unchain-dev`. If presentation lands under another
  minor, renumber both together.
- PuPu reads the actual imported runtime's manifest through
  `getManagedCodeCapabilities()`, the same read Rename uses (one call), and
  writes layout only when it sees `skeleton_execution` major 1, minor ≥ 10
  and `document_layout_v1` (`node_layout_capability`). No Git ref, path or
  environment variable participates.
- **Old runtime:** the canvas falls back to the previous behaviour. Positions
  stay in `localStorage`, nothing becomes dirty and no `layout` is sent. A
  document that already carries `layout` is refused by an old runtime with
  `unknown_field` at `document.layout` (measured, see Evidence).

## BC-NL-001 — document.layout: PuPu editor ↔ unchain schema (via the sidecar store)

| | |
|---|---|
| Producer | PuPu `skeleton_graph_commands.apply_graph_command({type:"move_nodes"})` → `with_layout_positions` (whole pixels, nodes in graph only) |
| Transport | renderer → IPC → main → sidecar `SkeletonResourceStore.save_draft` → `unchain.skeleton.validate_skeleton_document` |
| Consumer | unchain schema (strict, closed); sidecar SQLite persistence; PuPu `document_problems` (local mirror) |
| Admission | `CLOSED` |
| Projection | Stored byte for byte. Dropped from every prepared plan, root and embedded |
| Failure | Store refuses the whole save (400, nothing stored). The editor shows the same code and path before sending |
| Version | `skeleton_execution >= 1.10` + `document_layout_v1`, read from the actual imported runtime |
| AC | AC-NL-01…05 |

## BC-NL-002 — canvas drop → document command

| | |
|---|---|
| Producer | `FlowEditor` drag end → `on_nodes_change(all nodes)` |
| Consumer | `skeleton_canvas.handleNodesChange` → `perform({type:"move_nodes", positions})` → page `graphCommand` → `editCurrent` (root or embedded via `with_embedded_document`) |
| Admission | `CLOSED`: `{type, positions}` and finite in-range coordinates only; anything else is refused and leaves the graph unchanged |
| Read | Document `layout` > position when this graph opened > live position (a node added since) > auto layout |
| Fallback | No capability, read-only, or check failed → localStorage only, no command |
| AC | AC-NL-06…09 |

## SEQ-NL-001 — move, save, reopen

Identity key: resource id plus the drill steps for an embedded graph.

1. Open a clean draft: `dirty=false`, positions come from `layout`, else
   localStorage, else auto layout.
2. Drop a node: one `move_nodes` edit carrying every drawn node, `dirty=true`,
   Save appears, one undo step.
3. Save: the document sent at the loaded token carries `layout`, then
   `dirty=false`.
4. Second move in the same sitting, then undo: the node returns to its
   previous place.
5. Reopen (new hook, cold store instance): the same `layout` is read back.
6. A drop onto the same place: no edit, a clean draft stays clean.

## Acceptance

| AC | Claim | Evidence | State |
|---|---|---|---|
| AC-NL-01 | unchain admits/refuses exactly the shape above, at exact code+path | `unchain tests/test_skeleton_layout.py` (37) | PASS |
| AC-NL-02 | layout never reaches a plan or digest, root or embedded child | same file, agent/workflow/embedded digest tests | PASS |
| AC-NL-03 | PuPu local validation matches the real validator in both directions | `skeleton_document_layout.test.js` vs `skeleton_document_layout_capture.json` (recorded from the 1.10 validator, 29 cases) | PASS |
| AC-NL-04 | real store: stored exactly, survives a cold store reopen, refusal stores nothing, digest unchanged | `unchain_runtime/server/tests/test_skeleton_resource_layout.py` (8) | PASS |
| AC-NL-05 | old runtime refuses `layout` (red before green) | same sidecar test against the base (1.9) snapshot: 7 of 8 fail with `unknown field` | PASS |
| AC-NL-06 | drop → exactly one `move_nodes` carrying every node; result passes local validation | `skeleton_canvas.layout.test.js` | PASS |
| AC-NL-07 | without the capability (1.9, or a failed check) no command is sent and the document keeps no layout | same | PASS |
| AC-NL-08 | document layout is drawn on a fresh open; undo moves the node back | same | PASS |
| AC-NL-09 | delete prunes layout; malformed moves are refused unchanged | `skeleton_document_layout.test.js` | PASS |
| AC-NL-10 | SEQ-NL-001 steps 1–6 at session level | `use_skeleton_resource_layout.test.js` | PASS |
| AC-NL-11 | live app: drag → Save appears → save → restart app → same place | — | NOT_RUN |
| AC-NL-12 | sidecar cold restart onto the 1.10 runtime, then reopen | — | NOT_RUN |
| AC-NL-13 | embedded subagent graph: move inside, Save writes the parent | covered by the command path (`with_embedded_document`); no dedicated test | NOT_RUN |

State matrix (gate baseline): normal message, interaction, retry/resume cells
are `N/A`. Layout is dropped before preparation, so no run path can observe it
(AC-NL-02). The cell for a changed runtime manifest is AC-NL-05/07.

## Known gaps / follow-ups

- `presentation` inside an **embedded** child still reaches the parent's
  snapshot and digest (only the root is popped). `layout` does not have this
  gap. Fixing `presentation` belongs to that change.
- A legacy recipe's x/y is not carried into `layout` on conversion. A
  converted Agent opens with auto layout until its first move.
- Existing localStorage drawings are not migrated eagerly. The first drop
  writes the whole current drawing, including the positions it came from.
