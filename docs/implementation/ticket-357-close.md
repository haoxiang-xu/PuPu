# #357 delivery and acceptance

Ticket: https://github.com/haoxiang-xu/PuPu/issues/357; direct Release #208.
Host delivery clone: `/Users/red/Desktop/GITRepo/pupu-357-delivery`, branch
`codex/ticket-357-delivery`, remote dev base `4ad9d7bc67dc2918ab16c9562fab1cab4d2a4695`.
Core dependency clone: `/Users/red/Desktop/GITRepo/unchain-357-delivery`, same branch
name, remote dev base `74106d668bb1266a024baf96aa526a9e57cf0be1`.
Evidence: `/Users/red/.codex/artifacts/pupu-357/close-01-20261031/`.

## Goal and settled decisions

Deliver and close this ticket only: Code source/configuration, immutable Workflow
calls and Hooks Pool authoring/execution. Reuse the existing selected designs and
direct plans; no new UI design or runtime fallback is introduced. Draft persistence
is separate from run admission. Start whole-object bindings may have explicit extra
input names, as already accepted for R-WFC-03. Hooks fail closed; no fail-open control
is part of the later canonical contract. A hook's editable stable id is its name.

All frozen workspaces, patches, reports and guards remain read-only. New integration
must preserve the delivered #351/#352 behavior and unrelated current dev fixes.
Do not replace dev with an old cumulative tree. Do not launch local App/Main,
change account isolation, contact providers, use real credentials or relax Chromium
sandboxing. Local heavy work is one process family at a time, bounded to 4 GiB.

## Ordered checkpoints

1. **Dependencies and input integrity.** Verify final import UI `dfe32949`, pinned
   Workflow view `049c0854`, existing Code/G1/Workflow/Hooks checkpoints and their
   superseding receipts. Integrate only necessary Core changes: no-bytecode Python
   launch, hook enable/tool sets/embedded Workflow, denial-preserving after hooks,
   and embedded draft diagnostics. Preserve every existing protocol feature.
   Run graph impact before edits and directed source regressions before a dependency
   PR. The dependency is not #357 acceptance.
2. **Host/UI composition.** Replay missing #357 changes from the frozen inputs onto
   current dev, retain current fixes in shared files, finish actual remaining UI
   reachability (including embedded Hook Workflow if absent), and review the final
   import registration/list-lifecycle fixes. No unrelated chat settlement slice is
   automatically included. Test each integration conflict and preserve Electron twins.
3. **One artifact pair and eight acceptance items.** Build one Core wheel from the
   delivered dependency and reuse its SHA for Host/real-App qualification. Verify
   imported module provenance and manifest. Use isolated hosted Linux App/HTTP
   qualification and an offline SDK; no local desktop/real API is authorized.
   Combine real-App functional paths with exact-pair negative contract tests;
   do not require every negative case to be a separate GUI run.
4. **Delivery.** Fresh five-check feature audit on the exact candidate, CI raw test
   logs and acceptance readback; normal expected-SHA merge to dev only after PASS.
   Then close #357 and mark only its verified Project item Done. Keep #208 open.

### Required shared-editor baseline found during composition

The frozen UI composition `4117670f` is not a Git ancestor of current dev. Its
native Explorer and shared native editor/history were not all delivered with
#351/#352. Missing imports include `agent_resource_folders`, `canvas_chrome` and
`skeleton_run_menu`; current `SkeletonResourcePage` still has the basic SaveBar
and list. This is a delivery prerequisite of AC-357-01/03/08, not a new design.
Replay only the necessary already-selected Explorer/shared-shell/history paths,
using original `e24e993f` tree bytes as the earlier merge preimage where required.
Preserve current dev fixes; never interpret an absent frozen file as proof that
dev deliberately deleted it. A full #341/CAS closure is not claimed by this replay.
Any newly touched prerequisite symbols still require impact before edits.

Pre-edit Host impacts currently include CRITICAL `admittedScope`,
`resolveSkeletonCredentials`, `empty_session` and HIGH `SkeletonResourceStore._connect`.
Direct callers cover Main credential preparation, editor session lifecycle and
Store read/write methods. These warnings remain unwaived. Unknown new/dynamic
symbols are corroborated against actual frozen source; zero indexed callers do
not establish safety. Final integration tests and graph analysis remain required.

## Boundary and state contracts

- **BC-357-CLOSE-001 (VERSIONED):** imported Core validators/capability producers →
  Host admission and Main/preload/renderer strict capability readers. Add only the
  three hook capability features, preserve existing manifest features, and reject
  old/malformed/mismatched capabilities before writes or execution. Existing direct
  plans BC-357-001..007 specify configuration/source/reference representations.
- **BC-357-CLOSE-002 (CLOSED):** editor/import raw UTF-8 and per-occurrence runtime
  bindings → Main transport → v2 Store aggregate. Preserve exact source bytes,
  typed occurrence paths and owner boundaries. No v1 fallback, borrowed blob,
  implicit Python selection, executable authority from a file or conflict overwrite.
- **BC-357-CLOSE-003 (CLOSED):** retained run selection/source snapshot → worker,
  Hook child and Journal. Pending approvals resume the retained source and fixed
  versions, not the latest draft; after hooks retain durable denial. Each runtime
  result binds execution/generation/attempt/call and immutable content descriptors.
- **SEQ-357-CLOSE-001:** resource open → edit → CAS Save → reopen → publish/pin →
  newer draft/revision → old pin read-only. Stale reads, profile registration/list
  replies and stale tokens cannot mutate the current intent/document.
- **SEQ-357-CLOSE-002:** first/second send; first/second approval; approve/refuse/
  cancel; resumed retained run after source edit; sidecar cold restart/replay.
  Reuse existing exact-pair tests where applicable, run missing cells against the
  delivered pair, and explicitly retain NOT_RUN for unsupported live-provider,
  Memory, multi-user CAS and full-release certification scopes.

## Acceptance mapping

AC-357-01: all three panels inside shared shell, both themes and 300px/50% widths.
AC-357-02: declared Code Result/output roots; invalid result publishes nothing;
errors/timeout stay metadata. AC-357-03: explicit local runtime profile and raw v2
import/rebinding, no shell/activate. AC-357-04: fixed three-line Code preview/count,
engine-layer viewer, drag suppression and half-zoom behavior. AC-357-05: immutable
Workflow pin, Start/End bindings, upgrade check and read-only pinned graph.
AC-357-06: attach-only Hooks with no IO variables, enabled/order/tool-set persistence,
no model/Kernel/Agent in Workflow authoring, owned or pinned hook Workflow.
AC-357-07: visible read-only decision contract, unknown decision failure and durable
denial preserved under fail-closed behavior. AC-357-08: Workflow palette restrictions
and visible backend invalid-import refusal. Match each to concrete final evidence;
old component PASS_BOUNDED alone is not a delivered feature audit.

## Delegation and review

Dependency composition, retained-state contracts and artifact binding are **not
suitable** for a weaker worker: shared files differ from accepted frozen baselines.
The root agent retains these decisions. A bounded documentation-only inventory was
delegated to `gpt-6-luna` and reviewed for stale claims; it cannot waive criteria or
pronounce acceptance. Settled UI corrections may be handed to Claude with an exact
producer contract and serial test window after dependency qualification. Every
worker stops at a concrete checkpoint; parent verifies before dependent work.

## Host composition checkpoint (2026-10-31)

Core PR70 is merged at `966be76c044c3200686108c51f1cc58a357736d6`; its
merge tree equals the tested dependency tree. Source CI: 5631 passed, 17 skipped,
5 xfailed. Host QA now pins that exact revision in every selector.

Additional renderer inputs: owned Hook Workflow UI `773188f1` and immutable pin
viewer `049c0854`. Their paths and patches were rehashed before three-way replay.
Independent callback additions were combined; no frozen input was rewritten.
The shared palette's existing find mode was another required shell prerequisite.
Current-dev header alignment and list search remain available in the native
Explorer. The Code viewer explicitly uses the Tooltip engine's popover layer;
the default for existing hints is unchanged.

The first full frontend run was not green: 9305 passed, 69 failed, 5 skipped.
61 failures came from obsolete basic-editor gestures/assertions or the missing
find-mode dependency; 8 loopback broker cases were blocked by the local OS network
denial. Raw failures remain evidence. After correction, 38 directed suites /
753 cases pass, including the affected #351/#352 paths, G1/import, owned Hooks,
shared Subagent identity and pinned-view cases. The broker cases require CI;
no local guard was relaxed. Production lint: zero errors; its one preload
no-throw-literal warning is on an unchanged baseline statement.

The exact-pair build will use the single wheel uploaded by delivery CI, rather
than a second local acceptance wheel. This checkpoint does not constitute an
audit PASS, App qualification or permission to close #357. All eight criteria
still require final evidence. The broader #341/#356/Release scope remains open.

One additional process exception is explicit: a test-only `chooseModel` call was
adapted before its exact symbol query; the parent fixture and canvas had prior
impact receipts. Its later UNKNOWN result and textual references are retained;
this is not represented as a pre-edit check.

## Final CI refusal / after-Hook denial follow-up (2026-10-31)

CI41259747839 on80ca7ad2 passed frontend (585 suites /9375 cases), Electron
(76 suites /1231 cases), build and boundary checks, but its required backend gate
failed during collection. The Host upgrade regression imported a Core test helper
that is absent from an installed wheel. Copy the exact frozen writer fixture and
the minimal hash-checking loader into this Host test suite; never require a sibling
Core checkout or weaken the seven original cases.

Once collected against canonical wheel520356b8 / manifest827adc56, five denial
cases fail at projection of the after-Hook's child approval. The approved control
and explicit corrupt-terminal control pass. Denial intentionally substitutes its
own deterministic terminal; the projection was incorrectly comparing it with the
original Tool terminal. This is BC-357-CLOSE-003 / SEQ-357-CLOSE-002 / AC-357-07,
not new feature scope. Fix only the expected-terminal comparison in an independent
Core clone (`unchain-357-denial-wait`, base966be76c). Keep route kind, route manifest,
call binding and exact terminal digest checks. A six-case real durable-runtime
regression reproduced one legitimate-denial failure with five controls passing.

The previous wheel and all reports remain immutable failing-pair evidence; they
are not final acceptance. After source tests, deliver the bounded Core fix through
normal CI/PR, update the Host's exact revision selectors, and build one replacement
canonical wheel for final pair/App checks. No local App/Main or real-provider
requests. A mistakenly overlapped local regression family was stopped withSIGTERM
and retained as an interrupted run; rerun it serially, never count it as passing.

Core PR71 is merged at `e0d2eb5e09976def467da7f32f2b0482b48c2ffd`;
its tree076b4845 equals tested head9c189c46. CI41261313696 raw result:
5637 passed,17 skipped,5 xfailed; CodeQL41261313719 passed. Final local
denial/history controls33/33 and real Host published-child cases7/7 passed.
The first expanded negative used a derived route property as a dataclass field;
it was corrected to corrupt the request subject and assert the exact intended
refusal reason. That interrupted run is not counted as passing. All five Host
CI selectors now point to the merged dependency, without a production SHA gate.

QA-only branch `codex/ticket-357-pair-control` at12c038fc supplies independent
installed-wheel provenance/execution cells and one same-wheel Linux binary
source/profile/pin/import cold-read control. No local binary/App launch. Its
tool-local qualification verified142 imported modules and refused foreign-module,
wrong-manifest and wrong-wheel identities; the hand-built graph was accepted and
published by the real source Store. This is tool qualification, not final-pair or
App acceptance. Dispatch only after the new canonical artifact is verified.
