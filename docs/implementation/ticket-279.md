# Ticket #279 — truthful Memory settings

## Handoff and current state

- Issue: https://github.com/haoxiang-xu/PuPu/issues/279
- Direct release parent: #216, Release v0.1.12 (open).
- Workspace: `/Users/red/Desktop/GITRepo/pupu-279`, a regular independent clone.
- Branch: `codex/ticket-279-memory-settings`.
- Updated base: `origin/dev` at `4ece38cc9e921adff21cdc8bffe8fb5cc38e7986`.
- Implementation and the audit repair are complete in this isolated clone. The fresh feature audit passed on 2026-09-28 and the owner subsequently authorized a local commit. No push, PR, or closure has been performed.
- User decision: reuse the current Settings design in one version; distinguish legacy controls and show truthful current status. The preceding decision remains: Memory V2 is normally enabled by default, with internal fallback controls retained.
- The user requested a plan first, then a switch to a cheaper implementation model. The bounded UI work below was performed under that authorization; retain the stronger-model checkpoint before delivery.

Read `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/cross-boundary-contract-gate.md`, `docs/DEV_GUIDE.md`, and `docs/architecture/context-v2-and-memory-v2.md` before implementation. Use the `issue-start-ticket` workflow; implementation does not authorize commit/push/PR/closure. Keep the original PuPu checkout untouched.

## Problem and selected repair

Settings > Memory currently presents generic “Enable memory”, “Enable long-term memory”, embedding selectors, and a global legacy inspector. They write the legacy `memory` settings namespace. `injectMemoryIntoPayload` projects them into legacy `memory_*` options. Meanwhile normal V2 sends request `memory_v2_requested: true`, and durable V2 operation is independent of the legacy toggle. A user can therefore mistake an old switch for a V2 switch.

The current inspector is opened with `mode="long_term"` and no `ownerChatId`; it is a legacy inspector, not a V2 memory tree. Keep its scope explicit. Do not fabricate a chat identity to make it appear to inspect V2.

Selected repair: make the default page a read-only explanation and status view for the current memory service, and preserve the existing controls inside a clearly labelled, initially collapsed legacy section. Mount the legacy panel only when expanded so its embedding-catalog hooks do not run on ordinary page entry. This also preserves the existing panel's provider/error/empty states without modifying its persistence or runtime semantics.

Non-goals: a new V2 enable/disable preference; a new global V2 memory browser; deletion/migration of existing settings or memories; changes to admission, rollout, journaling, recovery, background curation, model context or Unchain; additional model calls; a new design system or settings page.

## Current evidence and impact

GitNexus was rebuilt in this clone at the updated base with `node .gitnexus/run.cjs analyze --index-only`. Query and disambiguated context identify `MemorySettings -> readMemorySettings`, settings repository access, and model-catalog hooks.

- `MemorySettings` upstream impact: LOW, 4 reachable dependants: `settings_modal_content.js`, `settings_modal.js`, `settings/index.js`, and `side-menu/side_menu.js`. The graph reports 0 affected processes and a callable-value boundary; this is a lower bound. Source confirms `PAGE_COMPONENTS.memory` and `ActivePageComponent` dispatch, so zero processes is not evidence of no UI reachability.
- `getContextV2Status` upstream impact: LOW, 4 reachable dependants via `createUnchainService`, main entry and `public/electron.js`; 0 processes, one Unchain module. Its implementation is read-only reference material for this ticket, not an edit target.
- No HIGH/CRITICAL result on the selected symbols. Workers must rerun impact before editing existing symbols. Disambiguate ambiguous test/property matches with `--uid` or `--file`; UNKNOWN is unresolved.
- Existing targeted baseline on this base: 4 suites / 62 tests passed. Existing UI tests deliberately expect legacy controls on the default page, so passing them does not establish the desired behavior. Update those assertions through red-before-green regression tests.

## Selected UI and behavior

Use existing `SettingsSection`, `SettingsRow`, `Button`, switches, sliders, provider selector, theme variables and translation helpers. No alternate visual designs were selected: the user accepted the single existing-style direction. Use ordinary UI text such as “Memory”; version numbers, rollout names, SQL/schema details and developer flags are not default user-facing labels.

| Area | Content and interaction | States |
| --- | --- | --- |
| Memory service | Status row plus a refresh button; read `contextV2Bridge.getStatus()` on page mount and explicit refresh only | Checking, available, limited availability, not active for new conversations, read-only, temporarily unavailable, failed/unknown |
| Scope explanation | Context is managed automatically; status describes service availability for new conversations. Existing conversations retain their own execution/recovery state | Static, localized; never claim every chat is active or that memory was deleted |
| Legacy memory settings | Explicit legacy description and “Show legacy settings” / “Hide legacy settings” button, initially closed | Expanded/collapsed using component state only; opening it does not enable memory |
| Legacy controls | Preserve current toggles, embedding options, tuning and inspection, with legacy-specific labels and scope text | Existing loading, empty/error catalogs, disabled sliders, provider navigation and modal close behavior |

Example scope copy (translate naturally): “PuPu manages conversation context automatically. This status describes availability for new conversations; existing conversations may use a different mode.” Legacy description: “These settings apply to the older memory system. They do not turn the current memory system on or off.” Label the existing inspection action “Inspect legacy memory”.

Status presentation rules are decisions, not worker TODOs:

1. Pending request: “Checking memory status…”; disable refresh while pending. Do not retain a stale success badge after a failed refresh.
2. Missing bridge, rejection, malformed required fields or unknown status values: “Memory status unavailable” and an explicit refresh action; show no raw error/stack/path/token.
3. A valid `available: false` response means temporarily unavailable, even if its default rollout fields are `off`. It is not proof of a user-selected off state.
4. With `available: true`, `readOnlyDegraded: true` takes precedence over a normal-ready label. Say “Memory is in read-only mode”; do not promise writes.
5. Otherwise use the validated `rolloutMode`: `all` -> available for new conversations; `canary` -> available for some new conversations; `shadow` -> not active in answers for new conversations; `off` -> not active for new conversations. Do not expose these internal enum names in ordinary copy.
6. Do not recreate rollout/admission logic in the renderer. If `featureCeiling` is unknown, or an off/shadow ceiling contradicts a claimed active rollout, show unknown/unavailable rather than guessing. Never derive status from saved legacy flags or the retired `enable_memory_v2` flag.
7. Ignore non-display fields for rendering. Main already enforces protocol/readiness. Do not add a second runtime protocol validator or a direct sidecar request in React.
8. Scope each request to the mounted component/request generation. Ignore late completions after unmount or replacement. No polling, timers that outlive the page, global provider, or persisted status cache.

Keep legacy controls accessible even when current-service status cannot be read. Their section label and description must remain visible while expanded. Reading the normal page must not call embedding-catalog hooks, mutate legacy settings, open the inspector, enumerate memories, or invoke an LLM. Existing model normalization may occur only inside the explicitly opened legacy panel, as it does today.

## Files and allowed edit surface

| File | Role |
| --- | --- |
| `src/COMPONENTs/settings/memory/index.js` | Page orchestration, status section and legacy disclosure |
| `src/COMPONENTs/settings/memory/legacy_memory_settings.js` (new) | Extract existing legacy controls, hooks and inspector with minimal behavior changes |
| `src/COMPONENTs/settings/memory/memory_service_status.js` (new, if useful) | Small presentation mapping/hook; no new protocol or storage layer |
| Co-located tests | User-visible status, race, scope and lazy-mount regression tests |
| `src/locales/*.json` | Every shipped locale; new plain-language strings and clearly legacy labels |
| `electron/tests/main/context_v2_service.test.cjs` and existing JS wrappers | Real main-process status producer checked against exact JSON fixture; avoid production main changes |
| `src/COMPONENTs/settings/memory/__fixtures__/service_status.json` (new) | Exact producer-output examples used by the renderer consumer tests |
| `docs/architecture/memory-system.md` and this plan | Brief settings scope explanation and actual implementation evidence |

Read-only dependencies: `memory/storage.js`, embedding hooks, `src/SERVICEs/api.unchain.js`, `src/SERVICEs/bridges/context_v2_bridge.js`, `electron/preload/bridges/context_v2_bridge.js`, `electron/main/services/unchain/service.js`, `src/PAGEs/chat/hooks/use_chat_stream.js`, existing inspector. Changes to these runtime contracts, schema, main/preload production code, Python, or Unchain require strong-model reassessment before dependent edits.

Extraction is permitted solely to keep legacy hooks unmounted by default. Preserve export `MemorySettings`, `onNavigate`, existing storage keys/defaults, option coercion, provider fallback and current inspector behavior. If using graph rename/extract tooling, verify output; never bulk rename symbols through find-and-replace.

## Cross-boundary contracts

### BC-2790 — existing status producer to new settings consumer

- Producer chain: sidecar status -> `getContextV2Status` in Electron main -> existing fixed GET_STATUS preload capability -> renderer `contextV2Bridge.getStatus()` -> settings presentation.
- The existing main-to-renderer projection is CLOSED with exactly: `available`, `schemaVersion`, `journalMode`, `lexicalBackend`, `vectorStatus`, `featureCeiling`, `rolloutMode`, `readOnlyDegraded`. Booleans remain booleans, schema version numeric, other fields strings. No counts, owner identity, content, endpoints, auth or paths.
- Canonical authority is main's validated runtime/readiness result, not local settings. No new request arguments, channel, schema or wire field. Unknown upstream fields remain stripped by the existing producer. Renderer displays only known localized state; unknown enums/malformed critical presentation fields yield unavailable.
- Admission: CLOSED at the existing projection boundary; VERSIONED runtime compatibility remains enforced by existing main/sidecar code, not by this page.
- Identity: process-level status applies to availability for new admissions and has no chat identity. It cannot establish the mode of a particular sticky chat. Runtime manifest compatibility stays bound to the actually imported Unchain wheel.
- Verification: extend real `createUnchainService().getContextV2Status()` producer tests to compare complete key sets/values to a fixture; consume the same fixed output in renderer tests without sharing a permissive normalizer. Cover unavailable and degraded states, added upstream fields, main rejection of incompatible runtime evidence, and no false ready display. Preserve existing negative protocol tests. AC-2790/2791/2794.

### BC-2791 — preserved legacy settings and inspector

- Producer: expanded legacy controls -> existing `writeMemorySettings` -> settings repository; consumer: `readMemorySettings` -> legacy `memory_*` payload injection and legacy inspector.
- Representation and extension policy: unchanged existing normalized `memory` namespace (known defaults/aliases in `storage.js`); no migration or stricter policy on old persisted data. CLOSED known runtime option projection stays unchanged. Do not copy V2 status fields into this namespace.
- Identity: existing legacy/global namespace and inspector scope; do not invent an `ownerChatId`. Existing canonical journal/admitted V2 sessions remain independently owned.
- Failure/fallback: preserve provider loading/error/empty behavior and existing persistence behavior; hide/show is local view state, never a settings reset. Legacy toggle does not disable V2 durability, change sticky admission or cancel a running/background job. AC-2792/2793/2795.

### SEQ-2790 — status page lifecycle (BC-2790)

Open -> pending -> success -> manual refresh -> error/unavailable -> retry -> success; close during pending -> ignore late completion; reopen -> fresh status. Restart sidecar in an isolated smoke profile -> unavailable while down -> fresh status after explicit retry, without toggling admission or sending a model request. Test repeat/refresh and out-of-order completion with deferred promises. AC-2791/2794.

### SEQ-2791 — legacy disclosure and persistence (BC-2791)

Initial page leaves legacy settings unchanged and catalogs unrequested -> expand -> read current saved values -> edit legacy switch/model/tuning -> collapse -> reopen -> values retained -> close/reopen settings -> values retained. Validate enabled/disabled legacy payload behavior via existing API tests. With current V2 requested, legacy false must leave V2 requested true; normal/graph paths remain subject to their existing admission. AC-2792/2793/2795.

State applicability: first and second page opening, retry, sidecar restart and settings persistence are applicable. Model first/second message, interaction repetition, durable resume/replay, graph/subagent execution are unchanged runtime paths: preserve existing regression coverage; the page must not write their state. No new interaction/resume protocol or live multi-provider matrix is introduced by this display-only change. Do not claim these paths were retested live if they were not. Provider/manifest mismatch evidence belongs to the existing status producer and its negative tests.

Exact-pair smoke: bind the new PuPu candidate to one immutable Unchain wheel. The existing verified wheel is available at `/Users/red/Desktop/GITRepo/ticket-349-final-repair-2026-09-27/unchain-artifact/unchain-0.2.0-py3-none-any.whl`, SHA-256 `d6cbdeb02c1b75cf711631b09e5b6a417077c4636b46658136ccd893565a5bf0`; manifest `sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e`. Verify receipt/hash and actually imported runtime before reuse. Record the new frontend candidate identity and new smoke results; #349's pass is not #279 acceptance. If unavailable, create one wheel using the repository artifact workflow and reuse it throughout. Do not substitute a mutable sibling checkout. Preserve evidence outside any later-deleted clone. No rollout/config changes are necessary for this ticket.

## Ordered implementation slices

### 1. Establish the regression and isolate legacy UI

Update/add tests proving the normal page does not present a generic memory-off control and does not load embedding catalogs or mutate saved settings. Capture the failing assertions before product changes. Extract the existing controls into the lazy legacy child; explicitly label both switches and inspection as legacy. Test expansion, provider navigation/error/empty cases, save/collapse/reopen and inspector reachability. Do not delete stored preferences or change their meaning.

### 2. Add truthful service status

Implement the status rules above using the existing bridge. Cover pending, all/shadow/canary/off, unavailable, read-only, malformed/unknown, rejected request, retry and unmount/race behavior. Add strict real-producer fixture evidence in the existing main test suite and renderer consumption tests. Keep the UI simple; no new primitive, feature flag, timer-driven status monitor or runtime policy.

### 3. Complete text, compatibility and development verification

Translate new strings in every shipped locale, update the short architecture explanation, and run the bounded regression commands below. Inspect light/dark, English/Chinese, narrow settings width, keyboard focus and the legacy inspector. Run an isolated desktop status/retry/reopen smoke using the exact wheel above, recording bridge output and the visible UI. No model request is needed to test this page. Record outcomes, limits, affected files and candidate identity in this plan and a GitHub progress comment.

### 4. Strong-model checkpoint, then implementation-ready

This is a short bounded change; one strong review after slices 1–3 is sufficient. Review actual diff, negative/race tests, real-producer fixture, lazy mount, persisted compatibility, translated scope and screenshot/smoke evidence. Correct findings before marking implementation-ready. This checkpoint is development review, not the feature audit. Keep #279 open/In Progress and wait for the user's close/audit instruction for delivery steps.

## Acceptance and commands

- AC-2790: default page makes no misleading generic switch claim; correct plain-language status for each supported producer state and no raw technical/error leakage.
- AC-2791: refresh/error/retry/unmount sequences do not produce stale success or background polling.
- AC-2792: legacy controls are initially collapsed, explicitly scoped, and preserve working supported controls, provider states and inspector access.
- AC-2793: saved legacy preferences survive disclosure/page reopen; opening the default page does not mutate them or fetch catalogs; legacy changes do not become V2 controls.
- AC-2794: actual producer output matches exact fixture/key set; renderer consumes it correctly; isolated runtime smoke agrees with UI and records wheel/manifest identity.
- AC-2795: existing settings storage, provider payload, bridge, V2 request and settings entry regressions pass. All new strings exist in every locale; light/dark and keyboard access remain usable.

Frontend baseline / changed area (add newly created test paths):

```sh
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/COMPONENTs/settings/memory/index.test.js src/COMPONENTs/settings/memory/storage.test.js src/SERVICEs/api.memoryProvider.test.js src/SERVICEs/bridges/context_v2_bridge.test.js src/COMPONENTs/settings/settings_modal.test.js src/PAGEs/chat/hooks/use_chat_stream.memory_v2_payload.test.js src/COMPONENTs/memory-inspect/memory_inspect_modal.test.js
```

Producer and bridge contracts (existing JS loader twins must remain effective):

```sh
npm run test:electron -- --runTestsByPath electron/tests/main/context_v2_service.test.cjs electron/tests/preload/context_v2_bridge.test.cjs electron/tests/main/memory_v2_rollout.test.cjs
npm run build:web
```

Use the `issue-feature-audit` Test API reference for the isolated desktop smoke, but do not invoke the audit workflow in the implementation phase. Run locale key/placeholder checks for changed keys across `src/locales/*.json`; no new test framework is needed. Do not run unrelated full suites repeatedly after these checks pass unless a concrete regression warrants it. Graph change analysis is required before any later delivery commit.

## Cheaper-model suitability and stopping rules

Assessment: **suitable for bounded implementation**. Root cause, UI direction, status contract, fallback semantics, allowed files, lazy mount and observable tests are settled. No runtime redesign is delegated.

Suggested next model: **GPT-6-sol, medium reasoning**, or the user's chosen implementation model. This is a recommendation, not a claim that the model has been switched or dispatched. The current user intends to switch the conversation model after receiving this plan. After that switch, slices 1–3 are the authorized implementation assignment; keep work uncommitted in this clone. At the end, stop at checkpoint 4 for a stronger-model review; no reviewer is currently scheduled or running.

Escalate before dependent edits if the existing status surface cannot support the specified display, a real V2 preference becomes necessary, production bridge/runtime/schema changes seem required, saved-setting semantics change, or tests reveal a cross-boundary contradiction. Report evidence and the smallest proposed correction. Do not invent a workaround that disables durability, exposes technical controls to users or revives a retired feature flag.

## Evidence log

- Planning baseline: latest dev fast-forwarded safely; clean working tree before this file; index current at the recorded base. Four frontend suites / 62 tests passed in 2.194 seconds.
- Implementation: completed locally and uncommitted. The default page renders a read-only status component and a collapsed legacy disclosure. Legacy controls, their storage reads, and embedding-catalog hooks live in a child which mounts only after expansion. The status component uses only the existing `contextV2Bridge.getStatus()` capability and discards late requests.
- Audit repair: malformed or contradictory status data is now rejected before the read-only display rule is applied, so an invalid `readOnlyDegraded: true` payload cannot hide an invalid rollout. The renderer and the real Electron main producer now consume the same exact eight-field JSON fixture. The existing OpenAI catalog loading/error/empty/fallback tests, legacy persistence tests, inspector access, provider navigation, all rollout states, pending/error/retry, and close/reopen race coverage are present rather than replaced by the new page tests.
- Regression tests: the seven targeted frontend suites passed, 116 tests total: `index.test.js`, `storage.test.js`, `api.memoryProvider.test.js`, `context_v2_bridge.test.js`, `settings_modal.test.js`, `use_chat_stream.memory_v2_payload.test.js`, and `memory_inspect_modal.test.js`. The output included one pre-existing fake-timer warning from `use_chat_stream.memory_v2_payload.test.js`; it did not fail a test. The focused settings suite itself passed 25 tests without React warnings.
- Producer/bridge tests: `context_v2_service.test.cjs`, `context_v2_bridge.test.cjs`, and `memory_v2_rollout.test.cjs` passed, 103 tests total. `context_v2_service.test.js` remains the existing loader for its `.cjs` implementation, so both harness entrypoints exercise the fixture assertion.
- Build, localization and architecture note: the production web bundle compiled successfully. The official i18n audit found no missing, orphaned, or placeholder-mismatched entries in any of the 11 shipped locale files and no code key missing from English; its reported dead-key list includes the dynamically composed status keys and unrelated existing keys. `docs/architecture/memory-system.md` distinguishes legacy settings from the read-only current-service status.
- Exact runtime pair: the isolated Electron profile used `/Users/red/Desktop/GITRepo/ticket-349-final-repair-2026-09-27/unchain-artifact/unchain-0.2.0-py3-none-any.whl`, SHA-256 `d6cbdeb02c1b75cf711631b09e5b6a417077c4636b46658136ccd893565a5bf0`. Live `window.unchainAPI.getStatus()` reported `runtimeProtocolVerification: "runtime_protocol"` and imported runtime digest `sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e`. Live `window.contextV2API.getStatus()` returned the closed eight-field projection with `available: true`, schema 3, WAL, FTS5, ceiling/mode `all`, and `readOnlyDegraded: false`.
- Lifecycle smoke: the page visibly rendered the available status from that bridge. Terminating the isolated sidecar and pressing Refresh changed the UI to “Memory status unavailable,” clearing the previous success. Restarting the same isolated app/profile produced a new ready sidecar and a fresh available result. No model request was made.
- Legacy smoke: expanding the legacy section, changing the old enable switch to false, closing/reopening Settings, and restarting the isolated app preserved `memory.enabled: false` in the real settings-storage namespace and in the rendered switch. The legacy inspector opened and displayed its real empty-vector/profile view. The disclosure is a native focusable button (`tabIndex=0`) and retained focus during the keyboard-access check.
- Visual smoke: dark/English and light/Simplified-Chinese states were inspected. At the app's narrowed 980×620 window the status, scope copy, Refresh action and collapsed legacy disclosure remained visible without clipping. Screenshots and the live evidence record are stored outside the clone under `/Users/red/Desktop/GITRepo/ticket-279-repair-evidence-20260928/`.
- Candidate digest: `sha256:2e1502d9de99406744ff540a974800f20aa175cb90dc77f0584b8ef2ce9dd37a` over the 18 product/test/translation/architecture working-tree files on base `4ece38cc9e921adff21cdc8bffe8fb5cc38e7986`; the self-referential implementation evidence file is excluded. The exact production web output is separately bound as `sha256:a184de821041a848604d82930a7cdd3bf04cb186e18b136cce1ff1eb4e9fad4c` over 240 build files.
- Graph verification: after rebuilding the clone's stale GitNexus index, `detect-changes --scope all` reported 15 tracked changed files, 13 indexed symbols, zero affected execution flows, and LOW risk. The two newly extracted child components remain UNKNOWN in isolated symbol walks because JSX component imports are not resolved as callers by this graph; source confirms both are imported only by `memory/index.js`, and the page plus modal integration tests cover that route.
- GitHub progress record: https://github.com/haoxiang-xu/PuPu/issues/279#issuecomment-5863775101
- Audit state: the fresh audit PASS at https://github.com/haoxiang-xu/PuPu/issues/279#issuecomment-5877486883 supersedes the initial FAIL for the candidate digest above. The ticket remains open, with Project Status In Review. The audit reran 116 frontend tests and 123 Electron tests (239 total), verified all 18 candidate and 240 production-build file hashes, and compared 341 extracted wheel package files byte-for-byte. The frozen production frontend was exercised in real diagnostic Electron: real status, legacy persistence/inspector, service interruption and same-page recovery, actual Enter/Space input, and light/dark narrow-window layouts passed. Retained audit evidence: `/Users/red/Desktop/GITRepo/ticket-279-reaudit-20260928/`. This is local diagnostic candidate evidence, not signed-installer release certification. Any later change to candidate inputs requires a new audit.

- Final pre-commit graph check: after staging all 19 files (including the previously untracked components and plan), `detect-changes --scope all` reports 44 changed symbols and 10 affected flows, risk HIGH. The complete backend result has no partial/truncated flag and is retained at `/Users/red/Desktop/GITRepo/ticket-279-reaudit-20260928/precommit-graph.json`. All affected flows begin at the extracted `LegacyMemorySettings` and reach the existing settings/provider bridge paths covered by the 239-test regression run and real persistence/inspector smoke. The earlier 15-file LOW result excluded untracked additions and must not be treated as the complete final assessment. Candidate implementation hashes remain identical to the audited inputs; only this evidence plan was updated for submission.
