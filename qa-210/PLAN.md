# #210 packaged-App offline acceptance — QA plan (branch `claude/ticket-210-app-qa`, QA only, not for merge)

Status: **prepared, not dispatched** (CI on PR #474 is running; the heavy window is Codex's to hand over).
Bound identity (hand-over 2026-11-08): Host commit `4bfc5068260799329c142f6015229c529d8fc89a`, tree `d98a8245c462cbd216972964a9e41fd680af4d56` (vs 1c5d551a: one test file only, +3 lines, product bytes unchanged)
(branch `codex/ticket-210-close`, on dev 7475b39f; PR #474 — the PR's mutable merge ref is **not** used); canonical Core wheel from Actions run
42395251373 artifact `unchain-release-artifact` (id 13582669231), sha256 `c1213803c1b3bb58f4fc78a03b1a00f80e001d63be00c4afae53ab4d972b12ec`,
runtime manifest `sha256:c172bc02718aee771ddd4d247904f13cdaf003d3794148fd3ecd4d4e9a419e6b` (the hand-over line was truncated after
"sha256"; this digest is the producer's own `manifest_digest` read from that wheel, also recorded in its `unchain-artifact.json`).
The Linux sidecar and the App are each built **once** in the run from that wheel/commit and reused; their digests are recorded in
`test-results/sidecar-identity.txt` and `app-files.json`. Any wheel the PR CI builds is a separate identity and never replaces this pair.
The frozen source checkpoint `050a4cd183fe58388919d5a574a33fb6695892f2` stays read-only reference; its file set equals the final commit's (56 paths).

## Reused controls (copied verbatim, provenance in the header of each file)
| Purpose | Source | Copied to |
|---|---|---|
| Loopback-only namespace, disposable HOME/TMP, `env -i`, tcpdump on `lo`, pcap redaction | `claude/ticket-356-cp13-b4:tools/qa356/run_offline.sh`, `pcap_http.py` | `qa-210/tools/` |
| Packaged App launch over CDP, startup gate, process-generation ledger, cold restart, owned-process reaping | `tools/qa356/app_control.cjs` (`launch()/stop()`), `app_first_run.cjs`, `app_lifecycle.cjs` | `qa-210/tools/` |
| Real composer send (Send identified by icon, waits out `retry_wait`) | `tools/qa356/composer_send.cjs`, `enter_probe.cjs` | `qa-210/tools/` |
| Strict loopback fake provider (Ollama wire on 127.0.0.1, `auth_mode: none`, lifecycle frames for approval/cancel) | `app_control.cjs` HTTP server + `app_lifecycle.cjs` | `qa-210/tools/` |
| Journal/CAS read-back on a private copy after shutdown (`open_existing_execution_journal_readonly`, `WorkflowExecutionStore`, `validate_launch_descriptor`) | `tools/qa356/verify_app.py`, `resume_check.cjs` | `qa-210/tools/` |
| Packaging the candidate around a fixed sidecar: `mcp-runtime:prepare`, `PUPU_BUILD_FEATURE_SNAPSHOT_PATH`, `build:web`, `notices`, `electron-builder --linux dir --publish never`, `app-files.json` seal | `claude/ticket-356-cp10-app:.github/workflows/release-qa.yml` (steps "Package the actual candidate…", "Seal…") | `qa-210/reference-cp10-release-qa.yml` |
| Sealed-App restore + setuid `chrome-sandbox` kept (root 4755), evidence upload without `home/` | `claude/ticket-356-cp13-b4` workflow | `qa-210/reference-cp13-release-qa.yml` |
| Playwright fixture that attaches to the packaged executable, `playwright.config.js` without a dev server | `claude/ticket-357-app-fixes-qa:e2e/qa357/` | `qa-210/fixture/` |
| Wheel verification (`verify-unchain-artifact.mjs --installed true`), Playwright completion check (`verify-playwright-execution.mjs`) | dev `scripts/release-qa/` | used in place |

## Identity inputs (defaults = the hand-over; the workflow validates syntax and binds before any build)
`candidate_sha`, `candidate_tree`, `wheel_run_id`/`wheel_artifact`/`wheel_sha256`, `manifest_digest` (compared with the artifact evidence and
with the producer's own `runtime_protocol_manifest()` after install), `feature_snapshot_json`, `run_app_control`.
**Disclosure — build feature flags:** the release profile (`docs/contracts/memory-v2/release-profile.all.v2.json`) yields `feature_flags: {}`, so a
release-profile package hides the Agents entry entirely (all four flags default false, and packaged builds ignore stored flags). This QA
packages with `enable_user_access_to_agents:true, enable_user_access_to_characters:false, enable_custom_model_providers:true, enable_computer_use:false`
(the same QA snapshot #356 cp10 used). Whether 0.2.0's release build should enable the Agents flag is a release question for the owner, not decided here.

## Serial hosted Linux flow (one `ubuntu-latest` job, one App, loopback only)
1. Validate inputs; check out `control` (this branch) and `candidate` (the SHA); assert `HEAD == candidate_sha` and `tree == candidate_tree`.
2. Download the wheel and sidecar artifacts; verify bytes; install the wheel into the runner Python (harness reader only); record the imported manifest digest.
3. `npm ci` (locked), Playwright deps, xvfb/dbus/gnome-keyring/tcpdump.
4. Package once: feature snapshot → `build:web` → `notices` → place sidecar → `electron-builder --linux dir --publish never`; hash every packaged file (`app-files.json`) and upload the sealed App before running it. Candidate tree asserted unchanged after packaging.
5. Keep the packaged `chrome-sandbox` setuid root; bind `QA_APP`.
6. `run_offline.sh app`: `unshare --net`, `lo` only, `env -i`, disposable HOME (userData follows HOME), tcpdump on `lo`, `dbus-run-session` + unlocked gnome-keyring; `xvfb-run node qa-210/tools/app_control_210.cjs` then `python verify_app_210.py` on a private copy of the Journal.
7. Redact the pcap (auth header values hashed, raw pcap deleted), upload `test-results/**` minus `home/**`.

## Acceptance coverage → harness steps → evidence binding
Every cell binds three things: (a) the **real observation response** — the Main→sidecar `GET /skeleton_runs/observation` reply captured on `lo` (pcap → `requests-redacted.json`) and/or returned through `window.unchainAPI` in the page; (b) the **Journal** read on a private copy after shutdown (events, receipts, launch descriptor); (c) the **page** (`skeleton-run-observation-view`, `run-observation-graph-picker`, `run-observation-graph-state`, `run-node-state-<node_id>`, `run-observation-skipped`, `run-observation-error`) and the **frozen document** of that launch. A text count on the page is never the verdict.

| # | Required coverage | Harness steps | Bound evidence |
|---|---|---|---|
| 1 | Real chat run, then open the run canvas | Seed Agent (+ embedded Hook / subagent child) through the real v2 bridge (**disclosed**: Store seeding, not UI authoring); real composer send; provider = loopback strict fake; Agents → Run menu → "View current chat run" | observation `run.graphs[0]` node projections ↔ Journal node receipts ↔ `run-node-state-*` text/ring per node; `execution_id` = latest assistant `meta.executionSessionId` |
| 2 | Completed vs waiting-approval | Turn 1 completes; turn 2 parks on a tool approval (Approve/Reject card) | completed node `succeeded`; approval node `waiting_approval` with exact interaction id in Journal; no receipt yet |
| 3 | Approve → resume; cancel → state | Approve in chat, re-observe; new turn parked, Stop/Cancel, re-observe | receipt recorded → waiting/ready then succeeded; cancellation only on authoritative Journal cancellation; observation never mutates (fingerprints of revision/event/watermark equal before/after reads) |
| 4 | Old run A vs edited B | While A is waiting, edit and save B in the Builder; observe A; resume A; new run uses B | A's frozen digest ≠ B's; A view unchanged after B save; next launch descriptor digest = B |
| 5 | Subgraph / Hook invocation switch | Graph picker lists root + child invocations: workflow-tool child (approval chat) and embedded subagent child (parent chat); the driver switches to the second entry and reads its state | each picker entry ↔ a Journal child invocation (`parent_graph_id`, `caller_node_id` = kernel); **Hook invocation: RUN** — `QA210 Hook Agent` carries Codex's verified seed (`qa-210/tools/hook-seed.json`, receipt `REAL_STORE_EMBEDDED_HOOK_ATTACHMENT_ACCEPTED` in `ticket-210-close-20261107/hook-seed/`): before_tool_call on `workflow_mutate` → embedded owned Workflow answers continue → the workflow-tool child parks on approval; picker shows root + Hook child + Workflow child, each switched and bound |
| 6 | Close view keeps unsaved draft | Edit B without saving, open observation, Back/Escape | editor `skeleton-save-state` "Unsaved changes" before and after; document bytes equal; undo stack length equal |
| 7 | Cold restart read-back | Stop App (owned processes reaped), relaunch same HOME, open observation | same run id/digests; Journal copy unchanged; no recovery/resume triggered (no new events) |

Failure policy: first failure is kept as-is; QA-assembly faults are corrected and the run repeated with the correction logged; a product blocker gets a minimal repro and the matrix stops there (no scope growth). NOT_RUN cells are listed as NOT_RUN.

## Driver and verifier (QA corrections applied 2026-11-08: raw bridge reply is `{schema, run}`; node state read from the state element's own `aria-label` + `data-run-state`; every observation's before/after watermark equal and the last observation per execution equals the Journal maximum; every graph bound to its frozen plan/diagram with exact per-node state+phase derived from the Journal record and the chat's pending snapshot — no state sets, no waivers)
`qa-210/tools/app_control_210.cjs`: workspace via the real Workspaces editor → seed (disclosed) workflow `qa210-workflow` (start→write[approval]→code→end) + Agents `QA210 Approval Agent`, `QA210 Cancel Agent` (CoreToolkit write + workflow tool), `QA210 Parent Agent` (embedded `Reviewer Agent`) → approval chat turn 1 parks → Builder: rename kernel (dirty) → View current chat run (2 graphs, switch) → Back (still dirty, title kept) → Save B → observe A again (digest/watermark unchanged) → Approve → observe completed → turn 2 → observe B digest → cancel chat (observe waiting, Stop, observe cancelled) → parent chat (observe 2 graphs, switch to child) → cold restart → observe parent again (deep-equal to hot). Every observation records page nodes (`run-node-state-*` text + aria), picker/caption presence, and the bridge response before/after.
`qa-210/tools/verify_app_210.py`: private Journal copy → for each observation: launch descriptor validated, `definition_digest == execution_definition_digest(plan)`, manifest digests == QA_MANIFEST, per-node states vs `WorkflowExecutionStore.load().state` (completed→succeeded, active waiting→waiting/waiting_approval, cancelled, unseen→pending), status/root_committed, child `parent_graph_id`/`caller_node_id`, A/B document identity (waiting/completed = seeded A ≠ saved B; turn 2 = B), cancelled state, hot == cold. The pcap (`requests-redacted.json`) is kept as the independent HTTP-level copy of the same GET replies.

## Not done here / out of scope
No real model API, keys, sandbox relaxation or identity-check relaxation; no local App; no Windows/macOS; wheel not rebuilt; no merge/close/Project change; Hook invocation covered through Codex's seed (above).
