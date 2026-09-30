# Ticket 371: bind cached skill revisions to their selection

Ticket: https://github.com/haoxiang-xu/PuPu/issues/371
Workspace: /Users/red/Desktop/GITRepo/pupu-371
Branch: codex/ticket-371-skill-inventory
Base: dev 8753e9e41df35f2241a4e35233f0c5d2c9f00b84

Root cause: setToolkits commits chat selection immediately. Background inventory
sync debounces 150 ms and fetches asynchronously. applySkillInventory stores a
global revision plus workspace/settings but omits toolkit context;
injectSkillsOptionsIntoPayload attaches that global revision to EVERY normalized
send. Backend route_chat resolves inventory with the NEW request toolkits, so an
old selection fingerprint produces a false 409 before the stream starts. Resend
works once background sync catches up. This is a context identity bug, not a
need to retry sends or weaken the backend comparison.

Decision: contextual cache reads. Record the effective toolkit set alongside the
already recorded workspaceRoot/includeUserDirs when a validated inventory is
applied. Pass requestToolkits from fetchAndSyncSkillInventory. Allow the revision
accessor to accept context; no-argument access remains compatible for other
readers. The wire injector asks for the revision for the actual normalized send
context (first nonempty workspace_roots entry, else workspaceRoot/workspace_root;
settings flag; options.toolkits). Normalize toolkit set order/duplicates. A
matching cache attaches the existing revision UNCHANGED, preserving real stale
inventory rejection. A cache for a different context provides no revision, like
existing cold-start/programmatic sends without a loaded baseline; never send a
known unrelated fingerprint. Explicit nonblank caller revision remains exact,
even when stale or context differs. Do not fetch on each send, change synchronous
stream handles, retry the model request, or edit the backend stale guard.

BC-001: inventory HTTP/IPC response -> closed-schema cache admission -> normalized
V2/V4 request options -> existing sidecar stale guard. Wire shapes and runtime
manifest unchanged. Context is local metadata, not extra inventory response keys.
Inventory response remains CLOSED (exact schema/revision/skills/diagnostics keys).
Request options are existing OPEN extension envelope. Revision is sha256:<64 hex>,
bound to effective first workspace, include-user-dirs and selected toolkit SET.
Unknown/malformed payload still rejected without erasing the last good cache.
Unmatched-context read returns empty baseline, not a different revision. No
physical-path normalization claims; preserve trimmed caller path conservatively.

SEQ-001: cache A -> select B -> send before debounce/fetch -> no A revision ->
fetch B completes -> send -> B revision. Older fetch A resolving after B must
not replace B (existing sequence guard). Same-context filesystem change retains
old revision in request and sidecar rejects 409; explicit stale revision likewise.
Second turns and inactive-chat sends use the addressed payload context, not
active-chat global state. Renderer restart is an empty baseline as before.

AC-001 red-before-green at actual api.unchain.startStreamV4/V2: cached toolkit A
must not attach to B before background refresh. Same toolkit set reordered or
duplicated is a match. Empty selection distinct from nonempty.
AC-002 workspace/settings mismatches do not attach unrelated revisions; first
workspace_roots entry has backend precedence. Matching context and explicit
revision are unchanged, so genuine stale rejection remains possible.
AC-003 actual fetchAndSyncSkillInventory -> validated cache -> API bridge payload
with deferred/inverted response sequence proves B binding; malformed response
does not replace good metadata. Existing stale handler/backend tests unchanged.

No UI components, persistence changes or local-model inference. Python sidecar
unchanged. Exact deployed candidate/live checks NOT_RUN until implementation;
development results do not constitute feature acceptance or active rollout.

GitNexus: injectSkillsOptionsIntoPayload LOW (4 impacted, direct normalizer,
startStreamV2/V4 and replaceSessionMemory); fetchAndSyncSkillInventory LOW (8,
sync/resync/settings listeners); applySkillInventory LOW (8, sync chain). No
HIGH/CRITICAL warnings. Worker reruns scoped impact on edited symbols including
revision accessor; corroborate any UNKNOWN with text callers.

Suitable bounded gpt-6-sol implementation: three production files
src/SERVICEs/skill_inventory_store.js, plugin_skill_sync.js, api.unchain.js and
associated tests. Checkpoint 1: context metadata/accessor, wire selection and
producer tests, then stop for strong-parent review. No commit/push/PR/audit or
GitHub writes. Do not alter unrelated API injection or slash expansion semantics.
If matching requires new wire fields, async handles, or guard bypass, stop and
report to parent. Run CI=true npm test -- --watchAll=false --runInBand
--runTestsByPath src/SERVICEs/skill_inventory_store.test.js
src/SERVICEs/plugin_skill_sync.test.js src/SERVICEs/api.skillInventory.test.js
src/SERVICEs/api.workspaceRoot.test.js; add focused regression as needed.

## Strong checkpoint review (2026-09-29)

Decision: continue; reviewed all three product changes. Cache metadata matches
the actual request and explicit caller revision retains priority. Matching
contexts remain subject to the existing 409 guard. No backend or retry change.
Worker red-before-green reproduced A revision leaking into B. Parent verification:
8 suites / 127 tests passed, including inventory store, sync, API, producer/cache
V4 integration, workspace selection, memory injection, byte-equivalence, and
stale-error handling. Malformed response and inverted fetch order covered.
Sidecar strict stale-guard tests and artifact identity check pending below.

## Final development verification

Parent ran the existing sidecar inventory-route tests with the immutable wheel:
4 passed, including fresh revision admitted and genuine stale revision returning
409 before model execution. This complements 127 renderer tests. No backend
code changed; a fresh test process imported the wheel. No running user sidecar
was replaced. Real app/cloud-model acceptance remains NOT_RUN.

Delivery follows the owner's standing authorization to commit/push and raise a
separate PR per selected bug, then wait for review. No automatic merge or issue
closure. This authorization supersedes the skill's default wait-for-close prompt.
