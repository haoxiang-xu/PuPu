---
name: mcp-ipc-channel-inventory
description: Precise inventory of MCP-related IPC channels (24 total) for the MCP-launch IPC freeze (sync-meeting item U3), with the test-manifest staleness gap found during recon
metadata:
  type: project
---

MCP IPC channel recon for the MCP-launch IPC freeze (sync-meeting unresolved item **U3**, CTO-assigned). Read-only recon done 2026-06-09 against `codex/runtime-events-v4`. The meeting estimate was "~25 channels"; the real count is **24**.

**Why:** before freezing the MCP IPC contract, CTO needs the exact channel list (not an estimate) plus any two-end / test gaps that must be closed first.
**How to apply:** use this as the authoritative channel list when IPC freeze or QA regression touches MCP. Re-verify counts against `electron/shared/channels.js` before acting — channels.js is authoritative and may drift. The U3 gap below (test-manifest omission) is the one thing to close before freeze.

## The 24 MCP-related channels (all under `CHANNELS.UNCHAIN.*`, prefix `unchain:`)

Install management (6): LIST_MCP_TOOLKITS, INSTALL_MCP_TOOLKIT, DELETE_MCP_TOOLKIT, RELOAD_MCP_TOOLKITS, CHECK_MCP_TOOLKIT_HEALTH, CONFIGURE_MCP_TOOLKIT
OAuth (6): START_MCP_OAUTH, GET_MCP_OAUTH_STATUS, DISCONNECT_MCP_OAUTH, LIST_MCP_OAUTH_APPS, CONFIGURE_MCP_OAUTH_APP, DELETE_MCP_OAUTH_APP
Store registry/metadata/entries (8): LIST_MCP_STORE_METADATA, RELOAD_MCP_STORE_METADATA, LIST_MCP_STORE_ENTRIES, LIST_MCP_STORE_REGISTRIES, IMPORT_MCP_STORE_REGISTRY, VALIDATE_MCP_STORE_REGISTRY, REFRESH_MCP_STORE_REGISTRY, DELETE_MCP_STORE_REGISTRY
Approve / tool confirmation (3): APPROVE_MCP_STORE_ENTRY, REVOKE_MCP_STORE_ENTRY_APPROVAL, TOOL_CONFIRMATION (shared with non-MCP tools)
Adjacent/borderline (1, excluded from the 24 unless scoped in): GET_TOOLKIT_DETAIL is generic toolkit detail, not MCP-specific.

## Two-end alignment — CLEAN
Every channel uses the same `CHANNELS.UNCHAIN.*` constant on both ends. Bridge: `electron/preload/bridges/unchain_bridge.js`. Handlers: `electron/main/ipc/register_handlers.js` (all 24 registered via `ipcMain.handle`). No bare strings anywhere (grep for `"unchain:...mcp"` literals outside channels.js returns NONE). No single-end-missing handlers.

## THE GAP (close before freeze) — stale test manifests
9 channels are MISSING from the two static allow-list arrays that feed the parity test:
LIST_MCP_STORE_ENTRIES, LIST/IMPORT/VALIDATE/REFRESH/DELETE_MCP_STORE_REGISTRY, APPROVE_MCP_STORE_ENTRY, REVOKE_MCP_STORE_ENTRY_APPROVAL (and STREAM_START_V4 on the send side, non-MCP).
- `electron/main/ipc/register_handlers.js` → `IPC_HANDLE_CHANNELS` (jumps RELOAD_MCP_STORE_METADATA → TOOL_CONFIRMATION)
- `electron/preload/channels.js` → `PRELOAD_INVOKE_CHANNELS` (same omission)
These arrays are **test-only manifests**, NOT runtime guards (only consumer is `electron/tests/main/ipc_channels.test.cjs`). So runtime is fine, but the parity test silently never asserts these 9 channels — false confidence. Fix is to add the 9 constants to both arrays (a channels.js/test change → still a CTO-gated IPC-contract artery touch).

**CTO ruling 2026-06-09 ([[freeze-gate-ipc-parity-manifests]]):** this gap is now a formal **freeze gate** — the MCP IPC contract is NOT frozen until these 9 are added and the parity test goes truly green. CTO verified the blast radius is test-surface-only (these 3 arrays have zero production consumers; only `ipc_channels.test.cjs` imports them) → LOW risk, reversible, not a one-way door. CTO also **scoped in the STREAM_START_V4 send-side omission** (`PRELOAD_SEND_CHANNELS` lists STREAM_START/V2/V3 but not V4, though V4 is fully wired at runtime incl. main's `IPC_ON_CHANNELS`) — same class of staleness, same file, fix together to avoid leaving a known blind spot through the freeze line. Owner=pupu-dev-electron (under CTO impact re-check); verify=pupu-qa-tester (parity now asserts 24 + STREAM_START_V4 on send side + .js/.cjs in sync).

## .js/.cjs parity — CLEAN
All electron test twins use the re-export pattern: `*.test.js` is one line `require("./*.test.cjs")`. ipc_channels, api_contract, unchain_service (twin is `unchain_service_loader.test.js`) all conform. No drift. Service methods covered in `unchain_service.test.cjs`; full bridge surface (incl. store/approve methods) covered in `api_contract.test.cjs`.

Related: [[ipc-channel-contract-gatekeeping]]
