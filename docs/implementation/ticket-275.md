# Ticket #275 — trustworthy debug-state snapshots

Ticket: https://github.com/haoxiang-xu/PuPu/issues/275
Release: #216 (v0.1.12)
Workspace: /Users/red/Desktop/GITRepo/pupu-275
Branch: codex/ticket-275-debug-state
Base: dev @ 03f43cb35c3982cb9fe929fbc7411598579173b1

## Goal and settled repair

The active-chat selector reads an unwritten `isStreamingFlag`; background
queries already read `chat.isGenerating` through the real storage adapter.
Use that adapter value for every inspected chat, including the active chat.
Remove the unused streaming flag/setter and its debug-handler plumbing.
Missing/no chat stays false. Explicit unknown IDs must not inherit active state.

The config setter also has no caller. ConfigContainer owns `onThemeMode` and
`locale` (it does not expose `isDark`). Add a dev-only effect there, using the
existing dynamic test-bridge module, to send `{isDark: onThemeMode ===
"dark_mode", locale}`. Guard the asynchronous import with effect cleanup so
an obsolete render/unmounted container cannot overwrite newer values.
No static import of the bridge installer into the production container.
No UI, provider, sidecar, schema, persistence, or stream lifecycle changes.

Read first: AGENTS.md, CLAUDE.md, .claude/CLAUDE.md, docs/DEV_GUIDE.md,
docs/api-reference/test-api-debug.md. Tests use react-scripts, never local LLMs.

## Investigation and risk

GitNexus index built in this clone at the base above on 2026-09-19.
Query/context found `collectStateSnapshot` called by `registerDebugHandlers`;
that handler is registered by `installTestBridge`. App dynamically imports the
installer and wraps its tree in ConfigContainer. Impact on those four functions
and setConfigContextRef returned UNKNOWN (unresolved const/dynamic edges), not
an all-clear. Full text search confirmed these callers and absence of callers
to the streaming setter. Its one LOW-confidence graph hit in InterjectRunner
is a different local React setter, not an import. No affected graph processes
were resolved; test-api IPC and HTTP consumers were inspected separately.
The config container is app-wide; preserve its production behavior and test
both startup hydration and subsequent theme/locale changes.

## Contracts and acceptance

BC-275: producer = chat store adapter + committed ConfigContainer state;
consumer = getStateSnapshot handler -> existing preload IPC -> /v1/debug/state.
Canonical streaming identity is inspected_chat_id (requested ID else active
ID); true only when its chat.isGenerating is strictly true. Window config is
window-wide, independent of requested chat. Keep the exact existing snapshot
key set and value types; CLOSED snapshot contract, no new key/version.
Unknown chat ID yields null inspected_chat and false streaming; never fall
back to another chat. IPC admission/errors are unchanged. No durable/runtime
protocol change. Exact candidate digest is recorded at delivery; immutable
Unchain wheel/manifest and real-app verification remain required evidence for
any claim of full cross-boundary acceptance, despite no runtime code changes.

SEQ-275: chat A idle -> generating -> idle; switch active to B while A runs;
inspect both IDs; repeat A's run. Config light/en -> dark/zh-CN -> light/en;
rapid changes and unmount must not publish an obsolete async effect. Config
reload hydrates current persisted choices; snapshot introduces no persistence.
Normal/graph/subagent paths share chat.isGenerating and are observational only.
Interaction, retry and sidecar resume behavior are unchanged; snapshot must
reflect the store in each phase, not mutate or infer engine state.

- AC-275-1: active/default and explicit-active queries report true while the
  adapter reports running, then false on completion, including second run.
- AC-275-2: background selection is independent of active streaming; missing
  or invalid IDs never report another chat's activity. Exact output keys held.
- AC-275-3: real ConfigContainer publishes initial persisted theme/locale and
  subsequent changes into the real debug handler; no manual setter substitute
  for the producer in the integration regression.
- AC-275-4: obsolete async imports/unmount cannot overwrite latest config;
  no bridge installer import in production execution.
- AC-275-5: real-app /debug/state smoke validates active/background streaming
  and config readout. If model inference is needed, use cloud openai:gpt-4.1
  only. No local model inference. Delete only test-created sessions.

## Bounded implementation and review

Partially suitable for a cheaper cloud worker: the streaming source and negative
cases are fully settled and the existing selector tests are focused. Dispatch
this slice to gpt-5.6-terra, with a strong parent checkpoint before integration.
Strong parent handles config lifecycle, independent consumer verification,
real-app/artifact audit and delivery.

Worker slice (only): src/SERVICEs/test_bridge/state_selector.js and its test;
src/SERVICEs/test_bridge/handlers/debug.js; index.js streaming plumbing only.
Run impact before edits; add red regressions, retain red output, then repair.
Do not change setConfigContextRef or other files. Stop after tests with diff,
results and deviations. No commit/push, local models, or user-data changes.
Command: CI=true npm test -- --watchAll=false --runInBand --runTestsByPath
src/SERVICEs/test_bridge/state_selector.test.js
src/SERVICEs/test_bridge/index.test.js

Parent slice: ConfigContainer effect and integration regression, API docs,
full related test suites, review, graph detect_changes, PR to dev, feature audit.
No new UI design choices. No local-model acceptance claim or fabricated PASS.

## Development checkpoint and evidence (2026-09-19)

Strong review approved the cloud gpt-5.6-terra streaming slice, removed an
implementation-mirroring export test, and requested the real producer chain
regression. The latter now drives actual setChatMessages twice, the actual
storage adapter and the registered debug handler, including chat switching.
Parent config regression uses the real ConfigContainer and installed debug
handler, exercises dark/zh-CN -> light/en -> dark/ja and cancelled async mount.

Evidence in ticket-275-evidence/:
- streaming-red.log and config-red.log reproduce the original defects.
- frontend-green.log: 7 suites, 65 tests pass (config, storage, bridge/handlers).
- electron-green.log: 3 suites, 22 tests pass (test-api commands/IPC/integration).
- Production build: PUPU_BUILD_VERSION=0.1.11 npm run build:web PASS. Initial
  attempt without the mandatory version input stopped before compilation;
  retried with the existing package version, no version bump. Compiled JS
  contains neither setConfigContextRef nor isStreamingFlag.
- i18n.json: all ten locales have 0 missing/orphan/placeholder mismatches;
  code missingInEn=0; pre-existing 58 dead keys and 43 dynamic-key blind spots.
- graph-pre-delivery.json: complete raw GitNexus detect_changes result; HIGH
  (17 symbols, seven ConfigContainer flows), no partial/truncated flags. CLI
  hides symbols after its display limit, so raw LocalBackend result was read.
  Impact consumers: preload UNKNOWN corroborated by its installer call;
  registerBuiltinCommands LOW (two direct callers). No consumer edits.
- config-app-smoke.log and config-probe.spec.txt: actual Electron with a
  temporary user-data profile and clone dev server passed dark/zh-CN and
  light/en HTTP snapshot checks after settings-service writes and reloads.
  The diagnostic probe reads the dev webpack exports; it is evidence rather
  than a permanent test. Reproduce by placing the text as e2e/*.spec.js and
  running PUPU_E2E_PORT=2945 npx playwright test that file.

Limitations: an exploratory synthetic stream injection in the real app returned
false and was not accepted as a stream smoke; it did not start an actual model
run and supplies no positive acceptance evidence. Real cloud-model streaming,
exact delivered wheel/manifest binding and package smoke remain NOT_RUN.
No runtime .py change, no sidecar restart required for the renderer fix. No local
model inference performed. No full audit PASS or cleanup until applicable
candidate-bound evidence is complete. PR remains for owner review.

Before delivery, remote dev advanced to 4d4f8668 (README and ticket-226
plan/evidence only). Fast-forwarded this ticket branch without product changes;
all tested source files are unchanged by that integration.

Final refreshed-index check (all staged files): 28 symbols, 1,068 flows,
CRITICAL, with no partial/truncated flags. Warned before proceeding. Investigation
shows 5,422 reported changed steps attributed to the *unchanged* module-local
catalogCounts constant, including Python/server and release-command flows that
do not import it; seven steps are the actual ConfigContainer flows. Zero-context
diff confirms index.js only removes the unused flag/setter and getter argument.
Full text search confines catalogCounts to the renderer debug bridge and tests.
This is recorded as over-attribution from deletion-adjacent symbol mapping, not
silently downgraded or represented as a clean low-risk graph. The raw result is
preserved in the evidence directory; independent caller inspection and the
87 passing relevant regressions plus production compilation support delivery.
