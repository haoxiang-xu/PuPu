# Ticket 329 checkpoint 1 evidence

`verify_humanizer.cjs` is an opt-in development probe. It downloads the exact pinned public GitHub archive through PuPu's Electron downloader, scans the extracted Markdown through the current runtime scanner, uses the current renderer importer and installer, then persists to a disposable Python store. It fetches the pinned upstream `LICENSE` read-only and verifies an independently fixed SHA-256 before comparing the full notice in curation. Each Python operation uses a fresh process with a synthetic home and no user skill directories. Activation runs the real PuPu developer-agent assembly and fixed Unchain wheel; only ModelIO is scripted, with no live model or credentials. Run from the repository root with:

```sh
node docs/implementation/ticket-329-evidence/verify_humanizer.cjs
```

The probe checks the downloaded source bytes against an independently fixed hash, the verbatim MIT notice, one-file manifest, strict producer/store/inventory key sets, multiline description and metadata, duplicate 409, repeated and cold reads, inventory removal after uninstall, reinstall, invalid store identity, duplicate manifest path, and hash tampering with no partial extraction or store change. It derives the expected body directly from the pinned file's raw closing frontmatter fence, independently of PuPu's YAML parser. The scripted activation checks exact body identity, source identity and unchanged user text on the first turn, retained body on the second turn, and loading again after a cold agent rebuild in another Python process. The accepted development Unchain wheel is fixed by SHA-256 `6544306f55267482c9dfcd7fa346ed218a83ee8e4ec68a3ed761600f7119f194`; this is not evidence for a future release artifact pair. Results are in `lifecycle-results.json`.

The default Python interpreter and accepted wheel are found in sibling project directories. Set `PUPU_TEST_PYTHON` and `PUPU_TEST_UNCHAIN_WHEEL` to equivalent local paths if your checkout layout differs; the wheel hash is still enforced.

Regression commands and results:

- `CI=true npm test -- --watch=false --runInBand --runTestsByPath src/SERVICEs/plugin_trust.test.js src/COMPONENTs/toolkit/utils/skill_pack_store_install.test.js src/SERVICEs/skill_pack_import.test.js`: 3 suites, 90 tests passed.
- `npm run test:electron -- --runTestsByPath electron/tests/main/skill_repo_download.test.cjs`: 1 suite, 36 tests passed.
- `PYTHONPATH=/Users/red/Desktop/GITRepo/skills-delivery-evidence-2026-09-21/unchain-0.2.0-py3-none-any.whl /Users/red/Desktop/GITRepo/PuPu/.venv/bin/python -m pytest -q unchain_runtime/server/tests/test_skill_packs.py unchain_runtime/server/tests/test_skill_packs_route.py unchain_runtime/server/tests/test_route_skills_inventory.py`: 23 tests and 11 subtests passed.

The scripted check proves activation wiring only. Live model prose quality, prompt safety, full isolated security certification, and the final packaged PuPu/Unchain artifact pair remain NOT_RUN at this checkpoint.

## Diagnostic package (follow-up checkpoint)

The local unsigned macOS arm64 candidate is [PuPu-humanizer-macos-arm64-r2.zip](/Users/red/Desktop/GITRepo/pupu-329-artifacts/PuPu-humanizer-macos-arm64-r2.zip), SHA-256 `cc846981b52023c5c389ec9ee64fd6201776feb52f9cfa40faf13d0487d08076`. It was rebuilt after correcting the Store row's `/humanizer` metadata, using the accepted #291/#327 sidecar binary and the cached pinned MCP runtime archives; no package installation or main-repository write was needed. The ZIP integrity check passed. `verify_packaged_catalog.cjs` confirmed the packaged asar contains the exact rebuilt Humanizer chunk, `/humanizer` metadata, and complete MIT notice. The packaged sidecar passed five health/authentication/runtime-manifest smoke checks against the same fixed wheel (SHA-256 `6544306f55267482c9dfcd7fa346ed218a83ee8e4ec68a3ed761600f7119f194`; manifest digest `2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`). Exact hashes and paths are in `package-build-results.json`.

This diagnostic package was not launched by the packaging worker. The full `build:electron` / notices gate remains incomplete in this clone because its build venv is absent; the direct diagnostic package reused the previously accepted sidecar instead of building one in place. Real app/model checks and release qualification remain separate.

## Completed real app checks — 2026-09-23 UTC

The real Electron download/scan/install path loaded the fixed Humanizer body into a disposable profile. GPT-4.1 rewrote the synthetic Aurora Library paragraph, preserving the date, $12,500, 37 volunteers and Ada Chen attribution; an ordinary second turn returned the same facts. The provider wire contains the exact body once per turn (`live-wire-summary.json`), without replacing the original user text. `live-chat.json` and `live-chat.png` capture real output. This is sampled editing behavior, not a guarantee of style quality, factuality or AI-detector scores.

Actual Store inspection found that the original `subset: ["SKILL.md"]` displayed the filename as a slash command. The delivered metadata uses `subset: ["humanizer"]` while the manifest remains root SKILL.md; `final-store-row.txt` proves the corrected visible row. Native Store GET then downloaded and installed the entry with the exact final diagnostic sidecar running. The resulting real GPT-4.1 response is in `packed-sidecar-live.json`. Its quantities and attribution survived; it also added a vague interpretive closing sentence, a model-quality limitation rather than a new verified capability. The exact sidecar/wheel/manifest and corrected candidate ZIP are bound in `package-build-results.json`; the former candidate was superseded.

The diagnostic harness enables the dev-only Test API in the source renderer and selects the exact packaged sidecar binary without replacing model I/O. Bundle catalog bytes and package/manifest smoke are checked separately. This does not claim a signed production rollout or clean-lockfile release qualification. Installed details show Third-party / Officially curated / Unverified (`store-detail.txt`). The isolated uninstall returned an empty inventory and subsequent native Store GET restored the command; cold-process activation is additionally covered by the independent lifecycle verifier.
