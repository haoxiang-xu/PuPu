---
name: release-license-bundling-boundary
description: What PuPu actually bundles into installers vs what it fetches at runtime — the license-distribution boundary for release compliance
metadata:
  type: project
---

PuPu installer distribution = two layers; license obligations differ per layer.

**Layer 1 — bundled into the installer (we distribute this code, so its licenses bind us):**
- React/Electron frontend: all `node_modules` deps from package.json (MIT/ISC/Apache mostly).
- unchain sidecar: built via `unchain_runtime/scripts/build_unchain_server.sh` → PyInstaller `--onefile` `unchain-server` binary. This binary statically bundles the 7 pip deps in `unchain_runtime/server/requirements.txt` (Flask, Werkzeug, httpx, mcp, openai, anthropic, qdrant-client) + the `unchain` core lib + all transitive deps + CPython runtime + native libs (libssl/libcrypto/sqlite3 etc).
- electron-builder `extraResources` ships the whole `unchain_runtime/` dir (incl. `dist/<os>/unchain-server`).
- So: the installer carries hundreds of third-party packages' code.

**Layer 2 — fetched on the USER's machine at runtime (NOT in our installer):**
- Store MCP servers with `transport: stdio` launch via `npx` (6) / `uvx` (5) → pulled from npm/PyPI on first run on the user's machine.
- `http`/`streamable_http`/`oauth` MCP servers are remote endpoints we never ship.
- The registry `src/SERVICEs/mcp_toolkit_registry.json` stores only POINTERS (package names, GitHub metadata URLs). We do not bundle any third-party MCP server code/binary.
- Risk boundary: third-party MCP server licenses do NOT bind our redistribution (we don't redistribute them). They are user-fetched. Our exposure there is curation/representation, not copyright redistribution.

**License files present:** top-level `LICENSE` (Apache-2.0 full text) + `NOTICE` (PuPu copyright + trademark). `public/LICENSE.txt` gets bundled into the app. NOTICE currently only covers PuPu's own copyright/trademark — it does NOT aggregate bundled third-party attributions.

**Gap as of 2026-06-14:** no automated third-party license/NOTICE aggregation step in any build script (grep of scripts/ + unchain_runtime/scripts/ + electron.js = none). Apache-2.0 §4(d) NOTICE propagation + bundled-dep attribution is currently unmet for the installer.

**Auto-update:** electron-updater 6.x, publish provider = GitHub releases (owner haoxiang-xu/repo PuPu). Updates ship the same bundle, so same obligations recur each release; mac forceCodeSigning:false and unsigned build variants exist.
