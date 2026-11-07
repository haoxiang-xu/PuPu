# #357 G1 v2 import — formal producer continuation

Status before production edits: implementation planned; no active rollout. Existing accepted Host tree 99f40921 / Core 86f06ad8 and b2204391 wheel are the base. This new independent clone has no remote/commits. Frozen candidates and their evidence stay read-only. User authorizes offline implementation and exact-pair qualification, then a UI handoff; no real API, App launch or heavy overlap with Claude.

## Decision / assessment

Codex retains producer, persistence and process-contract work. No weaker-worker delegation is appropriate while the exchange/atomicity semantics are being settled. Claude implements UI only after measured producer handoff. This is the already-declared #357 import/rebind scope. No Python code generator, dependency package or import-time execution is added.

The portable file is the **existing closed** `pupu.skeleton-code-snapshot.v1` frame (document/sources_manifest/contents/content_digest), now produced by an explicit export operation. It adds no Store token, local executable registry or credential-store data. Authored document/source text is preserved and can itself contain paths or sensitive text; this operation is not a secret scrubber. A native schema_version:1 graph is also accepted as an import source when no Code body is required. A bare graph with Code cannot supply missing source bytes by guessing a path or empty string.

The HTTP export envelope is closed `pupu.skeleton-export.v2` with schema/source_json/sha256. source_json is the canonical UTF-8 JSON text of the existing snapshot. This string, not a reserialized JS object, is the portable file. Import request is closed `pupu.skeleton-import.v2` with exactly schema/source_json/runtime_bindings. Native schema_version:1 graph JSON text is also recognized. Source text is at most 40 MiB; the import HTTP envelope is at most 96 MiB to allow JSON string escaping. Main parses only for validation/identity/preview and forwards source_json unchanged; otherwise JS would silently rewrite Python 1.0/-0.0/large integer tokens and invalidate content digests. Each binding is exactly node_path/environment_profile_id; every owned Code occurrence needs one explicit local binding, including same-named and builtin profiles. No executable or shell command comes from the file. Profiles must already be available locally; explicit profile registration remains the existing separate API. Import does not execute/probe Code or start a run. The UI must require author choices before constructing bindings, not preselect matching ids.

A dedicated create-or-identical transaction compares the rebound canonical graph/source aggregate to the existing resource. Exact match preserves token/all tables; different content with same id refuses import_conflict without blob/schema/profile leakage. No replacement token is accepted. Existing editing/CAS and old graph-only import semantics remain unchanged. Export is one resource and its owned embedded graphs only, not recursive packaging of separately referenced resources/Workflow revisions.

## BC-IMP-001 — Store export → file / strict import

CLOSED / VERSIONED: export transports the existing five-field snapshot as exact source_json plus its raw-byte sha256; decoded import source is either that exact frame or native versioned graph, never a future-schema fallback. Validate UTF-8 hashes, full typed occurrence addresses, complete ownership, size limits and document identity. Unknown/missing/duplicate/wrong-owner bindings refuse before persistence. Preserve text bytes and draft values; never read live paths to fill missing bytes. No new Code config field.

AC-IMP-001: actual Store export → strict importer; root/embedded Code, exact text including CR/BOM/Unicode; native no-Code control; missing or forged source, mixed/wrong version and malformed targets; unchanged input and no writes on refusal.

## BC-IMP-002 — author binding → local Python profile

Closed per-occurrence mapping, exact cover of owned Code nodes; no id-based guessing. Local ids resolve through existing profile registry; missing/unavailable refuse at binding path. No file-provided registry/executable, activation or automatic default. Binding changes only environment_profile_id. Run-time profile validation/snapshotting remains the execution path's responsibility, not an import-time execution claim.

AC-IMP-002: missing, duplicate, extra, wrong target/id, same-name-local, builtin explicitly chosen; no map is a refusal. Rebind changes only profile fields and keeps source bytes/owner/siblings. Unknown profile does not create a profile or commit any resource/blob.

## BC-IMP-003 — import transaction / idempotence

One real SQLite transaction for collision decision and graph+blob+token/schema writes. Concurrent identical imports return the same row/token; divergent imports have one winner and one conflict. Existing archived state is not reset by exact repeat. Old editing expected_edit_token behavior is unchanged. Late re-import cannot overwrite newer author edits.

AC-IMP-003: repeat/no-op, conflicting body or graph, same-id graph-only record, concurrent identical/different writes, late repeat after editing, forced write failure rollback and source-owner isolation. Compare all table rows, not only blob counts.

## BC-IMP-004 — HTTP / Main / preload / API

Fixed authenticated routes: GET /skeleton_resources/v2/transfer/capabilities; GET /skeleton_resources/v2/<id>/export; POST /skeleton_resources/v2/import. Independent closed transfer capability declares schemas, exact binding/identity/scope policies and actual imported runtime manifest digest. Existing Code capability is unchanged. Main validates existing Code manifest first, then new transfer capability/digest before import/export. Old host cannot receive a fallback v1 save. Strict consumer binds reply to requested id/kind and rebound document. Ordinary JS transport/API only, no UI/file system implementation here.

AC-IMP-004: real producer captures through Main/preload/API; auth, query and field refusal; old host stops before mutation, wrong digest/schema/response identity and changed source bytes refuse. Exact built host + unchanged once-built b2204391 Core wheel; restart only owned QA sidecars. No release/App declaration from source tests alone.

## SEQ-IMP-001

Export origin A → author maps local runtimes → import destination → exact re-import → attempt conflicting import → explicit normal editor save → late old import → cold owned sidecar read. First import commits once; repeats do not change token; conflicts do not change any table; normal edit retains CAS. No import itself reaches chat interactions/retry/resume, so those execution cells are N/A here. Running imported Code, actual desktop file selection, cross-machine/Windows/Linux and full Builder/CP17 are NOT_RUN, not passed. No old execution snapshot is rewritten.

## Verification / constraints

Apply pre-edit graph impacts to actual clone. Old copied index is explicitly stale; UNKNOWN requires text corroboration. Cached CLI only, no network bootstrap or rebuild. Source tests RED first; meaningful targeted regression; build/verify exact pair once (Core wheel reused). All jobs serial and bounded on the 18 GiB machine. QA evidence keeps each round's tools/raw requests separately; no overwriting failed rounds. No commits/push/merge/Project updates. Python changes require new owned sidecar processes; user instance is untouched.
