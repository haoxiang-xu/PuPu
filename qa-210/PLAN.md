# #210 packaged-App offline acceptance — QA plan (branch `claude/ticket-210-app-qa`, QA only, not for merge)

Status: **preparation only**. No build, full test, index or App was started. The candidate is **not** bound yet:
Codex is integrating the final delivery; this branch takes the final SHA/tree, wheel, manifest and sidecar as
`workflow_dispatch` inputs and refuses to run on anything else. The frozen source checkpoint
`050a4cd183fe58388919d5a574a33fb6695892f2` (clone `pupu-210`, `~/.codex/artifacts/ticket-210-start-20261107/checkpoint-03/`)
is read-only reference and is not packaged.

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

## Identity inputs (all required; the workflow validates syntax and binds before any build)
`candidate_sha`, `candidate_tree` (final delivery head from Codex), `wheel_sha256` + `wheel_run_id`/artifact name (the one Core wheel),
`manifest_digest` (`sha256:…`, compared with the producer's own `runtime_protocol_manifest()` after install), `sidecar_sha256` + its run/artifact
(the Linux `unchain-server` built from that same wheel; **not rebuilt here**), `feature_snapshot` (the exact build feature flags JSON the
delivery uses; `enable_user_access_to_agents` must be true). The frozen tree 050a4cd1 and the acceptance pair of #341 are **not** defaults.

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
| 5 | Subgraph / Hook invocation switch | Graph picker lists root + child invocations | each picker entry ↔ a Journal child invocation with temporal parent; frozen child diagram digest matches |
| 6 | Close view keeps unsaved draft | Edit B without saving, open observation, Back/Escape | editor `skeleton-save-state` "Unsaved changes" before and after; document bytes equal; undo stack length equal |
| 7 | Cold restart read-back | Stop App (owned processes reaped), relaunch same HOME, open observation | same run id/digests; Journal copy unchanged; no recovery/resume triggered (no new events) |

Failure policy: first failure is kept as-is; QA-assembly faults are corrected and the run repeated with the correction logged; a product blocker gets a minimal repro and the matrix stops there (no scope growth). NOT_RUN cells are listed as NOT_RUN.

## Not done here / out of scope
No real model API, keys, sandbox relaxation or identity-check relaxation; no local App; no Windows/macOS; no rebuild of wheel or sidecar; no merge/close/Project change. The driver `app_control_210.cjs` and `verify_app_210.py` are written only after Codex hands over the final identity (they depend on the final test ids and route shape, which are then re-read from the candidate).
