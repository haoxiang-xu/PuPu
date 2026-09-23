# Ticket #290 diagnostic candidate r2

Built on 2026-09-23 UTC from `codex/ticket-290-zotero-read-only`, base `bd94efe8facb38ed4afa7488a46e68d5e6cbb15a` plus this ticket's uncommitted implementation. This is an **unsigned local diagnostic macOS arm64 candidate**, not a release-qualified build. Package version remains the repository's `0.1.11`; no version or product source files were changed by the build worker.

## Artifact identity

| Artifact | Location / SHA-256 |
| --- | --- |
| App | `/Users/red/Desktop/GITRepo/pupu-290/dist/mac-arm64/PuPu.app` |
| ZIP | `/Users/red/Desktop/GITRepo/pupu-290/dist/PuPu-ticket-290-diagnostic-r2-macos-arm64.zip` |
| ZIP SHA-256 | `924049a3f0ccb7aad4c177c931acb11e8d5b571661abbd7f1a7245e72d0bddd2` |
| App ASAR SHA-256 | `b4cd2ae183b0d120631aec7383fd9d3678c973299ef72f813ca462434612763b` |
| Fresh sidecar SHA-256 | `8dd2e28077ba1f485aa39effcb9af81c3fc96d9976c11e1afa8424b2c47f183a` |
| Immutable Unchain wheel | `/Users/red/Desktop/GITRepo/skills-delivery-evidence-2026-09-21/unchain-0.2.0-py3-none-any.whl` |
| Wheel SHA-256 | `6544306f55267482c9dfcd7fa346ed218a83ee8e4ec68a3ed761600f7119f194` |
| Unchain runtime manifest | `sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c` |
| Frozen adapter source SHA-256 | `59c5c84957d6952a0895e9405ffdb12ca1a0095b2287f29c2afe1e2b6e8bc34c` |
| Frozen registry SHA-256 | `048d746e9c17eaf43c29078f880d215f2652bcbf4dbf816ce481cceb61f992ce` |

The app's new sidecar is at `Contents/Resources/unchain_runtime/dist/macos/unchain-server`; bundled runtimes are at `Contents/Resources/mcp_runtime`. Complete manifest, feature snapshot, runtime archive identities and smoke outcomes are in `candidate-results.json`. Full local build logs are retained under `/Users/red/Desktop/GITRepo/pupu-290/.local/ticket-290-candidate/`.

## Build and checks

The main repository's build environment was copied with APFS copy-on-write into this clone. Its Python was used via `python -m pip`, avoiding copied console-script shebangs that reference the original environment. The exact wheel above was force-installed without dependency resolution. The normal sidecar build script verified its installed identity and freshly froze the current source; no old sidecar was reused.

```sh
cp -cR /Users/red/Desktop/GITRepo/PuPu/.venv-unchain-build .venv-unchain-build
.venv-unchain-build/bin/python -m pip install --force-reinstall --no-deps /Users/red/Desktop/GITRepo/skills-delivery-evidence-2026-09-21/unchain-0.2.0-py3-none-any.whl
UNCHAIN_ARTIFACT_PATH=/Users/red/Desktop/GITRepo/skills-delivery-evidence-2026-09-21/unchain-0.2.0-py3-none-any.whl UNCHAIN_ARTIFACT_EVIDENCE_PATH=/Users/red/Desktop/GITRepo/skills-delivery-evidence-2026-09-21/unchain-artifact.json UNCHAIN_BUILD_SKIP_INSTALL=1 UNCHAIN_BUILD_VENV=/Users/red/Desktop/GITRepo/pupu-290/.venv-unchain-build bash unchain_runtime/scripts/build_unchain_server.sh macos arm64
PUPU_VERSION_PREPARED=1 node scripts/build-web.cjs
node scripts/prepare-mcp-runtime.cjs --target darwin-arm64
node scripts/generate-third-party-notices.cjs --check
CSC_IDENTITY_AUTO_DISCOVERY=false PUPU_REQUIRE_NATIVE_MCP_SMOKE=1 node_modules/.bin/electron-builder --mac --arm64 --dir --publish never --config.mac.identity=null
node scripts/release-qa/package-sidecar-smoke.mjs --binary dist/mac-arm64/PuPu.app/Contents/Resources/unchain_runtime/dist/macos/unchain-server --artifact /Users/red/Desktop/GITRepo/skills-delivery-evidence-2026-09-21/unchain-0.2.0-py3-none-any.whl --evidence /Users/red/Desktop/GITRepo/skills-delivery-evidence-2026-09-21/unchain-artifact.json --snapshot build/build_feature_flags.json --out /tmp/pupu-290-app-sidecar-smoke.json
/usr/bin/ditto -c -k --sequesterRsrc --keepParent dist/mac-arm64/PuPu.app dist/PuPu-ticket-290-diagnostic-r2-macos-arm64.zip
```

Results:

- Fresh PyInstaller sidecar and renderer build: PASS.
- Installed wheel identity and protocol manifest: PASS.
- License gate: PASS after staging the pinned MCP runtime. An initial attempt before runtime staging failed with the expected missing-runtime check; the successful rerun checked 1,498 notice entries.
- Electron package and afterPack native MCP runtime smoke: PASS (Node `v24.11.1`, uv `0.11.32`, Python `3.12.13+20260718`).
- Package-sidecar smoke: all five checks PASS, against the r2 app's actual copied sidecar: startup, unauthenticated rejection, authenticated health, context status, and exact compatible runtime projection. The smoke used an isolated temporary data directory and terminated its child.
- PyInstaller archive inspection: frozen `mcp_zotero_profile` contains the exact current `SERVER_SOURCE`; frozen registry bytes equal the current registry file. This rules out an accidentally reused old sidecar.
- ASAR inspection: the built renderer contains `pupu-zotero-readonly` and the Zotero entry; its build feature snapshot matches the tested snapshot exactly.

## Limits

The existing copied `node_modules` graph is not a clean lockfile installation. Electron-builder reported `ELSPROBLEMS` invalid versions for shell-quote, React, React DOM, yaml and websocket-driver, then completed packaging. The build venv also reuses cached dependencies, with the Unchain wheel independently replaced and verified. Therefore this evidence supports this exact diagnostic candidate and does **not** claim clean-lockfile release qualification, signing, notarization or Windows/Linux qualification.

The build worker did not launch Electron, access a real Zotero library, use a model, or perform installation through the UI. Those feature checks belong to the separately recorded host/stdio/UI evidence. This package smoke does not establish a third-party security verification badge.

## Review correction and superseded candidate

The initial candidate (`4ef64bef6f8865781837eee788c777084d3005072854a5d0a806aa1f97900b5d`) is superseded and must not be used as final feature evidence. Independent review found that raw item JSON could expose notes/attachment metadata, and that request reconstruction dropped HTTP timeout extensions. The parent implementation now projects citation fields and creator names only, rejects notes/attachments/annotations for metadata lookup, filters them from search, and sets all four inner transport timeouts to 10 seconds. Independent rerun: 9 profile tests PASS. No further blocker was found in this bounded review. The sidecar and app were freshly rebuilt after those changes; r2 frozen source identity and package smoke are recorded above. No new renderer/catalog changes occurred between candidates.

`candidate-r1-superseded.json` retains the initial identity only as history. `gitnexus-before-field-projection.json` records the **earlier** 25-symbol graph result: `partial=false`, `truncated=false`, risk low. CLI `... and 10 more` was display formatting (`changed.slice(0, 15)`), not graph truncation. The final source requires its separate final graph check. Raw results can be obtained by the same LocalBackend `callTool("detect_changes", {scope: "all", repo: "."})` used by the CLI, serialized before its prose formatter.
