# #384 + current dev / #390 integration evidence

## Immutable subject and composition

Reviewed/tested source checkpoint: `30bf2126851ddb3adc27d1d06dfa1fbc19235f7a`, tracked tree `8d0821998060c7ba19dd4bc03f64d301b44fe6b3`. Exact parents are the previously pushed/restored #384 plan checkpoint `be7c0badc5ccc702709dcc4c8be89d8535d04a79` and accepted current dev `f689b9fa9732fc4dc3ae527eea96e56c82dc1873`. The coordinator published this two-parent merge fast-forward, independently fetched/restored it, and confirmed the staged/local/remote tree before these tests. No production or test source changed during validation or environment recovery.

There were no textual conflicts. Current dev changes no streaming-hook bytes relative to the shared base: the #384 stop-only admitted-batch drain, nested and synchronous message flush, interaction identity capture, generation tombstone and stale/successor fences are unchanged. The retained-history helper is likewise unchanged. TraceChain combines #384 truthful cancelled call/worker/approval projection and #390 strict grouped/ordinal retry rendering in separate hunks. No #383 policy repair was imported. All five QA defaults select immutable Unchain dev `358b96d723daa0d2882158985c8245c7f8c7fb23`, confirmed to contain reconciled source `1c9b399beb65bda72520e1c3ebc11c7f117751cb`. Inaccessible Mac-only WIP was not recovered; this final pin change supersedes only its known narrow pin intent.

## Exact artifact sets

The local wheel was built **once** from clean dev358b96d and reused for all local runtime, backend and contract results: `unchain-0.2.0-py3-none-any.whl`, SHA-256 `819e097dee4ad8b934b76fabf83d04360c3081a48730d21792bf525b806e7e76`. Its actual imported manifest is `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`. All 345 packaged / 334 Python files were compared to committed source and the installation. The production-pinned host environment independently installs and verifies the same wheel bytes; no rebuild or mutable sibling-runtime fallback occurs.

The separate GitHub CI wheel is SHA-256 `f069e77fb9f230e9548f7f96d3e90083b1d5095935b985c7820fe700e1d9fee3`, with the same source revision and manifest digest. The coordinator downloaded it and verified all 345 packaged / 334 Python files. These two archive hashes are intentionally recorded separately. Each qualification run reused its own exact artifact throughout.

## Local results and honest recoveries

| Check | Result |
| --- | --- |
| #384 Stop/retention/storage/renderer plus #390 retry projector/renderer | PASS: 8 suites / 162 tests |
| Focused provider diagnostics, retry, V4 and host factories | PASS: 86 tests + 6 subtests, latest-SDK environment |
| Complete Unchain clean-dev tests against installed local wheel, latest SDKs | PASS: 4,202 tests / 15 skipped / 5 xfailed, 124.92 s |
| Complete PuPu backend, production-pinned server requirements, same local wheel | PASS: 2,675 tests / 18 skipped / 3,599 subtests, 205.78 s |
| Context V2 contract, same wheel, both latest and production-pinned host dependencies | PASS each: 92 runtime + 24 host + 3 subtests + 2 independent strict-fake tests |
| RunBundle contract, same wheel, both dependency environments | PASS each: 63 runtime + 31 host + 2 subtests + 14 independent strict-fake tests + 36 Electron + 225 renderer tests |
| Actual imported manifest → independent Electron and artifact consumers | PASS in each consumer: 1 positive and 2 freshly-digested missing-feature negatives; precise incompatible/missing-feature reasons |
| Release QA scripts after normal project postinstall | PASS: 399 tests / 7 skipped; deterministic long-run harness 62 passed |
| MCP registry validation, bundled-runtime unit tests, notices unit tests | PASS: registry valid, 18 runtime + 9 notices tests |
| Controlled-snapshot CI web build | PASS actual compiler child exit 0, no signal/error, with 2,048 MiB heap cap |
| Full local Node 24 / Linux frontend | FAIL: 443/445 suites passed; 5,389 passed / 38 failed / 5 skipped |
| Full local tracked Electron after actual official dependency installation | FAIL: 54/56 suites passed; 936 passed / 38 failed / 5 skipped |

The 38 local frontend/Electron failures are the same two inherited vault fixtures. Their fake safeStorage lacks the Linux selected-backend method; unchanged production correctly fails closed. Exact devf689b9fa with the same platform/dependencies independently reproduces **38 failed / 19 passed in those two suites**. No production admission was loosened, assertion weakened, platform spoofed or tracked test skipped. Canonical CI has its own passing environment below; it does not rewrite these raw local failures into an all-green invocation.

Initial dependency setup deliberately omitted package lifecycle scripts. Two Electron integration failures came from the missing Electron binary; installing the official Electron package's binary with a task-local cache recovered them without starting an app/profile. A release-QA unit failure came from missing the repository's normal dependency-only postinstall patch; running that exact checked-in postinstall recovered it. One diagnostic rerun also discovered an archived baseline under the ignored local directory and doubled the suite count; it is not the final aggregate. The final Electron invocation excludes only that untracked local fixture directory and covers all 56 tracked suites.

The first local backend run used the runtime qualification environment's **Anthropic 1.11.0**, whose HTTP client changed to httpx2. Five explicitly pinned-SDK Kimi fixtures correctly rejected a traditional httpx client; these are dependency mismatch results, not production failures. The final independent host environment follows the checked-in exact requirements: **Anthropic 0.83.0 / OpenAI 2.7.1 / google-genai 1.68.0**. Two MCP fixture failures were caused by inherited CA aliases overriding the fixture's explicit certificate. The final test command unsets only NODE_EXTRA_CA_CERTS, REQUESTS_CA_BUNDLE, CURL_CA_BUNDLE and PIP_CERT; no persistent trust/network setting was changed. The final same-wheel backend is one all-green invocation.

The Unchain suite uses byte-identical immutable test copies, with all **346 tracked test files** compared to clean dev. Existing cold-process fixture src prefixes resolve to the same verified installed-wheel package. An initial copy accidentally omitted nested eval-fixture src directories; restoring their unchanged bytes recovered two failures. The remaining no-Git temporary-path case encountered the executor's injected ancestor .git directories. The unchanged test passed in an authorized repository-free /dev/shm temporary directory; the final full suite uses that directory and passes as one invocation. Production and test assertions were not changed.

The first two CRA children were **SIGKILL / null status** despite the existing wrapper returning 0. Both are recorded as failed attempts. Reducing concurrent memory pressure and using a 2,048 MiB Node heap on the same tracked source produced the actual exit-0 compiler proof. The build uses the controlled all-mode snapshot and writes an ordinary production bundle; it is not deployed. Source, snapshot, main-bundle and raw-log hashes, plus child exit records, are in `validation-identity.json` and the child evidence files. New skips/xfails were not introduced by this integration.

## Canonical remote qualification

[Release QA run 37106504542](https://github.com/haoxiang-xu/PuPu/actions/runs/37106504542) reached terminal **SUCCESS** on exact branch head30bf212. CI tested synthetic PR merge `9802d0b629aa75db074e32e9ab4f7dd364262503`; its tree is identical to `8d0821998060c7ba19dd4bc03f64d301b44fe6b3`, with no file diff. The authoritative deterministic report records frontend, Electron lite, pinned backend, both contract gates, wheel/manifest continuity, web build and auxiliary QA steps passing. The final merged lite report also records two passing Linux Playwright Electron smoke tests and zero failed checks. CodeQL and merge-source checks also passed. The downloaded CI reports/artifact identities are independently verified by the coordinator. This is not a claim of release-mode all-platform packaging.

## Graph and acceptance limits

Pre-edit upstream warnings are preserved in the integration plan: critical settlement/start-stream paths, high cancellation ownership and unresolved JSX/dynamic caller edges. Source-checkpoint complete structured all-scope detection reports **33 files / 32 symbols / 20 affected processes, CRITICAL**. Complete whole-branch comparison against current dev reports **56 files / 195 symbols / 54 affected processes, CRITICAL**, including documentation and line-shift mappings. Neither structured result has partial/truncated/error flags. The index is bound to this worktree at be7c0bad; FTS, process ranking/depth and callable/property-dispatch limitations remain explicit. Unknown edges were corroborated rather than interpreted as unused.

BC-384-001 / SEQ-384-001 / AC-384-001…006 remain preserved by the unchanged retention/drain/ownership source and fresh focused consumer coverage. BC-390-I01/02, SEQ-390-I01 and AC-390-I01…03 bind strict artifact/manifest, historical diagnostics/leases, native replay, retry/Stop and no-resend to the exact artifact sets above. The historical #384 recorded producer fixture remains attributed to its original capture; focused consumer use does not claim a new live provider capture. Current producer/host paths are separately exercised by the fresh same-wheel runtime, backend and strict contract matrices.

[Independent GPT-6.1 Sol final review](independent-sol-review.md) is **PASS for source integration and the qualified lite CI lane**, on exact30bf212/tree8d082199. It identifies no unresolved source finding and retains the qualification limits below. Live paid providers, real Electron Stop/reopen on the user's profile, real MemoryV2 journal reopen, deployed/frozen sidecar, cold restart of the user's sidecar, macOS/Windows packaging and active rollout remain **NOT_RUN / INCOMPLETE**. No profile/app/sidecar was launched or restarted, real database changed, branch force-pushed, PR merged, issue closed or deployment performed. Updated Python factory code requires a coordinated sidecar restart before any future real-app acceptance; this report does not authorize it.
