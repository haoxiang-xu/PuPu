# Ticket 383 dev integration independent review

Date: 2026-10-03 UTC. Reviewer: GPT-6.1 Sol. Read-only source review with independent isolated consumer tests.

## Verdict

**PASS for source integration, corrected exact-wheel local qualification and qualified lite CI.** No unresolved host-source finding was identified. Live and active-rollout acceptance remain **INCOMPLETE**.

Reviewed final host checkpoint: `77f8afb0a73d27a6783790ce118a3f184eec900b`, tree `8cfd25df927edf7bf1dd89af17691d60823bf44a`. Its source merge is `9d6ca4322e5c338d2a2c4f0f4fb482ae0c0792ea`, with branch checkpoint `eeb1dff240f5488f133cc11ed45267e98b2b305e` and accepted dev `f689b9fa9732fc4dc3ae527eea96e56c82dc1873` as parents. The final checkpoint changes only the five runtime pins and integration documentation; executable host and test bytes are unchanged from the reviewed merge.

## Source and artifact findings

- The merge preserves the branch's display-only policies, default `approved` behavior, original-policy and legacy-omission handling, member-specific approval controls, results and durable presentation. Grouping/helper/timeline/cold-policy/interaction source remains byte-identical to the branch.
- The accepted #390 retry dispatcher, provider-result readers and strict capability/artifact consumers remain intact. Bounded-ordinal and grouped waits both render; malformed/hybrid ordinal input is rejected. Retry frames remain original-sequence grouping barriers. No #384 source is imported.
- The inherited runtime array-policy recovery defect was corrected separately at immutable Unchain `a7fa15d685b1130bf5678c1e493a51d2551185cf`, tree `e9fcc714c0756a8db67b4b9811b2829161e3bc30`. The bounded change thaws stored JSON arguments only for comparison. It does not rewrite journal bytes or relax request identity, approval, artifact hashes, leases or no-resend guards. The earlier `4a0add1`/`d1735fac...` pair remains historical and is not accepted for that case.

All five QA defaults select the corrected full Unchain SHA. The single corrected wheel is SHA-256 `a88028bbb7d286d4792e49b5945f80e33d71203579298ddb053190cca1aced62`; actual imported manifest is `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`.

CI separately built and reused wheel SHA-256 `166f7e33855f8a38891fd893bdc84e51ffde44e232353b5ec2a82dd0d6bbb080` from the same corrected source and manifest. It is recorded separately from the local wheel.

Independent verification compared all **346 packaged files, including 335 Python files**, to committed source for both wheels and to local installed bytes. Actual module origin and installation archive metadata match this wheel. Independent production Electron and artifact consumers accepted the real manifest and rejected freshly digested missing-feature, unknown-field, wrong-major and bad-digest cases.

## Test evidence

- Independent archived-host frontend: **6 suites / 144 tests passed**, exercising the actual projector, TraceChain, grouping/policy/member controls, replay/lifecycle parity and both retry formats
- Independent host tests against the corrected installation: **103 passed**, including transport, exact-cursor cold-journal presentation, retry and safe diagnostics
- Final valid full pinned-SDK backend: **2,678 passed / 18 skipped / 3,599 subtests**, exit 0 in 208.35 seconds; exact wheel/manifest asserted and no foreign Unchain imports
- Both official Context V2 and RunBundle gates: **PASS**, logs bound to the same `a88028...` wheel and `a7fa15d...` source
- Web build: **PASS**, actual compiler child status 0, signal/error null; fresh build artifacts verified
- Stable full frontend: **445/447 suites, 5,412 passed / 38 failed / 5 skipped**; full Electron: **54/56 suites, 936 passed / 38 failed / 5 skipped**. The 38 vault fixture failures reproduce on exact dev. Both invocations remain **FAIL**, not all-green aggregates

The initial frontend's six extra AgentsModal failures disappear in the complete unchanged-source serial rerun. The initial backend evidence runner recursively re-entered pytest under multiprocessing spawn and misclassified the host `unchain_adapter` module as a foreign runtime import. Its failed output is preserved. A guarded evidence runner, exact namespace audit and per-command neutral CA environment produced the valid full pass without product, fixture or assertion changes.

The committed complete merged-source graph result contains **118 changed symbols, 274 affected flows and 38 files, CRITICAL**, with every row returned and no partial/truncated/error flag. Dynamic/JSX resolution, FTS and traversal limits remain; later pin-only low-risk results do not waive this source risk.

[Release QA run 37108144017](https://github.com/haoxiang-xu/PuPu/actions/runs/37108144017) reached terminal success for exact pin checkpoint `77f8afb0`. Its synthetic merge `7dbe16be292cb852ab53201f614bf74804adf122` has the identical entire tree, independently verified by Git with no file diff. The final merged lite report records passing deterministic checks and two Linux Playwright Electron smoke tests, with zero failed checks. CodeQL and merge-source checks passed. This qualified lane does not establish complete vault or all-platform packaging coverage.

## Remaining acceptance

Real-profile first/second provider messages, real durable Stop/reopen and cold sidecar resume, frozen-sidecar/package qualification and platform-specific manual acceptance remain **NOT_RUN**. No live paid provider, app/profile restart, real database mutation, PR merge, deployment or issue closure was performed by this review. Any future real-app use of changed Python requires a separately coordinated sidecar restart.
