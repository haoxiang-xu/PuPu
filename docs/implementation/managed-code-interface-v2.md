# G1 managed Code interface v2

Status: producer/transport implemented on the isolated G1 runtime candidate.
UI, rollout and portable export are separate acceptance cells. Do not infer
support from a Git revision: query the actual running host capability record.

## Public API

All routes use the existing `x-unchain-auth` authentication. Main uses the existing
Skeleton resource command IPC, then the existing typed error envelope. No file
dialog, filesystem path permission, endpoint URL or arbitrary HTTP method is
accepted from the renderer.

| Facade/preload method | Action | HTTP |
| --- | --- | --- |
| `getManagedCodeCapabilities()` | `code_capabilities` | GET `/skeleton_resources/v2/capabilities` |
| `getManagedSkeletonResource(id)` | `code_get` | GET `/skeleton_resources/v2/:id` |
| `saveManagedSkeletonResource(edit)` | `code_save` | POST `/skeleton_resources/v2` |
| `preflightManagedSkeletonResource(id)` | `code_preflight` | POST `/skeleton_resources/v2/:id/preflight`, body `{}` |
| `publishManagedSkeletonWorkflow(id, token)` | `code_publish` | POST `/skeleton_resources/v2/:id/publish` |
| `getManagedSkeletonWorkflowVersion(id, revision)` | `code_get_version` | GET `/skeleton_resources/v2/:id/versions/:revision` |

The actual capability response is CLOSED and advertises these exact schema tags:
`pupu.skeleton-code-capabilities.v1`, edit `pupu.skeleton-edit.v2`, resource
`pupu.skeleton-resource.v2`, publication `pupu.skeleton-publish.v2`, version
`pupu.skeleton-workflow-version.v2`, preflight `pupu.skeleton-preflight.v2`, plus
the numeric limits and the independently admitted actual runtime manifest.
Main rechecks this capability before every source operation. Old or malformed
hosts fail; no graph-only fallback or empty-source substitution is permitted.

## Save and reopen

Edit has exactly `{schema, document, expected_edit_token, managed_sources}`.
`expected_edit_token` is null on creation, otherwise the loaded token.
`managed_sources` is the **complete** owned set, each row exactly
`{node_path, text}`. Text is strict UTF-8 with no trimming, Unicode normalization,
line-ending rewrite, syntax repair or injected defaults. Invalid Python can be
saved; it is not silently executed or treated as a successful run.

`node_path` points to the Code node relative to the owner resource document:
root `['nodes', 3]`; embedded example
`['nodes', 3, 'config', 'subagents', 0, 'source', 'document', 'nodes', 2]`.
Indexes must be nonnegative integers, never booleans or numeric strings. Only
these typed path steps are accepted; neither node id nor entry id grants source
ownership. A referenced Agent is edited/saved as its own resource, not as a child
address inside its caller.

The host replaces only each selected node's `config.code.source` with
`{kind:'file', path:'__pupu_code__/sha256/<UTF8-SHA256>.py'}`. Core's Code config
has no new inline field. The host atomically saves graph, source manifest, body
blobs, aggregate digest and token in one SQLite CAS transaction.

Resource response has exactly `{schema, resource, sources_manifest, contents,
content_digest}`. `resource` is the existing summary plus document/diagnostics.
Manifest is `{schema:'pupu.skeleton-code-sources.v1',entries:[{node_path,sha256}]}`;
contents is deduplicated, sorted `[{sha256,text}]`. Resolve editor/viewer text by
the manifest's full owner path and body SHA. A generated path without a matching
owned source is an error, never permission to read an arbitrary filesystem file.

On the next save submit the full managed set against the current graph positions.
Deleting/changing a Code source must be explicit: leaving a previously managed
generated path unbound is refused. A stale token returns `edit_conflict` (409)
without partial source/graph writes. Errors preserve `{code,path,message,status}`
through Main/preload/facade. Merely opening the editor must not write anything.

Limits: 4 MiB/file, 16 MiB unique managed bytes, 256 bindings, raw HTTP <=40 MiB
before JSON parsing. Repeated text still counts toward the raw request bound.
`content_digest` is Python's canonical graph+manifest identity; JS treats it as
opaque and independently verifies each source SHA. Do not recompute Python
aggregate JSON with JS number serialization and claim equivalence.

## Preflight, publication and retained runs

Preflight response is exactly `{schema:'pupu.skeleton-preflight.v2',preflight}`;
the inner preflight retains its original nine closed fields. It checks the stored
graph/source ownership, not unsaved editor text or Python syntax execution.
Publication body is exactly `{schema:'pupu.skeleton-publish.v2',expected_edit_token}`.
Version response is the resource aggregate shape with `version` instead of
`resource` and `schema:'pupu.skeleton-workflow-version.v2'`. Version's fields stay
`{workflow_id,revision_id,ordinal,definition_digest,document,dependencies}`.
Published source bytes are immutable even after the draft changes.

Admission freezes reachable root/embedded/referenced and published Workflow/Hook
source owners in one real read transaction. A source-aware selection digest binds
this closure. Credential requirements/scope v2 keep their prior closed fields;
mixed v1/v2 contracts and stale source scopes fail before vault reads/registration.
Public chat selection stays v1's existing three-key resource selector.

Launch v2 retains the verified closure plus captured external Code file bytes in
the canonical Journal artifact. Resume uses these bytes, never today's library or
workspace file. All-managed Code does not need a workspace source file; Core tools
still need their original workspace grant. Mixed legacy files keep that grant and
are captured before effects, with conflicts explicitly refused.

## Deployment and UI boundary

Managed writes upgrade the resource store to v3 for published-source metadata.
Stop old sidecars, back up storage, install the verified pair and restart before
using the source UI. Old initialized readers are not magically upgraded. No
real-user migration or active rollout is claimed by disposable-store tests.

Graph-only v1 cannot open/mutate managed aggregates. Source-aware rename,
duplicate/archive/delete convenience actions, portable import/export, desktop cold
resume and source-editing UI are not supplied by this interface checkpoint.
Do not wire such actions through v1 or claim their acceptance. The UI can edit
ordinary graph metadata together with the complete managed set through v2 Save.
