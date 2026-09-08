# Windows Memory V2 — Checkpoint 2 independent review, 2026-09-07

## Verdict

**Latest continuation:** see the takeover record at the end. Real packaged chat, history across restart, two cold interaction recoveries, ordinary production-run writes, and cross-store deletion now have supporting runtime evidence. Installed-pair qualification remains INCOMPLETE.

**Candidate build and packaged startup PASS; Checkpoint 2 INCOMPLETE.** No new production regression was demonstrated this round. Checkpoint 1 remains accepted. The latest Mac handoff explicitly completes preparation for step 5, not steps 5–7 or the installed behavior matrix.

On Windows, this review built the fixed wheel, sidecar, frontend and unsigned NSIS installer. A real packaged Electron process using an isolated profile returned:

```json
{"memoryV2.ready":true,"windowsCapability.status":"ready","platformActiveBlocked":false,"featureCeiling":"all","rolloutMode":"all"}
```

This closes the packaged startup capability question for these bytes. The process was launched from `win-unpacked`; it is supporting evidence, not an installed-pair qualification or proof of chat persistence/recall. The original `production_runs_v1/objects` PermissionError has not been reproduced or cleared through actual candidate chat writes this round.

## Exact candidate and evidence

Local evidence root: `F:/GIT/PuPu/.release-qa/windows-memory-v2-active/20260907-9aeb9302/`. This directory name is descriptive; the following hashes establish identity.

| Item | Identity |
|---|---|
| PuPu | `9aeb93020e2a4f7c50736520f447241c8f997d8d` |
| Unchain | `0680312b92d6856b2271302c23b9279a6b85c546` |
| Once-built wheel SHA-256 | `29d009ae7e83a71f661da19d0dea9022e8d93f7c5df6dae0e0f464f11621fb8f` |
| Manifest digest | `sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc` |
| Sidecar SHA-256, before and after packaging | `050ff10c88ff7411ed4b0483c508f97b48b483484d7349a4d26ad656c2caa1bf` |
| Installer SHA-256 | `a0bee8efcd3874dfb3abe2fbe9b623b30b42efc77aa0fe144079b3c85708dd5a` |
| app.asar SHA-256 | `0d19775900c95f34c6aac39213ae5a015651158eb23e54582ab2616e64239d84` |
| Input feature snapshot SHA-256 | `8c2bda24ef20d52af2c80b904426e37dbd23d1a1e572ecfc0b68e1a723cc2204` |

Installer: `electron/PuPu-0.1.11-windows-x64-setup.exe`, 376973334 bytes, Authenticode `NotSigned`, local qualification only. `candidate-build-evidence.json` records hashes and the embedded identity/snapshot extracted from app.asar. `verify-candidate-bytes.cjs` verified the embedded wheel/sidecar identity and snapshot, exit 0.

## Executed checks

All paths below are relative to the evidence root unless identified as repository scripts.

| Check | Result and evidence |
|---|---|
| Unchain CRLF fixtures | Tracked original LF bytes restored without deleting the directory; 3 previously affected digest cases passed. `.gitattributes` fix confirmed; Unchain tree clean. |
| Fixed artifact | `build-unchain-artifact.mjs`, exit 0, `wheel-build.log`, `unchain-artifact/unchain-artifact.json`. No wheel rebuild. |
| Sidecar | `npm run build:unchain:win`, exit 0, `sidecar-build.log`; isolated `build-venv`, fixed artifact and evidence env, installed wheel verification passed. |
| Context V2 contract | `run-context-v2-contract.mjs`, exit 0: Unchain 71, adapter 24 (+3 subtests), strict Node fake 2 passed; `context-contract.log`. |
| RunBundle contract | Python 63 + 31 (+2 subtests), pricing 14 passed. Original runner then failed at Windows Jest launch, before Electron tests; see below. |
| Same RunBundle JS test selections | Electron 36 tests / 3 suites; renderer 216 tests / 6 suites; both exit 0 and nonzero JSON execution checks passed. `run-bundle-{electron,renderer}.{json,log}`. |
| Native Windows containment | Native probe and independent verifier exit 0, verifier count 4; `native-probe.json`. Parent mode is dev; this is not installed-parent evidence. |
| Fixed onefile supervisor | Packaged supervisor probe and independent verifier exit 0, verifier count 3; `sidecar-supervisor-probe.json`. READY, protocol rejection, Job drain. |
| Frontend and notices | `npm run build:web` and `npm run notices:check`, exit 0. `web-build.log`. |
| NSIS package | electron-builder win/x64, publish never, exit 0; packaged MCP runtime hook passed; `electron-build.log`. Local npm collector reported existing invalid dependency versions; package generation nevertheless completed. No clean dependency installation was performed, so this is local runtime evidence, not a clean-build reproducibility claim. |
| Real packaged startup | `node .../probe-packaged-app.mjs`, exit 0. `packaged-app-status.json`, `packaged-app-probe.log`, `packaged-app.log`. Real preload status through local CDP, isolated `隔离 profile`, no provider call. Candidate process tree stopped; no PuPu/unchain-server candidate processes remained. |

Build used `PUPU_VERSION_PREPARED=1` to preserve version 0.1.11. The canonical `createBuildFeatureSnapshot` helper generated a private all/all snapshot, passed through `PUPU_BUILD_FEATURE_SNAPSHOT_PATH`; public `.local/build_feature_flags.snapshot.json` was not changed. **Environment-only rollout overrides do not alter a loaded build snapshot** (`build-web.cjs` passes an empty override object when a snapshot exists). Future execution must preserve the candidate snapshot and use the same wheel, not rerun the full build chain casually.

## Confirmed runner issue and installation constraint

`scripts/release-qa/run-run-bundle-contract.mjs:162` runs Node on `node_modules/.bin/jest`; this Windows checkout contains a shell shim there, so Node fails at `basedir=$(...)`. The renderer stage has the analogous `.bin/react-scripts` path. No production behavior failure follows from that parse error.

The local `run-bundle-windows-entrypoints.mjs` preserves the exact matrix file selections and arguments, substitutes only `node_modules/jest/bin/jest.js` and `node_modules/react-scripts/bin/react-scripts.js`, and checks nonzero execution with the repository helper. Both stages passed. The tracked runner remains unfixed; do not report its original full invocation as PASS. A portable CLI-entrypoint correction is the small remaining script repair.

The existing NSIS installer uses the same app identity as the user's installed PuPu. `node_modules/app-builder-lib/templates/nsis/installSection.nsh:52` invokes `uninstallOldVersion`, whose implementation resolves the old installation via registry. Merely supplying `/D=<private path>` does not isolate that uninstall. This review therefore did not execute the installer against the current account. Use an isolated Windows account/VM for actual installation and retain this exact installer; do not count unpacked launch as installed evidence.

## Remaining work, unchanged plan scope

Follow the existing implementation plan steps 5–7 and its BC/SEQ/AC identifiers; no new checkpoint or source refactor is requested.

1. **Step 5 / BC-001, BC-003 / SEQ-001:** install this exact NSIS candidate in an isolated Windows account/VM; bind installation evidence to the installer, installed app/sidecar bytes and fixed wheel. Repeat real startup and supervisor verification from that installation.
2. **Step 6 / BC-002..006 / AC-007..012:** deliver and execute the existing planned installed harness: three sinks through real Vault, lifecycle/failure matrix and 100 mixed cycles; local deterministic provider; normal/graph/subagent, first/second messages, interactions, retry/resume/restart, loss/deletion. Include actual `production_runs_v1/objects` chat writes in a path containing spaces/non-ASCII, which is the outstanding H4 evidence. Record each applicable cell, not only ready status or unit-test counts. All are NOT_RUN against an installed pair this round.
3. **Step 7:** record executable enable/rollback instructions and final evidence index. Keep daily app in its existing state until CP2 passes. The private Active startup performed here is not daily rollout.

The next implementation work is the installed harness and its execution, plus the small Windows runner correction. Previously accepted K1–K4 are not reopened by this review.

No production code, daily data, installed application or public profile changed; no commit or public publication. A scoped stash named `codex preserve Windows K4 pass review before phase2 20260907` preserves the pre-pull review document/process test. Both repositories were clean after builds; this review document is the only new tracked-scope working-tree file. Build/evidence files are ignored. GitNexus index was stale; no complete fresh graph check is claimed. No existing production symbol was edited.

## Takeover continuation — 2026-09-07

User asked Codex to take over remaining execution if production changes were unnecessary. The same fixed wheel/sidecar/app was reused; no production code or tracked test runner changed. The following new local harnesses live under the evidence root. They launch the actual packaged app with private profiles containing Chinese characters and spaces, use the real preload/IPC/HTTP/provider path, and shut down the exact candidate process tree. They do not automate the composer UI and do not replace installed-pair evidence.

| Existing acceptance area | Actual result | Evidence / command (from repository root) |
|---|---|---|
| AC-010/011, same-chat history and isolation | Four requests completed: first, second, separate chat, and continuation after whole-app restart. Provider input contains `apricot-742` on first/second/restart and does not contain it in the separate chat. This is context-history continuity, not a claim that formal long-term memory promotion occurred. | `node .release-qa/windows-memory-v2-active/20260907-9aeb9302/probe-packaged-chat-v2.mjs`, exit 0; `packaged-chat-v2-{probe.log,evidence.json}`. |
| H4 / ordinary production ownership | Four ordinary requests with `memory_v2_requested=false` completed, including restart. Actual `production_runs_v1/run_ledger.sqlite3` and 12 object files were created. The database reports integrity `ok`. The original PermissionError did not recur in this clean profile; this does not establish the historical cause or repair of the old Roaming profile's ACL. | `node .../probe-packaged-chat-off.mjs`, exit 0; `packaged-chat-off-{probe.log,evidence.json}`, `chat-database-integrity.json`. |
| AC-010/011, consecutive interactions and cold recovery | One actual default developer graph execution asked twice. At each awaiting-response state the entire app process tree was killed. Each fresh launch recovered the same interaction, accepted an answer, and accepted its exact duplicate with the same durable receipt ID. Explicit resume reached the second question, then final completed state. Exactly three local provider calls in total; no call replay from duplicate answers. | `node .../probe-packaged-interactions-v2.mjs`, exit 0; `packaged-interaction-v2-{probe.log,evidence.json}`. |
| AC-007..009, normal ready-state deletion | Two real requests produced separate Context stores. Synthetic secrets were deposited through the real Vault bridge. Deleting only `cp2-delete-a` via chat storage resulted in outbox `complete`, `context_done=1`, `vault_done=1`, zero retries. Its execution disappeared; `cp2-keep-b` and its Vault descriptor remained. Both databases have integrity `ok`. | `node .../probe-packaged-delete.mjs`, exit 0; `packaged-delete-{probe.log,evidence.json}`, `deletion-database-evidence.json`. |

The local fake provider used loopback HTTP and a synthetic fixture key; there was no real-provider usage. The interaction harness builds deterministic Responses tool outputs using the existing fixture's envelope/SSE producer. `source_run_id`, session identity and restored resume options were taken from the actual pending-interaction API; no receipt, graph authority or capability was fabricated. Private fixture credentials were re-supplied on explicit resume because persisted resume options correctly omit them.

Harness bring-up attempts are retained separately and are not product failures: the first chat harness incorrectly changed execution/session ID between messages of one chat; the corrected version follows the frontend's stable thread ID. The first interaction harness omitted `session_id` from a cold receipt request and watched a nonexistent wire interaction event; the corrected version polls the documented pending API and supplies the session ID. Only the successful `v2` evidence is used above. All completed candidate process trees were checked absent afterward.

Remaining scope has not changed: real NSIS installation on isolated Windows, installed parent/three-sink lifecycle and 100 mixed cycles, remaining subagent/graph/failure/rollback cells, and final enable/rollback instructions. The successful graph case above covers repeated questions in one default graph step, not every graph topology. Normal ready-state deletion does not cover lost/offline/rollback deletion cells. The native one-time secret-use dialog is part of the real sink path and has not been bypassed for automation.

Environment discovery: `WindowsSandbox.exe` is unavailable; only the user's existing local profile and Public are present; current process has a medium-integrity token with Administrators deny-only. No Windows feature was enabled, account created, registry installation state hidden, or old PuPu installation replaced. An asynchronous question asks the user for an available isolated Windows test environment. Work depending on actual installation remains pending that environment, not a request for further speculative source repairs.

## Repository handoff and read-only ACL capture — 2026-09-07

The owner explicitly requested commit and push of the review and successful probe sources. The four behavior probes and byte verifier are now maintained under `scripts/release-qa/`; the initial startup-only probe, failed bring-up variants, temporary RunBundle entrypoint wrapper, local JSON/logs, and candidate binaries are not part of this commit. Historical local scripts remain with their evidence for traceability.

```powershell
$candidateDir = 'F:/GIT/PuPu/.release-qa/windows-memory-v2-active/20260907-9aeb9302'
node scripts/release-qa/verify-candidate-bytes.cjs $candidateDir
node scripts/release-qa/probe-packaged-chat-v2.mjs $candidateDir
node scripts/release-qa/probe-packaged-chat-off.mjs $candidateDir
node scripts/release-qa/probe-packaged-interactions-v2.mjs $candidateDir
node scripts/release-qa/probe-packaged-delete.mjs $candidateDir
```

Relocation changes: imports resolve through `../test-api/`; the candidate directory is an explicit argument instead of a machine-specific constant; each probe creates and prints a fresh evidence directory below that candidate root so reruns cannot reuse old profile state or overwrite earlier reports. The verifier checks the frozen hashes listed above in addition to cross-file consistency, then writes to a fresh `candidate-byte-check-*` directory. These remain **unpacked supporting probes**, not the future installed-parent/sink fault harness. No runtime guard or candidate payload was changed. The test-script commit is newer than candidate source `9aeb9302`; `package.json`'s build `files` excludes `scripts/` and documentation, and no rebuild is requested.

NSIS isolation clarification: this candidate's build output states `oneClick=true perMachine=false`. A separate local standard Windows account provides an independent HKCU installation scope for the existing installer identity. The `installMode == "all"` extra uninstall branch is not the per-user path. A VM is therefore not required; retain the exact installer and appId. The project owner will provide the test account/environment; no account or installation was changed during this review.

### H4 ACL evidence

Executed read-only, exit 0:

```powershell
icacls "$env:APPDATA\PuPu\production_runs_v1\objects"
```

Observed on `C:\Users\Haoxiang Xu\AppData\Roaming\PuPu\production_runs_v1\objects`:

```text
RedPC\CodexSandboxUsers:(I)(OI)(CI)(RX)
NT AUTHORITY\SYSTEM:(I)(OI)(CI)(F)
BUILTIN\Administrators:(I)(OI)(CI)(F)
REDPC\Haoxiang Xu:(I)(OI)(CI)(F)
Successfully processed 1 files; Failed processing 0 files
```

The target is an ordinary directory, with no link target. Exact command output is retained locally as `daily-objects-acl.txt`. No ACL, inheritance, owner, file or directory content was changed.

Interpretation: the named daily user has a full-control ACE; the sandbox group has only read/execute. This is useful evidence of differing access grants, **not proof that the original failing PuPu process ran with a restricted token**. A root-cause classification still requires the failing process identity/restricted-token context and the relevant ACL at that time. Do not infer a current deny ACE or alter permissions from this listing. Repeat the ordinary chat write probe against the same candidate after installation in the provided standard account, while preserving this daily-account evidence.

### Promotion validation

All five relocated entrypoints were run against the original candidate and exited 0. The four behavior reports have `completed=true`; provider-input history/isolation was independently rechecked on the relocated chat probe's output. Evidence directories below the candidate root:

- `probe-packaged-chat-v2.mjs-MXVeR2`
- `probe-packaged-chat-off.mjs-pjqDjF`
- `probe-packaged-interactions-v2.mjs-f5CyyH`
- `probe-packaged-delete.mjs-XLnjDB`

Invocation logs are `promotion-<script-name>.log` and `promotion-verify-candidate.log`. No candidate processes remained after completion. No wheel, sidecar, installer, snapshot or app.asar was rebuilt or edited.

GitNexus pre-edit impact for the five ignored source paths returned UNKNOWN/not found, not LOW. Text inspection confirmed they had no production imports/callers and are standalone manual entrypoints. PuPu's index was refreshed at candidate HEAD `9aeb9302`; pre-commit `detect-changes --scope all --repo .` returned 6 files, 193 mapped symbols, 0 reported affected flows, LOW, exit 0, with no partial/truncated warning from change detection. This is not a claim of exhaustive repository flow coverage: the index build reports general call-fanout/process caps and skips two oversized, unchanged runtime source files. Packaging exclusion and byte verification independently establish that this script/document handoff does not change the frozen runtime payload. Raw analysis and change-check logs remain local as `probe-promotion-gitnexus-{analyze.log,detect.json}` (the latter contains CLI text).

At the handoff validation point the remote branch still had the original POSIX-shim RunBundle runner. Its original invocation is **not newly marked PASS**. After Mac pushes the portable runner, fetch it, record its newer runner revision separately from candidate source, verify the diff is test scripts/documentation only, and rerun `run-run-bundle-contract.mjs` with the same wheel/evidence. Do not commit the local workaround or rebuild the candidate for that runner change.
