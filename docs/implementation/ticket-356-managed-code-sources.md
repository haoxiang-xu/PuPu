# G1 — host-managed Code source files

Status: researched design proposal; **not implemented or qualified**. This is a separate implementation plan for the host work requested by the project owner. It does not change #357 scope, release membership, or a frozen candidate. Claude repairs R-357-01…04 only, then stops before Workflow Call.

## What & why

Let an author write Code inside Builder, save/reopen the exact source with the Agent, execute those saved bytes, and carry them to another installation. Keep the installed runtime's `source: {kind: "file", path}` contract. Do not put Python text into an invented core config key, overwrite the author's workspace, or infer a file grant from a string path.

Recommended design: **an atomic resource aggregate containing a core graph plus a host-owned source manifest and immutable content**. The graph remains a valid ordinary Skeleton document. The host supplies source snapshots through the runtime's existing callable resolver. An export materializes the same bytes as relative files.

This solves source ownership and portability; it is not a claim that Python Agent-code export, automatic dependency installation, Code sandboxing, or full #357 acceptance already exists.

## Read this first — measured facts

Research uses `/Users/red/Desktop/GITRepo/pupu-357-code-review`, product files at tree `afe66fd5d4700e1d55212820f7173cf600ea2f67`; product code is unmodified there. Test-only review additions are not implementation. `research-inputs.json` records selected source hashes and compares them to the immutable tree. Mutable sibling `unchain` is not a runtime authority.

Fixed installed pair, unchanged:

- Wheel SHA-256: `a166988a461f701be57c836264d4ddd546b99fcbede093ea204472d88d61b7ec`.
- Sidecar SHA-256: `df308db30367d5576b96e26cc9c51adce3f50f1702374f6d7d187ed36dc23382` (carried from the fixed-pair receipt; this design does not run it).
- Actual-runtime manifest from the prior qualification: `sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101` (not freshly imported by this design task).
- Pair root: `/Users/red/.codex/artifacts/pupu-356/356-tool-lifecycle-20261023/pair`.

| Existing source | Finding relevant to G1 |
| --- | --- |
| Installed `unchain/skeleton/code_runtime.py:106–143` | `CodeSourceSnapshot` has relative path, bytes and SHA-256. `FileCodeSourceResolver` reads a regular file under one fixed root; maximum source is 4 MiB. |
| Same file `:225–301` | Resolver is an injected callable. It must return the **exact** `CodeSourceSnapshot` type and a correct digest. `prepare_execution_bindings` writes source bytes into durable execution artifacts before its first receipt. |
| Same file `:262–270` | `for_plan` reuses the same resolver for Workflow Call child plans. Resolver lookup receives a path, not a node/owner identity; collisions across a closure need explicit handling. |
| Same file `:438–464` | Resume reads source from the bound durable artifact and checks the digest. The Python profile is re-resolved and fingerprint checked; executable changes must still refuse. |
| Same file `:161–214` | Entrypoint is `main(input, context)`; a separate Python worker runs author code. It is not an OS security sandbox. |
| `skeleton_production_bindings.py:358–422` | Host currently requires a workspace for any reachable Code node and installs `FileCodeSourceResolver(workspace_root)`. It also discovers published Workflow/Hook dependencies. |
| `skeleton_resource_store.py:550–621` | Save/import currently persist only graph JSON and graph digest. Save uses one SQLite `BEGIN IMMEDIATE` CAS. |
| Same file `:904–961`, `:1283–1288` | Publish identity currently derives from graph definition; duplicate copies only the graph. Neither carries source files. |
| `route_skeleton_resources.py:135–163` | Save/import request shapes are closed; adding source fields silently would break the contract. |
| `skeleton_chat_selection.py:30–44`, `:122–152` | Preflight and child selection records have closed field sets. Source manifests cannot simply be appended. |
| `skeleton_production_state.py:34–39`, `:134–189`, `:220–244` | Launch descriptor is closed and authenticated through Journal artifacts; it has no source-manifest field today. |
| `skeleton_workflow_snapshot.py:1–6` | Published-definition snapshot explicitly does not snapshot the environment/source. Do not mistake it for G1. |
| `skeleton_credential_requirements.py:26–30`, `:192–211` | Existing start fence binds selection/workflow digests. Managed-source identity must be included in an explicitly versioned fence, not inferred at dispatch. |

No new runtime, HTTP, filesystem-authority, or export behavior was exercised in this design task. Existing independent Code review proves five local executions, but not this proposed source workflow.

## Decision and alternatives

| Choice | Consequence | Decision |
| --- | --- | --- |
| Inline text in `config.code` | Changes closed core schema and runtime protocol, requires a new wheel; no reason to bypass the existing source-snapshot seam. | Do not use. |
| Edit arbitrary workspace paths through a new route | Requires workspace grants, makes saved graphs depend on mutable external files, risks previewing one file and later running another. | Keep existing external-path mode, but do not use it for Builder-owned text editing. |
| Separate mutable source record with its own independent Save | Graph and source can land at different versions; duplicate/publish/resume can drift. | Do not use as the authoring contract. |
| Host-owned immutable bytes plus a graph/source aggregate | Retains core file config, makes CAS, snapshots and export explicit. | Recommended. |

Only two source authorities exist: a host-managed source recorded by an owning resource manifest, or an external file under the run's explicitly authorized workspace. Neither is an implicit fallback for the other.

## Canonical representation and ownership

Proposed host schema names below are design names, not deployed endpoints or captured runtime output. Freeze their exact spellings with the first real producer before UI work.

1. Managed source text is valid Unicode serialized as strict UTF-8. Reject lone surrogates; do not trim, normalize Unicode, convert line endings or silently add a newline. SHA-256 is over the exact UTF-8 bytes. An empty file is saveable but will fail when executed unless it supplies the required callable.
2. Keep the runtime maximum of 4 MiB per source. Proposed host bounds: at most 256 managed bindings and 16 MiB of unique source bytes per resource aggregate. These last two are **new host policy**, not claims about core limits; advertise them in the host capability response and test exact edges. Existing graph limits still apply independently.
3. Host-generated runtime path: `__pupu_code__/sha256/<64-lowercase-hex>.py`. The path contains no user identity, absolute path or display name. The same bytes may share one blob and relative path. Display names remain presentation metadata outside core Code config.
4. Host persists verified source bytes as SQLite BLOBs keyed by SHA-256. Source bindings and graph are updated in the same SQLite transaction; no graph commit can refer to a half-written filesystem blob. Failed CAS leaves no new resource version or bindings. Old blobs can remain until safe collection.
5. A binding records a **typed document address** (JSON path array, with integer indexes) and its digest. It points to a Code node in that exact aggregate version. Indices are valid only within that submitted version, not durable row identity. UI must move the binding with its row during its own list operations and discard/reload it on external replacement. Duplicate node/embedded graph ids cannot cause first/last-match writes.
6. Embedded graphs belong to their containing resource; referenced Agents belong to their own resource. A parent save cannot upload replacement source for a referenced Agent. Published Workflow/Hook sources belong to the exact published version, not the current draft.
7. Manifest membership is authoritative. A prefix or a matching blob elsewhere in the store is not an authorization grant. Reads require the owning resource plus its expected version and a binding present in that version.

The canonical stored manifest is closed:

```json
{
  "schema": "pupu.skeleton-code-sources.v1",
  "entries": [
    {"node_path": ["nodes", 2], "sha256": "<64 lowercase hex>"}
  ]
}
```

`node_path` is relative to the resource's root document; embedded paths include the complete `config.subagents[index].source.document` traversal. Entries are unique by typed path and sorted by a specified typed-path comparator; never sort an unescaped concatenation of path components. The referenced node's stored file path must equal the derived digest path. Malformed/unknown config in other nodes stays untouched and diagnosable. An invalid target or duplicate binding is a request error, not permission to pick a node.

Keep `definition_digest` with its existing meaning: the core graph digest. Add a separate canonical `content_digest = SHA256({document, sources_manifest})` for host resource identity. Managed source edits also change their graph path, so they change both digests. Edit tokens still advance for every accepted aggregate write. Reverting text must not revive an old token.

## BC-357-010 — editor → preload/Main → host aggregate store

**Producer:** Code editor plus the current Builder session. **Consumer:** new versioned aggregate operation in the host. **Admission:** VERSIONED outer message, CLOSED fields for the admitted version.

Proposed save body:

```json
{
  "schema": "pupu.skeleton-edit.v2",
  "document": "<ordinary Skeleton JSON object>",
  "expected_edit_token": "<current token, or null for create>",
  "managed_sources": [
    {"node_path": ["nodes", 2], "text": "def main(input, context):\n    return {}\n"}
  ]
}
```

This is a **complete managed set for this resource**, including unchanged managed sources. Omission is an explicit conversion/removal only when the corresponding node/source was deliberately changed by the author. Do not interpret an old client's missing field as an empty set. A response is closed and versioned with `{schema, resource, sources_manifest, managed_sources, content_digest}`; `resource` is the existing summary + returned document/diagnostics, with its exact field set specified by kind. Main/preload pass only admitted data; never expose a generic filesystem read/write primitive.

Host projection: validate all target addresses, encode/hash source text, set **only each addressed Code `source`** to `{kind:"file",path:<derived>}`, validate the resulting graph's draft envelope, persist graph/manifest/blobs atomically on the expected token, and return the actual stored graph. Every other graph value is byte-equivalent under existing canonical JSON. The request is explicit that these Code source fields are host-generated; the server does not silently fill profiles, limits, schemas, prompts or defaults.

Use a versioned read/save operation (suggested route family `/skeleton_resources/v2/...`, final method/path set to be frozen in the producer). Do not widen the old closed save body. Existing v1-only resources keep their old behavior. A v1 raw-graph write targeting a managed resource must refuse with a typed upgrade-required error; it cannot discard the manifest. Rename/archive/duplicate/legacy-conversion paths must become aggregate-aware or refuse explicitly before writing. No mutation may bypass this rule through a convenience method.

Editor state includes `{document, managed source buffers}` in one dirty/version/session model. A source keystroke marks the aggregate dirty. Save response application uses the same sitting and unchanged-input tests as graph Save; an old response must not replace later code, bindings or graph edits. External replacement swaps graph and sources together. No separate auto-save, no invisible path-only success.

Errors proposed for this new host contract: shape/version/target/encoding/size errors at the exact submitted field; `edit_conflict` with no aggregate mutation; unavailable/corrupt source with a typed error. Freeze codes against real producer captures rather than writing a JS guess first. AC-357-010, 011, 012, 013.

## BC-357-011 — resource aggregate → admitted closure → execution

**Producer:** real store read snapshot of root, referenced/embedded Agents and pinned Workflows/Hooks. **Consumer:** host source resolver and exact `SkeletonCodeRuntime`. **Admission:** VERSIONED host snapshot, CLOSED records; core Code config remains unchanged.

1. Take source manifests together with their graph versions from a consistent store snapshot. Validate digest-to-content and path-to-binding equality for every reachable managed Code node, not only the root. Retain the complete reachable managed set before the first model/tool/Code side effect.
2. Build the resolver from admitted bytes. Its managed branch returns the exact installed `CodeSourceSnapshot(relative_path, content, digest)`. This is a real adapter to the existing callable seam, not a fake Code handler or a subclass bypassing durable admission. Keep exact `SkeletonCodeRuntime` and the worker.
3. Managed-only Code does **not** need a user workspace. Remove the blanket Code/workspace requirement only for plans whose Code sources are all admitted managed content. External-path Code and filesystem tools retain their existing workspace grants; do not set their workspace root to the source store or staging area.
4. `for_plan` copies the same resolver. Therefore construct one verified path map across reachable plans. Same path/same bytes may be shared after each owner's authority is checked. A managed/external or multi-owner path resolving to different bytes is an explicit source-conflict error before dispatch; never choose first/last. For mixed plans, explicitly resolve workspace entries only under the existing authorized root and validate collisions. Source absence/corruption never falls through to the workspace. Legacy v1 mode remains explicit even if a filename happens to use the managed prefix.
5. Persist all reachable managed bytes/manifest references in the execution's authenticated Journal artifacts before dispatch, including children not yet entered. Root launch v2 binds this source-set digest. Child execution still uses core's own `prepare_execution_bindings`, preserving its source-ref/profile fingerprint checks. Deleting/editing a library resource while awaiting approval cannot alter the resumed source.
6. Current launch/preflight/selection records are closed. Add explicitly versioned host DTOs/consumers and a launch-v2 validator; do not append fields to their v1 shapes. The public three-key Agent selector need not grow source text. Secret-free credential discovery and dispatch must bind the same source-set digest via versioned scope. A stale source set is rejected **before** execution registration/effects, just like a stale graph.
7. No core wheel change is expected for this resolver approach, but this remains unproven until exact-class execution on the installed pair. Host capability/version support must be explicit and checked; Git revisions are provenance only, never capability admission. If implementation reveals a missing runtime contract, stop and document it rather than pretending old manifest support.

AC-357-014, 015, 016, 017.

## BC-357-012 — draft/published resources → portable source bundle

**Producer:** one fixed aggregate/closure snapshot. **Consumer:** strict importer and runtime file resolver in a fresh directory. **Admission:** VERSIONED manifest, CLOSED entries; archive members are exactly the declared files.

Bundle carries core graph JSON, managed source files at the graph's digest-derived relative paths, exact source sizes/hashes, embedded/reference/published-version identity metadata, and Python profile *requirements*. Do not ship credentials, executable absolute paths, virtualenvs, execution journals or undeclared files. Resolve the complete shared dependency/source closure; a parent-only package with missing child sources is not export success.

Importer verifies all sizes/digests/relationships and resource conflicts before committing an aggregate. Reject absolute/traversal paths, symlink/hardlink/device entries, duplicate names (including case/Unicode collisions on the target platform), unlisted members, missing files, unknown versions and archive expansion beyond limits. Fail without replacing an existing resource. Dependency mapping and import collision policy must be explicit, not a first/last-wins map.

Managed sources are portable; Python environments are not assumed portable. Imported profile ids require an explicit local mapping/probe/fingerprint before run. No shell install or guessed executable. External workspace sources must be listed as unresolved external requirements or explicitly captured by an authorized import action; the bundle must not claim to be self-contained if they are missing.

Portable source packaging is the minimum G1 export obligation. A generated Python embedding wrapper, lockfile resolution and full Python Agent export remain their own product work; do not rename this archive as completed source-code export. AC-357-018, 019.

## Persistence, publish, duplicate and rollback

- Use a versioned store migration on a disposable copy first: immutable blob table plus current/published source binding tables and content digest. Old binaries must refuse the new store schema, not proceed while ignoring source ownership. Deployment must retain a pre-migration backup; downgrading a live DB by deleting schema keys is not rollback.
- Duplicate copies graph and manifest ownership atomically; blobs may be shared by digest. Later editing one copy creates new bytes/path only for that copy. Node/resource rename is not a file move.
- Publish freezes the exact source set. Existing graph-only publish dedup must become aggregate-aware. A different source set cannot reuse a prior version by graph-only equality. New source path digests naturally change managed graph definitions; nevertheless verify manifest/content as well.
- Delete/archive cannot collect bytes referenced by published versions, another resource, an admitted launch or a suspended execution. Initial implementation may retain immutable blobs without collection; no speculative garbage collector is required for G1. Disk/storage refusal must be visible.
- Interrupted save is atomic: either graph+manifest+bytes land or none do. Interrupted export produces no installable manifest until all members are validated. Missing/corrupt retained execution bytes fail explicitly; never rehydrate an old run from the current library or workspace.

## State sequences and acceptance plan

All cells below are **NOT_RUN for G1**. They are specifications, not evidence. Each implementation checkpoint must run serially, under an offline guard, with the exact deployed host/pinned wheel pair. A new host sidecar build changes the pair and requires new hashes/restart; the wheel is reused unless evidence requires a core change.

| Sequence | Identity, events and observable result | AC |
| --- | --- | --- |
| SEQ-357-010 | New resource → add Code → type valid source → explicit Save → reopen. Graph source path digest, preview text, store blob and actual worker bytes agree. Second save changes text and token; normal same bytes save does not resurrect an old token. | 010, 011 |
| SEQ-357-011 | Save in flight → more text/graph edits → reply; old reply cannot overwrite new input. Cancel/navigation/unmount/A→B→A/external replacement cannot apply old source reads or saves to another sitting. | 012 |
| SEQ-357-012 | Two readers at token T edit source/graph → first CAS succeeds → second conflicts; no partial graph/source write. “Look at theirs” replaces both; keep mine requires explicit aggregate rebase. | 013 |
| SEQ-357-013 | Root+embedded+referenced Agent+Workflow/Hook sources, including equal local node ids and legacy path collision. Verify ownership, exact source closure, no ungranted workspace access, and no first/last-wins behavior. | 014, 015 |
| SEQ-357-014 | Run source A → first interaction → library changes to B → resume → second interaction → cold sidecar restart → resume. Old execution uses A; a genuinely new attempt uses B. Repeat receipt/resume never re-executes completed Code. Environment fingerprint changes still reject. | 016 |
| SEQ-357-015 | Discover credentials/source fence → concurrent source save → dispatch old scope. Reject before registration/provider/Code effects; new discovery dispatches current source. Corrupt/missing retained blob is explicit and cannot fall back. | 017 |
| SEQ-357-016 | Duplicate/publish A → edit draft to B → reopen copy and pinned revision. Each retains its declared bytes; deleting a draft does not destroy a live/published dependency. | 018 |
| SEQ-357-017 | Export A → import into fresh data root on same machine with different paths → explicitly map profile → run without original workspace/store. Tampering, unknown version, unsafe paths, wrong owner/profile and archive conflicts reject without writes. | 019 |

Positive/negative evidence requirements:

- **AC-357-010:** real UI save payload → real aggregate producer → strict closed response consumer; preview, full viewer, Save/reopen source equality; no source written by merely opening a panel.
- **AC-357-011:** real durable worker `main(input, context)` returns an object matching Result schema; root final/End equality. Size/encoding/unknown-field/duplicate-binding controls fail at their boundary. Invalid user Python remains saveable and has truthful failure semantics (R-357-02).
- **AC-357-012:** real deferred operations for source reads and saves; later edits survive; obsolete owner/intent never writes another document. Include same tick and same id reopened cases.
- **AC-357-013:** real SQLite CAS with injected failure before/inside commit, plus cold readback and byte equality. No green test based only on a mocked save.
- **AC-357-014:** exact installed callable consumer, real child plans and mixed authority. No workspace required for managed-only Code, but Code does not expand Tool filesystem authority. Collision controls include legacy paths equal to generated paths.
- **AC-357-015:** real closure manifests across referenced Agents, embedded graphs, pinned workflows and hooks. Owner-version mismatch, omitted child source, identical ids/different owners, path remap and blob corruption fail closed.
- **AC-357-016:** persistent Journal source refs and hashes before/after approval, denial, cancel, two resumptions and cold restart. No provider API; offline SDK only. Record Call attempts and file effects, not just a completed label.
- **AC-357-017:** real requirements → Main strict consumer → source fence → sidecar; stale scope/source fails before effects; sentinel keys never in source manifest/export. Run first and second chat turns.
- **AC-357-018:** actual store duplicate/publish/delete sequences; shared digest content remains immutable and reachable. Malformed drafts remain viewable/repairable, without granting their paths.
- **AC-357-019:** real exporter → independently strict importer/installed file resolver in a new root; hash/size/content agreement, unknown/duplicate/extra/missing/unsafe members and local-profile failure controls.

Normal, subagent and Workflow/Hook paths all apply. Provider selection semantics are not changed, but the new host build must repeat the existing official-provider/offline binding controls. Memory curation, real APIs, signed installers, Windows/Linux and full Builder/CP17 are **not covered** by these source-plan cells; existing release obligations remain INCOMPLETE until separately run.

## Implementation order and UI handoff

1. Independently repair/freeze Code R-357-01…04. G1 must not obscure those failures or rewrite their evidence. Do not start Workflow Call merely because this design exists.
2. New isolated host workspace: add aggregate storage and strict versioned interfaces; run store/CAS/encoding/ownership controls, capture actual responses. No frontend writes before this producer contract is real. Take fresh symbol impacts on the actual implementation index before every edit.
3. Add admitted closure/source resolver and launch/scope versioning. Qualify exact Code runtime and child/resume/cold paths on one fixed pair, without UI or provider calls. Do not run a second heavy task while Claude's tests/index are active.
4. Give Claude the host checkpoint, API shapes, complete source capture, errors, artifact hashes and capability receipt. UI handoff includes actual source reading, local dirty buffers, full text editor/preview/Viewer and per-type View code menu if still in scope. `code_source_text(node)` alone cannot synchronously fetch host bytes: pass a version-scoped read state to the canvas, never hide network side effects in this pure reader.
5. Implement and independently qualify portable source import/export; do not call graph-only download self-contained export. Then desktop offline author→save→cold reopen→run. Manual/real-provider acceptance stays later.

## Graph evidence and risk

Read-only graph-first research ran against the existing `pupu-357` index; no index rebuild or product edits. It describes the Code checkpoint, not future G1 code. Queries: Code file/workspace/bindings; resource/import/version/export; named context for `SkeletonProductionBindings` and `SkeletonResourceStore`.

- `handlers_for_store` upstream: LOW, 1 indexed direct caller (`child_handlers_factory`), no indexed processes. Text confirmation also finds its attribute use as `root_handlers_factory` in `skeleton_production_chat.py:183` and direct test calls: the one edge is not the full consumer surface.
- `save_draft` by bare name is ambiguous/UNKNOWN (Python store versus JS facade). Exact Python-file query: MEDIUM, 36 impacted, 5 direct, 2 modules, **lower-bound** because 69 receiver-unresolved call sites were dropped. Visible direct paths include route Save, conversion, duplicate, migration and rename. Do not use the process count of zero to infer no runtime effect.
- Wheel internals are not in this repository's graph. Their installed source was inspected directly and compared to the wheel member. Actual implementation requires the runtime repository's separate impact analysis if core changes become necessary.
- New DTO/storage/resolver symbols are not indexed yet. Existing closure/launch/credential-scope writers need separate pre-edit impact receipts during implementation. No HIGH/CRITICAL result is waived by this plan, and no current LOW/MEDIUM reading certifies a future patch.

No commit is made; graph change analysis for a future implementation remains required. This design task runs no build, index, Jest, pytest, desktop, source worker, HTTP server or provider.


## Host checkpoint 01 implementation record

Workspace: `/Users/red/Desktop/GITRepo/pupu-356-managed-code-sources`; branch `codex/ticket-356-managed-code-sources`; HEAD e24e993f; inherited accepted composition tree 4117670f. The inherited offline clone does not retain origin/dev. No fetch, main-tree dirty-file copy, commit or push is performed. The user explicitly requested the host work independently of frozen UI candidates.

Formal plan for this bounded checkpoint: implement a new internal `skeleton_code_sources.py` module and its tests only. Its producer consumes the exact v2 edit body above and projects only managed `config.code.source`; its strict consumer accepts a single-resource snapshot `{schema, document, sources_manifest, contents, content_digest}` and returns the installed runtime's exact `CodeSourceSnapshot`. Schema name: `pupu.skeleton-code-snapshot.v1`; each contents row is exactly `{sha256,text}`. Manifest path ordering is the lexicographic sequence of typed `(string-tag, string)` / `(integer-tag, integer)` components. Unicode is strict UTF-8 with no normalization; content digest is the host canonical JSON hash of `{document,sources_manifest}`. Expected edit token is request-only and is not retained as source authority.

This checkpoint does not add a route or enable dispatch. Actual atomic store save/read, versioned launch/source fence, full child-closure ownership, cold resume, portable export and UI handoff remain subsequent implementation/qualification steps under BC-357-010…012 / SEQ-357-010…017 / AC-357-010…019 above. Module tests are not a substitute for those steps. The narrow module deliberately cannot read a workspace path or infer source ownership from a prefix.

Weaker-model suitability: not suitable for this host checkpoint. Canonical byte identity, malformed-draft preservation, typed embedded ownership and durable snapshot contracts require the same strong agent to settle their interactions. No subagent is spawned; only the owner's separately relayed Claude work continues on the UI. No new UI decision is made.

Before adding the module, reference graph context/impact for its proposed names returned not-found/UNKNOWN. Exact text search in this clone confirmed no existing module/callers. Existing host functions are unchanged; the reference graph's LOW/MEDIUM results are not used to authorize future writer edits. A fresh clone-local index and symbol impacts are required before integrating existing store/launch writers. Indexing/full builds are deferred while Claude owns a heavy lane.

Focused test command uses the fixed pair's own Python `-I -B -m pytest`, this clone's `unchain_runtime/server/tests/test_skeleton_code_sources.py`, and `UNCHAIN_SOURCE_PATH` pinned to that venv's site-packages. The wrapper preloads a network-deny shim, sets a disposable HOME/data root, disables bytecode writes and uses a separate pytest cache/temp root. Each invocation checks the serial heavy gate.

### Checkpoint 01 measured result (internal seam only)

The internal producer and strict source snapshot consumer are implemented and have
44 passing tests. The initial RED was a collection failure because the new module
did not exist; it was not 44 independent behavioral failures. The first GREEN
attempt had two invalid test fixtures (duplicate top-level node ids), which the
real core format check rejected before the intended assertion. The fixtures now
use unique root node ids; deliberately ambiguous embedded ids remain covered by
their full typed addresses. Three limit mutations (file bytes, aggregate unique
bytes, binding count) each make their focused test fail; restoration is verified
by SHA-256 and a final 44/44 run.

One test uses the installed exact `SkeletonCodeRuntime`, its actual Python worker,
real SQLite Journal and the strict resolver without a workspace source file. End
returns `{rows:5}`. This is standalone installed-runtime evidence, not PuPu HTTP,
chat root-commit, approval/resume, deployment or source-authoring UI acceptance.
The internal contract capture records one accepted request and six typed refusals;
it is not described as a store/HTTP producer. No provider API is called.

Fixed wheel SHA-256:
`a166988a461f701be57c836264d4ddd546b99fcbede093ea204472d88d61b7ec`.
The actually imported manifest is
`sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101`.
The previous sidecar binary is not rebuilt or run for this checkpoint. Python
changes require a newly paired sidecar and restart before application acceptance;
there is no active rollout now. Loaded core source files were compared with wheel
members; this does not independently prove Python bytecode cache provenance.

A clone-local GitNexus index was built serially with one parsing worker and a
3-GiB JavaScript heap (110.7 seconds). The exact indexed runner reports matching
content for 3,110 files; using another runner with different dependency identity
initially reports stale, so subsequent status is pinned to the indexed runner.
The process graph is not exhaustive: the analyzer reports dropped candidates,
walk/depth caps and dropped callees. Producer/resolver impacts are UNKNOWN with
zero resolved callers; text search confirms only their new tests consume them in
the application tree. This supports their currently dormant scope, not LOW impact.

`scope:all` includes inherited e24e993f-to-4117670f changes: 151 files / 1,734
symbols / 271 flows / CRITICAL with a capped listing even after a higher-limit
retry. A temporary index based on 4117670f containing only these three new files
isolates this checkpoint: compare reports 3 files / 63 symbols / 0 flows / LOW.
The latter does not waive the broader graph's CRITICAL/coverage warnings. The
ordinary `unstaged` check misses untracked files and its “No changes” answer is
not used as a success receipt. No commit is made.

Evidence: `~/.codex/artifacts/pupu-357/code-g1-host-01-20261024/`. Overall G1 remains
INCOMPLETE. The next implementation is real aggregate storage/CAS and strict
versioned reads/writes, followed by retained closure/launch/fence and portable
source packaging. No endpoint, existing resource store writer, launch contract,
production binding or UI has been changed by checkpoint 01.

## Host checkpoint 02 — internal aggregate persistence

Checkpoint 01 tree `0e95e8a7c7710a90f8dfbb85e0ca61d2e3847870` and its
sealed patch/evidence remain immutable. Continue only in the same isolated G1
working copy; the frozen Code UI working copy is never edited. No commit/push.

Implement internal `save_managed_draft` / `get_managed_resource` store operations,
not HTTP/IPC routes. A source aggregate opts into store schema v2 in the same
SQLite transaction as its first save. Existing graph-only resources keep their
v1 contracts in the new binary. Old binaries reject the new schema on reopening;
database triggers additionally refuse graph/source mutation by connections that
do not authorize a complete managed write. No rollout or real-user migration is
authorized by a disposable-store test. Deployment backup/restart remain NOT_RUN.

BC-357-010 producer response is now concretely a CLOSED
`pupu.skeleton-resource.v2` object with exactly
`{schema, resource, sources_manifest, contents, content_digest}`. `resource` has
the unchanged summary plus document/diagnostics. `contents` is deduplicated
`[{sha256,text}]`, not repeated full text per binding; the manifest maps typed
addresses to these bodies. This freezes the internal storage producer only, not
a callable UI API. The earlier suggested response with repeated
`managed_sources` text was a design proposal, superseded here. A future HTTP
adapter must also enforce a bounded total request/response body; unique-byte
quota alone cannot bound duplicated submitted text. No endpoint exists yet.

Save explicitly supplies the entire managed set. Retained generated paths from
the previous manifest cannot become unbound through omission/reordering; the
author must supply their source or explicitly change/remove that Code source.
Graph, manifest, immutable source blobs, aggregate digest and edit token commit
together. Returned data is built inside that same transaction, not a later read
that can accidentally return another writer's version. CAS rejection and any
failure before commit leave every part unchanged. A real cold store read verifies
all hashes and returns the same aggregate. Missing/corrupt bytes fail explicitly.

Conservative v1 boundary: managed rows cannot be opened, saved, imported over,
renamed, duplicated, archived/restored, deleted, published, converted or admitted
through graph-only operations. These operations either encounter the central
graph-only row check or their explicit pre-write check; no graph-only convenience
path may discard source ownership. Full aggregate variants of these operations
and source-aware execution remain future work; they are not fabricated here.

Tests before implementation: real SQLite first save/read/cold reopen, stale and
concurrent CAS, graph-only legacy controls after v2 opt-in, two failure points
with no partial blobs/schema/document/token, strict producer-to-consumer equality,
orphaned/moved bindings, immutable shared blobs, old initialized connection and
old binary refusal, corruption/missing bodies and explicit source removal.
SEQ-357-010/012/016 and AC-357-013/018 receive partial storage evidence only;
end-to-end sequence cells remain NOT_RUN. Retained closure/launch/scope,
portable export, source UI and exact deployed artifact pair are not part of this
storage checkpoint.

## Host checkpoint 03 — transport and retained execution sources

Workspace `/Users/red/Desktop/GITRepo/pupu-356-managed-code-runtime`, branch
`codex/ticket-356-managed-code-runtime`, base immutable tree `b9261a61`.
Previous workspace/candidates/evidence remain unchanged. Continue the strong
implementation directly; no delegated agent and no parallel heavy job.

The new host API uses authenticated `/skeleton_resources/v2` routes and the
existing Skeleton IPC channel with new explicit actions. v1 remains closed.
Source request bodies are bounded before JSON parsing; Main independently
checks closed shapes, source UTF-8 bytes/hash/typed ownership and limits. A
versioned host capability record is required. The renderer receives no generic
filesystem access. Capture real producer responses before finalizing UI handoff.

Source-aware admission uses one real SQLite read transaction for root, embedded
and referenced Agents and pinned Workflows/Hooks. It reuses the existing graph
preflight algorithm through an internal transaction-scoped store; graph-only
public operations keep refusing managed resources. Root and published source
ownership and immutable body digests are retained separately from core's closed
nine-field preflight. Published source metadata requires store schema v3 so the
previous v2-only checkpoint cannot silently ignore it. The root edit DTO remains
v2. Migration remains offline/unrolled-out pending backup and quiescence.

New CLOSED admission `pupu.skeleton-admission.v2` is the canonical digest of
`{schema,preflight,code_sources}`. `code_sources` is a closed
`pupu.skeleton-code-closure.v1` frame with exact owned records, deduplicated
contents and per-prepared-document owner bindings. It must account for the real
selected recursive graph and pinned workflow definitions, not arbitrary paths.
Managed-source membership is checked at owner/version/full typed address. No
source closure means the existing v1 digest and launch behavior stay unchanged.

Launch v2 retains a `pupu.skeleton-code-runtime-snapshot.v1` containing that
closure plus all declared external Code sources resolved under the existing
workspace grant before effects. External bytes are base64, preserving non-UTF8
Python source; no workspace root is needed for all-managed Code. Mixed path
collisions reject before dispatch. Tools keep their original workspace grants.
Resume validates Journal-owned snapshot bytes and never refreshes source from
the library/workspace. Profile fingerprint validation remains core-owned.

Credential requirements/scope v2 keep their existing closed field sets, with an
explicit new schema and selection_digest committing the versioned source-aware
admission. Main accepts only matching requirements/scope versions and preserves
all existing target checks before vault reads. A supplied v1 or stale source
scope cannot authorize source-aware dispatch. The public Agent selector is
unchanged and never carries source text.

BC-357-010/011 apply at transport, admission, resolver, launch and credential
boundaries. SEQ-357-010…016 / AC-357-010…018 require real route→Main→preload→facade
captures, exact installed Code runtime, old/new scope negatives, child and pinned
Workflow ownership, two waits/resumes and cold retained-byte behavior. The same
wheel is reused for the new sidecar build. UI handoff waits for closed producer
captures and the rebuilt fixed pair; no real API, desktop or paid credential.
Portable archive/export and authoring UI remain later independent work.

Pre-edit clone-local impacts: `_connect` HIGH (49 impacted /19 direct,
lower-bound; reported before editing), `_document` MEDIUM (26/5), `save_draft`
MEDIUM (36/5, lower-bound); remaining changed existing methods LOW. New entrypoint
impact is not-found/UNKNOWN and exact text confirms no application callers.
No HIGH warning is waived. Reuse the same strong agent and serial heavy lane.

### Checkpoint 02 measured behavior and scope

Implemented internal save/read operations use real SQLite. Final focused suite:
163 passed (38 new storage cases, 44 prior contract/runtime cases, 81 existing
store/CAS/draft-IO controls). Initial TDD run: 27 new cases failed on the absent
operation and one old unknown-version control passed. Additional red controls
caught two SQLite REPLACE bypasses, half-present manifest metadata in both readers,
an unreadable graph with a coherently recomputed digest, and two over-broad legacy
migration-status refusals. These are corrected in the implementation. Four
storage mutations independently fail their focused tests: remove CAS, remove
retained-source membership, commit before constructing the response, and remove
the immutable INSERT/REPLACE guard. Exact file restoration precedes the final run.

Existing, completed legacy migration/equivalence status reads remain idempotent
after an aggregate upgrade because they write nothing. Fresh alias/migration
mutations still refuse before changing managed ownership. This qualification is
important: a source-version guard must not make an already-completed startup
migration look broken simply because the author later added Code.

Cold store output was consumed by the exact installed Code runtime and its real
Python worker, returning End `{rows:5}` with a real SQLite execution journal. This
does not qualify chat launch/root commit or approval/resume source retention.

The real internal store capture preserves the whole request/save/cold response,
six typed refusal rows with equal before/after logical database digests, and a
strict snapshot-consumer result. A byte-exact copy of the prior graph-only store
confirms old-binary reopening refuses schema v2; an already-initialized old writer
is refused by SQLite before it can overwrite the managed aggregate.

**Deployment limit:** an already-running old process can still read a graph using
its old code. The new database format cannot retrofit a new read guard into that
process. Migration therefore requires a quiescent deployment with old sidecars
stopped and a pre-upgrade backup. This is recorded explicitly, not described as a
cross-process read fence. No deployed migration, backup, restart, new sidecar
binary or HTTP interface is exercised by this internal checkpoint.

Evidence: `~/.codex/artifacts/pupu-357/code-g1-host-02-20261024/`. Source ownership,
read/save DTO and errors here are a real storage producer, but they are not yet
the UI-callable transport contract. G1 remains INCOMPLETE pending closed routes
and capability negotiation, retained full closure/launch/scope, portable source
packaging, fixed-pair qualification and the source-authoring UI handoff.


### Checkpoint 03 implementation notes (pre-handoff)

Authenticated route family `/skeleton_resources/v2` now has capabilities, aggregate
GET/save, preflight and immutable Workflow publication/version reads. The Main
uses the existing allowlisted resource IPC channel, handshakes before source
operations, and independently validates producer source hashes/typed ownership.
Preload/facade expose six explicit managed-source methods; no UI files are changed.

Store schema advances to **v3** on managed writes to retain published-source
metadata. v2 stores can migrate transactionally; old v2 applications must stop
before upgrade and cannot reopen v3. Backups/quiescent restart remain required;
this is not an active rollout. Existing source blobs and published versions have
immutable SQL guards, including authorized `INSERT OR REPLACE` attempts.

Source-bearing credential requirements/scope are v2, with their original field
sets and a source-aware selection digest. Main accepts only matching versions
before any vault read. Graph-only v1 retains its original lazy store seams. A
launch v2 embeds the verified source closure and captured legacy file bodies.
Resume validates the retained Journal artifact and never reads the current source
library/workspace. Code remains core's file-source contract with a host resolver.
Tools do not gain workspace authority from managed Code's lack of a workspace.

Runtime snapshot bound: 16 MiB represented source bytes (managed paths plus
external snapshots), 4 MiB per file, 256 external paths, 56 MiB encoded frame;
closure itself <=32 MiB. Public aggregate edits additionally cap raw HTTP at
40 MiB before JSON parsing, 16 MiB unique managed bodies and 256 source bindings.
Python canonical aggregate digest remains opaque to JS because numeric JSON
representations differ; Main verifies each source UTF-8 SHA and runtime manifest
independently. No source text is sent to renderer credential discovery queries.

SEQ-357-014 measured so far: actual active host + offline SDK factory, two real
durable approvals and resume, with A->B library edit between them. A fresh process
loads and verifies A's retained launch; continuation in the original qualified
process runs A. Cold Main/desktop resume remains NOT_RUN here. Published
Workflow A remains pinned while its draft and later publication change to B.

Interface transport and the rebuilt pair are now qualified in the isolated
`code-g1-host-03-20261024` evidence. The actual binary ran two completed messages
(A, then a new B), and an approval run retained A after a B edit and a real sidecar
restart. Three verified Journal roots committed End, with one final before one
terminal each. All six source methods also crossed actual preload/Main modules
and HTTP to this binary. The Node Main lifecycle harness is QA-owned; no React
source-editor interaction or desktop was claimed. The binary uses an explicitly
registered fixed-pair Python profile; its packaged executable is not a Python
interpreter and the `builtin` profile is unavailable there.

Host regression groups: 187 passed for source/launch/credentials/state/bindings,
156 passed for admission and existing selector/dependency compatibility (groups
partly overlap); Electron 71 suites / 1162 passed / 5 skipped; facade 3 suites /
23 passed; web build compiled successfully. An actual previous-v2 producer store
reopened exactly, upgraded to v3 on the next source write, and was then refused by
the old application on reopening. No real provider or user data was used.

UI source editing, source-aware Explorer metadata actions, portable export/import,
desktop execution and full G1 acceptance remain NOT_RUN. No fallback to v1 is
allowed. The interface can now be handed to the UI author on a new candidate;
frozen Code configuration and earlier source checkpoints remain untouched.
