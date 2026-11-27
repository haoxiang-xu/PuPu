# #357 exact Hook tool sets — producer and authoring transport

Continuation of accepted Hook enable producer Core 4901f921 / PuPu 0a02169b and frozen enable/order UI d8f8e60d. Independent workspaces unchain-357-hook-tool-set and pupu-357-hook-tool-set; no commits, remote writes, desktop or real provider calls. Existing frozen inputs and guards are read-only. This delivers the existing explicit-tool-set requirement, not fail-open, names, embedded graphs or a new tool-id registry.

## Formal implementation decision

Extend only `tool_name`: null = all tools; nonblank exact string = legacy single identity; nonempty list of unique nonblank exact strings = set. Preserve array order and every string byte in storage; matching is exact, no glob/regex/case-fold/trim. Reject empty sets, duplicates and malformed members at exact paths. Tool identities are the exported invocation names: host `_flatten` requires registration key == Tool.name and rejects distinct duplicate names. Catalog titles and toolkit labels are not identities. No membership expansion into multiple Hook entries.

Core adds feature `hook_tool_set_v1`, skeleton_execution 1.3 and detached CLOSED `hook_tool_set_contract()`:

    {schema:"unchain.skeleton_hook_tool_set.v1", field:"tool_name",
     legacy_types:["null","string"], set_type:"array", minimum_size:1,
     duplicates:"reject", names:"nonblank_exact", normalization:"none"}

The current `hook_entry_contract()` and enable response keep their field/value shape. An authenticated GET `/skeleton_hooks/capabilities?contract=tool_set_v1` returns CLOSED:

    {schema:"pupu.skeleton_hook_tool_set_capabilities.v1",
     runtime_manifest_digest:<actual imported manifest digest>, tool_matcher:<above>}

No query still returns the existing enable envelope. Exactly one selector is permitted; duplicate/unknown query keys or selector values are rejected. No credentials, paths, definitions or author payload accepted. Main action `hook_tool_set_capabilities` takes only an empty record, constructs the fixed GET, preload exposes `getSkeletonHookToolSetCapabilities()`, renderer exposes the same method with an independent exact shape validator. No old-host fallback. The digest records provenance; compatibility uses actual imported manifest and feature, never Git SHA/path.

Definitions containing a list require this feature/getter before preflight, including disabled list entries. Legacy null/string definitions keep legacy admission; enabled rules stay unchanged. Both dispatch phases use the same pure exact matcher on admitted bindings. No change to approvals, tool execution authority, Workflow pins, tool args/results, fail-closed policy, ordering or disabled-dependency behavior.

## BC / SEQ / AC

BC-HM-001 (VERSIONED/CLOSED): author document → validator → prepared/frozen bindings. Preserve old bytes and definition digests; enforce new list/member rules; one matching call runs the authored Hook once.

BC-HM-002 (VERSIONED/CLOSED): actual imported Core manifest/getter → independent host validator → authenticated HTTP → Main/preload → independent renderer validator. Exact keys and constants; missing feature/getter, unknown schema/field, malformed values and old host fail closed. Existing enable endpoint/API stays compatible.

BC-HM-003 (CLOSED): admitted bindings → before/after Context V2 dispatch. Match selected exact names, skip others, do not treat patterns or titles as identities; native permission/approval still applies.

SEQ-HM-001: save/reopen/select a set → park on real tool approval → change later library matcher → resume the pinned old run → new run selects new set. Resume/repeat cannot rerun a committed before Hook. Disabled and legacy controls remain. Host frozen-selection retention and runtime wait/resume are separately exercised; no unsupported claim of a packaged upgrade.

AC-HM-001: source RED → green config/dispatch/host/transport tests; malformed cases fail at the intended boundary.
AC-HM-002: one offline-built wheel + one source-pinned sidecar; exact installed tests and authenticated loopback capability/save/reopen/preflight, including cold reopen and old-wheel refusal. Reuse that wheel throughout; no source checkout substituting for installed evidence.
AC-HM-003: later UI handoff from real producer capture and exact pair. Real catalog identities, set editing, unavailable stored ids preserved, dirty/explicit Save/cold reopen. NOT_RUN in this producer slice.

Applicable run cells: before/after matching and no-match; first wait, repeat wait, resume, second new run; disabled; frozen-selection edit; old feature missing. Full Chat first/second message, second interaction, full sidecar cold Chat resume, desktop and real provider remain NOT_RUN for this slice; they are not declared impossible. Active overall rollout remains INCOMPLETE.

## Implementation/risk

Use serial bounded tasks on the 18 GiB machine. Cached CLI only, offline, no bootstrap/index rebuild. Preimage graph: Core validator LOW; dispatcher classes MEDIUM (31 affected each); individual call-method UIDs/new capability functions unavailable, UNKNOWN with source-confirmed callers. Host validation/RPC/preload LOW; exact API factory MEDIUM; new route/capability read absent from older index, UNKNOWN. New product symbols have no old index entry. Keep those limitations explicit. No process/security guard changes. A new sidecar must be used/restarted after Python edits; do not restart the user's development App.
