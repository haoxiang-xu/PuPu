# #212 acceptance report

Candidate `6eb327c4641dfe176235c6c6d950f607ec426179`, tree `7793971f381a80031fe7a84b4d9b9afd522e416d`, baseline `d5d75094a5788a17b432d284dbffbb5b10ccab24`.
Candidate digest (full binary Git diff): `sha256:6999de08cfe07c53b6710b8e6da7dd5c0e80fbf640f32a312307a74c24553724`.

**Acceptance PASS within the existing Agents localization scope.** Delivery state is authoritative at [PR476](https://github.com/haoxiang-xu/PuPu/pull/476) and [issue212](https://github.com/haoxiang-xu/PuPu/issues/212); this acceptance report does not itself claim a merge or Release208 closure.

## Result

Existing Agents panels, library actions, import/upgrade flows, canvas nodes and recorded-run copy use the existing translation layer in all eleven languages. Focused controls, unsaved work, callbacks and authored/protocol/backend values remain intact. The only layout corrections are local wrapping/nonshrinking controls in three components; no shared widget or Core/backend/IPC/schema/provider/flag change.

- Full i18n audit: zero missing/orphan/placeholder-mismatch/missing-English keys; 1,696 Agents leaves per locale. Preserve the 95 dynamic-reference sites and 155 apparent dead keys as static-scan limits, not deletion authority or an all-clear. No exhaustive native editorial claim.
- Independent source audit: all98 productionJS bound through the immutable review chain,95 identical reviewed blobs plus3 reviewed style-only files; no additional blocker. Source review and final App review are preserved unchanged here.
- [Packaged offline App42722882989](https://github.com/haoxiang-xu/PuPu/actions/runs/42722882989):44 unique cells (36 representative Code/WorkflowCall/Hooks×en/zh-CN/de×light/dark×min/max plus8 other narrow Hooks locales), zero horizontal clipping.17 actual Settings language-only intervals do not save. One GUI Save binds exact source/token/document/HTTP; cold GUI, HTTP and private physical DB read agree; old processes die before new Main/sidecar using the same HOME/profile. Zero model/provider requests. Native graph seed via real bridge is disclosed.
- One immutable package built in42720677487 and reused for42722882989. Independent streaming hash matches8,470 files/1,052 internal links, archive `8eb7ce71cef74715e2a0facc130031c466ab03befff41fd87de9c58583db69a3`. No extraction/local App execution by the reader.
- Validator qualification on private copies:2 positives and20 precise tamper refusals; all22 expected outcomes. Parser crashes do not count as refusals. Original232-file raw evidence seal is unchanged after qualification and review.
- [Fresh complete original CI42733169131](https://github.com/haoxiang-xu/PuPu/actions/runs/42733169131):SUCCESS on the exact same6eb SHA/tree779, using the existing production lite/standard workflow with all original gates.652 frontend suites/10,236 passed(+5 skipped);82 Electron suites/1,352 passed(+5 skipped);4,147 Python passed(+18 skipped),3,811 subtests passed,1 retained expected serialization warning. Python37m56. ContextV2 contracts59,RunBundle contracts152,web build/version,MCP/release scripts,3 Ubuntu Playwright smoke tests and final report/topology passed. CodeQL42723848932 passed on6eb. Release packaging/signing/platform-manual checks are outside lite mode and this feature ticket, not counted as executed.

## Runtime identity

Canonical App wheel `c1213803c1b3bb58f4fc78a03b1a00f80e001d63be00c4afae53ab4d972b12ec`; manifest `sha256:c172bc02718aee771ddd4d247904f13cdaf003d3794148fd3ecd4d4e9a419e6b`; retained Linux sidecar `c91baa27f483ee861da1161b51cdd857282112589d31b6286342a2f86233f683`; Core `2e455628b454ce225dd8e813e0ae33a85e56450a`. Fresh CI ZIP `2c41b4e915f6466d410a48723c10fbc91e6f10751869b8421693bf1022701685` is a different archive, but every one of its395 uncompressed members matches canonical c121 byte-for-byte; no silent archive substitution. The App source/catalog/pair bindings are explicit in the preserved receipts.

## Failure retained and CI attribution

[First CI42723849005](https://github.com/haoxiang-xu/PuPu/actions/runs/42723849005) is still FAILED. One unchanged backend testcase observed4.000156758s against strict<4.0s. Web build passed; downstream jobs were skipped after the test gate failed. Root corrected an early normalized continue-on-error step inference by reading actual logs. [Bounded diagnostic42732834676](https://github.com/haoxiang-xu/PuPu/actions/runs/42732834676) ran the unchanged original testcase three times on base and three on candidate, all strict/unskipped PASS. Full-suite timing cause remains UNKNOWN; the diagnostic cannot replace full CI. ONE fresh full original run42733169131 then passed the same strict testcase and every required gate, without source, test,4s budget or candidate changes.

GitHub's PR check panel still selects the old pull_request run; the successful fresh workflow_dispatch run records the exact6eb SHA, same779 tree and matching PR association. These records are not forged/relabelled and the original failure is not erased. Acceptance uses the complete fresh original workflow report bound to the same candidate. No test gate is omitted or waived, no protection rule is changed, and merge must use the normal API with expected head6eb. The preliminary timing note's PENDING status is historical; this report and fresh run record the later result. Full original failing log is preserved at the relative path used by that note.

## Bounds

QA explicitly enables the existing Agents flag; release snapshot `{}` is unchanged. Baseline product renderer `sandbox:false` is disclosed; QA adds no disable flag and preserves the original Chromium helper. Linux private loopback-only execution,0 real provider calls; no Mac App/user-library startup. `offline-python` is unregistered; source persistence is proved, Code/model execution is not claimed. This is not Windows/macOS, signing, real-provider, Memory or release certification.

Complete graph result:140 changed files/958 symbols/692 listed affected flows, CRITICAL, no partial/truncated arrays. Global rank/branch/depth/walk caps and unresolved JSX/dynamic edges remain lower bounds; not an all-clear and not waived. All source fixes were reviewed/tested within those limits.

The raw App, failed CI, six strict diagnostic cases, fresh full CI, source reviews and exact SHA manifests are preserved separately. QA-only publication is not for merge into product.
