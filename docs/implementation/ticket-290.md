# Ticket 290: constrained local Zotero MCP

Ticket: https://github.com/haoxiang-xu/PuPu/issues/290
Release: #216 v0.1.12
Workspace: /Users/red/Desktop/GITRepo/pupu-290
Branch: codex/ticket-290-zotero-read-only
Base: dev @ bd94efe8facb38ed4afa7488a46e68d5e6cbb15a

## Goal, investigation and decisions

Users search their own local Zotero library and retrieve citation metadata. The pinned third-party 54yyyu/zotero-mcp 0.12.0 package is MIT, source 8b8e7a294c63afe07604063e04dcea0f8c389bdd, wheel SHA e5eab1b19ba2653ab3508013da17fc3a137708938a12bb8ef8e1aa5b88a46cd6. Its generic CLI/server is unsuitable as-is: core toolsets retain mutations and auth, CLI imports saved config, server lifespan starts schema refresh and may index from home config. ZOTERO_LOCAL=true / TOOLSETS=none are not read-only enforcement.

Use a PuPu-owned bounded adapter, truthfully labelled as a restricted integration of the third-party package (not an official Zotero product or a full upstream-server launch). Expose exactly zotero_search_items(query, limit) and zotero_get_item_metadata(item_key). Use the pinned package's pure creator formatting helper and its pinned PyZotero dependency for the local API, not upstream CLI/server/tool registration/config/SQLite/fulltext paths. No arbitrary endpoint, library switch, file path, pagination URL, write/auth tool, PDF extraction, semantic/ML extra, external embeddings or automatic indexing is exposed. Returned abstracts/metadata can be discussed by the selected model; full-paper access is not claimed.

A fixed-origin HTTP transport validates every request before sending: GET only, http://127.0.0.1:23119, exact /api/users/0/items or /api/users/0/items/8-character-key, no redirects, proxies, cookie persistence or user credentials. Query length/limit/key and response-size bounds; absent Zotero produces an actionable failure. Existing user Zotero/Claude configuration and API keys must not affect this profile. Text reaches the user's selected model provider and normal charges apply; local Zotero needs no cloud key. No new UI components: reuse Store row/detail/install.

Logical managed command pupu-zotero-readonly resolves through the existing bundled uv/python runtime to a fixed inline Python adapter source, preserving logical command on disk so app relocation/restart re-resolves current first-party code. No external script path or shell interpolation. Exact top-level versions: zotero-mcp-server==0.12.0, pyzotero==1.14.0, fastmcp==3.4.7, mcp==1.29.1; profile-only resolution cutoff 2026-09-14T04:00:00Z. Existing global July cutoff is unchanged; a July resolution cannot contain the August PyZotero or September server. Upstream stale server.json is not used: verified PyPI wheel and source version are authoritative. Dependency resolution and advisories must be recorded before claiming qualification.

## Architecture / files

New mcp_zotero_profile.py carries the immutable adapter source/args. mcp_managed_runtime.resolve_managed_stdio_runtime maps the logical command to uvx and its prefix; mcp_toolkits.build_mcp_runtime_toolkit recognizes the logical command on cold runtime rebuild. Existing _resolve_mcp_config already invokes the resolver on install. The exact same adapter is used during install tool discovery and runtime invocation. Append mcp.workspace.zotero-readonly registry/listing metadata; no secrets requested. Add synthetic endpoint/protocol tests and existing resolver/store regressions, plus actual stdio smoke in an enforced sandbox.

GitNexus current clone query/context and impact: resolve_managed_stdio_runtime LOW (2 direct callers, 13 upstream symbols); _resolve_mcp_config LOW (3 direct, 7 upstream); build_mcp_runtime_toolkit LOW (2 direct, 7 upstream). Python process graph counts are zero, so corroborated by current text: install/discovery and later agent construction both resolve the managed command. No edits to Unchain, IPC or shared schemas.

## Formal assessment

Not suitable for a weaker implementation worker: enforcing request origin/verb plus credential/config exclusion across process spawn and cold rebuild requires security judgment and negative tests at each boundary. Strong parent implements. Checkpoints: 1 pure adapter and HTTP negative controls; 2 managed install/cold rebuild plus exact tool surface; 3 isolated actual stdio/fixture and dependency findings. Do not mark available/Verified based on static review or mocked tests. No new visual design decisions.

## Contracts and sequences

BC-290-001 OPEN catalog metadata with required canonical identity → validated mcp_registry entry and existing Store trust. AC-290-001: pinned identity, third_party/officially_curated/unverified, source/license/prerequisites/charges/limits and actual two-tool surface are accurate; malformed registry rejected. Availability stays needs_review until required qualification, never invent a security badge.

BC-290-002 CLOSED logical profile identity → managed resolver → uvx process args. Identity = profile v1 + adapter SHA + server/explicit dependency versions + cutoff; install and cold rebuild use exactly the same source. Empty user args are canonical; no substitution of persisted absolute paths or mutable package versions. AC-290-002: capture real producer args in strict fake consumer, reject unknown profile conditions, persist only logical recipe and no secrets; cold runtime rebuild and app relocation produce equivalent adapter. Existing npx/uvx/custom behavior remains unchanged.

BC-290-003 CLOSED MCP tool list and tool argument schemas → local read client → guarded HTTP transport. Only two tools; all network requests fixed-origin GET to listed paths; no redirect follow, environment proxy, cookies or auth. Item key [A-Z0-9]{8}; bounded query/limit/response. AC-290-003: synthetic Zotero API returns known search/citation records; mutations, traversal, remote hosts, alternate ports and redirect responses never reach a receiver; stale personal config/credentials do not enable tools or destinations. Malicious strings in records are returned as data, not executed. Model injection behavior is tested separately; don't infer it from HTTP tests.

BC-290-004 package/source/dependency artifact boundary. Pin actual wheel digest and record resolved dependency inventory/advisory disposition; install-time package provenance unavailable must be explicit. AC-290-004: actual downloaded wheel equals digest and source selection, clean isolated env resolves pinned versions with scoped cutoff, cold stdio list/search/metadata and teardown work. Exact PuPu candidate + preserved #291 Unchain wheel (6544306f…f194, manifest2d0587fa…d12c) must be qualified before active release; unit/source tests do not substitute.

SEQ-290-001 toolkit id mcp.workspace.zotero-readonly: absent → install/discover → repeat search → retrieve metadata → cold process rebuild → missing Zotero actionable failure → retry after restored fixture → uninstall. Persisted args cannot enable other tools. State matrix first/second normal tool call and cold restart required; mutation interactions N/A (unreachable), graph/subagent toolkit discovery shares factory but full paths not changed; retry is a new bounded GET, no remote durable writes/resume state. Unrun packaged/model/platform cells remain NOT_RUN.


## Implementation checkpoint — 2026-09-23 UTC

The source candidate entry is now available after selected-content and local transport qualification; active rollout remains subject to exact candidate qualification. The initial dependency proposal was upgraded to FastMCP 3.4.7 / MCP 1.29.1 after OSV findings. Only the DiskCache unsafe-cache-deserialization advisory remains in the measured dependency environment; the selected server uses MemoryStore, no disk cache/config/index constructor, recorded as scoped non-applicability rather than fixed or Verified.

Strong review found and fixed two additional boundaries before delivery: both tools now project explicit citation/abstract fields and reject/omit note, attachment and annotation records; the canonical HTTP request explicitly retains fixed 10-second connect/read/write/pool timeouts. Credential/cookie/proxy exclusion, redirect/compression rejection and 2 MiB response bounds remain. Graph impact for inline SERVER_SOURCE returned UNKNOWN (constant read not resolved), corroborated by the two profile_args/source_digest readers and the existing resolver/cold-rebuild call graph. New private-field and timeout regressions pass. The first diagnostic candidate is superseded and rebuilt after these fixes.


## Delivery checkpoint

Final r2 diagnostic candidate ZIP SHA-256: `924049a3f0ccb7aad4c177c931acb11e8d5b571661abbd7f1a7245e72d0bddd2`. The restarted exact frozen sidecar and bundled runtimes completed real install, real GPT-4.1 search/metadata calls, cold restart, one bounded malicious-abstract test and uninstall against synthetic local data. Detailed observed results and limits are in `ticket-290-evidence/README.md`. Functional qualification permits the available catalog entry; it does not mint Verified or authorize a production release.
