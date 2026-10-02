# Ticket 383 timeline policy evidence

Snapshot: 2026-10-02. This record covers backend transport and strict local renderer evidence for the exact candidate pair. It does not claim live application restart, provider execution, or rollout acceptance.

## Artifact provenance

- Unchain candidate source: `73b11eb7db996fcd303555d448c4a145246f6760`, based on immutable source `1ec49ddfc28d3b42ba035debada5e3db759dad1b`.
- Candidate artifact: `unchain-0.2.0-py3-none-any.whl`, 1,162,141 bytes, SHA-256 `f79f37765da64ffd3c18998930994cb9607de5ff16d209be36f68b023dd3673e`.
- Runtime manifest digest exported by the imported wheel: `a4448f85fc219f8535a6dafca8cfe1f8ba7963a3219ef1a0f00f8f14e30079be`.
- PuPu backend/cold-host test checkpoint: `b77071d60df88feada687de3d4d7926eee07c598`, on top of spacing commit `901ba813`; those Python files are unchanged in final PuPu source `81a9db994e29e9cae497de7fd3025374d17d7344`, tree `097a3d11b2`.
- Final strict-browser and frontend build/test source: PuPu `81a9db994e29e9cae497de7fd3025374d17d7344`, paired with Unchain `73b11eb7db996fcd303555d448c4a145246f6760` and the same candidate wheel.
- The preceding accepted artifact `f62aa13af4525e5e98548612bc15171cbc01c784e7be55f73d704c7840164889` is a separate artifact and is not replaced by this candidate. The existing accepted `final-acceptance.md` remains unchanged.

The candidate was built once from the clean Unchain source. Tests pre-imported Unchain from that wheel's isolated install, asserted the wheel checksum and imported manifest digest, and checked for foreign Unchain module imports. The running Unchain backend remains pinned to the previously accepted source. The local development frontend may hot-refresh edited frontend files; no new application instance, app/sidecar restart, candidate runtime rollout, profile/settings mutation, or real user interaction occurred.

## Policy and feedback matrix

Ordinary tools default to `approved`. The built-in `ask_user_question` defaults to `never`; developers may explicitly override it. The renderer matrix below expresses whether a call with the given feedback state is eligible to share a visual group with a compatible same-identity call. Identity and semantic barriers still apply in every cell.

| Declared policy | No feedback | Approved | Pending | Rejected | Answered question |
|---|---:|---:|---:|---:|---:|
| `never` | No | No | No | No | No |
| `no_feedback` | Yes | No | No | No | No |
| `approved` (ordinary-tool default) | Yes | Yes | No | No | No |
| `always` | Yes | Yes | Yes | Yes | Yes |

The strict browser fixture passed the 20 policy/state combinations and three legacy-invalid cases. A separate synthetic `always` question case verifies that two question controls remain visible and that the second answer is submitted once under its own request identity; it does not change the built-in question default.

## Boundary and sequence evidence

| Contract | State | Evidence |
|---|---|---|
| BC-383-01 — Tool API declaration and original tool-call metadata | PASS | Focused exact-wheel API, producer, normalizer/projector, malformed-value, and provider-schema tests: 14 passed. Ordinary default is `approved`; built-in question default is `never`, with developer override. |
| BC-383-02 — Durable approval/resume and PuPu transport | PASS, scoped | Two exact-wheel resume cases preserve original `never` and original absence after current configuration changes to `always`. PuPu cold host-boundary module: 83 passed. |
| BC-383-03 — Grouped renderer semantics | PASS, scoped | Strict DOM probe at PuPu `81a9db99` of compiled TraceChain, actual activity tree, and exact-wheel V4 fixture passed 23/23 cases. Before each of 12 output cases, the probe collapsed any open details, asserted the expected initial closed count (one for a no-feedback group, two otherwise), expanded all details using fresh DOM locators, and verified each member's own result once. Local stop/remount was stable; durable restart remains untested. |
| BC-383-04 — Exact artifact binding and provider/approval isolation | PASS | Reviewed pair is PuPu `81a9db994e29e9cae497de7fd3025374d17d7344` + Unchain `73b11eb7db996fcd303555d448c4a145246f6760`, using wheel SHA-256 `f79f37765da64ffd3c18998930994cb9607de5ff16d209be36f68b023dd3673e` and manifest digest `a4448f85fc219f8535a6dafca8cfe1f8ba7963a3219ef1a0f00f8f14e30079be`. Focused tests assert unchanged provider tool JSON and durable interaction request identity; cold presentation adds the scalar beside the copied request. This artifact binding maps to AC-383-05. |
| SEQ-383-01 — Fresh call / first and second ordinary messages | NOT_RUN | No policy-specific live provider-turn pair was run. The 23-case renderer fixture uses actual compiled consumers and a V4 producer fixture but does not call a model/provider. |
| SEQ-383-02 — Explicit `always` feedback and per-member interaction controls | PASS, scoped | Browser evidence confirmed two visible pending controls and one exact second-member approval callback; a synthetic `always` question fixture confirmed two visible questions and one exact second-member answer callback. The temporary SQLite-backed host test separately persisted two sequential interactions in one process and recovered their original `never` then `always` policies with request digests preserved. No live interaction/provider service was connected. |
| SEQ-383-03 — Local stop/reopen and original-policy resume | PARTIAL | Local renderer stop/remount preserved saved presentation, and exact-wheel callback → journaled tool call → approval pause → resume tests preserve original `never` and original absence when current metadata changes to `always`. Actual application durable stop/reopen remains NOT_RUN; no full KernelLoop provider replay was exercised. |
| SEQ-383-04 — Compatible call/interaction/feedback/resume/result projection | PASS, renderer/focused scope | Strict producer-to-renderer cases and focused grouping/resume tests cover presentation continuity with per-member controls/results and original policy preservation. Live provider execution remains NOT_RUN. |
| Sidecar cold restart and process rehydration | NOT_RUN | The cold presentation path read real persisted SQLite state, but the test stayed in one Python process; no sidecar restart or process rehydration was claimed. |
| Graph and subagent policy paths | NOT_RUN | These paths were not separately driven with policy-specific provider fixtures. |

## Acceptance criteria mapping

| Acceptance criterion | State | Evidence boundary |
|---|---|---|
| AC-383-01 — Actual producer through strict consumer to correctly grouped member rows | PASS, scoped | 23/23 strict compiled-renderer cases pass with the actual activity tree and exact-wheel V4 fixture; each case asserts exact badge multiplicity and two logical steps. The representative approved legacy trace also retained 3 Approved members and each of 3 results once. |
| AC-383-02 — Four-policy by five-feedback-state matrix | PASS, renderer scope | All 20 combinations pass, plus 3 legacy-invalid cases. This matrix covers renderer presentation, not live provider messages or durable app restart. |
| AC-383-03 — Identity barriers, ownership, and per-member callback behavior | PARTIAL | Focused grouping tests and strict interaction probes preserve member controls and invoke the selected second member exactly once. This evidence does not establish every wrong-owner/identity barrier or callback path. |
| AC-383-04 — Real Tool API, producer, Unchain projection, and unchanged provider/request contracts | PASS, focused | Exact-wheel focused policy tests: 14 passed, with provider schema and durable request invariance asserted. |
| AC-383-05 — One immutable wheel paired with the PuPu candidate | PASS | BC-383-04 binds the reviewed PuPu and Unchain revisions to the exact wheel SHA-256 and imported runtime manifest digest; the test runner asserted both and no rebuild occurred. |
| AC-383-06 — Focused/full verification and independent review | PARTIAL | Independent Sol review returned PROCEED for the final `81a9db99` + exact-wheel pair. Focused and full frontend suites and the final web build pass. Full exact-wheel Unchain pytest has four known SDK baseline failures; PuPu source-check workflows completed successfully, while Unchain #47 branch-filtered CI remains NOT_RUN for this stacked state. |
| AC-383-07 — Strict browser interaction, multiplicity, and reopen matrix | PASS, local scope | Final-source 23/23 cases, 12/12 output expansions, pending approval callback once, synthetic question callback once, and representative legacy trace with local stop/remount all pass. This does not include durable app stop/reopen. |

## Test results

The exact candidate-wheel full Unchain suite completed with exit 1: **4,010 passed, 4 failed, 17 skipped, 5 xfailed**. The four failures are the known OpenAI SDK `Literal` mismatches for `none` and `xhigh` reasoning effort on `gpt-6-sol` and `gpt-6-luna`. One of the 17 skipped tests is a source-layout-only `src/__file__` assertion; equivalent installed-package export and module-origin smoke checks passed outside pytest and are supplementary, not added to the pytest pass count. The immutable pre-change baseline reproduced the same four SDK failures; historic source-suite counts without a saved run log are not used as candidate-wheel totals. The exact-wheel full log SHA-256 is `b8fbdcd467593046601a11d0038fb2e33d593384412bac58b5adb86d512817bf`; the pinned-baseline comparison log SHA-256 is `a69b10ad5676cf88e3d2ae6e0630ce90b1a4720ef8a7b37fcd8a1711db5d7da1`.

Exact-wheel focused API and resume command, run through the candidate pre-import/checksum/manifest wrapper:

```sh
python -m pytest -q \
  tests/test_tool_timeline_merge_policy.py \
  tests/context_v2/test_context_runtime_tool_approval_authority.py::test_approval_resume_reuses_original_timeline_policy_after_tool_config_changes
```

Result: **14 passed**. The parameterized resume case covers original absence and original `never`. The final focused log SHA-256 is `9131addc0558ffedbfc73867532de3e084f21d112e11d29ae501bda16dc9adea`; this focused collection had no source-layout-only test skip.

Exact-wheel PuPu cold host-boundary command, with the candidate site pre-imported and SHA/manifest asserted:

```sh
python -m pytest -q \
  unchain_runtime/server/tests/test_memory_v2_unchain_active_host_event_boundary.py
```

Result: **83 passed**. This module includes the two-interaction SQLite case described above. The test process emitted one non-failing pytest warning that `anyio` had already been imported before assertion rewriting. Cold host-boundary log SHA-256: `03e0feb1bd500221052cac14d5a03d916450251f4667d14348bf8c00bc28dfd6`.

The full exact-wheel test runner recorded the artifact identity, test counts, exit status, and empty foreign-import list in its `full-wheel-test-evidence.json`; its pytest output is in `full-wheel-tests.log` in the isolated candidate runner workspace. Those logs are summarized by their hashes above, contain no user chat data, and are not copied into this repository.

## Strict renderer evidence

The exact-pair strict probe bound to PuPu `81a9db99` reported **23/23 cases passed**, including the full 4×5 policy/state matrix and three legacy-invalid modes. Every case showed two logical steps and the expected exact badge set. For each of 12 output cases, the probe collapsed any open details, asserted the expected closed detail count (one for a no-feedback group, two otherwise), expanded each detail with fresh DOM locators, and verified each member's result once. Pending approvals kept both controls visible; invoking the second control produced exactly one `pending-always-confirm-2` approval with once-only scope. An additional synthetic `always` question case kept two questions visible and submitted only the second request (`qa-confirm-2`) once. The representative 13-frame legacy trace rendered three steps, three Approved members, and all three results once; local stop/remount preserved the presentation. Console errors/warnings: none.

This exercised the compiled frontend modules, actual activity tree, and an actual V4 producer fixture emitted by the exact candidate wheel. It did not load the application bridge, profile, provider, or approval service. The final strict evidence JSON SHA-256 is `358a4149d75e8e28ab92eea4dff178a4ab9c1886ad5066ed50ea0c38b8f3c83c`.

The final audited full frontend suite passed: **447/447 suites, 5,435 passed, 5 skipped (5,440 total), actual process exit 0**. Its log SHA-256 is `eaf4254a173d02f815a6384c6f66f17a0627a78b6d79862c44a28383525f5b83`. The focused frontend suite passed: **7/7 suites and 129/129 tests, actual process exit 0**; its audited log SHA-256 is `05bace8caef1980305155c7f403abead1789f4236c2c13018ef41dd43b0a2b78`.

The final `CI=true` web build at PuPu `81a9db99` compiled successfully and produced a fresh footer/index, 72 JavaScript assets, and feature flags. Build log SHA-256: `f411fe061d4a10fa872a154b117da92ef7c7043981fd9685f8d93ea215ac042f`; build proof SHA-256: `51fa5c3d63d4324378eabcbe4559d39137f29d78a78a0abe9ba14fe2906dc1c3`. Earlier lint findings were corrected before this successful build.

## Remaining release evidence

- Final Sol source review: **PROCEED** for PuPu `81a9db99` + Unchain `73b11eb7` + the single exact wheel.
- Historical pre-correction frontend lint failures were resolved before the passing 81a build; they are not current blockers.
- Remote source checks at PuPu `81a9db99`: Release QA, Enforce Merge Source, and CodeQL completed **SUCCESS** ([run 37050813118](https://github.com/haoxiang-xu/PuPu/actions/runs/37050813118)). These results apply to this source checkpoint. The documentation delivery commit triggers its own checks; those results are not represented here. This is not a merge/deployment pass.
- Unchain PR #47 branch-filtered CI: **NOT_RUN** for this stacked branch state; it is not represented as a passing check.
- Full KernelLoop resume, sidecar process cold restart, actual application durable stop/reopen, live first/second provider messages, and graph/subagent policy paths: **NOT_RUN**.
- Live runtime rollout, app restart, profile change, and credential/settings operation: **NOT_RUN**.
- Release state: **INCOMPLETE** for the unrun live/process/path/graph-subagent cells. Candidate source CI, final build, and independent review are complete; the live backend remains on its previously accepted Unchain runtime, with no application or sidecar restart or candidate rollout.

## Graph evidence and limits

The final root `detect_changes(scope=all)` run after index refresh reported 6 changed symbols, 0 affected symbols, 2 changed files, and low risk, with no reported error, partial, or truncated flag. The mapped changes were documentation; a one-line removal of an unused `frames` dependency in `trace_chain.js` was not mapped to a changed symbol, consistent with the graph's unresolved `timelineItems` relationship. Manual diff review and Sol review identified three cumulative frontend lint-only edits since backend checkpoint `b77071d6`, with no functional change. This is limited graph evidence, not a global no-impact conclusion: prior indexing warned of incomplete entrypoint/callee/process walks and cross-language resolution. The graph cannot establish absence of effects outside its mapped symbols.
