# #351 delivered Branch acceptance

This is the scoped #351 close, following runtime PR #66 and Host PR #463.
It carries the reviewed native authoring prerequisite plus the separate Branch
editor delta. It does not deliver #352/#357 advanced editors or close #341/#356.
Frozen source candidates and reports remain read-only. Only delivery clones
change. No live model/provider call is authorized, and heavy local jobs serialize.

## Acceptance boundary confirmed by the owner, 2026-10-30

Keep repairable drafts. Saving is not execution admission. Required policies
and structural admission errors block Run/Publish; comparisons whose operand
types are only known at execution fail explicitly at their condition. They never
coerce into false or an empty string. The owner selected this existing contract
and the two obsolete save-time sentences were corrected on #351. No negative
case is waived. Record the actual rejection stage for each case.

## BC-351-A01 — actual page Save to strict resource Store

Producer: SkeletonResourcePage with real FlowEditor, BranchSection, input rows
and builtin controls. Transport: existing facade/preload/Main/resource routes.
Consumer: the source Host's actual SkeletonResourceStore with the one installed
delivery wheel. Admission is CLOSED: Save contains only document and the existing
CAS token; nodes retain id/type/config; conditions use the runtime's typed AST.
No eval expression, endpoint, IPC or fallback shape is introduced.

AC-351-A01: both actual page requests save, reopen byte-equally and pass preflight;
a stale token is refused at expected_edit_token without changing storage.
BC-351-A02: a real Electron edit/save/reopen probe uses these page-produced graphs
as bridge-seeded fixtures. It must prove no persistence before Save, exactly the
edited field afterwards, unchanged stable case/edge identity, and the same Store
record and controls after app restart. This is not empty-canvas construction.
It runs on CI's disposable OS user, never the developer's macOS Preferences.

## BC-351-A03 — execution and durable branch selection

The runtime dependency's BC-351-B01 adds an explicit branch selection result in
the same existing Journal commit as its selected edge. Only untaken sibling
edges are recorded skipped; rejoin nodes remain runnable. Typed receipt keys are
closed by the producer/consumer tests, with canonical bytes and existing CAS
resource references. Old empty branch results remain readable. Public envelopes,
published outputs and execution-state schema are unchanged.

AC-351-A03: real installed-wheel execution of the unchanged page documents must
take true/false and case/default correctly, run only the selected Kernel nodes,
reach End once, preserve first_present behavior, and read back the branch receipt.
No changed wheel is qualified by earlier runtime results. Verify the actual
imported manifest and all imported Core module origins against the reused wheel.

## SEQ-351-A01

Identity: resource id/edit token, stable branch/case ids, graph execution and
generation/node attempts. Load -> edit locally -> Save -> strict read -> preflight
-> reopen -> app restart/cold read. Cases retain their id/edge when their value
changes or their row moves. Wrong/duplicate outlet, cycle and unavailable binding
failures stay visible. Runtime selection -> reconstruct -> finish/replay must
preserve the branch result and append no completed-node replay.

## AC mapping and current evidence

1. Branch/rejoin: command/canvas/page tests; installed pair and real App pending.
2. Typed grouped AST: branch config/section/capture tests and actual Store readback.
3. Negative conditions/graph shape: existing strict runtime/Store tests plus named
   editor warnings; each rejection stage is recorded under the owner decision.
4. Missing policies/defaults: binding/IO/Store regressions; the reviewed JSON
   default-display fix from 1f988dc8 is carried without the later Tool Call UI.
5. Only selected path/first_present/skipped: runtime receipt follow-up, installed
   execution pending. Local public-stream probes are BLOCKED by process identity.
6. Existing recipes: shared legacy editor/roundtrip tests and Host legacy graph
   regression in CI; local OS-blocked cases are not counted as passes.

The first integrated renderer check found one stale header-label assertion.
After aligning it, the test reached a genuine collapse-time ReferenceError:
the old native delta referenced removed TOP_STRIP constants. The delivered code
uses current headerLeft/RECIPE_PANEL_HEADER geometry. Both current Agents labels
are retained. Final related regression: 98 suites / 2988 tests passed. The real
page emitted two Save payloads; strict Store save/read/preflight/CAS controls pass.
Four local public-stream attempts stop before the SDK at
session_guard_process_identity_unavailable and remain BLOCKED.

Before integration, 44 file/symbol impacts were read on the fresh b141049 index.
resolveDevUnchainSourcePath is CRITICAL (15 impacts, 2 direct); shared safe_text
is CRITICAL (27/12) and its body is unchanged. JSX UNKNOWN callers are text
corroborated. Graph process discovery is capped, so listings are a lower bound.

Evidence: ~/.codex/artifacts/pupu-351/branch-03-20261030/ and
~/.codex/artifacts/pupu-351/ci-02-20261030/. Full audit, exact final artifact
digests and delivered CI/App results are pending; this document is not PASS.
