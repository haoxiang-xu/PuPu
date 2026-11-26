# #484 — remaining UI delivery, 2026-11-25

- Ticket: https://github.com/haoxiang-xu/PuPu/issues/484
- Release parent: https://github.com/haoxiang-xu/PuPu/issues/208
- Delivery clone: `/Users/red/Desktop/GITRepo/pupu-484-delivery`
- Branch: `issue/484-agent-builder-ui`
- Base: `dev` at `86d60bc2328d01d65e5a05023efe40405961b0e0`

## Goal and provenance

The project owner asked to organize, commit and push the remaining #484 UI work,
and open a PR to `dev`, before filling the remaining acceptance gaps. Preserve
the original dirty main checkout, the original #484 worktree, and the immutable
November 24 desktop evidence. No new design, runtime contract, provider behavior,
release version/tag, merge, ticket closure or release GO is included.

PRs #487, #489 and #490 have already delivered the large UI redesign. The old
main checkout is not a branch patch: 114 of its source/document changes already
match current dev and 107 are divergent alternatives. Of the original #484
worktree's ten dirty tracked files, eight already match dev; its two normal
untracked test files also exist in dev. Its remaining Test-panel differences
would remove existing confirmed-state/trace-disclosure behavior and three
regressions. Do not port those reversions or editor temporary files.

Only the two demonstrated November 24 findings are carried forward:

- D01: switching the explorer's resource can silently discard an unsaved draft.
- D02: the Hook card calls a stored embedded Workflow “no Workflow”.

Prior evidence is scoped to a dirty frozen source/Electron snapshot, not this
committed candidate or a packaged app. The two production fixes and applicable
regressions are integrated minimally into current dev, never by replacing the
whole older source file. Existing newer UI, legacy removal and runtime fixes stay.

## Investigation and impact

Index: GitNexus 1.6.12, `pupu-484-delivery`, this exact independent clone at the
base above; index-only, two workers, no embeddings/model execution.

Graph query/context found `RecipesPage` resource navigation and `HooksPoolNode`
workflow-summary flows. Exact upstream impacts for both components and the three
regression test files are **UNKNOWN**: no JSX/React callback callers resolved. This is not a
LOW risk verdict. Text corroboration identifies `agents_modal_content.js` as the
page importer and `skeleton_canvas.js` as the Hook card importer/JSX consumer.
The affected real paths are explorer select/create → active resource/draft,
and stored Hook source → read-only canvas summary. Preserve newer Test-panel,
backend, admission and provider code. Index warnings about capped callable
resolution/process enumeration remain limitations; absent paths are not proof
of non-use. Retained raw query/context/impact files are in the task artifact
directory `ticket-484-delivery-20261125.wjiIRg` outside this clone.

Final current-content index: 57,755 nodes, 203,882 edges and 1,220 enumerated
flows. Both complete raw `detect_changes(scope="all")` and
`detect_changes(scope="compare", base_ref="origin/dev")` report **CRITICAL**:
17 files, 24 symbols, 18 affected flows. Preserve that raw verdict. Returned
symbol/process counts match their totals and no IDs are empty. GitNexus 1.6.12
only emits `partial`/`truncated` when true; neither flag is present in either raw
result. This verifies the returned change-analysis payload, not complete
whole-program flow coverage: the index's global enumeration/resolution caps
above still apply. The human CLI abbreviates lists, so raw backend results and
all 18 chains (103 steps, 85 adjacent call-edge pairs) were retained separately.

Independent graph/source calibration, without downgrading CRITICAL:

- Seven real `RecipesPage` chains reach GetWindowBridge, PanelMaxWidth,
  ClampSideMenuWidth, Cleanup, HasLocalStorage, NormalizeWidth and
  FrontendApiError. One real Hook chain reaches `hooks_list → has → record`.
  These are existing window-listener, width/settings and read/display
  dependencies; their calls are unchanged by this patch.
- Nine reported Hook chains contain a false `property-dispatch` edge
  (confidence 0.7): `subscribe_workflow_versions → add/Add`. In
  `workflow_versions.js`, line 20 declares lexical `listeners = new Set()` and
  line 87 calls `listeners.add(listener)`. It does not call the unrelated
  workflow-tools handlers or icons that those chains select. The downstream
  Markdown, Electron logging, test commit and width paths are disconnected by
  that proven wrong edge.
- The remaining `RecipesPage → Map` chain similarly maps
  `PANEL_KEYS.map(...)` in `recipe_panel_widths.js:70` to the `Map` icon at
  confidence 0.7; the source receiver is the existing array.
- The new real local edges `requestSkeletonResource → openSkeletonResource`
  and `HooksPoolNode → hook_embedded` are present. JSX callbacks remain a
  graph limitation, independently corroborated by source and page regressions.

The risk ladder ranks any result above 15 enumerated flows CRITICAL. The eight
real chains still matter; the analysis and complete tests are evidence for
review, not a reason to replace the raw rating with LOW or claim a full runtime
acceptance. No actionable blocker was found in the independent code/graph review.

## Decisions and execution

1. Add current-dev regressions before changing product code. D01 must fail by
   navigating without confirmation; D02 must fail by labelling an embedded
   Workflow as absent. Preserve red logs.
2. Use the existing shared builtin `ConfirmModal` and already-approved copy.
   Cancel preserves the current draft/history; reselecting a dirty current
   resource is a no-op; explicit Discard switches without saving. Check the
   current resource at confirmation so a stale dialog cannot own another visit.
3. Use the existing strict `hook_embedded` reader, not a new wire parser. Show
   an authored name raw, a translated own-Workflow fallback when unnamed, and
   keep missing/malformed/pinned cases distinct. Never mutate stored Hook data.
4. Bring only the two new explorer messages into every supported locale. Reuse
   the current layout/layer tokens; do not reintroduce older literal corners.
5. Run focused tests, then the frontend suite once serially. Do not run heavy
   indexing, builds and tests concurrently on the 18 GB host. Backend/Electron
   protocol code is unchanged by this slice.
6. Run complete raw GitNexus all/compare analysis and independent diff review
   before the delivery commit. Push the existing branch normally; create/read
   back a PR whose base is `dev`. Do not auto-merge or mark the ticket Done.

Weaker-model suitability: **not suitable for the branch/source consolidation**:
several snapshots overlap already-merged work and wholesale transfer would
restore removed behavior. The strong primary agent retains reconciliation and
implementation. Independent agents perform bounded read-only inventory/test
planning and final review; no weaker implementation is claimed. No new visual
options are needed: reuse the owner-reviewed November 24 UI and current builtins.

## Boundary and state contracts

### BC-484-001 — draft navigation and persistence ownership

Producer: Agent Explorer select/create callbacks (`id`, optional new-draft
factory result). Consumer: `RecipesPage` active-resource state, then the existing
`SkeletonResourcePage`/resource API. Admission is **CLOSED** local intent:
`{fromId, id, draft}`; no new HTTP/IPC/schema fields or store methods. The current
resource identity owns its dirty flag and pending navigation. The confirmation
may switch only if its originating resource is still current. Cancel and
same-resource reselect must not reset the draft or perform a save/read; discard
uses the existing resource-loading path and does not manufacture saved state.

SEQ-484-001: saved A → edit A → select B → cancel → A draft/history unchanged →
reselect A → unchanged → select B → explicit discard → load B → reopen A → last
acknowledged A remains. Repeat cancel/reselect and check zero unauthorized writes.
Additional sequence: new unsaved A → create B → cancel/confirm; no resource is
silently persisted by navigation. Cold restart preserves acknowledged stored
definitions, not a new claim of crash-durable unsaved drafts. #459 owns the
remaining save/CAS/interruption matrix.

AC-484-001: real page/Explorer regression for cancel, same-id reselect and
discard; exact API call count and saved-document/token invariants. AC-484-002:
clean saved navigation still works, and creation uses the same protection.
New-candidate native desktop and exact deployed artifact-pair evidence remain
**NOT_RUN** until the subsequent acceptance phase; older source UI evidence
does not certify this candidate.

### BC-484-002 — stored Hook source to read-only card

Producer: existing stored Hook `workflow` source, **VERSIONED** by the already
admitted Skeleton runtime contract. The existing `hook_embedded` helper accepts
only the closed `{kind: "embedded", document}` wrapper. Consumer: Hook card
text/tooltip. Projection: embedded document's nonblank string name, otherwise
the localized own-Workflow label; pinned sources retain cached revision/name or
ID fallback; absent/invalid sources retain existing no-Workflow behavior. Raw
authored names are text, never localization keys. The card does not alter
enabled/order/source or turn a summary into runtime admission.

AC-484-003: disabled named and unnamed embedded entries, absent source,
malformed wrapper, raw key-looking/Unicode names, locale and unchanged serialized
node. Read/render → rerender must not fetch an embedded revision or write data.
No schema/allowlist/admission change and no new deployed runtime capability.

## Verification and remaining release work

Initial source UI findings/retest: external `ticket-459-ui-20261124/REPORT.md`
and `ticket-459-ui-retest-20261124/RETEST.md`. They retain the original failures,
the scoped retest PASS and the untested cells. Do not sum overlapping test runs.

Red regression run: two suites failed with three expected D01/D02 failures and
14 passing tests before production edits. The first full frontend run completed
681 passing suites and one failing suite: its existing Workflow-to-Agent test
still assumed a new unsaved Workflow could be silently replaced. The updated
test requires the confirmation, verifies the Workflow stays current and no save
occurs, then explicitly discards and retains the original Agent-creation
assertion. No test is skipped or removed. Final focused run: **six suites,
76 tests passed**. The complete locale audit found zero missing/orphan keys,
placeholder mismatches or missing static English keys across all 11 locales.
Independent code review, including the adjusted Workflow test, found no
actionable blocker. Final full run:
`CI=true NODE_OPTIONS=--max-old-space-size=4096 npm run test:frontend -- --runInBand --forceExit`
passed **682 suites, 10,869 tests**, with five existing skips (186.361 seconds).
The initial full run left Jest's existing async handles alive after all suites
finished; only this task's completed test process was stopped. The final run
uses `--forceExit` for that teardown issue; no test failures are ignored. Logs
retain both red and green runs; overlapping runs are not added together.
No real sidecar, app, provider or local model was launched for these tests.
Original-checkout verification compared both HEADs and all 238 captured file
hashes; both original workspaces remain unchanged. Complete graph change
analysis is recorded below before commit; frontend success alone is not the
native acceptance result.

After this PR, freeze the exact delivered PuPu plus retained Unchain wheel and
prove actual consuming imports/manifest before #459 native acceptance. #458
live integrated Agent 10, remaining providers/long runs and their failure
diagnosis are separate; no local model, paid retry or additional API budget is
authorized by this UI delivery. Formal release Candidate/Qualification/Stage/
Publish need their own exact inputs and phase confirmations.

### Next acceptance sequence

| Scope | Next evidence | Status for this delivered candidate |
| --- | --- | --- |
| Exact consumer pair | Pin final PR commit/tree plus one retained wheel, prove actual sidecar imports/module bytes and strict manifest | NOT_RUN |
| #484 native D01/D02 | Normal UI cancel/reselect/discard/create and embedded/pinned Hook summaries; inspect stored tokens and zero unauthorized saves | NOT_RUN; old snapshot evidence stays separate |
| #459 persistence | Bounded save-in-flight edits, late A reply after visiting B, failed-save recovery and real CAS conflict, with UI/API/SQLite oracle | INCOMPLETE |
| #459 broader UI | Model metadata selection, code scrolling/key isolation, window/panel limits and seeded mixed editing | INCOMPLETE |
| #458 integrated/live | Obtain Agent 10 raw trace before diagnosing first handler error/root End absence; plan smallest authorized provider retest | INCOMPLETE; no paid/local model runs here |
| Release packages | Formal Candidate seals one runtime wheel; Qualification reuses exact installers for fresh install and native restart/update targets | NOT_STARTED |

The runtime inventory is important for the next row, not a reason to mix
artifacts: current observed Unchain dev is
`4276d71a811c1229915843bed60c5b3273dd74a4`. The old native B wheel
`95217c1e543d30fe465821780e57152542a6d378e94b5a39f0765d53853f698a`
was built from `9af29599b4e93f36eb2b93fefd1abb51907dfff9`. PR #490 QA
run `45459333876` also retained a distinct wheel from `9af2959`, not current
dev. No current-dev wheel/evidence pair was found in the bounded local inventory.
The intervening kernel/durable-approval code differs even though the protocol
manifest digest can stay the same. Select/build once, retain it, and use that
exact artifact for new acceptance; neither old wheel nor matching manifest alone
certifies the current runtime. This PR's frontend tests use API fixtures and do
not assert a runtime-dependent PASS.

Result: the bounded UI delivery is implemented, regression-tested and reviewed
for a PR to `dev`. Native acceptance, full feature audit and release
certification remain incomplete; no such PASS is asserted by this plan.
