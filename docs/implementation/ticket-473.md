# #473 — explicit upgrade of legacy Agents

Ticket: https://github.com/haoxiang-xu/PuPu/issues/473; direct Release parent #208.
Workspace: `/Users/red/Desktop/GITRepo/pupu-473`.
Branch: `codex/ticket-473-legacy-upgrade`.
Base: dev `b7953a1b9f040bc47e5b9334465fa4dce8ee57e8`, tree
`d98a8245c462cbd216972964a9e41fd680af4d56`.

## Goal and boundaries

Finish the existing startup migration's second step: an explicit, per-resource
upgrade produces a native graph that can be edited, saved, reopened and selected
in chat. Preserve configuration and effective legacy policy. Original files,
existing execution snapshots/Journals, Characters and #210 are outside edits.
No real provider API or real user-data migration. No commit/push during start.
Use the canonical wheel c1213803c1b3bb58f4fc78a03b1a00f80e001d63be00c4afae53ab4d972b12ec,
manifest sha256:c172bc02718aee771ddd4d247904f13cdaf003d3794148fd3ecd4d4e9a419e6b.
Local heavy tasks remain serial; Claude owns the separate #210 hosted App QA.

Owner's UI choice: reuse existing components and styles, no design alternatives.
The interface inventory is an upgrade entry/banner, preserved/required-settings
list, existing Kernel/tool/subagent controls, explicit apply, and the existing
CAS conflict/error patterns. Loading is read-only; Cancel writes nothing.

## Evidence and decisions

Reuse Claude's survey and three reproductions at
`~/.codex/artifacts/ticket-341-close-20261106/claude-legacy-migration-survey-20261107/`.
R1 proves migrated seeds carry toolkit keys the binder rejects. R2 proves a
graph-less recipe's root toolkits/subagents survive only in provenance and are
absent from its executable graph. Passing reproduction tests assert those bugs.

The existing contract plan §2.5 already requires stable identity, preserved
originals, explicit invalid-reference errors, and old launches retaining their
snapshots. Reuse startup migration, deterministic IDs and scoped aliases.
Do not add another startup converter or automatically upgrade user data.

- Missing Kernel configuration requires the author's explicit choice; do not
  select a model/profile based on its position or guess a remote endpoint.
- Policy defaults must follow the actual source kind. A recipe with absent
  policy is delegate-only / parallel_safe=false; Soul/template defaults can
  differ. Do not replace all source kinds with one global default.
- Preserve an explicit toolkit allowlist, including the difference between an
  empty list and null. Missing/unsupported settings must be shown for a decision;
  stripping `config` is not proof that its meaning was preserved.
- Old chat names should reach the explicitly upgraded resource through the
  existing exact alias contract; no Default fallback. This is enabled only after
  the apply path and old/new selection tests pass, not by this first checkpoint.
- Stored authored native Kernels/pools take precedence over legacy provenance;
  inspecting an existing edited resource must not reset them.
- Builtin developer prompts, old interpolation, multiple node model overrides,
  scoped child references and nonempty toolkit config require strong-agent
  contract work before apply/UI implementation. A report is not a runnable graph.

## Boundaries, sequences and acceptance

BC-473-001 — stored first-hop draft -> read-only upgrade inventory: VERSIONED
preview envelope, CLOSED keys; real Core draft validation, exact resource/token/
digest/source identity, detached output; unsupported legacy values are reported,
never defaulted into capabilities. No file, alias, resource, profile or Journal
mutation. AC-473-001 covers Default/Explore, graph-less resources, authored native
settings, malformed input, repeated reads and unchanged whole-database contents.

BC-473-002 — explicit choices -> native draft apply: CLOSED versioned request,
author-provided model/ambiguous choices, host recomputation against one Store
snapshot and existing edit token. Validate native graph before one atomic commit;
stale edits, identity mismatch or unresolved settings write nothing. Preserve
source identity/aliases. AC-473-002 includes negative choices, concurrent edits,
idempotent second use, rename and restart. The detailed request is frozen at the
strong checkpoint; workers must not invent it.

BC-473-003 — authenticated HTTP/Main/preload/facade -> Builder and chat: strict
real-producer captures, no v1 fallback or premature capability activation;
source-scoped alias resolution and picker dedup; explicit failure, no Default.
AC-473-003 covers real controls -> exact save/read, the existing #210 view, and
unchanged original files. Existing Main/bridge paths need fresh impact first.

SEQ-473-001: inspect -> cancel -> inspect -> choose -> stale apply -> fresh apply
-> reopen -> repeated upgrade -> rename -> cold restart; stable ID, originals
unchanged and no duplicate resources. AC-473-001/002/003.

SEQ-473-002: legacy run A starts -> upgrade/save B -> A interaction/receipt/resume
continues on A -> new run uses B -> second interaction/cancel -> cold resume/read.
No migration write targets a launch or Journal. AC-473-004 records the offline
wire/configuration and persisted identity comparisons. NOT_RUN until executed.

## Investigation / risk

Fresh offline index of this clone: 55,316 symbols, 190,069 edges, 1,202 flows.
FTS is unavailable; concept query was empty and explicitly degraded. Named
contexts and exact impacts work; text checks corroborate unresolved paths.
`migrate_legacy`: MEDIUM/33 (15 unresolved receiver calls).
`SkeletonResourceStore.save_draft`: MEDIUM/40 (69 unresolved receiver calls).
`SkeletonResourceStore.convert_legacy_pools`: MEDIUM/30 (36 unresolved calls).
These are lower bounds, not proof of complete dynamic coverage. This checkpoint
does not edit those shared functions. New symbols are UNKNOWN before indexing.
No Core edit is yet authorized by the technical design; report if one is needed.

## Model assessment and bounded checkpoints

Partially suitable for a weaker implementation model. Root retains migration
semantics, per-node Kernel/prompt projection, scoped dependencies, atomic apply,
alias/chat transition, final review and integration. A settled pure inspection
helper with observable real-Store tests is suitable for gpt-6-luna; it must not
decide apply semantics or change existing converter/runtime behavior.

1. CP1a (only slice released initially): real stored-draft upgrade inventory,
   schema below, producer tests and no mutation. Strong review before exposing
   the report or dispatching dependent code.
2. CP1b: resolve the listed projection uncertainties, explicit choice request,
   atomic native apply and source-kind/tool/prompt parity; strong checkpoint
   before Main/preload/UI depends on it.
3. CP2: existing Builder controls, chat alias/picker transition and cold reopen.
4. CP3: adversarial/idempotency/old-run preservation and offline exact-pair App
   acceptance. Development completion remains separate from close/audit.

### CP1b — configuration conversion and atomic save (2026-11-07)

New workspace `/Users/red/Desktop/GITRepo/pupu-473-upgrade-save`, branch
`codex/ticket-473-upgrade-save`, same dev base. CP1a tree
`76036c06adb42c3f03f4a5e05974e682e9644dbf`, its workspace and 157-file seal
remain read-only. Artifacts: `~/.codex/artifacts/ticket-473-upgrade-save-20261107/`.
Fresh class impact is HIGH (19 direct consumers / 39 reached, including chat,
source storage and routes; no resolved execution flows). Existing methods stay
unchanged: add lazy preview/apply wrappers and an independent implementation.

BC-473-002 request is CLOSED `pupu.skeleton-legacy-upgrade.choices.v1`:
required keys `schema`, `kernels`, `toolkits`, `references`, `acknowledged`.
Each array entry has a unique nonempty address `path` of text/nonnegative integer
segments (at most 64; bool is not an integer). Kernels require `kernel`,
`model_policy` and `prompt_policy` (`preserve` or `replace`), and literal
`accept_projection: true`. Toolkit choices require `toolkit_id`, `enabled_tools`
(null or unique names), and boolean `discard_unsupported`. References require
`source_scope` and `agent_id`. Acknowledgements require `code` (only
`legacy_setting_ignored` or `legacy_prompt_review_required`) and `path`.
Reject unknown keys, invalid Kernels, duplicate addresses and unused choices.
No coercion, implicit model selection or implicit permission expansion.

`preview_legacy_upgrade(id, expected_edit_token=..., choices=...)` reads one
SQLite snapshot and returns the exact native document, fixed-pair manifest,
source identity/hash and dependency-bound projection digest. It writes nothing.
`apply_legacy_upgrade(..., expected_projection_digest=...)` repeats the same
projection under BEGIN IMMEDIATE, checks token/digest, then changes the same
resource row once and archives original provenance plus an upgrade receipt in
store_meta in that transaction. Aliases/migration records are untouched. Return
the transaction's captured result, not a later reload. Any validation/conflict or
storage error rolls everything back; reusing an old token conflicts, an already
upgraded resource is explicitly refused. No automatic startup upgrade.

Per-node public Core materialization preserves source prompts/model constraints
unless explicitly replaced; existing native Kernels/execution/pools win. Legacy
Start `text` output retains its name but reads native Host input `message`.
Builtin prompt expansion is captured as a reviewed prompt snapshot. Root
graph-less tool/subagent policies get deterministic attached pools. Null and []
tool allowlists stay distinct; ambiguous missing allowlists/nonempty config need
an explicit toolkit decision. Scoped references require an exact alias and an
already upgraded child; inline children require their own explicit Kernel.
Recipe policies use recipe parser defaults (delegate/false), template policies
use template metadata. Do not silently use parent Kernel or worker defaults.
Original provenance is retained in the archive, not executable node config.

Unsupported malformed, nonlinear or mixed modern execution graphs fail closed
in this bounded slice. Managed-source rows keep their source_api_required guard.
No HTTP, Main, preload, UI, SDK/App run or active-run recovery claim this slice.
SEQ-473-002 remains NOT_RUN; only untouched snapshot-file evidence is applicable.

Strong root owns converter, dependency projection and transaction tests. A
bounded weaker-model task may implement only the settled pure choices parser
and its tests, in two new files. Root independently reviews it; local test
windows are serial. AC-473-002 checks exact real-Store conversion, zero-write
preview/refusal, native precedence, scoped/source-kind policy, stale previews,
concurrent CAS, trigger-induced rollback, repeat/reopen, and original/source
snapshot integrity against the fixed installed wheel. No commit/push/PR/close.

### CP1c — authenticated interfaces and producer qualification (2026-11-07)

This slice uses `/Users/red/Desktop/GITRepo/pupu-473-upgrade-api`, branch
`codex/ticket-473-upgrade-api`, same verified dev base. Replay CP1b tree
`502446b676bfe66772ea50dd33fae6a80af2a523`; preserve that workspace and its
886-file / 305-link seal. No upgrade UI, picker or chat selection change.

BC-473-005 (extends BC-473-003): actual Store + fixed installed Core ->
authenticated loopback HTTP -> real Main resource command -> existing IPC reply
envelope/preload -> strict renderer facade. Use new fixed operations only:
`legacy_upgrade_capabilities`, `legacy_upgrade_inventory`,
`legacy_upgrade_preview`, `legacy_upgrade_apply`. No renderer-controlled URL,
method, arbitrary file, automatic apply, old-host fallback or swallowed refusal.

Capability GET `/skeleton_resources/legacy_upgrade/capabilities` requires the
unique exact query `contract=legacy_upgrade_v1`. Its CLOSED shape is `schema`
(`pupu.skeleton-legacy-upgrade.capabilities.v1`), `contract`, `request_schema`,
`response_schema`, `choices_schema`, `request_bytes` (4194304), `response_bytes`
(16777216), `scope` (`one-existing-agent`), `apply_policy` (`explicit-cas-preview`),
and the actual independently admitted `runtime_manifest`. Never admit by Git SHA.

The other three endpoints are POST
`/skeleton_resources/<resource_id>/legacy_upgrade/{inventory,preview,apply}`.
CLOSED request body: `schema=pupu.skeleton-legacy-upgrade.request.v1`,
`expected_edit_token`, `expected_runtime_manifest_digest`; preview adds `choices`; apply also adds
`expected_projection_digest`. IPC payload additionally has `resource_id`.
Reject unknown/duplicate JSON keys, extra/repeated queries, bad versions/types,
oversized bodies, missing/stale tokens and inconsistent identities before writes.
Raw UTF-8 body is bounded before JSON allocation. No GET mutates a draft.

Success uses CLOSED `pupu.skeleton-legacy-upgrade.response.v1` with `operation`,
`resource_id`, `expected_edit_token`, `projection_digest` (null for inventory,
actual for preview, accepted input for apply), `runtime_manifest_digest`,
`payload_json` and `payload_sha256`. `payload_json` is exact canonical Python JSON
of the real CP1a/CP1b result; retain it verbatim so JS never recomputes Python
integer/float JSON. Node SHA-256 and browser WebCrypto independently verify its
UTF-8 bytes. Consumers check exact envelope and payload key sets, operation,
identity/token, manifest and projection bindings. Browser API returns a detached
`{response, payload}` view; the response's payload_json is the authoritative
serialized form, never a client-authored apply document. Reject unsafe JS integer
views rather than silently rounding a preview. Refusals retain code/path/status.

The client carries the manifest digest read from capabilities (and retained in
its preview); a changed manifest refuses before any operation/write.
Main snapshots validated requests before its first await, negotiates capability
on every operation, and checks the operation response against that same manifest.
Preload only forwards fixed operation payloads through the existing resource
channel. The facade strictly checks capabilities/responses and invokes no v1
fallback. An oversized preview refuses before apply; apply's successful result
fits the validated preview budget. Normal JSON errors use the existing CLOSED
resource error record. No new channel or permission surface.

SEQ-473-003 / AC-473-005: unauthorized and malformed requests leave all tables
unchanged -> inventory -> preview twice -> rejected stale/forged apply -> one
apply -> same id/token/document via normal read -> repeat refusal -> second
resource -> new source HTTP process on same data -> exact read/preflight/receipt.
Use a private HOME, real original fixtures and fixed wheel c1213803/c172bc02;
record module byte identity, request/response bodies, process IDs and table state.
Real Main and preload modules drive the loopback producer; lifecycle hooks may
be test seams and must be disclosed. Do not count source HTTP as a packaged
binary/App or a provider/SDK run. No full build is needed for this off/UI-less
checkpoint; binary deployment/active rollout stays INCOMPLETE.

Risk: fresh clone index, FTS degraded; source corroborates unresolved dynamic
calls. Main command/preload are LOW lower bounds; facade factory is MEDIUM
(87 reached through api/memory-inspect). Existing Store converters and save
contracts remain unchanged. New route module is registered by an additive
import. Strong root owns HTTP contracts, Main/facade validators and integration.
A weaker gpt-6-luna worker may implement only NEW preload fixed-operation helper
`electron/preload/bridges/legacy_upgrade_bridge.js` and mirrored .js/.cjs tests.
Its factory receives `invoke(command)` and returns four methods:
getSkeletonLegacyUpgradeCapabilities() -> capabilities/{},
inspectSkeletonLegacyUpgrade(payload) -> inventory/payload,
previewSkeletonLegacyUpgrade(payload) -> preview/payload,
applySkeletonLegacyUpgrade(payload) -> apply/payload. No defaults/coercion,
semantic guessing, new channel or edits outside those three files. Root wires
the helper into createMisoBridge after review and independently tests refusals.
The worker owns the first short local test window; root writes independent Host
tests during that time. All later heavy tests/process units are serial.

### CP1a worker handoff

Permitted product paths: NEW `unchain_runtime/server/skeleton_legacy_upgrade.py`
and NEW `unchain_runtime/server/tests/test_skeleton_legacy_upgrade.py` only.
Do not edit Store, routes, UI, Core, originals, any other clone, guard or frozen
evidence. Run required impact even for new symbols; UNKNOWN needs text checks.

Function: `inspect_legacy_upgrade(document, *, edit_token, source_identity)`.
Use the real installed Core `validate_skeleton_document` and existing Host
SkeletonResourceError conventions. Require kind=agent, nonempty string edit token
and source identity. Produce only this detached CLOSED envelope:

```
{
  "schema": "pupu.skeleton-legacy-upgrade.inventory.v1",
  "resource_id": "<same id>",
  "edit_token": "<same token>",
  "source_identity": "<same identity>",
  "state": "needs_upgrade | native_draft",
  "requirements": [{"code": "...", "path": ["nodes", 1, "config"],
                    "message": "plain reason"}]
}
```

The report is not preflight, proof of runnable status, or a completed upgrade.
No raw toolkit config/prompt content needs duplicating into the envelope.

Requirements:
- `kernel_required` for an Agent lacking its own kernel. Authored kernel present:
  validate it with Core; report `kernel_invalid` at the precise error path rather
  than silently selecting a fallback. Never modify it.
- `toolkit_pool_conversion_required` for a toolkit_pool without native `toolkits`.
  Its legacy toolkit rows must be retained. Additionally report
  `tool_selection_required` when enabled_tools is absent, and
  `toolkit_config_review_required` for nonempty/invalid legacy config or unknown
  reference keys. Empty allowlist is explicit, not missing; null is explicit all.
- `subagent_pool_conversion_required` only when native `subagents` is absent.
  Do not convert entries, resolve aliases, or choose policy in this helper.
- For each graph-less legacy_recipe (absent/empty original nodes), report
  `root_toolkit_pool_required` (including its implicit legacy merge behavior) and
  `root_subagent_pool_required` if original root subagents are nonempty.
  Paths refer to the stored legacy_recipe fields; never write synthetic nodes.
  An authored native Pool already attached to that exact owner satisfies its
  corresponding requirement, even if the author chose an empty list. A Pool
  attached to a different owner does not; do not match by global presence/name.
- `builtin_prompt_review_required` when a missing-kernel node has builtin prompt
  source. Invalid or lossy legacy prompt metadata must not be silently ignored;
  report `legacy_prompt_review_required` with its stored field path.
- Malformed legacy pool/list/reference metadata: report
  `legacy_value_review_required` at the exact stored field, no coercion/default.
  Core-invalid documents and identity arguments are rejected as typed errors.
- Native draft means no outstanding requirements; it does not claim runtime
  capability/profile availability. Historical legacy_source alone need not block
  an otherwise configured native graph.

Tests must include real Store.migrate_legacy -> get_resource -> inventory for
Default/Explore and a graph-less custom recipe. Assert precise missing pieces,
no duplicate requirements, unchanged input/Store tables/source bytes, repeated
output equality, empty vs null allowlists, unsupported config, malformed rows,
authored native settings and type/identity rejection. Use an installed immutable
wheel, private HOME/temp, no network. No tests/build/index may overlap another
local heavy task. Preserve red/green logs. Stop at CP1a and return exact diff,
actual test command/result, any deviation and remaining scope; no commit/push.

## CP1d — apply response preparation and uncertain outcomes (2026-11-08)

Workspace /Users/red/Desktop/GITRepo/pupu-473-apply-boundaries, branch
codex/ticket-473-apply-boundaries, verified dev base b7953a1b. Replayed frozen
CP1c tree 2ce8f772; original workspaces/evidence remain read-only. Claude owns
only R-Q473-01 QA verifier correction; this slice does not repeat that work.
No upgrade UI, chat alias/picker transition, new protocol/channel, Core, real
provider/SDK, binary/App, commit/push/merge/close. Existing components/styles
choice remains, but no visual element is added here.

This implements only necessary BC-473-006..008 / SEQ-004..006 / AC-006..008
subset of the prepared supplement, retained in
~/.codex/artifacts/ticket-473-contract-prep-20261108/CONTRACT-PLAN.md. No previous
NOT_RUN is silently promoted. Exact Core wheel c1213803 / manifest c172bc02
remains reused; source HTTP is not packaged-artifact qualification.

Producer design (BC-473-008): extend only Host's explicit upgrade apply with
an optional trusted internal result_check callback, never a wire field. Pass a
detached captured resource result to this callback before transaction commit;
its failure rolls back resource/archive/receipt, and its return is ignored.
Default direct Store callers keep the same dict result. The upgrade route uses
it to build the complete Flask success Response, check canonical payload and
full encoded response bounds before commit, then return those captured bytes
without another post-commit jsonify. Keep shared resource _run unchanged; route
prepared-response errors retain its existing typed/generic policy. No request
can supply the callback. The existing conservative preview budget remains.

Consumer design (BC-473-007): existing v1 requests, capabilities and closed wire
replies are unchanged. After a dispatched apply fails or times out, attach only
LOCAL Error metadata legacyUpgrade with closed fields operation=apply,
resource_id, expected_edit_token, expected_runtime_manifest_digest,
expected_projection_digest, outcome. Outcome is unconfirmed by default. Only
authenticated documented pre-write refusals (exact code/status: unauthorized401,
edit_conflict409, upgrade_preview_stale409, upgrade_manifest_stale409,
legacy_upgrade_already_applied409, legacy_dependency_upgrade_required409)
are prewrite_refused. In particular 413/500/disconnect/bad reply remain
unconfirmed for compatibility with older v1 Hosts. Pre-dispatch errors and
other operations keep their existing behavior. Preserve code/path/status and
no automatic retry/abort/replacement apply. Timeout text must not imply rollback.

Tests before implementation: real Store/Flask response-budget and serializer
fault injection must first expose commit-before-refusal in old code; distinguish
those injected faults from valid-input production reproductions. Unicode
positive/full wire-byte measurements and direct Store callback rollback/detach
controls. Facade tests use actual timeout helper/fake clocks for dispatched
apply metadata, stale/known refusal, malformed response and older-Host 413;
old positive contracts remain. Finally one real loopback source/Main/preload/
facade chain holds an apply through the actual20s facade timeout, observes old
or committed state while held, then releases once and rereads; source restart
reads the same result. Use no SDK/model/tool execution. Exact as-run request/
response/state/module receipts, original source hashes and independent raw
checks; all local heavy phases serial and busy checked.

Strong root retains transaction, callback and outcome semantics plus review;
no weaker implementation worker is dispatched for this unresolved boundary.
Fresh clone graph impact precedes every edit, UNKNOWN is corroborated and
HIGH/CRITICAL is reported without riskSharedAxes waiver. New wire extensions,
UI integration and active/waiting old-launch preservation remain NOT_RUN.

## CP2 — upgrade wizard in the Builder (2026-11-08, Claude)

Workspace /Users/red/Desktop/GITRepo/pupu-473-upgrade-ui, branch
claude/ticket-473-upgrade-ui, base commit = frozen CP1d/CP1e candidate tree
dfd1a3a5 replayed on dev b7953a1b. Only the four existing facade methods are
used (`api.unchain.getSkeletonLegacyUpgradeCapabilities / inspect / preview /
applySkeletonLegacyUpgrade`) plus the existing v2 resource read; no new wire
field, endpoint, protocol version, Core, Main/preload, guard or chat change.
Chat alias/picker transition and old-run snapshot compatibility stay with Codex.

Entry: `skeleton_resource_page.js` offers "Legacy Agent · Upgrade…" above the
control center while the resource's own graph (not an embedded one, not a
pinned view, not the run view) still carries `legacy_*` node config. The offer
is held back with a reason while the draft is dirty, saving, converting or in a
save conflict: the upgrade reads the stored Agent at its stored token.

Wizard (`recipes_page/legacy_upgrade/`):
- `legacy_upgrade_plan.js` — pure: candidate detection; inventory requirement
  → choice slot (kernel at `[nodes,i]`, toolkit at the legacy toolkit row,
  acknowledgement at the prompt path); everything else informational; preview
  or apply refusal → new slot (`kernel_choice_required`,
  `toolkit_choice_required`, `toolkit_config_review_required`,
  `legacy_prompt_review_required`, `legacy_setting_ignored`,
  `ambiguous_reference`), dropped category (`unused_choice`) or blocking
  problem; closed `choices.v1` built only from slot addresses; JSON value
  equality for the reviewed-vs-saved document check.
- `legacy_upgrade_controller.js` — the sitting (BC-473-006/007): every request
  numbered and owned by resource id, read token and form generation; late
  replies refused ownership; any answer change discards the preview; apply
  sends exactly the reviewed preview's frozen choices and projection digest;
  outcomes `acknowledged` (saved document must equal the reviewed document by
  value), `prewrite_refused` (facade metadata; answers kept; `edit_conflict` /
  manifest stale → reread at the stored token, `upgrade_preview_stale` →
  preview again, already applied → reopen), `unconfirmed` (no retry, request
  kept, one deliberate read classified as commit-not-observed / matching /
  conflicting / unavailable). Tokens and digests are opaque.
- `legacy_upgrade_wizard.js` — existing `Modal`, `Button`, `Select`, `Input`,
  the existing `KernelSection` hosted on a one-node document for each Kernel
  slot, toolkit allowlist from `listToolModalCatalog` (null vs named list kept
  distinct, `discard_unsupported` ticked by hand), scoped reference picker from
  `list_resources`, acknowledgement checkboxes, the host's real preview
  (nodes/models/pools/policy/digests) and problems, one explicit Upgrade, then
  reopen through `load(resource_id)` + `emitSkeletonLibraryRefresh`.

Evidence: `legacy_upgrade_plan.test.js` rebuilds the producer fixture's
accepted `choices` by value for flat/explore/default; the controller test
replays the fixture's inventory/preview/apply captures and asserts the exact
requests, stale-reply fencing, close, conflict, stale preview, timeout
observations and document mismatch; the wizard test walks inventory → Kernel →
preview → apply → reopen and the refusal/unconfirmed branches on the same
captures; the page test covers the offer and its absence. Builder strings are
hard-coded English like the rest of the Builder (no `agents` locale namespace
exists). NOT_RUN: a live source-HTTP replay of wizard-generated requests, the
packaged App, real page-produced choices against a live store, and the
retirement of the older "Convert to Agent entries" path (owner decision).
