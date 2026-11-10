# #212 actual packaged-App evidence review

**PASS_BOUNDED_CHECK5 — no material blocker found in run42722882989.** This supplies the actual localization → GUI Save → physical Store → cold reopen evidence for the already-bound source checks 1–4. Fresh CI42723849005 is not reviewed or claimed complete; no merge authorization is issued.

## Immutable candidate and artifact

Candidate `6eb327c4641dfe176235c6c6d950f607ec426179`, tree `7793971f381a80031fe7a84b4d9b9afd522e416d`. Independently compared all 232 raw artifact files to `app-42722882989-seal.json` before and after this review: unchanged. This run **reuses** run42720677487's archive `8eb7ce71cef74715e2a0facc130031c466ab03befff41fd87de9c58583db69a3`; it is not a new build and is not required to have the build-only `sealed-app.sha256` filename. Its retained-run/archive receipts, 8,470-file and 1,052-link inventories match the retained sealed package exactly. Full archive streaming rehash is supplied by the retained `sealed-42720677487-independent-rehash.json`; I did not repeat that heavy stream or extract/launch the package. Post-run byte verification reports all 8,470 files matched.

All 624 source identity entries independently hash to the reviewed candidate, required source membership is present, and all eleven complete compiled catalog digests match candidate catalogs. Pair: wheel `c1213803c1b3bb58f4fc78a03b1a00f80e001d63be00c4afae53ab4d972b12ec`; imported manifest `c172bc02718aee771ddd4d247904f13cdaf003d3794148fd3ecd4d4e9a419e6b`; live sidecar `c91baa27f483ee861da1161b51cdd857282112589d31b6286342a2f86233f683`.

## Independent raw checks

- Exactly 44 unique cells: full 36-cell Code/WorkflowCall/Hooks × en/zh-CN/de × light/dark × min/max matrix, plus each other shipped locale at Hooks/light/minimum. Every cell's raw clipping file and embedded clipping array are empty. Actual bordered widths satisfy 302px minimum and measured half-frame maximum. Label probes equal the correct candidate catalog strings.
- Viewed eight actual screenshots: English Workflow minimum/light and Code maximum/dark; Chinese Hooks minimum/light and Code maximum/dark; German Hooks minimum/light and Workflow maximum/dark; Russian Hooks minimum/light; cold-author. Removed-button/header/matcher fixes appear readable in the shown regions. Russian approval/source compact controls lie below the screenshot viewport, so their recorded geometry and ARIA establish the measured group evidence; I do not claim those groups were visually inspected in the screen image. Cold textarea similarly lies below the shown diagnostic region.
- Seventeen ordered locale intervals retain identical seeded resource snapshots and contain no resource Save POST. Hot editor DOM identity and exact dirty source are retained.
- Exactly two resource-write POSTs: disclosed seed and one real GUI Save. The latter HTTP request and successful response occur inside the unique Save click interval, use the loaded seed edit token and contain the exact author text including tab, trailing spaces, Unicode and final newline. Request document equals the saved materialized document; compared with seed, only the expected managed-source SHA path changes. `/resolve` is separately classified as read-only lookup.
- Saved and cold authoritative records are identical. The cold-generation HTTP GET response equals them. A copied physical `resources.sqlite3` row has resource `qa212-native`, edit revision **2**, matching token, draft, source manifest and code-content digest. Canonical document SHA-256 independently reproduces the stored draft digest. SQLite was opened only on my new DB/WAL/SHM copy with `mode=ro&immutable=1`; original databases were never connected.
- Cold focus trace records BODY → noneditable in-dialog Agents BUTTON through real Tab; subsequent ledger records real Find node and cold finder selection. The read driver uses existing Ctrl+F/finder and waits for exact textarea value, without force-click, focus injection or DOM mutation. Cold ARIA contains the authored edit in the Code textbox. Exact bytes are supported by that successful value assertion and independent HTTP/Store checks, not screenshot OCR.
- Two distinct main/serving-sidecar generations use the same HOME/profile. Old tracked processes are dead before generation 2 starts, both generations are dead at end, and no stray sidecars were recorded. All live onefile parent/child binaries match the fixed sidecar SHA.
- Provider wires, renderer errors, canary hits and external routes are empty; no model/run POST was recorded. Capture reports zero kernel-dropped packets.

## Qualifier and limitations

Read, but did not rerun, root's 22-case private-copy validator qualification: baseline and benign JSON reordering pass; all 20 intentionally corrupted cases are rejected at the expected boundary. `result.json` records the exact evidence outcomes.

Disclosures remain: packaged **Agents=true** QA flag; baseline renderer `sandbox:false`; graph seeded through the real setup bridge; `offline-python` unregistered and no Code/model execution; stored backend diagnostics remain raw. This is localization and Store-path acceptance, not all-runtime or provider requalification. No real-model execution was necessary or authorized.

An initial reviewer-only expectation that the Save request should retain the previous managed-code path was corrected after comparing actual data: the producer sends the new source SHA path, and request equals saved document exactly. No product defect was inferred from that incorrect assumption.

No tests, App, sidecar, builds, graph/index, network or CI execution; no original artifacts or product files modified. Only this new review directory and its private database copy were written. Source checks 1–4 remain in `final-source-audit-01`; this report supplies only bounded check 5. Fresh CI and any delivery/merge decision remain with root.

QA16 source binding additionally verified: artifact control commit `084c2992d4a31f33b3d34c8256faa2700244cf6d`, tree `74a8fe4e9c6c8a91053726dedaab74e02ecb9390`; actual Git driver blob is byte-identical to the inspected exported driver, SHA-256 `9e503ca722cfb064e03be42d3720f3213657935f12ae67168d29ee024bc87f8f`. Git objects were read from the product clone; its HEAD/worktree were not changed.
